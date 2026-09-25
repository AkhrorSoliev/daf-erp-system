import {
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  OwnPasswordAttemptGuard,
  OWN_PASSWORD_ATTEMPT_LIMIT,
  OWN_PASSWORD_ATTEMPT_WINDOW_SEC,
  OWN_PASSWORD_ATTEMPTS_MESSAGE,
} from './own-password-attempt.guard';

/** A tiny in-memory stand-in for the two Redis commands the guard uses. */
function fakeRedis() {
  const counts = new Map<string, number>();
  const ttls = new Map<string, number>();
  return {
    counts,
    ttls,
    incr: jest.fn(async (key: string) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return 1;
    }),
  };
}

function contextFor(
  userId: number | undefined,
  handler = function handler() {},
) {
  return {
    getHandler: () => handler,
    getClass: () => class SomeController {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: userId === undefined ? undefined : { id: userId },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('OwnPasswordAttemptGuard (ADR-0031)', () => {
  it(`lets ${OWN_PASSWORD_ATTEMPT_LIMIT} attempts through and refuses the next with 429`, async () => {
    const redis = fakeRedis();
    const guard = new OwnPasswordAttemptGuard(redis as any);

    for (let i = 0; i < OWN_PASSWORD_ATTEMPT_LIMIT; i++) {
      await expect(guard.canActivate(contextFor(10))).resolves.toBe(true);
    }
    const error = await guard
      .canActivate(contextFor(10))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).message).toBe(
      OWN_PASSWORD_ATTEMPTS_MESSAGE,
    );
  });

  it('counts each account separately', async () => {
    const redis = fakeRedis();
    const guard = new OwnPasswordAttemptGuard(redis as any);
    for (let i = 0; i < OWN_PASSWORD_ATTEMPT_LIMIT; i++) {
      await guard.canActivate(contextFor(10));
    }
    await expect(guard.canActivate(contextFor(11))).resolves.toBe(true);
  });

  it('shares one counter across every door that checks the current password', async () => {
    const redis = fakeRedis();
    const guard = new OwnPasswordAttemptGuard(redis as any);
    const changePassword = function changePassword() {};
    const changePhone = function changePhone() {};
    for (let i = 0; i < OWN_PASSWORD_ATTEMPT_LIMIT; i++) {
      await guard.canActivate(
        contextFor(10, i % 2 ? changePassword : changePhone),
      );
    }
    await expect(
      guard.canActivate(contextFor(10, changePassword)),
    ).rejects.toThrow(OWN_PASSWORD_ATTEMPTS_MESSAGE);
  });

  it('keeps the counter for the window after each attempt', async () => {
    const redis = fakeRedis();
    const guard = new OwnPasswordAttemptGuard(redis as any);
    await guard.canActivate(contextFor(10));
    expect([...redis.ttls.values()]).toEqual([OWN_PASSWORD_ATTEMPT_WINDOW_SEC]);
  });

  it('lets the request through when Redis is down: the password check still runs', async () => {
    const guard = new OwnPasswordAttemptGuard({
      incr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      expire: jest.fn(),
    } as any);
    await expect(guard.canActivate(contextFor(10))).resolves.toBe(true);
  });

  it('refuses a request with no signed-in caller instead of skipping the count', async () => {
    const guard = new OwnPasswordAttemptGuard(fakeRedis() as any);
    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });
});
