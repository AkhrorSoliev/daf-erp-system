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
import { ChartTooltip } from "./chart-tooltip";
import { useChartTheme } from "./use-chart-theme";
import type { ChartStudentFlowPoint } from "./dashboard-charts-types";

export function ChartStudentFlow({ data }: { data: ChartStudentFlowPoint[] }) {
  const { palette } = useChartTheme();
  const last = data[data.length - 1];

  // Ketganlar pastga chiziladi — «kelgan» va «ketgan» qarama-qarshi yo'nalish.
  const shaped = data.map((d) => ({ ...d, leftNeg: -d.left }));

  return (
    <ChartCard
      title="O'quvchilar oqimi"
      subtitle={
        last
          ? `Oxirgi oy: +${last.arrived} / −${last.left}, o'zgarish ${last.net > 0 ? "+" : ""}${last.net}`
          : undefined
      }
      tooltip={
        "Oxirgi 6 oy. Yuqoriga — qo'shilganlar, pastga — ketganlar (muzlatilgan, chetlatilgan, bitirgan, arxivlangan).\n\n" +
        "Chiziq — sof o'zgarish."
      }
      isEmpty={data.length === 0}
      emptyMessage="Bu davrda o'quvchi harakati yo'q"
      headerAction={
        <Link
          href="/reports/departed-students"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Batafsil
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
            <YAxis
              tick={{ fontSize: 11, fill: palette.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => String(Math.abs(v))}
              width={38}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: palette.grid }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
              iconSize={8}
            />
            <Bar
              dataKey="arrived"
              name="Qo'shildi"
              fill={palette.series1}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
            <Bar
              dataKey="leftNeg"
              name="Ketdi"
              fill={palette.series2}
              radius={[0, 0, 4, 4]}
              maxBarSize={22}
            />
            <Line
              type="monotone"
              dataKey="net"
              name="Sof o'zgarish"
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
