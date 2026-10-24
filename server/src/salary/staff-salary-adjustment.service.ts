import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { tashkentMonthKey } from '../common/date/tashkent';
import {
  parseTashkentDateStart,
  resolveCurrentPeriod,
} from './shared/resolve-current-period';
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
import { settlePendingAdvances } from './shared/advance-settle';
import {
  ADJUSTMENT_FIRST_MONTH,
  resolveStaffMonthly,
} from './shared/staff-monthly-amount';
import { SalaryMonthlyService } from './salary-monthly.service';

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

/**
 * The CEO's manual correction of a non-teaching staff member's monthly pay
 * (ADR-0112). It stores the figure; `resolveStaffMonthly` is what makes the
 * payroll and every report read it. When the month's `SalaryPayment` already
 * exists (the cron runs at the month's end, the correction usually comes
 * later) the payment is recomputed in the same transaction.
 */
@Injectable()
export class StaffSalaryAdjustmentService {
  constructor(
    private prisma: PrismaService,
    private history: EntityHistoryService,
    private monthly: SalaryMonthlyService,
  ) {}

  async set(
    userId: number,
    dto: { month: string; amount: number; reason: string },
    companyId: number,
    callerId: number,
  ) {
    await this.write(userId, dto.month, companyId, callerId, {
      amount: dto.amount,
      reason: dto.reason.trim(),
    });
    return this.monthly.getMonthlyForUser(
      userId,
      { month: dto.month },
      companyId,
      callerId,
    );
  }

  async clear(
    userId: number,
    month: string,
    companyId: number,
    callerId: number,
  ) {
    await this.write(userId, month, companyId, callerId, null);
    return this.monthly.getMonthlyForUser(
      userId,
      { month },
      companyId,
      callerId,
    );
  }

  private assertMonth(month: string) {
    if (month < ADJUSTMENT_FIRST_MONTH) {
      throw new BadRequestException(
        "Oylik to'g'rilash may 2026 dan boshlab mumkin",
      );
    }
    if (month > tashkentMonthKey(new Date())) {
      throw new BadRequestException("Kelajak oyini to'g'rilab bo'lmaydi");
    }
  }

  /** `next` null = return the month to the formula. */
  private async write(
    userId: number,
    month: string,
    companyId: number,
    callerId: number,
    next: { amount: number; reason: string } | null,
  ) {
    this.assertMonth(month);
    await assertPayrollCoversUser(this.prisma, callerId, userId);
    const period = await resolveCurrentPeriod(
      this.prisma,
      companyId,
      parseTashkentDateStart(`${month}-15`),
    );

    await this.prisma
      .$transaction(async (tx) => {
        const config = await tx.employeeSalaryConfig.findFirst({
          where: {
            companyId,
            userId,
            groupId: null,
            salaryType: SalaryType.FIXED_MONTHLY,
            user: {
              deletedAt: null,
              roles: { none: { role: { name: 'Teacher' } } },
            },
          },
          select: { id: true },
        });
        if (!config) {
          throw new BadRequestException("Xodimda oylik stavkasi yo'q");
        }

        const versions = await tx.employeeSalaryConfigVersion.findMany({
          where: {
            configId: config.id,
            salaryType: SalaryType.FIXED_MONTHLY,
            effectiveFrom: { lte: period.periodEnd },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: period.periodStart } },
            ],
          },
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        });
        const { calculated } = resolveStaffMonthly({
          versions,
          adjustment: null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });

        const key = { companyId_userId_month: { companyId, userId, month } };
        const existing = await tx.staffSalaryAdjustment.findUnique({
          where: key,
        });
        if (!next && !existing) {
          throw new NotFoundException("Bu oyda qo'lda to'g'rilash yo'q");
        }

        const payment = await tx.salaryPayment.findFirst({
          where: {
            userId,
            companyId,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            status: { not: SalaryPaymentStatus.CANCELLED },
          },
          select: { id: true, status: true, note: true },
        });
        if (payment && payment.status !== SalaryPaymentStatus.CALCULATED) {
          throw new ConflictException(
            "Oylik tasdiqlangan — avval to'lovni bekor qiling",
          );
        }

        const gross = next ? next.amount : calculated;
        if (payment) {
          const settled = await tx.expense.aggregate({
            where: {
              settledBySalaryPaymentId: payment.id,
              category: 'TEACHER_ADVANCE',
              deletedAt: null,
            },
            _sum: { amount: true },
          });
          const settledTotal = settled._sum.amount ?? 0;
          if (gross < settledTotal) {
            throw new BadRequestException(
              next
                ? "Qo'lda summa ushlangan avanslardan kam"
                : "Hisob summasi ushlangan avanslardan kam — avval avansni to'g'rilang",
            );
          }
          const newly = await settlePendingAdvances(tx, {
            paymentId: payment.id,
            available: gross - settledTotal,
            userId,
            companyId,
            periodEndDateExclusive: period.periodEndDateExclusive,
          });
          await tx.salaryPayment.update({
            where: { id: payment.id },
            data: {
              amount: gross - settledTotal - newly,
              ...(next && {
                note: [payment.note, `Qo'lda to'g'rilandi: ${next.reason}`]
                  .filter(Boolean)
                  .join(' · '),
              }),
            },
          });
        }

        if (next) {
          await tx.staffSalaryAdjustment.upsert({
            where: key,
            create: {
              companyId,
              userId,
              month,
              amount: next.amount,
              calculatedAmount: calculated,
              reason: next.reason,
              createdById: callerId,
            },
            update: {
              amount: next.amount,
              calculatedAmount: calculated,
              reason: next.reason,
              createdById: callerId,
            },
          });
        } else {
          await tx.staffSalaryAdjustment.delete({ where: key });
        }

        // `oldingi` is put in explicitly as null when there was none: the
        // history diff drops a key a previous value does not carry.
        await this.history.recordCreate({
          tx,
          entityType: 'User',
          entityId: userId,
          newValues: next
            ? {
                action: 'OYLIK_TUZATILDI',
                oy: month,
                hisob: calculated,
                qoldaSumma: next.amount,
                oldingi: existing?.amount ?? null,
                sabab: next.reason,
              }
            : {
                action: 'OYLIK_HISOBGA_QAYTARILDI',
                oy: month,
                hisob: calculated,
                oldingi: existing?.amount ?? null,
              },
          changedById: callerId,
          companyId,
        });
      }, TX_OPTIONS)
      .catch(rethrowAsConflict);
  }
}
