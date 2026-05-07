"use client";

import { useEffect, useState } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { formatShortDate, type LessonDate } from "./attendance-cycle-utils";

interface AttendanceTodayCardProps {
  todayLesson: LessonDate;
  todayStr: string;
  isAdmin: boolean;
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  onSelectDate: (date: string) => void;
}

export function AttendanceTodayCard({
  todayLesson,
  todayStr,
  isAdmin,
  lessonStartTime,
  lessonEndTime,
  onSelectDate,
}: AttendanceTodayCardProps) {
  const [countdown, setCountdown] = useState("");
  const [countdownLabel, setCountdownLabel] = useState("");

  useEffect(() => {
    if (!lessonStartTime || !lessonEndTime) return;

    const [sh, sm] = lessonStartTime.split(":").map(Number);
    const [eh, em] = lessonEndTime.split(":").map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;

    const tick = () => {
      const nowSecs = tashkentNow().seconds;
      const startSecs = startMins * 60;
      const endSecs = endMins * 60;

      let diffSecs: number;
      let label: string;

      if (nowSecs < startSecs) {
        diffSecs = startSecs - nowSecs;
        label = "Darsgacha";
      } else if (nowSecs < endSecs) {
        diffSecs = endSecs - nowSecs;
        label = "Dars tugashiga";
      } else {
        setCountdown("");
        setCountdownLabel("");
        return;
      }

      const h = Math.floor(diffSecs / 3600);
      const m = Math.floor((diffSecs % 3600) / 60);
      const s = diffSecs % 60;
      const pad = (n: number) => String(n).padStart(2, "0");
      setCountdown(`${pad(h)}:${pad(m)}:${pad(s)}`);
      setCountdownLabel(label);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [lessonStartTime, lessonEndTime]);

  const isLessonTime = (() => {
    if (!lessonStartTime || !lessonEndTime) return false;
    const nowMinutes = tashkentNow().minutes;
    const [sh, sm] = lessonStartTime.split(":").map(Number);
    const [eh, em] = lessonEndTime.split(":").map(Number);
    return nowMinutes >= sh * 60 + sm && nowMinutes <= eh * 60 + em;
  })();

  const dateLabel = `${todayLesson.dayName}, ${formatShortDate(todayStr)}.${todayStr.slice(0, 4)}`;

  // Variant 1: attendance NOT yet taken
  if (!todayLesson.hasAttendance) {
    return (
      <div
        className={cn(
          "flex items-center justify-between rounded-lg border p-4",
          isLessonTime
            ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
            : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
        )}
      >
        <div>
          <p className="text-sm font-medium">Bugungi dars — {dateLabel}</p>
          <p className="text-xs text-muted-foreground">
            {lessonStartTime} – {lessonEndTime}
            {!isLessonTime && " · Dars vaqti tugagan yoki hali boshlanmagan"}
          </p>
          {countdown && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
              <Clock className="size-3.5" />
              {countdownLabel}: {countdown}
            </p>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => onSelectDate(todayStr)}
          variant={isLessonTime ? "default" : "outline"}
        >
          Davomat olish
        </Button>
      </div>
    );
  }

  // Variant 2: attendance already taken
  return (
    <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
      <div>
        <p className="text-sm font-medium">Bugungi dars — {dateLabel}</p>
        <p className="text-xs text-muted-foreground">
          Davomat olingan: {todayLesson.presentCount}/{todayLesson.totalStudents}{" "}
          keldi
        </p>
        {countdown && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <Clock className="size-3.5" />
            {countdownLabel}: {countdown}
          </p>
        )}
      </div>
      {isAdmin ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onSelectDate(todayStr)}
        >
          Tahrirlash
        </Button>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 dark:border-green-700 dark:bg-green-950/50 dark:text-green-400">
          <Check className="size-3.5" />
          Davomat olib bo&apos;lingan
        </span>
      )}
    </div>
  );
}
