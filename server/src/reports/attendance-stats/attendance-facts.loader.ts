import { Injectable } from '@nestjs/common';
import { MonthlyChargeStatus, PaymentModel } from '@prisma/client';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import {
  groupBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { markOf } from './attendance-counts';
import type {
  AttendanceFacts,
  ChargeFact,
  DayWindow,
  GroupFact,
} from './attendance-stats.types';

export interface ChargeKey {
  studentId: number;
  groupId: string;
  month: string;
}

const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();
const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;
const chargeKey = (k: ChargeKey) => `${k.studentId}|${k.groupId}|${k.month}`;

/**
 * Everything «Davomat» reads (spec B7c §6). One read of the marks per request.
 *
 * Deleted and closed groups are read on purpose (no `deletedAt` or status
 * filter): their lessons were held in that month (the 7b rule). The branch
 * comes through the group (`groupBranchWhere`). An empty scope never reaches
 * this class: the service refuses it first.
 */
@Injectable()
export class AttendanceFactsLoader {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    companyId: number,
    scope: ReportBranchIds,
    w: DayWindow,
  ): Promise<AttendanceFacts> {
    const marks = await this.prisma.attendance.findMany({
      where: {
        companyId,
        date: {
          gte: utcMidnightFromDateStr(w.from),
          lt: utcMidnightFromDateStr(w.to),
        },
        ...groupBranchWhere(scope),
      },
      select: {
        groupId: true,
        studentId: true,
        date: true,
        status: true,
        cancellationId: true,
      },
    });
    const rows = marks.map((m) => ({
      groupId: m.groupId,
      studentId: m.studentId,
      ...markOf(m),
    }));
    const ids = [...new Set(rows.map((r) => r.groupId))];
    if (ids.length === 0) return { rows, groups: new Map() };

    const groups = await this.prisma.group.findMany({
      where: { id: { in: ids }, companyId },
      select: {
        id: true,
        name: true,
        branchId: true,
        deletedAt: true,
        courseId: true,
        course: { select: { name: true, paymentModel: true } },
        teachers: {
          select: {
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    return {
      rows,
      groups: new Map(
        groups.map((g): [string, GroupFact] => {
          // No group has two teachers today; if one ever does, the first by name stands for it (spec §2).
          const teacher = g.teachers
            .map((t) => ({ id: t.teacher.id, name: fullName(t.teacher) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'uz'))[0];
          return [
            g.id,
            {
              id: g.id,
              name: g.name,
              branchId: g.branchId,
              deleted: g.deletedAt !== null,
              courseId: g.courseId,
              courseName: g.course.name,
              monthly: g.course.paymentModel === PaymentModel.MONTHLY,
              teacherId: teacher?.id ?? null,
              teacherName: teacher?.name ?? null,
            },
          ];
        }),
      ),
    };
  }

  /** The CHARGED month charges behind the «Sababli» marks (spec §4.3); exactly the asked keys. */
  async loadCharges(
    companyId: number,
    keys: readonly ChargeKey[],
  ): Promise<ChargeFact[]> {
    if (keys.length === 0) return [];
    const months = [...new Set(keys.map((k) => k.month))];
    const rows = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        status: MonthlyChargeStatus.CHARGED,
        studentId: { in: [...new Set(keys.map((k) => k.studentId))] },
        groupId: { in: [...new Set(keys.map((k) => k.groupId))] },
        OR: months.map((m) => ({
          periodYear: Number(m.slice(0, 4)),
          periodMonth: Number(m.slice(5, 7)),
        })),
      },
      select: {
        studentId: true,
        groupId: true,
        periodYear: true,
        periodMonth: true,
        perLessonCost: true,
        discountPercent: true,
      },
      // Deterministic: with a rejoin there can be several CHARGED rows for one
      // group+month; the last one wins in `attendance-credit.ts` (Map keeps the last).
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const wanted = new Set(keys.map(chargeKey));
    return rows
      .map((c) => ({
        studentId: c.studentId,
        groupId: c.groupId,
        month: monthKey(c.periodYear, c.periodMonth),
        perLessonCost: c.perLessonCost,
        discountPercent: c.discountPercent,
      }))
      .filter((c) => wanted.has(chargeKey(c)));
  }

  /** «Ism Familiya» of the «ko'p qoldiruvchi» list; an archived card keeps its name. */
  async loadStudentNames(
    companyId: number,
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const students = await this.prisma.student.findMany({
      where: { id: { in: unique }, companyId },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(students.map((s) => [s.id, fullName(s)]));
  }
}
