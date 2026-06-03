"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import {
  CalendarDays,
  CalendarX,
  DoorOpen,
  GraduationCap,
  LayoutGrid,
  List,
  RotateCcw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { DashboardDailySchedule } from "./dashboard/dashboard-daily-schedule";
import type { DashboardLesson } from "./dashboard/dashboard-daily-schedule";
import { DashboardRoomOccupancy } from "./dashboard/dashboard-room-occupancy";
import { DashboardScheduleSkeleton } from "./dashboard/dashboard-schedule-skeleton";

interface Room {
  id: string;
  name: string;
  capacity: number | null;
}

interface TodayScheduleResponse {
  lessons: DashboardLesson[];
  rooms: Room[];
  workingHours: { start: string; end: string };
  isHoliday: boolean;
  holidayName: string | null;
  date: string;
}

export function DashboardClient() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scheduleView = searchParams.get("view") === "list" ? "list" : "grid";

  const handleViewChange = useCallback(
    (view: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (view === "grid") {
        params.delete("view");
      } else {
        params.set("view", view);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const isTeacher =
    user?.roles.some((r) => r.id === 4) &&
    !user?.roles.some((r) => [1, 2, 3].includes(r.id));

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const isTodaySelected = isToday(selectedDate);
  const dateParam = format(selectedDate, "yyyy-MM-dd");

  const { data, isPending } = useQuery({
    queryKey: ["dashboard", "today-schedule", selectedBranch?.id, dateParam],
    queryFn: () =>
      api
        .get<TodayScheduleResponse>("/dashboard/today-schedule", {
          params: { branchId: selectedBranch!.id, date: dateParam },
        })
        .then((r) => r.data),
    enabled: !!selectedBranch,
  });

  // isPending stays true while the query is `enabled: false` (waiting for the
  // branch switcher to hydrate from the /branches request) AND while it's
  // actually fetching, so the skeleton appears immediately on page load —
  // not only after the branch is resolved. Without this, in production the
  // /branches network round-trip leaves a visible gap where only the
  // DatePicker is rendered. See `useBranchSwitcher`.
  const showSkeleton = isPending;

  // Teacher sees only their own lessons in the schedule table
  const myLessons = useMemo(() => {
    if (!data) return [];
    if (!isTeacher || !user) return data.lessons;
    return data.lessons.filter((l) =>
      l.teachers.some((t) => t.id === user.id)
    );
  }, [data, isTeacher, user]);

  // Stats computed from teacher's own lessons or all lessons
  const stats = useMemo(() => {
    if (!data) return { lessonsCount: 0, studentsCount: 0 };
    return {
      lessonsCount: myLessons.length,
      studentsCount: myLessons.reduce((sum, l) => sum + l.studentCount, 0),
    };
  }, [data, myLessons]);

  const adminStats = useMemo(() => {
    if (!data || isTeacher) return { busyRooms: 0, teachersCount: 0 };
    const busyRoomIds = new Set(
      data.lessons.filter((l) => l.roomId).map((l) => l.roomId)
    );
    const teacherIds = new Set(
      data.lessons.flatMap((l) => l.teachers.map((t) => t.id))
    );
    return {
      busyRooms: busyRoomIds.size,
      teachersCount: teacherIds.size,
    };
  }, [data, isTeacher]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {!isTodaySelected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate(new Date())}
              >
                <RotateCcw className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bugunga qaytish</TooltipContent>
          </Tooltip>
        )}
        <DatePicker
          value={selectedDate}
          onChange={(d) => d && setSelectedDate(d)}
          className="w-auto"
        />
      </div>

      {showSkeleton && <DashboardScheduleSkeleton />}

      {data?.isHoliday && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20 p-4">
          <div className="flex items-center gap-3">
            <CalendarX className="size-5 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-300">
                {isTodaySelected
                  ? "Bugun dam olish kuni"
                  : `${format(selectedDate, "dd.MM.yyyy")} — dam olish kuni`}
              </p>
              {data.holidayName && (
                <p className="text-sm text-orange-600 dark:text-orange-400">
                  {data.holidayName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {data && !showSkeleton && (
        <>
          {/* Stats */}
          <div
            className={`grid gap-2 sm:gap-3 ${isTeacher ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                  <CalendarDays className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs truncate">
                      {isTeacher ? "Darslarim" : "Darslar"}
                    </p>
                    <p className="text-base sm:text-lg font-semibold">
                      {stats.lessonsCount}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isTeacher
                  ? "Tanlangan kundagi darslaringiz soni"
                  : "Tanlangan kundagi darslar soni"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                  <Users className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs truncate">
                      {isTeacher ? "O'quvchilarim" : "Jami o'quvchilar"}
                    </p>
                    <p className="text-base sm:text-lg font-semibold">
                      {stats.studentsCount}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isTeacher
                  ? "Tanlangan kundagi darslaringizdagi jami o'quvchilar"
                  : "Tanlangan kundagi darslardagi jami o'quvchilar"}
              </TooltipContent>
            </Tooltip>

            {!isTeacher && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                      <DoorOpen className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-xs truncate">
                          Band xonalar
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {adminStats.busyRooms}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Kamida bitta dars rejalashtirilgan xonalar
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                      <GraduationCap className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-xs truncate">
                          O&apos;qituvchilar
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {adminStats.teachersCount}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Tanlangan kunda dars beruvchi o&apos;qituvchilar soni
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* Schedule card with Grid / List tabs */}
          <Tabs
            value={scheduleView}
            onValueChange={handleViewChange}
            className="rounded-lg border bg-card overflow-hidden gap-0"
          >
            <div className="flex items-center justify-between border-b px-3 py-2 gap-3 flex-wrap">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="size-4 text-muted-foreground" />
                {isTodaySelected
                  ? "Bugungi darslar"
                  : `${format(selectedDate, "dd.MM.yyyy")} darslar`}
                <span className="text-xs font-normal text-muted-foreground">
                  ({myLessons.length})
                </span>
              </h2>
              <TabsList>
                <TabsTrigger value="grid">
                  <LayoutGrid className="size-3.5 mr-1" /> Grid
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="size-3.5 mr-1" /> Ro&apos;yxat
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="grid" className="p-3 mt-0">
              <DashboardRoomOccupancy
                lessons={myLessons}
                rooms={data.rooms}
                workingHours={data.workingHours}
                isTeacher={isTeacher}
                isToday={isTodaySelected}
              />
            </TabsContent>
            <TabsContent value="list" className="mt-0">
              <DashboardDailySchedule
                lessons={myLessons}
                isToday={isTodaySelected}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
