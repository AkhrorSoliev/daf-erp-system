# Topshiriqlar — 4a-bosqich «Avtomatik topshiriqlar» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The system gives three kinds of tasks by itself — «Buzilgan va'da» (one per student whose promise the 09:00 cron breaks), «Qayta qo'ng'iroq» (one per call log with a «Keyingi bog'lanish sanasi») and «Qo'ng'iroqsiz lid» (one per new lead nobody called for 24 hours) — each closed only by its source, shown with a source card and one working button, and counted in one line of the 21:00 report.

**Architecture:** Every rule (kind, priority, source key, texts, who, when, closing events) lives in ONE file, `server/src/tasks/task-auto-rules.ts`. Two writers in `task-auto-write.ts` — `createSystemTask` (author Tizim, one open task per `sourceKey`, time rows through `scheduleTaskOutbox`) and `autoCloseTasks` (DONE + `AUTO_CLOSED` event with `meta.reason`) — are the only code that touches `Task*` rows for these kinds. Creators: `TaskAutoService` (events `payment-promise.overdue`, new `call-log.created`) and `TaskAutoLeadsService` (hourly cron). The ONE closing listener, `TaskAutoCloseListener`, hears `payment.received`, `call-log.created`, new `lead.called` and `entity.status.changed` (Lead) and emits the new `task.auto-closed`, which the bell resolver and the SSE refresh hear. Bell and Telegram notices come from the existing `task.assigned` path (phases 1, 2, 5); only the Telegram headline and the callback's 08:00 hold are new. `GET /tasks/:id` gains `source`; the client drawer renders it as a card with «Qo'ng'iroqni yozish» (the existing `LogCallDialog`) or «Lidni ochish».

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@nestjs/event-emitter`, `@nestjs/schedule`, Jest. Client: Next.js 16, React 19 (React Compiler), zustand, vitest.

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §7 (table), §6.6, §4 screen 5 (the 21:00 line) and screen 10 (system task card), §9.6 (cron), §13 (`task-auto.spec.ts`). Recurrence (§3.6) is NOT here — that is plan 4b. «Dars bo'ldimi?» (`LESSON_QUESTION`, `lesson-task.ts`) is not changed.

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup` (branch `feat/topshiriqlar-4-avtomatika`). Never `cd` to the main checkout or `/tmp`; use absolute paths inside the worktree. Plain bash commands, no shell variables.
- **Never touch a database** except the throwaway one in Task 11. The dev DB in `server/.env` is shared and behind; prod is off-limits. Never run `prisma migrate deploy|dev|resolve`, `db push`, `db execute`. The migration SQL is produced offline (schema-to-schema diff, Task 1). `npx prisma generate` is the only Prisma command that runs.
- Migration timestamp `20261011090000` — later than `20261010190000_task_telegram`, the newest on `origin/main` (fde0be43). Recheck at PR time.
- UI and bot text: Uzbek, Latin script only, no English words. In JSX, put text with an apostrophe in a JS string (`{"Qo'ng'iroqni yozish"}` or a constant), never `&apos;`.
- Server: `npx prettier --write <touched .ts files>` before every commit. **Client: never run Prettier.** React Compiler: no prop or state mutation.
- Dates: Tashkent only through `server/src/common/date/tashkent.ts` (`tashkentDateStr`, `utcMidnightFromDateStr`, `dayOfWeekForDateStr`, `TASHKENT_OFFSET_MS`); client through `client/src/lib/tashkent-time.ts` (`tashkentDdMm`, `tashkentHhmm`). Never `setHours` / local time.
- Every user recipient or assignee: `deletedAt: null`, `isActive: true`, `status: ACTIVE`.
- Every write to a `Task*` table stays inside `src/tasks/` (`task-write.single-source.spec.ts`). `src/common/event-wiring.spec.ts` stays green: every new event has an emitter AND a listener in the same task that adds it; new events are emitted after the write is committed.
- New files ≤ 500 lines. No real credentials in the repo (it is public). No new env var.
- Commits: English message; trailer as a second `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Use `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add <repo-relative paths>` then `git -C … commit`.
- Server gate per task (from `server/`): `npx prettier --write <files>` → `npx eslint <files> --quiet` → `npx jest <specs>` → `npm run typecheck`. Never run `npm run build` and `npm test` at the same time.
- ADR number: **0080** is the next free number on `origin/main` today (0079 = imkoniyat) — **recheck `docs/adr/README.md` at PR time** and renumber with `git mv` if `main` took it.

---

## Design decisions (not dictated by the spec or the controller)

1. **Start instant for «Qo'ng'iroqsiz lid»: a column, `Company.uncalledLeadTasksFrom DateTime @default(now())`.** Postgres fills the existing company rows with the moment the `ALTER TABLE` runs (the deploy), and a new company gets its creation time — so the 57 waiting leads never get a task, nobody has to type a deploy date into the code, and the settings page gets no stray key. A constant date was rejected (the deploy day is not known when the code is written; a date earlier than the deploy would task old leads), a `Setting` row too (a key in the settings list nobody may edit, plus a data step).
2. **No change to `TasksService`** (already 533 lines). The system writers live in `task-auto-write.ts`, inside `src/tasks/`, the same way `lesson-task.ts` writes «Dars bo'ldimi?»: no caller to check, no author. They still go through `scheduleTaskOutbox` and emit the ordinary `task.assigned` (`actorId: null`, `created: true`), so the bell, push, SSE and Telegram need nothing new.
3. **A due time already past moves to the next working day 18:00** (`systemDueAt`): the 18:00 lead run, a callback logged after 18:00 for today, a callback day on a Sunday or branch holiday. A task is never born overdue.
4. **Bell at once, Telegram at 08:00 of the callback day.** The callback is a task from the moment it is logged (the board and the «Topshiriqlar» panel show it with its date); holding the bell would need a new in-app outbox kind for one rule. Telegram, which pings the phone, waits: `telegramNotBefore` returns 08:00 Tashkent of the due day for `CALLBACK`, and `TaskTelegramListener` holds the notice in the existing `TaskOutbox` `NOTICE` row (the drain drops it if the task closed meanwhile).
5. **Telegram headline for a system task: «Tizim topshirig'i · <muhimlik>»** (spec §6.1 row «Tizim topshirig'i»); it still gets «Ochish» only.
6. **A new event `task.auto-closed { task, reason }`** is what the bell resolver hears to close the task's notices and what `TaskNotifyListener` turns into the SSE `task.updated` refresh. No bell notice is written for it.
7. **The hourly lead run also sweeps:** an open «Qo'ng'iroqsiz lid» task whose lead no longer waits (called, not NEW, archived — including a whole section archived, which emits no event) is closed with reason `LEAD_GONE`. Events stay the main path; the sweep is the backstop.
8. **Callback reason:** «Qo'ng'iroqni yozish» opens `LogCallDialog` with the original call's `reason` for a callback, `DEBT` for a broken promise.
9. **The 21:00 line is its own line above «🚩 Diqqat», not a flag**: system tasks are overdue most evenings, and a flag would turn every day 🟡. It reads `📋 Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K`; no line when M = 0; a failing query drops the line, never the report.
10. **Priorities:** «Buzilgan va'da» `HIGH`, «Qo'ng'iroqsiz lid» `HIGH`, «Qayta qo'ng'iroq» `MEDIUM`. Titles: «Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm», «Qayta qo'ng'iroq: Rahimov Aziz», «Lidga qo'ng'iroq qilinmagan: Karimova Dilnoza».
11. **A lead with no branch** goes to the company's administrators (then directors, then CEOs). The departed-employee listener still reassigns a branch-less system task to nobody (unchanged; new leads always have a branch since the per-branch board).
12. **ADR-0080** (short): the 09:00 list stops going to administrators — that reverses part of #683 / ADR-0076's audience — and the three rules are product decisions.

## File Structure

**Server — new**
- `server/prisma/migrations/20261011090000_task_auto_lead_start/migration.sql` — one column.
- `server/src/call-logs/call-log-events.ts` — `CALL_LOG_CREATED`, `CallLogCreatedPayload`.
- `server/src/leads/lead-events.ts` — `LEAD_CALLED`, `LeadCalledPayload`.
- `server/src/tasks/task-auto-rules.ts` (+ `.spec.ts`) — the rules: kinds, priorities, source keys, closing events, texts, due, window, who.
- `server/src/tasks/task-auto-write.ts` (+ `.spec.ts`) — `createSystemTask`, `autoCloseTasks`.
- `server/src/tasks/task-auto-close.listener.ts` (+ `.spec.ts`) — `TaskAutoCloseListener`.
- `server/src/tasks/task-auto.service.ts` + `server/src/tasks/task-auto.spec.ts` — `TaskAutoService` (promise, callback), claim.
- `server/src/tasks/task-auto-leads.service.ts` (+ `.spec.ts`) — `TaskAutoLeadsService` (hourly cron + sweep).
- `server/src/tasks/task-source.ts` (+ `.spec.ts`) — `loadTaskSource` for the sheet.
- `server/src/tasks/task-report-figures.ts` (+ `.spec.ts`) — the 21:00 figures.
- `server/src/telegram-groups/utils/task-line.util.ts` (+ `.spec.ts`) — the 21:00 line text.
- `docs/adr/0080-avtomatik-topshiriqlar.md`.

**Server — modified**
- `server/prisma/schema.prisma` (model `Company`).
- `server/src/tasks/task-events.ts` — `AUTO_CLOSED`, `TaskAutoClosedPayload`.
- `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts` — three providers.
- `server/src/tasks/task-notify.listener.ts` (+ spec) — hears `task.auto-closed` (SSE only).
- `server/src/notifications/notification-resolver.service.ts` (+ spec) — hears `task.auto-closed`.
- `server/src/notifications/notification-events.listener.ts` (+ spec) — 09:00 list to CEOs only.
- `server/src/call-logs/call-logs.service.ts` (+ spec) — emits `call-log.created`.
- `server/src/leads/leads.service.ts` (+ spec) — emits `lead.called`.
- `server/src/tasks/telegram/task-telegram-text.ts` (+ spec), `server/src/tasks/telegram/task-telegram.listener.ts` (+ spec).
- `server/src/tasks/tasks-read.service.ts` (+ spec) — `detail` returns `source`.
- `server/src/telegram-groups/telegram-group-daily-report.service.ts` (+ spec).
- `server/CLAUDE.md`, `docs/adr/README.md`.

**Client — new**
- `client/src/components/tasks/task-source-rules.ts` (+ `.test.ts`), `client/src/components/tasks/task-source-card.tsx`.

**Client — modified**
- `client/src/hooks/use-tasks.ts` (types), `client/src/components/tasks/task-drawer.tsx`, `client/src/components/tasks/task-feed-text.ts` (+ test), `client/CLAUDE.md`, `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/yangiliklar.ts`.

Routes do not change (only the body of `GET /tasks/:id` grows), so no controller or role spec changes.

---

### Task 1: The rules file, the two event names, the lead start column

**Files:**
- Modify: `server/prisma/schema.prisma` (model `Company`, ~line 1720)
- Create: `server/prisma/migrations/20261011090000_task_auto_lead_start/migration.sql`
- Create: `server/src/call-logs/call-log-events.ts`, `server/src/leads/lead-events.ts`
- Create: `server/src/tasks/task-auto-rules.ts`, `server/src/tasks/task-auto-rules.spec.ts`

**Interfaces:**
- Consumes: `lessonTaskAssigneeIds(tx, companyId, branchId)`, `nextWorkingDay(dateStr, holidays)` (`lesson-task.ts`); `defaultDueAt(dateStr)`, `shiftSystemDueAt(dueAt, holidays)` (`task-due.ts`); `formatSom(n)` (`payments/shared/format-som.ts`).
- Produces (later tasks rely on these exact names):
  - `CALL_LOG_CREATED = 'call-log.created'`, `interface CallLogCreatedPayload { callLog: CallLog }`
  - `LEAD_CALLED = 'lead.called'`, `interface LeadCalledPayload { leadId: string; companyId: number }`
  - `type AutoKind = 'BROKEN_PROMISE' | 'CALLBACK' | 'UNCALLED_LEAD'`, `AUTO_KINDS: readonly AutoKind[]`
  - `AUTO_RULES: Record<AutoKind, { priority; entityType: 'Student' | 'Lead'; sourcePrefix; closesOn: readonly string[] }>`
  - `sourceKeyOf(kind: AutoKind, id: string): string`, `kindsClosedBy(event: string): AutoKind[]`
  - `type AutoCloseReason = 'PAYMENT_RECEIVED' | 'CALL_LOGGED' | 'LEAD_CALLED' | 'LEAD_STATUS_CHANGED' | 'LEAD_GONE'`
  - `UNCALLED_LEAD_AGE_MS: number`, `UNCALLED_LEAD_WHERE: Prisma.LeadWhereInput`, `uncalledLeadWindowOpen(now: Date): boolean`
  - `systemDueAt(dateStr: string, holidays: ReadonlySet<string>, now: Date): Date`
  - `telegramNotBefore(kind: TaskKind, dueAt: Date | null): Date | null`
  - `autoTaskAssigneeIds(db, companyId: number, branchId: number | null): Promise<number[]>`, `callbackAssigneeIds(db, companyId: number, userId: number): Promise<number[]>`
  - `studentName({ firstName, lastName }): string`, `brokenPromiseText(...)`, `callbackText(...)`, `uncalledLeadText(...)` → `{ title: string; description: string | null }`
  - Prisma: `Company.uncalledLeadTasksFrom: Date`

- [ ] **Step 1: Write the failing test** — `server/src/tasks/task-auto-rules.spec.ts`

```ts
import {
  AUTO_RULES,
  autoTaskAssigneeIds,
  brokenPromiseText,
  callbackAssigneeIds,
  callbackText,
  kindsClosedBy,
  sourceKeyOf,
  studentName,
  systemDueAt,
  telegramNotBefore,
  uncalledLeadText,
  uncalledLeadWindowOpen,
} from './task-auto-rules';

const NONE = new Set<string>();
const at = (iso: string) => new Date(iso);
// 2026-10-09 is a Friday, 10-10 Saturday, 10-11 Sunday, 10-12 Monday.

