/**
 * One student's price for ONE lesson.
 *
 * The three-step fallback is the centre's actual pricing policy, and it was
 * copy-pasted into the revenue forecast and the Telegram daily report. Both
 * copies are gone; this is the only implementation.
 *
 *   1. an ACTIVE Contract's negotiated total, so a chegirmali shartnoma is
 *      priced exactly as agreed;
 *   2. course price with the student's `discountPercent` applied — the modern
 *      discount lever, honoured whenever no contract is on file;
 *   3. bare course price, defensive fallback for a missing discount.
 *
 * Note the deliberate asymmetry with `getRecognizedRevenue`'s legacy fallback:
 * that one prices a metadata-less LESSON_CONSUMPTION row at the bare course
 * price with NO discount, because it is reconstructing what was actually
 * billed rather than what the student would be charged today. Do not "unify"
 * the two — see `reports-expectation.service.ts`.
 */
export interface PerLessonPriceInput {
  course: { price: number; lessonPaymentCount: number };
  /** `Student.discountPercent`; null/undefined means no discount. */
  discountPercent: number | null | undefined;
  /** ACTIVE `Contract.totalAmount` for this student+group, else null. */
  contractTotalAmount: number | null | undefined;
}

export function perLessonPrice({
  course,
  discountPercent,
  contractTotalAmount,
}: PerLessonPriceInput): number {
  const lpc = course.lessonPaymentCount || 12;
  if (contractTotalAmount != null) {
    return Math.round(contractTotalAmount / lpc);
  }
  const full = Math.round(course.price / lpc);
  const clamped = Math.max(0, Math.min(100, discountPercent ?? 0));
  return Math.round((full * (100 - clamped)) / 100);
}
