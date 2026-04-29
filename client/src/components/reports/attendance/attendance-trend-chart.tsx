"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AttendanceTrendPoint } from "./metric-helpers";

interface Props {
  data: AttendanceTrendPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: AttendanceTrendPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">
        Davomat:{" "}
        <span className="text-foreground font-semibold">{point.rate}%</span>
      </div>
      <div className="text-muted-foreground">
        Yozuvlar:{" "}
        <span className="text-foreground">{point.total.toLocaleString("en-US")}</span>
      </div>
    </div>
  );
}

function computeDomain(values: number[]): [number, number] | undefined {
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    if (min === 0) return [0, 100];
    const pad = Math.abs(min) * 0.1 || 5;
    return [Math.max(0, min - pad), Math.min(100, max + pad)];
  }
  const range = max - min;
  const pad = range * 0.15;
  return [
    Math.max(0, Math.floor(min - pad)),
    Math.min(100, Math.ceil(max + pad)),
  ];
}

const COLOR = "#3b82f6"; // blue-500

export function AttendanceTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Tanlangan davrda davomat ma&apos;lumotlari yo&apos;q
      </div>
    );
  }

  const values = data.map((d) => d.rate);
  const domain = computeDomain(values);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="grad-attendance-rate" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLOR} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COLOR} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e2e8f0"
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
          angle={data.length > 8 ? -35 : 0}
          textAnchor={data.length > 8 ? "end" : "middle"}
          height={data.length > 8 ? 60 : 30}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          width={48}
          domain={domain}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
        />
        <Area
          type="monotone"
          dataKey="rate"
          stroke={COLOR}
          strokeWidth={2.5}
          fill="url(#grad-attendance-rate)"
          dot={{ r: 3, fill: COLOR, stroke: COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
