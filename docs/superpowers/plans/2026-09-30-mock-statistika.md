# Mock Exam Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, per mock exam, how much money came in, who registered (bot vs admin, DaF vs not), how people paid, which levels and time slots they chose, and whether results reached them — plus paid count and revenue columns on the exams list.

**Architecture:** A pure function `summarizeMockExam` (server) holds every definition; a thin `MockExamStatsService` loads one exam's live participants and feeds it; `GET /mock-exams/:id/stats` exposes it. Registration channel becomes an explicit NOT NULL column `registeredVia` written by both creators and backfilled in the migration (ADR-0054). The client renders the block on the exam's «Umumiy» tab and two new list columns.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL) + Jest on the server; Next.js 16 + React 19 + Vitest on the client.

## Global Constraints

- Work only in the worktree `/Users/a1111/Desktop/daf-erp-system/.worktrees/mock-statistika` (branch `feat/mock-statistika`). Never commit from the main checkout.
- Never run `prisma migrate`/`db execute` against the shared dev DB. The worktree has no `server/.env`; pass `DATABASE_URL` explicitly (throwaway DB only).
- Every screen string is Latin-script Uzbek. No English words on screen.
- Commit messages, PR text and new code comments are English. ADR and CONTEXT.md entries are Uzbek.
- Server: run `npx prettier --write` on every touched `.ts`. Client: never run prettier; match the surrounding style by hand.
- Money is integer so'm. A registration's fee is `feeAmount ?? exam.price` (helper `effectiveMockFee`).
- Only live rows count: `deletedAt: null` on participants and exams.
- Out-of-scope exam reads as 404 `Mock imtihon topilmadi`, same as `findOne`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

Server (`server/`):
- `prisma/schema.prisma` — enum `MockRegistrationChannel`, column `MockExamParticipant.registeredVia`.
- `prisma/migrations/20260930120000_mock_participant_registered_via/migration.sql` — create, backfill, NOT NULL.
- `src/mock-exams/mock-exam-participants.service.ts` — `addManual` writes `ADMIN`.
- `src/telegram/scenes/mock-exam-registration.scene.ts` — bot writes `BOT`.
- `src/mock-exams/mock-exam-pricing.util.ts` — `effectiveMockFee`.
- `src/mock-exams/mock-results-audience.ts` — `inResultsAudience` (in-memory twin of `RESULTS_AUDIENCE`).
- `src/mock-exams/mock-exam-stats.ts` — NEW pure `summarizeMockExam` + types.
- `src/mock-exams/mock-exam-stats.service.ts` — NEW `getStats`, `paidTotals`.
- `src/mock-exams/mock-exams.controller.ts` — `GET :id/stats`.
- `src/mock-exams/mock-exams.service.ts` — `list()` adds `paidCount`/`revenue`; `revenueSummary` uses the helper.
- `src/mock-exams/mock-exams.module.ts` — provider.

Client (`client/src/`):
- `components/mock-exams/exam-detail-types.ts` — `MockExamStats`, `MockStatsMethod`.
- `components/mock-exams/mock-exam-stats.ts` — NEW label/hint helpers (+ `.test.ts`).
- `components/mock-exams/mock-kpi-card.tsx` — NEW, moved out of `mock-exams-client.tsx`.
- `components/mock-exams/exam-stats-panel.tsx` — NEW block.
- `components/mock-exams/exam-overview-tab.tsx` — renders the block on top.
- `components/mock-exams/mock-exams-client.tsx` — two columns, imports `MockKpiCard`.
- `hooks/use-mock-exams-board.ts` — `MockExamRow.paidCount?`, `revenue?`.

Docs: `docs/adr/0054-mock-royxat-manbasi-qatorda.md`, `docs/adr/README.md`, `CONTEXT.md`.

---

### Task 1: Registration channel column

**Files:**
- Modify: `server/prisma/schema.prisma` (enum near `MockExamStatus` ~l.885; field in `MockExamParticipant` after `registeredAt` ~l.1083)
- Create: `server/prisma/migrations/20260930120000_mock_participant_registered_via/migration.sql`
- Modify: `server/src/mock-exams/mock-exam-participants.service.ts:261-275`
- Modify: `server/src/telegram/scenes/mock-exam-registration.scene.ts:708-726`
- Test: `server/src/mock-exams/mock-exam-participants.service.spec.ts`, `server/src/telegram/scenes/mock-exam-registration.scene.spec.ts`

**Interfaces:**
- Produces: Prisma enum `MockRegistrationChannel { BOT, ADMIN }`; required field `MockExamParticipant.registeredVia`.

- [ ] **Step 1: Failing specs.** In `mock-exam-participants.service.spec.ts`, inside `describe('addManual')`, after the outsider test add:

```ts
    it('records that a staff member added the participant', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        id: 'e1',
        status: MockExamStatus.REGISTRATION_OPEN,
      });
      prisma.student.findFirst.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([{ next: BigInt(10501) }]);
      prisma.mockExamParticipant.create.mockResolvedValue({
        id: 'p2',
        publicId: 10501,
        paid: false,
      });

      await service.addManual(
        'e1',
        { firstName: 'Aziz', lastName: 'Karimov', phone: '901234567' },
        1001,
        1,
        null,
      );

      const callArg = prisma.mockExamParticipant.create.mock.calls[0][0];
      expect(callArg.data.registeredVia).toBe('ADMIN');
    });
```

In `mock-exam-registration.scene.spec.ts`, next to the other `buildFinalizeEnv` tests add:

```ts
  it('records the registration as coming through the bot', async () => {
    const { prisma, scene } = buildFinalizeEnv({});
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    const { data } = prisma.mockExamParticipant.create.mock.calls[0][0];
    expect(data.registeredVia).toBe('BOT');
  });
```

- [ ] **Step 2: Run, expect FAIL** (`registeredVia` undefined):
`cd server && npx jest src/mock-exams/mock-exam-participants.service.spec.ts src/telegram/scenes/mock-exam-registration.scene.spec.ts -t "staff member added|through the bot"`

- [ ] **Step 3: Schema.** After `enum MockExamStatus { … }` add:

```prisma
// How a mock registration came in. The two creators write it themselves: the
// Telegram bot scene (BOT) and the admin «Qo'lda qo'shish» (ADMIN). ADR-0054.
enum MockRegistrationChannel {
  BOT
  ADMIN
}
```

In `MockExamParticipant`, right after `registeredAt DateTime @default(now())`:

```prisma
  // Where this registration came from. No default on purpose: every writer
  // states it, so the statistics never infer it from `telegramFirstName`.
  registeredVia MockRegistrationChannel
```

- [ ] **Step 4: Writers.** `addManual` create data gets `registeredVia: MockRegistrationChannel.ADMIN,` (import `MockRegistrationChannel` from `@prisma/client`). The bot scene create data gets `registeredVia: MockRegistrationChannel.BOT,` (same import).

- [ ] **Step 5: Migration file** `server/prisma/migrations/20260930120000_mock_participant_registered_via/migration.sql`:

