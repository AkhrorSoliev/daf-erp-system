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

// Asia/Tashkent is UTC+5 with no DST.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Convert a Date instant to its Asia/Tashkent calendar date (YYYY-MM-DD).
 * Stable across server timezones — UTC server vs Tashkent server give the
 * same answer. Use this anywhere we need to know "what calendar day was
 * this in Tashkent" for groups whose dates were saved as toISOString()
 * from a Tashkent browser (stored as 19:00 UTC of the prior day).
 */
export function tashkentDateStr(date: Date): string {
  const shifted = new Date(date.getTime() + TASHKENT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Build UTC-midnight Date for a YYYY-MM-DD string (matches Attendance.date storage). */
export function utcMidnightFromDateStr(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * UTC instant bounds of a Tashkent calendar day, as `{ gte, lt }`. Use this to
 * filter a real-timestamp column (e.g. createdAt @default(now())) by Tashkent
 * day — utcMidnightFromDateStr is only correct for fields already pinned to
 * UTC-midnight (Attendance.date @db.Date). The Tashkent day YYYY-MM-DD starts at
 * (UTC-midnight − 5h) and ends at the next day's start.
 */
export function tashkentDayRangeUtc(dateStr: string): { gte: Date; lt: Date } {
  const gte = new Date(
    utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS,
  );
  const lt = new Date(
    utcMidnightFromDateStr(addDaysToDateStr(dateStr, 1)).getTime() -
      TASHKENT_OFFSET_MS,
  );
  return { gte, lt };
}

/** Day of week (0=Sun..6=Sat) for a YYYY-MM-DD calendar date. */
export function dayOfWeekForDateStr(dateStr: string): number {
  return utcMidnightFromDateStr(dateStr).getUTCDay();
}

/** Add `days` to a YYYY-MM-DD string. */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = utcMidnightFromDateStr(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
