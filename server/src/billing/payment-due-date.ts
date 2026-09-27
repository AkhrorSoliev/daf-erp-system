/**
 * The day a month's payment is due: the student's 2nd lesson of the month
 * (contract as rewritten on 24.09.2026 — «oyning 2-darsigacha», for every
 * month and for a new student's first month alike). Null when the student
 * has fewer than two lessons that month: there is no 2nd lesson to name.
 */
export function paymentDueDate(lessonDates: readonly string[]): string | null {
  return [...lessonDates].sort()[1] ?? null;
}
