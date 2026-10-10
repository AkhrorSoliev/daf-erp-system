"use client";

import { Fragment } from "react";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import type { FunnelRow } from "./lead-funnel-math";
import type { FunnelStage } from "./lead-funnel-types";

/** Bundan tor blokda raqam ichkariga sig'maydi va blok yonida yoziladi. */
const NUMBER_INSIDE_MIN = 0.2;

/**
 * Bosqichlar bir ko'k tusda pastga qarab to'qlashadi, to'lov — maqsad —
 * yashil. SVG/inline style bo'lgani uchun literal hex.
 */
const STAGE_FILL: Record<"light" | "dark", Record<FunnelStage, string>> = {
  light: {
    lead: "#378add",
    enrolled: "#2a78d6",
    attended: "#185fa5",
    // Palitra yashili (#1baf7a) oq raqam bilan ~2.6:1 — o'qilmaydi.
    paid: "#13875d",
  },
  dark: {
    lead: "#3987e5",
    enrolled: "#378add",
    attended: "#2a78d6",
    paid: "#199e70",
  },
};

const BAR_HEIGHT = "h-12 sm:h-[52px]";
const LABEL_COLS = "grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[10rem_1fr]";

interface LeadFunnelChartProps {
  rows: FunnelRow[];
  leadSplit: { board: number; direct: number };
  onStageClick: (stage: FunnelStage) => void;
}

/**
 * Har blok kengligi aynan `count / lead` — minimal kenglik yo'q, blok
 * qo'shni bosqich bilan aralashmaydi. Voronka shakli bloklar orasidagi och
 * «oqim» qismidan keladi; u faqat ko'rinish, raqam emas.
 */
export function LeadFunnelChart({
  rows,
  leadSplit,
  onStageClick,
}: LeadFunnelChartProps) {
  const { isDark } = useChartTheme();
  const fill = STAGE_FILL[isDark ? "dark" : "light"];
  const hasSplit = leadSplit.board > 0 || leadSplit.direct > 0;

  return (
    <ol className="group/funnel flex flex-col">
      {rows.map((row, i) => {
        const next = rows[i + 1];
        const w = row.widthRatio;
        const half = (w * 50).toFixed(2);

        return (
          <Fragment key={row.stage}>
            <li>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onStageClick(row.stage)}
                    aria-label={`${row.label}: ${row.count} kishi — ro'yxatni ochish`}
                    className={`group/row grid w-full ${LABEL_COLS} items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {row.label}
                      </span>
                      {i === 0 && hasSplit && (
                        // Tor ustunda (telefon) ikki qatorga bo'linadi —
                        // kesilib «to'g'…» bo'lib qolmasin.
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          <span className="block whitespace-nowrap sm:inline">
                            doskadan {formatNumber(leadSplit.board)}
                          </span>
                          <span className="hidden sm:inline"> · </span>
                          <span className="block whitespace-nowrap sm:inline">
                            to&apos;g&apos;ridan {formatNumber(leadSplit.direct)}
                          </span>
                        </span>
                      )}
                    </span>

                    <span className={`relative block ${BAR_HEIGHT}`}>
                      <span
                        className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-md transition-opacity group-hover/funnel:opacity-40 group-hover/row:opacity-100!"
                        style={{
                          width: `max(${(w * 100).toFixed(2)}%, 3px)`,
                          backgroundColor: fill[row.stage],
                        }}
                      />
                      {w >= NUMBER_INSIDE_MIN ? (
                        <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white tabular-nums sm:text-xl">
                          {formatNumber(row.count)}
                        </span>
                      ) : (
                        <span
                          className="absolute inset-y-0 flex items-center pl-2 text-lg font-semibold tabular-nums sm:text-xl"
                          style={{ left: `calc(50% + ${half}%)` }}
                        >
                          {formatNumber(row.count)}
                        </span>
                      )}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="tabular-nums">
                  <p className="font-medium">
                    {row.label} — {formatNumber(row.count)} kishi
                  </p>
                  {i > 0 && (
                    <p>lidlarning {formatPercent(row.pctOfFirst)}</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </li>

            {next && (
              <li aria-hidden="true" className={`grid ${LABEL_COLS} gap-2`}>
                <span />
                <span className="relative block h-7 sm:h-[30px]">
                  <svg
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    className="absolute inset-0 size-full"
                  >
                    <polygon
                      points={`${(1 - w) / 2},0 ${(1 + w) / 2},0 ${(1 + next.widthRatio) / 2},1 ${(1 - next.widthRatio) / 2},1`}
                      fill={fill[next.stage]}
                      opacity={0.16}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium tabular-nums sm:text-sm">
                    {formatPercent(next.pctOfPrev)} o&apos;tdi
                  </span>
                  {next.lostFromPrev !== null && next.lostFromPrev > 0 && (
                    <span className="absolute inset-y-0 right-0 hidden items-center text-xs text-muted-foreground tabular-nums sm:flex">
                      {formatNumber(next.lostFromPrev)} kishi o&apos;tmadi
                    </span>
                  )}
                </span>
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
