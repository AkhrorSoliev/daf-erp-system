import {
  resolveStaffMonthly,
  staffAdjustmentMonth,
} from './staff-monthly-amount';
import { FixedMonthlyVersion } from './prorate-fixed-monthly';

/** Tashkent-midnight instant of a calendar date (UTC+5, no DST). */
const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

const sep = {
  periodStart: tsh(2026, 9, 1),
  periodEnd: new Date(tsh(2026, 10, 1).getTime() - 1),
};
// Started 11.09: 20 of 30 days at 3 000 000.
const from11: FixedMonthlyVersion = {
  value: 3_000_000,
  effectiveFrom: tsh(2026, 9, 11),
  effectiveTo: null,
};

describe('resolveStaffMonthly', () => {
  it('is the prorated formula when there is no correction', () => {
    expect(
      resolveStaffMonthly({ versions: [from11], adjustment: null, ...sep }),
    ).toEqual({ amount: 2_000_000, calculated: 2_000_000, manual: false });
  });

  it('the CEO figure replaces the formula but the formula stays visible', () => {
    expect(
      resolveStaffMonthly({
        versions: [from11],
        adjustment: { amount: 2_076_000 },
        ...sep,
      }),
    ).toEqual({ amount: 2_076_000, calculated: 2_000_000, manual: true });
  });

  it('a correction of 0 is a valid figure, not "no correction"', () => {
    expect(
      resolveStaffMonthly({
        versions: [from11],
        adjustment: { amount: 0 },
        ...sep,
      }),
    ).toEqual({ amount: 0, calculated: 2_000_000, manual: true });
  });

  it('a month no version overlaps still takes the correction', () => {
    expect(
      resolveStaffMonthly({
        versions: [],
        adjustment: { amount: 500_000 },
        ...sep,
      }),
    ).toEqual({ amount: 500_000, calculated: 0, manual: true });
  });
});

describe('staffAdjustmentMonth', () => {
  it('names the Tashkent calendar month a period opens', () => {
    expect(staffAdjustmentMonth(tsh(2026, 9, 1))).toBe('2026-09');
    expect(staffAdjustmentMonth(tsh(2026, 1, 1))).toBe('2026-01');
  });
});
