"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { CheckCircle2, CalendarClock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickStatsProps {
  nextClass: string | null;
}

export function StudentQuickStats({ nextClass }: QuickStatsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["student-portal", "attendance-stats"],
    queryFn: () => api.get("/student-portal/attendance/stats").then((r) => r.data),
  });

  const items = [
    { label: "Davomat", value: isLoading ? null : stats ? `${stats.percentage}%` : "—", icon: CheckCircle2 },
    { label: "Keyingi dars", value: nextClass ?? "—", icon: CalendarClock },
  ];

  return (
    <div className="rounded-lg border bg-card divide-y">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3 px-4 py-3">
          <item.icon className="size-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground flex-1">{item.label}</span>
          {item.value === null ? (
            <Skeleton className="h-4 w-8" />
          ) : (
            <span className="text-sm font-semibold">{item.value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
