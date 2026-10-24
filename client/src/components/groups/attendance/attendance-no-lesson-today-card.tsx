"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { useT } from "@/i18n/context";
import { formatWeekdays } from "@/lib/weekdays";
import { formatShortDate, type LessonDate } from "./attendance-cycle-utils";
import { dayNameOf } from "./attendance-form-utils";

interface AttendanceNoLessonTodayCardProps {
  exactDays: string[] | undefined;
  nextLesson: LessonDate | null;
  lessonStartTime: string | null;
}

/** Time left until the next lesson: whole days apart from the clock. */
interface Countdown {
  days: number;
  clock: string;
}

export function AttendanceNoLessonTodayCard({
  exactDays,
  nextLesson,
  lessonStartTime,
}: AttendanceNoLessonTodayCardProps) {
  const t = useT();
  const [countdown, setCountdown] = useState<Countdown | null>(null);

  useEffect(() => {
    if (!nextLesson || !lessonStartTime) return;

    const [sh, sm] = lessonStartTime.split(":").map(Number);
    const target = new Date(nextLesson.date);
    target.setHours(sh, sm, 0, 0);

    const tick = () => {
      const diffSecs = Math.floor((target.getTime() - Date.now()) / 1000);
      if (diffSecs <= 0) {
        setCountdown(null);
        return;
      }
      const d = Math.floor(diffSecs / 86400);
      const h = Math.floor((diffSecs % 86400) / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setCountdown({ days: d, clock: `${pad(h)}:${pad(m)}:${pad(s)}` });
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [nextLesson, lessonStartTime]);

  const nextDayKey = nextLesson ? dayNameOf(nextLesson.date) : "";
  const countdownText = countdown
    ? countdown.days > 0
      ? t("{d} kun {time} qoldi", { d: countdown.days, time: countdown.clock })
      : t("{time} qoldi", { time: countdown.clock })
    : "";

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 py-6 dark:border-blue-800 dark:bg-blue-950/30">
      <span className="text-4xl">🤷</span>
      <p className="text-base font-semibold">
        {t("Bugun bu guruhda dars yo'q")}
      </p>
      {exactDays && exactDays.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("Dars kunlari: {days}", { days: formatWeekdays(exactDays, t) })}
        </p>
      )}
      {nextLesson && countdown && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
          <Clock className="size-4" />
          {t("Keyingi dars: {day}, {date}, {left}", {
            day: nextDayKey ? t(nextDayKey) : nextLesson.dayName,
            date: formatShortDate(nextLesson.date),
            left: countdownText,
          })}
        </p>
      )}
    </div>
  );
}
