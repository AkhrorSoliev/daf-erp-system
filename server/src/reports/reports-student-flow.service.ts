import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  isEmptyScope,
  studentBranchWhere,
  groupBranchWhere,
} from '../common/finance/report-branch-scope';

export interface StudentFlow {
  month: string;
  /** Distinct students marked PRESENT/LATE in the month — the honest "faol". */
  attended: number;
  /** ACTIVE status AND an active enrollment. */
  inGroup: number;
  /** ACTIVE status but no active enrollment — a work list, not a healthy state. */
  groupless: number;
  byStatus: Array<{ status: string; count: number }>;
  totalStudents: number;
  arrived: number;
  left: {
    frozen: number;
    expelled: number;
    graduated: number;
    archived: number;
    total: number;
  };
  netChange: number;
  dropped: {
    records: number;
    students: number;
    stillInGroup: number;
    groupless: number;
    grouplessByStatus: Array<{ status: string; count: number }>;
  };
}

const TZ_MS = 5 * 60 * 60 * 1000;

/**
 * Student figures for the «O'quvchilar» sheet.
 *
 * `activeStudentCount` on the financial overview counts `status: ACTIVE` and
 * nothing else, so a student nobody ever put in a group is reported as active
 * (76 of 503 in production). This service reports what actually happened —
 * who attended, who sits in a group, who is stranded without one — and never
 * calls a DROPPED enrollment "left the centre": most of those students simply
 * moved to another group.
 */
@Injectable()
export class ReportsStudentFlowService {
  constructor(private prisma: PrismaService) {}

  async getStudentFlow(
    companyId: number,
    { month, branchIds }: { month: string; branchIds: ReportBranchIds },
  ): Promise<StudentFlow> {
    const empty: StudentFlow = {
      month,
      attended: 0,
      inGroup: 0,
      groupless: 0,
      byStatus: [],
      totalStudents: 0,
      arrived: 0,
      left: { frozen: 0, expelled: 0, graduated: 0, archived: 0, total: 0 },
      netChange: 0,
      dropped: {
        records: 0,
        students: 0,
        stillInGroup: 0,
        groupless: 0,
        grouplessByStatus: [],
      },
    };
    if (isEmptyScope(branchIds)) return empty;

    const [y, m] = month.split('-').map(Number);
    // Timestamp columns take the Tashkent-shifted instants; @db.Date columns
    // (Attendance.date) take unshifted UTC dates with an EXCLUSIVE upper bound.
    const tsStart = new Date(Date.UTC(y, m - 1, 1) - TZ_MS);
    const tsEnd = new Date(Date.UTC(y, m, 1) - TZ_MS);
    const dateStart = new Date(Date.UTC(y, m - 1, 1));
    const dateEnd = new Date(Date.UTC(y, m, 1));

    const studentScope = studentBranchWhere(branchIds);
    // `groupBranchWhere` returns a `{ group: { branchId: { in } } }` fragment
    // meant to be spread at the TOP of a where clause whose relation field is
    // literally named `group` (Attendance). Enrollment ALSO needs its group
    // scoped by `companyId` (Enrollment carries no companyId column of its
    // own), so its nested filter is built from the same inner `branchId`
    // fragment rather than the wrapped one.
    const groupScope = groupBranchWhere(branchIds);
    const groupBranchFilter = groupScope.group ?? {};

    const [
      byStatusRows,
      inGroup,
      groupless,
      attendedRows,
      arrived,
      exitRows,
      droppedRows,
    ] = await Promise.all([
      this.prisma.student.groupBy({
        by: ['status'],
        where: { companyId, deletedAt: null, ...studentScope },
        _count: true,
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          enrollments: { some: { status: 'ACTIVE' } },
          ...studentScope,
        },
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          NOT: { enrollments: { some: { status: 'ACTIVE' } } },
          ...studentScope,
        },
      }),
      this.prisma.attendance.findMany({
        where: {
          companyId,
          date: { gte: dateStart, lt: dateEnd },
          status: { in: ['PRESENT', 'LATE'] },
          ...groupScope,
        },
        select: { studentId: true },
        distinct: ['studentId'],
      }),
      this.prisma.student.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: tsStart, lt: tsEnd },
          ...studentScope,
        },
      }),
      // `EntityHistory` carries no branch column, so this leg is company-wide
      // — it cannot be scoped by branch (see the coverage-guard exemption).
      this.exitCounts(companyId, tsStart, tsEnd),
      this.prisma.enrollment.findMany({
        where: {
          status: 'DROPPED',
          statusChangedAt: { gte: tsStart, lt: tsEnd },
          group: { companyId, ...groupBranchFilter },
        },
        select: { studentId: true },
      }),
    ]);

    const byStatus = byStatusRows.map((r: any) => ({
      status: String(r.status),
      count: r._count as number,
    }));
    const totalStudents = byStatus.reduce((s, r) => s + r.count, 0);

    const left = {
      frozen: exitRows.FROZEN ?? 0,
      expelled: exitRows.EXPELLED ?? 0,
      graduated: exitRows.GRADUATED ?? 0,
      archived: exitRows.ARCHIVED ?? 0,
      total: 0,
    };
    left.total = left.frozen + left.expelled + left.graduated + left.archived;

    const droppedIds = [...new Set(droppedRows.map((d: any) => d.studentId))];
    const droppedStudents = droppedIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: droppedIds } },
          select: {
            id: true,
            status: true,
            enrollments: { where: { status: 'ACTIVE' }, select: { id: true } },
          },
        })
      : [];
    const stillInGroup = droppedStudents.filter(
      (s: any) => s.enrollments.length > 0,
    ).length;
    const grouplessTally: Record<string, number> = {};
    droppedStudents
      .filter((s: any) => s.enrollments.length === 0)
      .forEach((s: any) => {
        grouplessTally[s.status] = (grouplessTally[s.status] ?? 0) + 1;
      });

    return {
      month,
      attended: attendedRows.length,
      inGroup,
      groupless,
      byStatus,
      totalStudents,
      arrived,
      left,
      netChange: arrived - left.total,
      dropped: {
        records: droppedRows.length,
        students: droppedStudents.length,
        stillInGroup,
        groupless: droppedStudents.length - stillInGroup,
        grouplessByStatus: Object.entries(grouplessTally).map(
          ([status, count]) => ({
            status,
            count,
          }),
        ),
      },
    };
  }

  /**
   * Status transitions away from ACTIVE inside the month, read from
   * EntityHistory. Only real StudentStatus values are counted — the same
   * column also carries action names written by other flows.
   */
  private async exitCounts(
    companyId: number,
    start: Date,
    end: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<{ s: string; n: bigint }[]>`
      SELECT h."newValues"->>'status' AS s, COUNT(*)::bigint AS n
      FROM "EntityHistory" h
      WHERE h."companyId" = ${companyId}
        AND h."entityType" = 'Student'
        AND h."createdAt" >= ${start} AND h."createdAt" < ${end}
        AND h."newValues"->>'status' IN ('FROZEN','EXPELLED','GRADUATED','ARCHIVED')
      GROUP BY 1`;
    return Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
  }
}
