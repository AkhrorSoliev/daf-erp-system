# Password Change Ends Other Sessions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any write of `User.password` (seven paths) and a new "log out other devices" action end every other session of the account on its next request, while the device that acted keeps a fresh session.

**Architecture:** `User.sessionVersion` (default 0) is stamped into both JWTs as `sv`. Every password write goes through `passwordWrite()`, which increments the version in the same `update`. After commit, `recordSessionsEnded()` mirrors the new value into Redis. `AuthService.refresh` refuses a token whose `sv` differs from the database, and `JwtAuthGuard` refuses an older access token through the Redis mirror (fail-open, confirmed against the database before a 401). `JwtStrategy` stops accepting refresh tokens as access tokens.

**Tech Stack:** NestJS 11, Prisma 7 (`prisma-client-js`, Postgres), ioredis via `RedisService`, `@nestjs/jwt` + passport-jwt, Jest (ts-jest, transpile-only) + `@nestjs/testing`, TypeScript compiler API (guard test), Next.js client with zustand + js-cookie, vitest.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-24-parol-ozgarsa-kirishlar-tugaydi-design.md` (CEO-approved 2026-09-24: option A — immediate; the acting device keeps its session; the button goes on the staff profile and the student portal).
- Commit messages, PR text and new code comments are English. The ADR is Uzbek, Latin script only. UI strings are Uzbek Latin.
- `prisma migrate dev` is broken here. Use `migrate diff` → strip drift → `db execute` (dev DB) → `migrate resolve --applied`.
- New constructor parameters are appended LAST.
- Redis key: `user:session-version:<userId>`; TTL = `ACCESS_TOKEN_TTL_SEC + 300`.
- Ended-session message (exact): `Sessiya tugagan. Iltimos, qaytadan kiring.`
- Journal labels (exact): `o'zgartirildi`, `yangi parol o'rnatildi`, `rollar olib tashlangani uchun o'chirildi`, plus the existing `SMS orqali tiklandi` / `Telegram bot orqali tiklandi`. "Log out other devices" writes `{ kirishlar: 'faol' } → { kirishlar: 'boshqa qurilmalardan chiqildi' }`.
- Baseline before any change: `server` `npm test` = 414 suites / 5371 tests green.
- Done means: `cd server && npm test && npm run typecheck`; `cd client && npm test && npm run typecheck`; `npx eslint` + `npx prettier --write` on every touched file.
- Never touch the uncommitted ADR-0026/0027/0028 worktrees.

---

## File Structure

**Create**
- `server/src/auth/token-lifetimes.ts` — access/refresh TTL constants in seconds, plus the "constants, not configuration" rationale moved out of `auth.service.ts`.
- `server/src/common/auth/session-version.ts` — the single source: message, Redis key and TTL, claim parser, `endSessionsWrite`, `passwordWrite`, `recordSessionsEnded`.
- `server/src/common/auth/session-version.spec.ts`
- `server/src/common/entity-history/diff.util.spec.ts`
- `server/prisma/migrations/20260924190000_user_session_version/migration.sql`
- `server/src/auth/strategies/jwt.strategy.spec.ts`
- `server/src/users/users-password-sessions.spec.ts`
- `server/src/teachers/teachers-password-sessions.spec.ts`
- `server/src/students/students-password-sessions.spec.ts`
- `server/src/common/auth/password-write.single-source.spec.ts`
- `docs/adr/0030-parol-ozgarsa-boshqa-kirishlar-toxtaydi.md`
- `client/src/lib/fresh-session.ts`, `client/src/lib/fresh-session.test.ts`
- `client/src/hooks/use-logout-others.ts`
- `client/src/components/profile/logout-others-dialog.tsx`
- `client/src/components/student-portal/student-logout-others-dialog.tsx`

**Modify**
- `server/prisma/schema.prisma` (model `User`)
- `server/src/common/entity-history/diff.util.ts` (`EXCLUDED_KEYS`)
- `server/src/auth/auth.service.ts`, `server/src/auth/auth.service.spec.ts`
- `server/src/auth/strategies/jwt.strategy.ts`
- `server/src/common/guards/jwt-auth.guard.ts`, `.spec.ts`
- `server/src/users/users.service.ts`, `users.service.spec.ts`, `users.controller.ts`, `users.controller.spec.ts`, `users.module.ts`
- `server/src/common/auth/operational-branch-scope.spec.ts` (positional `new UsersService(...)`)
- `server/src/teachers/teachers.service.ts`
- `server/src/students/student-portal-write.service.ts`, `students-write.service.ts`, `student-portal.controller.ts`, `student-portal.controller.spec.ts`, `students.module.ts`, `students.service.spec.ts`, `students-write.service.spec.ts`, `students-write.origin.spec.ts`
- `server/src/common/password-reset/portal-password-reset.service.ts`, `.spec.ts`
- `server/src/telegram/flows/password-reset-flow.ts`, `.spec.ts`
- `server/src/common/auth/branch-route-policy.ts` (`SELF` block)
- `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`
- `client/src/components/profile/change-password-drawer.tsx`, `profile-details.tsx`, `profile-client.tsx`
- `client/src/components/student-portal/student-password-dialog.tsx`, `student-settings-page.tsx`

---

### Task 1: Session-version primitives and the column

**Files:**
- Modify: `server/prisma/schema.prisma` (model `User`, after `password String?`)
- Create: `server/prisma/migrations/20260924190000_user_session_version/migration.sql`
- Create: `server/src/auth/token-lifetimes.ts`
- Create: `server/src/common/auth/session-version.ts`
- Test: `server/src/common/auth/session-version.spec.ts`
- Modify: `server/src/common/entity-history/diff.util.ts:3-13`
- Test: `server/src/common/entity-history/diff.util.spec.ts`

**Interfaces:**
- Produces: `ACCESS_TOKEN_TTL_SEC: number`, `REFRESH_TOKEN_TTL_SEC: number` (token-lifetimes); `SESSION_ENDED_MESSAGE: string`, `sessionVersionKey(userId: number): string`, `SESSION_VERSION_CACHE_TTL_SEC: number`, `tokenSessionVersion(payload: { sv?: unknown }): number | null`, `endSessionsWrite(): { sessionVersion: { increment: number } }`, `passwordWrite(hash: string | null): { password: string | null; sessionVersion: { increment: number } }`, `recordSessionsEnded(redis: Pick<RedisService, 'set'>, userId: number, version: number): Promise<void>` (session-version); the Prisma field `User.sessionVersion: number`.

- [ ] **Step 1: Write the failing tests**

`server/src/common/auth/session-version.spec.ts`:

```ts
import { Logger } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SEC } from '../../auth/token-lifetimes';
import {
  SESSION_VERSION_CACHE_TTL_SEC,
  endSessionsWrite,
  passwordWrite,
  recordSessionsEnded,
  sessionVersionKey,
  tokenSessionVersion,
} from './session-version';

describe('session version (ADR-0030)', () => {
  describe('tokenSessionVersion', () => {
    it('reads the version a token carries', () => {
      expect(tokenSessionVersion({ sv: 3 })).toBe(3);
      expect(tokenSessionVersion({ sv: 0 })).toBe(0);
    });

    it('counts a token minted before the claim existed as version 0', () => {
      // Every account starts at 0, so the deploy signs nobody out.
      expect(tokenSessionVersion({})).toBe(0);
    });

    it.each([['3'], [-1], [1.5], [null], [NaN], [{}]])(
      'refuses a malformed version (%p)',
      (sv) => {
        expect(tokenSessionVersion({ sv })).toBeNull();
      },
    );
  });

  describe('writes', () => {
    it('ends sessions with an increment, never an absolute value', () => {
      // An absolute write would let two concurrent bumps collapse into one.
      expect(endSessionsWrite()).toEqual({ sessionVersion: { increment: 1 } });
    });

    it('puts the password and the bump in the same data object', () => {
      expect(passwordWrite('$2b$10$hash')).toEqual({
        password: '$2b$10$hash',
        sessionVersion: { increment: 1 },
      });
    });

    it('ends sessions when the password is cleared too', () => {
      expect(passwordWrite(null)).toEqual({
        password: null,
        sessionVersion: { increment: 1 },
      });
    });
  });

  describe('recordSessionsEnded', () => {
    it('mirrors the new version for longer than an access token lives', async () => {
      const redis = { set: jest.fn().mockResolvedValue('OK') };

      await recordSessionsEnded(redis as never, 10505, 4);

      expect(sessionVersionKey(10505)).toBe('user:session-version:10505');
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:10505',
        '4',
        'EX',
        SESSION_VERSION_CACHE_TTL_SEC,
      );
      expect(SESSION_VERSION_CACHE_TTL_SEC).toBeGreaterThan(
        ACCESS_TOKEN_TTL_SEC,
      );
    });

    it('never fails the password change when Redis is down', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const redis = {
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      await expect(
        recordSessionsEnded(redis as never, 10505, 4),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('user 10505'));
      warn.mockRestore();
    });
  });
});
```

`server/src/common/entity-history/diff.util.spec.ts`:

```ts
import { computeChangedFields } from './diff.util';

describe('computeChangedFields', () => {
  it('never journals the session version — a security counter, not business data', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Ali', sessionVersion: 3 },
      ),
    ).toBeNull();
  });

  it('still journals an ordinary field beside it', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', sessionVersion: 2 },
        { firstName: 'Vali', sessionVersion: 3 },
      ),
    ).toEqual({
      oldValues: { firstName: 'Ali' },
      newValues: { firstName: 'Vali' },
    });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/auth/session-version.spec.ts src/common/entity-history/diff.util.spec.ts`
Expected: FAIL — `Cannot find module './session-version'` / `'../../auth/token-lifetimes'`; the diff test fails with a `sessionVersion` diff instead of `null`.

- [ ] **Step 3: Add the column and the migration**

In `server/prisma/schema.prisma`, model `User`, directly after `password       String?`:

```prisma
  // Bumped by every password write and by "log out other devices"; every
  // token carries it as `sv` and stops working once it falls behind (ADR-0030).
  sessionVersion Int        @default(0)
```

