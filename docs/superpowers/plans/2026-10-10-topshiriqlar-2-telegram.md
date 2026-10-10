# Topshiriqlar — 2-bosqich «Telegram» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task notices reach linked staff in Telegram the moment they happen (night quiet 22:00–08:00 Tashkent, `URGENT` exempt), with buttons that edit the same message, text replies that become comments or return reasons, and a «📋 Topshiriqlarim» list with step toggles — every write going through `TasksService`.

**Architecture:** The pure plan `task-notify-plan.ts` gains a `telegram` field per notice, so the bell and Telegram come from one list. A new folder `server/src/tasks/telegram/` holds a pure renderer (texts, buttons, callback data), a view loader with the staff-identity helpers, a sender (one `sendMessage` + a `TaskTelegramMessage` row), a post-commit listener (send now, or queue in `TaskOutbox` for the morning / a retry), a per-minute drain of `TELEGRAM` outbox rows, and `TaskTelegramHandler`, which registers `tk:*` callbacks and a reply handler on the main bot (`TelegramService.getBot()`) in `onApplicationBootstrap`. `TasksModule` imports `TelegramModule`; nothing in `src/telegram/` imports `src/tasks/` (one-way: the staff menu only owns the `'tk:list'` string the tasks module answers).

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@nestjs/event-emitter`, `@nestjs/schedule`, Telegraf 4.16, Jest (ts-jest, type-checked). Client: guide/news text only (Next.js 16, vitest).

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §6.1–6.5, §9.3 (TELEGRAM channel), §9.6 (03:00 purge), §11 row 2, §12 ADR-B, §13. Mockups: artifact `THVfP3KSZ8DvRXxWc6PaEk`, screen s14 «Telegram» and the Telegram half of s17 «Qadamlar» — the texts below are taken from them verbatim where the mockup has one.

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup` (branch `feat/topshiriqlar-2-telegram`). Never `cd` to the main checkout or `/tmp`; use absolute paths inside the worktree. The harness refuses complex bash with shell variables — run plain, separate commands.
- **Never touch a database.** The dev DB in `server/.env` is shared and 8+ migrations behind; prod is off-limits. Never run `prisma migrate deploy|dev|resolve`, `db push`, `db execute`. The migration SQL is produced offline (schema-to-schema diff, Task 1). `npx prisma generate` is the only Prisma command that runs.
- UI and bot text: Uzbek, Latin script only, no English words. In JSX, apostrophes inside a JS string, never `&apos;` (no JSX in this plan).
- Server: `npx prettier --write <touched .ts files>` before every commit. **Client: never run Prettier.** React Compiler is on (no client code in this plan).
- Dates: Tashkent only through `server/src/common/date/tashkent.ts` (`tashkentDateStr`, `tashkentDayStartUtc`, `addDaysToDateStr`, `TASHKENT_OFFSET_MS`). Never `setHours` / local time.
- No real credentials in the repo (it is public). No new env var.
- Every write to a `Task*` table stays inside `src/tasks/` (`task-write.single-source.spec.ts`); every user-facing action goes through `TasksService` with the staff user as actor.
- `event-wiring.spec.ts` must stay green: this plan adds no new event; the new listener hears the existing `task.*` events only.
- `src/telegram-digest/direct-send.guard.spec.ts` must stay green: `src/tasks/telegram/` joins its ALLOWED list in Task 5.
- Commits: English message; second `-m` is the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add <repo-relative paths>` then `git -C … commit`.
- Server gate per task (from `server/`): `npx prettier --write <files>` → `npx eslint <dirs> --quiet` → `npx jest <specs>` → `npm run typecheck`. Never run `npm run build` and `npm test` at the same time.
- ADR number: 0078 is the next free number (0077 went to refunds) on `origin/main` today — **recheck `docs/adr/README.md` at PR time** and renumber with `git mv` if `main` took it.

---

## Design decisions (not dictated by the spec or the controller)

1. **`TaskOutbox` holds night/retry notices.** New kind `NOTICE` with the planned message in a new `payload Json?` column. The unique key `(taskId, userId, channel, kind)` is replaced by `@@index([taskId, userId])`: one person can have several notices of one task waiting overnight (assigned, then a comment). `scheduleTaskOutbox` now deletes only `REMINDER`/`OVERDUE` rows, so a due change never drops a queued notice.
2. **Telegram code lives in `TasksModule`**, which imports `TelegramModule` (no cycle: `TelegramModule` imports nothing from tasks, and `NotificationsModule` already imports it). Handlers are registered in `onApplicationBootstrap` — after every `onModuleInit`, so the bot exists, and after the bot's own handlers, so `/start`, commands and the other menus answer first. Telegraf recomposes its middleware on every `use`, so handlers added after `launch()` take effect.
3. **«Ochish» is a URL button** to `https://<admin|lehrer>.<host>/tasks?task=<id>`, the host derived from `TELEGRAM_MINI_APP_URL` with the existing `staffMiniAppUrl(…, staffPortalFor(roleIds))`. No client change: the Mini App's `/tg?next=` whitelist (`client/src/lib/telegram-mini-app.ts`) does not take `/tasks?task=`. When `TELEGRAM_MINI_APP_URL` is unset (or not a `student.` host) there is no «Ochish».
4. **A pressed message keeps its first line.** On redraw the old message's first line (Telegram hands it back as plain text) stays as the headline («Yangi topshiriq · Yuqori» → still that after «Boshladim», mockup s14 #1); «Orqaga» from the step list and a «Topshiriqlarim» card use the title as the headline (mockup s17).
5. **Spec §6.1 table taken literally:** watchers get Telegram only for «Bajarildi» / «Bekor qilindi» (no comments), assignees get no Telegram on cancel (the bell still tells them). A self-task closed by its author now tells its watchers «Bajarildi» (bell and Telegram) — before, nothing told them.
6. **`task.assigned` gains `created: true`** when the task is new, so Telegram says «Yangi topshiriq · <muhimlik>» for a new task and «Siz topshiriqqa qo'shildingiz» + «Qo'shdi:» for someone added later (mockup s14 #8).
7. **A transient failure of an immediate send** becomes a `NOTICE` row with `attempts = 1`, `sendAfter` = now + `retry_after` (or 60 s), night-shifted like any other row.
8. **«Topshiriqlarim»** lists open tasks the person is an ASSIGNEE of, except «Dars bo'ldimi?»; the menu button is «📋 Topshiriqlarim» (emoji like its siblings «📅 Jadval», «💰 Oyligim»).
9. **`TaskTelegramMessage` rows are not purged** (one tiny row per message, cascade-deleted with the task). Add a purge if the table ever matters.
10. **ADR-0025** gets only its status line changed (accepted ADRs are not edited); the new instant-list entry is recorded in ADR-0078, in `server/CLAUDE.md` and in the guard spec.
11. Migration timestamp `20261010190000` (later than `20261010130000`, the newest on `origin/main`).

## File Structure

**Server — new**
- `server/src/tasks/task-quiet-hours.ts` (+ `.spec.ts`) — pure: `afterQuietHours`, `telegramSendAfter`.
- `server/prisma/migrations/20261010190000_task_telegram/migration.sql` — enum value, `payload`, index swap, `TaskTelegramMessage`.
- `server/src/tasks/telegram/task-telegram-text.ts` (+ `.spec.ts`) — pure: view type, bot texts, message/keyboard rendering, callback codec.
- `server/src/tasks/telegram/task-telegram-view.ts` (+ `.spec.ts`) — `loadTaskView`, `staffOfChat`, `staffChatOf`, `taskOpenUrl`.
- `server/src/tasks/telegram/task-telegram.sender.ts` (+ `.spec.ts`) — `TaskTelegramSender`: one send + its `TaskTelegramMessage`.
- `server/src/tasks/telegram/task-telegram.listener.ts` (+ `.spec.ts`) — `TaskTelegramListener`: events → send now / queue.
- `server/src/tasks/telegram/task-telegram-outbox.service.ts` (+ `.spec.ts`) — `TaskTelegramOutbox`: per-minute drain of `TELEGRAM` rows.
- `server/src/tasks/telegram/task-telegram.handler.ts` (+ `.spec.ts`) — `TaskTelegramHandler`: buttons, replies, «Topshiriqlarim».
- `docs/adr/0078-topshiriq-xabarlari-telegramga-darhol.md`.

**Server — modified**
- `server/prisma/schema.prisma` — `TaskOutboxKind.NOTICE`, `TaskTelegramPurpose`, `TaskOutbox.payload` + index, `TaskTelegramMessage`, `Task.telegramMessages`.
- `server/src/tasks/task-outbox.service.ts` (+ spec) — `OutboxTask.kind/priority`, TELEGRAM time rows, scoped delete, 03:00 `purge`.
- `server/src/tasks/lesson-task.ts`, `server/src/tasks/task-user-lifecycle.listener.ts` (+ spec) — pass `kind`/`priority` to `scheduleTaskOutbox`.
- `server/src/tasks/task-write.single-source.spec.ts` — the scan also covers `taskTelegramMessage`.
- `server/src/tasks/tasks.service.ts`, `task-status-writes.ts`, `task-step-writes.ts`, `task-events.ts` (+ `tasks.service.spec.ts`) — `TaskActor.via`, `created` flag.
- `server/src/tasks/task-notify-plan.ts` (+ spec), `server/src/tasks/task-notify.listener.ts` — `Notice.telegram`, `noticeUserIds`.
- `server/src/tasks/tasks.module.ts` — imports `TelegramModule`, four providers.
- `server/src/telegram/staff/staff-cabinet.ts` (+ spec) — `STAFF_TASKS_ACTION`, menu row.
- `server/src/telegram-digest/direct-send.guard.spec.ts` — ALLOWED entry + «no `TASK_*` digest category» guard.
- `server/CLAUDE.md`, `docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md` (status line), `docs/adr/README.md`.

**Client — text only**
- `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`. The picker's «Telegram ulanmagan» badge already exists (`client/src/components/tasks/task-assignee-picker.tsx:67`), so no client code. `client/CLAUDE.md` does not mention task Telegram — unchanged.

---

### Task 1: Schema, migration, night quiet, Telegram time rows, 03:00 purge

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `TaskOutboxKind` ~line 204, model `Task` ~1972, model `TaskOutbox` ~2069)
- Create: `server/prisma/migrations/20261010190000_task_telegram/migration.sql`
- Create: `server/src/tasks/task-quiet-hours.ts`, `server/src/tasks/task-quiet-hours.spec.ts`
- Modify: `server/src/tasks/task-outbox.service.ts`, `server/src/tasks/task-outbox.service.spec.ts`
- Modify: `server/src/tasks/lesson-task.ts:138-146`, `server/src/tasks/task-user-lifecycle.listener.ts:115-120`, `server/src/tasks/task-user-lifecycle.listener.spec.ts:~330`
- Modify: `server/src/tasks/task-write.single-source.spec.ts` (`WRITE` regex)

**Interfaces:**
- Produces (`task-quiet-hours.ts`): `afterQuietHours(at: Date): Date`, `telegramSendAfter(at: Date, priority: TaskPriority): Date`.
- Produces (`task-outbox.service.ts`): `OutboxTask` gains `kind: TaskKind; priority: TaskPriority` (required); `TaskOutboxService.purge(now?: Date): Promise<number>`.
- Produces (Prisma): `TaskOutboxKind.NOTICE`; `TaskOutbox.payload Json?`; enum `TaskTelegramPurpose { NOTICE RETURN_PROMPT }`; model `TaskTelegramMessage { id, chatId String, messageId Int, taskId, userId Int, purpose, companyId Int, createdAt }` with `@@unique([chatId, messageId])` (Prisma name `chatId_messageId`) and `@@index([taskId])`.

- [ ] **Step 1: Write the failing spec for night quiet**

Create `server/src/tasks/task-quiet-hours.spec.ts`:

```ts
import { afterQuietHours, telegramSendAfter } from './task-quiet-hours';

// Tashkent is UTC+5: 22:00 Tashkent = 17:00Z, 08:00 Tashkent = 03:00Z.
describe('night quiet (spec §6.4: 22:00–08:00 Asia/Tashkent)', () => {
  it.each([
    ['21:59 goes now', '2026-10-12T16:59:00.000Z', '2026-10-12T16:59:00.000Z'],
    ['22:00 waits for 08:00', '2026-10-12T17:00:00.000Z', '2026-10-13T03:00:00.000Z'],
    ['23:30 waits for 08:00', '2026-10-12T18:30:00.000Z', '2026-10-13T03:00:00.000Z'],
    ['00:10 waits for the same morning', '2026-10-12T19:10:00.000Z', '2026-10-13T03:00:00.000Z'],
    ['07:59 waits one minute', '2026-10-13T02:59:00.000Z', '2026-10-13T03:00:00.000Z'],
    ['08:00 goes now', '2026-10-13T03:00:00.000Z', '2026-10-13T03:00:00.000Z'],
    ['31.10 23:00 → 01.11 08:00', '2026-10-31T18:00:00.000Z', '2026-11-01T03:00:00.000Z'],
  ])('%s', (_label, from, to) => {
    expect(afterQuietHours(new Date(from)).toISOString()).toBe(to);
  });

  it('an URGENT task never waits', () => {
    const night = new Date('2026-10-12T18:30:00.000Z');
    expect(telegramSendAfter(night, 'URGENT')).toBe(night);
  });

  it.each(['LOW', 'MEDIUM', 'HIGH'] as const)('%s waits for the morning', (p) => {
    expect(
      telegramSendAfter(new Date('2026-10-12T18:30:00.000Z'), p).toISOString(),
    ).toBe('2026-10-13T03:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/task-quiet-hours.spec.ts`
Expected: FAIL — `Cannot find module './task-quiet-hours'`.

- [ ] **Step 3: Write `task-quiet-hours.ts`**

```ts
import type { TaskPriority } from '@prisma/client';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';

/** Spec 2026-10-07 §6.4: nothing reaches Telegram 22:00–08:00 Asia/Tashkent. */
const QUIET_FROM_MIN = 22 * 60;
const QUIET_UNTIL_MIN = 8 * 60;

/** `at`, or the next 08:00 Tashkent when `at` falls in the quiet hours. */
export function afterQuietHours(at: Date): Date {
  const day = tashkentDateStr(at);
  const minute = Math.floor(
    (at.getTime() - tashkentDayStartUtc(day).getTime()) / 60_000,
  );
  if (minute >= QUIET_UNTIL_MIN && minute < QUIET_FROM_MIN) return at;
  const morning = minute < QUIET_UNTIL_MIN ? day : addDaysToDateStr(day, 1);
  return new Date(
    tashkentDayStartUtc(morning).getTime() + QUIET_UNTIL_MIN * 60_000,
  );
}

/** When a Telegram notice ready at `at` may go out; an URGENT task's never waits. */
export function telegramSendAfter(at: Date, priority: TaskPriority): Date {
  return priority === 'URGENT' ? at : afterQuietHours(at);
}
```

- [ ] **Step 4: Run the spec**

Run: `npx jest src/tasks/task-quiet-hours.spec.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Change the schema**

In `server/prisma/schema.prisma`:

Replace the `TaskOutboxKind` enum with (and add the new enum right after it):

```prisma
enum TaskOutboxKind {
  REMINDER
  OVERDUE
  NOTICE
}

enum TaskTelegramPurpose {
  NOTICE
  RETURN_PROMPT
}
```

In `model Task`, replace the relation block (from `participants   TaskParticipant[]` to `unmarkedLesson UnmarkedLesson?   @relation("UnmarkedLessonTaskRow")`) with:

```prisma
  participants     TaskParticipant[]
  steps            TaskStep[]
  events           TaskEvent[]
  outbox           TaskOutbox[]
  telegramMessages TaskTelegramMessage[]
  notifications    Notification[]
  unmarkedLesson   UnmarkedLesson?       @relation("UnmarkedLessonTaskRow")
```

Replace the comment line above `model TaskOutbox` and the whole model with:

```prisma
/// Notices waiting for their time (spec §9.3): REMINDER / OVERDUE on both
/// channels, and Telegram notices held for the night quiet or a retry (NOTICE).
model TaskOutbox {
  id        String            @id @default(uuid())
  taskId    String
  task      Task              @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    Int
  channel   TaskOutboxChannel
  kind      TaskOutboxKind
  sendAfter DateTime
  attempts  Int               @default(0)
  sentAt    DateTime?
  lastError String?
  /// NOTICE only: the planned `TgNotice` (task-notify-plan.ts).
  payload   Json?
  createdAt DateTime          @default(now())

  /// Several notices of one task may wait for one person overnight, so no unique key.
  @@index([taskId, userId])
  @@index([sendAfter, sentAt])
}

/// A bot message about a task (spec §6.2): a reply to it is routed to the task.
model TaskTelegramMessage {
  id        String              @id @default(uuid())
  chatId    String
  messageId Int
  taskId    String
  task      Task                @relation(fields: [taskId], references: [id], onDelete: Cascade)
  /// Whom it was sent to (a bare id, like TaskOutbox.userId).
  userId    Int
  purpose   TaskTelegramPurpose
  companyId Int
  createdAt DateTime            @default(now())

  @@unique([chatId, messageId])
  @@index([taskId])
}
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx prisma generate`
Expected: «Generated Prisma Client».

- [ ] **Step 6: Produce the migration offline (no database)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git show HEAD:server/prisma/schema.prisma > prisma/.schema-before.prisma
mkdir -p prisma/migrations/20261010190000_task_telegram
npx prisma migrate diff --from-schema prisma/.schema-before.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/20261010190000_task_telegram/migration.sql
rm prisma/.schema-before.prisma
cat prisma/migrations/20261010190000_task_telegram/migration.sql
```

If the first line of the file is `Loaded Prisma config from prisma.config.ts.`, delete that line. Expected statements (order may differ), and nothing else — otherwise stop and report:

```sql
-- CreateEnum
CREATE TYPE "TaskTelegramPurpose" AS ENUM ('NOTICE', 'RETURN_PROMPT');

-- AlterEnum
ALTER TYPE "TaskOutboxKind" ADD VALUE 'NOTICE';

-- DropIndex
DROP INDEX "TaskOutbox_taskId_userId_channel_kind_key";

-- AlterTable
ALTER TABLE "TaskOutbox" ADD COLUMN     "payload" JSONB;

-- CreateTable
CREATE TABLE "TaskTelegramMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "purpose" "TaskTelegramPurpose" NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskTelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskTelegramMessage_taskId_idx" ON "TaskTelegramMessage"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTelegramMessage_chatId_messageId_key" ON "TaskTelegramMessage"("chatId", "messageId");

-- CreateIndex
CREATE INDEX "TaskOutbox_taskId_userId_idx" ON "TaskOutbox"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "TaskTelegramMessage" ADD CONSTRAINT "TaskTelegramMessage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Then put this header at the top of the file (keep the generated statements as generated):

```sql
-- Topshiriqlar 2-bosqich, Telegram (ADR-0078; spec 2026-10-07 §6, §9.3).
-- TaskOutbox also holds Telegram notices waiting for 08:00 or a retry (NOTICE +
-- payload); one person may have several of one task, so the unique key becomes
-- a plain index. TaskTelegramMessage maps a bot message to its task for replies.
-- `ADD VALUE` is not used in this migration, so it is safe inside the
-- transaction (PostgreSQL 12+). Hand-checked; produced with a schema-to-schema
-- diff, the dev database is behind main.
```

- [ ] **Step 7: Update the outbox spec first (failing)**

In `server/src/tasks/task-outbox.service.spec.ts`:

1. Every `svc.schedule(prisma, {` literal (five of them) gets two more keys right after `id: 't1',`:
   ```ts
      kind: 'MANUAL' as const,
      priority: 'MEDIUM' as const,
   ```
2. Inside `describe('TaskOutboxService', …)`, right after `beforeEach`, add:
   ```ts
  const written = () =>
    prisma.taskOutbox.createMany.mock.calls[0][0].data as any[];
  const inapp = () => written().filter((r) => r.channel === 'INAPP');
  const telegram = () =>
    written()
      .filter((r) => r.channel === 'TELEGRAM')
      .map((r) => [r.userId, r.kind, r.sendAfter.toISOString()]);
   ```
3. In the two tests «schedule writes REMINDER…» and «schedule with a due 30 minutes ahead…» replace `const rows = prisma.taskOutbox.createMany.mock.calls[0][0].data;` with `const rows = inapp();`.
4. In «schedule clears every earlier row…» replace the expectation with:
   ```ts
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', kind: { in: ['REMINDER', 'OVERDUE'] } },
    });
   ```
   and rename the test to `'schedule clears every earlier time row, sent ones included, and keeps queued Telegram notices'`.
5. Append these tests inside the same `describe`:

```ts
  describe('Telegram time rows (spec §6.4, §9.3)', () => {
    afterEach(() => jest.useRealTimers());
    const base = {
      id: 't1',
      kind: 'MANUAL' as const,
      authorId: 30,
      participants: [{ userId: 40, role: 'ASSIGNEE' as const }],
    };

    it('writes a TELEGRAM row next to every in-app row; a night one waits for 08:00', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:00:00.000Z'));
      // Due 13.10 08:30 Tashkent: the reminder (07:30) falls in the quiet hours.
      await svc.schedule(prisma, {
        ...base,
        priority: 'MEDIUM',
        dueAt: new Date('2026-10-13T03:30:00.000Z'),
      });
      expect(telegram()).toEqual([
        [40, 'REMINDER', '2026-10-13T03:00:00.000Z'],
        [40, 'OVERDUE', '2026-10-13T03:30:00.000Z'],
        [30, 'OVERDUE', '2026-10-13T03:30:00.000Z'],
      ]);
      expect(inapp()[0].sendAfter.toISOString()).toBe('2026-10-13T02:30:00.000Z');
    });

    it('an URGENT task is told at night too', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-12T05:00:00.000Z'));
      // Due 12.10 22:00 Tashkent.
      await svc.schedule(prisma, {
        ...base,
        priority: 'URGENT',
        dueAt: new Date('2026-10-12T17:00:00.000Z'),
      });
      expect(telegram()).toContainEqual([40, 'OVERDUE', '2026-10-12T17:00:00.000Z']);
    });

    it("«Dars bo'ldimi?» gets no Telegram rows", async () => {
      await svc.schedule(prisma, {
        ...base,
        kind: 'LESSON_QUESTION',
        priority: 'HIGH',
        authorId: null,
        dueAt: new Date(Date.now() + 3 * 3600_000),
      });
      expect(telegram()).toEqual([]);
      expect(inapp()).toHaveLength(2);
    });
  });

  it('purge drops sent rows and dead rows older than 30 days', async () => {
    prisma.taskOutbox.deleteMany.mockResolvedValue({ count: 4 });
    await expect(svc.purge(new Date('2026-11-10T22:00:00.000Z'))).resolves.toBe(4);
    const before = new Date('2026-10-11T22:00:00.000Z');
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { sentAt: { lt: before } },
          { sentAt: null, attempts: { gte: 3 }, createdAt: { lt: before } },
        ],
      },
    });
  });
```

Run: `npx jest src/tasks/task-outbox.service.spec.ts`
Expected: FAIL (type errors on `kind`/`priority`, no TELEGRAM rows, no `purge`).

- [ ] **Step 8: Implement in `task-outbox.service.ts`**

Add imports: `import { Prisma, TaskKind, TaskPriority, UserStatus } from '@prisma/client';` (replace the current `Prisma, UserStatus` import) and `import { telegramSendAfter } from './task-quiet-hours';`.

Replace `OutboxTask` and `scheduleTaskOutbox` with:

```ts
const SENT_KEEP_MS = 30 * 24 * 3600_000;

