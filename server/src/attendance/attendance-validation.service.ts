import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { GroupStatus } from '@prisma/client';
import { DAY_NAME_TO_JS, tashkentDateStr } from './shared/date-utils';
import { HolidaysService } from '../holidays/holidays.service';
import {
  effectiveLessonTimes,
  lessonHasEnded,
  tashkentClock,
} from './shared/attendance-window';

@Injectable()
export class AttendanceValidationService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
    private settings: SettingsService,
  ) {}

  /**
   * `payment.attendanceOpensMinutesBefore` — how many minutes before the
   * lesson starts a new register opens (ADR-0048 §5; default 10).
   */
  opensMinutesBefore(companyId: number): Promise<number> {
    return this.settings.get(companyId, 'payment.attendanceOpensMinutesBefore');
  }

  /**
   * Validate that a date is a lesson of the group: date format, group
   * existence + company, ACTIVE status, date range, schedule or a moved
   * lesson, the group's branch holiday. It says nothing about the clock: the
   * new-register window is `assertAttendanceWindowOpen`'s, for every role
   * (ADR-0054). Returns the lesson's effective times (a move's own times win,
   * `effectiveLessonTimes`) and the company's lead, so every caller opens the
   * window the same way.
   */
  async validateLessonDate(groupId: string, date: string, companyId?: number) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const parsedDate = new Date(date + 'T00:00:00.000Z');
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      select: {
        id: true,
        companyId: true,
        branchId: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        statusEnum: true,
        lessonStartTime: true,
        lessonEndTime: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    if (group.statusEnum !== GroupStatus.ACTIVE) {
      throw new BadRequestException(
        `Guruh faol emas. Joriy holat: ${group.statusEnum}`,
      );
    }

    // Compare as Tashkent calendar date strings: group.startDate/endDate are
    // stored as Tashkent midnight in UTC (toISOString() of a Tashkent-browser
    // Date). On a UTC server, naive Date comparison cuts off the last day
    // because parsedDate (UTC midnight) > group.endDate (prior 19:00 UTC).
    if (group.startDate && date < tashkentDateStr(group.startDate)) {
      throw new BadRequestException(
        'Bu sana guruh faoliyat muddatiga kirmaydi',
      );
    }
    if (group.endDate && date > tashkentDateStr(group.endDate)) {
      throw new BadRequestException(
        'Bu sana guruh faoliyat muddatiga kirmaydi',
      );
    }

    // LessonReschedule: a moved lesson lands on `newDate` even if that day
    // isn't normally scheduled, and the original day is forbidden once moved.
    const reschedule = await this.prisma.lessonReschedule.findFirst({
      where: {
        groupId: group.id,
        deletedAt: null,
        OR: [{ originalDate: parsedDate }, { newDate: parsedDate }],
      },
      select: {
        originalDate: true,
        newDate: true,
        newLessonStartTime: true,
        newLessonEndTime: true,
      },
    });
    if (
      reschedule &&
      reschedule.originalDate.getTime() === parsedDate.getTime()
    ) {
      throw new BadRequestException(
        "Bu sana boshqa kunga ko'chirilgan — davomatni yangi sanada oling",
      );
    }
    const isMovedLessonDay =
      reschedule != null &&
      reschedule.newDate.getTime() === parsedDate.getTime();

    if (!isMovedLessonDay) {
      const scheduleDays = group.exactDays
        .map((d) => DAY_NAME_TO_JS[d])
        .filter((d) => d !== undefined);
      if (!scheduleDays.includes(parsedDate.getUTCDay())) {
        throw new BadRequestException('Bu kunda dars rejalashtirilmagan');
      }
    }

    const holiday = await this.holidaysService.findActiveHolidayCovering(
      parsedDate,
      group.branchId,
    );
    if (holiday) {
      throw new BadRequestException(`Bu sana bayram kuni: ${holiday.name}`);
    }

    const { startTime: effectiveStartTime, endTime: effectiveEndTime } =
      effectiveLessonTimes(group, isMovedLessonDay ? reschedule : null);
    const opensMinutesBefore = await this.opensMinutesBefore(group.companyId);

    return {
      group,
      parsedDate,
      effectiveStartTime: effectiveStartTime ?? null,
      effectiveEndTime: effectiveEndTime ?? null,
      opensMinutesBefore,
    };
  }

  /**
   * A pre-marked absence only seeds the lesson's register, so it makes sense
   * until the lesson ends — on the new-register window's boundary (end minute
   * closed; a group without times ends at 23:00).
   */
  assertLessonNotEnded(
    lesson: { lessonDay: string; endTime: string | null },
    now: Date = new Date(),
  ): void {
    const { todayStr, nowMinutes } = tashkentClock(now);
    if (
      lessonHasEnded({
        date: lesson.lessonDay,
        todayStr,
        nowMinutes,
        endTime: lesson.endTime,
      })
    ) {
      throw new BadRequestException(
        "Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi",
      );
    }
  }
}
