import { approveLoginRequest, consumeLoginRequest } from './app-login-otp-flow';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    set: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    }),
    del: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    }),
  } as any;
}

describe('app-login-otp-flow (link/poll approval)', () => {
  it('not_found when no student is linked to the chat', async () => {
    const prisma: any = { student: { findFirst: jest.fn().mockResolvedValue(null) } };
    const res = await approveLoginRequest(prisma, makeRedis(), 'chat1', 'req-abc12345');
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  it('no_account when the student has no portal user', async () => {
    const prisma: any = {
      student: { findFirst: jest.fn().mockResolvedValue({ firstName: 'A', userId: null }) },
    };
    const res = await approveLoginRequest(prisma, makeRedis(), 'chat1', 'req-abc12345');
    expect(res).toEqual({ ok: false, reason: 'no_account' });
  });

  it('approves a request that can then be consumed exactly once', async () => {
    const prisma: any = {
      student: { findFirst: jest.fn().mockResolvedValue({ firstName: 'Ali', userId: 777 }) },
    };
    const redis = makeRedis();
    const res = await approveLoginRequest(prisma, redis, 'chat1', 'req-abc12345');
    expect(res).toEqual({ ok: true, firstName: 'Ali' });

    const first = await consumeLoginRequest(redis, 'req-abc12345');
    expect(first).toBe(777);
    const second = await consumeLoginRequest(redis, 'req-abc12345');
    expect(second).toBeNull();
  });

  it('consume returns null for an unapproved request', async () => {
    const res = await consumeLoginRequest(makeRedis(), 'req-nope12345');
    expect(res).toBeNull();
  });
});
