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
const numberDailyKey = (phone: string) => `phone_verify:number_daily:${phone}`;

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
      deps.logger.warn(`SmsMessage audit yozilmadi: ${(e as Error).message}`),
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
