"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Check,
  AlertTriangle,
  Circle,
  ChevronRight as GoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";

interface LessonDate {
  date: string;
  dayName: string;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
}

interface AttendanceCycleDashboardProps {
  group: GroupData;
  onSelectDate: (date: string) => void;
  onShowStats: () => void;
}

const DAY_SHORT: Record<string, string> = {
  Dushanba: "Du",
  Seshanba: "Se",
  Chorshanba: "Ch",
  Payshanba: "Pa",
  Juma: "Ju",
  Shanba: "Sh",
  Yakshanba: "Ya",
};

const MONTH_NAMES: Record<number, string> = {
  1: "Yanvar", 2: "Fevral", 3: "Mart", 4: "Aprel",
  5: "May", 6: "Iyun", 7: "Iyul", 8: "Avgust",
  9: "Sentabr", 10: "Oktabr", 11: "Noyabr", 12: "Dekabr",
};

function getCycleSize(courseName: string): number {
  return /intensiv/i.test(courseName) ? 20 : 12;
}

function formatShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${d}.${m}`;
}

function getMonthRange(
  startDate: string | null,
): { month: number; year: number }[] {
  const now = new Date();
  const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), 0, 1);

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

export function AttendanceCycleDashboard({
  group,
  onSelectDate,
  onShowStats,
}: AttendanceCycleDashboardProps) {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  const [allLessons, setAllLessons] = useState<LessonDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentCycleIndex, setCurrentCycleIndex] = useState(-1);
  const fetchedRef = useRef(false);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cycleSize = getCycleSize(group.course?.name ?? "");

  // Fetch all months from group start to now+1
  const fetchAllLessons = useCallback(async () => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);

    try {
      const months = getMonthRange(group.startDate);
      const responses = await Promise.all(
        months.map(({ month, year }) =>
          api
            .get(`/attendance/${group.id}/dates`, { params: { month, year } })
            .then((r) => r.data as LessonDate[])
            .catch(() => [] as LessonDate[]),
        ),
      );

      // Merge, deduplicate by date, sort
      const dateMap = new Map<string, LessonDate>();
      for (const monthData of responses) {
        for (const lesson of monthData) {
          dateMap.set(lesson.date, lesson);
        }
      }
      const sorted = Array.from(dateMap.values()).sort((a, b) =>
        a.date.localeCompare(b.date),
      );
      setAllLessons(sorted);
    } catch {
      setAllLessons([]);
    } finally {
      setLoading(false);
    }
  }, [group.id, group.startDate]);

  useEffect(() => {
    fetchAllLessons();
  }, [fetchAllLessons]);

  // Split into cycles
  const cycles = useMemo(() => {
    const result: LessonDate[][] = [];
    for (let i = 0; i < allLessons.length; i += cycleSize) {
      result.push(allLessons.slice(i, i + cycleSize));
    }
    return result;
  }, [allLessons, cycleSize]);

  // Month-based grouping for teacher view
  const monthGroups = useMemo(() => {
    if (isAdmin) return [];
    const map = new Map<string, LessonDate[]>();
    for (const lesson of allLessons) {
      const key = lesson.date.slice(0, 7); // "YYYY-MM"
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lesson);
    }
    return Array.from(map.entries()).map(([key, lessons]) => {
      const [y, m] = key.split("-").map(Number);
      return { label: `${MONTH_NAMES[m]} ${y}`, month: m, year: y, lessons };
    });
  }, [allLessons, isAdmin]);

  // Auto-detect current cycle/month on first load
  useEffect(() => {
    if (currentCycleIndex >= 0) return;
    if (isAdmin) {
      if (cycles.length === 0) return;
      const idx = cycles.findIndex((cycle) =>
        cycle.some((l) => l.date >= todayStr),
      );
      setCurrentCycleIndex(idx >= 0 ? idx : cycles.length - 1);
    } else {
      if (monthGroups.length === 0) return;
      const todayMonth = now.getMonth() + 1;
      const todayYear = now.getFullYear();
      const idx = monthGroups.findIndex(
        (mg) => mg.month === todayMonth && mg.year === todayYear,
      );
      setCurrentCycleIndex(idx >= 0 ? idx : monthGroups.length - 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles, monthGroups, currentCycleIndex, todayStr, isAdmin]);

  const currentLessons = isAdmin
    ? (cycles[currentCycleIndex] ?? [])
    : (monthGroups[currentCycleIndex]?.lessons ?? []);
  const totalItems = isAdmin ? cycles.length : monthGroups.length;

  // Cycle/month summary
  const summary = useMemo(() => {
    let taken = 0;
    let missed = 0;
    let future = 0;
    let today = 0;

    for (const lesson of currentLessons) {
      if (lesson.date === todayStr) {
        today++;
        if (lesson.hasAttendance) taken++;
      } else if (lesson.hasAttendance) {
        taken++;
      } else if (lesson.date < todayStr) {
        missed++;
      } else {
        future++;
      }
    }
    return { taken, missed, future, today };
  }, [currentLessons, todayStr]);

  // Get lesson status
  const getLessonStatus = (lesson: LessonDate) => {
    if (lesson.hasAttendance) return "taken";
    if (lesson.date === todayStr) return "today";
    if (lesson.date < todayStr) return "missed";
    return "future";
  };

  // Today's lesson (check all lessons, not just current view)
  const todayLesson = allLessons.find((l) => l.date === todayStr);
  const isLessonTime = (() => {
    if (!todayLesson || !group.lessonStartTime || !group.lessonEndTime)
      return false;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = group.lessonStartTime.split(":").map(Number);
    const [eh, em] = group.lessonEndTime.split(":").map(Number);
    return nowMinutes >= sh * 60 + sm && nowMinutes <= eh * 60 + em;
  })();

  // Missed lessons (max 3)
  const missedLessons = currentLessons
    .filter((l) => !l.hasAttendance && l.date < todayStr && l.date !== todayStr)
    .slice(0, 3);

  // Global lesson number offset (admin only)
  const globalOffset = isAdmin ? currentCycleIndex * cycleSize : 0;

  // Progress percentage
  const progressPct =
    currentLessons.length > 0
      ? Math.round((summary.taken / currentLessons.length) * 100)
      : 0;

  // Check if today has a lesson in this group at all
  const hasTodayLesson = allLessons.some((l) => l.date === todayStr);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-6 gap-3 sm:grid-cols-12">
          {Array.from({ length: cycleSize }).map((_, i) => (
            <Skeleton key={i} className="mx-auto size-11 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (allLessons.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onShowStats}>
                <BarChart3 className="mr-1.5 size-4" />
                Statistika
              </Button>
            </TooltipTrigger>
            <TooltipContent>Davr bo&apos;yicha davomat statistikasi</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">
            Dars kunlari mavjud emas
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Today's quick action */}
      {todayLesson && !todayLesson.hasAttendance && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border p-4",
            isLessonTime
              ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
          )}
        >
          <div>
            <p className="text-sm font-medium">
              Bugungi dars — {todayLesson.dayName},{" "}
              {formatShortDate(todayStr)}.{now.getFullYear()}
            </p>
            <p className="text-xs text-muted-foreground">
              {group.lessonStartTime} – {group.lessonEndTime}
              {!isLessonTime &&
                " · Dars vaqti tugagan yoki hali boshlanmagan"}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => onSelectDate(todayStr)}
            variant={isLessonTime ? "default" : "outline"}
          >
            Davomat olish
          </Button>
        </div>
      )}

      {todayLesson && todayLesson.hasAttendance && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
          <div>
            <p className="text-sm font-medium">
              Bugungi dars — {todayLesson.dayName},{" "}
              {formatShortDate(todayStr)}.{now.getFullYear()}
            </p>
            <p className="text-xs text-muted-foreground">
              Davomat olingan: {todayLesson.presentCount}/
              {todayLesson.totalStudents} keldi
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectDate(todayStr)}
          >
            Tahrirlash
          </Button>
        </div>
      )}

      {/* No lesson today message */}
      {!hasTodayLesson && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50">
            <Circle className="size-4 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-medium">
              Bugun bu guruhda dars yo&apos;q
            </p>
            {group.exactDays?.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Dars kunlari: {group.exactDays.map((d: string) => DAY_SHORT[d.charAt(0).toUpperCase() + d.slice(1)] ?? d).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Cycle navigation + stats button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentCycleIndex((i) => i - 1)}
            disabled={currentCycleIndex <= 0}
            className="size-8"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-44 text-center text-sm font-medium">
            {isAdmin
              ? `Sikl ${currentCycleIndex + 1} (${globalOffset + 1}-${globalOffset + currentLessons.length} darslar)`
              : monthGroups[currentCycleIndex]?.label ?? ""}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentCycleIndex((i) => i + 1)}
            disabled={currentCycleIndex >= totalItems - 1}
            className="size-8"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onShowStats}>
              <BarChart3 className="mr-1.5 size-4" />
              Statistika
            </Button>
          </TooltipTrigger>
          <TooltipContent>Davr bo&apos;yicha davomat statistikasi</TooltipContent>
        </Tooltip>
      </div>

      {/* Cycle summary + progress bar */}
      {isAdmin ? (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-green-600 dark:text-green-400">
              Olingan: {summary.taken}/{currentLessons.length}
            </span>
            {summary.missed > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                Olinmagan: {summary.missed}
              </span>
            )}
            <span className="text-muted-foreground">
              Kelgusi: {summary.future + summary.today}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {progressPct}%
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border p-3">
          <span className="text-sm font-medium text-green-600 dark:text-green-400">
            O&apos;tilgan: {progressPct}%
          </span>
        </div>
      )}

      {/* Lesson circles (admin only) */}
      {isAdmin && (
        <div
          className={cn(
            "grid gap-2",
            cycleSize === 20
              ? "grid-cols-5 sm:grid-cols-10"
              : "grid-cols-6 sm:grid-cols-12",
          )}
        >
          {currentLessons.map((lesson, index) => {
            const status = getLessonStatus(lesson);
            return (
              <button
                key={lesson.date}
                onClick={() => onSelectDate(lesson.date)}
                className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-muted/60"
              >
                {/* Circle */}
                <div
                  className={cn(
                    "relative flex size-10 items-center justify-center rounded-full text-sm font-semibold transition-all sm:size-11",
                    status === "taken" &&
                      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
                    status === "missed" &&
                      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                    status === "today" &&
                      "bg-blue-100 text-blue-700 ring-2 ring-blue-400 dark:bg-blue-900/40 dark:text-blue-400 dark:ring-blue-500",
                    status === "future" &&
                      "bg-muted text-muted-foreground",
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

                {/* Lesson number */}
                <span className="text-[10px] font-medium text-muted-foreground">
                  {index + 1}-dars
                </span>

                {/* Date */}
                <span className="text-[10px] text-muted-foreground">
                  {formatShortDate(lesson.date)}
                </span>

                {/* Day abbreviation */}
                <span className="text-[10px] text-muted-foreground/70">
                  {DAY_SHORT[lesson.dayName] ?? lesson.dayName.slice(0, 2)}
                </span>
              </button>
            );
          })}

          {/* Empty placeholders for incomplete cycle */}
          {currentLessons.length < cycleSize &&
            Array.from({ length: cycleSize - currentLessons.length }).map(
              (_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex flex-col items-center gap-1 p-1 opacity-30"
                >
                  <div className="flex size-10 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 sm:size-11">
                    <span className="text-xs text-muted-foreground">
                      {currentLessons.length + i + 1}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {currentLessons.length + i + 1}-dars
                  </span>
                  <span className="text-[10px] text-muted-foreground">—</span>
                  <span className="text-[10px] text-muted-foreground/70">—</span>
                </div>
              ),
            )}
        </div>
      )}

      {/* Missed lessons alert cards (admin only) */}
      {isAdmin && missedLessons.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Davomat olinmagan darslar:
          </p>
          {missedLessons.map((lesson) => {
            const lessonIndex = currentLessons.indexOf(lesson);
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
      )}
    </div>
  );
}
