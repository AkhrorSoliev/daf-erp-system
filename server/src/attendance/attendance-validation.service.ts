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
  lessonWindowState,
  windowRefusal,
  type LessonTimes,
  type LessonWindow,
} from './shared/lesson-window';

@Injectable()
export class AttendanceValidationService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
    private settings: SettingsService,
  ) {}

  /** `payment.attendanceOpensMinutesBefore` — how early the window opens. */
  private opensMinutesBefore(companyId: number): Promise<number> {
    return this.settings.get(companyId, 'payment.attendanceOpensMinutesBefore');
  }

  /**
   * Validate that a date is a lesson of the group: date format, group
   * existence + company, ACTIVE status, date range, schedule or a moved
   * lesson, holiday. It says nothing about the clock — `assertWindowOpen`
   * does (ADR-0046). Returns the lesson's effective times: a reschedule's
   * override wins over the group's.
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

    const holiday =
      await this.holidaysService.findActiveHolidayCovering(parsedDate);
    if (holiday) {
      throw new BadRequestException(`Bu sana bayram kuni: ${holiday.name}`);
    }

    const startTime =
      isMovedLessonDay && reschedule?.newLessonStartTime
        ? reschedule.newLessonStartTime
        : group.lessonStartTime;
    const endTime =
      isMovedLessonDay && reschedule?.newLessonEndTime
        ? reschedule.newLessonEndTime
        : group.lessonEndTime;

    const opensMinutesBefore = await this.opensMinutesBefore(group.companyId);
    return { group, parsedDate, startTime, endTime, opensMinutesBefore };
  }

  /**
   * ADR-0046: attendance is written only inside the lesson window, by every
   * role. Throws the Uzbek reason otherwise.
   */
  assertWindowOpen(lesson: LessonTimes, now: Date = new Date()): void {
    const state = lessonWindowState({ ...lesson, now });
    if (state !== 'open') {
      throw new BadRequestException(windowRefusal(state, lesson, now));
    }
  }

  /** A pre-marked absence makes sense only until the lesson ends. */
  assertLessonNotEnded(lesson: LessonTimes, now: Date = new Date()): void {
    if (lessonWindowState({ ...lesson, now }) === 'closed') {
      throw new BadRequestException(
        "Dars tugagan — kelmaslikni oldindan belgilab bo'lmaydi",
      );
    }
  }

  /**
   * The window the attendance screen shows. Times include a move's override,
   * so a moved lesson opens and closes at its own hours.
   */
  async windowFor(
    groupId: string,
    date: string,
    companyId?: number,
    now: Date = new Date(),
  ): Promise<LessonWindow> {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        deletedAt: null,
        ...(companyId && { companyId }),
      },
      select: { lessonStartTime: true, lessonEndTime: true, companyId: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    const moved = await this.prisma.lessonReschedule.findFirst({
      where: {
        groupId,
        deletedAt: null,
        newDate: new Date(date + 'T00:00:00.000Z'),
      },
      select: { newLessonStartTime: true, newLessonEndTime: true },
    });
    const startTime = moved?.newLessonStartTime ?? group.lessonStartTime;
    const endTime = moved?.newLessonEndTime ?? group.lessonEndTime;
    const opensMinutesBefore = await this.opensMinutesBefore(group.companyId);
    return {
      state: lessonWindowState({
        lessonDay: date,
        startTime,
        endTime,
        opensMinutesBefore,
        now,
      }),
      startTime,
      endTime,
      opensMinutesBefore,
    };
  }
}
