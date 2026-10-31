"use client";

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { lateMinutesText } from "@/lib/late-minutes";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Davomat nuqtasi — guruh "Darslar" tab'i (attendance-dots-tab) va o'quvchi
// profilidagi "Darslar" tab'i (lesson-trail-tab) o'rtasida ulashilgan
// primitivlar. Bitta manba: ranglar/yorliqlar ikki joyda dublikat bo'lmasin.

// "BARRED" (ADR-0142): ustoz davomat oldi, lekin to'lov yo'qligi uchun o'quvchini belgilab bo'lmadi, qatori yo'q.
export type DotStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "EXCUSED"
  | "BARRED"
  | null;

export const STATUS_LABEL: Record<Exclude<DotStatus, null>, string> = {
  PRESENT: msg("Keldi"),
  LATE: msg("Kech"),
  EXCUSED: msg("Sababli"),
  ABSENT: msg("Kelmadi"),
  BARRED: msg("To'lov yo'qligi uchun davomat olib bo'lmadi"),
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
    case "BARRED":
      return "bg-violet-500 border-violet-500";
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
  /**
   * O'quvchi shu sanada guruhga a'zo bo'lganmi. `false` bo'lsa (va status yo'q
   * bo'lsa) — bu "Belgilanmagan" emas, "Guruhda bo'lmagan": o'quvchi o'sha
   * darsda guruhda bo'lmagan (keyinroq qo'shilgan yoki vaqtincha boshqa guruhga
   * o'tgan). Default `true` — boshqa joylarda (lesson-trail) bu farq yo'q.
   */
  enrolled?: boolean;
  /** Recorded minutes late on a LATE lesson (ADR-0048). */
  lateMinutes?: number | null;
}

export function AttendanceDot({
  status,
  date,
  hasOverride = false,
  cycleLabel,
  enrolled = true,
  lateMinutes,
}: AttendanceDotProps) {
  const t = useT();
  const late = status === "LATE" ? lateMinutesText(lateMinutes, t) : null;
  // Bo'sh nuqta + a'zo emas → "Guruhda bo'lmagan" (Belgilanmagan'dan farqli).
  const notEnrolled = status === null && !enrolled;
  const known = status ? STATUS_LABEL[status] : null;
  const statusLabel = known
    ? t(known)
    : notEnrolled
      ? t("Guruhda bo'lmagan")
      : t("Belgilanmagan");
  const substitute = t("O'rinbosar ustoz");
  const formatted = format(new Date(date + "T00:00:00"), "dd.MM.yyyy");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-block size-3 rounded-full border",
            notEnrolled
              ? "border-dotted border-muted-foreground/25 bg-muted/30 opacity-50"
              : getDotClass(status),
            hasOverride &&
              "ring-2 ring-blue-500/70 ring-offset-1 ring-offset-background",
          )}
          aria-label={`${formatted} — ${late ?? statusLabel}${
            hasOverride ? ` — ${substitute}` : ""
          }${cycleLabel ? ` — ${cycleLabel}` : ""}`}
        />
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-medium">{formatted}</span>
        {" — "}
        {late ?? statusLabel}
        {hasOverride && (
          <span className="text-blue-600 dark:text-blue-400">
            {` • ${substitute}`}
          </span>
        )}
        {cycleLabel && (
          <span className="text-muted-foreground">{` · ${cycleLabel}`}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