export interface OutboxTask {
  id: string;
  kind: TaskKind;
  priority: TaskPriority;
  dueAt: Date | null;
  authorId: number | null;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
}

/**
 * (Re)writes the time-based rows for a task. A free function so a plain writer
 * with no Nest instance (the «Dars bo'ldimi?» task) can schedule too; the
 * service method delegates here.
 */
export async function scheduleTaskOutbox(
  db: Db,
  task: OutboxTask,
): Promise<void> {
  // Sent time rows go too, so a deadline moved past an old one notifies
  // again. Telegram notices queued for the morning (NOTICE) are not time
  // rows and stay.
  await db.taskOutbox.deleteMany({
    where: { taskId: task.id, kind: { in: ['REMINDER', 'OVERDUE'] } },
  });
  const dueAt = task.dueAt;
  if (!dueAt) return;
  const assignees = task.participants
    .filter((p) => p.role === 'ASSIGNEE')
    .map((p) => p.userId);
  const overdueTo = [
    ...new Set([
      ...assignees,
      ...(task.authorId !== null ? [task.authorId] : []),
    ]),
  ];
  const now = Date.now();
  const due = [
    ...assignees.map((userId) => ({
      userId,
      kind: 'REMINDER' as const,
      at: new Date(dueAt.getTime() - REMINDER_LEAD_MS),
    })),
    ...overdueTo.map((userId) => ({
      userId,
      kind: 'OVERDUE' as const,
      at: dueAt,
    })),
  ].filter((r) => r.at.getTime() > now);
  // «Dars bo'ldimi?» never goes to Telegram (spec §6.1): the lesson-end
  // message already covers it.
  const toTelegram = task.kind !== 'LESSON_QUESTION';
  const rows = [
    ...due.map((r) => ({
      taskId: task.id,
      userId: r.userId,
      channel: 'INAPP' as const,
      kind: r.kind,
      sendAfter: r.at,
    })),
    ...(toTelegram
      ? due.map((r) => ({
          taskId: task.id,
          userId: r.userId,
          channel: 'TELEGRAM' as const,
          kind: r.kind,
          // The night shift is decided now; the drain only looks at sendAfter.
          sendAfter: telegramSendAfter(r.at, task.priority),
        }))
      : []),
  ];
  if (rows.length) await db.taskOutbox.createMany({ data: rows });
}
```

Add to `TaskOutboxService` (after `drain`):

```ts
  /** Spec §9.6: sent rows, and rows that failed three times, go after 30 days. */
  @Cron('0 0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async purge(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SENT_KEEP_MS);
    const { count } = await this.prisma.taskOutbox.deleteMany({
      where: {
        OR: [
          { sentAt: { lt: before } },
          { sentAt: null, attempts: { gte: 3 }, createdAt: { lt: before } },
        ],
      },
    });
    return count;
  }
```

Update the header comment of `TaskOutboxService.schedule` if it mentions INAPP only. `drainDue` stays as is (it already reads `channel: 'INAPP'` only).

- [ ] **Step 9: Pass `kind` and `priority` from the two plain writers**

`server/src/tasks/lesson-task.ts` — in the `scheduleTaskOutbox(tx, { … })` call add after `id: task.id,`:

```ts
    kind: 'LESSON_QUESTION',
    priority: 'HIGH',
```

`server/src/tasks/task-user-lifecycle.listener.ts` — in the `scheduleTaskOutbox(tx, { … })` call add after `id: t.id,` (the row is loaded with `TASK_CARD_SELECT`, which has both):

```ts
              kind: t.kind,
              priority: t.priority,
```

`server/src/tasks/task-user-lifecycle.listener.spec.ts` — in «gives the new assignee the reminders the leaver had» replace the `deleteMany` expectation `{ where: { taskId: 't1' } }` with `{ where: { taskId: 't1', kind: { in: ['REMINDER', 'OVERDUE'] } } }`.

- [ ] **Step 10: The single-source scan covers the new table**

In `server/src/tasks/task-write.single-source.spec.ts` change the `WRITE` regex group `task(?:Participant|Step|Event|Outbox)?` to `task(?:Participant|Step|Event|Outbox|TelegramMessage)?`, and the second test's title to `'no other module writes a Task, TaskParticipant, TaskStep, TaskEvent, TaskOutbox or TaskTelegramMessage row'`.

- [ ] **Step 11: Run the gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-quiet-hours.ts src/tasks/task-quiet-hours.spec.ts src/tasks/task-outbox.service.ts src/tasks/task-outbox.service.spec.ts src/tasks/lesson-task.ts src/tasks/task-user-lifecycle.listener.ts src/tasks/task-user-lifecycle.listener.spec.ts src/tasks/task-write.single-source.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks
npm run typecheck
```

Expected: all PASS; `lesson-task.spec.ts` still sees exactly 4 INAPP rows.

- [ ] **Step 12: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/prisma/schema.prisma server/prisma/migrations/20261010190000_task_telegram/migration.sql server/src/tasks/task-quiet-hours.ts server/src/tasks/task-quiet-hours.spec.ts server/src/tasks/task-outbox.service.ts server/src/tasks/task-outbox.service.spec.ts server/src/tasks/lesson-task.ts server/src/tasks/task-user-lifecycle.listener.ts server/src/tasks/task-user-lifecycle.listener.spec.ts server/src/tasks/task-write.single-source.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): Telegram outbox rows with night quiet, task message table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `TasksService` records where an action came from; `task.assigned` says when a task is new

**Files:**
- Modify: `server/src/tasks/tasks.service.ts` (`TaskActor`, `create`, `changeStatus`, `review`, `updateStep`, `addComment`)
- Modify: `server/src/tasks/task-status-writes.ts` (`changeStatusTx`, `reviewTx`)
- Modify: `server/src/tasks/task-step-writes.ts` (`updateStepTx`)
- Modify: `server/src/tasks/task-events.ts` (`TaskAssignedPayload`)
- Test: `server/src/tasks/tasks.service.spec.ts`

**Interfaces:**
- Produces: `TaskActor.via?: 'WEB' | 'TELEGRAM'` (unset = `WEB`); `changeStatusTx(tx, ctx, to, userId, via: TaskEventVia = 'WEB')`; `reviewTx(tx, ctx, action, reason, userId, via: TaskEventVia = 'WEB')`; `updateStepTx(tx, ctx, stepId, patch, userId, via: TaskEventVia = 'WEB')`; `TaskAssignedPayload.created?: boolean` (true only from `TasksService.create`).

- [ ] **Step 1: Write the failing tests**

Append inside `describe('TasksService writes', …)` in `server/src/tasks/tasks.service.spec.ts`:

```ts
  describe('an action from Telegram is logged as such', () => {
    const tg = () => ({ ...assigneeActor(), via: 'TELEGRAM' as const });

    it('status change', async () => {
      await service.changeStatus('t1', 'IN_PROGRESS', tg());
      expect(prisma.taskEvent.create.mock.calls[0][0].data.via).toBe('TELEGRAM');
    });

    it('comment', async () => {
      await service.addComment('t1', 'hi', tg());
      expect(prisma.taskEvent.create.mock.calls[0][0].data.via).toBe('TELEGRAM');
    });

    it('step tick', async () => {
      await service.updateStep('t1', 's1', { done: true }, tg());
      expect(prisma.taskEvent.create.mock.calls[0][0].data.via).toBe('TELEGRAM');
    });

    it('return with a reason', async () => {
      prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
      await service.review('t1', 'RETURN', 'Doska artilmagan', {
        ...authorActor(),
        via: 'TELEGRAM',
      });
      expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({
        type: 'RETURN',
        via: 'TELEGRAM',
      });
    });

    it('the website stays WEB', async () => {
      await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
      expect(prisma.taskEvent.create.mock.calls[0][0].data.via).toBe('WEB');
    });
  });
```

Append inside `describe('TasksService.create', …)`:

```ts
  it('marks task.assigned as a new task (Telegram says «Yangi topshiriq»)', async () => {
    await service.create({ title: 'X', assigneeIds: [40] }, actor());
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ created: true, userIds: [40] }),
    );
  });
```

Append inside `describe('TasksService writes', …)`:

```ts
  it('setParticipants: an added assignee is not a new task', async () => {
    // The same setup as «setParticipants emits assigned for added and unassigned for removed».
    prisma.user.findMany.mockResolvedValue([{ ...TEACHER, id: 41 }]);
    await service.setParticipants('t1', [41], [], authorActor());
    const assigned = emitter.emit.mock.calls.find(
      ([name]) => name === TASK_EVENTS.ASSIGNED,
    );
    expect(assigned?.[1]).toMatchObject({ userIds: [41] });
    expect(assigned?.[1].created).toBeUndefined();
  });
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/tasks.service.spec.ts`
Expected: FAIL — `via` is `'WEB'`, `created` is missing (and `via` is not a key of `TaskActor`).

- [ ] **Step 2: Implement**

`task-events.ts`:

```ts
export interface TaskAssignedPayload {
  task: TaskEventTask;
  actorId: number | null;
  userIds: number[];
  /** A brand-new task, not someone added to an existing one (Telegram wording). */
  created?: boolean;
}
```

`tasks.service.ts`:
- `TaskActor` gets, as its last member:
  ```ts
  /** Where the action came from; the task's history records it. Unset = WEB. */
  via?: 'WEB' | 'TELEGRAM';
  ```
- In `create`, both `this.emitter.emit(TASK_EVENTS.ASSIGNED, { … })` payloads get `created: true,` after `userIds`.
- `changeStatus`: `changeStatusTx(tx, ctx, to, actor.userId, actor.via)`.
- `review`: `reviewTx(tx, ctx, action, trimmed, actor.userId, actor.via)`.
- `updateStep`: `updateStepTx(tx, ctx, stepId, { title, done: patch.done }, actor.userId, actor.via)`.
- `addComment`: `via: actor.via ?? 'WEB',`.

`task-status-writes.ts`: `import type { Prisma, TaskEventVia, TaskStatus } from '@prisma/client';`; `changeStatusTx` and `reviewTx` get a last parameter `via: TaskEventVia = 'WEB'`, and their `tx.taskEvent.create` use `via,` instead of `via: 'WEB',`. `cancelTx` is unchanged (no Telegram cancel).

`task-step-writes.ts`: `import type { Prisma, TaskEventVia } from '@prisma/client';`; `updateStepTx` gets a last parameter `via: TaskEventVia = 'WEB'` and both of its `tx.taskEvent.create` calls use `via,`.

- [ ] **Step 3: Run the gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/tasks.service.ts src/tasks/task-status-writes.ts src/tasks/task-step-writes.ts src/tasks/task-events.ts src/tasks/tasks.service.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/tasks.service.ts server/src/tasks/task-status-writes.ts server/src/tasks/task-step-writes.ts server/src/tasks/task-events.ts server/src/tasks/tasks.service.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): log the TELEGRAM source and flag new tasks in task.assigned" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One notice list for the bell and Telegram

**Files:**
- Modify: `server/src/tasks/task-notify-plan.ts` (whole file below)
- Modify: `server/src/tasks/task-notify.listener.ts` (use `noticeUserIds`, delete `extraIds`)
- Test: `server/src/tasks/task-notify-plan.spec.ts`

**Interfaces:**
- Consumes: `TaskAssignedPayload.created` (Task 2).
- Produces (`task-notify-plan.ts`):
  ```ts
  export type TgNotice =
    | { kind: 'ASSIGNED' }
    | { kind: 'ADDED'; by: string }
    | { kind: 'MOVED'; from: string }
    | { kind: 'REMOVED'; by: string }
    | { kind: 'REVIEW'; by: string }
    | { kind: 'ACCEPTED'; by: string }
    | { kind: 'RETURNED'; by: string; reason: string }
    | { kind: 'COMMENT'; by: string; text: string }
    | { kind: 'DONE'; by: string }
    | { kind: 'CANCELLED'; by: string }
    | { kind: 'REMINDER' }
    | { kind: 'OVERDUE' }
    | { kind: 'CARD'; headline?: string };
  export interface Notice { userId; type; title; message; actionRequired; telegram: TgNotice | null }
  export function planNotices(event: string, payload: unknown, names: ReadonlyMap<number, string>): Notice[];
  export function noticeUserIds(payload: { task: TaskEventTask }): number[];
  ```

- [ ] **Step 1: Write the failing tests**

In `server/src/tasks/task-notify-plan.spec.ts`:

1. Import `noticeUserIds` too: `import { noticeUserIds, planNotices } from './task-notify-plan';`.
2. Replace the `it.each(['IN_REVIEW', 'DONE'] as const)(…)` block with:

```ts
  it('status changed to IN_REVIEW is left to the review notice', () => {
    expect(
      planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 40, from: 'IN_PROGRESS', to: 'IN_REVIEW' },
        names,
      ),
    ).toEqual([]);
  });

  it('a self-task closed by its author → its watchers hear «Bajarildi»', () => {
    const self: TaskEventTask = {
      ...task,
      participants: [
        { userId: 30, role: 'ASSIGNEE' },
        { userId: 50, role: 'WATCHER' },
      ],
    };
    const n = planNotices(
      TASK_EVENTS.STATUS_CHANGED,
      { task: self, actorId: 30, from: 'IN_PROGRESS', to: 'DONE' },
      names,
    );
    expect(n).toEqual([
      expect.objectContaining({
        userId: 50,
        title: 'Bajarildi',
        actionRequired: false,
        telegram: { kind: 'DONE', by: 'Soliyev A.' },
      }),
    ]);
  });
```

3. Append a new describe:

```ts
describe('planNotices: the Telegram leg (spec §6.1)', () => {
  const tgOf = (n: ReturnType<typeof planNotices>) =>
    n.map((x) => [x.userId, x.telegram]);

  it('a new task → assignees «Yangi topshiriq», watchers nothing', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.ASSIGNED,
          { task, actorId: 30, userIds: [40, 41, 50], created: true },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'ASSIGNED' }],
      [41, { kind: 'ASSIGNED' }],
      [50, null],
    ]);
  });

  it('someone added later → «Siz topshiriqqa qo\'shildingiz» with who added', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.ASSIGNED,
          { task, actorId: 30, userIds: [41] },
          names,
        ),
      ),
    ).toEqual([[41, { kind: 'ADDED', by: 'Soliyev A.' }]]);
  });

  it('moved, removed, review', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REASSIGNED,
          { task, fromUserId: 41, toUserIds: [40] },
          names,
        ),
      ),
    ).toEqual([[40, { kind: 'MOVED', from: 'Azizova M.' }]]);
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.UNASSIGNED,
          { task, actorId: 30, userIds: [41] },
          names,
        ),
      ),
    ).toEqual([[41, { kind: 'REMOVED', by: 'Soliyev A.' }]]);
    expect(
      tgOf(planNotices(TASK_EVENTS.REVIEW_REQUESTED, { task, actorId: 40 }, names)),
    ).toEqual([[30, { kind: 'REVIEW', by: 'Rahimov A.' }]]);
  });

  it('accepted → assignees «Qabul qilindi», watchers «Bajarildi»; returned → the reason', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REVIEWED,
          { task, actorId: 30, accepted: true, reason: null },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'ACCEPTED', by: 'Soliyev A.' }],
      [41, { kind: 'ACCEPTED', by: 'Soliyev A.' }],
      [50, { kind: 'DONE', by: 'Soliyev A.' }],
    ]);
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.REVIEWED,
          { task, actorId: 30, accepted: false, reason: 'Doska artilmagan' },
          names,
        ),
      ),
    ).toEqual([
      [40, { kind: 'RETURNED', by: 'Soliyev A.', reason: 'Doska artilmagan' }],
      [41, { kind: 'RETURNED', by: 'Soliyev A.', reason: 'Doska artilmagan' }],
    ]);
  });

  it('a comment reaches author and assignees but not watchers', () => {
    expect(
      tgOf(
        planNotices(
          TASK_EVENTS.COMMENTED,
          { task, actorId: 40, text: 'Narx 450 000 qoldimi?' },
          names,
        ),
      ),
    ).toEqual([
      [30, { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx 450 000 qoldimi?' }],
      [41, { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx 450 000 qoldimi?' }],
      [50, null],
    ]);
  });

  it('cancelled → only watchers on Telegram (the bell still tells assignees)', () => {
    expect(
      tgOf(
        planNotices(TASK_EVENTS.CANCELLED, { task, actorId: 30, reason: null }, names),
      ),
    ).toEqual([
      [40, null],
      [41, null],
      [50, { kind: 'CANCELLED', by: 'Soliyev A.' }],
    ]);
  });

  it('status to IN_PROGRESS and due changes stay on the bell', () => {
    for (const n of [
      ...planNotices(
        TASK_EVENTS.STATUS_CHANGED,
        { task, actorId: 40, from: 'NEW', to: 'IN_PROGRESS' },
        names,
      ),
      ...planNotices(TASK_EVENTS.DUE_CHANGED, { task, actorId: 30 }, names),
    ]) {
      expect(n.telegram).toBeNull();
    }
  });

  it("«Dars bo'ldimi?» never goes to Telegram, the bell is kept", () => {
    const lesson: TaskEventTask = { ...task, kind: 'LESSON_QUESTION', authorId: null };
    const n = planNotices(
      TASK_EVENTS.REASSIGNED,
      { task: lesson, fromUserId: 41, toUserIds: [40] },
      names,
    );
    expect(n).toHaveLength(1);
    expect(n[0].telegram).toBeNull();
  });

  it('nobody is ever told about what they did themselves', () => {
    const cases: [string, unknown][] = [
      [TASK_EVENTS.ASSIGNED, { task, actorId: 40, userIds: [40, 41], created: true }],
      [TASK_EVENTS.UNASSIGNED, { task, actorId: 41, userIds: [41] }],
      [TASK_EVENTS.REVIEW_REQUESTED, { task: { ...task, authorId: 40 }, actorId: 40 }],
      [TASK_EVENTS.REVIEWED, { task, actorId: 40, accepted: true, reason: null }],
      [TASK_EVENTS.STATUS_CHANGED, { task, actorId: 50, from: 'IN_PROGRESS', to: 'DONE' }],
      [TASK_EVENTS.COMMENTED, { task, actorId: 50, text: 'x' }],
      [TASK_EVENTS.CANCELLED, { task, actorId: 50, reason: null }],
      [TASK_EVENTS.DUE_CHANGED, { task, actorId: 40 }],
    ];
    for (const [event, payload] of cases) {
      const actor = (payload as { actorId: number }).actorId;
      expect(planNotices(event, payload, names).map((n) => n.userId)).not.toContain(actor);
    }
  });

  it('noticeUserIds names author, participants, actor and moved people once', () => {
    expect(
      noticeUserIds({ task, actorId: 99, userIds: [41], toUserIds: [60], fromUserId: 61 } as any).sort(),
    ).toEqual([30, 40, 41, 50, 60, 61, 99]);
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/task-notify-plan.spec.ts`
Expected: FAIL — `noticeUserIds` not exported, `telegram` undefined.

- [ ] **Step 2: Rewrite `task-notify-plan.ts`**

Replace the whole file with:

