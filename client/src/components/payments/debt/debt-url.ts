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

export const readDebtFilters = (search: string) => readFilters(DEBT_LIST_SCHEMA, new URLSearchParams(search)) as unknown as DebtFilters;

export const activeTab = (f: Pick<DebtFilters, "tab">): DebtTab =>
  (DEBT_TABS as readonly string[]).includes(f.tab) ? (f.tab as DebtTab) : "shu-oy";

/** Any list filter set — sort and paging are not filters (spec §2.4 «Topildi»). */
export const hasDebtFilter = (f: DebtFilters) => Boolean(f.search || f.kind || f.groupIds.length || f.teacherIds.length || f.promise);

/** `GET /payments/debt/list` / `excel` query: the URL's own names. */
export function debtListParams(f: DebtFilters) {
  const tab = activeTab(f);
  return {
    tab, search: f.search || undefined, kind: tab === "chiqqan" && f.kind ? f.kind : undefined,
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