```sql
-- Where a mock registration came from: the Telegram bot or an admin's
-- «Qo'lda qo'shish». Stored on the row so statistics never infer it (ADR-0054).
CREATE TYPE "MockRegistrationChannel" AS ENUM ('BOT', 'ADMIN');

ALTER TABLE "MockExamParticipant" ADD COLUMN "registeredVia" "MockRegistrationChannel";

-- 1) Added by staff: the participant's CREATE history row names its author.
UPDATE "MockExamParticipant" p
SET "registeredVia" = 'ADMIN'
WHERE EXISTS (
  SELECT 1
  FROM "EntityHistory" h
  WHERE h."entityType" = 'MockExamParticipant'
    AND h."entityId" = p."id"
    AND h."action" = 'CREATE'
    AND h."changedById" IS NOT NULL
);

-- 2) The bot always stores the sender's Telegram first name; the admin form
--    has no such field. (Prod 30.09: 111 bot rows, 50 of them with no history.)
UPDATE "MockExamParticipant"
SET "registeredVia" = 'BOT'
WHERE "registeredVia" IS NULL
  AND "telegramFirstName" IS NOT NULL;

-- 3) Anything left came through the admin form.
UPDATE "MockExamParticipant"
SET "registeredVia" = 'ADMIN'
WHERE "registeredVia" IS NULL;

ALTER TABLE "MockExamParticipant" ALTER COLUMN "registeredVia" SET NOT NULL;
```

- [ ] **Step 6: Regenerate + run specs, expect PASS:** `cd server && npx prisma generate && npx jest src/mock-exams src/telegram/scenes/mock-exam-registration.scene.spec.ts`

- [ ] **Step 7: Prove the migration on a throwaway DB** (container `daf-postgres`, never the shared dev DB):
  1. `docker exec daf-postgres createdb -U daf_user mockstat_tmp`; build `TMP_URL` in-shell from `docker exec daf-postgres printenv POSTGRES_PASSWORD` (never echo it), host `127.0.0.1:5433`.
  2. Move the new migration dir aside, `DATABASE_URL=$TMP_URL npx prisma migrate deploy`. On the two known stops insert `Company` 1001 / `Branch` 1 (companyId 1001), `migrate resolve --rolled-back <name>`, deploy again.
  3. Insert a `MockExamSection`, a `MockExam` (companyId 1001, branchId 1) and four participants: A with a CREATE history row having `changedById` (any existing `User` id, or insert one), B with `telegramFirstName` and a CREATE history row without author, C with `telegramFirstName` and no history, D with neither.
  4. Move the migration back, `migrate deploy` again. Expect `registeredVia`: A=ADMIN, B=BOT, C=BOT, D=ADMIN, and an insert without `registeredVia` failing with a NOT NULL violation.
  5. `DATABASE_URL=$TMP_URL npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` prints no statements (schema and migration agree).
  6. `docker exec daf-postgres dropdb -U daf_user mockstat_tmp`.

- [ ] **Step 8: Prettier + commit**

```bash
cd server && npx prettier --write src/mock-exams/mock-exam-participants.service.ts src/mock-exams/mock-exam-participants.service.spec.ts src/telegram/scenes/mock-exam-registration.scene.ts src/telegram/scenes/mock-exam-registration.scene.spec.ts
cd .. && git add server/prisma server/src/mock-exams/mock-exam-participants.service.ts server/src/mock-exams/mock-exam-participants.service.spec.ts server/src/telegram/scenes/mock-exam-registration.scene.ts server/src/telegram/scenes/mock-exam-registration.scene.spec.ts
git commit -m "feat(mock): record whether a registration came from the bot or an admin"
```

### Task 2: One fee rule and an in-memory results audience

**Files:**
- Modify: `server/src/mock-exams/mock-exam-pricing.util.ts` (append), `server/src/mock-exams/mock-results-audience.ts` (append), `server/src/mock-exams/mock-exams.service.ts:88-91`
- Test: `server/src/mock-exams/mock-exam-pricing.util.spec.ts`, `server/src/mock-exams/mock-results-audience.spec.ts`

**Interfaces:**
- Produces: `effectiveMockFee(feeAmount: number | null, examPrice: number): number`; `inResultsAudience(paid: boolean, feeAmount: number | null, examPrice: number): boolean`.

- [ ] **Step 1: Failing specs.** Append to `mock-exam-pricing.util.spec.ts` (add `effectiveMockFee` to its import):

```ts
describe('effectiveMockFee', () => {
  it('reads the fee frozen at registration', () => {
    expect(effectiveMockFee(45000, 55000)).toBe(45000);
  });

  it('keeps a frozen fee of 0 (free for a DaF student)', () => {
    expect(effectiveMockFee(0, 55000)).toBe(0);
  });

  it("falls back to the exam's price on a row from before fees were frozen", () => {
    expect(effectiveMockFee(null, 55000)).toBe(55000);
  });
});
```

In `mock-results-audience.spec.ts` import `inResultsAudience` too and make the `it.each` body assert both:

```ts
  ])('%s', (_name, r, expected) => {
    expect(inAudience(r)).toBe(expected);
    expect(inResultsAudience(r.paid, r.feeAmount, r.exam.price)).toBe(
      expected,
    );
  });
```

- [ ] **Step 2: Run, expect FAIL** (not exported): `cd server && npx jest src/mock-exams/mock-exam-pricing.util.spec.ts src/mock-exams/mock-results-audience.spec.ts`

- [ ] **Step 3: Implement.** Append to `mock-exam-pricing.util.ts`:

```ts
/**
 * What one registration costs: the fee frozen at registration, or, for a row
 * from before fees were frozen, the exam's current price. Every total (the
 * revenue card, the exams list, the statistics block) reads it here so they
 * cannot drift apart.
 */
export function effectiveMockFee(
  feeAmount: number | null,
  examPrice: number,
): number {
  return feeAmount ?? examPrice;
}
```

Append to `mock-results-audience.ts`:

```ts
/**
 * `RESULTS_AUDIENCE` for rows already in memory (the statistics block). The
 * spec checks the two against each other case by case.
 */
export function inResultsAudience(
  paid: boolean,
  feeAmount: number | null,
  examPrice: number,
): boolean {
  return paid || feeAmount === 0 || (feeAmount === null && examPrice === 0);
}
```

In `mock-exams.service.ts` `revenueSummary`, replace the reducer body with `(sum, p) => sum + effectiveMockFee(p.feeAmount, p.exam.price),` and import `effectiveMockFee` from `./mock-exam-pricing.util`.

- [ ] **Step 4: Run, expect PASS:** `cd server && npx jest src/mock-exams`

- [ ] **Step 5: Prettier + commit**

```bash
cd server && npx prettier --write src/mock-exams/mock-exam-pricing.util.ts src/mock-exams/mock-exam-pricing.util.spec.ts src/mock-exams/mock-results-audience.ts src/mock-exams/mock-results-audience.spec.ts src/mock-exams/mock-exams.service.ts
cd .. && git add server/src/mock-exams && git commit -m "refactor(mock): one fee rule and an in-memory results audience"
```

### Task 3: `summarizeMockExam`

**Files:**
- Create: `server/src/mock-exams/mock-exam-stats.ts`
- Test: `server/src/mock-exams/mock-exam-stats.spec.ts`

