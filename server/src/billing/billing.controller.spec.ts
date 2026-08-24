import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingController } from './billing.controller';
import { LessonBillingService } from './lesson-billing.service';
import { DebtWriteOffService } from './debt-write-off.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('BillingController — role guards', () => {
  let controller: BillingController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockLessonBilling = {
    reverseLessonDeduction: jest.fn(),
    runRetroactiveBilling: jest.fn(),
  } as any;
  const mockDebtWriteOff = {
    reverseWriteOff: jest.fn().mockResolvedValue({}),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: LessonBillingService, useValue: mockLessonBilling },
        { provide: DebtWriteOffService, useValue: mockDebtWriteOff },
      ],
    }).compile();

    controller = module.get(BillingController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => BillingController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('reverseDebtWriteOff() guard — CEO only', () => {
    it('allows CEO', () => {
      const ctx = mockExecutionContext(controller.reverseDebtWriteOff, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
    it('denies Branch Director', () => {
      const ctx = mockExecutionContext(controller.reverseDebtWriteOff, [
        'Branch Director',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Administrator', () => {
      const ctx = mockExecutionContext(controller.reverseDebtWriteOff, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.reverseDebtWriteOff, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.reverseDebtWriteOff, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('endpoint metadata sanity', () => {
    it('reverseDebtWriteOff is annotated with CEO only', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.reverseDebtWriteOff,
      );
      expect(roles).toEqual(['CEO']);
    });
  });
});
