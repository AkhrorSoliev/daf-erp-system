import { ReportsMarketingService } from './reports-marketing.service';

describe('ReportsMarketingService', () => {
  const prisma = {
    payment: { groupBy: jest.fn() },
    expense: { findMany: jest.fn() },
  };
  const financial = { getMonthCharges: jest.fn() };
  const departed = { getDepartedStudentsSummary: jest.fn() };
  const leadFunnel = { getSourceBreakdown: jest.fn() };
  const service = new ReportsMarketingService(
    prisma as never,
    financial as never,
    departed as never,
    leadFunnel as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // 15.10.2026 10:00 in Tashkent.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:00:00Z'));
    prisma.payment.groupBy.mockResolvedValue([
      {
        studentId: 10001,
        _min: { createdAt: new Date('2026-10-03T05:00:00Z') },
        _sum: { amount: 900_000 },
      },
      {
        studentId: 10002,
        _min: { createdAt: new Date('2026-10-12T05:00:00Z') },
        _sum: { amount: 450_000 },
      },
      {
        studentId: 10003,
        _min: { createdAt: new Date('2026-09-05T05:00:00Z') },
        _sum: { amount: 1_350_000 },
      },
      {
        studentId: 10004,
        _min: { createdAt: new Date('2026-05-10T05:00:00Z') },
        _sum: { amount: 2_000_000 },
      },
    ]);
    prisma.expense.findMany.mockResolvedValue([
      { date: new Date('2026-10-01T00:00:00Z'), amount: 300_000 },
      { date: new Date('2026-10-31T00:00:00Z'), amount: 100_000 },
      { date: new Date('2026-09-15T00:00:00Z'), amount: 450_000 },
      { date: new Date('2026-05-02T00:00:00Z'), amount: 200_000 },
    ]);
    financial.getMonthCharges.mockResolvedValue({
      month: '2026-10',
      charged: 4_500_000,
      paid: 0,
      unpaid: 0,
      paidPct: 0,
      students: 10,
      unpaidStudents: 0,
    });
    departed.getDepartedStudentsSummary.mockResolvedValue({
      avgDurationMonths: 3.4,
    });
    leadFunnel.getSourceBreakdown.mockResolvedValue([
      { source: 'Instagram', leads: 12, students: 3, rate: 25 },
    ]);
  });

  afterEach(() => jest.useRealTimers());

  it('answers the asked month and every month back to 2026-05, newest first', async () => {
    const r = await service.getMarketing(1001, {
      month: '2026-10',
      branchIds: null,
    });

    expect(r.months.map((m) => m.month)).toEqual([
      '2026-10',
      '2026-09',
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
    ]);
    expect(r).toMatchObject({
      month: '2026-10',
      spend: 400_000,
      newStudents: 2,
      cac: 200_000,
      cohortPaid: 1_350_000,
      roi: 3.38,
      transition: false,
      ltv: { value: 1_530_000, avgMonths: 3.4, monthlyCharge: 450_000 },
      sources: [{ source: 'Instagram', leads: 12, students: 3, rate: 25 }],
    });
    expect(r.months[1]).toMatchObject({
      month: '2026-09',
      spend: 450_000,
      newStudents: 1,
      cac: 450_000,
      roi: 3,
    });
    expect(r.months[5]).toMatchObject({
      month: '2026-05',
      newStudents: 1,
      cac: null,
      cohortPaid: null,
      roi: null,
      transition: true,
    });
  });

  it('clamps a month after the current one, and one before the floor', async () => {
    expect(
      (await service.getMarketing(1001, { month: '2027-01', branchIds: null }))
        .month,
    ).toBe('2026-10');
    expect(
      (await service.getMarketing(1001, { month: '2026-03', branchIds: null }))
        .month,
    ).toBe('2026-05');
    expect((await service.getMarketing(1001, { branchIds: null })).month).toBe(
      '2026-10',
    );
  });

  it("reads first payments, spend and the three services in the caller's one scope", async () => {
    await service.getMarketing(1001, { month: '2026-10', branchIds: [4] });

    expect(prisma.payment.groupBy.mock.calls[0][0]).toEqual({
      by: ['studentId'],
      where: {
        companyId: 1001,
        status: 'COMPLETED',
        student: {
          deletedAt: null,
          enrollments: { some: { deletedAt: null } },
          branches: { some: { branchId: { in: [4] } } },
        },
      },
      _min: { createdAt: true },
      _sum: { amount: true },
    });
    // `Expense.date` is `@db.Date`: plain dates, the next month exclusive.
    expect(prisma.expense.findMany.mock.calls[0][0]).toEqual({
      where: {
        companyId: 1001,
        deletedAt: null,
        category: 'MARKETING',
        date: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
        branchId: { in: [4] },
      },
      select: { date: true, amount: true },
    });
    expect(departed.getDepartedStudentsSummary).toHaveBeenCalledWith(1001, {
      scope: [4],
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(financial.getMonthCharges).toHaveBeenCalledWith(1001, {
      month: '2026-10',
      branchIds: [4],
    });
    expect(leadFunnel.getSourceBreakdown).toHaveBeenCalledWith(
      1001,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      [4],
    );
  });

  it('before monthly billing there is no charge per month (no LTV), and before 10.09.2026 no lead source', async () => {
    const r = await service.getMarketing(1001, {
      month: '2026-08',
      branchIds: null,
    });

    expect(financial.getMonthCharges).not.toHaveBeenCalled();
    expect(leadFunnel.getSourceBreakdown).not.toHaveBeenCalled();
    expect(r.ltv).toBeNull();
    expect(r.sources).toBeNull();
  });

  it('September asks the funnel for the whole month (it clamps the start itself)', async () => {
    await service.getMarketing(1001, { month: '2026-09', branchIds: null });

    expect(leadFunnel.getSourceBreakdown).toHaveBeenCalledWith(
      1001,
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      null,
    );
  });
});
