"use client";

import { useQuery } from "@tanstack/react-query";
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
import { ChartCard } from "./chart-card";

interface ReasonsResponse {
  data: { reasonId: string | null; reasonName: string; count: number }[];
}

interface Props {
  branchId: number | null;
  courseId: string | null;
  teacherIds: number[];
  startDate: string;
  endDate: string;
}

export function DepartedStudentsReasonsChart({
  branchId,
  courseId,
  teacherIds,
  startDate,
  endDate,
}: Props) {
  const params = {
    branchId: branchId ?? undefined,
    courseId: courseId ?? undefined,
    teacherIds: teacherIds.length > 0 ? teacherIds.join(",") : undefined,
    startDate,
    endDate,
  };

  const { data, isLoading } = useQuery<ReasonsResponse>({
    queryKey: ["departed-students-reasons", params],
    queryFn: () =>
      api
        .get<ReasonsResponse>("/reports/departed-students/reasons", {
          params,
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const chartData = data?.data ?? [];
  const isEmpty = chartData.length === 0;
  const height = Math.max(240, chartData.length * 36 + 40);

  return (
    <ChartCard
      title="Asosiy ketish sabablari"
      tooltip={
        "Tanlangan davrda ketgan o'quvchilar sabablari bo'yicha taqsimot.\n" +
        "Eng ko'p uchragan sabablar yuqorida. Sahifa filtriga bo'ysunadi."
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="Tanlangan davrda ketganlar yo'q"
      bodyHeightClass={isEmpty || isLoading ? "h-[240px]" : ""}
    >
      {!isEmpty && !isLoading && (
        <div style={{ height: `${height}px` }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
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
                dataKey="reasonName"
                tick={{ fontSize: 12 }}
                width={150}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                formatter={(value) => [`${value} ta`, "Soni"]}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}
