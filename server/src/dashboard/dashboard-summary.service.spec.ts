import { ForbiddenException } from '@nestjs/common';
import { DashboardSummaryService } from './dashboard-summary.service';
import { ROLE_ID } from '../common/auth/role-ids';
import { fakePermissions } from '../common/permissions/testing';

// «Qarz — ikki raqam» (ADR-0059). `ReportsService.getFinancialOverview` uni
// `debtSplit` sifatida o'zi qaytaradi — bosh sahifa qarzni shundan oladi.
const debtSplit = {
  studying: {
    total: 39_150_000,
    count: 219,
    currentMonth: 36_990_000,
    older: 2_160_000,
  },
  notStudying: { total: 36_540_000, count: 305 },
};

const financialOverview = {
  income: { actual: 128_450_000, paymentCount: 214 },
  forecast: { expectedMonthEnd: 176_200_000 },
  netProfit: 78_000_000,
  debtSplit,
  // `ReportsService.getFinancialOverview` shu shaklda qaytaradi. `month` va
  // `students` hisobot sahifasi uchun — bosh sahifaga o'tmaydi.
  monthCharges: {
    month: '2026-10',
    charged: 900_000,
    paid: 600_000,
    unpaid: 300_000,
    paidPct: 66.7,
    students: 2,
  },
};

const kpis = {
  activeStudents: { current: 842, trend: 3 },
  activeGroups: 47,
  averageAttendance: 88,
  newStudentsThisMonth: 63,
  churnedThisMonth: 19,
  pendingDepartures: 4,
  departureGraceDays: { LEFT_GROUP: 21, FROZEN: 60 },
};

