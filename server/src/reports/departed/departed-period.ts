import { BadRequestException } from '@nestjs/common';
import {
  addMonthsToMonthKey,
  tashkentRangeUtc,
} from '../../common/date/tashkent';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 3660;

export interface DayRange {
  startDate: string;
  endDate: string;
}

const dayMs = (d: string) =>
  Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const dayStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysInMonth = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** A real calendar day, 'YYYY-MM-DD'. */
function isRealDay(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return dayStr(dayMs(d)) === d;
}

/** The picked Tashkent days as `[gte, lt)` UTC instants; a 400 for a bad range. */
export function parseDayRange(startDate: string, endDate: string) {
  if (!isRealDay(startDate) || !isRealDay(endDate)) {
    throw new BadRequestException("Sana noto'g'ri formatda");
  }
  if (dayMs(endDate) < dayMs(startDate)) {
    throw new BadRequestException("Oxirgi sana boshidan oldin bo'lmasin");
  }
  if ((dayMs(endDate) - dayMs(startDate)) / DAY_MS > MAX_DAYS) {
    throw new BadRequestException('Davr 10 yildan oshmasin');
  }
  return tashkentRangeUtc(startDate, endDate);
}

function isWholeMonth(r: DayRange): boolean {
  return (
    r.startDate.slice(0, 7) === r.endDate.slice(0, 7) &&
    r.startDate.slice(8, 10) === '01' &&
    +r.endDate.slice(8, 10) ===
      daysInMonth(+r.endDate.slice(0, 4), +r.endDate.slice(5, 7))
  );
}

/**
 * The period to compare with: a whole calendar month goes to the month before
 * it; any other range to the same number of days right before it.
 */
export function previousRange(r: DayRange): DayRange {
  if (isWholeMonth(r)) {
    const y = +r.startDate.slice(0, 4);
    const m = +r.startDate.slice(5, 7);
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const mm = String(pm).padStart(2, '0');
    return {
      startDate: `${py}-${mm}-01`,
      endDate: `${py}-${mm}-${String(daysInMonth(py, pm)).padStart(2, '0')}`,
    };
  }
  const len = Math.round((dayMs(r.endDate) - dayMs(r.startDate)) / DAY_MS) + 1;
  return {
    startDate: dayStr(dayMs(r.startDate) - len * DAY_MS),
    endDate: dayStr(dayMs(r.startDate) - DAY_MS),
  };
}

/** `count` Tashkent month keys up to the month of `endDate`, ascending. */
export function monthKeysEndingAt(endDate: string, count: number): string[] {
  const last = endDate.slice(0, 7);
  return Array.from({ length: count }, (_, i) =>
    addMonthsToMonthKey(last, -(count - 1 - i)),
  );
}

/** Departures per 100 students studying at the start, one decimal. */
export function per100(departed: number, atStart: number): number | null {
  if (atStart <= 0) return null;
  return Math.round((departed / atStart) * 1000) / 10;
}

/** A share on fewer than this many students is not shown (spec §4.5). */
export const MIN_SHARE_BASE = 5;

export function shareOf(departed: number, atStart: number): number | null {
  return atStart < MIN_SHARE_BASE ? null : per100(departed, atStart);
}
