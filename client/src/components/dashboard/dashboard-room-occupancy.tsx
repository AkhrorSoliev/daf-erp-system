"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarX, CheckCircle2, Clock, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AttendanceStatus, DashboardLesson } from "./dashboard-daily-schedule";

const SLOT_HEIGHT_PX = 44;
const SLOT_MIN = 30;
const PX_PER_MIN = SLOT_HEIGHT_PX / SLOT_MIN;
const TIME_COL_W = 64;
const ROOM_COL_MIN_W = 156;

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

const attendanceIcon: Record<AttendanceStatus, typeof CheckCircle2> = {
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

function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function generateSlots(start: string, end: string): string[] {
  const startMin = timeToMin(start);
  const endMin = timeToMin(end);
  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += SLOT_MIN) {
    slots.push(minToTime(m));
  }
  return slots;
}

interface LayoutSegment {
  lesson: DashboardLesson;
  lane: number;
  segmentLanes: number;
  startMin: number;
  endMin: number;
}

// Keep each lesson as one stable block. Earlier code split lessons into
// per-slice segments, which made a single class shift horizontally when an
// overlap started or ended. That saves space but makes times hard to scan.
function computeLayoutSegments(lessons: DashboardLesson[]): LayoutSegment[] {
  if (lessons.length === 0) return [];

  const infos = lessons
    .map((lesson) => ({
      lesson,
      startMin: timeToMin(lesson.startTime),
      endMin: timeToMin(lesson.endTime),
    }))
    .sort((a, b) => {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.endMin - b.endMin;
    });

  const clusters: number[][] = [];
  let currentCluster: number[] = [];
  let clusterEnd = -Infinity;

  infos.forEach((info, index) => {
    if (currentCluster.length === 0 || info.startMin < clusterEnd) {
      currentCluster.push(index);
      clusterEnd = Math.max(clusterEnd, info.endMin);
      return;
    }

    clusters.push(currentCluster);
    currentCluster = [index];
    clusterEnd = info.endMin;
  });

  if (currentCluster.length > 0) clusters.push(currentCluster);

  const segmentsByIndex = new Map<number, LayoutSegment>();

  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const clusterAssignments: Array<{ index: number; lane: number }> = [];

    for (const index of cluster) {
      const info = infos[index];
      let lane = laneEnds.findIndex((end) => end <= info.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(info.endMin);
      } else {
        laneEnds[lane] = info.endMin;
      }

      clusterAssignments.push({ index, lane });
    }

    const segmentLanes = laneEnds.length;
    for (const assignment of clusterAssignments) {
      const info = infos[assignment.index];
      segmentsByIndex.set(assignment.index, {
        lesson: info.lesson,
        lane: assignment.lane,
        segmentLanes,
        startMin: info.startMin,
        endMin: info.endMin,
      });
    }
  }

  return [...segmentsByIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, segment]) => segment);
}