// Qarzdorlar sahifasining kartalari (`GET /payments/debtors/summary`) ham
// `split` olib yuradi, lekin bosh sahifa undan faqat va'da sonlarini o'qiydi.
// Raqamlari ATAYLAB boshqacha: karta noto'g'ri manbadan to'lsa test ko'radi.
const debtorSummary = {
  split: {
    studying: { total: 1_000, count: 1, currentMonth: 600, older: 400 },
    notStudying: { total: 2_000, count: 2 },
  },
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

// `roleIds` are the roles the caller holds in the database; the capabilities
// they carry come from the catalog defaults (`fakePermissions`).
function makeService(
  overrides: Record<string, any> = {},
  roleIds: number[] = [ROLE_ID.CEO],
) {
  const reports = {
    getFinancialOverview: jest.fn().mockResolvedValue(financialOverview),
    getNetProfitWithBasis: jest.fn().mockResolvedValue({
      netProfit: 18_930_000,
      netProfitBasis: 'recognized',
    }),
    getKpis: jest.fn().mockResolvedValue(kpis),
    // Overview `debtSplit` ni o'zi olib keladi: bu yerga murojaat bo'lmasligi kerak.
    getDebtSplit: jest.fn(),
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
    fakePermissions(roleIds),
  );
  return { service, reports, payments, outreach, dashboard, redis };
}

const CEO = {
  userId: 10406,
  companyId: 1001,
  roles: ['CEO'],
  branchScope: [1],
};
const ADMINISTRATOR = { ...CEO, roles: ['Administrator'] };
const CASHIER = { ...CEO, roles: ['Cashier'] };

describe('DashboardSummaryService.getSummary', () => {
  it("CEO uchun pul bloki to'ladi", async () => {
    const { service } = makeService();
    const res = await service.getSummary(CEO);

    expect(res.money).toEqual({
      monthIncome: 128_450_000,
      paymentCount: 214,
      expectedMonthEnd: 176_200_000,
      // Faqat to'rt maydon: `month` va `students` o'tib ketsa, toEqual yiqiladi.
      monthCharges: {
        charged: 900_000,
        paid: 600_000,
        unpaid: 300_000,
        paidPct: 66.7,
      },
      netProfit: 18_930_000,
      netProfitBasis: 'recognized',
      debt: debtSplit,
    });
  });

  describe('qarz — ikki raqam (ADR-0059)', () => {
    it("karta overview.debtSplit: ikkita alohida raqam, umumiy summa yo'q, ikkinchi o'qishsiz", async () => {
      const { service, reports } = makeService();
      const res = await service.getSummary(CEO);

      // `debtorSummary.split` boshqa raqamlar bilan keladi: karta undan emas,
      // overview dan to'ladi.
      expect(res.money!.debt).toEqual(debtSplit);
      expect(res.money!.debt).not.toHaveProperty('total');
      expect(res.money!.debt).not.toHaveProperty('count');
      // Qarz overview bilan birga keladi: alohida o'qish (va so'rov) yo'q.
      expect(reports.getDebtSplit).not.toHaveBeenCalled();
    });

    it("qarz qamrovi overview'niki: ko'p filial ham, «Barcha filiallar» ham", async () => {
      const { service, reports } = makeService();
      await service.getSummary({ ...CEO, branchScope: [3, 4] });
      await service.getSummary({ ...CEO, branchScope: null });

      expect(
        reports.getFinancialOverview.mock.calls.map((c: any[]) => c[1]),
      ).toEqual([{ branchIds: [3, 4] }, { branchIds: null }]);
    });

    it("«E'tibor» bloki qarzdorlar sahifasidan faqat va'da sonini oladi, holat filtrisiz", async () => {
      const { service, payments } = makeService();
      const res = await service.getSummary(CEO);

      expect(res.attention!.brokenPromises).toBe(5);
      expect(payments.getDebtorSummary).toHaveBeenCalledWith(CEO.companyId, {
        branchId: 1,
        userId: CEO.userId,
        roles: ['CEO'],
      });
    });
  });

  it('oylik hisob boshlanmagan oyda monthCharges null, eski prognoz joyida qoladi', async () => {
    const { service } = makeService({
      reports: {
        getFinancialOverview: jest
          .fn()
          .mockResolvedValue({ ...financialOverview, monthCharges: null }),
      },
    });
    const res = await service.getSummary(CEO);

    expect(res.money!.monthCharges).toBeNull();
    expect(res.money!.expectedMonthEnd).toBe(176_200_000);
  });

  it('administrator uchun pul bloki null va moliya servisi umuman chaqirilmaydi', async () => {
    const { service, reports } = makeService({}, [ROLE_ID.ADMINISTRATOR]);
    const res = await service.getSummary(ADMINISTRATOR);

    expect(res.money).toBeNull();
    expect(reports.getFinancialOverview).not.toHaveBeenCalled();
    expect(reports.getNetProfitWithBasis).not.toHaveBeenCalled();
    expect(reports.getDebtSplit).not.toHaveBeenCalled();
  });

  it('kassir uchun outreach sonlari nol, top qarzdorlar qoladi', async () => {
    const { service, payments, outreach } = makeService(
      {
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
      },
      [ROLE_ID.CASHIER],
    );
    const res = await service.getSummary(CASHIER);

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
    expect(res.people!.leftPending).toBe(4);
    expect(res.people!.leftGraceDays).toEqual({ LEFT_GROUP: 21, FROZEN: 60 });
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
    const ceo = makeService();
    await ceo.service.getSummary(CEO);
    const administrator = makeService({}, [ROLE_ID.ADMINISTRATOR]);
    await administrator.service.getSummary(ADMINISTRATOR);

    const ceoKey = ceo.redis.setex.mock.calls[0][0];
    const administratorKey = administrator.redis.setex.mock.calls[0][0];
    expect(ceoKey).toContain(':money');
    expect(administratorKey).toContain(':outreach');
    expect(ceoKey).not.toBe(administratorKey);
  });

  it("reads the caller's capabilities from the database, not the roles in the token", async () => {
    // A token issued while the account was a Cashier; the database now says
    // Administrator: the outreach rows follow the database.
    const { service, outreach, redis } = makeService({}, [
      ROLE_ID.ADMINISTRATOR,
    ]);
    const res = await service.getSummary(CASHIER);

    expect(res.money).toBeNull();
    expect(outreach.getStats).toHaveBeenCalled();
    expect(redis.setex.mock.calls[0][0]).toContain(':outreach');
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

  it('asks for the net profit of the Tashkent month', async () => {
    // 01.10.2026 01:30 in Tashkent, still 30.09 on a UTC host (Railway).
    jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
    try {
      const { service, reports } = makeService();
      await service.getSummary(CEO);

      expect(reports.getNetProfitWithBasis).toHaveBeenCalledWith(
        CEO.companyId,
        expect.objectContaining({ month: '2026-10' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
