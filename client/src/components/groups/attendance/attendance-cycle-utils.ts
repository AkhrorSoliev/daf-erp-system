export interface LessonDate {
  date: string;
  dayName: string;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
}

export const DAY_SHORT: Record<string, string> = {
  Dushanba: "Du",
  Seshanba: "Se",
  Chorshanba: "Ch",
  Payshanba: "Pa",
  Juma: "Ju",
  Shanba: "Sh",
  Yakshanba: "Ya",
};

export const MONTH_NAMES: Record<number, string> = {
  1: "Yanvar",
  2: "Fevral",
  3: "Mart",
  4: "Aprel",
  5: "May",
  6: "Iyun",
  7: "Iyul",
  8: "Avgust",
  9: "Sentabr",
  10: "Oktabr",
  11: "Noyabr",
  12: "Dekabr",
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
