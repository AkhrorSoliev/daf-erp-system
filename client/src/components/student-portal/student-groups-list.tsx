"use client";

import { useRef, useState, useEffect } from "react";
import {
  Clock,
  CalendarDays,
  GraduationCap,
  BookOpen,
  DoorOpen,
  UsersRound,
} from "lucide-react";

import { formatWeekdays } from "@/lib/weekdays";

interface GroupInfo {
  id: number;
  name: string;
  status: string;
  course_name: string | null;
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: string | null;
  endDate: string | null;
  teachers: { id: number; firstName: string; lastName: string }[];
  room?: { id: number; name: string } | null;
}

function GroupCard({ group }: { group: GroupInfo }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{group.name}</p>
        {group.course_name && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            <BookOpen className="size-3 shrink-0" />
            {group.course_name}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {group.exactDays.length > 0 && (
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3 shrink-0" />
            {formatWeekdays(group.exactDays)}
          </span>
        )}
        {group.lessonStartTime && group.lessonEndTime && (
          <span className="flex items-center gap-1">
            <Clock className="size-3 shrink-0" />
            {group.lessonStartTime} – {group.lessonEndTime}
          </span>
        )}
        {group.teachers.length > 0 && (
          <span className="flex items-center gap-1">
            <GraduationCap className="size-3 shrink-0" />
            {group.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(", ")}
          </span>
        )}
        {group.room && (
          <span className="flex items-center gap-1">
            <DoorOpen className="size-3 shrink-0" />
            {group.room.name}
          </span>
        )}
      </div>
    </div>
  );
}

export function StudentGroupsList({ groups }: { groups: GroupInfo[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const isCarousel = groups.length > 1;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isCarousel) return;

    function handleScroll() {
      if (!el) return;
      const index = Math.round(el.scrollLeft / el.offsetWidth);
      setActive(index);
    }

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isCarousel]);

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center">
        <UsersRound className="size-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium">Guruhlar yo&apos;q</p>
        <p className="text-xs text-muted-foreground mt-1">
          Hozircha siz hech qanday guruhga yozilmagansiz
        </p>
      </div>
    );
  }

  if (!isCarousel) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Guruhlarim</h3>
        <GroupCard group={groups[0]} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Guruhlarim
        <span className="text-xs font-normal ml-1.5">{active + 1}/{groups.length}</span>
      </h3>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {groups.map((group) => (
          <div key={group.id} className="snap-center shrink-0 w-full">
            <GroupCard group={group} />
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="flex justify-center gap-1.5">
        {groups.map((_, i) => (
          <button
            key={i}
            className={`size-1.5 rounded-full transition-colors ${
              i === active ? "bg-foreground" : "bg-border"
            }`}
            onClick={() => {
              scrollRef.current?.scrollTo({
                left: i * (scrollRef.current?.offsetWidth ?? 0),
                behavior: "smooth",
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}
