"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UnmarkedLessonInfo } from "@/lib/unmarked-lesson";
import { dateFnsLocale } from "@/lib/date-fns-locale";
import { useLocale, useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

export type LessonCalendarCellType =
  | "regular"
  | "rescheduledTo"
  | "rescheduledFrom"
  | "cancelled";

export interface LessonCalendarCell {
  date: string; // YYYY-MM-DD (Tashkent calendar)
  dayName: string;
  type: LessonCalendarCellType;
  hasAttendance: boolean;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  totalStudents: number;
  movedFrom?: string;
  movedTo?: string;
  cancellationReason?: string;
  /** «Dars bo'ldimi?» — set when the lesson ended unmarked (ADR-0054). */
  unmarked?: UnmarkedLessonInfo | null;
}

interface AttendanceMonthCalendarProps {
  cells: LessonCalendarCell[];
  isLoading: boolean;
  onSelectDate: (date: string) => void;
  onMonthChange?: (date: Date) => void;
  initialMonth?: Date;
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function AttendanceMonthCalendar({
  cells,
  isLoading,
  onSelectDate,
  onMonthChange,
  initialMonth,
}: AttendanceMonthCalendarProps) {
  const t = useT();
  const { locale } = useLocale();
  const dfLocale = dateFnsLocale(locale);
  const [month, setMonth] = useState<Date>(() => initialMonth ?? new Date());
  const todayStr = dateKey(new Date());

  const goPrev = () => {
    const next = new Date(month.getFullYear(), month.getMonth() - 1, 1);
    setMonth(next);
    onMonthChange?.(next);
  };
  const goNext = () => {
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    setMonth(next);
    onMonthChange?.(next);
  };

  const sortedCells = useMemo(
    () => [...cells].sort((a, b) => a.date.localeCompare(b.date)),
    [cells],
  );

  const monthLabel = format(month, "LLLL yyyy", { locale: dfLocale });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={goPrev} className="size-8">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <Button variant="outline" size="icon" onClick={goNext} className="size-8">
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : sortedCells.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("Bu oyda dars kunlari yo'q")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {sortedCells.map((cell) => (
              <LessonCard
                key={cell.date}
                cell={cell}
                isToday={cell.date === todayStr}
                isPast={cell.date < todayStr}
                onSelect={onSelectDate}
                dfLocale={dfLocale}
              />
            ))}
          </div>
        )}

        <Legend />
      </div>
    </TooltipProvider>
  );
}

interface LessonCardProps {
  cell: LessonCalendarCell;
  isToday: boolean;
  isPast: boolean;
  onSelect: (date: string) => void;
  dfLocale: Locale;
}

