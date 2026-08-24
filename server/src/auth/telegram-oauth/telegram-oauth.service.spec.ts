import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  HANDOFF_TTL_SEC,
  TelegramOauthService,
} from './telegram-oauth.service';

/** `?error=` ni redirect URL'dan ajratib oladi (dekodlangan holda). */
function errorOf(redirectUrl: string): string | null {
  return new URL(redirectUrl).searchParams.get('error');
}

function makeService(overrides: Record<string, any> = {}) {
  const kv = new Map<string, string>();
  const redis = {
    set: jest.fn(async (k: string, v: string) => {
      kv.set(k, v);
      return 'OK';
    }),
    getdel: jest.fn(async (k: string) => {
      const v = kv.get(k) ?? null;
      kv.delete(k);
      return v;
    }),
  };
  const stateStore = {
    consumeState: jest.fn().mockResolvedValue({
      portalOrigin: 'https://admin.dafzentrum.uz',
      codeVerifier: 'verifier-123',
    }),
  };
  const verifier = {
    verify: jest.fn().mockResolvedValue({
      phoneNumber: '998972062922',
    }),
  };
  const authService = {
    // Bitta mos akkaunt — normal holat. `findAccountsByIdentifier` MASSIV
    // qaytaradi, chunki OAuth yo'li "bittami yoki ko'pmi" degan savolga ham
    // javob olishi kerak (bir raqam ikki akkauntda bo'lsa yopiq holatga o'tadi).
    findAccountsByIdentifier: jest.fn().mockResolvedValue([
      {
        id: 5,
        // A real-shaped bcrypt hash — the lookup returns the RAW row (password
        // included). Without a non-empty value here, `JSON.stringify` would
        // silently drop an `undefined` password key and the `completeHandoff`
        // `toEqual` assertion below would pass even if a future refactor leaked
        // the raw row into the handoff payload — this field is what turns that
        // assertion into a real lock.
        password: '$2b$10$fakehashfortests',
        roles: [{ role: { id: 3, name: 'Administrator' } }],
      },
    ]),
    login: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 5 },
    }),
  };
  const config = {
    enabled: true,
    clientId: '1234567890',
    clientSecret: 'secret',
    redirectUri: 'https://api.dafzentrum.uz/api/auth/telegram/callback',
  };

  const service = new TelegramOauthService(
    config as any,
    stateStore as any,
    verifier as any,
    authService as any,
    redis as any,
  );

  Object.assign(service as any, overrides);
  return { service, redis, kv, stateStore, verifier, authService };
}

function mockTokenEndpoint(body: any, ok = true) {
  // `jest.spyOn` (not a raw `global.fetch = jest.fn()` assignment) so
  // `jest.restoreAllMocks()` in `afterEach` actually undoes it — a plain
  // assignment survives `restoreAllMocks` (it only restores spies), so a
  // future test in this file that forgets to call `mockTokenEndpoint` would
  // silently inherit the previous mock instead of failing loudly.
  jest.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);
}

