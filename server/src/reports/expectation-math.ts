import {
  buildScheduleDayResolver,
  type ScheduleSnapshotRow,
} from '../attendance/shared/schedule-resolver';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
} from '../attendance/shared/date-utils';

/** One already-priced student-lesson that has an attendance row. */
export interface PricedAttendance {
  perLesson: number;
}

export interface ExpectationGroup {
  groupId: string;
  /** Current weekdays; the resolver falls back to these. */
  exactDays: string[];
  /** Tashkent `YYYY-MM-DD`; null = unbounded. */
  startDateStr: string | null;
  endDateStr: string | null;
  scheduleSnapshots: ScheduleSnapshotRow[];
  /** Today's ACTIVE enrollments — the roster for dates with no attendance. */
  roster: { studentId: number; perLesson: number }[];
  /** Tashkent dates that already carry at least one attendance row. */
  datesWithAttendance: Set<string>;
  /** Tashkent dates with an active LessonCancellation. */
  cancelledDates: Set<string>;
  /** Attendances WITH a live LESSON_CONSUMPTION — already paid. */
  coveredAttendances: PricedAttendance[];
  /** Attendances WITHOUT one — taught, not yet paid. */
  uncoveredAttendances: PricedAttendance[];
}

export interface SplitOptions {
  monthStartStr: string;
  monthEndStr: string;
  holidayDates: Set<string>;
}

export interface LessonSplit {
  heldValue: number;
  heldLessons: number;
  remainingValue: number;
  remainingLessons: number;
}

/**
 * Splits a month's student-lessons into what has been PAID FOR and what is
 * still expected.
 *
 * The seam is the `LESSON_CONSUMPTION` row, not the attendance row: a debtor's
 * lesson has been taught but no money arrived, so it belongs on the expected
 * side and crosses over by itself once the student pays. Because a date either
 * has attendance (then its rows are classified individually) or does not (then
 * today's roster stands in), every student-lesson is counted exactly once.
 *
 * A date that has already passed with no attendance stays on the REMAINING
 * side on purpose. Teachers routinely enter attendance late — an attendance
 * reminder cron exists for exactly that — and dropping those dates would make
 * the figure lurch on data-entry lag rather than on anything real. A lesson
 * that genuinely did not happen is recorded as a `LessonCancellation` and is
 * excluded above.
 *
 * Future churn is deliberately NOT modelled. A "historically 5% leave" haircut
 * would be a hidden assumption nobody could decompose when the number came out
 * wrong; the roster is simply today's, and tomorrow's run reflects tomorrow's.
 *
 * Units are student-lessons, not group-lessons: one lesson of a 15-student
 * group is 15. That keeps counts and money in the same unit.
 */
export function splitMonthLessons(
  groups: ExpectationGroup[],
  { monthStartStr, monthEndStr, holidayDates }: SplitOptions,
): LessonSplit {
  let heldValue = 0;
  let heldLessons = 0;
  let remainingValue = 0;
  let remainingLessons = 0;

  for (const g of groups) {
    for (const a of g.coveredAttendances) {
      heldValue += a.perLesson;
      heldLessons += 1;
    }
    for (const a of g.uncoveredAttendances) {
      remainingValue += a.perLesson;
      remainingLessons += 1;
    }

    if (g.roster.length === 0) continue;
    const rosterValue = g.roster.reduce((s, r) => s + r.perLesson, 0);
    const resolveDays = buildScheduleDayResolver(
      g.scheduleSnapshots,
      g.exactDays,
    );

    const from =
      g.startDateStr && g.startDateStr > monthStartStr
        ? g.startDateStr
        : monthStartStr;
    const to =
      g.endDateStr && g.endDateStr < monthEndStr ? g.endDateStr : monthEndStr;

    for (let d = from; d <= to; d = addDaysToDateStr(d, 1)) {
      if (holidayDates.has(d)) continue;
      if (g.cancelledDates.has(d)) continue;
      if (g.datesWithAttendance.has(d)) continue;
      const days = resolveDays(d);
      // `null` = the date predates every snapshot, so the weekdays of that
      // period are unknown. Never project today's schedule backwards.
      if (!days) continue;
      if (!days.includes(dayOfWeekForDateStr(d))) continue;
      remainingValue += rosterValue;
      remainingLessons += g.roster.length;
    }
  }

  return { heldValue, heldLessons, remainingValue, remainingLessons };
}