```ts
import type { NotificationType } from '@prisma/client';
import { TASHKENT_OFFSET_MS } from '../common/date/tashkent';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskCancelledPayload,
  type TaskCommentedPayload,
  type TaskDueChangedPayload,
  type TaskEventTask,
  type TaskReassignedPayload,
  type TaskReviewRequestedPayload,
  type TaskReviewedPayload,
  type TaskStatusChangedPayload,
  type TaskUnassignedPayload,
} from './task-events';

/**
 * The Telegram message one person gets about an event (spec 2026-10-07 §6.1):
 * the kind picks the first line, `by` / `from` / `text` / `reason` the line
 * under the title. Names are resolved when the event happens, so a notice
 * held for the morning still says who did it. REMINDER, OVERDUE and CARD are
 * not planned from events: the outbox and the bot's «Topshiriqlarim» use them.
 */
export type TgNotice =
  | { kind: 'ASSIGNED' }
  | { kind: 'ADDED'; by: string }
  | { kind: 'MOVED'; from: string }
  | { kind: 'REMOVED'; by: string }
  | { kind: 'REVIEW'; by: string }
  | { kind: 'ACCEPTED'; by: string }
  | { kind: 'RETURNED'; by: string; reason: string }
  | { kind: 'COMMENT'; by: string; text: string }
  | { kind: 'DONE'; by: string }
  | { kind: 'CANCELLED'; by: string }
  | { kind: 'REMINDER' }
  | { kind: 'OVERDUE' }
  | { kind: 'CARD'; headline?: string };

export interface Notice {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionRequired: boolean;
  /** This person's Telegram message; null = the bell only. */
  telegram: TgNotice | null;
}

type Names = ReadonlyMap<number, string>;
type TgFor = (userId: number) => TgNotice | null;
const bellOnly: TgFor = () => null;

const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '…' : s);
const who = (names: Names, id: number | null) =>
  id === null ? 'Tizim' : (names.get(id) ?? "Noma'lum");
const assignees = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
const watchers = (t: TaskEventTask) =>
  t.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
/** Nobody is told about what they just did themselves. */
const notActor = (ids: number[], actorId: number | null) =>
  ids.filter((u) => u !== actorId);
const pad2 = (n: number) => String(n).padStart(2, '0');
/** `dd.MM, HH:mm` on the Tashkent clock. */
const tashkentStamp = (d: Date) => {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad2(t.getUTCDate())}.${pad2(t.getUTCMonth() + 1)}, ${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
};
const everyone = (t: TaskEventTask) => [
  ...new Set([
    ...(t.authorId !== null ? [t.authorId] : []),
    ...t.participants.map((p) => p.userId),
  ]),
];

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Yangi',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilindi',
};

/**
 * One place decides who hears what, on both channels (spec §9.3): the bell
 * listener reads `title` / `message`, the Telegram listener reads `telegram`.
 */
export function planNotices(
  event: string,
  payload: unknown,
  names: Names,
): Notice[] {
  const notices = planFor(event, payload, names);
  // «Dars bo'ldimi?» never goes to Telegram: the lesson-end message covers it.
  const kind = (payload as { task?: TaskEventTask }).task?.kind;
  return kind === 'LESSON_QUESTION'
    ? notices.map((n) => ({ ...n, telegram: null }))
    : notices;
}

/** Author, participants, the actor and the people the payload moves — once each. */
export function noticeUserIds(payload: { task: TaskEventTask }): number[] {
  const x = payload as {
    task: TaskEventTask;
    actorId?: number | null;
    userIds?: number[];
    toUserIds?: number[];
    fromUserId?: number;
  };
  return [
    ...new Set([
      ...(x.task.authorId !== null ? [x.task.authorId] : []),
      ...x.task.participants.map((p) => p.userId),
      // The actor may be neither author nor participant (a CEO cancelling).
      ...(typeof x.actorId === 'number' ? [x.actorId] : []),
      ...(x.userIds ?? []),
      ...(x.toUserIds ?? []),
      ...(x.fromUserId !== undefined ? [x.fromUserId] : []),
    ]),
  ];
}

function planFor(event: string, payload: unknown, names: Names): Notice[] {
  const mk = (
    userIds: number[],
    type: NotificationType,
    title: string,
    message: string,
    actionRequired: boolean,
    telegram: TgFor = bellOnly,
  ): Notice[] =>
    [...new Set(userIds)].map((userId) => ({
      userId,
      type,
      title,
      message,
      actionRequired,
      telegram: telegram(userId),
    }));

  switch (event) {
    case TASK_EVENTS.ASSIGNED: {
      const p = payload as TaskAssignedPayload;
      const added = notActor(p.userIds, p.actorId);
      const watching = new Set(watchers(p.task));
      const tg: TgNotice = p.created
        ? { kind: 'ASSIGNED' }
        : { kind: 'ADDED', by: who(names, p.actorId) };
      return [
        ...mk(
          added.filter((u) => !watching.has(u)),
          'TASK_ASSIGNED',
          'Yangi topshiriq',
          `${who(names, p.actorId)} sizga topshiriq berdi: «${clip(p.task.title)}»`,
          true,
          () => tg,
        ),
        // Watchers hear only «Bajarildi» and «Bekor qilindi» on Telegram.
        ...mk(
          added.filter((u) => watching.has(u)),
          'TASK_ASSIGNED',
          'Kuzatuvchi qilindingiz',
          `${who(names, p.actorId)} sizni kuzatuvchi qildi: «${clip(p.task.title)}»`,
          false,
        ),
      ];
    }
    case TASK_EVENTS.REASSIGNED: {
      const p = payload as TaskReassignedPayload;
      const from = who(names, p.fromUserId);
      return mk(
        p.toUserIds,
        'TASK_ASSIGNED',
        "Topshiriq sizga o'tdi",
        `${from} ishdan ketgani uchun topshiriq sizga o'tdi: «${clip(p.task.title)}»`,
        true,
        () => ({ kind: 'MOVED', from }),
      );
    }
    case TASK_EVENTS.UNASSIGNED: {
      const p = payload as TaskUnassignedPayload;
      const by = who(names, p.actorId);
      return mk(
        notActor(p.userIds, p.actorId),
        'TASK_UPDATED',
        'Topshiriqdan olib tashlandingiz',
        `${by}: «${clip(p.task.title)}»`,
        false,
        () => ({ kind: 'REMOVED', by }),
      );
    }
    case TASK_EVENTS.REVIEW_REQUESTED: {
      const p = payload as TaskReviewRequestedPayload;
      if (p.task.authorId === null || p.task.authorId === p.actorId) return [];
      const by = who(names, p.actorId);
      return mk(
        [p.task.authorId],
        'TASK_REVIEW',
        'Tekshiruvga keldi',
        `${by} bajardi: «${clip(p.task.title)}»`,
        true,
        () => ({ kind: 'REVIEW', by }),
      );
    }
    case TASK_EVENTS.REVIEWED: {
      const p = payload as TaskReviewedPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return p.accepted
        ? mk(
            notActor([...assignees(p.task), ...watchers(p.task)], p.actorId),
            'TASK_STATUS_CHANGED',
            'Qabul qilindi',
            `${by} qabul qildi: «${clip(p.task.title)}»`,
            false,
            (u) =>
              watching.has(u) ? { kind: 'DONE', by } : { kind: 'ACCEPTED', by },
          )
        : mk(
            notActor(assignees(p.task), p.actorId),
            'TASK_STATUS_CHANGED',
            'Topshiriq qaytarildi',
            `${by}: «${clip(p.reason ?? '', 80)}» — ${clip(p.task.title, 60)}`,
            true,
            () => ({ kind: 'RETURNED', by, reason: clip(p.reason ?? '', 300) }),
          );
    }
    case TASK_EVENTS.STATUS_CHANGED: {
      const p = payload as TaskStatusChangedPayload;
      // Only a self-task reaches DONE this way (its author is its only
      // assignee), so the watchers are the ones left to tell.
      if (p.to === 'DONE') {
        const by = who(names, p.actorId);
        return mk(
          notActor(watchers(p.task), p.actorId),
          'TASK_STATUS_CHANGED',
          'Bajarildi',
          `${by} bajardi: «${clip(p.task.title)}»`,
          false,
          () => ({ kind: 'DONE', by }),
        );
      }
      if (
        p.task.authorId === null ||
        p.task.authorId === p.actorId ||
        p.to === 'IN_REVIEW'
      )
        return [];
      return mk(
        [p.task.authorId],
        'TASK_STATUS_CHANGED',
        'Topshiriq holati',
        `${who(names, p.actorId)}: ${STATUS_LABEL[p.to]} — «${clip(p.task.title, 60)}»`,
        false,
      );
    }
    case TASK_EVENTS.COMMENTED: {
      const p = payload as TaskCommentedPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return mk(
        everyone(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        'Yangi izoh',
        `${by}: «${clip(p.text, 80)}» — ${clip(p.task.title, 50)}`,
        false,
        (u) =>
          watching.has(u)
            ? null
            : { kind: 'COMMENT', by, text: clip(p.text, 300) },
      );
    }
    case TASK_EVENTS.CANCELLED: {
      const p = payload as TaskCancelledPayload;
      const by = who(names, p.actorId);
      const watching = new Set(watchers(p.task));
      return mk(
        [...assignees(p.task), ...watchers(p.task)].filter(
          (u) => u !== p.actorId,
        ),
        'TASK_DELETED',
        'Bekor qilindi',
        `${by} bekor qildi: «${clip(p.task.title)}»`,
        false,
        (u) => (watching.has(u) ? { kind: 'CANCELLED', by } : null),
      );
    }
    case TASK_EVENTS.DUE_CHANGED: {
      const p = payload as TaskDueChangedPayload;
      return mk(
        assignees(p.task).filter((u) => u !== p.actorId),
        'TASK_UPDATED',
        "Muddat o'zgardi",
        `«${clip(p.task.title)}» — ${p.task.dueAt ? `yangi muddat: ${tashkentStamp(p.task.dueAt)}` : 'muddat olib tashlandi'}`,
        false,
      );
    }
    default:
      return [];
  }
}
```

The bell texts and recipients are byte-for-byte the old ones except the new self-task DONE case.

- [ ] **Step 3: The bell listener uses the shared id list**

In `server/src/tasks/task-notify.listener.ts`: `import { noticeUserIds, planNotices } from './task-notify-plan';`; replace the `const ids = [ …new Set([… ...extraIds(payload)]) ];` statement with `const ids = noticeUserIds(payload);`; delete the `extraIds` function at the bottom of the file. Update the class comment «Telegram joins in phase 2.» to «Telegram is `telegram/task-telegram.listener.ts`, from the same plan.».

- [ ] **Step 4: Run the gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-notify-plan.ts src/tasks/task-notify-plan.spec.ts src/tasks/task-notify.listener.ts
npx eslint src/tasks --quiet
npx jest src/tasks src/notifications
npm run typecheck
```

Expected: PASS (`task-notify.listener.spec.ts` and the phase-5 resolver specs are unchanged and green).

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-notify-plan.ts server/src/tasks/task-notify-plan.spec.ts server/src/tasks/task-notify.listener.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): plan the Telegram notice next to the bell notice" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Message texts, buttons and callback data (pure)

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-text.ts`
- Test: `server/src/tasks/telegram/task-telegram-text.spec.ts`

**Interfaces:**
- Consumes: `TgNotice` (Task 3), `OPEN_STATUSES` (`../task-transitions`).
- Produces:
  ```ts
  export interface TgTaskView { id: string; companyId: number; kind: TaskKind; title: string; status: TaskStatus; priority: TaskPriority; dueAt: Date | null; requiresPhoto: boolean; authorId: number | null; authorName: string | null; entityLabel: string | null; participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER'; name: string }[]; steps: { id: string; title: string; done: boolean }[] }
  export type TgButtons = InlineKeyboardButton[][];
  export interface TgMessage { text: string; buttons: TgButtons }
  export interface TgListItem { id: string; title: string; dueAt: Date | null }
  export type TkAction = 'start' | 'done' | 'accept' | 'return' | 'steps' | 'back' | 'show' | 'step' | 'list';
  export const NOT_YOURS, SEVERAL_ACCOUNTS, TEXT_ONLY, ADDED_TO_TASK, RETURN_PROMPT, RETURN_PLACEHOLDER, NOT_IN_REVIEW, STEP_GONE, TRY_LATER: string;
  export function returnedReply(assigneeNames: string[]): string;
  export function esc(s: string): string;
  export function shortName(firstName: string, lastName: string): string;
  export function dueLabel(dueAt: Date, now: Date): string;
  export function isSelfTask(v: TgTaskView, userId: number): boolean;
  export function tkData(action: Exclude<TkAction, 'list'>, id: string): string;
  export function parseTk(data: string): { action: TkAction; id: string } | null;
  export function keptHeadline(messageText: string | undefined, title: string): string | undefined;
  export function renderTaskMessage(view: TgTaskView, notice: TgNotice, viewerId: number, opts: { now: Date; openUrl?: string }): TgMessage;
  export function renderStepsMessage(view: TgTaskView): TgMessage;
  export function renderMyTasks(items: TgListItem[], total: number, now: Date): TgMessage;
  export function messageExtra(buttons: TgButtons): { parse_mode: 'HTML'; reply_markup?: { inline_keyboard: TgButtons } };
  export function editExtra(buttons: TgButtons): { parse_mode: 'HTML'; reply_markup: { inline_keyboard: TgButtons } };
  ```

- [ ] **Step 1: Write the failing spec**

Create `server/src/tasks/telegram/task-telegram-text.spec.ts`:

```ts
import {
  dueLabel,
  isSelfTask,
  keptHeadline,
  parseTk,
  renderMyTasks,
  renderStepsMessage,
  renderTaskMessage,
  returnedReply,
  shortName,
  tkData,
  type TgMessage,
  type TgTaskView,
} from './task-telegram-text';

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const OPEN = `https://admin.dafzentrum.uz/tasks?task=${TASK}`;
const NOW = new Date('2026-10-07T05:00:00.000Z'); // 07.10 10:00 Tashkent

const steps = [
  'Matn qoralamasi',
  'Narxlarni tekshirish',
  'Dizaynerga yuborish',
  'Dizaynni tasdiqlatish',
  'Chop etishga berish',
].map((title, i) => ({ id: `step-${i + 1}`, title, done: false }));

const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr reklama banneri uchun matn',
  status: 'NEW',
  priority: 'HIGH',
  dueAt: new Date('2026-10-09T13:00:00.000Z'), // 09.10 18:00
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: 'A1-3 guruh',
  participants: [
    { userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' },
    { userId: 50, role: 'WATCHER', name: 'Karimov B.' },
  ],
  steps,
  ...over,
});
const labels = (m: TgMessage) => m.buttons.map((r) => r.map((b) => b.text));
const data = (m: TgMessage) =>
  m.buttons.flat().map((b) => ('callback_data' in b ? b.callback_data : 'url' in b ? b.url : ''));

describe('renderTaskMessage (mockup s14)', () => {
  it('#1 a new task to the assignee', () => {
    const m = renderTaskMessage(view(), { kind: 'ASSIGNED' }, 40, { now: NOW, openUrl: OPEN });
    expect(m.text).toBe(
      [
        '<b>Yangi topshiriq · Yuqori</b>',
        'Oktabr reklama banneri uchun matn',
        'Bergan: Soliyev A.',
        'Muddat: 09.10, 18:00',
        "Bog'liq: A1-3 guruh",
        'Kichik qadamlar: 0/5',
      ].join('\n'),
    );
    expect(labels(m)).toEqual([['Boshladim', 'Bajardim'], ['Qadamlar'], ['Ochish']]);
    expect(data(m)).toEqual([
      `tk:start:${TASK}`,
      `tk:done:${TASK}`,
      `tk:steps:${TASK}`,
      OPEN,
    ]);
  });

  it('#1 after «Boshladim» the same headline, «Holat: Jarayonda», no «Boshladim»', () => {
    const m = renderTaskMessage(
      view({ status: 'IN_PROGRESS' }),
      { kind: 'CARD', headline: 'Yangi topshiriq · Yuqori' },
      40,
      { now: NOW, openUrl: OPEN },
    );
    expect(m.text.split('\n')[0]).toBe('<b>Yangi topshiriq · Yuqori</b>');
    expect(m.text).toContain('Holat: Jarayonda');
    expect(labels(m)).toEqual([['Bajardim'], ['Qadamlar'], ['Ochish']]);
  });

  it('#2 a task confirmed with a photo: «Boshladim» only, and the photo line', () => {
    const m = renderTaskMessage(view({ requiresPhoto: true, steps: [] }), { kind: 'ASSIGNED' }, 40, { now: NOW, openUrl: OPEN });
    expect(labels(m)).toEqual([['Boshladim'], ['Ochish']]);
    expect(m.text).toContain("Rasm bilan tasdiqlanadi: rasm saytda qo'shiladi.");
    const started = renderTaskMessage(view({ requiresPhoto: true, steps: [], status: 'IN_PROGRESS' }), { kind: 'CARD' }, 40, { now: NOW, openUrl: OPEN });
    expect(labels(started)).toEqual([['Ochish']]);
  });

  it('#3 review to the author: who did it, «Qabul qilish» · «Qaytarish»', () => {
    const m = renderTaskMessage(view({ status: 'IN_REVIEW', steps: [] }), { kind: 'REVIEW', by: 'Rahimov A.' }, 30, { now: NOW, openUrl: OPEN });
    expect(m.text.split('\n').slice(0, 3)).toEqual([
      '<b>Tekshiruvga keldi</b>',
      'Oktabr reklama banneri uchun matn',
      'Ijrochi: Rahimov A.',
    ]);
    expect(m.text).not.toContain('Bergan:');
    expect(labels(m)).toEqual([['Qabul qilish', 'Qaytarish'], ['Ochish']]);
  });

  it('#4 returned: the reason, «Bajardim» again; accepted: thanks, «Ochish» only', () => {
    const back = renderTaskMessage(view({ status: 'IN_PROGRESS', steps: [] }), { kind: 'RETURNED', by: 'Azizova M.', reason: 'Doska artilmagan, qayta qiling' }, 40, { now: NOW, openUrl: OPEN });
    expect(back.text).toContain('Azizova M.: «Doska artilmagan, qayta qiling»');
    expect(back.text).toContain('Holat: Jarayonda');
    expect(labels(back)).toEqual([['Bajardim'], ['Ochish']]);
    const ok = renderTaskMessage(view({ status: 'DONE' }), { kind: 'ACCEPTED', by: 'Azizova M.' }, 40, { now: NOW, openUrl: OPEN });
    expect(ok.text).toBe('<b>Qabul qilindi</b>\nOktabr reklama banneri uchun matn\nAzizova M. qabul qildi. Rahmat.');
    expect(labels(ok)).toEqual([['Ochish']]);
  });

  it('#5 a comment', () => {
    const m = renderTaskMessage(view(), { kind: 'COMMENT', by: 'Soliyev A.', text: 'Narx 450 000 qoldimi?' }, 40, { now: NOW, openUrl: OPEN });
    expect(m.text).toBe('<b>Yangi izoh</b>\nOktabr reklama banneri uchun matn\nSoliyev A.: «Narx 450 000 qoldimi?»');
    expect(labels(m)).toEqual([['Ochish']]);
  });

  it('#6 reminder to the assignee; overdue names the assignees for the author', () => {
    const today = view({ status: 'IN_PROGRESS', steps: [], dueAt: new Date('2026-10-07T05:00:00.000Z') });
    const r = renderTaskMessage(today, { kind: 'REMINDER' }, 40, { now: new Date('2026-10-07T04:00:00.000Z'), openUrl: OPEN });
    expect(r.text.split('\n')[0]).toBe('<b>1 soatdan keyin muddat tugaydi</b>');
    expect(r.text).toContain('Muddat: bugun, 10:00');
    expect(labels(r)).toEqual([['Bajardim'], ['Ochish']]);
    const late = renderTaskMessage(today, { kind: 'OVERDUE' }, 30, { now: NOW, openUrl: OPEN });
    expect(late.text).toContain("<b>Muddati o'tdi</b>");
    expect(late.text).toContain('Ijrochi: Rahimov A.');
    expect(labels(late)).toEqual([['Ochish']]);
    expect(renderTaskMessage(today, { kind: 'OVERDUE' }, 40, { now: NOW }).text).not.toContain('Ijrochi:');
  });

  it('#7 to a watcher: done and cancelled', () => {
    const done = renderTaskMessage(view({ status: 'DONE' }), { kind: 'DONE', by: 'Soliyev A.' }, 50, { now: NOW, openUrl: OPEN });
    expect(done.text).toBe('<b>Bajarildi</b>\nOktabr reklama banneri uchun matn\nIjrochi: Rahimov A.\nQabul qildi: Soliyev A.');
    const off = renderTaskMessage(view({ status: 'CANCELLED' }), { kind: 'CANCELLED', by: 'Soliyev A.' }, 50, { now: NOW, openUrl: OPEN });
    expect(off.text).toBe('<b>Bekor qilindi</b>\nOktabr reklama banneri uchun matn\nBekor qildi: Soliyev A.');
  });

  it('#8 added later and removed (no buttons at all when removed)', () => {
    const added = renderTaskMessage(view(), { kind: 'ADDED', by: 'Soliyev A.' }, 40, { now: NOW, openUrl: OPEN });
    expect(added.text.split('\n').slice(0, 3)).toEqual([
      "<b>Siz topshiriqqa qo'shildingiz</b>",
      'Oktabr reklama banneri uchun matn',
      "Qo'shdi: Soliyev A.",
    ]);
    const removed = renderTaskMessage(view(), { kind: 'REMOVED', by: 'Soliyev A.' }, 40, { now: NOW, openUrl: OPEN });
    expect(removed.text).toBe('<b>Topshiriqdan olib tashlandingiz</b>\nOktabr reklama banneri uchun matn\nOlib tashladi: Soliyev A.');
    expect(removed.buttons).toEqual([]);
  });

  it('a system task gets «Ochish» only, and «Bergan: Tizim»', () => {
    const m = renderTaskMessage(view({ kind: 'UNCALLED_LEAD', authorId: null, authorName: null, steps: [] }), { kind: 'MOVED', from: 'Azizova M.' }, 40, { now: NOW, openUrl: OPEN });
    expect(m.text).toContain('Bergan: Tizim');
    expect(m.text).toContain('Oldingi ijrochi: Azizova M.');
    expect(labels(m)).toEqual([['Ochish']]);
  });

  it('a «Topshiriqlarim» card has the title as its headline', () => {
    const m = renderTaskMessage(view(), { kind: 'CARD' }, 40, { now: NOW });
    expect(m.text.split('\n')[0]).toBe('<b>Oktabr reklama banneri uchun matn</b>');
    expect(m.text.split('\n')[1]).toBe('Bergan: Soliyev A.');
    expect(labels(m)).toEqual([['Boshladim', 'Bajardim'], ['Qadamlar']]); // no URL → no «Ochish»
  });

  it('escapes HTML in every text that comes from people', () => {
    const m = renderTaskMessage(view({ title: 'A <b> & C' }), { kind: 'COMMENT', by: 'X <i>', text: '1 < 2 & 3' }, 40, { now: NOW });
    expect(m.text).toContain('A &lt;b&gt; &amp; C');
    expect(m.text).toContain('X &lt;i&gt;: «1 &lt; 2 &amp; 3»');
  });
});

describe('renderStepsMessage (mockup s17)', () => {
  it('lists the steps as toggles with ✓ and «Orqaga»', () => {
    const v = view({ steps: steps.map((s, i) => ({ ...s, done: i < 2 })) });
    const m = renderStepsMessage(v);
    expect(m.text).toBe('<b>Kichik qadamlar · 2/5</b>\nBosib belgilang yoki belgini olib tashlang');
    expect(labels(m)).toEqual([
      ['✓ 1. Matn qoralamasi'],
      ['✓ 2. Narxlarni tekshirish'],
      ['3. Dizaynerga yuborish'],
      ['4. Dizaynni tasdiqlatish'],
      ['5. Chop etishga berish'],
      ['Orqaga'],
    ]);
    expect(data(m)[0]).toBe('tk:step:step-1');
    expect(data(m)[5]).toBe(`tk:back:${TASK}`);
  });
});

describe('renderMyTasks (mockup s14 #10)', () => {
  it('groups overdue / today / later and numbers the buttons, 5 a row', () => {
    const now = new Date('2026-10-08T06:00:00.000Z'); // 08.10 11:00
    const m = renderMyTasks(
      [
        { id: 'a', title: 'Kassa hisobotini tekshirish', dueAt: new Date('2026-10-08T05:00:00.000Z') },
        { id: 'b', title: '2-xonani tayyorlash', dueAt: new Date('2026-10-08T08:00:00.000Z') },
        { id: 'c', title: "Qayta qo'ng'iroq: Karimova D.", dueAt: new Date('2026-10-08T13:00:00.000Z') },
        { id: 'd', title: 'Oktabr banneri matni', dueAt: new Date('2026-10-09T13:00:00.000Z') },
        { id: 'e', title: 'Shartnomani imzolatish', dueAt: new Date('2026-10-10T13:00:00.000Z') },
        { id: 'f', title: 'Muddatsiz ish', dueAt: null },
      ],
      6,
      now,
    );
    expect(m.text).toBe(
      [
        '<b>Ochiq topshiriqlar: 6</b>',
        "<b>Muddati o'tgan</b>",
        '1. Kassa hisobotini tekshirish, 10:00',
        '<b>Bugun</b>',
        '2. 2-xonani tayyorlash, 13:00',
        "3. Qayta qo'ng'iroq: Karimova D., 18:00",
        '<b>Keyinroq</b>',
        '4. Oktabr banneri matni, 09.10',
        '5. Shartnomani imzolatish, 10.10',
        '6. Muddatsiz ish',
      ].join('\n'),
    );
    expect(labels(m)).toEqual([['1', '2', '3', '4', '5'], ['6']]);
    expect(data(m)[0]).toBe('tk:show:a');
  });

  it('says how many more there are, and when there is nothing', () => {
    const now = new Date('2026-10-08T06:00:00.000Z');
    expect(renderMyTasks([{ id: 'a', title: 'X', dueAt: null }], 14, now).text).toContain('Yana 13 ta topshiriq saytda.');
    expect(renderMyTasks([], 0, now)).toEqual({ text: "Sizda ochiq topshiriq yo'q.", buttons: [] });
  });
});

