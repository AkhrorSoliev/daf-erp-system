# Telegram Digest Batching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Revision 2 (2026-09-23).** Rewritten after a four-way review of revision 1 found that it would not boot, not build, failed several of its own tests, and silently changed user-visible behavior. The findings are in `../docs/superpowers/plans/2026-09-23-telegram-digest-batching-review.md`. The spec and ADR were updated with the CEO's three decisions before this revision was written. Revision 1 is superseded; do not reuse its code.

**Goal:** Replace the scattered immediate Telegram sends (personal notifications + the 5×/day Redis group digest) with one Postgres queue (`TelegramDigestItem`) that two crons drain once a day at 20:00 Asia/Tashkent — one for people (students and staff), one for company/branch Telegram groups.

**Architecture:** Every event that should wait for the evening calls `TelegramDigestQueueService.enqueue()` with a typed, structured payload (never rendered text). At 20:00 the personal cron resolves each person's live chat id, renders one message from their rows (re-reading the balance), splits it into ≤4000-character parts, sends through the main bot, writes the student audit trail, and deletes only the rows it delivered or gave up on. The group cron does the same per Telegram group through the admin bot, tracking per-group delivery so a failed chat is retried the next run without re-sending to chats that already got it. Everything that must stay instant (lesson cancel/reschedule, auto-pause warnings, OTP, menus, 21:00 report, …) is untouched.

**Tech Stack:** NestJS 11, Prisma 7 (Postgres), `@nestjs/schedule` (`@Cron`), `@nestjs/event-emitter` (`@OnEvent`), Telegraf 4.16, Jest + `@nestjs/testing` (ts-jest, transpile-only).

## Global Constraints

- **Spec and ADR are the source of truth:** `../docs/superpowers/specs/2026-09-23-telegram-digest-batching-design.md` and `../docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md` (both revised 2026-09-23). Read both before starting.
- **Working directory for every command is `server/` of this worktree:** `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/telegram-digest-batching/server`. **Every path in this plan is relative to `server/`** (`src/...`, `prisma/...`, `test/...`). Never `cd` out of it.
- **Untouched — do not edit:** `src/lesson-reschedules/lesson-reschedule-events.listener.ts`, `src/lesson-cancellations/lesson-cancellation-events.listener.ts`, `src/sms/sms.service.ts`, `src/absence-pause/**` (auto-pause warnings stay instant — CEO decision), `src/attendance/attendance-reminder.service.ts`, `src/attendance/student-attendance-notification.listener.ts`, `src/telegram-groups/telegram-group-daily-cron.service.ts` (21:00 report), `src/telegram-groups/telegram-group-announcement.service.ts`, `src/telegram-groups/telegram-admin-bot-registrar.ts`, `src/telegram-groups/telegram-group-report-menu.service.ts`, `src/telegram/**`, and the `payment-promise.overdue` handler plus the private `sendTelegram()` in `src/notifications/notification-events.listener.ts`.
- **Who receives:** a STUDENT row is delivered to any student with `deletedAt: null` (frozen, departed and graduated students included — CEO decision); a USER row only to `deletedAt: null, isActive: true, status: ACTIVE`. Chat ids are looked up at send time, never at enqueue time.
- **Schedule:** both crons `@Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })`. The group cron skips Sundays and holidays (existing helpers); the personal cron never skips. Each run first deletes its kinds' rows older than 7 days — even with no bot, on Sundays and on holidays — and logs one `warn` when more than one row was purged.
- **Send failures** (classified by `classifyTelegramError`, Task 4): `permanent` (403; 400 chat not found / user is deactivated / bot was blocked) → rows dropped; `content` (any other 400 — message too long, can't parse entities) → rows kept, `Logger.error` with Telegram's description; 429 → wait `retry_after` (≤30 s) and retry once; anything else `transient` → rows kept for the next run. Group rows follow the same rule per group chat (CEO decision: retry, never drop the day).
- **Message text:** every Telegram text is split into parts of ≤4000 characters at block boundaries (`packBlocks`, Task 4). Every interpolated free text (names, group/course names, reasons, task text, URLs) goes through `escapeHtml` from `src/telegram-groups/utils/format.util.ts`. Free text is clipped code-point-safely with `clipText` (Task 4): task text 80/60 chars (as today), reasons 300. Money via `formatSum` from `format.util.ts` (it joins thousands with U+00A0 — tests must normalize with `.replace(/\u00A0/g, ' ')`), except the payment-correction line which keeps today's `formatSom`. Payment method names only from `PAYMENT_METHOD_LABEL` (`src/payments/shared/method-label.ts`). Do not write new formatting helpers beyond the ones this plan defines.
- **Language:** user-facing strings are Uzbek in Latin script only (never Cyrillic). Code comments, test names and commit messages are English.
- **Prisma migrations:** `prisma migrate dev` is broken in this repo. Use diff → `db execute` → `migrate resolve` exactly as Task 1 shows. This worktree has its own `node_modules`, so `npx prisma generate` here does not touch other checkouts.
- **Gates:** `ts-jest` runs transpile-only (`isolatedModules`), so a green `jest` run proves nothing about types or DI. Every task ends with its focused `npx jest <files>` **and** `npm run typecheck` (whole `src/` + specs). Full `npm test` runs at the checkpoints in Tasks 7, 12 and 16 and in Task 17. Task 7 and Task 17 also boot the real app (bots and crons disabled) because only that proves Nest DI.
- **Never start the app with real bot tokens or live crons.** The boot check blanks `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_BOT_TOKEN` and sets `CRONS_ENABLED=false` on the command line (the local-run switch `server/CLAUDE.md` documents); the dotenv loader does not override variables that are already set. Start, wait and stop in one command.
- **Commits:** one commit per task at the step shown, English message, ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (pass it as a second `-m`). Stage only the files the step lists.

## File Structure

| Path (under `server/`) | Responsibility | Task |
|---|---|---|
| `../docs/adr/0025-…md`, `../docs/superpowers/specs/…-design.md`, this plan, its review | Revised documents, committed first | 0 |
| `prisma/schema.prisma`, `prisma/migrations/20260923200000_add_telegram_digest_item/migration.sql` | `TelegramDigestItem` + 2 enums | 1 |
| `src/telegram-digest/telegram-digest-payloads.ts` | One payload interface per category, `DigestPayloadByCategory`, `EnqueueDigestItem`, `TelegramDigestItemRow`, `payloadOf()` | 2 |
| `src/telegram-digest/telegram-digest.constants.ts` | 7-day max age, portal URL, reason clip length | 2 |
| `src/telegram-digest/telegram-digest-queue.service.ts` (+spec) | The only write path into the queue | 2 |
| `src/telegram-digest/telegram-digest.module.ts` | Module; imports `TelegramModule` (main bot) | 2, 3, 5, 6, 7 |
| `src/telegram-digest/telegram-digest-chat-resolver.service.ts` (+spec) | Live chat id per STUDENT/USER | 3 |
| `src/telegram-digest/telegram-digest-dedup.ts` (+spec) | Collapse rows sharing category + `relatedEntityId` | 4 |
| `src/telegram-digest/telegram-message-parts.ts` (+spec) | `DigestBlock`, `packBlocks` (≤4000-char parts), `clipText` | 4 |
| `src/telegram-digest/telegram-send.ts` (+spec) | `classifyTelegramError`, `sendTelegramText` (429 retry) | 4 |
| `src/telegram-digest/telegram-digest-render.service.ts` (+spec) | Student/staff message blocks + audit entries | 5 |
| `src/telegram-digest/telegram-digest-audit.service.ts` (+spec) | `SmsMessage` + `EntityHistory` rows, same shape as `SmsService` | 6 |
| `src/telegram-digest/telegram-digest-personal-cron.service.ts` (+spec) | 20:00 personal drain | 7 |
| `src/notifications/notification-events.listener.ts` (+spec), `notifications.module.ts` | task / payment-corrected / salary Telegram legs → queue | 8 |
| `src/payments/payment-events.listener.ts` (+spec), `payments.module.ts`, `payments-write.service.ts` (comment only) | receipt / reversal → queue | 9 |
| `src/sms/sms-events.listener.ts` (+spec), `sms.module.ts` | enrolled / removed → queue | 10 |
| `src/billing/student-debt-notification.listener.ts` (+new spec), `billing.module.ts` | debt charge → queue | 11 |
| `src/attendance/attendance-events.listener.ts` (+spec), `attendance.module.ts` | teacher attendance Telegram leg → queue | 12 |
| `src/telegram-groups/telegram-group-digest.service.ts` (+spec) | `buildBlocks()` group digest from queue rows | 13 |
| `src/telegram-groups/telegram-group-broadcast.listener.ts` (+spec), `telegram-groups.module.ts` | group events → queue | 14 |
| `src/telegram-groups/telegram-group-digest-cron.service.ts` (+spec) | 20:00 group drain with per-group delivery | 15 |
| delete `telegram-group-digest-buffer.service.ts` (+spec), `telegram-group-broadcast.service.ts`; edit `constants.ts`, `telegram-groups.module.ts`, `group-report-scope.ts` (comment), `telegram-branch-routing.spec.ts`, `CLAUDE.md` | Remove the Redis path; test the real routing rule | 16 |
| `src/telegram-digest/direct-send.guard.spec.ts` | ADR-0025's "no direct sends" rule as a permanent guard | 16 |

---

### Task 0: Commit the revised design documents

The spec, ADR-0025, this plan and its review were revised on 2026-09-23 and are not committed yet. ADR-0025 must land in the same PR as the code (project rule), and the committed version (30e7f474) predates the CEO's decisions.

- [ ] **Step 1: See what is pending**

```bash
git status --short ../docs
```

Expected (paths relative to `server/`):

```
 M ../docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md
 M ../docs/superpowers/specs/2026-09-23-telegram-digest-batching-design.md
?? ../docs/superpowers/plans/2026-09-23-telegram-digest-batching-review.md
?? ../docs/superpowers/plans/2026-09-23-telegram-digest-batching.md
```

- [ ] **Step 2: Commit them**

```bash
git add ../docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md ../docs/superpowers/specs/2026-09-23-telegram-digest-batching-design.md ../docs/superpowers/plans/2026-09-23-telegram-digest-batching.md ../docs/superpowers/plans/2026-09-23-telegram-digest-batching-review.md
git commit -m "Revise the digest design and ADR-0025 with the CEO's decisions; add plan revision 2 and its review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Prisma schema and migration for the queue table

**Files:**
- Modify: `prisma/schema.prisma` (insert after the closing `}` of `model TelegramGroup`, which ends with `@@index([deletedAt])` at about line 1687, and before `model StudentExitReason`)
- Create: `prisma/migrations/20260923200000_add_telegram_digest_item/migration.sql`

**Interfaces:**
- Produces: Prisma model `TelegramDigestItem` and enums `TelegramDigestRecipientKind` (`STUDENT`, `USER`, `GROUP`) and `TelegramDigestCategory` (16 values). Every later task imports these names from `@prisma/client`.

- [ ] **Step 1: Add the schema block**

```prisma
enum TelegramDigestRecipientKind {
  STUDENT
  USER
  GROUP // recipientId = companyId; the group digest itself
}

enum TelegramDigestCategory {
  PAYMENT_RECEIVED
  PAYMENT_REVERSED
  STUDENT_ENROLLED
  STUDENT_REMOVED
  DEBT_CHARGE
  TASK_ASSIGNED
  TASK_UPDATED
  TASK_DELETED
  TASK_STATUS_CHANGED
  PAYMENT_CORRECTED
  SALARY_CARRIED_OVER
  ATTENDANCE_COMPLETED
  GROUP_NEW_STUDENT
  GROUP_NEW_GROUP
  GROUP_PAYMENT
  GROUP_STATUS_CHANGE
}

/// One queued Telegram notification waiting for the 20:00 digest (ADR-0025).
/// `payload` is structured data, never rendered text: the crons render it at
/// send time, so figures such as the student's balance are fresh.
model TelegramDigestItem {
  id                String                      @id @default(uuid())
  recipientKind     TelegramDigestRecipientKind
  recipientId       Int
  companyId         Int
  branchId          Int?
  category          TelegramDigestCategory
  relatedEntityId   String?
  payload           Json
  /// GROUP rows only: ids of the TelegramGroup chats this row already reached.
  /// A row is deleted once every active group that should see it is listed.
  deliveredGroupIds String[]                    @default([])
  createdAt         DateTime                    @default(now())

  @@index([recipientKind, recipientId])
  @@index([companyId])
  @@index([createdAt])
}
```

- [ ] **Step 2: Generate the diff against the dev database**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script -o /tmp/tg-digest-diff.sql
cat /tmp/tg-digest-diff.sql
```

The dev DB carries unrelated drift (e.g. `Branch.workingDays`, `Transaction_reversedAt_idx`, a `TelegramGroup` FK); the diff will include it. Keep **only** the statements for the two new enums, the `TelegramDigestItem` table and its three indexes.

- [ ] **Step 3: Write the migration file**

```bash
mkdir -p prisma/migrations/20260923200000_add_telegram_digest_item
```

Write the cleaned SQL to `prisma/migrations/20260923200000_add_telegram_digest_item/migration.sql`. It must match this (Prisma's own output style; if the diff differs in whitespace only, keep the diff's version):

```sql
-- CreateEnum
CREATE TYPE "TelegramDigestRecipientKind" AS ENUM ('STUDENT', 'USER', 'GROUP');

-- CreateEnum
CREATE TYPE "TelegramDigestCategory" AS ENUM ('PAYMENT_RECEIVED', 'PAYMENT_REVERSED', 'STUDENT_ENROLLED', 'STUDENT_REMOVED', 'DEBT_CHARGE', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_STATUS_CHANGED', 'PAYMENT_CORRECTED', 'SALARY_CARRIED_OVER', 'ATTENDANCE_COMPLETED', 'GROUP_NEW_STUDENT', 'GROUP_NEW_GROUP', 'GROUP_PAYMENT', 'GROUP_STATUS_CHANGE');

-- CreateTable
CREATE TABLE "TelegramDigestItem" (
    "id" TEXT NOT NULL,
    "recipientKind" "TelegramDigestRecipientKind" NOT NULL,
    "recipientId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "category" "TelegramDigestCategory" NOT NULL,
    "relatedEntityId" TEXT,
    "payload" JSONB NOT NULL,
    "deliveredGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramDigestItem_recipientKind_recipientId_idx" ON "TelegramDigestItem"("recipientKind", "recipientId");

-- CreateIndex
CREATE INDEX "TelegramDigestItem_companyId_idx" ON "TelegramDigestItem"("companyId");

-- CreateIndex
CREATE INDEX "TelegramDigestItem_createdAt_idx" ON "TelegramDigestItem"("createdAt");
```

- [ ] **Step 4: Apply to the dev DB, record it, regenerate the client**

```bash
npx prisma db execute --file prisma/migrations/20260923200000_add_telegram_digest_item/migration.sql
npx prisma migrate resolve --applied 20260923200000_add_telegram_digest_item
npx prisma generate
```

- [ ] **Step 5: Prove the generated client has the new types**

```bash
node -e "const c=require('@prisma/client'); console.log(Object.keys(c.TelegramDigestCategory).length, Object.keys(c.TelegramDigestRecipientKind).join(','))"
grep -c "deliveredGroupIds" node_modules/.prisma/client/index.d.ts
```

Expected: first line `16 STUDENT,USER,GROUP`; second line a number greater than 0.

`migrate resolve --applied` records the migration whether or not `db execute` worked, so also prove the table on the dev DB matches the schema:

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | grep -c "TelegramDigest"
```

Expected: `0` — nothing about the new table or enums is left to create (unrelated drift lines on the shared dev DB are ignored by the grep).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260923200000_add_telegram_digest_item
git commit -m "Add TelegramDigestItem queue table for the 20:00 Telegram digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Payload types, queue service, module

**Files:**
- Create: `src/telegram-digest/telegram-digest-payloads.ts`
- Create: `src/telegram-digest/telegram-digest.constants.ts`
- Create: `src/telegram-digest/telegram-digest-queue.service.ts`
- Test: `src/telegram-digest/telegram-digest-queue.service.spec.ts`
- Create: `src/telegram-digest/telegram-digest.module.ts`
- Modify: `src/app.module.ts` (import at line ~23, `imports` array at line ~98)

**Interfaces:**
- Consumes: `PrismaService` (global), `TelegramModule` (exports `TelegramService`).
- Produces (every later task uses these exact names):
  - `TelegramDigestQueueService.enqueue(item: EnqueueDigestItem): Promise<void>` — throws on a DB error; callers catch.
  - Types `DigestPayloadByCategory`, `RecipientKindByCategory`, `EnqueueDigestItem`, `TelegramDigestItemRow`, `PersonalRecipientKind`, `GroupStatusTransition` and the 16 payload interfaces; function `payloadOf(row, category)`.
  - Constants `DIGEST_ROW_MAX_AGE_MS`, `STUDENT_PORTAL_URL`, `DIGEST_REASON_MAX_CHARS`.
  - `TelegramDigestModule` (imports `TelegramModule`, exports the queue service; later tasks add providers).

- [ ] **Step 1: Write the payload types**

```typescript
// src/telegram-digest/telegram-digest-payloads.ts
import {
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestItem,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import type {
  EnrollmentMessagePayload,
  RemovalMessagePayload,
} from '../sms/sms-templates';

/**
 * Structured payloads for the Telegram digest queue — one interface per
 * category. Never store rendered text here: the 20:00 crons render at send
 * time (ADR-0025), so anything that can go stale (a balance) is re-read then.
 */

export interface PaymentReceivedDigestPayload {
  paymentId: string;
  amount: number;
  method: PaymentMethod;
  /** Built at enqueue time with the same rule the instant receipt used. */
  receiptUrl: string;
  /** Staff member who recorded the payment → `SmsMessage.senderUserId`. */
  performedById: number | null;
}

export interface PaymentReversedDigestPayload {
  paymentId: string;
  amount: number;
  reason: string | null;
  performedById: number | null;
}

export type StudentEnrolledDigestPayload = EnrollmentMessagePayload;
export type StudentRemovedDigestPayload = RemovalMessagePayload;

export interface DebtChargeDigestPayload {
  /** The attendance whose SINGLE_UNCOVERED deduction created the debt. */
  attendanceId: string;
  groupName: string;
  perLessonCost: number;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
}

/** TASK_ASSIGNED, TASK_UPDATED and TASK_DELETED share this shape. */
export interface TaskDigestPayload {
  authorName: string;
  content: string;
}

export interface TaskStatusChangedDigestPayload {
  assigneeName: string;
  /** AssigneeStatus value as emitted (`SEEN`, `DONE`, …). */
  status: string;
  content: string;
}

export interface PaymentCorrectedDigestPayload {
  performerName: string;
  studentName: string;
  studentId: number;
  oldAmount: number;
  newAmount: number;
  oldMethod: PaymentMethod;
  newMethod: PaymentMethod;
  reason: string;
}

export interface SalaryCarriedOverDigestPayload {
  count: number;
  total: number;
}

export interface AttendanceCompletedDigestPayload {
  groupId: string;
  groupName: string;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface GroupNewStudentDigestPayload {
  studentId: number;
  name: string;
  branchName: string | null;
}

export interface GroupNewGroupDigestPayload {
  groupId: string;
  name: string;
  branchName: string | null;
  /** ISO timestamp or null. */
  startDate: string | null;
}

export interface GroupPaymentDigestPayload {
  paymentId: string;
  studentName: string;
  amount: number;
  method: PaymentMethod;
}

export type GroupStatusTransition =
  | 'GROUP_STARTED'
  | 'GROUP_COMPLETED'
  | 'STUDENT_FROZEN'
  | 'STUDENT_EXPELLED'
  | 'STUDENT_GRADUATED'
  | 'STUDENT_REACTIVATED';

export interface GroupStatusChangeDigestPayload {
  entityType: 'Group' | 'Student';
  entityId: string;
  /** Group or student name; `ID <entityId>` when the row was already gone. */
  name: string;
  transition: GroupStatusTransition;
  reason: string | null;
  actorName: string | null;
  actorRole: string | null;
  branchName: string | null;
}

/** Fails to compile when a category is added to the enum without a payload. */
type EveryCategory<T extends Record<TelegramDigestCategory, unknown>> = T;

export type DigestPayloadByCategory = EveryCategory<{
  PAYMENT_RECEIVED: PaymentReceivedDigestPayload;
  PAYMENT_REVERSED: PaymentReversedDigestPayload;
  STUDENT_ENROLLED: StudentEnrolledDigestPayload;
  STUDENT_REMOVED: StudentRemovedDigestPayload;
  DEBT_CHARGE: DebtChargeDigestPayload;
  TASK_ASSIGNED: TaskDigestPayload;
  TASK_UPDATED: TaskDigestPayload;
  TASK_DELETED: TaskDigestPayload;
  TASK_STATUS_CHANGED: TaskStatusChangedDigestPayload;
  PAYMENT_CORRECTED: PaymentCorrectedDigestPayload;
  SALARY_CARRIED_OVER: SalaryCarriedOverDigestPayload;
  ATTENDANCE_COMPLETED: AttendanceCompletedDigestPayload;
  GROUP_NEW_STUDENT: GroupNewStudentDigestPayload;
  GROUP_NEW_GROUP: GroupNewGroupDigestPayload;
  GROUP_PAYMENT: GroupPaymentDigestPayload;
  GROUP_STATUS_CHANGE: GroupStatusChangeDigestPayload;
}>;

/** Who each category is written for — a student row read as USER is never rendered. */
export type RecipientKindByCategory = EveryCategory<{
  PAYMENT_RECEIVED: 'STUDENT';
  PAYMENT_REVERSED: 'STUDENT';
  STUDENT_ENROLLED: 'STUDENT';
  STUDENT_REMOVED: 'STUDENT';
  DEBT_CHARGE: 'STUDENT';
  TASK_ASSIGNED: 'USER';
  TASK_UPDATED: 'USER';
  TASK_DELETED: 'USER';
  TASK_STATUS_CHANGED: 'USER';
  PAYMENT_CORRECTED: 'USER';
  SALARY_CARRIED_OVER: 'USER';
  ATTENDANCE_COMPLETED: 'USER';
  GROUP_NEW_STUDENT: 'GROUP';
  GROUP_NEW_GROUP: 'GROUP';
  GROUP_PAYMENT: 'GROUP';
  GROUP_STATUS_CHANGE: 'GROUP';
}>;

/**
 * One queue write. A union over categories, so `category` decides which
 * payload shape and which recipient kind the compiler accepts — a misspelled
 * field cannot reach 20:00 as `undefined`, and a student notice cannot be
 * queued for a staff member.
 */
export type EnqueueDigestItem = {
  [C in TelegramDigestCategory]: {
    recipientKind: RecipientKindByCategory[C];
    recipientId: number;
    companyId: number;
    branchId?: number | null;
    category: C;
    relatedEntityId?: string | null;
    payload: DigestPayloadByCategory[C];
  };
}[TelegramDigestCategory];

/** The columns renderers and crons read from a queued row. */
export type TelegramDigestItemRow = Pick<
  TelegramDigestItem,
  | 'id'
  | 'companyId'
  | 'branchId'
  | 'category'
  | 'relatedEntityId'
  | 'payload'
  | 'createdAt'
>;

export type PersonalRecipientKind = Exclude<
  TelegramDigestRecipientKind,
  'GROUP'
>;

/**
 * Typed view of a row's payload. The category argument only selects the
 * type; the caller has already checked `row.category`.
 */
export function payloadOf<C extends TelegramDigestCategory>(
  row: TelegramDigestItemRow,
  _category: C,
): DigestPayloadByCategory[C] {
  return row.payload as unknown as DigestPayloadByCategory[C];
}
```

- [ ] **Step 2: Write the constants**

```typescript
// src/telegram-digest/telegram-digest.constants.ts

/** Every run drops rows older than this, delivered or not (ADR-0025). */
export const DIGEST_ROW_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Same portal link the instant debt notice used. */
export const STUDENT_PORTAL_URL = 'https://student.dafzentrum.uz';

/**
 * Longest reason text one digest line carries. Clipping upstream keeps every
 * line far below Telegram's 4096-character limit.
 */
export const DIGEST_REASON_MAX_CHARS = 300;
```

- [ ] **Step 3: Write the failing test**

```typescript
// src/telegram-digest/telegram-digest-queue.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from './telegram-digest-queue.service';

describe('TelegramDigestQueueService', () => {
  let service: TelegramDigestQueueService;
  let create: jest.Mock;

  beforeEach(async () => {
    create = jest.fn().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestQueueService,
        {
          provide: PrismaService,
          useValue: { telegramDigestItem: { create } },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestQueueService);
  });

  const receipt = {
    paymentId: 'pay-1',
    amount: 100000,
    method: PaymentMethod.CASH,
    receiptUrl: 'https://invoice.dafzentrum.uz/pay-1',
    performedById: 99,
  };

  it('writes one row with every field it was given', async () => {
    await service.enqueue({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10042,
      companyId: 1001,
      branchId: 7,
      category: TelegramDigestCategory.PAYMENT_RECEIVED,
      relatedEntityId: 'pay-1',
      payload: receipt,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.PAYMENT_RECEIVED,
        relatedEntityId: 'pay-1',
        payload: receipt,
      },
    });
  });

  it('stores branchId and relatedEntityId as null when omitted', async () => {
    await service.enqueue({
      recipientKind: TelegramDigestRecipientKind.USER,
      recipientId: 10001,
      companyId: 1001,
      category: TelegramDigestCategory.SALARY_CARRIED_OVER,
      payload: { count: 2, total: 40000 },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ branchId: null, relatedEntityId: null }),
    });
  });

  it('propagates a database error to the caller', async () => {
    create.mockRejectedValue(new Error('db down'));

    await expect(
      service.enqueue({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 10001,
        companyId: 1001,
        category: TelegramDigestCategory.SALARY_CARRIED_OVER,
        payload: { count: 1, total: 10000 },
      }),
    ).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

```bash
npx jest src/telegram-digest/telegram-digest-queue.service.spec.ts
```

Expected: FAIL — `Cannot find module './telegram-digest-queue.service'`.

- [ ] **Step 5: Implement the queue service**

```typescript
// src/telegram-digest/telegram-digest-queue.service.ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueDigestItem } from './telegram-digest-payloads';

/**
 * The single write path into the Telegram digest queue (ADR-0025). Every
 * event that waits for the 20:00 digest calls `enqueue()` instead of sending.
 * Throws on a database error — listeners catch and log, so the business
 * write that fired the event is never affected.
 */
@Injectable()
export class TelegramDigestQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(item: EnqueueDigestItem): Promise<void> {
    await this.prisma.telegramDigestItem.create({
      data: {
        recipientKind: item.recipientKind,
        recipientId: item.recipientId,
        companyId: item.companyId,
        branchId: item.branchId ?? null,
        category: item.category,
        relatedEntityId: item.relatedEntityId ?? null,
        payload: item.payload as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
```

- [ ] **Step 6: Create the module and register it**

```typescript
// src/telegram-digest/telegram-digest.module.ts
import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramDigestQueueService } from './telegram-digest-queue.service';

/**
 * The daily Telegram digest (ADR-0025): the queue every event writes to, and
 * the 20:00 crons that drain it. `TelegramModule` provides the main bot, which
 * owns every personal chat id — the personal cron (Task 7) sends through it.
 * Importing it here is required: `TelegramModule` is not global, and without
 * it Nest fails at startup, which no unit test can catch.
 */
@Module({
  imports: [TelegramModule],
  providers: [TelegramDigestQueueService],
  exports: [TelegramDigestQueueService],
})
export class TelegramDigestModule {}
```

In `src/app.module.ts`, add after line 23 (`import { TelegramGroupsModule } …`):

```typescript
import { TelegramDigestModule } from './telegram-digest/telegram-digest.module';
```

and in the `imports` array add `TelegramDigestModule,` on the line after `TelegramGroupsModule,` (line ~98).

- [ ] **Step 7: Run the test and the typecheck**

```bash
npx jest src/telegram-digest/telegram-digest-queue.service.spec.ts
npm run typecheck
```

Expected: PASS (3 tests); typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/telegram-digest src/app.module.ts
git commit -m "Add the Telegram digest queue: typed payloads, enqueue service, module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Chat resolver

**Files:**
- Create: `src/telegram-digest/telegram-digest-chat-resolver.service.ts`
- Test: `src/telegram-digest/telegram-digest-chat-resolver.service.spec.ts`
- Modify: `src/telegram-digest/telegram-digest.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; `PersonalRecipientKind` (Task 2).
- Produces: `TelegramDigestChatResolverService.resolveChatId(kind: PersonalRecipientKind, id: number): Promise<string | null>` — used by Task 7.

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram-digest/telegram-digest-chat-resolver.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';

describe('TelegramDigestChatResolverService', () => {
  let service: TelegramDigestChatResolverService;
  let studentFindFirst: jest.Mock;
  let userFindFirst: jest.Mock;

  beforeEach(async () => {
    studentFindFirst = jest.fn();
    userFindFirst = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestChatResolverService,
        {
          provide: PrismaService,
          useValue: {
            student: { findFirst: studentFindFirst },
            user: { findFirst: userFindFirst },
          },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestChatResolverService);
  });

  it('resolves any non-deleted student, whatever their status', async () => {
    studentFindFirst.mockResolvedValue({ telegramChatId: 'chat-1' });

    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBe(
      'chat-1',
    );
    // Only deletedAt — a frozen, departed or graduated student still gets
    // receipts (CEO decision 2026-09-23). No isActive, no status.
    expect(studentFindFirst).toHaveBeenCalledWith({
      where: { id: 10042, deletedAt: null },
      select: { telegramChatId: true },
    });
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it('returns null for a student without a chat id', async () => {
    studentFindFirst.mockResolvedValue({ telegramChatId: null });
    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBeNull();
  });

  it('returns null when the student is deleted or missing', async () => {
    studentFindFirst.mockResolvedValue(null);
    await expect(service.resolveChatId('STUDENT', 10042)).resolves.toBeNull();
  });

  it('resolves only an active staff member', async () => {
    userFindFirst.mockResolvedValue({ telegramChatId: 'chat-2' });

    await expect(service.resolveChatId('USER', 10001)).resolves.toBe('chat-2');
    expect(userFindFirst).toHaveBeenCalledWith({
      where: {
        id: 10001,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { telegramChatId: true },
    });
    expect(studentFindFirst).not.toHaveBeenCalled();
  });

  it('returns null for a staff member without a chat id', async () => {
    userFindFirst.mockResolvedValue({ telegramChatId: null });
    await expect(service.resolveChatId('USER', 10001)).resolves.toBeNull();
  });

  it('returns null when the staff member is inactive or missing', async () => {
    userFindFirst.mockResolvedValue(null);
    await expect(service.resolveChatId('USER', 10001)).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-digest/telegram-digest-chat-resolver.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```typescript
// src/telegram-digest/telegram-digest-chat-resolver.service.ts
import { Injectable } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalRecipientKind } from './telegram-digest-payloads';

/**
 * Looks up a digest recipient's Telegram chat at SEND time, so a staff member
 * deactivated between the event and 20:00 gets nothing.
 *
 * Students are filtered on `deletedAt` only. `Student.isActive` is true only
 * for ACTIVE students, so filtering on it would stop receipts to frozen,
 * departed and graduated students — who get them today and keep getting them
 * (CEO decision 2026-09-23). Staff use the full active filter the rest of the
 * notification pipeline applies.
 */
@Injectable()
export class TelegramDigestChatResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveChatId(
    kind: PersonalRecipientKind,
    id: number,
  ): Promise<string | null> {
    if (kind === 'STUDENT') {
      const student = await this.prisma.student.findFirst({
        where: { id, deletedAt: null },
        select: { telegramChatId: true },
      });
      return student?.telegramChatId ?? null;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { telegramChatId: true },
    });
    return user?.telegramChatId ?? null;
  }
}
```

- [ ] **Step 4: Register it**

In `src/telegram-digest/telegram-digest.module.ts` import `TelegramDigestChatResolverService` and add it to `providers` (not to `exports`).

- [ ] **Step 5: Run the test and the typecheck**

```bash
npx jest src/telegram-digest/telegram-digest-chat-resolver.service.spec.ts
npm run typecheck
```

Expected: PASS (6 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/telegram-digest
git commit -m "Add the digest chat resolver: students by deletedAt, staff by full active filter" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Message plumbing — dedup, splitting, sending

Three small pure modules the renderers and both crons share. No Nest providers, no DB.

**Files:**
- Create: `src/telegram-digest/telegram-digest-dedup.ts` — Test: `src/telegram-digest/telegram-digest-dedup.spec.ts`
- Create: `src/telegram-digest/telegram-message-parts.ts` — Test: `src/telegram-digest/telegram-message-parts.spec.ts`
- Create: `src/telegram-digest/telegram-send.ts` — Test: `src/telegram-digest/telegram-send.spec.ts`

**Interfaces:**
- Consumes: `TelegramDigestItemRow` (Task 2); `truncateChars` from `src/common/utils/text.util.ts` (existing, code-point safe).
- Produces:
  - `dedupRows<R extends TelegramDigestItemRow>(rows: R[]): DedupedRow<R>[]` with `DedupedRow<R> = { row: R; ids: string[] }` — `row` is the one shown, `ids` every row it stands for.
  - `TELEGRAM_TEXT_LIMIT = 4000`; `interface DigestBlock { text: string; itemIds: string[]; keepWithNext?: boolean }`; `interface TelegramPart { text: string; itemIds: string[] }`; `spacer(): DigestBlock`; `header(text: string): DigestBlock`; `packBlocks(blocks: DigestBlock[], limit?: number): TelegramPart[]`; `clampBlock(text: string, limit: number): string`; `clipText(text: string, maxChars: number): string`.
  - `type TelegramFailureKind = 'permanent' | 'content' | 'transient'`; `interface TelegramFailure { kind; code: number | null; description: string }`; `type SendOutcome = { ok: true; messageId: number } | ({ ok: false } & TelegramFailure)`; `interface TelegramTextSender`; `classifyTelegramError(err: unknown)`; `sendTelegramText(bot, chatId, text, extra, sleep?) : Promise<SendOutcome>`; `describeError(err: unknown): string`; `MAX_RETRY_AFTER_SECONDS = 30`.

- [ ] **Step 1: Write the failing dedup test**

```typescript
// src/telegram-digest/telegram-digest-dedup.spec.ts
import { Prisma, TelegramDigestCategory } from '@prisma/client';
import { dedupRows } from './telegram-digest-dedup';
import { TelegramDigestItemRow } from './telegram-digest-payloads';

