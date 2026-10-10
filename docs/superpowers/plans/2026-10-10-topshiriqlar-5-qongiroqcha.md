# Topshiriqlar — 5-bosqich «Qo'ng'iroqcha» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the notification bell so its number counts only what waits for the viewer, alerts close themselves when their job is done, a day's lesson alerts fold into one line, and every notification is reachable from a new «Barcha bildirishnomalar» page.

**Architecture:** `Notification` gets `actionRequired`, `resolvedAt`, `groupKey`. The first and the last are stamped once at creation by a pure `notificationKind()` inside `NotificationsService.create` — the single writer every sender already goes through. A new `NotificationResolverService` listens to post-commit domain events (attendance saved, lesson cancelled/moved/answered, task closed/reviewed/unassigned, debt paid) and stamps `resolvedAt` on matching open action rows, pushing `notification.resolved` over SSE. `GET /notifications` gains `filter`/`type`/`q`/`cursor`; `unread-count` becomes the badge rule; `GET /notifications/counts` feeds the page. A one-off script closes what was already done and marks >7-day-old unread rows read. The client gets pure helpers (grouping, Tashkent clock), a rewritten store/bell (mockup s19) and a `/notifications` page (mockup s20).

**Tech Stack:** NestJS 11 + Prisma 7 (PostgreSQL), `@nestjs/event-emitter`, Jest; Next.js 16 + React 19 (React Compiler on), zustand 5, `@tanstack/react-query` 5, shadcn/ui, lucide-react, vitest (node env, `*.test.ts` only).

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §8 (lines 376–402), §11 row 5, §13. Mockups: `.superpowers/sdd/2026-10-10-topshiriqlar-5-qongiroqcha/mockup-s19-s20.html` (s19 bell, s20 page).

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup` (branch `feat/topshiriqlar-5-qongiroqcha`). Never `cd` to the main checkout or `/tmp`; use absolute paths inside the worktree. `node_modules` are installed in `server/` and `client/`.
- **Do not touch the dev database.** The dev DB (Neon, `server/.env`) is 8 migrations behind `main`. Never run `prisma migrate deploy`, `migrate dev`, `db push`, `db execute`, `migrate resolve` or the cleanup script against it. The migration SQL is produced offline (schema-to-schema diff, Task 1), checked by hand and covered by specs only. `npx prisma generate` is the only Prisma command that runs.
- UI text is Uzbek, Latin script only, no English word on screen. In JSX write apostrophes inside a JS string (`{"Hammasini o'qilgan qilish"}`), never `&apos;` (an SWC bug drops the space after it).
- Server: run `npx prettier --write <touched .ts files>` before every commit. **Client: never run Prettier.** React Compiler is on: no mutation of props or state.
- Dates: Tashkent day/time only — server `src/common/date/tashkent.ts` (`tashkentDateStr`, `utcMidnightFromDateStr`), client the `+5h` helpers in `notification-view.ts` (Task 5). Never the browser's or the process's local day.
- Notifications are per-user: every read filters `userId` = caller; every resolver write carries the event's `companyId`. No branch logic. Every new route is classified in `server/src/common/auth/branch-route-policy.ts` (Task 3).
- `event-wiring.spec.ts` requires every `@OnEvent` to have an emitter and vice versa; the resolver only listens to events that are already emitted.
- Commits: English message, ending with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit with `git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup …` and repo-relative paths.
- Server gate per task (from `server/`): `npx prettier --write <files> && npx eslint <dirs> --quiet && npx jest <specs> && npm run typecheck`.
- Client gate per task (from `client/`): `npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run <paths>`.
- No ADR: the three columns are additive and derived (type → `actionRequired`/`groupKey`, events → `resolvedAt`), so they can be dropped or recomputed; the badge rule and the one-time cleanup are the CEO-approved spec §8, which stays the record. Server/client `CLAUDE.md` point to it (Task 8).

---

## Design decisions (not dictated by the spec)

1. `actionRequired`/`groupKey` are decided in `NotificationsService.create` — the only writer (all nine sender files call it; nothing else writes `prisma.notification`). The type list is spec §8's; the task plan (`task-notify-plan.ts`, phase 1) already computes a per-notice flag (watcher's `TASK_ASSIGNED` = info, «Topshiriq qaytarildi» = action), so `create` takes it as an optional override.
2. `groupKey = "<TYPE>:<YYYY-MM-DD>"` (Tashkent) for the five lesson alerts only (`LESSON_STARTED`, `ATTENDANCE_ADMIN_ALERT`, `ATTENDANCE_TEACHER_WARNING`, `ATTENDANCE_MISSING_TEACHER`, `ATTENDANCE_MISSING_ADMIN`). Per type, not `attendance:<day>`, so «30 daqiqa qoldi» and «dars tugadi» do not fold together. The lesson date is not stored anywhere on the row; every lesson alert is created on the lesson's own Tashkent day (the tick and the 23:00 sweep look at today only), so the key carries it.
3. Indexes `Notification(relatedEntityId)` and `Notification(taskId)` so resolver lookups are indexed.
4. The resolver touches only `actionRequired = true` rows. Beyond the spec it also closes: a day's lesson alerts on a cancellation or a move of that day and on a «Dars bo'ldimi?» answer (plus that lesson task's notices); `TASK_REVIEW` on any review answer; a removed assignee's notices of that task.
5. «Va'da bajarilsa» = `payment.received` with `studentBalance >= 0` (the `settleKeptPromises` test). A promise behind an overdue alert is already BROKEN and never turns KEPT.
6. `LESSON_STARTED` is no longer sent when the lesson already has a register (taken in the lead before the start) — otherwise it would wait forever with nothing to do. Guide updated.
7. «Kutilmoqda» list = `actionRequired && resolvedAt == null` (read or not); the badge adds `!isRead`; the tab count shows the pending total.
8. Groups (Topshiriqlar/Davomat/To'lovlar/Tizim) are defined once on the server (`NOTIFICATION_GROUP`, exhaustive `Record` over the enum) and served as `group` on every row (list and SSE). The client never maps type → group; it mirrors only the type list, checked by a test that reads `server/prisma/schema.prisma`.
9. Keyset paging reuses `src/tasks/task-cursor.ts`. `page`/`pageSize` stay accepted so the old bell keeps working between the server and the Vercel deploys.
10. Backfill: the migration sets `actionRequired`/`groupKey` by type; the cleanup script resolves already-done jobs with the time they were done, then marks >7-day unread read.
11. No sidebar item: the bell footer opens the page; breadcrumb label «Bildirishnomalar».

## File Structure

**Server**
- `server/prisma/schema.prisma` — `Notification`: 3 columns, 2 indexes.
- `server/prisma/migrations/20261010120000_notification_action_state/migration.sql` — DDL + backfill.
- `server/src/notifications/notification-kind.ts` (+ `.spec.ts`) — pure: groups, action types, lesson keys, `notificationKind`.
- `server/src/notifications/notifications.service.ts` (+ spec) — `create` stamps kind and returns a view; `findByUser` (filters + cursor), `getUnreadCount` (badge), `getCounts`.
- `server/src/notifications/dto/notification-query.dto.ts` — `filter`, `type`, `q`, `cursor`, `pageSize`, deprecated `page`.
- `server/src/notifications/notifications.controller.ts` — `GET /notifications/counts`.
- `server/src/notifications/notification-resolver.service.ts` (+ spec) — event listener that stamps `resolvedAt`.
- `server/src/notifications/notifications.module.ts` — registers the resolver.
- `server/src/tasks/task-notify.listener.ts` (+ spec) — passes the plan's `actionRequired`.
- `server/src/attendance/attendance-reminder.service.ts` (+ spec) — no `LESSON_STARTED` once a register exists.
- `server/src/common/auth/branch-route-policy.ts` — SELF block for `/notifications/*`, budget 88 → 79.
- `server/scripts/lib/notification-cleanup.ts` (+ `.spec.ts`) — the cleanup SQL steps.
- `server/scripts/notification-cleanup.ts` — CLI (dry run / `--apply`).
- `server/tsconfig.check.json` — the cleanup files join the type-checked scripts (a script that writes data is held to `src/` standards).
- `server/CLAUDE.md` — «Notifications (4 channels)» section.

**Client**
- `client/src/components/notifications/notification-view.ts` (+ `.test.ts`) — types, Tashkent clock, grouping, page views.
- `client/src/hooks/use-notifications.ts` — store rewrite + fetchers.
- `client/src/hooks/use-sse.ts` — `notification.resolved`.
- `client/src/hooks/use-task-counts.ts` — refetch on the store's `version`.
- `client/src/components/notifications/notification-row.tsx` — one row / folded row, shared by bell and page.
- `client/src/components/notifications/notification-bell.tsx` — panel per s19.
- `client/src/components/notifications/notifications-page-client.tsx` + `client/src/app/(dashboard)/notifications/page.tsx` — page per s20.
- `client/src/lib/breadcrumb-routes.ts` — `notifications` label.
- `client/CLAUDE.md`, `client/src/qollanma/kontent/boshlash/interfeys.mdx`, `client/src/qollanma/kontent/davomat/eslatmalar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/sahifalar/davomat.ts`, `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: Notification state columns, migration, `notificationKind`

**Files:**
- Modify: `server/prisma/schema.prisma` (model `Notification`, ~line 2063)
- Create: `server/prisma/migrations/20261010120000_notification_action_state/migration.sql`
- Create: `server/src/notifications/notification-kind.ts`, `server/src/notifications/notification-kind.spec.ts`
- Modify: `server/src/notifications/notifications.service.ts` (`CreateNotificationParams`, `create`)
- Modify: `server/src/notifications/notifications.service.spec.ts` (`describe('create')`)
- Modify: `server/src/tasks/task-notify.listener.ts` (the `this.notifications.create({...})` call), `server/src/tasks/task-notify.listener.spec.ts`

**Interfaces:**
- Produces (`notification-kind.ts`): `NOTIFICATION_GROUPS` (`readonly ['task','attendance','payment','system']`), `type NotificationGroup`, `NOTIFICATION_GROUP: Record<NotificationType, NotificationGroup>`, `TYPES_BY_GROUP: Record<NotificationGroup, NotificationType[]>`, `ACTION_TYPES: ReadonlySet<NotificationType>`, `LESSON_ALERT_TYPES: readonly NotificationType[]`, `lessonGroupKey(type: NotificationType, day: string): string`, `notificationKind(type: NotificationType, now: Date, actionRequired?: boolean): { actionRequired: boolean; groupKey: string | null }`.
- Produces (`notifications.service.ts`): `CreateNotificationParams.actionRequired?: boolean`; `type NotificationView = Notification & { group: NotificationGroup }`; `toNotificationView(row: Notification): NotificationView`; `create(params): Promise<NotificationView>`.
- Columns: `Notification.actionRequired Boolean @default(false)`, `resolvedAt DateTime?`, `groupKey String?`.

- [ ] **Step 1: Write the failing spec for `notificationKind`**

Create `server/src/notifications/notification-kind.spec.ts`:

```ts
import { NotificationType } from '@prisma/client';
import {
  ACTION_TYPES,
  LESSON_ALERT_TYPES,
  NOTIFICATION_GROUP,
  TYPES_BY_GROUP,
  lessonGroupKey,
  notificationKind,
} from './notification-kind';

describe('notificationKind', () => {
  it('marks exactly the spec §8 types as waiting for action', () => {
    expect([...ACTION_TYPES].sort()).toEqual([
      'ATTENDANCE_ADMIN_ALERT',
      'ATTENDANCE_MISSING_ADMIN',
      'ATTENDANCE_MISSING_TEACHER',
      'ATTENDANCE_TEACHER_WARNING',
      'LESSON_STARTED',
      'PAYMENT_PROMISE_OVERDUE',
      'TASK_ASSIGNED',
      'TASK_REMINDER',
      'TASK_REVIEW',
    ]);
  });

  it("lets the caller override the type's default (the task plan)", () => {
    const now = new Date();
    expect(
      notificationKind(NotificationType.TASK_ASSIGNED, now, false)
        .actionRequired,
    ).toBe(false);
    expect(
      notificationKind(NotificationType.TASK_STATUS_CHANGED, now, true)
        .actionRequired,
    ).toBe(true);
    expect(
      notificationKind(NotificationType.TASK_STATUS_CHANGED, now)
        .actionRequired,
    ).toBe(false);
  });

  it('keys a lesson alert by its type and the Tashkent day it was sent', () => {
    // 20:30 UTC on the 10th is 01:30 on the 11th in Tashkent.
    expect(
      notificationKind(
        NotificationType.ATTENDANCE_ADMIN_ALERT,
        new Date('2026-10-10T20:30:00.000Z'),
      ).groupKey,
    ).toBe('ATTENDANCE_ADMIN_ALERT:2026-10-11');
    expect(lessonGroupKey(NotificationType.LESSON_STARTED, '2026-10-10')).toBe(
      'LESSON_STARTED:2026-10-10',
    );
  });

  it('leaves every other type ungrouped', () => {
    for (const type of Object.values(NotificationType)) {
      if (LESSON_ALERT_TYPES.includes(type)) continue;
      expect(notificationKind(type, new Date()).groupKey).toBeNull();
    }
  });

  it('puts every type in exactly one of the four groups', () => {
    expect(Object.values(TYPES_BY_GROUP).flat().sort()).toEqual(
      Object.values(NotificationType).sort(),
    );
    expect(NOTIFICATION_GROUP.TASK_REVIEW).toBe('task');
    expect(NOTIFICATION_GROUP.ATTENDANCE_MISSING_ADMIN).toBe('attendance');
    expect(NOTIFICATION_GROUP.PAYMENT_PROMISE_OVERDUE).toBe('payment');
    expect(NOTIFICATION_GROUP.SYSTEM).toBe('system');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest src/notifications/notification-kind.spec.ts`
Expected: FAIL — `Cannot find module './notification-kind'`.

- [ ] **Step 3: Write `notification-kind.ts`**

Create `server/src/notifications/notification-kind.ts`:

```ts
import type { NotificationType } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';

/**
 * The bell's four kinds (spec 2026-10-07 §8): «Topshiriqlar · Davomat ·
 * To'lovlar · Tizim». The API serves each row's group, so the client never
 * maps a type itself.
 */
export const NOTIFICATION_GROUPS = [
  'task',
  'attendance',
  'payment',
  'system',
] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

/** A `Record` over the enum: a new type does not compile until it is placed. */
export const NOTIFICATION_GROUP: Record<NotificationType, NotificationGroup> = {
  COMMENT: 'task',
  TASK_ASSIGNED: 'task',
  TASK_STATUS_CHANGED: 'task',
  TASK_DELETED: 'task',
  TASK_UPDATED: 'task',
  TASK_REMINDER: 'task',
  TASK_REVIEW: 'task',
  TASK_OVERDUE: 'task',
  LESSON_STARTED: 'attendance',
  ATTENDANCE_ADMIN_ALERT: 'attendance',
  ATTENDANCE_TEACHER_WARNING: 'attendance',
  ATTENDANCE_MISSING_TEACHER: 'attendance',
  ATTENDANCE_MISSING_ADMIN: 'attendance',
  ATTENDANCE_COMPLETED: 'attendance',
  LESSON_RESCHEDULED: 'attendance',
  LESSON_CANCELLED: 'attendance',
  ABSENCE_WARNING: 'attendance',
  ENROLLMENT_AUTO_PAUSED: 'attendance',
  PAYMENT_PROMISE_OVERDUE: 'payment',
  SYSTEM: 'system',
};

