import { applyDiscount, clampDiscount } from './monthly-price';

export interface DepartureReleaseInput {
  /** Tashkent 'YYYY-MM-DD'. The day itself stays held (only d > day is released). */
  departureDay: string;
  /** Dates the charge paid for; empty on rows written before the column existed. */
  coveredDates: readonly string[];
  /** Subset of `coveredDates` already released by an earlier freeze/departure. */
  frozenOutDates: readonly string[];
  coveredLessons: number;
  /** Undiscounted on purpose (teacher pay reads it); the discount is applied here. */
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
  /** Legacy rows only: planned lessons of the month through `departureDay`. */
  lessonsThroughDeparture: number;
}

export interface DepartureRelease {
  lessons: number;
  /** Discounted lesson price × lessons, capped at what the charge still holds. */
  amount: number;
  /** `frozenOutDates` after the release, sorted; null on a legacy row. */
  frozenOutAfter: string[] | null;
}

/**
 * One cancelled lesson back (ADR-0053): the centre did not give the lesson on
 * `day`, so a monthly charge that billed it returns its price — the same price
 * rule as a departure (the discounted lesson price, capped at what the charge
 * still holds). Null when the charge did not bill that day, or already gave it
 * back; a repeat call is therefore a no-op.
 */
export function cancelledLessonRelease(
  input: Pick<
    DepartureReleaseInput,
    | 'coveredDates'
    | 'frozenOutDates'
    | 'perLessonCost'
    | 'discountPercent'
    | 'chargedAmount'
  >,
  day: string,
): DepartureRelease | null {
  if (!input.coveredDates.includes(day)) return null;
  if (input.frozenOutDates.includes(day)) return null;
  const amount = Math.min(
    applyDiscount(input.perLessonCost, clampDiscount(input.discountPercent)),
    input.chargedAmount,
  );
  if (amount <= 0) return null;
  return {
    lessons: 1,
    amount,
    frozenOutAfter: [...input.frozenOutDates, day].sort(),
  };
}

/**
 * The one rule for "the rest of this month's money back". Pure, and shared by
 * `reverseChargeForDeparture` (writes it) and `previewReleaseForDeparture`
 * (shows it), so the freeze dialog cannot quote a figure the freeze does not
 * credit. Set semantics make a repeat call a no-op. Null: nothing to release.
 */
export function departureRelease(
  input: DepartureReleaseInput,
): DepartureRelease | null {
  let lessons: number;
  let frozenOutAfter: string[] | null = null;

  if (input.coveredDates.length > 0) {
    const alreadyOut = new Set(input.frozenOutDates);
    const newlyOut = input.coveredDates.filter(
      (d) => d > input.departureDay && !alreadyOut.has(d),
    );
    lessons = newlyOut.length;
    if (lessons === 0) return null;
    frozenOutAfter = [...input.frozenOutDates, ...newlyOut].sort();
  } else {
    // Legacy row: no dates to diff, so keep the old count-based rule.
    lessons = Math.max(0, input.coveredLessons - input.lessonsThroughDeparture);
    if (lessons === 0) return null;
  }

  const discountedPerLessonCost = applyDiscount(
    input.perLessonCost,
    clampDiscount(input.discountPercent),
  );
  const amount = Math.min(
    lessons * discountedPerLessonCost,
    input.chargedAmount,
  );
  if (amount <= 0) return null;
  return { lessons, amount, frozenOutAfter };
}
