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
import { ContractClauseLink } from "@/components/shared/contract-clause-link";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import type { Params } from "@/i18n/translate";
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
  paidLater?: boolean;
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

// The group card draws `t(label)`.
const ENROLLMENT_STATUS_LABEL: Record<GroupOverview["status"], string> = {
  ACTIVE: msg("Faol"),
  FROZEN: msg("Muzlatilgan"),
  COMPLETED: msg("Tugatgan"),
  DROPPED: msg("Chiqarilgan"),
  TRANSFERRED: msg("O'tkazilgan"),
};

/** "YYYY-MM-DD" → "dd.MM" (Tashkent kunini siljitmasdan). */
function shortDate(date: string): string {
  return format(new Date(date + "T00:00:00"), "dd.MM");
}

function cycleLabel(
  c: Cycle,
  t: (source: string, params?: Params) => string,
): string {
  const range =
    c.lastDate && c.lastDate !== c.firstDate
      ? `${shortDate(c.firstDate)} — ${shortDate(c.lastDate)}`
      : shortDate(c.firstDate);
  // To'liq blok → "(12 dars)"; davom etayotgan blok → "(4/12 dars)".
  return `${range} (${blockCount(c.lessonCount, c.capacity, t)})`;
}

function LessonTimeline({
  lessons,
  year,
}: {
  lessons: Lesson[];
  year: string;
}) {
  const t = useT();
  if (lessons.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("Hali dars o'tilmagan")}
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
    const title = block ? blockTitle(l, year, t) : null;
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
        paidLater={l.paidLater}
        cycleLabel={title}
      />,
    );
  });
  return <div className="flex flex-wrap items-center gap-1.5">{items}</div>;
}

function GroupCard({ group }: { group: GroupOverview }) {
  const t = useT();
  const statusLabel = ENROLLMENT_STATUS_LABEL[group.status];
  const year = tashkentNow().dateStr.slice(0, 4);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{group.groupName}</p>
            {group.status !== "ACTIVE" && (
              <Badge variant="outline" className="text-[10px]">
                {t(statusLabel)}
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
          {t("{attended}/{total} keldi", {
            attended: group.attended,
            total: group.total,
          })}
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
                {blockTitle(c, year, t)}:
              </span>{" "}
              {cycleLabel(c, t)}
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
  const t = useT();
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

  const hasBarred = (data?.groups ?? []).some((g) =>
    g.lessons.some((l) => l.status === "BARRED"),
  );
  const hasPaidLater = (data?.groups ?? []).some((g) =>
    g.lessons.some((l) => l.paidLater),
  );

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Belgilar + yopilgan guruhlar toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="font-medium">{t("Belgilar:")}</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-emerald-500" />
              {t("Keldi")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-amber-500" />
              {t("Kech")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-sky-400" />
              {t("Sababli")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-3 rounded-full bg-red-500" />
              {t("Kelmadi")}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-violet-100 py-0.5 pl-1.5 pr-2.5 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
              <span className="inline-block size-3 rounded-full bg-violet-500" />
              {t("To'lov yo'q")}
            </span>
            {hasPaidLater && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded-full bg-emerald-500 ring-2 ring-violet-500 ring-offset-1 ring-offset-background" />
                {t("To'lov keyin keldi")}
              </span>
            )}
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
              {t("Yopilgan guruhlarni ko'rsatish")}
            </Label>
          </div>
        </div>

        {hasBarred && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Binafsha nuqta: ustoz davomat oldi, lekin to'lov yo'qligi uchun o'quvchini belgilab bo'lmadi.",
            )}{" "}
            <ContractClauseLink no="3.2" />
          </p>
        )}

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
                ? t("Dars ma'lumotlari mavjud emas")
                : t(
                    "Faol guruhda dars ma'lumotlari yo'q — yopilgan guruhlarni ko'rsatib ko'ring",
                  )}
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
