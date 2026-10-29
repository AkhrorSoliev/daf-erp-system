import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CashAccountType,
  SalaryPaymentStatus,
  TransactionType,
} from '@prisma/client';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyService } from './salary-monthly.service';
import { TaxSettingsService } from '../tax/tax-settings.service';
import { rateForMonth } from '../tax/tax-rates';
import type { StaffRow } from './salary-monthly-staff.service';
import type { SalaryMonthlyQuery } from './shared/resolve-monthly-scope';

type TeacherRow = Awaited<
  ReturnType<SalaryMonthlyService['getMonthly']>
>['data'][number];

export interface PayoutView {
  /** The latest PAID payment of the month, like the row's merged status. */
  paidAt: string | null;
  paidBy: { id: number; firstName: string; lastName: string } | null;
  slices: {
    amount: number;
    accountName: string;
    accountType: CashAccountType;
  }[];
}

/**
 * Everything the «Ish haqi» row drawer needs about one person's month beyond
 * the row itself (spec §2.5, §7.1). The row is `getMonthlyForUser`'s — the
 * single source of every figure (ADR-0006); this adds only what a drawer
 * reads off other tables: where a PAID payout came from, the payee's cash
 * accounts for «Berildi», and the frozen-vs-live difference.
 */
@Injectable()
export class SalaryMonthlyDetailService {
  constructor(
    private prisma: PrismaService,
    private monthly: SalaryMonthlyService,
    private taxSettings: TaxSettingsService,
  ) {}

  async getDetail(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    const { month, period, row } = await this.load(
      userId,
      query,
      companyId,
      performedById,
    );
    const isTeacher = 'fullDeserved' in row;
    const worked = isTeacher ? row.fullDeserved : row.monthly;
    const [payout, payee] = await Promise.all([
      row.payment?.status === SalaryPaymentStatus.PAID
        ? this.payoutOf(userId, companyId, month)
        : null,
      this.payeeOf(userId, companyId),
    ]);
    const branch = await this.cashAccountsOf(companyId, payee.mainBranch);

    return {
      month,
      period: {
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        cycleStartDay: period.cycleStartDay,
      },
      kind: isTeacher ? ('teacher' as const) : ('staff' as const),
      row,
      // The payment is frozen at the cron's run; the row's «worked − advances»
      // is live. null when there is nothing to compare.
      afterCalcDiff:
        row.payment && worked != null
          ? row.payment.amount - (worked - row.advances)
          : null,
      payout,
      bankTax: await this.bankTaxOf(companyId, month),
      ...branch,
    };
  }

  /**
   * The month's period for a person inside the caller's scope, 404 outside it
   * — the lessons route asks this first, so it shares the detail's refusal.
   */
  async getPeriod(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    return (await this.load(userId, query, companyId, performedById)).period;
  }

  private async load(
    userId: number,
    query: SalaryMonthlyQuery,
    companyId: number,
    performedById: number,
  ) {
    const res = await this.monthly.getMonthlyForUser(
      userId,
      query,
      companyId,
      performedById,
    );
    // `getMonthlyForUser` types `row` as the teacher row alone (`a ?? b` on a
    // non-nullable `a` drops `b`); at runtime it is the staff row or null too.
    const row = res.row as TeacherRow | StaffRow | null;
    if (!row) throw new NotFoundException('Bu oyda xodim topilmadi');
    return { ...res, row };
  }

  /**
   * Where the month's payout came from: every PAID payment of the person in
   * the month's window (the report merges re-calculated months into one row),
   * their live SALARY_PAYMENT ledger rows and those rows' cash movements.
   * A payout is an outflow, so a movement's amount is negative — the slice
   * flips the sign, never `Math.abs`.
   */
  private async payoutOf(
    userId: number,
    companyId: number,
    month: string,
  ): Promise<PayoutView> {
    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        userId,
        companyId,
        status: SalaryPaymentStatus.PAID,
        periodStart: tashkentMonthRangeUtc(month),
      },
      select: {
        id: true,
        paidAt: true,
        paidBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const latest = payments[payments.length - 1];
    const ledger = payments.length
      ? await this.prisma.transaction.findMany({
          where: {
            salaryPaymentId: { in: payments.map((p) => p.id) },
            type: TransactionType.SALARY_PAYMENT,
            reversedAt: null,
          },
          select: { id: true },
        })
      : [];
    const movements = ledger.length
      ? await this.prisma.cashMovement.findMany({
          where: { transactionId: { in: ledger.map((t) => t.id) } },
          select: {
            amount: true,
            cashAccount: { select: { name: true, type: true } },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    return {
      paidAt: latest?.paidAt?.toISOString() ?? null,
      paidBy: latest?.paidBy ?? null,
      slices: movements.map((m) => ({
        amount: -m.amount,
        accountName: m.cashAccount.name,
        accountType: m.cashAccount.type,
      })),
    };
  }

  /** Xodimning asosiy filiali. */
  private async payeeOf(userId: number, companyId: number) {
    const payee = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: { mainBranch: true },
    });
    return { mainBranch: payee?.mainBranch ?? null };
  }

  /** «Berildi» oynasidagi bank qatori uchun oyning stavkalari (spec 2026-10-28 §4). */
  private async bankTaxOf(companyId: number, month: string) {
    const { rates } = await this.taxSettings.loadRates(companyId);
    return {
      withholdingPercent: rateForMonth(
        rates['payroll.employeeWithholdingPercent'],
        month,
      ),
      employerSocialPercent: rateForMonth(
        rates['payroll.employerSocialPercent'],
        month,
      ),
    };
  }

  /** The payee's own branch's open accounts — where «Berildi» draws from. */
  private async cashAccountsOf(companyId: number, mainBranch: number | null) {
    const branchId = mainBranch;
    if (branchId == null) return { cashAccounts: [], payeeBranchMissing: true };

    const cashAccounts = await this.prisma.cashAccount.findMany({
      where: { companyId, branchId, isActive: true, deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { createdAt: 'asc' },
    });
    return { cashAccounts, payeeBranchMissing: false };
  }
}