const row = (
  id: string,
  category: TelegramDigestCategory,
  relatedEntityId: string | null,
  at: string,
): TelegramDigestItemRow => ({
  id,
  companyId: 1001,
  branchId: null,
  category,
  relatedEntityId,
  payload: {} as Prisma.JsonValue,
  createdAt: new Date(at),
});

describe('dedupRows', () => {
  it('never merges rows without a relatedEntityId', () => {
    const out = dedupRows([
      row('a', TelegramDigestCategory.SALARY_CARRIED_OVER, null, '2026-09-23T05:00:00Z'),
      row('b', TelegramDigestCategory.SALARY_CARRIED_OVER, null, '2026-09-23T06:00:00Z'),
    ]);
    expect(out.map((e) => e.ids)).toEqual([['a'], ['b']]);
  });

  it('shows the latest of rows sharing category + relatedEntityId and keeps every id', () => {
    const out = dedupRows([
      row('old', TelegramDigestCategory.TASK_UPDATED, 'task-1', '2026-09-23T05:00:00Z'),
      row('new', TelegramDigestCategory.TASK_UPDATED, 'task-1', '2026-09-23T07:00:00Z'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].row.id).toBe('new');
    expect(out[0].ids.sort()).toEqual(['new', 'old']);
  });

  it('does not merge the same relatedEntityId across categories', () => {
    const out = dedupRows([
      row('a', TelegramDigestCategory.TASK_ASSIGNED, 'task-1', '2026-09-23T05:00:00Z'),
      row('b', TelegramDigestCategory.TASK_UPDATED, 'task-1', '2026-09-23T06:00:00Z'),
    ]);
    expect(out).toHaveLength(2);
  });

  it('orders entries by the shown row, oldest first', () => {
    const out = dedupRows([
      row('late', TelegramDigestCategory.PAYMENT_RECEIVED, 'p2', '2026-09-23T09:00:00Z'),
      row('early', TelegramDigestCategory.PAYMENT_RECEIVED, 'p1', '2026-09-23T04:00:00Z'),
    ]);
    expect(out.map((e) => e.row.id)).toEqual(['early', 'late']);
  });
});
```

- [ ] **Step 2: Write the failing parts test**

```typescript
// src/telegram-digest/telegram-message-parts.spec.ts
import {
  clampBlock,
  clipText,
  DigestBlock,
  header,
  packBlocks,
  spacer,
} from './telegram-message-parts';

const line = (text: string, ...itemIds: string[]): DigestBlock => ({
  text,
  itemIds,
});

describe('packBlocks', () => {
  it('returns no parts for no blocks', () => {
    expect(packBlocks([])).toEqual([]);
  });

  it('joins short blocks into one part and keeps their item ids in order', () => {
    const parts = packBlocks([
      header('<b>A</b>'),
      line('• one', 'r1'),
      spacer(),
      line('• two', 'r2', 'r3'),
    ]);
    expect(parts).toEqual([
      { text: '<b>A</b>\n• one\n\n• two', itemIds: ['r1', 'r2', 'r3'] },
    ]);
  });

  it('splits at block boundaries so no part exceeds the limit', () => {
    const parts = packBlocks(
      [line('x'.repeat(30), 'r1'), line('y'.repeat(30), 'r2'), line('z'.repeat(30), 'r3')],
      70,
    );
    expect(parts.map((p) => p.itemIds)).toEqual([['r1', 'r2'], ['r3']]);
    for (const p of parts) expect(p.text.length).toBeLessThanOrEqual(70);
  });

  it('moves a header to the next part together with its first line', () => {
    const parts = packBlocks(
      [line('x'.repeat(50), 'r1'), header('H'.repeat(10)), line('y'.repeat(30), 'r2')],
      70,
    );
    expect(parts[0].text).toBe('x'.repeat(50));
    expect(parts[1].text).toBe(`${'H'.repeat(10)}\n${'y'.repeat(30)}`);
  });

  it('moves a chain of headers to the next part together with the first line', () => {
    const parts = packBlocks(
      [
        line('x'.repeat(40), 'r1'),
        header('H'.repeat(10)),
        header('B'.repeat(10)),
        line('y'.repeat(20), 'r2'),
      ],
      70,
    );
    expect(parts[0].text).toBe('x'.repeat(40));
    expect(parts[1].text).toBe(`${'H'.repeat(10)}\n${'B'.repeat(10)}\n${'y'.repeat(20)}`);
  });

  it('never starts or ends a part with a blank line', () => {
    const parts = packBlocks(
      [spacer(), line('x'.repeat(50), 'r1'), spacer(), line('y'.repeat(50), 'r2'), spacer()],
      70,
    );
    expect(parts.map((p) => p.text)).toEqual(['x'.repeat(50), 'y'.repeat(50)]);
  });

  it('clamps a single block longer than the limit instead of letting Telegram reject it', () => {
    const parts = packBlocks([line(`<b>${'a'.repeat(100)}</b>`, 'r1')], 40);
    expect(parts).toHaveLength(1);
    expect(parts[0].text.length).toBeLessThanOrEqual(40);
    expect(parts[0].text).not.toContain('<b>');
    expect(parts[0].itemIds).toEqual(['r1']);
  });
});

describe('clampBlock', () => {
  it('returns short text untouched', () => {
    expect(clampBlock('<b>ok</b>', 40)).toBe('<b>ok</b>');
  });

  it('never cuts an HTML entity in half', () => {
    const out = clampBlock(`${'a'.repeat(8)}&amp;${'b'.repeat(20)}`, 11);
    expect(out).toBe(`${'a'.repeat(8)}…`);
  });
});

describe('clipText', () => {
  it('leaves short text alone', () => {
    expect(clipText('salom', 10)).toBe('salom');
  });

  it('clips long text with an ellipsis', () => {
    expect(clipText('abcdefghij', 4)).toBe('abcd...');
  });

  it('never splits a surrogate pair', () => {
    expect(clipText('ab📄cd', 3)).toBe('ab📄...');
  });
});
```

- [ ] **Step 3: Write the failing send test**

```typescript
// src/telegram-digest/telegram-send.spec.ts
import {
  classifyTelegramError,
  describeError,
  sendTelegramText,
} from './telegram-send';

const tgError = (
  error_code: number,
  description: string,
  parameters?: { retry_after: number },
) => ({ response: { error_code, description, parameters }, message: description });

describe('classifyTelegramError', () => {
  it('treats 403 as permanent', () => {
    expect(
      classifyTelegramError(tgError(403, 'Forbidden: bot was blocked by the user')),
    ).toMatchObject({ kind: 'permanent', code: 403 });
  });

  it('treats "chat not found" as permanent', () => {
    expect(
      classifyTelegramError(tgError(400, 'Bad Request: chat not found')),
    ).toMatchObject({ kind: 'permanent', code: 400 });
  });

  it('treats any other 400 as a content error', () => {
    expect(
      classifyTelegramError(tgError(400, 'Bad Request: message is too long')),
    ).toMatchObject({ kind: 'content', description: 'Bad Request: message is too long' });
  });

  it('treats 429 as transient and exposes retry_after', () => {
    expect(
      classifyTelegramError(tgError(429, 'Too Many Requests: retry after 3', { retry_after: 3 })),
    ).toMatchObject({ kind: 'transient', code: 429, retryAfter: 3 });
  });

  it('treats a network error as transient', () => {
    expect(classifyTelegramError(new Error('ETIMEDOUT'))).toMatchObject({
      kind: 'transient',
      code: null,
      description: 'ETIMEDOUT',
    });
  });
});

describe('sendTelegramText', () => {
  const sleep = jest.fn().mockResolvedValue(undefined);
  const botWith = (sendMessage: jest.Mock) => ({ telegram: { sendMessage } });

  beforeEach(() => sleep.mockClear());

  it('returns the message id on success and passes the extra options through', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 77 });
    const outcome = await sendTelegramText(
      botWith(sendMessage), 'chat-1', 'hello', { parse_mode: 'HTML' }, sleep,
    );
    expect(outcome).toEqual({ ok: true, messageId: 77 });
    expect(sendMessage).toHaveBeenCalledWith('chat-1', 'hello', { parse_mode: 'HTML' });
  });

  it('does not retry a permanent failure', async () => {
    const sendMessage = jest.fn().mockRejectedValue(tgError(403, 'Forbidden'));
    const outcome = await sendTelegramText(botWith(sendMessage), 'c', 't', {}, sleep);
    expect(outcome).toMatchObject({ ok: false, kind: 'permanent', code: 403 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('waits retry_after once on 429 and succeeds on the retry', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValueOnce(tgError(429, 'Too Many Requests', { retry_after: 2 }))
      .mockResolvedValueOnce({ message_id: 5 });
    const outcome = await sendTelegramText(botWith(sendMessage), 'c', 't', {}, sleep);
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(outcome).toEqual({ ok: true, messageId: 5 });
  });

  it('gives up as transient after one 429 retry', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValue(tgError(429, 'Too Many Requests', { retry_after: 1 }));
    const outcome = await sendTelegramText(botWith(sendMessage), 'c', 't', {}, sleep);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ ok: false, kind: 'transient', code: 429 });
  });

  it('does not wait when retry_after is longer than the cap', async () => {
    const sendMessage = jest
      .fn()
      .mockRejectedValue(tgError(429, 'Too Many Requests', { retry_after: 120 }));
    const outcome = await sendTelegramText(botWith(sendMessage), 'c', 't', {}, sleep);
    expect(sleep).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, kind: 'transient' });
  });
});

describe('describeError', () => {
  it('prefers Error.message and falls back to String()', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('plain')).toBe('plain');
  });
});
```

- [ ] **Step 4: Run all three to verify they fail**

```bash
npx jest src/telegram-digest/telegram-digest-dedup.spec.ts src/telegram-digest/telegram-message-parts.spec.ts src/telegram-digest/telegram-send.spec.ts
```

Expected: FAIL — the three modules do not exist yet.

- [ ] **Step 5: Implement dedup**

```typescript
// src/telegram-digest/telegram-digest-dedup.ts
import { TelegramDigestItemRow } from './telegram-digest-payloads';

export interface DedupedRow<R extends TelegramDigestItemRow = TelegramDigestItemRow> {
  /** The row whose content is shown: the latest of its key. */
  row: R;
  /** Every queued row this entry stands for, shown row included. */
  ids: string[];
}

function isLater(a: TelegramDigestItemRow, b: TelegramDigestItemRow): boolean {
  const diff = a.createdAt.getTime() - b.createdAt.getTime();
  return diff > 0 || (diff === 0 && a.id > b.id);
}

/**
 * Collapses rows that share `category` + `relatedEntityId` to the latest one
 * (spec: "faqat eng oxirgisi ko'rsatiladi"). Rows without a relatedEntityId
 * are never merged. The merged-away ids travel with the survivor so the crons
 * delete or mark them together with the line that represents them.
 */
export function dedupRows<R extends TelegramDigestItemRow>(
  rows: R[],
): DedupedRow<R>[] {
  const byKey = new Map<string, DedupedRow<R>>();
  const entries: DedupedRow<R>[] = [];
  for (const row of rows) {
    if (!row.relatedEntityId) {
      entries.push({ row, ids: [row.id] });
      continue;
    }
    const key = `${row.category}:${row.relatedEntityId}`;
    const existing = byKey.get(key);
    if (!existing) {
      const entry = { row, ids: [row.id] };
      byKey.set(key, entry);
      entries.push(entry);
      continue;
    }
    existing.ids.push(row.id);
    if (isLater(row, existing.row)) existing.row = row;
  }
  return entries.sort((a, b) => (isLater(a.row, b.row) ? 1 : -1));
}
```

- [ ] **Step 6: Implement message parts**

```typescript
// src/telegram-digest/telegram-message-parts.ts
import { truncateChars } from '../common/utils/text.util';

/**
 * Telegram rejects message text over 4096 characters ("message is too
 * long"). Parts are cut below that with room to spare.
 */
export const TELEGRAM_TEXT_LIMIT = 4000;

export interface DigestBlock {
  /**
   * Self-contained HTML — every tag it opens, it closes — so a part boundary
   * between blocks can never break markup. May span several lines. '' is a
   * blank line.
   */
  text: string;
  /** Queue rows this block shows. Empty for headers and spacers. */
  itemIds: string[];
  /** Headers set this so they never end a part without what follows them. */
  keepWithNext?: boolean;
}

export interface TelegramPart {
  text: string;
  itemIds: string[];
}

export const spacer = (): DigestBlock => ({ text: '', itemIds: [] });

export const header = (text: string): DigestBlock => ({
  text,
  itemIds: [],
  keepWithNext: true,
});

/**
 * Code-point-safe clip with an ellipsis. Free text is clipped before it is
 * rendered so that no single line can approach the Telegram limit.
 */
export function clipText(text: string, maxChars: number): string {
  const clipped = truncateChars(text, maxChars);
  return clipped === text ? text : `${clipped}...`;
}

/**
 * Last-resort guard for one block longer than a whole message. Upstream
 * clipping should make this unreachable; if it happens, the block loses its
 * formatting instead of the whole message being rejected by Telegram.
 */
export function clampBlock(text: string, limit: number): string {
  if (text.length <= limit) return text;
  let plain = truncateChars(text.replace(/<[^>]*>/g, ''), limit - 1);
  const amp = plain.lastIndexOf('&');
  if (amp > plain.lastIndexOf(';')) plain = plain.slice(0, amp);
  return `${plain}…`;
}

/**
 * Packs blocks into as few messages as possible, each at most `limit`
 * characters, splitting only between blocks. Parts never start or end with a
 * blank line, and a run of `keepWithNext` blocks moves to the next part
 * together with the first block after it.
 */
export function packBlocks(
  blocks: DigestBlock[],
  limit: number = TELEGRAM_TEXT_LIMIT,
): TelegramPart[] {
  const parts: TelegramPart[] = [];
  let lines: string[] = [];
  let ids: string[] = [];
  let length = 0;

  const flush = () => {
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length > 0) parts.push({ text: lines.join('\n'), itemIds: ids });
    lines = [];
    ids = [];
    length = 0;
  };

  for (let i = 0; i < blocks.length; i += 1) {
    const text = clampBlock(blocks[i].text, limit);
    if (text === '' && lines.length === 0) continue;

    // A header travels with everything up to and including the first
    // non-header block after it — a section header, a branch sub-header and
    // the first line under them move as one.
    let needed = text.length;
    for (let j = i; blocks[j].keepWithNext && j + 1 < blocks.length; j += 1) {
      needed += 1 + clampBlock(blocks[j + 1].text, limit).length;
    }
    if (lines.length > 0 && length + 1 + needed > limit) flush();
    if (text === '' && lines.length === 0) continue;

    length += (lines.length > 0 ? 1 : 0) + text.length;
    lines.push(text);
    ids.push(...blocks[i].itemIds);
  }
  flush();
  return parts;
}
```

- [ ] **Step 7: Implement sending**

```typescript
// src/telegram-digest/telegram-send.ts

export type TelegramFailureKind = 'permanent' | 'content' | 'transient';

export interface TelegramFailure {
  kind: TelegramFailureKind;
  code: number | null;
  description: string;
}

export type SendOutcome =
  | { ok: true; messageId: number }
  | ({ ok: false } & TelegramFailure);

/** The one Telegraf method the digest needs; both bots satisfy it. */
export interface TelegramTextSender {
  telegram: {
    sendMessage(
      chatId: string,
      text: string,
      extra?: any,
    ): Promise<{ message_id: number }>;
  };
}

/** Longest `retry_after` a 429 may ask for before we give up for this run. */
export const MAX_RETRY_AFTER_SECONDS = 30;

/** Bad Requests that mean the chat itself is gone — retrying cannot help. */
const PERMANENT_BAD_REQUEST =
  /chat not found|user is deactivated|bot was blocked|bot was kicked|PEER_ID_INVALID/i;

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Sorts a Telegraf error into what the digest crons do with the rows:
 * permanent → drop; content (our own bug: too long, bad HTML) → keep and
 * log loudly; transient (network, 5xx, rate limit) → keep for the next run.
 */
export function classifyTelegramError(
  err: unknown,
): TelegramFailure & { retryAfter: number | null } {
  const e = err as {
    response?: {
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };
  };
  const rawCode = e?.response?.error_code;
  const code = typeof rawCode === 'number' ? rawCode : null;
  const description = e?.response?.description ?? describeError(err);

  if (code === 403) {
    return { kind: 'permanent', code, description, retryAfter: null };
  }
  if (code === 400) {
    const kind = PERMANENT_BAD_REQUEST.test(description) ? 'permanent' : 'content';
    return { kind, code, description, retryAfter: null };
  }
  if (code === 429) {
    const retryAfter = e.response?.parameters?.retry_after ?? 1;
    return { kind: 'transient', code, description, retryAfter };
  }
  return { kind: 'transient', code, description, retryAfter: null };
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one message. On 429 it waits `retry_after` (at most 30 s) and retries
 * once; every other failure is returned, classified, for the caller to act on.
 */
export async function sendTelegramText(
  bot: TelegramTextSender,
  chatId: string,
  text: string,
  extra: Record<string, unknown>,
  sleep: (ms: number) => Promise<void> = realSleep,
): Promise<SendOutcome> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const message = await bot.telegram.sendMessage(chatId, text, extra);
      return { ok: true, messageId: message.message_id };
    } catch (err) {
      const failure = classifyTelegramError(err);
      const wait = failure.retryAfter;
      if (attempt === 1 && wait !== null && wait <= MAX_RETRY_AFTER_SECONDS) {
        await sleep(wait * 1000);
        continue;
      }
      return {
        ok: false,
        kind: failure.kind,
        code: failure.code,
        description: failure.description,
      };
    }
  }
}
```

- [ ] **Step 8: Run the tests, format, typecheck**

```bash
npx prettier --write src/telegram-digest
npx jest src/telegram-digest/telegram-digest-dedup.spec.ts src/telegram-digest/telegram-message-parts.spec.ts src/telegram-digest/telegram-send.spec.ts
npm run typecheck
```

Expected: PASS (4 + 12 + 11 tests); typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/telegram-digest
git commit -m "Add digest plumbing: row dedup, 4000-char message parts, classified Telegram sends" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Personal digest renderer (student + staff)

**Files:**
- Create: `src/telegram-digest/telegram-digest-render.service.ts`
- Test: `src/telegram-digest/telegram-digest-render.service.spec.ts`
- Modify: `src/telegram-digest/telegram-digest.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; `dedupRows`/`DedupedRow` (Task 4); `DigestBlock`, `header`, `spacer`, `clipText` (Task 4); `payloadOf`, `TelegramDigestItemRow` (Task 2); `DIGEST_REASON_MAX_CHARS`, `STUDENT_PORTAL_URL` (Task 2); existing `escapeHtml`, `formatSum` (`src/telegram-groups/utils/format.util.ts`), `formatSom` (`src/payments/shared/format-som.ts`), `PAYMENT_METHOD_LABEL` (`src/payments/shared/method-label.ts`), `buildEnrollmentMessage`/`buildRemovalMessage` (`src/sms/sms-templates.ts`), `tashkentDateStr` (`src/common/date/tashkent.ts`).
- Produces (used by Task 7):
  - `interface AuditEntry { itemId: string; content: string; senderUserId: number | null; companyId: number }`
  - `interface RenderedDigest { blocks: DigestBlock[]; audit: AuditEntry[]; hiddenIds: string[] }`
  - `TelegramDigestRenderService.renderStudent(studentId: number, rows: TelegramDigestItemRow[]): Promise<RenderedDigest>`
  - `TelegramDigestRenderService.renderUser(rows: TelegramDigestItemRow[], now?: Date): RenderedDigest`
- Contract: every row passed in ends up either in some block's `itemIds` or in `hiddenIds`, except when `blocks` is empty — then the cron deletes all rows it read. `audit` has one entry per shown STUDENT event and is always empty for staff.

**What the student message keeps from today's instant messages** (spec §Render qoidalari): greeting with the first name; each receipt line with the method label and `📄 Kvitansiya: <url>`; the reversal reason; the enrollment/removal templates (with escaped inputs, a blank line between two of them); the debt section's current debt, "Iltimos, balansingizni to'ldiring." and the portal link; no price when the lesson price is 0; the live balance line on payment days when no debt section is shown; the closing lines "Savollar bo'lsa, markazga murojaat qiling." (after a reversal) and "Rahmat!" (after a receipt).

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram-digest/telegram-digest-render.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  Prisma,
  TelegramDigestCategory,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';
