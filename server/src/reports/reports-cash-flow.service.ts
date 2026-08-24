import { Injectable } from '@nestjs/common';
import { CashMovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePeriod } from '../common/finance/period-helpers';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

export interface CashFlowQuery {
  branchIds: ReportBranchIds;
  startDate?: string;
  endDate?: string;
}

/**
 * Cash Flow statement, built from the append-only CashMovement ledger.
 *
 * Opening/closing balances are reconstructed from the current denormalized
 * CashAccount.balance figures:
 *   closing = currentBalance − (movements strictly after the period)
 *   opening = closing − (movements within the period)
 * This is exact because every balance change is a CashMovement row.
 *
 * Cash flow is NOT revenue recognition: only real money in/out appears here
 * (INFLOW = payments, OUTFLOW = expenses/salary/refunds). Lesson deductions /
 * consumption never create cash movements, so they are absent by construction.
 */
@Injectable()
export class ReportsCashFlowService {
  constructor(private prisma: PrismaService) {}

  async getCashFlow(companyId: number, query: CashFlowQuery) {
    const period = resolvePeriod(query.startDate, query.endDate);
    const branch = branchIdWhere(query.branchIds);

    const inPeriod = { gte: period.start, lte: period.endTs };

    const [accounts, afterEndAgg, inPeriodAgg, byTypeGroups] =
      await Promise.all([
        this.prisma.cashAccount.findMany({
          where: { companyId, deletedAt: null, ...branch },
          select: {
            id: true,
            name: true,
            type: true,
            branchId: true,
            balance: true,
          },
          orderBy: [{ branchId: 'asc' }, { type: 'asc' }],
        }),
        this.prisma.cashMovement.aggregate({
          where: { companyId, ...branch, createdAt: { gt: period.endTs } },
          _sum: { amount: true },
        }),
        this.prisma.cashMovement.aggregate({
          where: { companyId, ...branch, createdAt: inPeriod },
          _sum: { amount: true },
        }),
        this.prisma.cashMovement.groupBy({
          by: ['type'],
          where: { companyId, ...branch, createdAt: inPeriod },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

    const currentTotal = accounts.reduce((s, a) => s + a.balance, 0);
    const movementsAfterEnd = afterEndAgg._sum.amount ?? 0;
    const movementsInPeriod = inPeriodAgg._sum.amount ?? 0;
    const closingBalance = currentTotal - movementsAfterEnd;
    const openingBalance = closingBalance - movementsInPeriod;

    const sumOf = (t: CashMovementType) =>
      byTypeGroups.find((g) => g.type === t)?._sum.amount ?? 0;

    const operatingInflows = sumOf(CashMovementType.INFLOW); // > 0
    const operatingOutflows = sumOf(CashMovementType.OUTFLOW); // < 0
    const adjustments = sumOf(CashMovementType.ADJUSTMENT);
    const transfersNet =
      sumOf(CashMovementType.TRANSFER_IN) +
      sumOf(CashMovementType.TRANSFER_OUT);

    return {
      period: { start: period.startStr, end: period.endStr },
      openingBalance,
      closingBalance,
      netCashFlow: movementsInPeriod,
      inflows: { operating: operatingInflows, total: operatingInflows },
      outflows: {
        operating: operatingOutflows,
        total: operatingOutflows,
      },
      adjustments,
      transfersNet,
      byType: byTypeGroups.map((g) => ({
        type: g.type,
        amount: g._sum.amount ?? 0,
        count: g._count,
      })),
      accounts,
    };
  }
}