**Interfaces:**
- Consumes: `effectiveMockFee`, `inResultsAudience` (Task 2); `MockRegistrationChannel` (Task 1).
- Produces:
  - `type MockStatsMethod = PaymentMethod | 'BALANCE' | 'UNKNOWN'`
  - `interface StatsExam { price: number; offeredLevels: string[]; examTimes: string[]; announcedAt: Date | null }`
  - `interface StatsParticipant { id; registeredVia; studentId; convertedAt; feeAmount; paid; paymentMethod; formData; level; examTime; telegramChatId; resultSentAt; resultSendError }`
  - `interface MockExamStats` (shape below)
  - `summarizeMockExam(exam: StatsExam, rows: StatsParticipant[], paidFromBalance: ReadonlySet<string>): MockExamStats`

- [ ] **Step 1: Failing spec** `mock-exam-stats.spec.ts`:

```ts
import { MockRegistrationChannel, PaymentMethod } from '@prisma/client';
import {
  StatsExam,
  StatsParticipant,
  summarizeMockExam,
} from './mock-exam-stats';

const exam = (over: Partial<StatsExam> = {}): StatsExam => ({
  price: 55000,
  offeredLevels: ['A1', 'A2', 'B1', 'B2'],
  examTimes: ['09:00', '13:00'],
  announcedAt: null,
  ...over,
});

let seq = 0;
const row = (over: Partial<StatsParticipant> = {}): StatsParticipant => ({
  id: `p${++seq}`,
  registeredVia: MockRegistrationChannel.BOT,
  studentId: null,
  convertedAt: null,
  feeAmount: 55000,
  paid: false,
  paymentMethod: null,
  formData: {},
  level: 'B1',
  examTime: '09:00',
  telegramChatId: '555',
  resultSentAt: null,
  resultSendError: null,
  ...over,
});

const none = new Set<string>();

describe('summarizeMockExam', () => {
  it('splits registrations by channel and by DaF', () => {
    const s = summarizeMockExam(
      exam(),
      [
        row({ studentId: 10050 }),
        row({ registeredVia: MockRegistrationChannel.ADMIN }),
        row({
          registeredVia: MockRegistrationChannel.ADMIN,
          studentId: 10900,
          convertedAt: new Date('2026-08-02T10:00:00Z'),
        }),
      ],
      none,
    );

    expect(s.registered).toBe(3);
    expect(s.channel).toEqual({ bot: 1, admin: 2 });
    // A participant converted AFTER registering was not a DaF student then.
    expect(s.daf).toEqual({ student: 1, outsider: 2, converted: 1 });
  });

  it('counts money by the frozen fee, the old price fallback and cash intent', () => {
    const s = summarizeMockExam(
      exam(),
      [
        row({ paid: true, feeAmount: 45000 }),
        row({ paid: true, feeAmount: null }),
        row({ feeAmount: 55000, formData: { __payIntent: 'CASH' } }),
        row({ feeAmount: 55000 }),
        row({ feeAmount: 0 }),
      ],
      none,
    );

    expect(s.money).toEqual({
      paidCount: 2,
      paidSum: 100000,
      unpaidCount: 2,
      unpaidSum: 110000,
      cashIntentCount: 1,
      freeCount: 1,
    });
  });

  it('lists payment methods in a fixed order and never guesses a missing one', () => {
    const balancePaid = row({ paid: true, feeAmount: 30000 });
    const s = summarizeMockExam(
      exam(),
      [
        row({ paid: true, paymentMethod: PaymentMethod.CLICK, feeAmount: 45000 }),
        row({ paid: true, paymentMethod: PaymentMethod.CASH }),
        row({ paid: true, paymentMethod: PaymentMethod.CASH }),
        balancePaid,
        row({ paid: true, feeAmount: 40000 }),
      ],
      new Set([balancePaid.id]),
    );

    expect(s.methods).toEqual([
      { method: 'CASH', count: 2, sum: 110000 },
      { method: 'CLICK', count: 1, sum: 45000 },
      { method: 'BALANCE', count: 1, sum: 30000 },
      { method: 'UNKNOWN', count: 1, sum: 40000 },
    ]);
  });

  it("orders levels as offered, then others, then «no level»", () => {
    const s = summarizeMockExam(
      exam({ offeredLevels: ['A1', 'B1'] }),
      [
        row({ level: 'B1', paid: true }),
        row({ level: 'B1' }),
        row({ level: 'C1' }),
        row({ level: null }),
        row({ level: 'A2' }),
      ],
      none,
    );

    expect(s.levels).toEqual([
      { level: 'A1', registered: 0, paid: 0 },
      { level: 'B1', registered: 2, paid: 1 },
      { level: 'A2', registered: 1, paid: 0 },
      { level: 'C1', registered: 1, paid: 0 },
      { level: null, registered: 1, paid: 0 },
    ]);
  });

  it('orders time slots as offered and adds «not chosen» only when present', () => {
    const s = summarizeMockExam(
      exam(),
      [row({ examTime: '13:00' }), row({ examTime: '13:00' })],
      none,
    );

    expect(s.times).toEqual([
      { time: '09:00', registered: 0 },
      { time: '13:00', registered: 2 },
    ]);
  });

  it('has no results figures before the results are announced', () => {
    expect(summarizeMockExam(exam(), [row()], none).results).toBeNull();
  });

  it('splits the results audience into delivered, no Telegram, failed and pending', () => {
    const sent = new Date('2026-08-03T10:00:00Z');
    const s = summarizeMockExam(
      exam({ announcedAt: sent }),
      [
        row({ paid: true, resultSentAt: sent }),
        row({ paid: true, telegramChatId: null }),
        row({ paid: true, resultSendError: 'Forbidden: bot was blocked' }),
        row({ paid: true }),
        // Unpaid: sent before the paid-only rule, still not in the audience.
        row({ resultSentAt: sent }),
        // Owes nothing: in the audience although unpaid.
        row({ feeAmount: 0, telegramChatId: null }),
      ],
      none,
    );

    expect(s.results).toEqual({
      audience: 5,
      delivered: 1,
      noTelegram: 2,
      failed: 1,
      pending: 1,
    });
  });

  it('answers zeros for an exam nobody registered for', () => {
    const s = summarizeMockExam(exam(), [], none);

    expect(s.registered).toBe(0);
    expect(s.methods).toEqual([]);
    expect(s.levels.map((l) => l.registered)).toEqual([0, 0, 0, 0]);
    expect(s.times).toEqual([
      { time: '09:00', registered: 0 },
      { time: '13:00', registered: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing): `cd server && npx jest src/mock-exams/mock-exam-stats.spec.ts`

- [ ] **Step 3: Implement** `mock-exam-stats.ts`:

```ts
import { MockRegistrationChannel, PaymentMethod, Prisma } from '@prisma/client';
import { effectiveMockFee } from './mock-exam-pricing.util';
import { inResultsAudience } from './mock-results-audience';

/**
 * The statistics block on a mock exam's «Umumiy» tab (CEO, 2026-09-30):
 * money, where registrations came from, DaF or not, payment method, levels,
 * time slots, and whether results reached people. Every definition lives
 * here, next to its spec.
 */

/**
 * How a paid registration was paid. `BALANCE` is a pre-2026-08 deduction from
 * a student's lesson balance; `UNKNOWN` is a desk payment accepted before the
 * method was stored (ADR-0046). Nothing is guessed.
 */
export type MockStatsMethod = PaymentMethod | 'BALANCE' | 'UNKNOWN';

const METHOD_ORDER: MockStatsMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CLICK,
  PaymentMethod.PAYME,
  PaymentMethod.UZUM,
  PaymentMethod.TRANSFER,
  'BALANCE',
  'UNKNOWN',
];

