import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SalaryPaymentStatus,
  SalaryType,
  TransactionType,
  Prisma,
} from '@prisma/client';
import { calculateTax } from './tax.helper';
import { getSalaryTaxRate } from './shared/get-salary-tax-rate';

@Injectable()
export class SalaryCalculationService {
  constructor(private prisma: PrismaService) {}

  async calculateMonthlySalaries(companyId: number) {
    const now = new Date();
    // Cutoff: 7th of current month.
    const cutoffDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      7,
      23,
      59,
      59,
    );
    // Period start: 8th of previous month.
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 8);

    // Per-company tax rate (default 12% ASOT if not configured).
    const taxRate = await getSalaryTaxRate(this.prisma, companyId);

    const results: {
      userId: number;
      grossAmount: number;
      taxAmount: number;
      netAmount: number;
      advanceDeducted: number;
      kind: 'ACCRUAL' | 'FIXED_MONTHLY';
    }[] = [];

    // === ACCRUAL-BASED (teachers) ===
    const accruals = await this.prisma.salaryAccrual.findMany({
      where: {
        companyId,
        salaryPaymentId: null,
        lessonDate: { lte: cutoffDate },
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
      const grossAmount = total;
      const { taxAmount, netAmount: netBeforeAdvance } = calculateTax(
        grossAmount,
        taxRate,
      );

      // Atomic: SalaryPayment + accrual link + TAX ledger entry + advance
      // settlement are all-or-nothing. Previously each was a separate
      // await, so a crash mid-way could leave accruals orphaned or miss
      // the tax entry.
      const { finalNet, advanceDeducted } = await this.prisma.$transaction(
        async (tx) => {
          const salaryPayment = await tx.salaryPayment.create({
            data: {
              userId,
              periodStart,
              periodEnd: cutoffDate,
              grossAmount,
              taxAmount,
              netAmount: netBeforeAdvance,
              status: SalaryPaymentStatus.CALCULATED,
              companyId,
            },
          });

          await tx.salaryAccrual.updateMany({
            where: { id: { in: ids } },
            data: { salaryPaymentId: salaryPayment.id },
          });

          if (taxAmount > 0) {
            await tx.transaction.create({
              data: {
                type: TransactionType.TAX,
                amount: -taxAmount,
                balanceBefore: 0,
                balanceAfter: 0,
                teacherId: userId,
                salaryPaymentId: salaryPayment.id,
                companyId,
                description: 'Oylik soliqi',
              },
            });
          }

          const advanceDeducted = await this.applyPendingAdvances(
            tx,
            { id: salaryPayment.id, netAmount: netBeforeAdvance },
            userId,
            companyId,
          );
          return {
            finalNet: netBeforeAdvance - advanceDeducted,
            advanceDeducted,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      results.push({
        userId,
        grossAmount,
        taxAmount,
        netAmount: finalNet,
        advanceDeducted,
        kind: 'ACCRUAL',
      });
    }

    // === FIXED MONTHLY (admins, cashiers, branch directors, or teachers on fixed salary) ===
    const fixedMonthlyConfigs = await this.prisma.employeeSalaryConfig.findMany(
      {
        where: {
          companyId,
          salaryType: SalaryType.FIXED_MONTHLY,
          isActive: true,
          groupId: null,
        },
        select: { userId: true, value: true },
      },
    );

    for (const config of fixedMonthlyConfigs) {
      // Skip if a payment already exists for this exact period (idempotent cron).
      const existing = await this.prisma.salaryPayment.findFirst({
        where: {
          userId: config.userId,
          companyId,
          periodStart,
          periodEnd: cutoffDate,
        },
        select: { id: true },
      });
      if (existing) continue;

      const grossAmount = config.value;
      const { taxAmount, netAmount: netBeforeAdvance } = calculateTax(
        grossAmount,
        taxRate,
      );

      // Atomic for the same reasons as the accrual branch above.
      const { finalNet, advanceDeducted } = await this.prisma.$transaction(
        async (tx) => {
          const salaryPayment = await tx.salaryPayment.create({
            data: {
              userId: config.userId,
              periodStart,
              periodEnd: cutoffDate,
              grossAmount,
              taxAmount,
              netAmount: netBeforeAdvance,
              status: SalaryPaymentStatus.CALCULATED,
              companyId,
            },
          });

          if (taxAmount > 0) {
            await tx.transaction.create({
              data: {
                type: TransactionType.TAX,
                amount: -taxAmount,
                balanceBefore: 0,
                balanceAfter: 0,
                teacherId: config.userId,
                salaryPaymentId: salaryPayment.id,
                companyId,
                description: 'Oylik soliqi',
              },
            });
          }

          const advanceDeducted = await this.applyPendingAdvances(
            tx,
            { id: salaryPayment.id, netAmount: netBeforeAdvance },
            config.userId,
            companyId,
          );
          return {
            finalNet: netBeforeAdvance - advanceDeducted,
            advanceDeducted,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      results.push({
        userId: config.userId,
        grossAmount,
        taxAmount,
        netAmount: finalNet,
        advanceDeducted,
        kind: 'FIXED_MONTHLY',
      });
    }

    return { calculated: results.length, details: results };
  }

  /**
   * Net outstanding TEACHER_ADVANCE expenses out of a freshly-created salary
   * payment. Walks the advances in createdAt order and settles as many as
   * fit inside the available net — remaining advances stay unsettled and
   * roll to the next cycle. Returns the total amount deducted so the caller
   * can update the SalaryPayment.netAmount accordingly.
   *
   * Must be called inside the same transaction that created the SalaryPayment
   * so settlement and the updated net stay consistent.
   */
  private async applyPendingAdvances(
    tx: Prisma.TransactionClient,
    salaryPayment: { id: string; netAmount: number },
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
      if (deducted + exp.amount > salaryPayment.netAmount) break;
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
      data: { netAmount: salaryPayment.netAmount - deducted },
    });

    return deducted;
  }
}
