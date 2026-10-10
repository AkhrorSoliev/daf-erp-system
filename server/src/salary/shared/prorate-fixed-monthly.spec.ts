import {
  fixedMonthlyCoverage,
  prorateFixedMonthly,
} from './prorate-fixed-monthly';

/** Tashkent-midnight instant of a calendar date (UTC+5, no DST). */
const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

// June 2026 payroll period (cycleStartDay=1 → the calendar month, 30 days).
const periodStart = tsh(2026, 6, 1);
const periodEnd = new Date(tsh(2026, 7, 1).getTime() - 1); // last ms of Jun 30

describe('prorateFixedMonthly', () => {
  it('pays the full value for a version spanning the whole period', () => {
    const amount = prorateFixedMonthly(
      [{ value: 3_000_000, effectiveFrom: tsh(2026, 5, 1), effectiveTo: null }],
      periodStart,
      periodEnd,
    );
    expect(amount).toBe(3_000_000); // 30/30 days
  });

  it('prorates a mid-cycle hire by active days (effectiveFrom inside)', () => {
    // Hired on the 16th → June 16..30 = 15 of 30 days.
    const amount = prorateFixedMonthly(
      [
        {
          value: 3_000_000,
          effectiveFrom: tsh(2026, 6, 16),
          effectiveTo: null,
        },
      ],
      periodStart,
      periodEnd,
    );
    expect(amount).toBe(1_500_000);
  });

  it('prorates a mid-cycle leave by active days (effectiveTo inside)', () => {
    // Left on the 16th (exclusive) → June 1..15 = 15 of 30 days.
    const amount = prorateFixedMonthly(
      [
        {
          value: 3_000_000,
          effectiveFrom: tsh(2026, 5, 1),
          effectiveTo: tsh(2026, 6, 16),
        },
      ],
      periodStart,
      periodEnd,
    );
    expect(amount).toBe(1_500_000);
  });

  it('sums per-version over a mid-cycle rate change without double-counting the boundary day', () => {
    const amount = prorateFixedMonthly(
      [
        {
          value: 3_000_000,
          effectiveFrom: tsh(2026, 5, 1),
          effectiveTo: tsh(2026, 6, 16), // active Jun 1..15 (15 days) → 1_500_000
        },
        {
          value: 6_000_000,
          effectiveFrom: tsh(2026, 6, 16),
          effectiveTo: null, // active Jun 16..30 (15 days) → 3_000_000
        },
      ],
      periodStart,
      periodEnd,
    );
    expect(amount).toBe(4_500_000);
  });

  it('returns 0 for a version that does not overlap the period', () => {
    const after = prorateFixedMonthly(
      [{ value: 3_000_000, effectiveFrom: tsh(2026, 7, 1), effectiveTo: null }],
      periodStart,
      periodEnd,
    );
    const before = prorateFixedMonthly(
      [
        {
          value: 3_000_000,
          effectiveFrom: tsh(2026, 4, 1),
          effectiveTo: tsh(2026, 6, 1), // ends exactly at period start (exclusive)
        },
      ],
      periodStart,
      periodEnd,
    );
    expect(after).toBe(0);
    expect(before).toBe(0);
  });

  it('returns 0 for no versions', () => {
    expect(prorateFixedMonthly([], periodStart, periodEnd)).toBe(0);
  });
});

describe('fixedMonthlyCoverage', () => {
  // September 2026: 30 days.
  const sepStart = tsh(2026, 9, 1);
  const sepEnd = new Date(tsh(2026, 10, 1).getTime() - 1);

  it('counts the days a version started mid-month is active (open-ended)', () => {
    expect(
      fixedMonthlyCoverage(
        [
          {
            value: 3_000_000,
            effectiveFrom: new Date('2026-09-07T19:00:00Z'), // 8 Sep, Tashkent midnight
            effectiveTo: null,
          },
        ],
        sepStart,
        sepEnd,
      ),
    ).toEqual({ activeDays: 23, cycleDays: 30 });
  });

  it('is the whole month for a full-month version', () => {
    expect(
      fixedMonthlyCoverage(
        [
          {
            value: 3_000_000,
            effectiveFrom: tsh(2026, 5, 1),
            effectiveTo: null,
          },
        ],
        sepStart,
        sepEnd,
      ),
    ).toEqual({ activeDays: 30, cycleDays: 30 });
  });

  it('adds two back-to-back versions without counting the boundary day twice', () => {
    expect(
      fixedMonthlyCoverage(
        [
          {
            value: 3_000_000,
            effectiveFrom: tsh(2026, 5, 1),
            effectiveTo: tsh(2026, 9, 16),
          },
          {
            value: 6_000_000,
            effectiveFrom: tsh(2026, 9, 16),
            effectiveTo: null,
          },
        ],
        sepStart,
        sepEnd,
      ),
    ).toEqual({ activeDays: 30, cycleDays: 30 });
  });

  it('is 0 active days for no versions or a version outside the month', () => {
    expect(fixedMonthlyCoverage([], sepStart, sepEnd)).toEqual({
      activeDays: 0,
      cycleDays: 30,
    });
    expect(
      fixedMonthlyCoverage(
        [
          {
            value: 3_000_000,
            effectiveFrom: tsh(2026, 10, 1),
            effectiveTo: null,
          },
        ],
        sepStart,
        sepEnd,
      ),
    ).toEqual({ activeDays: 0, cycleDays: 30 });
  });

  it('caps overlapping versions at the month length', () => {
    expect(
      fixedMonthlyCoverage(
        [
          { value: 1, effectiveFrom: tsh(2026, 5, 1), effectiveTo: null },
          { value: 2, effectiveFrom: tsh(2026, 5, 1), effectiveTo: null },
        ],
        sepStart,
        sepEnd,
      ),
    ).toEqual({ activeDays: 30, cycleDays: 30 });
  });
});
