import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LessonReschedulesController } from './lesson-reschedules.controller';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('LessonReschedulesController — role guards', () => {
  let controller: LessonReschedulesController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findByGroup: jest.fn().mockResolvedValue([]),
    findAvailableRooms: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LessonReschedulesController],
      providers: [
        { provide: LessonReschedulesService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(LessonReschedulesController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => LessonReschedulesController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('availableRooms()', () => {
    it('has @Roles(CEO, Branch Director, Administrator) — Teacher excluded', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.availableRooms,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('allows Administrator to query', () => {
      const ctx = mockExecutionContext(controller.availableRooms, [
        'Administrator',
      ]);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('denies Teacher', () => {
      const ctx = mockExecutionContext(controller.availableRooms, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('denies Cashier', () => {
      const ctx = mockExecutionContext(controller.availableRooms, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    it('has @Roles(CEO, Branch Director, Administrator)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('denies Teacher from creating reschedules', () => {
      const ctx = mockExecutionContext(controller.create, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('update()', () => {
    it('has @Roles(CEO, Branch Director, Administrator)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('allows Administrator to edit', () => {
      const ctx = mockExecutionContext(controller.update, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('denies Teacher from editing', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('remove()', () => {
    it('has @Roles(CEO, Branch Director) — Administrator excluded', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('denies Administrator from removing', () => {
      const ctx = mockExecutionContext(controller.remove, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
