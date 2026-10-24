import { GroupStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { HolidaysService } from '../../holidays/holidays.service';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { tashkentClock } from './attendance-window';
import { endedLessonsOn, type EndedLesson } from './ended-lessons';

export interface EndedLessonsToday {
  todayStr: string;
  nowMinutes: number;
  /** Bugun, `@db.Date` ko'rinishida (UTC yarim tun). */
  today: Date;
  lessons: EndedLesson[];
}

/**
 * Bugun `now`gacha tugagan darslar — `endedLessonsOn`ning kirishlari bir marta
 * o'qiladi: faol guruhlar, bugungi ko'chirish va bekor qilishlar, har filial
 * bayrami. «Dars bo'ldimi?» (ADR-0054) va dars bahosi (spec 2026-10-13) shuni
 * chaqiradi, shuning uchun ikkalasi bir xil darslar haqida so'raydi.
 */
export async function loadEndedLessonsToday(
  prisma: PrismaService,
  holidays: Pick<HolidaysService, 'findActiveHolidayCovering'>,
  now: Date = new Date(),
): Promise<EndedLessonsToday> {
  const { todayStr, nowMinutes } = tashkentClock(now);
  const today = utcMidnightFromDateStr(todayStr);

  const [groups, reschedules, cancellations] = await Promise.all([
    prisma.group.findMany({
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
    prisma.lessonReschedule.findMany({
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
    prisma.lessonCancellation.findMany({
      where: { deletedAt: null, date: today },
      select: { groupId: true },
    }),
  ]);
  if (groups.length === 0) return { todayStr, nowMinutes, today, lessons: [] };

  const holidayBranches = new Set<number>();
  for (const branchId of new Set(groups.map((g) => g.branchId))) {
    if (await holidays.findActiveHolidayCovering(today, branchId)) {
      holidayBranches.add(branchId);
    }
  }
  const lessons = endedLessonsOn({
    todayStr,
    nowMinutes,
    groups,
    reschedules,
    cancelledGroupIds: new Set(cancellations.map((c) => c.groupId)),
    isHoliday: (branchId) => holidayBranches.has(branchId),
  });
  return { todayStr, nowMinutes, today, lessons };
}
