"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildFunnelRows,
  currentMonthRange,
  displayDate,
} from "@/components/reports/lead-funnel/lead-funnel-math";
import { LeadFunnelChart } from "@/components/reports/lead-funnel/lead-funnel-chart";
import type { LeadFunnelResponse } from "@/components/reports/lead-funnel/lead-funnel-types";

/**
 * Bosh sahifadagi ixcham voronka: joriy oy. Alohida so'rov — panelning o'zagi
 * uni kutmaydi, bu so'rov yiqilsa ham qolgan bloklar joyida qoladi.
 */
export function HomeLeadFunnelStrip({ showDetails }: { showDetails: boolean }) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const router = useRouter();
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
  if (isPending || !data) return <Skeleton className="h-[310px] rounded-xl sm:h-[186px]" />;

  const rows = buildFunnelRows(data.stages);
  const conversion = rows[rows.length - 1].pctOfFirst;
  const openReport = () => router.push("/reports/leads");

  return (
    <section className="grid gap-x-6 gap-y-4 rounded-xl border bg-card px-4 py-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] sm:items-center">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 sm:flex-col sm:items-start sm:gap-y-2.5">
        <div className="flex basis-full items-center gap-2 text-sm text-muted-foreground">
          <Filter className="size-4" />
          <span>
            Lid voronkasi ·{" "}
            {range.startDate.endsWith("-01")
              ? "shu oy"
              : `${displayDate(range.startDate)} dan`}
          </span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Liddan to&apos;lovgacha</p>
          <p className="text-xl font-semibold tabular-nums">
            {formatPercent(conversion)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            To&apos;lamagan faol o&apos;quvchi
          </p>
          <p className="text-xl font-semibold tabular-nums">
            {formatNumber(data.unpaid.active)}
          </p>
        </div>
        {showDetails && (
          <Link
            href="/reports/leads"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline"
          >
            Batafsil
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>

      {data.stages.lead === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Bu oyda hali lid yo&apos;q.
        </p>
      ) : (
        <LeadFunnelChart
          rows={rows}
          compact
          onStageClick={showDetails ? openReport : undefined}
        />
      )}
    </section>
  );
}