export function DashboardRoomOccupancy({
  lessons,
  rooms,
  workingHours,
  isTeacher = false,
  isToday = true,
}: DashboardRoomOccupancyProps) {
  const dayStart = timeToMin(workingHours.start);
  const dayEnd = timeToMin(workingHours.end);
  const slots = useMemo(
    () => generateSlots(workingHours.start, workingHours.end),
    [workingHours.start, workingHours.end]
  );
  const bodyHeight = slots.length * SLOT_HEIGHT_PX;

  // For teachers, only show rooms where they have lessons.
  // Non-teachers see all active rooms (even empty ones).
  const visibleRooms = useMemo(() => {
    if (!isTeacher) return rooms;
    const busyIds = new Set(
      lessons.filter((l) => l.roomId).map((l) => l.roomId!)
    );
    return rooms.filter((r) => busyIds.has(r.id));
  }, [rooms, lessons, isTeacher]);

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

  const nowMin = timeToMin(now);
  const nowVisible = isToday && nowMin >= dayStart && nowMin < dayEnd;
  const nowTop = (nowMin - dayStart) * PX_PER_MIN;

  if (visibleRooms.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-8 text-center">
        <CalendarX className="size-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">
          {isTeacher ? "Darslaringiz yo'q" : "Filialda faol xona yo'q"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {isTeacher
            ? "Tanlangan kunda siz uchun dars rejalashtirilmagan"
            : "Avval xonalar qo'shing yoki ularni faollashtiring"}
        </p>
      </div>
    );
  }

  const gridTemplateColumns = `${TIME_COL_W}px repeat(${visibleRooms.length}, minmax(${ROOM_COL_MIN_W}px, 1fr))`;
  const minWidth = TIME_COL_W + visibleRooms.length * ROOM_COL_MIN_W;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          {/* Header */}
          <div
            className="grid bg-muted/40 border-b"
            style={{ gridTemplateColumns }}
          >
            <div className="sticky left-0 z-20 bg-muted/40 border-r px-2 py-2 text-[11px] font-semibold text-muted-foreground text-center">
              Vaqt
            </div>
            {visibleRooms.map((room) => (
              <div
                key={room.id}
                className="border-l px-3 py-2 text-xs font-semibold text-center truncate"
                title={room.name}
              >
                {room.name}
              </div>
            ))}
          </div>

          {/* Body */}
          <div className="relative">
            <div
              className="grid"
              style={{ gridTemplateColumns, height: bodyHeight }}
            >
              {/* Time column */}
              <div className="sticky left-0 z-10 bg-card border-r">
                {slots.map((slot) => (
                  <div
                    key={slot}
                    className={`px-2 text-[11px] tabular-nums ${
                      slot.endsWith(":00")
                        ? "font-semibold text-foreground border-b border-border/70"
                        : "text-muted-foreground/60 border-b border-border/30"
                    }`}
                    style={{
                      height: SLOT_HEIGHT_PX,
                      paddingTop: 4,
                      lineHeight: "1",
                    }}
                  >
                    {slot}
                  </div>
                ))}
              </div>

              {/* Room columns */}
              {visibleRooms.map((room) => {
                const roomLessons = lessonsByRoom.get(room.id) ?? [];
                const segments = computeLayoutSegments(roomLessons);
                return (
                  <div
                    key={room.id}
                    className="border-l relative bg-gradient-to-b from-transparent via-muted/10 to-transparent"
                    style={{ height: bodyHeight }}
                  >
                    {/* Gridlines */}
                    {slots.map((slot, i) => (
                      <div
                        key={slot}
                        className={`absolute left-0 right-0 pointer-events-none ${
                          slot.endsWith(":00")
                            ? "border-b border-border/60"
                            : "border-b border-border/30"
                        }`}
                        style={{ top: (i + 1) * SLOT_HEIGHT_PX, height: 0 }}
                      />
                    ))}

                    {/* Lesson segments */}
                    {segments.map((segment, idx) => (
                      <LessonSegmentCard
                        key={`${segment.lesson.groupId}-${segment.startMin}-${idx}`}
                        segment={segment}
                        dayStart={dayStart}
                        dayEnd={dayEnd}
                        isToday={isToday}
                        nowMin={nowMin}
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Now line — overlay across the body */}
            {nowVisible && (
              <div
                className="absolute left-0 right-0 z-30 pointer-events-none"
                style={{ top: nowTop }}
              >
                <div className="h-0 border-t-2 border-red-500" />
                <span
                  className="absolute inline-block bg-red-500 text-white text-[10px] font-bold px-1 py-0 rounded-sm tabular-nums leading-tight"
                  style={{ top: -8, left: TIME_COL_W + 4 }}
                >
                  {now}
                </span>
              </div>
            )}
          </div>

          {/* Empty hint */}
          {lessons.length === 0 && (
            <div className="border-t bg-muted/20 px-3 py-2 text-center text-xs text-muted-foreground">
              {isToday
                ? "Bugun dars rejalashtirilmagan"
                : "Tanlangan kunda dars rejalashtirilmagan"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface LessonSegmentCardProps {
  segment: LayoutSegment;
  dayStart: number;
  dayEnd: number;
  isToday: boolean;
  nowMin: number;
}

function LessonSegmentCard({
  segment,
  dayStart,
  dayEnd,
  isToday,
  nowMin,
}: LessonSegmentCardProps) {
  const { lesson, lane, segmentLanes, startMin, endMin } = segment;

  // Lesson-wide bounds (used for status, progress, clip indicators)
  const lFullStart = timeToMin(lesson.startTime);
  const lFullEnd = timeToMin(lesson.endTime);

  // Clamp this segment's vertical range to the working-hour window
  const visStart = Math.max(startMin, dayStart);
  const visEnd = Math.min(endMin, dayEnd);
  if (visStart >= visEnd) return null;

  const top = (visStart - dayStart) * PX_PER_MIN;
  const height = (visEnd - visStart) * PX_PER_MIN;
  const widthPct = 100 / segmentLanes;
  const leftPct = lane * widthPct;

  const clipTop = lFullStart < dayStart;
  const clipBottom = lFullEnd > dayEnd;

  const status: "past" | "current" | "upcoming" = isToday
    ? nowMin >= lFullEnd
      ? "past"
      : nowMin >= lFullStart
        ? "current"
        : "upcoming"
    : "upcoming";

  const colorClass =
    status === "current"
      ? "bg-primary/10 border-primary/50 shadow-sm shadow-primary/10 hover:bg-primary/15"
      : status === "past"
        ? "bg-muted/55 border-border text-muted-foreground"
        : "bg-sky-50 border-sky-200 text-sky-950 dark:bg-sky-950/30 dark:border-sky-800/70 dark:text-sky-50 hover:bg-sky-100 dark:hover:bg-sky-950/50";

  const att = lesson.attendanceStatus;
  const AttIcon = att ? attendanceIcon[att] : null;
  const borderOverride =
    att === "NOT_TAKEN"
      ? "!border-red-400 dark:!border-red-600"
      : att === "MISSED"
        ? "!border-orange-400 dark:!border-orange-600"
        : "";

  const teacherName =
    lesson.teachers.length > 0
      ? `${lesson.teachers[0].firstName} ${lesson.teachers[0].lastName[0]}.`
      : null;

  const progress =
    status === "current"
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((nowMin - lFullStart) / (lFullEnd - lFullStart)) * 100),
          ),
        )
      : 0;

  const showTeacher = height >= 58;
  const showCount = height >= 78;
  const showCompactMeta = height >= 48;

  return (
    <div
      className="absolute z-10"
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={`/groups/${lesson.groupId}`}
            className={`block h-full relative overflow-hidden rounded-md border ${colorClass} ${borderOverride} transition-colors`}
          >
            {status === "current" && (
              <div
                className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-1000 ease-linear"
                style={{ width: `${progress}%` }}
              />
            )}

            {att && AttIcon && (
              <span
                className={`absolute top-1 right-1 z-10 inline-flex items-center justify-center rounded-full size-4 ${attendanceBadgeClass[att]}`}
                aria-label={attendanceLabel[att]}
              >
                <AttIcon className="size-3" />
              </span>
            )}

            {clipTop && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 text-muted-foreground text-[8px] leading-none">
                ▲
              </span>
            )}
            {clipBottom && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-muted-foreground text-[8px] leading-none">
                ▼
              </span>
            )}

            <div className="relative flex h-full min-h-0 flex-col px-2 py-1.5 pr-6">
              <div className="mb-1 flex items-center gap-1.5">
                {status === "current" && (
                  <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                  </span>
                )}
                <span className="rounded-sm bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-foreground shadow-sm">
                  {lesson.startTime}-{lesson.endTime}
                </span>
              </div>
              <p className="min-w-0 truncate text-[12px] font-semibold leading-tight">
                {lesson.groupName}
              </p>
              {showTeacher && teacherName && (
                <p className="mt-0.5 min-w-0 truncate text-[10px] leading-tight text-muted-foreground">
                  {teacherName}
                </p>
              )}
              {showCount && (
                <p className="mt-auto flex items-center gap-1 text-[10px] leading-tight text-muted-foreground">
                  <Users className="size-3 shrink-0" />
                  <span className="tabular-nums">
                    {lesson.presentCount}/{lesson.studentCount}
                  </span>
                </p>
              )}
              {!showTeacher && showCompactMeta && teacherName && (
                <p className="mt-0.5 min-w-0 truncate text-[10px] leading-tight text-muted-foreground">
                  {teacherName}
                </p>
              )}
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
              Keldi: {lesson.presentCount}/{lesson.studentCount} ta
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
    </div>
  );
}
