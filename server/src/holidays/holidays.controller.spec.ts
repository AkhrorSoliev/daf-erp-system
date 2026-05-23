import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('HolidaysController — role guards', () => {
  let controller: HolidaysController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 10 }),
    findOne: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({ message: 'ok' }),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HolidaysController],
      providers: [{ provide: HolidaysService, useValue: mockService }],
    }).compile();

    controller = module.get(HolidaysController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => HolidaysController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('create()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow CEO to create', () => {
      const ctx = mockExecutionContext(controller.create, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to create', () => {
      const ctx = mockExecutionContext(controller.create, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from creating', () => {
      const ctx = mockExecutionContext(controller.create, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from creating', () => {
      const ctx = mockExecutionContext(controller.create, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('update()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow Branch Director to update', () => {
      const ctx = mockExecutionContext(controller.update, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('remove()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow Administrator to delete', () => {
      const ctx = mockExecutionContext(controller.remove, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from deleting', () => {
      const ctx = mockExecutionContext(controller.remove, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from deleting', () => {
      const ctx = mockExecutionContext(controller.remove, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('changeStatus()', () => {
    it('should deny Teacher from changing status', () => {
      const ctx = mockExecutionContext(controller.changeStatus, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('findAll() — no guard', () => {
    it('should NOT have @Roles metadata (open to all authenticated users)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findAll);
      expect(roles).toBeUndefined();
    });
  });

  describe('findOne() — no guard', () => {
    it('should NOT have @Roles metadata (open to all authenticated users)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findOne);
      expect(roles).toBeUndefined();
    });
  });
});
