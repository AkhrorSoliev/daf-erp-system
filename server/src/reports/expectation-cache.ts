import { Logger } from '@nestjs/common';
import type { RedisService } from '../redis/redis.service';
import { secondsUntilTashkentMidnight } from './net-profit-cache';

/**
 * Daily cache for the monthly expectation, the same shape as
 * `net-profit-cache`.
 *
 * Safe to hold for a whole Tashkent day because the figure barely moves within
 * one: when a student pays, a lesson crosses from remaining to held and the
 * TOTAL is unchanged. The collection ratio is deliberately NOT cached — that
 * one must react to a payment immediately, or a cashier entering 5 mln sees a
 * frozen number and stops trusting the report.
 *
 * A Redis outage degrades to computing, never to failing.
 */
const logger = new Logger('ExpectationCache');

export function expectationCacheKey(
  companyId: number,
  branchIds: number[] | null,
  monthKey: string,
  asOf?: string,
): string {
  const branch = branchIds === null ? 'all' : branchIds.join('.') || 'none';
  // `asOf` MUST be in the key: a replay and the live figure are different
  // answers for the same month and would otherwise poison each other.
  return `rpt:exp:${companyId}:${branch}:${monthKey}${asOf ? `:${asOf}` : ''}`;
}

export async function cachedExpectation<T>(
  redis: RedisService | undefined,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit !== null && hit !== undefined) return JSON.parse(hit) as T;
    } catch (e) {
      logger.warn(`Cache read failed for ${key}: ${e}`);
    }
  }

  const value = await compute();

  if (redis) {
    try {
      await redis.setex(
        key,
        secondsUntilTashkentMidnight(),
        JSON.stringify(value),
      );
    } catch (e) {
      logger.warn(`Cache write failed for ${key}: ${e}`);
    }
  }

  return value;
}