export interface StatsExam {
  price: number;
  offeredLevels: string[];
  examTimes: string[];
  announcedAt: Date | null;
}

export interface StatsParticipant {
  id: string;
  registeredVia: MockRegistrationChannel;
  studentId: number | null;
  convertedAt: Date | null;
  feeAmount: number | null;
  paid: boolean;
  paymentMethod: PaymentMethod | null;
  formData: Prisma.JsonValue;
  level: string | null;
  examTime: string | null;
  telegramChatId: string | null;
  resultSentAt: Date | null;
  resultSendError: string | null;
}

export interface MockExamStats {
  registered: number;
  channel: { bot: number; admin: number };
  /** DaF = matched a student card at registration; a later conversion is not. */
  daf: { student: number; outsider: number; converted: number };
  money: {
    paidCount: number;
    paidSum: number;
    unpaidCount: number;
    unpaidSum: number;
    cashIntentCount: number;
    freeCount: number;
  };
  methods: { method: MockStatsMethod; count: number; sum: number }[];
  levels: { level: string | null; registered: number; paid: number }[];
  times: { time: string | null; registered: number }[];
  /** Null until the results are announced; the four counts split `audience`. */
  results: {
    audience: number;
    delivered: number;
    noTelegram: number;
    failed: number;
    pending: number;
  } | null;
}

function hasCashIntent(formData: Prisma.JsonValue): boolean {
  return (
    typeof formData === 'object' &&
    formData !== null &&
    !Array.isArray(formData) &&
    formData.__payIntent === 'CASH'
  );
}

/**
 * The exam's own values first (even with nobody on them), then values only
 * the rows carry, sorted, then the null bucket when anyone has none.
 */
function bucketKeys(
  offered: string[],
  values: (string | null)[],
): (string | null)[] {
  const extra = [
    ...new Set(
      values.filter((v): v is string => v !== null && !offered.includes(v)),
    ),
  ].sort();
  const keys: (string | null)[] = [...offered, ...extra];
  if (values.includes(null)) keys.push(null);
  return keys;
}

function summarizeResults(examPrice: number, rows: StatsParticipant[]) {
  const audience = rows.filter((p) =>
    inResultsAudience(p.paid, p.feeAmount, examPrice),
  );
  const notSent = audience.filter((p) => p.resultSentAt === null);
  const withChat = notSent.filter((p) => p.telegramChatId !== null);
  const failed = withChat.filter((p) => p.resultSendError !== null).length;
  return {
    audience: audience.length,
    delivered: audience.length - notSent.length,
    noTelegram: notSent.length - withChat.length,
    failed,
    pending: withChat.length - failed,
  };
}

export function summarizeMockExam(
  exam: StatsExam,
  rows: StatsParticipant[],
  paidFromBalance: ReadonlySet<string>,
): MockExamStats {
  const fee = (p: StatsParticipant) =>
    effectiveMockFee(p.feeAmount, exam.price);
  const paid = rows.filter((p) => p.paid);
  const unpaid = rows.filter((p) => !p.paid && fee(p) > 0);
  const dafStudents = rows.filter(
    (p) => p.studentId !== null && p.convertedAt === null,
  ).length;

  const byMethod = new Map<MockStatsMethod, { count: number; sum: number }>();
  for (const p of paid) {
    const method: MockStatsMethod =
      p.paymentMethod ?? (paidFromBalance.has(p.id) ? 'BALANCE' : 'UNKNOWN');
    const total = byMethod.get(method) ?? { count: 0, sum: 0 };
    total.count += 1;
    total.sum += fee(p);
    byMethod.set(method, total);
  }

  return {
    registered: rows.length,
    channel: {
      bot: rows.filter((p) => p.registeredVia === MockRegistrationChannel.BOT)
        .length,
      admin: rows.filter(
        (p) => p.registeredVia === MockRegistrationChannel.ADMIN,
      ).length,
    },
    daf: {
      student: dafStudents,
      outsider: rows.length - dafStudents,
      converted: rows.filter((p) => p.convertedAt !== null).length,
    },
    money: {
      paidCount: paid.length,
      paidSum: paid.reduce((sum, p) => sum + fee(p), 0),
      unpaidCount: unpaid.length,
      unpaidSum: unpaid.reduce((sum, p) => sum + fee(p), 0),
      cashIntentCount: unpaid.filter((p) => hasCashIntent(p.formData)).length,
      freeCount: rows.filter((p) => !p.paid && fee(p) === 0).length,
    },
    methods: METHOD_ORDER.flatMap((method) => {
      const total = byMethod.get(method);
      return total ? [{ method, ...total }] : [];
    }),
    levels: bucketKeys(
      exam.offeredLevels,
      rows.map((p) => p.level),
    ).map((level) => {
      const onLevel = rows.filter((p) => p.level === level);
      return {
        level,
        registered: onLevel.length,
        paid: onLevel.filter((p) => p.paid).length,
      };
    }),
    times: bucketKeys(
      exam.examTimes,
      rows.map((p) => p.examTime),
    ).map((time) => ({
      time,
      registered: rows.filter((p) => p.examTime === time).length,
    })),
    results:
      exam.announcedAt === null ? null : summarizeResults(exam.price, rows),
  };
}
```

- [ ] **Step 4: Run, expect PASS:** `cd server && npx jest src/mock-exams/mock-exam-stats.spec.ts`

- [ ] **Step 5: Prettier + commit**

```bash
cd server && npx prettier --write src/mock-exams/mock-exam-stats.ts src/mock-exams/mock-exam-stats.spec.ts
cd .. && git add server/src/mock-exams/mock-exam-stats.ts server/src/mock-exams/mock-exam-stats.spec.ts
git commit -m "feat(mock): one place that defines every mock exam statistic"
```

### Task 4: Stats service, route and list totals

**Files:**
- Create: `server/src/mock-exams/mock-exam-stats.service.ts`, `server/src/mock-exams/mock-exam-stats.service.spec.ts`
- Modify: `server/src/mock-exams/mock-exams.controller.ts`, `server/src/mock-exams/mock-exams.controller.spec.ts`, `server/src/mock-exams/mock-exams.module.ts`, `server/src/mock-exams/mock-exams.service.ts` (constructor + `list`), `server/src/mock-exams/mock-exams.service.spec.ts`

**Interfaces:**
- Consumes: `summarizeMockExam`, `MockExamStats` (Task 3); `effectiveMockFee` (Task 2); `MockExamBillingService.paidFromBalanceIds(ids: string[]): Promise<Set<string>>`.
- Produces: `MockExamStatsService.getStats(examId: string, companyId: number, scope: ReportBranchIds): Promise<MockExamStats>`; `MockExamStatsService.paidTotals(exams: { id: string; price: number }[]): Promise<Map<string, ExamPaidTotals>>`; `GET /mock-exams/:id/stats`; `list()` rows gain `paidCount: number`, `revenue: number`.

- [ ] **Step 1: Failing service spec** `mock-exam-stats.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MockExamBillingService } from './mock-exam-billing.service';
import { MockExamStatsService } from './mock-exam-stats.service';

