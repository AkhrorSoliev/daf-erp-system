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
  Cell,
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

interface RoomStat {
  id: string;
  name: string;
  capacity: number | null;
  hoursPerWeek: number;
  fillRate: number | null;
  totalGroups: number;
  totalEnrolled: number;
}

interface RoomUtilizationData {
  rooms: RoomStat[];
  summary: {
    totalRooms: number;
    averageFillRate: number;
    mostUtilized: string | null;
    leastUtilized: string | null;
  };
}

function getFillColor(rate: number | null) {
  if (rate === null) return "hsl(var(--muted-foreground))";
  if (rate >= 70) return "hsl(142, 76%, 36%)";
  if (rate >= 40) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}

export function ReportsRoomUtilization({
  branchId,
  startDate,
  endDate,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "room-utilization", branchId, startDate, endDate],
    queryFn: () =>
      api
        .get<RoomUtilizationData>("/reports/room-utilization", {
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

  if (!data || data.rooms.length === 0) {
    return (
      <p className="text-muted-foreground text-sm py-8 text-center">
        Xonalar ma&apos;lumoti topilmadi
      </p>
    );
  }

  const chartData = data.rooms.map((r) => ({
    name: r.name,
    fillRate: r.fillRate ?? 0,
    hoursPerWeek: r.hoursPerWeek,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="bg-card rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-xs">Jami xonalar</p>
          <p className="text-lg font-semibold">{data.summary.totalRooms}</p>
        </div>
        <div className="bg-card rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-xs">
            O&apos;rtacha to&apos;lganlik
          </p>
          <p className="text-lg font-semibold">
            {data.summary.averageFillRate}%
          </p>
        </div>
        <div className="bg-card rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-xs">Eng band xona</p>
          <p className="text-lg font-semibold truncate">
            {data.summary.mostUtilized ?? "—"}
          </p>
        </div>
        <div className="bg-card rounded-lg border px-3 py-2.5">
          <p className="text-muted-foreground text-xs">Eng bo&apos;sh xona</p>
          <p className="text-lg font-semibold truncate">
            {data.summary.leastUtilized ?? "—"}
          </p>
        </div>
      </div>

      {/* Bar chart — horizontal layout scales well with many rooms */}
      <div className="bg-card rounded-lg border p-4">
        <h3 className="text-sm font-medium mb-4">
          Xonalar to&apos;lganlik darajasi (%)
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
              width={80}
              tick={{ fontSize: 11 }}
              className="fill-muted-foreground"
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
              formatter={(value) => [`${value}%`, "To'lganlik"]}
            />
            <Bar dataKey="fillRate" radius={[0, 4, 4, 0]} barSize={24}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={getFillColor(entry.fillRate)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="min-w-25">Xona</TableHead>
              <TableHead className="text-right">Sig&apos;im</TableHead>
              <TableHead className="text-right whitespace-nowrap">Soat/hafta</TableHead>
              <TableHead className="text-right whitespace-nowrap">To&apos;lganlik</TableHead>
              <TableHead className="text-right">Guruhlar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rooms.map((room, i) => (
              <TableRow key={room.id}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium">{room.name}</TableCell>
                <TableCell className="text-right">
                  {room.capacity ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {room.hoursPerWeek}
                </TableCell>
                <TableCell className="text-right">
                  {room.fillRate !== null ? (
                    <span
                      className={
                        room.fillRate >= 70
                          ? "text-green-600 dark:text-green-400"
                          : room.fillRate >= 40
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-red-600 dark:text-red-400"
                      }
                    >
                      {room.fillRate}%
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {room.totalGroups}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
