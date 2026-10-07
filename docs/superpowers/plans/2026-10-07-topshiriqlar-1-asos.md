# Topshiriqlar — 1-bosqich «Asos» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace comment-based tasks (`Comment.isTask` + `CommentAssignee`) with a standalone `Task` module: own tables, a task-owned status (Yangi → Jarayonda → Tekshiruvda → Bajarildi), review/return, separate copies, watchers, steps, discussion feed, a `/tasks` page with board + list + «Men bergan» / «Barchasi» / «Yuklama», a create dialog reachable from the header and from entity pages, bell/push notifications, in-app deadline reminders, and a one-off migration of the 34 existing tasks.

**Architecture:** One NestJS module `server/src/tasks/` is the only writer of `Task*` rows (`TasksService`); pure policy and transition rules live in `task-policy.ts` / `task-transitions.ts` and are unit-tested in isolation. «Dars bo'ldimi?» (ADR-0054) keeps its rules but its task row becomes a `Task` (`kind = LESSON_QUESTION`). Notifications go through a `task.*` event family heard by `TaskNotifyListener` (bell + SSE + push, no Telegram in this phase); time-based notices (reminder, overdue) go through a `TaskOutbox` table drained by a per-minute cron. The client gets a new zustand store (`use-tasks.ts`), a rebuilt `/tasks` page, a right-side task drawer opened by `?task=<id>`, and the old comment task mode is removed.

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@nestjs/event-emitter`, `@nestjs/schedule`, Jest; Next.js 16 + React 19 (React Compiler on), zustand 5, `@tanstack/react-query`, `@dnd-kit/core`, shadcn/ui, vitest (node env, `*.test.ts` only).

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` (sections 3, 4, 5, 9, 10, 11 row «1 Asos»).

## Global Constraints

- Work in the worktree `.claude/worktrees/topshiriqlar-clickup` (branch `worktree-topshiriqlar-clickup`). Never `cd` to the main checkout.
- Server commands run from `server/` (`npx jest <path>`, `npm run typecheck`, `npx eslint src`, `npx prettier --write <files>`). Client commands from `client/` (`npx vitest run <path>`, `npx tsc --noEmit`, `npm run lint`). **No Prettier on `client/`.**
- Prisma: `server/prisma.config.ts` exists, so migrations are produced with `npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script > prisma/migrations/<name>/migration.sql`, applied with `npx prisma migrate deploy` (dev DB in `server/.env`), then `npx prisma generate`. Never `prisma migrate dev`.
- All user-visible text is Uzbek (Latin), no English words on screen. Code comments, commit messages: English. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Day/time rules use `common/date/tashkent.ts` helpers; `TASHKENT_OFFSET_MS = 5h`. Due time 08:00–22:00 Tashkent; manual tasks never on Sunday or a branch holiday; `dueAt` default 18:00 when only a day is picked.
- Title ≤ 200 chars, description ≤ 5000. Priority default `MEDIUM`.
- `requiresPhoto` exists in the schema but is NOT exposed in this phase's DTO/UI (files arrive in phase 3).
- Role ids: CEO=1, Branch Director=2, Administrator=3, Teacher=4, Cashier=5, Student=6. Roles are read from the database for permission decisions (`whereUserMayAct()`), never from the token.
- Every Task write goes through `TasksService` / `tasks/lesson-task.ts`; `task-write.single-source.spec.ts` enforces it.
- `event-wiring.spec.ts` requires every emitted event to have a listener and vice versa — add emits and `@OnEvent`s in the same task.
- `direct-send.guard.spec.ts` is untouched in this phase (no new `.sendMessage(` callers).
- Board: 50 per column, `DONE` column = `closedAt >= now − 14 days`.
- One PR for the phase; ADR-A (spec §12) is written in Task 19 and numbered at PR time (0074 unless taken).

---

## File structure

**Server — new (`server/src/tasks/`)**
- `tasks.module.ts` — wires everything below; imports `NotificationsModule`, `HolidaysModule`.
- `task-policy.ts` (+ `.spec.ts`) — pure: assign ladder, watcher rule, view/manage/work access.
- `task-transitions.ts` (+ `.spec.ts`) — pure: status transition table (spec §3.2).
- `task-due.ts` (+ `.spec.ts`) — pure: `defaultDueAt`, `assertManualDueAt`, `shiftSystemDueAt`.
- `task-branch.ts` — resolves a task's `branchId` from its entity or the header pick.
- `task-select.ts` — shared Prisma `select`/`include` shapes and the `TaskDetail` mapper.
- `dto/` — `create-task.dto.ts`, `update-task.dto.ts`, `list-tasks.dto.ts`, `task-status.dto.ts`, `task-review.dto.ts`, `task-cancel.dto.ts`, `task-participants.dto.ts`, `task-step.dto.ts`, `task-event.dto.ts`, `workload-query.dto.ts`.
- `tasks.service.ts` (+ `.spec.ts`) — the single write/read door.
- `tasks-read.service.ts` — list/counts/workload/detail queries (keeps `tasks.service.ts` under 500 lines).
- `tasks.controller.ts` (+ `.spec.ts`).
- `lesson-task.ts` (+ `.spec.ts`) — replaces `unmarked-lessons/lesson-task.ts` (moved here; the old file re-exports).
- `task-events.ts` — event name constants + payload types.
- `task-notify-plan.ts` (+ `.spec.ts`) — pure: who gets which bell text for which event.
- `task-notify.listener.ts` — bell + SSE + push for `task.*` events.
- `task-outbox.service.ts` (+ `.spec.ts`) — schedules REMINDER/OVERDUE rows; per-minute cron drains INAPP rows.
- `task-user-lifecycle.listener.ts` (+ `.spec.ts`) — `user.deactivated` → reassign.
- `task-write.single-source.spec.ts`.
- `server/scripts/migrate-comment-tasks.ts` + `server/scripts/lib/comment-task-map.ts` (+ `.spec.ts`).

**Server — modified**
- `prisma/schema.prisma`, `prisma/migrations/20261007120000_tasks_module/migration.sql`.
- `comments/*` — task mode removed; `comment-events.listener.ts` untouched.
- `unmarked-lessons/lesson-task.ts` → re-export shim; call sites in `unmarked-lessons/unmarked-lesson-transitions.ts`, `unmarked-lessons/make-up-day.ts`, `attendance/unmarked-lessons.service.ts`, `attendance/attendance-save.service.ts` switch `taskCommentId` → `taskId`.
- `notifications/notification-events.listener.ts` — the four `task.*` handlers removed.
- `leads/leads.service.ts` — hover summary drops `isTask`.
- `app.module.ts` — `TasksModule`.

**Client — new (`client/src/`)**
- `hooks/use-tasks.ts` — types + zustand store (board columns, list, drawer id).
- `hooks/use-task-counts.ts` — react-query counts (replaces `use-pending-task-count.ts`).
- `components/tasks/task-labels.ts`, `task-due.ts` (+ `.test.ts`), `task-href.ts`.
- `components/tasks/tasks-page-client.tsx`, `task-board.tsx`, `task-column.tsx` (rewritten), `task-card.tsx` (rewritten), `task-list.tsx`, `task-filters.tsx`, `task-create-dialog.tsx`, `task-assignee-picker.tsx`, `task-drawer.tsx`, `task-drawer-steps.tsx`, `task-drawer-feed.tsx`, `task-all-table.tsx`, `task-workload.tsx`, `entity-tasks-panel.tsx`, `header-task-button.tsx`.

**Client — modified**
- `app/(dashboard)/tasks/page.tsx`, `components/dashboard-header.tsx`, `components/app-sidebar.tsx`, `lib/branch-scoped-header.test.ts`.
- `components/shared/comment-form.tsx`, `comment-item.tsx`, `comment-list.tsx`, `comment-list-helpers.tsx` — task mode removed.
- `components/students/student-profile-tabs.tsx`, `groups/group-detail-tabs.tsx`, `teachers/teacher-profile-tabs.tsx`, `settings/employee-profile-tabs.tsx`, `leads/lead-detail-drawer.tsx` — `EntityTasksPanel` added.
- `components/students/student-profile-card.tsx`, `groups/group-info-card.tsx`, `settings/employee-profile-card.tsx`, `settings/employee-profile-client.tsx`, `shared/mobile-profile-header.tsx`, `leads/lead-card.tsx`, `hooks/use-lead-activity.ts` — `isTask` removed.
- `components/notifications/notification-href.ts` (+ test), `hooks/use-notifications.ts`, `hooks/use-sse.ts`.
- Deleted: `hooks/use-tasks-board.ts`, `hooks/use-pending-task-count.ts`, `components/tasks/tasks-board-client.tsx`, `task-kanban-board.tsx`, `task-entity-href.ts` (+ test; logic moves to `task-href.ts`).

---

### Task 1: Schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma` (enums near line 149; models after `model CommentAssignee` ~line 1885; relation lines on `User` ~343, `Company` ~1658, `Notification` ~1887, `UnmarkedLesson` ~2440, `Comment` ~1842)
- Create: `server/prisma/migrations/20261007120000_tasks_module/migration.sql`

**Interfaces:**
- Produces: Prisma models `Task`, `TaskParticipant`, `TaskStep`, `TaskEvent`, `TaskOutbox`; enums `TaskStatus`, `TaskKind`, `TaskParticipantRole`, `TaskEventType`, `TaskEventVia`, `TaskOutboxChannel`, `TaskOutboxKind`; `NotificationType.TASK_REVIEW`, `NotificationType.TASK_OVERDUE`; columns `UnmarkedLesson.taskId`, `Comment.migratedTaskId`, `Notification.taskId`.

- [ ] **Step 1: Add enums** — after `enum TaskPriority { … }` (~line 154):

```prisma
enum TaskStatus {
  NEW
  IN_PROGRESS
  IN_REVIEW
  DONE
  CANCELLED
}

enum TaskKind {
  MANUAL
  LESSON_QUESTION
  CALLBACK
  BROKEN_PROMISE
  UNCALLED_LEAD
}

enum TaskParticipantRole {
  ASSIGNEE
  WATCHER
}

enum TaskEventType {
  CREATED
  COMMENT
  VOICE
  FILE
  STATUS
  RETURN
  STEP
  ASSIGNEE
  CANCELLED
  AUTO_CLOSED
  REASSIGNED
}

enum TaskEventVia {
  WEB
  TELEGRAM
  SYSTEM
}

enum TaskOutboxChannel {
  INAPP
  TELEGRAM
}

enum TaskOutboxKind {
  REMINDER
  OVERDUE
}
```

In `enum NotificationType` add two values after `TASK_REMINDER`:
```prisma
  TASK_REVIEW
  TASK_OVERDUE
```

- [ ] **Step 2: Add models** — after `model CommentAssignee`:

```prisma
/// Spec 2026-10-07 §3. The only writers are `tasks/tasks.service.ts`,
/// `tasks/lesson-task.ts` and `scripts/migrate-comment-tasks.ts`
/// (`task-write.single-source.spec.ts`).
model Task {
  id                String       @id @default(uuid())
  companyId         Int
  company           Company      @relation(fields: [companyId], references: [id])
  /// The entity's branch, else the author's header pick; null for a branch-less
  /// CEO task or an unassigned lead.
  branchId          Int?
  kind              TaskKind     @default(MANUAL)
  title             String
  description       String?
  status            TaskStatus   @default(NEW)
  priority          TaskPriority @default(MEDIUM)
  dueAt             DateTime?
  /// NULL = Tizim.
  authorId          Int?
  author            User?        @relation("TaskAuthor", fields: [authorId], references: [id], onDelete: Restrict)
  entityType        String?
  entityId          String?
  requiresPhoto     Boolean      @default(false)
  /// «Har biriga alohida» copies share one batch.
  batchId           String?
  /// `unmarked:<groupId>:<YYYY-MM-DD>`, `calllog:<id>`, `promise:<id>`, `lead:<id>`.
  /// Unique while the task is open (partial index in the migration).
  sourceKey         String?
  /// System task: the first assignee to act.
  claimedById       Int?
  returnedCount     Int          @default(0)
  lastReturnedAt    DateTime?
  startedAt         DateTime?
  reviewRequestedAt DateTime?
  closedAt          DateTime?
  cancelledAt       DateTime?
  cancelReason      String?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  participants   TaskParticipant[]
  steps          TaskStep[]
  events         TaskEvent[]
  outbox         TaskOutbox[]
  notifications  Notification[]
  unmarkedLesson UnmarkedLesson?   @relation("UnmarkedLessonTaskRow")

  @@index([companyId, status, dueAt])
  @@index([branchId, status])
  @@index([authorId, status])
  @@index([batchId])
  @@index([entityType, entityId])
  @@index([sourceKey])
}

model TaskParticipant {
  id        String              @id @default(uuid())
  taskId    String
  task      Task                @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    Int
  user      User                @relation("TaskParticipantUser", fields: [userId], references: [id])
  role      TaskParticipantRole @default(ASSIGNEE)
  /// First time this person opened the task sheet.
  seenAt    DateTime?
  createdAt DateTime            @default(now())

  @@unique([taskId, userId])
  @@index([userId, role])
}

model TaskStep {
  id        String    @id @default(uuid())
  taskId    String
  task      Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  title     String
  position  Int
  doneAt    DateTime?
  doneById  Int?
  createdAt DateTime  @default(now())

  @@index([taskId, position])
}

/// Discussion and history in one stream (spec §3.4).
model TaskEvent {
  id        String        @id @default(uuid())
  taskId    String
  task      Task          @relation(fields: [taskId], references: [id], onDelete: Cascade)
  type      TaskEventType
  /// NULL = Tizim.
  actorId   Int?
  actor     User?         @relation("TaskEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  text      String?
  meta      Json?
  via       TaskEventVia  @default(WEB)
  createdAt DateTime      @default(now())

  @@index([taskId, createdAt])
}

/// Time-based notices (spec §9.3). INAPP in this phase; TELEGRAM in phase 2.
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
  createdAt DateTime          @default(now())

  @@unique([taskId, userId, channel, kind])
  @@index([sendAfter, sentAt])
}
```

- [ ] **Step 3: Relation lines and columns.** In `model User` next to line 343 add:
```prisma
  tasksAuthored      Task[]            @relation("TaskAuthor")
  taskParticipations TaskParticipant[] @relation("TaskParticipantUser")
  taskEvents         TaskEvent[]       @relation("TaskEventActor")
```
In `model Company` next to `comments Comment[]`: `  tasks Task[]`.
In `model Notification` after `comment Comment? …`:
```prisma
  taskId            String?
  task              Task?            @relation(fields: [taskId], references: [id], onDelete: SetNull)
```
In `model Comment` after `priority`: `  /// Set by scripts/migrate-comment-tasks.ts; such rows are hidden from comment lists.` then `  migratedTaskId String?`.
In `model UnmarkedLesson` after `taskComment …` line:
```prisma
  /// The «Dars bo'ldimi?» task row (spec 2026-10-07). `taskCommentId` stays until the cleanup PR.
  taskId           String?              @unique
  task             Task?                @relation("UnmarkedLessonTaskRow", fields: [taskId], references: [id], onDelete: SetNull)
```

- [ ] **Step 4: Generate the migration SQL**

```bash
cd server && mkdir -p prisma/migrations/20261007120000_tasks_module && npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script > prisma/migrations/20261007120000_tasks_module/migration.sql && tail -5 prisma/migrations/20261007120000_tasks_module/migration.sql
```
Expected: a file beginning with `CREATE TYPE "TaskStatus"` … and ending with FK constraints.

- [ ] **Step 5: Append the partial unique index** to the end of that `migration.sql`:
```sql
-- One open task per source (spec §7): a re-run of any auto rule cannot duplicate.
CREATE UNIQUE INDEX "task_open_source_unique" ON "Task"("sourceKey")
  WHERE "sourceKey" IS NOT NULL AND "status" IN ('NEW', 'IN_PROGRESS', 'IN_REVIEW');
```

- [ ] **Step 6: Apply and generate**
```bash
cd server && npx prisma migrate deploy && npx prisma generate && npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script | head -3
```
Expected: `migrate deploy` applies `20261007120000_tasks_module`; the final diff prints `-- This is an empty migration.`

- [ ] **Step 7: Typecheck still green**
```bash
cd server && npm run typecheck
```
Expected: exit 0 (new columns are all nullable/defaulted).

- [ ] **Step 8: Commit**
```bash
git add server/prisma/schema.prisma server/prisma/migrations/20261007120000_tasks_module/migration.sql
git commit -m "feat(tasks): schema for the standalone task module

Task, TaskParticipant, TaskStep, TaskEvent, TaskOutbox; UnmarkedLesson.taskId;
Comment.migratedTaskId; Notification.taskId; partial unique index on an open
task's sourceKey. Spec 2026-10-07 §3, §9.2.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: `task-policy.ts` — who may assign, watch, view, manage

**Files:**
- Create: `server/src/tasks/task-policy.ts`
- Test: `server/src/tasks/task-policy.spec.ts`

**Interfaces:**
- Produces:
  - `ROLE_ID = { CEO: 1, BRANCH_DIRECTOR: 2, ADMINISTRATOR: 3, TEACHER: 4, CASHIER: 5 }`
  - `highestRoleId(roleIds: readonly number[]): number | null`
  - `assignableRoleIds(callerRoleIds: readonly number[]): readonly number[]`
  - `type PolicyPerson = { id: number; roleIds: readonly number[]; branchIds: readonly number[] | 'all' }`
  - `canAssignTo(caller: PolicyPerson, target: PolicyPerson): boolean`
  - `canWatch(caller: PolicyPerson, target: PolicyPerson): boolean`
  - `type TaskForAccess = { authorId: number | null; branchId: number | null; participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[] }`
  - `type TaskAccess = { isAuthor; isAssignee; isWatcher; isManager; canView; canManage; canWork }`
  - `resolveAccess(caller: PolicyPerson, task: TaskForAccess): TaskAccess`

- [ ] **Step 1: Write the failing spec** `server/src/tasks/task-policy.spec.ts`:

```ts
import {
  assignableRoleIds,
  canAssignTo,
  canWatch,
  highestRoleId,
  resolveAccess,
  type PolicyPerson,
} from './task-policy';

const person = (
  id: number,
  roleIds: number[],
  branchIds: number[] | 'all' = [1],
): PolicyPerson => ({ id, roleIds, branchIds });

