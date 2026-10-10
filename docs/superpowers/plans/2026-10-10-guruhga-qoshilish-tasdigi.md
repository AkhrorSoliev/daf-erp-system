# Join requests — bot sign-ups wait for an administrator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person who signs up through a bot student link no longer becomes a student at once. The sign-up becomes a request, and an administrator approves or rejects it from a system task.

**Architecture:**
- New module `server/src/student-join-requests/` with the `StudentJoinRequest` table, the service (create / approve / reject / expire), the request view, the bot texts and the controller. The bot scene calls `create` in place of `registerStudentFromTelegram`; approval calls `registerStudentFromTelegram` unchanged except for an actor and an in-transaction hook.
- The administrator's side reuses the task system (ADR-0074/0078): a `JOIN_REQUEST` system task built like «Dars bo'ldimi?». The bell rows close through a new resolver event (ADR-0076).
- Bot messages after a decision go through an event to `JoinRequestNotifier` in `src/telegram/`, so the new module never imports `TelegramModule`.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Telegraf, Jest (server); Next.js + React Query + shadcn/ui + Vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-10-guruhga-qoshilish-tasdigi-design.md` — read §2 (decisions D1–D10) and §9 (texts) before starting.

## Global Constraints

- Work only inside the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi` (branch `feat/guruhga-qoshilish-tasdigi`). Never `cd` into the main checkout.
- Commit messages, new code comments, `server/CLAUDE.md` and `client/CLAUDE.md` text: English. ADRs, guide pages (`client/src/qollanma/`) and every UI or bot string: Uzbek (Latin script).
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server: run `npx prettier --write` on every touched `.ts` file before committing. Client: **never** run prettier.
- Server tests: `cd server && npx jest <path>`. Client tests: `cd client && npx vitest run <path>`.
- Do not run `npm run build` and `npm test` in parallel (the build regenerates the Prisma client under running tests).
- The bot texts of §9 of the spec are approved wording. Copy them exactly as Task 3 writes them.
- A bot sign-up writes nothing but the request until an administrator approves it: no card, no enrollment, no account, no charge, no lead change (spec D2).
- A request is never approved automatically (spec D5).
- **Execution order: 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14.** Task 2 imports `GROUP_CLOSED_REPLY` from Task 3's file.

---

## File map

**Server — create**
- `server/prisma/migrations/20261010200000_student_join_request/migration.sql` — the table, the enum, `TaskKind.JOIN_REQUEST`, and the partial unique index.
- `server/src/groups/shared/enrollable-statuses.ts` (+ `.spec.ts`) — the one list of statuses that take new students.
- `server/src/student-join-requests/join-request-texts.ts` (+ `.spec.ts`) — the bot replies and the four messages.
- `server/src/student-join-requests/join-request-events.ts` — event names and payloads.
- `server/src/student-join-requests/join-request-view.ts` (+ `.spec.ts`) — what the panel reads.
- `server/src/student-join-requests/student-join-requests.service.ts` (+ `.spec.ts`) — create, approve, reject, expire.
- `server/src/student-join-requests/student-join-requests.controller.ts` (+ `.spec.ts`), `dto/approve-join-request.dto.ts`, `dto/reject-join-request.dto.ts`, `student-join-requests.module.ts`.
- `server/src/tasks/join-request-task.ts` (+ `.spec.ts`) — the system task: create and close.
- `server/src/telegram/join-request-notifier.ts` (+ `.spec.ts`) — sends a decision message to the person.
- `server/src/notifications/notification-resolver.join-request.spec.ts`.
- `docs/adr/0080-botdan-qoshilish-sorov-va-tasdiq.md`.

**Server — modify**
- `server/prisma/schema.prisma`.
- `server/src/students/student-enrollment.service.ts`, `server/src/leads/leads.service.ts` — use the shared status list.
- `server/src/telegram/scenes/student-registration-helpers.ts`, `student-registration.scene.ts` (+ spec), `student-registration-flow.ts` (+ spec).
- `server/src/telegram/telegram.service.ts`, `telegram.module.ts`, `registration-link-start.spec.ts`, `telegram-before-scenes.spec.ts`.
- `server/src/notifications/notification-resolver.service.ts`.
- `server/src/telegram-groups/telegram-group-daily-report.service.ts` (+ spec).
- `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts`.
- `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`.

**Client — create**
- `client/src/components/tasks/join-request/join-request-rules.ts` (+ `.test.ts`), `join-request-panel.tsx`.

**Client — modify**
- `client/src/hooks/use-tasks.ts`, `client/src/components/tasks/task-labels.ts`, `client/src/components/tasks/task-drawer.tsx`.
- `client/src/qollanma/kontent/oquvchilar/yangi-oquvchi.mdx`, `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: Setup and data model

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261010200000_student_join_request/migration.sql`

**Interfaces:**
- Produces: Prisma model `StudentJoinRequest` (`prisma.studentJoinRequest`), enum `StudentJoinRequestStatus` (`PENDING | APPROVED | REJECTED | EXPIRED | REPLACED`), `TaskKind.JOIN_REQUEST`.

- [ ] **Step 1: Install dependencies in the worktree**

The worktree has no `node_modules`.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server && npm install
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/client && npm install
```

Expected: both finish without errors.

- [ ] **Step 2: Add `JOIN_REQUEST` to `TaskKind`**

In `server/prisma/schema.prisma`, the enum (around line 166) becomes:

```prisma
enum TaskKind {
  MANUAL
  LESSON_QUESTION
  CALLBACK
  BROKEN_PROMISE
  UNCALLED_LEAD
  JOIN_REQUEST
}
```

- [ ] **Step 3: Append the enum and the model at the end of `schema.prisma`**

```prisma
/// A bot sign-up waiting for an administrator (ADR-0080). Nothing else is
/// written until it is approved: no card, no enrollment, no charge, no lead.
enum StudentJoinRequestStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  REPLACED
}

model StudentJoinRequest {
  id               String                   @id @default(uuid())
  companyId        Int
  branchId         Int
  /// The group the person asked for.
  groupId          String
  /// The Telegram chat that asked. One PENDING row per chat: a partial unique
  /// index written by hand in the migration.
  chatId           String
  telegramUsername String?
  firstName        String
  lastName         String
  /// 9 digits, the sender's own contact.
  phone            String
  /// R2 URL; null once deleted (rejected, expired, replaced).
  photo            String?
  status           StudentJoinRequestStatus @default(PENDING)
  taskId           String?                  @unique
  decidedById      Int?
  decidedAt        DateTime?
  rejectReason     String?
  /// Differs from `groupId` when the administrator chose another group.
  approvedGroupId  String?
  /// The card the approval wrote.
  studentId        Int?
  createdAt        DateTime                 @default(now())

  @@index([status, createdAt])
  @@index([branchId, status])
}
```

- [ ] **Step 4: Write the migration**

Create `server/prisma/migrations/20261010200000_student_join_request/migration.sql`:

```sql
-- Bot sign-ups become requests an administrator approves (ADR-0080; spec
-- 2026-10-10-guruhga-qoshilish-tasdigi §4). Hand-written: the dev database is
-- behind main. The new 'JOIN_REQUEST' value is not used in this migration, so
-- `ALTER TYPE … ADD VALUE` inside the transaction is safe (PostgreSQL 12+).
-- 'PENDING' in the partial index belongs to a type CREATED here, which a
-- transaction may use at once.

-- CreateEnum
CREATE TYPE "StudentJoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REPLACED');

-- AlterEnum
ALTER TYPE "TaskKind" ADD VALUE 'JOIN_REQUEST';

-- CreateTable
CREATE TABLE "StudentJoinRequest" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photo" TEXT,
    "status" "StudentJoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "taskId" TEXT,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "approvedGroupId" TEXT,
    "studentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentJoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentJoinRequest_taskId_key" ON "StudentJoinRequest"("taskId");

-- CreateIndex
CREATE INDEX "StudentJoinRequest_status_createdAt_idx" ON "StudentJoinRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "StudentJoinRequest_branchId_status_idx" ON "StudentJoinRequest"("branchId", "status");

-- One open request per chat (spec D9). Prisma cannot express a partial index.
CREATE UNIQUE INDEX "StudentJoinRequest_chatId_pending_key" ON "StudentJoinRequest"("chatId") WHERE "status" = 'PENDING';
```

- [ ] **Step 5: Generate the client and typecheck**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server && npx prisma generate && npm run typecheck
```

Expected: `prisma generate` prints «Generated Prisma Client»; the typecheck ends with no errors. Adding an enum value can break a `Record<TaskKind, …>`; there is none on the server today, so a failure here is real.

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi
git add server/prisma/schema.prisma server/prisma/migrations/20261010200000_student_join_request/migration.sql
git commit -m "feat(join-requests): StudentJoinRequest table and the JOIN_REQUEST task kind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: One enrollable-status rule; the bot offers live teachers and open groups only

**Files:**
- Create: `server/src/groups/shared/enrollable-statuses.ts`, `server/src/groups/shared/enrollable-statuses.spec.ts`
- Modify: `server/src/students/student-enrollment.service.ts:124-129`, `server/src/leads/leads.service.ts:949-954`
- Modify: `server/src/telegram/scenes/student-registration-helpers.ts` (`loadTeachersForBranch`)
- Modify: `server/src/telegram/scenes/student-registration.scene.ts` (`select_teacher_*`, `select_group_*`)
- Modify: `server/src/telegram/telegram.service.ts` (`startStudentGroupRegistration`)
- Test: `server/src/telegram/registration-link-start.spec.ts`, `server/src/telegram/scenes/student-registration.scene.spec.ts`

**Interfaces:**
- Produces: `ENROLLABLE_GROUP_STATUSES: GroupStatus[]` and `isEnrollableGroupStatus(status: GroupStatus | null | undefined): boolean` from `src/groups/shared/enrollable-statuses.ts`.
- Consumes: `GROUP_CLOSED_REPLY` from Task 3. Do Task 3 first, or import it once Task 3 lands; this task's commit needs it.

- [ ] **Step 1: Write the failing test for the shared rule**

`server/src/groups/shared/enrollable-statuses.spec.ts`:

```ts
import {
  ENROLLABLE_GROUP_STATUSES,
  isEnrollableGroupStatus,
} from './enrollable-statuses';

describe('enrollable group statuses', () => {
  it('takes students in a forming, active or paused group', () => {
    expect(ENROLLABLE_GROUP_STATUSES).toEqual(['ACTIVE', 'FORMING', 'PAUSED']);
    for (const s of ['ACTIVE', 'FORMING', 'PAUSED'] as const) {
      expect(isEnrollableGroupStatus(s)).toBe(true);
    }
  });

  it('refuses a completed, cancelled or archived group, and an unknown one', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'ARCHIVED'] as const) {
      expect(isEnrollableGroupStatus(s)).toBe(false);
    }
    expect(isEnrollableGroupStatus(null)).toBe(false);
    expect(isEnrollableGroupStatus(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/groups/shared/enrollable-statuses.spec.ts`
Expected: FAIL — `Cannot find module './enrollable-statuses'`.

- [ ] **Step 3: Write the module**

`server/src/groups/shared/enrollable-statuses.ts`:

```ts
import type { GroupStatus } from '@prisma/client';

/**
 * The statuses a group takes new students in. The admin door
 * (`StudentEnrollmentService.enrollToGroup`), lead conversion and the bot
 * (ADR-0080) read this one list; a completed, cancelled or archived group
 * takes nobody.
 */
export const ENROLLABLE_GROUP_STATUSES: GroupStatus[] = [
  'ACTIVE',
  'FORMING',
  'PAUSED',
];

export function isEnrollableGroupStatus(
  status: GroupStatus | null | undefined,
): boolean {
  return status != null && ENROLLABLE_GROUP_STATUSES.includes(status);
}
```

- [ ] **Step 4: Replace the two hand-written copies**

In `server/src/students/student-enrollment.service.ts`, replace

```ts
    const ENROLLABLE_STATUSES = ['ACTIVE', 'FORMING', 'PAUSED'];
    if (!ENROLLABLE_STATUSES.includes(group.statusEnum)) {
```

with

```ts
    if (!isEnrollableGroupStatus(group.statusEnum)) {
```

and add `import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';` to its imports. Do the same in `server/src/leads/leads.service.ts` (the block at line ~949; its indentation is deeper — keep it).

- [ ] **Step 5: Write the failing tests for the bot**

In `server/src/telegram/registration-link-start.spec.ts`:

1. Add `statusEnum: 'ACTIVE',` to the `GROUP` constant (after `name: 'A1-07',`). The session expectation in the first test stays as it is — `statusEnum` is not copied into the session.
2. Inside `describe('student_<branch>_group_<group>', …)`, after the test `'answers an unknown group'`, add:

```ts
    it('answers a group that takes no students (completed, cancelled, archived)', async () => {
      const service = makeService();
      const ctx = makeCtx();
      service.prisma.group.findFirst.mockResolvedValueOnce({
        ...GROUP,
        statusEnum: 'COMPLETED',
      });

      const handled = await service.startStudentGroupRegistration(ctx, LINK);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.",
      );
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });
```

In `server/src/telegram/scenes/student-registration.scene.spec.ts`, append:

```ts
/**
 * The branch link lets the person pick a teacher and a group (ADR-0080): only
 * a live teacher and a group that takes students may be offered.
 */
describe('student-registration.scene — what the branch link offers', () => {
  it('lists only groups that take students when a teacher is picked', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10010,
          firstName: 'Aziz',
          lastName: 'Qodirov',
        }),
        // No groups: the scene lists the teachers again.
        findMany: jest.fn().mockResolvedValue([]),
      },
      group: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const ctx = buildButtonCtx('select_teacher_10010', 1, { branchId: 7 });
    const scene = createStudentRegistrationScene(
      prisma as any,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await scene.middleware()(ctx, async () => {});

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, status: 'ACTIVE' }),
      }),
    );
    expect(prisma.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          statusEnum: { in: ['ACTIVE', 'FORMING', 'PAUSED'] },
        }),
      }),
    );
  });

  it('refuses a picked group that no longer takes students', async () => {
    const prisma = { group: { findFirst: jest.fn().mockResolvedValue(null) } };
    const ctx = buildButtonCtx('select_group_g1', 2, { branchId: 7 });
    const scene = createStudentRegistrationScene(
      prisma as any,
      { deleteFile: jest.fn() } as any,
      {} as any,
      {} as any,
    );

    await scene.middleware()(ctx, async () => {});

    expect(prisma.group.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'g1',
          branchId: 7,
          deletedAt: null,
          statusEnum: { in: ['ACTIVE', 'FORMING', 'PAUSED'] },
        },
      }),
    );
    expect(ctx.reply).toHaveBeenCalledWith('Guruh topilmadi. Qayta tanlang.');
    expect(ctx.session.step).toBe(2);
  });
});
```

These two tests already call the scene with four arguments; Task 7 changes the signature. Until Task 7 the scene takes six, and TypeScript in Jest (`isolatedModules`) does not check arity, so they run.

- [ ] **Step 6: Run them to see them fail**

Run: `cd server && npx jest src/telegram/registration-link-start.spec.ts src/telegram/scenes/student-registration.scene.spec.ts`
Expected: the three new tests FAIL (no status filter, no reply about a closed group).

- [ ] **Step 7: Filter teachers in the helper**

In `server/src/telegram/scenes/student-registration-helpers.ts`, `loadTeachersForBranch`'s `where` becomes:

```ts
    where: {
      deletedAt: null,
      // A suspended or terminated teacher is not offered, nor their groups.
      isActive: true,
      status: UserStatus.ACTIVE,
      roles: { some: { roleId: TEACHER_ROLE_ID } },
      branches: { some: { branchId } },
    },
```

Add `import { UserStatus } from '@prisma/client';` at the top.

- [ ] **Step 8: Filter in the scene**

In `server/src/telegram/scenes/student-registration.scene.ts`:

1. Add imports:

```ts
import { UserStatus } from '@prisma/client';
import { ENROLLABLE_GROUP_STATUSES } from '../../groups/shared/enrollable-statuses';
```

2. In `scene.action(/^select_teacher_(\d+)$/, …)`, the teacher lookup's `where` becomes:

```ts
        where: {
          id: teacherId,
          deletedAt: null,
          isActive: true,
          status: UserStatus.ACTIVE,
          roles: { some: { roleId: TEACHER_ROLE_ID } },
        },
```

and the groups query's `where` becomes:

```ts
        where: {
          deletedAt: null,
          branchId,
          statusEnum: { in: ENROLLABLE_GROUP_STATUSES },
          teachers: { some: { teacherId } },
        },
```

3. In `scene.action(/^select_group_(.+)$/, …)`, the lookup becomes:

```ts
    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        branchId: ctx.session.data.branchId,
        deletedAt: null,
        statusEnum: { in: ENROLLABLE_GROUP_STATUSES },
      },
      select: { id: true, name: true },
    });
```

- [ ] **Step 9: Refuse a closed group's link**

In `server/src/telegram/telegram.service.ts`, `startStudentGroupRegistration`:

1. Add `statusEnum: true,` to the `select` of `this.prisma.group.findFirst` (after `name: true,`).
2. Right after the `if (!group) { … return true; }` block, add:

```ts
      // A completed, cancelled or archived group takes nobody (ADR-0080).
      if (!isEnrollableGroupStatus(group.statusEnum)) {
        await ctx.reply(GROUP_CLOSED_REPLY);
        return true;
      }
```

3. Add imports:

```ts
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';
import { GROUP_CLOSED_REPLY } from '../student-join-requests/join-request-texts';
```

- [ ] **Step 10: Run the tests**

Run: `cd server && npx jest src/groups/shared src/telegram/registration-link-start.spec.ts src/telegram/scenes src/students/student-enrollment src/leads`
Expected: PASS.

- [ ] **Step 11: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/groups/shared/enrollable-statuses.ts src/groups/shared/enrollable-statuses.spec.ts src/students/student-enrollment.service.ts src/leads/leads.service.ts src/telegram/scenes/student-registration-helpers.ts src/telegram/scenes/student-registration.scene.ts src/telegram/scenes/student-registration.scene.spec.ts src/telegram/telegram.service.ts src/telegram/registration-link-start.spec.ts
git add src/groups/shared/enrollable-statuses.ts src/groups/shared/enrollable-statuses.spec.ts src/students/student-enrollment.service.ts src/leads/leads.service.ts src/telegram/scenes/student-registration-helpers.ts src/telegram/scenes/student-registration.scene.ts src/telegram/scenes/student-registration.scene.spec.ts src/telegram/telegram.service.ts src/telegram/registration-link-start.spec.ts
git commit -m "fix(bot): offer only live teachers and groups that take students

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bot texts

**Files:**
- Create: `server/src/student-join-requests/join-request-texts.ts`, `server/src/student-join-requests/join-request-texts.spec.ts`

**Interfaces:**
- Produces:
  - `PHONE_TAKEN_REPLY`, `CHAT_TAKEN_REPLY`, `GROUP_CLOSED_REPLY: string`;
  - `pendingRequestNotice(groupName: string): string`;
  - `scheduleText(g: { days: string | null; exactDays: string[]; lessonStartTime: string | null; lessonEndTime: string | null }): string | null`;
  - `loginText(phone: string): string`;
  - `joinRequestReceivedText(p: { firstName: string; groupName: string; teacherName: string | null; schedule: string | null }): string`;
  - `joinRequestApprovedText(p: { firstName: string; groupName: string; teacherName: string | null; schedule: string | null; phone: string; password: string }): string`;
  - `joinRequestRejectedText(p: { firstName: string; groupName: string; phone: string | null }): string`;
  - `joinRequestExpiredText(p: { firstName: string; groupName: string; phone: string | null }): string`.
