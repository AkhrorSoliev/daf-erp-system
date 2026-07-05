/**
 * Pure salary-math helpers shared between the payroll sweep and the monthly
 * report. Mirrors `SalaryAccrualService.findActiveVersion` + its per-lesson
 * amount formula, but in-memory (no per-lesson DB call) so a bulk sweep over a
 * whole month's attendances resolves each rate from pre-loaded version rows.
 *
 * These are the SAME formulas the read-only forecast script
 * (`scripts/forecast-full-salary-topup.ts`) uses, extracted so production code
 * and the forecast stay in lock-step.
 */

/** A salary config version row, trimmed to what the resolver needs. */
export interface RateVersion {
  salaryType: string; // SalaryType — 'PERCENTAGE' | 'FIXED_PER_STUDENT' | 'FIXED_MONTHLY'
  value: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/**
 * Per-lesson accrual for one student, by salary type. Identical to
 * `SalaryAccrualService.createAccrual`'s amount branch:
 *  - PERCENTAGE        → round(perLessonCost * value / 100)
 *  - FIXED_PER_STUDENT → round(value / lessonPaymentCount)   (value is per-cycle)
 *  - FIXED_MONTHLY     → 0 (flat salary, not per-lesson)
 */
export function perLessonAccrual(
  version: RateVersion,
  perLessonCost: number,
  lessonPaymentCount: number,
): number {
  if (version.salaryType === 'PERCENTAGE') {
    return Math.round((perLessonCost * version.value) / 100);
  }
  if (version.salaryType === 'FIXED_PER_STUDENT') {
    return lessonPaymentCount > 0
      ? Math.round(version.value / lessonPaymentCount)
      : version.value;
  }
  return 0; // FIXED_MONTHLY
}

/**
 * The version active on `at` (the lesson date) — the latest one whose
 * [effectiveFrom, effectiveTo) window contains `at`. Returns null when no
 * version covers the date (the config-gap case, e.g. May lessons whose config
 * only became effective in June).
 */
export function pickActiveVersion(
  versions: RateVersion[] | undefined,
  at: Date,
): RateVersion | null {
  if (!versions || versions.length === 0) return null;
  const eligible = versions.filter(
    (v) => v.effectiveFrom <= at && (v.effectiveTo == null || v.effectiveTo > at),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (a.effectiveFrom >= b.effectiveFrom ? a : b));
}
