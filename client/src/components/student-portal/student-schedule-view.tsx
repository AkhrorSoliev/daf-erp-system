"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  CaretLeft,
  CaretRight,
  GraduationCap,
  BookOpen,
  MapPin,
  CalendarX,
} from "@phosphor-icons/react";
import { format, startOfWeek, addDays, isSameDay, addWeeks } from "date-fns";
import { uz } from "date-fns/locale";
import {
  Screen,
  ScreenHeader,
  Card,
  Badge,
  EmptyState,
  LoadingCards,
  FadeIn,
} from "./lumio";
import type { StudentScheduleItem } from "./lib/types";

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function StudentScheduleView() {
  const { data: schedule = [], isLoading } = useQuery({
    queryKey: ["student-portal", "schedule"],
    queryFn: () =>
      api
        .get("/student-portal/schedule")
        .then((r) => r.data as StudentScheduleItem[]),
  });

  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const weekStart = addWeeks(
    startOfWeek(today, { weekStartsOn: 1 }),
    weekOffset,
  );
  const weekStartIso = weekStart.toISOString();

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStartIso],
  );

  const daySchedule = useMemo(() => {
    return weekDays
      .map((date) => {
        const dayIndex = date.getDay();
        const classes = schedule
          .filter((s) =>
            s.exactDays.some(
              (d) => WEEKDAY_INDEX[d.toLowerCase()] === dayIndex,
            ),
          )
          .sort((a, b) =>
            (a.lessonStartTime ?? "").localeCompare(b.lessonStartTime ?? ""),
          );
        return { date, classes };
      })
      .filter(({ classes }) => classes.length > 0);
  }, [weekDays, schedule]);

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Jadval" />
        <LoadingCards />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title="Jadval" />

      {/* Week selector */}
      <Card pad="sm" className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Oldingi hafta"
          onClick={() => setWeekOffset((o) => o - 1)}
          className="inline-flex size-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-tint"
        >
          <CaretLeft size={18} weight="bold" />
        </button>
        <div className="text-center">
          <p className="font-display text-sm font-bold text-ink-900">
            {format(weekDays[0], "d MMM", { locale: uz })} –{" "}
            {format(weekDays[6], "d MMM yyyy", { locale: uz })}
          </p>
          {weekOffset === 0 ? (
            <p className="text-[10px] font-bold uppercase tracking-wider text-coral-600">
              Joriy hafta
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Keyingi hafta"
          onClick={() => setWeekOffset((o) => o + 1)}
          className="inline-flex size-9 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-tint"
        >
          <CaretRight size={18} weight="bold" />
        </button>
      </Card>

      {weekOffset !== 0 ? (
        <button
          type="button"
          onClick={() => setWeekOffset(0)}
          className="-mt-1 text-center text-xs font-bold text-coral-600 hover:underline"
        >
          Bugunga qaytish
        </button>
      ) : null}

      {daySchedule.length === 0 ? (
        <EmptyState
          icon={<CalendarX weight="bold" />}
          title="Bu hafta darslar yo'q"
          description="Boshqa haftani ko'rish uchun strelkalardan foydalaning."
        />
      ) : (
        <div className="space-y-4">
          {daySchedule.map(({ date, classes }, di) => {
            const isToday = isSameDay(date, today);
            return (
              <FadeIn key={date.toISOString()} index={di}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <p
                      className={`font-display text-sm font-bold capitalize ${isToday ? "text-coral-600" : "text-ink-500"}`}
                    >
                      {format(date, "EEEE, d MMM", { locale: uz })}
                    </p>
                    {isToday ? (
                      <Badge tone="coral" size="sm">
                        Bugun
                      </Badge>
                    ) : null}
                  </div>

                  <div className="grid gap-2.5 lg:grid-cols-2">
                    {classes.map((cls) => (
                      <Card
                        key={`${cls.groupId}-${date.toISOString()}`}
                        className={`flex items-center gap-3.5 ${isToday ? "border-coral-500/30" : ""}`}
                      >
                        <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-coral-500/10 py-2">
                          <span className="font-display text-[17px] font-extrabold text-coral-600">
                            {cls.lessonStartTime ?? "—"}
                          </span>
                          {cls.lessonEndTime ? (
                            <span className="text-xs font-semibold text-coral-600/70">
                              {cls.lessonEndTime}
                            </span>
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate font-display text-base font-bold text-ink-900">
                            {cls.groupName}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-ink-500">
                            {cls.courseName ? (
                              <span className="flex items-center gap-1">
                                <BookOpen size={13} weight="bold" />
                                {cls.courseName}
                              </span>
                            ) : null}
                            {cls.teachers.length > 0 ? (
                              <span className="flex items-center gap-1">
                                <GraduationCap size={13} weight="bold" />
                                {cls.teachers
                                  .map((t) => `${t.firstName} ${t.lastName}`)
                                  .join(", ")}
                              </span>
                            ) : null}
                            {cls.room ? (
                              <span className="flex items-center gap-1">
                                <MapPin size={13} weight="bold" />
                                {cls.room.name}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </FadeIn>
            );
          })}
        </div>
      )}
    </Screen>
  );
}
