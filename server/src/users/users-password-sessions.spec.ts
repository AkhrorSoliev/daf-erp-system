import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';

/**
 * A password write on an employee account ends that account's other sessions
 * (ADR-0030): the hash and the session-version bump land in ONE update, the
 * new version is mirrored for JwtAuthGuard, and the write is journaled.
 */
describe('UsersService — a password write ends the other sessions', () => {
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const adminTarget = (overrides: Record<string, unknown> = {}) => ({
    id: 24,
    companyId: 1001,
    mainBranch: null,
    status: 'ACTIVE',
    isActive: true,
    password: '$2b$10$stored.hash',
    login: '901234567',
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: 500, name: 'Main' } }],
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
    ...overrides,
  });

  let service: UsersService;
  let prisma: any;
  let redis: { set: jest.Mock };
  let history: { recordUpdate: jest.Mock };
  let target: any;

  beforeEach(async () => {
    target = adminTarget();
    prisma = {
      user: {
        // Caller-scope lookups select `roles` without `status`; the target
        // lookup goes through `userSelect`, which carries `status`.
        findFirst: jest
          .fn()
          .mockImplementation(({ select }: any) =>
            Promise.resolve(
              select?.roles && !select?.status ? CEO_CALLER : target,
            ),
          ),
        // `changePassword` loads the full row (no select); the role-grant
        // check asks for the caller's roles (with a select).
        findUnique: jest
          .fn()
          .mockImplementation(({ select }: any) =>
            Promise.resolve(select ? CEO_CALLER : target),
          ),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...target, ...data, sessionVersion: 5 }),
          ),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    redis = { set: jest.fn().mockResolvedValue('OK') };
    history = { recordUpdate: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EntityHistoryService, useValue: history },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('changePassword: bumps the version in the same update as the hash, mirrors it and journals it', async () => {
    target = adminTarget({ password: await bcrypt.hash('eskiParol1', 4) });

    const res = await service.changePassword(24, {
      oldPassword: 'eskiParol1',
      newPassword: 'yangiParol1',
    });

    // The controller signs this device's fresh pair with exactly this.
    expect(res.sessionVersion).toBe(5);
    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare('yangiParol1', call.data.password)).toBe(true);
    expect(call.select).toEqual({ sessionVersion: true });
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 24,
        newValues: { parol: "o'zgartirildi" },
        changedById: 24,
        companyId: 1001,
      }),
    );
  });

  it('changePassword: a wrong current password writes nothing', async () => {
    target = adminTarget({ password: await bcrypt.hash('eskiParol1', 4) });

    await expect(
      service.changePassword(24, {
        oldPassword: 'xato',
        newPassword: 'yangiParol1',
      }),
    ).rejects.toThrow("Joriy parol noto'g'ri");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('updateUser: a password set by a manager ends the sessions and names who set it', async () => {
    const res = await service.updateUser(
      24,
      { password: 'yangiParol1' } as any,
      99,
      1001,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(typeof call.data.password).toBe('string');
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 24,
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: 99,
        companyId: 1001,
      }),
    );
    expect(res).not.toHaveProperty('sessionVersion');
  });

  it('updateUser: taking every role away clears the password and ends the sessions', async () => {
    await service.updateUser(
      24,
      { roleIds: [], position: 'Farrosh' } as any,
      99,
      1001,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data).toMatchObject({
      password: null,
      login: null,
      sessionVersion: { increment: 1 },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: { parol: "rollar olib tashlangani uchun o'chirildi" },
      }),
    );
  });

  it('updateUser: mirrors the bump after the commit, even if the journal then fails', async () => {
    // The password is committed the moment the transaction resolves; a
    // journal failure after that must not leave the old tokens working.
    const order: string[] = [];
    prisma.$transaction = jest.fn(async (cb: any) => {
      const result = await cb(prisma);
      order.push('commit');
      return result;
    });
    redis.set.mockImplementation(async () => {
      order.push('mirror');
      return 'OK';
    });
    history.recordUpdate.mockRejectedValueOnce(new Error('journal down'));

    await expect(
      service.updateUser(24, { password: 'yangiParol1' } as any, 99, 1001),
    ).rejects.toThrow('journal down');

    expect(order).toEqual(['commit', 'mirror']);
  });

  it('updateUser: an ordinary edit leaves the sessions alone', async () => {
    await service.updateUser(
      24,
      { position: 'Bosh administrator' } as any,
      99,
      1001,
    );

    expect(
      prisma.user.update.mock.calls[0][0].data.sessionVersion,
    ).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ parol: expect.anything() }),
      }),
    );
  });
});
