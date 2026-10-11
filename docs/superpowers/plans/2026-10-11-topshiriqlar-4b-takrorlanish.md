# Topshiriqlar — 4b-bosqich «Takrorlanuvchi topshiriqlar» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A task can repeat — «Har kuni», «Har hafta» (chosen weekdays) or «Har oy» (a day 1–28) at a chosen time: the rule is made from the create dialog's «Batafsil», its first task appears at once, and every morning at 07:00 Tashkent the rule gives the next one through the normal create path; the card shows «Har dushanba», the task sheet shows the rule with «O'zgartirish» / «To'xtatish», and a «Takrorlanuvchi» list shows all rules the viewer may manage.

**Architecture:** One new table `TaskRecurrence` (the template + schedule + `nextRunDate`) and a nullable `Task.recurrenceId` (FK `ON DELETE SET NULL`). The date math is pure (`task-recurrence-rules.ts`). `TaskRecurrencesService` makes a rule with its first task(s) in one transaction (sharing `TasksService.prepareCreate` and `createCopiesTx` with a normal create) and serves list / edit / delete. `TaskRecurrenceRunner` (cron 07:00) re-checks the author's rights and the people, then in ONE transaction moves `nextRunDate` with a conditional `updateMany` (the idempotency key: a second instance gets `count 0` and makes nothing) and writes the task through `createCopiesTx`; `task.assigned` is emitted after the commit, so bell, push, SSE and Telegram need nothing new. The client adds a recurrence picker to «Batafsil», a badge on the card, a section in the sheet and a dialog list.

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@nestjs/schedule`, `@nestjs/event-emitter`, class-validator, Jest. Client: Next.js 16, React 19 (React Compiler), zustand, vitest.

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.6, §4 screens 1 and 7, §5.3 («takrorlanish» is the author's), §9.2, §9.5 (`GET /tasks/recurrences · PATCH /tasks/recurrences/:id · DELETE …`, `POST /tasks` `recurrence?`), §9.6 (07:00 cron).

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup` (branch `feat/topshiriqlar-4b-takrorlanish`, from `origin/main` 6a57c05e). Never `cd` to the main checkout or `/tmp`; absolute paths inside the worktree. Plain bash commands, no shell variables.
- **Never touch a database** except the throwaway one in Task 10. The dev DB in `server/.env` is shared and behind; prod is off-limits. Never run `prisma migrate deploy|dev|resolve`, `db push`, `db execute`. The migration SQL is produced offline (schema-to-schema diff, Task 1). `npx prisma generate` is the only Prisma command that runs.
- Migration timestamp `20261011120000` — later than `20261011090000_task_auto_lead_start`, the newest on `origin/main` (6a57c05e). **Recheck at PR time.**
- UI text: Uzbek, Latin script only, no English words. In JSX, text with an apostrophe goes in a JS string (`{"O'zgartirish"}` or a constant), never `&apos;` (existing `&apos;` in touched files stays as it is).
- Server: `npx prettier --write <touched .ts files>` before every commit. **Client: never run Prettier.** React Compiler: no prop or state mutation, no synchronous `setState` in an effect body.
- Dates: Tashkent only through `server/src/common/date/tashkent.ts` (`tashkentDateStr`, `addDaysToDateStr`, `dayOfWeekForDateStr`, `utcMidnightFromDateStr`, `tashkentDayStartUtc`, `TASHKENT_OFFSET_MS`) and `client/src/lib/tashkent-time.ts`. Never `setHours` / local time on the server.
- Every user the 07:00 run gives a task to or makes a watcher: `deletedAt: null`, `isActive: true`, `status: ACTIVE`.
- Every write to `Task*` / `TaskRecurrence` stays inside `src/tasks/` (`task-write.single-source.spec.ts`, extended in Task 1). `src/common/event-wiring.spec.ts` stays green (no new event names in this plan). Events are emitted after the commit.
- New files ≤ 500 lines. No real credentials in the repo (it is public). No new env var. `CRONS_ENABLED=false` needs no code: `AppModule` does not load `ScheduleModule` then.
- Commits: English message; trailer as a second `-m`: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add <repo-relative paths>` then `git -C … commit`.
- Server gate per task (from `server/`): `npx prettier --write <files>` → `npx eslint <files> --quiet` → `npx jest <specs>` → `npm run typecheck`. Never `npm run build` and `npm test` at the same time.
- Client gate per task (from `client/`): `npx tsc --noEmit` → `npx eslint <files> --quiet` → `npx vitest run <tests>` (fallback `npx vitest --config vitest.config.ts run <tests>`).
- ADR number: **0084** is the next free number on `origin/main` today (0083 = avtomatik topshiriqlar) — **recheck `docs/adr/README.md` at PR time** and renumber with `git mv` if `main` took it.
- Deploy order: migration → server → Vercel.

---

## Design decisions (not dictated by the spec or the brief)

1. **No `lastTaskId` column.** «The last task is still open» is asked of the tasks themselves: `Task.recurrenceId = rule.id AND status IN (NEW, IN_PROGRESS, IN_REVIEW)`. A single `lastTaskId` cannot describe a «Har biriga alohida» rule (one run = several tasks). With separate copies the check is per assignee: whoever still has an open copy of the rule gets no new one, the others do (`runGroups`). One index `Task(recurrenceId, status)`.
2. **The first task is made with the rule**, for the first run day whose due time is still ahead (`firstRunDate`): «Har kuni 18:00» made at 10:00 gives today's task; made at 19:00 — tomorrow's. «Har dushanba» made on a Tuesday gives next Monday's task at once (it sits on the board with its date). `nextRunDate` = the run after that one. So `POST /tasks` always answers with the new task(s), like a one-off create.
3. **Idempotency = conditional advance.** Inside the run's transaction the FIRST write is `taskRecurrence.updateMany({ where: { id, active: true, nextRunDate: <the value read> }, data: { nextRunDate: next } })`. Two instances during a deploy: the second blocks on the row lock until the first commits, Postgres re-evaluates the `WHERE` (READ COMMITTED), gets `count 0`, and returns without creating. The task insert is in the same transaction, so a failure rolls the advance back and the next morning retries. No new unique index; checked on the throwaway database (Task 10).
4. **A missed morning is made up once.** The run picks `nextRunDate <= today`, makes ONE task due today at the rule's time, and moves the date to the first run after today (not one task per missed day). It never runs on a Sunday or a holiday of the rule's branch: such a morning leaves the rule for the next working day (`off`).
5. **Rights at run time are the author's.** The run loads the author with `TasksService.loadActor` (roles from the DB, ADR-0028). Author gone (blocked/deleted → 403) or the linked record gone (404/403 from `assertMayLinkEntity`) → the rule stops itself (`active = false`, logged). Each assignee and watcher is re-checked (live: active filter above; on the author's ladder: `canAssignTo` / `canWatch`) and silently dropped if not; no assignee left → that run is skipped (logged), the date still moves.
6. **Stop vs delete.** «To'xtatish» = `PATCH { active: false }` (reversible: «Davom ettirish» = `active: true`, `nextRunDate` recomputed from tomorrow). «O'chirish» = `DELETE` = the row goes; its tasks stay and their `recurrenceId` becomes null (FK `SET NULL`), so their badge disappears. Hard delete is safe because nothing else points at a rule.
7. **What can be edited.** `PATCH /tasks/recurrences/:id` takes `schedule` (whole: freq, weekdays, dayOfMonth, dueTime), `active`, `assigneeIds` (checked against the CALLER's ladder, 403 otherwise — the run still re-checks the author's). A new schedule takes effect from tomorrow. Title, description, steps, watchers, priority, link: stop the rule and make a new one (keeps the sheet small; the rule's tasks themselves stay editable as usual).
8. **`requiresPhoto` is not on the rule.** The create DTO has no such field before phase 3 (photo upload); the rule gets it with phase 3.
9. **Who manages a rule:** `resolveAccess(caller, { authorId, branchId, participants: [] }).canManage` — the author, a Branch Director of the rule's branch, the CEO. Everyone else gets 404 on PATCH/DELETE. `GET /tasks/recurrences`: CEO all of the company, Branch Director own rules + their branches', anyone else own rules; max 200 rows (active first, then by next date).
10. **Notices** are a normal create's: `task.assigned` with `actorId = rule.authorId`, `created: true` (bell «<author> sizga topshiriq berdi», Telegram «Yangi topshiriq»). As with any create, the author is not told about their own task. 07:00 is inside the Telegram night quiet, so the phone hears it at 08:00 (`URGENT` at once). The `CREATED` history row carries `via: 'SYSTEM'`, actor = author.
11. **Holidays of a branch-less rule** (CEO, no branch): the same holiday set the manual due check uses (`buildHolidayDateSet` with no branch = every holiday row). Consistent with `assertManualDueAt` at create time.
12. **Weekday numbers** are `getUTCDay()`'s: 1 = dushanba … 6 = shanba; Sunday cannot be chosen; «Har kuni» skips Sundays and holidays (two days pushed onto the same working day make one run).
13. **A recurring create forbids `dueAt`** (400 «Takrorlanuvchi topshiriqqa sana qo'yilmaydi: vaqtini «Takrorlash» da tanlang»): the dialog hides the date picker when a recurrence is chosen.
14. **Badge only while active**: `GET /tasks` cards carry `recurrence: { freq, weekdays, dayOfMonth } | null` (null when stopped). The sheet (`GET /tasks/:id` → `recurrence`) shows the rule also when stopped, to managers with «Davom ettirish».
15. **The list is a dialog** opened by a «Takrorlanuvchi» button next to «Yangi topshiriq» on `/tasks` (no new tab, no new route on the client).
16. **ADR-0084** (short): the semantics above (2–7) are product decisions the spec leaves open.
17. `ponytail:` the run handles 500 rules a morning (oldest `nextRunDate` first); the rest are caught up the next morning by `<= today`. Raise it when a company has more.

## File Structure

**Server — new**
- `server/prisma/migrations/20261011120000_task_recurrence/migration.sql`
- `server/src/tasks/task-recurrence-rules.ts` (+ `.spec.ts`) — pure: `normalizeSchedule`, `nextRunDateAfter`, `firstRunDate`, `recurrenceDueAt`, `isWorkingDay`, `runGroups`; plus `recurrenceHolidays` (one read).
- `server/src/tasks/dto/task-recurrence.dto.ts` — `TaskRecurrenceDto`, `UpdateTaskRecurrenceDto`.
- `server/src/tasks/task-recurrences.service.ts` (+ `.spec.ts`) — `TaskRecurrencesService`: `create`, `list`, `update`, `remove`.
- `server/src/tasks/task-recurrence-run.service.ts` (+ `.spec.ts`) — `TaskRecurrenceRunner` (cron 07:00).
- `server/src/tasks/task-recurrence-view.ts` (+ `.spec.ts`) — `RECURRENCE_VIEW_SELECT`, `toRecurrenceViews`, `loadRecurrenceView`, `recurrenceCanManage`.
- `docs/adr/0084-takrorlanuvchi-topshiriq.md`

**Server — modified**
- `server/prisma/schema.prisma` (enum, model `TaskRecurrence`, `Task`, `User`, `Company`).
- `server/src/tasks/task-write.single-source.spec.ts` — `Recurrence` in the scanned table names.
- `server/src/tasks/task-create.ts` — `NewTask.recurrenceId` / `via`, `copyGroups`, `batchIdFor`, `emitTaskCreated`.
- `server/src/tasks/tasks.service.ts` — `prepareCreate` extracted from `create` (no behaviour change).
- `server/src/tasks/task-people.ts` — `reachablePeople`.
- `server/src/tasks/dto/create-task.dto.ts` — `recurrence?`.
- `server/src/tasks/task-select.ts` — card carries `recurrence`.
- `server/src/tasks/tasks-read.service.ts` (+ spec) — `detail` returns `recurrence`.
- `server/src/tasks/tasks.controller.ts` (+ spec) — `POST /tasks` branches; three routes.
- `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`.
- `server/src/common/auth/branch-route-policy.ts` — three routes classified.
- `server/CLAUDE.md`, `docs/adr/README.md`.

**Client — new**
- `client/src/components/tasks/task-recurrence-rules.ts` (+ `.test.ts`) — badge text, sheet line, form ↔ payload.
- `client/src/components/tasks/task-recurrence-fields.tsx` — the «Takrorlash» picker.
- `client/src/components/tasks/task-drawer-recurrence.tsx` — the sheet section.
- `client/src/components/tasks/task-recurrences-dialog.tsx` — `TaskRecurrencesButton` + the list.

**Client — modified**
- `client/src/hooks/use-tasks.ts` (types), `client/src/components/tasks/task-create-dialog.tsx`, `client/src/components/tasks/task-card.tsx`, `client/src/components/tasks/task-drawer.tsx`, `client/src/components/tasks/tasks-page-client.tsx`, `client/CLAUDE.md`, `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: Table, column, migration, one-door spec

**Files:**
- Modify: `server/prisma/schema.prisma` (enums near line 151; `model Task` ~line 1991; `model User` relation list near line 413 `tasksAuthored`; `model Company` relation list near line 1757 `tasks`)
- Create: `server/prisma/migrations/20261011120000_task_recurrence/migration.sql`
- Modify: `server/src/tasks/task-write.single-source.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma model `TaskRecurrence` (fields below, delegate `prisma.taskRecurrence`), enum `TaskRecurrenceFreq` (`DAILY | WEEKLY | MONTHLY`), `Task.recurrenceId: string | null`, relation `Task.recurrence`.

- [ ] **Step 1: Extend the one-door spec (stays green: no `taskRecurrence` write exists yet; from Task 3 on it guards them)**

In `server/src/tasks/task-write.single-source.spec.ts`, change the regex and the test name:

```ts
const WRITE =
  /\b(tx|prisma|db|this\.prisma)\.task(?:Participant|Step|Event|Outbox|TelegramMessage|Recurrence)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g;
