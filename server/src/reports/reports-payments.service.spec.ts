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
    prisma.payment.groupBy.mockResolvedValue([
      { branchId: 7, _sum: { amount: 4_000_000 } },
      { branchId: 3, _sum: { amount: 1_000_000 } },
    ]);

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3, 7],
    });

    expect(prisma.branch.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      id: { in: [3, 7] },
    });
    expect(prisma.payment.groupBy.mock.calls[0][0].where).toMatchObject({
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

  it('counts refunds up to, not including, the day after the range', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: [3] });

    expect(prisma.transaction.count.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date('2026-08-31T19:00:00.000Z'),
      lt: new Date('2026-09-30T19:00:00.000Z'),
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
