import { ReportsPaymentsService } from './reports-payments.service';

describe('ReportsPaymentsService.getPaymentReports — branch scope', () => {
  let prisma: any;
  let service: ReportsPaymentsService;
  const september = { startDate: '2026-09-01', endDate: '2026-09-30' };

  beforeEach(() => {
    prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        count: jest.fn().mockResolvedValue(0),
      },
      refund: { aggregate: jest.fn(), count: jest.fn() },
    };
    service = new ReportsPaymentsService(prisma);
  });

  const wheres = (model: string) =>
    Object.values(prisma[model]).flatMap((fn: jest.Mock) =>
      fn.mock.calls.map((c) => c[0]?.where),
    );

  it("confines the branch breakdown to the caller's branches", async () => {
    prisma.branch.findMany.mockResolvedValue([
      { id: 3, name: 'Filial C' },
      { id: 7, name: 'Filial G' },
    ]);
    prisma.payment.groupBy.mockImplementation(({ by }) =>
      Promise.resolve(
        by[0] === 'branchId'
          ? [
              { branchId: 7, _sum: { amount: 4_000_000 } },
              { branchId: 3, _sum: { amount: 1_000_000 } },
            ]
          : [],
      ),
    );

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3, 7],
    });

    expect(prisma.branch.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      id: { in: [3, 7] },
    });
    const branchCall = prisma.payment.groupBy.mock.calls.find(
      ([args]) => args.by[0] === 'branchId',
    );
    expect(branchCall[0].where).toMatchObject({
      branchId: { in: [3, 7] },
    });
    expect(out.branchBreakdown.byBranch).toEqual([
      { branchId: 7, branchName: 'Filial G', amount: 4_000_000 },
      { branchId: 3, branchName: 'Filial C', amount: 1_000_000 },
    ]);
  });

  it('every payment and refund query carries the branch predicate', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: [3, 7] });

    const unscoped = [...wheres('payment'), ...wheres('transaction')].filter(
      (w) => w?.branchId === undefined,
    );
    expect(unscoped).toEqual([]);
    expect(prisma.refund.aggregate).not.toHaveBeenCalled();
    expect(prisma.refund.count).not.toHaveBeenCalled();
  });

  it('reads refunds from the branch-stamped REFUND ledger rows, reversals excluded', async () => {
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amount: -350_000 },
    });
    prisma.transaction.count.mockResolvedValue(2);

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3],
    });

    expect(prisma.transaction.aggregate.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      type: 'REFUND',
      reversedAt: null,
      reversedTransactionId: null,
      branchId: { in: [3] },
    });
    expect(out.refunds.current).toBe(350_000);
    expect(out.refunds.count).toBe(2);
  });

  it('turns the refund total into cash returned without Math.abs, so a wrong-signed sum stays visible', async () => {
    // Live REFUND rows are negative. A positive total cannot occur once the
    // counter-rows are left out; if it does it must read as a negative refund.
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amount: 50_000 },
    });

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3],
    });

    expect(out.refunds.current).toBe(-50_000);
  });

  it('counts refunds up to, not including, the day after the range', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: [3] });

    expect(prisma.transaction.count.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date('2026-08-31T19:00:00.000Z'),
      lt: new Date('2026-09-30T19:00:00.000Z'),
    });
  });

  describe('payment methods', () => {
    // 01.09 00:00 Tashkent — the current window's start and its trend month.
    const septemberStart = new Date('2026-08-31T19:00:00.000Z').getTime();

    beforeEach(() => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 10_000_000 },
        _count: 7,
      });
      prisma.payment.groupBy.mockImplementation(({ by, where }) =>
        Promise.resolve(
          by[0] === 'method' && where.createdAt.gte.getTime() === septemberStart
            ? [
                { method: 'CLICK', _sum: { amount: 1_000_000 }, _count: 1 },
                { method: 'CASH', _sum: { amount: 6_000_000 }, _count: 4 },
                { method: 'PAYME', _sum: { amount: 3_000_000 }, _count: 2 },
              ]
            : [],
        ),
      );
    });

    it('splits the period by method, largest first, with its share of the total', async () => {
      const out = await service.getPaymentReports(1001, {
        ...september,
        branchIds: [3],
      });

      expect(out.methods.current).toEqual([
        { method: 'CASH', amount: 6_000_000, count: 4, share: 60 },
        { method: 'PAYME', amount: 3_000_000, count: 2, share: 30 },
        { method: 'CLICK', amount: 1_000_000, count: 1, share: 10 },
      ]);
      expect(out.methods.total).toEqual({ amount: 10_000_000, count: 7 });
    });

    it('reads the methods with the same filter as the total', async () => {
      await service.getPaymentReports(1001, { ...september, branchIds: [3] });

      const methodCall = prisma.payment.groupBy.mock.calls.find(
        ([args]) =>
          args.by[0] === 'method' &&
          args.where.createdAt.gte.getTime() === septemberStart,
      );
      const totalCall = prisma.payment.aggregate.mock.calls.find(
        ([args]) => args.where.createdAt.gte.getTime() === septemberStart,
      );
      expect(methodCall[0].where).toEqual(totalCall[0].where);
    });

    it('splits every trend month by method', async () => {
      const out = await service.getPaymentReports(1001, {
        ...september,
        branchIds: [3],
      });

      expect(out.methods.trend.at(-1)).toEqual({
        month: '09/2026',
        byMethod: { CASH: 6_000_000, PAYME: 3_000_000, CLICK: 1_000_000 },
      });
      expect(out.methods.trend[0]).toEqual({ month: '04/2026', byMethod: {} });
    });

    it('gives no share when nothing was paid', async () => {
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: null },
        _count: 0,
      });
      prisma.payment.groupBy.mockResolvedValue([]);

      const out = await service.getPaymentReports(1001, {
        ...september,
        branchIds: [3],
      });

      expect(out.methods.current).toEqual([]);
      expect(out.methods.total).toEqual({ amount: 0, count: 0 });
    });
  });

  describe('comparedTo', () => {
    it('names the equally long window right before the period, in Tashkent days', async () => {
      const out = await service.getPaymentReports(1001, {
        ...september,
        branchIds: [3],
      });

      expect(out.comparedTo).toEqual({
        startDate: '2026-08-02',
        endDate: '2026-08-31',
      });
    });

    it('compares one day with the day before', async () => {
      const out = await service.getPaymentReports(1001, {
        startDate: '2026-10-06',
        endDate: '2026-10-06',
        branchIds: [3],
      });

      expect(out.comparedTo).toEqual({
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      });
    });
  });

  it('leaves a company-wide caller unfiltered', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: null });

    expect(prisma.branch.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'id',
    );
    const scoped = [...wheres('payment'), ...wheres('transaction')].filter(
      (w) => w?.branchId !== undefined,
    );
    expect(scoped).toEqual([]);
  });
});
