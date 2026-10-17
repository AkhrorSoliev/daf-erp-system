import { Prisma } from '@prisma/client';
import {
  FIRST,
  LEAD,
  PAYMENT,
  at,
  setupKpiResults,
} from './kpi-results.testing';

describe('KpiResultsService.recordForPayment — LEAD_PAID', () => {
  it("credits the owner of a new student's lead with the first payment after the conversion", async () => {
    const s = setupKpiResults();
    const written = await s.service.recordForPayment('p1');

    expect(written).toHaveLength(1);
    expect(s.prisma.payment.findFirst).toHaveBeenCalledWith({
      where: {
        studentId: 10500,
        companyId: 1001,
        status: 'COMPLETED',
        createdAt: { gte: LEAD.statusChangedAt },
        id: { notIn: [] },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, amount: true, createdAt: true, branchId: true },
    });
    expect(s.prisma.kpiResult.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 3,
        userId: 11,
        type: 'LEAD_PAID',
        leadId: 'L1',
        promiseId: null,
        studentId: 10500,
        paymentId: 'p1',
        paymentAmount: 600_000,
        baseAmount: 600_000,
        ruleMode: 'FIXED',
        ruleValue: 50_000,
        amount: 50_000,
        month: '2026-10',
        occurredAt: PAYMENT.createdAt,
        replacesResultId: null,
      },
    });
  });

  it("takes the payment's branch for a lead with no branch", async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, branchId: null }]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data.branchId).toBe(2);
  });

  it('seals a percent rule on the payment: round(base × value / 100)', async () => {
    const s = setupKpiResults({ leadPaid: { mode: 'PERCENT', value: 5 } });
    s.prisma.payment.findFirst.mockResolvedValue({ ...FIRST, amount: 333_333 });
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      paymentAmount: 333_333,
      baseAmount: 333_333,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 16_667,
    });
  });

  it('a lead linked to a student who is studying earns nothing; the backfill may supply a missing kind', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([
      { ...LEAD, conversionKind: 'ALREADY_STUDYING' },
    ]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();

    s.prisma.lead.findMany.mockResolvedValue([
      { ...LEAD, conversionKind: null },
    ]);
    await expect(s.service.planForPayment('p1')).resolves.toEqual([]);
    const drafts = await s.service.planForPayment('p1', {
      kinds: new Map([['L1', 'RETURNING' as const]]),
      resolvers: new Map(),
    });
    expect(drafts.map((d) => d.leadId)).toEqual(['L1']);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it.each([12, 13, 14, 99])(
    'writes nothing for owner %i — not an administrator alone, or not an active account',
    async (ownerId) => {
      const s = setupKpiResults();
      s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, ownerId }]);
      await s.service.recordForPayment('p1');
      expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
    },
  );

  it('writes nothing while the switch is off, nor for a payment made before it came back on', async () => {
    const off = setupKpiResults({ enabled: false });
    await off.service.recordForPayment('p1');
    expect(off.prisma.lead.findMany).not.toHaveBeenCalled();
    expect(off.prisma.kpiResult.create).not.toHaveBeenCalled();

    const later = setupKpiResults({ changedAt: at('2026-10-25T00:00:00') });
    await later.service.recordForPayment('p1');
    expect(later.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('skips a lead that has its result and a payment another lead holds', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([{ ...LEAD, id: 'L0' }, LEAD]);
    s.prisma.kpiResult.findMany.mockImplementation(
      async ({ where }: { where: { type?: string } }) =>
        where.type === 'LEAD_PAID' ? [{ leadId: 'L0', paymentId: 'p0' }] : [],
    );
    await s.service.recordForPayment('p1');

    expect(s.prisma.payment.findFirst).toHaveBeenCalledTimes(1);
    expect(s.prisma.payment.findFirst.mock.calls[0][0].where.id).toEqual({
      notIn: ['p0'],
    });
    expect(s.prisma.kpiResult.create).toHaveBeenCalledTimes(1);
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data.leadId).toBe('L1');
  });

  it('writes nothing for a payment that is not COMPLETED', async () => {
    const s = setupKpiResults();
    s.prisma.payment.findUnique.mockResolvedValue({
      ...PAYMENT,
      status: 'REVERSED',
    });
    await expect(s.service.recordForPayment('p1')).resolves.toEqual([]);
    expect(s.kpiSettings.read).not.toHaveBeenCalled();
  });

  it('a writer that got there first is not an error', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(s.service.recordForPayment('p1')).resolves.toEqual([]);
  });

  it('also recognises the raw adapter error (cause.code 23505) as a lost race', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.create.mockRejectedValue(
      Object.assign(new Error('adapter'), { cause: { code: '23505' } }),
    );
    await expect(s.service.recordForPayment('p1')).resolves.toEqual([]);
  });

  it('rethrows any other error', async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.create.mockRejectedValue(new Error('db down'));
    await expect(s.service.recordForPayment('p1')).rejects.toThrow('db down');
  });
});

