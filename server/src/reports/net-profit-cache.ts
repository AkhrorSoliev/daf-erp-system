import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

/**
 * Daily cache for the canonical monthly net profit.
 *
 * The trend chart plots six months. Computing the canonical figure per month on
 * every chart open would fan out to roughly ten times the queries — each
 * `getMonthlyNetProfit` pulls recognised revenue, the monthly salary report, the
 * P&L and period outflows. That cost is why the series was left on the cheap
 * cash basis.
 *
 * A day is the right granularity: these numbers drift slowly. Recognised revenue
 * is keyed by attendance date, so a late payment never moves it; what does move
 * is the covered/gap split, and one refresh a day tracks that closely enough for
 * a six-month trend. So the first request of the Tashkent day pays for the
 * computation and every later one is free.
 *
 * Cache misses NEVER fail the request — a Redis outage just means the caller
 * computes and returns the figure without storing it.
 */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
/**
 * Bump when the canonical figure's DEFINITION changes, so a deploy does not
 * leave the trend chart on yesterday's formula until midnight while the card
 * already shows the new one. v2: monthly-billed September lessons priced at
 * the monthly charge; staff counted in their home branch only. v3: key names
 * the exact branch set and the caller; v2 wrote multi-branch scopes to the
 * company-wide entry.
 */
const NET_PROFIT_CACHE_VERSION = 'v3';
const logger = new Logger('NetProfitCache');

/** Seconds remaining until the next Tashkent midnight (min 60). */
export function secondsUntilTashkentMidnight(now = new Date()): number {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const nextMidnight = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate() + 1,
  );
  const seconds = Math.ceil((nextMidnight - t.getTime()) / 1000);
  return Math.max(60, seconds);
}

export interface NetProfitCacheScope {
  companyId: number;
  branchIds: ReportBranchIds;
  performedById: number;
  monthKey: string;
}

/** `null` → all, `[]` → none, else the ids sorted and de-duplicated. */
export function netProfitScopeSegment(branchIds: ReportBranchIds): string {
  if (branchIds === null) return 'all';
  if (branchIds.length === 0) return 'none';
  return [...new Set(branchIds)].sort((a, b) => a - b).join(',');
}

/**
 * Per (company, branch set, caller, month). The exact set, so a multi-branch
 * scope never shares the company-wide entry. The caller, because the payroll
 * leg is resolved from the caller's own payroll scope (`resolveMonthlyScope`),
 * so two callers asking for the same branches can be owed different figures.
 */
export function netProfitCacheKey(s: NetProfitCacheScope): string {
  return `rpt:np:${NET_PROFIT_CACHE_VERSION}:${s.companyId}:${netProfitScopeSegment(s.branchIds)}:u${s.performedById}:${s.monthKey}`;
}

export async function cachedNetProfit(
  redis: RedisService | undefined,
  scope: NetProfitCacheScope,
  compute: () => Promise<number>,
): Promise<number> {
  const key = netProfitCacheKey(scope);

  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit !== null) {
        const parsed = Number(hit);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch (e) {
      logger.warn(`Cache read failed for ${key}: ${e}`);
    }
  }

  const value = await compute();

  if (redis) {
    try {
      await redis.setex(key, secondsUntilTashkentMidnight(), String(value));
    } catch (e) {
      logger.warn(`Cache write failed for ${key}: ${e}`);
    }
  }

  return value;
}
