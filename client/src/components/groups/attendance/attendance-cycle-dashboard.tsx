"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";
import {
  getCycleSize,
  getMonthRange,
  MONTH_NAMES,
  type LessonDate,
} from "./attendance-cycle-utils";
import { AttendanceTodayCard } from "./attendance-today-card";
import { AttendanceNoLessonTodayCard } from "./attendance-no-lesson-today-card";
import { AttendanceCycleGrid } from "./attendance-cycle-grid";
import { AttendanceMissedLessons } from "./attendance-missed-lessons";

interface AttendanceCycleDashboardProps {
  group: GroupData;
  onSelectDate: (date: string) => void;
}

export function AttendanceCycleDashboard({
  group,
  onSelectDate,
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

  const todayLesson = allLessons.find((l) => l.date === todayStr);
  const hasTodayLesson = !!todayLesson;
  const nextLessonDate = useMemo(
    () =>
      !todayLesson
        ? (allLessons.find((l) => l.date > todayStr) ?? null)
        : null,
    [todayLesson, allLessons, todayStr],
  );

  const globalOffset = isAdmin ? currentCycleIndex * cycleSize : 0;
  const progressPct =
    currentLessons.length > 0
      ? Math.round((summary.taken / currentLessons.length) * 100)
      : 0;

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
      <div className="flex h-24 items-center justify-center rounded-md border">
        <p className="text-sm text-muted-foreground">
          Dars kunlari mavjud emas
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {todayLesson && (
        <AttendanceTodayCard
          todayLesson={todayLesson}
          todayStr={todayStr}
          isAdmin={isAdmin}
          lessonStartTime={group.lessonStartTime ?? null}
          lessonEndTime={group.lessonEndTime ?? null}
          onSelectDate={onSelectDate}
        />
      )}

      {!hasTodayLesson && (
        <AttendanceNoLessonTodayCard
          exactDays={group.exactDays}
          nextLesson={nextLessonDate}
          lessonStartTime={group.lessonStartTime ?? null}
        />
      )}

      {/* Cycle navigation */}
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
              : (monthGroups[currentCycleIndex]?.label ?? "")}
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
        <AttendanceCycleGrid
          lessons={currentLessons}
          cycleSize={cycleSize}
          todayStr={todayStr}
          onSelectDate={onSelectDate}
        />
      )}

      {/* Missed lessons (admin only) */}
      {isAdmin && (
        <AttendanceMissedLessons
          cycleLessons={currentLessons}
          todayStr={todayStr}
          onSelectDate={onSelectDate}
        />
      )}
    </div>
  );
}
