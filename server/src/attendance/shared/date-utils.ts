export const DAY_NAME_TO_JS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const JS_TO_DAY_NAME: Record<number, string> = {
  0: 'Yakshanba',
  1: 'Dushanba',
  2: 'Seshanba',
  3: 'Chorshanba',
  4: 'Payshanba',
  5: 'Juma',
  6: 'Shanba',
};

/** Format a Date as YYYY-MM-DD using LOCAL time (avoids UTC shift from toISOString). */
export function toLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The Tashkent calendar helpers moved to `common/date/tashkent`, which is now
 * the single source for every day boundary in the codebase (reports, crons,
 * money queries — not just attendance). Re-exported so the existing
 * `attendance/shared/date-utils` import sites keep working and there is still
 * exactly one implementation behind them.
 */
export {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
  tashkentDayRangeUtc,
  tashkentDayStartUtc,
  tashkentRangeUtc,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
