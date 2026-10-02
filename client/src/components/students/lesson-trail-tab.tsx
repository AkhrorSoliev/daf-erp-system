"use client";

import { useState, type ReactNode } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { tashkentNow } from "@/lib/tashkent-time";
import {
  AttendanceDot,
  getPercentageColor,
  type DotStatus,
} from "@/components/shared/attendance-dot";
import { blockCount, blockTitle } from "./lesson-trail-labels";

interface Cycle {
  /** Absent from an older server: a pack-era cycle. */
  kind?: "CYCLE" | "MONTH";
  cycleSequenceNumber: number | null;
  /** MONTH blocks (ADR-0062): 'YYYY-MM'. */
  month?: string | null;
  /** CYCLE: lessonPaymentCount; MONTH: the month's charged lessons; null when unknown. */
  capacity: number | null;
  lessonCount: number; // shu blokdagi haqiqiy darslar soni
  attended: number;
  firstDate: string;
  lastDate: string;
}

interface Lesson {
  date: string;
  status: DotStatus;
  cycleSequenceNumber: number | null;
  month?: string | null;
}

interface GroupOverview {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  courseName: string | null;
  lessonPaymentCount: number;
  status: "ACTIVE" | "FROZEN" | "COMPLETED" | "DROPPED" | "TRANSFERRED";
  attended: number;
  total: number;
  cycles: Cycle[];
  lessons: Lesson[];
}

interface LessonsOverview {
  studentId: number;
  groups: GroupOverview[];
}

const ENROLLMENT_STATUS_LABEL: Record<GroupOverview["status"], string> = {
  ACTIVE: "Faol",
  FROZEN: "Muzlatilgan",
  COMPLETED: "Tugatgan",
  DROPPED: "Chiqarilgan",
  TRANSFERRED: "O'tkazilgan",
};

/** "YYYY-MM-DD" → "dd.MM" (Tashkent kunini siljitmasdan). */
function shortDate(date: string): string {
  return format(new Date(date + "T00:00:00"), "dd.MM");
}

function cycleLabel(c: Cycle): string {
  const range =
    c.lastDate && c.lastDate !== c.firstDate
      ? `${shortDate(c.firstDate)} — ${shortDate(c.lastDate)}`
      : shortDate(c.firstDate);
  // To'liq blok → "(12 dars)"; davom etayotgan blok → "(4/12 dars)".
  return `${range} (${blockCount(c.lessonCount, c.capacity)})`;
}

function LessonTimeline({
  lessons,
  year,
}: {
  lessons: Lesson[];
  year: string;
}) {
  if (lessons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Hali dars o&apos;tilmagan
      </p>
    );
  }
  // Chronological dots; a title wherever the block (cycle or month) changes.
  const items: ReactNode[] = [];
  let seenBlock: string | null = null;
  lessons.forEach((l, i) => {
    const block =
      l.month ??
      (l.cycleSequenceNumber != null ? String(l.cycleSequenceNumber) : null);
    const title = block ? blockTitle(l, year) : null;
    if (block && block !== seenBlock) {
      seenBlock = block;
      items.push(
        <span
          key={`c-${i}`}
          className="ml-1.5 mr-0.5 text-[10px] font-medium text-muted-foreground first:ml-0"
        >
          {title}:
        </span>,
      );
    }
    items.push(
      <AttendanceDot
        key={`${l.date}-${i}`}
        status={l.status}
        date={l.date}
        cycleLabel={title}
      />,
    );
  });
  return <div className="flex flex-wrap items-center gap-1.5">{items}</div>;
}

function GroupCard({ group }: { group: GroupOverview }) {
  const year = tashkentNow().dateStr.slice(0, 4);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{group.groupName}</p>
            {group.status !== "ACTIVE" && (
              <Badge variant="outline" className="text-[10px]">
                {ENROLLMENT_STATUS_LABEL[group.status]}
              </Badge>
            )}
          </div>
          {group.courseName && (
            <p className="text-xs text-muted-foreground">{group.courseName}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={cn(
            "font-semibold",
            getPercentageColor(group.attended, group.total),
          )}
        >
          {group.attended}/{group.total} keldi
        </Badge>
      </div>

      {/* Blocks (cycles, then months) with their dates */}
      {group.cycles.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {group.cycles.map((c) => (
            <li
              key={c.month ?? `sikl-${c.cycleSequenceNumber}`}
              className="text-muted-foreground"
            >
              <span className="font-medium text-foreground">
                {blockTitle(c, year)}:
              </span>{" "}
              {cycleLabel(c)}
            </li>
          ))}
        </ul>
      )}

      {/* Attendance dots, chronological, titled by block */}
      <LessonTimeline lessons={group.lessons} year={year} />
    </div>
  );
}

export function LessonTrailTab({ studentId }: { studentId: number }) {
  const [includeClosed, setIncludeClosed] = useState(false);

  const { data, isLoading } = useQuery<LessonsOverview>({
    queryKey: ["student-lessons-overview", studentId, includeClosed],
    queryFn: () =>
      api
        .get<LessonsOverview>(`/students/${studentId}/lessons-overview`, {
          params: { includeClosed: includeClosed ? "true" : undefined },
        })
        .then((r) => r.data),
  });

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Belgilar + yopilgan guruhlar toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium">Belgilar:</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-emerald-500" />
              Keldi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-amber-500" />
              Kech
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-sky-400" />
              Sababli
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-red-500" />
              Kelmadi
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="include-closed"
              checked={includeClosed}
              onCheckedChange={setIncludeClosed}
            />
            <Label
              htmlFor="include-closed"
              className="text-xs text-muted-foreground"
            >
              Yopilgan guruhlarni ko&apos;rsatish
            </Label>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : !data || data.groups.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-md border">
            <p className="text-sm text-muted-foreground">
              {includeClosed
                ? "Dars ma'lumotlari mavjud emas"
                : "Faol guruhda dars ma'lumotlari yo'q — yopilgan guruhlarni ko'rsatib ko'ring"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.groups.map((g) => (
              <GroupCard key={g.enrollmentId} group={g} />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
