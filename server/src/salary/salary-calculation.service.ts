import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryPaymentStatus, SalaryType, Prisma } from '@prisma/client';
import { resolveCompletedPeriod } from './shared/resolve-current-period';

@Injectable()
export class SalaryCalculationService {
  constructor(private prisma: PrismaService) {}

  async calculateMonthlySalaries(companyId: number, now: Date = new Date()) {
    // Settle the period that has just FINISHED, not the one `now` is inside.
    // The cron fires on cycleStartDay, when the "current" period is the one
    // just starting — paying that would settle an almost-empty window and
    // strand the month that just ended. `resolveCompletedPeriod` returns the
    // previous (closed) period. Bounds come from SalaryPeriodSetting
    // (configurable per company); default 8th→7th if no setting exists.
    const { periodStart, periodEnd } = await resolveCompletedPeriod(
      this.prisma,
      companyId,
      now,
    );

    const results: {
      userId: number;
      amount: number;
      advanceDeducted: number;
      kind: 'ACCRUAL' | 'FIXED_MONTHLY';
    }[] = [];

    // === ACCRUAL-BASED (teachers) ===
    // - Effective payroll date = COALESCE(creditPeriodDate, lessonDate),
    //   expressed as a two-branch OR. Most accruals have creditPeriodDate=NULL
    //   and bucket by their lessonDate (unchanged). Carry-over accruals (a late
    //   payment settled a lesson whose own period was already closed) have
    //   creditPeriodDate set to an open-period start, so they land in THIS run.
    // - reversedAt: null excludes accruals that were undone (cancelled
    //   lesson, attendance flipped to ABSENT, etc.) so we don't pay for them.
    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        salaryPaymentId: null,
        reversedAt: null,
        OR: [
          { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
          {
            creditPeriodDate: null,
            lessonDate: { gte: periodStart, lte: periodEnd },
          },
        ],
      },
      select: {
        id: true,
        userId: true,
        amount: true,
      },
    });

    const byUser = new Map<number, { ids: string[]; total: number }>();
    for (const a of accruals) {
      const entry = byUser.get(a.userId) ?? { ids: [], total: 0 };
      entry.ids.push(a.id);
      entry.total += a.amount;
      byUser.set(a.userId, entry);
    }

    for (const [userId, { ids, total }] of byUser) {
      const amount = total;

      // Atomic: SalaryPayment + accrual link + advance settlement are all-or-nothing.
      const { finalNet, advanceDeducted } = await this.prisma.$transaction(
        async (tx) => {
          const salaryPayment = await tx.salaryPayment.create({
            data: {
              userId,
              periodStart,
              periodEnd,
              amount,
              status: SalaryPaymentStatus.CALCULATED,
              companyId,
            },
          });

          await tx.salaryAccrual.updateMany({
            where: { id: { in: ids } },
            data: { salaryPaymentId: salaryPayment.id },
          });

          const advanceDeducted = await this.applyPendingAdvances(
            tx,
            { id: salaryPayment.id, amount },
            userId,
            companyId,
          );
          return {
            finalNet: amount - advanceDeducted,
            advanceDeducted,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      results.push({
        userId,
        amount: finalNet,
        advanceDeducted,
        kind: 'ACCRUAL',
      });
    }

    // === FIXED MONTHLY (admins, cashiers, branch directors, or teachers on fixed salary) ===
    // P1.7 — read from the version active at periodEnd (last day of the
    // cycle being settled), NOT the parent mirror. Otherwise a future-dated
    // FIXED_MONTHLY change would apply to payroll before its effectiveFrom.
    const fixedMonthlyConfigs = await this.prisma.employeeSalaryConfig.findMany(
      {
        where: {
          companyId,
          isActive: true,
          groupId: null,
          // We still anchor on the parent mirror for "is this a fixed-monthly
          // employee?" because that flag is the join key. The actual
          // payment value comes from the version below.
          salaryType: SalaryType.FIXED_MONTHLY,
        },
        select: { id: true, userId: true, value: true },
      },
    );

    for (const config of fixedMonthlyConfigs) {
      // Look up the version active at periodEnd. If none (e.g. the only
      // version's effectiveFrom is after periodEnd), skip — the employee
      // wasn't on fixed-monthly during this cycle.
      const activeVersion =
        await this.prisma.employeeSalaryConfigVersion.findFirst({
          where: {
            configId: config.id,
            salaryType: SalaryType.FIXED_MONTHLY,
            effectiveFrom: { lte: periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: periodEnd } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          select: { value: true },
        });
      if (!activeVersion) continue;

      // Skip if a payment already exists for this exact period (idempotent cron).
      const existing = await this.prisma.salaryPayment.findFirst({
        where: {
          userId: config.userId,
          companyId,
          periodStart,
          periodEnd,
        },
        select: { id: true },
      });
      if (existing) continue;

      const amount = activeVersion.value;

      // Atomic for the same reasons as the accrual branch above.
      const { finalNet, advanceDeducted } = await this.prisma.$transaction(
        async (tx) => {
          const salaryPayment = await tx.salaryPayment.create({
            data: {
              userId: config.userId,
              periodStart,
              periodEnd,
              amount,
              status: SalaryPaymentStatus.CALCULATED,
              companyId,
            },
          });

          const advanceDeducted = await this.applyPendingAdvances(
            tx,
            { id: salaryPayment.id, amount },
            config.userId,
            companyId,
          );
          return {
            finalNet: amount - advanceDeducted,
            advanceDeducted,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      results.push({
        userId: config.userId,
        amount: finalNet,
        advanceDeducted,
        kind: 'FIXED_MONTHLY',
      });
    }

    return { calculated: results.length, details: results };
  }

  /**
   * Net outstanding TEACHER_ADVANCE expenses out of a freshly-created salary
   * payment. Walks the advances in createdAt order and settles as many as
   * fit inside the available amount — remaining advances stay unsettled and
   * roll to the next cycle. Returns the total amount deducted so the caller
   * can update the SalaryPayment.amount accordingly.
   *
   * Must be called inside the same transaction that created the SalaryPayment
   * so settlement and the updated amount stay consistent.
   */
  private async applyPendingAdvances(
    tx: Prisma.TransactionClient,
    salaryPayment: { id: string; amount: number },
    userId: number,
    companyId: number,
  ): Promise<number> {
    const pending = await tx.expense.findMany({
      where: {
        category: 'TEACHER_ADVANCE',
        relatedUserId: userId,
        companyId,
        settledBySalaryPaymentId: null,
        deletedAt: null,
      },
      select: { id: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });
    if (pending.length === 0) return 0;

    const toSettle: string[] = [];
    let deducted = 0;
    for (const exp of pending) {
      if (deducted + exp.amount > salaryPayment.amount) break;
      toSettle.push(exp.id);
      deducted += exp.amount;
    }
    if (toSettle.length === 0) return 0;

    await tx.expense.updateMany({
      where: { id: { in: toSettle } },
      data: { settledBySalaryPaymentId: salaryPayment.id },
    });
    await tx.salaryPayment.update({
      where: { id: salaryPayment.id },
      data: { amount: salaryPayment.amount - deducted },
    });

    return deducted;
  }
}
