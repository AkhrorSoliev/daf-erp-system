import { clampMonth } from "@/components/payments/overview/overview-math";
import type { Kesim, Tartib } from "./group-payments-types";

/** The report starts with monthly billing (spec B5 §2.1). */
export const GP_FIRST_MONTH = "2026-09";
export const GP_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys (spec B5 §6.2); defaults are left out of the URL by `useUrlFilters`. */
export const GROUP_PAYMENTS_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  kesim: { type: "string", defaultValue: "guruh" },
  q: { type: "string", defaultValue: "" },
  tartib: { type: "string", defaultValue: "foiz" },
  qarzdor: { type: "string", defaultValue: "" },
  sahifa: { type: "number", defaultValue: 1 },
  soni: { type: "number", defaultValue: 10 },
  guruh: { type: "string", defaultValue: "" },
} as const;

export interface GroupPaymentsFilters {
  oy: string; kesim: string; q: string; tartib: string; qarzdor: string; sahifa: number; soni: number; guruh: string;
}

/** «Tozalash»: the search and «Faqat qarzi borlar»; the month, the cut and the sort stay. */
export const GP_CLEARED: Partial<GroupPaymentsFilters> = { q: "", qarzdor: "", sahifa: 1 };

const KESIMLAR: readonly string[] = ["guruh", "ustoz", "kurs"];
const TARTIBLAR: readonly string[] = ["foiz", "qoldi", "nomi"];

export const cleanKesim = (v: string): Kesim => (KESIMLAR.includes(v) ? (v as Kesim) : "guruh");
export const cleanTartib = (v: string): Tartib => (TARTIBLAR.includes(v) ? (v as Tartib) : "foiz");

/** The page's month: `?oy=` inside [2026-09, the current month]; empty or unreadable is the current month. */
export function pageMonth(oy: string, current: string): string {
  return clampMonth(oy || current, GP_FIRST_MONTH, current);
}

/**
 * Is this the answer for the page's month? A month the user picked (`oy` sent) must match; for the
 * current month (`oy` not sent) the server's own Tashkent month answers, so a settled answer is
 * accepted whatever its month (a device clock on another month never leaves skeletons).
 */
export function isFreshAnswer(answerMonth: string, month: string, oySent: boolean, isPlaceholder: boolean): boolean {
  return answerMonth === month || (!oySent && !isPlaceholder);
}

/**
 * The filters as `GET /reports/group-payments/excel` reads them — the URL's own
 * names. The current month is not sent, so the server's own Tashkent month
 * answers and a request in the first seconds of a month is never «Kelajak oy».
 */
export function excelParams(f: GroupPaymentsFilters, current: string): Record<string, string> {
  const out: Record<string, string> = { kesim: cleanKesim(f.kesim), tartib: cleanTartib(f.tartib) };
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  const q = f.q.trim().slice(0, 100);
  if (q) out.q = q;
  if (f.qarzdor === "1") out.qarzdor = "1";
  return out;
}

/** …plus the page, for `GET /reports/group-payments`. */
export function rowsParams(f: GroupPaymentsFilters, current: string): Record<string, string | number> {
  return {
    ...excelParams(f, current),
    sahifa: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    soni: GP_PAGE_SIZES.includes(f.soni) ? f.soni : 10,
  };
}

export const hasGpFilter = (f: GroupPaymentsFilters): boolean => Boolean(f.q.trim() || f.qarzdor === "1");
export const excelFileName = (month: string): string => `guruhlar-tolovi-${month}.xlsx`;
