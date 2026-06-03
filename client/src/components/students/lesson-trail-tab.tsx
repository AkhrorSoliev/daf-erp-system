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
import {
  AttendanceDot,
  getPercentageColor,
  type DotStatus,
} from "@/components/shared/attendance-dot";

interface Cycle {
  cycleSequenceNumber: number;
  capacity: number;
  coveredCount: number;
  firstCoveredDate: string | null;
  lastCoveredDate: string | null;
}

interface Lesson {
  date: string;
  status: DotStatus;
  cycleSequenceNumber: number | null;
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
  if (c.firstCoveredDate) {
    const range =
      c.lastCoveredDate && c.lastCoveredDate !== c.firstCoveredDate
        ? `${shortDate(c.firstCoveredDate)} — ${shortDate(c.lastCoveredDate)}`
        : shortDate(c.firstCoveredDate);
    return `${range} (${c.coveredCount}/${c.capacity} dars)`;
  }
  return `${c.capacity} dars — boshlanmagan`;
}

function LessonTimeline({ lessons }: { lessons: Lesson[] }) {
  if (lessons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Hali dars o&apos;tilmagan
      </p>
    );
  }
  // Xronologik nuqtalar; sikl raqami o'zgarganda "N-sikl:" sarlavhasi qo'yiladi.
  const items: ReactNode[] = [];
  let seenCycle: number | null = null;
  lessons.forEach((l, i) => {
    if (l.cycleSequenceNumber != null && l.cycleSequenceNumber !== seenCycle) {
      seenCycle = l.cycleSequenceNumber;
      items.push(
        <span
          key={`c-${i}`}
          className="ml-1.5 mr-0.5 text-[10px] font-medium text-muted-foreground first:ml-0"
        >
          {l.cycleSequenceNumber}-sikl:
        </span>,
      );
    }
    items.push(
      <AttendanceDot
        key={`${l.date}-${i}`}
        status={l.status}
        date={l.date}
        cycleLabel={
          l.cycleSequenceNumber ? `${l.cycleSequenceNumber}-sikl` : null
        }
      />,
    );
  });
  return <div className="flex flex-wrap items-center gap-1.5">{items}</div>;
}

function GroupCard({ group }: { group: GroupOverview }) {
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

      {/* Sikllar — sanalar bilan */}
      {group.cycles.length > 0 && (
        <ul className="space-y-0.5 text-xs">
          {group.cycles.map((c) => (
            <li key={c.cycleSequenceNumber} className="text-muted-foreground">
              <span className="font-medium text-foreground">
                {c.cycleSequenceNumber}-sikl:
              </span>{" "}
              {cycleLabel(c)}
            </li>
          ))}
        </ul>
      )}

      {/* Davomat nuqtalari (xronologik, sikl bo'yicha belgilangan) */}
      <LessonTimeline lessons={group.lessons} />
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
