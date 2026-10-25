# Telegramdan jins va tug'ilgan sanani so'rash — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kartasida `gender` yoki `dateOfBirth` bo'sh faol o'quvchilarga Telegram bot orqali bir martalik xabar yuborib, shu ikki ma'lumotni yig'ish; xabarlar avval faqat CEO'ning o'z chatiga ko'rinish (preview) sifatida boradi.

**Architecture:** Yozish mantig'i `students/shared/fill-student-profile.ts` ga chiqariladi (`TelegramModule` `StudentsModule`ni import qila olmaydi: Students → Billing → Telegram tsikli). Bot tomoni: toza matn/tugma modul, `pf:*` tugmalar uchun handlerlar va sana kutadigan kichik scene. Yuboruvchi — `send-student-ids.ts` shabloni: sinov → `--preview=<chatId>` → `--apply --expect=N`.

**Tech Stack:** NestJS, Telegraf (scenes, inline keyboard), Prisma, Jest. Skript: `ts-node` + `scripts/lib/check-cli.ts`.

## Global Constraints

- Til: matnlar, ADR, kod izohlari o'zbekcha (lotin); **commit va PR matni inglizcha**; ekranda inglizcha so'z yo'q.
- Xabar tartibi: salom → sabab → harakat → rahmat; qisqa (1–3 jumla).
- `callback_data` ≤ 64 bayt; prefiks `pf:`.
- Egalik: `student.telegramChatId === String(ctx.chat.id)`, aks holda hech narsa yozilmaydi.
- Bo'sh bo'lmagan maydon qayta yozilmaydi.
- Sana formati foydalanuvchi uchun `KK.OO.YYYY`, tekshiruv `birthDateProblem` (yosh 5–100, kelajak emas).
- Telegram `ctx.from` dan jins/sana taxmin qilinmaydi.
- `--preview` hech narsa yozmaydi (na `Student`, na `SmsMessage`). `--apply` faqat `--expect=<N>` bilan.
- Qamrov: `deletedAt: null`, `status: ACTIVE`, faol/pauzadagi guruhda ACTIVE yozuv, `telegramChatId` bor, `telegramDisconnectedAt` yo'q, `gender IS NULL OR dateOfBirth IS NULL`.
- Tezlik: `GAP_MS = 50`.
- Prettier har tegilgan `.ts` ga (`server/`); `client/` ga tegilmaydi.
- Spec: `docs/superpowers/specs/2026-10-25-telegramdan-jins-sana-sorash-design.md`.

## Ish muhiti (bir marta)

Asosiy checkout'da boshqa tugallanmagan ish bor (`feat/payment-settings-save-ux`). Yangi worktree'da ishlang: `EnterWorktree` bilan `feat/telegram-profile-request` (`origin/main` dan). Spec fayli commit qilinmagan, uni asosiy checkout'dan worktree'ga nusxalang (`/bin/cp`). Worktree'da `node_modules` yo'q: `npm install` (`server/` ichida), keyin `npx prisma generate`.

## Fayllar

| Fayl | Vazifa |
|---|---|
| `server/src/students/shared/fill-student-profile.ts` (+spec) | Jins/sanani kartaga yozish: tekshiruv, `User.gender` sinxroni, tarix |
| `server/src/students/onboarding/student-onboarding.service.ts` | `updateProfile` shu funksiyaga o'tadi |
| `server/src/telegram/profile-request/profile-request-text.ts` (+spec) | Toza: matn, tugmalar, callback tahlili, sana tahlili |
| `server/src/telegram/profile-request/profile-request.handlers.ts` (+spec) | Tugma va sana yozish mantig'i (egalik tekshiruvi) |
| `server/src/telegram/scenes/profile-fill.scene.ts` | Sana kutadigan kichik scene |
| `server/src/telegram/constants.ts`, `server/src/telegram/telegram.service.ts` | Scene va `pf:` tugmalarni ulash |
| `server/scripts/lib/profile-request-plan.ts` (+spec) | Toza: argumentlar, preview xabarlari |
| `server/scripts/send-profile-request.ts` | Yuboruvchi skript |
| `docs/adr/0039-oquvchi-birinchi-kirishda-telefon-jins-yosh.md` | Bitta qo'shimcha qator |

---

### Task 1: Yozish mantig'ini umumiy funksiyaga chiqarish

**Files:**
- Create: `server/src/students/shared/fill-student-profile.ts`
- Create: `server/src/students/shared/fill-student-profile.spec.ts`
- Modify: `server/src/students/onboarding/student-onboarding.service.ts` (`updateProfile`, ~110–155-qator; importlar)
- Test: `server/src/students/onboarding/student-onboarding.service.spec.ts` (mavjud)

**Interfaces:**
- Produces:
  - `interface ProfileTarget { id: number; gender: Gender | null; dateOfBirth: Date | null; companyId: number; userId: number | null }`
  - `interface ProfileInput { gender?: Gender; dateOfBirth?: string }` (`dateOfBirth` = `YYYY-MM-DD`)
  - `interface ProfileWritten { gender?: Gender; dateOfBirth?: string }`
  - `fillStudentProfile(deps: { prisma: Pick<PrismaService, 'student' | 'user'>; entityHistory: Pick<EntityHistoryService, 'recordUpdate'> }, student: ProfileTarget, input: ProfileInput, actorUserId?: number): Promise<ProfileWritten>` — nima yozilganini qaytaradi (`{}` = hech narsa); noto'g'ri sanada `BadRequestException(birthDateProblem)`.

- [ ] **Step 1: Failing test yozish**

