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
import { useT } from "@/i18n/context";
import { formatNumber } from "@/lib/format-utils";
import { chartMonthLabel } from "./chart-months";
import { ChartTooltip } from "./chart-tooltip";
import { useChartTheme } from "./use-chart-theme";
import type { ChartTrendPoint } from "./dashboard-charts-types";

/** Millionlarda qisqartirish — o'qda 128 450 000 emas, «128 mln». */
function shortSom(v: number, t: (source: string) => string): string {
  if (Math.abs(v) >= 1_000_000) return `${Math.round(v / 1_000_000)} ${t("mln")}`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} ${t("ming")}`;
  return String(v);
}

export function ChartMoneyTrend({ data }: { data: ChartTrendPoint[] }) {
  const t = useT();
  const { palette } = useChartTheme();
  const last = data[data.length - 1];
  const shaped = data.map((d) => ({ ...d, month: chartMonthLabel(d.month, t) }));

  return (
    <ChartCard
      title={t("Moliya trendi")}
      subtitle={
        last
          ? t("Oxirgi oy: kassaga {income}, sof foyda {profit} so'm", {
              income: formatNumber(last.income),
              profit: formatNumber(last.profit),
            })
          : undefined
      }
      tooltip={t(
        "Oxirgi 6 oy.\n\nUstunlar — KASSA harakati: haqiqatan kirgan va chiqqan pul.\n\nChiziq — sof foyda, u o'tilgan DARSLAR bo'yicha hisoblanadi va « Sof foyda » kartasi bilan bitta manbadan keladi.\n\nIkkalasi turli o'lchov: chiziq ustunlar ayirmasiga TENG EMAS va undan yuqori ham bo'lishi mumkin — masalan o'quvchi oldindan to'lagan oyda kassa to'ladi, dars esa keyingi oyda o'tiladi.",
      )}
      isEmpty={data.length === 0}
      emptyMessage={t("Bu davrda moliyaviy harakat yo'q")}
      headerAction={
        <Link
          href="/payments/overview"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("Batafsil")}
        </Link>
      }
    >
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={shaped} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
              tickFormatter={(v: number) => shortSom(v, t)}
              width={54}
            />
            <Tooltip
              content={<ChartTooltip suffix={t("so'm")} />}
              cursor={{ fill: palette.grid }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="income"
              name={t("Kassa tushumi")}
              fill={palette.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Bar
              dataKey="expenses"
              name={t("Kassa xarajati")}
              fill={palette.series2}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Line
              type="monotone"
              dataKey="profit"
              name={t("Sof foyda")}
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
