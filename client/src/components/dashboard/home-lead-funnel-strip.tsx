"use client";

import Link from "next/link";
import { ChevronRight, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildFunnelRows,
  currentMonthRange,
} from "@/components/reports/lead-funnel/lead-funnel-math";
import type { LeadFunnelResponse } from "@/components/reports/lead-funnel/lead-funnel-types";

/**
 * Bosh sahifadagi ixcham voronka: joriy oy. Alohida so'rov — panelning o'zagi
 * uni kutmaydi, bu so'rov yiqilsa ham qolgan bloklar joyida qoladi.
 */
export function HomeLeadFunnelStrip({ showDetails }: { showDetails: boolean }) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const range = currentMonthRange();

  const { data, isPending, isError } = useQuery({
    queryKey: [
      "reports",
      "lead-funnel",
      selectedBranch?.id ?? "all",
      range.startDate,
      range.endDate,
    ],
    queryFn: () =>
      api
        .get<LeadFunnelResponse>("/reports/lead-funnel", { params: range })
        .then((r) => r.data),
    enabled: branchLoaded,
    staleTime: 60_000,
  });

  // Ikkinchi darajali blok: xato bo'lsa jim yashiriladi, panel buzilmaydi.
  if (isError) return null;
  if (isPending || !data) return <Skeleton className="h-[72px] rounded-xl" />;

  const rows = buildFunnelRows(data.stages);
  const conversion = rows[rows.length - 1].pctOfFirst;

  return (
    <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Filter className="size-4" />
        <span>Lid voronkasi · shu oy</span>
      </div>

      <ol className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        {rows.map((row, i) => (
          <li key={row.stage} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRight
                className="size-3.5 text-muted-foreground/60"
                aria-hidden="true"
              />
            )}
            <span className="text-xs text-muted-foreground">{row.label}</span>
            <span className="text-base font-semibold tabular-nums">
              {formatNumber(row.count)}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          Liddan to&apos;lovgacha{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {formatPercent(conversion)}
          </span>
        </span>
        <span className="text-muted-foreground">
          To&apos;lamagan faol o&apos;quvchi{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {formatNumber(data.unpaid.active)}
          </span>
        </span>
        {showDetails && (
          <Link
            href="/reports/leads"
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            Batafsil
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
