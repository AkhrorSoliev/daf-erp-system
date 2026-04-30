"use client";

import {
  CheckCircle2,
  Clock,
  Info,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ATTENDANCE_KPI_TOOLTIPS,
  type AttendanceStatusBreakdown,
  formatAttendancePct,
  formatChangePct,
  formatCount,
  getAttendanceColor,
  getChangeColor,
} from "./metric-helpers";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tooltip: string;
  valueColor?: string;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tooltip,
  valueColor,
}: KpiCardProps) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
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
            >
              <Info className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs whitespace-pre-line">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
      <div className={cn("mt-3 text-2xl font-semibold tabular-nums", valueColor)}>
        {value}
      </div>
    </div>
  );
}

interface Props {
  overallRate: number | null;
  overallRetention: number | null;
  statusBreakdown: AttendanceStatusBreakdown | undefined;
  isLoading: boolean;
}

export function AttendanceKpiCards({
  overallRate,
  overallRetention,
  statusBreakdown,
  isLoading,
}: Props) {
  if (isLoading || !statusBreakdown) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        icon={TrendingUp}
        label="Umumiy davomat"
        value={formatAttendancePct(overallRate)}
        valueColor={getAttendanceColor(overallRate)}
        tooltip={ATTENDANCE_KPI_TOOLTIPS.overall}
      />
      <KpiCard
        icon={UserCheck}
        label="O'quvchilar o'zgarishi"
        value={formatChangePct(overallRetention)}
        valueColor={getChangeColor(overallRetention)}
        tooltip={ATTENDANCE_KPI_TOOLTIPS.retention}
      />
      <KpiCard
        icon={CheckCircle2}
        label="Keldi"
        value={formatCount(statusBreakdown.present)}
        valueColor="text-emerald-600 dark:text-emerald-400"
        tooltip={ATTENDANCE_KPI_TOOLTIPS.present}
      />
      <KpiCard
        icon={Clock}
        label="Kechikdi"
        value={formatCount(statusBreakdown.late)}
        valueColor={
          statusBreakdown.late > 0
            ? "text-amber-600 dark:text-amber-400"
            : undefined
        }
        tooltip={ATTENDANCE_KPI_TOOLTIPS.late}
      />
      <KpiCard
        icon={XCircle}
        label="Kelmadi"
        value={formatCount(statusBreakdown.absent)}
        valueColor={
          statusBreakdown.absent > 0
            ? "text-red-600 dark:text-red-400"
            : undefined
        }
        tooltip={ATTENDANCE_KPI_TOOLTIPS.absent}
      />
      <KpiCard
        icon={ShieldCheck}
        label="Sababli"
        value={formatCount(statusBreakdown.excused)}
        valueColor="text-cyan-600 dark:text-cyan-400"
        tooltip={ATTENDANCE_KPI_TOOLTIPS.excused}
      />
    </div>
  );
}
