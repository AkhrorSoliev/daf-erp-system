import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AttendanceStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cycleCostFor } from './lesson-price';
import { TransactionsService } from '../transactions/transactions.service';
import { SalaryAccrualService } from '../salary/salary-accrual.service';

/**
 * When an enrollment's life ends (DROPPED) or the student moves to
 * another group (TRANSFERRED), any unused prepaid lessons must be
 * converted back to balance — otherwise the money stays "stuck" on a
 * closed enrollment and the student loses value.
 *
 * Misol 4 (transfer A→B): Aziz had 5 prepaid lessons left in A. We
 * credit `5 × perLessonCost` back to balance and zero out the prepaid
 * counter. The new enrollment B starts at 0 prepaid; its first attended
 * lesson goes through the normal refill path against the (now richer)
 * balance.
 *
 * Misol 5 (DROPPED): same flow — money returns to balance, can be used
 * later or refunded via the formal refund path.
 */
@Injectable()
export class EnrollmentBillingService {
  private readonly logger = new Logger(EnrollmentBillingService.name);

  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private salaryAccrualService: SalaryAccrualService,
  ) {}

  /**
   * What to credit back for `remaining` unused lessons of the batch that paid
   * for them.
   *
   * Priced against the BATCH, not per lesson: `remaining × perLessonCost` is
   * short by the cycle's rounding remainder (five unused lessons of a 400 000 /
   * 12 cycle refund 166 665 while the student is owed 166 669), and it reads
   * the undiscounted figure, so a discounted student was over-refunded. Taking
   * the deduction's own `amount` and subtracting what the consumed lessons cost
   * fixes both at once — the two halves always add back to what was charged,
   * whatever the price and whatever the discount.
   *
   * Legacy rows with no usable metadata fall back to the old per-lesson math.
   *
   * Public because the refund dialog has to quote the SAME figure the refund
   * will actually credit — a second implementation is how the two drifted
   * apart in the first place.
   */
  async prepaidRefundValue(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    course: { price: number; lessonPaymentCount: number | null },
    remaining: number,
  ): Promise<number> {
    if (remaining <= 0) return 0;
    const recentDeduction = await tx.transaction.findFirst({
      where: {
        enrollmentId,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { amount: true, metadata: true },
    });
    const meta = recentDeduction?.metadata as
      | { perLessonCost?: number; lessonsCovered?: number }
      | null
      | undefined;
    const batchLessons = Number(meta?.lessonsCovered ?? 0);
    const batchAmount = Math.abs(recentDeduction?.amount ?? 0);

    if (batchLessons > 0 && batchAmount > 0 && remaining <= batchLessons) {
      const consumed = batchLessons - remaining;
      return batchAmount - cycleCostFor(batchAmount, batchLessons, consumed);
    }

    return (
      remaining * (await this.resolvePerLessonCost(tx, enrollmentId, course))
    );
  }

  /**
   * Resolve perLessonCost for an enrollment using the same priority chain
   * as `refundPrepaidToBalance`: most recent unreversed LESSON_DEDUCTION
   * metadata wins so a course price hike after the deduction doesn't
   * inflate the refund. Falls back to current course price for legacy rows.
   */
  private async resolvePerLessonCost(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    course: { price: number; lessonPaymentCount: number | null },
  ): Promise<number> {
    const recentDeduction = await tx.transaction.findFirst({
      where: {
        enrollmentId,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true },
    });
    const meta = recentDeduction?.metadata as
      | { perLessonCost?: number }
      | null
      | undefined;
    if (
      meta &&
      typeof meta.perLessonCost === 'number' &&
      meta.perLessonCost > 0
    ) {
      return meta.perLessonCost;
    }
    const lessonPaymentCount = course.lessonPaymentCount || 12;
    return Math.round(course.price / lessonPaymentCount);
  }

  /**
   * Convert any unused prepaid lessons back to student balance.
   * Idempotent: if `prepaidLessonsRemaining` is already 0, no-op.
   *
   * MUST run inside an outer Serializable transaction; the `tx` parameter
   * is required.
   */
  async refundPrepaidToBalance(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      reason?: string;
      // Optional: cascade-triggered refunds may have no acting user.
      performedById?: number;
    },
  ): Promise<{ refunded: number; lessons: number } | null> {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        id: true,
        studentId: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            branchId: true,
            companyId: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });
    if (!enrollment) return null;

    const lessons = enrollment.prepaidLessonsRemaining;
    if (lessons <= 0) return null;

    // Releasing every remaining lesson IS the general release with the counter
    // run down to nothing, so it goes through the same path — the two used to
    // be separate copies of the same arithmetic.
    return this.releasePrepaidLessons(tx, {
      enrollmentId: params.enrollmentId,
      lessons,
      reason:
        params.reason ??
        'Yozilishdan chiqishda qaytarilmagan dars uchun balans tiklash',
      performedById: params.performedById,
    });
  }

  /**
   * Cancel `lessons` prepaid lessons and put their money back on the balance.
   *
   * Differs from `refundPrepaidWithOverride` in the one way that matters here:
   * that method ZEROES the counter, because on FROZEN whatever is left over is
   * forfeited. This one decrements by exactly `lessons`, for the case where the
   * student stays in the group and is only taking part of their money back — the
   * lessons they did not pay for are cancelled, the rest stay theirs.
   *
   * MUST run inside an outer Serializable transaction.
   */
  async releasePrepaidLessons(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      lessons: number;
      reason?: string;
      performedById?: number;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<{ refunded: number; lessons: number } | null> {
    if (params.lessons < 0) {
      throw new BadRequestException(
        "Bekor qilinadigan dars soni manfiy bo'lishi mumkin emas",
      );
    }
    if (params.lessons === 0) return null;

    const enrollment = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        id: true,
        studentId: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            branchId: true,
            companyId: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });
    if (!enrollment) return null;

    if (params.lessons > enrollment.prepaidLessonsRemaining) {
      throw new BadRequestException(
        `Faqat ${enrollment.prepaidLessonsRemaining} ta oldindan to'langan darsni bekor qilish mumkin`,
      );
    }

    const refundAmount = await this.prepaidRefundValue(
      tx,
      enrollment.id,
      enrollment.group.course,
      params.lessons,
    );

    if (refundAmount > 0) {
      await this.transactionsService.createAdjustment(
        {
          studentId: enrollment.studentId,
          amount: refundAmount,
          description:
            params.reason ??
            `${params.lessons} ta oldindan to'langan dars bekor qilindi`,
          branchId: enrollment.group.branchId,
          companyId: enrollment.group.companyId,
          performedById: params.performedById,
          ...(params.metadata !== undefined && { metadata: params.metadata }),
        },
        tx,
      );
    }

    await tx.enrollment.update({
      where: { id: params.enrollmentId },
      data: { prepaidLessonsRemaining: { decrement: params.lessons } },
    });

    return { refunded: refundAmount, lessons: params.lessons };
  }

  /**
   * FROZEN refund with admin override.
   *
   * On status FROZEN the system auto-suggests refunding `prepaidLessonsRemaining`
   * lessons to balance. The admin may edit that count in the change-status
   * dialog:
   *
   * - `overrideLessons === currentPrepaid` (or undefined) → identical to
   *   `refundPrepaidToBalance`. Just credit balance and zero the counter.
   * - `overrideLessons < currentPrepaid` → refund only the override amount.
   *   The remaining prepaid is forfeited (zeroed) — admin used judgement
   *   that the student doesn't deserve those lessons back.
   * - `overrideLessons > currentPrepaid` → admin wants to refund some
   *   already-attended lessons too. We reverse the most recent N
   *   LESSON_CONSUMPTION rows (oldest-first walk would be wrong — admin's
   *   intent is "the last few don't count"), reverse their salary
   *   accruals (so the teacher's payslip shrinks accordingly), and flip
   *   those Attendance rows to EXCUSED so nobody re-counts them as
   *   attended. THEN credit the full `overrideLessons * perLessonCost`.
   *
   * Closed-period guard inside SalaryAccrualService rejects accrual reverses
   * for lessons whose payslip is APPROVED/PAID — surface that error verbatim.
   *
   * MUST run inside an outer Serializable transaction.
   */
  async refundPrepaidWithOverride(
    tx: Prisma.TransactionClient,
    params: {
      enrollmentId: string;
      performedById: number;
      overrideLessons?: number;
      reason?: string;
    },
  ): Promise<{
    refunded: number;
    lessons: number;
    extraReversed: number;
  } | null> {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: params.enrollmentId },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            branchId: true,
            companyId: true,
            course: { select: { price: true, lessonPaymentCount: true } },
            teachers: { select: { teacherId: true } },
          },
        },
      },
    });
    if (!enrollment) return null;

    const currentPrepaid = enrollment.prepaidLessonsRemaining;
    const targetLessons = params.overrideLessons ?? currentPrepaid;

    if (targetLessons < 0) {
      throw new BadRequestException(
        "Qaytariladigan dars soni manfiy bo'lishi mumkin emas",
      );
    }
    if (targetLessons === 0 && currentPrepaid === 0) {
      return null;
    }

    let extraReversed = 0;

    if (targetLessons > currentPrepaid) {
      extraReversed = targetLessons - currentPrepaid;

      // Most recent first — admin's intent is "the last N attended lessons
      // shouldn't count". DESC order on createdAt matches the LESSON_DEDUCTION
      // batch chronology since consumption rows are written sequentially as
      // attendance flows in.
      const consumptions = await tx.transaction.findMany({
        where: {
          enrollmentId: enrollment.id,
          type: TransactionType.LESSON_CONSUMPTION,
          reversedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: extraReversed,
        select: { id: true, attendanceId: true },
      });

      if (consumptions.length < extraReversed) {
        throw new BadRequestException(
          `Faqat ${currentPrepaid + consumptions.length} ta darsni qaytarib bo'ladi (jami ${currentPrepaid} ta prepaid + ${consumptions.length} ta o'tilgan dars)`,
        );
      }

      for (const c of consumptions) {
        // Reverse the audit row first — sets reversedAt on the original
        // and writes the inverse entry. Idempotent at the partial-unique
        // index level: a re-run would fail to find a matching unreversed
        // row and short-circuit.
        await this.transactionsService.reverseTransaction(
          c.id,
          {
            performedById: params.performedById,
            reason:
              params.reason ??
              "FROZEN: admin tahriri bilan qo'shimcha qaytarish",
          },
          tx,
        );

        if (!c.attendanceId) continue;

        const att = await tx.attendance.findUnique({
          where: { id: c.attendanceId },
          select: { date: true, groupId: true, studentId: true },
        });
        if (!att) continue;

        // Reverse accrual for every teacher attached to the group at
        // billing time. The accrual service is the closed-period gate —
        // if any of these lessons fall inside an APPROVED/PAID salary
        // payment window it throws and the whole tx rolls back.
        for (const t of enrollment.group.teachers) {
          await this.salaryAccrualService.reverseAccrualForAttendance({
            teacherId: t.teacherId,
            studentId: att.studentId,
            groupId: att.groupId,
            lessonDate: att.date,
            reversedById: params.performedById,
            reversalReason: 'FROZEN: admin override',
            tx,
          });
        }

        // Flip the attendance to EXCUSED so neither stats nor downstream
        // billing re-runs treat it as attended. We deliberately don't
        // delete the row — the audit history (markedById, markedMethod)
        // stays available for review.
        await tx.attendance.update({
          where: { id: c.attendanceId },
          data: { status: AttendanceStatus.EXCUSED },
        });
      }
    }

    const refundAmount = await this.prepaidRefundValue(
      tx,
      enrollment.id,
      enrollment.group.course,
      targetLessons,
    );

    if (refundAmount > 0) {
      await this.transactionsService.createAdjustment(
        {
          studentId: enrollment.studentId,
          amount: refundAmount,
          description:
            params.reason ??
            `Muzlatish: ${targetLessons} ta dars uchun pul balansga qaytarildi`,
          branchId: enrollment.group.branchId,
          companyId: enrollment.group.companyId,
          performedById: params.performedById,
        },
        tx,
      );
    }

    await tx.enrollment.update({
      where: { id: params.enrollmentId },
      data: { prepaidLessonsRemaining: 0 },
    });

    return {
      refunded: refundAmount,
      lessons: targetLessons,
      extraReversed,
    };
  }
}
