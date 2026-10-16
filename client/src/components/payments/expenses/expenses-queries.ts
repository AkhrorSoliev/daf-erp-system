"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { OVERVIEW_QUERY_KEYS } from "@/components/payments/overview/queries";
import type { ExpensesListResponse, MonthSummary } from "./expenses-types";

type Params = Record<string, string | number>;

/** Both keys start with "expenses": one invalidation refreshes the list and the month card. */
export const EXPENSES_KEYS = {
  all: ["expenses"] as const,
  list: (p: Params) => ["expenses", "list", p] as const,
  monthSummary: (p: Params) => ["expenses", "month-summary", p] as const,
};

/** The table; a filter or page change keeps the old answer on screen (dimmed) until the new one lands. */
export function useExpensesList(params: Params, enabled: boolean) {
  return useQuery({
    queryKey: EXPENSES_KEYS.list(params),
    queryFn: () => api.get<ExpensesListResponse>("/expenses", { params }).then((r) => r.data),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The month card, the warning and the «Kim kiritgan» options; a new month shows the skeleton, never the old month. */
export function useExpensesMonthSummary(params: Params, enabled: boolean) {
  return useQuery({
    queryKey: EXPENSES_KEYS.monthSummary(params),
    queryFn: () => api.get<MonthSummary>("/expenses/month-summary", { params }).then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

/** After every create, edit and delete (spec B6 §6.3): this page, «Foyda» and «Oylar bo'yicha». Never optimistic. */
export function invalidateExpenses(qc: QueryClient): void {
  for (const key of [...EXPENSES_KEYS.all, ...OVERVIEW_QUERY_KEYS]) void qc.invalidateQueries({ queryKey: [key] });
}
