import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addMonthsToMonthKey, tashkentMonthKey } from '../common/date/tashkent';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  buildCategoryRows,
  emptyBranches,
  expenseMonthWindow,
  missingByBranch,
  parseExpenseMonth,
  summarize,
  type MonthExpenseRow,
  type MonthSummary,
} from './expenses-month';

/**
 * `GET /expenses/month-summary` (spec B6 §5.2): the month card, «Bu oy hali
 * yozilmagan» and the «Kim kiritgan» options. Every figure is computed in
 * memory from two row reads (this month, last month); the total is the same
 * set the canonical net profit subtracts as `operatingExpenses`
 * (`expenses-month.profit-parity.spec.ts`). No cache: a month holds a few dozen rows.
 */
@Injectable()
export class ExpensesMonthService {
  constructor(private prisma: PrismaService) {}

  async monthSummary(
    companyId: number,
    branchIds: ReportBranchIds,
    oy: string | undefined,
    now = new Date(),
  ): Promise<MonthSummary> {
    const month = parseExpenseMonth(oy, now);
    const isCurrentMonth = month === tashkentMonthKey(now);
    const [thisMonth, lastMonth, branches] = await Promise.all([
      this.loadRows(companyId, branchIds, month),
      this.loadRows(companyId, branchIds, addMonthsToMonthKey(month, -1)),
      this.prisma.branch.findMany({
        where: { companyId, ...(branchIds && { id: { in: branchIds } }) },
        select: { id: true, name: true, status: true, deletedAt: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const creatorIds = [...new Set(thisMonth.map((r) => r.createdById))].sort(
      (a, b) => a - b,
    );
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : [];
    // A row's branch outside the list (should not happen) must not print a blank name.
    const names = new Map(branches.map((b) => [b.id, b.name]));
    for (const r of lastMonth)
      if (!names.has(r.branchId)) names.set(r.branchId, `Filial ${r.branchId}`);
    return {
      month,
      isCurrentMonth,
      ...summarize(thisMonth),
      lastMonthTotal: summarize(lastMonth).total,
      byCategory: buildCategoryRows(thisMonth, lastMonth, isCurrentMonth),
      missing: isCurrentMonth
        ? missingByBranch(lastMonth, thisMonth, names)
        : [],
      multiBranch: branches.filter((b) => b.deletedAt === null).length > 1,
      emptyBranches: isCurrentMonth ? emptyBranches(branches, thisMonth) : [],
      creators,
    };
  }

  /** The canonical set (spec B6 §4.2): company, live, never an advance, the month, the scope. */
  private loadRows(
    companyId: number,
    branchIds: ReportBranchIds,
    month: string,
  ): Promise<MonthExpenseRow[]> {
    return this.prisma.expense.findMany({
      where: {
        companyId,
        deletedAt: null,
        category: { not: 'TEACHER_ADVANCE' },
        date: expenseMonthWindow(month),
        ...branchIdWhere(branchIds),
      },
      select: {
        category: true,
        description: true,
        amount: true,
        paymentMethod: true,
        date: true,
        branchId: true,
        createdById: true,
      },
    });
  }
}