- The four message texts are Telegram HTML; names are escaped.

- [ ] **Step 1: Write the failing test**

`server/src/student-join-requests/join-request-texts.spec.ts`:

```ts
import {
  joinRequestApprovedText,
  joinRequestExpiredText,
  joinRequestReceivedText,
  joinRequestRejectedText,
  loginText,
  pendingRequestNotice,
  scheduleText,
} from './join-request-texts';

// Spec 2026-10-10-guruhga-qoshilish-tasdigi §9, approved by the CEO on
// 10.10.2026 — these tests pin every line.
const GROUP = {
  firstName: 'Dilnoza',
  groupName: 'A1 Standart 15:00',
  teacherName: 'Madina Karimova',
  schedule: 'Toq kunlar | 15:00 – 16:30',
};

describe('join request texts', () => {
  it('the request received message', () => {
    expect(joinRequestReceivedText(GROUP)).toBe(
      [
        "✅ <b>So'rovingiz qabul qilindi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "Siz <b>A1 Standart 15:00</b> guruhiga yozilish uchun so'rov yubordingiz.",
        '',
        "👨‍🏫 O'qituvchi: Madina Karimova",
        '🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30',
        '',
        "Administrator so'rovingizni ko'rib chiqib, shu yerga xabar beradi. Odatda bu bir ish kuni ichida bo'ladi.",
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('leaves out the teacher and time lines when the group has neither', () => {
    const text = joinRequestReceivedText({
      ...GROUP,
      teacherName: null,
      schedule: null,
    });
    expect(text).not.toContain("O'qituvchi");
    expect(text).not.toContain('Dars vaqti');
    expect(text).not.toContain('\n\n\n');
  });

  it('the approval message, with the login and the password', () => {
    expect(
      joinRequestApprovedText({
        ...GROUP,
        phone: '901234567',
        password: 'k7Pq2xZa',
      }),
    ).toBe(
      [
        '🎉 <b>Siz guruhga qabul qilindingiz!</b>',
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "So'rovingiz tasdiqlandi.",
        '',
        '📚 Guruh: <b>A1 Standart 15:00</b>',
        "👨‍🏫 O'qituvchi: Madina Karimova",
        '🕐 Dars vaqti: Toq kunlar | 15:00 – 16:30',
        '',
        '🔐 <b>Shaxsiy kabinetingiz</b>',
        '🌐 student.dafzentrum.uz',
        '📱 Login: <b>90 123 45 67</b>',
        '🔑 Parol: <b>k7Pq2xZa</b>',
        '',
        "Darslarda ko'rishguncha!",
      ].join('\n'),
    );
  });

  it('the rejection message never carries the reason', () => {
    expect(
      joinRequestRejectedText({
        firstName: 'Dilnoza',
        groupName: 'A1 Standart 15:00',
        phone: '900000000',
      }),
    ).toBe(
      [
        "ℹ️ <b>So'rovingiz tasdiqlanmadi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingiz tasdiqlanmadi.",
        '',
        "Savolingiz bo'lsa yoki bu xato deb o'ylasangiz, administrator bilan bog'laning:",
        '📞 +998 90 000 00 00',
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('the expiry message', () => {
    expect(
      joinRequestExpiredText({
        firstName: 'Dilnoza',
        groupName: 'A1 Standart 15:00',
        phone: '900000000',
      }),
    ).toBe(
      [
        "⏳ <b>So'rovingiz ko'rib chiqilmadi</b>",
        '',
        'Hurmatli <b>Dilnoza</b>!',
        "<b>A1 Standart 15:00</b> guruhiga yozilish bo'yicha so'rovingizni 7 kun ichida ko'rib chiqa olmadik. Uzr so'raymiz.",
        '',
        "Iltimos, administrator bilan bog'laning — birga hal qilamiz:",
        '📞 +998 90 000 00 00',
        '',
        'Rahmat!',
      ].join('\n'),
    );
  });

  it('drops the phone line, and its colon, when neither branch nor company has a phone', () => {
    const text = joinRequestExpiredText({
      firstName: 'Dilnoza',
      groupName: 'A1',
      phone: null,
    });
    expect(text).not.toContain('📞');
    expect(text).toContain("birga hal qilamiz.\n\nRahmat!");
  });

  it('escapes what the person typed', () => {
    expect(
      joinRequestReceivedText({ ...GROUP, firstName: '<i>x</i>' }),
    ).toContain('Hurmatli <b>&lt;i&gt;x&lt;/i&gt;</b>!');
  });

  it('the notice for a chat that already waits', () => {
    expect(pendingRequestNotice('A1-07')).toBe(
      "Sizda ko'rib chiqilayotgan so'rov bor: A1-07. Yangisini yuborsangiz, avvalgisi bekor bo'ladi.",
    );
  });

  it('reads the schedule like the group card', () => {
    expect(
      scheduleText({
        days: 'odd',
        exactDays: [],
        lessonStartTime: '15:00',
        lessonEndTime: '16:30',
      }),
    ).toBe('Toq kunlar | 15:00 – 16:30');
    expect(
      scheduleText({
        days: null,
        exactDays: ['monday', 'thursday'],
        lessonStartTime: null,
        lessonEndTime: null,
      }),
    ).toBe('Du, Pa');
    expect(
      scheduleText({
        days: null,
        exactDays: [],
        lessonStartTime: null,
        lessonEndTime: null,
      }),
    ).toBeNull();
  });

  it('writes a 9-digit login with spaces and leaves a foreign one as it is', () => {
    expect(loginText('901234567')).toBe('90 123 45 67');
    expect(loginText('491701234567')).toBe('491701234567');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/student-join-requests/join-request-texts.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the texts**

`server/src/student-join-requests/join-request-texts.ts`:

```ts
import { formatUzPhone } from '../common/utils/phone.util';
import { escapeHtml } from '../telegram-groups/utils/format.util';
import {
  daysMap,
  weekdayLabels,
} from '../telegram/scenes/student-registration-helpers';

/**
 * What the bot says about a join request (ADR-0080). The four messages are
 * the CEO-approved wording of spec 2026-10-10-guruhga-qoshilish-tasdigi §9 —
 * do not reword; the spec file pins every line. Telegram HTML: what the
 * person typed is escaped.
 */

/** Plain bot replies before a request exists. */
export const PHONE_TAKEN_REPLY =
  "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. Muammo bo'lsa administrator bilan bog'laning.";
export const CHAT_TAKEN_REPLY = "Siz allaqachon ro'yxatdan o'tgansiz!";
export const GROUP_CLOSED_REPLY =
  "Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.";

export function pendingRequestNotice(groupName: string): string {
  return `Sizda ko'rib chiqilayotgan so'rov bor: ${groupName}. Yangisini yuborsangiz, avvalgisi bekor bo'ladi.`;
}

/** «Toq kunlar | 15:00 – 16:30», as the group link's card reads it; null when the group has neither. */
export function scheduleText(g: {
  days: string | null;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
}): string | null {
  const days = g.days
    ? (daysMap[g.days] ?? '')
    : g.exactDays.map((d) => weekdayLabels[d] ?? d).join(', ');
  const time =
    g.lessonStartTime && g.lessonEndTime
      ? `${g.lessonStartTime} – ${g.lessonEndTime}`
      : '';
  return [days, time].filter(Boolean).join(' | ') || null;
}

/** The login as the student types it: «90 123 45 67» for a 9-digit number. */
export function loginText(phone: string): string {
  return /^\d{9}$/.test(phone) ? formatUzPhone(phone).slice(5) : phone;
}

const greeting = (firstName: string) =>
  `Hurmatli <b>${escapeHtml(firstName)}</b>!`;

const groupLines = (p: {
  teacherName: string | null;
  schedule: string | null;
}): string[] => [
  ...(p.teacherName ? [`👨‍🏫 O'qituvchi: ${escapeHtml(p.teacherName)}`] : []),
  ...(p.schedule ? [`🕐 Dars vaqti: ${escapeHtml(p.schedule)}`] : []),
];

/** The ask-the-administrator line and the phone under it, or the line alone. */
const contactLines = (ask: string, phone: string | null): string[] =>
  phone ? [`${ask}:`, `📞 ${formatUzPhone(phone)}`] : [`${ask}.`];

export function joinRequestReceivedText(p: {
  firstName: string;
  groupName: string;
  teacherName: string | null;
  schedule: string | null;
}): string {
  const lines = groupLines(p);
  return [
    "✅ <b>So'rovingiz qabul qilindi</b>",
    '',
    greeting(p.firstName),
    `Siz <b>${escapeHtml(p.groupName)}</b> guruhiga yozilish uchun so'rov yubordingiz.`,
    '',
    ...(lines.length ? [...lines, ''] : []),
    "Administrator so'rovingizni ko'rib chiqib, shu yerga xabar beradi. Odatda bu bir ish kuni ichida bo'ladi.",
    'Rahmat!',
  ].join('\n');
}

export function joinRequestApprovedText(p: {
  firstName: string;
  groupName: string;
  teacherName: string | null;
  schedule: string | null;
  phone: string;
  password: string;
}): string {
  return [
    '🎉 <b>Siz guruhga qabul qilindingiz!</b>',
    '',
    greeting(p.firstName),
    "So'rovingiz tasdiqlandi.",
    '',
    `📚 Guruh: <b>${escapeHtml(p.groupName)}</b>`,
    ...groupLines(p),
    '',
    '🔐 <b>Shaxsiy kabinetingiz</b>',
    '🌐 student.dafzentrum.uz',
    `📱 Login: <b>${escapeHtml(loginText(p.phone))}</b>`,
    `🔑 Parol: <b>${escapeHtml(p.password)}</b>`,
    '',
    "Darslarda ko'rishguncha!",
  ].join('\n');
}

export function joinRequestRejectedText(p: {
  firstName: string;
  groupName: string;
  phone: string | null;
}): string {
  return [
    "ℹ️ <b>So'rovingiz tasdiqlanmadi</b>",
    '',
    greeting(p.firstName),
    `<b>${escapeHtml(p.groupName)}</b> guruhiga yozilish bo'yicha so'rovingiz tasdiqlanmadi.`,
    '',
    ...contactLines(
      "Savolingiz bo'lsa yoki bu xato deb o'ylasangiz, administrator bilan bog'laning",
      p.phone,
    ),
    '',
    'Rahmat!',
  ].join('\n');
}

export function joinRequestExpiredText(p: {
  firstName: string;
  groupName: string;
  phone: string | null;
}): string {
  return [
    "⏳ <b>So'rovingiz ko'rib chiqilmadi</b>",
    '',
    greeting(p.firstName),
    `<b>${escapeHtml(p.groupName)}</b> guruhiga yozilish bo'yicha so'rovingizni 7 kun ichida ko'rib chiqa olmadik. Uzr so'raymiz.`,
    '',
    ...contactLines(
      "Iltimos, administrator bilan bog'laning — birga hal qilamiz",
      p.phone,
    ),
    '',
    'Rahmat!',
  ].join('\n');
}
```

- [ ] **Step 4: Run the test**

Run: `cd server && npx jest src/student-join-requests/join-request-texts.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/student-join-requests/join-request-texts.ts src/student-join-requests/join-request-texts.spec.ts
git add src/student-join-requests/join-request-texts.ts src/student-join-requests/join-request-texts.spec.ts
git commit -m "feat(join-requests): the bot's request texts, pinned by tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The system task — create and close

**Files:**
- Create: `server/src/tasks/join-request-task.ts`, `server/src/tasks/join-request-task.spec.ts`

**Interfaces:**
- Consumes: `lessonTaskAssigneeIds(tx, companyId, branchId)` (`src/tasks/lesson-task.ts`), `scheduleTaskOutbox(db, OutboxTask)` (`src/tasks/task-outbox.service.ts`), `claimSystemTask(tx, taskId, userId)` (`src/tasks/task-claim.ts`), `OPEN_STATUSES` (`src/tasks/task-transitions.ts`), `toEventTask`, `TaskEventTask` (`src/tasks/task-events.ts`).
- Produces:
  - `type JoinTaskCloseReason = 'JOIN_APPROVED' | 'JOIN_REJECTED' | 'JOIN_EXPIRED' | 'JOIN_REPLACED'`;
  - `joinRequestTaskTitle(a: { firstName: string; lastName: string; groupName: string }): string`;
  - `createJoinRequestTask(tx, args: { companyId: number; branchId: number; groupId: string; requestId: string; title: string; dueAt: Date }): Promise<{ id: string; assigneeIds: number[]; eventTask: TaskEventTask } | null>`;
  - `closeJoinRequestTask(tx, taskId: string | null, actorId: number | null, reason: JoinTaskCloseReason): Promise<void>`.

- [ ] **Step 1: Write the failing test**

`server/src/tasks/join-request-task.spec.ts`:

```ts
import {
  closeJoinRequestTask,
  createJoinRequestTask,
  joinRequestTaskTitle,
} from './join-request-task';

describe('joinRequestTaskTitle', () => {
  it('names the person and the group', () => {
    expect(
      joinRequestTaskTitle({
        firstName: 'Dilnoza',
        lastName: 'Aliyeva',
        groupName: 'A1-07',
      }),
    ).toBe("Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07");
  });
});

describe('createJoinRequestTask', () => {
  const args = {
    companyId: 1001,
    branchId: 2,
    groupId: 'g1',
    requestId: 'r1',
    title: "Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07",
    dueAt: new Date(Date.now() + 26 * 3_600_000),
  };

  const tx = (adminIds: number[]) =>
    ({
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue(adminIds.map((id) => ({ id }))),
      },
      task: { create: jest.fn().mockResolvedValue({ id: 't1' }) },
      taskOutbox: { deleteMany: jest.fn(), createMany: jest.fn() },
    }) as any;

  it('writes an author-less JOIN_REQUEST task for every administrator of the branch', async () => {
    const t = tx([3, 4]);
    const made = await createJoinRequestTask(t, args);

    expect(t.task.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 2,
        kind: 'JOIN_REQUEST',
        title: args.title,
        priority: 'HIGH',
        dueAt: args.dueAt,
        authorId: null,
        entityType: 'Group',
        entityId: 'g1',
        sourceKey: 'join:r1',
        participants: {
          create: [
            { userId: 3, role: 'ASSIGNEE' },
            { userId: 4, role: 'ASSIGNEE' },
          ],
        },
        events: {
          create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }],
        },
      },
      select: { id: true },
    });
    expect(made).toEqual({
      id: 't1',
      assigneeIds: [3, 4],
      eventTask: {
        id: 't1',
        companyId: 1001,
        title: args.title,
        kind: 'JOIN_REQUEST',
        authorId: null,
        dueAt: args.dueAt,
        status: 'NEW',
        participants: [
          { userId: 3, role: 'ASSIGNEE' },
          { userId: 4, role: 'ASSIGNEE' },
        ],
      },
    });
  });

  it('queues the reminder and the overdue notice, Telegram included', async () => {
    const t = tx([3]);
    await createJoinRequestTask(t, args);
    const rows = t.taskOutbox.createMany.mock.calls[0][0].data;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 3, channel: 'INAPP', kind: 'REMINDER' }),
        expect.objectContaining({ userId: 3, channel: 'TELEGRAM', kind: 'OVERDUE' }),
      ]),
    );
  });

  it('writes nothing when nobody can take it', async () => {
    const t = tx([]);
    t.user.findMany.mockResolvedValue([]);
    expect(await createJoinRequestTask(t, args)).toBeNull();
    expect(t.task.create).not.toHaveBeenCalled();
  });
});

describe('closeJoinRequestTask', () => {
  const tx = (assignees: number[] = []) =>
    ({
      taskParticipant: {
        findMany: jest
          .fn()
          .mockResolvedValue(assignees.map((userId) => ({ userId }))),
        deleteMany: jest.fn(),
      },
      task: {
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      taskEvent: { create: jest.fn() },
      taskOutbox: { deleteMany: jest.fn() },
      unmarkedLesson: { updateMany: jest.fn() },
    }) as any;

  it('lets the deciding administrator take it, then closes it', async () => {
    const t = tx([3, 4]);
    await closeJoinRequestTask(t, 't1', 3, 'JOIN_APPROVED');
    expect(t.taskParticipant.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', role: 'ASSIGNEE', userId: { not: 3 } },
    });
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date) },
    });
    expect(t.taskEvent.create).toHaveBeenCalledWith({
      data: {
        taskId: 't1',
        type: 'AUTO_CLOSED',
        actorId: 3,
        meta: { reason: 'JOIN_APPROVED' },
        via: 'SYSTEM',
      },
    });
    expect(t.taskOutbox.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 't1', sentAt: null },
    });
  });

  it('records a director or the CEO as the holder when they decide', async () => {
    const t = tx([3, 4]);
    await closeJoinRequestTask(t, 't1', 10000, 'JOIN_REJECTED');
    expect(t.task.updateMany).toHaveBeenCalledWith({
      where: { id: 't1', status: { in: ['NEW', 'IN_PROGRESS', 'IN_REVIEW'] } },
      data: { status: 'DONE', closedAt: expect.any(Date), claimedById: 10000 },
    });
  });

  it('closes it with no holder when the system does (expiry, replacement)', async () => {
    const t = tx([3]);
    await closeJoinRequestTask(t, 't1', null, 'JOIN_EXPIRED');
    expect(t.taskParticipant.findMany).not.toHaveBeenCalled();
    expect(t.task.updateMany.mock.calls[0][0].data).toEqual({
      status: 'DONE',
      closedAt: expect.any(Date),
    });
  });

  it('writes no closing event for a task already closed', async () => {
    const t = tx([3]);
    t.task.updateMany.mockResolvedValue({ count: 0 });
    await closeJoinRequestTask(t, 't1', null, 'JOIN_EXPIRED');
    expect(t.taskEvent.create).not.toHaveBeenCalled();
  });

  it('does nothing without a task', async () => {
    const t = tx();
    await closeJoinRequestTask(t, null, 3, 'JOIN_APPROVED');
    expect(t.task.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/tasks/join-request-task.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

`server/src/tasks/join-request-task.ts`:

```ts
import type { Prisma } from '@prisma/client';
import { lessonTaskAssigneeIds } from './lesson-task';
import { claimSystemTask } from './task-claim';
import { toEventTask, type TaskEventTask } from './task-events';
import { scheduleTaskOutbox } from './task-outbox.service';
import { OPEN_STATUSES } from './task-transitions';

type Tx = Prisma.TransactionClient;

/** Why a «Yangi o'quvchi so'rovi» task closed (`TaskEvent.meta.reason`). */
export type JoinTaskCloseReason =
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'JOIN_EXPIRED'
  | 'JOIN_REPLACED';

const TITLE_MAX = 200;

export function joinRequestTaskTitle(a: {
  firstName: string;
  lastName: string;
  groupName: string;
}): string {
  return `Yangi o'quvchi so'rovi: ${a.firstName} ${a.lastName} → ${a.groupName}`;
}

/**
 * The «Yangi o'quvchi so'rovi» task (ADR-0080), built like «Dars bo'ldimi?»:
 * no author, the branch's administrators (then directors, then CEOs) as
 * assignees, the first to act takes it. Written straight to the table in the
 * request's transaction; the caller emits `task.assigned` after the commit.
 */
