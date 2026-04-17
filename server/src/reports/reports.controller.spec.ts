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
    it('should have @Roles(CEO, Branch Director) on the controller class', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, ReportsController);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });
  });

  const endpoints = [
    'getKpis',
    'getRoomUtilization',
    'getTeacherPerformance',
    'getAttendanceAnalytics',
    'getGroupAnalytics',
    'getLeadAnalytics',
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

      it('should deny Administrator', () => {
        const ctx = mockExecutionContext(controller[method], ['Administrator']);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
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
});