`server/src/students/shared/fill-student-profile.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { fillStudentProfile } from './fill-student-profile';

const target = (o: object = {}) => ({
  id: 7,
  gender: null,
  dateOfBirth: null,
  companyId: 1,
  userId: null,
  ...o,
});

function makeDeps() {
  return {
    prisma: {
      student: { update: jest.fn().mockResolvedValue({}) },
      user: { update: jest.fn().mockResolvedValue({}) },
    },
    entityHistory: { recordUpdate: jest.fn().mockResolvedValue(undefined) },
  };
}

describe('fillStudentProfile', () => {
  it('writes both empty fields and records history', async () => {
    const d = makeDeps();
    const written = await fillStudentProfile(
      d as any,
      target(),
      { gender: Gender.FEMALE, dateOfBirth: '2005-03-15' },
      99,
    );
    expect(written).toEqual({
      gender: Gender.FEMALE,
      dateOfBirth: '2005-03-15',
    });
    expect(d.prisma.student.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        gender: Gender.FEMALE,
        dateOfBirth: new Date('2005-03-15T00:00:00.000Z'),
      },
    });
    expect(d.entityHistory.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 7,
        changedById: 99,
        companyId: 1,
      }),
    );
  });

  it('never overwrites a field staff already filled', async () => {
    const d = makeDeps();
    const written = await fillStudentProfile(
      d as any,
      target({ gender: Gender.MALE, dateOfBirth: new Date('2000-01-01') }),
      { gender: Gender.FEMALE, dateOfBirth: '2005-03-15' },
    );
    expect(written).toEqual({});
    expect(d.prisma.student.update).not.toHaveBeenCalled();
    expect(d.entityHistory.recordUpdate).not.toHaveBeenCalled();
  });

  it('rejects an impossible date before writing anything', async () => {
    const d = makeDeps();
    await expect(
      fillStudentProfile(d as any, target(), {
        gender: Gender.MALE,
        dateOfBirth: '2005-02-30',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(d.prisma.student.update).not.toHaveBeenCalled();
  });

  it('mirrors gender onto the linked account only', async () => {
    const d = makeDeps();
    await fillStudentProfile(d as any, target({ userId: 5 }), {
      gender: Gender.MALE,
    });
    expect(d.prisma.user.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { gender: Gender.MALE },
    });

    const d2 = makeDeps();
    await fillStudentProfile(d2 as any, target({ userId: null }), {
      gender: Gender.MALE,
    });
    expect(d2.prisma.user.update).not.toHaveBeenCalled();

    const d3 = makeDeps();
    await fillStudentProfile(d3 as any, target({ userId: 5 }), {
      dateOfBirth: '2005-03-15',
    });
    expect(d3.prisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Fail ekanini tekshirish**

Run (`server/` ichida): `npx jest src/students/shared/fill-student-profile.spec.ts`
Expected: FAIL — `Cannot find module './fill-student-profile'`.

- [ ] **Step 3: Funksiyani yozish**

`server/src/students/shared/fill-student-profile.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Gender } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { birthDateProblem } from './student-onboarding';

export interface ProfileTarget {
  id: number;
  gender: Gender | null;
  dateOfBirth: Date | null;
  companyId: number;
  userId: number | null;
}

export interface ProfileInput {
  gender?: Gender;
  /** 'YYYY-MM-DD' */
  dateOfBirth?: string;
}

export type ProfileWritten = ProfileInput;

export interface FillProfileDeps {
  prisma: Pick<PrismaService, 'student' | 'user'>;
  entityHistory: Pick<EntityHistoryService, 'recordUpdate'>;
}

/**
 * Jins va tug'ilgan sanani kartaga yozadi — faqat hali bo'sh bo'lganini.
 * Xodim kiritgani ustun turadi: bu eshik birinchi marta to'ldirish uchun,
 * kartaning ikkinchi tahrirlagichi emas. Ilova eshigi (ADR-0039) ham, Telegram
 * so'rovi ham shu yerdan o'tadi. Nima yozilganini qaytaradi (`{}` = hech narsa).
 */
export async function fillStudentProfile(
  deps: FillProfileDeps,
  student: ProfileTarget,
  input: ProfileInput,
  actorUserId?: number,
): Promise<ProfileWritten> {
  const data: { gender?: Gender; dateOfBirth?: Date } = {};
  const written: ProfileWritten = {};

  if (input.gender && !student.gender) {
    data.gender = input.gender;
    written.gender = input.gender;
  }
  if (input.dateOfBirth && !student.dateOfBirth) {
    const problem = birthDateProblem(input.dateOfBirth);
    if (problem) throw new BadRequestException(problem);
    data.dateOfBirth = utcMidnightFromDateStr(input.dateOfBirth);
    written.dateOfBirth = input.dateOfBirth;
  }
  if (Object.keys(data).length === 0) return {};

  await deps.prisma.student.update({ where: { id: student.id }, data });
  if (data.gender && student.userId) {
    // Hisob kartadagi jinsni aks ettiradi (`User.gender`).
    await deps.prisma.user.update({
      where: { id: student.userId },
      data: { gender: data.gender },
    });
  }

  await deps.entityHistory.recordUpdate({
    entityType: 'Student',
    entityId: student.id,
    oldValues: {
      ...(written.gender && { gender: null }),
      ...(written.dateOfBirth && { dateOfBirth: null }),
    },
    newValues: {
      ...(written.gender && { gender: written.gender }),
      ...(written.dateOfBirth && { dateOfBirth: written.dateOfBirth }),
    },
    changedById: actorUserId,
    companyId: student.companyId,
  });

  return written;
}
```

- [ ] **Step 4: Pass ekanini tekshirish**

Run: `npx jest src/students/shared/fill-student-profile.spec.ts`
Expected: PASS (4 test).

- [ ] **Step 5: `updateProfile` ni shu funksiyaga o'tkazish**

`student-onboarding.service.ts` da `updateProfile` tanasini almashtiring (importlardan `birthDateProblem`, `utcMidnightFromDateStr` faqat boshqa joyda ishlatilmasa olib tashlang; `BadRequestException` va `Gender` boshqa metodlarda ishlatiladi — qoldiring):

```ts
  async updateProfile(
    studentId: number,
    userId: number,
    dto: UpdateOnboardingProfileDto,
  ): Promise<OnboardingStatus> {
    const student = await this.load(studentId);
    const written = await fillStudentProfile(
      { prisma: this.prisma, entityHistory: this.entityHistory },
      student,
      dto,
      userId,
    );
    if (!written.gender && !written.dateOfBirth) return this.toStatus(student);
    return this.toStatus(await this.load(studentId));
  }
```

va import qo'shing: `import { fillStudentProfile } from '../shared/fill-student-profile';`

- [ ] **Step 6: Mavjud o'quvchi onboarding testlari yashil ekanini tekshirish**

Run: `npx jest src/students/onboarding src/students/shared`
Expected: PASS. Agar `updateProfile` testi yangilangan holatni mock'dan kutib yiqilsa — mock'ni ikkinchi `findFirst` chaqiruvi yangilangan qatorni qaytaradigan qilib moslang (xulq o'zgarmagan, faqat qayta o'qiydi).

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write src/students/shared/fill-student-profile.ts src/students/shared/fill-student-profile.spec.ts src/students/onboarding/student-onboarding.service.ts
npx eslint --quiet src/students/shared src/students/onboarding
git add src/students/shared/fill-student-profile.ts src/students/shared/fill-student-profile.spec.ts src/students/onboarding/student-onboarding.service.ts
git commit -m "refactor(students): extract profile fill into a shared function" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Matn, tugma va sana tahlili (toza modul)

**Files:**
- Create: `server/src/telegram/profile-request/profile-request-text.ts`
- Create: `server/src/telegram/profile-request/profile-request-text.spec.ts`

**Interfaces:**
- Produces:
  - `type ProfileField = 'gender' | 'dateOfBirth'`
  - `PROFILE_REQUEST_MARKER: string` (xabar matnida doim bor; takror yuborishni to'xtatish kaliti)
  - `missingProfileFields(s: { gender: unknown; dateOfBirth: unknown }): ProfileField[]`
  - `buildRequestText(firstName: string, missing: ProfileField[]): string` (HTML, ism escape qilingan)
  - `type ProfileAction = { kind: 'gender'; studentId: number; gender: 'MALE' | 'FEMALE' } | { kind: 'date'; studentId: number } | { kind: 'preview'; step: 'gender' | 'date' }`
  - `profileCb.gender(id, g)`, `profileCb.date(id)`, `profileCb.preview(step)`: `callback_data` satrlari
  - `parseProfileCallback(data: string): ProfileAction | null`
  - `buildRequestKeyboard(target: number | 'preview', missing: ProfileField[])`: `Markup.inlineKeyboard`
  - `parseBirthDateInput(text: string, today?: string): { ok: true; iso: string } | { ok: false; message: string }`
  - Matn konstantalari: `DATE_PROMPT`, `GENDER_SAVED`, `THANKS`, `ALREADY_FILLED`, `NOT_YOURS`, `PREVIEW_NOTE`, `CANCELLED`

- [ ] **Step 1: Failing test yozish**

`profile-request-text.spec.ts`:

```ts
import {
  PROFILE_REQUEST_MARKER,
  buildRequestKeyboard,
  buildRequestText,
  missingProfileFields,
  parseBirthDateInput,
  parseProfileCallback,
  profileCb,
} from './profile-request-text';