export async function createJoinRequestTask(
  tx: Tx,
  args: {
    companyId: number;
    branchId: number;
    groupId: string;
    requestId: string;
    title: string;
    dueAt: Date;
  },
): Promise<{
  id: string;
  assigneeIds: number[];
  eventTask: TaskEventTask;
} | null> {
  const assigneeIds = await lessonTaskAssigneeIds(
    tx,
    args.companyId,
    args.branchId,
  );
  if (assigneeIds.length === 0) return null;
  const participants = assigneeIds.map((userId) => ({
    userId,
    role: 'ASSIGNEE' as const,
  }));
  const title = args.title.slice(0, TITLE_MAX);
  const task = await tx.task.create({
    data: {
      companyId: args.companyId,
      branchId: args.branchId,
      kind: 'JOIN_REQUEST',
      title,
      priority: 'HIGH',
      dueAt: args.dueAt,
      authorId: null,
      entityType: 'Group',
      entityId: args.groupId,
      sourceKey: `join:${args.requestId}`,
      participants: { create: participants },
      events: { create: [{ type: 'CREATED', actorId: null, via: 'SYSTEM' }] },
    },
    select: { id: true },
  });
  await scheduleTaskOutbox(tx, {
    id: task.id,
    kind: 'JOIN_REQUEST',
    priority: 'HIGH',
    dueAt: args.dueAt,
    authorId: null,
    participants,
  });
  return {
    id: task.id,
    assigneeIds,
    eventTask: toEventTask({
      id: task.id,
      companyId: args.companyId,
      title,
      kind: 'JOIN_REQUEST',
      authorId: null,
      dueAt: args.dueAt,
      status: 'NEW',
      participants,
    }),
  };
}

/**
 * Closes the task once its request is decided. An administrator on the task
 * takes it (`claimSystemTask`: the others' copies go); a director or the CEO
 * is recorded as the holder; the system (expiry, replacement) records nobody.
 */
export async function closeJoinRequestTask(
  tx: Tx,
  taskId: string | null,
  actorId: number | null,
  reason: JoinTaskCloseReason,
): Promise<void> {
  if (!taskId) return;
  const claimed =
    actorId !== null && (await claimSystemTask(tx, taskId, actorId));
  const { count } = await tx.task.updateMany({
    where: { id: taskId, status: { in: [...OPEN_STATUSES] } },
    data: {
      status: 'DONE',
      closedAt: new Date(),
      ...(actorId !== null && !claimed ? { claimedById: actorId } : {}),
    },
  });
  if (count > 0) {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'AUTO_CLOSED',
        actorId,
        meta: { reason },
        via: 'SYSTEM',
      },
    });
  }
  await tx.taskOutbox.deleteMany({ where: { taskId, sentAt: null } });
}
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx jest src/tasks/join-request-task.spec.ts src/tasks/task-write.single-source.spec.ts`
Expected: PASS. The single-source guard passes because the writes live in `src/tasks/`.

- [ ] **Step 5: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/tasks/join-request-task.ts src/tasks/join-request-task.spec.ts
git add src/tasks/join-request-task.ts src/tasks/join-request-task.spec.ts
git commit -m "feat(tasks): the join-request system task, created and closed like the lesson question

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Registration takes an actor and an in-transaction step

**Files:**
- Modify: `server/src/telegram/scenes/student-registration-flow.ts` (`registerStudentFromTelegram`)
- Test: `server/src/telegram/scenes/student-registration-flow.spec.ts`

**Interfaces:**
- Produces: `registerStudentFromTelegram(prisma, entityHistoryService, leadOrigin, data, chatId, events, options?: RegistrationOptions)` where `export interface RegistrationOptions { actorId?: number; inTx?: (tx: Prisma.TransactionClient, studentId: number) => Promise<void> }`. Without `options` it behaves exactly as before.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('registerStudentFromTelegram — lid kelib chiqishi', …)` in `student-registration-flow.spec.ts`:

```ts
  it('runs the caller step inside the card transaction, with the new id', async () => {
    const inTx = jest.fn().mockResolvedValue(undefined);

    await registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
      { actorId: 10002, inTx },
    );

    expect(inTx).toHaveBeenCalledWith(tx, 11094);
  });

  it('writes nothing after the transaction when the caller step refuses', async () => {
    const inTx = jest.fn().mockRejectedValue(new Error('allaqachon'));

    await expect(
      registerStudentFromTelegram(
        prisma,
        history,
        leadOrigin as never,
        data,
        '555000',
        events,
        { actorId: 10002, inTx },
      ),
    ).rejects.toThrow('allaqachon');
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('records the approving administrator on the lead and on every history row', async () => {
    await registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
      { actorId: 10002 },
    );

    expect(leadOrigin.recordSelfSignupOrigin.mock.calls[0][1].userId).toBe(
      10002,
    );
    for (const [row] of history.recordCreate.mock.calls) {
      expect(row.changedById).toBe(10002);
    }
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && npx jest src/telegram/scenes/student-registration-flow.spec.ts`
Expected: the three new tests FAIL.

- [ ] **Step 3: Change the function**

In `student-registration-flow.ts`:

1. Add the type import `import type { Prisma } from '@prisma/client';` and, above the function, export:

```ts
/**
 * What an approval adds (ADR-0080): the administrator who approved, recorded
 * on the lead and on every history row, and a step that runs inside the card's
 * own transaction — the request is taken there, so a second approval writes
 * no second card.
 */
export interface RegistrationOptions {
  actorId?: number;
  inTx?: (tx: Prisma.TransactionClient, studentId: number) => Promise<void>;
}
```

2. Add the parameter `options: RegistrationOptions = {},` after `events: Pick<EventEmitter2, 'emitAsync'>,`.
3. In the transaction, pass `userId: options.actorId,` to `recordSelfSignupOrigin` (replacing `userId: undefined,` and its comment with `// The approving administrator; none before ADR-0080.`), and right before `return created;` add:

```ts
    if (options.inTx) await options.inTx(tx, created.id);
```

4. Add `changedById: options.actorId,` to each of the four `entityHistoryService.recordCreate({ … })` calls (next to `companyId: DEFAULT_COMPANY_ID,`).

- [ ] **Step 4: Run the tests**

Run: `cd server && npx jest src/telegram/scenes/student-registration-flow.spec.ts src/common/auth/student-account.single-source.spec.ts`
Expected: PASS. The earlier test `yaratilgan o'quvchining ma'lumotlari…` still expects `userId: undefined`, which holds without options.

- [ ] **Step 5: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/telegram/scenes/student-registration-flow.ts src/telegram/scenes/student-registration-flow.spec.ts
git add src/telegram/scenes/student-registration-flow.ts src/telegram/scenes/student-registration-flow.spec.ts
git commit -m "feat(bot): registration records who approved it and takes a step in its transaction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The service — create a request

**Files:**
- Create: `server/src/student-join-requests/join-request-events.ts`
- Create: `server/src/student-join-requests/student-join-requests.service.ts` (create + pendingForChat; Task 8 adds the rest)
- Create: `server/src/student-join-requests/student-join-requests.service.spec.ts`
- Create: `server/src/student-join-requests/student-join-requests.module.ts`

**Interfaces:**
- Produces, in `join-request-events.ts`:
  - `JOIN_REQUEST_CLOSED = 'student-join-request.closed'`, `JoinRequestClosedEvent { companyId: number; taskId: string }`;
  - `JOIN_REQUEST_MESSAGE = 'student-join-request.message'`, `JoinRequestMessageEvent { chatId: string; text: string; photo: string | null }`.
- Produces, in the service:
  - `JoinRequestCreateInput { branchId: number; groupId: string; chatId: string; telegramUsername: string | null; firstName: string; lastName: string; phone: string; photo: string }`;
  - `JoinRequestCreateOutcome = { kind: 'created'; requestId: string; text: string } | { kind: 'refused'; message: string }`;
  - `JoinRequestGateway = Pick<StudentJoinRequestsService, 'create' | 'pendingForChat'>`;
  - `StudentJoinRequestsService.create(input): Promise<JoinRequestCreateOutcome>`;
  - `StudentJoinRequestsService.pendingForChat(chatId: string): Promise<{ groupName: string } | null>`.
- Consumes: Tasks 2–5.

- [ ] **Step 1: Write the events file**

`server/src/student-join-requests/join-request-events.ts`:

```ts
/**
 * A join request's task closed (decided, expired or replaced): its bell rows
 * close too (ADR-0076). Emitted after the commit.
 */
export const JOIN_REQUEST_CLOSED = 'student-join-request.closed';
export interface JoinRequestClosedEvent {
  companyId: number;
  taskId: string;
}

/**
 * A message for the person who asked (ADR-0080, spec §9). `JoinRequestNotifier`
 * in `src/telegram/` sends it and answers `true` when it was delivered;
 * `emitAsync` hands that answer back. `photo` goes with the approval only.
 */
export const JOIN_REQUEST_MESSAGE = 'student-join-request.message';
export interface JoinRequestMessageEvent {
  chatId: string;
  text: string;
  photo: string | null;
}
```

- [ ] **Step 2: Write the failing tests**

`server/src/student-join-requests/student-join-requests.service.spec.ts`:

```ts
import { StudentJoinRequestsService } from './student-join-requests.service';
import * as joinTask from '../tasks/join-request-task';
import { TASK_EVENTS } from '../tasks/task-events';
import { JOIN_REQUEST_CLOSED } from './join-request-events';

jest.mock('../holidays/holiday-date-set', () => ({
  buildHolidayDateSet: jest.fn().mockResolvedValue(new Set<string>()),
}));
jest.mock('../balance-notices/load-transfer-state', () => ({
  loadContactPhone: jest.fn().mockResolvedValue('900000000'),
}));
jest.mock('../telegram/scenes/student-registration-flow', () => ({
  registerStudentFromTelegram: jest.fn(),
}));

const GROUP = {
  id: 'g1',
  name: 'A1-07',
  companyId: 1001,
  branchId: 7,
  statusEnum: 'ACTIVE',
  deletedAt: null,
  days: 'odd',
  exactDays: [],
  lessonStartTime: '15:00',
  lessonEndTime: '16:30',
  branch: { status: 'ACTIVE', deletedAt: null },
  teachers: [{ teacher: { firstName: 'Madina', lastName: 'Karimova' } }],
};

const INPUT = {
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/new.jpg',
};

function setup() {
  const tx = {
    studentJoinRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma: any = {
    student: { findFirst: jest.fn().mockResolvedValue(null) },
    group: {
      findFirst: jest.fn().mockResolvedValue(GROUP),
      findUnique: jest.fn().mockResolvedValue({ name: 'A1-07' }),
    },
    studentJoinRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    task: { findUnique: jest.fn().mockResolvedValue({ claimedById: null }) },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const upload = { deleteFile: jest.fn().mockResolvedValue(undefined) };
  const events = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([true]),
  };
  const service = new StudentJoinRequestsService(
    prisma,
    upload as any,
    {} as any,
    {} as any,
    events as any,
  );
  return { tx, prisma, upload, events, service };
}

const EVENT_TASK = {
  id: 't1',
  companyId: 1001,
  title: 'x',
  kind: 'JOIN_REQUEST',
  authorId: null,
  dueAt: null,
  status: 'NEW' as const,
  participants: [{ userId: 3, role: 'ASSIGNEE' as const }],
};

describe('StudentJoinRequestsService.create', () => {
  let createTask: jest.SpyInstance;
  let closeTask: jest.SpyInstance;

  beforeEach(() => {
    createTask = jest
      .spyOn(joinTask, 'createJoinRequestTask')
      .mockResolvedValue({ id: 't1', assigneeIds: [3], eventTask: EVENT_TASK });
    closeTask = jest
      .spyOn(joinTask, 'closeJoinRequestTask')
      .mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the request and its task, then tells the administrators', async () => {
    const { tx, events, service } = setup();

    const out = await service.create(INPUT);

    expect(out.kind).toBe('created');
    expect(out.kind === 'created' && out.text).toContain(
      "Siz <b>A1-07</b> guruhiga yozilish uchun so'rov yubordingiz.",
    );
    expect(tx.studentJoinRequest.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 7,
        groupId: 'g1',
        chatId: '555444',
        telegramUsername: 'dilnoza_a',
        firstName: 'Dilnoza',
        lastName: 'Aliyeva',
        phone: '901234567',
        photo: 'https://r2/new.jpg',
      },
      select: { id: true },
    });
    expect(createTask).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: 1001,
        branchId: 7,
        groupId: 'g1',
        requestId: 'r1',
        title: "Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07",
      }),
    );
    expect(tx.studentJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { taskId: 't1' },
    });
    expect(events.emit).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, {
      task: EVENT_TASK,
      actorId: null,
      userIds: [3],
      created: true,
    });
  });

  it('refuses a phone a live card holds, writing nothing', async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockImplementation(
      async ({ where }: { where: { phone?: string } }) =>
        where.phone ? { id: 11001 } : null,
    );

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message:
        "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. Muammo bo'lsa administrator bilan bog'laning.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a chat a live card holds', async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockImplementation(
      async ({ where }: { where: { telegramChatId?: string } }) =>
        where.telegramChatId ? { id: 11002 } : null,
    );

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message: "Siz allaqachon ro'yxatdan o'tgansiz!",
    });
  });

  it.each([
    ['a completed group', { ...GROUP, statusEnum: 'COMPLETED' }],
    ['a deleted group', { ...GROUP, deletedAt: new Date() }],
    ['another branch', { ...GROUP, branchId: 8 }],
    ['a closed branch', { ...GROUP, branch: { status: 'CLOSED', deletedAt: null } }],
    ['no group', null],
  ])('refuses %s', async (_name, group) => {
    const { prisma, service } = setup();
    prisma.group.findFirst.mockResolvedValue(group);

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message:
        "Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces the chat open request, closing its task and dropping its photo', async () => {
    const { tx, upload, events, service } = setup();
    tx.studentJoinRequest.findFirst.mockResolvedValue({
      id: 'r0',
      companyId: 1001,
      taskId: 't0',
      photo: 'https://r2/old.jpg',
    });

    await service.create(INPUT);

    expect(tx.studentJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 'r0' },
      data: { status: 'REPLACED', decidedAt: expect.any(Date), photo: null },
    });
    expect(closeTask).toHaveBeenCalledWith(tx, 't0', null, 'JOIN_REPLACED');
    expect(upload.deleteFile).toHaveBeenCalledWith('https://r2/old.jpg');
    expect(events.emit).toHaveBeenCalledWith(JOIN_REQUEST_CLOSED, {
      companyId: 1001,
      taskId: 't0',
    });
  });

  it('still writes the request when nobody can take the task', async () => {
    const { tx, events, service } = setup();
    createTask.mockResolvedValue(null);

    const out = await service.create(INPUT);

    expect(out.kind).toBe('created');
    expect(tx.studentJoinRequest.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.anything(),
    );
  });
});

describe('StudentJoinRequestsService.pendingForChat', () => {
  it("names the chat's waiting request's group", async () => {
    const { prisma, service } = setup();
    prisma.studentJoinRequest.findFirst.mockResolvedValue({ groupId: 'g1' });

    expect(await service.pendingForChat('555444')).toEqual({
      groupName: 'A1-07',
    });
    expect(prisma.studentJoinRequest.findFirst).toHaveBeenCalledWith({
      where: { chatId: '555444', status: 'PENDING' },
      select: { groupId: true },
    });
  });

  it('is null when nothing waits', async () => {
    const { service } = setup();
    expect(await service.pendingForChat('555444')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `cd server && npx jest src/student-join-requests/student-join-requests.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the service (create part)**

`server/src/student-join-requests/student-join-requests.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { StudentLeadOriginService } from '../common/student-origin';
import {
  addDaysToDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { HOLIDAY_LOOKAHEAD_DAYS } from '../unmarked-lessons/reask-holidays';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';
import { nextWorkingDay, taskDueAt } from '../tasks/lesson-task';
import {
  closeJoinRequestTask,
  createJoinRequestTask,
  joinRequestTaskTitle,
} from '../tasks/join-request-task';
import { TASK_EVENTS, type TaskAssignedPayload } from '../tasks/task-events';
import {
  JOIN_REQUEST_CLOSED,
  type JoinRequestClosedEvent,
} from './join-request-events';
import {
  CHAT_TAKEN_REPLY,
  GROUP_CLOSED_REPLY,
  PHONE_TAKEN_REPLY,
  joinRequestReceivedText,
  scheduleText,
} from './join-request-texts';

export interface JoinRequestCreateInput {
  branchId: number;
  groupId: string;
  chatId: string;
  telegramUsername: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string;
}

export type JoinRequestCreateOutcome =
  | { kind: 'created'; requestId: string; text: string }
  | { kind: 'refused'; message: string };

/** What the bot scene needs from this service. */
export type JoinRequestGateway = Pick<
  StudentJoinRequestsService,
  'create' | 'pendingForChat'
>;

export const GROUP_SELECT = {
  id: true,
  name: true,
  companyId: true,
  branchId: true,
  statusEnum: true,
  deletedAt: true,
  days: true,
  exactDays: true,
  lessonStartTime: true,
  lessonEndTime: true,
  branch: { select: { status: true, deletedAt: true } },
  teachers: {
    select: { teacher: { select: { firstName: true, lastName: true } } },
    take: 1,
  },
} satisfies Prisma.GroupSelect;
export type JoinGroup = Prisma.GroupGetPayload<{ select: typeof GROUP_SELECT }>;

/** The group, alive, in a live branch, and taking students. */
export function groupTakesStudents(g: JoinGroup): boolean {
  return (
    g.deletedAt === null &&
    isEnrollableGroupStatus(g.statusEnum) &&
    g.branch.status === 'ACTIVE' &&
    g.branch.deletedAt === null
  );
}

export function teacherNameOf(g: JoinGroup): string | null {
  const t = g.teachers[0]?.teacher;
  return t ? `${t.firstName} ${t.lastName}` : null;
}

/** A request that is being closed: what is cleaned up after the commit. */
interface Closing {
  companyId: number;
  taskId: string | null;
  photo: string | null;
}

/**
 * Bot sign-ups as requests (ADR-0080). A request writes nothing but itself and
 * its task; the card, the enrollment, the charge, the account and the lead
 * come with the approval.
 */
@Injectable()
export class StudentJoinRequestsService {
  private readonly logger = new Logger(StudentJoinRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upload: UploadService,
    private readonly history: EntityHistoryService,
    private readonly leadOrigin: StudentLeadOriginService,
    private readonly events: EventEmitter2,
  ) {}

  /** The chat's waiting request, for the bot's «you already asked» notice. */
  async pendingForChat(chatId: string): Promise<{ groupName: string } | null> {
    const row = await this.prisma.studentJoinRequest.findFirst({
      where: { chatId, status: 'PENDING' },
      select: { groupId: true },
    });
    if (!row) return null;
    const group = await this.prisma.group.findUnique({
      where: { id: row.groupId },
      select: { name: true },
    });
    return { groupName: group?.name ?? '—' };
  }

  async create(
    input: JoinRequestCreateInput,
  ): Promise<JoinRequestCreateOutcome> {
    const [phoneCard, chatCard, group] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone: input.phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.student.findFirst({
        where: { telegramChatId: input.chatId, deletedAt: null },
        select: { id: true },
      }),
      this.loadGroup(input.groupId),
    ]);
    if (phoneCard) return { kind: 'refused', message: PHONE_TAKEN_REPLY };
    if (chatCard) return { kind: 'refused', message: CHAT_TAKEN_REPLY };
    if (
      !group ||
      group.branchId !== input.branchId ||
      !groupTakesStudents(group)
    ) {
      return { kind: 'refused', message: GROUP_CLOSED_REPLY };
    }

    const now = new Date();
    const dueAt = taskDueAt(
      nextWorkingDay(
        tashkentDateStr(now),
        await this.branchHolidays(input.branchId, now),
      ),
    );
    const title = joinRequestTaskTitle({
      firstName: input.firstName,
      lastName: input.lastName,
      groupName: group.name,
    });

    const { requestId, task, replaced } = await this.prisma.$transaction(
      async (tx) => {
        // One open request per chat (spec D9): the new one replaces it.
        const previous = await tx.studentJoinRequest.findFirst({
          where: { chatId: input.chatId, status: 'PENDING' },
          select: { id: true, companyId: true, taskId: true, photo: true },
        });
        if (previous) {
          await tx.studentJoinRequest.update({
            where: { id: previous.id },
            data: { status: 'REPLACED', decidedAt: now, photo: null },
          });
          await closeJoinRequestTask(
            tx,
            previous.taskId,
            null,
            'JOIN_REPLACED',
          );
        }
        const request = await tx.studentJoinRequest.create({
          data: {
            companyId: group.companyId,
            branchId: input.branchId,
            groupId: group.id,
            chatId: input.chatId,
            telegramUsername: input.telegramUsername,
            firstName: input.firstName,
            lastName: input.lastName,
            phone: input.phone,
            photo: input.photo,
          },
          select: { id: true },
        });
        const made = await createJoinRequestTask(tx, {
          companyId: group.companyId,
          branchId: input.branchId,
          groupId: group.id,
          requestId: request.id,
          title,
          dueAt,
        });
        if (made) {
          await tx.studentJoinRequest.update({
            where: { id: request.id },
            data: { taskId: made.id },
          });
        }
        return { requestId: request.id, task: made, replaced: previous };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    if (replaced) await this.afterClose(replaced);
    if (task) {
      this.events.emit(TASK_EVENTS.ASSIGNED, {
        task: task.eventTask,
        actorId: null,
        userIds: task.assigneeIds,
        created: true,
      } satisfies TaskAssignedPayload);
    }
    return {
      kind: 'created',
      requestId,
      text: joinRequestReceivedText({
        firstName: input.firstName,
        groupName: group.name,
        teacherName: teacherNameOf(group),
        schedule: scheduleText(group),
      }),
    };
  }

  // ---------- shared ----------

  protected loadGroup(id: string): Promise<JoinGroup | null> {
    return this.prisma.group.findFirst({ where: { id }, select: GROUP_SELECT });
  }

  /** The branch's holidays from today on, for the task's due day. */
  private branchHolidays(branchId: number, now: Date): Promise<Set<string>> {
    const today = tashkentDateStr(now);
    return buildHolidayDateSet(
      this.prisma,
      tashkentDayStartUtc(today),
      tashkentDayStartUtc(addDaysToDateStr(today, HOLIDAY_LOOKAHEAD_DAYS)),
      branchId,
    );
  }

  /** After a request closed: its photo goes, its bell rows close. */
  protected async afterClose(r: Closing): Promise<void> {
    if (r.photo) await this.upload.deleteFile(r.photo);
    if (r.taskId) {
      this.events.emit(JOIN_REQUEST_CLOSED, {
        companyId: r.companyId,
        taskId: r.taskId,
      } satisfies JoinRequestClosedEvent);
    }
  }
}
```

