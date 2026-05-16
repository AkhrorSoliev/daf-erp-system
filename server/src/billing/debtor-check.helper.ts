/**
 * Pure helpers shared across attendance, billing, and debtors services.
 *
 * A student is a "debtor" when their balance has actually gone negative —
 * the billing layer now deducts the per-lesson cost on every attended
 * lesson, so a negative balance is the canonical signal that one or more
 * past lessons remain uncovered. (Previously a positive but small balance
 * was flagged as "debtor"; that ceiling-at-one-lesson display masked the
 * real accumulating debt and is the bug we are fixing.)
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
  _coursePrice: number,
  _lessonPaymentCount: number | null | undefined,
): boolean {
  return studentBalance < 0;
}

/**
 * The student's actual debt — the absolute value of a negative balance.
 * Always >= 0; a non-negative balance means no debt.
 */
export function calculateDebtAmount(
  studentBalance: number,
  _coursePrice: number,
  _lessonPaymentCount: number | null | undefined,
): number {
  return studentBalance < 0 ? -studentBalance : 0;
}
