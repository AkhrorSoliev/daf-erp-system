"use client";

import { createContext, use, type ReactNode } from "react";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { currentMonthKey } from "../salary-utils";

/**
 * Every filter the debt page owns, in one schema.
 *
 * They live in the URL because a debt list is something people send each other
 * ("look at the overdue ones in Fargona"), and because a reload in the middle
 * of a call must not throw the operator back to page 1 of everything. Defaults
 * are omitted from the URL, so a clean page has a clean address.
 */
export const DEBT_FILTER_SCHEMA = {
  /** Which view. Omitted from the URL while it is the default. */
  tab: { type: "string", defaultValue: "qarzdorlar" },
  search: { type: "string", defaultValue: "" },
  sort: { type: "string", defaultValue: "debt_high" },
  promise: { type: "string", defaultValue: "all" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
  /** Center top-up view only — that figure is month-scoped, the list is not. */
  month: { type: "string", defaultValue: "" },
} as const;

type DebtFilters = ReturnType<typeof useUrlFilters<typeof DEBT_FILTER_SCHEMA>>;

const DebtFiltersContext = createContext<DebtFilters | null>(null);

/**
 * Holds the page's filter state so the views do not each own a copy.
 *
 * The alternative — passing `search`, `sort`, `page`, `onSearchChange`… down
 * through every view — is how a page like this grows a dozen props per child
 * and starts disagreeing with itself when one of them is forgotten. The
 * provider is the only place that knows the state is kept in the URL; a view
 * asks for `filters` and `setFilters` and does not care where they live.
 */
export function DebtFiltersProvider({ children }: { children: ReactNode }) {
  const value = useUrlFilters(DEBT_FILTER_SCHEMA);
  return <DebtFiltersContext value={value}>{children}</DebtFiltersContext>;
}

export function useDebtFilters() {
  const ctx = use(DebtFiltersContext);
  if (!ctx)
    throw new Error("useDebtFilters faqat DebtFiltersProvider ichida ishlaydi");
  return ctx;
}

/** The selected month, defaulting to the current one when the URL is silent. */
export function useSelectedMonth() {
  const { filters } = useDebtFilters();
  return filters.month || currentMonthKey();
}