Then (the scratchpad path is this session's; any temp path outside the repo works):

```bash
cd server
npx prisma format
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system--claude-worktrees-determined-bell-09d513/8d907e18-b987-4493-86a6-a45be119ab6d/scratchpad/session-version-diff.sql
cat /private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system--claude-worktrees-determined-bell-09d513/8d907e18-b987-4493-86a6-a45be119ab6d/scratchpad/session-version-diff.sql
```

Check `git diff prisma/schema.prisma`: only the three new lines change. If `prisma format` realigned other lines, revert them. The diff output contains the `User` line plus pre-existing dev-DB drift (for example `Branch.workingDays`, `Transaction_reversedAt_idx`, a `TelegramGroup` FK). Write ONLY the `User` statement to `server/prisma/migrations/20260924190000_user_session_version/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;
```

Apply it to the dev DB, record it, regenerate the client:

```bash
npx prisma db execute --file prisma/migrations/20260924190000_user_session_version/migration.sql
npx prisma migrate resolve --applied 20260924190000_user_session_version
npx prisma generate
```

Expected: `Script executed successfully.`, `Migration 20260924190000_user_session_version marked as applied.`, `Generated Prisma Client`.

- [ ] **Step 4: Write `server/src/auth/token-lifetimes.ts`**

```ts
/**
 * Token lifetimes, in seconds. CONSTANTS, not configuration, and deliberately so.
 *
 * A short access token plus a refresh endpoint is the whole design: the
 * account's real state lives in Postgres and `refresh` re-checks it, so the
 * longest anyone can act on a revoked account is one hour. `JwtAuthGuard`'s
 * Redis caches (blocked users, session versions) are written against exactly
 * that window — they exist to shorten an hour, not a week.
 *
 * `JWT_EXPIRATION` is set to "7d" in production and NOTHING READS IT. Someone
 * configured week-long sessions and got hour-long ones, with no error and no
 * way to notice. Wiring it up would not fix that — it would grant the week.
 * `env.validation.ts` now says so at startup; the variable should be removed
 * from Railway rather than honoured.
 */
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 24 * 60 * 60;
```

- [ ] **Step 5: Write `server/src/common/auth/session-version.ts`**

```ts
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
  return typeof sv === 'number' && Number.isInteger(sv) && sv >= 0
    ? sv
    : null;
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
```

- [ ] **Step 6: Exclude the counter from the journal diff**

`server/src/common/entity-history/diff.util.ts`, in `EXCLUDED_KEYS` after `'password',`:

```ts
  // A security counter (ADR-0030), not business data: bumping it is journaled
  // as the password change or logout that caused it, never as a raw number.
  'sessionVersion',
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd server && npx jest src/common/auth/session-version.spec.ts src/common/entity-history`
Expected: PASS (all).

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260924190000_user_session_version server/src/auth/token-lifetimes.ts server/src/common/auth/session-version.ts server/src/common/auth/session-version.spec.ts server/src/common/entity-history/diff.util.ts server/src/common/entity-history/diff.util.spec.ts
git commit -m "Add a per-account session version and its single-source helpers

User.sessionVersion (default 0) plus passwordWrite/endSessionsWrite to bump
it in the same update as a password write, recordSessionsEnded to mirror it
into Redis, and tokenSessionVersion to read the claim (missing = 0).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tokens carry `sv`; `refresh` checks it; refresh tokens stop working as access tokens

**Files:**
- Modify: `server/src/auth/auth.service.ts` (imports and constants 1–32, `buildAccountLookup` include 89–101, `generateTokens`/`login` 201–260, `buildStudentSession` 271–320, `refresh` 322–391)
- Modify: `server/src/auth/auth.service.spec.ts`
- Modify: `server/src/auth/strategies/jwt.strategy.ts`
- Create: `server/src/auth/strategies/jwt.strategy.spec.ts`

**Interfaces:**
- Consumes (Task 1): `tokenSessionVersion`, `SESSION_ENDED_MESSAGE`, `ACCESS_TOKEN_TTL_SEC`, `REFRESH_TOKEN_TTL_SEC`.
- Produces: `AuthService.issueSession(userId: number): Promise<{ accessToken: string; refreshToken: string; user: ReturnType<formatUser> }>` (used by Task 8); `request.user.sessionVersion: number` from `JwtStrategy.validate` (used by Task 3); the JWT payload `sv: number` on both tokens.

- [ ] **Step 1: Write the failing tests**

`server/src/auth/auth.service.spec.ts`:
- Change the first import to `import { ForbiddenException, UnauthorizedException } from '@nestjs/common';`.
- In `beforeEach` change `jwt` to `jwt = { sign: jest.fn().mockReturnValue('tok'), verify: jest.fn() };`.
- Add this block before the final `});`:

```ts
  describe('session version (ADR-0030)', () => {
    const liveTeacher = {
      ...teacher,
      status: 'ACTIVE',
      deletedAt: null,
      sessionVersion: 3,
    };

    it('stamps the account session version into both tokens', async () => {
      await service.login(liveTeacher, undefined, undefined);

      expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 2, sv: 3 });
      expect(jwt.sign.mock.calls[1][0]).toEqual({
        sub: 2,
        type: 'refresh',
        sv: 3,
      });
    });

    it('refreshes a token that carries the current version', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: 3 });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      const res = await service.refresh('refresh-token');

      expect(res.accessToken).toBe('tok');
      expect(jwt.sign.mock.calls[1][0]).toEqual({
        sub: 2,
        type: 'refresh',
        sv: 3,
      });
    });

    it('refuses a token minted before the last password change', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: 2 });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        'Sessiya tugagan. Iltimos, qaytadan kiring.',
      );
      expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('keeps a pre-deploy token (no sv) alive only until the first bump', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh' });

      prisma.user.findFirst.mockResolvedValue({
        ...liveTeacher,
        sessionVersion: 0,
      });
      await expect(service.refresh('old-token')).resolves.toHaveProperty(
        'accessToken',
      );

      prisma.user.findFirst.mockResolvedValue({
        ...liveTeacher,
        sessionVersion: 1,
      });
      await expect(service.refresh('old-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('refuses a malformed session version', async () => {
      jwt.verify.mockReturnValue({ sub: 2, type: 'refresh', sv: '3' });
      prisma.user.findFirst.mockResolvedValue(liveTeacher);

      await expect(service.refresh('refresh-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    describe('issueSession', () => {
      it('issues a pair stamped with the version as it is NOW', async () => {
        prisma.user.findFirst.mockResolvedValue({
          ...liveTeacher,
          sessionVersion: 7,
        });

        const res = await service.issueSession(2);

        expect(res.accessToken).toBe('tok');
        expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 2, sv: 7 });
        expect(prisma.user.findFirst.mock.calls[0][0].where).toEqual({
          id: 2,
          deletedAt: null,
        });
      });

      it('refuses a blocked account', async () => {
        prisma.user.findFirst.mockResolvedValue({
          ...liveTeacher,
          status: 'SUSPENDED',
        });

        await expect(service.issueSession(2)).rejects.toThrow(
          'Hisobingiz bloklangan',
        );
      });
    });
  });
```

Create `server/src/auth/strategies/jwt.strategy.spec.ts`:

```ts
import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  const strategy = new JwtStrategy({
    get: () => 'test-secret-at-least-16-chars',
  } as never);

  it('puts the session version on request.user', () => {
    expect(
      strategy.validate({ sub: 7, roles: ['Teacher'], companyId: 1001, sv: 4 }),
    ).toEqual({
      id: 7,
      roles: ['Teacher'],
      companyId: 1001,
      sessionVersion: 4,
    });
  });

  it('counts a pre-deploy token without sv as version 0', () => {
    expect(
      strategy.validate({ sub: 7, roles: ['Teacher'], companyId: 1001 })
        .sessionVersion,
    ).toBe(0);
  });

  it('keeps the studentId of a student token', () => {
    expect(
      strategy.validate({
        sub: 8,
        roles: ['Student'],
        companyId: 1001,
        studentId: 10001,
        sv: 0,
      }),
    ).toMatchObject({ studentId: 10001 });
  });

  it('refuses a refresh token presented as an access token', () => {
    // It shares the secret, but only POST /auth/refresh may accept it
    // (ADR-0030).
    expect(() =>
      strategy.validate({ sub: 7, type: 'refresh', sv: 0 } as never),
    ).toThrow(UnauthorizedException);
  });

  it('refuses a malformed session version', () => {
    expect(() =>
      strategy.validate({
        sub: 7,
        roles: [],
        companyId: 1001,
        sv: 'x',
      } as never),
    ).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/auth/auth.service.spec.ts src/auth/strategies/jwt.strategy.spec.ts`
Expected: FAIL — `sv` missing from the sign payloads, `service.issueSession is not a function`, and the strategy returns without `sessionVersion` / does not throw.

- [ ] **Step 3: Rework `server/src/auth/auth.service.ts`**

Replace lines 1–32 (the imports, the lifetime comment and both constants) with:

```ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { resolveAllowedRoleIds } from './portal-roles.config';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { consumeLoginRequest } from '../telegram/flows/app-login-otp-flow';
import { normalizeSharedPhone } from '../common/utils/phone.util';
import { ACCESS_TOKEN_TTL_SEC, REFRESH_TOKEN_TTL_SEC } from './token-lifetimes';
import {
  SESSION_ENDED_MESSAGE,
  tokenSessionVersion,
} from '../common/auth/session-version';

/**
 * Everything a session response needs from the account row. One shape for
 * sign-in, the app's OTP poll, `refresh` and `issueSession`, so they cannot
 * drift apart.
 */
const SESSION_USER_INCLUDE = {
  roles: { include: { role: true } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  company: {
    select: {
      id: true,
      name: true,
      subdomain: true,
      logo: true,
      phone: true,
    },
  },
} satisfies Prisma.UserInclude;

type SessionUser = Prisma.UserGetPayload<{
  include: typeof SESSION_USER_INCLUDE;
}>;
```

In `buildAccountLookup`, replace the whole `include: { roles: …, branches: …, company: { … } }` object (lines 89–101) with `include: SESSION_USER_INCLUDE,`.

Replace `generateTokens` and `login` (lines 201–260) with:

```ts
  private generateTokens(
    userId: number,
    roles: string[],
    companyId: number,
    sessionVersion: number,
    studentId?: number,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET')!;
    // `sv` ties both tokens to the account's session version: a password
    // change or "log out other devices" bumps it, and every token minted
    // before that stops working (ADR-0030).
    const payload: Record<string, any> = {
      sub: userId,
      roles,
      companyId,
      sv: sessionVersion,
    };
    if (studentId) payload.studentId = studentId;

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: ACCESS_TOKEN_TTL_SEC,
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, type: 'refresh', sv: sessionVersion },
      { secret, expiresIn: REFRESH_TOKEN_TTL_SEC },
    );

    return { accessToken, refreshToken };
  }

  /**
   * The tail every session response shares: the student id (role 6), both
   * tokens stamped with the account's CURRENT session version, and the user
   * payload.
   */
  private async sessionFor(user: SessionUser) {
    const roles = user.roles.map((ur) => ur.role.name);
    const roleIds = user.roles.map((ur) => ur.role.id);

    let studentId: number | undefined;
    if (roleIds.includes(6)) {
      const student = await this.prisma.student.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { id: true },
      });
      studentId = student?.id;
    }

    const tokens = this.generateTokens(
      user.id,
      roles,
      user.companyId,
      user.sessionVersion,
      studentId,
    );

    return {
      ...tokens,
      user: this.formatUser(user, studentId),
    };
  }

  /**
   * The account behind a session that is being renewed or re-issued: live,
   * and not in a blocked status. Sign-in has its own, stricter lookup.
   */
  private async loadSessionUser(userId: number): Promise<SessionUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: SESSION_USER_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    if (
      user.status === UserStatus.SUSPENDED ||
      user.status === UserStatus.TERMINATED ||
      user.status === UserStatus.ARCHIVED
    ) {
      throw new UnauthorizedException('Hisobingiz bloklangan');
    }

    return user;
  }

  async login(user: any, origin?: string, portal?: string) {
    const allowedRoleIds = resolveAllowedRoleIds(origin, portal);
    if (allowedRoleIds !== null) {
      const userRoleIds: number[] = user.roles.map((ur: any) => ur.role.id);
      const hasAccess = userRoleIds.some((id) => allowedRoleIds.includes(id));
      if (!hasAccess) {
        throw new ForbiddenException(
          'Sizning rolingiz bu portalga kirish huquqiga ega emas',
        );
      }
    }

    return this.sessionFor(user);
  }
```

Replace `buildStudentSession` (lines 271–320) with:

```ts
  /** Load a student user, enforce the role-6 gate, and issue a session. */
  private async buildStudentSession(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: SESSION_USER_INCLUDE,
    });

    if (!user) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }
    if (user.status !== 'ACTIVE' && user.status !== 'INACTIVE') {
      throw new UnauthorizedException('Hisobingiz bloklangan');
    }

    const roleIds: number[] = user.roles.map((ur) => ur.role.id);
    if (!roleIds.includes(6)) {
      throw new ForbiddenException("Bu faqat o'quvchilar uchun");
    }

    return this.sessionFor(user);
  }
```

Replace `refresh` (lines 322–391) with:

```ts
  async refresh(refreshToken: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET')!;
      const payload = this.jwtService.verify(refreshToken, { secret });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException("Noto'g'ri token turi");
      }

      const user = await this.loadSessionUser(payload.sub);

      // The database is the authority; `JwtAuthGuard`'s Redis check only gets
      // there sooner. A token minted before the last password change or
      // "log out other devices" carries an older version and is refused.
      if (tokenSessionVersion(payload) !== user.sessionVersion) {
        throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
      }

      return await this.sessionFor(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(
        'Refresh token yaroqsiz yoki muddati tugagan',
      );
    }
  }

  /**
   * A fresh token pair for an account that is already authenticated — the
   * device that just changed its own password or pressed "log out other
   * devices". Both actions bumped the session version, retiring this device's
   * tokens along with everyone else's; without a new pair it would be signed
   * out on its very next request.
   */
  async issueSession(userId: number) {
    return this.sessionFor(await this.loadSessionUser(userId));
  }
```

- [ ] **Step 4: Rework `server/src/auth/strategies/jwt.strategy.ts`**

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { tokenSessionVersion } from '../../common/auth/session-version';

interface JwtPayload {
  sub: number;
  roles: string[];
  companyId: number;
  studentId?: number;
  /** The session version the token was minted with (ADR-0030). */
  sv?: unknown;
  /** Set on refresh tokens only. */
  type?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload) {
    // A refresh token shares the secret but is valid at POST /auth/refresh
    // and nowhere else, where its session version is checked (ADR-0030).
    if (payload.type === 'refresh') {
      throw new UnauthorizedException();
    }

    const sessionVersion = tokenSessionVersion(payload);
    if (sessionVersion === null) {
      throw new UnauthorizedException();
    }

    return {
      id: payload.sub,
      roles: payload.roles,
      companyId: payload.companyId,
      sessionVersion,
      ...(payload.studentId && { studentId: payload.studentId }),
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd server && npx jest src/auth`
Expected: PASS — including the untouched login/validateUser/findAccount*/pollLoginRequest tests and the Telegram OAuth suites.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth
git commit -m "Stamp the session version into tokens and refuse stale refreshes

Both tokens carry sv; refresh compares it with the database and refuses an
older one. JwtStrategy no longer accepts a refresh token as an access token.
issueSession re-issues a pair for an already authenticated account. The four
session paths now share one include and one tail (sessionFor).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `JwtAuthGuard` stops a stale access token on its next request

**Files:**
- Modify: `server/src/common/guards/jwt-auth.guard.ts`
- Modify: `server/src/common/guards/jwt-auth.guard.spec.ts`

**Interfaces:**
- Consumes (Task 1): `sessionVersionKey`, `SESSION_ENDED_MESSAGE`. (Task 2): `request.user.sessionVersion`.

- [ ] **Step 1: Write the failing tests**

In `jwt-auth.guard.spec.ts`:
- Change the first import to `import { ForbiddenException, UnauthorizedException } from '@nestjs/common';`.
- In the existing test `does not lock out a user the database says is ACTIVE, and clears the stale key`, replace `redis.get.mockResolvedValue('1');` with:

```ts
      // Only the blocked key is stale here; there is no session-version bump.
      redis.get.mockImplementation(async (key: string) =>
        key === 'user:blocked:10505' ? '1' : null,
      );
```

- Add this block before the final `it('is constructible through dependency injection', …)`:

```ts
  describe('session version (ADR-0030)', () => {
    const sessionKey = 'user:session-version:10505';

    function cache(values: Record<string, string>) {
      redis.get.mockImplementation(async (key: string) => values[key] ?? null);
    }

    it('lets a token at the current version through without a database query', async () => {
      cache({ [sessionKey]: '3' });

      await expect(
        guard.canActivate(
          mockContext(false, { ...jwtStrategyUser, sessionVersion: 3 }),
        ),
      ).resolves.toBe(true);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('stops a token minted before the last password change with a 401', async () => {
      cache({ [sessionKey]: '3' });
      prisma.user.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: null,
        sessionVersion: 3,
      });
      const stale = { ...jwtStrategyUser, sessionVersion: 2 };

      // 401, not 403: the client then tries `refresh`, which the database
      // refuses, and lands on the sign-in page instead of a "no access" toast.
      await expect(
        guard.canActivate(mockContext(false, stale)),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        guard.canActivate(mockContext(false, stale)),
      ).rejects.toThrow('Sessiya tugagan. Iltimos, qaytadan kiring.');
    });

    it('treats a token without a version as version 0', async () => {
      cache({ [sessionKey]: '1' });
      prisma.user.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: null,
        sessionVersion: 1,
      });

      await expect(
        guard.canActivate(mockContext(false, jwtStrategyUser)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('signs nobody out when the database contradicts the cache, and drops the key', async () => {
      cache({ [sessionKey]: '3' });
      prisma.user.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        deletedAt: null,
        sessionVersion: 2,
      });

      await expect(
        guard.canActivate(
          mockContext(false, { ...jwtStrategyUser, sessionVersion: 2 }),
        ),
      ).resolves.toBe(true);
      expect(redis.del).toHaveBeenCalledWith(sessionKey);
    });
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd server && npx jest src/common/guards/jwt-auth.guard.spec.ts`
Expected: FAIL — the three "stops/treats" expectations resolve `true` instead of throwing; `del` is not called with the session key.

- [ ] **Step 3: Implement the check**

`jwt-auth.guard.ts`:
- Import: `import { Injectable, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';` and `import { SESSION_ENDED_MESSAGE, sessionVersionKey } from '../auth/session-version';`.
- In `canActivate`, replace `await this.assertNotBlocked(userId);` with:

```ts
      await this.assertNotBlocked(userId);
      await this.assertSessionCurrent(userId, request.user.sessionVersion);
```

- Add after `assertNotBlocked`:

```ts
  /**
   * A password change or "log out other devices" bumps `User.sessionVersion`
   * and mirrors the new value here (`common/auth/session-version.ts`).
   * `AuthService.refresh` refuses the stale tokens against the database; this
   * stops a stale ACCESS token on its next request instead of at the end of
   * its hour (ADR-0030).
   *
   * Same contract as the blocked check above: a Redis failure lets the request
   * through — `refresh` still holds the line within the hour — and a cache hit
   * is confirmed against the database before anyone is turned away, so a key
   * the database contradicts can never sign a legitimate session out.
   */
  private async assertSessionCurrent(
    userId: number,
    tokenVersion: number | undefined,
  ): Promise<void> {
    let cached: string | null = null;
    try {
      cached = await this.redis.get(sessionVersionKey(userId));
    } catch (err) {
      this.logger.warn(
        `Session-version cache unavailable for user ${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }
    if (cached === null) return;

    const current = Number(cached);
    const version = tokenVersion ?? 0;
    if (!Number.isInteger(current) || version >= current) return;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    if (user && user.sessionVersion === version) {
      this.logger.warn(
        `Stale session-version key for user ${userId} (cache ${current}, database ${user.sessionVersion}) — dropping it`,
      );
      await this.redis.del(sessionVersionKey(userId)).catch(() => undefined);
      return;
    }

    throw new UnauthorizedException(SESSION_ENDED_MESSAGE);
  }
```

- [ ] **Step 4: Run to verify all guard tests pass**

Run: `cd server && npx jest src/common/guards`
Expected: PASS (the pre-existing blocked-user tests included).

- [ ] **Step 5: Commit**

```bash
git add server/src/common/guards/jwt-auth.guard.ts server/src/common/guards/jwt-auth.guard.spec.ts
git commit -m "Stop a stale access token on its next request

JwtAuthGuard compares the token's session version with the Redis mirror,
confirms a mismatch against the database, and answers 401 so the client
falls through to refresh and the sign-in page. Redis failures fail open.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Staff password paths (employee page, own password, teacher page)

**Files:**
- Modify: `server/src/users/users.service.ts` (imports, constructor at 109–114, `changePassword` 459–481, `updateUser` 705–741)
- Modify: `server/src/users/users.service.spec.ts` (7 `createTestingModule` blocks)
- Modify: `server/src/common/auth/operational-branch-scope.spec.ts:164`
- Modify: `server/src/teachers/teachers.service.ts` (`update` 354–371)
- Test: `server/src/users/users-password-sessions.spec.ts`
- Test: `server/src/teachers/teachers-password-sessions.spec.ts`

**Interfaces:**
- Consumes (Task 1): `passwordWrite`, `recordSessionsEnded`.
- `UsersService` constructor becomes `(prisma, uploadService, entityHistoryService, events, redis: RedisService)`.

- [ ] **Step 1: Write the failing tests**

`server/src/users/users-password-sessions.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';

/**
 * A password write on an employee account ends that account's other sessions
 * (ADR-0030): the hash and the session-version bump land in ONE update, the
 * new version is mirrored for JwtAuthGuard, and the write is journaled.
 */
describe('UsersService — a password write ends the other sessions', () => {
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const adminTarget = (overrides: Record<string, unknown> = {}) => ({
    id: 24,
    companyId: 1001,
    mainBranch: null,
    status: 'ACTIVE',
    isActive: true,
    password: '$2b$10$stored.hash',
    login: '901234567',
    roles: [{ role: { id: 3, name: 'Administrator' } }],
    branches: [{ branch: { id: 500, name: 'Main' } }],
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
    ...overrides,
  });

  let service: UsersService;
  let prisma: any;
  let redis: { set: jest.Mock };
  let history: { recordUpdate: jest.Mock };
  let target: any;

  beforeEach(async () => {
    target = adminTarget();
    prisma = {
      user: {
        // Caller-scope lookups select `roles` without `status`; the target
        // lookup goes through `userSelect`, which carries `status`.
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(
            select?.roles && !select?.status ? CEO_CALLER : target,
          ),
        ),
        // `changePassword` loads the full row (no select); the role-grant
        // check asks for the caller's roles (with a select).
        findUnique: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(select ? CEO_CALLER : target),
        ),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...target, ...data, sessionVersion: 5 }),
        ),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      role: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
      branch: { count: jest.fn().mockResolvedValue(1) },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };
    redis = { set: jest.fn().mockResolvedValue('OK') };
    history = { recordUpdate: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: EntityHistoryService, useValue: history },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  it('changePassword: bumps the version in the same update as the hash, mirrors it and journals it', async () => {
    target = adminTarget({ password: await bcrypt.hash('eskiParol1', 4) });

    await service.changePassword(24, {
      oldPassword: 'eskiParol1',
      newPassword: 'yangiParol1',
    });

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(await bcrypt.compare('yangiParol1', call.data.password)).toBe(true);
    expect(call.select).toEqual({ sessionVersion: true });
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 24,
        newValues: { parol: "o'zgartirildi" },
        changedById: 24,
        companyId: 1001,
      }),
    );
  });

  it('changePassword: a wrong current password writes nothing', async () => {
    target = adminTarget({ password: await bcrypt.hash('eskiParol1', 4) });

    await expect(
      service.changePassword(24, {
        oldPassword: 'xato',
        newPassword: 'yangiParol1',
      }),
    ).rejects.toThrow("Joriy parol noto'g'ri");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('updateUser: a password set by a manager ends the sessions and names who set it', async () => {
    const res = await service.updateUser(
      24,
      { password: 'yangiParol1' } as any,
      99,
      1001,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(typeof call.data.password).toBe('string');
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 24,
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: 99,
        companyId: 1001,
      }),
    );
    expect(res).not.toHaveProperty('sessionVersion');
  });

  it('updateUser: taking every role away clears the password and ends the sessions', async () => {
    await service.updateUser(
      24,
      { roleIds: [], position: 'Farrosh' } as any,
      99,
      1001,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data).toMatchObject({
      password: null,
      login: null,
      sessionVersion: { increment: 1 },
    });
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:24',
      '5',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: { parol: "rollar olib tashlangani uchun o'chirildi" },
      }),
    );
  });

  it('updateUser: an ordinary edit leaves the sessions alone', async () => {
    await service.updateUser(
      24,
      { position: 'Bosh administrator' } as any,
      99,
      1001,
    );

    expect(
      prisma.user.update.mock.calls[0][0].data.sessionVersion,
    ).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({ parol: expect.anything() }),
      }),
    );
  });
});
```

`server/src/teachers/teachers-password-sessions.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';

/** The teacher page's password field ends the teacher's other sessions (ADR-0030). */
describe('TeachersService.update — a new password ends the sessions', () => {
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const teacherRow = {
    id: 30,
    companyId: 1001,
    photo: null,
    login: '901112233',
    mainBranch: 500,
    roles: [{ role: { id: 4, name: 'Teacher' } }],
    branches: [{ branch: { id: 500, name: 'Main' } }],
    groupTeachers: [],
  };

  let service: TeachersService;
  let prisma: any;
  let redis: { set: jest.Mock; del: jest.Mock };
  let history: { recordUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(({ select }: any) => {
          if (select?.roles) return Promise.resolve(CEO_CALLER); // the caller
          if (select?.id) {
            // the target, as `assertCallerMayTouchUser` loads it
            return Promise.resolve({
              id: 30,
              mainBranch: 500,
              branches: [{ branchId: 500 }],
            });
          }
          return Promise.resolve(teacherRow); // `update`'s own lookup
        }),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...teacherRow, ...data, sessionVersion: 2 }),
        ),
      },
    };
    redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    history = { recordUpdate: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: { changeStatus: jest.fn() } },
        { provide: EntityHistoryService, useValue: history },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  it('bumps the version with the hash, mirrors it and journals who set it', async () => {
    const res = await service.update(
      30,
      { password: 'yangiParol1' } as any,
      1001,
      99,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(typeof call.data.password).toBe('string');
    expect(call.select.sessionVersion).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:30',
      '2',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 30,
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: 99,
        companyId: 1001,
      }),
    );
    expect(res).not.toHaveProperty('sessionVersion');
  });

  it('leaves the sessions alone when no password is sent', async () => {
    await service.update(30, { firstName: 'Olim' } as any, 1001, 99);

    expect(
      prisma.user.update.mock.calls[0][0].data.sessionVersion,
    ).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/users/users-password-sessions.spec.ts src/teachers/teachers-password-sessions.spec.ts`
Expected: FAIL — no `sessionVersion` in the update data, no `redis.set`, no password journal entry.

- [ ] **Step 3: Implement in `UsersService`**

- Imports: add `import { RedisService } from '../redis/redis.service';` and `import { passwordWrite, recordSessionsEnded } from '../common/auth/session-version';`.
- Constructor: append `private redis: RedisService,` after `private events: EventEmitter2,`.
- Add this private method directly before `changePassword`:

```ts
  /** Journal a password write on the employee record: who did it, and how. */
  private recordPasswordEvent(
    userId: number,
    label: string,
    changedById: number,
    companyId: number,
  ) {
    return this.entityHistoryService.recordUpdate({
      entityType: 'User',
      entityId: userId,
      oldValues: { parol: '***' },
      newValues: { parol: label },
      changedById,
      companyId,
    });
  }
```

- In `changePassword`, replace

```ts
    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed },
    });
```

with

```ts
    const hashed = await bcrypt.hash(dto.newPassword, 10);
    // Ends every session of the account, this one included; the controller
    // hands the caller a fresh pair (ADR-0030).
    const { sessionVersion } = await this.prisma.user.update({
      where: { id },
      data: passwordWrite(hashed),
      select: { sessionVersion: true },
    });
    await recordSessionsEnded(this.redis, id, sessionVersion);
    await this.recordPasswordEvent(id, "o'zgartirildi", id, user.companyId);
```

- In `updateUser`, replace

```ts
    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }
```

with

```ts
    if (dto.password) {
      Object.assign(
        updateData,
        passwordWrite(await bcrypt.hash(dto.password, 10)),
      );
    }
```

  and inside the "Stripping an employee's last role" block replace `updateData.password = null;` with `Object.assign(updateData, passwordWrite(null));` (keep `updateData.login = null;` and the comment).
- Change the transaction's result and its `update` select:

```ts
    const { sessionVersion, ...updated } = await this.prisma.$transaction(
      async (tx) => {
        // (the roles/branches blocks stay exactly as they are)
        return tx.user.update({
          where: { id },
          data: updateData,
          // `sessionVersion` rides along only so a password write can be
          // mirrored below; it is split off before anything is returned.
          select: { ...userSelect, sessionVersion: true },
        });
      },
    );
```

- Directly after the existing `await this.entityHistoryService.recordUpdate({ entityType: 'User', … newValues: updated, … });` add:

```ts
    if ('password' in updateData) {
      await recordSessionsEnded(this.redis, id, sessionVersion);
      // Journal only a real change: stripping the roles of an account that
      // never had a password leaves nothing to report.
      if (updateData.password !== null || user.password) {
        await this.recordPasswordEvent(
          id,
          updateData.password === null
            ? "rollar olib tashlangani uchun o'chirildi"
            : "yangi parol o'rnatildi",
          changedById,
          user.companyId,
        );
      }
    }
```

- [ ] **Step 4: Implement in `TeachersService.update`**

- Import: `import { passwordWrite, recordSessionsEnded } from '../common/auth/session-version';`.
- Replace the `const updated = await this.prisma.user.update({ … select: teacherSelect });` statement and the `return formatTeacher(updated);` after it with:

```ts
    const { sessionVersion, ...updated } = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.gender !== undefined && { gender: dto.gender }),
        ...(dto.photo !== undefined && { photo: dto.photo }),
        ...(dto.login !== undefined && { login: dto.login }),
        // A new password ends every session of the teacher (ADR-0030).
        ...(hashedPassword && passwordWrite(hashedPassword)),
      },
      // `sessionVersion` is split off before the response is built.
      select: { ...teacherSelect, sessionVersion: true },
    });

    if (hashedPassword) {
      await recordSessionsEnded(this.redis, id, sessionVersion);
      await this.entityHistoryService.recordUpdate({
        entityType: 'User',
        entityId: id,
        oldValues: { parol: '***' },
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: callerId,
        companyId: user.companyId,
      });
    }

    return formatTeacher(updated);
```

- [ ] **Step 5: Give the existing `UsersService` test setups their new dependency**

- `server/src/users/users.service.spec.ts`: add `import { RedisService } from '../redis/redis.service';`, and in each of the 7 `providers: [ UsersService, … ]` arrays add
  `{ provide: RedisService, useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() } },`
- `server/src/common/auth/operational-branch-scope.spec.ts:164`: `new UsersService(prisma, {} as any, {} as any, {} as any, {} as any)`.

(`users-branch.spec.ts` and `users-self-registration.spec.ts` already provide `RedisService`.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && npx jest src/users src/teachers src/common/auth/operational-branch-scope.spec.ts`
Expected: PASS — the new suites and every existing users/teachers suite (the "rolsiz" suite's `data.password === null` / `data.login === null` expectations still hold).

- [ ] **Step 7: Commit**

```bash
git add server/src/users server/src/teachers server/src/common/auth/operational-branch-scope.spec.ts
git commit -m "End sessions on staff password writes and journal them

Own password change, a manager setting an employee's or a teacher's password,
and the demotion that clears a password now bump the session version in the
same update, mirror it to Redis and leave a journal entry.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Student password paths (student portal, student card)

**Files:**
- Modify: `server/src/students/student-portal-write.service.ts` (imports, constructor 19–23, `changePassword` 89–93)
- Modify: `server/src/students/students-write.service.ts` (imports, constructor 32–41, `update` 252–357)
- Modify: `server/src/students/students.service.spec.ts`, `students-write.service.spec.ts`, `students-write.origin.spec.ts` (providers)
- Test: `server/src/students/students-password-sessions.spec.ts`

**Interfaces:**
- Consumes (Task 1): `passwordWrite`, `recordSessionsEnded`.
- Constructors become `StudentPortalWriteService(prisma, uploadService, entityHistoryService, redis: RedisService)` and `StudentsWriteService(…, leadOrigin, redis: RedisService)`.

- [ ] **Step 1: Write the failing tests**

`server/src/students/students-password-sessions.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { StudentPortalWriteService } from './student-portal-write.service';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from '../common/student-origin/student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { RedisService } from '../redis/redis.service';

/** Both student password writes end the student's other sessions (ADR-0030). */
describe('student password writes end the other sessions', () => {
  describe('StudentPortalWriteService.changePassword (the student themself)', () => {
    let service: StudentPortalWriteService;
    let prisma: any;
    let redis: { set: jest.Mock };
    let history: { recordUpdate: jest.Mock };

    beforeEach(async () => {
      prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 99001,
            password: await bcrypt.hash('eskiParol1', 4),
          }),
          update: jest.fn().mockResolvedValue({ sessionVersion: 3 }),
        },
        student: {
          findFirst: jest.fn().mockResolvedValue({ companyId: 1001 }),
        },
      };
      redis = { set: jest.fn().mockResolvedValue('OK') };
      history = { recordUpdate: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          StudentPortalWriteService,
          { provide: PrismaService, useValue: prisma },
          { provide: UploadService, useValue: { deleteFile: jest.fn() } },
          { provide: EntityHistoryService, useValue: history },
          { provide: RedisService, useValue: redis },
        ],
      }).compile();
      service = module.get(StudentPortalWriteService);
    });

    it('bumps the version with the hash, mirrors it and keeps the journal entry', async () => {
      await service.changePassword(99001, 10001, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.sessionVersion).toEqual({ increment: 1 });
      expect(call.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:99001',
        '3',
        'EX',
        expect.any(Number),
      );
      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          newValues: { parol: "o'zgartirildi" },
        }),
      );
    });
  });

  describe('StudentsWriteService.update (staff set a student password)', () => {
    const CEO_CALLER = {
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    };
    const studentRow = {
      id: 10001,
      userId: 99001,
      companyId: 1001,
      phone: '901234567',
      photo: null,
      branches: [],
      enrollments: [],
    };

    let service: StudentsWriteService;
    let prisma: any;
    let redis: { set: jest.Mock };
    let history: { recordUpdate: jest.Mock };

    beforeEach(async () => {
      prisma = {
        student: {
          findFirst: jest.fn().mockResolvedValue(studentRow),
          update: jest.fn().mockResolvedValue(studentRow),
        },
        studentBranch: {
          findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue(CEO_CALLER),
          update: jest.fn().mockResolvedValue({ sessionVersion: 6 }),
        },
        $transaction: jest.fn((cb: any) => cb(prisma)),
      };
      redis = { set: jest.fn().mockResolvedValue('OK') };
      history = { recordUpdate: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          StudentsWriteService,
          { provide: PrismaService, useValue: prisma },
          { provide: UploadService, useValue: { deleteFile: jest.fn() } },
          { provide: StatusHistoryService, useValue: {} },
          { provide: StatusCascadeService, useValue: {} },
          { provide: EntityHistoryService, useValue: history },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: TransactionsService, useValue: {} },
          { provide: StudentLeadOriginService, useValue: {} },
          { provide: RedisService, useValue: redis },
        ],
      }).compile();
      service = module.get(StudentsWriteService);
    });

    it('ends the student sessions and journals it on the student card', async () => {
      await service.update(10001, { password: 'yangiParol1' } as any, 7, 1001);

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 99001 });
      expect(call.data.sessionVersion).toEqual({ increment: 1 });
      expect(call.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:99001',
        '6',
        'EX',
        expect.any(Number),
      );
      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          newValues: { parol: "yangi parol o'rnatildi" },
          changedById: 7,
          companyId: 1001,
        }),
      );
    });

    it('leaves the sessions alone when no password is sent', async () => {
      await service.update(10001, { firstName: 'Ali' } as any, 7, 1001);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx jest src/students/students-password-sessions.spec.ts`
Expected: FAIL — no `sessionVersion` in the update data, no `redis.set`, and no journal entry for the card write. (The extra `RedisService` provider is harmless before the constructors ask for it.)

- [ ] **Step 3: Implement in `StudentPortalWriteService`**

- Imports: `import { RedisService } from '../redis/redis.service';`, `import { passwordWrite, recordSessionsEnded } from '../common/auth/session-version';`.
- Constructor: append `private redis: RedisService,`.
- Replace

```ts
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
```

with

```ts
    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);
    // Ends every session of the account, this one included; the controller
    // hands the student a fresh pair (ADR-0030).
    const { sessionVersion } = await this.prisma.user.update({
      where: { id: userId },
      data: passwordWrite(hashedPassword),
      select: { sessionVersion: true },
    });
    await recordSessionsEnded(this.redis, userId, sessionVersion);
```

- [ ] **Step 4: Implement in `StudentsWriteService.update`**

- Imports: `import { RedisService } from '../redis/redis.service';`, `import { passwordWrite, recordSessionsEnded } from '../common/auth/session-version';`.
- Constructor: append `private redis: RedisService,` after `private leadOrigin: StudentLeadOriginService,`.
- Directly before `const updated = await this.prisma.$transaction(` add (a holder object, not a `let`: TypeScript would narrow a `let` assigned only inside the callback to `undefined` at the read below):

```ts
    // Filled inside the transaction when the password changes; mirrored for
    // JwtAuthGuard only once the transaction has committed (ADR-0030).
    const passwordChange: { sessionVersion?: number } = {};
```

- Inside the transaction replace

```ts
        if (hashedPassword && student.userId) {
          await tx.user.update({
            where: { id: student.userId },
            data: { password: hashedPassword },
          });
        }
```

with

```ts
        if (hashedPassword && student.userId) {
          const { sessionVersion } = await tx.user.update({
            where: { id: student.userId },
            data: passwordWrite(hashedPassword),
            select: { sessionVersion: true },
          });
          passwordChange.sessionVersion = sessionVersion;
        }
```

- Directly after the existing `await this.entityHistoryService.recordUpdate({ entityType: 'Student', … newValues: updated, … });` add:

```ts
    if (passwordChange.sessionVersion !== undefined && student.userId) {
      await recordSessionsEnded(
        this.redis,
        student.userId,
        passwordChange.sessionVersion,
      );
      await this.entityHistoryService.recordUpdate({
        entityType: 'Student',
        entityId: id,
        oldValues: { parol: '***' },
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: userId,
        companyId: student.companyId ?? undefined,
      });
    }
```

- [ ] **Step 5: Give the existing `StudentsWriteService` test setups their new dependency**

In `students.service.spec.ts`, `students-write.service.spec.ts` and `students-write.origin.spec.ts`: add `import { RedisService } from '../redis/redis.service';` and, in the providers array that lists `StudentsWriteService`, add `{ provide: RedisService, useValue: { set: jest.fn() } },`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && npx jest src/students`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/students
git commit -m "End sessions on student password writes

The student's own change and a password set on the student card bump the
session version in the same update and mirror it; the card write is now
journaled too.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Reset paths (SMS for every role, Telegram bot)

**Files:**
- Modify: `server/src/common/password-reset/portal-password-reset.service.ts` (imports, constructor 48–51, `applyNewPassword` 115–119)
- Modify: `server/src/common/password-reset/portal-password-reset.service.spec.ts`
- Modify: `server/src/telegram/flows/password-reset-flow.ts` (imports, 156–161)
- Modify: `server/src/telegram/flows/password-reset-flow.spec.ts`

**Interfaces:**
- Consumes (Task 1): `passwordWrite`, `recordSessionsEnded`.
- `PortalPasswordResetService` constructor becomes `(prisma, entityHistory, redis: RedisService)`.

- [ ] **Step 1: Write the failing tests**

`portal-password-reset.service.spec.ts`:
- In `build()`: make `update: jest.fn().mockResolvedValue({ sessionVersion: 4 })`, add `const redis = { set: jest.fn().mockResolvedValue('OK') };`, construct with `new PortalPasswordResetService(prisma as any, entityHistory as any, redis as any)` and return `{ service, prisma, entityHistory, redis }`.
- Add to `describe('applyNewPassword')`:

```ts
    it('ends every session of the account (ADR-0030)', async () => {
      const { service, prisma, redis } = build();

      await service.applyNewPassword(
        { userId: 10001, studentId: 10050, companyId: 2 },
        'newpass123',
        'SMS orqali tiklandi',
      );

      const update = prisma.user.update.mock.calls[0][0];
      expect(update.data.sessionVersion).toEqual({ increment: 1 });
      expect(update.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:10001',
        '4',
        'EX',
        expect.any(Number),
      );
    });
```

`password-reset-flow.spec.ts`, add to `describe('resetPassword')`:

```ts
    it('ends every session of the account (ADR-0030)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 99001,
        status: UserStatus.ACTIVE,
      });
      prisma.user.update.mockResolvedValue({ sessionVersion: 2 });

      await resetPassword(prisma, entityHistory, redis, baseStudent);

      const update = prisma.user.update.mock.calls[0][0];
      expect(update.data.sessionVersion).toEqual({ increment: 1 });
      expect(update.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:99001',
        '2',
        'EX',
        expect.any(Number),
      );
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx jest src/common/password-reset src/telegram/flows/password-reset-flow.spec.ts`
Expected: FAIL — `sessionVersion` absent from the update data; no session-version `redis.set`.

- [ ] **Step 3: Implement**

`portal-password-reset.service.ts`: imports `import { RedisService } from '../../redis/redis.service';`, `import { passwordWrite, recordSessionsEnded } from '../auth/session-version';`; constructor gains `private readonly redis: RedisService,` last; in `applyNewPassword` replace the `await this.prisma.user.update({ where: { id: target.userId }, data: { password: hashed } });` statement with:

```ts
    // A reset ends every session of the account (ADR-0030): whoever still
    // holds the old one is signed out on their next request.
    const { sessionVersion } = await this.prisma.user.update({
      where: { id: target.userId },
      data: passwordWrite(hashed),
      select: { sessionVersion: true },
    });
    await recordSessionsEnded(this.redis, target.userId, sessionVersion);
```

`password-reset-flow.ts`: import `import { passwordWrite, recordSessionsEnded } from '../../common/auth/session-version';`; replace the `await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });` statement with:

```ts
  // A reset ends every session of the account (ADR-0030).
  const { sessionVersion } = await prisma.user.update({
    where: { id: user.id },
    data: passwordWrite(hashedPassword),
    select: { sessionVersion: true },
  });
  await recordSessionsEnded(redis, user.id, sessionVersion);
```

(`PasswordResetModule` needs no import: `RedisModule` is `@Global()`.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd server && npx jest src/common/password-reset src/telegram/flows src/auth/forgot-password`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/common/password-reset server/src/telegram/flows
git commit -m "End sessions on SMS and Telegram password resets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Guard test — `User.password` is written only through `passwordWrite()`

**Files:**
- Test: `server/src/common/auth/password-write.single-source.spec.ts`

**Interfaces:**
- Consumes: the migrated paths of Tasks 4–6 (the repo-wide assertion is green only once every raw write is gone).

- [ ] **Step 1: Write the guard (detector + fixture tests + repo assertion)**

```ts
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * Every write of `User.password` on an existing account must end that
 * account's other sessions (ADR-0030). `passwordWrite()` in
 * `common/auth/session-version.ts` is the one way to write the column that
 * does, because it puts the hash and the session-version bump in ONE update.
 *
 * This guard reads every source file as a TypeScript AST and fails on any
 * other place that WRITES a `password` key: an object-literal property
 * (`password: hash`, shorthand `{ password }`) or an assignment
 * (`x.password = …`). Not writes, and ignored: a Prisma `select`/`omit` flag
 * (`password: true`), a type, a parameter, a destructuring pattern. An object
 * passed to a `create`/`createMany` call — or the `create` half of an
 * `upsert` — is allowed: a new account has no sessions to end.
 *
 * What it does not catch, honestly:
 * - raw SQL (`$executeRaw`) — nothing writes `"User"."password"` that way today;
 * - a computed key (`{ [key]: hash }`).
 * The behaviour tests beside each path (`*-password-sessions.spec.ts`,
 * `portal-password-reset.service.spec.ts`, `password-reset-flow.spec.ts`)
 * check the bump really happens; this guard checks nobody goes around it.
 */

/** The only file allowed to write the key: it IS `passwordWrite()`. */
const THE_SOURCE = 'src/common/auth/session-version.ts';

/**
 * `password` keys that are not `User.password`. `where` is the call the key
 * sits in, or the assignment target — narrower than a whole file, so a real
 * user write added to one of these files later still fails.
 */
const NOT_A_USER_PASSWORD: { file: string; where: string; why: string }[] = [
  {
    file: 'src/redis/redis.service.ts',
    where: 'super',
    why: 'Redis connection option',
  },
  {
    file: 'src/eskiz/eskiz.service.ts',
    where: 'this.password',
    why: 'Eskiz SMS API credential',
  },
  {
    file: 'src/users/users.controller.ts',
    where: 'JSON.stringify',
    why: "a log line that masks the DTO's password",
  },
  {
    file: 'src/telegram/scenes/employee-registration.scene.ts',
    where: 'buildStaffCredentialsMessage',
    why: 'the welcome message for the account just created',
  },
  {
    file: 'src/telegram/scenes/teacher-registration.scene.ts',
    where: 'buildStaffCredentialsMessage',
    why: 'the welcome message for the account just created',
  },
];

const FIX =
  "write the column with passwordWrite() from common/auth/session-version.ts and call recordSessionsEnded() after the commit — see ADR-0030";

interface PasswordWrite {
  file: string;
  line: number;
  /** The call the key sits in, or the assignment target. */
  where: string;
}

const CREATES = new Set(['create', 'createMany']);

function keyName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name)
    ? name.text
    : undefined;
}

/** The nearest call that receives `node` (or something containing it) as an argument. */
function enclosingCall(node: ts.Node): ts.CallExpression | undefined {
  let current: ts.Node = node;
  while (current.parent) {
    const parent = current.parent;
    if (
      ts.isCallExpression(parent) &&
      parent.arguments.some((arg) => arg === current)
    ) {
      return parent;
    }
    current = parent;
  }
  return undefined;
}

/** Which top-level key of an `upsert` argument holds `node`. */
function upsertBranch(
  node: ts.Node,
  call: ts.CallExpression,
): string | undefined {
  const arg = call.arguments[0];
  let current: ts.Node = node;
  while (current.parent && current.parent !== arg) current = current.parent;
  return current.parent === arg && ts.isPropertyAssignment(current)
    ? keyName(current.name)
    : undefined;
}

function writesNewRow(node: ts.Node): boolean {
  const call = enclosingCall(node);
  if (!call || !ts.isPropertyAccessExpression(call.expression)) return false;
  const method = call.expression.name.text;
  if (CREATES.has(method)) return true;
  return method === 'upsert' && upsertBranch(node, call) === 'create';
}

export function findPasswordWrites(
  source: string,
  file: string,
): PasswordWrite[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: PasswordWrite[] = [];
  const lineOf = (node: ts.Node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      keyName(node.name) === 'password' &&
      ts.isObjectLiteralExpression(node.parent)
    ) {
      const isFlag =
        ts.isPropertyAssignment(node) &&
        (node.initializer.kind === ts.SyntaxKind.TrueKeyword ||
          node.initializer.kind === ts.SyntaxKind.FalseKeyword);
      if (!isFlag && !writesNewRow(node)) {
        const call = enclosingCall(node);
        found.push({
          file,
          line: lineOf(node),
          where: call ? call.expression.getText(sf) : '(no call)',
        });
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ((ts.isPropertyAccessExpression(node.left) &&
        node.left.name.text === 'password') ||
        (ts.isElementAccessExpression(node.left) &&
          ts.isStringLiteral(node.left.argumentExpression) &&
          node.left.argumentExpression.text === 'password'))
    ) {
      found.push({ file, line: lineOf(node), where: node.left.getText(sf) });
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

describe('findPasswordWrites — the detector', () => {
  const where = (src: string) =>
    findPasswordWrites(src, 'fixture.ts').map((w) => w.where);

  it('flags a raw password in a user update', () => {
    expect(
      where(`tx.user.update({ where: { id }, data: { password: hash } });`),
    ).toEqual(['tx.user.update']);
  });

  it('flags a password hidden in a conditional spread', () => {
    expect(
      where(`prisma.user.update({ data: { ...(h && { password: h }) } });`),
    ).toEqual(['prisma.user.update']);
  });

  it('flags an assignment into a data object, dotted or bracketed', () => {
    expect(
      where(`updateData.password = h; updateData['password'] = null;`),
    ).toEqual(['updateData.password', "updateData['password']"]);
  });

  it('flags Object.assign with a raw password', () => {
    expect(where(`Object.assign(updateData, { password: null });`)).toEqual([
      'Object.assign',
    ]);
  });

  it('lets passwordWrite() through', () => {
    expect(
      where(
        `tx.user.update({ data: { ...passwordWrite(h) } }); prisma.user.update({ data: passwordWrite(null) });`,
      ),
    ).toEqual([]);
  });

  it('lets a new account through', () => {
    expect(
      where(
        `prisma.user.create({ data: { password: h } }); usersService.create({ login, password });`,
      ),
    ).toEqual([]);
  });

  it('judges an upsert by branch', () => {
    expect(
      where(
        `prisma.user.upsert({ where: { id }, create: { password: h }, update: { password: h } });`,
      ),
    ).toEqual(['prisma.user.upsert']);
  });

  it('ignores selects, types, parameters and destructuring', () => {
    expect(
      where(`
        prisma.user.findUnique({ select: { password: true } });
        interface Dto { password: string }
        function f(login: string, password: string) { return login + password; }
        const { password: _, ...rest } = user;
      `),
    ).toEqual([]);
  });
});

const SRC = join(__dirname, '..', '..');
const REPO = join(SRC, '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') continue;
      walk(full, out);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);
const rel = (f: string) => relative(REPO, f).split('\\').join('/');
const writes = files.flatMap((f) =>
  findPasswordWrites(readFileSync(f, 'utf8'), rel(f)),
);

describe('User.password is written only through passwordWrite() — single source', () => {
  it('reads the source tree at all (a silent zero would pass everything)', () => {
    expect(files.length).toBeGreaterThan(500);
    // Creates, the Redis option, Eskiz, the log mask and the welcome messages
    // are all still in there: a scanner that finds nothing is broken.
    expect(writes.length).toBeGreaterThanOrEqual(NOT_A_USER_PASSWORD.length);
  });

  it('has no raw password write outside passwordWrite()', () => {
    const offenders = writes
      .filter(
        (w) =>
          w.file !== THE_SOURCE &&
          !NOT_A_USER_PASSWORD.some(
            (a) => a.file === w.file && a.where === w.where,
          ),
      )
      .map((w) => `${w.file}:${w.line} (${w.where})`);

    expect({ offenders, fix: FIX }).toEqual({ offenders: [], fix: FIX });
  });

  it('lists no allowance that no longer matches anything', () => {
    const stale = NOT_A_USER_PASSWORD.filter(
      (a) => !writes.some((w) => w.file === a.file && w.where === a.where),
    ).map((a) => `${a.file} (${a.where})`);

    expect(stale).toEqual([]);
  });

  it('mirrors every bump it makes', () => {
    // A path that bumps the version but never calls recordSessionsEnded()
    // leaves the old access tokens working for the rest of their hour.
    const missing = files
      .map((f) => ({ file: rel(f), text: readFileSync(f, 'utf8') }))
      .filter(
        ({ file, text }) =>
          file !== THE_SOURCE &&
          /\b(passwordWrite|endSessionsWrite)\(/.test(text) &&
          !/\brecordSessionsEnded\(/.test(text),
      )
      .map(({ file }) => file);

    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Prove the guard bites**

Run: `cd server && npx jest src/common/auth/password-write.single-source.spec.ts`
Expected: PASS (Tasks 4–6 already migrated every path). Then temporarily change `data: passwordWrite(hashedPassword)` in `src/students/student-portal-write.service.ts` back to `data: { password: hashedPassword }` and run again.
Expected: FAIL listing `src/students/student-portal-write.service.ts:<line> (this.prisma.user.update)`. Restore the line (`git diff src/students/student-portal-write.service.ts` must be empty again).

- [ ] **Step 3: Commit**

```bash
git add server/src/common/auth/password-write.single-source.spec.ts
git commit -m "Guard: User.password is written only through passwordWrite()

An AST scan of src/ fails on any raw password write outside account
creation and five named non-User places, and on a bump without its Redis
mirror.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The acting device keeps its session; "log out other devices" endpoint

> **As built (after the whole-branch review):** `issueSession(userId, sessionVersion)` signs with the version the caller's own write produced (the two password services return it; the controllers pass it on and never echo it), and `logoutOtherSessions(userId, callerVersion)` bumps with a compare-and-set (`updateMany where { id, sessionVersion: callerVersion }`), answering 401 with no change when the caller is already behind. The code below shows the first version.

**Files:**
- Modify: `server/src/auth/auth.service.ts` (constructor, new `logoutOtherSessions`)
- Modify: `server/src/auth/auth.service.spec.ts`
- Modify: `server/src/users/users.controller.ts`, `users.controller.spec.ts`, `users.module.ts`
- Modify: `server/src/students/student-portal.controller.ts`, `student-portal.controller.spec.ts`, `students.module.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (`SELF` block at 420–427)

**Interfaces:**
- Consumes (Task 1): `endSessionsWrite`, `recordSessionsEnded`. (Task 2): `issueSession`.
- Produces: `AuthService.logoutOtherSessions(userId: number)` → same shape as `issueSession`; `POST /users/logout-others` → `{ accessToken, refreshToken, user }`; `PATCH /users/password` and `PATCH /student-portal/password` → `{ message, accessToken, refreshToken, user }` (Task 9 consumes these).
- `AuthService` constructor becomes `(prisma, jwtService, configService, redis, entityHistory: EntityHistoryService)`.

- [ ] **Step 1: Write the failing tests**

`auth.service.spec.ts`:
- `beforeEach`: `prisma.user` gains `update: jest.fn()`; `redis = { get: jest.fn(), del: jest.fn(), set: jest.fn().mockResolvedValue('OK') };`; add `history = { recordUpdate: jest.fn() };` (declare `let history: any;` beside the others); construct with `new AuthService(prisma, jwt, config, redis, history)`.
- Add inside `describe('session version (ADR-0030)')`:

```ts
    describe('logoutOtherSessions', () => {
      it('ends every session, mirrors it, journals it on the student card and re-issues this device', async () => {
        prisma.user.update.mockResolvedValue({
          sessionVersion: 5,
          companyId: 1,
          student: { id: 10001 },
        });
        prisma.user.findFirst.mockResolvedValue({
          ...student,
          status: 'ACTIVE',
          deletedAt: null,
          sessionVersion: 5,
        });

        const res = await service.logoutOtherSessions(1);

        expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
          where: { id: 1 },
          data: { sessionVersion: { increment: 1 } },
        });
        expect(redis.set).toHaveBeenCalledWith(
          'user:session-version:1',
          '5',
          'EX',
          expect.any(Number),
        );
        expect(history.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            entityType: 'Student',
            entityId: 10001,
            newValues: { kirishlar: 'boshqa qurilmalardan chiqildi' },
            changedById: 1,
            companyId: 1,
          }),
        );
        expect(res.accessToken).toBe('tok');
        expect(jwt.sign.mock.calls[0][0]).toMatchObject({ sub: 1, sv: 5 });
      });

      it('journals a staff account on the employee record', async () => {
        prisma.user.update.mockResolvedValue({
          sessionVersion: 2,
          companyId: 1,
          student: null,
        });
        prisma.user.findFirst.mockResolvedValue({
          ...teacher,
          status: 'ACTIVE',
          deletedAt: null,
          sessionVersion: 2,
        });

        await service.logoutOtherSessions(2);

        expect(history.recordUpdate).toHaveBeenCalledWith(
          expect.objectContaining({ entityType: 'User', entityId: 2 }),
        );
      });
    });
