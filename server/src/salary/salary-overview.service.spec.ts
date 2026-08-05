import { Test, TestingModule } from '@nestjs/testing';
import { SalaryOverviewService } from './salary-overview.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The overview maps actualEarned / paid / advances per teacher in bulk,
 * attaches the latest payment, and surfaces the company-wide pending
 * (CALCULATED / APPROVED) set for the batch bar.
 *
 * It no longer carries an `expectedMonthly` figure: that was `students ×
 * exactDays.length * 4 × rate`, the four-week forecast deleted across the
 * codebase. It was never rendered — it only ordered this list — so the list now
 * orders by active student count instead.
 */
describe('SalaryOverviewService', () => {
  let service: SalaryOverviewService;
  let prisma: any;

  const ceoCaller = {
    mainBranch: 1,
    roles: [{ role: { name: 'CEO' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(ceoCaller),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      salaryAccrual: { groupBy: jest.fn().mockResolvedValue([]) },
      salaryPayment: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      expense: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryOverviewService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalaryOverviewService>(SalaryOverviewService);
  });

  it('returns an empty payload (no extra queries) when no teachers match', async () => {
    const res = await service.getOverview({}, 1, 999);

    expect(res.data).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.pending).toEqual({
      calculated: 0,
      approved: 0,
      approvedTotal: 0,
      calculatedIds: [],
      approvedIds: [],
    });
    // Short-circuits before the bulk fetches.
    expect(prisma.employeeSalaryConfig.findMany).not.toHaveBeenCalled();
  });

  it('maps live totals per teacher and counts their active students', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 10010,
        firstName: 'Jamsher',
        lastName: 'A',
        isActive: true,
        branches: [{ branch: { id: 1, name: 'Asosiy' } }],
      },
    ]);
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        id: 'c1',
        userId: 10010,
        salaryType: 'PERCENTAGE',
        value: 30,
        groupId: null,
        group: null,
      },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      {
        teacherId: 10010,
        group: {
          id: 'g1',
          exactDays: ['MON', 'WED', 'FRI'], // 3 → lessonsPerMonth = 12
          course: { price: 240_000, lessonPaymentCount: 12 }, // perLesson = 20_000
          _count: { enrollments: 5 },
        },
      },
    ]);
    prisma.salaryAccrual.groupBy.mockResolvedValue([
      { userId: 10010, _sum: { amount: 123_456 } },
    ]);
    prisma.salaryPayment.groupBy.mockResolvedValue([
      { userId: 10010, _sum: { amount: 700_000 } },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10010, _sum: { amount: 50_000 } },
    ]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      // createdAt DESC — first row is the latest.
      {
        id: 'p1',
        userId: 10010,
        amount: 100_000,
        status: 'CALCULATED',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-30'),
      },
      {
        id: 'p0',
        userId: 10010,
        amount: 90_000,
        status: 'PAID',
        periodStart: new Date('2026-05-01'),
        periodEnd: new Date('2026-05-31'),
      },
    ]);

    const res = await service.getOverview({}, 1, 999);

    expect(res.data).toHaveLength(1);
    const row = res.data[0];
    // Ordering key only — the active students across this teacher's groups.
    expect(row.activeStudentCount).toBe(5);
    expect(row).not.toHaveProperty('expectedMonthly');
    expect(row.actualEarned).toBe(123_456);
    expect(row.paidTotal).toBe(700_000);
    expect(row.advancesTotal).toBe(50_000);
    expect(row.latestPayment?.id).toBe('p1');
    // Pending: one CALCULATED, no APPROVED.
    expect(res.pending.calculatedIds).toEqual(['p1']);
    expect(res.pending.approved).toBe(0);
  });

  it('carries no money forecast for a FIXED_MONTHLY employee either', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 10020,
        firstName: 'Admin',
        lastName: 'B',
        isActive: true,
        branches: [],
      },
    ]);
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([
      {
        id: 'c2',
        userId: 10020,
        salaryType: 'FIXED_MONTHLY',
        value: 4_000_000,
        groupId: null,
        group: null,
      },
    ]);

    const res = await service.getOverview({}, 1, 999);

    // The config itself is still surfaced (the rate list renders it); what is
    // gone is a derived monthly money figure nobody displayed.
    expect(res.data[0].configs[0].value).toBe(4_000_000);
    expect(res.data[0]).not.toHaveProperty('expectedMonthly');
    expect(res.data[0].activeStudentCount).toBe(0);
  });

  it('scopes the teacher query to the mainBranch for a Branch Director', async () => {
    prisma.user.findUnique.mockResolvedValue({
      mainBranch: 7,
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await service.getOverview({}, 1, 555);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branches: { some: { branchId: 7 } },
        }),
      }),
    );
  });

  it('does NOT branch-scope for a CEO', async () => {
    await service.getOverview({}, 1, 999);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.branches).toBeUndefined();
  });
});
