# Student App Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uchta bajarilmagan backend MUST-HAVE ni yopish — o'quvchi ilovadan har kuni chiqib ketmasin, to'lovdan keyingi qaytish manzili qulflansin, eski build qulash o'rniga «yangilang» desin.

**Architecture:** Uchalasi ham mavjud naqshlarni takrorlaydi. Refresh muddati token ichidagi sinf belgisi orqali sessiya turiga bog'lanadi. Qaytish manzili tekshiruvi loyihada allaqachon mavjud `isKnownPortalOrigin()` ga topshiriladi. Versiya gate — global guard, `X-App-Version` header'ini o'qiydi va standart holatda umuman ishlamaydi.

**Tech Stack:** NestJS, jest, TypeScript; ilova tomonida Expo SDK 54 + axios + zustand.

**Spec:** `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

## Global Constraints

- **Bu PR hech kimni bloklamasligi shart.** Versiya gate standart holatda o'chiq: `MIN_APP_VERSION` env belgilanmagan bo'lsa guard hech qachon rad etmaydi. Deploydan keyin ham hech narsa o'zgarmaydi — gate keyinroq, qo'lda yoqiladi.
- **Refresh muddati faqat native sessiyaga uzaytiriladi.** Admin, o'qituvchi va web student sessiyalari 24 soatligicha qoladi. Bu qoida buzilsa — xavfsizlik chekinishi.
- **Mavjud klientlar buzilmaydi.** Web portal `returnUrl` yuboradi, native yubormaydi; ikkalasi ham ishlashda davom etishi kerak.
- **Yangi route qo'shilmaydi.** Loyihada route siyosati manifesti bor va toifalanmagan route build'ni yiqitadi (`branch-route-policy.ts`). Bu reja yangi endpoint yaratmaydi, ya'ni manifestga tegilmaydi.
- Server buyruqlari `server/` ichida, ilova buyruqlari `student-app/` ichida bajariladi.
- Test: `cd server && npx jest <path>`. Har task o'z testi bilan tugaydi.

## File Structure

| Fayl | Mas'uliyati |
|---|---|
| `server/src/common/app-version/app-version.util.ts` (yangi) | Sof versiya solishtirish — testlanadigan yadro |
| `server/src/common/app-version/app-version.util.spec.ts` (yangi) | Uning testi |
| `server/src/common/app-version/app-version.guard.ts` (yangi) | Header'ni o'qib 426 qaytaradi |
| `server/src/common/app-version/app-version.guard.spec.ts` (yangi) | Guard testi |
| `server/src/app.module.ts` (o'zgartiriladi) | Guard'ni global ro'yxatdan o'tkazish |
| `server/src/auth/portal-roles.config.ts` (o'zgartiriladi) | `isAllowedPortalReturnUrl()` qo'shiladi |
| `server/src/auth/portal-roles.config.spec.ts` (o'zgartiriladi) | Uning testi |
| `server/src/students/student-portal.controller.ts` (o'zgartiriladi) | `returnUrl` tekshiruvi |
| `server/src/auth/auth.service.ts` (o'zgartiriladi) | Refresh muddati sinfi |
| `server/src/auth/auth.service.spec.ts` (o'zgartiriladi) | Muddat testlari |
| `student-app/src/api/client.ts` (o'zgartiriladi) | `X-App-Version` + 426 ushlash |
| `student-app/src/app/update-required.tsx` (yangi) | Bloklovchi «yangilang» ekrani |
| `student-app/src/app/_layout.tsx` (o'zgartiriladi) | Bayroq ko'tarilganda shu ekranni chizish |

---

### Task 1: Refresh token muddati sessiya turiga bog'lanadi

**Files:**
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: hech narsa
- Produces: refresh token payload'ida `ttl?: 'long'` maydoni. 3-task va keyingi PR'lar bunga tayanmaydi, lekin `refresh()` uni o'qiydi.

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`server/src/auth/auth.service.spec.ts` oxiriga, mavjud `describe('AuthService', ...)` ichiga yangi blok qo'shing:

```ts
  describe('refresh token lifetime', () => {
    /** Helper: pull the refresh-token sign() call out of the jwt mock. */
    function refreshSignCall() {
      return jwt.sign.mock.calls.find(
        ([payload]: any[]) => payload?.type === 'refresh',
      );
    }

    it('gives the native student app a 30-day refresh token', async () => {
      await service.login(student, undefined, 'student');
      const [payload, opts] = refreshSignCall();
      expect(opts.expiresIn).toBe('30d');
      expect(payload.ttl).toBe('long');
    });

    it('keeps a teacher web session at 24h', async () => {
      await service.login(teacher, 'https://lehrer.dafzentrum.uz', undefined);
      const [payload, opts] = refreshSignCall();
      expect(opts.expiresIn).toBe('24h');
      expect(payload.ttl).toBeUndefined();
    });

    it('keeps the student WEB portal at 24h — only the native app gets 30d', async () => {
      await service.login(student, 'https://student.dafzentrum.uz', undefined);
      const [, opts] = refreshSignCall();
      expect(opts.expiresIn).toBe('24h');
    });

    it('preserves the long lifetime when a native token is rotated', async () => {
      jwt.verify = jest
        .fn()
        .mockReturnValue({ sub: 1, type: 'refresh', ttl: 'long' });
      prisma.user.findFirst.mockResolvedValue(student);

      await service.refresh('old-token');

      const [payload, opts] = refreshSignCall();
      expect(opts.expiresIn).toBe('30d');
      expect(payload.ttl).toBe('long');
    });

    it('does not upgrade a short token to long on rotation', async () => {
      jwt.verify = jest.fn().mockReturnValue({ sub: 2, type: 'refresh' });
      prisma.user.findFirst.mockResolvedValue(teacher);

      await service.refresh('old-token');

      const [, opts] = refreshSignCall();
      expect(opts.expiresIn).toBe('24h');
    });
  });
