"use client";

import { AlertTriangle, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_SHORT,
  formatShortDate,
  getLessonStatus,
  type LessonDate,
} from "./attendance-cycle-utils";

interface AttendanceCycleGridProps {
  lessons: LessonDate[];
  cycleSize: number;
  todayStr: string;
  onSelectDate: (date: string) => void;
}

export function AttendanceCycleGrid({
  lessons,
  cycleSize,
  todayStr,
  onSelectDate,
}: AttendanceCycleGridProps) {
  return (
    <div
      className={cn(
        "grid gap-2",
        cycleSize === 20
          ? "grid-cols-5 sm:grid-cols-10"
          : "grid-cols-6 sm:grid-cols-12",
      )}
    >
      {lessons.map((lesson, index) => {
        const status = getLessonStatus(lesson, todayStr);
        return (
          <button
            key={lesson.date}
            onClick={() => onSelectDate(lesson.date)}
            className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-muted/60"
          >
            <div
              className={cn(
                "relative flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-all sm:size-11",
                status === "taken" &&
                  "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
                status === "missed" &&
                  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                status === "today" &&
                  "bg-blue-100 text-blue-700 ring-2 ring-blue-400 dark:bg-blue-900/40 dark:text-blue-400 dark:ring-blue-500",
                status === "future" && "bg-muted text-muted-foreground",
              )}
            >
              {status === "taken" ? (
                <Check className="size-4" />
              ) : status === "missed" ? (
                <AlertTriangle className="size-4" />
              ) : status === "today" ? (
                <span className="relative flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full bg-blue-500" />
                </span>
              ) : (
                <Circle className="size-4 opacity-40" />
              )}
            </div>

            <span className="text-[10px] font-medium text-muted-foreground">
              {index + 1}-dars
            </span>
            <span className="text-[10px] text-muted-foreground">
              {formatShortDate(lesson.date)}
            </span>
            <span className="text-[10px] text-muted-foreground/70">
              {DAY_SHORT[lesson.dayName] ?? lesson.dayName.slice(0, 2)}
            </span>
          </button>
        );
      })}

      {/* Empty placeholders for incomplete cycle */}
      {lessons.length < cycleSize &&
        Array.from({ length: cycleSize - lessons.length }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex flex-col items-center gap-1 p-1 opacity-30"
          >
            <div className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 sm:size-11">
              <span className="text-xs text-muted-foreground">
                {lessons.length + i + 1}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {lessons.length + i + 1}-dars
            </span>
            <span className="text-[10px] text-muted-foreground">—</span>
            <span className="text-[10px] text-muted-foreground/70">—</span>
          </div>
        ))}
    </div>
  );
}