export const TYPES_BY_GROUP = Object.fromEntries(
  NOTIFICATION_GROUPS.map((group) => [
    group,
    (Object.keys(NOTIFICATION_GROUP) as NotificationType[]).filter(
      (type) => NOTIFICATION_GROUP[type] === group,
    ),
  ]),
) as Record<NotificationGroup, NotificationType[]>;

/** Spec §8: what waits for the recipient. Everything else is information. */
export const ACTION_TYPES: ReadonlySet<NotificationType> =
  new Set<NotificationType>([
    'ATTENDANCE_ADMIN_ALERT',
    'ATTENDANCE_MISSING_TEACHER',
    'ATTENDANCE_MISSING_ADMIN',
    'ATTENDANCE_TEACHER_WARNING',
    'LESSON_STARTED',
    'TASK_ASSIGNED',
    'TASK_REMINDER',
    'TASK_REVIEW',
    'PAYMENT_PROMISE_OVERDUE',
  ]);

/** Alerts about one group's lesson, sent on the lesson's own day. */
export const LESSON_ALERT_TYPES: readonly NotificationType[] = [
  'LESSON_STARTED',
  'ATTENDANCE_ADMIN_ALERT',
  'ATTENDANCE_TEACHER_WARNING',
  'ATTENDANCE_MISSING_TEACHER',
  'ATTENDANCE_MISSING_ADMIN',
];

/** The client folds one day's rows of one type into one line by this key. */
export function lessonGroupKey(type: NotificationType, day: string): string {
  return `${type}:${day}`;
}

/**
 * Decided once, when `NotificationsService.create` writes the row. `now` is
 * also the lesson's day: every lesson alert is sent on the lesson's own
 * Tashkent day (attendance-reminder.service.ts — the tick and the 23:00 sweep
 * look at today only), so the key carries the lesson date.
 */
export function notificationKind(
  type: NotificationType,
  now: Date,
  actionRequired?: boolean,
): { actionRequired: boolean; groupKey: string | null } {
  return {
    actionRequired: actionRequired ?? ACTION_TYPES.has(type),
    groupKey: LESSON_ALERT_TYPES.includes(type)
      ? lessonGroupKey(type, tashkentDateStr(now))
      : null,
  };
}
```

- [ ] **Step 4: Run the spec**

Run: `npx jest src/notifications/notification-kind.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Change the schema**

In `server/prisma/schema.prisma`, replace the `model Notification { … }` block with:

```prisma
model Notification {
  id                String           @id @default(uuid())
  userId            Int
  user              User             @relation("UserNotifications", fields: [userId], references: [id])
  type              NotificationType
  title             String
  message           String
  relatedEntityType String?
  relatedEntityId   String?
  commentId         String?
  comment           Comment?         @relation(fields: [commentId], references: [id], onDelete: SetNull)
  taskId            String?
  task              Task?            @relation(fields: [taskId], references: [id], onDelete: SetNull)
  isRead            Boolean          @default(false)
  /// Waits for the recipient's own action (spec 2026-10-07 §8). Set once by `notificationKind`.
  actionRequired    Boolean          @default(false)
  /// When the job it asked for got done (`NotificationResolverService`); null = still open.
  resolvedAt        DateTime?
  /// One day's rows of one lesson alert type, folded into one line: `ATTENDANCE_ADMIN_ALERT:2026-10-10`.
  groupKey          String?
  companyId         Int
  createdAt         DateTime         @default(now())

  @@index([userId, isRead])
  @@index([userId, createdAt])
  @@index([companyId])
  @@index([relatedEntityId])
  @@index([taskId])
}
```

- [ ] **Step 6: Produce the migration offline (no database)**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
git show HEAD:server/prisma/schema.prisma > prisma/.schema-before.prisma
mkdir -p prisma/migrations/20261010120000_notification_action_state
npx prisma migrate diff --from-schema prisma/.schema-before.prisma --to-schema prisma/schema.prisma --script 2>/dev/null > prisma/migrations/20261010120000_notification_action_state/migration.sql
rm prisma/.schema-before.prisma
cat prisma/migrations/20261010120000_notification_action_state/migration.sql
```

Expected: exactly one `ALTER TABLE "Notification" ADD COLUMN …` (three columns) and two `CREATE INDEX` lines, nothing else. If anything else appears, stop and report.

- [ ] **Step 7: Add the header and the backfill by hand**

Edit the file so it reads exactly (the generated statements in the middle, as generated):

```sql
-- Bell state (spec 2026-10-07 §8): what waits for the recipient, what closed
-- itself, and which rows fold into one line. Hand-checked; the dev database is
-- behind main and this was produced with a schema-to-schema diff.

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "actionRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Notification_relatedEntityId_idx" ON "Notification"("relatedEntityId");

-- CreateIndex
CREATE INDEX "Notification_taskId_idx" ON "Notification"("taskId");

-- Backfill: the same rule as notificationKind (src/notifications/notification-kind.ts).
UPDATE "Notification" SET "actionRequired" = true
WHERE "type" IN ('ATTENDANCE_ADMIN_ALERT', 'ATTENDANCE_MISSING_TEACHER', 'ATTENDANCE_MISSING_ADMIN',
                 'ATTENDANCE_TEACHER_WARNING', 'LESSON_STARTED', 'TASK_ASSIGNED', 'TASK_REMINDER',
                 'TASK_REVIEW', 'PAYMENT_PROMISE_OVERDUE');

-- task-notify-plan.ts decides per notice: a watcher is told, a returned task waits.
UPDATE "Notification" SET "actionRequired" = false
WHERE "type" = 'TASK_ASSIGNED' AND "title" = 'Kuzatuvchi qilindingiz';
UPDATE "Notification" SET "actionRequired" = true
WHERE "type" = 'TASK_STATUS_CHANGED' AND "title" = 'Topshiriq qaytarildi';

-- Lesson alerts are sent on the lesson's own Tashkent day (UTC+5, no DST).
UPDATE "Notification"
SET "groupKey" = "type"::text || ':' || to_char("createdAt" + interval '5 hours', 'YYYY-MM-DD')
WHERE "type" IN ('LESSON_STARTED', 'ATTENDANCE_ADMIN_ALERT', 'ATTENDANCE_TEACHER_WARNING',
                 'ATTENDANCE_MISSING_TEACHER', 'ATTENDANCE_MISSING_ADMIN');
```

If the generated column order differs, keep the generated statements as they came out; only the comments and the three `UPDATE` blocks are hand-written.

- [ ] **Step 8: Regenerate the client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`. Do NOT run any other Prisma command.

- [ ] **Step 9: Write the failing `create` specs**

In `server/src/notifications/notifications.service.spec.ts`, inside `describe('create')`: change `expect(result).toEqual(mockNotification);` to `expect(result).toEqual({ ...mockNotification, group: 'task' });`, and add:

```ts
    it('stamps whether it waits and the lesson-day key', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T04:30:00.000Z'));
      prisma.notification.create.mockResolvedValue({
        ...mockNotification,
        type: NotificationType.ATTENDANCE_ADMIN_ALERT,
      });
      const result = await service.create({
        userId: 10001,
        type: NotificationType.ATTENDANCE_ADMIN_ALERT,
        title: "O'qituvchi hali davomat olmadi",
        message: 'm',
        relatedEntityType: 'Group',
        relatedEntityId: 'g1',
        companyId: 1001,
      });
      jest.useRealTimers();

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionRequired: true,
          groupKey: 'ATTENDANCE_ADMIN_ALERT:2026-10-10',
        }),
      });
      expect(result.group).toBe('attendance');
    });

    it("keeps the caller's actionRequired over the type's default", async () => {
      await service.create({
        userId: 10001,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Kuzatuvchi qilindingiz',
        message: 'm',
        companyId: 1001,
        actionRequired: false,
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ actionRequired: false, groupKey: null }),
      });
    });
```

Run: `npx jest src/notifications/notifications.service.spec.ts -t create`
Expected: FAIL (no `group`, no `actionRequired` in data).

- [ ] **Step 10: Change `create`**

In `server/src/notifications/notifications.service.ts`:

Replace the imports at the top with:

```ts
import { Injectable } from '@nestjs/common';
import type { Notification, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  NOTIFICATION_GROUP,
  notificationKind,
  type NotificationGroup,
} from './notification-kind';
```

Add to `CreateNotificationParams` (after `companyId: number;`):

```ts
  /**
   * Overrides the type's default (`ACTION_TYPES`). Only the task plan passes
   * it: a watcher's TASK_ASSIGNED is information, a returned task waits.
   */
  actionRequired?: boolean;
```

Add below the interface:

```ts
/** A row as the API and SSE serve it: with the bell's group. */
export type NotificationView = Notification & { group: NotificationGroup };

export function toNotificationView(row: Notification): NotificationView {
  return { ...row, group: NOTIFICATION_GROUP[row.type] };
}
```

Replace `create` with:

```ts
  /** The one writer of Notification rows: every sender comes through here. */
  async create(params: CreateNotificationParams): Promise<NotificationView> {
    const kind = notificationKind(
      params.type,
      new Date(),
      params.actionRequired,
    );
    const row = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedEntityType: params.relatedEntityType,
        relatedEntityId: params.relatedEntityId,
        commentId: params.commentId,
        taskId: params.taskId,
        companyId: params.companyId,
        actionRequired: kind.actionRequired,
        groupKey: kind.groupKey,
      },
    });
    return toNotificationView(row);
  }
```

- [ ] **Step 11: Pass the plan's flag from the task listener**

In `server/src/tasks/task-notify.listener.ts`, in the `this.notifications.create({ … })` call inside `handle`, add `actionRequired: n.actionRequired,` after `companyId: task.companyId,`.

In `server/src/tasks/task-notify.listener.spec.ts`: in the first test's `expect(notif.create).toHaveBeenCalledWith(expect.objectContaining({ … }))` add `actionRequired: true,`; then add:

```ts
  it("passes the plan's actionRequired: a watcher is told, not asked", async () => {
    await listener.onAssigned({
      task: {
        ...task,
        participants: [
          { userId: 40, role: 'ASSIGNEE' },
          { userId: 41, role: 'WATCHER' },
        ],
      },
      actorId: 30,
      userIds: [41],
    } as any);

    expect(notif.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 41,
        title: 'Kuzatuvchi qilindingiz',
        actionRequired: false,
      }),
    );
  });
```

- [ ] **Step 12: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/notifications/notification-kind.ts src/notifications/notification-kind.spec.ts src/notifications/notifications.service.ts src/notifications/notifications.service.spec.ts src/tasks/task-notify.listener.ts src/tasks/task-notify.listener.spec.ts
npx eslint src/notifications src/tasks --quiet
npx jest src/notifications src/tasks/task-notify.listener.spec.ts
npm run typecheck
```
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/prisma/schema.prisma server/prisma/migrations/20261010120000_notification_action_state server/src/notifications/notification-kind.ts server/src/notifications/notification-kind.spec.ts server/src/notifications/notifications.service.ts server/src/notifications/notifications.service.spec.ts server/src/tasks/task-notify.listener.ts server/src/tasks/task-notify.listener.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): stamp what waits and the lesson-day key on every row

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Alerts close themselves — `NotificationResolverService`

**Files:**
- Create: `server/src/notifications/notification-resolver.service.ts`, `server/src/notifications/notification-resolver.service.spec.ts`
- Modify: `server/src/notifications/notifications.module.ts` (providers)
- Modify: `server/src/attendance/attendance-reminder.service.ts` (`handleGroup`, ~line 370)
- Modify: `server/src/attendance/attendance-reminder.service.spec.ts` (`describe('handleGroup')`)

**Interfaces:**
- Consumes: `LESSON_ALERT_TYPES`, `lessonGroupKey` (Task 1); `TASK_EVENTS`, `TaskEventTask` (`src/tasks/task-events.ts`); `UNMARKED_LESSON_HELD`, `UNMARKED_LESSON_NOT_HELD` (`src/unmarked-lessons/unmarked-lesson-events.ts`); `utcMidnightFromDateStr` (`src/common/date/tashkent.ts`); `NotificationsGateway.sendToUser(userId, data)`.
- Events heard (all emitted after their transaction commits) and payload fields used:
  - `'attendance.completed'`, `'attendance.student.recorded'`, `'lesson-cancellation.created'`, `UNMARKED_LESSON_HELD`, `UNMARKED_LESSON_NOT_HELD` → `{ companyId, groupId, date: 'YYYY-MM-DD' }`
  - `'lesson-reschedule.created'` → `{ companyId, groupId, originalDate }`
  - `TASK_EVENTS.STATUS_CHANGED`, `TASK_EVENTS.CANCELLED`, `TASK_EVENTS.REVIEWED` → `{ task: TaskEventTask }` (status after the write); `TASK_EVENTS.UNASSIGNED` → `{ task, userIds }`
  - `'payment.received'` → `{ companyId, studentId, studentBalance: number | null }`
- Produces: SSE message `{ type: 'notification.resolved', ids: string[], resolvedAt: string }` to each owner; public `resolve(where: Prisma.NotificationWhereInput): Promise<number>`.

- [ ] **Step 1: Write the failing spec**

Create `server/src/notifications/notification-resolver.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { NotificationResolverService } from './notification-resolver.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskEventTask } from '../tasks/task-events';

const LESSON_KEYS = (day: string) => [
  `LESSON_STARTED:${day}`,
  `ATTENDANCE_ADMIN_ALERT:${day}`,
  `ATTENDANCE_TEACHER_WARNING:${day}`,
  `ATTENDANCE_MISSING_TEACHER:${day}`,
  `ATTENDANCE_MISSING_ADMIN:${day}`,
];

const task = (status: TaskEventTask['status']): TaskEventTask => ({
  id: 't1',
  companyId: 1,
  title: 'Banner',
  kind: 'MANUAL',
  authorId: 30,
  dueAt: null,
  status,
  participants: [{ userId: 40, role: 'ASSIGNEE' }],
});

const OPEN = { actionRequired: true, resolvedAt: null };

