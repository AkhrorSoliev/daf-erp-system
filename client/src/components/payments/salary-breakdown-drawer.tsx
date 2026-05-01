"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, RotateCcw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { PossibleDeductionsInfo } from "./possible-deductions-info";
import api from "@/lib/api";

interface BreakdownLine {
  id: string;
  lessonDate: string;
  student: { id: number; firstName: string; lastName: string };
  group: { id: string; name: string; course: { name: string } };
  perLessonCost: number;
  amount: number;
  configVersion: {
    salaryType: string;
    value: number;
    scope: "GROUP" | "GLOBAL";
  } | null;
  reversedAt: string | null;
  reversalReason: string | null;
  reversedBy: { firstName: string; lastName: string } | null;
}

interface BreakdownResponse {
  payment: {
    id: string;
    userId: number;
    periodStart: string;
    periodEnd: string;
    amount: number;
    status: string;
  };
  lines: BreakdownLine[];
  totals: {
    accrualCount: number;
    amountTotal: number;
    reversedCount: number;
    reversedTotal: number;
  };
}

interface Props {
  salaryPaymentId: string | null;
  onClose: () => void;
}

const statusLabels: Record<string, string> = {
  CALCULATED: "Hisoblangan",
  APPROVED: "Tasdiqlangan",
  PAID: "To'langan",
  CANCELLED: "Bekor qilingan",
};

const statusVariant: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  CALCULATED: "secondary",
  APPROVED: "default",
  PAID: "default",
  CANCELLED: "destructive",
};

const fmt = (n: number) => n.toLocaleString("uz-UZ");

/**
 * Read-only side sheet shown when an admin opens a salary payment row.
 *
 * UX rebuild (Faza 8 audit feedback): single-pane layout with one big
 * summary card up top, a compact 5-column accrual table below, and a CSV
 * export. Replaces the earlier 4-stat grid + 7-column table that felt
 * cramped on the side surface.
 */
