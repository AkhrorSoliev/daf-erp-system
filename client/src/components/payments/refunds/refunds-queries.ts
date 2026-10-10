"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { retryDrawer } from "../debt/debt-queries";
import { refundableListParams, type RefundsFilters } from "./refunds-url";
import type { RefundableDrawer, RefundableListResponse, RefundableTab, RefundHistoryResponse } from "./refunds-types";

export const refundableListKey = (branchId: number | undefined, params: ReturnType<typeof refundableListParams>) =>
  ["refundable-list", branchId, params] as const;
export const refundHistoryKey = (branchId: number | undefined, page: number, pageSize: number) =>
  ["refund-history", branchId, page, pageSize] as const;

/**
 * The summary, the pending block, the tab totals and the pager stay on screen
 * while the next page, chip or search of the SAME tab loads. Another tab has
 * other columns, so a tab switch drops only the rows (skeleton). Another branch's
 * answer is never kept at all: every figure on it belongs to that branch.
 */
export const keepWithinRefundTab = (tab: RefundableTab, branchId?: number) =>
  (prev: RefundableListResponse | undefined, prevQuery?: { queryKey: ReturnType<typeof refundableListKey> }) => {
    if (!prev) return prev;
    if (prevQuery && prevQuery.queryKey[1] !== branchId) return undefined;
    return prevQuery?.queryKey[2].tab === tab ? prev : { ...prev, rows: { ...prev.rows, data: [], total: 0 } };
  };

export function useRefundableList(f: RefundsFilters) {
  const { selectedBranch } = useBranchSwitcher();
  const params = refundableListParams(f);
  return useQuery({
    queryKey: refundableListKey(selectedBranch?.id, params),
    queryFn: () => api.get<RefundableListResponse>("/refundable/list", { params }).then((r) => r.data),
    placeholderData: keepWithinRefundTab(params.tab, selectedBranch?.id),
    // «Bugungi holat»: a hand-over at another desk shows on return.
    staleTime: 0,
  });
}

export function useRefundableStudent(id: number | null) {
  return useQuery({
    queryKey: ["refundable-student", id],
    queryFn: () => api.get<RefundableDrawer>(`/refundable/students/${id}`).then((r) => r.data),
    enabled: id !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

/** The pager stays while another page of the SAME branch loads; another branch's rows are never kept. */
export const keepWithinBranch = (branchId?: number) =>
  (prev: RefundHistoryResponse | undefined, prevQuery?: { queryKey: ReturnType<typeof refundHistoryKey> }) =>
    prevQuery && prevQuery.queryKey[1] !== branchId ? undefined : prev;

export function useRefundHistory(page: number, pageSize: number) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: refundHistoryKey(selectedBranch?.id, page, pageSize),
    queryFn: () =>
      api.get<RefundHistoryResponse>("/refunds", { params: { status: "COMPLETED,REJECTED", page, pageSize } }).then((r) => r.data),
    placeholderData: keepWithinBranch(selectedBranch?.id),
  });
}

/** Every key a request, a hand-over, a cancel, a notice or a transfer moves (financial data never updates optimistically). */
export const REFUND_QUERY_KEYS = [
  "refundable-list", "refundable-student", "refund-history", "financial-overview", "student-payments", "debt-list", "debt-student",
] as const;

export function invalidateRefunds(qc: QueryClient) {
  for (const key of REFUND_QUERY_KEYS) qc.invalidateQueries({ queryKey: [key] });
}