describe('NotificationResolverService', () => {
  let resolver: NotificationResolverService;
  let prisma: any;
  let gateway: { sendToUser: jest.Mock };

  beforeEach(async () => {
    prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'n1', userId: 7 },
          { id: 'n2', userId: 7 },
          { id: 'n3', userId: 8 },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    gateway = { sendToUser: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        NotificationResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    resolver = mod.get(NotificationResolverService);
  });

  const whereOf = (call = 0) =>
    prisma.notification.findMany.mock.calls[call][0].where;

  it("a saved register closes that group's lesson alerts of that day, for every recipient", async () => {
    await resolver.onAttendanceCompleted({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });

    expect(prisma.notification.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1,
        relatedEntityType: 'Group',
        relatedEntityId: 'g1',
        groupKey: { in: LESSON_KEYS('2026-10-10') },
        ...OPEN,
      },
      select: { id: true, userId: true },
    });
    const update = prisma.notification.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({
      id: { in: ['n1', 'n2', 'n3'] },
      resolvedAt: null,
    });
    expect(update.data.resolvedAt).toBeInstanceOf(Date);
    const at = update.data.resolvedAt.toISOString();
    expect(gateway.sendToUser).toHaveBeenCalledWith(7, {
      type: 'notification.resolved',
      ids: ['n1', 'n2'],
      resolvedAt: at,
    });
    expect(gateway.sendToUser).toHaveBeenCalledWith(8, {
      type: 'notification.resolved',
      ids: ['n3'],
      resolvedAt: at,
    });
  });

  it('writes nothing and tells nobody when nothing is open', async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    await resolver.onAttendanceCompleted({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
    expect(gateway.sendToUser).not.toHaveBeenCalled();
  });

  it('a QR scan, a cancellation and a move (by its original day) close the same alerts', async () => {
    await resolver.onStudentRecorded({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    await resolver.onLessonCancelled({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-11',
    });
    await resolver.onLessonMoved({
      companyId: 1,
      groupId: 'g1',
      originalDate: '2026-10-12',
    });
    expect(whereOf(0).groupKey).toEqual({ in: LESSON_KEYS('2026-10-10') });
    expect(whereOf(1).groupKey).toEqual({ in: LESSON_KEYS('2026-10-11') });
    expect(whereOf(2).groupKey).toEqual({ in: LESSON_KEYS('2026-10-12') });
  });

  it("an answered «Dars bo'ldimi?» also closes the notices of its closed task", async () => {
    prisma.unmarkedLesson.findUnique.mockResolvedValue({
      task: { id: 't9', companyId: 1, status: 'DONE' },
    });
    await resolver.onLessonHeld({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.unmarkedLesson.findUnique).toHaveBeenCalledWith({
      where: {
        groupId_date: {
          groupId: 'g1',
          date: new Date('2026-10-10T00:00:00.000Z'),
        },
      },
      select: { task: { select: { id: true, companyId: true, status: true } } },
    });
    expect(whereOf(1)).toEqual({ companyId: 1, taskId: 't9', ...OPEN });
  });

  it('leaves a lesson task that is still open alone', async () => {
    prisma.unmarkedLesson.findUnique.mockResolvedValue({
      task: { id: 't9', companyId: 1, status: 'IN_PROGRESS' },
    });
    await resolver.onLessonNotHeld({
      companyId: 1,
      groupId: 'g1',
      date: '2026-10-10',
    });
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it('a done or cancelled task closes all its notices; one still open does not', async () => {
    await resolver.onTaskStatus({ task: task('IN_PROGRESS') });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    await resolver.onTaskStatus({ task: task('DONE') });
    await resolver.onTaskCancelled({ task: task('CANCELLED') });
    expect(whereOf(0)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
    expect(whereOf(1)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
  });

  it('a review answer ends the review request; accepting closes the rest too', async () => {
    await resolver.onTaskReviewed({ task: task('IN_PROGRESS') });
    expect(whereOf(0)).toEqual({
      companyId: 1,
      taskId: 't1',
      type: 'TASK_REVIEW',
      ...OPEN,
    });
    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
    await resolver.onTaskReviewed({ task: task('DONE') });
    expect(whereOf(2)).toEqual({ companyId: 1, taskId: 't1', ...OPEN });
  });

  it("closes a removed assignee's notices of that task only", async () => {
    await resolver.onTaskUnassigned({ task: task('NEW'), userIds: [40, 41] });
    expect(whereOf()).toEqual({
      companyId: 1,
      taskId: 't1',
      userId: { in: [40, 41] },
      ...OPEN,
    });
  });

  it('a payment that clears the debt closes the overdue-promise alert; one that leaves debt does not', async () => {
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: -5000,
    });
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: null,
    });
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
    await resolver.onPaymentReceived({
      companyId: 1,
      studentId: 10001,
      studentBalance: 0,
    });
    expect(whereOf()).toEqual({
      companyId: 1,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'Student',
      relatedEntityId: '10001',
      ...OPEN,
    });
  });

  it('never throws out of a listener', async () => {
    prisma.notification.findMany.mockRejectedValue(new Error('db down'));
    await expect(
      resolver.onAttendanceCompleted({
        companyId: 1,
        groupId: 'g1',
        date: '2026-10-10',
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/notifications/notification-resolver.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the resolver**

Create `server/src/notifications/notification-resolver.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { TASK_EVENTS, type TaskEventTask } from '../tasks/task-events';
import {
  UNMARKED_LESSON_HELD,
  UNMARKED_LESSON_NOT_HELD,
} from '../unmarked-lessons/unmarked-lesson-events';
import { LESSON_ALERT_TYPES, lessonGroupKey } from './notification-kind';
import { NotificationsGateway } from './notifications.gateway';

/** A lesson event: the group and its lesson day ('YYYY-MM-DD', Tashkent). */
interface LessonDayEvent {
  companyId: number;
  groupId: string;
  date: string;
}

interface ClosableTask {
  id: string;
  companyId: number;
  status: TaskStatus;
}

/**
 * Spec 2026-10-07 §8: an alert closes itself when its job is done. Every event
 * heard here is emitted after its transaction commits. Matching OPEN action
 * rows of every recipient get `resolvedAt`, and each recipient's open bells
 * hear `notification.resolved`. Information rows are never touched.
 */
@Injectable()
export class NotificationResolverService {
  private readonly logger = new Logger(NotificationResolverService.name);

  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  // ---------- lessons ----------

  @OnEvent('attendance.completed')
  async onAttendanceCompleted(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  /** A register only QR scans took emits this and never `attendance.completed`. */
  @OnEvent('attendance.student.recorded')
  async onStudentRecorded(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  @OnEvent('lesson-cancellation.created')
  async onLessonCancelled(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
  }

  @OnEvent('lesson-reschedule.created')
  async onLessonMoved(p: {
    companyId: number;
    groupId: string;
    originalDate: string;
  }): Promise<void> {
    await this.resolveLesson({ ...p, date: p.originalDate });
  }

  @OnEvent(UNMARKED_LESSON_HELD)
  async onLessonHeld(p: LessonDayEvent): Promise<void> {
    await this.resolveAnswered(p);
  }

  @OnEvent(UNMARKED_LESSON_NOT_HELD)
  async onLessonNotHeld(p: LessonDayEvent): Promise<void> {
    await this.resolveAnswered(p);
  }

  // ---------- tasks ----------

  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  async onTaskStatus(p: { task: TaskEventTask }): Promise<void> {
    await this.resolveIfClosed(p.task);
  }

  @OnEvent(TASK_EVENTS.CANCELLED)
  async onTaskCancelled(p: { task: TaskEventTask }): Promise<void> {
    await this.resolveIfClosed(p.task);
  }

  /** Either answer ends the review request; an accepted task is closed too. */
  @OnEvent(TASK_EVENTS.REVIEWED)
  async onTaskReviewed(p: { task: TaskEventTask }): Promise<void> {
    await this.resolve({
      companyId: p.task.companyId,
      taskId: p.task.id,
      type: 'TASK_REVIEW',
    });
    await this.resolveIfClosed(p.task);
  }

  @OnEvent(TASK_EVENTS.UNASSIGNED)
  async onTaskUnassigned(p: {
    task: TaskEventTask;
    userIds: number[];
  }): Promise<void> {
    await this.resolve({
      companyId: p.task.companyId,
      taskId: p.task.id,
      userId: { in: p.userIds },
    });
  }

  // ---------- payments ----------

  /**
   * The overdue alert is written when a promise turns BROKEN, and a BROKEN
   * promise never turns KEPT; the debt cleared is the same test
   * `settleKeptPromises` uses for "kept".
   */
  @OnEvent('payment.received')
  async onPaymentReceived(p: {
    companyId: number;
    studentId: number;
    studentBalance: number | null;
  }): Promise<void> {
    if (p.studentBalance === null || p.studentBalance < 0) return;
    await this.resolve({
      companyId: p.companyId,
      type: 'PAYMENT_PROMISE_OVERDUE',
      relatedEntityType: 'Student',
      relatedEntityId: String(p.studentId),
    });
  }

  // ---------- core ----------

  private resolveLesson(p: LessonDayEvent): Promise<number> {
    return this.resolve({
      companyId: p.companyId,
      relatedEntityType: 'Group',
      relatedEntityId: p.groupId,
      groupKey: {
        in: LESSON_ALERT_TYPES.map((type) => lessonGroupKey(type, p.date)),
      },
    });
  }

  /** «Dars bo'ldimi?» answered: the day's alerts and its closed task's notices. */
  private async resolveAnswered(p: LessonDayEvent): Promise<void> {
    await this.resolveLesson(p);
    try {
      const row = await this.prisma.unmarkedLesson.findUnique({
        where: {
          groupId_date: {
            groupId: p.groupId,
            date: utcMidnightFromDateStr(p.date),
          },
        },
        select: {
          task: { select: { id: true, companyId: true, status: true } },
        },
      });
      if (row?.task) await this.resolveIfClosed(row.task);
    } catch (error) {
      this.logger.error(
        `lesson task lookup failed (${p.groupId} ${p.date}): ${(error as Error).message}`,
      );
    }
  }

  private async resolveIfClosed(task: ClosableTask): Promise<void> {
    if (task.status !== 'DONE' && task.status !== 'CANCELLED') return;
    await this.resolve({ companyId: task.companyId, taskId: task.id });
  }

  /** Stamps the open action rows matching `where`; returns how many. Never throws. */
  async resolve(where: Prisma.NotificationWhereInput): Promise<number> {
    try {
      const rows = await this.prisma.notification.findMany({
        where: { ...where, actionRequired: true, resolvedAt: null },
        select: { id: true, userId: true },
      });
      if (rows.length === 0) return 0;
      const resolvedAt = new Date();
      await this.prisma.notification.updateMany({
        where: { id: { in: rows.map((r) => r.id) }, resolvedAt: null },
        data: { resolvedAt },
      });
      const byUser = new Map<number, string[]>();
      for (const r of rows) {
        byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r.id]);
      }
      for (const [userId, ids] of byUser) {
        this.gateway.sendToUser(userId, {
          type: 'notification.resolved',
          ids,
          resolvedAt: resolvedAt.toISOString(),
        });
      }
      return rows.length;
    } catch (error) {
      this.logger.error(`resolve failed: ${(error as Error).message}`);
      return 0;
    }
  }
}
```

- [ ] **Step 4: Register it**

In `server/src/notifications/notifications.module.ts` add `import { NotificationResolverService } from './notification-resolver.service';` and put `NotificationResolverService` in `providers` after `NotificationEventsListener`.

- [ ] **Step 5: Run the resolver spec and the wiring spec**

Run: `npx jest src/notifications/notification-resolver.service.spec.ts src/common/event-wiring.spec.ts`
Expected: PASS.

- [ ] **Step 6: Failing spec — no «Dars boshlandi» once a register exists**

In `server/src/attendance/attendance-reminder.service.spec.ts`, in the test `'sends LESSON_STARTED to teachers at lessonStartTime'`, replace the last two lines (`// No attendance check when firing lesson-started` and `expect(prisma.attendance.findFirst).not.toHaveBeenCalled();`) with:

```ts
      // The register is checked first: one taken in the lead needs no reminder.
      expect(prisma.attendance.findFirst).toHaveBeenCalledWith({
        where: { groupId: 'group-1', date: new Date('2026-04-22T00:00:00.000Z') },
        select: { id: true },
      });
```

and add after it:

```ts
    it('skips LESSON_STARTED when the register was taken before the start', async () => {
      prisma.attendance.findFirst.mockResolvedValue({ id: 'att-1' });
      const group = makeGroup();

      await (service as any).handleGroup(group, 540, '2026-04-22');

      expect(notificationsService.create).not.toHaveBeenCalled();
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
```

Run: `npx jest src/attendance/attendance-reminder.service.spec.ts -t handleGroup`
Expected: FAIL on both.

- [ ] **Step 7: Check the register before both reminders**

In `server/src/attendance/attendance-reminder.service.ts` replace the body of `handleGroup` with:

```ts
    const startMin = this.parseTime(group.lessonStartTime);
    const endMin = this.parseTime(group.lessonEndTime);
    const isStart = currentMinutes === startMin;
    if (!isStart && currentMinutes !== endMin - 30) return;

    // A register already taken (the lead opens it before the start) leaves
    // nothing to remind of — and a reminder nobody can act on would wait in
    // the bell for ever (spec 2026-10-07 §8).
    const parsedDate = new Date(today + 'T00:00:00.000Z');
    const hasAttendance = await this.prisma.attendance.findFirst({
      where: { groupId: group.id, date: parsedDate },
      select: { id: true },
    });
    if (hasAttendance) return;

    if (isStart) {
      for (const t of group.teachers) {
        await this.sendLessonStarted(t.teacher, group);
      }
      return;
    }
    for (const t of group.teachers) {
      await this.sendTeacherWarning(t.teacher, group);
    }
    await this.notifyBranchAdmins(group, 'ADMIN_ALERT');
```

In the class doc comment, change `*   - start            → LESSON_STARTED (teacher)` to `*   - start            → LESSON_STARTED (teacher), unless the register is already taken`.

- [ ] **Step 8: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/notifications/notification-resolver.service.ts src/notifications/notification-resolver.service.spec.ts src/notifications/notifications.module.ts src/attendance/attendance-reminder.service.ts src/attendance/attendance-reminder.service.spec.ts
npx eslint src/notifications src/attendance --quiet
npx jest src/notifications src/attendance/attendance-reminder.service.spec.ts src/common/event-wiring.spec.ts
npm run typecheck
```
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/notifications/notification-resolver.service.ts server/src/notifications/notification-resolver.service.spec.ts server/src/notifications/notifications.module.ts server/src/attendance/attendance-reminder.service.ts server/src/attendance/attendance-reminder.service.spec.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): alerts close themselves when their job is done

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API — filters, cursor, badge rule, counts, route manifest

**Files:**
- Modify: `server/src/notifications/dto/notification-query.dto.ts` (whole file)
- Modify: `server/src/notifications/notifications.service.ts` (`findByUser`, `getUnreadCount`, new `getCounts`)
- Modify: `server/src/notifications/notifications.service.spec.ts` (`describe('findByUser')`, `describe('getUnreadCount')`, new `describe('getCounts')`)
- Modify: `server/src/notifications/notifications.controller.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `NOTIFICATION_GROUPS`, `NOTIFICATION_GROUP`, `TYPES_BY_GROUP`, `NotificationGroup` (Task 1); `toNotificationView`, `NotificationView` (Task 1); `encodeCursor`, `decodeCursor` (`src/tasks/task-cursor.ts`).
- Produces:
  - `GET /notifications?filter=pending|all&type=task|attendance|payment|system&q=&cursor=&pageSize=` → `{ data: NotificationView[]; nextCursor: string | null }` (default `filter=all`, `pageSize=20`, max 50; `page` accepted and ignored).
  - `GET /notifications/unread-count` → `{ count }` = `actionRequired && resolvedAt == null && !isRead`.
  - `GET /notifications/counts` → `NotificationCounts = { pending: number; all: number; groups: Record<NotificationGroup, number> }`.

- [ ] **Step 1: Write the failing service specs**

In `server/src/notifications/notifications.service.spec.ts`:

Add to the imports: `import { BadRequestException } from '@nestjs/common';` and `import { encodeCursor } from '../tasks/task-cursor';`. Add `groupBy: jest.fn(),` to `prisma.notification` in `beforeEach`.

Replace the whole `describe('findByUser', …)` and `describe('getUnreadCount', …)` blocks with:

```ts
  describe('findByUser', () => {
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        ...mockNotification,
        id: `id-${i}`,
        createdAt: new Date(Date.UTC(2026, 9, 10, 10, 0, 0) - i * 60_000),
      }));

    it('pages newest first with a keyset cursor and serves each row with its group', async () => {
      const three = rows(3);
      prisma.notification.findMany.mockResolvedValue(three);

      const res = await service.findByUser(10001, { pageSize: 2 });

      const arg = prisma.notification.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ AND: [{ userId: 10001 }] });
      expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(arg.take).toBe(3);
      expect(res.data.map((r) => r.id)).toEqual(['id-0', 'id-1']);
      expect(res.data[0].group).toBe('task');
      expect(res.nextCursor).toBe(encodeCursor(three[1]));
    });

    it('filters what waits, by group and by text, and continues after a cursor', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      const at = new Date('2026-10-10T05:00:00.000Z');

      const res = await service.findByUser(10001, {
        filter: 'pending',
        type: 'payment',
        q: '  Sardor ',
        cursor: encodeCursor({ createdAt: at, id: 'id-9' }),
      });

      expect(prisma.notification.findMany.mock.calls[0][0].where.AND).toEqual([
        { userId: 10001 },
        { actionRequired: true, resolvedAt: null },
        { type: { in: ['PAYMENT_PROMISE_OVERDUE'] } },
        {
          OR: [
            { title: { contains: 'Sardor', mode: 'insensitive' } },
            { message: { contains: 'Sardor', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { createdAt: { lt: at } },
            { createdAt: at, id: { lt: 'id-9' } },
          ],
        },
      ]);
      expect(res).toEqual({ data: [], nextCursor: null });
    });

    it('refuses a cursor it did not issue', async () => {
      await expect(
        service.findByUser(10001, { cursor: 'bm90LWEtY3Vyc29y' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUnreadCount', () => {
    it('counts only what waits for the user and is unread (the badge)', async () => {
      prisma.notification.count.mockResolvedValue(5);
      expect(await service.getUnreadCount(10001)).toEqual({ count: 5 });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId: 10001,
          actionRequired: true,
          resolvedAt: null,
          isRead: false,
        },
      });
    });
  });

  describe('getCounts', () => {
    it("adds the user's rows up by group, beside what waits", async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { type: 'TASK_REVIEW', _count: { _all: 4 } },
        { type: 'ATTENDANCE_ADMIN_ALERT', _count: { _all: 10 } },
        { type: 'LESSON_STARTED', _count: { _all: 2 } },
        { type: 'SYSTEM', _count: { _all: 1 } },
      ]);
      prisma.notification.count.mockResolvedValue(5);

      expect(await service.getCounts(10001)).toEqual({
        pending: 5,
        all: 17,
        groups: { task: 4, attendance: 12, payment: 0, system: 1 },
      });
      expect(prisma.notification.groupBy).toHaveBeenCalledWith({
        by: ['type'],
        where: { userId: 10001 },
        _count: { _all: true },
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId: 10001, actionRequired: true, resolvedAt: null },
      });
    });
  });
```

Run: `npx jest src/notifications/notifications.service.spec.ts`
Expected: FAIL in the three blocks.

- [ ] **Step 2: Replace the DTO**

Replace `server/src/notifications/dto/notification-query.dto.ts` with:

```ts
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  NOTIFICATION_GROUPS,
  type NotificationGroup,
} from '../notification-kind';

export class NotificationQueryDto {
  /** `pending` = waits for the caller (actionRequired, not resolved), read or not. Default `all`. */
  @IsOptional()
  @IsIn(['pending', 'all'])
  filter?: 'pending' | 'all';

  /** One of the bell's four groups. */
  @IsOptional()
  @IsIn([...NOTIFICATION_GROUPS])
  type?: NotificationGroup;

  /** Searched in the title and the message, case-insensitive. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** The previous page's `nextCursor`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  /** @deprecated The pre-phase-5 bell sends `page=1`; accepted and ignored until that client is gone. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
```

- [ ] **Step 3: Replace the three read methods**

In `server/src/notifications/notifications.service.ts`:

Change the first import line to `import { BadRequestException, Injectable } from '@nestjs/common';`, change `import type { Notification, NotificationType } from '@prisma/client';` to `import type { Notification, NotificationType, Prisma } from '@prisma/client';`, add `import { decodeCursor, encodeCursor } from '../tasks/task-cursor';`, and extend the `./notification-kind` import with `NOTIFICATION_GROUPS` and `TYPES_BY_GROUP`.

Add above the class:

```ts
export interface NotificationCounts {
  /** Waits for the user (read or not): the «Kutilmoqda» list. */
  pending: number;
  all: number;
  groups: Record<NotificationGroup, number>;
}
```

Replace `findByUser` and `getUnreadCount` with:

```ts
  async findByUser(
    userId: number,
    query: NotificationQueryDto,
  ): Promise<{ data: NotificationView[]; nextCursor: string | null }> {
    const pageSize = query.pageSize ?? 20;
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new BadRequestException("Sahifa belgisi noto'g'ri");
    }
    const q = query.q?.trim();

    const and: Prisma.NotificationWhereInput[] = [{ userId }];
    if (query.filter === 'pending') {
      and.push({ actionRequired: true, resolvedAt: null });
    }
    if (query.type) and.push({ type: { in: TYPES_BY_GROUP[query.type] } });
    if (q) {
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { message: { contains: q, mode: 'insensitive' } },
        ],
      });
    }
    if (cursor) {
      and.push({
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.notification.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
    });
    const page = rows.slice(0, pageSize);
    return {
      data: page.map(toNotificationView),
      nextCursor:
        rows.length > pageSize ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  /** The badge (spec §8): waits for the user, not yet done, not yet read. */
  async getUnreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { userId, actionRequired: true, resolvedAt: null, isRead: false },
    });
    return { count };
  }

  /** The page's left list. */
  async getCounts(userId: number): Promise<NotificationCounts> {
    const [byType, pending] = await Promise.all([
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.notification.count({
        where: { userId, actionRequired: true, resolvedAt: null },
      }),
    ]);
    const groups = Object.fromEntries(
      NOTIFICATION_GROUPS.map((g) => [g, 0]),
    ) as Record<NotificationGroup, number>;
    let all = 0;
    for (const row of byType) {
      groups[NOTIFICATION_GROUP[row.type]] += row._count._all;
      all += row._count._all;
    }
    return { pending, all, groups };
  }
```

- [ ] **Step 4: Run the service spec**

Run: `npx jest src/notifications/notifications.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the route**

In `server/src/notifications/notifications.controller.ts`, after the `getUnreadCount` handler, add:

```ts
  /** The page's left list: what waits, everything, and each group. */
  @Get('counts')
  getCounts(@CurrentUser('id') userId: number) {
    return this.notificationsService.getCounts(userId);
  }
```

- [ ] **Step 6: Classify the routes**

In `server/src/common/auth/branch-route-policy.ts`:

1. Append this block as the LAST element of `ROUTE_POLICIES` (just before the `];` that precedes the `UNREVIEWED_ROUTES` doc comment):

```ts
  {
    policy: 'SELF',
    reason:
      "The bell. Every route reads or writes rows keyed on `@CurrentUser('id')` " +
      '(`NotificationsService` filters by `userId` alone), and a notification is ' +
      'addressed to a person, not a branch: an attendance alert of a Namangan group ' +
      'went to that branch’s administrators when it was written, so there is ' +
      'nothing left to narrow at read time.',
    routes: [
      'DELETE /notifications/devices',
      'DELETE /notifications/push/unsubscribe',
      'GET /notifications',
      'GET /notifications/counts',
      'GET /notifications/stream',
      'GET /notifications/unread-count',
      'PATCH /notifications/:id/read',
      'PATCH /notifications/read-all',
      'POST /notifications/devices',
      'POST /notifications/push/subscribe',
    ],
  },
```

2. Delete these nine lines from `UNREVIEWED_ROUTES`: `'DELETE /notifications/devices',` `'DELETE /notifications/push/unsubscribe',` `'GET /notifications',` `'GET /notifications/stream',` `'GET /notifications/unread-count',` `'PATCH /notifications/:id/read',` `'PATCH /notifications/read-all',` `'POST /notifications/devices',` `'POST /notifications/push/subscribe',`.

3. Change `export const UNREVIEWED_BUDGET = 88;` to `export const UNREVIEWED_BUDGET = 79;`.

- [ ] **Step 7: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write src/notifications/dto/notification-query.dto.ts src/notifications/notifications.service.ts src/notifications/notifications.service.spec.ts src/notifications/notifications.controller.ts src/common/auth/branch-route-policy.ts
npx eslint src/notifications src/common/auth --quiet
npx jest src/notifications src/common/auth/branch-route-policy.spec.ts
npm run typecheck
```
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/src/notifications/dto/notification-query.dto.ts server/src/notifications/notifications.service.ts server/src/notifications/notifications.service.spec.ts server/src/notifications/notifications.controller.ts server/src/common/auth/branch-route-policy.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): list filters, cursor paging, badge rule and counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: One-off cleanup script

**Files:**
- Create: `server/scripts/lib/notification-cleanup.ts`, `server/scripts/lib/notification-cleanup.spec.ts`
- Create: `server/scripts/notification-cleanup.ts`
- Modify: `server/tsconfig.check.json` (`include`)

**Interfaces:**
- Consumes: columns from Task 1; `run`, `printHeader`, `printTable`, `section` from `server/scripts/lib/check-cli.ts`.
- Produces: `OLD_UNREAD_DAYS = 7`; `interface CleanupStep { name: string; count: Prisma.Sql; apply: Prisma.Sql }`; `cleanupSteps(now: Date): CleanupStep[]` (4 steps, closing before reading); `BADGE_TOP: Prisma.Sql`.
- Never import the CLI file from a spec — importing it runs it.

- [ ] **Step 1: Write the failing spec**

Create `server/scripts/lib/notification-cleanup.spec.ts`:

```ts
import { OLD_UNREAD_DAYS, cleanupSteps } from './notification-cleanup';

describe('cleanupSteps', () => {
  const now = new Date('2026-10-11T03:00:00.000Z');
  const steps = cleanupSteps(now);

  it('closes what was already done before it marks anything read', () => {
    expect(steps.map((s) => s.name)).toEqual([
      'Yopilgan topshiriqlar',
      "Hal bo'lgan darslar",
      "Qarzi yopilgan va'dalar",
      "7 kundan eski o'qilmaganlar",
    ]);
  });

  it('every closing step touches only open action rows', () => {
    for (const step of steps.slice(0, 3)) {
      for (const sql of [step.count.sql, step.apply.sql]) {
        expect(sql).toContain('"actionRequired"');
        expect(sql).toContain('"resolvedAt" IS NULL');
      }
    }
  });

  it('closes an overdue promise only once the debt is gone, at the run time', () => {
    expect(steps[2].apply.sql).toContain('"balance" >= 0');
    expect(steps[2].apply.values).toEqual([now]);
  });

  it('marks read only unread rows older than seven days', () => {
    const read = steps[3];
    expect(read.apply.sql).toContain('SET "isRead" = true');
    expect(read.apply.sql).toContain('"isRead" = false');
    expect(read.apply.values).toEqual([
      new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000),
    ]);
  });

  it('never deletes', () => {
    // `"deletedAt"` appears in the lesson step, so match the statement only.
    for (const step of steps) {
      expect(step.apply.sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server && npx jest scripts/lib/notification-cleanup.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write the steps**

Create `server/scripts/lib/notification-cleanup.ts`:

```ts
import { Prisma } from '@prisma/client';

/** Unread rows older than this are marked read once (spec 2026-10-07 §8). */
export const OLD_UNREAD_DAYS = 7;

export interface CleanupStep {
  name: string;
  /** How many rows the step would write (the dry run). */
  count: Prisma.Sql;
  /** The write. */
  apply: Prisma.Sql;
}

const closedTask = Prisma.sql`t."id" = n."taskId"
  AND n."actionRequired" AND n."resolvedAt" IS NULL
  AND t."status" IN ('DONE', 'CANCELLED')`;

// The lesson day rides in the key: `<TYPE>:<YYYY-MM-DD>` (notification-kind.ts).
const lessonDay = Prisma.sql`split_part(n."groupKey", ':', 2)::date`;

/** When the lesson's job got done: a register, an answer, a cancellation or a move. */
const lessonDoneAt = Prisma.sql`LEAST(
  (SELECT min(a."createdAt") FROM "Attendance" a
    WHERE a."groupId" = n."relatedEntityId" AND a."date" = ${lessonDay}),
  (SELECT COALESCE(u."decidedAt", u."updatedAt") FROM "UnmarkedLesson" u
    WHERE u."groupId" = n."relatedEntityId" AND u."date" = ${lessonDay} AND u."status" <> 'PENDING'),
  (SELECT min(c."createdAt") FROM "LessonCancellation" c
    WHERE c."groupId" = n."relatedEntityId" AND c."date" = ${lessonDay} AND c."deletedAt" IS NULL),
  (SELECT min(r."createdAt") FROM "LessonReschedule" r
    WHERE r."groupId" = n."relatedEntityId" AND r."originalDate" = ${lessonDay} AND r."deletedAt" IS NULL)
)`;

const openLessonAlert = Prisma.sql`n."actionRequired" AND n."resolvedAt" IS NULL
  AND n."relatedEntityType" = 'Group' AND n."groupKey" IS NOT NULL`;

const paidPromise = Prisma.sql`s."id"::text = n."relatedEntityId"
  AND n."type" = 'PAYMENT_PROMISE_OVERDUE' AND n."relatedEntityType" = 'Student'
  AND n."actionRequired" AND n."resolvedAt" IS NULL AND s."balance" >= 0`;

/**
 * Before the phase-5 bell nothing ever closed. The first three steps close
 * the action rows whose job was already done, stamped with the time it was
 * done (never before the row itself); the last marks old unread rows read.
 * Nothing is deleted, and a repeat run finds nothing left.
 */
export function cleanupSteps(now: Date): CleanupStep[] {
  const cutoff = new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000);
  return [
    {
      name: 'Yopilgan topshiriqlar',
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        JOIN "Task" t ON ${closedTask}`,
      apply: Prisma.sql`UPDATE "Notification" n
        SET "resolvedAt" = GREATEST(n."createdAt", COALESCE(t."closedAt", t."cancelledAt", t."updatedAt"))
        FROM "Task" t WHERE ${closedTask}`,
    },
    {
      name: "Hal bo'lgan darslar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        WHERE ${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL`,
      apply: Prisma.sql`UPDATE "Notification" n
        SET "resolvedAt" = GREATEST(n."createdAt", ${lessonDoneAt})
        WHERE ${openLessonAlert} AND ${lessonDoneAt} IS NOT NULL`,
    },
    {
      // The day the debt was cleared is not recorded; the run time stands in.
      name: "Qarzi yopilgan va'dalar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification" n
        JOIN "Student" s ON ${paidPromise}`,
      apply: Prisma.sql`UPDATE "Notification" n SET "resolvedAt" = ${now}
        FROM "Student" s WHERE ${paidPromise}`,
    },
    {
      name: "7 kundan eski o'qilmaganlar",
      count: Prisma.sql`SELECT count(*)::int AS n FROM "Notification"
        WHERE "isRead" = false AND "createdAt" < ${cutoff}`,
      apply: Prisma.sql`UPDATE "Notification" SET "isRead" = true
        WHERE "isRead" = false AND "createdAt" < ${cutoff}`,
    },
  ];
}

/** The ten largest badges (spec §8 rule), before or after the run. */
export const BADGE_TOP = Prisma.sql`SELECT "userId", count(*)::int AS n FROM "Notification"
  WHERE "actionRequired" AND "resolvedAt" IS NULL AND NOT "isRead"
  GROUP BY "userId" ORDER BY n DESC LIMIT 10`;
```

The nested fragments carry no parameters, so step 3's `apply.values` is exactly `[now]` and step 4's is `[cutoff]` — the spec checks both.

- [ ] **Step 3: Run the spec**

Run: `npx jest scripts/lib/notification-cleanup.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 4: Write the CLI**

Create `server/scripts/notification-cleanup.ts`:

```ts
/**
 * One-off (spec 2026-10-07 §8). Before the phase-5 bell no alert ever closed,
 * so some accounts held 450–780 unread rows. Run once, right after the deploy
 * that applies the migration `20261010120000_notification_action_state`:
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/notification-cleanup.ts [--apply]
 *
 * It closes (`resolvedAt`) the action rows whose job was already done — closed
 * tasks, lessons with a register / an answer / a cancellation / a move, overdue
 * promises whose debt is cleared — then marks unread rows older than 7 days
 * read. Nothing is deleted. Without `--apply` it is a dry run on a read-only
 * connection (checked, else it stops) that prints what each step would write;
 * with it, all steps run in one transaction. Both end with the ten largest
 * badges. A repeat run finds nothing left to do.
 */
import { printHeader, printTable, run, section } from './lib/check-cli';
import { BADGE_TOP, cleanupSteps } from './lib/notification-cleanup';

const APPLY = process.argv.includes('--apply');

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

// check-cli has already loaded .env; its makePrisma() reads the variable later.
if (!APPLY && process.env.DATABASE_URL) {
  process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL);
}

run(async (prisma) => {
  printHeader(`Notification cleanup (${APPLY ? 'APPLY' : 'dry run'})`);
  if (!APPLY) {
    const [ro] = await prisma.$queryRaw<
      { default_transaction_read_only: string }[]
    >`SHOW default_transaction_read_only`;
    if (ro?.default_transaction_read_only !== 'on') {
      throw new Error('Read-only connection was not established — stopping');
    }
  }

  const steps = cleanupSteps(new Date());
  section(APPLY ? 'Yozildi' : 'Yoziladi (sinov)');
  const rows: (string | number)[][] = [];
  if (APPLY) {
    await prisma.$transaction(
      async (tx) => {
        for (const step of steps) {
          rows.push([step.name, await tx.$executeRaw(step.apply)]);
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  } else {
    for (const step of steps) {
      const [r] = await prisma.$queryRaw<{ n: number }[]>(step.count);
      rows.push([step.name, r?.n ?? 0]);
    }
  }
  printTable(['Qadam', 'Qatorlar'], rows, ['l', 'r']);

  section("Eng katta raqamlar (qo'ng'iroqcha)");
  const top = await prisma.$queryRaw<{ userId: number; n: number }[]>(
    BADGE_TOP,
  );
  printTable(
    ['Xodim', 'Raqam'],
    top.map((t) => [t.userId, t.n]),
    ['r', 'r'],
  );
});
```

- [ ] **Step 5: Hold the script to `src/` standards**

`scripts/**` is ESLint-ignored and outside the type check, except the data-writing scripts listed in `server/tsconfig.check.json`. Add these three lines to its `include` array, right after `"scripts/lib/comment-task-apply.ts"` (add a comma to that line):

```json
    "scripts/notification-cleanup.ts",
    "scripts/lib/notification-cleanup.ts",
    "scripts/lib/notification-cleanup.spec.ts"
```

- [ ] **Step 6: Gate** (no database run — the dev DB has no such columns)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx prettier --write scripts/notification-cleanup.ts scripts/lib/notification-cleanup.ts scripts/lib/notification-cleanup.spec.ts
npx jest scripts/lib/notification-cleanup.spec.ts
npm run typecheck
```
Expected: green; `typecheck` now covers the CLI without running it.

- [ ] **Step 7: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/scripts/notification-cleanup.ts server/scripts/lib/notification-cleanup.ts server/scripts/lib/notification-cleanup.spec.ts server/tsconfig.check.json
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): one-off cleanup — close what was done, mark old unread read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client pure helpers

**Files:**
- Create: `client/src/components/notifications/notification-view.ts`, `client/src/components/notifications/notification-view.test.ts`

**Interfaces:**
- Consumes: the server row shape from Task 3 (`group`, `actionRequired`, `resolvedAt`, `groupKey` on every row; SSE `notification` rows have the same shape).
- Produces: `NOTIFICATION_TYPES`, `type NotificationType`, `NOTIFICATION_GROUPS`, `type NotificationGroup`, `GROUP_LABEL`, `interface AppNotification`, `interface NotificationCounts`, `type NotificationRow` (`{ kind: "single"; key; item } | { kind: "group"; key; type; items }`), `isPending`, `clockTime`, `dayLabel`, `relativeTime`, `groupNotifications`, `groupByDay`, `panelSections`, `groupTitle`, `groupHint`, `lessonParts`, `lessonLine`, `resolvedLine`, `actionLabel`, `PAGE_VIEWS`, `type PageView`, `VIEW_LABEL`, `viewParams`, `viewCount`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/notifications/notification-view.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TYPES,
  actionLabel,
  dayLabel,
  groupByDay,
  groupHint,
  groupNotifications,
  groupTitle,
  lessonLine,
  panelSections,
  relativeTime,
  viewCount,
  viewParams,
  type AppNotification,
  type NotificationRow,
} from "./notification-view";

const n = (over: Partial<AppNotification>): AppNotification => ({
  id: "n",
  type: "SYSTEM",
  group: "system",
  title: "Sarlavha",
  message: "Matn",
  relatedEntityType: null,
  relatedEntityId: null,
  commentId: null,
  taskId: null,
  isRead: false,
  actionRequired: false,
  resolvedAt: null,
  groupKey: null,
  createdAt: "2026-10-10T05:00:00.000Z",
  ...over,
});

// 10.10.2026, 12:00 in Tashkent.
const NOW = new Date("2026-10-10T07:00:00.000Z");
const DETAILS =
  "📋 Dars tugadi, davomat olinmadi\n\n👥 Guruh: A1-3\n🕐 Vaqt: 09:00–10:30\n🚪 Xona: 201\n👨‍🏫 O'qituvchi: Tursunova Sardora\n\nmatn";
const alert = (id: string, over: Partial<AppNotification> = {}) =>
  n({
    id,
    type: "ATTENDANCE_ADMIN_ALERT",
    group: "attendance",
    actionRequired: true,
    groupKey: "ATTENDANCE_ADMIN_ALERT:2026-10-10",
    message: DETAILS,
    ...over,
  });
const asGroup = (row: NotificationRow) => {
  if (row.kind !== "group") throw new Error("expected a group row");
  return row;
};

describe("NOTIFICATION_TYPES", () => {
  it("lists exactly the server's NotificationType enum", () => {
    const schema = readFileSync(
      join(__dirname, "../../../../server/prisma/schema.prisma"),
      "utf8",
    );
    const body = schema.match(/enum NotificationType \{([^}]*)\}/)![1];
    const server = body.split("\n").map((l) => l.trim()).filter(Boolean);
    expect([...NOTIFICATION_TYPES].sort()).toEqual(server.sort());
  });
});

describe("Tashkent clock", () => {
  it("speaks in minutes, then hours, then the clock", () => {
    expect(relativeTime("2026-10-10T06:59:30.000Z", NOW)).toBe("hozirgina");
    expect(relativeTime("2026-10-10T06:55:00.000Z", NOW)).toBe("5 daqiqa oldin");
    expect(relativeTime("2026-10-10T05:00:00.000Z", NOW)).toBe("2 soat oldin");
    expect(relativeTime("2026-10-10T00:00:00.000Z", NOW)).toBe("05:00");
    expect(relativeTime("2026-10-09T18:30:00.000Z", NOW)).toBe("Kecha, 23:30");
  });

  it("names days by the Tashkent calendar, not UTC", () => {
    // 19:30 UTC on the 9th is 00:30 on the 10th in Tashkent.
    expect(dayLabel("2026-10-09T19:30:00.000Z", NOW)).toBe("Bugun");
    expect(dayLabel("2026-10-09T18:30:00.000Z", NOW)).toBe("Kecha");
    expect(dayLabel("2026-10-07T10:00:00.000Z", NOW)).toBe("07.10.2026");
  });
});

describe("groupNotifications", () => {
  it("folds rows sharing a groupKey into one line at the newest one's place", () => {
    const rows = groupNotifications([
      alert("a1"),
      n({ id: "s1" }),
      alert("a2"),
      alert("a3"),
      n({ id: "lone", groupKey: "LESSON_STARTED:2026-10-10" }),
    ]);
    expect(rows.map((r) => r.kind)).toEqual(["group", "single", "single"]);
    expect(asGroup(rows[0]).items.map((i) => i.id)).toEqual(["a1", "a2", "a3"]);
    expect(rows[2].key).toBe("lone");
  });

  it("titles a folded line and says what it waits for, or when it closed", () => {
    const open = asGroup(
      groupNotifications([
        alert("a1"),
        alert("a2", { resolvedAt: "2026-10-10T05:05:00.000Z" }),
      ])[0],
    );
    expect(groupTitle(open)).toBe("Davomat olinmagan · 2 guruh");
    expect(groupHint(open)).toBe("Dars tugashiga 30 daqiqadan kam qoldi");

    const closed = asGroup(
      groupNotifications([
        alert("a1", { resolvedAt: "2026-10-10T04:50:00.000Z" }),
        alert("a2", { resolvedAt: "2026-10-10T05:05:00.000Z" }),
      ])[0],
    );
    expect(groupHint(closed)).toBe("O'zi yopildi · 10:05");
  });
});

describe("groupByDay and panelSections", () => {
  it("splits a newest-first list into Tashkent days", () => {
    const days = groupByDay(
      [
        n({ id: "t1", createdAt: "2026-10-10T06:00:00.000Z" }),
        n({ id: "t2", createdAt: "2026-10-09T19:30:00.000Z" }),
        n({ id: "y1", createdAt: "2026-10-09T10:00:00.000Z" }),
      ],
      NOW,
    );
    expect(days.map((d) => [d.label, d.items.map((i) => i.id)])).toEqual([
      ["Bugun", ["t1", "t2"]],
      ["Kecha", ["y1"]],
    ]);
  });

  it("puts what waits first and today's information under it", () => {
    const waiting = alert("w1");
    const closedToday = alert("c1", { resolvedAt: "2026-10-10T06:00:00.000Z" });
    const infoToday = n({ id: "i1" });
    const infoYesterday = n({ id: "i0", createdAt: "2026-10-09T10:00:00.000Z" });
    const { waiting: w, todayInfo } = panelSections(
      [waiting, closedToday],
      [waiting, closedToday, infoToday, infoYesterday],
      NOW,
    );
    expect(w.map((r) => r.key)).toEqual(["w1"]);
    expect(todayInfo.map((r) => r.key)).toEqual(["c1", "i1"]);
  });
});

describe("row text", () => {
  it("reads group, time and teacher from a lesson alert's details", () => {
    expect(lessonLine(alert("a1"))).toBe("A1-3 · 09:00–10:30 · Tursunova Sardora");
    expect(lessonLine(n({ title: "Faqat sarlavha" }))).toBe("Faqat sarlavha");
  });

  it("labels the row button by what it opens", () => {
    expect(actionLabel("TASK_REVIEW")).toBe("Ko'rish");
    expect(actionLabel("PAYMENT_PROMISE_OVERDUE")).toBe("Ochish");
  });
});

describe("page views", () => {
  it("maps the left list onto the API filters", () => {
    expect(viewParams("pending")).toEqual({ filter: "pending" });
    expect(viewParams("all")).toEqual({ filter: "all" });
    expect(viewParams("attendance")).toEqual({ filter: "all", type: "attendance" });
    expect(viewParams("junk")).toEqual({ filter: "pending" });
  });

  it("reads each view's count", () => {
    const counts = {
      pending: 5,
      all: 142,
      groups: { task: 18, attendance: 97, payment: 21, system: 6 },
    };
    expect(viewCount("pending", counts)).toBe(5);
    expect(viewCount("all", counts)).toBe(142);
    expect(viewCount("payment", counts)).toBe(21);
    expect(viewCount("task", undefined)).toBeNull();
  });
});
```

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client && npx vitest run src/components/notifications/notification-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Write the helpers**

Create `client/src/components/notifications/notification-view.ts`:

```ts
/**
 * The bell's pure rules (spec 2026-10-07 §8): types, folding, the Tashkent
 * clock. No React and no API, so vitest covers them in node.
 */

/** Mirrors `enum NotificationType` in server/prisma/schema.prisma (the test reads it). */
export const NOTIFICATION_TYPES = [
  "COMMENT",
  "TASK_ASSIGNED",
  "TASK_STATUS_CHANGED",
  "TASK_DELETED",
  "TASK_UPDATED",
  "TASK_REMINDER",
  "TASK_REVIEW",
  "TASK_OVERDUE",
  "SYSTEM",
  "LESSON_STARTED",
  "ATTENDANCE_ADMIN_ALERT",
  "ATTENDANCE_TEACHER_WARNING",
  "ATTENDANCE_MISSING_TEACHER",
  "ATTENDANCE_MISSING_ADMIN",
  "ATTENDANCE_COMPLETED",
  "LESSON_RESCHEDULED",
  "LESSON_CANCELLED",
  "PAYMENT_PROMISE_OVERDUE",
  "ABSENCE_WARNING",
  "ENROLLMENT_AUTO_PAUSED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** The server's four groups (`notification-kind.ts`); every row arrives with its `group`. */
export const NOTIFICATION_GROUPS = ["task", "attendance", "payment", "system"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

export const GROUP_LABEL: Record<NotificationGroup, string> = {
  task: "Topshiriqlar",
  attendance: "Davomat",
  payment: "To'lovlar",
  system: "Tizim",
};

export interface AppNotification {
  id: string;
  type: NotificationType;
  group: NotificationGroup;
  title: string;
  message: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  commentId: string | null;
  taskId: string | null;
  isRead: boolean;
  actionRequired: boolean;
  resolvedAt: string | null;
  groupKey: string | null;
  createdAt: string;
}

export interface NotificationCounts {
  pending: number;
  all: number;
  groups: Record<NotificationGroup, number>;
}

/** «Kutilmoqda»: waits for the viewer, read or not. */
export function isPending(n: Pick<AppNotification, "actionRequired" | "resolvedAt">): boolean {
  return n.actionRequired && n.resolvedAt === null;
}

const OFFSET = 5 * 3_600_000;
const pad = (v: number) => String(v).padStart(2, "0");
const shifted = (iso: string | Date) => new Date(new Date(iso).getTime() + OFFSET);
const tDay = (iso: string | Date) => Math.floor((new Date(iso).getTime() + OFFSET) / 86_400_000);

/** "HH:mm" on the Tashkent clock. */
export function clockTime(iso: string): string {
  const t = shifted(iso);
  return `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** «Bugun», «Kecha» or dd.MM.yyyy — Tashkent days, never the browser's. */
export function dayLabel(iso: string, now: Date): string {
  const diff = tDay(now) - tDay(iso);
  if (diff === 0) return "Bugun";
  if (diff === 1) return "Kecha";
  const t = shifted(iso);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

/** «hozirgina», «5 daqiqa oldin», «2 soat oldin», then the clock. */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "hozirgina";
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  if (minutes < 6 * 60) return `${Math.floor(minutes / 60)} soat oldin`;
  const day = dayLabel(iso, now);
  return day === "Bugun" ? clockTime(iso) : `${day}, ${clockTime(iso)}`;
}

export type NotificationRow =
  | { kind: "single"; key: string; item: AppNotification }
  | { kind: "group"; key: string; type: NotificationType; items: AppNotification[] };
type GroupRow = Extract<NotificationRow, { kind: "group" }>;

/** Rows sharing a `groupKey` fold into one line at the newest one's place. Input is newest first. */
export function groupNotifications(items: AppNotification[]): NotificationRow[] {
  const out: NotificationRow[] = [];
  const byKey = new Map<string, GroupRow>();
  for (const item of items) {
    if (!item.groupKey) {
      out.push({ kind: "single", key: item.id, item });
      continue;
    }
    const existing = byKey.get(item.groupKey);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    const row: GroupRow = { kind: "group", key: item.groupKey, type: item.type, items: [item] };
    byKey.set(item.groupKey, row);
    out.push(row);
  }
  return out.map((row) =>
    row.kind === "group" && row.items.length === 1
      ? { kind: "single", key: row.items[0].id, item: row.items[0] }
      : row,
  );
}

/** Consecutive runs of one Tashkent day, newest first. */
export function groupByDay(
  items: AppNotification[],
  now: Date,
): { label: string; items: AppNotification[] }[] {
  const out: { day: number; label: string; items: AppNotification[] }[] = [];
  for (const item of items) {
    const day = tDay(item.createdAt);
    const last = out[out.length - 1];
    if (last && last.day === day) last.items.push(item);
    else out.push({ day, label: dayLabel(item.createdAt, now), items: [item] });
  }
  return out.map(({ label, items: list }) => ({ label, items: list }));
}

/** The panel's «Kutilmoqda» tab: what waits, then today's information (closed ones greyed). */
export function panelSections(
  pending: AppNotification[],
  recent: AppNotification[],
  now: Date,
): { waiting: NotificationRow[]; todayInfo: NotificationRow[] } {
  return {
    waiting: groupNotifications(pending.filter(isPending)),
    todayInfo: groupNotifications(
      recent.filter((n) => !isPending(n) && tDay(n.createdAt) === tDay(now)),
    ),
  };
}

const LESSON_GROUP: Partial<Record<NotificationType, { title: string; hint: string }>> = {
  LESSON_STARTED: { title: "Dars boshlandi", hint: "Davomatni belgilashni unutmang" },
  ATTENDANCE_TEACHER_WARNING: { title: "Davomat olinmagan", hint: "Dars tugashiga 30 daqiqadan kam qoldi" },
  ATTENDANCE_ADMIN_ALERT: { title: "Davomat olinmagan", hint: "Dars tugashiga 30 daqiqadan kam qoldi" },
  ATTENDANCE_MISSING_TEACHER: { title: "Davomat olinmadi", hint: "Dars tugadi, davomat olinmadi" },
  ATTENDANCE_MISSING_ADMIN: { title: "Davomat olinmadi", hint: "«Dars bo'ldimi?» savoliga javob bering" },
};

/** «Davomat olinmagan · 3 guruh». */
export function groupTitle(row: GroupRow): string {
  return `${LESSON_GROUP[row.type]?.title ?? row.items[0].title} · ${row.items.length} guruh`;
}

/** The folded line's second line: what it waits for, or when the last one closed. */
export function groupHint(row: GroupRow): string {
  if (row.items.some((n) => n.resolvedAt === null)) return LESSON_GROUP[row.type]?.hint ?? "";
  const last = row.items.map((n) => n.resolvedAt ?? "").sort().pop() ?? "";
  return `O'zi yopildi · ${clockTime(last)}`;
}

/**
 * The details block every lesson alert carries (attendance-reminder.service.ts
 * `buildDetailsBlock`: «👥 Guruh: …», «🕐 Vaqt: …», «👨‍🏫 O'qituvchi: …»).
 */
export function lessonParts(message: string): { group?: string; time?: string; teacher?: string } {
  const pick = (label: string) => message.match(new RegExp(`${label}:\\s*(.+)`))?.[1]?.trim();
  return { group: pick("Guruh"), time: pick("Vaqt"), teacher: pick("O'qituvchi") };
}

/** «A1-3 · 09:00–10:30 · Tursunova Sardora», or the title when there is no details block. */
export function lessonLine(n: Pick<AppNotification, "title" | "message">): string {
  const { group, time, teacher } = lessonParts(n.message);
  return [group, time, teacher].filter(Boolean).join(" · ") || n.title;
}

export function resolvedLine(resolvedAt: string): string {
  return `Eslatma o'zi yopildi · ${clockTime(resolvedAt)}`;
}

/** A task is looked at; everything else is opened. */
export function actionLabel(type: NotificationType): string {
  return type.startsWith("TASK_") ? "Ko'rish" : "Ochish";
}

/** The page's left list, in order. */
export const PAGE_VIEWS = ["pending", "all", ...NOTIFICATION_GROUPS] as const;
export type PageView = (typeof PAGE_VIEWS)[number];

export const VIEW_LABEL: Record<PageView, string> = {
  pending: "Kutilmoqda",
  all: "Hammasi",
  ...GROUP_LABEL,
};

/** `?view=` → the API's `filter` and `type`; anything unknown reads as «Kutilmoqda». */
export function viewParams(view: string): { filter: "pending" | "all"; type?: NotificationGroup } {
  if (view === "all") return { filter: "all" };
  if ((NOTIFICATION_GROUPS as readonly string[]).includes(view)) {
    return { filter: "all", type: view as NotificationGroup };
  }
  return { filter: "pending" };
}

export function viewCount(view: PageView, counts: NotificationCounts | undefined): number | null {
  if (!counts) return null;
  if (view === "pending") return counts.pending;
  if (view === "all") return counts.all;
  return counts.groups[view];
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/components/notifications/notification-view.test.ts`
Expected: PASS.

- [ ] **Step 4: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run src/components/notifications
```
Expected: no tsc errors; lint summary shows 0 errors; tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/notifications/notification-view.ts client/src/components/notifications/notification-view.test.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): client rules for folding, days and the Tashkent clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Store, SSE and the new bell panel (mockup s19)

**Files:**
- Modify (rewrite): `client/src/hooks/use-notifications.ts`
- Modify: `client/src/hooks/use-sse.ts`
- Modify: `client/src/hooks/use-task-counts.ts`
- Create: `client/src/components/notifications/notification-row.tsx`
- Modify (rewrite): `client/src/components/notifications/notification-bell.tsx`

**Interfaces:**
- Consumes: everything from Task 5; `notificationHref(n, roleIds)` (`notification-href.ts`, unchanged — it imports `AppNotification` from `@/hooks/use-notifications`, kept as a re-export); API from Task 3; SSE `{ type: 'notification', notification }` and `{ type: 'notification.resolved', ids, resolvedAt }`.
- Produces (`use-notifications.ts`): `fetchNotificationPage(query: NotificationQuery): Promise<NotificationPage>`, `fetchNotificationCounts(): Promise<NotificationCounts>`, `interface NotificationPage { data: AppNotification[]; nextCursor: string | null }`, `interface NotificationQuery { filter: "pending" | "all"; type?: NotificationGroup; q?: string; cursor?: string | null; pageSize?: number }`, store `useNotifications` with `badge`, `pending`, `recent`, `counts`, `chip`, `loading`, `version`, `fetchBadge()`, `loadPanel(chip)`, `add(n)`, `resolve(ids, resolvedAt)`, `markRead(id)`, `markAllRead()`; `export type { AppNotification }`.
- Produces (`notification-row.tsx`): `NotificationRowView({ row, now, onOpen, hrefOf, collapsible? })`.
- Header walker (`src/lib/branch-scoped-header.test.ts`): only `use-notifications.ts` imports `@/lib/api` among these files; it is already listed as branch-independent. The row and view files must not import `@/lib/api`.

- [ ] **Step 1: Rewrite the store**

Replace `client/src/hooks/use-notifications.ts` with:

```ts
import { create } from "zustand";
import api from "@/lib/api";
import {
  isPending,
  type AppNotification,
  type NotificationCounts,
  type NotificationGroup,
} from "@/components/notifications/notification-view";

export type { AppNotification } from "@/components/notifications/notification-view";

export interface NotificationPage {
  data: AppNotification[];
  nextCursor: string | null;
}

export interface NotificationQuery {
  filter: "pending" | "all";
  type?: NotificationGroup;
  q?: string;
  cursor?: string | null;
  pageSize?: number;
}

export async function fetchNotificationPage(query: NotificationQuery): Promise<NotificationPage> {
  const { data } = await api.get<NotificationPage>("/notifications", {
    params: {
      filter: query.filter,
      type: query.type,
      q: query.q || undefined,
      cursor: query.cursor ?? undefined,
      pageSize: query.pageSize ?? 30,
    },
  });
  return data;
}

export async function fetchNotificationCounts(): Promise<NotificationCounts> {
  return (await api.get<NotificationCounts>("/notifications/counts")).data;
}

const PANEL_SIZE = 30;

interface NotificationsState {
  /** What waits for the viewer and is unread — always the server's number. */
  badge: number;
  /** The panel's «Kutilmoqda» list. */
  pending: AppNotification[];
  /** The panel's newest rows (all kinds). */
  recent: AppNotification[];
  counts: NotificationCounts | null;
  /** The panel's type chip; null = every type. */
  chip: NotificationGroup | null;
  loading: boolean;
  /** Bumps on every change (SSE, read); open lists refetch when it moves. */
  version: number;
  fetchBadge: () => Promise<void>;
  loadPanel: (chip: NotificationGroup | null) => Promise<void>;
  add: (n: AppNotification) => void;
  resolve: (ids: string[], resolvedAt: string) => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const withResolved = (list: AppNotification[], ids: Set<string>, resolvedAt: string) =>
  list.map((n) => (ids.has(n.id) && n.resolvedAt === null ? { ...n, resolvedAt } : n));

export const useNotifications = create<NotificationsState>((set, get) => ({
  badge: 0,
  pending: [],
  recent: [],
  counts: null,
  chip: null,
  loading: false,
  version: 0,

  fetchBadge: async () => {
    try {
      const { data } = await api.get<{ count: number }>("/notifications/unread-count");
      set({ badge: data.count });
    } catch {
      // the badge keeps its last value
    }
  },

  loadPanel: async (chip) => {
    set({ chip, loading: true });
    try {
      const type = chip ?? undefined;
      const [pending, recent, counts] = await Promise.all([
        fetchNotificationPage({ filter: "pending", type, pageSize: PANEL_SIZE }),
        fetchNotificationPage({ filter: "all", type, pageSize: PANEL_SIZE }),
        fetchNotificationCounts(),
      ]);
      // A later chip click wins over an answer still on its way.
      if (get().chip !== chip) return;
      set({ pending: pending.data, recent: recent.data, counts, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  add: (n) => {
    set((s) => {
      if (s.recent.some((r) => r.id === n.id)) return { version: s.version + 1 };
      const shown = s.chip === null || s.chip === n.group;
      return {
        recent: shown ? [n, ...s.recent].slice(0, 50) : s.recent,
        pending: shown && isPending(n) ? [n, ...s.pending] : s.pending,
        version: s.version + 1,
      };
    });
    void get().fetchBadge();
    const audio = new Audio("/message-notification.mp3");
    audio.volume = 0.5;
    audio.play().catch(() => {});
  },

  resolve: (ids, resolvedAt) => {
    const closed = new Set(ids);
    set((s) => ({
      pending: withResolved(s.pending, closed, resolvedAt),
      recent: withResolved(s.recent, closed, resolvedAt),
      version: s.version + 1,
    }));
    void get().fetchBadge();
  },

  markRead: async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      const read = (list: AppNotification[]) => list.map((n) => (n.id === id ? { ...n, isRead: true } : n));
      set((s) => ({ pending: read(s.pending), recent: read(s.recent), version: s.version + 1 }));
      await get().fetchBadge();
    } catch {
      // silent
    }
  },

  markAllRead: async () => {
    try {
      await api.patch("/notifications/read-all");
      const read = (list: AppNotification[]) => list.map((n) => ({ ...n, isRead: true }));
      set((s) => ({ pending: read(s.pending), recent: read(s.recent), badge: 0, version: s.version + 1 }));
    } catch {
      // silent
    }
  },
}));
```

- [ ] **Step 2: Teach the SSE hook the new message**

In `client/src/hooks/use-sse.ts`:
- Delete `const addNotification = useNotifications((s) => s.addNotification);`.
- Replace the body of `for (const line of lines) { … }` with:

```ts
            if (!line.startsWith("data: ")) continue;
            try {
              const payload = JSON.parse(line.slice(6));
              const store = useNotifications.getState();
              if (payload.type === "notification" && payload.notification) {
                store.add(payload.notification);
              }
              if (payload.type === "notification.resolved" && Array.isArray(payload.ids)) {
                store.resolve(payload.ids, payload.resolvedAt);
              }
              if (payload.type === "task.updated" && typeof payload.taskId === "string") {
                void useTasks.getState().refreshTask(payload.taskId);
                if (useTasks.getState().openTaskId === payload.taskId) void useTasks.getState().loadDetail(payload.taskId);
              }
            } catch {
              // ignore parse errors
            }
```
- Change the effect's dependency list `}, [addNotification]);` to `}, []);`.

- [ ] **Step 3: Keep the sidebar task counter in step**

In `client/src/hooks/use-task-counts.ts` replace
`const lastNotificationId = useNotifications((s) => s.notifications[0]?.id);`
with
`const notificationVersion = useNotifications((s) => s.version);`
and in the effect's dependency list replace `lastNotificationId` with `notificationVersion`.

- [ ] **Step 4: Write the shared row**

Create `client/src/components/notifications/notification-row.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CalendarX,
  CheckCheck,
  CircleCheck,
  CirclePause,
  CircleX,
  ClipboardList,
  Clock,
  Info,
  ListPlus,
  MessageSquare,
  SquareCheck,
  UserX,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  actionLabel,
  groupHint,
  groupTitle,
  isPending,
  lessonLine,
  lessonParts,
  relativeTime,
  resolvedLine,
  type AppNotification,
  type NotificationGroup,
  type NotificationRow,
  type NotificationType,
} from "./notification-view";

const ICON: Record<NotificationType, LucideIcon> = {
  COMMENT: MessageSquare,
  TASK_ASSIGNED: ListPlus,
  TASK_STATUS_CHANGED: CheckCheck,
  TASK_DELETED: CircleX,
  TASK_UPDATED: MessageSquare,
  TASK_REMINDER: Clock,
  TASK_REVIEW: SquareCheck,
  TASK_OVERDUE: AlarmClock,
  SYSTEM: Info,
  LESSON_STARTED: BookOpen,
  ATTENDANCE_ADMIN_ALERT: Clock,
  ATTENDANCE_TEACHER_WARNING: Clock,
  ATTENDANCE_MISSING_TEACHER: Clock,
  ATTENDANCE_MISSING_ADMIN: Clock,
  ATTENDANCE_COMPLETED: ClipboardList,
  LESSON_RESCHEDULED: CalendarClock,
  LESSON_CANCELLED: CalendarX,
  PAYMENT_PROMISE_OVERDUE: Wallet,
  ABSENCE_WARNING: UserX,
  ENROLLMENT_AUTO_PAUSED: CirclePause,
};

/** One colour per kind (spec §8 «har turning rangi»); a closed alert turns green. */
const TONE: Record<NotificationGroup, string> = {
  task: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  attendance: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  payment: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  system: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const DONE_TONE = "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";

interface RowProps {
  row: NotificationRow;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
  /** The page folds a group until «Ko'rish»; the panel shows its sub-rows. */
  collapsible?: boolean;
}

export function NotificationRowView({ row, now, onOpen, hrefOf, collapsible = false }: RowProps) {
  if (row.kind === "single") {
    return <SingleRow n={row.item} now={now} onOpen={onOpen} hrefOf={hrefOf} />;
  }
  return <GroupRow row={row} now={now} onOpen={onOpen} hrefOf={hrefOf} collapsible={collapsible} />;
}

function KindIcon({ n, done }: { n: Pick<AppNotification, "type" | "group">; done: boolean }) {
  const Glyph = done ? CircleCheck : (ICON[n.type] ?? Info);
  return (
    <span
      className={cn(
        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
        done ? DONE_TONE : TONE[n.group],
      )}
    >
      <Glyph className="size-4" />
    </span>
  );
}

function SingleRow({
  n,
  now,
  onOpen,
  hrefOf,
}: {
  n: AppNotification;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
}) {
  const done = n.resolvedAt !== null;
  const href = hrefOf(n);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(n)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(n);
      }}
      className={cn(
        "flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50",
        !n.isRead && !done && "bg-blue-50/50 dark:bg-blue-950/20",
        done && "opacity-60",
      )}
    >
      <KindIcon n={n} done={done} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium leading-tight">{n.title}</p>
        <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
        <p className="text-xs text-muted-foreground">
          {n.resolvedAt ? resolvedLine(n.resolvedAt) : relativeTime(n.createdAt, now)}
        </p>
      </div>
      {isPending(n) && href ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(n);
          }}
        >
          {actionLabel(n.type)}
        </Button>
      ) : !n.isRead && !done ? (
        <span className="mt-2 size-2 shrink-0 rounded-full bg-blue-500" />
      ) : null}
    </div>
  );
}

function GroupRow({
  row,
  now,
  onOpen,
  hrefOf,
  collapsible,
}: {
  row: Extract<NotificationRow, { kind: "group" }>;
  now: Date;
  onOpen: (n: AppNotification) => void;
  hrefOf: (n: AppNotification) => string | null;
  collapsible: boolean;
}) {
  const [open, setOpen] = useState(!collapsible);
  const first = row.items[0];
  const done = row.items.every((n) => n.resolvedAt !== null);
  const names = row.items.map((n) => lessonParts(n.message).group ?? n.title).join(", ");
  return (
    <div className={cn("flex items-start gap-3 px-4 py-2.5", done && "opacity-60")}>
      <KindIcon n={first} done={done} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium leading-tight">{groupTitle(row)}</p>
        <p className="text-xs text-muted-foreground">
          {collapsible && !open && !done ? `${names} · ${relativeTime(first.createdAt, now)}` : groupHint(row)}
        </p>
        {open && (
          <div className="space-y-1 pt-1">
            {row.items.map((n) => {
              const href = hrefOf(n);
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-xs",
                    n.resolvedAt !== null && "text-muted-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {lessonLine(n)}
                    {n.resolvedAt !== null ? " · yopildi" : ""}
                  </span>
                  {isPending(n) && href ? (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onOpen(n)}>
                      Ochish
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {collapsible ? (
        <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Yopish" : "Ko'rish"}
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite the bell**

Replace `client/src/components/notifications/notification-bell.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { useSSE } from "@/hooks/use-sse";
import { cn } from "@/lib/utils";
import { notificationHref } from "./notification-href";
import { NotificationRowView } from "./notification-row";
import {
  GROUP_LABEL,
  groupByDay,
  groupNotifications,
  panelSections,
  type NotificationGroup,
  type NotificationRow,
} from "./notification-view";

/** The panel's chips (spec §8, mockup s19); «Tizim» lives on the page. */
const CHIPS: (NotificationGroup | null)[] = [null, "task", "attendance", "payment"];

export function NotificationBell() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const { badge, pending, recent, counts, chip, loading, fetchBadge, loadPanel, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  useSSE();

  useEffect(() => {
    void fetchBadge();
  }, [fetchBadge]);

  const hrefOf = (n: AppNotification) => notificationHref(n, user?.roles.map((r) => r.id) ?? []);
  const onOpenRow = (n: AppNotification) => {
    if (!n.isRead) void markRead(n.id);
    const url = hrefOf(n);
    if (url) {
      setOpen(false);
      router.push(url);
    }
  };

  const now = new Date();
  const { waiting, todayInfo } = panelSections(pending, recent, now);
  const rowsOf = (rows: NotificationRow[]) =>
    rows.map((row) => <NotificationRowView key={row.key} row={row} now={now} onOpen={onOpenRow} hrefOf={hrefOf} />);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadPanel(chip);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Bell className="size-4" />
              {badge > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Bildirishnomalar</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[400px] max-w-[calc(100vw-1rem)] p-0" align="end">
        <div className="space-y-2 border-b px-4 pb-2 pt-3">
          <div className="flex items-center">
            <h3 className="text-sm font-semibold">Bildirishnomalar</h3>
            <button
              type="button"
              className="ml-auto text-xs text-primary hover:underline"
              onClick={() => void markAllRead()}
            >
              {"Hammasini o'qilgan qilish"}
            </button>
          </div>
          <div className="flex gap-1">
            {(["pending", "all"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "pending" ? "Kutilmoqda" : "Hammasi"}
                {t === "pending" && counts ? (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-primary">{counts.pending}</span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {CHIPS.map((c) => (
              <button
                key={c ?? "hammasi"}
                type="button"
                onClick={() => void loadPanel(c)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  chip === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {c ? GROUP_LABEL[c] : "Hammasi"}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading && recent.length === 0 ? (
            <Empty text="Yuklanmoqda..." />
          ) : tab === "pending" ? (
            <>
              <Section title="Sizdan kutilmoqda" />
              {waiting.length > 0 ? rowsOf(waiting) : <Empty text="Sizdan hech narsa kutilmayapti" />}
              {todayInfo.length > 0 && (
                <>
                  <Section title="Ma'lumot uchun · bugun" />
                  {rowsOf(todayInfo)}
                </>
              )}
            </>
          ) : recent.length === 0 ? (
            <Empty text="Bildirishnomalar yo'q" />
          ) : (
            groupByDay(recent, now).map((day) => (
              <div key={day.label}>
                <Section title={day.label} />
                {rowsOf(groupNotifications(day.items))}
              </div>
            ))
          )}
        </div>

        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-2.5 text-center text-sm font-medium text-primary hover:bg-muted/50"
        >
          Barcha bildirishnomalar
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function Section({ title }: { title: string }) {
  return (
    <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-16 items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
```

- [ ] **Step 6: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run src/components/notifications src/lib/branch-scoped-header.test.ts src/lib/branch-scoped-stores.test.ts
```
Expected: no tsc errors (if `notification-href.test.ts` complains about a widened `type`, add `as const` to that literal), 0 lint errors, tests pass.

- [ ] **Step 7: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/hooks/use-notifications.ts client/src/hooks/use-sse.ts client/src/hooks/use-task-counts.ts client/src/components/notifications/notification-row.tsx client/src/components/notifications/notification-bell.tsx
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): new bell — what waits, folded alerts, live closing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: «Barcha bildirishnomalar» page (mockup s20)

**Files:**
- Create: `client/src/components/notifications/notifications-page-client.tsx`
- Create: `client/src/app/(dashboard)/notifications/page.tsx`
- Modify: `client/src/lib/breadcrumb-routes.ts` (`routeLabels`)

**Interfaces:**
- Consumes: `fetchNotificationPage`, `fetchNotificationCounts`, `useNotifications` (`version`, `markRead`, `markAllRead`) from Task 6; `NotificationRowView` (Task 6); `PAGE_VIEWS`, `VIEW_LABEL`, `groupByDay`, `groupNotifications`, `viewCount`, `viewParams` (Task 5); `useUrlFilters` (`@/hooks/use-url-filters`); `notificationHref`.
- Produces: route `/notifications`; URL params `?view=pending|all|task|attendance|payment|system` (default `pending`, omitted from the URL) and `?q=`.

- [ ] **Step 1: Write the page client**

Create `client/src/components/notifications/notifications-page-client.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  fetchNotificationCounts,
  fetchNotificationPage,
  useNotifications,
  type AppNotification,
} from "@/hooks/use-notifications";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/utils";
import { notificationHref } from "./notification-href";
import { NotificationRowView } from "./notification-row";
import { PAGE_VIEWS, VIEW_LABEL, groupByDay, groupNotifications, viewCount, viewParams } from "./notification-view";

const schema = {
  view: { type: "string" as const, defaultValue: "pending" },
  q: { type: "string" as const, defaultValue: "" },
};

export function NotificationsPageClient() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const markRead = useNotifications((s) => s.markRead);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const version = useNotifications((s) => s.version);
  const { filters, setFilter } = useUrlFilters(schema);
  const [searchInput, setSearchInput] = useState(filters.q);
  const params = viewParams(filters.view);

  const list = useInfiniteQuery({
    queryKey: ["notifications", "page", filters.view, filters.q],
    queryFn: ({ pageParam }) =>
      fetchNotificationPage({ ...params, q: filters.q, cursor: pageParam, pageSize: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const counts = useQuery({ queryKey: ["notifications", "counts"], queryFn: fetchNotificationCounts });

  const { refetch: refetchList } = list;
  const { refetch: refetchCounts } = counts;
  // A new, read or closed notification (SSE or this page) moves the store's version.
  useEffect(() => {
    if (version === 0) return;
    void refetchList();
    void refetchCounts();
  }, [version, refetchList, refetchCounts]);

  // The search box writes the URL a moment after typing stops.
  useEffect(() => {
    if (searchInput === filters.q) return;
    const timer = setTimeout(() => setFilter("q", searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput, filters.q, setFilter]);

  const hrefOf = (n: AppNotification) => notificationHref(n, user?.roles.map((r) => r.id) ?? []);
  const onOpen = (n: AppNotification) => {
    if (!n.isRead) void markRead(n.id);
    const url = hrefOf(n);
    if (url) router.push(url);
  };

  const now = new Date();
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Bildirishnomalar</h1>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Xabarlardan qidirish"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
          {"Hammasini o'qilgan qilish"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {PAGE_VIEWS.map((view) => {
            const count = viewCount(view, counts.data);
            return (
              <button
                key={view}
                type="button"
                onClick={() => setFilter("view", view)}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                  filters.view === view
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {VIEW_LABEL[view]}
                {count !== null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 rounded-lg border">
          {list.isPending ? (
            <Empty text="Yuklanmoqda..." />
          ) : items.length === 0 ? (
            <Empty text={params.filter === "pending" ? "Sizdan hech narsa kutilmayapti" : "Bildirishnomalar yo'q"} />
          ) : (
            groupByDay(items, now).map((day) => (
              <div key={day.label}>
                <p className="border-b bg-muted/30 px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                  {day.label}
                </p>
                <div className="divide-y">
                  {groupNotifications(day.items).map((row) => (
                    <NotificationRowView key={row.key} row={row} now={now} onOpen={onOpen} hrefOf={hrefOf} collapsible />
                  ))}
                </div>
              </div>
            ))
          )}
          {list.hasNextPage && (
            <div className="border-t p-3 text-center">
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage ? "Yuklanmoqda..." : "Yana yuklash"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-24 items-center justify-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `client/src/app/(dashboard)/notifications/page.tsx`:

```tsx
import { Suspense } from "react";
import { NotificationsPageClient } from "@/components/notifications/notifications-page-client";

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsPageClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: Breadcrumb label**

In `client/src/lib/breadcrumb-routes.ts`, inside `routeLabels`, after `tasks: "Topshiriqlar",` add `notifications: "Bildirishnomalar",`.

- [ ] **Step 4: Gate**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx vitest run src/components/notifications src/lib
```
Expected: no tsc errors, 0 lint errors, tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add client/src/components/notifications/notifications-page-client.tsx "client/src/app/(dashboard)/notifications/page.tsx" client/src/lib/breadcrumb-routes.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "feat(notifications): «Barcha bildirishnomalar» page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs, guide, full verification

**Files:**
- Modify: `server/CLAUDE.md` (section `### Notifications (4 channels)`, up to the line before `#### Telegram digest`)
- Modify: `client/CLAUDE.md` (section `### Notifications (Bildirishnomalar)`)
- Modify: `client/src/qollanma/kontent/boshlash/interfeys.mdx` (bullet `**Bildirishnomalar.**`)
- Modify: `client/src/qollanma/sahifalar/boshlash.ts` (entry `sahifa: "interfeys"`)
- Modify: `client/src/qollanma/kontent/davomat/eslatmalar.mdx` (table row «Dars boshlanish vaqtida», section «Xabar qanday yetadi»)
- Modify: `client/src/qollanma/sahifalar/davomat.ts` (entry `sahifa: "eslatmalar"`)
- Modify: `client/src/qollanma/yangiliklar.ts` (new first entry)

**Interfaces:**
- Consumes: the behaviour of Tasks 1–7. Date for the guide: run `TZ=Asia/Tashkent date +%F` and use its output wherever this task says `<BUGUN>`.

- [ ] **Step 1: server/CLAUDE.md**

Replace the section from `### Notifications (4 channels)` down to (not including) `#### Telegram digest — one message a day at 20:00 (ADR-0025)` with:

````md
### Notifications (4 channels)

- `NotificationsModule` (`src/notifications/`) — notification system. Spec of the bell: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §8 (the record of the decision; no ADR — the columns below are derived and can be recomputed).
- **Notification** table: per-user rows (`userId`, `type`, `title`, `message`, `isRead`) plus the bell's state: `actionRequired` (waits for the recipient), `resolvedAt` (the job got done), `groupKey` (rows the client folds into one line). **PushSubscription**: browser push subscriptions.
- **One writer.** Every row goes through `NotificationsService.create`, which stamps `actionRequired` and `groupKey` with `notificationKind` (`notification-kind.ts`, pure, tested) and returns the row with its `group`. The action types are spec §8's list (`ATTENDANCE_ADMIN_ALERT`, `ATTENDANCE_TEACHER_WARNING`, `ATTENDANCE_MISSING_TEACHER`, `ATTENDANCE_MISSING_ADMIN`, `LESSON_STARTED`, `TASK_ASSIGNED`, `TASK_REMINDER`, `TASK_REVIEW`, `PAYMENT_PROMISE_OVERDUE`); `task-notify-plan.ts` overrides it per notice (a watcher's `TASK_ASSIGNED` is information, «Topshiriq qaytarildi» waits). `groupKey = <TYPE>:<YYYY-MM-DD>` (Tashkent) for the five lesson alerts only — they are sent on the lesson's own day, so the key carries the lesson date. `NOTIFICATION_GROUP` is a `Record` over the enum: a new `NotificationType` does not compile until it is placed in `task` / `attendance` / `payment` / `system`.
- **The badge counts only what waits:** `actionRequired && resolvedAt == null && !isRead` (`GET /notifications/unread-count`). Reading clears a row from the badge; only the job done clears it from «Kutilmoqda» (`filter=pending` = `actionRequired && resolvedAt == null`, read or not).
- **Alerts close themselves.** `NotificationResolverService` (`notification-resolver.service.ts`) hears post-commit events, stamps `resolvedAt` on the matching OPEN action rows of every recipient (information rows are never touched) and sends `{ type: 'notification.resolved', ids, resolvedAt }` over SSE to each owner. A new action type needs its closing event here, or it waits until read.

| Event | Closes |
| --- | --- |
| `attendance.completed`, `attendance.student.recorded` (a QR-only register emits only this), `lesson-cancellation.created`, `lesson-reschedule.created` (its `originalDate`) | that group's lesson alerts of that day |
| `unmarked-lesson.held` / `unmarked-lesson.not-held` | the same, plus the notices of the closed «Dars bo'ldimi?» task |
| `task.status.changed`, `task.cancelled`, `task.reviewed` leaving the task DONE/CANCELLED | every action row of the task |
| `task.reviewed` (either answer) | the task's `TASK_REVIEW` rows |
| `task.unassigned` | the removed users' rows of that task |
| `payment.received` with `studentBalance >= 0` | the student's `PAYMENT_PROMISE_OVERDUE` (a BROKEN promise never turns KEPT; a cleared debt is the `settleKeptPromises` test) |

- `LESSON_STARTED` is not sent when the lesson already has a register (the lead opens it before the start).
- **Endpoints** (all SELF in the route manifest — keyed on the caller, no branch question):
  - `GET /api/notifications?filter=pending|all&type=task|attendance|payment|system&q=&cursor=&pageSize=` → `{ data, nextCursor }`, newest first, keyset cursor over `(createdAt, id)` (`tasks/task-cursor.ts`); every row carries `group`. `page` is accepted and ignored (the pre-phase-5 bell sent it).
  - `GET /api/notifications/unread-count` → `{ count }` — the badge rule above
  - `GET /api/notifications/counts` → `{ pending, all, groups }` — the page's left list
  - `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all`
  - `GET /api/notifications/stream` — SSE: `notification`, `notification.resolved`, `task.updated`
  - `POST /api/notifications/push/subscribe`, `DELETE /api/notifications/push/unsubscribe`, `POST|DELETE /api/notifications/devices`, `GET /api/notifications/vapid-public-key` (public)
- **4 delivery channels:** DB (every row), SSE (`notifications.gateway.ts`, userId → Response map, 30 s heartbeat), Web Push (`web-push`, VAPID), Telegram (see "Telegram digest" below; the bell's closing does not touch Telegram).
- **One-time cleanup** `scripts/notification-cleanup.ts` (dry run on a read-only connection by default, `--apply` writes in one transaction; steps in `scripts/lib/notification-cleanup.ts`): closes rows whose job was already done before phase 5 (closed tasks; lessons with a register, an answer, a cancellation or a move; overdue promises whose debt is cleared), stamped with when it was done, then marks unread rows older than 7 days read. Nothing is deleted. `railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/notification-cleanup.ts [--apply]`.
````

- [ ] **Step 2: client/CLAUDE.md**

Replace the section `### Notifications (Bildirishnomalar)` (its bullets, up to the line before `### Testing`) with:

```md
### Notifications (Bildirishnomalar)

Spec: `docs/superpowers/specs/2026-10-07-topshiriqlar-design.md` §8; mockups s19 (bell) and s20 (page).

- **NotificationBell** (`src/components/notifications/notification-bell.tsx`) — the badge counts only what waits for the viewer (the server's rule, `GET /notifications/unread-count`, never re-derived here). Panel: «Kutilmoqda N» (what waits, then today's information under «Ma'lumot uchun · bugun») and «Hammasi» (by day); chips «Hammasi · Topshiriqlar · Davomat · To'lovlar»; «Hammasini o'qilgan qilish»; footer «Barcha bildirishnomalar» → `/notifications`.
- **Page** `/notifications` (`notifications-page-client.tsx`) — left list Kutilmoqda / Hammasi / Topshiriqlar / Davomat / To'lovlar / Tizim with counts (`GET /notifications/counts`), days «Bugun» / «Kecha» / dates, «Xabarlardan qidirish», «Yana yuklash» (cursor). `?view=` and `?q=` live in the URL.
- **Rows** (`notification-row.tsx`) — icon per type, colour per group (the server sends `group` on every row; the client never maps type → group), relative time on the Tashkent clock, an «Ochish» / «Ko'rish» button only on a waiting row, closed rows greyed with «Eslatma o'zi yopildi · HH:mm». Rows sharing a `groupKey` fold into one («Davomat olinmagan · 3 guruh») with a sub-row per group, read from the message's «Guruh: / Vaqt: / O'qituvchi:» lines.
- **Pure helpers** (`notification-view.ts`, vitest) — folding, days, relative time, page views. `NOTIFICATION_TYPES` mirrors the server enum; the test reads `server/prisma/schema.prisma`.
- **Store** (`src/hooks/use-notifications.ts`) — badge, the panel's lists, counts and a `version` that bumps on every SSE message or read; the page and the sidebar task counter refetch when it moves.
- **SSE hook** (`src/hooks/use-sse.ts`) — fetch-based SSE (JWT header), auto-reconnect; handles `notification`, `notification.resolved` and `task.updated`.
- **Push hook** (`src/hooks/use-push-notifications.ts`) and **Service Worker** (`public/sw.js`) — unchanged.
- Notification click → marks it read and opens `notificationHref` (`notification-href.ts`, unit-tested): Student → profile, Group → group page, Lead → `/leads?lead=<id>`, Task → `/tasks?task=<id>`, AbsencePauseSetting → its settings page, User → `/profile/salary` for the SYSTEM salary carry-over but employee settings (CEO/BD only) for a task. Add a mapping there when the server starts sending a new `relatedEntityType`.
```

- [ ] **Step 3: Guide — «Ekran tuzilishi»**

In `client/src/qollanma/kontent/boshlash/interfeys.mdx`, replace the line starting with `- **Bildirishnomalar.**` with:

```md
- **Bildirishnomalar.** Qo'ng'iroq belgisi yonidagi raqam — sizdan ish kutayotgan, hali ochilmagan xabarlar: davomat eslatmasi, sizga berilgan yoki tekshiruvga kelgan topshiriq, buzilgan to'lov va'dasi. Ish bajarilganda (davomat olindi, dars bekor qilindi yoki ko'chirildi, topshiriq yopildi, qarz to'landi) xabar o'zi yopiladi: kulrang bo'ladi va «Eslatma o'zi yopildi» deb yoziladi. Panelda «Kutilmoqda» bo'limi sizdan kutilayotganlarni, ostida bugungi ma'lumot xabarlarini ko'rsatadi; «Hammasi» — barcha xabarlar kunlar bo'yicha. «Topshiriqlar», «Davomat», «To'lovlar» tugmalari xabarlarni turi bo'yicha saralaydi. Bir kundagi bir xil davomat eslatmalari bitta qatorga yig'iladi («Davomat olinmagan · 3 guruh»), ichida har guruh o'z «Ochish» tugmasi bilan. Xabarni bossangiz, u o'qilgan bo'ladi va tegishli sahifa ochiladi; sahifani ocha olmaydigan xodimga sahifa ochilmaydi. «Hammasini o'qilgan qilish» hammasini birdan belgilaydi. Pastdagi «Barcha bildirishnomalar» sahifasida hamma xabar kunlar bo'yicha turadi: chapda turlar va ularning soni, tepada «Xabarlardan qidirish».
```

In `client/src/qollanma/sahifalar/boshlash.ts`, in the entry with `sahifa: "interfeys"`: set `yollar: ["/", "/notifications"],`, set `kalitSozlar: ["menyu", "filial", "qidiruv", "bildirishnoma", "bildirishnomalar", "qo'ng'iroqcha", "kutilmoqda", "o'qilgan", "mavzu", "profil", "chiqish"],` and `yangilangan: "<BUGUN>",`.

- [ ] **Step 4: Guide — «Eslatmalar»**

In `client/src/qollanma/kontent/davomat/eslatmalar.mdx`:

Replace the table row that starts with `| Dars boshlanish vaqtida |` with:

```md
| Dars boshlanish vaqtida | Ha | Guruhning o'qituvchilariga | «Dars boshlandi»: darsingiz boshlandi, davomatni belgilashni unutmang. Davomat dars boshlanishidan oldin olingan bo'lsa, bu xabar yuborilmaydi. |
```

In the section `## Xabar qanday yetadi`, after the line `- Tizim ichida: yuqori paneldagi qo'ng'iroq belgisida, «Bildirishnomalar» ro'yxatida.` add:

```md
- Qo'ng'iroq belgisidagi eslatma ish bajarilganda o'zi yopiladi: davomat saqlansa (QR bilan ham), dars bekor qilinsa yoki ko'chirilsa, yoki «Dars bo'ldimi?» savoliga javob berilsa. Yopilgan eslatma kulrang bo'ladi va qo'ng'iroq belgisidagi raqamdan tushadi. Bir kundagi bir xil eslatmalar bitta qatorga yig'iladi, masalan «Davomat olinmagan · 3 guruh».
```

In `client/src/qollanma/sahifalar/davomat.ts`, in the entry with `sahifa: "eslatmalar"`, set `yangilangan: "<BUGUN>",`.

- [ ] **Step 5: News entry**

In `client/src/qollanma/yangiliklar.ts`, insert as the FIRST element of `yangiliklar`:

```ts
  {
    sana: "<BUGUN>",
    sarlavha: "Qo'ng'iroqcha qayta qurildi",
    matn: "Qo'ng'iroq belgisidagi raqam endi faqat sizdan ish kutayotgan xabarlarni sanaydi: davomat eslatmasi, sizga berilgan yoki tekshiruvga kelgan topshiriq, buzilgan to'lov va'dasi. Ish bajarilishi bilan xabar o'zi yopiladi: davomat olinsa, dars bekor qilinsa yoki ko'chirilsa — davomat eslatmalari, topshiriq yopilsa — uning xabarlari, qarz to'lansa — va'da xabari. Panelda «Kutilmoqda» va «Hammasi» bo'limlari va «Topshiriqlar», «Davomat», «To'lovlar» bo'yicha saralash bor; bir kundagi bir xil davomat eslatmalari bitta qatorga yig'iladi («Davomat olinmagan · 3 guruh»). Yangi «Barcha bildirishnomalar» sahifasida hamma xabar kunlar bo'yicha turadi va ulardan qidirsa bo'ladi. Yangi tizim yoqilgan kuni 7 kundan eski o'qilmagan xabarlar bir marta «o'qilgan» deb belgilandi, xabarlarning o'zi o'chirilmadi. Davomat dars boshlanishidan oldin olingan bo'lsa, o'qituvchiga «Dars boshlandi» eslatmasi endi bormaydi.",
    rollar: [1, 2, 3, 4, 5],
    sahifa: { bolim: "boshlash", sahifa: "interfeys" },
  },
```

- [ ] **Step 6: Full server verification** (run one after another, never in parallel)

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/server
npx eslint src --quiet
npm run typecheck
npm test
npm run build
```
Expected: 0 lint errors; typecheck clean; every suite passes; build succeeds.

- [ ] **Step 7: Full client verification**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run
npx next build
```
Expected: no tsc errors; 0 lint errors; all vitest suites pass (including `src/qollanma/*.test.ts` — `reyestr.test.ts` checks that `/notifications` is a real route); build lists `/notifications`.

Browser check (not an implementer gate): the dev DB lacks the new columns, so a live check needs a database with the migration — the throwaway local DB recipe, or production with the CEO after the deploy. Check as CEO, Branch Director, Administrator and Teacher: badge, «Kutilmoqda» vs «Hammasi», chips, a folded attendance line, live closing after saving attendance in another tab, the page's left list, day headers, search and «Yana yuklash», 375 px width.

- [ ] **Step 8: Commit**

```bash
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup add server/CLAUDE.md client/CLAUDE.md client/src/qollanma/kontent/boshlash/interfeys.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/kontent/davomat/eslatmalar.mdx client/src/qollanma/sahifalar/davomat.ts client/src/qollanma/yangiliklar.ts
git -C /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/topshiriqlar-clickup commit -m "docs(notifications): bell rules, guide pages and news entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: PR body deploy note** (for whoever opens the PR)

```md
## Deploy order
1. Server (Railway `caring-courage`, production) — applies `20261010120000_notification_action_state` (3 columns, 2 indexes, backfill by type). The old bell keeps working: `GET /notifications` still accepts `page`/`pageSize` and returns `data`.
2. Cleanup, right after: `railway run --service caring-courage --environment production npx ts-node --transpile-only scripts/notification-cleanup.ts` (dry run — read the counts and the ten largest badges), then the same with `--apply`. Until it runs, old unread attendance alerts count in the badge.
3. Vercel — the new bell and `/notifications` read the new fields, so the server goes first.
```
