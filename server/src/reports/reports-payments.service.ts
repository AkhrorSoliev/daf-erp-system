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
}
