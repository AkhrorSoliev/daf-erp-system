import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GroupStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonCancellationsService } from '../lesson-cancellations/lesson-cancellations.service';
import { LessonReschedulesService } from '../lesson-reschedules/lesson-reschedules.service';
import {
  addDaysToDateStr,
  isCalendarDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { tashkentClock } from './shared/attendance-window';
import { endedLessonsOn, type EndedLesson } from './shared/ended-lessons';
import {
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from '../unmarked-lessons/lesson-task';
import {
  assertMayAnswer,
  findPendingUnmarkedLesson,
  lessonDayTakenAway,
  noLessonScheduled,
} from '../unmarked-lessons/answer-rules';
import { HOLIDAY_LOOKAHEAD_DAYS } from '../unmarked-lessons/reask-holidays';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { NotHeldDto } from './dto/not-held.dto';

export interface OpenedLesson extends EndedLesson {
  date: string;
}

/**
 * «Dars bo'ldimi?» (spec 2026-09-29, ADR-0054). Opens the question for every
 * lesson that ended with no register, and answers «Bo'lmadi» through the
 * cancellation and reschedule services — whose own transactions close the
 * question, so a cancellation made on the group page answers it too.
 */
@Injectable()
export class UnmarkedLessonsService {
  private readonly logger = new Logger(UnmarkedLessonsService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private history: EntityHistoryService,
    private cancellations: LessonCancellationsService,
    private reschedules: LessonReschedulesService,
  ) {}

  async openForEndedLessons(now: Date = new Date()): Promise<OpenedLesson[]> {
    const { todayStr, nowMinutes } = tashkentClock(now);
    const today = utcMidnightFromDateStr(todayStr);

    const [groups, reschedules, cancellations, existing] = await Promise.all([
      this.prisma.group.findMany({
        where: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
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
        },
      }),
      this.prisma.lessonReschedule.findMany({
        where: {
          deletedAt: null,
          OR: [{ originalDate: today }, { newDate: today }],
        },
        select: {
          groupId: true,
          originalDate: true,
          newDate: true,
          newLessonStartTime: true,
          newLessonEndTime: true,
        },
      }),
      this.prisma.lessonCancellation.findMany({
        where: { deletedAt: null, date: today },
        select: { groupId: true },
      }),
      this.prisma.unmarkedLesson.findMany({
        where: { date: today },
        select: { groupId: true },
      }),
    ]);
    if (groups.length === 0) return [];

    const holidayBranches = new Set<number>();
    for (const branchId of new Set(groups.map((g) => g.branchId))) {
      if (await this.holidays.findActiveHolidayCovering(today, branchId)) {
        holidayBranches.add(branchId);
      }
    }
    const asked = new Set(existing.map((e) => e.groupId));
    const ended = endedLessonsOn({
      todayStr,
      nowMinutes,
      groups,
      reschedules,
      cancelledGroupIds: new Set(cancellations.map((c) => c.groupId)),
      isHoliday: (branchId) => holidayBranches.has(branchId),
    }).filter((lesson) => !asked.has(lesson.groupId));
    if (ended.length === 0) return [];

    // The task is due on the next working day of the lesson's OWN branch.
    const dueAtByBranch = new Map<number, Date>();
    await Promise.all(
      [...new Set(ended.map((l) => l.branchId))].map(async (branchId) => {
        const branchHolidays = await this.holidays.buildHolidayDateSet(
          today,
          utcMidnightFromDateStr(
            addDaysToDateStr(todayStr, HOLIDAY_LOOKAHEAD_DAYS),
          ),
          branchId,
        );
        dueAtByBranch.set(
          branchId,
          taskDueAt(nextWorkingDay(todayStr, branchHolidays)),
        );
      }),
    );

    const opened: OpenedLesson[] = [];
    for (const lesson of ended) {
      try {
        const dueAt = dueAtByBranch.get(lesson.branchId)!;
        if (await this.openOne(lesson, today, todayStr, dueAt)) {
          opened.push({ ...lesson, date: todayStr });
        }
      } catch (err) {
        this.logger.error(
          `Could not open «Dars bo'ldimi?» for ${lesson.groupId} ${todayStr}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return opened;
  }

  /**
   * Serializable, and it READS attendance: a register saved at the same
   * moment reads the question in its own Serializable transaction, so one of
   * the two aborts (spec §3.1) — a lesson is never both marked and asked. It
   * reads the day's cancellation and moves for the same reason: those
   * transactions read the question too.
   */
  private openOne(
    lesson: EndedLesson,
    today: Date,
    todayStr: string,
    dueAt: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const marked = await tx.attendance.findFirst({
          where: { groupId: lesson.groupId, date: today },
          select: { id: true },
        });
        if (marked) return false;
        // Cancelled or moved away since the sweep loaded the day.
        if (await lessonDayTakenAway(tx, lesson.groupId, today)) return false;
        const open = await tx.unmarkedLesson.findUnique({
          where: { groupId_date: { groupId: lesson.groupId, date: today } },
          select: { id: true },
        });
        if (open) return false;

        const taskId = await createLessonTask(tx, {
          companyId: lesson.companyId,
          branchId: lesson.branchId,
          groupId: lesson.groupId,
          groupName: lesson.groupName,
          dateStr: todayStr,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          dueAt,
        });
        await tx.unmarkedLesson.create({
          data: {
            companyId: lesson.companyId,
            branchId: lesson.branchId,
            groupId: lesson.groupId,
            date: today,
            lessonStartTime: lesson.startTime,
            lessonEndTime: lesson.endTime,
            taskId,
          },
        });
        await this.history.recordCreate({
          entityType: 'Group',
          entityId: lesson.groupId,
          newValues: {
            action: 'DAVOMAT_OLINMADI',
            sana: todayStr,
            vaqt: `${lesson.startTime}–${lesson.endTime}`,
          },
          companyId: lesson.companyId,
          tx,
        });
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  /** «Bo'lmadi»: cancel (money back, ADR-0053) or move to a later lesson. */
  async answerNotHeld(args: {
    groupId: string;
    date: string;
    dto: NotHeldDto;
    userId: number;
    roles: string[];
    companyId: number;
  }) {
    if (!isCalendarDateStr(args.date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const date = utcMidnightFromDateStr(args.date);
    const row = await findPendingUnmarkedLesson(this.prisma, {
      groupId: args.groupId,
      date,
      companyId: args.companyId,
    });
    await assertMayAnswer(this.prisma, row, args.userId, args.roles);

    if (args.dto.action === 'CANCEL') {
      return this.cancellations
        .create(
          { groupId: args.groupId, date: args.date, reason: args.dto.reason },
          args.companyId,
          args.userId,
          args.roles,
        )
        .catch(rethrowAsConflict);
    }
    // A question left on a day with no lesson must not become a make-up
    // lesson: the move would add a lesson the timetable never had.
    if (await noLessonScheduled(this.prisma, args.groupId, date)) {
      throw new BadRequestException('Bu kunda dars rejalashtirilmagan');
    }
    if (!args.dto.newDate) {
      throw new BadRequestException("Qo'shimcha dars sanasini tanlang");
    }
    return this.reschedules
      .create(
        {
          groupId: args.groupId,
          originalDate: args.date,
          newDate: args.dto.newDate,
          newLessonStartTime: args.dto.newLessonStartTime,
          newLessonEndTime: args.dto.newLessonEndTime,
          newRoomId: args.dto.newRoomId,
          reason: args.dto.reason,
        },
        args.companyId,
        args.userId,
        args.roles,
      )
      .catch(rethrowAsConflict);
  }
}
