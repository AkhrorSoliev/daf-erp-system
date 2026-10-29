import { Injectable } from '@nestjs/common';
import {
  CashAccountType,
  CashMovementType,
  ExpenseCategory,
  ExpensePaymentMethod,
  PaymentStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';
import {
  branchIdWhere,
  ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { TaxSettingsService } from './tax-settings.service';
import { bankFeeWindow, MONTH_CLOSE_FIRST_MONTH } from './bank-fee';
import {
  BANK_FEES_ENTERED_KEY,
  computePaymentCosts,
  computePayrollTax,
  emptyTaxCosts,
  PaymentGroup,
  TaxCosts,
  TaxMissingKey,
} from './tax-costs';

@Injectable()
export class TaxCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tax: TaxSettingsService,
  ) {}

  /**
   * Bir oyning soliq va komissiyalari, doira bo'yicha. Komissiya va aylanma —
   * pul tushgan oy (`Payment.createdAt`); ijtimoiy soliq — oylik tegishli oy
   * (`SalaryPayment.periodStart`). Bo'sh doira (`[]`) = nol, so'rovsiz.
   */
  async forMonth(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<TaxCosts> {
    if (branchIds !== null && branchIds.length === 0) return emptyTaxCosts();

    const scoped = {
      companyId,
      status: PaymentStatus.COMPLETED,
      createdAt: tashkentMonthRangeUtc(month),
      ...branchIdWhere(branchIds),
    };
    const [noFee, withFee, bankPaidSalary, feesMissing, { rates }] =
      await Promise.all([
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
        this.bankPaidSalary(companyId, month, branchIds),
        this.bankFeesMissing(companyId, month, branchIds),
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
    const pay = computePaymentCosts({ groups, month, rates });
    const roll = computePayrollTax({ bankPaidSalary, month, rates });
    const missingRates: TaxMissingKey[] = [...pay.missing, ...roll.missing];
    if (feesMissing) missingRates.push(BANK_FEES_ENTERED_KEY);
    return {
      providerFees: pay.providerFees,
      turnoverTax: pay.turnoverTax,
      employerSocialTax: roll.employerSocialTax,
      withholding: roll.withholding,
      bankPaidSalary,
      turnover: pay.turnover,
      total: pay.providerFees + pay.turnoverTax + roll.employerSocialTax,
      missingRates,
    };
  }

  /**
   * Oy M oyligining bank hisoblaridan chiqqan qismi (spec 2026-10-28 §4):
   * shu oy `SalaryPayment`larining BANK hisobidagi chiqimlari + shu
   * to'lovlarga ushlangan, bankdan (`CARD` → BANK) berilgan avanslar.
   */
  async bankPaidSalary(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<number> {
    // Yopilgan oylar (may–sentabr) eski qoidalar bilan: ijtimoiy soliq bazasi 0.
    if (month < MONTH_CLOSE_FIRST_MONTH) return 0;
    const periodStart = tashkentMonthRangeUtc(month);
    const [txs, advances] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          companyId,
          type: TransactionType.SALARY_PAYMENT,
          reversedAt: null,
          reversedTransactionId: null,
          salaryPayment: { periodStart },
        },
        select: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          companyId,
          category: ExpenseCategory.TEACHER_ADVANCE,
          paymentMethod: ExpensePaymentMethod.CARD,
          deletedAt: null,
          settledBySalaryPayment: { periodStart },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
    ]);
    const moves = txs.length
      ? await this.prisma.cashMovement.aggregate({
          where: {
            companyId,
            transactionId: { in: txs.map((t) => t.id) },
            type: CashMovementType.OUTFLOW,
            reversedAt: null,
            cashAccount: { type: CashAccountType.BANK },
            ...branchIdWhere(branchIds),
          },
          _sum: { amount: true },
        })
      : null;
    return -(moves?._sum.amount ?? 0) + (advances._sum.amount ?? 0);
  }

  /** Tugagan oyda doiradagi biror bank hisobiga bank xizmati yozilmaganmi. */
  private async bankFeesMissing(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<boolean> {
    if (month < MONTH_CLOSE_FIRST_MONTH) return false;
    if (month >= tashkentMonthKey(new Date())) return false;
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        companyId,
        type: CashAccountType.BANK,
        isActive: true,
        deletedAt: null,
        createdAt: { lt: tashkentMonthRangeUtc(month).lt },
        ...branchIdWhere(branchIds),
      },
      select: { id: true },
    });
    if (accounts.length === 0) return false;
    const entered = await this.prisma.expense.findMany({
      where: {
        companyId,
        category: ExpenseCategory.BANK_FEES,
        deletedAt: null,
        cashAccountId: { in: accounts.map((a) => a.id) },
        date: bankFeeWindow(month),
      },
      select: { cashAccountId: true },
      distinct: ['cashAccountId'],
    });
    return entered.length < accounts.length;
  }
}