describe('task-policy', () => {
  it('highestRoleId is the smallest id; empty is null', () => {
    expect(highestRoleId([3, 2])).toBe(2);
    expect(highestRoleId([])).toBeNull();
  });

  it('assign ladder per spec §5.1', () => {
    expect(assignableRoleIds([1])).toEqual([1, 2, 3, 4, 5]);
    expect(assignableRoleIds([2])).toEqual([2, 3, 4, 5]);
    expect(assignableRoleIds([3])).toEqual([3, 4, 5]);
    expect(assignableRoleIds([4])).toEqual([]);
    expect(assignableRoleIds([5])).toEqual([]);
    expect(assignableRoleIds([3, 2])).toEqual([2, 3, 4, 5]);
  });

  describe('canAssignTo', () => {
    const ceo = person(1, [1], 'all');
    const bd = person(2, [2], [1]);
    const admin = person(3, [3], [1]);
    const teacher = person(4, [4], [1]);

    it('everyone may assign to themselves', () => {
      expect(canAssignTo(teacher, teacher)).toBe(true);
      expect(canAssignTo(admin, admin)).toBe(true);
    });
    it('CEO assigns to anyone in any branch', () => {
      expect(canAssignTo(ceo, person(9, [2], [7]))).toBe(true);
      expect(canAssignTo(ceo, person(9, [1], []))).toBe(true);
    });
    it('BD assigns 2–5 in own branch only', () => {
      expect(canAssignTo(bd, admin)).toBe(true);
      expect(canAssignTo(bd, person(9, [2], [1]))).toBe(true);
      expect(canAssignTo(bd, person(9, [3], [2]))).toBe(false);
      expect(canAssignTo(bd, ceo)).toBe(false);
    });
    it('admin assigns 3–5 in own branch; the highest role of the target decides', () => {
      expect(canAssignTo(admin, teacher)).toBe(true);
      expect(canAssignTo(admin, person(9, [3, 2], [1]))).toBe(false);
      expect(canAssignTo(admin, bd)).toBe(false);
    });
    it('teacher and cashier assign to nobody else', () => {
      expect(canAssignTo(teacher, admin)).toBe(false);
      expect(canAssignTo(person(5, [5]), teacher)).toBe(false);
    });
    it('a multi-branch admin reaches every branch they hold', () => {
      expect(canAssignTo(person(3, [3], [1, 2]), person(9, [4], [2]))).toBe(true);
    });
  });

  describe('canWatch', () => {
    it('anyone assignable, or self, or someone more senior', () => {
      const admin = person(3, [3], [1]);
      expect(canWatch(admin, person(1, [1], 'all'))).toBe(true);
      expect(canWatch(admin, person(2, [2], [1]))).toBe(true);
      expect(canWatch(admin, person(9, [4], [1]))).toBe(true);
      expect(canWatch(admin, person(9, [4], [2]))).toBe(false);
    });
  });

  describe('resolveAccess', () => {
    const task = {
      authorId: 2,
      branchId: 1,
      participants: [
        { userId: 3, role: 'ASSIGNEE' as const },
        { userId: 4, role: 'WATCHER' as const },
      ],
    };
    it('assignee works but does not manage', () => {
      const a = resolveAccess(person(3, [3]), task);
      expect(a).toMatchObject({ isAssignee: true, canView: true, canWork: true, canManage: false });
    });
    it('watcher only views', () => {
      const a = resolveAccess(person(4, [4]), task);
      expect(a).toMatchObject({ isWatcher: true, canView: true, canWork: false, canManage: false });
    });
    it('author manages', () => {
      expect(resolveAccess(person(2, [2]), task).canManage).toBe(true);
    });
    it('BD of the branch manages; BD of another branch sees nothing', () => {
      expect(resolveAccess(person(7, [2], [1]), task)).toMatchObject({ isManager: true, canManage: true });
      expect(resolveAccess(person(7, [2], [2]), task).canView).toBe(false);
    });
    it('CEO manages everything, including a branch-less task', () => {
      expect(resolveAccess(person(1, [1], 'all'), { ...task, branchId: null }).canManage).toBe(true);
    });
    it('a branch-less task is hidden from a BD', () => {
      expect(resolveAccess(person(7, [2], [1]), { ...task, branchId: null }).canView).toBe(false);
    });
    it('an outsider sees nothing', () => {
      expect(resolveAccess(person(8, [3], [1]), task).canView).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**
```bash
cd server && npx jest src/tasks/task-policy.spec.ts
```
Expected: FAIL — `Cannot find module './task-policy'`.

- [ ] **Step 3: Implement** `server/src/tasks/task-policy.ts`:

```ts
/**
 * Pure permission rules for tasks (spec 2026-10-07 §5). No Prisma here: the
 * service loads people and passes them in, so every rule is unit-testable and,
 * later, the Ruxsatlar tizimi can replace a function body without touching
 * callers.
 */
export const ROLE_ID = {
  CEO: 1,
  BRANCH_DIRECTOR: 2,
  ADMINISTRATOR: 3,
  TEACHER: 4,
  CASHIER: 5,
} as const;

/** The target's HIGHEST role (smallest id) must be inside the caller's list. */
const ASSIGN_LADDER: Record<number, readonly number[]> = {
  [ROLE_ID.CEO]: [1, 2, 3, 4, 5],
  [ROLE_ID.BRANCH_DIRECTOR]: [2, 3, 4, 5],
  [ROLE_ID.ADMINISTRATOR]: [3, 4, 5],
};

export type PolicyPerson = {
  id: number;
  roleIds: readonly number[];
  /** `'all'` = CEO (branch-less by design). */
  branchIds: readonly number[] | 'all';
};

export type TaskForAccess = {
  authorId: number | null;
  branchId: number | null;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
};

export type TaskAccess = {
  isAuthor: boolean;
  isAssignee: boolean;
  isWatcher: boolean;
  isManager: boolean;
  canView: boolean;
  canManage: boolean;
  canWork: boolean;
};

export function highestRoleId(roleIds: readonly number[]): number | null {
  const staff = roleIds.filter((id) => id >= 1 && id <= 5);
  return staff.length ? Math.min(...staff) : null;
}

export function assignableRoleIds(
  callerRoleIds: readonly number[],
): readonly number[] {
  const top = highestRoleId(callerRoleIds);
  return top === null ? [] : (ASSIGN_LADDER[top] ?? []);
}

function sharesBranch(caller: PolicyPerson, target: PolicyPerson): boolean {
  if (caller.branchIds === 'all') return true;
  if (target.branchIds === 'all') return false;
  return target.branchIds.some((b) => caller.branchIds.includes(b));
}

export function canAssignTo(caller: PolicyPerson, target: PolicyPerson): boolean {
  if (caller.id === target.id) return true;
  const targetTop = highestRoleId(target.roleIds);
  if (targetTop === null) return false;
  if (!assignableRoleIds(caller.roleIds).includes(targetTop)) return false;
  return sharesBranch(caller, target);
}

/** A watcher is anyone assignable, oneself, or someone more senior (they only read). */
export function canWatch(caller: PolicyPerson, target: PolicyPerson): boolean {
  if (canAssignTo(caller, target)) return true;
  const callerTop = highestRoleId(caller.roleIds);
  const targetTop = highestRoleId(target.roleIds);
  if (callerTop === null || targetTop === null) return false;
  return targetTop < callerTop && (target.branchIds === 'all' || sharesBranch(caller, target));
}

export function resolveAccess(caller: PolicyPerson, task: TaskForAccess): TaskAccess {
  const isAuthor = task.authorId !== null && task.authorId === caller.id;
  const mine = task.participants.filter((p) => p.userId === caller.id);
  const isAssignee = mine.some((p) => p.role === 'ASSIGNEE');
  const isWatcher = mine.some((p) => p.role === 'WATCHER');
  const top = highestRoleId(caller.roleIds);
  const isManager =
    top === ROLE_ID.CEO ||
    (top === ROLE_ID.BRANCH_DIRECTOR &&
      task.branchId !== null &&
      caller.branchIds !== 'all' &&
      caller.branchIds.includes(task.branchId));
  const canView = isAuthor || isAssignee || isWatcher || isManager;
  const canManage = isAuthor || isManager;
  return { isAuthor, isAssignee, isWatcher, isManager, canView, canManage, canWork: isAssignee || canManage };
}
```

- [ ] **Step 4: Run to verify it passes**
```bash
cd server && npx jest src/tasks/task-policy.spec.ts
```
Expected: PASS (15 tests).

- [ ] **Step 5: Commit**
```bash
git add server/src/tasks/task-policy.ts server/src/tasks/task-policy.spec.ts
git commit -m "feat(tasks): pure assign ladder and access rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: `task-transitions.ts` and `task-due.ts`

**Files:**
- Create: `server/src/tasks/task-transitions.ts`, `server/src/tasks/task-due.ts`
- Test: `server/src/tasks/task-transitions.spec.ts`, `server/src/tasks/task-due.spec.ts`

**Interfaces:**
- Produces:
  - `type TransitionBy = 'ASSIGNEE' | 'MANAGER'`
  - `checkTransition(args: { from: TaskStatus; to: TaskStatus; by: TransitionBy; selfTask: boolean; kind: TaskKind; requiresPhoto: boolean; hasFreshPhoto: boolean }): { ok: true } | { ok: false; message: string }`
  - `OPEN_STATUSES: readonly TaskStatus[]` = `['NEW','IN_PROGRESS','IN_REVIEW']`
  - `defaultDueAt(dateStr: string): Date` — 18:00 Tashkent of that day
  - `assertManualDueAt(dueAt: Date, holidays: ReadonlySet<string>): void` — throws `BadRequestException`
  - `shiftSystemDueAt(dueAt: Date, holidays: ReadonlySet<string>): Date`

- [ ] **Step 1: Failing spec** `server/src/tasks/task-transitions.spec.ts`:

```ts
import { checkTransition, OPEN_STATUSES } from './task-transitions';

const base = {
  selfTask: false,
  kind: 'MANUAL' as const,
  requiresPhoto: false,
  hasFreshPhoto: false,
};

describe('checkTransition (spec §3.2)', () => {
  it('open statuses', () => {
    expect(OPEN_STATUSES).toEqual(['NEW', 'IN_PROGRESS', 'IN_REVIEW']);
  });
  it('assignee: NEW→IN_PROGRESS, NEW/IN_PROGRESS→IN_REVIEW', () => {
    expect(checkTransition({ ...base, from: 'NEW', to: 'IN_PROGRESS', by: 'ASSIGNEE' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: 'NEW', to: 'IN_REVIEW', by: 'ASSIGNEE' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: 'IN_PROGRESS', to: 'IN_REVIEW', by: 'ASSIGNEE' })).toEqual({ ok: true });
  });
  it('assignee cannot close a shared task; a self task closes directly', () => {
    expect(checkTransition({ ...base, from: 'IN_PROGRESS', to: 'DONE', by: 'ASSIGNEE' }).ok).toBe(false);
    expect(checkTransition({ ...base, selfTask: true, from: 'IN_PROGRESS', to: 'DONE', by: 'ASSIGNEE' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, selfTask: true, from: 'NEW', to: 'IN_REVIEW', by: 'ASSIGNEE' }).ok).toBe(false);
  });
  it('manager: IN_REVIEW→DONE (accept), IN_REVIEW→IN_PROGRESS (return), any open→CANCELLED', () => {
    expect(checkTransition({ ...base, from: 'IN_REVIEW', to: 'DONE', by: 'MANAGER' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: 'IN_REVIEW', to: 'IN_PROGRESS', by: 'MANAGER' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: 'NEW', to: 'CANCELLED', by: 'MANAGER' })).toEqual({ ok: true });
    expect(checkTransition({ ...base, from: 'IN_PROGRESS', to: 'DONE', by: 'MANAGER' }).ok).toBe(false);
  });
  it('closed tasks never reopen', () => {
    expect(checkTransition({ ...base, from: 'DONE', to: 'IN_PROGRESS', by: 'MANAGER' }).ok).toBe(false);
    expect(checkTransition({ ...base, from: 'CANCELLED', to: 'NEW', by: 'MANAGER' }).ok).toBe(false);
  });
  it('requiresPhoto blocks review without a fresh photo', () => {
    const r = checkTransition({ ...base, requiresPhoto: true, from: 'IN_PROGRESS', to: 'IN_REVIEW', by: 'ASSIGNEE' });
    expect(r).toEqual({ ok: false, message: 'Tekshiruvga yuborish uchun rasm qo\'shing' });
    expect(checkTransition({ ...base, requiresPhoto: true, hasFreshPhoto: true, from: 'IN_PROGRESS', to: 'IN_REVIEW', by: 'ASSIGNEE' })).toEqual({ ok: true });
  });
  it('system task: only NEW→IN_PROGRESS by the assignee', () => {
    const sys = { ...base, kind: 'LESSON_QUESTION' as const };
    expect(checkTransition({ ...sys, from: 'NEW', to: 'IN_PROGRESS', by: 'ASSIGNEE' })).toEqual({ ok: true });
    expect(checkTransition({ ...sys, from: 'IN_PROGRESS', to: 'IN_REVIEW', by: 'ASSIGNEE' }).ok).toBe(false);
    expect(checkTransition({ ...sys, from: 'NEW', to: 'CANCELLED', by: 'MANAGER' }).ok).toBe(false);
    expect(checkTransition({ ...sys, from: 'NEW', to: 'DONE', by: 'MANAGER' })).toEqual({
      ok: false,
      message: "Bu topshiriqni tizim o'zi yopadi",
    });
  });
  it('same status is refused', () => {
    expect(checkTransition({ ...base, from: 'NEW', to: 'NEW', by: 'ASSIGNEE' }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Failing spec** `server/src/tasks/task-due.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { assertManualDueAt, defaultDueAt, shiftSystemDueAt } from './task-due';

const at = (iso: string) => new Date(iso);

describe('task-due', () => {
  it('defaultDueAt is 18:00 Tashkent (13:00Z)', () => {
    expect(defaultDueAt('2026-10-08').toISOString()).toBe('2026-10-08T13:00:00.000Z');
  });
  it('accepts a weekday 08:00–22:00', () => {
    expect(() => assertManualDueAt(at('2026-10-08T03:00:00Z'), new Set())).not.toThrow(); // 08:00
    expect(() => assertManualDueAt(at('2026-10-08T17:00:00Z'), new Set())).not.toThrow(); // 22:00
  });
  it('refuses outside hours', () => {
    expect(() => assertManualDueAt(at('2026-10-08T02:59:00Z'), new Set())).toThrow(BadRequestException);
    expect(() => assertManualDueAt(at('2026-10-08T17:01:00Z'), new Set())).toThrow(BadRequestException);
  });
  it('refuses Sunday and a holiday', () => {
    expect(() => assertManualDueAt(at('2026-10-11T08:00:00Z'), new Set())).toThrow(/yakshanba/);
    expect(() => assertManualDueAt(at('2026-10-08T08:00:00Z'), new Set(['2026-10-08']))).toThrow(/bayram/);
  });
  it('shiftSystemDueAt moves a Sunday/holiday due to the next working day, same time', () => {
    expect(shiftSystemDueAt(at('2026-10-11T13:00:00Z'), new Set()).toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(shiftSystemDueAt(at('2026-10-10T13:00:00Z'), new Set(['2026-10-10'])).toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(shiftSystemDueAt(at('2026-10-08T13:00:00Z'), new Set()).toISOString()).toBe('2026-10-08T13:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run both to verify they fail**
```bash
cd server && npx jest src/tasks/task-transitions.spec.ts src/tasks/task-due.spec.ts
```
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement** `server/src/tasks/task-transitions.ts`:

```ts
import type { TaskKind, TaskStatus } from '@prisma/client';

export type TransitionBy = 'ASSIGNEE' | 'MANAGER';

export const OPEN_STATUSES: readonly TaskStatus[] = ['NEW', 'IN_PROGRESS', 'IN_REVIEW'];

export const PHOTO_REQUIRED_MESSAGE = "Tekshiruvga yuborish uchun rasm qo'shing";
export const SYSTEM_CLOSES_MESSAGE = "Bu topshiriqni tizim o'zi yopadi";

type Args = {
  from: TaskStatus;
  to: TaskStatus;
  by: TransitionBy;
  /** Author is the only assignee: skips the review step. */
  selfTask: boolean;
  kind: TaskKind;
  requiresPhoto: boolean;
  hasFreshPhoto: boolean;
};

/** Spec 2026-10-07 §3.2, one table. */
export function checkTransition(a: Args): { ok: true } | { ok: false; message: string } {
  const no = (message: string) => ({ ok: false as const, message });
  if (a.from === a.to) return no("Holat allaqachon shunday");
  if (!OPEN_STATUSES.includes(a.from)) return no("Yopilgan topshiriq qayta ochilmaydi");

  if (a.kind !== 'MANUAL') {
    if (a.by === 'ASSIGNEE' && a.from === 'NEW' && a.to === 'IN_PROGRESS') return { ok: true };
    return no(SYSTEM_CLOSES_MESSAGE);
  }

  if (a.by === 'MANAGER') {
    if (a.to === 'CANCELLED') return { ok: true };
    if (a.from === 'IN_REVIEW' && (a.to === 'DONE' || a.to === 'IN_PROGRESS')) return { ok: true };
    return no("Bu o'tish beruvchiga ruxsat etilmagan");
  }

  // ASSIGNEE
  if (a.from === 'NEW' && a.to === 'IN_PROGRESS') return { ok: true };
  if (a.selfTask) {
    if ((a.from === 'NEW' || a.from === 'IN_PROGRESS') && a.to === 'DONE') return { ok: true };
    return no("O'zingizga yozilgan topshiriqda tekshiruv bosqichi yo'q");
  }
  if ((a.from === 'NEW' || a.from === 'IN_PROGRESS') && a.to === 'IN_REVIEW') {
    if (a.requiresPhoto && !a.hasFreshPhoto) return no(PHOTO_REQUIRED_MESSAGE);
    return { ok: true };
  }
  return no("Bu o'tish ijrochiga ruxsat etilmagan");
}
```

- [ ] **Step 5: Implement** `server/src/tasks/task-due.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export const DEFAULT_DUE_HOUR = 18;
const WORK_START = 8;
const WORK_END = 22;

/** 18:00 Tashkent on `dateStr`, as the stored UTC instant. */
export function defaultDueAt(dateStr: string): Date {
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() + DEFAULT_DUE_HOUR * 3_600_000 - TASHKENT_OFFSET_MS,
  );
}

function tashkentParts(d: Date) {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return { dateStr: tashkentDateStr(d), hour: t.getUTCHours(), minute: t.getUTCMinutes() };
}

/** Manual tasks: 08:00–22:00, never Sunday, never a holiday of the task's branch. */
export function assertManualDueAt(dueAt: Date, holidays: ReadonlySet<string>): void {
  const { dateStr, hour, minute } = tashkentParts(dueAt);
  if (dayOfWeekForDateStr(dateStr) === 0) {
    throw new BadRequestException("Muddat yakshanba kuniga qo'yilmaydi");
  }
  if (holidays.has(dateStr)) {
    throw new BadRequestException("Muddat bayram kuniga qo'yilmaydi");
  }
  const tooEarly = hour < WORK_START;
  const tooLate = hour > WORK_END || (hour === WORK_END && minute > 0);
  if (tooEarly || tooLate) {
    throw new BadRequestException('Muddat 08:00 dan 22:00 gacha bo\'lishi kerak (Toshkent vaqti)');
  }
}

/** System tasks: a Sunday/holiday due moves to the next working day, same time of day. */
export function shiftSystemDueAt(dueAt: Date, holidays: ReadonlySet<string>): Date {
  let dateStr = tashkentDateStr(dueAt);
  const timeOfDay = dueAt.getTime() - (utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS);
  while (dayOfWeekForDateStr(dateStr) === 0 || holidays.has(dateStr)) {
    dateStr = addDaysToDateStr(dateStr, 1);
  }
  return new Date(utcMidnightFromDateStr(dateStr).getTime() - TASHKENT_OFFSET_MS + timeOfDay);
}
```

- [ ] **Step 6: Run to verify both pass**
```bash
cd server && npx jest src/tasks/task-transitions.spec.ts src/tasks/task-due.spec.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**
```bash
git add server/src/tasks/task-transitions.ts server/src/tasks/task-transitions.spec.ts server/src/tasks/task-due.ts server/src/tasks/task-due.spec.ts
git commit -m "feat(tasks): status transition table and due-time rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Module skeleton, DTOs, select shapes, branch resolution, events

**Files:**
- Create: `server/src/tasks/tasks.module.ts`, `server/src/tasks/task-events.ts`, `server/src/tasks/task-select.ts`, `server/src/tasks/task-branch.ts`, `server/src/tasks/dto/*.ts`
- Modify: `server/src/app.module.ts` (add `TasksModule` after `CommentsModule`)

**Interfaces:**
- Produces:
  - `TASK_EVENTS` constants (`task.assigned`, `task.unassigned`, `task.status.changed`, `task.review.requested`, `task.reviewed`, `task.commented`, `task.cancelled`, `task.reassigned`, `task.due.changed`) and payload types in `task-events.ts`.
  - `TASK_DETAIL_INCLUDE`, `TASK_CARD_SELECT`, `toTaskCard(row)`, `toTaskDetail(row)` in `task-select.ts`.
  - `resolveTaskBranchId(prisma, args: { entityType?: string; entityId?: string; headerBranchId: number | null; callerScope: CallerBranchScope }): Promise<number | null>` in `task-branch.ts`.
  - DTO classes listed below.

- [ ] **Step 1: Events** `server/src/tasks/task-events.ts`:

```ts
import type { TaskStatus } from '@prisma/client';

export const TASK_EVENTS = {
  ASSIGNED: 'task.assigned',
  UNASSIGNED: 'task.unassigned',
  STATUS_CHANGED: 'task.status.changed',
  REVIEW_REQUESTED: 'task.review.requested',
  REVIEWED: 'task.reviewed',
  COMMENTED: 'task.commented',
  CANCELLED: 'task.cancelled',
  REASSIGNED: 'task.reassigned',
  DUE_CHANGED: 'task.due.changed',
} as const;

/** The slice every listener needs; the service loads it once per write. */
export interface TaskEventTask {
  id: string;
  companyId: number;
  title: string;
  kind: string;
  authorId: number | null;
  dueAt: Date | null;
  status: TaskStatus;
  participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[];
}

export interface TaskAssignedPayload { task: TaskEventTask; actorId: number | null; userIds: number[] }
export interface TaskUnassignedPayload { task: TaskEventTask; actorId: number; userIds: number[] }
export interface TaskStatusChangedPayload { task: TaskEventTask; actorId: number; from: TaskStatus; to: TaskStatus }
export interface TaskReviewRequestedPayload { task: TaskEventTask; actorId: number }
export interface TaskReviewedPayload { task: TaskEventTask; actorId: number; accepted: boolean; reason: string | null }
export interface TaskCommentedPayload { task: TaskEventTask; actorId: number; text: string }
export interface TaskCancelledPayload { task: TaskEventTask; actorId: number; reason: string | null }
export interface TaskReassignedPayload { task: TaskEventTask; fromUserId: number; toUserIds: number[] }
export interface TaskDueChangedPayload { task: TaskEventTask; actorId: number }
```

- [ ] **Step 2: Select shapes** `server/src/tasks/task-select.ts`:

```ts
import type { Prisma } from '@prisma/client';

const PERSON = { id: true, firstName: true, lastName: true, photo: true } as const;

export const TASK_CARD_SELECT = {
  id: true, companyId: true, branchId: true, kind: true, title: true, status: true,
  priority: true, dueAt: true, authorId: true, entityType: true, entityId: true,
  requiresPhoto: true, batchId: true, sourceKey: true, claimedById: true,
  returnedCount: true, startedAt: true, reviewRequestedAt: true, closedAt: true,
  cancelledAt: true, createdAt: true, updatedAt: true,
  author: { select: PERSON },
  participants: { select: { userId: true, role: true, seenAt: true, user: { select: PERSON } }, orderBy: { createdAt: 'asc' as const } },
  _count: { select: { steps: true, events: true } },
  steps: { select: { doneAt: true } },
  unmarkedLesson: {
    select: {
      id: true, groupId: true, date: true, status: true, teacherPayExempt: true,
      lessonStartTime: true, lessonEndTime: true, claimedById: true,
      group: { select: { name: true, branch: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.TaskSelect;

export const TASK_DETAIL_SELECT = {
  ...TASK_CARD_SELECT,
  description: true, lastReturnedAt: true, cancelReason: true,
  steps: { select: { id: true, title: true, position: true, doneAt: true, doneById: true }, orderBy: { position: 'asc' as const } },
} satisfies Prisma.TaskSelect;

export const TASK_EVENT_SELECT = {
  id: true, type: true, actorId: true, text: true, meta: true, via: true, createdAt: true,
  actor: { select: PERSON },
} satisfies Prisma.TaskEventSelect;

type CardRow = Prisma.TaskGetPayload<{ select: typeof TASK_CARD_SELECT }>;
type DetailRow = Prisma.TaskGetPayload<{ select: typeof TASK_DETAIL_SELECT }>;

function person(u: { id: number; firstName: string; lastName: string; photo: string | null } | null) {
  return u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, photo: u.photo } : null;
}

function lesson(l: CardRow['unmarkedLesson']) {
  if (!l) return null;
  return {
    id: l.id, groupId: l.groupId, groupName: l.group.name,
    branchName: l.group.branch?.name ?? null,
    date: l.date.toISOString().slice(0, 10), status: l.status,
    teacherPayExempt: l.teacherPayExempt, lessonStartTime: l.lessonStartTime,
    lessonEndTime: l.lessonEndTime, claimedById: l.claimedById,
  };
}

/** The card the board, the list and the entity panel render. */
export function toTaskCard(r: CardRow) {
  const assignees = r.participants.filter((p) => p.role === 'ASSIGNEE');
  const watchers = r.participants.filter((p) => p.role === 'WATCHER');
  return {
    id: r.id, kind: r.kind, title: r.title, status: r.status, priority: r.priority,
    dueAt: r.dueAt, branchId: r.branchId, entityType: r.entityType, entityId: r.entityId,
    requiresPhoto: r.requiresPhoto, batchId: r.batchId, claimedById: r.claimedById,
    returnedCount: r.returnedCount, closedAt: r.closedAt, createdAt: r.createdAt,
    author: person(r.author),
    assignees: assignees.map((p) => ({ ...person(p.user)!, seenAt: p.seenAt })),
    watchers: watchers.map((p) => ({ ...person(p.user)!, seenAt: p.seenAt })),
    stepsTotal: r._count.steps,
    stepsDone: r.steps.filter((s) => s.doneAt !== null).length,
    eventsCount: r._count.events,
    unmarkedLesson: lesson(r.unmarkedLesson),
  };
}
export type TaskCard = ReturnType<typeof toTaskCard>;

export function toTaskDetail(r: DetailRow) {
  return {
    ...toTaskCard(r),
    description: r.description, lastReturnedAt: r.lastReturnedAt, cancelReason: r.cancelReason,
    steps: r.steps,
  };
}
export type TaskDetail = ReturnType<typeof toTaskDetail>;
```

- [ ] **Step 3: Branch resolution** `server/src/tasks/task-branch.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { CallerBranchScope } from '../common/auth/branch-scope';
import { tryResolveStudentBranchId, tryResolveUserBranchId } from '../common/finance/resolve-branch';

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Spec §3.1: the entity's branch, else the author's header pick, else null.
 * A pick outside the caller's scope is refused rather than silently widened.
 */
export async function resolveTaskBranchId(
  db: Db,
  args: { companyId: number; entityType?: string; entityId?: string; headerBranchId: number | null; callerScope: CallerBranchScope },
): Promise<number | null> {
  const { entityType, entityId } = args;
  if (entityType && entityId) {
    switch (entityType) {
      case 'Student':
        return tryResolveStudentBranchId(db, Number(entityId), args.companyId);
      case 'Group': {
        const g = await db.group.findFirst({ where: { id: entityId }, select: { branchId: true } });
        return g?.branchId ?? null;
      }
      case 'Lead': {
        const l = await db.lead.findFirst({ where: { id: entityId }, select: { branchId: true } });
        return l?.branchId ?? null;
      }
      case 'User':
        return tryResolveUserBranchId(db, Number(entityId));
    }
  }
  if (args.headerBranchId === null) {
    return args.callerScope.kind === 'branches' && args.callerScope.branchIds.length === 1
      ? args.callerScope.branchIds[0]
      : null;
  }
  if (args.callerScope.kind === 'branches' && !args.callerScope.branchIds.includes(args.headerBranchId)) {
    throw new ForbiddenException("Bu filial sizga tegishli emas");
  }
  return args.headerBranchId;
}
```

- [ ] **Step 4: DTOs** — create each file under `server/src/tasks/dto/`:

`create-task.dto.ts`
```ts
import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString,
  MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { COMMENTABLE_ENTITY_TYPES } from '../../common/auth/comment-entity-scope';

export class CreateTaskStepDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
}

export class CreateTaskDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) assigneeIds: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) watcherIds?: number[];
  /** ISO instant; or a `YYYY-MM-DD` day → 18:00 Tashkent. */
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  @IsOptional() @IsIn(COMMENTABLE_ENTITY_TYPES as unknown as string[]) entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsBoolean() separateCopies?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateTaskStepDto) steps?: CreateTaskStepDto[];
}
```
(`@IsDateString` is deliberately not used: a bare day is allowed. `parseDueInput` in Task 5 validates.)

`update-task.dto.ts`
```ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  /** ISO, a `YYYY-MM-DD` day, or `null` to clear. */
  @IsOptional() dueAt?: string | null;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}
```

`list-tasks.dto.ts`
```ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { toNumberArray, toStringArray } from '../../common/dto/to-array';

export class ListTasksDto {
  @IsIn(['my', 'created', 'all']) view: 'my' | 'created' | 'all';
  @IsOptional() @Transform(({ value }) => toStringArray(value)) @IsArray() @IsIn(['NEW', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'], { each: true }) status?: string[];
  @IsOptional() @Transform(({ value }) => toNumberArray(value)) @IsArray() @IsInt({ each: true }) assigneeId?: number[];
  @IsOptional() @Transform(({ value }) => toNumberArray(value)) @IsArray() @IsInt({ each: true }) authorId?: number[];
  @IsOptional() @Transform(({ value }) => toNumberArray(value)) @IsArray() @IsInt({ each: true }) branchId?: number[];
  @IsOptional() @Transform(({ value }) => toStringArray(value)) @IsArray() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], { each: true }) priority?: string[];
  @IsOptional() @IsIn(['overdue', 'today', 'week']) due?: 'overdue' | 'today' | 'week';
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  /** DONE column: only tasks closed in the last N days (default 14). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) closedDays?: number;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
```

`task-status.dto.ts`
```ts
import { IsIn } from 'class-validator';
export class TaskStatusDto {
  @IsIn(['NEW', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']) status: 'NEW' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
}
```

`task-review.dto.ts`
```ts
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
export class TaskReviewDto {
  @IsIn(['ACCEPT', 'RETURN']) action: 'ACCEPT' | 'RETURN';
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(1000) reason?: string;
}
```

`task-cancel.dto.ts`
```ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
export class TaskCancelDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MaxLength(1000) reason?: string;
}
```

`task-participants.dto.ts`
```ts
import { ArrayMinSize, IsArray, IsInt, IsOptional } from 'class-validator';
export class TaskParticipantsDto {
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) assigneeIds: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) watcherIds?: number[];
}
```

`task-step.dto.ts`
```ts
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class CreateStepDto { @IsString() @MinLength(1) @MaxLength(200) title: string; }
export class UpdateStepDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}
```

`task-event.dto.ts`
```ts
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
export class CreateTaskEventDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MinLength(1) @MaxLength(5000) text: string;
}
```

`workload-query.dto.ts`
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches } from 'class-validator';
export class WorkloadQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}$/) month?: string;
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
```

- [ ] **Step 5: Module** `server/src/tasks/tasks.module.ts` (providers are added in later tasks; start with what exists):

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { TaskNotifyListener } from './task-notify.listener';
import { TaskOutboxService } from './task-outbox.service';
import { TaskUserLifecycleListener } from './task-user-lifecycle.listener';

@Module({
  imports: [NotificationsModule, HolidaysModule],
  controllers: [TasksController],
  providers: [TasksService, TasksReadService, TaskNotifyListener, TaskOutboxService, TaskUserLifecycleListener],
  exports: [TasksService],
})
export class TasksModule {}
```
Until Tasks 5–9 exist the module will not compile; that is expected — do not run the build until Task 9. Add `TasksModule` to `app.module.ts` imports right after `CommentsModule` now (import line + array entry).

- [ ] **Step 6: Commit (WIP, no build yet)**
```bash
git add server/src/tasks server/src/app.module.ts
git commit -m "feat(tasks): DTOs, select shapes, branch resolution, event names

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `TasksService.create` + `TasksReadService` (list, detail, counts, workload, assignable)

**Files:**
- Create: `server/src/tasks/tasks.service.ts`, `server/src/tasks/tasks-read.service.ts`, `server/src/tasks/task-cursor.ts`
- Test: `server/src/tasks/tasks.service.spec.ts` (create), `server/src/tasks/task-cursor.spec.ts`

**Interfaces:**
- Produces:
  - `type TaskActor = { userId: number; companyId: number; roleIds: number[]; roleNames: string[]; scope: CallerBranchScope; headerBranchId: number | null }` and `TasksService.loadActor(userId, companyId, headerBranchId): Promise<TaskActor>` (roles/branches from DB).
  - `TasksService.create(dto: CreateTaskDto, actor): Promise<TaskDetail[]>` (one element unless `separateCopies`).
  - `TasksService.loadPeople(ids: number[], companyId): Promise<PolicyPerson[]>` — active staff only.
  - `encodeCursor({ createdAt, id }) / decodeCursor(s)` in `task-cursor.ts`.
  - `TasksReadService.list(dto, actor): Promise<{ data: TaskCard[]; nextCursor: string | null }>`
  - `TasksReadService.detail(id, actor): Promise<{ task: TaskDetail; events: TaskEventRow[]; access: TaskAccess }>`
  - `TasksReadService.counts(actor): Promise<{ my: number; myOverdue: number; created: number; review: number }>`
  - `TasksReadService.workload(dto, actor)`
  - `TasksReadService.assignable(actor, entityType?, entityId?): Promise<{ assignees: AssignableUser[]; watchers: AssignableUser[] }>` where `AssignableUser = { id, firstName, lastName, photo, roleNames: string[], branchNames: string[], telegramLinked: boolean }`.

- [ ] **Step 1: Cursor helper + spec.** `task-cursor.ts`:
```ts
/** Keyset cursor over (createdAt desc, id desc). */
export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}
export function decodeCursor(s: string | undefined): { createdAt: Date; id: string } | null {
  if (!s) return null;
  const [iso, id] = Buffer.from(s, 'base64url').toString('utf8').split('|');
  const createdAt = new Date(iso);
  if (!id || Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}
```
`task-cursor.spec.ts`:
```ts
import { decodeCursor, encodeCursor } from './task-cursor';
describe('task cursor', () => {
  it('round-trips', () => {
    const row = { createdAt: new Date('2026-10-07T05:00:00.000Z'), id: 'abc' };
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });
  it('rejects junk', () => {
    expect(decodeCursor('zzz')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Failing service spec** `server/src/tasks/tasks.service.spec.ts` (create only; later tasks append):

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS } from './task-events';

const ADMIN = { id: 30, companyId: 1, roles: [{ role: { id: 3, name: 'Administrator' } }], branches: [{ branchId: 1 }], mainBranch: 1, deletedAt: null, status: 'ACTIVE', isActive: true, telegramChatId: null, firstName: 'A', lastName: 'B', photo: null };
const TEACHER = { ...ADMIN, id: 40, roles: [{ role: { id: 4, name: 'Teacher' } }] };
const BD_OTHER = { ...ADMIN, id: 20, roles: [{ role: { id: 2, name: 'Branch Director' } }], branches: [{ branchId: 2 }], mainBranch: 2 };

function makeRow(over: Record<string, unknown> = {}) {
  return {
    id: 't1', companyId: 1, branchId: 1, kind: 'MANUAL', title: 'X', status: 'NEW', priority: 'MEDIUM',
    dueAt: null, authorId: 30, entityType: null, entityId: null, requiresPhoto: false, batchId: null,
    sourceKey: null, claimedById: null, returnedCount: 0, startedAt: null, reviewRequestedAt: null,
    closedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), description: null,
    lastReturnedAt: null, cancelReason: null, author: { id: 30, firstName: 'A', lastName: 'B', photo: null },
    participants: [{ userId: 40, role: 'ASSIGNEE', seenAt: null, user: { id: 40, firstName: 'T', lastName: 'U', photo: null } }],
    _count: { steps: 0, events: 1 }, steps: [], unmarkedLesson: null, ...over,
  };
}

describe('TasksService.create', () => {
  let service: TasksService;
  let prisma: any;
  let emitter: { emit: jest.Mock };
  let outbox: { schedule: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([TEACHER]), findFirst: jest.fn().mockResolvedValue(ADMIN) },
      task: { create: jest.fn().mockResolvedValue(makeRow()), findFirst: jest.fn() },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findFirst: jest.fn() }, lead: { findFirst: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    emitter = { emit: jest.fn() };
    outbox = { schedule: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        { provide: HolidaysService, useValue: { buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()) } },
        { provide: TaskOutboxService, useValue: outbox },
      ],
    }).compile();
    service = mod.get(TasksService);
  });

  const actor = () => ({ userId: 30, companyId: 1, roleIds: [3], roleNames: ['Administrator'], scope: { kind: 'branches' as const, branchIds: [1] }, headerBranchId: 1 });

  it('creates one task with participants, CREATED event, and emits task.assigned', async () => {
    const out = await service.create({ title: 'X', assigneeIds: [40] }, actor());
    expect(out).toHaveLength(1);
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: 'X', authorId: 30, branchId: 1, priority: 'MEDIUM', kind: 'MANUAL' });
    expect(data.participants.create).toEqual([{ userId: 40, role: 'ASSIGNEE' }]);
    expect(data.events.create[0]).toMatchObject({ type: 'CREATED', actorId: 30 });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, expect.objectContaining({ userIds: [40] }));
  });

  it('refuses an assignee outside the ladder', async () => {
    prisma.user.findMany.mockResolvedValue([BD_OTHER]);
    await expect(service.create({ title: 'X', assigneeIds: [20] }, actor())).rejects.toThrow(ForbiddenException);
  });

  it('refuses an unknown or inactive assignee', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await expect(service.create({ title: 'X', assigneeIds: [99] }, actor())).rejects.toThrow(BadRequestException);
  });

  it('a bare day becomes 18:00 Tashkent; a Sunday is refused', async () => {
    await service.create({ title: 'X', assigneeIds: [40], dueAt: '2026-10-08' }, actor());
    expect(prisma.task.create.mock.calls[0][0].data.dueAt.toISOString()).toBe('2026-10-08T13:00:00.000Z');
    await expect(service.create({ title: 'X', assigneeIds: [40], dueAt: '2026-10-11' }, actor())).rejects.toThrow(/yakshanba/);
  });

  it('separateCopies creates one task per assignee under one batchId', async () => {
    prisma.user.findMany.mockResolvedValue([TEACHER, { ...TEACHER, id: 41 }]);
    const out = await service.create({ title: 'X', assigneeIds: [40, 41], separateCopies: true }, actor());
    expect(prisma.task.create).toHaveBeenCalledTimes(2);
    const [a, b] = prisma.task.create.mock.calls.map((c: any) => c[0].data);
    expect(a.batchId).toBeDefined();
    expect(a.batchId).toBe(b.batchId);
    expect(a.participants.create).toEqual([{ userId: 40, role: 'ASSIGNEE' }]);
    expect(out).toHaveLength(2);
  });

  it('schedules in-app reminder and overdue rows when there is a due date', async () => {
    await service.create({ title: 'X', assigneeIds: [40], dueAt: '2026-10-08' }, actor());
    expect(outbox.schedule).toHaveBeenCalledWith(prisma, expect.objectContaining({ id: 't1' }));
  });
});
```

- [ ] **Step 3: Run to verify it fails**
```bash
cd server && npx jest src/tasks/tasks.service.spec.ts src/tasks/task-cursor.spec.ts
```
Expected: FAIL (modules missing).

- [ ] **Step 4: Implement** `server/src/tasks/tasks.service.ts` (create + shared loaders; writes continue in Task 6):

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, TaskStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { resolveCallerBranchScope, type CallerBranchScope } from '../common/auth/branch-scope';
import { assertCallerMayTouchCommentEntity } from '../common/auth/comment-entity-scope';
import { whereUserMayAct, SIGN_IN_USER_STATUSES } from '../common/auth/blocked-user';
import { isCalendarDateStr, tashkentDayRangeUtc } from '../common/date/tashkent';
import { isTransactionConflict } from '../common/transaction-conflict';
import { canAssignTo, canWatch, resolveAccess, type PolicyPerson, type TaskAccess } from './task-policy';
import { assertManualDueAt, defaultDueAt } from './task-due';
import { TASK_DETAIL_SELECT, toTaskDetail, type TaskDetail } from './task-select';
import { resolveTaskBranchId } from './task-branch';
import { TaskOutboxService } from './task-outbox.service';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import type { CreateTaskDto } from './dto/create-task.dto';

export interface TaskActor {
  userId: number;
  companyId: number;
  roleIds: number[];
  roleNames: string[];
  scope: CallerBranchScope;
  headerBranchId: number | null;
}

const PERSON_SELECT = {
  id: true, firstName: true, lastName: true, photo: true, telegramChatId: true,
  roles: { select: { role: { select: { id: true, name: true } } } },
  branches: { select: { branchId: true } },
  mainBranch: true,
} as const;

export function toPolicyPerson(u: { id: number; roles: { role: { id: number } }[]; branches: { branchId: number }[]; mainBranch: number | null }): PolicyPerson {
  const roleIds = u.roles.map((r) => r.role.id);
  const branchIds = [...new Set([...u.branches.map((b) => b.branchId), ...(u.mainBranch ? [u.mainBranch] : [])])];
  return { id: u.id, roleIds, branchIds: roleIds.includes(1) ? 'all' : branchIds };
}

export function parseDueInput(raw: string | null | undefined): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (isCalendarDateStr(raw)) return defaultDueAt(raw);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new BadRequestException("Muddat noto'g'ri");
  return d;
}

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private emitter: EventEmitter2,
    private holidays: HolidaysService,
    private outbox: TaskOutboxService,
  ) {}

  /** Roles and branches from the DATABASE (ADR-0028), never from the token. */
  async loadActor(userId: number, companyId: number, headerBranchId: number | null): Promise<TaskActor> {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, companyId, ...whereUserMayAct() },
      select: { id: true, roles: { select: { role: { select: { id: true, name: true } } } } },
    });
    if (!u) throw new ForbiddenException('Foydalanuvchi aniqlanmadi');
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    return {
      userId, companyId,
      roleIds: u.roles.map((r) => r.role.id),
      roleNames: u.roles.map((r) => r.role.name),
      scope, headerBranchId,
    };
  }

  actorPerson(actor: TaskActor): PolicyPerson {
    return { id: actor.userId, roleIds: actor.roleIds, branchIds: actor.scope.kind === 'all' ? 'all' : actor.scope.branchIds };
  }

  /** Live staff of this company; missing ids are a 400. */
  async loadPeople(ids: number[], companyId: number) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.user.findMany({
      where: { id: { in: unique }, companyId, deletedAt: null, status: { in: [...SIGN_IN_USER_STATUSES] }, roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } } },
      select: PERSON_SELECT,
    });
    if (rows.length !== unique.length) {
      throw new BadRequestException("Ijrochilardan biri topilmadi yoki faol emas");
    }
    return rows;
  }

  private async holidaySet(branchId: number | null, around: Date) {
    const from = new Date(around.getTime() - 2 * 864e5);
    const to = new Date(around.getTime() + 2 * 864e5);
    return this.holidays.buildHolidayDateSet(from, to, branchId ?? undefined);
  }

  async create(dto: CreateTaskDto, actor: TaskActor): Promise<TaskDetail[]> {
    if (dto.entityType && dto.entityId) {
      await assertCallerMayTouchCommentEntity(this.prisma, actor.userId, actor.roleNames, dto.entityType, dto.entityId, actor.companyId);
    }
    const branchId = await resolveTaskBranchId(this.prisma, {
      companyId: actor.companyId, entityType: dto.entityType, entityId: dto.entityId,
      headerBranchId: actor.headerBranchId, callerScope: actor.scope,
    });
    const caller = this.actorPerson(actor);
    const assignees = await this.loadPeople(dto.assigneeIds, actor.companyId);
    const watchers = await this.loadPeople(dto.watcherIds ?? [], actor.companyId);
    for (const u of assignees) {
      if (!canAssignTo(caller, toPolicyPerson(u))) {
        throw new ForbiddenException(`${u.firstName} ${u.lastName} ga topshiriq bera olmaysiz`);
      }
    }
    for (const u of watchers) {
      if (!canWatch(caller, toPolicyPerson(u))) {
        throw new ForbiddenException(`${u.firstName} ${u.lastName} ni kuzatuvchi qila olmaysiz`);
      }
    }
    const dueAt = parseDueInput(dto.dueAt);
    if (dueAt) assertManualDueAt(dueAt, await this.holidaySet(branchId, dueAt));

    const assigneeIdSet = new Set(assignees.map((a) => a.id));
    const watcherIds = watchers.map((w) => w.id).filter((id) => !assigneeIdSet.has(id));
    const groups = dto.separateCopies && assignees.length > 1
      ? assignees.map((a) => [a.id])
      : [assignees.map((a) => a.id)];
    const batchId = groups.length > 1 ? randomUUID() : null;
    const steps = (dto.steps ?? []).map((s, i) => ({ title: s.title.trim(), position: i }));

    const created: TaskDetail[] = [];
    for (const ids of groups) {
      const row = await this.prisma.task.create({
        data: {
          companyId: actor.companyId, branchId, kind: 'MANUAL',
          title: dto.title.trim(), description: dto.description?.trim() || null,
          priority: dto.priority ?? 'MEDIUM', dueAt, authorId: actor.userId,
          entityType: dto.entityType ?? null, entityId: dto.entityId ?? null, batchId,
          participants: { create: [...ids.map((userId) => ({ userId, role: 'ASSIGNEE' as const })), ...watcherIds.map((userId) => ({ userId, role: 'WATCHER' as const }))] },
          steps: { create: steps },
          events: { create: [{ type: 'CREATED', actorId: actor.userId, via: 'WEB' }] },
        },
        select: TASK_DETAIL_SELECT,
      });
      const detail = toTaskDetail(row);
      created.push(detail);
      if (dueAt) await this.outbox.schedule(this.prisma, row);
      this.emitter.emit(TASK_EVENTS.ASSIGNED, { task: this.eventTask(row), actorId: actor.userId, userIds: ids });
      if (watcherIds.length) {
        this.emitter.emit(TASK_EVENTS.ASSIGNED, { task: this.eventTask(row), actorId: actor.userId, userIds: watcherIds });
      }
    }
    return created;
  }

  eventTask(r: { id: string; companyId: number; title: string; kind: string; authorId: number | null; dueAt: Date | null; status: TaskStatus; participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[] }): TaskEventTask {
    return {
      id: r.id, companyId: r.companyId, title: r.title, kind: r.kind, authorId: r.authorId, dueAt: r.dueAt, status: r.status,
      participants: r.participants.map((p) => ({ userId: p.userId, role: p.role })),
    };
  }

  /** Loads a task the caller may see, with its access; 404 for an invisible one. */
  async loadForAccess(tx: Prisma.TransactionClient | PrismaService, id: string, actor: TaskActor) {
    const row = await tx.task.findFirst({ where: { id, companyId: actor.companyId }, select: TASK_DETAIL_SELECT });
    if (!row) throw new NotFoundException('Topshiriq topilmadi');
    const access: TaskAccess = resolveAccess(this.actorPerson(actor), {
      authorId: row.authorId, branchId: row.branchId,
      participants: row.participants.map((p) => ({ userId: p.userId, role: p.role })),
    });
    if (!access.canView) throw new NotFoundException('Topshiriq topilmadi');
    return { row, access };
  }

  async runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 15_000 });
    } catch (err) {
      if (isTransactionConflict(err)) throw new ConflictException("Topshiriq hozirgina o'zgardi. Sahifani yangilang");
      throw err;
    }
  }
}
```

- [ ] **Step 5: Implement** `server/src/tasks/tasks-read.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SIGN_IN_USER_STATUSES } from '../common/auth/blocked-user';
import { addDaysToDateStr, tashkentDateStr, tashkentDayRangeUtc, tashkentMonthKey, tashkentMonthRangeUtc, tashkentRangeUtc } from '../common/date/tashkent';
import { TASK_CARD_SELECT, TASK_EVENT_SELECT, toTaskCard, toTaskDetail } from './task-select';
import { OPEN_STATUSES } from './task-transitions';
import { decodeCursor, encodeCursor } from './task-cursor';
import { assignableRoleIds, canAssignTo, canWatch, highestRoleId } from './task-policy';
import { TasksService, toPolicyPerson, type TaskActor } from './tasks.service';
import type { ListTasksDto } from './dto/list-tasks.dto';
import type { WorkloadQueryDto } from './dto/workload-query.dto';

const OPEN = [...OPEN_STATUSES];

@Injectable()
export class TasksReadService {
  constructor(private prisma: PrismaService, private tasks: TasksService) {}

  /** Who may see which tasks (spec §5.2) as a Prisma where fragment. */
  private visibilityWhere(actor: TaskActor): Prisma.TaskWhereInput {
    const mine: Prisma.TaskWhereInput = {
      OR: [{ authorId: actor.userId }, { participants: { some: { userId: actor.userId } } }],
    };
    if (actor.scope.kind === 'all') return {};
    if (highestRoleId(actor.roleIds) === 2 && actor.scope.branchIds.length) {
      return { OR: [mine, { branchId: { in: actor.scope.branchIds } }] };
    }
    return mine;
  }

  private dueWhere(due: ListTasksDto['due']): Prisma.TaskWhereInput {
    const now = new Date();
    const today = tashkentDateStr(now);
    if (due === 'overdue') return { dueAt: { lt: now }, status: { in: OPEN } };
    if (due === 'today') return { dueAt: tashkentDayRangeUtc(today) };
    if (due === 'week') return { dueAt: tashkentRangeUtc(today, addDaysToDateStr(today, 6)) };
    return {};
  }

  async list(dto: ListTasksDto, actor: TaskActor) {
    const limit = dto.limit ?? 50;
    const where: Prisma.TaskWhereInput = { companyId: actor.companyId, AND: [] as Prisma.TaskWhereInput[] };
    const and = where.AND as Prisma.TaskWhereInput[];
    if (dto.view === 'my') and.push({ participants: { some: { userId: actor.userId, role: 'ASSIGNEE' } } });
    else if (dto.view === 'created') and.push({ authorId: actor.userId });
    else {
      if (actor.scope.kind !== 'all' && highestRoleId(actor.roleIds) !== 2) throw new ForbiddenException("«Barchasi» faqat rahbarlarga ochiq");
      and.push(this.visibilityWhere(actor));
    }
    if (dto.status?.length) and.push({ status: { in: dto.status as TaskStatus[] } });
    if (dto.status?.length === 1 && dto.status[0] === 'DONE') {
      and.push({ closedAt: { gte: new Date(Date.now() - (dto.closedDays ?? 14) * 864e5) } });
    }
    if (dto.assigneeId?.length) and.push({ participants: { some: { role: 'ASSIGNEE', userId: { in: dto.assigneeId } } } });
    if (dto.authorId?.length) and.push({ authorId: { in: dto.authorId } });
    if (dto.branchId?.length) and.push({ branchId: { in: dto.branchId } });
    if (dto.priority?.length) and.push({ priority: { in: dto.priority as any } });
    if (dto.due) and.push(this.dueWhere(dto.due));
    if (dto.q?.trim()) and.push({ title: { contains: dto.q.trim(), mode: 'insensitive' } });
    if (dto.entityType && dto.entityId) and.push({ entityType: dto.entityType, entityId: dto.entityId });
    const cursor = decodeCursor(dto.cursor);
    if (cursor) and.push({ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] });

    const rows = await this.prisma.task.findMany({
      where, select: TASK_CARD_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const page = rows.slice(0, limit);
    // Separate copies collapse into one card for their author (spec §4.3).
    const data = dto.view === 'created' ? collapseBatches(page.map(toTaskCard)) : page.map(toTaskCard);
    return { data, nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
  }

  async detail(id: string, actor: TaskActor, before?: string) {
    const { row, access } = await this.tasks.loadForAccess(this.prisma, id, actor);
    const events = await this.prisma.taskEvent.findMany({
      where: { taskId: id, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      select: TASK_EVENT_SELECT, orderBy: { createdAt: 'desc' }, take: 50,
    });
    let batch: ReturnType<typeof toTaskCard>[] = [];
    if (row.batchId && (access.isAuthor || access.isManager)) {
      const rows = await this.prisma.task.findMany({ where: { batchId: row.batchId }, select: TASK_CARD_SELECT, orderBy: { createdAt: 'asc' } });
      batch = rows.map(toTaskCard);
    }
    return { task: toTaskDetail(row), events: events.reverse(), access, batch };
  }

  async counts(actor: TaskActor) {
    const now = new Date();
    const myWhere: Prisma.TaskWhereInput = { companyId: actor.companyId, status: { in: OPEN }, participants: { some: { userId: actor.userId, role: 'ASSIGNEE' } } };
    const [my, myOverdue, created, review] = await Promise.all([
      this.prisma.task.count({ where: myWhere }),
      this.prisma.task.count({ where: { ...myWhere, dueAt: { lt: now } } }),
      this.prisma.task.count({ where: { companyId: actor.companyId, authorId: actor.userId, status: { in: OPEN } } }),
      this.prisma.task.count({ where: { companyId: actor.companyId, authorId: actor.userId, status: 'IN_REVIEW' } }),
    ]);
    return { my, myOverdue, created, review };
  }

  /** Spec §4.5: per assignee — open, overdue, done this month, on-time share. */
  async workload(dto: WorkloadQueryDto, actor: TaskActor) {
    const top = highestRoleId(actor.roleIds);
    if (actor.scope.kind !== 'all' && top !== 2) throw new ForbiddenException('«Yuklama» faqat rahbarlarga ochiq');
    const month = dto.month ?? tashkentMonthKey(new Date());
    const range = tashkentMonthRangeUtc(month);
    const branchIds = actor.scope.kind === 'all' ? (dto.branchId ? [dto.branchId] : null) : actor.scope.branchIds.filter((b) => !dto.branchId || b === dto.branchId);
    const scope: Prisma.TaskWhereInput = branchIds ? { branchId: { in: branchIds } } : {};
    const rows = await this.prisma.taskParticipant.findMany({
      where: { role: 'ASSIGNEE', task: { companyId: actor.companyId, ...scope, OR: [{ status: { in: OPEN } }, { status: 'DONE', closedAt: { gte: range.gte, lt: range.lt } }] } },
      select: { userId: true, task: { select: { status: true, dueAt: true, closedAt: true } }, user: { select: { id: true, firstName: true, lastName: true, photo: true, roles: { select: { role: { select: { name: true } } } }, branches: { select: { branch: { select: { name: true } } } } } } },
    });
    const now = new Date();
    const byUser = new Map<number, { user: (typeof rows)[number]['user']; open: number; overdue: number; done: number; onTime: number; withDue: number }>();
    for (const r of rows) {
      const e = byUser.get(r.userId) ?? { user: r.user, open: 0, overdue: 0, done: 0, onTime: 0, withDue: 0 };
      if (r.task.status === 'DONE') {
        e.done++;
        if (r.task.dueAt && r.task.closedAt) { e.withDue++; if (r.task.closedAt <= r.task.dueAt) e.onTime++; }
      } else {
        e.open++;
        if (r.task.dueAt && r.task.dueAt < now) e.overdue++;
      }
      byUser.set(r.userId, e);
    }
    const data = [...byUser.values()].map((e) => ({
      user: { id: e.user.id, firstName: e.user.firstName, lastName: e.user.lastName, photo: e.user.photo, roleNames: e.user.roles.map((x) => x.role.name), branchNames: e.user.branches.map((b) => b.branch.name) },
      open: e.open, overdue: e.overdue, doneThisMonth: e.done,
      onTimePercent: e.withDue ? Math.round((100 * e.onTime) / e.withDue) : null,
    })).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const totals = { open: data.reduce((s, d) => s + d.open, 0), overdue: data.reduce((s, d) => s + d.overdue, 0), doneThisMonth: data.reduce((s, d) => s + d.doneThisMonth, 0) };
    return { month, data, totals };
  }

  /** Whom the caller may pick (spec §4.6): ladder + branch, grouped by role on the client. */
  async assignable(actor: TaskActor) {
    const caller = this.tasks.actorPerson(actor);
    const ladder = assignableRoleIds(actor.roleIds);
    const where: Prisma.UserWhereInput = {
      companyId: actor.companyId, deletedAt: null, status: { in: [...SIGN_IN_USER_STATUSES] },
      roles: { some: { role: { id: { in: [1, 2, 3, 4, 5] } } } },
      ...(actor.scope.kind === 'all' ? {} : { OR: [{ branches: { some: { branchId: { in: actor.scope.branchIds } } } }, { mainBranch: { in: actor.scope.branchIds } }, { id: actor.userId }] }),
    };
    const users = await this.prisma.user.findMany({
      where, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, photo: true, telegramChatId: true, mainBranch: true, roles: { select: { role: { select: { id: true, name: true } } } }, branches: { select: { branchId: true, branch: { select: { name: true } } } } },
    });
    const shape = (u: (typeof users)[number]) => ({
      id: u.id, firstName: u.firstName, lastName: u.lastName, photo: u.photo,
      roleNames: u.roles.map((r) => r.role.name), branchNames: u.branches.map((b) => b.branch.name),
      telegramLinked: u.telegramChatId !== null,
    });
    const assignees = users.filter((u) => canAssignTo(caller, toPolicyPerson(u))).map(shape);
    const watchers = users.filter((u) => canWatch(caller, toPolicyPerson(u))).map(shape);
    return { assignees, watchers, ladder };
  }
}

/** «Men bergan»: one card per batch, carrying every copy's status. */
export function collapseBatches<T extends { batchId: string | null; status: TaskStatus; assignees: unknown[] }>(cards: T[]): (T & { batch?: { total: number; done: number; statuses: TaskStatus[] } })[] {
  const seen = new Map<string, T & { batch?: { total: number; done: number; statuses: TaskStatus[] } }>();
  const out: (T & { batch?: { total: number; done: number; statuses: TaskStatus[] } })[] = [];
  for (const c of cards) {
    if (!c.batchId) { out.push(c); continue; }
    const head = seen.get(c.batchId);
    if (!head) {
      const h = { ...c, batch: { total: 1, done: c.status === 'DONE' ? 1 : 0, statuses: [c.status] } };
      seen.set(c.batchId, h); out.push(h);
    } else {
      head.batch!.total++; head.batch!.statuses.push(c.status);
      if (c.status === 'DONE') head.batch!.done++;
      (head.assignees as unknown[]).push(...(c.assignees as unknown[]));
    }
  }
  return out;
}
```

- [ ] **Step 6: Run** `cd server && npx jest src/tasks/tasks.service.spec.ts src/tasks/task-cursor.spec.ts`. Expected: PASS (the spec mocks `TaskOutboxService` as a token; its real file arrives in Task 7 — create an empty placeholder now so imports resolve: `server/src/tasks/task-outbox.service.ts` containing `import { Injectable } from '@nestjs/common'; @Injectable() export class TaskOutboxService { async schedule(_db: unknown, _task: { id: string }): Promise<void> {} }`).

- [ ] **Step 7: Commit**
```bash
git add server/src/tasks
git commit -m "feat(tasks): TasksService.create and read service (list, detail, counts, workload, assignable)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `TasksService` writes — status, review, cancel, duplicate, participants, seen, steps, comments, update

**Files:**
- Modify: `server/src/tasks/tasks.service.ts` (append methods)
- Test: `server/src/tasks/tasks.service.spec.ts` (append a `describe` block)

**Interfaces:**
- Produces (all take `(id: string, …, actor: TaskActor)` and return `TaskDetail` unless noted):
  - `changeStatus(id, to: 'NEW'|'IN_PROGRESS'|'IN_REVIEW'|'DONE', actor)`
  - `review(id, action: 'ACCEPT'|'RETURN', reason: string | undefined, actor)`
  - `cancel(id, reason: string | undefined, actor)`
  - `duplicate(id, actor)`
  - `setParticipants(id, assigneeIds: number[], watcherIds: number[], actor)`
  - `markSeen(id, actor): Promise<void>`
  - `addStep(id, title, actor)`, `updateStep(id, stepId, patch: { title?: string; done?: boolean }, actor)`, `deleteStep(id, stepId, actor)`
  - `addComment(id, text, actor): Promise<TaskEventRow>`
  - `update(id, dto: UpdateTaskDto, actor)`
  - `claimSystemTask(tx, taskId, userId): Promise<boolean>` — exported helper used by both `changeStatus` and `lesson-task.ts`.

- [ ] **Step 1: Append failing tests** to `tasks.service.spec.ts` (same `beforeEach` wiring; extend `prisma` with `task.update`, `taskParticipant.{findMany,deleteMany,createMany,update,updateMany}`, `taskStep.{create,update,delete,aggregate}`, `taskEvent.{create,findFirst}`, `unmarkedLesson.updateMany`, `taskOutbox.deleteMany`):

```ts
describe('TasksService writes', () => {
  // reuse the module from the create block; declare `service`, `prisma`, `emitter`, `outbox` in the outer scope
  const assigneeActor = () => ({ userId: 40, companyId: 1, roleIds: [4], roleNames: ['Teacher'], scope: { kind: 'branches' as const, branchIds: [1] }, headerBranchId: 1 });
  const authorActor = () => ({ userId: 30, companyId: 1, roleIds: [3], roleNames: ['Administrator'], scope: { kind: 'branches' as const, branchIds: [1] }, headerBranchId: 1 });

  beforeEach(() => {
    prisma.task.findFirst.mockResolvedValue(makeRow());
    prisma.task.update = jest.fn().mockImplementation(({ data }: any) => Promise.resolve(makeRow({ ...data })));
    prisma.taskParticipant = { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn(), update: jest.fn() };
    prisma.taskStep = { create: jest.fn().mockResolvedValue({}), update: jest.fn().mockResolvedValue({}), delete: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: 's1', taskId: 't1', doneAt: null }), aggregate: jest.fn().mockResolvedValue({ _max: { position: 1 } }) };
    prisma.taskEvent = { create: jest.fn().mockResolvedValue({ id: 'e1', type: 'COMMENT', actorId: 40, text: 'hi', meta: null, via: 'WEB', createdAt: new Date(), actor: null }), findFirst: jest.fn().mockResolvedValue(null) };
    prisma.unmarkedLesson = { updateMany: jest.fn() };
    prisma.taskOutbox = { deleteMany: jest.fn() };
  });

  it('assignee moves NEW→IN_PROGRESS, writes a STATUS event, stamps startedAt, emits', async () => {
    await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_PROGRESS', startedAt: expect.any(Date) });
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({ type: 'STATUS', actorId: 40, meta: { from: 'NEW', to: 'IN_PROGRESS' } });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.STATUS_CHANGED, expect.objectContaining({ from: 'NEW', to: 'IN_PROGRESS' }));
  });

  it('assignee→IN_REVIEW emits review.requested and stamps reviewRequestedAt', async () => {
    await service.changeStatus('t1', 'IN_REVIEW', assigneeActor());
    expect(prisma.task.update.mock.calls[0][0].data.reviewRequestedAt).toEqual(expect.any(Date));
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.REVIEW_REQUESTED, expect.anything());
  });

  it('an outsider gets 404; an assignee cannot DONE a shared task (400)', async () => {
    await expect(service.changeStatus('t1', 'IN_PROGRESS', { ...assigneeActor(), userId: 99 })).rejects.toThrow('Topshiriq topilmadi');
    await expect(service.changeStatus('t1', 'DONE', assigneeActor())).rejects.toThrow(BadRequestException);
  });

  it('author accepts from IN_REVIEW → DONE with closedAt; returns with a reason → IN_PROGRESS, returnedCount+1', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
    await service.review('t1', 'ACCEPT', undefined, authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'DONE', closedAt: expect.any(Date) });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.REVIEWED, expect.objectContaining({ accepted: true }));

    prisma.task.update.mockClear();
    await expect(service.review('t1', 'RETURN', '   ', authorActor())).rejects.toThrow('Qaytarish sababini yozing');
    await service.review('t1', 'RETURN', 'Doska artilmagan', authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'IN_PROGRESS', returnedCount: { increment: 1 } });
    expect(prisma.taskEvent.create.mock.calls.at(-1)[0].data).toMatchObject({ type: 'RETURN', text: 'Doska artilmagan' });
  });

  it('assignee cannot review (403)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ status: 'IN_REVIEW' }));
    await expect(service.review('t1', 'ACCEPT', undefined, assigneeActor())).rejects.toThrow(ForbiddenException);
  });

  it('cancel by author: CANCELLED, outbox rows dropped, event emitted', async () => {
    await service.cancel('t1', 'kerak emas', authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'CANCELLED', cancelReason: 'kerak emas' });
    expect(prisma.taskOutbox.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1', sentAt: null } });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.CANCELLED, expect.anything());
  });

  it('a system task refuses manual close and update', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ kind: 'LESSON_QUESTION', authorId: null, status: 'NEW' }));
    await expect(service.cancel('t1', undefined, { ...authorActor(), roleIds: [1], scope: { kind: 'all' } })).rejects.toThrow("tizim o'zi yopadi");
    await expect(service.update('t1', { title: 'x' }, { ...authorActor(), roleIds: [1], scope: { kind: 'all' } })).rejects.toThrow(BadRequestException);
  });

  it('system task: first assignee to act claims it (others removed, claimedById set)', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ kind: 'LESSON_QUESTION', authorId: null, participants: [
      { userId: 40, role: 'ASSIGNEE', seenAt: null, user: { id: 40, firstName: 'T', lastName: 'U', photo: null } },
      { userId: 41, role: 'ASSIGNEE', seenAt: null, user: { id: 41, firstName: 'V', lastName: 'W', photo: null } },
    ] }));
    await service.changeStatus('t1', 'IN_PROGRESS', assigneeActor());
    expect(prisma.unmarkedLesson.updateMany).toHaveBeenCalledWith({ where: { taskId: 't1' }, data: { claimedById: 40 } });
    expect(prisma.taskParticipant.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 40 } } });
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ claimedById: 40 });
  });

  it('setParticipants emits assigned for added and unassigned for removed', async () => {
    prisma.user.findMany.mockResolvedValue([TEACHER, { ...TEACHER, id: 41 }]);
    await service.setParticipants('t1', [41], [], authorActor());
    expect(prisma.taskParticipant.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1', userId: { in: [40] } } });
    expect(prisma.taskParticipant.createMany).toHaveBeenCalledWith({ data: [{ taskId: 't1', userId: 41, role: 'ASSIGNEE' }], skipDuplicates: true });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, expect.objectContaining({ userIds: [41] }));
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.UNASSIGNED, expect.objectContaining({ userIds: [40] }));
  });

  it('markSeen stamps seenAt once', async () => {
    await service.markSeen('t1', assigneeActor());
    expect(prisma.taskParticipant.updateMany).toHaveBeenCalledWith({ where: { taskId: 't1', userId: 40, seenAt: null }, data: { seenAt: expect.any(Date) } });
  });

  it('steps: assignee adds and ticks; only a manager deletes', async () => {
    await service.addStep('t1', 'Doskani artish', assigneeActor());
    expect(prisma.taskStep.create.mock.calls[0][0].data).toMatchObject({ taskId: 't1', title: 'Doskani artish', position: 2 });
    await service.updateStep('t1', 's1', { done: true }, assigneeActor());
    expect(prisma.taskStep.update.mock.calls[0][0].data).toMatchObject({ doneAt: expect.any(Date), doneById: 40 });
    await expect(service.updateStep('t1', 's1', { title: 'x' }, assigneeActor())).rejects.toThrow(ForbiddenException);
    await expect(service.deleteStep('t1', 's1', assigneeActor())).rejects.toThrow(ForbiddenException);
    await service.deleteStep('t1', 's1', authorActor());
    expect(prisma.taskStep.delete).toHaveBeenCalled();
  });

  it('addComment writes COMMENT and emits commented', async () => {
    await service.addComment('t1', 'hi', assigneeActor());
    expect(prisma.taskEvent.create.mock.calls[0][0].data).toMatchObject({ type: 'COMMENT', text: 'hi', actorId: 40 });
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.COMMENTED, expect.objectContaining({ text: 'hi' }));
  });

  it('update by author changes title/due; due change reschedules outbox and emits due.changed', async () => {
    await service.update('t1', { title: 'Y', dueAt: '2026-10-08' }, authorActor());
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ title: 'Y', dueAt: new Date('2026-10-08T13:00:00.000Z') });
    expect(outbox.schedule).toHaveBeenCalled();
    expect(emitter.emit).toHaveBeenCalledWith(TASK_EVENTS.DUE_CHANGED, expect.anything());
  });

  it('duplicate copies title, priority, participants, steps as NEW by the actor', async () => {
    prisma.task.findFirst.mockResolvedValue(makeRow({ steps: [{ id: 's1', title: 'A', position: 0, doneAt: new Date(), doneById: 40 }] }));
    await service.duplicate('t1', authorActor());
    const data = prisma.task.create.mock.calls.at(-1)[0].data;
    expect(data).toMatchObject({ title: 'X', authorId: 30, status: 'NEW', dueAt: null });
    expect(data.steps.create).toEqual([{ title: 'A', position: 0 }]);
    expect(data.participants.create).toEqual([{ userId: 40, role: 'ASSIGNEE' }]);
  });
});
```
Add `outbox.schedule` to the outer `outbox` mock (already there) and `prisma.task.create` stays mocked from the create block.

- [ ] **Step 2: Run** → FAIL (methods missing).

- [ ] **Step 3: Implement** — append to `tasks.service.ts` inside the class (and export `claimSystemTask` at module level):

```ts
  // ---------- status ----------

  async changeStatus(id: string, to: TaskStatus, actor: TaskActor): Promise<TaskDetail> {
    const result = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canWork) throw new ForbiddenException("Bu topshiriqda siz ijrochi emassiz");
      const by = access.isAssignee ? 'ASSIGNEE' : 'MANAGER';
      const assignees = row.participants.filter((p) => p.role === 'ASSIGNEE');
      const selfTask = assignees.length === 1 && assignees[0].userId === row.authorId && row.authorId === actor.userId;
      const verdict = checkTransition({ from: row.status, to, by, selfTask, kind: row.kind, requiresPhoto: row.requiresPhoto, hasFreshPhoto: false });
      if (!verdict.ok) throw new BadRequestException(verdict.message);

      let claimedById: number | undefined;
      if (row.kind !== 'MANUAL' && access.isAssignee && row.claimedById === null) {
        await claimSystemTask(tx, id, actor.userId);
        claimedById = actor.userId;
      }
      const now = new Date();
      const data: Prisma.TaskUncheckedUpdateInput = { status: to, ...(claimedById ? { claimedById } : {}) };
      if (to === 'IN_PROGRESS' && !row.startedAt) data.startedAt = now;
      if (to === 'IN_REVIEW') data.reviewRequestedAt = now;
      if (to === 'DONE') data.closedAt = now;
      const updated = await tx.task.update({ where: { id }, data, select: TASK_DETAIL_SELECT });
      await tx.taskEvent.create({ data: { taskId: id, type: 'STATUS', actorId: actor.userId, meta: { from: row.status, to }, via: 'WEB' } });
      await tx.taskParticipant.updateMany({ where: { taskId: id, userId: actor.userId, seenAt: null }, data: { seenAt: now } });
      if (to === 'DONE') await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      return { row, updated };
    });
    const task = this.eventTask(result.updated);
    this.emitter.emit(TASK_EVENTS.STATUS_CHANGED, { task, actorId: actor.userId, from: result.row.status, to });
    if (to === 'IN_REVIEW') this.emitter.emit(TASK_EVENTS.REVIEW_REQUESTED, { task, actorId: actor.userId });
    return toTaskDetail(result.updated);
  }

  async review(id: string, action: 'ACCEPT' | 'RETURN', reason: string | undefined, actor: TaskActor): Promise<TaskDetail> {
    const trimmed = reason?.trim() ?? '';
    if (action === 'RETURN' && !trimmed) throw new BadRequestException('Qaytarish sababini yozing');
    const updated = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) throw new ForbiddenException('Faqat beruvchi tekshira oladi');
      const to: TaskStatus = action === 'ACCEPT' ? 'DONE' : 'IN_PROGRESS';
      const verdict = checkTransition({ from: row.status, to, by: 'MANAGER', selfTask: false, kind: row.kind, requiresPhoto: row.requiresPhoto, hasFreshPhoto: true });
      if (!verdict.ok) throw new BadRequestException(verdict.message);
      const now = new Date();
      const data: Prisma.TaskUncheckedUpdateInput = action === 'ACCEPT'
        ? { status: 'DONE', closedAt: now }
        : { status: 'IN_PROGRESS', returnedCount: { increment: 1 }, lastReturnedAt: now };
      const u = await tx.task.update({ where: { id }, data, select: TASK_DETAIL_SELECT });
      await tx.taskEvent.create({ data: { taskId: id, type: action === 'ACCEPT' ? 'STATUS' : 'RETURN', actorId: actor.userId, text: action === 'RETURN' ? trimmed : null, meta: { from: row.status, to }, via: 'WEB' } });
      if (action === 'ACCEPT') await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      return u;
    });
    this.emitter.emit(TASK_EVENTS.REVIEWED, { task: this.eventTask(updated), actorId: actor.userId, accepted: action === 'ACCEPT', reason: action === 'RETURN' ? trimmed : null });
    return toTaskDetail(updated);
  }

  async cancel(id: string, reason: string | undefined, actor: TaskActor): Promise<TaskDetail> {
    const updated = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) throw new ForbiddenException('Faqat beruvchi bekor qila oladi');
      const verdict = checkTransition({ from: row.status, to: 'CANCELLED', by: 'MANAGER', selfTask: false, kind: row.kind, requiresPhoto: false, hasFreshPhoto: true });
      if (!verdict.ok) throw new BadRequestException(verdict.message);
      const now = new Date();
      const u = await tx.task.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: now, cancelReason: reason?.trim() || null }, select: TASK_DETAIL_SELECT });
      await tx.taskEvent.create({ data: { taskId: id, type: 'CANCELLED', actorId: actor.userId, text: reason?.trim() || null, via: 'WEB' } });
      await tx.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      return u;
    });
    this.emitter.emit(TASK_EVENTS.CANCELLED, { task: this.eventTask(updated), actorId: actor.userId, reason: reason?.trim() || null });
    return toTaskDetail(updated);
  }

  async duplicate(id: string, actor: TaskActor): Promise<TaskDetail> {
    const { row } = await this.loadForAccess(this.prisma, id, actor);
    if (row.kind !== 'MANUAL') throw new BadRequestException("Tizim topshirig'idan nusxa olinmaydi");
    const assigneeIds = row.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
    const watcherIds = row.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
    return (await this.create({
      title: row.title, description: row.description ?? undefined, assigneeIds, watcherIds,
      priority: row.priority, entityType: row.entityType ?? undefined, entityId: row.entityId ?? undefined,
      steps: row.steps.map((s) => ({ title: s.title })),
    }, actor))[0];
  }

  // ---------- participants ----------

  async setParticipants(id: string, assigneeIds: number[], watcherIds: number[], actor: TaskActor): Promise<TaskDetail> {
    const caller = this.actorPerson(actor);
    const people = await this.loadPeople([...assigneeIds, ...watcherIds], actor.companyId);
    const byId = new Map(people.map((p) => [p.id, p]));
    for (const uid of assigneeIds) { const u = byId.get(uid)!; if (!canAssignTo(caller, toPolicyPerson(u))) throw new ForbiddenException(`${u.firstName} ${u.lastName} ga topshiriq bera olmaysiz`); }
    for (const uid of watcherIds) { const u = byId.get(uid)!; if (!canWatch(caller, toPolicyPerson(u))) throw new ForbiddenException(`${u.firstName} ${u.lastName} ni kuzatuvchi qila olmaysiz`); }
    const assigneeSet = new Set(assigneeIds);
    const watchers = watcherIds.filter((w) => !assigneeSet.has(w));

    const r = await this.runSerializable(async (tx) => {
      const { row, access } = await this.loadForAccess(tx, id, actor);
      if (!access.canManage) throw new ForbiddenException("Ijrochilarni faqat beruvchi o'zgartiradi");
      if (row.kind !== 'MANUAL') throw new BadRequestException("Tizim topshirig'ining ijrochisi o'zgartirilmaydi");
      if (!OPEN_STATUSES.includes(row.status)) throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
      const oldAssignees = row.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
      const oldWatchers = row.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
      const removed = row.participants.map((p) => p.userId).filter((u) => !assigneeSet.has(u) && !watchers.includes(u));
      const addedAssignees = assigneeIds.filter((u) => !oldAssignees.includes(u));
      const addedWatchers = watchers.filter((u) => !oldWatchers.includes(u));
      if (removed.length) await tx.taskParticipant.deleteMany({ where: { taskId: id, userId: { in: removed } } });
      // role flips (assignee ↔ watcher)
      await tx.taskParticipant.updateMany({ where: { taskId: id, userId: { in: assigneeIds } }, data: { role: 'ASSIGNEE' } });
      if (watchers.length) await tx.taskParticipant.updateMany({ where: { taskId: id, userId: { in: watchers } }, data: { role: 'WATCHER' } });
      const toCreate = [...addedAssignees.map((userId) => ({ taskId: id, userId, role: 'ASSIGNEE' as const })), ...addedWatchers.map((userId) => ({ taskId: id, userId, role: 'WATCHER' as const }))];
      if (toCreate.length) await tx.taskParticipant.createMany({ data: toCreate, skipDuplicates: true });
      await tx.taskEvent.create({ data: { taskId: id, type: 'ASSIGNEE', actorId: actor.userId, meta: { added: [...addedAssignees, ...addedWatchers], removed }, via: 'WEB' } });
      const updated = await tx.task.findFirst({ where: { id }, select: TASK_DETAIL_SELECT });
      if (updated?.dueAt) await this.outbox.schedule(tx, updated);
      return { updated: updated!, added: [...addedAssignees, ...addedWatchers], removed };
    });
    const task = this.eventTask(r.updated);
    if (r.added.length) this.emitter.emit(TASK_EVENTS.ASSIGNED, { task, actorId: actor.userId, userIds: r.added });
    if (r.removed.length) this.emitter.emit(TASK_EVENTS.UNASSIGNED, { task, actorId: actor.userId, userIds: r.removed });
    return toTaskDetail(r.updated);
  }

  async markSeen(id: string, actor: TaskActor): Promise<void> {
    await this.loadForAccess(this.prisma, id, actor);
    await this.prisma.taskParticipant.updateMany({ where: { taskId: id, userId: actor.userId, seenAt: null }, data: { seenAt: new Date() } });
  }

  // ---------- steps ----------

  async addStep(id: string, title: string, actor: TaskActor): Promise<TaskDetail> {
    const { access } = await this.loadForAccess(this.prisma, id, actor);
    if (!access.canWork) throw new ForbiddenException("Qadam qo'shish uchun ijrochi yoki beruvchi bo'lish kerak");
    const max = await this.prisma.taskStep.aggregate({ where: { taskId: id }, _max: { position: true } });
    await this.prisma.taskStep.create({ data: { taskId: id, title: title.trim(), position: (max._max.position ?? -1) + 1 } });
    await this.prisma.taskEvent.create({ data: { taskId: id, type: 'STEP', actorId: actor.userId, meta: { action: 'added', title: title.trim() }, via: 'WEB' } });
    return this.reload(id, actor);
  }

  async updateStep(id: string, stepId: string, patch: { title?: string; done?: boolean }, actor: TaskActor): Promise<TaskDetail> {
    const { access } = await this.loadForAccess(this.prisma, id, actor);
    const step = await this.prisma.taskStep.findFirst({ where: { id: stepId, taskId: id } });
    if (!step) throw new NotFoundException('Qadam topilmadi');
    if (patch.title !== undefined && !access.canManage) throw new ForbiddenException("Qadam nomini faqat beruvchi o'zgartiradi");
    if (patch.done !== undefined && !access.canWork) throw new ForbiddenException('Qadamni ijrochi yoki beruvchi belgilaydi');
    const data: Prisma.TaskStepUncheckedUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title.trim();
    if (patch.done !== undefined) { data.doneAt = patch.done ? new Date() : null; data.doneById = patch.done ? actor.userId : null; }
    await this.prisma.taskStep.update({ where: { id: stepId }, data });
    if (patch.done !== undefined) {
      await this.prisma.taskEvent.create({ data: { taskId: id, type: 'STEP', actorId: actor.userId, meta: { action: patch.done ? 'done' : 'undone', title: patch.title ?? step.title }, via: 'WEB' } });
    }
    return this.reload(id, actor);
  }

  async deleteStep(id: string, stepId: string, actor: TaskActor): Promise<TaskDetail> {
    const { access } = await this.loadForAccess(this.prisma, id, actor);
    if (!access.canManage) throw new ForbiddenException("Qadamni faqat beruvchi o'chiradi");
    await this.prisma.taskStep.delete({ where: { id: stepId } });
    return this.reload(id, actor);
  }

  // ---------- discussion ----------

  async addComment(id: string, text: string, actor: TaskActor) {
    const { row, access } = await this.loadForAccess(this.prisma, id, actor);
    if (!access.canView) throw new ForbiddenException();
    const ev = await this.prisma.taskEvent.create({ data: { taskId: id, type: 'COMMENT', actorId: actor.userId, text, via: 'WEB' }, select: TASK_EVENT_SELECT });
    this.emitter.emit(TASK_EVENTS.COMMENTED, { task: this.eventTask(row), actorId: actor.userId, text });
    return ev;
  }

  // ---------- fields ----------

  async update(id: string, dto: UpdateTaskDto, actor: TaskActor): Promise<TaskDetail> {
    const { row, access } = await this.loadForAccess(this.prisma, id, actor);
    if (!access.canManage) throw new ForbiddenException("Faqat beruvchi o'zgartira oladi");
    if (row.kind !== 'MANUAL') throw new BadRequestException("Tizim topshirig'i tahrirlanmaydi");
    if (!OPEN_STATUSES.includes(row.status)) throw new BadRequestException("Yopilgan topshiriq o'zgartirilmaydi");
    const data: Prisma.TaskUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.priority !== undefined) data.priority = dto.priority;
    let dueChanged = false;
    if (dto.dueAt !== undefined) {
      const dueAt = parseDueInput(dto.dueAt);
      if (dueAt) assertManualDueAt(dueAt, await this.holidaySet(row.branchId, dueAt));
      data.dueAt = dueAt;
      dueChanged = (dueAt?.getTime() ?? null) !== (row.dueAt?.getTime() ?? null);
    }
    const updated = await this.prisma.task.update({ where: { id }, data, select: TASK_DETAIL_SELECT });
    if (dueChanged) {
      await this.prisma.taskOutbox.deleteMany({ where: { taskId: id, sentAt: null } });
      if (updated.dueAt) await this.outbox.schedule(this.prisma, updated);
      this.emitter.emit(TASK_EVENTS.DUE_CHANGED, { task: this.eventTask(updated), actorId: actor.userId });
    }
    return toTaskDetail(updated);
  }

  private async reload(id: string, actor: TaskActor): Promise<TaskDetail> {
    const { row } = await this.loadForAccess(this.prisma, id, actor);
    return toTaskDetail(row);
  }