/** A date-fns weekday name with a capital first letter (ru and uz-Cyrl give lower case). */
function weekdayName(date: string, dfLocale: Locale): string {
  const name = format(parseDateKey(date), "EEEE", { locale: dfLocale });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function LessonCard({
  cell,
  isToday,
  isPast,
  onSelect,
  dfLocale,
}: LessonCardProps) {
  const t = useT();
  const isClickable =
    cell.type === "regular" || cell.type === "rescheduledTo";

  const tone = useMemo(() => {
    if (cell.type === "cancelled") {
      return "border-red-300 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200";
    }
    if (cell.type === "rescheduledFrom") {
      return "border-muted-foreground/20 bg-muted/40 text-muted-foreground";
    }
    if (cell.type === "rescheduledTo") {
      return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
    }
    // regular
    if (cell.hasAttendance) {
      return "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
    }
    if (isPast) {
      return "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
    }
    return "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100";
  }, [cell, isPast]);

  const inner = (
    <button
      type="button"
      disabled={!isClickable}
      onClick={() => isClickable && onSelect(cell.date)}
      className={cn(
        "group relative flex w-full flex-col items-start gap-1 rounded-md border p-2.5 text-left transition-colors",
        tone,
        isToday && "ring-2 ring-blue-500 ring-offset-2",
        !isClickable && "cursor-default",
        isClickable && "hover:brightness-95 dark:hover:brightness-110",
        cell.type === "cancelled" && "[&>*:not(:last-child)]:line-through",
        cell.type === "rescheduledFrom" && "[&>*:not(:last-child)]:line-through",
      )}
    >
      <div className="flex w-full items-baseline justify-between gap-1">
        <span className="text-lg font-semibold tabular-nums">
          {parseDateKey(cell.date).getDate()}{" "}
          <span className="text-sm font-medium lowercase">
            {format(parseDateKey(cell.date), "LLL", { locale: dfLocale })}
          </span>
        </span>
        <span className="text-xs opacity-80">
          {weekdayName(cell.date, dfLocale)}
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs opacity-90">
        {cell.type === "rescheduledTo" && (
          <>
            <ArrowRight className="size-3" />
            <span>{t("Ko'chirib kelingan")}</span>
          </>
        )}
        {cell.type === "rescheduledFrom" && (
          <>
            <RotateCcw className="size-3" />
            <span>{t("Ko'chirilgan")}</span>
          </>
        )}
        {cell.type === "cancelled" && (
          <>
            <XCircle className="size-3" />
            <span>{t("Bekor qilingan")}</span>
          </>
        )}
        {cell.type === "regular" && cell.hasAttendance && (
          <span>
            {t("Davomat: {n}/{total}", {
              n: cell.presentCount + cell.lateCount,
              total: cell.totalStudents,
            })}
          </span>
        )}
        {cell.type === "regular" && !cell.hasAttendance && isPast && (
          <span>{t("Olinmagan")}</span>
        )}
        {cell.type === "regular" && !cell.hasAttendance && !isPast && (
          <span>{t("Kelgusi dars")}</span>
        )}
      </div>
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <CellTooltipContent cell={cell} dfLocale={dfLocale} />
      </TooltipContent>
    </Tooltip>
  );
}

const TYPE_LABEL: Record<LessonCalendarCellType, string> = {
  regular: msg("Dars"),
  rescheduledTo: msg("Ko'chirib kelingan dars"),
  rescheduledFrom: msg("Bu kungi dars boshqa kunga ko'chirilgan"),
  cancelled: msg("Bekor qilingan dars"),
};

function CellTooltipContent({
  cell,
  dfLocale,
}: {
  cell: LessonCalendarCell;
  dfLocale: Locale;
}) {
  const t = useT();
  const typeLabel = TYPE_LABEL[cell.type];
  const counts = [t("{n} keldi", { n: cell.presentCount })];
  if (cell.lateCount > 0) counts.push(t("{n} kech", { n: cell.lateCount }));
  if (cell.absentCount > 0) {
    counts.push(t("{n} kelmadi", { n: cell.absentCount }));
  }
  if (cell.excusedCount > 0) {
    counts.push(t("{n} sababli", { n: cell.excusedCount }));
  }
  return (
    <div className="space-y-1 text-xs">
      <div className="font-medium">
        {formatDDMM(cell.date)} — {weekdayName(cell.date, dfLocale)}
      </div>
      <div>{t(typeLabel)}</div>
      {cell.type === "rescheduledTo" && cell.movedFrom && (
        <div className="text-muted-foreground">
          {t("Asl sana: {date}", { date: formatDDMM(cell.movedFrom) })}
        </div>
      )}
      {cell.type === "rescheduledFrom" && cell.movedTo && (
        <div className="text-muted-foreground">
          {t("Yangi sana: {date}", { date: formatDDMM(cell.movedTo) })}
        </div>
      )}
      {cell.type === "cancelled" && cell.cancellationReason && (
        <div className="text-muted-foreground">
          {t("Sabab: {reason}", { reason: cell.cancellationReason })}
        </div>
      )}
      {(cell.type === "regular" || cell.type === "rescheduledTo") &&
        cell.hasAttendance && (
          <div className="text-muted-foreground">
            {counts.join(", ")}
            {" / "}
            {t("{n} jami", { n: cell.totalStudents })}
          </div>
        )}
    </div>
  );
}

function Legend() {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
      <LegendDot
        className="bg-blue-200 dark:bg-blue-800"
        label={t("Kelgusi dars")}
      />
      <LegendDot
        className="bg-emerald-200 dark:bg-emerald-800"
        label={t("Davomat olingan")}
      />
      <LegendDot
        className="bg-amber-200 dark:bg-amber-800"
        label={t("Olinmagan / ko'chirib kelingan")}
      />
      <LegendDot
        className="bg-muted"
        label={t("Boshqa kunga ko'chirilgan")}
      />
      <LegendDot
        className="bg-red-200 dark:bg-red-800"
        label={t("Bekor qilingan")}
      />
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block size-3 rounded-sm", className)} />
      {label}
    </span>
  );
}

function formatDDMM(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}
