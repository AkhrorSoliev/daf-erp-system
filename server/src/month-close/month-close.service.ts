import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  CashAccountType,
  ExpenseCategory,
  ExpensePaymentMethod,
  SalaryPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ReportsService } from '../reports/reports.service';
import { invalidateNetProfitCache } from '../reports/net-profit-cache';
import type { NetProfit } from '../reports/reports-excel.helpers';
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  ReportBranchIds,
} from '../common/finance/report-branch-scope';
import {
  BANK_FEE_LABEL,
  bankFeeDate,
  bankFeeWindow,
  MONTH_CLOSE_FIRST_MONTH,
} from '../tax/bank-fee';
import { BANK_FEES_ENTERED_KEY } from '../tax/tax-costs';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface MonthCloseView {
  month: string;
  ended: boolean;
  netProfit: NetProfit;
  bankAccounts: {
    id: string;
    name: string;
    branchId: number;
    branchName: string;
    amount: number | null;
  }[];
  salaries: { paid: number; total: number };
  checklist: {
    bankFeesEntered: boolean;
    salariesPaid: boolean;
    ratesComplete: boolean;
  };
}

/** «Oyni yopish» (spec 2026-10-28 §5): oy surati va bank xizmati kiritish. */
@Injectable()
export class MonthCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly reports: ReportsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private assertMonth(month: string) {
    if (!MONTH_RE.test(month)) throw new BadRequestException("Oy noto'g'ri");
  }

  private bankAccounts(
    companyId: number,
    month: string,
    scope: ReportBranchIds,
  ) {
    // Boshlanish oyidan oldingi oylar eski qoidalar bilan yopilgan: bank xarajati yo'q.
    if (month < MONTH_CLOSE_FIRST_MONTH) return Promise.resolve([]);
    return this.prisma.cashAccount.findMany({
      where: {
        companyId,
        type: CashAccountType.BANK,
        isActive: true,
        deletedAt: null,
        // Oy tugagandan keyin ochilgan hisobda o'sha oy uchun bank xarajati yo'q.
        createdAt: { lt: tashkentMonthRangeUtc(month).lt },
        ...branchIdWhere(scope),
      },
      select: {
        id: true,
        name: true,
        branchId: true,
      },
      orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async read(
    companyId: number,
    month: string,
    scope: ReportBranchIds,
    performedById: number,
  ): Promise<MonthCloseView> {
    this.assertMonth(month);
    const [accounts, netProfit, statuses] = await Promise.all([
      this.bankAccounts(companyId, month, scope),
      this.reports.getMonthlyNetProfit(companyId, {
        month,
        branchIds: scope,
        performedById,
      }),
      this.prisma.salaryPayment.groupBy({
        by: ['status'],
        where: {
          companyId,
          periodStart: tashkentMonthRangeUtc(month),
          status: { not: SalaryPaymentStatus.CANCELLED },
          ...(scope === null ? {} : { user: { mainBranch: { in: scope } } }),
        },
        _count: { _all: true },
      }),
    ]);
    const fees = accounts.length
      ? await this.prisma.expense.findMany({
          where: {
            companyId,
            category: ExpenseCategory.BANK_FEES,
            deletedAt: null,
            cashAccountId: { in: accounts.map((a) => a.id) },
            date: bankFeeWindow(month),
          },
          select: { cashAccountId: true, amount: true },
        })
      : [];
    const branches = accounts.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: [...new Set(accounts.map((a) => a.branchId))] } },
          select: { id: true, name: true },
        })
      : [];
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    const feeOf = new Map(fees.map((f) => [f.cashAccountId, f.amount]));
    const bankAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      branchId: a.branchId,
      branchName: branchName.get(a.branchId) ?? '',
      amount: feeOf.get(a.id) ?? null,
    }));
    const total = statuses.reduce((s, r) => s + r._count._all, 0);
    const paid =
      statuses.find((r) => r.status === SalaryPaymentStatus.PAID)?._count
        ._all ?? 0;
    return {
      month,
      ended: month < tashkentMonthKey(new Date()),
      netProfit,
      bankAccounts,
      salaries: { paid, total },
      checklist: {
        bankFeesEntered: bankAccounts.every((a) => a.amount !== null),
        salariesPaid: total > 0 && paid === total,
        ratesComplete: netProfit.taxes.missingRates.every(
          (k) => k === BANK_FEES_ENTERED_KEY,
        ),
      },
    };
  }

  async saveBankFees(
    companyId: number,
    month: string,
    items: { cashAccountId: string; amount: number }[],
    userId: number,
    scope: ReportBranchIds,
  ) {
    this.assertMonth(month);
    if (month < MONTH_CLOSE_FIRST_MONTH)
      throw new BadRequestException(
        `Bank xarajati ${MONTH_CLOSE_FIRST_MONTH} oyidan boshlab kiritiladi`,
      );
    if (month >= tashkentMonthKey(new Date()))
      throw new BadRequestException(
        'Joriy oy hali tugamagan — bank xarajati oy tugagach kiritiladi',
      );
    if (new Set(items.map((i) => i.cashAccountId)).size !== items.length)
      throw new BadRequestException('Bir hisob ikki marta berilgan');
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        companyId,
        id: { in: items.map((i) => i.cashAccountId) },
        type: CashAccountType.BANK,
        deletedAt: null,
      },
      select: { id: true, name: true, branchId: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const item of items) {
      const acc = byId.get(item.cashAccountId);
      if (!acc) throw new BadRequestException('Bank hisobi topilmadi');
      if (scope !== null && !scope.includes(acc.branchId))
        throw new ForbiddenException(
          "Bu filial bank hisobiga yozish huquqingiz yo'q",
        );
    }
    // ponytail: har hisob o'z tranzaksiyasida (ExpensesService); qisman saqlansa, qayta saqlash xavfsiz.
    // Oraliqda xato bo'lsa ham kesh tozalanadi: avvalgi elementlar yozilgan bo'lishi mumkin.
    try {
      for (const item of items) {
        const acc = byId.get(item.cashAccountId)!;
        // Hisob+oy bo'yicha qator — yagona manba: bank xarajatining sanasi qotirilgan (ExpensesService.update), oydan chiqmaydi.
        const existing = await this.prisma.expense.findFirst({
          where: {
            companyId,
            category: ExpenseCategory.BANK_FEES,
            cashAccountId: acc.id,
            deletedAt: null,
            date: bankFeeWindow(month),
          },
          select: { id: true, amount: true },
        });
        if (!existing) {
          // 0 ham haqiqiy kiritma: qator 0 summa bilan yoziladi.
          await this.expenses.create(
            {
              category: ExpenseCategory.BANK_FEES,
              paymentMethod: ExpensePaymentMethod.CARD,
              amount: item.amount,
              description: `${BANK_FEE_LABEL} — ${acc.name}, ${month}`,
              date: bankFeeDate(month),
              branchId: acc.branchId,
            },
            userId,
            companyId,
            { cashAccountId: acc.id },
          );
        } else if (existing.amount !== item.amount) {
          await this.expenses.update(
            existing.id,
            { amount: item.amount },
            userId,
            companyId,
          );
        }
      }
    } finally {
      await invalidateNetProfitCache(this.redis, companyId);
    }
    return this.read(companyId, month, scope, userId);
  }
}