```
Module-level helper (above the class), the one `lesson-task.ts` also calls:
```ts
/** First assignee to act takes a system task; the other copies go (ADR-0054). */
export async function claimSystemTask(tx: Prisma.TransactionClient, taskId: string, userId: number): Promise<boolean> {
  const rows = await tx.taskParticipant.findMany({ where: { taskId, role: 'ASSIGNEE' }, select: { userId: true } });
  if (!rows.some((r) => r.userId === userId)) return false;
  // lesson row first (lock order) — same as before the move.
  await tx.unmarkedLesson.updateMany({ where: { taskId }, data: { claimedById: userId } });
  await tx.task.update({ where: { id: taskId }, data: { claimedById: userId } });
  if (rows.length > 1) await tx.taskParticipant.deleteMany({ where: { taskId, role: 'ASSIGNEE', userId: { not: userId } } });
  return true;
}
```
Add imports used above: `checkTransition, OPEN_STATUSES` from `./task-transitions`, `TASK_EVENT_SELECT` from `./task-select`, `UpdateTaskDto`.

- [ ] **Step 4: Run** `cd server && npx jest src/tasks/tasks.service.spec.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add server/src/tasks
git commit -m "feat(tasks): status, review, cancel, participants, steps, comments, update

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Controller + guard spec

