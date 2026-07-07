import { Injectable } from '@nestjs/common';
import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { branchWhere } from '../common/finance/period-helpers';

export interface BalanceSheetQuery {
  branchId?: number;
  branchIds?: number[];
}

/**
 * Balance Sheet — a point-in-time snapshot DERIVED from the single-entry
 * ledger (the system is not a formal double-entry GL, so this does not
 * necessarily "balance" to the cent; the `note` field states this).
 *
 *   Assets       = cash on hand/bank + accounts receivable (student debt)
 *   Liabilities  = salaries payable (unpaid teacher accruals)
 *                + deferred revenue (student prepaid balances)
 *   Equity       = Assets − Liabilities  (retained earnings, derived)
 *
 * Computed as of NOW (the only point at which the denormalized balances are
 * authoritative). Branch scoping is best-effort: cash by account branch,
 * receivables/deferred by student branch membership, payables by group branch.
 */
@Injectable()
export class ReportsBalanceSheetService {
  constructor(private prisma: PrismaService) {}

  async getBalanceSheet(companyId: number, query: BalanceSheetQuery) {
    const branch = branchWhere(query);
    const hasScope = !!(query.branchIds && query.branchIds.length > 0);

    // Student branch filter (Student has no branchId column — use membership).
    const studentBranch: Prisma.StudentWhereInput = hasScope
      ? { branches: { some: { branchId: { in: query.branchIds! } } } }
      : query.branchId
        ? { branches: { some: { branchId: query.branchId } } }
        : {};

    // Accrual branch filter via the group's branch.
    const accrualBranch: Prisma.SalaryAccrualWhereInput = hasScope
      ? { group: { branchId: { in: query.branchIds! } } }
      : query.branchId
        ? { group: { branchId: query.branchId } }
        : {};

    const [cashAgg, receivableAgg, deferredAgg, payableAgg] = await Promise.all(
      [
        this.prisma.cashAccount.aggregate({
          where: { companyId, deletedAt: null, ...branch },
          _sum: { balance: true },
        }),
        // Receivables + deferred are scoped to ACTIVE students so the balance
        // sheet's "Debitorlik" ties exactly with the debtor list and the
        // on-screen "Qarzdorlik" card (both active-only). Departed-student debt
        // is handled separately via the debt write-off flow.
        this.prisma.student.aggregate({
          where: {
            companyId,
            deletedAt: null,
            status: StudentStatus.ACTIVE,
            balance: { lt: 0 },
            ...studentBranch,
          },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.student.aggregate({
          where: {
            companyId,
            deletedAt: null,
            status: StudentStatus.ACTIVE,
            balance: { gt: 0 },
            ...studentBranch,
          },
          _sum: { balance: true },
          _count: true,
        }),
        this.prisma.salaryAccrual.aggregate({
          where: {
            companyId,
            salaryPaymentId: null,
            reversedAt: null,
            ...accrualBranch,
          },
          _sum: { amount: true },
        }),
      ],
    );

    const cash = cashAgg._sum.balance ?? 0;
    const accountsReceivable = Math.abs(receivableAgg._sum.balance ?? 0);
    const deferredRevenue = deferredAgg._sum.balance ?? 0;
    const salariesPayable = payableAgg._sum.amount ?? 0;

    const totalAssets = cash + accountsReceivable;
    const totalLiabilities = salariesPayable + deferredRevenue;
    const equity = totalAssets - totalLiabilities;

    return {
      asOf: new Date().toISOString().slice(0, 10),
      assets: {
        cash,
        accountsReceivable,
        debtorCount: receivableAgg._count,
        total: totalAssets,
      },
      liabilities: {
        salariesPayable,
        deferredRevenue,
        prepaidStudentCount: deferredAgg._count,
        total: totalLiabilities,
      },
      equity: { retainedEarnings: equity, total: equity },
      note: "Bir yozuvli ledgerdan hosil qilingan joriy holat — formal ravishda balanslanmasligi mumkin (GL yo'q).",
    };
  }
}
