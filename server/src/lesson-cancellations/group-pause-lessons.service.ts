import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { lessonsOn } from '../attendance/shared/ended-lessons';
import { LessonCancellationsService } from './lesson-cancellations.service';
import {
  type PauseSpan,
  lessonEndsInPause,
  nextLessonDay,
  pauseDayRange,
} from './pause-lesson-days';

export const PAUSE_CANCEL_REASON = "Guruh pauzada — dars o'tmadi";

/** Pauses that ended longer ago than this are no longer looked at. */
const LOOKBACK_DAYS = 14;

/**
 * Cancels, the night it passes, every lesson a paused group did not hold
 * (ADR-0119). A group pause is the centre's decision, so the money for the
 * lesson goes back to each student through the ordinary cancellation
 * (ADR-0053) with nobody asked. The group's end date moves by one lesson for
 * each cancelled one, as a holiday moves it.
 */
@Injectable()
export class GroupPauseLessonsService {
  private readonly logger = new Logger(GroupPauseLessonsService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private cancellations: LessonCancellationsService,
  ) {}

  // After closeDay (23:00), so a lesson marked late that evening is not cancelled.
  @Cron('0 15 23 * * *', { timeZone: 'Asia/Tashkent' })
  async nightly() {
    try {
      const r = await this.run();
      if (r.cancelled > 0 || r.failed > 0) {
        this.logger.log(
          `Pauza darslari: ${r.cancelled} bekor qilindi, ${r.failed} xato`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Pauza darslarini bekor qilish yurmadi: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async run(now: Date = new Date()): Promise<{
    cancelled: number;
    failed: number;
  }> {
    const todayStr = tashkentDateStr(now);
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);
    const pauses = await this.prisma.groupPause.findMany({
      where: { OR: [{ endedAt: null }, { endedAt: { gte: since } }] },
      include: {
        group: {
          select: {
            id: true,
            name: true,
            companyId: true,
            branchId: true,
            exactDays: true,
            lessonStartTime: true,
            lessonEndTime: true,
            startDate: true,
            endDate: true,
            deletedAt: true,
            statusEnum: true,
          },
        },
      },
    });

    let cancelled = 0;
    let failed = 0;
    for (const pause of pauses) {
      const { group } = pause;
      if (group.deletedAt || group.statusEnum === GroupStatus.ARCHIVED) {
        continue;
      }
      const { from, toExclusive } = pauseDayRange(pause, todayStr);
      const actorId = await this.actorFor(
        pause.endedById ?? pause.startedById,
        group.companyId,
      );
      if (!actorId) continue;

      for (let day = from; day < toExclusive; day = addDaysToDate(day)) {
        try {
          if (await this.cancelDay(pause, group, day, actorId)) cancelled++;
        } catch (err) {
          failed++;
          this.logger.error(
            `Pauza darsi ${group.name} ${day}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
    return { cancelled, failed };
  }

  /** Cancels the lesson of `day` when it is a pause lesson nobody held and someone paid for. */
  private async cancelDay(
    pause: PauseSpan & { id: string },
    group: PauseGroup,
    day: string,
    actorId: number,
  ): Promise<boolean> {
    const date = utcMidnightFromDateStr(day);
    const [reschedules, cancellation, held, covering] = await Promise.all([
      this.prisma.lessonReschedule.findMany({
        where: {
          groupId: group.id,
          deletedAt: null,
          OR: [{ originalDate: date }, { newDate: date }],
        },
        select: {
          groupId: true,
          originalDate: true,
          newDate: true,
          newLessonStartTime: true,
          newLessonEndTime: true,
        },
      }),
      this.prisma.lessonCancellation.findFirst({
        where: { groupId: group.id, date, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.attendance.count({ where: { groupId: group.id, date } }),
      this.prisma.enrollmentMonthlyCharge.count({
        where: {
          groupId: group.id,
          status: 'CHARGED',
          coveredDates: { has: day },
          NOT: { frozenOutDates: { has: day } },
        },
      }),
    ]);
    if (cancellation || held > 0 || covering === 0) return false;

    const holiday = await this.holidays.findActiveHolidayCovering(
      date,
      group.branchId,
    );
    const [lesson] = lessonsOn({
      dayStr: day,
      groups: [group],
      reschedules,
      cancelledGroupIds: new Set(),
      isHoliday: () => Boolean(holiday),
    });
    if (!lesson || !lessonEndsInPause(day, lesson.endTime, pause)) return false;

    await this.cancellations.create(
      { groupId: group.id, date: day, reason: PAUSE_CANCEL_REASON },
      group.companyId,
      actorId,
      [],
      { system: true, silent: true },
    );
    await this.extendEndDate(pause.id, group);
    return true;
  }

  /** One cancelled pause lesson moves the end date by one lesson day. */
  private async extendEndDate(pauseId: string, group: PauseGroup) {
    const fresh = await this.prisma.group.findUnique({
      where: { id: group.id },
      select: { endDate: true },
    });
    if (!fresh?.endDate) return;
    const current = tashkentDateStr(fresh.endDate);
    const next = await nextLessonDay(current, group.exactDays, async (d) =>
      Boolean(
        await this.holidays.findActiveHolidayCovering(
          utcMidnightFromDateStr(d),
          group.branchId,
        ),
      ),
    );
    if (!next) return;
    await this.prisma.$transaction([
      this.prisma.group.update({
        where: { id: group.id },
        data: { endDate: utcMidnightFromDateStr(next) },
      }),
      // ponytail: `endDateBefore` keeps the FIRST pre-pause end date only; a
      // manual edit of endDate between two nights is overwritten on revert.
      this.prisma.groupPause.update({
        where: { id: pauseId },
        data: { extendedLessons: { increment: 1 } },
      }),
    ]);
    await this.prisma.groupPause.updateMany({
      where: { id: pauseId, endDateBefore: null },
      data: { endDateBefore: fresh.endDate },
    });
  }

  /** Whoever paused the group, else the company's CEO: the cancellation's author. */
  private async actorFor(
    userId: number | null,
    companyId: number,
  ): Promise<number | null> {
    if (userId) return userId;
    const ceo = await this.prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return ceo?.id ?? null;
  }
}

type PauseGroup = {
  id: string;
  name: string;
  companyId: number;
  branchId: number;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

const addDaysToDate = (day: string) => addDaysToDateStr(day, 1);