describe('systemDueAt — 18:00 Tashkent, never past, never on a closed day', () => {
  it('a working day before 18:00 → that day 18:00', () => {
    expect(
      systemDueAt('2026-10-12', NONE, at('2026-10-12T04:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('18:00 itself → the next working day (Saturday → Monday)', () => {
    expect(
      systemDueAt('2026-10-10', NONE, at('2026-10-10T13:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('a Sunday moves to Monday', () => {
    expect(
      systemDueAt('2026-10-11', NONE, at('2026-10-09T06:00:00Z')).toISOString(),
    ).toBe('2026-10-12T13:00:00.000Z');
  });
  it('a branch holiday is skipped', () => {
    expect(
      systemDueAt(
        '2026-10-12',
        new Set(['2026-10-12']),
        at('2026-10-09T06:00:00Z'),
      ).toISOString(),
    ).toBe('2026-10-13T13:00:00.000Z');
  });
});

describe('uncalledLeadWindowOpen — 08:00–18:00 Monday–Saturday, Tashkent', () => {
  it.each([
    ['2026-10-12T02:59:00Z', false], // Mon 07:59
    ['2026-10-12T03:00:00Z', true], // Mon 08:00
    ['2026-10-12T13:00:00Z', true], // Mon 18:00
    ['2026-10-12T14:00:00Z', false], // Mon 19:00
    ['2026-10-10T13:00:00Z', true], // Sat 18:00
    ['2026-10-11T05:00:00Z', false], // Sun 10:00
  ])('%s → %s', (iso, open) => {
    expect(uncalledLeadWindowOpen(at(iso))).toBe(open);
  });
});

describe('telegramNotBefore', () => {
  it("a callback's Telegram notice waits for 08:00 of its due day", () => {
    expect(
      telegramNotBefore('CALLBACK', at('2026-10-14T13:00:00Z'))?.toISOString(),
    ).toBe('2026-10-14T03:00:00.000Z');
  });
  it('every other task goes when it is ready', () => {
    expect(
      telegramNotBefore('BROKEN_PROMISE', at('2026-10-14T13:00:00Z')),
    ).toBeNull();
    expect(telegramNotBefore('MANUAL', null)).toBeNull();
  });
});

describe('sources and closing events', () => {
  it('one key per source', () => {
    expect(sourceKeyOf('BROKEN_PROMISE', 'p1')).toBe('promise:p1');
    expect(sourceKeyOf('CALLBACK', 'c1')).toBe('calllog:c1');
    expect(sourceKeyOf('UNCALLED_LEAD', 'l1')).toBe('lead:l1');
  });
  it('spec §7: who closes what', () => {
    expect(kindsClosedBy('payment.received')).toEqual([
      'BROKEN_PROMISE',
      'CALLBACK',
    ]);
    expect(kindsClosedBy('call-log.created')).toEqual([
      'BROKEN_PROMISE',
      'CALLBACK',
    ]);
    expect(kindsClosedBy('lead.called')).toEqual(['UNCALLED_LEAD']);
    expect(kindsClosedBy('entity.status.changed')).toEqual(['UNCALLED_LEAD']);
    expect(kindsClosedBy('task.assigned')).toEqual([]);
  });
  it('a student task links to the student, a lead task to the lead', () => {
    expect(AUTO_RULES.BROKEN_PROMISE.entityType).toBe('Student');
    expect(AUTO_RULES.CALLBACK.entityType).toBe('Student');
    expect(AUTO_RULES.UNCALLED_LEAD.entityType).toBe('Lead');
  });
});

describe('texts', () => {
  it('names a student surname first', () => {
    expect(studentName({ firstName: 'Aziz', lastName: 'Rahimov' })).toBe(
      'Rahimov Aziz',
    );
  });
  it('a broken promise: debt in the title, the promise in the description', () => {
    expect(
      brokenPromiseText({
        name: 'Rahimov Aziz',
        debt: 450_000,
        promiseDate: at('2026-10-09T18:59:59.999Z'),
        promisedAmount: 200_000,
        comment: 'Oylik kelganda',
      }),
    ).toEqual({
      title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
      description:
        "Va'da sanasi: 09.10.2026\nVa'da summasi: 200 000 so'm\nIzoh: Oylik kelganda",
    });
    expect(
      brokenPromiseText({
        name: 'Rahimov Aziz',
        debt: 1_000,
        promiseDate: at('2026-10-09T18:59:59.999Z'),
        promisedAmount: null,
        comment: null,
      }).description,
    ).toBe("Va'da sanasi: 09.10.2026");
  });
  it('a callback carries the note of the call that asked for it', () => {
    expect(callbackText({ name: 'Rahimov Aziz', note: ' Ertaga qayta ' })).toEqual({
      title: "Qayta qo'ng'iroq: Rahimov Aziz",
      description: "Oldingi qo'ng'iroq izohi: Ertaga qayta",
    });
    expect(callbackText({ name: 'Rahimov Aziz', note: null }).description).toBeNull();
  });
  it('an uncalled lead', () => {
    expect(uncalledLeadText({ name: 'Karimova Dilnoza' })).toEqual({
      title: "Lidga qo'ng'iroq qilinmagan: Karimova Dilnoza",
      description: null,
    });
  });
});

describe('who', () => {
  it("a branch's task: the lesson-question ladder of that branch", async () => {
    const db = { user: { findMany: jest.fn().mockResolvedValueOnce([{ id: 3 }, { id: 4 }]) } };
    expect(await autoTaskAssigneeIds(db as any, 7, 2)).toEqual([3, 4]);
    expect(db.user.findMany.mock.calls[0][0].where.branches).toEqual({
      some: { branchId: 2 },
    });
  });
  it('no branch: the company administrators, then directors, then CEOs', async () => {
    const db = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ id: 1 }]),
      },
    };
    expect(await autoTaskAssigneeIds(db as any, 7, null)).toEqual([1]);
    const wheres = db.user.findMany.mock.calls.map(([a]) => a.where);
    expect(wheres.map((w) => w.roles.some.role.name)).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
    ]);
    for (const w of wheres) {
      expect(w).toMatchObject({
        companyId: 7,
        deletedAt: null,
        isActive: true,
        status: 'ACTIVE',
      });
      expect(w.branches).toBeUndefined();
    }
  });
  it('a callback goes to the caller while they are an active employee', async () => {
    const db = { user: { findFirst: jest.fn().mockResolvedValueOnce({ id: 9 }).mockResolvedValueOnce(null) } };
    expect(await callbackAssigneeIds(db as any, 7, 9)).toEqual([9]);
    expect(await callbackAssigneeIds(db as any, 7, 9)).toEqual([]);
    expect(db.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 9,
      companyId: 7,
      deletedAt: null,
      isActive: true,
      status: 'ACTIVE',
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run (from `server/`): `npx jest src/tasks/task-auto-rules.spec.ts`
Expected: FAIL — `Cannot find module './task-auto-rules'`.

- [ ] **Step 3: The two event-name files**

`server/src/call-logs/call-log-events.ts`:

```ts
import type { CallLog } from '@prisma/client';

/** A call log row was written (`CallLogsService.create`; no transaction around it). */
export const CALL_LOG_CREATED = 'call-log.created';

export interface CallLogCreatedPayload {
  callLog: CallLog;
}
```

`server/src/leads/lead-events.ts`:

```ts
/** A lead got its «called» mark for the first time (`PATCH /leads/:id/called`). */
export const LEAD_CALLED = 'lead.called';

export interface LeadCalledPayload {
  leadId: string;
  companyId: number;
}
```

(Neither is emitted or heard yet; Task 3 wires both sides in one commit, so `event-wiring.spec.ts` stays green.)

- [ ] **Step 4: The rules file** — `server/src/tasks/task-auto-rules.ts`

```ts
import {
  Prisma,
  UserStatus,
  type TaskKind,
  type TaskPriority,
} from '@prisma/client';
import {
  TASHKENT_OFFSET_MS,
  dayOfWeekForDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { formatSom } from '../payments/shared/format-som';
import { CALL_LOG_CREATED } from '../call-logs/call-log-events';
import { LEAD_CALLED } from '../leads/lead-events';
import { lessonTaskAssigneeIds, nextWorkingDay } from './lesson-task';
import { defaultDueAt, shiftSystemDueAt } from './task-due';

type Db = Prisma.TransactionClient;

/**
 * Automatic tasks (spec 2026-10-07 §7) — every rule in this one file: kind,
 * priority, source key, the events that close it, the texts, who, when.
 * «Dars bo'ldimi?» (LESSON_QUESTION) keeps its own file, `lesson-task.ts`.
 * Adding a kind = an entry in AUTO_RULES, its text below, its creator in
 * `task-auto*.service.ts`.
 */
export type AutoKind = 'BROKEN_PROMISE' | 'CALLBACK' | 'UNCALLED_LEAD';
export const AUTO_KINDS: readonly AutoKind[] = [
  'BROKEN_PROMISE',
  'CALLBACK',
  'UNCALLED_LEAD',
];

interface AutoRule {
  priority: TaskPriority;
  /** What the task links to: the «Topshiriqlar» panel and the source card read it. */
  entityType: 'Student' | 'Lead';
  /** `sourceKey` = `<prefix>:<id>`; one OPEN task per key (`task_open_source_unique`). */
  sourcePrefix: 'promise' | 'calllog' | 'lead';
  /** The events that close it (`TaskAutoCloseListener`). Nothing else does. */
  closesOn: readonly string[];
}

export const AUTO_RULES: Record<AutoKind, AutoRule> = {
  BROKEN_PROMISE: {
    priority: 'HIGH',
    entityType: 'Student',
    sourcePrefix: 'promise',
    closesOn: ['payment.received', CALL_LOG_CREATED],
  },
  CALLBACK: {
    priority: 'MEDIUM',
    entityType: 'Student',
    sourcePrefix: 'calllog',
    closesOn: ['payment.received', CALL_LOG_CREATED],
  },
  UNCALLED_LEAD: {
    priority: 'HIGH',
    entityType: 'Lead',
    sourcePrefix: 'lead',
    closesOn: [LEAD_CALLED, 'entity.status.changed'],
  },
};

export const sourceKeyOf = (kind: AutoKind, id: string): string =>
  `${AUTO_RULES[kind].sourcePrefix}:${id}`;

export const kindsClosedBy = (event: string): AutoKind[] =>
  AUTO_KINDS.filter((k) => AUTO_RULES[k].closesOn.includes(event));

/** `TaskEvent.meta.reason` of an automatic close; the client words it (task-feed-text.ts). */
export type AutoCloseReason =
  | 'PAYMENT_RECEIVED'
  | 'CALL_LOGGED'
  | 'LEAD_CALLED'
  | 'LEAD_STATUS_CHANGED'
  | 'LEAD_GONE';

// ---------- when ----------

/** A lead waits this long without a call before it becomes a task. */
export const UNCALLED_LEAD_AGE_MS = 24 * 3_600_000;

/** A lead that still waits for its first call. */
export const UNCALLED_LEAD_WHERE: Prisma.LeadWhereInput = {
  calledAt: null,
  statusEnum: 'NEW',
  deletedAt: null,
};

/** Spec §9.6: the lead run works 08:00–18:00, Monday–Saturday (Tashkent). */
export function uncalledLeadWindowOpen(now: Date): boolean {
  const hour = new Date(now.getTime() + TASHKENT_OFFSET_MS).getUTCHours();
  return (
    dayOfWeekForDateStr(tashkentDateStr(now)) !== 0 && hour >= 8 && hour <= 18
  );
}

/**
 * 18:00 Tashkent on `dateStr`, moved off a Sunday or a branch holiday; one
 * that is already past (the 18:00 run, a callback logged in the evening for
 * today) moves to the next working day 18:00. A task is never born overdue.
 */
export function systemDueAt(
  dateStr: string,
  holidays: ReadonlySet<string>,
  now: Date,
): Date {
  const due = shiftSystemDueAt(defaultDueAt(dateStr), holidays);
  if (due.getTime() > now.getTime()) return due;
  return defaultDueAt(nextWorkingDay(tashkentDateStr(due), holidays));
}

const TELEGRAM_FROM_HOUR = 8;

/**
 * A callback is for its own day: its Telegram notice waits for 08:00 of the
 * due day (spec §7). The bell gets it at once. Every other task: null.
 */
export function telegramNotBefore(
  kind: TaskKind,
  dueAt: Date | null,
): Date | null {
  if (kind !== 'CALLBACK' || !dueAt) return null;
  return new Date(
    utcMidnightFromDateStr(tashkentDateStr(dueAt)).getTime() +
      TELEGRAM_FROM_HOUR * 3_600_000 -
      TASHKENT_OFFSET_MS,
  );
}

// ---------- who ----------

const ACTIVE_STAFF = {
  deletedAt: null,
  isActive: true,
  status: UserStatus.ACTIVE,
};

/**
 * The branch's administrators (then directors, then CEOs) — the
 * «Dars bo'ldimi?» ladder. A source with no branch (a lead from before the
 * per-branch board) goes to the whole company's administrators the same way.
 */
export async function autoTaskAssigneeIds(
  db: Db,
  companyId: number,
  branchId: number | null,
): Promise<number[]> {
  if (branchId !== null) return lessonTaskAssigneeIds(db, companyId, branchId);
  for (const role of ['Administrator', 'Branch Director', 'CEO']) {
    const users = await db.user.findMany({
      where: { ...ACTIVE_STAFF, companyId, roles: { some: { role: { name: role } } } },
      select: { id: true },
    });
    if (users.length > 0) return users.map((u) => u.id);
  }
  return [];
}

/** A callback belongs to whoever logged the call, while they still work here. */
export async function callbackAssigneeIds(
  db: Db,
  companyId: number,
  userId: number,
): Promise<number[]> {
  const u = await db.user.findFirst({
    where: { ...ACTIVE_STAFF, id: userId, companyId },
    select: { id: true },
  });
  return u ? [u.id] : [];
}

// ---------- texts ----------

const ddmmyyyy = (d: Date) => tashkentDateStr(d).split('-').reverse().join('.');

export const studentName = (p: { firstName: string; lastName: string }) =>
  `${p.lastName} ${p.firstName}`.trim();

export function brokenPromiseText(a: {
  name: string;
  debt: number;
  promiseDate: Date;
  promisedAmount: number | null;
  comment: string | null;
}): { title: string; description: string } {
  const lines = [`Va'da sanasi: ${ddmmyyyy(a.promiseDate)}`];
  if (a.promisedAmount) {
    lines.push(`Va'da summasi: ${formatSom(a.promisedAmount)} so'm`);
  }
  const comment = a.comment?.trim();
  if (comment) lines.push(`Izoh: ${comment}`);
  return {
    title: `Va'da buzildi: ${a.name} — qarz ${formatSom(a.debt)} so'm`,
    description: lines.join('\n'),
  };
}

export function callbackText(a: {
  name: string;
  note: string | null;
}): { title: string; description: string | null } {
  const note = a.note?.trim();
  return {
    title: `Qayta qo'ng'iroq: ${a.name}`,
    description: note ? `Oldingi qo'ng'iroq izohi: ${note}` : null,
  };
}

export function uncalledLeadText(a: { name: string }): {
  title: string;
  description: string | null;
} {
  return { title: `Lidga qo'ng'iroq qilinmagan: ${a.name}`, description: null };
}
```

- [ ] **Step 5: Run the test**

Run: `npx jest src/tasks/task-auto-rules.spec.ts`
Expected: PASS.

- [ ] **Step 6: The column and the migration**

In `server/prisma/schema.prisma`, model `Company`, after `dafSariqKun`:

```prisma
  /// Automatic «Qo'ng'iroqsiz lid» tasks (spec 2026-10-07 §7, ADR-0080) are
  /// given only for leads created at or after this instant. The migration
  /// fills existing companies with the moment it runs, so leads that were
  /// already waiting never get one; a new company starts at its creation.
  uncalledLeadTasksFrom DateTime @default(now())
```

Then, offline:

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git show HEAD:server/prisma/schema.prisma > prisma/.schema-before.prisma
mkdir -p prisma/migrations/20261011090000_task_auto_lead_start
npx prisma migrate diff --from-schema prisma/.schema-before.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/20261011090000_task_auto_lead_start/migration.sql
rm prisma/.schema-before.prisma
cat prisma/migrations/20261011090000_task_auto_lead_start/migration.sql
```

If the first line is `Loaded Prisma config from prisma.config.ts.`, delete it. The file must contain exactly this statement (whitespace may differ) and nothing else — otherwise stop and report:

```sql
-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "uncalledLeadTasksFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

Add one comment line at the top of the file, above `-- AlterTable`:

```sql
-- ADR-0080: existing companies get the moment this runs, so leads created before the deploy never get a «Qo'ng'iroqsiz lid» task.
```

Then: `npx prisma generate`.

- [ ] **Step 7: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-auto-rules.ts src/tasks/task-auto-rules.spec.ts src/call-logs/call-log-events.ts src/leads/lead-events.ts
npx eslint src/tasks/task-auto-rules.ts src/tasks/task-auto-rules.spec.ts src/call-logs/call-log-events.ts src/leads/lead-events.ts --quiet
npx jest src/tasks/task-auto-rules.spec.ts src/common/event-wiring.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/prisma/schema.prisma server/prisma/migrations/20261011090000_task_auto_lead_start/migration.sql server/src/tasks/task-auto-rules.ts server/src/tasks/task-auto-rules.spec.ts server/src/call-logs/call-log-events.ts server/src/leads/lead-events.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): rules for automatic tasks and the lead start instant" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The two system writers

**Files:**
- Create: `server/src/tasks/task-auto-write.ts`, `server/src/tasks/task-auto-write.spec.ts`
- Modify: `server/src/tasks/task-events.ts`

**Interfaces:**
- Consumes: `AUTO_KINDS`, `AUTO_RULES`, `AutoKind`, `AutoCloseReason` (Task 1); `scheduleTaskOutbox` (`task-outbox.service.ts`); `TASK_CARD_SELECT` (`task-select.ts`); `toEventTask`, `TaskEventTask` (`task-events.ts`); `OPEN_STATUSES` (`task-transitions.ts`).
- Produces:
  - `TASK_EVENTS.AUTO_CLOSED = 'task.auto-closed'`, `interface TaskAutoClosedPayload { task: TaskEventTask; reason: AutoCloseReason }`
  - `interface SystemTaskInput { companyId: number; branchId: number | null; kind: AutoKind; title: string; description: string | null; dueAt: Date; entityId: string; sourceKey: string; assigneeIds: number[] }`
  - `createSystemTask(prisma: PrismaService, input: SystemTaskInput): Promise<TaskEventTask | null>`
  - `autoCloseTasks(prisma: PrismaService, where: Prisma.TaskWhereInput, reason: AutoCloseReason, now?: Date): Promise<TaskEventTask[]>`

- [ ] **Step 1: Events** — in `server/src/tasks/task-events.ts` add `import type { AutoCloseReason } from './task-auto-rules';` at the top, the member and the payload:

```ts
// in TASK_EVENTS, after DUE_CHANGED:
  /** An automatic task closed by its source (spec §7); no notice, the bell rows close. */
  AUTO_CLOSED: 'task.auto-closed',
```

```ts
// at the end of the file:
export interface TaskAutoClosedPayload {
  task: TaskEventTask;
  reason: AutoCloseReason;
}
```

(The member is neither emitted nor heard until Task 3; `event-wiring.spec.ts` only checks names that are used.)

- [ ] **Step 2: Write the failing test** — `server/src/tasks/task-auto-write.spec.ts`

```ts
import { autoCloseTasks, createSystemTask } from './task-auto-write';

const OPEN = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];
const NOW = new Date('2026-10-12T04:00:00.000Z'); // Mon 09:00 Tashkent
const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  companyId: 1,
  title: 'X',
  kind: 'BROKEN_PROMISE',
  authorId: null,
  dueAt: new Date('2026-10-12T13:00:00.000Z'),
  status: 'NEW',
  participants: [
    { userId: 3, role: 'ASSIGNEE' },
    { userId: 4, role: 'ASSIGNEE' },
  ],
  ...over,
});

function fake() {
  const tx = {
    task: {
      create: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(row({ status: 'DONE' })),
    },
    taskEvent: { create: jest.fn() },
    taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    task: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([{ id: 't1' }]),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

const input = {
  companyId: 1,
  branchId: 2,
  kind: 'BROKEN_PROMISE' as const,
  title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
  description: "Va'da sanasi: 09.10.2026",
  dueAt: new Date('2026-10-12T13:00:00.000Z'),
  entityId: '10001',
  sourceKey: 'promise:p1',
  assigneeIds: [3, 4],
};

describe('createSystemTask', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(NOW));
  afterEach(() => jest.useRealTimers());

  it("writes a Tizim task with the rule's priority and entity, its assignees and its time rows", async () => {
    const { prisma, tx } = fake();
    const t = await createSystemTask(prisma as any, input);
    expect(tx.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 1,
          branchId: 2,
          kind: 'BROKEN_PROMISE',
          priority: 'HIGH',
          authorId: null,
          entityType: 'Student',
          entityId: '10001',
          sourceKey: 'promise:p1',
          title: input.title,
          description: input.description,
          dueAt: input.dueAt,
          participants: {
            create: [
              { userId: 3, role: 'ASSIGNEE' },
              { userId: 4, role: 'ASSIGNEE' },
            ],
          },
          events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
        }),
      }),
    );
    // REMINDER at 17:00 and OVERDUE at 18:00, in-app and Telegram.
    expect(tx.taskOutbox.createMany).toHaveBeenCalled();
    expect(t).toMatchObject({ id: 't1', kind: 'BROKEN_PROMISE', authorId: null });
  });

  it('writes nothing while the source already has an open task (a re-run)', async () => {
    const { prisma } = fake();
    prisma.task.findFirst.mockResolvedValue({ id: 't0' });
    expect(await createSystemTask(prisma as any, input)).toBeNull();
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { sourceKey: 'promise:p1', status: { in: OPEN } },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes nothing when nobody can take it', async () => {
    const { prisma } = fake();
    expect(
      await createSystemTask(prisma as any, { ...input, assigneeIds: [] }),
    ).toBeNull();
    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it('a concurrent run that won the unique index is not an error', async () => {
    const { prisma } = fake();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { code: 'P2002' }),
    );
    expect(await createSystemTask(prisma as any, input)).toBeNull();
    prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('dup'), { cause: { code: '23505' } }),
    );
    expect(await createSystemTask(prisma as any, input)).toBeNull();
  });

  it('any other failure is thrown', async () => {
    const { prisma } = fake();
    prisma.$transaction.mockRejectedValueOnce(new Error('boom'));
    await expect(createSystemTask(prisma as any, input)).rejects.toThrow('boom');
  });
});

