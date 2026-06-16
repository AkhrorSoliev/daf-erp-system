import { issueLoginOtp, consumeLoginOtp } from './app-login-otp-flow';

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
    ttl: jest.fn(() => Promise.resolve(-2)),
    incr: jest.fn((k: string) => {
      const n = parseInt(store.get(k) ?? '0', 10) + 1;
      store.set(k, String(n));
      return Promise.resolve(n);
    }),
    expire: jest.fn(() => Promise.resolve(1)),
  } as any;
}

describe('app-login-otp-flow', () => {
  describe('issueLoginOtp', () => {
    it('returns not_found when no student is linked to the chat', async () => {
      const prisma: any = { student: { findFirst: jest.fn().mockResolvedValue(null) } };
      const res = await issueLoginOtp(prisma, makeRedis(), 'chat1');
      expect(res).toEqual({ ok: false, reason: 'not_found' });
    });

    it('returns no_account when the student has no portal user', async () => {
      const prisma: any = {
        student: { findFirst: jest.fn().mockResolvedValue({ id: 1, firstName: 'A', userId: null }) },
      };
      const res = await issueLoginOtp(prisma, makeRedis(), 'chat1');
      expect(res).toEqual({ ok: false, reason: 'no_account' });
    });

    it('issues a 6-digit code and stores it against the userId', async () => {
      const prisma: any = {
        student: { findFirst: jest.fn().mockResolvedValue({ id: 1, firstName: 'Ali', userId: 555 }) },
      };
      const redis = makeRedis();
      const res = await issueLoginOtp(prisma, redis, 'chat1');
      if (!res.ok) throw new Error('expected ok');
      expect(res.code).toMatch(/^\d{6}$/);
      expect(redis.store.get(`app_login_otp:code:${res.code}`)).toBe('555');
    });

    it('throttles when on cooldown', async () => {
      const prisma: any = {
        student: { findFirst: jest.fn().mockResolvedValue({ id: 1, firstName: 'Ali', userId: 555 }) },
      };
      const redis = makeRedis();
      redis.ttl = jest.fn(() => Promise.resolve(42)); // cooldown active
      const res = await issueLoginOtp(prisma, redis, 'chat1');
      expect(res).toEqual({ ok: false, reason: 'throttled', retryAfterSec: 42 });
    });
  });

  describe('consumeLoginOtp', () => {
    it('returns the userId and deletes the code (single use)', async () => {
      const redis = makeRedis();
      redis.store.set('app_login_otp:code:123456', '555');
      const first = await consumeLoginOtp(redis, '123456');
      expect(first).toBe(555);
      const second = await consumeLoginOtp(redis, '123456');
      expect(second).toBeNull();
    });

    it('returns null for an unknown code', async () => {
      const res = await consumeLoginOtp(makeRedis(), '000000');
      expect(res).toBeNull();
    });
  });
});
