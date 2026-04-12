"use client";

import { useQuery } from "@tanstack/react-query";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
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
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

interface Props {
  branchId: number;
  startDate: string;
  endDate: string;
}

interface GroupAnalyticsData {
  statusDistribution: { status: string; count: number }[];
  fillRates: {
    groupId: string;
    groupName: string;
    enrolled: number;
    capacity: number | null;
    fillRate: number | null;
  }[];
  formingGroups: {
    groupId: string;
    groupName: string;
    enrolled: number;
    capacity: number | null;
    fillRate: number | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Faol",
  FORMING: "Shakllanmoqda",
  PAUSED: "To'xtatilgan",
  COMPLETED: "Tugallangan",
  CANCELLED: "Bekor qilingan",
  ARCHIVED: "Arxivlangan",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "hsl(142, 76%, 36%)",
  FORMING: "hsl(217, 91%, 60%)",
  PAUSED: "hsl(45, 93%, 47%)",
  COMPLETED: "hsl(262, 52%, 47%)",
  CANCELLED: "hsl(0, 84%, 60%)",
  ARCHIVED: "hsl(220, 9%, 46%)",
};

export function ReportsGroupAnalytics({
  branchId,
  startDate,
  endDate,
}: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "group-analytics", branchId, startDate, endDate],
    queryFn: () =>
      api
        .get<GroupAnalyticsData>("/reports/group-analytics", {
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

  if (!data) return null;

  const pieData = data.statusDistribution.map((s) => ({
    name: STATUS_LABELS[s.status] ?? s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] ?? "hsl(220, 9%, 46%)",
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pie chart */}
        <div className="bg-card rounded-lg border p-4">
          <h3 className="text-sm font-medium mb-4">Guruhlar holati</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {pieData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                itemStyle={{ color: "hsl(var(--foreground))" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Forming groups */}
        {data.formingGroups.length > 0 && (
          <div className="bg-card rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-4">
              Shakllanayotgan guruhlar
            </h3>
            <div className="space-y-3">
              {data.formingGroups.map((g) => (
                <div key={g.groupId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{g.groupName}</span>
                    <span className="text-muted-foreground">
                      {g.enrolled}/{g.capacity ?? "—"}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{
                        width: `${Math.min(g.fillRate ?? 0, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Fill rates table */}
      <div className="bg-card rounded-lg border overflow-x-auto">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-medium">
            Guruhlar to&apos;lganlik darajasi
          </h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="min-w-25">Guruh</TableHead>
              <TableHead className="text-right whitespace-nowrap">O&apos;quvchilar</TableHead>
              <TableHead className="text-right">Sig&apos;im</TableHead>
              <TableHead className="text-right whitespace-nowrap">To&apos;lganlik</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.fillRates.map((g, i) => (
              <TableRow key={g.groupId}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium">{g.groupName}</TableCell>
                <TableCell className="text-right">{g.enrolled}</TableCell>
                <TableCell className="text-right">
                  {g.capacity ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {g.fillRate !== null ? (
                    <Badge
                      variant={
                        g.fillRate >= 70
                          ? "default"
                          : g.fillRate >= 40
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {g.fillRate}%
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
