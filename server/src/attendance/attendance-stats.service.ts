import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceStatus, EnrollmentStatus } from '@prisma/client';
import { STUDENT_ROSTER_ORDER_BY } from '../common/student-roster-order';
import {
  dayOfWeekForDateStr,
  tashkentDateStr,
  toLocalDateStr,
} from './shared/date-utils';
import { buildScheduleDayResolver } from './shared/schedule-resolver';
import { HolidaysService } from '../holidays/holidays.service';

@Injectable()
export class AttendanceStatsService {
  constructor(
    private prisma: PrismaService,
    private holidaysService: HolidaysService,
  ) {}

  /**
   * Get attendance statistics for a group within a date range.
   */
  async getStats(
    groupId: string,
    startDate?: string,
    endDate?: string,
    companyId?: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        scheduleSnapshots: {
          select: { exactDays: true, validFrom: true, validTo: true },
        },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const now = new Date();
    const rangeStart = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : (group.startDate ?? new Date(now.getFullYear(), 0, 1));
    const rangeEnd = endDate ? new Date(endDate + 'T00:00:00.000Z') : now;

    // Schedule-change aware: resolve lesson weekdays per date so the lesson
    // count for a past range reflects the schedule in effect then, not today's.
    const resolveScheduleDays = buildScheduleDayResolver(
      group.scheduleSnapshots,
      group.exactDays,
    );

    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      rangeStart,
      rangeEnd,
    );

    // Ground truth: any date with attendance counts as a lesson, even outside
    // the (possibly changed) schedule — so a schedule change never drops past
    // lessons from the denominator.
    const attendanceDateRows = await this.prisma.attendance.groupBy({
      by: ['date'],
      where: { groupId, date: { gte: rangeStart, lte: rangeEnd } },
    });
    const lessonDateSet = new Set<string>(
      attendanceDateRows.map((r) => tashkentDateStr(r.date)),
    );

    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      const dateStr = tashkentDateStr(cursor);
      const sched = resolveScheduleDays(dateStr);
      if (
        sched &&
        sched.includes(dayOfWeekForDateStr(dateStr)) &&
        !holidaySet.has(dateStr)
      ) {
        lessonDateSet.add(dateStr);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const totalLessons = lessonDateSet.size;

    const attendanceData = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        groupId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      _count: true,
    });

    const statsMap: Record<
      number,
      { present: number; absent: number; late: number; excused: number }
    > = {};

    for (const row of attendanceData) {
      if (!statsMap[row.studentId]) {
        statsMap[row.studentId] = {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        };
      }
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          statsMap[row.studentId].present += row._count;
          break;
        case AttendanceStatus.ABSENT:
          statsMap[row.studentId].absent += row._count;
          break;
        case AttendanceStatus.LATE:
          statsMap[row.studentId].late += row._count;
          break;
        case AttendanceStatus.EXCUSED:
          statsMap[row.studentId].excused += row._count;
          break;
      }
    }

    const attendanceNotes = await this.prisma.attendance.findMany({
      where: {
        groupId,
        date: { gte: rangeStart, lte: rangeEnd },
        note: { not: null },
      },
      select: {
        studentId: true,
        date: true,
        status: true,
        note: true,
        markedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    const notesMap: Record<
      number,
      { date: string; status: string; note: string; markedBy: string }[]
    > = {};
    for (const n of attendanceNotes) {
      if (!n.note) continue;
      if (!notesMap[n.studentId]) notesMap[n.studentId] = [];
      notesMap[n.studentId].push({
        date: toLocalDateStr(n.date),
        status: n.status,
        note: n.note,
        markedBy: n.markedBy
          ? `${n.markedBy.firstName} ${n.markedBy.lastName}`
          : 'Tizim',
      });
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photo: true,
          },
        },
      },
      orderBy: STUDENT_ROSTER_ORDER_BY,
    });

    const students = enrollments.map((e) => {
      const s = statsMap[e.student.id] ?? {
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
      };
      const attended = s.present + s.late;
      const percentage =
        totalLessons > 0 ? Math.round((attended / totalLessons) * 100) : 0;
      return {
        id: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        present: s.present,
        absent: s.absent,
        late: s.late,
        excused: s.excused,
        percentage,
        notes: notesMap[e.student.id] ?? [],
      };
    });

    return { students, totalLessons };
  }
}
