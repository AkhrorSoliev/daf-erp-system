import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, createHash, randomBytes } from 'crypto';
import { SmsMessageType, SmsMessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EskizService } from '../../eskiz/eskiz.service';
import {
  PortalPasswordResetService,
  ResettableTarget,
} from '../../common/password-reset';

// ── OTP policy (see docs/sms-password-reset-plan.md) ────────────────────────
const OTP_TTL_SEC = 5 * 60; // code lives 5 minutes
const OTP_MAX_ATTEMPTS = 3; // wrong tries before the code is burned
const RESEND_COOLDOWN_SEC = 60; // min gap between OTP sends to one phone
const DAILY_LIMIT = 3; // OTP sends per phone per 24h
const DAILY_TTL_SEC = 24 * 60 * 60;
const IP_LIMIT = 10; // request-code calls per IP per hour
const VERIFY_IP_LIMIT = 30; // verify calls per IP per hour (brute-force guard)
const IP_TTL_SEC = 60 * 60;
const GLOBAL_TTL_SEC = 60 * 60;
const RESET_TOKEN_TTL_SEC = 10 * 60; // verified → set-password window

// Redis keys. `phone` is the normalized 9-digit form.
const codeKey = (phone: string) => `otp_reset:code:${phone}`;
const cooldownKey = (phone: string) => `otp_reset:cooldown:${phone}`;
const dailyKey = (phone: string) => `otp_reset:daily:${phone}`;
const ipKey = (ip: string) => `otp_reset:ip:${ip}`;
const verifyIpKey = (ip: string) => `otp_reset:verify_ip:${ip}`;
const globalKey = (hourBucket: number) => `otp_reset:global:${hourBucket}`;
const tokenKey = (token: string) => `otp_reset:rtoken:${token}`;

// Anti-enumeration: the request endpoint always returns this, regardless of
// whether the phone exists, the account state, or any throttle.
const GENERIC_REQUEST_MESSAGE =
  "Agar bu raqam tizimda mavjud bo'lsa, tasdiqlash kodi yuborildi";
// Identical message for every verify failure (missing/expired/wrong/corrupt).
const INVALID_CODE_MESSAGE = "Kod noto'g'ri yoki muddati tugagan";
const SESSION_EXPIRED_MESSAGE =
  "Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring.";

interface StoredCode {
  h: string; // sha256(code)
  n: number; // attempts left
}

interface StoredToken extends ResettableTarget {
  phone: string; // binds the token to the issuing phone
}

