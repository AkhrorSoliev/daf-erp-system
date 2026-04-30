import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCurrentPeriod } from './shared/resolve-current-period';

/**
 * Per-payment salary breakdown — answers "where did each so'm in this
 * payslip come from?". Returns one row per accrual with student, group,
 * lesson date, the per-lesson cost in effect at the time, and which
 * config version supplied the rate.
 *
 * Reversed accruals (`reversedAt IS NOT NULL`) appear in a separate bucket
 * so admins can see what was undone.
 */
@Injectable()
export class SalaryBreakdownService {
  constructor(private prisma: PrismaService) {}

  /**
   * Breakdown for a finalised SalaryPayment. The teacher can view their
   * own; CEO/BD can view any.
   */
  async getPaymentBreakdown(
    salaryPaymentId: string,
    companyId: number,
    asUserId?: number, // when set, restrict to this teacher's own payment
  ) {
    const payment = await this.prisma.salaryPayment.findFirst({
      where: { id: salaryPaymentId, companyId },
      select: {
        id: true,
        userId: true,
        periodStart: true,
        periodEnd: true,
        amount: true,
        status: true,
      },
    });
    if (!payment) throw new NotFoundException('Oylik to`lovi topilmadi');
    if (asUserId !== undefined && payment.userId !== asUserId) {
      throw new ForbiddenException("Faqat o'z oylik to'lovingizni ko'rishingiz mumkin");
    }

    const accruals = await this.fetchAccrualBreakdown(
      payment.userId,
      companyId,
      { salaryPaymentId },
    );

    return {
      payment,
      ...accruals,
    };
  }

  /**
   * Breakdown for the in-progress (unpaid) cycle — teacher's own view.
   * Shows what they've earned so far this period.
   */
  async getCurrentCycleBreakdown(userId: number, companyId: number) {
    const { periodStart, periodEnd } = await resolveCurrentPeriod(
      this.prisma,
      companyId,
      new Date(),
    );

    const accruals = await this.fetchAccrualBreakdown(userId, companyId, {
      periodStart,
      periodEnd,
    });

    return {
      period: { periodStart, periodEnd },
      ...accruals,
    };
  }

  // ---------- internals ----------

  private async fetchAccrualBreakdown(
    userId: number,
    companyId: number,
    filter:
      | { salaryPaymentId: string }
      | { periodStart: Date; periodEnd: Date },
  ) {
    const where =
      'salaryPaymentId' in filter
        ? { userId, companyId, salaryPaymentId: filter.salaryPaymentId }
        : {
            userId,
            companyId,
            salaryPaymentId: null,
            lessonDate: { gte: filter.periodStart, lte: filter.periodEnd },
          };

    const rows = await this.prisma.salaryAccrual.findMany({
      where,
      select: {
        id: true,
        amount: true,
        perLessonCost: true,
        lessonDate: true,
        attendanceId: true,
        reversedAt: true,
        reversalReason: true,
        student: { select: { id: true, firstName: true, lastName: true } },
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { name: true, lessonPaymentCount: true } },
          },
        },
        salaryConfigVersion: {
          select: {
            id: true,
            salaryType: true,
            value: true,
            effectiveFrom: true,
            effectiveTo: true,
            config: { select: { groupId: true } },
          },
        },
        reversedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { lessonDate: 'asc' },
    });

    const active = rows.filter((r) => !r.reversedAt);
    const reversed = rows.filter((r) => !!r.reversedAt);

    const activeTotal = active.reduce((s, r) => s + r.amount, 0);
    const reversedTotal = reversed.reduce((s, r) => s + r.amount, 0);

    return {
      lines: rows.map((r) => ({
        id: r.id,
        lessonDate: r.lessonDate,
        student: r.student,
        group: r.group,
        perLessonCost: r.perLessonCost,
        amount: r.amount,
        configVersion: r.salaryConfigVersion
          ? {
              id: r.salaryConfigVersion.id,
              salaryType: r.salaryConfigVersion.salaryType,
              value: r.salaryConfigVersion.value,
              effectiveFrom: r.salaryConfigVersion.effectiveFrom,
              effectiveTo: r.salaryConfigVersion.effectiveTo,
              scope: r.salaryConfigVersion.config.groupId ? 'GROUP' : 'GLOBAL',
            }
          : null,
        reversedAt: r.reversedAt,
        reversalReason: r.reversalReason,
        reversedBy: r.reversedBy,
      })),
      totals: {
        accrualCount: active.length,
        amountTotal: activeTotal,
        reversedCount: reversed.length,
        reversedTotal,
      },
    };
  }
}
