"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { ChartCard } from "@/components/shared/chart-card";

interface DynamicsPoint {
  date: string;
  count: number;
  /** The month reaches into the grace period; its departures may still grow. */
  provisional: boolean;
}

interface DynamicsResponse {
  data: DynamicsPoint[];
}

interface Props {
  branchId: number | null;
  startDate: string;
  endDate: string;
}

const BAR_COLOR = "#ef4444"; // red-500 — literal so SVG renders reliably
const BAR_COLOR_HOVER = "#dc2626"; // red-600

export function DepartedStudentsDynamicsChart({
  branchId,
  startDate,
  endDate,
}: Props) {
  const params = { branchId: branchId ?? undefined, startDate, endDate };

  const { data, isLoading } = useQuery<DynamicsResponse>({
    queryKey: ["departed-students-dynamics", params],
    queryFn: () =>
      api
        .get<DynamicsResponse>("/reports/departed-students/dynamics", {
          params,
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const { chartData, total, peakLabel, peakCount } = useMemo(() => {
    const rows = (data?.data ?? []).map((d) => {
      const parsed = new Date(d.date + "T00:00:00");
      return {
        ...d,
        label: format(parsed, "MM.yyyy"),
        fullLabel: format(parsed, "MMMM yyyy"),
      };
    });
    const t = rows.reduce((s, r) => s + r.count, 0);
    let peak = { label: "", count: 0 };
    for (const r of rows) {
      if (r.count > peak.count) peak = { label: r.fullLabel, count: r.count };
    }
    return {
      chartData: rows,
      total: t,
      peakLabel: peak.label,
      peakCount: peak.count,
    };
  }, [data]);

  const isEmpty =
    chartData.length === 0 || chartData.every((d) => d.count === 0);

  return (
    <ChartCard
      title="Ketish dinamikasi"
      subtitle={`Oylik kesim${total > 0 ? ` — jami ${total} ta` : ""}${
        peakCount > 0 ? `, eng yuqori: ${peakLabel} (${peakCount} ta)` : ""
      }`}
      tooltip={
        "Har oyda nechta o'quvchi ketgani — to'xtagan oyi bo'yicha.\n" +
        "Oxirgi kunlarga tushgan oy dastlabki: u yerdagi to'xtashlar hali tasdiqlanmagan.\n" +
        "Tanlangan davr va filialga bo'ysunadi."
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="Tanlangan davrda ketganlar yo'q — davrni kengaytirib ko'ring"
      bodyHeightClass="h-[260px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="#e2e8f0"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={{ stroke: "#e2e8f0" }}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: "rgba(239, 68, 68, 0.08)" }}
            content={(props) => <DynamicsTooltip {...props} />}
          />
          <Bar
            dataKey="count"
            fill={BAR_COLOR}
            radius={[4, 4, 0, 0]}
            activeBar={{ fill: BAR_COLOR_HOVER }}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function DynamicsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  // Recharts injects its own loosely-typed payload here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as
    { count?: number; fullLabel?: string; provisional?: boolean } | undefined;
  if (!row) return null;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md min-w-[180px]">
      <div className="text-muted-foreground mb-1">Oy: {row.fullLabel}</div>
      <div className="flex items-center gap-2">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: BAR_COLOR }}
        />
        <span className="flex-1">Ketganlar</span>
        <span className="font-semibold tabular-nums">{row.count ?? 0} ta</span>
      </div>
      {row.provisional && (
        <div className="mt-1 text-muted-foreground">
          Dastlabki — oxirgi kunlardagi to&apos;xtashlar hali tasdiqlanmagan
        </div>
      )}
    </div>
  );
}
