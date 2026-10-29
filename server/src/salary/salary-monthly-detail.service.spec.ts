import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryMonthlyDetailService } from './salary-monthly-detail.service';
import { SalaryMonthlyService } from './salary-monthly.service';
import { TaxSettingsService } from '../tax/tax-settings.service';

const PERIOD = {
  periodStart: new Date('2026-08-31T19:00:00Z'),
  periodEnd: new Date('2026-09-30T18:59:59.999Z'),
  periodStartDate: new Date('2026-09-01T00:00:00Z'),
  periodEndDateExclusive: new Date('2026-10-01T00:00:00Z'),
  cycleStartDay: 1,
};

const MADINA = { id: 10001, firstName: 'Madina', lastName: 'Karimova' };

function teacherRow(over: Record<string, unknown> = {}) {
  return {
    user: { ...MADINA, isActive: true, branch: null },
    fullDeserved: 10_000_000,
    advances: 1_000_000,
    netToPay: 9_000_000,
    payment: null,
    groups: [],
    advanceItems: [],
    rate: null,
    ...over,
  };
}

function staffRow(over: Record<string, unknown> = {}) {
  return {
    user: { ...MADINA, isActive: true, branch: null, position: 'Kassir' },
    monthly: 3_000_000,
    advances: 500_000,
    netToPay: 2_500_000,
    payment: null,
    coverage: { activeDays: 30, cycleDays: 30 },
    rate: null,
    advanceItems: [],
    ...over,
  };
}

const PAID = (amount: number) => ({
  id: 'sp-2',
  amount,
  status: 'PAID',
  paidAt: '2026-10-10T07:00:00.000Z',
});

function makePrisma() {
  return {
    user: { findFirst: jest.fn().mockResolvedValue({ mainBranch: 3 }) },
    cashAccount: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'a1', name: 'Asosiy kassa', type: 'CASH' },
        { id: 'a2', name: 'Karta hisobi', type: 'CARD' },
      ]),
    },
    salaryPayment: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'sp-1',
          paidAt: new Date('2026-10-08T07:00:00Z'),
          paidBy: { id: 10002, firstName: 'Bobur', lastName: 'Aliyev' },
        },
        {
          id: 'sp-2',
          paidAt: new Date('2026-10-10T07:00:00Z'),
          paidBy: { id: 10003, firstName: 'Dilnoza', lastName: 'Rahimova' },
        },
      ]),
    },
    transaction: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tx-1' }, { id: 'tx-2' }]),
    },
    cashMovement: {
      // CashMovement.amount is signed: a payout is an outflow.
      findMany: jest.fn().mockResolvedValue([
        {
          amount: -4_000_000,
          cashAccount: { name: 'Asosiy kassa', type: 'CASH' },
        },
        {
          amount: -5_000_000,
          cashAccount: { name: 'Karta hisobi', type: 'CARD' },
        },
      ]),
    },
  };
}

