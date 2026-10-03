"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { monthRange } from "./overview-math";
import type { FinancialOverview, IncomeAttribution, ProfitComposition, TrendRow } from "./types";

/**
 * The first element of every query key the page reads; a recorded payment
 * refreshes all of them. «financial-overview» keeps its name: the payment,
 * refund, withdrawal, expense and debtor dialogs elsewhere invalidate it.
 */
export const OVERVIEW_QUERY_KEYS = [
  "financial-overview",
  "income-month-attribution",
  "profit-composition",
  "financial-trend",
  "recent-payments",
] as const;

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

/** «Kassaga tushdi» and its dialog — the month's cash in three parts. */
export function useIncomeAttribution(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["income-month-attribution", branchId, month],
    queryFn: () =>
      api
        .get<IncomeAttribution>("/reports/income-month-attribution", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}

/** «Foyda» and «Qanday hisoblandi» — the canonical net profit and its legs. */
export function useProfitComposition(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["profit-composition", branchId, month],
    queryFn: () =>
      api
        .get<ProfitComposition>("/reports/profit-composition", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
  });
}

/** «Oylar bo'yicha» — six months ending at the month (oldest first from the server). */
export function useFinancialTrend(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["financial-trend", branchId, month],
    queryFn: () =>
      api
        .get<TrendRow[]>("/reports/financial-trend", {
          // The current month needs no anchor; leaving it out keeps the
          // default view working against a server that predates `?month=`.
          params: { branchId, ...(month !== currentMonthKey() && { month }) },
        })
        .then((r) => r.data),
  });
}
