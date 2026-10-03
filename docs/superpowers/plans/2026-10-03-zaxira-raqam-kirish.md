# Zaxira raqam bilan kirish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student's backup number (`Student.extraPhone`) opens the student portal (password, and the web «Telegram orqali kirish» button); admins enter and see it, students add/change/remove it from their profile behind their password + an SMS code.

**Architecture:** Sign-in gets a second lookup stage in `AuthService` (main number first, backup second, student portal only). One rule module decides whether a backup number is free; every writer of `Student.extraPhone` goes through it. The ADR-0039 SMS code machinery is extracted from the 621-line onboarding service into `students/shared/phone-code.ts` so a new `StudentExtraPhoneService` can reuse it with its own code slot. The client adds the admin input, the card rows and the portal row + dialog.

**Tech Stack:** NestJS + Prisma 7 + Redis (server, Jest), Next.js + React Query + Lumio primitives (client, Vitest). No migration — `Student.extraPhone` exists.

**Spec:** `docs/superpowers/specs/2026-10-02-zaxira-raqam-kirish-design.md` (read it once, fully, before Task 1).

## Global Constraints

- Work in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/zaxira-raqam-kirish` (branch `worktree-zaxira-raqam-kirish`). Every command below is relative to its root. Never `cd` outside it.
- Server tests: `cd server && npx jest <path>`. Typecheck: `cd server && npm run typecheck`. Lint: `cd server && npx eslint <files> --quiet`. Format every touched `server/**/*.ts` with `cd server && npx prettier --write <files>` before committing.
- Client checks: `cd client && npx tsc --noEmit`, `cd client && npx vitest run <path>`, `cd client && npm run lint 2>&1 | tail -5`. **Never run prettier on `client/`.**
- Screen text: Uzbek, Latin script only, no English words. Commit messages: Uzbek, conventional prefix (`feat(...)`, `test(...)`, `docs(...)`), ending with the `Co-Authored-By` line the session reminder names. New code comments: short, in the language of the surrounding file.
- Phone numbers are stored as 9 digits. A backup number is always a 9-digit Uzbek number (`^\d{9}$`).
- Field name everywhere on screen: **«Zaxira raqam»**. Server messages (verbatim, defined once in `extra-phone-rule.ts` / the service):
  - `Zaxira raqam asosiy raqam bilan bir xil bo'lmasin`
  - `Bu raqam boshqa o'quvchida bor: <Ism Familiya>` (staff), `Bu raqam boshqa o'quvchi hisobida bor` (staff, account only)
  - `Bu raqamni qo'shib bo'lmaydi` (student)
  - `Zaxira raqamni hozircha administrator qo'shadi` (door closed)
- Binding ADRs: 0022 (one person — one account per role), 0031 (own sign-in keys change only with the current password → `OwnPasswordAttemptGuard`), 0032/0033 (card ↔ account), 0039 (SMS proof, the `STUDENT_PHONE_VERIFICATION_ENABLED` switch), 0040/0045 (bot and Mini App are NOT changed). New ADR: **0070** — check `docs/adr/README.md` on `origin/main` for the next free number before committing Task 13.
- Guard specs that must stay green: `server/src/students/student-phone.single-source.spec.ts`, `server/src/students/phone-proof.single-source.spec.ts`, `server/src/common/guards/own-password-attempt.routes.spec.ts`, `server/src/common/auth/branch-route-policy.spec.ts`, `server/src/common/auth/student-account.single-source.spec.ts`.

---

## File Structure

**Server — create**
- `server/src/students/shared/phone-code.ts` — the SMS code policy (limits, Redis keys, issue/read/reject/clear, `buildPhoneVerifyMessage`) as plain functions taking a `PhoneCodeDeps` object. Two code slots (`'card'` | `'extra'`), shared counters.
- `server/src/students/shared/phone-code.spec.ts`
- `server/src/students/shared/current-password.ts` — `assertCurrentPassword(prisma, userId, password)` (moved out of the onboarding service).
- `server/src/students/shared/extra-phone-rule.ts` — `findExtraPhoneHolder` / `assertExtraPhoneFree` + messages. The ONE definition of "is this backup number free".
- `server/src/students/shared/extra-phone-rule.spec.ts`
- `server/src/students/extra-phone/student-extra-phone.service.ts` — status / sendCode / verify / remove.
- `server/src/students/extra-phone/student-extra-phone.service.spec.ts`
- `server/src/students/extra-phone/student-extra-phone.controller.ts` — `GET|POST /student-portal/extra-phone[/send-code|/verify|/remove]`.
- `server/src/students/extra-phone/student-extra-phone.controller.spec.ts`
- `server/src/students/extra-phone/dto/extra-phone-send-code.dto.ts`, `extra-phone-verify.dto.ts`, `extra-phone-remove.dto.ts`
- `server/src/students/students-write.extra-phone.spec.ts`
- `server/src/archive/archive-restore.extra-phone.spec.ts`
- `docs/adr/0070-zaxira-raqam-ikkinchi-kirish-kaliti.md`

**Server — modify**
- `server/src/students/onboarding/student-onboarding.service.ts` — delegate to `phone-code.ts`; clear own `extraPhone` when the new main number equals it.
- `server/src/students/students-write.service.ts` — rule on create/update.
- `server/src/leads/leads.service.ts` — drop a taken backup number at conversion.
- `server/src/archive/archive-restore.service.ts` — clear a taken backup number on restore.
- `server/src/auth/auth.service.ts` — two-stage lookup.
- `server/src/students/students.module.ts` — register controller + service.
- `server/src/common/auth/branch-route-policy.ts` — SELF block for the four routes.
- `server/src/common/guards/own-password-attempt.routes.spec.ts` — two new doors.
- `server/src/auth/auth.service.spec.ts`, `server/src/students/onboarding/student-onboarding.service.spec.ts`, `server/src/leads/leads.service.spec.ts` — new tests.
- `server/CLAUDE.md`, `docs/adr/README.md`.

**Client — create**
- `client/src/components/students/student-phone-rows.ts` + `.test.ts` — the card's phone rows (pure).
- `client/src/components/students/edit-student-additional-fields.test.ts`
- `client/src/components/student-portal/extra-phone-row-state.ts` + `.test.ts` — the profile row's state (pure).
- `client/src/components/student-portal/student-extra-phone-dialog.tsx` — add/change (phone + password → code) and remove (password).

**Client — modify**
- `client/src/components/students/edit-student-additional-fields.tsx` — «Zaxira raqam» section; sections with a value open on mount.
- `client/src/components/students/add-student-dialog.tsx`, `client/src/lib/schemas/student-schema.ts` — optional «Zaxira raqam» on create.
- `client/src/components/students/student-profile-card.tsx` — three named rows.
- `client/src/components/shared/entity-history-utils.ts`, `client/src/components/leads/lead-additional-fields.tsx` — label «Zaxira raqam».
- `client/src/components/student-portal/lib/types.ts`, `lib/queries.ts`, `student-profile-page.tsx` — the row.

---

### Task 0: Worktree setup and baseline

**Files:** none changed.

- [ ] **Step 1: Install dependencies (the worktree shares no `node_modules`)**

```bash
cd server && npm install && npx prisma generate
cd ../client && npx npm@10 install
```

- [ ] **Step 2: Baseline — the specs this plan touches are green before any change**

```bash
cd server && npx jest src/students/onboarding src/auth/auth.service.spec.ts src/students/student-phone.single-source.spec.ts src/common/guards/own-password-attempt.routes.spec.ts src/common/auth/branch-route-policy.spec.ts
```
Expected: all PASS.

---

### Task 1: Extract the SMS code machinery into `students/shared/phone-code.ts`

**Files:**
- Create: `server/src/students/shared/phone-code.ts`, `server/src/students/shared/phone-code.spec.ts`, `server/src/students/shared/current-password.ts`
- Modify: `server/src/students/onboarding/student-onboarding.service.ts`
- Test: `server/src/students/onboarding/student-onboarding.service.spec.ts` (unchanged, must stay green)

**Interfaces:**
- Produces (used by Tasks 6, 8):
  - `type PhoneCodePurpose = 'card' | 'extra'`
  - `interface StoredCode { h: string; n: number; p: string; from?: string }`
  - `type SendResult = { phone: string; expiresInSec: number; resendInSec: number }`
  - `interface PhoneCodeDeps { prisma: Pick<PrismaService, 'smsMessage'>; redis: RedisService; eskiz: Pick<EskizService, 'sendSms'>; logger: Logger; globalHourlyCap: number }`
  - `type CodeStudent = { id: number; companyId: number }`
  - `codeKey(purpose, studentId): string`, `hashCode(code): string`, `hit(redis, key, ttlSec): Promise<number>`
  - `assertVerifyAllowed(redis, studentId): Promise<void>`, `assertNumberNotFlooded(redis, phone): Promise<void>`
  - `issuePhoneCode(deps, purpose, student, target, { from?, typedByStudent }): Promise<SendResult>`
  - `readStoredCode(redis, purpose, studentId): Promise<StoredCode | null>`, `rejectCode(redis, purpose, studentId, stored): Promise<never>`, `clearCode(redis, purpose, studentId): Promise<void>`
  - `buildPhoneVerifyMessage(code): string`, `INVALID_CODE_MESSAGE`
  - `assertCurrentPassword(prisma, userId, currentPassword): Promise<void>` + `WRONG_CURRENT_PASSWORD_MESSAGE` (from `current-password.ts`)

- [ ] **Step 1: Write the failing spec for the shared module**

`server/src/students/shared/phone-code.spec.ts`:

```ts
import { BadRequestException, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  buildPhoneVerifyMessage,
  clearCode,
  codeKey,
  hashCode,
  issuePhoneCode,
  readStoredCode,
  rejectCode,
} from './phone-code';

/** Minimal in-memory Redis honouring the ops the module uses. */
function makeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async set(k: string, v: any, mode?: string, ttl?: number) {
      store.set(k, String(v));
      if (mode === 'EX' && ttl) ttls.set(k, Number(ttl));
      return 'OK';
    },
    async del(k: string) {
      const had = store.delete(k);
      ttls.delete(k);
      return had ? 1 : 0;
    },
    async incr(k: string) {
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, String(n));
      return n;
    },
    async decr(k: string) {
      const n = (Number(store.get(k)) || 0) - 1;
      store.set(k, String(n));
      return n;
    },
    async expire(k: string, s: number) {
      ttls.set(k, s);
      return 1;
    },
    async ttl(k: string) {
      if (ttls.has(k)) return ttls.get(k)!;
      return store.has(k) ? -1 : -2;
    },
  };
}

const STUDENT = { id: 10077, companyId: 1 };
const TARGET = '935554433';

function deps() {
  const redis = makeRedis();
  const eskiz = { sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }) };
  const prisma = { smsMessage: { create: jest.fn().mockResolvedValue({}) } };
  return {
    redis,
    eskiz,
    prisma,
    d: {
      prisma: prisma as any,
      redis: redis as any,
      eskiz,
      logger: new Logger('test'),
      globalHourlyCap: 300,
    },
  };
}

describe('phone-code — one slot per purpose, shared limits', () => {
  it('keeps the card code and the backup-number code in different slots', () => {
    expect(codeKey('card', 1)).toBe('phone_verify:code:1');
    expect(codeKey('extra', 1)).toBe('extra_phone:code:1');
  });

  it('issues a backup-number code into the extra slot only', async () => {
    const { d, redis, eskiz, prisma } = deps();
    const res = await issuePhoneCode(d, 'extra', STUDENT, TARGET, {
      typedByStudent: true,
    });
    expect(res.phone).toBe(TARGET);
    expect(await readStoredCode(redis as any, 'card', STUDENT.id)).toBeNull();
    const stored = await readStoredCode(redis as any, 'extra', STUDENT.id);
    expect(stored?.p).toBe(TARGET);
    expect(stored?.n).toBe(3);
    const [, text] = eskiz.sendSms.mock.calls[0];
    expect(text).toBe(buildPhoneVerifyMessage(/(\d{4})$/.exec(text)![1]));
    expect(stored?.h).toBe(hashCode(/(\d{4})$/.exec(text)![1]));
    // The typed number is counted against its daily cap.
    expect(redis.store.get(`phone_verify:number_daily:${TARGET}`)).toBe('1');
    expect(prisma.smsMessage.create.mock.calls[0][0].data.content).toBe(
      `Zaxira raqamni tasdiqlash kodi yuborildi: ${TARGET}`,
    );
  });

  it('a wrong code costs an attempt, the third burns the code', async () => {
    const { redis } = deps();
    const stored = { h: hashCode('1234'), n: 3, p: TARGET };
    await redis.set(codeKey('extra', STUDENT.id), JSON.stringify(stored));
    await expect(
      rejectCode(redis as any, 'extra', STUDENT.id, stored),
    ).rejects.toThrow("Kod noto'g'ri. Qolgan urinishlar: 2");
    const after = await readStoredCode(redis as any, 'extra', STUDENT.id);
    expect(after?.n).toBe(2);
    await expect(
      rejectCode(redis as any, 'extra', STUDENT.id, { ...stored, n: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await readStoredCode(redis as any, 'extra', STUDENT.id)).toBeNull();
  });

  it('drops a corrupt entry instead of throwing', async () => {
    const { redis } = deps();
    await redis.set(codeKey('card', STUDENT.id), '{not json');
    expect(await readStoredCode(redis as any, 'card', STUDENT.id)).toBeNull();
    expect(redis.store.has(codeKey('card', STUDENT.id))).toBe(false);
  });

  it('clearCode removes only the named slot', async () => {
    const { redis } = deps();
    await redis.set(codeKey('card', STUDENT.id), '{}');
    await redis.set(codeKey('extra', STUDENT.id), '{}');
    await clearCode(redis as any, 'extra', STUDENT.id);
    expect(redis.store.has(codeKey('card', STUDENT.id))).toBe(true);
    expect(redis.store.has(codeKey('extra', STUDENT.id))).toBe(false);
  });

  it('sha256 matches the hash the onboarding spec computes', () => {
    expect(hashCode('1234')).toBe(
      createHash('sha256').update('1234').digest('hex'),
    );
  });
});
```

- [ ] **Step 2: Run it — it must fail (module missing)**

```bash
cd server && npx jest src/students/shared/phone-code.spec.ts
```
Expected: FAIL — `Cannot find module './phone-code'`.

- [ ] **Step 3: Create `server/src/students/shared/phone-code.ts`**

