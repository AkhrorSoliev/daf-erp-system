/**
 * Shared period + math helpers for the financial statement reports
 * (P&L, Cash Flow, Balance Sheet) and analytics. Centralizes the
 * "default to the current calendar month" rule the dashboard already uses,
 * and the timestamp-vs-date-only column boundary handling.
 */
import { Prisma } from '@prisma/client';
import { tashkentRangeUtc, utcMidnightFromDateStr } from '../date/tashkent';

export interface ResolvedPeriod {
  startStr: string; // 'YYYY-MM-DD'
  endStr: string; // 'YYYY-MM-DD'
  /** 00:00 Tashkent of startStr — `gte` bound for TIMESTAMP columns. */
  start: Date;
  /** Last ms before 00:00 Tashkent of the day after endStr — `lte` for TIMESTAMP columns. */
  endTs: Date;
  /** Plain UTC midnight of startStr — `gte` bound for `@db.Date` columns. */
  startDate: Date;
  /** Plain UTC midnight of endStr — `lte` bound for `@db.Date` columns. */
  endDate: Date;
}

/** Resolve a [start, end] period, defaulting to the current calendar month. */
export function resolvePeriod(
  startDate?: string,
  endDate?: string,
): ResolvedPeriod {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startStr = startDate ?? `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const endStr =
    endDate ??
    `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Two pairs, because the column type decides the bound (see common/date/tashkent).
  const { gte, lt } = tashkentRangeUtc(startStr, endStr);
  return {
    startStr,
    endStr,
    start: gte,
    endTs: new Date(lt.getTime() - 1),
    startDate: utcMidnightFromDateStr(startStr),
    endDate: utcMidnightFromDateStr(endStr),
  };
}

/**
 * `branchWhere` used to live here. It took BOTH a `branchId` and a `branchIds`
 * and let the list win, so the branch a user picked in the switcher was
 * discarded in favour of their whole scope — and any query that happened to
 * read the other field disagreed with it. Use
 * `common/finance/report-branch-scope.ts` instead: resolve ONE scope at the
 * HTTP boundary (`resolveCallerReportBranchIds`) and pass it down.
 */

/** Whole-number percentage; 0 when the denominator is 0. */
export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Signed period-over-period growth percentage (1 decimal). */
export function growthPct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// Re-export Prisma so statement services share one import site if needed.
export type { Prisma };
