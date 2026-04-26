"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBalance } from "@/lib/format-utils";
import {
  type CenterActivityTrendPoint,
  formatHours,
  formatPctValue,
} from "./metric-helpers";

interface Props {
  data: CenterActivityTrendPoint[];
  metric: keyof CenterActivityTrendPoint;
  color: string;
  type: "line" | "bar";
  compact?: boolean;
}

const METRIC_LABEL: Record<string, string> = {
  utilizationPct: "Foydalanish",
  emptyHours: "Bo'sh vaqt",
  activeStudents: "O'quvchilar",
  emptySeats: "Bo'sh o'rin",
  extraStudentsCapacity: "Qo'shimcha",
};

function formatValue(metric: string, value: number): string {
  switch (metric) {
    case "utilizationPct":
      return formatPctValue(value);
    case "emptyHours":
      return formatHours(value);
    case "potentialExtraRevenue":
      return formatBalance(value);
    default:
      return value.toLocaleString("en-US");
  }
}

function formatAxisValue(metric: string, value: number): string {
  switch (metric) {
    case "utilizationPct":
      return `${value}%`;
    case "emptyHours":
      return value.toLocaleString("en-US");
    default:
      return value.toLocaleString("en-US");
  }
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  metric: string;
}

function CustomTooltip({
  active,
  payload,
  label,
  metric,
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      <div className="text-muted-foreground">
        {METRIC_LABEL[metric] ?? metric}:{" "}
        <span className="text-foreground font-semibold">
          {formatValue(metric, value)}
        </span>
      </div>
    </div>
  );
}

/**
 * Y-axis domain that adds 10% padding around min/max so flat-ish series
 * still show visible variation. For zero-only data, falls back to [0, 1].
 */
function computeDomain(
  data: CenterActivityTrendPoint[],
  metric: keyof CenterActivityTrendPoint,
): [number, number] | undefined {
  const values = data
    .map((d) => d[metric])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return undefined;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.1 || 1;
    return [Math.max(0, min - pad), max + pad];
  }
  const range = max - min;
  const pad = range * 0.15;
  return [Math.max(0, Math.floor(min - pad)), Math.ceil(max + pad)];
}

export function CenterActivityTrendChart({
  data,
  metric,
  color,
  type,
  compact = false,
}: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Ma&apos;lumot yo&apos;q
      </div>
    );
  }

  const tooltipNode = (
    <Tooltip
      content={(props: unknown) => (
        <CustomTooltip
          {...(props as Omit<CustomTooltipProps, "metric">)}
          metric={metric}
        />
      )}
      cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
    />
  );

  const xAxis = !compact ? (
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
  ) : null;

  const domain = computeDomain(data, metric);

  const yAxis = !compact ? (
    <YAxis
      tick={{ fontSize: 11, fill: "#64748b" }}
      tickLine={false}
      axisLine={{ stroke: "#e2e8f0" }}
      width={48}
      domain={domain}
      tickFormatter={(v) => formatAxisValue(metric, v as number)}
    />
  ) : null;

  const gradientId = `grad-${metric}`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      {type === "line" ? (
        <AreaChart
          data={data}
          margin={{
            top: compact ? 4 : 8,
            right: compact ? 4 : 12,
            left: compact ? 0 : 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {!compact && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              vertical={false}
            />
          )}
          {xAxis}
          {yAxis}
          {tooltipNode}
          <Area
            type="monotone"
            dataKey={metric}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={
              compact
                ? false
                : { r: 3, fill: color, stroke: color, strokeWidth: 0 }
            }
            activeDot={{ r: 5, stroke: "white", strokeWidth: 2 }}
          />
        </AreaChart>
      ) : (
        <BarChart
          data={data}
          margin={{
            top: compact ? 4 : 8,
            right: compact ? 4 : 12,
            left: compact ? 0 : 0,
            bottom: 0,
          }}
        >
          {!compact && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e2e8f0"
              vertical={false}
            />
          )}
          {xAxis}
          {yAxis}
          {tooltipNode}
          <Bar dataKey={metric} fill={color} radius={[4, 4, 0, 0]} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
