import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../common/decorators';
import { AuthController } from './auth.controller';
import { IpThrottlerGuard } from '../common/guards';
import { AuthService } from './auth.service';
import { ForgotPasswordService } from './forgot-password/forgot-password.service';
import { TelegramOauthConfig } from './telegram-oauth/telegram-oauth.config';
import { TelegramOauthStateStore } from './telegram-oauth/telegram-oauth-state.store';
import { TelegramOauthService } from './telegram-oauth/telegram-oauth.service';
import { AuthModule } from './auth.module';

describe('AuthController — forgot-password endpoints', () => {
  const reflector = new Reflector();
  let controller: AuthController;
  const forgot = {
    requestCode: jest.fn().mockResolvedValue({ message: 'ok' }),
    verifyCode: jest.fn().mockResolvedValue({ resetToken: 'tok' }),
    resetPassword: jest.fn().mockResolvedValue({ message: 'done' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      {} as any,
      forgot as any,
      { enabled: true } as any,
      {} as any,
      {} as any,
    );
  });

  it('marks all three forgot-password endpoints @Public()', () => {
    for (const method of [
      controller.forgotPasswordRequest,
      controller.forgotPasswordVerify,
      controller.forgotPasswordReset,
    ]) {
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, method)).toBe(true);
    }
  });

  it('request → passes phone + client IP (x-forwarded-for) + null roles (no origin)', async () => {
    const req = { headers: { 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '5.5.5.5', null);
  });

  it('request → falls back to req.ip when no forwarded header', async () => {
    const req = { headers: {}, ip: '9.9.9.9' };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '9.9.9.9', null);
  });

  it('request → scopes to the portal roles from the Origin header', async () => {
    const req = {
      headers: { origin: 'https://admin.dafzentrum.uz' },
      ip: '9.9.9.9',
    };
    await controller.forgotPasswordRequest({ phone: '901234567' } as any, req);
    expect(forgot.requestCode).toHaveBeenCalledWith('901234567', '9.9.9.9', [
      1, 2, 3, 5,
    ]);
  });

  it('verify → delegates phone + code with no portal scope off a bare request', async () => {
    await controller.forgotPasswordVerify(
      { phone: '901234567', code: '1234' } as any,
      { headers: {} },
    );
    expect(forgot.verifyCode).toHaveBeenCalledWith(
      '901234567',
      '1234',
      undefined,
      null,
    );
  });

  // All three steps must resolve the SAME account. `resolveByPhone` breaks a
  // shared-phone tie on `updatedAt desc`, so a step that forgets the portal
  // scope can send the code to one account and write the password to another.
  it('verify → scopes to the portal roles from the Origin header', async () => {
    await controller.forgotPasswordVerify(
      { phone: '901234567', code: '1234' } as any,
      { headers: { origin: 'https://admin.dafzentrum.uz' } },
    );
    expect(forgot.verifyCode).toHaveBeenCalledWith(
      '901234567',
      '1234',
      undefined,
      [1, 2, 3, 5],
    );
  });

  it('reset → delegates token + new password', async () => {
    await controller.forgotPasswordReset(
      { resetToken: 'tok', newPassword: 'newpass123' } as any,
      { headers: {} },
    );
    expect(forgot.resetPassword).toHaveBeenCalledWith(
      'tok',
      'newpass123',
      null,
    );
  });

  it('reset → scopes to the portal roles (X-Portal, native app)', async () => {
    await controller.forgotPasswordReset(
      { resetToken: 'tok', newPassword: 'newpass123' } as any,
      { headers: { 'x-portal': 'student' } },
    );
    expect(forgot.resetPassword).toHaveBeenCalledWith('tok', 'newpass123', [6]);
  });
});

