import { buildNetProfit } from './reports-excel.helpers';

describe('buildNetProfit — top-up gating', () => {
  const pl = {
    revenue: { total: 100_000 },
    costOfServices: { teacherSalaries: 5_000, teacherAdvances: 1_000 },
    operatingExpenses: {
      adminSalaries: 2_000,
      byCategory: [{ amount: 10_000 }],
    },
  };
  const salaries = {
    totals: { covered: 40_000, gap: 14_000, fullDeserved: 54_000 },
  };
  const outflows = { refunds: 3_000, writeOffs: 500, providerFees: 0 };

  it('pre-top-up month (2026-06) subtracts COVERED only, not covered+gap', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-06');
    expect(np.teacherSalary).toBe(40_000); // covered, NOT fullDeserved
    expect(np.teacherSalaryHasTopup).toBe(false);
    expect(np.teacherSalaryBasis).toBe('hisoblangan');
    // 100000 − 40000 − 2000 − 10000 − 3000
    expect(np.netProfit).toBe(45_000);
  });

  it('top-up month (2026-07) subtracts fullDeserved (covered + gap)', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-07');
    expect(np.teacherSalary).toBe(54_000); // covered + gap
    expect(np.teacherSalaryHasTopup).toBe(true);
    // 100000 − 54000 − 2000 − 10000 − 3000
    expect(np.netProfit).toBe(31_000);
  });

  it('later top-up month (2026-08) also includes gap', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-08');
    expect(np.teacherSalary).toBe(54_000);
    expect(np.teacherSalaryHasTopup).toBe(true);
  });

  it('config-gap month (covered/fullDeserved null) falls back to cash paid', () => {
    const gap = { totals: { covered: null, gap: null, fullDeserved: null } };
    const np = buildNetProfit(pl, gap, outflows, '2026-06');
    expect(np.teacherSalary).toBe(5_000); // pl.costOfServices.teacherSalaries
    expect(np.teacherSalaryBasis).toBe('naqd');
    expect(np.teacherSalaryHasTopup).toBe(false);
  });

  it('no month → legacy full-deserved (back-compat)', () => {
    const np = buildNetProfit(pl, salaries, outflows);
    expect(np.teacherSalary).toBe(54_000);
    expect(np.teacherSalaryHasTopup).toBe(true);
  });

  it('advance stays in the memo, not double-subtracted from operatingExpenses', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-07');
    expect(np.memo.advances).toBe(1_000);
    expect(np.operatingExpenses).toBe(10_000); // byCategory only, advance excluded
  });
});

/**
 * Staff (admin / cashier / director) pay must be measured the same way teacher
 * pay is: what was EARNED this month, not the cash that happened to leave.
 * Salaries are disbursed the following cycle, so a paid-basis figure reads ~0
 * inside the month — the same mistake that overstated June profit by ~78M on
 * the teacher leg.
 */
describe('buildNetProfit — staff salary basis', () => {
  const pl = {
    revenue: { total: 100_000 },
    costOfServices: { teacherSalaries: 5_000, teacherAdvances: 0 },
    // Nothing paid out yet this month — the trap.
    operatingExpenses: { adminSalaries: 0, byCategory: [{ amount: 10_000 }] },
  };
  const outflows = { refunds: 0, writeOffs: 0, providerFees: 0 };

  it('subtracts the EARNED staff salary even when nothing was paid yet', () => {
    const salaries = {
      totals: { covered: 40_000, gap: 0, fullDeserved: 40_000 },
      staffTotals: { monthly: 9_000, advances: 0, netToPay: 9_000 },
    };
    const np = buildNetProfit(pl, salaries, outflows, '2026-07');

    expect(np.adminSalary).toBe(9_000);
    expect(np.adminSalaryBasis).toBe('hisoblangan');
    // 100k − 40k teacher − 9k staff − 10k expenses = 41k
    expect(np.netProfit).toBe(41_000);
  });

  it('falls back to cash paid when no staff rate is configured', () => {
    // A center that keeps staff pay outside the salary module must be
    // unaffected — otherwise the cost would silently vanish from profit.
    const salaries = {
      totals: { covered: 40_000, gap: 0, fullDeserved: 40_000 },
      staffTotals: { monthly: 0, advances: 0, netToPay: 0 },
    };
    const paid = {
      ...pl,
      operatingExpenses: {
        adminSalaries: 7_000,
        byCategory: [{ amount: 10_000 }],
      },
    };
    const np = buildNetProfit(paid, salaries, outflows, '2026-07');

    expect(np.adminSalary).toBe(7_000);
    expect(np.adminSalaryBasis).toBe('naqd');
  });

  it('falls back when staffTotals is absent entirely (older callers)', () => {
    const salaries = {
      totals: { covered: 40_000, gap: 0, fullDeserved: 40_000 },
    };
    const paid = {
      ...pl,
      operatingExpenses: {
        adminSalaries: 2_000,
        byCategory: [{ amount: 10_000 }],
      },
    };
    const np = buildNetProfit(paid, salaries, outflows, '2026-07');

    expect(np.adminSalary).toBe(2_000);
    expect(np.adminSalaryBasis).toBe('naqd');
  });
});
