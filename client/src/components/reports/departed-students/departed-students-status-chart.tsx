"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import api from "@/lib/api";
import { ChartCard } from "@/components/shared/chart-card";

interface StatusResponse {
  data: { status: string; label: string; count: number }[];
  total: number;
}

interface Props {
  branchId: number | null;
}

// Status → literal hex (SVG-safe). ACTIVE here means "active but ungrouped".
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#f59e0b", // amber-500 — Faol (guruhsiz)
  FROZEN: "#06b6d4", // cyan-500 — Muzlatilgan
  EXPELLED: "#ef4444", // red-500 — Chetlatilgan
  INACTIVE: "#94a3b8", // slate-400 — Nofaol
};
const FALLBACK_COLOR = "#94a3b8";

export function DepartedStudentsByStatusChart({ branchId }: Props) {
  const params = { branchId: branchId ?? undefined };

  const { data, isLoading } = useQuery<StatusResponse>({
    queryKey: ["departed-students-by-status", params],
    queryFn: () =>
      api
        .get<StatusResponse>("/reports/departed-students/by-status", { params })
        .then((r) => r.data),
    staleTime: 0,
  });

  const { rows, total } = useMemo(() => {
    const all = (data?.data ?? []).map((r) => ({
      ...r,
      color: STATUS_COLOR[r.status] ?? FALLBACK_COLOR,
    }));
    return { rows: all, total: data?.total ?? 0 };
  }, [data]);

  const isEmpty = rows.length === 0;
  const topLabel = rows[0]?.label ?? "";
  const topCount = rows[0]?.count ?? 0;

  return (
    <ChartCard
      title="Holat bo'yicha"
      subtitle={
        total > 0
          ? `Jami ${total} ta${topLabel ? ` — eng ko'p: ${topLabel} (${topCount} ta)` : ""}`
          : "Holat taqsimoti"
      }
      tooltip={
        "Ketgan o'quvchilar holati bo'yicha taqsimot: guruhsiz qolgan faollar, " +
        "muzlatilganlar va chetlashtirilganlar.\n" +
        "Filial filtriga bo'ysunadi."
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="Hozircha ketgan o'quvchilar yo'q"
      bodyHeightClass="h-[260px]"
    >
      {!isEmpty && !isLoading && (
        <div className="flex h-full items-center gap-4">
          <div className="relative h-full w-[200px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={96}
                  paddingAngle={1}
                  strokeWidth={2}
                  stroke="hsl(var(--card))"
                >
                  {rows.map((r) => (
                    <Cell key={r.status} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip content={<StatusTooltip total={total} />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-2xl font-bold tabular-nums leading-none">
                {total}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
                Jami
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            {rows.map((r) => {
              const percent = total > 0 ? (r.count / total) * 100 : 0;
              return (
                <div
                  key={r.status}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <span
                    className="size-3 rounded-sm shrink-0"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="text-xs flex-1 truncate" title={r.label}>
                    {r.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums shrink-0">
                    {r.count}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                    {percent.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function StatusTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: { label?: string; count?: number; color?: string } }>;
  total: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const percent = total > 0 ? ((row.count ?? 0) / total) * 100 : 0;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md min-w-[180px]">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="size-2.5 rounded-full shrink-0"
          style={{ backgroundColor: row.color }}
        />
        <span className="font-medium truncate">{row.label}</span>
      </div>
      <div className="flex items-center justify-between gap-4 pl-4">
        <span className="text-muted-foreground">Soni</span>
        <span className="font-semibold tabular-nums">{row.count} ta</span>
      </div>
      <div className="flex items-center justify-between gap-4 pl-4">
        <span className="text-muted-foreground">Ulush</span>
        <span className="font-semibold tabular-nums">
          {percent.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
