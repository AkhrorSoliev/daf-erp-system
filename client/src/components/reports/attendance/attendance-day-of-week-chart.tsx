"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceDayOfWeekPoint } from "./metric-helpers";

interface Props {
  data: AttendanceDayOfWeekPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: AttendanceDayOfWeekPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{point.day}</div>
      <div className="text-muted-foreground">
        Davomat:{" "}
        <span className="text-foreground font-semibold">{point.rate}%</span>
      </div>
    </div>
  );
}

function colorForRate(rate: number): string {
  if (rate >= 80) return "#22c55e"; // green-500
  if (rate >= 60) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

export function AttendanceDayOfWeekChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Ma&apos;lumot yo&apos;q
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e2e8f0"
          vertical={false}
        />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          width={48}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
        />
        <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.day} fill={colorForRate(d.rate)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