```

```ts
  it('no other module writes a Task, TaskParticipant, TaskStep, TaskEvent, TaskOutbox, TaskTelegramMessage or TaskRecurrence row', () => {
```

Also add one sentence to the header comment: `A recurrence rule (TaskRecurrence) is part of the same door: its rows are written only by task-recurrences.service.ts and task-recurrence-run.service.ts.`

- [ ] **Step 2: Schema**

Under `enum TaskTelegramPurpose { … }` add:

```prisma
/// Spec 2026-10-07 §3.6.
enum TaskRecurrenceFreq {
  DAILY
  WEEKLY
  MONTHLY
}
```

Add the model right after `model TaskTelegramMessage { … }`:

```prisma
/// A rule that gives a MANUAL task on its days (spec 2026-10-07 §3.6,
/// ADR-0084). The 07:00 Tashkent run (`TaskRecurrenceRunner`) makes the task
/// through the normal create writer and moves `nextRunDate` with a
/// conditional update (the idempotency key). Written only inside src/tasks/.
model TaskRecurrence {
  id             String             @id @default(uuid())
  companyId      Int
  company        Company            @relation(fields: [companyId], references: [id])
  /// The branch its first task got (`resolveTaskBranchId`); null = branch-less.
  branchId       Int?
  authorId       Int
  author         User               @relation("TaskRecurrenceAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  freq           TaskRecurrenceFreq
  /// WEEKLY: 1 = Monday … 6 = Saturday (never Sunday). Empty otherwise.
  weekdays       Int[]              @default([])
  /// MONTHLY: 1–28. Null otherwise.
  dayOfMonth     Int?
  /// "HH:mm", Tashkent, 08:00–22:00.
  dueTime        String
  title          String
  description    String?
  priority       TaskPriority       @default(MEDIUM)
  assigneeIds    Int[]
  watcherIds     Int[]              @default([])
  /// Step titles, in order.
  steps          String[]           @default([])
  entityType     String?
  entityId       String?
  separateCopies Boolean            @default(false)
  active         Boolean            @default(true)
  /// The Tashkent day of the next run.
  nextRunDate    DateTime           @db.Date
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  tasks Task[]

  @@index([active, nextRunDate])
  @@index([companyId, authorId])
}
```

In `model Task`, after `batchId`:

```prisma
  /// The rule that made it (§3.6); null for any other task and after the rule is deleted.
  recurrenceId      String?
  recurrence        TaskRecurrence? @relation(fields: [recurrenceId], references: [id], onDelete: SetNull)
```

and next to the other `@@index` lines of `Task`: `@@index([recurrenceId, status])`. Also update the `model Task` doc comment's writer list: add `tasks/task-recurrences.service.ts, tasks/task-recurrence-run.service.ts (through task-create.ts)`.

In `model User`, next to `tasksAuthored`: `taskRecurrencesAuthored TaskRecurrence[] @relation("TaskRecurrenceAuthor")`. In `model Company`, next to `tasks Task[]`: `taskRecurrences TaskRecurrence[]`.

- [ ] **Step 3: Migration, offline**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git show HEAD:server/prisma/schema.prisma > prisma/.schema-before.prisma
mkdir -p prisma/migrations/20261011120000_task_recurrence
npx prisma migrate diff --from-schema prisma/.schema-before.prisma --to-schema prisma/schema.prisma --script > prisma/migrations/20261011120000_task_recurrence/migration.sql
rm prisma/.schema-before.prisma
cat prisma/migrations/20261011120000_task_recurrence/migration.sql
```

If the first line is `Loaded Prisma config from prisma.config.ts.`, delete it. The file must contain exactly these statements (formatting may differ) and NOTHING else — no `DROP INDEX` (in particular not `task_open_source_unique` or `TaskOutbox_time_row_key`); otherwise stop and report:
1. `CREATE TYPE "TaskRecurrenceFreq" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');`
2. `ALTER TABLE "Task" ADD COLUMN "recurrenceId" TEXT;`
3. `CREATE TABLE "TaskRecurrence" (…)` with every column above (`"weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[]`, `"nextRunDate" DATE NOT NULL`, …) and its primary key.
4. `CREATE INDEX "Task_recurrenceId_status_idx"`, `"TaskRecurrence_active_nextRunDate_idx"`, `"TaskRecurrence_companyId_authorId_idx"`.
5. Three `ADD CONSTRAINT … FOREIGN KEY`: `Task.recurrenceId` → `ON DELETE SET NULL`, `TaskRecurrence.companyId` → `Company`, `TaskRecurrence.authorId` → `User` `ON DELETE RESTRICT`.

Add one comment line at the top: `-- ADR-0084: recurring tasks. A deleted rule leaves its tasks (recurrenceId -> NULL).`

- [ ] **Step 4: Generate and check**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prisma generate
npx prettier --write src/tasks/task-write.single-source.spec.ts
npx jest src/tasks/task-write.single-source.spec.ts
npm run typecheck
```

Expected: 2 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/prisma/schema.prisma server/prisma/migrations/20261011120000_task_recurrence/migration.sql server/src/tasks/task-write.single-source.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): TaskRecurrence table and Task.recurrenceId" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The rule math

**Files:**
- Create: `server/src/tasks/task-recurrence-rules.ts`
- Test: `server/src/tasks/task-recurrence-rules.spec.ts`

**Interfaces:**
- Consumes: `TaskRecurrenceFreq` (Task 1); `buildHolidayDateSet`, `HolidayDateSetDb` from `server/src/holidays/holiday-date-set.ts`.
- Produces:
  - `interface RecurrenceSchedule { freq: TaskRecurrenceFreq; weekdays: number[]; dayOfMonth: number | null; dueTime: string }`
  - `normalizeSchedule(input: { freq: TaskRecurrenceFreq; weekdays?: number[]; dayOfMonth?: number; dueTime?: string }): RecurrenceSchedule` (400 on a bad one)
  - `isWorkingDay(day: string, holidays: ReadonlySet<string>): boolean`
  - `nextRunDateAfter(s: RecurrenceSchedule, after: string, holidays: ReadonlySet<string>): string`
  - `firstRunDate(s: RecurrenceSchedule, now: Date, holidays: ReadonlySet<string>): string`
  - `recurrenceDueAt(day: string, dueTime: string): Date`
  - `runGroups(separateCopies: boolean, assigneeIds: number[], openTasks: { assigneeIds: number[] }[]): number[][]`
  - `recurrenceHolidays(db: HolidayDateSetDb, branchId: number | null, today: string): Promise<Set<string>>`
  - `DEFAULT_RECURRENCE_TIME = '18:00'`

- [ ] **Step 1: Write the failing spec**

`server/src/tasks/task-recurrence-rules.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  firstRunDate,
  isWorkingDay,
  nextRunDateAfter,
  normalizeSchedule,
  recurrenceDueAt,
  runGroups,
  type RecurrenceSchedule,
} from './task-recurrence-rules';

// 2026-10-11 is a Sunday, 2026-10-12 a Monday.
const none = new Set<string>();
const daily: RecurrenceSchedule = {
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '18:00',
};
const weekly = (...d: number[]): RecurrenceSchedule => ({
  freq: 'WEEKLY',
  weekdays: d,
  dayOfMonth: null,
  dueTime: '10:00',
});
const monthly = (n: number): RecurrenceSchedule => ({
  freq: 'MONTHLY',
  weekdays: [],
  dayOfMonth: n,
  dueTime: '09:00',
});

describe('normalizeSchedule', () => {
  it('defaults the time to 18:00 and clears what the frequency does not use', () => {
    expect(
      normalizeSchedule({ freq: 'DAILY', weekdays: [1], dayOfMonth: 5 }),
    ).toEqual(daily);
    expect(
      normalizeSchedule({ freq: 'WEEKLY', weekdays: [4, 1, 4], dueTime: '10:00' }),
    ).toEqual(weekly(1, 4));
    expect(
      normalizeSchedule({
        freq: 'MONTHLY',
        dayOfMonth: 28,
        weekdays: [2],
        dueTime: '09:00',
      }),
    ).toEqual(monthly(28));
  });

  it('accepts the edges of the 08:00–22:00 window', () => {
    expect(normalizeSchedule({ freq: 'DAILY', dueTime: '08:00' }).dueTime).toBe('08:00');
    expect(normalizeSchedule({ freq: 'DAILY', dueTime: '22:00' }).dueTime).toBe('22:00');
  });

  it.each([
    [{ freq: 'WEEKLY' as const, weekdays: [] }],
    [{ freq: 'WEEKLY' as const }],
    [{ freq: 'WEEKLY' as const, weekdays: [0] }],
    [{ freq: 'WEEKLY' as const, weekdays: [7] }],
    [{ freq: 'MONTHLY' as const }],
    [{ freq: 'MONTHLY' as const, dayOfMonth: 0 }],
    [{ freq: 'MONTHLY' as const, dayOfMonth: 29 }],
    [{ freq: 'DAILY' as const, dueTime: '07:59' }],
    [{ freq: 'DAILY' as const, dueTime: '22:01' }],
    [{ freq: 'DAILY' as const, dueTime: '9:00' }],
  ])('refuses %j with a 400', (input) => {
    expect(() => normalizeSchedule(input)).toThrow(BadRequestException);
  });
});

describe('isWorkingDay', () => {
  it('is false on a Sunday and on a holiday', () => {
    expect(isWorkingDay('2026-10-11', none)).toBe(false);
    expect(isWorkingDay('2026-10-12', new Set(['2026-10-12']))).toBe(false);
    expect(isWorkingDay('2026-10-12', none)).toBe(true);
  });
});

describe('nextRunDateAfter', () => {
  it('daily: the next day, never a Sunday', () => {
    expect(nextRunDateAfter(daily, '2026-10-12', none)).toBe('2026-10-13');
    expect(nextRunDateAfter(daily, '2026-10-10', none)).toBe('2026-10-12');
  });

  it("daily: the branch's holidays are skipped", () => {
    const h = new Set(['2026-10-13', '2026-10-14']);
    expect(nextRunDateAfter(daily, '2026-10-12', h)).toBe('2026-10-15');
  });

  it('weekly: the next named day', () => {
    expect(nextRunDateAfter(weekly(1), '2026-10-12', none)).toBe('2026-10-19');
    expect(nextRunDateAfter(weekly(1, 3), '2026-10-12', none)).toBe('2026-10-14');
    expect(nextRunDateAfter(weekly(1, 3), '2026-10-14', none)).toBe('2026-10-19');
  });

  it('weekly: a Monday holiday moves the run to Tuesday; the run after is the next Monday', () => {
    const h = new Set(['2026-10-19']);
    expect(nextRunDateAfter(weekly(1), '2026-10-12', h)).toBe('2026-10-20');
    expect(nextRunDateAfter(weekly(1), '2026-10-20', h)).toBe('2026-10-26');
  });

  it('weekly: two days pushed onto the same working day make one run', () => {
    const h = new Set(['2026-10-19', '2026-10-20']);
    expect(nextRunDateAfter(weekly(1, 2), '2026-10-14', h)).toBe('2026-10-21');
    expect(nextRunDateAfter(weekly(1, 2), '2026-10-21', h)).toBe('2026-10-26');
  });

  it('monthly: the same day next month; a Sunday moves to Monday', () => {
    expect(nextRunDateAfter(monthly(5), '2026-10-05', none)).toBe('2026-11-05');
    expect(nextRunDateAfter(monthly(8), '2026-10-08', none)).toBe('2026-11-09');
    expect(nextRunDateAfter(monthly(8), '2026-11-09', none)).toBe('2026-12-08');
  });

  it('monthly: the 28th exists every month, and a day still ahead is this month', () => {
    expect(nextRunDateAfter(monthly(28), '2026-01-28', none)).toBe('2026-02-28');
    expect(nextRunDateAfter(monthly(28), '2026-02-28', none)).toBe('2026-03-28');
    expect(nextRunDateAfter(monthly(28), '2026-10-12', none)).toBe('2026-10-28');
  });
});

describe('firstRunDate', () => {
  const at = (iso: string) => new Date(iso);
  it('today, while the due time is still ahead', () => {
    // Monday 09:00 Tashkent; due 18:00.
    expect(firstRunDate(daily, at('2026-10-12T04:00:00Z'), none)).toBe('2026-10-12');
  });
  it('the next run day once the due time has come', () => {
    expect(firstRunDate(daily, at('2026-10-12T13:00:00Z'), none)).toBe('2026-10-13');
    expect(firstRunDate(daily, at('2026-10-12T14:00:00Z'), none)).toBe('2026-10-13');
  });
  it('a Sunday makes Monday the first day', () => {
    expect(firstRunDate(daily, at('2026-10-11T05:00:00Z'), none)).toBe('2026-10-12');
  });
  it('weekly: the first named day from today', () => {
    expect(firstRunDate(weekly(1), at('2026-10-13T04:00:00Z'), none)).toBe('2026-10-19');
  });
});

describe('recurrenceDueAt', () => {
  it('is the Tashkent wall time of that day', () => {
    expect(recurrenceDueAt('2026-10-12', '10:00').toISOString()).toBe('2026-10-12T05:00:00.000Z');
    expect(recurrenceDueAt('2026-10-12', '22:00').toISOString()).toBe('2026-10-12T17:00:00.000Z');
  });
});

describe('runGroups', () => {
  it('joint: one task for everyone, none while one of the rule is open', () => {
    expect(runGroups(false, [1, 2], [])).toEqual([[1, 2]]);
    expect(runGroups(false, [1, 2], [{ assigneeIds: [9] }])).toEqual([]);
  });
  it('separate copies: a copy each, except for whoever still has an open one', () => {
    expect(runGroups(true, [1, 2], [])).toEqual([[1], [2]]);
    expect(runGroups(true, [1, 2], [{ assigneeIds: [1] }])).toEqual([[2]]);
  });
  it('one assignee or nobody', () => {
    expect(runGroups(true, [1], [{ assigneeIds: [1] }])).toEqual([]);
    expect(runGroups(false, [], [])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — fails (module not found)**

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/task-recurrence-rules.spec.ts`
Expected: FAIL «Cannot find module './task-recurrence-rules'».

- [ ] **Step 3: Implement**

`server/src/tasks/task-recurrence-rules.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { TaskRecurrenceFreq } from '@prisma/client';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
  tashkentDayStartUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  buildHolidayDateSet,
  type HolidayDateSetDb,
} from '../holidays/holiday-date-set';

/**
 * Recurring tasks (spec 2026-10-07 §3.6, ADR-0084): when a rule runs. Pure,
 * except `recurrenceHolidays` (one read). Days are Tashkent `YYYY-MM-DD`;
 * weekdays are `getUTCDay()` numbers, 1 = Monday … 6 = Saturday.
 */

export const DEFAULT_RECURRENCE_TIME = '18:00';
/** A month plus the longest holiday (60 days): how far the holiday set reaches. */
const HOLIDAY_LOOKAHEAD_DAYS = 100;

export interface RecurrenceSchedule {
  freq: TaskRecurrenceFreq;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The DTO's shape → the stored one; a 400 for anything the DTO lets through. */
export function normalizeSchedule(input: {
  freq: TaskRecurrenceFreq;
  weekdays?: number[];
  dayOfMonth?: number;
  dueTime?: string;
}): RecurrenceSchedule {
  const dueTime = input.dueTime ?? DEFAULT_RECURRENCE_TIME;
  // Zero-padded "HH:mm" compares as text.
  if (!HHMM.test(dueTime) || dueTime < '08:00' || dueTime > '22:00') {
    throw new BadRequestException(
      "Vaqt 08:00 dan 22:00 gacha bo'lishi kerak (Toshkent vaqti)",
    );
  }
  if (input.freq === 'WEEKLY') {
    const weekdays = [...new Set(input.weekdays ?? [])].sort((a, b) => a - b);
    const bad = weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 6);
    if (weekdays.length === 0 || bad) {
      throw new BadRequestException(
        'Hafta kunlarini tanlang (dushanbadan shanbagacha)',
      );
    }
    return { freq: 'WEEKLY', weekdays, dayOfMonth: null, dueTime };
  }
  if (input.freq === 'MONTHLY') {
    const d = input.dayOfMonth;
    if (d === undefined || !Number.isInteger(d) || d < 1 || d > 28) {
      throw new BadRequestException("Oy kuni 1 dan 28 gacha bo'lishi kerak");
    }
    return { freq: 'MONTHLY', weekdays: [], dayOfMonth: d, dueTime };
  }
  return { freq: 'DAILY', weekdays: [], dayOfMonth: null, dueTime };
}

export function isWorkingDay(
  day: string,
  holidays: ReadonlySet<string>,
): boolean {
  return dayOfWeekForDateStr(day) !== 0 && !holidays.has(day);
}

function named(s: RecurrenceSchedule, day: string): boolean {
  if (s.freq === 'WEEKLY') return s.weekdays.includes(dayOfWeekForDateStr(day));
  if (s.freq === 'MONTHLY') return Number(day.slice(8, 10)) === s.dayOfMonth;
  return true;
}

/**
 * The first run day strictly after `after`: the first day the rule names,
 * moved past Sundays and the branch's holidays. Pass the LAST run day as
 * `after`, so days pushed onto the same working day make one run.
 */
export function nextRunDateAfter(
  s: RecurrenceSchedule,
  after: string,
  holidays: ReadonlySet<string>,
): string {
  let day = addDaysToDateStr(after, 1);
  // 62 days always reach a named day; the bound only stops a corrupt row.
  for (let i = 0; i < 62 && !named(s, day); i++) day = addDaysToDateStr(day, 1);
  while (!isWorkingDay(day, holidays)) day = addDaysToDateStr(day, 1);
  return day;
}

/** "HH:mm" Tashkent on `day`, as the stored UTC instant. */
export function recurrenceDueAt(day: string, dueTime: string): Date {
  const [h, m] = dueTime.split(':').map(Number);
  return new Date(
    utcMidnightFromDateStr(day).getTime() +
      (h * 60 + m) * 60_000 -
      TASHKENT_OFFSET_MS,
  );
}

/** The first run day (today or later) whose due time is still ahead of `now`. */
export function firstRunDate(
  s: RecurrenceSchedule,
  now: Date,
  holidays: ReadonlySet<string>,
): string {
  const today = tashkentDateStr(now);
  const first = nextRunDateAfter(s, addDaysToDateStr(today, -1), holidays);
  const passed =
    first === today &&
    recurrenceDueAt(today, s.dueTime).getTime() <= now.getTime();
  return passed ? nextRunDateAfter(s, today, holidays) : first;
}

/**
 * Who gets a task on this run (spec §3.6: while the last one is open, no new
 * one). Joint: one task for everyone, none while a task of the rule is open.
 * «Har biriga alohida»: a copy each, except whoever still has an open one.
 */
export function runGroups(
  separateCopies: boolean,
  assigneeIds: number[],
  openTasks: { assigneeIds: number[] }[],
): number[][] {
  if (assigneeIds.length === 0) return [];
  if (!separateCopies || assigneeIds.length === 1) {
    return openTasks.length ? [] : [assigneeIds];
  }
  const busy = new Set(openTasks.flatMap((t) => t.assigneeIds));
  return assigneeIds.filter((id) => !busy.has(id)).map((id) => [id]);
}

/**
 * The holidays from `today` on, for a rule's branch. A branch-less rule gets
 * every holiday row — the same set the manual due check uses (`TasksService`).
 */
export function recurrenceHolidays(
  db: HolidayDateSetDb,
  branchId: number | null,
  today: string,
): Promise<Set<string>> {
  const from = tashkentDayStartUtc(today);
  return buildHolidayDateSet(
    db,
    from,
    new Date(from.getTime() + HOLIDAY_LOOKAHEAD_DAYS * 864e5),
    branchId ?? undefined,
  );
}
```

- [ ] **Step 4: Run — passes**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-recurrence-rules.ts src/tasks/task-recurrence-rules.spec.ts
npx eslint src/tasks/task-recurrence-rules.ts src/tasks/task-recurrence-rules.spec.ts --quiet
npx jest src/tasks/task-recurrence-rules.spec.ts
npm run typecheck
```

Expected: all pass, clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-recurrence-rules.ts server/src/tasks/task-recurrence-rules.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): recurrence date rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `POST /tasks` with `recurrence` — the rule and its first task

**Files:**
- Create: `server/src/tasks/dto/task-recurrence.dto.ts`
- Modify: `server/src/tasks/dto/create-task.dto.ts`
- Modify: `server/src/tasks/task-create.ts`
- Modify: `server/src/tasks/tasks.service.ts` (`create` → `prepareCreate` + `create`)
- Create: `server/src/tasks/task-recurrences.service.ts`
- Test: `server/src/tasks/task-recurrences.service.spec.ts`
- Modify: `server/src/tasks/tasks.controller.ts`, `server/src/tasks/tasks.controller.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`normalizeSchedule`, `firstRunDate`, `nextRunDateAfter`, `recurrenceDueAt`, `recurrenceHolidays`); `scheduleTaskOutbox` (`task-outbox.service.ts`); `toTaskDetail`, `TaskDetail` (`task-select.ts`).
- Produces:
  - `class TaskRecurrenceDto { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'; weekdays?: number[]; dayOfMonth?: number; dueTime?: string }`
  - `class UpdateTaskRecurrenceDto { schedule?: TaskRecurrenceDto; active?: boolean; assigneeIds?: number[] }`
  - `CreateTaskDto.recurrence?: TaskRecurrenceDto`
  - `task-create.ts`: `NewTask.recurrenceId?: string | null`, `NewTask.via?: 'WEB' | 'SYSTEM'`; `copyGroups(separate: boolean, assigneeIds: number[]): number[][]`; `batchIdFor(groups: number[][]): string | null`; `emitTaskCreated(emitter: EventEmitter2, rows: { ids: number[]; row: TaskRow }[], actorId: number, watcherIds: number[]): void`
  - `TasksService.prepareCreate(dto: CreateTaskDto, actor: TaskActor): Promise<PreparedCreate>` with `PreparedCreate = { branchId: number | null; assigneeIds: number[]; watcherIds: number[]; groups: number[][] }` (exported type)
  - `TaskRecurrencesService` (constructor `(prisma: PrismaService, emitter: EventEmitter2, tasks: TasksService)`), `create(dto: CreateTaskDto, actor: TaskActor, now?: Date): Promise<TaskDetail[]>`

- [ ] **Step 1: DTOs**

`server/src/tasks/dto/task-recurrence.dto.ts`:

```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** The shape only; `normalizeSchedule` gives the 400s with Uzbek messages. */
export class TaskRecurrenceDto {
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  @IsOptional() @IsArray() @ArrayMaxSize(6) @IsInt({ each: true })
  weekdays?: number[];
  @IsOptional() @IsInt() dayOfMonth?: number;
  /** "HH:mm" Tashkent; 18:00 when absent. */
  @IsOptional() @IsString() dueTime?: string;
}

export class UpdateTaskRecurrenceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskRecurrenceDto)
  schedule?: TaskRecurrenceDto;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsInt({ each: true })
  assigneeIds?: number[];
}
```

In `create-task.dto.ts` add the import and, after `steps`:

```ts
  /** A recurring task (spec §3.6): the rule and its first task. No `dueAt` then. */
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskRecurrenceDto)
  recurrence?: TaskRecurrenceDto;
```

- [ ] **Step 2: `task-create.ts` — two optional fields and three helpers**

Add to `NewTask`:

```ts
  /** The rule that makes it (spec §3.6); absent for a one-off task. */
  recurrenceId?: string | null;
  /** The CREATED row's `via`; the 07:00 run writes SYSTEM. */
  via?: 'WEB' | 'SYSTEM';
```

In `createCopiesTx`'s `tx.task.create` data add `...(t.recurrenceId ? { recurrenceId: t.recurrenceId } : {}),` (spread, so the data of a one-off create is byte-for-byte what `tasks.service.spec.ts` asserts today) and change the event to `{ type: 'CREATED', actorId: t.authorId, via: t.via ?? 'WEB' }`.

Append (imports: `randomUUID` from `crypto`, `EventEmitter2` type from `@nestjs/event-emitter`, `TASK_EVENTS`, `toEventTask` from `./task-events`):

```ts
/** «Har biriga alohida» (spec §3.1): a copy per assignee, else one task for all. */
export function copyGroups(separate: boolean, assigneeIds: number[]): number[][] {
  return separate && assigneeIds.length > 1
    ? assigneeIds.map((id) => [id])
    : [assigneeIds];
}

export function batchIdFor(groups: number[][]): string | null {
  return groups.length > 1 ? randomUUID() : null;
}

/**
 * `task.assigned` (`created: true`) for each new copy, then for its watchers.
 * Call it only after the transaction committed. Two plain emits:
 * `event-wiring.spec.ts` reads the name at the call site.
 */
export function emitTaskCreated(
  emitter: EventEmitter2,
  rows: { ids: number[]; row: TaskRow }[],
  actorId: number,
  watcherIds: number[],
): void {
  for (const { ids, row } of rows) {
    emitter.emit(TASK_EVENTS.ASSIGNED, {
      task: toEventTask(row),
      actorId,
      userIds: ids,
      created: true,
    });
    if (watcherIds.length) {
      emitter.emit(TASK_EVENTS.ASSIGNED, {
        task: toEventTask(row),
        actorId,
        userIds: watcherIds,
        created: true,
      });
    }
  }
}
```

- [ ] **Step 3: `TasksService` — extract `prepareCreate` (no behaviour change)**

Add `PreparedCreate` at the TOP LEVEL of the file (exported, above the class), and replace `create` with the two methods below (keep the comments that are there; drop the now-unused `randomUUID` import; import `batchIdFor`, `copyGroups`, `emitTaskCreated` from `./task-create`):

```ts
export type PreparedCreate = {
  branchId: number | null;
  assigneeIds: number[];
  watcherIds: number[];
  groups: number[][];
};

  /** The checks and the shape of a new task; a recurring one (`TaskRecurrencesService`) shares them. */
  async prepareCreate(dto: CreateTaskDto, actor: TaskActor): Promise<PreparedCreate> {
    await assertMayLinkEntity(this.prisma, actor, dto);
    const branchId = await resolveTaskBranchId(this.prisma, {
      companyId: actor.companyId,
      entityType: dto.entityType,
      entityId: dto.entityId,
      headerBranchId: actor.headerBranchId,
      callerScope: actor.scope,
    });
    const { assignees, watchers } = await this.checkPeople(
      dto.assigneeIds,
      dto.watcherIds ?? [],
      actor,
    );
    const assigneeIds = assignees.map((a) => a.id);
    const assigneeIdSet = new Set(assigneeIds);
    const watcherIds = watchers
      .map((w) => w.id)
      .filter((id) => !assigneeIdSet.has(id));
    return {
      branchId,
      assigneeIds,
      watcherIds,
      groups: copyGroups(dto.separateCopies === true, assigneeIds),
    };
  }

  async create(dto: CreateTaskDto, actor: TaskActor): Promise<TaskDetail[]> {
    const p = await this.prepareCreate(dto, actor);
    const dueAt = parseDueInput(dto.dueAt);
    if (dueAt) assertManualDueAt(dueAt, await this.holidaySet(p.branchId, dueAt));
    // All copies and their reminder rows commit together: a half-made batch
    // would leave the author with copies that were never assigned.
    const rows = await this.prisma.$transaction(
      (tx) =>
        createCopiesTx(
          tx,
          {
            companyId: actor.companyId,
            branchId: p.branchId,
            authorId: actor.userId,
            dto,
            dueAt,
            batchId: batchIdFor(p.groups),
            watcherIds: p.watcherIds,
          },
          p.groups,
          this.schedule,
        ),
      { maxWait: 10_000, timeout: 15_000 },
    );
    // Notifications go out only once the rows are committed.
    emitTaskCreated(this.emitter, rows, actor.userId, p.watcherIds);
    return rows.map(({ row }) => toTaskDetail(row));
  }
```

Note: the old code took the assignee order from `assignees` (DB order), same as here. Run `npx jest src/tasks/tasks.service.spec.ts` now: it must stay green unchanged.

- [ ] **Step 4: Write the failing service spec (create only)**

`server/src/tasks/task-recurrences.service.spec.ts`:

```ts
jest.mock('./task-recurrence-rules', () => ({
  ...jest.requireActual('./task-recurrence-rules'),
  recurrenceHolidays: jest.fn(async () => new Set<string>()),
}));
jest.mock('./task-create', () => ({
  ...jest.requireActual('./task-create'),
  createCopiesTx: jest.fn(),
}));

import { BadRequestException } from '@nestjs/common';
import { createCopiesTx } from './task-create';
import { TASK_EVENTS } from './task-events';
import { TaskRecurrencesService } from './task-recurrences.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
// Monday 12.10.2026, 09:00 Tashkent.
const MON_0900 = new Date('2026-10-12T04:00:00Z');
const actor = {
  userId: 10,
  companyId: 1,
  roleIds: [3],
  roleNames: ['Administrator'],
  scope: { kind: 'branches' as const, branchIds: [7] },
  headerBranchId: 7,
};
const row = (ids: number[]) => ({
  id: 't1',
  companyId: 1,
  title: 'Kassani tekshirish',
  kind: 'MANUAL',
  authorId: 10,
  dueAt: null,
  status: 'NEW',
  participants: ids.map((userId) => ({ userId, role: 'ASSIGNEE' })),
  author: null,
  _count: { steps: 0, events: 1 },
  steps: [],
  unmarkedLesson: null,
  recurrence: null,
});

function setup(prepared = { branchId: 7, assigneeIds: [20], watcherIds: [30], groups: [[20]] }) {
  const tx = { taskRecurrence: { create: jest.fn(async () => ({ id: 'r1' })) } };
  const prisma = { $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)) };
  const emitter = { emit: jest.fn() };
  const tasks = { prepareCreate: jest.fn(async () => prepared) };
  (createCopiesTx as jest.Mock).mockImplementation(
    async (_tx: unknown, _t: unknown, groups: number[][]) =>
      groups.map((ids) => ({ ids, row: row(ids) })),
  );
  const svc = new TaskRecurrencesService(prisma as never, emitter as never, tasks as never);
  return { svc, tx, prisma, emitter, tasks };
}

describe('TaskRecurrencesService.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores the rule and makes its first task in one transaction', async () => {
    const { svc, tx, emitter } = setup();
    const dto = {
      title: ' Kassani tekshirish ',
      assigneeIds: [20],
      watcherIds: [30],
      steps: [{ title: 'Sanash' }],
      recurrence: { freq: 'DAILY' as const, dueTime: '10:00' },
    };
    await svc.create(dto, actor as never, MON_0900);

    expect(tx.taskRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1,
        branchId: 7,
        authorId: 10,
        freq: 'DAILY',
        weekdays: [],
        dayOfMonth: null,
        dueTime: '10:00',
        title: 'Kassani tekshirish',
        assigneeIds: [20],
        watcherIds: [30],
        steps: ['Sanash'],
        separateCopies: false,
        // Today's 10:00 is still ahead: today is the first run, tomorrow the next.
        nextRunDate: day('2026-10-13'),
      }),
      select: { id: true },
    });
    expect(createCopiesTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recurrenceId: 'r1',
        authorId: 10,
        branchId: 7,
        dueAt: new Date('2026-10-12T05:00:00.000Z'),
        batchId: null,
        watcherIds: [30],
      }),
      [[20]],
      expect.any(Function),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: 10, userIds: [20], created: true }),
    );
  });

  it('a time already past today starts tomorrow', async () => {
    const { svc, tx } = setup();
    const createCalls = createCopiesTx as jest.Mock;
    await svc.create(
      { title: 'X', assigneeIds: [20], recurrence: { freq: 'DAILY', dueTime: '08:00' } },
      actor as never,
      MON_0900,
    );
    expect(tx.taskRecurrence.create.mock.calls[0][0].data.nextRunDate).toEqual(day('2026-10-14'));
    expect(createCalls.mock.calls[0][1].dueAt).toEqual(new Date('2026-10-13T03:00:00.000Z'));
  });

  it('refuses a due date next to a recurrence', async () => {
    const { svc, tasks } = setup();
    await expect(
      svc.create(
        { title: 'X', assigneeIds: [20], dueAt: '2026-10-13', recurrence: { freq: 'DAILY' } },
        actor as never,
        MON_0900,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tasks.prepareCreate).not.toHaveBeenCalled();
  });

  it('refuses a bad schedule before any check or write', async () => {
    const { svc, tasks, prisma } = setup();
    await expect(
      svc.create(
        { title: 'X', assigneeIds: [20], recurrence: { freq: 'WEEKLY', weekdays: [] } },
        actor as never,
        MON_0900,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(tasks.prepareCreate).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('separate copies: one task per assignee with one batch id, and the rule remembers it', async () => {
    const { svc, tx } = setup({ branchId: 7, assigneeIds: [20, 21], watcherIds: [], groups: [[20], [21]] });
    await svc.create(
      { title: 'X', assigneeIds: [20, 21], separateCopies: true, recurrence: { freq: 'DAILY' } },
      actor as never,
      MON_0900,
    );
    expect(tx.taskRecurrence.create.mock.calls[0][0].data.separateCopies).toBe(true);
    const t = (createCopiesTx as jest.Mock).mock.calls[0][1];
    expect(typeof t.batchId).toBe('string');
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/tasks/task-recurrences.service.spec.ts` — FAIL (module not found).

- [ ] **Step 5: Implement `TaskRecurrencesService.create`**

`server/src/tasks/task-recurrences.service.ts` (Task 6 adds `list`, `update`, `remove` to this file):

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { batchIdFor, createCopiesTx, emitTaskCreated } from './task-create';
import { scheduleTaskOutbox } from './task-outbox.service';
import {
  firstRunDate,
  nextRunDateAfter,
  normalizeSchedule,
  recurrenceDueAt,
  recurrenceHolidays,
} from './task-recurrence-rules';
import { toTaskDetail, type TaskDetail } from './task-select';
import { TasksService, type TaskActor } from './tasks.service';
import type { CreateTaskDto } from './dto/create-task.dto';

/**
 * Recurring tasks (spec 2026-10-07 §3.6, ADR-0084): the rule's HTTP side.
 * The 07:00 run is `TaskRecurrenceRunner`.
 */
@Injectable()
export class TaskRecurrencesService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
  ) {}

  /**
   * The rule and its first task(s) in one transaction: the same checks and
   * writer as a one-off create (`prepareCreate`, `createCopiesTx`), due on
   * the first run day whose time is still ahead; `nextRunDate` is the run
   * after that one.
   */
  async create(
    dto: CreateTaskDto,
    actor: TaskActor,
    now = new Date(),
  ): Promise<TaskDetail[]> {
    if (!dto.recurrence) {
      throw new BadRequestException('Takrorlanish berilmagan');
    }
    if (dto.dueAt) {
      throw new BadRequestException(
        "Takrorlanuvchi topshiriqqa sana qo'yilmaydi: vaqtini «Takrorlash» da tanlang",
      );
    }
    const schedule = normalizeSchedule(dto.recurrence);
    const p = await this.tasks.prepareCreate(dto, actor);
    const holidays = await recurrenceHolidays(
      this.prisma,
      p.branchId,
      tashkentDateStr(now),
    );
    const first = firstRunDate(schedule, now, holidays);
    const next = nextRunDateAfter(schedule, first, holidays);
    const rows = await this.prisma.$transaction(
      async (tx) => {
        const rule = await tx.taskRecurrence.create({
          data: {
            companyId: actor.companyId,
            branchId: p.branchId,
            authorId: actor.userId,
            ...schedule,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            priority: dto.priority ?? 'MEDIUM',
            assigneeIds: p.assigneeIds,
            watcherIds: p.watcherIds,
            steps: (dto.steps ?? []).map((s) => s.title.trim()),
            entityType: dto.entityType ?? null,
            entityId: dto.entityId ?? null,
            separateCopies: dto.separateCopies === true,
            nextRunDate: utcMidnightFromDateStr(next),
          },
          select: { id: true },
        });
        return createCopiesTx(
          tx,
          {
            companyId: actor.companyId,
            branchId: p.branchId,
            authorId: actor.userId,
            dto,
            dueAt: recurrenceDueAt(first, schedule.dueTime),
            batchId: batchIdFor(p.groups),
            watcherIds: p.watcherIds,
            recurrenceId: rule.id,
          },
          p.groups,
          scheduleTaskOutbox,
        );
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    emitTaskCreated(this.emitter, rows, actor.userId, p.watcherIds);
    return rows.map(({ row }) => toTaskDetail(row));
  }
}
```

If `toTaskDetail` rejects the mocked row in the spec, give the spec's `row()` the missing `TASK_DETAIL_SELECT` fields (`description: null, lastReturnedAt: null, cancelReason: null`, …) — do not loosen the code.

- [ ] **Step 6: Controller, module, DI smoke, controller spec**

`tasks.controller.ts`: inject `private recurrences: TaskRecurrencesService` (third constructor argument) and change `create`:

```ts
  @Post() async create(
    @Body() dto: CreateTaskDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
    @Headers('x-branch-id') branch?: string,
  ) {
    const actor = await this.actor(uid, cid, branch);
    // A recurring task is a rule plus its first task (spec §3.6).
    return dto.recurrence
      ? this.recurrences.create(dto, actor)
      : this.tasks.create(dto, actor);
  }
```

`tasks.module.ts`: add `TaskRecurrencesService` to `providers`. `tasks.module.di.spec.ts`: import it and add it to the `get()` loop. `tasks.controller.spec.ts`: add `{ provide: TaskRecurrencesService, useValue: {} }` to the testing module providers (the route count stays 17 here).

- [ ] **Step 7: Run — passes**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/dto/task-recurrence.dto.ts src/tasks/dto/create-task.dto.ts src/tasks/task-create.ts src/tasks/tasks.service.ts src/tasks/task-recurrences.service.ts src/tasks/task-recurrences.service.spec.ts src/tasks/tasks.controller.ts src/tasks/tasks.controller.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: every `src/tasks` spec green (including `tasks.service.spec.ts` untouched, `task-write.single-source.spec.ts` now also sees `tx.taskRecurrence.create` inside `src/tasks/`), DI smoke green, typecheck clean.

- [ ] **Step 8: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/dto/task-recurrence.dto.ts server/src/tasks/dto/create-task.dto.ts server/src/tasks/task-create.ts server/src/tasks/tasks.service.ts server/src/tasks/task-recurrences.service.ts server/src/tasks/task-recurrences.service.spec.ts server/src/tasks/tasks.controller.ts server/src/tasks/tasks.controller.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): create a recurring task with its first copy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The 07:00 run

**Files:**
- Modify: `server/src/tasks/task-people.ts` (add `reachablePeople`)
- Create: `server/src/tasks/task-recurrence-run.service.ts`
- Test: `server/src/tasks/task-recurrence-run.service.spec.ts`
- Modify: `server/src/tasks/tasks.module.ts`, `server/src/tasks/tasks.module.di.spec.ts`

**Interfaces:**
- Consumes: Task 2 (`isWorkingDay`, `nextRunDateAfter`, `recurrenceDueAt`, `recurrenceHolidays`, `runGroups`); Task 3 (`createCopiesTx` with `recurrenceId`/`via`, `batchIdFor`, `emitTaskCreated`); `TasksService.loadActor`, `TasksService.actorPerson`; `assertMayLinkEntity` (`task-create.ts`); `OPEN_STATUSES` (`task-transitions.ts`); `scheduleTaskOutbox`.
- Produces:
  - `reachablePeople(prisma: PrismaService, caller: PolicyPerson, companyId: number, assigneeIds: number[], watcherIds: number[]): Promise<{ assigneeIds: number[]; watcherIds: number[] }>`
  - `type RunOutcome = 'created' | 'taken' | 'open' | 'no-assignee' | 'stopped' | 'off'`
  - `TaskRecurrenceRunner.run(now: Date): Promise<Record<RunOutcome, number>>`, `tick()` (`@Cron('0 0 7 * * *', { timeZone: 'Asia/Tashkent' })`)

- [ ] **Step 1: `reachablePeople` in `task-people.ts`**

```ts
/**
 * The 07:00 run of a recurring task: of the rule's people, those still live
 * (active staff) and still on the author's ladder. Never throws: whoever no
 * longer fits is left out (ADR-0084).
 */
export async function reachablePeople(
  prisma: PrismaService,
  caller: PolicyPerson,
  companyId: number,
  assigneeIds: number[],
  watcherIds: number[],
): Promise<{ assigneeIds: number[]; watcherIds: number[] }> {
  const ids = [...new Set([...assigneeIds, ...watcherIds])];
  const rows = ids.length
    ? await prisma.user.findMany({
        where: {
          id: { in: ids },
          companyId,
          deletedAt: null,
          isActive: true,
          status: 'ACTIVE',
          roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } },
        },
        select: PERSON_SELECT,
      })
    : [];
  const live = new Map(rows.map((u) => [u.id, toPolicyPerson(u)]));
  const assignees = assigneeIds.filter((id) => {
    const p = live.get(id);
    return p !== undefined && canAssignTo(caller, p);
  });
  const taken = new Set(assignees);
  const watchers = watcherIds.filter((id) => {
    const p = live.get(id);
    return !taken.has(id) && p !== undefined && canWatch(caller, p);
  });
  return { assigneeIds: assignees, watcherIds: watchers };
}
```

Add a case to `task-policy.spec.ts`? No — `reachablePeople` is covered through the runner spec (mocked) and the throwaway-database check (Task 10). Keep it this small.

- [ ] **Step 2: Write the failing runner spec**

`server/src/tasks/task-recurrence-run.service.spec.ts`:

```ts
jest.mock('./task-create', () => ({
  ...jest.requireActual('./task-create'),
  assertMayLinkEntity: jest.fn(async () => undefined),
  createCopiesTx: jest.fn(),
}));
jest.mock('./task-people', () => ({
  ...jest.requireActual('./task-people'),
  reachablePeople: jest.fn(),
}));
jest.mock('./task-recurrence-rules', () => ({
  ...jest.requireActual('./task-recurrence-rules'),
  recurrenceHolidays: jest.fn(async () => new Set<string>()),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertMayLinkEntity, createCopiesTx } from './task-create';
import { TASK_EVENTS } from './task-events';
import { reachablePeople } from './task-people';
import { TaskRecurrenceRunner } from './task-recurrence-run.service';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MON_0700 = new Date('2026-10-12T02:00:00Z');
const SUN_0700 = new Date('2026-10-11T02:00:00Z');
const rule = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  companyId: 1,
  branchId: 7,
  authorId: 10,
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'Kassani tekshirish',
  description: null,
  priority: 'MEDIUM',
  assigneeIds: [20, 21],
  watcherIds: [30],
  steps: ['Sanash'],
  entityType: null,
  entityId: null,
  separateCopies: false,
  nextRunDate: day('2026-10-12'),
  ...over,
});

function setup(o: { rules?: unknown[]; claim?: number; open?: number[][] } = {}) {
  const tx = {
    taskRecurrence: {
      updateMany: jest.fn(async () => ({ count: o.claim ?? 1 })),
    },
    task: {
      findMany: jest.fn(async () =>
        (o.open ?? []).map((ids) => ({
          participants: ids.map((userId) => ({ userId })),
        })),
      ),
    },
  };
  const prisma = {
    taskRecurrence: {
      findMany: jest.fn(async () => o.rules ?? [rule()]),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };
  const emitter = { emit: jest.fn() };
  const tasks = {
    loadActor: jest.fn(async () => ({
      userId: 10,
      companyId: 1,
      roleIds: [1],
      roleNames: ['CEO'],
      scope: { kind: 'all' },
      headerBranchId: null,
    })),
    actorPerson: jest.fn(() => ({ id: 10, roleIds: [1], branchIds: 'all' })),
  };
  (reachablePeople as jest.Mock).mockResolvedValue({
    assigneeIds: [20, 21],
    watcherIds: [30],
  });
  (createCopiesTx as jest.Mock).mockImplementation(
    async (_tx: unknown, _t: unknown, groups: number[][]) =>
      groups.map((ids, i) => ({
        ids,
        row: {
          id: `t${i}`,
          companyId: 1,
          title: 'Kassani tekshirish',
          kind: 'MANUAL',
          authorId: 10,
          dueAt: null,
          status: 'NEW',
          participants: ids.map((userId) => ({ userId, role: 'ASSIGNEE' })),
        },
      })),
  );
  const runner = new TaskRecurrenceRunner(
    prisma as never,
    emitter as never,
    tasks as never,
  );
  return { runner, prisma, tx, emitter, tasks };
}

describe('TaskRecurrenceRunner.run', () => {
  beforeEach(() => jest.clearAllMocks());

  it('asks for active rules due today or earlier', async () => {
    const { runner, prisma } = setup({ rules: [] });
    await runner.run(MON_0700);
    expect(prisma.taskRecurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, nextRunDate: { lte: day('2026-10-12') } },
      }),
    );
  });

  it("makes today's task through the create writer and moves the date in the same transaction", async () => {
    const { runner, tx, emitter } = setup();
    const out = await runner.run(MON_0700);
    expect(out.created).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-12') },
      data: { nextRunDate: day('2026-10-13') },
    });
    expect(createCopiesTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: 1,
        branchId: 7,
        authorId: 10,
        recurrenceId: 'r1',
        via: 'SYSTEM',
        dueAt: new Date('2026-10-12T05:00:00.000Z'),
        batchId: null,
        watcherIds: [30],
        dto: expect.objectContaining({
          title: 'Kassani tekshirish',
          steps: [{ title: 'Sanash' }],
        }),
      }),
      [[20, 21]],
      expect.any(Function),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ actorId: 10, userIds: [20, 21], created: true }),
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.objectContaining({ userIds: [30] }),
    );
  });

  it('a second instance that lost the claim makes nothing', async () => {
    const { runner, emitter } = setup({ claim: 0 });
    const out = await runner.run(MON_0700);
    expect(out.taken).toBe(1);
    expect(createCopiesTx).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('an open task of the rule: no new one, the date still moves', async () => {
    const { runner, tx } = setup({ open: [[20]] });
    const out = await runner.run(MON_0700);
    expect(out.open).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalled();
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('separate copies: only whoever has no open copy gets one', async () => {
    const { runner } = setup({
      rules: [rule({ separateCopies: true })],
      open: [[20]],
    });
    await runner.run(MON_0700);
    expect((createCopiesTx as jest.Mock).mock.calls[0][2]).toEqual([[21]]);
  });

  it('nobody left to give it to: the run is skipped, the date moves', async () => {
    const { runner, tx } = setup();
    (reachablePeople as jest.Mock).mockResolvedValue({
      assigneeIds: [],
      watcherIds: [],
    });
    const out = await runner.run(MON_0700);
    expect(out['no-assignee']).toBe(1);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalled();
    expect(createCopiesTx).not.toHaveBeenCalled();
  });

  it('the author is gone: the rule stops itself', async () => {
    const { runner, prisma, tasks } = setup();
    tasks.loadActor.mockRejectedValueOnce(new ForbiddenException('x'));
    const out = await runner.run(MON_0700);
    expect(out.stopped).toBe(1);
    expect(prisma.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-12') },
      data: { active: false },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('the linked record is gone: the rule stops itself', async () => {
    const { runner } = setup({
      rules: [rule({ entityType: 'Student', entityId: '5' })],
    });
    (assertMayLinkEntity as jest.Mock).mockRejectedValueOnce(
      new NotFoundException('x'),
    );
    expect((await runner.run(MON_0700)).stopped).toBe(1);
  });

  it('a Sunday morning leaves the rule for Monday', async () => {
    const { runner, prisma } = setup({
      rules: [rule({ nextRunDate: day('2026-10-10') })],
    });
    const out = await runner.run(SUN_0700);
    expect(out.off).toBe(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('a missed morning is made up once, due today, and the next run is after today', async () => {
    const { runner, tx } = setup({
      rules: [rule({ nextRunDate: day('2026-10-10') })],
    });
    await runner.run(MON_0700);
    expect(tx.taskRecurrence.updateMany).toHaveBeenCalledWith({
      where: { id: 'r1', active: true, nextRunDate: day('2026-10-10') },
      data: { nextRunDate: day('2026-10-13') },
    });
    expect((createCopiesTx as jest.Mock).mock.calls[0][1].dueAt).toEqual(
      new Date('2026-10-12T05:00:00.000Z'),
    );
  });

  it('one failing rule does not stop the next', async () => {
    const { runner, tasks } = setup({
      rules: [rule({ id: 'bad' }), rule({ id: 'good' })],
    });
    tasks.loadActor.mockRejectedValueOnce(new Error('db down'));
    const out = await runner.run(MON_0700);
    expect(out.created).toBe(1);
  });
});
```

Run: `npx jest src/tasks/task-recurrence-run.service.spec.ts` — FAIL (module not found).

- [ ] **Step 3: Implement the runner**

`server/src/tasks/task-recurrence-run.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import {
  assertMayLinkEntity,
  batchIdFor,
  createCopiesTx,
  emitTaskCreated,
} from './task-create';
import { scheduleTaskOutbox } from './task-outbox.service';
import { reachablePeople } from './task-people';
import {
  isWorkingDay,
  nextRunDateAfter,
  recurrenceDueAt,
  recurrenceHolidays,
  runGroups,
} from './task-recurrence-rules';
import { OPEN_STATUSES } from './task-transitions';
import { TasksService, type TaskActor } from './tasks.service';
import type { CreateTaskDto } from './dto/create-task.dto';

const RULE_SELECT = {
  id: true,
  companyId: true,
  branchId: true,
  authorId: true,
  freq: true,
  weekdays: true,
  dayOfMonth: true,
  dueTime: true,
  title: true,
  description: true,
  priority: true,
  assigneeIds: true,
  watcherIds: true,
  steps: true,
  entityType: true,
  entityId: true,
  separateCopies: true,
  nextRunDate: true,
} satisfies Prisma.TaskRecurrenceSelect;
type Rule = Prisma.TaskRecurrenceGetPayload<{ select: typeof RULE_SELECT }>;

export type RunOutcome =
  | 'created'
  | 'taken'
  | 'open'
  | 'no-assignee'
  | 'stopped'
  | 'off';

// ponytail: 500 rules a morning, oldest first; the rest are caught up the next
// morning (`nextRunDate <= today`). Raise it when a company has more.
const RULE_BATCH = 500;
const OPEN = [...OPEN_STATUSES];

function templateDto(rule: Rule): CreateTaskDto {
  return {
    title: rule.title,
    description: rule.description ?? undefined,
    assigneeIds: rule.assigneeIds,
    priority: rule.priority,
    entityType: rule.entityType ?? undefined,
    entityId: rule.entityId ?? undefined,
    steps: rule.steps.map((title) => ({ title })),
  };
}

/**
 * Every morning at 07:00 Tashkent (spec §9.6): each active rule whose
 * `nextRunDate` has come gives its task (ADR-0084). The FIRST write of the
 * run's transaction moves `nextRunDate` only if it still holds the value read
 * — two instances during a deploy: the second gets `count 0` and makes
 * nothing; a failed insert rolls the move back and tomorrow retries.
 */
@Injectable()
export class TaskRecurrenceRunner {
  private readonly logger = new Logger(TaskRecurrenceRunner.name);
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private tasks: TasksService,
  ) {}

  @Cron('0 0 7 * * *', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run(new Date());
    } finally {
      this.running = false;
    }
  }

  async run(now: Date): Promise<Record<RunOutcome, number>> {
    const today = tashkentDateStr(now);
    const rules = await this.prisma.taskRecurrence.findMany({
      where: { active: true, nextRunDate: { lte: utcMidnightFromDateStr(today) } },
      select: RULE_SELECT,
      orderBy: { nextRunDate: 'asc' },
      take: RULE_BATCH,
    });
    const total: Record<RunOutcome, number> = {
      created: 0,
      taken: 0,
      open: 0,
      'no-assignee': 0,
      stopped: 0,
      off: 0,
    };
    for (const rule of rules) {
      try {
        total[await this.runOne(rule, today)] += 1;
      } catch (err) {
        this.logger.error(
          `recurrence ${rule.id} failed: ${(err as Error).message}`,
        );
      }
    }
    return total;
  }

  private async runOne(rule: Rule, today: string): Promise<RunOutcome> {
    const holidays = await recurrenceHolidays(this.prisma, rule.branchId, today);
    // Never a task due on a Sunday or the branch's holiday: wait for a working day.
    if (!isWorkingDay(today, holidays)) return 'off';
    const held = { id: rule.id, active: true, nextRunDate: rule.nextRunDate };

    // The author's rights TODAY, not the day the rule was written.
    let actor: TaskActor;
    try {
      actor = await this.tasks.loadActor(rule.authorId, rule.companyId, null);
      await assertMayLinkEntity(this.prisma, actor, {
        entityType: rule.entityType ?? undefined,
        entityId: rule.entityId ?? undefined,
      });
    } catch (err) {
      if (
        !(err instanceof ForbiddenException || err instanceof NotFoundException)
      ) {
        throw err;
      }
      const { count } = await this.prisma.taskRecurrence.updateMany({
        where: held,
        data: { active: false },
      });
      if (count === 0) return 'taken';
      this.logger.warn(
        `recurrence ${rule.id} stopped: ${(err as Error).message}`,
      );
      return 'stopped';
    }

    const people = await reachablePeople(
      this.prisma,
      this.tasks.actorPerson(actor),
      rule.companyId,
      rule.assigneeIds,
      rule.watcherIds,
    );
    const schedule = {
      freq: rule.freq,
      weekdays: rule.weekdays,
      dayOfMonth: rule.dayOfMonth,
      dueTime: rule.dueTime,
    };
    const next = utcMidnightFromDateStr(
      nextRunDateAfter(schedule, today, holidays),
    );

    const result = await this.prisma.$transaction(
      async (tx) => {
        const { count } = await tx.taskRecurrence.updateMany({
          where: held,
          data: { nextRunDate: next },
        });
        if (count === 0) return 'taken' as const;
        if (people.assigneeIds.length === 0) return 'no-assignee' as const;
        const open = await tx.task.findMany({
          where: { recurrenceId: rule.id, status: { in: OPEN } },
          select: {
            participants: {
              where: { role: 'ASSIGNEE' },
              select: { userId: true },
            },
          },
        });
        const groups = runGroups(
          rule.separateCopies,
          people.assigneeIds,
          open.map((t) => ({
            assigneeIds: t.participants.map((p) => p.userId),
          })),
        );
        if (groups.length === 0) return 'open' as const;
        return createCopiesTx(
          tx,
          {
            companyId: rule.companyId,
            branchId: rule.branchId,
            authorId: rule.authorId,
            dto: templateDto(rule),
            dueAt: recurrenceDueAt(today, rule.dueTime),
            batchId: batchIdFor(groups),
            watcherIds: people.watcherIds,
            recurrenceId: rule.id,
            via: 'SYSTEM',
          },
          groups,
          scheduleTaskOutbox,
        );
      },
      { maxWait: 10_000, timeout: 15_000 },
    );
    if (typeof result === 'string') {
      if (result === 'no-assignee') {
        this.logger.warn(`recurrence ${rule.id}: nobody left to assign`);
      }
      return result;
    }
    emitTaskCreated(this.emitter, result, rule.authorId, people.watcherIds);
    return 'created';
  }
}
```

Register `TaskRecurrenceRunner` in `tasks.module.ts` `providers` and in the `tasks.module.di.spec.ts` `get()` loop.

- [ ] **Step 4: Run — passes**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-people.ts src/tasks/task-recurrence-run.service.ts src/tasks/task-recurrence-run.service.spec.ts src/tasks/tasks.module.ts src/tasks/tasks.module.di.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks
npm run typecheck
```

Expected: green, clean.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-people.ts server/src/tasks/task-recurrence-run.service.ts server/src/tasks/task-recurrence-run.service.spec.ts server/src/tasks/tasks.module.ts server/src/tasks/tasks.module.di.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): 07:00 run of recurring tasks with a conditional date claim" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The rule on the card and in the sheet (read side)

**Files:**
- Modify: `server/src/tasks/task-select.ts`
- Create: `server/src/tasks/task-recurrence-view.ts`
- Test: `server/src/tasks/task-recurrence-view.spec.ts`
- Modify: `server/src/tasks/tasks-read.service.ts`, `server/src/tasks/tasks-read.service.spec.ts`

**Interfaces:**
- Consumes: `resolveAccess`, `PolicyPerson` (`task-policy.ts`); Task 1 schema.
- Produces:
  - `toTaskCard(...)` gains `recurrence: { freq: TaskRecurrenceFreq; weekdays: number[]; dayOfMonth: number | null } | null` (null when the task has no rule or the rule is stopped)
  - `RECURRENCE_VIEW_SELECT`, `type RecurrenceRow`
  - `interface RecurrenceView { id: string; freq: TaskRecurrenceFreq; weekdays: number[]; dayOfMonth: number | null; dueTime: string; title: string; active: boolean; separateCopies: boolean; nextRunDate: string /* YYYY-MM-DD */; author: Person; assignees: Person[]; canManage: boolean }` with `Person = { id: number; firstName: string; lastName: string; photo: string | null }`
  - `recurrenceCanManage(caller: PolicyPerson, r: { authorId: number; branchId: number | null }): boolean`
  - `toRecurrenceViews(prisma: PrismaService, rows: RecurrenceRow[], caller: PolicyPerson): Promise<RecurrenceView[]>`
  - `loadRecurrenceView(prisma: PrismaService, id: string, caller: PolicyPerson): Promise<RecurrenceView | null>`
  - `GET /tasks/:id` answer gains `recurrence: RecurrenceView | null` (first page only, like `source`).

- [ ] **Step 1: Write the failing view spec**

`server/src/tasks/task-recurrence-view.spec.ts`:

```ts
import { recurrenceCanManage, toRecurrenceViews } from './task-recurrence-view';

const ceo = { id: 1, roleIds: [1], branchIds: 'all' as const };
const director = { id: 2, roleIds: [2], branchIds: [7] };
const admin = { id: 3, roleIds: [3], branchIds: [7] };
const person = (id: number) => ({ id, firstName: `F${id}`, lastName: `L${id}`, photo: null });
const row = {
  id: 'r1',
  branchId: 7,
  authorId: 3,
  freq: 'WEEKLY' as const,
  weekdays: [1],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'Hisobot',
  assigneeIds: [20, 99],
  separateCopies: false,
  active: true,
  nextRunDate: new Date('2026-10-19T00:00:00.000Z'),
  author: person(3),
};

describe('recurrenceCanManage', () => {
  it('the author, a director of its branch and the CEO; nobody else', () => {
    expect(recurrenceCanManage(admin, row)).toBe(true);
    expect(recurrenceCanManage(director, row)).toBe(true);
    expect(recurrenceCanManage(ceo, row)).toBe(true);
    expect(recurrenceCanManage({ id: 4, roleIds: [3], branchIds: [7] }, row)).toBe(false);
    expect(recurrenceCanManage({ id: 5, roleIds: [2], branchIds: [8] }, row)).toBe(false);
  });
});

describe('toRecurrenceViews', () => {
  it('names the assignees in one read, keeps the date as a day, and skips an id no longer found', async () => {
    const prisma = { user: { findMany: jest.fn(async () => [person(20)]) } };
    const [v] = await toRecurrenceViews(prisma as never, [row], ceo);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(v).toEqual({
      id: 'r1',
      freq: 'WEEKLY',
      weekdays: [1],
      dayOfMonth: null,
      dueTime: '10:00',
      title: 'Hisobot',
      active: true,
      separateCopies: false,
      nextRunDate: '2026-10-19',
      author: person(3),
      assignees: [person(20)],
      canManage: true,
    });
  });
});
```

Run: `npx jest src/tasks/task-recurrence-view.spec.ts` — FAIL.

- [ ] **Step 2: Implement the view**

`server/src/tasks/task-recurrence-view.ts`:

```ts
import type { Prisma, TaskRecurrenceFreq } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { resolveAccess, type PolicyPerson } from './task-policy';

const PERSON = { id: true, firstName: true, lastName: true, photo: true } as const;
type Person = { id: number; firstName: string; lastName: string; photo: string | null };

export const RECURRENCE_VIEW_SELECT = {
  id: true,
  branchId: true,
  authorId: true,
  freq: true,
  weekdays: true,
  dayOfMonth: true,
  dueTime: true,
  title: true,
  assigneeIds: true,
  separateCopies: true,
  active: true,
  nextRunDate: true,
  author: { select: PERSON },
} satisfies Prisma.TaskRecurrenceSelect;
export type RecurrenceRow = Prisma.TaskRecurrenceGetPayload<{
  select: typeof RECURRENCE_VIEW_SELECT;
}>;

export interface RecurrenceView {
  id: string;
  freq: TaskRecurrenceFreq;
  weekdays: number[];
  dayOfMonth: number | null;
  dueTime: string;
  title: string;
  active: boolean;
  separateCopies: boolean;
  /** `YYYY-MM-DD`, Tashkent. */
  nextRunDate: string;
  author: Person;
  assignees: Person[];
  canManage: boolean;
}

/** Who stops, edits and deletes a rule: like a task's manager (spec §5.3). */
export function recurrenceCanManage(
  caller: PolicyPerson,
  r: { authorId: number; branchId: number | null },
): boolean {
  return resolveAccess(caller, {
    authorId: r.authorId,
    branchId: r.branchId,
    participants: [],
  }).canManage;
}

export async function toRecurrenceViews(
  prisma: PrismaService,
  rows: RecurrenceRow[],
  caller: PolicyPerson,
): Promise<RecurrenceView[]> {
  const ids = [...new Set(rows.flatMap((r) => r.assigneeIds))];
  const people = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: PERSON })
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => ({
    id: r.id,
    freq: r.freq,
    weekdays: r.weekdays,
    dayOfMonth: r.dayOfMonth,
    dueTime: r.dueTime,
    title: r.title,
    active: r.active,
    separateCopies: r.separateCopies,
    // A `@db.Date` comes back as UTC midnight of that day.
    nextRunDate: r.nextRunDate.toISOString().slice(0, 10),
    author: r.author,
    assignees: r.assigneeIds.flatMap((id) => byId.get(id) ?? []),
    canManage: recurrenceCanManage(caller, r),
  }));
}

export async function loadRecurrenceView(
  prisma: PrismaService,
  id: string,
  caller: PolicyPerson,
): Promise<RecurrenceView | null> {
  const row = await prisma.taskRecurrence.findUnique({
    where: { id },
    select: RECURRENCE_VIEW_SELECT,
  });
  return row ? (await toRecurrenceViews(prisma, [row], caller))[0] : null;
}
```

- [ ] **Step 3: The card and the sheet**

`task-select.ts`: in `TASK_CARD_SELECT` add

```ts
  recurrenceId: true,
  recurrence: { select: { freq: true, weekdays: true, dayOfMonth: true, active: true } },
```

and in `toTaskCard` add (optional chaining: spec fixtures without the field still map to null):

```ts
    // The badge («Har dushanba», spec screen 1) while the rule runs.
    recurrence: r.recurrence?.active
      ? {
          freq: r.recurrence.freq,
          weekdays: r.recurrence.weekdays,
          dayOfMonth: r.recurrence.dayOfMonth,
        }
      : null,
```

`tasks-read.service.ts` `detail`: import `loadRecurrenceView` and add next to `source`:

```ts
      // The rule of a recurring task (§3.6); first page only, like `source`.
      recurrence:
        before || !row.recurrenceId
          ? null
          : await loadRecurrenceView(
              this.prisma,
              row.recurrenceId,
              this.tasks.actorPerson(actor),
            ),
```

In `tasks-read.service.spec.ts` `describe('detail')`: where an assertion lists the whole answer, add `recurrence: null`; add one test — a row with `recurrenceId: 'r1'` and `prisma.taskRecurrence.findUnique` mocked to a `RecurrenceRow` (plus `prisma.user.findMany` → `[]`) answers `recurrence: expect.objectContaining({ id: 'r1', canManage: … })`, and with `before` set answers `recurrence: null` without calling `findUnique`.

- [ ] **Step 4: Run — passes**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-select.ts src/tasks/task-recurrence-view.ts src/tasks/task-recurrence-view.spec.ts src/tasks/tasks-read.service.ts src/tasks/tasks-read.service.spec.ts
npx eslint src/tasks --quiet
npx jest src/tasks
npm run typecheck
```

If `typecheck` fails on a spec fixture typed as a full card row, add `recurrenceId: null, recurrence: null` to that fixture builder (never cast the code). Expected: green.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-select.ts server/src/tasks/task-recurrence-view.ts server/src/tasks/task-recurrence-view.spec.ts server/src/tasks/tasks-read.service.ts server/src/tasks/tasks-read.service.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): recurrence badge on cards and the rule in the task sheet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any fixture file you had to touch to the `add` line.)

---

### Task 6: `GET /tasks/recurrences`, `PATCH` and `DELETE /tasks/recurrences/:id`

**Files:**
- Modify: `server/src/tasks/task-recurrences.service.ts`, `server/src/tasks/task-recurrences.service.spec.ts`
- Modify: `server/src/tasks/tasks.controller.ts`, `server/src/tasks/tasks.controller.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: Task 2 (`normalizeSchedule`, `nextRunDateAfter`, `recurrenceHolidays`), Task 3 (`UpdateTaskRecurrenceDto`), Task 5 (`RECURRENCE_VIEW_SELECT`, `toRecurrenceViews`, `loadRecurrenceView`, `recurrenceCanManage`), `loadAndCheckPeople` (`task-people.ts`), `highestRoleId`, `ROLE_ID` (`task-policy.ts`).
- Produces:
  - `TaskRecurrencesService.list(actor: TaskActor): Promise<{ data: RecurrenceView[] }>`
  - `TaskRecurrencesService.update(id: string, dto: UpdateTaskRecurrenceDto, actor: TaskActor, now?: Date): Promise<RecurrenceView>`
  - `TaskRecurrencesService.remove(id: string, actor: TaskActor): Promise<{ ok: true }>`
  - Routes `GET /tasks/recurrences`, `PATCH /tasks/recurrences/:id`, `DELETE /tasks/recurrences/:id` (all `@AnyStaff()` from the class).

- [ ] **Step 1: Failing specs**

Append to `task-recurrences.service.spec.ts` (extend `setup` so `prisma` also has `taskRecurrence: { findMany, findFirst, findUnique, update, delete }` and `user: { findMany: jest.fn(async () => []) }`, and `tasks` has `actorPerson: jest.fn((a) => ({ id: a.userId, roleIds: a.roleIds, branchIds: a.scope.kind === 'all' ? 'all' : a.scope.branchIds }))`):

```ts
const stored = {
  id: 'r1',
  companyId: 1,
  branchId: 7,
  authorId: 10,
  freq: 'DAILY',
  weekdays: [],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'X',
  assigneeIds: [20],
  watcherIds: [30],
  separateCopies: false,
  active: true,
  nextRunDate: day('2026-10-13'),
  author: { id: 10, firstName: 'A', lastName: 'B', photo: null },
};

describe('TaskRecurrencesService.list', () => {
  it('CEO: the whole company', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list({ ...actor, roleIds: [1], scope: { kind: 'all' } } as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({ companyId: 1 });
  });
  it("Branch Director: own rules and the branches' rules", async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list({ ...actor, roleIds: [2] } as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1,
      OR: [{ authorId: 10 }, { branchId: { in: [7] } }],
    });
  });
  it('anyone else: own rules', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findMany.mockResolvedValue([]);
    await svc.list(actor as never);
    expect(prisma.taskRecurrence.findMany.mock.calls[0][0].where).toEqual({ companyId: 1, authorId: 10 });
  });
});

describe('TaskRecurrencesService.update / remove', () => {
  it('404 for a rule the caller may not manage (and for an unknown id)', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue({ ...stored, authorId: 99 });
    await expect(svc.update('r1', { active: false }, actor as never)).rejects.toThrow(NotFoundException);
    prisma.taskRecurrence.findFirst.mockResolvedValue(null);
    await expect(svc.remove('r1', actor as never)).rejects.toThrow(NotFoundException);
    expect(prisma.taskRecurrence.update).not.toHaveBeenCalled();
    expect(prisma.taskRecurrence.delete).not.toHaveBeenCalled();
  });
  it('stop: only the flag', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    await svc.update('r1', { active: false }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { active: false } });
  });
  it('resume and a new schedule start from tomorrow', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    prisma.taskRecurrence.findUnique.mockResolvedValue(stored);
    await svc.update('r1', { active: true, schedule: { freq: 'WEEKLY', weekdays: [3], dueTime: '09:00' } }, actor as never, MON_0900);
    expect(prisma.taskRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: {
        active: true,
        freq: 'WEEKLY',
        weekdays: [3],
        dayOfMonth: null,
        dueTime: '09:00',
        nextRunDate: day('2026-10-14'),
      },
    });
  });
  it('delete removes the rule row only', async () => {
    const { svc, prisma } = setup();
    prisma.taskRecurrence.findFirst.mockResolvedValue(stored);
    await expect(svc.remove('r1', actor as never)).resolves.toEqual({ ok: true });
    expect(prisma.taskRecurrence.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});
```

(Import `NotFoundException`.) For `assigneeIds` add one test with `jest.mock('./task-people', …)` partially mocking `loadAndCheckPeople` to resolve `{ assignees: [{ id: 21 }], watchers: [] }`: `update('r1', { assigneeIds: [21] })` writes `{ assigneeIds: [21], watcherIds: [30] }`; and rejecting with `ForbiddenException` propagates (403, nothing written).

Run: FAIL (methods missing).

- [ ] **Step 2: Implement**

Add to `TaskRecurrencesService` (imports: `NotFoundException`, `Prisma` type, `ROLE_ID`, `highestRoleId` from `./task-policy`, `loadAndCheckPeople` from `./task-people`, the view helpers, `UpdateTaskRecurrenceDto`):

```ts
  /** CEO: the company; Branch Director: own + their branches'; anyone else: own. */
  private visibleWhere(actor: TaskActor): Prisma.TaskRecurrenceWhereInput {
    const base = { companyId: actor.companyId };
    if (actor.scope.kind === 'all') return base;
    if (
      highestRoleId(actor.roleIds) === ROLE_ID.BRANCH_DIRECTOR &&
      actor.scope.branchIds.length
    ) {
      return {
        ...base,
        OR: [
          { authorId: actor.userId },
          { branchId: { in: actor.scope.branchIds } },
        ],
      };
    }
    return { ...base, authorId: actor.userId };
  }

  async list(actor: TaskActor): Promise<{ data: RecurrenceView[] }> {
    // ponytail: 200 rules a list; page it when someone has more.
    const rows = await this.prisma.taskRecurrence.findMany({
      where: this.visibleWhere(actor),
      select: RECURRENCE_VIEW_SELECT,
      orderBy: [{ active: 'desc' }, { nextRunDate: 'asc' }],
      take: 200,
    });
    return {
      data: await toRecurrenceViews(
        this.prisma,
        rows,
        this.tasks.actorPerson(actor),
      ),
    };
  }

  /** 404 for an unknown rule and for one the caller may not manage: no leak. */
  private async manageable(id: string, actor: TaskActor) {
    const rule = await this.prisma.taskRecurrence.findFirst({
      where: { id, companyId: actor.companyId },
      select: {
        id: true,
        branchId: true,
        authorId: true,
        freq: true,
        weekdays: true,
        dayOfMonth: true,
        dueTime: true,
        watcherIds: true,
      },
    });
    if (!rule || !recurrenceCanManage(this.tasks.actorPerson(actor), rule)) {
      throw new NotFoundException('Takrorlanish topilmadi');
    }
    return rule;
  }

  /**
   * Stop / resume, a new schedule, new assignees (ADR-0084). A new schedule or
   * a resume starts tomorrow: today's task, if any, is already out.
   */
  async update(
    id: string,
    dto: UpdateTaskRecurrenceDto,
    actor: TaskActor,
    now = new Date(),
  ): Promise<RecurrenceView> {
    const rule = await this.manageable(id, actor);
    const data: Prisma.TaskRecurrenceUpdateInput = {};
    if (dto.active !== undefined) data.active = dto.active;
    let schedule = {
      freq: rule.freq,
      weekdays: rule.weekdays,
      dayOfMonth: rule.dayOfMonth,
      dueTime: rule.dueTime,
    };
    if (dto.schedule) {
      schedule = normalizeSchedule(dto.schedule);
      Object.assign(data, schedule);
    }
    if (dto.assigneeIds) {
      const { assignees } = await loadAndCheckPeople(
        this.prisma,
        this.tasks.actorPerson(actor),
        actor.companyId,
        dto.assigneeIds,
        [],
      );
      const ids = assignees.map((a) => a.id);
      data.assigneeIds = ids;
      data.watcherIds = rule.watcherIds.filter((w) => !ids.includes(w));
    }
    if (dto.schedule || dto.active === true) {
      const today = tashkentDateStr(now);
      const holidays = await recurrenceHolidays(
        this.prisma,
        rule.branchId,
        today,
      );
      data.nextRunDate = utcMidnightFromDateStr(
        nextRunDateAfter(schedule, today, holidays),
      );
    }
    await this.prisma.taskRecurrence.update({ where: { id }, data });
    const view = await loadRecurrenceView(
      this.prisma,
      id,
      this.tasks.actorPerson(actor),
    );
    if (!view) throw new NotFoundException('Takrorlanish topilmadi');
    return view;
  }

  /** The rule goes; its tasks stay (`Task.recurrenceId` → NULL by the FK). */
  async remove(id: string, actor: TaskActor): Promise<{ ok: true }> {
    await this.manageable(id, actor);
    await this.prisma.taskRecurrence.delete({ where: { id } });
    return { ok: true };
  }
```

Note: `data` key order in the spec's `toHaveBeenCalledWith` does not matter (`toEqual` semantics).

- [ ] **Step 3: Routes — BEFORE `@Get(':id')`**

In `tasks.controller.ts`, right after `assignable` (a static path must be declared before `:id`, or `GET /tasks/recurrences` would be read as a task id):

```ts
  @Get('recurrences') async recurrenceList(
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.recurrences.list(await this.actor(uid, cid));
  }
  @Patch('recurrences/:id') async updateRecurrence(
    @Param('id') id: string,
    @Body() dto: UpdateTaskRecurrenceDto,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.recurrences.update(id, dto, await this.actor(uid, cid));
  }
  @Delete('recurrences/:id') async removeRecurrence(
    @Param('id') id: string,
    @CurrentUser('id') uid: number,
    @CurrentUser('companyId') cid: number,
  ) {
    return this.recurrences.remove(id, await this.actor(uid, cid));
  }
```

`tasks.controller.spec.ts`: rename the test to `'gives all twenty routes the any-staff marker…'` and `toHaveLength(20)`. Add one test that the `recurrenceList` handler is declared before `detail`:

```ts
  it('declares GET recurrences before GET :id, so the word is never read as an id', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('recurrenceList')).toBeLessThan(names.indexOf('detail'));
  });
```

- [ ] **Step 4: Route manifest**

`server/src/common/auth/branch-route-policy.ts`:
- In the `BRANCH_SCOPED_BY_SERVICE` entry of the task module (routes `GET /tasks`, …), add `'GET /tasks/recurrences'` to `routes` (keep the list sorted as it is) and append to its `reason`: `' The recurrence list (`TaskRecurrencesService.list`) applies the same scope: the CEO the company, a Branch Director their own rules plus their branches\', anyone else their own.'`
- In the `BRANCH_SCOPED_BY_ENTITY` entry, add `'DELETE /tasks/recurrences/:id'` and `'PATCH /tasks/recurrences/:id'` and append: `' A recurrence rule is loaded by id AND company and checked with the same `resolveAccess` on the RULE (author, the CEO, a Branch Director of its `branchId`); anyone else gets 404.'`

- [ ] **Step 5: Run — passes**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/tasks/task-recurrences.service.ts src/tasks/task-recurrences.service.spec.ts src/tasks/tasks.controller.ts src/tasks/tasks.controller.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/tasks src/common/auth/branch-route-policy.ts --quiet
npx jest src/tasks src/common/auth/branch-route-policy.spec.ts src/common/permissions/permission-routes.spec.ts
npm run typecheck
```

Expected: green. If `permission-routes.spec.ts` lists route counts per decorator, update it in the same way the spec's message says (add the three routes under `anyStaff`).

- [ ] **Step 6: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/tasks/task-recurrences.service.ts server/src/tasks/task-recurrences.service.spec.ts server/src/tasks/tasks.controller.ts server/src/tasks/tasks.controller.spec.ts server/src/common/auth/branch-route-policy.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks): list, edit, stop and delete recurrence rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client — the picker, the payload, the card badge

**Files:**
- Modify: `client/src/hooks/use-tasks.ts`
- Create: `client/src/components/tasks/task-recurrence-rules.ts`
- Test: `client/src/components/tasks/task-recurrence-rules.test.ts`
- Create: `client/src/components/tasks/task-recurrence-fields.tsx`
- Modify: `client/src/components/tasks/task-create-dialog.tsx`, `client/src/components/tasks/task-card.tsx`

**Interfaces:**
- Consumes: the server shapes of Tasks 3, 5 (`recurrence` on cards and on `POST /tasks`).
- Produces (later client tasks rely on these names):
  - `use-tasks.ts`: `type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY"`; `interface TaskRecurrenceBadge { freq: RecurrenceFreq; weekdays: number[]; dayOfMonth: number | null }`; `TaskCard.recurrence?: TaskRecurrenceBadge | null`; `interface TaskRecurrenceView extends TaskRecurrenceBadge { id: string; dueTime: string; title: string; active: boolean; separateCopies: boolean; nextRunDate: string; author: TaskPerson; assignees: TaskPerson[]; canManage: boolean }`; `TaskDetailPayload.recurrence?: TaskRecurrenceView | null`
  - `task-recurrence-rules.ts`: `WEEKDAYS`, `RECURRENCE_CHOICES`, `type RecurrenceChoice`, `interface RecurrenceForm { freq: RecurrenceChoice; weekdays: number[]; dayOfMonth: number; time: string }`, `EMPTY_RECURRENCE`, `recurrenceBadge(r)`, `recurrenceLine(r)`, `recurrencePayload(f)`, `recurrenceFormReady(f)`, `formFromRule(r)`, `dayMonth(dateStr)`
  - `TaskRecurrenceFields({ value, onChange, allowNone? })`

- [ ] **Step 1: Types in `use-tasks.ts`**

Add after `TaskLesson`:

```ts
export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";
/** The card's badge: only while the rule runs (null once it is stopped). Weekdays 1 = dushanba … 6 = shanba. */
export interface TaskRecurrenceBadge { freq: RecurrenceFreq; weekdays: number[]; dayOfMonth: number | null }
/** `GET /tasks/recurrences` rows and `GET /tasks/:id` → `recurrence`; `nextRunDate` is `YYYY-MM-DD`. */
export interface TaskRecurrenceView extends TaskRecurrenceBadge {
  id: string; dueTime: string; title: string; active: boolean; separateCopies: boolean; nextRunDate: string;
  author: TaskPerson; assignees: TaskPerson[]; canManage: boolean;
}
```

In `TaskCard` add `recurrence?: TaskRecurrenceBadge | null;` (optional: an older server sends none). In `TaskDetailPayload` add `recurrence?: TaskRecurrenceView | null`.

- [ ] **Step 2: Failing vitest**

`client/src/components/tasks/task-recurrence-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMPTY_RECURRENCE, dayMonth, formFromRule, recurrenceBadge, recurrenceFormReady, recurrenceLine, recurrencePayload } from "./task-recurrence-rules";

describe("recurrenceBadge", () => {
  it("reads like the mock-up", () => {
    expect(recurrenceBadge({ freq: "DAILY", weekdays: [], dayOfMonth: null })).toBe("Har kuni");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [1], dayOfMonth: null })).toBe("Har dushanba");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [4, 1], dayOfMonth: null })).toBe("Har dushanba va payshanba");
    expect(recurrenceBadge({ freq: "WEEKLY", weekdays: [1, 3, 5], dayOfMonth: null })).toBe("Har hafta: Du, Cho, Ju");
    expect(recurrenceBadge({ freq: "MONTHLY", weekdays: [], dayOfMonth: 5 })).toBe("Har oyning 5-sanasi");
  });
  it("the sheet line adds the time", () => {
    expect(recurrenceLine({ freq: "WEEKLY", weekdays: [1], dayOfMonth: null, dueTime: "10:00" })).toBe("Har dushanba, 10:00");
  });
});

describe("recurrencePayload", () => {
  it("none → no recurrence (a one-off task)", () => {
    expect(recurrencePayload(EMPTY_RECURRENCE)).toBeUndefined();
  });
  it("sends only what the frequency uses, days in order", () => {
    expect(recurrencePayload({ freq: "DAILY", weekdays: [2], dayOfMonth: 9, time: "09:30" })).toEqual({ freq: "DAILY", dueTime: "09:30" });
    expect(recurrencePayload({ freq: "WEEKLY", weekdays: [5, 1], dayOfMonth: 1, time: "10:00" })).toEqual({ freq: "WEEKLY", weekdays: [1, 5], dueTime: "10:00" });
    expect(recurrencePayload({ freq: "MONTHLY", weekdays: [1], dayOfMonth: 28, time: "" })).toEqual({ freq: "MONTHLY", dayOfMonth: 28, dueTime: "18:00" });
  });
  it("a weekly rule needs at least one day", () => {
    expect(recurrenceFormReady({ ...EMPTY_RECURRENCE, freq: "WEEKLY", weekdays: [] })).toBe(false);
    expect(recurrenceFormReady({ ...EMPTY_RECURRENCE, freq: "WEEKLY", weekdays: [2] })).toBe(true);
    expect(recurrenceFormReady(EMPTY_RECURRENCE)).toBe(true);
  });
});

describe("formFromRule / dayMonth", () => {
  it("fills the editor from a stored rule", () => {
    expect(formFromRule({ freq: "MONTHLY", weekdays: [], dayOfMonth: 5, dueTime: "09:00" })).toEqual({ freq: "MONTHLY", weekdays: [1], dayOfMonth: 5, time: "09:00" });
  });
  it("shows a stored day as dd.mm", () => {
    expect(dayMonth("2026-10-19")).toBe("19.10");
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client && npx vitest run src/components/tasks/task-recurrence-rules.test.ts` — FAIL.

- [ ] **Step 3: `task-recurrence-rules.ts`**

```ts
import type { RecurrenceFreq, TaskRecurrenceBadge } from "@/hooks/use-tasks";

/** The server's numbering, 1 = dushanba … 6 = shanba; Sunday is never a run day. */
export const WEEKDAYS: { id: number; short: string; name: string }[] = [
  { id: 1, short: "Du", name: "dushanba" },
  { id: 2, short: "Se", name: "seshanba" },
  { id: 3, short: "Cho", name: "chorshanba" },
  { id: 4, short: "Pa", name: "payshanba" },
  { id: 5, short: "Ju", name: "juma" },
  { id: 6, short: "Sh", name: "shanba" },
];

export type RecurrenceChoice = "NONE" | RecurrenceFreq;
export const RECURRENCE_CHOICES: { id: RecurrenceChoice; label: string }[] = [
  { id: "NONE", label: "Yo'q" },
  { id: "DAILY", label: "Har kuni" },
  { id: "WEEKLY", label: "Har hafta" },
  { id: "MONTHLY", label: "Har oy" },
];

export interface RecurrenceForm { freq: RecurrenceChoice; weekdays: number[]; dayOfMonth: number; time: string }
const DEFAULT_TIME = "18:00";
export const EMPTY_RECURRENCE: RecurrenceForm = { freq: "NONE", weekdays: [1], dayOfMonth: 1, time: DEFAULT_TIME };

/** The card badge (spec screen 1): «Har kuni», «Har dushanba», «Har oyning 5-sanasi». */
export function recurrenceBadge(r: TaskRecurrenceBadge): string {
  if (r.freq === "DAILY") return "Har kuni";
  if (r.freq === "MONTHLY") return `Har oyning ${r.dayOfMonth}-sanasi`;
  const days = WEEKDAYS.filter((d) => r.weekdays.includes(d.id));
  if (days.length === 1) return `Har ${days[0].name}`;
  if (days.length === 2) return `Har ${days[0].name} va ${days[1].name}`;
  return `Har hafta: ${days.map((d) => d.short).join(", ")}`;
}

/** The sheet's line: «Har dushanba, 10:00». */
export const recurrenceLine = (r: TaskRecurrenceBadge & { dueTime: string }) => `${recurrenceBadge(r)}, ${r.dueTime}`;

/** `POST /tasks` → `recurrence`, and `PATCH …/recurrences/:id` → `schedule`; undefined = a one-off task. */
export function recurrencePayload(f: RecurrenceForm): { freq: RecurrenceFreq; weekdays?: number[]; dayOfMonth?: number; dueTime: string } | undefined {
  if (f.freq === "NONE") return undefined;
  const dueTime = f.time || DEFAULT_TIME;
  if (f.freq === "WEEKLY") return { freq: "WEEKLY", weekdays: [...f.weekdays].sort((a, b) => a - b), dueTime };
  if (f.freq === "MONTHLY") return { freq: "MONTHLY", dayOfMonth: f.dayOfMonth, dueTime };
  return { freq: "DAILY", dueTime };
}

export const recurrenceFormReady = (f: RecurrenceForm) => f.freq !== "WEEKLY" || f.weekdays.length > 0;

export function formFromRule(r: TaskRecurrenceBadge & { dueTime: string }): RecurrenceForm {
  return { freq: r.freq, weekdays: r.weekdays.length ? r.weekdays : [1], dayOfMonth: r.dayOfMonth ?? 1, time: r.dueTime };
}

/** `YYYY-MM-DD` (a Tashkent day from the server) → «19.10». */
export const dayMonth = (dateStr: string) => `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}`;
```

- [ ] **Step 4: `task-recurrence-fields.tsx`**

```tsx
"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { RECURRENCE_CHOICES, WEEKDAYS, type RecurrenceChoice, type RecurrenceForm } from "./task-recurrence-rules";

const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** «Takrorlash»: how often, which days, what time. `allowNone` = false in the sheet's editor (a rule is stopped there, not set to «Yo'q»). */
export function TaskRecurrenceFields({ value, onChange, allowNone = true }: { value: RecurrenceForm; onChange: (f: RecurrenceForm) => void; allowNone?: boolean }) {
  const choices = allowNone ? RECURRENCE_CHOICES : RECURRENCE_CHOICES.filter((c) => c.id !== "NONE");
  const toggleDay = (id: number) =>
    onChange({ ...value, weekdays: value.weekdays.includes(id) ? value.weekdays.filter((d) => d !== id) : [...value.weekdays, id] });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Select value={value.freq} onValueChange={(v) => onChange({ ...value, freq: v as RecurrenceChoice })}>
          <SelectTrigger className="w-40" aria-label="Takrorlash"><SelectValue /></SelectTrigger>
          <SelectContent>{choices.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
        </Select>
        {value.freq === "MONTHLY" && (
          <Select value={String(value.dayOfMonth)} onValueChange={(v) => onChange({ ...value, dayOfMonth: Number(v) })}>
            <SelectTrigger className="w-28" aria-label="Oy kuni"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTH_DAYS.map((d) => <SelectItem key={d} value={String(d)}>{`${d}-sana`}</SelectItem>)}</SelectContent>
          </Select>
        )}
        {value.freq !== "NONE" && <TimePicker value={value.time} onChange={(time) => onChange({ ...value, time })} minTime="08:00" maxTime="22:00" className="w-28" />}
      </div>
      {value.freq === "WEEKLY" && (
        <div role="group" aria-label="Hafta kunlari" className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.id}
              type="button"
              aria-pressed={value.weekdays.includes(d.id)}
              onClick={() => toggleDay(d.id)}
              className={cn("rounded-md border px-2.5 py-1 text-xs", value.weekdays.includes(d.id) ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground")}
            >
              {d.short}
            </button>
          ))}
        </div>
      )}
      {value.freq === "MONTHLY" && <p className="text-xs text-muted-foreground">{"29–31-sanalar tanlanmaydi: ular har oyda bo'lmaydi."}</p>}
      {value.freq !== "NONE" && <p className="text-xs text-muted-foreground">{"Yakshanba yoki bayramga tushsa, keyingi ish kuniga suriladi. Oldingisi bajarilmagan bo'lsa, yangisi berilmaydi."}</p>}
    </div>
  );
}
```

- [ ] **Step 5: The create dialog**

In `task-create-dialog.tsx`:
- imports: `TaskRecurrenceFields` from `./task-recurrence-fields`; `EMPTY_RECURRENCE`, `recurrenceFormReady`, `recurrencePayload`, `type RecurrenceForm` from `./task-recurrence-rules`.
- state: `const [recurrence, setRecurrence] = useState<RecurrenceForm>(EMPTY_RECURRENCE);` and `const recurring = recurrence.freq !== "NONE";`
- `canSubmit`: `title.trim() !== "" && assigneeIds.length > 0 && recurrenceFormReady(recurrence) && !saving`.
- `reset`: add `setRecurrence(EMPTY_RECURRENCE);`.
- body: `dueAt: !recurring && day ? tashkentDateTime(day, time) : undefined,` and `recurrence: recurrencePayload(recurrence),`.
- toast: `toast.success(recurring ? "Takrorlanuvchi topshiriq berildi" : "Topshiriq berildi");`
- «Muddat» block: when `recurring`, replace the `DatePicker` + `TimePicker` row with `<p className="py-2 text-sm text-muted-foreground">{"Muddat «Takrorlash» bo'yicha qo'yiladi"}</p>`.
- inside `{more && (…)}`, after «Kuzatuvchi»:

```tsx
              <div className="space-y-1.5">
                <Label>Takrorlash</Label>
                <TaskRecurrenceFields value={recurrence} onChange={setRecurrence} />
              </div>
```

- [ ] **Step 6: The card badge**

In `task-card.tsx`: import `Repeat` from `lucide-react` and `recurrenceBadge` from `./task-recurrence-rules`; in the top badge row, after the batch badge:

```tsx
        {task.recurrence && <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"><Repeat className="size-3" />{recurrenceBadge(task.recurrence)}</span>}
```

- [ ] **Step 7: Run — passes (no Prettier on client)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/hooks/use-tasks.ts src/components/tasks/task-recurrence-rules.ts src/components/tasks/task-recurrence-rules.test.ts src/components/tasks/task-recurrence-fields.tsx src/components/tasks/task-create-dialog.tsx src/components/tasks/task-card.tsx --quiet
npx vitest run src/components/tasks
```

Expected: clean, all tests green.

- [ ] **Step 8: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/hooks/use-tasks.ts client/src/components/tasks/task-recurrence-rules.ts client/src/components/tasks/task-recurrence-rules.test.ts client/src/components/tasks/task-recurrence-fields.tsx client/src/components/tasks/task-create-dialog.tsx client/src/components/tasks/task-card.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): recurrence picker in the create dialog and the card badge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Client — the rule in the sheet and the «Takrorlanuvchi» list

**Files:**
- Create: `client/src/components/tasks/task-drawer-recurrence.tsx`
- Create: `client/src/components/tasks/task-recurrences-dialog.tsx`
- Modify: `client/src/components/tasks/task-drawer.tsx`, `client/src/components/tasks/tasks-page-client.tsx`

**Interfaces:**
- Consumes: Task 7 (`TaskRecurrenceView`, `TaskRecurrenceFields`, `recurrenceLine`, `recurrencePayload`, `recurrenceFormReady`, `formFromRule`, `dayMonth`); `TaskAssigneePicker`; `useTasks` (`reloadDetail`, `fetchBoard`); server routes of Task 6.
- Produces: `TaskDrawerRecurrence({ taskId, rule })`, `TaskRecurrencesButton()`.

- [ ] **Step 1: `task-drawer-recurrence.tsx`**

```tsx
"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskRecurrenceView } from "@/hooks/use-tasks";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { TaskRecurrenceFields } from "./task-recurrence-fields";
import { dayMonth, formFromRule, recurrenceFormReady, recurrenceLine, recurrencePayload, type RecurrenceForm } from "./task-recurrence-rules";

/** A recurring task's rule (spec §3.6): the author, a director of its branch or the CEO edits, stops or resumes it. */
export function TaskDrawerRecurrence({ taskId, rule }: { taskId: string; rule: TaskRecurrenceView }) {
  const [draft, setDraft] = useState<{ form: RecurrenceForm; assigneeIds: number[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await api.patch(`/tasks/recurrences/${rule.id}`, body);
      toast.success(done);
      setDraft(null);
      void useTasks.getState().reloadDetail(taskId);
      // Every card of the rule carries its badge.
      void useTasks.getState().fetchBoard();
    } catch (error) {
      toast.error(getErrorMessage(error, "Takrorlanishni saqlashda xatolik yuz berdi"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-1.5">
      <h4 className="text-sm font-semibold">Takrorlanish</h4>
      {draft ? (
        <div className="space-y-3">
          <TaskRecurrenceFields value={draft.form} onChange={(form) => setDraft({ ...draft, form })} allowNone={false} />
          <div className="space-y-1.5">
            <Label>Keyingi topshiriqlar ijrochisi</Label>
            <TaskAssigneePicker value={draft.assigneeIds} onChange={(assigneeIds) => setDraft({ ...draft, assigneeIds })} mode="assignees" placeholder="Ism yozing" />
          </div>
          <p className="text-xs text-muted-foreground">{"O'zgarish ertadan boshlab ishlaydi."}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || draft.assigneeIds.length === 0 || !recurrenceFormReady(draft.form)} onClick={() => void send({ schedule: recurrencePayload(draft.form), assigneeIds: draft.assigneeIds }, "Takrorlanish yangilandi")}>Saqlash</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDraft(null)}>Bekor qilish</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={rule.active ? undefined : "text-muted-foreground line-through"}>{recurrenceLine(rule)}</span>
          <span className="text-xs text-muted-foreground">{rule.active ? `Keyingisi: ${dayMonth(rule.nextRunDate)}` : "To'xtatilgan"}</span>
          {rule.canManage && rule.active && (
            <Button size="xs" variant="ghost" onClick={() => setDraft({ form: formFromRule(rule), assigneeIds: rule.assignees.map((a) => a.id) })}>{"O'zgartirish"}</Button>
          )}
          {rule.canManage && (
            <Button size="xs" variant="ghost" disabled={busy} onClick={() => void send({ active: !rule.active }, rule.active ? "Takrorlanish to'xtatildi" : "Takrorlanish qayta yoqildi")}>
              {rule.active ? "To'xtatish" : "Davom ettirish"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
```

In `task-drawer.tsx` `DrawerBody`: destructure `recurrence` from `detail` and render after `<TaskDrawerProperties … />`:

```tsx
        {recurrence && <TaskDrawerRecurrence taskId={task.id} rule={recurrence} />}
```

- [ ] **Step 2: `task-recurrences-dialog.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskRecurrenceView } from "@/hooks/use-tasks";
import { personName } from "./task-feed-text";
import { dayMonth, recurrenceLine } from "./task-recurrence-rules";

/** «Takrorlanuvchi» next to «Yangi topshiriq»: the rules this person may manage (spec §9.5 `GET /tasks/recurrences`). */
export function TaskRecurrencesButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label="Takrorlanuvchi topshiriqlar">
        <Repeat className="size-4 sm:mr-1" /><span className="hidden sm:inline">Takrorlanuvchi</span>
      </Button>
      {open && <RecurrencesDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function RecurrencesDialog({ onClose }: { onClose: () => void }) {
  // `null` = loading.
  const [rows, setRows] = useState<TaskRecurrenceView[] | null>(null);
  const [reads, setReads] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TaskRecurrenceView | null>(null);

  useEffect(() => {
    let alive = true;
    api.get<{ data: TaskRecurrenceView[] }>("/tasks/recurrences")
      .then(({ data }) => { if (alive) setRows(data.data); })
      .catch((error) => { if (alive) { setRows([]); toast.error(getErrorMessage(error, "Ro'yxatni yuklashda xatolik")); } });
    return () => { alive = false; };
  }, [reads]);

  const act = async (rule: TaskRecurrenceView, request: Promise<unknown>, done: string) => {
    setBusyId(rule.id);
    try {
      await request;
      toast.success(done);
      setReads((n) => n + 1);
      void useTasks.getState().fetchBoard();
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4"><DialogTitle>Takrorlanuvchi topshiriqlar</DialogTitle></DialogHeader>
        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {rows === null && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
          {rows?.length === 0 && (
            <p className="text-sm text-muted-foreground">{"Takrorlanuvchi topshiriq yo'q. Topshiriq berishda «Batafsil» → «Takrorlash» ni tanlang."}</p>
          )}
          {rows?.map((r) => (
            <div key={r.id} className="space-y-1 rounded-lg border p-3 text-sm">
              <p className="font-medium">{r.title}</p>
              <p className="text-muted-foreground">
                {recurrenceLine(r)} · {r.active ? `keyingisi ${dayMonth(r.nextRunDate)}` : "to'xtatilgan"}
              </p>
              <p className="text-xs text-muted-foreground">{r.assignees.map(personName).join(", ") || "—"}</p>
              {r.canManage && (
                <div className="flex gap-2 pt-1">
                  <Button size="xs" variant="outline" disabled={busyId === r.id} onClick={() => void act(r, api.patch(`/tasks/recurrences/${r.id}`, { active: !r.active }), r.active ? "Takrorlanish to'xtatildi" : "Takrorlanish qayta yoqildi")}>
                    {r.active ? "To'xtatish" : "Davom ettirish"}
                  </Button>
                  <Button size="xs" variant="ghost" className="text-destructive" disabled={busyId === r.id} onClick={() => setDeleting(r)}>{"O'chirish"}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
      <AlertDialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{"Takrorlanishni o'chirasizmi?"}</AlertDialogTitle>
            <AlertDialogDescription>{"Yangi topshiriqlar berilmaydi. Berilgan topshiriqlar o'z joyida qoladi."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { if (deleting) void act(deleting, api.delete(`/tasks/recurrences/${deleting.id}`), "Takrorlanish o'chirildi"); setDeleting(null); }}
            >
              {"O'chirish"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
```

Check `personName`'s signature in `task-feed-text.ts` (it takes a `TaskPerson`); if it does not fit `.map(personName)` directly, use `.map((p) => personName(p))`. Check how other destructive buttons in the repo style their `AlertDialogAction` (`grep -rn "AlertDialogAction" client/src/components | head`) and copy that class instead of the one above if it differs.

- [ ] **Step 3: The page button**

In `tasks-page-client.tsx`, import `TaskRecurrencesButton` and wrap the header button:

```tsx
        <div className="flex gap-2">
          <TaskRecurrencesButton />
          <Button onClick={() => openCreate({})}><Plus className="mr-1 size-4" />Yangi topshiriq</Button>
        </div>
```

- [ ] **Step 4: Run — passes (no Prettier on client)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx eslint src/components/tasks/task-drawer-recurrence.tsx src/components/tasks/task-recurrences-dialog.tsx src/components/tasks/task-drawer.tsx src/components/tasks/tasks-page-client.tsx --quiet
npx vitest run src/components/tasks
```

Expected: clean, green.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/tasks/task-drawer-recurrence.tsx client/src/components/tasks/task-recurrences-dialog.tsx client/src/components/tasks/task-drawer.tsx client/src/components/tasks/tasks-page-client.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(tasks-ui): recurrence rule in the task sheet and the rules list" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ADR-0084, server and client notes, guide and news

**Files:**
- Create: `docs/adr/0084-takrorlanuvchi-topshiriq.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md` («Tasks (`src/tasks/`)» section), `client/CLAUDE.md` («Tasks» section), `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`

**Interfaces:** none (docs).

- [ ] **Step 1: Recheck the ADR number**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup fetch origin main
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup show origin/main:docs/adr/README.md | tail -5
```

If 0084 is taken, use the next free number everywhere below.

- [ ] **Step 2: `docs/adr/0084-takrorlanuvchi-topshiriq.md`** (Uzbek, same layout as ADR-0083)

```markdown
# ADR-0084 — Takrorlanuvchi topshiriq: qoida, birinchi topshiriq darhol, 07:00 dagi yurish

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0074 (topshiriq alohida bo'lim, berish zinasi), ADR-0078 (Telegram, tungi tinchlik), dizayn `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §3.6, §9.5, §9.6, `server/src/tasks/task-recurrence-rules.ts`, migratsiya `20261011120000_task_recurrence`

## Kontekst

Spec takrorlanishni qoida (`TaskRecurrence`) va 07:00 dagi cron sifatida belgilagan, lekin bir nechta savolni ochiq qoldirgan: birinchi topshiriq qachon chiqadi, ikki server nusxasi bir vaqtda ishlasa nima bo'ladi, «Har biriga alohida» bilan «oxirgisi ochiq» qanday tekshiriladi, muallif ishdan ketsa qoida nima qiladi.

## Qaror

1. Qoida topshiriq berish oynasining «Batafsil» qismidan yaratiladi («Takrorlash»: Har kuni / Har hafta — kunlari / Har oy — 1–28-sana, va vaqti 08:00–22:00). Qoidani berish huquqi — topshiriq berish huquqi bilan bir xil (zina).
2. Qoida bilan birga **birinchi topshiriq darhol** beriladi: vaqti hali o'tmagan birinchi kunga. Keyingilarini har kuni 07:00 (Toshkent) dagi yurish beradi; muddati — o'sha kuni qoidadagi vaqt.
3. Kun yakshanba yoki filial bayramiga tushsa — keyingi ish kuniga suriladi; bitta kunga tushib qolgan ikki kun bitta topshiriq beradi. Yakshanba va bayram ertalabi qoida kutadi.
4. Qoidaning oldingi topshirig'i hali ochiq bo'lsa, yangisi berilmaydi, sana baribir suriladi. «Har biriga alohida» qoidada bu har ijrochi uchun alohida tekshiriladi. Shuning uchun `lastTaskId` ustuni yo'q: topshiriqning o'zi `recurrenceId` ni saqlaydi.
5. Ikki server nusxasi (deploy paytida) bitta qoidadan ikki topshiriq bermaydi: yurish tranzaksiyasining birinchi yozuvi `nextRunDate` ni faqat u o'qilgan qiymatda bo'lsa suradi; ikkinchisi hech narsa topmaydi. Topshiriq yozilmasa, surish ham bekor bo'ladi va ertasi kuni qayta urinadi.
6. Server o'chib qolgan ertalab keyingi ish kunida bitta topshiriq bilan to'ldiriladi (har o'tgan kun uchun emas).
7. Yurish paytida huquq qoida muallifiniki bo'yicha qayta tekshiriladi: muallif ishdan ketsa yoki bog'langan o'quvchi/guruh/lid/xodim topilmasa — qoida o'zi to'xtaydi; ijrochi ketgan yoki endi berib bo'lmaydigan bo'lsa — u tushib qoladi; hech kim qolmasa — o'sha kun o'tkazib yuboriladi.
8. Qoidani muallif, o'sha filial direktori yoki CEO boshqaradi: «To'xtatish» (qaytariladi — «Davom ettirish»), «O'zgartirish» (jadval va ijrochilar; ertadan boshlab), «O'chirish» (qoida yo'qoladi, berilgan topshiriqlar qoladi). Sarlavha, tavsif, qadamlar, kuzatuvchi, muhimlikni o'zgartirish uchun qoida to'xtatilib, yangisi yaratiladi.
9. Topshiriq oddiy qo'lda berilgan topshiriqdek xabar qiladi (beruvchi — muallif); 07:00 dagi xabar Telegram'ga 08:00 da boradi (tungi tinchlik).

## Ko'rib chiqilgan muqobillar

- `lastTaskId` ustuni (spec matni): «Har biriga alohida» qoidada bitta yurish bir nechta topshiriq beradi — bitta havola yetmaydi.
- `(recurrenceId, kun)` bo'yicha unikal indeks: topshiriqqa yangi ustun va qo'lda yoziladigan indeks kerak bo'lardi; shartli surish shu ishni bitta qatorda qiladi.
- Birinchi topshiriqni cron'ga qoldirish: «Har dushanba» seshanba kuni yaratilsa, bir hafta hech narsa ko'rinmasdi.

## Oqibatlari

- Doska kartasida qoida yoqilgan topshiriqda «Har dushanba» kabi belgi; varaqda qoida va tugmalar; «Topshiriqlar» sahifasida «Takrorlanuvchi» ro'yxati.
- Yurish bir ertalabda 500 tagacha qoidani o'tadi; qolgani ertasiga (keyin ko'paytiriladi).
- Rasm bilan tasdiqlash qoidaga 3-bosqich (fayllar) bilan qo'shiladi.
```

Add the row to `docs/adr/README.md` after 0083:

```markdown
| [0084](0084-takrorlanuvchi-topshiriq.md) | Takrorlanuvchi topshiriq: birinchisi qoida bilan darhol, keyingilari har kuni 07:00 da; yakshanba/bayram keyingi ish kuniga; oldingisi ochiq bo'lsa yangisi yo'q; ikki nusxa ikki marta bermaydi; muallif ketsa qoida to'xtaydi; to'xtatish/o'chirishda topshiriqlar qoladi | Qabul qilindi | 2026-10-11 |
```

- [ ] **Step 3: `server/CLAUDE.md`** — in «Tasks (`src/tasks/`)», add after the «Join request task» bullet:

```markdown
- **Recurring tasks** (ADR-0084; spec §3.6). A rule is a `TaskRecurrence` row (schedule `freq` DAILY/WEEKLY/MONTHLY, `weekdays` 1–6, `dayOfMonth` 1–28, `dueTime` "HH:mm" 08:00–22:00; template title/description/priority/assignees/watchers/steps/link/`separateCopies`; `authorId`, `branchId`, `active`, `nextRunDate` `@db.Date`); its tasks are MANUAL with `Task.recurrenceId` (FK `ON DELETE SET NULL`). Date math is pure in `task-recurrence-rules.ts` (`nextRunDateAfter` skips Sundays and the branch's holidays; days pushed onto one working day make one run). `POST /tasks` with `recurrence` goes to `TaskRecurrencesService.create` (no `dueAt` allowed): the same checks and writer as a one-off create (`TasksService.prepareCreate`, `createCopiesTx`), the rule and its FIRST task in one transaction, due on the first run day whose time is still ahead. `TaskRecurrenceRunner` (`@Cron('0 0 7 * * *')` Tashkent, 500 rules a run): rules with `nextRunDate <= today` (a missed morning is made up once, never on a Sunday/holiday); the author's rights re-checked (`loadActor`, `assertMayLinkEntity` — author or link gone → the rule stops itself), people re-filtered (`reachablePeople`: active staff on the author's ladder); then ONE transaction whose first write is `updateMany({ where: { id, active, nextRunDate: <read> } })` → `count 0` means another instance has it (the idempotency key); while a task of the rule is open no new one (per assignee for separate copies, `runGroups`), the date still moves; `task.assigned` after the commit with `actorId = author`. Routes: `GET /tasks/recurrences` (CEO company, Branch Director own + branches, others own), `PATCH /tasks/recurrences/:id` (`schedule`, `active`, `assigneeIds`; a new schedule or a resume starts tomorrow), `DELETE /tasks/recurrences/:id` (the rule goes, its tasks stay); manage = author / Branch Director of the rule's branch / CEO, anyone else 404. Cards carry `recurrence` (badge, null once stopped); `GET /tasks/:id` carries `recurrence` (the rule's view with `canManage`).
```

Also update the «One door» bullet's list of writers: add `task-recurrences.service.ts`, `task-recurrence-run.service.ts`.

- [ ] **Step 4: `client/CLAUDE.md`** — in «Tasks (`components/tasks/`, `hooks/use-tasks.ts`)» add:

```markdown
- **Recurring tasks** (ADR-0084): the create dialog's «Batafsil» has «Takrorlash» (`task-recurrence-fields.tsx`; Yo'q / Har kuni / Har hafta + days / Har oy + 1–28 + time). A chosen recurrence hides the date picker and sends `recurrence` instead of `dueAt`. The card shows `recurrenceBadge` («Har dushanba») while the rule runs; the drawer shows `TaskDrawerRecurrence` (from `detail.recurrence`: line, next day, «O'zgartirish» — schedule + assignees, «To'xtatish» / «Davom ettirish» for `canManage`); `/tasks` has a «Takrorlanuvchi» button opening the rule list (`task-recurrences-dialog.tsx`, stop/resume/delete with a confirm). Texts and payloads in `task-recurrence-rules.ts` (vitest).
```

- [ ] **Step 5: Guide** — in `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, add after the «Topshiriq berish» section's «O'quvchi, guruh, lid yoki xodimga bog'lash» paragraph (before `## Holatlar va tugmalar`):

```markdown
## Takrorlanuvchi topshiriq

Har kuni, har hafta yoki har oy qaytariladigan ish uchun (masalan, «Har dushanba haftalik hisobot», «Har oyning 5-sanasi ijara») topshiriqni bir marta bering:

1. Topshiriq berish oynasida «Batafsil» ni bosing.
2. «Takrorlash» da «Har kuni», «Har hafta» (kunlarini belgilang) yoki «Har oy» (1 dan 28 gacha sanani tanlang) ni va vaqtini tanlang. Takrorlash tanlansa, «Muddat» sanasi so'ralmaydi.
3. «Berish» ni bosing.

- Birinchi topshiriq darhol beriladi — vaqti hali o'tmagan birinchi kunga. Keyingilarini tizim har kuni ertalab 07:00 da beradi; muddati — o'sha kuni tanlangan vaqt. Telegram xabari 08:00 da keladi.
- Kun yakshanba yoki filial bayramiga tushsa, topshiriq keyingi ish kuniga suriladi.
- Oldingi topshiriq hali bajarilmagan bo'lsa, yangisi berilmaydi: eskisi «Muddati o'tdi» bo'lib turadi. «Har biriga alohida» bilan berilganda bu har ijrochi uchun alohida tekshiriladi.
- Kartada «Har kuni», «Har dushanba», «Har oyning 5-sanasi» kabi belgi turadi.
- Varaqda «Takrorlanish» qismi bor: beruvchi, o'sha filial direktori va CEO «O'zgartirish» (kunlar, vaqt, ijrochilar — ertadan boshlab), «To'xtatish» va «Davom ettirish» ni bosadi. Sarlavha yoki tavsifni o'zgartirish uchun takrorlanishni to'xtatib, yangisini bering.
- «Topshiriqlar» sahifasidagi «Takrorlanuvchi» tugmasi hamma takrorlanuvchi topshiriqlaringizni (filial direktoriga — filialinikini, CEO ga — hammasini) ko'rsatadi; u yerdan to'xtatish va o'chirish mumkin. O'chirilganda berilgan topshiriqlar qoladi.
- Beruvchi ishdan ketsa, takrorlanish o'zi to'xtaydi. Ijrochi ketsa, keyingi topshiriqlar qolgan ijrochilarga beriladi; hech kim qolmasa, topshiriq berilmaydi.
```

In `client/src/qollanma/sahifalar/boshlash.ts` (the «topshiriqlar» entry): append to `qisqacha` the sentence `Takrorlanadigan ishni «Batafsil» → «Takrorlash» bilan bir marta berasiz: har kuni, har hafta yoki har oy tizim yangi topshiriq beradi.`; add `"0084"` to `adr`; add `"takrorlanuvchi"`, `"takrorlash"`, `"har kuni"`, `"har hafta"`, `"har oy"` to `kalitSozlar`; keep `yangilangan: "2026-10-11"`.

- [ ] **Step 6: News** — at the top of `yangiliklar` in `client/src/qollanma/yangiliklar.ts`:

```ts
  {
    sana: "2026-10-11",
    sarlavha: "Takrorlanuvchi topshiriqlar",
    matn: "Endi topshiriqni takrorlanadigan qilib berish mumkin: berish oynasida «Batafsil» → «Takrorlash» da «Har kuni», «Har hafta» (kunlarini belgilab) yoki «Har oy» (1–28-sana) va vaqtni tanlang. Birinchi topshiriq darhol beriladi, keyingilarini tizim har kuni ertalab 07:00 da beradi; yakshanba va bayramga tushsa — keyingi ish kuniga. Oldingisi bajarilmagan bo'lsa, yangisi berilmaydi. Kartada «Har dushanba» kabi belgi turadi; varaqda takrorlanishni o'zgartirish va to'xtatish mumkin, «Topshiriqlar» sahifasidagi «Takrorlanuvchi» tugmasi hammasini bitta ro'yxatda ko'rsatadi.",
    rollar: [1, 2, 3, 4, 5],
    sahifa: { bolim: "boshlash", sahifa: "topshiriqlar" },
  },
```

- [ ] **Step 7: Checks and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npx vitest run src/qollanma
```

Expected: clean (the guide's own tests, if any, green). Then:

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add docs/adr/0084-takrorlanuvchi-topshiriq.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma/kontent/boshlash/topshiriqlar.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/yangiliklar.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "docs: ADR-0084 recurring tasks, server and client notes, guide and news" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Full verification

**Files:** none new; a fix lands in its own commit naming the failing gate. The throwaway database and the probe live outside git (the probe is deleted before any commit).

- [ ] **Step 1: Server gate — sequential, never two at once**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup diff --name-only origin/main -- server | grep '\.ts$'
```

Run `npx prettier --check` on exactly the listed files (paths relative to `server/`). Then one after another:

```bash
npx eslint src --quiet
npm test
npm run typecheck
npm run build
```

Expected: no prettier diffs, 0 eslint errors, every suite green — including `task-write.single-source.spec.ts` (`taskRecurrence` writes only in `src/tasks/`), `event-wiring.spec.ts`, `branch-route-policy.spec.ts`, `tasks.controller.spec.ts` (20 routes), `tasks.module.di.spec.ts` (both new providers) — typecheck and build clean.

- [ ] **Step 2: Client gate (no Prettier)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```

Expected: all clean (0 lint errors; vitest fallback `npx vitest --config vitest.config.ts run`).

- [ ] **Step 3: Throwaway PostgreSQL — migration, FK and the idempotency key**

Recipe: `.superpowers/sdd/2026-10-10-topshiriqlar-4a-avtomatika/task-11-report.md` and `.superpowers/sdd/2026-10-10-topshiriqlar-5-qongiroqcha/task-4-report.md` (section A5b). PostgreSQL binaries in `/Library/PostgreSQL/18/bin` (not on PATH), TCP only on 127.0.0.1:5599, data directory under the session scratchpad. `server/.env` is never read for this: every connecting command gets `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_recur_test` in its own environment.

1. Pre-change DDL, offline: `git show origin/main:server/prisma/schema.prisma > <scratchpad>/pre-schema.prisma`, then `DATABASE_URL=postgresql://u:p@127.0.0.1:1/none npx prisma migrate diff --from-empty --to-schema <scratchpad>/pre-schema.prisma --script --output <scratchpad>/pre-ddl.sql`.
2. `initdb -D <scratchpad>/pgdata -U postgres -A trust -E UTF8`, `pg_ctl -D <scratchpad>/pgdata -o "-p 5599 -c unix_socket_directories= -c listen_addresses=127.0.0.1" -w start`, `createdb -h 127.0.0.1 -p 5599 -U postgres task_recur_test`, `ALTER DATABASE task_recur_test SET timezone='UTC'`, `psql -f pre-ddl.sql`, then the hand-written indexes at the end of `server/prisma/migrations/20261007120000_tasks_module/migration.sql` (`task_open_source_unique`) and of the migration that created `TaskOutbox_time_row_key` (grep for it under `server/prisma/migrations`).
3. `psql -1 -f server/prisma/migrations/20261011120000_task_recurrence/migration.sql` — the real file, unchanged. Check with `\d "TaskRecurrence"` and `\d "Task"`: the columns, the three indexes, `Task_recurrenceId_fkey … ON DELETE SET NULL`.
4. Seed (plain `INSERT`s; read every NOT NULL column without a default from `\d "Company"`, `\d "Branch"`, `\d "User"`, `\d "Role"`, `\d "UserRole"`, `\d "UserBranch"` and fill it): Company 1; Branch 7 (company 1); Roles 1 «CEO», 3 «Administrator»; User 10 (CEO, `status ACTIVE`, `isActive true`), Users 20 and 21 (Administrators of branch 7, `mainBranch 7`, a `UserBranch` row each).
5. Probe `server/scripts/_probe-task-recurrence.ts` (imports `run` from `./lib/check-cli`; it must print the DB host and stop unless it is `127.0.0.1:5599`):

   ```ts
   import { EventEmitter2 } from '@nestjs/event-emitter';
   import { dbHost, run } from './lib/check-cli';
   import { TasksService } from '../src/tasks/tasks.service';
   import { TaskRecurrencesService } from '../src/tasks/task-recurrences.service';
   import { TaskRecurrenceRunner } from '../src/tasks/task-recurrence-run.service';

   void run(async (prisma) => {
     if (dbHost() !== '127.0.0.1:5599') throw new Error(`refusing ${dbHost()}`);
     const db = prisma as never;
     const emitter = new EventEmitter2();
     const tasks = new TasksService(db, emitter, {} as never, {} as never);
     const actor = await tasks.loadActor(10, 1, 7);
     // Monday 12.10.2026 06:00 Tashkent: today's 10:00 is still ahead.
     const [first] = await new TaskRecurrencesService(db, emitter, tasks).create(
       { title: 'Probe', assigneeIds: [20, 21], separateCopies: true, recurrence: { freq: 'DAILY', dueTime: '10:00' } },
       actor,
       new Date('2026-10-12T01:00:00Z'),
     );
     const rule = await prisma.taskRecurrence.findFirstOrThrow({ where: { title: 'Probe' } });
     console.log('first task', first.id, 'next run', rule.nextRunDate.toISOString().slice(0, 10)); // 2026-10-13
     // Close the first copies, then two instances run the same Tuesday morning at once.
     await prisma.task.updateMany({ where: { recurrenceId: rule.id }, data: { status: 'DONE' } });
     const tue = new Date('2026-10-13T02:00:00Z');
     const a = new TaskRecurrenceRunner(db, emitter, tasks);
     const b = new TaskRecurrenceRunner(db, emitter, tasks);
     console.log('two runs', await Promise.all([a.run(tue), b.run(tue)])); // one created, one taken
     console.log('tasks of the rule', await prisma.task.count({ where: { recurrenceId: rule.id } })); // 4 (2 + 2 copies)
     console.log('rerun', await a.run(tue)); // all zero: the date moved to 14.10
     // User 21 finishes Tuesday's copy, user 20 does not → on Wednesday only 21 gets one.
     await prisma.task.updateMany({
       where: { recurrenceId: rule.id, status: 'NEW', participants: { some: { userId: 21 } } },
       data: { status: 'DONE' },
     });
     const wed = new Date('2026-10-14T02:00:00Z');
     console.log('wed', await a.run(wed)); // created 1
     const wedCopies = await prisma.task.findMany({
       where: { recurrenceId: rule.id, dueAt: new Date('2026-10-14T05:00:00Z') },
       select: { participants: { select: { userId: true } } },
     });
     console.log('copies on wed', JSON.stringify(wedCopies)); // one copy, user 21
     await prisma.taskRecurrence.delete({ where: { id: rule.id } });
     console.log('kept after delete', await prisma.task.count({ where: { title: 'Probe', recurrenceId: null } })); // 5
   });
   ```

   Run from `server/`: `DATABASE_URL=postgresql://postgres@127.0.0.1:5599/task_recur_test npx ts-node --transpile-only scripts/_probe-task-recurrence.ts`. Expected (in order): next run `2026-10-13`; the two parallel runs sum to `created 1` and `taken 1`; 4 tasks; rerun all zero; on Wednesday `created 1` with ONE copy for user 21 only; 5 tasks kept after the delete, all with `recurrenceId` null. Anything else is a bug: fix it in its own commit (with a unit test that reproduces it), then rerun.
6. `pg_ctl -D <scratchpad>/pgdata stop`, delete the data directory, `rm server/scripts/_probe-task-recurrence.ts`. Confirm `git status` shows nothing new.

- [ ] **Step 4: Self-check against the spec** — read the diff once: no `prisma.task*.create|update|delete` (incl. `taskRecurrence`) outside `src/tasks/`; events emitted after commits only; no English word in a new Uzbek string and no `&apos;` in new JSX; every Tashkent date through `tashkent.ts` / plain `YYYY-MM-DD` strings; every user query of the run carries the active-staff filter; `LESSON_QUESTION` / automatic-task code untouched.

- [ ] **Step 5: Browser check list for the PR description** (after the server deploy; roles CEO, Administrator, Ustoz):
  1. Administrator: «Batafsil» → «Takrorlash: Har hafta» + Du, Cho + 10:00, assign a teacher → the date picker disappears; «Berish» → the teacher's board has a task due on the next Monday/Wednesday at 10:00 with «Har dushanba va chorshanba».
  2. The teacher opens it → «Takrorlanish: Har dushanba va chorshanba, 10:00 · Keyingisi …», no buttons. The administrator opens it → «O'zgartirish», «To'xtatish».
  3. «To'xtatish» → the badge disappears from the cards; the sheet shows «To'xtatilgan» and «Davom ettirish».
  4. «Takrorlanuvchi» on `/tasks` → the rule is listed; «O'chirish» asks first; afterwards the task stays.
  5. The next morning at 07:00 an active daily rule gives its task (bell at once, Telegram at 08:00).

---

## Deploy order

1. **Migration** — applied by the server deploy (`20261011120000_task_recurrence`: a new enum and table, one nullable column on `Task`; no data step).
2. **Server** (Railway `caring-courage`, production). The 07:00 run starts the next morning; there are no rules until someone makes one.
3. **Vercel** — the picker, the badge, the sheet section, the list, guide and news. Between the two deploys the old client never sends `recurrence` and ignores the cards' new field.
4. Rollback: the previous server build runs on the new schema (it ignores the table and the column). Rules stop giving tasks until the new build returns; tasks already given stay.
