"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { CenterActivityTrendChart } from "./center-activity-trend-chart";
import {
  type CenterActivityResponse,
  type CenterActivityTrendPoint,
  KPI_TOOLTIPS,
} from "./metric-helpers";

export type MetricKey =
  | "utilizationPct"
  | "emptyHours"
  | "activeStudents"
  | "emptySeats"
  | "extraStudentsCapacity";

const METRIC_CONFIG: Record<
  MetricKey,
  {
    title: string;
    description: string;
    color: string;
    type: "line" | "bar";
  }
> = {
  utilizationPct: {
    title: "Vaqt bandligi",
    description: KPI_TOOLTIPS.utilization,
    color: "#10b981",
    type: "line",
  },
  emptyHours: {
    title: "Bo'sh vaqtlar",
    description: KPI_TOOLTIPS.emptyHours,
    color: "#ef4444",
    type: "bar",
  },
  activeStudents: {
    title: "Amaldagi o'quvchilar",
    description: KPI_TOOLTIPS.activeStudents,
    color: "#3b82f6",
    type: "line",
  },
  emptySeats: {
    title: "Bo'sh o'rinlar",
    description: KPI_TOOLTIPS.emptySeats,
    color: "#f59e0b",
    type: "line",
  },
  extraStudentsCapacity: {
    title: "Yana o'qishi mumkin bo'lgan o'quvchilar",
    description: KPI_TOOLTIPS.extraStudents,
    color: "#10b981",
    type: "line",
  },
};

interface Props {
  open: boolean;
  onClose: () => void;
  metric: MetricKey | null;
  branchId: number | null;
  // Page's current filter context — keeps the modal in sync with the
  // KPI cards above it instead of silently switching to "last 12 months".
  startDate: string;
  endDate: string;
  bucket: "daily" | "weekly" | "monthly";
  rangeLabel: string;
}

export function MetricTrendDialog({
  open,
  onClose,
  metric,
  branchId,
  startDate,
  endDate,
  bucket,
  rangeLabel,
}: Props) {
  const { data, isLoading } = useQuery<CenterActivityResponse>({
    queryKey: [
      "center-activity-trend",
      branchId,
      startDate,
      endDate,
      bucket,
    ],
    queryFn: () =>
      api
        .get("/reports/center-activity", {
          params: {
            branchId: branchId ?? undefined,
            startDate,
            endDate,
            bucket,
          },
        })
        .then((r) => r.data),
    enabled: open && metric !== null,
    staleTime: 60_000,
  });

  if (!metric) return null;
  const config = METRIC_CONFIG[metric];
  // Backend may auto-promote daily → weekly/monthly when the period is too
  // long for daily granularity. Show the effective bucket from the response
  // instead of the requested one so the label always matches the chart.
  const effectiveBucket = data?.range.bucketUsed ?? bucket;
  const bucketLabel =
    effectiveBucket === "daily"
      ? "kunlik"
      : effectiveBucket === "weekly"
        ? "haftalik"
        : "oylik";
  const wasPromoted = effectiveBucket !== bucket;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-3xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            {rangeLabel} — {bucketLabel} kesimda o&apos;zgarish dinamikasi
            {wasPromoted && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                (uzun davr uchun avtomatik {bucketLabel} kesimga o&apos;tildi)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground whitespace-pre-line">
            {config.description}
          </p>

          <div className="h-[360px] rounded-lg border bg-card p-3">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Yuklanmoqda...
              </div>
            ) : !data || data.trend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Tanlangan davrda ma&apos;lumot yo&apos;q
              </div>
            ) : (
              <CenterActivityTrendChart
                data={data.trend as CenterActivityTrendPoint[]}
                metric={metric}
                color={config.color}
                type={config.type}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