describe('KpiResultsService.recordForPayment — PROMISE_KEPT', () => {
  const PROMISE = {
    id: 'pr1',
    createdById: 11,
    balanceAtPromise: -400_000,
    branchId: null as number | null,
    studentId: 10500,
    companyId: 1001,
    createdAt: new Date('2026-10-18T09:00:00+05:00'),
  };

  it("credits the promise's writer, the debt at the promise as the base", async () => {
    const s = setupKpiResults({ promiseKept: { mode: 'PERCENT', value: 5 } });
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([PROMISE]);
    await s.service.recordForPayment('p1');

    expect(s.prisma.paymentPromise.findMany).toHaveBeenCalledWith({
      where: { resolvedPaymentId: 'p1', status: 'KEPT' },
      select: {
        id: true,
        createdById: true,
        balanceAtPromise: true,
        branchId: true,
        studentId: true,
        companyId: true,
        createdAt: true,
      },
    });
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toEqual({
      companyId: 1001,
      branchId: 2,
      userId: 11,
      type: 'PROMISE_KEPT',
      leadId: null,
      promiseId: 'pr1',
      studentId: 10500,
      paymentId: 'p1',
      paymentAmount: 600_000,
      baseAmount: 400_000,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 20_000,
      month: '2026-10',
      occurredAt: PAYMENT.createdAt,
      replacesResultId: null,
    });
  });

  it('floors a promise made without debt at a zero base', async () => {
    const s = setupKpiResults({ promiseKept: { mode: 'PERCENT', value: 5 } });
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([
      { ...PROMISE, balanceAtPromise: 100 },
    ]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      baseAmount: 0,
      amount: 0,
    });
  });

  it('skips a promise that already has its result, and a writer who is not eligible', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([
      PROMISE,
      { ...PROMISE, id: 'pr2', createdById: 14 },
    ]);
    s.prisma.kpiResult.findMany.mockImplementation(
      async ({ where }: { where: { type?: string } }) =>
        where.type === 'PROMISE_KEPT' ? [{ promiseId: 'pr1' }] : [],
    );
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('skips a promise written the same Tashkent day as the payment (CEO, 17.10.2026)', async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([
      { ...PROMISE, createdAt: new Date('2026-10-20T00:10:00+05:00') },
    ]);
    await s.service.recordForPayment('p1');
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it("the backfill's dry run also reads the promises it would link to this payment", async () => {
    const s = setupKpiResults();
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.paymentPromise.findMany.mockResolvedValue([PROMISE]);
    const drafts = await s.service.planForPayment('p1', {
      kinds: new Map(),
      resolvers: new Map([
        ['pr1', 'p1'],
        ['pr9', 'p7'],
      ]),
    });
    expect(s.prisma.paymentPromise.findMany.mock.calls[0][0].where).toEqual({
      status: 'KEPT',
      OR: [{ resolvedPaymentId: 'p1' }, { id: { in: ['pr1'] } }],
    });
    expect(drafts.map((d) => d.promiseId)).toEqual(['pr1']);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });
});

describe('KpiResultsService.cancelForPayment', () => {
  const NOW = new Date('2026-10-22T06:00:00Z');
  const ACTIVE_ON_P1 = [
    { id: 'r1', type: 'LEAD_PAID', studentId: 10500, companyId: 1001 },
  ];
  const byWhere =
    (onPayment: unknown[]) =>
    async ({ where }: { where: { paymentId?: string } }) =>
      where.paymentId ? onPayment : [];

  it("cancels a reversed payment's results and lets the lead take its next payment", async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });
    s.prisma.payment.findFirst.mockResolvedValue({
      ...FIRST,
      id: 'p2',
      amount: 300_000,
    });

    await expect(
      s.service.cancelForPayment('p1', { correction: false }, NOW),
    ).resolves.toBe(1);

    expect(s.prisma.kpiResult.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1'] }, status: 'ACTIVE' },
      data: {
        status: 'CANCELLED',
        cancelledAt: NOW,
        cancelReason: "To'lov bekor qilindi",
      },
    });
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      leadId: 'L1',
      paymentId: 'p2',
      amount: 50_000,
    });
  });

  it("a correction's reversal says so and leaves the move to the re-post", async () => {
    const s = setupKpiResults();
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });

    await s.service.cancelForPayment('p1', { correction: true }, NOW);

    expect(
      s.prisma.kpiResult.updateMany.mock.calls[0][0].data.cancelReason,
    ).toBe("To'lov tuzatildi");
    expect(s.prisma.lead.findMany).not.toHaveBeenCalled();
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('cancels while the switch is off, and writes no new result then', async () => {
    const s = setupKpiResults({ enabled: false });
    s.prisma.kpiResult.findMany.mockImplementation(byWhere(ACTIVE_ON_P1));
    s.prisma.kpiResult.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      s.service.cancelForPayment('p1', { correction: false }, NOW),
    ).resolves.toBe(1);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
  });

  it('does nothing for a payment with no active result', async () => {
    const s = setupKpiResults();
    await expect(
      s.service.cancelForPayment('p1', { correction: false }, NOW),
    ).resolves.toBe(0);
    expect(s.prisma.kpiResult.updateMany).not.toHaveBeenCalled();
  });
});

