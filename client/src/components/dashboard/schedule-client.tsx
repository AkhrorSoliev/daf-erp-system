"use client";

/**
 * Kunlik dars jadvali — `/schedule` sahifasining butun mazmuni.
 *
 * Ilgari bu bosh sahifaning O'ZI edi. Bosh sahifa boshqaruv paneliga
 * aylangach jadval shu yerga ko'chdi; `/` da uni faqat «faqat o'qituvchi»
 * roli ko'radi, chunki o'qituvchiga aynan shu kerak.
 */
import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, isToday } from "date-fns";
import {
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
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
import { useT } from "@/i18n/context";
import { isTeacherOnly } from "@/lib/teacher-only";
import { DashboardDailySchedule } from "./dashboard-daily-schedule";
import { TeacherLessonCards } from "./teacher-lesson-cards";
import { UpcomingGroups } from "./upcoming-groups";
import type { DashboardLesson } from "./dashboard-daily-schedule";
import { DashboardRoomOccupancy } from "./dashboard-room-occupancy";
import { DashboardScheduleSkeleton } from "./dashboard-schedule-skeleton";

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

export function ScheduleClient() {
  const t = useT();
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const user = useAuth((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTeacher = isTeacherOnly(user?.roles);
  // The room grid is for whoever plans rooms. A teacher's day is a list of
  // their own lessons, so for them the list is the only view.
  const scheduleView =
    isTeacher || searchParams.get("view") === "list" ? "list" : "grid";

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
    // The daily timetable is inherently a SINGLE branch's view — it is laid out
    // against that branch's rooms and working hours — so unlike the other lists
    // it cannot render a consolidated "Barcha filiallar". The query stays
    // disabled without a branch and the UI says why (below) rather than showing
    // an empty grid that looks like a day with no lessons.
    enabled: !!selectedBranch,
  });

  const needsBranchPick = branchLoaded && !selectedBranch;

  // isPending stays true while the query is `enabled: false` (waiting for the
  // branch switcher to hydrate from the /branches request) AND while it's
  // actually fetching, so the skeleton appears immediately on page load —
  // not only after the branch is resolved. Without this, in production the
  // /branches network round-trip leaves a visible gap where only the
  // DatePicker is rendered. See `useBranchSwitcher`.
  // Not while we are waiting for a branch PICK — that is a decision, not a load.
  const showSkeleton = isPending && !needsBranchPick;

  // Teacher sees only their own lessons in the schedule table
  const myLessons = useMemo(() => {
    if (!data) return [];
    if (!isTeacher || !user) return data.lessons;
    return data.lessons.filter((l) =>
      l.teachers.some((teacher) => teacher.id === user.id)
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
      data.lessons.flatMap((l) => l.teachers.map((teacher) => teacher.id))
    );
    return {
      busyRooms: busyRoomIds.size,
      teachersCount: teacherIds.size,
    };
  }, [data, isTeacher]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Oldingi kun"
          onClick={() => setSelectedDate((d) => addDays(d, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
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
            <TooltipContent>{t("Bugunga qaytish")}</TooltipContent>
          </Tooltip>
        )}
        <DatePicker
          value={selectedDate}
          onChange={(d) => d && setSelectedDate(d)}
          className="w-auto"
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Keyingi kun"
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {needsBranchPick && (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm font-medium">
            {t("Kunlik jadval uchun filial tanlang")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Jadval bitta filialning xonalari va ish vaqti bo'yicha chiziladi, shuning uchun «Barcha filiallar» ko'rinishida ko'rsatilmaydi. Yuqoridagi almashtirgichdan filialni tanlang.",
            )}
          </p>
        </div>
      )}
      {showSkeleton && <DashboardScheduleSkeleton />}

      {data?.isHoliday && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20 p-4">
          <div className="flex items-center gap-3">
            <CalendarX className="size-5 text-orange-600 dark:text-orange-400" />
            <div>
              <p className="font-medium text-orange-800 dark:text-orange-300">
                {isTodaySelected
                  ? t("Bugun dam olish kuni")
                  : t("{date} — dam olish kuni", {
                      date: format(selectedDate, "dd.MM.yyyy"),
                    })}
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
                      {isTeacher ? t("Darslarim") : t("Darslar")}
                    </p>
                    <p className="text-base sm:text-lg font-semibold">
                      {stats.lessonsCount}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isTeacher
                  ? t("Tanlangan kundagi darslaringiz soni")
                  : t("Tanlangan kundagi darslar soni")}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                  <Users className="text-muted-foreground size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-xs truncate">
                      {isTeacher ? t("O'quvchilarim") : t("Jami o'quvchilar")}
                    </p>
                    <p className="text-base sm:text-lg font-semibold">
                      {stats.studentsCount}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {isTeacher
                  ? t("Tanlangan kundagi darslaringizdagi jami o'quvchilar")
                  : t("Tanlangan kundagi darslardagi jami o'quvchilar")}
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
                          {t("Band xonalar")}
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {adminStats.busyRooms}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("Kamida bitta dars rejalashtirilgan xonalar")}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="bg-card flex items-center gap-2 sm:gap-3 rounded-lg border px-2.5 py-2 sm:p-3">
                      <GraduationCap className="text-muted-foreground size-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-muted-foreground text-xs truncate">
                          {t("O'qituvchilar")}
                        </p>
                        <p className="text-base sm:text-lg font-semibold">
                          {adminStats.teachersCount}
                        </p>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("Tanlangan kunda dars beruvchi o'qituvchilar soni")}
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
                  ? t("Bugungi darslar")
                  : t("{date} darslar", {
                      date: format(selectedDate, "dd.MM.yyyy"),
                    })}
                <span className="text-xs font-normal text-muted-foreground">
                  ({myLessons.length})
                </span>
              </h2>
              {!isTeacher && (
                <TabsList>
                  <TabsTrigger value="grid">
                    <LayoutGrid className="size-3.5 mr-1" /> {t("Grid")}
                  </TabsTrigger>
                  <TabsTrigger value="list">
                    <List className="size-3.5 mr-1" /> {t("Ro'yxat")}
                  </TabsTrigger>
                </TabsList>
              )}
            </div>
            <TabsContent value="grid" className="p-3 mt-0">
              <DashboardRoomOccupancy
                lessons={myLessons}
                rooms={data.rooms}
                workingHours={data.workingHours}
                isTeacher={isTeacher}
                isToday={isTodaySelected}
                date={dateParam}
              />
            </TabsContent>
            <TabsContent value="list" className="mt-0">
              {isTeacher ? (
                <TeacherLessonCards lessons={myLessons} isToday={isTodaySelected} />
              ) : (
                <DashboardDailySchedule
                  lessons={myLessons}
                  isToday={isTodaySelected}
                  date={dateParam}
                />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      {isTeacher && <UpcomingGroups />}
    </div>
  );
}
