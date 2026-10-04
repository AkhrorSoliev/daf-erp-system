"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { debtListParams, type DebtFilters } from "./debt-url";
import type { DebtDrawer, DebtListResponse } from "./debt-types";

export const debtListKey = (branchId: number | undefined, params: ReturnType<typeof debtListParams>) => ["debt-list", branchId, params] as const;

export function useDebtList(f: DebtFilters) {
  const { selectedBranch } = useBranchSwitcher();
  const params = debtListParams(f);
  return useQuery({
    queryKey: debtListKey(selectedBranch?.id, params),
    queryFn: () => api.get<DebtListResponse>("/payments/debt/list", { params }).then((r) => r.data),
    // Totals, chips, options and the pager stay on screen while the next page or filter loads.
    placeholderData: keepPreviousData,
  });
}

export function useDebtStudent(id: number | null) {
  return useQuery({
    queryKey: ["debt-student", id],
    queryFn: () => api.get<DebtDrawer>(`/payments/debt/students/${id}`).then((r) => r.data),
    enabled: id !== null,
  });
}

/** After a payment, a promise or a call every debt figure refetches (financial data never updates optimistically). */
export function invalidateDebt(qc: QueryClient) {
  for (const key of ["debt-list", "debt-student", "promise-month", "financial-overview", "debtors"]) qc.invalidateQueries({ queryKey: [key] });
}