describe('TelegramOauthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleCallback', () => {
    it('kodni almashtiradi, tokenni tekshiradi, portalga handoff bilan qaytaradi', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService } = makeService();

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      const url = new URL(redirectUrl);
      expect(url.origin).toBe('https://admin.dafzentrum.uz');
      expect(url.pathname).toBe('/auth/telegram/callback');
      expect(url.searchParams.get('handoff')).toMatch(/^[0-9a-f]{64}$/);

      expect(url.searchParams.get('error')).toBeNull();

      expect(authService.findAccountsByIdentifier).toHaveBeenCalledWith(
        '998972062922',
        [1, 2, 3, 5],
        2,
      );
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5 }),
        'https://admin.dafzentrum.uz',
      );
    });

    it("token endpointiga hujjatdagi shaklda so'rov yuboradi", async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service } = makeService();

      await service.handleCallback('code-1', 'state-1');

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://oauth.telegram.org/token');
      expect(init.method).toBe('POST');
      expect(init.headers['Content-Type']).toBe(
        'application/x-www-form-urlencoded',
      );
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from('1234567890:secret').toString('base64')}`,
      );

      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-1');
      expect(body.get('code_verifier')).toBe('verifier-123');
      expect(body.get('client_id')).toBe('1234567890');
      expect(body.get('redirect_uri')).toBe(
        'https://api.dafzentrum.uz/api/auth/telegram/callback',
      );
    });

    it("noma'lum yoki takror state ni rad etadi", async () => {
      mockTokenEndpoint({ id_token: 'x' });
      const { service, stateStore, redis } = makeService();
      stateStore.consumeState.mockResolvedValue(null);

      await expect(
        service.handleCallback('code-1', 'state-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
      // Fail-closed: a rejected sign-in must never leave a redeemable
      // handoff key sitting in Redis for the TTL window.
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("kod bo'sh bo'lsa state ni YOQIB YUBORMAYDI", async () => {
      // `state` bir martalik. Avval iste'mol qilib keyin "kod yo'q" deb rad
      // etsak, aybi yo'q foydalanuvchi butun oqimni qaytadan boshlashga
      // majbur bo'lardi. Kontrollerdagi `error` tarmog'i ham shu tartibda.
      const { service, stateStore, redis } = makeService();

      await expect(
        service.handleCallback('', 'state-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stateStore.consumeState).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('token endpointi xato qaytarsa portalga xabar bilan qaytaradi', async () => {
      mockTokenEndpoint({ error: 'invalid_grant' }, false);
      const { service, redis } = makeService();

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      expect(new URL(redirectUrl).origin).toBe('https://admin.dafzentrum.uz');
      expect(errorOf(redirectUrl)).toMatch(/tasdiqlamadi/i);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('id_token kelmasa portalga xabar bilan qaytaradi', async () => {
      mockTokenEndpoint({ access_token: 'a' });
      const { service, redis } = makeService();

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      expect(errorOf(redirectUrl)).toBeTruthy();
      expect(redis.set).not.toHaveBeenCalled();
    });

    /**
     * TELEGRAM XATONI HTTP 200 BILAN QAYTARADI (RFC 6749 §5.2 bo'yicha 400
     * bo'lishi kerak edi). Tasdiqlangan: soxta kod bilan yuborilgan so'rov
     * `{"error":"invalid_grant"}` + HTTP 200 qaytardi. `!res.ok` bunga
     * tushmaydi, shuning uchun javob tanasidagi `error` alohida tekshirilishi
     * shart — aks holda sabab logda ko'rinmaydi.
     */
    it('HTTP 200 ichidagi OAuth xatosini aniqlaydi va sababni logga yozadi', async () => {
      mockTokenEndpoint({ error: 'invalid_grant' });
      const { service, redis } = makeService();
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      expect(errorOf(redirectUrl)).toBeTruthy();
      expect(redis.set).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('error=invalid_grant'),
      );
    });

    it("error_description bo'lsa uni ham logga qo'shadi", async () => {
      mockTokenEndpoint({
        error: 'invalid_grant',
        error_description: 'code_verifier mismatch',
      });
      const { service } = makeService();
      const warn = jest
        .spyOn((service as any).logger, 'warn')
        .mockImplementation(() => undefined);

      await service.handleCallback('code-1', 'state-1');

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('description=code_verifier mismatch'),
      );
    });

    it("chet el raqamini o'zgartirmasdan topuvchiga uzatadi", async () => {
      // Normalizatsiya topuvchining ishi (common/utils/phone.util) — bu yerda
      // raqamga tegilmasligi kerak, aks holda mamlakat kodi yo'qoladi.
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, verifier, authService } = makeService();
      verifier.verify.mockResolvedValue({ phoneNumber: '491749493338' });

      await service.handleCallback('code-1', 'state-1');

      expect(authService.findAccountsByIdentifier).toHaveBeenCalledWith(
        '491749493338',
        [1, 2, 3, 5],
        2,
      );
    });

    it("bir raqam IKKI akkauntga tegishli bo'lsa kirishni rad etadi", async () => {
      // Spec §7 dagi «bir raqam ikki akkauntda» holati. Ofis raqami kassirda
      // ham, administratorda ham bo'lsa — ikkisi BIR portalda, ya'ni portal
      // darvozasi ajratib bermaydi, `updatedAt desc` esa Telegram akkauntining
      // egasini BEGONA akkauntga kiritib qo'yardi (parol so'ralmaydi!).
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService, redis } = makeService();
      authService.findAccountsByIdentifier.mockResolvedValue([
        {
          id: 6,
          password: '$2b$10$fakehashfortests',
          roles: [{ role: { id: 3, name: 'Administrator' } }],
        },
        {
          id: 5,
          password: '$2b$10$fakehashfortests',
          roles: [{ role: { id: 5, name: 'Cashier' } }],
        },
      ]);

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      // Fail-closed BIRINCHI NAVBATDA: hech qanday sessiya yasalmaydi va hech
      // qanday almashtiriladigan `handoff` Redis'da qolmaydi.
      expect(new URL(redirectUrl).searchParams.get('handoff')).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
      expect(authService.login).not.toHaveBeenCalled();
      // Va odam nima qilishini biladi: parol bilan kirsin.
      expect(errorOf(redirectUrl)).toMatch(/bir nechta akkauntga tegishli/i);
      expect(errorOf(redirectUrl)).toMatch(/parol bilan kiring/i);
    });

    it("telefon tizimda bo'lmasa portalga tushunarli xabar bilan qaytaradi", async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService, redis } = makeService();
      authService.findAccountsByIdentifier.mockResolvedValue([]);

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      // Xom JSON emas — portalning kirish sahifasi, o'qiladigan xabar bilan.
      const url = new URL(redirectUrl);
      expect(url.origin).toBe('https://admin.dafzentrum.uz');
      expect(url.pathname).toBe('/auth/telegram/callback');
      expect(url.searchParams.get('error')).toMatch(/tizimda yo'q/i);
      expect(url.searchParams.get('handoff')).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("parol o'rnatilmagan akkauntni rad etadi (Telegram yo'li parol yo'lidan kengroq bo'lmasin)", async () => {
      // `validateUser` (parol bilan kirish) `!user.password` bo'lsa null
      // qaytaradi — bu akkaunt bugun umuman kira olmaydi. Telegram yo'li
      // xuddi shu RAW qatorni oladi, shuning uchun xuddi shu tekshiruvni
      // takrorlashi shart.
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService, redis } = makeService();
      authService.findAccountsByIdentifier.mockResolvedValue([
        {
          id: 5,
          password: null,
          roles: [{ role: { id: 3, name: 'Administrator' } }],
        },
      ]);

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      expect(errorOf(redirectUrl)).toMatch(/tizimda yo'q/i);
      expect(authService.login).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('portal darvozasi rad etsa portalga xabar bilan qaytaradi (admin portalda ustoz)', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService, redis } = makeService();
      authService.login.mockRejectedValue(
        new UnauthorizedException(
          'Sizning rolingiz bu portalga kirish huquqiga ega emas',
        ),
      );

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      const url = new URL(redirectUrl);
      expect(url.origin).toBe('https://admin.dafzentrum.uz');
      expect(url.pathname).toBe('/auth/telegram/callback');
      expect(url.searchParams.get('error')).toMatch(/portalga kirish huquqiga/);
      expect(url.searchParams.get('handoff')).toBeNull();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it("kutilmagan xato ichki tafsilotni URL'ga chiqarmaydi", async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, verifier } = makeService();
      verifier.verify.mockRejectedValue(
        new TypeError("Cannot read properties of undefined (reading 'x')"),
      );

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');

      expect(errorOf(redirectUrl)).not.toMatch(/Cannot read properties/);
      expect(errorOf(redirectUrl)).toMatch(/Kirishni tugatib bo'lmadi/);
    });
  });

  describe('completeHandoff', () => {
    it('handoff ni tokenlarga almashtiradi', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service } = makeService();

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');
      const handoff = new URL(redirectUrl).searchParams.get('handoff')!;

      const session = await service.completeHandoff(handoff);
      expect(session).toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 5 },
      });
    });

    it('handoff BIR MARTALIK', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service } = makeService();

      const { redirectUrl } = await service.handleCallback('code-1', 'state-1');
      const handoff = new URL(redirectUrl).searchParams.get('handoff')!;

      await service.completeHandoff(handoff);
      await expect(service.completeHandoff(handoff)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("noma'lum handoff ni rad etadi", async () => {
      const { service } = makeService();
      await expect(service.completeHandoff('yolgon')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('handoff eksport qilingan HANDOFF_TTL_SEC bilan saqlanadi', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, redis } = makeService();

      await service.handleCallback('code-1', 'state-1');

      // Xom `60` emas, eksport qilingan konstanta — shu bilan eksport
      // haqiqatan yuk ko'taradi va TTL o'zgarsa test o'z-o'zidan ergashadi.
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('tg_oauth:handoff:'),
        expect.any(String),
        'EX',
        HANDOFF_TTL_SEC,
      );
      // Qisqa oyna ATAYLAB: 60 sekunddan oshib ketmasligi shart.
      expect(HANDOFF_TTL_SEC).toBeLessThanOrEqual(60);
    });
  });
});
