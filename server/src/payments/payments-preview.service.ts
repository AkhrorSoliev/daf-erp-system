import { Injectable } from '@nestjs/common';
import { AttendanceStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';

export interface PaymentBreakdownItem {
  kind: 'DEBT_REPAY' | 'CYCLE_FULL' | 'CYCLE_PARTIAL' | 'REMAINDER';
  amount: number;
  // Human-readable label in Uzbek.
  label: string;
  // Optional contextual numbers admins look at.
  lessons?: number;
  cycleSequenceNumber?: number;
  // Sikl sana oralig'i. DEBT_REPAY uchun — qoplanadigan o'tgan darslarning
  // haqiqiy sanalari (ISO). CYCLE_FULL/PARTIAL uchun null — bu darslar hali
  // o'tilmagan (kelgusi sikl), shuning uchun sana yo'q, faqat dars soni.
  firstLessonDate?: string | null;
  lastLessonDate?: string | null;
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
    branchIds: ReportBranchIds,
  ): Promise<PaymentPreview> {
    // Confined like every other student read: the projection reports the
    // student's live balance and outstanding debt.
    const student = await this.prisma.student.findFirst({
      where: {
        id: studentId,
        companyId,
        deletedAt: null,
        ...studentBranchWhere(branchIds),
      },
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
            id: true,
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

      // Qarz qaysi SANALARDAGI darslarni qoplaydi — retroaktiv billing eng
      // eskidan boshlab to'lanmagan (active LESSON_CONSUMPTION'siz) PRESENT/LATE
      // darslarni hisoblaydi (B.1: ABSENT/EXCUSED sarflanmaydi). Eng eski
      // debtLessons ta darsning sana oralig'ini ko'rsatamiz.
      let firstLessonDate: Date | null = null;
      let lastLessonDate: Date | null = null;
      if (debtLessons > 0) {
        const consumed = await this.prisma.transaction.findMany({
          where: {
            enrollmentId: primary.id,
            type: TransactionType.LESSON_CONSUMPTION,
            reversedAt: null,
          },
          select: { attendanceId: true },
        });
        const consumedIds = consumed
          .map((c) => c.attendanceId)
          .filter((id): id is string => !!id);
        const unpaid = await this.prisma.attendance.findMany({
          where: {
            groupId: primary.group.id,
            studentId,
            status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
            ...(consumedIds.length > 0 && { id: { notIn: consumedIds } }),
          },
          select: { date: true },
          orderBy: { date: 'asc' },
          take: debtLessons,
        });
        if (unpaid.length > 0) {
          firstLessonDate = unpaid[0].date;
          lastLessonDate = unpaid[unpaid.length - 1].date;
        }
      }

      breakdown.push({
        kind: 'DEBT_REPAY',
        amount: debtRepay,
        label: 'Mavjud qarz qoplanadi',
        lessons: debtLessons,
        firstLessonDate: firstLessonDate?.toISOString() ?? null,
        lastLessonDate: lastLessonDate?.toISOString() ?? null,
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

    // Kelgusi sikllar — bu darslar HALI o'tilmagan, shuning uchun sana yo'q,
    // faqat dars soni ko'rsatiladi (admin'lar "Sikl #N" jargonidan chalkashgan
    // edi). Sanalar keyin, darslar o'tilgach, To'lovlar/Darslar tabida chiqadi.
    let nextCycle = currentCycleSequence + 1;
    while (remaining >= discountedFullCycle) {
      breakdown.push({
        kind: 'CYCLE_FULL',
        amount: discountedFullCycle,
        label: `Kelgusi sikl — ${lessonPaymentCount} dars (oldindan)`,
        lessons: lessonPaymentCount,
        cycleSequenceNumber: nextCycle,
        firstLessonDate: null,
        lastLessonDate: null,
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
        label: `Kelgusi sikl — ${partialLessons} dars (qisman, oldindan)`,
        lessons: partialLessons,
        cycleSequenceNumber: nextCycle,
        firstLessonDate: null,
        lastLessonDate: null,
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
