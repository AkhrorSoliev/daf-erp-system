import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  EnrollmentStatus,
  HolidayStatus,
} from '@prisma/client';
import { DAY_NAME_TO_JS, toLocalDateStr } from './shared/date-utils';

@Injectable()
export class AttendanceStatsService {
  constructor(private prisma: PrismaService) {}

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
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const now = new Date();
    const rangeStart = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : (group.startDate ?? new Date(now.getFullYear(), 0, 1));
    const rangeEnd = endDate ? new Date(endDate + 'T00:00:00.000Z') : now;

    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => toLocalDateStr(h.date)));

    let totalLessons = 0;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(toLocalDateStr(cursor))
      ) {
        totalLessons++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

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
      orderBy: { student: { firstName: 'asc' } },
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
