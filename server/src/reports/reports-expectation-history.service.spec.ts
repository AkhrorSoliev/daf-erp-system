import { ReportsExpectationHistoryService } from './reports-expectation-history.service';

describe('ReportsExpectationHistoryService — branch scope', () => {
  let prisma: any;
  let service: ReportsExpectationHistoryService;
  const row = (
    branchId: number | null,
    day: number,
    expectedValue: number | null,
    lessonsHeldValue: number | null,
    collectedForMonth: number | null,
  ) => ({
    branchId,
    date: new Date(Date.UTC(2026, 8, day)),
    expectedValue,
    lessonsHeldValue,
    collectedForMonth,
  });

  beforeEach(() => {
    prisma = {
      dailyFinancialSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findMany: jest.fn().mockResolvedValue([{ id: 'g-3a' }]) },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
      entityHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsExpectationHistoryService(prisma);
  });

  const groupHistoryWhere = () =>
    prisma.entityHistory.findMany.mock.calls
      .map((c: any[]) => c[0].where)
      .find((w: any) => w.entityType === 'Group');

  it('sums the per-branch rows of a multi-branch scope, never the company row', async () => {
    prisma.dailyFinancialSnapshot.findMany.mockResolvedValue([
      row(3, 1, 10_000_000, 1_000_000, 800_000),
      row(7, 1, 5_000_000, 500_000, 200_000),
      row(3, 2, 10_500_000, 2_000_000, 1_000_000),
      row(7, 2, 5_000_000, null, 300_000),
      row(3, 3, 11_000_000, 3_000_000, 2_000_000), // branch 7 missing
    ]);

    const out = await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3, 7],
    });

    expect(
      prisma.dailyFinancialSnapshot.findMany.mock.calls[0][0].where.branchId,
    ).toEqual({ in: [3, 7] });
    expect(out.points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(out.points[0]).toMatchObject({
      expectedValue: 15_000_000,
      lessonsHeldValue: 1_500_000,
      collectedForMonth: 1_000_000,
      collectionPct: 67,
      delta: null,
    });
    expect(out.points[1]).toMatchObject({
      expectedValue: 15_500_000,
      lessonsHeldValue: null,
      collectionPct: null,
      delta: 500_000,
    });
  });

  it("counts only the scope's groups for enrolment and group-status events", async () => {
    await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3, 7],
    });

    expect(prisma.group.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      branchId: { in: [3, 7] },
    });
    expect(groupHistoryWhere().entityId).toEqual({ in: ['g-3a'] });
    expect(
      prisma.enrollmentStateLog.findMany.mock.calls[0][0].where.enrollment
        .group,
    ).toEqual({ companyId: 1001, branchId: { in: [3, 7] } });
  });

  it('a company-wide caller reads the company row and every group', async () => {
    await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: null,
    });

    expect(
      prisma.dailyFinancialSnapshot.findMany.mock.calls[0][0].where.branchId,
    ).toBeNull();
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(groupHistoryWhere()).not.toHaveProperty('entityId');
  });
});
