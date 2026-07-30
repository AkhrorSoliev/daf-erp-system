# Telefon = login: bot xabari va ochiq kirish inputi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Telegram bot ustoz/xodimga login sifatida telefon raqamni beradi, kirish sahifasi esa istalgan formatdagi (O'zbekiston va chet el) raqamni qabul qiladi — parolni tiklash oqimi esa avvalgidek `+998` da qoladi.

**Architecture:** Uch qism. (1) Telefon normalizatsiya qoidasi `telegram/phone-utils.ts` dan `common/utils/phone.util.ts` ga ko'chadi, shunda bot va auth bir xil qoidani ishlatadi. (2) `AuthService.validateUser` shu util orqali istalgan uzunlikdagi raqamni topadi — 9 xonali, `998`+12 xonali va chet el raqamlari, plus eski username fallback. (3) Frontendlarda kirish inputidan `+998` majburlash olib tashlanadi. Bot tomonida `generateUniqueLogin` o'rniga `login = phone`, xabar matni esa ikki sahna uchun bitta testlanadigan helperga chiqariladi.

**Tech Stack:** NestJS + Prisma + Jest (server), Next.js 15 + React 19 (client), Expo + React Native (student-app). Telegraf (bot).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-30-phone-login-open-input-design.md` — qarama-qarshilik chiqsa spec ustun.
- **Migration YO'Q.** Prisma sxemasi va prod ma'lumotlari o'zgartirilmaydi. Hech qanday `prisma migrate` / `db execute` buyrug'i ishlatilmaydi.
- **Mavjud akkauntlar tegilmaydi.** Eski username (`namangantest`) bilan kirish ishlashda davom etishi shart — buni test bilan qulflaymiz.
- **Parolni tiklash oqimi tegilmaydi:** `client/src/components/auth/forgot-password-dialog.tsx`, `student-app/src/app/(auth)/forgot-password.tsx`, `server/src/auth/dto/forgot-password-request.dto.ts`, `server/src/auth/forgot-password/forgot-password.service.ts` — bu 4 fayl bu rejada O'ZGARMAYDI.
- **Uzbek Latin matn.** Barcha foydalanuvchiga ko'rinadigan matn lotin alifbosida o'zbekcha; kirill/arab harflari ishlatilmaydi.
- Server testi: `cd server && npx jest <path>`. Butun to'plam: `cd server && npm test`.
- Client tekshiruvi: `cd client && npx tsc --noEmit && npm run lint` (client'da jest yo'q — test infratuzilmasi mavjud emas, shu sababli client vazifalari tsc + lint + qo'lda tekshirish bilan yopiladi).
- Har vazifa oxirida commit. Deploy bu rejaga kirmaydi (server `railway up` qo'lda, client Vercel) — oxirida alohida hal qilinadi.

---

## File Structure

**Yaratiladi:**
- `server/src/common/utils/phone.util.ts` — telefon normalizatsiyasi (bot + auth uchun yagona qoida)
- `server/src/common/utils/phone.util.spec.ts` — shu utilning testlari (ko'chirilgan)
- `server/src/telegram/scenes/staff-credentials-message.ts` — ustoz/xodim ro'yxatdan o'tgach yuboriladigan login/parol xabari (bitta joy, ikki sahna ishlatadi)
- `server/src/telegram/scenes/staff-credentials-message.spec.ts` — shu helper testlari

**O'zgartiriladi:**
- `server/src/telegram/scenes/teacher-registration.scene.ts` — import + `login: data.phone` + yangi xabar
- `server/src/telegram/scenes/employee-registration.scene.ts` — xuddi shunday
- `server/src/telegram/scenes/student-registration.scene.ts` — faqat import yo'li
- `server/src/telegram/scenes/mock-exam-registration.scene.ts` — faqat import yo'li
- `server/src/teachers/teachers.service.ts` — admin panel orqali ustoz: `login: dto.phone`
- `server/src/auth/auth.service.ts` — `validateUser` istalgan formatdagi raqamni topadi
- `server/src/auth/auth.service.spec.ts` — yangi holatlar
- `client/src/app/(auth)/login/login-form.tsx` — ochiq input
- `client/src/app/(auth)/login/student-login-form.tsx` — ochiq input
- `student-app/src/app/(auth)/login.tsx` — 9 xona sharti olib tashlanadi
- `student-app/src/i18n/uz.ts` — kirish placeholder matni

**O'chiriladi:**
- `server/src/telegram/phone-utils.ts` (→ common/utils)
- `server/src/telegram/phone-utils.spec.ts` (→ common/utils)
- `server/src/telegram/utils/login-generator.ts` (`generateUniqueLogin` endi ishlatilmaydi)

---

## Task 1: Telefon normalizatsiyasini `common/utils` ga ko'chirish

Sof ko'chirish — mantiq o'zgarmaydi. Buni birinchi qilamiz, chunki Task 2 shu utilni import qiladi.

**Files:**
- Create: `server/src/common/utils/phone.util.ts`
- Create: `server/src/common/utils/phone.util.spec.ts`
- Delete: `server/src/telegram/phone-utils.ts`, `server/src/telegram/phone-utils.spec.ts`
- Modify: `server/src/telegram/scenes/teacher-registration.scene.ts:12-15`, `server/src/telegram/scenes/employee-registration.scene.ts:12-15`, `server/src/telegram/scenes/student-registration.scene.ts:17-20`, `server/src/telegram/scenes/mock-exam-registration.scene.ts:12-15`

**Interfaces:**
- Consumes: hech narsa (birinchi vazifa)
- Produces: `server/src/common/utils/phone.util.ts` dan uch eksport:
  - `normalizeSharedPhone(raw: string): string | null`
  - `isUzbekPhone(normalized: string): boolean`
  - `SHARED_PHONE_INVALID: string`

- [ ] **Step 1: Test faylini yangi joyga ko'chirish (bu qadamda test yiqiladi)**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git mv server/src/telegram/phone-utils.spec.ts server/src/common/utils/phone.util.spec.ts
```

