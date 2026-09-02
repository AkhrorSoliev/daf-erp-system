import { ForbiddenException } from '@nestjs/common';
import { DashboardSummaryService } from './dashboard-summary.service';

const financialOverview = {
  income: { actual: 128_450_000, paymentCount: 214 },
  forecast: { expectedMonthEnd: 176_200_000 },
  netProfit: 78_000_000,
};

const kpis = {
  activeStudents: { current: 842, trend: 3 },
  activeGroups: 47,
  averageAttendance: 88,
  newStudentsThisMonth: 63,
  churnedThisMonth: 19,
};

const debtorSummary = {
  totalDebt: -27_748_684,
  debtorCount: 177,
  avgDebt: -156_772,
  openPromises: 9,
  overduePromises: 5,
};

const todaySchedule = {
  lessons: [
    {
      groupId: 'g1',
      groupName: 'A1-07',
      startTime: '09:00',
      endTime: '10:30',
      roomName: '101-xona',
      teachers: [{ id: 1, firstName: 'Aziza', lastName: 'Karimova' }],
      studentCount: 14,
    },
  ],
};

function makeService(overrides: Record<string, any> = {}) {
  const reports = {
    getFinancialOverview: jest.fn().mockResolvedValue(financialOverview),
    getNetProfitWithBasis: jest.fn().mockResolvedValue({
      netProfit: 18_930_000,
      netProfitBasis: 'recognized',
    }),
    getKpis: jest.fn().mockResolvedValue(kpis),
    ...overrides.reports,
  };
  const payments = {
    getDebtorSummary: jest.fn().mockResolvedValue(debtorSummary),
    getDebtors: jest.fn().mockResolvedValue({ data: [] }),
    ...overrides.payments,
  };
  const outreach = {
    getStats: jest.fn().mockResolvedValue({
      todayAbsentees: 12,
      removalQueue: 3,
      activePromises: 8,
      callsToday: 4,
    }),
    ...overrides.outreach,
  };
  const dashboard = {
    getTodaySchedule: jest.fn().mockResolvedValue(todaySchedule),
    ...overrides.dashboard,
  };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  };

  const service = new DashboardSummaryService(
    reports,
    payments,
    outreach,
    dashboard,
    redis as any,
  );
  return { service, reports, payments, outreach, dashboard, redis };
}

const CEO = {
  userId: 10406,
  companyId: 1001,
  roles: ['CEO'],
  branchScope: [1],
};

describe('DashboardSummaryService.getSummary', () => {
  it("CEO uchun pul bloki to'ladi", async () => {
    const { service } = makeService();
    const res = await service.getSummary(CEO);

    expect(res.money).toEqual({
      monthIncome: 128_450_000,
      paymentCount: 214,
      expectedMonthEnd: 176_200_000,
      netProfit: 18_930_000,
      netProfitBasis: 'recognized',
      debt: { total: 27_748_684, count: 177 },
    });
  });

  it('administrator uchun pul bloki null va moliya servisi umuman chaqirilmaydi', async () => {
    const { service, reports } = makeService();
    const res = await service.getSummary({ ...CEO, roles: ['Administrator'] });

    expect(res.money).toBeNull();
    expect(reports.getFinancialOverview).not.toHaveBeenCalled();
    expect(reports.getNetProfitWithBasis).not.toHaveBeenCalled();
  });

  it('kassir uchun outreach sonlari nol, top qarzdorlar qoladi', async () => {
    const { service, payments, outreach } = makeService({
      payments: {
        getDebtors: jest.fn().mockResolvedValue({
          data: [
            {
              id: 10061,
              firstName: 'Sardor',
              lastName: 'Nazarov',
              balance: -1_240_000,
            },
          ],
        }),
      },
    });
    const res = await service.getSummary({ ...CEO, roles: ['Cashier'] });

    expect(outreach.getStats).not.toHaveBeenCalled();
    expect(res.attention).toEqual({
      todayAbsentees: 0,
      brokenPromises: 0,
      removalQueue: 0,
      topDebtors: [{ id: 10061, name: 'Sardor Nazarov', balance: -1_240_000 }],
    });
    expect(payments.getDebtors).toHaveBeenCalled();
  });

  it("bo'sh filial qamrovi 403 beradi", async () => {
    const { service } = makeService();
    await expect(
      service.getSummary({ ...CEO, branchScope: [] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('moliya yiqilsa qolgan bloklar chiqadi va failed da nomi turadi', async () => {
    const { service } = makeService({
      reports: {
        getFinancialOverview: jest
          .fn()
          .mockRejectedValue(new Error('db yiqildi')),
      },
    });
    const res = await service.getSummary(CEO);

    expect(res.money).toBeNull();
    expect(res.failed).toContain('money');
    expect(res.people).not.toBeNull();
    expect(res.people!.activeStudents).toBe(842);
  });

  it('yiqilgan javob keshlanmaydi', async () => {
    const { service, redis } = makeService({
      reports: {
        getFinancialOverview: jest
          .fn()
          .mockRejectedValue(new Error('db yiqildi')),
      },
    });
    await service.getSummary(CEO);

    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("kesh kaliti rol darajasini o'z ichiga oladi", async () => {
    const { service, redis } = makeService();
    await service.getSummary(CEO);
    await service.getSummary({ ...CEO, roles: ['Administrator'] });

    const keys = redis.setex.mock.calls.map((c: any[]) => c[0]);
    expect(keys[0]).toContain(':money');
    expect(keys[1]).toContain(':outreach');
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('filial tanlanmasa jadval null, todayLessons ham null', async () => {
    const { service, dashboard } = makeService();
    const res = await service.getSummary({ ...CEO, branchScope: null });

    expect(res.nextLessons).toBeNull();
    expect(res.people!.todayLessons).toBeNull();
    expect(dashboard.getTodaySchedule).not.toHaveBeenCalled();
  });

  it("darslar mijoz kutgan shaklga o'giriladi", async () => {
    const { service } = makeService();
    const res = await service.getSummary(CEO);

    expect(res.nextLessons).toEqual([
      {
        groupId: 'g1',
        groupName: 'A1-07',
        startTime: '09:00',
        endTime: '10:30',
        teacherName: 'Aziza Karimova',
        roomName: '101-xona',
        studentCount: 14,
      },
    ]);
  });
});
