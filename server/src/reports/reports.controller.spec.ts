import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
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
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockService }],
    }).compile();

    controller = module.get(ReportsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
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
            guard.canActivate(
              mockExecutionContext(controller[method], [role]),
            ),
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
});
