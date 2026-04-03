import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { AttendanceStatus, EnrollmentStatus, HolidayStatus } from '@prisma/client';
import { SaveAttendanceDto } from './dto/save-attendance.dto';

const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const JS_TO_DAY_NAME: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * Get lesson dates for a group in a given month/year,
   * including attendance summary per date.
   */
  async getLessonDates(groupId: string, month?: number, year?: number) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
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

    // Compute lesson days from group schedule
    const scheduleDays = group.exactDays
      .map((d) => DAY_NAME_TO_JS[d])
      .filter((d) => d !== undefined);

    if (scheduleDays.length === 0) return [];

    // Build date range for the month, clamped to group start/end
    const monthStart = new Date(targetYear, targetMonth, 1);
    const monthEnd = new Date(targetYear, targetMonth + 1, 0);

    const rangeStart =
      group.startDate && group.startDate > monthStart
        ? group.startDate
        : monthStart;
    const rangeEnd =
      group.endDate && group.endDate < monthEnd ? group.endDate : monthEnd;

    if (rangeStart > rangeEnd) return [];

    // Get holidays in range
    const holidays = await this.prisma.holiday.findMany({
      where: {
        status: HolidayStatus.ACTIVE,
        deletedAt: null,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { date: true },
    });
    const holidaySet = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0]),
    );

    // Generate lesson dates
    const lessonDates: Date[] = [];
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(cursor.toISOString().split('T')[0])
      ) {
        lessonDates.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (lessonDates.length === 0) return [];

    // Get attendance counts per date
    const attendanceCounts = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        groupId,
        date: { in: lessonDates },
      },
      _count: true,
    });

    // Build a map: dateStr -> { present, absent, late, excused, total }
    const countMap: Record<
      string,
      { present: number; absent: number; late: number; excused: number; total: number }
    > = {};

    for (const row of attendanceCounts) {
      const dateStr = row.date.toISOString().split('T')[0];
      if (!countMap[dateStr]) {
        countMap[dateStr] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
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
      const dateStr = date.toISOString().split('T')[0];
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
  async getByDate(groupId: string, date: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const parsedDate = new Date(date + 'T00:00:00.000Z');

    // Get active enrollments
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        groupId,
        deletedAt: null,
        status: EnrollmentStatus.ACTIVE,
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

    // Get existing attendance for this date
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
   * Save attendance for a group on a specific date (batch upsert).
   */
  async save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId?: number,
  ) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: { id: true, companyId: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const parsedDate = new Date(date + 'T00:00:00.000Z');
    const effectiveCompanyId = companyId ?? group.companyId ?? undefined;

    // Validate all students are enrolled in this group
    const enrolledStudentIds = await this.prisma.enrollment
      .findMany({
        where: {
          groupId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
        },
        select: { studentId: true },
      })
      .then((rows) => new Set(rows.map((r) => r.studentId)));

    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    for (const entry of dto.entries) {
      if (!enrolledStudentIds.has(entry.studentId)) {
        throw new BadRequestException(
          `O'quvchi #${entry.studentId} bu guruhga yozilmagan`,
        );
      }
    }

    // Get existing records for history
    const existingRecords = await this.prisma.attendance.findMany({
      where: { groupId, date: parsedDate },
    });
    const existingMap = new Map(
      existingRecords.map((r) => [r.studentId, r]),
    );

    const results: Awaited<ReturnType<typeof this.prisma.attendance.upsert>>[] = [];
    for (const entry of dto.entries) {
      // Teacher can't write notes
      const note = isTeacherOnly ? undefined : entry.note;
      const result = await this.prisma.attendance.upsert({
        where: {
          groupId_studentId_date: {
            groupId,
            studentId: entry.studentId,
            date: parsedDate,
          },
        },
        create: {
          groupId,
          studentId: entry.studentId,
          date: parsedDate,
          status: entry.status,
          note: note ?? null,
          markedById: userId,
          companyId: effectiveCompanyId,
        },
        update: {
          status: entry.status,
          ...(note !== undefined && { note: note ?? null }),
          markedById: userId,
        },
      });
      results.push(result);
    }

    // Record a single history entry per save action
    const buildSummary = (
      entries: { status: string }[],
      actionLabel: string,
    ) => ({
      action: actionLabel,
      sana: date,
      jami: entries.length,
      keldi: entries.filter((e) => e.status === 'PRESENT').length,
      kelmadi: entries.filter((e) => e.status === 'ABSENT').length,
      kechikdi: entries.filter((e) => e.status === 'LATE').length,
      sababli: entries.filter((e) => e.status === 'EXCUSED').length,
    });

    const isUpdate = existingMap.size > 0;

    if (isUpdate) {
      const oldEntries = Array.from(existingMap.values());
      await this.entityHistoryService.recordUpdate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        oldValues: buildSummary(oldEntries, 'DAVOMAT_YANGILANDI'),
        newValues: buildSummary(dto.entries, 'DAVOMAT_YANGILANDI'),
        changedById: userId,
        companyId: effectiveCompanyId,
      });
    } else {
      await this.entityHistoryService.recordCreate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        newValues: buildSummary(dto.entries, 'DAVOMAT_OLINDI'),
        changedById: userId,
        companyId: effectiveCompanyId,
      });
    }

    return { message: 'Davomat muvaffaqiyatli saqlandi', count: results.length };
  }

  /**
   * Get attendance statistics for a group within a date range.
   */
  async getStats(groupId: string, startDate?: string, endDate?: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, deletedAt: null },
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
      },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');

    // Determine date range
    const now = new Date();
    const rangeStart = startDate
      ? new Date(startDate + 'T00:00:00.000Z')
      : group.startDate ?? new Date(now.getFullYear(), 0, 1);
    const rangeEnd = endDate
      ? new Date(endDate + 'T00:00:00.000Z')
      : now;

    // Compute total lesson days in range
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
    const holidaySet = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0]),
    );

    let totalLessons = 0;
    const cursor = new Date(rangeStart);
    while (cursor <= rangeEnd) {
      if (
        scheduleDays.includes(cursor.getDay()) &&
        !holidaySet.has(cursor.toISOString().split('T')[0])
      ) {
        totalLessons++;
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Get per-student attendance aggregation
    const attendanceData = await this.prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: {
        groupId,
        date: { gte: rangeStart, lte: rangeEnd },
      },
      _count: true,
    });

    // Build student stats map
    const statsMap: Record<
      number,
      { present: number; absent: number; late: number; excused: number }
    > = {};

    for (const row of attendanceData) {
      if (!statsMap[row.studentId]) {
        statsMap[row.studentId] = { present: 0, absent: 0, late: 0, excused: 0 };
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

    // Get attendance notes (non-null) in the date range
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
        date: n.date.toISOString().split('T')[0],
        status: n.status,
        note: n.note,
        markedBy: n.markedBy
          ? `${n.markedBy.firstName} ${n.markedBy.lastName}`
          : 'Tizim',
      });
    }

    // Get enrolled students
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
