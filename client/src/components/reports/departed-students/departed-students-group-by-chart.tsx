"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChartCard } from "./chart-card";

export type GroupByDimension =
  | "course"
  | "teacher"
  | "branch"
  | "status"
  | "reason";

const IMPLEMENTED_DIMENSIONS: ReadonlyArray<GroupByDimension> = [
  "course",
  "teacher",
  "branch",
];

interface GroupByResponse {
  data: {
    id: string;
    name: string;
    total: number;
    segments: {
      reasonId: string | null;
      reasonName: string;
      count: number;
    }[];
  }[];
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

const NULL_REASON_KEY = "__null__";
const NULL_REASON_COLOR = "hsl(var(--muted-foreground) / 0.5)";

// Build a stable color from a reason id (palette rotation).
function reasonColor(reasonId: string | null, index: number): string {
  if (reasonId === null) return NULL_REASON_COLOR;
  // 12 well-separated hues across the palette.
  const palette = [
    "#ef4444", // red
    "#f97316", // orange
    "#eab308", // yellow
    "#22c55e", // green
    "#10b981", // emerald
    "#14b8a6", // teal
    "#06b6d4", // cyan
    "#3b82f6", // blue
    "#6366f1", // indigo
    "#8b5cf6", // violet
    "#d946ef", // fuchsia
    "#ec4899", // pink
  ];
  return palette[index % palette.length];
}

const DIMENSION_LABEL: Record<GroupByDimension, string> = {
  course: "Kurs bo'yicha",
  teacher: "O'qituvchi bo'yicha",
  branch: "Filial bo'yicha",
  status: "Status bo'yicha",
  reason: "Sabab bo'yicha",
};

export function DepartedStudentsGroupByChart({
  branchId,
  courseId,
  teacherIds,
  startDate,
  endDate,
  groupBy,
  onGroupByChange,
}: Props) {
  const params = {
    branchId: branchId ?? undefined,
    courseId: courseId ?? undefined,
    teacherIds: teacherIds.length > 0 ? teacherIds.join(",") : undefined,
    startDate,
    endDate,
    groupBy,
  };

  const isPlaceholder = !IMPLEMENTED_DIMENSIONS.includes(groupBy);

  const { data, isLoading } = useQuery<GroupByResponse>({
    queryKey: ["departed-students-group-by", params],
    queryFn: () =>
      api
        .get<GroupByResponse>("/reports/departed-students/group-by", {
          params,
        })
        .then((r) => r.data),
    staleTime: 0,
    enabled: !isPlaceholder,
  });

  // Build the unique set of reason segments across all groups + flattened rows
  // in the shape recharts expects for a stacked chart.
  const { chartRows, reasonKeys, reasonLabels } = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    const reasonSet = new Map<string, string>(); // key -> label

    for (const group of data?.data ?? []) {
      const row: Record<string, number | string> = {
        name: group.name,
      };
      for (const seg of group.segments) {
        const key = seg.reasonId ?? NULL_REASON_KEY;
        row[key] = seg.count;
        if (!reasonSet.has(key)) {
          reasonSet.set(key, seg.reasonName);
        }
      }
      rows.push(row);
    }

    // Order reasons by overall frequency desc for a stable legend.
    const overall = new Map<string, number>();
    for (const group of data?.data ?? []) {
      for (const seg of group.segments) {
        const key = seg.reasonId ?? NULL_REASON_KEY;
        overall.set(key, (overall.get(key) ?? 0) + seg.count);
      }
    }
    const keys = Array.from(reasonSet.keys()).sort(
      (a, b) => (overall.get(b) ?? 0) - (overall.get(a) ?? 0),
    );
    const labels: Record<string, string> = {};
    for (const k of keys) labels[k] = reasonSet.get(k) ?? k;
    return { chartRows: rows, reasonKeys: keys, reasonLabels: labels };
  }, [data]);

  const isEmpty = chartRows.length === 0;
  const height = isEmpty ? 240 : Math.max(260, chartRows.length * 42 + 60);

  const headerAction = (
    <Select
      value={groupBy}
      onValueChange={(v) => onGroupByChange(v as GroupByDimension)}
    >
      <SelectTrigger className="h-8 w-auto min-w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="course">{DIMENSION_LABEL.course}</SelectItem>
        <SelectItem value="teacher">{DIMENSION_LABEL.teacher}</SelectItem>
        <SelectItem value="branch">{DIMENSION_LABEL.branch}</SelectItem>
        <SelectItem value="status">{DIMENSION_LABEL.status}</SelectItem>
        <SelectItem value="reason">{DIMENSION_LABEL.reason}</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <ChartCard
      title="Deep tahlil"
      tooltip={
        "Tanlangan o'lcham bo'yicha ketgan o'quvchilar.\n" +
        "Har bir ustun ichida sabablar rangli segmentlarga ajratilgan. Sahifa filtriga bo'ysunadi."
      }
      isLoading={!isPlaceholder && isLoading}
      isEmpty={!isPlaceholder && isEmpty}
      emptyMessage="Tanlangan davrda ketganlar yo'q"
      headerAction={headerAction}
      bodyHeightClass={
        isPlaceholder || isEmpty || isLoading ? "h-[240px]" : ""
      }
    >
      {isPlaceholder && (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium">
            {DIMENSION_LABEL[groupBy]} — tez orada tayyor bo&apos;ladi
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Ushbu o&apos;lcham bo&apos;yicha tahlil keyingi bosqichda qo&apos;shiladi
          </p>
        </div>
      )}
      {!isPlaceholder && !isEmpty && !isLoading && (
        <div style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              layout="vertical"
              margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                horizontal={false}
                className="stroke-muted"
              />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 12 }}
                width={160}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value, name) => [
                  `${value} ta`,
                  reasonLabels[String(name)] ?? String(name),
                ]}
              />
              <Legend
                formatter={(value) => reasonLabels[value] ?? value}
                wrapperStyle={{ fontSize: "12px" }}
              />
              {reasonKeys.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="reasons"
                  fill={reasonColor(key === NULL_REASON_KEY ? null : key, i)}
                  radius={i === reasonKeys.length - 1 ? [0, 4, 4, 0] : 0}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
