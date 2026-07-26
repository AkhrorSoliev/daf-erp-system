/**
 * Center top-up (full-deserved payroll) gating — Faza 2.
 *
 * From this month on, teachers are paid their FULL deserved salary: the center
 * tops up the gap between what students covered and what the teacher earned for
 * every billable lesson held (see `SalaryCalculationService` gap sweep and the
 * `NET_BASE` display in `SalaryMonthlyService`). Periods BEFORE this month keep
 * the old "students-paid only" (covered) behaviour, in BOTH the payout and the
 * `/payments/salary` display — so a given month's shown and paid figures agree.
 *
 * Single source of truth: the calc service, the monthly report, and any preview
 * script all import `TOPUP_EFFECTIVE_MONTH` / `isTopUpMonth` from here.
 */

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * First payroll month (Tashkent calendar, "YYYY-MM") that pays the center
 * top-up. Everything strictly before this stays covered-only. Bump this to roll
 * the switch forward, or set it far in the future to effectively disable top-up.
 */
export const TOPUP_EFFECTIVE_MONTH = '2026-07';

/** Tashkent calendar month key ("YYYY-MM") of an instant. */
export function monthKeyOf(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Whether a "YYYY-MM" month key is at/after the top-up switch. Used by the
 * monthly report, which already works in month keys.
 */
export function isTopUpMonth(monthKey: string): boolean {
  return monthKey >= TOPUP_EFFECTIVE_MONTH;
}

/**
 * Whether the payroll period that starts at `periodStart` is topped up. The
 * period is anchored on its start instant; with cycleStartDay=1 that is the
 * first of the calendar month, so the month key of `periodStart` is the period's
 * month. Used by the calc service (which works in period bounds).
 */
export function isTopUpPeriod(periodStart: Date): boolean {
  return isTopUpMonth(monthKeyOf(periodStart));
}

/**
 * BR-09 (yangi o'quvchi istisnosi): the center does NOT front (top up) a new
 * student's lessons until that student has *attended* at least this many
 * lessons (PRESENT/LATE) in the group. A trial student who attends the first 3
 * and then disappears (or leaves) before a 4th confirmed lesson never generates
 * a center top-up. Once the count reaches the threshold, the earlier lessons
 * become eligible too (recomputed idempotently; cross-period backfill in a
 * later phase). Only the center-funded top-up is gated — a student who actually
 * PAYS earns the teacher normally regardless of count.
 */
export const NEW_STUDENT_TOPUP_MIN_LESSONS = 4;

/** UTC-midnight Date of the first day of the top-up era (2026-07-01). Used to
 * scope the BR-09b retroactive backlog sweep to top-up-era lessons only. */
export function topUpEraStartDate(): Date {
  return new Date(`${TOPUP_EFFECTIVE_MONTH}-01T00:00:00.000Z`);
}