describe('autoCloseTasks', () => {
  it('closes only open automatic tasks, with the reason, and drops their unsent rows', async () => {
    const { prisma, tx } = fake();
    const closed = await autoCloseTasks(
      prisma as any,
      { companyId: 1, entityType: 'Student', entityId: '10001' },
      'PAYMENT_RECEIVED',
      NOW,
    );
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { companyId: 1, entityType: 'Student', entityId: '10001' },
          { kind: { in: ['BROKEN_PROMISE', 'CALLBACK', 'UNCALLED_LEAD'] } },
          { status: { in: OPEN } },
        ],
      },
      select: { id: true },
    });
    expect(tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: OPEN } },
      data: { status: 'DONE', closedAt: NOW },
    });
    expect(tx.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'AUTO_CLOSED',
        actorId: null,
        meta: { reason: 'PAYMENT_RECEIVED' },
        via: 'SYSTEM',
      },
    });
    expect(tx.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
    expect(closed).toEqual([expect.objectContaining({ id: 't1', status: 'DONE' })]);
  });

  it('a task someone else closed meanwhile is left alone', async () => {
    const { prisma, tx } = fake();
    tx.task.updateMany.mockResolvedValue({ count: 0 });
    expect(await autoCloseTasks(prisma as any, {}, 'LEAD_GONE', NOW)).toEqual([]);
    expect(tx.taskEvent.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `npx jest src/tasks/task-auto-write.spec.ts`
Expected: FAIL — `Cannot find module './task-auto-write'`.

- [ ] **Step 4: Implement** — `server/src/tasks/task-auto-write.ts`

```ts
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  AUTO_KINDS,
  AUTO_RULES,
  type AutoCloseReason,
  type AutoKind,
} from './task-auto-rules';
import { toEventTask, type TaskEventTask } from './task-events';
import { scheduleTaskOutbox } from './task-outbox.service';
import { TASK_CARD_SELECT } from './task-select';
import { OPEN_STATUSES } from './task-transitions';

export interface SystemTaskInput {
  companyId: number;
  branchId: number | null;
  kind: AutoKind;
  title: string;
  description: string | null;
  dueAt: Date;
  entityId: string;
  sourceKey: string;
  assigneeIds: number[];
}

const OPEN = [...OPEN_STATUSES];

/** The partial unique index `task_open_source_unique` refused a second open task. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === 'P2002' || e?.cause?.code === '23505';
}

/**
 * An automatic task, written like «Dars bo'ldimi?» (`createLessonTask`):
 * author Tizim, priority and entity type from AUTO_RULES, at most one OPEN
 * task per `sourceKey` (spec §7). Null when one is already open, when a
 * concurrent run won the index, or when nobody can take it. The caller emits
 * `task.assigned` once this returns: the rows are committed by then.
 */
export async function createSystemTask(
  prisma: PrismaService,
  input: SystemTaskInput,
): Promise<TaskEventTask | null> {
  if (input.assigneeIds.length === 0) return null;
  const existing = await prisma.task.findFirst({
    where: { sourceKey: input.sourceKey, status: { in: OPEN } },
    select: { id: true },
  });
  if (existing) return null;
  const rule = AUTO_RULES[input.kind];
  const participants = input.assigneeIds.map((userId) => ({
    userId,
    role: 'ASSIGNEE' as const,
  }));
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          kind: input.kind,
          title: input.title,
          description: input.description,
          priority: rule.priority,
          dueAt: input.dueAt,
          authorId: null,
          entityType: rule.entityType,
          entityId: input.entityId,
          sourceKey: input.sourceKey,
          participants: { create: participants },
          events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
        },
        select: TASK_CARD_SELECT,
      });
      await scheduleTaskOutbox(tx, {
        id: created.id,
        kind: input.kind,
        priority: rule.priority,
        dueAt: input.dueAt,
        authorId: null,
        participants,
      });
      return created;
    });
    return toEventTask(row);
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Closes the OPEN automatic tasks matching `where` (never a manual task or
 * «Dars bo'ldimi?»): DONE, an `AUTO_CLOSED` row with the reason, the unsent
 * reminders gone. One short transaction per task; a task another writer
 * closed meanwhile is skipped. Returns the closed tasks for `task.auto-closed`.
 */
export async function autoCloseTasks(
  prisma: PrismaService,
  where: Prisma.TaskWhereInput,
  reason: AutoCloseReason,
  now = new Date(),
): Promise<TaskEventTask[]> {
  const open = await prisma.task.findMany({
    where: {
      AND: [where, { kind: { in: [...AUTO_KINDS] } }, { status: { in: OPEN } }],
    },
    select: { id: true },
  });
  const closed: TaskEventTask[] = [];
  for (const { id } of open) {
    const row = await prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({
        where: { id, status: { in: OPEN } },
        data: { status: 'DONE', closedAt: now },
      });
      if (count === 0) return null;
      await tx.taskEvent.create({
        data: {
          taskId: id,
          type: 'AUTO_CLOSED',
          actorId: null,
          meta: { reason },
          via: 'SYSTEM',
        },
      });
      await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      return tx.task.findUnique({ where: { id }, select: TASK_CARD_SELECT });
    });
    if (row) closed.push(toEventTask(row));
  }
  return closed;
}
```

- [ ] **Step 5: Run the tests**

Run: `npx jest src/tasks/task-auto-write.spec.ts src/tasks/task-write.single-source.spec.ts src/common/event-wiring.spec.ts`
Expected: PASS (the writer is inside `src/tasks/`).

- [ ] **Step 6: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-auto-write.ts src/tasks/task-auto-write.spec.ts src/tasks/task-events.ts
npx eslint src/tasks/task-auto-write.ts src/tasks/task-auto-write.spec.ts src/tasks/task-events.ts --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-auto-write.ts server/src/tasks/task-auto-write.spec.ts server/src/tasks/task-events.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): system task writer and automatic close" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sources announce themselves; one listener closes

**Files:**
- Modify: `server/src/call-logs/call-logs.service.ts`, `server/src/call-logs/call-logs.service.spec.ts`
- Modify: `server/src/leads/leads.service.ts`, `server/src/leads/leads.service.spec.ts`
- Create: `server/src/tasks/task-auto-close.listener.ts`, `server/src/tasks/task-auto-close.listener.spec.ts`
- Modify: `server/src/notifications/notification-resolver.service.ts` (+ `.spec.ts`)
- Modify: `server/src/tasks/task-notify.listener.ts` (+ `.spec.ts`)
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`

**Interfaces:**
- Consumes: `CALL_LOG_CREATED`, `CallLogCreatedPayload`, `LEAD_CALLED`, `LeadCalledPayload`, `kindsClosedBy`, `sourceKeyOf`, `AutoCloseReason` (Task 1); `autoCloseTasks`, `TASK_EVENTS.AUTO_CLOSED`, `TaskAutoClosedPayload` (Task 2); `EntityStatusChangedEvent` (`common/entity-history/entity-history.service.ts`).
- Produces: `TaskAutoCloseListener` with `onPayment(p)`, `onCallLogged(p)`, `onLeadCalled(p)`, `onStatus(p)`; `NotificationResolverService.onTaskAutoClosed(p)`; `TaskNotifyListener.onAutoClosed(p)`. Events now live: `call-log.created`, `lead.called`, `task.auto-closed`.

- [ ] **Step 1: Failing listener test** — `server/src/tasks/task-auto-close.listener.spec.ts`

```ts
import { Logger } from '@nestjs/common';
import { TASK_EVENTS } from './task-events';
import { autoCloseTasks } from './task-auto-write';
import { TaskAutoCloseListener } from './task-auto-close.listener';

jest.mock('./task-auto-write', () => ({ autoCloseTasks: jest.fn() }));

const closed = {
  id: 't1',
  companyId: 1,
  title: 'X',
  kind: 'CALLBACK',
  authorId: null,
  dueAt: null,
  status: 'DONE',
  participants: [],
};
const STUDENT_KINDS = { kind: { in: ['BROKEN_PROMISE', 'CALLBACK'] } };

function setup() {
  const prisma = {};
  const emitter = { emit: jest.fn() };
  (autoCloseTasks as jest.Mock).mockReset().mockResolvedValue([closed]);
  return {
    listener: new TaskAutoCloseListener(prisma as any, emitter as any),
    prisma,
    emitter,
  };
}

describe('TaskAutoCloseListener', () => {
  it("a payment closes the student's promise and callback tasks", async () => {
    const { listener, prisma, emitter } = setup();
    await listener.onPayment({ companyId: 1, studentId: 10001 } as any);
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { companyId: 1, entityType: 'Student', entityId: '10001', ...STUDENT_KINDS },
      'PAYMENT_RECEIVED',
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: closed,
      reason: 'PAYMENT_RECEIVED',
    });
  });

  it('a call log closes them too, but never the callback it has just asked for', async () => {
    const { listener, prisma } = setup();
    await listener.onCallLogged({
      callLog: { id: 'c9', companyId: 1, studentId: 10001 },
    } as any);
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      {
        companyId: 1,
        entityType: 'Student',
        entityId: '10001',
        sourceKey: { not: 'calllog:c9' },
        ...STUDENT_KINDS,
      },
      'CALL_LOGGED',
    );
  });

  it('marking the lead called closes its task', async () => {
    const { listener, prisma } = setup();
    await listener.onLeadCalled({ leadId: 'l1', companyId: 1 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { companyId: 1, sourceKey: 'lead:l1', kind: { in: ['UNCALLED_LEAD'] } },
      'LEAD_CALLED',
    );
  });

  it("a lead's status change closes it; another entity's does not", async () => {
    const { listener, prisma } = setup();
    await listener.onStatus({ entityType: 'Group', entityId: 'g1', companyId: 1 });
    expect(autoCloseTasks).not.toHaveBeenCalled();
    await listener.onStatus({ entityType: 'Lead', entityId: 'l1', companyId: 1 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      prisma,
      { companyId: 1, sourceKey: 'lead:l1', kind: { in: ['UNCALLED_LEAD'] } },
      'LEAD_STATUS_CHANGED',
    );
  });

  it('a failure is logged, never thrown', async () => {
    const { listener, emitter } = setup();
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    (autoCloseTasks as jest.Mock).mockRejectedValueOnce(new Error('db down'));
    await expect(
      listener.onPayment({ companyId: 1, studentId: 10001 } as any),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
```

Run: `npx jest src/tasks/task-auto-close.listener.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: The listener** — `server/src/tasks/task-auto-close.listener.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EntityStatusChangedEvent } from '../common/entity-history/entity-history.service';
import {
  CALL_LOG_CREATED,
  type CallLogCreatedPayload,
} from '../call-logs/call-log-events';
import { LEAD_CALLED, type LeadCalledPayload } from '../leads/lead-events';
import {
  kindsClosedBy,
  sourceKeyOf,
  type AutoCloseReason,
} from './task-auto-rules';
import { autoCloseTasks } from './task-auto-write';
import { TASK_EVENTS, type TaskAutoClosedPayload } from './task-events';

/**
 * The ONE place an automatic task closes (spec §7): its source got solved.
 * Which kinds an event closes is `AUTO_RULES[kind].closesOn`. Every event
 * heard here is emitted after its write committed. Never throws.
 */
@Injectable()
export class TaskAutoCloseListener {
  private readonly logger = new Logger(TaskAutoCloseListener.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  @OnEvent('payment.received')
  async onPayment(p: { companyId: number; studentId: number }): Promise<void> {
    await this.close(
      'payment.received',
      { companyId: p.companyId, entityType: 'Student', entityId: String(p.studentId) },
      'PAYMENT_RECEIVED',
    );
  }

  /** The call that asked for a callback does not close that callback. */
  @OnEvent(CALL_LOG_CREATED)
  async onCallLogged({ callLog }: CallLogCreatedPayload): Promise<void> {
    await this.close(
      CALL_LOG_CREATED,
      {
        companyId: callLog.companyId,
        entityType: 'Student',
        entityId: String(callLog.studentId),
        sourceKey: { not: sourceKeyOf('CALLBACK', callLog.id) },
      },
      'CALL_LOGGED',
    );
  }

  @OnEvent(LEAD_CALLED)
  async onLeadCalled(p: LeadCalledPayload): Promise<void> {
    await this.close(
      LEAD_CALLED,
      { companyId: p.companyId, sourceKey: sourceKeyOf('UNCALLED_LEAD', p.leadId) },
      'LEAD_CALLED',
    );
  }

  /** LOST (deleted) or CONVERTED: the lead no longer waits for a call. */
  @OnEvent('entity.status.changed')
  async onStatus(p: EntityStatusChangedEvent): Promise<void> {
    if (p.entityType !== 'Lead') return;
    await this.close(
      'entity.status.changed',
      {
        ...(p.companyId ? { companyId: p.companyId } : {}),
        sourceKey: sourceKeyOf('UNCALLED_LEAD', p.entityId),
      },
      'LEAD_STATUS_CHANGED',
    );
  }

  private async close(
    event: string,
    where: Prisma.TaskWhereInput,
    reason: AutoCloseReason,
  ): Promise<void> {
    const kinds = kindsClosedBy(event);
    if (kinds.length === 0) return;
    try {
      const closed = await autoCloseTasks(
        this.prisma,
        { ...where, kind: { in: kinds } },
        reason,
      );
      for (const task of closed) {
        this.emitter.emit(TASK_EVENTS.AUTO_CLOSED, {
          task,
          reason,
        } satisfies TaskAutoClosedPayload);
      }
    } catch (err) {
      this.logger.error(`auto-close on ${event} failed: ${(err as Error).message}`);
    }
  }
}
```

Run the spec: PASS.

- [ ] **Step 3: `call-log.created`** — `CallLogsService`:

Add `import { EventEmitter2 } from '@nestjs/event-emitter';` and `import { CALL_LOG_CREATED, type CallLogCreatedPayload } from './call-log-events';`, inject `private events: EventEmitter2` as the constructor's LAST parameter, and right before `return log;` in `create`:

```ts
    // After the row and the promise are written (no transaction here):
    // automatic tasks close (TaskAutoCloseListener) and a callback is asked
    // for (TaskAutoService).
    this.events.emit(CALL_LOG_CREATED, {
      callLog: log,
    } satisfies CallLogCreatedPayload);
```

In `call-logs.service.spec.ts`, add `{ provide: EventEmitter2, useValue: events }` (with `const events = { emit: jest.fn() };` beside the other mocks, reset in `beforeEach`) to the testing module, and two tests in the `create` describe (use the file's existing mock shapes for `prisma.student.findFirst` / `prisma.callLog.create`):

```ts
    it('announces the saved call log once everything is written', async () => {
      // arrange as the file's happy-path create test does; callLog.create resolves `saved`
      await service.create(dto, 7, 1);
      expect(events.emit).toHaveBeenCalledWith('call-log.created', { callLog: saved });
    });

    it('announces nothing when the student is not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);
      await expect(service.create(dto, 7, 1)).rejects.toThrow();
      expect(events.emit).not.toHaveBeenCalled();
    });
```

- [ ] **Step 4: `lead.called`** — `LeadsService`:

Add `import { EventEmitter2 } from '@nestjs/event-emitter';` and `import { LEAD_CALLED, type LeadCalledPayload } from './lead-events';`, inject `private events: EventEmitter2` as the LAST constructor parameter, and in `markCalled`, after `recordUpdate`:

```ts
    // Only the first mark: re-marking keeps the old stamp, clearing is not a call.
    if (dto.called && !existing.calledAt) {
      this.events.emit(LEAD_CALLED, {
        leadId: id,
        companyId,
      } satisfies LeadCalledPayload);
    }
```

In `leads.service.spec.ts` add `{ provide: EventEmitter2, useValue: events }` to the module and, in `describe('markCalled')`, extend the three existing tests:
- «stamps calledAt…» → `expect(events.emit).toHaveBeenCalledWith('lead.called', { leadId: <id>, companyId: <companyId> })`;
- «keeps the original caller…» and «clears the marker…» → `expect(events.emit).not.toHaveBeenCalled()`.

`custom-forms.service.spec.ts` mocks `LeadsService` whole — no change.

- [ ] **Step 5: The bell rows and open pages hear `task.auto-closed`**

`server/src/notifications/notification-resolver.service.ts`, in the tasks section after `onTaskUnassigned`:

```ts
  /** An automatic task closed by its source (spec §7): every notice of it closes. */
  @OnEvent(TASK_EVENTS.AUTO_CLOSED)
  async onTaskAutoClosed(p: { task: TaskEventTask }): Promise<void> {
    await this.resolveIfClosed(p.task);
  }
```

Its spec (use the file's existing resolver construction):

```ts
  it('task.auto-closed closes every notice of the task', async () => {
    const spy = jest.spyOn(resolver, 'resolve').mockResolvedValue(1);
    await resolver.onTaskAutoClosed({
      task: { id: 't1', companyId: 1, status: 'DONE' } as any,
    });
    expect(spy).toHaveBeenCalledWith({ companyId: 1, taskId: 't1' });
  });
```

`server/src/tasks/task-notify.listener.ts`, after `onDue`:

```ts
  /** No notice (the plan has none); open task pages refresh through `finally`. */
  @OnEvent(TASK_EVENTS.AUTO_CLOSED)
  onAutoClosed(p: { task: TaskEventTask }) {
    return this.handle(TASK_EVENTS.AUTO_CLOSED, p);
  }
```

Its spec (use the file's existing setup and task fixture with participants 40 and 50):

```ts
  it('an automatic close writes no notice and refreshes the open pages', async () => {
    await listener.onAutoClosed({ task: { ...task, status: 'DONE' } });
    expect(notifications.create).not.toHaveBeenCalled();
    expect(gateway.sendToUser).toHaveBeenCalledWith(40, { type: 'task.updated', taskId: task.id });
  });
```

- [ ] **Step 6: Module and DI smoke**

`tasks.module.ts`: import `TaskAutoCloseListener` and add it to `providers`. `tasks.module.di.spec.ts`: import it and add `TaskAutoCloseListener` to the token list.

- [ ] **Step 7: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-auto-close.listener.ts src/tasks/task-auto-close.listener.spec.ts src/call-logs/call-logs.service.ts src/call-logs/call-logs.service.spec.ts src/leads/leads.service.ts src/leads/leads.service.spec.ts src/notifications/notification-resolver.service.ts src/notifications/notification-resolver.service.spec.ts src/tasks/task-notify.listener.ts src/tasks/task-notify.listener.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts
npx eslint src/tasks src/call-logs src/leads src/notifications --quiet
npx jest src/tasks src/call-logs src/leads src/notifications src/common/event-wiring.spec.ts src/custom-forms
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-auto-close.listener.ts server/src/tasks/task-auto-close.listener.spec.ts server/src/call-logs/call-logs.service.ts server/src/call-logs/call-logs.service.spec.ts server/src/leads/leads.service.ts server/src/leads/leads.service.spec.ts server/src/notifications/notification-resolver.service.ts server/src/notifications/notification-resolver.service.spec.ts server/src/tasks/task-notify.listener.ts server/src/tasks/task-notify.listener.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): automatic tasks close when their source is solved" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: «Buzilgan va'da» and «Qayta qo'ng'iroq» are created; administrators lose the 09:00 list

**Files:**
- Create: `server/src/tasks/task-auto.service.ts`, `server/src/tasks/task-auto.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`
- Modify: `server/src/notifications/notification-events.listener.ts`, `server/src/notifications/notification-events.listener.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`autoTaskAssigneeIds`, `callbackAssigneeIds`, `systemDueAt`, `sourceKeyOf`, `studentName`, `brokenPromiseText`, `callbackText`, `CALL_LOG_CREATED`, `CallLogCreatedPayload`); Task 2 (`createSystemTask`, `SystemTaskInput`); `PaymentPromiseOverduePayload` (`payment-promises/payment-promise-cron.service.ts`); `MIN_ALERT_DEBT` (`payment-promises/overdue-digest.ts`); `buildHolidayDateSet(db, from, to, branchId)` (`holidays/holiday-date-set.ts`); `TASK_EVENTS.ASSIGNED`, `TaskAssignedPayload`.
- Produces: `TaskAutoService` with `onPromisesBroken(p: PaymentPromiseOverduePayload, now?: Date): Promise<void>` and `onCallLogged(p: CallLogCreatedPayload, now?: Date): Promise<void>`.

- [ ] **Step 1: Failing test** — `server/src/tasks/task-auto.spec.ts` (spec §13 «task-auto.spec.ts»: creation per kind, no duplicate on re-run, claim; the closing events are `task-auto-close.listener.spec.ts`, the lead kind is `task-auto-leads.service.spec.ts`)

```ts
import { TASK_EVENTS } from './task-events';
import { TaskAutoService } from './task-auto.service';
import { changeStatusTx } from './task-status-writes';
import { SYSTEM_CLOSES_MESSAGE, checkTransition } from './task-transitions';

const MON_0900 = new Date('2026-10-12T04:00:00.000Z');

/** Open tasks live in a map keyed by sourceKey, so a re-run really meets the first run's task. */
function fakeDb() {
  const open = new Map<string, { id: string }>();
  let seq = 0;
  const tx = {
    task: {
      create: jest.fn(async ({ data }: any) => {
        const row = {
          id: `t${++seq}`,
          companyId: data.companyId,
          title: data.title,
          kind: data.kind,
          authorId: null,
          dueAt: data.dueAt,
          status: 'NEW',
          participants: data.participants.create,
        };
        open.set(data.sourceKey, row);
        return row;
      }),
    },
    taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
  };
  const prisma = {
    task: {
      findFirst: jest.fn(async ({ where }: any) =>
        open.has(where.sourceKey) ? { id: open.get(where.sourceKey)!.id } : null,
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    paymentPromise: { findMany: jest.fn() },
    student: { findFirst: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]),
      findFirst: jest.fn().mockResolvedValue({ id: 9 }),
    },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, tx, open };
}

const promise = (id: string, studentId: number, balance: number) => ({
  id,
  promiseDate: new Date('2026-10-09T18:59:59.999Z'),
  promisedAmount: null,
  comment: null,
  student: { id: studentId, firstName: 'Aziz', lastName: 'Rahimov', balance },
});

function setup() {
  const db = fakeDb();
  const emitter = { emit: jest.fn() };
  return { ...db, emitter, service: new TaskAutoService(db.prisma as any, emitter as any) };
}

describe('TaskAutoService — «Buzilgan va\'da»', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(MON_0900));
  afterEach(() => jest.useRealTimers());

  it('one task per broken promise, for the branch administrators, due today 18:00', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([
      promise('p1', 10001, -450_000),
      promise('p2', 10002, -120_000),
    ]);
    await service.onPromisesBroken({ companyId: 1, branchId: 2, promiseIds: ['p1', 'p2'] }, MON_0900);

    expect(tx.task.create).toHaveBeenCalledTimes(2);
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      kind: 'BROKEN_PROMISE',
      priority: 'HIGH',
      authorId: null,
      branchId: 2,
      entityType: 'Student',
      entityId: '10001',
      sourceKey: 'promise:p1',
      title: "Va'da buzildi: Rahimov Aziz — qarz 450 000 so'm",
      dueAt: new Date('2026-10-12T13:00:00.000Z'),
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: null, userIds: [3, 4], created: true }),
    );
    expect(emitter.emit).toHaveBeenCalledTimes(2);
  });

  it('a debt that fell under 1 000 so\'m since the cron gets no task (the list rule)', async () => {
    const { service, prisma, tx } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([promise('p3', 10003, -999)]);
    await service.onPromisesBroken({ companyId: 1, branchId: 2, promiseIds: ['p3'] }, MON_0900);
    expect(tx.task.create).not.toHaveBeenCalled();
  });

  it('the same event heard twice writes one task and tells once', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.paymentPromise.findMany.mockResolvedValue([promise('p1', 10001, -450_000)]);
    const p = { companyId: 1, branchId: 2, promiseIds: ['p1'] };
    await service.onPromisesBroken(p, MON_0900);
    await service.onPromisesBroken(p, MON_0900);
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });
});

describe('TaskAutoService — «Qayta qo\'ng\'iroq»', () => {
  const callLog = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    companyId: 1,
    studentId: 10001,
    branchId: 2,
    calledById: 9,
    note: 'Ertaga qayta',
    reason: 'DEBT',
    outcome: 'NO_ANSWER',
    // 23:00 Tashkent of Wednesday 14.10 — what the call dialog sends
    followUpAt: new Date('2026-10-14T18:00:00.000Z'),
    createdAt: MON_0900,
    ...over,
  });

  beforeEach(() => jest.useFakeTimers().setSystemTime(MON_0900));
  afterEach(() => jest.useRealTimers());

  it('a task for the caller on the follow-up day, 18:00', async () => {
    const { service, prisma, tx, emitter } = setup();
    prisma.student.findFirst.mockResolvedValue({ firstName: 'Aziz', lastName: 'Rahimov' });
    await service.onCallLogged({ callLog: callLog() } as any, MON_0900);
    expect(tx.task.create.mock.calls[0][0].data).toMatchObject({
      kind: 'CALLBACK',
      priority: 'MEDIUM',
      sourceKey: 'calllog:c1',
      entityType: 'Student',
      entityId: '10001',
      title: "Qayta qo'ng'iroq: Rahimov Aziz",
      description: "Oldingi qo'ng'iroq izohi: Ertaga qayta",
      dueAt: new Date('2026-10-14T13:00:00.000Z'),
      participants: { create: [{ userId: 9, role: 'ASSIGNEE' }] },
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [9], created: true, actorId: null }),
    );
  });

  it('no follow-up date, or a caller who has left: no task', async () => {
    const { service, prisma, tx } = setup();
    prisma.student.findFirst.mockResolvedValue({ firstName: 'Aziz', lastName: 'Rahimov' });
    await service.onCallLogged({ callLog: callLog({ followUpAt: null }) } as any, MON_0900);
    prisma.user.findFirst.mockResolvedValue(null);
    await service.onCallLogged({ callLog: callLog({ id: 'c2' }) } as any, MON_0900);
    expect(tx.task.create).not.toHaveBeenCalled();
  });
});

