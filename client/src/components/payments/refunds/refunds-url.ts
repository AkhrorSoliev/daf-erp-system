import { readFilters } from "@/lib/url-filter-params";
import { cleanSearch } from "../debt/debt-url";
import { AGE_BUCKETS, REFUNDABLE_TABS, type AgeBucket, type RefundableTab } from "./refunds-types";

/** The page's URL (spec §3.3–3.4): the API's own query names, so the request is the URL. */
export const REFUNDS_SCHEMA = {
  tab: { type: "string", defaultValue: "muzlatilgan" },
  age: { type: "string", defaultValue: "" },
  search: { type: "string", defaultValue: "" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 20 },
  pendingPage: { type: "number", defaultValue: 1 },
  pendingPageSize: { type: "number", defaultValue: 10 },
} as const;

export interface RefundsFilters {
  tab: string; age: string; search: string;
  page: number; pageSize: number; pendingPage: number; pendingPageSize: number;
}

/** `/payments/refunds/history` — page size 10 by default (the table rule). */
export const HISTORY_SCHEMA = {
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

const PAGE_SIZES = [10, 20, 30, 40, 50];
const pageOf = (n: number) => (Number.isInteger(n) && n >= 1 ? n : 1);
const sizeOf = (n: number, fallback: number) => (PAGE_SIZES.includes(n) ? n : fallback);

export const refundsTab = (f: Pick<RefundsFilters, "tab">): RefundableTab =>
  (REFUNDABLE_TABS as readonly string[]).includes(f.tab) ? (f.tab as RefundableTab) : "muzlatilgan";

/** Every value the server would refuse replaced by its default: an old bookmark opens the list, never a 400. The age chip lives only on Muzlatilganlar. */
export function cleanRefundsFilters(f: RefundsFilters): RefundsFilters {
  const tab = refundsTab(f);
  return {
    tab,
    age: tab === "muzlatilgan" && (AGE_BUCKETS as readonly string[]).includes(f.age) ? f.age : "",
    search: cleanSearch(f.search),
    page: pageOf(f.page),
    pageSize: sizeOf(f.pageSize, 20),
    pendingPage: pageOf(f.pendingPage),
    pendingPageSize: sizeOf(f.pendingPageSize, 10),
  };
}

export const readRefundsFilters = (search: string) =>
  cleanRefundsFilters(readFilters(REFUNDS_SCHEMA, new URLSearchParams(search)) as unknown as RefundsFilters);

/** `GET /refundable/list` query. */
export function refundableListParams(filters: RefundsFilters) {
  const f = cleanRefundsFilters(filters);
  return {
    tab: f.tab as RefundableTab,
    age: (f.age || undefined) as AgeBucket | undefined,
    search: f.search || undefined,
    page: f.page, pageSize: f.pageSize, pendingPage: f.pendingPage, pendingPageSize: f.pendingPageSize,
  };
}

export const cleanHistoryPage = (page: number, pageSize: number) => ({ page: pageOf(page), pageSize: sizeOf(pageSize, 10) });
