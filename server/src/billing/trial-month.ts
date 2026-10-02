import {
  EnrollmentStatus,
  MonthlyChargeStatus,
  Prisma,
  TransactionType,
} from '@prisma/client';

/**
 * Students whose lesson on `day` in `groupId` a trial departure gave back
 * (contract 3.5, ADR-0048 §3): the month's money went back to the student and
 * the teacher's pay for it was reversed (`reverseTrialAccruals`). Nobody pays
 * a teacher for such a lesson, and the centre's top-up never fronts it (its
 * new-student gate), so a path that writes pay for a lesson already held must
 * skip these students.
 *
 * Only a departed enrollment's charge counts: an ACTIVE student unfrozen on a
 * lesson day attends it free (the return day stays frozen out) and the
 * teacher is paid for it. A quality claim gives the whole month back too but
 * keeps the teacher's pay (ADR-0044); the refund's ledger row tells the two
 * apart, and a month given back without one is taken for a trial.
 */
export async function trialMonthStudents(
  tx: Prisma.TransactionClient,
  params: { groupId: string; day: string; studentIds: readonly number[] },
): Promise<Set<number>> {
  if (params.studentIds.length === 0) return new Set();
  const givenBack = await tx.enrollmentMonthlyCharge.findMany({
    where: {
      groupId: params.groupId,
      studentId: { in: [...params.studentIds] },
      periodYear: Number(params.day.slice(0, 4)),
      periodMonth: Number(params.day.slice(5, 7)),
      status: MonthlyChargeStatus.CHARGED,
      frozenOutDates: { has: params.day },
      enrollment: { status: { not: EnrollmentStatus.ACTIVE } },
    },
    select: { enrollmentId: true, studentId: true },
  });
  if (givenBack.length === 0) return new Set();

  const releases = await tx.transaction.findMany({
    where: {
      studentId: { in: givenBack.map((c) => c.studentId) },
      type: TransactionType.ADJUSTMENT,
      reversedAt: null,
      metadata: { path: ['kind'], equals: 'monthly-release' },
    },
    select: { metadata: true },
  });
  const period = params.day.slice(0, 7);
  const qualityClaims = new Set<string>();
  for (const { metadata } of releases) {
    const m = metadata as {
      enrollmentId?: string;
      period?: string;
      policy?: string;
      trialLesson?: boolean;
    } | null;
    if (
      m?.enrollmentId &&
      m.period === period &&
      m.policy === 'QUALITY_CLAIM' &&
      !m.trialLesson
    ) {
      qualityClaims.add(m.enrollmentId);
    }
  }
  return new Set(
    givenBack
      .filter((c) => !qualityClaims.has(c.enrollmentId))
      .map((c) => c.studentId),
  );
}
