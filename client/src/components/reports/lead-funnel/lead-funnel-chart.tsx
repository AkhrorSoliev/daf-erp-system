"use client";

import { ArrowDownRight } from "lucide-react";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import type { FunnelRow } from "./lead-funnel-math";
import type { FunnelStage } from "./lead-funnel-types";

/**
 * Kichik bosqich ham ko'rinib, bosiladigan bo'lib qolsin. Kenglik songa
 * mutanosib — faqat shu pastki chegara bundan istisno.
 */
const MIN_WIDTH = 0.08;

const width = (ratio: number) => Math.max(ratio, MIN_WIDTH);

/** Bundan tor blokda raqam ichkariga sig'maydi. */
const NUMBER_INSIDE_MIN = 0.2;

/**
 * Bosqich ranglari ko'kdan yashilga: oxirgisi — to'lov — «maqsad» rangi.
 * SVG atributi bo'lgani uchun literal hex (chart-palette.ts izohiga qarang).
 */
function stageFill(
  stage: FunnelStage,
  palette: { series1: string; series3: string },
  isDark: boolean,
): string {
  switch (stage) {
    case "lead":
      return palette.series1;
    case "enrolled":
      return isDark ? "#3f78c9" : "#2f6fb0";
    case "attended":
      return isDark ? "#2a8a9e" : "#237f8b";
    case "paid":
      // Yorug' rejimdagi palitra yashili (#1baf7a) oq raqam bilan ~2.6:1 —
      // o'qilmaydi. Shu blok uchun to'qroq tus.
      return isDark ? palette.series3 : "#13875d";
  }
}

interface LeadFunnelChartProps {
  rows: FunnelRow[];
  leadSplit: { board: number; direct: number };
  onStageClick: (stage: FunnelStage) => void;
}

export function LeadFunnelChart({
  rows,
  leadSplit,
  onStageClick,
}: LeadFunnelChartProps) {
  const { palette, isDark } = useChartTheme();

  return (
    <ol className="flex flex-col">
      {rows.map((row, i) => {
        const top = width(row.widthRatio);
        const next = rows[i + 1];
        // Oxirgi blok to'g'ri to'rtburchak: undan keyin torayadigan joy yo'q.
        const bottom = next ? width(next.widthRatio) : top;
        // Raqam blokning o'rta balandligida turadi, joyni o'sha kenglik hal
        // qiladi. Tashqi raqam faqat tor blokda (mid < 0.2) — demak har doim
        // karta ichida qoladi.
        const mid = (top + bottom) / 2;
        const l1 = (1 - top) / 2;
        const l2 = (1 - bottom) / 2;
        const points = `${l1},0 ${1 - l1},0 ${1 - l2},1 ${l2},1`;

        return (
          <li key={row.stage}>
            {row.lostFromPrev !== null && row.lostFromPrev > 0 && (
              <p className="flex items-center justify-end gap-1 py-0.5 text-xs text-muted-foreground tabular-nums sm:pr-1">
                <ArrowDownRight className="size-3.5" />
                {formatNumber(row.lostFromPrev)} kishi o&apos;tmadi
                {row.pctOfPrev !== null && (
                  <span>· {formatPercent(row.pctOfPrev)} o&apos;tdi</span>
                )}
              </p>
            )}
            <button
              type="button"
              onClick={() => onStageClick(row.stage)}
              aria-label={`${row.label}: ${row.count} kishi — ro'yxatni ochish`}
              className="group grid w-full grid-cols-[minmax(0,7.5rem)_1fr] items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[10rem_1fr]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {row.label}
                </span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {row.pctOfFirst === null
                    ? "—"
                    : i === 0
                      ? "100%"
                      : `lidlarning ${formatPercent(row.pctOfFirst)}`}
                </span>
                {i === 0 && (leadSplit.board > 0 || leadSplit.direct > 0) && (
                  <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">
                    doskadan {formatNumber(leadSplit.board)} · to&apos;g&apos;ridan{" "}
                    {formatNumber(leadSplit.direct)}
                  </span>
                )}
              </span>

              <span className="relative block h-14 sm:h-16">
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  className="absolute inset-0 size-full"
                  aria-hidden="true"
                >
                  <polygon
                    points={points}
                    fill={stageFill(row.stage, palette, isDark)}
                    className="opacity-90 transition-opacity group-hover:opacity-100"
                  />
                </svg>
                {mid >= NUMBER_INSIDE_MIN ? (
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)] sm:text-xl">
                    {formatNumber(row.count)}
                  </span>
                ) : (
                  // Tor blokka oq raqam sig'maydi va fonga chiqib o'qilmay
                  // qoladi — shuning uchun blokning o'ng yonida, matn rangida.
                  <span
                    className="absolute inset-y-0 flex items-center pl-2 text-lg font-semibold tabular-nums sm:text-xl"
                    style={{ left: `${(50 + (mid * 100) / 2).toFixed(2)}%` }}
                  >
                    {formatNumber(row.count)}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
