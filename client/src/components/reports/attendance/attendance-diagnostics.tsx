"use client";

import {
  AlertTriangle,
  CalendarX,
  CheckCircle2,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { AttendanceAnalyticsResponse } from "./metric-helpers";

interface Props {
  analytics: AttendanceAnalyticsResponse | undefined;
  isLoading: boolean;
}

interface DiagnosticItem {
  icon: LucideIcon;
  label: string;
  value: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

function toneClasses(tone: DiagnosticItem["tone"]) {
  switch (tone) {
    case "good":
      return "text-emerald-700 dark:text-emerald-400";
    case "warn":
      return "text-amber-700 dark:text-amber-400";
    case "bad":
      return "text-red-700 dark:text-red-400";
    default:
      return "text-foreground";
  }
}

function attendanceVerdict(rate: number | null): {
  label: string;
  tone: DiagnosticItem["tone"];
} {
  if (rate === null) return { label: "—", tone: "neutral" };
  if (rate >= 80) return { label: "Yaxshi", tone: "good" };
  if (rate >= 60) return { label: "O'rtacha", tone: "warn" };
  return { label: "Diqqat", tone: "bad" };
}

function changeVerdict(retentionPct: number | null): {
  label: string;
  tone: DiagnosticItem["tone"];
} {
  if (retentionPct === null) return { label: "—", tone: "neutral" };
  const change = retentionPct - 100;
  if (change > 0) return { label: `+${change}% (o'sgan)`, tone: "good" };
  if (change < 0) return { label: `${change}% (kichraygan)`, tone: "bad" };
  return { label: "0% (barqaror)", tone: "neutral" };
}

export function AttendanceDiagnostics({ analytics, isLoading }: Props) {
  if (isLoading || !analytics) {
    return <Skeleton className="h-[80px] w-full rounded-xl" />;
  }

  const items: DiagnosticItem[] = [];

  // 1. Overall attendance verdict
  const v = attendanceVerdict(analytics.overallRate);
  items.push({
    icon: v.tone === "good" ? CheckCircle2 : AlertTriangle,
    label: "Umumiy davomat",
    value: `${analytics.overallRate}% — ${v.label}`,
    tone: v.tone,
  });

  // 2. Worst-day signal
  if (analytics.byDayOfWeek.length > 0) {
    const worst = [...analytics.byDayOfWeek].sort((a, b) => a.rate - b.rate)[0];
    if (worst && worst.rate < 80) {
      items.push({
        icon: CalendarX,
        label: "Eng past hafta kuni",
        value: `${worst.day} (${worst.rate}%)`,
        tone: worst.rate < 60 ? "bad" : "warn",
      });
    }
  }

  // 3. Worst groups count
  const lowGroups = analytics.worstGroups.filter((g) => g.rate < 60).length;
  if (lowGroups > 0) {
    items.push({
      icon: AlertTriangle,
      label: "Diqqat talab guruhlar",
      value: `${lowGroups} ta — davomat 60% dan past`,
      tone: "bad",
    });
  }

  // 4. Retention / student-count change
  const cv = changeVerdict(analytics.overallRetention);
  if (analytics.overallRetention !== null) {
    const retentionTone =
      analytics.overallRetention < 100
        ? "bad"
        : analytics.overallRetention > 100
          ? "good"
          : "neutral";
    items.push({
      icon:
        analytics.overallRetention >= 100 ? TrendingUp : TrendingDown,
      label: "O'quvchilar soni",
      value: cv.label,
      tone: retentionTone,
    });
  }

  // If we somehow have no items (very small data), show one neutral item.
  if (items.length === 0) {
    items.push({
      icon: Lightbulb,
      label: "Ma'lumot",
      value: "Tanlangan davrda etarli ma'lumot yo'q",
      tone: "neutral",
    });
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-amber-500" />
        <span>Diagnostika — sahifaga birinchi qarashda nima muhim</span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item, i) => (
          <li
            key={i}
            className="flex items-start gap-2 rounded-lg border bg-background p-3"
          >
            <item.icon
              className={cn("size-4 shrink-0 mt-0.5", toneClasses(item.tone))}
            />
            <div className="min-w-0 flex-1 text-xs">
              <div className="text-muted-foreground">{item.label}</div>
              <div className={cn("mt-0.5 font-medium", toneClasses(item.tone))}>
                {item.value}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
