import { addDaysToDateStr, dayOfWeekForDateStr } from './tashkent';

/**
 * Bank days (ADR-0076): Monday–Friday, not a holiday of the student's branch.
 * The centre's holiday table stands in for the bank calendar; transferred
 * working Saturdays are not modelled. Pure: the caller loads `holidays`
 * (`termHolidays`).
 */

/** The contract's refund term, and the first leg of the transfer wait. */
export const REFUND_TERM_BANK_DAYS = 10;

export function isBankDay(day: string, holidays: ReadonlySet<string>): boolean {
  const dow = dayOfWeekForDateStr(day);
  return dow !== 0 && dow !== 6 && !holidays.has(day);
}

/** The n-th bank day AFTER `fromDateStr` ('YYYY-MM-DD'); n = 0 is the day itself. */
export function addBankDays(
  fromDateStr: string,
  n: number,
  holidays: ReadonlySet<string>,
): string {
  let day = fromDateStr;
  for (let left = n; left > 0; ) {
    day = addDaysToDateStr(day, 1);
    if (isBankDay(day, holidays)) left--;
  }
  return day;
}

/**
 * Bank days `d` with `fromStr < d ≤ toStr` — «N bank kuni qoldi» from today to
 * the due day, «muddati o'tdi · N bank kuni» from the due day to today.
 * Mirrored (negative) when `toStr` is earlier.
 */
export function bankDaysBetween(
  fromStr: string,
  toStr: string,
  holidays: ReadonlySet<string>,
): number {
  if (toStr < fromStr) return -bankDaysBetween(toStr, fromStr, holidays);
  let count = 0;
  for (
    let d = addDaysToDateStr(fromStr, 1);
    d <= toStr;
    d = addDaysToDateStr(d, 1)
  ) {
    if (isBankDay(d, holidays)) count++;
  }
  return count;
}
