import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { toMinutes } from '../attendance/shared/attendance-window';

/** What the nightly job needs to know about one pause (ADR-0119). */
export interface PauseSpan {
  startedAt: Date;
  /** Set once the group has left the pause. */
  endedAt: Date | null;
  /** The day lessons restart; the days before it were pause days. */
  resumeOn: Date | null;
}

/**
 * The calendar days of a pause that can hold a lesson the group missed:
 * `[from, toExclusive)` as Tashkent `YYYY-MM-DD`. The days before the day the
 * lessons restart, never beyond today.
 */
export function pauseDayRange(
  pause: PauseSpan,
  todayStr: string,
): { from: string; toExclusive: string } {
  const tomorrow = addDaysToDateStr(todayStr, 1);
  const own = pause.resumeOn
    ? tashkentDateStr(pause.resumeOn)
    : pause.endedAt
      ? addDaysToDateStr(tashkentDateStr(pause.endedAt), 1)
      : tomorrow;
  return {
    from: tashkentDateStr(pause.startedAt),
    toExclusive: own < tomorrow ? own : tomorrow,
  };
}

/**
 * Whether the lesson of `day` ending at `endTime` ('HH:mm') ended while the
 * group was paused. A lesson that ended before the pause began was not paused:
 * if nobody took its register, «Dars bo'ldimi?» asks about it. A pause that
 * closed without a restart day (cancelled, completed) covers lessons until
 * then.
 */
export function lessonEndsInPause(
  day: string,
  endTime: string,
  pause: PauseSpan,
): boolean {
  const end = new Date(
    tashkentDayStartUtc(day).getTime() + toMinutes(endTime) * 60_000,
  );
  if (end < pause.startedAt) return false;
  if (!pause.resumeOn && pause.endedAt && end > pause.endedAt) return false;
  return true;
}

/**
 * The first lesson day after `fromDay` for a group on `exactDays`, skipping
 * days `isHoliday` names. Null when none is found within 90 days.
 */
export async function nextLessonDay(
  fromDay: string,
  exactDays: string[],
  isHoliday: (day: string) => Promise<boolean>,
): Promise<string | null> {
  const names = new Set(exactDays.map((d) => d.toLowerCase()));
  const dayName = (day: string) =>
    [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ][new Date(`${day}T00:00:00.000Z`).getUTCDay()];
  let day = fromDay;
  for (let i = 0; i < 90; i++) {
    day = addDaysToDateStr(day, 1);
    if (names.has(dayName(day)) && !(await isHoliday(day))) return day;
  }
  return null;
}
