import { lessonDatesInMonth } from '../billing/planned-lessons';

export interface CourseScheduleSummary {
  /** Distinct lessons-a-week across the course's running groups, ascending. */
  weeklyLessons: number[];
  /** Fewest and most lessons a group has in a month over the coming year. */
  monthLessons: { min: number; max: number } | null;
}

const MONTHS_AHEAD = 12;

/**
 * What a course's running groups add up to, for the course page.
 *
 * A monthly price is split over the lessons a group actually has in the
 * month (`MonthlyChargeService`, via `lessonDatesInMonth`), so lessons a
 * week come from the groups' schedules, not from the course. Holidays are
 * left out here: this is the page's "about 12–14 a month", not a bill.
 */
export function courseScheduleSummary(
  schedules: string[][],
  fromYear: number,
  fromMonth: number,
): CourseScheduleSummary {
  const distinct = new Map<string, string[]>();
  for (const days of schedules) {
    const clean = [
      ...new Set(days.map((d) => d.trim().toLowerCase()).filter(Boolean)),
    ].sort();
    if (clean.length > 0) distinct.set(clean.join(','), clean);
  }
  if (distinct.size === 0) return { weeklyLessons: [], monthLessons: null };

  const weekly = [...new Set([...distinct.values()].map((d) => d.length))];
  let min = Infinity;
  let max = 0;
  for (const exactDays of distinct.values()) {
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const m = fromMonth - 1 + i;
      const n = lessonDatesInMonth({
        year: fromYear + Math.floor(m / 12),
        month: (m % 12) + 1,
        exactDays,
      }).length;
      min = Math.min(min, n);
      max = Math.max(max, n);
    }
  }
  return {
    weeklyLessons: weekly.sort((a, b) => a - b),
    monthLessons: { min, max },
  };
}
