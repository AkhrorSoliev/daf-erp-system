import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityHistoryService } from '../common/entity-history';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from './users.service';

/**
 * An access token lives an hour and `JwtStrategy` never re-reads the account,
 * so the only thing that stops a token early is `JwtAuthGuard`'s negative
 * cache, `user:blocked:<id>`. The employee page blocks people through THIS
 * service — status on `PATCH /users/:id`, archive on `DELETE /users/:id` —
 * and for as long as only `TeachersService` wrote the key, an archived,
 * suspended or terminated employee kept full use of their token for that
 * hour. The key literal below is the one the guard reads.
 */
describe('UsersService — blocking an employee cuts off their access token', () => {
  const EMPLOYEE_ID = 42;
  const CEO_ID = 7;
  const COMPANY_ID = 1001;
  const FERGANA = 500;
  const BLOCK_KEY = 'user:blocked:42';

  const employee = {
    id: EMPLOYEE_ID,
    firstName: 'Dilnoza',
    lastName: 'Karimova',
    phone: '901234567',
    photo: null,
    gender: 'FEMALE',
    balance: 0,
    login: '901234567',
    password: '$2a$10$hash',
    position: 'Administrator',
    companyId: COMPANY_ID,
    mainBranch: FERGANA,
    isActive: true,
    status: 'ACTIVE',
    telegramChatId: null,
    createdAt: new Date('2026-03-01T09:00:00Z'),
    updatedAt: new Date('2026-09-01T09:00:00Z'),
    deletedAt: null,
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: FERGANA, name: 'Fergana' } }],
    company: { id: COMPANY_ID, name: 'DaF', subdomain: 'daf', logo: null },
    groupTeachers: [],
  };
  // A CEO spans every branch, so the object-level check passes and these
  // tests stay about the cache.
  const ceo = {
    id: CEO_ID,
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  /** Redis as the guard sees it: a key is either there or it is not. */
  function fakeRedis() {
    const store = new Map<string, string>();
    return {
      store,
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key: string) => Promise.resolve(store.delete(key) ? 1 : 0)),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    };
  }

  let service: UsersService;
  let redis: ReturnType<typeof fakeRedis>;
  let prisma: {
    user: { findFirst: jest.Mock; update: jest.Mock };
    userRole: { deleteMany: jest.Mock; createMany: jest.Mock };
    userBranch: { deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    redis = fakeRedis();
    prisma = {
      user: {
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(
            where.id === CEO_ID
              ? ceo
              : where.id === EMPLOYEE_ID
                ? employee
                : null,
          ),
        ),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...employee, ...data }),
        ),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('blocks an archived employee', async () => {
    await service.softDelete(EMPLOYEE_ID, CEO_ID, COMPANY_ID);

    expect(redis.store.get(BLOCK_KEY)).toBe('1');
  });

  it.each(['SUSPENDED', 'TERMINATED'])(
    'blocks an employee whose status is set to %s',
    async (status) => {
      await service.updateUser(EMPLOYEE_ID, { status }, CEO_ID, COMPANY_ID);

      expect(redis.store.get(BLOCK_KEY)).toBe('1');
    },
  );

  // Neither status stops a sign-in (`validateUser` admits both), so a key
  // left behind would only cost the guard a confirming query per request.
  it.each(['ACTIVE', 'INACTIVE'])(
    'lifts the block when an employee is set back to %s',
    async (status) => {
      redis.store.set(BLOCK_KEY, '1');

      await service.updateUser(EMPLOYEE_ID, { status }, CEO_ID, COMPANY_ID);

      expect(redis.store.has(BLOCK_KEY)).toBe(false);
    },
  );

  it('leaves the block alone on an edit that sends no status', async () => {
    redis.store.set(BLOCK_KEY, '1');

    await service.updateUser(
      EMPLOYEE_ID,
      { firstName: 'Dilnoza' },
      CEO_ID,
      COMPANY_ID,
    );

    expect(redis.store.get(BLOCK_KEY)).toBe('1');
  });

  // The database is the authority and the key only shortens an hour, so an
  // unreachable Redis must not undo or refuse the write that matters.
  describe('when Redis is unreachable', () => {
    beforeEach(() => {
      redis.set.mockRejectedValue(new Error('ECONNREFUSED'));
      redis.del.mockRejectedValue(new Error('ECONNREFUSED'));
    });

    it('still archives the employee', async () => {
      await expect(
        service.softDelete(EMPLOYEE_ID, CEO_ID, COMPANY_ID),
      ).resolves.toEqual({ message: expect.any(String) });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EMPLOYEE_ID },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        }),
      );
    });

    it.each(['TERMINATED', 'ACTIVE'])(
      'still saves the status %s',
      async (status) => {
        await expect(
          service.updateUser(EMPLOYEE_ID, { status }, CEO_ID, COMPANY_ID),
        ).resolves.toMatchObject({ status });
      },
    );
  });
});