```

**Nega oxirgi ikkita test muhim:** rotatsiya `refresh()` ichida sodir bo'ladi va u portal header'ini ko'rmaydi. Sinf tokenning o'zida yurmasa, native sessiya birinchi yangilanishdayoq 24 soatga tushib qolardi — ya'ni tuzatish jimgina bekor bo'lardi.

- [ ] **Step 2: Testlar yiqilishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/auth/auth.service.spec.ts -t "refresh token lifetime"
```

Kutilgan: 5 ta test ham FAIL. Birinchisi `expect(opts.expiresIn).toBe('30d')` da `Received: "24h"` deb yiqiladi.

- [ ] **Step 3: `generateTokens` ga muddat sinfini qo'shish**

`server/src/auth/auth.service.ts`, hozirgi kod:

```ts
  private generateTokens(
    userId: number,
    roles: string[],
    companyId: number,
    studentId?: number,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const payload: Record<string, any> = { sub: userId, roles, companyId };
    if (studentId) payload.studentId = studentId;

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: '1h',
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh' },
      { secret, expiresIn: '24h' },
    );

    return { accessToken, refreshToken };
  }
```

Almashtiring:

```ts
/**
 * Native app sessions live far longer than browser ones: the phone is
 * personal and a daily re-login is the app's worst UX bug. Browser sessions
 * (admin, teacher, student web) stay short — a shared computer must not keep
 * an ERP session open for a month.
 *
 * The class travels INSIDE the refresh token because rotation happens in
 * `refresh()`, which never sees the portal header. Without it a native
 * session would silently collapse to 24h on its first renewal.
 */
const REFRESH_TTL_LONG = '30d';
const REFRESH_TTL_SHORT = '24h';

// ...klass ichida:

  private generateTokens(
    userId: number,
    roles: string[],
    companyId: number,
    studentId?: number,
    longLived = false,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    const payload: Record<string, any> = { sub: userId, roles, companyId };
    if (studentId) payload.studentId = studentId;

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: '1h',
    });

    const refreshPayload: Record<string, any> = { sub: userId, type: 'refresh' };
    if (longLived) refreshPayload.ttl = 'long';

    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret,
      expiresIn: longLived ? REFRESH_TTL_LONG : REFRESH_TTL_SHORT,
    });

    return { accessToken, refreshToken };
  }
```

- [ ] **Step 4: Uchta chaqiruv joyini yangilash**

**`login()` (≈229-qator)** — `portal` parametri allaqachon mavjud:

```ts
    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      studentId,
      portal?.trim().toLowerCase() === 'student',
    );
```

**`buildStudentSession()` (≈289-qator)** — har doim uzun:

```ts
    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      studentId,
      // Always long-lived: this method's only caller is `pollLoginRequest`,
      // i.e. the native app's Telegram sign-in. It already enforces role 6 and
      // the web portals never take this path. Without this line, a student who
      // signs in through Telegram would still be logged out every 24h.
      true,
    );
```

