import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { PHONE_HELD_BY_STAFF_MESSAGE } from '../common/auth/phone-account-rules';
import { OWN_SIGN_IN_KEYS_MESSAGE } from '../common/auth/own-sign-in-keys';

const PASSWORD = 'secret1';
const SELF_ID = 10;
const CEO_ID = 2;

describe('UsersService — own sign-in keys (ADR-0031)', () => {
  let service: UsersService;
  let prisma: any;
  let history: { recordUpdate: jest.Mock };
  let passwordHash: string;
  let state: {
    account: any;
    staffHolder: object | null;
    loginHolder: object | null;
  };

  const ceoCaller = {
    id: CEO_ID,
    mainBranch: null,
    branches: [],
    roles: [{ role: { id: 1, name: 'CEO' } }],
  };

  function makeAccount(overrides: object = {}) {
    return {
      id: SELF_ID,
      firstName: 'Akmal',
      lastName: 'Karimov',
      phone: '901112233',
      login: '901112233',
      password: passwordHash,
      companyId: 1001,
      mainBranch: 500,
      status: 'ACTIVE',
      roles: [{ role: { id: 3, name: 'Administrator' } }],
      branches: [{ branch: { id: 500, name: 'Main' } }],
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
      ...overrides,
    };
  }

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    state = { account: makeAccount(), staffHolder: null, loginHolder: null };
    history = { recordUpdate: jest.fn() };
    prisma = {
      user: {
        // Answers by the shape of `where`: the staff-duplicate lookup filters
        // on roles, loginForPhone on login, everything else asks by id.
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.roles) return Promise.resolve(state.staffHolder);
          if (where?.login !== undefined)
            return Promise.resolve(state.loginHolder);
          if (where?.id === CEO_ID) return Promise.resolve(ceoCaller);
          if (where?.id === state.account.id)
            return Promise.resolve(state.account);
          return Promise.resolve(null);
        }),
        findUnique: jest
          .fn()
          .mockImplementation(() => Promise.resolve(state.account)),
        update: jest.fn().mockImplementation(({ data }: any) => {
          const { password: _hash, ...stored } = state.account;
          return Promise.resolve({ ...stored, ...data });
        }),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        // Written when a status change blocks or unblocks the account (ADR-0028).
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  describe('changeOwnPhone', () => {
    it('refuses a wrong current password and writes nothing', async () => {
      await expect(
        service.changeOwnPhone(SELF_ID, {
          phone: '909998877',
          currentPassword: 'wrong-one',
        }),
      ).rejects.toThrow("Joriy parol noto'g'ri");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an account that has no password', async () => {
      state.account = makeAccount({ password: null });
      await expect(
        service.changeOwnPhone(SELF_ID, {
          phone: '909998877',
          currentPassword: PASSWORD,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('with the right password, writes the phone and moves the login that held the old number', async () => {
      const result = await service.changeOwnPhone(SELF_ID, {
        phone: '909998877',
        currentPassword: PASSWORD,
      });

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      expect(prisma.user.update.mock.calls[0][0].where).toEqual({
        id: SELF_ID,
      });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        phone: '909998877',
        login: '909998877',
      });
      expect(result.phone).toBe('909998877');
      expect(result).not.toHaveProperty('password');

      expect(history.recordUpdate).toHaveBeenCalledTimes(1);
      const entry = history.recordUpdate.mock.calls[0][0];
      expect(entry).toEqual(
        expect.objectContaining({
          entityType: 'User',
          entityId: SELF_ID,
          changedById: SELF_ID,
        }),
      );
      expect(entry.oldValues).not.toHaveProperty('password');
    });

    it('leaves a login that is a legacy username untouched', async () => {
      state.account = makeAccount({ login: 'akmal' });
      await service.changeOwnPhone(SELF_ID, {
        phone: '909998877',
        currentPassword: PASSWORD,
      });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        phone: '909998877',
      });
    });

    it('refuses a number another live staff account holds', async () => {
      state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
      await expect(
        service.changeOwnPhone(SELF_ID, {
          phone: '909998877',
          currentPassword: PASSWORD,
        }),
      ).rejects.toThrow(PHONE_HELD_BY_STAFF_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('writes nothing when the phone is already this one, and returns no password hash', async () => {
      const result = await service.changeOwnPhone(SELF_ID, {
        phone: '901112233',
        currentPassword: PASSWORD,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(history.recordUpdate).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('password');
    });
  });

  describe('updateProfile', () => {
    it('never writes a phone, even one that slipped past validation', async () => {
      await service.updateProfile(SELF_ID, {
        firstName: 'Anvar',
        phone: '909998877',
      } as any);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({
        firstName: 'Anvar',
      });
    });
  });

  describe('updateUser on yourself', () => {
    it.each([
      ['your phone', { phone: '909998877' }],
      ['your login', { login: 'akmal2' }],
      ['your password', { password: 'secret2' }],
    ])('refuses changing %s and writes nothing', async (_what, dto) => {
      const error = await service
        .updateUser(SELF_ID, dto as any, SELF_ID)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as Error).message).toBe(OWN_SIGN_IN_KEYS_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('accepts the stored phone and login re-sent unchanged with a name change', async () => {
      await service.updateUser(
        SELF_ID,
        { firstName: 'Anvar', phone: '901112233', login: '901112233' } as any,
        SELF_ID,
      );
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          firstName: 'Anvar',
          phone: '901112233',
          login: '901112233',
        }),
      );
    });
  });

  describe("updateUser on someone else's phone", () => {
    it('moves the login that held the old number, even though the form re-sent it', async () => {
      await service.updateUser(
        SELF_ID,
        { phone: '909998877', login: '901112233' } as any,
        CEO_ID,
      );
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ phone: '909998877', login: '909998877' }),
      );
    });

    it('lets a deliberately typed new login win over the move', async () => {
      await service.updateUser(
        SELF_ID,
        { phone: '909998877', login: 'akmal-new' } as any,
        CEO_ID,
      );
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ phone: '909998877', login: 'akmal-new' }),
      );
    });

    it('refuses a number another live staff account holds', async () => {
      state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
      await expect(
        service.updateUser(SELF_ID, { phone: '909998877' } as any, CEO_ID),
      ).rejects.toThrow(PHONE_HELD_BY_STAFF_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('checks for a duplicate against the roles the account has after this save', async () => {
      state.account = makeAccount({ roles: [], login: null, password: null });
      state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
      await expect(
        service.updateUser(
          SELF_ID,
          {
            roleIds: [3],
            branchIds: [500],
            password: 'secret9',
            phone: '909998877',
          } as any,
          CEO_ID,
        ),
      ).rejects.toThrow(PHONE_HELD_BY_STAFF_MESSAGE);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('skips the staff check for an employee with no role (they cannot sign in)', async () => {
      state.account = makeAccount({ roles: [], login: null, password: null });
      state.staffHolder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };
      await service.updateUser(SELF_ID, { phone: '909998877' } as any, CEO_ID);
      expect(prisma.user.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ phone: '909998877' }),
      );
    });
  });
});
