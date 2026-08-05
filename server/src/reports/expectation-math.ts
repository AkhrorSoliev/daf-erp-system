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
  /**
   * Tashkent `YYYY-MM-DD`. Dates BEFORE this are history: a scheduled slot with
   * no attendance row there is not evidence that a lesson happened, so nothing
   * is projected onto it. Today itself still projects — its lesson may yet be
   * taught and marked.
   */
  todayStr: string;
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
 * A date that has already passed with NO attendance is projected onto by
 * nothing. It was tempting to keep counting it on the grounds that teachers
 * enter attendance late, but production disproved that: one group's 13
 * scheduled July slots had no attendance since 7 May and never will. Without
 * an attendance row there is no evidence the lesson happened, so counting it
 * invents revenue — and worse, it makes the figure rise as data entry gets
 * sloppier. Late entry now nudges the number UP by one lesson when it lands,
 * which is small and points at the truth.
 *
 * A consequence worth relying on: for a CLOSED month nothing is projected, so
 * `expectedValue` collapses exactly onto `heldValue`. `scripts/
 * backtest-monthly-expectation.ts` uses that equality as its self-check.
 *
 * The unrecorded slots do not vanish as a concern — they are money nobody
 * billed and salary nobody accrued — but they belong on a data-entry report
 * (`scripts/diag-unrecorded-lessons.ts`), not inside a revenue figure.
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
  { monthStartStr, monthEndStr, holidayDates, todayStr }: SplitOptions,
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
      // History with no attendance row: no evidence, no projection.
      if (d < todayStr) continue;
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
