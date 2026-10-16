import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { KpiReadService } from './kpi-read.service';

const NOW = new Date('2026-10-14T12:00:00+05:00');
const NOVEMBER = new Date('2026-11-14T12:00:00+05:00');
const SETTINGS = {
  enabled: true,
  changedAt: null,
  leadPaid: { mode: 'FIXED', value: 50_000 },
  promiseKept: { mode: 'FIXED', value: 20_000 },
};

function setup() {
  const prisma = {
    kpiResult: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    lead: { groupBy: jest.fn().mockResolvedValue([]) },
    leadOwnershipLog: { findMany: jest.fn().mockResolvedValue([]) },
    paymentPromise: { findMany: jest.fn().mockResolvedValue([]) },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest
        .fn()
        .mockResolvedValue({ id: 11, firstName: 'Nodira', lastName: 'R' }),
      count: jest.fn().mockResolvedValue(1),
    },
    student: { findMany: jest.fn().mockResolvedValue([]) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const kpiSettings = { read: jest.fn().mockResolvedValue(SETTINGS) };
  return {
    prisma,
    service: new KpiReadService(prisma as never, kpiSettings as never),
  };
}

const ADMIN = {
  id: 11,
  firstName: 'Nodira',
  lastName: 'R',
  deletedAt: null,
  status: 'ACTIVE',
  roles: [{ role: { name: 'Administrator' } }],
};
const result = (occurredAt: string, month: string) => ({
  userId: 11,
  type: 'LEAD_PAID',
  status: 'ACTIVE',
  amount: 50_000,
  occurredAt: new Date(occurredAt),
  month,
});

describe('KpiReadService.overview', () => {
  it('refuses an empty branch scope', async () => {
    await expect(setup().service.overview(1001, [], {}, NOW)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('refuses a month before October 2026 and a future one', async () => {
    const s = setup();
    await expect(
      s.service.overview(1001, null, { month: '2026-09' }, NOW),
    ).rejects.toThrow(BadRequestException);
    await expect(
      s.service.overview(1001, null, { month: '2026-11' }, NOW),
    ).rejects.toThrow(BadRequestException);
    await expect(
      s.service.overview(1001, null, { compare: '2026-11' }, NOW),
    ).rejects.toThrow(BadRequestException);
  });

  it('reads the month and the one before by default, inside the branch', async () => {
    const s = setup();
    const out = await s.service.overview(1001, [2], {}, NOW);

    expect(out.month).toBe('2026-10');
    expect(out.compare).toBe('2026-09');
    expect(out.status).toEqual({ enabled: true, changedAt: null });
    expect(out.rows).toEqual([]);
    expect(out.cards.forecast).toBe(0);
    expect(s.prisma.kpiResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1001, month: '2026-10', branchId: { in: [2] } },
      }),
    );
    expect(s.prisma.leadOwnershipLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ branchId: { in: [2] } }, { branchId: null }],
        }),
      }),
    );
  });

  it('says there is nothing to compare with when the compare month is before October 2026', async () => {
    const s = setup();
    const out = await s.service.overview(1001, null, {}, NOW);

    expect(out.compare).toBe('2026-09');
    expect(out.compareAvailable).toBe(false);
    // Nothing is read for a month that cannot hold KPI data: no zero is passed off as a comparison.
    const months = s.prisma.kpiResult.findMany.mock.calls.map(
      (c: [{ where: { month?: unknown } }]) => c[0].where.month,
    );
    expect(months).not.toContain('2026-09');
    // received + expired of the month only
    expect(s.prisma.leadOwnershipLog.findMany).toHaveBeenCalledTimes(2);
  });

  it('compares with the month before once there is one, ACTIVE results only', async () => {
    const s = setup();
    const out = await s.service.overview(1001, null, {}, NOVEMBER);

    expect(out.compare).toBe('2026-10');
    expect(out.compareAvailable).toBe(true);
    const calls = s.prisma.kpiResult.findMany.mock.calls.map(
      (c: [{ where: Record<string, unknown> }]) => c[0].where,
    );
    expect(calls).toContainEqual(
      expect.objectContaining({ month: '2026-10', status: 'ACTIVE' }),
    );
    expect(calls).toContainEqual(
      expect.objectContaining({
        month: { in: ['2026-10', '2026-11'] },
        status: 'ACTIVE',
      }),
    );
    // the month itself is the only read that keeps cancelled rows
    expect(calls.filter((w) => w.status === undefined)).toHaveLength(1);
    expect(s.prisma.leadOwnershipLog.findMany).toHaveBeenCalledTimes(4);
  });

  it('flags a holder with leads and no result in the last 7 days, through the one 7-day rule', async () => {
    const s = setup();
    s.prisma.lead.groupBy.mockResolvedValue([
      { ownerId: 11, _count: { _all: 3 } },
    ]);
    s.prisma.user.findMany.mockResolvedValue([ADMIN]);
    // 12 days ago: outside the 7 Tashkent days ending today.
    const old = result('2026-10-02T05:00:00Z', '2026-10');
    s.prisma.kpiResult.findMany.mockResolvedValue([old]);

    const quiet = await s.service.overview(1001, null, {}, NOW);
    expect(quiet.signals.map((x) => x.kind)).toContain('SILENT');

    // 4 days ago: inside, and it is in the series read, not a second query.
    const fresh = result('2026-10-10T05:00:00Z', '2026-10');
    s.prisma.kpiResult.findMany.mockResolvedValue([fresh]);
    const active = await s.service.overview(1001, null, {}, NOW);
    expect(active.signals.map((x) => x.kind)).not.toContain('SILENT');
  });
});

