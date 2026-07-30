import {
  cachedNetProfit,
  netProfitCacheKey,
  secondsUntilTashkentMidnight,
} from './net-profit-cache';

describe('secondsUntilTashkentMidnight', () => {
  it('expires at the next Tashkent midnight, not the next UTC one', () => {
    // 2026-07-30T19:30Z = 31.07 00:30 Tashkent → ~23.5h of the Tashkent day left.
    const s = secondsUntilTashkentMidnight(new Date('2026-07-30T19:30:00.000Z'));
    expect(s).toBeGreaterThan(23 * 3600);
    expect(s).toBeLessThanOrEqual(24 * 3600);
  });

  it('never returns less than a minute', () => {
    // One second before Tashkent midnight.
    const s = secondsUntilTashkentMidnight(new Date('2026-07-30T18:59:59.000Z'));
    expect(s).toBeGreaterThanOrEqual(60);
  });
});

describe('netProfitCacheKey', () => {
  it('separates branches so a filtered view never reads the company figure', () => {
    expect(netProfitCacheKey(1001, 2, '2026-07')).not.toBe(
      netProfitCacheKey(1001, undefined, '2026-07'),
    );
  });

  it('is per month, so overlapping ranges reuse entries', () => {
    expect(netProfitCacheKey(1001, undefined, '2026-07')).toBe(
      'rpt:np:1001:all:2026-07',
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

    const v = await cachedNetProfit(redis, 1001, undefined, '2026-07', compute);

    expect(v).toBe(43_900_000);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.setex).toHaveBeenCalledWith(
      'rpt:np:1001:all:2026-07',
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

    const v = await cachedNetProfit(redis, 1001, undefined, '2026-07', compute);

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
      cachedNetProfit(redis, 1001, undefined, '2026-07', compute),
    ).resolves.toBe(7);
    expect(compute).toHaveBeenCalled();
  });

  it('a Redis outage degrades to computing, never to failing', async () => {
    const redis: any = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      setex: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const compute = jest.fn().mockResolvedValue(5);

    await expect(
      cachedNetProfit(redis, 1001, 2, '2026-07', compute),
    ).resolves.toBe(5);
  });

  it('works with no Redis at all', async () => {
    const compute = jest.fn().mockResolvedValue(5);
    await expect(
      cachedNetProfit(undefined, 1001, 2, '2026-07', compute),
    ).resolves.toBe(5);
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
      cachedNetProfit(redis, 1001, undefined, '2026-06', compute),
    ).resolves.toBe(-8_000_000);
    expect(compute).not.toHaveBeenCalled();
  });
});