import {
  DigestPayloadByCategory,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';

let seq = 0;
function row<C extends TelegramDigestCategory>(
  category: C,
  payload: DigestPayloadByCategory[C],
  opts: { relatedEntityId?: string | null; at?: string; companyId?: number } = {},
): TelegramDigestItemRow {
  seq += 1;
  return {
    id: `row-${seq}`,
    companyId: opts.companyId ?? 1001,
    branchId: null,
    category,
    relatedEntityId: opts.relatedEntityId ?? null,
    payload: payload as unknown as Prisma.JsonValue,
    createdAt: new Date(opts.at ?? '2026-09-23T10:00:00Z'),
  };
}

/** All block text as one string, with formatSum's U+00A0 made a plain space. */
const textOf = (r: RenderedDigest) =>
  r.blocks
    .map((b) => b.text)
    .join('\n')
    .replace(/\u00A0/g, ' ');

const allIds = (r: RenderedDigest) => [
  ...r.blocks.flatMap((b) => b.itemIds),
  ...r.hiddenIds,
];

describe('TelegramDigestRenderService', () => {
  let service: TelegramDigestRenderService;
  let studentFindUnique: jest.Mock;
  let transactionFindMany: jest.Mock;

  beforeEach(async () => {
    studentFindUnique = jest.fn();
    transactionFindMany = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestRenderService,
        {
          provide: PrismaService,
          useValue: {
            student: { findUnique: studentFindUnique },
            transaction: { findMany: transactionFindMany },
          },
        },
      ],
    }).compile();
    service = module.get(TelegramDigestRenderService);
  });

  const receipt = (paymentId: string, amount: number, method: PaymentMethod) =>
    row(
      TelegramDigestCategory.PAYMENT_RECEIVED,
      {
        paymentId,
        amount,
        method,
        receiptUrl: `https://invoice.dafzentrum.uz/${paymentId}`,
        performedById: 99,
      },
      { relatedEntityId: paymentId },
    );

  const debt = (attendanceId: string, perLessonCost = 20000) =>
    row(
      TelegramDigestCategory.DEBT_CHARGE,
      { attendanceId, groupName: 'A1-01', perLessonCost, date: '2026-09-23' },
      { relatedEntityId: attendanceId },
    );

  describe('renderStudent', () => {
    it('returns nothing for no rows', async () => {
      const r = await service.renderStudent(10042, []);
      expect(r).toEqual({ blocks: [], audit: [], hiddenIds: [] });
    });

    it('renders a receipt with method label, receipt link, live balance and one audit entry', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 2000000 });
      const items = [receipt('pay-1', 1500000, PaymentMethod.TRANSFER)];

      const r = await service.renderStudent(10042, items);
      const text = textOf(r);

      expect(text).toContain('Hurmatli Aziz!');
      expect(text).toContain("💳 <b>To'lovlar</b>");
      expect(text).toContain("<b>1 500 000 so'm</b> to'lovingiz qabul qilindi (Bank o'tkazmasi)");
      expect(text).toContain('📄 Kvitansiya: https://invoice.dafzentrum.uz/pay-1');
      expect(text).toContain("Joriy balansingiz: <b>2 000 000 so'm</b>");
      expect(text.endsWith('Rahmat!')).toBe(true);
      expect(r.audit).toEqual([
        expect.objectContaining({ itemId: items[0].id, senderUserId: 99, companyId: 1001 }),
      ]);
      expect(r.audit[0].content).toContain('Kvitansiya');
    });

    it('shows the reversal reason, escaped', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      const r = await service.renderStudent(10042, [
        row(
          TelegramDigestCategory.PAYMENT_REVERSED,
          { paymentId: 'pay-1', amount: 5000000, reason: 'Summa <ortiqcha> & xato', performedById: null },
          { relatedEntityId: 'pay-1' },
        ),
      ]);
      const text = textOf(r);
      expect(text).toContain("<b>5 000 000 so'm</b> to'lovingiz bekor qilindi");
      expect(text).toContain('Sabab: Summa &lt;ortiqcha&gt; &amp; xato');
      expect(text).toContain("Savollar bo'lsa, markazga murojaat qiling.");
      expect(text).not.toContain('Rahmat!');
      expect(r.audit[0].senderUserId).toBeNull();
    });

    it('renders enrollment and removal notices with escaped group names', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      const r = await service.renderStudent(10042, [
        row(TelegramDigestCategory.STUDENT_ENROLLED, {
          groupName: 'A1 & <B>',
          courseName: 'Standard Deutsch',
          days: null,
          exactDays: ['monday', 'wednesday'],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
        }),
        row(TelegramDigestCategory.STUDENT_REMOVED, {
          groupName: 'B1-2',
          reason: "To'lov qilmagan",
        }),
      ]);
      const text = textOf(r);
      expect(text).toContain('📚 <b>Guruh</b>');
      expect(text).toContain('<b>A1 &amp; &lt;B&gt;</b>');
      expect(text).toContain('Dushanba, Chorshanba');
      expect(text).toContain("Guruhdan chiqarildingiz");
      expect(text).toContain("Sabab: To'lov qilmagan");
      expect(text).toContain("Muvaffaqiyat tilaymiz!\n\n❌ <b>Guruhdan chiqarildingiz</b>");
      expect(text).not.toContain('Joriy balansingiz'); // no money moved
      expect(r.audit).toHaveLength(2);
    });

    it('shows a live debt with price, current debt, top-up request and portal link', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -20000 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);

      const r = await service.renderStudent(10042, [debt('att-1')]);
      const text = textOf(r);

      expect(text).toContain('⚠️ <b>Qarzga yozilgan darslar</b>');
      expect(text).toContain("• A1-01 (23.09.2026) — 20 000 so'm");
      expect(text).toContain("Hozirgi qarz: <b>20 000 so'm</b>");
      expect(text).toContain("Iltimos, balansingizni to'ldiring.");
      expect(text).toContain('🔗 Profilingiz: https://student.dafzentrum.uz');
      expect(transactionFindMany).toHaveBeenCalledWith({
        where: {
          studentId: 10042,
          attendanceId: { in: ['att-1'] },
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
          metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
        },
        select: { attendanceId: true },
      });
    });

    it('omits the price when the lesson price is 0', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -1 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const text = textOf(await service.renderStudent(10042, [debt('att-1', 0)]));
      expect(text).toContain('• A1-01 (23.09.2026)');
      expect(text).not.toContain("— 0 so'm");
    });

    it('hides the debt section once the balance is back to non-negative', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: 0 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const items = [debt('att-1')];

      const r = await service.renderStudent(10042, items);

      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('hides a charge that was reversed before 20:00 even while in debt', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -50000 });
      transactionFindMany.mockResolvedValue([]); // deduction since reversed
      const items = [debt('att-1'), receipt('pay-1', 100000, PaymentMethod.CASH)];

      const r = await service.renderStudent(10042, items);
      const text = textOf(r);

      expect(text).not.toContain('Qarzga yozilgan darslar');
      expect(text).toContain("Joriy balansingiz: <b>-50 000 so'm</b>");
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('merges repeated rows of one attendance into one line carrying both ids', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -20000 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const first = debt('att-1');
      const second = debt('att-1');

      const r = await service.renderStudent(10042, [first, second]);

      expect(textOf(r).match(/A1-01/g)).toHaveLength(1);
      expect(allIds(r).sort()).toEqual([first.id, second.id].sort());
      expect(r.audit).toHaveLength(1);
    });

    it('hides everything when the student row is gone', async () => {
      studentFindUnique.mockResolvedValue(null);
      const items = [receipt('pay-1', 100000, PaymentMethod.CASH)];
      const r = await service.renderStudent(10042, items);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([items[0].id]);
    });

    it('accounts for every row it was given', async () => {
      studentFindUnique.mockResolvedValue({ firstName: 'Aziz', balance: -20000 });
      transactionFindMany.mockResolvedValue([{ attendanceId: 'att-1' }]);
      const items = [
        receipt('pay-1', 100000, PaymentMethod.CASH),
        debt('att-1'),
        debt('att-2'),
        row(TelegramDigestCategory.STUDENT_REMOVED, { groupName: 'B1', reason: 'x' }),
      ];
      const r = await service.renderStudent(10042, items);
      expect(allIds(r).sort()).toEqual(items.map((i) => i.id).sort());
    });
  });

  describe('renderUser', () => {
    const NOW = new Date('2026-09-23T15:00:00Z'); // 20:00 Tashkent

    it('returns nothing for no rows', () => {
      expect(service.renderUser([], NOW)).toEqual({ blocks: [], audit: [], hiddenIds: [] });
    });

    it('lists attendance per group, omits zero counts, dates past days', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g1', groupName: 'A1-01', date: '2026-09-23',
              present: 8, absent: 0, late: 1, excused: 0,
            }),
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g2', groupName: 'B1-02', date: '2026-09-22',
              present: 0, absent: 3, late: 0, excused: 0,
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('✅ <b>Davomat qabul qilindi</b>');
      expect(text).toContain('• A1-01 — Keldi: 8 / Kechikdi: 1');
      expect(text).toContain('• B1-02 (22.09.2026) — Kelmadi: 3');
      expect(text).not.toContain('Keldi: 0');
    });

    it('renders every task kind and escapes free text', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.TASK_ASSIGNED, { authorName: 'CEO', content: 'Hisobot <tez>' }, { relatedEntityId: 'c1' }),
            row(TelegramDigestCategory.TASK_UPDATED, { authorName: 'CEO', content: 'Yangi matn' }, { relatedEntityId: 'c2' }),
            row(TelegramDigestCategory.TASK_DELETED, { authorName: 'CEO', content: 'Eski' }, { relatedEntityId: 'c3' }),
            row(TelegramDigestCategory.TASK_STATUS_CHANGED, { assigneeName: 'Ali Valiyev', status: 'DONE', content: 'Hisobot' }, { relatedEntityId: 'c1:20001' }),
            row(TelegramDigestCategory.TASK_STATUS_CHANGED, { assigneeName: 'Vali Aliyev', status: 'SEEN', content: 'Hisobot' }, { relatedEntityId: 'c1:20002' }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('📝 <b>Topshiriqlar</b>');
      expect(text).toContain('• CEO sizga topshiriq berdi: "Hisobot &lt;tez&gt;"');
      expect(text).toContain('• CEO topshiriqni yangiladi: "Yangi matn"');
      expect(text).toContain(`• CEO topshiriqni o'chirdi: "Eski"`);
      expect(text).toContain('• Ali Valiyev topshiriqni bajardi: "Hisobot"');
      expect(text).toContain(`• Vali Aliyev topshiriqni ko'rdi: "Hisobot"`);
    });

    it('shows only the latest update of the same task', () => {
      const r = service.renderUser(
        [
          row(TelegramDigestCategory.TASK_UPDATED, { authorName: 'CEO', content: 'birinchi' }, { relatedEntityId: 'c1', at: '2026-09-23T04:00:00Z' }),
          row(TelegramDigestCategory.TASK_UPDATED, { authorName: 'CEO', content: 'oxirgi' }, { relatedEntityId: 'c1', at: '2026-09-23T06:00:00Z' }),
        ],
        NOW,
      );
      expect(textOf(r)).toContain('oxirgi');
      expect(textOf(r)).not.toContain('birinchi');
      expect(allIds(r)).toHaveLength(2);
    });

    it('sums carried-over salary rows into one line', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, { count: 2, total: 40000 }),
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, { count: 1, total: 25000 }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('💵 <b>Oylik</b>');
      expect(text).toContain("oldingi oydagi 3 ta dars uchun <b>65 000 so'm</b> joriy oyligingizga qo'shildi.");
    });

    it("renders a payment correction exactly like today's CEO alert", () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.PAYMENT_CORRECTED, {
              performerName: 'Admin User', studentName: 'Ali Valiyev', studentId: 10001,
              oldAmount: 5000000, newAmount: 400000,
              oldMethod: PaymentMethod.CASH, newMethod: PaymentMethod.TRANSFER,
              reason: 'Ortiqcha nol kiritilgan',
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain("✏️ <b>To'g'irlangan to'lovlar</b>");
      expect(text).toContain(
        "• Admin User Ali Valiyevning to'lovini to'g'riladi: 5 000 000 → 400 000 so'm, Naqd → Bank o'tkazmasi. Sabab: Ortiqcha nol kiritilgan",
      );
    });

    it('orders sections: attendance, tasks, salary, corrections', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.PAYMENT_CORRECTED, {
              performerName: 'A', studentName: 'B', studentId: 1,
              oldAmount: 1, newAmount: 2,
              oldMethod: PaymentMethod.CASH, newMethod: PaymentMethod.CASH, reason: 'r',
            }),
            row(TelegramDigestCategory.SALARY_CARRIED_OVER, { count: 1, total: 1 }),
            row(TelegramDigestCategory.TASK_ASSIGNED, { authorName: 'A', content: 'c' }, { relatedEntityId: 'c9' }),
            row(TelegramDigestCategory.ATTENDANCE_COMPLETED, {
              groupId: 'g', groupName: 'G', date: '2026-09-23', present: 1, absent: 0, late: 0, excused: 0,
            }),
          ],
          NOW,
        ),
      );
      const order = ['Davomat', 'Topshiriqlar', 'Oylik', "To'g'irlangan"].map((h) => text.indexOf(h));
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(order.every((i) => i >= 0)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-digest/telegram-digest-render.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the renderer**

```typescript
// src/telegram-digest/telegram-digest-render.service.ts
import { Injectable } from '@nestjs/common';
import { TelegramDigestCategory, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { formatSom } from '../payments/shared/format-som';
import { PAYMENT_METHOD_LABEL } from '../payments/shared/method-label';
import {
  buildEnrollmentMessage,
  buildRemovalMessage,
} from '../sms/sms-templates';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';
import {
  DIGEST_REASON_MAX_CHARS,
  STUDENT_PORTAL_URL,
} from './telegram-digest.constants';
import { DedupedRow, dedupRows } from './telegram-digest-dedup';
import {
  payloadOf,
  TaskDigestPayload,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';
import {
  clipText,
  DigestBlock,
  header,
  spacer,
} from './telegram-message-parts';

export interface AuditEntry {
  /** The shown row this SmsMessage stands for. */
  itemId: string;
  /** The event's text exactly as it appears in the digest. */
  content: string;
  senderUserId: number | null;
  companyId: number;
}

export interface RenderedDigest {
  blocks: DigestBlock[];
  /** STUDENT only: one SmsMessage per shown event (ADR-0025 audit rule). */
  audit: AuditEntry[];
  /** Rows read but deliberately not shown — a debt already paid, a charge reversed. */
  hiddenIds: string[];
}

/** A fresh empty result — never share arrays between calls. */
const nothing = (): RenderedDigest => ({ blocks: [], audit: [], hiddenIds: [] });

const TASK_VERB: Partial<Record<TelegramDigestCategory, string>> = {
  TASK_ASSIGNED: 'sizga topshiriq berdi',
  TASK_UPDATED: 'topshiriqni yangiladi',
  TASK_DELETED: "topshiriqni o'chirdi",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  SEEN: "ko'rdi",
  DONE: 'bajardi',
};

/** 'YYYY-MM-DD' → 'DD.MM.YYYY'. */
function formatIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

const nullableEscape = (value: string | null) =>
  value === null ? null : escapeHtml(value);

/**
 * Renders the 20:00 personal digest from one person's queued rows. The
 * student's balance and debt are re-read here — never trusted from the
 * payload — because a figure written hours earlier may be stale by now.
 */
@Injectable()
export class TelegramDigestRenderService {
  constructor(private readonly prisma: PrismaService) {}

  async renderStudent(
    studentId: number,
    rows: TelegramDigestItemRow[],
  ): Promise<RenderedDigest> {
    if (rows.length === 0) return nothing();
    const allHidden = { ...nothing(), hiddenIds: rows.map((r) => r.id) };

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, balance: true },
    });
    if (!student) return allHidden;

    const entries = dedupRows(rows);
    const payments = entries.filter(
      (e) =>
        e.row.category === TelegramDigestCategory.PAYMENT_RECEIVED ||
        e.row.category === TelegramDigestCategory.PAYMENT_REVERSED,
    );
    const notices = entries.filter(
      (e) =>
        e.row.category === TelegramDigestCategory.STUDENT_ENROLLED ||
        e.row.category === TelegramDigestCategory.STUDENT_REMOVED,
    );
    const debts = entries.filter(
      (e) => e.row.category === TelegramDigestCategory.DEBT_CHARGE,
    );
    const liveDebts = await this.stillCharged(studentId, debts);
    const showDebt = liveDebts.length > 0 && student.balance < 0;
    const hiddenIds = debts
      .filter((e) => !showDebt || !liveDebts.includes(e))
      .flatMap((e) => e.ids);

    const audit: AuditEntry[] = [];
    const eventBlock = (
      entry: DedupedRow,
      text: string,
      senderUserId: number | null,
    ): DigestBlock => {
      audit.push({
        itemId: entry.row.id,
        content: text,
        senderUserId,
        companyId: entry.row.companyId,
      });
      return { text, itemIds: entry.ids };
    };

    const sections: DigestBlock[][] = [];
    if (payments.length > 0) {
      sections.push([
        header("💳 <b>To'lovlar</b>"),
        ...payments.map((e) =>
          eventBlock(e, this.paymentText(e.row), this.performerOf(e.row)),
        ),
      ]);
    }
    if (notices.length > 0) {
      sections.push([
        header('📚 <b>Guruh</b>'),
        // The notices are multi-line templates — keep a blank line between them.
        ...notices.flatMap((e, i) => {
          const block = eventBlock(e, this.noticeText(e.row), null);
          return i === 0 ? [block] : [spacer(), block];
        }),
      ]);
    }
    if (showDebt) {
      sections.push([
        header('⚠️ <b>Qarzga yozilgan darslar</b>'),
        ...liveDebts.map((e) => eventBlock(e, this.debtText(e.row), null)),
        {
          text: [
            `Hozirgi qarz: <b>${formatSum(-student.balance)}</b>`,
            "Iltimos, balansingizni to'ldiring.",
            `🔗 Profilingiz: ${STUDENT_PORTAL_URL}`,
          ].join('\n'),
          itemIds: [],
        },
      ]);
    }
    if (sections.length === 0) return allHidden;

    const blocks: DigestBlock[] = [];
    if (student.firstName) {
      blocks.push({
        text: `Hurmatli ${escapeHtml(student.firstName)}!`,
        itemIds: [],
      });
    }
    for (const section of sections) blocks.push(spacer(), ...section);
    if (payments.length > 0 && !showDebt) {
      blocks.push(spacer(), {
        text: `Joriy balansingiz: <b>${formatSum(student.balance)}</b>`,
        itemIds: [],
      });
    }
    // The closing lines today's instant receipt and reversal notice end with.
    const closing: string[] = [];
    if (payments.some((e) => e.row.category === TelegramDigestCategory.PAYMENT_REVERSED)) {
      closing.push("Savollar bo'lsa, markazga murojaat qiling.");
    }
    if (payments.some((e) => e.row.category === TelegramDigestCategory.PAYMENT_RECEIVED)) {
      closing.push('Rahmat!');
    }
    if (closing.length > 0) {
      blocks.push(spacer(), { text: closing.join('\n'), itemIds: [] });
    }
    return { blocks, audit, hiddenIds };
  }

  renderUser(
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): RenderedDigest {
    if (rows.length === 0) return nothing();
    const entries = dedupRows(rows);
    const today = tashkentDateStr(now);
    const of = (...categories: TelegramDigestCategory[]) =>
      entries.filter((e) => categories.includes(e.row.category));

    const attendance = of(TelegramDigestCategory.ATTENDANCE_COMPLETED);
    const tasks = of(
      TelegramDigestCategory.TASK_ASSIGNED,
      TelegramDigestCategory.TASK_UPDATED,
      TelegramDigestCategory.TASK_DELETED,
      TelegramDigestCategory.TASK_STATUS_CHANGED,
    );
    const salary = of(TelegramDigestCategory.SALARY_CARRIED_OVER);
    const corrections = of(TelegramDigestCategory.PAYMENT_CORRECTED);

    const sections: DigestBlock[][] = [];
    if (attendance.length > 0) {
      sections.push([
        header('✅ <b>Davomat qabul qilindi</b>'),
        ...attendance.map((e) => ({
          text: this.attendanceText(e.row, today),
          itemIds: e.ids,
        })),
      ]);
    }
    if (tasks.length > 0) {
      sections.push([
        header('📝 <b>Topshiriqlar</b>'),
        ...tasks.map((e) => ({ text: this.taskText(e.row), itemIds: e.ids })),
      ]);
    }
    if (salary.length > 0) {
      let count = 0;
      let total = 0;
      for (const e of salary) {
        const p = payloadOf(e.row, TelegramDigestCategory.SALARY_CARRIED_OVER);
        count += p.count;
        total += p.total;
      }
      sections.push([
        header('💵 <b>Oylik</b>'),
        {
          text: `Kechikkan to'lov tufayli oldingi oydagi ${count} ta dars uchun <b>${formatSum(total)}</b> joriy oyligingizga qo'shildi.`,
          itemIds: salary.flatMap((e) => e.ids),
        },
      ]);
    }
    if (corrections.length > 0) {
      sections.push([
        header("✏️ <b>To'g'irlangan to'lovlar</b>"),
        ...corrections.map((e) => ({
          text: this.correctionText(e.row),
          itemIds: e.ids,
        })),
      ]);
    }

    const blocks = sections.flatMap((section, i) =>
      i === 0 ? section : [spacer(), ...section],
    );
    return { blocks, audit: [], hiddenIds: [] };
  }

  /**
   * A queued charge is shown only while its SINGLE_UNCOVERED deduction still
   * stands: a lesson re-marked as excused before 20:00 was refunded and must
   * not be reported as debt.
   */
  private async stillCharged(
    studentId: number,
    debts: DedupedRow[],
  ): Promise<DedupedRow[]> {
    if (debts.length === 0) return [];
    const attendanceIdOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.DEBT_CHARGE).attendanceId;
    const live = await this.prisma.transaction.findMany({
      where: {
        studentId,
        attendanceId: { in: debts.map(attendanceIdOf) },
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
      },
      select: { attendanceId: true },
    });
    const liveIds = new Set(live.map((t) => t.attendanceId));
    return debts.filter((e) => liveIds.has(attendanceIdOf(e)));
  }

  private paymentText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.PAYMENT_RECEIVED) {
      const p = payloadOf(row, TelegramDigestCategory.PAYMENT_RECEIVED);
      const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
      return [
        `• <b>${formatSum(p.amount)}</b> to'lovingiz qabul qilindi (${escapeHtml(method)})`,
        `📄 Kvitansiya: ${escapeHtml(p.receiptUrl)}`,
      ].join('\n');
    }
    const p = payloadOf(row, TelegramDigestCategory.PAYMENT_REVERSED);
    const lines = [`• <b>${formatSum(p.amount)}</b> to'lovingiz bekor qilindi`];
    if (p.reason) {
      lines.push(
        `Sabab: ${escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS))}`,
      );
    }
    return lines.join('\n');
  }

  private performerOf(row: TelegramDigestItemRow): number | null {
    return row.category === TelegramDigestCategory.PAYMENT_RECEIVED
      ? payloadOf(row, TelegramDigestCategory.PAYMENT_RECEIVED).performedById
      : payloadOf(row, TelegramDigestCategory.PAYMENT_REVERSED).performedById;
  }

  /** Today's instant templates, with every interpolated value escaped. */
  private noticeText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.STUDENT_ENROLLED) {
      const p = payloadOf(row, TelegramDigestCategory.STUDENT_ENROLLED);
      return buildEnrollmentMessage({
        groupName: escapeHtml(p.groupName),
        courseName: escapeHtml(p.courseName),
        days: nullableEscape(p.days),
        exactDays: p.exactDays.map((d) => escapeHtml(d)),
        lessonStartTime: nullableEscape(p.lessonStartTime),
        lessonEndTime: nullableEscape(p.lessonEndTime),
      });
    }
    const p = payloadOf(row, TelegramDigestCategory.STUDENT_REMOVED);
    return buildRemovalMessage({
      groupName: escapeHtml(p.groupName),
      reason: escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS)),
    });
  }

  private debtText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.DEBT_CHARGE);
    const price = p.perLessonCost > 0 ? ` — ${formatSum(p.perLessonCost)}` : '';
    return `• ${escapeHtml(p.groupName)} (${formatIsoDate(p.date)})${price}`;
  }

  private attendanceText(row: TelegramDigestItemRow, today: string): string {
    const p = payloadOf(row, TelegramDigestCategory.ATTENDANCE_COMPLETED);
    const counts: [string, number][] = [
      ['Keldi', p.present],
      ['Kelmadi', p.absent],
      ['Kechikdi', p.late],
      ['Sababli', p.excused],
    ];
    const stats = counts
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label}: ${n}`)
      .join(' / ');
    const date = p.date === today ? '' : ` (${formatIsoDate(p.date)})`;
    return `• ${escapeHtml(p.groupName)}${date}${stats ? ` — ${stats}` : ''}`;
  }

  private taskText(row: TelegramDigestItemRow): string {
    if (row.category === TelegramDigestCategory.TASK_STATUS_CHANGED) {
      const p = payloadOf(row, TelegramDigestCategory.TASK_STATUS_CHANGED);
      const label = TASK_STATUS_LABEL[p.status] ?? p.status;
      return `• ${escapeHtml(p.assigneeName)} topshiriqni ${escapeHtml(label)}: "${escapeHtml(p.content)}"`;
    }
    // TASK_ASSIGNED / TASK_UPDATED / TASK_DELETED share one payload shape.
    const p = row.payload as unknown as TaskDigestPayload;
    const verb = TASK_VERB[row.category] ?? 'topshiriqni yangiladi';
    return `• ${escapeHtml(p.authorName)} ${verb}: "${escapeHtml(p.content)}"`;
  }

  /** Same wording as the instant CEO alert in notification-events.listener. */
  private correctionText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.PAYMENT_CORRECTED);
    const changes: string[] = [];
    if (p.oldAmount !== p.newAmount) {
      changes.push(`${formatSom(p.oldAmount)} → ${formatSom(p.newAmount)} so'm`);
    }
    if (p.oldMethod !== p.newMethod) {
      changes.push(
        `${PAYMENT_METHOD_LABEL[p.oldMethod] ?? p.oldMethod} → ${PAYMENT_METHOD_LABEL[p.newMethod] ?? p.newMethod}`,
      );
    }
    const reason = escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS));
    return `• ${escapeHtml(p.performerName)} ${escapeHtml(p.studentName)}ning to'lovini to'g'riladi: ${changes.join(', ')}. Sabab: ${reason}`;
  }
}
```

- [ ] **Step 4: Register it**

Add `TelegramDigestRenderService` to `providers` in `src/telegram-digest/telegram-digest.module.ts`.

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/telegram-digest
npx jest src/telegram-digest/telegram-digest-render.service.spec.ts
npm run typecheck
```

