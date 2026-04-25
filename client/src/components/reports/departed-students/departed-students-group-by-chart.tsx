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
import { ChartCard } from "./chart-card";

export type GroupByDimension = "course" | "teacher" | "branch";

interface GroupByRow {
  id: string;
  name: string;
  total: number;
  segments: {
    reasonId: string | null;
    reasonName: string;
    count: number;
  }[];
}

interface GroupByResponse {
  data: GroupByRow[];
  uniqueTotal: number;
}

interface Props {
  branchId: number | null;
  courseId: string | null;
  teacherIds: number[];
  startDate: string;
  endDate: string;
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
// Intentionally small — stacked bars with more than ~4 segments become
// unreadable. Extra reasons collapse into "Boshqalar".
const TOP_N_REASONS = 3;
const OTHERS_BUCKET = "__others_bucket__";
const OTHERS_REASON = "__others_reason__";
const NULL_REASON = "__null__";

// Coordinated 3-color palette + neutral grey for "Boshqalar".
// Matches the product mockup: warm → cool progression for the top 3 reasons.
const PALETTE = [
  "#f59e0b", // amber-500 — primary / top reason
  "#8b5cf6", // violet-500 — second
  "#06b6d4", // cyan-500 — third
];
const OTHERS_COLOR = "#94a3b8"; // slate-400 — "Boshqalar"
const NULL_COLOR = "#cbd5e1"; // slate-300 — "Sababi ko'rsatilmagan"

export function DepartedStudentsGroupByChart({
  branchId,
  courseId,
  teacherIds,
  startDate,
  endDate,
  groupBy,
  onGroupByChange,
}: Props) {
  const [drilldownRow, setDrilldownRow] = useState<GroupByRow | null>(null);

  const params = {
    branchId: branchId ?? undefined,
    courseId: courseId ?? undefined,
    teacherIds: teacherIds.length > 0 ? teacherIds.join(",") : undefined,
    startDate,
    endDate,
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

  const {
    chartRows,
    reasonKeys,
    reasonLabels,
    reasonColors,
    rowByName,
  } = useMemo(() => {
    const rawRows = data?.data ?? [];

    // Collapse the long tail of buckets into an "Boshqalar" bucket.
    let displayRows: GroupByRow[];
    if (rawRows.length <= TOP_N_BUCKETS) {
      displayRows = rawRows;
    } else {
      const top = rawRows.slice(0, TOP_N_BUCKETS);
      const tail = rawRows.slice(TOP_N_BUCKETS);
      const merged = new Map<string, GroupByRow["segments"][number]>();
      for (const r of tail) {
        for (const s of r.segments) {
          const k = s.reasonId ?? NULL_REASON;
          const existing = merged.get(k);
          if (existing) existing.count += s.count;
          else merged.set(k, { ...s });
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

    // Rank reasons by overall frequency, keep top N, merge the rest.
    const reasonTotals = new Map<string, { name: string; count: number }>();
    for (const r of displayRows) {
      for (const s of r.segments) {
        const k = s.reasonId ?? NULL_REASON;
        const existing = reasonTotals.get(k);
        if (existing) existing.count += s.count;
        else reasonTotals.set(k, { name: s.reasonName, count: s.count });
      }
    }
    const sortedReasons = Array.from(reasonTotals.entries()).sort(
      (a, b) => b[1].count - a[1].count,
    );
    let keptReasons: [string, { name: string; count: number }][];
    if (sortedReasons.length <= TOP_N_REASONS) {
      keptReasons = sortedReasons;
    } else {
      const top = sortedReasons.slice(0, TOP_N_REASONS);
      const tail = sortedReasons.slice(TOP_N_REASONS);
      const othersCount = tail.reduce((s, [, v]) => s + v.count, 0);
      keptReasons = [
        ...top,
        [
          OTHERS_REASON,
          { name: `Boshqalar (${tail.length} ta sabab)`, count: othersCount },
        ],
      ];
    }
    const keptKeys = new Set(keptReasons.map(([k]) => k));

    // Pivot: one row per bucket, one numeric field per reason key.
    const rows = displayRows.map((r) => {
      const pivot: Record<string, number | string> = { name: r.name };
      for (const [k] of keptReasons) pivot[k] = 0;
      for (const s of r.segments) {
        const k = s.reasonId ?? NULL_REASON;
        if (keptKeys.has(k)) {
          pivot[k] = (pivot[k] as number) + s.count;
        } else {
          pivot[OTHERS_REASON] =
            ((pivot[OTHERS_REASON] as number) ?? 0) + s.count;
        }
      }
      pivot._total = r.total;
      return pivot;
    });

    const labels: Record<string, string> = {};
    const colors: Record<string, string> = {};
    keptReasons.forEach(([k, v], i) => {
      labels[k] = v.name;
      if (k === OTHERS_REASON) colors[k] = OTHERS_COLOR;
      else if (k === NULL_REASON) colors[k] = NULL_COLOR;
      else colors[k] = PALETTE[i % PALETTE.length];
    });

    const byName = new Map(displayRows.map((r) => [r.name, r]));

    return {
      chartRows: rows,
      reasonKeys: keptReasons.map(([k]) => k),
      reasonLabels: labels,
      reasonColors: colors,
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
        title="Sabablarni chuqur tahlil qilish"
        subtitle="Yo'nalishlar va sabablar bo'yicha taqsimot"
        tooltip={
          "Tanlangan kesim bo'yicha ketgan o'quvchilar, ichida ketish sabablari bo'yicha segmentlarga bo'lingan.\n" +
          `Eng ko'p ${TOP_N_BUCKETS} ta element alohida, qolganlari "Boshqalar"ga yig'ilgan.\n` +
          "Ustun ustiga bosing — shu kesimdagi sabab taqsimotini batafsil ko'rasiz."
        }
        isLoading={isLoading}
        isEmpty={isEmpty}
        emptyMessage="Tanlangan davrda ketganlar yo'q — davrni kengaytirib ko'ring"
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
                onClick={(e: any) => {
                  const name = e?.activePayload?.[0]?.payload?.name;
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
                    style: {
                      fontSize: 11,
                      fill: "#64748b", // slate-500 — matches muted-foreground in both themes
                    },
                  }}
                />
                <Tooltip
                  cursor={{ fill: "rgba(100, 116, 139, 0.12)" }}
                  content={(props) => (
                    <GroupByTooltip
                      {...props}
                      reasonLabels={reasonLabels}
                      reasonColors={reasonColors}
                    />
                  )}
                />
                <Legend
                  formatter={(v) => reasonLabels[String(v)] ?? String(v)}
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  iconType="circle"
                />
                {reasonKeys.map((key, i) => {
                  const isLast = i === reasonKeys.length - 1;
                  return (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="reasons"
                      fill={reasonColors[key]}
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
  reasonLabels,
  reasonColors,
}: {
  active?: boolean;
  payload?: ReadonlyArray<any>;
  label?: string | number;
  reasonLabels: Record<string, string>;
  reasonColors: Record<string, string>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const visible = payload.filter(
    (p) => typeof p.value === "number" && p.value > 0,
  );
  if (visible.length === 0) return null;
  const total = visible.reduce((sum, p) => sum + (p.value ?? 0), 0);

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
                style={{ backgroundColor: reasonColors[key] ?? p.color }}
              />
              <span className="text-muted-foreground truncate flex-1">
                {reasonLabels[key] ?? key}
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
            {groupByLabel} — sabab kesimida: jami {row?.total ?? 0} ta
          </DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-2">
            {row.segments.map((s) => {
              const percent = row.total > 0 ? (s.count / row.total) * 100 : 0;
              return (
                <div
                  key={s.reasonId ?? "null"}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                >
                  <span className="text-sm">{s.reasonName}</span>
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
