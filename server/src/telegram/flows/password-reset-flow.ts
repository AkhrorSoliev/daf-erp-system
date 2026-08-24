import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EntityHistoryService } from '../../common/entity-history';
import { generatePassword } from '../../common/utils/password.util';

const COOLDOWN_SEC = 5 * 60;
const DAILY_LIMIT = 3;
const DAILY_TTL_SEC = 24 * 60 * 60;

const cooldownKey = (studentId: number) => `pwd_reset:cooldown:${studentId}`;
const dailyKey = (studentId: number) => `pwd_reset:daily:${studentId}`;

type ResettableStudent = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  userId: number | null;
  companyId: number | null;
};

export type ThrottleCheck =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'cooldown' | 'daily_limit';
      retryAfterSec: number;
    };

export class PortalAccountMissingError extends Error {
  constructor() {
    super('Student does not have a portal user account');
    this.name = 'PortalAccountMissingError';
  }
}

export class UserNotResettableError extends Error {
  constructor(public readonly status: UserStatus) {
    super(`User in status ${status} cannot reset password`);
    this.name = 'UserNotResettableError';
  }
}

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  userId: true,
  companyId: true,
} as const;

export async function findStudentByChatId(
  prisma: PrismaService,
  chatId: string,
): Promise<ResettableStudent | null> {
  return prisma.student.findFirst({
    where: { telegramChatId: chatId, deletedAt: null },
    select: studentSelect,
  });
}

export async function findStudentByPhone(
  prisma: PrismaService,
  phone: string,
): Promise<ResettableStudent | null> {
  return prisma.student.findFirst({
    where: { phone, deletedAt: null },
    select: studentSelect,
  });
}

export async function linkChatIdToStudent(
  prisma: PrismaService,
  studentId: number,
  chatId: string,
): Promise<void> {
  await prisma.student.update({
    where: { id: studentId },
    data: { telegramChatId: chatId },
  });
}

export async function checkThrottle(
  redis: RedisService,
  studentId: number,
): Promise<ThrottleCheck> {
  const cooldownTtl = await redis.ttl(cooldownKey(studentId));
  if (cooldownTtl > 0) {
    return { allowed: false, reason: 'cooldown', retryAfterSec: cooldownTtl };
  }

  const raw = await redis.get(dailyKey(studentId));
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= DAILY_LIMIT) {
    const ttl = await redis.ttl(dailyKey(studentId));
    return {
      allowed: false,
      reason: 'daily_limit',
      retryAfterSec: ttl > 0 ? ttl : DAILY_TTL_SEC,
    };
  }

  return { allowed: true };
}

async function recordThrottleHit(
  redis: RedisService,
  studentId: number,
): Promise<void> {
  await redis.set(cooldownKey(studentId), '1', 'EX', COOLDOWN_SEC);
  const newCount = await redis.incr(dailyKey(studentId));
  if (newCount === 1) {
    await redis.expire(dailyKey(studentId), DAILY_TTL_SEC);
  }
}

/**
 * Generate a new portal password for a student, hash it, update the User
 * record, write an audit entry, and bump throttle counters. Returns the
 * plain password so the caller can deliver it via Telegram.
 *
 * Throws:
 * - PortalAccountMissingError — Student has no linked User
 * - UserNotResettableError — User status is SUSPENDED/TERMINATED/ARCHIVED
 */
export async function resetPassword(
  prisma: PrismaService,
  entityHistoryService: EntityHistoryService,
  redis: RedisService,
  student: ResettableStudent,
): Promise<{ plainPassword: string }> {
  if (!student.userId) {
    throw new PortalAccountMissingError();
  }

  const user = await prisma.user.findUnique({
    where: { id: student.userId },
    select: { id: true, status: true },
  });

  if (!user) {
    throw new PortalAccountMissingError();
  }

  if (
    user.status !== UserStatus.ACTIVE &&
    user.status !== UserStatus.INACTIVE
  ) {
    throw new UserNotResettableError(user.status);
  }

  const plainPassword = generatePassword();
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  await entityHistoryService.recordUpdate({
    entityType: 'Student',
    entityId: student.id,
    oldValues: { parol: '***' },
    newValues: { parol: 'Telegram bot orqali tiklandi' },
    changedById: user.id,
    companyId: student.companyId ?? undefined,
  });

  await recordThrottleHit(redis, student.id);

  return { plainPassword };
}

/**
 * Pretty-print remaining time for a throttle response. Returns Uzbek text
 * like "5 daqiqa" or "23 soat 12 daqiqa".
 */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} soniya`;
  }
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} daqiqa`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes > 0 ? `${hours} soat ${minutes} daqiqa` : `${hours} soat`;
}
