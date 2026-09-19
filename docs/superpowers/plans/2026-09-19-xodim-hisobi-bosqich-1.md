# Xodim hisobi — 1-bosqich: qoidalar

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O'quvchi bo'lib yurgan odam yoki hisobi o'chirilgan sobiq xodim bot havolasidan (va admin «O'qituvchi qo'shish» dan) xodim bo'lib o'ta oladi; bitta telefonga ikkinchi ishlab turgan xodim hisobi ochilmaydi; bot begona kontakt kartasini qabul qilmaydi; har parol tiklash jurnalga tushadi.

**Architecture:** Ikki sof yordamchi — `contactBelongsToSender` (Telegram kontakt egaligi) va `findLiveStaffByPhone` / `loginForPhone` (telefon va kirish nomi qoidalari) — bitta joyda yoziladi va to'rt sahna + uch servisdan chaqiriladi. Qoidaning kafolati `UsersService.create` da (admin formasi ham, bot ham shu yerdan o'tadi) va `TeachersService.create` da; bot sahnasidagi tekshiruv faqat erta, rasm yuklashdan oldingi UX. Baza migratsiyasi yo'q, klient o'zgarmaydi.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL/Neon), Telegraf sahnalari, jest (`ts-jest`).

## Global Constraints

- Dizayn: `docs/superpowers/specs/2026-09-19-xodim-hisobi-va-telegram-design.md`. Ziddiyat chiqsa dizayn ustun.
- **Xodim rollari** = `[1, 2, 3, 4, 5]` (CEO, Filial direktori, Administrator, O'qituvchi, Kassir). O'quvchi roli `6` xodim emas. Bu ro'yxat faqat `server/src/common/auth/phone-account-rules.ts` da yoziladi.
- **Kontakt qoidasi:** `contact.user_id` YO'Q bo'lsa ham rad etiladi. «Yo'q» — «isbotlanmagan».
- **Kirish nomi hech qachon uydirilmaydi** (`phone_2`, `phone_teacher` va h.k. yo'q) — bo'sh bo'lsa `null`.
- Baza sxemasi va migratsiyalarga tegilmaydi. Klientga tegilmaydi.
- Barcha yangi izohlar **lotin alifbosidagi o'zbekcha**, NEGA ekanini tushuntiradi. Test nomlari ham o'zbekcha (mavjud fayllarda inglizcha bo'lsa, yangilari o'zbekcha bo'laveradi).
- Kod ichida haqiqiy telefon, ism yoki prod ID yozilmaydi; misollar uydirma (`901112233`, `Nodira Yusupova`).
- Buyruqlar `server/` katalogidan: bitta spec — `npx jest <yo'l>`; tip — `npm run typecheck`; hammasi — `npm test`.
- Har testdan oldin `npx prisma generate` bir marta bajarilgan bo'lishi kerak (worktree'da bajarilgan).
- `git reset --hard` va yalang'och `git stash` ishlatilmaydi.
- Commit xabari o'zbekcha, oxirida `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

| Fayl | Vazifasi |
| --- | --- |
| `server/src/telegram/utils/contact-ownership.ts` | `contactBelongsToSender`, `CONTACT_NOT_OWN` — kontakt egaligi (yangi) |
| `server/src/telegram/utils/contact-ownership.spec.ts` | Uning testlari (yangi) |
| `server/src/common/auth/phone-account-rules.ts` | `STAFF_ROLE_IDS`, `findLiveStaffByPhone`, `loginForPhone` (yangi) |
| `server/src/common/auth/phone-account-rules.spec.ts` | Uning testlari (yangi) |
| `server/src/telegram/scenes/employee-registration.scene.ts` | Kontakt egaligi, faqat tirik xodim to'xtatadi, kirish nomi qoidasi |
| `server/src/telegram/scenes/employee-registration.scene.spec.ts` | Kontakt qadami va kirish nomi testlari |
| `server/src/telegram/scenes/password-reset.scene.ts` | Kontakt egaligi — yarim tekshiruv to'liqqa |
| `server/src/telegram/scenes/password-reset.scene.spec.ts` | Yangi — kontakt orqali bog'lanish testlari |
| `server/src/telegram/scenes/student-registration.scene.ts` | Kontakt egaligi |
| `server/src/telegram/scenes/student-registration.scene.spec.ts` | Yangi — kontakt qadami testlari |
| `server/src/telegram/scenes/mock-exam-registration.scene.ts` | Kontakt egaligi |
| `server/src/telegram/scenes/mock-exam-registration.scene.spec.ts` | Yangi — kontakt qadami testi |
| `server/src/teachers/teachers.service.ts` | `create`: faqat tirik xodim to'xtatadi, kirish nomi qoidasi |
| `server/src/teachers/teachers.service.spec.ts` | `create` testlari |
| `server/src/users/users.service.ts` | `create`: bitta telefonga bitta xodim hisobi (kafolat) |
| `server/src/users/users-self-registration.spec.ts` | Kafolat testlari |
| `server/src/students/students-write.service.ts` | `createStudentUser`: kirish nomi qoidasi |
| `server/src/students/students.service.spec.ts` | `createStudentUser` testlari |
| `server/src/telegram/scenes/student-registration-flow.ts` | Kirish nomi qoidasi |
| `server/src/telegram/scenes/student-registration-flow.spec.ts` | Testi |
| `server/src/common/password-reset/portal-password-reset.service.ts` | Xodim parol tiklashi jurnalga |
| `server/src/common/password-reset/portal-password-reset.service.spec.ts` | Testi |
| `server/CLAUDE.md`, `server/src/auth/auth.service.ts`, `server/src/auth/telegram-oauth/telegram-oauth.service.ts`, `server/src/common/password-reset/portal-password-reset.service.ts` | «login unique emas» degan noto'g'ri gap tuzatiladi |
| `docs/adr/0021-bir-odam-har-rolga-alohida-hisob.md`, `docs/adr/README.md` | ADR |

---

## Task 1: Kontakt egaligi yordamchisi

**Files:**
- Create: `server/src/telegram/utils/contact-ownership.ts`
- Test: `server/src/telegram/utils/contact-ownership.spec.ts`

**Interfaces:**
- Produces: `contactBelongsToSender(contact: { user_id?: number }, from: { id: number } | undefined): boolean`; `CONTACT_NOT_OWN: string` (foydalanuvchiga xabar).

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/telegram/utils/contact-ownership.spec.ts`:

```ts
import { contactBelongsToSender, CONTACT_NOT_OWN } from './contact-ownership';

describe('contactBelongsToSender', () => {
  const me = { id: 4242 };

  it("«Telefon raqamni yuborish» tugmasidan kelgan o'z kontaktini qabul qiladi", () => {
    expect(contactBelongsToSender({ user_id: 4242 }, me)).toBe(true);
  });

  it('boshqa odamning kontakt kartasini rad etadi', () => {
    expect(contactBelongsToSender({ user_id: 1 }, me)).toBe(false);
  });

  it("user_id'siz kartani rad etadi — raqam isbotlanmagan", () => {
    expect(contactBelongsToSender({}, me)).toBe(false);
  });

  it("yuboruvchi noma'lum bo'lsa rad etadi", () => {
    expect(contactBelongsToSender({ user_id: 4242 }, undefined)).toBe(false);
  });

  it('xabar tugmani nomi bilan aytadi', () => {
    expect(CONTACT_NOT_OWN).toContain('Telefon raqamni yuborish');
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/telegram/utils/contact-ownership.spec.ts`
Expected: FAIL — `Cannot find module './contact-ownership'`

- [ ] **Step 3: Yordamchini yozish**

`server/src/telegram/utils/contact-ownership.ts`:

```ts
/**
 * Botga kelgan kontakt aynan yuborgan odamning o'ziniki ekanini aytadi.
 *
 * NEGA: «📱 Telefon raqamni yuborish» tugmasi Telegramning o'zi tasdiqlagan
 * raqamni `user_id` bilan birga yuboradi. Lekin odam istalgan kontakt
 * kartasini ham yuborishi mumkin — begona raqam bilan, `user_id`siz yoki
 * boshqa `user_id` bilan. Shunday kartani qabul qilish begonaning raqami
 * bilan ro'yxatdan o'tish yoki begona o'quvchining hisobini o'ziga bog'lab
 * parolini olish yo'lini ochadi. Shuning uchun `user_id` YO'Q bo'lsa ham
 * rad etiladi — «yo'q» degani «isbotlanmagan» degani.
 */
export const CONTACT_NOT_OWN =
  "Iltimos, faqat o'zingizning raqamingizni «📱 Telefon raqamni yuborish» tugmasi orqali yuboring.";

export function contactBelongsToSender(
  contact: { user_id?: number | null },
  from: { id: number } | undefined,
): boolean {
  if (!from) return false;
  if (contact.user_id === undefined || contact.user_id === null) return false;
  return contact.user_id === from.id;
}
```

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/telegram/utils/contact-ownership.spec.ts`
Expected: PASS (5 ta test)

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/utils/contact-ownership.ts server/src/telegram/utils/contact-ownership.spec.ts
git commit -m "Bot kontakti yuboruvchiniki ekanini aytadigan yordamchi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Telefon va kirish nomi qoidalari yordamchisi

**Files:**
- Create: `server/src/common/auth/phone-account-rules.ts`
- Test: `server/src/common/auth/phone-account-rules.spec.ts`

**Interfaces:**
- Produces: `STAFF_ROLE_IDS: readonly [1,2,3,4,5]`; `findLiveStaffByPhone(prisma, phone): Promise<{ id: number; firstName: string; lastName: string } | null>`; `loginForPhone(prisma, phone): Promise<string | null>`.

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/common/auth/phone-account-rules.spec.ts`:

```ts
import {
  findLiveStaffByPhone,
  loginForPhone,
  STAFF_ROLE_IDS,
} from './phone-account-rules';

function buildPrisma(findFirst: jest.Mock) {
  return { user: { findFirst } } as any;
}

describe('STAFF_ROLE_IDS', () => {
  it("o'quvchi roli (6) xodim emas", () => {
    expect([...STAFF_ROLE_IDS]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('findLiveStaffByPhone', () => {
  it('faqat tirik va xodim rolli hisobni qidiradi', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 10, firstName: 'Nodira', lastName: 'Yusupova' });

    const hit = await findLiveStaffByPhone(buildPrisma(findFirst), '901112233');

    expect(hit).toEqual({ id: 10, firstName: 'Nodira', lastName: 'Yusupova' });
    const { where, select } = findFirst.mock.calls[0][0];
    expect(where.phone).toBe('901112233');
    expect(where.deletedAt).toBeNull();
    expect(where.roles).toEqual({ some: { roleId: { in: [1, 2, 3, 4, 5] } } });
    expect(select).toEqual({ id: true, firstName: true, lastName: true });
  });

  it("topilmasa null", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    expect(await findLiveStaffByPhone(buildPrisma(findFirst), '901112233')).toBeNull();
  });
});

describe('loginForPhone', () => {
  it("nom bo'sh bo'lsa telefonni qaytaradi", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    expect(await loginForPhone(buildPrisma(findFirst), '901112233')).toBe('901112233');
    expect(findFirst.mock.calls[0][0].where).toEqual({
      login: '901112233',
      deletedAt: null,
    });
  });

  it('nom tirik hisobda band bo'lsa null — hech narsa uydirilmaydi', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 5 });
    expect(await loginForPhone(buildPrisma(findFirst), '901112233')).toBeNull();
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/common/auth/phone-account-rules.spec.ts`
Expected: FAIL — `Cannot find module './phone-account-rules'`

- [ ] **Step 3: Yordamchini yozish**

`server/src/common/auth/phone-account-rules.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Tizimga kira oladigan xodim rollari: CEO, Filial direktori, Administrator,
 * O'qituvchi, Kassir. O'quvchi (6) bu yerda YO'Q — o'quvchi hisobi xodim
 * hisobi bilan bitta telefonda yonma-yon yashaydi (ADR-0021).
 */
export const STAFF_ROLE_IDS = [1, 2, 3, 4, 5] as const;

export interface LiveStaffMatch {
  id: number;
  firstName: string;
  lastName: string;
}

/**
 * Shu telefon bilan ISHLAB TURGAN xodim hisobi bormi.
 *
 * NEGA faqat xodim va faqat tirik: bir odam o'quvchi ham, xodim ham bo'la
 * oladi — bu ikkita alohida hisob, bitta telefon. O'quvchi hisobi xodim
 * ochilishiga to'sqinlik qilmaydi. O'chirilgan hisob ham qilmaydi — baza
 * o'chirilganning nomini bo'shatadi (`User_login_key` faqat tirik qatorlarga).
 * Lekin bitta portalda bitta telefonga IKKI xodim hisobi bo'lsa, SMS orqali
 * parol tiklash va Telegram bilan kirish qaysi biri ekanini bilmay qoladi —
 * shuning uchun ikkinchisi ochilmaydi, admin mavjud hisobga rol qo'shadi.
 */
export async function findLiveStaffByPhone(
  prisma: PrismaService,
  phone: string,
): Promise<LiveStaffMatch | null> {
  return prisma.user.findFirst({
    where: {
      phone,
      deletedAt: null,
      roles: { some: { roleId: { in: [...STAFF_ROLE_IDS] } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

/**
 * Yangi hisobga yoziladigan kirish nomi: telefon, agar u bo'sh bo'lsa; aks
 * holda hech narsa.
 *
 * NEGA: `User.login` tirik qatorlar orasida unique (migratsiya
 * `20260327021835_add_soft_delete_fields`, qisman indeks — Prisma sxemasi
 * buni ifodalay olmaydi, shuning uchun sxemada ko'rinmaydi). Bir odamning
 * o'quvchi hisobida nom = telefon bo'lsa, xodim hisobiga ham shu nomni
 * yozish bazada rad etilardi. Kirish baribir telefon bo'yicha ishlaydi
 * (`AuthService.buildAccountLookup` `phone` ustunini ham qaraydi), nom —
 * eski qoldiq. Uydirma nom (`phone_2`) yozilmaydi: hech kim uni bilmaydi.
 */
export async function loginForPhone(
  prisma: PrismaService,
  phone: string,
): Promise<string | null> {
  const taken = await prisma.user.findFirst({
    where: { login: phone, deletedAt: null },
    select: { id: true },
  });
  return taken ? null : phone;
}
```

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/common/auth/phone-account-rules.spec.ts`
Expected: PASS (5 ta test)

- [ ] **Step 5: Commit**

```bash
git add server/src/common/auth/phone-account-rules.ts server/src/common/auth/phone-account-rules.spec.ts
git commit -m "Telefonga bitta xodim hisobi va kirish nomi qoidalari — bitta joyda

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: Bot xodim sahnasi — kontakt, telefon, kirish nomi

**Files:**
- Modify: `server/src/telegram/scenes/employee-registration.scene.ts:17-20` (importlar), `:189-222` (kontakt qadami), `:373-384` (yaratish)
- Test: `server/src/telegram/scenes/employee-registration.scene.spec.ts`

**Interfaces:**
- Consumes: `contactBelongsToSender`, `CONTACT_NOT_OWN` (Task 1); `findLiveStaffByPhone`, `loginForPhone` (Task 2).

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`employee-registration.scene.spec.ts` da importga qo'shing:

```ts
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
```

`buildScene` ni prisma qabul qiladigan qiling (eski `{} as any // prisma` qatori o'rniga):

```ts
function buildPrisma(findFirst?: jest.Mock) {
  return {
    user: { findFirst: findFirst ?? jest.fn().mockResolvedValue(null) },
  } as any;
}

function buildScene(
  usersService: { create: jest.Mock },
  prisma: any = buildPrisma(),
) {
  return createEmployeeRegistrationScene(
    prisma,
    { deleteFile: jest.fn() } as any,
    usersService as any,
    {} as any, // bot — unused (`_bot`)
  );
}
```

Kontakt xabari uchun harness (`buildConfirmCtx` yonida):

```ts
/**
 * Kontakt qadami (`step 3`): odam «📱 Telefon raqamni yuborish» tugmasini
 * bosdi yoki istalgan kontakt kartasini yubordi. `from.id` — yuboruvchi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 2,
    message: {
      message_id: 2,
      date: 0,
      chat: { id: 555222, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'T' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 3,
    data: { branchId: 7, roleIds: [4] },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}
```

Fayl oxiriga ikki `describe`:

```ts
describe('employee-registration.scene — kontakt qadami', () => {
  const OWN = { phone_number: '+998901112233', first_name: 'T', user_id: 999 };

  it("begona kontakt kartasi (boshqa user_id) rad etiladi, baza so'ralmaydi", async () => {
    const prisma = buildPrisma();
    const scene = buildScene({ create: jest.fn() }, prisma);
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
    expect(ctx.scene.leave).not.toHaveBeenCalled();
  });

  it("user_id'siz karta ham rad etiladi", async () => {
    const prisma = buildPrisma();
    const scene = buildScene({ create: jest.fn() }, prisma);
    const ctx = buildContactCtx({ phone_number: '+998901112233', first_name: 'T' });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
  });

  it("o'quvchi hisobidagi raqam xodim bo'lishga to'sqinlik qilmaydi", async () => {
    // Rolsiz so'rov bu raqamda o'quvchi hisobini topardi; xodim roli bilan
    // so'ralsa — yo'q. Sahna aynan xodim roli bilan so'rashi kerak.
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: any) =>
        Promise.resolve(where.roles ? null : { id: 10018 }),
      );
    const scene = buildScene({ create: jest.fn() }, buildPrisma(findFirst));
    const ctx = buildContactCtx(OWN);

    await scene.middleware()(ctx, async () => {});

    expect(findFirst.mock.calls[0][0].where.roles).toBeDefined();
    expect(ctx.session.step).toBe(4);
    expect(ctx.session.data.phone).toBe('901112233');
    expect(ctx.scene.leave).not.toHaveBeenCalled();
  });

  it("ishlab turgan xodim raqami to'xtatadi va adminga yo'naltiradi", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 10924, firstName: 'Nodira', lastName: 'Yusupova' });
    const scene = buildScene({ create: jest.fn() }, buildPrisma(findFirst));
    const ctx = buildContactCtx(OWN);

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toMatch(/xodim hisobi allaqachon bor/);
    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(ctx.session.step).toBe(3);
  });
});

describe('employee-registration.scene — kirish nomi', () => {
  const data = {
    firstName: 'Nodira',
    lastName: 'Yusupova',
    phone: '901112233',
    gender: 'FEMALE',
    photo: 'https://example.com/photo.jpg',
    branchId: 7,
    roleIds: [3],
  };

  it("telefon bo'sh bo'lsa kirish nomi = telefon", async () => {
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService, buildPrisma());

    await scene.middleware()(buildConfirmCtx(data), async () => {});

    expect(usersService.create.mock.calls[0][0].login).toBe('901112233');
  });

  it("telefon boshqa hisobning kirish nomi bo'lsa nom yuborilmaydi, hisob baribir ochiladi", async () => {
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: any) =>
        Promise.resolve(where.login ? { id: 10018 } : null),
      );
    const usersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const scene = buildScene(usersService, buildPrisma(findFirst));

    await scene.middleware()(buildConfirmCtx(data), async () => {});

    expect(usersService.create).toHaveBeenCalledTimes(1);
    expect(usersService.create.mock.calls[0][0].login).toBeUndefined();
    expect(usersService.create.mock.calls[0][0].phone).toBe('901112233');
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/telegram/scenes/employee-registration.scene.spec.ts`
Expected: FAIL — kontakt testlarida `ctx.reply` birinchi argumenti `CONTACT_NOT_OWN` emas; «o'quvchi raqami» testida `where.roles` undefined; kirish nomi testida `login` `'901112233'` (ikkinchisida).

- [ ] **Step 3: Sahnani o'zgartirish**

Importlarga (`SHARED_PHONE_INVALID` importidan keyin):

```ts
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
import {
  findLiveStaffByPhone,
  loginForPhone,
} from '../../common/auth/phone-account-rules';
```

Kontakt qadamida `const contact = ctx.message.contact;` dan keyin, normalizatsiyadan OLDIN:

```ts
    // Faqat odamning O'Z tasdiqlangan raqami o'tadi — begona karta bilan
    // begonaning raqamiga xodim hisobi ochib bo'lmasin.
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(
        CONTACT_NOT_OWN,
        Markup.keyboard([
          [
            Markup.button.contactRequest(
              '📱 Telefon raqamni yuborish',
            ),
          ],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }
```

`const existingUser = await prisma.user.findFirst({ where: { phone } });` bilan boshlanadigan blokni butunlay shu bilan almashtiring:

```ts
    // Faqat ISHLAB TURGAN XODIM hisobi to'xtatadi. O'quvchi hisobi yoki
    // o'chirilgan hisob — yo'q: bu odam o'quvchidan ustozga aylanayotgan
    // yoki sinov hisobi o'chirilgan odam bo'lishi mumkin (ADR-0021). Bu
    // erta tekshiruv — rasm yuklatib keyin rad etmaslik uchun; kafolat
    // `UsersService.create` da.
    const liveStaff = await findLiveStaffByPhone(prisma, phone);
    if (liveStaff) {
      await ctx.reply(
        "Bu raqam bilan xodim hisobi allaqachon bor. Yangi lavozim kerak bo'lsa, administrator uni mavjud hisobingizga qo'shib beradi.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }
```

Yaratish qismida `// Login = telefon raqam (o'quvchilarda ham shunday). Parol tasodifiy.` izohi va `const password = generatePassword();` o'rniga:

```ts
      // Kirish nomi — telefon, agar u boshqa tirik hisobning nomi bo'lmasa;
      // aks holda bo'sh (kirish baribir telefon bilan). Parol tasodifiy.
      const login = await loginForPhone(prisma, data.phone);
      const password = generatePassword();
```

va `usersService.create` chaqiruvida `login: data.phone,` → `login: login ?? undefined,`.

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/telegram/scenes/employee-registration.scene.spec.ts`
Expected: PASS (eski 3 + yangi 6)

- [ ] **Step 5: Tip tekshiruvi**

Run: `npm run typecheck`
Expected: xatosiz. (`ctx.from` `Context` da `User | undefined`; `contact.user_id` `number | undefined`.)

- [ ] **Step 6: Commit**

```bash
git add server/src/telegram/scenes/employee-registration.scene.ts server/src/telegram/scenes/employee-registration.scene.spec.ts
git commit -m "Bot xodim sahnasi: o'quvchi va o'chirilgan hisob to'sqinlik qilmaydi, begona kontakt rad etiladi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: Parol tiklash sahnasi — kontakt egaligi to'liq

**Files:**
- Modify: `server/src/telegram/scenes/password-reset.scene.ts:71-80`
- Create: `server/src/telegram/scenes/password-reset.scene.spec.ts`

**Interfaces:**
- Consumes: `contactBelongsToSender`, `CONTACT_NOT_OWN` (Task 1).

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/telegram/scenes/password-reset.scene.spec.ts`:

```ts
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createPasswordResetScene } from './password-reset.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

/**
 * Bog'lanmagan o'quvchi (`step 2`) kontakt yuboradi. Ilgari `user_id`siz
 * karta o'tib ketardi — ya'ni begona raqam yozilgan karta bilan boshqa
 * o'quvchining hisobini o'ziga bog'lab, parolini olib bo'lardi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 3,
    message: {
      message_id: 3,
      date: 0,
      chat: { id: 555333, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'A' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = { step: 2, data: {}, processing: false };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe("password-reset.scene — kontakt orqali bog'lanish", () => {
  const OWN = { phone_number: '+998901234567', first_name: 'A', user_id: 999 };
  let prisma: any;

  beforeEach(() => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue({
          id: 12345,
          firstName: 'Akmal',
          lastName: 'Karimov',
          phone: '901234567',
          userId: 99001,
          companyId: 1001,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
  });

  const buildScene = () =>
    createPasswordResetScene(prisma, {} as any, {} as any, {} as any);

  it("begona karta (boshqa user_id) hech qanday hisobga bog'lanmaydi", async () => {
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(2);
  });

  it("user_id'siz karta ham bog'lanmaydi — ilgari shu teshik ochiq edi", async () => {
    const ctx = buildContactCtx({ phone_number: '+998901234567', first_name: 'A' });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("o'z raqami bilan hisob topiladi va chat unga bog'lanadi", async () => {
    const ctx = buildContactCtx(OWN);

    await buildScene().middleware()(ctx, async () => {});

    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '901234567', deletedAt: null } }),
    );
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 12345 },
      data: { telegramChatId: '555333' },
    });
    expect(ctx.session.step).toBe(1);
    expect(ctx.session.data.studentId).toBe(12345);
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/telegram/scenes/password-reset.scene.spec.ts`
Expected: FAIL — «user_id'siz karta» testida `prisma.student.findFirst` chaqirilgan (eski yarim tekshiruv o'tkazib yuboradi); birinchi testda xabar `CONTACT_NOT_OWN` emas.

- [ ] **Step 3: Sahnani o'zgartirish**

Importga:

```ts
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
```

`// Telegram only lets a user share their OWN contact ...` izohi bilan boshlanadigan `if (contact.user_id && contact.user_id !== ctx.from?.id) { ... }` blokini butunlay shu bilan almashtiring:

```ts
    // Faqat odamning O'Z tasdiqlangan raqami o'tadi. `user_id`siz karta ham
    // rad etiladi — aks holda begona raqam yozilgan karta bilan boshqa
    // o'quvchining hisobini o'ziga bog'lab, parolini olib bo'lardi.
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(CONTACT_NOT_OWN, Markup.removeKeyboard());
      return;
    }
```

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/telegram/scenes/password-reset.scene.spec.ts src/telegram/flows/password-reset-flow.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/scenes/password-reset.scene.ts server/src/telegram/scenes/password-reset.scene.spec.ts
git commit -m "Parol tiklash: user_id'siz kontakt kartasi endi o'tmaydi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: O'quvchi va mock-imtihon sahnalari — kontakt egaligi

**Files:**
- Modify: `server/src/telegram/scenes/student-registration.scene.ts:319-321`
- Modify: `server/src/telegram/scenes/mock-exam-registration.scene.ts:249-261`
- Create: `server/src/telegram/scenes/student-registration.scene.spec.ts`
- Create: `server/src/telegram/scenes/mock-exam-registration.scene.spec.ts`

**Interfaces:**
- Consumes: `contactBelongsToSender`, `CONTACT_NOT_OWN` (Task 1).

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`server/src/telegram/scenes/student-registration.scene.spec.ts`:

```ts
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createStudentRegistrationScene } from './student-registration.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

/** O'quvchi ro'yxati, telefon qadami (`step 5`). */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 4,
    message: {
      message_id: 4,
      date: 0,
      chat: { id: 555444, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'O' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 5,
    data: { branchId: 7, teacherId: 10, groupId: 'g1' },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('student-registration.scene — kontakt qadami', () => {
  const OWN = { phone_number: '+998901112233', first_name: 'O', user_id: 999 };
  let prisma: any;

  beforeEach(() => {
    prisma = { student: { findFirst: jest.fn().mockResolvedValue(null) } };
  });

  const buildScene = () =>
    createStudentRegistrationScene(
      prisma,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );

  it("begona karta rad etiladi, o'quvchi qidirilmaydi", async () => {
    const ctx = buildContactCtx({ ...OWN, user_id: 1 });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe(5);
  });

  it("user_id'siz karta rad etiladi", async () => {
    const ctx = buildContactCtx({ phone_number: '+998901112233', first_name: 'O' });

    await buildScene().middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });

  it("o'z raqami qabul qilinadi va rasm so'raladi", async () => {
    const ctx = buildContactCtx(OWN);

    await buildScene().middleware()(ctx, async () => {});

    expect(prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: '901112233', deletedAt: null } }),
    );
    expect(ctx.session.data.phone).toBe('901112233');
    expect(ctx.session.step).toBe(6);
  });
});
```

`server/src/telegram/scenes/mock-exam-registration.scene.spec.ts`:

```ts
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createMockExamRegistrationScene } from './mock-exam-registration.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

/**
 * Mock imtihon formasi telefon maydonida turibdi. Bu sahna telefon bo'yicha
 * mavjud o'quvchini topib chatni unga BOG'LAYDI — ya'ni begona karta bilan
 * begona o'quvchining Telegram bog'lanishini egallab bo'lardi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 5,
    message: {
      message_id: 5,
      date: 0,
      chat: { id: 555555, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'M' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 0,
    data: {
      examId: 'exam-1',
      fields: [
        { id: 'phone', type: 'phone', label: 'Telefon', required: true, mapsTo: 'phone' },
      ],
      currentFieldIndex: 0,
      answers: {},
    },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('mock-exam-registration.scene — kontakt qadami', () => {
  it("begona karta rad etiladi, bazaga borilmaydi", async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(prisma, {} as any, {} as any);
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'M',
      user_id: 1,
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("user_id'siz karta rad etiladi", async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(prisma, {} as any, {} as any);
    const ctx = buildContactCtx({ phone_number: '+998901112233', first_name: 'M' });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Testlar yiqilishini tekshirish**

Run: `npx jest src/telegram/scenes/student-registration.scene.spec.ts src/telegram/scenes/mock-exam-registration.scene.spec.ts`
Expected: FAIL — rad etish testlarida `ctx.reply` `CONTACT_NOT_OWN` bilan chaqirilmagan (o'quvchi sahnasi `student.findFirst` ni chaqiradi; mock-imtihon `handleAnswer` ga kirib ketadi).

- [ ] **Step 3: Ikki sahnani o'zgartirish**

`student-registration.scene.ts` importlariga:

```ts
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
```

Kontakt qadamida `const contact = ctx.message.contact;` dan keyin:

```ts
    // Faqat odamning O'Z tasdiqlangan raqami o'tadi — begona raqamga
    // o'quvchi hisobi ochib bo'lmasin.
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(
        CONTACT_NOT_OWN,
        Markup.keyboard([
          [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
        ])
          .resize()
          .oneTime(),
      );
      return;
    }
```

`mock-exam-registration.scene.ts` importlariga xuddi shu ikki nom. Kontakt qadamida `if (!field || field.type !== 'phone') return;` dan keyin, normalizatsiyadan OLDIN:

```ts
    // Bu sahna telefon bo'yicha mavjud o'quvchini topib chatni unga
    // bog'laydi — begona karta bilan begona o'quvchining bog'lanishini
    // egallab bo'lmasin.
    if (!contactBelongsToSender(ctx.message.contact, ctx.from)) {
      await ctx.reply(CONTACT_NOT_OWN);
      return;
    }
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `npx jest src/telegram/scenes/student-registration.scene.spec.ts src/telegram/scenes/mock-exam-registration.scene.spec.ts src/telegram/scenes/student-registration-flow.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram/scenes/student-registration.scene.ts server/src/telegram/scenes/student-registration.scene.spec.ts server/src/telegram/scenes/mock-exam-registration.scene.ts server/src/telegram/scenes/mock-exam-registration.scene.spec.ts
git commit -m "O'quvchi va mock-imtihon sahnalari ham faqat o'z kontaktini qabul qiladi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 6: Admin «O'qituvchi qo'shish» — telefon va kirish nomi qoidasi

**Files:**
- Modify: `server/src/teachers/teachers.service.ts:269-290`
- Test: `server/src/teachers/teachers.service.spec.ts`

**Interfaces:**
- Consumes: `findLiveStaffByPhone`, `loginForPhone` (Task 2).

- [ ] **Step 1: Yiqiladigan testlarni yozish**

`teachers.service.spec.ts` oxiriga alohida `describe` (o'z moduli bilan — mavjud harness `user.findFirst` ni id bo'yicha javob beradi, bizga `where.roles` / `where.login` bo'yicha kerak):

```ts
describe("TeachersService.create — telefon va kirish nomi qoidasi", () => {
  let service: TeachersService;
  let prisma: any;
  let liveStaff: any;
  let loginTaken: any;

  const dto = {
    firstName: 'Dilnoza',
    lastName: 'Karimova',
    phone: '901112233',
    gender: 'FEMALE',
  } as any;

  beforeEach(async () => {
    liveStaff = null;
    loginTaken = null;
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.roles) return Promise.resolve(liveStaff);
          if (where?.login) return Promise.resolve(loginTaken);
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 501,
            ...data,
            roles: [{ role: { id: 4, name: 'Teacher' } }],
            branches: [],
            groupTeachers: [],
          }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn(), get: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  it("o'quvchi hisobidagi raqam bilan ustoz yaratiladi", async () => {
    const result = await service.create(dto, 1001);

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data.login).toBe('901112233');
    expect(result.generatedLogin).toBe('901112233');
    // Faqat xodim rolli hisoblar so'raladi — o'quvchi hisobi to'sqinlik qilmaydi.
    const staffLookup = prisma.user.findFirst.mock.calls.find(
      ([args]: any[]) => args?.where?.roles,
    );
    expect(staffLookup[0].where.roles).toEqual({
      some: { roleId: { in: [1, 2, 3, 4, 5] } },
    });
  });

  it("ishlab turgan xodim raqami bilan ikkinchi hisob ochilmaydi", async () => {
    liveStaff = { id: 10924, firstName: 'Nodira', lastName: 'Yusupova' };

    await expect(service.create(dto, 1001)).rejects.toThrow(
      /xodim hisobi allaqachon bor/,
    );
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("kirish nomi band bo'lsa nom yozilmaydi, hisob ochiladi", async () => {
    loginTaken = { id: 10018 };

    const result = await service.create(dto, 1001);

    expect(prisma.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(prisma.user.create.mock.calls[0][0].data.phone).toBe('901112233');
    // Odam baribir telefon bilan kiradi — shuni ko'rsatamiz.
    expect(result.generatedLogin).toBe('901112233');
  });
});
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/teachers/teachers.service.spec.ts`
Expected: FAIL — «o'quvchi raqami» testida `staffLookup` undefined (eski kod rolsiz so'raydi); «band nom» testida `login` `'901112233'`.

- [ ] **Step 3: Servisni o'zgartirish**

Importga (`assertCallerInBranch` importidan keyin):

```ts
import {
  findLiveStaffByPhone,
  loginForPhone,
} from '../common/auth/phone-account-rules';
```

`// Telefon raqam tekshirish` dan `const hashedPassword = ...` gacha bo'lgan qismni shu bilan almashtiring:

```ts
    // Faqat ISHLAB TURGAN XODIM hisobi to'xtatadi. O'quvchi hisobi (odam
    // o'quvchidan ustozga aylanayotgan bo'lishi mumkin) va o'chirilgan
    // hisob — yo'q (ADR-0021).
    const liveStaff = await findLiveStaffByPhone(this.prisma, dto.phone);
    if (liveStaff) {
      throw new BadRequestException(
        `Bu telefon raqam bilan xodim hisobi allaqachon bor: ${liveStaff.firstName} ${liveStaff.lastName} (#${liveStaff.id}). Yangi rol kerak bo'lsa o'sha hisobga qo'shing.`,
      );
    }

    // Kirish nomi — telefon, agar u boshqa tirik hisobning nomi bo'lmasa;
    // aks holda bo'sh. Kirish baribir telefon bilan.
    const login = await loginForPhone(this.prisma, dto.phone);
    const password = generatePassword();
    const hashedPassword = await bcrypt.hash(password, 10);
```

`this.prisma.user.create` ichida `login: dto.phone,` → `login,`.

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/teachers/teachers.service.spec.ts src/teachers/teachers-branch.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/teachers/teachers.service.ts server/src/teachers/teachers.service.spec.ts
git commit -m "O'qituvchi qo'shish: o'quvchi raqami to'sqinlik qilmaydi, ikkinchi xodim hisobi ochilmaydi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: `UsersService.create` — bitta telefonga bitta xodim hisobi (kafolat)

**Files:**
- Modify: `server/src/users/users.service.ts:515-531`
- Test: `server/src/users/users-self-registration.spec.ts`

**Interfaces:**
- Consumes: `findLiveStaffByPhone`, `STAFF_ROLE_IDS` (Task 2).

- [ ] **Step 1: Mavjud testni moslashtirish va yangilarini yozish**

`users-self-registration.spec.ts` da `'never asks the branch-scope resolver about a caller that does not exist'` testining tasdig'ini almashtiring — endi `findFirst` telefon qoidasi uchun chaqiriladi, tekshiriladigan narsa «chaqiruvchi qidirilmagani»:

```ts
  it('never asks the branch-scope resolver about a caller that does not exist', async () => {
    await service.create(teacherPayload, { kind: 'self-registration' });
    // `resolveCallerBranchScope` chaqiruvchini `user.findFirst({ where: { id } })`
    // bilan yuklaydi. Chaqiruvchi yo'q — hech kim uni qidirmasligi kerak.
    // (Telefon qoidasi ham `findFirst` ishlatadi, lekin `where.id` siz.)
    const callerLookups = prisma.user.findFirst.mock.calls.filter(
      ([args]: any[]) => args?.where?.id !== undefined,
    );
    expect(callerLookups).toHaveLength(0);
  });
```

O'sha `describe` ichiga uchta yangi test:

```ts
  it("ishlab turgan xodim raqami bilan ikkinchi xodim hisobi ochilmaydi", async () => {
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.roles
          ? { id: 10924, firstName: 'Nodira', lastName: 'Yusupova' }
          : null,
      ),
    );

    await expect(
      service.create(teacherPayload, { kind: 'self-registration' }),
    ).rejects.toThrow(/xodim hisobi allaqachon bor/);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("o'quvchi hisobidagi raqam bilan xodim hisobi ochiladi", async () => {
    // Faqat xodim rolli hisoblar so'raladi — o'quvchi hisobi topilmaydi.
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(where?.roles ? null : { id: 10018 }),
    );

    await service.create(teacherPayload, { kind: 'self-registration' });
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("rolsiz xodimga telefon qoidasi qo'llanmaydi", async () => {
    await service.create(
      {
        firstName: 'Olim',
        lastName: 'Toshev',
        companyId: 1001,
        phone: '901234567',
        position: 'Farrosh',
        roleIds: [],
        branchIds: [NAMANGAN],
      },
      { kind: 'self-registration' },
    );

    const staffLookups = prisma.user.findFirst.mock.calls.filter(
      ([args]: any[]) => args?.where?.roles,
    );
    expect(staffLookups).toHaveLength(0);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/users/users-self-registration.spec.ts`
Expected: FAIL — «ikkinchi xodim hisobi» testida `create` chaqirilgan.

- [ ] **Step 3: Servisni o'zgartirish**

Importga (`assertCallerMayTouchUser` yaqiniga):

```ts
import {
  findLiveStaffByPhone,
  STAFF_ROLE_IDS,
} from '../common/auth/phone-account-rules';
```

`create` ichida `await this.assertRoleAndBranchRules(...)` chaqiruvidan KEYIN, `const hashedPassword = ...` dan OLDIN:

```ts
    // Bitta telefonga bitta ISHLAB TURGAN xodim hisobi (ADR-0021). Qoida
    // shu yerda turadi, chunki xodim hisobi ochiladigan har ikki eshik —
    // admin formasi ham, bot ham — shu funksiyadan o'tadi. O'quvchi hisobi
    // va o'chirilgan hisob to'sqinlik qilmaydi; rolsiz xodimga qoida
    // qo'llanmaydi — u kira olmaydi, ya'ni raqam noaniqligi zararsiz.
    const grantsStaffRole = (data.roleIds ?? []).some((id) =>
      (STAFF_ROLE_IDS as readonly number[]).includes(id),
    );
    if (grantsStaffRole && data.phone) {
      const liveStaff = await findLiveStaffByPhone(this.prisma, data.phone);
      if (liveStaff) {
        throw new BadRequestException(
          `Bu telefon raqam bilan xodim hisobi allaqachon bor: ${liveStaff.firstName} ${liveStaff.lastName} (#${liveStaff.id}). Yangi rol kerak bo'lsa o'sha hisobga qo'shing.`,
        );
      }
    }
```

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `npx jest src/users`
Expected: PASS (barcha `users*` spec'lar — `users.service.spec.ts` ning `create` testlari `prisma.user.findFirst` ni `null` qaytaradigan qilib mock qilgan, ular o'tadi; agar birontasi `findFirst` chaqirilmaganini tekshirsa, Step 1 dagi kabi `where.id` bo'yicha filtrlang).

- [ ] **Step 5: Commit**

```bash
git add server/src/users/users.service.ts server/src/users/users-self-registration.spec.ts
git commit -m "Xodim hisobi: bitta telefonga bitta ishlab turgan hisob — kafolat UsersService.create da

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: O'quvchi kirish hisobi hech qachon yarim yaratilmaydi

**Files:**
- Modify: `server/src/students/students-write.service.ts:426-433`
- Modify: `server/src/telegram/scenes/student-registration-flow.ts:176-182`
- Test: `server/src/students/students.service.spec.ts` (`describe('createStudentUser')`)
- Test: `server/src/telegram/scenes/student-registration-flow.spec.ts`

**Interfaces:**
- Consumes: `loginForPhone` (Task 2).

- [ ] **Step 1: Testlarni yozish**

`students.service.spec.ts` dagi `describe('createStudentUser')` ichida mavjud testning boshiga (chaqiruvdan oldin) qo'shing — harness `findFirst` hamma so'rovga CEO obyektini qaytaradi, kirish nomi so'roviga `null` kerak:

```ts
      // Birinchi `findFirst` — kirish nomi bo'shligi so'rovi.
      prisma.user.findFirst.mockResolvedValueOnce(null);
```

va o'sha `describe` ga yangi test:

```ts
    it("kirish nomi boshqa hisobda band bo'lsa nom yozilmaydi, hisob baribir ochiladi", async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: 10018 });

      const result = await service.createStudentUser(
        1,
        '901234567',
        'Ali',
        'Valiyev',
        1001,
      );

      expect(prisma.user.create.mock.calls[0][0].data.login).toBeNull();
      expect(prisma.user.create.mock.calls[0][0].data.phone).toBe('901234567');
      expect(prisma.student.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { userId: 10001 },
      });
      expect(result.userId).toBe(10001);
    });
```

`student-registration-flow.spec.ts` da `prisma.user` mockiga `findFirst` qo'shing:

```ts
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 20001 }),
      },
```

va `describe` oxiriga ikki test:

```ts
  it("kirish nomi bo'sh bo'lsa telefon yoziladi", async () => {
    await run();
    expect(prisma.user.create.mock.calls[0][0].data.login).toBe('901112233');
  });

  it("kirish nomi band bo'lsa ham o'quvchi hisobi ochiladi — nomsiz", async () => {
    // Prodda 4 o'quvchi aynan shu sabab kirish hisobisiz qolgan edi.
    prisma.user.findFirst.mockResolvedValue({ id: 10018 });

    await run();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 11094 },
      data: { userId: 20001 },
    });
  });
```

- [ ] **Step 2: Testlar yiqilishini tekshirish**

Run: `npx jest src/students/students.service.spec.ts src/telegram/scenes/student-registration-flow.spec.ts`
Expected: FAIL — «band» testlarida `login` `'901234567'` / `'901112233'`.

- [ ] **Step 3: Ikki joyni o'zgartirish**

`students-write.service.ts` importiga:

```ts
import { loginForPhone } from '../common/auth/phone-account-rules';
```

`createStudentUser` da `const plainPassword = generatePassword();` dan OLDIN:

```ts
    // Kirish nomi — telefon, agar u boshqa tirik hisobning nomi bo'lmasa
    // (masalan, xodim yoki aka-uka hisobi). Aks holda bo'sh — ilgari bu
    // holatda `create` bazada yiqilib, o'quvchi kirish hisobisiz qolardi.
    const login = await loginForPhone(this.prisma, phone);
```

va `this.prisma.user.create` ichida `login: phone,` → `login,`.

`student-registration-flow.ts` importiga:

```ts
import { loginForPhone } from '../../common/auth/phone-account-rules';
```

`const plainPassword = generatePassword();` dan OLDIN:

```ts
  // Kirish nomi — telefon, agar bo'sh bo'lsa; aks holda bo'sh (yuqoridagi
  // `createStudentUser` bilan bir xil sabab).
  const login = await loginForPhone(prisma, data.phone);
```

va `prisma.user.create` ichida `login: data.phone,` → `login,`.

- [ ] **Step 4: Testlar o'tishini tekshirish**

Run: `npx jest src/students src/telegram/scenes/student-registration-flow.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/students/students-write.service.ts server/src/students/students.service.spec.ts server/src/telegram/scenes/student-registration-flow.ts server/src/telegram/scenes/student-registration-flow.spec.ts
git commit -m "O'quvchi kirish hisobi nom band bo'lsa ham ochiladi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9: Xodim parol tiklashi jurnalga yoziladi

**Files:**
- Modify: `server/src/common/password-reset/portal-password-reset.service.ts:101-127`
- Test: `server/src/common/password-reset/portal-password-reset.service.spec.ts:140-149`

- [ ] **Step 1: Testni almashtirish**

`'skips the audit when there is no linked student'` testini shu bilan almashtiring:

```ts
    it("o'quvchisi yo'q hisobda (xodim) jurnal User yozuviga tushadi", async () => {
      const { service, prisma, entityHistory } = build();

      await service.applyNewPassword(
        { userId: 10001, companyId: 1001 },
        'newpass123',
        'SMS orqali tiklandi',
      );

      expect(prisma.user.update).toHaveBeenCalled();
      expect(entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'User',
          entityId: 10001,
          newValues: { parol: 'SMS orqali tiklandi' },
          changedById: 10001,
          companyId: 1001,
        }),
      );
    });
```

- [ ] **Step 2: Test yiqilishini tekshirish**

Run: `npx jest src/common/password-reset/portal-password-reset.service.spec.ts`
Expected: FAIL — `recordUpdate` chaqirilmagan.

- [ ] **Step 3: Servisni o'zgartirish**

`applyNewPassword` ning hujjat izohini va tanasini shu bilan almashtiring:

```ts
  /**
   * Parolni xeshlab yozadi va tiklashni jurnalga tushiradi.
   *
   * NEGA ikki yozuv: o'quvchiniki o'quvchi kartochkasida (`Student`) ko'rinadi,
   * xodimniki xodim yozuvida (`User`). Ilgari xodim parolini SMS orqali
   * tiklash umuman iz qoldirmasdi. `channelLabel` — manba, masalan
   * "SMS orqali tiklandi".
   */
  async applyNewPassword(
    target: ResettableTarget,
    plainPassword: string,
    channelLabel: string,
  ): Promise<void> {
    const hashed = await bcrypt.hash(plainPassword, 10);
    await this.prisma.user.update({
      where: { id: target.userId },
      data: { password: hashed },
    });

    await this.entityHistory.recordUpdate({
      entityType: target.studentId ? 'Student' : 'User',
      entityId: target.studentId ?? target.userId,
      oldValues: { parol: '***' },
      newValues: { parol: channelLabel },
      changedById: target.userId,
      companyId: target.companyId ?? undefined,
    });
  }
```

- [ ] **Step 4: Test o'tishini tekshirish**

Run: `npx jest src/common/password-reset src/auth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/common/password-reset/portal-password-reset.service.ts server/src/common/password-reset/portal-password-reset.service.spec.ts
git commit -m "Xodim parol tiklashi ham jurnalga tushadi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: Hujjat va izohlar haqiqatga moslanadi, ADR

**Files:**
- Modify: `server/CLAUDE.md:121,123,134`
- Modify: `server/src/auth/auth.service.ts:125-127`
- Modify: `server/src/auth/telegram-oauth/telegram-oauth.service.ts:127-128`
- Modify: `server/src/common/password-reset/portal-password-reset.service.ts:29-31`
- Create: `docs/adr/0021-bir-odam-har-rolga-alohida-hisob.md`
- Modify: `docs/adr/README.md` (jadvalga qator)

- [ ] **Step 1: `server/CLAUDE.md`**

121-qator (`- **Neither `User.login` nor `User.phone` is `@unique`** — a phone can map to several accounts. The lookup is therefore **portal-scoped**: ...`) boshini shu bilan almashtiring (qatorning qolgan qismi — `The lookup is therefore **portal-scoped**:` dan boshlab — o'zgarmaydi):

```
- **`User.phone` is not unique; `User.login` IS unique among live rows** — partial index `User_login_key ON "User"("login") WHERE "deletedAt" IS NULL` (migration `20260327021835_add_soft_delete_fields`), which `schema.prisma` cannot express and therefore does not show. Consequences: (a) a phone can map to several accounts (one person = one account per role, ADR-0021), (b) a second live account for a phone that is already someone's `login` is created with `login = null` (`loginForPhone` in `common/auth/phone-account-rules.ts`) — sign-in still works because the lookup matches `phone`, (c) at most ONE live STAFF account per phone is enforced in `UsersService.create` and `TeachersService.create` (`findLiveStaffByPhone`); a student account never blocks a staff account and a soft-deleted account frees both phone and login. The lookup is therefore **portal-scoped**: ...
```

123-qator `- **Operational caveat:** because phone isn't unique, assigning the same phone to multiple staff within one portal makes only the most-recent one reachable by phone.` → `- **Operational caveat:** two live staff accounts on one phone predate the rule above (prod has two such pairs); until merged, only the most-recent one is reachable by phone.` (qatorning qolgan qismi o'zgarmaydi).

134-qator `- **A shared phone FAILS CLOSED on the OAuth path.** Neither `User.login` nor `User.phone` is unique, so one phone can match several accounts within the same portal` → `- **A shared phone FAILS CLOSED on the OAuth path.** `User.phone` is not unique (and `login` may be null), so one phone can match several accounts within the same portal` (qolgani o'zgarmaydi).

- [ ] **Step 2: Kod izohlari**

`auth.service.ts` 125–127:

```
   * NEGA KERAK: `User.phone` unique emas, `User.login` esa faqat tirik
   * qatorlar orasida unique va yangi hisobda bo'sh bo'lishi mumkin — ya'ni
   * bitta telefon bir necha akkauntga tegishli bo'lishi mumkin (bir odam —
   * har rolga alohida hisob, ADR-0021; yoki ofis
```

(keyingi qator `   * raqami — kassirda ham, administratorda ham). Parol bilan kirishda` o'zgarmaydi.)

`telegram-oauth.service.ts` 127–128:

```
      // `User.phone` unique EMAS (login faqat tirik qatorlar orasida unique
      // va bo'sh bo'lishi mumkin — server/CLAUDE.md), va
```

`portal-password-reset.service.ts` 29–31:

```
 * IMPORTANT: `User.phone` is not unique (and `login` may be null), so a phone
 * can map to several accounts (siblings, a shared number, or one person with
 * one account per role — ADR-0021). Within the allowed roles we pick the
```

- [ ] **Step 3: ADR**

`docs/adr/0021-bir-odam-har-rolga-alohida-hisob.md`:

```markdown
# ADR-0021: Bir odam — har rolga alohida hisob; kimlik telefon emas, bog'lanish

**Holat:** Qabul qilingan · **Sana:** 2026-09-19

## Kontekst

Bir odam o'quvchi ham, xodim ham bo'la oladi (o'quvchi ustoz bo'ldi; xodim
sinov uchun o'quvchi bo'lib ko'rdi). Uchala hisob yaratish yo'li (o'quvchi
boti, xodim boti, admin «O'qituvchi qo'shish») kirish nomiga telefonni
yozardi, baza esa tirik qatorlar orasida bitta nomga bitta hisob beradi
(`User_login_key ... WHERE "deletedAt" IS NULL`). Natijada o'quvchi hisobi
turganda xodim hisobi ochilmasdi; bot esa o'chirilgan hisoblarni ham «band»
deb sanardi. Kod izohlari «login unique emas» deb yozilgan edi — sxema qisman
indeksni ko'rsatmaydi.

Bundan tashqari bot yuborilgan kontakt kartaning kimniki ekanini
tekshirmasdi, xodim havolasi esa muddatsiz. Prodda bitta raqamda ikkita
admin hisobi (2 juft) va kirish hisobisiz 4 o'quvchi topildi.

## Qaror

1. **Bir odam — har roli uchun alohida hisob, bitta telefon.** O'quvchi
   hisobi xodim hisobi ochilishiga to'sqinlik qilmaydi; o'chirilgan hisob
   ham. Bitta telefonga ko'pi bilan **bitta ishlab turgan xodim** hisobi —
   ikkinchi rol mavjud hisobga qo'shiladi.
2. **Kirish nomi uydirilmaydi:** telefon bo'sh bo'lsa telefon, band bo'lsa
   bo'sh. Kirish telefon bo'yicha.
3. **Bot kontaktni faqat `user_id` yuboruvchi bilan teng bo'lganda qabul
   qiladi.** `user_id` yo'q — isbotlanmagan — rad.
4. **Har parol tiklash jurnalga yoziladi** — o'quvchiniki `Student`,
   xodimniki `User` da.
5. Keyingi bosqichlar (alohida ADR bilan): xodim hisobini faqat admin
   ochadi, bot shaxsiy bir martalik havola bilan Telegramni hisobga
   bog'laydi va parol beradi; «Telegram bilan kirish» bog'lanish bo'yicha.

## Sabab

Bitta hisobga ikki rol berish rad etildi: o'quvchi parolini admin ham
(o'quvchi profilida o'zgartiradi), ota-ona ham biladi — bitta hisob bo'lsa
o'sha parol ustoz/admin sahifasini ochib qo'yardi; kirish sahifasi ham
o'quvchi rolli odamni o'quvchi sahifasiga yo'naltiradi; tizim «hisob = bitta
tur» deb yozilgan va prodda bunday hisob 0 ta. Alohida hisob esa mavjud
amaliyot: kirish, SMS tiklash, Telegram OAuth allaqachon portalga qarab hisob
tanlaydi.

Telefon raqamiga tayanish rad etildi: ko'pchilikda Telegram raqami bilan
ishlatadigan raqami har xil.

## Oqibat

- Bir odamda ikkita parol bo'ladi (o'quvchi va xodim). Bot parol tiklashda
  keyingi bosqichda qaysi hisobni so'raydi.
- Telegram raqami tizimdagidan farqli, bog'lanmagan o'quvchi botdan parol
  tiklay olmaydi — SMS ishlatadi.
- Prodda mavjud ikki admin-dublikat va 4 hisobsiz o'quvchi qo'lda
  tartibga solinadi (3-bosqich).
- `teacher-registration.scene.ts` o'lik kod — keyingi bosqichda olib
  tashlanadi.
```

`docs/adr/README.md` jadvaliga 0020 qatoridan keyin:

```
| [0021](0021-bir-odam-har-rolga-alohida-hisob.md) | Bir odam — har rolga alohida hisob; kimlik telefon emas, bog'lanish | Qabul qilindi | 2026-09-19 |
```

- [ ] **Step 4: Tekshirish**

Run: `grep -rn "unique emas\|unique EMAS\|is unique\|is \`@unique\`" src/auth src/common/password-reset CLAUDE.md`
Expected: faqat yangi matnlar (har birida `phone` unique emasligi va `login` tirik qatorlarda unique ekani aytilgan).

- [ ] **Step 5: Commit**

```bash
git add server/CLAUDE.md server/src/auth/auth.service.ts server/src/auth/telegram-oauth/telegram-oauth.service.ts server/src/common/password-reset/portal-password-reset.service.ts docs/adr/0021-bir-odam-har-rolga-alohida-hisob.md docs/adr/README.md docs/superpowers/specs/2026-09-19-xodim-hisobi-va-telegram-design.md docs/superpowers/plans/2026-09-19-xodim-hisobi-bosqich-1.md
git commit -m "ADR-0021: bir odam — har rolga alohida hisob; «login unique emas» izohlari tuzatildi

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 11: To'liq tekshiruv va PR

**Files:** yo'q (faqat buyruqlar)

- [ ] **Step 1: Server testlari va tip**

Run (`server/` dan): `npx prisma generate && npm test && npm run typecheck`
Expected: hamma suite PASS, typecheck xatosiz. (Toshkent 23:40–00:02 oralig'ida `attendance` spec vaqt sababli yiqilishi mumkin — o'sha holda 19:03 UTC dan keyin qayta yuriting, bu rejaga aloqasi yo'q.)

- [ ] **Step 2: Lint**

Run: `npx eslint "src/telegram/utils/contact-ownership*.ts" "src/common/auth/phone-account-rules*.ts" "src/telegram/scenes/*.ts" src/teachers/teachers.service.ts src/users/users.service.ts src/students/students-write.service.ts src/common/password-reset/portal-password-reset.service.ts`
Expected: xatosiz (`--fix` siz — o'zgarishlar aniq ko'rinsin).

- [ ] **Step 3: Klient tegilmaganini tasdiqlash**

Run (repo ildizidan): `git diff --stat main -- client/`
Expected: bo'sh.

- [ ] **Step 4: Branch'ni push qilish va PR**

```bash
git push -u origin worktree-xodim-hisobi-va-telegram
gh pr create --base main --title "Xodim hisobi: o'quvchi va o'chirilgan hisob to'sqinlik qilmaydi, bot begona kontaktni rad etadi" --body "$(cat <<'EOF'
## Nima

ADR-0021 ning 1-bosqichi (dizayn: `docs/superpowers/specs/2026-09-19-xodim-hisobi-va-telegram-design.md`).

- O'quvchi bo'lib yurgan odam yoki hisobi o'chirilgan sobiq xodim bot havolasidan va admin «O'qituvchi qo'shish» dan xodim bo'lib o'ta oladi.
- Bitta telefonga ikkinchi ishlab turgan xodim hisobi ochilmaydi — admin mavjud hisobga rol qo'shadi (`UsersService.create`, `TeachersService.create`).
- Kirish nomi band bo'lsa uydirilmaydi, bo'sh qoladi; kirish telefon bilan. O'quvchi hisobi ham endi yarim yaratilmaydi.
- Bot to'rt sahnada ham kontakt kartasi yuboruvchiniki ekanini tekshiradi (`user_id` yo'q — rad). Bu begona o'quvchi hisobini bog'lab parol olish teshigini yopadi.
- Xodim parol tiklashi jurnalga yoziladi.
- «`User.login` unique emas» degan noto'g'ri izohlar va CLAUDE.md tuzatildi.

## Nima o'zgarmaydi

Parol tiklash yo'llari, havola mexanizmi, klient, baza sxemasi.

## Tekshiruv

`npm test`, `npm run typecheck` — server. Klientga tegilmagan.

## Chiqarish

Faqat Railway (`railway up server --path-as-root`). Vercel kerak emas.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: CEO ga hisobot**

Oddiy tilda: nima ishlaydigan bo'ldi (ikki holat), nima yopildi (kontakt), nima o'zgarmadi, va **prodga chiqmaguncha botda o'zgarish yo'qligi**. Chiqarishga ruxsat so'raladi.
