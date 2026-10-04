import { listParam } from "@/hooks/use-url-filters";
import { readFilters } from "@/lib/url-filter-params";
import { DEBT_TABS, type DebtTab } from "./debt-types";

/** The debt page's URL (spec §2.4). Kind, promise and sort use the API's own values, so the request is the URL. */
export const DEBT_LIST_SCHEMA = {
  tab: { type: "string", defaultValue: "shu-oy" },
  search: { type: "string", defaultValue: "" },
  kind: { type: "string", defaultValue: "" },
  groupIds: { type: "array", defaultValue: [] as string[] },
  teacherIds: { type: "array", defaultValue: [] as string[] },
  promise: { type: "string", defaultValue: "" },
  sort: { type: "string", defaultValue: "debt" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 20 },
} as const;

export interface DebtFilters {
  tab: string; search: string; kind: string; groupIds: string[]; teacherIds: string[];
  promise: string; sort: string; page: number; pageSize: number;
}

export const activeTab = (f: Pick<DebtFilters, "tab">): DebtTab =>
  (DEBT_TABS as readonly string[]).includes(f.tab) ? (f.tab as DebtTab) : "shu-oy";

// The server's own lists (`dto/debt-list-query.dto.ts`); PAGE_SIZES are the pager's choices.
const KINDS = ["ungrouped", "frozen", "left"];
const PROMISES = ["open", "broken", "none"];
const SORTS = ["debt", "oldest", "broken", "name"];
const PAGE_SIZES = [10, 20, 30, 40, 50];
const oneOf = (v: string, allowed: string[], fallback: string) => (allowed.includes(v) ? v : fallback);

/**
 * The URL with every value the server would refuse replaced by its default, so
 * an old bookmark (`?sort=debt_low`, `?page=0`) opens the list instead of a 400.
 */
export function cleanDebtFilters(f: DebtFilters): DebtFilters {
  const tab = activeTab(f);
  return {
    tab,
    search: f.search.slice(0, 100),
    kind: tab === "chiqqan" ? oneOf(f.kind, KINDS, "") : "",
    groupIds: f.groupIds,
    teacherIds: f.teacherIds.filter((id) => /^\d+$/.test(id)),
    promise: oneOf(f.promise, PROMISES, ""),
    sort: oneOf(f.sort, SORTS, "debt"),
    page: Number.isInteger(f.page) && f.page >= 1 ? f.page : 1,
    pageSize: PAGE_SIZES.includes(f.pageSize) ? f.pageSize : 20,
  };
}

export const readDebtFilters = (search: string) =>
  cleanDebtFilters(readFilters(DEBT_LIST_SCHEMA, new URLSearchParams(search)) as unknown as DebtFilters);

/** Any list filter set — sort and paging are not filters (spec §2.4 «Topildi»); kind counts only in O'qimayotganlar. */
export function hasDebtFilter(filters: DebtFilters) {
  const f = cleanDebtFilters(filters);
  return Boolean(f.search || f.kind || f.groupIds.length || f.teacherIds.length || f.promise);
}

/** `GET /payments/debt/list` / `excel` query: the URL's own names. */
export function debtListParams(filters: DebtFilters) {
  const f = cleanDebtFilters(filters);
  return {
    tab: f.tab as DebtTab, search: f.search || undefined, kind: f.kind || undefined,
    groupIds: listParam(f.groupIds), teacherIds: listParam(f.teacherIds), promise: f.promise || undefined,
    sort: f.sort, page: f.page, pageSize: f.pageSize,
  };
}

/** The old page's links (spec §2.6): its tabs moved out, its promise filter got new values. Null for a new URL. */
export function legacyDebtRedirect(sp: Record<string, string | string[] | undefined>): string | null {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tab = one("tab");
  if (tab === "oylik") return "/payments/debt-history";
  if (tab === "kechirilgan") return "/payments/debt-write-offs";
  if (tab === "muzlatilgan") return "/payments/frozen-balances";
  if (tab === "markaz") {
    const month = one("month");
    return `/payments/salary?tab=markaz${month ? `&month=${encodeURIComponent(month)}` : ""}`;
  }
  const old = (one("promise") ?? "").split(",");
  const promise = old.includes("overdue") ? "broken" : old.includes("has_open") ? "open" : null;
  if (tab !== "qarzdorlar" && !promise) return null;
  const q = new URLSearchParams();
  const search = one("search");
  if (search) q.set("search", search);
  if (promise) q.set("promise", promise);
  const qs = q.toString();
  return `/payments/debt${qs ? `?${qs}` : ""}`;
}