**Files:**
- Create: `server/src/tasks/tasks.controller.ts`, `server/src/tasks/tasks.controller.spec.ts`

**Interfaces:**
- Produces the HTTP surface of spec §9.5 under `/tasks`. Header `X-Branch-Id` is read for the create pick.

- [ ] **Step 1: Failing controller spec** (pattern: assert `@Roles` metadata = `STAFF_ROLES`, Student excluded):

```ts
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY, STAFF_ROLES } from '../common/decorators';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksReadService } from './tasks-read.service';

describe('TasksController guards', () => {
  let controller: TasksController;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: { loadActor: jest.fn() } },
        { provide: TasksReadService, useValue: {} },
      ],
    }).compile();
    controller = mod.get(TasksController);
  });
  it('is open to every staff role and closed to students', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, TasksController);
    expect(roles).toEqual([...STAFF_ROLES]);
    expect(roles).not.toContain('Student');
  });
  it('parses the branch header: digits → number, anything else → null', () => {
    expect(controller.pickBranch('12')).toBe(12);
    expect(controller.pickBranch('all')).toBeNull();
    expect(controller.pickBranch(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Implement** `tasks.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles, STAFF_ROLES } from '../common/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards';
import { TasksService, type TaskActor } from './tasks.service';
import { TasksReadService } from './tasks-read.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { TaskStatusDto } from './dto/task-status.dto';
import { TaskReviewDto } from './dto/task-review.dto';
import { TaskCancelDto } from './dto/task-cancel.dto';
import { TaskParticipantsDto } from './dto/task-participants.dto';
import { CreateStepDto, UpdateStepDto } from './dto/task-step.dto';
import { CreateTaskEventDto } from './dto/task-event.dto';
import { WorkloadQueryDto } from './dto/workload-query.dto';

@Controller('tasks')
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
export class TasksController {
  constructor(private tasks: TasksService, private read: TasksReadService) {}

  pickBranch(header: string | undefined): number | null {
    return header && /^\d+$/.test(header) ? Number(header) : null;
  }

  private actor(userId: number, companyId: number, header?: string): Promise<TaskActor> {
    return this.tasks.loadActor(userId, companyId, this.pickBranch(header));
  }

  @Get() async list(@Query() q: ListTasksDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.read.list(q, await this.actor(uid, cid));
  }
  @Get('counts') async counts(@CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.read.counts(await this.actor(uid, cid));
  }
  @Get('workload') async workload(@Query() q: WorkloadQueryDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.read.workload(q, await this.actor(uid, cid));
  }
  @Get('assignable') async assignable(@CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.read.assignable(await this.actor(uid, cid));
  }
  @Post() async create(@Body() dto: CreateTaskDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number, @Headers('x-branch-id') branch?: string) {
    return this.tasks.create(dto, await this.actor(uid, cid, branch));
  }
  @Get(':id') async detail(@Param('id') id: string, @Query('before') before: string | undefined, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.read.detail(id, await this.actor(uid, cid), before);
  }
  @Patch(':id') async update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.update(id, dto, await this.actor(uid, cid));
  }
  @Post(':id/status') async status(@Param('id') id: string, @Body() dto: TaskStatusDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.changeStatus(id, dto.status, await this.actor(uid, cid));
  }
  @Post(':id/review') async review(@Param('id') id: string, @Body() dto: TaskReviewDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.review(id, dto.action, dto.reason, await this.actor(uid, cid));
  }
  @Post(':id/cancel') async cancel(@Param('id') id: string, @Body() dto: TaskCancelDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.cancel(id, dto.reason, await this.actor(uid, cid));
  }
  @Post(':id/duplicate') async duplicate(@Param('id') id: string, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number, @Headers('x-branch-id') branch?: string) {
    return this.tasks.duplicate(id, await this.actor(uid, cid, branch));
  }
  @Put(':id/participants') async participants(@Param('id') id: string, @Body() dto: TaskParticipantsDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.setParticipants(id, dto.assigneeIds, dto.watcherIds ?? [], await this.actor(uid, cid));
  }
  @Post(':id/seen') async seen(@Param('id') id: string, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    await this.tasks.markSeen(id, await this.actor(uid, cid));
    return { ok: true };
  }
  @Post(':id/steps') async addStep(@Param('id') id: string, @Body() dto: CreateStepDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.addStep(id, dto.title, await this.actor(uid, cid));
  }
  @Patch(':id/steps/:stepId') async updateStep(@Param('id') id: string, @Param('stepId') stepId: string, @Body() dto: UpdateStepDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.updateStep(id, stepId, dto, await this.actor(uid, cid));
  }
  @Delete(':id/steps/:stepId') async deleteStep(@Param('id') id: string, @Param('stepId') stepId: string, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.deleteStep(id, stepId, await this.actor(uid, cid));
  }
  @Post(':id/events') async comment(@Param('id') id: string, @Body() dto: CreateTaskEventDto, @CurrentUser('id') uid: number, @CurrentUser('companyId') cid: number) {
    return this.tasks.addComment(id, dto.text, await this.actor(uid, cid));
  }
}
```
Export `ROLES_KEY` is already in `common/decorators/index.ts`.

- [ ] **Step 3: Run** `cd server && npx jest src/tasks/tasks.controller.spec.ts` → PASS.

- [ ] **Step 4: Commit**
```bash
git add server/src/tasks/tasks.controller.ts server/src/tasks/tasks.controller.spec.ts
git commit -m "feat(tasks): HTTP surface under /tasks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Notifications — `task-notify-plan.ts`, `TaskNotifyListener`, `TaskOutboxService`

