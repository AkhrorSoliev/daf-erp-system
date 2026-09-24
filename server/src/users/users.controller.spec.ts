import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { RolesGuard } from '../common/guards';
import { ROLES_KEY } from '../common/decorators';

describe('UsersController — role guards', () => {
  let controller: UsersController;
  let reflector: Reflector;
  let guard: RolesGuard;

  const mockService = {
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    updateUser: jest.fn().mockResolvedValue({}),
    updateProfile: jest.fn().mockResolvedValue({}),
    changePassword: jest.fn().mockResolvedValue({}),
    softDelete: jest.fn().mockResolvedValue({}),
  };

  const mockAuth = {
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 7 },
    }),
    logoutOtherSessions: jest.fn().mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      user: { id: 7 },
    }),
  };

  // The mocks live for the whole suite, so order checks compare LAST calls.
  const lastCall = (fn: jest.Mock) =>
    fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockService },
        { provide: AuthService, useValue: mockAuth },
      ],
    }).compile();

    controller = module.get(UsersController);
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  function mockExecutionContext(
    handler: (...args: unknown[]) => unknown,
    roles: string[],
  ) {
    return {
      getHandler: () => handler,
      getClass: () => UsersController,
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

    it('should allow CEO to list users', () => {
      const ctx = mockExecutionContext(controller.findAll, ['CEO']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Branch Director to list users', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Branch Director']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should allow Administrator to list users', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Administrator']);
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('should deny Teacher from listing users', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Cashier from listing users', () => {
      const ctx = mockExecutionContext(controller.findAll, ['Cashier']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.create);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should allow CEO to create', () => {
      const ctx = mockExecutionContext(controller.create, ['CEO']);
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

    it('passes companyId and callerId from JWT to the service', async () => {
      await controller.create(
        {
          firstName: 'A',
          lastName: 'B',
          roleIds: [3],
          password: 'pass1',
        } as any,
        1001,
        42,
      );
      expect(mockService.create).toHaveBeenCalledWith(
        expect.objectContaining({ companyId: 1001 }),
        { kind: 'user', id: 42 },
      );
    });
  });

  describe('update()', () => {
    it('should have @Roles(CEO, Branch Director, Administrator) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.update);
      expect(roles).toEqual(['CEO', 'Branch Director', 'Administrator']);
    });

    it('should deny Teacher from updating', () => {
      const ctx = mockExecutionContext(controller.update, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('passes id, dto, userId, companyId to the service', async () => {
      await controller.update(7, { firstName: 'X' } as any, 42, 1001);
      expect(mockService.updateUser).toHaveBeenCalledWith(
        7,
        { firstName: 'X' },
        42,
        1001,
      );
    });
  });

  describe('remove()', () => {
    it('should have @Roles(CEO, Branch Director) metadata', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.remove);
      expect(roles).toEqual(['CEO', 'Branch Director']);
    });

    it('should deny Administrator from deleting', () => {
      const ctx = mockExecutionContext(controller.remove, ['Administrator']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should deny Teacher from deleting', () => {
      const ctx = mockExecutionContext(controller.remove, ['Teacher']);
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('passes id, userId, companyId to the service', async () => {
      await controller.remove(7, 42, 1001);
      expect(mockService.softDelete).toHaveBeenCalledWith(7, 42, 1001);
    });
  });

  describe('changePassword()', () => {
    it('hands the caller a fresh session AFTER the change', async () => {
      mockService.changePassword.mockResolvedValue({
        message: "Parol muvaffaqiyatli o'zgartirildi",
      });

      const res = await controller.changePassword(7, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      expect(mockAuth.issueSession).toHaveBeenCalledWith(7);
      // Issued before the change, the pair would carry the old version.
      expect(lastCall(mockService.changePassword)).toBeLessThan(
        lastCall(mockAuth.issueSession),
      );
      expect(res).toEqual({
        message: "Parol muvaffaqiyatli o'zgartirildi",
        accessToken: 'a',
        refreshToken: 'r',
        user: { id: 7 },
      });
    });
  });

  describe('logoutOthers()', () => {
    it('is open to every signed-in account (no @Roles)', () => {
      expect(
        reflector.get<string[]>(ROLES_KEY, controller.logoutOthers),
      ).toBeUndefined();
    });

    it('acts on the caller only', async () => {
      const res = await controller.logoutOthers(7);

      expect(mockAuth.logoutOtherSessions).toHaveBeenCalledWith(7);
      expect(res).toEqual({
        accessToken: 'a2',
        refreshToken: 'r2',
        user: { id: 7 },
      });
    });
  });
});
