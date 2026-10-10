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

/**
 * Raqam blok ichida turadi, blok uni sig'dira olsa (kengligi raqam + chetlar).
 * Juda tor blokda (masalan 38 dan 2 kishi) raqam blok yonida yoziladi.
 * Klasslar to'liq yozilgan — Tailwind faqat matnda ko'rganini yaratadi.
 * Ixcham ko'rinishda raqam kichikroq, shuning uchun chegaralar ham kichik.
 */
function insideAt(count: number, compact: boolean): string {
  if (compact) {
    if (count < 10) return "@min-[1rem]:flex";
    if (count < 100) return "@min-[1.5rem]:flex";
    if (count < 1000) return "@min-[2.25rem]:flex";
    return "@min-[3.25rem]:flex";
  }
  if (count < 10) return "@min-[1.5rem]:flex";
  if (count < 100) return "@min-[2.25rem]:flex";
  if (count < 1000) return "@min-[3rem]:flex";
  return "@min-[4.5rem]:flex";
}

function outsideUntil(count: number, compact: boolean): string {
  if (compact) {
    if (count < 10) return "@min-[1rem]:hidden";
    if (count < 100) return "@min-[1.5rem]:hidden";
    if (count < 1000) return "@min-[2.25rem]:hidden";
    return "@min-[3.25rem]:hidden";
  }
  if (count < 10) return "@min-[1.5rem]:hidden";
  if (count < 100) return "@min-[2.25rem]:hidden";
  if (count < 1000) return "@min-[3rem]:hidden";
  return "@min-[4.5rem]:hidden";
}

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

/** To'liq (hisobot sahifasi) va ixcham (bosh sahifa) o'lchamlari. */
const SIZE = {
  full: {
    cols: "grid-cols-[minmax(0,7rem)_1fr] sm:grid-cols-[10rem_1fr]",
    bar: "h-12 sm:h-[52px]",
    gap: "h-7 sm:h-[30px]",
    label: "text-sm font-medium",
    number: "text-lg font-semibold sm:text-xl",
    step: "text-xs font-medium sm:text-sm",
  },
  compact: {
    cols: "grid-cols-[minmax(0,7rem)_1fr]",
    bar: "h-7",
    gap: "h-4",
    label: "text-xs text-muted-foreground",
    number: "text-sm font-semibold",
    step: "text-[11px] font-medium",
  },
} as const;

interface LeadFunnelChartProps {
  rows: FunnelRow[];
  /** Ixcham ko'rinishda ko'rsatilmaydi. */
  leadSplit?: { board: number; direct: number };
  /** Berilmasa bosqichlar bosilmaydi. */
  onStageClick?: (stage: FunnelStage) => void;
  /** Bosh sahifa uchun: past bloklar, manba va «o'tmadi» yozuvlarisiz. */
  compact?: boolean;
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
  compact = false,
}: LeadFunnelChartProps) {
  const { isDark } = useChartTheme();
  const fill = STAGE_FILL[isDark ? "dark" : "light"];
  const size = SIZE[compact ? "compact" : "full"];
  const hasSplit =
    !compact &&
    leadSplit !== undefined &&
    (leadSplit.board > 0 || leadSplit.direct > 0);

  return (
    <ol className="group/funnel flex flex-col">
      {rows.map((row, i) => {
        const next = rows[i + 1];
        const w = row.widthRatio;

        return (
          <Fragment key={row.stage}>
            <li>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onStageClick && (() => onStageClick(row.stage))}
                    aria-label={
                      onStageClick
                        ? `${row.label}: ${row.count} kishi — ro'yxatni ochish`
                        : `${row.label}: ${row.count} kishi`
                    }
                    className={`group/row grid w-full ${size.cols} items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${onStageClick ? "" : "cursor-default"}`}
                  >
                    <span className="min-w-0">
                      <span className={`block truncate ${size.label}`}>
                        {row.label}
                      </span>
                      {i === 0 && hasSplit && leadSplit && (
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

                    <span className={`relative block ${size.bar}`}>
                      {/* Blok o'zi container: raqam ichiga sig'adimi — uning
                          haqiqiy pikseldagi kengligi hal qiladi, foiz emas. */}
                      <span
                        className={`@container absolute inset-y-0 left-1/2 -translate-x-1/2 transition-opacity group-hover/funnel:opacity-40 group-hover/row:opacity-100! ${compact ? "rounded" : "rounded-md"}`}
                        style={{
                          width: `max(${(w * 100).toFixed(2)}%, 3px)`,
                          backgroundColor: fill[row.stage],
                        }}
                      >
                        <span
                          className={`absolute inset-0 hidden items-center justify-center text-white tabular-nums ${size.number} ${insideAt(row.count, compact)}`}
                        >
                          {formatNumber(row.count)}
                        </span>
                        <span
                          className={`absolute inset-y-0 left-full flex items-center pl-2 text-foreground tabular-nums ${size.number} ${outsideUntil(row.count, compact)}`}
                        >
                          {formatNumber(row.count)}
                        </span>
                      </span>
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
              <li aria-hidden="true" className={`grid ${size.cols} gap-2`}>
                <span />
                <span className={`relative block ${size.gap}`}>
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
                  <span
                    className={`absolute inset-0 flex items-center justify-center tabular-nums ${size.step}`}
                  >
                    {formatPercent(next.pctOfPrev)} o&apos;tdi
                  </span>
                  {!compact &&
                    next.lostFromPrev !== null &&
                    next.lostFromPrev > 0 && (
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
