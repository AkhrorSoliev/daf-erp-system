"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertCircle, PhoneCall, UserMinus, XCircle, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import api from "@/lib/api";
import type { OutreachStats } from "./outreach-types";

export function OutreachStatsWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "stats"],
    queryFn: () =>
      api.get<OutreachStats>("/outreach/stats").then((r) => r.data),
    staleTime: 0,
  });

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        icon={XCircle}
        label="Bugun kelmadi"
        value={data.todayAbsentees}
        accentColor={data.todayAbsentees > 0 ? "text-red-600" : undefined}
      />
      <StatCard
        icon={PhoneCall}
        label="Faol qo'ng'iroqlar"
        value={data.pendingCallbacks}
      />
      <StatCard
        icon={AlertCircle}
        label="Muddati o'tib ketdi"
        value={data.overdueCallbacks}
        accentColor={
          data.overdueCallbacks > 0 ? "text-amber-700" : undefined
        }
      />
      <StatCard
        icon={UserMinus}
        label="Chiqarish navbati"
        value={data.removalQueue}
        accentColor={data.removalQueue > 0 ? "text-orange-600" : undefined}
      />
    </div>
  );
}

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  accentColor?: string;
}

function StatCard({ icon: Icon, label, value, accentColor }: StatCardProps) {
  return (
    <div className="flex flex-col rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div
        className={cn("mt-3 text-2xl font-semibold tabular-nums", accentColor)}
      >
        {formatNumber(value)}
      </div>
    </div>
  );
}