```ts
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { SmsMessageStatus, SmsMessageType } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RedisService } from '../../redis/redis.service';
import type { EskizService } from '../../eskiz/eskiz.service';

// ── Code policy — the forgot-password OTP's numbers, keyed on the student ────
// The caller is signed in, so there is nothing to hide about the account: the
// errors below say exactly what happened, unlike the anonymous reset flow.
export const CODE_TTL_SEC = 5 * 60;
export const CODE_MAX_ATTEMPTS = 3;
export const RESEND_COOLDOWN_SEC = 60;
// Higher than the reset's 3: this step is compulsory, and a student whose SMS
// is slow should not be locked out of the app until tomorrow after three taps.
export const DAILY_LIMIT = 5;
export const DAILY_TTL_SEC = 24 * 60 * 60;
// A legitimate student needs at most 15 verify calls a day (5 codes × 3 tries).
export const VERIFY_HOURLY_LIMIT = 30;
export const HOUR_SEC = 60 * 60;
// Codes to one NEW number a day. The student chooses that number, so without
// this one account could keep texting a stranger (the per-student cap bounds
// the total, this bounds the victim).
export const NUMBER_DAILY_LIMIT = 3;

export const INVALID_CODE_MESSAGE = "Kod noto'g'ri yoki muddati tugagan";

/**
 * What the code is about: the card's own number (ADR-0039) or the backup
 * number (ADR-0070). Each purpose has its own code slot, so a code sent for
 * one can never write the other. Every limit above is per student and shared
 * by both purposes.
 */
export type PhoneCodePurpose = 'card' | 'extra';

export interface StoredCode {
  h: string; // sha256(code)
  n: number; // attempts left
  p: string; // the number the code went to
  /**
   * Set only when the student is REPLACING the card's number: the number the
   * card carried when the code was sent. The code then proves `p`, and a
   * correct code writes `p` onto the card in place of `from`.
   */
  from?: string;
}

export type SendResult = {
  phone: string;
  expiresInSec: number;
  resendInSec: number;
};

export const codeKey = (purpose: PhoneCodePurpose, studentId: number) =>
  purpose === 'card'
    ? `phone_verify:code:${studentId}`
    : `extra_phone:code:${studentId}`;
const cooldownKey = (studentId: number) => `phone_verify:cooldown:${studentId}`;
const dailyKey = (studentId: number) => `phone_verify:daily:${studentId}`;
const verifyKey = (studentId: number) => `phone_verify:verify:${studentId}`;
const globalKey = (hourBucket: number) => `phone_verify:global:${hourBucket}`;
const numberDailyKey = (phone: string) =>
  `phone_verify:number_daily:${phone}`;

export interface PhoneCodeDeps {
  prisma: Pick<PrismaService, 'smsMessage'>;
  redis: RedisService;
  eskiz: Pick<EskizService, 'sendSms'>;
  logger: Logger;
  globalHourlyCap: number;
}

export type CodeStudent = { id: number; companyId: number };

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** INCR + (re)set TTL on every hit, so the key is never left without one. */
export async function hit(
  redis: RedisService,
  key: string,
  ttlSec: number,
): Promise<number> {
  const n = await redis.incr(key);
  await redis.expire(key, ttlSec);
  return n;
}

const hourBucket = () => Math.floor(Date.now() / (HOUR_SEC * 1000));

/** Counts a verify call; past VERIFY_HOURLY_LIMIT in an hour it is refused. */
export async function assertVerifyAllowed(
  redis: RedisService,
  studentId: number,
): Promise<void> {
  if (
    (await hit(redis, verifyKey(studentId), HOUR_SEC)) > VERIFY_HOURLY_LIMIT
  ) {
    throw new HttpException(
      "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** A number the student typed takes at most NUMBER_DAILY_LIMIT codes a day. */
export async function assertNumberNotFlooded(
  redis: RedisService,
  phone: string,
): Promise<void> {
  const sentToNumber = Number(await redis.get(numberDailyKey(phone)));
  if ((sentToNumber || 0) >= NUMBER_DAILY_LIMIT) {
    throw new HttpException(
      "Bu raqamga bugun ko'p kod yuborildi. Ertaga qayta urinib ko'ring",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/**
 * Sends one code to `target` under the shared limits and stores its hash in
 * the purpose's slot. `from` marks a replacement of the card's number (see
 * `StoredCode.from`); `typedByStudent` counts the code against the typed
 * number's daily cap — a replacement and a backup number are both typed.
 */
export async function issuePhoneCode(
  deps: PhoneCodeDeps,
  purpose: PhoneCodePurpose,
  student: CodeStudent,
  target: string,
  opts: { from?: string; typedByStudent: boolean },
): Promise<SendResult> {
  const { redis } = deps;
  const studentId = student.id;
  const cooldown = await redis.ttl(cooldownKey(studentId));
  if (cooldown > 0) {
    throw new HttpException(
      `Kodni ${cooldown} soniyadan keyin qayta yuborish mumkin`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  const sentToday = Number(await redis.get(dailyKey(studentId))) || 0;
  if (sentToday >= DAILY_LIMIT) {
    throw new HttpException(
      "Bugungi SMS limiti tugadi. Ertaga qayta urinib ko'ring yoki administratorga murojaat qiling",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  // Global hourly circuit-breaker: the Eskiz balance is real money, and the
  // day this step is switched on every student asks at once.
  if (
    (await hit(redis, globalKey(hourBucket()), HOUR_SEC)) > deps.globalHourlyCap
  ) {
    deps.logger.error(
      `Phone-verify global hourly cap (${deps.globalHourlyCap}) reached — SMS suppressed`,
    );
    throw new HttpException(
      "Hozir SMS yuborish vaqtincha cheklangan. Birozdan keyin qayta urinib ko'ring",
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  await redis.set(cooldownKey(studentId), '1', 'EX', RESEND_COOLDOWN_SEC);
  await hit(redis, dailyKey(studentId), DAILY_TTL_SEC);
  if (opts.typedByStudent) {
    await hit(redis, numberDailyKey(target), DAILY_TTL_SEC);
  }

  const code = String(randomInt(1000, 10000)); // 1000–9999, no leading zero
  await redis.set(
    codeKey(purpose, studentId),
    JSON.stringify({
      h: hashCode(code),
      n: CODE_MAX_ATTEMPTS,
      p: target,
      ...(opts.from !== undefined && { from: opts.from }),
    } satisfies StoredCode),
    'EX',
    CODE_TTL_SEC,
  );

  let errorMessage: string | null = null;
  try {
    await deps.eskiz.sendSms(target, buildPhoneVerifyMessage(code));
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    deps.logger.error(
      `Telefon tasdiqlash SMS yuborilmadi (student ${studentId}): ${errorMessage}`,
    );
  }
  await recordSms(
    deps,
    student,
    smsContent(purpose, opts.from, target),
    errorMessage,
  );

  if (errorMessage) {
    // Nothing reached the phone: the code is useless and the failure was
    // ours, so the student gets the attempt back.
    await redis.del(codeKey(purpose, studentId));
    await redis.decr(dailyKey(studentId));
    if (opts.typedByStudent) await redis.decr(numberDailyKey(target));
    throw new ServiceUnavailableException(
      "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring",
    );
  }

  return {
    phone: target,
    expiresInSec: CODE_TTL_SEC,
    resendInSec: RESEND_COOLDOWN_SEC,
  };
}

function smsContent(
  purpose: PhoneCodePurpose,
  from: string | undefined,
  target: string,
): string {
  if (purpose === 'extra') {
    return `Zaxira raqamni tasdiqlash kodi yuborildi: ${target}`;
  }
  return from === undefined
    ? 'Telefon tasdiqlash kodi yuborildi'
    : `Yangi raqamni tasdiqlash kodi yuborildi: ${target}`;
}

/** Audit row — the code itself is never stored, only that one was sent. */
async function recordSms(
  deps: PhoneCodeDeps,
  student: CodeStudent,
  content: string,
  errorMessage: string | null,
): Promise<void> {
  await deps.prisma.smsMessage
    .create({
      data: {
        studentId: student.id,
        content,
        type: SmsMessageType.AUTO,
        status: errorMessage ? SmsMessageStatus.FAILED : SmsMessageStatus.SENT,
        errorMessage,
        companyId: student.companyId,
      },
    })
    .catch((e) =>
      deps.logger.warn(
        `SmsMessage audit yozilmadi: ${(e as Error).message}`,
      ),
    );
}

/** The stored code of this purpose, or null; a corrupt entry is dropped. */
export async function readStoredCode(
  redis: RedisService,
  purpose: PhoneCodePurpose,
  studentId: number,
): Promise<StoredCode | null> {
  const raw = await redis.get(codeKey(purpose, studentId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCode;
  } catch {
    await redis.del(codeKey(purpose, studentId));
    return null;
  }
}

/** A wrong code: one attempt fewer; the last one burns the code. Always throws. */
export async function rejectCode(
  redis: RedisService,
  purpose: PhoneCodePurpose,
  studentId: number,
  stored: StoredCode,
): Promise<never> {
  const key = codeKey(purpose, studentId);
  const left = stored.n - 1;
  if (left <= 0) {
    await redis.del(key);
    throw new BadRequestException("Kod noto'g'ri. Iltimos, yangi kod so'rang.");
  }
  const ttl = await redis.ttl(key);
  await redis.set(
    key,
    JSON.stringify({ ...stored, n: left } satisfies StoredCode),
    'EX',
    ttl > 0 ? ttl : CODE_TTL_SEC,
  );
  throw new BadRequestException(`Kod noto'g'ri. Qolgan urinishlar: ${left}`);
}

export async function clearCode(
  redis: RedisService,
  purpose: PhoneCodePurpose,
  studentId: number,
): Promise<void> {
  await redis.del(codeKey(purpose, studentId));
}

/**
 * The SMS text. Like the reset code's, it must byte-match a template Eskiz has
 * moderated, or the gateway rejects it — and this one is NOT the reset
 * template: the purpose clause differs, which is exactly what moderation
 * checks (resource name with its type + what the code is for). Submit
 * "DaF Sprachzentrum mobil ilovasida telefon raqamingizni tasdiqlash uchun kod: 0000"
 * for moderation before setting STUDENT_PHONE_VERIFICATION_ENABLED=true.
 * Pure ASCII = one SMS segment. The backup number (ADR-0070) uses the same
 * text: it is a phone number being confirmed, nothing else.
 */
export function buildPhoneVerifyMessage(code: string): string {
  return `DaF Sprachzentrum mobil ilovasida telefon raqamingizni tasdiqlash uchun kod: ${code}`;
}
```

- [ ] **Step 4: Create `server/src/students/shared/current-password.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import type { PrismaService } from '../../prisma/prisma.service';

export const WRONG_CURRENT_PASSWORD_MESSAGE = "Joriy parol noto'g'ri";

/**
 * The caller's own password, checked before a sign-in key of theirs changes
 * (ADR-0031). The route that calls this carries `OwnPasswordAttemptGuard`.
 */
export async function assertCurrentPassword(
  prisma: Pick<PrismaService, 'user'>,
  userId: number,
  currentPassword: string,
): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { password: true },
  });
  const ok =
    !!user?.password && (await bcrypt.compare(currentPassword, user.password));
  if (!ok) throw new BadRequestException(WRONG_CURRENT_PASSWORD_MESSAGE);
}
```

- [ ] **Step 5: Make the onboarding service delegate**

In `server/src/students/onboarding/student-onboarding.service.ts`:

1. Replace the imports `createHash, randomInt` from `'crypto'`, `bcrypt`, `SmsMessageStatus, SmsMessageType` (keep `Gender`), and add:
```ts
import {
  INVALID_CODE_MESSAGE,
  type PhoneCodeDeps,
  type SendResult,
  assertNumberNotFlooded,
  assertVerifyAllowed,
  clearCode,
  hashCode,
  issuePhoneCode,
  readStoredCode,
  rejectCode,
} from '../shared/phone-code';
import {
  WRONG_CURRENT_PASSWORD_MESSAGE,
  assertCurrentPassword,
} from '../shared/current-password';

// The spec imports these from here; the definitions moved to shared modules.
export { buildPhoneVerifyMessage } from '../shared/phone-code';
export { WRONG_CURRENT_PASSWORD_MESSAGE };
```
2. Delete the local block from `// ── Code policy` through `const numberDailyKey = …`, the local `INVALID_CODE_MESSAGE`, `WRONG_CURRENT_PASSWORD_MESSAGE` constants, the `StoredCode` interface and the `SendResult` type (keep `NUMBER_TAKEN_MESSAGE`).
3. Add to the class, after the constructor:
```ts
  private get codeDeps(): PhoneCodeDeps {
    return {
      prisma: this.prisma,
      redis: this.redis,
      eskiz: this.eskiz,
      logger: this.logger,
      globalHourlyCap: this.globalHourlyCap,
    };
  }
```
4. `sendPhoneCode`: replace `return this.issueCode(student, student.phone);` with
```ts
    return issuePhoneCode(this.codeDeps, 'card', student, student.phone, {
      typedByStudent: false,
    });
```
5. `sendChangeCode`: replace `await this.assertCurrentPassword(userId, currentPassword);` with `await assertCurrentPassword(this.prisma, userId, currentPassword);`; replace the `sentToNumber … TOO_MANY_REQUESTS` block (7 lines) with `await assertNumberNotFlooded(this.redis, phone);`; replace `return this.issueCode(student, phone, student.phone);` with
```ts
    return issuePhoneCode(this.codeDeps, 'card', student, phone, {
      from: student.phone,
      typedByStudent: true,
    });
```
6. `verifyPhoneCode`: replace everything from the `if ((await this.hit(verifyKey(studentId), HOUR_SEC)) …` block down to `await this.redis.del(codeKey(studentId));` (just before `if (replacing) {`) with:
```ts
    await assertVerifyAllowed(this.redis, studentId);

    const student = await this.load(studentId);
    if (isPhoneVerified(student)) return this.toStatus(student);
    this.assertStepOpen(student);

    const stored = await readStoredCode(this.redis, 'card', studentId);
    if (!stored) throw new BadRequestException(INVALID_CODE_MESSAGE);

    // The card must still carry the number it had when the code was sent.
    // Staff changing it in between voids the code: it was about a card that
    // no longer exists in that form.
    const replacing = stored.from !== undefined;
    if ((replacing ? stored.from : stored.p) !== student.phone) {
      await clearCode(this.redis, 'card', studentId);
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (hashCode(code) !== stored.h) {
      await rejectCode(this.redis, 'card', studentId, stored);
    }

    await clearCode(this.redis, 'card', studentId);
```
7. Delete the private methods `assertCurrentPassword`, `issueCode`, `recordSms`, `hash`, `hourBucket`, `hit`, and the module-level `buildPhoneVerifyMessage` function at the bottom (it now lives in `phone-code.ts` and is re-exported in step 1).
8. Remove now-unused imports (`HttpException`, `HttpStatus`, `ServiceUnavailableException`, `Logger` stays — the class still uses `this.logger`).

