import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * The blocked-user check is the only thing this guard adds on top of passport.
 * It was inert for months because the guard read `request.user.sub` while
 * `JwtStrategy.validate` returns `{ id, roles, companyId }` — no `sub`. Nothing
 * failed: `TeachersService` kept writing `user:blocked:<id>` and every existing
 * test only asserted that the WRITE happened. So these tests assert the READ —
 * that the guard actually asks Redis, and asks it with the right key.
 */
describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let redis: { get: jest.Mock; del: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };
  let parentCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();
    redis = {
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          status: 'TERMINATED',
          deletedAt: null,
        }),
      },
    };
    guard = new JwtAuthGuard(reflector, redis as never, prisma as never);

    // `JwtAuthGuard extends AuthGuard('jwt')` — stub the passport half so these
    // tests are about the blocked-user branch and nothing else.
    parentCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => jest.restoreAllMocks());

  /** Shapes `request.user` exactly as `JwtStrategy.validate` returns it. */
  function mockContext(isPublic: boolean, user?: Record<string, unknown>) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(isPublic);
    return {
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as never;
  }

  const jwtStrategyUser = {
    id: 10505,
    roles: ['Teacher'],
    companyId: 1001,
  };

  it('lets a @Public() route through without touching passport or Redis', async () => {
    await expect(guard.canActivate(mockContext(true))).resolves.toBe(true);
    expect(parentCanActivate).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('asks Redis about the user id that JwtStrategy actually puts on the request', async () => {
    await expect(
      guard.canActivate(mockContext(false, jwtStrategyUser)),
    ).resolves.toBe(true);

    // The regression this file exists for: the guard used to read `user.sub`,
    // which JwtStrategy never sets, so this call never happened.
    expect(redis.get).toHaveBeenCalledWith('user:blocked:10505');
  });

  it('rejects a blocked user before their token expires', async () => {
    redis.get.mockResolvedValue('1');

    await expect(
      guard.canActivate(mockContext(false, jwtStrategyUser)),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      guard.canActivate(mockContext(false, jwtStrategyUser)),
    ).rejects.toThrow('Hisobingiz bloklangan');
  });

  it('does not consult Redis when passport rejects the request', async () => {
    parentCanActivate.mockResolvedValue(false);

    await expect(
      guard.canActivate(mockContext(false, jwtStrategyUser)),
    ).resolves.toBe(false);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('allows the request when there is no id to look up', async () => {
    await expect(
      guard.canActivate(mockContext(false, undefined)),
    ).resolves.toBe(true);
    expect(redis.get).not.toHaveBeenCalled();
  });

  // Making a dead check live also made Redis load-bearing on every request.
  // These two cover the failure modes that created.
  describe('Redis is a cache, not the authority', () => {
    it('lets the request through when Redis is unreachable', async () => {
      // `RedisService extends Redis`, so an outage REJECTS rather than
      // returning null. Denying here would 500 every request in the system.
      redis.get.mockRejectedValue(
        new Error('ENOTFOUND redis.railway.internal'),
      );

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).resolves.toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('does not lock out a user the database says is ACTIVE, and clears the stale key', async () => {
      // Only TeachersService maintains these keys; re-activating the same
      // person through UsersService leaves one behind. Before the database
      // confirmation that key was a permanent lockout.
      redis.get.mockResolvedValue('1');
      prisma.user.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: null,
      });

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).resolves.toBe(true);
      expect(redis.del).toHaveBeenCalledWith('user:blocked:10505');
    });

    it('still rejects when the database agrees the account is blocked', async () => {
      redis.get.mockResolvedValue('1');
      prisma.user.findUnique.mockResolvedValue({
        status: 'TERMINATED',
        deletedAt: null,
      });

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).rejects.toThrow('Hisobingiz bloklangan');
      expect(redis.del).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted account even if its status still reads ACTIVE', async () => {
      redis.get.mockResolvedValue('1');
      prisma.user.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: new Date('2026-05-16'),
      });

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).rejects.toThrow('Hisobingiz bloklangan');
    });

    it('rejects when the user row is gone entirely', async () => {
      redis.get.mockResolvedValue('1');
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).rejects.toThrow('Hisobingiz bloklangan');
    });

    it('costs no database query on the common path', async () => {
      redis.get.mockResolvedValue(null);

      await guard.canActivate(mockContext(false, jwtStrategyUser));

      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  // The guard is registered as an APP_GUARD with `useClass`, so Nest — not a
  // test — constructs it. Every unit test above passes its dependencies by
  // hand and would keep passing if a constructor parameter became
  // unresolvable, which would instead crash the app at boot.
  it('is constructible through dependency injection', async () => {
    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: RedisService, useValue: { get: jest.fn(), del: jest.fn() } },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn() } },
        },
      ],
    }).compile();

    expect(module.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
  });
});