`history`, `leadOrigin` and `logger` are used by Task 8; ESLint may report them unused until then (a warning — `@typescript-eslint/no-unused-vars` does not flag constructor parameter properties).

- [ ] **Step 5: Write the module**

`server/src/student-join-requests/student-join-requests.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { UploadModule } from '../upload/upload.module';
import { StudentJoinRequestsService } from './student-join-requests.service';

/**
 * Join requests (ADR-0080). Must not import `TelegramModule`: TelegramModule
 * imports this one for its scene, and messages to the person go out through
 * the `JOIN_REQUEST_MESSAGE` event instead.
 */
@Module({
  imports: [UploadModule],
  providers: [StudentJoinRequestsService],
  exports: [StudentJoinRequestsService],
})
export class StudentJoinRequestsModule {}
```

- [ ] **Step 6: Run the tests**

Run: `cd server && npx jest src/student-join-requests`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/student-join-requests
git add src/student-join-requests
git commit -m "feat(join-requests): a bot sign-up writes a request and its task, nothing else

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The bot scene sends a request

**Files:**
- Modify: `server/src/telegram/scenes/student-registration.scene.ts`
- Modify: `server/src/telegram/telegram.service.ts`, `server/src/telegram/telegram.module.ts`
- Test: `server/src/telegram/scenes/student-registration.scene.spec.ts`, `server/src/telegram/telegram-before-scenes.spec.ts`

**Interfaces:**
- Produces: `createStudentRegistrationScene(prisma: PrismaService, uploadService: UploadService, _bot: Telegraf<BotContext>, joinRequests: JoinRequestGateway): Scenes.BaseScene<BotContext>`.
- Consumes: `JoinRequestGateway`, `StudentJoinRequestsService`, `StudentJoinRequestsModule` (Task 6); `pendingRequestNotice` (Task 3).

- [ ] **Step 1: Point the existing scene tests at the new signature**

In `student-registration.scene.spec.ts`:

1. Every `createStudentRegistrationScene(` call ends with four `{} as any,` lines (bot, history, lead origin, events). Collapse the last three into one `{} as any,`:

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
perl -0pi -e 's/(\{\} as any,\n(\s+))\{\} as any,\n\s+\{\} as any,\n\s+\{\} as any,\n/$1{} as any,\n/g' src/telegram/scenes/student-registration.scene.spec.ts
grep -c "createStudentRegistrationScene(" src/telegram/scenes/student-registration.scene.spec.ts
```

Then check by eye that no call still has six arguments (the two Task 2 tests already pass four).

2. Delete the whole `describe('student-registration.scene — Telegram fails after the account is created', …)` block, together with the `refusal()` helper above it if nothing else uses it. Remove the now-unused imports (`flow`, `TelegramError`) if ESLint reports them.

3. Append:

```ts
/**
 * «Tasdiqlash» sends a request (ADR-0080): no card, no account and no password
 * until an administrator approves it.
 */
describe('student-registration.scene — confirming sends a join request', () => {
  const PHOTO = 'https://r2.example.com/students/new.jpg';
  const DATA = {
    branchId: 7,
    teacherId: 10010,
    teacherName: 'Aziz Qodirov',
    groupId: 'g1',
    groupName: 'A1-07',
    firstName: 'Akmal',
    lastName: 'Karimov',
    phone: '901112233',
    photo: PHOTO,
  };

  function confirm(outcome: unknown) {
    const joinRequests = {
      create: jest.fn().mockResolvedValue(outcome),
      pendingForChat: jest.fn(),
    };
    const uploadService = { deleteFile: jest.fn().mockResolvedValue(undefined) };
    // The tap comes from a Telegram account with no username.
    const ctx = buildButtonCtx('confirm_student', 7, { ...DATA });
    const scene = createStudentRegistrationScene(
      {} as any,
      uploadService as any,
      {} as any,
      joinRequests as any,
    );
    return { ctx, scene, joinRequests, uploadService };
  }

  it('writes the request and tells the person it waits for an administrator', async () => {
    const { ctx, scene, joinRequests, uploadService } = confirm({
      kind: 'created',
      requestId: 'r1',
      text: "✅ <b>So'rovingiz qabul qilindi</b>",
    });

    await scene.middleware()(ctx, async () => {});

    expect(joinRequests.create).toHaveBeenCalledWith({
      branchId: 7,
      groupId: 'g1',
      chatId: '555444',
      telegramUsername: null,
      firstName: 'Akmal',
      lastName: 'Karimov',
      phone: '901112233',
      photo: PHOTO,
    });
    expect(ctx.reply).toHaveBeenCalledWith(
      "✅ <b>So'rovingiz qabul qilindi</b>",
      { parse_mode: 'HTML' },
    );
    expect(ctx.scene.leave).toHaveBeenCalled();
    // The request owns the photo now: neither deleted nor left for /start.
    expect(uploadService.deleteFile).not.toHaveBeenCalled();
    expect(ctx.session.data).toEqual({});
    expect(JSON.stringify(ctx.reply.mock.calls)).not.toContain('Parol');
  });

  it('a refusal deletes the photo and says why', async () => {
    const { ctx, scene, uploadService } = confirm({
      kind: 'refused',
      message: "Siz allaqachon ro'yxatdan o'tgansiz!",
    });

    await scene.middleware()(ctx, async () => {});

    expect(uploadService.deleteFile).toHaveBeenCalledWith(PHOTO);
    expect(ctx.reply).toHaveBeenCalledWith(
      "Siz allaqachon ro'yxatdan o'tgansiz!",
      expect.anything(),
    );
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it('a failed write keeps the confirmation step and offers to try again', async () => {
    const { ctx, scene, joinRequests } = confirm(null);
    joinRequests.create.mockRejectedValue(new Error('db down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await scene.middleware()(ctx, async () => {});

    expect(ctx.session.step).toBe(7);
    expect(ctx.reply).toHaveBeenCalledWith(
      "So'rovni yuborishda xatolik yuz berdi. Qayta tasdiqlang yoki administrator bilan bog'laning.",
      expect.anything(),
    );
    expect(ctx.scene.leave).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });
});
```

- [ ] **Step 2: Run to see the new tests fail**

Run: `cd server && npx jest src/telegram/scenes/student-registration.scene.spec.ts`
Expected: the three new tests FAIL (the scene still registers the student).

- [ ] **Step 3: Change the scene**

In `server/src/telegram/scenes/student-registration.scene.ts`:

1. Imports: remove `import type { EventEmitter2 } from '@nestjs/event-emitter';`, `EntityHistoryService`, `StudentLeadOriginService`, `registerStudentFromTelegram` (keep `uploadStudentPhoto`) and `finishRegistration`. Add:

```ts
import type { JoinRequestGateway } from '../../student-join-requests/student-join-requests.service';
import { pendingRequestNotice } from '../../student-join-requests/join-request-texts';
```

2. The signature becomes:

```ts
export function createStudentRegistrationScene(
  prisma: PrismaService,
  uploadService: UploadService,
  _bot: Telegraf<BotContext>,
  joinRequests: JoinRequestGateway,
): Scenes.BaseScene<BotContext> {
```

3. In `scene.enter`, right after the `if (existingStudent) { … return; }` block, add:

```ts
    // A request already waits: say so — a new one replaces it (spec D9).
    const pending = await joinRequests.pendingForChat(chatId);
    if (pending) await ctx.reply(pendingRequestNotice(pending.groupName));
```

4. Replace the whole `// Tasdiqlash` handler (`scene.action('confirm_student', …)`, up to the line before `// Qayta kiritish`) with:

```ts
  // Tasdiqlash — so'rov yuboriladi (ADR-0080): karta, guruh, parol va pul
  // administrator tasdiqlagandan keyin yoziladi.
  scene.action('confirm_student', async (ctx) => {
    if (ctx.session.step !== 7) return;
    if (ctx.session.processing) return;
    await withProcessingLock(ctx, async () => {
      await ctx.answerCbQuery();

      try {
        await ctx.editMessageCaption(
          (ctx.callbackQuery.message as any)?.caption ?? '',
          Markup.inlineKeyboard([
            [Markup.button.callback('⏳ Yuklanmoqda...', 'noop')],
          ]),
        );
      } catch {
        // editMessage xatosi bo'lsa davom etamiz
      }
      await ctx.sendChatAction('typing');

      const data = ctx.session.data;
      let outcome: Awaited<ReturnType<JoinRequestGateway['create']>>;
      try {
        outcome = await joinRequests.create({
          branchId: data.branchId,
          groupId: data.groupId,
          chatId: String(ctx.chat!.id),
          telegramUsername: ctx.from?.username ?? null,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          photo: data.photo,
        });
      } catch (error) {
        logger.error("So'rov yozilmadi", error as Error);
        ctx.session.step = 7;
        await ctx.reply(
          "So'rovni yuborishda xatolik yuz berdi. Qayta tasdiqlang yoki administrator bilan bog'laning.",
          Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Qayta tasdiqlash', 'confirm_student'),
              Markup.button.callback('🔄 Qayta kiritish', 'restart_student'),
            ],
          ]),
        );
        return;
      }

      // Either way the registration ends here. A refusal keeps nothing, so
      // the photo goes; a request owns it now, so the session forgets it and
      // the next /start does not delete it.
      if (outcome.kind === 'refused') {
        await uploadService.deleteFile(data.photo);
      }
      ctx.session.data = {};
      await ctx.scene.leave();
      try {
        await ctx.editMessageCaption(
          outcome.kind === 'created' ? "⏳ So'rov yuborildi" : '❌ Yuborilmadi',
        );
      } catch {
        // Only the preview's label.
      }

      try {
        if (outcome.kind === 'created') {
          await ctx.reply(outcome.text, { parse_mode: 'HTML' });
        } else {
          await ctx.reply(outcome.message, Markup.removeKeyboard());
        }
      } catch (err) {
        logger.warn(
          `So'rov javobi yuborilmadi (chat ${ctx.chat?.id}): ${describeError(err)}`,
        );
      }
    });
  });
```

5. Update the file's top comment block: «Step 7: Tasdiqlash» becomes «Step 7: Tasdiqlash — so'rov yuboriladi (ADR-0080)».

- [ ] **Step 4: Wire the service into the bot**

In `server/src/telegram/telegram.service.ts`:

1. The constructor parameters `private leadOrigin: StudentLeadOriginService,` and `private events: EventEmitter2,` were used only by the student scene. Replace them: put `private joinRequests: StudentJoinRequestsService,` where `leadOrigin` was, and delete the `events` parameter. Remove the `StudentLeadOriginService` import. Remove `EventEmitter2` from the `@nestjs/event-emitter` import (keep `OnEvent`). Check with `grep -n "this.events\|this.leadOrigin" src/telegram/telegram.service.ts` that nothing else used them; if something does, keep that parameter and only add `joinRequests`.
2. Add `import { StudentJoinRequestsService } from '../student-join-requests/student-join-requests.service';`.
3. The scene creation becomes:

```ts
    const studentScene = createStudentRegistrationScene(
      this.prisma,
      this.uploadService,
      this.bot,
      this.joinRequests,
    );
