"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { invalidateExpenses } from "@/components/payments/expenses/expenses-queries";
import type { BankFeesBody, MonthCloseView } from "./month-close-types";

export const MONTH_CLOSE_KEY = (month: string) => ["month-close", month] as const;

/** One month's picture, bank fee rows and checklist. Money: fetched again on every visit. */
export function useMonthClose(month: string, enabled: boolean) {
  return useQuery({
    queryKey: MONTH_CLOSE_KEY(month),
    queryFn: () => api.get<MonthCloseView>(`/month-close/${month}`).then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

/** Saves the bank fee of each filled account; never optimistic: the page shows the server's answer after the refetch. */
export function useSaveBankFees(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BankFeesBody) => api.put<MonthCloseView>(`/month-close/${month}/bank-fees`, body).then((r) => r.data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: MONTH_CLOSE_KEY(month) });
      // The expenses page and «Foyda» / «Oylar bo'yicha» show the new «Bank xizmati» row.
      invalidateExpenses(qc);
    },
  });
}
