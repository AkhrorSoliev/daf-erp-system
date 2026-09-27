import {
  cachedNetProfit,
  netProfitCacheKey,
  secondsUntilTashkentMidnight,
} from './net-profit-cache';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

const at = (branchIds: ReportBranchIds, monthKey = '2026-07') => ({
  companyId: 1001,
  branchIds,
  performedById: 10001,
  monthKey,
});

describe('secondsUntilTashkentMidnight', () => {
  it('expires at the next Tashkent midnight, not the next UTC one', () => {
    // 2026-07-30T19:30Z = 31.07 00:30 Tashkent → ~23.5h of the Tashkent day left.
    const s = secondsUntilTashkentMidnight(
      new Date('2026-07-30T19:30:00.000Z'),
    );
    expect(s).toBeGreaterThan(23 * 3600);
    expect(s).toBeLessThanOrEqual(24 * 3600);
  });

  it('never returns less than a minute', () => {
    // One second before Tashkent midnight.
    const s = secondsUntilTashkentMidnight(
      new Date('2026-07-30T18:59:59.000Z'),
    );
    expect(s).toBeGreaterThanOrEqual(60);
  });
});

describe('netProfitCacheKey', () => {
  it('keeps a multi-branch scope off the company-wide entry', () => {
    expect(netProfitCacheKey(at([3, 7]))).not.toBe(netProfitCacheKey(at(null)));
  });
  it('names the branch set sorted and de-duplicated', () => {
    expect(netProfitCacheKey(at([7, 3, 7]))).toBe(
      'rpt:np:v3:1001:3,7:u10001:2026-07',
    );
  });
  it('separates one branch from a set containing it', () => {
    expect(netProfitCacheKey(at([3]))).not.toBe(netProfitCacheKey(at([3, 7])));
  });
  it('separates callers, whose payroll leg can differ for the same branches', () => {
    expect(netProfitCacheKey({ ...at([3]), performedById: 10002 })).not.toBe(
      netProfitCacheKey(at([3])),
    );
  });
  it('writes company-wide as all and an empty scope as none', () => {
    expect(netProfitCacheKey(at(null))).toBe(
      'rpt:np:v3:1001:all:u10001:2026-07',
    );
    expect(netProfitCacheKey(at([]))).toBe(
      'rpt:np:v3:1001:none:u10001:2026-07',
    );
  });
});

describe('cachedNetProfit', () => {
  it('computes and stores on a miss', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };
    const compute = jest.fn().mockResolvedValue(43_900_000);

    const v = await cachedNetProfit(redis, at(null, '2026-07'), compute);

    expect(v).toBe(43_900_000);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      'rpt:np:v3:1001:all:u10001:2026-07',
      expect.any(Number),
      '43900000',
    );
  });

  it('serves a hit without computing', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue('43900000'),
      setex: jest.fn(),
    };
    const compute = jest.fn();

    const v = await cachedNetProfit(redis, at(null, '2026-07'), compute);

    expect(v).toBe(43_900_000);
    expect(compute).not.toHaveBeenCalled();
  });

  it('recomputes when the stored value is not a number', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue('corrupt'),
      setex: jest.fn().mockResolvedValue('OK'),
    };
    const compute = jest.fn().mockResolvedValue(7);

    await expect(
      cachedNetProfit(redis, at(null, '2026-07'), compute),
    ).resolves.toBe(7);
    expect(compute).toHaveBeenCalled();
  });

  it('a Redis outage degrades to computing, never to failing', async () => {
    const redis: any = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      setex: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const compute = jest.fn().mockResolvedValue(5);

    await expect(cachedNetProfit(redis, at([2]), compute)).resolves.toBe(5);
  });

  it('works with no Redis at all', async () => {
    const compute = jest.fn().mockResolvedValue(5);
    await expect(cachedNetProfit(undefined, at([2]), compute)).resolves.toBe(5);
  });

  it('caches a negative profit rather than treating it as a miss', async () => {
    // A loss-making month must not recompute on every open just because the
    // stored value is falsy.
    const redis: any = {
      get: jest.fn().mockResolvedValue('-8000000'),
      setex: jest.fn(),
    };
    const compute = jest.fn();

    await expect(
      cachedNetProfit(redis, at(null, '2026-06'), compute),
    ).resolves.toBe(-8_000_000);
    expect(compute).not.toHaveBeenCalled();
  });
});
