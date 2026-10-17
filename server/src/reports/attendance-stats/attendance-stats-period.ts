import { BadRequestException } from '@nestjs/common';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
} from '../../common/date/tashkent';
import {
  monthKeysEndingAt,
  parseDayRange,
  previousRange,
  type DayRange,
} from '../departed/departed-period';
import type { DayWindow } from './attendance-stats.types';

/** The reporting base (ADR-0067): no attendance figure before it. */
export const ATTENDANCE_FLOOR = '2026-05-01';
const MONTHS_SHOWN = 6;
const DAY_MS = 86_400_000;

export interface StatsPeriod {
  range: DayRange;
  window: DayWindow;
  previous: DayRange | null;
  previousWindow: DayWindow | null;
  /** «Oylar bo'yicha»: up to six whole months ending at the period's last month, none before May 2026. */
  months: string[];
  /** Every day the one read must cover: the window, the previous window and the bars' whole months. */
  load: DayWindow;
  /** Days of the window up to today — what could have been marked (the min-row rule). */
  elapsedDays: number;
}

const dayWindow = (r: DayRange): DayWindow => ({
  from: r.startDate,
  to: addDaysToDateStr(r.endDate, 1),
});

/** A whole Tashkent calendar month as days, upper bound exclusive. */
export const monthWindow = (month: string): DayWindow => ({
  from: `${month}-01`,
  to: `${addMonthsToMonthKey(month, 1)}-01`,
});

const earliest = (...days: string[]) => days.reduce((a, b) => (b < a ? b : a));

/** `startDate`/`endDate` of the page → every window the report reads; a 400 for a bad period. */
export function resolvePeriod(
  startDate: string,
  endDate: string,
  today: string,
): StatsPeriod {
  // A real day, not reversed, at most 10 years: the 7a checks and texts.
  parseDayRange(startDate, endDate);
  if (startDate < ATTENDANCE_FLOOR) {
    throw new BadRequestException('Bu hisobot 1-may 2026 dan boshlanadi');
  }
  const range = { startDate, endDate };
  const window = dayWindow(range);
  const prev = previousRange(range);
  const previous = prev.startDate >= ATTENDANCE_FLOOR ? prev : null;
  const previousWindow = previous ? dayWindow(previous) : null;
  const months = monthKeysEndingAt(endDate, MONTHS_SHOWN).filter(
    (m) => m >= ATTENDANCE_FLOOR.slice(0, 7),
  );
  const load = {
    from: earliest(
      window.from,
      previousWindow?.from ?? window.from,
      monthWindow(months[0]).from,
    ),
    // The last bar's month ends on or after the window's end.
    to: monthWindow(months[months.length - 1]).to,
  };
  const until = endDate < today ? endDate : today;
  const elapsedDays =
    until < startDate
      ? 0
      : Math.round((Date.parse(until) - Date.parse(startDate)) / DAY_MS) + 1;
  return {
    range,
    window,
    previous,
    previousWindow,
    months,
    load,
    elapsedDays,
  };
}