describe('MockExamStatsService', () => {
  let service: MockExamStatsService;
  let prisma: any;
  let billing: { paidFromBalanceIds: jest.Mock };

  beforeEach(async () => {
    prisma = {
      mockExam: { findFirst: jest.fn() },
      mockExamParticipant: { findMany: jest.fn().mockResolvedValue([]) },
    };
    billing = { paidFromBalanceIds: jest.fn().mockResolvedValue(new Set()) };
    const module = await Test.createTestingModule({
      providers: [
        MockExamStatsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MockExamBillingService, useValue: billing },
      ],
    }).compile();
    service = module.get(MockExamStatsService);
  });

  const participant = (over: Record<string, unknown>) => ({
    id: 'p',
    registeredVia: 'BOT',
    studentId: null,
    convertedAt: null,
    feeAmount: 55000,
    paid: false,
    paymentMethod: null,
    formData: {},
    level: null,
    examTime: null,
    telegramChatId: null,
    resultSentAt: null,
    resultSendError: null,
    ...over,
  });

  describe('getStats', () => {
    it("looks the exam up inside the caller's company and branches", async () => {
      prisma.mockExam.findFirst.mockResolvedValue(null);

      await expect(service.getStats('e1', 1001, [2])).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.mockExam.findFirst.mock.calls[0][0].where).toEqual({
        id: 'e1',
        deletedAt: null,
        companyId: 1001,
        branchId: { in: [2] },
      });
      expect(prisma.mockExamParticipant.findMany).not.toHaveBeenCalled();
    });

    it('counts live participants and asks about balance only for method-less payments', async () => {
      prisma.mockExam.findFirst.mockResolvedValue({
        price: 55000,
        offeredLevels: [],
        examTimes: [],
        announcedAt: null,
      });
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        participant({ id: 'p1', paid: true, paymentMethod: 'CASH' }),
        participant({ id: 'p2', paid: true }),
        participant({ id: 'p3' }),
      ]);
      billing.paidFromBalanceIds.mockResolvedValue(new Set(['p2']));

      const stats = await service.getStats('e1', 1001, null);

      expect(prisma.mockExamParticipant.findMany.mock.calls[0][0].where).toEqual(
        { examId: 'e1', deletedAt: null },
      );
      expect(billing.paidFromBalanceIds).toHaveBeenCalledWith(['p2']);
      expect(stats.methods).toEqual([
        { method: 'CASH', count: 1, sum: 55000 },
        { method: 'BALANCE', count: 1, sum: 55000 },
      ]);
      expect(stats.money.unpaidCount).toBe(1);
    });
  });

  describe('paidTotals', () => {
    it('sums paid registrations per exam with the old-price fallback', async () => {
      prisma.mockExamParticipant.findMany.mockResolvedValue([
        { examId: 'e1', feeAmount: 45000 },
        { examId: 'e1', feeAmount: null },
        { examId: 'e2', feeAmount: 40000 },
      ]);

      const totals = await service.paidTotals([
        { id: 'e1', price: 55000 },
        { id: 'e2', price: 40000 },
        { id: 'e3', price: 40000 },
      ]);

      expect(prisma.mockExamParticipant.findMany.mock.calls[0][0].where).toEqual(
        { examId: { in: ['e1', 'e2', 'e3'] }, deletedAt: null, paid: true },
      );
      expect(totals.get('e1')).toEqual({ paidCount: 2, revenue: 100000 });
      expect(totals.get('e2')).toEqual({ paidCount: 1, revenue: 40000 });
      expect(totals.get('e3')).toEqual({ paidCount: 0, revenue: 0 });
    });

    it('does not query for an empty list', async () => {
      const totals = await service.paidTotals([]);

      expect(totals.size).toBe(0);
      expect(prisma.mockExamParticipant.findMany).not.toHaveBeenCalled();
    });
  });
});
```

Controller spec addition (`mock-exams.controller.spec.ts`):

```ts
  it('lets the statistics route inherit those roles', () => {
    expect(
      reflector.get<string[]>(ROLES_KEY, MockExamsController.prototype.stats),
    ).toBeUndefined();
  });
```

`mock-exams.service.spec.ts`: add `import { MockExamStatsService } from './mock-exam-stats.service';`, a `statsService` mock `{ paidTotals: jest.fn().mockResolvedValue(new Map()) }` provided as `{ provide: MockExamStatsService, useValue: statsService }`, `mockExam.findMany: jest.fn().mockResolvedValue([])` in the prisma mock, and:

```ts
  describe('list', () => {
    it('adds paid count and revenue to every exam', async () => {
      const base = {
        title: 'Mock',
        description: null,
        status: MockExamStatus.REGISTRATION_OPEN,
        sectionId: 's1',
        branchId: 1,
        examDate: null,
        registrationDeadline: null,
        durationMinutes: null,
        maxScore: 100,
        passingScore: null,
        price: 55000,
        studentPrice: null,
        offeredLevels: [],
        examTimes: [],
        formFields: [],
        botStartPayload: 'x',
        createdAt: new Date(),
        updatedAt: new Date(),
        section: { id: 's1', name: 'Umumiy', color: null },
        _count: { participants: 3 },
      };
      prisma.mockExam.findMany.mockResolvedValue([
        { ...base, id: 'e1' },
        { ...base, id: 'e2' },
      ]);
      statsService.paidTotals.mockResolvedValue(
        new Map([['e1', { paidCount: 2, revenue: 100000 }]]),
      );

      const rows = await service.list(1001, null);

      expect(rows[0]).toEqual(
        expect.objectContaining({ id: 'e1', paidCount: 2, revenue: 100000 }),
      );
      expect(rows[1]).toEqual(
        expect.objectContaining({ id: 'e2', paidCount: 0, revenue: 0 }),
      );
    });
  });
```

- [ ] **Step 2: Run, expect FAIL:** `cd server && npx jest src/mock-exams/mock-exam-stats.service.spec.ts src/mock-exams/mock-exams.controller.spec.ts src/mock-exams/mock-exams.service.spec.ts`

- [ ] **Step 3: Service** `mock-exam-stats.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
import { MockExamBillingService } from './mock-exam-billing.service';
import { effectiveMockFee } from './mock-exam-pricing.util';
import { MockExamStats, summarizeMockExam } from './mock-exam-stats';

export interface ExamPaidTotals {
  paidCount: number;
  revenue: number;
}

/**
 * Loads what `summarizeMockExam` counts. The exam is found exactly the way
 * `MockExamsService.findOne` finds it, so the block exists whenever the page
 * does, and an out-of-scope id reads as 404.
 */
@Injectable()
export class MockExamStatsService {
  constructor(
    private prisma: PrismaService,
    private billing: MockExamBillingService,
  ) {}