@Injectable()
export class ForgotPasswordService {
  private readonly logger = new Logger(ForgotPasswordService.name);
  private readonly globalHourlyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eskiz: EskizService,
    private readonly reset: PortalPasswordResetService,
    config: ConfigService,
  ) {
    this.globalHourlyCap =
      Number(config.get<string>('OTP_SMS_GLOBAL_HOURLY_CAP', '300')) || 300;
  }

  /**
   * Step 1 — request a code. ALWAYS returns the same generic message so the
   * endpoint never reveals whether a phone is registered. The whole body is
   * wrapped so that even a Redis/Eskiz outage fails closed to the same 200
   * response (a thrown 500 would otherwise leak phone existence).
   */
  async requestCode(
    rawPhone: string,
    ip?: string,
    allowedRoleIds?: number[] | null,
  ): Promise<{ message: string }> {
    const phone = this.normalize(rawPhone);
    if (!phone) return { message: GENERIC_REQUEST_MESSAGE };

    try {
      // Per-IP abuse guard (covers request spam regardless of phone).
      if (ip && (await this.hit(ipKey(ip), IP_TTL_SEC)) > IP_LIMIT) {
        this.logger.warn(`OTP IP limit reached: ${ip}`);
        return { message: GENERIC_REQUEST_MESSAGE };
      }

      // Resend cooldown + daily cap (uniform whether or not the phone exists).
      if ((await this.redis.ttl(cooldownKey(phone))) > 0) {
        return { message: GENERIC_REQUEST_MESSAGE };
      }
      const dailyCount = Number(await this.redis.get(dailyKey(phone))) || 0;
      if (dailyCount >= DAILY_LIMIT) {
        return { message: GENERIC_REQUEST_MESSAGE };
      }
      await this.redis.set(cooldownKey(phone), '1', 'EX', RESEND_COOLDOWN_SEC);
      // Daily quota is consumed on ATTEMPT, not on delivery success — this
      // prevents an attacker from spamming failing sends to bypass the cap.
      await this.hit(dailyKey(phone), DAILY_TTL_SEC);

      // Resolve the account behind the phone, scoped to the portal's roles.
      // Nothing more happens for unknowns.
      const target = await this.reset.resolveByPhone(phone, allowedRoleIds);
      if (!target) return { message: GENERIC_REQUEST_MESSAGE };

      // Global hourly circuit-breaker (protects the Eskiz balance / real money).
      if (
        (await this.hit(globalKey(this.hourBucket()), GLOBAL_TTL_SEC)) >
        this.globalHourlyCap
      ) {
        this.logger.error(
          `OTP global hourly cap (${this.globalHourlyCap}) reached — SMS suppressed`,
        );
        return { message: GENERIC_REQUEST_MESSAGE };
      }

      const code = String(randomInt(1000, 10000)); // 1000–9999, no leading zero
      await this.redis.set(
        codeKey(phone),
        JSON.stringify({ h: this.hash(code), n: OTP_MAX_ATTEMPTS } as StoredCode),
        'EX',
        OTP_TTL_SEC,
      );

      await this.deliver(target, phone, code);
    } catch (error) {
      // Fail closed: any infrastructure error must look identical to a
      // non-existent phone. Debug-level only — avoid a log-volume timing channel.
      this.logger.debug(
        `requestCode error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { message: GENERIC_REQUEST_MESSAGE };
  }

  /**
   * Step 2 — verify the code. On success returns a single-use reset token
   * (TTL 10 min) the client exchanges in step 3.
   */
  async verifyCode(
    rawPhone: string,
    code: string,
    ip?: string,
  ): Promise<{ resetToken: string }> {
    const phone = this.normalize(rawPhone);
    if (!phone) throw new BadRequestException(INVALID_CODE_MESSAGE);

    // Brute-force guard on the verify endpoint itself (the 3-attempts-per-code
    // cap is the primary defence; this stops rapid hammering across codes).
    if (ip && (await this.hit(verifyIpKey(ip), IP_TTL_SEC)) > VERIFY_IP_LIMIT) {
      this.logger.warn(`OTP verify IP limit reached: ${ip}`);
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    const raw = await this.redis.get(codeKey(phone));
    if (!raw) throw new BadRequestException(INVALID_CODE_MESSAGE);

    let stored: StoredCode;
    try {
      stored = JSON.parse(raw) as StoredCode;
    } catch {
      await this.redis.del(codeKey(phone));
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (this.hash(code) !== stored.h) {
      const left = stored.n - 1;
      if (left <= 0) {
        await this.redis.del(codeKey(phone));
        throw new BadRequestException(
          "Kod noto'g'ri. Iltimos, yangi kod so'rang.",
        );
      }
      const ttl = await this.redis.ttl(codeKey(phone));
      await this.redis.set(
        codeKey(phone),
        JSON.stringify({ h: stored.h, n: left } as StoredCode),
        'EX',
        ttl > 0 ? ttl : OTP_TTL_SEC,
      );
      throw new BadRequestException(
        `Kod noto'g'ri. Qolgan urinishlar: ${left}`,
      );
    }

    // Correct — burn the code (single use) and mint a phone-bound reset token.
    await this.redis.del(codeKey(phone));
    const target = await this.reset.resolveByPhone(phone);
    if (!target) throw new BadRequestException(INVALID_CODE_MESSAGE);

    const token = randomBytes(32).toString('hex');
    await this.redis.set(
      tokenKey(token),
      JSON.stringify({ ...target, phone } as StoredToken),
      'EX',
      RESET_TOKEN_TTL_SEC,
    );
    return { resetToken: token };
  }

  /** Step 3 — set the new password using the single-use reset token. */
  async resetPassword(
    resetToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    // getdel is atomic: a concurrent request with the same token can never read
    // it after we consume it (single-use guarantee, no get→del race).
    const raw = resetToken ? await this.redis.getdel(tokenKey(resetToken)) : null;
    if (!raw) throw new BadRequestException(SESSION_EXPIRED_MESSAGE);

    let payload: StoredToken;
    try {
      payload = JSON.parse(raw) as StoredToken;
    } catch {
      throw new BadRequestException(SESSION_EXPIRED_MESSAGE);
    }

    // Re-resolve the account NOW — it may have been archived/suspended/deleted
    // between verify and reset. Confirm the token still maps to the same user.
    const target = await this.reset.resolveByPhone(payload.phone);
    if (!target || target.userId !== payload.userId) {
      throw new BadRequestException(SESSION_EXPIRED_MESSAGE);
    }

    await this.reset.applyNewPassword(target, newPassword, 'SMS orqali tiklandi');
    return { message: "Parol muvaffaqiyatli o'zgartirildi" };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Send the OTP SMS via Eskiz and record a masked SmsMessage audit row. */
  private async deliver(
    target: ResettableTarget,
    phone: string,
    code: string,
  ): Promise<void> {
    let status: SmsMessageStatus = SmsMessageStatus.SENT;
    let errorMessage: string | null = null;
    try {
      await this.eskiz.sendSms(phone, this.buildOtpMessage(code));
    } catch (error) {
      status = SmsMessageStatus.FAILED;
      errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `OTP SMS yuborilmadi (student ${target.studentId ?? '?'}): ${errorMessage}`,
      );
    }

    if (target.studentId) {
      // Never store the code itself — only a masked marker.
      await this.prisma.smsMessage
        .create({
          data: {
            studentId: target.studentId,
            content: 'Parol tiklash kodi yuborildi',
            type: SmsMessageType.AUTO,
            status,
            errorMessage,
            companyId: target.companyId ?? null,
          },
        })
        .catch((e) =>
          this.logger.warn(`SmsMessage audit yozilmadi: ${(e as Error).message}`),
        );
    }
  }

  /**
   * EXACT moderated Eskiz template (id 78093, status=service). Eskiz matches
   * every sent message against an approved template, so the runtime text MUST
   * byte-match the approved form — approved sample is
   * "DaF Sprachzentrum mobil ilovasining parolini tiklash uchun tasdiqlash kodi: 0000"
   * (the `%d` wildcard is the code; NO trailing punctuation, NO extra sentence).
   * An earlier draft appended "Kodni hech kimga bermang. Amal qilish muddati:
   * 5 daqiqa." — that suffix is NOT in the approved template and would get the
   * SMS rejected, so it was removed. Pure ASCII = 1 SMS. If the security-advice
   * suffix is ever wanted, resubmit the fuller text for moderation first.
   */
  private buildOtpMessage(code: string): string {
    return `DaF Sprachzentrum mobil ilovasining parolini tiklash uchun tasdiqlash kodi: ${code}`;
  }

  /** Normalize to the DB's 9-digit form; returns null if not a valid UZ number. */
  private normalize(phone: string): string | null {
    let digits = (phone ?? '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('998')) digits = digits.slice(3);
    return digits.length === 9 ? digits : null;
  }

  private hash(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private hourBucket(): number {
    return Math.floor(Date.now() / (GLOBAL_TTL_SEC * 1000));
  }

  /**
   * INCR a counter and (re)set its TTL on every hit. Always calling EXPIRE
   * guarantees the key can never be orphaned without a TTL, even if a previous
   * request died between INCR and EXPIRE.
   */
  private async hit(key: string, ttlSec: number): Promise<number> {
    const n = await this.redis.incr(key);
    await this.redis.expire(key, ttlSec);
    return n;
  }
}