describe('missingProfileFields', () => {
  it('lists only what is empty', () => {
    expect(missingProfileFields({ gender: null, dateOfBirth: null })).toEqual([
      'gender',
      'dateOfBirth',
    ]);
    expect(missingProfileFields({ gender: 'MALE', dateOfBirth: null })).toEqual(
      ['dateOfBirth'],
    );
    expect(
      missingProfileFields({ gender: null, dateOfBirth: new Date() }),
    ).toEqual(['gender']);
  });
});

describe('buildRequestText', () => {
  it('names the missing things and always carries the marker', () => {
    const both = buildRequestText('Aziz', ['gender', 'dateOfBirth']);
    expect(both).toContain('jinsingiz va tug\'ilgan sanangiz');
    expect(both).toContain(PROFILE_REQUEST_MARKER);
    expect(buildRequestText('Aziz', ['gender'])).toContain('jinsingiz yo\'q');
    expect(buildRequestText('Aziz', ['dateOfBirth'])).toContain(
      "tug'ilgan sanangiz yo'q",
    );
    expect(buildRequestText('Aziz', ['gender'])).toContain(
      PROFILE_REQUEST_MARKER,
    );
  });
  it('escapes the name for HTML', () => {
    expect(buildRequestText('<b>x', ['gender'])).toContain('&lt;b&gt;x');
  });
});

describe('callbacks', () => {
  it('round-trips and stays under 64 bytes', () => {
    const g = profileCb.gender(2147483647, 'FEMALE');
    expect(Buffer.byteLength(g)).toBeLessThanOrEqual(64);
    expect(parseProfileCallback(g)).toEqual({
      kind: 'gender',
      studentId: 2147483647,
      gender: 'FEMALE',
    });
    expect(parseProfileCallback(profileCb.date(12))).toEqual({
      kind: 'date',
      studentId: 12,
    });
    expect(parseProfileCallback(profileCb.preview('gender'))).toEqual({
      kind: 'preview',
      step: 'gender',
    });
  });
  it.each(['pf:g:abc:M', 'pf:g:5:X', 'pf:x:5', 'other', 'pf:d:', 'pf:d:1.5'])(
    'rejects %s',
    (bad) => expect(parseProfileCallback(bad)).toBeNull(),
  );
});

describe('buildRequestKeyboard', () => {
  const rows = (k: ReturnType<typeof buildRequestKeyboard>) =>
    k.reply_markup.inline_keyboard.flat().map((b: any) => b.callback_data);
  it('offers only what is missing', () => {
    expect(rows(buildRequestKeyboard(7, ['gender', 'dateOfBirth']))).toEqual([
      'pf:g:7:M',
      'pf:g:7:F',
      'pf:d:7',
    ]);
    expect(rows(buildRequestKeyboard(7, ['dateOfBirth']))).toEqual(['pf:d:7']);
    expect(rows(buildRequestKeyboard(7, ['gender']))).toEqual([
      'pf:g:7:M',
      'pf:g:7:F',
    ]);
  });
  it('uses preview callbacks that carry no student id', () => {
    expect(rows(buildRequestKeyboard('preview', ['gender', 'dateOfBirth']))).toEqual(
      ['pf:p:g', 'pf:p:g', 'pf:p:d'],
    );
  });
});

describe('parseBirthDateInput', () => {
  const today = '2026-10-25';
  it('accepts dd.mm.yyyy and loose separators', () => {
    expect(parseBirthDateInput('15.03.2005', today)).toEqual({
      ok: true,
      iso: '2005-03-15',
    });
    expect(parseBirthDateInput(' 5/3/2005 ', today)).toEqual({
      ok: true,
      iso: '2005-03-05',
    });
  });
  it.each(['2005', 'salom', '', '15.03.05', '2005-03-15'])(
    'asks again for the format on %p',
    (t) => {
      const r = parseBirthDateInput(t, today);
      expect(r.ok).toBe(false);
    },
  );
  it('returns the rule message for impossible or out-of-range dates', () => {
    const feb = parseBirthDateInput('30.02.2005', today);
    expect(feb).toEqual({ ok: false, message: "Tug'ilgan sana noto'g'ri" });
    const future = parseBirthDateInput('01.01.2030', today);
    expect(future.ok).toBe(false);
    const young = parseBirthDateInput('01.01.2024', today);
    expect(young).toEqual({
      ok: false,
      message: "Yosh 5 dan 100 gacha bo'lishi kerak",
    });
  });
});
```

- [ ] **Step 2: Fail ekanini tekshirish**

Run: `npx jest src/telegram/profile-request/profile-request-text.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Modulni yozish**

`profile-request-text.ts`:

```ts
import { Markup } from 'telegraf';
import { birthDateProblem } from '../../students/shared/student-onboarding';

export type ProfileField = 'gender' | 'dateOfBirth';

/** Har variantdagi o'zgarmas jumla: takror yuborishni to'xtatish kaliti. */
export const PROFILE_REQUEST_MARKER =
  'Shartnoma va ishtirok guvohnomasi kabi hujjatlar';

export const DATE_PROMPT =
  "Tug'ilgan sanangizni kun.oy.yil ko'rinishida yozing. Masalan: 15.03.2005";
export const GENDER_SAVED = '✅ Jinsingiz saqlandi.';
export const THANKS = "✅ Rahmat! Ma'lumotingiz saqlandi.";
export const ALREADY_FILLED = "Bu ma'lumot allaqachon kiritilgan. Rahmat!";
export const NOT_YOURS = 'Bu tugma sizning hisobingizga tegishli emas.';
export const PREVIEW_NOTE = "👁 Ko'rinish: hech narsa saqlanmadi.";
export const CANCELLED = 'Bekor qilindi.';
const DATE_FORMAT_HELP =
  "Sana kun.oy.yil ko'rinishida bo'lishi kerak. Masalan: 15.03.2005";

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function missingProfileFields(s: {
  gender: unknown;
  dateOfBirth: unknown;
}): ProfileField[] {
  const out: ProfileField[] = [];
  if (!s.gender) out.push('gender');
  if (!s.dateOfBirth) out.push('dateOfBirth');
  return out;
}

export function buildRequestText(
  firstName: string,
  missing: ProfileField[],
): string {
  const what =
    missing.length === 2
      ? "jinsingiz va tug'ilgan sanangiz"
      : missing[0] === 'gender'
        ? 'jinsingiz'
        : "tug'ilgan sanangiz";
  return (
    `Assalomu alaykum, ${esc(firstName)}!\n\n` +
    `Kartangizda ${what} yo'q. ${PROFILE_REQUEST_MARKER} to'g'ri tuzilishi uchun kerak.\n\n` +
    `Pastdagi tugmalar orqali kiriting — bir daqiqa. Rahmat!`
  );
}

