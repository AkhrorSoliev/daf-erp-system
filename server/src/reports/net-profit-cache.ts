import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';

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

/**
 * Key is per (company, branch, month) rather than per requested range, so
 * overlapping ranges reuse the same entries and a branch-filtered view never
 * reads the company-wide figure.
 */
export function netProfitCacheKey(
  companyId: number,
  branchId: number | undefined,
  monthKey: string,
): string {
  return `rpt:np:${companyId}:${branchId ?? 'all'}:${monthKey}`;
}

export async function cachedNetProfit(
  redis: RedisService | undefined,
  companyId: number,
  branchId: number | undefined,
  monthKey: string,
  compute: () => Promise<number>,
): Promise<number> {
  const key = netProfitCacheKey(companyId, branchId, monthKey);

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
