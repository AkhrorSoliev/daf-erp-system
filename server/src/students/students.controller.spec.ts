import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { StudentEnrollmentService } from './student-enrollment.service';
import { SmsService } from '../sms/sms.service';
import { TransactionsService } from '../transactions/transactions.service';
import { DebtAgeService } from '../common/finance/debt-age.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('StudentsController — debt write-off role guards', () => {
  let controller: StudentsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockStudentsService = {} as any;
  const mockEnrollmentService = {
    removeFromGroup: jest.fn().mockResolvedValue({}),
    getDebtWriteOffEligibility: jest.fn().mockResolvedValue({}),
    writeOffDroppedEnrollmentDebt: jest.fn().mockResolvedValue({}),
  };
  const mockSmsService = {} as any;
  const mockTransactionsService = {} as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentsController],
      providers: [
        { provide: StudentsService, useValue: mockStudentsService },
        { provide: StudentEnrollmentService, useValue: mockEnrollmentService },
        { provide: SmsService, useValue: mockSmsService },
        { provide: TransactionsService, useValue: mockTransactionsService },
        {
          provide: DebtAgeService,
          useValue: { getForStudent: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    controller = module.get(StudentsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => StudentsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('removeFromGroup() guard (DELETE /:id/enroll/:enrollmentId)', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.removeFromGroup, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.removeFromGroup, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Administrator', () => {
      const ctx = mockExecutionContext(controller.removeFromGroup, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.removeFromGroup, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.removeFromGroup, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getDebtWriteOffEligibility() guard', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffEligibility, [
        'CEO',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffEligibility, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Administrator', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffEligibility, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffEligibility, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.getDebtWriteOffEligibility, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('writeOffCycleDebt() guard', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.writeOffCycleDebt, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.writeOffCycleDebt, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Administrator', () => {
      const ctx = mockExecutionContext(controller.writeOffCycleDebt, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.writeOffCycleDebt, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.writeOffCycleDebt, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('getLessonsOverview() guard (GET /:id/lessons-overview)', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.getLessonsOverview, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Branch Director', () => {
      const ctx = mockExecutionContext(controller.getLessonsOverview, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('allows Administrator', () => {
      const ctx = mockExecutionContext(controller.getLessonsOverview, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    // Monitoring ko'rinishi — Cashier ataylab KIRITILMAGAN.
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.getLessonsOverview, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.getLessonsOverview, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('endpoint metadata sanity', () => {
    it('getLessonsOverview is annotated with the three admin roles', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getLessonsOverview,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
    it('removeFromGroup is annotated with the three admin roles', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.removeFromGroup,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
    it('getDebtWriteOffEligibility is annotated with the three admin roles', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.getDebtWriteOffEligibility,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
    it('writeOffCycleDebt is annotated with the three admin roles', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.writeOffCycleDebt,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
  });

  /**
   * The discount no longer rewrites past charges (CEO decision 2026-08-24 —
   * a discount applies from the moment it is set). It still decides what every
   * FUTURE lesson costs, and who may set it is a CEO / Branch Director call
   * that used to live only in the browser.
   */
  describe('update() carries DiscountRoleGuard (PATCH /:id)', () => {
    it('is declared on the route, not only in the form', () => {
      // The web form hides the input from Administrators; before this guard
      // that was the ONLY thing enforcing it, and the route accepts them.
      const guards = Reflect.getMetadata(
        '__guards__',
        controller.update,
      ) as unknown[];
      const names = (guards ?? []).map((g) =>
        typeof g === 'function' ? g.name : g?.constructor?.name,
      );
      expect(names).toContain('DiscountRoleGuard');
    });
  });
});
