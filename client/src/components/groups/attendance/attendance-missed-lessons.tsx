"use client";

import {
  DAY_SHORT,
  formatShortDate,
  type LessonDate,
} from "./attendance-cycle-utils";

interface AttendanceMissedLessonsProps {
  cycleLessons: LessonDate[];
  todayStr: string;
}

/**
 * Lessons that ended without attendance. ADR-0046: once a lesson ends its
 * attendance is closed to every role, so this list only reports — it used to
 * open the form and invite filling the lesson in after the fact.
 */
export function AttendanceMissedLessons({
  cycleLessons,
  todayStr,
}: AttendanceMissedLessonsProps) {
  const missedLessons = cycleLessons
    .filter((l) => !l.hasAttendance && l.date < todayStr)
    .slice(0, 3);

  if (missedLessons.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-red-700 dark:text-red-400">
        Davomat olinmagan darslar (endi kiritib bo&apos;lmaydi):
      </p>
      {missedLessons.map((lesson) => {
        const lessonIndex = cycleLessons.indexOf(lesson);
        return (
          <div
            key={lesson.date}
            className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-left dark:border-red-800 dark:bg-red-950/30"
          >
            <div>
              <p className="text-sm font-medium">
                {lessonIndex + 1}-dars ({formatShortDate(lesson.date)},{" "}
                {DAY_SHORT[lesson.dayName] ?? lesson.dayName})
              </p>
              <p className="text-xs text-red-700 dark:text-red-400">
                Davomat olinmagan · ustozga haq yozilmadi
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
