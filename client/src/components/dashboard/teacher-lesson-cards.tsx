"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarX, ClipboardCheck, DoorOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  attendanceBadge,
  getLessonStatus,
  type DashboardLesson,
} from "./dashboard-daily-schedule";

/** Whether the lesson's card offers «Davomat olish»: today, and not marked yet. */
export function canOfferAttendance(isToday: boolean, att: DashboardLesson["attendanceStatus"]) {
  return isToday && (att === "NOT_TAKEN" || att === "PENDING");
}

const STATUS_LABEL = {
  past: "Tugagan",
  current: "Davom etmoqda",
  upcoming: "Kutilmoqda",
} as const;

/**
 * A teacher's day as cards (the Telegram cabinet is read on a phone): time,
 * group, course, room, who came, attendance state — and «Davomat olish» on a
 * lesson that is today and not marked. The button opens the group page, whose
 * first tab is the register; the server decides whether the window is open.
 */
export function TeacherLessonCards({
  lessons,
  isToday,
}: {
  lessons: DashboardLesson[];
  isToday: boolean;
}) {
  const [now, setNow] = useState(() => hhmm(new Date()));
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(hhmm(new Date())), 30_000);
    return () => clearInterval(id);
  }, [isToday]);

  if (lessons.length === 0) {
    return (
      <div className="p-8 text-center">
        <CalendarX className="text-muted-foreground mx-auto mb-3 size-8" />
        <p className="text-sm font-medium">Darslar yo&apos;q</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Tanlangan kun uchun hech qanday dars rejalashtirilmagan
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {lessons.map((lesson) => {
        const status = isToday ? getLessonStatus(lesson.startTime, lesson.endTime, now) : null;
        const att = lesson.attendanceStatus;
        const badge = att ? attendanceBadge[att] : null;
        const offer = canOfferAttendance(isToday, att);
        return (
          <li key={lesson.groupId} className="flex flex-col gap-2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/groups/${lesson.groupId}`}
                  className="font-medium hover:underline"
                >
                  {lesson.groupName}
                </Link>
                {lesson.courseName && (
                  <p className="text-muted-foreground text-xs">{lesson.courseName}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {lesson.startTime}–{lesson.endTime}
                </p>
                {status && (
                  <p
                    className={
                      status === "current"
                        ? "text-primary text-xs font-medium"
                        : "text-muted-foreground text-xs"
                    }
                  >
                    {STATUS_LABEL[status]}
                  </p>
                )}
              </div>
            </div>

            <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1">
                <DoorOpen className="size-3.5" />
                {lesson.roomName ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Users className="size-3.5" />
                {lesson.presentCount}/{lesson.studentCount}
              </span>
              {badge && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                >
                  <badge.icon className="size-3" />
                  {badge.label}
                </span>
              )}
            </div>

            {offer && (
              <Button asChild size="sm" className="w-full">
                <Link href={`/groups/${lesson.groupId}`}>
                  <ClipboardCheck className="mr-1.5 size-4" />
                  Davomat olish
                </Link>
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
