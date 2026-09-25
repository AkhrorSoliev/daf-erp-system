import { Logger } from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type { RedisService } from '../../redis/redis.service';

/**
 * Account states that may not act, whatever an already-issued token says.
 * A soft-deleted row (`deletedAt` set) is blocked whatever its status.
 *
 * `AuthService` issues no new token to such an account (sign-in admits only
 * ACTIVE and INACTIVE; refresh refuses these three). The tokens already out
 * there are what the rest of this file is about.
 */
export const BLOCKED_USER_STATUSES: readonly UserStatus[] = [
  UserStatus.SUSPENDED,
  UserStatus.TERMINATED,
  UserStatus.ARCHIVED,
];

export function isBlockedStatus(status: string): boolean {
  return (BLOCKED_USER_STATUSES as readonly string[]).includes(status);
}

/**
 * The `where` that finds an account only while it may still act: not
 * soft-deleted and not in a blocked status. The two doors that grant access —
 * the employee form's role ceiling and the Telegram registration link — read
 * their caller through it, so a blocked caller grants nothing there even
 * while Redis is down and the cache below lets their token through
 * (ADR-0028).
 */
export function whereUserMayAct() {
  return {
    deletedAt: null,
    status: { notIn: [...BLOCKED_USER_STATUSES] },
  } satisfies Prisma.UserWhereInput;
}

/** The negative-cache key `JwtAuthGuard` reads on every request. */
export function blockedUserKey(userId: number): string {
  return `user:blocked:${userId}`;
}

const logger = new Logger('BlockedUserCache');

/**
 * Mirror a block, or its lifting, into the cache `JwtAuthGuard` reads.
 *
 * An access token lives an hour and `JwtStrategy` never re-reads the account,
 * so this key is the only thing that stops a blocked account's token early.
 * Every path that blocks or unblocks an employee calls this AFTER its
 * database write: the employee page (`UsersService`: status, archive) and the
 * teacher page (`TeachersService`: status, archive). A path that forgets it
 * leaves the token live for the rest of its hour — that is how the employee
 * page went uncovered while only `TeachersService` wrote the key.
 *
 * Never throws. The database is the authority and this cache only shortens
 * an hour, so an unreachable Redis is logged and swallowed rather than
 * failing the write that matters. A key left stale is harmless: the guard
 * confirms every hit against the database and drops a key it contradicts.
 */
export async function recordUserBlocked(
  redis: Pick<RedisService, 'set' | 'del'>,
  userId: number,
  blocked: boolean,
): Promise<void> {
  const key = blockedUserKey(userId);
  try {
    if (blocked) await redis.set(key, '1');
    else await redis.del(key);
  } catch (err) {
    logger.warn(
      `Blocked-user cache not updated for user ${userId} (${
        blocked ? 'block' : 'unblock'
      }): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
