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
  const periodStartDay = tashkentDayIndex(periodStart);
  // periodEnd is the last ms of the last day → +1 gives the exclusive end day.
  const periodEndExclusiveDay = tashkentDayIndex(periodEnd) + 1;
  const cycleDays = periodEndExclusiveDay - periodStartDay;
  if (cycleDays <= 0) return 0;

  let total = 0;
  for (const v of versions) {
    const vStartDay = tashkentDayIndex(v.effectiveFrom);
    const vEndExclusiveDay = v.effectiveTo
      ? tashkentDayIndex(v.effectiveTo)
      : periodEndExclusiveDay;

    const overlapStart = Math.max(vStartDay, periodStartDay);
    const overlapEndExclusive = Math.min(vEndExclusiveDay, periodEndExclusiveDay);
    const days = overlapEndExclusive - overlapStart;
    if (days <= 0) continue;

    total += Math.round((v.value * days) / cycleDays);
  }
  return total;
}
