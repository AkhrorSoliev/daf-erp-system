"use client";

import Link from "next/link";
import { format } from "date-fns";
import { CalendarIcon, ClockIcon, UsersIcon, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatWeekdays } from "@/lib/weekdays";
import type { StudentGroup } from "@/data/student-model";
import { STATUS_MAP } from "./student-profile-tabs-utils";

export function StudentGroupCard({
  group,
  onRemove,
}: {
  group: StudentGroup;
  onRemove?: (enrollmentId: string) => void;
}) {
  const status = STATUS_MAP[group.status] ?? STATUS_MAP[2];

  const daysLabel =
    group.exactDays?.length > 0 ? formatWeekdays(group.exactDays) : null;

  const timeLabel =
    group.lessonStartTime && group.lessonEndTime
      ? `${group.lessonStartTime} – ${group.lessonEndTime}`
      : null;

  return (
    <Link href={`/groups/${group.id}`}>
      <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/50">
        {/* Row 1: Name + Status */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="font-semibold">{group.name}</h4>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>

        {/* Row 2: Course + Teacher */}
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {group.course_name ?? "—"}
            {group.level && ` • ${group.level}`}
          </span>
          {group.teachers.length > 0 && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <UsersIcon className="size-3.5" />
              {group.teachers
                .map((t) => `${t.firstName} ${t.lastName}`)
                .join(", ")}
            </span>
          )}
        </div>

        {/* Row 3: Schedule + Dates */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {(daysLabel || timeLabel) && (
            <span className="flex items-center gap-1">
              <ClockIcon className="size-3.5" />
              {[daysLabel, timeLabel].filter(Boolean).join(" • ")}
            </span>
          )}
          {group.startDate && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3.5" />
              {format(new Date(group.startDate), "dd.MM.yyyy")}
              {group.endDate &&
                ` – ${format(new Date(group.endDate), "dd.MM.yyyy")}`}
            </span>
          )}
        </div>

        {/* Row 4: Enrolled date + remove */}
        <div className="mt-2 border-t pt-2 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Qo&apos;shilgan: {format(new Date(group.enrolledAt), "dd.MM.yyyy")}
          </span>
          {onRemove && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemove(group.enrollmentId);
                  }}
                >
                  <UserMinus className="mr-1 size-3" />
                  Chiqarish
                </Button>
              </TooltipTrigger>
              <TooltipContent>Guruhdan chiqarish</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </Link>
  );
}