- [ ] **Step 6: Run both specs and the typecheck**

```bash
cd server && npx prettier --write src/students/shared/phone-code.ts src/students/shared/phone-code.spec.ts src/students/shared/current-password.ts src/students/onboarding/student-onboarding.service.ts && npx jest src/students/shared/phone-code.spec.ts src/students/onboarding && npm run typecheck
```
Expected: both specs PASS (the onboarding spec unchanged), typecheck clean. The onboarding file is now well under 500 lines.

- [ ] **Step 7: Commit**

```bash
git add server/src/students/shared/phone-code.ts server/src/students/shared/phone-code.spec.ts server/src/students/shared/current-password.ts server/src/students/onboarding/student-onboarding.service.ts
git commit -m "refactor(students): SMS kod mexanizmi va joriy parol tekshiruvi umumiy modulga ko'chdi"
```

---

### Task 2: The backup-number rule — `extra-phone-rule.ts`

**Files:**
- Create: `server/src/students/shared/extra-phone-rule.ts`, `server/src/students/shared/extra-phone-rule.spec.ts`

**Interfaces:**
- Produces (used by Tasks 3, 4, 5, 8):
```ts
type ExtraPhoneDb = { student: { findFirst: Function }; user: { findFirst: Function } }  // PrismaService or Prisma.TransactionClient
type ExtraPhoneSelf = { studentId: number | null; userId: number | null; phone: string }
type ExtraPhoneHolder =
  | { kind: 'own-main' }
  | { kind: 'card'; studentId: number; name: string }
  | { kind: 'account'; userId: number }
findExtraPhoneHolder(db, phone, self): Promise<ExtraPhoneHolder | null>
assertExtraPhoneFree(db, phone, self, audience: 'staff' | 'student'): Promise<void>
EXTRA_PHONE_IS_MAIN_MESSAGE, EXTRA_PHONE_TAKEN_STUDENT_MESSAGE, EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE, extraPhoneTakenStaffMessage(name)
```

- [ ] **Step 1: Write the failing spec**

`server/src/students/shared/extra-phone-rule.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE,
  EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
  assertExtraPhoneFree,
  extraPhoneTakenStaffMessage,
  findExtraPhoneHolder,
} from './extra-phone-rule';

const SELF = { studentId: 10077, userId: 20077, phone: '901234567' };
const NUMBER = '935554433';

function db(card: any = null, account: any = null) {
  return {
    student: { findFirst: jest.fn().mockResolvedValue(card) },
    user: { findFirst: jest.fn().mockResolvedValue(account) },
  };
}

describe('extra-phone-rule (ADR-0070)', () => {
  it('a free number has no holder', async () => {
    const d = db();
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toBeNull();
    const cardWhere = d.student.findFirst.mock.calls[0][0].where;
    expect(cardWhere).toEqual({
      deletedAt: null,
      OR: [{ phone: NUMBER }, { extraPhone: NUMBER }],
      id: { not: SELF.studentId },
    });
    const accountWhere = d.user.findFirst.mock.calls[0][0].where;
    expect(accountWhere).toEqual({
      deletedAt: null,
      OR: [{ phone: NUMBER }, { login: NUMBER }],
      roles: { some: { roleId: 6 } },
      id: { not: SELF.userId },
    });
  });

  it("the student's own main number is never a backup number", async () => {
    const d = db();
    expect(await findExtraPhoneHolder(d as any, SELF.phone, SELF)).toEqual({
      kind: 'own-main',
    });
    expect(d.student.findFirst).not.toHaveBeenCalled();
  });

  it("another live card's main or backup number is taken", async () => {
    const d = db({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toEqual({
      kind: 'card',
      studentId: 10999,
      name: 'Vali Aliyev',
    });
    expect(d.user.findFirst).not.toHaveBeenCalled();
  });

  it("another live student account's sign-in number is taken", async () => {
    const d = db(null, { id: 20999 });
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toEqual({
      kind: 'account',
      userId: 20999,
    });
  });

  it('a new card (no id yet) is compared against every live card and account', async () => {
    const d = db();
    await findExtraPhoneHolder(d as any, NUMBER, {
      studentId: null,
      userId: null,
      phone: '901234567',
    });
    expect(d.student.findFirst.mock.calls[0][0].where.id).toBeUndefined();
    expect(d.user.findFirst.mock.calls[0][0].where.id).toBeUndefined();
  });

  it('staff are told who holds the number, a student is not', async () => {
    const taken = db({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    await expect(
      assertExtraPhoneFree(taken as any, NUMBER, SELF, 'staff'),
    ).rejects.toThrow(extraPhoneTakenStaffMessage('Vali Aliyev'));
    await expect(
      assertExtraPhoneFree(taken as any, NUMBER, SELF, 'student'),
    ).rejects.toThrow(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
    await expect(
      assertExtraPhoneFree(db(null, { id: 20999 }) as any, NUMBER, SELF, 'staff'),
    ).rejects.toThrow(EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE);
    await expect(
      assertExtraPhoneFree(db() as any, SELF.phone, SELF, 'student'),
    ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    const err = await assertExtraPhoneFree(taken as any, NUMBER, SELF, 'staff')
      .catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('a free number passes', async () => {
    await expect(
      assertExtraPhoneFree(db() as any, NUMBER, SELF, 'staff'),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it — must fail (module missing)**

```bash
cd server && npx jest src/students/shared/extra-phone-rule.spec.ts
```

- [ ] **Step 3: Create `server/src/students/shared/extra-phone-rule.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { STUDENT_ROLE_ID } from './student-select';

/**
 * Is a backup number (`Student.extraPhone`) free to take? ADR-0070: a backup
 * number is a sign-in key, and one number signs exactly one student in — so
 * it may not be this card's own main number, another live card's main or
 * backup number, or another live student account's sign-in number. Staff
 * accounts do not count (ADR-0022: the same person may be staff). Every
 * writer of `extraPhone` asks here and nowhere else.
 */
export type ExtraPhoneHolder =
  | { kind: 'own-main' }
  | { kind: 'card'; studentId: number; name: string }
  | { kind: 'account'; userId: number };

export type ExtraPhoneSelf = {
  /** The card being written, or null for a card not created yet. */
  studentId: number | null;
  /** Its sign-in account, or null. */
  userId: number | null;
  /** The main number the card will carry after this write. */
  phone: string;
};

type Db = {
  student: {
    findFirst: (args: any) => Promise<any>;
  };
  user: {
    findFirst: (args: any) => Promise<any>;
  };
};

export const EXTRA_PHONE_IS_MAIN_MESSAGE =
  "Zaxira raqam asosiy raqam bilan bir xil bo'lmasin";
export const EXTRA_PHONE_TAKEN_STUDENT_MESSAGE = "Bu raqamni qo'shib bo'lmaydi";
export const EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE =
  "Bu raqam boshqa o'quvchi hisobida bor";
export const extraPhoneTakenStaffMessage = (name: string) =>
  `Bu raqam boshqa o'quvchida bor: ${name}`.trim();

export async function findExtraPhoneHolder(
  db: Db,
  phone: string,
  self: ExtraPhoneSelf,
): Promise<ExtraPhoneHolder | null> {
  if (phone === self.phone) return { kind: 'own-main' };

  const card = await db.student.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone }, { extraPhone: phone }],
      ...(self.studentId !== null && { id: { not: self.studentId } }),
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (card) {
    return {
      kind: 'card',
      studentId: card.id,
      name: `${card.firstName} ${card.lastName}`.trim(),
    };
  }

  const account = await db.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ phone }, { login: phone }],
      roles: { some: { roleId: STUDENT_ROLE_ID } },
      ...(self.userId !== null && { id: { not: self.userId } }),
    },
    select: { id: true },
  });
  return account ? { kind: 'account', userId: account.id } : null;
}

/** Throws 400 when the number is not free; the text depends on who asked. */
export async function assertExtraPhoneFree(
  db: Db,
  phone: string,
  self: ExtraPhoneSelf,
  audience: 'staff' | 'student',
): Promise<void> {
  const holder = await findExtraPhoneHolder(db, phone, self);
  if (!holder) return;
  if (holder.kind === 'own-main') {
    throw new BadRequestException(EXTRA_PHONE_IS_MAIN_MESSAGE);
  }
  if (audience === 'student') {
    throw new BadRequestException(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
  }
  throw new BadRequestException(
    holder.kind === 'card'
      ? extraPhoneTakenStaffMessage(holder.name)
      : EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE,
  );
}
```

- [ ] **Step 4: Run, format, commit**

```bash
cd server && npx prettier --write src/students/shared/extra-phone-rule.ts src/students/shared/extra-phone-rule.spec.ts && npx jest src/students/shared/extra-phone-rule.spec.ts
```
Expected: 7 PASS.

```bash
git add server/src/students/shared/extra-phone-rule.ts server/src/students/shared/extra-phone-rule.spec.ts
git commit -m "feat(students): zaxira raqam bo'shligi qoidasi — bitta funksiya"
```

---

### Task 3: Admin writes go through the rule (`StudentsWriteService.create/update`)

**Files:**
- Modify: `server/src/students/students-write.service.ts` (`create` ≈ line 96, `update` ≈ line 219)
- Create: `server/src/students/students-write.extra-phone.spec.ts`

**Interfaces:** consumes `assertExtraPhoneFree` (Task 2).

- [ ] **Step 1: Write the failing spec**

`server/src/students/students-write.extra-phone.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from '../common/student-origin/student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  extraPhoneTakenStaffMessage,
} from './shared/extra-phone-rule';

/**
 * ADR-0070: a backup number is a sign-in key, so staff may not give a student
 * a number another student already signs in with, nor the card's own number.
 */