  async getStats(
    examId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<MockExamStats> {
    const exam = await this.prisma.mockExam.findFirst({
      where: {
        id: examId,
        deletedAt: null,
        companyId,
        ...branchIdWhere(scope),
      },
      select: {
        price: true,
        offeredLevels: true,
        examTimes: true,
        announcedAt: true,
      },
    });
    if (!exam) {
      throw new NotFoundException('Mock imtihon topilmadi');
    }

    const rows = await this.prisma.mockExamParticipant.findMany({
      where: { examId, deletedAt: null },
      select: {
        id: true,
        registeredVia: true,
        studentId: true,
        convertedAt: true,
        feeAmount: true,
        paid: true,
        paymentMethod: true,
        formData: true,
        level: true,
        examTime: true,
        telegramChatId: true,
        resultSentAt: true,
        resultSendError: true,
      },
    });

    // Only a paid row with no stored method can be an old balance payment.
    const fromBalance = await this.billing.paidFromBalanceIds(
      rows.filter((p) => p.paid && p.paymentMethod === null).map((p) => p.id),
    );
    return summarizeMockExam(exam, rows, fromBalance);
  }

  /**
   * Paid registrations and their money per exam, for the exams list. The same
   * rule as `MockExamsService.revenueSummary`, so the column adds up to the
   * card above it.
   */
  async paidTotals(
    exams: { id: string; price: number }[],
  ): Promise<Map<string, ExamPaidTotals>> {
    const totals = new Map<string, ExamPaidTotals>(
      exams.map((e) => [e.id, { paidCount: 0, revenue: 0 }]),
    );
    if (exams.length === 0) return totals;

    const priceOf = new Map(exams.map((e) => [e.id, e.price]));
    const paid = await this.prisma.mockExamParticipant.findMany({
      where: {
        examId: { in: exams.map((e) => e.id) },
        deletedAt: null,
        paid: true,
      },
      select: { examId: true, feeAmount: true },
    });
    for (const p of paid) {
      const total = totals.get(p.examId);
      if (!total) continue;
      total.paidCount += 1;
      total.revenue += effectiveMockFee(p.feeAmount, priceOf.get(p.examId) ?? 0);
    }
    return totals;
  }
}
```

- [ ] **Step 4: Wire it.**
  - `mock-exams.module.ts`: import `MockExamStatsService` and add it to `providers`.
  - `mock-exams.controller.ts`: import it, add `private readonly mockExamStatsService: MockExamStatsService` to the constructor, and after `findOne` add:

```ts
  @Get(':id/stats')
  stats(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamStatsService.getStats(id, companyId, scope);
  }
```

  - `mock-exams.service.ts`: constructor gains `private mockExamStats: MockExamStatsService` (import from `./mock-exam-stats.service`); `list()` becomes:

```ts
    const totals = await this.mockExamStats.paidTotals(exams);
    return exams.map((exam) => ({
      ...this.toSummary(exam),
      section: exam.section,
      ...(totals.get(exam.id) ?? { paidCount: 0, revenue: 0 }),
    }));
```

- [ ] **Step 5: Run, expect PASS:** `cd server && npx jest src/mock-exams src/common/auth/branch-route-policy.spec.ts` (the route takes `@BranchScope()`, so the manifest needs no entry).

- [ ] **Step 6: Prettier + commit**

```bash
cd server && npx prettier --write src/mock-exams/mock-exam-stats.service.ts src/mock-exams/mock-exam-stats.service.spec.ts src/mock-exams/mock-exams.controller.ts src/mock-exams/mock-exams.controller.spec.ts src/mock-exams/mock-exams.module.ts src/mock-exams/mock-exams.service.ts src/mock-exams/mock-exams.service.spec.ts
cd .. && git add server/src/mock-exams && git commit -m "feat(mock): statistics endpoint and paid totals on the exams list"
```

### Task 5: Client block and list columns

**Files:**
- Modify: `client/src/components/mock-exams/exam-detail-types.ts`, `client/src/hooks/use-mock-exams-board.ts`, `client/src/components/mock-exams/exam-overview-tab.tsx`, `client/src/components/mock-exams/mock-exams-client.tsx`
- Create: `client/src/components/mock-exams/mock-exam-stats.ts`, `client/src/components/mock-exams/mock-exam-stats.test.ts`, `client/src/components/mock-exams/mock-kpi-card.tsx`, `client/src/components/mock-exams/exam-stats-panel.tsx`

**Interfaces:**
- Consumes: `GET /mock-exams/:id/stats` → `MockExamStats` (Task 4 shape, JSON); `GET /mock-exams` rows with `paidCount`, `revenue`.
- Produces: `ExamStatsPanel({ examId })`, `MockKpiCard({ icon, label, value, hint? })`.

- [ ] **Step 1: Types.** Append to `exam-detail-types.ts`:

```ts
/** How a paid registration was paid (server `mock-exam-stats.ts`). */
export type MockStatsMethod =
  | "CASH"
  | "CLICK"
  | "PAYME"
  | "UZUM"
  | "TRANSFER"
  | "BALANCE"
  | "UNKNOWN";

/** `GET /mock-exams/:id/stats` — the «Umumiy» tab's statistics block. */
export interface MockExamStats {
  registered: number;
  channel: { bot: number; admin: number };
  daf: { student: number; outsider: number; converted: number };
  money: {
    paidCount: number;
    paidSum: number;
    unpaidCount: number;
    unpaidSum: number;
    cashIntentCount: number;
    freeCount: number;
  };
  methods: { method: MockStatsMethod; count: number; sum: number }[];
  levels: { level: string | null; registered: number; paid: number }[];
  times: { time: string | null; registered: number }[];
  results: {
    audience: number;
    delivered: number;
    noTelegram: number;
    failed: number;
    pending: number;
  } | null;
}
```

In `use-mock-exams-board.ts` `MockExamRow` add:

```ts
  /** Paid registrations and their money (list only; a new exam has none yet). */
  paidCount?: number;
  revenue?: number;
```

- [ ] **Step 2: Failing test** `mock-exam-stats.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MockExamStats } from "./exam-detail-types";
import {
  barPercent,
  channelHint,
  dafHint,
  hasLevels,
  hasTimeChoice,
  levelLabel,
  paidHint,
  resultRows,
  statsMethodLabel,
  timeLabel,
  unpaidHint,
} from "./mock-exam-stats";

const money = {
  paidCount: 48,
  paidSum: 2270000,
  unpaidCount: 21,
  unpaidSum: 1055000,
  cashIntentCount: 14,
  freeCount: 0,
};

