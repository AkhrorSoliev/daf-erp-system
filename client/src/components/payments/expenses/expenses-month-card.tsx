"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { mln } from "@/components/payments/salary/salary-page-model";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { CATEGORY_HINT, SAME_AS_PROFIT } from "./expenses-format";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategoryKey } from "./expenses-labels";
import type { MonthSummary } from "./expenses-types";

const GRID = "grid grid-cols-[1fr_1.4fr_auto] items-center gap-3";
const Muted0 = () => <span className="text-muted-foreground">0</span>;

export function ExpensesMonthCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6" />)}
      </CardContent>
    </Card>
  );
}

/** The month card (spec B6 §3.4): only the month and the branch move it, never the filters. */
export function ExpensesMonthCard({ summary, selected, onToggle }: {
  summary: MonthSummary;
  selected: readonly string[];
  onToggle: (category: ExpenseCategoryKey) => void;
}) {
  const { month } = summary;
  // Drawing only: each bar against this month's largest category.
  const max = Math.max(0, ...summary.byCategory.map((r) => r.amount));
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{monthShort(month)} xarajatlari</p>
            {summary.count === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Bu oyda xarajat yozilmagan</p>
            ) : (
              <>
                <p className="font-heading text-2xl font-semibold tabular-nums">{mln(summary.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(summary.count)} ta · naqd {mln(summary.cashTotal)} · karta {mln(summary.cardTotal)}
                </p>
              </>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {SAME_AS_PROFIT}
          </p>
        </div>
        <div className="text-sm">
          <div className={cn(GRID, "border-b px-1 pb-1 text-xs text-muted-foreground")}>
            <span>Turkum</span>
            <span>{monthShort(month)}</span>
            <span className="text-right">{monthShort(addMonths(month, -1))}</span>
          </div>
          {summary.byCategory.map((r) => {
            const picked = selected.includes(r.category);
            return (
              <button key={r.category} type="button" aria-pressed={picked} onClick={() => onToggle(r.category)}
                className={cn(GRID, "w-full rounded-md px-1 py-1.5 text-left hover:bg-muted/60", picked && "bg-muted font-medium")}>
                <span>{EXPENSE_CATEGORY_LABELS[r.category]}</span>
                <span className="flex items-center gap-2">
                  {r.notRecorded ? (
                    <span className={cn(PILL_BASE, "bg-amber-500/25 text-foreground")}>yozilmagan</span>
                  ) : r.amount > 0 ? (
                    <>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((r.amount / max) * 100)}%` }} />
                      </span>
                      <span className="tabular-nums">{mln(r.amount)}</span>
                    </>
                  ) : (
                    <Muted0 />
                  )}
                </span>
                <span className="text-right tabular-nums">{r.lastMonthAmount > 0 ? mln(r.lastMonthAmount) : <Muted0 />}</span>
              </button>
            );
          })}
          <div className={cn(GRID, "border-t px-1 pt-1.5 font-semibold")}>
            <span>Jami</span>
            <span className="tabular-nums">{mln(summary.total)}</span>
            <span className="text-right tabular-nums">{mln(summary.lastMonthTotal)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{CATEGORY_HINT}</p>
      </CardContent>
    </Card>
  );
}
