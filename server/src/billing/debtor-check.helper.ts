/**
 * Pure helpers shared across attendance, billing, and debtors services.
 *
 * "Per-lesson cost" is the price of one lesson within a course's prepaid
 * cycle. A student is considered a debtor for a group when their balance
 * cannot cover even one lesson at that group's per-lesson cost — at which
 * point they are hidden from the teacher's attendance view, blocked from
 * QR scans, and surfaced in the admin's debtors panel for follow-up.
 *
 * Kept as pure functions (no DI, no Prisma) so they can be called from any
 * layer — spec tests included — without setup.
 */

const DEFAULT_LESSON_PAYMENT_COUNT = 12;

export function calculatePerLessonCost(
  coursePrice: number,
  lessonPaymentCount: number | null | undefined,
): number {
  const count =
    lessonPaymentCount && lessonPaymentCount > 0
      ? lessonPaymentCount
      : DEFAULT_LESSON_PAYMENT_COUNT;
  return Math.round(coursePrice / count);
}

export function isStudentDebtorForGroup(
  studentBalance: number,
  coursePrice: number,
  lessonPaymentCount: number | null | undefined,
): boolean {
  return studentBalance < calculatePerLessonCost(coursePrice, lessonPaymentCount);
}

/**
 * How much short the student is for one more lesson. Always >= 0 — when the
 * balance covers the lesson, this returns 0 rather than a negative "credit".
 */
export function calculateDebtAmount(
  studentBalance: number,
  coursePrice: number,
  lessonPaymentCount: number | null | undefined,
): number {
  const perLessonCost = calculatePerLessonCost(coursePrice, lessonPaymentCount);
  return Math.max(0, perLessonCost - studentBalance);
}
