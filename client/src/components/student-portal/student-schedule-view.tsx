"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, ChevronRight, Clock, GraduationCap, BookOpen, DoorOpen, CalendarX,
} from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, addWeeks } from "date-fns";
import { uz } from "date-fns/locale";

const WEEKDAY_INDEX: Record<string, number> = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4,
  FRIDAY: 5, SATURDAY: 6, SUNDAY: 0,
};

interface ScheduleGroup {
  groupId: number;
  groupName: string;
  courseName: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  teachers: { id: number; firstName: string; lastName: string }[];
  room: { id: number; name: string } | null;
}

export function StudentScheduleView() {
  const { data: schedule = [], isLoading } = useQuery({
    queryKey: ["student-portal", "schedule"],
    queryFn: () => api.get("/student-portal/schedule").then((r) => r.data as ScheduleGroup[]),
  });

  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const weekStart = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), weekOffset);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart.toISOString()]
  );

  // Faqat dars bor kunlarni filtrlash
  const daySchedule = useMemo(() => {
    return weekDays
      .map((date) => {
        const dayIndex = date.getDay();
        const classes = schedule
          .filter((s) => s.exactDays.some((d) => WEEKDAY_INDEX[d] === dayIndex))
          .sort((a, b) => (a.lessonStartTime ?? "").localeCompare(b.lessonStartTime ?? ""));
        return { date, classes };
      })
      .filter(({ classes }) => classes.length > 0);
  }, [weekDays, schedule]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-3">
        <Skeleton className="h-12 rounded-lg" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      {/* Hafta tanlash */}
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setWeekOffset((o) => o - 1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-medium">
            {format(weekDays[0], "d MMM", { locale: uz })} – {format(weekDays[6], "d MMM yyyy", { locale: uz })}
          </p>
          {weekOffset === 0 && (
            <p className="text-[10px] text-primary font-medium uppercase tracking-wider">Joriy hafta</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setWeekOffset((o) => o + 1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {weekOffset !== 0 && (
        <button onClick={() => setWeekOffset(0)} className="w-full text-center text-xs text-primary font-medium hover:underline py-1">
          Bugunga qaytish
        </button>
      )}

      {/* Dars kunlari */}
      {daySchedule.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <CalendarX className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Bu hafta darslar yo'q</p>
        </div>
      ) : (
        <div className="space-y-3">
          {daySchedule.map(({ date, classes }) => {
            const isToday = isSameDay(date, today);
            const dayName = format(date, "EEEE", { locale: uz });
            const dateStr = format(date, "d MMM", { locale: uz });

            return (
              <div key={date.toISOString()}>
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <p className={`text-xs font-semibold capitalize ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {dayName}, {dateStr}
                  </p>
                  {isToday && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-primary border-primary/30">Bugun</Badge>
                  )}
                </div>

                <div className="space-y-2">
                  {classes.map((cls) => (
                    <div key={`${cls.groupId}-${date.toISOString()}`} className={`rounded-lg border bg-card p-3 ${isToday ? "border-primary/30" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{cls.groupName}</p>
                        {cls.lessonStartTime && cls.lessonEndTime && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Clock className="size-3" />
                            {cls.lessonStartTime} – {cls.lessonEndTime}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {cls.courseName && (
                          <span className="flex items-center gap-1"><BookOpen className="size-3" />{cls.courseName}</span>
                        )}
                        {cls.teachers.length > 0 && (
                          <span className="flex items-center gap-1">
                            <GraduationCap className="size-3" />
                            {cls.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")}
                          </span>
                        )}
                        {cls.room && (
                          <span className="flex items-center gap-1"><DoorOpen className="size-3" />{cls.room.name}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
