import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { ROLE_ID } from '../common/auth/role-ids';
import { PermissionsService } from '../common/permissions/permissions.service';
import {
  defaultRolesOf,
  fakePermissions,
  routeAccess,
} from '../common/permissions/testing';

describe('UsersController — route access', () => {
  let controller: UsersController;

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
        // OwnPasswordAttemptGuard (ADR-0031) is built with the controller.
        { provide: RedisService, useValue: {} },
        { provide: AuthService, useValue: mockAuth },
        {
          provide: PermissionsService,
          useValue: fakePermissions([ROLE_ID.CEO]),
        },
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  describe('findAll()', () => {
    it('is gated by the employee, teacher and group capabilities', () => {
      expect(routeAccess(UsersController, 'findAll')).toEqual({
        kind: 'can',
        keys: [
          'employees.view',
          'teachers.view',
          'groups.manage',
          'salary.pay',
        ],
      });
    });

    it('admits the CEO, Branch Director and Administrator by default, not the Teacher or the Cashier', () => {
      expect(defaultRolesOf(UsersController, 'findAll')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  // ADR-0087: an employee's salary balance goes only to a caller with salary.view.
  describe.each([
    ['Administrator', ROLE_ID.ADMINISTRATOR, false],
    ['Branch Director', ROLE_ID.BRANCH_DIRECTOR, true],
    ['CEO', ROLE_ID.CEO, true],
  ])('employee balance for the %s', (_name, roleId, sees) => {
    const build = () =>
      new UsersController(
        mockService as never,
        mockAuth as never,
        fakePermissions([roleId]),
      );

    it(`findAll passes includeBalance=${sees}`, async () => {
      mockService.findAll.mockClear();
      await build().findAll({} as never, 7, 1001, null);
      expect(mockService.findAll).toHaveBeenCalledWith({}, 1001, null, sees);
    });

    it(`findOne passes includeBalance=${sees}`, async () => {
      mockService.findById.mockClear();
      await build().findOne(5, 7, 1001, null);
      expect(mockService.findById).toHaveBeenCalledWith(5, 1001, null, sees);
    });
  });

  describe('findOne()', () => {
    it('is gated by the employee and teacher view capabilities', () => {
      expect(routeAccess(UsersController, 'findOne')).toEqual({
        kind: 'can',
        keys: ['employees.view', 'teachers.view'],
      });
    });

    it('admits the CEO, Branch Director and Administrator by default', () => {
      expect(defaultRolesOf(UsersController, 'findOne')).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    });
  });

  // Administrators do not hold `employees.manage` (docs/role-access.md). The
  // page is hidden from them; the three writes behind it refuse them too,
  // because the backend is the boundary. They onboard teachers and cashiers
  // through the Telegram link, and edit their own profile through
  // PATCH /users/profile.
  describe.each(['create', 'update', 'remove'] as const)(
    '%s() access',
    (name) => {
      it('is gated by the employee manage capability', () => {
        expect(routeAccess(UsersController, name)).toEqual({
          kind: 'can',
          keys: ['employees.manage'],
        });
      });

      it('admits the CEO and the Branch Director by default, nobody else', () => {
        expect(defaultRolesOf(UsersController, name)).toEqual([
          'Branch Director',
          'CEO',
        ]);
      });
    },
  );

  describe('create()', () => {
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
    it('passes id, userId, companyId to the service', async () => {
      await controller.remove(7, 42, 1001);
      expect(mockService.softDelete).toHaveBeenCalledWith(7, 42, 1001);
    });
  });

  describe('changePassword()', () => {
    it('is open to every signed-in account', () => {
      expect(routeAccess(UsersController, 'changePassword')).toEqual({
        kind: 'anyUser',
      });
    });

    it('hands the caller a fresh session AFTER the change', async () => {
      mockService.changePassword.mockResolvedValue({
        message: "Parol muvaffaqiyatli o'zgartirildi",
        sessionVersion: 5,
      });

      const res = await controller.changePassword(7, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      // Signed with exactly the version the change produced; the number
      // itself never reaches the response.
      expect(mockAuth.issueSession).toHaveBeenCalledWith(7, 5);
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

  describe('updateProfile()', () => {
    it('is open to every signed-in account', () => {
      expect(routeAccess(UsersController, 'updateProfile')).toEqual({
        kind: 'anyUser',
      });
    });
  });

  describe('logoutOthers()', () => {
    it('is open to every signed-in account', () => {
      expect(routeAccess(UsersController, 'logoutOthers')).toEqual({
        kind: 'anyUser',
      });
    });

    it("acts on the caller only, from the caller's own session version", async () => {
      const res = await controller.logoutOthers(7, 3);

      expect(mockAuth.logoutOtherSessions).toHaveBeenCalledWith(7, 3);
      expect(res).toEqual({
        accessToken: 'a2',
        refreshToken: 'r2',
        user: { id: 7 },
      });
    });
  });
});
