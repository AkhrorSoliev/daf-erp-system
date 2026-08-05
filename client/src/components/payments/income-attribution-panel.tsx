"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Info } from "lucide-react";
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
  /** Value of the lessons actually HELD in this window (recognized revenue). */
  lessonsValue: number;
  /** `currentMonth / lessonsValue` — the one collection % the bot also shows. */
  collectionPct: number | null;
}

interface Props {
  /** yyyy-MM-dd — the same period the "Tushumlar" card is showing. */
  startDate: string;
  endDate: string;
  /**
   * «Oy oxiriga kutilyapti» — the denominator for "how far through the month
   * are we". Threaded from the overview so the page shows ONE such figure,
   * never a second answer fetched separately.
   */
  expectedMonthEnd?: number;
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
export function IncomeAttributionPanel({
  startDate,
  endDate,
  expectedMonthEnd,
}: Props) {
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
      <div className="space-y-1">
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
              Bu davrda tushgan pulni ikkiga ajratamiz: shu oy uchun to&apos;langan
              pul va oldingi oylardagi qarzni yopgan &quot;kechikkan&quot;
              to&apos;lovlar. Qarzdor o&apos;quvchining to&apos;lovi avval eng eski
              qarzdan yopiladi.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground">
          Tushgan pul shu oy uchunmi yoki eski qarzni yopish uchunmi
        </p>
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
          {/* Instant visual: green = this month, amber = old debt */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {currentShare > 0 && (
              <div
                className="bg-green-500"
                style={{ width: `${currentShare}%` }}
              />
            )}
            {100 - currentShare > 0 && (
              <div
                className="bg-amber-500"
                style={{ width: `${100 - currentShare}%` }}
              />
            )}
          </div>

          {/* This period's own income */}
          <div className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="size-2.5 shrink-0 rounded-full bg-green-500" />
                {isSingleMonth ? "Shu oy uchun" : "Shu davr uchun"} ·{" "}
                {data.currentLabel}
              </span>
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentShare}%
              </span>
            </div>
            <p className="mt-1 text-xl font-bold leading-tight text-green-600 dark:text-green-400">
              {formatPrice(data.currentMonth)} so&apos;m
            </p>
            <p className="text-xs text-muted-foreground">
              {isSingleMonth
                ? "Shu oyning o'zi uchun to'langan (eski qarz uchun emas)"
                : "Shu davrning o'zi uchun to'langan (oldingi qarz uchun emas)"}
            </p>
          </div>

          {/* Oy rejasidan yig'ildi — the question a CEO actually asks: are we
              on track for the month? Denominator is «Oy oxiriga kutilyapti»,
              the same figure the card above shows.

              It was built against lessons-held-so-far instead, because when
              this block was written the month total was still the broken
              `exactDays × 4` forecast and nothing could honestly be measured
              against it. Once that was replaced the original meaning became
              available again — this is that reconnection.

              Note the denominator MOVES: new students enrol, the month gets
              bigger, and the same cash becomes a smaller share. That is correct
              — the target grew — and it is why the figure is worth watching. */}
          {expectedMonthEnd != null && expectedMonthEnd > 0 && isSingleMonth && (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  Oy rejasidan yig&apos;ildi
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="Bu foiz qanday hisoblanadi"
                        className="inline-flex cursor-help text-muted-foreground"
                      >
                        <Info className="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-72">
                      Shu oy uchun yig&apos;ilgan pul ÷ oy oxiriga kutilayotgan
                      summa. Eski qarz uchun tushgan pul suratga kirmaydi.
                      <br />
                      <br />
                      Maxraj o&apos;zgarishi mumkin: yangi o&apos;quvchi
                      qo&apos;shilsa oy kattalashadi va o&apos;sha pul kichikroq
                      ulush bo&apos;lib qoladi — vazifa o&apos;sgani uchun.
                      <br />
                      <br />
                      Shu oyda allaqachon o&apos;tilgan darslarga nisbatan
                      yig&apos;im esa {data.collectionPct ?? 0}% (
                      {formatPrice(data.lessonsValue)} so&apos;mdan).
                    </TooltipContent>
                  </Tooltip>
                </span>
                <span className="text-sm font-semibold tabular-nums">
                  {Math.round((data.currentMonth / expectedMonthEnd) * 100)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{
                    width: `${Math.min(
                      Math.round((data.currentMonth / expectedMonthEnd) * 100),
                      100,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Oy oxiriga {formatPrice(expectedMonthEnd)} so&apos;m
                kutilyapti — shundan {formatPrice(data.currentMonth)} so&apos;m
                yig&apos;ildi
              </p>
            </div>
          )}

          {/* Fallback for a range with no month plan (Oxirgi 3 oy, Bu yil):
              the month-end expectation is a single-month figure, so measure
              against the lessons actually held in the window instead. Same
              collection % the 21:00 Telegram report prints. */}
          {!(expectedMonthEnd != null && expectedMonthEnd > 0 && isSingleMonth) &&
            data.collectionPct !== null && (
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    Yig&apos;im
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          aria-label="Yig'im qanday hisoblanadi"
                          className="inline-flex cursor-help text-muted-foreground"
                        >
                          <Info className="size-3.5" aria-hidden="true" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-72">
                        Shu davr uchun yig&apos;ilgan pul ÷ shu davrda
                        o&apos;tilgan darslar qiymati. Eski qarz uchun tushgan
                        pul suratga kirmaydi.
                      </TooltipContent>
                    </Tooltip>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {data.collectionPct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-500"
                    style={{ width: `${Math.min(data.collectionPct, 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isSingleMonth ? "Shu oyning" : "Shu davrning"} darslari{" "}
                  {formatPrice(data.lessonsValue)} so&apos;m — shundan{" "}
                  {formatPrice(data.currentMonth)} so&apos;m yig&apos;ildi
                </p>
              </div>
            )}

          {/* Old-debt (late) payments, per prior month */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="size-2.5 shrink-0 rounded-full bg-amber-500" />
                Eski qarzlar uchun
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                {100 - currentShare}% · {formatPrice(data.lateTotal)} so&apos;m
              </span>
            </div>
            <p className="-mt-1 text-xs text-muted-foreground">
              Oldingi oylardagi qarzni yopish uchun tushgan pul
            </p>

            {data.late.length === 0 ? (
              <p className="rounded-lg border border-dashed bg-card/50 px-3 py-3 text-center text-xs text-muted-foreground">
                Eski qarz uchun to&apos;lov yo&apos;q — hamma tushum shu oy uchun
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
                        <span className="font-medium">{m.label}</span>
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
            <span className="text-muted-foreground">Jami tushgan pul</span>
            <span className="font-bold tabular-nums">
              {formatPrice(data.total)} so&apos;m
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