```

In `server/src/telegram/telegram.module.ts`, add `StudentJoinRequestsModule` to `imports` (with its import line).

In `server/src/telegram/telegram-before-scenes.spec.ts`, the `new TelegramService(` call passes eleven arguments; it now takes ten. Delete its last argument line `{ emit: jest.fn() } as any,` (the `none` in the ninth position stands in for `joinRequests`).

- [ ] **Step 5: Run the tests and the typecheck**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx jest src/telegram
npm run typecheck
```

Expected: PASS; typecheck clean.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/telegram/scenes/student-registration.scene.ts src/telegram/scenes/student-registration.scene.spec.ts src/telegram/telegram.service.ts src/telegram/telegram.module.ts src/telegram/telegram-before-scenes.spec.ts
git add src/telegram/scenes/student-registration.scene.ts src/telegram/scenes/student-registration.scene.spec.ts src/telegram/telegram.service.ts src/telegram/telegram.module.ts src/telegram/telegram-before-scenes.spec.ts
git commit -m "feat(bot): confirming a sign-up sends a join request instead of registering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Approve, reject, expire; the request view; closing the bell rows

**Files:**
- Create: `server/src/student-join-requests/join-request-view.ts`, `server/src/student-join-requests/join-request-view.spec.ts`
- Modify: `server/src/student-join-requests/student-join-requests.service.ts` (add `getByTask`, `approve`, `reject`, `expireOld`, `assertMayDecide`)
- Test: `server/src/student-join-requests/student-join-requests.service.spec.ts` (appended)
- Modify: `server/src/notifications/notification-resolver.service.ts`
- Create: `server/src/notifications/notification-resolver.join-request.spec.ts`

**Interfaces:**
- Produces:
  - `JoinRequestCaller { id: number; companyId: number; roles: string[] }`;
  - `JoinRequestView` (`join-request-view.ts`; fields listed in Step 3), `loadJoinRequestView(db, request: StudentJoinRequest): Promise<JoinRequestView>`;
  - `StudentJoinRequestsService.getByTask(taskId: string, caller): Promise<JoinRequestView>`;
  - `.approve(id: string, groupId: string | undefined, caller): Promise<{ status: 'APPROVED'; studentId: number; delivered: boolean }>`;
  - `.reject(id: string, reason: string, caller): Promise<{ status: 'REJECTED' }>`;
  - `.expireOld(now?: Date): Promise<number>` (also the 09:00 cron);
  - `ALREADY_DECIDED: string`;
  - `assertMayDecide(db, claimedById: number | null, caller): Promise<void>`;
  - `NotificationResolverService.onJoinRequestClosed(p: JoinRequestClosedEvent): Promise<void>`.
- Consumes: `registerStudentFromTelegram` + `RegistrationOptions` (Task 5), `closeJoinRequestTask` (Task 4), the texts (Task 3), `loadContactPhone(db, branchId, companyId)` from `src/balance-notices/load-transfer-state.ts`, `assertCallerInBranch(prisma, userId, branchId)` from `src/common/auth/branch-scope.ts`.

- [ ] **Step 1: Write the failing view test**

`server/src/student-join-requests/join-request-view.spec.ts`:

```ts
import { loadJoinRequestView } from './join-request-view';

const REQUEST = {
  id: 'r1',
  companyId: 1001,
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/p.jpg',
  status: 'PENDING' as const,
  taskId: 't1',
  decidedById: null,
  decidedAt: null,
  rejectReason: null,
  approvedGroupId: null,
  studentId: null,
  createdAt: new Date('2026-10-10T09:02:00.000Z'),
};

const group = (id: string, extra: object = {}) => ({
  id,
  name: id.toUpperCase(),
  branchId: 7,
  deletedAt: null,
  statusEnum: 'ACTIVE',
  teachers: [{ teacher: { firstName: 'Madina', lastName: 'Karimova' } }],
  ...extra,
});

function db() {
  return {
    group: { findMany: jest.fn().mockResolvedValue([group('g1'), group('g2')]) },
    enrollment: { findMany: jest.fn().mockResolvedValue([]) },
    lead: { findFirst: jest.fn().mockResolvedValue(null) },
    student: { findFirst: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

describe('loadJoinRequestView', () => {
  it('lists the branch groups that take students and names the requested one', async () => {
    const d = db();
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.requestedGroup).toEqual({ id: 'g1', name: 'G1' });
    expect(view.groups).toEqual([
      { id: 'g1', name: 'G1', teacherName: 'Madina Karimova' },
      { id: 'g2', name: 'G2', teacherName: 'Madina Karimova' },
    ]);
    expect(view.lead).toBeNull();
    expect(view.archivedStudentId).toBeNull();
    expect(view.sameNameGroupIds).toEqual([]);
  });

  it('keeps a closed requested group out of the list but still names it', async () => {
    const d = db();
    d.group.findMany.mockResolvedValue([
      group('g1', { statusEnum: 'COMPLETED' }),
      group('g2'),
    ]);
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.requestedGroup).toEqual({ id: 'g1', name: 'G1' });
    expect(view.groups.map((g) => g.id)).toEqual(['g2']);
  });

  it('finds the lead, the archived card and the same name in a group', async () => {
    const d = db();
    d.lead.findFirst.mockResolvedValue({
      createdAt: new Date('2026-10-03T07:00:00.000Z'),
      statusEnum: 'CONTACTED',
      deletedAt: null,
      source: { name: 'Instagram forma' },
    });
    d.student.findFirst.mockResolvedValue({ id: 10942 });
    d.enrollment.findMany.mockResolvedValue([
      { groupId: 'g2' },
      { groupId: 'g2' },
    ]);
    const view = await loadJoinRequestView(d as any, REQUEST as any);

    expect(view.lead).toEqual({
      createdAt: new Date('2026-10-03T07:00:00.000Z'),
      status: 'CONTACTED',
      archived: false,
      sourceName: 'Instagram forma',
    });
    expect(view.archivedStudentId).toBe(10942);
    expect(view.sameNameGroupIds).toEqual(['g2']);
    expect(d.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1001,
          OR: [{ phone: '901234567' }, { extraPhone: '901234567' }],
        },
      }),
    );
    expect(d.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: 1001,
          phone: '901234567',
          deletedAt: { not: null },
        },
      }),
    );
    expect(d.enrollment.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        group: { branchId: 7, deletedAt: null },
        student: {
          deletedAt: null,
          firstName: { equals: 'Dilnoza', mode: 'insensitive' },
          lastName: { equals: 'Aliyeva', mode: 'insensitive' },
        },
      },
      select: { groupId: true },
    });
  });

  it('names who decided', async () => {
    const d = db();
    d.user.findUnique.mockResolvedValue({
      id: 10002,
      firstName: 'Bobur',
      lastName: 'Aliyev',
    });
    const view = await loadJoinRequestView(d as any, {
      ...REQUEST,
      status: 'APPROVED',
      decidedById: 10002,
      studentId: 11345,
      approvedGroupId: 'g2',
    } as any);

    expect(view.decidedBy).toEqual({
      id: 10002,
      firstName: 'Bobur',
      lastName: 'Aliyev',
    });
    expect(view.approvedGroup).toEqual({ id: 'g2', name: 'G2' });
    expect(view.studentId).toBe(11345);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/student-join-requests/join-request-view.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the view**

`server/src/student-join-requests/join-request-view.ts`:

```ts
import type {
  LeadStatus,
  PrismaClient,
  StudentJoinRequest,
  StudentJoinRequestStatus,
} from '@prisma/client';
import { isEnrollableGroupStatus } from '../groups/shared/enrollable-statuses';

type Db = Pick<PrismaClient, 'group' | 'enrollment' | 'lead' | 'student' | 'user'>;

/** What the «So'rov» block of the task sheet reads (spec §5.3). */
export interface JoinRequestView {
  id: string;
  status: StudentJoinRequestStatus;
  createdAt: Date;
  decidedAt: Date | null;
  rejectReason: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  telegramUsername: string | null;
  requestedGroup: { id: string; name: string } | null;
  approvedGroup: { id: string; name: string } | null;
  studentId: number | null;
  decidedBy: { id: number; firstName: string; lastName: string } | null;
  /** The branch's groups that take students: what «Guruh» offers. */
  groups: { id: string; name: string; teacherName: string | null }[];
  /** Groups where an active student already has this first and last name. */
  sameNameGroupIds: string[];
  /** The latest lead with this phone (main or extra number). */
  lead: {
    createdAt: Date;
    status: LeadStatus;
    archived: boolean;
    sourceName: string | null;
  } | null;
  /** An archived card with this phone: restoring it may be right. */
  archivedStudentId: number | null;
}

export async function loadJoinRequestView(
  db: Db,
  r: StudentJoinRequest,
): Promise<JoinRequestView> {
  const named = [r.groupId, ...(r.approvedGroupId ? [r.approvedGroupId] : [])];
  const [groups, sameName, lead, archived, decidedBy] = await Promise.all([
    db.group.findMany({
      where: {
        OR: [
          { id: { in: named } },
          { branchId: r.branchId, deletedAt: null },
        ],
      },
      select: {
        id: true,
        name: true,
        branchId: true,
        deletedAt: true,
        statusEnum: true,
        teachers: {
          select: { teacher: { select: { firstName: true, lastName: true } } },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    }),
    db.enrollment.findMany({
      where: {
        status: 'ACTIVE',
        group: { branchId: r.branchId, deletedAt: null },
        student: {
          deletedAt: null,
          firstName: { equals: r.firstName, mode: 'insensitive' },
          lastName: { equals: r.lastName, mode: 'insensitive' },
        },
      },
      select: { groupId: true },
    }),
    db.lead.findFirst({
      where: {
        companyId: r.companyId,
        OR: [{ phone: r.phone }, { extraPhone: r.phone }],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        statusEnum: true,
        deletedAt: true,
        source: { select: { name: true } },
      },
    }),
    db.student.findFirst({
      where: { companyId: r.companyId, phone: r.phone, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
      select: { id: true },
    }),
    r.decidedById
      ? db.user.findUnique({
          where: { id: r.decidedById },
          select: { id: true, firstName: true, lastName: true },
        })
      : Promise.resolve(null),
  ]);

  const byId = new Map(groups.map((g) => [g.id, g]));
  const nameOf = (id: string | null) => {
    const g = id ? byId.get(id) : undefined;
    return g ? { id: g.id, name: g.name } : null;
  };
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    decidedAt: r.decidedAt,
    rejectReason: r.rejectReason,
    firstName: r.firstName,
    lastName: r.lastName,
    phone: r.phone,
    photo: r.photo,
    telegramUsername: r.telegramUsername,
    requestedGroup: nameOf(r.groupId),
    approvedGroup: nameOf(r.approvedGroupId),
    studentId: r.studentId,
    decidedBy,
    groups: groups
      .filter(
        (g) =>
          g.branchId === r.branchId &&
          g.deletedAt === null &&
          isEnrollableGroupStatus(g.statusEnum),
      )
      .map((g) => {
        const t = g.teachers[0]?.teacher;
        return {
          id: g.id,
          name: g.name,
          teacherName: t ? `${t.firstName} ${t.lastName}` : null,
        };
      }),
    sameNameGroupIds: [...new Set(sameName.map((e) => e.groupId))],
    lead: lead
      ? {
          createdAt: lead.createdAt,
          status: lead.statusEnum,
          archived: lead.deletedAt !== null,
          sourceName: lead.source?.name ?? null,
        }
      : null,
    archivedStudentId: archived?.id ?? null,
  };
}
```

- [ ] **Step 4: Run the view test**

Run: `cd server && npx jest src/student-join-requests/join-request-view.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing decision tests**

Append them to `server/src/student-join-requests/student-join-requests.service.spec.ts` (Task 6's file, which already mocks the registration flow, the holidays and the contact phone, and has `setup()` and `GROUP`). First add these imports at the top of that file, next to the existing ones:

```ts
import { ConflictException, ForbiddenException } from '@nestjs/common';
import * as flow from '../telegram/scenes/student-registration-flow';
import * as branchScope from '../common/auth/branch-scope';
import { JOIN_REQUEST_MESSAGE } from './join-request-events';
```

(`JOIN_REQUEST_CLOSED`, `joinTask` and `TASK_EVENTS` are imported there already.) Then append:

```ts
const REQUEST = {
  id: 'r1',
  companyId: 1001,
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/p.jpg',
  status: 'PENDING',
  taskId: 't1',
  decidedById: null,
  decidedAt: null,
  rejectReason: null,
  approvedGroupId: null,
  studentId: null,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
};
const ADMIN = { id: 10002, companyId: 1001, roles: ['Administrator'] };

describe('StudentJoinRequestsService — decisions', () => {
  // The transaction the mocked registration hands to `inTx`.
  let txFromRegister: any;
  let closeTask: jest.SpyInstance;
  const register = jest.mocked(flow.registerStudentFromTelegram);

  beforeEach(() => {
    jest.spyOn(branchScope, 'assertCallerInBranch').mockResolvedValue();
    closeTask = jest
      .spyOn(joinTask, 'closeJoinRequestTask')
      .mockResolvedValue(undefined);
    register.mockReset();
    register.mockImplementation(async (...args: unknown[]) => {
      const options = args[6] as flow.RegistrationOptions | undefined;
      await options?.inTx?.(txFromRegister, 11345);
      return { plainPassword: 'k7Pq2xZa' };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  function decide() {
    const s = setup();
    s.prisma.studentJoinRequest.findFirst.mockResolvedValue({ ...REQUEST });
    txFromRegister = s.tx;
    return s;
  }

  describe('approve', () => {
    it('writes the card through registration, takes the request and the task in its transaction', async () => {
      const { service, tx, events } = decide();

      const out = await service.approve('r1', undefined, ADMIN);

      expect(out).toEqual({
        status: 'APPROVED',
        studentId: 11345,
        delivered: true,
      });
      expect(register).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {
          firstName: 'Dilnoza',
          lastName: 'Aliyeva',
          phone: '901234567',
          photo: 'https://r2/p.jpg',
          branchId: 7,
          groupId: 'g1',
          groupName: 'A1-07',
        },
        '555444',
        events,
        expect.objectContaining({ actorId: 10002 }),
      );
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: 10002,
          decidedAt: expect.any(Date),
          approvedGroupId: 'g1',
          studentId: 11345,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', 10002, 'JOIN_APPROVED');
      expect(events.emit).toHaveBeenCalledWith(JOIN_REQUEST_CLOSED, {
        companyId: 1001,
        taskId: 't1',
      });
      const [event, message] = events.emitAsync.mock.calls[0];
      expect(event).toBe(JOIN_REQUEST_MESSAGE);
      expect(message.chatId).toBe('555444');
      expect(message.photo).toBe('https://r2/p.jpg');
      expect(message.text).toContain('🔑 Parol: <b>k7Pq2xZa</b>');
    });

    it('enrols into the group the administrator chose', async () => {
      const { service, prisma } = decide();
      prisma.group.findFirst.mockResolvedValue({
        ...GROUP,
        id: 'g2',
        name: 'A1-09',
      });

      await service.approve('r1', 'g2', ADMIN);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g2' } }),
      );
      expect(register.mock.calls[0][3]).toEqual(
        expect.objectContaining({ groupId: 'g2', groupName: 'A1-09' }),
      );
    });

    it('a second approval finds the request taken and writes no second card', async () => {
      const { service, tx } = decide();
      tx.studentJoinRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve('r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(closeTask).not.toHaveBeenCalled();
    });

    it('says when the message did not reach the person', async () => {
      const { service, events } = decide();
      events.emitAsync.mockResolvedValue([false]);

      const out = await service.approve('r1', undefined, ADMIN);

      expect(out.delivered).toBe(false);
    });

    it.each([
      ['a group of another branch', { ...GROUP, branchId: 8 }],
      ['a completed group', { ...GROUP, statusEnum: 'COMPLETED' }],
      [
        'a closed branch',
        { ...GROUP, branch: { status: 'CLOSED', deletedAt: null } },
      ],
    ])('refuses %s, writing nothing', async (_n, group) => {
      const { service, prisma } = decide();
      prisma.group.findFirst.mockResolvedValue(group);

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow();
      expect(register).not.toHaveBeenCalled();
    });

    it('refuses a phone or a chat a live card took meanwhile', async () => {
      const { service, prisma } = decide();
      prisma.student.findFirst.mockResolvedValue({ id: 11001 });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        '#11001',
      );
      expect(register).not.toHaveBeenCalled();
    });

    it('refuses a request already decided', async () => {
      const { service, prisma } = decide();
      prisma.studentJoinRequest.findFirst.mockResolvedValue({
        ...REQUEST,
        status: 'REJECTED',
      });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        "Bu so'rov allaqachon ko'rib chiqilgan",
      );
    });

    it('refuses an administrator of another branch', async () => {
      const { service } = decide();
      jest
        .spyOn(branchScope, 'assertCallerInBranch')
        .mockRejectedValue(new ForbiddenException('x'));

      await expect(
        service.approve('r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an administrator when another one took the task; a director passes', async () => {
      const { service, prisma } = decide();
      prisma.task.findUnique.mockResolvedValue({ claimedById: 10003 });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Kamola',
        lastName: 'Rahimova',
      });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        "Bu so'rovni Kamola Rahimova ko'rib chiqmoqda",
      );
      await expect(
        service.approve('r1', undefined, {
          id: 10001,
          companyId: 1001,
          roles: ['Branch Director'],
        }),
      ).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
    });
  });

  describe('reject', () => {
    it('closes the request and its task, drops the photo, and tells the person without the reason', async () => {
      const { service, prisma, tx, upload, events } = decide();

      expect(await service.reject('r1', 'begona odam', ADMIN)).toEqual({
        status: 'REJECTED',
      });
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'REJECTED',
          decidedById: 10002,
          decidedAt: expect.any(Date),
          rejectReason: 'begona odam',
          photo: null,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', 10002, 'JOIN_REJECTED');
      expect(upload.deleteFile).toHaveBeenCalledWith('https://r2/p.jpg');
      const message = events.emitAsync.mock.calls[0][1];
      expect(message.text).toContain("so'rovingiz tasdiqlanmadi");
      expect(message.text).not.toContain('begona');
      expect(register).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a request decided meanwhile is a conflict', async () => {
      const { service, tx } = decide();
      tx.studentJoinRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject('r1', 'x', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('expireOld', () => {
    it('closes requests older than 7 days and tells each person', async () => {
      const { service, prisma, tx, events } = decide();
      prisma.studentJoinRequest.findMany.mockResolvedValue([
        { ...REQUEST },
        { ...REQUEST, id: 'r2', taskId: 't2' },
      ]);
      const now = new Date('2026-10-10T04:00:00.000Z');

      expect(await service.expireOld(now)).toBe(2);
      expect(prisma.studentJoinRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            createdAt: { lt: new Date('2026-10-03T04:00:00.000Z') },
          },
        }),
      );
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'EXPIRED',
          decidedById: null,
          decidedAt: expect.any(Date),
          rejectReason: null,
          photo: null,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', null, 'JOIN_EXPIRED');
      expect(events.emitAsync.mock.calls[0][1].text).toContain(
        "7 kun ichida ko'rib chiqa olmadik",
      );
    });

    it('one failure does not stop the others', async () => {
      const { service, prisma } = decide();
      prisma.studentJoinRequest.findMany.mockResolvedValue([
        { ...REQUEST },
        { ...REQUEST, id: 'r2', taskId: 't2' },
      ]);
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock'));
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      expect(
        await service.expireOld(new Date('2026-10-10T04:00:00.000Z')),
      ).toBe(1);
    });
  });
});
```

- [ ] **Step 6: Run to see them fail**

Run: `cd server && npx jest src/student-join-requests/student-join-requests.service.spec.ts`
Expected: FAIL — `service.approve is not a function`.

- [ ] **Step 7: Add the decisions to the service**

In `student-join-requests.service.ts`:

1. Extend the imports:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type StudentJoinRequest } from '@prisma/client';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { loadContactPhone } from '../balance-notices/load-transfer-state';
import { registerStudentFromTelegram } from '../telegram/scenes/student-registration-flow';
import { type JoinTaskCloseReason } from '../tasks/join-request-task';
import {
  JOIN_REQUEST_MESSAGE,
  type JoinRequestMessageEvent,
} from './join-request-events';
import {
  joinRequestApprovedText,
  joinRequestExpiredText,
  joinRequestRejectedText,
} from './join-request-texts';
import { loadJoinRequestView, type JoinRequestView } from './join-request-view';
```

(merge with the existing import lines rather than duplicating them).

2. Add the module-level constants and the claim rule, below `teacherNameOf`:

```ts
const EXPIRE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** A run closes at most this many; the next day takes the rest. */
const EXPIRE_BATCH = 200;

export const ALREADY_DECIDED = "Bu so'rov allaqachon ko'rib chiqilgan";
const GROUP_NOT_ENROLLABLE =
  "Bu guruhga yozib bo'lmaydi — boshqa guruhni tanlang";
const BRANCH_NOT_ACTIVE = "Filial faol emas — so'rovni tasdiqlab bo'lmaydi";

export interface JoinRequestCaller {
  id: number;
  companyId: number;
  /** Role names, as `PermissionGuard` read them from the database. */
  roles: string[];
}

/**
 * The «Dars bo'ldimi?» rule (ADR-0054): the administrator who took the task
 * decides; the CEO and a Branch Director always may.
 */
export async function assertMayDecide(
  db: Pick<PrismaService, 'user'>,
  claimedById: number | null,
  caller: JoinRequestCaller,
): Promise<void> {
  if (claimedById === null || claimedById === caller.id) return;
  if (caller.roles.includes('CEO') || caller.roles.includes('Branch Director'))
    return;
  const holder = await db.user.findUnique({
    where: { id: claimedById },
    select: { firstName: true, lastName: true },
  });
  throw new ConflictException(
    holder
      ? `Bu so'rovni ${holder.firstName} ${holder.lastName} ko'rib chiqmoqda`
      : "Bu so'rovni boshqa administrator ko'rib chiqmoqda",
  );
}
```

3. Add these methods to the class, between `create` and the `// ---------- shared ----------` line:

```ts
  async getByTask(
    taskId: string,
    caller: JoinRequestCaller,
  ): Promise<JoinRequestView> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { taskId, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    return loadJoinRequestView(this.prisma, request);
  }

  async approve(
    id: string,
    groupId: string | undefined,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'APPROVED'; studentId: number; delivered: boolean }> {
    const request = await this.loadForDecision(id, caller);
    const group = await this.loadGroup(groupId ?? request.groupId);
    if (
      !group ||
      group.branchId !== request.branchId ||
      group.deletedAt !== null ||
      !isEnrollableGroupStatus(group.statusEnum)
    ) {
      throw new BadRequestException(GROUP_NOT_ENROLLABLE);
    }
    if (group.branch.status !== 'ACTIVE' || group.branch.deletedAt !== null) {
      throw new BadRequestException(BRANCH_NOT_ACTIVE);
    }
    const [phoneCard, chatCard] = await Promise.all([
      this.prisma.student.findFirst({
        where: { phone: request.phone, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.student.findFirst({
        where: { telegramChatId: request.chatId, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (phoneCard) {
      throw new BadRequestException(
        `Bu raqam #${phoneCard.id} o'quvchida bor — so'rovni rad eting yoki o'sha kartani oching`,
      );
    }
    if (chatCard) {
      throw new BadRequestException(
        `Bu Telegram #${chatCard.id} o'quvchiga bog'langan`,
      );
    }

    const now = new Date();
    let studentId = 0;
    let plainPassword: string;
    try {
      ({ plainPassword } = await registerStudentFromTelegram(
        this.prisma,
        this.history,
        this.leadOrigin,
        {
          firstName: request.firstName,
          lastName: request.lastName,
          phone: request.phone,
          photo: request.photo,
          branchId: request.branchId,
          groupId: group.id,
          groupName: group.name,
        },
        request.chatId,
        this.events,
        {
          actorId: caller.id,
          // Taken in the card's own transaction: a second approval finds it
          // decided and its card is rolled back.
          inTx: async (tx, newStudentId) => {
            studentId = newStudentId;
            const { count } = await tx.studentJoinRequest.updateMany({
              where: { id: request.id, status: 'PENDING' },
              data: {
                status: 'APPROVED',
                decidedById: caller.id,
                decidedAt: now,
                approvedGroupId: group.id,
                studentId: newStudentId,
              },
            });
            if (count === 0) throw new ConflictException(ALREADY_DECIDED);
            await closeJoinRequestTask(
              tx,
              request.taskId,
              caller.id,
              'JOIN_APPROVED',
            );
          },
        },
      ));
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException("Bu ma'lumotlar allaqachon tizimda bor");
      }
      throw error;
    }

    // The card keeps the photo; only the bell rows close.
    await this.afterClose({ ...request, photo: null });
    const delivered = await this.sendToPerson({
      chatId: request.chatId,
      photo: request.photo,
      text: joinRequestApprovedText({
        firstName: request.firstName,
        groupName: group.name,
        teacherName: teacherNameOf(group),
        schedule: scheduleText(group),
        phone: request.phone,
        password: plainPassword,
      }),
    });
    return { status: 'APPROVED', studentId, delivered };
  }

  async reject(
    id: string,
    reason: string,
    caller: JoinRequestCaller,
  ): Promise<{ status: 'REJECTED' }> {
    const request = await this.loadForDecision(id, caller);
    if (!(await this.closeRequest(request, 'REJECTED', caller.id, reason))) {
      throw new ConflictException(ALREADY_DECIDED);
    }
    await this.tellClosed(request, joinRequestRejectedText);
    return { status: 'REJECTED' };
  }

  /**
   * Day 7 (spec §6.3): a request nobody decided closes and the person is
   * told. Never approved by silence. 09:00 Tashkent, Sundays included.
   */
  @Cron('0 0 9 * * *', { timeZone: 'Asia/Tashkent' })
  async expireOld(now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.studentJoinRequest.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: new Date(now.getTime() - EXPIRE_AFTER_MS) },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPIRE_BATCH,
    });
    let closed = 0;
    for (const request of rows) {
      try {
        if (!(await this.closeRequest(request, 'EXPIRED', null, null))) {
          continue;
        }
        closed++;
        await this.tellClosed(request, joinRequestExpiredText);
      } catch (error) {
        this.logger.error(
          `So'rov ${request.id} yopilmadi: ${(error as Error).message}`,
        );
      }
    }
    if (closed > 0) {
      this.logger.log(`Muddati o'tgan so'rovlar yopildi: ${closed}`);
    }
    return closed;
  }
