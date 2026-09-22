"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChartCard } from "@/components/shared/chart-card";

export type GroupByDimension = "course" | "teacher" | "branch";

interface GroupBySegment {
  status: string;
  label: string;
  count: number;
}

interface GroupByRow {
  id: string;
  name: string;
  total: number;
  segments: GroupBySegment[];
}

interface GroupByResponse {
  data: GroupByRow[];
  uniqueTotal: number;
}

interface Props {
  branchId: number | null;
  groupBy: GroupByDimension;
  onGroupByChange: (next: GroupByDimension) => void;
}

const TAB_LABELS: Record<GroupByDimension, string> = {
  course: "Kurs bo'yicha",
  teacher: "O'qituvchi bo'yicha",
  branch: "Filial bo'yicha",
};

const TAB_ORDER: GroupByDimension[] = ["course", "teacher", "branch"];

const TOP_N_BUCKETS = 10;
const OTHERS_BUCKET = "__others_bucket__";

// Fixed status colours — match the "Holat bo'yicha" chart for visual harmony.
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#f59e0b", // amber-500 — Faol (guruhsiz)
  FROZEN: "#06b6d4", // cyan-500 — Muzlatilgan
  EXPELLED: "#ef4444", // red-500 — Chetlatilgan
  INACTIVE: "#94a3b8", // slate-400 — Nofaol
};
const FALLBACK_COLOR = "#94a3b8";

