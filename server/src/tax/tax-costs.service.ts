import { Injectable } from '@nestjs/common';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import {
  branchIdWhere,
  ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { TaxSettingsService } from './tax-settings.service';
import {
  computePaymentCosts,
  computePayrollTax,
  emptyTaxCosts,
  PaymentGroup,
  payrollRowsOf,
  TaxCosts,
} from './tax-costs';

@Injectable()
export class TaxCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tax: TaxSettingsService,
  ) {}

  /**
   * Bir oyning soliq va komissiyalari, doira bo'yicha. Pul tushgan oy —
   * `Payment.createdAt` (Toshkent, yuqori chegara `lt`). Bo'sh doira (`[]`) =
   * hech narsa: so'rovsiz nol qaytadi (pul o'qishlari fail-closed).
   */
  async forMonth(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
    salaries: any,
  ): Promise<TaxCosts> {
    if (branchIds !== null && branchIds.length === 0) return emptyTaxCosts();

    const createdAt = tashkentMonthRangeUtc(month);
    const base = { companyId, status: PaymentStatus.COMPLETED, createdAt };
    const scoped = { ...base, ...branchIdWhere(branchIds) };

    const payrollRows = payrollRowsOf(salaries, month);
    const [noFee, withFee, companyAgg, users, book] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['branchId', 'method', 'source'],
        where: { ...scoped, providerFee: null },
        _sum: { amount: true },
      }),
      this.prisma.payment.groupBy({
        by: ['branchId', 'method', 'source'],
        where: { ...scoped, providerFee: { not: null } },
        _sum: { amount: true, providerFee: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...base, method: { not: PaymentMethod.CASH } },
        _sum: { amount: true },
      }),
      payrollRows.length
        ? this.prisma.user.findMany({
            where: {
              companyId,
              id: { in: payrollRows.map((r) => r.userId) },
              officialSalary: { gt: 0 },
            },
            select: { id: true, officialSalary: true },
          })
        : Promise.resolve(
            [] as { id: number; officialSalary: number | null }[],
          ),
      this.tax.loadRates(companyId),
    ]);

    const groups: PaymentGroup[] = [
      ...noFee.map((g) => ({
        branchId: g.branchId,
        method: g.method,
        source: g.source,
        amount: g._sum.amount ?? 0,
        storedFee: null,
      })),
      ...withFee.map((g) => ({
        branchId: g.branchId,
        method: g.method,
        source: g.source,
        amount: g._sum.amount ?? 0,
        storedFee: g._sum.providerFee ?? 0,
      })),
    ];
    const pay = computePaymentCosts({
      groups,
      companyTurnover: companyAgg._sum.amount ?? 0,
      month,
      book,
    });
    const roll = computePayrollTax({
      rows: payrollRows,
      officialByUser: new Map(users.map((u) => [u.id, u.officialSalary ?? 0])),
      month,
      book,
    });
    return {
      providerFees: pay.providerFees,
      turnoverTax: pay.turnoverTax,
      bankFees: pay.bankFees,
      employerSocialTax: roll.employerSocialTax,
      withholding: roll.withholding,
      turnover: pay.turnover,
      total:
        pay.providerFees +
        pay.turnoverTax +
        pay.bankFees +
        roll.employerSocialTax,
      missingRates: [...pay.missing, ...roll.missing],
    };
  }
}
