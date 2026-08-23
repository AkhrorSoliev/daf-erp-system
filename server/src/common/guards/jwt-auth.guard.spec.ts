import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
  let redis: { get: jest.Mock };
  let parentCanActivate: jest.SpyInstance;

  beforeEach(() => {
    reflector = new Reflector();
    redis = { get: jest.fn().mockResolvedValue(null) };
    guard = new JwtAuthGuard(reflector, redis as never);

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
});