export function DepartedStudentsGroupByChart({
  branchId,
  groupBy,
  onGroupByChange,
}: Props) {
  const [drilldownRow, setDrilldownRow] = useState<GroupByRow | null>(null);

  const params = {
    branchId: branchId ?? undefined,
    groupBy,
  };

  const { data, isLoading } = useQuery<GroupByResponse>({
    queryKey: ["departed-students-group-by", params],
    queryFn: () =>
      api
        .get<GroupByResponse>("/reports/departed-students/group-by", {
          params,
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const { chartRows, statusKeys, statusLabels, statusColors, rowByName } =
    useMemo(() => {
      const rawRows = data?.data ?? [];

      // Collapse the long tail of buckets into a "Boshqalar" bucket.
      let displayRows: GroupByRow[];
      if (rawRows.length <= TOP_N_BUCKETS) {
        displayRows = rawRows;
      } else {
        const top = rawRows.slice(0, TOP_N_BUCKETS);
        const tail = rawRows.slice(TOP_N_BUCKETS);
        const merged = new Map<string, GroupBySegment>();
        for (const r of tail) {
          for (const s of r.segments) {
            const existing = merged.get(s.status);
            if (existing) existing.count += s.count;
            else merged.set(s.status, { ...s });
          }
        }
        displayRows = [
          ...top,
          {
            id: OTHERS_BUCKET,
            name: `Boshqalar (${tail.length})`,
            total: tail.reduce((sum, r) => sum + r.total, 0),
            segments: Array.from(merged.values()),
          },
        ];
      }

      // Collect every status that appears, ordered by overall frequency.
      const statusTotals = new Map<string, { label: string; count: number }>();
      for (const r of displayRows) {
        for (const s of r.segments) {
          const existing = statusTotals.get(s.status);
          if (existing) existing.count += s.count;
          else statusTotals.set(s.status, { label: s.label, count: s.count });
        }
      }
      const sortedStatuses = Array.from(statusTotals.entries()).sort(
        (a, b) => b[1].count - a[1].count,
      );

      // Pivot: one row per bucket, one numeric field per status.
      const rows = displayRows.map((r) => {
        const pivot: Record<string, number | string> = { name: r.name };
        for (const [status] of sortedStatuses) pivot[status] = 0;
        for (const s of r.segments) {
          pivot[s.status] = ((pivot[s.status] as number) ?? 0) + s.count;
        }
        pivot._total = r.total;
        return pivot;
      });

      const labels: Record<string, string> = {};
      const colors: Record<string, string> = {};
      for (const [status, v] of sortedStatuses) {
        labels[status] = v.label;
        colors[status] = STATUS_COLOR[status] ?? FALLBACK_COLOR;
      }

      const byName = new Map(displayRows.map((r) => [r.name, r]));

      return {
        chartRows: rows,
        statusKeys: sortedStatuses.map(([k]) => k),
        statusLabels: labels,
        statusColors: colors,
        rowByName: byName,
      };
    }, [data]);

  const isEmpty = chartRows.length === 0;
  const chartHeight = 360;

  const headerAction = (
    <div className="flex gap-1.5 flex-wrap justify-end">
      {TAB_ORDER.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onGroupByChange(tab)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
            groupBy === tab
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <ChartCard
        title="Kesim bo'yicha tahlil"
        subtitle="Yo'nalishlar bo'yicha ketgan o'quvchilar, holat kesimida"
        tooltip={
          "Tanlangan kesim bo'yicha ketgan o'quvchilar, ichida holat (guruhsiz / muzlatilgan / chetlatilgan) bo'yicha segmentlarga bo'lingan.\n" +
          `Eng ko'p ${TOP_N_BUCKETS} ta element alohida, qolganlari "Boshqalar"ga yig'ilgan.\n` +
          "Ustun ustiga bosing — shu kesimdagi holat taqsimotini batafsil ko'rasiz."
        }
        isLoading={isLoading}
        isEmpty={isEmpty}
        emptyMessage="Hozircha ketgan o'quvchilar yo'q"
        headerAction={headerAction}
        bodyHeightClass={isEmpty || isLoading ? "h-[240px]" : ""}
      >
        {!isEmpty && !isLoading && groupBy === "teacher" && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground mb-2">
            Jami unique ketgan o&apos;quvchilar: {data?.uniqueTotal ?? 0} ta.
            Bir guruhda bir nechta ustoz bo&apos;lsa, bir o&apos;quvchi har bir
            ustozga taalluqli bo&apos;ladi — shu sababli ustozlar
            yig&apos;indisi umumiy sondan katta bo&apos;lishi mumkin.
          </div>
        )}
        {!isEmpty && !isLoading && (
          <div style={{ height: `${chartHeight}px` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                margin={{ top: 24, right: 8, bottom: 8, left: -8 }}
                onClick={(e: unknown) => {
                  const name = (
                    e as {
                      activePayload?: { payload?: { name?: string } }[];
                    }
                  )?.activePayload?.[0]?.payload?.name;
                  if (!name) return;
                  const row = rowByName.get(name);
                  if (row && row.id !== OTHERS_BUCKET) setDrilldownRow(row);
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  className="stroke-muted"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  tickFormatter={(v: string) =>
                    v.length > 14 ? v.slice(0, 13) + "…" : v
                  }
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                  width={36}
                  label={{
                    value: "Soni",
                    position: "insideTopLeft",
                    offset: -4,
                    style: { fontSize: 11, fill: "#64748b" },
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
                  content={(props) => (
                    <GroupByTooltip
                      {...props}
                      statusLabels={statusLabels}
                      statusColors={statusColors}
                    />
                  )}
                />
                <Legend
                  formatter={(v) => statusLabels[String(v)] ?? String(v)}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                />
                {statusKeys.map((key, i) => {
                  const isLast = i === statusKeys.length - 1;
                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="statuses"
                      fill={statusColors[key]}
                      name={key}
                      style={{ cursor: "pointer" }}
                      radius={isLast ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={72}
                    >
                      <LabelList
                        dataKey={key}
                        position="center"
                        formatter={(v: unknown) => {
                          const n = typeof v === "number" ? v : 0;
                          return n >= 3 ? String(n) : "";
                        }}
                        style={{
                          fill: "#fff",
                          fontSize: 12,
                          fontWeight: 600,
                          pointerEvents: "none",
                        }}
                      />
                      {isLast && (
                        <LabelList
                          dataKey="_total"
                          position="top"
                          formatter={(v: unknown) =>
                            typeof v === "number" ? String(v) : ""
                          }
                          style={{
                            fill: "currentColor",
                            fontSize: 12,
                            fontWeight: 600,
                            pointerEvents: "none",
                          }}
                        />
                      )}
                    </Bar>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      <GroupBySegmentsDialog
        row={drilldownRow}
        groupByLabel={TAB_LABELS[groupBy]}
        onClose={() => setDrilldownRow(null)}
      />
    </>
  );
}

function GroupByTooltip({
  active,
  payload,
  label,
  statusLabels,
  statusColors,
}: {
  active?: boolean;
  // Recharts injects its own loosely-typed payload here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: ReadonlyArray<any>;
  label?: string | number;
  statusLabels: Record<string, string>;
  statusColors: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const visible = payload
    .map((p) => ({
      ...p,
      value: typeof p.value === "number" ? p.value : 0,
    }))
    .filter((p) => p.value > 0);
  if (visible.length === 0) return null;
  const total = visible.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="rounded-md border bg-popover text-popover-foreground px-3 py-2 text-xs shadow-md min-w-[200px]">
      <div className="font-medium mb-1.5 border-b pb-1.5">{label}</div>
      <div className="space-y-1">
        {visible.map((p) => {
          const key = String(p.dataKey);
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: statusColors[key] ?? p.color }}
              />
              <span className="text-muted-foreground truncate flex-1">
                {statusLabels[key] ?? key}
              </span>
              <span className="font-medium tabular-nums shrink-0">
                {p.value} ta
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 pt-1.5 border-t flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Jami</span>
        <span className="font-semibold tabular-nums">{total} ta</span>
      </div>
    </div>
  );
}

function GroupBySegmentsDialog({
  row,
  groupByLabel,
  onClose,
}: {
  row: GroupByRow | null;
  groupByLabel: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row?.name ?? ""}</DialogTitle>
          <DialogDescription>
            {groupByLabel} — holat kesimida: jami {row?.total ?? 0} ta
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-2">
            {row.segments.map((s) => {
              const percent = row.total > 0 ? (s.count / row.total) * 100 : 0;
              return (
                <div
                  key={s.status}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span
                      className="size-3 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          STATUS_COLOR[s.status] ?? FALLBACK_COLOR,
                      }}
                    />
                    {s.label}
                  </span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {s.count} ta ({percent.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
