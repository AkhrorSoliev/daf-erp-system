"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import { retryDrawer } from "@/components/payments/debt/debt-queries";
import type { KpiOverview, KpiSettings, KpiSettingsPatch, KpiUserView } from "./kpi-types";

export const KPI_SETTINGS_KEY = ["kpi", "settings"] as const;

/** The page in one answer; the branch rides in the key (the server reads `X-Branch-Id`). */
export function useKpiOverview(month: string, compare: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["kpi", "overview", branchId, month, compare],
    queryFn: () => api.get<KpiOverview>("/kpi/overview", { params: { month, compare } }).then((r) => r.data),
    staleTime: 0,
  });
}

/** One person's month; no `month` = the server's current month. A 404 (outside the branch) is an answer, not retried. */
export function useKpiUser(userId: number | null, month?: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["kpi", "user", branchId, userId, month ?? null],
    queryFn: () =>
      api.get<KpiUserView>(`/kpi/users/${userId}`, { params: month ? { month } : undefined }).then((r) => r.data),
    enabled: userId !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

export function useKpiSettings() {
  return useQuery({
    queryKey: KPI_SETTINGS_KEY,
    queryFn: () => api.get<KpiSettings>("/kpi/settings").then((r) => r.data),
  });
}

export async function saveKpiSettings(patch: KpiSettingsPatch): Promise<KpiSettings> {
  return (await api.patch<KpiSettings>("/kpi/settings", patch)).data;
}
