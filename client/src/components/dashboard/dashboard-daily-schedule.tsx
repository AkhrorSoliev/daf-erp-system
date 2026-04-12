"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, CalendarX, Users } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Teacher {
  id: number;
  firstName: string;
  lastName: string;
}

export interface DashboardLesson {
  groupId: string;
  groupName: string;
  courseName: string | null;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string | null;
  teachers: Teacher[];
  studentCount: number;
  presentCount: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getLessonStatus(
  startTime: string,
  endTime: string,
  now: string
): "past" | "current" | "upcoming" {
  if (now >= endTime) return "past";
  if (now >= startTime) return "current";
  return "upcoming";
}

function getLessonProgress(startTime: string, endTime: string, now: string): number {
  const startMin = timeToMinutes(startTime);
  const endMin = timeToMinutes(endTime);
  const nowMin = timeToMinutes(now);
  if (nowMin <= startMin) return 0;
  if (nowMin >= endMin) return 100;
  return Math.round(((nowMin - startMin) / (endMin - startMin)) * 100);
}

interface DashboardDailyScheduleProps {
  lessons: DashboardLesson[];
  dateLabel?: string;
  isToday?: boolean;
}

export function DashboardDailySchedule({
  lessons,
  dateLabel,
  isToday = true,
}: DashboardDailyScheduleProps) {
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

  // O'tgan kun — barcha darslar "Tugagan"; kelajak kun — barcha "Kutilmoqda"
  const effectiveNow = isToday ? now : "00:00";

  if (lessons.length === 0) {
    return (
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
          <CalendarDays className="size-4 text-muted-foreground" />
          {dateLabel ?? "Bugungi darslar"}
        </h2>
        <div className="rounded-lg border bg-card p-8 text-center">
          <CalendarX className="size-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Darslar yo&apos;q</p>
          <p className="text-xs text-muted-foreground mt-1">
            Tanlangan kun uchun hech qanday dars rejalashtirilmagan
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="flex items-center gap-2 text-sm font-semibold mb-3">
        <CalendarDays className="size-4 text-muted-foreground" />
        Bugungi darslar
        <span className="text-xs font-normal text-muted-foreground">
          ({lessons.length})
        </span>
      </h2>
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="max-h-100 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 border-r">#</TableHead>
                <TableHead className="w-25">Vaqt</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead className="hidden sm:table-cell">Kurs</TableHead>
                <TableHead>Ustoz</TableHead>
                <TableHead className="hidden sm:table-cell">Xona</TableHead>
                <TableHead className="w-20 text-center">Davomat</TableHead>
                <TableHead className="w-24 text-center">Holat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lessons.map((lesson, index) => {
                const status = isToday
                  ? getLessonStatus(lesson.startTime, lesson.endTime, effectiveNow)
                  : null;
                const progress =
                  status === "current"
                    ? getLessonProgress(lesson.startTime, lesson.endTime, effectiveNow)
                    : 0;
                return (
                  <TableRow
                    key={lesson.groupId}
                    style={
                      status === "current"
                        ? {
                            backgroundImage: `linear-gradient(to right, hsl(var(--primary) / 0.08) ${progress}%, transparent ${progress}%)`,
                          }
                        : undefined
                    }
                  >
                    <TableCell className="border-r text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">
                      {lesson.startTime} – {lesson.endTime}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      <Link
                        href={`/groups/${lesson.groupId}`}
                        className="hover:underline hover:text-primary transition-colors"
                      >
                        {lesson.groupName}
                      </Link>
                      <span className="sm:hidden text-xs font-normal text-muted-foreground block">
                        {lesson.courseName}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {lesson.courseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {lesson.teachers.length > 0
                        ? lesson.teachers
                            .map((t) => `${t.firstName} ${t.lastName[0]}.`)
                            .join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {lesson.roomName ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Users className="size-3 text-muted-foreground" />
                            <span className="tabular-nums">
                              {lesson.presentCount}/{lesson.studentCount}
                            </span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {lesson.presentCount} ta keldi / {lesson.studentCount}{" "}
                          ta jami
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-center">
                      {status === "past" && (
                        <span className="inline-block rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-[11px] font-medium px-2 py-0.5">
                          Tugagan
                        </span>
                      )}
                      {status === "current" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] font-medium px-2 py-0.5">
                          <span className="relative flex size-1.5">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
                          </span>
                          Davom etmoqda
                        </span>
                      )}
                      {status === "upcoming" && (
                        <span className="inline-block rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5">
                          Kutilmoqda
                        </span>
                      )}
                      {status === null && (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
