"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
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
          <span>Saqlanish</span>
        </div>
        <span className="text-foreground font-semibold tabular-nums">
          {point.retentionPct === null ? "—" : `${point.retentionPct}%`}
        </span>
      </div>
      <div className="mt-1 pt-1 border-t flex items-center justify-between gap-3 text-muted-foreground">
        <span>Yozuvlar</span>
        <span className="text-foreground tabular-nums">
          {point.total.toLocaleString("en-US")}
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

  // With a single bucket (e.g. one month picked + monthly bucket), there is
  // only one data point — recharts can't draw a line between zero points.
  // Show the value as a stat and hint at how to see a trend.
  if (data.length === 1) {
    const point = data[0];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="text-xs text-muted-foreground">{point.label}</div>
        <div className="flex items-end gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Davomat
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: ATT_COLOR }}
            >
              {point.rate}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Saqlanish
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: RETENTION_COLOR }}
            >
              {point.retentionPct === null ? "—" : `${point.retentionPct}%`}
            </div>
          </div>
        </div>
        <p className="max-w-[420px] text-xs text-muted-foreground">
          Trend chizig&apos;ini ko&apos;rish uchun davrni kengaytiring yoki{" "}
          <span className="font-medium">Haftalik</span> kesimga o&apos;ting.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
        <Legend
          verticalAlign="top"
          height={28}
          iconType="square"
          wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
        />
        <Area
          type="monotone"
          name="Davomat"
          dataKey="rate"
          stroke={ATT_COLOR}
          strokeWidth={2.5}
          fill="url(#grad-attendance-rate)"
          dot={{ r: 3, fill: ATT_COLOR, stroke: ATT_COLOR, strokeWidth: 0 }}
          activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          name="Saqlanish"
          dataKey="retentionPct"
          stroke={RETENTION_COLOR}
          strokeWidth={2}
          strokeDasharray="4 3"
          fill="url(#grad-retention-rate)"
          dot={{
            r: 2.5,
            fill: RETENTION_COLOR,
            stroke: RETENTION_COLOR,
            strokeWidth: 0,
          }}
          activeDot={{ r: 4.5, stroke: "white", strokeWidth: 2 }}
          connectNulls={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