**Files:**
- Create: `server/src/tasks/task-notify-plan.ts` (+ `.spec.ts`), `server/src/tasks/task-notify.listener.ts`, `server/src/tasks/task-outbox.service.ts` (replace the placeholder, + `.spec.ts`)
- Modify: `server/src/notifications/notification-events.listener.ts` — delete `handleTaskAssigned`, `handleTaskDeleted`, `handleTaskUpdated`, `handleTaskStatusChanged` (lines 56–277) and the now-unused `clipText` import if nothing else uses it.

**Interfaces:**
- Produces:
  - `planNotices(event: keyof typeof TASK_EVENTS-value, payload): Notice[]` where `Notice = { userId: number; type: NotificationType; title: string; message: string; actionRequired: boolean }`.
  - `TaskOutboxService.schedule(db, task: { id, dueAt, participants, authorId }): Promise<void>` — upserts `REMINDER` (dueAt − 1h, assignees) and `OVERDUE` (dueAt, assignees + author) `INAPP` rows; `drain()` cron every minute.
  - SSE message `{ type: 'task.updated', taskId }` to every participant + author on any `task.*` event.

- [ ] **Step 1: Failing plan spec** `task-notify-plan.spec.ts`:

```ts
import { planNotices } from './task-notify-plan';
import { TASK_EVENTS, type TaskEventTask } from './task-events';

const task: TaskEventTask = {
  id: 't1', companyId: 1, title: 'Oktabr banneri', kind: 'MANUAL', authorId: 30, dueAt: null, status: 'NEW',
  participants: [{ userId: 40, role: 'ASSIGNEE' }, { userId: 41, role: 'ASSIGNEE' }, { userId: 50, role: 'WATCHER' }],
};
const names = new Map([[30, 'Soliyev A.'], [40, 'Rahimov A.'], [41, 'Azizova M.'], [50, 'CEO']]);

describe('planNotices (spec §6.1 table, bell leg)', () => {
  it('assigned → each added user, TASK_ASSIGNED, action required', () => {
    const n = planNotices(TASK_EVENTS.ASSIGNED, { task, actorId: 30, userIds: [40, 41] }, names);
    expect(n.map((x) => x.userId)).toEqual([40, 41]);
    expect(n[0]).toMatchObject({ type: 'TASK_ASSIGNED', actionRequired: true, title: 'Yangi topshiriq' });
    expect(n[0].message).toContain('Soliyev A.');
  });
  it('review requested → author only, TASK_REVIEW', () => {
    const n = planNotices(TASK_EVENTS.REVIEW_REQUESTED, { task, actorId: 40 }, names);
    expect(n).toEqual([expect.objectContaining({ userId: 30, type: 'TASK_REVIEW', actionRequired: true })]);
  });
  it('reviewed → assignees, accepted vs returned wording', () => {
    const ok = planNotices(TASK_EVENTS.REVIEWED, { task, actorId: 30, accepted: true, reason: null }, names);
    expect(ok.map((x) => x.userId)).toEqual([40, 41]);
    expect(ok[0].title).toBe('Qabul qilindi');
    const back = planNotices(TASK_EVENTS.REVIEWED, { task, actorId: 30, accepted: false, reason: 'Doska artilmagan' }, names);
    expect(back[0].title).toBe('Topshiriq qaytarildi');
    expect(back[0].message).toContain('Doska artilmagan');
    expect(back[0].actionRequired).toBe(true);
  });
  it('commented → everyone but the actor, info only', () => {
    const n = planNotices(TASK_EVENTS.COMMENTED, { task, actorId: 40, text: 'Narx 450 000 qoldimi?' }, names);
    expect(n.map((x) => x.userId).sort()).toEqual([30, 41, 50]);
    expect(n[0].actionRequired).toBe(false);
  });
  it('status changed by an assignee → author (not for a system task)', () => {
    expect(planNotices(TASK_EVENTS.STATUS_CHANGED, { task, actorId: 40, from: 'NEW', to: 'IN_PROGRESS' }, names).map((x) => x.userId)).toEqual([30]);
    expect(planNotices(TASK_EVENTS.STATUS_CHANGED, { task: { ...task, authorId: null, kind: 'LESSON_QUESTION' }, actorId: 40, from: 'NEW', to: 'IN_PROGRESS' }, names)).toEqual([]);
  });
  it('cancelled → assignees + watchers; done (accept) also reaches watchers', () => {
    expect(planNotices(TASK_EVENTS.CANCELLED, { task, actorId: 30, reason: null }, names).map((x) => x.userId).sort()).toEqual([40, 41, 50]);
    expect(planNotices(TASK_EVENTS.REVIEWED, { task, actorId: 30, accepted: true, reason: null }, names).map((x) => x.userId)).toContain(50);
  });
  it('unassigned → removed users; reassigned → new assignees', () => {
    expect(planNotices(TASK_EVENTS.UNASSIGNED, { task, actorId: 30, userIds: [41] }, names)[0]).toMatchObject({ userId: 41, type: 'TASK_UPDATED' });
    expect(planNotices(TASK_EVENTS.REASSIGNED, { task, fromUserId: 40, toUserIds: [30] }, names)[0]).toMatchObject({ userId: 30, type: 'TASK_ASSIGNED' });
  });
});
```

- [ ] **Step 2: Implement** `task-notify-plan.ts`:

```ts
import type { NotificationType } from '@prisma/client';
import { TASK_EVENTS, type TaskAssignedPayload, type TaskCancelledPayload, type TaskCommentedPayload, type TaskDueChangedPayload, type TaskEventTask, type TaskReassignedPayload, type TaskReviewRequestedPayload, type TaskReviewedPayload, type TaskStatusChangedPayload, type TaskUnassignedPayload } from './task-events';

export interface Notice { userId: number; type: NotificationType; title: string; message: string; actionRequired: boolean }

type Names = ReadonlyMap<number, string>;
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n) + '…' : s);
const who = (names: Names, id: number | null) => (id === null ? 'Tizim' : (names.get(id) ?? "Noma'lum"));
const assignees = (t: TaskEventTask) => t.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
const watchers = (t: TaskEventTask) => t.participants.filter((p) => p.role === 'WATCHER').map((p) => p.userId);
const everyone = (t: TaskEventTask) => [...new Set([...(t.authorId !== null ? [t.authorId] : []), ...t.participants.map((p) => p.userId)])];

const STATUS_LABEL: Record<string, string> = { NEW: 'Yangi', IN_PROGRESS: 'Jarayonda', IN_REVIEW: 'Tekshiruvda', DONE: 'Bajarildi', CANCELLED: 'Bekor qilindi' };

/** One place decides who hears what; the bell listener and (phase 2) Telegram read it. */
export function planNotices(event: string, payload: unknown, names: Names): Notice[] {
  const mk = (userIds: number[], type: NotificationType, title: string, message: string, actionRequired: boolean): Notice[] =>
    [...new Set(userIds)].map((userId) => ({ userId, type, title, message, actionRequired }));

  switch (event) {
    case TASK_EVENTS.ASSIGNED: {
      const p = payload as TaskAssignedPayload;
      return mk(p.userIds, 'TASK_ASSIGNED', 'Yangi topshiriq', `${who(names, p.actorId)} sizga topshiriq berdi: «${clip(p.task.title)}»`, true);
    }
    case TASK_EVENTS.REASSIGNED: {
      const p = payload as TaskReassignedPayload;
      return mk(p.toUserIds, 'TASK_ASSIGNED', 'Topshiriq sizga o\'tdi', `${who(names, p.fromUserId)} ishdan ketgani uchun topshiriq sizga o'tdi: «${clip(p.task.title)}»`, true);
    }
    case TASK_EVENTS.UNASSIGNED: {
      const p = payload as TaskUnassignedPayload;
      return mk(p.userIds, 'TASK_UPDATED', 'Topshiriqdan olib tashlandingiz', `${who(names, p.actorId)}: «${clip(p.task.title)}»`, false);
    }
    case TASK_EVENTS.REVIEW_REQUESTED: {
      const p = payload as TaskReviewRequestedPayload;
      if (p.task.authorId === null) return [];
      return mk([p.task.authorId], 'TASK_REVIEW', 'Tekshiruvga keldi', `${who(names, p.actorId)} bajardi: «${clip(p.task.title)}»`, true);
    }
    case TASK_EVENTS.REVIEWED: {
      const p = payload as TaskReviewedPayload;
      const to = p.accepted ? [...assignees(p.task), ...watchers(p.task)] : assignees(p.task);
      return p.accepted
        ? mk(to, 'TASK_STATUS_CHANGED', 'Qabul qilindi', `${who(names, p.actorId)} qabul qildi: «${clip(p.task.title)}»`, false)
        : mk(to, 'TASK_STATUS_CHANGED', 'Topshiriq qaytarildi', `${who(names, p.actorId)}: «${p.reason ?? ''}» — ${clip(p.task.title, 60)}`, true);
    }
    case TASK_EVENTS.STATUS_CHANGED: {
      const p = payload as TaskStatusChangedPayload;
      if (p.task.authorId === null || p.task.authorId === p.actorId || p.to === 'IN_REVIEW' || p.to === 'DONE') return [];
      return mk([p.task.authorId], 'TASK_STATUS_CHANGED', 'Topshiriq holati', `${who(names, p.actorId)}: ${STATUS_LABEL[p.to]} — «${clip(p.task.title, 60)}»`, false);
    }
    case TASK_EVENTS.COMMENTED: {
      const p = payload as TaskCommentedPayload;
      return mk(everyone(p.task).filter((u) => u !== p.actorId), 'TASK_UPDATED', 'Yangi izoh', `${who(names, p.actorId)}: «${clip(p.text, 80)}» — ${clip(p.task.title, 50)}`, false);
    }
    case TASK_EVENTS.CANCELLED: {
      const p = payload as TaskCancelledPayload;
      return mk([...assignees(p.task), ...watchers(p.task)].filter((u) => u !== p.actorId), 'TASK_DELETED', 'Bekor qilindi', `${who(names, p.actorId)} bekor qildi: «${clip(p.task.title)}»`, false);
    }
    case TASK_EVENTS.DUE_CHANGED: {
      const p = payload as TaskDueChangedPayload;
      return mk(assignees(p.task).filter((u) => u !== p.actorId), 'TASK_UPDATED', "Muddat o'zgardi", `«${clip(p.task.title)}»`, false);
    }
    default:
      return [];
  }
}
```

- [ ] **Step 3: Listener** `task-notify.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TASK_EVENTS, type TaskEventTask } from './task-events';
import { planNotices } from './task-notify-plan';

/** Bell + SSE + push for every task event. Telegram joins in phase 2. */
@Injectable()
export class TaskNotifyListener {
  private readonly logger = new Logger(TaskNotifyListener.name);
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private gateway: NotificationsGateway, private push: PushService) {}

  @OnEvent(TASK_EVENTS.ASSIGNED) onAssigned(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.ASSIGNED, p); }
  @OnEvent(TASK_EVENTS.UNASSIGNED) onUnassigned(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.UNASSIGNED, p); }
  @OnEvent(TASK_EVENTS.STATUS_CHANGED) onStatus(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.STATUS_CHANGED, p); }
  @OnEvent(TASK_EVENTS.REVIEW_REQUESTED) onReview(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.REVIEW_REQUESTED, p); }
  @OnEvent(TASK_EVENTS.REVIEWED) onReviewed(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.REVIEWED, p); }
  @OnEvent(TASK_EVENTS.COMMENTED) onCommented(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.COMMENTED, p); }
  @OnEvent(TASK_EVENTS.CANCELLED) onCancelled(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.CANCELLED, p); }
  @OnEvent(TASK_EVENTS.REASSIGNED) onReassigned(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.REASSIGNED, p); }
  @OnEvent(TASK_EVENTS.DUE_CHANGED) onDue(p: { task: TaskEventTask }) { return this.handle(TASK_EVENTS.DUE_CHANGED, p); }

  private async handle(event: string, payload: { task: TaskEventTask }) {
    try {
      const task = payload.task;
      const ids = [...new Set([...(task.authorId !== null ? [task.authorId] : []), ...task.participants.map((p) => p.userId), ...extraIds(payload)])];
      const users = await this.prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null, isActive: true, status: UserStatus.ACTIVE }, select: { id: true, firstName: true, lastName: true } });
      const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
      const active = new Set(users.map((u) => u.id));
      for (const n of planNotices(event, payload, names)) {
        if (!active.has(n.userId)) continue;
        const notification = await this.notifications.create({ userId: n.userId, type: n.type, title: n.title, message: n.message, relatedEntityType: 'Task', relatedEntityId: task.id, taskId: task.id, companyId: task.companyId });
        this.gateway.sendToUser(n.userId, { type: 'notification', notification });
        await this.push.sendToUser(n.userId, { title: n.title, body: n.message, url: `/tasks?task=${task.id}` });
      }
      for (const uid of ids) this.gateway.sendToUser(uid, { type: 'task.updated', taskId: task.id });
    } catch (error) {
      this.logger.error(`task notify failed (${event}): ${(error as Error).message}`);
    }
  }
}

function extraIds(p: unknown): number[] {
  const x = p as { userIds?: number[]; toUserIds?: number[]; fromUserId?: number };
  return [...(x.userIds ?? []), ...(x.toUserIds ?? []), ...(x.fromUserId !== undefined ? [x.fromUserId] : [])];
}
```
`NotificationsService.create` must accept `taskId?: string` — add it to `CreateNotificationParams` (`notifications.service.ts:6-14`).

- [ ] **Step 4: Outbox** `task-outbox.service.ts` (replace placeholder) and spec:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { OPEN_STATUSES } from './task-transitions';

type Db = PrismaService | Prisma.TransactionClient;
const REMINDER_LEAD_MS = 60 * 60 * 1000;

@Injectable()
export class TaskOutboxService {
  private readonly logger = new Logger(TaskOutboxService.name);
  constructor(private prisma: PrismaService, private notifications: NotificationsService, private gateway: NotificationsGateway, private push: PushService) {}

  /** (Re)writes the time-based rows for a task; called on create, participant and due changes. */
  async schedule(db: Db, task: { id: string; dueAt: Date | null; authorId: number | null; participants: { userId: number; role: 'ASSIGNEE' | 'WATCHER' }[] }): Promise<void> {
    await db.taskOutbox.deleteMany({ where: { taskId: task.id, sentAt: null } });
    if (!task.dueAt) return;
    const assignees = task.participants.filter((p) => p.role === 'ASSIGNEE').map((p) => p.userId);
    const overdueTo = [...new Set([...assignees, ...(task.authorId !== null ? [task.authorId] : [])])];
    const rows = [
      ...assignees.map((userId) => ({ taskId: task.id, userId, channel: 'INAPP' as const, kind: 'REMINDER' as const, sendAfter: new Date(task.dueAt!.getTime() - REMINDER_LEAD_MS) })),
      ...overdueTo.map((userId) => ({ taskId: task.id, userId, channel: 'INAPP' as const, kind: 'OVERDUE' as const, sendAfter: task.dueAt! })),
    ].filter((r) => r.sendAfter.getTime() > Date.now());
    if (rows.length) await db.taskOutbox.createMany({ data: rows, skipDuplicates: true });
  }

  @Cron('0 * * * * *', { timeZone: 'Asia/Tashkent' })
  async drain(): Promise<number> {
    const now = new Date();
    const due = await this.prisma.taskOutbox.findMany({
      where: { channel: 'INAPP', sendAfter: { lte: now }, sentAt: null, attempts: { lt: 3 } },
      take: 100, orderBy: { sendAfter: 'asc' },
      include: { task: { select: { id: true, title: true, status: true, dueAt: true, companyId: true, author: { select: { firstName: true, lastName: true } } } }, user: { select: { deletedAt: true, isActive: true, status: true } } },
    });
    let sent = 0;
    for (const row of due) {
      const open = OPEN_STATUSES.includes(row.task.status);
      const alive = row.user.deletedAt === null && row.user.isActive && row.user.status === UserStatus.ACTIVE;
      if (!open || !alive) { await this.prisma.taskOutbox.update({ where: { id: row.id }, data: { sentAt: now, lastError: open ? 'user inactive' : 'task closed' } }); continue; }
      try {
        const author = row.task.author ? `${row.task.author.firstName} ${row.task.author.lastName}` : 'Tizim';
        const [type, title, message] = row.kind === 'REMINDER'
          ? ['TASK_REMINDER' as const, '1 soatdan keyin muddat tugaydi', `${author} bergan topshiriq: «${row.task.title}»`]
          : ['TASK_OVERDUE' as const, "Muddati o'tdi", `«${row.task.title}»`];
        const notification = await this.notifications.create({ userId: row.userId, type, title, message, relatedEntityType: 'Task', relatedEntityId: row.task.id, taskId: row.task.id, companyId: row.task.companyId });
        this.gateway.sendToUser(row.userId, { type: 'notification', notification });
        await this.push.sendToUser(row.userId, { title, body: message, url: `/tasks?task=${row.task.id}` });
        await this.prisma.taskOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } });
        sent++;
      } catch (error) {
        await this.prisma.taskOutbox.update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastError: (error as Error).message.slice(0, 500) } });
        this.logger.warn(`outbox ${row.id} failed: ${(error as Error).message}`);
      }
    }
    return sent;
  }
}
```
Spec `task-outbox.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { TaskOutboxService } from './task-outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';

describe('TaskOutboxService', () => {
  let svc: TaskOutboxService; let prisma: any; let notif: any; let push: any;
  beforeEach(async () => {
    prisma = { taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() } };
    notif = { create: jest.fn().mockResolvedValue({ id: 'n1' }) }; push = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({ providers: [TaskOutboxService, { provide: PrismaService, useValue: prisma }, { provide: NotificationsService, useValue: notif }, { provide: NotificationsGateway, useValue: { sendToUser: jest.fn() } }, { provide: PushService, useValue: push }] }).compile();
    svc = mod.get(TaskOutboxService);
  });
  it('schedule writes REMINDER for assignees and OVERDUE for assignees + author, only in the future', async () => {
    const dueAt = new Date(Date.now() + 3 * 3600_000);
    await svc.schedule(prisma, { id: 't1', dueAt, authorId: 30, participants: [{ userId: 40, role: 'ASSIGNEE' }, { userId: 50, role: 'WATCHER' }] });
    const rows = prisma.taskOutbox.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.userId, r.kind])).toEqual([[40, 'REMINDER'], [40, 'OVERDUE'], [30, 'OVERDUE']]);
    expect(rows[0].sendAfter.getTime()).toBe(dueAt.getTime() - 3600_000);
  });
  it('schedule with a past due writes nothing (the overdue notice would be noise)', async () => {
    await svc.schedule(prisma, { id: 't1', dueAt: new Date(Date.now() - 1000), authorId: 30, participants: [{ userId: 40, role: 'ASSIGNEE' }] });
    expect(prisma.taskOutbox.createMany).not.toHaveBeenCalled();
  });
  it('drain sends open tasks to active users and marks closed ones without sending', async () => {
    const base = { id: 'o', userId: 40, kind: 'REMINDER', user: { deletedAt: null, isActive: true, status: 'ACTIVE' } };
    prisma.taskOutbox.findMany.mockResolvedValue([
      { ...base, id: 'o1', task: { id: 't1', title: 'A', status: 'NEW', dueAt: new Date(), companyId: 1, author: null } },
      { ...base, id: 'o2', task: { id: 't2', title: 'B', status: 'DONE', dueAt: new Date(), companyId: 1, author: null } },
    ]);
    expect(await svc.drain()).toBe(1);
    expect(notif.create).toHaveBeenCalledTimes(1);
    expect(prisma.taskOutbox.update).toHaveBeenCalledWith({ where: { id: 'o2' }, data: expect.objectContaining({ lastError: 'task closed' }) });
  });
});
```

- [ ] **Step 5: Remove the old handlers.** In `notification-events.listener.ts` delete the four `@OnEvent('task.*')` methods (lines 56–277). Keep `truncate`, `sendTelegram`, `filterActiveRecipientIds` (used by other handlers). Drop the `clipText` import only if unused (`grep -n clipText`). The `TelegramDigestCategory.TASK_*` enum values and renderer stay (rows already queued still render); nothing enqueues them anymore.

- [ ] **Step 6: Run** `cd server && npx jest src/tasks src/notifications` → PASS.

- [ ] **Step 7: Commit**
```bash
git add server/src/tasks server/src/notifications
git commit -m "feat(tasks): bell/SSE/push notifications and in-app deadline outbox

The four comment-task handlers leave notification-events.listener.ts; task
rows are no longer queued into the 20:00 Telegram digest.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Move «Dars bo'ldimi?» to `Task`, remove comment task mode, departed-employee listener, single-source spec, first green build

**Files:**
- Create: `server/src/tasks/lesson-task.ts` (+ `.spec.ts` moved from `unmarked-lessons/lesson-task.spec.ts` and adapted), `server/src/tasks/task-user-lifecycle.listener.ts` (+ `.spec.ts`), `server/src/tasks/task-write.single-source.spec.ts`
- Modify: `server/src/unmarked-lessons/lesson-task.ts` (→ re-export shim), `unmarked-lessons/unmarked-lesson-transitions.ts`, `unmarked-lessons/make-up-day.ts`, `attendance/unmarked-lessons.service.ts`, `attendance/attendance-save.service.ts`, `comments/*`, `leads/leads.service.ts`, `branches/branch-reset-plan.ts` (counts: add `prisma.taskParticipant.count` next to the comment count — read the file first), `telegram-groups/telegram-group-daily-report.service.ts` (unanswered-lesson count already reads `UnmarkedLesson`, not the task — verify with grep `taskCommentId`, no change expected).
- Delete: `server/src/comments/task-reminder.service.ts` (+ spec if any), `comments/dto/task-query.dto.ts`, `comments/dto/update-assignee-status.dto.ts`.

**Interfaces:**
- Produces in `tasks/lesson-task.ts` (same names as before, now on `Task`): `createLessonTask(tx, args): Promise<string | null>` (returns the task id), `closeLessonTask(tx, taskId, actorId)`, `closeTasksOfDeletedGroup(tx, groupId)`, `lessonTaskAssigneeIds`, `nextWorkingDay`, `taskDueAt`, `lessonTaskText`, `TASK_DUE_HOUR`; re-exports `claimSystemTask` from `tasks.service`.

- [ ] **Step 1: Write the new `tasks/lesson-task.ts`** (copy helpers verbatim; only the three DB functions change):

```ts
import { Prisma, UserStatus } from '@prisma/client';
import { addDaysToDateStr, dayOfWeekForDateStr, TASHKENT_OFFSET_MS, utcMidnightFromDateStr } from '../common/date/tashkent';
export { claimSystemTask } from './tasks.service';

type Tx = Prisma.TransactionClient;
export const TASK_DUE_HOUR = 10;
const ACTIVE_STAFF = { deletedAt: null, isActive: true, status: UserStatus.ACTIVE } as const;

export function nextWorkingDay(dateStr: string, holidays: ReadonlySet<string>): string { /* unchanged */ }
export function taskDueAt(dateStr: string): Date { /* unchanged */ }
export function lessonTaskText(args: { groupName: string; dateStr: string; startTime: string; endTime: string }): string { /* unchanged */ }
export async function lessonTaskAssigneeIds(tx: Tx, companyId: number, branchId: number): Promise<number[]> { /* unchanged */ }

/** The «Dars bo'ldimi?» task, now a `Task` row (spec 2026-10-07 §7). */
export async function createLessonTask(tx: Tx, args: { companyId: number; branchId: number; groupId: string; groupName: string; dateStr: string; startTime: string; endTime: string; dueAt: Date }): Promise<string | null> {
  const assigneeIds = await lessonTaskAssigneeIds(tx, args.companyId, args.branchId);
  if (assigneeIds.length === 0) return null;
  const task = await tx.task.create({
    data: {
      companyId: args.companyId, branchId: args.branchId, kind: 'LESSON_QUESTION',
      title: lessonTaskText(args), priority: 'HIGH', dueAt: args.dueAt, authorId: null,
      entityType: 'Group', entityId: args.groupId,
      sourceKey: `unmarked:${args.groupId}:${args.dateStr}`,
      participants: { create: assigneeIds.map((userId) => ({ userId, role: 'ASSIGNEE' as const })) },
      events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
    },
    select: { id: true },
  });
  return task.id;
}

/** Closes the task once its lesson is answered (ADR-0054 rules unchanged). */
export async function closeLessonTask(tx: Tx, taskId: string | null, actorId: number | null): Promise<void> {
  if (!taskId) return;
  const now = new Date();
  if (actorId !== null) {
    await tx.unmarkedLesson.updateMany({ where: { taskId }, data: { claimedById: actorId } });
    const own = await tx.taskParticipant.findFirst({ where: { taskId, userId: actorId, role: 'ASSIGNEE' }, select: { id: true } });
    if (own) await tx.taskParticipant.deleteMany({ where: { taskId, role: 'ASSIGNEE', userId: { not: actorId } } });
  }
  await tx.task.updateMany({ where: { id: taskId, status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } }, data: { status: 'DONE', closedAt: now, ...(actorId !== null ? { claimedById: actorId } : {}) } });
  await tx.taskEvent.create({ data: { taskId, type: 'AUTO_CLOSED', actorId, meta: { reason: 'LESSON_ANSWERED' }, via: 'SYSTEM' } });
  await tx.taskOutbox.deleteMany({ where: { taskId, sentAt: null } });
}