Expected: PASS (18 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/telegram-digest
git commit -m "Add the personal digest renderer with receipt links, debt re-check and escaping" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Student audit writer (SmsMessage + history)

**Files:**
- Create: `src/telegram-digest/telegram-digest-audit.service.ts`
- Test: `src/telegram-digest/telegram-digest-audit.service.spec.ts`
- Modify: `src/telegram-digest/telegram-digest.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; `EntityHistoryService` (global, from `src/common/entity-history`); `truncateChars`; `AuditEntry` (Task 5).
- Produces: `TelegramDigestAuditService.record(studentId: number, entries: AuditEntry[], outcome: AuditOutcome): Promise<void>` with `type AuditOutcome = { status: 'SENT'; telegramMessageId: number } | { status: 'FAILED'; errorMessage: string }`. Never throws.

The shape is copied from `SmsService.sendToStudent` (`src/sms/sms.service.ts:94-121`), which stays untouched: one `SmsMessage` row (shown in the student profile "SMS" tab) and one `EntityHistory` create entry per event.

The digest text is HTML-escaped for Telegram (`&amp;`, `&lt;`, `&gt;`). The SMS tab (`client/src/components/students/sms-tab.tsx`) escapes stored text once more before showing it, so the audit stores readable text: entities are decoded; the `<b>` tags stay (the tab renders them).

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram-digest/telegram-digest-audit.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { AuditEntry } from './telegram-digest-render.service';

describe('TelegramDigestAuditService', () => {
  let service: TelegramDigestAuditService;
  let smsCreate: jest.Mock;
  let recordCreate: jest.Mock;

  const entry = (itemId: string, senderUserId: number | null): AuditEntry => ({
    itemId,
    content: "• <b>100 000 so'm</b> to'lovingiz qabul qilindi (Naqd)",
    senderUserId,
    companyId: 1001,
  });

  beforeEach(async () => {
    smsCreate = jest.fn().mockResolvedValue({});
    recordCreate = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestAuditService,
        { provide: PrismaService, useValue: { smsMessage: { create: smsCreate } } },
        { provide: EntityHistoryService, useValue: { recordCreate } },
      ],
    }).compile();
    service = module.get(TelegramDigestAuditService);
  });

  it('writes one SENT SmsMessage and one history entry per event, sharing the message id', async () => {
    await service.record(10042, [entry('r1', 99), entry('r2', null)], {
      status: 'SENT',
      telegramMessageId: 555,
    });

    expect(smsCreate).toHaveBeenCalledTimes(2);
    expect(smsCreate).toHaveBeenCalledWith({
      data: {
        studentId: 10042,
        content: "• <b>100 000 so'm</b> to'lovingiz qabul qilindi (Naqd)",
        type: SmsMessageType.AUTO,
        status: 'SENT',
        senderUserId: 99,
        telegramMessageId: 555,
        errorMessage: null,
        companyId: 1001,
      },
    });
    expect(recordCreate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 10042,
      newValues: {
        action: 'SMS_YUBORILDI',
        tur: 'Avtomatik',
        xabar: "• 100 000 so'm to'lovingiz qabul qilindi (Naqd)",
        holat: 'Yuborildi',
      },
      changedById: 99,
      companyId: 1001,
    });
  });

  it('writes FAILED rows with the error message', async () => {
    await service.record(10042, [entry('r1', null)], {
      status: 'FAILED',
      errorMessage: "Telegram bog'lanmagan",
    });

    expect(smsCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'FAILED',
        telegramMessageId: null,
        errorMessage: "Telegram bog'lanmagan",
      }),
    });
    expect(recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'SMS_YUBORILMADI',
          holat: "Telegram bog'lanmagan",
        }),
        changedById: undefined,
      }),
    );
  });

  it('stores readable text: entities are decoded for the SMS tab and history', async () => {
    await service.record(
      10042,
      [{ itemId: 'r1', content: '📚 Guruh: <b>A1 &amp; &lt;B&gt;</b>', senderUserId: null, companyId: 1001 }],
      { status: 'SENT', telegramMessageId: 7 },
    );

    expect(smsCreate.mock.calls[0][0].data.content).toBe('📚 Guruh: <b>A1 & <B></b>');
    expect(recordCreate.mock.calls[0][0].newValues.xabar).toBe('📚 Guruh: A1 & <B>');
  });

  it('keeps going when one write fails and never throws', async () => {
    smsCreate.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.record(10042, [entry('r1', null), entry('r2', null)], {
        status: 'SENT',
        telegramMessageId: 1,
      }),
    ).resolves.toBeUndefined();
    expect(smsCreate).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-digest/telegram-digest-audit.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement it**

```typescript
// src/telegram-digest/telegram-digest-audit.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SmsMessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { truncateChars } from '../common/utils/text.util';
import { AuditEntry } from './telegram-digest-render.service';
import { describeError } from './telegram-send';

export type AuditOutcome =
  | { status: 'SENT'; telegramMessageId: number }
  | { status: 'FAILED'; errorMessage: string };

/**
 * Undoes `escapeHtml` for storage. The SMS tab escapes stored text before
 * rendering, so a stored `&amp;` would show literally. `&amp;` goes last, so
 * an escaped literal "&lt;" in the source text survives as "&lt;".
 */
function decodeHtmlEntities(text: string): string {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Leaves the same trail per student message that `SmsService.sendToStudent`
 * leaves (sms.service.ts:94-121 — kept untouched): an `SmsMessage` row for the
 * profile "SMS" tab and a history entry. One row per event, written when the
 * digest actually went out (ADR-0025). Audit failures are logged, never thrown:
 * a missing audit row must not make the cron resend a delivered message.
 */
@Injectable()
export class TelegramDigestAuditService {
  private readonly logger = new Logger(TelegramDigestAuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entityHistory: EntityHistoryService,
  ) {}

  async record(
    studentId: number,
    entries: AuditEntry[],
    outcome: AuditOutcome,
  ): Promise<void> {
    const sent = outcome.status === 'SENT';
    for (const entry of entries) {
      try {
        await this.prisma.smsMessage.create({
          data: {
            studentId,
            content: decodeHtmlEntities(entry.content),
            type: SmsMessageType.AUTO,
            status: outcome.status,
            senderUserId: entry.senderUserId,
            telegramMessageId: sent ? outcome.telegramMessageId : null,
            errorMessage: sent ? null : outcome.errorMessage,
            companyId: entry.companyId,
          },
        });
        await this.entityHistory.recordCreate({
          entityType: 'Student',
          entityId: studentId,
          newValues: {
            action: sent ? 'SMS_YUBORILDI' : 'SMS_YUBORILMADI',
            tur: 'Avtomatik',
            // Strip tags first (on the escaped text), then decode, so a
            // literal "<B>" typed by an admin survives as text.
            xabar: truncateChars(
              decodeHtmlEntities(entry.content.replace(/<[^>]*>/g, '')),
              100,
            ),
            holat: sent ? 'Yuborildi' : outcome.errorMessage,
          },
          changedById: entry.senderUserId ?? undefined,
          companyId: entry.companyId,
        });
      } catch (err) {
        this.logger.warn(
          `Digest audit write failed for student ${studentId}: ${describeError(err)}`,
        );
      }
    }
  }
}
```

- [ ] **Step 4: Register it**

Add `TelegramDigestAuditService` to `providers` in `src/telegram-digest/telegram-digest.module.ts`.

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/telegram-digest
npx jest src/telegram-digest/telegram-digest-audit.service.spec.ts
npm run typecheck
```

Expected: PASS (4 tests); typecheck exits 0. If typecheck rejects `changedById: … ?? undefined` or `companyId`, open `src/common/entity-history/entity-history.service.ts` (`BaseHistoryParams`) and match its field types exactly — do not cast.

- [ ] **Step 6: Commit**

```bash
git add src/telegram-digest
git commit -m "Add the digest audit writer mirroring SmsService's SmsMessage and history rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Personal 20:00 cron, boot check, first checkpoint

**Files:**
- Create: `src/telegram-digest/telegram-digest-personal-cron.service.ts`
- Test: `src/telegram-digest/telegram-digest-personal-cron.service.spec.ts`
- Modify: `src/telegram-digest/telegram-digest.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; `TelegramService.getBot()` (main bot — the one every personal chat id belongs to); `TelegramDigestChatResolverService` (Task 3); `TelegramDigestRenderService` (Task 5); `TelegramDigestAuditService` (Task 6); `packBlocks` (Task 4); `sendTelegramText`, `describeError`, `TelegramTextSender`, `TelegramFailure` (Task 4); `DIGEST_ROW_MAX_AGE_MS` (Task 2).
- Produces: `TelegramDigestPersonalCronService.flush(): Promise<void>` — `@Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })`; nothing calls it directly.

**Behavior (spec §Kechqurungi shaxsiy cron):**
1. Purge STUDENT/USER rows older than 7 days first — before the bot check — and `warn` once if more than one was purged.
2. No bot → `warn` and stop (rows stay for the next run).
3. Read rows ordered by `createdAt`, `id`; group by `recipientKind:recipientId`; process each person in its own `try/catch`.
4. No chat → delete the person's rows; for a student who still exists (not deleted), write FAILED "Telegram bog'lanmagan" audit rows for enrollment/removal notices only (exactly what `SmsService` does today; receipts never got one).
5. Render; no blocks → delete the rows.
6. Send the parts in order through `sendTelegramText` with `{ parse_mode: 'HTML', link_preview_options: { is_disabled: true } }`. After each delivered part: delete that part's rows **at once** (one retry on a DB error) — so a later failure or a crash can never make tomorrow's run send it again — then audit SENT for that part's events (students only).
7. All parts delivered → delete whatever else was read (the hidden rows).
8. A part fails → the hidden rows go too if something was already delivered. Then: `permanent` → FAILED audit for the undelivered events (students) and delete the rest; `content` → keep the rest, `Logger.error`; `transient` → keep the rest, `Logger.warn`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/telegram-digest/telegram-digest-personal-cron.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';
import { TelegramDigestPersonalCronService } from './telegram-digest-personal-cron.service';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';

type QueuedRow = {
  id: string;
  recipientKind: TelegramDigestRecipientKind;
  recipientId: number;
  companyId: number;
  branchId: number | null;
  category: TelegramDigestCategory;
  relatedEntityId: string | null;
  payload: Prisma.JsonValue;
  createdAt: Date;
};

const queued = (
  id: string,
  recipientKind: TelegramDigestRecipientKind,
  recipientId: number,
  category: TelegramDigestCategory = TelegramDigestCategory.PAYMENT_RECEIVED,
): QueuedRow => ({
  id,
  recipientKind,
  recipientId,
  companyId: 1001,
  branchId: null,
  category,
  relatedEntityId: null,
  payload: {},
  createdAt: new Date('2026-09-23T10:00:00Z'),
});

/** One block per row id, sized so `chars` decides how many parts it makes. */
const rendered = (ids: string[], chars = 10): RenderedDigest => ({
  blocks: ids.map((id) => ({ text: 'x'.repeat(chars), itemIds: [id] })),
  audit: ids.map((id) => ({ itemId: id, content: `c-${id}`, senderUserId: null, companyId: 1001 })),
  hiddenIds: [],
});

const tgError = (error_code: number, description: string) => ({
  response: { error_code, description },
});

describe('TelegramDigestPersonalCronService', () => {
  let service: TelegramDigestPersonalCronService;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let studentFindFirst: jest.Mock;
  let sendMessage: jest.Mock;
  let getBot: jest.Mock;
  let resolveChatId: jest.Mock;
  let renderStudent: jest.Mock;
  let renderUser: jest.Mock;
  let record: jest.Mock;

  /** Ids passed to every deleteMany call except the age purge. */
  const deletedIds = () =>
    deleteMany.mock.calls
      .map(([arg]) => arg.where.id?.in as string[] | undefined)
      .filter((ids): ids is string[] => Array.isArray(ids))
      .flat()
      .sort();

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    studentFindFirst = jest.fn().mockResolvedValue({ id: 10042 });
    sendMessage = jest.fn().mockResolvedValue({ message_id: 700 });
    getBot = jest.fn().mockReturnValue({ telegram: { sendMessage } });
    resolveChatId = jest.fn().mockResolvedValue('chat-1');
    renderStudent = jest.fn();
    renderUser = jest.fn();
    record = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramDigestPersonalCronService,
        {
          provide: PrismaService,
          useValue: {
            telegramDigestItem: { findMany, deleteMany },
            student: { findFirst: studentFindFirst },
          },
        },
        { provide: TelegramService, useValue: { getBot } },
        { provide: TelegramDigestChatResolverService, useValue: { resolveChatId } },
        { provide: TelegramDigestRenderService, useValue: { renderStudent, renderUser } },
        { provide: TelegramDigestAuditService, useValue: { record } },
      ],
    }).compile();
    service = module.get(TelegramDigestPersonalCronService);
  });

  it('purges rows older than 7 days first, even without a bot', async () => {
    getBot.mockReturnValue(null);
    deleteMany.mockResolvedValueOnce({ count: 3 });
    const warn = jest.spyOn((service as any).logger, 'warn');

    await service.flush();

    const purge = deleteMany.mock.calls[0][0];
    expect(purge.where.recipientKind).toEqual({
      in: [TelegramDigestRecipientKind.STUDENT, TelegramDigestRecipientKind.USER],
    });
    expect(purge.where.createdAt.lt).toBeInstanceOf(Date);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('3'));
    expect(findMany).not.toHaveBeenCalled();
  });

  it('sends one message per student, audits it, then deletes every row read', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1', 's2']));

    await service.flush();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        recipientKind: {
          in: [TelegramDigestRecipientKind.STUDENT, TelegramDigestRecipientKind.USER],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(resolveChatId).toHaveBeenCalledWith('STUDENT', 10042);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-1', expect.any(String), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    expect(record).toHaveBeenCalledWith(
      10042,
      [expect.objectContaining({ itemId: 's1' }), expect.objectContaining({ itemId: 's2' })],
      { status: 'SENT', telegramMessageId: 700 },
    );
    expect(deletedIds()).toEqual(['s1', 's2']);
  });

  it('never mixes a student and a staff member who share an id', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 5),
      queued('u1', TelegramDigestRecipientKind.USER, 5, TelegramDigestCategory.TASK_ASSIGNED),
    ]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    renderUser.mockReturnValue(rendered(['u1']));

    await service.flush();

    expect(renderStudent).toHaveBeenCalledWith(5, [expect.objectContaining({ id: 's1' })]);
    expect(renderUser).toHaveBeenCalledWith([expect.objectContaining({ id: 'u1' })]);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1); // staff messages leave no SmsMessage
  });

  it('drops rows of a student without Telegram; audits only group notices as FAILED', async () => {
    findMany.mockResolvedValue([
      queued('pay', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('enr', TelegramDigestRecipientKind.STUDENT, 10042, TelegramDigestCategory.STUDENT_ENROLLED),
    ]);
    resolveChatId.mockResolvedValue(null);
    renderStudent.mockResolvedValue(rendered(['enr']));

    await service.flush();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(renderStudent).toHaveBeenCalledWith(10042, [expect.objectContaining({ id: 'enr' })]);
    expect(record).toHaveBeenCalledWith(
      10042,
      [expect.objectContaining({ itemId: 'enr' })],
      { status: 'FAILED', errorMessage: "Telegram bog'lanmagan" },
    );
    expect(deletedIds()).toEqual(['enr', 'pay']);
  });

  it('does not audit a deleted student as "not linked"', async () => {
    findMany.mockResolvedValue([
      queued('enr', TelegramDigestRecipientKind.STUDENT, 10042, TelegramDigestCategory.STUDENT_ENROLLED),
    ]);
    resolveChatId.mockResolvedValue(null);
    studentFindFirst.mockResolvedValue(null); // deleted

    await service.flush();

    expect(record).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['enr']);
  });

  it('deletes rows that render to nothing without sending', async () => {
    findMany.mockResolvedValue([queued('d1', TelegramDigestRecipientKind.STUDENT, 10042)]);
    renderStudent.mockResolvedValue({ blocks: [], audit: [], hiddenIds: ['d1'] });

    await service.flush();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['d1']);
  });

  it('drops rows and audits FAILED on a permanent error', async () => {
    findMany.mockResolvedValue([queued('s1', TelegramDigestRecipientKind.STUDENT, 10042)]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    sendMessage.mockRejectedValue(tgError(403, 'Forbidden: bot was blocked by the user'));

    await service.flush();

    expect(record).toHaveBeenCalledWith(10042, [expect.objectContaining({ itemId: 's1' })], {
      status: 'FAILED',
      errorMessage: 'Forbidden: bot was blocked by the user',
    });
    expect(deletedIds()).toEqual(['s1']);
  });

  it('keeps rows for the next run on a transient error, without audit', async () => {
    findMany.mockResolvedValue([queued('s1', TelegramDigestRecipientKind.STUDENT, 10042)]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    sendMessage.mockRejectedValue(new Error('ETIMEDOUT'));

    await service.flush();

    expect(record).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual([]);
  });

  it('keeps rows and logs an error on a content error', async () => {
    findMany.mockResolvedValue([queued('u1', TelegramDigestRecipientKind.USER, 7)]);
    renderUser.mockReturnValue(rendered(['u1']));
    sendMessage.mockRejectedValue(tgError(400, "Bad Request: can't parse entities"));
    const error = jest.spyOn((service as any).logger, 'error');

    await service.flush();

    expect(deletedIds()).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("can't parse entities"));
  });

  it('splits a long digest; if part 2 fails only part 1 rows are deleted', async () => {
    findMany.mockResolvedValue([
      queued('a', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('b', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue(rendered(['a', 'b'], 3000)); // 2 × 3000 chars → 2 parts
    sendMessage
      .mockResolvedValueOnce({ message_id: 1 })
      .mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await service.flush();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(10042, [expect.objectContaining({ itemId: 'a' })], {
      status: 'SENT',
      telegramMessageId: 1,
    });
    expect(deletedIds()).toEqual(['a']);
  });

  it('retries a failed delete once so a delivered part is not sent again tomorrow', async () => {
    findMany.mockResolvedValue([queued('s1', TelegramDigestRecipientKind.STUDENT, 10042)]);
    renderStudent.mockResolvedValue(rendered(['s1']));
    deleteMany
      .mockResolvedValueOnce({ count: 0 }) // age purge
      .mockRejectedValueOnce(new Error('db blip'))
      .mockResolvedValueOnce({ count: 1 });

    await service.flush();

    expect(deleteMany).toHaveBeenCalledTimes(3);
    expect(deleteMany.mock.calls[2][0]).toEqual({ where: { id: { in: ['s1'] } } });
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('never deletes anything but the rows it read, apart from the age purge', async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 10042),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 10042),
    ]);
    renderStudent.mockResolvedValue({ ...rendered(['s1']), hiddenIds: ['s2'] });

    await service.flush();

    const [purge, ...rest] = deleteMany.mock.calls.map(([arg]) => arg.where);
    expect(Object.keys(purge).sort()).toEqual(['createdAt', 'recipientKind']);
    expect(rest.length).toBeGreaterThan(0);
    for (const where of rest) {
      expect(Object.keys(where)).toEqual(['id']);
      for (const id of where.id.in) expect(['s1', 's2']).toContain(id);
    }
    expect(deletedIds()).toEqual(['s1', 's2']);
  });

  it("isolates recipients: one person's failure does not stop the next", async () => {
    findMany.mockResolvedValue([
      queued('s1', TelegramDigestRecipientKind.STUDENT, 1),
      queued('s2', TelegramDigestRecipientKind.STUDENT, 2),
    ]);
    resolveChatId.mockRejectedValueOnce(new Error('db hiccup')).mockResolvedValueOnce('chat-2');
    renderStudent.mockResolvedValue(rendered(['s2']));

    await service.flush();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('chat-2', expect.any(String), expect.any(Object));
    expect(deletedIds()).toEqual(['s2']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-digest/telegram-digest-personal-cron.service.spec.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cron**

```typescript
// src/telegram-digest/telegram-digest-personal-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { DIGEST_ROW_MAX_AGE_MS } from './telegram-digest.constants';
import { TelegramDigestAuditService } from './telegram-digest-audit.service';
import { TelegramDigestChatResolverService } from './telegram-digest-chat-resolver.service';
import {
  PersonalRecipientKind,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';
import {
  RenderedDigest,
  TelegramDigestRenderService,
} from './telegram-digest-render.service';
import { packBlocks } from './telegram-message-parts';
import {
  describeError,
  sendTelegramText,
  TelegramFailure,
  TelegramTextSender,
} from './telegram-send';

const PERSONAL_KINDS: TelegramDigestRecipientKind[] = [
  TelegramDigestRecipientKind.STUDENT,
  TelegramDigestRecipientKind.USER,
];

/**
 * Enrollment/removal notices leave a FAILED audit row when the student has no
 * Telegram — exactly what SmsService.sendToStudent does today. Receipts never
 * did (the old listener skipped students without a chat before sending).
 */
const AUDITED_WITHOUT_CHAT = new Set<TelegramDigestCategory>([
  TelegramDigestCategory.STUDENT_ENROLLED,
  TelegramDigestCategory.STUDENT_REMOVED,
]);

const SEND_OPTIONS = {
  parse_mode: 'HTML',
  link_preview_options: { is_disabled: true },
};

/**
 * Drains the personal (STUDENT + USER) half of the Telegram digest queue once
 * a day at 20:00 Asia/Tashkent (ADR-0025). No Sunday/holiday skip: a person
 * with nothing queued simply gets nothing. Each person is independent — one
 * failure never blocks the rest — and only rows read in this run are ever
 * deleted, so an event queued mid-run waits for tomorrow.
 */
@Injectable()
export class TelegramDigestPersonalCronService {
  private readonly logger = new Logger(TelegramDigestPersonalCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
    private readonly chatResolver: TelegramDigestChatResolverService,
    private readonly render: TelegramDigestRenderService,
    private readonly audit: TelegramDigestAuditService,
  ) {}

  @Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })
  async flush(): Promise<void> {
    await this.purgeStale();

    const bot = this.telegramService.getBot();
    if (!bot) {
      this.logger.warn('Skipped personal digest — bot not initialized');
      return;
    }

    const rows = await this.prisma.telegramDigestItem.findMany({
      where: { recipientKind: { in: PERSONAL_KINDS } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const byRecipient = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.recipientKind}:${row.recipientId}`;
      byRecipient.set(key, [...(byRecipient.get(key) ?? []), row]);
    }

    let sent = 0;
    for (const recipientRows of byRecipient.values()) {
      const { recipientKind, recipientId } = recipientRows[0];
      try {
        sent += await this.flushRecipient(
          bot,
          recipientKind as PersonalRecipientKind,
          recipientId,
          recipientRows,
        );
      } catch (err) {
        this.logger.error(
          `Personal digest failed for ${recipientKind} ${recipientId}: ${describeError(err)}`,
        );
      }
    }
    this.logger.log(
      `Personal digest flush — ${sent} message(s) to ${byRecipient.size} recipient(s)`,
    );
  }

  /** Spec: any row older than 7 days goes, delivered or not — even with no bot. */
  private async purgeStale(): Promise<void> {
    try {
      const { count } = await this.prisma.telegramDigestItem.deleteMany({
        where: {
          recipientKind: { in: PERSONAL_KINDS },
          createdAt: { lt: new Date(Date.now() - DIGEST_ROW_MAX_AGE_MS) },
        },
      });
      if (count > 1) {
        this.logger.warn(
          `Personal digest: purged ${count} undelivered row(s) older than 7 days`,
        );
      }
    } catch (err) {
      this.logger.error(`Personal digest purge failed: ${describeError(err)}`);
    }
  }

  /** Returns the number of Telegram messages sent to this person. */
  private async flushRecipient(
    bot: TelegramTextSender,
    kind: PersonalRecipientKind,
    recipientId: number,
    rows: TelegramDigestItemRow[],
  ): Promise<number> {
    const readIds = rows.map((r) => r.id);
    const isStudent = kind === TelegramDigestRecipientKind.STUDENT;

    const chatId = await this.chatResolver.resolveChatId(kind, recipientId);
    if (!chatId) {
      if (isStudent) await this.auditMissingChat(recipientId, rows);
      await this.deleteRows(readIds);
      return 0;
    }

    const rendered = isStudent
      ? await this.render.renderStudent(recipientId, rows)
      : this.render.renderUser(rows);
    const parts = packBlocks(rendered.blocks);
    if (parts.length === 0) {
      await this.deleteRows(readIds);
      return 0;
    }

    const delivered = new Set<string>();
    for (const [index, part] of parts.entries()) {
      const outcome = await sendTelegramText(bot, chatId, part.text, SEND_OPTIONS);
      if (!outcome.ok) {
        await this.handleFailure(kind, recipientId, readIds, rendered, delivered, outcome);
        return index;
      }
      // Gone as soon as it is out: a later failure or a crash must never make
      // tomorrow's run send this part again.
      await this.deleteRows(part.itemIds);
      part.itemIds.forEach((id) => delivered.add(id));
      if (isStudent) {
        await this.audit.record(
          recipientId,
          rendered.audit.filter((a) => part.itemIds.includes(a.itemId)),
          { status: 'SENT', telegramMessageId: outcome.messageId },
        );
      }
    }

    // Everything else read for this person (the hidden rows) is done too.
    await this.deleteRows(readIds.filter((id) => !delivered.has(id)));
    return parts.length;
  }

  private async handleFailure(
    kind: PersonalRecipientKind,
    recipientId: number,
    readIds: string[],
    rendered: RenderedDigest,
    delivered: Set<string>,
    failure: TelegramFailure,
  ): Promise<void> {
    // Delivered parts were deleted as they went out. The hidden rows go too,
    // but only once the person actually received something from this run.
    const hidden = delivered.size > 0 ? rendered.hiddenIds : [];
    await this.deleteRows(hidden);
    const rest = readIds.filter((id) => !delivered.has(id) && !hidden.includes(id));
    const who = `${kind} ${recipientId}`;

    if (failure.kind === 'permanent') {
      if (kind === TelegramDigestRecipientKind.STUDENT) {
        await this.audit.record(
          recipientId,
          rendered.audit.filter((a) => !delivered.has(a.itemId)),
          { status: 'FAILED', errorMessage: failure.description },
        );
      }
      await this.deleteRows(rest);
      this.logger.warn(
        `Personal digest: ${who} unreachable (${failure.description}) — ${rest.length} row(s) dropped`,
      );
      return;
    }

    const message = `Personal digest: send to ${who} failed (${failure.kind}: ${failure.description}) — ${rest.length} row(s) kept for the next run`;
    if (failure.kind === 'content') this.logger.error(message);
    else this.logger.warn(message);
  }

  private async auditMissingChat(
    studentId: number,
    rows: TelegramDigestItemRow[],
  ): Promise<void> {
    const notices = rows.filter((r) => AUDITED_WITHOUT_CHAT.has(r.category));
    if (notices.length === 0) return;
    // A deleted student is not "unlinked" — leave no misleading audit row.
    const alive = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { id: true },
    });
    if (!alive) return;
    const rendered = await this.render.renderStudent(studentId, notices);
    await this.audit.record(studentId, rendered.audit, {
      status: 'FAILED',
      errorMessage: "Telegram bog'lanmagan",
    });
  }

  /**
   * Deletes rows by id with one retry. Never throws: a row left behind by a DB
   * outage is at worst sent again tomorrow, which beats aborting the run for
   * everyone after this person.
   */
  private async deleteRows(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.prisma.telegramDigestItem.deleteMany({
          where: { id: { in: ids } },
        });
        return;
      } catch (err) {
        if (attempt === 2) {
          this.logger.error(
            `Personal digest: could not delete ${ids.length} row(s): ${describeError(err)}`,
          );
        }
      }
    }
  }
}
```

- [ ] **Step 4: Register it**

Add `TelegramDigestPersonalCronService` to `providers` in `src/telegram-digest/telegram-digest.module.ts`. The module now reads:

```typescript
@Module({
  imports: [TelegramModule],
  providers: [
    TelegramDigestQueueService,
    TelegramDigestChatResolverService,
    TelegramDigestRenderService,
    TelegramDigestAuditService,
    TelegramDigestPersonalCronService,
  ],
  exports: [TelegramDigestQueueService],
})
export class TelegramDigestModule {}
```

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/telegram-digest
npx jest src/telegram-digest/telegram-digest-personal-cron.service.spec.ts
npm run typecheck
```

Expected: PASS (13 tests); typecheck exits 0.

- [ ] **Step 6: Boot check — prove Nest can build the module graph**

Unit tests mock every provider, so only a real start proves DI. Build, then start the compiled app on a spare port with **both bot tokens blanked** (it never talks to Telegram) and **`CRONS_ENABLED=false`** (no schedule fires — the switch `server/CLAUDE.md` documents for local runs). Start, wait and stop in **one** command so the process cannot outlive the check:

```bash
npm run build && (CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= PORT=3999 node dist/src/main > /tmp/tg-digest-boot.log 2>&1 & PID=$!; for i in $(seq 1 36); do grep -qE "successfully started|resolve dependencies|UnknownDependenciesException" /tmp/tg-digest-boot.log && break; sleep 5; done; kill $PID; grep -E "successfully started|resolve dependencies|UnknownDependenciesException" /tmp/tg-digest-boot.log)
```

Expected: one line containing `Nest application successfully started` and nothing about unresolved dependencies (the dev DB is in us-west-2 — the wait allows up to ~3 minutes). Connection noise from Redis or Postgres elsewhere in the log is irrelevant here. If a DI error names `TelegramDigestPersonalCronService`, the `imports: [TelegramModule]` line is missing from `telegram-digest.module.ts`.

- [ ] **Step 7: Checkpoint — full suite**

```bash
npm test
```

Expected: every suite passes (no existing file has been changed yet besides `app.module.ts`).

- [ ] **Step 8: Commit**

```bash
git add src/telegram-digest
git commit -m "Add the 20:00 personal digest cron with purge, split sends, failure classes and audit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Staff notifications — task, payment-corrected, salary legs to the queue

Only the Telegram leg moves. The DB notification row, SSE and web push stay exactly as they are and still fire instantly. `handlePaymentPromiseOverdue` and the private `sendTelegram()` are not touched (09:00 promise alert stays instant).

**Files:**
- Modify: `src/notifications/notification-events.listener.ts`
- Modify (rewrite): `src/notifications/notification-events.listener.spec.ts`
- Modify: `src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue` (Task 2); `clipText` (Task 4).
- Enqueue keys (spec §Dedup): task assigned/updated/deleted → `relatedEntityId: comment.id`; task status → `` `${comment.id}:${assignee.userId}` `` (per assignee, so one assignee's "bajardi" is never hidden by another's "ko'rdi"); payment corrected and salary → no key (every event shown).

- [ ] **Step 1: Rewrite the spec**

Replace the whole file:

```typescript
// src/notifications/notification-events.listener.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotificationType,
  PaymentMethod,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { NotificationEventsListener } from './notification-events.listener';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushService } from './push.service';
