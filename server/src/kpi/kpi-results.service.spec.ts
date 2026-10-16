import { Prisma } from '@prisma/client';
import { KpiResultsService } from './kpi-results.service';
import type { KpiSettings } from './kpi-rules';

const at = (iso: string) => new Date(`${iso}+05:00`);
const SETTINGS: KpiSettings = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: 'FIXED', value: 50_000 },
  promiseKept: { mode: 'FIXED', value: 20_000 },
};
const PAYMENT = {
  id: 'p1',
  studentId: 10500,
  amount: 600_000,
  status: 'COMPLETED',
  createdAt: at('2026-10-20T10:00:00'),
  companyId: 1001,
  branchId: 2,
  correctsPaymentId: null as string | null,
};
const FIRST = {
  id: 'p1',
  amount: 600_000,
  createdAt: PAYMENT.createdAt,
  branchId: 2,
};
const LEAD = {
  id: 'L1',
  ownerId: 11,
  branchId: 3 as number | null,
  statusChangedAt: at('2026-10-18T09:00:00'),
  conversionKind: 'NEW_STUDENT' as string | null,
};
const ROLES: Record<number, string[]> = {
  11: ['Administrator'],
  12: ['Administrator', 'CEO'],
  13: ['Administrator', 'Branch Director'],
  14: ['Cashier'],
};

export function setupKpiResults(settings: Partial<KpiSettings> = {}) {
  const prisma = {
    payment: {
      findUnique: jest.fn().mockResolvedValue(PAYMENT),
      findFirst: jest.fn().mockResolvedValue(FIRST),
      findMany: jest.fn().mockResolvedValue([]),
    },
    lead: { findMany: jest.fn().mockResolvedValue([LEAD]) },
    paymentPromise: { findMany: jest.fn().mockResolvedValue([]) },
    kpiResult: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: { where: { id: number } }) =>
        ROLES[where.id]
          ? { roles: ROLES[where.id].map((name) => ({ role: { name } })) }
          : null,
      ),
    },
  };
  const kpiSettings = {
    read: jest.fn().mockResolvedValue({ ...SETTINGS, ...settings }),
  };
  const service = new KpiResultsService(prisma as never, kpiSettings as never);
  return { prisma, kpiSettings, service };
}

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
});

describe('KpiResultsService.recordForPayment — PROMISE_KEPT', () => {
  const PROMISE = {
    id: 'pr1',
    createdById: 11,
    balanceAtPromise: -400_000,
    branchId: null as number | null,
    studentId: 10500,
    companyId: 1001,
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