describe('KpiResultsService.recordForPayment — a corrected amount', () => {
  const REPOST = {
    ...PAYMENT,
    id: 'p2',
    amount: 400_000,
    correctsPaymentId: 'p1',
  };
  const OLD = [
    {
      id: 'r1',
      companyId: 1001,
      branchId: 3,
      userId: 11,
      type: 'LEAD_PAID',
      leadId: 'L1',
      promiseId: null,
      studentId: 10500,
      paymentId: 'p1',
      paymentAmount: 600_000,
      baseAmount: 600_000,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 30_000,
    },
    {
      id: 'r2',
      companyId: 1001,
      branchId: 2,
      userId: 12,
      type: 'PROMISE_KEPT',
      leadId: null,
      promiseId: 'pr1',
      studentId: 10500,
      paymentId: 'p1',
      paymentAmount: 600_000,
      baseAmount: 400_000,
      ruleMode: 'FIXED',
      ruleValue: 20_000,
      amount: 20_000,
    },
  ];
  const results =
    (moved: { replacesResultId: string }[]) =>
    async ({
      where,
    }: {
      where: { paymentId?: string; replacesResultId?: unknown };
    }) =>
      where.replacesResultId ? moved : where.paymentId === 'p1' ? OLD : [];

  it('moves the old results to the re-post under their sealed rule', async () => {
    const s = setupKpiResults({ enabled: false });
    s.prisma.payment.findUnique.mockResolvedValue(REPOST);
    s.prisma.kpiResult.findMany.mockImplementation(results([]));

    const written = await s.service.recordForPayment('p2');

    expect(s.prisma.kpiResult.updateMany).toHaveBeenCalledWith({
      where: { paymentId: 'p1', status: 'ACTIVE' },
      data: {
        status: 'CANCELLED',
        cancelledAt: expect.any(Date),
        cancelReason: "To'lov tuzatildi",
      },
    });
    expect(written).toHaveLength(2);
    expect(s.prisma.kpiResult.create.mock.calls[0][0].data).toMatchObject({
      type: 'LEAD_PAID',
      leadId: 'L1',
      userId: 11,
      paymentId: 'p2',
      paymentAmount: 400_000,
      baseAmount: 400_000,
      ruleMode: 'PERCENT',
      ruleValue: 5,
      amount: 20_000,
      replacesResultId: 'r1',
    });
    expect(s.prisma.kpiResult.create.mock.calls[1][0].data).toMatchObject({
      type: 'PROMISE_KEPT',
      promiseId: 'pr1',
      userId: 12,
      paymentId: 'p2',
      baseAmount: 400_000,
      ruleMode: 'FIXED',
      amount: 20_000,
      replacesResultId: 'r2',
    });
  });

  it("re-points the moved promise's resolvedPaymentId to the re-post", async () => {
    const s = setupKpiResults({ enabled: false });
    s.prisma.payment.findUnique.mockResolvedValue(REPOST);
    s.prisma.kpiResult.findMany.mockImplementation(results([]));

    await s.service.recordForPayment('p2');

    expect(s.prisma.paymentPromise.updateMany).toHaveBeenCalledTimes(1);
    expect(s.prisma.paymentPromise.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr1', resolvedPaymentId: 'p1' },
      data: { resolvedPaymentId: 'p2' },
    });
  });

  it('moves nothing twice, yet still finishes a half-done re-point', async () => {
    const s = setupKpiResults();
    s.prisma.payment.findUnique.mockResolvedValue(REPOST);
    s.prisma.lead.findMany.mockResolvedValue([]);
    s.prisma.kpiResult.findMany.mockImplementation(
      results([{ replacesResultId: 'r1' }, { replacesResultId: 'r2' }]),
    );
    await expect(s.service.recordForPayment('p2')).resolves.toEqual([]);
    expect(s.prisma.kpiResult.create).not.toHaveBeenCalled();
    expect(s.prisma.paymentPromise.updateMany).toHaveBeenCalledWith({
      where: { id: 'pr1', resolvedPaymentId: 'p1' },
      data: { resolvedPaymentId: 'p2' },
    });
  });
});
