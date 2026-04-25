"use client";

import { ChevronRight as GoIcon } from "lucide-react";
import {
  DAY_SHORT,
  formatShortDate,
  type LessonDate,
} from "./attendance-cycle-utils";

interface AttendanceMissedLessonsProps {
  cycleLessons: LessonDate[];
  todayStr: string;
  onSelectDate: (date: string) => void;
}

export function AttendanceMissedLessons({
  cycleLessons,
  todayStr,
  onSelectDate,
}: AttendanceMissedLessonsProps) {
  const missedLessons = cycleLessons
    .filter((l) => !l.hasAttendance && l.date < todayStr && l.date !== todayStr)
    .slice(0, 3);

  if (missedLessons.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
        Davomat olinmagan darslar:
      </p>
      {missedLessons.map((lesson) => {
        const lessonIndex = cycleLessons.indexOf(lesson);
        return (
          <button
            key={lesson.date}
            onClick={() => onSelectDate(lesson.date)}
            className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <div>
              <p className="text-sm font-medium">
                {lessonIndex + 1}-dars ({formatShortDate(lesson.date)},{" "}
                {DAY_SHORT[lesson.dayName] ?? lesson.dayName})
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Davomat olinmagan
              </p>
            </div>
            <GoIcon className="size-4 text-amber-500" />
          </button>
        );
      })}
    </div>
  );
}