export type ProfileAction =
  | { kind: 'gender'; studentId: number; gender: 'MALE' | 'FEMALE' }
  | { kind: 'date'; studentId: number }
  | { kind: 'preview'; step: 'gender' | 'date' };

export const profileCb = {
  gender: (id: number, g: 'MALE' | 'FEMALE') =>
    `pf:g:${id}:${g === 'MALE' ? 'M' : 'F'}`,
  date: (id: number) => `pf:d:${id}`,
  preview: (step: 'gender' | 'date') => `pf:p:${step === 'gender' ? 'g' : 'd'}`,
};

export function parseProfileCallback(data: string): ProfileAction | null {
  let m = /^pf:g:(\d+):([MF])$/.exec(data);
  if (m) {
    return {
      kind: 'gender',
      studentId: Number(m[1]),
      gender: m[2] === 'M' ? 'MALE' : 'FEMALE',
    };
  }
  m = /^pf:d:(\d+)$/.exec(data);
  if (m) return { kind: 'date', studentId: Number(m[1]) };
  m = /^pf:p:([gd])$/.exec(data);
  if (m) return { kind: 'preview', step: m[1] === 'g' ? 'gender' : 'date' };
  return null;
}

/** `target = 'preview'`: tugmalar hech narsa yozmaydi (`pf:p:*`). */
export function buildRequestKeyboard(
  target: number | 'preview',
  missing: ProfileField[],
) {
  const cb =
    target === 'preview'
      ? {
          male: profileCb.preview('gender'),
          female: profileCb.preview('gender'),
          date: profileCb.preview('date'),
        }
      : {
          male: profileCb.gender(target, 'MALE'),
          female: profileCb.gender(target, 'FEMALE'),
          date: profileCb.date(target),
        };
  const rows = [];
  if (missing.includes('gender')) {
    rows.push([
      Markup.button.callback("👦 O'g'il", cb.male),
      Markup.button.callback('👧 Qiz', cb.female),
    ]);
  }
  if (missing.includes('dateOfBirth')) {
    rows.push([Markup.button.callback("📅 Tug'ilgan sanani yozish", cb.date)]);
  }
  return Markup.inlineKeyboard(rows);
}

export function parseBirthDateInput(
  text: string,
  today?: string,
): { ok: true; iso: string } | { ok: false; message: string } {
  const m = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/.exec(text);
  if (!m) return { ok: false, message: DATE_FORMAT_HELP };
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const problem = birthDateProblem(iso, today);
  return problem ? { ok: false, message: problem } : { ok: true, iso };
}
```

- [ ] **Step 4: Pass ekanini tekshirish**

Run: `npx jest src/telegram/profile-request/profile-request-text.spec.ts`
Expected: PASS. (`'2005-03-15'` va `'15.03.05'` formatga mos kelmagani uchun `ok: false` — tugmadagi misol aynan `KK.OO.YYYY`.)

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/telegram/profile-request
npx eslint --quiet src/telegram/profile-request
git add src/telegram/profile-request
git commit -m "feat(telegram): profile request texts, keyboard and date parsing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Handlerlar, scene va botga ulash

**Files:**
- Create: `server/src/telegram/profile-request/profile-request.handlers.ts`
- Create: `server/src/telegram/profile-request/profile-request.handlers.spec.ts`
- Create: `server/src/telegram/scenes/profile-fill.scene.ts`
- Modify: `server/src/telegram/constants.ts` (`SCENES` ga `PROFILE_FILL: 'profile-fill'`)
- Modify: `server/src/telegram/telegram.service.ts` (importlar; `statementScene` yonida scene yaratish; `Stage([...])` ro'yxati; `menu_password` action yonida `pf:` action)

**Interfaces:**
- Consumes (Task 1–2): `fillStudentProfile`, `ProfileTarget`, `parseProfileCallback`, `parseBirthDateInput`, `ProfileAction`, matn konstantalari.
- Produces:
  - `interface ProfileCtx { chat?: { id: number | string }; reply(text: string, extra?: any): Promise<unknown>; answerCbQuery(text?: string): Promise<unknown>; scene: { enter(id: string, state?: object): Promise<unknown>; leave(): Promise<unknown> } }`
  - `interface ProfileDeps { prisma: PrismaService; entityHistory: EntityHistoryService }`
  - `handleProfileTap(deps, ctx, action: ProfileAction): Promise<void>`
  - `submitBirthDate(deps, ctx, studentId: number, text: string): Promise<'done' | 'retry'>`
  - `createProfileFillScene(deps: ProfileDeps): Scenes.BaseScene<BotContext>`

- [ ] **Step 1: Failing test yozish**

`profile-request.handlers.spec.ts`:

```ts
import { Gender } from '@prisma/client';
import { handleProfileTap, submitBirthDate } from './profile-request.handlers';
import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  THANKS,
} from './profile-request-text';

const row = (o: object = {}) => ({
  id: 7,
  gender: null,
  dateOfBirth: null,
  companyId: 1,
  userId: null,
  ...o,
});

function setup(found: object | null, chatId = 111) {
  const deps = {
    prisma: {
      student: {
        findFirst: jest.fn().mockResolvedValue(found),
        update: jest.fn().mockResolvedValue({}),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
    },
    entityHistory: { recordUpdate: jest.fn().mockResolvedValue(undefined) },
  };
  const ctx = {
    chat: { id: chatId },
    reply: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
    scene: {
      enter: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined),
    },
  };
  return { deps: deps as any, ctx, raw: deps };
}

