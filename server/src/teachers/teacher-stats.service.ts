import { Injectable } from '@nestjs/common';
import { AttendanceStatus, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from '../salary/salary-monthly.service';
import { loadDepartures } from '../reports/shared/departures.loader';
import { getSystemStartDate } from '../common/finance/system-start-date';
import {
  addMonthsToMonthKey,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  buildTeacherStats,
  statsMonths,
  type GroupTeachers,
  type TeacherStatsMonth,
} from './teacher-stats';

export interface TeacherStats {
  months: TeacherStatsMonth[];
  /** False when the caller may not see pay — every `salary` is then null. */
  salaryVisible: boolean;
}

/**
 * The profile charts' data: one row per month for the last six months.
 *
 * Salary is the monthly report's own row (`SalaryMonthlyService.getMonthly`,
 * ADR-0006) — never recomputed here. Everything else is counted by
 * `buildTeacherStats` from the groups the teacher has ever taught.
 */
@Injectable()
export class TeacherStatsService {
  constructor(
    private prisma: PrismaService,
    private salaryMonthly: SalaryMonthlyService,
  ) {}

  async getStats(
    teacherId: number,
    companyId: number,
    callerId: number,
    salaryVisible: boolean,
  ): Promise<TeacherStats> {
    const now = new Date();
    const floor = await getSystemStartDate(this.prisma, companyId);
    const months = statsMonths(
      tashkentMonthKey(now),
      floor ? tashkentMonthKey(floor) : null,
    );
    if (months.length === 0) return { months: [], salaryVisible };

    const groups = await this.loadGroups(teacherId, companyId);
    const groupIds = [...groups.keys()];
    const branchIds = [...new Set([...groups.values()].map((g) => g.branchId))];

    const [enrollments, attendance, departures, salaryByMonth] =
      await Promise.all([
        this.loadEnrollments(groupIds),
        this.loadAttendance(groupIds, months),
        groupIds.length > 0
          ? loadDepartures(this.prisma, companyId, branchIds, { now })
          : null,
        salaryVisible
          ? this.loadSalary(teacherId, companyId, callerId, months)
          : new Map<string, number | null>(),
      ]);

    return {
      salaryVisible,
      months: buildTeacherStats({
        teacherId,
        months,
        now,
        groups,
        enrollments,
        attendance,
        episodes: departures?.episodes ?? [],
        floor: departures?.floor ?? floor,
        salaryByMonth,
      }),
    };
  }

  /** Every group the teacher is on now or ever was, with who taught it when. */
  private async loadGroups(teacherId: number, companyId: number) {
    const [now, past] = await Promise.all([
      this.prisma.groupTeacher.findMany({
        where: { teacherId, group: { companyId } },
        select: { groupId: true },
      }),
      this.prisma.groupTeacherHistory.findMany({
        where: {
          group: { companyId },
          OR: [
            { previousTeacherIds: { has: teacherId } },
            { newTeacherIds: { has: teacherId } },
          ],
        },
        select: { groupId: true },
      }),
    ]);
    const ids = [...new Set([...now, ...past].map((r) => r.groupId))];
    if (ids.length === 0)
      return new Map<string, GroupTeachers & { branchId: number }>();

    const rows = await this.prisma.group.findMany({
      where: { id: { in: ids }, companyId },
      select: {
        id: true,
        branchId: true,
        deletedAt: true,
        teachers: { select: { teacherId: true } },
        teacherHistory: {
          select: { createdAt: true, previousTeacherIds: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return new Map(
      rows.map((g) => [
        g.id,
        {
          branchId: g.branchId,
          deletedAt: g.deletedAt,
          current: g.teachers.map((t) => t.teacherId),
          history: g.teacherHistory,
        },
      ]),
    );
  }

  private async loadEnrollments(groupIds: string[]) {
    if (groupIds.length === 0) return [];
    // An archived card is an error or a duplicate record (ADR-0035), not a student.
    const rows = await this.prisma.enrollment.findMany({
      where: {
        groupId: { in: groupIds },
        deletedAt: null,
        student: { deletedAt: null, status: { not: StudentStatus.ARCHIVED } },
      },
      select: {
        id: true,
        groupId: true,
        studentId: true,
        status: true,
        createdAt: true,
        statusChangedAt: true,
        stateLog: {
          select: { status: true, transitionAt: true },
          orderBy: { transitionAt: 'asc' },
        },
      },
    });
    return rows.map(({ stateLog, ...e }) => ({ ...e, log: stateLog }));
  }

  private async loadAttendance(groupIds: string[], months: string[]) {
    if (groupIds.length === 0) return [];
    const rows = await this.prisma.attendance.groupBy({
      by: ['groupId', 'date', 'status'],
      where: {
        groupId: { in: groupIds },
        cancellationId: null,
        status: {
          in: [
            AttendanceStatus.PRESENT,
            AttendanceStatus.LATE,
            AttendanceStatus.ABSENT,
          ],
        },
        date: {
          gte: utcMidnightFromDateStr(`${months[0]}-01`),
          lt: utcMidnightFromDateStr(
            `${addMonthsToMonthKey(months[months.length - 1], 1)}-01`,
          ),
        },
      },
      _count: { _all: true },
    });
    return rows.map((r) => ({
      groupId: r.groupId,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      count: r._count._all,
    }));
  }

  /**
   * What the teacher earned each month: the report row's `fullDeserved`, or
   * a settled payment's amount for a month without per-lesson data (the same
   * fallback the report sorts by). No row = nothing earned that month.
   */
  private async loadSalary(
    teacherId: number,
    companyId: number,
    callerId: number,
    months: string[],
  ) {
    const rows = await Promise.all(
      months.map((month) =>
        this.salaryMonthly
          .getMonthly({ month, userId: teacherId }, companyId, callerId)
          .then((res) => res.data[0] ?? null),
      ),
    );
    return new Map(
      months.map((month, i) => {
        const row = rows[i];
        if (!row) return [month, 0];
        return [month, row.fullDeserved ?? (row.payment ? row.netToPay : null)];
      }),
    );
  }
}
