/**
 * The one walk over a person's unsettled TEACHER_ADVANCE expenses (ADR-0080).
 * The payroll cron settles exactly `settle`; the salary report shows exactly
 * `total` as «Avans (oylikdan ushlanadi)», so the screen equals the deduction.
 *
 * Only advances dated before the period's exclusive end count (an advance given
 * on the 1st belongs to the new month even if the cron has not run yet). Walk in
 * `createdAt` order (id breaks ties) and stop at the first one that does not fit
 * into what is left of `grossAmount`; the rest roll over to the next month.
 * `Expense.date` is `@db.Date` (UTC midnight), so `periodEndDateExclusive` must
 * be the `@db.Date`-shaped bound, not a Tashkent-shifted instant.
 */
export interface PendingAdvance {
  id: string;
  amount: number;
  date: Date;
  createdAt: Date;
}
export interface AdvanceNettingPlan {
  settle: string[];
  total: number;
}

export function planAdvanceNetting(
  pending: PendingAdvance[],
  grossAmount: number,
  periodEndDateExclusive: Date,
): AdvanceNettingPlan {
  const end = periodEndDateExclusive.getTime();
  const ordered = pending
    .filter((a) => a.date.getTime() < end)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  const settle: string[] = [];
  let total = 0;
  for (const a of ordered) {
    if (total + a.amount > grossAmount) break;
    settle.push(a.id);
    total += a.amount;
  }
  return { settle, total };
}
