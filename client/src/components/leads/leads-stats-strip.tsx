"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  LayoutGrid,
  PhoneOff,
  UserPlus,
  UserX,
} from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAD_FILTER_SCHEMA } from "./lead-filter-schema";
import {
  LEAD_STATS_PERIODS,
  LEAD_STATS_SCHEMA,
  UNCALLED_HOLATI,
  parseStatsPeriod,
  topSourcesLine,
  type LeadStats,
} from "./lead-stats";

/**
 * Five figures above the leads board: what stands on it now, and what came in,
 * became a student or was lost in the chosen period. A failed request hides
 * the strip; the board works without it.
 */
export function LeadsStatsStrip() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  // Bumped by every lead create / edit / move / delete on the board.
  const revision = useLeadsBoard((s) => s.revision);
  const { filters: statsFilters, setFilter: setStatsFilter } =
    useUrlFilters(LEAD_STATS_SCHEMA);
  const { setFilters: setLeadFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);

  const { data, isPending, isError } = useQuery({
    queryKey: ["leads", "stats", selectedBranch?.id ?? "all", period, revision],
    queryFn: () =>
      api
        .get<LeadStats>("/leads/stats", { params: { period } })
        .then((r) => r.data),
    enabled: branchLoaded,
    placeholderData: (previous) => previous,
  });

  if (isError) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
      <section className="space-y-1.5">
        <div className="flex h-6 items-center px-0.5 text-xs text-muted-foreground">
          Hozir
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard
            icon={<LayoutGrid className="size-4" />}
            label="Doskada"
            value={data?.now.onBoard}
            sub="ustunlarda kutyapti"
            loading={isPending}
          />
          <StatCard
            icon={<PhoneOff className="size-4" />}
            label="Qo'ng'iroq qilinmagan"
            value={data?.now.uncalled}
            sub={
              data && data.now.uncalledOverWeek > 0
                ? `${formatNumber(data.now.uncalledOverWeek)} tasi 7 kundan ortiq`
                : "hammasiga qo'ng'iroq qilingan"
            }
            tone="urgent"
            loading={isPending}
            onClick={() => setLeadFilters({ holati: UNCALLED_HOLATI, page: 1 })}
            hint="Qo'ng'iroq qilinmagan yangi lidlar ro'yxatini ochish"
          />
        </div>
      </section>

      <section className="space-y-1.5">
        <div className="flex h-6 items-center justify-between gap-2 px-0.5">
          <span className="text-xs text-muted-foreground">Davr bo'yicha</span>
          <div className="flex overflow-hidden rounded-md border text-xs">
            {LEAD_STATS_PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={p.value === period}
                onClick={() => setStatsFilter("period", p.value)}
                className={cn(
                  "px-2.5 py-0.5 transition-colors",
                  p.value === period
                    ? "bg-card font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <StatCard
            icon={<UserPlus className="size-4" />}
            label="Yangi lidlar"
            value={data?.flow.created}
            sub={(data && topSourcesLine(data.flow.topSources)) ?? "doskaga tushdi"}
            loading={isPending}
          />
          <StatCard
            icon={<GraduationCap className="size-4" />}
            label="O'quvchi bo'ldi"
            value={data?.flow.converted}
            sub="guruhga qo'shildi"
            tone="good"
            loading={isPending}
          />
          <StatCard
            icon={<UserX className="size-4" />}
            label="Yo'qotildi"
            value={data?.flow.lost}
            sub="arxivga o'tdi"
            loading={isPending}
          />
        </div>
      </section>
    </div>
  );
}

const TONE: Record<"plain" | "urgent" | "good", string> = {
  plain: "",
  urgent: "text-orange-600 dark:text-orange-400",
  good: "text-emerald-600 dark:text-emerald-400",
};

function StatCard({
  icon,
  label,
  value,
  sub,
  tone = "plain",
  loading,
  onClick,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: number | undefined;
  sub: string;
  tone?: keyof typeof TONE;
  loading: boolean;
  onClick?: () => void;
  hint?: string;
}) {
  if (loading) return <Skeleton className="h-[86px] rounded-xl" />;

  const body = (
    <>
      <div className={cn("flex items-center gap-1.5 text-xs", TONE[tone] || "text-muted-foreground")}>
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", TONE[tone])}>
        {formatNumber(value ?? 0)}
      </div>
      <div className="truncate text-xs text-muted-foreground">{sub}</div>
    </>
  );

  const frame = cn(
    "min-w-0 rounded-xl border bg-card px-3 py-2.5 text-left",
    tone === "urgent" && "border-orange-300 dark:border-orange-900",
  );

  if (!onClick) return <div className={frame}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(frame, "transition-colors hover:bg-muted/50")}
    >
      {body}
    </button>
  );
}
