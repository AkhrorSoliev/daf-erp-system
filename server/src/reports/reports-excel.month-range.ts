import { isTopUpMonth } from '../salary/shared/topup';

/**
 * Aggregating the net-profit legs over a MULTI-MONTH export.
 *
 * The workbook used to build "Sof foyda" from mismatched windows: revenue and
 * teacher salary came from `startDate`'s month only, while operating expenses
 * and refunds covered the whole selected period. A three-month export therefore
 * subtracted three months of cost from one month of income; the yearly preset
 * was worse still — `monthStr` became `2026-01`, which has no attendance, so
 * revenue was 0 and the sheet printed the negative of the entire year's
 * expenses as its headline "most accurate" figure.
 *
 * The `Tekshiruv` sheet could never catch it: its footing re-adds `np`'s own
 * fields and compares them to `np.netProfit`, which is tautologically equal.
 * That is an arithmetic check, not a window check.
 */

/** Hard ceiling on how many months a single export will aggregate. */
export const MAX_AGGREGATED_MONTHS = 24;

/** Inclusive list of `YYYY-MM` keys between two `YYYY-MM-DD` bounds. */
export function monthsBetween(startDate: string, endDate: string): string[] {
  const [sy, sm] = startDate.slice(0, 7).split('-').map(Number);
  const [ey, em] = endDate.slice(0, 7).split('-').map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Months an export should actually aggregate.
 *
 * Months before the company's reporting floor are DROPPED rather than clamped.
 * `getSalaryMonthly` clamps a too-early month up to `floorMonth`, so summing an
 * unclamped list would count the floor month once per skipped month — the yearly
 * export's core defect.
 */
export function aggregatableMonths(
  startDate: string,
  endDate: string,
  floorMonth: string,
): { months: string[]; truncated: boolean } {
  const all = monthsBetween(startDate, endDate).filter((m) => m >= floorMonth);
  return {
    months: all.slice(0, MAX_AGGREGATED_MONTHS),
    truncated: all.length > MAX_AGGREGATED_MONTHS,
  };
}

export interface MonthlySalaryTotals {
  totals?: {
    fullDeserved?: number | null;
    covered?: number | null;
    gap?: number | null;
  } | null;
  staffTotals?: { monthly?: number | null } | null;
}

/**
 * Sum monthly salary reports into one object shaped like a single month's, so
 * `buildNetProfit` can consume it unchanged.
 *
 * Each month contributes on ITS OWN basis: `fullDeserved` (covered + centre
 * top-up) from the top-up month onward, `covered` before it. Because the gating
 * is already applied here, the caller passes no `month` to `buildNetProfit` —
 * that path uses `fullDeserved` directly.
 */
export function sumMonthlySalaries(
  perMonth: { month: string; salaries: MonthlySalaryTotals }[],
): { totals: { fullDeserved: number; covered: number; gap: number }; staffTotals: { monthly: number } } {
  let fullDeserved = 0;
  let covered = 0;
  let gap = 0;
  let staffMonthly = 0;

  for (const { month, salaries } of perMonth) {
    const t = salaries?.totals ?? {};
    const monthCovered = t.covered ?? 0;
    const monthGap = t.gap ?? 0;
    const monthFull = t.fullDeserved ?? 0;
    covered += monthCovered;
    gap += monthGap;
    // A manual/config-gap month reports null for the split; it contributes 0
    // rather than a fabricated figure.
    fullDeserved += isTopUpMonth(month) ? monthFull : monthCovered;
    staffMonthly += salaries?.staffTotals?.monthly ?? 0;
  }

  return {
    totals: { fullDeserved, covered, gap },
    staffTotals: { monthly: staffMonthly },
  };
}