**`refresh()` (≈354-qator)** — sinfni tokendan o'qiydi:

```ts
      const tokens = this.generateTokens(
        user.id,
        roles,
        user.companyId,
        studentId,
        payload.ttl === 'long',
      );
```

`payload` — `refresh()` boshida `this.jwtService.verify(...)` dan olingan o'zgaruvchi. `refresh()` ichida `studentId` qanday hisoblanayotganini o'zgartirmang, faqat oxirgi argumentni qo'shing.

- [ ] **Step 5: Testlar o'tishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/auth/auth.service.spec.ts
```

Kutilgan: barcha testlar PASS (yangi 5 tasi va oldindan mavjud bo'lganlari).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "Give native app sessions a 30-day refresh, leave browsers at 24h"
```

---

### Task 2: To'lovdan qaytish manzili oq ro'yxatga olinadi

**Files:**
- Modify: `server/src/auth/portal-roles.config.ts`
- Modify: `server/src/auth/portal-roles.config.spec.ts`
- Modify: `server/src/students/student-portal.controller.ts`

**Interfaces:**
- Consumes: mavjud `isKnownPortalOrigin(origin: string | undefined): boolean`
- Produces: `export function isAllowedPortalReturnUrl(url: string | undefined): boolean` — `portal-roles.config.ts` dan

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/auth/portal-roles.config.spec.ts` ichiga, mavjud `describe('portal-roles.config', ...)` ning oxiriga:

```ts
  describe('isAllowedPortalReturnUrl', () => {
    it('accepts the student portal payment-result page the web client sends', () => {
      expect(
        isAllowedPortalReturnUrl(
          'https://student.dafzentrum.uz/portal/payments/result',
        ),
      ).toBe(true);
    });

    it('accepts localhost during development', () => {
      expect(
        isAllowedPortalReturnUrl('http://localhost:3000/portal/payments/result'),
      ).toBe(true);
    });

    it('rejects a foreign host — this is the open-redirect it exists to stop', () => {
      expect(isAllowedPortalReturnUrl('https://evil.example/steal')).toBe(false);
    });

    it('rejects a look-alike host', () => {
      expect(
        isAllowedPortalReturnUrl('https://student.dafzentrum.uz.evil.example/x'),
      ).toBe(false);
    });

    it('rejects plain http on a real portal host', () => {
      expect(
        isAllowedPortalReturnUrl('http://student.dafzentrum.uz/portal'),
      ).toBe(false);
    });

    it('rejects a credentials-in-URL disguise', () => {
      expect(
        isAllowedPortalReturnUrl('https://a:b@student.dafzentrum.uz/portal'),
      ).toBe(false);
    });

    it('rejects garbage that is not a URL', () => {
      expect(isAllowedPortalReturnUrl('not-a-url')).toBe(false);
      expect(isAllowedPortalReturnUrl('')).toBe(false);
    });

    it('treats "not provided" as allowed — the caller falls back to its default', () => {
      expect(isAllowedPortalReturnUrl(undefined)).toBe(true);
    });
  });
```

Faylning yuqorisidagi importga `isAllowedPortalReturnUrl` ni qo'shing.

**Nega oxirgi test shunday:** `returnUrl` ixtiyoriy maydon. Berilmagan bo'lsa bu xato emas — kontroller o'zining standart manzilini ishlatadi. `undefined` ni `false` deb hisoblasak, native ilova to'lovi butunlay ishlamay qolardi.

- [ ] **Step 2: Test yiqilishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/auth/portal-roles.config.spec.ts
```

Kutilgan: kompilyatsiya xatosi — `isAllowedPortalReturnUrl` eksport qilinmagan.

- [ ] **Step 3: Funksiyani yozish**

`server/src/auth/portal-roles.config.ts` oxiriga, `isKnownPortalOrigin` dan keyin:

```ts
/**
 * To'lov tugagach foydalanuvchi qaytariladigan manzil bizniki ekanini
 * tasdiqlaydi.
 *
 * NEGA KERAK: `returnUrl` klientdan keladi va to'g'ridan-to'g'ri Payme `c=` /
 * Click `return_url` parametriga qo'yiladi. Tekshirilmasa, har kim to'lovdan
 * keyin odamni istalgan saytga olib boradigan, bizning domendan boshlanadigan
 * havola yasay olardi.
 *
 * NEGA `undefined` O'TADI: maydon ixtiyoriy. Berilmasa kontroller o'zining
 * standart manzilini ishlatadi — bu native ilovaning odatiy yo'li.
 */
export function isAllowedPortalReturnUrl(url: string | undefined): boolean {
  if (url === undefined) return true;
  try {
    return isKnownPortalOrigin(new URL(url).origin);
  } catch {
    return false;
  }
}
```