```

4. Add these private helpers to the `// ---------- shared ----------` part:

```ts
  private async loadForDecision(
    id: string,
    caller: JoinRequestCaller,
  ): Promise<StudentJoinRequest> {
    const request = await this.prisma.studentJoinRequest.findFirst({
      where: { id, companyId: caller.companyId },
    });
    if (!request) throw new NotFoundException("So'rov topilmadi");
    await assertCallerInBranch(this.prisma, caller.id, request.branchId);
    if (request.status !== 'PENDING') {
      throw new ConflictException(ALREADY_DECIDED);
    }
    if (request.taskId) {
      const task = await this.prisma.task.findUnique({
        where: { id: request.taskId },
        select: { claimedById: true },
      });
      await assertMayDecide(this.prisma, task?.claimedById ?? null, caller);
    }
    return request;
  }

  /** REJECTED or EXPIRED, with the task closed; false when it was decided meanwhile. */
  private async closeRequest(
    request: StudentJoinRequest,
    status: 'REJECTED' | 'EXPIRED',
    actorId: number | null,
    reason: string | null,
  ): Promise<boolean> {
    const closeReason: JoinTaskCloseReason =
      status === 'REJECTED' ? 'JOIN_REJECTED' : 'JOIN_EXPIRED';
    const now = new Date();
    const closed = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.studentJoinRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: {
          status,
          decidedById: actorId,
          decidedAt: now,
          rejectReason: reason,
          photo: null,
        },
      });
      if (count === 0) return false;
      await closeJoinRequestTask(tx, request.taskId, actorId, closeReason);
      return true;
    });
    if (closed) await this.afterClose(request);
    return closed;
  }

  /** The rejection or expiry message, with the branch's phone. */
  private async tellClosed(
    request: StudentJoinRequest,
    text: (p: {
      firstName: string;
      groupName: string;
      phone: string | null;
    }) => string,
  ): Promise<void> {
    const [group, phone] = await Promise.all([
      this.prisma.group.findUnique({
        where: { id: request.groupId },
        select: { name: true },
      }),
      loadContactPhone(this.prisma, request.branchId, request.companyId),
    ]);
    await this.sendToPerson({
      chatId: request.chatId,
      photo: null,
      text: text({
        firstName: request.firstName,
        groupName: group?.name ?? '—',
        phone,
      }),
    });
  }

  /** True when `JoinRequestNotifier` delivered it; no bot or a failure is false. */
  private async sendToPerson(
    message: JoinRequestMessageEvent,
  ): Promise<boolean> {
    try {
      const results: unknown[] = await this.events.emitAsync(
        JOIN_REQUEST_MESSAGE,
        message,
      );
      return results.some((r) => r === true);
    } catch (error) {
      this.logger.warn(
        `So'rov xabari yuborilmadi (chat ${message.chatId}): ${(error as Error).message}`,
      );
      return false;
    }
  }
```

- [ ] **Step 8: Close the bell rows with the request**

In `server/src/notifications/notification-resolver.service.ts`:

1. Add imports:

```ts
import {
  JOIN_REQUEST_CLOSED,
  type JoinRequestClosedEvent,
} from '../student-join-requests/join-request-events';
```

2. After the `onTaskUnassigned` handler, add:

```ts
  /** A join request decided, expired or replaced: its task's notices close (ADR-0080). */
  @OnEvent(JOIN_REQUEST_CLOSED)
  async onJoinRequestClosed(p: JoinRequestClosedEvent): Promise<void> {
    await this.resolve({ companyId: p.companyId, taskId: p.taskId });
  }
```

Create `server/src/notifications/notification-resolver.join-request.spec.ts`:

```ts
import { NotificationResolverService } from './notification-resolver.service';

describe('NotificationResolverService — join requests', () => {
  it("closes the open rows of the request's task and tells their owners", async () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([{ id: 'n1', userId: 3 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const gateway = { sendToUser: jest.fn() };
    const service = new NotificationResolverService(
      prisma as any,
      gateway as any,
    );

    await service.onJoinRequestClosed({ companyId: 1001, taskId: 't1' });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        taskId: 't1',
        actionRequired: true,
        resolvedAt: null,
      },
      select: { id: true, userId: true },
    });
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: 'notification.resolved', ids: ['n1'] }),
    );
  });
});
```

- [ ] **Step 9: Run the tests**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx jest src/student-join-requests src/notifications/notification-resolver src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: PASS. `event-wiring.spec.ts` reports `student-join-request.message` as emitted with nobody listening until Task 9 — if it fails here only on that event, go on: Task 9 adds the listener. `student-join-request.closed` has its listener now.

- [ ] **Step 10: Format and commit**

```bash
npx prettier --write src/student-join-requests src/notifications/notification-resolver.service.ts src/notifications/notification-resolver.join-request.spec.ts
git add src/student-join-requests src/notifications/notification-resolver.service.ts src/notifications/notification-resolver.join-request.spec.ts
git commit -m "feat(join-requests): approve, reject and expire a request; its bell rows close with it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The bot tells the person

**Files:**
- Create: `server/src/telegram/join-request-notifier.ts`, `server/src/telegram/join-request-notifier.spec.ts`
- Modify: `server/src/telegram/telegram.module.ts`

**Interfaces:**
- Produces: `JoinRequestNotifier.send(e: JoinRequestMessageEvent): Promise<boolean>`, listening to `JOIN_REQUEST_MESSAGE`.
- Consumes: `TelegramService.getBot()`; `describeError` from `src/telegram-digest/telegram-send.ts`.

- [ ] **Step 1: Write the failing test**

`server/src/telegram/join-request-notifier.spec.ts`:

```ts
import { JoinRequestNotifier } from './join-request-notifier';

function notifier(telegram: Record<string, jest.Mock> | null) {
  const service = {
    getBot: () => (telegram ? { telegram } : undefined),
  };
  const n = new JoinRequestNotifier(service as any);
  jest.spyOn((n as any).logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn((n as any).logger, 'error').mockImplementation(() => undefined);
  return n;
}

const MESSAGE = { chatId: '555444', text: '<b>salom</b>', photo: 'https://r2/p.jpg' };

describe('JoinRequestNotifier', () => {
  it('is false without a bot', async () => {
    expect(await notifier(null).send(MESSAGE)).toBe(false);
  });

  it('sends the photo with the text as its caption', async () => {
    const telegram = {
      sendPhoto: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn(),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(true);
    expect(telegram.sendPhoto).toHaveBeenCalledWith(
      '555444',
      'https://r2/p.jpg',
      { caption: '<b>salom</b>', parse_mode: 'HTML' },
    );
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('falls back to text when the photo cannot go', async () => {
    const telegram = {
      sendPhoto: jest.fn().mockRejectedValue(new Error('failed to get HTTP URL content')),
      sendMessage: jest.fn().mockResolvedValue({}),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(true);
    expect(telegram.sendMessage).toHaveBeenCalledWith('555444', '<b>salom</b>', {
      parse_mode: 'HTML',
    });
  });

  it('sends text alone when there is no photo', async () => {
    const telegram = { sendPhoto: jest.fn(), sendMessage: jest.fn().mockResolvedValue({}) };
    expect(await notifier(telegram).send({ ...MESSAGE, photo: null })).toBe(true);
    expect(telegram.sendPhoto).not.toHaveBeenCalled();
  });

  it('is false when nothing reaches the person', async () => {
    const blocked = new Error('403: Forbidden: bot was blocked by the user');
    const telegram = {
      sendPhoto: jest.fn().mockRejectedValue(blocked),
      sendMessage: jest.fn().mockRejectedValue(blocked),
    };
    expect(await notifier(telegram).send(MESSAGE)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/telegram/join-request-notifier.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the notifier**

`server/src/telegram/join-request-notifier.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { describeError } from '../telegram-digest/telegram-send';
import {
  JOIN_REQUEST_MESSAGE,
  type JoinRequestMessageEvent,
} from '../student-join-requests/join-request-events';
import { TelegramService } from './telegram.service';

/**
 * Sends a join request's decision to the person who asked (ADR-0080). A bot
 * flow, so it goes at once (ADR-0025's instant list; `src/telegram/` is on
 * `direct-send.guard.spec.ts`). Answers whether it was delivered: the
 * approval's toast says so when it was not. Log lines carry `describeError`
 * only — the approval text holds the password.
 */
@Injectable()
export class JoinRequestNotifier {
  private readonly logger = new Logger(JoinRequestNotifier.name);

  constructor(private readonly telegram: TelegramService) {}

  @OnEvent(JOIN_REQUEST_MESSAGE)
  async send(e: JoinRequestMessageEvent): Promise<boolean> {
    const bot = this.telegram.getBot();
    if (!bot) return false;
    if (e.photo) {
      try {
        await bot.telegram.sendPhoto(e.chatId, e.photo, {
          caption: e.text,
          parse_mode: 'HTML',
        });
        return true;
      } catch (err) {
        this.logger.warn(
          `So'rov xabari rasm bilan ketmadi, matn bilan yuboriladi (chat ${e.chatId}): ${describeError(err)}`,
        );
      }
    }
    try {
      await bot.telegram.sendMessage(e.chatId, e.text, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      this.logger.error(
        `So'rov xabari yetkazilmadi (chat ${e.chatId}): ${describeError(err)}`,
      );
      return false;
    }
  }
}
```

In `server/src/telegram/telegram.module.ts`, add `JoinRequestNotifier` to `providers` (with its import).

- [ ] **Step 4: Run the tests**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx jest src/telegram/join-request-notifier.spec.ts src/common/event-wiring.spec.ts src/telegram-digest/direct-send.guard.spec.ts
```

Expected: PASS (both join-request events now have a listener; the sender lives under `src/telegram/`).

- [ ] **Step 5: Format and commit**

```bash
npx prettier --write src/telegram/join-request-notifier.ts src/telegram/join-request-notifier.spec.ts src/telegram/telegram.module.ts
git add src/telegram/join-request-notifier.ts src/telegram/join-request-notifier.spec.ts src/telegram/telegram.module.ts
git commit -m "feat(bot): tell the person when their join request is decided or expires

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The endpoints

**Files:**
- Create: `server/src/student-join-requests/dto/approve-join-request.dto.ts`, `server/src/student-join-requests/dto/reject-join-request.dto.ts`
- Create: `server/src/student-join-requests/student-join-requests.controller.ts`, `server/src/student-join-requests/student-join-requests.controller.spec.ts`
- Modify: `server/src/student-join-requests/student-join-requests.module.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Produces:
  - `GET /student-join-requests/by-task/:taskId` → `JoinRequestView`;
  - `POST /student-join-requests/:id/approve` `{ groupId?: string }` → `{ status: 'APPROVED'; studentId: number; delivered: boolean }`;
  - `POST /student-join-requests/:id/reject` `{ reason: string }` → `{ status: 'REJECTED' }`.
  - Every route is `@Can('students.enroll')`: CEO, Branch Director and Administrator by default.

- [ ] **Step 1: Write the failing controller test**

`server/src/student-join-requests/student-join-requests.controller.spec.ts`:

```ts
import { StudentJoinRequestsController } from './student-join-requests.controller';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';

describe('StudentJoinRequestsController — route access', () => {
  it.each(['byTask', 'approve', 'reject'] as const)(
    '%s is gated by «Guruhga qo\'shish», the admin door\'s own capability',
    (name) => {
      expect(routeAccess(StudentJoinRequestsController, name)).toEqual({
        kind: 'can',
        keys: ['students.enroll'],
      });
      expect(defaultRolesOf(StudentJoinRequestsController, name)).toEqual([
        'Administrator',
        'Branch Director',
        'CEO',
      ]);
    },
  );

  it('passes the caller with its database roles', async () => {
    const service = {
      approve: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
      reject: jest.fn().mockResolvedValue({ status: 'REJECTED' }),
      getByTask: jest.fn().mockResolvedValue({}),
    };
    const c = new StudentJoinRequestsController(service as any);

    await c.approve('r1', { groupId: 'g2' }, 10002, 1001, ['Administrator']);
    await c.reject('r1', { reason: 'x' }, 10002, 1001, ['Administrator']);
    await c.byTask('t1', 10002, 1001, ['Administrator']);

    const caller = { id: 10002, companyId: 1001, roles: ['Administrator'] };
    expect(service.approve).toHaveBeenCalledWith('r1', 'g2', caller);
    expect(service.reject).toHaveBeenCalledWith('r1', 'x', caller);
    expect(service.getByTask).toHaveBeenCalledWith('t1', caller);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/student-join-requests/student-join-requests.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the DTOs and the controller**

`server/src/student-join-requests/dto/approve-join-request.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class ApproveJoinRequestDto {
  /** Another group of the same branch (spec D7); the requested one when omitted. */
  @IsOptional()
  @IsString()
  groupId?: string;
}
```

`server/src/student-join-requests/dto/reject-join-request.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectJoinRequestDto {
  // Trimmed before the checks, so a reason of spaces is refused. Staff see
  // it; the person never does (spec D8).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  reason: string;
}
```

`server/src/student-join-requests/student-join-requests.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import { ApproveJoinRequestDto } from './dto/approve-join-request.dto';
import { RejectJoinRequestDto } from './dto/reject-join-request.dto';
import { StudentJoinRequestsService } from './student-join-requests.service';

/**
 * Join requests (ADR-0080). Each route checks the caller against the
 * request's branch (`assertCallerInBranch`), not the header.
 */
@Controller('student-join-requests')
export class StudentJoinRequestsController {
  constructor(private readonly joinRequests: StudentJoinRequestsService) {}

  @Get('by-task/:taskId')
  @Can('students.enroll')
  byTask(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.joinRequests.getByTask(taskId, {
      id: userId,
      companyId,
      roles,
    });
  }

  @Post(':id/approve')
  @Can('students.enroll')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveJoinRequestDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.joinRequests.approve(id, dto.groupId, {
      id: userId,
      companyId,
      roles,
    });
  }

  @Post(':id/reject')
  @Can('students.enroll')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectJoinRequestDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.joinRequests.reject(id, dto.reason, {
      id: userId,
      companyId,
      roles,
    });
  }
}
```

Add `controllers: [StudentJoinRequestsController],` to `StudentJoinRequestsModule` (with its import).

- [ ] **Step 4: Record the routes in the two manifests**

Snapshot rows (keeps the file sorted, the way it is):

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
node -e "
const f='src/common/permissions/route-access.snapshot.json';
const s=JSON.parse(require('fs').readFileSync(f,'utf8'));
const R=['Administrator','Branch Director','CEO'];
s['GET /student-join-requests/by-task/:taskId']=R;
s['POST /student-join-requests/:id/approve']=R;
s['POST /student-join-requests/:id/reject']=R;
const o={};for(const k of Object.keys(s).sort())o[k]=s[k];
require('fs').writeFileSync(f,JSON.stringify(o,null,2)+'\n');
"
git diff --stat src/common/permissions/route-access.snapshot.json
```

Expected: `1 file changed, 15 insertions(+)` — no other line moved.

In `server/src/common/auth/branch-route-policy.ts`, add a block to `ROUTE_POLICIES` after the contract documents block (the one whose routes start with `'GET /contract-documents'`):

```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Join requests (ADR-0080). Every route loads the request — by its task ' +
      'for the read, by id for the decisions — and checks the caller against ' +
      "the request's branch with `assertCallerInBranch`. The header branch is " +
      'never read: a request belongs to the branch whose link the person used.',
    routes: [
      'GET /student-join-requests/by-task/:taskId',
      'POST /student-join-requests/:id/approve',
      'POST /student-join-requests/:id/reject',
    ],
  },
```

- [ ] **Step 5: Run the tests**

```bash
npx jest src/student-join-requests src/common/permissions src/common/auth/branch-route-policy.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Format and commit**

```bash
npx prettier --write src/student-join-requests src/common/auth/branch-route-policy.ts
git add src/student-join-requests src/common/permissions/route-access.snapshot.json src/common/auth/branch-route-policy.ts
git commit -m "feat(join-requests): endpoints to read, approve and reject a request

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The 21:00 report counts requests left a day

**Files:**
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts`
- Test: `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`

**Interfaces:**
- Produces: the «Diqqat» line `• Javobsiz o'quvchi so'rovlari (1 kundan ortiq): <b>N</b> ta — «Topshiriqlar»da javob bering`.

- [ ] **Step 1: Write the failing tests**

In the spec:

1. Add `staleJoinRequests?: number;` to the state type next to `staleUnmarked?: number;` (line ~45).
2. In `makePrisma`, next to `unmarkedLesson: { … }`, add:

```ts
    studentJoinRequest: {
      count: jest.fn(async () => state.staleJoinRequests ?? 0),
    },
```

3. After the test `'prints no «Javobsiz darslar» line when nothing is waiting'`, add:

```ts
  it('flags join requests waiting more than a day (ADR-0080)', async () => {
    const state = { ...defaultState(), staleJoinRequests: 2 };
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).toContain(
      "• Javobsiz o'quvchi so'rovlari (1 kundan ortiq): <b>2</b> ta",
    );
    expect(prisma.studentJoinRequest.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        companyId: 1001,
        status: 'PENDING',
        createdAt: { lt: expect.any(Date) },
      }),
    });
  });

  it('prints no join request line when nothing waits', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).not.toContain("o'quvchi so'rovlari");
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts`
Expected: the first new test FAILS.

- [ ] **Step 3: Count and print**

In `telegram-group-daily-report.service.ts`, `build()`:

1. Add `staleJoinRequests,` to the destructured names after `staleUnmarked,`.
2. Add, after the `this.prisma.unmarkedLesson.count({ … })` entry of the `Promise.all` array:

```ts
      // Bot sign-ups no administrator answered for more than a day
      // (ADR-0080 / spec D10), scoped like the rest of the report.
      this.prisma.studentJoinRequest.count({
        where: {
          companyId,
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          ...branchIdWhere(branchIds),
        },
      }),