describe('helpers', () => {
  it('callback data round-trips and never exceeds 64 bytes', () => {
    for (const action of ['start', 'done', 'accept', 'return', 'steps', 'back', 'show', 'step'] as const) {
      const d = tkData(action, TASK);
      expect(Buffer.byteLength(d)).toBeLessThanOrEqual(64);
      expect(parseTk(d)).toEqual({ action, id: TASK });
    }
    expect(parseTk('tk:list')).toEqual({ action: 'list', id: '' });
    expect(parseTk('tk:start')).toBeNull();
    expect(parseTk('tk:list:x')).toBeNull();
    expect(parseTk('tk:nope:x')).toBeNull();
    expect(parseTk('menu_payments')).toBeNull();
    expect(() => tkData('show', 'x'.repeat(60))).toThrow();
  });

  it('dueLabel: bugun / ertaga / dd.MM on the Tashkent clock', () => {
    const now = new Date('2026-10-07T20:30:00.000Z'); // 08.10 01:30 Tashkent
    expect(dueLabel(new Date('2026-10-08T08:00:00.000Z'), now)).toBe('bugun, 13:00');
    expect(dueLabel(new Date('2026-10-09T03:30:00.000Z'), now)).toBe('ertaga, 08:30');
    expect(dueLabel(new Date('2026-10-11T13:00:00.000Z'), now)).toBe('11.10, 18:00');
  });

  it('keptHeadline keeps a notice headline, not a title or the step list', () => {
    expect(keptHeadline('Yangi topshiriq · Yuqori\nX', 'X')).toBe('Yangi topshiriq · Yuqori');
    expect(keptHeadline('X\nMuddat: …', 'X')).toBeUndefined();
    expect(keptHeadline('Kichik qadamlar · 2/5\n…', 'X')).toBeUndefined();
    expect(keptHeadline(undefined, 'X')).toBeUndefined();
  });

  it('shortName, isSelfTask, returnedReply', () => {
    expect(shortName('Ahror', 'Soliyev')).toBe('Soliyev A.');
    expect(shortName('Ahror', '')).toBe('Ahror');
    expect(isSelfTask(view({ authorId: 40 }), 40)).toBe(true);
    expect(isSelfTask(view(), 40)).toBe(false);
    expect(returnedReply(['Rahimov A.'])).toBe('Topshiriq qaytarildi. Rahimov A. ga xabar ketdi.');
    expect(returnedReply([])).toBe('Topshiriq qaytarildi.');
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram-text.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write `task-telegram-text.ts`**

```ts
import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';
import type { TaskKind, TaskPriority, TaskStatus } from '@prisma/client';
import {
  TASHKENT_OFFSET_MS,
  addDaysToDateStr,
  tashkentDateStr,
} from '../../common/date/tashkent';
import type { TgNotice } from '../task-notify-plan';
import { OPEN_STATUSES } from '../task-transitions';

/**
 * Everything a task message needs, loaded once per send (`loadTaskView`).
 * Names are short — «Soliyev A.» — as in the mockup (s14).
 */
export interface TgTaskView {
  id: string;
  companyId: number;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  requiresPhoto: boolean;
  authorId: number | null;
  authorName: string | null;
  entityLabel: string | null;
  participants: {
    userId: number;
    role: 'ASSIGNEE' | 'WATCHER';
    name: string;
  }[];
  steps: { id: string; title: string; done: boolean }[];
}

export type TgButtons = InlineKeyboardButton[][];
export interface TgMessage {
  text: string;
  buttons: TgButtons;
}
export interface TgListItem {
  id: string;
  title: string;
  dueAt: Date | null;
}

// ---------- what the bot says (mockup s14, s17) ----------
export const NOT_YOURS = 'Bu topshiriq sizda emas';
export const SEVERAL_ACCOUNTS =
  "Bu Telegram bir nechta xodim hisobiga bog'langan. Administrator bilan bog'laning.";
export const TEXT_ONLY =
  "Hozircha faqat matnli javob qabul qilinadi. Rasm, fayl va ovozni saytda qo'shing.";
export const ADDED_TO_TASK = "Topshiriqqa qo'shildi.";
export const RETURN_PROMPT =
  'Qaytarish sababini shu xabarga javob qilib yozing.';
export const RETURN_PLACEHOLDER = 'Qaytarish sababi';
export const NOT_IN_REVIEW = 'Topshiriq tekshiruvda emas';
export const STEP_GONE = 'Qadam topilmadi';
export const TRY_LATER = "Xatolik yuz berdi. Keyinroq urinib ko'ring.";
const PHOTO_LINE = "Rasm bilan tasdiqlanadi: rasm saytda qo'shiladi.";
const EMPTY_LIST = "Sizda ochiq topshiriq yo'q.";
const STEPS_HINT = 'Bosib belgilang yoki belgini olib tashlang';

export function returnedReply(assigneeNames: string[]): string {
  return assigneeNames.length
    ? `Topshiriq qaytarildi. ${assigneeNames.join(', ')} ga xabar ketdi.`
    : 'Topshiriq qaytarildi.';
}

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Past',
  MEDIUM: "O'rta",
  HIGH: 'Yuqori',
  URGENT: 'Shoshilinch',
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: 'Yangi',
  IN_PROGRESS: 'Jarayonda',
  IN_REVIEW: 'Tekshiruvda',
  DONE: 'Bajarildi',
  CANCELLED: 'Bekor qilingan',
};

// ---------- small helpers ----------
/** Telegram HTML: only these three characters are special. */
export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const pad2 = (n: number) => String(n).padStart(2, '0');

/** «Soliyev A.» */
export function shortName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const last = lastName.trim();
  if (!last) return first;
  return first ? `${last} ${first[0]}.` : last;
}

/** `HH:mm` on the Tashkent clock. */
function hhmm(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}
/** `dd.MM` of the Tashkent day. */
function ddmm(d: Date): string {
  const [, month, day] = tashkentDateStr(d).split('-');
  return `${day}.${month}`;
}

/** «bugun, 13:00» · «ertaga, 08:30» · «09.10, 18:00» (Tashkent). */
export function dueLabel(dueAt: Date, now: Date): string {
  const day = tashkentDateStr(dueAt);
  const today = tashkentDateStr(now);
  const when =
    day === today
      ? 'bugun'
      : day === addDaysToDateStr(today, 1)
        ? 'ertaga'
        : ddmm(dueAt);
  return `${when}, ${hhmm(dueAt)}`;
}

const isOpen = (v: TgTaskView) => OPEN_STATUSES.includes(v.status);
const isAssignee = (v: TgTaskView, userId: number) =>
  v.participants.some((p) => p.userId === userId && p.role === 'ASSIGNEE');
const assigneeNames = (v: TgTaskView) =>
  v.participants
    .filter((p) => p.role === 'ASSIGNEE')
    .map((p) => p.name)
    .join(', ');

/** The author is the only assignee: «Bajardim» closes it, as on the website. */
export function isSelfTask(v: TgTaskView, userId: number): boolean {
  const a = v.participants.filter((p) => p.role === 'ASSIGNEE');
  return a.length === 1 && a[0].userId === userId && v.authorId === userId;
}

// ---------- callback data: `tk:<action>:<id>`, `tk:list` ----------
export type TkAction =
  | 'start'
  | 'done'
  | 'accept'
  | 'return'
  | 'steps'
  | 'back'
  | 'show'
  | 'step'
  | 'list';
const TK_RE =
  /^tk:(start|done|accept|return|steps|back|show|step|list)(?::([\w-]{1,48}))?$/;

/** Telegram refuses callback data over 64 bytes; ids are uuids (36). */
export function tkData(action: Exclude<TkAction, 'list'>, id: string): string {
  const data = `tk:${action}:${id}`;
  if (Buffer.byteLength(data) > 64) {
    throw new Error(`callback data over 64 bytes: ${data}`);
  }
  return data;
}

export function parseTk(data: string): { action: TkAction; id: string } | null {
  const m = TK_RE.exec(data);
  if (!m) return null;
  const action = m[1] as TkAction;
  const id = m[2] ?? '';
  if (action === 'list') return id ? null : { action, id };
  return id ? { action, id } : null;
}

/**
 * The pressed message's first line, kept when it is redrawn (mockup s14 #1:
 * «Yangi topshiriq · Yuqori» stays after «Boshladim»). A card (title first)
 * and the step list get the title instead.
 */
export function keptHeadline(
  messageText: string | undefined,
  title: string,
): string | undefined {
  const first = messageText?.split('\n')[0]?.trim();
  if (!first || first === title || first.startsWith('Kichik qadamlar')) {
    return undefined;
  }
  return first;
}

// ---------- the task message ----------
/** These carry the state buttons; the rest only «Ochish». */
const ACTION_NOTICES: ReadonlySet<TgNotice['kind']> = new Set([
  'ASSIGNED',
  'ADDED',
  'MOVED',
  'RETURNED',
  'REVIEW',
  'REMINDER',
  'CARD',
]);
/** Short messages: headline, title, one or two lines, nothing else. */
const INFO_ONLY: ReadonlySet<TgNotice['kind']> = new Set([
  'REMOVED',
  'ACCEPTED',
  'COMMENT',
  'DONE',
  'CANCELLED',
]);

function headline(view: TgTaskView, n: TgNotice): string {
  switch (n.kind) {
    case 'ASSIGNED':
      return `Yangi topshiriq · ${PRIORITY_LABEL[view.priority]}`;
    case 'ADDED':
      return "Siz topshiriqqa qo'shildingiz";
    case 'MOVED':
      return "Topshiriq sizga o'tdi";
    case 'REMOVED':
      return 'Topshiriqdan olib tashlandingiz';
    case 'REVIEW':
      return 'Tekshiruvga keldi';
    case 'ACCEPTED':
      return 'Qabul qilindi';
    case 'RETURNED':
      return 'Topshiriq qaytarildi';
    case 'COMMENT':
      return 'Yangi izoh';
    case 'DONE':
      return 'Bajarildi';
    case 'CANCELLED':
      return 'Bekor qilindi';
    case 'REMINDER':
      return '1 soatdan keyin muddat tugaydi';
    case 'OVERDUE':
      return "Muddati o'tdi";
    case 'CARD':
      return n.headline ?? view.title;
  }
}

function noticeLines(view: TgTaskView, n: TgNotice, viewerId: number): string[] {
  switch (n.kind) {
    case 'ADDED':
      return [`Qo'shdi: ${esc(n.by)}`];
    case 'MOVED':
      return [`Oldingi ijrochi: ${esc(n.from)}`];
    case 'REMOVED':
      return [`Olib tashladi: ${esc(n.by)}`];
    case 'REVIEW':
      return [`Ijrochi: ${esc(n.by)}`];
    case 'ACCEPTED':
      return [`${esc(n.by)} qabul qildi. Rahmat.`];
    case 'RETURNED':
      return [`${esc(n.by)}: «${esc(clip(n.reason, 300))}»`];
    case 'COMMENT':
      return [`${esc(n.by)}: «${esc(clip(n.text, 300))}»`];
    case 'DONE':
      return [`Ijrochi: ${esc(assigneeNames(view))}`, `Qabul qildi: ${esc(n.by)}`];
    case 'CANCELLED':
      return [`Bekor qildi: ${esc(n.by)}`];
    case 'OVERDUE':
      // The author's copy says whose it is (mockup s14 #6).
      return isAssignee(view, viewerId) || !assigneeNames(view)
        ? []
        : [`Ijrochi: ${esc(assigneeNames(view))}`];
    default:
      return [];
  }
}

function bodyLines(
  view: TgTaskView,
  n: TgNotice,
  viewerId: number,
  now: Date,
): string[] {
  const out: string[] = [];
  if (view.authorId !== viewerId && n.kind !== 'REVIEW') {
    out.push(`Bergan: ${esc(view.authorName ?? 'Tizim')}`);
  }
  if (view.dueAt) out.push(`Muddat: ${dueLabel(view.dueAt, now)}`);
  if (view.entityLabel) out.push(`Bog'liq: ${esc(view.entityLabel)}`);
  if (view.steps.length) {
    const done = view.steps.filter((s) => s.done).length;
    out.push(`Kichik qadamlar: ${done}/${view.steps.length}`);
  }
  if (view.status !== 'NEW') out.push(`Holat: ${STATUS_LABEL[view.status]}`);
  if (view.requiresPhoto && isOpen(view) && isAssignee(view, viewerId)) {
    out.push(PHOTO_LINE);
  }
  return out;
}

const cb = (text: string, data: string) => Markup.button.callback(text, data);

/** What the reader can do to the task now; the service has the last word. */
function stateButtons(view: TgTaskView, viewerId: number): TgButtons {
  // A system task is done in its own place on the website (spec §6.1).
  if (view.kind !== 'MANUAL' || !isOpen(view)) return [];
  const assignee = isAssignee(view, viewerId);
  const author = view.authorId === viewerId;
  const rows: TgButtons = [];
  if (assignee && view.status !== 'IN_REVIEW') {
    const row: InlineKeyboardButton[] = [];
    if (view.status === 'NEW') row.push(cb('Boshladim', tkData('start', view.id)));
    // A photo is added on the website only until phase 3: no «Bajardim» here.
    if (!view.requiresPhoto) row.push(cb('Bajardim', tkData('done', view.id)));
    if (row.length) rows.push(row);
  }
  if (author && view.status === 'IN_REVIEW') {
    rows.push([
      cb('Qabul qilish', tkData('accept', view.id)),
      cb('Qaytarish', tkData('return', view.id)),
    ]);
  }
  if (view.steps.length && (assignee || author) && view.status !== 'IN_REVIEW') {
    rows.push([cb('Qadamlar', tkData('steps', view.id))]);
  }
  return rows;
}

export function renderTaskMessage(
  view: TgTaskView,
  notice: TgNotice,
  viewerId: number,
  opts: { now: Date; openUrl?: string },
): TgMessage {
  const lines = [`<b>${esc(headline(view, notice))}</b>`];
  if (notice.kind !== 'CARD' || notice.headline) lines.push(esc(view.title));
  lines.push(...noticeLines(view, notice, viewerId));
  if (!INFO_ONLY.has(notice.kind)) {
    lines.push(...bodyLines(view, notice, viewerId, opts.now));
  }
  const buttons: TgButtons = [];
  if (notice.kind !== 'REMOVED') {
    if (ACTION_NOTICES.has(notice.kind)) {
      buttons.push(...stateButtons(view, viewerId));
    }
    if (opts.openUrl) buttons.push([Markup.button.url('Ochish', opts.openUrl)]);
  }
  return { text: lines.join('\n'), buttons };
}

/** «Qadamlar» pressed: the message becomes the step list (mockup s17). */
export function renderStepsMessage(view: TgTaskView): TgMessage {
  const done = view.steps.filter((s) => s.done).length;
  return {
    text: `<b>Kichik qadamlar · ${done}/${view.steps.length}</b>\n${STEPS_HINT}`,
    buttons: [
      ...view.steps.map((s, i) => [
        cb(`${s.done ? '✓ ' : ''}${i + 1}. ${clip(s.title, 48)}`, tkData('step', s.id)),
      ]),
      [cb('Orqaga', tkData('back', view.id))],
    ],
  };
}

const GROUP_TITLE = ["Muddati o'tgan", 'Bugun', 'Keyinroq'];

/**
 * «Topshiriqlarim» (mockup s14 #10). `items` come sorted by due date, the
 * undated last, so the three groups follow each other.
 */
export function renderMyTasks(
  items: TgListItem[],
  total: number,
  now: Date,
): TgMessage {
  if (items.length === 0) return { text: EMPTY_LIST, buttons: [] };
  const today = tashkentDateStr(now);
  const groupOf = (it: TgListItem) =>
    it.dueAt && it.dueAt.getTime() < now.getTime()
      ? 0
      : it.dueAt && tashkentDateStr(it.dueAt) === today
        ? 1
        : 2;
  const lines = [`<b>Ochiq topshiriqlar: ${total}</b>`];
  let last = -1;
  items.forEach((it, i) => {
    const g = groupOf(it);
    if (g !== last) {
      lines.push(`<b>${GROUP_TITLE[g]}</b>`);
      last = g;
    }
    const when = it.dueAt
      ? tashkentDateStr(it.dueAt) === today
        ? hhmm(it.dueAt)
        : ddmm(it.dueAt)
      : '';
    lines.push(`${i + 1}. ${esc(clip(it.title, 60))}${when ? `, ${when}` : ''}`);
  });
  if (total > items.length) {
    lines.push(`Yana ${total - items.length} ta topshiriq saytda.`);
  }
  const numbers = items.map((it, i) => cb(String(i + 1), tkData('show', it.id)));
  const buttons: TgButtons = [];
  for (let i = 0; i < numbers.length; i += 5) {
    buttons.push(numbers.slice(i, i + 5));
  }
  return { text: lines.join('\n'), buttons };
}

/** `sendMessage` / `reply` options: HTML, and the keyboard when there is one. */
export function messageExtra(buttons: TgButtons): {
  parse_mode: 'HTML';
  reply_markup?: { inline_keyboard: TgButtons };
} {
  return buttons.length
    ? { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }
    : { parse_mode: 'HTML' };
}

/** `editMessageText` options: the keyboard always goes, so an empty one clears the old buttons. */
export function editExtra(buttons: TgButtons): {
  parse_mode: 'HTML';
  reply_markup: { inline_keyboard: TgButtons };
} {
  return { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } };
}
```

- [ ] **Step 3: Run the spec**

Run: `npx jest src/tasks/telegram/task-telegram-text.spec.ts`
Expected: PASS. If a mockup-text test fails, fix the renderer, not the expected text.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram-text.ts src/tasks/telegram/task-telegram-text.spec.ts
npx eslint src/tasks --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram-text.ts server/src/tasks/telegram/task-telegram-text.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): render task messages, buttons and callback data for Telegram" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Who the chat is, the task view, one send

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-view.ts`, `server/src/tasks/telegram/task-telegram-view.spec.ts`
- Create: `server/src/tasks/telegram/task-telegram.sender.ts`, `server/src/tasks/telegram/task-telegram.sender.spec.ts`
- Modify: `server/src/telegram-digest/direct-send.guard.spec.ts`

**Interfaces:**
- Consumes: `TgTaskView`, `shortName`, `renderTaskMessage`, `messageExtra` (Task 4); `TgNotice` (Task 3); `staffLinkedToChatWhere`, `signInStaffWhere`, `staffPortalFor` (`common/auth/staff-telegram.ts`); `staffMiniAppUrl` (`telegram/staff/staff-cabinet.ts`); `classifyTelegramError`, `TelegramFailureKind` (`telegram-digest/telegram-send.ts`); `TelegramService.getBot()`.
- Produces (`task-telegram-view.ts`):
  ```ts
  export function loadTaskView(db: Pick<PrismaService, 'task' | 'student' | 'group' | 'lead' | 'user'>, taskId: string): Promise<TgTaskView | null>;
  export type ChatStaff = { kind: 'one'; userId: number; companyId: number; roleIds: number[] } | { kind: 'none' } | { kind: 'several' };
  export function staffOfChat(db: Pick<PrismaService, 'user'>, chatId: string): Promise<ChatStaff>;
  export function staffChatOf(db: Pick<PrismaService, 'user'>, userId: number): Promise<{ chatId: string; roleIds: number[] } | null>;
  export function taskOpenUrl(studentMiniAppUrl: string | undefined, roleIds: number[], taskId: string): string | undefined;
  ```
- Produces (`task-telegram.sender.ts`):
  ```ts
  export const TRANSIENT_RETRY_S = 60;
  export type TgSendResult = { status: 'sent'; messageId: number } | { status: 'skipped'; reason: string } | { status: 'failed'; kind: TelegramFailureKind; retryAfter: number | null; reason: string };
  export class TaskTelegramSender {
    openUrl(roleIds: number[], taskId: string): string | undefined;
    send(view: TgTaskView, userId: number, notice: TgNotice): Promise<TgSendResult>;
    record(chatId: string, messageId: number, task: { id: string; companyId: number }, userId: number, purpose: TaskTelegramPurpose): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing view spec**

Create `server/src/tasks/telegram/task-telegram-view.spec.ts`:

```ts
import { staffLinkedToChatWhere } from '../../common/auth/staff-telegram';
import {
  loadTaskView,
  staffChatOf,
  staffOfChat,
  taskOpenUrl,
} from './task-telegram-view';

const STUDENT_URL = 'https://student.dafzentrum.uz/tg';

describe('staffOfChat (spec §6.5)', () => {
  const db = (rows: unknown[]) => ({ user: { findMany: jest.fn().mockResolvedValue(rows) } });

  it('one live staff account on the chat', async () => {
    const d = db([{ id: 40, companyId: 1, roles: [{ roleId: 4 }] }]);
    await expect(staffOfChat(d as any, '700')).resolves.toEqual({
      kind: 'one',
      userId: 40,
      companyId: 1,
      roleIds: [4],
    });
    expect(d.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: staffLinkedToChatWhere('700'), take: 2 }),
    );
  });

  it('none, or two — never pick one', async () => {
    await expect(staffOfChat(db([]) as any, '700')).resolves.toEqual({ kind: 'none' });
    await expect(
      staffOfChat(db([{ id: 1, companyId: 1, roles: [] }, { id: 2, companyId: 1, roles: [] }]) as any, '700'),
    ).resolves.toEqual({ kind: 'several' });
  });
});

describe('staffChatOf', () => {
  const db = (row: unknown, owners: number) => ({
    user: {
      findFirst: jest.fn().mockResolvedValue(row),
      count: jest.fn().mockResolvedValue(owners),
    },
  });

  it('the chat of a sign-in staff account that owns it alone', async () => {
    await expect(
      staffChatOf(db({ telegramChatId: '700', roles: [{ roleId: 3 }] }, 1) as any, 40),
    ).resolves.toEqual({ chatId: '700', roleIds: [3] });
  });

  it('no chat, or a chat two live accounts share → null', async () => {
    await expect(staffChatOf(db(null, 0) as any, 40)).resolves.toBeNull();
    await expect(
      staffChatOf(db({ telegramChatId: '700', roles: [] }, 2) as any, 40),
    ).resolves.toBeNull();
  });
});

describe('taskOpenUrl', () => {
  it('admin portal for roles 1, 2, 3, 5; teacher portal for a teacher only', () => {
    expect(taskOpenUrl(STUDENT_URL, [3], 't1')).toBe('https://admin.dafzentrum.uz/tasks?task=t1');
    expect(taskOpenUrl(STUDENT_URL, [4], 't1')).toBe('https://lehrer.dafzentrum.uz/tasks?task=t1');
  });

  it('no student Mini App address, or no staff role → no link', () => {
    expect(taskOpenUrl(undefined, [3], 't1')).toBeUndefined();
    expect(taskOpenUrl('https://abc.ngrok.app/tg', [3], 't1')).toBeUndefined();
    expect(taskOpenUrl(STUDENT_URL, [6], 't1')).toBeUndefined();
  });
});

