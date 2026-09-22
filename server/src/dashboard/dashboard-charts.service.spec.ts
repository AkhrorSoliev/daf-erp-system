import { ForbiddenException } from '@nestjs/common';
import { DashboardChartsService } from './dashboard-charts.service';

const trendRows = [
  { month: 'Apr', monthKey: '2026-04', income: 100, expenses: 60, profit: 40 },
  { month: 'May', monthKey: '2026-05', income: 120, expenses: 70, profit: 50 },
];

const netProfit = {
  revenue: 200,
  teacherSalary: 90,
  adminSalary: 30,
  operatingExpenses: 40,
  refunds: 5,
  netProfit: 35,
  netMarginPercent: 17,
};

const flow = {
  arrived: 12,
  left: { frozen: 1, expelled: 2, graduated: 0, archived: 0, total: 3 },
  netChange: 9,
  inGroup: 365,
  groupless: 154,
};

function makeService(overrides: Record<string, any> = {}) {
  const reports = {
    getFinancialTrendCanonical: jest.fn().mockResolvedValue(trendRows),
    getMonthlyNetProfit: jest.fn().mockResolvedValue(netProfit),
    getStudentFlow: jest.fn().mockResolvedValue(flow),
    getAttendanceAnalytics: jest.fn().mockResolvedValue({
      trend: [
        { label: '1-hafta', rate: 88, total: 100 },
        { label: '2-hafta', rate: 91, total: 110 },
      ],
    }),
    ...overrides.reports,
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  };
  return {
    service: new DashboardChartsService(reports as never, redis as never),
    reports,
    redis,
  };
}

const CEO = {
  userId: 10406,
  companyId: 1001,
  roles: ['CEO'],
  branchScope: [1],
};

describe('DashboardChartsService.getCharts', () => {
  it("CEO uchun uchala diagramma ham to'ladi", async () => {
    const { service } = makeService();
    const res = await service.getCharts(CEO);

    expect(res.money!.trend).toEqual([
      { month: 'Apr', income: 100, expenses: 60, profit: 40 },
      { month: 'May', income: 120, expenses: 70, profit: 50 },
    ]);
    expect(res.students).toHaveLength(6);
    expect(res.attendance).toEqual([
      { label: '1-hafta', rate: 88 },
      { label: '2-hafta', rate: 91 },
    ]);
    expect(res.failed).toEqual([]);
  });

  it('foyda tarkibi «Sof foyda» kartasi bilan bitta obyektdan keladi', async () => {
    const { service, reports } = makeService();
    const res = await service.getCharts(CEO);

    expect(reports.getMonthlyNetProfit).toHaveBeenCalled();
    expect(res.money!.breakdown).toEqual({
      revenue: 200,
      teacherSalary: 90,
      adminSalary: 30,
      operatingExpenses: 40,
      refunds: 5,
      netProfit: 35,
    });
  });

  it('administratorga pul diagrammalari null, moliya servisi chaqirilmaydi', async () => {
    const { service, reports } = makeService();
    const res = await service.getCharts({ ...CEO, roles: ['Administrator'] });

    expect(res.money).toBeNull();
    expect(reports.getFinancialTrendCanonical).not.toHaveBeenCalled();
    expect(reports.getMonthlyNetProfit).not.toHaveBeenCalled();
    expect(res.students).not.toBeNull();
    expect(res.attendance).not.toBeNull();
  });

  it("kassirga diagramma umuman yo'q — manbalar ham chaqirilmaydi", async () => {
    const { service, reports } = makeService();
    const res = await service.getCharts({ ...CEO, roles: ['Cashier'] });

    expect(res.money).toBeNull();
    expect(res.students).toBeNull();
    expect(res.attendance).toBeNull();
    expect(reports.getStudentFlow).not.toHaveBeenCalled();
    expect(reports.getAttendanceAnalytics).not.toHaveBeenCalled();
  });

  it("bo'sh filial qamrovi 403 beradi", async () => {
    const { service } = makeService();
    await expect(
      service.getCharts({ ...CEO, branchScope: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bitta diagramma yiqilsa qolgani chiziladi', async () => {
    const { service } = makeService({
      reports: {
        getAttendanceAnalytics: jest
          .fn()
          .mockRejectedValue(new Error('davomat yiqildi')),
      },
    });
    const res = await service.getCharts(CEO);

    expect(res.attendance).toBeNull();
    expect(res.failed).toContain('attendance');
    expect(res.money).not.toBeNull();
    expect(res.students).not.toBeNull();
  });

  it('foyda tarkibi yiqilsa trend baribir chiziladi', async () => {
    const { service } = makeService({
      reports: {
        getMonthlyNetProfit: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });
    const res = await service.getCharts(CEO);

    expect(res.money!.breakdown).toBeNull();
    expect(res.money!.trend).toHaveLength(2);
    expect(res.failed).toEqual([]);
  });

  it('yiqilgan javob keshlanmaydi', async () => {
    const { service, redis } = makeService({
      reports: {
        getStudentFlow: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });
    await service.getCharts(CEO);
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("kesh kaliti rol darajasini o'z ichiga oladi", async () => {
    const { service, redis } = makeService();
    await service.getCharts(CEO);
    await service.getCharts({ ...CEO, roles: ['Administrator'] });

    const keys = redis.setex.mock.calls.map((c: any[]) => c[0]);
    expect(keys[0]).toContain(':money');
    expect(keys[1]).toContain(':ops');
  });

  it("o'quvchilar oqimi 6 oyni oladi va guruhdagilar sonini olmaydi", async () => {
    const { service, reports } = makeService();
    const res = await service.getCharts(CEO);

    expect(reports.getStudentFlow).toHaveBeenCalledTimes(6);
    // `inGroup` / `groupless` oyga bog'liq emas — seriyaga kirmasligi shart.
    expect(Object.keys(res.students![0]).sort()).toEqual([
      'arrived',
      'left',
      'month',
      'net',
    ]);
  });
});
