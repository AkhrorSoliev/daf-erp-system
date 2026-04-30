"use client";

import { useState } from "react";
import { ArrowRightLeft, Info, UserX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TeacherChangesDialog } from "./teacher-changes-dialog";
import { DepartedAfterChangeDialog } from "./departed-after-change-dialog";
import type {
  RetentionMetrics,
  RetentionQueryParams,
} from "./teacher-change-types";

interface Props {
  data: RetentionMetrics | undefined;
  isLoading: boolean;
  queryParams: RetentionQueryParams;
}

const WINDOW_EXPLANATION =
  "Ustoz almashgandan keyin guruhning dastlabki 5 dars davomida ketgan o'quvchilar hisoblanadi.\n" +
  "6-darsdan keyin ketsa — ustoz sabab emas deb hisoblanadi.";

export function TeacherChangeRetentionCards({
  data,
  isLoading,
  queryParams,
}: Props) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [departedOpen, setDepartedOpen] = useState(false);

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <Skeleton className="h-5 w-64" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-[104px] rounded-xl" />
          <Skeleton className="h-[104px] rounded-xl" />
        </div>
      </div>
    );
  }

  const ratePercent =
    data.totalTeacherChanges > 0
      ? (data.departedAfterTeacherChange / data.totalTeacherChanges) * 100
      : 0;

  const rateColor =
    ratePercent >= 30
      ? "text-red-600 dark:text-red-400"
      : ratePercent >= 15
        ? "text-amber-600 dark:text-amber-400"
        : undefined;

  return (
    <>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-base">
              Guruh o&apos;zgarishi — Saqlab qolish vositasi
            </h3>
            <p className="text-xs text-muted-foreground">
              Ustoz almashishi o&apos;quvchilarning ketishiga qanday ta&apos;sir
              qilganini ko&apos;rsatadi
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Tushuntirish"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs whitespace-pre-line">
              {WINDOW_EXPLANATION}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ClickableKpiCard
            icon={<ArrowRightLeft className="size-4" />}
            label="Jami o'zgarishlar"
            value={data.totalTeacherChanges.toLocaleString("uz-UZ")}
            disabled={data.totalTeacherChanges === 0}
            onClick={() => setChangesOpen(true)}
          />
          <ClickableKpiCard
            icon={<UserX className="size-4" />}
            label="O'zgargandan keyin ketish"
            value={data.departedAfterTeacherChange.toLocaleString("uz-UZ")}
            secondary={
              data.totalTeacherChanges > 0
                ? `${ratePercent.toFixed(1)}% (${data.departedAfterTeacherChange} / ${data.totalTeacherChanges})`
                : undefined
            }
            valueColor={rateColor}
            disabled={data.departedAfterTeacherChange === 0}
            onClick={() => setDepartedOpen(true)}
          />
        </div>
      </div>

      <TeacherChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        queryParams={queryParams}
      />
      <DepartedAfterChangeDialog
        open={departedOpen}
        onOpenChange={setDepartedOpen}
        queryParams={queryParams}
      />
    </>
  );
}

interface ClickableKpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  secondary?: string;
  valueColor?: string;
  disabled: boolean;
  onClick: () => void;
}

function ClickableKpiCard({
  icon,
  label,
  value,
  secondary,
  valueColor,
  disabled,
  onClick,
}: ClickableKpiCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border bg-background p-4 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-background"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`text-2xl font-semibold tabular-nums mt-2 ${valueColor ?? ""}`}
      >
        {value}
      </div>
      {secondary && (
        <div className="text-xs text-muted-foreground mt-1">{secondary}</div>
      )}
      {!disabled && (
        <div className="text-xs text-muted-foreground mt-2">
          Batafsil ko&apos;rish uchun bosing
        </div>
      )}
    </button>
  );
}
