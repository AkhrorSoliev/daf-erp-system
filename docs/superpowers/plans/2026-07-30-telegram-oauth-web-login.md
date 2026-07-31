# Telegram OAuth bilan kirish (web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uchta web portalda (`admin` / `lehrer` / `student`) telefon+parol yonida «Telegram orqali kirish» ishlaydi — Telegram'ning rasmiy OAuth 2.0 / OIDC oqimi orqali.

**Architecture:** Brauzer serverdan authorize URL so'raydi (`state` + PKCE `code_verifier` Redis'da, brauzerga chiqmaydi) → Telegram'ning tasdiqlash ekrani → Telegram bizning API domenidagi bitta `callback` ga `code` bilan qaytaradi → server kodni client secret bilan almashtiradi, `id_token` ni JWKS orqali tekshiradi, `phone_number` bo'yicha akkauntni topadi va portal darvozasidan o'tkazadi → portalga bir martalik `handoff` kodi bilan redirect → SPA `handoff` ni tokenlarga almashtiradi. Tokenlar hech qachon URL'da yurmaydi.

**Tech Stack:** NestJS + Prisma + ioredis + Jest (server), `jose` (JWKS/JWT tekshiruvi, yangi paket), native `fetch` (HTTP), Next.js 15 + React 19 (client).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-telegram-oauth-web-login-design.md` — ziddiyat chiqsa spec ustun.
- **Migration YO'Q.** Prisma sxemasi o'zgarmaydi, `prisma` CLI buyruqlari ishlatilmaydi. `User.telegramChatId` ga hech narsa **yozilmaydi**.
- **Native ilova tegilmaydi:** `student-app/` ostidagi hech bir fayl o'zgarmaydi. Mavjud `GET /auth/otp/poll` oqimi ishlashda davom etishi shart (faqat 7-vazifada unga rate-limit qo'shiladi).
- **Parol bilan kirish buzilmasligi shart** — `validateUser` xatti-harakati o'zgarmaydi (4-vazifa sof refactor).
- **Spec'ning 5-bo'limidagi majburiy hujjat tekshiruvi BAJARILGAN** (2026-07-30, `core.telegram.org/widgets/login` dan verbatim kod bloklari olindi). Quyidagi qiymatlar shu tekshiruv natijasi — ularni qaytadan tekshirish shart emas, lekin **o'zgartirish ham mumkin emas**.
- Telegram endpointlari (hujjatdan verbatim): authorize `https://oauth.telegram.org/auth`, token `https://oauth.telegram.org/token`, JWKS `https://oauth.telegram.org/.well-known/jwks.json`, issuer `https://oauth.telegram.org`, discovery `https://oauth.telegram.org/.well-known/openid-configuration`.
- Token so'rovi (hujjatdan verbatim): `POST`, `Content-Type: application/x-www-form-urlencoded`, `Authorization: Basic base64(client_id:client_secret)`, body `grant_type=authorization_code&code=…&redirect_uri=…&client_id=…&code_verifier=…`. Javob: `{ access_token, token_type, expires_in, id_token }`.
- `id_token` claim nomlari (hujjatdan verbatim): `iss`, `aud`, `sub`, `iat`, `exp`, `id`, `name`, `given_name`, `family_name`, `preferred_username`, `picture`, `phone_number`, `phone_number_verified`. **`sub` ISHLATILMAYDI** (u opaque identifikator; Telegram user id — `id` claim).
- `phone_number` **`+` belgisiz, mamlakat kodi bilan** keladi (hujjat misoli: `"971577777777"`).
- Client ID: BotFather'dan olinadi, repoga yozilmaydi (testlarda `1234567890` — o'ylab topilgan qiymat). Redirect URI: `https://api.dafzentrum.uz/api/auth/telegram/callback` (lokalda `http://localhost:4000/api/auth/telegram/callback` — ikkisi ham BotFather'da ro'yxatga olingan).
- Barcha foydalanuvchiga ko'rinadigan matn va izohlar **lotin alifbosida o'zbekcha**. Kirill/arab harflari — nuqson. `server/CLAUDE.md` va `client/CLAUDE.md` esa **ingliz tilida** (o'sha fayllarning o'z qoidasi).
- Server testi: `cd server && npx jest <path>`; to'liq to'plam `cd server && npm test`.
- **Server'da `npx tsc --noEmit` da 44 ta AVVALDAN BOR xato mavjud** (merge-base'da ham shunday). Mezon — «yangi xato yo'q», toza natija emas. Tekshirish: `npx tsc --noEmit 2>&1 | grep -c 'error TS'` → 44 bo'lib qolishi.
- Client'da test infratuzilmasi **yo'q** (`client/package.json` da `test` skripti yo'q). Tekshirish: `cd client && npx tsc --noEmit && npm run lint` (baseline: tsc 0 xato, lint 91 problem / 2 xato — ikkisi ham tegilmagan fayllarda).
- Global `ValidationPipe` `whitelist: true, forbidNonWhitelisted: true` bilan ishlaydi — **har bir query/body uchun DTO** kerak, aks holda so'rov rad etiladi.
- Barcha route'lar `/api` prefiksi bilan. JWT global guard — yangi endpointlarga `@Public()` shart.
- **Controller guard testlari majburiy** (`server/CLAUDE.md` qoidasi): yangi endpointlar uchun `@Public()` metadata borligini tasdiqlovchi test yozilади.
- Har vazifa oxirida commit. Deploy bu rejaga kirmaydi.

---

## File Structure

**Yaratiladi (server):**
- `src/auth/telegram-oauth/telegram-oauth.config.ts` — env o'qish, `enabled` bayrog'i, portal origin oq ro'yxati
- `src/auth/telegram-oauth/telegram-oauth.config.spec.ts`
- `src/auth/telegram-oauth/telegram-oauth-state.store.ts` — `state` + PKCE Redis do'koni, authorize URL yasash
- `src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts`
- `src/auth/telegram-oauth/telegram-id-token.verifier.ts` — `id_token` tekshiruvi (JWKS/iss/aud/exp/phone)
- `src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts`
- `src/auth/telegram-oauth/telegram-oauth.service.ts` — kod almashtirish + akkaunt topish + handoff
- `src/auth/telegram-oauth/telegram-oauth.service.spec.ts`
- `src/auth/dto/telegram-oauth-start.dto.ts`, `telegram-oauth-callback.dto.ts`, `telegram-oauth-complete.dto.ts`

**O'zgartiriladi (server):**
- `src/auth/portal-roles.config.ts` — portal hostname'lari eksporti (oq ro'yxat uchun)
- `src/auth/auth.service.ts` — akkaunt topish qismini ajratish (sof refactor)
- `src/auth/auth.controller.ts` — 4 yangi endpoint + `otp/poll` ga throttle
- `src/auth/auth.module.ts` — yangi provayderlar
- `src/auth/auth.controller.spec.ts` — yangi endpointlar uchun testlar
- `server/CLAUDE.md`, `server/package.json` (`jose`)

**Yaratiladi (client):**
- `src/components/auth/telegram-login-button.tsx` — tugma + status gate
- `src/app/(auth)/auth/telegram/callback/page.tsx` — handoff → setAuth → redirect

**O'zgartiriladi (client):**
- `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/login/student-login-form.tsx` — tugmani qo'shish
- `client/CLAUDE.md`

---

## Task 1: Config va `status` endpointi

Sozlama bo'lmasa funksiya **butunlay o'chiq** bo'lishi kerak — jimgina buzilish emas, aniq «o'chiq» javobi.