describe('claim — the first administrator to act takes a system task', () => {
  it('starting it takes it; the other copy goes', async () => {
    const tx = {
      taskParticipant: {
        findMany: jest.fn().mockResolvedValue([{ userId: 3 }, { userId: 4 }]),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      unmarkedLesson: { updateMany: jest.fn() },
      task: { update: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn() },
      taskEvent: { create: jest.fn() },
    };
    const ctx = {
      row: {
        id: 't1',
        kind: 'BROKEN_PROMISE',
        status: 'NEW',
        authorId: null,
        claimedById: null,
        requiresPhoto: false,
        startedAt: null,
        participants: [
          { userId: 3, role: 'ASSIGNEE' },
          { userId: 4, role: 'ASSIGNEE' },
        ],
      },
      access: { canWork: true, isAssignee: true },
    };
    await changeStatusTx(tx as any, ctx as any, 'IN_PROGRESS', 3);
    expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { claimedById: 3 } });
    expect(tx.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
  });

  it('nobody closes it by hand', () => {
    expect(
      checkTransition({
        from: 'IN_PROGRESS',
        to: 'DONE',
        by: 'ASSIGNEE',
        selfTask: false,
        kind: 'CALLBACK',
        requiresPhoto: false,
        hasFreshPhoto: false,
      }),
    ).toEqual({ ok: false, message: SYSTEM_CLOSES_MESSAGE });
  });
});
```

Run: `npx jest src/tasks/task-auto.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: The service** — `server/src/tasks/task-auto.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { MIN_ALERT_DEBT } from '../payment-promises/overdue-digest';
import type { PaymentPromiseOverduePayload } from '../payment-promises/payment-promise-cron.service';
import {
  CALL_LOG_CREATED,
  type CallLogCreatedPayload,
} from '../call-logs/call-log-events';
import {
  autoTaskAssigneeIds,
  brokenPromiseText,
  callbackAssigneeIds,
  callbackText,
  sourceKeyOf,
  studentName,
  systemDueAt,
} from './task-auto-rules';
import { createSystemTask, type SystemTaskInput } from './task-auto-write';
import { TASK_EVENTS, type TaskAssignedPayload } from './task-events';

const HOLIDAY_LOOKAHEAD_MS = 14 * 864e5;

/**
 * «Buzilgan va'da» and «Qayta qo'ng'iroq» (spec §7): created from the events
 * of their sources, after those committed. The lead kind is the hourly
 * `TaskAutoLeadsService`; closing is `TaskAutoCloseListener`.
 */
@Injectable()
export class TaskAutoService {
  private readonly logger = new Logger(TaskAutoService.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  /**
   * One task per promise the 09:00 cron broke, for the branch's administrators
   * (ADR-0080: they no longer get the list). Only students who still owe
   * `MIN_ALERT_DEBT` — the same people the list names.
   */
  @OnEvent('payment-promise.overdue')
  async onPromisesBroken(
    p: PaymentPromiseOverduePayload,
    now = new Date(),
  ): Promise<void> {
    try {
      const promises = await this.prisma.paymentPromise.findMany({
        where: { id: { in: p.promiseIds }, companyId: p.companyId },
        select: {
          id: true,
          promiseDate: true,
          promisedAmount: true,
          comment: true,
          student: {
            select: { id: true, firstName: true, lastName: true, balance: true },
          },
        },
      });
      const owing = promises.filter((x) => -x.student.balance >= MIN_ALERT_DEBT);
      if (owing.length === 0) return;
      const assigneeIds = await autoTaskAssigneeIds(this.prisma, p.companyId, p.branchId);
      const dueAt = systemDueAt(
        tashkentDateStr(now),
        await this.holidays(p.branchId, now),
        now,
      );
      for (const x of owing) {
        // One failing student must not cost the others their task.
        try {
          await this.make({
            companyId: p.companyId,
            branchId: p.branchId,
            kind: 'BROKEN_PROMISE',
            ...brokenPromiseText({
              name: studentName(x.student),
              debt: -x.student.balance,
              promiseDate: x.promiseDate,
              promisedAmount: x.promisedAmount,
              comment: x.comment,
            }),
            dueAt,
            entityId: String(x.student.id),
            sourceKey: sourceKeyOf('BROKEN_PROMISE', x.id),
            assigneeIds,
          });
        } catch (err) {
          this.logger.error(`broken promise ${x.id}: task failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.error(`payment-promise.overdue tasks failed: ${(err as Error).message}`);
    }
  }

  /** A call logged with «Keyingi bog'lanish sanasi»: a task for the caller on that day. */
  @OnEvent(CALL_LOG_CREATED)
  async onCallLogged(
    { callLog }: CallLogCreatedPayload,
    now = new Date(),
  ): Promise<void> {
    if (!callLog.followUpAt) return;
    try {
      const [student, assigneeIds] = await Promise.all([
        this.prisma.student.findFirst({
          where: { id: callLog.studentId, companyId: callLog.companyId },
          select: { firstName: true, lastName: true },
        }),
        callbackAssigneeIds(this.prisma, callLog.companyId, callLog.calledById),
      ]);
      if (!student) return;
      const dueAt = systemDueAt(
        tashkentDateStr(callLog.followUpAt),
        await this.holidays(callLog.branchId, callLog.followUpAt),
        now,
      );
      await this.make({
        companyId: callLog.companyId,
        branchId: callLog.branchId,
        kind: 'CALLBACK',
        ...callbackText({ name: studentName(student), note: callLog.note }),
        dueAt,
        entityId: String(callLog.studentId),
        sourceKey: sourceKeyOf('CALLBACK', callLog.id),
        assigneeIds,
      });
    } catch (err) {
      this.logger.error(`callback task for call ${callLog.id} failed: ${(err as Error).message}`);
    }
  }

  /** Writes the task and, once committed, tells its assignees (bell, push, Telegram). */
  private async make(input: SystemTaskInput): Promise<void> {
    const task = await createSystemTask(this.prisma, input);
    if (!task) return;
    this.emitter.emit(TASK_EVENTS.ASSIGNED, {
      task,
      actorId: null,
      userIds: input.assigneeIds,
      created: true,
    } satisfies TaskAssignedPayload);
  }

  private holidays(branchId: number | null, from: Date) {
    return buildHolidayDateSet(
      this.prisma,
      from,
      new Date(from.getTime() + HOLIDAY_LOOKAHEAD_MS),
      branchId,
    );
  }
}
```

Register `TaskAutoService` in `tasks.module.ts` providers and add it to the DI spec's token list.

Run: `npx jest src/tasks/task-auto.spec.ts src/tasks/tasks.module.di.spec.ts` — Expected: PASS.

- [ ] **Step 3: The 09:00 list goes to CEOs only** — `notification-events.listener.ts`, `handlePaymentPromiseOverdue`: replace the recipients query and the doc comment.

```ts
  /**
   * One branch's payment promises that passed their date while the students
   * are still in debt (flipped to BROKEN by the 09:00 cron), as ONE list for
   * the company CEOs: debt, group, phones, the promise and its note, what
   * changed since and how often the student broke one. The branch's
   * administrators get one «Buzilgan va'da» task per student instead
   * (`TaskAutoService`, ADR-0080), never both. Fans out to all four channels;
   * the bell and push get the names only, Telegram the whole list.
   */
```

```ts
        this.prisma.user.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
            companyId: payload.companyId,
            roles: { some: { role: { name: 'CEO' } } },
          },
          select: { id: true },
        }),
```

In `notification-events.listener.spec.ts`, inside `'sends the branch one list instantly and queues nothing'` add:

```ts
      // CEOs only: the branch's administrators get tasks (ADR-0080).
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          isActive: true,
          status: 'ACTIVE',
          companyId: 1,
          roles: { some: { role: { name: 'CEO' } } },
        },
        select: { id: true },
      });
```

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-auto.service.ts src/tasks/task-auto.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts src/notifications/notification-events.listener.ts src/notifications/notification-events.listener.spec.ts
npx eslint src/tasks src/notifications --quiet
npx jest src/tasks src/notifications src/common/event-wiring.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-auto.service.ts server/src/tasks/task-auto.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts server/src/notifications/notification-events.listener.ts server/src/notifications/notification-events.listener.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): broken promise and callback tasks; 09:00 list for CEOs only" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: «Qo'ng'iroqsiz lid» — the hourly run and its sweep

**Files:**
- Create: `server/src/tasks/task-auto-leads.service.ts`, `server/src/tasks/task-auto-leads.service.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`UNCALLED_LEAD_AGE_MS`, `UNCALLED_LEAD_WHERE`, `uncalledLeadWindowOpen`, `systemDueAt`, `autoTaskAssigneeIds`, `sourceKeyOf`, `uncalledLeadText`); Task 2 (`createSystemTask`, `autoCloseTasks`, `TASK_EVENTS.AUTO_CLOSED`); `Company.uncalledLeadTasksFrom`.
- Produces: `TaskAutoLeadsService.tick(): Promise<void>` (`@Cron('0 0 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })`), `TaskAutoLeadsService.run(now: Date): Promise<{ created: number; closed: number }>`.

- [ ] **Step 1: Failing test** — `server/src/tasks/task-auto-leads.service.spec.ts`

