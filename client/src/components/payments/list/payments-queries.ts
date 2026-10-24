"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { OVERVIEW_QUERY_KEYS, useBranchId } from "@/components/payments/overview/queries";
import { invalidateDebt, retryDrawer } from "@/components/payments/debt/debt-queries";
import type { PaymentFilterOptions, PaymentListResponse, PaymentRowResponse, PaymentSummary } from "./payments-list-types";

type Period = { startDate: string; endDate: string };

/** First element of every query key this page reads. The branch rides in the key; the server reads it from X-Branch-Id. */
export const PAYMENTS_LIST_KEYS = ["payments-list-rows", "payments-list-row", "payments-list-summary", "payments-list-options"] as const;

/** The list; a filter or page change keeps the old rows on screen until the new ones arrive. `null` = invalid «Oraliq», nothing is asked. */
export function usePaymentsRows(params: Record<string, string | number> | null) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["payments-list-rows", branchId, params],
    queryFn: () => api.get<PaymentListResponse>("/payments/list/rows", { params: params ?? undefined }).then((r) => r.data),
    enabled: params !== null,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** One payment for the drawer, with the page's period (the server falls back to the payment's own month). */
export function usePaymentRow(id: string | null, period: Period | null) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["payments-list-row", branchId, id, period],
    queryFn: () => api.get<PaymentRowResponse>(`/payments/list/rows/${id}`, { params: period ?? undefined }).then((r) => r.data),
    enabled: id !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

/** The summary card (`reports.finance` holders only: pass `enabled` from `useCan`). */
export function usePaymentsSummary(period: Period | null, enabled: boolean) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["payments-list-summary", branchId, period],
    queryFn: () => api.get<PaymentSummary>("/payments/list/summary", { params: period ?? undefined }).then((r) => r.data),
    enabled: enabled && period !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

export function usePaymentsFilterOptions() {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["payments-list-options", branchId],
    queryFn: () => api.get<PaymentFilterOptions>("/payments/list/filter-options").then((r) => r.data),
    staleTime: 0,
  });
}

/** After a payment is recorded, corrected or cancelled: the list, the card, the drawer, «Umumiy ma'lumotlar» and the debt pages refetch. */
export function invalidatePaymentsList(qc: QueryClient) {
  for (const key of [...PAYMENTS_LIST_KEYS, ...OVERVIEW_QUERY_KEYS]) qc.invalidateQueries({ queryKey: [key] });
  invalidateDebt(qc); // debt-list, debt-student, debtors (+ promise-month, financial-overview)
}
