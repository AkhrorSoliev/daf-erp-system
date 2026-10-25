import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { TaxCostsService } from './tax-costs.service';
import { emptyTaxCosts } from './tax-costs';

describe('TaxCostsService.forMonth', () => {
  const prisma = {
    payment: {
      groupBy: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10_000_000 } }),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 5, officialSalary: 2_000_000 }]),
    },
  };
  const tax = {
    loadRates: jest.fn().mockResolvedValue({
      rates: {
        'fees.app.payme': [],
        'fees.app.click': [],
        'fees.app.uzum': [],
        'fees.integration': [{ fromMonth: '2026-10', value: 2.5 }],
        'fees.qr': [],
        'payroll.employeeWithholdingPercent': [
          { fromMonth: '2026-10', value: 12 },
        ],
        'payroll.employerSocialPercent': [{ fromMonth: '2026-10', value: 12 }],
        'tax.turnoverPercent': [{ fromMonth: '2026-10', value: 4 }],
      },
      bankTiers: [
        {
          fromMonth: '2026-10',
          tiers: [{ fromAmount: 0, toAmount: null, percent: 0.1 }],
        },
      ],
    }),
  };
  const service = new TaxCostsService(prisma as never, tax as never);

  beforeEach(() => jest.clearAllMocks());

  it('combines payments, turnover and payroll for the month', async () => {
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
    const out = await service.forMonth(1, '2026-10', null, {
      data: [{ user: { id: 5 }, fullDeserved: 2_500_000, covered: 2_000_000 }],
      staff: [],
    });
    expect(out).toEqual({
      providerFees: 250_000,
      turnoverTax: 400_000,
      bankFees: 10_000,
      employerSocialTax: 240_000,
      withholding: 240_000,
      turnover: 10_000_000,
      total: 900_000,
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
    prisma.payment.groupBy.mockResolvedValue([]);
    await service.forMonth(1, '2026-10', [2, 3], { data: [], staff: [] });
    expect(prisma.payment.groupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ branchId: { in: [2, 3] } }),
    );
    // company turnover (bank fee share) is not branch-scoped
    expect(prisma.payment.aggregate.mock.calls[0][0].where).not.toHaveProperty(
      'branchId',
    );
  });

  it('returns zeros without querying for an empty scope', async () => {
    const out = await service.forMonth(1, '2026-10', [], {
      data: [{ user: { id: 5 }, fullDeserved: 2_500_000, covered: 2_000_000 }],
      staff: [],
    });
    expect(out).toEqual(emptyTaxCosts());
    expect(prisma.payment.groupBy).not.toHaveBeenCalled();
    expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(tax.loadRates).not.toHaveBeenCalled();
  });

  describe('rate by month and unscoped branches', () => {
    const dated = (rates: { fromMonth: string; value: number }[]) => ({
      rates: {
        'fees.app.payme': [],
        'fees.app.click': [],
        'fees.app.uzum': [],
        'fees.integration': rates,
        'fees.qr': [],
        'payroll.employeeWithholdingPercent': [],
        'payroll.employerSocialPercent': [],
        'tax.turnoverPercent': [],
      },
      bankTiers: [],
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
      prisma.payment.groupBy.mockResolvedValue([]);
      prisma.payment.groupBy
        .mockResolvedValueOnce([integrationRow(1)])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([integrationRow(1)])
        .mockResolvedValueOnce([]);
      const past = await service.forMonth(1, '2026-09', null, {
        data: [],
        staff: [],
      });
      const current = await service.forMonth(1, '2026-10', null, {
        data: [],
        staff: [],
      });
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
      const out = await service.forMonth(1, '2026-10', null, {
        data: [],
        staff: [],
      });
      expect(out.providerFees).toBe(20_000);
      expect(out.turnover).toBe(1_000_000);
    });
  });
});