```

3. The flags call becomes `this.buildFlagLines(todayFlags, attendancePct, staleUnmarked, staleJoinRequests)`.
4. `buildFlagLines` gets a fourth parameter `staleJoinRequests: number,` and, after the `staleUnmarked` block:

```ts
    if (staleJoinRequests > 0) {
      lines.push(
        `• Javobsiz o'quvchi so'rovlari (1 kundan ortiq): <b>${staleJoinRequests}</b> ta — «Topshiriqlar»da javob bering`,
      );
    }
```

- [ ] **Step 4: Run the tests**

Run: `cd server && npx jest src/telegram-groups`
Expected: PASS. If a branch-scope coverage spec for this report fails on the new query, its message names it — the query carries `branchIdWhere`, so add it to that spec's expected list the way `unmarkedLesson` is listed.

- [ ] **Step 5: Format and commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npx prettier --write src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts
git add src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts
git commit -m "feat(report): the 21:00 report flags join requests left more than a day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The task sheet's «So'rov» block

**Files:**
- Create: `client/src/components/tasks/join-request/join-request-rules.ts`, `client/src/components/tasks/join-request/join-request-rules.test.ts`
- Create: `client/src/components/tasks/join-request/join-request-panel.tsx`
- Modify: `client/src/hooks/use-tasks.ts:12`, `client/src/components/tasks/task-labels.ts:21-23`, `client/src/components/tasks/task-drawer.tsx`

**Interfaces:**
- Consumes: the three endpoints of Task 10.
- Produces:
  - `JoinRequestView` (client mirror, dates as ISO strings);
  - `joinRequestNotes(v, groupId: string | null, leadStatusLabel: string | null): JoinNote[]`;
  - `canApprove(v, groupId: string | null): boolean`;
  - `initialGroupId(v): string | null`;
  - `decidedLine(v): string | null`;
  - `JoinRequestPanel({ taskId, onDecided })`.

- [ ] **Step 1: Add the kind**

`client/src/hooks/use-tasks.ts` line 12:

```ts
export type TaskKind = "MANUAL" | "LESSON_QUESTION" | "CALLBACK" | "BROKEN_PROMISE" | "UNCALLED_LEAD" | "JOIN_REQUEST";
```

`client/src/components/tasks/task-labels.ts`, `KIND_LABEL` — add `JOIN_REQUEST: "O'quvchi so'rovi",` after `UNCALLED_LEAD: "Qo'ng'iroqsiz lid",`.

- [ ] **Step 2: Write the failing rules test**

`client/src/components/tasks/join-request/join-request-rules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canApprove, decidedLine, initialGroupId, joinRequestNotes, type JoinRequestView } from "./join-request-rules";

const VIEW: JoinRequestView = {
  id: "r1", status: "PENDING", createdAt: "2026-10-10T09:02:00.000Z", decidedAt: null, rejectReason: null,
  firstName: "Dilnoza", lastName: "Aliyeva", phone: "901234567", photo: null, telegramUsername: "dilnoza_a",
  requestedGroup: { id: "g1", name: "A1-07" }, approvedGroup: null, studentId: null, decidedBy: null,
  groups: [{ id: "g1", name: "A1-07", teacherName: "Madina Karimova" }, { id: "g2", name: "A1-09", teacherName: null }],
  sameNameGroupIds: [], lead: null, archivedStudentId: null,
};

