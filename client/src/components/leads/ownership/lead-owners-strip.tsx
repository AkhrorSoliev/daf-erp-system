"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAD_FILTER_SCHEMA } from "../lead-filter-schema";
import { LEAD_STATS_SCHEMA, parseStatsPeriod } from "../lead-stats";
import { fetchOwnerSummary } from "./ownership-api";

/**
 * «Xodimlar bo'yicha» under the stats strip (ADR-0093): how many leads each
 * person holds now (and how many untouched), how many they took and how many
 * went back in the strip's period. A click lists that person's leads. A failed
 * request or nobody holding leads hides it; the board works without it.
 */
export function LeadOwnersStrip() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const revision = useLeadsBoard((s) => s.revision);
  const { filters: statsFilters } = useUrlFilters(LEAD_STATS_SCHEMA);
  const { filters, setFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);
  // The list shows exactly this person's leads.
  const active = (userId: number) =>
    filters.masul.length === 1 && filters.masul[0] === String(userId);

  const { data, isPending, isError } = useQuery({
    queryKey: ["leads", "owners", selectedBranch?.id ?? "all", period, revision],
    queryFn: () => fetchOwnerSummary(period),
    enabled: branchLoaded,
    placeholderData: (previous) => previous,
  });

  if (isError || (data && data.rows.length === 0)) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex h-6 items-center px-0.5 text-xs text-muted-foreground">
        Xodimlar bo&apos;yicha
      </div>
      <div className="flex flex-wrap gap-2">
        {isPending || !data
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-44" />)
          : data.rows.map((r) => (
              <button
                key={r.userId}
                type="button"
                onClick={() => setFilters({ masul: [String(r.userId)], page: 1 })}
                aria-pressed={active(r.userId)}
                className={cn(
                  "rounded-md border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50",
                  active(r.userId) && "ring-2 ring-primary",
                )}
              >
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-muted-foreground">
                  {formatNumber(r.held)} ta lid
                  {r.untouched > 0 && ` · ${formatNumber(r.untouched)} tasi harakatsiz`}
                </p>
                <p
                  className={cn(
                    r.expired > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
                  )}
                >
                  olgan {formatNumber(r.taken)} · qaytgan {formatNumber(r.expired)}
                </p>
              </button>
            ))}
      </div>
    </section>
  );
}