describe("mock imtihon statistikasi yozuvlari", () => {
  it("to'lov turlarini o'zbekcha nomlaydi, yozilmaganini taxmin qilmaydi", () => {
    expect(statsMethodLabel("CASH")).toBe("Naqd");
    expect(statsMethodLabel("CLICK")).toBe("Click");
    expect(statsMethodLabel("TRANSFER")).toBe("O'tkazma");
    expect(statsMethodLabel("BALANCE")).toBe("Balansdan (eski)");
    expect(statsMethodLabel("UNKNOWN")).toBe("To'lov turi yozilmagan");
  });

  it("kartalar ostidagi qisqa yozuvlar", () => {
    expect(paidHint(money)).toBe("48 kishi to'lagan");
    expect(paidHint({ ...money, freeCount: 3 })).toBe(
      "48 kishi to'lagan · 3 bepul",
    );
    expect(unpaidHint(money)).toBe("21 kishi · 14 tasi naqd deydi");
    expect(unpaidHint({ ...money, cashIntentCount: 0 })).toBe("21 kishi");
    expect(channelHint({ bot: 58, admin: 11 })).toBe("Botdan 58 · Admin 11");
    expect(dafHint({ student: 49, outsider: 20, converted: 0 })).toBe(
      "DaF emas 20",
    );
    expect(dafHint({ student: 58, outsider: 14, converted: 1 })).toBe(
      "DaF emas 14 (1 tasi keyin o'quvchi bo'ldi)",
    );
  });

  it("darajasiz va vaqt tanlanmagan qatorlarni nomlaydi", () => {
    expect(levelLabel("B1")).toBe("B1");
    expect(levelLabel(null)).toBe("Darajasiz");
    expect(timeLabel("09:00")).toBe("09:00");
    expect(timeLabel(null)).toBe("Tanlanmagan");
  });

  it("daraja va vaqt kartasi faqat ma'nosi bo'lsa chiqadi", () => {
    const base = { levels: [], times: [] } as unknown as MockExamStats;
    expect(
      hasLevels({ ...base, levels: [{ level: null, registered: 5, paid: 2 }] }),
    ).toBe(false);
    expect(
      hasLevels({ ...base, levels: [{ level: "A1", registered: 0, paid: 0 }] }),
    ).toBe(true);
    expect(
      hasTimeChoice({ ...base, times: [{ time: "09:00", registered: 5 }] }),
    ).toBe(false);
    expect(
      hasTimeChoice({
        ...base,
        times: [
          { time: "09:00", registered: 5 },
          { time: "13:00", registered: 2 },
        ],
      }),
    ).toBe(true);
  });

  it("chiziq uzunligi eng ko'p yozilgan darajaga nisbatan", () => {
    expect(barPercent(43, 43)).toBe(100);
    expect(barPercent(12, 43)).toBe(28);
    expect(barPercent(0, 0)).toBe(0);
  });

  it("natija qatorlari: xato va kutilayotgan faqat bo'lsa", () => {
    expect(
      resultRows({
        audience: 61,
        delivered: 18,
        noTelegram: 43,
        failed: 0,
        pending: 0,
      }),
    ).toEqual([
      { label: "Natija olishi kerak", value: 61 },
      { label: "Telegramda yetib bordi", value: 18 },
      { label: "Telegram bog'lanmagan", value: 43 },
    ]);
    expect(
      resultRows({
        audience: 5,
        delivered: 1,
        noTelegram: 2,
        failed: 1,
        pending: 1,
      }).map((r) => r.label),
    ).toEqual([
      "Natija olishi kerak",
      "Telegramda yetib bordi",
      "Telegram bog'lanmagan",
      "Yuborib bo'lmadi",
      "Hali yuborilmagan",
    ]);
  });
});
```

- [ ] **Step 3: Run, expect FAIL:** `cd client && npx vitest --config vitest.config.mts run src/components/mock-exams/mock-exam-stats.test.ts`

- [ ] **Step 4: Helper** `mock-exam-stats.ts`:

```ts
import { MOCK_PAYMENT_METHOD_LABELS } from "./mock-payment";
import type { MockExamStats, MockStatsMethod } from "./exam-detail-types";

/**
 * Imtihonning «Umumiy» bo'limidagi statistika bloki uchun so'zlar. Raqamlar
 * serverdan tayyor keladi (`mock-exam-stats.ts`); bu yer faqat nomlaydi.
 */

const METHOD_LABELS: Record<MockStatsMethod, string> = {
  ...MOCK_PAYMENT_METHOD_LABELS,
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
  BALANCE: "Balansdan (eski)",
  UNKNOWN: "To'lov turi yozilmagan",
};

export function statsMethodLabel(method: MockStatsMethod): string {
  return METHOD_LABELS[method];
}

export function paidHint(m: MockExamStats["money"]): string {
  const base = `${m.paidCount} kishi to'lagan`;
  return m.freeCount > 0 ? `${base} · ${m.freeCount} bepul` : base;
}

export function unpaidHint(m: MockExamStats["money"]): string {
  const base = `${m.unpaidCount} kishi`;
  return m.cashIntentCount > 0
    ? `${base} · ${m.cashIntentCount} tasi naqd deydi`
    : base;
}

export function channelHint(c: MockExamStats["channel"]): string {
  return `Botdan ${c.bot} · Admin ${c.admin}`;
}

export function dafHint(d: MockExamStats["daf"]): string {
  const base = `DaF emas ${d.outsider}`;
  return d.converted > 0
    ? `${base} (${d.converted} tasi keyin o'quvchi bo'ldi)`
    : base;
}

export function levelLabel(level: string | null): string {
  return level ?? "Darajasiz";
}

export function timeLabel(time: string | null): string {
  return time ?? "Tanlanmagan";
}

/** Daraja kartasi faqat imtihonda daraja bo'lsa — yolg'iz «Darajasiz» hech narsa demaydi. */
export function hasLevels(s: MockExamStats): boolean {
  return s.levels.some((l) => l.level !== null);
}

/** Vaqt kartasi faqat solishtiradigan tanlov bo'lsa. */
export function hasTimeChoice(s: MockExamStats): boolean {
  return s.times.length > 1;
}

export function barPercent(value: number, max: number): number {
  return max > 0 ? Math.round((value / max) * 100) : 0;
}

export function resultRows(
  r: NonNullable<MockExamStats["results"]>,
): { label: string; value: number }[] {
  const rows = [
    { label: "Natija olishi kerak", value: r.audience },
    { label: "Telegramda yetib bordi", value: r.delivered },
    { label: "Telegram bog'lanmagan", value: r.noTelegram },
  ];
  if (r.failed > 0) rows.push({ label: "Yuborib bo'lmadi", value: r.failed });
  if (r.pending > 0) rows.push({ label: "Hali yuborilmagan", value: r.pending });
  return rows;
}
```

- [ ] **Step 5: Run, expect PASS** (same command as Step 3).

- [ ] **Step 6: `mock-kpi-card.tsx`** (moved from `mock-exams-client.tsx`, plus `hint`):

```tsx
import type { ReactNode } from "react";

/** Mock sahifalaridagi raqamli karta: belgi, nom, qiymat va ixtiyoriy izoh. */
export function MockKpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
```

In `mock-exams-client.tsx`: delete the local `KpiCard`, `import { MockKpiCard } from "./mock-kpi-card";`, rename the four usages to `MockKpiCard`. Add columns after «Ishtirokchilar»:

```tsx
                <TableHead className="w-24 text-right">To&apos;lagan</TableHead>
                <TableHead className="w-36 text-right">Tushum</TableHead>
