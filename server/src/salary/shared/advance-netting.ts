/**
 * The one walk over a person's unsettled TEACHER_ADVANCE expenses (ADR-0081).
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

/** The walk's order: `createdAt`, then `id`. Rows that list the netted advances sort by it too. */
export function byWalkOrder(
  a: { id: string; createdAt: Date },
  b: { id: string; createdAt: Date },
): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
}

export function planAdvanceNetting(
  pending: PendingAdvance[],
  grossAmount: number,
  periodEndDateExclusive: Date,
): AdvanceNettingPlan {
  const end = periodEndDateExclusive.getTime();
  const ordered = pending
    .filter((a) => a.date.getTime() < end)
    .sort(byWalkOrder);
  const settle: string[] = [];
  let total = 0;
  for (const a of ordered) {
    if (total + a.amount > grossAmount) break;
    settle.push(a.id);
    total += a.amount;
  }
  return { settle, total };
}

/**
 * The advances a salary REPORT row shows for a month without a payment (spec
 * §3). The open month is not capped: its earnings are still growing, and
 * capping by today's partial figure would show 0 for an advance the month-end
 * payout will take — but only for someone who can still earn this month
 * (`canStillEarn`): the cron writes a payment only for a person with accruals,
 * so an advance of a departed, lesson-less teacher is never netted and must
 * not be shown as one that will be. Everyone else, and a past month without a
 * payment (the hours before the cron), shows exactly what the cron will net.
 */
export function planShownAdvances(
  pending: PendingAdvance[],
  base: number,
  nextMonthStart: Date,
  month: { isOpenMonth: boolean; canStillEarn: boolean },
): AdvanceNettingPlan {
  const uncapped = month.isOpenMonth && month.canStillEarn;
  return planAdvanceNetting(
    pending,
    uncapped ? Number.POSITIVE_INFINITY : Math.max(0, base),
    nextMonthStart,
  );
}
