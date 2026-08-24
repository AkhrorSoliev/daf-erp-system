import { Test, TestingModule } from '@nestjs/testing';
import {
  ArgumentMetadata,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ReportsController } from './reports.controller';
import { ReportsQueryDto } from './dto/reports-query.dto';
import { ReportsService } from './reports.service';
import { ReportsExcelService } from './reports-excel.service';
import { PrismaService } from '../prisma/prisma.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('ReportsController — role guards', () => {
  let controller: ReportsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    getKpis: jest.fn().mockResolvedValue({}),
    getRoomUtilization: jest.fn().mockResolvedValue({}),
    getTeacherPerformance: jest.fn().mockResolvedValue({}),
    getAttendanceAnalytics: jest.fn().mockResolvedValue({}),
    getGroupAnalytics: jest.fn().mockResolvedValue({}),
    getLeadAnalytics: jest.fn().mockResolvedValue({}),
    getFinancialTrend: jest.fn().mockResolvedValue({}),
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
    }),
    // Canonical monthly net profit — overrides overview.netProfit on the card.
    getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 12_345_678 }),
    // «Oyning o'z foydasi» — default resolves so unrelated tests in this file
    // (which don't care about the field) aren't left exercising the catch path.
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

  beforeEach(async () => {
    mockExcel.generate.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ReportsExcelService, useValue: mockExcel },
      ],
    }).compile();

    controller = module.get(ReportsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => ReportsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  // Class-level guard
  describe('class-level @Roles', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) on the controller class', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, ReportsController);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
  });

  const endpoints = [
    'getKpis',
    'getRoomUtilization',
    'getTeacherPerformance',
    'getAttendanceAnalytics',
    'getGroupAnalytics',
    'getLeadAnalytics',
    'getDepartedStudentsSummary',
    'getDepartedStudentsDynamics',
    'getDepartedStudentsReasons',
    'getDepartedStudentsGroupBy',
    'getDepartedStudentsList',
    'getDepartedStudentsByReason',
    'getDepartedStudentsByStatus',
  ] as const;

  for (const method of endpoints) {
    describe(`${method}()`, () => {
      it('should allow CEO', () => {
        const ctx = mockExecutionContext(controller[method], ['CEO']);
        expect(guard.canActivate(ctx)).toBe(true);
      });

      it('should allow Branch Director', () => {
        const ctx = mockExecutionContext(controller[method], [
          'Branch Director',
        ]);
        expect(guard.canActivate(ctx)).toBe(true);
      });

      it('should allow Administrator', () => {
        const ctx = mockExecutionContext(controller[method], ['Administrator']);
        expect(guard.canActivate(ctx)).toBe(true);
      });

      it('should deny Teacher', () => {
        const ctx = mockExecutionContext(controller[method], ['Teacher']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      });

      it('should deny Cashier', () => {
        const ctx = mockExecutionContext(controller[method], ['Cashier']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      });
    });
  }

  const narrowedEndpoints = [
    'getPaymentReports',
    'getTeacherPaymentReports',
    'getTeacherGroupsReport',
    'getMonthlyDebtRecovery',
    'getFinancialTrend',
    'getIncomeMonthAttribution',
  ] as const;

  // Widened 2026-08-12 for the single debt page (/payments/debt): the debt
  // history, its month drill-down and its Excel are tabs there, and the CEO's
  // call was that the page must not change shape by viewer. `getDebtWriteOffsSummary`
  // joins them for the same reason. `getMonthlyDebtRecovery` above is NOT in this
  // set — it is the cohort report behind the Excel workbook, not a page.
  const debtPageEndpoints = [
    'getDebtHistory',
    'getMonthDebtDetail',
    'exportMonthlyDebtExcel',
    'getDebtWriteOffsSummary',
  ] as const;

  for (const method of debtPageEndpoints) {
    describe(`${method}() — debt page, every staff role`, () => {
      it(`allows CEO, BD, Administrator and Cashier on ${method}`, () => {
        expect(reflector.get<string[]>(ROLES_KEY, controller[method])).toEqual([
          'CEO',
          'Branch Director',
          'Administrator',
          'Cashier',
        ]);
        for (const role of [
          'CEO',
          'Branch Director',
          'Administrator',
          'Cashier',
        ]) {
          expect(
            guard.canActivate(mockExecutionContext(controller[method], [role])),
          ).toBe(true);
        }
      });

      it('still denies Teacher', () => {
        expect(() =>
          guard.canActivate(
            mockExecutionContext(controller[method], ['Teacher']),
          ),
        ).toThrow(ForbiddenException);
      });
    });
  }

  for (const method of narrowedEndpoints) {
    describe(`${method}() — method-level @Roles`, () => {
      it(`should have @Roles(CEO, Branch Director) on ${method}`, () => {
        const roles = reflector.get<string[]>(ROLES_KEY, controller[method]);
        expect(roles).toEqual(['CEO', 'Branch Director']);
      });

      it('should allow CEO and Branch Director', () => {
        expect(
          guard.canActivate(mockExecutionContext(controller[method], ['CEO'])),
        ).toBe(true);
        expect(
          guard.canActivate(
            mockExecutionContext(controller[method], ['Branch Director']),
          ),
        ).toBe(true);
      });

      it('should deny Administrator, Cashier, Teacher', () => {
        for (const role of ['Administrator', 'Cashier', 'Teacher']) {
          expect(() =>
            guard.canActivate(mockExecutionContext(controller[method], [role])),
          ).toThrow(ForbiddenException);
        }
      });
    });
  }

  const studentPaymentsEndpoints = [
    'getStudentPaymentsReport',
    'getStudentPaymentsFilterOptions',
    'getFinancialOverview',
  ] as const;

  for (const method of studentPaymentsEndpoints) {
    describe(`${method}() — method-level @Roles`, () => {
      it(`should have @Roles(CEO, Branch Director, Administrator, Cashier) on ${method}`, () => {
        const roles = reflector.get<string[]>(ROLES_KEY, controller[method]);
        expect(roles).toEqual([
          'CEO',
          'Branch Director',
          'Administrator',
          'Cashier',
        ]);
      });

      it('should allow CEO, Branch Director, Administrator, Cashier', () => {
        for (const role of [
          'CEO',
          'Branch Director',
          'Administrator',
          'Cashier',
        ]) {
          expect(
            guard.canActivate(mockExecutionContext(controller[method], [role])),
          ).toBe(true);
        }
      });

      it('should deny Teacher', () => {
        const ctx = mockExecutionContext(controller[method], ['Teacher']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      });
    });
  }

  // Method-level @Roles('CEO', 'Branch Director') on getPaymentReports
  describe('getPaymentReports() — method-level @Roles', () => {
    it('should have @Roles(CEO, Branch Director) on the handler', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getPaymentReports,
      );
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should allow CEO', () => {
      const ctx = mockExecutionContext(controller.getPaymentReports, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director', () => {
      const ctx = mockExecutionContext(controller.getPaymentReports, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Administrator (method-level narrower than class-level)', () => {
      const ctx = mockExecutionContext(controller.getPaymentReports, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier', () => {
      const ctx = mockExecutionContext(controller.getPaymentReports, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher', () => {
      const ctx = mockExecutionContext(controller.getPaymentReports, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  // Role coverage for getDebtWriteOffsSummary lives in the `debtPageEndpoints`
  // loop above — it is one of the four the debt page reads.
  describe('getDebtWriteOffsSummary() — still closed to Teacher', () => {
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  // Financial Excel export — CEO + Branch Director only.
  describe('exportFinancialExcel() — guard (CEO + BD only)', () => {
    it('should have @Roles(CEO, Branch Director)', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.exportFinancialExcel,
      );
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('allows CEO and Branch Director', () => {
      for (const role of ['CEO', 'Branch Director']) {
        expect(
          guard.canActivate(
            mockExecutionContext(controller.exportFinancialExcel, [role]),
          ),
        ).toBe(true);
      }
    });

    it('denies Administrator, Cashier, Teacher', () => {
      for (const role of ['Administrator', 'Cashier', 'Teacher']) {
        expect(() =>
          guard.canActivate(
            mockExecutionContext(controller.exportFinancialExcel, [role]),
          ),
        ).toThrow(ForbiddenException);
      }
    });
  });

  // Client and server deploy separately here, so for one release a page served
  // before the `include` switch is still out there sending `?compare=`. With
  // `forbidNonWhitelisted` that is a 400, and since the download is fetched as
  // a blob the CEO gets a bare red toast and no file. The DTO therefore still
  // ACCEPTS the three retired params — and nothing may read them.
  describe('exportFinancialExcel() — retired compare params are accepted and ignored', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    const meta: ArgumentMetadata = {
      type: 'query',
      metatype: ReportsQueryDto,
    };
    const staleQuery = {
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      compare: 'prev,yoy',
      compareStartDate: '2026-05-01',
      compareEndDate: '2026-05-31',
    };

    it('validates instead of 400-ing', async () => {
      await expect(pipe.transform(staleQuery, meta)).resolves.toEqual(
        expect.objectContaining({ compare: 'prev,yoy' }),
      );
    });

    it('still builds the ten-sheet default — nothing reads the shim', async () => {
      const dto = (await pipe.transform(staleQuery, meta)) as ReportsQueryDto;
      const res = {
        setHeader: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.exportFinancialExcel(
        dto,
        { id: 10001, companyId: 1, roles: ['CEO'] },
        res,
      );

      // `include: []` IS the ten-sheet default (asserted sheet by sheet in
      // reports-excel.service.spec.ts). No compare* value reaches the builder.
      expect(mockExcel.generate).toHaveBeenCalledTimes(1);
      const passed = mockExcel.generate.mock.calls[0][1] as Record<
        string,
        unknown
      >;
      expect(passed.include).toEqual([]);
      expect(
        Object.keys(passed).filter((k) => k.startsWith('compare')),
      ).toEqual([]);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('getFinancialOverview() — sensitive-field stripping', () => {
    const fullOverview = {
      income: {
        expected: 9,
        actual: 69126991,
        billed: 8,
        paymentCount: 212,
        byMethod: [{ method: 'CASH', amount: 5, count: 1 }],
      },
      forecast: {
        recognizedRevenueForecast: 7,
        outstandingReceivable: 6,
        debtorExposure: { count: 4, avgDebt: 3 },
      },
      salary: { paid: 8251000, pending: 5, advances: 2 },
      expenses: 8251000,
      netProfit: 60875991,
      debtorCount: 4,
      activeBalance: 1,
      activeStudentCount: 188,
      ltv: 367697,
      ltvPayerCount: 188,
      cac: 0,
      marketingRoi: 0,
      avgPayment: 326071,
      newStudentCount: 0,
      marketingExpenses: 0,
    };

    beforeEach(() => {
      mockService.getFinancialOverview.mockResolvedValue(fullOverview);
    });

    afterEach(() => {
      mockService.getFinancialOverview.mockResolvedValue({});
    });

    const query = {} as any;

    it('returns the FULL payload for CEO', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
        roles: ['CEO'],
      });
      // Every sensitive field is preserved (the computed-salary fold is additive).
      // netProfit is the canonical getMonthlyNetProfit figure (overrides the
      // legacy overview.netProfit), not the raw cash-basis one.
      expect(res).toMatchObject({
        income: fullOverview.income,
        expenses: fullOverview.expenses,
        netProfit: 12_345_678,
        forecast: fullOverview.forecast,
      });
      expect(res.salary.paid).toBe(fullOverview.salary.paid);
    });

    // The canonical figure is not always available. When it fails the endpoint
    // keeps returning a number — breaking the overview would be worse — but it
    // used to return the LEGACY CASH figure under the same field name, with no
    // way for the caller to tell. That number runs high on purpose: teacher
    // salary is paid the following cycle, so a paidAt-based profit barely
    // subtracts it. The comment in the controller calls it the +78M June bug.
    describe('net profit basis is stated, not implied', () => {
      it('reports the recognized basis when the canonical figure computes', async () => {
        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
          roles: ['CEO'],
        });

        expect(res.netProfit).toBe(12_345_678);
        expect(res.netProfitBasis).toBe('recognized');
      });

      it('falls back to cash AND says so', async () => {
        mockService.getMonthlyNetProfit.mockRejectedValueOnce(
          new Error('recognized revenue unavailable'),
        );

        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
          roles: ['CEO'],
        });

        // The number still comes back — the card must render something…
        expect(res.netProfit).toBe(fullOverview.netProfit);
        // …but it is labelled for what it is, so the UI can stop calling it
        // «Foyda».
        expect(res.netProfitBasis).toBe('cash');
      });
    });

    it('returns the FULL payload for Branch Director', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10002,
        companyId: 1,
        roles: ['Branch Director'],
      });
      expect(res).toMatchObject({
        income: fullOverview.income,
        expenses: fullOverview.expenses,
        netProfit: 12_345_678,
      });
      expect(res.salary.paid).toBe(fullOverview.salary.paid);
    });

    it('overrides netProfit with the canonical getMonthlyNetProfit; falls back to legacy on failure', async () => {
      // Success path → canonical figure.
      const ok: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
        roles: ['CEO'],
      });
      expect(ok.netProfit).toBe(12_345_678);
      expect(mockService.getMonthlyNetProfit).toHaveBeenCalled();

      // Failure path → keep the legacy overview.netProfit, never break the card.
      mockService.getMonthlyNetProfit.mockRejectedValueOnce(new Error('boom'));
      const degraded: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
        roles: ['CEO'],
      });
      expect(degraded.netProfit).toBe(fullOverview.netProfit);
    });

    it('folds the computed monthly teacher salary into salary.computed for CEO (matches the Excel Oyliklar sheet)', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
        roles: ['CEO'],
      });
      // netToPay + advances = gross (avans + oylik jami); hasLessonData true when
      // the month has per-lesson data.
      expect(res.salary.computed).toEqual({
        month: '2026-07',
        hasLessonData: true,
        netToPay: 100,
        advances: 20,
        gross: 120,
      });
    });

    it('degrades salary.computed to null (never throws) when the salary calc fails', async () => {
      mockService.getSalaryMonthly.mockRejectedValueOnce(new Error('boom'));
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
        roles: ['CEO'],
      });
      expect(res.salary.computed).toBeNull();
      // The rest of the payload is untouched — netProfit is the canonical figure
      // (getMonthlyNetProfit still succeeds; only the computed-salary fold failed).
      expect(res.netProfit).toBe(12_345_678);
    });

    it('does NOT compute salary for Administrator (no leak, no wasted query)', async () => {
      mockService.getSalaryMonthly.mockClear();
      const res: any = await controller.getFinancialOverview(query, {
        id: 10003,
        companyId: 1,
        roles: ['Administrator'],
      });
      expect(res.salary).toBeUndefined();
      expect(mockService.getSalaryMonthly).not.toHaveBeenCalled();
    });

    it('returns ONLY payer count + avg payment for Administrator', async () => {
      const res = await controller.getFinancialOverview(query, {
        id: 10003,
        companyId: 1,
        roles: ['Administrator'],
      });
      expect(res).toEqual({ ltvPayerCount: 188, avgPayment: 326071 });
    });

    it('returns ONLY payer count + avg payment for Cashier', async () => {
      const res = await controller.getFinancialOverview(query, {
        id: 10004,
        companyId: 1,
        roles: ['Cashier'],
      });
      expect(res).toEqual({ ltvPayerCount: 188, avgPayment: 326071 });
    });

    it('never leaks income / expenses / profit / salary / LTV / CAC / ROI / debt to Administrator', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10003,
        companyId: 1,
        roles: ['Administrator'],
      });
      expect(res.income).toBeUndefined();
      expect(res.expenses).toBeUndefined();
      expect(res.netProfit).toBeUndefined();
      expect(res.salary).toBeUndefined();
      expect(res.forecast).toBeUndefined();
      expect(res.ltv).toBeUndefined();
      expect(res.cac).toBeUndefined();
      expect(res.marketingRoi).toBeUndefined();
      expect(res.debtorCount).toBeUndefined();
      expect(res.activeBalance).toBeUndefined();
    });

    it('grants the full payload when the user holds Administrator AND Branch Director', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10004,
        companyId: 1,
        roles: ['Administrator', 'Branch Director'],
      });
      expect(res).toMatchObject({
        income: fullOverview.income,
        netProfit: 12_345_678,
      });
      expect(res.salary.paid).toBe(fullOverview.salary.paid);
    });
  });

  describe('financial-overview — ownMonthProfit', () => {
    beforeEach(() => {
      mockService.getFinancialOverview.mockResolvedValue({
        ltvPayerCount: 188,
        avgPayment: 326071,
      });
    });

    afterEach(() => {
      mockService.getFinancialOverview.mockResolvedValue({});
      mockService.getOwnMonthProfit.mockResolvedValue({ ownMonthProfit: null });
    });

    const query = {} as any;

    it('adds the own-month profit for a CEO caller', async () => {
      mockService.getOwnMonthProfit.mockResolvedValueOnce({
        month: '2026-07',
        ownMoney: 142_064_938,
        cashTotal: 170_378_987,
        netProfit: { netProfit: 35_976_444 },
        ownMonthProfit: 4_257_391,
      });

      const out: any = await controller.getFinancialOverview(query, {
        id: 10_456,
        companyId: 1,
        roles: ['CEO'],
      });

      expect(out.ownMonthProfit).toBe(4_257_391);
    });

    it('falls back to null when the figure cannot be computed', async () => {
      mockService.getOwnMonthProfit.mockRejectedValueOnce(new Error('boom'));

      const out: any = await controller.getFinancialOverview(query, {
        id: 10_456,
        companyId: 1,
        roles: ['CEO'],
      });

      expect(out.ownMonthProfit).toBeNull();
    });

    it('is stripped for an Administrator caller', async () => {
      mockService.getOwnMonthProfit.mockResolvedValueOnce({
        month: '2026-07',
        ownMoney: 1,
        cashTotal: 1,
        netProfit: { netProfit: 1 },
        ownMonthProfit: 4_257_391,
      });

      const out: any = await controller.getFinancialOverview(query, {
        id: 9,
        companyId: 1,
        roles: ['Administrator'],
      });

      expect(out.ownMonthProfit).toBeUndefined();
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
