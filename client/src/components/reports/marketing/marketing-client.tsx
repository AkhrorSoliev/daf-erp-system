"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { REPORT_FLOOR_MONTH, clampMonth } from "@/components/payments/overview/overview-math";
import type { MarketingReport } from "./marketing-format";
import { MarketingReportView } from "./marketing-view";

const FILTERS = { month: { type: "string" as const, defaultValue: "" } };

/** «Marketing» (spec B1 §3): one month's spend, new students and what they paid. CEO/BD only. */
export function MarketingClient() {
  const { selectedBranch } = useBranchSwitcher();
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, REPORT_FLOOR_MONTH, current);
  const report = useQuery({
    queryKey: ["marketing", selectedBranch?.id, month],
    queryFn: () =>
      api
        .get<MarketingReport>("/reports/marketing", { params: { branchId: selectedBranch?.id, month } })
        .then((r) => r.data),
    // Money figures: fetch again on every visit, like the overview blocks (the app default is 5 minutes).
    staleTime: 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Marketing</h2>
        <MonthStepper
          value={month}
          min={REPORT_FLOOR_MONTH}
          max={current}
          onChange={(m) => setFilter("month", m === current ? "" : m)}
        />
      </div>
      {report.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : report.isError ? (
        <BlockError title="Marketing" onRetry={() => report.refetch()} />
      ) : (
        <MarketingReportView data={report.data} />
      )}
    </div>
  );
}