**Diqqat:** `new URL(url).origin` — bu `https://a:b@host` shaklidagi manzilda foydalanuvchi/parolni tashlab yuboradi, ya'ni `isKnownPortalOrigin` ning `username/password` tekshiruvi bu yo'ldan ishlamaydi. Shuning uchun tekshiruvni **URL'ning o'zida** qiling:

```ts
export function isAllowedPortalReturnUrl(url: string | undefined): boolean {
  if (url === undefined) return true;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) return false;
    return isKnownPortalOrigin(parsed.origin);
  } catch {
    return false;
  }
}
```

Ikkinchi variant to'g'ri — shuni yozing.

- [ ] **Step 4: Testlar o'tishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/auth/portal-roles.config.spec.ts
```

Kutilgan: barcha testlar PASS, jumladan `https://a:b@student.dafzentrum.uz/portal` rad etilishi.

- [ ] **Step 5: Kontrollerda ishlatish**

`server/src/students/student-portal.controller.ts`, `initPayment` metodi. Hozirgi kod:

```ts
    if (!studentId) throw new NotFoundException('Talaba topilmadi');

    const returnUrl =
      dto.returnUrl || 'https://student.dafzentrum.uz/portal/payments/result';
```

Almashtiring:

```ts
    if (!studentId) throw new NotFoundException('Talaba topilmadi');

    // The client supplies this and it lands in the Payme `c=` / Click
    // `return_url` parameter — reject anything that is not one of our portals.
    if (!isAllowedPortalReturnUrl(dto.returnUrl)) {
      throw new BadRequestException("Qaytish manzili ruxsat etilmagan");
    }

    const returnUrl =
      dto.returnUrl || 'https://student.dafzentrum.uz/portal/payments/result';
```

Import qo'shing:

```ts
import { isAllowedPortalReturnUrl } from '../auth/portal-roles.config';
```

`BadRequestException` allaqachon shu faylda import qilingan (`To'lov tizimi sozlanmagan` uchun ishlatiladi) — tekshiring, yo'q bo'lsa qo'shing.

- [ ] **Step 6: Butun server test to'plamini yurgizish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest
```

Kutilgan: barcha testlar PASS. Bu qadam muhim — `portal-roles.config.ts` ni Telegram OAuth ham ishlatadi, uni buzmaganimizni tasdiqlaymiz.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/portal-roles.config.ts server/src/auth/portal-roles.config.spec.ts server/src/students/student-portal.controller.ts
git commit -m "Reject payment return URLs that point away from our portals"
```

---

### Task 3: Versiya solishtirish yadrosi

**Files:**
- Create: `server/src/common/app-version/app-version.util.ts`
- Create: `server/src/common/app-version/app-version.util.spec.ts`

**Interfaces:**
- Consumes: hech narsa
- Produces: `export function isBelowMinVersion(actual: string | undefined, min: string | undefined): boolean`

**Nega alohida task:** solishtirish mantig'i — gate'ning eng nozik qismi va sof funksiya. Uni HTTP kontekstidan ajratib to'liq qamrash mumkin.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/common/app-version/app-version.util.spec.ts`:

