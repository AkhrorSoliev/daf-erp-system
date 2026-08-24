import { EnrollmentStatus, Prisma, TransactionType } from '@prisma/client';

/**
 * Which enrollment a lesson was CHARGED to.
 *
 * WHY THIS IS NOT A LOOKUP BY (student, group): a student can hold more than
 * one live enrollment in the same group. There is no unique constraint
 * preventing it and production carries 44 such pairs, most of them one ACTIVE
 * beside one DROPPED — the ordinary shape of someone who left a group and came
 * back.
 *
 * Reversing a lesson writes to that enrollment: `prepaidLessonsRemaining += 1`,
 * or a step back in `cycleLessonIndex`. The cancel and reschedule paths used to
 * find it with `findFirst({ groupId, studentId, deletedAt: null })` — no status
 * filter and, more importantly, NO ORDERING, so which row came back was
 * whatever the database felt like returning. Credit the prepaid unit to the
 * dropped enrollment and the student silently loses a lesson they paid for;
 * credit it to the wrong live one and they gain a free lesson somewhere else.
 *
 * The exact answer is already recorded. Billing a lesson writes a
 * `LESSON_CONSUMPTION` (and, on the debtor path, a `LESSON_DEDUCTION`) carrying
 * BOTH `attendanceId` and `enrollmentId`. So the question "which enrollment was
 * charged" has a stored answer and does not need to be inferred at all.
 *
 * The fallback only runs when nothing was ever billed for that attendance. In
 * that case `reverse()` never reads the id at all — it touches the enrollment
 * only inside `if (consumption)` — so the value is there to answer a different
 * question: is this student in the group, i.e. is there anything to reverse?
 * It still picks deterministically (ACTIVE, else newest) rather than leaving it
 * to the database.
 *
 * Note the deliberate absence of a `status` filter on the fallback. A lesson
 * charged while the enrollment was ACTIVE must still be refundable after the
 * student drops — filtering to ACTIVE would skip the reversal and leave them
 * paying for a cancelled lesson. Billing requires ACTIVE (`attendance-save`);
 * UNDOING a charge must not.
 */
export async function resolveBilledEnrollmentId(
  tx: Prisma.TransactionClient,
  params: { attendanceId: string; studentId: number; groupId: string },
): Promise<string | null> {
  const billed = await tx.transaction.findFirst({
    where: {
      attendanceId: params.attendanceId,
      type: {
        in: [
          TransactionType.LESSON_CONSUMPTION,
          TransactionType.LESSON_DEDUCTION,
        ],
      },
      enrollmentId: { not: null },
    },
    // Newest first, and live rows before reversed ones: a lesson that was
    // un-marked and re-marked can carry both, and the standing charge is the
    // one being undone.
    orderBy: [{ reversedAt: 'asc' }, { createdAt: 'desc' }],
    select: { enrollmentId: true },
  });
  if (billed?.enrollmentId) return billed.enrollmentId;

  // One query, decided in code. An earlier version issued a second query when
  // the first row was not ACTIVE, which made the answer depend on the enum's
  // declaration order and on how many times the caller's mock had been asked.
  const candidates = await tx.enrollment.findMany({
    where: {
      groupId: params.groupId,
      studentId: params.studentId,
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, status: true },
    take: 10,
  });

  const active = candidates.find((e) => e.status === EnrollmentStatus.ACTIVE);
  return active?.id ?? candidates[0]?.id ?? null;
}

/**
 * Which payment funded a lesson — the `LESSON_DEDUCTION` its accruals hang off.
 *
 * A salary accrual is only written when the lesson is backed by a paid
 * deduction, and `reverseLessonDeduction` reverses EVERY accrual pointing at
 * that deduction. So a wrong link here is not cosmetic: correcting one payment
 * would reverse a teacher's pay for a lesson that payment never funded, and
 * leave standing the pay for one it did.
 *
 * The substitute-teacher sync used to find it by date:
 *
 *   createdAt: { lte: p.date }        // p.date is UTC MIDNIGHT of the lesson
 *
 * A deduction is written when attendance is marked, i.e. DURING the lesson day
 * — 09:30, 10:05, 11:10. Every one of those is after midnight, so the funding
 * deduction was excluded by definition and the query fell back to an older
 * batch. Measured on production: 27 of 45 accruals written through this path
 * point at the wrong payment. None was lost; all are mis-wired.
 *
 * Neither the date nor the clock is needed. Two recorded answers, in order:
 *
 *   1. An accrual already on this attendance. Billing wrote it with the
 *      coverage it actually used, so it is the answer, not an approximation.
 *      Reversed rows count — reversal sets `reversedAt`, it does not erase the
 *      link, and a substitute replacing a teacher inherits the same funding.
 *   2. Failing that, the newest live deduction on the enrollment as of the
 *      moment the lesson was CONSUMED. Anchoring to the consumption's own
 *      timestamp is what "the batch the student was consuming" means; a
 *      calendar bound only ever approximated it.
 */
export async function resolveFundingDeductionId(
  tx: Prisma.TransactionClient,
  params: {
    attendanceId: string;
    enrollmentId: string;
    consumedAt: Date;
  },
): Promise<string | null> {
  const priorAccrual = await tx.salaryAccrual.findFirst({
    where: {
      attendanceId: params.attendanceId,
      deductionTransactionId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    select: { deductionTransactionId: true },
  });
  if (priorAccrual?.deductionTransactionId) {
    return priorAccrual.deductionTransactionId;
  }

  const deduction = await tx.transaction.findFirst({
    where: {
      enrollmentId: params.enrollmentId,
      type: TransactionType.LESSON_DEDUCTION,
      reversedAt: null,
      createdAt: { lte: params.consumedAt },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return deduction?.id ?? null;
}
