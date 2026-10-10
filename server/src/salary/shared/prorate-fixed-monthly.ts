const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tashkent calendar day index (days since epoch in Tashkent local time). */
function tashkentDayIndex(d: Date): number {
  return Math.floor((d.getTime() + TASHKENT_OFFSET_MS) / DAY_MS);
}

/** Minimal FIXED_MONTHLY version shape needed for proration. */
export interface FixedMonthlyVersion {
  value: number;
  effectiveFrom: Date;
  /** Exclusive end (next version's effectiveFrom, or the deactivation cutoff). */
  effectiveTo: Date | null;
}

/** The period as Tashkent day indexes: first day, exclusive end, length. */
function periodDays(periodStart: Date, periodEnd: Date) {
  const periodStartDay = tashkentDayIndex(periodStart);
  // periodEnd is the last ms of the last day → +1 gives the exclusive end day.
  const periodEndExclusiveDay = tashkentDayIndex(periodEnd) + 1;
  return {
    periodStartDay,
    periodEndExclusiveDay,
    cycleDays: periodEndExclusiveDay - periodStartDay,
  };
}

/** Days of the period one version is active (`[effectiveFrom, effectiveTo)`). */
function overlapDays(
  v: FixedMonthlyVersion,
  periodStartDay: number,
  periodEndExclusiveDay: number,
): number {
  const vStartDay = tashkentDayIndex(v.effectiveFrom);
  const vEndExclusiveDay = v.effectiveTo
    ? tashkentDayIndex(v.effectiveTo)
    : periodEndExclusiveDay;
  return (
    Math.min(vEndExclusiveDay, periodEndExclusiveDay) -
    Math.max(vStartDay, periodStartDay)
  );
}

/**
 * Day-based proration of a FIXED_MONTHLY salary over a payroll period.
 *
 * For every FIXED_MONTHLY version that overlaps `[periodStart, periodEnd]`, the
 * contribution is `round(value × overlapDays / cycleDays)`; the total is the
 * sum. `[effectiveFrom, effectiveTo)` is treated as a **half-open** interval
 * (Tashkent calendar days) so a rate change on day D (the old version's
 * `effectiveTo` = the new version's `effectiveFrom`) never double-counts day D.
 *
 * This single formula covers all partial-month cases uniformly:
 *  - mid-cycle **hire**  → `effectiveFrom` starts inside the period
 *  - mid-cycle **leave** → `effectiveTo` (set on deactivation) ends inside it
 *  - **rate change**     → two versions, each prorated over its own days
 *
 * A single open version spanning the whole period degenerates to the full
 * `value` (overlapDays === cycleDays), i.e. no proration for a full month.
 *
 * MUST be used by BOTH the report (`SalaryStaffMonthlyService`) and the actual
 * payroll run (`SalaryCalculationService`) so the shown and paid figures agree.
 *
 * @param versions FIXED_MONTHLY versions only (caller filters by salaryType).
 * @param periodStart inclusive UTC instant of the period's first day @ 00:00 TSH.
 * @param periodEnd   inclusive UTC instant of the period's last ms.
 */
export function prorateFixedMonthly(
  versions: FixedMonthlyVersion[],
  periodStart: Date,
  periodEnd: Date,
): number {
  const { periodStartDay, periodEndExclusiveDay, cycleDays } = periodDays(
    periodStart,
    periodEnd,
  );
  if (cycleDays <= 0) return 0;

  let total = 0;
  for (const v of versions) {
    const days = overlapDays(v, periodStartDay, periodEndExclusiveDay);
    if (days > 0) total += Math.round((v.value * days) / cycleDays);
  }
  return total;
}

/**
 * How many of the period's days a FIXED_MONTHLY salary is on — the «d/D kun»
 * the payroll page prints beside a prorated amount. Same day arithmetic as
 * `prorateFixedMonthly` (it shares `periodDays` and `overlapDays`), so the
 * days shown are the days the amount was prorated over.
 */
export function fixedMonthlyCoverage(
  versions: FixedMonthlyVersion[],
  periodStart: Date,
  periodEnd: Date,
): { activeDays: number; cycleDays: number } {
  const { periodStartDay, periodEndExclusiveDay, cycleDays } = periodDays(
    periodStart,
    periodEnd,
  );
  if (cycleDays <= 0) return { activeDays: 0, cycleDays: 0 };

  let activeDays = 0;
  for (const v of versions) {
    activeDays += Math.max(
      0,
      overlapDays(v, periodStartDay, periodEndExclusiveDay),
    );
  }
  // Two versions that overlap (they should not) must not report more days than
  // the period has.
  return { activeDays: Math.min(activeDays, cycleDays), cycleDays };
}
