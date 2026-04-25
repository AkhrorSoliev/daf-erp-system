import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { SalaryService } from '../salary/salary.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('TeachersController — role guards', () => {
  let controller: TeachersController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({}),
    findGroupsByTeacherId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    getStatusHistory: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeachersController],
      providers: [
        { provide: TeachersService, useValue: mockService },
        {
          provide: SalaryService,
          useValue: {
            getTeacherSalarySummary: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    controller = module.get(TeachersController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(handler: Function, roles: string[]) {
    return {
      getHandler: () => handler,
      getClass: () => TeachersController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { roles } }),
      }),
    } as any;
  }

  describe('findAll()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findAll);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow CEO to list teachers', () => {
      const ctx = mockExecutionContext(controller.findAll, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to list teachers', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from listing teachers', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from listing teachers', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    it('should have @Roles(CEO, Branch Director) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should allow CEO to create', () => {
      const ctx = mockExecutionContext(controller.create, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director to create', () => {
      const ctx = mockExecutionContext(controller.create, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Administrator from creating', () => {
      const ctx = mockExecutionContext(controller.create, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from creating', () => {
      const ctx = mockExecutionContext(controller.create, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('update()', () => {
    it('should have @Roles(CEO, Branch Director) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should deny Administrator from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('changeStatus()', () => {
    it('should have @Roles(CEO, Branch Director) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.changeStatus);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should deny Administrator from changing status', () => {
      const ctx = mockExecutionContext(controller.changeStatus, [
        'Administrator',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('delete()', () => {
    it('should have @Roles(CEO, Branch Director) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.delete);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should deny Administrator from deleting', () => {
      const ctx = mockExecutionContext(controller.delete, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from deleting', () => {
      const ctx = mockExecutionContext(controller.delete, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('findById()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.findById);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should deny Teacher from viewing a teacher profile', () => {
      const ctx = mockExecutionContext(controller.findById, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from viewing a teacher profile', () => {
      const ctx = mockExecutionContext(controller.findById, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('findGroupsByTeacherId()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(
        ROLES_KEY,
        controller.findGroupsByTeacherId,
      );
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should deny Teacher from listing teacher groups', () => {
      const ctx = mockExecutionContext(controller.findGroupsByTeacherId, [
        'Teacher',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from listing teacher groups', () => {
      const ctx = mockExecutionContext(controller.findGroupsByTeacherId, [
        'Cashier',
      ]);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
