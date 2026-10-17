import { clampMonth } from "@/components/payments/overview/overview-math";

/** The report starts with the reporting base (spec B7b §2). */
export const CA_FIRST_MONTH = "2026-05";
export const CA_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys; defaults are left out of the URL by `useUrlFilters`. */
export const CENTER_ACTIVITY_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  filial: { type: "number", defaultValue: 0 },
} as const;

export interface CenterActivityFilters {
  oy: string;
  filial: number;
}

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. `current` is the Tashkent month (`currentMonthKey`), never browser-local. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, CA_FIRST_MONTH, current);

/**
 * The server's parameters: the current month and «no branch picked» are not sent.
 * `filial` only picks the branch drawn in the heat matrix; cards and tables cover the whole scope.
 */
export function overviewParams(f: CenterActivityFilters, current: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  if (f.filial > 0) out.filial = f.filial;
  return out;
}

export const excelParams = overviewParams;
export const excelFileName = (month: string): string => `markaz-faoliyati-${month}.xlsx`;
