import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod } from '../common/finance/period-helpers';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

// Above this many rows a single detail sheet stops being readable and starts
// bloating the workbook — cap the query and let the caller flag truncation.
const LINE_ITEM_CAP = 10_000;

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
    const dateFilter = { gte: period.start, lte: period.endDate };

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
        const expense = pick(expenseByBranch, b.id) - pick(advanceByBranch, b.id);
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
      branchId?: number;
      startDate?: string;
      endDate?: string;
      months?: 3 | 6;
    },
  ) {
    const trendMonths = options.months ?? 6;
    const branchId = options.branchId;
    const branchFilter = branchId ? { branchId } : {};

    const now = new Date();
    const currentStart = options.startDate
      ? new Date(options.startDate + 'T00:00:00.000Z')
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const currentEnd = options.endDate
      ? new Date(options.endDate + 'T23:59:59.999Z')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const durationMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart.getTime() - 1);
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
      this.computePaymentMetricsForPeriod(
        companyId,
        currentPeriod,
        branchFilter,
      ),
      this.computePaymentMetricsForPeriod(
        companyId,
        previousPeriod,
        branchFilter,
      ),
      Promise.all(
        trendPeriods.map((p) =>
          this.computePaymentMetricsForPeriod(companyId, p, branchFilter),
        ),
      ),
      this.computeBranchBreakdown(companyId, currentPeriod),
      this.prisma.refund.count({
        where: {
          companyId,
          status: 'COMPLETED',
          processedAt: { gte: currentStart, lte: currentEnd },
        },
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
      onTimePayments: {
        current: {
          total: currentMetrics.paymentCount,
          onTime: currentMetrics.onTimeCount,
          rate: currentMetrics.onTimeRate,
        },
        previous: {
          total: previousMetrics.paymentCount,
          onTime: previousMetrics.onTimeCount,
          rate: previousMetrics.onTimeRate,
        },
        change: this.percentChange(
          currentMetrics.onTimeRate,
          previousMetrics.onTimeRate,
        ),
        trend: trendMetrics.map((m) => ({
          month: m.month,
          onTime: m.onTimeCount,
          late: m.paymentCount - m.onTimeCount,
          rate: m.onTimeRate,
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

  /**
   * On-time payment rule (v1):
   * - If the group has had ≤3 attendance records total by payment date → on-time (new group).
   * - Else, check the student's attended lessons in that group BEFORE the payment:
   *   if (lessons % lessonPaymentCount) === 0 → on-time (new cycle starts).
   * - Payments without a resolvable group/course are skipped (returns null).
   */
  async isPaymentOnTime(payment: {
    studentId: number;
    createdAt: Date;
    contractId: string | null;
    contract: {
      groupId: string | null;
      course: { lessonPaymentCount: number };
    } | null;
  }): Promise<boolean | null> {
    let groupId = payment.contract?.groupId ?? null;
    let lessonPaymentCount =
      payment.contract?.course.lessonPaymentCount ?? null;

    if (!groupId || !lessonPaymentCount) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: {
          studentId: payment.studentId,
          deletedAt: null,
          status: { in: ['ACTIVE', 'FROZEN'] },
        },
        select: {
          groupId: true,
          group: {
            select: { course: { select: { lessonPaymentCount: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!enrollment) return null;
      groupId = enrollment.groupId;
      lessonPaymentCount = enrollment.group.course.lessonPaymentCount;
    }

    const [groupLessonsTotal, studentLessonsBefore] = await Promise.all([
      this.prisma.attendance.count({
        where: { groupId, date: { lte: payment.createdAt } },
      }),
      this.prisma.attendance.count({
        where: {
          groupId,
          studentId: payment.studentId,
          date: { lt: payment.createdAt },
        },
      }),
    ]);

    if (groupLessonsTotal <= 3) return true;
    return studentLessonsBefore % lessonPaymentCount === 0;
  }

  private buildMonthlyPeriodsEndingAt(anchor: Date, count: number) {
    const periods: { label: string; start: Date; end: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(
        d.getFullYear(),
        d.getMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      );
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      periods.push({ label, start, end });
    }
    return periods;
  }

  private async computePaymentMetricsForPeriod(
    companyId: number,
    period: { label: string; start: Date; end: Date },
    branchFilter: { branchId?: number },
  ) {
    const dateFilter = { gte: period.start, lte: period.end };

    const [paymentsAgg, payments, refundsAgg] = await Promise.all([
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
      this.prisma.payment.findMany({
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: dateFilter,
          ...branchFilter,
        },
        select: {
          id: true,
          studentId: true,
          createdAt: true,
          contractId: true,
          contract: {
            select: {
              groupId: true,
              course: { select: { lessonPaymentCount: true } },
            },
          },
        },
      }),
      this.prisma.refund.aggregate({
        where: {
          companyId,
          status: 'COMPLETED',
          processedAt: dateFilter,
        },
        _sum: { approvedAmount: true },
      }),
    ]);

    const onTimeResults = await Promise.all(
      payments.map((p) => this.isPaymentOnTime(p)),
    );
    const onTimeCount = onTimeResults.filter((r) => r === true).length;
    const paymentCount = payments.length;

    return {
      month: period.label,
      totalPayments: paymentsAgg._sum.amount ?? 0,
      paymentCount,
      onTimeCount,
      onTimeRate:
        paymentCount > 0 ? Math.round((onTimeCount / paymentCount) * 100) : 0,
      refunds: refundsAgg._sum.approvedAmount ?? 0,
    };
  }

  private async computeBranchBreakdown(
    companyId: number,
    period: { start: Date; end: Date },
  ) {
    const [grouped, branches] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['branchId'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: period.start, lte: period.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId, deletedAt: null },
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
