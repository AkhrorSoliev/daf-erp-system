/**
 * Per-lesson pricing that adds up to the cycle price exactly.
 *
 * A course price rarely divides by its lesson count: 400 000 / 12 = 33 333.33.
 * Rounding each lesson on its own (`Math.round(price / count)`) makes a cycle
 * cost 399 996 — four so'm short — and the opposite way round for prices that
 * round up (500 000 / 12 → 41 667 × 12 = 500 004, four so'm over). Charged
 * lesson by lesson to a debtor, that error accumulates on the balance until the
 * student shows up owing (or being owed) a few so'm nobody agreed to. On
 * production it left 117 residual balances, 104 of them under 50 so'm, and
 * those under-50 debts are what made the debtor count look inflated.
 *
 * The rule here: every lesson keeps the familiar rounded price, and the LAST
 * lesson of the cycle absorbs whatever is left over — 11 lessons at 33 333 and
 * a final one at 33 337. Spreading the remainder evenly across the cycle would
 * also close the books, but it makes scattered lessons cost 33 334 for no
 * reason a student could be told; a single settling lesson is explainable.
 *
 * These are pure functions on purpose: the billing service runs inside a
 * Serializable transaction with row locks and side effects, and the arithmetic
 * that decides what a student is charged should be testable without any of it.
 */

/** The familiar per-lesson figure — every lesson but the cycle's last. */
export function baseLessonPrice(
  cycleCost: number,
  lessonCount: number,
): number {
  if (lessonCount <= 0 || cycleCost <= 0) return 0;
  return Math.round(cycleCost / lessonCount);
}

/**
 * What the `index`-th lesson of a cycle costs (0-based).
 *
 * `index` wraps: lesson 12 of a 12-lesson course is lesson 0 of the next cycle,
 * so a caller can keep one ever-incrementing counter and never reset it.
 */
export function lessonPriceAt(
  cycleCost: number,
  lessonCount: number,
  index: number,
): number {
  if (lessonCount <= 0 || cycleCost <= 0) return 0;
  const base = baseLessonPrice(cycleCost, lessonCount);
  const i = ((Math.trunc(index) % lessonCount) + lessonCount) % lessonCount;
  return i === lessonCount - 1 ? cycleCost - base * (lessonCount - 1) : base;
}

/**
 * What the first `lessons` lessons of a cycle cost in total.
 *
 * Clamped to `[0, lessonCount]`: a caller asking for more than a cycle holds
 * gets the cycle price rather than an extrapolation, because the next lesson
 * belongs to the NEXT cycle and starts its own count.
 */
export function cycleCostFor(
  cycleCost: number,
  lessonCount: number,
  lessons: number,
): number {
  if (lessonCount <= 0 || cycleCost <= 0) return 0;
  const n = Math.min(Math.max(Math.trunc(lessons), 0), lessonCount);
  return n === lessonCount
    ? cycleCost
    : baseLessonPrice(cycleCost, lessonCount) * n;
}

/**
 * How many lessons of a cycle `budget` covers, priced as above.
 *
 * The partial-refill branch may NOT overdraw, and the cycle's last lesson can
 * cost more than the base price — so `floor(budget / base)` is not safe on its
 * own once it reaches the final lesson. This walks the cumulative price instead.
 */
export function lessonsAffordable(
  cycleCost: number,
  lessonCount: number,
  budget: number,
): number {
  if (lessonCount <= 0 || cycleCost <= 0 || budget <= 0) return 0;
  const base = baseLessonPrice(cycleCost, lessonCount);
  if (base <= 0) return 0;
  // Everything up to the last lesson is linear, so the guess is exact there;
  // the final lesson is the only one that needs the cumulative check.
  const n = Math.min(lessonCount - 1, Math.floor(budget / base));
  return budget >= cycleCost ? lessonCount : Math.max(0, n);
}
