"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock, LayoutGrid, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AttendanceStatus, DashboardLesson } from "./dashboard-daily-schedule";

const attendanceLabel: Record<AttendanceStatus, string> = {
  TAKEN: "Davomat olindi",
  NOT_TAKEN: "Davomat olinmagan",
  MISSED: "O'tkazib yuborilgan",
  PENDING: "Kutilmoqda",
};

const attendanceBadgeClass: Record<AttendanceStatus, string> = {
  TAKEN: "bg-green-500 text-white",
  NOT_TAKEN: "bg-red-500 text-white animate-pulse",
  MISSED: "bg-orange-500 text-white",
  PENDING: "bg-muted-foreground/40 text-white",
};

const attendanceIconMap: Record<AttendanceStatus, typeof CheckCircle2> = {
  TAKEN: CheckCircle2,
  NOT_TAKEN: AlertCircle,
  MISSED: AlertCircle,
  PENDING: Clock,
};

interface Room {
  id: string;
  name: string;
  capacity: number | null;
}

interface DashboardRoomOccupancyProps {
  lessons: DashboardLesson[];
  rooms: Room[];
  workingHours: { start: string; end: string };
  isTeacher?: boolean;
  isToday?: boolean;
}

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

export function DashboardRoomOccupancy({
  lessons,
  rooms,
  workingHours,
  isTeacher,
  isToday = true,
}: DashboardRoomOccupancyProps) {
  const busyRooms = useMemo(() => {
    const busyIds = new Set(
      lessons.filter((l) => l.roomId).map((l) => l.roomId!)
    );
    return rooms.filter((r) => busyIds.has(r.id));
  }, [rooms, lessons]);

  const timeRange = useMemo(() => {
    if (lessons.length === 0) {
      return { start: workingHours.start, end: workingHours.end };
    }
    const whStart = timeToMinutes(workingHours.start);
    const whEnd = timeToMinutes(workingHours.end);
    let minStart = whStart;
    let maxEnd = whEnd;
    for (const l of lessons) {
      const s = timeToMinutes(l.startTime);
      const e = timeToMinutes(l.endTime);
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
    }
    minStart = Math.floor(minStart / 30) * 30;
    maxEnd = Math.ceil(maxEnd / 30) * 30;
    return { start: minutesToTime(minStart), end: minutesToTime(maxEnd) };
  }, [lessons, workingHours]);

  const timeSlots = useMemo(
    () => generateTimeSlots(timeRange.start, timeRange.end),
    [timeRange.start, timeRange.end]
  );

  const [now, setNow] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => {
      const d = new Date();
      setNow(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
      );
    }, 30_000);
    return () => clearInterval(interval);
  }, [isToday]);

  const lessonsByRoom = useMemo(() => {
    const map = new Map<string, DashboardLesson[]>();
    for (const lesson of lessons) {
      if (!lesson.roomId) continue;
      const arr = map.get(lesson.roomId) ?? [];
      arr.push(lesson);
      map.set(lesson.roomId, arr);
    }
    return map;
  }, [lessons]);

  // Build a lookup: roomId -> slotIndex -> lesson (for quick cell rendering)
  const cellMap = useMemo(() => {
    const map = new Map<string, Map<number, { lesson: DashboardLesson; isStart: boolean }>>();
    for (const [roomId, roomLessons] of lessonsByRoom) {
      const slotMap = new Map<number, { lesson: DashboardLesson; isStart: boolean }>();
      for (const lesson of roomLessons) {
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
      map.set(roomId, slotMap);
    }
    return map;
  }, [lessonsByRoom, timeSlots]);

  // For teachers, only show time slots that have at least one lesson
  const visibleSlots = useMemo(() => {
    if (!isTeacher) return timeSlots.map((slot, i) => ({ slot, originalIndex: i }));
    const slotsWithLessons = new Set<number>();
    for (const [, slotMap] of cellMap) {
      for (const [slotIndex] of slotMap) {
        slotsWithLessons.add(slotIndex);
      }
    }
    return timeSlots
      .map((slot, i) => ({ slot, originalIndex: i }))
      .filter(({ originalIndex }) => slotsWithLessons.has(originalIndex));
  }, [isTeacher, timeSlots, cellMap]);

  const nowMin = timeToMinutes(now);

  if (busyRooms.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
        <LayoutGrid className="size-4 text-muted-foreground" />
        {isTeacher ? "Dars vaqtlari" : "Xonalar bandligi"}
      </h2>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-muted/40">
              <th className="border-b px-2 py-2 text-xs font-medium text-muted-foreground text-left w-15 sticky left-0 bg-muted/40">
                Vaqt
              </th>
              {busyRooms.map((room) => (
                <th
                  key={room.id}
                  className="border-b border-l px-1.5 py-2 text-xs font-medium text-center truncate min-w-20"
                >
                  {room.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleSlots.map(({ slot, originalIndex: rowIndex }) => (
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
                {busyRooms.map((room) => {
                  const cell = cellMap.get(room.id)?.get(rowIndex);

                  // Empty cell
                  if (!cell) {
                    return (
                      <td
                        key={room.id}
                        className="border-b border-l h-8"
                      />
                    );
                  }

                  const { lesson, isStart } = cell;
                  const lStart = timeToMinutes(lesson.startTime);
                  const lEnd = timeToMinutes(lesson.endTime);

                  const status = isToday
                    ? now >= lesson.endTime
                      ? "past"
                      : now >= lesson.startTime
                        ? "current"
                        : "upcoming"
                    : "upcoming";

                  const bgClass =
                    status === "current"
                      ? "border-primary/30"
                      : status === "past"
                        ? "bg-muted/60"
                        : "bg-blue-50 dark:bg-blue-950/30";

                  // Start cell — render full content with rowSpan
                  if (isStart) {
                    const spanSlots = Math.ceil((lEnd - lStart) / 30);
                    const teacherName =
                      lesson.teachers.length > 0
                        ? `${lesson.teachers[0].firstName} ${lesson.teachers[0].lastName[0]}.`
                        : null;

                    let progress = 0;
                    if (status === "current") {
                      progress = Math.round(
                        ((nowMin - lStart) / (lEnd - lStart)) * 100
                      );
                    }

                    const att = lesson.attendanceStatus;
                    const AttIcon = att ? attendanceIconMap[att] : null;

                    // Border tint for NOT_TAKEN / MISSED to grab attention
                    const borderClass =
                      att === "NOT_TAKEN"
                        ? "border-red-400 dark:border-red-600"
                        : att === "MISSED"
                          ? "border-orange-400 dark:border-orange-600"
                          : bgClass;

                    return (
                      <td
                        key={room.id}
                        rowSpan={spanSlots}
                        className="border-b border-l p-0 h-8"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/groups/${lesson.groupId}`}
                              className={`block h-full relative ${bgClass} ${borderClass} border rounded-sm mx-0.5 my-0.5 px-1.5 py-0.5 hover:opacity-80 transition-opacity overflow-hidden`}
                            >
                              {status === "current" && (
                                <div
                                  className="absolute inset-0 bg-primary/10 transition-[width] duration-1000 ease-linear"
                                  style={{ width: `${progress}%` }}
                                />
                              )}
                              {/* Attendance status badge — top-right corner */}
                              {att && AttIcon && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={`absolute top-0.5 right-0.5 z-10 inline-flex items-center justify-center rounded-full size-4 ${attendanceBadgeClass[att]}`}
                                    >
                                      <AttIcon className="size-2.5" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {attendanceLabel[att]}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <div className="relative pr-4">
                                <div className="flex items-center gap-1">
                                  {status === "current" && (
                                    <span className="relative flex size-2 shrink-0">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                                      <span className="relative inline-flex size-2 rounded-full bg-primary" />
                                    </span>
                                  )}
                                  <p className="text-[11px] font-medium truncate leading-tight">
                                    {lesson.groupName}
                                  </p>
                                </div>
                                {teacherName && (
                                  <p className="text-[10px] text-muted-foreground truncate leading-tight">
                                    {teacherName}
                                  </p>
                                )}
                                <p className="text-[10px] text-muted-foreground flex items-center gap-0.5 leading-tight">
                                  <Users className="size-2.5 shrink-0" />
                                  {lesson.presentCount}/{lesson.studentCount}
                                </p>
                              </div>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-0.5">
                              <p className="font-medium">{lesson.groupName}</p>
                              {lesson.courseName && (
                                <p className="text-xs">{lesson.courseName}</p>
                              )}
                              <p className="text-xs">
                                {lesson.startTime} – {lesson.endTime}
                              </p>
                              {lesson.teachers.length > 0 && (
                                <p className="text-xs">
                                  Ustoz:{" "}
                                  {lesson.teachers
                                    .map((t) => `${t.firstName} ${t.lastName}`)
                                    .join(", ")}
                                </p>
                              )}
                              <p className="text-xs">
                                Keldi: {lesson.presentCount}/
                                {lesson.studentCount} ta
                              </p>
                              {att && (
                                <p
                                  className={`text-xs font-medium ${
                                    att === "TAKEN"
                                      ? "text-green-500"
                                      : att === "NOT_TAKEN"
                                        ? "text-red-500"
                                        : att === "MISSED"
                                          ? "text-orange-500"
                                          : "text-muted-foreground"
                                  }`}
                                >
                                  Holat: {attendanceLabel[att]}
                                </p>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  }

                  // Non-start cell — hidden by rowSpan, don't render
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