describe('KpiReadService.user', () => {
  it('answers 404 for someone outside the branch with no result in it', async () => {
    const s = setup();
    s.prisma.user.count.mockResolvedValue(0);
    s.prisma.kpiResult.count.mockResolvedValue(0);
    await expect(s.service.user(1001, [2], 11, {}, NOW)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("lists the month's results with how each was counted, the cancelled ones too", async () => {
    const s = setup();
    s.prisma.kpiResult.count.mockResolvedValue(2);
    s.prisma.kpiResult.findMany
      .mockResolvedValueOnce([
        {
          id: 'r1',
          type: 'LEAD_PAID',
          occurredAt: new Date('2026-10-05T05:00:00Z'),
          studentId: 10500,
          paymentAmount: 600_000,
          amount: 30_000,
          ruleMode: 'PERCENT',
          ruleValue: 5,
          baseAmount: 600_000,
          status: 'ACTIVE',
          cancelledAt: null,
          cancelReason: null,
        },
        {
          id: 'r2',
          type: 'PROMISE_KEPT',
          occurredAt: new Date('2026-10-03T05:00:00Z'),
          studentId: 10501,
          paymentAmount: 400_000,
          amount: 20_000,
          ruleMode: 'FIXED',
          ruleValue: 20_000,
          baseAmount: 400_000,
          status: 'CANCELLED',
          cancelledAt: new Date('2026-10-04T05:00:00Z'),
          cancelReason: "To'lov bekor qilindi",
        },
      ])
      .mockResolvedValueOnce([{ month: '2026-10', amount: 30_000 }]);
    s.prisma.student.findMany.mockResolvedValue([
      { id: 10500, firstName: 'Ali', lastName: 'Valiyev' },
      { id: 10501, firstName: 'Vali', lastName: 'Aliyev' },
    ]);

    const out = await s.service.user(1001, null, 11, {}, NOW);

    expect(out.user).toEqual({ id: 11, name: 'Nodira R' });
    expect(out.hasAny).toBe(true);
    expect(out.total).toBe(30_000);
    expect(out.compareTotal).toBe(0);
    expect(out.months).toEqual([
      { month: '2026-10', count: 1, amount: 30_000 },
    ]);
    expect(
      out.results.map((r) => [
        r.studentName,
        r.explanation,
        r.status,
        r.cancelReason,
      ]),
    ).toEqual([
      ['Ali Valiyev', "birinchi to'lov 600 000 × 5%", 'ACTIVE', null],
      ['Vali Aliyev', "qat'iy summa", 'CANCELLED', "To'lov bekor qilindi"],
    ]);
  });
});
