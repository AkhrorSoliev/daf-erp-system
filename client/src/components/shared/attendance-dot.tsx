"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Davomat nuqtasi — guruh "Darslar" tab'i (attendance-dots-tab) va o'quvchi
// profilidagi "Darslar" tab'i (lesson-trail-tab) o'rtasida ulashilgan
// primitivlar. Bitta manba: ranglar/yorliqlar ikki joyda dublikat bo'lmasin.

export type DotStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | null;

export const STATUS_LABEL: Record<Exclude<DotStatus, null>, string> = {
  PRESENT: "Keldi",
  LATE: "Kech",
  EXCUSED: "Sababli",
  ABSENT: "Kelmadi",
};

export function getDotClass(status: DotStatus): string {
  switch (status) {
    case "PRESENT":
      return "bg-emerald-500 border-emerald-500";
    case "LATE":
      return "bg-amber-500 border-amber-500";
    case "EXCUSED":
      return "bg-sky-400 border-sky-400";
    case "ABSENT":
      return "bg-red-500 border-red-500";
    default:
      return "border-dashed border-muted-foreground/50";
  }
}

export function getPercentageColor(attended: number, expected: number): string {
  if (expected === 0) return "text-muted-foreground";
  const pct = (attended / expected) * 100;
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

interface AttendanceDotProps {
  status: DotStatus;
  /** "YYYY-MM-DD" */
  date: string;
  /** O'rinbosar ustoz belgisi (ko'k halqa). */
  hasOverride?: boolean;
  /** Tooltip'ga qo'shimcha satr — masalan "1-sikl". */
  cycleLabel?: string | null;
}

export function AttendanceDot({
  status,
  date,
  hasOverride = false,
  cycleLabel,
}: AttendanceDotProps) {
  const statusLabel = status ? STATUS_LABEL[status] : "Belgilanmagan";
  const formatted = format(new Date(date + "T00:00:00"), "dd.MM.yyyy");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block size-3 rounded-full border",
            getDotClass(status),
            hasOverride &&
              "ring-2 ring-blue-500/70 ring-offset-1 ring-offset-background",
          )}
          aria-label={`${formatted} — ${statusLabel}${
            hasOverride ? " — O'rinbosar ustoz" : ""
          }${cycleLabel ? ` — ${cycleLabel}` : ""}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{formatted}</span>
        {" — "}
        {statusLabel}
        {hasOverride && (
          <span className="text-blue-600 dark:text-blue-400">
            {" • O'rinbosar ustoz"}
          </span>
        )}
        {cycleLabel && (
          <span className="text-muted-foreground">{` · ${cycleLabel}`}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
