"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, DoorOpen } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface RoomScheduleGroup {
  id: string;
  name: string;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  courseName: string | null;
  teachers: Teacher[];
}

interface RoomWeeklyScheduleProps {
  groups: RoomScheduleGroup[];
  workingHours: { start: string; end: string };
}

const WEEKDAYS = [
  { key: "monday", label: "Dushanba", short: "Du" },
  { key: "tuesday", label: "Seshanba", short: "Se" },
  { key: "wednesday", label: "Chorshanba", short: "Cho" },
  { key: "thursday", label: "Payshanba", short: "Pay" },
  { key: "friday", label: "Juma", short: "Ju" },
  { key: "saturday", label: "Shanba", short: "Sha" },
  { key: "sunday", label: "Yakshanba", short: "Ya" },
];

const JS_DAY_TO_INDEX: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6,
};

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateTimeSlots(start: string, end: string): string[] {
  const startMin = timeToMinutes(start);
  const endMin = timeToMinutes(end);
  const slots: string[] = [];
  for (let m = startMin; m <= endMin; m += 30) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

// Build lesson entries per day
interface DayLesson {
  group: RoomScheduleGroup;
  startTime: string;
  endTime: string;
}

export function RoomWeeklySchedule({
  groups,
  workingHours,
}: RoomWeeklyScheduleProps) {
  const todayIndex = JS_DAY_TO_INDEX[new Date().getDay()];

  // Filter groups that have schedule data
  const scheduledGroups = useMemo(
    () =>
      groups.filter(
        (g) =>
          g.exactDays.length > 0 && g.lessonStartTime && g.lessonEndTime
      ),
    [groups]
  );

  // Build lessons by day: dayIndex -> DayLesson[]
  const lessonsByDay = useMemo(() => {
    const map = new Map<number, DayLesson[]>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const group of scheduledGroups) {
      for (const day of group.exactDays) {
        const dayIdx = WEEKDAYS.findIndex((w) => w.key === day);
        if (dayIdx === -1) continue;
        map.get(dayIdx)!.push({
          group,
          startTime: group.lessonStartTime!,
          endTime: group.lessonEndTime!,
        });
      }
    }
    return map;
  }, [scheduledGroups]);

  // Compute time range from all lessons
  const timeRange = useMemo(() => {
    const whStart = timeToMinutes(workingHours.start);
    const whEnd = timeToMinutes(workingHours.end);
    let minStart = whStart;
    let maxEnd = whEnd;
    for (const g of scheduledGroups) {
      const s = timeToMinutes(g.lessonStartTime!);
      const e = timeToMinutes(g.lessonEndTime!);
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    }
    minStart = Math.floor(minStart / 30) * 30;
    maxEnd = Math.ceil(maxEnd / 30) * 30;
    return { start: minutesToTime(minStart), end: minutesToTime(maxEnd) };
  }, [scheduledGroups, workingHours]);

  const timeSlots = useMemo(
    () => generateTimeSlots(timeRange.start, timeRange.end),
    [timeRange.start, timeRange.end]
  );

  // cellMap: dayIndex -> slotIndex -> { lesson, isStart }
  const cellMap = useMemo(() => {
    const map = new Map<
      number,
      Map<number, { lesson: DayLesson; isStart: boolean }>
    >();
    for (const [dayIdx, dayLessons] of lessonsByDay) {
      const slotMap = new Map<
        number,
        { lesson: DayLesson; isStart: boolean }
      >();
      for (const lesson of dayLessons) {
        const lStart = timeToMinutes(lesson.startTime);
        const lEnd = timeToMinutes(lesson.endTime);
        for (let i = 0; i < timeSlots.length; i++) {
          const slotMin = timeToMinutes(timeSlots[i]);
          const nextSlotMin = slotMin + 30;
          if (lStart < nextSlotMin && lEnd > slotMin) {
            slotMap.set(i, {
              lesson,
              isStart: lStart >= slotMin && lStart < nextSlotMin,
            });
          }
        }
      }
      map.set(dayIdx, slotMap);
    }
    return map;
  }, [lessonsByDay, timeSlots]);

  if (scheduledGroups.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="size-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Dars jadvali</h3>
        </div>
        <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
          <DoorOpen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm">Bu xonaga dars biriktirilmagan</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="size-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold">Dars jadvali</h3>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="border-b px-2 py-2 text-xs font-medium text-muted-foreground text-left w-15 sticky left-0 bg-muted/40">
                Vaqt
              </th>
              {WEEKDAYS.map((day, i) => (
                <th
                  key={day.key}
                  className={`border-b border-l px-1.5 py-2 text-xs font-medium text-center min-w-24 ${
                    i === todayIndex
                      ? "bg-primary/10 text-primary"
                      : ""
                  }`}
                >
                  <span className="hidden sm:inline">{day.label}</span>
                  <span className="sm:hidden">{day.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot, rowIndex) => (
              <tr key={slot}>
                <td
                  className={`border-b px-2 py-1.5 text-[11px] text-muted-foreground tabular-nums sticky left-0 bg-card ${
                    rowIndex % 2 === 0
                      ? "font-medium"
                      : "text-muted-foreground/60"
                  }`}
                >
                  {slot}
                </td>
                {WEEKDAYS.map((day, dayIdx) => {
                  const cell = cellMap.get(dayIdx)?.get(rowIndex);
                  const isToday = dayIdx === todayIndex;

                  if (!cell) {
                    return (
                      <td
                        key={day.key}
                        className={`border-b border-l h-8 ${
                          isToday ? "bg-primary/5" : ""
                        }`}
                      />
                    );
                  }

                  const { lesson, isStart } = cell;
                  const lStart = timeToMinutes(lesson.startTime);
                  const lEnd = timeToMinutes(lesson.endTime);

                  if (isStart) {
                    const spanSlots = Math.ceil((lEnd - lStart) / 30);
                    const teacherName =
                      lesson.group.teachers.length > 0
                        ? `${lesson.group.teachers[0].firstName} ${lesson.group.teachers[0].lastName[0]}.`
                        : null;

                    const bgClass = isToday
                      ? "bg-primary/10 border-primary/20"
                      : "bg-blue-50 dark:bg-blue-950/30";

                    return (
                      <td
                        key={day.key}
                        rowSpan={spanSlots}
                        className="border-b border-l p-0 h-8"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/groups/${lesson.group.id}`}
                              className={`block h-full relative ${bgClass} border rounded-sm mx-0.5 my-0.5 px-1.5 py-0.5 hover:opacity-80 transition-opacity overflow-hidden`}
                            >
                              <p className="text-[11px] font-medium truncate leading-tight">
                                {lesson.group.name}
                              </p>
                              {teacherName && (
                                <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                  {teacherName}
                                </p>
                              )}
                              <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                {lesson.startTime} – {lesson.endTime}
                              </p>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-0.5">
                              <p className="font-medium">
                                {lesson.group.name}
                              </p>
                              {lesson.group.courseName && (
                                <p className="text-xs">
                                  {lesson.group.courseName}
                                </p>
                              )}
                              <p className="text-xs">
                                {lesson.startTime} – {lesson.endTime}
                              </p>
                              {lesson.group.teachers.length > 0 && (
                                <p className="text-xs">
                                  Ustoz:{" "}
                                  {lesson.group.teachers
                                    .map(
                                      (t) => `${t.firstName} ${t.lastName}`
                                    )
                                    .join(", ")}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  }

                  return null;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
