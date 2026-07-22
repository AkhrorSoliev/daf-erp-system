"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, CalendarClock, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format-utils";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface IncomeAttribution {
  period: { start: string; end: string };
  monthKey: string;
  currentLabel: string;
  total: number;
  currentMonth: number;
  lateTotal: number;
  late: { monthKey: string; label: string; amount: number }[];
  payerCount: number;
}

interface Props {
  /** yyyy-MM-dd — the same period the "Tushumlar" card is showing. */
  startDate: string;
  endDate: string;
}

/**
 * Largest-remainder (Hamilton) allocation so the displayed integer percentages
 * always sum to exactly 100 — the panel foregrounds a reconciliation contract,
 * so independently-rounded shares totalling 99/101 would undermine it.
 */
function allocateShares(amounts: number[], total: number): number[] {
  if (total <= 0) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const result = raw.map((r) => Math.floor(r));
  let remaining = 100 - result.reduce((s, f) => s + f, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remaining > 0 && k < order.length; k++, remaining--) {
    result[order[k].i]++;
  }
  return result;
}

/**
 * Drill-down shown under the income chart: how much of the period's cash is
 * REAL income for the current month vs LATE payments settling prior-month debt,
 * broken out by which month. `real + Σ late = Tushumlar card figure`.
 */
export function IncomeAttributionPanel({ startDate, endDate }: Props) {
  const { selectedBranch } = useBranchSwitcher();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [
      "income-month-attribution",
      selectedBranch?.id,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api
        .get<IncomeAttribution>("/reports/income-month-attribution", {
          params: { branchId: selectedBranch?.id, startDate, endDate },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  // A range that spans more than one month ("Oxirgi 3 oy", "Bu yil", custom).
  const isSingleMonth = data
    ? data.period.start.slice(0, 7) === data.period.end.slice(0, 7)
    : true;

  // One allocation over [current, ...late] so every visible % sums to 100.
  const shares = data
    ? allocateShares(
        [data.currentMonth, ...data.late.map((m) => m.amount)],
        data.total,
      )
    : [];
  const currentShare = shares[0] ?? 0;
  const lateShares = shares.slice(1);

  return (
    <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <div className="flex items-center gap-1.5">
        <CalendarClock className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Tushum tarkibi</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Tushum tarkibi qanday hisoblanadi"
              className="inline-flex cursor-help text-muted-foreground"
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            Tanlangan davrda kassaga tushgan pul qaysi oy uchun ekani. O&apos;quvchi
            to&apos;lov qilganda balansi minusda (qarzdor) bo&apos;lsa —
            to&apos;lovning qarzni yopgan qismi eng eski oydan boshlab
            &quot;kechikkan to&apos;lov&quot; deb hisoblanadi; qolgani shu davr
            uchun real tushum.
          </TooltipContent>
        </Tooltip>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="h-8 rounded-lg" />
          <Skeleton className="h-8 rounded-lg" />
        </div>
      ) : isError ? (
        <div className="space-y-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            Tushum tarkibini yuklab bo&apos;lmadi
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            Qayta urinish
          </button>
        </div>
      ) : !data || data.total === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Bu davrda tushum bo&apos;lmagan
        </p>
      ) : (
        <div className="space-y-3">
          {/* Real income for the period's own month(s) */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <ArrowUpRight className="size-4 text-green-500" />
                {isSingleMonth ? "Shu oy uchun" : "Shu davr uchun"} (
                {data.currentLabel})
              </span>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {currentShare}%
              </span>
            </div>
            <p className="mt-1 text-lg font-bold leading-tight text-green-600 dark:text-green-400">
              {formatPrice(data.currentMonth)} so&apos;m
            </p>
            <p className="text-[11px] text-muted-foreground">
              {isSingleMonth
                ? "Shu oy uchun real tushum — qarz yopilmagan, to'g'ridan-to'g'ri shu oy to'lovi"
                : "Shu davr uchun real tushum — davrdan oldingi qarzni yopmagan to'lovlar"}
            </p>
          </div>

          {/* Late payments, broken out by prior month */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Kechikkan to&apos;lovlar (oldingi oylardan)
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {formatPrice(data.lateTotal)} so&apos;m
              </span>
            </div>

            {data.late.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-card/50 px-3 py-3 text-center text-xs text-muted-foreground">
                Kechikkan to&apos;lov yo&apos;q — barcha tushum shu davr uchun
              </p>
            ) : (
              <div className="space-y-1.5">
                {data.late.map((m, i) => {
                  const pct = lateShares[i] ?? 0;
                  return (
                    <div
                      key={m.monthKey}
                      className="rounded-lg border bg-card px-3 py-2 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-muted-foreground">{m.label}</span>
                        <span className="flex items-baseline gap-1.5">
                          <span className="font-semibold tabular-nums">
                            {formatPrice(m.amount)} so&apos;m
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {pct}%
                          </span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${Math.max(pct, 2)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reconciliation footer — parts sum to the Tushumlar card figure */}
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Jami tushum</span>
            <span className="font-bold tabular-nums">
              {formatPrice(data.total)} so&apos;m
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
