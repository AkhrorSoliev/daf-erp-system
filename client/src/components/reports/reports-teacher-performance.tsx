"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface Props {
  branchId: number;
  startDate: string;
  endDate: string;
}

interface TeacherStat {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  groupsCount: number;
  averageAttendance: number | null;
  averageFillRate: number | null;
}

export function ReportsTeacherPerformance({
  branchId,
  startDate,
  endDate,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "reports",
      "teacher-performance",
      branchId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api
        .get<{ teachers: TeacherStat[] }>("/reports/teacher-performance", {
          params: { branchId, startDate, endDate },
        })
        .then((r) => r.data),
    enabled: branchId > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!data || data.teachers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        O&apos;qituvchilar ma&apos;lumoti topilmadi
      </p>
    );
  }

  const chartData = data.teachers.map((t) => ({
    name: `${t.firstName} ${t.lastName.charAt(0)}.`,
    davomat: t.averageAttendance ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Bar chart */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-4">
          O&apos;qituvchilar davomati (%)
        </h3>
        <ResponsiveContainer
          width="100%"
          height={Math.max(chartData.length * 40, 200)}
        >
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              type="number"
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
            />
            <YAxis
              type="category"
              dataKey="name"
              width={90}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value) => [`${value}%`, "Davomat"]}
            />
            <Bar
              dataKey="davomat"
              fill="hsl(var(--primary))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="min-w-32">O&apos;qituvchi</TableHead>
              <TableHead className="text-right">Guruhlar</TableHead>
              <TableHead className="text-right whitespace-nowrap">Davomat %</TableHead>
              <TableHead className="text-right whitespace-nowrap">To&apos;lganlik %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.teachers.map((t, i) => (
              <TableRow key={t.id}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarImage src={t.photo ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {t.firstName[0]}
                        {t.lastName[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {t.firstName} {t.lastName}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{t.groupsCount}</TableCell>
                <TableCell className="text-right">
                  {t.averageAttendance !== null ? (
                    <span
                      className={
                        t.averageAttendance >= 80
                          ? "text-green-600 dark:text-green-400"
                          : t.averageAttendance >= 60
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                      }
                    >
                      {t.averageAttendance}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {t.averageFillRate !== null ? `${t.averageFillRate}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
