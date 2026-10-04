"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { debtListParams, type DebtFilters } from "./debt-url";
import type { DebtDrawer, DebtListResponse, DebtTab } from "./debt-types";

export const debtListKey = (branchId: number | undefined, params: ReturnType<typeof debtListParams>) => ["debt-list", branchId, params] as const;

/**
 * Totals, chips, options and the pager stay on screen while the next page or
 * filter of the SAME tab loads. Another tab has other columns and other
 * amounts, so a tab switch shows the skeleton instead of the old rows.
 */
export const keepWithinTab = (tab: DebtTab) =>
  (prev: DebtListResponse | undefined, prevQuery?: { queryKey: ReturnType<typeof debtListKey> }) =>
    prevQuery?.queryKey[2].tab === tab ? prev : undefined;

/** A drawer request is retried only when the server or the network failed, at most twice: a 404 or a 403 will not change. */
export function retryDrawer(failureCount: number, error: unknown) {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  return failureCount < 2 && (status === undefined || status >= 500);
}

export function useDebtList(f: DebtFilters) {
  const { selectedBranch } = useBranchSwitcher();
  const params = debtListParams(f);
  return useQuery({
    queryKey: debtListKey(selectedBranch?.id, params),
    queryFn: () => api.get<DebtListResponse>("/payments/debt/list", { params }).then((r) => r.data),
    placeholderData: keepWithinTab(params.tab),
    // «Bugungi holat»: a payment made elsewhere (another cashier, Payme, Click) shows on return.
    staleTime: 0,
  });
}

export function useDebtStudent(id: number | null) {
  return useQuery({
    queryKey: ["debt-student", id],
    queryFn: () => api.get<DebtDrawer>(`/payments/debt/students/${id}`).then((r) => r.data),
    enabled: id !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

/** After a payment, a promise or a call every debt figure refetches (financial data never updates optimistically). */
export function invalidateDebt(qc: QueryClient) {
  for (const key of ["debt-list", "debt-student", "promise-month", "financial-overview", "debtors"]) qc.invalidateQueries({ queryKey: [key] });
}
