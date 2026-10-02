/** One lesson that ended with no attendance (server: `computeMissedLessons`). */
export interface MissedLesson {
  /** "YYYY-MM-DD". */
  date: string;
  groupId: string;
  groupName: string;
  students: number;
  amount: number;
}

export interface MissedLessons {
  lessons: MissedLesson[];
  total: number;
}

/** "05.10.2026" from "2026-10-05" — a calendar day, no time zone involved. */
export function missedLessonDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/** The heading's count: "3 ta dars". */
export function missedLessonsCount(data: MissedLessons): string {
  return `${data.lessons.length} ta dars`;
}
