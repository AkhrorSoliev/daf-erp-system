"use client";

import { ChevronRight as GoIcon } from "lucide-react";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import {
  DAY_SHORT,
  formatShortDate,
  type LessonDate,
} from "./attendance-cycle-utils";

interface AttendanceMissedLessonsProps {
  cycleLessons: LessonDate[];
  todayStr: string;
  group: {
    id: string;
    name: string;
    lessonStartTime: string | null;
    lessonEndTime: string | null;
  };
  onSelectDate: (date: string) => void;
}

// An answer already refreshes the group's calendar (the source of this list) —
// UnmarkedLessonDialogs invalidates it — so there is nothing left to do here.
const noop = () => {};

export function AttendanceMissedLessons({
  cycleLessons,
  todayStr,
  group,
  onSelectDate,
}: AttendanceMissedLessonsProps) {
  const missedLessons = cycleLessons
    .filter(
      (l) =>
        l.unmarked?.status === "PENDING" ||
        (!l.hasAttendance && l.date < todayStr),
    )
    .slice(0, 5);

  if (missedLessons.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
        Davomat olinmagan darslar:
      </p>
      {missedLessons.map((lesson) => {
        const lessonIndex = cycleLessons.indexOf(lesson);
        const title = `${lessonIndex + 1}-dars (${formatShortDate(lesson.date)}, ${DAY_SHORT[lesson.dayName] ?? lesson.dayName})`;
        if (lesson.unmarked?.status === "PENDING") {
          return (
            <div
              key={lesson.date}
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30"
            >
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Dars tugagan, davomat olinmagan
                </p>
              </div>
              <UnmarkedLessonPrompt
                lesson={{
                  groupId: group.id,
                  groupName: group.name,
                  date: lesson.date,
                  startTime: group.lessonStartTime,
                  endTime: group.lessonEndTime,
                }}
                info={lesson.unmarked}
                onAnswered={noop}
              />
            </div>
          );
        }
        return (
          <button
            key={lesson.date}
            onClick={() => onSelectDate(lesson.date)}
            className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <div>
              <p className="text-sm font-medium">{title}</p>
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