```ts
import { isBelowMinVersion } from './app-version.util';

describe('isBelowMinVersion', () => {
  describe('when no minimum is configured — the default, gate disabled', () => {
    it('never reports below, whatever the client sends', () => {
      expect(isBelowMinVersion('0.0.1', undefined)).toBe(false);
      expect(isBelowMinVersion(undefined, undefined)).toBe(false);
      expect(isBelowMinVersion('1.0.0', '')).toBe(false);
      expect(isBelowMinVersion('1.0.0', '   ')).toBe(false);
    });
  });

  describe('ordering', () => {
    it('reports below for an older version', () => {
      expect(isBelowMinVersion('1.0.0', '1.2.0')).toBe(true);
    });

    it('reports not-below for an equal version', () => {
      expect(isBelowMinVersion('1.2.0', '1.2.0')).toBe(false);
    });

    it('reports not-below for a newer version', () => {
      expect(isBelowMinVersion('1.3.0', '1.2.0')).toBe(false);
    });

    it('compares segments numerically, not as text', () => {
      // "1.10.0" < "1.9.0" as strings, but 10 > 9 as numbers.
      expect(isBelowMinVersion('1.10.0', '1.9.0')).toBe(false);
      expect(isBelowMinVersion('1.9.0', '1.10.0')).toBe(true);
    });

    it('treats missing trailing segments as zero', () => {
      expect(isBelowMinVersion('2', '2.0.0')).toBe(false);
      expect(isBelowMinVersion('2.0', '2.0.1')).toBe(true);
    });
  });

  describe('clients that send nothing or garbage', () => {
    it('treats a missing version as 0.0.0 — old builds predate the header', () => {
      expect(isBelowMinVersion(undefined, '1.2.0')).toBe(true);
    });

    it('treats an unparseable version as 0.0.0', () => {
      expect(isBelowMinVersion('abc', '1.2.0')).toBe(true);
    });

    it('ignores a build suffix', () => {
      expect(isBelowMinVersion('1.2.0-beta.3', '1.2.0')).toBe(false);
    });
  });
});
```

**Nega `undefined` = eski:** bugungi 1.0.0 bu header'ni umuman yubormaydi. Gate yoqilgan paytda ular haqiqatan eski hisoblanishi kerak. Xavfsizlik esa boshqa joyda — `min` belgilanmagan bo'lsa gate umuman ishlamaydi.

- [ ] **Step 2: Test yiqilishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/common/app-version/app-version.util.spec.ts
```

Kutilgan: `Cannot find module './app-version.util'`.

- [ ] **Step 3: Funksiyani yozish**

`server/src/common/app-version/app-version.util.ts`:

```ts
/**
 * Versiya satrini raqamlar massiviga aylantiradi.
 * "1.2.3-beta.4" → [1, 2, 3]. Tushunarsiz bo'lak 0 bo'ladi.
 */
