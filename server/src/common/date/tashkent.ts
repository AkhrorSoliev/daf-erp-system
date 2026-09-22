/**
 * THE single source for "what Tashkent calendar day is this instant in, and
 * which UTC instants make up a Tashkent day". Every report filter, cron and
 * money query that turns a user-picked 'YYYY-MM-DD' into a database bound
 * goes through here.
 *
 * WHY THIS MODULE EXISTS. The center is in Asia/Tashkent (UTC+5, no DST) and
 * every timestamp column is stored as a UTC instant. `new Date('2026-08-05')`
 * is 00:00 **UTC**, which is 05:00 Tashkent — so a filter built that way runs
 * from 05:00 today to 04:59 tomorrow, Tashkent time. A real Click payment at
 * 2026-08-05T19:18:44Z (06.08 00:18 in Tashkent) therefore showed up under the
 * 05.08 filter, and an 01:30 payment never showed up under its own day at all.
 *
 * The companion trap is `end.setHours(23, 59, 59, 999)`: `setHours` works in
 * the PROCESS timezone, so the same code gave three different answers on a
 * UTC host, a Tashkent host and a developer's laptop.
 *
 * COLUMN TYPE MATTERS — pick the right pair:
 *   - TIMESTAMP columns (`Payment.createdAt`, `SalaryPayment.paidAt`,
 *     `Lead.createdAt`, …) → `tashkentRangeUtc` / `tashkentDayRangeUtc`.
 *   - `@db.Date` columns (`Attendance.date`, `Expense.date`,
 *     `SalaryAccrual.lessonDate`) → `utcMidnightFromDateStr`. Postgres
 *     truncates a timestamp to its UTC calendar date when comparing against a
 *     `date`, so feeding a Tashkent-shifted instant there silently pulls in
 *     the previous day. That exact mistake once inflated a month of teacher
 *     salary by 1 819 343 so'm.
 */

/** Asia/Tashkent is a flat UTC+5 with no DST — no IANA lookup needed. */
export const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** UTC-midnight Date for a 'YYYY-MM-DD' string — the bound for `@db.Date` columns. */
export function utcMidnightFromDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** The Tashkent calendar date ('YYYY-MM-DD') an instant falls on. */
export function tashkentDateStr(date: Date): string {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 00:00 Tashkent of a 'YYYY-MM-DD' calendar date, as the stored UTC instant. */
export function tashkentDayStartUtc(dateStr: string): Date {
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS,
  );
}

/** Add `days` to a 'YYYY-MM-DD' string. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = utcMidnightFromDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return tashkentDateStr(new Date(d.getTime() - TASHKENT_OFFSET_MS));
}

/**
 * UTC instant bounds of a range of Tashkent calendar days, inclusive of both
 * ends, as `{ gte, lt }`. Half-open on purpose: `lt` the next day's 00:00
 * leaves no gap and no double-count between adjacent ranges.
 */
export function tashkentRangeUtc(
  startStr: string,
  endStr: string,
): { gte: Date; lt: Date } {
  return {
    gte: tashkentDayStartUtc(startStr),
    lt: tashkentDayStartUtc(addDaysToDateStr(endStr, 1)),
  };
}

/** UTC instant bounds of ONE Tashkent calendar day, as `{ gte, lt }`. */
export function tashkentDayRangeUtc(dateStr: string): { gte: Date; lt: Date } {
  return tashkentRangeUtc(dateStr, dateStr);
}

/** Day of week (0=Sun..6=Sat) for a 'YYYY-MM-DD' calendar date. */
export function dayOfWeekForDateStr(dateStr: string): number {
  return utcMidnightFromDateStr(dateStr).getUTCDay();
}

/**
 * Prisma bounds for an OPTIONAL Tashkent day range on a TIMESTAMP column, or
 * `undefined` when neither end is given so the caller can spread it away.
 *
 * The upper bound is `lt` the day AFTER `endStr`, never `lte` the day itself:
 * `lte: new Date(endStr)` is 00:00 UTC, which drops the entire last day.
 */
export function tashkentRangeFilter(
  startStr?: string,
  endStr?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!startStr && !endStr) return undefined;
  return {
    ...(startStr ? { gte: tashkentDayStartUtc(startStr) } : {}),
    ...(endStr ? { lt: tashkentDayStartUtc(addDaysToDateStr(endStr, 1)) } : {}),
  };
}

/** The Tashkent calendar month ('YYYY-MM') an instant falls in. */
export function tashkentMonthKey(date: Date): string {
  return tashkentDateStr(date).slice(0, 7);
}

/**
 * UTC instant bounds of a whole Tashkent calendar month, as `{ gte, lt }`.
 * Use instead of `new Date(year, month, 1)`, which builds the boundary in the
 * PROCESS timezone and so drifts between a UTC host and a laptop.
 */
export function tashkentMonthRangeUtc(monthKey: string): {
  gte: Date;
  lt: Date;
} {
  const [y, m] = monthKey.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1) - TASHKENT_OFFSET_MS),
    lt: new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS),
  };
}

/** Shift a 'YYYY-MM' key by whole months. */
export function addMonthsToMonthKey(monthKey: string, months: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Last millisecond of a UTC calendar day — the inclusive upper bound for a
 * report that WALKS calendar dates (a day-by-day cursor, a `@db.Date` column)
 * rather than filtering a Tashkent-day window on a timestamp.
 *
 * Exists so such a report never reaches for `setHours(23, 59, 59, 999)`, which
 * silently answers differently depending on the machine's timezone.
 */
export function endOfUtcDay(dateStr: string): Date {
  return new Date(utcMidnightFromDateStr(dateStr).getTime() + 86_400_000 - 1);
}
