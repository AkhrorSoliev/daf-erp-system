"use client";

import { ChartCard } from "@/components/shared/chart-card";
import { useChartTheme } from "@/components/dashboard/use-chart-theme";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { conversionPct, wholePercent } from "./lead-funnel-math";

export interface BreakdownRow {
  key: string;
  name: string;
  lead: number;
  paid: number;
  /** «Boshqalar» va filial qatorlari bosilmaydi. */
  clickable: boolean;
}

interface Props {
  title: string;
  tooltip: string;
  rows: BreakdownRow[];
  emptyMessage: string;
  onRowClick?: (key: string) => void;
}

/**
 * «Lid → to'lov» taqsimoti: manba yoki filial bo'yicha. Foiz chizig'i bitta
 * rangda — qatorlar bir-biri bilan taqqoslanadi, rang ma'no tashimaydi.
 */
export function LeadFunnelBreakdownCard({
  title,
  tooltip,
  rows,
  emptyMessage,
  onRowClick,
}: Props) {
  const { palette } = useChartTheme();

  return (
    <ChartCard
      title={title}
      tooltip={tooltip}
      isEmpty={rows.length === 0}
      emptyMessage={emptyMessage}
      bodyHeightClass="h-auto"
    >
      <ul className="flex flex-col">
        {rows.map((row) => {
          const pct = conversionPct(row.lead, row.paid);
          const content = (
            <>
              <span className="min-w-0 truncate text-sm">{row.name}</span>
              <span className="whitespace-nowrap text-sm tabular-nums">
                {formatNumber(row.lead)}
                <span className="text-muted-foreground"> → </span>
                {formatNumber(row.paid)}
              </span>
              <span className="w-12 text-right text-sm font-medium tabular-nums">
                {wholePercent(pct)}
              </span>
              <span
                className="relative block h-2 w-16 overflow-hidden rounded-full bg-muted/60 sm:w-24"
                aria-hidden="true"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${pct ?? 0}%`,
                    backgroundColor: palette.series1,
                  }}
                />
              </span>
            </>
          );
          const className = cn(
            "grid w-full grid-cols-[minmax(0,1fr)_auto_3rem_auto] items-center gap-3 rounded-md px-1 py-1.5 text-left",
            row.clickable &&
              "transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          );
          return (
            <li key={row.key}>
              {row.clickable && onRowClick ? (
                <button type="button" onClick={() => onRowClick(row.key)} className={className}>
                  {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
