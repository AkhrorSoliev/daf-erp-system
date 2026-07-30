import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TelegramOauthService } from './telegram-oauth.service';

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
      telegramUserId: '987654321',
    }),
  };
  const authService = {
    findAccountByIdentifier: jest.fn().mockResolvedValue({
      id: 5,
      roles: [{ role: { id: 3, name: 'Administrator' } }],
    }),
    login: jest.fn().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      user: { id: 5 },
    }),
  };
  const config = {
    enabled: true,
    clientId: '8576891251',
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
  global.fetch = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as any;
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

      expect(authService.findAccountByIdentifier).toHaveBeenCalledWith(
        '998972062922',
        [1, 2, 3, 5],
      );
      expect(authService.login).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5 }),
        'https://admin.dafzentrum.uz',
      );
    });

    it('token endpointiga hujjatdagi shaklda so\'rov yuboradi', async () => {
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
        `Basic ${Buffer.from('8576891251:secret').toString('base64')}`,
      );

      const body = new URLSearchParams(init.body as string);
      expect(body.get('grant_type')).toBe('authorization_code');
      expect(body.get('code')).toBe('code-1');
      expect(body.get('code_verifier')).toBe('verifier-123');
      expect(body.get('client_id')).toBe('8576891251');
      expect(body.get('redirect_uri')).toBe(
        'https://api.dafzentrum.uz/api/auth/telegram/callback',
      );
    });

    it("noma'lum yoki takror state ni rad etadi", async () => {
      mockTokenEndpoint({ id_token: 'x' });
      const { service, stateStore } = makeService();
      stateStore.consumeState.mockResolvedValue(null);

      await expect(service.handleCallback('code-1', 'state-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('token endpointi xato qaytarsa rad etadi', async () => {
      mockTokenEndpoint({ error: 'invalid_grant' }, false);
      const { service } = makeService();
      await expect(service.handleCallback('code-1', 'state-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('id_token kelmasa rad etadi', async () => {
      mockTokenEndpoint({ access_token: 'a' });
      const { service } = makeService();
      await expect(service.handleCallback('code-1', 'state-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('chet el raqamini o\'zgartirmasdan topuvchiga uzatadi', async () => {
      // Normalizatsiya topuvchining ishi (common/utils/phone.util) — bu yerda
      // raqamga tegilmasligi kerak, aks holda mamlakat kodi yo'qoladi.
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, verifier, authService } = makeService();
      verifier.verify.mockResolvedValue({
        phoneNumber: '491749493338',
        telegramUserId: '111',
      });

      await service.handleCallback('code-1', 'state-1');

      expect(authService.findAccountByIdentifier).toHaveBeenCalledWith(
        '491749493338',
        [1, 2, 3, 5],
      );
    });

    it('telefon tizimda bo\'lmasa tushunarli xato beradi', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService } = makeService();
      authService.findAccountByIdentifier.mockResolvedValue(null);

      await expect(service.handleCallback('code-1', 'state-1')).rejects.toThrow(
        /tizimda yo'q/i,
      );
    });

    it('portal darvozasi rad etsa xato yuqoriga chiqadi (admin portalda ustoz)', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, authService } = makeService();
      authService.login.mockRejectedValue(
        new UnauthorizedException('Sizning rolingiz bu portalga kirish huquqiga ega emas'),
      );

      await expect(service.handleCallback('code-1', 'state-1')).rejects.toThrow(
        /portalga kirish huquqiga/,
      );
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

    it('handoff 60 sekundlik TTL bilan saqlanadi', async () => {
      mockTokenEndpoint({ id_token: 'signed.id.token' });
      const { service, redis } = makeService();

      await service.handleCallback('code-1', 'state-1');

      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('tg_oauth:handoff:'),
        expect.any(String),
        'EX',
        60,
      );
    });
  });
});
