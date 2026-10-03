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
      unpaidStudents: 0,
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

  // The test above sits exactly on the boundary (debt == the later month's
  // charge). These two stand on either side of it, so a mistake in HOW the
  // later months are subtracted — not only WHETHER — fails.
  it("debt above the later month's charge leaves the excess on this month", () => {
    // Debt 600 000 = November's 450 000 (newest, unpaid first) + 150 000 of October.
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -600_000]]),
    });
    expect(r.charged).toBe(450_000);
    expect(r.unpaid).toBe(150_000);
    expect(r.paid).toBe(300_000);
    expect(r.paidPct).toBe(66.7);
  });

  it("debt below the later month's charge sits wholly on that month: this one owes nothing", () => {
    // Debt 300 000 is less than November's 450 000, so none of it reaches October.
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -300_000]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.paid).toBe(450_000);
    expect(r.paidPct).toBe(100);
  });

  it('every later month is set aside, across a year end too', () => {
    // December 2026 with January 2027 ahead of it: 2027-01 is later although
    // its month number is smaller. Debt 600 000 − 450 000 (January) = 150 000.
    const r = splitMonthCharges({
      month: '2026-12',
      branchIds: null,
      rows: [row(1, '2026-12', 450_000), row(1, '2027-01', 450_000)],
      balances: new Map([[1, -600_000]]),
    });
    expect(r.unpaid).toBe(150_000);

    // Two later months add up: 1 000 000 − (450 000 + 450 000) = 100 000.
    const two = splitMonthCharges({
      ...base,
      rows: [
        row(1, '2026-10', 450_000),
        row(1, '2026-11', 450_000),
        row(1, '2026-12', 450_000),
      ],
      balances: new Map([[1, -1_000_000]]),
    });
    expect(two.unpaid).toBe(100_000);
    expect(two.paid).toBe(350_000);
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
      unpaidStudents: 0,
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

  it('counts the students whose unpaid share is above 0, beside the unpaid sum', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [
        row(1, '2026-10', 450_000),
        row(2, '2026-10', 450_000),
        row(3, '2026-10', 450_000),
      ],
      balances: new Map([
        [1, 20_000], // paid
        [2, -100_000], // part of the month unpaid
        [3, -600_000], // the whole month unpaid, and older debt
      ]),
    });
    expect(r.students).toBe(3);
    expect(r.unpaid).toBe(100_000 + 450_000);
    expect(r.unpaidStudents).toBe(2);
  });

  it("a debt that sits on a later month's charge does not make this month's student unpaid", () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -300_000]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.unpaidStudents).toBe(0);
  });

  it('a share that rounds to 0 in the branch is not counted, so the count agrees with unpaid', () => {
    // 1 so'm of debt over 999 999 + 1 so'm of charges: branch 2's share rounds to 0.
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [2],
      rows: [row(1, '2026-10', 999_999, 1), row(1, '2026-10', 1, 2)],
      balances: new Map([[1, -1]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.unpaidStudents).toBe(0);
  });
});

describe('loadMonthCharges', () => {
  it('scopes the holders by branch, then reads their later charges and balances', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ studentId: 7 }])
      .mockResolvedValueOnce([row(7, '2026-10', 450_000, 3)]);
    const studentFindMany = jest
      .fn()
      .mockResolvedValue([{ id: 7, balance: -50_000 }]);
    const prisma = {
      enrollmentMonthlyCharge: { findMany },
      student: { findMany: studentFindMany },
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
    // The second query reads the holders' charges of this month AND LATER ones:
    // CHARGED only (a reversed or skipped charge is not on the balance), this
    // year's months from October on or any later year. `toEqual` also pins that
    // it carries NO `branchId` — the balance is one, so a student's charges in
    // every branch count against it.
    expect(findMany.mock.calls[1][0].where).toEqual({
      companyId: 1,
      studentId: { in: [7] },
      status: 'CHARGED',
      OR: [
        { periodYear: { gt: 2026 } },
        { periodYear: 2026, periodMonth: { gte: 10 } },
      ],
    });
    // Balances are the holders' own, unscoped by branch too.
    expect(studentFindMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
      id: { in: [7] },
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