```ts
import { TASK_EVENTS } from './task-events';
import { autoCloseTasks, createSystemTask } from './task-auto-write';
import { TaskAutoLeadsService } from './task-auto-leads.service';

jest.mock('./task-auto-write', () => ({
  createSystemTask: jest.fn(),
  autoCloseTasks: jest.fn(),
}));

const SINCE = new Date('2026-10-11T04:00:00.000Z'); // the deploy
const MON_1000 = new Date('2026-10-12T05:00:00.000Z');
const SAT_1800 = new Date('2026-10-17T13:00:00.000Z');
const made = (id: string) => ({ id, companyId: 1, title: 'X', kind: 'UNCALLED_LEAD', authorId: null, dueAt: null, status: 'NEW', participants: [] });

function setup(opts: { leads?: any[]; openKeys?: string[]; openLeadTasks?: string[]; live?: string[] } = {}) {
  const prisma = {
    company: { findMany: jest.fn().mockResolvedValue([{ id: 1, uncalledLeadTasksFrom: SINCE }]) },
    task: {
      findMany: jest.fn(async ({ where }: any) =>
        where.kind === 'UNCALLED_LEAD'
          ? (opts.openLeadTasks ?? []).map((id) => ({ entityId: id }))
          : (opts.openKeys ?? []).map((sourceKey) => ({ sourceKey })),
      ),
    },
    lead: {
      findMany: jest.fn(async ({ where }: any) =>
        where.id ? (opts.live ?? []).map((id) => ({ id })) : (opts.leads ?? []),
      ),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const emitter = { emit: jest.fn() };
  (createSystemTask as jest.Mock).mockReset().mockImplementation(async (_p, i) => made(i.sourceKey));
  (autoCloseTasks as jest.Mock).mockReset().mockResolvedValue([]);
  return { prisma, emitter, service: new TaskAutoLeadsService(prisma as any, emitter as any) };
}
const lead = (id: string, branchId: number | null = 2) => ({ id, firstName: 'Dilnoza', lastName: 'Karimova', branchId });

describe('TaskAutoLeadsService', () => {
  it.each([
    ['Sunday 10:00', new Date('2026-10-11T05:00:00.000Z')],
    ['Monday 07:59', new Date('2026-10-12T02:59:00.000Z')],
    ['Monday 19:00', new Date('2026-10-12T14:00:00.000Z')],
  ])('does nothing outside the window: %s', async (_label, now) => {
    const { service, prisma } = setup();
    expect(await service.run(now)).toEqual({ created: 0, closed: 0 });
    expect(prisma.company.findMany).not.toHaveBeenCalled();
  });

  it('asks only for new leads uncalled for 24 hours, created since the feature started', async () => {
    const { service, prisma } = setup({ leads: [lead('l1')] });
    await service.run(MON_1000);
    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1,
          calledAt: null,
          statusEnum: 'NEW',
          deletedAt: null,
          createdAt: { gte: SINCE, lt: new Date('2026-10-11T05:00:00.000Z') },
        },
      }),
    );
  });

  it('a task per lead, for its branch administrators, due today 18:00', async () => {
    const { service, emitter } = setup({ leads: [lead('l1')] });
    expect(await service.run(MON_1000)).toEqual({ created: 1, closed: 0 });
    expect(createSystemTask).toHaveBeenCalledWith(expect.anything(), {
      companyId: 1,
      branchId: 2,
      kind: 'UNCALLED_LEAD',
      title: "Lidga qo'ng'iroq qilinmagan: Karimova Dilnoza",
      description: null,
      dueAt: new Date('2026-10-12T13:00:00.000Z'),
      entityId: 'l1',
      sourceKey: 'lead:l1',
      assigneeIds: [3],
    });
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: null, userIds: [3], created: true }),
    );
  });

  it('a lead that already has an open task is skipped', async () => {
    const { service } = setup({ leads: [lead('l1')], openKeys: ['lead:l1'] });
    await service.run(MON_1000);
    expect(createSystemTask).not.toHaveBeenCalled();
  });

  it('a lead with no branch goes to the company administrators', async () => {
    const { service, prisma } = setup({ leads: [lead('l2', null)] });
    await service.run(MON_1000);
    expect(prisma.user.findMany.mock.calls[0][0].where.branches).toBeUndefined();
    expect((createSystemTask as jest.Mock).mock.calls[0][1].branchId).toBeNull();
  });

  it('the Saturday 18:00 run is due on Monday 18:00, never already late', async () => {
    const { service } = setup({ leads: [lead('l1')] });
    await service.run(SAT_1800);
    expect((createSystemTask as jest.Mock).mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-19T13:00:00.000Z'),
    );
  });

  it('closes the task of a lead that no longer waits (called, archived, not NEW)', async () => {
    const { service, emitter } = setup({ openLeadTasks: ['l8', 'l9'], live: ['l8'] });
    (autoCloseTasks as jest.Mock).mockResolvedValue([made('t9')]);
    expect(await service.run(MON_1000)).toEqual({ created: 0, closed: 1 });
    expect(autoCloseTasks).toHaveBeenCalledWith(
      expect.anything(),
      { companyId: 1, sourceKey: { in: ['lead:l9'] } },
      'LEAD_GONE',
    );
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.AUTO_CLOSED, {
      task: made('t9'),
      reason: 'LEAD_GONE',
    });
  });
});
```

(10-17 is a Saturday, 10-19 a Monday.) Run: FAIL (module missing).

- [ ] **Step 2: The service** — `server/src/tasks/task-auto-leads.service.ts`

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentDateStr } from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import {
  UNCALLED_LEAD_AGE_MS,
  UNCALLED_LEAD_WHERE,
  autoTaskAssigneeIds,
  sourceKeyOf,
  systemDueAt,
  uncalledLeadText,
  uncalledLeadWindowOpen,
} from './task-auto-rules';
import { autoCloseTasks, createSystemTask } from './task-auto-write';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskAutoClosedPayload,
} from './task-events';
import { OPEN_STATUSES } from './task-transitions';

// ponytail: 200 leads a company an hour; a bigger backlog waits for the next run.
const LEAD_BATCH = 200;
const OPEN = [...OPEN_STATUSES];

/**
 * «Qo'ng'iroqsiz lid» (spec §7, §9.6): every hour 08:00–18:00 Monday–Saturday
 * (Tashkent), a task for each NEW lead nobody called for 24 hours — only
 * leads created since `Company.uncalledLeadTasksFrom` (ADR-0080). The run
 * first closes the tasks of leads that no longer wait: events close them
 * (`TaskAutoCloseListener`), this catches what sends none (a section archived
 * with its leads).
 */
@Injectable()
export class TaskAutoLeadsService {
  private readonly logger = new Logger(TaskAutoLeadsService.name);

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
  ) {}

  @Cron('0 0 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    await this.run(new Date());
  }

  async run(now: Date): Promise<{ created: number; closed: number }> {
    const total = { created: 0, closed: 0 };
    if (!uncalledLeadWindowOpen(now)) return total;
    const companies = await this.prisma.company.findMany({
      select: { id: true, uncalledLeadTasksFrom: true },
    });
    for (const c of companies) {
      try {
        total.closed += await this.closeResolved(c.id);
        total.created += await this.openTasks(c.id, c.uncalledLeadTasksFrom, now);
      } catch (err) {
        this.logger.error(`uncalled leads of company ${c.id} failed: ${(err as Error).message}`);
      }
    }
    return total;
  }

  private async closeResolved(companyId: number): Promise<number> {
    const tasks = await this.prisma.task.findMany({
      where: { companyId, kind: 'UNCALLED_LEAD', status: { in: OPEN } },
      select: { entityId: true },
    });
    const ids = tasks
      .map((t) => t.entityId)
      .filter((id): id is string => id !== null);
    if (ids.length === 0) return 0;
    const live = new Set(
      (
        await this.prisma.lead.findMany({
          where: { id: { in: ids }, companyId, ...UNCALLED_LEAD_WHERE },
          select: { id: true },
        })
      ).map((l) => l.id),
    );
    const gone = ids.filter((id) => !live.has(id));
    if (gone.length === 0) return 0;
    const closed = await autoCloseTasks(
      this.prisma,
      { companyId, sourceKey: { in: gone.map((id) => sourceKeyOf('UNCALLED_LEAD', id)) } },
      'LEAD_GONE',
    );
    for (const task of closed) {
      this.emitter.emit(TASK_EVENTS.AUTO_CLOSED, {
        task,
        reason: 'LEAD_GONE',
      } satisfies TaskAutoClosedPayload);
    }
    return closed.length;
  }

  private async openTasks(companyId: number, since: Date, now: Date): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      where: {
        companyId,
        ...UNCALLED_LEAD_WHERE,
        createdAt: { gte: since, lt: new Date(now.getTime() - UNCALLED_LEAD_AGE_MS) },
      },
      select: { id: true, firstName: true, lastName: true, branchId: true },
      orderBy: { createdAt: 'asc' },
      take: LEAD_BATCH,
    });
    if (leads.length === 0) return 0;
    const taken = new Set(
      (
        await this.prisma.task.findMany({
          where: {
            companyId,
            status: { in: OPEN },
            sourceKey: { in: leads.map((l) => sourceKeyOf('UNCALLED_LEAD', l.id)) },
          },
          select: { sourceKey: true },
        })
      ).map((t) => t.sourceKey),
    );
    // Per branch once: who takes it and when it is due.
    const perBranch = new Map<number | null, { assigneeIds: number[]; dueAt: Date }>();
    let made = 0;
    for (const lead of leads) {
      const sourceKey = sourceKeyOf('UNCALLED_LEAD', lead.id);
      if (taken.has(sourceKey)) continue;
      let branch = perBranch.get(lead.branchId);
      if (!branch) {
        const holidays = await buildHolidayDateSet(
          this.prisma,
          now,
          new Date(now.getTime() + 14 * 864e5),
          lead.branchId,
        );
        branch = {
          assigneeIds: await autoTaskAssigneeIds(this.prisma, companyId, lead.branchId),
          dueAt: systemDueAt(tashkentDateStr(now), holidays, now),
        };
        perBranch.set(lead.branchId, branch);
      }
      const task = await createSystemTask(this.prisma, {
        companyId,
        branchId: lead.branchId,
        kind: 'UNCALLED_LEAD',
        ...uncalledLeadText({ name: `${lead.lastName} ${lead.firstName}`.trim() }),
        dueAt: branch.dueAt,
        entityId: lead.id,
        sourceKey,
        assigneeIds: branch.assigneeIds,
      });
      if (!task) continue;
      made++;
      this.emitter.emit(TASK_EVENTS.ASSIGNED, {
        task,
        actorId: null,
        userIds: branch.assigneeIds,
        created: true,
      } satisfies TaskAssignedPayload);
    }
    return made;
  }
}
```

Register `TaskAutoLeadsService` in `tasks.module.ts` and the DI spec.

- [ ] **Step 3: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-auto-leads.service.ts src/tasks/task-auto-leads.service.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks src/common/event-wiring.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-auto-leads.service.ts server/src/tasks/task-auto-leads.service.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): hourly uncalled-lead tasks with a closing sweep" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Telegram — «Tizim topshirig'i» and the callback's 08:00

**Files:**
- Modify: `server/src/tasks/telegram/task-telegram-text.ts`, `server/src/tasks/telegram/task-telegram-text.spec.ts`
- Modify: `server/src/tasks/telegram/task-telegram.listener.ts`, `server/src/tasks/telegram/task-telegram.listener.spec.ts`

**Interfaces:**
- Consumes: `telegramNotBefore(kind, dueAt)` (Task 1).
- Produces: nothing new; behaviour only.

- [ ] **Step 1: Failing tests**

`task-telegram-text.spec.ts` (use the file's view fixture; it has `kind: 'MANUAL'`):

```ts
  it("a system task's notice says «Tizim topshirig'i» and carries «Ochish» only", () => {
    const m = renderTaskMessage(
      { ...view, kind: 'BROKEN_PROMISE', priority: 'HIGH', authorId: null, authorName: null },
      { kind: 'ASSIGNED' },
      40,
      { now: new Date('2026-10-12T06:00:00.000Z'), openUrl: 'https://admin.example.uz/tasks?task=t1' },
    );
    expect(m.text.split('\n')[0]).toBe("<b>Tizim topshirig'i · Yuqori</b>");
    expect(m.text).toContain('Bergan: Tizim');
    expect(m.buttons).toEqual([[expect.objectContaining({ text: 'Ochish' })]]);
  });
```

`task-telegram.listener.spec.ts` (the file's `setup()`, `task`, `DAY` = Monday 11:00 Tashkent):

```ts
  describe('a callback waits for 08:00 of its day', () => {
    const callbackView = (dueAt: string) => ({
      ...view(),
      kind: 'CALLBACK',
      authorId: null,
      authorName: null,
      dueAt: new Date(dueAt),
    });
    const callback = { ...assigned, task: { ...task, kind: 'CALLBACK', authorId: null }, actorId: null };

    it('due on Wednesday: held in the outbox for Wednesday 08:00', async () => {
      const { listener, sender, prisma } = setup();
      (loadTaskView as jest.Mock).mockResolvedValue(callbackView('2026-10-14T13:00:00.000Z'));
      await listener.handle(TASK_EVENTS.ASSIGNED, callback as any, DAY);
      expect(sender.send).not.toHaveBeenCalled();
      expect(prisma.taskOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 40,
          channel: 'TELEGRAM',
          kind: 'NOTICE',
          sendAfter: new Date('2026-10-14T03:00:00.000Z'),
        }),
      });
    });

    it('due today: goes now', async () => {
      const { listener, sender } = setup();
      (loadTaskView as jest.Mock).mockResolvedValue(callbackView('2026-10-12T13:00:00.000Z'));
      await listener.handle(TASK_EVENTS.ASSIGNED, callback as any, DAY);
      expect(sender.send).toHaveBeenCalledTimes(1);
    });
  });
```

Run: `npx jest src/tasks/telegram` — Expected: the two new describes FAIL.

- [ ] **Step 2: Implement**

`task-telegram-text.ts`, `headline()`:

```ts
    case 'ASSIGNED':
      // A system task is done on the website (spec §6.1 «Tizim topshirig'i»).
      return `${view.kind === 'MANUAL' ? 'Yangi topshiriq' : "Tizim topshirig'i"} · ${PRIORITY_LABEL[view.priority]}`;
```

`task-telegram.listener.ts`: `import { telegramNotBefore } from '../task-auto-rules';` and at the top of `deliver`:

```ts
    // The night quiet, and a callback's own day (spec §7): the later of the two.
    const notBefore = telegramNotBefore(view.kind, view.dueAt);
    const quiet = telegramSendAfter(now, view.priority);
    const at =
      notBefore && notBefore.getTime() > quiet.getTime() ? notBefore : quiet;
```

(replacing `const at = telegramSendAfter(now, view.priority);`; the rest of `deliver` — hold when `at > now`, only for a sendable chat — is unchanged.)

Run: `npx jest src/tasks/telegram` — PASS.

- [ ] **Step 3: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/telegram/task-telegram-text.ts src/tasks/telegram/task-telegram-text.spec.ts src/tasks/telegram/task-telegram.listener.ts src/tasks/telegram/task-telegram.listener.spec.ts
npx eslint src/tasks/telegram --quiet
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/telegram/task-telegram-text.ts server/src/tasks/telegram/task-telegram-text.spec.ts server/src/tasks/telegram/task-telegram.listener.ts server/src/tasks/telegram/task-telegram.listener.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): system task headline in Telegram; callbacks wait for 08:00" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The source card's data in `GET /tasks/:id`

**Files:**
- Create: `server/src/tasks/task-source.ts`, `server/src/tasks/task-source.spec.ts`
- Modify: `server/src/tasks/tasks-read.service.ts` (`detail`), `server/src/tasks/tasks-read.service.spec.ts`

**Interfaces:**
- Consumes: `studentName` (Task 1); `TaskRow` (`kind`, `sourceKey`, `companyId`).
- Produces (the client mirrors this in Task 9, dates as ISO strings):

```ts
export interface SourceCall { at: Date; outcome: CallOutcome; note: string | null; by: string }
export interface TaskSource {
  student?: { id: number; name: string; phone: string | null; debt: number; lastCall: SourceCall | null };
  promise?: { date: Date; amount: number | null; comment: string | null };
  previousCall?: SourceCall;
  callReason?: CallReason;
  lead?: { id: string; name: string; phone: string; source: string | null; createdAt: Date };
}
export function loadTaskSource(db, t: { kind: TaskKind; sourceKey: string | null; companyId: number }): Promise<TaskSource | null>
```
  `GET /tasks/:id` → `{ task, events, access, batch, source: TaskSource | null }`.

- [ ] **Step 1: Failing test** — `server/src/tasks/task-source.spec.ts`

```ts
import { loadTaskSource } from './task-source';

const LAST = { createdAt: new Date('2026-10-09T06:30:00.000Z'), outcome: 'NO_ANSWER', note: null, reason: 'DEBT', calledBy: { firstName: 'Dilnoza', lastName: 'Karimova' } };
const STUDENT = { id: 10001, firstName: 'Aziz', lastName: 'Rahimov', phone: '901234567', balance: -450_000 };

function db() {
  return {
    paymentPromise: { findFirst: jest.fn() },
    student: { findFirst: jest.fn().mockResolvedValue(STUDENT) },
    callLog: { findFirst: jest.fn(async ({ where }: any) => (where.id ? { ...LAST, note: 'Ertaga qayta', studentId: 10001 } : LAST)) },
    lead: { findFirst: jest.fn() },
  };
}
const lastCall = { at: LAST.createdAt, outcome: 'NO_ANSWER', note: null, by: 'Karimova Dilnoza' };
const student = { id: 10001, name: 'Rahimov Aziz', phone: '901234567', debt: 450_000, lastCall };