export function SalaryBreakdownDrawer({ salaryPaymentId, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["salary-payment-breakdown", salaryPaymentId],
    queryFn: () =>
      api
        .get<BreakdownResponse>(`/salary/payments/${salaryPaymentId}/breakdown`)
        .then((r) => r.data),
    enabled: !!salaryPaymentId,
  });

  // Pre-compute lesson + student counts for the summary card so the table
  // doesn't have to scan twice and the user gets a "5 ta o'quvchi · 45 ta dars"
  // line at a glance.
  const summary = useMemo(() => {
    if (!data) return null;
    const active = data.lines.filter((l) => !l.reversedAt);
    const studentIds = new Set(active.map((l) => l.student.id));
    return {
      activeLessons: active.length,
      uniqueStudents: studentIds.size,
    };
  }, [data]);

  const handleCsvExport = () => {
    if (!data) return;
    const rows: (string | number)[][] = [
      [
        "Sana",
        "O'quvchi",
        "Guruh",
        "Kurs",
        "Dars narxi",
        "Hisoblash turi",
        "Qiymat",
        "Qo'llanilish doirasi",
        "Summa",
        "Bekor qilingan",
        "Bekor qilingan sabab",
      ],
      ...data.lines.map((l) => [
        format(new Date(l.lessonDate), "yyyy-MM-dd"),
        `${l.student.firstName} ${l.student.lastName}`,
        l.group.name,
        l.group.course.name,
        l.perLessonCost,
        l.configVersion?.salaryType ?? "",
        l.configVersion?.value ?? "",
        l.configVersion?.scope ?? "",
        l.amount,
        l.reversedAt ? "ha" : "",
        l.reversalReason ?? "",
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(","),
      )
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `oylik-tafsilotlari-${data.payment.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Sheet open={!!salaryPaymentId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="sm:max-w-3xl w-full p-0 flex flex-col">
        {/* === Header === */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <SheetTitle>Oylik tafsilotlari</SheetTitle>
              <SheetDescription>
                Har dars uchun yozilgan summalar va qo&apos;llangan hisoblash qoidasi
              </SheetDescription>
            </div>
            {data && (
              <Badge variant={statusVariant[data.payment.status] ?? "secondary"}>
                {statusLabels[data.payment.status] ?? data.payment.status}
              </Badge>
            )}
          </div>
        </SheetHeader>

        {/* === Body === */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {isLoading ? (
            <BreakdownLoading />
          ) : !data ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              Ma&apos;lumot topilmadi
            </p>
          ) : (
            <>
              {/* Summary card */}
              <div className="rounded-xl border bg-card p-5">
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      Summa
                    </div>
                    <div className="text-3xl font-bold tabular-nums mt-1">
                      {fmt(data.payment.amount)}{" "}
                      <span className="text-base font-medium text-muted-foreground">
                        so&apos;m
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(data.payment.periodStart), "dd.MM")} —{" "}
                    {format(new Date(data.payment.periodEnd), "dd.MM.yyyy")}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 mt-5 pt-4 border-t">
                  <SummaryStat
                    label="Darslar"
                    value={`${summary?.activeLessons ?? 0} ta`}
                  />
                  <SummaryStat
                    label="O'quvchilar"
                    value={`${summary?.uniqueStudents ?? 0} ta`}
                  />
                </div>
                {data.totals.reversedCount > 0 && (
                  <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-900 dark:text-amber-300">
                    <RotateCcw className="size-3.5 mt-0.5 shrink-0" />
                    <div>
                      <b>{data.totals.reversedCount}</b> ta accrual bekor qilingan
                      ({fmt(data.totals.reversedTotal)} so&apos;m) — sof
                      to&apos;lovga qo&apos;shilmagan
                    </div>
                  </div>
                )}
              </div>

              {/* Lines section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Har dars uchun batafsil
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Sana bo&apos;yicha tartiblangan
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCsvExport}
                    disabled={!data.lines.length}
                  >
                    <Download className="size-3.5 mr-1.5" />
                    CSV
                  </Button>
                </div>

                {data.lines.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center border rounded-md">
                    Bu davrda yozilgan accrual yo&apos;q
                  </p>
                ) : (
                  <div className="rounded-md border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 border-r">#</TableHead>
                          <TableHead className="w-[88px]">Sana</TableHead>
                          <TableHead>O&apos;quvchi · Guruh</TableHead>
                          <TableHead>Hisoblash qoidasi</TableHead>
                          <TableHead className="text-right">Summa</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.lines.map((l, i) => (
                          <BreakdownRow key={l.id} line={l} index={i + 1} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <PossibleDeductionsInfo />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums truncate">{value}</div>
    </div>
  );
}

function BreakdownRow({ line, index }: { line: BreakdownLine; index: number }) {
  const isReversed = !!line.reversedAt;
  const rate = line.configVersion;
  const rateLabel = rate
    ? rate.salaryType === "PERCENTAGE"
      ? `${rate.value}%`
      : rate.salaryType === "FIXED_PER_STUDENT"
        ? `${fmt(rate.value)}/tsikl`
        : `${fmt(rate.value)}/oy`
    : "—";

  return (
    <TableRow
      className={cn(
        "align-top",
        isReversed && "bg-amber-50/40 dark:bg-amber-950/20",
      )}
    >
      <TableCell
        className={cn(
          "border-r text-muted-foreground tabular-nums",
          isReversed && "opacity-60",
        )}
      >
        {index}
      </TableCell>
      <TableCell className={cn("text-xs", isReversed && "opacity-60")}>
        {format(new Date(line.lessonDate), "dd.MM.yyyy")}
      </TableCell>
      <TableCell className={cn(isReversed && "opacity-60")}>
        <div className="font-medium text-sm leading-tight">
          {line.student.firstName} {line.student.lastName}
        </div>
        <div className="text-xs text-muted-foreground leading-tight mt-0.5">
          {line.group.name} · {line.group.course.name}
        </div>
      </TableCell>
      <TableCell className={cn(isReversed && "opacity-60")}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="font-medium">
            {rateLabel}
          </Badge>
          {rate?.scope === "GROUP" && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              guruh
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums mt-1">
          dars: {fmt(line.perLessonCost)} so&apos;m
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div
          className={cn(
            "font-semibold tabular-nums text-sm",
            isReversed && "line-through text-muted-foreground",
          )}
        >
          {fmt(line.amount)}
        </div>
        {isReversed && (
          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5 inline-flex items-center gap-1">
            <RotateCcw className="size-2.5" />
            Bekor
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

function BreakdownLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-32 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    </div>
  );
}