```

and cells after the participants cell:

```tsx
                  <TableCell className="text-right tabular-nums">
                    {(e.paidCount ?? 0) > 0 ? (
                      <span className="font-medium">{e.paidCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {(e.revenue ?? 0) > 0 ? (
                      <span className="font-medium">
                        {formatPrice(e.revenue ?? 0)} so&apos;m
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
```

- [ ] **Step 7: `exam-stats-panel.tsx`:**

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GraduationCap, Hourglass, Users, Wallet } from "lucide-react";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MockKpiCard } from "./mock-kpi-card";
import type { MockExamStats } from "./exam-detail-types";
import {
  barPercent,
  channelHint,
  dafHint,
  hasLevels,
  hasTimeChoice,
  levelLabel,
  paidHint,
  resultRows,
  statsMethodLabel,
  timeLabel,
  unpaidHint,
} from "./mock-exam-stats";

/**
 * «Umumiy» bo'limining tepasidagi statistika (CEO, 30.09.2026). O'zi alohida
 * yuklanadi: xato bo'lsa ham pastdagi imtihon ma'lumotlari ishlayveradi.
 */
export function ExamStatsPanel({ examId }: { examId: string }) {
  const [stats, setStats] = useState<MockExamStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<MockExamStats>(`/mock-exams/${examId}/stats`)
      .then(({ data }) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [examId]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        Statistikani yuklab bo&apos;lmadi.
      </p>
    );
  }
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const maxLevel = Math.max(0, ...stats.levels.map((l) => l.registered));

  return (
    <section aria-label="Imtihon statistikasi" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MockKpiCard
          icon={<Wallet className="size-4" />}
          label="Tushgan pul"
          value={<Som value={stats.money.paidSum} />}
          hint={paidHint(stats.money)}
        />
        <MockKpiCard
          icon={<Hourglass className="size-4" />}
          label="To'lanmagan"
          value={<Som value={stats.money.unpaidSum} />}
          hint={unpaidHint(stats.money)}
        />
        <MockKpiCard
          icon={<Users className="size-4" />}
          label="Ro'yxatdan o'tgan"
          value={stats.registered}
          hint={channelHint(stats.channel)}
        />
        <MockKpiCard
          icon={<GraduationCap className="size-4" />}
          label="DaF o'quvchisi"
          value={stats.daf.student}
          hint={dafHint(stats.daf)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard title="To'lov usuli">
          {stats.methods.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hali to&apos;lov yo&apos;q</p>
          ) : (
            stats.methods.map((m) => (
              <Line
                key={m.method}
                label={statsMethodLabel(m.method)}
                value={`${m.count} · ${formatPrice(m.sum)}`}
              />
            ))
          )}
        </StatsCard>

        {hasLevels(stats) && (
          <StatsCard title="Darajalar" note="yozilgan / to'lagan">
            {stats.levels.map((l) => (
              <div key={l.level ?? "none"} className="flex flex-col gap-1">
                <Line
                  label={levelLabel(l.level)}
                  value={`${l.registered} / ${l.paid}`}
                />
                {l.level !== null && (
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${barPercent(l.registered, maxLevel)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </StatsCard>
        )}

        {hasTimeChoice(stats) && (
          <StatsCard title="Imtihon vaqti">
            {stats.times.map((t) => (
              <Line
                key={t.time ?? "none"}
                label={timeLabel(t.time)}
                value={`${t.registered} kishi`}
              />
            ))}
          </StatsCard>
        )}

        {stats.results && (
          <StatsCard title="Natija yetib borishi">
            {resultRows(stats.results).map((r) => (
              <Line key={r.label} label={r.label} value={`${r.value} kishi`} />
            ))}
          </StatsCard>
        )}
      </div>
    </section>
  );
}

function Som({ value }: { value: number }) {
  return (
    <span>
      {formatPrice(value)}{" "}
      <span className="text-xs text-muted-foreground">so&apos;m</span>
    </span>
  );
}

function StatsCard({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-semibold">
        {title}
        {note && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {note}
          </span>
        )}
      </h3>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 8: Overview tab.** In `exam-overview-tab.tsx` import `ExamStatsPanel` from `./exam-stats-panel` and wrap the returned grid:

```tsx
  return (
    <div className="flex flex-col gap-5">
      <ExamStatsPanel examId={exam.id} />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* existing two cards unchanged */}
      </div>
    </div>
  );
```

- [ ] **Step 9: Checks:** `cd client && npx vitest --config vitest.config.mts run src/components/mock-exams && npx tsc --noEmit && npx eslint src/components/mock-exams src/hooks/use-mock-exams-board.ts` — all clean. `git diff origin/main -- client/` shows only intended hunks (no reflow).

- [ ] **Step 10: Commit**

```bash
git add client/src && git commit -m "feat(mock): statistics block on the exam page and paid totals in the list"
```

### Task 6: Decision record and glossary

**Files:**
- Create: `docs/adr/0054-mock-royxat-manbasi-qatorda.md`
- Modify: `docs/adr/README.md` (one row), `CONTEXT.md` (Mock section)

- [ ] **Step 1:** Re-check the number: `git fetch origin && git ls-tree --name-only origin/main docs/adr/ | tail -3` and open PR branches; take the next free number (0054 on 30.09).
- [ ] **Step 2:** Write the ADR in Uzbek, Nygard format (Holati / Sana / Bog'liq / Kontekst / Qaror / Ko'rib chiqilgan muqobillar / Oqibatlari): the column, no default, both writers, the backfill rule with the prod evidence (213 rows, 102/111, 50 bot rows without history), rejected alternatives (infer from `telegramFirstName`; read `EntityHistory`; nullable or defaulted column), consequences (a third path must name itself; deploy window refusal).
- [ ] **Step 3:** README row: `| [0054](0054-mock-royxat-manbasi-qatorda.md) | Mock ro'yxati qayerdan kelgani (bot yoki admin) qatorning o'zida yoziladi | Qabul qilindi | 2026-09-30 |`.
- [ ] **Step 4:** CONTEXT.md, Mock section, two entries: **Ro'yxat manbasi** (`registeredVia`, ADR-0054) and **Imtihon statistikasi** (DaF definition, «To'lov turi yozilmagan», results split), each ending with its file path line.
- [ ] **Step 5:** `git add docs CONTEXT.md && git commit -m "docs(mock): ADR-0054 and glossary entries for the mock statistics"`

### Task 7: Verification

- [ ] **Server:** `cd server && npm test` (all suites), `npm run typecheck`, `npx eslint src/mock-exams src/telegram/scenes/mock-exam-registration.scene.ts`, `npm run build` — record exit codes.
- [ ] **Client:** `cd client && npm test`, `npx tsc --noEmit`, `npm run lint` (tail), `npm run build`.
- [ ] **Real numbers (prod, read-only):** a `server/scripts/_probe-mock-stats-check.ts` that loads the two live exams and their live participants, derives `registeredVia` with the migration's rule, runs `summarizeMockExam`, prints the JSON and saves it to the scratchpad. Expected (30.09 17:30): Sentabr registered 69, channel 58/11, DaF 49/20, paid 48 = 2 270 000, unpaid 21 = 1 055 000 with 14 cash intent, methods CASH 38 / CLICK 4 / PAYME 1 / UNKNOWN 5; August registered 72, channel 18/54, DaF 58/14 (1 converted), paid 61 = 1 860 000, results delivered 18. Numbers may have moved since (payments at the desk); explain any difference. Delete the script.
- [ ] **Browser:** mock API (scratchpad node server) serving the probe JSON for `/mock-exams/:id/stats`, a matching `/mock-exams/:id`, `/mock-exams`, `/mock-exams/revenue-summary`, `/mock-exam-sections`, empty answers for the shell's other calls; `next dev` from the worktree client on a free port with `NEXT_PUBLIC_API_URL`; placeholder `token`/`refreshToken`/`user` cookies (CEO roles). Screenshot the Sentabr overview (light and dark), the August overview (results card) and the list. Clean up cookies, localStorage, servers, `client/AGENTS.md`.

### Task 8: Pull request and report

- [ ] `git fetch origin && git merge origin/main` if main moved; re-run the server and client checks that the merge touches.
- [ ] `git push -u origin feat/mock-statistika`; `gh pr create --base main` with an English title/body (what, why, migration + deploy-window note, verification), ending with the Claude Code line. Bind it with `mcp__ccd_pr__bind_pr`.
- [ ] Report to the CEO in plain Uzbek with the screenshots: what is ready, what they will see, that it is not on the site yet, and ask whether to put it on the site (backend first, then Vercel + domain move).
