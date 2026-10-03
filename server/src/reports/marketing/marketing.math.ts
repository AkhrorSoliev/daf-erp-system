import type { MonthCharges } from '../month-charges';

/**
 * The first month whose new students are really new. In May and June 2026
 * students who were already studying made their first in-system payment, so
 * they look new: those months are «o'tish oylari» (spec B1 §3.2, ADR-0067).
 */
export const FIRST_COHORT_MONTH = '2026-07';

export function isTransitionMonth(month: string): boolean {
  return month < FIRST_COHORT_MONTH;
}

/** One month of the marketing report. */
export interface MarketingMonth {
  month: string;
  /** Σ MARKETING expenses of the month. */
  spend: number;
  /** Students whose first COMPLETED payment fell in the month. */
  newStudents: number;
  /** round(spend ÷ newStudents); null with no new students or in a transition month. */
  cac: number | null;
  /** Σ every COMPLETED payment of the month's new students, to date; null in a transition month. */
  cohortPaid: number | null;
  /** cohortPaid ÷ spend, two decimals; null when nothing was spent or in a transition month. */
  roi: number | null;
  transition: boolean;
}

/** A student's first COMPLETED payment month and everything paid since. */
export interface FirstPayment {
  firstMonth: string;
  paid: number;
}

/** Pure. One row per month of `months`, from the spend and first payments already read. */
export function marketingMonths(input: {
  months: readonly string[];
  spendByMonth: ReadonlyMap<string, number>;
  firstPayments: readonly FirstPayment[];
}): MarketingMonth[] {
  const cohorts = new Map<string, { count: number; paid: number }>();
  for (const p of input.firstPayments) {
    const c = cohorts.get(p.firstMonth) ?? { count: 0, paid: 0 };
    c.count += 1;
    c.paid += p.paid;
    cohorts.set(p.firstMonth, c);
  }
  return input.months.map((month) => {
    const spend = input.spendByMonth.get(month) ?? 0;
    const cohort = cohorts.get(month) ?? { count: 0, paid: 0 };
    const transition = isTransitionMonth(month);
    return {
      month,
      spend,
      newStudents: cohort.count,
      cac:
        transition || cohort.count === 0
          ? null
          : Math.round(spend / cohort.count),
      cohortPaid: transition ? null : cohort.paid,
      roi:
        transition || spend === 0
          ? null
          : Math.round((cohort.paid / spend) * 100) / 100,
      transition,
    };
  });
}

/**
 * «O'quvchi qiymati» ≈ average study months × the month's charge per student.
 * `avgDurationMonths` 0 means nobody left in the month — unknown, not zero.
 * The charge exists from monthly billing on (`charges` null before 2026-09).
 */
export function lifetimeValue(
  avgDurationMonths: number,
  charges: MonthCharges | null,
): { value: number; avgMonths: number; monthlyCharge: number } | null {
  if (!(avgDurationMonths > 0) || !charges || charges.students === 0) {
    return null;
  }
  const monthlyCharge = Math.round(charges.charged / charges.students);
  return {
    value: Math.round(avgDurationMonths * monthlyCharge),
    avgMonths: avgDurationMonths,
    monthlyCharge,
  };
}
