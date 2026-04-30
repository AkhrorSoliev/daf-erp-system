"use client";

import {
  ArrowRight,
  Armchair,
  Clock,
  DollarSign,
  Info,
  TrendingUp,
  Users,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBalance } from "@/lib/format-utils";
import {
  type CenterActivityKpis,
  KPI_TOOLTIPS,
  formatHours,
  formatPctValue,
  formatCount,
  getUtilizationColor,
} from "./metric-helpers";
import type { MetricKey } from "./metric-trend-dialog";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tooltip: string;
  valueColor?: string;
  onClick: () => void;
  actionLabel?: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tooltip,
  valueColor,
  onClick,
  actionLabel = "Batafsil",
}: KpiCardProps) {
  // Single interactive element (the outer button). The Info icon stays
  // non-interactive — its tooltip is shown via the wrapping Tooltip's hover
  // and shows on the button's focus too. The "Batafsil" affordance is
  // visible on focus AND hover so keyboard users discover it.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={`${label} — batafsil ko'rish`}
          className="group flex w-full flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4" />
              <span>{label}</span>
            </div>
            <Info
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div
            className={cn(
              "mt-3 text-2xl font-semibold tabular-nums",
              valueColor,
            )}
          >
            {value}
          </div>
          <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {actionLabel}
            <ArrowRight className="size-3" />
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-xs whitespace-pre-line"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

interface Props {
  kpis: CenterActivityKpis | undefined;
  isLoading: boolean;
  onPotentialClick: () => void;
  onMetricClick: (metric: MetricKey) => void;
}

export function CenterActivityKpiCards({
  kpis,
  isLoading,
  onPotentialClick,
  onMetricClick,
}: Props) {
  if (isLoading || !kpis) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        icon={TrendingUp}
        label="Vaqt bandligi"
        value={formatPctValue(kpis.utilizationPct)}
        valueColor={getUtilizationColor(kpis.utilizationPct)}
        tooltip={KPI_TOOLTIPS.utilization}
        onClick={() => onMetricClick("utilizationPct")}
      />
      <KpiCard
        icon={Clock}
        label="Bo'sh vaqtlar"
        value={formatHours(kpis.emptyHours)}
        valueColor={
          kpis.emptyHours > 0
            ? "text-red-600 dark:text-red-400"
            : undefined
        }
        tooltip={KPI_TOOLTIPS.emptyHours}
        onClick={() => onMetricClick("emptyHours")}
      />
      <KpiCard
        icon={Users}
        label="Amaldagi o'quvchilar"
        value={formatCount(kpis.activeStudents)}
        tooltip={KPI_TOOLTIPS.activeStudents}
        onClick={() => onMetricClick("activeStudents")}
      />
      <KpiCard
        icon={DollarSign}
        label="Potensial qo'shimcha daromad"
        value={formatBalance(kpis.potentialExtraRevenue)}
        valueColor={
          kpis.potentialExtraRevenue > 0
            ? "text-amber-600 dark:text-amber-400"
            : undefined
        }
        tooltip={KPI_TOOLTIPS.potentialRevenue}
        onClick={onPotentialClick}
      />
      <KpiCard
        icon={Armchair}
        label="Bo'sh o'rinlar"
        value={formatCount(kpis.emptySeats)}
        valueColor={
          kpis.emptySeats > 0
            ? "text-amber-600 dark:text-amber-400"
            : undefined
        }
        tooltip={KPI_TOOLTIPS.emptySeats}
        onClick={() => onMetricClick("emptySeats")}
      />
      <KpiCard
        icon={UserPlus}
        label="Yana o'qishi mumkin bo'lgan o'quvchilar"
        value={formatCount(kpis.extraStudentsCapacity)}
        valueColor="text-emerald-600 dark:text-emerald-400"
        tooltip={KPI_TOOLTIPS.extraStudents}
        onClick={() => onMetricClick("extraStudentsCapacity")}
      />
    </div>
  );
}
