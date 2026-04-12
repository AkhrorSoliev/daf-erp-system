"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
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
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface Props {
  branchId: number;
  startDate: string;
  endDate: string;
}

interface AttendanceData {
  overallRate: number;
  weeklyTrend: { week: string; rate: number }[];
  byDayOfWeek: { day: string; rate: number }[];
  worstGroups: { groupId: string; groupName: string; rate: number }[];
}

export function ReportsAttendanceAnalytics({
  branchId,
  startDate,
  endDate,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: [
      "reports",
      "attendance-analytics",
      branchId,
      startDate,
      endDate,
    ],
    queryFn: () =>
      api
        .get<AttendanceData>("/reports/attendance-analytics", {
          params: { branchId, startDate, endDate },
        })
        .then((r) => r.data),
    enabled: branchId > 0,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  if (!data) return null;

  const rateColor =
    data.overallRate >= 80
      ? "text-green-600 dark:text-green-400"
      : data.overallRate >= 60
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6">
      {/* Overall rate */}
      <div className="bg-card rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3">
        <p className="text-muted-foreground text-xs">Umumiy davomat foizi</p>
        <p className={`text-2xl sm:text-3xl font-bold ${rateColor}`}>
          {data.overallRate}%
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Weekly trend */}
        {data.weeklyTrend.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-4">Haftalik trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.weeklyTrend}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  width={35}
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
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* By day of week */}
        {data.byDayOfWeek.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-4">Kunlar bo&apos;yicha</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.byDayOfWeek}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  className="fill-muted-foreground"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  width={35}
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
                  dataKey="rate"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Worst groups */}
      {data.worstGroups.length > 0 && (
        <div className="bg-card rounded-lg border">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-medium">
              Eng past davomatli guruhlar
            </h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Guruh</TableHead>
                <TableHead className="text-right">Davomat %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.worstGroups.map((g, i) => (
                <TableRow key={g.groupId}>
                  <TableCell className="border-r text-muted-foreground">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{g.groupName}</TableCell>
                  <TableCell className="text-right">
                    <span className="text-red-600 dark:text-red-400">
                      {g.rate}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