function parse(version: string): number[] {
  return version
    .trim()
    .split('-')[0]
    .split('.')
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/**
 * Klient versiyasi talab qilinadigan eng past versiyadan pastmi?
 *
 * `min` belgilanmagan bo'lsa HAR DOIM `false` — bu gate'ning o'chiq holati va
 * standart holat. Gate faqat `MIN_APP_VERSION` ataylab qo'yilganda ishlaydi.
 *
 * `actual` yo'q yoki tushunarsiz bo'lsa 0.0.0 deb hisoblanadi: header'ni
 * yubormaydigan build — aynan biz bloklamoqchi bo'lgan eski build.
 */
export function isBelowMinVersion(
  actual: string | undefined,
  min: string | undefined,
): boolean {
  if (!min || !min.trim()) return false;

  const a = parse(actual ?? '');
  const b = parse(min);
  const len = Math.max(a.length, b.length);

  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}
```

- [ ] **Step 4: Testlar o'tishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/common/app-version/app-version.util.spec.ts
```

Kutilgan: barcha testlar PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/common/app-version/
git commit -m "Add numeric version comparison that stays inert without a floor"
```

---

### Task 4: Versiya guard'i

**Files:**
- Create: `server/src/common/app-version/app-version.guard.ts`
- Create: `server/src/common/app-version/app-version.guard.spec.ts`
- Modify: `server/src/app.module.ts`

**Interfaces:**
- Consumes: `isBelowMinVersion` (Task 3)
- Produces: `export class AppVersionGuard implements CanActivate`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/common/app-version/app-version.guard.spec.ts`:

```ts
import { HttpException } from '@nestjs/common';
import { AppVersionGuard } from './app-version.guard';

describe('AppVersionGuard', () => {
  const OLD_ENV = process.env.MIN_APP_VERSION;

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.MIN_APP_VERSION;
    else process.env.MIN_APP_VERSION = OLD_ENV;
  });

  /** Minimal ExecutionContext stub — the guard only reads request headers. */
  function ctx(headers: Record<string, string>) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as any;
  }

  it('lets everything through when no floor is configured', () => {
    delete process.env.MIN_APP_VERSION;
    const guard = new AppVersionGuard();
    expect(
      guard.canActivate(ctx({ 'x-portal': 'student' })),
    ).toBe(true);
  });

  it('lets the browser through even when a floor is set', () => {
    process.env.MIN_APP_VERSION = '2.0.0';
    const guard = new AppVersionGuard();
    // Web portals send Origin, never X-Portal — they always run the latest code.
    expect(guard.canActivate(ctx({ origin: 'https://student.dafzentrum.uz' }))).toBe(
      true,
    );
  });

  it('lets a current native app through', () => {
    process.env.MIN_APP_VERSION = '2.0.0';
    const guard = new AppVersionGuard();
    expect(
      guard.canActivate(ctx({ 'x-portal': 'student', 'x-app-version': '2.0.0' })),
    ).toBe(true);
  });

  it('rejects an outdated native app with 426', () => {
    process.env.MIN_APP_VERSION = '2.0.0';
    const guard = new AppVersionGuard();

    let caught: unknown;
    try {
      guard.canActivate(ctx({ 'x-portal': 'student', 'x-app-version': '1.9.0' }));
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(HttpException);
    expect((caught as HttpException).getStatus()).toBe(426);
  });

  it('rejects a native app that sends no version once a floor is set', () => {
    process.env.MIN_APP_VERSION = '2.0.0';
    const guard = new AppVersionGuard();
    expect(() =>
      guard.canActivate(ctx({ 'x-portal': 'student' })),
    ).toThrow(HttpException);
  });
});
```

- [ ] **Step 2: Test yiqilishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/common/app-version/app-version.guard.spec.ts
```

Kutilgan: `Cannot find module './app-version.guard'`.

- [ ] **Step 3: Guard'ni yozish**

`server/src/common/app-version/app-version.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { isBelowMinVersion } from './app-version.util';

/**
 * Eski native build'ni jim qulash o'rniga «yangilang» javobiga yo'naltiradi.
 *
 * NEGA FAQAT NATIVE: brauzer har yuklashda eng so'nggi kodni oladi, ya'ni web
 * portal hech qachon eskirmaydi. Native build esa telefonda qotib qoladi va
 * ilgari yangi backend bilan butunlay qulagan.
 *
 * NEGA STANDART HOLATDA O'CHIQ: bugungi 1.0.0 `X-App-Version` yubormaydi.
 * `MIN_APP_VERSION` qo'yilmaguncha guard hech kimga tegmaydi — gate yangi
 * build o'quvchilarga yetib borgandan KEYIN, Railway'dan qo'lda yoqiladi.
 *
 * NestJS'da 426 uchun tayyor exception klassi yo'q, shuning uchun xom
 * HttpException.
 */
@Injectable()
export class AppVersionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const headers = req.headers ?? {};

    const portal = String(headers['x-portal'] ?? '').trim().toLowerCase();
    if (portal !== 'student') return true;

    const actual = headers['x-app-version'] as string | undefined;
    const min = process.env.MIN_APP_VERSION;

    if (isBelowMinVersion(actual, min)) {
      throw new HttpException(
        {
          statusCode: 426,
          error: 'Upgrade Required',
          message: 'Ilovaning yangi versiyasi chiqdi. Iltimos, yangilang.',
        },
        426,
      );
    }
    return true;
  }
}
```

- [ ] **Step 4: Testlar o'tishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest src/common/app-version/
```

Kutilgan: ikkala fayldagi barcha testlar PASS.

- [ ] **Step 5: Guard'ni global ro'yxatdan o'tkazish**

`server/src/app.module.ts`, `providers` massivida hozir shunday tartib bor: `JwtAuthGuard`, keyin `BranchScopeGuard`. `AppVersionGuard` ni **ularning oldiga** qo'ying:

```ts
    {
      // Runs BEFORE JwtAuthGuard: an outdated build must be told to update even
      // when its token has expired, otherwise it sees 401 and shows a login
      // screen it can no longer complete.
      provide: APP_GUARD,
      useClass: AppVersionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
```

Import qo'shing:

```ts
import { AppVersionGuard } from './common/app-version/app-version.guard';
```

- [ ] **Step 6: Butun server to'plamini yurgizish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npx jest
```

Kutilgan: barcha testlar PASS. Global guard qo'shildi — hech bir mavjud test yiqilmasligi kerak, chunki `MIN_APP_VERSION` testlarda belgilanmagan.

- [ ] **Step 7: Server ishga tushishini tasdiqlash**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
npm run build
```