describe("join request rules", () => {
  it("starts on the requested group while it takes students", () => {
    expect(initialGroupId(VIEW)).toBe("g1");
    expect(initialGroupId({ ...VIEW, groups: [VIEW.groups[1]] })).toBeNull();
  });

  it("approves only a pending request into a listed group", () => {
    expect(canApprove(VIEW, "g2")).toBe(true);
    expect(canApprove(VIEW, null)).toBe(false);
    expect(canApprove(VIEW, "g9")).toBe(false);
    expect(canApprove({ ...VIEW, status: "REJECTED" }, "g1")).toBe(false);
  });

  it("has no notes for a clean request", () => {
    expect(joinRequestNotes(VIEW, "g1", null)).toEqual([]);
  });

  it("names the lead, the archived card and the same name in the chosen group", () => {
    const v: JoinRequestView = {
      ...VIEW,
      lead: { createdAt: "2026-10-03T07:00:00.000Z", status: "CONTACTED", archived: false, sourceName: "Instagram forma" },
      archivedStudentId: 10942,
      sameNameGroupIds: ["g2"],
    };
    expect(joinRequestNotes(v, "g1", "Aloqaga chiqilgan")).toEqual([
      { tone: "info", text: "Lid: 03.10.2026 · Instagram forma · Aloqaga chiqilgan" },
      { tone: "warning", text: "Bu raqam arxivdagi #10942 o'quvchiniki — uni tiklash to'g'riroq bo'lishi mumkin" },
    ]);
    expect(joinRequestNotes(v, "g2", "Aloqaga chiqilgan")).toContainEqual({ tone: "warning", text: "Guruhda shu ismli o'quvchi bor" });
  });

  it("marks an archived lead and a lead with no source", () => {
    const v: JoinRequestView = { ...VIEW, lead: { createdAt: "2026-10-03T07:00:00.000Z", status: "LOST", archived: true, sourceName: null } };
    expect(joinRequestNotes(v, "g1", "Yo'qotilgan")[0].text).toBe("Lid: 03.10.2026 · manbasiz · Yo'qotilgan (arxivda)");
  });

  it("says when the requested group no longer takes students", () => {
    const v = { ...VIEW, groups: [VIEW.groups[1]] };
    expect(joinRequestNotes(v, null, null)).toEqual([
      { tone: "error", text: "«A1-07» guruhiga yozilib bo'lmaydi — boshqa guruhni tanlang" },
    ]);
  });

  it("reads a decided request as one line", () => {
    expect(decidedLine(VIEW)).toBeNull();
    expect(decidedLine({
      ...VIEW, status: "APPROVED", studentId: 11345, decidedAt: "2026-10-10T09:05:00.000Z",
      decidedBy: { id: 10002, firstName: "Bobur", lastName: "Aliyev" },
    })).toBe("Tasdiqlandi — #11345 (Bobur A., 10.10.2026)");
    expect(decidedLine({ ...VIEW, status: "REJECTED", rejectReason: "begona odam" })).toBe("Rad etildi: begona odam");
    expect(decidedLine({ ...VIEW, status: "EXPIRED" })).toBe("Muddati o'tdi — 7 kun ichida javob berilmadi");
    expect(decidedLine({ ...VIEW, status: "REPLACED" })).toBe("Yangi so'rov bilan almashtirildi");
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd client && npx vitest run src/components/tasks/join-request/join-request-rules.test.ts`
Expected: FAIL — cannot resolve `./join-request-rules`.

- [ ] **Step 4: Write the rules**

`client/src/components/tasks/join-request/join-request-rules.ts`:

```ts
import { format } from "date-fns";

/** `GET /student-join-requests/by-task/:taskId` (server `join-request-view.ts`). */
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REPLACED";
export interface JoinRequestView {
  id: string; status: JoinRequestStatus; createdAt: string; decidedAt: string | null; rejectReason: string | null;
  firstName: string; lastName: string; phone: string; photo: string | null; telegramUsername: string | null;
  requestedGroup: { id: string; name: string } | null; approvedGroup: { id: string; name: string } | null;
  studentId: number | null; decidedBy: { id: number; firstName: string; lastName: string } | null;
  /** The branch's groups that take students. */
  groups: { id: string; name: string; teacherName: string | null }[];
  sameNameGroupIds: string[];
  lead: { createdAt: string; status: string; archived: boolean; sourceName: string | null } | null;
  archivedStudentId: number | null;
}
export interface JoinNote { tone: "info" | "warning" | "error"; text: string }

const day = (iso: string) => format(new Date(iso), "dd.MM.yyyy");

/** The requested group while it still takes students; otherwise the administrator picks one. */
export function initialGroupId(v: JoinRequestView): string | null {
  const id = v.requestedGroup?.id;
  return id && v.groups.some((g) => g.id === id) ? id : null;
}

/** The server refuses anything else; the button mirrors it. */
export function canApprove(v: JoinRequestView, groupId: string | null): boolean {
  return v.status === "PENDING" && groupId !== null && v.groups.some((g) => g.id === groupId);
}

/** What the server found about this person (spec §5.3). */
export function joinRequestNotes(v: JoinRequestView, groupId: string | null, leadStatusLabel: string | null): JoinNote[] {
  const notes: JoinNote[] = [];
  if (v.lead) {
    const archived = v.lead.archived ? " (arxivda)" : "";
    notes.push({ tone: "info", text: `Lid: ${day(v.lead.createdAt)} · ${v.lead.sourceName ?? "manbasiz"} · ${leadStatusLabel ?? v.lead.status}${archived}` });
  }
  if (v.archivedStudentId !== null) {
    notes.push({ tone: "warning", text: `Bu raqam arxivdagi #${v.archivedStudentId} o'quvchiniki — uni tiklash to'g'riroq bo'lishi mumkin` });
  }
  if (groupId !== null && v.sameNameGroupIds.includes(groupId)) {
    notes.push({ tone: "warning", text: "Guruhda shu ismli o'quvchi bor" });
  }
  if (v.status === "PENDING" && initialGroupId(v) === null) {
    notes.push({ tone: "error", text: `«${v.requestedGroup?.name ?? "So'ralgan guruh"}» guruhiga yozilib bo'lmaydi — boshqa guruhni tanlang` });
  }
  return notes;
}

/** A decided request reads as one line; a pending one has none. */
export function decidedLine(v: JoinRequestView): string | null {
  switch (v.status) {
    case "PENDING":
      return null;
    case "APPROVED": {
      const who = v.decidedBy ? `${v.decidedBy.firstName} ${v.decidedBy.lastName.slice(0, 1)}.` : "Tizim";
      return `Tasdiqlandi — #${v.studentId} (${who}, ${v.decidedAt ? day(v.decidedAt) : "—"})`;
    }
    case "REJECTED":
      return `Rad etildi: ${v.rejectReason ?? ""}`.trim();
    case "EXPIRED":
      return "Muddati o'tdi — 7 kun ichida javob berilmadi";
    case "REPLACED":
      return "Yangi so'rov bilan almashtirildi";
  }
}
```

- [ ] **Step 5: Run the rules test**

Run: `cd client && npx vitest run src/components/tasks/join-request/join-request-rules.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the panel**

`client/src/components/tasks/join-request/join-request-panel.tsx`:

```tsx
"use client";
import { useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPhone } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/hooks/use-leads-board";
import { canApprove, decidedLine, initialGroupId, joinRequestNotes, type JoinNote, type JoinRequestView } from "./join-request-rules";

// Blue and yellow, not sky and amber: outside the student portal those two
// resolve to Lumio variables and render transparent.
const TONE: Record<JoinNote["tone"], string> = {
  info: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  warning: "bg-yellow-50 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200",
  error: "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

/** «Yangi o'quvchi so'rovi» (ADR-0080): the request, what the server found, and the decision. */
export function JoinRequestPanel({ taskId, onDecided }: { taskId: string; onDecided: () => void }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["join-request", taskId],
    queryFn: async () => (await api.get<JoinRequestView>(`/student-join-requests/by-task/${taskId}`)).data,
    retry: false,
    staleTime: 0,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  if (isLoading) return <Skeleton className="h-44 w-full" />;
  if (isError || !data) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span>So&apos;rovni yuklab bo&apos;lmadi</span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>Qayta urinish</Button>
      </div>
    );
  }

  const decided = decidedLine(data);
  if (decided) return <p className="rounded-md bg-muted px-3 py-2 text-sm">{decided}</p>;

  const groupId = picked ?? initialGroupId(data);
  const leadLabel = data.lead ? (LEAD_STATUS_LABELS[data.lead.status as LeadStatus] ?? null) : null;
  const notes = joinRequestNotes(data, groupId, leadLabel);

  const approve = async () => {
    if (!groupId) return;
    setBusy("approve");
    try {
      const res = await api.post<{ studentId: number; delivered: boolean }>(`/student-join-requests/${data.id}/approve`, { groupId });
      toast.success(`O'quvchi guruhga qo'shildi — #${res.data.studentId}`);
      if (!res.data.delivered) toast.error("Xabar Telegram'ga yetmadi — o'quvchi parolni botdagi «Parolni tiklash» orqali oladi");
      onDecided();
    } catch (e) {
      toast.error(getErrorMessage(e, "Tasdiqlashda xatolik yuz berdi"));
    } finally {
      setBusy(null);
      void refetch();
    }
  };

  const reject = async () => {
    setBusy("reject");
    try {
      await api.post(`/student-join-requests/${data.id}/reject`, { reason: reason.trim() });
      toast.success("So'rov rad etildi");
      setRejectOpen(false);
      setReason("");
      onDecided();
    } catch (e) {
      toast.error(getErrorMessage(e, "Rad etishda xatolik yuz berdi"));
    } finally {
      setBusy(null);
      void refetch();
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-3">
      <div className="flex gap-3">
        {data.photo
          ? <img src={data.photo} alt="" className="size-20 shrink-0 rounded-md object-cover" />
          : <div className="size-20 shrink-0 rounded-md bg-muted" />}
        <div className="min-w-0 space-y-0.5 text-sm">
          <p className="font-semibold">{data.firstName} {data.lastName}</p>
          <p className="text-muted-foreground">{formatPhone(data.phone)}</p>
          {data.telegramUsername && (
            <a href={`https://t.me/${data.telegramUsername}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">@{data.telegramUsername}</a>
          )}
          <p className="text-xs text-muted-foreground">So&apos;rov: {format(new Date(data.createdAt), "dd.MM.yyyy, HH:mm")}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="shrink-0 text-muted-foreground">Guruh</span>
        <Select value={groupId ?? undefined} onValueChange={setPicked}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Guruhni tanlang" /></SelectTrigger>
          <SelectContent>
            {data.groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {notes.map((n) => <p key={n.text} className={cn("rounded-md px-3 py-2 text-xs", TONE[n.tone])}>{n.text}</p>)}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => setRejectOpen(true)}>Rad etish</Button>
        <Button disabled={!canApprove(data, groupId) || busy !== null} onClick={() => void approve()}>
          {busy === "approve" && <Loader2 className="mr-1.5 size-4 animate-spin" />}Tasdiqlash
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={(open) => { if (busy === null) setRejectOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>So&apos;rovni rad etish</DialogTitle>
            <DialogDescription>Sabab faqat xodimlarga ko&apos;rinadi. O&apos;quvchiga sababsiz, muloyim xabar boradi.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: bu odam markazda o'qimaydi" />
          <DialogFooter>
            <Button variant="outline" disabled={busy !== null} onClick={() => setRejectOpen(false)}>Bekor qilish</Button>
            <Button variant="destructive" disabled={!reason.trim() || busy !== null} onClick={() => void reject()}>
              {busy === "reject" && <Loader2 className="mr-1.5 size-4 animate-spin" />}Rad etish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
```

- [ ] **Step 7: Show it in the task sheet**

In `client/src/components/tasks/task-drawer.tsx`:

1. Import: `import { JoinRequestPanel } from "./join-request/join-request-panel";`
2. Right after the `{lesson?.status === "PENDING" && ( <UnmarkedLessonPrompt … /> )}` block, add:

```tsx
        {task.kind === "JOIN_REQUEST" && (
          <JoinRequestPanel taskId={task.id} onDecided={() => void useTasks.getState().reloadDetail(task.id)} />
        )}
```

- [ ] **Step 8: Check the client**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/client
npx tsc --noEmit
npx eslint src/components/tasks src/hooks/use-tasks.ts
npx vitest run src/components/tasks
```

Expected: tsc clean; eslint no errors (a `no-img-element` warning on the photo is accepted); vitest PASS.

- [ ] **Step 9: Commit (no prettier on the client)**

```bash
git add src/hooks/use-tasks.ts src/components/tasks/task-labels.ts src/components/tasks/task-drawer.tsx src/components/tasks/join-request
git commit -m "feat(tasks): the join request block in the task sheet — approve or reject

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ADR, developer docs, user guide

**Files:**
- Create: `docs/adr/0080-botdan-qoshilish-sorov-va-tasdiq.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`
- Modify: `client/src/qollanma/kontent/oquvchilar/yangi-oquvchi.mdx`, `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: Check the ADR number**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi
git fetch -q origin main && git show origin/main:docs/adr/README.md | grep -o "\[00[0-9][0-9]\]" | tail -1
```

Expected: `[0079]`. If main already has 0080, use the next free number in the file name, the title and every reference below.

- [ ] **Step 2: Write the ADR**

`docs/adr/0080-botdan-qoshilish-sorov-va-tasdiq.md`:

```markdown
# ADR-0080 — Botdan o'quvchi o'zi qo'shilmaydi: so'rov va administrator tasdig'i

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0017 (har o'quvchi lid qoldiradi), ADR-0025 (20:00 yig'ma — «darhol qolganlar» ro'yxatiga qo'shiladi), ADR-0033 (karta hisobi bilan tug'iladi), ADR-0054 («Dars bo'ldimi?» — tizim topshirig'i namunasi), ADR-0066 (chat botni rad etishi mumkin), ADR-0074, ADR-0076, ADR-0078, ADR-0079, dizayn `docs/superpowers/specs/2026-10-10-guruhga-qoshilish-tasdigi-design.md`, `server/src/student-join-requests/`, `server/src/tasks/join-request-task.ts`, migratsiya `20261010200000_student_join_request`

## Kontekst

Guruh QR kodi va havolalari (`student_<filial>_group_<guruh>`, `student_<filial>`) imzosiz va muddatsiz. Havola kimga tushsa, o'sha odam botda ro'yxatdan o'tardi va shu zahoti o'quvchi kartasi, guruh, kabinet paroli, oylik hisob va CONVERTED lid yozilardi — hech kim tekshirmasdi.

Prod, 10.10.2026: botdan oyiga ~200 kishi qo'shiladi. Avgust–oktabrda 35 kishi na darsga kelgan, na to'lagan; ulardan 9 tasi guruhdan chiqarilgan, lekin 670 433 so'm qarzi qarzdorlar ro'yxatida qolgan. 6 tasi bir odamning ikkinchi kartasi. Bitta yozuv yopilgan guruhga tushgan: bot guruh holatini o'qimasdi.

## Qaror

1. Botdan ro'yxatdan o'tish **so'rov** bo'ladi (`StudentJoinRequest`). Tasdiqlanmaguncha karta, guruh, hisob, pul va lid o'zgarishi yozilmaydi.
2. Har so'rovga tizim topshirig'i (`TaskKind.JOIN_REQUEST`), «Dars bo'ldimi?» kabi: filial administratorlari (bo'lmasa direktorlar, keyin CEO), birinchi harakat qilgan oladi, CEO va filial direktori har doim javob beradi. Ruxsat — `students.enroll`. Telegram'ga «Ochish» tugmasi bilan boradi; qaror saytda qabul qilinadi.
3. **Tasdiqlash:** administrator filialning o'quvchi qabul qiladigan boshqa guruhini tanlashi mumkin. Karta, guruh va oylik hisob tasdiq kunidan; parol botga yuboriladi. **Rad etish:** sabab majburiy, faqat xodimlarga ko'rinadi; odamga sababsiz xabar boradi. Rad etilgan, muddati o'tgan va almashtirilgan so'rovning rasmi o'chiriladi.
4. **Javobsiz so'rov:** muddat — keyingi ish kuni 10:00; 24 soatdan keyin 21:00 hisobotining «Diqqat» qatori; 7 kunda o'zi yopiladi (`EXPIRED`) va odamga xabar boradi. Hech qachon o'zi tasdiqlanmaydi.
5. Bitta chatga bitta ochiq so'rov (qisman noyob indeks); yangisi eskisini `REPLACED` qiladi.
6. Botning to'rt xabari (qabul qilindi, tasdiqlandi, tasdiqlanmadi, ko'rib chiqilmadi) darhol ketadi — ADR-0025 ning «darhol qolganlar» ro'yxatiga qo'shiladi (bot oqimlari, `src/telegram/`).
7. Bot guruh holatini (`ENROLLABLE_GROUP_STATUSES`: ACTIVE, FORMING, PAUSED — admin eshigi va lid aylantirish bilan bitta ro'yxat) va ustoz holatini tekshiradi.

## Ko'rib chiqilgan muqobillar

- **Imzolangan, 3 kunlik havola** (ADR-0029 kabi): muddat ichida havola baribir hammaga ishlaydi.
- **Har o'quvchiga bir martalik havola:** administrator har kartani oldindan qo'lda ochishi kerak bo'lardi — o'zi ro'yxatdan o'tishning ma'nosi qolmaydi.
- **Kartani «kutilmoqda» holatida yozish:** har ro'yxat, hisobot va hisob-kitob yangi holatni o'rganishi kerak bo'lardi.
- **Avtomatik tasdiqlash yoki muddatsiz kutish:** birinchisi himoyani yo'qqa chiqaradi, ikkinchisida odam javob olmaydi.
- **Telegram tugmasi bilan tasdiqlash:** keyinga. Karta va pul yozadigan amal saytda qoladi.

## Oqibatlari

- Deploydan keyin botdan kelgan har odam administratorni kutadi: ikki filialda kuniga ~7 so'rov.
- Kutish paytida o'quvchi ustozning davomat ro'yxatida yo'q — tez javob berish kerak.
- Ota-onaning ikkinchi farzandi botdan yozilmaydi, avvalgidek: chat ham, telefon ham band.
- `registerStudentFromTelegram` endi faqat tasdiqdan chaqiriladi; tarix qatorlari va lid tasdiqlagan xodim bilan yoziladi.
- Hozirgi 9 ta «havodagi qarz» bu qaror bilan tozalanmaydi — alohida qaror.
```

Add a row at the end of the table in `docs/adr/README.md` (after 0079):

```markdown
| [0080](0080-botdan-qoshilish-sorov-va-tasdiq.md) | Botdan ro'yxatdan o'tish so'rov: administrator tasdiqlamaguncha karta, guruh, hisob va pul yozilmaydi; 7 kunda o'zi yopiladi, hech qachon o'zi tasdiqlanmaydi; bot guruh va ustoz holatini tekshiradi | Qabul qilindi | 2026-10-10 |
```

- [ ] **Step 3: Developer docs**

In `server/CLAUDE.md`, section «Registration deep links», add after the bullet that starts «**Branch lookups in `/start` handlers filter**»:

```markdown
- **A student link opens a request, not an account (ADR-0080).** The scene's «✅ Tasdiqlash» calls `StudentJoinRequestsService.create` (`src/student-join-requests/`): it re-checks the phone, the chat and the group, then writes a `StudentJoinRequest` and a `JOIN_REQUEST` system task (`tasks/join-request-task.ts`) in one Serializable transaction, and the bot says the request waits. No card, enrollment, charge, account or lead change until `approve`, which calls `registerStudentFromTelegram` with the approver (`RegistrationOptions.actorId`) and takes the request inside the card's transaction (`inTx`), so a second approval writes no second card. `reject` and the 09:00 `expireOld` (7 days) close the request and delete its photo; nothing approves a request by silence. One PENDING request per chat (partial unique index); a new one replaces it. Messages to the person go out through `JOIN_REQUEST_MESSAGE` to `JoinRequestNotifier` (`src/telegram/`), so the module never imports `TelegramModule`. The bot offers only groups in `ENROLLABLE_GROUP_STATUSES` (`groups/shared/enrollable-statuses.ts`, shared with the admin door and lead conversion) and only active teachers.
```

In `server/CLAUDE.md`, section «Tasks», add after the «**Lesson task**» bullet:

```markdown
- **Join request task** (`join-request-task.ts`, ADR-0080): kind `JOIN_REQUEST`, `sourceKey` `join:<requestId>`, the same assignee ladder and claim rule as «Dars bo'ldimi?», due the next working day 10:00. Unlike the lesson question it goes to Telegram (a card with «Ochish» only — a system task has no state buttons). It closes only with its request (`closeJoinRequestTask`, `AUTO_CLOSED` with `JOIN_APPROVED | JOIN_REJECTED | JOIN_EXPIRED | JOIN_REPLACED`); `JOIN_REQUEST_CLOSED` closes its bell rows (`NotificationResolverService.onJoinRequestClosed`).
```

In `server/CLAUDE.md`, the «**Instant by design**» bullet of «Telegram digest», add `the four join request messages (ADR-0080, `JoinRequestNotifier`),` after `bot flows (OTP, registration),`.

In `client/CLAUDE.md`, after the «### «Dars bo'ldimi?» (ADR-0054)» section, add:

```markdown
### Join requests (ADR-0080)

- A `JOIN_REQUEST` task's sheet shows `components/tasks/join-request/join-request-panel.tsx` (`GET /student-join-requests/by-task/:taskId`): photo, name, phone, Telegram, the «Guruh» select (the branch's groups that take students, the requested one first) and the server's notes (lead, archived card, same name in the chosen group, closed requested group). «Tasdiqlash» / «Rad etish» (reason required, staff-only) call the two POST routes; a decided request reads as one line. The rules are pure, in `join-request-rules.ts` (unit-tested); the panel computes nothing the server decides.
- Note colours are blue / yellow / red — `sky-*` and `amber-*` render transparent outside the student portal.
```

- [ ] **Step 4: The user guide**

In `client/src/qollanma/kontent/oquvchilar/yangi-oquvchi.mdx`, section «## Telegram orqali ro'yxatdan o'tish»:

Replace the bullet that starts «- Havolani o'quvchiga yuborasiz.» with:

```markdown
- Havolani o'quvchiga yuborasiz. U botda ma'lumotlarini to'ldirib, guruhga yozilish uchun so'rov yuboradi. Administrator tasdiqlamaguncha karta ochilmaydi, guruhga qo'shilmaydi va pul hisoblanmaydi (pastdagi «So'rovni tasdiqlash» bo'limi). Tasdiqlangach karta havoladagi filialga yoziladi va kartada «Telegram botda ro'yxatdan o'tgan» belgisi chiqadi.
```

Replace the bullet that starts «- Botda o'quvchi ustoz va guruhni tanlaydi» with:

```markdown
- Botda o'quvchi ustoz va guruhni tanlaydi (guruhning o'z havolasi bilan kelsa, guruh tanlangan bo'ladi). Botda faqat ishlayotgan ustozlar va o'quvchi qabul qiladigan guruhlar (shakllanayotgan, faol, pauzadagi) chiqadi; yopilgan guruhning havolasiga bot «Bu guruhga hozir yozilib bo'lmaydi» deydi. Oylik kursda oyning puli so'rov tasdiqlangan kundan hisoblanadi: [Guruhga qo'shish va o'tkazish](/qollanma/oquvchilar/guruhga-qoshish).
```

In the bullet that starts «- Mos lid bo'lmasa,», change its first words to «- Tasdiqlanganda, mos lid bo'lmasa,».

Then add a new section right before «## Qo'lda qo'shilgan o'quvchining Telegrami»:

```markdown
## So'rovni tasdiqlash

Botdan kelgan har so'rov filial administratorlariga «Topshiriqlar»da tizim topshirig'i bo'lib chiqadi: «Yangi o'quvchi so'rovi: Ism Familiya → guruh». Xabar qo'ng'iroqchaga va Telegram botga ham keladi (botdagi xabarda «Ochish» tugmasi bor, javob saytda beriladi). Administrator bo'lmasa, topshiriq filial direktoriga, u ham bo'lmasa CEO ga boradi.

1. Topshiriqni oching. «So'rov» blokida o'quvchining rasmi, ismi, telefoni, Telegram nomi va so'rov vaqti turadi.
2. Tizim topgan belgilarni o'qing: «Lid: …» — bu raqam avval lid bo'lib kelgan; «Bu raqam arxivdagi #… o'quvchiniki» — eski kartani tiklash to'g'riroq bo'lishi mumkin; «Guruhda shu ismli o'quvchi bor» — bir odamga ikkinchi karta ochilmasin.
3. Kerak bo'lsa, «Guruh» ro'yxatidan filialning boshqa guruhini tanlang.
4. «Tasdiqlash» — karta ochiladi, o'quvchi guruhga qo'shiladi, oylik pul shu kundan hisoblanadi, login va parol botga boradi. «Rad etish» — sababini yozasiz (uni faqat xodimlar ko'radi), o'quvchiga sababsiz, muloyim xabar boradi.

- Topshiriqni birinchi bosgan administrator oladi; filial direktori va CEO har doim javob bera oladi.
- Muddat — keyingi ish kuni soat 10:00, bir soat oldin eslatma keladi. Bir kundan ortiq javobsiz so'rovlar kechki 21:00 hisobotining «Diqqat» qismida sanaladi.
- 7 kun ichida javob berilmasa, so'rov o'zi yopiladi va o'quvchiga «administrator bilan bog'laning» xabari boradi. So'rov hech qachon o'zi tasdiqlanmaydi.
- Bitta Telegramdan ikkinchi so'rov kelsa, birinchisi yopiladi («Yangi so'rov bilan almashtirildi»).
- Tasdiqlangandan keyin xabar Telegram'ga yetmasa, «Xabar Telegram'ga yetmadi» ogohlantirishi chiqadi: o'quvchi parolni botdagi «Parolni tiklash» orqali oladi.
```

In `client/src/qollanma/kontent/boshlash/topshiriqlar.mdx`, after the section «## Tizim topshirig'i: «Dars bo'ldimi?»» (before the next `##`), add:

```markdown
## Tizim topshirig'i: «Yangi o'quvchi so'rovi»

Telegram botda guruhga yozilish so'rovi kelsa, tizim filialning administratorlariga «Yangi o'quvchi so'rovi: Ism Familiya → guruh» topshirig'ini beradi. Topshiriq varag'idagi «So'rov» blokida «Tasdiqlash» yoki «Rad etish» ni bosasiz; javob berilgach topshiriq o'zi «Bajarildi» ga o'tadi. Bu topshiriq Telegram botga «Ochish» tugmasi bilan keladi. Batafsil — [Yangi o'quvchi qo'shish](/qollanma/oquvchilar/yangi-oquvchi).
```

and in its bullet that starts «- **Kimga nima keladi.**», after ««Dars bo'ldimi?» botga yuborilmaydi.» add « «Yangi o'quvchi so'rovi» botga «Ochish» tugmasi bilan keladi.».

In `client/src/qollanma/yangiliklar.ts`, add as the FIRST entry of the array:

```ts
  {
    sana: "2026-10-10",
    sarlavha: "Botdan guruhga yozilish endi administrator tasdig'i bilan",
    matn: "Guruhning QR kodi yoki havolasi orqali botda ro'yxatdan o'tgan odam endi darhol o'quvchi bo'lmaydi: u so'rov yuboradi. Filial administratorlariga «Yangi o'quvchi so'rovi» topshirig'i chiqadi (qo'ng'iroqchada va Telegram botda ham). Topshiriq varag'ida o'quvchining rasmi, telefoni, Telegram nomi va tizim topgan belgilar (avvalgi lid, arxivdagi karta, guruhda shu ismli o'quvchi) turadi. «Tasdiqlash» bosilganda karta ochiladi, o'quvchi guruhga qo'shiladi, oylik pul shu kundan hisoblanadi va login-parol botga boradi; kerak bo'lsa boshqa guruhni tanlash mumkin. «Rad etish» da sabab yoziladi — uni faqat xodimlar ko'radi, o'quvchiga sababsiz xabar boradi. Bir kundan ortiq javobsiz so'rovlar 21:00 hisobotida sanaladi, 7 kun ichida javob berilmagan so'rov o'zi yopiladi. Bot endi yopilgan guruhga va ishlamayotgan ustozga yozmaydi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "oquvchilar", sahifa: "yangi-oquvchi" },
  },
```

- [ ] **Step 5: Check the guide**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/client
npx vitest run src/qollanma
```

Expected: PASS (the guide's link and entry tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi
git add docs/adr/0080-botdan-qoshilish-sorov-va-tasdiq.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma
git commit -m "docs: ADR-0080, developer notes and the user guide for join requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Full check, browser check, pull request

**Files:** none new (a throwaway seed script is created and deleted).

- [ ] **Step 1: Server, one command at a time**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/server
npm run typecheck
npx eslint src --quiet
npm test
npm run build
```

Expected: typecheck 0 errors; eslint no errors; every suite passes; build OK. Fix and rerun only what fails, once per fix.

- [ ] **Step 2: Client**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```

Expected: tsc clean; the lint summary shows 0 errors; vitest PASS; the build finishes.

- [ ] **Step 3: Browser check on a throwaway database**

Follow the memory recipe `reference_throwaway_local_db.md`: a throwaway database in the `daf-postgres` container, `migrate deploy` (with its two placeholder rows), the seed run with the explicit throwaway URL, an own Redis, the backend with `CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN=`, the client on `127.0.0.1:<port>` with the CORS shim.

Create a request without Telegram. Write `server/scripts/_seed-join-request.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StudentJoinRequestsService } from '../src/student-join-requests/student-join-requests.service';

// Throwaway: creates one join request for the browser check. Delete after use.
async function main() {
  const [groupId, branchId] = process.argv.slice(2);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const out = await app.get(StudentJoinRequestsService).create({
    branchId: Number(branchId),
    groupId,
    chatId: '900000001',
    telegramUsername: 'sinov_odam',
    firstName: 'Sinov',
    lastName: 'Odamov',
    phone: '991234567',
    photo: 'https://placehold.co/200x200.png',
  });
  console.log(JSON.stringify(out));
  await app.close();
}
void main();
```

Pick an ACTIVE group of branch 1 from the throwaway database, then run (same env as the backend):

```bash
DATABASE_URL=<throwaway> CRONS_ENABLED=false TELEGRAM_BOT_TOKEN= TELEGRAM_ADMIN_BOT_TOKEN= REDIS_HOST=127.0.0.1 REDIS_PORT=<own> npx ts-node --transpile-only scripts/_seed-join-request.ts <groupId> 1
```

Expected output: `{"kind":"created","requestId":"…","text":"✅ <b>So'rovingiz qabul qilindi</b>…"}`.

In the browser, signed in as the seeded Administrator (10002):
1. `/tasks` shows «Yangi o'quvchi so'rovi: Sinov Odamov → …» with the «Tizim» and «O'quvchi so'rovi» badges; the bell counts it.
2. The sheet shows the «So'rov» block: photo, `+998 99 123 45 67`, `@sinov_odam`, the group preselected.
3. «Rad etish» with no reason keeps its button disabled.
4. «Tasdiqlash» → toast «O'quvchi guruhga qo'shildi — #…» and, with no bot, the «Xabar Telegram'ga yetmadi…» toast; the block turns into «Tasdiqlandi — #…»; the task is «Bajarildi»; the bell row closed.
5. The new student's card opens, in the group, with a month charge from today.
6. Run the seed again with another phone (`991234568`) and chat (`900000002`), reject it with a reason: the block reads «Rad etildi: …», and no card exists for that phone.

Then delete the seed script, drop the throwaway database and remove the Redis container:

```bash
rm server/scripts/_seed-join-request.ts
```

- [ ] **Step 4: Push and open the pull request**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/guruhga-qoshilish-tasdigi
git fetch -q origin main && git log --oneline HEAD..origin/main | head
```

If main moved, merge it (`git merge origin/main`), recheck the ADR number (Task 13 Step 1), rerun the server and client checks once, then:

```bash
git push -u origin feat/guruhga-qoshilish-tasdigi
gh pr create --base main --head feat/guruhga-qoshilish-tasdigi --title "Join requests: bot sign-ups wait for an administrator's approval" --body "$(cat <<'EOF'
## What
- A bot student link (group QR / copy link, students page «Havola olish») no longer registers anyone. «Tasdiqlash» in the bot writes a `StudentJoinRequest` and a `JOIN_REQUEST` system task for the branch's administrators (bell + Telegram with «Ochish»).
- The task sheet's «So'rov» block shows the person, the server's notes (lead, archived card, same name in the group, closed group) and approves (optionally into another group of the branch) or rejects (staff-only reason).
- Approval runs the existing `registerStudentFromTelegram` with the approver and takes the request inside the card's transaction; the bot sends the login and password.
- Unanswered: due next working day 10:00; the 21:00 report flags requests older than a day; day 7 closes the request and tells the person. Never approved by silence.
- The bot now offers only active teachers and groups that take students (one shared `ENROLLABLE_GROUP_STATUSES`).

## Decisions
ADR-0080. Spec: `docs/superpowers/specs/2026-10-10-guruhga-qoshilish-tasdigi-design.md`.

## Deploy
Server and client together (the old client cannot answer the new task). Migration `20261010200000_student_join_request` runs with the deploy. No script.

## Checks
Server typecheck, eslint, jest, build; client tsc, lint, vitest, next build; browser check on a throwaway database (approve and reject).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: the PR URL. Then bind it with the `ccd_pr` tools (`get_status`, `bind_pr` if needed) and read its CI once. Do not merge: the CEO merges.

---

## Self-review notes

- Spec coverage:

  | Spec | Tasks |
  |---|---|
  | §3.1 | 6, 7 |
  | §3.2 | 6, 7 |
  | §3.3 | 2 |
  | §4 | 1 |
  | §5.1 | 4, 6 |
  | §5.2 | 6, 8 |
  | §5.3 | 8 (view), 12 |
  | §5.4 | 10 |
  | §6.1 | 5, 8, 9 |
  | §6.2 | 8 |
  | §6.3 | 8 |
  | §6.4 | 6 |
  | §7 | 4 (due date and notices), 11 (21:00), 8 (expiry) |
  | §9 | 3 |
  | §10 | every task's tests and 14 |
  | §11 | 13, 14 |

- Names used across tasks:
  - `JoinRequestGateway`, `JoinRequestCaller`, `JoinRequestView`;
  - `closeJoinRequestTask` / `createJoinRequestTask` / `JoinTaskCloseReason`;
  - `JOIN_REQUEST_CLOSED` / `JOIN_REQUEST_MESSAGE`;
  - `ENROLLABLE_GROUP_STATUSES` / `isEnrollableGroupStatus`;
  - `GROUP_CLOSED_REPLY`, `PHONE_TAKEN_REPLY`, `CHAT_TAKEN_REPLY`;
  - `RegistrationOptions { actorId, inTx }`.

  Each is defined once (the task named in its «Interfaces») and used with the same signature.
- Ordering: Task 2 imports `GROUP_CLOSED_REPLY` from Task 3's file. Run Task 3 before Task 2's Step 9, or run the tasks in the order 1, 3, 2, 4, 5, … — the subagent dispatcher should use that order.
