import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../attendance/shared/date-utils';
import { HolidaysService } from '../holidays/holidays.service';

const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}

  async getTodaySchedule(branchId: number, companyId: number, date?: string) {
    // Calendar date in Asia/Tashkent — stable across UTC vs Tashkent servers.
    // Attendance.date and Holiday.date are stored as UTC midnight (see
    // attendance-validation.service.ts:36), so queries must use the same shape.
    const targetStr = date ?? tashkentDateStr(new Date());
    const dateOnly = utcMidnightFromDateStr(targetStr);
    const dayName = DAY_NAMES[dateOnly.getUTCDay()];

    // If the target date is a holiday (including any day of a multi-day
    // range), there are no lessons. Short-circuit so the schedule renders
    // empty exactly like Sunday — the holiday banner from `isHoliday` /
    // `holidayName` is the only thing the UI shows for that day.
    const holiday =
      await this.holidaysService.findActiveHolidayCovering(dateOnly);
    if (holiday) {
      const [branch, rooms] = await Promise.all([
        this.prisma.branch.findFirst({
          where: { id: branchId, companyId },
          select: { startOfWorkingDay: true, endOfWorkingDay: true },
        }),
        this.prisma.room.findMany({
          where: {
            branchId,
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
          },
          select: { id: true, name: true, capacity: true },
          orderBy: { name: 'asc' },
        }),
      ]);
      return {
        lessons: [],
        rooms,
        workingHours: {
          start: branch?.startOfWorkingDay ?? '08:00',
          end: branch?.endOfWorkingDay ?? '20:00',
        },
        isHoliday: true,
        holidayName: holiday.name,
        date: targetStr,
      };
    }

    const [branch, rooms, groups] = await Promise.all([
      this.prisma.branch.findFirst({
        where: { id: branchId, companyId },
        select: { startOfWorkingDay: true, endOfWorkingDay: true },
      }),

      this.prisma.room.findMany({
        where: {
          branchId,
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, capacity: true },
        orderBy: { name: 'asc' },
      }),

      this.prisma.group.findMany({
        where: {
          branchId,
          companyId,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING'] },
          isActive: true,
          exactDays: { has: dayName },
          lessonStartTime: { not: null },
          lessonEndTime: { not: null },
          AND: [
            {
              OR: [{ startDate: null }, { startDate: { lte: dateOnly } }],
            },
            {
              OR: [{ endDate: null }, { endDate: { gte: dateOnly } }],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          lessonStartTime: true,
          lessonEndTime: true,
          roomId: true,
          room: { select: { id: true, name: true } },
          course: { select: { name: true } },
          teachers: {
            select: {
              teacher: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          enrollments: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: { lessonStartTime: 'asc' },
      }),
    ]);

    // Fetch today's attendance counts per group (PRESENT only — for UI display)
    const groupIds = groups.map((g) => g.id);
    const [presentCounts, totalCounts] = groupIds.length
      ? await Promise.all([
          this.prisma.attendance.groupBy({
            by: ['groupId'],
            where: {
              groupId: { in: groupIds },
              date: dateOnly,
              status: 'PRESENT',
            },
            _count: { id: true },
          }),
          // Any attendance record (any status) — used to determine if attendance was "taken"
          this.prisma.attendance.groupBy({
            by: ['groupId'],
            where: {
              groupId: { in: groupIds },
              date: dateOnly,
            },
            _count: { id: true },
          }),
        ])
      : [[], []];

    const presentMap = new Map(
      presentCounts.map((a) => [a.groupId, a._count.id]),
    );
    const totalAttendanceMap = new Map(
      totalCounts.map((a) => [a.groupId, a._count.id]),
    );

    // Current time in Asia/Tashkent — production server runs in UTC, lesson
    // times are stored as Tashkent-local strings, so compare in the same zone.
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
    const isToday = todayStr === targetStr;
    const nowMinutes = Number(part('hour')) * 60 + Number(part('minute'));

    function phaseOf(
      startTime: string,
      endTime: string,
    ): 'PAST' | 'CURRENT' | 'UPCOMING' {
      if (!isToday) return 'PAST';
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (nowMinutes < start) return 'UPCOMING';
      if (nowMinutes > end) return 'PAST';
      return 'CURRENT';
    }

    const lessons = groups.map((g) => {
      const hasAnyAttendance = (totalAttendanceMap.get(g.id) ?? 0) > 0;
      const phase = phaseOf(g.lessonStartTime!, g.lessonEndTime!);

      // attendanceStatus:
      //   TAKEN     — davomat olingan (yozuvlar mavjud)
      //   NOT_TAKEN — dars davom etmoqda lekin davomat olinmagan
      //   MISSED    — dars tugagan lekin davomat olinmagan
      //   PENDING   — dars hali boshlanmagan
      let attendanceStatus: 'TAKEN' | 'NOT_TAKEN' | 'MISSED' | 'PENDING';
      if (hasAnyAttendance) attendanceStatus = 'TAKEN';
      else if (phase === 'CURRENT') attendanceStatus = 'NOT_TAKEN';
      else if (phase === 'PAST') attendanceStatus = 'MISSED';
      else attendanceStatus = 'PENDING';

      return {
        groupId: g.id,
        groupName: g.name,
        courseName: g.course?.name ?? null,
        startTime: g.lessonStartTime!,
        endTime: g.lessonEndTime!,
        roomId: g.roomId,
        roomName: g.room?.name ?? null,
        teachers: g.teachers.map((gt) => ({
          id: gt.teacher.id,
          firstName: gt.teacher.firstName,
          lastName: gt.teacher.lastName,
        })),
        studentCount: g.enrollments.length,
        presentCount: presentMap.get(g.id) ?? 0,
        attendanceStatus,
      };
    });

    return {
      lessons,
      rooms,
      workingHours: {
        start: branch?.startOfWorkingDay ?? '08:00',
        end: branch?.endOfWorkingDay ?? '20:00',
      },
      isHoliday: false,
      holidayName: null,
      date: targetStr,
    };
  }
}