describe('handleProfileTap', () => {
  it('looks the student up by id AND this chat', async () => {
    const { deps, ctx, raw } = setup(row());
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 7,
          telegramChatId: '111',
          deletedAt: null,
        }),
      }),
    );
  });

  it('writes nothing for a chat that does not own the card', async () => {
    const { deps, ctx, raw } = setup(null);
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'MALE',
    });
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS);
  });

  it('saves gender, then asks for the date when it is missing', async () => {
    const { deps, ctx, raw } = setup(row());
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { gender: Gender.FEMALE },
    });
    expect(ctx.reply).toHaveBeenCalledWith(GENDER_SAVED);
    expect(ctx.scene.enter).toHaveBeenCalledWith('profile-fill', {
      studentId: 7,
    });
  });

  it('saves gender and just thanks when the date is already there', async () => {
    const { deps, ctx } = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'MALE',
    });
    expect(ctx.reply).toHaveBeenCalledWith(THANKS);
    expect(ctx.scene.enter).not.toHaveBeenCalled();
  });

  it('says "already filled" on a stale gender button', async () => {
    const { deps, ctx, raw } = setup(row({ gender: Gender.MALE }));
    await handleProfileTap(deps, ctx, {
      kind: 'gender',
      studentId: 7,
      gender: 'FEMALE',
    });
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(ALREADY_FILLED);
  });

  it('date button enters the scene, or says already filled', async () => {
    const a = setup(row());
    await handleProfileTap(a.deps, a.ctx, { kind: 'date', studentId: 7 });
    expect(a.ctx.scene.enter).toHaveBeenCalledWith('profile-fill', {
      studentId: 7,
    });
    const b = setup(row({ dateOfBirth: new Date('2000-01-01') }));
    await handleProfileTap(b.deps, b.ctx, { kind: 'date', studentId: 7 });
    expect(b.ctx.scene.enter).not.toHaveBeenCalled();
    expect(b.ctx.reply).toHaveBeenCalledWith(ALREADY_FILLED);
  });

  it('preview taps never touch the database', async () => {
    const { deps, ctx, raw } = setup(null);
    await handleProfileTap(deps, ctx, { kind: 'preview', step: 'gender' });
    expect(raw.prisma.student.findFirst).not.toHaveBeenCalled();
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      `${PREVIEW_NOTE}\n\n${DATE_PROMPT}`,
    );
  });
});

