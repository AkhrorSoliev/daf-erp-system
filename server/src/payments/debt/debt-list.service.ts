import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtAgeService } from '../../common/finance/debt-age.service';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { tashkentDateStr, tashkentMonthKey } from '../../common/date/tashkent';
import { MonthlyPaymentNoticeService } from '../../billing/monthly-payment-notice.service';
import {
  debtTabAmount,
  loadDebtRows,
  type DebtTab,
} from '../../reports/debt-split';
import {
  filterDebtRows,
  filterOptions,
  groupsOf,
  promiseCell,
  sortDebtRows,
  tabTotals,
  toListRow,
  type DebtListItem,
  type DebtListResponse,
  type DebtListRow,
  type EnrollmentFact,
} from './debt-list.math';
import type { DebtListQueryDto } from './dto/debt-list-query.dto';

/** The enrollment shape `groupsOf` reads (newest first). */
export const ENROLLMENT_SELECT = {
  studentId: true,
  status: true,
  deletedAt: true,
  group: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
      statusEnum: true,
      teachers: {
        select: {
          teacher: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  },
} satisfies Prisma.EnrollmentSelect;

/**
 * The debt page (spec B2a, ADR-0072). Every row and every tab total comes from
 * `loadDebtRows` and its one tab rule; this service only names, filters, sorts
 * and pages the rows, in batched reads.
 */
@Injectable()
export class DebtListService {
  constructor(
    private prisma: PrismaService,
    private debtAge: DebtAgeService,
    private notices: MonthlyPaymentNoticeService,
  ) {}

  async list(
    companyId: number,
    scope: ReportBranchIds,
    q: DebtListQueryDto,
  ): Promise<DebtListResponse> {
    const now = new Date();
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const { rows, split, options } = await this.tabRows(
      companyId,
      scope,
      q,
      now,
    );
    const [data, writeOffCount] = await Promise.all([
      this.withPageFacts(
        companyId,
        rows.slice((page - 1) * pageSize, page * pageSize),
        q.tab,
        now,
      ),
      this.prisma.transaction.count({
        where: {
          companyId,
          type: TransactionType.DEBT_WRITE_OFF,
          reversedAt: null,
          reversedTransactionId: null,
          ...branchIdWhere(scope),
        },
      }),
    ]);
    return {
      data,
      total: rows.length,
      page,
      pageSize,
      sum: rows.reduce((s, r) => s + r.amount, 0),
      tabs: tabTotals(split),
      leftThisMonth: split.notStudying.currentMonth,
      options,
      writeOffCount,
    };
  }

  /** Every row of the tab, filtered and sorted — the pages and the Excel are cut from it. */
  protected async tabRows(
    companyId: number,
    scope: ReportBranchIds,
    q: DebtListQueryDto,
    now: Date,
  ) {
    const { rows: all, split } = await loadDebtRows(this.prisma, companyId, {
      branchIds: scope,
    });
    const inTab = all.filter((r) => debtTabAmount(r, q.tab) > 0);
    const ids = inTab.map((r) => r.studentId);
    if (ids.length === 0)
      return { rows: [] as DebtListRow[], split, options: filterOptions([]) };

    const [students, enrollments, promises, ages] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, phone: true },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: { in: ids }, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: ENROLLMENT_SELECT,
      }),
      // The latest promise of each student, any month (spec §2.3 «Va'da»).
      this.prisma.paymentPromise.findMany({
        where: { companyId, studentId: { in: ids } },
        orderBy: [{ studentId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['studentId'],
        select: {
          studentId: true,
          status: true,
          promiseDate: true,
          promisedAmount: true,
        },
      }),
      this.debtAge.getDebtAges(companyId),
    ]);
    const studentOf = new Map(students.map((s) => [s.id, s]));
    const enrolOf = new Map<number, EnrollmentFact[]>();
    for (const e of enrollments)
      enrolOf.set(e.studentId, [...(enrolOf.get(e.studentId) ?? []), e]);
    const promiseOf = new Map(promises.map((p) => [p.studentId, p]));
    const today = tashkentDateStr(now);
    const currentMonth = tashkentMonthKey(now);

    const rows = inTab.map((r) =>
      toListRow(r, q.tab, {
        student: studentOf.get(r.studentId) ?? {
          firstName: '',
          lastName: '',
          phone: null,
        },
        groups: groupsOf(r.kind, enrolOf.get(r.studentId) ?? []),
        promise: promiseCell(promiseOf.get(r.studentId) ?? null, today),
        ageMonths: ages.get(r.studentId)?.months ?? null,
        currentMonth,
      }),
    );
    return {
      rows: sortDebtRows(filterDebtRows(rows, q), q.sort),
      split,
      options: filterOptions(rows),
    };
  }

  /** The facts only a shown row needs: due date (Shu oy), last call, last payment. */
  protected async withPageFacts(
    companyId: number,
    rows: DebtListRow[],
    tab: DebtTab,
    now: Date,
  ): Promise<DebtListItem[]> {
    const ids = rows.map((r) => r.studentId);
    if (ids.length === 0) return [];
    const latest = {
      orderBy: [{ studentId: 'asc' as const }, { createdAt: 'desc' as const }],
      distinct: ['studentId' as const],
    };
    const [calls, payments, dues] = await Promise.all([
      this.prisma.callLog.findMany({
        where: { companyId, studentId: { in: ids } },
        ...latest,
        select: { studentId: true, createdAt: true, outcome: true },
      }),
      this.prisma.payment.findMany({
        where: {
          companyId,
          studentId: { in: ids },
          status: PaymentStatus.COMPLETED,
        },
        ...latest,
        select: { studentId: true, createdAt: true, amount: true },
      }),
      tab === 'shu-oy'
        ? this.notices.dueDates(companyId, ids, tashkentMonthKey(now))
        : Promise.resolve(new Map<number, string>()),
    ]);
    const callOf = new Map(calls.map((c) => [c.studentId, c]));
    const payOf = new Map(payments.map((p) => [p.studentId, p]));
    return rows.map((r) => {
      const call = callOf.get(r.studentId);
      const pay = payOf.get(r.studentId);
      return {
        ...r,
        dueDate: dues.get(r.studentId) ?? null,
        lastCall: call
          ? { createdAt: call.createdAt.toISOString(), outcome: call.outcome }
          : null,
        lastPayment: pay
          ? { createdAt: pay.createdAt.toISOString(), amount: pay.amount }
          : null,
      };
    });
  }
}
