"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type AttendanceStatusBreakdown as Breakdown,
} from "./metric-helpers";

interface Props {
  data: Breakdown | undefined;
}

interface Slice {
  key: keyof typeof STATUS_LABELS;
  name: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Slice & { total: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const slice = payload[0].payload;
  const pct = slice.total > 0 ? Math.round((slice.value / slice.total) * 100) : 0;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{slice.name}</div>
      <div className="text-muted-foreground">
        Soni:{" "}
        <span className="text-foreground font-semibold">
          {slice.value.toLocaleString("en-US")}
        </span>
      </div>
      <div className="text-muted-foreground">
        Ulush: <span className="text-foreground">{pct}%</span>
      </div>
    </div>
  );
}

export function AttendanceStatusBreakdown({ data }: Props) {
  if (!data || data.total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Ma&apos;lumot yo&apos;q
      </div>
    );
  }

  const allSlices: Array<Slice & { total: number }> = [
    {
      key: "present",
      name: STATUS_LABELS.present,
      value: data.present,
      color: STATUS_COLORS.present,
      total: data.total,
    },
    {
      key: "late",
      name: STATUS_LABELS.late,
      value: data.late,
      color: STATUS_COLORS.late,
      total: data.total,
    },
    {
      key: "absent",
      name: STATUS_LABELS.absent,
      value: data.absent,
      color: STATUS_COLORS.absent,
      total: data.total,
    },
    {
      key: "excused",
      name: STATUS_LABELS.excused,
      value: data.excused,
      color: STATUS_COLORS.excused,
      total: data.total,
    },
  ];
  const slices = allSlices.filter((s) => s.value > 0);

  return (
    <div className="flex h-full items-center gap-4">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<CustomTooltip />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={1}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex-1 space-y-1.5 text-xs">
        {slices.map((s) => {
          const pct = Math.round((s.value / data.total) * 100);
          return (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-muted-foreground">{s.name}</span>
              </div>
              <span className="tabular-nums font-medium">
                {s.value.toLocaleString("en-US")}{" "}
                <span className="text-muted-foreground font-normal">
                  ({pct}%)
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
