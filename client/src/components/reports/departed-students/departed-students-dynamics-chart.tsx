"use client";

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
import { ChartCard } from "./chart-card";

interface DynamicsResponse {
  data: { date: string; count: number }[];
}

export function DepartedStudentsDynamicsChart() {
  const { data, isLoading } = useQuery<DynamicsResponse>({
    queryKey: ["departed-students-dynamics"],
    queryFn: () =>
      api
        .get<DynamicsResponse>("/reports/departed-students/dynamics")
        .then((r) => r.data),
    staleTime: 0,
  });

  const chartData = (data?.data ?? []).map((d) => ({
    ...d,
    label: format(new Date(d.date + "T00:00:00"), "dd.MM"),
  }));
  const isEmpty = chartData.length > 0 && chartData.every((d) => d.count === 0);

  return (
    <ChartCard
      title="Ketish dinamikasi"
      tooltip={
        "So'nggi 30 kun ichida kunlik ketganlar soni.\n" +
        "Sahifaning umumiy filtridan qat'iy nazar, doim oxirgi 30 kun ko'rsatiladi."
      }
      isLoading={isLoading}
      isEmpty={isEmpty}
      emptyMessage="So'nggi 30 kun ichida ketganlar yo'q"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            formatter={(value) => [`${value} ta`, "Ketganlar"]}
            labelFormatter={(label) => `Sana: ${label}`}
          />
          <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