Keyin faylning 1-qatoridagi importni tuzatish:

```typescript
import { normalizeSharedPhone, isUzbekPhone } from './phone.util';
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/common/utils/phone.util.spec.ts`
Expected: FAIL — `Cannot find module './phone.util'`

- [ ] **Step 3: Utilni yangi joyga ko'chirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git mv server/src/telegram/phone-utils.ts server/src/common/utils/phone.util.ts
```

`git mv` fayl mazmunini o'zgarishsiz olib o'tadi — kod va mavjud izohlarga TEGILMAYDI. Faqat faylning eng yuqorisidagi izoh blokiga bitta yangi paragraf qo'shiladi: mavjud «NEGA ALOHIDA QOIDA:» paragrafidan OLDIN quyidagi ikki qatorni kiritin:

```typescript
 * NEGA `common/utils` DA: aynan shu qoida kirish (auth) tomonida ham kerak —
 * chet el raqami bilan ro'yxatdan o'tgan odam shu raqam bilan kirishi kerak.
 * Ikki joyda ikki xil normalizatsiya bo'lib ketmasligi uchun bitta manba.
 *
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/common/utils/phone.util.spec.ts`
Expected: PASS — barcha holatlar (UZ 9/12, chet el, juda qisqa/uzun → null)

- [ ] **Step 5: To'rt sahnadagi importni yangilash**

To'rt faylda ham bir xil blok bor — `'../phone-utils'` → `'../../common/utils/phone.util'`:

`server/src/telegram/scenes/teacher-registration.scene.ts`, `employee-registration.scene.ts`, `mock-exam-registration.scene.ts`, `student-registration.scene.ts`:

```typescript
import {
  normalizeSharedPhone,
  SHARED_PHONE_INVALID,
} from '../../common/utils/phone.util';
```

- [ ] **Step 6: Kompilyatsiya va butun to'plamni tekshirish**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: tsc xatosiz; barcha testlar PASS (`phone-utils` ga qolgan havola bo'lsa tsc darhol ko'rsatadi)

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/common/utils/phone.util.ts server/src/common/utils/phone.util.spec.ts \
  server/src/telegram/scenes/teacher-registration.scene.ts \
  server/src/telegram/scenes/employee-registration.scene.ts \
  server/src/telegram/scenes/student-registration.scene.ts \
  server/src/telegram/scenes/mock-exam-registration.scene.ts
git add -u server/src/telegram/phone-utils.ts server/src/telegram/phone-utils.spec.ts
git commit -m "Move phone normalization to common/utils so auth shares the bot's rule"
```

---

## Task 2: `validateUser` istalgan formatdagi raqamni topadi