describe('loadTaskView', () => {
  const row = {
    id: 't1',
    companyId: 1,
    kind: 'MANUAL',
    title: 'Banner',
    status: 'NEW',
    priority: 'HIGH',
    dueAt: null,
    requiresPhoto: false,
    authorId: 30,
    entityType: 'Group',
    entityId: 'g1',
    author: { firstName: 'Ahror', lastName: 'Soliyev' },
    participants: [{ userId: 40, role: 'ASSIGNEE', user: { firstName: 'Aziz', lastName: 'Rahimov' } }],
    steps: [{ id: 's1', title: 'Matn', doneAt: new Date() }],
  };
  const db = (task: unknown) => ({
    task: { findUnique: jest.fn().mockResolvedValue(task) },
    group: { findUnique: jest.fn().mockResolvedValue({ name: 'A1-3' }) },
    student: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Dilnoza', lastName: 'Karimova' }) },
    lead: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Jamshid', lastName: 'Mirzayev' }) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Malika', lastName: 'Azizova' }) },
  });

  it('maps the row with short names, the link and the steps', async () => {
    await expect(loadTaskView(db(row) as any, 't1')).resolves.toEqual({
      id: 't1',
      companyId: 1,
      kind: 'MANUAL',
      title: 'Banner',
      status: 'NEW',
      priority: 'HIGH',
      dueAt: null,
      requiresPhoto: false,
      authorId: 30,
      authorName: 'Soliyev A.',
      entityLabel: 'A1-3 guruh',
      participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
      steps: [{ id: 's1', title: 'Matn', done: true }],
    });
  });

  it.each([
    ['Student', '12', 'Karimova Dilnoza'],
    ['Lead', 'l1', 'Mirzayev Jamshid (lid)'],
    ['User', '7', 'Azizova Malika'],
    ['Student', 'abc', null],
  ])('%s %s → %s', async (entityType, entityId, label) => {
    const v = await loadTaskView(db({ ...row, entityType, entityId }) as any, 't1');
    expect(v?.entityLabel).toBe(label);
  });

  it('a deleted task → null', async () => {
    await expect(loadTaskView(db(null) as any, 't1')).resolves.toBeNull();
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram-view.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write `task-telegram-view.ts`**

```ts
import {
  signInStaffWhere,
  staffLinkedToChatWhere,
  staffPortalFor,
} from '../../common/auth/staff-telegram';
import type { PrismaService } from '../../prisma/prisma.service';
import { staffMiniAppUrl } from '../../telegram/staff/staff-cabinet';
import { shortName, type TgTaskView } from './task-telegram-text';

type ViewDb = Pick<PrismaService, 'task' | 'student' | 'group' | 'lead' | 'user'>;
type UserDb = Pick<PrismaService, 'user'>;

/** The task as a Telegram message needs it; null when it is gone. */
export async function loadTaskView(
  db: ViewDb,
  taskId: string,
): Promise<TgTaskView | null> {
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      companyId: true,
      kind: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
      requiresPhoto: true,
      authorId: true,
      entityType: true,
      entityId: true,
      author: { select: { firstName: true, lastName: true } },
      participants: {
        select: {
          userId: true,
          role: true,
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      steps: {
        select: { id: true, title: true, doneAt: true },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    companyId: t.companyId,
    kind: t.kind,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt,
    requiresPhoto: t.requiresPhoto,
    authorId: t.authorId,
    authorName: t.author
      ? shortName(t.author.firstName, t.author.lastName)
      : null,
    entityLabel: await entityLabel(db, t.entityType, t.entityId),
    participants: t.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      name: shortName(p.user.firstName, p.user.lastName),
    })),
    steps: t.steps.map((s) => ({
      id: s.id,
      title: s.title,
      done: s.doneAt !== null,
    })),
  };
}

/** «Bog'liq:» — the linked student, group, lead or employee (COMMENTABLE_ENTITY_TYPES). */
async function entityLabel(
  db: ViewDb,
  type: string | null,
  id: string | null,
): Promise<string | null> {
  if (!type || !id) return null;
  const numeric = Number(id);
  switch (type) {
    case 'Group': {
      const g = await db.group.findUnique({ where: { id }, select: { name: true } });
      return g ? `${g.name} guruh` : null;
    }
    case 'Lead': {
      const l = await db.lead.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      });
      return l ? `${l.lastName} ${l.firstName} (lid)` : null;
    }
    case 'Student': {
      if (!Number.isInteger(numeric)) return null;
      const s = await db.student.findUnique({
        where: { id: numeric },
        select: { firstName: true, lastName: true },
      });
      return s ? `${s.lastName} ${s.firstName}` : null;
    }
    case 'User': {
      if (!Number.isInteger(numeric)) return null;
      const u = await db.user.findUnique({
        where: { id: numeric },
        select: { firstName: true, lastName: true },
      });
      return u ? `${u.lastName} ${u.firstName}` : null;
    }
    default:
      return null;
  }
}

export type ChatStaff =
  | { kind: 'one'; userId: number; companyId: number; roleIds: number[] }
  | { kind: 'none' }
  | { kind: 'several' };

/**
 * Who presses a button or replies (spec §6.5): the chat's live staff account,
 * by the same where-clause as the staff menu and the Mini App (ADR-0045).
 * Two live accounts on one chat fail closed — never pick one.
 */
export async function staffOfChat(db: UserDb, chatId: string): Promise<ChatStaff> {
  const rows = await db.user.findMany({
    where: staffLinkedToChatWhere(chatId),
    select: { id: true, companyId: true, roles: { select: { roleId: true } } },
    orderBy: { id: 'asc' },
    take: 2,
  });
  if (rows.length === 0) return { kind: 'none' };
  if (rows.length > 1) return { kind: 'several' };
  return {
    kind: 'one',
    userId: rows[0].id,
    companyId: rows[0].companyId,
    roleIds: rows[0].roles.map((r) => r.roleId),
  };
}

/**
 * Where a notice for this person goes, checked at send time: a sign-in staff
 * account with a linked chat that no other live staff account shares.
 */
export async function staffChatOf(
  db: UserDb,
  userId: number,
): Promise<{ chatId: string; roleIds: number[] } | null> {
  const u = await db.user.findFirst({
    where: { id: userId, ...signInStaffWhere(), telegramChatId: { not: null } },
    select: { telegramChatId: true, roles: { select: { roleId: true } } },
  });
  if (!u?.telegramChatId) return null;
  const owners = await db.user.count({
    where: staffLinkedToChatWhere(u.telegramChatId),
  });
  return owners === 1
    ? { chatId: u.telegramChatId, roleIds: u.roles.map((r) => r.roleId) }
    : null;
}

/**
 * «Ochish»: `/tasks?task=<id>` on the reader's portal (`staffPortalFor`), the
 * host taken from `TELEGRAM_MINI_APP_URL` the way the staff cabinet takes it.
 * No address (or a non-`student.` host, a local tunnel) → no button.
 */
export function taskOpenUrl(
  studentMiniAppUrl: string | undefined,
  roleIds: number[],
  taskId: string,
): string | undefined {
  const portal = staffPortalFor(roleIds);
  const cabinet = portal ? staffMiniAppUrl(studentMiniAppUrl, portal) : undefined;
  return cabinet ? `${new URL(cabinet).origin}/tasks?task=${taskId}` : undefined;
}
```

Run: `npx jest src/tasks/telegram/task-telegram-view.spec.ts` → PASS.

- [ ] **Step 3: Write the failing sender spec**

Create `server/src/tasks/telegram/task-telegram.sender.spec.ts`:

```ts
import { TaskTelegramSender } from './task-telegram.sender';
import type { TgTaskView } from './task-telegram-text';

const VIEW: TgTaskView = {
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'NEW',
  priority: 'MEDIUM',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
};

function setup(opts: {
  chat?: string | null;
  owners?: number;
  bot?: boolean;
  sendMessage?: jest.Mock;
} = {}) {
  const prisma = {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.chat === null ? null : { telegramChatId: opts.chat ?? '700', roles: [{ roleId: 4 }] },
        ),
      count: jest.fn().mockResolvedValue(opts.owners ?? 1),
    },
    taskTelegramMessage: { create: jest.fn().mockResolvedValue({}) },
  };
  const sendMessage = opts.sendMessage ?? jest.fn().mockResolvedValue({ message_id: 77 });
  const telegram = {
    getBot: () => (opts.bot === false ? undefined : { telegram: { sendMessage } }),
  };
  const config = { get: jest.fn().mockReturnValue('https://student.dafzentrum.uz/tg') };
  const sender = new TaskTelegramSender(prisma as any, telegram as any, config as any);
  return { sender, prisma, sendMessage };
}

const tgError = (error_code: number, description: string, retry_after?: number) =>
  Object.assign(new Error(description), {
    response: { error_code, description, parameters: retry_after ? { retry_after } : undefined },
  });

describe('TaskTelegramSender', () => {
  it('sends HTML with buttons and remembers the message for replies', async () => {
    const { sender, prisma, sendMessage } = setup();
    await expect(sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toEqual({
      status: 'sent',
      messageId: 77,
    });
    const [chatId, text, extra] = sendMessage.mock.calls[0];
    expect(chatId).toBe('700');
    expect(text.split('\n')[0]).toBe("<b>Yangi topshiriq · O'rta</b>");
    expect(extra.parse_mode).toBe('HTML');
    expect(extra.reply_markup.inline_keyboard.flat().map((b: any) => b.text)).toEqual([
      'Boshladim',
      'Bajardim',
      'Ochish',
    ]);
    expect(extra.reply_markup.inline_keyboard.at(-1)[0].url).toBe(
      'https://lehrer.dafzentrum.uz/tasks?task=t1',
    );
    expect(prisma.taskTelegramMessage.create).toHaveBeenCalledWith({
      data: { chatId: '700', messageId: 77, taskId: 't1', userId: 40, purpose: 'NOTICE', companyId: 1 },
    });
  });

  it('skips a person with no chat, a shared chat, or a bot that is off', async () => {
    for (const s of [setup({ chat: null }), setup({ owners: 2 }), setup({ bot: false })]) {
      const r = await s.sender.send(VIEW, 40, { kind: 'ASSIGNED' });
      expect(r.status).toBe('skipped');
      expect(s.sendMessage).not.toHaveBeenCalled();
    }
  });

  it('classifies failures: 429 with retry_after, 403 permanent, network transient', async () => {
    const limited = setup({ sendMessage: jest.fn().mockRejectedValue(tgError(429, 'Too Many Requests', 17)) });
    await expect(limited.sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toMatchObject({
      status: 'failed',
      kind: 'transient',
      retryAfter: 17,
    });
    const blocked = setup({ sendMessage: jest.fn().mockRejectedValue(tgError(403, 'Forbidden: bot was blocked by the user')) });
    await expect(blocked.sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toMatchObject({
      status: 'failed',
      kind: 'permanent',
    });
    const net = setup({ sendMessage: jest.fn().mockRejectedValue(new Error('ETIMEDOUT')) });
    await expect(net.sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toMatchObject({
      status: 'failed',
      kind: 'transient',
      retryAfter: null,
    });
    expect(net.prisma.taskTelegramMessage.create).not.toHaveBeenCalled();
  });

  it('a failed bookkeeping write never turns a sent message into a failure', async () => {
    const s = setup();
    s.prisma.taskTelegramMessage.create.mockRejectedValue(new Error('db down'));
    await expect(s.sender.send(VIEW, 40, { kind: 'ASSIGNED' })).resolves.toMatchObject({ status: 'sent' });
  });
});
```

Run: `npx jest src/tasks/telegram/task-telegram.sender.spec.ts` → FAIL (module not found).

- [ ] **Step 4: Write `task-telegram.sender.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TaskTelegramPurpose } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import {
  classifyTelegramError,
  describeError,
  type TelegramFailureKind,
} from '../../telegram-digest/telegram-send';
import type { TgNotice } from '../task-notify-plan';
import {
  messageExtra,
  renderTaskMessage,
  type TgTaskView,
} from './task-telegram-text';
import { staffChatOf, taskOpenUrl } from './task-telegram-view';

/** A transient failure with no `retry_after` is tried again after this long. */
export const TRANSIENT_RETRY_S = 60;

export type TgSendResult =
  | { status: 'sent'; messageId: number }
  | { status: 'skipped'; reason: string }
  | {
      status: 'failed';
      kind: TelegramFailureKind;
      retryAfter: number | null;
      reason: string;
    };

/**
 * The one place a task notice is sent (ADR-0078): the main bot, HTML, the
 * task's buttons, and a `TaskTelegramMessage` row so a reply finds its task.
 * It does not decide WHEN (listener, outbox) and never retries itself.
 */
@Injectable()
export class TaskTelegramSender {
  private readonly logger = new Logger(TaskTelegramSender.name);
  private readonly studentMiniAppUrl: string | undefined;

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    config: ConfigService,
  ) {
    this.studentMiniAppUrl =
      config.get<string>('TELEGRAM_MINI_APP_URL')?.trim() || undefined;
  }

  openUrl(roleIds: number[], taskId: string): string | undefined {
    return taskOpenUrl(this.studentMiniAppUrl, roleIds, taskId);
  }

  async send(
    view: TgTaskView,
    userId: number,
    notice: TgNotice,
  ): Promise<TgSendResult> {
    // No TELEGRAM_BOT_TOKEN: the bot never started.
    const client = this.telegram.getBot()?.telegram;
    if (!client) return { status: 'skipped', reason: 'bot off' };
    const chat = await staffChatOf(this.prisma, userId);
    if (!chat) return { status: 'skipped', reason: 'no chat' };
    const msg = renderTaskMessage(view, notice, userId, {
      now: new Date(),
      openUrl: this.openUrl(chat.roleIds, view.id),
    });
    let messageId: number;
    try {
      const sent = await client.sendMessage(
        chat.chatId,
        msg.text,
        messageExtra(msg.buttons),
      );
      messageId = sent.message_id;
    } catch (err) {
      const f = classifyTelegramError(err);
      return {
        status: 'failed',
        kind: f.kind,
        retryAfter: f.retryAfter,
        reason: f.description.slice(0, 500),
      };
    }
    await this.record(chat.chatId, messageId, view, userId, 'NOTICE');
    return { status: 'sent', messageId };
  }

  /** The message is out: a failed bookkeeping write is logged, never thrown (no resend). */
  async record(
    chatId: string,
    messageId: number,
    task: { id: string; companyId: number },
    userId: number,
    purpose: TaskTelegramPurpose,
  ): Promise<void> {
    try {
      await this.prisma.taskTelegramMessage.create({
        data: {
          chatId,
          messageId,
          taskId: task.id,
          userId,
          purpose,
          companyId: task.companyId,
        },
      });
    } catch (err) {
      this.logger.warn(
        `task ${task.id}: message ${messageId} sent but not recorded: ${describeError(err)}`,
      );
    }
  }
}
```

Run: `npx jest src/tasks/telegram/task-telegram.sender.spec.ts` → PASS.

- [ ] **Step 5: The direct-send guard learns the new sender and locks the digest out**

In `server/src/telegram-digest/direct-send.guard.spec.ts`:

1. Add to `ALLOWED` (after `'src/telegram/', …`):
   ```ts
  'src/tasks/telegram/', // task notices: instant, night quiet 22–08 (ADR-0078)
   ```
2. Append at the end of the file:

```ts
/**
 * ADR-0078: task notices left the 20:00 digest — the bot sends them itself
 * (`src/tasks/telegram/`). The digest still renders `TASK_*` rows already in
 * its queue, so `src/telegram-digest/` may name them; nothing else may.
 */
describe('task notices are not queued for the digest — ADR-0078', () => {
  it('nothing outside the digest names a TASK_* digest category', () => {
    const offenders = walk(join(ROOT, 'src'))
      .map((file) => ({
        path: relative(ROOT, file).split('\\').join('/'),
        source: readFileSync(file, 'utf8'),
      }))
      .filter(({ path }) => !path.startsWith('src/telegram-digest/'))
      .filter(({ source }) =>
        /TelegramDigestCategory\.TASK_|category:\s*['"`]TASK_/.test(source),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
```

Run: `npx jest src/telegram-digest/direct-send.guard.spec.ts` → PASS (the sender is under `src/tasks/telegram/`).

- [ ] **Step 6: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram-view.ts src/tasks/telegram/task-telegram-view.spec.ts src/tasks/telegram/task-telegram.sender.ts src/tasks/telegram/task-telegram.sender.spec.ts src/telegram-digest/direct-send.guard.spec.ts
npx eslint src/tasks src/telegram-digest --quiet
npx jest src/tasks src/telegram-digest
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram-view.ts server/src/tasks/telegram/task-telegram-view.spec.ts server/src/tasks/telegram/task-telegram.sender.ts server/src/tasks/telegram/task-telegram.sender.spec.ts server/src/telegram-digest/direct-send.guard.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): Telegram sender with staff identity and task view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Notices go out after the commit; night and retries go to the outbox

**Files:**
- Create: `server/src/tasks/telegram/task-telegram.listener.ts`, `server/src/tasks/telegram/task-telegram.listener.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`

**Interfaces:**
- Consumes: `planNotices`, `noticeUserIds`, `TgNotice` (Task 3); `telegramSendAfter` (Task 1); `loadTaskView` (Task 5); `TaskTelegramSender.send`, `TRANSIENT_RETRY_S` (Task 5); `shortName` (Task 4); `TASK_EVENTS`.
- Produces: `TaskTelegramListener` with `@OnEvent` for all nine `TASK_EVENTS` and `handle(event: string, payload: { task: TaskEventTask }, now?: Date): Promise<void>`; `TaskOutbox` rows `{ channel: 'TELEGRAM', kind: 'NOTICE', payload: TgNotice }`.

- [ ] **Step 1: Write the failing spec**

Create `server/src/tasks/telegram/task-telegram.listener.spec.ts`:

```ts
import { TASK_EVENTS, type TaskEventTask } from '../task-events';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramListener } from './task-telegram.listener';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
}));

const task: TaskEventTask = {
  id: 't1',
  companyId: 1,
  title: 'Banner',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status: 'NEW',
  participants: [
    { userId: 40, role: 'ASSIGNEE' },
    { userId: 50, role: 'WATCHER' },
  ],
};
const view = (priority = 'MEDIUM') => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'NEW',
  priority,
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [
    { userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' },
    { userId: 50, role: 'WATCHER', name: 'Karimov B.' },
  ],
  steps: [],
});
const DAY = new Date('2026-10-12T06:00:00.000Z'); // 11:00 Tashkent
const NIGHT = new Date('2026-10-12T17:30:00.000Z'); // 22:30 Tashkent
const MORNING = new Date('2026-10-13T03:00:00.000Z'); // 08:00 Tashkent
const assigned = { task, actorId: 30, userIds: [40], created: true };

function setup() {
  const prisma = {
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 30, firstName: 'Ahror', lastName: 'Soliyev' },
        { id: 40, firstName: 'Aziz', lastName: 'Rahimov' },
      ]),
    },
    taskOutbox: { create: jest.fn() },
  };
  const sender = { send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 1 }) };
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  return { listener: new TaskTelegramListener(prisma as any, sender as any), prisma, sender };
}

describe('TaskTelegramListener', () => {
  it('in the day: sends right away, to the plan\'s Telegram recipients only', async () => {
    const { listener, sender, prisma } = setup();
    await listener.handle(
      TASK_EVENTS.ASSIGNED,
      { ...assigned, userIds: [40, 50] } as any,
      DAY,
    );
    expect(sender.send).toHaveBeenCalledTimes(1); // 50 is a watcher
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 40, { kind: 'ASSIGNED' });
    expect(prisma.taskOutbox.create).not.toHaveBeenCalled();
  });

  it('at 22:30: nothing is sent, the notice waits for 08:00', async () => {
    const { listener, sender, prisma } = setup();
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, NIGHT);
    expect(sender.send).not.toHaveBeenCalled();
    expect(prisma.taskOutbox.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        userId: 40,
        channel: 'TELEGRAM',
        kind: 'NOTICE',
        payload: { kind: 'ASSIGNED' },
        sendAfter: MORNING,
        attempts: 0,
        lastError: null,
      },
    });
  });

  it('an URGENT task goes at night too', async () => {
    const { listener, sender } = setup();
    (loadTaskView as jest.Mock).mockResolvedValue(view('URGENT'));
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, NIGHT);
    expect(sender.send).toHaveBeenCalled();
  });

  it('a transient failure is queued for a retry; a permanent one is not', async () => {
    const { listener, sender, prisma } = setup();
    sender.send.mockResolvedValueOnce({ status: 'failed', kind: 'transient', retryAfter: 30, reason: 'Too Many Requests' });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create.mock.calls[0][0].data).toMatchObject({
      kind: 'NOTICE',
      attempts: 1,
      lastError: 'Too Many Requests',
      sendAfter: new Date(DAY.getTime() + 30_000),
    });
    sender.send.mockResolvedValueOnce({ status: 'failed', kind: 'transient', retryAfter: null, reason: 'ETIMEDOUT' });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create.mock.calls[1][0].data.sendAfter).toEqual(new Date(DAY.getTime() + 60_000));
    sender.send.mockResolvedValueOnce({ status: 'failed', kind: 'permanent', retryAfter: null, reason: 'blocked' });
    await listener.handle(TASK_EVENTS.ASSIGNED, assigned as any, DAY);
    expect(prisma.taskOutbox.create).toHaveBeenCalledTimes(2);
  });

  it("«Dars bo'ldimi?» costs not even a query", async () => {
    const { listener, prisma, sender } = setup();
    await listener.handle(
      TASK_EVENTS.REASSIGNED,
      { task: { ...task, kind: 'LESSON_QUESTION', authorId: null }, fromUserId: 41, toUserIds: [40] } as any,
      DAY,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it('names come in the short form, and the actor is not told', async () => {
    const { listener, sender } = setup();
    await listener.handle(TASK_EVENTS.COMMENTED, { task, actorId: 40, text: 'Narx?' } as any, DAY);
    expect(sender.send.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [30, { kind: 'COMMENT', by: 'Rahimov A.', text: 'Narx?' }],
    ]);
  });

  it('one failing recipient does not cost the others their message', async () => {
    const { listener, sender } = setup();
    sender.send.mockRejectedValueOnce(new Error('boom'));
    await listener.handle(
      TASK_EVENTS.REVIEWED,
      { task: { ...task, participants: [...task.participants, { userId: 41, role: 'ASSIGNEE' }] }, actorId: 30, accepted: true, reason: null } as any,
      DAY,
    );
    expect(sender.send).toHaveBeenCalledTimes(3); // 40, 41 «Qabul qilindi», 50 «Bajarildi»
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram.listener.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write `task-telegram.listener.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../telegram-digest/telegram-send';
import { TASK_EVENTS, type TaskEventTask } from '../task-events';
import {
  noticeUserIds,
  planNotices,
  type TgNotice,
} from '../task-notify-plan';
import { telegramSendAfter } from '../task-quiet-hours';
import { shortName, type TgTaskView } from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import { TRANSIENT_RETRY_S, TaskTelegramSender } from './task-telegram.sender';

/**
 * Task notices to Telegram, right after the commit (ADR-0078). Who hears what
 * comes from the same plan as the bell (`task-notify-plan.ts`). Inside the
 * night quiet, or after a transient failure, the notice is written to
 * `TaskOutbox` (`TELEGRAM`, `NOTICE`) and `TaskTelegramOutbox` sends it later.
 */
@Injectable()
export class TaskTelegramListener {
  private readonly logger = new Logger(TaskTelegramListener.name);

  constructor(
    private prisma: PrismaService,
    private sender: TaskTelegramSender,
  ) {}

  @OnEvent(TASK_EVENTS.ASSIGNED)
  onAssigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.ASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.UNASSIGNED)
  onUnassigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.UNASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  onStatus(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.STATUS_CHANGED, p);
  }
  @OnEvent(TASK_EVENTS.REVIEW_REQUESTED)
  onReview(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REVIEW_REQUESTED, p);
  }
  @OnEvent(TASK_EVENTS.REVIEWED)
  onReviewed(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REVIEWED, p);
  }
  @OnEvent(TASK_EVENTS.COMMENTED)
  onCommented(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.COMMENTED, p);
  }
  @OnEvent(TASK_EVENTS.CANCELLED)
  onCancelled(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.CANCELLED, p);
  }
  @OnEvent(TASK_EVENTS.REASSIGNED)
  onReassigned(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.REASSIGNED, p);
  }
  @OnEvent(TASK_EVENTS.DUE_CHANGED)
  onDue(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.DUE_CHANGED, p);
  }

  async handle(
    event: string,
    payload: { task: TaskEventTask },
    now = new Date(),
  ): Promise<void> {
    // «Dars bo'ldimi?» never goes to Telegram (the plan says so too).
    if (payload.task.kind === 'LESSON_QUESTION') return;
    try {
      const users = await this.prisma.user.findMany({
        where: { id: { in: noticeUserIds(payload) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const names = new Map(
        users.map((u) => [u.id, shortName(u.firstName, u.lastName)]),
      );
      const out = planNotices(event, payload, names).flatMap((n) =>
        n.telegram ? [{ userId: n.userId, notice: n.telegram }] : [],
      );
      if (out.length === 0) return;
      const view = await loadTaskView(this.prisma, payload.task.id);
      if (!view) return;
      for (const { userId, notice } of out) {
        // One failing recipient must not cost the others their message.
        try {
          await this.deliver(view, userId, notice, now);
        } catch (err) {
          this.logger.error(
            `telegram notice failed for ${userId} (${event}): ${describeError(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.error(`telegram notices failed (${event}): ${describeError(err)}`);
    }
  }

  private async deliver(
    view: TgTaskView,
    userId: number,
    notice: TgNotice,
    now: Date,
  ): Promise<void> {
    const at = telegramSendAfter(now, view.priority);
    if (at.getTime() > now.getTime()) {
      await this.queue(view.id, userId, notice, at, null);
      return;
    }
    const r = await this.sender.send(view, userId, notice);
    if (r.status !== 'failed') return;
    if (r.kind !== 'transient') {
      this.logger.warn(`telegram notice to ${userId} dropped: ${r.reason}`);
      return;
    }
    const retry = new Date(
      now.getTime() + (r.retryAfter ?? TRANSIENT_RETRY_S) * 1000,
    );
    await this.queue(
      view.id,
      userId,
      notice,
      telegramSendAfter(retry, view.priority),
      r.reason,
    );
  }

  private async queue(
    taskId: string,
    userId: number,
    notice: TgNotice,
    sendAfter: Date,
    error: string | null,
  ): Promise<void> {
    await this.prisma.taskOutbox.create({
      data: {
        taskId,
        userId,
        channel: 'TELEGRAM',
        kind: 'NOTICE',
        payload: notice as Prisma.InputJsonValue,
        sendAfter,
        attempts: error ? 1 : 0,
        lastError: error,
      },
    });
  }
}
```

- [ ] **Step 3: Wire the module**

Replace `server/src/tasks/tasks.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskNotifyListener } from './task-notify.listener';
import { TaskOutboxService } from './task-outbox.service';
import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';
import { TaskTelegramSender } from './telegram/task-telegram.sender';
import { TaskTelegramListener } from './telegram/task-telegram.listener';

@Module({
  // TelegramModule gives the main bot (`TelegramService.getBot()`). One way
  // only: nothing under src/telegram imports src/tasks (ADR-0078).
  imports: [NotificationsModule, HolidaysModule, TelegramModule],
  controllers: [TasksController],
  providers: [
    TasksService,
    TasksReadService,
    TaskNotifyListener,
    TaskOutboxService,
    TaskUserLifecycleListener,
    TaskTelegramSender,
    TaskTelegramListener,
  ],
  exports: [TasksService],
})
export class TasksModule {}
```

- [ ] **Step 4: Run the gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram.listener.ts src/tasks/telegram/task-telegram.listener.spec.ts src/tasks/tasks.module.ts
npx eslint src/tasks --quiet
npx jest src/tasks src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: PASS; `event-wiring.spec.ts` green (no new event names).

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram.listener.ts server/src/tasks/telegram/task-telegram.listener.spec.ts server/src/tasks/tasks.module.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): send task notices to Telegram after the commit, hold night ones for 08:00" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The Telegram outbox drain

**Files:**
- Create: `server/src/tasks/telegram/task-telegram-outbox.service.ts`, `server/src/tasks/telegram/task-telegram-outbox.service.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts` (provider)

**Interfaces:**
- Consumes: `loadTaskView` (Task 5), `TaskTelegramSender.send` (Task 5), `TgNotice` (Task 3), `OPEN_STATUSES`.
- Produces: `TaskTelegramOutbox.drain(now?: Date): Promise<number>` (`@Cron('30 * * * * *', Asia/Tashkent)`); `skipReason(row: { kind: TaskOutboxKind; userId: number }, view: TgTaskView | null, now: Date): string | null`.

- [ ] **Step 1: Write the failing spec**

Create `server/src/tasks/telegram/task-telegram-outbox.service.spec.ts`:

```ts
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramOutbox } from './task-telegram-outbox.service';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
}));

