import { Test, TestingModule } from '@nestjs/testing';
import {
  ArgumentMetadata,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ReportsController } from './reports.controller';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ReportsService } from './reports.service';
import { ReportsExcelService } from './reports-excel.service';
import { ReportsProfitCompositionService } from './reports-profit-composition.service';
import { PrismaService } from '../prisma/prisma.service';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import type { PermissionKey } from '../common/permissions/permission-catalog';
import { DepartedStudentsSummaryQueryDto } from './dto/departed-students-summary-query.dto';
import { DepartedStudentsListQueryDto } from './dto/departed-students-list-query.dto';
import { PaymentReportsQueryDto } from './dto/payment-reports-query.dto';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockService = {
    getKpis: jest.fn().mockResolvedValue({}),
    getRoomUtilization: jest.fn().mockResolvedValue({}),
    getTeacherPerformance: jest.fn().mockResolvedValue({}),
    getAttendanceAnalytics: jest.fn().mockResolvedValue({}),
    getGroupAnalytics: jest.fn().mockResolvedValue({}),
    getLeadAnalytics: jest.fn().mockResolvedValue({}),
    getFinancialTrendCanonical: jest.fn().mockResolvedValue([]),
    getIncomeMonthAttribution: jest.fn().mockResolvedValue({}),
    getFinancialOverview: jest.fn().mockResolvedValue({}),
    getSalaryMonthly: jest.fn().mockResolvedValue({
      month: '2026-07',
      totals: {
        netToPay: 100,
        advances: 20,
        fullDeserved: 120,
        covered: 120,
        gap: 0,
      },
      staffTotals: { monthly: 30, advances: 5, netToPay: 25 },
    }),
    // Canonical monthly net profit — overrides overview.netProfit on the card.
    getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 12_345_678 }),
    // «Kanonik yoki kassa» qarori endi servisda. Kontroller faqat unga
    // topshiradi va javobini o'zgartirmasdan qaytaradi — fallback mantiqining
    // o'zi `reports.service.spec.ts` da sinaladi.
    getNetProfitWithBasis: jest.fn().mockResolvedValue({
      netProfit: 12_345_678,
      netProfitBasis: 'recognized',
    }),
    // «Oyning o'z foydasi» left the overview; kept so the payload test can show
    // the controller no longer asks for it.
    getOwnMonthProfit: jest.fn().mockResolvedValue({ ownMonthProfit: null }),
    getPaymentReports: jest.fn().mockResolvedValue({}),
    getTeacherPaymentReports: jest.fn().mockResolvedValue({}),
    getTeacherGroupsReport: jest.fn().mockResolvedValue({}),
    getStudentPaymentsReport: jest.fn().mockResolvedValue({}),
    getStudentPaymentsFilterOptions: jest.fn().mockResolvedValue({}),
    getDepartedStudentsSummary: jest.fn().mockResolvedValue({}),
    getDepartedStudentsDynamics: jest.fn().mockResolvedValue({}),
    getDepartedStudentsReasons: jest.fn().mockResolvedValue({}),
    getDepartedStudentsGroupBy: jest.fn().mockResolvedValue({}),
    getDepartedStudentsList: jest.fn().mockResolvedValue({}),
    getDepartedStudentsByReason: jest.fn().mockResolvedValue({}),
    getDepartedStudentsByStatus: jest.fn().mockResolvedValue({}),
    getDebtWriteOffsSummary: jest.fn().mockResolvedValue({
      totalAmount: 0,
      count: 0,
      periodStart: '',
      periodEnd: '',
    }),
    getProfitLoss: jest.fn().mockResolvedValue({}),
    getCashFlow: jest.fn().mockResolvedValue({}),
    getBalanceSheet: jest.fn().mockResolvedValue({}),
    getMonthlyDebtRecovery: jest
      .fn()
      .mockResolvedValue({ months: [], totals: {} }),
    getDebtHistory: jest.fn().mockResolvedValue({
      months: [],
      totals: { debtAdded: 0, debtPaid: 0, debtForgiven: 0, debtOther: 0 },
      current: { debt: 0, debtorCount: 0, delta: 0, byStatus: [] },
      longestDebtors: [],
      statusFilter: 'all',
    }),
    getMonthDebtDetail: jest.fn().mockResolvedValue({
      monthKey: '2026-06',
      label: 'Iyun 2026',
      totals: {},
      debtors: [],
      recoveredPayments: [],
      writeOffs: [],
      truncated: false,
    }),
  };

  // Branch scope now comes from `resolveCallerBranchScope`, which reads the
  // caller's roles + mainBranch + UserBranch rows in ONE `user.findFirst`.
  const asCeo = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const mockPrisma = {
    user: { findFirst: jest.fn().mockResolvedValue(asCeo) },
    company: { findUnique: jest.fn().mockResolvedValue({ name: 'DaF' }) },
    branch: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;

  const mockExcel = {
    generate: jest.fn().mockResolvedValue(Buffer.from('')),
    generateDebtHistory: jest.fn().mockResolvedValue(Buffer.from('')),
  };

  const mockComposition = {
    getProfitComposition: jest.fn().mockResolvedValue({ netProfit: 1 }),
  };

  beforeEach(async () => {
    mockExcel.generate.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportsExcelService, useValue: mockExcel },
        {
          provide: ReportsProfitCompositionService,
          useValue: mockComposition,
        },
      ],
    }).compile();

    controller = module.get(ReportsController);
  });

  // Every route's marker, grouped by capability. `roles` is who the catalog
  // admits by default (the CEO always); a route that took the Administrator or
  // the Cashier out in Appendix C (`intentional-access-changes.ts`) lists the
  // narrowed set.
  const routeGroups: {
    capability: string;
    keys: PermissionKey[];
    roles: string[];
    handlers: (keyof ReportsController)[];
  }[] = [
    {
      // Money figures and workbooks.
      capability: 'finance',
      keys: ['reports.finance'],
      roles: ['Branch Director', 'CEO'],
      handlers: [
        'getFinancialTrend',
        'getIncomeMonthAttribution',
        'getProfitComposition',
        'getFinancialOverview',
        'getExpectationHistory',
        'getMonthlyDebtRecovery',
        'exportFinancialExcel',
        // Only the «O'quvchi to'lovi» report calls it, and its menu entry is
        // CEO/BD only: the Administrator and the Cashier left (Appendix C).
        'getStudentPaymentsReport',
      ],
    },
    {
      // /reports/payment-reports page: open to the Administrator too (CEO,
      // 05.10.2026). The branch scope still confines them to their own
      // branch(es).
      capability: 'payment reports',
      keys: ['reports.payments'],
      roles: ['Administrator', 'Branch Director', 'CEO'],
      handlers: [
        'getPaymentReports',
        'getTeacherPaymentReports',
        'getTeacherGroupsReport',
      ],
    },
    {
      capability: 'lead reports',
      keys: ['reports.leads'],
      roles: ['Administrator', 'Branch Director', 'CEO'],
      handlers: ['getLeadAnalytics'],
    },
    {
      // Attendance, activity and departed-students reports: their menu entries
      // are CEO/BD only, so the Administrator left (Appendix C).
      capability: 'student reports',
      keys: ['reports.students'],
      roles: ['Branch Director', 'CEO'],
      handlers: [
        'getKpis',
        'getRoomUtilization',
        'getCenterActivity',
        'getTeacherPerformance',
        'getAttendanceAnalytics',
        'getAttendanceByGroup',
        'getAttendanceByCourse',
        'getGroupAnalytics',
        'getDepartedStudentsSummary',
        'getDepartedStudentsDynamics',
        'getDepartedStudentsByStatus',
        'getDepartedStudentsReasons',
        'getTeacherChangeReasons',
        'getTransferReasons',
        'getDepartedStudentsList',
        'getDepartedStudentsByReason',
        'getDepartedStudentsGroupBy',
        'getTeacherChangesList',
        'getTransferredList',
        'getDepartedAfterTeacherChangeList',
      ],
    },
    {
      // Widened 2026-08-12 for the single debt page (/payments/debt): the debt
      // history, its month drill-down and its Excel are tabs there, and the
      // CEO's call was that the page must not change shape by viewer.
      // `getDebtWriteOffsSummary` joins them for the same reason.
      // `getMonthlyDebtRecovery` is NOT here — it is the cohort report behind
      // the Excel workbook, not a page.
      capability: 'debt page',
      keys: ['debt.view'],
      roles: ['Administrator', 'Branch Director', 'CEO', 'Cashier'],
      handlers: [
        'getDebtHistory',
        'getMonthAgingDetail',
        'exportMonthlyDebtExcel',
        'getMonthDebtDetail',
        'getDebtWriteOffsSummary',
      ],
    },
    {
      // The filter lists of the «O'quvchi to'lovi» and «Ketgan o'quvchilar»
      // reports, both CEO/BD only.
      capability: 'payment and student report filters',
      keys: ['reports.finance', 'reports.students'],
      roles: ['Branch Director', 'CEO'],
      handlers: ['getStudentPaymentsFilterOptions'],
    },
  ];

  for (const { capability, keys, roles, handlers } of routeGroups) {
    describe(`${capability} routes`, () => {
      it.each(handlers)(`%s is gated by ${keys.join(' or ')}`, (method) => {
        expect(routeAccess(ReportsController, method)).toEqual({
          kind: 'can',
          keys,
        });
      });

      it.each(handlers)(
        `%s admits ${roles.join(', ')} by default, nobody else`,
        (method) => {
          expect(defaultRolesOf(ReportsController, method)).toEqual(roles);
        },
      );
    });
  }

  describe('getProfitComposition() — month and scope', () => {
    beforeEach(() => mockComposition.getProfitComposition.mockClear());

    it("explains the card's month: the period's START month", async () => {
      await controller.getProfitComposition(
        { startDate: '2026-09-01', endDate: '2026-09-30' } as any,
        1001,
        10001,
      );
      expect(mockComposition.getProfitComposition).toHaveBeenCalledWith(1001, {
        month: '2026-09',
        branchIds: null,
        performedById: 10001,
      });
    });

    it('falls back to the current Tashkent month without a period', async () => {
      await controller.getProfitComposition({} as any, 1001, 10001);
      const arg = mockComposition.getProfitComposition.mock.calls[0][1];
      expect(arg.month).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  // Client and server deploy separately here, so for one release a page served
  // before the `include` switch is still out there sending `?compare=`. With
  // `forbidNonWhitelisted` that is a 400, and since the download is fetched as
  // a blob the CEO gets a bare red toast and no file. The DTO therefore still
  // ACCEPTS the three retired params — and nothing may read them.
  /**
   * The retired `compare` / `compareStartDate` / `compareEndDate` params were
   * kept as accepted-and-ignored for one release, because
   * `forbidNonWhitelisted` 400s an unknown query param and a browser tab
   * opened before the 2026-08-10 frontend release would still have sent them —
   * losing the download entirely.
   *
   * They were removed on 2026-08-24. This case is what is left of that block:
   * the DTO must not grow them back, and it must not grow a silent
   * accepted-and-ignored field in general. A parameter the server takes and
   * ignores is a promise it does not keep.
   */
  describe('exportFinancialExcel() — the query DTO takes nothing it ignores', () => {
    it('rejects the retired compare params instead of pretending', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const meta: ArgumentMetadata = {
        type: 'query',
        metatype: ReportsQueryDto,
      };

      await expect(
        pipe.transform(
          { startDate: '2026-06-01', compareStartDate: '2026-05-01' },
          meta,
        ),
      ).rejects.toBeDefined();
    });

    it('still accepts the params it does read', async () => {
      const pipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      });
      const meta: ArgumentMetadata = {
        type: 'query',
        metatype: ReportsQueryDto,
      };

      await expect(
        pipe.transform(
          {
            startDate: '2026-06-01',
            endDate: '2026-06-30',
            include: 'marketing',
          },
          meta,
        ),
      ).resolves.toEqual(expect.objectContaining({ include: 'marketing' }));
    });
  });

  describe('getFinancialOverview() — payload', () => {
    const fullOverview = {
      income: {
        actual: 69126991,
        paymentCount: 212,
        byMethod: [{ method: 'CASH', amount: 5, count: 1 }],
        yesterday: { date: '2026-07-14', amount: 3 },
      },
      forecast: { expectedMonthEnd: 7, expectedHeld: 3, expectedRemaining: 4 },
      salary: { paid: 8251000, pending: 5, advances: 2 },
      monthCharges: {
        month: '2026-10',
        charged: 900_000,
        paid: 350_000,
        unpaid: 550_000,
        paidPct: 38.9,
        students: 2,
        unpaidStudents: 1,
      },
      debtSplit: {
        studying: {
          total: 39_150_000,
          count: 219,
          currentMonth: 36_990_000,
          older: 2_160_000,
          olderCount: 13,
        },
        notStudying: {
          total: 36_540_000,
          count: 305,
          byKind: {
            ungrouped: { total: 13_500_000, count: 118 },
            frozen: { total: 13_140_000, count: 91 },
            left: { total: 9_900_000, count: 96 },
          },
        },
      },
      expenses: 8251000,
      netProfit: 60875991,
      activeBalance: 1,
      activeStudentCount: 188,
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      mockService.getFinancialOverview.mockResolvedValue(fullOverview);
    });

    afterEach(() => {
      mockService.getFinancialOverview.mockResolvedValue({});
    });

    const query = {} as any;

    it.each([
      [10001, 'CEO'],
      [10002, 'Branch Director'],
    ])('returns the whole payload (%i, %s)', async (id) => {
      const res: any = await controller.getFinancialOverview(query, {
        id,
        companyId: 1,
      });
      expect(res).toMatchObject({
        income: fullOverview.income,
        expenses: fullOverview.expenses,
        netProfit: 12_345_678,
        forecast: fullOverview.forecast,
        monthCharges: fullOverview.monthCharges,
        debtSplit: fullOverview.debtSplit,
      });
      expect(res.salary.paid).toBe(fullOverview.salary.paid);
    });

    describe('net profit basis is stated, not implied', () => {
      it('reports the recognized basis when the canonical figure computes', async () => {
        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(res.netProfit).toBe(12_345_678);
        expect(res.netProfitBasis).toBe('recognized');
      });

      it('falls back to cash AND says so', async () => {
        mockService.getNetProfitWithBasis.mockResolvedValueOnce({
          netProfit: fullOverview.netProfit,
          netProfitBasis: 'cash',
        });

        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(res.netProfit).toBe(fullOverview.netProfit);
        expect(res.netProfitBasis).toBe('cash');
      });

      it('hands the service the cash figure as its fallback', async () => {
        await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(mockService.getNetProfitWithBasis).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            performedById: 10001,
            cashFallback: fullOverview.netProfit,
          }),
        );
      });
    });

    it('folds the teachers’ AND the staff’s salary into salary.computed', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res.salary.computed).toEqual({
        month: '2026-07',
        hasLessonData: true,
        fullDeserved: 120,
        netToPay: 100,
        advances: 20,
        staff: { monthly: 30, advances: 5, netToPay: 25 },
      });
    });

    it('takes the salary month from the Tashkent calendar when no period is given', async () => {
      // 01.10.2026 01:30 in Tashkent; the process (UTC) still says 30.09.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
      try {
        mockService.getSalaryMonthly.mockClear();
        await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });
        expect(mockService.getSalaryMonthly).toHaveBeenCalledWith(
          1,
          '2026-10',
          10001,
          undefined,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('degrades salary.computed to null (never throws) when the salary calc fails', async () => {
      mockService.getSalaryMonthly.mockRejectedValueOnce(new Error('boom'));
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res.salary.computed).toBeNull();
      expect(res.netProfit).toBe(12_345_678);
    });

    it("no longer computes «Oyning o'z foydasi» (removed from the page)", async () => {
      mockService.getOwnMonthProfit.mockClear();
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res).not.toHaveProperty('ownMonthProfit');
      expect(mockService.getOwnMonthProfit).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialTrend() — month anchor', () => {
    it('hands the asked month and the resolved scope to the canonical trend', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      await controller.getFinancialTrend(
        { month: '2026-08' } as any,
        1001,
        10001,
      );
      expect(mockService.getFinancialTrendCanonical).toHaveBeenCalledWith(
        1001,
        null,
        10001,
        '2026-08',
      );
    });
  });

  describe('departed students — branch scope', () => {
    const september = {
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    } as DepartedStudentsSummaryQueryDto;

    it('hands the summary the branch list instead of narrowing it to one branch', async () => {
      await controller.getDepartedStudentsSummary(september, 1001, [3, 7]);
      expect(mockService.getDepartedStudentsSummary).toHaveBeenLastCalledWith(
        1001,
        {
          scope: [3, 7],
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        },
      );
    });

    it('hands the dynamics chart the date range', async () => {
      await controller.getDepartedStudentsDynamics(
        { startDate: '2026-07-01', endDate: '2026-09-30' },
        1001,
        null,
      );
      expect(mockService.getDepartedStudentsDynamics).toHaveBeenLastCalledWith(
        1001,
        {
          scope: null,
          startDate: '2026-07-01',
          endDate: '2026-09-30',
        },
      );
    });

    it('refuses a caller whose scope resolved to no branch', () => {
      expect(() =>
        controller.getDepartedStudentsSummary(september, 1001, []),
      ).toThrow(ForbiddenException);
    });

    it('hands the list the branch list and its own filters', async () => {
      await controller.getDepartedStudentsList(
        {
          status: 'FROZEN',
          debtorsOnly: true,
          page: 2,
          pageSize: 20,
        } as DepartedStudentsListQueryDto,
        1001,
        [3, 7],
      );
      expect(mockService.getDepartedStudentsList).toHaveBeenLastCalledWith(
        1001,
        {
          scope: [3, 7],
          status: 'FROZEN',
          debtorsOnly: true,
          page: 2,
          pageSize: 20,
        },
      );
    });
  });

  describe('getPaymentReports() — branch scope', () => {
    it('hands a multi-branch director their branch list instead of a 400', async () => {
      await controller.getPaymentReports(
        {
          startDate: '2026-09-01',
          endDate: '2026-09-30',
        } as PaymentReportsQueryDto,
        1001,
        [3, 7],
      );
      expect(mockService.getPaymentReports).toHaveBeenLastCalledWith(1001, {
        branchIds: [3, 7],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        months: undefined,
      });
    });

    it('refuses a scope that resolved to no branch', () => {
      expect(() =>
        controller.getPaymentReports({} as PaymentReportsQueryDto, 1001, []),
      ).toThrow(ForbiddenException);
    });
  });

  describe('branch scope resolver (private)', () => {
    const asDirectorOf = (...branchIds: number[]) => ({
      mainBranch: branchIds[0] ?? null,
      branches: branchIds.map((branchId) => ({ branchId })),
      roles: [{ role: { name: 'Branch Director' } }],
    });

    it('CEO with no branch picked spans everything', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      await expect((controller as any).resolveScope(1)).resolves.toBeNull();
    });

    it('CEO who picks a branch is narrowed to it', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      await expect((controller as any).resolveScope(1, 2)).resolves.toEqual([
        2,
      ]);
    });

    it('Branch Director defaults to their own branches', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asDirectorOf(3, 7));
      await expect((controller as any).resolveScope(2)).resolves.toEqual([
        3, 7,
      ]);
    });

    it('a picked branch NARROWS a director rather than being overridden', async () => {
      // The old `branchWhere` let the director's whole scope win, so picking
      // one branch still returned both — under a header naming one.
      mockPrisma.user.findFirst.mockResolvedValue(asDirectorOf(3, 7));
      await expect((controller as any).resolveScope(2, 7)).resolves.toEqual([
        7,
      ]);
    });

    it("REFUSES a branch outside the caller's scope", async () => {
      // Serving zeros would be worse than a 403: services that re-derive their
      // own scope from `performedById` would fill part of the report with the
      // caller's own branch, so the document contradicts itself.
      mockPrisma.user.findFirst.mockResolvedValue(asDirectorOf(3));
      await expect((controller as any).resolveScope(2, 9)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('REFUSES a confined caller with no branch attached', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asDirectorOf());
      await expect((controller as any).resolveScope(2)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