export async function closeTasksOfDeletedGroup(tx: Tx, groupId: string): Promise<void> {
  const rows = await tx.unmarkedLesson.findMany({ where: { groupId, status: 'PENDING' }, select: { taskId: true } });
  for (const r of rows) await closeLessonTask(tx, r.taskId, null);
}
```
Note `taskEvent.create` with `actorId: null` — the relation is optional, so `data: { taskId, … }` unchecked form is fine.

- [ ] **Step 2: Shim** `unmarked-lessons/lesson-task.ts` becomes one line: `export * from '../tasks/lesson-task';` — so the four call sites keep their imports. Move `unmarked-lessons/lesson-task.spec.ts` to `tasks/lesson-task.spec.ts`, change `tx.comment.create` expectations to `tx.task.create` with `kind: 'LESSON_QUESTION'`, `claimSystemTask` expectations to `taskParticipant.deleteMany` + `task.update`, and `closeLessonTask` expectations to `task.updateMany({ status: 'DONE' })`.

- [ ] **Step 3: Rename the column at the call sites** — every `taskCommentId` in `attendance/unmarked-lessons.service.ts:174-194`, `attendance/attendance-save.service.ts:456-476`, `unmarked-lessons/make-up-day.ts:78-97`, `unmarked-lessons/unmarked-lesson-transitions.ts` (:71-87, :132-144, :164-187, :206-242, :299-330, :508-518) becomes `taskId`. `grep -rn taskCommentId server/src --include='*.ts'` must then list only `comments/` (which Task 9 Step 4 removes) and the migration script (Task 10).

- [ ] **Step 4: Comments module cleanup**
  - `comments/dto/create-comment.dto.ts`: delete `isTask`, `assigneeIds`, `dueDate`, `priority` (global `forbidNonWhitelisted` turns a stale client into a 400). `update-comment.dto.ts`: delete `dueDate`, `priority`.
  - `comments.service.ts`: delete `assertDueDateInWorkingWindow`, the `isTask` branches in `create`/`update`/`delete`, `getMyTasks`, `getCreatedTasks`, `updateAssigneeStatus`, `runSerializable`, the `claimSystemTask`/`isTransactionConflict`/`AssigneeStatus`/`ConflictException` imports; `commentInclude` loses `assignees`. In `findByEntity` and `getLatestComment` add `isTask: false` to the `where` (migrated rows stay hidden). Remove the `task.*` emits.
  - `comments.controller.ts`: delete `getMyTasks`, `getCreatedTasks`, `updateAssigneeStatus` and the `isTask` gate in `create`. `comments.controller.spec.ts`: rewrite to assert `@Roles` metadata on `create` = `['CEO','Branch Director','Administrator']` (the old in-handler gate is gone).
  - `comments.module.ts`: remove `TaskReminderService`, `HolidaysModule`. Delete `task-reminder.service.ts`.
  - `comments.service.spec.ts`: delete the task describes (`getMyTasks`, `updateAssigneeStatus`, system-task guards); keep create/update/delete/findByEntity.
  - `leads/leads.service.ts:393-420`: drop `isTask` from the select and the returned `latestComment`; `authorName` logic stays.

- [ ] **Step 5: Departed employee** `task-user-lifecycle.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent, EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { USER_DEACTIVATED_EVENT, type UserDeactivatedEvent } from '../common/events/user-lifecycle.events';
import { lessonTaskAssigneeIds } from './lesson-task';
import { TASK_EVENTS } from './task-events';
import { TASK_CARD_SELECT } from './task-select';

/** Spec §5.4: nobody's task is left without an owner when they leave. */
@Injectable()
export class TaskUserLifecycleListener {
  private readonly logger = new Logger(TaskUserLifecycleListener.name);
  constructor(private prisma: PrismaService, private emitter: EventEmitter2) {}

  @OnEvent(USER_DEACTIVATED_EVENT)
  async onDeactivated(e: UserDeactivatedEvent) {
    try {
      const rows = await this.prisma.task.findMany({
        where: { companyId: e.companyId, status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] }, participants: { some: { userId: e.userId } } },
        select: TASK_CARD_SELECT,
      });
      for (const t of rows) {
        const mine = t.participants.find((p) => p.userId === e.userId)!;
        const otherAssignees = t.participants.filter((p) => p.role === 'ASSIGNEE' && p.userId !== e.userId).map((p) => p.userId);
        let toUserIds: number[] = [];
        if (mine.role === 'ASSIGNEE' && otherAssignees.length === 0) {
          if (t.kind === 'MANUAL') toUserIds = t.authorId !== null && t.authorId !== e.userId ? [t.authorId] : [];
          else if (t.branchId !== null) toUserIds = await lessonTaskAssigneeIds(this.prisma, t.companyId, t.branchId);
        }
        await this.prisma.$transaction(async (tx) => {
          await tx.taskParticipant.deleteMany({ where: { taskId: t.id, userId: e.userId } });
          if (toUserIds.length) await tx.taskParticipant.createMany({ data: toUserIds.map((userId) => ({ taskId: t.id, userId, role: 'ASSIGNEE' as const })), skipDuplicates: true });
          await tx.taskEvent.create({ data: { taskId: t.id, type: 'REASSIGNED', actorId: null, meta: { from: e.userId, to: toUserIds }, via: 'SYSTEM' } });
          await tx.taskOutbox.deleteMany({ where: { taskId: t.id, userId: e.userId, sentAt: null } });
        });
        if (toUserIds.length) {
          this.emitter.emit(TASK_EVENTS.REASSIGNED, { task: { id: t.id, companyId: t.companyId, title: t.title, kind: t.kind, authorId: t.authorId, dueAt: t.dueAt, status: t.status, participants: [...t.participants.filter((p) => p.userId !== e.userId).map((p) => ({ userId: p.userId, role: p.role })), ...toUserIds.map((userId) => ({ userId, role: 'ASSIGNEE' as const }))] }, fromUserId: e.userId, toUserIds });
        }
      }
    } catch (err) {
      this.logger.error(`reassign on deactivate failed for user ${e.userId}: ${(err as Error).message}`);
    }
  }
}
```
Spec `task-user-lifecycle.listener.spec.ts`: three cases — sole manual assignee → author gets it and `task.reassigned` emitted; one of two assignees → just removed, no emit; sole assignee of a `LESSON_QUESTION` → `lessonTaskAssigneeIds` result (mock `prisma.user.findMany` to return `[{ id: 77 }]`) becomes assignee.

- [ ] **Step 6: Single-source spec** `task-write.single-source.spec.ts` — same walker as `event-wiring.spec.ts`; regex `/\b(tx|prisma|db|this\.prisma)\.task(?:Participant|Step|Event|Outbox)?\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/g`; allowed files: `src/tasks/tasks.service.ts`, `src/tasks/lesson-task.ts`, `src/tasks/task-outbox.service.ts`, `src/tasks/task-user-lifecycle.listener.ts`, and `src/branches/branch-reset-plan.ts` only if it deletes task rows (it should not — branch reset only counts). Assert `offenders` is `[]` and that the scan found ≥ 10 matches.

- [ ] **Step 7: Green build**
```bash
cd server && npx prettier --write "src/tasks/**/*.ts" src/comments src/unmarked-lessons src/attendance/unmarked-lessons.service.ts src/attendance/attendance-save.service.ts src/notifications/notification-events.listener.ts src/leads/leads.service.ts && npm run typecheck && npx eslint src/tasks src/comments src/unmarked-lessons --quiet && npx jest src/tasks src/comments src/unmarked-lessons src/attendance src/common/event-wiring.spec.ts src/telegram-digest/direct-send.guard.spec.ts
```
Expected: typecheck 0 errors; eslint clean; all listed suites PASS. `event-wiring.spec.ts` must show `task.assigned` etc. both emitted and heard, and no `task.deleted`/`task.updated` leftovers.

- [ ] **Step 8: Commit**
```bash
git add -A server/src
git commit -m "feat(tasks): «Dars bo'ldimi?» on Task rows; comment task mode removed; reassignment on departure

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Migration script for the 34 comment tasks

**Files:**
- Create: `server/scripts/lib/comment-task-map.ts` (+ `.spec.ts` under `server/src/tasks/comment-task-map.spec.ts` so jest picks it up — jest's `roots` is `src`), `server/scripts/migrate-comment-tasks.ts`

**Interfaces:**
- Produces: `mapCommentTask(c: CommentTaskRow): { task: TaskCreateInput; participants; events; lessonLink: boolean }` and the CLI `railway run npx ts-node --transpile-only scripts/migrate-comment-tasks.ts [--apply]`.

- [ ] **Step 1: Failing spec** `server/src/tasks/comment-task-map.spec.ts`:
```ts
import { mapCommentTask } from '../../scripts/lib/comment-task-map';
const base = { id: 'c1', entityType: 'Student', entityId: '10001', content: 'Shartnomani imzolatish', isSystem: false, dueDate: new Date('2026-10-06T13:00:00Z'), priority: 'URGENT' as const, authorId: 30, companyId: 1, createdAt: new Date('2026-10-01T05:00:00Z'), assignees: [{ userId: 40, status: 'SEEN' as const, seenAt: new Date('2026-10-02T05:00:00Z'), doneAt: null }], unmarkedLesson: null };
describe('mapCommentTask', () => {
  it('manual SEEN → IN_PROGRESS, title = content, author kept', () => {
    const m = mapCommentTask(base, 1);
    expect(m.task).toMatchObject({ kind: 'MANUAL', status: 'IN_PROGRESS', title: 'Shartnomani imzolatish', authorId: 30, priority: 'URGENT', branchId: 1, companyId: 1 });
    expect(m.participants).toEqual([{ userId: 40, role: 'ASSIGNEE', seenAt: base.assignees[0].seenAt }]);
  });
  it('all DONE → DONE with closedAt = last doneAt', () => {
    const done = new Date('2026-10-03T05:00:00Z');
    const m = mapCommentTask({ ...base, assignees: [{ userId: 40, status: 'DONE', seenAt: null, doneAt: done }] }, 1);
    expect(m.task).toMatchObject({ status: 'DONE', closedAt: done });
  });
  it('system → LESSON_QUESTION with sourceKey and no author', () => {
    const m = mapCommentTask({ ...base, isSystem: true, authorId: null, entityType: 'Group', entityId: 'g1', unmarkedLesson: { id: 'u1', groupId: 'g1', date: new Date('2026-10-05T00:00:00Z'), claimedById: 40 } }, 2);
    expect(m.task).toMatchObject({ kind: 'LESSON_QUESTION', authorId: null, sourceKey: 'unmarked:g1:2026-10-05', claimedById: 40 });
    expect(m.lessonLink).toBe(true);
  });
  it('a long content splits into title (200) + description', () => {
    const m = mapCommentTask({ ...base, content: 'x'.repeat(250) }, 1);
    expect(m.task.title).toHaveLength(200);
    expect(m.task.description).toHaveLength(50);
  });
});
```

- [ ] **Step 2: Implement** `scripts/lib/comment-task-map.ts`:
```ts
export interface CommentTaskRow {
  id: string; entityType: string; entityId: string; content: string; isSystem: boolean;
  dueDate: Date | null; priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null; authorId: number | null;
  companyId: number; createdAt: Date;
  assignees: { userId: number; status: 'PENDING' | 'SEEN' | 'DONE'; seenAt: Date | null; doneAt: Date | null }[];
  unmarkedLesson: { id: string; groupId: string; date: Date; claimedById: number | null } | null;
}

export function mapCommentTask(c: CommentTaskRow, branchId: number | null) {
  const title = c.content.slice(0, 200);
  const description = c.content.length > 200 ? c.content.slice(200) : null;
  const allDone = c.assignees.length > 0 && c.assignees.every((a) => a.status === 'DONE');
  const anySeen = c.assignees.some((a) => a.status !== 'PENDING');
  const status = allDone ? 'DONE' : anySeen ? 'IN_PROGRESS' : 'NEW';
  const closedAt = allDone ? c.assignees.reduce<Date | null>((m, a) => (a.doneAt && (!m || a.doneAt > m) ? a.doneAt : m), null) : null;
  const dateStr = c.unmarkedLesson ? c.unmarkedLesson.date.toISOString().slice(0, 10) : null;
  return {
    task: {
      companyId: c.companyId, branchId, kind: c.isSystem ? ('LESSON_QUESTION' as const) : ('MANUAL' as const),
      title, description, status, priority: c.priority ?? 'MEDIUM', dueAt: c.dueDate, authorId: c.isSystem ? null : c.authorId,
      entityType: c.entityType, entityId: c.entityId,
      sourceKey: c.unmarkedLesson ? `unmarked:${c.unmarkedLesson.groupId}:${dateStr}` : null,
      claimedById: c.unmarkedLesson?.claimedById ?? null, closedAt, createdAt: c.createdAt,
    },
    participants: c.assignees.map((a) => ({ userId: a.userId, role: 'ASSIGNEE' as const, seenAt: a.seenAt })),
    events: [{ type: 'CREATED' as const, actorId: c.isSystem ? null : c.authorId, via: 'SYSTEM' as const, createdAt: c.createdAt }],
    lessonLink: c.unmarkedLesson !== null,
  };
}
```

- [ ] **Step 3: Script** `scripts/migrate-comment-tasks.ts` (pattern: `scripts/open-unmarked-lessons.ts` — dry run default, read-only connection check, `--apply`):
```ts
import { makePrisma, printHeader, run } from './lib/check-cli';
import { mapCommentTask } from './lib/comment-task-map';
import { tryResolveStudentBranchId, tryResolveUserBranchId } from '../src/common/finance/resolve-branch';

const APPLY = process.argv.includes('--apply');

run(async (prisma) => {
  printHeader(`Comment tasks → Task (${APPLY ? 'APPLY' : 'dry run'})`);
  const rows = await prisma.comment.findMany({
    where: { isTask: true, migratedTaskId: null },
    select: { id: true, entityType: true, entityId: true, content: true, isSystem: true, dueDate: true, priority: true, authorId: true, companyId: true, createdAt: true,
      assignees: { select: { userId: true, status: true, seenAt: true, doneAt: true } },
      unmarkedLesson: { select: { id: true, groupId: true, date: true, claimedById: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`candidates: ${rows.length}`);
  let open = 0;
  for (const c of rows) {
    let branchId: number | null = null;
    if (c.entityType === 'Student') branchId = await tryResolveStudentBranchId(prisma, Number(c.entityId), c.companyId);
    else if (c.entityType === 'Group') branchId = (await prisma.group.findFirst({ where: { id: c.entityId }, select: { branchId: true } }))?.branchId ?? null;
    else if (c.entityType === 'Lead') branchId = (await prisma.lead.findFirst({ where: { id: c.entityId }, select: { branchId: true } }))?.branchId ?? null;
    else if (c.entityType === 'User') branchId = await tryResolveUserBranchId(prisma, Number(c.entityId));
    const m = mapCommentTask(c, branchId);
    if (m.task.status !== 'DONE') open++;
    console.log(`${c.id} ${m.task.kind.padEnd(16)} ${m.task.status.padEnd(12)} ${m.participants.length} assignee(s) → ${m.task.title.slice(0, 60)}`);
    if (!APPLY) continue;
    await prisma.$transaction(async (tx) => {
      const t = await tx.task.create({ data: { ...m.task, participants: { create: m.participants }, events: { create: m.events } }, select: { id: true } });
      await tx.comment.update({ where: { id: c.id }, data: { migratedTaskId: t.id } });
      await tx.notification.updateMany({ where: { commentId: c.id }, data: { taskId: t.id } });
      if (m.lessonLink) await tx.unmarkedLesson.update({ where: { id: c.unmarkedLesson!.id }, data: { taskId: t.id } });
    });
  }
  console.log(`open: ${open}, done: ${rows.length - open}`);
  if (APPLY) {
    const [tasks, comments] = await Promise.all([prisma.task.count(), prisma.comment.count({ where: { isTask: true } })]);
    console.log(`check: Task=${tasks} isTask comments=${comments} ${tasks >= comments ? 'OK' : 'MISMATCH'}`);
  }
});
```
`makePrisma`/`run` come from `scripts/lib/check-cli.ts` (prod via `railway run`, `--dev` for `.env`).

- [ ] **Step 4: Run spec and a dev dry run**
```bash
cd server && npx jest src/tasks/comment-task-map.spec.ts && npx ts-node --transpile-only scripts/migrate-comment-tasks.ts --dev | tail -5
```
Expected: spec PASS; dry run prints candidates and `open: N, done: M` without writing.

- [ ] **Step 5: Commit**
```bash
git add server/scripts/migrate-comment-tasks.ts server/scripts/lib/comment-task-map.ts server/src/tasks/comment-task-map.spec.ts
git commit -m "feat(tasks): one-off migration of comment tasks to Task rows (dry run by default)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Client foundation — types, store, counts hook, labels, due helpers

**Files:**
- Create: `client/src/hooks/use-tasks.ts`, `client/src/hooks/use-task-counts.ts`, `client/src/components/tasks/task-labels.ts`, `client/src/components/tasks/task-due.ts` (+ `task-due.test.ts`), `client/src/components/tasks/task-href.ts` (+ `task-href.test.ts`, moved from `task-entity-href.test.ts`)
- Delete: `client/src/hooks/use-tasks-board.ts`, `client/src/hooks/use-pending-task-count.ts`, `client/src/components/tasks/task-entity-href.ts`, `task-entity-href.test.ts`
- Modify: `client/src/lib/branch-scoped-header.test.ts` — replace the two entries at lines 46–54 with `"hooks/use-task-counts.ts": "Counts the viewer's own open tasks for the sidebar; GET /tasks/counts is keyed on the person, not the branch."` and `"hooks/use-tasks.ts": "Reached only through the sidebar recount; the store is reset on a branch switch (registerBranchScopedStore)."`; `client/src/components/app-sidebar.tsx:35,44` — import/use `useTaskCounts` (`const { my: pendingTasks, myOverdue } = useTaskCounts();` and tint the count red only when `myOverdue > 0`, else use the primary badge colour).

**Interfaces:**
- Produces:
  - Types: `TaskStatus`, `TaskPriority`, `TaskKind`, `TaskPerson`, `TaskCard`, `TaskDetail`, `TaskEvent`, `TaskStep`, `TaskView = 'my' | 'created' | 'all' | 'workload'`.
  - Store `useTasks` with `columns: Record<TaskStatus, { items: TaskCard[]; cursor: string | null; loading: boolean }>`, `view`, `filters`, `fetchColumn(status, { reset })`, `fetchBoard()`, `refreshTask(id)`, `patchTask(card)`, `openTaskId`, `openTask(id)`, `closeTask()`.
  - `useTaskCounts(): { my; myOverdue; created; review; refetch }`.
  - `STATUS_LABEL`, `STATUS_COLUMNS`, `PRIORITY_LABEL`, `PRIORITY_CLASS`, `KIND_LABEL`, `ENTITY_LABEL` in `task-labels.ts`.
  - `dueState(dueAt, now): 'overdue' | 'today' | 'soon' | 'later' | 'none'`, `groupByDue(cards, now): { key; label; items }[]`, `formatDue(dueAt, now): string` in `task-due.ts`.
  - `taskEntityHref(entityType, entityId, roleIds)` and `taskHref(id) = /tasks?task=<id>` in `task-href.ts`.

- [ ] **Step 1: Labels** `task-labels.ts`:
```ts
import type { TaskKind, TaskPriority, TaskStatus } from "@/hooks/use-tasks";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NEW: "Yangi", IN_PROGRESS: "Jarayonda", IN_REVIEW: "Tekshiruvda", DONE: "Bajarildi", CANCELLED: "Bekor qilingan",
};
export const STATUS_COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
  { id: "NEW", label: "Yangi", dot: "bg-gray-400" },
  { id: "IN_PROGRESS", label: "Jarayonda", dot: "bg-blue-500" },
  { id: "IN_REVIEW", label: "Tekshiruvda", dot: "bg-violet-500" },
  { id: "DONE", label: "Bajarildi", dot: "bg-emerald-500" },
];
export const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: "Past", MEDIUM: "O'rta", HIGH: "Yuqori", URGENT: "Shoshilinch" };
export const PRIORITY_CLASS: Record<TaskPriority, string> = {
  URGENT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  HIGH: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  MEDIUM: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  LOW: "bg-gray-100 text-gray-700 dark:bg-gray-800/50 dark:text-gray-400",
};
export const KIND_LABEL: Record<TaskKind, string> = {
  MANUAL: "", LESSON_QUESTION: "Dars bo'ldimi?", CALLBACK: "Qayta qo'ng'iroq", BROKEN_PROMISE: "Buzilgan va'da", UNCALLED_LEAD: "Qo'ng'iroqsiz lid",
};
export const ENTITY_LABEL: Record<string, string> = { Student: "O'quvchi", User: "Xodim", Group: "Guruh", Lead: "Lid" };
```

- [ ] **Step 2: Failing due test** `task-due.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { dueState, formatDue, groupByDue } from "./task-due";
const now = new Date("2026-10-07T05:00:00Z"); // 10:00 Tashkent, Wednesday
const card = (id: string, dueAt: string | null, priority = "MEDIUM", status = "NEW") => ({ id, dueAt, priority, status }) as any;
describe("dueState", () => {
  it("overdue / today / soon (≤7 days) / later / none", () => {
    expect(dueState("2026-10-07T04:00:00Z", now)).toBe("overdue");
    expect(dueState("2026-10-07T13:00:00Z", now)).toBe("today");
    expect(dueState("2026-10-10T13:00:00Z", now)).toBe("soon");
    expect(dueState("2026-10-30T13:00:00Z", now)).toBe("later");
    expect(dueState(null, now)).toBe("none");
  });
  it("Tashkent day decides «today»: 23:30 Tashkent is still today", () => {
    expect(dueState("2026-10-07T18:30:00Z", now)).toBe("today");
  });
});
describe("groupByDue", () => {
  it("orders groups and puts review first within none", () => {
    const g = groupByDue([card("a", "2026-10-30T13:00:00Z"), card("b", "2026-10-07T04:00:00Z"), card("c", "2026-10-07T13:00:00Z", "URGENT"), card("d", null)], now);
    expect(g.map((x) => x.key)).toEqual(["overdue", "today", "later", "none"]);
    expect(g[1].items[0].id).toBe("c");
  });
  it("within a group, higher priority first", () => {
    const g = groupByDue([card("a", "2026-10-07T13:00:00Z", "LOW"), card("b", "2026-10-07T14:00:00Z", "URGENT")], now);
    expect(g[0].items.map((x: any) => x.id)).toEqual(["b", "a"]);
  });
});
describe("formatDue", () => {
  it("today → «Bugun 18:00», tomorrow, weekday for this week, dd.MM otherwise", () => {
    expect(formatDue("2026-10-07T13:00:00Z", now)).toBe("Bugun 18:00");
    expect(formatDue("2026-10-08T13:00:00Z", now)).toBe("Ertaga 18:00");
    expect(formatDue("2026-10-10T13:00:00Z", now)).toBe("Sha, 10.10");
    expect(formatDue("2026-10-30T13:00:00Z", now)).toBe("30.10");
  });
});
```

- [ ] **Step 3: Implement** `task-due.ts`:
```ts
const OFFSET = 5 * 3600_000;
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const WEEKDAY = ["Yak", "Du", "Se", "Cho", "Pa", "Ju", "Sha"];
const tDay = (d: Date) => Math.floor((d.getTime() + OFFSET) / 86_400_000);
const hhmm = (d: Date) => { const t = new Date(d.getTime() + OFFSET); return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`; };
const ddmm = (d: Date) => { const t = new Date(d.getTime() + OFFSET); return `${String(t.getUTCDate()).padStart(2, "0")}.${String(t.getUTCMonth() + 1).padStart(2, "0")}`; };

export type DueState = "overdue" | "today" | "soon" | "later" | "none";
export function dueState(dueAt: string | null, now: Date): DueState {
  if (!dueAt) return "none";
  const d = new Date(dueAt);
  if (d.getTime() < now.getTime()) return "overdue";
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";
  return "later";
}
export function formatDue(dueAt: string, now: Date): string {
  const d = new Date(dueAt);
  const diff = tDay(d) - tDay(now);
  if (diff === 0) return `Bugun ${hhmm(d)}`;
  if (diff === 1) return `Ertaga ${hhmm(d)}`;
  if (diff > 1 && diff <= 6) return `${WEEKDAY[new Date(d.getTime() + OFFSET).getUTCDay()]}, ${ddmm(d)}`;
  return ddmm(d);
}
const GROUPS: { key: DueState; label: string }[] = [
  { key: "overdue", label: "Muddati o'tgan" }, { key: "today", label: "Bugun" },
  { key: "soon", label: "Shu hafta" }, { key: "later", label: "Keyinroq" }, { key: "none", label: "Muddatsiz" },
];
export function groupByDue<T extends { dueAt: string | null; priority: string }>(cards: T[], now: Date) {
  const by = new Map<DueState, T[]>();
  for (const c of cards) { const k = dueState(c.dueAt, now); by.set(k, [...(by.get(k) ?? []), c]); }
  return GROUPS.filter((g) => by.has(g.key)).map((g) => ({
    ...g,
    items: [...by.get(g.key)!].sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) || (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
  }));
}
```

- [ ] **Step 4: `task-href.ts`** — copy `task-entity-href.ts` verbatim, rename the export file, add `export const taskHref = (id: string) => \`/tasks?task=${id}\`;`. Move the test (`import { taskEntityHref } from "./task-href"`).

- [ ] **Step 5: Store** `hooks/use-tasks.ts`:
```ts
import { create } from "zustand";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { registerBranchScopedStore } from "@/lib/branch-scoped-stores";

export type TaskStatus = "NEW" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskKind = "MANUAL" | "LESSON_QUESTION" | "CALLBACK" | "BROKEN_PROMISE" | "UNCALLED_LEAD";
export type TaskView = "my" | "created" | "all" | "workload";
export interface TaskPerson { id: number; firstName: string; lastName: string; photo: string | null; seenAt?: string | null }
export interface TaskLesson { id: string; groupId: string; groupName: string; branchName: string | null; date: string; status: "PENDING" | "HELD" | "NOT_HELD" | "RESCHEDULED"; teacherPayExempt: boolean; lessonStartTime: string; lessonEndTime: string; claimedById: number | null }
export interface TaskCard {
  id: string; kind: TaskKind; title: string; status: TaskStatus; priority: TaskPriority; dueAt: string | null;
  branchId: number | null; entityType: string | null; entityId: string | null; requiresPhoto: boolean;
  batchId: string | null; claimedById: number | null; returnedCount: number; closedAt: string | null; createdAt: string;
  author: TaskPerson | null; assignees: TaskPerson[]; watchers: TaskPerson[];
  stepsTotal: number; stepsDone: number; eventsCount: number; unmarkedLesson: TaskLesson | null;
  batch?: { total: number; done: number; statuses: TaskStatus[] };
}
export interface TaskStep { id: string; title: string; position: number; doneAt: string | null; doneById: number | null }
export interface TaskEvent { id: string; type: string; actorId: number | null; text: string | null; meta: Record<string, unknown> | null; via: "WEB" | "TELEGRAM" | "SYSTEM"; createdAt: string; actor: TaskPerson | null }
export interface TaskDetail extends TaskCard { description: string | null; lastReturnedAt: string | null; cancelReason: string | null; steps: TaskStep[] }
export interface TaskAccess { isAuthor: boolean; isAssignee: boolean; isWatcher: boolean; isManager: boolean; canView: boolean; canManage: boolean; canWork: boolean }
export interface TaskFilters { due?: "overdue" | "today" | "week"; priority?: TaskPriority[]; authorId?: number[]; assigneeId?: number[]; branchId?: number[]; q?: string }

type Column = { items: TaskCard[]; cursor: string | null; loading: boolean; total?: number };
const emptyColumn = (): Column => ({ items: [], cursor: null, loading: false });
const BOARD_STATUSES: TaskStatus[] = ["NEW", "IN_PROGRESS", "IN_REVIEW", "DONE"];

interface TasksState {
  view: "my" | "created" | "all";
  layout: "board" | "list";
  filters: TaskFilters;
  columns: Record<TaskStatus, Column>;
  openTaskId: string | null;
  setView: (v: "my" | "created" | "all") => void;
  setLayout: (l: "board" | "list") => void;
  setFilters: (f: TaskFilters) => void;
  fetchColumn: (status: TaskStatus, opts?: { more?: boolean }) => Promise<void>;
  fetchBoard: () => Promise<void>;
  refreshTask: (id: string) => Promise<void>;
  patchTask: (card: TaskCard) => void;
  removeTask: (id: string) => void;
  openTask: (id: string | null) => void;
}

function filterParams(f: TaskFilters) {
  return { due: f.due, priority: f.priority?.join(","), authorId: f.authorId?.join(","), assigneeId: f.assigneeId?.join(","), branchId: f.branchId?.join(","), q: f.q || undefined };
}

export const useTasks = create<TasksState>((set, get) => ({
  view: "my", layout: "board", filters: {},
  columns: { NEW: emptyColumn(), IN_PROGRESS: emptyColumn(), IN_REVIEW: emptyColumn(), DONE: emptyColumn(), CANCELLED: emptyColumn() },
  openTaskId: null,
  setView: (view) => set({ view }),
  setLayout: (layout) => set({ layout }),
  setFilters: (filters) => set({ filters }),

  fetchColumn: async (status, opts) => {
    const { view, filters, columns } = get();
    const col = columns[status];
    if (col.loading) return;
    set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: true } } }));
    try {
      const { data } = await api.get<{ data: TaskCard[]; nextCursor: string | null }>("/tasks", {
        params: { view, status, limit: 50, cursor: opts?.more ? col.cursor ?? undefined : undefined, ...filterParams(filters) },
      });
      set((s) => ({ columns: { ...s.columns, [status]: { items: opts?.more ? [...s.columns[status].items, ...data.data] : data.data, cursor: data.nextCursor, loading: false } } }));
    } catch (error) {
      set((s) => ({ columns: { ...s.columns, [status]: { ...s.columns[status], loading: false } } }));
      toast.error(getErrorMessage(error, "Topshiriqlarni yuklashda xatolik"));
    }
  },
  fetchBoard: async () => { await Promise.all(BOARD_STATUSES.map((s) => get().fetchColumn(s))); },

  refreshTask: async (id) => {
    try {
      const { data } = await api.get<{ task: TaskDetail }>(`/tasks/${id}`);
      get().patchTask(data.task);
    } catch { /* a task we can no longer see: drop it */ get().removeTask(id); }
  },
  patchTask: (card) => set((s) => {
    const columns = { ...s.columns };
    for (const st of Object.keys(columns) as TaskStatus[]) columns[st] = { ...columns[st], items: columns[st].items.filter((t) => t.id !== card.id) };
    if (card.status in columns) columns[card.status] = { ...columns[card.status], items: [card, ...columns[card.status].items] };
    return { columns };
  }),
  removeTask: (id) => set((s) => {
    const columns = { ...s.columns };
    for (const st of Object.keys(columns) as TaskStatus[]) columns[st] = { ...columns[st], items: columns[st].items.filter((t) => t.id !== id) };
    return { columns };
  }),
  openTask: (openTaskId) => set({ openTaskId }),
}));

// Tasks hang off branch-scoped entities and «Barchasi» is branch-filtered.
registerBranchScopedStore(useTasks);
```

- [ ] **Step 6: Counts hook** `hooks/use-task-counts.ts`:
```ts
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useNotifications } from "./use-notifications";
import { useTasks } from "./use-tasks";

export interface TaskCounts { my: number; myOverdue: number; created: number; review: number }
const ZERO: TaskCounts = { my: 0, myOverdue: 0, created: 0, review: 0 };

export function useTaskCounts(): TaskCounts & { refetch: () => void } {
  const { data = ZERO, refetch } = useQuery({
    queryKey: ["tasks", "counts"],
    queryFn: async () => (await api.get<TaskCounts>("/tasks/counts")).data,
    staleTime: 0, refetchInterval: 60_000, refetchOnWindowFocus: true,
  });
  const lastNotificationId = useNotifications((s) => s.notifications[0]?.id);
  const columns = useTasks((s) => s.columns);
  useEffect(() => { void refetch({ cancelRefetch: false }); }, [lastNotificationId, columns, refetch]);
  return { ...data, refetch: () => void refetch() };
}
```

- [ ] **Step 7: Run client tests + typecheck for the touched files**
```bash
cd client && npx vitest run src/components/tasks src/lib/branch-scoped-header.test.ts src/lib/branch-scoped-stores.test.ts
```
Expected: `task-due.test.ts`, `task-href.test.ts` PASS; the two branch tests PASS (store registered; header entries updated). `npx tsc --noEmit` will still fail until Task 12 replaces the components that import the deleted store — that is expected; do not stub them.

- [ ] **Step 8: Commit**
```bash
git add client/src/hooks/use-tasks.ts client/src/hooks/use-task-counts.ts client/src/components/tasks client/src/lib/branch-scoped-header.test.ts client/src/components/app-sidebar.tsx
git rm -q client/src/hooks/use-tasks-board.ts client/src/hooks/use-pending-task-count.ts client/src/components/tasks/task-entity-href.ts client/src/components/tasks/task-entity-href.test.ts
git commit -m "feat(tasks-ui): task store, counts hook, labels and due helpers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: `/tasks` page — tabs, filters, board, list, cards

**Files:**
- Create: `client/src/components/tasks/tasks-page-client.tsx`, `task-board.tsx`, `task-list.tsx`, `task-filters.tsx`
- Rewrite: `client/src/components/tasks/task-column.tsx`, `task-card.tsx`
- Delete: `tasks-board-client.tsx`, `task-kanban-board.tsx`
- Modify: `client/src/app/(dashboard)/tasks/page.tsx` → renders `<TasksPageClient />` inside `<Suspense>`.

**Interfaces:**
- Consumes `useTasks`, `useTaskCounts`, `STATUS_COLUMNS`, `groupByDue`, `formatDue`, `dueState`, `taskEntityHref`.
- Produces `<TaskCard task onOpen compact? />`, `<TaskColumn status items loading cursor onMore collapsed onToggle dragEnabled />`, `<TaskBoard dragEnabled />`, `<TaskList />`, `<TaskFilters />`, `<TasksPageClient />`. The create dialog (Task 13), drawer (Task 14), «Barchasi» table and «Yuklama» (Task 15) mount into slots this page reserves: `<TaskCreateDialog />`, `<TaskDrawer />`, `view === 'all' && <TaskAllTable />`, `view === 'workload' && <TaskWorkload />`. Until those tasks land, import placeholders are NOT created — Task 12 renders only `my`/`created` and commits with the other two tabs calling `null` components defined inline as `const TaskAllTable = () => null;` at the bottom of `tasks-page-client.tsx` (removed in Task 15).

- [ ] **Step 1: `task-card.tsx`** (board and list share it):
```tsx
"use client";
import { useDraggable } from "@dnd-kit/core";
import { Bot, CalendarClock, Camera, CheckSquare, Eye, EyeOff, Link2, MessageSquare, Repeat } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import { useTasks, type TaskCard as TaskCardData, type TaskPerson } from "@/hooks/use-tasks";
import { cn } from "@/lib/utils";
import { KIND_LABEL, PRIORITY_CLASS, PRIORITY_LABEL } from "./task-labels";
import { dueState, formatDue } from "./task-due";

const initials = (p: TaskPerson) => `${p.firstName.charAt(0)}${p.lastName.charAt(0)}`;

function Person({ p, className }: { p: TaskPerson; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar className={cn("size-5 border-2 border-card", className)}>
          {p.photo && <AvatarImage src={p.photo} alt={p.firstName} />}
          <AvatarFallback className="text-[8px]">{initials(p)}</AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent>{p.firstName} {p.lastName}{p.seenAt === null ? " — hali ko'rmadi" : ""}</TooltipContent>
    </Tooltip>
  );
}

export function DueBadge({ dueAt, closedAt }: { dueAt: string | null; closedAt: string | null }) {
  if (!dueAt) return null;
  const now = new Date();
  const state = closedAt ? "later" : dueState(dueAt, now);
  const cls = state === "overdue" ? "text-red-700 dark:text-red-400 font-medium" : state === "today" ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", cls)}>
      <CalendarClock className="size-3" />
      {state === "overdue" ? `Muddati o'tdi · ${formatDue(dueAt, now)}` : formatDue(dueAt, now)}
    </span>
  );
}

