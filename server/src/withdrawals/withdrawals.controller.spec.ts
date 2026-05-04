import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalsService } from './withdrawals.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('WithdrawalsController — role guards', () => {
  let controller: WithdrawalsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    preview: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WithdrawalsController],
      providers: [{ provide: WithdrawalsService, useValue: mockService }],
    }).compile();

    controller = module.get(WithdrawalsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => WithdrawalsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('class-level @Roles metadata', () => {
    it('should restrict to CEO, Branch Director, Administrator', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, WithdrawalsController);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });
  });

  describe('preview() guard', () => {
    it('should allow CEO', () => {
      const ctx = mockExecutionContext(controller.preview, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director', () => {
      const ctx = mockExecutionContext(controller.preview, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator', () => {
      const ctx = mockExecutionContext(controller.preview, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher', () => {
      const ctx = mockExecutionContext(controller.preview, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier', () => {
      const ctx = mockExecutionContext(controller.preview, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('create() guard', () => {
    it('should allow CEO', () => {
      const ctx = mockExecutionContext(controller.create, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director', () => {
      const ctx = mockExecutionContext(controller.create, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator', () => {
      const ctx = mockExecutionContext(controller.create, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher', () => {
      const ctx = mockExecutionContext(controller.create, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier', () => {
      const ctx = mockExecutionContext(controller.create, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
