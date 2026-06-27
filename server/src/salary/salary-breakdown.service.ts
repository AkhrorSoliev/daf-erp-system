import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    // Advances (TEACHER_ADVANCE expenses) that were netted out of THIS
    // payment. They were paid to the teacher up front via Xarajatlar, so
    // `payment.amount` is already reduced by their total. Surface them here
    // so the payslip explains the gap between "earned" and "net paid":
    //   grossTotal (earned/owed before advances) − settledAdvancesTotal
    //     = payment.amount (net cash transferred in the salary run).
    const settledAdvances = await this.prisma.expense.findMany({
      where: { settledBySalaryPaymentId: salaryPaymentId, companyId },
      select: { id: true, amount: true, description: true, date: true },
      orderBy: { date: 'asc' },
    });
    const settledAdvancesTotal = settledAdvances.reduce(
      (s, e) => s + e.amount,
      0,
    );

    return {
      payment,
      settledAdvances,
      settledAdvancesTotal,
      // Pre-advance amount = what the teacher actually earned/was owed for
      // this period (works for both accrual-based and FIXED_MONTHLY payments,
      // where `amountTotal` from accruals would be 0).
      grossTotal: payment.amount + settledAdvancesTotal,
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
    const where: Prisma.SalaryAccrualWhereInput =
      'salaryPaymentId' in filter
        ? { userId, companyId, salaryPaymentId: filter.salaryPaymentId }
        : {
            userId,
            companyId,
            salaryPaymentId: null,
            // Effective payroll date = COALESCE(creditPeriodDate, lessonDate).
            // Mirrors salary-calculation so a carried-over accrual (late
            // payment for a closed period) shows in the period it's actually
            // credited to, not the one its lessonDate falls in.
            OR: [
              {
                creditPeriodDate: {
                  gte: filter.periodStart,
                  lte: filter.periodEnd,
                },
              },
              {
                creditPeriodDate: null,
                lessonDate: { gte: filter.periodStart, lte: filter.periodEnd },
              },
            ],
          };

    const rows = await this.prisma.salaryAccrual.findMany({
      where,
      select: {
        id: true,
        amount: true,
        perLessonCost: true,
        lessonDate: true,
        creditPeriodDate: true,
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

    // Carried-over slice: active accruals whose lesson fell in a closed period
    // and were redirected into this one (late payment). Surfaced separately so
    // the UI can show "shundan oldingi oydan: X".
    const carriedOver = active.filter((r) => !!r.creditPeriodDate);
    const carriedOverTotal = carriedOver.reduce((s, r) => s + r.amount, 0);

    // Mark which (groupId, lessonDate) pairs had a substitute teacher override
    // active. Build a Set of "groupId|date" keys so each line gets an O(1)
    // boolean lookup. We over-fetch slightly (any override that touches these
    // groups in this period) — fine for breakdown's small row counts.
    const overrides = rows.length
      ? await this.prisma.lessonTeacherOverride.findMany({
          where: {
            deletedAt: null,
            groupId: { in: [...new Set(rows.map((r) => r.group.id))] },
            date: { in: [...new Set(rows.map((r) => r.lessonDate))] },
          },
          select: { groupId: true, date: true },
        })
      : [];
    const overrideKeys = new Set(
      overrides.map((o) => `${o.groupId}|${o.date.toISOString()}`),
    );

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
        isSubstitute: overrideKeys.has(
          `${r.group.id}|${r.lessonDate.toISOString()}`,
        ),
        // Carried over from a closed (previous) period into this one because
        // the student paid late. `creditPeriodDate` is the period it was
        // credited to; `lessonDate` remains the real lesson date.
        isCarriedOver: !!r.creditPeriodDate,
        creditPeriodDate: r.creditPeriodDate,
        reversedAt: r.reversedAt,
        reversalReason: r.reversalReason,
        reversedBy: r.reversedBy,
      })),
      totals: {
        accrualCount: active.length,
        amountTotal: activeTotal,
        reversedCount: reversed.length,
        reversedTotal,
        carriedOverCount: carriedOver.length,
        carriedOverTotal,
      },
    };
  }
}
