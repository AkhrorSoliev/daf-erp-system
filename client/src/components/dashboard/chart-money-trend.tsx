"use client";

import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { formatNumber } from "@/lib/format-utils";
import { ChartTooltip } from "./chart-tooltip";
import { useChartTheme } from "./use-chart-theme";
import type { ChartTrendPoint } from "./dashboard-charts-types";

/** Millionlarda qisqartirish — o'qda 128 450 000 emas, «128 mln». */
function shortSom(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${Math.round(v / 1_000_000)} mln`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} ming`;
  return String(v);
}

export function ChartMoneyTrend({ data }: { data: ChartTrendPoint[] }) {
  const { palette } = useChartTheme();
  const last = data[data.length - 1];

  return (
    <ChartCard
      title="Moliya trendi"
      subtitle={
        last
          ? `Oxirgi oy: tushum ${formatNumber(last.income)}, sof foyda ${formatNumber(last.profit)} so'm`
          : undefined
      }
      tooltip={
        "Oxirgi 6 oy. Ustunlar — kassa tushumi va xarajat, chiziq — kanonik sof foyda.\n\n" +
        "Sof foyda «Sof foyda» kartasi bilan bitta manbadan keladi."
      }
      isEmpty={data.length === 0}
      emptyMessage="Bu davrda moliyaviy harakat yo'q"
      headerAction={
        <Link
          href="/payments/overview"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Batafsil
        </Link>
      }
    >
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: palette.axis }}
              tickLine={false}
              axisLine={false}
            />
            {/* BITTA o'q: uchala seriya ham so'mda, ikki o'q taqiqlangan. */}
            <YAxis
              tick={{ fontSize: 11, fill: palette.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={shortSom}
              width={54}
            />
            <Tooltip
              content={<ChartTooltip suffix="so'm" />}
              cursor={{ fill: palette.grid }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="income"
              name="Tushum"
              fill={palette.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Bar
              dataKey="expenses"
              name="Xarajat"
              fill={palette.series2}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Line
              type="monotone"
              dataKey="profit"
              name="Sof foyda"
              stroke={palette.series3}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: palette.series3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
