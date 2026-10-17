import { clampMonth } from "@/components/payments/overview/overview-math";
import { isExpenseCategory, type ExpenseCategoryKey } from "./expenses-labels";

/** The page starts in May 2026 (spec B6 §3.2). */
export const EXPENSES_FIRST_MONTH = "2026-05";
export const EXPENSES_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys (spec B6 §6.2); defaults are left out of the URL by `useUrlFilters`. */
export const EXPENSES_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  q: { type: "string", defaultValue: "" },
  turkum: { type: "array", defaultValue: [] as string[] },
  usul: { type: "string", defaultValue: "" },
  kim: { type: "array", defaultValue: [] as string[] },
  sahifa: { type: "number", defaultValue: 1 },
  soni: { type: "number", defaultValue: 10 },
} as const;

export interface ExpensesFilters { oy: string; q: string; turkum: string[]; usul: string; kim: string[]; sahifa: number; soni: number }

/** «Tozalash»: every filter, never the month. */
export const EXPENSES_CLEARED: Partial<ExpensesFilters> = { q: "", turkum: [], usul: "", kim: [], sahifa: 1 };

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, EXPENSES_FIRST_MONTH, current);

export const cleanTurkum = (v: readonly string[]): ExpenseCategoryKey[] => v.filter(isExpenseCategory);
export const cleanUsul = (v: string): "naqd" | "karta" | "" => (v === "naqd" || v === "karta" ? v : "");
export const cleanKim = (v: readonly string[]): string[] => v.filter((x) => /^\d+$/.test(x));

/**
 * `GET /expenses/month-summary`: the header's branch and the month. The
 * current month is not sent, so the server's own Tashkent month answers.
 */
export function summaryParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (branchId) out.branchId = branchId;
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  return out;
}

/** The list's filters under the server's names (`q→search`, `turkum→category`, `usul→paymentMethod`, `kim→createdById`), no page — `GET /expenses/pdf`. */
export function pdfParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  const out = summaryParams(f, current, branchId);
  const q = f.q.trim().slice(0, 100);
  if (q) out.search = q;
  const turkum = cleanTurkum(f.turkum);
  if (turkum.length) out.category = turkum.join(",");
  const usul = cleanUsul(f.usul);
  if (usul) out.paymentMethod = usul === "naqd" ? "CASH" : "CARD";
  const kim = cleanKim(f.kim);
  if (kim.length) out.createdById = kim.join(",");
  return out;
}

/** …plus the page, for `GET /expenses`. */
export function listParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  return {
    ...pdfParams(f, current, branchId),
    page: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    pageSize: EXPENSES_PAGE_SIZES.includes(f.soni) ? f.soni : 10,
  };
}

export const hasExpenseFilter = (f: ExpensesFilters): boolean =>
  Boolean(f.q.trim() || cleanTurkum(f.turkum).length || cleanUsul(f.usul) || cleanKim(f.kim).length);
export const pdfFileName = (month: string): string => `xarajatlar-${month}.pdf`;
