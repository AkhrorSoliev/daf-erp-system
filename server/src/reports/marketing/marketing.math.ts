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

/** One lead source of the asked month: what it cost and what its people paid. */
export interface SourceRow {
  source: string | null;
  /** Σ MARKETING expenses that named this source; 0 for «no source». */
  spend: number;
  leads: number;
  /** People of this source's leads who reached «to'lov». */
  students: number;
  /** students ÷ leads, one decimal (the lead funnel's rate). */
  rate: number;
  /** round(spend ÷ students); null with no spend or no students. */
  cac: number | null;
  /** Σ every COMPLETED payment of those students, to date. */
  paid: number;
  /** paid ÷ spend, two decimals; null when the source cost nothing. */
  roi: number | null;
}

const roiOf = (paid: number, spend: number): number | null =>
  spend > 0 ? Math.round((paid / spend) * 100) / 100 : null;
const cacOf = (spend: number, students: number): number | null =>
  spend > 0 && students > 0 ? Math.round(spend / students) : null;

/**
 * Pure (ADR-0109). One row per lead source of the month's lead cohort, plus a
 * row for a source that was paid for but brought no lead. The «Hammasi» row
 * carries the WHOLE month's spend, so spend that names no source
 * (`unassignedSpend`) is in it and in no source row.
 */
export function sourceRows(input: {
  sources: readonly {
    source: string | null;
    leads: number;
    students: number;
    rate: number;
    studentIds: readonly number[];
  }[];
  /** MARKETING spend of the month by source name. */
  spendBySource: ReadonlyMap<string, number>;
  /** Σ COMPLETED payments to date by student id. */
  paidByStudent: ReadonlyMap<number, number>;
  /** Σ MARKETING spend of the month, named source or not. */
  monthSpend: number;
}): {
  rows: SourceRow[];
  total: Omit<SourceRow, 'source'>;
  unassignedSpend: number;
} {
  const rows: SourceRow[] = input.sources.map((s) => {
    const spend =
      s.source != null ? (input.spendBySource.get(s.source) ?? 0) : 0;
    const paid = s.studentIds.reduce(
      (sum, id) => sum + (input.paidByStudent.get(id) ?? 0),
      0,
    );
    return {
      source: s.source,
      spend,
      leads: s.leads,
      students: s.students,
      rate: s.rate,
      cac: cacOf(spend, s.students),
      paid,
      roi: roiOf(paid, spend),
    };
  });

  const shown = new Set(rows.map((r) => r.source));
  for (const [source, spend] of input.spendBySource) {
    if (shown.has(source) || spend <= 0) continue;
    rows.push({
      source,
      spend,
      leads: 0,
      students: 0,
      rate: 0,
      cac: null,
      paid: 0,
      roi: roiOf(0, spend),
    });
  }

  const attributed = rows.reduce((sum, r) => sum + r.spend, 0);
  const leads = rows.reduce((sum, r) => sum + r.leads, 0);
  const students = rows.reduce((sum, r) => sum + r.students, 0);
  const paid = rows.reduce((sum, r) => sum + r.paid, 0);
  return {
    rows,
    total: {
      spend: input.monthSpend,
      leads,
      students,
      rate: leads > 0 ? Math.round((students / leads) * 1000) / 10 : 0,
      cac: cacOf(input.monthSpend, students),
      paid,
      roi: roiOf(paid, input.monthSpend),
    },
    unassignedSpend: Math.max(0, input.monthSpend - attributed),
  };
}
