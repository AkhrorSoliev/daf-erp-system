import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupStatus } from '@prisma/client';
import { DAY_NAME_TO_JS, tashkentDateStr } from './shared/date-utils';
import { HolidaysService } from '../holidays/holidays.service';
import { effectiveLessonTimes } from './shared/attendance-window';

@Injectable()
export class AttendanceValidationService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}

  /** Roles that bypass lesson time restriction */
  private static readonly TIME_BYPASS_ROLES = new Set([
    'CEO',
    'Branch Director',
    'Administrator',
  ]);

  /**
   * Validate that a date is a valid lesson date for the given group.
   * Checks: date format, group existence, group status, date range, schedule, holidays, lesson time.
   */
  async validateLessonDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
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

    // Lesson time check (server time, only for Teacher/Cashier).
    // On a moved-lesson day with a per-reschedule time override, use those
    // times instead of the group's defaults.
    const canBypassTime = roles?.some((r) =>
      AttendanceValidationService.TIME_BYPASS_ROLES.has(r),
    );
    const { startTime: effectiveStartTime, endTime: effectiveEndTime } =
      effectiveLessonTimes(group, isMovedLessonDay ? reschedule : null);
    if (!canBypassTime) {
      // Production server runs in UTC; lesson times are Asia/Tashkent (UTC+5)
      const tashkentParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Tashkent',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date());
      const part = (type: string) =>
        tashkentParts.find((p) => p.type === type)!.value;
      const todayStr = `${part('year')}-${part('month')}-${part('day')}`;

      // A teacher marks only the lesson being taught now. Any other day —
      // a forgotten past lesson or a future one — is the administrator's
      // (the reminder after the lesson tells the teacher exactly that).
      // Checked before the time window, which alone let any non-today date
      // through.
      if (date !== todayStr) {
        throw new BadRequestException(
          "O'qituvchi davomatni faqat dars kuni belgilaydi. Boshqa kun uchun administratorga murojaat qiling",
        );
      }

      if (effectiveStartTime && effectiveEndTime) {
        const currentMinutes =
          Number(part('hour')) * 60 + Number(part('minute'));
        const [startH, startM] = effectiveStartTime.split(':').map(Number);
        const [endH, endM] = effectiveEndTime.split(':').map(Number);
        const lessonStart = startH * 60 + startM;
        const lessonEnd = endH * 60 + endM;

        // 10 daqiqa oldin ochiladi
        const windowStart = lessonStart - 10;

        if (currentMinutes < windowStart) {
          throw new BadRequestException(
            `Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (${effectiveStartTime})`,
          );
        }
        if (currentMinutes >= lessonEnd) {
          throw new BadRequestException(
            `Dars vaqti tugagan (${effectiveEndTime}). Davomat olish yopilgan`,
          );
        }
      }
    }

    return {
      group,
      parsedDate,
      effectiveStartTime: effectiveStartTime ?? null,
      effectiveEndTime: effectiveEndTime ?? null,
    };
  }
}
