import { randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/**
 * One-time login code for the native student app.
 * The Telegram bot issues a 6-digit code (delivered in chat); the app exchanges
 * it for JWT tokens via POST /auth/otp/exchange. Single-use, short-lived.
 */
const OTP_TTL_SEC = 5 * 60;
const COOLDOWN_SEC = 60; // min gap between code requests per student
const DAILY_LIMIT = 10;
const DAILY_TTL_SEC = 24 * 60 * 60;

const codeKey = (code: string) => `app_login_otp:code:${code}`;
const cooldownKey = (studentId: number) => `app_login_otp:cooldown:${studentId}`;
const dailyKey = (studentId: number) => `app_login_otp:daily:${studentId}`;

export type IssueOtpResult =
  | { ok: true; code: string; ttlSec: number; firstName: string }
  | { ok: false; reason: 'not_found' | 'no_account' | 'throttled'; retryAfterSec?: number };

async function checkThrottle(
  redis: RedisService,
  studentId: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSec: number }> {
  const cd = await redis.ttl(cooldownKey(studentId));
  if (cd > 0) return { allowed: false, retryAfterSec: cd };

  const raw = await redis.get(dailyKey(studentId));
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= DAILY_LIMIT) {
    const ttl = await redis.ttl(dailyKey(studentId));
    return { allowed: false, retryAfterSec: ttl > 0 ? ttl : DAILY_TTL_SEC };
  }
  return { allowed: true };
}

async function recordThrottleHit(redis: RedisService, studentId: number): Promise<void> {
  await redis.set(cooldownKey(studentId), '1', 'EX', COOLDOWN_SEC);
  const n = await redis.incr(dailyKey(studentId));
  if (n === 1) await redis.expire(dailyKey(studentId), DAILY_TTL_SEC);
}

/** Issue a login code for the student linked to this Telegram chat. */
export async function issueLoginOtp(
  prisma: PrismaService,
  redis: RedisService,
  chatId: string,
): Promise<IssueOtpResult> {
  const student = await prisma.student.findFirst({
    where: { telegramChatId: chatId, deletedAt: null },
    select: { id: true, firstName: true, userId: true },
  });

  if (!student) return { ok: false, reason: 'not_found' };
  if (!student.userId) return { ok: false, reason: 'no_account' };

  const throttle = await checkThrottle(redis, student.id);
  if (!throttle.allowed) {
    return { ok: false, reason: 'throttled', retryAfterSec: throttle.retryAfterSec };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await redis.set(codeKey(code), String(student.userId), 'EX', OTP_TTL_SEC);
  await recordThrottleHit(redis, student.id);

  return { ok: true, code, ttlSec: OTP_TTL_SEC, firstName: student.firstName };
}

/** Exchange a login code for the linked userId (single use). Returns null if invalid/expired. */
export async function consumeLoginOtp(redis: RedisService, code: string): Promise<number | null> {
  const key = codeKey(code.trim());
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  const parsed = parseInt(userId, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
