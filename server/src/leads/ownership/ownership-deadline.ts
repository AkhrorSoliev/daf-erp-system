import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../../common/date/tashkent';

/**
 * The clock a lead's owner works against (ADR-0093): Monday–Saturday,
 * 08:00–18:00 Tashkent, holidays left out. The same window as manual task
 * due dates and the automatic lead tasks.
 */
export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 18;
const HOUR_MS = 3_600_000;
// A holiday lasts at most 60 days, so a working day is always within reach.
const MAX_DAYS = 400;

export interface OwnershipRules {
  /** How many claimed leads with no action yet one person may hold. */
  maxUntouched: number;
  /** Working hours from the claim to the first action. */
  firstActionHours: number;
  /** Working days from an action to the next one. */
  followUpDays: number;
}

/** True when the Tashkent day 'YYYY-MM-DD' is a holiday for the lead. */
export type IsHoliday = (dateStr: string) => boolean;

function isWorkingDay(day: string, isHoliday: IsHoliday): boolean {
  return dayOfWeekForDateStr(day) !== 0 && !isHoliday(day);
}

function at(day: string, hour: number): Date {
  return new Date(tashkentDayStartUtc(day).getTime() + hour * HOUR_MS);
}

/** `from` plus `hours` of working time. */
export function addWorkingHours(
  from: Date,
  hours: number,
  isHoliday: IsHoliday,
): Date {
  let remaining = hours * HOUR_MS;
  let day = tashkentDateStr(from);
  for (let i = 0; i < MAX_DAYS; i++) {
    if (isWorkingDay(day, isHoliday)) {
      const open = at(day, WORK_START_HOUR).getTime();
      const close = at(day, WORK_END_HOUR).getTime();
      const start = i === 0 ? Math.max(open, from.getTime()) : open;
      if (start < close) {
        if (remaining <= close - start) return new Date(start + remaining);
        remaining -= close - start;
      }
    }
    day = addDaysToDateStr(day, 1);
  }
  throw new Error('addWorkingHours: no working day within reach');
}

/** 18:00 of the n-th working day after the Tashkent day of `from`. */
export function endOfNthWorkingDayAfter(
  from: Date,
  n: number,
  isHoliday: IsHoliday,
): Date {
  let day = tashkentDateStr(from);
  let count = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    day = addDaysToDateStr(day, 1);
    if (isWorkingDay(day, isHoliday) && ++count === n) {
      return at(day, WORK_END_HOUR);
    }
  }
  throw new Error('endOfNthWorkingDayAfter: no working day within reach');
}

/**
 * When an owned lead goes back to the common pool unless its owner acts.
 * Never stored: a changed setting reaches every lead at once.
 */
export function ownershipDueAt(
  lead: { ownedAt: Date; ownerActedAt: Date | null },
  rules: Pick<OwnershipRules, 'firstActionHours' | 'followUpDays'>,
  isHoliday: IsHoliday,
): Date {
  return lead.ownerActedAt
    ? endOfNthWorkingDayAfter(lead.ownerActedAt, rules.followUpDays, isHoliday)
    : addWorkingHours(lead.ownedAt, rules.firstActionHours, isHoliday);
}
