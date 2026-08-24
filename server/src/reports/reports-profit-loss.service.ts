import { Injectable } from '@nestjs/common';
import { ExpenseCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod, pct } from '../common/finance/period-helpers';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

export interface ProfitLossQuery {
  branchIds: ReportBranchIds;
  startDate?: string;
  endDate?: string;
}

/**
 * Profit & Loss statement, derived from the existing ledger (pragmatic, not a
 * formal double-entry GL). Structure:
 *
 *   Revenue (cash basis: COMPLETED payments, by RevenueType)
 * − Cost of Services (teacher salaries + teacher advances)
 * = Gross Profit
 * − Operating Expenses (expense categories ex-advance + admin salaries)
 * = Net Profit
 *
 * Revenue is on a CASH basis (payments received) so it reconciles with the
 * Cash Flow statement. Teacher vs admin salary is split per decision #4:
 * a paid SalaryPayment with linked accruals = teacher (lesson-based), one with
 * none = admin/fixed-monthly.
 */
@Injectable()
export class ReportsProfitLossService {
  constructor(private prisma: PrismaService) {}

  async getProfitLoss(companyId: number, query: ProfitLossQuery) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const branch = branchIdWhere(query.branchIds);
    // Same scope as a plain id list, for relations that carry the branch on a
    // joined row rather than on themselves.
    const branchScopeIds = query.branchIds;

    const tsFilter = { gte: period.start, lte: period.endTs };
    const dateFilter = { gte: period.start, lte: period.endDate };

    const [revenueByType, expenseByCategory, paidSalaries] = await Promise.all([
      // Revenue by type — COMPLETED payments in the period.
      this.prisma.payment.groupBy({
        by: ['revenueType'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: tsFilter,
          ...branch,
        },
        _sum: { amount: true },
        _count: true,
      }),
      // Expenses by category (date-only column).
      this.prisma.expense.groupBy({
        by: ['category'],
        where: {
          companyId,
          deletedAt: null,
          date: dateFilter,
          ...branch,
        },
        _sum: { amount: true },
      }),
      // Paid salaries in the period, with accrual count to classify teacher
      // vs admin. `SalaryPayment` carries no branch of its own, so scope via
      // the payee's branch — one employee belongs to exactly one branch, so
      // their whole payroll is that branch's cost. Leaving this company-wide
      // charged every branch's payroll against each branch's revenue.
      this.prisma.salaryPayment.findMany({
        where: {
          companyId,
          status: 'PAID',
          paidAt: tsFilter,
          ...(branchScopeIds && {
            user: { mainBranch: { in: branchScopeIds } },
          }),
        },
        select: { amount: true, _count: { select: { accruals: true } } },
      }),
    ]);

    // ---- Revenue ----
    const revenueLines = revenueByType
      .map((r) => ({
        type: r.revenueType ?? 'TUITION',
        amount: r._sum.amount ?? 0,
        count: r._count,
      }))
      .sort((a, b) => b.amount - a.amount);
    const totalRevenue = revenueLines.reduce((s, r) => s + r.amount, 0);

    // ---- Salary split ----
    let teacherSalaries = 0;
    let adminSalaries = 0;
    for (const sp of paidSalaries) {
      if (sp._count.accruals > 0) teacherSalaries += sp.amount;
      else adminSalaries += sp.amount;
    }

    // ---- Expenses ----
    const expenseMap = new Map<ExpenseCategory, number>();
    for (const e of expenseByCategory) {
      expenseMap.set(e.category, e._sum.amount ?? 0);
    }
    const teacherAdvances = expenseMap.get('TEACHER_ADVANCE') ?? 0;
    const operatingExpenseLines = expenseByCategory
      .filter((e) => e.category !== 'TEACHER_ADVANCE')
      .map((e) => ({ category: e.category, amount: e._sum.amount ?? 0 }))
      .sort((a, b) => b.amount - a.amount);
    const operatingExpenseTotal =
      operatingExpenseLines.reduce((s, e) => s + e.amount, 0) + adminSalaries;

    // ---- Cost of services (COGS) ----
    const costOfServices = teacherSalaries + teacherAdvances;

    const grossProfit = totalRevenue - costOfServices;
    const netProfit = grossProfit - operatingExpenseTotal;

    return {
      period: { start: period.startStr, end: period.endStr },
      revenue: { total: totalRevenue, byType: revenueLines },
      costOfServices: {
        teacherSalaries,
        teacherAdvances,
        total: costOfServices,
      },
      grossProfit,
      operatingExpenses: {
        byCategory: operatingExpenseLines,
        adminSalaries,
        total: operatingExpenseTotal,
      },
      netProfit,
      margins: {
        grossMarginPercent: pct(grossProfit, totalRevenue),
        netMarginPercent: pct(netProfit, totalRevenue),
      },
    };
  }
}
