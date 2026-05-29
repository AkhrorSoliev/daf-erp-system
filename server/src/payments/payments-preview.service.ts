import { Injectable } from '@nestjs/common';
import { TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PaymentBreakdownItem {
  kind: 'DEBT_REPAY' | 'CYCLE_FULL' | 'CYCLE_PARTIAL' | 'REMAINDER';
  amount: number;
  // Human-readable label in Uzbek.
  label: string;
  // Optional contextual numbers admins look at.
  lessons?: number;
  cycleSequenceNumber?: number;
}

export interface PaymentPreview {
  amount: number;
  currentBalance: number;
  newBalance: number;
  // SINGLE_ENROLLMENT — breakdown is exact for the one ACTIVE enrollment.
  // MULTI_ENROLLMENT — student has 2+ active enrollments with different
  // course prices; we skip the per-cycle breakdown and only surface debt
  // repayment + remainder.
  // NO_ENROLLMENT — student isn't in any active group; payment just lands
  // on balance.
  scenario: 'SINGLE_ENROLLMENT' | 'MULTI_ENROLLMENT' | 'NO_ENROLLMENT';
  primaryEnrollment: {
    groupName: string;
    courseName: string;
    perLessonCost: number;
    fullCycleCost: number;
    lessonPaymentCount: number;
    currentPrepaid: number;
    currentCycleSequence: number;
  } | null;
  breakdown: PaymentBreakdownItem[];
}

/**
 * "What does this payment buy?" — simulates the effect of crediting a
 * student's balance by `amount` so the admin sees exactly how the money
 * will be applied (debt repayment, new prepaid cycles, leftover balance)
 * BEFORE submitting.
 *
 * Does NOT mutate any data — pure projection over the live student state.
 */
@Injectable()
export class PaymentsPreviewService {
  constructor(private prisma: PrismaService) {}

  async preview(
    studentId: number,
    amount: number,
    companyId: number,
  ): Promise<PaymentPreview> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { balance: true, discountPercent: true },
    });
    if (!student) {
      throw new Error("O'quvchi topilmadi");
    }

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId,
        status: 'ACTIVE',
        deletedAt: null,
        group: { companyId, deletedAt: null },
      },
      select: {
        id: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            name: true,
            course: {
              select: { name: true, price: true, lessonPaymentCount: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const newBalance = student.balance + amount;

    if (enrollments.length === 0) {
      return {
        amount,
        currentBalance: student.balance,
        newBalance,
        scenario: 'NO_ENROLLMENT',
        primaryEnrollment: null,
        breakdown: this.buildSimpleBreakdown(amount, student.balance),
      };
    }

    if (enrollments.length > 1) {
      // Multiple active enrollments with potentially different course prices.
      // We don't try to allocate the payment across them — that's a business
      // call the admin makes manually. Show debt + remainder only.
      return {
        amount,
        currentBalance: student.balance,
        newBalance,
        scenario: 'MULTI_ENROLLMENT',
        primaryEnrollment: null,
        breakdown: this.buildSimpleBreakdown(amount, student.balance),
      };
    }

    const primary = enrollments[0];
    const course = primary.group.course;
    const lessonPaymentCount = course.lessonPaymentCount || 12;
    const fullCycleCost = course.price;
    const perLessonCost = Math.round(fullCycleCost / lessonPaymentCount);

    // Apply per-student discount the same way bill() does — the preview must
    // match the real billing math or the admin sees one breakdown and the
    // ledger ends up looking different.
    const discountPercent = Math.max(
      0,
      Math.min(100, Math.trunc(student.discountPercent ?? 0)),
    );
    const discountedFullCycle =
      discountPercent <= 0
        ? fullCycleCost
        : discountPercent >= 100
          ? 0
          : Math.round((fullCycleCost * (100 - discountPercent)) / 100);
    const discountedPerLesson =
      discountPercent <= 0
        ? perLessonCost
        : discountPercent >= 100
          ? 0
          : Math.round((perLessonCost * (100 - discountPercent)) / 100);

    // How many LESSON_DEDUCTION batches has this enrollment seen? Next batch
    // would be currentCycleSequence + 1.
    const previousDeductions = await this.prisma.transaction.count({
      where: {
        enrollmentId: primary.id,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
      },
    });
    const currentCycleSequence = previousDeductions;

    const breakdown: PaymentBreakdownItem[] = [];
    let remaining = amount;

    // Step 1: debt repayment. When balance is negative the first slice of
    // the payment goes to retroactive billing (covering past unpaid lessons).
    const debt = Math.max(0, -student.balance);
    if (debt > 0) {
      const debtRepay = Math.min(remaining, debt);
      const debtLessons =
        discountedPerLesson > 0
          ? Math.floor(debtRepay / discountedPerLesson)
          : 0;
      breakdown.push({
        kind: 'DEBT_REPAY',
        amount: debtRepay,
        label: 'Mavjud qarz qoplanadi',
        lessons: debtLessons,
      });
      remaining -= debtRepay;
    }

    // Step 2: the part that lands as positive balance buys new prepaid
    // cycles. We project full cycles first, then a partial cycle, mirroring
    // bill()'s refill branches.
    if (discountedFullCycle <= 0 || discountedPerLesson <= 0) {
      // Free course — no further breakdown is meaningful.
      if (remaining > 0) {
        breakdown.push({
          kind: 'REMAINDER',
          amount: remaining,
          label: 'Balansda qoladi',
        });
      }
      return {
        amount,
        currentBalance: student.balance,
        newBalance,
        scenario: 'SINGLE_ENROLLMENT',
        primaryEnrollment: {
          groupName: primary.group.name,
          courseName: course.name,
          perLessonCost,
          fullCycleCost,
          lessonPaymentCount,
          currentPrepaid: primary.prepaidLessonsRemaining,
          currentCycleSequence,
        },
        breakdown,
      };
    }

    let nextCycle = currentCycleSequence + 1;
    while (remaining >= discountedFullCycle) {
      breakdown.push({
        kind: 'CYCLE_FULL',
        amount: discountedFullCycle,
        label: `Sikl #${nextCycle}: to'liq tsikl`,
        lessons: lessonPaymentCount,
        cycleSequenceNumber: nextCycle,
      });
      remaining -= discountedFullCycle;
      nextCycle += 1;
    }

    if (remaining >= discountedPerLesson) {
      const partialLessons = Math.floor(remaining / discountedPerLesson);
      const partialAmount = partialLessons * discountedPerLesson;
      breakdown.push({
        kind: 'CYCLE_PARTIAL',
        amount: partialAmount,
        label: `Sikl #${nextCycle}: qisman (${partialLessons} dars)`,
        lessons: partialLessons,
        cycleSequenceNumber: nextCycle,
      });
      remaining -= partialAmount;
    }

    if (remaining > 0) {
      breakdown.push({
        kind: 'REMAINDER',
        amount: remaining,
        label: 'Balansda qoladi',
      });
    }

    return {
      amount,
      currentBalance: student.balance,
      newBalance,
      scenario: 'SINGLE_ENROLLMENT',
      primaryEnrollment: {
        groupName: primary.group.name,
        courseName: course.name,
        perLessonCost,
        fullCycleCost,
        lessonPaymentCount,
        currentPrepaid: primary.prepaidLessonsRemaining,
        currentCycleSequence,
      },
      breakdown,
    };
  }

  private buildSimpleBreakdown(
    amount: number,
    currentBalance: number,
  ): PaymentBreakdownItem[] {
    const breakdown: PaymentBreakdownItem[] = [];
    let remaining = amount;
    const debt = Math.max(0, -currentBalance);
    if (debt > 0) {
      const debtRepay = Math.min(remaining, debt);
      breakdown.push({
        kind: 'DEBT_REPAY',
        amount: debtRepay,
        label: 'Mavjud qarz qoplanadi',
      });
      remaining -= debtRepay;
    }
    if (remaining > 0) {
      breakdown.push({
        kind: 'REMAINDER',
        amount: remaining,
        label: 'Balansda qoladi',
      });
    }
    return breakdown;
  }
}