import { TelegramService } from '../telegram/telegram.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('NotificationEventsListener', () => {
  let listener: NotificationEventsListener;
  let prisma: any;
  let notificationsService: any;
  let gateway: any;
  let pushService: any;
  let telegramService: { getBot: jest.Mock };
  let enqueue: jest.Mock;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Admin', lastName: 'User' }),
        findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
        findFirst: jest.fn().mockResolvedValue({ id: 5 }),
      },
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }),
      },
    };
    notificationsService = {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    gateway = { sendToUser: jest.fn() };
    pushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    // getBot() → null keeps the one remaining instant sender (payment
    // promise) off the network unless a test opts in.
    telegramService = { getBot: jest.fn().mockReturnValue(null) };
    enqueue = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventsListener,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: NotificationsGateway, useValue: gateway },
        { provide: PushService, useValue: pushService },
        { provide: TelegramService, useValue: telegramService },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();

    listener = module.get(NotificationEventsListener);
  });

  describe('handlePaymentCorrected', () => {
    const payload = {
      studentId: 10001,
      oldAmount: 5000000,
      newAmount: 400000,
      oldMethod: PaymentMethod.CASH,
      newMethod: PaymentMethod.CASH,
      reason: 'Ortiqcha nol kiritilgan',
      performedById: 99,
      companyId: 1,
    };

    it('notifies every company CEO across the instant channels', async () => {
      await listener.handlePaymentCorrected(payload);

      expect(notificationsService.create).toHaveBeenCalledTimes(2);
      expect(gateway.sendToUser).toHaveBeenCalledTimes(2);
      expect(pushService.sendToUser).toHaveBeenCalledTimes(2);
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: NotificationType.SYSTEM,
          relatedEntityType: 'Student',
          relatedEntityId: '10001',
          companyId: 1,
        }),
      );
    });

    it('includes the performer, old/new amounts and reason in the message', async () => {
      await listener.handlePaymentCorrected(payload);

      const { message } = notificationsService.create.mock.calls[0][0];
      expect(message).toContain('Admin User');
      expect(message).toContain('Ali Valiyev');
      expect(message).toContain('5 000 000');
      expect(message).toContain('400 000');
      expect(message).toContain('Ortiqcha nol kiritilgan');
    });

    it('includes the method change in the message when the method was corrected', async () => {
      await listener.handlePaymentCorrected({
        ...payload,
        oldAmount: 400000,
        newAmount: 400000,
        newMethod: PaymentMethod.TRANSFER,
      });

      const { message } = notificationsService.create.mock.calls[0][0];
      expect(message).toContain('Naqd');
      expect(message).toContain("Bank o'tkazmasi");
    });

    it('queues one structured Telegram row per CEO instead of sending', async () => {
      await listener.handlePaymentCorrected(payload);

      expect(enqueue).toHaveBeenCalledTimes(2);
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 1,
        companyId: 1,
        category: TelegramDigestCategory.PAYMENT_CORRECTED,
        payload: {
          performerName: 'Admin User',
          studentName: 'Ali Valiyev',
          studentId: 10001,
          oldAmount: 5000000,
          newAmount: 400000,
          oldMethod: PaymentMethod.CASH,
          newMethod: PaymentMethod.CASH,
          reason: 'Ortiqcha nol kiritilgan',
        },
      });
      expect(telegramService.getBot).not.toHaveBeenCalled();
    });

    it('does nothing when the company has no CEO', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await listener.handlePaymentCorrected(payload);
      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('queries only active, non-archived CEO recipients', async () => {
      await listener.handlePaymentCorrected(payload);

      const where = prisma.user.findMany.mock.calls[0][0].where;
      expect(where).toEqual(
        expect.objectContaining({
          deletedAt: null,
          isActive: true,
          companyId: 1,
          roles: { some: { role: { name: 'CEO' } } },
        }),
      );
    });

    it('swallows errors without throwing', async () => {
      prisma.user.findMany.mockRejectedValue(new Error('db down'));
      await expect(
        listener.handlePaymentCorrected(payload),
      ).resolves.toBeUndefined();
    });
  });

  describe('task events', () => {
    const comment = {
      id: 'c1',
      content: 'Hisobotni tayyorlang',
      companyId: 1,
      entityType: 'Student',
      entityId: '10001',
      authorId: 7,
      author: { firstName: 'Ali', lastName: 'Karimov' },
    };

    beforeEach(() => {
      // filterActiveRecipientIds(): only 20001 is still an active user.
      prisma.user.findMany.mockResolvedValue([{ id: 20001 }]);
    });

    it.each([
      ['handleTaskAssigned', TelegramDigestCategory.TASK_ASSIGNED],
      ['handleTaskUpdated', TelegramDigestCategory.TASK_UPDATED],
      ['handleTaskDeleted', TelegramDigestCategory.TASK_DELETED],
    ] as const)(
      '%s keeps DB/SSE/push instant and queues the Telegram leg',
      async (handler, category) => {
        await listener[handler]({ comment, assigneeIds: [20001, 20002] });

        expect(notificationsService.create).toHaveBeenCalledTimes(1);
        expect(gateway.sendToUser).toHaveBeenCalledWith(20001, expect.any(Object));
        expect(pushService.sendToUser).toHaveBeenCalledWith(
          20001,
          expect.objectContaining({ url: '/tasks' }),
        );
        expect(enqueue).toHaveBeenCalledTimes(1);
        expect(enqueue).toHaveBeenCalledWith({
          recipientKind: TelegramDigestRecipientKind.USER,
          recipientId: 20001,
          companyId: 1,
          category,
          relatedEntityId: 'c1',
          payload: { authorName: 'Ali Karimov', content: 'Hisobotni tayyorlang' },
        });
      },
    );

    it('clips long task text to 80 characters', async () => {
      await listener.handleTaskAssigned({
        comment: { ...comment, content: 'x'.repeat(100) },
        assigneeIds: [20001],
      });
      expect(enqueue.mock.calls[0][0].payload.content).toBe(`${'x'.repeat(80)}...`);
    });

    it('queues a status change for the author, keyed per assignee', async () => {
      await listener.handleTaskStatusChanged({
        comment,
        assignee: {
          userId: 20002,
          user: { firstName: 'Vali', lastName: 'Aliyev' },
        },
        newStatus: 'DONE',
      });

      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 7 }),
      );
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 7,
        companyId: 1,
        category: TelegramDigestCategory.TASK_STATUS_CHANGED,
        relatedEntityId: 'c1:20002',
        payload: {
          assigneeName: 'Vali Aliyev',
          status: 'DONE',
          content: 'Hisobotni tayyorlang',
        },
      });
    });
  });

  describe('handleSalaryCarriedOver', () => {
    const item = (teacherId: number, amount: number) => ({
      teacherId,
      studentId: 10001,
      groupId: 'g1',
      amount,
      lessonDate: new Date('2026-08-20T00:00:00.000Z'),
      creditPeriodDate: new Date('2026-09-01T00:00:00.000Z'),
      companyId: 1,
    });

    it('queues one summed row per active teacher', async () => {
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 6 ? null : { id: where.id }),
      );

      await listener.handleSalaryCarriedOver({
        companyId: 1,
        items: [item(5, 20000), item(5, 30000), item(6, 10000)],
      });

      expect(enqueue).toHaveBeenCalledTimes(1); // teacher 6 is inactive
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: 5,
        companyId: 1,
        category: TelegramDigestCategory.SALARY_CARRIED_OVER,
        payload: { count: 2, total: 50000 },
      });
    });
  });

  describe('handlePaymentPromiseOverdue', () => {
    it('still sends Telegram instantly and queues nothing', async () => {
      const sendMessage = jest.fn().mockResolvedValue({});
      telegramService.getBot.mockReturnValue({ telegram: { sendMessage } });
      prisma.user.findMany.mockResolvedValue([{ id: 3 }]);
      prisma.user.findUnique.mockResolvedValue({ telegramChatId: 'chat-3' });

      await listener.handlePaymentPromiseOverdue({
        promiseId: 'pp-1',
        studentId: 10001,
        companyId: 1,
        branchId: null,
        promiseDate: '2026-09-20T00:00:00.000Z',
      });

      expect(sendMessage).toHaveBeenCalledWith(
        'chat-3',
        expect.stringContaining("To'lov sanasi o'tib ketdi"),
        { parse_mode: 'HTML' },
      );
      expect(enqueue).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/notifications/notification-events.listener.spec.ts
```

Expected: FAIL — the listener has no `TelegramDigestQueueService` dependency yet, so `enqueue` is never called (several tests fail on `enqueue` assertions).

- [ ] **Step 3: Migrate the Telegram legs**

In `src/notifications/notification-events.listener.ts`:

1. Change line 3 to

```typescript
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
```

and add below the existing imports:

```typescript
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { clipText } from '../telegram-digest/telegram-message-parts';
```

2. Add a constructor parameter after `private telegramService: TelegramService,`:

```typescript
    private digestQueue: TelegramDigestQueueService,
```

3. `handleTaskAssigned` — replace

```typescript
        // 4. Telegram
        await this.sendTelegram(assigneeId, title, message);
```

with

```typescript
        // 4. Telegram — waits for the 20:00 digest (ADR-0025)
        await this.digestQueue.enqueue({
          recipientKind: TelegramDigestRecipientKind.USER,
          recipientId: assigneeId,
          companyId: comment.companyId,
          category: TelegramDigestCategory.TASK_ASSIGNED,
          relatedEntityId: String(comment.id),
          payload: { authorName, content: clipText(comment.content, 80) },
        });
```

4. `handleTaskDeleted` and `handleTaskUpdated` — each has the line `        await this.sendTelegram(assigneeId, title, message);`. Replace it in `handleTaskDeleted` with the block above using `TelegramDigestCategory.TASK_DELETED`, and in `handleTaskUpdated` with `TelegramDigestCategory.TASK_UPDATED` (same fields otherwise, including the `// Telegram — waits for the 20:00 digest (ADR-0025)` comment).

5. `handleTaskStatusChanged` — replace `      await this.sendTelegram(comment.authorId, title, message);` with

```typescript
      // Telegram — waits for the 20:00 digest (ADR-0025). Keyed per assignee:
      // a task has several, and one's "bajardi" must not hide behind another's
      // later "ko'rdi" in the digest dedup.
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.USER,
        recipientId: comment.authorId,
        companyId: comment.companyId,
        category: TelegramDigestCategory.TASK_STATUS_CHANGED,
        relatedEntityId: `${comment.id}:${assignee.userId}`,
        payload: {
          assigneeName,
          status: newStatus,
          content: clipText(comment.content, 60),
        },
      });
```

6. `handlePaymentCorrected` — replace `          await this.sendTelegram(ceo.id, title, message);` with

```typescript
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: ceo.id,
            companyId: payload.companyId,
            category: TelegramDigestCategory.PAYMENT_CORRECTED,
            payload: {
              performerName,
              studentName,
              studentId: payload.studentId,
              oldAmount: payload.oldAmount,
              newAmount: payload.newAmount,
              oldMethod: payload.oldMethod,
              newMethod: payload.newMethod,
              reason: payload.reason,
            },
          });
```

7. `handleSalaryCarriedOver` — replace `          await this.sendTelegram(teacherId, title, message);` with

```typescript
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacherId,
            companyId: payload.companyId,
            category: TelegramDigestCategory.SALARY_CARRIED_OVER,
            payload: { count, total },
          });
```

8. Leave `handlePaymentPromiseOverdue`, `sendTelegram()`, `truncate()` and `getEntityUrl()` exactly as they are. After the edit, `grep -n "sendTelegram(" src/notifications/notification-events.listener.ts` must show only the definition and the one call inside `handlePaymentPromiseOverdue`.

- [ ] **Step 4: Wire the module**

In `src/notifications/notifications.module.ts` add

```typescript
import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';
```

and change `imports: [TelegramModule],` to `imports: [TelegramModule, TelegramDigestModule],`.

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/notifications
npx jest src/notifications/notification-events.listener.spec.ts
grep -n "sendTelegram(" src/notifications/notification-events.listener.ts
npm run typecheck
```

Expected: PASS (14 tests); grep shows 2 lines (definition + payment-promise call); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/notifications
git commit -m "Queue task, payment-correction and salary Telegram legs for the 20:00 digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Payment receipt and reversal to the queue

**Files:**
- Modify (rewrite): `src/payments/payment-events.listener.ts`
- Modify (rewrite): `src/payments/payment-events.listener.spec.ts`
- Modify: `src/payments/payments.module.ts`
- Modify (comment only): `src/payments/payments-write.service.ts` lines 290-292

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue` (Task 2); `describeError` (Task 4).
- Produces: exported `buildReceiptUrl(paymentId: string): string` (same rule as today's receipt: `INVOICE_BASE_URL/<id>`, else `(PUBLIC_BASE_URL ?? APP_URL ?? https://admin.dafzentrum.uz)/r/<id>`).
- Key: `relatedEntityId: paymentId` for both categories.

There is no chat-id check at enqueue time any more — the cron resolves the chat at 20:00 (spec), so a student who links Telegram later the same day still gets the receipt. Deleted students are filtered by the resolver.

- [ ] **Step 1: Rewrite the spec**

```typescript
// src/payments/payment-events.listener.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PaymentEventsListener } from './payment-events.listener';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('PaymentEventsListener', () => {
  let listener: PaymentEventsListener;
  let enqueue: jest.Mock;

  const basePayload = {
    paymentId: 'pay-1',
    studentId: 10001,
    amount: 1500000,
    method: PaymentMethod.CASH,
    source: PaymentSource.ADMIN_MANUAL,
    studentBalance: 2000000,
    companyId: 1,
    performedById: 99,
  };

  const clearEnv = () => {
    delete process.env.INVOICE_BASE_URL;
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.APP_URL;
  };

  beforeEach(async () => {
    clearEnv();
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentEventsListener,
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(PaymentEventsListener);
  });

  afterEach(clearEnv);

  it('queues the receipt for the 20:00 digest with a structured payload', async () => {
    await listener.handle(basePayload);

    expect(enqueue).toHaveBeenCalledWith({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10001,
      companyId: 1,
      category: TelegramDigestCategory.PAYMENT_RECEIVED,
      relatedEntityId: 'pay-1',
      payload: {
        paymentId: 'pay-1',
        amount: 1500000,
        method: PaymentMethod.CASH,
        receiptUrl: 'https://admin.dafzentrum.uz/r/pay-1',
        performedById: 99,
      },
    });
  });

  it('builds the receipt link from INVOICE_BASE_URL when configured', async () => {
    process.env.INVOICE_BASE_URL = 'https://invoice.dafzentrum.uz';
    await listener.handle(basePayload);
    expect(enqueue.mock.calls[0][0].payload.receiptUrl).toBe(
      'https://invoice.dafzentrum.uz/pay-1',
    );
  });

  it('falls back to PUBLIC_BASE_URL/r/<id> when INVOICE_BASE_URL is missing', async () => {
    process.env.PUBLIC_BASE_URL = 'https://erp.example.uz';
    await listener.handle(basePayload);
    expect(enqueue.mock.calls[0][0].payload.receiptUrl).toBe(
      'https://erp.example.uz/r/pay-1',
    );
  });

  it('stores a missing performer as null', async () => {
    await listener.handle({ ...basePayload, performedById: undefined });
    expect(enqueue.mock.calls[0][0].payload.performedById).toBeNull();
  });

  it('swallows queue errors without throwing', async () => {
    enqueue.mockRejectedValueOnce(new Error('db down'));
    await expect(listener.handle(basePayload)).resolves.toBeUndefined();
  });

  describe('handleReversed', () => {
    const reversedPayload = {
      paymentId: 'pay-1',
      studentId: 10001,
      amount: 5000000,
      studentBalance: 100000,
      reason: 'Summa ortiqcha kiritilgan',
      companyId: 1,
      performedById: 99,
    };

    it('queues the reversal with its reason', async () => {
      await listener.handleReversed(reversedPayload);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.PAYMENT_REVERSED,
        relatedEntityId: 'pay-1',
        payload: {
          paymentId: 'pay-1',
          amount: 5000000,
          reason: 'Summa ortiqcha kiritilgan',
          performedById: 99,
        },
      });
    });

    it('keeps a null reason as null', async () => {
      await listener.handleReversed({ ...reversedPayload, reason: null });
      expect(enqueue.mock.calls[0][0].payload.reason).toBeNull();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleReversed(reversedPayload),
      ).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/payments/payment-events.listener.spec.ts
```

Expected: FAIL — Nest cannot resolve `PrismaService`/`SmsService` for the old listener.

- [ ] **Step 3: Rewrite the listener**

```typescript
// src/payments/payment-events.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import type {
  PaymentReceivedPayload,
  PaymentReversedPayload,
} from './payments-write.service';

/**
 * Public receipt link — the rule the instant receipt used: the invoice
 * subdomain when `INVOICE_BASE_URL` is set (no auth wall, one path segment),
 * otherwise `<admin>/r/<id>`. Read from `process.env` directly to avoid
 * ConfigService caching surprises.
 */
export function buildReceiptUrl(paymentId: string): string {
  const invoiceBase = process.env.INVOICE_BASE_URL?.trim();
  if (invoiceBase) return `${invoiceBase}/${paymentId}`;
  const fallbackBase =
    process.env.PUBLIC_BASE_URL?.trim() ??
    process.env.APP_URL?.trim() ??
    'https://admin.dafzentrum.uz';
  return `${fallbackBase}/r/${paymentId}`;
}

/**
 * Queues the student's payment receipt / reversal notice for the 20:00
 * Telegram digest (ADR-0025). The digest cron renders and sends it and writes
 * the SmsMessage row the profile "SMS" tab shows. Errors are logged and
 * swallowed: a notification must never affect the payment write.
 */
@Injectable()
export class PaymentEventsListener {
  private readonly logger = new Logger(PaymentEventsListener.name);

  constructor(private readonly digestQueue: TelegramDigestQueueService) {}

  @OnEvent('payment.received')
  async handle(payload: PaymentReceivedPayload) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.PAYMENT_RECEIVED,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          amount: payload.amount,
          method: payload.method,
          receiptUrl: buildReceiptUrl(payload.paymentId),
          performedById: payload.performedById ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Payment receipt digest enqueue failed for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('payment.reversed')
  async handleReversed(payload: PaymentReversedPayload) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.PAYMENT_REVERSED,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          amount: payload.amount,
          reason: payload.reason,
          performedById: payload.performedById ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Payment reversal digest enqueue failed for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Wire the module and fix the stale comment**

1. Confirm nothing else in the payments module uses SmsService:

```bash
grep -rn "SmsService\|SmsModule" src/payments --include='*.ts' | grep -v '\.spec\.ts'
```

Expected: only `payments.module.ts` and the comment in `payments-write.service.ts`.

2. In `src/payments/payments.module.ts`, replace `import { SmsModule } from '../sms/sms.module';` with `import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';` and change `imports: [TransactionsModule, BillingModule, SmsModule, MockExamsModule],` to `imports: [TransactionsModule, BillingModule, TelegramDigestModule, MockExamsModule],`.

3. In `src/payments/payments-write.service.ts` replace the comment above `this.eventEmitter.emit('payment.received', {` (lines 290-292):

```typescript
    // Fire-and-forget Telegram receipt to the student. The listener uses
    // SmsService so the message also lands in the student profile "SMS"
    // tab (the SMS module is already Telegram-backed).
```

with

```typescript
    // Queues the student's Telegram receipt for the 20:00 digest (ADR-0025).
    // The digest writes the SmsMessage row, so the receipt still lands in the
    // student profile "SMS" tab.
```

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/payments/payment-events.listener.ts src/payments/payment-events.listener.spec.ts src/payments/payments.module.ts
npx jest src/payments/payment-events.listener.spec.ts
npm run typecheck
```

Expected: PASS (8 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/payments/payment-events.listener.ts src/payments/payment-events.listener.spec.ts src/payments/payments.module.ts src/payments/payments-write.service.ts
git commit -m "Queue student payment receipts and reversals for the 20:00 digest, keeping the receipt link" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Enrollment and removal notices to the queue

**Files:**
- Modify (rewrite): `src/sms/sms-events.listener.ts`
- Modify (rewrite): `src/sms/sms-events.listener.spec.ts`
- Modify: `src/sms/sms.module.ts`

`src/sms/sms.service.ts` and `src/sms/sms-templates.ts` are **not** edited — the templates are now called by the renderer (Task 5).

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue` (Task 2); `describeError` (Task 4).
- Keys: none (`relatedEntityId` omitted) — an enrollment and a removal of the same day are both shown.

- [ ] **Step 1: Rewrite the spec**

```typescript
// src/sms/sms-events.listener.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { SmsEventsListener } from './sms-events.listener';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('SmsEventsListener', () => {
  let listener: SmsEventsListener;
  let enqueue: jest.Mock;

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsEventsListener,
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(SmsEventsListener);
  });

  const enrolled = {
    studentId: 10001,
    groupName: 'A1-1',
    courseName: 'Standard Deutsch',
    days: 'odd',
    exactDays: [],
    lessonStartTime: '09:00',
    lessonEndTime: '10:30',
    companyId: 1,
  };

  describe('handleStudentEnrolled', () => {
    it('queues the enrollment notice with the template fields', async () => {
      await listener.handleStudentEnrolled(enrolled);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.STUDENT_ENROLLED,
        payload: {
          groupName: 'A1-1',
          courseName: 'Standard Deutsch',
          days: 'odd',
          exactDays: [],
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
        },
      });
    });

    it('passes exact weekdays through unchanged', async () => {
      await listener.handleStudentEnrolled({
        ...enrolled,
        days: null,
        exactDays: ['monday', 'wednesday', 'friday'],
      });
      expect(enqueue.mock.calls[0][0].payload.exactDays).toEqual([
        'monday',
        'wednesday',
        'friday',
      ]);
    });

    it('does not queue without a company id', async () => {
      await listener.handleStudentEnrolled({ ...enrolled, companyId: null });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleStudentEnrolled(enrolled),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleStudentRemoved', () => {
    const removed = {
      studentId: 10001,
      groupName: 'A1-1',
      reason: "To'lov qilmagan",
      companyId: 1,
    };

    it('queues the removal notice with group and reason', async () => {
      await listener.handleStudentRemoved(removed);

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10001,
        companyId: 1,
        category: TelegramDigestCategory.STUDENT_REMOVED,
        payload: { groupName: 'A1-1', reason: "To'lov qilmagan" },
      });
    });

    it('does not queue without a company id', async () => {
      await listener.handleStudentRemoved({ ...removed, companyId: null });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.handleStudentRemoved(removed),
      ).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/sms/sms-events.listener.spec.ts
```

Expected: FAIL — Nest cannot resolve `SmsService` for the old listener.

- [ ] **Step 3: Rewrite the listener**

```typescript
// src/sms/sms-events.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import { EnrollmentMessagePayload, RemovalMessagePayload } from './sms-templates';

export interface StudentEnrolledEvent extends EnrollmentMessagePayload {
  studentId: number;
  companyId: number | null;
}

export interface StudentRemovedEvent extends RemovalMessagePayload {
  studentId: number;
  companyId: number | null;
}

/**
 * Queues the student's "added to / removed from a group" notice for the 20:00
 * Telegram digest (ADR-0025). The text is still built from sms-templates — by
 * the digest renderer, at send time.
 */
@Injectable()
export class SmsEventsListener {
  private readonly logger = new Logger(SmsEventsListener.name);

  constructor(private readonly digestQueue: TelegramDigestQueueService) {}

  @OnEvent('student.enrolled')
  async handleStudentEnrolled(payload: StudentEnrolledEvent) {
    if (payload.companyId == null) {
      // Both emitters pass Student.companyId, which is never null; the event
      // type allows it, so say so instead of dropping silently.
      this.logger.warn(
        `student.enrolled without companyId for student ${payload.studentId} — not queued`,
      );
      return;
    }
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.STUDENT_ENROLLED,
        payload: {
          groupName: payload.groupName,
          courseName: payload.courseName,
          days: payload.days,
          exactDays: payload.exactDays,
          lessonStartTime: payload.lessonStartTime,
          lessonEndTime: payload.lessonEndTime,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue enrollment notice for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }

  @OnEvent('student.removed_from_group')
  async handleStudentRemoved(payload: StudentRemovedEvent) {
    if (payload.companyId == null) {
      this.logger.warn(
        `student.removed_from_group without companyId for student ${payload.studentId} — not queued`,
      );
      return;
    }
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: payload.studentId,
        companyId: payload.companyId,
        category: TelegramDigestCategory.STUDENT_REMOVED,
        payload: { groupName: payload.groupName, reason: payload.reason },
      });
    } catch (err) {
      this.logger.error(
        `Failed to queue removal notice for student ${payload.studentId}: ${describeError(err)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Wire the module**

In `src/sms/sms.module.ts` add `import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';` and change `imports: [TelegramModule],` to `imports: [TelegramModule, TelegramDigestModule],`. `SmsService` stays in `providers` and `exports` — the admin free-text SMS route and the lesson cancel/reschedule listeners still use it.

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/sms/sms-events.listener.ts src/sms/sms-events.listener.spec.ts src/sms/sms.module.ts
npx jest src/sms/sms-events.listener.spec.ts
npm run typecheck
```

Expected: PASS (7 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/sms/sms-events.listener.ts src/sms/sms-events.listener.spec.ts src/sms/sms.module.ts
git commit -m "Queue group enrollment and removal notices for the 20:00 digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Debt charge notice to the queue

**Files:**
- Modify (rewrite): `src/billing/student-debt-notification.listener.ts`
- Create: `src/billing/student-debt-notification.listener.spec.ts` (no spec exists today)
- Modify: `src/billing/billing.module.ts`

**Interfaces:**
- Consumes: `PrismaService`; `TelegramDigestQueueService.enqueue` (Task 2); `describeError` (Task 4); `utcMidnightFromDateStr` (`src/common/date/tashkent.ts`, existing — the single source for `@db.Date` bounds).
- Key: `relatedEntityId: attendance.id`. The renderer (Task 5) re-checks at 20:00 that the SINGLE_UNCOVERED deduction still stands and the balance is still negative.

- [ ] **Step 1: Write the failing test**

```typescript
// src/billing/student-debt-notification.listener.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  AttendanceStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TransactionType,
} from '@prisma/client';
import { StudentDebtNotificationListener } from './student-debt-notification.listener';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';

describe('StudentDebtNotificationListener', () => {
  let listener: StudentDebtNotificationListener;
  let attendanceFindFirst: jest.Mock;
  let transactionFindFirst: jest.Mock;
  let enqueue: jest.Mock;

  const event = (newStatus: AttendanceStatus) => ({
    studentId: 10042,
    groupId: 'g1',
    groupName: 'A1-01',
    date: '2026-09-23',
    oldStatus: null,
    newStatus,
    companyId: 1001,
  });

  beforeEach(async () => {
    attendanceFindFirst = jest.fn().mockResolvedValue({ id: 'att-1' });
    transactionFindFirst = jest.fn().mockResolvedValue({
      metadata: { mode: 'SINGLE_UNCOVERED', perLessonCost: 20000 },
    });
    enqueue = jest.fn().mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentDebtNotificationListener,
        {
          provide: PrismaService,
          useValue: {
            attendance: { findFirst: attendanceFindFirst },
            transaction: { findFirst: transactionFindFirst },
          },
        },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(StudentDebtNotificationListener);
  });

  it('ignores statuses that never bill (EXCUSED)', async () => {
    await listener.handle(event(AttendanceStatus.EXCUSED));
    expect(attendanceFindFirst).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('looks the attendance up by group, student and UTC-midnight date', async () => {
    await listener.handle(event(AttendanceStatus.PRESENT));
    expect(attendanceFindFirst).toHaveBeenCalledWith({
      where: {
        groupId: 'g1',
        studentId: 10042,
        date: new Date('2026-09-23T00:00:00.000Z'),
      },
      select: { id: true },
    });
    expect(transactionFindFirst).toHaveBeenCalledWith({
      where: {
        attendanceId: 'att-1',
        studentId: 10042,
        type: TransactionType.LESSON_DEDUCTION,
        reversedAt: null,
        metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
      },
      select: { metadata: true },
    });
  });

  it('does nothing when the lesson was covered by the balance', async () => {
    transactionFindFirst.mockResolvedValue(null);
    await listener.handle(event(AttendanceStatus.ABSENT));
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues a DEBT_CHARGE row when the lesson went uncovered', async () => {
    await listener.handle(event(AttendanceStatus.LATE));
    expect(enqueue).toHaveBeenCalledWith({
      recipientKind: TelegramDigestRecipientKind.STUDENT,
      recipientId: 10042,
      companyId: 1001,
      category: TelegramDigestCategory.DEBT_CHARGE,
      relatedEntityId: 'att-1',
      payload: {
        attendanceId: 'att-1',
        groupName: 'A1-01',
        perLessonCost: 20000,
        date: '2026-09-23',
      },
    });
  });

  it('does nothing when the attendance row is missing', async () => {
    attendanceFindFirst.mockResolvedValue(null);
    await listener.handle(event(AttendanceStatus.PRESENT));
    expect(transactionFindFirst).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('swallows database errors without throwing', async () => {
    attendanceFindFirst.mockRejectedValue(new Error('db down'));
    await expect(
      listener.handle(event(AttendanceStatus.PRESENT)),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/billing/student-debt-notification.listener.spec.ts
```

Expected: FAIL — Nest cannot resolve `TelegramService` for the old listener.

- [ ] **Step 3: Rewrite the listener**

```typescript
// src/billing/student-debt-notification.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  AttendanceStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import type { AttendanceStudentRecordedPayload } from '../attendance/student-attendance-notification.listener';

/**
 * Queues a DEBT_CHARGE row for the 20:00 Telegram digest (ADR-0025) when the
 * attendance just taken pushed the student's balance into the red — the
 * billing layer wrote a SINGLE_UNCOVERED LESSON_DEDUCTION for it. The digest
 * re-checks at send time that the deduction still stands and the balance is
 * still negative, so a debt paid off during the day is never reported.
 *
 * Piggy-backs on the post-commit `attendance.student.recorded` event, so the
 * deduction row is visible when we query.
 */
@Injectable()
export class StudentDebtNotificationListener {
  private readonly logger = new Logger(StudentDebtNotificationListener.name);

  constructor(
    private prisma: PrismaService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent('attendance.student.recorded')
  async handle(payload: AttendanceStudentRecordedPayload) {
    const { studentId, groupId, groupName, date, newStatus, companyId } =
      payload;

    // Only attendance statuses that trigger billing can produce debt.
    if (
      newStatus !== AttendanceStatus.PRESENT &&
      newStatus !== AttendanceStatus.LATE &&
      newStatus !== AttendanceStatus.ABSENT
    ) {
      return;
    }

    try {
      const attendance = await this.prisma.attendance.findFirst({
        where: { groupId, studentId, date: utcMidnightFromDateStr(date) },
        select: { id: true },
      });
      if (!attendance) return;

      const uncovered = await this.prisma.transaction.findFirst({
        where: {
          attendanceId: attendance.id,
          studentId,
          type: TransactionType.LESSON_DEDUCTION,
          reversedAt: null,
          metadata: { path: ['mode'], equals: 'SINGLE_UNCOVERED' },
        },
        select: { metadata: true },
      });
      if (!uncovered) return;

      const metadata = (uncovered.metadata ?? {}) as Record<string, unknown>;
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: studentId,
        companyId,
        category: TelegramDigestCategory.DEBT_CHARGE,
        relatedEntityId: attendance.id,
        payload: {
          attendanceId: attendance.id,
          groupName,
          perLessonCost: Number(metadata.perLessonCost ?? 0),
          date,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Debt digest enqueue failed for student ${studentId}: ${describeError(err)}`,
      );
    }
  }
}
```

- [ ] **Step 4: Wire the module**

1. Confirm nothing else in billing uses the main bot:

```bash
grep -rn "TelegramService" src/billing --include='*.ts' | grep -v '\.spec\.ts'
```

Expected: no output.

2. In `src/billing/billing.module.ts` replace `import { TelegramModule } from '../telegram/telegram.module';` with `import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';`, and in `imports` replace `TelegramModule` with `TelegramDigestModule`. In the module's doc comment replace the two wrapped lines

```typescript
 * attendance module and pings the student over Telegram when the
 * billing layer just pushed their balance into the red.
```

with

```typescript
 * attendance module and queues a Telegram digest row (ADR-0025) when the
 * billing layer just pushed the student's balance into the red.
```

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/billing/student-debt-notification.listener.ts src/billing/student-debt-notification.listener.spec.ts src/billing/billing.module.ts
npx jest src/billing/student-debt-notification.listener.spec.ts
npm run typecheck
```

Expected: PASS (6 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/billing/student-debt-notification.listener.ts src/billing/student-debt-notification.listener.spec.ts src/billing/billing.module.ts
git commit -m "Queue debt-charge notices for the 20:00 digest; first spec for the debt listener" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Teacher attendance notice — Telegram leg to the queue; second checkpoint

**Files:**
- Modify: `src/attendance/attendance-events.listener.ts`
- Modify: `src/attendance/attendance-events.listener.spec.ts`
- Modify: `src/attendance/attendance.module.ts`

`AttendanceModule` keeps importing `TelegramModule` — `attendance-reminder.service.ts` and `student-attendance-notification.listener.ts` still use the main bot. Only `attendance-events.listener.ts` stops using it.

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue` (Task 2); `describeError` (Task 4).
- Key: `` `${groupId}:${date}` `` — one line per group per lesson day. (The emitter fires on the first save of the day and `alreadySent()` blocks same-day repeats, so this matches today; the date also keeps a retried row from merging with the next day's.)
- No chat check at enqueue: the chat is resolved at 20:00 (spec), so a teacher who links Telegram later that day still gets the line; the resolver drops the row if they never do.

- [ ] **Step 1: Update the spec**

In `src/attendance/attendance-events.listener.spec.ts`:

1. Replace the import of `TelegramService` with

```typescript
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
```

(merge the `@prisma/client` names into the existing `import { NotificationType, UserStatus } from '@prisma/client';` line rather than adding a second import from the same module).

2. Replace `let bot: { telegram: { sendMessage: jest.Mock } };` with `let enqueue: jest.Mock;`, and in `beforeEach` replace `bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };` with `enqueue = jest.fn().mockResolvedValue(undefined);`.

3. Replace the `TelegramService` provider entry

```typescript
        {
          provide: TelegramService,
          useValue: { getBot: jest.fn().mockReturnValue(bot) },
        },
```

with

```typescript
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
```

4. In the first test (`'sends stats notification to each teacher across channels'`) replace the three lines starting at `// Only teacher 20001 has a chat id` with

```typescript
    // The chat is resolved at 20:00, so both teachers are queued — even the
    // one who has not linked Telegram yet.
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenCalledWith({
      recipientKind: TelegramDigestRecipientKind.USER,
      recipientId: 20001,
      companyId: 100,
      category: TelegramDigestCategory.ATTENDANCE_COMPLETED,
      relatedEntityId: 'g-1:2026-04-22',
      payload: {
        groupId: 'g-1',
        groupName: 'Deutsch A1',
        date: '2026-04-22',
        present: 5,
        absent: 1,
        late: 2,
        excused: 0,
      },
    });
```

5. Add at the end of the `describe` block:

```typescript
  it('keeps DB/SSE/push delivery when queueing the Telegram leg fails', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 20001, telegramChatId: '111' },
    ]);
    enqueue.mockRejectedValueOnce(new Error('db down'));

    await listener.handleAttendanceCompleted({ ...payload, teacherIds: [20001] });

    expect(notificationsService.create).toHaveBeenCalledTimes(1);
    expect(pushService.sendToUser).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/attendance/attendance-events.listener.spec.ts
```

Expected: FAIL — Nest cannot resolve `TelegramService` (the listener still injects it).

- [ ] **Step 3: Replace the Telegram leg**

In `src/attendance/attendance-events.listener.ts`:

1. Change line 3 to

```typescript
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
```

replace `import { TelegramService } from '../telegram/telegram.service';` with

```typescript
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
```

and in the constructor replace `private telegramService: TelegramService,` with `private digestQueue: TelegramDigestQueueService,`.

2. Change `const { groupId, groupName, teacherIds, companyId, stats } = payload;` to `const { groupId, groupName, date, teacherIds, companyId, stats } = payload;`.

3. Replace the whole block

```typescript
        if (teacher.telegramChatId) {
          try {
            const bot = this.telegramService.getBot();
            if (bot) {
              await bot.telegram.sendMessage(
                teacher.telegramChatId,
                `<b>${title}</b>\n${message}`,
                { parse_mode: 'HTML' },
              );
            }
          } catch (err) {
            this.logger.warn(
              `Telegram send failed for teacher ${teacher.id}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
```

with

```typescript
        // Telegram waits for the 20:00 digest (ADR-0025); DB/SSE/push above
        // stay instant. The chat is resolved at 20:00, so a teacher who links
        // Telegram later today still gets the line.
        try {
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacher.id,
            companyId,
            category: TelegramDigestCategory.ATTENDANCE_COMPLETED,
            relatedEntityId: `${groupId}:${date}`,
            payload: {
              groupId,
              groupName,
              date,
              present: stats.present,
              absent: stats.absent,
              late: stats.late,
              excused: stats.excused,
            },
          });
        } catch (err) {
          this.logger.warn(
            `Attendance digest enqueue failed for teacher ${teacher.id}: ${describeError(err)}`,
          );
        }
```

4. Update the class doc comment's first sentence to: "Listens for `attendance.completed` events emitted by AttendanceService.save() and notifies the group's teachers: DB row, SSE and push instantly, Telegram through the 20:00 digest (ADR-0025)."

- [ ] **Step 4: Wire the module**

In `src/attendance/attendance.module.ts` add `import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';` and add `TelegramDigestModule` to `imports` (keep `TelegramModule`).

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/attendance/attendance-events.listener.ts src/attendance/attendance-events.listener.spec.ts src/attendance/attendance.module.ts
npx jest src/attendance/attendance-events.listener.spec.ts
npm run typecheck
```

Expected: PASS (7 tests); typecheck exits 0.

- [ ] **Step 6: Checkpoint — full suite**

```bash
npm test
```

Expected: every suite passes, including the untouched `src/lesson-reschedules/lesson-reschedule-events.listener.spec.ts`, `src/lesson-cancellations/lesson-cancellation-events.listener.spec.ts`, `src/sms/sms.service.spec.ts`, `src/common/event-wiring.spec.ts` (every `@OnEvent` name is unchanged) and `src/common/date/tashkent.single-source.spec.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/attendance/attendance-events.listener.ts src/attendance/attendance-events.listener.spec.ts src/attendance/attendance.module.ts
git commit -m "Queue the teacher attendance-completed Telegram leg for the 20:00 digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Group digest rendering from queue rows (`buildBlocks`)

Adds a new `buildBlocks()` next to the existing `build()`. The old method (and its `DigestEntry` input) stays until Task 16, so the current cron keeps compiling and every task keeps a green typecheck.

**Files:**
- Modify: `src/telegram-groups/telegram-group-digest.service.ts`
- Modify: `src/telegram-groups/telegram-group-digest.service.spec.ts` (append a new `describe`; keep the existing one until Task 16)

**Interfaces:**
- Consumes: `dedupRows`, `DedupedRow` (Task 4); `DigestBlock`, `header`, `spacer`, `clipText` (Task 4); `payloadOf`, `TelegramDigestItemRow`, `GroupStatusTransition` (Task 2); `DIGEST_REASON_MAX_CHARS` (Task 2); existing `escapeHtml`, `formatDate`, `formatSum` (`./utils/format.util`), `PAYMENT_METHOD_LABEL`, `tashkentDateStr` and `TASHKENT_OFFSET_MS` (`src/common/date/tashkent.ts`), `TG_GROUP_DIGEST_MAX_ITEMS` (`./constants`).
- Produces: `TelegramGroupDigestService.buildBlocks(companyName: string, rows: TelegramDigestItemRow[], now?: Date): DigestBlock[] | null` — used by Task 15. `null` when there is nothing to show. Every row id appears in exactly one block's `itemIds` (overflow lines carry the ids they hide), which the cron relies on to mark delivery.

**Rendering (spec §Render qoidalari, group digest):** same header and section order as today (new students → payments → new groups) plus a fourth section, status changes. Branch sub-headers (`🏢 <b>Filial</b> (N)`) stay for students, groups and status changes. The payments header becomes `💳 <b>Yirik va onlayn to'lovlar (N)</b> — jami …`. Method names come from `PAYMENT_METHOD_LABEL` (so TRANSFER now reads "Bank o'tkazmasi", like every other message). The time window shows dates when it spans more than one Tashkent day. A status change is one line: `icon subject: verb — sabab: … · Actor (Role), HH:MM`.

To use the shared `escapeHtml`, delete the file-local `escapeHtml` function (lines 14-17) and import it from `./utils/format.util` — the two are identical, so the old `build()` and its tests are unaffected.

- [ ] **Step 1: Append the failing tests**

Add these imports at the top of `src/telegram-groups/telegram-group-digest.service.spec.ts` (keep the existing ones):

```typescript
import { Prisma, TelegramDigestCategory } from '@prisma/client';
import {
  DigestPayloadByCategory,
  TelegramDigestItemRow,
} from '../telegram-digest/telegram-digest-payloads';
import { DigestBlock } from '../telegram-digest/telegram-message-parts';
```

and append at the end of the file:

```typescript
describe('TelegramGroupDigestService.buildBlocks', () => {
  const service = new TelegramGroupDigestService();
  const NOW = new Date('2026-05-21T15:00:00.000Z'); // 20:00 Tashkent

  let seq = 0;
  function row<C extends TelegramDigestCategory>(
    category: C,
    payload: DigestPayloadByCategory[C],
    opts: { at?: string; relatedEntityId?: string | null } = {},
  ): TelegramDigestItemRow {
    seq += 1;
    return {
      id: `g-${seq}`,
      companyId: 1001,
      branchId: null,
      category,
      relatedEntityId: opts.relatedEntityId ?? null,
      payload: payload as unknown as Prisma.JsonValue,
      createdAt: new Date(opts.at ?? '2026-05-21T09:05:00.000Z'), // 14:05
    };
  }

  const text = (blocks: DigestBlock[] | null) =>
    (blocks ?? [])
      .map((b) => b.text)
      .join('\n')
      .replace(/\u00A0/g, ' ');

  const newStudent = (name: string, branchName: string | null = null) =>
    row(TelegramDigestCategory.GROUP_NEW_STUDENT, { studentId: 1, name, branchName });

  const change = (
    overrides: Partial<DigestPayloadByCategory['GROUP_STATUS_CHANGE']>,
    relatedEntityId: string | null = null,
  ) =>
    row(
      TelegramDigestCategory.GROUP_STATUS_CHANGE,
      {
        entityType: 'Student',
        entityId: '10042',
        name: 'Aziza Karimova',
        transition: 'STUDENT_FROZEN',
        reason: null,
        actorName: null,
        actorRole: null,
        branchName: null,
        ...overrides,
      },
      { relatedEntityId },
    );

  it('returns null for no rows', () => {
    expect(service.buildBlocks('DaF', [], NOW)).toBeNull();
  });

  it('shows a same-day window as HH:MM – HH:MM', () => {
    expect(text(service.buildBlocks('DaF', [newStudent('Ali Valiyev')], NOW))).toContain(
      '🕐 14:05 – 20:00',
    );
  });

  it('shows dates when the window spans days (after a Sunday or holiday)', () => {
    const early = row(
      TelegramDigestCategory.GROUP_NEW_STUDENT,
      { studentId: 2, name: 'B', branchName: null },
      { at: '2026-05-19T15:30:00.000Z' }, // 19.05 20:30
    );
    expect(text(service.buildBlocks('DaF', [early], NOW))).toContain(
      '🕐 19.05 20:30 – 21.05 20:00',
    );
  });

  it('groups new students under one sub-header per branch, branchless last', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [newStudent('A One', 'Chilonzor'), newStudent('B Two', 'Chilonzor'), newStudent('C Three')],
        NOW,
      ),
    );
    expect(msg).toContain("👨‍🎓 <b>Yangi o'quvchilar (3)</b>");
    expect(msg).toContain('🏢 <b>Chilonzor</b> (2)');
    expect(msg.match(/Chilonzor/g)).toHaveLength(1);
    expect(msg.indexOf('• C Three')).toBeGreaterThan(msg.indexOf('• B Two'));
  });

  it('lists large and online payments under the renamed header with a total', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          row(TelegramDigestCategory.GROUP_PAYMENT, { paymentId: 'p1', studentName: 'Ali V', amount: 500000, method: 'PAYME' }),
          row(TelegramDigestCategory.GROUP_PAYMENT, { paymentId: 'p2', studentName: 'Vali A', amount: 300000, method: 'TRANSFER' }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain("💳 <b>Yirik va onlayn to'lovlar (2)</b> — jami <b>800 000 so'm</b>");
    expect(msg).toContain("• Ali V — <b>500 000 so'm</b> (Payme)");
    expect(msg).toContain("• Vali A — <b>300 000 so'm</b> (Bank o'tkazmasi)");
  });

  it('lists new groups with their start date', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          row(TelegramDigestCategory.GROUP_NEW_GROUP, {
            groupId: 'g1',
            name: 'B1-Intensiv',
            branchName: 'Chilonzor',
            startDate: '2026-06-01T00:00:00.000Z',
          }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain('👥 <b>Yangi guruhlar (1)</b>');
    expect(msg).toContain('• B1-Intensiv (01.06.2026)');
  });

  it('renders a status change as one line with icon, reason, actor and time', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [
          change({ reason: "to'lov qilmadi", actorName: 'Dilnoza Karimova', actorRole: 'Administrator', branchName: 'Chilonzor' }),
          change({ entityType: 'Group', entityId: 'g1', name: 'B1-Intensiv', transition: 'GROUP_COMPLETED' }),
          change({ transition: 'STUDENT_GRADUATED', name: 'Bobur Aliyev' }),
          change({ transition: 'STUDENT_REACTIVATED', name: 'Kamola Sodiqova' }),
        ],
        NOW,
      ),
    );
    expect(msg).toContain("🔄 <b>Holat o'zgarishlari (4)</b>");
    expect(msg).toContain(
      "• ❄️ Aziza Karimova: muzlatildi — sabab: to'lov qilmadi · Dilnoza Karimova (Administrator), 14:05",
    );
    expect(msg).toContain('• 🏁 B1-Intensiv guruhi: tugadi, 14:05');
    expect(msg).toContain('• 🎓 Bobur Aliyev: bitirdi, 14:05');
    expect(msg).toContain('• ✅ Kamola Sodiqova: qaytadan faol, 14:05');
  });

  it('escapes names and reasons', () => {
    const msg = text(
      service.buildBlocks(
        'DaF',
        [newStudent('Ali <b>hack</b>'), change({ reason: 'a < b & c' })],
        NOW,
      ),
    );
    expect(msg).toContain('Ali &lt;b&gt;hack&lt;/b&gt;');
    expect(msg).toContain('sabab: a &lt; b &amp; c');
    expect(msg).not.toContain('<b>hack');
  });

  it('caps a long section and gives the overflow line the ids it hides', () => {
    const many = Array.from({ length: TG_GROUP_DIGEST_MAX_ITEMS + 5 }, (_, i) =>
      newStudent(`Student ${i}`),
    );
    const blocks = service.buildBlocks('DaF', many, NOW)!;
    const overflow = blocks.find((b) => b.text.includes('va yana 5 ta'));
    expect(overflow?.itemIds).toHaveLength(5);
  });

  it('merges exact duplicate status events into one line', () => {
    const a = change({}, 'Student:10042:STUDENT_FROZEN');
    const b = change({}, 'Student:10042:STUDENT_FROZEN');
    const blocks = service.buildBlocks('DaF', [a, b], NOW)!;
    expect(text(blocks).match(/muzlatildi/g)).toHaveLength(1);
    expect(blocks.flatMap((x) => x.itemIds).sort()).toEqual([a.id, b.id].sort());
  });

  it('puts every row id into exactly one block', () => {
    const rows = [
      newStudent('A', 'Chilonzor'),
      row(TelegramDigestCategory.GROUP_PAYMENT, { paymentId: 'p1', studentName: 'B', amount: 600000, method: 'CASH' }),
      row(TelegramDigestCategory.GROUP_NEW_GROUP, { groupId: 'g1', name: 'G', branchName: null, startDate: null }),
      change({}),
    ];
    const ids = service.buildBlocks('DaF', rows, NOW)!.flatMap((b) => b.itemIds);
    expect(ids.sort()).toEqual(rows.map((r) => r.id).sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-groups/telegram-group-digest.service.spec.ts
```

Expected: the old `describe` passes; every `buildBlocks` test FAILS (`service.buildBlocks is not a function`).

- [ ] **Step 3: Implement `buildBlocks`**

In `src/telegram-groups/telegram-group-digest.service.ts`:

1. Delete the local `escapeHtml` function (lines 14-17) and extend the imports:

```typescript
import { TelegramDigestCategory } from '@prisma/client';
import { TASHKENT_OFFSET_MS, tashkentDateStr } from '../common/date/tashkent';
import { PAYMENT_METHOD_LABEL } from '../payments/shared/method-label';
import { DIGEST_REASON_MAX_CHARS } from '../telegram-digest/telegram-digest.constants';
import { DedupedRow, dedupRows } from '../telegram-digest/telegram-digest-dedup';
import {
  GroupStatusTransition,
  payloadOf,
  TelegramDigestItemRow,
} from '../telegram-digest/telegram-digest-payloads';
import {
  clipText,
  DigestBlock,
  header,
  spacer,
} from '../telegram-digest/telegram-message-parts';
import { escapeHtml, formatDate, formatSum } from './utils/format.util';
```

(`formatDate, formatSum` were already imported from `./utils/format.util` — merge into this one line.)

2. Add these module-level helpers above the class:

```typescript
const TRANSITION_TEXT: Record<
  GroupStatusTransition,
  { icon: string; verb: string }
> = {
  GROUP_STARTED: { icon: '🚀', verb: 'boshlandi' },
  GROUP_COMPLETED: { icon: '🏁', verb: 'tugadi' },
  STUDENT_FROZEN: { icon: '❄️', verb: 'muzlatildi' },
  STUDENT_EXPELLED: { icon: '🚫', verb: 'chetlatildi' },
  STUDENT_GRADUATED: { icon: '🎓', verb: 'bitirdi' },
  STUDENT_REACTIVATED: { icon: '✅', verb: 'qaytadan faol' },
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'HH:MM', or 'DD.MM HH:MM' when `withDate` (Asia/Tashkent, fixed UTC+5). */
function tashkentStamp(d: Date, withDate: boolean): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const hm = `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
  return withDate ? `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)} ${hm}` : hm;
}

const sameTashkentDay = (a: Date, b: Date) =>
  tashkentDateStr(a) === tashkentDateStr(b);
```

3. Add these methods inside the class, below `build()` (leave `build()`, `studentsBlock`, `paymentsBlock`, `groupsBlock`, `capped` and `groupedByBranch` untouched until Task 16):

```typescript
  /**
   * The 20:00 group digest (ADR-0025) from queued GROUP rows the cron has
   * already filtered to one Telegram group. Returns null when there is
   * nothing to show. Every row id lands in exactly one block — overflow
   * lines carry the ids they hide — so the cron can mark delivery per part.
   */
  buildBlocks(
    companyName: string,
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): DigestBlock[] | null {
    const entries = dedupRows(rows);
    const of = (category: TelegramDigestCategory) =>
      entries.filter((e) => e.row.category === category);
    const students = of(TelegramDigestCategory.GROUP_NEW_STUDENT);
    const payments = of(TelegramDigestCategory.GROUP_PAYMENT);
    const groups = of(TelegramDigestCategory.GROUP_NEW_GROUP);
    const changes = of(TelegramDigestCategory.GROUP_STATUS_CHANGE);
    if (students.length + payments.length + groups.length + changes.length === 0) {
      return null;
    }

    const earliest = rows.reduce(
      (min, r) => (r.createdAt < min ? r.createdAt : min),
      rows[0].createdAt,
    );
    const multiDay = !sameTashkentDay(earliest, now);
    const blocks: DigestBlock[] = [
      {
        text: [
          `📋 <b>So'nggi yangiliklar</b> — ${escapeHtml(companyName)}`,
          `🕐 ${tashkentStamp(earliest, multiDay)} – ${tashkentStamp(now, multiDay)}`,
        ].join('\n'),
        itemIds: [],
      },
    ];

    if (students.length > 0) {
      blocks.push(
        spacer(),
        header(`👨‍🎓 <b>Yangi o'quvchilar (${students.length})</b>`),
        ...this.branchBlocks(
          students,
          (e) => payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_STUDENT).branchName,
          (e) => escapeHtml(payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_STUDENT).name),
        ),
      );
    }
    if (payments.length > 0) {
      const total = payments.reduce(
        (sum, e) => sum + payloadOf(e.row, TelegramDigestCategory.GROUP_PAYMENT).amount,
        0,
      );
      blocks.push(
        spacer(),
        header(
          `💳 <b>Yirik va onlayn to'lovlar (${payments.length})</b> — jami <b>${formatSum(total)}</b>`,
        ),
        ...this.cappedBlocks(payments, (e) => {
          const p = payloadOf(e.row, TelegramDigestCategory.GROUP_PAYMENT);
          const method = PAYMENT_METHOD_LABEL[p.method] ?? p.method;
          return `${escapeHtml(p.studentName)} — <b>${formatSum(p.amount)}</b> (${escapeHtml(method)})`;
        }),
      );
    }
    if (groups.length > 0) {
      blocks.push(
        spacer(),
        header(`👥 <b>Yangi guruhlar (${groups.length})</b>`),
        ...this.branchBlocks(
          groups,
          (e) => payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_GROUP).branchName,
          (e) => {
            const p = payloadOf(e.row, TelegramDigestCategory.GROUP_NEW_GROUP);
            const start = p.startDate ? ` (${formatDate(p.startDate)})` : '';
            return `${escapeHtml(p.name)}${start}`;
          },
        ),
      );
    }
    if (changes.length > 0) {
      blocks.push(
        spacer(),
        header(`🔄 <b>Holat o'zgarishlari (${changes.length})</b>`),
        ...this.branchBlocks(
          changes,
          (e) => payloadOf(e.row, TelegramDigestCategory.GROUP_STATUS_CHANGE).branchName,
          (e) => this.statusLine(e.row, now),
        ),
      );
    }
    return blocks;
  }

  /** `icon subject: verb — sabab: … · Actor (Role), time` — one line per change. */
  private statusLine(row: TelegramDigestItemRow, now: Date): string {
    const p = payloadOf(row, TelegramDigestCategory.GROUP_STATUS_CHANGE);
    const { icon, verb } = TRANSITION_TEXT[p.transition];
    const subject =
      p.entityType === 'Group' ? `${escapeHtml(p.name)} guruhi` : escapeHtml(p.name);
    const reason = p.reason
      ? ` — sabab: ${escapeHtml(clipText(p.reason, DIGEST_REASON_MAX_CHARS))}`
      : '';
    const role = p.actorRole ? ` (${escapeHtml(p.actorRole)})` : '';
    const actor = p.actorName ? ` · ${escapeHtml(p.actorName)}${role}` : '';
    const time = tashkentStamp(row.createdAt, !sameTashkentDay(row.createdAt, now));
    return `${icon} ${subject}: ${verb}${reason}${actor}, ${time}`;
  }

  /** Up to `TG_GROUP_DIGEST_MAX_ITEMS` bullet lines; the rest collapse into one. */
  private cappedBlocks(
    entries: DedupedRow[],
    render: (entry: DedupedRow) => string,
  ): DigestBlock[] {
    const shown = entries.slice(0, TG_GROUP_DIGEST_MAX_ITEMS);
    const hidden = entries.slice(TG_GROUP_DIGEST_MAX_ITEMS);
    const blocks: DigestBlock[] = shown.map((e) => ({
      text: `• ${render(e)}`,
      itemIds: e.ids,
    }));
    if (hidden.length > 0) {
      blocks.push({
        text: `• <i>... va yana ${hidden.length} ta</i>`,
        itemIds: hidden.flatMap((e) => e.ids),
      });
    }
    return blocks;
  }

  /**
   * One `🏢 <branch> (N)` sub-header per branch, branchless entries last and
   * without a header — the same layout as the old digest. The section cap
   * counts bullet lines only; the overflow line carries the hidden ids.
   */
  private branchBlocks(
    entries: DedupedRow[],
    branchOf: (entry: DedupedRow) => string | null,
    render: (entry: DedupedRow) => string,
  ): DigestBlock[] {
    const NO_BRANCH = ' ';
    const order: string[] = [];
    const buckets = new Map<string, DedupedRow[]>();
    for (const entry of entries) {
      const key = branchOf(entry) ?? NO_BRANCH;
      if (!buckets.has(key)) {
        buckets.set(key, []);
        if (key !== NO_BRANCH) order.push(key);
      }
      buckets.get(key)!.push(entry);
    }
    if (buckets.has(NO_BRANCH)) order.push(NO_BRANCH);

    const blocks: DigestBlock[] = [];
    const hiddenIds: string[] = [];
    let hiddenCount = 0;
    let rendered = 0;
    for (const key of order) {
      const bucket = buckets.get(key)!;
      const room = Math.max(TG_GROUP_DIGEST_MAX_ITEMS - rendered, 0);
      const shown = bucket.slice(0, room);
      const hidden = bucket.slice(room);
      if (shown.length > 0 && key !== NO_BRANCH) {
        blocks.push(header(`🏢 <b>${escapeHtml(key)}</b> (${bucket.length})`));
      }
      for (const e of shown) blocks.push({ text: `• ${render(e)}`, itemIds: e.ids });
      rendered += shown.length;
      hiddenCount += hidden.length;
      hiddenIds.push(...hidden.flatMap((e) => e.ids));
    }
    if (hiddenCount > 0) {
      blocks.push({
        text: `• <i>... va yana ${hiddenCount} ta</i>`,
        itemIds: hiddenIds,
      });
    }
    return blocks;
  }
```

- [ ] **Step 4: Run the tests, format, typecheck**

```bash
npx prettier --write src/telegram-groups/telegram-group-digest.service.ts src/telegram-groups/telegram-group-digest.service.spec.ts
npx jest src/telegram-groups/telegram-group-digest.service.spec.ts
npm run typecheck
```

Expected: PASS (9 old + 11 new = 20 tests); typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/telegram-groups/telegram-group-digest.service.ts src/telegram-groups/telegram-group-digest.service.spec.ts
git commit -m "Render the group digest from queue rows, with status changes and dated windows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Group events to the queue

**Files:**
- Modify (rewrite): `src/telegram-groups/telegram-group-broadcast.listener.ts`
- Modify (rewrite): `src/telegram-groups/telegram-group-broadcast.listener.spec.ts`
- Modify: `src/telegram-groups/telegram-groups.module.ts` (add `TelegramDigestModule` to `imports`; removals happen in Task 16)

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue` (Task 2); `GroupStatusChangeDigestPayload`, `GroupStatusTransition` (Task 2); `describeError` (Task 4); `LARGE_PAYMENT_THRESHOLD_SUM` (`./constants`).
- Keys: new student → `String(studentId)`; new group → `groupId`; payment → `paymentId`; status change → `` `${entityType}:${entityId}:${transition}` `` (only an exact duplicate merges — e.g. a double click — while freeze-then-reactivate on one day shows both).
- Branch: new student → event `branchId`; new group → event `branchId`; payment and student status → the student's first branch; group status → the group's branch; a missing row → `null` (company-wide), exactly as today's fallback messages.

**Behavior kept from today:** payment filter `amount >= LARGE_PAYMENT_THRESHOLD_SUM` **or** method PAYME/CLICK/UZUM; the student `entityType === 'Student'` guard; the transition whitelists (group FORMING→ACTIVE, ACTIVE→COMPLETED; student ACTIVE→FROZEN/EXPELLED/GRADUATED, FROZEN→ACTIVE); a reason only for freeze/expel; a fallback name `ID <entityId>` when the row is gone. **Changed by the spec:** the ≥5M instant path is gone; every event waits for 20:00; group changes now carry reason and actor.

- [ ] **Step 1: Rewrite the spec**

```typescript
// src/telegram-groups/telegram-group-broadcast.listener.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { TelegramGroupBroadcastListener } from './telegram-group-broadcast.listener';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { LARGE_PAYMENT_THRESHOLD_SUM } from './constants';

describe('TelegramGroupBroadcastListener', () => {
  let listener: TelegramGroupBroadcastListener;
  let enqueue: jest.Mock;
  let prisma: {
    student: { findUnique: jest.Mock };
    group: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    enqueue = jest.fn().mockResolvedValue(undefined);
    prisma = {
      student: { findUnique: jest.fn() },
      group: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupBroadcastListener,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
      ],
    }).compile();
    listener = module.get(TelegramGroupBroadcastListener);
  });

  const queued = () => enqueue.mock.calls[0][0];

  describe('payment.received', () => {
    const base = {
      paymentId: 'p1',
      studentId: 100,
      method: PaymentMethod.CASH,
      source: PaymentSource.ADMIN_MANUAL,
      studentBalance: 0,
      companyId: 1001,
    };

    beforeEach(() => {
      prisma.student.findUnique.mockResolvedValue({
        firstName: 'A',
        lastName: 'B',
        branches: [{ branch: { id: 7 } }],
      });
    });

    it('ignores small cash payments without looking anything up', async () => {
      await listener.onPaymentReceived({ ...base, amount: LARGE_PAYMENT_THRESHOLD_SUM - 1 });
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('queues a large cash payment for the student branch', async () => {
      await listener.onPaymentReceived({ ...base, amount: LARGE_PAYMENT_THRESHOLD_SUM });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.GROUP_PAYMENT,
        relatedEntityId: 'p1',
        payload: {
          paymentId: 'p1',
          studentName: 'A B',
          amount: LARGE_PAYMENT_THRESHOLD_SUM,
          method: PaymentMethod.CASH,
        },
      });
    });

    it('queues an online payment regardless of size', async () => {
      await listener.onPaymentReceived({ ...base, method: PaymentMethod.PAYME, amount: 50_000 });
      expect(queued().category).toBe(TelegramDigestCategory.GROUP_PAYMENT);
    });

    it('queues a very large payment too — there is no instant path any more', async () => {
      await listener.onPaymentReceived({ ...base, amount: 5_000_000 });
      expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('falls back to the student id and company-wide when the student row is gone', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await listener.onPaymentReceived({ ...base, amount: 600_000 });
      expect(queued()).toMatchObject({
        branchId: null,
        payload: { studentName: "O'quvchi ID 100" },
      });
    });
  });

  describe('student.created / group.created', () => {
    it('queues a new student with its branch', async () => {
      await listener.onStudentCreated({
        studentId: 10042,
        firstName: 'Ali',
        lastName: 'Valiyev',
        branchId: 1,
        branchName: 'Asosiy filial',
        companyId: 1001,
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 1,
        category: TelegramDigestCategory.GROUP_NEW_STUDENT,
        relatedEntityId: '10042',
        payload: { studentId: 10042, name: 'Ali Valiyev', branchName: 'Asosiy filial' },
      });
    });

    it('queues a new group with an ISO start date', async () => {
      await listener.onGroupCreated({
        groupId: 'g1',
        name: 'B1-Intensiv',
        branchId: 2,
        branchName: 'Chilonzor',
        startDate: new Date('2026-06-01T00:00:00.000Z'),
        companyId: 1001,
      });
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 2,
        category: TelegramDigestCategory.GROUP_NEW_GROUP,
        relatedEntityId: 'g1',
        payload: {
          groupId: 'g1',
          name: 'B1-Intensiv',
          branchName: 'Chilonzor',
          startDate: '2026-06-01T00:00:00.000Z',
        },
      });
    });
  });

  describe('entity.status.changed', () => {
    const student = {
      firstName: 'Aziz',
      lastName: 'Karimov',
      branches: [{ branch: { id: 7, name: 'Chilonzor' } }],
    };
    const actor = {
      firstName: 'Dilnoza',
      lastName: 'Karimova',
      roles: [{ role: { name: 'Administrator' } }],
    };

    it('queues a student freeze with reason, actor and branch', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      prisma.user.findUnique.mockResolvedValue(actor);

      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
        reason: "Ta'tilga chiqdi",
        changedById: 555,
        companyId: 1001,
      });

      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: 1001,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.GROUP_STATUS_CHANGE,
        relatedEntityId: 'Student:10042:STUDENT_FROZEN',
        payload: {
          entityType: 'Student',
          entityId: '10042',
          name: 'Aziz Karimov',
          transition: 'STUDENT_FROZEN',
          reason: "Ta'tilga chiqdi",
          actorName: 'Dilnoza Karimova',
          actorRole: 'Administrator',
          branchName: 'Chilonzor',
        },
      });
    });

    it('drops the reason for a reactivation', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'FROZEN',
        newStatus: 'ACTIVE',
        reason: 'ignored',
        companyId: 1001,
      });
      expect(queued().payload).toMatchObject({ transition: 'STUDENT_REACTIVATED', reason: null });
    });

    it('falls back to the id, company-wide, when the student row is gone', async () => {
      prisma.student.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '10042',
        oldStatus: 'ACTIVE',
        newStatus: 'GRADUATED',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({
        branchId: null,
        payload: { name: 'ID 10042', transition: 'STUDENT_GRADUATED', branchName: null },
      });
    });

    it('queues a group start scoped to the group branch', async () => {
      prisma.group.findUnique.mockResolvedValue({
        name: 'B1-Intensiv-043',
        branchId: 7,
        branch: { name: 'Chilonzor' },
      });
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({
        branchId: 7,
        relatedEntityId: 'Group:g1:GROUP_STARTED',
        payload: {
          entityType: 'Group',
          name: 'B1-Intensiv-043',
          transition: 'GROUP_STARTED',
          reason: null,
          branchName: 'Chilonzor',
        },
      });
    });

    it('carries reason and actor for a group that finished', async () => {
      prisma.group.findUnique.mockResolvedValue({
        name: 'B1-Intensiv-043',
        branchId: 7,
        branch: { name: 'Chilonzor' },
      });
      prisma.user.findUnique.mockResolvedValue(actor);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'ACTIVE',
        newStatus: 'COMPLETED',
        reason: 'Kurs yakunlandi',
        changedById: 555,
        companyId: 1001,
      });
      expect(queued().payload).toMatchObject({
        transition: 'GROUP_COMPLETED',
        reason: 'Kurs yakunlandi',
        actorName: 'Dilnoza Karimova',
        actorRole: 'Administrator',
      });
    });

    it('falls back to the id when the group row is gone', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      await listener.onEntityStatusChanged({
        entityType: 'Group',
        entityId: 'g1',
        oldStatus: 'FORMING',
        newStatus: 'ACTIVE',
        companyId: 1001,
      });
      expect(queued()).toMatchObject({ branchId: null, payload: { name: 'ID g1' } });
    });

    it.each([
      ['Group', 'FORMING', 'CANCELLED'],
      ['Student', 'ACTIVE', 'INACTIVE'],
      ['Enrollment', 'ACTIVE', 'FROZEN'],
    ])('ignores %s %s→%s', async (entityType, oldStatus, newStatus) => {
      await listener.onEntityStatusChanged({
        entityType,
        entityId: '1',
        oldStatus,
        newStatus,
        companyId: 1001,
      });
      expect(prisma.group.findUnique).not.toHaveBeenCalled();
      expect(prisma.student.findUnique).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('ignores events without a company', async () => {
      await listener.onEntityStatusChanged({
        entityType: 'Student',
        entityId: '1',
        oldStatus: 'ACTIVE',
        newStatus: 'FROZEN',
      });
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('swallows queue errors without throwing', async () => {
      prisma.student.findUnique.mockResolvedValue(student);
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        listener.onEntityStatusChanged({
          entityType: 'Student',
          entityId: '10042',
          oldStatus: 'ACTIVE',
          newStatus: 'FROZEN',
          companyId: 1001,
        }),
      ).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-groups/telegram-group-broadcast.listener.spec.ts
```

Expected: FAIL — the listener still depends on `TelegramGroupBroadcastService`/`TelegramGroupDigestBufferService`.

- [ ] **Step 3: Rewrite the listener**

```typescript
// src/telegram-groups/telegram-group-broadcast.listener.ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  PaymentMethod,
  PaymentSource,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import {
  GroupStatusChangeDigestPayload,
  GroupStatusTransition,
} from '../telegram-digest/telegram-digest-payloads';
import { describeError } from '../telegram-digest/telegram-send';
import { LARGE_PAYMENT_THRESHOLD_SUM } from './constants';

export interface StudentCreatedEvent {
  studentId: number;
  firstName: string;
  lastName: string;
  branchId?: number | null;
  branchName?: string | null;
  companyId: number;
}

export interface GroupCreatedEvent {
  groupId: string;
  name: string;
  branchId: number;
  branchName?: string | null;
  startDate?: Date | string | null;
  companyId: number;
}

interface PaymentReceivedEvent {
  paymentId: string;
  studentId: number;
  amount: number;
  method: PaymentMethod;
  source: PaymentSource;
  studentBalance: number | null;
  companyId: number;
  performedById?: number;
}

interface EntityStatusChangedEvent {
  entityType: string;
  entityId: string;
  oldStatus?: string;
  newStatus?: string;
  reason?: string;
  changedById?: number;
  companyId?: number;
}

const GROUP_TRANSITIONS: Record<string, GroupStatusTransition> = {
  'FORMING->ACTIVE': 'GROUP_STARTED',
  'ACTIVE->COMPLETED': 'GROUP_COMPLETED',
};

const STUDENT_TRANSITIONS: Record<string, GroupStatusTransition> = {
  'ACTIVE->FROZEN': 'STUDENT_FROZEN',
  'ACTIVE->EXPELLED': 'STUDENT_EXPELLED',
  'ACTIVE->GRADUATED': 'STUDENT_GRADUATED',
  'FROZEN->ACTIVE': 'STUDENT_REACTIVATED',
};

/** Only freezing and expelling carry a reason worth showing (as before). */
const STUDENT_REASON_SHOWN = new Set<GroupStatusTransition>([
  'STUDENT_FROZEN',
  'STUDENT_EXPELLED',
]);

/**
 * Turns domain events into GROUP rows of the Telegram digest queue. Nothing is
 * sent from here any more: the 20:00 group cron renders one message per
 * approved Telegram group (ADR-0025). All handlers are best-effort — a failure
 * never reaches the transaction that fired the event.
 */
@Injectable()
export class TelegramGroupBroadcastListener {
  private readonly logger = new Logger(TelegramGroupBroadcastListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent('student.created')
  async onStudentCreated(payload: StudentCreatedEvent) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: payload.branchId ?? null,
        category: TelegramDigestCategory.GROUP_NEW_STUDENT,
        relatedEntityId: String(payload.studentId),
        payload: {
          studentId: payload.studentId,
          name: `${payload.firstName} ${payload.lastName}`,
          branchName: payload.branchName ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`student.created digest enqueue failed: ${describeError(err)}`);
    }
  }

  @OnEvent('group.created')
  async onGroupCreated(payload: GroupCreatedEvent) {
    try {
      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: payload.branchId,
        category: TelegramDigestCategory.GROUP_NEW_GROUP,
        relatedEntityId: payload.groupId,
        payload: {
          groupId: payload.groupId,
          name: payload.name,
          branchName: payload.branchName ?? null,
          startDate: payload.startDate
            ? new Date(payload.startDate).toISOString()
            : null,
        },
      });
    } catch (err) {
      this.logger.warn(`group.created digest enqueue failed: ${describeError(err)}`);
    }
  }

  @OnEvent('payment.received')
  async onPaymentReceived(payload: PaymentReceivedEvent) {
    try {
      const isLarge = payload.amount >= LARGE_PAYMENT_THRESHOLD_SUM;
      const isOnline =
        payload.method === PaymentMethod.PAYME ||
        payload.method === PaymentMethod.CLICK ||
        payload.method === PaymentMethod.UZUM;
      if (!isLarge && !isOnline) return; // small cash/transfer — the 21:00 report covers them

      const student = await this.prisma.student.findUnique({
        where: { id: payload.studentId },
        select: {
          firstName: true,
          lastName: true,
          branches: { take: 1, select: { branch: { select: { id: true } } } },
        },
      });

      await this.digestQueue.enqueue({
        recipientKind: TelegramDigestRecipientKind.GROUP,
        recipientId: payload.companyId,
        companyId: payload.companyId,
        branchId: student?.branches[0]?.branch?.id ?? null,
        category: TelegramDigestCategory.GROUP_PAYMENT,
        relatedEntityId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          studentName: student
            ? `${student.firstName} ${student.lastName}`
            : `O'quvchi ID ${payload.studentId}`,
          amount: payload.amount,
          method: payload.method,
        },
      });
    } catch (err) {
      this.logger.warn(`payment.received digest enqueue failed: ${describeError(err)}`);
    }
  }

  @OnEvent('entity.status.changed')
  async onEntityStatusChanged(payload: EntityStatusChangedEvent) {
    try {
      const companyId = payload.companyId;
      const { oldStatus: from, newStatus: to } = payload;
      if (!companyId || !from || !to || from === to) return;

      if (payload.entityType === 'Group') {
        const transition = GROUP_TRANSITIONS[`${from}->${to}`];
        if (transition) await this.queueGroupChange(payload, companyId, transition);
        return;
      }
      if (payload.entityType === 'Student') {
        const transition = STUDENT_TRANSITIONS[`${from}->${to}`];
        if (transition) await this.queueStudentChange(payload, companyId, transition);
      }
    } catch (err) {
      this.logger.warn(`entity.status.changed digest enqueue failed: ${describeError(err)}`);
    }
  }

  private async queueGroupChange(
    p: EntityStatusChangedEvent,
    companyId: number,
    transition: GroupStatusTransition,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: p.entityId },
      select: { name: true, branchId: true, branch: { select: { name: true } } },
    });
    const actor = await this.actorOf(p.changedById);
    await this.queueChange(companyId, group?.branchId ?? null, {
      entityType: 'Group',
      entityId: p.entityId,
      name: group?.name ?? `ID ${p.entityId}`,
      transition,
      reason: p.reason ?? null,
      actorName: actor.name,
      actorRole: actor.role,
      branchName: group?.branch?.name ?? null,
    });
  }

  private async queueStudentChange(
    p: EntityStatusChangedEvent,
    companyId: number,
    transition: GroupStatusTransition,
  ) {
    const studentId = Number(p.entityId);
    const student = Number.isFinite(studentId)
      ? await this.prisma.student.findUnique({
          where: { id: studentId },
          select: {
            firstName: true,
            lastName: true,
            branches: {
              take: 1,
              select: { branch: { select: { id: true, name: true } } },
            },
          },
        })
      : null;
    const branch = student?.branches[0]?.branch ?? null;
    const actor = await this.actorOf(p.changedById);
    await this.queueChange(companyId, branch?.id ?? null, {
      entityType: 'Student',
      entityId: p.entityId,
      name: student
        ? `${student.firstName} ${student.lastName}`.trim()
        : `ID ${p.entityId}`,
      transition,
      reason: STUDENT_REASON_SHOWN.has(transition) ? (p.reason ?? null) : null,
      actorName: actor.name,
      actorRole: actor.role,
      branchName: branch?.name ?? null,
    });
  }

  private async queueChange(
    companyId: number,
    branchId: number | null,
    payload: GroupStatusChangeDigestPayload,
  ) {
    await this.digestQueue.enqueue({
      recipientKind: TelegramDigestRecipientKind.GROUP,
      recipientId: companyId,
      companyId,
      branchId,
      category: TelegramDigestCategory.GROUP_STATUS_CHANGE,
      // Only a genuine duplicate (same entity, same transition) merges.
      relatedEntityId: `${payload.entityType}:${payload.entityId}:${payload.transition}`,
      payload,
    });
  }

  private async actorOf(
    userId?: number,
  ): Promise<{ name: string | null; role: string | null }> {
    if (!userId) return { name: null, role: null };
    const actor = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        roles: { take: 1, select: { role: { select: { name: true } } } },
      },
    });
    if (!actor) return { name: null, role: null };
    return {
      name: `${actor.firstName} ${actor.lastName}`.trim(),
      role: actor.roles[0]?.role?.name ?? null,
    };
  }
}
```

- [ ] **Step 4: Wire the module**

In `src/telegram-groups/telegram-groups.module.ts` add `import { TelegramDigestModule } from '../telegram-digest/telegram-digest.module';` and change `imports: [HolidaysModule, SalaryModule, ReportsModule],` to `imports: [HolidaysModule, SalaryModule, ReportsModule, TelegramDigestModule],`. Leave `TelegramGroupBroadcastService` and `TelegramGroupDigestBufferService` registered for now — the old cron still injects the buffer until Task 15, and both are deleted in Task 16.

- [ ] **Step 5: Run the test, format, typecheck**

```bash
npx prettier --write src/telegram-groups/telegram-group-broadcast.listener.ts src/telegram-groups/telegram-group-broadcast.listener.spec.ts src/telegram-groups/telegram-groups.module.ts
npx jest src/telegram-groups/telegram-group-broadcast.listener.spec.ts
npm run typecheck
```

Expected: PASS (5 + 2 + 11 = 18 tests); typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/telegram-groups/telegram-group-broadcast.listener.ts src/telegram-groups/telegram-group-broadcast.listener.spec.ts src/telegram-groups/telegram-groups.module.ts
git commit -m "Queue group events (students, groups, payments, status changes) for the 20:00 group digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Group 20:00 cron from the queue, with per-group delivery

**Files:**
- Modify (rewrite): `src/telegram-groups/telegram-group-digest-cron.service.ts`
- Modify (rewrite): `src/telegram-groups/telegram-group-digest-cron.service.spec.ts`

**Interfaces:**
- Consumes: `TelegramGroupDigestService.buildBlocks` (Task 13); `packBlocks` (Task 4); `sendTelegramText`, `describeError`, `TelegramTextSender` (Task 4); `TelegramDigestItemRow` (Task 2); `DIGEST_ROW_MAX_AGE_MS` (Task 2); existing `TelegramAdminBotService.getBot(): Telegraf | null`, `HolidaysService.findActiveHolidayCovering`, `isTashkentSunday`.
- Produces: `TelegramGroupDigestCronService.flushDigests()` — `@Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })`; exported pure function `isVisibleToGroup(row, group)`.

**Behavior (spec §Kechqurungi guruh cron):**
1. Purge GROUP rows older than 7 days first — before the bot, Sunday and holiday checks — `warn` once if more than one.
2. No admin bot → `warn`, stop. Sunday → stop. Holiday → stop (existing helpers, unchanged).
3. Read GROUP rows ordered by `createdAt`, `id`; process each company in its own `try/catch`.
4. Target groups: `companyId`, `status: APPROVED`, `isActive: true`, `deletedAt: null` (same as `TelegramGroupBroadcastService`).
5. For each group: the rows it may see (`isVisibleToGroup`) that do not list it in `deliveredGroupIds` → `buildBlocks` → `packBlocks` → send each part with `{ parse_mode: 'HTML' }`. After each delivered part, push the group id into `deliveredGroupIds` of that part's rows (`updateMany`, one retry, + in-memory). On failure stop sending to that group: `permanent` → the chat is gone, so this run stops waiting for it (403 also deactivates the group, as today); `content` → `Logger.error`, rows kept; `transient` → `warn`, rows kept for the next run.
6. Delete every row that every reachable active group allowed to see it has received (a row no such group can see is deleted at once — e.g. a company without an approved group).

**Visibility (`isVisibleToGroup`):** `receivesAllBranches` → everything; otherwise a company-wide row (`branchId == null`) or a row of the group's own branch. A legacy group with no branch therefore sees only company-wide rows — fail-closed, the same rule `TelegramGroupBroadcastService` applied and `TelegramGroup.receivesAllBranches`' schema comment describes. (Prod on 2026-09-23 has no such group: the only approved group, "Moliya-DaF Fergana", has `branchId = 1`.)

- [ ] **Step 1: Rewrite the spec**

```typescript
// src/telegram-groups/telegram-group-digest-cron.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  TelegramGroupStatus,
} from '@prisma/client';
import {
  isVisibleToGroup,
  TelegramGroupDigestCronService,
} from './telegram-group-digest-cron.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { HolidaysService } from '../holidays/holidays.service';

