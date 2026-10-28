import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { TaxCostsService } from './tax-costs.service';
import { emptyTaxCosts } from './tax-costs';
import {
  tashkentMonthKey,
  tashkentMonthRangeUtc,
} from '../common/date/tashkent';

const RATES = {
  'fees.app.payme': [],
  'fees.app.click': [],
  'fees.app.uzum': [],
  'fees.integration': [{ fromMonth: '2026-01', value: 2.5 }],
  'fees.qr': [],
  'payroll.employeeWithholdingPercent': [{ fromMonth: '2026-01', value: 12 }],
  'payroll.employerSocialPercent': [{ fromMonth: '2026-01', value: 12 }],
  'tax.turnoverPercent': [{ fromMonth: '2026-01', value: 4 }],
};

describe('TaxCostsService.forMonth', () => {
  // Joriy oy hisobda 2026-12: 2026-10 tugagan oy.
  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date('2026-12-15T10:00:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'clearImmediate',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
  });
  afterAll(() => jest.useRealTimers());

  const prisma = {
    payment: { groupBy: jest.fn() },
    transaction: { findMany: jest.fn() },
    cashMovement: { aggregate: jest.fn() },
    expense: { aggregate: jest.fn(), findMany: jest.fn() },
    cashAccount: { findMany: jest.fn() },
  };
  const tax = { loadRates: jest.fn() };
  const service = new TaxCostsService(prisma as never, tax as never);

  beforeEach(() => {
    jest.resetAllMocks();
    tax.loadRates.mockResolvedValue({ rates: RATES });
    prisma.payment.groupBy.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.cashMovement.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.expense.findMany.mockResolvedValue([]);
    prisma.cashAccount.findMany.mockResolvedValue([]);
  });

  it('combines payments, turnover and bank-paid salary tax for the month', async () => {
    prisma.payment.groupBy
      .mockResolvedValueOnce([
        {
          branchId: 1,
          method: M.PAYME,
          source: S.GATEWAY_WEBHOOK,
          _sum: { amount: 10_000_000 },
        },
      ]) // rows without stored fee
      .mockResolvedValueOnce([]); // rows with stored fee
    prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }]);
    prisma.cashMovement.aggregate.mockResolvedValue({
      _sum: { amount: -2_000_000 },
    });
    const out = await service.forMonth(1, '2026-10', null);
    expect(out).toEqual({
      providerFees: 250_000,
      turnoverTax: 400_000,
      employerSocialTax: 240_000,
      withholding: 240_000,
      bankPaidSalary: 2_000_000,
      turnover: 10_000_000,
      total: 890_000,
      missingRates: [],
    });
    const where = prisma.payment.groupBy.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({
        companyId: 1,
        status: 'COMPLETED',
        providerFee: null,
        createdAt: { gte: expect.any(Date), lt: expect.any(Date) },
      }),
    );
    expect(where).not.toHaveProperty('branchId');
  });

  it('scopes payments to the given branches', async () => {
    await service.forMonth(1, '2026-10', [2, 3]);
    expect(prisma.payment.groupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ branchId: { in: [2, 3] } }),
    );
  });

  it('social tax base = BANK outflows of the month salary payments + bank-paid advances settled into them', async () => {
    prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    prisma.cashMovement.aggregate.mockResolvedValue({
      _sum: { amount: -1_500_000 },
    });
    prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 500_000 } });
    const r = await service.forMonth(1, '2026-10', null);
    expect(r.bankPaidSalary).toBe(2_000_000);
    expect(r.employerSocialTax).toBe(240_000);
    expect(r.withholding).toBe(240_000);
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 1,
          type: 'SALARY_PAYMENT',
          reversedAt: null,
          reversedTransactionId: null,
          salaryPayment: { periodStart: tashkentMonthRangeUtc('2026-10') },
        }),
      }),
    );
    expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transactionId: { in: ['t1', 't2'] },
          type: 'OUTFLOW',
          reversedAt: null,
          cashAccount: { type: 'BANK' },
        }),
      }),
    );
    expect(prisma.expense.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: 'TEACHER_ADVANCE',
          paymentMethod: 'CARD',
          deletedAt: null,
          settledBySalaryPayment: {
            periodStart: tashkentMonthRangeUtc('2026-10'),
          },
        }),
      }),
    );
  });

  it('no salary transactions: no movement query, base 0', async () => {
    const r = await service.forMonth(1, '2026-10', null);
    expect(prisma.cashMovement.aggregate).not.toHaveBeenCalled();
    expect(r.bankPaidSalary).toBe(0);
    expect(r.missingRates).toEqual([]);
  });

  it('bank-paid salary without payroll rates lists both rates as missing', async () => {
    tax.loadRates.mockResolvedValue({
      rates: {
        ...RATES,
        'payroll.employeeWithholdingPercent': [],
        'payroll.employerSocialPercent': [],
      },
    });
    prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }]);
    prisma.cashMovement.aggregate.mockResolvedValue({
      _sum: { amount: -1_000 },
    });
    const r = await service.forMonth(1, '2026-10', null);
    expect(r.employerSocialTax).toBe(0);
    expect(r.missingRates).toEqual([
      'payroll.employeeWithholdingPercent',
      'payroll.employerSocialPercent',
    ]);
  });

  it('a past month with a bank account and no fee row is flagged bank.feesEntered', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    prisma.expense.findMany.mockResolvedValue([{ cashAccountId: 'a1' }]);
    const r = await service.forMonth(1, '2026-10', null);
    expect(r.missingRates).toContain('bank.feesEntered');
  });

  it('every account entered (0 counts) — not flagged', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
    prisma.expense.findMany.mockResolvedValue([{ cashAccountId: 'a1' }]);
    expect(
      (await service.forMonth(1, '2026-10', null)).missingRates,
    ).not.toContain('bank.feesEntered');
  });

  it('the current month is never flagged', async () => {
    const now = tashkentMonthKey(new Date());
    prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
    prisma.expense.findMany.mockResolvedValue([]);
    expect((await service.forMonth(1, now, null)).missingRates).not.toContain(
      'bank.feesEntered',
    );
    expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
  });

  it('a month before the start month: no salary base, no fee flag, no queries for them', async () => {
    prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
    prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }]);
    const r = await service.forMonth(1, '2026-09', null);
    expect(r.bankPaidSalary).toBe(0);
    expect(r.employerSocialTax).toBe(0);
    expect(r.missingRates).toEqual([]);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(prisma.expense.aggregate).not.toHaveBeenCalled();
    expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    // 2026-10 — boshlanish oyining o'zi hisoblanadi.
    await service.forMonth(1, '2026-10', null);
    expect(prisma.transaction.findMany).toHaveBeenCalled();
    expect(prisma.cashAccount.findMany).toHaveBeenCalled();
  });

  it('an empty scope reads nothing', async () => {
    expect(await service.forMonth(1, '2026-09', [])).toEqual(emptyTaxCosts());
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(tax.loadRates).not.toHaveBeenCalled();
  });

  describe('rate by month and unscoped branches', () => {
    const dated = (rates: { fromMonth: string; value: number }[]) => ({
      rates: { ...RATES, 'fees.integration': rates },
    });
    const integrationRow = (branchId: number | null) => ({
      branchId,
      method: M.PAYME,
      source: S.GATEWAY_WEBHOOK,
      _sum: { amount: 1_000_000 },
    });

    it('a past month takes the older dated rate, the current month the newer one', async () => {
      tax.loadRates.mockResolvedValue(
        dated([
          { fromMonth: '2026-08', value: 2 },
          { fromMonth: '2026-10', value: 3 },
        ]),
      );
      prisma.payment.groupBy
        .mockResolvedValueOnce([integrationRow(1)])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([integrationRow(1)])
        .mockResolvedValueOnce([]);
      const past = await service.forMonth(1, '2026-09', null);
      const current = await service.forMonth(1, '2026-10', null);
      expect(past.providerFees).toBe(20_000);
      expect(current.providerFees).toBe(30_000);
    });

    it('counts a payment group with no branch', async () => {
      tax.loadRates.mockResolvedValue(
        dated([{ fromMonth: '2026-08', value: 2 }]),
      );
      prisma.payment.groupBy
        .mockResolvedValueOnce([integrationRow(null)])
        .mockResolvedValueOnce([]);
      const out = await service.forMonth(1, '2026-10', null);
      expect(out.providerFees).toBe(20_000);
      expect(out.turnover).toBe(1_000_000);
    });
  });
});
