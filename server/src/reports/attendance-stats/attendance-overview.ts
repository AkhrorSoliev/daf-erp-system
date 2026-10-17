import {
  attendedOf,
  countRows,
  cutOf,
  cutRows,
  groupOf,
  lessonsOf,
  minLessons,
  missPairs,
  rateOf,
  weekdayRows,
} from './attendance-counts';
import { monthWindow, type StatsPeriod } from './attendance-stats-period';
import type {
  AttendanceFacts,
  CreditResult,
  CutKey,
  DayWindow,
  MisserPair,
  OverviewCore,
} from './attendance-stats.types';

export interface OverviewInput {
  facts: AttendanceFacts;
  period: StatsPeriod;
  /** The current Tashkent month: its bar (and any later one) is «oy tugamagan». */
  currentMonth: string;
  credit: CreditResult;
  cut: CutKey;
  page: number;
  pageSize: number;
}

/**
 * The whole page from one mark set (spec B7c §4). Card, month bars, weekdays
 * and the three cuts all count through `countRows`, so they add up (pinned by
 * the parity test). The cut is paged here; a page past the end is clamped.
 */
export function buildOverview(i: OverviewInput): OverviewCore {
  const { facts, period } = i;
  const counts = countRows(facts.rows, period.window);
  const all = cutRows(facts, period.window, i.cut);
  const min = minLessons(period.elapsedDays);
  const listed = all.filter((r) => r.lessons >= min);
  const pageSize = Math.max(1, i.pageSize);
  const page = Math.max(
    1,
    Math.min(i.page, Math.ceil(listed.length / pageSize)),
  );
  return {
    range: period.range,
    previous: period.previous,
    card: {
      counts,
      lessons: lessonsOf(counts),
      attended: attendedOf(counts),
      rate: rateOf(counts),
      previousRate: period.previousWindow
        ? rateOf(countRows(facts.rows, period.previousWindow))
        : null,
    },
    months: period.months.map((month) => {
      const c = countRows(facts.rows, monthWindow(month));
      return {
        month,
        counts: c,
        rate: rateOf(c),
        partial: month >= i.currentMonth,
      };
    }),
    weekdays: weekdayRows(facts.rows, period.window),
    credit: i.credit,
    cut: {
      key: i.cut,
      rows: listed.slice((page - 1) * pageSize, page * pageSize),
      total: listed.length,
      hidden: all.length - listed.length,
      minLessons: min,
      page,
      pageSize,
    },
  };
}

/** The «ko'p qoldiruvchi» pairs of one cut row (the dialog's list, before names). */
export function missersOf(
  facts: AttendanceFacts,
  w: DayWindow,
  cut: CutKey,
  key: string,
): MisserPair[] {
  return missPairs(facts.rows, w).filter(
    (p) => cutOf(groupOf(facts.groups, p.groupId), cut).key === key,
  );
}
