"use client";

import { ArrowDown } from "lucide-react";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  FUNNEL_ORDER,
  LOSS_LABELS,
  wholePercent,
  type FunnelRow,
} from "./lead-funnel-math";
import type { FunnelStage } from "./lead-funnel-types";

interface Props {
  rows: FunnelRow[];
  leadSplit: { board: number; direct: number };
  /** Kishi soni bo'yicha eng katta yo'qotish bo'lgan (o'tilmagan) bosqich. */
  biggestLoss: FunnelStage | null;
  onStageClick: (stage: FunnelStage) => void;
  /** Yo'qotish qatori: `stage` — odamlar to'xtab qolgan (oldingi) bosqich. */
  onLossClick: (stage: Exclude<FunnelStage, "paid">) => void;
}

/**
 * Chapdan boshlanadigan chiziqlar: uzunlik songa aniq mutanosib, minimal
 * kenglik yo'q, son doim chiziq yonida — shuning uchun 13/146 ham o'qiladi.
 * Trapetsiya nisbatni buzardi (yuza ikki bosqich o'rtachasi edi) va 8 %
 * floor kichik bosqichni shishirardi. Bitta rang; to'lov — urg'u rangi.
 */
export function LeadFunnelBars({
  rows,
  leadSplit,
  biggestLoss,
  onStageClick,
  onLossClick,
}: Props) {
  const { palette } = useChartTheme();

  return (
    <ol className="flex flex-col gap-1">
      {rows.map((row, i) => {
        const prevStage = i > 0 ? FUNNEL_ORDER[i - 1] : null;
        const lossKey = row.stage as Exclude<FunnelStage, "lead">;
        const isBiggest = biggestLoss === row.stage;
        return (
          <li key={row.stage} className="flex flex-col gap-1">
            {prevStage && row.lostFromPrev !== null && (
              <button
                type="button"
                onClick={() => onLossClick(prevStage as Exclude<FunnelStage, "paid">)}
                className={cn(
                  "flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 py-1 text-left text-sm tabular-nums transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pl-[10.75rem]",
                  isBiggest ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <ArrowDown className="size-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {formatNumber(row.lostFromPrev)} kishi {LOSS_LABELS[lossKey]}
                </span>
                {row.lostPct !== null && (
                  <span className="text-muted-foreground">· {wholePercent(row.lostPct)}</span>
                )}
                {isBiggest && row.lostFromPrev > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                    eng katta yo&apos;qotish
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onStageClick(row.stage)}
              className="grid w-full items-center gap-x-3 gap-y-1 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_minmax(0,1fr)]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{row.label}</span>
                {i === 0 && (leadSplit.board > 0 || leadSplit.direct > 0) && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    doskadan {formatNumber(leadSplit.board)} · to&apos;g&apos;ridan{" "}
                    {formatNumber(leadSplit.direct)}
                  </span>
                )}
              </span>

              <span className="flex items-center gap-3">
                <span
                  className="relative block h-7 flex-1 overflow-hidden rounded-md bg-muted/60"
                  aria-hidden="true"
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-md"
                    style={{
                      width: `${(row.widthRatio * 100).toFixed(2)}%`,
                      backgroundColor:
                        row.stage === "paid" ? palette.series3 : palette.series1,
                    }}
                  />
                </span>
                <span className="w-24 shrink-0 text-right tabular-nums sm:w-28">
                  <span className="text-lg font-semibold">{formatNumber(row.count)}</span>
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {row.pctOfFirst === null ? "—" : wholePercent(row.pctOfFirst)}
                  </span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
