import { Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { RedisService } from '../../redis/redis.service';
import { ACCESS_TOKEN_TTL_SEC } from '../../auth/token-lifetimes';

/*
 * One number per account ends every session it has (ADR-0030).
 *
 * `User.sessionVersion` starts at 0 and every token carries the value it was
 * minted with as `sv`. Changing the password — through any of the seven paths
 * that write it — or pressing "log out other devices" bumps the number, and
 * every token minted before that stops working: `AuthService.refresh` compares
 * against the database, `JwtAuthGuard` against the Redis mirror written below.
 *
 * A counter, not a "changed at" timestamp: `iat` has one-second resolution, so
 * the fresh token handed to the device that just changed its password would
 * look exactly as old as the change.
 */

/** What a refused session is told — by `refresh` and by `JwtAuthGuard`. */
export const SESSION_ENDED_MESSAGE =
  'Sessiya tugagan. Iltimos, qaytadan kiring.';

/** The Redis mirror `JwtAuthGuard` reads on every request. */
export function sessionVersionKey(userId: number): string {
  return `user:session-version:${userId}`;
}

/**
 * How long the mirror must outlive a bump. Every access token minted before
 * the bump expires within `ACCESS_TOKEN_TTL_SEC`; after that only `refresh`
 * has anything left to refuse, and it reads the database. The margin covers
 * clock skew between instances.
 */
export const SESSION_VERSION_CACHE_TTL_SEC = ACCESS_TOKEN_TTL_SEC + 5 * 60;

/**
 * The session version a verified token carries.
 *
 * A token minted before `sv` existed has none and counts as 0. Every account
 * starts at 0, so the deploy signs nobody out, and the account's first bump
 * retires those tokens with no gap. A value that is present but not a
 * non-negative integer is malformed: `null`, which every caller refuses.
 */
export function tokenSessionVersion(payload: { sv?: unknown }): number | null {
  const { sv } = payload;
  if (sv === undefined) return 0;
  return typeof sv === 'number' && Number.isInteger(sv) && sv >= 0 ? sv : null;
}

/** `data` fragment that retires every token the account holds. */
export function endSessionsWrite() {
  return {
    sessionVersion: { increment: 1 },
  } satisfies Prisma.UserUpdateInput;
}

/**
 * `data` fragment for EVERY write of `User.password` on an existing account:
 * the new hash (or `null`) and the bump travel in the same `update`, so no
 * path can change a password and leave the old sessions alive.
 * `password-write.single-source.spec.ts` fails on a raw `password` key
 * anywhere else. Creating an account needs neither — it has no sessions yet.
 */
export function passwordWrite(hash: string | null) {
  return {
    password: hash,
    ...endSessionsWrite(),
  } satisfies Prisma.UserUpdateInput;
}

const logger = new Logger('SessionVersionCache');

/**
 * Mirror a bump into the cache `JwtAuthGuard` reads. Call it AFTER the
 * database write commits, with the version that write returned.
 *
 * Never throws. The database is the authority and this cache only shortens an
 * hour, so an unreachable Redis is logged and swallowed rather than failing
 * the password change that matters. A missing mirror costs at most the rest of
 * the old access tokens' hour; `refresh` still refuses them.
 */
export async function recordSessionsEnded(
  redis: Pick<RedisService, 'set'>,
  userId: number,
  version: number,
): Promise<void> {
  try {
    await redis.set(
      sessionVersionKey(userId),
      String(version),
      'EX',
      SESSION_VERSION_CACHE_TTL_SEC,
    );
  } catch (err) {
    logger.warn(
      `Session-version cache not updated for user ${userId} (v${version}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
