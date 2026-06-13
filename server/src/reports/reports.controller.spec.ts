import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
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
    getFinancialOverview: jest.fn().mockResolvedValue({}),
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
  };

  const mockPrisma = {
    userBranch: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockService },
        { provide: PrismaService, useValue: mockPrisma },
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
  ] as const;

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

  describe('getDebtWriteOffsSummary() guard — CEO + BD only', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'CEO',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Administrator (financial-correction aggregate hidden from Admin)', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffsSummary, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  // Financial statements (Phase 1) — CEO + Branch Director only.
  const statementEndpoints = [
    'getProfitLoss',
    'getCashFlow',
    'getBalanceSheet',
  ] as const;

  for (const method of statementEndpoints) {
    describe(`${method}() — financial statement guard (CEO + BD only)`, () => {
      it(`should have @Roles(CEO, Branch Director) on ${method}`, () => {
        const roles = reflector.get<string[]>(ROLES_KEY, controller[method]);
        expect(roles).toEqual(['CEO', 'Branch Director']);
      });

      it('allows CEO and Branch Director', () => {
        for (const role of ['CEO', 'Branch Director']) {
          expect(
            guard.canActivate(mockExecutionContext(controller[method], [role])),
          ).toBe(true);
        }
      });

      it('denies Administrator, Cashier, Teacher', () => {
        for (const role of ['Administrator', 'Cashier', 'Teacher']) {
          expect(() =>
            guard.canActivate(mockExecutionContext(controller[method], [role])),
          ).toThrow(ForbiddenException);
        }
      });
    });
  }

  describe('branch scope resolver (private)', () => {
    it('CEO gets null (no branch filter)', async () => {
      mockPrisma.userBranch.findMany.mockResolvedValue([
        { branchId: 99 }, // ignored for CEO
      ]);
      const result = await (controller as any).resolveBranchScopeForUser({
        id: 1,
        roles: ['CEO'],
      });
      expect(result).toBeNull();
      expect(mockPrisma.userBranch.findMany).not.toHaveBeenCalled();
    });

    it('Branch Director gets their UserBranch rows', async () => {
      mockPrisma.userBranch.findMany.mockReset();
      mockPrisma.userBranch.findMany.mockResolvedValue([
        { branchId: 3 },
        { branchId: 7 },
      ]);
      const result = await (controller as any).resolveBranchScopeForUser({
        id: 2,
        roles: ['Branch Director'],
      });
      expect(result).toEqual([3, 7]);
    });
  });
});
