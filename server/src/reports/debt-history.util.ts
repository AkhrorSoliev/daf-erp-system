/**
 * Tashkent calendar-month helpers shared by the debt reports.
 *
 * Extracted so `ReportsFinancialService` (the cohort drill-down) and
 * `ReportsDebtHistoryService` (the page's replay) cannot drift apart on where a
 * month starts — an off-by-one here silently moves money between months.
 */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Reporting floor when the company has no `systemStartDate`. */
export const DEBT_FLOOR_MONTH = '2026-05';

const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

/** Tashkent calendar month key ("YYYY-MM") of an instant. */
export function tashkentMonthKey(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "May 2026" label for a "YYYY-MM" key. */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${UZ_MONTHS[m - 1]} ${y}`;
}

/** Inclusive list of "YYYY-MM" keys from `fromKey` to `toKey`. */
export function enumerateMonths(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let [y, m] = fromKey.split('-').map(Number);
  const [ty, tm] = toKey.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

/**
 * The exclusive UTC boundary marking the END of Tashkent month `monthKey` —
 * i.e. the first instant of the FOLLOWING Tashkent month. A transaction with
 * `createdAt >= this` happened strictly AFTER the month closed. (monthKey's
 * 1-based month equals the 0-based index of the next month, so `Date.UTC(y, m, 1)`
 * is already the next month's first day; subtract the offset for Tashkent midnight.)
 */
export function tashkentMonthEndBoundary(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS);
}

/** First instant of Tashkent month `monthKey` (its 1st at 00:00 local). */
export function tashkentMonthStart(monthKey: string): Date {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1) - TASHKENT_OFFSET_MS);
}

/** "2026-06" → "2026-07". */
export function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, '0')}`;
}
