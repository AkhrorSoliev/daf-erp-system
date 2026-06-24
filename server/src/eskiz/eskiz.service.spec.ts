import { EskizService, EskizError } from './eskiz.service';

function makeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    get: jest.fn(async (k: string) => (store.has(k) ? store.get(k)! : null)),
    set: jest.fn(async (k: string, v: any) => {
      store.set(k, String(v));
      return 'OK';
    }),
  };
}

function makeConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    ESKIZ_EMAIL: 'me@daf.uz',
    ESKIZ_PASSWORD: 'secret',
    ESKIZ_FROM: 'DaFZentrum',
    ...overrides,
  };
  return { get: (k: string, def?: any) => values[k] ?? def };
}

function jsonRes(status: number, body: any) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe('EskizService', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('normalizePhone', () => {
    const svc = new EskizService(makeConfig() as any, makeRedis() as any);
    it('prefixes a 9-digit number with 998', () => {
      expect(svc.normalizePhone('901234567')).toBe('998901234567');
    });
    it('keeps an already-prefixed 12-digit number', () => {
      expect(svc.normalizePhone('998901234567')).toBe('998901234567');
    });
    it('strips formatting characters', () => {
      expect(svc.normalizePhone('+998 90 123 45 67')).toBe('998901234567');
    });
    it('throws on an invalid number', () => {
      expect(() => svc.normalizePhone('12345')).toThrow(EskizError);
    });
  });

  describe('isConfigured', () => {
    it('is false without credentials', () => {
      const svc = new EskizService(
        makeConfig({ ESKIZ_EMAIL: '', ESKIZ_PASSWORD: '' }) as any,
        makeRedis() as any,
      );
      expect(svc.isConfigured()).toBe(false);
    });
  });

  describe('sendSms', () => {
    it('logs in (caching the token) then sends', async () => {
      const redis = makeRedis();
      const svc = new EskizService(makeConfig() as any, redis as any);
      const fetchMock = jest
        .spyOn(global, 'fetch' as any)
        .mockImplementation(async (url: any) => {
          if (String(url).endsWith('/auth/login')) {
            return jsonRes(200, { data: { token: 'TOKEN1' } }) as any;
          }
          return jsonRes(200, { id: 'req-1', status: 'waiting' }) as any;
        });

      const res = await svc.sendSms('901234567', 'salom');

      expect(res).toEqual({ requestId: 'req-1', status: 'waiting' });
      expect(redis.set).toHaveBeenCalledWith(
        'eskiz:token',
        'TOKEN1',
        'EX',
        expect.any(Number),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2); // login + send
    });

    it('re-logs in and retries once on a 401', async () => {
      const redis = makeRedis();
      redis.store.set('eskiz:token', 'OLD'); // start with a cached (stale) token
      const svc = new EskizService(makeConfig() as any, redis as any);
      let sendCalls = 0;
      jest.spyOn(global, 'fetch' as any).mockImplementation(async (url: any) => {
        if (String(url).endsWith('/auth/login')) {
          return jsonRes(200, { data: { token: 'NEW' } }) as any;
        }
        sendCalls += 1;
        return sendCalls === 1
          ? (jsonRes(401, {}) as any)
          : (jsonRes(200, { id: 'req-2', status: 'waiting' }) as any);
      });

      const res = await svc.sendSms('901234567', 'salom');

      expect(res.requestId).toBe('req-2');
      expect(sendCalls).toBe(2); // failed once, retried after re-login
    });

    it('throws when credentials are missing', async () => {
      const svc = new EskizService(
        makeConfig({ ESKIZ_EMAIL: '', ESKIZ_PASSWORD: '' }) as any,
        makeRedis() as any,
      );
      await expect(svc.sendSms('901234567', 'x')).rejects.toBeInstanceOf(
        EskizError,
      );
    });
  });
});
