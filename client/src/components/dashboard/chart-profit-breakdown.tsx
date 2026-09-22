"use client";

import Link from "next/link";
import { ChartCard } from "@/components/shared/chart-card";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { breakdownRows } from "./chart-breakdown-rows";
import { useChartTheme } from "./use-chart-theme";
import type { ChartProfitBreakdown } from "./dashboard-charts-types";

/**
 * «Pul qayerga ketdi» — recharts EMAS, HTML bar-ro'yxat.
 *
 * CLAUDE.md uzun o'zbekcha nomli tartiblangan taqsimotlar uchun shuni talab
 * qiladi: nom kesilmaydi, summa va foiz yonma-yon o'qiladi, bosish esa
 * oddiy `onClick`.
 */
export function ChartProfitBreakdownCard({
  data,
}: {
  data: ChartProfitBreakdown;
}) {
  const { palette } = useChartTheme();
  const rows = breakdownRows(data);
  const max = Math.max(...rows.map((r) => Math.abs(r.amount)), 1);

  return (
    <ChartCard
      title="Pul qayerga ketdi"
      subtitle={`Bu oy tushum: ${formatNumber(data.revenue)} so'm`}
      tooltip={
        "Tushumdan ustoz va xodim oyligi, operatsion xarajat va qaytarishlar ayirilgach qolgani — sof foyda.\n\n" +
        "Bu «Sof foyda» kartasi bilan bitta manbadan keladi, shuning uchun raqamlar har doim mos tushadi."
      }
      isEmpty={rows.length === 0}
      emptyMessage="Bu oyda hali harakat yo'q"
      headerAction={
        <Link
          href="/payments/expenses"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Xarajatlar
        </Link>
      }
    >
      <div className="space-y-2.5">
        {rows.map((r) => {
          const width = Math.max((Math.abs(r.amount) / max) * 100, 2);
          const negative = r.amount < 0;
          return (
            <div key={r.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate">{r.label}</span>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    negative && "text-red-600 dark:text-red-400",
                  )}
                >
                  {formatNumber(r.amount)}
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {r.pct}%
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    backgroundColor:
                      r.kind === "profit"
                        ? negative
                          ? palette.series2
                          : palette.series3
                        : palette.series1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
