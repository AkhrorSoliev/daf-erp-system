import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('PaymentsController — role guards', () => {
  let controller: PaymentsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    create: jest.fn().mockResolvedValue({}),
    reverse: jest.fn().mockResolvedValue({}),
    correctAmount: jest.fn().mockResolvedValue({}),
    createFromExternal: jest.fn().mockResolvedValue({}),
    findAll: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue({}),
    findByStudent: jest.fn().mockResolvedValue({}),
    getDebtors: jest.fn().mockResolvedValue({}),
    getDebtorSummary: jest.fn().mockResolvedValue({}),
    getPending: jest.fn().mockResolvedValue({}),
    getDebtorsForGroup: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [{ provide: PaymentsService, useValue: mockService }],
    }).compile();

    controller = module.get(PaymentsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => PaymentsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('correct() — payment amount correction', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.correct);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow CEO to correct', () => {
      const ctx = mockExecutionContext(controller.correct, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director to correct', () => {
      const ctx = mockExecutionContext(controller.correct, [
        'Branch Director',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to correct', () => {
      const ctx = mockExecutionContext(controller.correct, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Cashier from correcting', () => {
      const ctx = mockExecutionContext(controller.correct, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from correcting', () => {
      const ctx = mockExecutionContext(controller.correct, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should delegate to PaymentsService.correctAmount with user id, companyId and roles', () => {
      const dto = { correctAmount: 400000, reason: 'Ortiqcha summa' };
      controller.correct('payment-1', dto, 99, 1001, ['Administrator']);
      expect(mockService.correctAmount).toHaveBeenCalledWith(
        'payment-1',
        dto,
        99,
        1001,
        ['Administrator'],
      );
    });
  });

  describe('debtors list + summary', () => {
    it('delegates getDebtors with branch scope (userId + roles)', () => {
      controller.getDebtors(
        { branchId: 5, page: 2, pageSize: 20, search: 'ali', sortBy: 'balance' } as any,
        99,
        1001,
        ['Branch Director'],
      );
      expect(mockService.getDebtors).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({
          branchId: 5,
          page: 2,
          pageSize: 20,
          search: 'ali',
          sortBy: 'balance',
          userId: 99,
          roles: ['Branch Director'],
        }),
      );
    });

    it('delegates getDebtorSummary with userId + roles', () => {
      controller.getDebtorSummary({ branchId: 5 } as any, 99, 1001, ['CEO']);
      expect(mockService.getDebtorSummary).toHaveBeenCalledWith(1001, {
        branchId: 5,
        userId: 99,
        roles: ['CEO'],
      });
    });
  });

  describe('reverse() — payment reversal', () => {
    it('should have @Roles(CEO) metadata (CEO-only)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.reverse);
      expect(roles).toEqual(['CEO']);
    });

    it('should allow CEO to reverse', () => {
      const ctx = mockExecutionContext(controller.reverse, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Administrator from reversing', () => {
      const ctx = mockExecutionContext(controller.reverse, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
