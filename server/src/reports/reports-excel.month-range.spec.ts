import {
  MAX_AGGREGATED_MONTHS,
  aggregatableMonths,
  monthsBetween,
  sumMonthlySalaries,
} from './reports-excel.month-range';

describe('monthsBetween', () => {
  it('is inclusive at both ends', () => {
    expect(monthsBetween('2026-05-01', '2026-07-31')).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
    ]);
  });

  it('returns a single month when both bounds share it', () => {
    expect(monthsBetween('2026-07-03', '2026-07-29')).toEqual(['2026-07']);
  });

  it('rolls over the year', () => {
    expect(monthsBetween('2026-11-01', '2027-02-28')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

/**
 * The yearly preset was the worst case: `monthStr` became `2026-01`, which has
 * no attendance, so revenue was 0 while expenses covered the whole year — the
 * sheet printed the negative of the year's costs as its headline figure. Months
 * before the reporting floor must be DROPPED, not clamped: `getSalaryMonthly`
 * clamps a too-early month up to `floorMonth`, so an unclamped list would count
 * the floor month once per skipped month.
 */
describe('aggregatableMonths', () => {
  const FLOOR = '2026-05';

  it('drops months before the reporting floor', () => {
    const { months } = aggregatableMonths('2026-01-01', '2026-07-31', FLOOR);
    expect(months).toEqual(['2026-05', '2026-06', '2026-07']);
  });

  it('never repeats the floor month for a whole-year range', () => {
    const { months } = aggregatableMonths('2026-01-01', '2026-12-31', FLOOR);
    expect(months.filter((m) => m === FLOOR)).toHaveLength(1);
  });

  it('returns an empty list when the whole range predates the floor', () => {
    const { months } = aggregatableMonths('2025-01-01', '2025-12-31', FLOOR);
    expect(months).toEqual([]);
  });

  it('caps the month count and reports the truncation', () => {
    const { months, truncated } = aggregatableMonths(
      '2026-05-01',
      '2030-05-31',
      FLOOR,
    );
    expect(months).toHaveLength(MAX_AGGREGATED_MONTHS);
    expect(truncated).toBe(true);
  });

  it('does not flag truncation for an ordinary range', () => {
    const { truncated } = aggregatableMonths('2026-05-01', '2026-07-31', FLOOR);
    expect(truncated).toBe(false);
  });
});

describe('sumMonthlySalaries', () => {
  const month = (
    m: string,
    covered: number,
    centerFunded: number,
    staff = 0,
  ) => ({
    month: m,
    salaries: {
      totals: { covered, centerFunded, fullDeserved: covered + centerFunded },
      staffTotals: { monthly: staff },
    },
  });

  it('applies each month’s own top-up basis', () => {
    // 2026-06 predates the top-up era → contributes `covered` only.
    // 2026-07 onward → contributes covered + centerFunded.
    const agg = sumMonthlySalaries([
      month('2026-06', 40_000, 5_000),
      month('2026-07', 60_000, 9_000),
    ]);

    expect(agg.totals.fullDeserved).toBe(40_000 + 69_000);
    expect(agg.totals.covered).toBe(100_000);
    expect(agg.totals.centerFunded).toBe(14_000);
  });

  it('sums staff salary across months', () => {
    const agg = sumMonthlySalaries([
      month('2026-07', 10_000, 0, 9_000),
      month('2026-08', 10_000, 0, 9_500),
    ]);
    expect(agg.staffTotals.monthly).toBe(18_500);
  });

  it('treats a manual/config-gap month (null split) as zero, not fabricated', () => {
    const agg = sumMonthlySalaries([
      {
        month: '2026-05',
        salaries: {
          totals: { covered: null, centerFunded: null, fullDeserved: null },
        },
      },
      month('2026-07', 60_000, 9_000),
    ]);
    expect(agg.totals.fullDeserved).toBe(69_000);
    expect(agg.totals.covered).toBe(60_000);
  });

  it('returns zeros for an empty month list', () => {
    const agg = sumMonthlySalaries([]);
    expect(agg.totals).toEqual({
      fullDeserved: 0,
      covered: 0,
      centerFunded: 0,
    });
    expect(agg.staffTotals.monthly).toBe(0);
  });
});