const MONDAY_20H = new Date('2026-05-18T15:00:00Z'); // 20:00 Tashkent, Monday
const SUNDAY_20H = new Date('2026-05-24T15:00:00Z');

const groupRow = (
  id: string,
  branchId: number | null,
  opts: { companyId?: number; delivered?: string[] } = {},
) => ({
  id,
  recipientKind: TelegramDigestRecipientKind.GROUP,
  recipientId: opts.companyId ?? 1001,
  companyId: opts.companyId ?? 1001,
  branchId,
  category: TelegramDigestCategory.GROUP_NEW_STUDENT,
  relatedEntityId: null,
  payload: { studentId: 1, name: 'A B', branchName: null },
  deliveredGroupIds: opts.delivered ?? [],
  createdAt: new Date('2026-05-18T09:00:00Z'),
});

const chat = (
  id: string,
  chatId: bigint,
  branchId: number | null,
  receivesAllBranches = false,
) => ({ id, chatId, branchId, receivesAllBranches });

describe('isVisibleToGroup', () => {
  it('follows the broadcast rule, fail-closed for branch-less groups', () => {
    const own = { branchId: 5, receivesAllBranches: false };
    const all = { branchId: 9, receivesAllBranches: true };
    const legacy = { branchId: null, receivesAllBranches: false };
    expect(isVisibleToGroup({ branchId: 5 }, own)).toBe(true);
    expect(isVisibleToGroup({ branchId: 9 }, own)).toBe(false);
    expect(isVisibleToGroup({ branchId: null }, own)).toBe(true);
    expect(isVisibleToGroup({ branchId: 9 }, all)).toBe(true);
    expect(isVisibleToGroup({ branchId: 5 }, legacy)).toBe(false);
    expect(isVisibleToGroup({ branchId: null }, legacy)).toBe(true);
  });
});

