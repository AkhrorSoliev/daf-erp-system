import { clampMonth } from "@/components/payments/overview/overview-math";

/** The report starts with the reporting base (spec B7d §2); the server answers 400 before it. */
export const BOT_FIRST_MONTH = "2026-05";
export const BOT_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. The old `?month=` is not read. */
export const BOT_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

export interface BotFilters {
  oy: string;
  page: number;
  pageSize: number;
}

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. `current` is the Tashkent month (`currentMonthKey`), never browser-local. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, BOT_FIRST_MONTH, current);

const cleanPage = (n: number): number => (Number.isInteger(n) && n >= 1 ? n : 1);
const cleanSize = (n: number): number => (BOT_PAGE_SIZES.includes(n) ? n : 10);

/** The filters as `GET /telegram/channel-report/list` reads them; the month is always named. */
export function listParams(f: BotFilters, current: string): { month: string; page: number; pageSize: number } {
  return { month: pageMonth(f.oy, current), page: cleanPage(f.page), pageSize: cleanSize(f.pageSize) };
}