interface Props { task: TaskCardData; dragEnabled: boolean; isOverlay?: boolean; showAssignees: boolean }

export function TaskCard({ task, dragEnabled, isOverlay, showAssignees }: Props) {
  const openTask = useTasks((s) => s.openTask);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !dragEnabled });
  const style = isOverlay || !transform ? undefined : { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 };
  const isSystem = task.kind !== "MANUAL";
  const unseen = showAssignees && task.assignees.length > 0 && task.assignees.every((a) => a.seenAt === null);

  return (
    <div
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay || !dragEnabled ? {} : { ...listeners, ...attributes })}
      onClick={() => openTask(task.id)}
      className={cn("rounded-lg border bg-card p-3 shadow-sm cursor-pointer space-y-2", dragEnabled && "active:cursor-grabbing", isOverlay && "shadow-lg ring-2 ring-primary/20 rotate-2", task.status === "DONE" && "opacity-80")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {isSystem && <span className="inline-flex items-center gap-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background"><Bot className="size-3" />Tizim</span>}
        {isSystem && KIND_LABEL[task.kind] && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{KIND_LABEL[task.kind]}</span>}
        {task.priority !== "MEDIUM" && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", PRIORITY_CLASS[task.priority])}>{PRIORITY_LABEL[task.priority]}</span>}
        {task.requiresPhoto && <span className="inline-flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"><Camera className="size-3" />Rasm bilan</span>}
        {task.batch && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Har biriga alohida · {task.batch.total}</span>}
      </div>
      <p className={cn("text-sm leading-snug line-clamp-3", task.status === "DONE" && "text-muted-foreground")}>{task.title}</p>
      {task.unmarkedLesson?.branchName && <p className="text-[11px] text-muted-foreground">{task.unmarkedLesson.branchName}</p>}
      {task.batch && (
        <div className="space-y-1">
          <div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-emerald-500" style={{ width: `${(100 * task.batch.done) / task.batch.total}%` }} /></div>
          <p className="text-[11px] text-muted-foreground">{task.batch.done}/{task.batch.total} bajardi</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {task.stepsTotal > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="size-3" />{task.stepsDone}/{task.stepsTotal}</span>}
        {task.eventsCount > 1 && <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{task.eventsCount - 1}</span>}
        {task.entityType && <span className="inline-flex items-center gap-1"><Link2 className="size-3" />{task.entityType === "Group" ? "Guruh" : task.entityType === "Student" ? "O'quvchi" : task.entityType === "Lead" ? "Lid" : "Xodim"}</span>}
        <DueBadge dueAt={task.dueAt} closedAt={task.closedAt} />
      </div>
      {task.unmarkedLesson?.status === "PENDING" && (
        <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <UnmarkedLessonPrompt
            lesson={{ groupId: task.unmarkedLesson.groupId, groupName: task.unmarkedLesson.groupName, date: task.unmarkedLesson.date, startTime: task.unmarkedLesson.lessonStartTime, endTime: task.unmarkedLesson.lessonEndTime }}
            info={{ id: task.unmarkedLesson.id, status: task.unmarkedLesson.status, teacherPayExempt: task.unmarkedLesson.teacherPayExempt, lessonStartTime: task.unmarkedLesson.lessonStartTime, lessonEndTime: task.unmarkedLesson.lessonEndTime, claimedBy: null }}
            onAnswered={() => void useTasks.getState().refreshTask(task.id)}
            className="w-full"
          />
        </div>
      )}
      <div className="flex items-center justify-between border-t pt-1.5">
        {task.author ? <span className="truncate text-[11px] text-muted-foreground max-w-32">{task.author.firstName} {task.author.lastName}</span> : <span className="text-[11px] text-muted-foreground">Tizim</span>}
        {showAssignees ? (
          <div className="flex items-center gap-1">
            {unseen ? <EyeOff className="size-3 text-amber-600" /> : <Eye className="size-3 text-muted-foreground" />}
            <div className="flex -space-x-1">{task.assignees.slice(0, 4).map((a) => <Person key={a.id} p={a} />)}</div>
          </div>
        ) : (
          <div className="flex -space-x-1">{task.assignees.slice(0, 3).map((a) => <Person key={a.id} p={a} />)}</div>
        )}
      </div>
    </div>
  );
}
```
(`Repeat` is imported for phase 4; remove it now if lint flags unused imports — it will, so omit it.)

- [ ] **Step 2: `task-column.tsx`** — keep the existing collapsed/expanded structure; props become `{ status: TaskStatus; items: TaskCard[]; loading: boolean; cursor: string | null; onMore: () => void; collapsed; onToggle; dragEnabled: boolean; showAssignees: boolean; doneNote?: boolean }`. Replace `tasks.map(...)` with `items.map((t) => <TaskCard key={t.id} task={t} dragEnabled={dragEnabled} showAssignees={showAssignees} />)`, after the list render `cursor && <Button variant="ghost" size="sm" onClick={onMore} disabled={loading}>Yana</Button>` and for `status === 'DONE'` a footer `<p className="text-[11px] text-muted-foreground text-center">Oxirgi 14 kun</p>`. Column width `w-72 min-w-72`. Label and dot from `STATUS_COLUMNS`.

- [ ] **Step 3: `task-board.tsx`** — adapt the old `task-kanban-board.tsx`: columns from `STATUS_COLUMNS`; items from `useTasks((s) => s.columns)`; drag allowed only when `dragEnabled` (view `my`); on drop call `api.post(\`/tasks/${id}/status\`, { status })` with the same confirm dialog as before (texts: «Holatni o'zgartirish», `STATUS_LABEL`), then `patchTask(res.data)`; dropping on `DONE` from `my` shows the confirm only for a self task — otherwise toast «Bajardim deb belgilash uchun «Tekshiruvga yuborish» ni bosing» and no request; a system card (`kind !== 'MANUAL'`) dropped anywhere but `IN_PROGRESS` → toast "Bu topshiriqni tizim o'zi yopadi". `IN_REVIEW` column is a drop target only from `my`. Skeleton while every column is loading and empty.

- [ ] **Step 4: `task-list.tsx`**:
```tsx
"use client";
import { useTasks } from "@/hooks/use-tasks";
import { STATUS_LABEL } from "./task-labels";
import { groupByDue } from "./task-due";
import { TaskCard } from "./task-card";
import { cn } from "@/lib/utils";

export function TaskList({ showAssignees }: { showAssignees: boolean }) {
  const columns = useTasks((s) => s.columns);
  const open = [...columns.NEW.items, ...columns.IN_PROGRESS.items].filter((t) => t.status !== "IN_REVIEW");
  const review = columns.IN_REVIEW.items;
  const groups = groupByDue(open, new Date());
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className={cn("text-sm font-semibold", g.key === "overdue" && "text-red-700 dark:text-red-400")}>{g.label} <span className="text-muted-foreground font-normal">{g.items.length}</span></h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((t) => <TaskCard key={t.id} task={t} dragEnabled={false} showAssignees={showAssignees} />)}</div>
        </section>
      ))}
      {review.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-400">{STATUS_LABEL.IN_REVIEW} <span className="text-muted-foreground font-normal">{review.length}</span></h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{review.map((t) => <TaskCard key={t.id} task={t} dragEnabled={false} showAssignees={showAssignees} />)}</div>
        </section>
      )}
      {groups.length === 0 && review.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Ochiq topshiriqlar yo&apos;q</p>}
    </div>
  );
}
```

- [ ] **Step 5: `task-filters.tsx`** — a row with: search `Input` (debounced 300 ms → `setFilters({ ...filters, q })`), `Select` for due (`Hammasi / Muddati o'tgan / Bugun / Shu hafta`), `MultiSelectCombobox` for priority (options from `PRIORITY_LABEL`), and when `view !== 'my'` a `MultiSelectCombobox` for assignee built from `GET /tasks/assignable` (`assignees`, avatar + initials). Every change calls `setFilters` then `fetchBoard()`.

- [ ] **Step 6: `tasks-page-client.tsx`**:
```tsx
"use client";
import { useCallback, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useTasks, type TaskView } from "@/hooks/use-tasks";
import { useTaskCounts } from "@/hooks/use-task-counts";
import { useBranchChange } from "@/hooks/use-branch-change";
import { TaskBoard } from "./task-board";
import { TaskList } from "./task-list";
import { TaskFilters } from "./task-filters";
import { TaskCreateDialog, useTaskCreate } from "./task-create-dialog";
import { TaskDrawer } from "./task-drawer";
import { TaskAllTable } from "./task-all-table";
import { TaskWorkload } from "./task-workload";

const MANAGER_ROLES = [1, 2];

export function TasksPageClient() {
  const user = useAuth((s) => s.user);
  const roleIds = user?.roles.map((r) => r.id) ?? [];
  const isManager = roleIds.some((r) => MANAGER_ROLES.includes(r));
  const { view, layout, setView, setLayout, fetchBoard, openTask, openTaskId } = useTasks();
  const counts = useTaskCounts();
  const openCreate = useTaskCreate((s) => s.open);
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams();
  const urlView = (searchParams.get("tab") ?? "my") as TaskView;
  const urlTask = searchParams.get("task");

  useEffect(() => { if (urlView !== "workload" && urlView !== view) setView(urlView); }, [urlView, view, setView]);
  useEffect(() => { if (urlTask && urlTask !== openTaskId) openTask(urlTask); }, [urlTask, openTaskId, openTask]);
  useEffect(() => { if (urlView !== "workload" && urlView !== "all") void fetchBoard(); }, [view, urlView, fetchBoard]);
  useBranchChange(() => { void fetchBoard(); });

  const setTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "my") params.delete("tab"); else params.set("tab", tab);
    router.replace(`${pathname}${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Topshiriqlar</h1>
        <Button onClick={() => openCreate({})}><Plus className="mr-1 size-4" />Yangi topshiriq</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={urlView} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="my">Menga berilgan <span className="ml-1 text-muted-foreground">{counts.my}</span></TabsTrigger>
            <TabsTrigger value="created">Men bergan <span className="ml-1 text-muted-foreground">{counts.created}</span></TabsTrigger>
            {isManager && <TabsTrigger value="all">Barchasi</TabsTrigger>}
            {isManager && <TabsTrigger value="workload">Yuklama</TabsTrigger>}
          </TabsList>
        </Tabs>
        {(urlView === "my" || urlView === "created") && (
          <Tabs value={layout} onValueChange={(v) => setLayout(v as "board" | "list")}>
            <TabsList><TabsTrigger value="board"><LayoutGrid className="size-4" /><span className="ml-1 hidden sm:inline">Doska</span></TabsTrigger><TabsTrigger value="list"><List className="size-4" /><span className="ml-1 hidden sm:inline">Ro&apos;yxat</span></TabsTrigger></TabsList>
          </Tabs>
        )}
      </div>
      {(urlView === "my" || urlView === "created") && <TaskFilters />}
      {urlView === "my" && (layout === "board" ? <TaskBoard dragEnabled showAssignees={false} /> : <TaskList showAssignees={false} />)}
      {urlView === "created" && (layout === "board" ? <TaskBoard dragEnabled={false} showAssignees /> : <TaskList showAssignees />)}
      {urlView === "all" && isManager && <TaskAllTable />}
      {urlView === "workload" && isManager && <TaskWorkload />}
      <TaskCreateDialog />
      <TaskDrawer onClose={() => { const p = new URLSearchParams(searchParams.toString()); p.delete("task"); router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false }); }} />
    </div>
  );
}
```
For this task's commit, `task-create-dialog.tsx`, `task-drawer.tsx`, `task-all-table.tsx`, `task-workload.tsx` do not exist yet: create each as a one-line stub that exports the named component returning `null` (`useTaskCreate` as a zustand store with `{ open: (ctx: object) => void }`), and replace them in Tasks 13–15. On the phone (`useIsMobile`) default `layout` to `list` (set in `useEffect` once).

- [ ] **Step 7: Typecheck and lint the client**
```bash
cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -20
```
Expected: 0 errors.

- [ ] **Step 8: Commit**
```bash
git add client/src
git commit -m "feat(tasks-ui): /tasks page with board, list, filters and tabs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Create dialog (quick + «Batafsil»), assignee picker, header «+ Topshiriq»

**Files:**
- Create: `client/src/components/tasks/task-create-dialog.tsx` (replaces the stub), `client/src/components/tasks/task-assignee-picker.tsx`, `client/src/components/tasks/header-task-button.tsx`
- Modify: `client/src/components/dashboard-header.tsx:70-74` — insert `<HeaderTaskButton />` before `<TashkentClock />`; `client/src/lib/branch-scoped-header.test.ts` — add `"components/tasks/header-task-button.tsx": "Opens the create dialog only; the dialog's assignable list is keyed on the person's own ladder, not the branch."` and `"components/tasks/task-create-dialog.tsx": "Posts a task; the branch travels in the X-Branch-Id header the api client already adds."`

**Interfaces:**
- Produces: `useTaskCreate` zustand store `{ isOpen, context: { entityType?, entityId?, entityLabel? }, open(ctx), close() }`; `<TaskCreateDialog />` (mounted once in `tasks-page-client.tsx` and once in `HeaderTaskButton`, guarded by a module flag so only one instance renders); `<TaskAssigneePicker value onChange mode='assignees'|'watchers' />` reading `GET /tasks/assignable` (cached via react-query key `['tasks','assignable']`, `staleTime: 5 min`).
- Consumes: `useTasks().fetchBoard`, `useTaskCounts().refetch`, `DatePicker`, `TimePicker`, `tashkentInstantOn`-style builder.

- [ ] **Step 1: Picker** `task-assignee-picker.tsx`:
```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { Send, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import api from "@/lib/api";

export interface AssignableUser { id: number; firstName: string; lastName: string; photo: string | null; roleNames: string[]; branchNames: string[]; telegramLinked: boolean }
const ROLE_ORDER = ["CEO", "Branch Director", "Administrator", "Cashier", "Teacher"];
const ROLE_LABEL: Record<string, string> = { CEO: "Rahbar", "Branch Director": "Filial direktori", Administrator: "Administrator", Cashier: "Kassir", Teacher: "Ustoz" };

export function useAssignable() {
  return useQuery({ queryKey: ["tasks", "assignable"], queryFn: async () => (await api.get<{ assignees: AssignableUser[]; watchers: AssignableUser[] }>("/tasks/assignable")).data, staleTime: 5 * 60_000 });
}

export function TaskAssigneePicker({ value, onChange, mode, placeholder }: { value: number[]; onChange: (ids: number[]) => void; mode: "assignees" | "watchers"; placeholder: string }) {
  const { data, isLoading } = useAssignable();
  const [q, setQ] = useState("");
  const users = (data?.[mode] ?? []).filter((u) => `${u.firstName} ${u.lastName}`.toLowerCase().includes(q.toLowerCase()));
  const selected = (data?.[mode] ?? []).filter((u) => value.includes(u.id));
  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const groups = ROLE_ORDER.map((r) => ({ role: r, items: users.filter((u) => u.roleNames.includes(r) && ROLE_ORDER.indexOf(r) === Math.min(...u.roleNames.map((n) => ROLE_ORDER.indexOf(n)).filter((i) => i >= 0))) })).filter((g) => g.items.length);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-left text-sm">
          {selected.map((u) => (
            <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-0.5 pr-2 text-xs">
              <Avatar className="size-5">{u.photo && <AvatarImage src={u.photo} />}<AvatarFallback className="text-[8px]">{u.firstName[0]}{u.lastName[0]}</AvatarFallback></Avatar>
              {u.firstName} {u.lastName}
              <X className="size-3" onClick={(e) => { e.stopPropagation(); toggle(u.id); }} />
            </span>
          ))}
          {selected.length === 0 && <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <Input autoFocus placeholder="Ism yozing" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 h-8" />
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {isLoading && <p className="p-2 text-xs text-muted-foreground">Yuklanmoqda…</p>}
          {groups.map((g) => (
            <div key={g.role}>
              <p className="px-2 pb-1 text-[11px] font-semibold text-muted-foreground">{ROLE_LABEL[g.role]}</p>
              {g.items.map((u) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)} className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${value.includes(u.id) ? "bg-primary/10" : ""}`}>
                  <Avatar className="size-6">{u.photo && <AvatarImage src={u.photo} />}<AvatarFallback className="text-[9px]">{u.firstName[0]}{u.lastName[0]}</AvatarFallback></Avatar>
                  <span className="flex-1 truncate">{u.firstName} {u.lastName}</span>
                  {!u.telegramLinked && <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Telegram ulanmagan</span>}
                  <span className="text-[11px] text-muted-foreground">{u.branchNames[0] ?? ""}</span>
                </button>
              ))}
            </div>
          ))}
          {!isLoading && groups.length === 0 && <p className="p-2 text-xs text-muted-foreground">Hech kim topilmadi</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```
(`Send`/`Button` unused → drop them.)

- [ ] **Step 2: Dialog** `task-create-dialog.tsx`:
```tsx
"use client";
import { useState } from "react";
import { create } from "zustand";
import toast from "react-hot-toast";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskPriority } from "@/hooks/use-tasks";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { PRIORITY_LABEL } from "./task-labels";

export interface TaskCreateContext { entityType?: string; entityId?: string; entityLabel?: string }
interface CreateState { isOpen: boolean; context: TaskCreateContext; open: (ctx: TaskCreateContext) => void; close: () => void }
export const useTaskCreate = create<CreateState>((set) => ({ isOpen: false, context: {}, open: (context) => set({ isOpen: true, context }), close: () => set({ isOpen: false }) }));

/** ISO instant for a picked day + "HH:mm" in Tashkent (the picker returns local midnight). */
export function tashkentDateTime(day: Date, time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), h - 5, m)).toISOString();
}