describe('TelegramGroupDigestCronService', () => {
  let service: TelegramGroupDigestCronService;
  let sendMessage: jest.Mock;
  let getBot: jest.Mock;
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let deleteMany: jest.Mock;
  let groupFindMany: jest.Mock;
  let groupUpdate: jest.Mock;
  let companyFindMany: jest.Mock;
  let buildBlocks: jest.Mock;
  let findActiveHolidayCovering: jest.Mock;

  /** Ids of every deleteMany except the age purge. */
  const deletedIds = () =>
    deleteMany.mock.calls
      .map(([arg]) => arg.where.id?.in as string[] | undefined)
      .filter((ids): ids is string[] => Array.isArray(ids))
      .flat()
      .sort();

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(MONDAY_20H);
    sendMessage = jest.fn().mockResolvedValue({ message_id: 1 });
    getBot = jest.fn().mockReturnValue({ telegram: { sendMessage } });
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    groupFindMany = jest.fn().mockResolvedValue([]);
    groupUpdate = jest.fn().mockResolvedValue({});
    companyFindMany = jest.fn().mockResolvedValue([{ id: 1001, name: 'DaF' }]);
    // One line per row, so the cron's own packing yields one part per group.
    buildBlocks = jest.fn((_name: string, rows: { id: string }[]) =>
      rows.length ? rows.map((r) => ({ text: `• ${r.id}`, itemIds: [r.id] })) : null,
    );
    findActiveHolidayCovering = jest.fn().mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramGroupDigestCronService,
        {
          provide: PrismaService,
          useValue: {
            telegramDigestItem: { findMany, updateMany, deleteMany },
            telegramGroup: { findMany: groupFindMany, update: groupUpdate },
            company: { findMany: companyFindMany },
          },
        },
        { provide: TelegramAdminBotService, useValue: { getBot } },
        { provide: TelegramGroupDigestService, useValue: { buildBlocks } },
        { provide: HolidaysService, useValue: { findActiveHolidayCovering } },
      ],
    }).compile();
    service = module.get(TelegramGroupDigestCronService);
  });

  afterEach(() => jest.useRealTimers());

  it('purges old GROUP rows first — even on a Sunday — then skips the day', async () => {
    jest.setSystemTime(SUNDAY_20H);
    deleteMany.mockResolvedValueOnce({ count: 4 });
    const warn = jest.spyOn((service as any).logger, 'warn');

    await service.flushDigests();

    const purge = deleteMany.mock.calls[0][0].where;
    expect(purge.recipientKind).toBe(TelegramDigestRecipientKind.GROUP);
    expect(purge.createdAt.lt).toEqual(new Date(SUNDAY_20H.getTime() - 7 * 24 * 3600 * 1000));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('4'));
    expect(findActiveHolidayCovering).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips a holiday after purging', async () => {
    findActiveHolidayCovering.mockResolvedValue({ id: 'h1', name: "Navro'z" });
    await service.flushDigests();
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('stops without an admin bot after purging', async () => {
    getBot.mockReturnValue(null);
    await service.flushDigests();
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reads only GROUP rows, oldest first, and does nothing for an empty queue', async () => {
    await service.flushDigests();
    expect(findMany).toHaveBeenCalledWith({
      where: { recipientKind: TelegramDigestRecipientKind.GROUP },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('asks only for approved, active, live groups of the company', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    await service.flushDigests();
    expect(groupFindMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, chatId: true, branchId: true, receivesAllBranches: true },
    });
  });

  it('gives each group only what it may see, marks delivery, then deletes', async () => {
    findMany.mockResolvedValue([groupRow('i1', 5), groupRow('i2', 9), groupRow('i3', null)]);
    groupFindMany.mockResolvedValue([
      chat('br5', 100n, 5),
      chat('all', 200n, 9, true),
      chat('legacy', 300n, null),
    ]);

    await service.flushDigests();

    // Groups are visited in query order: br5, all, legacy.
    expect(
      buildBlocks.mock.calls.map(([, rows]) => rows.map((r: { id: string }) => r.id)),
    ).toEqual([['i1', 'i3'], ['i1', 'i2', 'i3'], ['i3']]);
    expect(sendMessage).toHaveBeenCalledWith('100', '• i1\n• i3', { parse_mode: 'HTML' });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1', 'i3'] } },
      data: { deliveredGroupIds: { push: 'br5' } },
    });
    expect(deletedIds()).toEqual(['i1', 'i2', 'i3']);
  });

  it('keeps a row for the group that failed and does not resend to the one that got it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5), chat('g2', 200n, 5)]);
    sendMessage.mockImplementation((chatId: string) =>
      chatId === '100'
        ? Promise.reject(new Error('ETIMEDOUT'))
        : Promise.resolve({ message_id: 2 }),
    );

    await service.flushDigests();

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['i1'] } },
      data: { deliveredGroupIds: { push: 'g2' } },
    });
    expect(deletedIds()).toEqual([]); // g1 still owes it

    // Next run: the row already lists g2, so only g1 gets it.
    findMany.mockResolvedValue([groupRow('i1', null, { delivered: ['g2'] })]);
    sendMessage.mockReset().mockResolvedValue({ message_id: 3 });
    deleteMany.mockClear();

    await service.flushDigests();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('100', expect.any(String), expect.any(Object));
    expect(deletedIds()).toEqual(['i1']);
  });

  it('deactivates a group on 403 and stops waiting for it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({ response: { error_code: 403, description: 'Forbidden: bot was kicked' } });

    await service.flushDigests();

    expect(groupUpdate).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { isActive: false } });
    expect(deletedIds()).toEqual(['i1']);
  });

  it('stops waiting for a chat that no longer exists, without deactivating it', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({ response: { error_code: 400, description: 'Bad Request: chat not found' } });

    await service.flushDigests();

    expect(groupUpdate).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['i1']);
  });

  it('retries recording a delivery once', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    updateMany.mockRejectedValueOnce(new Error('db blip')).mockResolvedValueOnce({ count: 1 });

    await service.flushDigests();

    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(deletedIds()).toEqual(['i1']);
  });

  it('keeps rows and logs an error on a content error', async () => {
    findMany.mockResolvedValue([groupRow('i1', null)]);
    groupFindMany.mockResolvedValue([chat('g1', 100n, 5)]);
    sendMessage.mockRejectedValue({ response: { error_code: 400, description: 'Bad Request: message is too long' } });
    const error = jest.spyOn((service as any).logger, 'error');

    await service.flushDigests();

    expect(deletedIds()).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('message is too long'));
  });

  it('clears the rows of a company that has no approved group', async () => {
    findMany.mockResolvedValue([groupRow('i1', 5)]);
    groupFindMany.mockResolvedValue([]);
    await service.flushDigests();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(deletedIds()).toEqual(['i1']);
  });

  it("isolates companies: one company's failure does not stop the next", async () => {
    findMany.mockResolvedValue([
      groupRow('a1', null, { companyId: 1001 }),
      groupRow('b1', null, { companyId: 1002 }),
    ]);
    companyFindMany.mockResolvedValue([
      { id: 1001, name: 'A' },
      { id: 1002, name: 'B' },
    ]);
    groupFindMany
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce([chat('gb', 500n, null, true)]);

    await service.flushDigests();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('500', expect.any(String), expect.any(Object));
    expect(deletedIds()).toEqual(['b1']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx jest src/telegram-groups/telegram-group-digest-cron.service.spec.ts
```

Expected: FAIL — `isVisibleToGroup` is not exported and the cron still reads the Redis buffer.

- [ ] **Step 3: Rewrite the cron**

```typescript
// src/telegram-groups/telegram-group-digest-cron.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  TelegramDigestRecipientKind,
  TelegramGroupStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { DIGEST_ROW_MAX_AGE_MS } from '../telegram-digest/telegram-digest.constants';
import { TelegramDigestItemRow } from '../telegram-digest/telegram-digest-payloads';
import { packBlocks } from '../telegram-digest/telegram-message-parts';
import {
  describeError,
  sendTelegramText,
  TelegramTextSender,
} from '../telegram-digest/telegram-send';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { TelegramGroupDigestService } from './telegram-group-digest.service';
import { isTashkentSunday } from './utils/format.util';

type GroupRow = TelegramDigestItemRow & { deliveredGroupIds: string[] };

interface TargetGroup {
  id: string;
  chatId: bigint;
  branchId: number | null;
  receivesAllBranches: boolean;
}

/**
 * Which queued rows a Telegram group may see — the rule the old instant
 * broadcast applied: a `receivesAllBranches` group sees everything; any other
 * group sees company-wide rows and its own branch's. A legacy group with no
 * branch therefore sees company-wide rows only (fail-closed, see the
 * `TelegramGroup.receivesAllBranches` schema comment).
 */
export function isVisibleToGroup(
  row: { branchId: number | null },
  group: { branchId: number | null; receivesAllBranches: boolean },
): boolean {
  if (group.receivesAllBranches) return true;
  if (row.branchId == null) return true;
  return row.branchId === group.branchId;
}

/**
 * Sends each approved Telegram group one consolidated message a day, at
 * 20:00 Asia/Tashkent, from the GROUP rows of the digest queue (ADR-0025).
 * Sundays and holidays are skipped — rows wait for the next working day.
 * Delivery is tracked per group (`deliveredGroupIds`): a chat that failed
 * gets the rows again next run, a chat that got them never does twice.
 */
@Injectable()
export class TelegramGroupDigestCronService {
  private readonly logger = new Logger(TelegramGroupDigestCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
    private readonly digest: TelegramGroupDigestService,
    private readonly holidaysService: HolidaysService,
  ) {}

  @Cron('0 20 * * *', { timeZone: 'Asia/Tashkent' })
  async flushDigests(): Promise<void> {
    await this.purgeStale();

    const bot = this.adminBot.getBot();
    if (!bot) {
      this.logger.warn('Skipped group digest — admin bot not initialized');
      return;
    }
    if (isTashkentSunday()) {
      this.logger.log('Skipped group digest — today is Sunday');
      return;
    }
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
    );
    if (holiday) {
      this.logger.log(`Skipped group digest — today is a holiday (${holiday.name})`);
      return;
    }

    const rows = await this.prisma.telegramDigestItem.findMany({
      where: { recipientKind: TelegramDigestRecipientKind.GROUP },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (rows.length === 0) return;

    const byCompany = new Map<number, GroupRow[]>();
    for (const row of rows) {
      byCompany.set(row.companyId, [...(byCompany.get(row.companyId) ?? []), row]);
    }
    const companies = await this.prisma.company.findMany({
      where: { id: { in: [...byCompany.keys()] } },
      select: { id: true, name: true },
    });
    const companyName = new Map(companies.map((c) => [c.id, c.name]));

    let sent = 0;
    for (const [companyId, companyRows] of byCompany) {
      try {
        sent += await this.flushCompany(
          bot,
          companyId,
          companyName.get(companyId) ?? 'Hisobot',
          companyRows,
        );
      } catch (err) {
        this.logger.error(
          `Group digest failed for company ${companyId}: ${describeError(err)}`,
        );
      }
    }
    this.logger.log(`Group digest flush — sent ${sent} message(s)`);
  }

  /** Spec: any row older than 7 days goes — also on Sundays, holidays, without a bot. */
  private async purgeStale(): Promise<void> {
    try {
      const { count } = await this.prisma.telegramDigestItem.deleteMany({
        where: {
          recipientKind: TelegramDigestRecipientKind.GROUP,
          createdAt: { lt: new Date(Date.now() - DIGEST_ROW_MAX_AGE_MS) },
        },
      });
      if (count > 1) {
        this.logger.warn(
          `Group digest: purged ${count} undelivered row(s) older than 7 days`,
        );
      }
    } catch (err) {
      this.logger.error(`Group digest purge failed: ${describeError(err)}`);
    }
  }

  /** Returns the number of Telegram messages sent for this company. */
  private async flushCompany(
    bot: TelegramTextSender,
    companyId: number,
    companyName: string,
    rows: GroupRow[],
  ): Promise<number> {
    const groups: TargetGroup[] = await this.prisma.telegramGroup.findMany({
      where: {
        companyId,
        status: TelegramGroupStatus.APPROVED,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, chatId: true, branchId: true, receivesAllBranches: true },
    });

    const delivered = new Map(rows.map((r) => [r.id, new Set(r.deliveredGroupIds)]));
    const unreachable = new Set<string>();
    const now = new Date();
    let sent = 0;

    for (const group of groups) {
      const pending = rows.filter(
        (r) => isVisibleToGroup(r, group) && !delivered.get(r.id)?.has(group.id),
      );
      const blocks = this.digest.buildBlocks(companyName, pending, now);
      if (!blocks) continue;

      for (const part of packBlocks(blocks)) {
        const outcome = await sendTelegramText(bot, group.chatId.toString(), part.text, {
          parse_mode: 'HTML',
        });
        if (!outcome.ok) {
          if (outcome.kind === 'permanent') {
            // The chat is gone for good. 403 (bot removed) deactivates the
            // group as before; any other permanent error (chat not found,
            // group migrated) just stops this run from waiting for it.
            if (outcome.code === 403) await this.deactivate(group);
            else {
              this.logger.warn(
                `Group digest: chat ${group.chatId} unreachable (${outcome.description}) — not waiting for it this run`,
              );
            }
            unreachable.add(group.id);
          } else {
            const message = `Group digest to chat ${group.chatId} failed (${outcome.kind}: ${outcome.description}) — kept for the next run`;
            if (outcome.kind === 'content') this.logger.error(message);
            else this.logger.warn(message);
          }
          break;
        }
        sent += 1;
        for (const id of part.itemIds) delivered.get(id)?.add(group.id);
        await this.markDelivered(part.itemIds, group.id);
      }
    }

    // A row is done once every reachable group that may see it has it. A row
    // no such group can see (e.g. no approved group at all) is done now.
    const liveGroups = groups.filter((g) => !unreachable.has(g.id));
    const done = rows
      .filter((r) =>
        liveGroups.every(
          (g) => !isVisibleToGroup(r, g) || delivered.get(r.id)?.has(g.id),
        ),
      )
      .map((r) => r.id);
    if (done.length > 0) {
      await this.prisma.telegramDigestItem.deleteMany({
        where: { id: { in: done } },
      });
    }
    return sent;
  }

  /**
   * Persists delivery so a crash between here and the final delete never
   * resends to this chat. One retry; a write that still fails is logged, not
   * thrown — the row is still deleted below if every group has it.
   */
  private async markDelivered(ids: string[], groupId: string): Promise<void> {
    if (ids.length === 0) return;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await this.prisma.telegramDigestItem.updateMany({
          where: { id: { in: ids } },
          data: { deliveredGroupIds: { push: groupId } },
        });
        return;
      } catch (err) {
        if (attempt === 2) {
          this.logger.warn(
            `Could not record digest delivery to group ${groupId}: ${describeError(err)}`,
          );
        }
      }
    }
  }

  /** 403: the bot was removed from the chat — same handling as before. */
  private async deactivate(group: TargetGroup): Promise<void> {
    this.logger.warn(`Bot kicked from chat ${group.chatId} — marking inactive`);
    await this.prisma.telegramGroup
      .update({ where: { id: group.id }, data: { isActive: false } })
      .catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run the test, format, typecheck**

```bash
npx prettier --write src/telegram-groups/telegram-group-digest-cron.service.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts
npx jest src/telegram-groups/telegram-group-digest-cron.service.spec.ts
npm run typecheck
```

Expected: PASS (14 tests); typecheck exits 0. The cron no longer injects `TelegramGroupDigestBufferService`; it stays registered in the module until Task 16 and is harmless.

- [ ] **Step 5: Commit**

```bash
git add src/telegram-groups/telegram-group-digest-cron.service.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts
git commit -m "Send the group digest at 20:00 from the queue, retrying failed chats without duplicates" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Remove the Redis path; third checkpoint

**Files:**
- Modify: `src/telegram-groups/telegram-group-digest.service.ts` (delete the old `build()` path)
- Modify: `src/telegram-groups/telegram-group-digest.service.spec.ts` (delete the old `describe`)
- Delete: `src/telegram-groups/telegram-group-digest-buffer.service.ts`, `src/telegram-groups/telegram-group-digest-buffer.service.spec.ts`, `src/telegram-groups/telegram-group-broadcast.service.ts` (it has no spec)
- Modify: `src/telegram-groups/telegram-groups.module.ts`, `src/telegram-groups/constants.ts`, `src/telegram-groups/group-report-scope.ts` (comment only)
- Modify: `src/telegram-groups/telegram-branch-routing.spec.ts` (test the real rule instead of a copy)
- Create: `src/telegram-digest/direct-send.guard.spec.ts` (ADR-0025's "no direct sends" rule, enforced)
- Modify: `CLAUDE.md` (the `server/CLAUDE.md` line that still describes the 3-hourly digest)

**Interfaces:** none new — this task removes code nothing uses any more and locks the result in.

- [ ] **Step 1: Confirm nothing outside the files being edited still uses the old path**

```bash
grep -rnE "TelegramGroupBroadcastService|TelegramGroupDigestBufferService|DigestEntry|INSTANT_PAYMENT_THRESHOLD_SUM|TG_GROUP_(THROTTLE|BATCH|DIGEST_BUFFER)" src scripts test --include='*.ts'
```

Expected matches only in: `telegram-group-broadcast.service.ts`, `telegram-group-digest-buffer.service.ts` (+ its spec), `telegram-groups.module.ts`, `constants.ts`, `group-report-scope.ts` (comment), `telegram-group-digest.service.ts` / its spec (old `build()` path). Anything else means an earlier task is incomplete — stop and fix it first.

- [ ] **Step 2: Delete the old digest `build()` path and its tests**

In `src/telegram-groups/telegram-group-digest.service.ts` delete: the `import { DigestEntry } …` line, the `METHOD_LABELS` constant, the `tashkentHm` function, and the methods `build`, `studentsBlock`, `paymentsBlock`, `groupsBlock`, `capped` and `groupedByBranch`. Keep `buildBlocks`, `statusLine`, `cappedBlocks`, `branchBlocks` and the helpers added in Task 13. Replace the class doc comment with:

```typescript
/**
 * Composes the 20:00 group digest (ADR-0025) from queued GROUP rows the cron
 * has already filtered to one Telegram group. Formatting only — no I/O.
 */
```

In `src/telegram-groups/telegram-group-digest.service.spec.ts` delete the whole original `describe('TelegramGroupDigestService', () => { … })` block and the imports only it used (`DigestEntry`). Keep `describe('TelegramGroupDigestService.buildBlocks', …)` — it covers everything the old block did (window, branch sub-headers, payments total, new groups, escaping, section cap).

- [ ] **Step 3: Delete the Redis buffer and the instant broadcast service**

```bash
git rm src/telegram-groups/telegram-group-digest-buffer.service.ts src/telegram-groups/telegram-group-digest-buffer.service.spec.ts src/telegram-groups/telegram-group-broadcast.service.ts
```

- [ ] **Step 4: Clean up the module**

In `src/telegram-groups/telegram-groups.module.ts` delete the imports of `TelegramGroupBroadcastService` and `TelegramGroupDigestBufferService`. The `providers` and `exports` arrays become exactly:

```typescript
  providers: [
    TelegramGroupsService,
    TelegramGroupStatsService,
    TelegramGroupDailyReportService,
    TelegramGroupReportMenuService,
    TelegramGroupBroadcastListener,
    TelegramGroupDailyCronService,
    TelegramGroupAnnouncementService,
    TelegramGroupDigestService,
    TelegramGroupDigestCronService,
    TelegramAdminBotRegistrar,
    TelegramAdminBotService,
    DailySnapshotService,
    DailySnapshotCron,
  ],
  exports: [
    TelegramGroupsService,
    TelegramGroupStatsService,
    TelegramGroupAnnouncementService,
    TelegramAdminBotService,
  ],
```

(`TelegramGroupBroadcastService` was exported, but no other module imports it — Step 1 proved that.)

- [ ] **Step 5: Clean up the constants**

In `src/telegram-groups/constants.ts` replace everything above `// Reply messages (Uzbek)` with:

```typescript
// Per-section cap in the 20:00 group digest — extra items collapse to
// "... va yana N ta".
export const TG_GROUP_DIGEST_MAX_ITEMS = 30;

// A payment reaches the 20:00 group digest at/above this amount, or at any
// amount when paid online (Payme/Click/Uzum). Smaller cash/transfer payments
// are left to the 21:00 daily report.
export const LARGE_PAYMENT_THRESHOLD_SUM = 500_000;
```

- [ ] **Step 6: Fix the stale comment in `group-report-scope.ts`**

Replace

```typescript
 * It is the same rule `TelegramGroupBroadcastService` applies to events; the
 * reports were the half that never got it.
```

with

```typescript
 * It is the same branch rule the 20:00 group digest applies to queued events
 * (`isVisibleToGroup` in telegram-group-digest-cron.service.ts), with one
 * difference: a legacy branch-less group stays company-wide for reports (see
 * below) but fail-closed for the digest.
```

- [ ] **Step 7: Test the real routing rule in `telegram-branch-routing.spec.ts`**

The spec's local `recipients()` said it "Mirrors the `where` the broadcast service builds" — that service is gone. Its rule is exactly `isVisibleToGroup` (Task 15), so test that instead. Add as the first line of `src/telegram-groups/telegram-branch-routing.spec.ts`:

```typescript
import { isVisibleToGroup } from './telegram-group-digest-cron.service';
```

and replace

```typescript
  /** Mirrors the `where` the broadcast service builds. */
  function recipients(eventBranchId: number | null, groups: Group[]) {
    if (eventBranchId == null) return groups; // company-level → everyone
    return groups.filter(
      (g) => g.branchId === eventBranchId || g.receivesAllBranches === true,
    );
  }
```

with

```typescript
  /** The production rule: the 20:00 group digest's `isVisibleToGroup`. */
  function recipients(eventBranchId: number | null, groups: Group[]) {
    return groups.filter((g) =>
      isVisibleToGroup(
        { branchId: eventBranchId },
        {
          branchId: g.branchId,
          receivesAllBranches: g.receivesAllBranches ?? false,
        },
      ),
    );
  }
```

Every existing test in that file must pass unchanged — the rule did not change, only where it lives.

- [ ] **Step 8: Enforce ADR-0025's "no direct sends" rule with a guard spec**

```typescript
// src/telegram-digest/direct-send.guard.spec.ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * ADR-0025: every Telegram notification waits for the 20:00 digest unless it
 * is on the instant list. This freezes who may call `.sendMessage(` directly,
 * so a new notification cannot slip past the queue by accident.
 *
 * Adding an entry is a product decision, not a code fix: put the message on
 * the instant list in the spec and ADR-0025 first, then here.
 */
const ALLOWED: string[] = [
  // The digest crons' own single sender.
  'src/telegram-digest/telegram-send.ts',
  // Instant by design — the spec's "O'zgarmaydi" table.
  'src/absence-pause/', // auto-pause reminders and pause notices
  'src/telegram/', // bot flows, registration, OTP, mock exams
  'src/sms/sms.service.ts', // admin free text + lesson cancel/reschedule
  'src/lesson-cancellations/lesson-cancellation-events.listener.ts',
  'src/lesson-reschedules/lesson-reschedule-events.listener.ts',
  'src/attendance/attendance-reminder.service.ts', // lesson start/end reminders
  'src/attendance/student-attendance-notification.listener.ts', // flag-gated, off
  'src/notifications/notification-events.listener.ts', // payment-promise.overdue (09:00) only
  'src/telegram-groups/telegram-admin-bot-registrar.ts', // group bot commands
  'src/telegram-groups/telegram-group-announcement.service.ts', // product news
  'src/telegram-groups/telegram-group-daily-cron.service.ts', // 21:00 report
];

const ROOT = join(__dirname, '..', '..'); // server/

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

const callers = walk(join(ROOT, 'src'))
  .filter((file) => /\.sendMessage\(/.test(readFileSync(file, 'utf8')))
  .map((file) => relative(ROOT, file).split('\\').join('/'))
  .sort();

const isAllowed = (path: string) =>
  ALLOWED.some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );

describe('direct Telegram sends — ADR-0025', () => {
  it('finds the sender it is built around (a scan that matches nothing proves nothing)', () => {
    expect(callers).toContain('src/telegram-digest/telegram-send.ts');
  });

  it('allows direct sendMessage only in the instant senders', () => {
    const offenders = callers.filter((path) => !isAllowed(path));
    expect({
      offenders,
      fix: 'queue it via TelegramDigestQueueService, or put it on the instant list in the spec and ADR-0025 first',
    }).toEqual({ offenders: [], fix: expect.any(String) });
  });

  it('keeps the allow-list honest — every file entry still sends directly', () => {
    const stale = ALLOWED.filter(
      (entry) => !entry.endsWith('/') && !callers.includes(entry),
    );
    expect(stale).toEqual([]);
  });
});
```

- [ ] **Step 9: Fix the stale line in `server/CLAUDE.md`**

In `CLAUDE.md` (the `server/` one — you are in `server/`), line ~329, replace

```
`TelegramGroupDigestCronService` (every 3h digest of buffered events)
```

with

```
`TelegramGroupDigestCronService` (20:00 group digest from the `TelegramDigestItem` queue, ADR-0025)
```

and replace the sentence

```
Event-driven Telegram messages (attendance, debt, lesson cancellation, payment, task) are NOT gated — they fire whenever the underlying user action happens.
```

with

```
Personal Telegram notifications (payment, enrollment, debt, task, attendance) are queued and sent by `TelegramDigestPersonalCronService` at 20:00 every day, Sundays and holidays included (ADR-0025); lesson cancellation/reschedule and the other messages on ADR-0025's instant list still fire when the user action happens.
```

- [ ] **Step 10: Prove the old path is gone, then typecheck and run everything**

```bash
npx prettier --write src/telegram-groups src/telegram-digest
grep -rnE "TelegramGroupBroadcastService|TelegramGroupDigestBufferService|DigestEntry|INSTANT_PAYMENT_THRESHOLD_SUM|TG_GROUP_(THROTTLE|BATCH|DIGEST_BUFFER)|tg-group:" src scripts test --include='*.ts'
npm run typecheck
npm test
```

Expected: the grep prints nothing; typecheck exits 0; every suite passes, including the new `direct-send.guard.spec.ts` (3 tests) and the unchanged tests of `telegram-branch-routing.spec.ts`.

- [ ] **Step 11: Commit**

```bash
git add -u src/telegram-groups CLAUDE.md
git add src/telegram-digest/direct-send.guard.spec.ts
git commit -m "Remove the Redis digest buffer and instant group broadcast; guard direct Telegram sends" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git add -u` stages the edits and the three deletions under `src/telegram-groups` and `CLAUDE.md`; the guard spec is new, so it is added by name.)

---

### Task 17: Final verification

No new code. Every step must pass before the branch goes to review. If a step fails, fix it in a new commit on this branch and rerun the whole task.

- [ ] **Step 1: Tests, types, lint, build**

```bash
npm test
npm run typecheck
npx eslint src
npm run build
```

Expected: all suites pass; typecheck exits 0; eslint reports **0 errors** (warnings are acceptable by project convention); build exits 0.

- [ ] **Step 2: Boot check with bots and crons disabled**

Same as Task 7 Step 6 — one command that starts, waits and stops:

```bash
(CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= PORT=3999 node dist/src/main > /tmp/tg-digest-boot.log 2>&1 & PID=$!; for i in $(seq 1 36); do grep -qE "successfully started|resolve dependencies|UnknownDependenciesException" /tmp/tg-digest-boot.log && break; sleep 5; done; kill $PID; grep -E "successfully started|resolve dependencies|UnknownDependenciesException" /tmp/tg-digest-boot.log)
```

Expected: `Nest application successfully started`; no unresolved dependencies.

- [ ] **Step 3: The files that must stay untouched are untouched**

Diff against the commit this branch started from (the local `main` ref may be stale — use the merge-base with `origin/main`). Every step below defines `BASE` itself, because shell variables do not survive between tool calls:

```bash
git fetch origin --quiet
BASE=$(git merge-base HEAD origin/main)
git diff --exit-code --stat "$BASE" -- \
  src/lesson-reschedules/lesson-reschedule-events.listener.ts \
  src/lesson-cancellations/lesson-cancellation-events.listener.ts \
  src/sms/sms.service.ts src/sms/sms-templates.ts \
  src/absence-pause \
  src/attendance/attendance-reminder.service.ts \
  src/attendance/student-attendance-notification.listener.ts \
  src/telegram \
  src/telegram-groups/telegram-group-daily-cron.service.ts \
  src/telegram-groups/telegram-group-announcement.service.ts \
  src/telegram-groups/telegram-admin-bot-registrar.ts \
  src/telegram-groups/telegram-group-report-menu.service.ts \
  && echo UNTOUCHED
```

Expected: `UNTOUCHED` (exit 0, no stat lines). The paths are relative to `server/` because the command runs there.

- [ ] **Step 4: The payment-promise sender is still instant and unchanged**

Compare the whole `payment-promise.overdue` handler and the private `sendTelegram()` with the branch base, then run the unit test that proves it still sends instantly and queues nothing:

```bash
BASE=$(git merge-base HEAD origin/main)
promise_path() { awk '/@OnEvent\(.payment-promise\.overdue.\)/,/^  }$/ { print } /^  private async sendTelegram\(/,/^  }$/ { print }'; }
diff <(git show "$BASE:./src/notifications/notification-events.listener.ts" | promise_path) <(promise_path < src/notifications/notification-events.listener.ts) && echo "promise path identical"
npx jest src/notifications/notification-events.listener.spec.ts -t "still sends Telegram instantly"
```

Expected: `promise path identical` (the extract is ~100 lines on both sides), and the test passes.

- [ ] **Step 5: Both crons run at 20:00 Tashkent, and nothing else was rescheduled**

```bash
BASE=$(git merge-base HEAD origin/main)
grep -rn "@Cron('0 20 \* \* \*', { timeZone: 'Asia/Tashkent' })" src
git diff "$BASE" -- src | grep -nE "^[-+].*@Cron\(" 
```

Expected: the first grep lists exactly `telegram-digest-personal-cron.service.ts` and `telegram-group-digest-cron.service.ts`. The second shows only the group cron's schedule change (`-` the old `'0 9,12,15,18,21 * * *'`, `+` the new line) and the new personal cron line.

- [ ] **Step 6: No direct Telegram send outside the instant list**

```bash
npx jest src/telegram-digest/direct-send.guard.spec.ts
```

Expected: PASS (3 tests). The spec lists exactly who may call `.sendMessage(` (Task 16 Step 8).

- [ ] **Step 7: The migration is recorded on the dev DB**

```bash
npx prisma migrate status
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | grep -c "TelegramDigest"
```

Expected: `20260923200000_add_telegram_digest_item` is not listed as pending (other drift on the shared dev DB is pre-existing and out of scope), and the second command prints `0` — the table and enums on the dev DB match the schema.

- [ ] **Step 8: Hand-off notes for the reviewer / deploy**

Record in the PR description (English):
- Deploy the backend only (no frontend change). `railway up` runs `prisma migrate deploy`, which creates the table.
- Deploy **after the old 21:00 group flush on a working day**: events still sitting in the Redis buffer `tg-group:batch:<companyId>` are not migrated, so anything buffered between 21:00 and the deploy is dropped (normally nothing at night).
- First 20:00 run after deploy: personal and group digests go out; the 21:00 report is unchanged.
- Auto-pause messages (stages 1–2 at 20:30 on the lesson day, the pause itself at 07:30 — owned by `src/absence-pause`, changed on its own branch, PR #511) and lesson cancel/reschedule notices remain instant by design (spec, ADR-0025). A student who missed a lesson may get two evening messages: the 20:00 digest and the 20:30 auto-pause reminder (accepted by the CEO).

This task has no commit of its own unless a step required a fix.