describe('SalaryMonthlyDetailService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let monthly: { getMonthlyForUser: jest.Mock };
  let tax: { loadRates: jest.Mock };
  let service: SalaryMonthlyDetailService;

  const answer = (row: unknown) =>
    monthly.getMonthlyForUser.mockResolvedValue({
      month: '2026-09',
      floorMonth: '2026-05',
      period: PERIOD,
      row,
      missedLessons: [],
    });

  beforeEach(() => {
    prisma = makePrisma();
    monthly = { getMonthlyForUser: jest.fn() };
    tax = {
      loadRates: jest.fn().mockResolvedValue({
        rates: {
          'payroll.employeeWithholdingPercent': [
            { fromMonth: '2026-01', value: 12 },
          ],
          'payroll.employerSocialPercent': [
            { fromMonth: '2026-01', value: 12 },
          ],
        },
      }),
    };
    service = new SalaryMonthlyDetailService(
      prisma as unknown as PrismaService,
      monthly as unknown as SalaryMonthlyService,
      tax as unknown as TaxSettingsService,
    );
  });

  const detail = () =>
    service.getDetail(10001, { month: '2026-09', branchId: 3 }, 1, 10009);

  it('a teacher row without a payment has no payout and no frozen-vs-live difference', async () => {
    answer(teacherRow());

    const res = await detail();

    expect(monthly.getMonthlyForUser).toHaveBeenCalledWith(
      10001,
      { month: '2026-09', branchId: 3 },
      1,
      10009,
    );
    expect(res).toMatchObject({
      month: '2026-09',
      period: {
        periodStart: PERIOD.periodStart,
        periodEnd: PERIOD.periodEnd,
        cycleStartDay: 1,
      },
      kind: 'teacher',
      afterCalcDiff: null,
      payout: null,
      payeeBranchMissing: false,
    });
    expect(res.row).toMatchObject({ fullDeserved: 10_000_000 });
    expect(prisma.cashAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, branchId: 3, isActive: true, deletedAt: null },
      }),
    );
    expect(res.cashAccounts).toEqual([
      { id: 'a1', name: 'Asosiy kassa', type: 'CASH' },
      { id: 'a2', name: 'Karta hisobi', type: 'CARD' },
    ]);
    // Nothing was paid: the ledger is not touched.
    expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
    expect(prisma.cashMovement.findMany).not.toHaveBeenCalled();
  });

  it('a PAID row shows the slices as positive amounts, paidAt and who marked it', async () => {
    answer(teacherRow({ payment: PAID(9_000_000) }));

    const res = await detail();

    // The month's PAID payments, bucketed like the report buckets them.
    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 10001,
          companyId: 1,
          status: 'PAID',
          periodStart: {
            gte: new Date('2026-08-31T19:00:00Z'),
            lt: new Date('2026-09-30T19:00:00Z'),
          },
        },
      }),
    );
    // Their live SALARY_PAYMENT ledger rows, then those rows' cash movements.
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          salaryPaymentId: { in: ['sp-1', 'sp-2'] },
          type: 'SALARY_PAYMENT',
          reversedAt: null,
        },
      }),
    );
    expect(prisma.cashMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { transactionId: { in: ['tx-1', 'tx-2'] } },
      }),
    );
    expect(res.payout).toEqual({
      // The latest payment wins, like the row's merged status.
      paidAt: '2026-10-10T07:00:00.000Z',
      paidBy: { id: 10003, firstName: 'Dilnoza', lastName: 'Rahimova' },
      slices: [
        { amount: 4_000_000, accountName: 'Asosiy kassa', accountType: 'CASH' },
        { amount: 5_000_000, accountName: 'Karta hisobi', accountType: 'CARD' },
      ],
    });
  });

  it('a PAID payment that moved no money still has a payout, with no slices', async () => {
    answer(teacherRow({ payment: PAID(0), netToPay: 0 }));
    prisma.transaction.findMany.mockResolvedValue([]);

    const res = await detail();

    expect(res.payout).toMatchObject({ slices: [] });
    expect(prisma.cashMovement.findMany).not.toHaveBeenCalled();
  });

  it('a payment settled with no recorded payer has paidBy null', async () => {
    answer(teacherRow({ payment: PAID(9_000_000) }));
    prisma.salaryPayment.findMany.mockResolvedValue([
      { id: 'sp-2', paidAt: new Date('2026-10-10T07:00:00Z'), paidBy: null },
    ]);

    const res = await detail();

    expect(res.payout).toMatchObject({ paidBy: null });
  });

  it('a payment that is not PAID yet has no payout', async () => {
    answer(
      teacherRow({
        payment: { ...PAID(9_000_000), status: 'APPROVED', paidAt: null },
      }),
    );

    const res = await detail();

    expect(res.payout).toBeNull();
    expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
  });

  describe('afterCalcDiff — the frozen payment against the live equation', () => {
    it('is 0 when a teacher payment still equals worked − advances', async () => {
      answer(teacherRow({ payment: PAID(9_000_000) }));
      expect((await detail()).afterCalcDiff).toBe(0);
    });

    it('is payment − (fullDeserved − advances) for a teacher', async () => {
      answer(teacherRow({ payment: PAID(8_700_000) }));
      expect((await detail()).afterCalcDiff).toBe(-300_000);
    });

    it('is payment − (monthly − advances) for a staff member', async () => {
      answer(staffRow({ payment: PAID(2_500_000) }));
      expect((await detail()).afterCalcDiff).toBe(0);

      answer(staffRow({ payment: PAID(2_600_000) }));
      expect((await detail()).afterCalcDiff).toBe(100_000);
    });

    it('is null for a teacher with a payment but no lesson data', async () => {
      answer(teacherRow({ fullDeserved: null, payment: PAID(9_000_000) }));
      expect((await detail()).afterCalcDiff).toBeNull();
    });
  });

  it('a staff row is kind staff', async () => {
    answer(staffRow());
    expect((await detail()).kind).toBe('staff');
  });

  it('a payee without a main branch has no cash accounts and says so', async () => {
    answer(teacherRow());
    prisma.user.findFirst.mockResolvedValue({ mainBranch: null });

    const res = await detail();

    expect(res.cashAccounts).toEqual([]);
    expect(res.payeeBranchMissing).toBe(true);
    expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
  });

  it('no row in the scoped month is a named 404', async () => {
    answer(null);

    await expect(detail()).rejects.toEqual(
      new NotFoundException('Bu oyda xodim topilmadi'),
    );
    expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
  });

  describe('getPeriod — the lessons route resolves the person first', () => {
    it('returns the month period the row was computed for', async () => {
      answer(teacherRow());

      await expect(
        service.getPeriod(10001, { month: '2026-09' }, 1, 10009),
      ).resolves.toEqual(PERIOD);
    });

    it('is a named 404 outside the scope, before any breakdown is read', async () => {
      answer(null);

      await expect(
        service.getPeriod(10001, { month: '2026-09' }, 1, 10009),
      ).rejects.toEqual(new NotFoundException('Bu oyda xodim topilmadi'));
    });
  });

  describe('bankTax — «Berildi» oynasidagi bank qatori uchun stavkalar (spec 2026-10-28)', () => {
    it("oyning stavkalarini qaytaradi, official maydoni yo'q", async () => {
      answer(teacherRow());

      const res = await detail();

      expect(res.bankTax).toEqual({
        withholdingPercent: 12,
        employerSocialPercent: 12,
      });
      expect(res).not.toHaveProperty('official');
    });

    it("stavka kiritilmagan bo'lsa ikkalasi ham null", async () => {
      tax.loadRates.mockResolvedValue({
        rates: {
          'payroll.employeeWithholdingPercent': [],
          'payroll.employerSocialPercent': [],
        },
      });
      answer(staffRow());

      expect((await detail()).bankTax).toEqual({
        withholdingPercent: null,
        employerSocialPercent: null,
      });
    });
  });
});
