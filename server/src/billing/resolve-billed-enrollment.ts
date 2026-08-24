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