const PRIORITIES: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function TaskCreateDialog() {
  const { isOpen, context, close } = useTaskCreate();
  const fetchBoard = useTasks((s) => s.fetchBoard);
  const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]); const [watcherIds, setWatcherIds] = useState<number[]>([]);
  const [day, setDay] = useState<Date | undefined>(); const [time, setTime] = useState("18:00");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM"); const [separate, setSeparate] = useState(false);
  const [steps, setSteps] = useState<string[]>([]); const [more, setMore] = useState(false); const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setDescription(""); setAssigneeIds([]); setWatcherIds([]); setDay(undefined); setTime("18:00"); setPriority("MEDIUM"); setSeparate(false); setSteps([]); setMore(false); };
  const submit = async () => {
    if (!title.trim() || assigneeIds.length === 0 || saving) return;
    setSaving(true);
    try {
      await api.post("/tasks", {
        title: title.trim(), description: description.trim() || undefined, assigneeIds, watcherIds: watcherIds.length ? watcherIds : undefined,
        dueAt: day ? tashkentDateTime(day, time) : undefined, priority, entityType: context.entityType, entityId: context.entityId,
        separateCopies: separate && assigneeIds.length > 1 ? true : undefined, steps: steps.filter((s) => s.trim()).map((s) => ({ title: s.trim() })),
      });
      toast.success("Topshiriq berildi");
      reset(); close(); void fetchBoard();
    } catch (err) { toast.error(getErrorMessage(err, "Topshiriq berishda xatolik")); } finally { setSaving(false); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => { if (!o) { reset(); close(); } }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Yangi topshiriq</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Input autoFocus placeholder="Nima qilish kerak?" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className="h-11 text-base" onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }} />
          <div className="space-y-1.5"><Label>Ijrochi</Label><TaskAssigneePicker value={assigneeIds} onChange={setAssigneeIds} mode="assignees" placeholder="Ism yozing" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Muddat</Label><div className="flex gap-2"><DatePicker value={day} onChange={setDay} disabledDaysOfWeek={[0]} placeholder="Sana" className="flex-1" /><TimePicker value={time} onChange={setTime} minTime="08:00" maxTime="22:00" className="w-28" /></div></div>
            <div className="space-y-1.5"><Label>Muhimlik</Label><div className="flex rounded-md border">{PRIORITIES.map((p) => <button key={p} type="button" onClick={() => setPriority(p)} className={`flex-1 px-2 py-1.5 text-xs ${priority === p ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground"}`}>{PRIORITY_LABEL[p]}</button>)}</div></div>
          </div>
          {context.entityLabel && <p className="text-xs text-muted-foreground">Bog&apos;liq: <span className="font-medium text-foreground">{context.entityLabel}</span></p>}
          {assigneeIds.length > 1 && <label className="flex items-start gap-2 text-sm"><Checkbox checked={separate} onCheckedChange={(v) => setSeparate(v === true)} className="mt-0.5" /><span>Har biriga alohida<span className="block text-xs text-muted-foreground">Har bir ijrochiga o&apos;z nusxasi yaratiladi va holati alohida yuradi</span></span></label>}
          {more && (
            <div className="space-y-4 border-t pt-4">
              <div className="space-y-1.5"><Label>Tavsif</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={5000} /></div>
              <div className="space-y-1.5"><Label>Kichik qadamlar</Label>
                {steps.map((s, i) => <div key={i} className="flex gap-2"><Input value={s} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))} maxLength={200} /><Button type="button" variant="ghost" size="icon" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><X className="size-4" /></Button></div>)}
                <Button type="button" variant="ghost" size="sm" onClick={() => setSteps([...steps, ""])}><Plus className="mr-1 size-3" />Qadam qo&apos;shish</Button>
              </div>
              <div className="space-y-1.5"><Label>Kuzatuvchi</Label><TaskAssigneePicker value={watcherIds} onChange={setWatcherIds} mode="watchers" placeholder="Ixtiyoriy" /></div>
            </div>
          )}
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={() => setMore(!more)}>{more ? <>Qisqa ko&apos;rinish<ChevronUp className="ml-1 size-4" /></> : <>Batafsil<ChevronDown className="ml-1 size-4" /></>}</Button>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => { reset(); close(); }}>Bekor qilish</Button><Button type="button" onClick={() => void submit()} disabled={!title.trim() || assigneeIds.length === 0 || saving}>{saving ? "…" : "Berish"}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
Files and «Rasm bilan tasdiqlansin» are deliberately absent (phase 3). The dialog is mounted ONCE, in `DashboardHeader` via `HeaderTaskButton`; remove the `<TaskCreateDialog />` line from `tasks-page-client.tsx` (the header is on every dashboard page).

- [ ] **Step 3: Header button** `header-task-button.tsx`:
```tsx
"use client";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { TaskCreateDialog, useTaskCreate } from "./task-create-dialog";
import { useEntityContext } from "./entity-context";

export function HeaderTaskButton() {
  const user = useAuth((s) => s.user);
  const open = useTaskCreate((s) => s.open);
  const ctx = useEntityContext((s) => s.context);
  const pathname = usePathname();
  if (!user) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1 px-2" onClick={() => open(ctx?.pathname === pathname ? ctx : {})}>
        <Plus className="size-4" /><span className="hidden sm:inline">Topshiriq</span>
      </Button>
      <TaskCreateDialog />
    </>
  );
}
```
Create `client/src/components/tasks/entity-context.ts`: a tiny zustand store `{ context: (TaskCreateContext & { pathname: string }) | null; set(ctx); clear() }`. Entity pages publish themselves in Task 16 (`useEffect(() => { set({ entityType: 'Student', entityId: String(id), entityLabel: name, pathname }); return clear; }, [...])`), so the header button pre-fills the link while that page is open.

- [ ] **Step 4: Typecheck + lint + branch-header test**
```bash
cd client && npx tsc --noEmit && npx vitest run src/lib/branch-scoped-header.test.ts && npm run lint 2>&1 | tail -5
```
Expected: all green (the header test requires the two new entries from this task's file list).

- [ ] **Step 5: Commit**
```bash
git add client/src
git commit -m "feat(tasks-ui): create dialog, assignee picker and header «+ Topshiriq»

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Task drawer — properties, status actions, review, steps, feed, composer

**Files:**
- Create: `client/src/components/tasks/task-drawer.tsx` (replaces stub), `task-drawer-steps.tsx`, `task-drawer-feed.tsx`
- Modify: `client/src/hooks/use-tasks.ts` — add `detail: { task: TaskDetail; events: TaskEvent[]; access: TaskAccess; batch: TaskCard[] } | null`, `loadDetail(id)`, `applyDetail(d)`.

**Interfaces:**
- Consumes `GET /tasks/:id`, `POST /tasks/:id/status|review|cancel|duplicate|seen|steps|events`, `PATCH /tasks/:id/steps/:stepId`, `DELETE …`, `PUT /tasks/:id/participants`, `PATCH /tasks/:id`.
- Produces `<TaskDrawer onClose />` reading `useTasks().openTaskId`; after every write it `patchTask(detail)` so the board updates without a refetch.

- [ ] **Step 1: Store additions** (in `use-tasks.ts`):
```ts
  detail: null as null | { task: TaskDetail; events: TaskEvent[]; access: TaskAccess; batch: TaskCard[] },
  loadDetail: async (id: string) => {
    try {
      const { data } = await api.get(`/tasks/${id}`);
      set({ detail: data });
      void api.post(`/tasks/${id}/seen`).catch(() => {});
    } catch (error) {
      set({ detail: null, openTaskId: null });
      toast.error(getErrorMessage(error, "Topshiriq topilmadi"));
    }
  },
  applyDetail: (task: TaskDetail) => { set((s) => ({ detail: s.detail ? { ...s.detail, task } : s.detail })); get().patchTask(task); },
```
and `openTask` becomes `(id) => { set({ openTaskId: id, detail: null }); if (id) void get().loadDetail(id); }`.

- [ ] **Step 2: Steps** `task-drawer-steps.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTasks, type TaskAccess, type TaskDetail } from "@/hooks/use-tasks";

export function TaskDrawerSteps({ task, access }: { task: TaskDetail; access: TaskAccess }) {
  const applyDetail = useTasks((s) => s.applyDetail);
  const [draft, setDraft] = useState<string | null>(null);
  const done = task.steps.filter((s) => s.doneAt).length;
  const call = async (p: Promise<{ data: TaskDetail }>) => { try { applyDetail((await p).data); } catch (e) { toast.error(getErrorMessage(e, "Xatolik")); } };
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold">Kichik qadamlar <span className="font-normal text-muted-foreground">{done}/{task.steps.length}</span></h4>
      {task.steps.length > 0 && <div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-emerald-500" style={{ width: `${task.steps.length ? (100 * done) / task.steps.length : 0}%` }} /></div>}
      <ul className="space-y-1.5">
        {task.steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!s.doneAt} disabled={!access.canWork} onCheckedChange={(v) => void call(api.patch(`/tasks/${task.id}/steps/${s.id}`, { done: v === true }))} />
            <span className={s.doneAt ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{s.title}</span>
            {access.canManage && <Button variant="ghost" size="icon-xs" onClick={() => void call(api.delete(`/tasks/${task.id}/steps/${s.id}`))}><Trash2 className="size-3.5" /></Button>}
          </li>
        ))}
      </ul>
      {access.canWork && (draft === null
        ? <Button variant="ghost" size="sm" onClick={() => setDraft("")}><Plus className="mr-1 size-3" />Qadam qo&apos;shish</Button>
        : <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { void call(api.post(`/tasks/${task.id}/steps`, { title: draft.trim() })); setDraft(null); } }}>
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={200} className="h-8" placeholder="Qadam nomi" onKeyDown={(e) => { if (e.key === "Escape") setDraft(null); }} />
            <Button type="submit" size="sm" className="h-8">Qo&apos;shish</Button>
          </form>)}
    </section>
  );
}
```

- [ ] **Step 3: Feed** `task-drawer-feed.tsx` — renders `events` ascending: `COMMENT` → avatar + name + time + text bubble; every other type → one grey line from `meta`: `CREATED` «berdi», `STATUS` «holatni {STATUS_LABEL[meta.to]} qildi», `RETURN` «qaytardi: «{text}»», `STEP` «{meta.title} qadamini belgiladi/belgini oldi/qo'shdi», `ASSIGNEE` «ijrochilarni o'zgartirdi», `CANCELLED` «bekor qildi», `AUTO_CLOSED` «Tizim yopdi (darsga javob berildi)», `REASSIGNED` «ishdan ketgani uchun topshiriq o'tkazildi». Actor name `Tizim` when `actorId === null`; suffix «· Telegram orqali» when `via === 'TELEGRAM'`. Time via `date-fns` `format(new Date(createdAt), "dd.MM, HH:mm")`. Below: composer `Textarea` + «Yuborish» → `POST /tasks/:id/events` then append the returned event to `detail.events` (`set` in store: add `appendEvent(ev)`).

- [ ] **Step 4: Drawer** `task-drawer.tsx` — a `Sheet` (`side="right"`, `className="flex w-full flex-col overflow-hidden p-0 sm:max-w-lg"`) open when `openTaskId !== null`:
  - Top bar: status pill (`STATUS_LABEL`), «Tizim» badge for system tasks, overflow menu (`DropdownMenu`) with «Nusxa olish» (`POST duplicate` → toast + `fetchBoard`), «Bekor qilish» (manager only; `AlertDialog` with optional reason → `POST cancel`), close.
  - Title (editable inline by manager: click → `Input`, blur/Enter → `PATCH {title}`).
  - For a system task: a grey callout «Bu topshiriqni tizim berdi. … o'zi yopiladi.» and, for `LESSON_QUESTION` with `unmarkedLesson.status === 'PENDING'`, the same `UnmarkedLessonPrompt` block as the card.
  - Properties `dl`: Beruvchi, Ijrochi(lar) (manager: «O'zgartirish» opens the `TaskAssigneePicker` in a popover → `PUT participants`), Kuzatuvchi, Muddat (manager: DatePicker+TimePicker popover → `PATCH {dueAt}`; «Olib tashlash» → `dueAt: null`), Muhimlik (manager: 4 buttons → `PATCH {priority}`), Bog'liq (link via `taskEntityHref`), Qaytarilgan `returnedCount` × when > 0.
  - Description (manager edits inline, `Textarea`, blur → `PATCH`).
  - `<TaskDrawerSteps />`, then `<TaskDrawerFeed />`.
  - Footer (sticky): by `access` and `status`:
    - assignee & `NEW` → «Boshladim» (`status: IN_PROGRESS`) + «Bajardim»;
    - assignee & `IN_PROGRESS` → «Bajardim»; «Bajardim» posts `status: DONE` when `task.author?.id === me && assignees.length === 1 && assignees[0].id === me`, else `IN_REVIEW`; if `stepsDone < stepsTotal` show an `AlertDialog` «N ta qadam belgilanmagan — baribir yuborasizmi?» first;
    - manager & `IN_REVIEW` → «Qabul qilish» (`review ACCEPT`) + «Qaytarish» (`AlertDialog` with required `Textarea` reason → `review RETURN`);
    - system task & assignee & `NEW` → only «Boshladim».
  - Every write: `applyDetail(res.data)`; errors → `toast.error(getErrorMessage(...))`. On close: `openTask(null)` + `onClose()`.
  - `batch.length > 1` (author view of separate copies): a «Nusxalar» list — each copy's assignee + status pill, click → `openTask(copy.id)`.

- [ ] **Step 5: Typecheck + lint**
```bash
cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5
```

- [ ] **Step 6: Commit**
```bash
git add client/src
git commit -m "feat(tasks-ui): task drawer with status, review, steps and discussion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: «Barchasi» table and «Yuklama»

**Files:**
- Create: `client/src/components/tasks/task-all-table.tsx`, `client/src/components/tasks/task-workload.tsx` (replace stubs)

- [ ] **Step 1: `task-all-table.tsx`** — state: `filters` (own `useState`, not the board store), `rows`, `cursor`, `loading`. Loads `GET /tasks?view=all&limit=50&…filters` (status default all open: `status=NEW,IN_PROGRESS,IN_REVIEW`; a «Yopilganlar» toggle adds `DONE,CANCELLED` with `closedDays=30`). Top: four metric tiles from a second request `GET /tasks?view=all&status=…&limit=1` is NOT used; instead compute from the loaded rows for the open set (ochiq / muddati o'tgan / tekshiruvda) and show «Bugun yopildi» from rows with `closedAt` today — document the approximation in a one-line comment. Filters row: branch (`MultiSelectCombobox` of the switcher's `branches`), ijrochi, beruvchi (from `/tasks/assignable`), holat, muddat, qidiruv. `Table` columns: Topshiriq (title + entity label; `Tizim` badge), Ijrochi (names or «N xodim · k/N bajardi» for batches), Beruvchi, Filial (name from the switcher list by `branchId`), Muddat (`DueBadge`), Holat (pill). Row click → `openTask(id)`. «Keyingi» loads `cursor`. `useBranchChange` → reload.

- [ ] **Step 2: `task-workload.tsx`** — `useQuery(['tasks','workload', month, branchId])` → `GET /tasks/workload`. Header: `MonthPicker` (`components/ui/month-picker.tsx`) and branch select. Tiles: Ochiq, Muddati o'tgan (red), Shu oy bajarildi, O'z vaqtida (company-wide `Math.round(100*ΣonTime/ΣwithDue)` — the server returns per-row percentages only, so show the mean of rows weighted by `doneThisMonth`; document it). Table: Xodim (avatar, name, role · branch), Ochiq, Muddati o'tgan, Shu oy bajardi, O'z vaqtida (progress bar + %; «—» when null). Row click → `router.push('/tasks?tab=all&assignee=<id>')` and `TaskAllTable` reads `assignee` from the URL once into its filter. Footer text: «O'z vaqtida» — shu oy yopilgan topshiriqlardan muddatigacha yopilganlarining ulushi.

- [ ] **Step 3: Remove the inline stubs** from `tasks-page-client.tsx`; typecheck + lint; commit.
```bash
cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5
git add client/src && git commit -m "feat(tasks-ui): «Barchasi» table and «Yuklama» view for managers

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Entity «Topshiriqlar» panel; comment task mode removed from the UI

**Files:**
- Create: `client/src/components/tasks/entity-tasks-panel.tsx`
- Modify: `components/students/student-profile-tabs.tsx` (add a `<EntityTasksPanel entityType="Student" entityId={String(student.id)} entityLabel={`${student.firstName} ${student.lastName}`} />` above the Izohlar tab content — inside the `guruhlar` tab's top for visibility, per mockup 11: place it in the `TabsContent value="guruhlar"` as the first block, `canManage` only), `groups/group-detail-tabs.tsx` (same, `canManage`, first block of the default tab), `teachers/teacher-profile-tabs.tsx` and `settings/employee-profile-tabs.tsx` (first block of the default tab, roles 1–3), `leads/lead-detail-drawer.tsx` (first block of the `izohlar` tab content, above `CommentForm`).
- Modify (strip task mode): `shared/comment-form.tsx` — delete `isTask`, `assigneeIds`, `dueDate`, `priority`, `assignableUsers`, `canAssignTask`, the `/users` fetch, the toolbar switch, the task options, the assignee chips; payload becomes `{ entityType, entityId, content }`. `shared/comment-item.tsx` — delete the `isTask` badge (102–113), assignee chips (196–203), action buttons (205–231), `onAssigneeStatus` prop. `shared/comment-list.tsx` — delete `handleAssigneeStatus` and the prop. `shared/comment-list-helpers.tsx` — delete `CommentAssignee`, `AssigneeChip`; `CommentData` loses `isTask`, `assignees`.
- Modify (latest-comment badge): `students/student-profile-card.tsx:116-121,438-443`, `groups/group-info-card.tsx:83-88,248-255`, `settings/employee-profile-card.tsx:64-69,241-246`, `settings/employee-profile-client.tsx:118-123,164-173`, `shared/mobile-profile-header.tsx:57-62,205-210`, `leads/lead-card.tsx:99-103`, `hooks/use-lead-activity.ts:19` — remove every `isTask` field and the «Topshiriq»/«Vazifa» badge.
- Each entity page also publishes its context for the header button (Task 13): in the page client (e.g. `student-profile-client.tsx`) add `const setCtx = useEntityContext((s) => s.set); const clearCtx = useEntityContext((s) => s.clear); useEffect(() => { setCtx({ entityType: 'Student', entityId: String(student.id), entityLabel: name, pathname }); return clearCtx; }, [student.id, name, pathname, setCtx, clearCtx]);`. Same for group page, teacher/employee pages, and the lead drawer (context while open).

- [ ] **Step 1: Panel** `entity-tasks-panel.tsx`:
```tsx
"use client";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { useTasks, type TaskCard } from "@/hooks/use-tasks";
import { useTaskCreate } from "./task-create-dialog";
import { STATUS_LABEL } from "./task-labels";
import { DueBadge } from "./task-card";
import { TaskDrawer } from "./task-drawer";

export function EntityTasksPanel({ entityType, entityId, entityLabel }: { entityType: string; entityId: string; entityLabel: string }) {
  const [open, setOpen] = useState<TaskCard[]>([]); const [closedCount, setClosedCount] = useState(0); const [showClosed, setShowClosed] = useState(false); const [closed, setClosed] = useState<TaskCard[]>([]);
  const openCreate = useTaskCreate((s) => s.open); const openTask = useTasks((s) => s.openTask); const columns = useTasks((s) => s.columns);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [o, c] = await Promise.all([
        api.get<{ data: TaskCard[] }>("/tasks", { params: { view: "all", entityType, entityId, status: "NEW,IN_PROGRESS,IN_REVIEW", limit: 20 } }).catch(() => api.get<{ data: TaskCard[] }>("/tasks", { params: { view: "my", entityType, entityId, status: "NEW,IN_PROGRESS,IN_REVIEW", limit: 20 } })),
        api.get<{ data: TaskCard[] }>("/tasks", { params: { view: "created", entityType, entityId, status: "DONE,CANCELLED", closedDays: 365, limit: 20 } }).catch(() => ({ data: { data: [] } })),
      ]);
      if (!alive) return;
      setOpen(o.data.data); setClosed(c.data.data); setClosedCount(c.data.data.length);
    })();
    return () => { alive = false; };
  }, [entityType, entityId, columns]);
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Topshiriqlar <span className="font-normal text-muted-foreground">{open.length} ochiq</span></h3>
        <Button size="sm" variant="outline" className="h-7" onClick={() => openCreate({ entityType, entityId, entityLabel })}><Plus className="mr-1 size-3" />Topshiriq</Button>
      </div>
      {open.length === 0 && <p className="text-xs text-muted-foreground">Ochiq topshiriq yo&apos;q</p>}
      {open.map((t) => (
        <button key={t.id} type="button" onClick={() => openTask(t.id)} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-t py-2 text-left text-sm first:border-t-0">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{STATUS_LABEL[t.status]}</span>
          <span className="min-w-0"><span className="block truncate font-medium">{t.title}</span><span className="block text-[11px] text-muted-foreground">{t.kind !== "MANUAL" ? "Tizim · " : ""}{t.assignees.map((a) => `${a.firstName} ${a.lastName[0]}.`).join(", ")}</span></span>
          <DueBadge dueAt={t.dueAt} closedAt={t.closedAt} />
        </button>
      ))}
      {closedCount > 0 && <button type="button" className="text-xs text-primary" onClick={() => setShowClosed(!showClosed)}>{showClosed ? "Yopilganlarni yashirish" : `Yopilganlar (${closedCount})`}</button>}
      {showClosed && closed.map((t) => <button key={t.id} type="button" onClick={() => openTask(t.id)} className="block w-full truncate border-t py-1.5 text-left text-xs text-muted-foreground">{STATUS_LABEL[t.status]} · {t.title}</button>)}
      <TaskDrawer onClose={() => {}} />
    </div>
  );
}
```
A non-manager gets `view=all` refused (403 toast from the interceptor is noisy): use `view: isManager ? 'all' : 'my'` from `useAuth` roles instead of catch-fallback — replace the `.catch` with that branch. `TaskDrawer` must be idempotent when mounted twice (page + panel): guard with the same module flag pattern as the create dialog (first mount wins).

- [ ] **Step 2: Apply the comment-mode and badge removals** listed in Files. `grep -rn "isTask\|assignee-status\|assigneeIds" client/src` must return nothing afterwards.

- [ ] **Step 3: Typecheck, lint, tests; commit**
```bash
cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run
git add client/src && git commit -m "feat(tasks-ui): entity task panels; comment form loses its task mode

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Notifications on the client — href, types, SSE `task.updated`

**Files:**
- Modify: `client/src/components/notifications/notification-href.ts` (+ `.test.ts`), `client/src/hooks/use-notifications.ts`, `client/src/hooks/use-sse.ts`, `client/src/components/notifications/notification-bell.tsx:25-30` (icons for `TASK_REVIEW`, `TASK_OVERDUE`, `TASK_REMINDER`, `TASK_UPDATED`, `TASK_DELETED` — `CheckSquare`, `AlarmClock`, `Clock`, `MessageSquare`, `XCircle`).

- [ ] **Step 1: Failing href test** — add to `notification-href.test.ts`:
```ts
it("a task notification opens the task drawer", () => {
  expect(notificationHref({ type: "TASK_ASSIGNED", relatedEntityType: "Task", relatedEntityId: "t1" }, [4])).toBe("/tasks?task=t1");
  expect(notificationHref({ type: "TASK_REVIEW", relatedEntityType: "Task", relatedEntityId: "t1" }, [3])).toBe("/tasks?task=t1");
});
```
- [ ] **Step 2: Implement** — in `notification-href.ts` add `Task: (id) => \`/tasks?task=${id}\`` to `ENTITY_ROUTES` (no role gate: everyone has `/tasks`). In `use-notifications.ts` widen `type` to `string` and add `taskId: string | null`. In `use-sse.ts` after the `notification` branch:
```ts
                if (payload.type === "task.updated" && typeof payload.taskId === "string") {
                  void useTasks.getState().refreshTask(payload.taskId);
                  if (useTasks.getState().openTaskId === payload.taskId) void useTasks.getState().loadDetail(payload.taskId);
                }
```
(import `useTasks` at top; it is a module-level store so no hook rules apply.)

- [ ] **Step 3: Run** `cd client && npx vitest run src/components/notifications && npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**
```bash
git add client/src && git commit -m "feat(tasks-ui): task notifications open the drawer; SSE task.updated refreshes cards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: ADR, docs, full verification

**Files:**
- Create: `docs/adr/0074-topshiriq-alohida-bolim.md` (number = first free after reading `docs/adr/README.md` on `origin/main` at PR time), add its row to `docs/adr/README.md`.
- Modify: `server/CLAUDE.md` «Comments & Task Assignment» section → rewrite as «Tasks (`src/tasks/`)» in English: one-door rule, policy ladder, transitions, outbox, lesson task, the migration script, and that comments no longer carry tasks. `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §12: fill in the number.

- [ ] **Step 1: ADR text** (Uzbek, the repo's ADR format — copy the header layout of `0054-…md`): Kontekst (one paragraph from spec §1), Qaror (spec §3.1–3.2, §5.1 ladder, §7 «tizim yopadi», §9.1 bitta eshik), Oqibatlar (izoh-topshiriq tugadi; 20:00 digestdan `TASK_*` chiqdi — Telegram darhol xabar 2-bosqichda, ADR-B keyin; `CommentAssignee` tozalash PR'ida o'chadi), Holati «Qabul qilindi».

- [ ] **Step 2: Full server verification**
```bash
cd server && npm run typecheck && npx eslint src --quiet && npm test 2>&1 | tail -15 && npm run build 2>&1 | tail -3
```
Expected: 0 type errors, 0 lint errors, all suites pass (note the counts), build OK.

- [ ] **Step 3: Full client verification**
```bash
cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run 2>&1 | tail -8 && npx next build 2>&1 | tail -5
```

- [ ] **Step 4: Browser check** (run skill `run` for the dev servers; `CRONS_ENABLED=false`, blank bot tokens): as Administrator create a task for a teacher from `/tasks`, from the header on a student page (link pre-filled), tick a step, send to review; as the author accept and return; as CEO open «Barchasi» and «Yuklama»; drag a card on «Menga berilgan»; confirm the bell entry opens the drawer; confirm a «Dars bo'ldimi?» card still answers. Record what was checked in the PR body.

- [ ] **Step 5: Commit and PR**
```bash
git add docs server/CLAUDE.md && git commit -m "docs(tasks): ADR for the standalone task module; server CLAUDE.md section

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push -u origin worktree-topshiriqlar-clickup
gh pr create --repo AkhrorSoliev/daf-erp-system --base main --head worktree-topshiriqlar-clickup --title "feat(tasks): standalone task module (phase 1 — asos)" --body-file /dev/stdin <<'EOF'
Spec: docs/superpowers/specs/2026-10-07-topshiriqlar-design.md (phase 1 of 5). Plan: docs/superpowers/plans/2026-10-07-topshiriqlar-1-asos.md.

Deploy order: migration → server → `railway run npx ts-node --transpile-only scripts/migrate-comment-tasks.ts --apply` (outside working hours; dry run first) → Vercel. Until the script runs, /tasks is empty.

Verification: typecheck/lint/tests (server + client), browser pass as Admin/BD/CEO/Teacher.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```
The CEO merges and deploys by hand (memory: merge does not deploy).

---

## Self-review

**Spec coverage (phase-1 row of §11):** tables + migration (T1, T10) · one door + policy (T2, T4–T6, single-source spec T9) · board, list (T12) · create quick + batafsil without files (T13) · drawer: description, steps, discussion, history (T14) · statuses + review (T6, T14) · «Har biriga alohida» (T5, T12 batch card, T14 copies list) · watchers (T5, T13, T14) · Men bergan (T12) · Barchasi, Yuklama (T15) · header «+» with entity context (T13, T16) · entity panels (T16) · sidebar count, search, duplicate (T11, T12, T14) · bell/push instant + outbox INAPP (T8) · departed employee (T9) · «Dars bo'ldimi?» on Task (T9) · old paths removed (T9, T16) · migration script (T10) · ADR (T18). Not in phase 1 by design: Telegram (2), files/photo/voice (3), auto rules beyond the lesson question and recurrence (4), bell rework (5).

**Placeholders:** none — every step carries its code or an exact edit location. Two deliberate stubs (`TaskAllTable`/`TaskWorkload`/`TaskCreateDialog`/`TaskDrawer` one-liners in T12) are replaced in T13–T15 and named as such.

**Type consistency:** `TaskActor` (T5) is consumed by T6/T7; `TASK_EVENTS` + payload types (T4) by T6/T8/T9; `toTaskCard`/`toTaskDetail` (T4) by T5/T6/T11 types; `claimSystemTask` exported from `tasks.service.ts` and re-exported by `tasks/lesson-task.ts` (T6, T9); `TaskOutboxService.schedule(db, task)` signature matches T5/T6/T8; client `TaskCard.batch` optional matches server `collapseBatches` (T5/T11/T12); `useTasks.openTask` sets `detail` (T14) and the header button mounts the one `TaskCreateDialog` (T13, removed from the page in T13 Step 2).

