import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AttendanceStatus,
  EnrollmentStatus,
  HolidayStatus,
} from '@prisma/client';
import {
  DAY_NAME_TO_JS,
  JS_TO_DAY_NAME,
  toLocalDateStr,
} from './shared/date-utils';

@Injectable()
export class AttendanceReadService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get lesson dates for a group in a given month/year,
   * including attendance summary per date.
   */
  async getLessonDates(
    groupId: string,
    month?: number,
    year?: number,
    companyId?: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        name: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        _count: {
          select: {
            enrollments: {
              where: { deletedAt: null, status: EnrollmentStatus.ACTIVE },
            },
          },
        },
      },
    });

    if (!group) throw new NotFoundException('Guruh topilmadi');

    const now = new Date();
    const targetMonth = month ? month - 1 : now.getMonth();
    const targetYear = year ?? now.getFullYear();

    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    if (scheduleDays.length === 0) return [];

    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0);

    const rangeStart =
      group.startDate && group.startDate > monthStart
        ? group.startDate
        : monthStart;
    const rangeEnd =
      group.endDate && group.endDate < monthEnd ? group.endDate : monthEnd;

    if (rangeStart > rangeEnd) return [];

    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(holidays.map((h) => toLocalDateStr(h.date)));

    const lessonDates: Date[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(toLocalDateStr(cursor))
      ) {
        lessonDates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (lessonDates.length === 0) return [];

    const attendanceCounts = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        groupId,
        date: { in: lessonDates },
      },
      _count: true,
    });

    const countMap: Record<
      string,
      {
        present: number;
        absent: number;
        late: number;
        excused: number;
        total: number;
      }
    > = {};

    for (const row of attendanceCounts) {
      const dateStr = toLocalDateStr(row.date);
      if (!countMap[dateStr]) {
        countMap[dateStr] = {
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
          total: 0,
        };
      }
      const count = row._count;
      countMap[dateStr].total += count;
      switch (row.status) {
        case AttendanceStatus.PRESENT:
          countMap[dateStr].present += count;
          break;
        case AttendanceStatus.ABSENT:
          countMap[dateStr].absent += count;
          break;
        case AttendanceStatus.LATE:
          countMap[dateStr].late += count;
          break;
        case AttendanceStatus.EXCUSED:
          countMap[dateStr].excused += count;
          break;
      }
    }

    const totalStudents = group._count.enrollments;

    return lessonDates.map((date) => {
      const dateStr = toLocalDateStr(date);
      const counts = countMap[dateStr];
      return {
        date: dateStr,
        dayName: JS_TO_DAY_NAME[date.getDay()] ?? '',
        hasAttendance: !!counts && counts.total > 0,
        presentCount: counts?.present ?? 0,
        absentCount: counts?.absent ?? 0,
        lateCount: counts?.late ?? 0,
        excusedCount: counts?.excused ?? 0,
        totalStudents,
      };
    });
  }

  /**
   * Get attendance for a group on a specific date.
   * Returns all active enrolled students with their attendance status.
   */
  async getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date).getTime())) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }

    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const parsedDate = new Date(date + 'T00:00:00.000Z');

    // Teacher sees only students with non-negative balance — students who
    // haven't prepaid are invisible to the teacher so they can't be marked
    // present by accident. Admin/CEO see everyone regardless of balance.
    const isTeacherOnly =
      roles && roles.length > 0 && roles.every((r) => r === 'Teacher');

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
        ...(isTeacherOnly && { student: { balance: { gte: 0 } } }),
      },
      select: {
        studentId: true,
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

    const existingAttendance = await this.prisma.attendance.findMany({
      where: { groupId, date: parsedDate },
      select: {
        studentId: true,
        status: true,
        note: true,
      },
    });

    const attendanceMap = new Map(
      existingAttendance.map((a) => [a.studentId, a]),
    );

    return enrollments.map((e) => {
      const att = attendanceMap.get(e.studentId);
      return {
        studentId: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        status: att?.status ?? null,
        note: att?.note ?? null,
      };
    });
  }

  /**
   * Get the last N lesson dates (N = course.lessonPaymentCount) with per-student
   * attendance status for each date. Used for the visual "dots" view on the group page.
   */
  async getLessonSequence(groupId: string, companyId?: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null, ...(companyId && { companyId }) },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
        course: { select: { lessonPaymentCount: true } },
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const expectedCount = group.course?.lessonPaymentCount ?? 12;

    const now = new Date();
    const rangeStart = group.startDate ?? new Date(now.getFullYear(), 0, 1);
    const rangeEnd = group.endDate && group.endDate < now ? group.endDate : now;

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

    const allLessonDates: string[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(toLocalDateStr(cursor))
      ) {
        allLessonDates.push(toLocalDateStr(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const lessonDates = allLessonDates.slice(-expectedCount);

    const attendanceRecords =
      lessonDates.length > 0
        ? await this.prisma.attendance.findMany({
            where: {
              groupId,
              date: {
                gte: new Date(lessonDates[0] + 'T00:00:00.000Z'),
                lte: new Date(
                  lessonDates[lessonDates.length - 1] + 'T00:00:00.000Z',
                ),
              },
            },
            select: { studentId: true, date: true, status: true },
          })
        : [];

    const attendanceMap = new Map<string, AttendanceStatus>();
    for (const rec of attendanceRecords) {
      const key = `${rec.studentId}:${toLocalDateStr(rec.date)}`;
      attendanceMap.set(key, rec.status);
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
      const dots = lessonDates.map((date) => {
        const status = attendanceMap.get(`${e.student.id}:${date}`) ?? null;
        return { date, status };
      });
      const attended = dots.filter(
        (d) =>
          d.status === AttendanceStatus.PRESENT ||
          d.status === AttendanceStatus.LATE,
      ).length;
      return {
        id: e.student.id,
        firstName: e.student.firstName,
        lastName: e.student.lastName,
        photo: e.student.photo,
        dots,
        attended,
        total: lessonDates.length,
      };
    });

    return { lessonDates, expectedCount, students };
  }
}