const NOW = new Date('2026-10-13T03:00:30.000Z'); // 08:00:30 Tashkent
const view = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  companyId: 1,
  kind: 'MANUAL',
  title: 'Banner',
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  dueAt: new Date('2026-10-13T05:00:00.000Z'),
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [],
  ...over,
});
const row = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  taskId: 't1',
  userId: 40,
  kind: 'NOTICE',
  payload: { kind: 'ASSIGNED' },
  ...over,
});

function setup(rows: unknown[]) {
  const prisma = {
    taskOutbox: {
      findMany: jest.fn().mockResolvedValue(rows),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const sender = { send: jest.fn().mockResolvedValue({ status: 'sent', messageId: 5 }) };
  (loadTaskView as jest.Mock).mockResolvedValue(view());
  return { outbox: new TaskTelegramOutbox(prisma as any, sender as any), prisma, sender };
}
const updateOf = (prisma: any, i = 0) => prisma.taskOutbox.update.mock.calls[i][0];

describe('TaskTelegramOutbox.drain', () => {
  it('reads only due Telegram rows that have not failed three times', async () => {
    const { outbox, prisma } = setup([]);
    await outbox.drain(NOW);
    expect(prisma.taskOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { channel: 'TELEGRAM', sendAfter: { lte: NOW }, sentAt: null, attempts: { lt: 3 } },
        orderBy: { sendAfter: 'asc' },
      }),
    );
  });

  it('sends a held notice with its planned text and marks it sent', async () => {
    const { outbox, prisma, sender } = setup([row()]);
    await expect(outbox.drain(NOW)).resolves.toBe(1);
    expect(sender.send).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 40, { kind: 'ASSIGNED' });
    expect(updateOf(prisma)).toEqual({ where: { id: 'o1' }, data: { sentAt: NOW, lastError: null } });
  });

  it('a reminder or overdue row goes only while the task is open and the person is on it', async () => {
    const cases: [Record<string, unknown>, Record<string, unknown>, string][] = [
      [{ kind: 'REMINDER' }, { status: 'DONE' }, 'task closed'],
      [{ kind: 'OVERDUE' }, { status: 'CANCELLED' }, 'task closed'],
      [{ kind: 'REMINDER', userId: 41 }, {}, 'not on task'],
      [{ kind: 'OVERDUE', userId: 41 }, {}, 'not on task'],
      [{ kind: 'REMINDER' }, { dueAt: new Date('2026-10-13T03:00:00.000Z') }, 'stale reminder'],
    ];
    for (const [r, v, reason] of cases) {
      const { outbox, prisma, sender } = setup([row({ payload: null, ...r })]);
      (loadTaskView as jest.Mock).mockResolvedValue(view(v));
      await outbox.drain(NOW);
      expect(sender.send).not.toHaveBeenCalled();
      expect(updateOf(prisma).data).toEqual({ sentAt: NOW, lastError: reason });
    }
  });

  it('the author gets the overdue row; a closed task still gets its «Bekor qilindi» notice', async () => {
    const a = setup([row({ kind: 'OVERDUE', userId: 30, payload: null })]);
    await a.outbox.drain(NOW);
    expect(a.sender.send).toHaveBeenCalledWith(expect.anything(), 30, { kind: 'OVERDUE' });
    const b = setup([row({ userId: 50, payload: { kind: 'CANCELLED', by: 'Soliyev A.' } })]);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'CANCELLED' }));
    await b.outbox.drain(NOW);
    expect(b.sender.send).toHaveBeenCalledWith(expect.anything(), 50, { kind: 'CANCELLED', by: 'Soliyev A.' });
  });

  it('a task that is gone, or a person with no chat, closes the row', async () => {
    const gone = setup([row()]);
    (loadTaskView as jest.Mock).mockResolvedValue(null);
    await gone.outbox.drain(NOW);
    expect(updateOf(gone.prisma).data).toEqual({ sentAt: NOW, lastError: 'task gone' });
    const noChat = setup([row()]);
    noChat.sender.send.mockResolvedValue({ status: 'skipped', reason: 'no chat' });
    await noChat.outbox.drain(NOW);
    expect(updateOf(noChat.prisma).data).toEqual({ sentAt: NOW, lastError: 'no chat' });
  });

  it('429: waits retry_after and ends the run', async () => {
    const { outbox, prisma, sender } = setup([row(), row({ id: 'o2' })]);
    sender.send.mockResolvedValue({ status: 'failed', kind: 'transient', retryAfter: 30, reason: 'Too Many Requests' });
    await outbox.drain(NOW);
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(updateOf(prisma)).toEqual({
      where: { id: 'o1' },
      data: { sendAfter: new Date(NOW.getTime() + 30_000), lastError: 'Too Many Requests' },
    });
  });

  it('403 kills the row; a network error counts an attempt', async () => {
    const blocked = setup([row()]);
    blocked.sender.send.mockResolvedValue({ status: 'failed', kind: 'permanent', retryAfter: null, reason: 'blocked' });
    await blocked.outbox.drain(NOW);
    expect(updateOf(blocked.prisma).data).toEqual({ attempts: 3, lastError: 'blocked' });
    const net = setup([row()]);
    net.sender.send.mockResolvedValue({ status: 'failed', kind: 'transient', retryAfter: null, reason: 'ETIMEDOUT' });
    await net.outbox.drain(NOW);
    expect(updateOf(net.prisma).data).toEqual({ attempts: { increment: 1 }, lastError: 'ETIMEDOUT' });
  });

  it('a row that throws counts an attempt and the next row still goes', async () => {
    const { outbox, prisma, sender } = setup([row(), row({ id: 'o2' })]);
    sender.send.mockRejectedValueOnce(new Error('boom'));
    await expect(outbox.drain(NOW)).resolves.toBe(1);
    expect(updateOf(prisma, 0).data).toEqual({ attempts: { increment: 1 }, lastError: 'boom' });
    expect(updateOf(prisma, 1).where).toEqual({ id: 'o2' });
  });

  it('a run still busy is not started twice', async () => {
    const { outbox, prisma } = setup([]);
    let release!: () => void;
    prisma.taskOutbox.findMany.mockReturnValueOnce(new Promise((r) => (release = () => r([]))));
    const first = outbox.drain(NOW);
    await expect(outbox.drain(NOW)).resolves.toBe(0);
    release();
    await first;
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram-outbox.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write `task-telegram-outbox.service.ts`**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { TaskOutboxKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../telegram-digest/telegram-send';
import type { TgNotice } from '../task-notify-plan';
import { OPEN_STATUSES } from '../task-transitions';
import type { TgTaskView } from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramSender } from './task-telegram.sender';

/**
 * Why a due Telegram row is closed without a send, or null to send it.
 * NOTICE rows go whatever the task's state (a «Bekor qilindi» is about a
 * closed task); REMINDER / OVERDUE only while the task is open and the person
 * is still on it (spec §9.3).
 */
export function skipReason(
  row: { kind: TaskOutboxKind; userId: number },
  view: TgTaskView | null,
  now: Date,
): string | null {
  if (!view) return 'task gone';
  if (view.kind === 'LESSON_QUESTION') return 'no telegram';
  if (row.kind === 'NOTICE') return null;
  if (!OPEN_STATUSES.includes(view.status)) return 'task closed';
  const assignee = view.participants.some(
    (p) => p.userId === row.userId && p.role === 'ASSIGNEE',
  );
  if (row.kind === 'REMINDER') {
    if (!assignee) return 'not on task';
    // The overdue row covers a deadline that has already passed.
    if (!view.dueAt || view.dueAt.getTime() <= now.getTime()) {
      return 'stale reminder';
    }
    return null;
  }
  return assignee || view.authorId === row.userId ? null : 'not on task';
}

/** Sends the `TELEGRAM` rows of `TaskOutbox` when their time comes (ADR-0078). */
@Injectable()
export class TaskTelegramOutbox {
  private readonly logger = new Logger(TaskTelegramOutbox.name);
  /** A slow run must not be picked up again by the next tick and double-send. */
  private draining = false;

  constructor(
    private prisma: PrismaService,
    private sender: TaskTelegramSender,
  ) {}

  // Second 30: half a minute away from the in-app drain.
  @Cron('30 * * * * *', { timeZone: 'Asia/Tashkent' })
  async drain(now = new Date()): Promise<number> {
    if (this.draining) return 0;
    this.draining = true;
    try {
      return await this.drainDue(now);
    } finally {
      this.draining = false;
    }
  }

  private async drainDue(now: Date): Promise<number> {
    const rows = await this.prisma.taskOutbox.findMany({
      where: {
        channel: 'TELEGRAM',
        sendAfter: { lte: now },
        sentAt: null,
        attempts: { lt: 3 },
      },
      orderBy: { sendAfter: 'asc' },
      take: 50,
      select: { id: true, taskId: true, userId: true, kind: true, payload: true },
    });
    let sent = 0;
    for (const row of rows) {
      try {
        const view = await loadTaskView(this.prisma, row.taskId);
        const skip = skipReason(row, view, now);
        if (skip !== null || !view) {
          await this.close(row.id, now, skip ?? 'task gone');
          continue;
        }
        const notice: TgNotice =
          row.kind === 'NOTICE'
            ? (row.payload as unknown as TgNotice)
            : { kind: row.kind };
        const r = await this.sender.send(view, row.userId, notice);
        if (r.status === 'sent') {
          await this.close(row.id, now, null);
          sent++;
          continue;
        }
        if (r.status === 'skipped') {
          await this.close(row.id, now, r.reason);
          continue;
        }
        if (r.retryAfter !== null) {
          // 429: wait as told; the next rows would only hit the limit too.
          await this.prisma.taskOutbox.update({
            where: { id: row.id },
            data: {
              sendAfter: new Date(now.getTime() + r.retryAfter * 1000),
              lastError: r.reason,
            },
          });
          break;
        }
        await this.prisma.taskOutbox.update({
          where: { id: row.id },
          data:
            r.kind === 'transient'
              ? { attempts: { increment: 1 }, lastError: r.reason }
              : { attempts: 3, lastError: r.reason },
        });
      } catch (err) {
        const reason = describeError(err).slice(0, 500);
        this.logger.warn(`telegram outbox ${row.id} failed: ${reason}`);
        await this.prisma.taskOutbox
          .update({
            where: { id: row.id },
            data: { attempts: { increment: 1 }, lastError: reason },
          })
          .catch(() => undefined);
      }
    }
    return sent;
  }

  private close(id: string, now: Date, reason: string | null) {
    return this.prisma.taskOutbox.update({
      where: { id },
      data: { sentAt: now, lastError: reason },
    });
  }
}
```

- [ ] **Step 3: Register the provider**

In `server/src/tasks/tasks.module.ts` add `import { TaskTelegramOutbox } from './telegram/task-telegram-outbox.service';` and `TaskTelegramOutbox,` after `TaskTelegramListener,` in `providers`.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram-outbox.service.ts src/tasks/telegram/task-telegram-outbox.service.spec.ts src/tasks/tasks.module.ts
npx eslint src/tasks --quiet
npx jest src/tasks
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram-outbox.service.ts server/src/tasks/telegram/task-telegram-outbox.service.spec.ts server/src/tasks/tasks.module.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): drain Telegram outbox rows every minute with 429/403 handling" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Buttons in the bot (`TaskTelegramHandler`)

**Files:**
- Create: `server/src/tasks/telegram/task-telegram.handler.ts`, `server/src/tasks/telegram/task-telegram.handler.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts` (provider)

**Interfaces:**
- Consumes: `TasksService.loadActor / loadForAccess / changeStatus / review / updateStep` + `TaskActor.via` (Task 2); everything from `task-telegram-text.ts` (Task 4); `loadTaskView`, `staffOfChat` (Task 5); `TaskTelegramSender.openUrl / record` (Task 5); `TelegramService.getBot()`; `BotContext` (`src/telegram/types/context.ts`).
- Produces: `TaskTelegramHandler` (`OnApplicationBootstrap`) with `onAction(ctx: BotContext): Promise<void>` registered as `bot.action(/^tk:/, …)`. Task 9 adds `onMessage` to the same class.

- [ ] **Step 1: Write the failing spec**

Create `server/src/tasks/telegram/task-telegram.handler.spec.ts`:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramHandler } from './task-telegram.handler';
import {
  NOT_IN_REVIEW,
  NOT_YOURS,
  RETURN_PROMPT,
  SEVERAL_ACCOUNTS,
  TRY_LATER,
  type TgTaskView,
} from './task-telegram-text';

jest.mock('./task-telegram-view', () => ({
  ...jest.requireActual('./task-telegram-view'),
  loadTaskView: jest.fn(),
  staffOfChat: jest.fn(),
}));

const TASK = '0b9e6f3e-5a51-4c55-9a43-6f0d2c1e7a10';
const STEP = '6c1f2a9d-1d1b-4f3e-8f43-2b7c0e9d5a21';
const actorOf = (userId: number) => ({
  userId,
  companyId: 1,
  roleIds: [4],
  roleNames: ['Teacher'],
  scope: { kind: 'branches' as const, branchIds: [1] },
  headerBranchId: null,
});
const view = (over: Partial<TgTaskView> = {}): TgTaskView => ({
  id: TASK,
  companyId: 1,
  kind: 'MANUAL',
  title: 'Oktabr banneri',
  status: 'NEW',
  priority: 'HIGH',
  dueAt: null,
  requiresPhoto: false,
  authorId: 30,
  authorName: 'Soliyev A.',
  entityLabel: null,
  participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
  steps: [{ id: STEP, title: 'Matn qoralamasi', done: false }],
  ...over,
});

function press(data: string, text = 'Yangi topshiriq · Yuqori\nOktabr banneri') {
  return {
    chat: { id: 700, type: 'private' },
    callbackQuery: { data, message: { message_id: 5, text } },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({ message_id: 9 }),
    session: {},
  } as any;
}
const labels = (extra: any) =>
  extra.reply_markup.inline_keyboard.map((r: any[]) => r.map((b) => b.text));

let handler: TaskTelegramHandler;
let prisma: any;
let tasks: any;
let sender: any;
let bot: any;

function as(userId: number) {
  (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'one', userId, companyId: 1, roleIds: [4] });
  tasks.loadActor.mockResolvedValue(actorOf(userId));
}

beforeEach(() => {
  // The module mocks (`loadTaskView`, `staffOfChat`) keep calls and queued
  // `…Once` values across tests otherwise.
  jest.resetAllMocks();
  prisma = {
    taskStep: { findUnique: jest.fn().mockResolvedValue({ taskId: TASK }) },
    task: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    taskTelegramMessage: { findUnique: jest.fn() },
  };
  tasks = {
    loadActor: jest.fn(),
    loadForAccess: jest.fn().mockResolvedValue({}),
    changeStatus: jest.fn().mockResolvedValue({}),
    review: jest.fn().mockResolvedValue({ assignees: [] }),
    updateStep: jest.fn().mockResolvedValue({}),
    addComment: jest.fn().mockResolvedValue({}),
  };
  sender = {
    openUrl: jest.fn().mockReturnValue(`https://lehrer.dafzentrum.uz/tasks?task=${TASK}`),
    record: jest.fn(),
  };
  bot = { action: jest.fn(), on: jest.fn() };
  handler = new TaskTelegramHandler(prisma, tasks, { getBot: () => bot } as any, sender);
  as(40);
  (loadTaskView as jest.Mock).mockResolvedValue(view());
});