**Files:**
- Create: `server/src/auth/telegram-oauth/telegram-oauth.config.ts`
- Create: `server/src/auth/telegram-oauth/telegram-oauth.config.spec.ts`
- Modify: `server/src/auth/portal-roles.config.ts` (oxiriga qo'shiladi)
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.module.ts`
- Modify: `server/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: hech narsa (birinchi vazifa)
- Produces:
  - `PORTAL_HOSTNAMES: string[]` va `isKnownPortalOrigin(origin: string | undefined): boolean` — `portal-roles.config.ts` dan
  - `TelegramOauthConfig` klassi (injectable): `enabled: boolean`, `clientId: string`, `clientSecret: string`, `redirectUri: string`
  - `GET /api/auth/telegram/status` → `{ enabled: boolean }`

- [ ] **Step 1: Yiqiladigan testni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth.config.spec.ts`:

```typescript
import { TelegramOauthConfig } from './telegram-oauth.config';

function makeConfig(env: Record<string, string | undefined>) {
  const configService = {
    get: (key: string) => env[key],
  } as any;
  return new TelegramOauthConfig(configService);
}

describe('TelegramOauthConfig', () => {
  const full = {
    TELEGRAM_OAUTH_CLIENT_ID: '1234567890',
    TELEGRAM_OAUTH_CLIENT_SECRET: 'secret-value',
    TELEGRAM_OAUTH_REDIRECT_URI: 'https://api.dafzentrum.uz/api/auth/telegram/callback',
  };

  it("hamma sozlama bo'lsa yoniq", () => {
    const config = makeConfig(full);
    expect(config.enabled).toBe(true);
    expect(config.clientId).toBe('1234567890');
    expect(config.redirectUri).toBe(
      'https://api.dafzentrum.uz/api/auth/telegram/callback',
    );
  });

  it.each([
    ['TELEGRAM_OAUTH_CLIENT_ID'],
    ['TELEGRAM_OAUTH_CLIENT_SECRET'],
    ['TELEGRAM_OAUTH_REDIRECT_URI'],
  ])("%s bo'lmasa o'chiq", (missing) => {
    const config = makeConfig({ ...full, [missing]: undefined });
    expect(config.enabled).toBe(false);
  });

  it("bo'sh satrni ham yo'q deb hisoblaydi", () => {
    const config = makeConfig({ ...full, TELEGRAM_OAUTH_CLIENT_SECRET: '   ' });
    expect(config.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth.config.spec.ts`
Expected: FAIL — `Cannot find module './telegram-oauth.config'`

- [ ] **Step 3: Configni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth.config.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Telegram OAuth (OIDC) sozlamasi.
 *
 * NEGA `enabled` BAYROG'I: Client ID/secret BotFather'da qo'lda olinadi va
 * Railway env'iga qo'lda qo'yiladi. Sozlama kelmasa kod xavfsiz turishi kerak —
 * funksiya o'chiq bo'ladi, klient tugmani ko'rsatmaydi. Jimgina yarim ishlaydigan
 * holat eng yomon variant.
 */
@Injectable()
export class TelegramOauthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;

  constructor(config: ConfigService) {
    this.clientId = (config.get<string>('TELEGRAM_OAUTH_CLIENT_ID') ?? '').trim();
    this.clientSecret = (
      config.get<string>('TELEGRAM_OAUTH_CLIENT_SECRET') ?? ''
    ).trim();
    this.redirectUri = (
      config.get<string>('TELEGRAM_OAUTH_REDIRECT_URI') ?? ''
    ).trim();
  }

  get enabled(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }
}
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth.config.spec.ts`
Expected: PASS

- [ ] **Step 5: Portal origin oq ro'yxatini eksport qilish**

`server/src/auth/portal-roles.config.ts` faylining OXIRIGA qo'shing (mavjud kodga tegilmaydi):

```typescript
/**
 * Ma'lum portal hostname'lari — `PORTAL_ROLES` kalitlari bilan bir manba.
 *
 * NEGA KERAK: Telegram OAuth callback foydalanuvchini portalga qaytaradi va
 * qaytish manzili `state` ichidan olinadi. Oq ro'yxatsiz bu ochiq redirect
 * bo'lib qolardi.
 */
export const PORTAL_HOSTNAMES: string[] = Object.keys(PORTAL_ROLES);

/** Origin bizning portallardan biri (yoki lokal dev) ekanini bildiradi. */
export function isKnownPortalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    return PORTAL_HOSTNAMES.includes(hostname);
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: `status` endpointini qo'shish**

`server/src/auth/auth.controller.ts`:

Import qo'shing:

```typescript
import { TelegramOauthConfig } from './telegram-oauth/telegram-oauth.config';
```

Konstruktorga qo'shing:

```typescript
  constructor(
    private authService: AuthService,
    private forgotPasswordService: ForgotPasswordService,
    private telegramOauthConfig: TelegramOauthConfig,
  ) {}
```

`otp/poll` endpointidan keyin qo'shing:

```typescript
  // ── Telegram OAuth (OIDC) — web portallar uchun ────────────────────────────
  /** Klient tugmani ko'rsatishdan oldin funksiya yoniqligini so'raydi. */
  @Public()
  @Get('telegram/status')
  telegramStatus() {
    return { enabled: this.telegramOauthConfig.enabled };
  }
```

- [ ] **Step 7: Modulga provayder qo'shish**

`server/src/auth/auth.module.ts` — importlarga:

```typescript
import { TelegramOauthConfig } from './telegram-oauth/telegram-oauth.config';
```

`providers` massiviga `TelegramOauthConfig` qo'shing (mavjudlarni saqlab):

```typescript
  providers: [
    AuthService,
    LocalStrategy,
    JwtStrategy,
    ForgotPasswordService,
    TelegramOauthConfig,
  ],
```

- [ ] **Step 8: Controller testini qo'shish**

`server/src/auth/auth.controller.spec.ts` — **17-qatordagi** `controller = new AuthController({} as any, forgot as any);` ni yangilang (controller endi uchinchi argumentni talab qiladi, aks holda MAVJUD testlar yiqiladi):

```typescript
    controller = new AuthController(
      {} as any,
      forgot as any,
      { enabled: true } as any,
    );
```

Faylning yuqorisidagi importlarga qo'shing:

```typescript
import { IS_PUBLIC_KEY } from '../common/decorators';
```

So'ng yangi blok:

```typescript
describe('AuthController — telegram/status', () => {
  it("funksiya yoniq bo'lsa true qaytaradi", () => {
    const controller = new AuthController(
      {} as any,
      {} as any,
      { enabled: true } as any,
    );
    expect(controller.telegramStatus()).toEqual({ enabled: true });
  });

  it("funksiya o'chiq bo'lsa false qaytaradi", () => {
    const controller = new AuthController(
      {} as any,
      {} as any,
      { enabled: false } as any,
    );
    expect(controller.telegramStatus()).toEqual({ enabled: false });
  });

  it('@Public() bilan belgilangan (JWT talab qilmaydi)', () => {
    const isPublic = Reflect.getMetadata(
      IS_PUBLIC_KEY,
      AuthController.prototype.telegramStatus,
    );
    expect(isPublic).toBe(true);
  });
});
```

`IS_PUBLIC_KEY` — `server/src/common/decorators/public.decorator.ts` dagi haqiqiy kalit (`'isPublic'`); u `common/decorators` barrel'idan eksport qilinganini tasdiqlang, aks holda to'g'ridan-to'g'ri `'../common/decorators/public.decorator'` dan import qiling.

- [ ] **Step 9: Testlar va kompilyatsiya**

Run: `cd server && npx jest src/auth && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: barcha `src/auth` testlari PASS; tsc xato soni **44**

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/telegram-oauth/telegram-oauth.config.ts \
  server/src/auth/telegram-oauth/telegram-oauth.config.spec.ts \
  server/src/auth/portal-roles.config.ts \
  server/src/auth/auth.controller.ts \
  server/src/auth/auth.controller.spec.ts \
  server/src/auth/auth.module.ts
git commit -m "Add Telegram OAuth config with an explicit enabled flag"
```

---

## Task 2: `state` + PKCE do'koni va `start` endpointi

`code_verifier` **brauzerga chiqmaydi** — u Redis'da `state` bilan birga yashaydi. Shu ikkisi oqimni boshlagan brauzerga bog'laydi.

**Files:**
- Create: `server/src/auth/telegram-oauth/telegram-oauth-state.store.ts`
- Create: `server/src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts`
- Create: `server/src/auth/dto/telegram-oauth-start.dto.ts`
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `TelegramOauthConfig` (`enabled`, `clientId`, `redirectUri`) va `isKnownPortalOrigin` — 1-vazifadan
- Produces: `TelegramOauthStateStore` (injectable):
  - `createAuthorizeUrl(portalOrigin: string): Promise<string>`
  - `consumeState(state: string): Promise<{ portalOrigin: string; codeVerifier: string } | null>`
  - `STATE_TTL_SEC = 300`

- [ ] **Step 1: Yiqiladigan testni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts`:

```typescript
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
    clientId: '1234567890',
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
    expect(url.searchParams.get('client_id')).toBe('1234567890');
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
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts`
Expected: FAIL — `Cannot find module './telegram-oauth-state.store'`

- [ ] **Step 3: Do'konni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth-state.store.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { isKnownPortalOrigin } from '../portal-roles.config';
import { TelegramOauthConfig } from './telegram-oauth.config';

/** Telegram authorize endpointi (hujjatdan verbatim). */
const AUTHORIZE_URL = 'https://oauth.telegram.org/auth';
/** Hujjatdagi scope'lar: `openid` (majburiy) + `profile` + `phone`. */
const SCOPE = 'openid profile phone';
export const STATE_TTL_SEC = 300;

const stateKey = (state: string) => `tg_oauth:state:${state}`;

interface StoredState {
  portalOrigin: string;
  codeVerifier: string;
}

/**
 * `state` + PKCE do'koni.
 *
 * NEGA `code_verifier` SERVERDA: `state` va PKCE ikkisi birgalikda oqimni
 * BOSHLAGAN brauzerga bog'laydi. Agar verifier brauzerda bo'lsa, u boshqa
 * qurilmaga ko'chirilishi mumkin edi. Bizning eski bot-havola oqimidagi
 * zaiflik aynan shu bog'lanishning yo'qligi edi.
 *
 * NEGA `portalOrigin` SAQLANADI: callback'ga Telegram keladi — u yerdagi
 * `Origin` foydalanuvchi portalini bildirmaydi. Qaytish manzili shu yerdan
 * olinadi va oq ro'yxatdan o'tkaziladi (ochiq redirect bo'lmasligi uchun).
 */
@Injectable()
export class TelegramOauthStateStore {
  constructor(
    private readonly redis: RedisService,
    private readonly config: TelegramOauthConfig,
  ) {}

  async createAuthorizeUrl(portalOrigin: string): Promise<string> {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException(
        "Telegram orqali kirish hozircha yoqilmagan",
      );
    }
    if (!isKnownPortalOrigin(portalOrigin)) {
      throw new BadRequestException("Noma'lum portal manzili");
    }

    const state = randomBytes(32).toString('hex');
    // 32 bayt → 43 belgili base64url (RFC 7636 talab qilgan 43–128 oralig'ida).
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    await this.redis.set(
      stateKey(state),
      JSON.stringify({ portalOrigin, codeVerifier } as StoredState),
      'EX',
      STATE_TTL_SEC,
    );

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  /** Bir martalik: `getdel` atomik o'qib-o'chiradi (takror ishlatib bo'lmaydi). */
  async consumeState(state: string): Promise<StoredState | null> {
    const raw = state ? await this.redis.getdel(stateKey(state)) : null;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredState;
      if (!isKnownPortalOrigin(parsed.portalOrigin)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts`
Expected: PASS — 7 test

- [ ] **Step 5: `start` endpointini qo'shish**

Create `server/src/auth/dto/telegram-oauth-start.dto.ts`:

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Global ValidationPipe `forbidNonWhitelisted: true` bilan ishlaydi, ya'ni
 * DTO'da e'lon qilinmagan query parametri so'rovni rad etadi.
 */
export class TelegramOauthStartDto {
  /** Portal manzili. Bo'sh bo'lsa `Origin` sarlavhasidan olinadi. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string;
}
```

`server/src/auth/auth.controller.ts` — `telegramStatus` dan keyin:

```typescript
  /**
   * Oqimni boshlaydi: `state` + PKCE yasab, Telegram'ning authorize URL'ini
   * qaytaradi. Klient shu URL'ga o'tadi.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('telegram/start')
  async telegramStart(
    @Query() query: TelegramOauthStartDto,
    @Req() req,
  ) {
    const origin =
      query.origin ?? (req.headers['origin'] as string | undefined) ?? '';
    const url = await this.telegramOauthStateStore.createAuthorizeUrl(origin);
    return { url };
  }
```

Importlar va konstruktor:

```typescript
import { TelegramOauthStartDto } from './dto/telegram-oauth-start.dto';
import { TelegramOauthStateStore } from './telegram-oauth/telegram-oauth-state.store';
```

```typescript
    private telegramOauthStateStore: TelegramOauthStateStore,
```

`auth.module.ts` `providers` ga `TelegramOauthStateStore` qo'shing.

- [ ] **Step 6: Controller testini qo'shish**

`server/src/auth/auth.controller.spec.ts` ga:

```typescript
  describe('telegram/start', () => {
    it('Origin sarlavhasidan authorize URL yasaydi', async () => {
      const store = { createAuthorizeUrl: jest.fn().mockResolvedValue('https://oauth.telegram.org/auth?x=1') };
      const local = new AuthController(
        {} as any,
        {} as any,
        { enabled: true } as any,
        store as any,
      );

      const res = await local.telegramStart(
        {},
        { headers: { origin: 'https://admin.dafzentrum.uz' } } as any,
      );

      expect(store.createAuthorizeUrl).toHaveBeenCalledWith(
        'https://admin.dafzentrum.uz',
      );
      expect(res).toEqual({ url: 'https://oauth.telegram.org/auth?x=1' });
    });
  });
```

**MUHIM:** `AuthController` konstruktorining argument TARTIBI yuqoridagi qo'shishlarga mos bo'lishi shart — testdagi tartib kod bilan bir xil bo'lsin. Mavjud spec'dagi controller yaratish joyini ham yangi argumentlar bilan to'ldiring.

- [ ] **Step 7: Testlar va kompilyatsiya**

Run: `cd server && npx jest src/auth && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: PASS; tsc **44**

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/telegram-oauth/telegram-oauth-state.store.ts \
  server/src/auth/telegram-oauth/telegram-oauth-state.store.spec.ts \
  server/src/auth/dto/telegram-oauth-start.dto.ts \
  server/src/auth/auth.controller.ts \
  server/src/auth/auth.controller.spec.ts \
  server/src/auth/auth.module.ts
git commit -m "Bind the Telegram OAuth flow to its initiating browser with state+PKCE"
```

---

## Task 3: `id_token` tekshiruvi (JWKS)

Bu vazifa butun xavfsizlikning tayanchi. **Har bir** tekshiruv buzilishi kirishni rad etishi kerak.

**Files:**
- Create: `server/src/auth/telegram-oauth/telegram-id-token.verifier.ts`
- Create: `server/src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts`
- Modify: `server/package.json` (`jose`), `server/src/auth/auth.module.ts`

**Interfaces:**
- Consumes: `TelegramOauthConfig.clientId` — 1-vazifadan
- Produces: `TelegramIdTokenVerifier` (injectable):
  - `verify(idToken: string): Promise<{ phoneNumber: string; telegramUserId: string }>`
  - Xato holatlarida `UnauthorizedException` otadi
  - Test uchun: konstruktorning ikkinchi argumenti — ixtiyoriy `keyResolver` (jose `JWTVerifyGetKey`); berilmasa `createRemoteJWKSet` ishlatiladi

- [ ] **Step 1: `jose` paketini o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npm install jose
```

**NEGA `jose`:** JWKS'ni masofadan olish + RS256 imzo + `iss`/`aud`/`exp` tekshiruvini bitta chaqiruvda bajaradi va kalitlarni keshlaydi. Alternativa (`jsonwebtoken` + `jwks-rsa`) ikki paket bo'ladi; `jsonwebtoken` esa repoda faqat **tranzitiv** (`@nestjs/jwt` orqali) mavjud — tranzitiv paketga to'g'ridan-to'g'ri suyanish noto'g'ri.

- [ ] **Step 2: Yiqiladigan testni yozish**

Create `server/src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts`:

```typescript
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { UnauthorizedException } from '@nestjs/common';
import { TelegramIdTokenVerifier } from './telegram-id-token.verifier';

const CLIENT_ID = '1234567890';
const ISSUER = 'https://oauth.telegram.org';

/**
 * Soxta JWKS: o'z RSA kalit juftligimiz. Bu testlar tarmoqqa chiqmaydi va
 * imzo tekshiruvining HAQIQATAN ishlashini isbotlaydi.
 */
async function harness() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  const keyResolver = createLocalJWKSet({ keys: [jwk] });

  const other = await generateKeyPair('RS256');

  const sign = async (
    payload: Record<string, unknown>,
    key: CryptoKey = privateKey as CryptoKey,
  ) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);

  const verifier = new TelegramIdTokenVerifier(
    { clientId: CLIENT_ID } as any,
    keyResolver,
  );

  return { verifier, sign, otherPrivateKey: other.privateKey as CryptoKey };
}

const validPayload = {
  iss: ISSUER,
  aud: CLIENT_ID,
  sub: '1234123412341234123',
  id: 987654321,
  phone_number: '998901234567',
  phone_number_verified: true,
};

describe('TelegramIdTokenVerifier', () => {
  it("to'g'ri tokendan telefon va telegram id ni oladi", async () => {
    const { verifier, sign } = await harness();
    const result = await verifier.verify(await sign(validPayload));
    expect(result).toEqual({
      phoneNumber: '998901234567',
      telegramUserId: '987654321',
    });
  });

  it('boshqa kalit bilan imzolangan tokenni rad etadi', async () => {
    const { verifier, sign, otherPrivateKey } = await harness();
    const token = await sign(validPayload, otherPrivateKey);
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("noto'g'ri issuer ni rad etadi", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, iss: 'https://evil.example.com' });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("noto'g'ri audience ni rad etadi", async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, aud: '111111111' });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("muddati o'tgan tokenni rad etadi", async () => {
    const { verifier, sign } = await harness();
    const expired = await new SignJWT(validPayload as any)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign((await generateKeyPair('RS256')).privateKey as CryptoKey);
    await expect(verifier.verify(expired)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('phone_number yo\'q bo\'lsa rad etadi', async () => {
    const { verifier, sign } = await harness();
    const { phone_number: _omit, ...withoutPhone } = validPayload;
    await expect(
      verifier.verify(await sign(withoutPhone)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('phone_number_verified false bo\'lsa rad etadi', async () => {
    const { verifier, sign } = await harness();
    const token = await sign({ ...validPayload, phone_number_verified: false });
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('umuman token bo\'lmasa rad etadi', async () => {
    const { verifier } = await harness();
    await expect(verifier.verify('')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
```

- [ ] **Step 3: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts`
Expected: FAIL — `Cannot find module './telegram-id-token.verifier'`

- [ ] **Step 4: Verifierni yozish**

Create `server/src/auth/telegram-oauth/telegram-id-token.verifier.ts`:

```typescript
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from 'jose';
import { TelegramOauthConfig } from './telegram-oauth.config';

/** Hujjatdan verbatim. */
const ISSUER = 'https://oauth.telegram.org';
const JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json';

export interface VerifiedTelegramIdentity {
  /** `phone_number` claim — `+` belgisiz, mamlakat kodi bilan. */
  phoneNumber: string;
  /** `id` claim — Telegram user id. `sub` EMAS (u opaque identifikator). */
  telegramUserId: string;
}

/**
 * `id_token` tekshiruvi.
 *
 * BU YERDA HECH NARSA YUMSHATILMAYDI: imzo, `iss`, `aud`, `exp` va tasdiqlangan
 * telefon — beshtasidan bittasi o'tmasa kirish rad etiladi. Tekshiruvni
 * chetlab o'tish (masalan tokenni imzosiz o'qish) butun oqimni ma'nosiz
 * qiladi, chunki ishonch faqat shu imzoga tayanadi.
 */
@Injectable()
export class TelegramIdTokenVerifier {
  private readonly logger = new Logger(TelegramIdTokenVerifier.name);
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(
    private readonly config: TelegramOauthConfig,
    /** Testlar lokal JWKS uzatadi; prodda masofadagi kalitlar keshlanadi. */
    keyResolver?: JWTVerifyGetKey,
  ) {
    this.keyResolver = keyResolver ?? createRemoteJWKSet(new URL(JWKS_URL));
  }

  async verify(idToken: string): Promise<VerifiedTelegramIdentity> {
    if (!idToken) {
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(idToken, this.keyResolver, {
        issuer: ISSUER,
        audience: this.config.clientId,
      });
      payload = verified.payload;
    } catch (error) {
      // Sababni faqat logga yozamiz — foydalanuvchiga bir xil xato.
      this.logger.warn(
        `id_token tekshiruvi muvaffaqiyatsiz: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }

    const phoneNumber =
      typeof payload.phone_number === 'string' ? payload.phone_number.trim() : '';
    if (!phoneNumber || payload.phone_number_verified !== true) {
      throw new UnauthorizedException(
        "Telegram telefon raqamini bermadi. Ruxsat berib qayta urinib ko'ring.",
      );
    }

    const rawId = payload.id;
    const telegramUserId =
      typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId) : '';

    return { phoneNumber, telegramUserId };
  }
}
```

- [ ] **Step 5: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts`
Expected: PASS — 8 test

- [ ] **Step 6: Modulga qo'shish**

`server/src/auth/auth.module.ts` `providers` ga `TelegramIdTokenVerifier` qo'shing va importini yozing.

- [ ] **Step 7: Testlar va kompilyatsiya**

Run: `cd server && npx jest src/auth && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: PASS; tsc **44**

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/package.json server/package-lock.json \
  server/src/auth/telegram-oauth/telegram-id-token.verifier.ts \
  server/src/auth/telegram-oauth/telegram-id-token.verifier.spec.ts \
  server/src/auth/auth.module.ts
git commit -m "Verify Telegram id_token against the published JWKS, no soft paths"
```

---

## Task 4: Akkaunt topish mantiqini ajratish (sof refactor)

Telegram yo'li parol yo'lidan **kengroq bo'lmasligi** kerak. Buni kafolatlashning yagona ishonchli usuli — bitta topish funksiyasi.

**Files:**
- Modify: `server/src/auth/auth.service.ts` (`validateUser` — 37–100 atrofi)
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `normalizeSharedPhone` — `server/src/common/utils/phone.util.ts` (mavjud)
- Produces: `AuthService.findAccountByIdentifier(identifier: string, allowedRoleIds?: number[] | null): Promise<any | null>` — parolli qatorni ham qaytaradi (chaqiruvchi bcrypt qiladi). `validateUser` imzosi va xatti-harakati **o'zgarmaydi**.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/auth/auth.service.spec.ts` — `describe('validateUser — phone-based login', ...)` blokidan KEYIN yangi blok qo'shing:

```typescript
  describe('findAccountByIdentifier', () => {
    it('validateUser bilan AYNAN bir xil OR shartlarini yasaydi', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('+998 97 206 29 22', 'x', [1, 2, 3, 5]);
      const fromValidate = prisma.user.findFirst.mock.calls[0][0];

      prisma.user.findFirst.mockClear();
      prisma.user.findFirst.mockResolvedValue(null);

      await service.findAccountByIdentifier('+998 97 206 29 22', [1, 2, 3, 5]);
      const fromFinder = prisma.user.findFirst.mock.calls[0][0];

      expect(fromFinder).toEqual(fromValidate);
    });

    it('parolni tekshirmaydi — topilgan qatorni qaytaradi', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 5,
        password: 'hash',
        roles: [],
        branches: [],
        company: {},
      });

      const found = await service.findAccountByIdentifier('901234567', null);
      expect(found).toMatchObject({ id: 5 });
    });
  });
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/auth.service.spec.ts`
Expected: FAIL — `service.findAccountByIdentifier is not a function`

- [ ] **Step 3: Refactor**

`server/src/auth/auth.service.ts` — `validateUser` ni ikkiga bo'ling. Hozirgi `identifier`/`digits`/`normalized`/`candidates`/dedup/`findFirst` bloki YANGI metodga ko'chadi:

```typescript
  /**
   * Kimlikni (telefon yoki eski username) akkauntga aylantiradi.
   *
   * NEGA AJRATILGAN: parol bilan kirish va Telegram OAuth bir xil qoidadan
   * foydalanishi SHART — aks holda parolsiz yo'l parollidan kengroq bo'lib
   * qolishi mumkin. Parol tekshiruvi ataylab bu yerda emas.
   */
  async findAccountByIdentifier(
    login: string,
    allowedRoleIds?: number[] | null,
  ) {
    const identifier = (login ?? '').trim();
    const digits = identifier.replace(/\D/g, '');
    const normalized = digits ? normalizeSharedPhone(digits) : null;

    const candidates: Array<{ login?: string; phone?: string }> = [
      { login: identifier },
    ];
    for (const value of [normalized, digits]) {
      if (!value) continue;
      candidates.push({ phone: value }, { login: value });
    }
    const seen = new Set<string>();
    const or = candidates.filter((clause) => {
      const key = JSON.stringify(clause);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return this.prisma.user.findFirst({
      where: {
        OR: or,
        deletedAt: null,
        status: { in: [UserStatus.ACTIVE, UserStatus.INACTIVE] },
        ...(allowedRoleIds && allowedRoleIds.length
          ? { roles: { some: { role: { id: { in: allowedRoleIds } } } } }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        roles: { include: { role: true } },
        branches: { include: { branch: { select: { id: true, name: true } } } },
        company: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            logo: true,
            phone: true,
          },
        },
      },
    });
  }
```

`validateUser` esa shunga qisqaradi (mavjud izohlar saqlanadi):

```typescript
  async validateUser(
    login: string,
    password: string,
    allowedRoleIds?: number[] | null,
  ) {
    const user = await this.findAccountByIdentifier(login, allowedRoleIds);

    if (!user || !user.password) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const { password: _, ...result } = user;
    return result;
  }
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/auth.service.spec.ts`
Expected: PASS — yangi 2 test + mavjud `validateUser` testlarining HAMMASI (regressiya yo'q)

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "Extract account lookup so both sign-in paths share one rule"
```

---

## Task 5: Kod almashtirish, callback va complete

**Files:**
- Create: `server/src/auth/telegram-oauth/telegram-oauth.service.ts`
- Create: `server/src/auth/telegram-oauth/telegram-oauth.service.spec.ts`
- Create: `server/src/auth/dto/telegram-oauth-callback.dto.ts`, `server/src/auth/dto/telegram-oauth-complete.dto.ts`
- Modify: `server/src/auth/auth.controller.ts`, `server/src/auth/auth.module.ts`, `server/src/auth/auth.controller.spec.ts`

**Interfaces:**
- Consumes: `TelegramOauthConfig`, `TelegramOauthStateStore.consumeState`, `TelegramIdTokenVerifier.verify`, `AuthService.findAccountByIdentifier`, `AuthService.login(user, origin?, portal?)`, `RedisService`
- Produces: `TelegramOauthService`:
  - `handleCallback(code: string, state: string): Promise<{ redirectUrl: string }>`
  - `completeHandoff(handoff: string): Promise<{ accessToken; refreshToken; user }>`
  - `HANDOFF_TTL_SEC = 60`

- [ ] **Step 1: Yiqiladigan testni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth.service.spec.ts`:

```typescript
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
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth.service.spec.ts`
Expected: FAIL — `Cannot find module './telegram-oauth.service'`

- [ ] **Step 3: Servisni yozish**

Create `server/src/auth/telegram-oauth/telegram-oauth.service.ts`:

```typescript
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { AuthService } from '../auth.service';
import { getAllowedRoleIds } from '../portal-roles.config';
import { TelegramOauthConfig } from './telegram-oauth.config';
import { TelegramIdTokenVerifier } from './telegram-id-token.verifier';
import { TelegramOauthStateStore } from './telegram-oauth-state.store';

/** Hujjatdan verbatim. */
const TOKEN_URL = 'https://oauth.telegram.org/token';
/** Klient sessiyani olib ketishi uchun juda qisqa oyna. */
export const HANDOFF_TTL_SEC = 60;
/** Portalda SPA'ni qabul qiladigan sahifa. */
const PORTAL_CALLBACK_PATH = '/auth/telegram/callback';

const handoffKey = (handoff: string) => `tg_oauth:handoff:${handoff}`;

@Injectable()
export class TelegramOauthService {
  private readonly logger = new Logger(TelegramOauthService.name);

  constructor(
    private readonly config: TelegramOauthConfig,
    private readonly stateStore: TelegramOauthStateStore,
    private readonly verifier: TelegramIdTokenVerifier,
    private readonly authService: AuthService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Telegram redirect qilgan callback.
   *
   * NEGA TOKENLAR URL'DA EMAS: URL brauzer tarixiga, referrer'ga va
   * ko'pincha server loglariga tushadi. Shuning uchun portalga faqat bir
   * martalik `handoff` kodi beriladi, tokenlarni SPA alohida so'rov bilan oladi.
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ redirectUrl: string }> {
    const stored = await this.stateStore.consumeState(state);
    if (!stored) {
      // Muddati o'tgan, takror ishlatilgan yoki umuman bizdan chiqmagan.
      throw new BadRequestException(
        "Kirish so'rovi eskirgan. Iltimos, qaytadan urinib ko'ring.",
      );
    }
    if (!code) {
      throw new BadRequestException("Telegram kod qaytarmadi");
    }

    const idToken = await this.exchangeCode(code, stored.codeVerifier);
    const identity = await this.verifier.verify(idToken);

    // Portal rollari — parol bilan kirishdagi AYNAN shu mantiq.
    const allowedRoleIds = getAllowedRoleIds(stored.portalOrigin);
    const user = await this.authService.findAccountByIdentifier(
      identity.phoneNumber,
      allowedRoleIds,
    );
    if (!user) {
      throw new UnauthorizedException(
        "Bu Telegram raqami tizimda yo'q. Administrator bilan bog'laning.",
      );
    }

    // Rol darvozasi + tokenlar — mavjud login yo'li.
    const session = await this.authService.login(user, stored.portalOrigin);

    const handoff = randomBytes(32).toString('hex');
    await this.redis.set(
      handoffKey(handoff),
      JSON.stringify(session),
      'EX',
      HANDOFF_TTL_SEC,
    );

    const redirectUrl = new URL(PORTAL_CALLBACK_PATH, stored.portalOrigin);
    redirectUrl.searchParams.set('handoff', handoff);
    return { redirectUrl: redirectUrl.toString() };
  }

  /** Bir martalik: `getdel` atomik o'qib-o'chiradi. */
  async completeHandoff(handoff: string) {
    const raw = handoff ? await this.redis.getdel(handoffKey(handoff)) : null;
    if (!raw) {
      throw new BadRequestException(
        "Sessiya muddati tugadi. Iltimos, qaytadan kiring.",
      );
    }
    try {
      return JSON.parse(raw);
    } catch {
      throw new BadRequestException(
        "Sessiya muddati tugadi. Iltimos, qaytadan kiring.",
      );
    }
  }

  /** Authorization code → `id_token` (client secret bilan, server tomonda). */
  private async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      code_verifier: codeVerifier,
    });
    const basic = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    let res: Response;
    try {
      res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
        },
        body: body.toString(),
      });
    } catch (error) {
      this.logger.error(
        `Telegram token endpointiga ulanib bo'lmadi: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new UnauthorizedException(
        "Telegram bilan bog'lanib bo'lmadi. Qaytadan urinib ko'ring.",
      );
    }

    if (!res.ok) {
      // Javob matnini logga yozamiz (secret unda bo'lmaydi), foydalanuvchiga umumiy xato.
      this.logger.warn(
        `Telegram token almashtirish rad etildi (${res.status}): ${await res
          .text()
          .catch(() => '—')}`,
      );
      throw new UnauthorizedException(
        "Telegram kirishni tasdiqlamadi. Qaytadan urinib ko'ring.",
      );
    }

    const payload = (await res.json().catch(() => null)) as
      | { id_token?: string }
      | null;
    const idToken = payload?.id_token;
    if (!idToken) {
      throw new UnauthorizedException('Telegram javobi tekshirilmadi');
    }
    return idToken;
  }
}
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/telegram-oauth/telegram-oauth.service.spec.ts`
Expected: PASS — 11 test

- [ ] **Step 5: DTO'larni yozish**

Create `server/src/auth/dto/telegram-oauth-callback.dto.ts`:

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Telegram redirect'i bilan keladigan query. */
export class TelegramOauthCallbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  state?: string;

  /** Foydalanuvchi rad etsa Telegram `error` bilan qaytaradi. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}
```

Create `server/src/auth/dto/telegram-oauth-complete.dto.ts`:

```typescript
import { IsString, Matches } from 'class-validator';

export class TelegramOauthCompleteDto {
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: "Noto'g'ri handoff" })
  handoff: string;
}
```

- [ ] **Step 6: Endpointlarni qo'shish**

`server/src/auth/auth.controller.ts` — importlar:

```typescript
import { Redirect } from '@nestjs/common';
import { TelegramOauthCallbackDto } from './dto/telegram-oauth-callback.dto';
import { TelegramOauthCompleteDto } from './dto/telegram-oauth-complete.dto';
import { TelegramOauthService } from './telegram-oauth/telegram-oauth.service';
```

Konstruktorga `private telegramOauthService: TelegramOauthService,` qo'shing. So'ng:

```typescript
  /**
   * Telegram shu manzilga redirect qiladi. Javob — portalga 302.
   *
   * `@Res({ passthrough: false })` ishlatmasdan, Nest'ning `res.redirect` ini
   * qo'llaymiz, chunki manzil ish vaqtida hisoblanadi.
   */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('telegram/callback')
  async telegramCallback(
    @Query() query: TelegramOauthCallbackDto,
    @Res() res,
  ) {
    if (query.error) {
      // Foydalanuvchi Telegram ekranida rad etdi — bu xato emas.
      throw new BadRequestException("Kirish bekor qilindi");
    }
    const { redirectUrl } = await this.telegramOauthService.handleCallback(
      query.code ?? '',
      query.state ?? '',
    );
    res.redirect(302, redirectUrl);
  }

  /** SPA bir martalik `handoff` ni tokenlarga almashtiradi. */
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('telegram/complete')
  async telegramComplete(@Body() dto: TelegramOauthCompleteDto) {
    return this.telegramOauthService.completeHandoff(dto.handoff);
  }
```

`BadRequestException` va `Res` ni `@nestjs/common` importiga qo'shing (`Redirect` kerak emas — o'chiring, agar qo'shgan bo'lsangiz).

`auth.module.ts` `providers` ga `TelegramOauthService` qo'shing.

- [ ] **Step 7: Controller testini qo'shish**

`server/src/auth/auth.controller.spec.ts` ga:

```typescript
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
```

**MUHIM:** konstruktor argumentlari tartibi kod bilan bir xil bo'lishi shart. Mavjud spec'dagi barcha `new AuthController(...)` chaqiruvlarini yangi argumentlar bilan to'ldiring.

- [ ] **Step 8: Testlar va kompilyatsiya**

Run: `cd server && npx jest src/auth && npx tsc --noEmit 2>&1 | grep -c 'error TS'`
Expected: PASS; tsc **44**

- [ ] **Step 9: Butun to'plam**

Run: `cd server && npm test 2>&1 | tail -6`
Expected: barcha suite PASS (2262+ test)

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/telegram-oauth/telegram-oauth.service.ts \
  server/src/auth/telegram-oauth/telegram-oauth.service.spec.ts \
  server/src/auth/dto/telegram-oauth-callback.dto.ts \
  server/src/auth/dto/telegram-oauth-complete.dto.ts \
  server/src/auth/auth.controller.ts \
  server/src/auth/auth.controller.spec.ts \
  server/src/auth/auth.module.ts
git commit -m "Exchange the Telegram code server-side and hand the session over once"
```

---

## Task 6: Client — tugma va callback sahifasi

**Files:**
- Create: `client/src/components/auth/telegram-login-button.tsx`
- Create: `client/src/app/(auth)/auth/telegram/callback/page.tsx`
- Modify: `client/src/app/(auth)/login/login-form.tsx`, `client/src/app/(auth)/login/student-login-form.tsx`

**Interfaces:**
- Consumes: `GET /auth/telegram/status` → `{ enabled: boolean }`; `GET /auth/telegram/start` → `{ url: string }`; `POST /auth/telegram/complete { handoff }` → `{ accessToken, refreshToken, user }`
- Produces: `<TelegramLoginButton variant="default" | "lumio" />`

- [ ] **Step 1: Tugma komponentini yozish**

Create `client/src/components/auth/telegram-login-button.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

// Telegram'ning rasmiy OAuth oqimi. Tugma faqat backend funksiya yoniq deb
// aytganda ko'rinadi — sozlama Railway env'ida bo'lmasa hech narsa chizilmaydi.
export function TelegramLoginButton({
  variant = "default",
}: {
  variant?: "default" | "lumio";
}) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get("/auth/telegram/status")
      .then((res) => {
        if (active) setEnabled(Boolean(res.data?.enabled));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!enabled) return null;

  async function start() {
    setError("");
    setLoading(true);
    try {
      const res = await api.get("/auth/telegram/start");
      window.location.href = res.data.url;
    } catch (err) {
      setError(getErrorMessage(err, "Telegram orqali kirishni boshlab bo'lmadi"));
      setLoading(false);
    }
  }

  const isLumio = variant === "lumio";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={isLumio ? "h-px flex-1 bg-line" : "h-px flex-1 bg-border"} />
        <span
          className={
            isLumio
              ? "text-sm font-semibold text-ink-500"
              : "text-sm text-muted-foreground"
          }
        >
          yoki
        </span>
        <div className={isLumio ? "h-px flex-1 bg-line" : "h-px flex-1 bg-border"} />
      </div>

      {error ? (
        <div
          className={
            isLumio
              ? "rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger"
              : "rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          }
        >
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={start}
        disabled={loading}
        className={
          isLumio
            ? "flex h-[54px] w-full items-center justify-center rounded-md border border-line-strong bg-surface text-base font-bold text-ink-900 disabled:opacity-50"
            : "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
        }
      >
        {loading ? "Telegram ochilmoqda..." : "Telegram orqali kirish"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Callback sahifasini yozish**

Create `client/src/app/(auth)/auth/telegram/callback/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";

// Telegram → API callback → portal. Bu sahifa faqat bir martalik `handoff`
// kodini tokenlarga almashtiradi: tokenlar URL'da hech qachon yurmaydi.
function TelegramCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setAuth } = useAuth();
  const [error, setError] = useState("");
  // Strict Mode ikki marta chaqiradi, handoff esa bir martalik — qulflaymiz.
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const handoff = searchParams.get("handoff");
    if (!handoff) {
      setError("Kirish ma'lumoti topilmadi. Qaytadan urinib ko'ring.");
      return;
    }

    api
      .post("/auth/telegram/complete", { handoff })
      .then((res) => {
        setAuth(res.data.user, res.data.accessToken, res.data.refreshToken);
        const isStudent = res.data.user?.roles?.some(
          (r: { id: number }) => r.id === 6,
        );
        router.replace(isStudent ? "/portal" : "/");
      })
      .catch((err) => {
        setError(getErrorMessage(err, "Kirishni tugatib bo'lmadi"));
      });
  }, [searchParams, setAuth, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => router.replace("/login")}
              className="text-sm text-primary hover:underline"
            >
              Kirish sahifasiga qaytish
            </button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Kirish tasdiqlanmoqda...</p>
        )}
      </div>
    </div>
  );
}

export default function TelegramCallbackPage() {
  // `useSearchParams` Suspense chegarasini talab qiladi (statik prerender).
  return (
    <Suspense fallback={null}>
      <TelegramCallbackInner />
    </Suspense>
  );
}
```

- [ ] **Step 3: Ikkala formaga tugmani qo'shish**

`client/src/app/(auth)/login/login-form.tsx` — importga:

```tsx
import { TelegramLoginButton } from "@/components/auth/telegram-login-button";
```

`</form>` yopilgandan KEYIN, `ForgotPasswordDialog` dan oldin:

```tsx
      <TelegramLoginButton />
```

`client/src/app/(auth)/login/student-login-form.tsx` — importga xuddi shu qatorni qo'shib, `</form>` dan keyin:

```tsx
      <TelegramLoginButton variant="lumio" />
```

- [ ] **Step 4: Kompilyatsiya va lint**

Run: `cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -3`
Expected: tsc 0 xato; lint muammolari soni baseline'dan (91 problem / 2 error) OSHMAGAN

- [ ] **Step 5: Build (Suspense/prerender tekshiruvi)**

Run: `cd client && npm run build 2>&1 | tail -15`
Expected: build muvaffaqiyatli. `useSearchParams` Suspense'siz bo'lsa build aynan shu yerda yiqiladi — shuning uchun bu qadam majburiy.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/components/auth/telegram-login-button.tsx \
  "client/src/app/(auth)/auth/telegram/callback/page.tsx" \
  "client/src/app/(auth)/login/login-form.tsx" \
  "client/src/app/(auth)/login/student-login-form.tsx"
git commit -m "Offer Telegram sign-in on every web portal behind a config gate"
```

---

## Task 7: `otp/poll` ga rate-limit va hujjatlar

Spec'dagi aloqador tuzatish: native ilova ishlatadigan `GET /auth/otp/poll` da throttle **umuman yo'q**.

**Files:**
- Modify: `server/src/auth/auth.controller.ts` (`otp/poll`)
- Modify: `server/src/auth/auth.controller.spec.ts`
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`

**Interfaces:**
- Consumes: `IpThrottlerGuard`, `Throttle` — mavjud
- Produces: xatti-harakat o'zgarishi yo'q (faqat chek)

- [ ] **Step 1: Throttle qo'shish**

`server/src/auth/auth.controller.ts` — mavjud `otp/poll` endpointiga:

```typescript
  // Native app (link/poll): poll a login request until the bot approves it.
  // Klient har 2.5 sekundda so'raydi (≈24/min), shuning uchun 60/min/IP —
  // qonuniy pollingga xalaqit bermaydi, cheksiz so'rovni esa to'xtatadi.
  @Public()
  @UseGuards(IpThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('otp/poll')
  async pollLogin(@Query('requestId') requestId: string) {
    return this.authService.pollLoginRequest(requestId ?? '');
  }
```

- [ ] **Step 2: Testini qo'shish**

`server/src/auth/auth.controller.spec.ts` ga:

`server/src/auth/auth.controller.spec.ts` dagi mavjud `describe('AuthController — rate limiting (F-3)', ...)` blokiga qo'shing (u yerda `guardsOf` helperi allaqachon bor va `'__guards__'` kalitini ishlatadi — repo'ning o'z namunasi):

```typescript
  it('protects /auth/otp/poll with IpThrottlerGuard', () => {
    const guards = guardsOf(AuthController.prototype.pollLogin);
    expect(guards).toContain(IpThrottlerGuard);
  });
```

Va poll oqimi buzilmaganini qulflaydigan test (native ilova shunga suyanadi):

```typescript
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
```

- [ ] **Step 3: Testlar**

Run: `cd server && npx jest src/auth`
Expected: PASS

- [ ] **Step 4: `server/CLAUDE.md` ni yangilash**

«#### Phone-based login (all roles)» bo'limidan KEYIN, «#### SMS password reset» / keyingi `####` sarlavhadan OLDIN aynan shu blokni qo'shing:

```markdown
#### Telegram OAuth sign-in (web portals)

- **Web only.** All three portals (`admin` / `lehrer` / `student`) offer "Telegram orqali kirish" through Telegram's official OAuth 2.0 / OIDC flow. The student **native app** still uses the older bot-deep-link + `GET /auth/otp/poll` flow — that flow's `requestId` is minted by the client and approved by whoever presses START, so a forwarded `t.me` link can hand the victim's session to an attacker. OAuth closes that by construction; do not extend the poll flow to staff.
- **Endpoints** (all `@Public()`, all `IpThrottlerGuard`): `GET /auth/telegram/status` → `{ enabled }`, `GET /auth/telegram/start` → `{ url }`, `GET /auth/telegram/callback` (Telegram redirects here, 302s to the portal), `POST /auth/telegram/complete` → session.
- **`state` + PKCE live in Redis** (`tg_oauth:state:*`, 5 min, single-use via `getdel`) together with the portal origin. The `code_verifier` **never reaches the browser** — that pair is what binds the flow to the initiating browser.
- **One `redirect_uri`, on the API domain** (`https://api.dafzentrum.uz/api/auth/telegram/callback`), because the code is exchanged with the client secret server-side. The portal to return to comes from the stored `state` and is re-checked against `isKnownPortalOrigin` — without that whitelist the callback would be an open redirect.
- **`id_token` verification is absolute**: RS256 against `https://oauth.telegram.org/.well-known/jwks.json`, `issuer=https://oauth.telegram.org`, `audience` = client id, `exp`, plus `phone_number_verified === true`. Any failure denies sign-in. Never add a soft path and never read the token without verifying it — the whole flow's trust rests on this signature.
- **Account lookup is shared with password login**: `phone_number` (no `+`, country code included) → `AuthService.findAccountByIdentifier` → `AuthService.login` applies the portal role gate. The Telegram path must never be wider than the password path; that is why the lookup is one function.
- **Tokens never travel in a URL.** The callback redirects with a single-use `handoff` (`tg_oauth:handoff:*`, 60s) that the SPA exchanges. A URL would leak the session into browser history, referrers and proxy logs.
- **`User.telegramChatId` is NOT written.** The `sub` claim is an opaque per-bot identifier, not the bot's `chat.id`; the Telegram user id is the separate `id` claim. Writing the wrong value would break bot messaging, and nothing here needs it.
- **Config gate:** missing any of the three env vars turns the feature fully off — `status` returns `{ enabled: false }` and the client renders no button. Config is applied by hand in BotFather + Railway, so a half-configured deploy must degrade to "off", never to a broken button.
```

«Environment Variables» jadvaliga uchta qatorni qo'shing:

```markdown
| `TELEGRAM_OAUTH_CLIENT_ID` | Telegram OIDC client id (BotFather → Login Widget) | — |
| `TELEGRAM_OAUTH_CLIENT_SECRET` | Telegram OIDC client secret | — |
| `TELEGRAM_OAUTH_REDIRECT_URI` | Must byte-match a BotFather Redirect URI | — |
```

- [ ] **Step 5: `client/CLAUDE.md` ni yangilash**

«#### Phone Numbers» bo'limidagi sign-in istisnosidan keyin aynan shu blokni qo'shing:

```markdown
#### Telegram sign-in button

- Both login forms render `<TelegramLoginButton />` (`src/components/auth/telegram-login-button.tsx`) under the password form. It **self-hides** unless `GET /auth/telegram/status` reports `enabled` — the OAuth credentials are configured by hand, so an unconfigured environment must show no button rather than a broken one.
- Clicking it asks the backend for the authorize URL (`GET /auth/telegram/start`) and navigates there. The client never builds the Telegram URL itself and never holds the PKCE verifier.
- Telegram returns to the API, which 302s to `/auth/telegram/callback?handoff=…` on this app. That page exchanges the single-use handoff for tokens (`POST /auth/telegram/complete`), calls `setAuth`, and redirects (student → `/portal`, everyone else → `/`).
- **The callback page must stay wrapped in `<Suspense>`** — it reads `useSearchParams`, which bails out of static prerendering without a boundary and fails `npm run build`.
```

- [ ] **Step 6: Butun to'plam va kompilyatsiya**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npm test 2>&1 | tail -6
cd /Users/a1111/Desktop/daf-erp-system/server && npx tsc --noEmit 2>&1 | grep -c 'error TS'
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit
```
Expected: server testlari PASS; tsc **44**; client tsc 0 xato

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/auth.controller.ts server/src/auth/auth.controller.spec.ts \
  server/CLAUDE.md client/CLAUDE.md
git commit -m "Rate-limit the native login poll and document the OAuth flow"
```

---

## Task 8: Yakuniy tekshiruv

**Files:** hech narsa o'zgartirilmaydi — faqat tasdiqlash

- [ ] **Step 1: Butun server to'plami**

Run: `cd server && npm test 2>&1 | tail -6`
Expected: barcha suite PASS. Natijani yozib qo'ying.

- [ ] **Step 2: Uch loyihani kompilyatsiya qilish**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npx tsc --noEmit 2>&1 | grep -c 'error TS'
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit && npm run build 2>&1 | tail -5
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit
```
Expected: server **44** (baseline), client tsc toza + build muvaffaqiyatli, student-app 0 xato

- [ ] **Step 3: Native ilova tegilmaganini tasdiqlash**

Run: `cd /Users/a1111/Desktop/daf-erp-system && git diff --stat HEAD~7 -- student-app/ server/prisma/`
Expected: **bo'sh natija**

- [ ] **Step 4: Parol bilan kirish regressiyasi yo'qligini tasdiqlash**

Run: `cd server && npx jest src/auth/auth.service.spec.ts -t "validateUser"`
Expected: PASS — barcha mavjud `validateUser` testlari

- [ ] **Step 5: Migration qo'shilmaganini tasdiqlash**

Run: `cd /Users/a1111/Desktop/daf-erp-system && git status --short server/prisma/`
Expected: bo'sh

---

## Joylashtirish (rejadan tashqari)

1. **CEO:** BotFather'da prod Redirect URI qo'shilishi — `https://api.dafzentrum.uz/api/auth/telegram/callback` (hozircha faqat localhost ro'yxatda)
2. **CEO:** Railway env — `TELEGRAM_OAUTH_CLIENT_ID=<BotFather Client ID>`, `TELEGRAM_OAUTH_CLIENT_SECRET=<revoke qilingandan keyingi yangi secret>`, `TELEGRAM_OAUTH_REDIRECT_URI=https://api.dafzentrum.uz/api/auth/telegram/callback`
3. Server: qo'lda `railway up`. Client: Vercel. Yangi `NEXT_PUBLIC_*` **kerak emas**
4. Deploy'dan keyin qo'lda tekshirish: uchta portalning har birida Telegram orqali kirib ko'rish; admin portalda ustoz akkaunti bilan urinib, rad etilishini tasdiqlash

## Qamrovdan tashqarida (keyingi ish)

- Native ilova auth'i — BotFather'dagi «Native Login → Add Native App» orqali, alohida spec
- Sessiyani bekor qilish (refresh token qora ro'yxati) — o'g'irlangan sessiyani 24 soat to'xtatib bo'lmaydi, OAuth'dan mustaqil qarz
- Native OAuth'ga o'tgandan keyin `req_` poll oqimini butunlay o'chirish