describe('submitBirthDate', () => {
  it('saves a valid date and finishes', async () => {
    const { deps, ctx, raw } = setup(row());
    expect(await submitBirthDate(deps, ctx, 7, '15.03.2005')).toBe('done');
    expect(raw.prisma.student.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { dateOfBirth: new Date('2005-03-15T00:00:00.000Z') },
    });
    expect(ctx.reply).toHaveBeenCalledWith(THANKS);
  });

  it('explains the problem and asks again; nothing is saved', async () => {
    const { deps, ctx, raw } = setup(row());
    expect(await submitBirthDate(deps, ctx, 7, '01.01.2030')).toBe('retry');
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it('refuses a chat that does not own the card', async () => {
    const { deps, ctx, raw } = setup(null);
    expect(await submitBirthDate(deps, ctx, 7, '15.03.2005')).toBe('done');
    expect(raw.prisma.student.update).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(NOT_YOURS);
  });
});
```

- [ ] **Step 2: Fail ekanini tekshirish**

Run: `npx jest src/telegram/profile-request/profile-request.handlers.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Handlerlarni yozish**

`profile-request.handlers.ts`:

```ts
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import {
  ProfileTarget,
  fillStudentProfile,
} from '../../students/shared/fill-student-profile';
import { SCENES } from '../constants';
import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  NOT_YOURS,
  PREVIEW_NOTE,
  ProfileAction,
  THANKS,
  parseBirthDateInput,
} from './profile-request-text';

export interface ProfileCtx {
  chat?: { id: number | string };
  reply(text: string, extra?: any): Promise<unknown>;
  answerCbQuery(text?: string): Promise<unknown>;
  scene: {
    enter(id: string, state?: object): Promise<unknown>;
    leave(): Promise<unknown>;
  };
}

export interface ProfileDeps {
  prisma: PrismaService;
  entityHistory: EntityHistoryService;
}

/**
 * Karta SHU chatga bog'langan bo'lsagina qaytadi. Tugma ichidagi `studentId`
 * ga ishonilmaydi: begona chat boshqa o'quvchining kartasini o'zgartira olmasin.
 */
async function loadOwned(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  studentId: number,
): Promise<ProfileTarget | null> {
  if (!ctx.chat) return null;
  return deps.prisma.student.findFirst({
    where: {
      id: studentId,
      deletedAt: null,
      telegramChatId: String(ctx.chat.id),
    },
    select: {
      id: true,
      gender: true,
      dateOfBirth: true,
      companyId: true,
      userId: true,
    },
  });
}

export async function handleProfileTap(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  action: ProfileAction,
): Promise<void> {
  if (action.kind === 'preview') {
    // Ko'rinish rejimi: bazaga tegmaydi, faqat keyingi qadam matnini ko'rsatadi.
    await ctx.answerCbQuery();
    await ctx.reply(`${PREVIEW_NOTE}\n\n${DATE_PROMPT}`);
    return;
  }

  const student = await loadOwned(deps, ctx, action.studentId);
  if (!student) {
    await ctx.answerCbQuery(NOT_YOURS);
    return;
  }
  await ctx.answerCbQuery();

  if (action.kind === 'date') {
    if (student.dateOfBirth) {
      await ctx.reply(ALREADY_FILLED);
      return;
    }
    await ctx.scene.enter(SCENES.PROFILE_FILL, { studentId: student.id });
    return;
  }

  if (student.gender) {
    await ctx.reply(ALREADY_FILLED);
    return;
  }
  await fillStudentProfile(
    deps,
    student,
    { gender: action.gender },
    student.userId ?? undefined,
  );
  if (student.dateOfBirth) {
    await ctx.reply(THANKS);
    return;
  }
  await ctx.reply(GENDER_SAVED);
  await ctx.scene.enter(SCENES.PROFILE_FILL, { studentId: student.id });
}

/** 'retry' — sana qabul qilinmadi, scene ochiq qoladi. */
export async function submitBirthDate(
  deps: ProfileDeps,
  ctx: ProfileCtx,
  studentId: number,
  text: string,
): Promise<'done' | 'retry'> {
  const parsed = parseBirthDateInput(text);
  if (!parsed.ok) {
    await ctx.reply(parsed.message);
    return 'retry';
  }
  const student = await loadOwned(deps, ctx, studentId);
  if (!student) {
    await ctx.reply(NOT_YOURS);
    return 'done';
  }
  if (student.dateOfBirth) {
    await ctx.reply(ALREADY_FILLED);
    return 'done';
  }
  await fillStudentProfile(
    deps,
    student,
    { dateOfBirth: parsed.iso },
    student.userId ?? undefined,
  );
  await ctx.reply(THANKS);
  return 'done';
}
```

- [ ] **Step 4: Handler testlari o'tishini tekshirish**

Run: `npx jest src/telegram/profile-request`
Expected: PASS (text + handlers).

- [ ] **Step 5: Scene va ulash**

`constants.ts` da `SCENES` ga qo'shing: `PROFILE_FILL: 'profile-fill',`

`server/src/telegram/scenes/profile-fill.scene.ts`:

```ts
import { Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { withProcessingLock } from '../utils/processing-lock';
import {
  ProfileDeps,
  submitBirthDate,
} from '../profile-request/profile-request.handlers';
import { CANCELLED, DATE_PROMPT } from '../profile-request/profile-request-text';

/**
 * Tug'ilgan sana kutadigan kichik scene. Tugma bosilganda
 * `ctx.scene.enter(PROFILE_FILL, { studentId })` bilan ochiladi; to'g'ri sana
 * yozilguncha yoki /cancel gacha ochiq turadi.
 */
export function createProfileFillScene(
  deps: ProfileDeps,
): Scenes.BaseScene<BotContext> {
  const scene = new Scenes.BaseScene<BotContext>(SCENES.PROFILE_FILL);

  scene.enter(async (ctx) => {
    await ctx.reply(DATE_PROMPT);
  });

  scene.command('cancel', async (ctx) => {
    await ctx.reply(CANCELLED);
    await ctx.scene.leave();
  });

  scene.on(message('text'), async (ctx) => {
    if (ctx.session.processing) return;
    const studentId = (ctx.scene.state as { studentId?: number }).studentId;
    if (!studentId) {
      await ctx.scene.leave();
      return;
    }
    await withProcessingLock(ctx, async () => {
      const result = await submitBirthDate(
        deps,
        ctx,
        studentId,
        ctx.message.text,
      );
      if (result === 'done') await ctx.scene.leave();
    });
  });

  return scene;
}
```

`telegram.service.ts`:
1. Importlar yoniga:
```ts
import { createProfileFillScene } from './scenes/profile-fill.scene';
import { handleProfileTap } from './profile-request/profile-request.handlers';
import { parseProfileCallback } from './profile-request/profile-request-text';
```
2. `const statementScene = ...` dan keyin:
```ts
    const profileFillScene = createProfileFillScene({
      prisma: this.prisma,
      entityHistory: this.entityHistoryService,
    });
```
3. `new Scenes.Stage<BotContext>([...])` ro'yxatiga `profileFillScene` qo'shing.
4. `this.bot.action('menu_password', ...)` dan oldin:
```ts
    // Jins / tug'ilgan sana so'rovi tugmalari (kampaniya skripti yuboradi)
    this.bot.action(/^pf:/, async (ctx) => {
      const data = (ctx.callbackQuery as { data?: string }).data ?? '';
      const action = parseProfileCallback(data);
      if (!action) {
        await ctx.answerCbQuery();
        return;
      }
      await handleProfileTap(
        { prisma: this.prisma, entityHistory: this.entityHistoryService },
        ctx,
        action,
      );
    });
```
(`this.prisma` va `this.entityHistoryService` allaqachon shu klassda ishlatiladi: scene yaratish qatorlariga qarang.)

- [ ] **Step 6: Typecheck va bot testlari**

Run: `npm run typecheck` va `npx jest src/telegram`
Expected: ikkalasi ham yashil. Typecheck `ctx` → `ProfileCtx` moslashuvida yiqilsa — `ProfileCtx.reply`/`scene.enter` imzosini `BotContext` ga moslab torroq emas, kengroq qiling (`any` extra), mantiqqa tegmang.

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write src/telegram/profile-request src/telegram/scenes/profile-fill.scene.ts src/telegram/constants.ts src/telegram/telegram.service.ts
npx eslint --quiet src/telegram
git add src/telegram
git commit -m "feat(telegram): collect gender and birth date through bot buttons and a date scene" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Yuboruvchi skript (sinov / preview / apply)

**Files:**
- Create: `server/scripts/lib/profile-request-plan.ts`
- Create: `server/scripts/lib/profile-request-plan.spec.ts`
- Create: `server/scripts/send-profile-request.ts`

**Interfaces:**
- Consumes (Task 2): `missingProfileFields`, `buildRequestText`, `buildRequestKeyboard`, `PROFILE_REQUEST_MARKER`, `THANKS`, `ALREADY_FILLED`, `GENDER_SAVED`, `DATE_PROMPT`; `parseApplyExpectArgs`, `UsageError` (`scripts/lib/apply-expect-args.ts`).
- Produces:
  - `type RunMode = { mode: 'dry' } | { mode: 'preview'; chatId: string } | { mode: 'apply'; expect: number }`
  - `parseProfileRequestArgs(argv: string[]): RunMode` (`UsageError` bilan rad etadi)
  - `buildPreviewMessages(): { text: string; keyboard?: ReturnType<typeof buildRequestKeyboard> }[]`

- [ ] **Step 1: Failing test yozish**

`scripts/lib/profile-request-plan.spec.ts`:

```ts
import { UsageError } from './apply-expect-args';
import {
  buildPreviewMessages,
  parseProfileRequestArgs,
} from './profile-request-plan';

describe('parseProfileRequestArgs', () => {
  it('no args = dry run', () =>
    expect(parseProfileRequestArgs([])).toEqual({ mode: 'dry' }));
  it('reads --preview=<chatId>', () => {
    expect(parseProfileRequestArgs(['--preview=123456'])).toEqual({
      mode: 'preview',
      chatId: '123456',
    });
    expect(parseProfileRequestArgs(['--preview=-100123'])).toEqual({
      mode: 'preview',
      chatId: '-100123',
    });
  });
  it('reads --apply --expect=N', () =>
    expect(parseProfileRequestArgs(['--apply', '--expect=40'])).toEqual({
      mode: 'apply',
      expect: 40,
    }));
  it.each([
    [['--preview=abc']],
    [['--preview=']],
    [['--preview=1', '--apply', '--expect=2']],
    [['--preview=1', '--expect=2']],
    [['--apply']],
    [['--bogus']],
  ])('refuses %j', (argv) =>
    expect(() => parseProfileRequestArgs(argv)).toThrow(UsageError),
  );
});

describe('buildPreviewMessages', () => {
  const msgs = buildPreviewMessages();
  it('covers the three request variants and the bot replies', () => {
    expect(msgs.length).toBeGreaterThanOrEqual(5);
    expect(msgs.filter((m) => m.keyboard).length).toBe(3);
    const joined = msgs.map((m) => m.text).join('\n');
    expect(joined).toContain('jinsingiz va tug\'ilgan sanangiz');
    expect(joined).toContain("Rahmat! Ma'lumotingiz saqlandi");
  });
  it('preview buttons never carry a student id', () => {
    for (const m of msgs) {
      const data = (m.keyboard?.reply_markup.inline_keyboard ?? [])
        .flat()
        .map((b: any) => b.callback_data);
      for (const d of data) expect(d).toMatch(/^pf:p:[gd]$/);
    }
  });
});
```

- [ ] **Step 2: Fail ekanini tekshirish**

Run: `npx jest scripts/lib/profile-request-plan.spec.ts`
Expected: FAIL — modul topilmadi.

- [ ] **Step 3: Toza qismni yozish**

`scripts/lib/profile-request-plan.ts`:

```ts
import {
  ALREADY_FILLED,
  DATE_PROMPT,
  GENDER_SAVED,
  THANKS,
  buildRequestKeyboard,
  buildRequestText,
} from '../../src/telegram/profile-request/profile-request-text';
import { UsageError, parseApplyExpectArgs } from './apply-expect-args';

export type RunMode =
  | { mode: 'dry' }
  | { mode: 'preview'; chatId: string }
  | { mode: 'apply'; expect: number };

const USAGE =
  'Usage: send-profile-request.ts [--preview=<chatId> | --apply --expect=<N>]';

export function parseProfileRequestArgs(argv: string[]): RunMode {
  const preview = argv.find((a) => a.startsWith('--preview='));
  if (preview) {
    if (argv.length !== 1) {
      throw new UsageError(`--preview cannot be combined with others. ${USAGE}`);
    }
    const chatId = preview.slice('--preview='.length);
    if (!/^-?\d+$/.test(chatId)) {
      throw new UsageError(`--preview needs a numeric chat id. ${USAGE}`);
    }
    return { mode: 'preview', chatId };
  }
  const { apply, expect } = parseApplyExpectArgs(argv, USAGE);
  if (apply) return { mode: 'apply', expect: expect as number };
  if (expect !== null) {
    throw new UsageError(`--expect only goes with --apply. ${USAGE}`);
  }
  return { mode: 'dry' };
}

/**
 * CEO o'z chatida ko'radigan to'plam: uch so'rov varianti (tugmalari bosilsa
 * hech narsa yozilmaydi) va botning javob matnlari.
 */
export function buildPreviewMessages() {
  const name = 'Aziz';
  return [
    {
      text: buildRequestText(name, ['gender', 'dateOfBirth']),
      keyboard: buildRequestKeyboard('preview', ['gender', 'dateOfBirth']),
    },
    {
      text: buildRequestText(name, ['gender']),
      keyboard: buildRequestKeyboard('preview', ['gender']),
    },
    {
      text: buildRequestText(name, ['dateOfBirth']),
      keyboard: buildRequestKeyboard('preview', ['dateOfBirth']),
    },
    {
      text:
        '👁 <b>Botning javoblari</b> (namuna):\n\n' +
        `Jins tanlangach: ${GENDER_SAVED}\n` +
        `Keyin: ${DATE_PROMPT}\n` +
        `Sana saqlangach: ${THANKS}\n` +
        `Eski tugma bosilsa: ${ALREADY_FILLED}\n` +
        "Sana xato bo'lsa (masalan 01.01.2030): Tug'ilgan sana kelajakda bo'lishi mumkin emas",
    },
  ];
}
```

- [ ] **Step 4: Pass ekanini tekshirish**

Run: `npx jest scripts/lib/profile-request-plan.spec.ts`
Expected: PASS.

- [ ] **Step 5: Skriptni yozish**

`scripts/send-profile-request.ts` (`send-student-ids.ts` tuzilishi; testlanmaydi — toza qismlar Step 3 da testlangan):

```ts
/**
 * Jinsi yoki tug'ilgan sanasi kartada yo'q faol o'quvchilarga Telegram'da so'rov
 * yuboradi (tugmalar + sana scene'i: server/src/telegram/profile-request).
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/send-profile-request.ts [rejim]
 *
 * Rejimlar (tartib bilan):
 *   (bo'sh)             sinov: hech narsa yuborilmaydi, son va namuna chiqadi
 *   --preview=<chatId>  hamma xabar variantlari FAQAT shu chatga; tugmalar hech
 *                       narsa yozmaydi, bazaga tegilmaydi
 *   --apply --expect=N  haqiqiy yuborish; son farq qilsa yozishdan oldin to'xtaydi
 *
 * Preview tugmalari ishlashi uchun bot kodi (pf: handlerlari) deploy qilingan
 * bo'lishi kerak. Bir marta: SmsMessage'da shu matnli SENT yozuvi bor o'quvchi
 * o'tkazib yuboriladi, shuning uchun skriptni qayta ishga tushirish xavfsiz.
 */
import { Telegram } from 'telegraf';
import { sendTelegramText } from '../src/telegram-digest/telegram-send';
import {
  PROFILE_REQUEST_MARKER,
  buildRequestKeyboard,
  buildRequestText,
  missingProfileFields,
} from '../src/telegram/profile-request/profile-request-text';
import { printHeader, run } from './lib/check-cli';
import { UsageError } from './lib/apply-expect-args';
import {
  buildPreviewMessages,
  parseProfileRequestArgs,
} from './lib/profile-request-plan';

/** Telegram: bir chatga sekundiga 1, umumiy ~30; 20/s xavfsiz. */
const GAP_MS = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function botTelegram(): Telegram {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN yo‘q');
  return new Telegram(token);
}

void run(async (prisma) => {
  let mode;
  try {
    mode = parseProfileRequestArgs(process.argv.slice(2));
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      process.exitCode = 2;
      return;
    }
    throw e;
  }

  printHeader(
    mode.mode === 'apply'
      ? "Jins/sana so'rovi — YUBORISH"
      : mode.mode === 'preview'
        ? "Jins/sana so'rovi — KO'RINISH (faqat sizga)"
        : "Jins/sana so'rovi — sinov",
  );

  if (mode.mode === 'preview') {
    const bot = { telegram: botTelegram() };
    for (const m of buildPreviewMessages()) {
      const out = await sendTelegramText(bot, mode.chatId, m.text, {
        parse_mode: 'HTML',
        ...(m.keyboard && { reply_markup: m.keyboard.reply_markup }),
      });
      console.log(out.ok ? 'yuborildi' : `xato: ${out.kind} ${out.description}`);
      await sleep(GAP_MS);
    }
    return;
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      enrollments: {
        some: {
          deletedAt: null,
          status: 'ACTIVE',
          group: { deletedAt: null, statusEnum: { in: ['ACTIVE', 'PAUSED'] } },
        },
      },
      telegramChatId: { not: null },
      telegramDisconnectedAt: null,
      OR: [{ gender: null }, { dateOfBirth: null }],
    },
    select: {
      id: true,
      firstName: true,
      companyId: true,
      telegramChatId: true,
      gender: true,
      dateOfBirth: true,
    },
    orderBy: { id: 'asc' },
  });
  const done = new Set(
    (
      await prisma.smsMessage.findMany({
        where: { status: 'SENT', content: { contains: PROFILE_REQUEST_MARKER } },
        select: { studentId: true },
      })
    ).map((s) => s.studentId),
  );

  const todo = students.filter((s) => !done.has(s.id));
  const both = todo.filter((s) => !s.gender && !s.dateOfBirth).length;
  console.log(`Yuboriladigan o'quvchilar: ${todo.length}`);
  console.log(
    `  ikkalasi yo'q: ${both}, faqat jins: ${todo.filter((s) => !s.gender && s.dateOfBirth).length}, faqat sana: ${todo.filter((s) => s.gender && !s.dateOfBirth).length}`,
  );
  console.log(`Oldin yuborilgani (o'tkazib yuboriladi): ${done.size}`);
  if (todo[0]) {
    console.log(
      `\n── Namuna ──\n${buildRequestText(todo[0].firstName, missingProfileFields(todo[0]))}\n`,
    );
  }

  if (mode.mode === 'dry') {
    console.log(
      `Sinov. Ko'rinish: --preview=<chatId>. Yuborish: --apply --expect=${todo.length}`,
    );
    return;
  }
  if (todo.length !== mode.expect) {
    throw new Error(
      `O'quvchilar soni ${todo.length}, kutilgan ${mode.expect} — to'xtadi`,
    );
  }

  const bot = { telegram: botTelegram() };
  let sent = 0;
  let failed = 0;
  for (const s of todo) {
    const missing = missingProfileFields(s);
    const text = buildRequestText(s.firstName, missing);
    const out = await sendTelegramText(bot, s.telegramChatId as string, text, {
      parse_mode: 'HTML',
      reply_markup: buildRequestKeyboard(s.id, missing).reply_markup,
    });
    await prisma.smsMessage.create({
      data: {
        studentId: s.id,
        content: text,
        type: 'AUTO',
        status: out.ok ? 'SENT' : 'FAILED',
        telegramMessageId: out.ok ? out.messageId : null,
        errorMessage: out.ok ? null : out.description,
        companyId: s.companyId,
      },
    });
    if (out.ok) sent += 1;
    else {
      failed += 1;
      console.warn(`student ${s.id}: ${out.kind} ${out.description}`);
    }
    await sleep(GAP_MS);
  }
  console.log(`Tayyor: yuborildi ${sent}, xato ${failed}`);
  if (failed) process.exitCode = 1;
});
```

- [ ] **Step 6: Typecheck va sinov rejimi (DEV baza)**

Run: `npm run typecheck`
Expected: yashil.

Run (DEV `.env`, hech narsa yuborilmaydi): `npx ts-node --transpile-only scripts/send-profile-request.ts`
Expected: sarlavha `DEV · …`, "Yuboriladigan o'quvchilar: N", namuna matn, "Sinov. …". Dev baza ma'noli ma'lumot bermasligi mumkin — faqat ishga tushishini tekshiring.

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write scripts/send-profile-request.ts scripts/lib/profile-request-plan.ts scripts/lib/profile-request-plan.spec.ts
npx eslint --quiet scripts/send-profile-request.ts scripts/lib/profile-request-plan.ts scripts/lib/profile-request-plan.spec.ts
git add scripts/send-profile-request.ts scripts/lib/profile-request-plan.ts scripts/lib/profile-request-plan.spec.ts
git commit -m "feat(scripts): one-off Telegram request for missing gender and birth date" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: ADR qo'shimchasi va yakuniy tekshiruv

**Files:**
- Modify: `docs/adr/0039-oquvchi-birinchi-kirishda-telefon-jins-yosh.md`
- Add (commit): `docs/superpowers/specs/2026-10-25-telegramdan-jins-sana-sorash-design.md`, shu reja fayli

- [ ] **Step 1: ADR-0039 oxiriga qo'shish**

Fayl oxiriga yangi bo'lim qo'shing (oldin faylning mavjud sarlavha uslubini ko'rib moslang):

```markdown
## Qo'shimcha (2026-10-25): Telegram orqali so'rash