describe('loadTaskSource', () => {
  it('a broken promise: the student, their debt, the promise, the last call', async () => {
    const d = db();
    d.paymentPromise.findFirst.mockResolvedValue({ promiseDate: new Date('2026-10-09T18:59:59.999Z'), promisedAmount: 200_000, comment: 'Oylik kelganda', studentId: 10001 });
    expect(await loadTaskSource(d as any, { kind: 'BROKEN_PROMISE', sourceKey: 'promise:p1', companyId: 1 })).toEqual({
      student,
      promise: { date: new Date('2026-10-09T18:59:59.999Z'), amount: 200_000, comment: 'Oylik kelganda' },
      callReason: 'DEBT',
    });
    expect(d.paymentPromise.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', companyId: 1 });
  });

  it('a callback: the student and the call that asked for it, with its reason', async () => {
    const d = db();
    expect(await loadTaskSource(d as any, { kind: 'CALLBACK', sourceKey: 'calllog:c1', companyId: 1 })).toEqual({
      student,
      previousCall: { at: LAST.createdAt, outcome: 'NO_ANSWER', note: 'Ertaga qayta', by: 'Karimova Dilnoza' },
      callReason: 'DEBT',
    });
  });

  it('an uncalled lead: name, phone, source, when it came', async () => {
    const d = db();
    d.lead.findFirst.mockResolvedValue({ id: 'l1', firstName: 'Dilnoza', lastName: 'Karimova', phone: '931112233', createdAt: new Date('2026-10-08T05:15:00.000Z'), source: { name: 'Instagram' } });
    expect(await loadTaskSource(d as any, { kind: 'UNCALLED_LEAD', sourceKey: 'lead:l1', companyId: 1 })).toEqual({
      lead: { id: 'l1', name: 'Karimova Dilnoza', phone: '931112233', source: 'Instagram', createdAt: new Date('2026-10-08T05:15:00.000Z') },
    });
  });

  it('a cleared debt reads 0', async () => {
    const d = db();
    d.student.findFirst.mockResolvedValue({ ...STUDENT, balance: 15_000 });
    const s = await loadTaskSource(d as any, { kind: 'CALLBACK', sourceKey: 'calllog:c1', companyId: 1 });
    expect(s?.student?.debt).toBe(0);
  });

  it('a manual task, «Dars bo\'ldimi?» or a source that is gone: null, no query', async () => {
    const d = db();
    expect(await loadTaskSource(d as any, { kind: 'MANUAL', sourceKey: null, companyId: 1 })).toBeNull();
    expect(await loadTaskSource(d as any, { kind: 'LESSON_QUESTION', sourceKey: 'unmarked:g1:2026-10-09', companyId: 1 })).toBeNull();
    expect(d.student.findFirst).not.toHaveBeenCalled();
    d.lead.findFirst.mockResolvedValue(null);
    expect(await loadTaskSource(d as any, { kind: 'UNCALLED_LEAD', sourceKey: 'lead:l9', companyId: 1 })).toBeNull();
  });
});
```

Run: FAIL (module missing).

- [ ] **Step 2: Implement** — `server/src/tasks/task-source.ts`

```ts
import type { CallOutcome, CallReason, Prisma, TaskKind } from '@prisma/client';
import { studentName } from './task-auto-rules';

type Db = Prisma.TransactionClient;

export interface SourceCall {
  at: Date;
  outcome: CallOutcome;
  note: string | null;
  by: string;
}

/** What a system task's sheet shows about its source (spec §4 screen 10). */
export interface TaskSource {
  student?: {
    id: number;
    name: string;
    phone: string | null;
    debt: number;
    lastCall: SourceCall | null;
  };
  promise?: { date: Date; amount: number | null; comment: string | null };
  /** CALLBACK: the call that asked for it. */
  previousCall?: SourceCall;
  /** What «Qo'ng'iroqni yozish» pre-fills in the call dialog. */
  callReason?: CallReason;
  lead?: {
    id: string;
    name: string;
    phone: string;
    source: string | null;
    createdAt: Date;
  };
}

const CALL_SELECT = {
  createdAt: true,
  outcome: true,
  note: true,
  reason: true,
  calledBy: { select: { firstName: true, lastName: true } },
} as const;

const callLine = (c: {
  createdAt: Date;
  outcome: CallOutcome;
  note: string | null;
  calledBy: { firstName: string; lastName: string };
}): SourceCall => ({
  at: c.createdAt,
  outcome: c.outcome,
  note: c.note,
  by: `${c.calledBy.lastName} ${c.calledBy.firstName}`.trim(),
});

async function studentFacts(db: Db, studentId: number, companyId: number) {
  const s = await db.student.findFirst({
    where: { id: studentId, companyId },
    select: { id: true, firstName: true, lastName: true, phone: true, balance: true },
  });
  if (!s) return null;
  const last = await db.callLog.findFirst({
    where: { studentId, companyId },
    orderBy: { createdAt: 'desc' },
    select: CALL_SELECT,
  });
  return {
    id: s.id,
    name: studentName(s),
    phone: s.phone,
    debt: Math.max(0, -s.balance),
    lastCall: last ? callLine(last) : null,
  };
}

/** Null for a manual task, «Dars bo'ldimi?» (its own prompt) or a source that is gone. */
export async function loadTaskSource(
  db: Db,
  t: { kind: TaskKind; sourceKey: string | null; companyId: number },
): Promise<TaskSource | null> {
  const id = t.sourceKey?.slice(t.sourceKey.indexOf(':') + 1);
  if (!id) return null;
  switch (t.kind) {
    case 'BROKEN_PROMISE': {
      const p = await db.paymentPromise.findFirst({
        where: { id, companyId: t.companyId },
        select: { promiseDate: true, promisedAmount: true, comment: true, studentId: true },
      });
      const student = p && (await studentFacts(db, p.studentId, t.companyId));
      if (!p || !student) return null;
      return {
        student,
        promise: { date: p.promiseDate, amount: p.promisedAmount, comment: p.comment },
        callReason: 'DEBT',
      };
    }
    case 'CALLBACK': {
      const c = await db.callLog.findFirst({
        where: { id, companyId: t.companyId },
        select: { ...CALL_SELECT, studentId: true },
      });
      const student = c && (await studentFacts(db, c.studentId, t.companyId));
      if (!c || !student) return null;
      return { student, previousCall: callLine(c), callReason: c.reason };
    }
    case 'UNCALLED_LEAD': {
      const l = await db.lead.findFirst({
        where: { id, companyId: t.companyId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          createdAt: true,
          source: { select: { name: true } },
        },
      });
      if (!l) return null;
      return {
        lead: {
          id: l.id,
          name: `${l.lastName} ${l.firstName}`.trim(),
          phone: l.phone,
          source: l.source?.name ?? null,
          createdAt: l.createdAt,
        },
      };
    }
    default:
      return null;
  }
}
```

(`LESSON_QUESTION` reaches `default` — its card is the existing `UnmarkedLessonPrompt`.) If `Student.phone` is non-nullable in the schema, keep the `string | null` type anyway: the client handles both.

- [ ] **Step 3: `detail` returns it** — `tasks-read.service.ts`: `import { loadTaskSource } from './task-source';` and in `detail`, the return becomes:

```ts
    return {
      task: toTaskDetail(row),
      events: events.reverse(),
      access,
      batch,
      // A system task's card (spec screen 10); null for the rest.
      source: await loadTaskSource(this.prisma, row),
    };
```

In `tasks-read.service.spec.ts`, every expectation that matches the whole `detail` answer with `toEqual` gains `source: null` (their fixtures are MANUAL tasks, so no query runs). Add one test: a `CALLBACK` row whose `sourceKey` is `calllog:c1` → `detail(...).source` comes from `loadTaskSource` (mock `./task-source` with `jest.mock` and assert it was called with `(prisma, row)` and its value is returned).

- [ ] **Step 4: Gate and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-source.ts src/tasks/task-source.spec.ts src/tasks/tasks-read.service.ts src/tasks/tasks-read.service.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks/task-source.spec.ts src/tasks/tasks-read.service.spec.ts src/tasks/tasks.controller.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-source.ts server/src/tasks/task-source.spec.ts server/src/tasks/tasks-read.service.ts server/src/tasks/tasks-read.service.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): task sheet carries the source of a system task" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The 21:00 report's task line

**Files:**
- Create: `server/src/tasks/task-report-figures.ts`, `server/src/tasks/task-report-figures.spec.ts`
- Create: `server/src/telegram-groups/utils/task-line.util.ts`, `server/src/telegram-groups/utils/task-line.util.spec.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts`, `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`

**Interfaces:**
- Consumes: `branchIdWhere`, `ReportBranchIds` (`common/finance/report-branch-scope.ts`); `OPEN_STATUSES`; `escapeHtml` (`telegram-groups/utils/format.util.ts`).
- Produces: `interface TaskReportFigures { open: number; overdue: number; leader: { name: string; overdue: number } | null }`, `loadTaskReportFigures(db, companyId, branchIds, now?)`, `buildTaskLine(f: TaskReportFigures): string | null`.

- [ ] **Step 1: Failing tests**

`server/src/telegram-groups/utils/task-line.util.spec.ts`:

```ts
import { buildTaskLine } from './task-line.util';

describe('buildTaskLine — spec §4 screen 5', () => {
  it('no line while nothing is overdue', () => {
    expect(buildTaskLine({ open: 12, overdue: 0, leader: null })).toBeNull();
  });
  it('open, overdue and who is most behind', () => {
    expect(buildTaskLine({ open: 12, overdue: 4, leader: { name: 'Aziz Rahimov', overdue: 3 } })).toBe(
      "📋 Topshiriqlar: ochiq <b>12</b>, muddati o'tgan <b>4</b>. Eng ko'p kechikkan: Aziz Rahimov — <b>3</b>",
    );
  });
  it('without a name when the person is gone; a name is HTML-escaped', () => {
    expect(buildTaskLine({ open: 2, overdue: 1, leader: null })).toBe(
      "📋 Topshiriqlar: ochiq <b>2</b>, muddati o'tgan <b>1</b>.",
    );
    expect(buildTaskLine({ open: 2, overdue: 1, leader: { name: 'A <b>', overdue: 1 } })).toContain('A &lt;b&gt;');
  });
});
```

`server/src/tasks/task-report-figures.spec.ts`:

```ts
import { loadTaskReportFigures } from './task-report-figures';

const NOW = new Date('2026-10-12T16:00:00.000Z');
const OPEN = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];

it("counts open and overdue tasks of the report's branches and names the most behind", async () => {
  const db = {
    task: { count: jest.fn(async ({ where }: any) => (where.dueAt ? 4 : 12)) },
    taskParticipant: { groupBy: jest.fn().mockResolvedValue([{ userId: 40, _count: { userId: 3 } }]) },
    user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Aziz', lastName: 'Rahimov' }) },
  };
  expect(await loadTaskReportFigures(db as any, 1, [2], NOW)).toEqual({
    open: 12,
    overdue: 4,
    leader: { name: 'Aziz Rahimov', overdue: 3 },
  });
  const scope = { companyId: 1, status: { in: OPEN }, branchId: { in: [2] } };
  expect(db.task.count).toHaveBeenCalledWith({ where: scope });
  expect(db.task.count).toHaveBeenCalledWith({ where: { ...scope, dueAt: { lt: NOW } } });
  expect(db.taskParticipant.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ where: { role: 'ASSIGNEE', task: { ...scope, dueAt: { lt: NOW } } } }),
  );
});

it('the whole company when the report has no branch filter', async () => {
  const db = {
    task: { count: jest.fn().mockResolvedValue(0) },
    taskParticipant: { groupBy: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn() },
  };
  expect(await loadTaskReportFigures(db as any, 1, null, NOW)).toEqual({ open: 0, overdue: 0, leader: null });
  expect(db.task.count.mock.calls[0][0].where.branchId).toBeUndefined();
});
```

In `telegram-group-daily-report.service.spec.ts`: extend `State` with `tasksOpen?: number; tasksOverdue?: number; taskLeader?: { userId: number; count: number; firstName: string; lastName: string } | null;`. In `makePrisma`, add `task`, `taskParticipant` and `user.findUnique` ONLY when `state.tasksOpen !== undefined` (spread `...(state.tasksOpen !== undefined ? { task: …, taskParticipant: … } : {})` and add `findUnique` to `user`), so every older test keeps a client without them. Tests in the main describe:

```ts
  it('prints the task line above «Diqqat» when tasks are overdue', async () => {
    const state = { ...defaultState(), tasksOpen: 12, tasksOverdue: 4, taskLeader: { userId: 40, count: 3, firstName: 'Aziz', lastName: 'Rahimov' } };
    const service = await buildService(makePrisma(state), makeSalary(state));
    const { message } = await service.build(1, null);
    const line = "📋 Topshiriqlar: ochiq <b>12</b>, muddati o'tgan <b>4</b>. Eng ko'p kechikkan: Aziz Rahimov — <b>3</b>";
    expect(message).toContain(line);
    expect(message.indexOf(line)).toBeLessThan(message.indexOf('🚩'));
  });

  it('no task line when nothing is overdue', async () => {
    const state = { ...defaultState(), tasksOpen: 12, tasksOverdue: 0, taskLeader: null };
    const { message } = await (await buildService(makePrisma(state), makeSalary(state))).build(1, null);
    expect(message).not.toContain('Topshiriqlar:');
  });

  it('a failing task query drops only the line', async () => {
    const state = defaultState(); // no task model on the client: the query throws
    const { message } = await (await buildService(makePrisma(state), makeSalary(state))).build(1, null);
    expect(message).not.toContain('Topshiriqlar:');
    expect(message).toContain('🚩');
  });
```

(`task.count` mock: `where.dueAt ? state.tasksOverdue : state.tasksOpen`; `taskParticipant.groupBy`: `state.taskLeader ? [{ userId, _count: { userId: count } }] : []`; `user.findUnique`: the leader's names.) Check `build`'s real signature/branch argument in the file's happy-path test and copy it.

Run: `npx jest src/telegram-groups src/tasks/task-report-figures.spec.ts` — FAIL.

- [ ] **Step 2: Implement**

`server/src/tasks/task-report-figures.ts`:

```ts
import type { PrismaService } from '../prisma/prisma.service';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { OPEN_STATUSES } from './task-transitions';

export interface TaskReportFigures {
  open: number;
  overdue: number;
  /** The assignee with the most overdue tasks; null when none or gone. */
  leader: { name: string; overdue: number } | null;
}

/**
 * The 21:00 report's task line (spec §4 screen 5), in the report's branch
 * scope. Read only. System tasks count too, like «Yuklama».
 */
export async function loadTaskReportFigures(
  db: Pick<PrismaService, 'task' | 'taskParticipant' | 'user'>,
  companyId: number,
  branchIds: ReportBranchIds,
  now = new Date(),
): Promise<TaskReportFigures> {
  const open = {
    companyId,
    status: { in: [...OPEN_STATUSES] },
    ...branchIdWhere(branchIds),
  };
  const late = { ...open, dueAt: { lt: now } };
  const [openCount, overdue, top] = await Promise.all([
    db.task.count({ where: open }),
    db.task.count({ where: late }),
    db.taskParticipant.groupBy({
      by: ['userId'],
      where: { role: 'ASSIGNEE', task: late },
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 1,
    }),
  ]);
  const first = top[0];
  const u = first
    ? await db.user.findUnique({
        where: { id: first.userId },
        select: { firstName: true, lastName: true },
      })
    : null;
  return {
    open: openCount,
    overdue,
    leader:
      first && u
        ? { name: `${u.firstName} ${u.lastName}`.trim(), overdue: first._count.userId }
        : null,
  };
}
```

`server/src/telegram-groups/utils/task-line.util.ts`:

```ts
import type { TaskReportFigures } from '../../tasks/task-report-figures';
import { escapeHtml } from './format.util';

/** «Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K»; null when M = 0. */
export function buildTaskLine(f: TaskReportFigures): string | null {
  if (f.overdue === 0) return null;
  const head = `📋 Topshiriqlar: ochiq <b>${f.open}</b>, muddati o'tgan <b>${f.overdue}</b>.`;
  return f.leader
    ? `${head} Eng ko'p kechikkan: ${escapeHtml(f.leader.name)} — <b>${f.leader.overdue}</b>`
    : head;
}
```

`telegram-group-daily-report.service.ts`: imports `loadTaskReportFigures` and `buildTaskLine`; add the private method next to `computeMonthCharges`:

```ts
  /**
   * The task line (spec §4 screen 5). Not a 🚩 flag: system tasks are overdue
   * most evenings and would turn every day 🟡. A failure drops the line only.
   */
  private async computeTaskLine(
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<string | null> {
    try {
      return buildTaskLine(
        await loadTaskReportFigures(this.prisma, companyId, branchIds),
      );
    } catch (err) {
      this.logger.warn(`task line failed: ${(err as Error).message}`);
      return null;
    }
  }
```

Add it to the second `Promise.all` (`const [expectedValue, salary, canonicalNet, attribution, monthCharges, taskLine] = …, this.computeTaskLine(companyId, branchIds)]`), and right before the `// 🚩 Diqqat (self-suppressing)` block:

```ts
    if (taskLine) {
      lines.push('');
      lines.push(taskLine);
    }
```

Add `📋 Topshiriqlar` to the class comment's section list (above `🚩 Diqqat`).

Run the tests: PASS.

- [ ] **Step 3: Gate and commit**

Per `CLAUDE.local.md`: prettier → eslint once → jest on `src/telegram-groups`. If eslint flags `no-irregular-whitespace` in the spec, run `perl -i -pe 's/\xc2\xa0/\\u00A0/g' <file>` once.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-report-figures.ts src/tasks/task-report-figures.spec.ts src/telegram-groups/utils/task-line.util.ts src/telegram-groups/utils/task-line.util.spec.ts src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts
npx eslint src/telegram-groups src/tasks --quiet
npx jest src/telegram-groups src/tasks/task-report-figures.spec.ts
npm run typecheck
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-report-figures.ts server/src/tasks/task-report-figures.spec.ts server/src/telegram-groups/utils/task-line.util.ts server/src/telegram-groups/utils/task-line.util.spec.ts server/src/telegram-groups/telegram-group-daily-report.service.ts server/src/telegram-groups/telegram-group-daily-report.service.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(reports): task line in the 21:00 report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Client — the source card and its one button

**Files:**
- Modify: `client/src/hooks/use-tasks.ts`
- Create: `client/src/components/tasks/task-source-rules.ts`, `client/src/components/tasks/task-source-rules.test.ts`
- Create: `client/src/components/tasks/task-source-card.tsx`
- Modify: `client/src/components/tasks/task-drawer.tsx`
- Modify: `client/src/components/tasks/task-feed-text.ts`, `client/src/components/tasks/task-feed-text.test.ts`

**Interfaces:**
- Consumes: `GET /tasks/:id` → `source` (Task 7); `LogCallDialog`, `LogCallPrefill` (`components/outreach/log-call-dialog.tsx`); `CALL_OUTCOME_INFO`, `CallOutcome`, `CallReason` (`components/outreach/outreach-types.ts`); `taskEntityHref` (`task-href.ts`); `isOpenStatus` (`task-labels.ts`); `Can`, `makeCan` (`lib/permission-check.ts`); `usePermissions` (`hooks/use-permissions.ts`).
- Produces: `TaskSource`, `TaskSourceCall` types; `sourceAction(task, source, can): SourceAction | null`; `sourceFacts(source): SourceFact[]`; `<TaskSourceCard task source />`.

- [ ] **Step 1: Types** — `client/src/hooks/use-tasks.ts`: add `import type { CallOutcome, CallReason } from "@/components/outreach/outreach-types";` and, next to the other types:

