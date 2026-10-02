"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { monthRange } from "./overview-math";
import type { FinancialOverview } from "./types";

/**
 * The first element of every query key the page reads; a recorded payment
 * refreshes all of them. «financial-overview» keeps its name: the payment,
 * refund, withdrawal, expense and debtor dialogs elsewhere invalidate it.
 */
export const OVERVIEW_QUERY_KEYS = ["financial-overview", "recent-payments"] as const;

export function useBranchId(): number | undefined {
  return useBranchSwitcher().selectedBranch?.id;
}

/** Month charges, today's debt, yesterday's cash and the month's salary (CEO/BD). */
export function useFinancialOverview(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["financial-overview", branchId, month],
    queryFn: () =>
      api
        .get<FinancialOverview>("/reports/financial-overview", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}
