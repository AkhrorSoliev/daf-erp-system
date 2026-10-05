import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';

/** A promise names a day at most this many Tashkent days ahead (CEO, 04.10.2026; ADR-0072). */
export const PROMISE_MAX_DAYS = 7;
export const PROMISE_DATE_REFUSAL =
  "Va'da sanasi bugundan boshlab ko'pi bilan 7 kun keyin bo'lishi kerak";
export const PROMISE_MONTH_REFUSAL = "Bu o'quvchiga shu oy va'da yozilgan";

/** Inclusive Tashkent days, 'YYYY-MM-DD'. */
export interface DayRange {
  from: string;
  to: string;
}

/** The student's latest promise created in the current Tashkent month. */
export interface MonthPromise {
  status: string;
  createdAt: Date;
}

/**
 * Pure. The days a promise written now may name, or why none may be written.
 * - no promise created this Tashkent month → today … today + 7;
 * - an upsert of this month's OPEN promise → today … its creation day + 7, so
 *   editing never pushes a promise past a week;
 * - anything else → one promise per student per month.
 */
export function promiseDateRange(
  now: Date,
  monthPromise: MonthPromise | null | undefined,
  mode: 'create' | 'upsert',
): DayRange | { refusal: string } {
  const today = tashkentDateStr(now);
  if (!monthPromise)
    return { from: today, to: addDaysToDateStr(today, PROMISE_MAX_DAYS) };
  if (mode === 'upsert' && monthPromise.status === 'OPEN') {
    return {
      from: today,
      to: addDaysToDateStr(
        tashkentDateStr(monthPromise.createdAt),
        PROMISE_MAX_DAYS,
      ),
    };
  }
  return { refusal: PROMISE_MONTH_REFUSAL };
}

/** Pure. Null when the promise may be written, else the refusal text. */
export function promiseRefusal(
  now: Date,
  monthPromise: MonthPromise | null | undefined,
  mode: 'create' | 'upsert',
  promiseDate: string,
): string | null {
  const range = promiseDateRange(now, monthPromise, mode);
  if ('refusal' in range) return range.refusal;
  // The day the client means: a 'YYYY-MM-DD' (UTC midnight, 05:00 Tashkent) and
  // the call dialog's end-of-day instant both land on that Tashkent day.
  const day = tashkentDateStr(new Date(promiseDate));
  return day < range.from || day > range.to ? PROMISE_DATE_REFUSAL : null;
}

/** `GET /payment-promises/month` — what the promise form and both dialogs may offer. */
export interface PromiseMonthState {
  /** The student's latest promise created this Tashkent month, any status. */
  monthPromise: {
    id: string;
    status: string;
    promiseDate: string;
    promisedAmount: number | null;
    createdAt: string;
  } | null;
  /** Days a NEW promise may name now; null once the month has one. */
  create: DayRange | null;
  /** Days this month's OPEN promise may be moved to; null when there is none. */
  edit: DayRange | null;
}