Kutilgan: build muvaffaqiyatli.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/common/app-version/ server/src/app.module.ts
git commit -m "Answer outdated native builds with 426 instead of letting them break"
```

---

### Task 5: Ilova versiyasini yuboradi va 426 ni ushlaydi

**Files:**
- Modify: `student-app/src/api/client.ts`
- Create: `student-app/src/app/update-required.tsx`
- Modify: `student-app/src/app/_layout.tsx`

**Interfaces:**
- Consumes: server 426 javobi (Task 4)
- Produces: `useUpdateGate` zustand store'i (`src/api/client.ts` dan eksport) — `{ blocked: boolean; block: () => void }`

**Ilovada test yo'q** — tekshiruv `tsc` va qo'lda.

- [ ] **Step 1: Header qo'shish**

`student-app/src/api/client.ts`, hozirgi kod:

```ts
export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 20_000,
  headers: { 'X-Portal': 'student' },
});
```

Almashtiring:

```ts
import Constants from 'expo-constants';

export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 20_000,
  headers: {
    'X-Portal': 'student',
    // Lets the server answer an outdated build with 426 instead of letting it
    // fail in confusing ways. Inert until MIN_APP_VERSION is set server-side.
    'X-App-Version': Constants.expoConfig?.version ?? '0.0.0',
  },
});
```

`expo-constants` allaqachon loyiha bog'liqligi (`src/lib/push.ts` uni ishlatadi) — yangi paket qo'shilmaydi.

- [ ] **Step 2: Bloklash bayrog'i uchun store**

`client.ts` ga qo'shing (fayl boshida, `api` dan oldin):

```ts
import { create } from 'zustand';

/**
 * Set once the server answers 426. One-way: an app that learned it is outdated
 * stays blocked until it is actually updated and relaunched.
 */
export const useUpdateGate = create<{ blocked: boolean; block: () => void }>(
  (set) => ({
    blocked: false,
    block: () => set({ blocked: true }),
  }),
);
```

- [ ] **Step 3: 426 ni interceptor'da ushlash**

Mavjud javob interceptor'i 401 ni qayta ishlaydi. 426 ni **401 tekshiruvidan oldin** qo'shing:

```ts
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 426) {
      useUpdateGate.getState().block();
      return Promise.reject(error);
    }

    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      // ...mavjud kod o'zgarishsiz
```

**Nega 401 dan oldin:** aks holda eski build 426 ni olib, uni token muammosi deb o'ylab, cheksiz refresh urinishiga tushib qolardi.

- [ ] **Step 4: Bloklovchi ekran**

`student-app/src/app/update-required.tsx`:

```tsx
import { Linking, View } from 'react-native';
import { Button, EmptyState, Screen, Text } from '@/design/components';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=uz.dafzentrum.student';

/**
 * Shown INSTEAD of the whole app once the server reports the build is too old.
 * Deliberately has no dismiss path: every API call would fail anyway, so
 * letting the student back in would only produce broken screens.
 */
export default function UpdateRequired() {
  return (
    <Screen className="justify-center px-6">
      <View className="gap-6">
        <EmptyState
          icon="cloud-download-outline"
          title="Ilovaning yangi versiyasi chiqdi"
          description="Davom etish uchun ilovani yangilang."
        />
        <Button
          label="Yangilash"
          iconBefore="download"
          onPress={() => Linking.openURL(PLAY_URL).catch(() => {})}
        />
      </View>
    </Screen>
  );
}
```

- [ ] **Step 5: Root layout'da ko'rsatish**

`student-app/src/app/_layout.tsx` da, `ready` tekshiruvidan **keyin** lekin `Stack` dan oldin:

```tsx
import { useUpdateGate } from '@/api/client';
import UpdateRequired from './update-required';

// ...komponent ichida:
  const blocked = useUpdateGate((s) => s.blocked);

// ...JSX ichida, mavjud `!ready ? (...) : (` shoxidan keyin:
            {!ready ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
                <ActivityIndicator color={tokens.color.primary} />
              </View>
            ) : blocked ? (
              <UpdateRequired />
            ) : (
              <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
                {/* ...mavjud Stack o'zgarishsiz */}
              </Stack>
            )}
