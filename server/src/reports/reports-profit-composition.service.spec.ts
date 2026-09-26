import { ReportsProfitCompositionService } from './reports-profit-composition.service';

/** A held lesson as `valueHeldLessons` returns it. */
const lesson = (
  studentId: number,
  groupId: string,
  value: number,
  over: Partial<{ branchId: number; courseName: string; dateStr: string }> = {},
) => ({
  attendanceId: `${studentId}-${groupId}-${over.dateStr ?? '2026-09-10'}`,
  studentId,
  groupId,
  branchId: over.branchId ?? 1,
  courseName: over.courseName ?? 'Standart',
  dateStr: over.dateStr ?? '2026-09-10',
  value,
});

describe('ReportsProfitCompositionService', () => {
  let prisma: any;
  let reports: any;
  let service: ReportsProfitCompositionService;

  // 26.09.2026 20:00 Tashkent.
  const now = new Date('2026-09-26T15:00:00Z');

  const netProfit = {
    revenue: 200_000,
    revenueBasis: 'recognized',
    teacherSalary: 90_000,
    teacherSalaryBasis: 'hisoblangan',
    teacherSalaryHasTopup: true,
    adminSalary: 20_000,
    adminSalaryBasis: 'hisoblangan',
    operatingExpenses: 10_000,
    refunds: 0,
    netProfit: 80_000,
    netMarginPercent: 40,
    memo: { writeOffs: 0, providerFees: 0, advances: 0 },
  };

  beforeEach(() => {
    prisma = {
      branch: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, name: "Farg'ona" },
          { id: 2, name: 'Namangan' },
        ]),
      },
      expense: { findMany: jest.fn() },
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      enrollment: { findMany: jest.fn() },
      student: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // This month, then last month.
    prisma.expense.findMany
      .mockResolvedValueOnce([
        {
          category: 'MARKETING',
          description: 'SMM',
          amount: 10_000,
          date: new Date('2026-09-21T00:00:00Z'),
          branchId: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          category: 'RENT',
          description: 'Ijara',
          amount: 30_000,
          date: new Date('2026-08-29T00:00:00Z'),
          branchId: 1,
        },
      ]);
    // Students 1 and 3 still study; 2 left and 4 was never billed.
    prisma.enrollment.findMany.mockResolvedValue([
      { studentId: 1 },
      { studentId: 3 },
    ]);
    reports = {
      assembleMonthlyNetProfit: jest.fn().mockResolvedValue({
        month: '2026-09',
        netProfit,
        lessons: [
          lesson(1, 'a', 100_000),
          lesson(2, 'a', 50_000), // left group a
          lesson(3, 'b', 50_000, { branchId: 2, courseName: 'Intensive' }),
          lesson(4, 'a', 0), // nothing billed it
        ],
        salaries: {
          data: [
            {
              user: { firstName: 'Jamsher', lastName: '' },
              fullDeserved: 60_000,
              covered: 55_000,
            },
            {
              user: { firstName: 'Eldor', lastName: '' },
              fullDeserved: 30_000,
              covered: 30_000,
            },
            { user: { firstName: 'Bo‘sh', lastName: '' }, fullDeserved: 0 },
          ],
          totals: { advances: 7_000 },
          staff: [
            {
              user: {
                firstName: 'Admin',
                lastName: 'A',
                position: 'Administrator',
              },
              monthly: 20_000,
            },
          ],
        },
      }),
    };
    service = new ReportsProfitCompositionService(prisma, reports);
  });

  const run = (branchIds: number[] | null = null) =>
    service.getProfitComposition(1001, {
      month: '2026-09',
      branchIds,
      performedById: 10456,
      now,
    });

  it("reports the card's own figure and the rows it was computed from", async () => {
    const r = await run();

    expect(r.netProfit).toBe(80_000);
    expect(r.revenue.total).toBe(200_000);
    // A lesson nothing billed is not a student the month earned from.
    expect(r.revenue.studentCount).toBe(3);
    expect(r.revenue.byCourse.rows).toEqual([
      { name: 'Standart', amount: 150_000 },
      { name: 'Intensive', amount: 50_000 },
    ]);
    expect(r.revenue.byBranch).toEqual([
      { id: 1, name: "Farg'ona", amount: 150_000 },
      { id: 2, name: 'Namangan', amount: 50_000 },
    ]);
    // Top-up month: the full deserved figure, the one the total uses.
    expect(r.teachers.rows).toEqual([
      { name: 'Jamsher', amount: 60_000 },
      { name: 'Eldor', amount: 30_000 },
    ]);
    expect(r.teachers).toEqual(
      expect.objectContaining({ total: 90_000, count: 2, advances: 7_000 }),
    );
    expect(r.staff.rows).toEqual([
      { name: 'Admin A', detail: 'Administrator', amount: 20_000 },
    ]);
    expect(r.expenses.categories).toEqual([
      {
        category: 'MARKETING',
        amount: 10_000,
        items: [{ description: 'SMM', amount: 10_000 }],
      },
    ]);
  });

  it('forecasts a running month from its remaining lessons and missing recurring costs', async () => {
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValueOnce([
      {
        studentId: 1,
        groupId: 'a',
        perLessonCost: 10_000,
        coveredDates: ['2026-09-24', '2026-09-28', '2026-09-30'],
        frozenOutDates: [],
      },
    ]);

    const r = await run();

    expect(r.status).toEqual(
      expect.objectContaining({ isOpen: true, daysPassed: 26 }),
    );
    expect(r.forecast).toEqual({
      remainingLessons: { count: 2, value: 20_000 },
      // At this month's teacher share so far: 90 000 / 200 000.
      remainingTeacherPay: 9_000,
      missingExpenses: [
        {
          key: 'RENT',
          amount: 30_000,
          lastMonthAmount: 30_000,
          lastMonthDay: 29,
        },
      ],
      expectedNetProfit: 80_000 + 20_000 - 9_000 - 30_000,
    });
  });

  it('adds no forecast to a closed month and does not look at last month', async () => {
    const r = await service.getProfitComposition(1001, {
      month: '2026-08',
      branchIds: null,
      performedById: 10456,
      now,
    });

    expect(r.forecast).toBeNull();
    expect(prisma.expense.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });

  it('names the revenue that left with students who owe it', async () => {
    prisma.student.findMany.mockResolvedValueOnce([
      { id: 2, balance: -80_000 },
    ]);

    const r = await run();

    expect(prisma.student.findMany).toHaveBeenCalledWith({
      where: { id: { in: [2] }, balance: { lt: 0 } },
      select: { id: true, balance: true },
    });
    expect(r.unpaidLeft).toEqual({ students: 1, lessons: 1, amount: 50_000 });
  });

  it('flags a branch that held lessons but recorded no expense', async () => {
    const r = await run();
    expect(r.branchesWithoutExpenses).toEqual([{ id: 2, name: 'Namangan' }]);
  });

  it('does not flag branches, or split by them, inside one branch', async () => {
    const r = await run([1]);
    expect(r.branchesWithoutExpenses).toEqual([]);
    expect(r.revenue.byBranch).toEqual([]);
  });

  it('scopes every query of its own to the branch', async () => {
    await run([1]);

    for (const call of prisma.expense.findMany.mock.calls) {
      expect(call[0].where.branchId).toEqual({ in: [1] });
      expect(call[0].where.category).toEqual({ not: 'TEACHER_ADVANCE' });
    }
    expect(
      prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].where.branchId,
    ).toEqual({ in: [1] });
    expect(reports.assembleMonthlyNetProfit).toHaveBeenCalledWith(1001, {
      month: '2026-09',
      branchIds: [1],
      performedById: 10456,
    });
  });

  it('returns zeros for an empty scope without computing anything', async () => {
    const r = await run([]);
    expect(r.netProfit).toBe(0);
    expect(reports.assembleMonthlyNetProfit).not.toHaveBeenCalled();
  });

  it('shows no per-person rows when a salary leg fell back to cash', async () => {
    reports.assembleMonthlyNetProfit.mockResolvedValueOnce({
      ...(await reports.assembleMonthlyNetProfit()),
      netProfit: {
        ...netProfit,
        teacherSalaryBasis: 'naqd',
        adminSalaryBasis: 'naqd',
      },
    });

    const r = await run();

    expect(r.teacherSalaryBasis).toBe('naqd');
    expect(r.teachers.rows).toEqual([]);
    expect(r.staff.rows).toEqual([]);
  });
});
