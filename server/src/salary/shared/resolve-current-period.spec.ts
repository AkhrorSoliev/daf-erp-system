import {
  computePeriodBounds,
  resolveCompletedPeriod,
} from './resolve-current-period';

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

describe('resolveCompletedPeriod (payroll settles the period that just ended)', () => {
  const tashkentDate = (
    year: number,
    month: number,
    day: number,
    hour = 12,
  ): Date => new Date(Date.UTC(year, month - 1, day, hour - 5, 0, 0));

  // null setting → default cycleStartDay (8).
  const mkPrisma = (cycleStartDay: number | null = null): any => ({
    salaryPeriodSetting: {
      findFirst: jest
        .fn()
        .mockResolvedValue(cycleStartDay === null ? null : { cycleStartDay }),
    },
  });

  it('on the cycleStartDay (cron day) settles the period that just CLOSED, not the new one', async () => {
    // June 8, cycleStartDay=8 → current period is [Jun 8 → Jul 7] (just
    // starting). Payroll must settle the previous, completed [May 8 → Jun 7].
    const now = tashkentDate(2026, 6, 8, 2);
    const { periodStart, periodEnd } = await resolveCompletedPeriod(
      mkPrisma(),
      1,
      now,
    );
    expect(periodStart.toISOString()).toBe('2026-05-07T19:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-06-07T18:59:59.999Z');
  });

  it('mid-cycle (e.g. day 20) also settles the last completed period', async () => {
    const now = tashkentDate(2026, 6, 20, 10);
    const { periodStart, periodEnd } = await resolveCompletedPeriod(
      mkPrisma(),
      1,
      now,
    );
    expect(periodStart.toISOString()).toBe('2026-05-07T19:00:00.000Z');
    expect(periodEnd.toISOString()).toBe('2026-06-07T18:59:59.999Z');
  });

  it('respects a custom cycleStartDay (5th → pays on the 5th for the prior cycle)', async () => {
    // cycleStartDay=5, now = Jun 5 (payday). Completed cycle = [May 5 → Jun 4].
    const now = tashkentDate(2026, 6, 5, 2);
    const { periodStart, periodEnd } = await resolveCompletedPeriod(
      mkPrisma(5),
      1,
      now,
    );
    expect(periodStart.toISOString()).toBe('2026-05-04T19:00:00.000Z'); // May 5 00:00 Tashkent
    expect(periodEnd.toISOString()).toBe('2026-06-04T18:59:59.999Z'); // Jun 5 00:00 Tashkent − 1ms
  });
});

/**
 * The boundary day must belong to exactly ONE period.
 *
 * `SalaryAccrual.lessonDate` and `Attendance.date` are `@db.Date`. Postgres
 * compares a date column against a timestamp by truncating the timestamp to its
 * UTC calendar date — so the Tashkent-shifted start of July (2026-06-30T19:00Z)
 * truncated to **2026-06-30** and `lessonDate >= periodStart` quietly swept the
 * last day of June into July. Measured on production: 30.06 appeared in both
 * the June and July windows, inflating July's salary figure by 1 819 343 so'm
 * and carrying that error into the Foyda card, the Excel «Sof foyda» sheet and
 * the Telegram daily report.
 */
describe('computePeriodBounds — @db.Date bounds do not overlap', () => {
  const CYCLE_START_DAY_1 = 1;

  const june = computePeriodBounds(
    new Date('2026-06-15T00:00:00.000Z'),
    CYCLE_START_DAY_1,
  );
  const july = computePeriodBounds(
    new Date('2026-07-15T00:00:00.000Z'),
    CYCLE_START_DAY_1,
  );

  it('gives date columns unshifted calendar bounds', () => {
    expect(july.periodStartDate.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(july.periodEndDateExclusive.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
  });

  it('keeps the timestamp pair Tashkent-shifted (unchanged behaviour)', () => {
    expect(july.periodStart.toISOString()).toBe('2026-06-30T19:00:00.000Z');
  });

  it('June ends exactly where July begins — no gap, no overlap', () => {
    expect(june.periodEndDateExclusive.getTime()).toBe(
      july.periodStartDate.getTime(),
    );
  });

  it('30.06 falls in June only, never in July', () => {
    const boundaryDay = new Date('2026-06-30T00:00:00.000Z');

    const inJune =
      boundaryDay >= june.periodStartDate &&
      boundaryDay < june.periodEndDateExclusive;
    const inJuly =
      boundaryDay >= july.periodStartDate &&
      boundaryDay < july.periodEndDateExclusive;

    expect(inJune).toBe(true);
    expect(inJuly).toBe(false);
  });

  it('the old shifted bounds WOULD have double-counted it — regression anchor', () => {
    // Documents the exact defect: with the timestamp bounds, 30.06 satisfies
    // both windows once Postgres truncates them to dates.
    const truncate = (d: Date) =>
      new Date(d.toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const boundaryDay = new Date('2026-06-30T00:00:00.000Z');

    expect(truncate(july.periodStart).getTime()).toBe(boundaryDay.getTime());
    expect(boundaryDay >= truncate(june.periodStart)).toBe(true);
  });

  it('holds for a mid-month cycle start day too', () => {
    const a = computePeriodBounds(new Date('2026-06-20T00:00:00.000Z'), 8);
    const b = computePeriodBounds(new Date('2026-07-20T00:00:00.000Z'), 8);
    expect(a.periodStartDate.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(a.periodEndDateExclusive.getTime()).toBe(b.periodStartDate.getTime());
  });
});

