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
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="size-4" />
          <span>{label}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="button"
              aria-label="Tushuntirish"
              tabIndex={0}
              className="text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Info className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div
        className={cn(
          "mt-3 text-2xl font-semibold tabular-nums",
          valueColor,
        )}
      >
        {value}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        {actionLabel}
        <ArrowRight className="size-3" />
      </div>
    </button>
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
        label="Markaz foydaliligi darajasi"
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
