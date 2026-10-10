"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import type { MonthlyResponse, SalaryDetail } from "./salary-types";

export const SALARY_KEYS = {
  monthly: (month: string, search: string) => ["salary-monthly", month, search] as const,
  detail: (userId: number, month: string) => ["salary-detail", userId, month] as const,
};

/**
 * The first element of every query key a salary change touches: the page and
 * the drawer, the settle dialog's preview, the advances tab and the B1 card.
 * The keys are prefixes, so each also reaches its month/branch variants.
 */
const SALARY_INVALIDATED = [
  "salary-monthly",
  "salary-detail",
  "settle-month-preview",
  "salary-advance-calendar",
  "financial-overview",
] as const;

/** `GET /salary/monthly` — teachers, staff, totals, month state and the attention lists. */
export function useSalaryMonthly(month: string, search: string) {
  return useQuery({
    queryKey: SALARY_KEYS.monthly(month, search),
    queryFn: () =>
      api
        .get<MonthlyResponse>("/salary/monthly", {
          params: { month, search: search || undefined },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}

/** `GET /salary/monthly/user/:userId/detail` — the row drawer; idle until a person is picked. */
export function useSalaryDetail(userId: number | null, month: string) {
  return useQuery({
    queryKey: SALARY_KEYS.detail(userId ?? 0, month),
    queryFn: () =>
      api
        .get<SalaryDetail>(`/salary/monthly/user/${userId}/detail`, { params: { month } })
        .then((r) => r.data),
    enabled: userId !== null,
    staleTime: 0,
  });
}

/** Refetch everything a salary write (approve, «Berildi», advance, settle) can change. */
export function useInvalidateSalary(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    await Promise.all(
      SALARY_INVALIDATED.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  }, [queryClient]);
}