```ts
export interface TaskSourceCall { at: string; outcome: CallOutcome; note: string | null; by: string }
/** A system task's source (`GET /tasks/:id` → `source`, spec screen 10); null for the rest. */
export interface TaskSource {
  student?: { id: number; name: string; phone: string | null; debt: number; lastCall: TaskSourceCall | null };
  promise?: { date: string; amount: number | null; comment: string | null };
  previousCall?: TaskSourceCall;
  callReason?: CallReason;
  lead?: { id: string; name: string; phone: string; source: string | null; createdAt: string };
}
```

and `TaskDetailPayload` gains `source?: TaskSource | null` (optional: an older server answers without it).

- [ ] **Step 2: Failing test** — `client/src/components/tasks/task-source-rules.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { TaskSource } from "@/hooks/use-tasks";
import { formatPrice } from "@/lib/format-utils";
import { makeCan } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
import { CALL_ACTION, LEAD_ACTION, sourceAction, sourceFacts } from "./task-source-rules";

const call = { at: "2026-10-09T06:30:00.000Z", outcome: "NO_ANSWER" as const, note: null, by: "Karimova Dilnoza" };
const student: TaskSource = {
  student: { id: 10001, name: "Rahimov Aziz", phone: "901234567", debt: 450000, lastCall: call },
  promise: { date: "2026-10-09T18:59:59.999Z", amount: 200000, comment: "Oylik kelganda" },
  callReason: "DEBT",
};
const lead: TaskSource = {
  lead: { id: "l1", name: "Karimova Dilnoza", phone: "931112233", source: "Instagram", createdAt: "2026-10-08T05:15:00.000Z" },
};
const open = { status: "NEW" as const };
const all = makeCan(new Set<PermissionKey>(["calls.log", "leads.view"]));
const none = makeCan(new Set<PermissionKey>());

describe("sourceAction — one button that does the job", () => {
  it("a student task opens the call dialog for that student, with the reason", () => {
    expect(sourceAction(open, student, all)).toEqual({
      kind: "call",
      label: CALL_ACTION,
      prefill: { studentId: 10001, studentLabel: "Rahimov Aziz", studentPhone: "901234567", reason: "DEBT" },
    });
  });
  it("a callback with no reason logs as «Boshqa»", () => {
    const s: TaskSource = { student: student.student };
    expect(sourceAction(open, s, all)).toMatchObject({ prefill: { reason: "OTHER" } });
  });
  it("a lead task opens the lead's drawer", () => {
    expect(sourceAction(open, lead, all)).toEqual({ kind: "lead", label: LEAD_ACTION, href: "/leads?lead=l1" });
  });
  it("no button without the right, on a closed task, or with no source", () => {
    expect(sourceAction(open, student, none)).toBeNull();
    expect(sourceAction(open, lead, none)).toBeNull();
    expect(sourceAction({ status: "DONE" }, student, all)).toBeNull();
    expect(sourceAction(open, null, all)).toBeNull();
  });
});

describe("sourceFacts — the card's rows on the Tashkent clock", () => {
  it("a broken promise: student, phone, debt, promise, last call", () => {
    expect(sourceFacts(student)).toEqual([
      { label: "O'quvchi", value: "Rahimov Aziz" },
      { label: "Telefon", value: "+998 90 123 45 67" },
      { label: "Qarz", value: `${formatPrice(450000)} so'm` },
      { label: "Va'da", value: `09.10 gacha · ${formatPrice(200000)} so'm` },
      { label: "Va'da izohi", value: "Oylik kelganda" },
      { label: "Oxirgi qo'ng'iroq", value: "09.10, 11:30 · Javob bermadi · Karimova Dilnoza" },
    ]);
  });
  it("a callback names the call that asked for it; no debt and no call say so", () => {
    const s: TaskSource = {
      student: { id: 1, name: "A B", phone: null, debt: 0, lastCall: null },
      previousCall: { ...call, note: "Ertaga qayta" },
    };
    expect(sourceFacts(s)).toEqual([
      { label: "O'quvchi", value: "A B" },
      { label: "Telefon", value: "—" },
      { label: "Qarz", value: "Qarz yo'q" },
      { label: "Qayta qo'ng'iroq so'ralgan", value: "09.10, 11:30 · Javob bermadi · Karimova Dilnoza — «Ertaga qayta»" },
      { label: "Oxirgi qo'ng'iroq", value: "Qo'ng'iroq qilinmagan" },
    ]);
  });
  it("a lead: name, phone, source, when it came", () => {
    expect(sourceFacts(lead)).toEqual([
      { label: "Lid", value: "Karimova Dilnoza" },
      { label: "Telefon", value: "+998 93 111 22 33" },
      { label: "Manba", value: "Instagram" },
      { label: "Kelgan", value: "08.10, 10:15" },
    ]);
  });
});
```

Run (from `client/`): `npx vitest run src/components/tasks/task-source-rules.test.ts` (if the runner refuses the config, `npx vitest --config vitest.config.ts run src/components/tasks/task-source-rules.test.ts`). Expected: FAIL.

- [ ] **Step 3: The rules** — `client/src/components/tasks/task-source-rules.ts`

```ts
import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { TaskDetail, TaskSource, TaskSourceCall } from "@/hooks/use-tasks";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import type { Can } from "@/lib/permission-check";
import { tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";
import { taskEntityHref } from "./task-href";
import { isOpenStatus } from "./task-labels";

export const CALL_ACTION = "Qo'ng'iroqni yozish";
export const LEAD_ACTION = "Lidni ochish";

export type SourceAction =
  | { kind: "call"; label: string; prefill: LogCallPrefill }
  | { kind: "lead"; label: string; href: string };

/**
 * The one button of a system task's card (spec screen 10), doing the job where
 * it is done: a call is logged in the outreach dialog (which closes the task on
 * the server), a lead is called from its drawer. None on a closed task or for a
 * viewer the server would refuse.
 */
export function sourceAction(task: Pick<TaskDetail, "status">, source: TaskSource | null | undefined, can: Can): SourceAction | null {
  if (!source || !isOpenStatus(task.status)) return null;
  if (source.student) {
    if (!can("calls.log")) return null;
    const s = source.student;
    return {
      kind: "call",
      label: CALL_ACTION,
      prefill: { studentId: s.id, studentLabel: s.name, studentPhone: s.phone, reason: source.callReason ?? "OTHER" },
    };
  }
  if (source.lead && can("leads.view")) {
    const href = taskEntityHref("Lead", source.lead.id, can);
    return href ? { kind: "lead", label: LEAD_ACTION, href } : null;
  }
  return null;
}

export interface SourceFact { label: string; value: string }

const when = (iso: string) => `${tashkentDdMm(iso)}, ${tashkentHhmm(iso)}`;
const callLine = (c: TaskSourceCall) =>
  `${when(c.at)} · ${CALL_OUTCOME_INFO[c.outcome]?.label ?? c.outcome} · ${c.by}${c.note ? ` — «${c.note}»` : ""}`;

/** The card's rows: who, phone, money, the calls; for a lead, where it came from and when. */
export function sourceFacts(source: TaskSource): SourceFact[] {
  const out: SourceFact[] = [];
  if (source.student) {
    const s = source.student;
    out.push(
      { label: "O'quvchi", value: s.name },
      { label: "Telefon", value: formatPhone(s.phone) },
      { label: "Qarz", value: s.debt > 0 ? `${formatPrice(s.debt)} so'm` : "Qarz yo'q" },
    );
    if (source.promise) {
      const p = source.promise;
      out.push({ label: "Va'da", value: `${tashkentDdMm(p.date)} gacha${p.amount ? ` · ${formatPrice(p.amount)} so'm` : ""}` });
      if (p.comment) out.push({ label: "Va'da izohi", value: p.comment });
    }
    if (source.previousCall) out.push({ label: "Qayta qo'ng'iroq so'ralgan", value: callLine(source.previousCall) });
    out.push({ label: "Oxirgi qo'ng'iroq", value: s.lastCall ? callLine(s.lastCall) : "Qo'ng'iroq qilinmagan" });
  }
  if (source.lead) {
    const l = source.lead;
    out.push(
      { label: "Lid", value: l.name },
      { label: "Telefon", value: formatPhone(l.phone) },
      { label: "Manba", value: l.source ?? "Ko'rsatilmagan" },
      { label: "Kelgan", value: when(l.createdAt) },
    );
  }
  return out;
}
```

Run the test: PASS.

- [ ] **Step 4: The card** — `client/src/components/tasks/task-source-card.tsx`

```tsx
"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { ExternalLink, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogCallDialog } from "@/components/outreach/log-call-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import type { TaskDetail, TaskSource } from "@/hooks/use-tasks";
import { sourceAction, sourceFacts } from "./task-source-rules";

/**
 * Spec screen 10: what a system task is about and the one button that does
 * the job. Saving the call closes the task on the server; the SSE
 * `task.updated` that follows reloads this drawer.
 */
export function TaskSourceCard({ task, source }: { task: TaskDetail; source: TaskSource }) {
  const can = usePermissions((s) => s.can);
  const [calling, setCalling] = useState(false);
  const action = sourceAction(task, source, can);
  return (
    <section className="space-y-3 rounded-md border p-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        {sourceFacts(source).map((f) => (
          <Fragment key={f.label}>
            <dt className="text-muted-foreground">{f.label}</dt>
            <dd className="min-w-0 break-words">{f.value}</dd>
          </Fragment>
        ))}
      </dl>
      {action?.kind === "call" && (
        <>
          <Button size="sm" className="w-full" onClick={() => setCalling(true)}>
            <Phone className="mr-1 size-4" />{action.label}
          </Button>
          <LogCallDialog open={calling} onOpenChange={setCalling} prefill={action.prefill} />
        </>
      )}
      {action?.kind === "lead" && (
        <Button size="sm" className="w-full" asChild>
          <Link href={action.href}><ExternalLink className="mr-1 size-4" />{action.label}</Link>
        </Button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: The drawer** — `task-drawer.tsx`: `import { TaskSourceCard } from "./task-source-card";`, in `DrawerBody` destructure `source` as well (`const { task, events, access, batch, source } = detail;`), and right after the `{system && (<p …>Bu topshiriqni tizim berdi…</p>)}` block:

```tsx
        {system && source && <TaskSourceCard task={task} source={source} />}
```

Fields stay locked as for «Dars bo'ldimi?» (`canEdit` is already false for `kind !== "MANUAL"`); the footer keeps only «Boshladim» (`footerActions`).

- [ ] **Step 6: History wording** — `task-feed-text.ts`, replace the `AUTO_CLOSED` case:

```ts
    case "AUTO_CLOSED":
      return { actor: SYSTEM_NAME, text: AUTO_CLOSE_TEXT[str(ev.meta, "reason") ?? ""] ?? "yopdi" };
```

with, above the function:

```ts
/** `TaskEvent.meta.reason` of a close by the system (server `AutoCloseReason` + the lesson ones). */
const AUTO_CLOSE_TEXT: Record<string, string> = {
  LESSON_ANSWERED: "yopdi (darsga javob berildi)",
  GROUP_DELETED: "yopdi (guruh o'chirildi)",
  PAYMENT_RECEIVED: "yopdi (to'lov qilindi)",
  CALL_LOGGED: "yopdi (qo'ng'iroq yozildi)",
  LEAD_CALLED: "yopdi (lidga qo'ng'iroq qilindi)",
  LEAD_STATUS_CHANGED: "yopdi (lid holati o'zgardi)",
  LEAD_GONE: "yopdi (lid endi qo'ng'iroq kutmaydi)",
};
```

`task-feed-text.test.ts`, next to the two existing `AUTO_CLOSED` assertions:

```ts
    expect(line({ type: "AUTO_CLOSED", actorId: null, actor: null, meta: { reason: "PAYMENT_RECEIVED" } })).toBe("Tizim yopdi (to'lov qilindi)");
    expect(line({ type: "AUTO_CLOSED", actorId: null, actor: null, meta: { reason: "CALL_LOGGED" } })).toBe("Tizim yopdi (qo'ng'iroq yozildi)");
    expect(line({ type: "AUTO_CLOSED", actorId: null, actor: null, meta: { reason: "LEAD_CALLED" } })).toBe("Tizim yopdi (lidga qo'ng'iroq qilindi)");
```

(Check the file's `line(...)` helper and its existing expectations: if an unknown reason used to fall back to «darsga javob berildi» and a test pins that, keep `LESSON_ANSWERED` as the fallback instead of plain «yopdi».)

- [ ] **Step 7: Client gate (no Prettier) and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/components/tasks src/hooks/use-tasks.ts
npx vitest run src/components/tasks
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/hooks/use-tasks.ts client/src/components/tasks/task-source-rules.ts client/src/components/tasks/task-source-rules.test.ts client/src/components/tasks/task-source-card.tsx client/src/components/tasks/task-drawer.tsx client/src/components/tasks/task-feed-text.ts client/src/components/tasks/task-feed-text.test.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): source card and its one button on system tasks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR-0080, server and client docs, guide and news

**Files:**
- Create: `docs/adr/0080-avtomatik-topshiriqlar.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`
- Modify: `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR** — first `grep -n "^| \[00" /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/docs/adr/README.md | tail -3` and confirm 0080 is free. `docs/adr/0080-avtomatik-topshiriqlar.md`:

```markdown
# ADR-0080 — Avtomatik topshiriqlar: buzilgan va'da, qayta qo'ng'iroq, qo'ng'iroqsiz lid

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (tizim topshirig'ini faqat manbasi yopadi), ADR-0054 («Dars bo'ldimi?»: zina va «birinchi bosgan oladi»), ADR-0072 (to'lov va'dasi, 09:00 tekshiruv), ADR-0076 (09:00 ro'yxati qo'ng'iroqchada — shu qaror uning oluvchilarini o'zgartiradi), ADR-0078 (Telegram), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §6.6, §7, `server/src/tasks/task-auto-rules.ts`, migratsiya `20261011090000_task_auto_lead_start`

## Kontekst

Uch ish hech kimning ro'yxatida yo'q edi: buzilgan to'lov va'dasidan keyingi qo'ng'iroq (administratorga ertalab bitta umumiy ro'yxat kelardi — kim qo'ng'iroq qilgani noma'lum), qo'ng'iroq natijasidagi «Keyingi bog'lanish sanasi» (hech qachon eslatilmasdi) va hech kim qo'ng'iroq qilmagan yangi lid.

## Qaror

1. Tizim uch turdagi topshiriqni o'zi beradi. Muallif — Tizim; tahrirlab, bekor qilib, qo'lda yopib bo'lmaydi; bitta manbaga bitta ochiq topshiriq (`sourceKey`, qisman unikal indeks); birinchi «Boshladim» bosgan administrator oladi, boshqalarniki yo'qoladi.

   | Tur | Qachon | Kimga | Muddat | O'zi yopiladi |
   | --- | --- | --- | --- | --- |
   | Buzilgan va'da | 09:00 tekshiruv va'dani buzganda, qarzi 1 000 so'mdan ko'p har o'quvchiga bittadan | filial administratorlari (yo'q bo'lsa direktorlar, keyin CEO) | o'sha kuni 18:00 | o'quvchi to'lov qilsa yoki unga yangi qo'ng'iroq yozilsa |
   | Qayta qo'ng'iroq | qo'ng'iroq «Keyingi bog'lanish sanasi» bilan yozilganda | qo'ng'iroqni yozgan xodim | o'sha sana 18:00; Telegram xabari o'sha kuni 08:00 da | o'quvchi to'lov qilsa yoki unga yangi qo'ng'iroq yozilsa |
   | Qo'ng'iroqsiz lid | har soat 08:00–18:00, dushanba–shanba: 24 soatdan beri qo'ng'iroq qilinmagan yangi lid | lid filiali administratorlari; filialsiz lid — kompaniyaning administratorlari | o'sha kuni 18:00 | lidga «qo'ng'iroq qilindi» belgisi qo'yilsa, lid holati o'zgarsa yoki u arxivlansa |

2. Muddat yakshanba yoki filial bayramiga tushsa yoki allaqachon o'tgan bo'lsa — keyingi ish kuni 18:00.
3. **Administratorlarga ertalabki «Bugun N ta to'lov va'dasi bajarilmadi» ro'yxati endi bormaydi** — ular har o'quvchi uchun topshiriq oladi (ikkalasi birga emas, spec §6.6). CEO ro'yxatni avvalgidek oladi.
4. Qo'ng'iroqsiz lid topshirig'i faqat shu qaror kuchga kirgandan keyin kelgan lidlarga beriladi: `Company.uncalledLeadTasksFrom` — migratsiya ishlagan payt (yangi kompaniyada — yaratilgan payt). Oldin kelib qo'ng'iroqsiz turgan lidlarga topshiriq berilmaydi.
5. Kechki 21:00 hisobotida bitta qator: «Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K» (M = 0 bo'lsa qator yo'q). U «Diqqat» belgisi emas, kunning rangini o'zgartirmaydi.

## Ko'rib chiqilgan muqobillar

- Administratorga ro'yxat ham, topshiriq ham — bir ish uchun ikki xabar; spec §6.6 rad etgan.
- Boshlanish sanasini kodga yozish — deploy kuni oldindan noma'lum; erta sana eski lidlarga topshiriq beradi.
- Boshlanish sanasini sozlamalar jadvaliga yozish — hech kim o'zgartirmaydigan kalit sozlamalar ro'yxatida turadi va alohida ma'lumot qadami kerak.

## Oqibatlari

- Administrator ertalab ro'yxat o'rniga topshiriqlarni ko'radi; qo'ng'iroqni topshiriq varag'idagi «Qo'ng'iroqni yozish» tugmasi bilan yozadi va topshiriq o'zi yopiladi.
- Qo'ng'iroq natijasidagi sana endi ishlaydi: o'sha kuni xodimga topshiriq turadi.
- Lid bo'limi butunlay arxivlansa hodisa chiqmaydi — topshiriq keyingi soatlik tekshiruvda yopiladi.
```

`docs/adr/README.md`: add the row after 0079:

```markdown
| [0080](0080-avtomatik-topshiriqlar.md) | Tizim uch topshiriqni o'zi beradi: buzilgan va'da (har o'quvchiga, administratorlarga — ertalabki ro'yxat o'rniga), qayta qo'ng'iroq (qo'ng'iroqdagi sana kuni), qo'ng'iroqsiz lid (24 soat, faqat yangi lidlar); faqat manbasi yopadi; 21:00 hisobotida topshiriqlar qatori | Qabul qilindi | 2026-10-11 |
```

- [ ] **Step 2: `server/CLAUDE.md`**

(a) In «Tasks (`src/tasks/`)», after the «Lesson task» bullet, add:

```markdown
- **Automatic tasks** (ADR-0080; spec §7). Every rule is in `task-auto-rules.ts` (`AUTO_RULES`: priority, entity type, `sourceKey` prefix, `closesOn`; texts, `systemDueAt`, the assignee ladder). Writers: `task-auto-write.ts` — `createSystemTask` (author Tizim, one OPEN task per `sourceKey` via `task_open_source_unique`, a concurrent duplicate returns null; time rows through `scheduleTaskOutbox`) and `autoCloseTasks` (DONE + `AUTO_CLOSED` with `meta.reason`, unsent outbox rows dropped; never touches `MANUAL` or `LESSON_QUESTION`). Creators emit the ordinary `task.assigned` (`actorId: null`, `created: true`), so the bell, push, SSE and Telegram need nothing special.
  - `BROKEN_PROMISE` — `TaskAutoService` on `payment-promise.overdue`: one task per promise whose student still owes `MIN_ALERT_DEBT`, `sourceKey` `promise:<id>`, entity Student, branch ladder (`autoTaskAssigneeIds`), due today 18:00.
  - `CALLBACK` — `TaskAutoService` on `call-log.created` (emitted by `CallLogsService.create` after its writes) when `followUpAt` is set: `calllog:<id>`, the caller only (while active), due the follow-up day 18:00. Its Telegram notice waits for 08:00 of that day (`telegramNotBefore`, held as a `NOTICE` outbox row); the bell gets it at once.
  - `UNCALLED_LEAD` — `TaskAutoLeadsService`, `@Cron('0 0 8-18 * * 1-6')` Tashkent: NEW, uncalled, live leads older than 24 h and created at or after `Company.uncalledLeadTasksFrom` (the migration's moment — older leads never get one), `lead:<id>`, the lead's branch ladder (no branch → the company's administrators, then directors, then CEOs), due today 18:00; at most 200 a company a run. The same run first closes tasks whose lead no longer waits (`LEAD_GONE`) — a section archived with its leads sends no event.
  - **Due:** 18:00 Tashkent, off Sundays and the branch's holidays; a time already past moves to the next working day 18:00 (`systemDueAt`) — a task is never born overdue.
  - **Closing** is `TaskAutoCloseListener` alone: `payment.received` and `call-log.created` close the student's `BROKEN_PROMISE` / `CALLBACK` (never the callback the same call asked for), `lead.called` (`LeadsService.markCalled`, first mark only) and `entity.status.changed` for a Lead close `UNCALLED_LEAD`. Each close emits `task.auto-closed { task, reason }`: the resolver closes the task's bell rows, `TaskNotifyListener` refreshes open pages over SSE; no notice is written.
  - The first assignee to start one takes it (`claimSystemTask`, as «Dars bo'ldimi?»). `GET /tasks/:id` carries `source` (`task-source.ts`): the student (name, phone, debt, last call) with the promise or the call that asked for the callback and the reason the call dialog pre-fills, or the lead (name, phone, source, created).
  - **21:00 report:** one line above «🚩 Diqqat» — `📋 Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K` (`task-report-figures.ts` + `telegram-groups/utils/task-line.util.ts`), the report's branch scope, none when M = 0, not a flag (it never changes the day's colour), a failing query drops the line only.
```

(b) «Payment Module», the bullet «The 09:00 alert is one list per branch»: replace its recipient sentence so it reads «…emits ONE `payment-promise.overdue` per company + branch with the promise ids; `NotificationEventsListener` sends the list to the company **CEOs only** (ADR-0080 — the branch's administrators get one «Buzilgan va'da» task per student instead, `TaskAutoService`); it loads the rows…» and keep the rest.

(c) «Notifications», the resolver table: add a row after the `task.unassigned` row:

```markdown
  | `task.auto-closed` (an automatic task closed by its source, ADR-0080) | every notice of the task |
```

and in the «Known gaps» list, the first bullet's sentence about lists stays (it is still true for the CEOs' list).

- [ ] **Step 3: `client/CLAUDE.md`** — in «Tasks (`components/tasks/`, `hooks/use-tasks.ts`)», after the «Drops» bullet:

```markdown
- **System task card** (ADR-0080, spec screen 10): a «Buzilgan va'da», «Qayta qo'ng'iroq» or «Qo'ng'iroqsiz lid» task's drawer shows `TaskSourceCard` from `GET /tasks/:id` → `source`, with ONE button — «Qo'ng'iroqni yozish» (the outreach `LogCallDialog`, prefilled; needs `calls.log`) or «Lidni ochish» (`/leads?lead=`; needs `leads.view`). Saving the call closes the task on the server; the SSE `task.updated` reloads the drawer. Rows and the button come from `task-source-rules.ts` (vitest). Fields stay locked; «Dars bo'ldimi?» keeps its own prompt.
```

- [ ] **Step 4: Guide** — `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, a new section right after «## Tizim topshirig'i: «Dars bo'ldimi?»»:

```markdown
## Avtomatik topshiriqlar

«Dars bo'ldimi?» dan tashqari tizim yana uch topshiriqni o'zi beradi. Beruvchi «Tizim» deb yoziladi; ularni tahrirlab, bekor qilib yoki qo'lda «Bajarildi» ga o'tkazib bo'lmaydi — ish bajarilganda o'zi yopiladi. Bir nechta administratorga berilgan bo'lsa, birinchi «Boshladim» ni bosgan oladi, boshqalarning kartasi yo'qoladi.

- **«Buzilgan va'da».** Har kuni (dushanba–shanba) soat 09:00 da to'lov va'dasi buzilgan har o'quvchiga bittadan, filial administratorlariga (administrator bo'lmasa — direktorlarga, ular ham bo'lmasa — CEO ga). Muddati — o'sha kuni 18:00. O'quvchi to'lov qilsa yoki unga qo'ng'iroq natijasi yozilsa, o'zi yopiladi. Administratorlarga ertalabki «Bugun N ta to'lov va'dasi bajarilmadi» ro'yxati endi kelmaydi — uning o'rniga shu topshiriqlar; CEO ro'yxatni avvalgidek oladi.
- **«Qayta qo'ng'iroq».** Qo'ng'iroq natijasini yozganda «Keyingi bog'lanish sanasi» qo'ysangiz, o'sha kunga sizga topshiriq tushadi, muddati 18:00. Qo'ng'iroqchada darhol ko'rinadi, Telegram'ga esa o'sha kuni ertalab 08:00 da keladi. O'quvchi to'lov qilsa yoki unga yangi qo'ng'iroq yozilsa, o'zi yopiladi.
- **«Qo'ng'iroqsiz lid».** Yangi lidga 24 soat ichida hech kim qo'ng'iroq qilmasa (lid kartasida «qo'ng'iroq qilindi» belgisi qo'yilmasa), tizim har soatda (08:00–18:00, dushanba–shanba) tekshirib, lid filiali administratorlariga topshiriq beradi; filialsiz lid — kompaniyaning administratorlariga. Muddati — o'sha kuni 18:00. Lidga qo'ng'iroq belgisi qo'yilsa, lid o'quvchiga aylantirilsa, yo'qotilgan deb belgilansa yoki arxivlansa, o'zi yopiladi. Bu qoida u yoqilgandan keyin kelgan lidlarga ishlaydi; oldingi lidlarga topshiriq berilmaydi.
- Muddat yakshanba yoki filial bayramiga tushsa yoki allaqachon o'tgan bo'lsa (masalan, soat 18:00 dagi tekshiruv), keyingi ish kuni 18:00 ga qo'yiladi.
- **Varaqda** topshiriq nima haqida ekanini ko'rsatadigan karta turadi: o'quvchining ismi, telefoni, qarzi, va'dasi yoki qayta qo'ng'iroqni so'ragan qo'ng'iroq va oxirgi qo'ng'iroq; lid uchun — ismi, telefoni, manbasi va kelgan vaqti. Ostida bitta tugma: «Qo'ng'iroqni yozish» (qo'ng'iroq natijasi oynasi shu o'quvchi bilan ochiladi; saqlansa, topshiriq o'zi yopiladi) yoki «Lidni ochish».
- Telegram'da bunday topshiriq «Tizim topshirig'i» bo'lib keladi, faqat «Ochish» tugmasi bilan.
- **Kechki 21:00 hisobot** (Telegram guruhida) muddati o'tgan topshiriq bo'lsa, bitta qator qo'shadi: «Topshiriqlar: ochiq N, muddati o'tgan M. Eng ko'p kechikkan: <ism> — K».
```

In «## Xabarlar va eslatma» nothing changes. `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx` line ~51: change «Shu payt CEO'ga va filial administratorlariga har filial bo'yicha bitta xabar boradi:» to «Shu payt CEO'ga har filial bo'yicha bitta xabar boradi:», and after the sentence about the link add: «Filial administratorlariga ro'yxat bormaydi: ular har o'quvchi uchun «Buzilgan va'da» topshirig'ini oladi ([Topshiriqlar](/qollanma/boshlash/topshiriqlar)).»

Registry: in `client/src/qollanma/sahifalar/boshlash.ts`, entry `topshiriqlar`: append to `qisqacha` «Tizim yana uch topshiriqni o'zi beradi: buzilgan to'lov va'dasi, qo'ng'iroqdagi «Keyingi bog'lanish sanasi» va 24 soat qo'ng'iroqsiz turgan yangi lid; ular ish bajarilganda o'zi yopiladi.»; `adr` gets `"0080"`; `kalitSozlar` gets `"buzilgan va'da"`, `"qayta qo'ng'iroq"`, `"qo'ng'iroqsiz lid"`, `"avtomatik topshiriq"`; `yangilangan: "2026-10-11"`. In `sahifalar/tolovlar.ts`, entry `qarzdorlik`: `adr` gets `"0080"`, `yangilangan: "2026-10-11"`. (If the work ships on another day, use that day in all three places and in the news entry.)

News, top of `client/src/qollanma/yangiliklar.ts`:

```ts
  {
    sana: "2026-10-11",
    sarlavha: "Avtomatik topshiriqlar",
    matn: "Tizim endi uch topshiriqni o'zi beradi. «Buzilgan va'da» — ertalab 09:00 da va'dasi buzilgan har o'quvchiga bittadan, filial administratorlariga; administratorlarga ertalabki ro'yxat endi kelmaydi (CEO avvalgidek oladi). «Qayta qo'ng'iroq» — qo'ng'iroq natijasida «Keyingi bog'lanish sanasi» qo'yilsa, o'sha kunga qo'ng'iroqni yozgan xodimga; Telegram'ga o'sha kuni 08:00 da keladi. «Qo'ng'iroqsiz lid» — yangi lidga 24 soat ichida qo'ng'iroq qilinmasa, filial administratorlariga (bugundan keyin kelgan lidlar uchun). Muddati — 18:00. Topshiriq varag'ida o'quvchi yoki lid haqida karta va bitta tugma bor: «Qo'ng'iroqni yozish» yoki «Lidni ochish». Ish bajarilganda — to'lov qilinsa, qo'ng'iroq yozilsa, lidga qo'ng'iroq belgisi qo'yilsa — topshiriq o'zi yopiladi. Kechki 21:00 hisobotida muddati o'tgan topshiriqlar soni chiqadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "topshiriqlar" },
  },
```

- [ ] **Step 5: Check and commit** (client: no Prettier)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx vitest run src/qollanma
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add docs/adr/0080-avtomatik-topshiriqlar.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma/kontent/boshlash/topshiriqlar.mdx client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/sahifalar/tolovlar.ts client/src/qollanma/yangiliklar.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "docs: ADR-0080 automatic tasks, server and client notes, guide and news" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification

**Files:** none new; a fix lands in its own commit naming the failing gate. The throwaway database and probe live outside the repo (the probe script is deleted before any commit).

- [ ] **Step 1: Server gate — sequential, never two at once**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup diff --name-only origin/main -- server | grep '\.ts$'
```

Run `npx prettier --check` on exactly the listed files (paths relative to `server/`). Then, one after another:

```bash
npx eslint src --quiet
npm test
npm run typecheck
npm run build
```

Expected: no prettier diffs, 0 eslint errors, every suite green — including `event-wiring.spec.ts` (`call-log.created`, `lead.called`, `task.auto-closed` each emitted and heard), `task-write.single-source.spec.ts`, `direct-send.guard.spec.ts`, `tasks.module.di.spec.ts` (DI smoke with the three new providers) — typecheck and build clean.

- [ ] **Step 2: Client gate (no Prettier)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```

Expected: all clean (vitest fallback: `npx vitest --config vitest.config.ts run`).

- [ ] **Step 3: Throwaway PostgreSQL — the migration and the unique index** (recipe: `.superpowers/sdd/2026-10-10-topshiriqlar-5-qongiroqcha/task-4-report.md` lines 45–94; binaries in `/Library/PostgreSQL/18/bin`, TCP on port 5599, data under the session scratchpad; `server/.env` is never read for this — every command gets `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_auto_test` in its own environment).

1. Pre-change DDL, offline: `git show origin/main:server/prisma/schema.prisma > <scratchpad>/pre-schema.prisma`, then `DATABASE_URL=postgresql://u:p@127.0.0.1:1/none npx prisma migrate diff --from-empty --to-schema <scratchpad>/pre-schema.prisma --script --output <scratchpad>/pre-ddl.sql`.
2. `initdb`, `pg_ctl … -p 5599 … start`, `createdb task_auto_test`, `ALTER DATABASE task_auto_test SET timezone='UTC'`, `psql -f pre-ddl.sql`, then the hand-written index from `server/prisma/migrations/20261007120000_tasks_module/migration.sql` (the last two lines, `task_open_source_unique`).
3. Seed (with `session_replication_role = replica`): two `Company` rows (ids 1, 2).
4. `psql -f server/prisma/migrations/20261011090000_task_auto_lead_start/migration.sql` — the real file, unchanged. Check: both companies have the same `uncalledLeadTasksFrom`, equal to the time the ALTER ran (between timestamps taken before and after); then `INSERT` a third company a few seconds later — its value is its own insert time, later than the first two.
5. Unique index through the generated client: write `server/scripts/_probe-task-auto-dup.ts`

   ```ts
   import { run } from './lib/check-cli';

   void run(async (prisma) => {
     const data = { companyId: 1, kind: 'UNCALLED_LEAD' as const, title: 'probe', sourceKey: 'lead:probe' };
     await prisma.task.create({ data });
     try {
       await prisma.task.create({ data });
       console.log('SECOND CREATE PASSED — index missing');
     } catch (e) {
       const x = e as { code?: string; cause?: { code?: string } };
       console.log('duplicate refused:', x.code, x.cause?.code);
     }
     await prisma.task.updateMany({ where: { sourceKey: 'lead:probe' }, data: { status: 'DONE' } });
     await prisma.task.create({ data });
     console.log('new open task after the old one closed: ok');
   });
   ```

   Run it from `server/` with `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_auto_test npx ts-node --transpile-only scripts/_probe-task-auto-dup.ts` and check the header prints the 127.0.0.1:5599 host. Expected: `duplicate refused: P2002 …` (or `… 23505`) — either is what `isUniqueViolation` in `task-auto-write.ts` accepts; anything else → fix `isUniqueViolation` in its own commit. Then the third line.
6. `pg_ctl stop`, delete the data directory, `rm server/scripts/_probe-task-auto-dup.ts`. Confirm `git status` shows no new file.

- [ ] **Step 4: Self-check against the spec** — reading the diff once: no `prisma.task*.create|update|delete` outside `src/tasks/`; every new event emitted after its write (call log: end of `create`; lead: after `update`; auto-closed: after each close transaction); no English word in any new Uzbek string; every Tashkent time through `tashkent.ts` / `tashkent-time.ts`; `LESSON_QUESTION` code paths (`lesson-task.ts`, its Telegram skip) untouched; every assignee query carries the active-staff filter.

- [ ] **Step 5: Browser check list for the PR description** (CEO session after the server deploy, roles CEO / Administrator):
  1. Log a call with «Javob bermadi» and «Keyingi bog'lanish sanasi» = tomorrow → the caller's board has «Qayta qo'ng'iroq: …» due tomorrow 18:00; the bell shows it; Telegram does not until tomorrow 08:00.
  2. Open it → the card shows the student, phone, debt, the call that asked for it and the last call; «Qo'ng'iroqni yozish» opens the call dialog for that student; saving closes the task («Tizim yopdi (qo'ng'iroq yozildi)») and its bell row goes grey.
  3. Next 09:00 with a broken promise → administrators get one «Va'da buzildi: …» task per student and no list; the CEO gets the list. The first administrator to press «Boshladim» keeps it; the other's card disappears. A payment for that student closes it.
  4. A lead created after the deploy and left uncalled for 24 h → «Lidga qo'ng'iroq qilinmagan: …» within the hour (08:00–18:00, not Sunday); «Lidni ochish» opens its drawer; marking it called closes the task.
  5. The 21:00 report in the Telegram group shows the «📋 Topshiriqlar: …» line when something is overdue.

---

## Deploy order

1. **Migration** — applied by the server deploy (`20261011090000_task_auto_lead_start`: one column; existing companies get the moment it runs — that moment is the «only new leads» line, so nothing else is needed).
2. **Server** (Railway `caring-courage`, production). From then on: 09:00 lists go to CEOs only and administrators get tasks; call logs with a follow-up date make callbacks; the first lead tasks appear 24 h after the deploy (only leads created after it). **No data script** — existing broken promises and old `followUpAt` dates get no tasks (only events after the deploy create them; said in the PR).
3. **Vercel** — the drawer's source card, the history wording, the guide and the news. Between the two deploys the old client shows system tasks without the card (the `source` field is optional and ignored).
4. Rollback: the previous server build runs on the new schema (it ignores the column). Tasks already created stay; nothing closes them automatically under the old build, and the old build would again send the 09:00 list to administrators.
