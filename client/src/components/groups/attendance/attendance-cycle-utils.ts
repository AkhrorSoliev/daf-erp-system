import { msg } from "@/i18n/msg";
import type { UnmarkedLessonInfo } from "@/lib/unmarked-lesson";

export interface LessonDate {
  date: string;
  dayName: string;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
  /** «Dars bo'ldimi?» — set when the lesson ended unmarked (ADR-0054). */
  unmarked?: UnmarkedLessonInfo | null;
}

export const DAY_SHORT: Record<string, string> = {
  Dushanba: msg("Du"),
  Seshanba: msg("Se"),
  Chorshanba: msg("Ch"),
  Payshanba: msg("Pa"),
  Juma: msg("Ju"),
  Shanba: msg("Sh"),
  Yakshanba: msg("Ya"),
};

export const MONTH_NAMES: Record<number, string> = {
  1: msg("Yanvar"),
  2: msg("Fevral"),
  3: msg("Mart"),
  4: msg("Aprel"),
  5: msg("May"),
  6: msg("Iyun"),
  7: msg("Iyul"),
  8: msg("Avgust"),
  9: msg("Sentabr"),
  10: msg("Oktabr"),
  11: msg("Noyabr"),
  12: msg("Dekabr"),
};

/** Intensiv courses run a 20-lesson cycle; standard courses run 12. */
export function getCycleSize(courseName: string): number {
  return /intensiv/i.test(courseName) ? 20 : 12;
}

/** Convert "YYYY-MM-DD" to "DD.MM" for display. */
export function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
}

/**
 * Months covering [groupStartDate, today + 1 month]. Used to fetch lesson
 * dates page-by-page from the backend's month-scoped endpoint.
 */
export function getMonthRange(
  startDate: string | null,
): { month: number; year: number }[] {
  const now = new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(now.getFullYear(), 0, 1);

  const months: { month: number; year: number }[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  // Go up to 1 month ahead of current month
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  while (cursor <= end) {
    months.push({ month: cursor.getMonth() + 1, year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

export type LessonStatus = "taken" | "today" | "missed" | "future";

export function getLessonStatus(
  lesson: LessonDate,
  todayStr: string,
): LessonStatus {
  if (lesson.hasAttendance) return "taken";
  if (lesson.date === todayStr) return "today";
  if (lesson.date < todayStr) return "missed";
  return "future";
}