Hozir chet el raqami bilan ro'yxatdan o'tgan akkaunt (`491749493338`) hech qachon kira olmaydi: `digits.length === 12 && startsWith('998')` shartiga tushmaydi, 9 xonali ham emas → `phone9 = null` → OR faqat xom satrni izlaydi.

**Files:**
- Modify: `server/src/auth/auth.service.ts:37-58` (`validateUser` boshidagi normalizatsiya + OR yig'ish)
- Test: `server/src/auth/auth.service.spec.ts:63-112` (`validateUser — phone-based login` blokiga qo'shiladi)

**Interfaces:**
- Consumes: `normalizeSharedPhone(raw: string): string | null` — `server/src/common/utils/phone.util.ts` (Task 1)
- Produces: `validateUser(login: string, password: string, allowedRoleIds?: number[] | null)` imzosi O'ZGARMAYDI — faqat ichidagi `where.OR` kengayadi

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`server/src/auth/auth.service.spec.ts` — mavjud `describe('validateUser — phone-based login', ...)` blokining ichiga, oxirgi `it` dan keyin qo'shing:

```typescript
    it('finds a foreign-number account by its stored country-coded digits', async () => {
      // normalizeSharedPhone bunday raqamni kod bilan saqlaydi (491749493338).
      // Bugungi kod uni tanimaydi — shu sabab chet el raqamli akkaunt kira olmaydi.
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('+49 174 9493338', 'x', null);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { phone: '491749493338' },
          { login: '491749493338' },
        ]),
      );
    });

    it('lets a legacy username account sign in with its phone number', async () => {
      // `namangantest` — bot username bergan eski akkaunt. Uning telefoni
      // 9 xonali saqlangan, ya'ni telefon bo'yicha topilishi SHART.
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst.mockResolvedValue({
        id: 7,
        login: 'namangantest',
        phone: '901234567',
        password: hash,
        roles: [{ role: { id: 4, name: 'Teacher' } }],
        branches: [],
        company: {},
      });

      const res = await service.validateUser('901234567', 'pass123', [4]);

      expect(res).toBeTruthy();
      const where = prisma.user.findFirst.mock.calls[0][0].where;
      expect(where.OR).toEqual(expect.arrayContaining([{ phone: '901234567' }]));
    });

    it('keeps the OR clauses deduplicated', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await service.validateUser('901234567', 'x', null);

      const where = prisma.user.findFirst.mock.calls[0][0].where;
      const seen = where.OR.map((c: any) => JSON.stringify(c));
      expect(new Set(seen).size).toBe(seen.length);
    });
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/auth/auth.service.spec.ts`
Expected: FAIL — `finds a foreign-number account...` yiqiladi, chunki `where.OR` da faqat `{ login: '+49 174 9493338' }` bo'ladi. Qolgan ikkitasi o'tishi mumkin — bu normal, ular regressiya qulfi.

- [ ] **Step 3: Minimal implementatsiya**

`server/src/auth/auth.service.ts` — faylning yuqorisiga import qo'shing:

```typescript
import { normalizeSharedPhone } from '../common/utils/phone.util';
```

`validateUser` ichidagi hozirgi blokni (identifier/digits/phone9 hisoblash va `or` yig'ish) shu bilan ALMASHTIRING:

```typescript
    const identifier = (login ?? '').trim();
    const digits = identifier.replace(/\D/g, '');
    // Bot saqlagan ko'rinishga keltiramiz: O'zbekiston → 9 xona, chet el →
    // mamlakat kodi bilan. Bir manba — common/utils/phone.util.
    const normalized = digits ? normalizeSharedPhone(digits) : null;

    // Kimligi: telefon (staff `phone`, o'quvchi `login`=telefon), yoki eski
    // username. Xom raqam ham qo'shiladi — ba'zi legacy qatorlarda telefon
    // 998 prefiksi bilan saqlangan bo'lishi mumkin.
    const candidates: Array<{ login?: string; phone?: string }> = [
      { login: identifier },
    ];
    for (const value of [normalized, digits]) {
      if (!value) continue;
      candidates.push({ phone: value }, { login: value });
    }
    // Dublikatsiz — bir xil shart ikki marta ketmasin.
    const seen = new Set<string>();
    const or = candidates.filter((clause) => {
      const key = JSON.stringify(clause);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
```

Qolgan kod (`this.prisma.user.findFirst({ where: { OR: or, ... } })`) o'zgarmaydi.

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/auth/auth.service.spec.ts`
Expected: PASS — 3 yangi test ham, mavjud 4 ta `validateUser` testi ham (`ceo` username fallback testi `expect(where.OR).toEqual([{ login: 'ceo' }])` deb qat'iy tekshiradi: `normalizeSharedPhone('')` → `null`, `digits` bo'sh, ya'ni OR faqat bir elementli qoladi).

- [ ] **Step 5: Butun server to'plamini tekshirish**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: hammasi PASS — ayniqsa `auth.controller.spec.ts` va `forgot-password` testlari (ular tegilmagan)

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "Match any-format phone on sign-in, not just Uzbek 9-digit"
```

---

## Task 3: Bot login sifatida telefon raqamni beradi

Xabar matni ustoz va xodim sahnasida bir xil — uni bitta testlanadigan helperga chiqaramiz (sahnalarni Telegraf mocklamasdan test qilish uchun yagona amaliy yo'l).

**Files:**
- Create: `server/src/telegram/scenes/staff-credentials-message.ts`
- Create: `server/src/telegram/scenes/staff-credentials-message.spec.ts`
- Modify: `server/src/telegram/scenes/teacher-registration.scene.ts:16-19` (import), `:353-357` (login), `:387-393` (xabar)
- Modify: `server/src/telegram/scenes/employee-registration.scene.ts:16-19` (import), `:358-362` (login), `:388-395` (xabar)
- Modify: `server/src/teachers/teachers.service.ts:22-24` (import), `:212-217` (login)
- Delete: `server/src/telegram/utils/login-generator.ts`

**Interfaces:**
- Consumes: hech narsa (Task 1/2 dan mustaqil)
- Produces: `buildStaffCredentialsMessage(input: { phone: string; password: string; portalUrl: string }): string` — `server/src/telegram/scenes/staff-credentials-message.ts`

- [ ] **Step 1: Yiqiladigan testni yozish**

Create `server/src/telegram/scenes/staff-credentials-message.spec.ts`:

```typescript
import { buildStaffCredentialsMessage } from './staff-credentials-message';

describe('buildStaffCredentialsMessage', () => {
  const base = {
    phone: '901234567',
    password: 'Zr24qUyG',
    portalUrl: 'https://lehrer.dafzentrum.uz',
  };

  it('login sifatida telefon raqamni ko\'rsatadi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('901234567');
    expect(text).toContain('telefon raqamingiz');
  });

  it('telefon va parolni backtick ichida beradi (Telegramda ko\'chirish uchun)', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('`901234567`');
    expect(text).toContain('`Zr24qUyG`');
  });

  it('portal havolasini Markdown ko\'rinishida beradi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text).toContain('[lehrer.dafzentrum.uz](https://lehrer.dafzentrum.uz)');
  });

  it('admin portal havolasi bilan ham ishlaydi', () => {
    const text = buildStaffCredentialsMessage({
      ...base,
      portalUrl: 'https://admin.dafzentrum.uz',
    });
    expect(text).toContain('[admin.dafzentrum.uz](https://admin.dafzentrum.uz)');
  });

  it('chet el raqamini saqlangan holicha ko\'rsatadi', () => {
    const text = buildStaffCredentialsMessage({ ...base, phone: '491749493338' });
    expect(text).toContain('`491749493338`');
  });

  it('username so\'zini ishlatmaydi', () => {
    const text = buildStaffCredentialsMessage(base);
    expect(text.toLowerCase()).not.toContain('username');
  });
});
```

- [ ] **Step 2: Testni ishga tushirib, yiqilganini ko'rish**

Run: `cd server && npx jest src/telegram/scenes/staff-credentials-message.spec.ts`
Expected: FAIL — `Cannot find module './staff-credentials-message'`

- [ ] **Step 3: Helperni yozish**

Create `server/src/telegram/scenes/staff-credentials-message.ts`:

```typescript
/**
 * Ustoz/xodim ro'yxatdan o'tgach yuboriladigan login-parol xabari.
 *
 * NEGA LOGIN = TELEFON: tizimga kirish 2026-07-15 dan beri (PR #333) barcha
 * rollarda telefon raqam bilan. Avval bot ism-familiyadan username yasab
 * («namangantest») shuni «login» deb aytardi — bot bir narsani aytib, kirish
 * sahifasi boshqasini so'rardi.
 *
 * Raqam backtick ichida — Telegramda bir tegishda ko'chiriladi. Bazada
 * saqlangan holicha ko'rsatiladi (O'zbekiston → 9 xona, chet el → mamlakat
 * kodi bilan), shunda foydalanuvchi ko'rgan narsasini aynan kiritadi.
 */
export function buildStaffCredentialsMessage(input: {
  phone: string;
  password: string;
  portalUrl: string;
}): string {
  const { phone, password, portalUrl } = input;
  const domain = portalUrl.replace('https://', '');

  return (
    "✅ Ro'yxatdan muvaffaqiyatli o'tdingiz!\n\n" +
    `📱 Sizning login (telefon raqamingiz): \`${phone}\`\n` +
    `🔑 Sizning parol: \`${password}\`\n\n` +
    '🌐 Platformaga kirish:\n' +
    `[${domain}](${portalUrl})\n\n` +
    '⚠️ Parolni eslab qoling yoki saqlang!'
  );
}
```

- [ ] **Step 4: Testni ishga tushirib, o'tganini ko'rish**

Run: `cd server && npx jest src/telegram/scenes/staff-credentials-message.spec.ts`
Expected: PASS — 6 ta test

- [ ] **Step 5: Ustoz sahnasini ulash**

`server/src/telegram/scenes/teacher-registration.scene.ts`:

Importni almashtiring (`generateUniqueLogin` endi kerak emas):

```typescript
import { generatePassword } from '../../common/utils/password.util';
import { buildStaffCredentialsMessage } from './staff-credentials-message';
```

`confirm_registration` ichida login generatsiyasini olib tashlang:

```typescript
      // Login = telefon raqam (o'quvchilarda ham shunday). Parol tasodifiy.
      const password = generatePassword();
```

`usersService.create({ ... })` chaqiruvida:

```typescript
        login: data.phone,
```

Xabarni almashtiring:

```typescript
      await ctx.replyWithPhoto(data.photo, {
        caption: buildStaffCredentialsMessage({
          phone: data.phone,
          password,
          portalUrl: 'https://lehrer.dafzentrum.uz',
        }),
        parse_mode: 'Markdown',
      });
```

- [ ] **Step 6: Xodim sahnasini ulash**

`server/src/telegram/scenes/employee-registration.scene.ts` — xuddi shu import bloki, xuddi shu `const password = generatePassword();` (login generatsiyasi o'chiriladi), `usersService.create` da `login: data.phone`, va:

```typescript
      const isTeacherOnly = roleIds.length === 1 && roleIds[0] === 4;
      const portalUrl = isTeacherOnly
        ? 'https://lehrer.dafzentrum.uz'
        : 'https://admin.dafzentrum.uz';

      await ctx.editMessageCaption('✅ Tasdiqlandi!');
      await ctx.replyWithPhoto(data.photo, {
        caption: buildStaffCredentialsMessage({
          phone: data.phone,
          password,
          portalUrl,
        }),
        parse_mode: 'Markdown',
      });
```

- [ ] **Step 7: Admin panel orqali ustoz yaratishni ulash**

`server/src/teachers/teachers.service.ts` — 22-25 qatordagi import blokini almashtiring (hozir ikkisi ham `login-generator` dan olinadi):

```typescript
import { generatePassword } from '../common/utils/password.util';
```

`create` metodida login generatsiyasini olib tashlang:

```typescript
    // Login = telefon raqam. Yuqorida shu telefon band emasligi tekshirilgan.
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);
```

`prisma.user.create` ning `data` obyektida:

```typescript
        login: dto.phone,
```

- [ ] **Step 8: `login-generator.ts` ni o'chirish**

```bash
cd /Users/a1111/Desktop/daf-erp-system
grep -rn "login-generator\|generateUniqueLogin" server/src
```

Expected: hech qanday natija yo'q. Shundan keyin:

```bash
git rm server/src/telegram/utils/login-generator.ts
```

- [ ] **Step 9: Kompilyatsiya va butun to'plamni tekshirish**

Run: `cd server && npx tsc --noEmit && npm test`
Expected: tsc xatosiz, barcha testlar PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add server/src/telegram/scenes/staff-credentials-message.ts \
  server/src/telegram/scenes/staff-credentials-message.spec.ts \
  server/src/telegram/scenes/teacher-registration.scene.ts \
  server/src/telegram/scenes/employee-registration.scene.ts \
  server/src/teachers/teachers.service.ts
git add -u server/src/telegram/utils/login-generator.ts
git commit -m "Hand out the phone number as the staff login, not a generated username"
```

---

## Task 4: Web kirish inputini ochish

`+998` addon va `formatPhoneInput` chet el raqamiga to'g'ri kelmaydi — `slice(-9)` mamlakat kodini tashlab ketadi. Ikki forma bor: umumiy (admin/lehrer) va Lumio (o'quvchi kabineti).

**Files:**
- Modify: `client/src/app/(auth)/login/login-form.tsx:60-64` (yuborilayotgan qiymat), `:113-133` (input)
- Modify: `client/src/app/(auth)/login/student-login-form.tsx:29-33` (yuborilayotgan qiymat), `:82-95` (input)
- Tegilmaydi: `client/src/components/auth/forgot-password-dialog.tsx` (`+998` o'z joyida qoladi)

**Interfaces:**
- Consumes: `POST /auth/login { login, password }` — server endi xom satrni normallashtiradi (Task 2)
- Produces: UI o'zgarishi; boshqa vazifalar bunga tayanmaydi

- [ ] **Step 1: Umumiy formadan `+998` majburlashni olib tashlash**

`client/src/app/(auth)/login/login-form.tsx` — `handleSubmit` ichida:

```typescript
    // Raqamni serverga YOZILGANIDEK yuboramiz: normalizatsiya (O'zbekiston →
    // 9 xona, chet el → kod bilan) serverda, common/utils/phone.util da.
    // Klientda kesish chet el raqamining mamlakat kodini yo'q qilardi.
    const loginValue = login.trim();
```

Input blokini almashtiring:

```tsx
        <div className="space-y-2">
          <label htmlFor="login" className="text-sm font-medium">
            Telefon raqam
          </label>
          <div className="flex">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
              +
            </span>
            <input
              id="login"
              type="text"
              autoComplete="username"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="998 90 123 45 67"
              inputMode="tel"
              className="flex h-10 w-full rounded-r-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
        </div>
```

`maxLength` va `formatPhoneInput` chaqiruvi yo'qoladi. Fayl boshidagi `import { formatPhoneInput } from "@/lib/format-utils";` qatorini o'chiring (bu faylda boshqa ishlatilmaydi — `grep -n formatPhoneInput` bilan tasdiqlang).

- [ ] **Step 2: Lumio (o'quvchi) formasini xuddi shunday ochish**

`client/src/app/(auth)/login/student-login-form.tsx` — `handleSubmit` ichida:

```typescript
    // Normalizatsiya serverda (common/utils/phone.util) — bu yerda kesmaymiz.
    const loginValue = login.trim();
```

Input:

```tsx
        <Field label="Telefon raqam">
          <Input
            addon="+"
            type="text"
            inputMode="tel"
            autoComplete="username"
            required
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="998 90 123 45 67"
          />
        </Field>
```

Fayl boshidagi `import { formatPhoneInput } from "@/lib/format-utils";` qatorini o'chiring.

- [ ] **Step 3: Tiklash dialogi tegilmaganini tasdiqlash**

Run: `cd /Users/a1111/Desktop/daf-erp-system && git diff --name-only client/`
Expected: faqat ikki fayl — `login-form.tsx` va `student-login-form.tsx`. `forgot-password-dialog.tsx` ro'yxatda BO'LMASLIGI kerak.

- [ ] **Step 4: Kompilyatsiya va lint**

Run: `cd client && npx tsc --noEmit && npm run lint`
Expected: xatosiz. `formatPhoneInput` ishlatilmayotgan import qolib ketsa lint aytadi.

- [ ] **Step 5: Qo'lda tekshirish**

Run: `cd client && npm run dev` (server ham ishlab turishi kerak: `cd server && npm run start:dev`)

`http://localhost:3000/login` da tekshiring:
1. Input **bo'sh** ochiladi, chapda faqat `+` turadi.
2. `972062922` (9 xona) → kiradi.
3. `998972062922` → xuddi shu akkauntga kiradi.
4. Parolni unutdingizmi? → dialogda `+998` avvalgidek turadi va 9 xona formatlanadi.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add client/src/app/\(auth\)/login/login-form.tsx client/src/app/\(auth\)/login/student-login-form.tsx
git commit -m "Open the web sign-in phone field: bare + prefix, no 9-digit slicing"
```

---

## Task 5: Native ilova kirish ekranini ochish

**Files:**
- Modify: `student-app/src/app/(auth)/login.tsx:116` (submit sharti), `:131-138` (input)
- Modify: `student-app/src/i18n/uz.ts:15` (placeholder)
- Tegilmaydi: `student-app/src/app/(auth)/forgot-password.tsx`

**Interfaces:**
- Consumes: `login(phone: string, password: string)` — `student-app/src/api/auth.ts` (imzo o'zgarmaydi)
- Produces: UI o'zgarishi

- [ ] **Step 1: Placeholder matnini yangilash**

`student-app/src/i18n/uz.ts` (15-qator):

```typescript
    phonePlaceholder: '998 90 123 45 67',
```

- [ ] **Step 2: 9 xona shartini olib tashlash**

`student-app/src/app/(auth)/login.tsx` — `canSubmit`:

```typescript
  // Chet el raqamlari ham qabul qilinadi (E.164 → 8..15 raqam), shu sababli
  // aynan 9 xona talab qilinmaydi. Normalizatsiya serverda.
  const canSubmit = phone.replace(/\D/g, '').length >= 8 && password.length >= 1;
```

Input:

```tsx
            <Input
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder={t.auth.phonePlaceholder}
              autoCapitalize="none"
            />
```

- [ ] **Step 3: Tiklash ekrani tegilmaganini tasdiqlash**

Run: `cd /Users/a1111/Desktop/daf-erp-system && git diff --name-only student-app/`
Expected: faqat `src/app/(auth)/login.tsx` va `src/i18n/uz.ts`. `forgot-password.tsx` ro'yxatda BO'LMASLIGI kerak.

- [ ] **Step 4: Kompilyatsiya va lint**

Run: `cd student-app && npx tsc --noEmit && npm run lint`
Expected: xatosiz

- [ ] **Step 5: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system
git add student-app/src/app/\(auth\)/login.tsx student-app/src/i18n/uz.ts
git commit -m "Accept any-format phone on the native sign-in screen"
```

---

## Task 6: Yakuniy tekshiruv

**Files:** hech narsa o'zgartirilmaydi — faqat tasdiqlash

- [ ] **Step 1: Butun server to'plamini ishga tushirish**

Run: `cd server && npm test 2>&1 | tail -20`
Expected: barcha suite PASS, yiqilgan test yo'q. Natijani (`Tests: N passed`) yozib qo'ying.

- [ ] **Step 2: Barcha loyihalarni kompilyatsiya qilish**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system/server && npx tsc --noEmit
cd /Users/a1111/Desktop/daf-erp-system/client && npx tsc --noEmit
cd /Users/a1111/Desktop/daf-erp-system/student-app && npx tsc --noEmit
```
Expected: uchtasi ham xatosiz

- [ ] **Step 3: Taqiqlangan fayllar tegilmaganini tasdiqlash**

Run:
```bash
cd /Users/a1111/Desktop/daf-erp-system
git diff --stat HEAD~5 -- \
  client/src/components/auth/forgot-password-dialog.tsx \
  'student-app/src/app/(auth)/forgot-password.tsx' \
  server/src/auth/dto/forgot-password-request.dto.ts \
  server/src/auth/forgot-password/forgot-password.service.ts \
  server/prisma/schema.prisma
```
Expected: **bo'sh natija** — bu 5 fayl bu rejada o'zgarmasligi kerak

- [ ] **Step 4: Eski username fallback hali ishlayotganini kod darajasida tasdiqlash**

Run: `cd server && npx jest src/auth/auth.service.spec.ts -t "legacy username"`
Expected: PASS — `namangantest` kabi akkauntlar tizimdan tushib qolmagani shu bilan qulflanadi

- [ ] **Step 5: Migration qo'shilmaganini tasdiqlash**

Run: `cd /Users/a1111/Desktop/daf-erp-system && git status --short server/prisma/`
Expected: bo'sh — yangi migration papkasi yo'q

---

## Joylashtirish (rejadan tashqari, alohida qadam)

Kod tayyor bo'lgach:
- Server: `cd server && railway up` — **qo'lda** (backend GitHub'ga ulanmagan, main'ga merge deploy qilmaydi). Aloqasi yo'q WIP skriptlarni oldin `git stash` qilish kerak.
- Client: Vercel.
- Native student-app: alohida build, bu relizga bog'lanmaydi.
- Deploy'dan keyin qo'lda tekshirish: bot orqali test ustoz ro'yxatdan o'tkazib, xabarda telefon raqam kelishini va shu raqam bilan `lehrer.dafzentrum.uz` ga kirilishini tasdiqlash.
