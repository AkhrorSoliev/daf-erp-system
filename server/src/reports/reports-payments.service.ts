import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod } from '../common/finance/period-helpers';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDayStartUtc,
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';

// Above this many rows a single detail sheet stops being readable and starts
// bloating the workbook — cap the query and let the caller flag truncation.
const LINE_ITEM_CAP = 10_000;

/**
 * Refunds as the ledger records them — the same rows the net-profit refund
 * figure subtracts (`getPeriodOutflows`). `Refund` carries no branch; its
 * REFUND transaction is stamped with the branch whose kassa paid it out.
 * Reversed originals and their compensating rows are both excluded, so an
 * undone refund counts as nothing. `lt`: the end bound is exclusive.
 */
function refundLedgerWhere(
  companyId: number,
  range: { gte: Date; lt: Date },
  branchIds: ReportBranchIds,
) {
  return {
    companyId,
    type: TransactionType.REFUND,
    reversedAt: null,
    reversedTransactionId: null,
    createdAt: range,
    ...branchIdWhere(branchIds),
  };
}

@Injectable()
export class ReportsPaymentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Every COMPLETED payment in the period, unpaginated, for the Excel
   * "To'lovlar" line-item sheet. Same COMPLETED + createdAt + branch filter as
   * the P&L revenue query, so the sheet's Jami reconciles with Foyda-va-zarar's
   * "Jami daromad". `total`/`count` come from an aggregate so the totals stay
   * correct even when the row list is capped.
   */
  async getPaymentLineItems(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const branch = branchIdWhere(query.branchIds);
    const where = {
      companyId,
      status: 'COMPLETED' as const,
      createdAt: { gte: period.start, lte: period.endTs },
      ...branch,
    };

    const [rows, agg] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        select: {
          createdAt: true,
          amount: true,
          method: true,
          revenueType: true,
          branchId: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          receivedBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: LINE_ITEM_CAP + 1,
      }),
      this.prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const truncated = rows.length > LINE_ITEM_CAP;
    return {
      rows: truncated ? rows.slice(0, LINE_ITEM_CAP) : rows,
      truncated,
      total: agg._sum.amount ?? 0,
      count: agg._count,
    };
  }

  /**
   * Per-branch tushum / chiqim / foyda / qarz for the Excel "Filial kesimida"
   * sheet (only rendered company-wide). NOTE: teacher salary has no branchId
   * (company-level payroll), so `expense`/`profit` here are salary-EXCLUDED —
   * the sheet states this. `expense` is avanssiz (advances netted out) to match
   * the /payments/overview Chiqimlar basis.
   */
  async getPerBranchSummary(
    companyId: number,
    query: { startDate?: string; endDate?: string },
  ) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const tsFilter = { gte: period.start, lte: period.endTs };
    // Expense.date is @db.Date — plain UTC midnights, or Postgres truncates a
    // Tashkent-shifted instant down to the previous calendar day.
    const dateFilter = { gte: period.startDate, lte: period.endDate };

    const [branches, incomeByBranch, expenseByBranch, advanceByBranch] =
      await Promise.all([
        this.prisma.branch.findMany({
          where: { companyId, deletedAt: null },
          select: { id: true, name: true },
        }),
        this.prisma.payment.groupBy({
          by: ['branchId'],
          where: { companyId, status: 'COMPLETED', createdAt: tsFilter },
          _sum: { amount: true },
        }),
        this.prisma.expense.groupBy({
          by: ['branchId'],
          where: { companyId, deletedAt: null, date: dateFilter },
          _sum: { amount: true },
        }),
        this.prisma.expense.groupBy({
          by: ['branchId'],
          where: {
            companyId,
            deletedAt: null,
            category: 'TEACHER_ADVANCE',
            date: dateFilter,
          },
          _sum: { amount: true },
        }),
      ]);

    // Debt is a per-student negative balance scoped by branch membership —
    // groupBy can't span the many-to-many, so aggregate once per branch.
    const debtByBranch = await Promise.all(
      branches.map((b) =>
        this.prisma.student.aggregate({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            balance: { lt: 0 },
            branches: { some: { branchId: b.id } },
          },
          _sum: { balance: true },
        }),
      ),
    );

    const pick = (
      groups: { branchId: number | null; _sum: { amount: number | null } }[],
      id: number,
    ) => groups.find((g) => g.branchId === id)?._sum.amount ?? 0;

    return branches
      .map((b, i) => {
        const income = pick(incomeByBranch, b.id);
        const expense =
          pick(expenseByBranch, b.id) - pick(advanceByBranch, b.id);
        const debt = Math.abs(debtByBranch[i]._sum.balance ?? 0);
        return {
          branchId: b.id,
          branchName: b.name,
          income,
          expense,
          profit: income - expense,
          debt,
        };
      })
      .sort((a, b) => b.income - a.income);
  }

  async getPaymentReports(
    companyId: number,
    options: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
      months?: 3 | 6;
    },
  ) {
    const trendMonths = options.months ?? 6;
    const { branchIds } = options;

    // Payment.createdAt is a TIMESTAMP; the picked days are Tashkent days.
    // `end` is EXCLUSIVE throughout, so the previous window is simply the same
    // length of time ending where the current one starts.
    const thisMonth = tashkentMonthRangeUtc(tashkentMonthKey(new Date()));
    const currentStart = options.startDate
      ? tashkentDayStartUtc(options.startDate)
      : thisMonth.gte;
    const currentEnd = options.endDate
      ? tashkentDayStartUtc(addDaysToDateStr(options.endDate, 1))
      : thisMonth.lt;

    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = currentStart;
    const previousStart = new Date(previousEnd.getTime() - durationMs);

    const currentPeriod = {
      label: 'current',
      start: currentStart,
      end: currentEnd,
    };
    const previousPeriod = {
      label: 'previous',
      start: previousStart,
      end: previousEnd,
    };
    const trendPeriods = this.buildMonthlyPeriodsEndingAt(
      currentEnd,
      trendMonths,
    );

    const [
      currentMetrics,
      previousMetrics,
      trendMetrics,
      branchBreakdown,
      currentRefundCount,
    ] = await Promise.all([
      this.computePaymentMetricsForPeriod(companyId, currentPeriod, branchIds),
      this.computePaymentMetricsForPeriod(companyId, previousPeriod, branchIds),
      Promise.all(
        trendPeriods.map((p) =>
          this.computePaymentMetricsForPeriod(companyId, p, branchIds),
        ),
      ),
      this.computeBranchBreakdown(companyId, currentPeriod, branchIds),
      this.prisma.transaction.count({
        where: refundLedgerWhere(
          companyId,
          { gte: currentStart, lt: currentEnd },
          branchIds,
        ),
      }),
    ]);

    return {
      totalPayments: {
        current: currentMetrics.totalPayments,
        previous: previousMetrics.totalPayments,
        change: this.percentChange(
          currentMetrics.totalPayments,
          previousMetrics.totalPayments,
        ),
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.totalPayments,
        })),
      },
      branchBreakdown: {
        current: currentMetrics.totalPayments,
        previous: previousMetrics.totalPayments,
        change: this.percentChange(
          currentMetrics.totalPayments,
          previousMetrics.totalPayments,
        ),
        byBranch: branchBreakdown,
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.totalPayments,
        })),
      },
      refunds: {
        current: currentMetrics.refunds,
        previous: previousMetrics.refunds,
        change: this.percentChange(
          currentMetrics.refunds,
          previousMetrics.refunds,
        ),
        count: currentRefundCount,
        trend: trendMetrics.map((m) => ({
          month: m.month,
          value: m.refunds,
        })),
      },
    };
  }

  /** `anchor` is the EXCLUSIVE end of the current window; the last trend month
   *  is the one that window ends in. Months are Tashkent months. */
  private buildMonthlyPeriodsEndingAt(anchor: Date, count: number) {
    const periods: { label: string; start: Date; end: Date }[] = [];
    const anchorKey = tashkentMonthKey(new Date(anchor.getTime() - 1));
    for (let i = count - 1; i >= 0; i--) {
      const key = addMonthsToMonthKey(anchorKey, -i);
      const { gte: start, lt: end } = tashkentMonthRangeUtc(key);
      const [y, m] = key.split('-');
      periods.push({ label: `${m}/${y}`, start, end });
    }
    return periods;
  }

  private async computePaymentMetricsForPeriod(
    companyId: number,
    period: { label: string; start: Date; end: Date },
    branchIds: ReportBranchIds,
  ) {
    const dateFilter = { gte: period.start, lt: period.end };
    const branchFilter = branchIdWhere(branchIds);

    const [paymentsAgg, refundsAgg] = await Promise.all([
      this.prisma.payment.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: dateFilter,
          ...branchFilter,
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.transaction.aggregate({
        where: refundLedgerWhere(companyId, dateFilter, branchIds),
        _sum: { amount: true },
      }),
    ]);

    return {
      month: period.label,
      totalPayments: paymentsAgg._sum.amount ?? 0,
      refunds: Math.abs(refundsAgg._sum.amount ?? 0),
    };
  }

  private async computeBranchBreakdown(
    companyId: number,
    period: { start: Date; end: Date },
    branchIds: ReportBranchIds,
  ) {
    const [grouped, branches] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['branchId'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: period.start, lt: period.end },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
      // Only the caller's branches get a row — `[]` lists none (fail-closed).
      this.prisma.branch.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...(branchIds == null ? {} : { id: { in: branchIds } }),
        },
        select: { id: true, name: true },
      }),
    ]);

    const byBranch = branches.map((b) => {
      const match = grouped.find((g) => g.branchId === b.id);
      return {
        branchId: b.id,
        branchName: b.name,
        amount: match?._sum.amount ?? 0,
      };
    });

    return byBranch.sort((a, b) => b.amount - a.amount);
  }

  private percentChange(current: number, previous: number): number {
    if (previous === 0) return current === 0 ? 0 : 100;
    return Math.round(((current - previous) / previous) * 100);
  }
}
