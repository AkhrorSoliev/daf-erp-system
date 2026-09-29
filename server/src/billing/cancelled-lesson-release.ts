import { AttendanceStatus, MonthlyChargeStatus, Prisma } from '@prisma/client';
import type { TransactionsWriteService } from '../transactions/transactions-write.service';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { cancelledLessonRelease } from './departure-release';

export interface CancelledLessonReleaseResult {
  /** Students whose money for the lesson came back. */
  students: number;
  refunded: number;
}

/**
 * A lesson the centre cancelled is given back to every monthly charge that
 * billed it — today, to the balance (ADR-0053).
 *
 * A monthly charge bills the month's lesson days in advance. Cancelling a
 * day used to reach only students whose attendance was already marked: their
 * row turned EXCUSED and `excusedLessons` credited ONE lesson on NEXT month's
 * charge. A student with no mark that day got nothing — and a lesson the
 * centre simply did not hold is exactly the day nobody marks (September
 * 2026: four students of one group paid for two lessons that never
 * happened). A student who has since left or changed group has no next month
 * in that group either, so even the credit never arrived.
 *
 * So the cancellation releases the day from each charge now: its price (the
 * departure rule: discounted, capped at what the charge still holds) goes back
 * as an ADJUSTMENT tagged `monthly-release`, the day joins `frozenOutDates`
 * (the charge no longer bills it — revenue and teacher pay read that), and a
 * student whose day was counted EXCUSED gets that next-month credit taken back,
 * because the money is already home. `restoreChargeForReturn` skips cancelled
 * days, so an unfreeze does not bill the day again.
 *
 * Runs inside the cancellation's transaction. Idempotent per charge.
 */
export async function releaseCancelledLesson(
  tx: Prisma.TransactionClient,
  transactionsWrite: TransactionsWriteService,
  params: {
    groupId: string;
    /** The lesson's `@db.Date` value. */
    date: Date;
    companyId: number;
    cancellationId: string;
    reason: string;
    performedById?: number;
  },
): Promise<CancelledLessonReleaseResult> {
  const day = tashkentDateStr(params.date);
  const periodYear = Number(day.slice(0, 4));
  const periodMonth = Number(day.slice(5, 7));

  const charges = await tx.enrollmentMonthlyCharge.findMany({
    where: {
      groupId: params.groupId,
      companyId: params.companyId,
      periodYear,
      periodMonth,
      status: MonthlyChargeStatus.CHARGED,
      coveredDates: { has: day },
    },
    select: {
      id: true,
      enrollmentId: true,
      studentId: true,
      branchId: true,
      coveredDates: true,
      frozenOutDates: true,
      perLessonCost: true,
      discountPercent: true,
      chargedAmount: true,
      excusedLessons: true,
    },
  });
  const result: CancelledLessonReleaseResult = { students: 0, refunded: 0 };
  if (charges.length === 0) return result;

  // Whose day counts as EXCUSED (the cancellation just flipped it, or it was
  // excused before): `excusedLessons` already promises them a credit next
  // month for it.
  const excused = await tx.attendance.findMany({
    where: {
      groupId: params.groupId,
      date: params.date,
      status: AttendanceStatus.EXCUSED,
    },
    select: { studentId: true },
  });
  const excusedStudents = new Set(excused.map((a) => a.studentId));
  const dayLabel = `${day.slice(8, 10)}.${day.slice(5, 7)}`;

  for (const charge of charges) {
    const release = cancelledLessonRelease(
      {
        coveredDates: charge.coveredDates,
        frozenOutDates: charge.frozenOutDates,
        perLessonCost: charge.perLessonCost,
        discountPercent: charge.discountPercent,
        chargedAmount: charge.chargedAmount,
      },
      day,
    );
    if (!release) continue;
    const frozenOutAfter = release.frozenOutAfter ?? [];

    await transactionsWrite.createAdjustment(
      {
        studentId: charge.studentId,
        amount: release.amount,
        companyId: params.companyId,
        branchId: charge.branchId,
        description: `${params.reason} — ${dayLabel} darsi bekor qilindi, 1 dars puli qaytarildi`,
        performedById: params.performedById,
        // The payment statement folds it into the month like any release.
        metadata: {
          kind: 'monthly-release',
          enrollmentId: charge.enrollmentId,
          period: `${periodYear}-${String(periodMonth).padStart(2, '0')}`,
          lessons: 1,
          dates: [day],
          cancellationId: params.cancellationId,
        },
      },
      tx,
    );

    const takeBackCredit =
      excusedStudents.has(charge.studentId) && charge.excusedLessons > 0;
    await tx.enrollmentMonthlyCharge.update({
      where: { id: charge.id },
      data: {
        coveredLessons: charge.coveredDates.length - frozenOutAfter.length,
        chargedAmount: charge.chargedAmount - release.amount,
        frozenOutDates: frozenOutAfter,
        ...(takeBackCredit ? { excusedLessons: { decrement: 1 } } : {}),
      },
    });
    result.students += 1;
    result.refunded += release.amount;
  }
  return result;
}
