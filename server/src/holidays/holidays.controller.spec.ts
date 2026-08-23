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

  // These two used to assert the guard was ABSENT, which encoded the hole as if
  // it were the contract — the same shape four other controller specs carried
  // before Batch 7. Flipped so the test fails if the guard is ever removed.
  describe('findAll() — staff only', () => {
    it('has @Roles metadata excluding Student', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findAll);
      expect(roles).toBeDefined();
      expect(roles).not.toContain('Student');
    });

    it('denies a Student-portal token', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Student']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows staff', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // `findAll` was given a role guard and a companyId; `findOne` was left with
  // neither, so any valid token — a student-portal one included — could read
  // any holiday in the database by id. The comment above `findAll` said both
  // had been fixed.
  describe('findOne() — staff only', () => {
    it('has @Roles metadata excluding Student', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findOne);
      expect(roles).toBeDefined();
      expect(roles).not.toContain('Student');
    });

    it('denies a Student-portal token', () => {
      const ctx = mockExecutionContext(controller.findOne, ['Student']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows staff', () => {
      const ctx = mockExecutionContext(controller.findOne, ['Teacher']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('passes the caller company through to the service', () => {
      controller.findOne('h-1', 1001);
      expect(mockService.findOne).toHaveBeenCalledWith('h-1', 1001);
    });
  });
});
