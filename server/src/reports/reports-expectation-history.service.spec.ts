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
      // Default: every requested branch has existed since before the month
      // and is not deleted — the common case, overridden per test below.
      branch: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            (where.id.in as number[]).map((id) => ({
              id,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              deletedAt: null,
            })),
          ),
        ),
      },
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

  it('keeps days before a branch existed, summing only the branches that did', async () => {
    // Branch 9 is created on 2026-09-15 — it has no rows before that, but it
    // does have rows afterwards, which is exactly what makes the OLD "seen
    // this month" gate wrongly drop days 1–14 (branchesThisMonth = 2 there).
    prisma.branch.findMany.mockResolvedValue([
      {
        id: 3,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
      {
        id: 9,
        createdAt: new Date('2026-09-15T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);
    const rows = [
      ...Array.from({ length: 14 }, (_, i) =>
        row(3, i + 1, 1_000_000, 100_000, 100_000),
      ),
      row(3, 15, 1_000_000, 100_000, 100_000),
      row(9, 15, 2_000_000, 200_000, 200_000),
    ];
    prisma.dailyFinancialSnapshot.findMany.mockResolvedValue(rows);

    const out = await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3, 9],
    });

    expect(out.points).toHaveLength(15);
    expect(out.points.slice(0, 14).map((p) => p.date)).toEqual(
      Array.from(
        { length: 14 },
        (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`,
      ),
    );
    expect(
      out.points.slice(0, 14).every((p) => p.expectedValue === 1_000_000),
    ).toBe(true);
    expect(out.points[14]).toMatchObject({
      date: '2026-09-15',
      expectedValue: 3_000_000,
    });
  });

  it('drops days from a branch soft-deleted mid-month, keeping the other branch alone', async () => {
    // Branch 3 is deleted on 2026-09-20. It has rows before that, which is
    // what makes the OLD "seen this month" gate expect it (wrongly) on and
    // after its deletion day too.
    prisma.branch.findMany.mockResolvedValue([
      {
        id: 3,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: new Date('2026-09-20T00:00:00.000Z'),
      },
      {
        id: 7,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        deletedAt: null,
      },
    ]);
    const rows = [
      row(3, 18, 10_000_000, 1_000_000, 800_000),
      row(7, 18, 5_000_000, 500_000, 200_000),
      row(3, 19, 10_000_000, 1_000_000, 800_000),
      row(7, 19, 5_000_000, 500_000, 200_000),
      // branch 3 no longer writes from its deletion day on
      row(7, 20, 5_000_000, 500_000, 200_000),
      row(7, 21, 5_000_000, 500_000, 200_000),
    ];
    prisma.dailyFinancialSnapshot.findMany.mockResolvedValue(rows);

    const out = await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3, 7],
    });

    expect(out.points.map((p) => p.date)).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
      '2026-09-21',
    ]);
    expect(out.points[0]).toMatchObject({ expectedValue: 15_000_000 });
    expect(out.points[2]).toMatchObject({
      date: '2026-09-20',
      expectedValue: 5_000_000,
    });
    expect(out.points[3]).toMatchObject({
      date: '2026-09-21',
      expectedValue: 5_000_000,
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

  it("a single-branch scope reads only that branch's rows and its own groups", async () => {
    prisma.dailyFinancialSnapshot.findMany.mockResolvedValue([
      row(3, 1, 10_000_000, 1_000_000, 800_000),
    ]);

    const out = await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3],
    });

    expect(
      prisma.dailyFinancialSnapshot.findMany.mock.calls[0][0].where.branchId,
    ).toEqual({ in: [3] });
    expect(out.branchId).toBe(3);
    expect(out.points[0]).toMatchObject({
      expectedValue: 10_000_000,
      lessonsHeldValue: 1_000_000,
      collectedForMonth: 800_000,
    });
    expect(prisma.group.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      branchId: { in: [3] },
    });
  });
});