describe('TaskTelegramHandler — buttons', () => {
  it('registers on the bot after boot; does nothing when the bot is off', () => {
    handler.onApplicationBootstrap();
    expect(bot.action.mock.calls[0][0]).toEqual(/^tk:/);
    const off = new TaskTelegramHandler(prisma, tasks, { getBot: () => undefined } as any, sender);
    expect(() => off.onApplicationBootstrap()).not.toThrow();
  });

  it('«Boshladim»: through TasksService as the chat\'s staff, via TELEGRAM; the same message is edited', async () => {
    (loadTaskView as jest.Mock)
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ status: 'IN_PROGRESS' }));
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(tasks.changeStatus).toHaveBeenCalledWith(TASK, 'IN_PROGRESS', { ...actorOf(40), via: 'TELEGRAM' });
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    const [text, extra] = ctx.editMessageText.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Yangi topshiriq · Yuqori</b>');
    expect(text).toContain('Holat: Jarayonda');
    expect(labels(extra)).toEqual([['Bajardim'], ['Qadamlar'], ['Ochish']]);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('«Bajardim»: to review on a shared task, straight to DONE on a self-task', async () => {
    await handler.onAction(press(`tk:done:${TASK}`));
    expect(tasks.changeStatus).toHaveBeenLastCalledWith(TASK, 'IN_REVIEW', expect.anything());
    (loadTaskView as jest.Mock).mockResolvedValue(view({ authorId: 40 }));
    await handler.onAction(press(`tk:done:${TASK}`));
    expect(tasks.changeStatus).toHaveBeenLastCalledWith(TASK, 'DONE', expect.anything());
  });

  it('«Qabul qilish»: the author accepts', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'IN_REVIEW' }));
    await handler.onAction(press(`tk:accept:${TASK}`, 'Tekshiruvga keldi\nOktabr banneri'));
    expect(tasks.review).toHaveBeenCalledWith(TASK, 'ACCEPT', undefined, { ...actorOf(30), via: 'TELEGRAM' });
  });

  it('a stale press: the service\'s reason, then the task as it is now', async () => {
    tasks.changeStatus.mockRejectedValue(new BadRequestException('Holat allaqachon shunday'));
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'IN_PROGRESS' }));
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Holat allaqachon shunday', { show_alert: true });
    expect(labels(ctx.editMessageText.mock.calls[0][1])).toEqual([['Bajardim'], ['Qadamlar'], ['Ochish']]);
  });

  it('a task the person cannot see any more: «Bu topshiriq sizda emas», buttons removed', async () => {
    tasks.loadForAccess.mockRejectedValue(new NotFoundException('Topshiriq topilmadi'));
    const ctx = press(`tk:start:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, { show_alert: true });
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalledWith(undefined);
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('identity: no staff on the chat, or two — refused before anything else', async () => {
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'none' });
    const a = press(`tk:start:${TASK}`);
    await handler.onAction(a);
    expect(a.answerCbQuery).toHaveBeenCalledWith(NOT_YOURS, { show_alert: true });
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'several' });
    const b = press(`tk:start:${TASK}`);
    await handler.onAction(b);
    expect(b.answerCbQuery).toHaveBeenCalledWith(SEVERAL_ACCOUNTS, { show_alert: true });
    expect(tasks.loadActor).not.toHaveBeenCalled();
    expect(tasks.changeStatus).not.toHaveBeenCalled();
  });

  it('«Qaytarish»: asks for the reason as a reply and remembers the prompt', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'IN_REVIEW' }));
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(RETURN_PROMPT, {
      reply_markup: { force_reply: true, input_field_placeholder: 'Qaytarish sababi' },
    });
    expect(sender.record).toHaveBeenCalledWith('700', 9, expect.objectContaining({ id: TASK }), 30, 'RETURN_PROMPT');
    expect(tasks.review).not.toHaveBeenCalled();
  });

  it('«Qaytarish» on a task no longer in review: says so, asks nothing', async () => {
    as(30);
    (loadTaskView as jest.Mock).mockResolvedValue(view({ status: 'DONE' }));
    const ctx = press(`tk:return:${TASK}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(NOT_IN_REVIEW, { show_alert: true });
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('«Qadamlar» → the step list; a step toggles through the service; «Orqaga» → the card', async () => {
    const steps = press(`tk:steps:${TASK}`);
    await handler.onAction(steps);
    expect(steps.editMessageText.mock.calls[0][0]).toBe(
      '<b>Kichik qadamlar · 0/1</b>\nBosib belgilang yoki belgini olib tashlang',
    );
    expect(labels(steps.editMessageText.mock.calls[0][1])).toEqual([['1. Matn qoralamasi'], ['Orqaga']]);

    (loadTaskView as jest.Mock)
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ steps: [{ id: STEP, title: 'Matn qoralamasi', done: true }] }));
    const tick = press(`tk:step:${STEP}`, 'Kichik qadamlar · 0/1\n…');
    await handler.onAction(tick);
    expect(prisma.taskStep.findUnique).toHaveBeenCalledWith({ where: { id: STEP }, select: { taskId: true } });
    expect(tasks.updateStep).toHaveBeenCalledWith(TASK, STEP, { done: true }, { ...actorOf(40), via: 'TELEGRAM' });
    expect(labels(tick.editMessageText.mock.calls[0][1])[0]).toEqual(['✓ 1. Matn qoralamasi']);

    const back = press(`tk:back:${TASK}`, 'Kichik qadamlar · 1/1\n…');
    await handler.onAction(back);
    expect(back.editMessageText.mock.calls[0][0].split('\n')[0]).toBe('<b>Oktabr banneri</b>');
  });

  it('a step that is gone', async () => {
    prisma.taskStep.findUnique.mockResolvedValue(null);
    const ctx = press(`tk:step:${STEP}`);
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Qadam topilmadi', { show_alert: true });
  });

  it('«Topshiriqlarim»: my open assigned tasks except «Dars bo\'ldimi?», numbered', async () => {
    prisma.task.findMany.mockResolvedValue([
      { id: 'a', title: 'Kassa', dueAt: null },
      { id: 'b', title: 'Banner', dueAt: null },
    ]);
    prisma.task.count.mockResolvedValue(2);
    const ctx = press('tk:list', 'Xodim kabinetingiz');
    await handler.onAction(ctx);
    const where = {
      companyId: 1,
      status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] },
      kind: { not: 'LESSON_QUESTION' },
      participants: { some: { userId: 40, role: 'ASSIGNEE' } },
    };
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 10,
      select: { id: true, title: true, dueAt: true },
    });
    expect(prisma.task.count).toHaveBeenCalledWith({ where });
    const [text, extra] = ctx.reply.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Ochiq topshiriqlar: 2</b>');
    expect(labels(extra)).toEqual([['1', '2']]);
  });

  it('a number from the list sends the task card and remembers it', async () => {
    const ctx = press(`tk:show:${TASK}`, 'Ochiq topshiriqlar: 1\n…');
    await handler.onAction(ctx);
    const [text] = ctx.reply.mock.calls[0];
    expect(text.split('\n')[0]).toBe('<b>Oktabr banneri</b>');
    expect(sender.record).toHaveBeenCalledWith('700', 9, expect.objectContaining({ id: TASK }), 40, 'NOTICE');
  });

  it('junk callback data: just answered', async () => {
    const ctx = press('tk:nope:1');
    await handler.onAction(ctx);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith();
    expect(staffOfChat).not.toHaveBeenCalled();
  });

  it('an unexpected error never escapes the handler', async () => {
    tasks.changeStatus.mockRejectedValue(new Error('db down'));
    const ctx = press(`tk:start:${TASK}`);
    await expect(handler.onAction(ctx)).resolves.toBeUndefined();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith(TRY_LATER);
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram.handler.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write `task-telegram.handler.ts`**

```ts
import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { TasksService, type TaskActor } from '../tasks.service';
import { OPEN_STATUSES } from '../task-transitions';
import {
  NOT_IN_REVIEW,
  NOT_YOURS,
  RETURN_PLACEHOLDER,
  RETURN_PROMPT,
  SEVERAL_ACCOUNTS,
  STEP_GONE,
  TRY_LATER,
  editExtra,
  isSelfTask,
  keptHeadline,
  messageExtra,
  parseTk,
  renderMyTasks,
  renderStepsMessage,
  renderTaskMessage,
  type TgTaskView,
} from './task-telegram-text';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramSender } from './task-telegram.sender';

/** The person behind the chat, as `TasksService` takes them. */
interface Me {
  actor: TaskActor;
  roleIds: number[];
  chatId: string;
}

/** The text of the message whose button was pressed (plain, as Telegram returns it). */
function pressedText(ctx: BotContext): string | undefined {
  const m = ctx.callbackQuery?.message;
  return m && 'text' in m ? m.text : undefined;
}

/**
 * Task buttons and replies in the main bot (spec §6.1–6.5, ADR-0078). Every
 * change goes through `TasksService` as the chat's staff account with
 * `via: 'TELEGRAM'`: the website's policy and transitions, nothing extra here.
 */
@Injectable()
export class TaskTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskTelegramHandler.name);

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private telegram: TelegramService,
    private sender: TaskTelegramSender,
  ) {}

  /**
   * Runs after every module's onModuleInit, so the bot exists. The handlers
   * land after the bot's own (/start, commands, menus), which answer first.
   */
  onApplicationBootstrap(): void {
    const bot = this.telegram.getBot();
    if (!bot) return; // no TELEGRAM_BOT_TOKEN — the bot is off
    bot.action(/^tk:/, (ctx) => this.onAction(ctx));
  }

  async onAction(ctx: BotContext): Promise<void> {
    try {
      await this.handleAction(ctx);
    } catch (err) {
      // Never let a task button take the bot's update loop down.
      this.logger.error(`task button failed: ${describeError(err)}`);
      await ctx.answerCbQuery(TRY_LATER).catch(() => undefined);
    }
  }

  /** The chat's one live staff account, or null after saying why not (spec §6.5). */
  private async me(
    chatId: string,
    refuse: (text: string) => Promise<unknown>,
  ): Promise<Me | null> {
    const who = await staffOfChat(this.prisma, chatId);
    if (who.kind !== 'one') {
      await refuse(who.kind === 'several' ? SEVERAL_ACCOUNTS : NOT_YOURS);
      return null;
    }
    try {
      const actor = await this.tasks.loadActor(who.userId, who.companyId, null);
      return { actor: { ...actor, via: 'TELEGRAM' }, roleIds: who.roleIds, chatId };
    } catch {
      // Blocked or archived since the chat was linked.
      await refuse(NOT_YOURS);
      return null;
    }
  }

  private async handleAction(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const cmd = parseTk(q && 'data' in q ? q.data : '');
    if (!cmd || ctx.chat?.type !== 'private') {
      await ctx.answerCbQuery();
      return;
    }
    const me = await this.me(String(ctx.chat.id), (t) =>
      ctx.answerCbQuery(t, { show_alert: true }),
    );
    if (!me) return;
    if (cmd.action === 'list') {
      await this.showList(ctx, me);
      return;
    }

    let taskId = cmd.id;
    if (cmd.action === 'step') {
      const step = await this.prisma.taskStep.findUnique({
        where: { id: cmd.id },
        select: { taskId: true },
      });
      if (!step) {
        await ctx.answerCbQuery(STEP_GONE, { show_alert: true });
        return;
      }
      taskId = step.taskId;
    }
    const view = await this.access(ctx, me, taskId);
    if (!view) return;
    const headline = keptHeadline(pressedText(ctx), view.title);

    try {
      switch (cmd.action) {
        case 'show':
          await ctx.answerCbQuery();
          await this.sendCard(ctx, me, view);
          return;
        case 'steps':
          await ctx.answerCbQuery();
          await this.drawSteps(ctx, view);
          return;
        case 'back':
          await ctx.answerCbQuery();
          await this.drawCard(ctx, me, view, undefined);
          return;
        case 'return':
          await this.askReason(ctx, me, view, headline);
          return;
        case 'step': {
          const done = view.steps.find((s) => s.id === cmd.id)?.done ?? false;
          await this.tasks.updateStep(taskId, cmd.id, { done: !done }, me.actor);
          await ctx.answerCbQuery();
          await this.drawSteps(ctx, await loadTaskView(this.prisma, taskId));
          return;
        }
        case 'start':
          await this.tasks.changeStatus(taskId, 'IN_PROGRESS', me.actor);
          break;
        case 'done':
          await this.tasks.changeStatus(
            taskId,
            isSelfTask(view, me.actor.userId) ? 'DONE' : 'IN_REVIEW',
            me.actor,
          );
          break;
        case 'accept':
          await this.tasks.review(taskId, 'ACCEPT', undefined, me.actor);
          break;
      }
      await ctx.answerCbQuery();
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      // A stale message: say why, then show the task as it is now.
      await ctx.answerCbQuery(err.message, { show_alert: true });
    }
    await this.drawCard(ctx, me, await loadTaskView(this.prisma, taskId), headline);
  }

  /** The task, or null after telling the person it is not theirs (and dropping the buttons). */
  private async access(
    ctx: BotContext,
    me: Me,
    taskId: string,
  ): Promise<TgTaskView | null> {
    try {
      await this.tasks.loadForAccess(this.prisma, taskId, me.actor);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
      await ctx.answerCbQuery(NOT_YOURS, { show_alert: true });
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return null;
    }
    return loadTaskView(this.prisma, taskId);
  }

  private async drawCard(
    ctx: BotContext,
    me: Me,
    view: TgTaskView | null,
    headline: string | undefined,
  ): Promise<void> {
    if (!view) {
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    const msg = renderTaskMessage(view, { kind: 'CARD', headline }, me.actor.userId, {
      now: new Date(),
      openUrl: this.sender.openUrl(me.roleIds, view.id),
    });
    // «message is not modified» when nothing changed — nothing to do.
    await ctx.editMessageText(msg.text, editExtra(msg.buttons)).catch(() => undefined);
  }

  private async drawSteps(ctx: BotContext, view: TgTaskView | null): Promise<void> {
    if (!view) {
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      return;
    }
    const msg = renderStepsMessage(view);
    await ctx.editMessageText(msg.text, editExtra(msg.buttons)).catch(() => undefined);
  }

  private async sendCard(ctx: BotContext, me: Me, view: TgTaskView): Promise<void> {
    const msg = renderTaskMessage(view, { kind: 'CARD' }, me.actor.userId, {
      now: new Date(),
      openUrl: this.sender.openUrl(me.roleIds, view.id),
    });
    const sent = await ctx.reply(msg.text, messageExtra(msg.buttons));
    await this.sender.record(me.chatId, sent.message_id, view, me.actor.userId, 'NOTICE');
  }

  /** «Qaytarish»: the reason comes as a reply to this prompt (Task 9). */
  private async askReason(
    ctx: BotContext,
    me: Me,
    view: TgTaskView,
    headline: string | undefined,
  ): Promise<void> {
    if (view.status !== 'IN_REVIEW') {
      await ctx.answerCbQuery(NOT_IN_REVIEW, { show_alert: true });
      await this.drawCard(ctx, me, view, headline);
      return;
    }
    await ctx.answerCbQuery();
    const prompt = await ctx.reply(RETURN_PROMPT, {
      reply_markup: { force_reply: true, input_field_placeholder: RETURN_PLACEHOLDER },
    });
    await this.sender.record(me.chatId, prompt.message_id, view, me.actor.userId, 'RETURN_PROMPT');
  }

  /** «📋 Topshiriqlarim» (spec §6.3). «Dars bo'ldimi?» is never shown in Telegram. */
  private async showList(ctx: BotContext, me: Me): Promise<void> {
    const where: Prisma.TaskWhereInput = {
      companyId: me.actor.companyId,
      status: { in: [...OPEN_STATUSES] },
      kind: { not: 'LESSON_QUESTION' },
      participants: { some: { userId: me.actor.userId, role: 'ASSIGNEE' } },
    };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: 10,
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.task.count({ where }),
    ]);
    await ctx.answerCbQuery();
    const msg = renderMyTasks(items, total, new Date());
    await ctx.reply(msg.text, messageExtra(msg.buttons));
  }
}
```

Note the flow after a state button: success → `answerCbQuery()`, failure with a reason → `answerCbQuery(reason, alert)`; both then redraw the card from a fresh `loadTaskView`.

- [ ] **Step 3: Register the provider**

In `server/src/tasks/tasks.module.ts` add `import { TaskTelegramHandler } from './telegram/task-telegram.handler';` and `TaskTelegramHandler,` at the end of `providers`.

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram.handler.ts src/tasks/telegram/task-telegram.handler.spec.ts src/tasks/tasks.module.ts
npx eslint src/tasks --quiet
npx jest src/tasks src/tasks/task-write.single-source.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram.handler.ts server/src/tasks/telegram/task-telegram.handler.spec.ts server/src/tasks/tasks.module.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): Telegram task buttons edit the message in place through TasksService" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Replies, and «📋 Topshiriqlarim» in the staff menu

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram.handler.ts` (`onMessage`, registration line)
- Modify: `server/src/tasks/telegram/task-telegram.handler.spec.ts` (new describe)
- Modify: `server/src/telegram/staff/staff-cabinet.ts` (`STAFF_TASKS_ACTION`, menu row), `server/src/telegram/staff/staff-cabinet.spec.ts`

**Interfaces:**
- Consumes: Task 8's class and `me()`; `TasksService.addComment / review`; `TEXT_ONLY`, `ADDED_TO_TASK`, `NOT_YOURS`, `returnedReply`, `shortName`, `parseTk` (Task 4).
- Produces: `TaskTelegramHandler.onMessage(ctx: BotContext, next: () => Promise<void>): Promise<void>` registered as `bot.on('message', …)`; `STAFF_TASKS_ACTION = 'tk:list'` and `STAFF_TASKS_BUTTON_TEXT = '📋 Topshiriqlarim'` exported from `staff-cabinet.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/tasks/telegram/task-telegram.handler.spec.ts` (add `ADDED_TO_TASK`, `TEXT_ONLY`, `parseTk` to the import from `./task-telegram-text`, and `import { STAFF_TASKS_ACTION } from '../../telegram/staff/staff-cabinet';`):

```ts
describe('TaskTelegramHandler — replies (spec §6.2)', () => {
  const message = (msg: any, session: any = {}) =>
    ({
      chat: { id: 700, type: 'private' },
      message: msg,
      reply: jest.fn().mockResolvedValue({ message_id: 12 }),
      session,
    }) as any;
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn().mockResolvedValue(undefined);
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({ taskId: TASK, purpose: 'NOTICE' });
  });

  it('registers a message handler next to the buttons', () => {
    handler.onApplicationBootstrap();
    expect(bot.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('a reply to a task message becomes a comment by the chat\'s staff', async () => {
    const ctx = message({ message_id: 11, text: ' Ha, 450 000. ', reply_to_message: { message_id: 5 } });
    await handler.onMessage(ctx, next);
    expect(prisma.taskTelegramMessage.findUnique).toHaveBeenCalledWith({
      where: { chatId_messageId: { chatId: '700', messageId: 5 } },
      select: { taskId: true, purpose: true },
    });
    expect(tasks.addComment).toHaveBeenCalledWith(TASK, 'Ha, 450 000.', { ...actorOf(40), via: 'TELEGRAM' });
    expect(ctx.reply).toHaveBeenCalledWith(ADDED_TO_TASK);
    expect(next).not.toHaveBeenCalled();
  });

  it('a reply to the «Qaytarish» prompt returns the task with that reason', async () => {
    as(30);
    prisma.taskTelegramMessage.findUnique.mockResolvedValue({ taskId: TASK, purpose: 'RETURN_PROMPT' });
    tasks.review.mockResolvedValue({ assignees: [{ firstName: 'Aziz', lastName: 'Rahimov' }] });
    const ctx = message({ message_id: 11, text: 'Doska artilmagan, qayta qiling', reply_to_message: { message_id: 9 } });
    await handler.onMessage(ctx, next);
    expect(tasks.review).toHaveBeenCalledWith(TASK, 'RETURN', 'Doska artilmagan, qayta qiling', { ...actorOf(30), via: 'TELEGRAM' });
    expect(ctx.reply).toHaveBeenCalledWith('Topshiriq qaytarildi. Rahimov A. ga xabar ketdi.');
  });

  it('a photo, file or voice reply: text only for now, nothing stored', async () => {
    const ctx = message({ message_id: 11, photo: [{ file_id: 'x' }], reply_to_message: { message_id: 5 } });
    await handler.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(TEXT_ONLY);
    expect(tasks.addComment).not.toHaveBeenCalled();
    expect(staffOfChat).not.toHaveBeenCalled();
  });

  it('not a reply, a reply to another message, or a scene in progress → the bot\'s own flows', async () => {
    await handler.onMessage(message({ message_id: 11, text: 'salom' }), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();

    await handler.onMessage(
      message({ message_id: 11, text: 'x', reply_to_message: { message_id: 5 } }, { __scenes: { current: 'STAFF_LINK' } }),
      next,
    );
    expect(next).toHaveBeenCalledTimes(2);
    expect(prisma.taskTelegramMessage.findUnique).not.toHaveBeenCalled();

    prisma.taskTelegramMessage.findUnique.mockResolvedValue(null);
    await handler.onMessage(message({ message_id: 11, text: 'x', reply_to_message: { message_id: 6 } }), next);
    expect(next).toHaveBeenCalledTimes(3);
    expect(tasks.addComment).not.toHaveBeenCalled();
  });

  it('the service refuses → its reason; a task out of reach → «Bu topshiriq sizda emas»', async () => {
    tasks.addComment.mockRejectedValueOnce(new BadRequestException('Izoh matnini yozing'));
    const a = message({ message_id: 11, text: 'x', reply_to_message: { message_id: 5 } });
    await handler.onMessage(a, next);
    expect(a.reply).toHaveBeenCalledWith('Izoh matnini yozing');
    tasks.addComment.mockRejectedValueOnce(new NotFoundException('Topshiriq topilmadi'));
    const b = message({ message_id: 11, text: 'x', reply_to_message: { message_id: 5 } });
    await handler.onMessage(b, next);
    expect(b.reply).toHaveBeenCalledWith(NOT_YOURS);
  });

  it('an unknown chat is refused', async () => {
    (staffOfChat as jest.Mock).mockResolvedValue({ kind: 'none' });
    const ctx = message({ message_id: 11, text: 'x', reply_to_message: { message_id: 5 } });
    await handler.onMessage(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith(NOT_YOURS);
    expect(tasks.addComment).not.toHaveBeenCalled();
  });

  it('the staff menu button is the list action', () => {
    expect(parseTk(STAFF_TASKS_ACTION)).toEqual({ action: 'list', id: '' });
  });
});
```

In `server/src/telegram/staff/staff-cabinet.spec.ts`, `describe('staffMenuKeyboard')`:
- «ustoz: kabinet, jadval, guruhlar va oylik»: insert `[['📋 Topshiriqlarim', undefined]],` between the pages row and the `💰 Oyligim` row of the expected array.
- «ustoz bo'lmagan xodimda oylik tugmasi yo'q»: `toHaveLength(2)` → `toHaveLength(3)`.
- «faqat kassir…»: append `[['📋 Topshiriqlarim', undefined]],` as the last expected row.
- Add:
  ```ts
  it('every staff member gets «📋 Topshiriqlarim» (answered by the tasks module)', () => {
    for (const account of [DOSTON, GULNOZA, MALIKA]) {
      const markup: any = staffMenuKeyboard(account, ADMIN_URL);
      const button = markup.reply_markup.inline_keyboard
        .flat()
        .find((b: any) => b.text === STAFF_TASKS_BUTTON_TEXT);
      expect(button.callback_data).toBe(STAFF_TASKS_ACTION);
    }
  });
  ```
  and import `STAFF_TASKS_ACTION, STAFF_TASKS_BUTTON_TEXT` from `./staff-cabinet`.

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/telegram/task-telegram.handler.spec.ts src/telegram/staff/staff-cabinet.spec.ts`
Expected: FAIL — `onMessage` and `STAFF_TASKS_ACTION` missing.

- [ ] **Step 2: The staff menu button**

In `server/src/telegram/staff/staff-cabinet.ts`:
- `import type { InlineKeyboardButton } from 'telegraf/types';`
- After `STAFF_PAGES` add:
  ```ts
  /**
   * «📋 Topshiriqlarim»: a callback the tasks module answers
   * (`src/tasks/telegram/`, ADR-0078). Only this string lives here, so
   * src/telegram never imports src/tasks.
   */
  export const STAFF_TASKS_ACTION = 'tk:list';
  export const STAFF_TASKS_BUTTON_TEXT = '📋 Topshiriqlarim';
  ```
- In `staffMenuKeyboard` replace the `const rows = [ … ];` statement with:
  ```ts
  const rows: InlineKeyboardButton[][] = [
    [Markup.button.webApp(STAFF_CABINET_BUTTON_TEXT, cabinetUrl)],
    pages,
    [Markup.button.callback(STAFF_TASKS_BUTTON_TEXT, STAFF_TASKS_ACTION)],
  ];
  ```
- Update the `staffMenuKeyboard` doc comment: «… guruhlar — kassirdan boshqa hamma; topshiriqlar — hamma xodim; oylik — ustozning o'z sahifasi.»

- [ ] **Step 3: Replies in the handler**

In `task-telegram.handler.ts`:
- Import also `ADDED_TO_TASK`, `TEXT_ONLY`, `returnedReply`, `shortName` from `./task-telegram-text`.
- In `onApplicationBootstrap`, after the `bot.action(…)` line:
  ```ts
    bot.on('message', (ctx, next) => this.onMessage(ctx, next));
  ```
- Add the methods:

```ts
  async onMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    try {
      await this.handleMessage(ctx, next);
    } catch (err) {
      this.logger.error(`task reply failed: ${describeError(err)}`);
      await ctx.reply(TRY_LATER).catch(() => undefined);
    }
  }

  /**
   * A reply to a task message (spec §6.2). Anything else — not a reply, a
   * reply to some other message, or any message while a scene (registration,
   * password reset, linking…) owns the chat — goes on to the bot's own flows.
   */
  private async handleMessage(
    ctx: BotContext,
    next: () => Promise<void>,
  ): Promise<void> {
    const msg = ctx.message;
    const replyTo =
      msg && 'reply_to_message' in msg ? msg.reply_to_message : undefined;
    if (
      !msg ||
      !replyTo ||
      ctx.chat?.type !== 'private' ||
      ctx.session?.__scenes?.current
    ) {
      return next();
    }
    const chatId = String(ctx.chat.id);
    const link = await this.prisma.taskTelegramMessage.findUnique({
      where: { chatId_messageId: { chatId, messageId: replyTo.message_id } },
      select: { taskId: true, purpose: true },
    });
    if (!link) return next();
    // Photos, files and voice come with phase 3; nothing is stored now.
    const text = 'text' in msg ? msg.text.trim() : '';
    if (!text) {
      await ctx.reply(TEXT_ONLY);
      return;
    }
    const me = await this.me(chatId, (t) => ctx.reply(t));
    if (!me) return;
    try {
      if (link.purpose === 'RETURN_PROMPT') {
        const task = await this.tasks.review(link.taskId, 'RETURN', text, me.actor);
        await ctx.reply(
          returnedReply(task.assignees.map((a) => shortName(a.firstName, a.lastName))),
        );
      } else {
        await this.tasks.addComment(link.taskId, text, me.actor);
        await ctx.reply(ADDED_TO_TASK);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      await ctx.reply(err instanceof NotFoundException ? NOT_YOURS : err.message);
    }
  }
```

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram.handler.ts src/tasks/telegram/task-telegram.handler.spec.ts src/telegram/staff/staff-cabinet.ts src/telegram/staff/staff-cabinet.spec.ts
npx eslint src/tasks src/telegram --quiet
npx jest src/tasks src/telegram
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram.handler.ts server/src/tasks/telegram/task-telegram.handler.spec.ts server/src/telegram/staff/staff-cabinet.ts server/src/telegram/staff/staff-cabinet.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): Telegram replies become comments or return reasons; staff menu lists my tasks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR-0078, server docs, user guide and news

**Files:**
- Create: `docs/adr/0078-topshiriq-xabarlari-telegramga-darhol.md`
- Modify: `docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md` (status line only), `docs/adr/README.md`
- Modify: `server/CLAUDE.md` (sections «Staff in the bot and the staff Mini App (ADR-0045)», «Tasks (`src/tasks/`)», «Notifications (4 channels)» item 4, «Telegram digest» instant list)
- Modify: `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`

**Interfaces:**
- Consumes: the behaviour of Tasks 1–9. Date for the docs: run `TZ=Asia/Tashkent date +%F` and use it where this task says `<BUGUN>`.

- [ ] **Step 1: Re-check the ADR number**

Run: `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup fetch origin main` then `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup show origin/main:docs/adr/README.md | tail -5`. If `0077` is taken, use the next free number everywhere below (file name, README row, ADR-0025 status, server/CLAUDE.md, guide `adr` list, guard spec comment, `tasks.module.ts` / sender comments).

- [ ] **Step 2: Write ADR-0078**

Create `docs/adr/0078-topshiriq-xabarlari-telegramga-darhol.md`:

```markdown
# ADR-0078 — Topshiriq xabarlari Telegram'ga darhol, tugmalar bilan ketadi; kechasi ertalabgacha kutadi

**Holati:** Qabul qilindi
**Sana:** <BUGUN>
**Bog'liq:** ADR-0025 (20:00 yig'ma xabar — shu qaror uni topshiriqlar uchun qisman almashtiradi), ADR-0074 (topshiriq alohida bo'lim, `TasksService` yagona eshik), ADR-0045 (xodim botda: `User.telegramChatId`, `staffLinkedToChatWhere`, `staffPortalFor`), ADR-0076 (qo'ng'iroqcha — Telegram'ga tegmaydi), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §6, §9.3, `server/src/tasks/telegram/`, migratsiya `20261010190000_task_telegram`

## Kontekst

ADR-0025 bo'yicha topshiriq xabari Telegram'ga kechqurun 20:00 dagi yig'ma xabar
bilan borardi: ertalab berilgan ishni xodim kechqurun bilardi. 1-bosqichda
(ADR-0074) topshiriqlar yig'maga yozilmay qo'ydi va Telegram'ga umuman bormay
qoldi — xabar faqat saytdagi qo'ng'iroqchada. Ko'p xodim saytni kun bo'yi ochiq
tutmaydi, Telegram esa doim yonida.

## Qaror

1. **Topshiriq xabarlari darhol ketadi** — asosiy bot, `src/tasks/telegram/`.
   Kimga nima borishini qo'ng'iroqcha bilan bitta ro'yxat hal qiladi
   (`task-notify-plan.ts`, spec §6.1 jadvali). Faqat Telegram'i bog'langan va
   tizimga kira oladigan xodimga, yuborish paytida tekshiriladi; ikki faol
   xodim hisobi bitta chatda — yuborilmaydi. «Dars bo'ldimi?» Telegram'ga
   yuborilmaydi. Ishni qilgan odamning o'ziga xabar bormaydi.
2. **Tungi tinchlik.** 22:00–08:00 (Toshkent) oralig'ida tayyor bo'lgan xabar
   `TaskOutbox` ga (`TELEGRAM`) yoziladi va 08:00 da ketadi; «Shoshilinch»
   topshiriq xabari kechasi ham darhol. Muddatdan 1 soat oldingi eslatma va
   «Muddati o'tdi» ham shu qoida bilan, faqat topshiriq hali ochiq bo'lsa.
3. **Tugmalar:** «Boshladim», «Bajardim», «Qabul qilish», «Qaytarish»,
   «Qadamlar», «Ochish». Bosilganda yangi xabar emas, o'sha xabar
   tahrirlanadi. Har amal `TasksService` orqali, saytdagi ruxsat va o'tish
   qoidalari bilan; tarixda «Telegram orqali» belgisi (`via TELEGRAM`).
   Topshiriqni endi ko'ra olmaydigan odamga — «Bu topshiriq sizda emas».
   Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» yo'q: rasm hozircha
   saytda qo'shiladi.
4. **Javob:** topshiriq xabariga matn bilan javob — izoh; «Qaytarish» so'roviga
   javob — qaytarish sababi. Rasm, fayl va ovoz 3-bosqichgacha qabul
   qilinmaydi. Qaysi xabar qaysi topshiriqniki — `TaskTelegramMessage`.
5. **«📋 Topshiriqlarim»** xodim menyusida: ochiq topshiriqlar, guruhlab, 10 tagacha.
6. **ADR-0025 ning «darhol qolganlar» ro'yxatiga topshiriq xabarlari
   qo'shiladi.** `direct-send.guard.spec.ts` ALLOWED ro'yxatida
   `src/tasks/telegram/`; yig'maga `TASK_*` yozilmasligini shu spec qulflaydi.
7. **Xatolar:** 429 — `retry_after` kutiladi; 403 / chat yo'q — qayta
   urinilmaydi; vaqtinchalik xato — 3 martagacha. Yuborilgan qatorlar 30
   kundan keyin har kecha 03:00 da o'chiriladi.

## Ko'rib chiqilgan muqobillar

- **20:00 yig'mada qoldirish.** Topshiriq — ish; uni kechqurun bilish kech.
  CEO rad etdi.
- **Kechasi ham darhol.** Tungi shovqin; faqat «Shoshilinch» uchun qoldirildi.
- **Har bosishda yangi xabar.** Chat tez to'lib ketadi, eski xabardagi
  tugmalar adashtiradi; maket tahrirlashni ko'rsatadi.
- **Alohida bot.** Xodimlar allaqachon asosiy botga bog'langan (ADR-0045);
  yangi bot yangi bog'lanishni talab qilardi.

## Oqibatlari

- `TaskOutbox` ga `NOTICE` turi va `payload` ustuni qo'shildi; bitta odamga
  bitta topshiriq bo'yicha kechasi bir nechta xabar kutishi mumkin, shuning
  uchun `(taskId, userId, channel, kind)` noyob kaliti oddiy indeksga
  almashdi. Yangi `TaskTelegramMessage` jadvali.
- «Ochish» — portaldagi `/tasks?task=<id>` havolasi; brauzerda portalga kirish
  kerak bo'lishi mumkin. Telegram ichida parolsiz ochish uchun mijozdagi
  `/tg?next=` ro'yxatini kengaytirish kerak — keyinga.
- Kanal a'zoligi darvozasi (`TELEGRAM_REQUIRED_CHANNEL`) topshiriq
  tugmalariga ham tegishli — bot qolgan oqimlardagi kabi.
```

- [ ] **Step 3: ADR-0025 status line and the index**

In `docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md` change only the line `**Holati:** Qabul qilindi` to `**Holati:** Qisman almashtirildi — ADR-0078`.

In `docs/adr/README.md`: in the 0025 row change the status cell `Qabul qilindi` to `Qisman almashtirildi — ADR-0078`; after the 0076 row add:

```markdown
| [0078](0078-topshiriq-xabarlari-telegramga-darhol.md) | Topshiriq xabarlari Telegram'ga darhol, tugmalar bilan ketadi (xabar tahrirlanadi, javob — izoh yoki qaytarish sababi); 22:00–08:00 tungi tinchlik, «Shoshilinch» bundan mustasno; 20:00 yig'madan chiqdi | Qabul qilindi | <BUGUN> |
```

- [ ] **Step 4: server/CLAUDE.md**

1. «Staff in the bot…» section, the **Bot** bullet. Old text:

```md
(`staffMenuKeyboard`: Kabinet → profile, Jadval, Guruhlar, Oyligim for teachers, the student cabinet when the chat also holds a card)
```

   New text:

```md
(`staffMenuKeyboard`: Kabinet → profile, Jadval, Guruhlar, «📋 Topshiriqlarim» — a `tk:list` callback the tasks module answers, ADR-0078 — Oyligim for teachers, the student cabinet when the chat also holds a card)
```

2. «Tasks (`src/tasks/`)» section: replace the whole **Outbox** bullet with:

```md
- **Outbox** (`task-outbox.service.ts`): `scheduleTaskOutbox` rewrites the time-based rows (`REMINDER` one hour before `dueAt`, `OVERDUE` at it) on create and on assignee or due changes — an `INAPP` row and, except for «Dars bo'ldimi?», a `TELEGRAM` row per recipient. A `TELEGRAM` row that falls in the night quiet (22:00–08:00 Tashkent, `task-quiet-hours.ts`) is written for the next 08:00; an `URGENT` task's never waits. The rewrite touches `REMINDER`/`OVERDUE` only: Telegram notices held for the morning or a retry (`NOTICE`, the planned message in `payload`) stay. There is no unique key — several notices of one task may wait for one person. A per-minute cron drains `INAPP` to the bell, SSE and push, dropping rows of closed tasks and inactive users; `TaskTelegramOutbox` drains `TELEGRAM` (below). Sent rows, and rows that failed three times, older than 30 days go at 03:00 Tashkent (`TaskOutboxService.purge`). Instant events are `task.*` (`task-events.ts`, `task.assigned` carries `created: true` for a new task), fanned out by `task-notify.listener.ts` (bell) and `telegram/task-telegram.listener.ts` (Telegram) from ONE plan, `task-notify-plan.ts` (`Notice.telegram`).
```

   and add right after it:

```md
- **Telegram** (`src/tasks/telegram/`, ADR-0078; spec §6): task notices go from the main bot when they happen, not in the 20:00 digest. `TasksModule` imports `TelegramModule` (one way: `src/telegram` imports nothing from tasks; the staff menu owns only the `'tk:list'` string).
  - **Who:** `Notice.telegram` — assignees on assign / add / move / return / accept, the author on review, the removed person, author + assignees (not watchers) on a comment, watchers only on «Bajarildi» / «Bekor qilindi»; never the actor; never «Dars bo'ldimi?» (`LESSON_QUESTION`). The recipient must be a sign-in staff account whose `telegramChatId` no other live staff account shares (`staffChatOf`, `task-telegram-view.ts`), checked at send time.
  - **When:** `TaskTelegramListener` right after the commit; inside 22:00–08:00 a non-`URGENT` notice becomes a `TaskOutbox` `TELEGRAM`/`NOTICE` row for 08:00, and a transient failure a retry row (`attempts = 1`, `retry_after` or 60 s). `TaskTelegramOutbox` drains every minute at second 30, 50 rows: `REMINDER`/`OVERDUE` only while the task is open and the person still on it (`skipReason`); a 429 waits `retry_after` and ends the run; permanent/content errors kill the row (`attempts = 3`); transient ones count up to 3.
  - **Message** (`task-telegram-text.ts`, pure): headline + title + the notice's line + Bergan / Muddat / Bog'liq / Kichik qadamlar / Holat, HTML-escaped. Buttons come from the task's state and the reader: assignee «Boshladim» (NEW) and «Bajardim» (never on a `requiresPhoto` task until phase 3), author «Qabul qilish» / «Qaytarish» in review, «Qadamlar», and «Ochish» — a URL to `/tasks?task=<id>` on the reader's portal (`staffPortalFor`), host from `TELEGRAM_MINI_APP_URL` via `staffMiniAppUrl`; unset → no «Ochish». A system task gets «Ochish» only. Every notice and prompt sent is a `TaskTelegramMessage` row (`chatId`, `messageId` → `taskId`, `purpose` `NOTICE` | `RETURN_PROMPT`); the one sender is `TaskTelegramSender`.
  - **Buttons** (`TaskTelegramHandler`, registered on `TelegramService.getBot()` in `onApplicationBootstrap`, after the bot's own handlers): callback data `tk:<action>:<taskId>`, `tk:step:<stepId>`, `tk:list` (≤ 64 bytes). The chat's one live staff account (`staffOfChat`; none → «Bu topshiriq sizda emas», two → refused) acts through `TasksService` with `via: 'TELEGRAM'` — the website's policy and transitions, nothing extra. A press edits the same message (the old first line stays as the headline); a stale press answers the service's reason and redraws the task as it is now; a task the person can no longer see loses its buttons.
  - **Replies:** a text reply to a `NOTICE` message is a comment, to a `RETURN_PROMPT` the return reason. A photo, file or voice reply gets «Hozircha faqat matnli javob…» and nothing is stored (phase 3). A message that is not a reply to a mapped message, or that arrives while a scene owns the chat, goes on to the bot's own flows (`next()`).
  - **«📋 Topshiriqlarim»:** the person's open ASSIGNEE tasks except «Dars bo'ldimi?», due-date order, grouped «Muddati o'tgan / Bugun / Keyinroq», the first 10 as number buttons; a number sends the task card. «Qadamlar» turns the message into the step list (✓ toggles through `TasksService.updateStep`, «Orqaga» goes back).
```

3. «Notifications (4 channels)», item 4. In the line starting `4. **Telegram** — queued for the 20:00 digest`, replace the sentence `Closing a bell row does not touch Telegram.` with:

```md
Task notices are not here: `src/tasks/telegram/` sends them itself (Tasks → Telegram, ADR-0078). Closing a bell row does not touch Telegram.
```

4. «Telegram digest» section, the **Instant by design** bullet. Old text: `the 21:00 report, product news and auto-pause messages.` New text:

```md
the 21:00 report, product news, auto-pause messages, and task notices (`src/tasks/telegram/`, ADR-0078 — night quiet 22:00–08:00, `URGENT` exempt).
```

- [ ] **Step 5: The user guide**

`client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, section «Xabarlar va eslatma»: replace the sentence `Telegramga topshiriq xabarlari hozircha yuborilmaydi.` with `Telegram bog'langan bo'lsa, xabar botga ham darhol keladi (pastda).` Then add a new section right before `## Izoh yozish`:

```mdx
## Telegram'da

Telegram'ingiz botga bog'langan bo'lsa, topshiriq xabarlari botga darhol keladi.

- **Kimga nima keladi.** Sizga topshiriq berilsa yoki qo'shilsangiz — «Yangi topshiriq» (yoki «Siz topshiriqqa qo'shildingiz»). Tekshiruvga kelganda — beruvchiga. Qabul qilinganda yoki qaytarilganda — ijrochiga. Yangi izoh — beruvchi va ijrochilarga (yozgan odamdan tashqari). Muddatga 1 soat qolganda — ijrochiga, muddat o'tganda — ijrochi va beruvchiga. Kuzatuvchiga faqat «Bajarildi» va «Bekor qilindi». «Dars bo'ldimi?» botga yuborilmaydi.
- **Tugmalar.** «Boshladim», «Bajardim», «Qabul qilish», «Qaytarish», «Qadamlar», «Ochish». Tugmani bossangiz, yangi xabar kelmaydi — o'sha xabarning o'zi yangilanadi. «Ochish» topshiriqni saytda ochadi. Rasm bilan tasdiqlanadigan topshiriqda «Bajardim» tugmasi yo'q: rasm saytda qo'shiladi.
- **Javob yozish.** Topshiriq xabariga javob qilib yozilgan matn topshiriqqa izoh bo'lib tushadi, bot «Topshiriqqa qo'shildi» deydi. «Qaytarish» ni bossangiz, bot sababni so'raydi — javobingiz qaytarish sababi bo'ladi. Rasm, fayl va ovozli xabar hozircha qabul qilinmaydi.
- **«📋 Topshiriqlarim».** Bot menyusidagi tugma ochiq topshiriqlaringizni «Muddati o'tgan», «Bugun», «Keyinroq» bo'yicha ko'rsatadi; raqamni bossangiz, topshiriq tugmalari bilan keladi. «Qadamlar» tugmasi bilan qadamlarni shu yerning o'zida belgilaysiz.
- **Tungi tinchlik.** Soat 22:00 dan 08:00 gacha tayyor bo'lgan xabar ertalab 08:00 da keladi. «Shoshilinch» topshiriq xabari kechasi ham darhol keladi.
- Telegram'i bog'lanmagan xodimga bot hech narsa yubormaydi; ijrochi tanlashda uning yonida «Telegram ulanmagan» belgisi turadi.
```

`client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx`, the line starting `1. Botga /start yuboring. Bot xodim menyusini chiqaradi:` — replace `«💼 Kabinet», «📅 Jadval», «👥 Guruhlar» va o'qituvchida «💰 Oyligim».` with `«💼 Kabinet», «📅 Jadval», «👥 Guruhlar», «📋 Topshiriqlarim» va o'qituvchida «💰 Oyligim».`

`client/src/qollanma/sahifalar/boshlash.ts`, the entry `sahifa: "topshiriqlar"`: add `"0078"` to its `adr` array (→ `["0054", "0063", "0074", "0078"]`), add `"telegram"` and `"topshiriqlarim"` to `kalitSozlar`, and append to `qisqacha` the sentence ` Topshiriq xabarlari Telegram botga ham darhol keladi (kechasi — ertalab 08:00 da), tugmalar va javob bilan.`

`client/src/qollanma/yangiliklar.ts` — new first entry of the array:

```ts
  {
    sana: "<BUGUN>",
    sarlavha: "Topshiriqlar Telegram'da",
    matn: "Topshiriq xabarlari endi Telegram botga darhol keladi, kechqurungi umumiy xabarni kutmaydi: sizga berilganda, tekshiruvga kelganda, qabul qilinganda yoki qaytarilganda, yangi izoh yozilganda, muddatga 1 soat qolganda va muddat o'tganda. Xabar ostida tugmalar bor: «Boshladim», «Bajardim», «Qabul qilish», «Qaytarish», «Qadamlar», «Ochish». Tugma bosilganda yangi xabar kelmaydi, o'sha xabar yangilanadi. Xabarga javob qilib yozilgan matn topshiriqqa izoh bo'lib tushadi; «Qaytarish» dan keyingi javob — qaytarish sababi. Bot menyusida yangi «📋 Topshiriqlarim» tugmasi ochiq topshiriqlaringizni ko'rsatadi. Soat 22:00 dan 08:00 gacha tayyor bo'lgan xabar ertalab 08:00 da keladi, «Shoshilinch» topshiriq xabari esa darhol. Kuzatuvchiga botda faqat «Bajarildi» va «Bekor qilindi» keladi. Rasm, fayl va ovozli javob hozircha qabul qilinmaydi.",
    rollar: [1, 2, 3, 4, 5],
    sahifa: { bolim: "boshlash", sahifa: "topshiriqlar" },
  },
```

- [ ] **Step 6: Client checks (no Prettier on client)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx vitest run src/qollanma
```

Expected: PASS (`reyestr.test.ts` accepts `"0078"`). If `npx vitest run` fails with `configLoader: 'native'`, use `npx vitest --config vitest.config.ts run src/qollanma`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add docs/adr/0078-topshiriq-xabarlari-telegramga-darhol.md docs/adr/0025-telegram-xabarlari-kunlik-navbatga-jamlanadi.md docs/adr/README.md server/CLAUDE.md client/src/qollanma/kontent/boshlash/topshiriqlar.mdx client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/yangiliklar.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "docs(tasks): ADR-0078 Telegram task notices, guide and news" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

**Files:** none new; fixes only where a gate fails (each fix in its own commit with the failing gate named in the message).

- [ ] **Step 1: Server gate — sequential, never two at once**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup diff --name-only origin/main -- server | grep '\.ts$'
```

Run `npx prettier --check` on exactly the listed files (paths relative to `server/`, i.e. drop the `server/` prefix). Then, one after another:

```bash
npx eslint src --quiet
npm test
npm run typecheck
npm run build
```

Expected: no prettier diffs, 0 eslint errors, every suite green (including `event-wiring.spec.ts`, `task-write.single-source.spec.ts`, `direct-send.guard.spec.ts`), typecheck and build clean.

- [ ] **Step 2: Client gate (no Prettier)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```

Expected: all clean (fallback for vitest as in Task 10 Step 6).

- [ ] **Step 3: Self-check against the spec**

Confirm by reading the diff once: no `TASK_*` digest enqueue anywhere (guard spec), no `prisma.task*.create|update|delete` outside `src/tasks/`, no `sendMessage(` outside the ALLOWED list, no English word in any new Uzbek string, every Tashkent time through `tashkent.ts`.

- [ ] **Step 4: Hand the CEO the manual bot check list (below)**

It cannot be automated (a real bot and real chats). Paste it into the PR description.

---

## Deploy order

1. **Server** (Railway `caring-courage`, production) — the deploy applies `20261010190000_task_telegram` (enum value, `TaskOutbox.payload`, unique key → index, `TaskTelegramMessage`). No data script: existing `INAPP` rows are untouched; Telegram rows appear for tasks whose due date is set or changed from now on (a task created before the deploy gets its Telegram reminder only if its due date is changed — acceptable, said in the PR).
2. **Vercel** — only the guide and the news changed; deploy after the server.
3. Rollback: the previous server build works on the new schema (it ignores `NOTICE` rows and `TaskTelegramMessage`; its `createMany(skipDuplicates)` does not need the dropped unique key).

## Manual bot check list (CEO session, after the server deploy)

Use two staff accounts linked to the bot (an author and an assignee) in daytime.

1. Give a task with a due date, two steps and a link to a group → the assignee gets «Yangi topshiriq · <muhimlik>» with Bergan / Muddat / Bog'liq / Kichik qadamlar 0/2 and «Boshladim · Bajardim / Qadamlar / Ochish».
2. «Boshladim» → the SAME message changes: «Holat: Jarayonda», «Boshladim» gone. The website's history shows the status row (via Telegram).
3. «Qadamlar» → the step list; tick one → «✓ 1. …», the website shows it ticked; «Orqaga» → the card.
4. «Bajardim» → the author gets «Tekshiruvga keldi» with «Qabul qilish · Qaytarish». «Qaytarish» → the bot sends a NEW message naming the task and asking for the reason (the card is not edited); reply to it «Doska artilmagan» → «Topshiriq qaytarildi. … ga xabar ketdi.»; the assignee gets «Topshiriq qaytarildi» with the reason and «Bajardim».
5. Reply with text to a task notice or card (not to the «Qaytarish» prompt, whose reply is the return reason) → «Topshiriqqa qo'shildi.» and the comment is on the website; reply with a photo → «Hozircha faqat matnli javob…», nothing on the website.
6. Cancel the task on the website, then press an old button → an alert with the reason and the message redrawn without action buttons.
7. Remove the assignee on the website → they get «Topshiriqdan olib tashlandingiz»; their old buttons answer «Bu topshiriq sizda emas» and disappear.
8. `/start` → the staff menu has «📋 Topshiriqlarim»; it lists open tasks under «Muddati o'tgan / Bugun / Keyinroq» (by due date, not by class group); a number sends the card with its buttons as a NEW message and the list stays.
9. A task with «Rasm bilan tasdiqlansin» → no «Bajardim», the line «Rasm bilan tasdiqlanadi.» (shown to the assignee only; no upload exists anywhere until phase 3).
10. «Ochish» opens `/tasks?task=<id>` on admin. (or lehrer. for a teacher). With `TELEGRAM_MINI_APP_URL` unset (or on a non-`student.` host) there is no «Ochish» button at all.
11. After 22:00 give a «O'rta» task → nothing at night, the message comes at 08:00; give a «Shoshilinch» one → it comes at once.
12. «Dars bo'ldimi?» never appears in the bot or in «Topshiriqlarim».
13. While in the `/xodim` linking flow (or any other bot flow), reply to a task message → «Topshiriqqa qo'shildi.», the comment is on the website: the task slot runs before the scenes (A5), so a reply to a task message becomes a comment even inside a flow. An ordinary message (not a reply to a task message) during the flow still goes to the flow.
14. An account with no Telegram gets nothing in the bot and shows «Telegram ulanmagan» in the assignee picker. The same for two staff accounts linked to ONE chat (an inactive one counts too): neither gets a notice, and a button press from that chat answers «Bu Telegram bir nechta xodim hisobiga bog'langan…».