describe('AuthController — rate limiting (F-3)', () => {
  // @UseGuards stores its guards under the '__guards__' metadata key.
  const guardsOf = (method: (...args: any[]) => unknown): unknown[] =>
    (Reflect.getMetadata('__guards__', method) as unknown[]) ?? [];

  it('protects /auth/login with IpThrottlerGuard (before local auth)', () => {
    const guards = guardsOf(AuthController.prototype.login);
    expect(guards[0]).toBe(IpThrottlerGuard); // must run first so failed attempts count
  });

  it('protects /auth/refresh with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.refresh);
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('protects /auth/otp/poll with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.pollLogin);
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('protects /auth/telegram/status with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.telegramStatus);
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('protects /auth/telegram/start with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.telegramStart);
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('protects /auth/telegram/callback with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.telegramCallback);
    expect(guards).toContain(IpThrottlerGuard);
  });

  it('protects /auth/telegram/complete with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.telegramComplete);
    expect(guards).toContain(IpThrottlerGuard);
  });
});

describe('AuthController — otp/poll delegatsiyasi', () => {
  it('requestId ni AuthService.pollLoginRequest ga uzatadi', async () => {
    const auth = { pollLoginRequest: jest.fn().mockResolvedValue({ status: 'pending' }) };
    const controller = new AuthController(
      auth as any,
      {} as any,
      { enabled: true } as any,
      {} as any,
      {} as any,
    );

    await controller.pollLogin('req-123');

    expect(auth.pollLoginRequest).toHaveBeenCalledWith('req-123');
  });
});

describe('IpThrottlerGuard.getTracker', () => {
  // getTracker doesn't use `this`, so we can exercise it off a bare prototype
  // instance without constructing the full ThrottlerGuard dependency graph.
  const guard = Object.create(IpThrottlerGuard.prototype) as any;
  const track = (req: unknown): Promise<string> => guard.getTracker(req);

  it('uses the first x-forwarded-for hop (real client behind the proxy)', async () => {
    await expect(
      track({ headers: { 'x-forwarded-for': '5.5.5.5, 1.1.1.1' }, ip: '9.9.9.9' }),
    ).resolves.toBe('5.5.5.5');
  });

  it('falls back to req.ip when there is no forwarded header', async () => {
    await expect(track({ headers: {}, ip: '9.9.9.9' })).resolves.toBe('9.9.9.9');
  });
});

describe('AuthController — telegram/status', () => {
  const controllerWith = (enabled: boolean) =>
    new AuthController(
      {} as any,
      {} as any,
      { enabled } as any,
      {} as any,
      {} as any,
    );
  const reqFrom = (origin?: string) => ({ headers: origin ? { origin } : {} });

  it("funksiya yoniq va Origin portal bo'lsa true qaytaradi", () => {
    expect(
      controllerWith(true).telegramStatus(
        reqFrom('https://admin.dafzentrum.uz') as any,
      ),
    ).toEqual({ enabled: true });
  });

  it("funksiya o'chiq bo'lsa false qaytaradi", () => {
    expect(
      controllerWith(false).telegramStatus(
        reqFrom('https://admin.dafzentrum.uz') as any,
      ),
    ).toEqual({ enabled: false });
  });

  it("portal BO'LMAGAN origin uchun false qaytaradi (buzilgan tugma chizilmasin)", () => {
    // CORS ruxsat bergan, lekin portal bo'lmagan manzil (Vercel preview
    // alias). Avval tugma chizilib, bosilganda `start` 400 berardi.
    expect(
      controllerWith(true).telegramStatus(
        reqFrom('https://client-brown-ten-36.vercel.app') as any,
      ),
    ).toEqual({ enabled: false });
  });

  it('Origin sarlavhasi umuman bo\'lmasa false qaytaradi', () => {
    expect(controllerWith(true).telegramStatus(reqFrom() as any)).toEqual({
      enabled: false,
    });
  });

  it("lokal dev (localhost) uchun true qaytaradi", () => {
    expect(
      controllerWith(true).telegramStatus(
        reqFrom('http://localhost:3000') as any,
      ),
    ).toEqual({ enabled: true });
  });

  it('@Public() bilan belgilangan (JWT talab qilmaydi)', () => {
    const isPublic = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      AuthController.prototype.telegramStatus,
    );
    expect(isPublic).toBe(true);
  });
});

describe('telegram/start', () => {
  const controllerWithStore = (store: unknown) =>
    new AuthController(
      {} as any,
      {} as any,
      { enabled: true } as any,
      store as any,
      {} as any,
    );

  it('Origin sarlavhasidan authorize URL yasaydi', async () => {
    const store = { createAuthorizeUrl: jest.fn().mockResolvedValue('https://oauth.telegram.org/auth?x=1') };

    const res = await controllerWithStore(store).telegramStart({
      headers: { origin: 'https://admin.dafzentrum.uz' },
    } as any);

    expect(store.createAuthorizeUrl).toHaveBeenCalledWith(
      'https://admin.dafzentrum.uz',
    );
    expect(res).toEqual({ url: 'https://oauth.telegram.org/auth?x=1' });
  });

  it("query dagi origin qabul QILINMAYDI — faqat Origin sarlavhasi", async () => {
    // `?origin=` parametri olib tashlandi: klient uni hech qachon yubormagan,
    // lekin u prodda `?origin=http://localhost:3000` bilan portal cheklovini
    // chetlab o'tishning yagona yo'li edi. Handler endi bitta argument
    // (`req`) oladi, ya'ni query'da nima kelsa ham e'tiborsiz qoladi.
    const store = { createAuthorizeUrl: jest.fn().mockResolvedValue('https://oauth.telegram.org/auth?x=1') };

    await controllerWithStore(store).telegramStart({
      headers: { origin: 'https://lehrer.dafzentrum.uz' },
      query: { origin: 'http://localhost:3000' },
    } as any);

    expect(store.createAuthorizeUrl).toHaveBeenCalledWith(
      'https://lehrer.dafzentrum.uz',
    );
    expect(controllerWithStore(store).telegramStart).toHaveLength(1);
  });
});

describe('telegram/callback', () => {
  it('portal manziliga 302 qiladi', async () => {
    const oauth = {
      handleCallback: jest
        .fn()
        .mockResolvedValue({ redirectUrl: 'https://admin.dafzentrum.uz/auth/telegram/callback?handoff=abc' }),
    };
    const local = new AuthController(
      {} as any,
      {} as any,
      { enabled: true } as any,
      {} as any,
      oauth as any,
    );
    const res = { redirect: jest.fn() };

    await local.telegramCallback({ code: 'c', state: 's' }, res as any);

    expect(oauth.handleCallback).toHaveBeenCalledWith('c', 's');
    expect(res.redirect).toHaveBeenCalledWith(
      302,
      'https://admin.dafzentrum.uz/auth/telegram/callback?handoff=abc',
    );
  });

  it("xato holatida ham 302 qiladi (API domenida xom JSON qolmasin)", async () => {
    const oauth = {
      handleCallback: jest.fn().mockResolvedValue({
        redirectUrl:
          "https://admin.dafzentrum.uz/auth/telegram/callback?error=Bu+Telegram+raqami+tizimda+yo%27q.",
      }),
    };
    const local = new AuthController(
      {} as any,
      {} as any,
      { enabled: true } as any,
      {} as any,
      oauth as any,
    );
    const res = { redirect: jest.fn() };

    await local.telegramCallback({ code: 'c', state: 's' }, res as any);

    expect(res.redirect).toHaveBeenCalledWith(
      302,
      expect.stringContaining('?error='),
    );
  });

  it('foydalanuvchi rad etsa 400 beradi va kod almashtirmaydi', async () => {
    const oauth = { handleCallback: jest.fn() };
    const local = new AuthController(
      {} as any,
      {} as any,
      { enabled: true } as any,
      {} as any,
      oauth as any,
    );

    await expect(
      local.telegramCallback({ error: 'access_denied' }, { redirect: jest.fn() } as any),
    ).rejects.toThrow();
    expect(oauth.handleCallback).not.toHaveBeenCalled();
  });
});

describe('AuthController — Nest DI wiring', () => {
  // Every spec above builds AuthController with `new`, bypassing Nest's
  // container entirely — a token mismatch or a provider missing from
  // `auth.module.ts` would still pass all of them and only surface at real
  // app boot ("Nest can't resolve dependencies of AuthController"). This is
  // exactly the class of bug that took the app down once already (see the
  // TELEGRAM_JWKS_RESOLVER comment in telegram-id-token.verifier.ts).
  //
  // `imports: [AuthModule]` (the real module) was tried first but hangs —
  // AuthModule pulls in RedisModule/PrismaModule, whose providers try to
  // open real connections during DI instantiation. So this resolves
  // AuthController through Nest's actual injector against stand-ins bound to
  // the exact same class tokens the constructor declares, which still
  // catches a mistyped/ambiguous injection token or a param Nest can't
  // resolve at all.
  it('resolves AuthController via the real DI tokens without throwing', async () => {
    // AuthController is registered as a plain PROVIDER, not via `controllers:
    // [...]` — putting it in `controllers` makes Nest's module scanner also
    // eagerly instantiate every guard class referenced by @UseGuards on its
    // methods (IpThrottlerGuard → real ThrottlerModule wiring), which this
    // minimal module doesn't have. As a provider, Nest still resolves the
    // constructor through the exact same injector/token-matching logic —
    // that resolution is what this test locks — it just skips route/guard
    // wiring, which is irrelevant here.
    const moduleRef = await Test.createTestingModule({
      // Several endpoints carry @UseGuards(IpThrottlerGuard); Nest resolves
      // guard classes referenced via decorator metadata as real instances
      // too (not just constructor params, and NOT satisfiable by a plain
      // `useValue` override for the same token — Nest re-instantiates them
      // through this "enhancer" path regardless). The real IpThrottlerGuard
      // needs ThrottlerModule's providers, and ThrottlerModule.forRoot's
      // default in-memory storage needs no live Redis/DB, so it's cheap to
      // include for real here rather than stub around it.
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 10 }]),
      ],
      providers: [
        AuthController,
        IpThrottlerGuard,
        { provide: AuthService, useValue: {} },
        { provide: ForgotPasswordService, useValue: {} },
        { provide: TelegramOauthConfig, useValue: {} },
        { provide: TelegramOauthStateStore, useValue: {} },
        { provide: TelegramOauthService, useValue: {} },
      ],
    }).compile();

    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
  });

  // Complements the above: reads `auth.module.ts`'s own @Module metadata
  // directly (no DI resolution, no live infra) to lock the literal failure
  // this round's finding described — TelegramOauthService dropped from the
  // module's `providers` array.
  it('registers TelegramOauthService as a provider in AuthModule', () => {
    const providers: unknown[] =
      Reflect.getMetadata('providers', AuthModule) ?? [];
    expect(providers).toContain(TelegramOauthService);
  });
});
