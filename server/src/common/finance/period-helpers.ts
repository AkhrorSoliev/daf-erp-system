/**
 * Shared period + math helpers for the financial statement reports
 * (P&L, Cash Flow, Balance Sheet) and analytics. Centralizes the
 * "default to the current calendar month" rule the dashboard already uses,
 * and the timestamp-vs-date-only column boundary handling.
 */
import { Prisma } from '@prisma/client';

export interface ResolvedPeriod {
  startStr: string; // 'YYYY-MM-DD'
  endStr: string; // 'YYYY-MM-DD'
  start: Date; // midnight of startStr — gte bound for any column
  endTs: Date; // end-of-day of endStr — lte bound for TIMESTAMP columns
  endDate: Date; // midnight of endStr — lte bound for @db.Date columns
}

/** Resolve a [start, end] period, defaulting to the current calendar month. */
export function resolvePeriod(
  startDate?: string,
  endDate?: string,
): ResolvedPeriod {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const startStr =
    startDate ?? `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const endStr =
    endDate ??
    `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return {
    startStr,
    endStr,
    start: new Date(startStr),
    endTs: new Date(endStr + 'T23:59:59.999Z'),
    endDate: new Date(endStr),
  };
}

/**
 * Branch filter shared by all statement queries. A Branch Director's resolved
 * scope (branchIds) takes precedence over an explicit branchId query param —
 * mirrors the existing getDebtWriteOffsSummary behaviour.
 */
export function branchWhere(opts: {
  branchId?: number;
  branchIds?: number[];
}): { branchId?: number | { in: number[] } } {
  if (opts.branchIds && opts.branchIds.length > 0) {
    return { branchId: { in: opts.branchIds } };
  }
  if (opts.branchId) return { branchId: opts.branchId };
  return {};
}

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