Jinsi yoki tug'ilgan sanasi bo'sh faol o'quvchilarga bot bir martalik xabar
yuboradi (`scripts/send-profile-request.ts`): jins — tugma, sana — `KK.OO.YYYY`
matni. Yozish ilova bilan bir xil funksiyadan o'tadi
(`students/shared/fill-student-profile.ts`): bo'sh bo'lmagan maydon
qayta yozilmaydi, tarix yoziladi. Ilova eshigi o'zgarmadi — Telegram qo'shimcha
yo'l. Tugma ichidagi o'quvchi raqamiga ishonilmaydi: karta shu chatga
bog'langan bo'lsagina yoziladi.
```

- [ ] **Step 2: To'liq tekshiruv (o'zgarishdan keyin bir marta)**

Run (`server/` ichida), ketma-ket:
```bash
npx prettier --check src/students src/telegram scripts/send-profile-request.ts scripts/lib/profile-request-plan.ts scripts/lib/profile-request-plan.spec.ts
npx eslint --quiet src/students src/telegram scripts/send-profile-request.ts scripts/lib
npm run typecheck
npx jest src/students src/telegram scripts/lib
```
Expected: hammasi yashil. (`npm run build` bilan `jest` ni parallel ishga tushirmang — Prisma client to'qnashadi.)

- [ ] **Step 3: Commit**

```bash
git add ../docs/adr/0039-oquvchi-birinchi-kirishda-telefon-jins-yosh.md ../docs/superpowers/specs/2026-10-25-telegramdan-jins-sana-sorash-design.md ../docs/superpowers/plans/2026-10-25-telegramdan-jins-sana-sorash.md
git commit -m "docs: ADR-0039 addendum, spec and plan for the Telegram profile request" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Chiqarish tartibi (kod tayyor bo'lgach, CEO bilan)

Bu bosqichlar kod emas, ruxsat talab qiladi. Har birini CEO ko'rib tasdiqlamaguncha keyingisiga o'tmang.

1. PR ochiladi va CEO merge qiladi; **merge deploy qilmaydi**: bot kodini Railway'ga qo'lda chiqarish kerak (`deploy` skill / `railway up server --path-as-root --service caring-courage --environment production`). Preview tugmalari (`pf:p:*`) bot deploy bo'lmaguncha ishlamaydi.
2. CEO'ning Telegram chat ID'sini aniqlang (xodim kartasi/`check-employee` yoki CEO'dan so'rang).
3. **Preview:** `railway run … npx ts-node --transpile-only scripts/send-profile-request.ts --preview=<chatId>`. CEO 4 ta xabarni ko'radi, tugmalarni bosib ko'radi (hech narsa yozilmaydi).
4. CEO matn va tugmalarni tasdiqlaydi (yoki o'zgartirish aytadi → `profile-request-text.ts` tahrirlanadi, qayta preview).
5. **Sinov:** flagsiz ishga tushiring — N ni ko'rsating.
6. CEO «yubor» deydi → `--apply --expect=N`. Natija (yuborildi/xato) CEO'ga oddiy tilda hisobot qilinadi.
7. Bilinadigan cheklov: kanal a'zoligi eshigi (`ensureChannelMembership`) yoqilgan bo'lsa, kanalga a'zo bo'lmagan o'quvchi tugmani bosganda avval kanalga a'zo bo'lish so'rovini ko'radi.

## Self-review (spec bo'yicha)

- Qamrov, sinov/preview/apply, `SmsMessage` bilan bir martalik → Task 4.
- Xabar matni va tugmalar → Task 2 (matn spec qoralamasi bilan bir xil).
- Egalik tekshiruvi, jinsdan keyin sana, scene, `birthDateProblem`, `updateProfile` qayta ishlatish, «allaqachon kiritilgan» → Task 1 + 3.
- ADR-0039 qo'shimchasi → Task 5.
- Test ro'yxati: sana tahlili (Task 2), egalik (Task 3), qamrov so'rovi — to'g'ridan-to'g'ri jest testi yo'q (skript DB ga bog'liq, `send-student-ids.ts` kabi); qamrov DEV sinovida va prod sinov rejimida (Task 4 Step 6, Chiqarish 5) ko'riladi.
- Qilinmaydi (takror eslatma, avtomatik so'rov, Mini App formasi): rejaga kiritilmagan.