```

**Diqqat:** `update-required.tsx` `src/app/` ichida joylashgani uchun expo-router uni route sifatida ham ro'yxatga oladi. Bu zararsiz — unga hech kim navigatsiya qilmaydi va u to'g'ridan-to'g'ri komponent sifatida chizilyapti.

- [ ] **Step 6: Tip tekshiruvi va lint**

```bash
cd /Users/a1111/Desktop/daf-erp-system/student-app
npx tsc --noEmit && npx expo lint
```

Kutilgan: 0 xato.

- [ ] **Step 7: Gate'ni qo'lda sinash**

Lokal serverni ishga tushiring va **vaqtincha** yuqori chegara qo'ying:

```bash
cd /Users/a1111/Desktop/daf-erp-system/server
MIN_APP_VERSION=99.0.0 npm run start:dev
```

Ilovani lokal serverga qaratib oching (`.env` da `EXPO_PUBLIC_API_URL=http://<LAN-ip>:4000/api`).

Kutilgan: birinchi API so'rovidayoq «Ilovaning yangi versiyasi chiqdi» ekrani chiqadi, «Yangilash» tugmasi Play Market'ni ochadi.

Keyin `MIN_APP_VERSION` siz qayta ishga tushiring — ilova **odatdagidek** ishlashi kerak. Bu ikkinchi tekshiruv muhimroq: u gate'ning standart holatda o'chiqligini tasdiqlaydi.

- [ ] **Step 8: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src
git commit -m "Send the app version and show an update screen when the server rejects it"
```

---

### Task 6: PR ochish

- [ ] **Step 1: Yakuniy tekshiruv**

```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npx jest && npm run build
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit && npx expo lint
```

Kutilgan: hammasi toza.

- [ ] **Step 2: PR**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git push -u origin feat/student-app-backend-hardening
gh pr create --title "Ilova sessiyasi, to'lov manzili va versiya gate'i" --body "$(cat <<'EOF'
Dastlabki reja ro'yxatidagi uchta bajarilmagan MUST-HAVE yopildi.

**Sessiya muddati.** O'quvchi ilovadan har kuni chiqib ketardi — refresh token 24 soat yashardi. Endi native sessiya 30 kun. Muddat token ichidagi sinf belgisi orqali yuradi, chunki yangilanish portal header'ini ko'rmaydi; usiz tuzatish birinchi rotatsiyadayoq jimgina bekor bo'lardi. Admin, o'qituvchi va web student sessiyalari ataylab 24 soatligicha qoldi.

**To'lov qaytish manzili.** `returnUrl` klientdan kelib to'g'ridan-to'g'ri Payme `c=` / Click `return_url` ga tushardi va tekshirilmasdi. Endi u loyihada mavjud `isKnownPortalOrigin` tekshiruvidan o'tadi — Telegram OAuth qaytish manzili uchun ishlatiladigan o'sha himoya.

**Versiya gate.** Eski build yangi backend bilan qulash o'rniga «yangilang» ekranini ko'rsatadi.

⚠️ **Gate standart holatda O'CHIQ va bu PR hech kimni bloklamaydi.** Bugungi 1.0.0 `X-App-Version` yubormaydi; `MIN_APP_VERSION` env belgilanmaguncha guard hech kimga tegmaydi. Uni faqat shu PR'ning build'i o'quvchilarga yetib borgandan KEYIN ko'taring — merge paytida emas.

Dizayn: `docs/superpowers/specs/2026-08-19-student-app-uch-ish-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Deploy eslatmasi

1. `railway up` (server) — gate hali o'chiq, hech narsa o'zgarmaydi
2. `eas build -p android --profile production` + Play'ga yuklash
3. Build o'quvchilarga tarqalgach — **shundagina** Railway'da `MIN_APP_VERSION` ni qo'ying

## Self-Review

| Spec talabi | Task |
|---|---|
| Refresh TTL native 30 kun / web 24 soat | 1 |
| Sinf token ichida yuradi, rotatsiyada saqlanadi | 1 (Step 3, 4) |
| `buildStudentSession` har doim uzun | 1 (Step 4) |
| `returnUrl` `isKnownPortalOrigin` orqali | 2 |
| `undefined` returnUrl o'tadi | 2 (Step 1, 3) |
| `X-App-Version` header | 5 (Step 1) |
| 426 guard, native-only | 4 |
| Standart holatda o'chiq | 3 (Step 3), 4 (Step 1, 3), 5 (Step 7) |
| Header yo'q = 0.0.0 | 3 (Step 1, 3) |
| Bloklovchi «yangilang» ekrani | 5 (Step 4, 5) |
| Yangi route qo'shilmaydi | Global cheklov — guard route emas |
| Test: versiya, returnUrl, TTL | 1, 2, 3, 4 |
