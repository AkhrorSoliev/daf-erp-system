import { computePeriodBounds } from './resolve-current-period';

describe('computePeriodBounds (Asia/Tashkent +05:00)', () => {
  // Helper: build a UTC date that represents the given Tashkent wall-clock.
  // Tashkent is UTC+5, so 2026-04-15 10:00 Tashkent = 2026-04-15 05:00 UTC.
  const tashkentDate = (
    year: number,
    month: number,
    day: number,
    hour = 12,
  ): Date => new Date(Date.UTC(year, month - 1, day, hour - 5, 0, 0));

  describe('cycleStartDay = 8', () => {
    it('on day 8 returns [day 8, day 8 next month - 1ms] (start of new period)', () => {
      // April 8 12:00 Tashkent — exactly the cycle start
      const now = tashkentDate(2026, 4, 8, 12);
      const { periodStart, periodEnd } = computePeriodBounds(now, 8);
      // periodStart = April 8 00:00 Tashkent = April 7 19:00 UTC
      expect(periodStart.toISOString()).toBe('2026-04-07T19:00:00.000Z');
      // periodEnd = May 8 00:00 Tashkent - 1ms = May 7 18:59:59.999 UTC
      expect(periodEnd.toISOString()).toBe('2026-05-07T18:59:59.999Z');
    });

    it('on day 15 returns [previous day 8, current day 8 - 1ms]', () => {
      const now = tashkentDate(2026, 4, 15, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 8);
      expect(periodStart.toISOString()).toBe('2026-04-07T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-05-07T18:59:59.999Z');
    });

    it('on day 7 returns previous-month period [March 8, April 8 - 1ms]', () => {
      const now = tashkentDate(2026, 4, 7, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 8);
      expect(periodStart.toISOString()).toBe('2026-03-07T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-04-07T18:59:59.999Z');
    });
  });

  describe('cycleStartDay = 1', () => {
    it('on day 1 returns [day 1 this month, day 1 next month - 1ms]', () => {
      const now = tashkentDate(2026, 4, 1, 12);
      const { periodStart, periodEnd } = computePeriodBounds(now, 1);
      expect(periodStart.toISOString()).toBe('2026-03-31T19:00:00.000Z'); // April 1 00:00 Tashkent
      expect(periodEnd.toISOString()).toBe('2026-04-30T18:59:59.999Z'); // May 1 00:00 Tashkent - 1ms
    });

    it('on day 25 stays in this month period', () => {
      const now = tashkentDate(2026, 4, 25, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 1);
      expect(periodStart.toISOString()).toBe('2026-03-31T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-04-30T18:59:59.999Z');
    });
  });

  describe('cycleStartDay = 15 (mid-month cycles)', () => {
    it('on day 20 covers [day 15 this month, day 15 next month - 1ms]', () => {
      const now = tashkentDate(2026, 4, 20, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 15);
      expect(periodStart.toISOString()).toBe('2026-04-14T19:00:00.000Z'); // April 15 00:00 Tashkent
      expect(periodEnd.toISOString()).toBe('2026-05-14T18:59:59.999Z'); // May 15 00:00 Tashkent - 1ms
    });

    it('on day 10 falls back to previous month period', () => {
      const now = tashkentDate(2026, 4, 10, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 15);
      expect(periodStart.toISOString()).toBe('2026-03-14T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-04-14T18:59:59.999Z');
    });
  });

  describe('year boundary', () => {
    it('January 5 with cycleStartDay=8 → December 8 prev year period', () => {
      const now = tashkentDate(2026, 1, 5, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 8);
      expect(periodStart.toISOString()).toBe('2025-12-07T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2026-01-07T18:59:59.999Z');
    });

    it('December 20 with cycleStartDay=8 → December 8 to January 8', () => {
      const now = tashkentDate(2026, 12, 20, 10);
      const { periodStart, periodEnd } = computePeriodBounds(now, 8);
      expect(periodStart.toISOString()).toBe('2026-12-07T19:00:00.000Z');
      expect(periodEnd.toISOString()).toBe('2027-01-07T18:59:59.999Z');
    });
  });
});
