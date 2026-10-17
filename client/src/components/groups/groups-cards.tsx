"use client";

import Link from "next/link";
import { CalendarDays, Clock, DoorOpen, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatWeekdays } from "@/lib/weekdays";
import type { GroupData } from "@/hooks/use-edit-group";
import { CoveringBadge } from "./covering-badge";
import { LevelBadge } from "./level-badge";

/** `2026-11-03T00:00:00.000Z` → `03.11.2026`. The date is the first ten characters. */
export function startDateLabel(startDate: string | null): string | null {
  if (!startDate) return null;
  const [y, m, d] = startDate.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : null;
}

/**
 * A teacher's groups on a phone: one card per group with what the table hides
 * below `sm` — days and time, room, student count. A group that has not
 * started yet says when it starts.
 */
export function GroupsCards({ groups }: { groups: GroupData[] }) {
  if (groups.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-md border">
        Guruhlar topilmadi
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => {
        const status = group.statusEnum || "FORMING";
        const days = group.exactDays?.length ? formatWeekdays(group.exactDays) : null;
        const time =
          group.lessonStartTime && group.lessonEndTime
            ? `${group.lessonStartTime}–${group.lessonEndTime}`
            : group.lessonStartTime || null;
        const starts = status === "FORMING" ? startDateLabel(group.startDate) : null;

        return (
          <li key={group.id}>
            <Link
              href={`/groups/${group.id}`}
              className="bg-card hover:bg-muted/50 block rounded-lg border p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                    <span>{group.name}</span>
                    <CoveringBadge dates={group.coveringDates ?? []} />
                  </div>
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
                    {group.level && <LevelBadge level={group.level} />}
                    <span className="truncate">{group.course.name}</span>
                  </div>
                </div>
                <StatusBadge entityType="groups" status={status} />
              </div>

              <dl className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5 shrink-0" />
                  <dd>{days ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5 shrink-0" />
                  <dd className="tabular-nums">{time ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <DoorOpen className="size-3.5 shrink-0" />
                  <dd>{group.room?.name ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="size-3.5 shrink-0" />
                  <dd>{group.studentCount} ta o&apos;quvchi</dd>
                </div>
              </dl>

              {starts && (
                <p className="mt-3 rounded-md bg-muted px-3 py-1.5 text-sm">
                  Boshlanishi: <span className="font-medium">{starts}</span>
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
