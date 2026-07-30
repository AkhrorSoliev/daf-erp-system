import { createHash } from 'crypto';
import { TelegramOauthStateStore } from './telegram-oauth-state.store';

function makeStore(enabled = true) {
  const kv = new Map<string, string>();
  const redis = {
    set: jest.fn(async (key: string, value: string) => {
      kv.set(key, value);
      return 'OK';
    }),
    getdel: jest.fn(async (key: string) => {
      const value = kv.get(key) ?? null;
      kv.delete(key);
      return value;
    }),
  } as any;
  const config = {
    enabled,
    clientId: '8576891251',
    clientSecret: 'secret',
    redirectUri: 'https://api.dafzentrum.uz/api/auth/telegram/callback',
  } as any;
  return { store: new TelegramOauthStateStore(redis, config), redis, kv };
}

describe('TelegramOauthStateStore', () => {
  it('authorize URL ni hujjatdagi parametrlar bilan yasaydi', async () => {
    const { store } = makeStore();
    const url = new URL(await store.createAuthorizeUrl('https://admin.dafzentrum.uz'));

    expect(url.origin + url.pathname).toBe('https://oauth.telegram.org/auth');
    expect(url.searchParams.get('client_id')).toBe('8576891251');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.dafzentrum.uz/api/auth/telegram/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile phone');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('code_challenge = base64url(sha256(code_verifier))', async () => {
    const { store, kv } = makeStore();
    const url = new URL(await store.createAuthorizeUrl('https://admin.dafzentrum.uz'));
    const state = url.searchParams.get('state')!;

    const stored = JSON.parse(kv.get(`tg_oauth:state:${state}`)!);
    const expected = createHash('sha256')
      .update(stored.codeVerifier)
      .digest('base64url');

    expect(url.searchParams.get('code_challenge')).toBe(expected);
  });

  it('state 5 daqiqalik TTL bilan saqlanadi', async () => {
    const { store, redis } = makeStore();
    await store.createAuthorizeUrl('https://admin.dafzentrum.uz');
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining('tg_oauth:state:'),
      expect.any(String),
      'EX',
      300,
    );
  });

  it('state BIR MARTALIK — ikkinchi consume null qaytaradi', async () => {
    const { store } = makeStore();
    const url = new URL(await store.createAuthorizeUrl('https://lehrer.dafzentrum.uz'));
    const state = url.searchParams.get('state')!;

    const first = await store.consumeState(state);
    expect(first).toEqual({
      portalOrigin: 'https://lehrer.dafzentrum.uz',
      codeVerifier: expect.any(String),
    });
    expect(await store.consumeState(state)).toBeNull();
  });

  it("noma'lum state uchun null", async () => {
    const { store } = makeStore();
    expect(await store.consumeState('yolgon-state')).toBeNull();
  });

  it("oq ro'yxatda yo'q portal origin'ini rad etadi", async () => {
    const { store } = makeStore();
    await expect(
      store.createAuthorizeUrl('https://evil.example.com'),
    ).rejects.toThrow();
  });

  it("funksiya o'chiq bo'lsa URL yasamaydi", async () => {
    const { store } = makeStore(false);
    await expect(
      store.createAuthorizeUrl('https://admin.dafzentrum.uz'),
    ).rejects.toThrow();
  });

  it("state ichida oq ro'yxatda yo'q origin bo'lsa consume null qaytaradi", async () => {
    // OCHIQ REDIRECT QO'RIQCHISI: Redis'ga (masalan qo'lda yoki eski kod
    // orqali) begona origin tushib qolgan bo'lsa ham, callback u yerga
    // foydalanuvchini qaytarmasligi kerak.
    const { store, kv } = makeStore();
    kv.set(
      'tg_oauth:state:manual-state',
      JSON.stringify({
        portalOrigin: 'https://evil.example.com',
        codeVerifier: 'v',
      }),
    );
    expect(await store.consumeState('manual-state')).toBeNull();
  });
});
