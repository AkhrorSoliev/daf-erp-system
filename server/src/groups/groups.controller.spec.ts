import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators';

describe('GroupsController — role guards', () => {
  let controller: GroupsController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({}),
    findStudentsByGroupId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
    getScheduleConflicts: jest.fn().mockResolvedValue([]),
    getAvailableRooms: jest.fn().mockResolvedValue([]),
    getAvailableTeachers: jest.fn().mockResolvedValue([]),
    getAvailableSlots: jest.fn().mockResolvedValue([]),
    getNextName: jest.fn().mockResolvedValue(''),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: mockService },
      ],
    }).compile();

    controller = module.get(GroupsController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => GroupsController,
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

    it('should allow Branch Director to create', () => {
      const ctx = mockExecutionContext(controller.create, ['Branch Director']);
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

    it('should allow CEO to update', () => {
      const ctx = mockExecutionContext(controller.update, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director to update', () => {
      const ctx = mockExecutionContext(controller.update, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to update', () => {
      const ctx = mockExecutionContext(controller.update, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('delete()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.delete);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should deny Teacher from deleting', () => {
      const ctx = mockExecutionContext(controller.delete, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('changeStatus()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.changeStatus);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should deny Teacher from changing status', () => {
      const ctx = mockExecutionContext(controller.changeStatus, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('findAll() — no guard metadata', () => {
    it('should NOT have @Roles metadata (filtered by service logic for teachers)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findAll);
      expect(roles).toBeUndefined();
    });
  });

  describe('findOne() — no guard', () => {
    it('should NOT have @Roles metadata (teachers can view group details)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findOne);
      expect(roles).toBeUndefined();
    });
  });

  describe('findStudentsByGroupId() — no guard', () => {
    it('should NOT have @Roles metadata (teachers can view group students)', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findStudentsByGroupId);
      expect(roles).toBeUndefined();
    });
  });
});
