"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import { retryDrawer } from "@/components/payments/debt/debt-queries";
import type { GpGroupResponse, GpRowsResponse } from "./group-payments-types";

/** The card and the table in one answer; a filter or page change keeps the old answer on screen until the new one lands. The branch rides in the key (the server reads `X-Branch-Id`). */
export function useGroupPaymentsRows(params: Record<string, string | number>) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["group-payments-rows", branchId, params],
    queryFn: () => api.get<GpRowsResponse>("/reports/group-payments", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** One group for the drawer; `oy` is left out for the current month. A 404 is an answer, not retried. */
export function useGroupPaymentsGroup(groupId: string | null, oy: string | undefined) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["group-payments-group", branchId, groupId, oy ?? null],
    queryFn: () =>
      api
        .get<GpGroupResponse>(`/reports/group-payments/groups/${encodeURIComponent(groupId ?? "")}`, { params: oy ? { oy } : undefined })
        .then((r) => r.data),
    enabled: groupId !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}
