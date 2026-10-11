import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { equalsOrIn } from '../../common/dto/to-array';
import { tashkentMonthKey, tashkentRangeUtc } from '../../common/date/tashkent';
import {
  attributeIncome,
  loadAttributionRows,
} from '../../common/finance/income-attribution';
import type { ResolvedPeriod } from '../../common/finance/period-helpers';
import {
  branchIdWhere,
  groupBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import type { EnrollmentStatusEvent } from '../../students/shared/enrollment-status-on';
import type { PaymentListQueryDto } from './dto/payment-list-query.dto';
import { periodShape } from './part-labels';
import { DayEnrollment, groupIdsOnDay } from './payment-day-groups';
import { parsePaymentPeriod, periodView } from './payment-period';
import { PAYMENT_ROW_SELECT, toPaymentRow } from './payment-row';
import { paymentSearchWhere } from './payment-search';
import type { PaymentListResponse, PaymentRow } from './payments-list.types';

type ListFilters = Partial<PaymentListQueryDto>;

interface DayGroup {
  id: string;
  name: string;
  courseId: string;
  teacherIds: number[];
}

/**
 * The To'lovlar page's reads (spec B4 §5). Every read goes through
 * `buildRows`: SQL filters → the cash engine once → payment-day groups →
 * in-memory filters. Archived students' payments are included on purpose
 * (spec §4.4): the engine counts them, so the list must too.
 */
@Injectable()
export class PaymentsListService {
  constructor(private readonly prisma: PrismaService) {}

  async rows(
    companyId: number,
    scope: ReportBranchIds,
    q: PaymentListQueryDto,
  ): Promise<PaymentListResponse> {
    const period = parsePaymentPeriod(q.startDate, q.endDate);
    const all = await this.buildRows(companyId, scope, period, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    return {
      period: periodView(period),
      data: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      totals: {
        count: all.length,
        amount: sum(
          all.filter((r) => r.status === 'COMPLETED').map((r) => r.amount),
        ),
        partAmount: q.part
          ? sum(
              all.flatMap((r) =>
                (r.parts ?? [])
                  .filter((p) => p.kind === q.part)
                  .map((p) => p.amount),
              ),
            )
          : null,
      },
    };
  }

  /**
   * Every matching row, unpaged, newest first. `only` reads one payment by id
   * — any status, any day — for the drawer (spec §5.3).
   */
  async buildRows(
    companyId: number,
    scope: ReportBranchIds,
    period: ResolvedPeriod,
    q: ListFilters,
    only?: { id: string },
  ): Promise<PaymentRow[]> {
    // ponytail: the engine runs once per request, uncached (spec §10); a Redis
    // cache keyed by the company's latest Transaction if it is measured slow.
    const [payments, { rows }] = await Promise.all([
      this.prisma.payment.findMany({
        where: paymentWhere(companyId, scope, period, q, only),
        select: PAYMENT_ROW_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      loadAttributionRows(this.prisma, companyId, period, scope),
    ]);
    const { byPayment } = attributeIncome(rows, period, scope);
    const groupsOn = await this.loadDayGroups(
      scope,
      payments.map((p) => p.studentId),
    );
    const shape = periodShape(period.startStr, period.endStr);
    const currentYear = tashkentMonthKey(new Date()).slice(0, 4);

    const out: PaymentRow[] = [];
    for (const p of payments) {
      const groups = groupsOn(p.studentId, p.createdAt);
      if (q.groupId && !groups.some((g) => q.groupId!.includes(g.id))) {
        continue;
      }
      if (
        q.teacherId &&
        !groups.some((g) => g.teacherIds.some((t) => q.teacherId!.includes(t)))
      ) {
        continue;
      }
      if (q.courseId && !groups.some((g) => q.courseId!.includes(g.courseId))) {
        continue;
      }
      const row = toPaymentRow(p, {
        parts: byPayment.get(p.id),
        shape,
        currentYear,
        groups: groups.map(({ id, name }) => ({ id, name })),
      });
      if (
        q.part &&
        !row.parts?.some((x) => x.kind === q.part && x.amount > 0)
      ) {
        continue;
      }
      out.push(row);
    }
    return out;
  }

  /**
   * Spec §4.5: one read of the students' enrollments in groups of the scope
   * (deleted groups included — they show on the row), one of their logs,
   * ascending as `activeOnDay` needs. Returns the groups of a payment's day,
   * sorted by name.
   */
  private async loadDayGroups(
    scope: ReportBranchIds,
    studentIds: number[],
  ): Promise<(studentId: number, paidAt: Date) => DayGroup[]> {
    const ids = [...new Set(studentIds)];
    const enrollments = ids.length
      ? await this.prisma.enrollment.findMany({
          where: {
            studentId: { in: ids },
            deletedAt: null,
            ...groupBranchWhere(scope),
          },
          select: {
            id: true,
            studentId: true,
            groupId: true,
            status: true,
            createdAt: true,
            startDate: true,
            statusChangedAt: true,
            group: {
              select: {
                id: true,
                name: true,
                deletedAt: true,
                courseId: true,
                teachers: { select: { teacherId: true } },
              },
            },
          },
        })
      : [];
    const logs = enrollments.length
      ? await this.prisma.enrollmentStateLog.findMany({
          where: { enrollmentId: { in: enrollments.map((e) => e.id) } },
          select: { enrollmentId: true, status: true, transitionAt: true },
          orderBy: { transitionAt: 'asc' },
        })
      : [];
    const logOf = new Map<string, EnrollmentStatusEvent[]>();
    for (const l of logs) {
      const list = logOf.get(l.enrollmentId) ?? [];
      list.push({ status: l.status, transitionAt: l.transitionAt });
      logOf.set(l.enrollmentId, list);
    }
    const groupOf = new Map<string, DayGroup>();
    const byStudent = new Map<number, DayEnrollment[]>();
    for (const e of enrollments) {
      groupOf.set(e.groupId, {
        id: e.group.id,
        name: e.group.name,
        courseId: e.group.courseId,
        teacherIds: e.group.teachers.map((t) => t.teacherId),
      });
      const list = byStudent.get(e.studentId) ?? [];
      list.push({
        id: e.id,
        groupId: e.groupId,
        status: e.status,
        createdAt: e.createdAt,
        startDate: e.startDate,
        statusChangedAt: e.statusChangedAt,
        groupDeletedAt: e.group.deletedAt,
        log: logOf.get(e.id) ?? [],
      });
      byStudent.set(e.studentId, list);
    }
    return (studentId, paidAt) =>
      groupIdsOnDay(byStudent.get(studentId) ?? [], paidAt)
        .map((id) => groupOf.get(id)!)
        .sort((a, b) => a.name.localeCompare(b.name));
  }
}

/** The SQL half of `buildRows` (spec §5.1): period, scope, status, method, source, receiver, search. */
function paymentWhere(
  companyId: number,
  scope: ReportBranchIds,
  period: ResolvedPeriod,
  q: ListFilters,
  only?: { id: string },
): Prisma.PaymentWhereInput {
  const and: Prisma.PaymentWhereInput[] = [];
  const received = receivedWhere(q.receivedById, q.online);
  if (received) and.push(received);
  const search = paymentSearchWhere(q.search);
  if (search) and.push(search);
  const status =
    only || q.status === 'ALL' ? undefined : (q.status ?? 'COMPLETED');
  const method = equalsOrIn(q.method);
  return {
    companyId,
    ...branchIdWhere(scope),
    ...(only
      ? { id: only.id }
      : { createdAt: tashkentRangeUtc(period.startStr, period.endStr) }),
    ...(status ? { status } : {}),
    ...(method ? { method } : {}),
    ...(q.source
      ? {
          source:
            q.source === 'ONLINE'
              ? 'GATEWAY_WEBHOOK'
              : { not: 'GATEWAY_WEBHOOK' },
        }
      : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/** «Kim qabul qildi»: staff ids, «Onlayn» (= GATEWAY_WEBHOOK, spec §4.3), or either. */
function receivedWhere(
  ids: number[] | undefined,
  online: boolean | undefined,
): Prisma.PaymentWhereInput | undefined {
  const byStaff = equalsOrIn(ids);
  const staff = byStaff === undefined ? undefined : { receivedById: byStaff };
  const web = online ? { source: 'GATEWAY_WEBHOOK' as const } : undefined;
  if (staff && web) return { OR: [staff, web] };
  return staff ?? web;
}
