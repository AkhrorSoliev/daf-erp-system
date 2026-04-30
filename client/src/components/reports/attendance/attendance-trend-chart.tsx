"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatChangePct } from "./metric-helpers";
import type { AttendanceTrendPoint } from "./metric-helpers";

type ChartPoint = AttendanceTrendPoint & { changePct: number | null };

interface Props {
  data: AttendanceTrendPoint[];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: AttendanceTrendPoint;
    dataKey: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md min-w-[160px]">
      <div className="font-medium mb-1">{label}</div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: ATT_COLOR }}
          />
          <span>Davomat</span>
        </div>
        <span className="text-foreground font-semibold tabular-nums">
          {point.rate}%
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span
            className="size-2 rounded-sm"
            style={{ backgroundColor: RETENTION_COLOR }}
          />
          <span>O&apos;zgarish</span>
        </div>
        <span className="text-foreground font-semibold tabular-nums">
          {formatChangePct(point.retentionPct)}
        </span>
      </div>
      <div className="mt-1 pt-1 border-t flex items-center justify-between gap-3 text-muted-foreground">
        <span>Yozuvlar</span>
        <span className="text-foreground tabular-nums">
          {point.total.toLocaleString("uz-UZ")}
        </span>
      </div>
    </div>
  );
}

const ATT_COLOR = "#3b82f6"; // blue-500
const RETENTION_COLOR = "#ef4444"; // red-500

export function AttendanceTrendChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Tanlangan davrda davomat ma&apos;lumotlari yo&apos;q
      </div>
    );
  }

  // With a single bucket (e.g. one month picked + monthly bucket), recharts
  // can't draw a line between zero points. The dot still renders, so add a
  // small banner above the chart explaining how to see a trend instead of
  // replacing the chart entirely.
  const isSinglePoint = data.length === 1;

  // Augment each point with a 0-baseline change %, so the red line shows
  // "+45% / -20%" instead of "145% / 80%". Right-side Y axis auto-scales
  // around 0 with a reference line at 0 to anchor the eye.
  const chartData: ChartPoint[] = data.map((d) => ({
    ...d,
    changePct: d.retentionPct === null ? null : d.retentionPct - 100,
  }));

  return (
    <div className="flex h-full flex-col">
      {isSinglePoint && (
        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          Tanlangan davrda atigi 1 ta {data[0].label} bor. Trend chiziqlarini
          ko&apos;rish uchun davrni kengaytiring yoki{" "}
          <span className="font-semibold">Haftalik</span> kesimga o&apos;ting.
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 56, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="grad-attendance-rate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ATT_COLOR} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ATT_COLOR} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="grad-retention-rate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={RETENTION_COLOR} stopOpacity={0.25} />
              <stop offset="100%" stopColor={RETENTION_COLOR} stopOpacity={0.02} />
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
            yAxisId="rate"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            width={48}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            yAxisId="change"
            orientation="right"
            tick={{ fontSize: 11, fill: RETENTION_COLOR }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            width={48}
            tickFormatter={(v) => {
              const n = v as number;
              if (n === 0) return "0%";
              return n > 0 ? `+${n}%` : `${n}%`;
            }}
          />
          <ReferenceLine
            yAxisId="change"
            y={0}
            stroke={RETENTION_COLOR}
            strokeOpacity={0.35}
            strokeDasharray="2 4"
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
          />
          <Legend
            verticalAlign="top"
            height={28}
            iconType="square"
            wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
          />
          <Area
            yAxisId="rate"
            type="monotone"
            name="Davomat"
            dataKey="rate"
            stroke={ATT_COLOR}
            strokeWidth={2.5}
            fill="url(#grad-attendance-rate)"
            dot={{
              r: isSinglePoint ? 6 : 3,
              fill: ATT_COLOR,
              stroke: ATT_COLOR,
              strokeWidth: 0,
            }}
            activeDot={{ r: 6, stroke: "white", strokeWidth: 2 }}
          />
          <Area
            yAxisId="change"
            type="monotone"
            name="O'zgarish"
            dataKey="changePct"
            stroke={RETENTION_COLOR}
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="url(#grad-retention-rate)"
            dot={{
              r: isSinglePoint ? 5 : 2.5,
              fill: RETENTION_COLOR,
              stroke: RETENTION_COLOR,
              strokeWidth: 0,
            }}
            activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
