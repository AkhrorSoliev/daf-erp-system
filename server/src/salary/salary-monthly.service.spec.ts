import { Test, TestingModule } from '@nestjs/testing';
import { SalaryMonthlyService } from './salary-monthly.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The monthly report resolves a picked month to its payroll period, then per
 * teacher computes covered (live accruals), gap (uncovered billable × rate),
 * fullDeserved = covered + gap, advances (given that month), and a net-to-pay
 * that never double-subtracts a settled payment's advances. Manual/config-gap
 * months (May) report blank (`null`) per-lesson columns.
 */
describe('SalaryMonthlyService', () => {
  let service: SalaryMonthlyService;
  let prisma: any;

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(ceoCaller),
        findMany: jest.fn().mockResolvedValue([]),
      },
      salaryAccrual: { findMany: jest.fn().mockResolvedValue([]) },
      attendance: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([]) },
      lessonTeacherOverride: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { groupBy: jest.fn().mockResolvedValue([]) },
      salaryPayment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryMonthlyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SalaryMonthlyService>(SalaryMonthlyService);
  });

  const teacher = (id: number, first = 'T', last = 'X') => ({
    id,
    firstName: first,
    lastName: last,
    isActive: true,
    branches: [{ branch: { id: 1, name: 'Asosiy' } }],
  });

  it('returns an empty payload (no attendance sweep) when no teachers match', async () => {
    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    expect(res.data).toEqual([]);
    expect(res.totals).toEqual({
      fullDeserved: 0,
      covered: 0,
      gap: 0,
      advances: 0,
      netToPay: 0,
    });
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('computes covered + gap + fullDeserved for a PERCENTAGE teacher', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } }, // perLesson = 20_000
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30, // 30% of 20_000 = 6_000 per lesson
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    // One covered lesson (a1) already has an accrual; one uncovered (a2) → gap.
    prisma.salaryAccrual.findMany.mockResolvedValue([
      { userId: 10010, attendanceId: 'a1', amount: 6_000 },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-06-10') },
      { id: 'a2', groupId: 'g1', date: new Date('2026-06-12') },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.hasLessonData).toBe(true);
    expect(row.covered).toBe(6_000);
    expect(row.gap).toBe(6_000);
    expect(row.fullDeserved).toBe(12_000);
    expect(row.netToPay).toBe(6_000); // COVERED base − 0 advances
    expect(res.totals).toEqual(
      expect.objectContaining({ fullDeserved: 12_000, covered: 6_000, gap: 6_000 }),
    );
  });

  it('blanks the per-lesson columns for a manual/config-gap month (May)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010, 'Jamsher')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10010 },
    ]);
    // Config only becomes effective in June → no rate for a May lesson.
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'PERCENTAGE',
        value: 30,
        effectiveFrom: new Date('2026-06-01'),
        effectiveTo: null,
        config: { userId: 10010, groupId: null, salaryType: 'PERCENTAGE' },
      },
    ]);
    prisma.salaryAccrual.findMany.mockResolvedValue([]); // no accruals in May
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-05-15') },
    ]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10010,
        amount: 20_840_343,
        status: 'CALCULATED',
        settledExpenses: [],
      },
    ]);

    const res = await service.getMonthly({ month: '2026-05' }, 1, 999);

    const row = res.data[0];
    expect(row.hasLessonData).toBe(false);
    expect(row.fullDeserved).toBeNull();
    expect(row.covered).toBeNull();
    expect(row.gap).toBeNull();
    expect(row.netToPay).toBe(20_840_343); // the entered manual amount
    expect(row.payment?.status).toBe('CALCULATED');
  });

  it('does NOT double-subtract advances from a settled payment (net = payment amount)', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10010)]);
    prisma.salaryPayment.findMany.mockResolvedValue([
      {
        id: 'p1',
        userId: 10010,
        amount: 500_000, // already net of the settled advance
        status: 'PAID',
        settledExpenses: [{ amount: 100_000 }],
      },
    ]);
    prisma.expense.groupBy.mockResolvedValue([
      { relatedUserId: 10010, _sum: { amount: 100_000 } },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.advances).toBe(100_000);
    expect(row.netToPay).toBe(500_000); // NOT 400_000
  });

  it('flags a FIXED_MONTHLY teacher and computes no gap', async () => {
    prisma.user.findMany.mockResolvedValue([teacher(10020, 'Admin')]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'g1', course: { price: 240_000, lessonPaymentCount: 12 } },
    ]);
    prisma.groupTeacher.findMany.mockResolvedValue([
      { groupId: 'g1', teacherId: 10020 },
    ]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        salaryType: 'FIXED_MONTHLY',
        value: 4_000_000,
        effectiveFrom: new Date('2026-05-01'),
        effectiveTo: null,
        config: { userId: 10020, groupId: null, salaryType: 'FIXED_MONTHLY' },
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      { id: 'a1', groupId: 'g1', date: new Date('2026-06-10') },
    ]);

    const res = await service.getMonthly({ month: '2026-06' }, 1, 999);

    const row = res.data[0];
    expect(row.isFixedMonthly).toBe(true);
    expect(row.gap).toBeNull(); // no fabricated per-lesson gap
    expect(row.hasLessonData).toBe(false);
  });

  it('scopes the teacher query to the mainBranch for a Branch Director', async () => {
    prisma.user.findUnique.mockResolvedValue({
      mainBranch: 7,
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await service.getMonthly({ month: '2026-06' }, 1, 555);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branches: { some: { branchId: 7 } } }),
      }),
    );
  });

  it('does NOT branch-scope for a CEO', async () => {
    await service.getMonthly({ month: '2026-06' }, 1, 999);

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.branches).toBeUndefined();
  });

  it('clamps a month earlier than the company start up to the floor', async () => {
    const res = await service.getMonthly({ month: '2026-03' }, 1, 999);

    expect(res.floorMonth).toBe('2026-05');
    expect(res.month).toBe('2026-05');
  });
});
