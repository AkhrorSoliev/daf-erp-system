import { buildNetProfit } from './reports-excel.helpers';

describe('buildNetProfit — top-up gating', () => {
  const pl = {
    revenue: { total: 100_000 },
    costOfServices: { teacherSalaries: 5_000, teacherAdvances: 1_000 },
    operatingExpenses: { adminSalaries: 2_000, byCategory: [{ amount: 10_000 }] },
  };
  const salaries = { totals: { covered: 40_000, gap: 14_000, fullDeserved: 54_000 } };
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