describe('StudentsWriteService — backup number (ADR-0070)', () => {
  let service: StudentsWriteService;
  let prisma: any;

  const COMPANY = 1001;
  const CEO = 10001;
  const HOLDER = { id: 10999, firstName: 'Vali', lastName: 'Aliyev' };
  const student = {
    id: 10077,
    phone: '901234567',
    extraPhone: null,
    userId: 20077,
    companyId: COMPANY,
    photo: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: CEO,
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      student: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: RedisService, useValue: { set: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: {} },
        {
          provide: StudentLeadOriginService,
          useValue: {
            assertSourceUsable: jest.fn(),
            recordDirectOrigin: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(StudentsWriteService);
  });

  describe('update', () => {
    it("refuses a backup number another student's card holds, naming them", async () => {
      // 1st: the card being edited; 2nd: the rule's "another card on the number".
      prisma.student.findFirst
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce(HOLDER);

      await expect(
        service.update(10077, { extraPhone: '935554433' }, CEO, COMPANY),
      ).rejects.toThrow(extraPhoneTakenStaffMessage('Vali Aliyev'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses the card's own main number as its backup number", async () => {
      prisma.student.findFirst.mockResolvedValueOnce(student);

      await expect(
        service.update(10077, { extraPhone: '901234567' }, CEO, COMPANY),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a main number change that lands on the own backup number', async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce({ ...student, extraPhone: '935554433' })
        // the main-number "taken by another card" check
        .mockResolvedValueOnce(null);

      await expect(
        service.update(10077, { phone: '935554433' }, CEO, COMPANY),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    });

    it('does not ask the rule when the backup number is unchanged', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...student,
        extraPhone: '935554433',
      });
      // `formatStudent` maps `branches` and `enrollments`, so the fake row carries both.
      prisma.$transaction.mockResolvedValue({
        ...student,
        extraPhone: '935554433',
        branches: [],
        enrollments: [],
      });

      await service.update(
        10077,
        { extraPhone: '935554433', firstName: 'Ali' },
        CEO,
        COMPANY,
      );
      expect(prisma.student.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  describe('create', () => {
    it('refuses a taken backup number before anything is written', async () => {
      // 1st: "is the main number taken?" → no; 2nd: the rule → another card.
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(HOLDER);

      await expect(
        service.create(
          {
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            extraPhone: '935554433',
            branchIds: [1],
          } as any,
          COMPANY,
          CEO,
          { kind: 'DIRECT', sourceId: 'src-1' } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run — the first three `update` tests and the `create` test must fail**

```bash
cd server && npx jest src/students/students-write.extra-phone.spec.ts
```
Expected: FAIL (the service resolves / reaches `$transaction` instead of throwing).

- [ ] **Step 3: Implement in `students-write.service.ts`**

Add the import next to the other `./shared` imports:
```ts
import { assertExtraPhoneFree } from './shared/extra-phone-rule';
```

In `create`, right after the `if (existing) { throw … 'Bu telefon raqam allaqachon tizimda mavjud' }` block:
```ts
    // A backup number is a sign-in key (ADR-0070): one number, one student.
    if (dto.extraPhone) {
      await assertExtraPhoneFree(
        this.prisma,
        dto.extraPhone,
        { studentId: null, userId: null, phone: dto.phone },
        'staff',
      );
    }
```

In `update`, right after the `if (dto.phone && dto.phone !== student.phone) { … phoneTaken … }` block and before the `dto.password` check:
```ts
    // The backup number after this save, checked when it or the main number
    // moves (ADR-0070): the rule also refuses a main number that lands on the
    // card's own backup number.
    const nextPhone = dto.phone ?? student.phone;
    const nextExtraPhone =
      dto.extraPhone === undefined ? student.extraPhone : dto.extraPhone;
    if (
      nextExtraPhone &&
      (nextExtraPhone !== student.extraPhone || nextPhone !== student.phone)
    ) {
      await assertExtraPhoneFree(
        this.prisma,
        nextExtraPhone,
        { studentId: id, userId: student.userId, phone: nextPhone },
        'staff',
      );
    }
```

- [ ] **Step 4: Run the new spec, the existing write specs and the guard spec**

```bash
cd server && npx prettier --write src/students/students-write.service.ts src/students/students-write.extra-phone.spec.ts && npx jest src/students/students-write src/students/student-phone.single-source.spec.ts
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/students/students-write.service.ts server/src/students/students-write.extra-phone.spec.ts
git commit -m "feat(students): admin kiritgan zaxira raqam band bo'lsa 400"
```

---

### Task 4: Lead conversion keeps a taken backup number on the lead

**Files:**
- Modify: `server/src/leads/leads.service.ts` (`convert`, the `this.studentsService.create({ … extraPhone: lead.extraPhone ?? undefined … })` call ≈ line 967)
- Test: `server/src/leads/leads.service.spec.ts` (`describe('convert')` ≈ line 872)

**Interfaces:** consumes `findExtraPhoneHolder` (Task 2).

- [ ] **Step 1: Add the failing tests to the `convert` describe**

First add `user: { findFirst: jest.fn().mockResolvedValue(null) },` to the `prisma` mock in the spec's top-level `beforeEach` (next to `student:`). Then, inside `describe('convert', …)`, add:

```ts
    const leadWithBackup = {
      id: 'lead-1',
      firstName: 'Aziz',
      lastName: 'Karimov',
      phone: '901234567',
      extraPhone: '935554433',
      gender: null,
      telegram: null,
      parentPhone: null,
      parentName: null,
      statusEnum: 'NEW',
      convertedStudentId: null,
    };

    it("copies the lead's backup number when no student holds it (ADR-0070)", async () => {
      prisma.lead.findFirst.mockResolvedValue(leadWithBackup);
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(students.create.mock.calls[0][0].extraPhone).toBe('935554433');
    });

    it('leaves a backup number another student holds on the lead; conversion goes on', async () => {
      prisma.lead.findFirst.mockResolvedValue(leadWithBackup);
      // 1st: the main-number duplicate guard → none; 2nd: the rule → a holder.
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
      students.create.mockResolvedValue({ id: 10007 });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1' });

      await service.convert('lead-1', { branchId: 5 }, 1001, 1, null);

      expect(students.create).toHaveBeenCalledTimes(1);
      expect(students.create.mock.calls[0][0].extraPhone).toBeUndefined();
    });
```

- [ ] **Step 2: Run — the second test must fail**

```bash
cd server && npx jest src/leads/leads.service.spec.ts -t "backup number"
```
Expected: the "leaves a backup number" test FAILS (`extraPhone` is `'935554433'`).

- [ ] **Step 3: Implement**

In `leads.service.ts` add the import:
```ts
import { findExtraPhoneHolder } from '../students/shared/extra-phone-rule';
```
Right before `const student = await this.studentsService.create(` insert:
```ts
      // The lead's backup number becomes a sign-in key on the card (ADR-0070).
      // One another student already signs in with stays on the lead — the
      // conversion itself never fails over a backup number.
      const extraPhone =
        lead.extraPhone &&
        !(await findExtraPhoneHolder(this.prisma, lead.extraPhone, {
          studentId: null,
          userId: null,
          phone: lead.phone,
        }))
          ? lead.extraPhone
          : undefined;
```
and change the create argument `extraPhone: lead.extraPhone ?? undefined,` to `extraPhone,`.

- [ ] **Step 4: Run the whole leads spec, format, commit**

```bash
cd server && npx prettier --write src/leads/leads.service.ts src/leads/leads.service.spec.ts && npx jest src/leads/leads.service.spec.ts
```
Expected: PASS.

```bash
git add server/src/leads/leads.service.ts server/src/leads/leads.service.spec.ts
git commit -m "feat(leads): band zaxira raqam o'quvchiga ko'chmaydi, aylantirish to'xtamaydi"
```

---

### Task 5: Archive restore clears a taken backup number

**Files:**
- Modify: `server/src/archive/archive-restore.service.ts` (the `ArchiveEntityType.STUDENTS` branch of `restore`, ≈ lines 110–118)
- Create: `server/src/archive/archive-restore.extra-phone.spec.ts`

**Interfaces:** consumes `findExtraPhoneHolder` (Task 2).

- [ ] **Step 1: Write the failing spec**

```ts
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveEntityType } from './dto/archive-query.dto';

/**
 * ADR-0070: a restored card may not bring back a backup number another live
 * student now signs in with. The restore goes through; the number goes.
 */
describe('ArchiveRestoreService — backup number on restore (ADR-0070)', () => {
  const CARD = {
    id: 20001,
    phone: '901112233',
    extraPhone: '935554433',
    userId: null,
    companyId: 1001,
    status: 'ARCHIVED',
    deletionBatchId: null,
  };
  let prisma: any;
  let tx: any;
  let history: any;
  let service: ArchiveRestoreService;

  function build(holder: any) {
    tx = { student: { update: jest.fn().mockResolvedValue({}) }, user: {} };
    prisma = {
      student: {
        // 1st: the archived record; 2nd: another live card on the MAIN number;
        // 3rd: the rule's "another card on the backup number".
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(CARD)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(holder),
        update: jest.fn(),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    history = { recordRestore: jest.fn(), recordUpdate: jest.fn() };
    service = new ArchiveRestoreService(
      prisma,
      { changeStatus: jest.fn().mockResolvedValue({}) } as any,
      history,
    );
  }

  it('keeps a free backup number', async () => {
    build(null);
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    const data = tx.student.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('extraPhone');
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('clears a backup number another live student holds and says so in the history', async () => {
    build({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    await service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);
    const data = tx.student.update.mock.calls[0][0].data;
    expect(data.extraPhone).toBeNull();
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 20001,
        oldValues: { extraPhone: '935554433', sabab: null },
        newValues: {
          extraPhone: null,
          sabab: "Arxivdan tiklanganda: raqam boshqa o'quvchida (#10999)",
        },
        changedById: 7,
        companyId: 1001,
      }),
    );
  });
});
```

- [ ] **Step 2: Run — the second test must fail**

```bash
cd server && npx jest src/archive/archive-restore.extra-phone.spec.ts
```

- [ ] **Step 3: Implement**

Add the import to `archive-restore.service.ts`:
```ts
import { findExtraPhoneHolder } from '../students/shared/extra-phone-rule';
```
Replace the STUDENTS branch:
```ts
      if (entityType === ArchiveEntityType.STUDENTS) {
        // A backup number another live student took while this card was
        // archived does not come back as a sign-in key (ADR-0070).
        const droppedBackup = record.extraPhone
          ? await findExtraPhoneHolder(this.prisma, record.extraPhone, {
              studentId: record.id,
              userId: record.userId,
              phone: record.phone,
            })
          : null;
        if (droppedBackup) restoreData.extraPhone = null;

        // The card and its sign-in account come back together (ADR-0033).
        await this.prisma.$transaction(async (tx) => {
          await tx.student.update({
            where: { id: parsedId as number },
            data: restoreData,
          });
          await this.reopenStudentAccount(tx, record, userId);
        });

        if (droppedBackup) {
          const holder =
            droppedBackup.kind === 'card'
              ? `#${droppedBackup.studentId}`
              : droppedBackup.kind === 'account'
                ? `hisob #${droppedBackup.userId}`
                : 'asosiy raqam';
          await this.entityHistoryService.recordUpdate({
            entityType: 'Student',
            entityId: parsedId as number,
            oldValues: { extraPhone: record.extraPhone, sabab: null },
            newValues: {
              extraPhone: null,
              sabab: `Arxivdan tiklanganda: raqam boshqa o'quvchida (${holder})`,
            },
            changedById: userId,
            companyId: record.companyId ?? undefined,
          });
        }
      } else {
```
(The `else` branch with `delegate.update` stays as it is.)

- [ ] **Step 4: Run both restore specs, format, commit**

```bash
cd server && npx prettier --write src/archive/archive-restore.service.ts src/archive/archive-restore.extra-phone.spec.ts && npx jest src/archive
```
Expected: PASS (the existing `archive-restore.student-account.spec.ts` card has no `extraPhone`, so nothing changes for it).

```bash
git add server/src/archive/archive-restore.service.ts server/src/archive/archive-restore.extra-phone.spec.ts
git commit -m "feat(archive): tiklangan kartaning band zaxira raqami olib tashlanadi"
```

---

### Task 6: «Yo'q, boshqa raqam» promotes the own backup number

**Files:**
- Modify: `server/src/students/onboarding/student-onboarding.service.ts` (`replaceCardNumber`, `STUDENT_SELECT`, `StudentFacts`)
- Test: `server/src/students/onboarding/student-onboarding.service.spec.ts`

- [ ] **Step 1: Add the failing test**

The spec's `build()` row has no `extraPhone`; extend the `card` parameter type with `extraPhone: string | null` and add `extraPhone: null as string | null,` to `row`. Then add, inside the describe that covers «Yo'q, boshqa raqam» (search the file for `sendChangeCode` tests and add next to them):

```ts
  it("a new main number that was the card's backup number empties the backup (ADR-0070)", async () => {
    const b = build({ extraPhone: OWN_PHONE });
    await b.service.sendChangeCode(STUDENT_ID, USER_ID, OWN_PHONE, PASSWORD);
    const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
    const code = /(\d{4})$/.exec(message)![1];

    await b.service.verifyPhoneCode(STUDENT_ID, USER_ID, code);

    expect(b.row.phone).toBe(OWN_PHONE);
    expect(b.row.extraPhone).toBeNull();
    const history = b.entityHistory.recordUpdate.mock.calls.at(-1)![0];
    expect(history.oldValues.extraPhone).toBe(OWN_PHONE);
    expect(history.newValues.extraPhone).toBeNull();
  });
```

- [ ] **Step 2: Run — must fail (`extraPhone` still OWN_PHONE)**

```bash
cd server && npx jest src/students/onboarding/student-onboarding.service.spec.ts -t "empties the backup"
```

- [ ] **Step 3: Implement**

In `student-onboarding.service.ts`:
- `STUDENT_SELECT`: add `extraPhone: true,`. `StudentFacts`: add `extraPhone: string | null;`.
- In `replaceCardNumber`, inside the transaction, replace `data: { phone: nextPhone },` with:
```ts
          // The backup number that just became the main number is not a
          // backup any more (ADR-0070).
          data: {
            phone: nextPhone,
            ...(student.extraPhone === nextPhone && { extraPhone: null }),
          },
```
- In the history call at the end of `replaceCardNumber`, add to `oldValues`: `...(student.extraPhone === nextPhone && { extraPhone: student.extraPhone }),` and to `newValues`: `...(student.extraPhone === nextPhone && { extraPhone: null }),`.

- [ ] **Step 4: Run the spec and the two guard specs, format, commit**

```bash
cd server && npx prettier --write src/students/onboarding/student-onboarding.service.ts src/students/onboarding/student-onboarding.service.spec.ts && npx jest src/students/onboarding src/students/student-phone.single-source.spec.ts src/students/phone-proof.single-source.spec.ts
```
Expected: PASS.

```bash
git add server/src/students/onboarding
git commit -m "feat(onboarding): asosiy raqam o'z zaxira raqamiga ko'chsa zaxira bo'shatiladi"
```

---

### Task 7: Two-stage sign-in lookup in `AuthService`

**Files:**
- Modify: `server/src/auth/auth.service.ts` (`findAccountByIdentifier`, `findAccountsByIdentifier`, ≈ lines 132–165)
- Test: `server/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append inside `describe('AuthService', …)` (after the `findAccountsByIdentifier` describe):

```ts
  describe('backup number — second lookup stage (ADR-0070)', () => {
    const BACKUP = '935554433';
    const studentAccount = {
      id: 7,
      password: '',
      roles: [{ role: { id: 6, name: 'Student' } }],
      branches: [],
      company: {},
    };

    it('falls back to a card whose backup number this is, on the student portal', async () => {
      const hash = await bcrypt.hash('pass123', 10);
      prisma.user.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...studentAccount, password: hash });

      const res = await service.validateUser(`+998 ${BACKUP}`, 'pass123', [6]);

      expect(res).toBeTruthy();
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
      const second = prisma.user.findFirst.mock.calls[1][0];
      expect(second.where).toEqual({
        student: { is: { extraPhone: BACKUP, deletedAt: null } },
        deletedAt: null,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        roles: { some: { role: { id: 6 } } },
      });
      expect(second.orderBy).toEqual({ updatedAt: 'desc' });
    });

    it('the main number always wins: a wrong password there never reaches the backup stage', async () => {
      const hash = await bcrypt.hash('other', 10);
      prisma.user.findFirst.mockResolvedValueOnce({
        ...studentAccount,
        id: 8,
        password: hash,
      });

      const res = await service.validateUser(BACKUP, 'pass123', [6]);

      expect(res).toBeNull();
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    });

    it('does not look at backup numbers on the staff portals', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.validateUser(BACKUP, 'pass123', [1, 2, 3, 5]);
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    });

    it('does not look at backup numbers for a legacy username', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.validateUser('akhror', 'pass123', null);
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    });

    it('looks without a portal restriction (dev) — the backup stage is student-only anyway', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await service.validateUser(BACKUP, 'pass123', null);
      expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.user.findFirst.mock.calls[1][0].where.roles).toEqual({
        some: { role: { id: 6 } },
      });
    });

    it('the Telegram path (findMany) takes the same second stage', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([studentAccount]);

      const rows = await service.findAccountsByIdentifier(`998${BACKUP}`, [6], 2);

      expect(rows).toEqual([studentAccount]);
      const second = prisma.user.findMany.mock.calls[1][0];
      expect(second.where.student).toEqual({
        is: { extraPhone: BACKUP, deletedAt: null },
      });
      expect(second.take).toBe(2);
    });

    it('the Telegram path stops at the first stage when it finds anyone', async () => {
      prisma.user.findMany.mockResolvedValueOnce([studentAccount, { id: 9 }]);
      const rows = await service.findAccountsByIdentifier(BACKUP, [6], 2);
      expect(rows).toHaveLength(2);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });
  });
```

- [ ] **Step 2: Run — the new describe must fail**

```bash
cd server && npx jest src/auth/auth.service.spec.ts -t "ADR-0070"
```

- [ ] **Step 3: Implement**

In `auth.service.ts`, add after `buildAccountLookup`:
```ts
  /**
   * Zaxira raqam ham kirish kaliti (ADR-0070) — faqat o'quvchi portalida va
   * faqat hech bir hisob bu raqamni O'ZINIKI deb javob bermaganda: kartadagi
   * asosiy raqam har doim ustun (`findAccountByIdentifier` va
   * `findAccountsByIdentifier` avval uni, keyin buni so'raydi). Kimlik
   * telefon bo'lmasa yoki portal o'quvchini qabul qilmasa — `null`.
   */
  private buildExtraPhoneLookup(
    login: string,
    allowedRoleIds?: number[] | null,
  ) {
    if (allowedRoleIds && !allowedRoleIds.includes(STUDENT_ROLE_ID)) {
      return null;
    }
    const digits = (login ?? '').replace(/\D/g, '');
    const normalized = digits ? normalizeSharedPhone(digits) : null;
    if (!normalized) return null;
    return {
      where: {
        student: { is: { extraPhone: normalized, deletedAt: null } },
        deletedAt: null,
        status: { in: [...SIGN_IN_USER_STATUSES] },
        roles: { some: { role: { id: STUDENT_ROLE_ID } } },
      },
      orderBy: { updatedAt: 'desc' as const },
      include: SESSION_USER_INCLUDE,
    };
  }
```
Replace the bodies:
```ts
  async findAccountByIdentifier(
    login: string,
    allowedRoleIds?: number[] | null,
  ) {
    const own = await this.prisma.user.findFirst(
      this.buildAccountLookup(login, allowedRoleIds),
    );
    if (own) return own;
    const extra = this.buildExtraPhoneLookup(login, allowedRoleIds);
    return extra ? this.prisma.user.findFirst(extra) : null;
  }
```
and
```ts
  async findAccountsByIdentifier(
    login: string,
    allowedRoleIds?: number[] | null,
    take = 2,
  ) {
    const own = await this.prisma.user.findMany({
      ...this.buildAccountLookup(login, allowedRoleIds),
      take,
    });
    if (own.length > 0) return own;
    const extra = this.buildExtraPhoneLookup(login, allowedRoleIds);
    return extra ? this.prisma.user.findMany({ ...extra, take }) : [];
  }
```
Add to the `findAccountsByIdentifier` doc comment one line: `Ikkinchi bosqich (zaxira raqam, ADR-0070) ham shu yerda — Telegram yo'li parol yo'lidan keng bo'lmasin.`

- [ ] **Step 4: Run the whole auth spec + the Telegram OAuth spec, typecheck, format, commit**

```bash
cd server && npx prettier --write src/auth/auth.service.ts src/auth/auth.service.spec.ts && npx jest src/auth && npm run typecheck
```
Expected: PASS, typecheck clean (`student: { is: … }` is the Prisma one-to-one filter for `User.student`).

```bash
git add server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat(auth): zaxira raqam — ikkinchi qidiruv bosqichi, faqat o'quvchi portalida"
```

---

### Task 8: `StudentExtraPhoneService`

**Files:**
- Create: `server/src/students/extra-phone/student-extra-phone.service.ts`, `server/src/students/extra-phone/student-extra-phone.service.spec.ts`

**Interfaces:**
- Consumes: `phone-code.ts` (Task 1), `current-password.ts` (Task 1), `extra-phone-rule.ts` (Task 2), `StudentOnboardingService.phoneVerificationEnabled` (existing public getter).
- Produces (used by Task 9):
```ts
export type ExtraPhoneStatus = { phone: string | null; editable: boolean };
export const EXTRA_PHONE_DOOR_CLOSED_MESSAGE = "Zaxira raqamni hozircha administrator qo'shadi";
class StudentExtraPhoneService {
  status(studentId: number): Promise<ExtraPhoneStatus>
  sendCode(studentId: number, userId: number, phone: string, currentPassword: string): Promise<SendResult>
  verify(studentId: number, userId: number, code: string): Promise<ExtraPhoneStatus>
  remove(studentId: number, userId: number, currentPassword: string): Promise<ExtraPhoneStatus>
}
```

- [ ] **Step 1: Write the failing spec**

`server/src/students/extra-phone/student-extra-phone.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  EXTRA_PHONE_DOOR_CLOSED_MESSAGE,
  StudentExtraPhoneService,
} from './student-extra-phone.service';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
} from '../shared/extra-phone-rule';
import { WRONG_CURRENT_PASSWORD_MESSAGE } from '../shared/current-password';
import {
  INVALID_CODE_MESSAGE,
  buildPhoneVerifyMessage,
  codeKey,
} from '../shared/phone-code';

function makeRedis() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    async get(k: string) {
      return store.has(k) ? store.get(k)! : null;
    },
    async set(k: string, v: any, mode?: string, ttl?: number) {
      store.set(k, String(v));
      if (mode === 'EX' && ttl) ttls.set(k, Number(ttl));
      return 'OK';
    },
    async del(k: string) {
      const had = store.delete(k);
      ttls.delete(k);
      return had ? 1 : 0;
    },
    async incr(k: string) {
      const n = (Number(store.get(k)) || 0) + 1;
      store.set(k, String(n));
      return n;
    },
    async decr(k: string) {
      const n = (Number(store.get(k)) || 0) - 1;
      store.set(k, String(n));
      return n;
    },
    async expire(k: string, s: number) {
      ttls.set(k, s);
      return 1;
    },
    async ttl(k: string) {
      if (ttls.has(k)) return ttls.get(k)!;
      return store.has(k) ? -1 : -2;
    },
  };
}

const sha = (c: string) => createHash('sha256').update(c).digest('hex');
const STUDENT_ID = 10077;
const USER_ID = 20077;
const MAIN = '901234567';
const BACKUP = '935554433';
const PASSWORD = 'Qalam-2026';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

function build(opts: { extraPhone?: string | null; enabled?: boolean } = {}) {
  const row = {
    id: STUDENT_ID,
    phone: MAIN,
    extraPhone: opts.extraPhone ?? null,
    companyId: 1,
    userId: USER_ID,
  };
  const taken = { cards: new Set<string>(), accounts: new Set<string>() };
  const redis = makeRedis();
  const prisma = {
    student: {
      findFirst: jest.fn(async ({ where }: any) => {
        // The rule asks for ANOTHER card holding the number.
        if (where.OR) {
          const n = where.OR[0].phone;
          return taken.cards.has(n)
            ? { id: 10999, firstName: 'Vali', lastName: 'Aliyev' }
            : null;
        }
        return { ...row };
      }),
      update: jest.fn(async ({ data }: any) => {
        Object.assign(row, data);
        return { ...row };
      }),
    },
    user: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.OR) {
          const n = where.OR[0].phone;
          return taken.accounts.has(n) ? { id: 20999 } : null;
        }
        return where.id === USER_ID ? { password: PASSWORD_HASH } : null;
      }),
    },
    smsMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const eskiz = {
    isConfigured: jest.fn(() => true),
    sendSms: jest.fn().mockResolvedValue({ status: 'waiting' }),
  };
  const entityHistory = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const onboarding = { phoneVerificationEnabled: opts.enabled ?? true };
  const config = { get: (_k: string, def?: string) => def };
  const service = new StudentExtraPhoneService(
    prisma as any,
    redis as any,
    eskiz as any,
    entityHistory as any,
    config as any,
    onboarding as any,
  );
  return { service, row, taken, redis, prisma, eskiz, entityHistory };
}

async function sendAndCatchCode(b: ReturnType<typeof build>, phone = BACKUP) {
  await b.service.sendCode(STUDENT_ID, USER_ID, phone, PASSWORD);
  const [, message] = b.eskiz.sendSms.mock.calls.at(-1)!;
  return /(\d{4})$/.exec(message)![1];
}

describe('StudentExtraPhoneService (ADR-0070)', () => {
  it('status: the number and whether the door is open', async () => {
    expect(await build({ extraPhone: BACKUP }).service.status(STUDENT_ID)).toEqual({
      phone: BACKUP,
      editable: true,
    });
    expect(await build({ enabled: false }).service.status(STUDENT_ID)).toEqual({
      phone: null,
      editable: false,
    });
  });

  describe('sendCode', () => {
    it('is closed while SMS verification is switched off', async () => {
      const b = build({ enabled: false });
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_DOOR_CLOSED_MESSAGE);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it('wants a 9-digit Uzbek number', async () => {
      const b = build();
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, '491749493338', PASSWORD),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('checks the password before it tells anything about the number', async () => {
      const b = build();
      b.taken.cards.add(BACKUP);
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, 'wrong'),
      ).rejects.toThrow(WRONG_CURRENT_PASSWORD_MESSAGE);
      expect(b.eskiz.sendSms).not.toHaveBeenCalled();
    });

    it("refuses another student's number without naming them", async () => {
      const b = build();
      b.taken.cards.add(BACKUP);
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, BACKUP, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
    });

    it("refuses the card's own main number", async () => {
      const b = build();
      await expect(
        b.service.sendCode(STUDENT_ID, USER_ID, MAIN, PASSWORD),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    });

    it('sends the ADR-0039 text to the typed number and audits it', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      expect(b.eskiz.sendSms).toHaveBeenCalledWith(
        BACKUP,
        buildPhoneVerifyMessage(code),
      );
      const audit = b.prisma.smsMessage.create.mock.calls[0][0].data;
      // The exact text: the number, never the code.
      expect(audit.content).toBe(
        `Zaxira raqamni tasdiqlash kodi yuborildi: ${BACKUP}`,
      );
      expect(b.redis.store.has(codeKey('extra', STUDENT_ID))).toBe(true);
      expect(b.redis.store.has(codeKey('card', STUDENT_ID))).toBe(false);
    });
  });

  describe('verify', () => {
    it('a correct code writes the number and a history row by the student', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      const status = await b.service.verify(STUDENT_ID, USER_ID, code);
      expect(status).toEqual({ phone: BACKUP, editable: true });
      expect(b.row.extraPhone).toBe(BACKUP);
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: STUDENT_ID,
          oldValues: { extraPhone: null, sabab: null },
          newValues: {
            extraPhone: BACKUP,
            sabab: "O'quvchi o'zi qo'shdi, SMS bilan tasdiqladi",
          },
          changedById: USER_ID,
          companyId: 1,
        }),
      );
      expect(b.redis.store.has(codeKey('extra', STUDENT_ID))).toBe(false);
    });

    it('a wrong code costs an attempt and writes nothing', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      const wrong = code === '1234' ? '4321' : '1234';
      await expect(
        b.service.verify(STUDENT_ID, USER_ID, wrong),
      ).rejects.toThrow("Kod noto'g'ri. Qolgan urinishlar: 2");
      expect(b.row.extraPhone).toBeNull();
    });

    it("a code sent for the card's own number does not write the backup number", async () => {
      const b = build();
      await b.redis.set(
        codeKey('card', STUDENT_ID),
        JSON.stringify({ h: sha('1234'), n: 3, p: BACKUP }),
      );
      await expect(
        b.service.verify(STUDENT_ID, USER_ID, '1234'),
      ).rejects.toThrow(INVALID_CODE_MESSAGE);
      expect(b.row.extraPhone).toBeNull();
    });

    it('a number taken between the code and the write is refused', async () => {
      const b = build();
      const code = await sendAndCatchCode(b);
      b.taken.accounts.add(BACKUP);
      await expect(
        b.service.verify(STUDENT_ID, USER_ID, code),
      ).rejects.toThrow(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
      expect(b.row.extraPhone).toBeNull();
    });
  });

  describe('remove', () => {
    it('needs the current password', async () => {
      const b = build({ extraPhone: BACKUP });
      await expect(
        b.service.remove(STUDENT_ID, USER_ID, 'wrong'),
      ).rejects.toThrow(WRONG_CURRENT_PASSWORD_MESSAGE);
      expect(b.row.extraPhone).toBe(BACKUP);
    });

    it('clears the number and says who did it', async () => {
      const b = build({ extraPhone: BACKUP });
      const status = await b.service.remove(STUDENT_ID, USER_ID, PASSWORD);
      expect(status).toEqual({ phone: null, editable: true });
      expect(b.row.extraPhone).toBeNull();
      expect(b.entityHistory.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: { extraPhone: BACKUP, sabab: null },
          newValues: { extraPhone: null, sabab: "O'quvchi o'zi o'chirdi" },
          changedById: USER_ID,
        }),
      );
    });

    it('has nothing to remove on a card without one', async () => {
      const b = build();
      await expect(
        b.service.remove(STUDENT_ID, USER_ID, PASSWORD),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Run — must fail (module missing)**

```bash
cd server && npx jest src/students/extra-phone/student-extra-phone.service.spec.ts
```

- [ ] **Step 3: Create `server/src/students/extra-phone/student-extra-phone.service.ts`**

```ts
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EskizService } from '../../eskiz/eskiz.service';
import { EntityHistoryService } from '../../common/entity-history';
import { StudentOnboardingService } from '../onboarding/student-onboarding.service';
import { canVerifyBySms } from '../shared/student-onboarding';
import { assertExtraPhoneFree } from '../shared/extra-phone-rule';
import { assertCurrentPassword } from '../shared/current-password';
import {
  INVALID_CODE_MESSAGE,
  type PhoneCodeDeps,
  type SendResult,
  assertNumberNotFlooded,
  assertVerifyAllowed,
  clearCode,
  hashCode,
  issuePhoneCode,
  readStoredCode,
  rejectCode,
} from '../shared/phone-code';

export type ExtraPhoneStatus = { phone: string | null; editable: boolean };

export const EXTRA_PHONE_DOOR_CLOSED_MESSAGE =
  "Zaxira raqamni hozircha administrator qo'shadi";

/**
 * The student's own backup number (ADR-0070): a second sign-in key they add,
 * change or remove behind their current password (ADR-0031); a new number is
 * proved by an SMS code to it first (ADR-0039's machinery, its own code slot).
 * The door is open only while the ADR-0039 phone step is switched on — the
 * SMS text needs Eskiz's approval before a code can arrive.
 */
@Injectable()
export class StudentExtraPhoneService {
  private readonly logger = new Logger(StudentExtraPhoneService.name);
  private readonly globalHourlyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eskiz: EskizService,
    private readonly entityHistory: EntityHistoryService,
    config: ConfigService,
    private readonly onboarding: StudentOnboardingService,
  ) {
    this.globalHourlyCap =
      Number(config.get<string>('PHONE_VERIFY_SMS_GLOBAL_HOURLY_CAP', '300')) ||
      300;
  }

  async status(studentId: number): Promise<ExtraPhoneStatus> {
    const student = await this.load(studentId);
    return this.toStatus(student.extraPhone);
  }

  /** Order: door → number shape → password → the rule → limits → SMS. */
  async sendCode(
    studentId: number,
    userId: number,
    phone: string,
    currentPassword: string,
  ): Promise<SendResult> {
    const student = await this.load(studentId);
    this.assertDoorOpen();
    if (!canVerifyBySms(phone)) {
      throw new BadRequestException(
        "Telefon raqam 9 xonali O'zbekiston raqami bo'lishi kerak",
      );
    }
    if (phone === student.extraPhone) {
      throw new BadRequestException('Bu raqam allaqachon zaxira raqamingiz');
    }
    // The password first: a caller without it learns nothing about numbers.
    await assertCurrentPassword(this.prisma, userId, currentPassword);
    await assertExtraPhoneFree(this.prisma, phone, this.self(student), 'student');
    await assertNumberNotFlooded(this.redis, phone);
    return issuePhoneCode(this.codeDeps, 'extra', student, phone, {
      typedByStudent: true,
    });
  }

  async verify(
    studentId: number,
    userId: number,
    code: string,
  ): Promise<ExtraPhoneStatus> {
    await assertVerifyAllowed(this.redis, studentId);
    const student = await this.load(studentId);
    this.assertDoorOpen();

    const stored = await readStoredCode(this.redis, 'extra', studentId);
    if (!stored) throw new BadRequestException(INVALID_CODE_MESSAGE);
    if (hashCode(code) !== stored.h) {
      await rejectCode(this.redis, 'extra', studentId, stored);
    }
    await clearCode(this.redis, 'extra', studentId);

    // Again at write time: the number may have been taken since the code went.
    await assertExtraPhoneFree(
      this.prisma,
      stored.p,
      this.self(student),
      'student',
    );
    await this.prisma.student.update({
      where: { id: studentId },
      data: { extraPhone: stored.p },
    });
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { extraPhone: student.extraPhone, sabab: null },
      newValues: {
        extraPhone: stored.p,
        sabab: "O'quvchi o'zi qo'shdi, SMS bilan tasdiqladi",
      },
      changedById: userId,
      companyId: student.companyId,
    });
    return this.toStatus(stored.p);
  }

  async remove(
    studentId: number,
    userId: number,
    currentPassword: string,
  ): Promise<ExtraPhoneStatus> {
    const student = await this.load(studentId);
    this.assertDoorOpen();
    if (!student.extraPhone) {
      throw new BadRequestException("Zaxira raqam yo'q");
    }
    await assertCurrentPassword(this.prisma, userId, currentPassword);
    await this.prisma.student.update({
      where: { id: studentId },
      data: { extraPhone: null },
    });
    await this.entityHistory.recordUpdate({
      entityType: 'Student',
      entityId: studentId,
      oldValues: { extraPhone: student.extraPhone, sabab: null },
      newValues: { extraPhone: null, sabab: "O'quvchi o'zi o'chirdi" },
      changedById: userId,
      companyId: student.companyId,
    });
    return this.toStatus(null);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private async load(studentId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        phone: true,
        extraPhone: true,
        companyId: true,
        userId: true,
      },
    });
    if (!student) throw new NotFoundException('Talaba topilmadi');
    return student;
  }

  private self(student: { id: number; userId: number | null; phone: string }) {
    return { studentId: student.id, userId: student.userId, phone: student.phone };
  }

  private toStatus(phone: string | null): ExtraPhoneStatus {
    return { phone, editable: this.onboarding.phoneVerificationEnabled };
  }

  private assertDoorOpen(): void {
    if (!this.onboarding.phoneVerificationEnabled) {
      throw new BadRequestException(EXTRA_PHONE_DOOR_CLOSED_MESSAGE);
    }
  }

  private get codeDeps(): PhoneCodeDeps {
    return {
      prisma: this.prisma,
      redis: this.redis,
      eskiz: this.eskiz,
      logger: this.logger,
      globalHourlyCap: this.globalHourlyCap,
    };
  }
}
```
(`Student.companyId` is a non-null `Int`: the onboarding service already passes it as `number` to the same places.)

- [ ] **Step 4: Run the spec and typecheck, format, commit**

```bash
cd server && npx prettier --write src/students/extra-phone/*.ts && npx jest src/students/extra-phone src/students/phone-proof.single-source.spec.ts src/students/student-phone.single-source.spec.ts && npm run typecheck
```
Expected: 14 PASS, guards PASS, typecheck clean.

```bash
git add server/src/students/extra-phone
git commit -m "feat(students): o'quvchi zaxira raqamni parol + SMS kod bilan qo'shadi, parol bilan o'chiradi"
```

---

### Task 9: Controller, DTOs, module wiring, route manifest, guard lists

**Files:**
- Create: `server/src/students/extra-phone/dto/extra-phone-send-code.dto.ts`, `extra-phone-verify.dto.ts`, `extra-phone-remove.dto.ts`, `server/src/students/extra-phone/student-extra-phone.controller.ts`, `server/src/students/extra-phone/student-extra-phone.controller.spec.ts`
- Modify: `server/src/students/students.module.ts`, `server/src/common/auth/branch-route-policy.ts` (after the onboarding SELF block ≈ line 695), `server/src/common/guards/own-password-attempt.routes.spec.ts`

**Interfaces:** consumes `StudentExtraPhoneService` (Task 8). Produces the routes the client (Task 12) calls:
- `GET /student-portal/extra-phone` → `ExtraPhoneStatus`
- `POST /student-portal/extra-phone/send-code { phone, currentPassword }` → `SendResult` (200)
- `POST /student-portal/extra-phone/verify { code }` → `ExtraPhoneStatus` (200)
- `POST /student-portal/extra-phone/remove { currentPassword }` → `ExtraPhoneStatus` (200)

- [ ] **Step 1: Write the failing controller spec**

```ts
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard, StudentCardGuard } from '../../common/guards';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { StudentExtraPhoneController } from './student-extra-phone.controller';

describe('StudentExtraPhoneController (ADR-0070)', () => {
  it('is Student-only, and refuses a token with no student card', () => {
    const reflector = new Reflector();
    expect(reflector.get(ROLES_KEY, StudentExtraPhoneController)).toEqual([
      'Student',
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentExtraPhoneController),
    ).toEqual([RolesGuard, StudentCardGuard]);
  });

  it('caps password attempts on the two routes that ask for it (ADR-0031)', () => {
    const p = StudentExtraPhoneController.prototype;
    expect(Reflect.getMetadata(GUARDS_METADATA, p.sendCode)).toEqual([
      OwnPasswordAttemptGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, p.remove)).toEqual([
      OwnPasswordAttemptGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, p.verify)).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, p.status)).toBeUndefined();
  });

  it('takes the student from the token, never from the request', async () => {
    const service = {
      status: jest.fn().mockResolvedValue({}),
      sendCode: jest.fn().mockResolvedValue({}),
      verify: jest.fn().mockResolvedValue({}),
      remove: jest.fn().mockResolvedValue({}),
    };
    const controller = new StudentExtraPhoneController(service as any);

    await controller.status(10077);
    await controller.sendCode(10077, 20077, {
      phone: '935554433',
      currentPassword: 'x',
    });
    await controller.verify(10077, 20077, { code: '1234' });
    await controller.remove(10077, 20077, { currentPassword: 'x' });

    expect(service.status).toHaveBeenCalledWith(10077);
    expect(service.sendCode).toHaveBeenCalledWith(10077, 20077, '935554433', 'x');
    expect(service.verify).toHaveBeenCalledWith(10077, 20077, '1234');
    expect(service.remove).toHaveBeenCalledWith(10077, 20077, 'x');
  });
});
```

Also add to `doors` in `server/src/common/guards/own-password-attempt.routes.spec.ts` (import `StudentExtraPhoneController` from `'../../students/extra-phone/student-extra-phone.controller'`):
```ts
  [
    'POST /student-portal/extra-phone/send-code',
    StudentExtraPhoneController.prototype.sendCode,
  ],
  [
    'POST /student-portal/extra-phone/remove',
    StudentExtraPhoneController.prototype.remove,
  ],
```

- [ ] **Step 2: Run — fail (controller missing)**

```bash
cd server && npx jest src/students/extra-phone/student-extra-phone.controller.spec.ts src/common/guards/own-password-attempt.routes.spec.ts
```

- [ ] **Step 3: Create the DTOs**

`dto/extra-phone-send-code.dto.ts`:
```ts
import { IsString, Matches, MinLength } from 'class-validator';

/** A backup number the student types, behind their password (ADR-0031). */
export class ExtraPhoneSendCodeDto {
  @IsString()
  @Matches(/^\d{9}$/, { message: "Telefon raqam 9 xonali bo'lishi kerak" })
  phone: string;

  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
```
`dto/extra-phone-verify.dto.ts`:
```ts
import { IsString, Matches } from 'class-validator';

export class ExtraPhoneVerifyDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: "Kod 4 xonali bo'lishi kerak" })
  code: string;
}
```
`dto/extra-phone-remove.dto.ts`:
```ts
import { IsString, MinLength } from 'class-validator';

export class ExtraPhoneRemoveDto {
  @IsString()
  @MinLength(1, { message: 'Joriy parolni kiriting' })
  currentPassword: string;
}
```

- [ ] **Step 4: Create the controller**

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../../common/decorators';
import { RolesGuard, StudentCardGuard } from '../../common/guards';
import { OwnPasswordAttemptGuard } from '../../common/guards/own-password-attempt.guard';
import { StudentExtraPhoneService } from './student-extra-phone.service';
import { ExtraPhoneSendCodeDto } from './dto/extra-phone-send-code.dto';
import { ExtraPhoneVerifyDto } from './dto/extra-phone-verify.dto';
import { ExtraPhoneRemoveDto } from './dto/extra-phone-remove.dto';

/**
 * The student's own backup number (ADR-0070). Every route is the caller's own
 * card: the id comes from the token, never from the request.
 */
@Controller('student-portal/extra-phone')
@UseGuards(RolesGuard, StudentCardGuard)
@Roles('Student')
export class StudentExtraPhoneController {
  constructor(private readonly extraPhone: StudentExtraPhoneService) {}

  @Get()
  status(@CurrentUser('studentId') studentId: number) {
    return this.extraPhone.status(studentId);
  }

  /** Asks for the current password (ADR-0031), so it carries the attempt cap. */
  @Post('send-code')
  @HttpCode(200)
  @UseGuards(OwnPasswordAttemptGuard)
  sendCode(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneSendCodeDto,
  ) {
    return this.extraPhone.sendCode(
      studentId,
      userId,
      dto.phone,
      dto.currentPassword,
    );
  }

  @Post('verify')
  @HttpCode(200)
  verify(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneVerifyDto,
  ) {
    return this.extraPhone.verify(studentId, userId, dto.code);
  }

  @Post('remove')
  @HttpCode(200)
  @UseGuards(OwnPasswordAttemptGuard)
  remove(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ExtraPhoneRemoveDto,
  ) {
    return this.extraPhone.remove(studentId, userId, dto.currentPassword);
  }
}
```

- [ ] **Step 5: Wire the module and the route manifest**

`students.module.ts`: import `StudentExtraPhoneController` and `StudentExtraPhoneService` from `'./extra-phone/…'`; add the controller to `controllers` after `StudentOnboardingController`, the service to `providers` after `StudentOnboardingService`.

`branch-route-policy.ts`: after the onboarding SELF block (the one ending with `'POST /student-portal/onboarding/phone/verify',` `],` `},`) add:
```ts
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      "student's own backup number (ADR-0070): read, added or changed behind " +
      'their current password and an SMS code to the new number, or removed ' +
      'behind the password. No student id comes from the request, and the ' +
      'row written is always the caller card, whatever its branch.',
    routes: [
      'GET /student-portal/extra-phone',
      'POST /student-portal/extra-phone/remove',
      'POST /student-portal/extra-phone/send-code',
      'POST /student-portal/extra-phone/verify',
    ],
  },
```

- [ ] **Step 6: Run the specs, build, format, commit**

```bash
cd server && npx prettier --write src/students/extra-phone/*.ts src/students/extra-phone/dto/*.ts src/students/students.module.ts src/common/auth/branch-route-policy.ts src/common/guards/own-password-attempt.routes.spec.ts && npx jest src/students/extra-phone src/common/guards/own-password-attempt.routes.spec.ts src/common/auth/branch-route-policy.spec.ts src/students/student-portal.controller.spec.ts && npm run build
```
Expected: PASS, build clean.

```bash
git add server/src/students/extra-phone server/src/students/students.module.ts server/src/common/auth/branch-route-policy.ts server/src/common/guards/own-password-attempt.routes.spec.ts
git commit -m "feat(students): zaxira raqam yo'llari — /student-portal/extra-phone"
```

---

### Task 10: Admin forms — «Zaxira raqam» input (edit drawer + add dialog)

**Files:**
- Modify: `client/src/components/students/edit-student-additional-fields.tsx`, `client/src/components/students/add-student-dialog.tsx`, `client/src/lib/schemas/student-schema.ts`
- Create: `client/src/components/students/edit-student-additional-fields.test.ts`

- [ ] **Step 1: Write the failing test**

`client/src/components/students/edit-student-additional-fields.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EditStudentAdditionalFields } from "./edit-student-additional-fields";
import type { EditStudentFormValues } from "@/lib/schemas/student-schema";

function Harness({ values }: { values: Partial<EditStudentFormValues> }) {
  const form = useForm<EditStudentFormValues>({
    defaultValues: {
      firstName: "Ali",
      lastName: "Valiyev",
      phone: "901234567",
      extraPhone: "",
      parentPhone: "",
      parentName: "",
      placeOfStudy: "",
      address: "",
      passportSeries: "",
      ...values,
    },
  });
  return createElement(
    TooltipProvider,
    null,
    createElement(EditStudentAdditionalFields, { form }),
  );
}

const text = (values: Partial<EditStudentFormValues>) =>
  renderToStaticMarkup(createElement(Harness, { values }))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

// ADR-0070: the backup number is a sign-in key, so the editor must SHOW the
// one the card already has — the panel used to open with every section hidden.
describe("student edit — additional fields", () => {
  it("opens the backup-number section when the card has one, with the sign-in hint", () => {
    const t = text({ extraPhone: "935554433" });
    expect(t).toContain("Zaxira raqam");
    expect(t).toContain("O'quvchi bu raqam bilan ham tizimga kira oladi");
  });

  it("opens the parent section when the card has a parent phone", () => {
    expect(text({ parentPhone: "901112233" })).toContain("Ota-ona telefoni");
  });

  it("keeps every section closed on an empty card", () => {
    const t = text({});
    expect(t).not.toContain("Ota-ona telefoni");
    expect(t).not.toContain("O'quvchi bu raqam bilan ham tizimga kira oladi");
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd client && npx vitest run src/components/students/edit-student-additional-fields.test.ts
```
Expected: the first two tests FAIL (sections closed; no «Zaxira raqam» section).

- [ ] **Step 3: Implement the edit panel**

In `edit-student-additional-fields.tsx`:
1. Import `Phone` from `lucide-react` (add to the existing import list).
2. Add as the FIRST entry of `sections`:
```ts
  {
    key: "extraPhone",
    icon: Phone,
    tooltip: "Zaxira raqam",
    fields: ["extraPhone"] as const,
  },
```
3. Replace `const [visible, setVisible] = useState<Set<string>>(new Set());` with:
```ts
  // A section whose field already holds a value opens at once: a backup number
  // is a sign-in key (ADR-0070), and an editor that hides it is wrong.
  const [visible, setVisible] = useState<Set<string>>(
    () =>
      new Set(
        sections
          .filter((s) => s.fields.some((f) => Boolean(form.getValues(f))))
          .map((s) => s.key),
      ),
  );
```
4. Inside the `hasAnyVisible` box, before `{visible.has("placeOfStudy") && (`, add:
```tsx
          {visible.has("extraPhone") && (
            <div className="space-y-1.5">
              <Label>Zaxira raqam</Label>
              <Controller
                control={form.control}
                name="extraPhone"
                render={({ field }) => (
                  <PhoneInput
                    value={field.value}
                    onChange={field.onChange}
                    name={field.name}
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                O&apos;quvchi bu raqam bilan ham tizimga kira oladi.
              </p>
              {form.formState.errors.extraPhone && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.extraPhone.message}
                </p>
              )}
            </div>
          )}
```

- [ ] **Step 4: Implement the add dialog**

`student-schema.ts`: in `addStudentSchema`, after `phone`, add `extraPhone: phoneDigits.optional(),`.

`add-student-dialog.tsx`:
- Both `defaultValues` and the `form.reset({ … })` object: add `extraPhone: "",` after `phone: "",`.
- The `api.post<Student>("/students", { … })` body: add `extraPhone: values.extraPhone || undefined,` after `phone: values.phone,`.
- After the «Telefon raqam» block (the `</div>` closing it, before the `sourceId` Controller) add:
```tsx
          <div className="space-y-1.5">
            <Label>Zaxira raqam (ixtiyoriy)</Label>
            <Controller
              control={form.control}
              name="extraPhone"
              render={({ field }) => (
                <PhoneInput
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  name={field.name}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              O&apos;quvchi bu raqam bilan ham tizimga kira oladi.
            </p>
            {form.formState.errors.extraPhone && (
              <p className="text-xs text-destructive">
                {form.formState.errors.extraPhone.message}
              </p>
            )}
          </div>
```

- [ ] **Step 5: Run the test, typecheck and lint, commit**

```bash
cd client && npx vitest run src/components/students/edit-student-additional-fields.test.ts && npx tsc --noEmit && npm run lint 2>&1 | tail -3
```
Expected: 3 PASS, tsc clean, lint `0 errors`.

```bash
git add client/src/components/students/edit-student-additional-fields.tsx client/src/components/students/edit-student-additional-fields.test.ts client/src/components/students/add-student-dialog.tsx client/src/lib/schemas/student-schema.ts
git commit -m "feat(client): admin o'quvchi formasida «Zaxira raqam» maydoni"
```

---

### Task 11: Admin card — every number, named; one label everywhere

**Files:**
- Create: `client/src/components/students/student-phone-rows.ts`, `client/src/components/students/student-phone-rows.test.ts`
- Modify: `client/src/components/students/student-profile-card.tsx` (the «Telefon:» block ≈ lines 185–204), `client/src/components/shared/entity-history-utils.ts` (line 60), `client/src/components/leads/lead-additional-fields.tsx` (lines 64, 91)

- [ ] **Step 1: Write the failing test**

`student-phone-rows.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { studentPhoneRows } from "./student-phone-rows";

// ADR-0070: the card shows every number the student has, each named, and says
// which of them open the portal. An empty one is not drawn.
describe("studentPhoneRows", () => {
  it("names all three and marks the two sign-in keys", () => {
    expect(
      studentPhoneRows({
        phone: "901234567",
        extraPhone: "935554433",
        parentPhone: "901112233",
      }),
    ).toEqual([
      { key: "phone", label: "Asosiy", phone: "901234567", signIn: true },
      { key: "extraPhone", label: "Zaxira", phone: "935554433", signIn: true },
      { key: "parentPhone", label: "Ota-ona", phone: "901112233", signIn: false },
    ]);
  });

  it("leaves empty numbers out", () => {
    expect(
      studentPhoneRows({ phone: "901234567", extraPhone: null, parentPhone: null }),
    ).toEqual([
      { key: "phone", label: "Asosiy", phone: "901234567", signIn: true },
    ]);
  });
});
```

- [ ] **Step 2: Run — fail (module missing)**

```bash
cd client && npx vitest run src/components/students/student-phone-rows.test.ts
```

- [ ] **Step 3: Create `student-phone-rows.ts`**

```ts
import type { Student } from "@/data/student-model";

export interface StudentPhoneRow {
  key: "phone" | "extraPhone" | "parentPhone";
  label: string;
  phone: string;
  /** Opens the student portal (ADR-0070: the main and the backup number do). */
  signIn: boolean;
}

/** The card's numbers, named, empty ones left out. */
export function studentPhoneRows(
  s: Pick<Student, "phone" | "extraPhone" | "parentPhone">,
): StudentPhoneRow[] {
  const rows: StudentPhoneRow[] = [
    { key: "phone", label: "Asosiy", phone: s.phone, signIn: true },
  ];
  if (s.extraPhone) {
    rows.push({ key: "extraPhone", label: "Zaxira", phone: s.extraPhone, signIn: true });
  }
  if (s.parentPhone) {
    rows.push({ key: "parentPhone", label: "Ota-ona", phone: s.parentPhone, signIn: false });
  }
  return rows;
}
```

- [ ] **Step 4: Render the rows on the card**

In `student-profile-card.tsx` add `import { studentPhoneRows } from "./student-phone-rows";` and replace the block from `<div className="flex items-center gap-2">` … `<span className="text-muted-foreground">Telefon:</span>` … through the closing `</div>` of the badges row (`<TelegramBotBadge … />` `</div>`) with:

```tsx
        {studentPhoneRows(student).map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground">{row.label}:</span>
              </TooltipTrigger>
              <TooltipContent>
                {row.signIn
                  ? "Bu raqam bilan tizimga kiradi"
                  : "Kirish uchun ishlatilmaydi"}
              </TooltipContent>
            </Tooltip>
            <a
              href={`tel:+998${row.phone}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {formatPhone(row.phone)}
            </a>
          </div>
        ))}
        <div className="flex flex-wrap gap-1.5">
          <PhoneProofBadge
            verified={student.phoneVerified}
            verifiedAt={student.phoneVerifiedAt}
          />
          <TelegramBotBadge
            chatId={student.telegramChatId}
            disconnectedAt={student.telegramDisconnectedAt}
          />
        </div>
```
(`Tooltip`, `TooltipContent`, `TooltipTrigger` are already imported in this file.)

- [ ] **Step 5: One label everywhere**

- `entity-history-utils.ts` line 60: `extraPhone: "Qo'shimcha telefon",` → `extraPhone: "Zaxira raqam",`.
- `lead-additional-fields.tsx` line 64: `<Label htmlFor="extraPhone">Qo&apos;shimcha telefon</Label>` → `<Label htmlFor="extraPhone">Zaxira raqam</Label>`; line 91: `<TooltipContent>Qo&apos;shimcha telefon</TooltipContent>` → `<TooltipContent>Zaxira raqam</TooltipContent>`.

- [ ] **Step 6: Run tests, typecheck, lint, commit**

```bash
cd client && npx vitest run src/components/students src/components/shared src/components/leads && npx tsc --noEmit && npm run lint 2>&1 | tail -3
```
Expected: PASS, tsc clean, 0 errors. (If a leads or history test asserts the old label «Qo'shimcha telefon», change the expected text to «Zaxira raqam» — the rename is the point.)

```bash
git add client/src/components/students/student-phone-rows.ts client/src/components/students/student-phone-rows.test.ts client/src/components/students/student-profile-card.tsx client/src/components/shared/entity-history-utils.ts client/src/components/leads/lead-additional-fields.tsx
git commit -m "feat(client): o'quvchi kartasida barcha raqamlar nomi bilan; bitta nom — «Zaxira raqam»"
```

---

### Task 12: Portal — the «Zaxira raqam» row and its dialog

**Files:**
- Create: `client/src/components/student-portal/extra-phone-row-state.ts`, `extra-phone-row-state.test.ts`, `student-extra-phone-dialog.tsx`
- Modify: `client/src/components/student-portal/lib/types.ts`, `lib/queries.ts`, `student-profile-page.tsx`

**Interfaces:** consumes the routes of Task 9.

- [ ] **Step 1: Types and query**

`lib/types.ts` — append:
```ts
/** The student's backup sign-in number (ADR-0070) and whether they may edit it. */
export interface ExtraPhoneStatus {
  phone: string | null;
  /** False while SMS verification is switched off: staff add the number then. */
  editable: boolean;
}
```
`lib/queries.ts` — import `ExtraPhoneStatus` from `./types` and append:
```ts
export const EXTRA_PHONE_QUERY_KEY = ["student-portal", "extra-phone"] as const;

// The backup number and whether the student may change it (ADR-0070). Each
// write answers with the new status, which goes straight into this cache.
export function useExtraPhone() {
  return useQuery<ExtraPhoneStatus>({
    queryKey: EXTRA_PHONE_QUERY_KEY,
    queryFn: () => api.get("/student-portal/extra-phone").then((r) => r.data),
  });
}
```

- [ ] **Step 2: Write the failing state test**

`extra-phone-row-state.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { extraPhoneRowState } from "./extra-phone-row-state";

// ADR-0070: one row on Profile. What it says depends on whether the student
// has a backup number and whether the SMS door is open.
describe("extraPhoneRowState", () => {
  it("is hidden until the status answers", () => {
    expect(extraPhoneRowState(undefined)).toBeNull();
  });

  it("offers to add when there is none and the door is open", () => {
    expect(extraPhoneRowState({ phone: null, editable: true })).toEqual({
      value: "Qo'shilmagan",
      actions: ["add"],
      note: null,
    });
  });

  it("shows the number with change and remove, and says what it is for", () => {
    expect(extraPhoneRowState({ phone: "935554433", editable: true })).toEqual({
      value: "+998 93 555 44 33",
      actions: ["change", "remove"],
      note: "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.",
    });
  });

  it("is read-only while the door is closed", () => {
    expect(extraPhoneRowState({ phone: null, editable: false })).toEqual({
      value: "Qo'shilmagan",
      actions: [],
      note: "Zaxira raqamni administrator qo'shadi.",
    });
    expect(extraPhoneRowState({ phone: "935554433", editable: false })).toEqual({
      value: "+998 93 555 44 33",
      actions: [],
      note: "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.",
    });
  });
});
```

- [ ] **Step 3: Run — fail; then create `extra-phone-row-state.ts`**

```bash
cd client && npx vitest run src/components/student-portal/extra-phone-row-state.test.ts
```

```ts
import { formatPhone } from "@/lib/format-utils";
import type { ExtraPhoneStatus } from "./lib/types";

export type ExtraPhoneAction = "add" | "change" | "remove";

export interface ExtraPhoneRowState {
  value: string;
  actions: ExtraPhoneAction[];
  note: string | null;
}

export const EXTRA_PHONE_SIGN_IN_NOTE =
  "Bu raqam bilan ham tizimga kira olasiz. Parolni tiklash kodi faqat asosiy raqamga boradi.";
export const EXTRA_PHONE_STAFF_ONLY_NOTE = "Zaxira raqamni administrator qo'shadi.";

/** What the Profile row shows for the backup number (ADR-0070). */
export function extraPhoneRowState(
  status: ExtraPhoneStatus | undefined,
): ExtraPhoneRowState | null {
  if (!status) return null;
  const has = Boolean(status.phone);
  return {
    value: has ? formatPhone(status.phone as string) : "Qo'shilmagan",
    actions: status.editable ? (has ? ["change", "remove"] : ["add"]) : [],
    note: has
      ? EXTRA_PHONE_SIGN_IN_NOTE
      : status.editable
        ? null
        : EXTRA_PHONE_STAFF_ONLY_NOTE,
  };
}
```
Run the test again — expected 4 PASS (`formatPhone("935554433")` is `+998 93 555 44 33`, `client/src/lib/format-utils.ts`).

- [ ] **Step 4: Create `student-extra-phone-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import {
  FpCodeInput,
  FpPhoneInput,
} from "@/components/auth/forgot-password-fields";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button, Field, Input } from "./lumio";
import { EXTRA_PHONE_QUERY_KEY } from "./lib/queries";
import type { ExtraPhoneStatus, StudentProfile } from "./lib/types";

export interface StudentExtraPhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "set" adds or changes the number (phone + password → SMS code); "remove" asks the password only. */
  mode: "set" | "remove";
}

type Stage = "form" | "code";

/**
 * The student's backup sign-in number (ADR-0070). A new number is confirmed by
 * a code to it, behind the current password (ADR-0031); removing it asks the
 * password alone. Every answer is the new status, written into the cache.
 */
export function StudentExtraPhoneDialog({
  open,
  onOpenChange,
  mode,
}: StudentExtraPhoneDialogProps) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<Stage>("form");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage("form");
    setPhone("");
    setPassword("");
    setCode("");
    setCooldown(0);
    setError("");
  }, [open]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function applyStatus(status: ExtraPhoneStatus) {
    queryClient.setQueryData<ExtraPhoneStatus>(EXTRA_PHONE_QUERY_KEY, status);
    queryClient.setQueryData<StudentProfile>(
      ["student-portal", "profile"],
      (old) => (old ? { ...old, extraPhone: status.phone } : old),
    );
  }

  async function sendCode() {
    if (phone.length !== 9) {
      setError("Telefon raqamni to'liq kiriting");
      return;
    }
    if (!password) {
      setError("Joriy parolingizni kiriting");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<{ resendInSec: number }>(
        "/student-portal/extra-phone/send-code",
        { phone, currentPassword: password },
      );
      setStage("code");
      setCode("");
      setCooldown(res.data.resendInSec);
    } catch (err) {
      setError(
        getErrorMessage(err, "SMS yuborilmadi. Birozdan keyin qayta urinib ko'ring"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 4) {
      setError("Kod 4 xonali bo'lishi kerak");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<ExtraPhoneStatus>(
        "/student-portal/extra-phone/verify",
        { code },
      );
      applyStatus(res.data);
      toast.success("Zaxira raqam saqlandi");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "Kod noto'g'ri yoki muddati tugagan"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!password) {
      setError("Joriy parolingizni kiriting");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const res = await api.post<ExtraPhoneStatus>(
        "/student-portal/extra-phone/remove",
        { currentPassword: password },
      );
      applyStatus(res.data);
      toast.success("Zaxira raqam o'chirildi");
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err, "O'chirishda xatolik"));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "remove"
      ? "Zaxira raqamni o'chirish"
      : stage === "code"
        ? "SMS kod"
        : "Zaxira raqam";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            {title}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "remove") void remove();
            else if (stage === "code") void verify();
            else void sendCode();
          }}
          className="space-y-4"
        >
          {mode === "set" && stage === "form" ? (
            <>
              <Field label="Yangi zaxira raqam">
                <FpPhoneInput lumio value={phone} onChange={setPhone} />
              </Field>
              <p className="px-1 text-xs font-semibold text-ink-500">
                Kod shu raqamga boradi. Tasdiqlangach bu raqam bilan ham tizimga
                kira olasiz.
              </p>
            </>
          ) : null}

          {mode === "set" && stage === "code" ? (
            <>
              <p className="text-sm font-semibold text-ink-500">
                Kod{" "}
                <span className="whitespace-nowrap font-bold text-ink-700">
                  {formatPhone(phone)}
                </span>{" "}
                raqamiga yuborildi.
              </p>
              <Field label="SMS kod">
                <FpCodeInput lumio value={code} onChange={setCode} />
              </Field>
            </>
          ) : null}

          {stage === "form" ? (
            <Field label="Joriy parolingiz">
              <Input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          ) : null}

          {error ? (
            <p role="alert" className="px-1 text-sm font-bold text-danger">
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            {stage === "code" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void sendCode()}
                disabled={cooldown > 0 || busy}
              >
                {cooldown > 0
                  ? `Qayta yuborish (${cooldown}s)`
                  : "Kodni qayta yuborish"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                Bekor qilish
              </Button>
            )}
            <Button type="submit" loading={busy}>
              {mode === "remove"
                ? "O'chirish"
                : stage === "code"
                  ? "Tasdiqlash"
                  : "Kod yuborish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: The row on Profile**

In `student-profile-page.tsx`:
- Imports: add `Plus, Trash` is already imported — add `Plus` to the `@phosphor-icons/react` import; import `useExtraPhone` next to `useStudentProfile`; import `StudentExtraPhoneDialog` and `extraPhoneRowState`.
- State: after `const [nameOpen, setNameOpen] = useState(false);` add
```tsx
  const { data: extraPhone } = useExtraPhone();
  const [extraPhoneDialog, setExtraPhoneDialog] = useState<"set" | "remove" | null>(null);
  const extraRow = extraPhoneRowState(extraPhone);
```
- Replace `<InfoRow label="Telefon" value={formatPhone(profile.phone)} />` with:
```tsx
            <InfoRow label="Telefon" value={formatPhone(profile.phone)} />
            {extraRow ? (
              <div className="border-b border-line py-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold text-ink-500">
                    Zaxira raqam
                  </span>
                  <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <span className="truncate text-right font-display font-bold text-ink-900">
                      {extraRow.value}
                    </span>
                    {extraRow.actions.includes("add") ? (
                      <button
                        type="button"
                        onClick={() => setExtraPhoneDialog("set")}
                        aria-label="Zaxira raqam qo'shish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
                      >
                        <Plus size={15} weight="bold" />
                      </button>
                    ) : null}
                    {extraRow.actions.includes("change") ? (
                      <button
                        type="button"
                        onClick={() => setExtraPhoneDialog("set")}
                        aria-label="Zaxira raqamni o'zgartirish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:bg-tint"
                      >
                        <PencilSimple size={15} weight="bold" />
                      </button>
                    ) : null}
                    {extraRow.actions.includes("remove") ? (
                      <button
                        type="button"
                        onClick={() => setExtraPhoneDialog("remove")}
                        aria-label="Zaxira raqamni o'chirish"
                        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-danger transition-colors hover:bg-tint"
                      >
                        <Trash size={15} weight="bold" />
                      </button>
                    ) : null}
                  </span>
                </div>
                {extraRow.note ? (
                  <p className="mt-1 text-xs font-semibold text-ink-500">
                    {extraRow.note}
                  </p>
                ) : null}
              </div>
            ) : null}
```
- After `<StudentNameDialog … />` add:
```tsx
      <StudentExtraPhoneDialog
        open={extraPhoneDialog !== null}
        onOpenChange={(o) => {
          if (!o) setExtraPhoneDialog(null);
        }}
        mode={extraPhoneDialog ?? "set"}
      />
```

- [ ] **Step 6: Typecheck, tests, lint, build; commit**

```bash
cd client && npx tsc --noEmit && npx vitest run src/components/student-portal && npm run lint 2>&1 | tail -3 && npx next build 2>&1 | tail -5
```
Expected: clean, PASS, 0 errors, build succeeds (the load-state tests of the profile screen still pass: the row is hidden while `useExtraPhone` has no answer).

```bash
git add client/src/components/student-portal
git commit -m "feat(portal): profilda «Zaxira raqam» qatori — parol + SMS kod bilan qo'shish, parol bilan o'chirish"
```

---

### Task 13: ADR-0070, index row, `server/CLAUDE.md`

**Files:**
- Create: `docs/adr/0070-zaxira-raqam-ikkinchi-kirish-kaliti.md`
- Modify: `docs/adr/README.md` (table, after the 0066 row), `server/CLAUDE.md` (after the ADR-0032 bullet under «#### Phone-based login (all roles)»)

- [ ] **Step 1: Check the number is still free**

```bash
git fetch -q origin && git ls-tree --name-only origin/main docs/adr/ | tail -3
```
Expected: the last file is `0066-…`. If `0067-…` exists on `origin/main`, use the next free number in every place below (file name, title, README row, CLAUDE.md, and the `ADR-0070` mentions in code comments: `git grep -n "ADR-0070" -- server client` lists them).

- [ ] **Step 2: Write the ADR**

```markdown
# ADR-0070 — Zaxira raqam o'quvchining ikkinchi kirish kaliti; asosiy raqam ustun

**Holati:** Qabul qilindi
**Sana:** 2026-10-03
**Bog'liq:** ADR-0022, ADR-0031, ADR-0032, ADR-0033, ADR-0039, ADR-0040, ADR-0045, `server/src/auth/auth.service.ts` (`buildExtraPhoneLookup`), `server/src/students/shared/extra-phone-rule.ts`, `server/src/students/shared/phone-code.ts`, `server/src/students/extra-phone/`, `docs/superpowers/specs/2026-10-02-zaxira-raqam-kirish-design.md`

## Kontekst

Kirish faqat hisobdagi raqamni (`User.login` / `User.phone`) tanirdi.
O'quvchi kartasidagi zaxira raqam (`Student.extraPhone`) faqat qidiruvda
ishlatilardi; admin oynasida o'quvchi uchun bu maydon chizilmasdi ham
(prodda zaxira raqamli tirik o'quvchi 0 ta, 1089 dan). CEO (02.10.2026):
zaxira raqam bilan ham kirish mumkin bo'lsin, uni admin kiritadi, o'quvchi
o'zi ham profilidan qo'sha olsin, admin kartada barcha raqamlarni ko'rsin.

## Qaror

1. **Ikki bosqichli qidiruv.** Parol bilan kirish va saytdagi «Telegram orqali
   kirish» avval hisobning o'z raqamini (hozirgi shart), topilmasa — tirik
   kartaning zaxira raqamini qidiradi. Asosiy raqam har doim ustun: 1-bosqich
   hisob topsa, parol noto'g'ri bo'lsa ham 2-bosqichga o'tilmaydi.
   2-bosqich faqat o'quvchi portalida (`admin.` / `lehrer.` da yo'q).
2. **Bitta zaxira raqam — bitta o'quvchi.** Zaxira raqam o'z asosiy raqamiga,
   boshqa o'chirilmagan kartaning asosiy yoki zaxira raqamiga, boshqa tirik
   o'quvchi hisobining kirish raqamiga teng bo'lmaydi (`assertExtraPhoneFree`;
   xodim hisobi to'siq emas — ADR-0022). Admin tahriri va yaratishi 400 bilan
   rad etadi; lid aylantirish va arxivdan tiklash to'xtamaydi — band raqam
   ko'chmaydi / olib tashlanadi, tarixga yoziladi. Asosiy raqam boshqa
   o'quvchining zaxira raqamiga o'zgarsa, saqlash to'xtatilmaydi — eski zaxira
   o'z-o'zidan kalit bo'lmay qoladi. ADR-0039 «Yo'q, boshqa raqam» yo'lida
   o'z zaxira raqamiga ko'chgan asosiy raqam zaxirani bo'shatadi.
3. **O'quvchi o'zi: joriy parol + yangi raqamga SMS kod** qo'shish va
   o'zgartirishda, **joriy parol** o'chirishda (ADR-0031). SMS — ADR-0039 kod
   mexanizmi va matni, alohida kod uyasi (`extra_phone:code:*`), umumiy
   cheklovlar; `STUDENT_PHONE_VERIFICATION_ENABLED` o'chiq bo'lsa bu eshik
   yopiq — profil «Zaxira raqamni administrator qo'shadi» deb yozadi.
   Zaxira raqamni tasdiqlash asosiy raqamni tasdiqlangan qilmaydi.
4. **O'zgarmaydi:** SMS bilan parol tiklash (faqat asosiy raqam), bot
   sahnalari, Telegram ichidagi kabinet va ilovaning bot orqali kirishi
   (ular bog'langan chat bo'yicha ishlaydi — ADR-0040/0045).

## Ko'rib chiqilgan muqobillar

**Faqat SMS kod, parolsiz** (CEO 02.10 tanlovi). Rad etildi 03.10: ADR-0031
aynan shu variantni rad etgan — ochiq qolgan qurilmada begona o'z raqamini
zaxira qilib qo'shib, keyin o'z Telegram'i orqali parolsiz kirardi.

**Faqat parol, SMS'siz.** Rad etildi (CEO, 03.10): raqam to'g'ri yozilganini
va o'sha odamniki ekanini kod isbotlaydi; eshik SMS yoqilguncha yopiq turadi.

**«Bitta raqam — bitta o'quvchi»ni asosiy raqam yozuvchilarida ham
tekshirish** (bot ro'yxati, mock, admin yaratish). Rad etildi: zaxira raqam
hech kimning ro'yxatdan o'tishiga to'sqinlik qilmasin; narxi — boshqa
o'quvchining zaxira raqami jim o'ladi.

**Bot va Mini App zaxira raqamni tanisin.** Keyinga: 1089 o'quvchidan 1013 tasi
botga asosiy raqami bilan bog'langan; chat bitta ustun, ikki raqam uni
«tortishishi» mumkin — alohida qaror.

## Oqibatlari

Admin kiritgan zaxira raqam darhol kalit: o'quvchi `student.` da parol yoki
Telegram tugmasi bilan kiradi. Admin xato yozgan raqam egasi Telegram orqali
kira oladi — asosiy raqamdagi xavf bilan bir xil. Liddagi «Zaxira raqam»
o'quvchiga ko'chganda kalit bo'ladi. O'quvchi «Parolni unutdingizmi?»ga
zaxira raqamini yozsa kod kelmaydi — profil qatori shuni aytadi.
Poyga: ikki yozuv bir vaqtda o'tsa ikki o'quvchida bir zaxira raqam qolishi
mumkin; Telegram yo'li baribir yopiq holatga o'tadi, parol yo'li o'sha
hisobning parolini talab qiladi.
```

- [ ] **Step 3: Index row and CLAUDE.md bullet**

`docs/adr/README.md`, after the 0066 row:
```markdown
| [0070](0070-zaxira-raqam-ikkinchi-kirish-kaliti.md) | Zaxira raqam — o'quvchining ikkinchi kirish kaliti; asosiy raqam ustun, o'quvchi o'zi parol + SMS bilan qo'shadi | Qabul qilindi | 2026-10-03 |
```

`server/CLAUDE.md`, under «#### Phone-based login (all roles)», right after the ADR-0032 bullet («**A student signs in with the number on their card (ADR-0032).** …»):
```markdown
- **A student's backup number is a second sign-in key (ADR-0070).** `findAccountByIdentifier` / `findAccountsByIdentifier` try the account's own number first and, finding nobody, a live card's `Student.extraPhone` (`buildExtraPhoneLookup`: student role only, so never on `admin.`/`lehrer.`; a password that fails against the main-number account never reaches this stage). One number signs one student in: every write of `extraPhone` — admin create/update, lead conversion, archive restore, the student's own `POST /student-portal/extra-phone/*` — goes through `students/shared/extra-phone-rule.ts` (`assertExtraPhoneFree`); staff get a 400, conversion and restore drop the taken number instead. The student adds or changes it behind the current password AND an SMS code to the new number (ADR-0039's machinery, extracted to `students/shared/phone-code.ts`, own slot `extra_phone:code:*`, shared limits) and removes it behind the password; the door is closed while `STUDENT_PHONE_VERIFICATION_ENABLED` is off. SMS password reset, the bot scenes and the Mini App read the main number / the linked chat only.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0070-zaxira-raqam-ikkinchi-kirish-kaliti.md docs/adr/README.md server/CLAUDE.md
git commit -m "docs(adr): ADR-0070 — zaxira raqam ikkinchi kirish kaliti"
```

---

### Task 14: Whole-branch verification

**Files:** none new.

- [ ] **Step 1: Server — everything**

```bash
cd server && npm test 2>&1 | tail -15 && npm run typecheck && npx eslint src --quiet
```
Expected: all suites PASS, typecheck clean, eslint 0 errors. Fix anything red before moving on (a failure here is a bug in one of the tasks above, not a reason to skip).

- [ ] **Step 2: Client — everything**

```bash
cd client && npx tsc --noEmit && npm test 2>&1 | tail -8 && npm run lint 2>&1 | tail -3 && npx next build 2>&1 | tail -5
```
Expected: clean, PASS, 0 errors, build succeeds.

- [ ] **Step 3: Spec coverage check (read, do not edit code)**

Walk the spec's sections and confirm each has shipped: §1 two-stage lookup (Task 7) · §2 rule + table rows: update/create (3), conversion (4), restore (5), onboarding promote (6) · §3 admin input (10) · §4 profile row, three routes, guard lists, manifest, door switch (8, 9, 12) · §5 card rows + one label (11) · §6 history rows (5, 6, 8) · §7 ADR (13). Anything missing is a new task, not a note.

- [ ] **Step 4: Push the branch and stop**

```bash
git push -u origin worktree-zaxira-raqam-kirish
```
Do NOT open a PR, merge or deploy: the CEO decides the release (see the spec's «Chiqarish»: server first, then the site; after deploy, one real student with a backup number signs in on `student.` and is refused on `admin.`).
