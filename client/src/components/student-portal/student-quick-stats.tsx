"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import api from "@/lib/api";
import { CheckCircle2, CalendarClock, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface QuickStatsProps {
  nextClass: string | null;
}

export function StudentQuickStats({ nextClass }: QuickStatsProps) {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["student-portal", "attendance-stats"],
    queryFn: () => api.get("/student-portal/attendance/stats").then((r) => r.data),
  });

  return (
    <div className="rounded-lg border bg-card divide-y">
      <Link
        href="/portal/attendance"
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <CheckCircle2 className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Davomat</span>
        {isLoading ? (
          <Skeleton className="h-4 w-8" />
        ) : (
          <span className="text-sm font-semibold">{stats ? `${stats.percentage}%` : "—"}</span>
        )}
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
      <Link
        href="/portal/schedule"
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        <CalendarClock className="size-4 text-muted-foreground shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">Keyingi dars</span>
        <span className="text-sm font-semibold">{nextClass ?? "—"}</span>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
