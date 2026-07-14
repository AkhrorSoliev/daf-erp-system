import { prorateFixedMonthly } from './prorate-fixed-monthly';

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
      [{ value: 3_000_000, effectiveFrom: tsh(2026, 6, 16), effectiveTo: null }],
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
