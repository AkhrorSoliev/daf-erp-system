"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lightbulb,
  TrendingUp,
  XOctagon,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBalance } from "@/lib/format-utils";
import {
  formatHours,
  type CenterActivityResponse,
} from "./metric-helpers";

interface Props {
  data: CenterActivityResponse | undefined;
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

function utilizationVerdict(pct: number): {
  label: string;
  tone: DiagnosticItem["tone"];
} {
  if (pct >= 70) return { label: "Yaxshi", tone: "good" };
  if (pct >= 50) return { label: "O'rtacha", tone: "warn" };
  return { label: "Past — yangi guruhlar joylashtirish kerak", tone: "bad" };
}

export function CenterActivityDiagnostics({ data, isLoading }: Props) {
  if (isLoading || !data) {
    return <Skeleton className="h-[80px] w-full rounded-xl" />;
  }

  const items: DiagnosticItem[] = [];

  // 1. Overall utilization verdict
  const v = utilizationVerdict(data.kpis.utilizationPct);
  items.push({
    icon: v.tone === "good" ? CheckCircle2 : AlertTriangle,
    label: "Vaqt bandligi",
    value: `${data.kpis.utilizationPct}% — ${v.label}`,
    tone: v.tone,
  });

  // 2. Room with biggest idle hours
  if (data.rooms.length > 0) {
    const sortedByIdle = [...data.rooms].sort(
      (a, b) => b.totals.idleHoursPeriod - a.totals.idleHoursPeriod,
    );
    const topIdle = sortedByIdle[0];
    if (topIdle && topIdle.totals.idleHoursPeriod > 0) {
      items.push({
        icon: Clock,
        label: "Eng ko'p bo'sh vaqt",
        value: `${topIdle.name} — ${formatHours(topIdle.totals.idleHoursPeriod)}`,
        tone: "warn",
      });
    }
  }

  // 3. Room with biggest revenue opportunity
  const sortedByRevenue = [...data.rooms].sort(
    (a, b) => b.totals.potentialExtraRevenue - a.totals.potentialExtraRevenue,
  );
  const topRevenue = sortedByRevenue[0];
  if (topRevenue && topRevenue.totals.potentialExtraRevenue > 0) {
    items.push({
      icon: TrendingUp,
      label: "Eng katta daromad imkoniyati",
      value: `${topRevenue.name} — ${formatBalance(topRevenue.totals.potentialExtraRevenue)}`,
      tone: "good",
    });
  }

  // 4. Rooms with no capacity set (incomplete data)
  const noCapacityCount = data.rooms.filter(
    (r) => r.capacity === null,
  ).length;
  if (noCapacityCount > 0) {
    items.push({
      icon: XOctagon,
      label: "Sig'im belgilanmagan",
      value: `${noCapacityCount} ta xona — hisob-kitob to'liq emas`,
      tone: "bad",
    });
  }

  // Empty fallback
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
              <div
                className={cn(
                  "mt-0.5 font-medium break-words",
                  toneClasses(item.tone),
                )}
              >
                {item.value}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
