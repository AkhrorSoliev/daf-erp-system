"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  DAY_SHORT,
  formatShortDate,
  type LessonDate,
} from "./attendance-cycle-utils";

interface AttendanceNoLessonTodayCardProps {
  exactDays: string[] | undefined;
  nextLesson: LessonDate | null;
  lessonStartTime: string | null;
}

export function AttendanceNoLessonTodayCard({
  exactDays,
  nextLesson,
  lessonStartTime,
}: AttendanceNoLessonTodayCardProps) {
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (!nextLesson || !lessonStartTime) return;

    const [sh, sm] = lessonStartTime.split(":").map(Number);
    const target = new Date(nextLesson.date);
    target.setHours(sh, sm, 0, 0);

    const tick = () => {
      const diffSecs = Math.floor((target.getTime() - Date.now()) / 1000);
      if (diffSecs <= 0) {
        setCountdown("");
        return;
      }
      const d = Math.floor(diffSecs / 86400);
      const h = Math.floor((diffSecs % 86400) / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      if (d > 0) {
        setCountdown(`${d} kun ${pad(h)}:${pad(m)}:${pad(s)} qoldi`);
      } else {
        setCountdown(`${pad(h)}:${pad(m)}:${pad(s)} qoldi`);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextLesson, lessonStartTime]);

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 py-6 dark:border-blue-800 dark:bg-blue-950/30">
      <span className="text-4xl">🤷</span>
      <p className="text-base font-semibold">Bugun bu guruhda dars yo&apos;q</p>
      {exactDays && exactDays.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Dars kunlari:{" "}
          {exactDays
            .map(
              (d) =>
                DAY_SHORT[d.charAt(0).toUpperCase() + d.slice(1)] ?? d,
            )
            .join(", ")}
        </p>
      )}
      {nextLesson && countdown && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
          <Clock className="size-4" />
          Keyingi dars: {nextLesson.dayName},{" "}
          {formatShortDate(nextLesson.date)}, {countdown}
        </p>
      )}
    </div>
  );
}
