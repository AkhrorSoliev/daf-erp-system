"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { tashkentNow } from "@/lib/tashkent-time";
import { useAuth } from "@/hooks/use-auth";
import type { GroupData } from "@/hooks/use-edit-group";
import {
  AttendanceMonthCalendar,
  type LessonCalendarCell,
} from "./attendance-month-calendar";
import { AttendanceTodayCard } from "./attendance-today-card";
import { AttendanceNoLessonTodayCard } from "./attendance-no-lesson-today-card";
import { AttendanceMissedLessons } from "./attendance-missed-lessons";

interface AttendanceCycleDashboardProps {
  group: GroupData;
  onSelectDate: (date: string) => void;
}

interface CalendarResponse {
  cells: LessonCalendarCell[];
}

// LessonDate-shaped projection used by the legacy today/missed cards.
interface LessonDateLike {
  date: string;
  dayName: string;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
}

function lessonDateFromCell(c: LessonCalendarCell): LessonDateLike {
  return {
    date: c.date,
    dayName: c.dayName,
    hasAttendance: c.hasAttendance,
    presentCount: c.presentCount,
    absentCount: c.absentCount,
    lateCount: c.lateCount,
    excusedCount: c.excusedCount,
    totalStudents: c.totalStudents,
  };
}

export function AttendanceCycleDashboard({
  group,
  onSelectDate,
}: AttendanceCycleDashboardProps) {
  const user = useAuth((s) => s.user);
  const isAdmin = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;

  // "Today" is the Tashkent calendar date (not the browser's local date) —
  // backend lesson queries are scoped to Tashkent days, so a Berlin user
  // opening the dashboard near midnight should still see the same day a
  // Tashkent user does.
  const todayStr = tashkentNow().dateStr;
  const [todayY, todayM] = todayStr.split("-").map(Number);

  // Visible month: drives the calendar query. Defaults to current month so
  // the user sees today by default, with the today card matching.
  const [visibleMonth, setVisibleMonth] = useState<Date>(
    () => new Date(todayY, todayM - 1, 1),
  );

  // Calendar cells for the visible month — drives both the calendar grid
  // and (when visibleMonth is the current month) the today/missed cards.
  const calendarQuery = useQuery<CalendarResponse>({
    queryKey: [
      "attendance-calendar",
      group.id,
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
    ],
    queryFn: () =>
      api
        .get<CalendarResponse>(`/attendance/${group.id}/calendar`, {
          params: {
            month: visibleMonth.getMonth() + 1,
            year: visibleMonth.getFullYear(),
          },
        })
        .then((r) => r.data),
  });

  // Always-fetched current-month query so the today/no-lesson card stays
  // accurate even when the admin is browsing a different month. Deduped
  // by react-query when current === visible.
  const currentMonthKey = useMemo(
    () => ({ year: todayY, month: todayM }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const currentMonthQuery = useQuery<CalendarResponse>({
    queryKey: [
      "attendance-calendar",
      group.id,
      currentMonthKey.year,
      currentMonthKey.month,
    ],
    queryFn: () =>
      api
        .get<CalendarResponse>(`/attendance/${group.id}/calendar`, {
          params: currentMonthKey,
        })
        .then((r) => r.data),
  });

  const visibleCells = calendarQuery.data?.cells ?? [];
  const currentMonthCells = currentMonthQuery.data?.cells ?? [];

  // Today / next lesson — derived from the current-month query, not the
  // visible-month one (so the cards don't disappear when admin scrolls to
  // a different month).
  const liveCurrent = useMemo(
    () =>
      currentMonthCells.filter(
        (c) => c.type === "regular" || c.type === "rescheduledTo",
      ),
    [currentMonthCells],
  );
  const todayLesson = liveCurrent.find((c) => c.date === todayStr);
  const nextLessonDate = useMemo(
    () =>
      !todayLesson
        ? (liveCurrent.find((c) => c.date > todayStr) ?? null)
        : null,
    [todayLesson, liveCurrent, todayStr],
  );

  const visibleLiveCells = useMemo(
    () =>
      visibleCells
        .filter((c) => c.type === "regular" || c.type === "rescheduledTo")
        .map(lessonDateFromCell),
    [visibleCells],
  );

  // Visible-month progress strip.
  const summary = useMemo(() => {
    let taken = 0;
    let missed = 0;
    let upcoming = 0;
    for (const c of visibleCells) {
      if (c.type !== "regular" && c.type !== "rescheduledTo") continue;
      if (c.hasAttendance) taken++;
      else if (c.date < todayStr) missed++;
      else upcoming++;
    }
    return { taken, missed, upcoming, total: taken + missed + upcoming };
  }, [visibleCells, todayStr]);
  const progressPct =
    summary.total > 0 ? Math.round((summary.taken / summary.total) * 100) : 0;

  if (calendarQuery.isLoading && currentMonthQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {todayLesson && (
        <AttendanceTodayCard
          todayLesson={lessonDateFromCell(todayLesson)}
          todayStr={todayStr}
          isAdmin={isAdmin}
          lessonStartTime={group.lessonStartTime ?? null}
          lessonEndTime={group.lessonEndTime ?? null}
          onSelectDate={onSelectDate}
        />
      )}

      {!todayLesson && (
        <AttendanceNoLessonTodayCard
          exactDays={group.exactDays}
          nextLesson={
            nextLessonDate ? lessonDateFromCell(nextLessonDate) : null
          }
          lessonStartTime={group.lessonStartTime ?? null}
        />
      )}

      {/* Visible-month progress bar (admin only) */}
      {isAdmin && summary.total > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-emerald-600 dark:text-emerald-400">
              Olingan: {summary.taken}/{summary.total}
            </span>
            {summary.missed > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                Olinmagan: {summary.missed}
              </span>
            )}
            {summary.upcoming > 0 && (
              <span className="text-muted-foreground">
                Kelgusi: {summary.upcoming}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              {progressPct}%
            </span>
          </div>
        </div>
      )}

      <AttendanceMonthCalendar
        cells={visibleCells}
        isLoading={calendarQuery.isLoading}
        onSelectDate={onSelectDate}
        onMonthChange={setVisibleMonth}
        initialMonth={visibleMonth}
      />

      {isAdmin && visibleLiveCells.length > 0 && (
        <AttendanceMissedLessons
          cycleLessons={visibleLiveCells}
          todayStr={todayStr}
          onSelectDate={onSelectDate}
        />
      )}
    </div>
  );
}
