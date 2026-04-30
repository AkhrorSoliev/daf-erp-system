"use client";

import { useMemo } from "react";
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

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  metric: MetricKey | null;
  branchId: number | null;
}

export function MetricTrendDialog({ open, onClose, metric, branchId }: Props) {
  const range = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return { startDate: toIso(start), endDate: toIso(end) };
  }, []);

  const { data, isLoading } = useQuery<CenterActivityResponse>({
    queryKey: [
      "center-activity-12m",
      branchId,
      range.startDate,
      range.endDate,
    ],
    queryFn: () =>
      api
        .get("/reports/center-activity", {
          params: {
            branchId: branchId ?? undefined,
            startDate: range.startDate,
            endDate: range.endDate,
            bucket: "monthly",
          },
        })
        .then((r) => r.data),
    enabled: open && metric !== null,
    staleTime: 60_000,
  });

  if (!metric) return null;
  const config = METRIC_CONFIG[metric];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="!max-w-3xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
          <DialogDescription>
            So&apos;nggi 12 oy bo&apos;yicha o&apos;zgarish dinamikasi
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
