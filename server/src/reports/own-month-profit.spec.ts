import { computeOwnMonthProfit } from './own-month-profit';
import { NetProfit } from './reports-excel.helpers';

const np = (over: Partial<NetProfit>): NetProfit =>
  ({
    revenue: 0,
    revenueBasis: 'recognized',
    teacherSalary: 0,
    teacherSalaryBasis: 'hisoblangan',
    adminSalaryBasis: 'hisoblangan',
    teacherSalaryHasTopup: true,
    adminSalary: 0,
    operatingExpenses: 0,
    refunds: 0,
    netProfit: 0,
    netMarginPercent: 0,
    memo: { writeOffs: 0, providerFees: 0, advances: 0 },
    ...over,
  }) as NetProfit;

describe('computeOwnMonthProfit', () => {
  it('June 2026 production figures — the month did NOT cover itself', () => {
    const result = computeOwnMonthProfit(
      133_621_653,
      np({
        teacherSalary: 66_721_097,
        operatingExpenses: 92_744_000,
        refunds: 907_000,
      }),
    );
    expect(result).toBe(-26_750_444);
  });

  it('July 2026 production figures — the month just covered itself', () => {
    const result = computeOwnMonthProfit(
      142_064_938,
      np({
        teacherSalary: 95_834_547,
        operatingExpenses: 41_773_000,
        refunds: 200_000,
      }),
    );
    expect(result).toBe(4_257_391);
  });

  it('subtracts staff salary too', () => {
    const result = computeOwnMonthProfit(
      1_000_000,
      np({
        teacherSalary: 400_000,
        adminSalary: 100_000,
        operatingExpenses: 200_000,
      }),
    );
    expect(result).toBe(300_000);
  });

  it('does NOT subtract the center top-up separately (it is inside teacherSalary)', () => {
    // teacherSalary already equals covered + centerFunded; subtracting the gap
    // again would double-count it.
    const result = computeOwnMonthProfit(
      1_000_000,
      np({ teacherSalary: 600_000 }),
    );
    expect(result).toBe(400_000);
  });
});
