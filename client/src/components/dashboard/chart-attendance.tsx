"use client";

import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/shared/chart-card";
import { ChartTooltip } from "./chart-tooltip";
import { useChartTheme } from "./use-chart-theme";
import type { ChartAttendancePoint } from "./dashboard-charts-types";

export function ChartAttendance({ data }: { data: ChartAttendancePoint[] }) {
  const { palette } = useChartTheme();
  const last = data[data.length - 1];

  return (
    <ChartCard
      title="Davomat"
      subtitle={
        last ? `Oxirgi hafta: ${last.rate}%` : undefined
      }
      tooltip="Oxirgi 12 hafta. Kelgan va kech kelganlarning belgilangan davomatlarga nisbati."
      isEmpty={data.length === 0}
      emptyMessage="Bu davrda davomat belgilanmagan"
      headerAction={
        <Link
          href="/reports/attendance"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Batafsil
        </Link>
      }
    >
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={palette.grid} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: palette.axis }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            {/* Domen ma'lumotdan kelib chiqadi, 0 dan emas: davomat 85–95
                oralig'ida yuradi, 0 dan boshlansa chiziq tekis ko'rinardi. */}
            <YAxis
              domain={["dataMin - 5", "dataMax + 5"]}
              tick={{ fontSize: 11, fill: palette.axis }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `${v}%`}
              width={42}
            />
            <Tooltip content={<ChartTooltip suffix="%" keepZeros />} />
            {/* Bitta seriya — legenda kerak emas, sarlavha uni nomlaydi. */}
            <Line
              type="monotone"
              dataKey="rate"
              name="Davomat"
              stroke={palette.series1}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0, fill: palette.series1 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
