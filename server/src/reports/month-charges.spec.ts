import {
  isMonthlyBillingMonth,
  loadMonthCharges,
  splitMonthCharges,
  type MonthChargeRow,
} from './month-charges';

const row = (
  studentId: number,
  month: string,
  chargedAmount: number,
  branchId = 1,
): MonthChargeRow => {
  const [periodYear, periodMonth] = month.split('-').map(Number);
  return { studentId, periodYear, periodMonth, branchId, chargedAmount };
};

describe('isMonthlyBillingMonth', () => {
  it('starts with September 2026', () => {
    expect(isMonthlyBillingMonth('2026-08')).toBe(false);
    expect(isMonthlyBillingMonth('2026-09')).toBe(true);
    expect(isMonthlyBillingMonth('2027-01')).toBe(true);
  });
});

describe('splitMonthCharges', () => {
  const base = { month: '2026-10', branchIds: null };

  it('a student with no debt has paid the whole month', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000)],
      balances: new Map([[1, 20_000]]),
    });
    expect(r).toEqual({
      month: '2026-10',
      charged: 450_000,
      paid: 450_000,
      unpaid: 0,
      paidPct: 100,
      students: 1,
    });
  });

  it('debt up to the month charge is this month unpaid; the rest is older debt', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(2, '2026-10', 450_000)],
      balances: new Map([
        [1, -100_000], // part paid
        [2, -600_000], // whole month unpaid + 150 000 older debt
      ]),
    });
    expect(r.charged).toBe(900_000);
    expect(r.unpaid).toBe(100_000 + 450_000);
    expect(r.paid).toBe(350_000);
    expect(r.paidPct).toBe(38.9);
  });

  it("a later month's charge is unpaid first, so an earlier month can be fully paid", () => {
    // Viewing October on 02.11: the November charge already sits on the balance.
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -450_000]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.paid).toBe(450_000);
  });

  it('branch scope counts only that branch, debt split by the share of the month', () => {
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [2],
      rows: [row(1, '2026-10', 300_000, 1), row(1, '2026-10', 100_000, 2)],
      balances: new Map([[1, -200_000]]),
    });
    expect(r.charged).toBe(100_000);
    expect(r.unpaid).toBe(50_000); // 200 000 × 100/400
    expect(r.students).toBe(1);
  });

  it('nothing charged → zeros and no percentage', () => {
    const r = splitMonthCharges({ ...base, rows: [], balances: new Map() });
    expect(r).toEqual({
      month: '2026-10',
      charged: 0,
      paid: 0,
      unpaid: 0,
      paidPct: null,
      students: 0,
    });
  });

  it('an empty branch scope sees nothing (fail closed)', () => {
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [],
      rows: [row(1, '2026-10', 450_000)],
      balances: new Map([[1, -450_000]]),
    });
    expect(r.charged).toBe(0);
    expect(r.unpaid).toBe(0);
  });
});

describe('loadMonthCharges', () => {
  it('scopes the holders by branch, then reads their later charges and balances', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ studentId: 7 }])
      .mockResolvedValueOnce([row(7, '2026-10', 450_000, 3)]);
    const prisma = {
      enrollmentMonthlyCharge: { findMany },
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, balance: -50_000 }]),
      },
    };
    const r = await loadMonthCharges(prisma as never, 1, {
      month: '2026-10',
      branchIds: [3],
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 10,
      status: 'CHARGED',
      branchId: { in: [3] },
    });
    expect(r).toMatchObject({
      charged: 450_000,
      unpaid: 50_000,
      paid: 400_000,
    });
  });

  it('stops after the first query when nobody was charged', async () => {
    const prisma = {
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findMany: jest.fn() },
    };
    const r = await loadMonthCharges(prisma as never, 1, {
      month: '2026-10',
      branchIds: null,
    });
    expect(r.charged).toBe(0);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});