```

`users.controller.spec.ts`:
- Import `AuthService` from `'../auth/auth.service'`.
- Add beside `mockService`:

```ts
  const mockAuth = {
    issueSession: jest.fn().mockResolvedValue({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 7 },
    }),
    logoutOtherSessions: jest.fn().mockResolvedValue({
      accessToken: 'a2',
      refreshToken: 'r2',
      user: { id: 7 },
    }),
  };
```

- Providers: `[{ provide: UsersService, useValue: mockService }, { provide: AuthService, useValue: mockAuth }]`.
- Add at the top of the describe (the mocks live for the whole suite, so compare the LAST calls):

```ts
  const lastCall = (fn: jest.Mock) =>
    fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];
```

- Add:

```ts
  describe('changePassword()', () => {
    it('hands the caller a fresh session AFTER the change', async () => {
      mockService.changePassword.mockResolvedValue({
        message: "Parol muvaffaqiyatli o'zgartirildi",
      });

      const res = await controller.changePassword(7, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      expect(mockAuth.issueSession).toHaveBeenCalledWith(7);
      // Issued before the change, the pair would carry the old version.
      expect(lastCall(mockService.changePassword)).toBeLessThan(
        lastCall(mockAuth.issueSession),
      );
      expect(res).toEqual({
        message: "Parol muvaffaqiyatli o'zgartirildi",
        accessToken: 'a',
        refreshToken: 'r',
        user: { id: 7 },
      });
    });
  });

  describe('logoutOthers()', () => {
    it('is open to every signed-in account (no @Roles)', () => {
      expect(
        reflector.get<string[]>(ROLES_KEY, controller.logoutOthers),
      ).toBeUndefined();
    });

    it('acts on the caller only', async () => {
      const res = await controller.logoutOthers(7);

      expect(mockAuth.logoutOtherSessions).toHaveBeenCalledWith(7);
      expect(res).toEqual({
        accessToken: 'a2',
        refreshToken: 'r2',
        user: { id: 7 },
      });
    });
  });
```

`student-portal.controller.spec.ts`:
- Import `AuthService` from `'../auth/auth.service'`; add `const mockAuth = { issueSession: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 99001 } }) };` and `{ provide: AuthService, useValue: mockAuth }` to the providers.
- Add inside `describe('changePassword()')`:

```ts
    it('hands the student a fresh session AFTER the change', async () => {
      mockService.changePassword.mockResolvedValue({
        message: "Parol muvaffaqiyatli o'zgartirildi",
      });

      const res = await controller.changePassword(99001, 10001, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      expect(mockAuth.issueSession).toHaveBeenCalledWith(99001);
      const last = (fn: jest.Mock) =>
        fn.mock.invocationCallOrder[fn.mock.invocationCallOrder.length - 1];
      expect(last(mockService.changePassword)).toBeLessThan(
        last(mockAuth.issueSession),
      );
      expect(res).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd server && npx jest src/auth/auth.service.spec.ts src/users/users.controller.spec.ts src/students/student-portal.controller.spec.ts src/common/auth/branch-route-policy.spec.ts`
Expected: FAIL — `logoutOtherSessions`/`logoutOthers` are not functions, the responses lack tokens.

- [ ] **Step 3: Implement `AuthService.logoutOtherSessions`**

- Imports: `import { EntityHistoryService } from '../common/entity-history';` and extend the session-version import to `import { SESSION_ENDED_MESSAGE, endSessionsWrite, recordSessionsEnded, tokenSessionVersion } from '../common/auth/session-version';`.
- Constructor: append `private entityHistory: EntityHistoryService,`.
- Add after `issueSession`:

```ts
  /**
   * "Log out other devices": end every session of the account, then hand the
   * device that asked a fresh pair so it stays signed in (ADR-0030).
   */
  async logoutOtherSessions(userId: number) {
    const { sessionVersion, companyId, student } =
      await this.prisma.user.update({
        where: { id: userId },
        data: endSessionsWrite(),
        select: {
          sessionVersion: true,
          companyId: true,
          student: { select: { id: true } },
        },
      });
    await recordSessionsEnded(this.redis, userId, sessionVersion);

    // Journaled where staff look for it: the student card for a student, the
    // employee record for everyone else.
    await this.entityHistory.recordUpdate({
      entityType: student ? 'Student' : 'User',
      entityId: student?.id ?? userId,
      oldValues: { kirishlar: 'faol' },
      newValues: { kirishlar: 'boshqa qurilmalardan chiqildi' },
      changedById: userId,
      companyId,
    });

    return this.issueSession(userId);
  }
```

- [ ] **Step 4: Wire the controllers and modules**

`users.controller.ts`:
- Add `HttpCode` to the `@nestjs/common` import list and `import { AuthService } from '../auth/auth.service';`.
- Constructor: `constructor(private usersService: UsersService, private authService: AuthService) {}`.
- Replace the `changePassword` handler with:

```ts
  @Patch('password')
  async changePassword(
    @CurrentUser('id') userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.usersService.changePassword(userId, dto);
    // The change ended every session of this account, the caller's included
    // (ADR-0030). A fresh pair keeps THIS device signed in.
    return { ...result, ...(await this.authService.issueSession(userId)) };
  }

  /**
   * "Log out other devices" — any signed-in account, on itself only: the id
   * comes from the token, never from the request.
   */
  @Post('logout-others')
  @HttpCode(200)
  logoutOthers(@CurrentUser('id') userId: number) {
    return this.authService.logoutOtherSessions(userId);
  }
```

`student-portal.controller.ts`:
- `import { AuthService } from '../auth/auth.service';`; constructor gains `private authService: AuthService,` last.
- Replace the `changePassword` handler body:

```ts
  @Patch('password')
  @UseGuards(RolesGuard)
  @Roles('Student')
  async changePassword(
    @CurrentUser('id') userId: number,
    @CurrentUser('studentId') studentId: number,
    @Body() dto: ChangePortalPasswordDto,
  ) {
    const result = await this.studentPortalService.changePassword(
      userId,
      studentId,
      dto,
    );
    // The change ended every session of the account, this one included
    // (ADR-0030). A fresh pair keeps the student signed in here.
    return { ...result, ...(await this.authService.issueSession(userId)) };
  }
```

`users.module.ts`: `imports: [UploadModule, AuthModule]` with `import { AuthModule } from '../auth/auth.module';`.
`students.module.ts`: add `AuthModule` to `imports` with the same import line. (`AuthModule` imports only leaf modules, so neither creates a cycle.)

`branch-route-policy.ts`, the `SELF` block:

```ts
  {
    policy: 'SELF',
    reason:
      'The caller acting on their own account. All three take the id from ' +
      "`@CurrentUser('id')` and never from the request, so there is no " +
      'other account they could reach and a branch check would gate nothing.',
    routes: [
      'PATCH /users/password',
      'PATCH /users/profile',
      'POST /users/logout-others',
    ],
  },
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd server && npx jest src/auth src/users src/students src/common/auth`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/auth server/src/users server/src/students server/src/common/auth/branch-route-policy.ts
git commit -m "Keep the acting device signed in; add POST /users/logout-others

Own password changes (staff and student portal) now return a fresh pair.
The new SELF route ends every other session of the caller and returns a
fresh pair; it is journaled on the student card or the employee record.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — store the fresh pair; "Boshqa qurilmalardan chiqish" for staff and students

> **As built:** the two confirmations below became ONE component, `client/src/components/shared/logout-others-dialog.tsx` (an `AlertDialog`); the student portal passes `contentClassName="lumio"`, exactly like its own sign-out (`student-logout-button.tsx`). `components/profile/logout-others-dialog.tsx` and `student-portal/student-logout-others-dialog.tsx` below were replaced by it.

**Files:**
- Create: `client/src/lib/fresh-session.ts`, `client/src/lib/fresh-session.test.ts`
- Create: `client/src/hooks/use-logout-others.ts`
- Create: `client/src/components/profile/logout-others-dialog.tsx`
- Create: `client/src/components/student-portal/student-logout-others-dialog.tsx`
- Modify: `client/src/components/profile/change-password-drawer.tsx`, `profile-details.tsx`, `profile-client.tsx`
- Modify: `client/src/components/student-portal/student-password-dialog.tsx`, `student-settings-page.tsx`

**Interfaces:**
- Consumes (Task 8): the response shapes of `PATCH /users/password`, `PATCH /student-portal/password`, `POST /users/logout-others`.
- Produces: `freshSessionFrom(data: unknown): FreshSession | null`; `useLogoutOthers(): { logoutOthers: () => Promise<boolean>; pending: boolean }`.

- [ ] **Step 1: Write the failing test**

`client/src/lib/fresh-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { freshSessionFrom } from "./fresh-session";

const user = { id: 7, firstName: "Ali" };

describe("freshSessionFrom", () => {
  it("returns the pair the API handed back", () => {
    expect(
      freshSessionFrom({
        message: "ok",
        accessToken: "a",
        refreshToken: "r",
        user,
      }),
    ).toEqual({ accessToken: "a", refreshToken: "r", user });
  });

  it("returns null for a message-only response (an API from before ADR-0030)", () => {
    expect(freshSessionFrom({ message: "ok" })).toBeNull();
  });

  it("returns null when part of the session is missing", () => {
    expect(freshSessionFrom({ accessToken: "a", user })).toBeNull();
    expect(freshSessionFrom({ accessToken: "a", refreshToken: "r" })).toBeNull();
  });

  it("returns null for no body at all", () => {
    expect(freshSessionFrom(undefined)).toBeNull();
    expect(freshSessionFrom("ok")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd client && npx vitest run src/lib/fresh-session.test.ts`
Expected: FAIL — cannot resolve `./fresh-session`.

- [ ] **Step 3: Write `client/src/lib/fresh-session.ts`**

```ts
import type { AuthUser } from "@/hooks/use-auth";

export interface FreshSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * The fresh token pair the API returns after a password change or "log out
 * other devices". Both actions end every session of the account — this
 * device's too — so the pair must be stored or the very next request signs the
 * user out (ADR-0030). `null` when the response carries no session.
 */
export function freshSessionFrom(data: unknown): FreshSession | null {
  if (!data || typeof data !== "object") return null;
  const { user, accessToken, refreshToken } = data as Record<string, unknown>;
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }
  return { user: user as AuthUser, accessToken, refreshToken };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd client && npx vitest run src/lib/fresh-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `client/src/hooks/use-logout-others.ts`**

```ts
"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { freshSessionFrom } from "@/lib/fresh-session";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * "Log out other devices" (ADR-0030). The server ends every session of the
 * account — this device's too — and hands back a fresh pair, stored here so
 * only the OTHER devices are signed out. Resolves `true` on success.
 */
export function useLogoutOthers() {
  const { setAuth } = useAuth();
  const [pending, setPending] = useState(false);

  const logoutOthers = useCallback(async () => {
    setPending(true);
    try {
      const { data } = await api.post("/users/logout-others");
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success("Boshqa qurilmalardagi kirishlar tugatildi");
      return true;
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Boshqa qurilmalardan chiqib bo'lmadi"),
      );
      return false;
    } finally {
      setPending(false);
    }
  }, [setAuth]);

  return { logoutOthers, pending };
}
```

- [ ] **Step 6: Store the fresh pair after an own password change**

`change-password-drawer.tsx`: imports `import { useAuth } from "@/hooks/use-auth";` and `import { freshSessionFrom } from "@/lib/fresh-session";`; inside the component `const { setAuth } = useAuth();`; replace

```ts
      await api.patch("/users/password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
```

with

```ts
      const { data } = await api.patch("/users/password", {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      // The change ended every session of this account, this device's too;
      // the API returns a fresh pair so only the other devices sign out.
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success(
        "Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar tugatildi",
      );
```

`student-password-dialog.tsx`: the same imports and `const { setAuth } = useAuth();`; replace

```ts
      await api.patch("/student-portal/password", { oldPassword, newPassword });
      toast.success("Parol muvaffaqiyatli o'zgartirildi");
```

with

```ts
      const { data } = await api.patch("/student-portal/password", {
        oldPassword,
        newPassword,
      });
      // The change ended every session of this account, this device's too;
      // the API returns a fresh pair so only the other devices sign out.
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success(
        "Parol o'zgartirildi. Boshqa qurilmalardagi kirishlar tugatildi",
      );
```

- [ ] **Step 7: Staff dialog and buttons**

Create `client/src/components/profile/logout-others-dialog.tsx`:

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLogoutOthers } from "@/hooks/use-logout-others";

interface LogoutOthersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LogoutOthersDialog({
  open,
  onOpenChange,
}: LogoutOthersDialogProps) {
  const { logoutOthers, pending } = useLogoutOthers();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Boshqa qurilmalardan chiqilsinmi?</AlertDialogTitle>
          <AlertDialogDescription>
            Boshqa barcha qurilma va brauzerlardagi kirishlar darhol
            tugatiladi. Bu qurilmada qolasiz.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={async (event) => {
              // Keep the dialog open until the request settles.
              event.preventDefault();
              if (await logoutOthers()) onOpenChange(false);
            }}
          >
            Chiqish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

`profile-details.tsx`: import `LogOut` beside `KeyRound` from `lucide-react`; add `onLogoutOthers: () => void;` to `ProfileDetailsProps` and destructure it; replace the single "Parol o'zgartirish" `Tooltip` block with:

```tsx
      {/* Parol va kirishlar */}
      <div className="flex flex-wrap gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onChangePassword}>
              <KeyRound className="mr-1.5 size-4" />
              Parolni o&apos;zgartirish
            </Button>
          </TooltipTrigger>
          <TooltipContent>Joriy parolni yangilash</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onLogoutOthers}>
              <LogOut className="mr-1.5 size-4" />
              Boshqa qurilmalardan chiqish
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Boshqa qurilmalardagi kirishlarni tugatish
          </TooltipContent>
        </Tooltip>
      </div>
```

`profile-client.tsx`:
- Imports: `LogOut` beside `KeyRound, Pencil`; `import { Button } from "@/components/ui/button";`; `import { LogoutOthersDialog } from "./logout-others-dialog";`.
- State: `const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);`.
- Mobile: the header's inline actions share one row (`flex-1`), and a third long label does not fit at 375px. So wrap the existing `<MobileProfileHeader … />` element — every prop unchanged — in a fragment `<>…</>` and add, right after it inside the fragment:

```tsx
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setLogoutOthersOpen(true)}
            >
              <LogOut className="mr-1.5 size-4" />
              Boshqa qurilmalardan chiqish
            </Button>
```
- Desktop: `<ProfileDetails user={user} onChangePassword={() => setPasswordOpen(true)} onLogoutOthers={() => setLogoutOthersOpen(true)} />`.
- After `<ChangePasswordDrawer … />`:

```tsx
      <LogoutOthersDialog
        open={logoutOthersOpen}
        onOpenChange={setLogoutOthersOpen}
      />
```

- [ ] **Step 8: Student dialog and row**

Create `client/src/components/student-portal/student-logout-others-dialog.tsx`:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLogoutOthers } from "@/hooks/use-logout-others";
import { Button } from "./lumio";

export interface StudentLogoutOthersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StudentLogoutOthersDialog({
  open,
  onOpenChange,
}: StudentLogoutOthersDialogProps) {
  const { logoutOthers, pending } = useLogoutOthers();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">
            Boshqa qurilmalardan chiqish
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-ink-500">
          Boshqa barcha telefon va kompyuterlardagi kirishlar tugatiladi. Bu
          qurilmada qolasiz.
        </p>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            loading={pending}
            onClick={async () => {
              if (await logoutOthers()) onOpenChange(false);
            }}
          >
            Chiqish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`student-settings-page.tsx`:
- Import `SignOut` beside `Key, User` from `@phosphor-icons/react`, and `import { StudentLogoutOthersDialog } from "./student-logout-others-dialog";`.
- State: `const [logoutOthersOpen, setLogoutOthersOpen] = useState(false);`.
- In `<Section title="Xavfsizlik">`, after the password `ListRow`:

```tsx
        <ListRow
          icon={<SignOut weight="bold" />}
          iconTone="coral"
          label="Boshqa qurilmalardan chiqish"
          subtitle="Bu qurilmada qolasiz"
          onClick={() => setLogoutOthersOpen(true)}
        />
```

- After `<StudentPasswordDialog … />`:

```tsx
      <StudentLogoutOthersDialog
        open={logoutOthersOpen}
        onOpenChange={setLogoutOthersOpen}
      />
```

- [ ] **Step 9: Verify the client**

Run: `cd client && npm test && npm run typecheck && npx eslint src/lib/fresh-session.ts src/lib/fresh-session.test.ts src/hooks/use-logout-others.ts src/components/profile src/components/student-portal/student-logout-others-dialog.tsx src/components/student-portal/student-password-dialog.tsx src/components/student-portal/student-settings-page.tsx`
Expected: all vitest suites pass, `tsc` exits 0, eslint reports no errors. Then `npx prettier --write` the same files.

- [ ] **Step 10: Commit**

```bash
git add client/src/lib/fresh-session.ts client/src/lib/fresh-session.test.ts client/src/hooks/use-logout-others.ts client/src/components/profile client/src/components/student-portal
git commit -m "Client: keep this device signed in; add log out other devices

After an own password change the returned pair is stored. Staff profile
(desktop and mobile) and the student portal settings get a confirmed
\"Boshqa qurilmalardan chiqish\" action.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR, docs, and full verification

**Files:**
- Create: `docs/adr/0030-parol-ozgarsa-boshqa-kirishlar-toxtaydi.md`
- Modify: `docs/adr/README.md` (index)
- Modify: `server/CLAUDE.md` (Authentication & Authorization section)
- Modify: `client/CLAUDE.md` (the section that documents `use-auth` / sign-in; if none, beside "Confirmation Dialogs")

- [ ] **Step 1: Write the ADR** (Uzbek, Latin script only; format of `0000-shablon.md`)

```markdown
# ADR-0030 — Parol o'zgarsa, hisobning boshqa kirishlari keyingi so'rovda to'xtaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-24
**Bog'liq:** ADR-0022 (har parol tiklash jurnalga), ADR-0028 (bloklangan xodim — Redis kaliti naqshi), `server/src/common/auth/session-version.ts`, `server/src/auth/auth.service.ts`, `server/src/auth/strategies/jwt.strategy.ts`, `server/src/common/guards/jwt-auth.guard.ts`, `docs/superpowers/specs/2026-09-24-parol-ozgarsa-kirishlar-tugaydi-design.md`

## Kontekst

Kirish chiptasi 1 soat, yangilash chiptasi 24 soat yashaydi. `refresh` imzoni
va hisob holatini tekshirib, har safar yangi 24 soatlik chipta berardi. Shu
sababli kuniga bir marta ochilgan sessiya cheksiz davom etardi. Parol
yoziladigan yetti yo'lning hech biri eski chiptalarga tegmasdi, `User`
jadvalida parol o'zgarganini bildiradigan hech narsa yo'q edi. `JwtStrategy`
chipta turini tekshirmasdi: yangilash chiptasi rol talab qilmaydigan
route'larda 24 soatlik kirish chiptasi bo'lib ishlardi. Natija: parolni bilib
olgan yoki chiptani ko'chirib olgan odam egasi parolni o'zgartirgandan keyin
ham tizimda qolardi.

## Qaror

1. **Har bir hisobda kirish raqami bor:** `User.sessionVersion`, 0 dan
   boshlanadi. Har bir chipta uni `sv` da olib yuradi. `sv` siz eski chipta 0
   hisoblanadi, buzuq `sv` li chipta yaroqsiz.
2. **Parol ustuniga har qanday yozuv raqamni oshiradi**, o'sha `update` ichida,
   `passwordWrite()` orqali. "Boshqa qurilmalardan chiqish" raqamni parolsiz
   oshiradi. Yozuvdan keyin yangi raqam Redis'ga yoziladi
   (`user:session-version:<id>`, kirish chiptasi muddati + 5 daqiqa); Redis
   xatosi yozuvni buzmaydi. Har bir parol o'zgarishi jurnalga yoziladi.
3. **Chegara bazada:** `refresh` chiptadagi raqam hisobnikidan farq qilsa rad
   etadi. **Tez yo'l Redis'da:** `JwtAuthGuard` eskirgan kirish chiptasini
   keyingi so'rovdayoq 401 bilan to'xtatadi va rad etishdan oldin bazaga
   solishtiradi. Redis ishlamasa so'rovni o'tkazadi: ko'pi bilan 1 soat,
   keyin `refresh` to'xtatadi.
4. **Yangilash chiptasi faqat `refresh` da ishlaydi:** `JwtStrategy` uni rad
   etadi.
5. **Harakat qilgan qurilma tizimda qoladi:** o'z parolini o'zgartirgan yoki
   "boshqa qurilmalardan chiqish" ni bosgan qurilma javobda yangi chipta
   oladi. Boshqa qurilmalar chiqadi.

**Taqiqlanadi:** `User.password` ni `passwordWrite()` siz yozish (qorovul:
`password-write.single-source.spec.ts`); chipta beradigan yangi yo'lni
`generateTokens` dan o'tkazmasdan qo'shish.

## Ko'rib chiqilgan muqobillar

**Faqat `refresh` da tekshirish.** Rad etildi (CEO tanlovi): kirib olgan
odamga 1 soat qolardi, ADR-0028 bloklashda ham bunday soatni qabul qilmagan.

**Har bir kirish bazada alohida yozuv (sessiya jadvali).** "Chiqish" ni
serverda ham ishlatadi va qurilmalar ro'yxatini beradi, lekin kirish,
yangilash va chiqish yo'llarini qayta yozadi. Hozirgi muammo uchun kerak emas.
Keyin qurilsa, kirish raqami "hammasini tugatish" dastagi bo'lib qoladi.

**`passwordChangedAt` vaqt belgisi.** Rad etildi: `iat` soniyali, shuning
uchun joriy qurilmaga berilgan yangi chipta o'z belgisidan "eski" chiqadi.

**Parol xeshidan barmoq izi.** Rad etildi: eski chiptalarda u yo'q. Bu yo'l
yo hammani bir marta majburan chiqarardi, yo 24 soatlik himoyasiz oyna
qoldirardi. "Boshqa qurilmalardan chiqish" uchun baribir raqam kerak bo'lardi.

## Oqibatlari

**Yutuq:** parol qaysi yo'l bilan o'zgarmasin, boshqa qurilmalar keyingi
so'rovda chiqadi. Deploy kuni hech kim chiqmaydi. Yetti yo'lning hammasi
jurnalga yozadi.

**Narx:** har bir so'rovga bitta Redis o'qishi qo'shiladi. `UsersService`,
`StudentsWriteService`, `StudentPortalWriteService` va
`PortalPasswordResetService` Redis'ga bog'landi. Chipta tarkibi o'zgardi
(`sv`). Parolni o'zgartirgan qurilmada, yangi chipta saqlanguncha ketgan
parallel so'rov uni kirish sahifasiga tushirishi mumkin (millisekundlar).

**Bu qaror yopmaydi:** "Chiqish" hanuz faqat brauzerni tozalaydi; sessiyaning
eng uzun muddati yo'q; yangilash chiptasi skript o'qiy oladigan cookie'da;
parolga bog'liq bo'lmagan kirish yo'llari (alohida vazifa).
```

- [ ] **Step 2: Index row** — append to the table in `docs/adr/README.md`:

```markdown
| [0030](0030-parol-ozgarsa-boshqa-kirishlar-toxtaydi.md) | Parol o'zgarsa, hisobning boshqa kirishlari keyingi so'rovda to'xtaydi | Qabul qilindi | 2026-09-24 |
```

- [ ] **Step 3: `server/CLAUDE.md`** — in "Authentication & Authorization", after the `POST /api/auth/refresh` bullet, add:

```markdown
- **Every token carries the account's session version (`sv`, ADR-0030).** `User.sessionVersion` starts at 0. Any write of `User.password` bumps it in the same `update` through `passwordWrite()` (`src/common/auth/session-version.ts`), and `POST /users/logout-others` bumps it without a password. `refresh` refuses a token whose `sv` differs from the database; `JwtAuthGuard` stops an older access token on its next request through the Redis mirror `user:session-version:<id>` (fail-open, confirmed against the database before the 401). A token without `sv` counts as version 0. `password-write.single-source.spec.ts` fails on a raw `password` write anywhere but account creation.
- **A refresh token is not an access token.** `JwtStrategy` refuses `type: 'refresh'`.
- **The device that acts keeps its session.** `PATCH /users/password`, `PATCH /student-portal/password` and `POST /users/logout-others` return `{ accessToken, refreshToken, user }` (the first two also `message`); the client stores the pair.
```

- [ ] **Step 4: `client/CLAUDE.md`** — add beside the auth/session documentation (or after "Confirmation Dialogs"):

```markdown
### Session-ending actions (ADR-0030)

- `PATCH /users/password`, `PATCH /student-portal/password` and `POST /users/logout-others` end EVERY session of the account, this device's included, and return a fresh pair. Store it with `freshSessionFrom(data)` + `setAuth(...)` (`src/lib/fresh-session.ts`), or the next request signs the user out. `useLogoutOthers()` (`src/hooks/use-logout-others.ts`) does this for the "Boshqa qurilmalardan chiqish" action.
```

- [ ] **Step 5: Full verification**

```bash
cd server && npm test
cd server && npm run typecheck
cd server && npx eslint $(git diff --name-only main -- src | sed 's|^server/||')
cd server && npm run build
cd client && npm test && npm run typecheck
```

Expected: server tests ≥ 414 + new suites, 0 failures; typecheck exit 0; eslint 0 errors; build exit 0; client tests and typecheck green. `npx prettier --write` every touched file and re-run eslint if it changed anything.

Then boot the built server once against the dev DB to prove the Nest module graph resolves (`UsersModule`/`StudentsModule` now import `AuthModule`): `PORT=4099 CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= node dist/src/main` in the background (port 4099 so it cannot collide with another session's dev server), wait for `Nest application successfully started` in its output, then stop it.

- [ ] **Step 6: Commit**

```bash
git add docs/adr/0030-parol-ozgarsa-boshqa-kirishlar-toxtaydi.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md
git commit -m "ADR-0030: a password change ends the account's other sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
