# Unmarked Lessons («Dars bo'ldimi?») Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When nobody takes a lesson's attendance before it ends, the system asks the branch administrators «Dars bo'ldimi?» (a system task + a prompt on the schedule). «Bo'ldi» enters the register late and the teacher earns nothing for that lesson; «Bo'lmadi» cancels (money back) or moves the lesson, and the Telegram group is told at once. New attendance can no longer be entered after a lesson ends, by anyone.

**Architecture:** One table, `UnmarkedLesson`, records "nobody marked this lesson by its end" and the answer. Two locks keep the teacher unpaid for such a lesson: `SalaryAccrualService.createAccrual` (every accrual write) and a required input of `sweepGapLessons` (every payroll forecast and centre top-up). Everything that answers the question — the new late-register and not-held endpoints, and the existing cancellation and reschedule services — goes through small transaction helpers in `server/src/unmarked-lessons/`, so the task closes and the Telegram group hears about it whichever screen was used. The attendance reminder cron opens the rows; a 23:00 run catches what the half-hourly ticks missed.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL), Jest; Next.js 16, React Query, zustand, Vitest; Telegraf (admin bot).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md` (CEO decisions Q1–Q11, 29.09.2026). Where this plan and the spec disagree, Task 30 updates the spec; the two deliberate differences are listed there.
- **New attendance window (Q4, Q8):** a register with no rows yet is accepted only on the lesson's own Tashkent day, from `start − 10 min` until `end` (the end minute itself is closed), for every role including the CEO. Editing a register that already has rows stays open to CEO / Branch Director / Administrator at any time; a Teacher can never edit.
- **Teacher pay (Q2):** a lesson with an `UnmarkedLesson` row and `teacherPayExempt = false` never gets a `SalaryAccrual` — live, deferred, or centre top-up — whatever its status or later edits. Only the CEO may set `teacherPayExempt` (Q9), checked from the database (ADR-0028). Rows opened by the backfill for pre-rule days are exempt (Q11).
- **Answers (Q3, Q10):** «Bo'lmadi» offers cancel (money back, ADR-0053) or move to a future date (no refund; the make-up lesson must start after now). The Telegram group gets an instant message for either (ADR-0025 instant list, recorded in ADR-0054).
- **Tasks (Q7):** assigned to all active branch Administrators (fallback: branch directors, then CEOs); the first administrator to change its status or answer takes it and the others lose it; `DONE` only through an answer; system tasks cannot be edited or deleted; author = none («Tizim»); no generic `task.assigned` notification.
- **Nothing is guessed (Q5):** unanswered rows stay open; a reminder the next working day at 09:00 (task due 10:00); the 21:00 report shows how many are older than a day.
- User-facing text: Latin Uzbek, no English words. Code, comments, commits, PR: English. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. The repo is public: no production data in commits.
- Server: run `npx prettier --write` on every touched `.ts`; `npx eslint <files> --quiet` must be clean. Client: **never** run prettier.
- Work only in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat`, branch `feat/davomat-olinmagan-dars`. No push, no deploy inside this plan.

## File Map

| File | Change |
|---|---|
| `server/prisma/schema.prisma`, `server/prisma/migrations/20260930090000_unmarked_lessons/migration.sql` | `UnmarkedLesson` + enum, `Comment.authorId` nullable, digest category `LESSON_PAY_FORFEITED` |
| `server/src/attendance/shared/attendance-window.ts` (+spec) | NEW pure time rules: window, lesson ended, Tashkent clock, refusal texts |
| `server/src/attendance/shared/ended-lessons.ts` (+spec) | NEW pure: which of today's lessons have ended |
| `server/src/attendance/shared/roster-on-date.ts` (+spec) | NEW: who was in the group on a past lesson day |
| `server/src/unmarked-lessons/forfeited-lessons.ts` (+spec) | NEW: `lessonKey`, `isLessonPayForfeited`, `loadForfeitedLessonKeys` |
| `server/src/unmarked-lessons/lesson-task.ts` (+spec) | NEW: system task create / close / claim, due date |
| `server/src/unmarked-lessons/unmarked-lesson-events.ts` | NEW: event names + payloads |
| `server/src/unmarked-lessons/unmarked-lesson-transitions.ts` (+spec) | NEW: cancel / reschedule / undo / group-delete hooks |
| `server/src/unmarked-lessons/answer-rules.ts` (+spec) | NEW: find the pending row, claim rule for answering |
| `server/src/unmarked-lessons/unmarked-lesson-info.ts` (+spec) | NEW: `{ id, status, claimedBy }` per lesson for the schedule and calendar |
| `server/src/salary/salary-accrual.service.ts` (+spec) | write lock |
| `server/src/salary/shared/gap-sweep.ts` (+spec), `salary-calculation.service.ts`, `salary-monthly.service.ts`, `salary-center-topup.service.ts` (+specs) | read lock |
| `server/src/lesson-cancellations/lesson-cancellations.service.ts` (+spec) | answer hook, undo hook, group notice event |
| `server/src/lesson-reschedules/lesson-reschedules.service.ts` (+spec) | answer hook, future check, undo hook, group notice event |
| `server/src/groups/groups-write.service.ts` (+spec) | close tasks of a deleted group |
| `server/src/attendance/attendance-validation.service.ts` (+spec) | return effective times; teacher end minute closed |
| `server/src/attendance/attendance-save.service.ts`, `dto/late-attendance.dto.ts` (+specs) | window for new registers; `saveLate` |
| `server/src/attendance/qr-attendance-session.service.ts` (+spec) | window |
| `server/src/attendance/unmarked-lessons.service.ts`, `dto/not-held.dto.ts` (+spec) | NEW: open rows at lesson end; answer «Bo'lmadi» |
| `server/src/attendance/attendance.controller.ts` (+ NEW spec), `attendance.service.ts`, `attendance-read.service.ts`, `attendance.module.ts` | routes, late roster, calendar info, wiring |
| `server/src/common/auth/branch-route-policy.ts` | two routes |
| `server/src/attendance/attendance-reminder.service.ts` (+spec) | sweep, 23:00 run, new texts |
| `server/src/attendance/unmarked-lesson-events.listener.ts` (+spec) | NEW: tell the teacher the lesson earned nothing |
| `server/src/telegram-digest/telegram-digest-payloads.ts`, `telegram-digest-render.service.ts` (+spec) | `LESSON_PAY_FORFEITED` |
| `server/src/comments/comments.service.ts` (+spec), `server/src/notifications/notification-events.listener.ts` | system tasks, claim, author-less tasks |
| `server/src/dashboard/dashboard.service.ts` (+spec) | `unmarked` per lesson |
| `server/src/telegram-groups/utils/unmarked-lesson-text.ts` (+spec), `telegram-group-unmarked-lesson.listener.ts` (+spec), `telegram-groups.module.ts` | instant group notice |
| `server/src/telegram-groups/telegram-group-daily-report.service.ts` (+spec) | 21:00 «Diqqat» line |
| `server/scripts/open-unmarked-lessons.ts` | backfill (dry run / `--apply`) |
| `docs/adr/0054-davomat-olinmagan-dars-ustoz-haqisiz.md`, `docs/adr/README.md`, `server/CLAUDE.md`, spec | decision record + docs |
| `client/src/lib/attendance-window.ts`, `client/src/lib/unmarked-lesson.ts` (+tests) | NEW pure helpers |
| `client/src/components/attendance/unmarked/*.tsx` | NEW prompt, late register dialog, not-held dialog |
| `client/src/components/dashboard/schedule-client.tsx`, `dashboard-daily-schedule.tsx`, `dashboard-room-occupancy.tsx` | schedule prompt |
| `client/src/components/groups/attendance/attendance-form.tsx`, `attendance-cycle-dashboard.tsx`, `attendance-missed-lessons.tsx`, `attendance-cycle-utils.ts`, `attendance-month-calendar.tsx` | lock + prompt on the group page |
| `client/src/hooks/use-tasks-board.ts`, `client/src/components/tasks/task-card.tsx`, `client/src/components/shared/comment-item.tsx`, `comment-list-helpers.tsx` | system tasks |
| `client/CLAUDE.md` | docs |

---

### Task 1: Schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `TelegramDigestCategory` ~1724, `model Group` ~1214, `model Comment` ~1823, after `model LessonReschedule` ~2399)
- Create: `server/prisma/migrations/20260930090000_unmarked_lessons/migration.sql`

**Interfaces:**
- Produces: Prisma model `UnmarkedLesson` (fields below), enum `UnmarkedLessonStatus { PENDING HELD NOT_HELD RESCHEDULED }`, compound unique `groupId_date`, relations `Group.unmarkedLessons`, `Comment.unmarkedLesson`, `UnmarkedLesson.taskComment`; `Comment.authorId: number | null`; `TelegramDigestCategory.LESSON_PAY_FORFEITED`.

- [ ] **Step 1: Give the worktree the dev database**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat/server
ln -s /Users/a1111/Desktop/daf-erp-system/server/.env .env
ls node_modules/.bin/prisma || npm ci
```

- [ ] **Step 2: Edit the schema**

In `enum TelegramDigestCategory`, add after `PAYMENT_REMINDER`:

```prisma
  LESSON_PAY_FORFEITED
```

In `model Group`, add after `monthlyCharges         EnrollmentMonthlyCharge[]`:

```prisma
  unmarkedLessons        UnmarkedLesson[]          @relation("UnmarkedLessonGroup")
```

In `model Comment`, replace the two author lines and add the back-relation:

```prisma
  /// NULL = a task the system gave (ADR-0054); the UI shows «Tizim».
  authorId   Int?
  author     User?         @relation("CommentAuthor", fields: [authorId], references: [id])
```

```prisma
  assignees     CommentAssignee[]
  notifications Notification[]
  /// The unmarked lesson this system task asks about (ADR-0054).
  unmarkedLesson UnmarkedLesson? @relation("UnmarkedLessonTask")
```

After `model LessonReschedule { … }`, add:

```prisma
enum UnmarkedLessonStatus {
  PENDING
  HELD
  NOT_HELD
  RESCHEDULED
}

/// A lesson nobody marked before it ended (spec 2026-09-29, ADR-0054). Opened
/// by the attendance reminder cron, answered by an administrator: HELD (the
/// register was entered late), NOT_HELD (cancelled) or RESCHEDULED (moved).
/// While a row exists and `teacherPayExempt` is false, the lesson never earns
/// the teacher a SalaryAccrual — see `unmarked-lessons/forfeited-lessons.ts`.
model UnmarkedLesson {
  id               String               @id @default(uuid())
  companyId        Int
  branchId         Int
  groupId          String
  group            Group                @relation("UnmarkedLessonGroup", fields: [groupId], references: [id])
  date             DateTime             @db.Date
  lessonStartTime  String
  lessonEndTime    String
  status           UnmarkedLessonStatus @default(PENDING)
  /// CEO only (Q9): the teacher could not mark it — the lesson pays as usual.
  teacherPayExempt Boolean              @default(false)
  exemptReason     String?
  /// The administrator who took the system task (first to act on it).
  claimedById      Int?
  decidedById      Int?
  decidedAt        DateTime?
  cancellationId   String?
  rescheduleId     String?
  taskCommentId    String?              @unique
  taskComment      Comment?             @relation("UnmarkedLessonTask", fields: [taskCommentId], references: [id], onDelete: SetNull)
  createdAt        DateTime             @default(now())
  updatedAt        DateTime             @updatedAt

  @@unique([groupId, date])
  @@index([companyId, status])
  @@index([branchId, status])
}
```

- [ ] **Step 3: Write the migration**

`server/prisma/migrations/20260930090000_unmarked_lessons/migration.sql`:

```sql
-- Lessons nobody marked before they ended (spec 2026-09-29, ADR-0054).

CREATE TYPE "UnmarkedLessonStatus" AS ENUM ('PENDING', 'HELD', 'NOT_HELD', 'RESCHEDULED');

-- The teacher's "this lesson earned nothing" line in the 20:00 digest.
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'LESSON_PAY_FORFEITED';

-- A system task has no author; the UI shows «Tizim».
ALTER TABLE "Comment" ALTER COLUMN "authorId" DROP NOT NULL;

CREATE TABLE "UnmarkedLesson" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "lessonStartTime" TEXT NOT NULL,
    "lessonEndTime" TEXT NOT NULL,
    "status" "UnmarkedLessonStatus" NOT NULL DEFAULT 'PENDING',
    "teacherPayExempt" BOOLEAN NOT NULL DEFAULT false,
    "exemptReason" TEXT,
    "claimedById" INTEGER,
    "decidedById" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "cancellationId" TEXT,
    "rescheduleId" TEXT,
    "taskCommentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmarkedLesson_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UnmarkedLesson_taskCommentId_key" ON "UnmarkedLesson"("taskCommentId");
CREATE UNIQUE INDEX "UnmarkedLesson_groupId_date_key" ON "UnmarkedLesson"("groupId", "date");
CREATE INDEX "UnmarkedLesson_companyId_status_idx" ON "UnmarkedLesson"("companyId", "status");
CREATE INDEX "UnmarkedLesson_branchId_status_idx" ON "UnmarkedLesson"("branchId", "status");

ALTER TABLE "UnmarkedLesson" ADD CONSTRAINT "UnmarkedLesson_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UnmarkedLesson" ADD CONSTRAINT "UnmarkedLesson_taskCommentId_fkey" FOREIGN KEY ("taskCommentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply to the dev database and generate the client**

```bash
cd server
npx prisma validate
npx prisma db execute --file prisma/migrations/20260930090000_unmarked_lessons/migration.sql
npx prisma migrate resolve --applied 20260930090000_unmarked_lessons
npx prisma generate
```

Expected: `validate` prints "The schema … is valid"; the other three succeed.

- [ ] **Step 5: Check the migration matches the schema**

```bash
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | grep -n "UnmarkedLesson\|Comment\" ALTER\|LESSON_PAY_FORFEITED" || echo "no drift for this change"
```

Expected: `no drift for this change` (other pre-existing drift may be printed by the full command — ignore it; see the Prisma migration memory).

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: exit 0. If a file fails because `comment.authorId` is now `number | null`, fix it in that file only where it is passed to a `number` parameter by returning early when it is `null` (the task-status listener is handled in Task 20; if `typecheck` flags it now, add `if (!comment.authorId) return;` at the top of `handleTaskStatusChanged`).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260930090000_unmarked_lessons/migration.sql
git commit -m "feat(schema): unmarked lessons and author-less system tasks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Attendance window (pure)

**Files:**
- Create: `server/src/attendance/shared/attendance-window.ts`
- Test: `server/src/attendance/shared/attendance-window.spec.ts`

**Interfaces:**
- Produces: `type AttendanceWindow = 'OPEN' | 'BEFORE' | 'ENDED' | 'NOT_TODAY'`; `OPENS_MINUTES_BEFORE = 10`; `DAY_START_TIME = '08:00'`; `DAY_END_TIME = '23:00'`; `toMinutes(hhmm: string): number`; `tashkentClock(now?: Date): { todayStr: string; nowMinutes: number }`; `newAttendanceWindow(args: { date: string; todayStr: string; nowMinutes: number; startTime: string | null; endTime: string | null }): AttendanceWindow`; `lessonHasEnded(args: { date: string; todayStr: string; nowMinutes: number; endTime: string | null }): boolean`; `ENDED_REFUSAL: string`; `windowRefusal(window: AttendanceWindow, args: { date: string; todayStr: string; startTime: string | null }): string | null`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  ENDED_REFUSAL,
  lessonHasEnded,
  newAttendanceWindow,
  tashkentClock,
  windowRefusal,
} from './attendance-window';

const lesson = {
  date: '2026-10-01',
  todayStr: '2026-10-01',
  startTime: '17:30',
  endTime: '19:00',
};
const at = (h: number, m: number) => h * 60 + m;

describe('newAttendanceWindow', () => {
  it('opens ten minutes before the start', () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(17, 19) })).toBe('BEFORE');
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(17, 20) })).toBe('OPEN');
  });

  it('closes at the end minute itself', () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(18, 59) })).toBe('OPEN');
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(19, 0) })).toBe('ENDED');
  });

  it('is closed on every other day', () => {
    expect(
      newAttendanceWindow({ ...lesson, date: '2026-09-30', nowMinutes: at(12, 0) }),
    ).toBe('NOT_TODAY');
    expect(
      newAttendanceWindow({ ...lesson, date: '2026-10-02', nowMinutes: at(12, 0) }),
    ).toBe('NOT_TODAY');
  });

  it('uses the end of the working day for a group without times', () => {
    const noTimes = { ...lesson, startTime: null, endTime: null };
    expect(newAttendanceWindow({ ...noTimes, nowMinutes: at(7, 0) })).toBe('OPEN');
    expect(newAttendanceWindow({ ...noTimes, nowMinutes: at(23, 0) })).toBe('ENDED');
  });
});

describe('lessonHasEnded', () => {
  it('is true for any earlier day and false for any later one', () => {
    expect(lessonHasEnded({ ...lesson, date: '2026-09-30', nowMinutes: 0 })).toBe(true);
    expect(lessonHasEnded({ ...lesson, date: '2026-10-02', nowMinutes: at(23, 59) })).toBe(false);
  });

  it('is true today from the end minute on', () => {
    expect(lessonHasEnded({ ...lesson, nowMinutes: at(18, 59) })).toBe(false);
    expect(lessonHasEnded({ ...lesson, nowMinutes: at(19, 0) })).toBe(true);
  });
});

describe('tashkentClock', () => {
  it('reads the Tashkent day and minute of an instant', () => {
    expect(tashkentClock(new Date('2026-09-30T19:30:00.000Z'))).toEqual({
      todayStr: '2026-10-01',
      nowMinutes: 30,
    });
  });
});

describe('windowRefusal', () => {
  const args = { date: '2026-10-01', todayStr: '2026-10-01', startTime: '17:30' };

  it('says nothing while open', () => {
    expect(windowRefusal('OPEN', args)).toBeNull();
  });

  it('names the opening time before the lesson', () => {
    expect(windowRefusal('BEFORE', args)).toBe(
      'Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (17:30)',
    );
  });

  it('sends a past lesson to the «Dars bo\'ldimi?» question', () => {
    expect(windowRefusal('ENDED', args)).toBe(ENDED_REFUSAL);
    expect(windowRefusal('NOT_TODAY', { ...args, date: '2026-09-30' })).toBe(ENDED_REFUSAL);
  });

  it('sends a future lesson to pre-marking', () => {
    expect(windowRefusal('NOT_TODAY', { ...args, date: '2026-10-02' })).toBe(
      "Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang",
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/attendance/shared/attendance-window.spec.ts`
Expected: FAIL — `Cannot find module './attendance-window'`.

- [ ] **Step 3: Implement**

```ts
import { TASHKENT_OFFSET_MS } from '../../common/date/tashkent';

/**
 * When a NEW register (no attendance rows yet) may be saved — spec
 * 2026-09-29 §3.1, ADR-0054: only on the lesson's own Tashkent day, from ten
 * minutes before it starts until it ends, for every role, the CEO included.
 * After the end the only way in is the late register, which leaves the
 * teacher unpaid for the lesson. Editing a register that already exists is
 * not governed by this.
 */
export type AttendanceWindow = 'OPEN' | 'BEFORE' | 'ENDED' | 'NOT_TODAY';

export const OPENS_MINUTES_BEFORE = 10;
/** A group without lesson times is treated as meeting 08:00–23:00. */
export const DAY_START_TIME = '08:00';
export const DAY_END_TIME = '23:00';

export const ENDED_REFUSAL =
  "Dars tugagan — davomat olish yopilgan. Dars bo'lgan-bo'lmaganini «Jadval» yoki «Topshiriqlar»da belgilang";

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** The Tashkent calendar day and minute-of-day of an instant. */
export function tashkentClock(now: Date = new Date()): {
  todayStr: string;
  nowMinutes: number;
} {
  const shifted = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return {
    todayStr: shifted.toISOString().slice(0, 10),
    nowMinutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export function newAttendanceWindow(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  startTime: string | null;
  endTime: string | null;
}): AttendanceWindow {
  if (args.date !== args.todayStr) return 'NOT_TODAY';
  if (args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME)) return 'ENDED';
  if (
    args.startTime &&
    args.nowMinutes < toMinutes(args.startTime) - OPENS_MINUTES_BEFORE
  ) {
    return 'BEFORE';
  }
  return 'OPEN';
}

export function lessonHasEnded(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  endTime: string | null;
}): boolean {
  if (args.date !== args.todayStr) return args.date < args.todayStr;
  return args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME);
}

/** The Uzbek refusal for a closed window; `null` while it is open. */
export function windowRefusal(
  window: AttendanceWindow,
  args: { date: string; todayStr: string; startTime: string | null },
): string | null {
  switch (window) {
    case 'OPEN':
      return null;
    case 'BEFORE':
      return `Davomat dars boshlanishidan ${OPENS_MINUTES_BEFORE} daqiqa oldin ochiladi (${args.startTime})`;
    case 'NOT_TODAY':
      return args.date > args.todayStr
        ? "Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang"
        : ENDED_REFUSAL;
    case 'ENDED':
      return ENDED_REFUSAL;
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/attendance/shared/attendance-window.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/attendance/shared/attendance-window.ts src/attendance/shared/attendance-window.spec.ts
npx eslint src/attendance/shared/attendance-window.ts src/attendance/shared/attendance-window.spec.ts --quiet
git add src/attendance/shared/attendance-window.ts src/attendance/shared/attendance-window.spec.ts
git commit -m "feat(attendance): one rule for when a new register may be saved

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Which of today's lessons have ended (pure)

**Files:**
- Create: `server/src/attendance/shared/ended-lessons.ts`
- Test: `server/src/attendance/shared/ended-lessons.spec.ts`

**Interfaces:**
- Consumes: `toMinutes`, `DAY_START_TIME`, `DAY_END_TIME` (Task 2).
- Produces: `interface SweepGroup { id: string; name: string; companyId: number; branchId: number; exactDays: string[]; lessonStartTime: string | null; lessonEndTime: string | null; startDate: Date | null; endDate: Date | null }`; `interface SweepReschedule { groupId: string; originalDate: Date; newDate: Date; newLessonStartTime: string | null; newLessonEndTime: string | null }`; `interface EndedLesson { groupId: string; groupName: string; companyId: number; branchId: number; startTime: string; endTime: string }`; `endedLessonsOn(args: { todayStr: string; nowMinutes: number; groups: SweepGroup[]; reschedules: SweepReschedule[]; cancelledGroupIds: ReadonlySet<string>; isHoliday: (branchId: number) => boolean }): EndedLesson[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { endedLessonsOn, type SweepGroup } from './ended-lessons';

const group = (over: Partial<SweepGroup> = {}): SweepGroup => ({
  id: 'g1',
  name: '#014',
  companyId: 1,
  branchId: 2,
  exactDays: ['monday', 'wednesday', 'friday'],
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  startDate: null,
  endDate: null,
  ...over,
});
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
// 2026-09-30 is a Wednesday.
const base = {
  todayStr: '2026-09-30',
  nowMinutes: 18 * 60,
  reschedules: [],
  cancelledGroupIds: new Set<string>(),
  isHoliday: () => false,
};

describe('endedLessonsOn', () => {
  it('returns a scheduled lesson once it has ended', () => {
    expect(endedLessonsOn({ ...base, groups: [group()] })).toEqual([
      {
        groupId: 'g1',
        groupName: '#014',
        companyId: 1,
        branchId: 2,
        startTime: '16:00',
        endTime: '17:30',
      },
    ]);
  });

  it('waits for the end minute', () => {
    expect(
      endedLessonsOn({ ...base, nowMinutes: 17 * 60 + 29, groups: [group()] }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, nowMinutes: 17 * 60 + 30, groups: [group()] }),
    ).toHaveLength(1);
  });

  it('skips a weekday the group does not meet', () => {
    expect(
      endedLessonsOn({ ...base, groups: [group({ exactDays: ['tuesday'] })] }),
    ).toEqual([]);
  });

  it('skips a cancelled lesson and a branch holiday', () => {
    expect(
      endedLessonsOn({
        ...base,
        groups: [group()],
        cancelledGroupIds: new Set(['g1']),
      }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, groups: [group()], isHoliday: (b) => b === 2 }),
    ).toEqual([]);
  });

  it('skips a lesson moved away and times a lesson moved here by the move', () => {
    const away = {
      groupId: 'g1',
      originalDate: day('2026-09-30'),
      newDate: day('2026-10-02'),
      newLessonStartTime: null,
      newLessonEndTime: null,
    };
    expect(
      endedLessonsOn({ ...base, groups: [group()], reschedules: [away] }),
    ).toEqual([]);

    const here = {
      groupId: 'g1',
      originalDate: day('2026-09-29'),
      newDate: day('2026-09-30'),
      newLessonStartTime: '10:00',
      newLessonEndTime: '11:30',
    };
    expect(
      endedLessonsOn({
        ...base,
        nowMinutes: 12 * 60,
        groups: [group({ exactDays: ['tuesday'] })],
        reschedules: [here],
      }),
    ).toEqual([
      expect.objectContaining({ startTime: '10:00', endTime: '11:30' }),
    ]);
  });

  it('respects the group date range (stored as Tashkent midnight)', () => {
    // 2026-10-01 00:00 Tashkent = 2026-09-30T19:00Z
    expect(
      endedLessonsOn({
        ...base,
        groups: [group({ startDate: new Date('2026-09-30T19:00:00.000Z') })],
      }),
    ).toEqual([]);
    expect(
      endedLessonsOn({
        ...base,
        groups: [group({ endDate: new Date('2026-09-28T19:00:00.000Z') })],
      }),
    ).toEqual([]);
  });

  it('closes a group without times at the end of the working day', () => {
    const noTimes = group({ lessonStartTime: null, lessonEndTime: null });
    expect(
      endedLessonsOn({ ...base, nowMinutes: 22 * 60, groups: [noTimes] }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, nowMinutes: 23 * 60, groups: [noTimes] }),
    ).toEqual([expect.objectContaining({ startTime: '08:00', endTime: '23:00' })]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/attendance/shared/ended-lessons.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { tashkentDateStr } from '../../common/date/tashkent';
import { DAY_NAME_TO_JS } from './date-utils';
import { DAY_END_TIME, DAY_START_TIME, toMinutes } from './attendance-window';

export interface SweepGroup {
  id: string;
  name: string;
  companyId: number;
  branchId: number;
  exactDays: string[];
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
}

export interface SweepReschedule {
  groupId: string;
  originalDate: Date;
  newDate: Date;
  newLessonStartTime: string | null;
  newLessonEndTime: string | null;
}

export interface EndedLesson {
  groupId: string;
  groupName: string;
  companyId: number;
  branchId: number;
  startTime: string;
  endTime: string;
}

/** A `@db.Date` value (UTC midnight) as its calendar day. */
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Today's lessons that have ended by `nowMinutes`, by the notion of a lesson
 * day attendance validation uses: the weekly schedule, minus a day cancelled
 * or moved away, plus a day moved here (timed by the move), inside the
 * group's date range, never on a holiday. Pure, so the lesson-end sweep and
 * its tests share one rule.
 */
export function endedLessonsOn(args: {
  todayStr: string;
  nowMinutes: number;
  groups: SweepGroup[];
  reschedules: SweepReschedule[];
  cancelledGroupIds: ReadonlySet<string>;
  isHoliday: (branchId: number) => boolean;
}): EndedLesson[] {
  const weekday = new Date(`${args.todayStr}T00:00:00.000Z`).getUTCDay();
  const movedAway = new Set<string>();
  const movedHere = new Map<string, SweepReschedule>();
  for (const r of args.reschedules) {
    if (dayOf(r.originalDate) === args.todayStr) movedAway.add(r.groupId);
    if (dayOf(r.newDate) === args.todayStr) movedHere.set(r.groupId, r);
  }

  const ended: EndedLesson[] = [];
  for (const g of args.groups) {
    if (args.cancelledGroupIds.has(g.id) || args.isHoliday(g.branchId)) continue;
    if (g.startDate && args.todayStr < tashkentDateStr(g.startDate)) continue;
    if (g.endDate && args.todayStr > tashkentDateStr(g.endDate)) continue;

    const moved = movedHere.get(g.id);
    const scheduled = g.exactDays.some(
      (d) => DAY_NAME_TO_JS[d.toLowerCase()] === weekday,
    );
    if (!moved && (!scheduled || movedAway.has(g.id))) continue;

    const startTime =
      moved?.newLessonStartTime ?? g.lessonStartTime ?? DAY_START_TIME;
    const endTime = moved?.newLessonEndTime ?? g.lessonEndTime ?? DAY_END_TIME;
    if (args.nowMinutes < toMinutes(endTime)) continue;

    ended.push({
      groupId: g.id,
      groupName: g.name,
      companyId: g.companyId,
      branchId: g.branchId,
      startTime,
      endTime,
    });
  }
  return ended;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/attendance/shared/ended-lessons.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/attendance/shared/ended-lessons.ts src/attendance/shared/ended-lessons.spec.ts
npx eslint src/attendance/shared/ended-lessons.ts src/attendance/shared/ended-lessons.spec.ts --quiet
git add src/attendance/shared/ended-lessons.ts src/attendance/shared/ended-lessons.spec.ts
git commit -m "feat(attendance): find today's lessons that have ended

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Roster on a past lesson day

**Files:**
- Create: `server/src/attendance/shared/roster-on-date.ts`
- Test: `server/src/attendance/shared/roster-on-date.spec.ts`

**Interfaces:**
- Produces: `interface RosterEnrollment { id: string; studentId: number }`; `rosterOnDate(db: Pick<Prisma.TransactionClient, 'enrollment'>, groupId: string, lessonDate: Date): Promise<RosterEnrollment[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { EnrollmentStatus } from '@prisma/client';
import { rosterOnDate } from './roster-on-date';

const lesson = new Date('2026-09-28T00:00:00.000Z');
const db = (rows: unknown[]) =>
  ({ enrollment: { findMany: jest.fn().mockResolvedValue(rows) } }) as any;

describe('rosterOnDate', () => {
  it('keeps active students and those who left on or after the lesson day', async () => {
    const rows = [
      { id: 'e1', studentId: 1, status: EnrollmentStatus.ACTIVE, statusChangedAt: null },
      // left the next morning (Tashkent)
      { id: 'e2', studentId: 2, status: EnrollmentStatus.DROPPED, statusChangedAt: new Date('2026-09-29T06:00:00.000Z') },
      // left the day before
      { id: 'e3', studentId: 3, status: EnrollmentStatus.DROPPED, statusChangedAt: new Date('2026-09-27T06:00:00.000Z') },
      // group completed the same evening
      { id: 'e4', studentId: 4, status: EnrollmentStatus.COMPLETED, statusChangedAt: new Date('2026-09-28T13:00:00.000Z') },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([
      { id: 'e1', studentId: 1 },
      { id: 'e2', studentId: 2 },
      { id: 'e4', studentId: 4 },
    ]);
  });

  it("prefers a returning student's active enrollment", async () => {
    const rows = [
      { id: 'old', studentId: 5, status: EnrollmentStatus.TRANSFERRED, statusChangedAt: new Date('2026-09-29T06:00:00.000Z') },
      { id: 'new', studentId: 5, status: EnrollmentStatus.ACTIVE, statusChangedAt: null },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([
      { id: 'new', studentId: 5 },
    ]);
  });

  it('leaves out a closed enrollment whose closing day is unknown', async () => {
    const rows = [
      { id: 'e6', studentId: 6, status: EnrollmentStatus.DROPPED, statusChangedAt: null },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([]);
  });

  it('asks only for enrollments started by the lesson day', async () => {
    const d = db([]);
    await rosterOnDate(d, 'g1', lesson);
    expect(d.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          deletedAt: null,
          OR: [{ startDate: null }, { startDate: { lte: lesson } }],
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/attendance/shared/roster-on-date.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { tashkentDateStr } from '../../common/date/tashkent';

export interface RosterEnrollment {
  id: string;
  studentId: number;
}

/**
 * Who was in the group on a past lesson day — the late register's roster
 * (spec 2026-09-29 §3.4). Today's roster (ACTIVE only) would drop a student
 * who left after the lesson, or everyone once the group was closed.
 *
 * The membership rule is the dots tab's (`getLessonSequence`): an enrollment
 * counts from its start until the Tashkent day its status last moved away
 * from ACTIVE, inclusive; an ACTIVE one is open-ended. Unlike the dots tab, a
 * closed enrollment with no change date is left out — writing attendance for
 * someone who may have been gone for months is worse than asking the
 * administrator to add them. One enrollment per student: the ACTIVE one if
 * any, else the first found.
 */
export async function rosterOnDate(
  db: Pick<Prisma.TransactionClient, 'enrollment'>,
  groupId: string,
  lessonDate: Date,
): Promise<RosterEnrollment[]> {
  const day = lessonDate.toISOString().slice(0, 10);
  const rows = await db.enrollment.findMany({
    where: {
      groupId,
      deletedAt: null,
      OR: [{ startDate: null }, { startDate: { lte: lessonDate } }],
    },
    select: { id: true, studentId: true, status: true, statusChangedAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byStudent = new Map<number, (typeof rows)[number]>();
  for (const e of rows) {
    const member =
      e.status === EnrollmentStatus.ACTIVE ||
      (e.statusChangedAt !== null && tashkentDateStr(e.statusChangedAt) >= day);
    if (!member) continue;
    const kept = byStudent.get(e.studentId);
    if (!kept || (kept.status !== EnrollmentStatus.ACTIVE && e.status === EnrollmentStatus.ACTIVE)) {
      byStudent.set(e.studentId, e);
    }
  }
  return [...byStudent.values()].map((e) => ({ id: e.id, studentId: e.studentId }));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/attendance/shared/roster-on-date.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/attendance/shared/roster-on-date.ts src/attendance/shared/roster-on-date.spec.ts
npx eslint src/attendance/shared/roster-on-date.ts src/attendance/shared/roster-on-date.spec.ts --quiet
git add src/attendance/shared/roster-on-date.ts src/attendance/shared/roster-on-date.spec.ts
git commit -m "feat(attendance): roster of a past lesson day

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Forfeited-lesson keys

**Files:**
- Create: `server/src/unmarked-lessons/forfeited-lessons.ts`
- Test: `server/src/unmarked-lessons/forfeited-lessons.spec.ts`

**Interfaces:**
- Produces: `lessonKey(groupId: string, date: Date): string` (`"<groupId>:YYYY-MM-DD"`, date read as its UTC calendar day); `isLessonPayForfeited(db: Pick<Prisma.TransactionClient, 'unmarkedLesson'>, groupId: string, lessonDate: Date): Promise<boolean>`; `loadForfeitedLessonKeys(db, params: { companyId: number; from: Date; toExclusive: Date }): Promise<Set<string>>`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  isLessonPayForfeited,
  lessonKey,
  loadForfeitedLessonKeys,
} from './forfeited-lessons';

describe('lessonKey', () => {
  it('uses the UTC calendar day of a @db.Date value', () => {
    expect(lessonKey('g1', new Date('2026-09-28T00:00:00.000Z'))).toBe('g1:2026-09-28');
    expect(lessonKey('g1', new Date('2026-09-28T08:00:00.000Z'))).toBe('g1:2026-09-28');
  });
});

describe('isLessonPayForfeited', () => {
  const db = (row: unknown) =>
    ({ unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(row) } }) as any;

  it('is false when nobody opened the lesson', async () => {
    expect(await isLessonPayForfeited(db(null), 'g1', new Date('2026-09-28T00:00:00.000Z'))).toBe(false);
  });

  it('is false for an exempt lesson and true otherwise', async () => {
    expect(await isLessonPayForfeited(db({ teacherPayExempt: true }), 'g1', new Date('2026-09-28T00:00:00.000Z'))).toBe(false);
    expect(await isLessonPayForfeited(db({ teacherPayExempt: false }), 'g1', new Date('2026-09-28T00:00:00.000Z'))).toBe(true);
  });

  it('looks the lesson up by its calendar day', async () => {
    const d = db(null);
    await isLessonPayForfeited(d, 'g1', new Date('2026-09-28T08:00:00.000Z'));
    expect(d.unmarkedLesson.findUnique).toHaveBeenCalledWith({
      where: { groupId_date: { groupId: 'g1', date: new Date('2026-09-28T00:00:00.000Z') } },
      select: { teacherPayExempt: true },
    });
  });
});

describe('loadForfeitedLessonKeys', () => {
  it('returns the keys of non-exempt rows in the window', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { groupId: 'g1', date: new Date('2026-09-28T00:00:00.000Z') },
      { groupId: 'g2', date: new Date('2026-09-29T00:00:00.000Z') },
    ]);
    const from = new Date('2026-09-01T00:00:00.000Z');
    const toExclusive = new Date('2026-10-01T00:00:00.000Z');
    const keys = await loadForfeitedLessonKeys(
      { unmarkedLesson: { findMany } } as any,
      { companyId: 7, from, toExclusive },
    );
    expect([...keys]).toEqual(['g1:2026-09-28', 'g2:2026-09-29']);
    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: 7, teacherPayExempt: false, date: { gte: from, lt: toExclusive } },
      select: { groupId: true, date: true },
    });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/unmarked-lessons/forfeited-lessons.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'unmarkedLesson'>;

/** The calendar day of a `@db.Date` value, which is stored as UTC midnight. */
function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** `"<groupId>:YYYY-MM-DD"` — the key every lock and its callers agree on. */
export function lessonKey(groupId: string, date: Date): string {
  return `${groupId}:${utcDay(date).toISOString().slice(0, 10)}`;
}

/**
 * ADR-0054: a lesson nobody marked before it ended earns its teacher
 * nothing — unless the CEO exempted it. True when the lesson has an
 * `UnmarkedLesson` row that is not exempt, whatever the row's status.
 */
export async function isLessonPayForfeited(
  db: Db,
  groupId: string,
  lessonDate: Date,
): Promise<boolean> {
  const row = await db.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId, date: utcDay(lessonDate) } },
    select: { teacherPayExempt: true },
  });
  return row !== null && !row.teacherPayExempt;
}

/** `lessonKey`s of the forfeited lessons whose day is in `[from, toExclusive)`. */
export async function loadForfeitedLessonKeys(
  db: Db,
  params: { companyId: number; from: Date; toExclusive: Date },
): Promise<Set<string>> {
  const rows = await db.unmarkedLesson.findMany({
    where: {
      companyId: params.companyId,
      teacherPayExempt: false,
      date: { gte: params.from, lt: params.toExclusive },
    },
    select: { groupId: true, date: true },
  });
  return new Set(rows.map((r) => lessonKey(r.groupId, r.date)));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/unmarked-lessons/forfeited-lessons.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/unmarked-lessons/forfeited-lessons.ts src/unmarked-lessons/forfeited-lessons.spec.ts
npx eslint src/unmarked-lessons/forfeited-lessons.ts src/unmarked-lessons/forfeited-lessons.spec.ts --quiet
git add src/unmarked-lessons/forfeited-lessons.ts src/unmarked-lessons/forfeited-lessons.spec.ts
git commit -m "feat(salary): know which lessons earn the teacher nothing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Salary write lock (`createAccrual`)

**Files:**
- Modify: `server/src/salary/salary-accrual.service.ts:102-110`
- Test: `server/src/salary/salary-accrual.service.spec.ts`

**Interfaces:**
- Consumes: `isLessonPayForfeited` (Task 5).
- Produces: `createAccrual` returns `null` for a forfeited lesson. Every accrual write already passes through it (live monthly and pack billing, `settleDeferredAccruals`, the payroll cron's centre top-up), so nothing else changes.

- [ ] **Step 1: Write the failing tests**

In `salary-accrual.service.spec.ts`, add to the `prisma` mock in `beforeEach`:

```ts
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null) },
```

and add this `describe` block:

```ts
  describe('unmarked lessons (ADR-0054)', () => {
    const version = {
      id: 'v-1',
      salaryType: 'PERCENTAGE',
      value: 30,
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    };

    it('writes nothing for a lesson marked after it ended', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ teacherPayExempt: false });
      expect(await service.createAccrual(baseParams)).toBeNull();
      expect(prisma.employeeSalaryConfigVersion.findFirst).not.toHaveBeenCalled();
      expect(prisma.salaryAccrual.upsert).not.toHaveBeenCalled();
    });

    it('refuses a centre top-up for it too', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ teacherPayExempt: false });
      expect(
        await service.createAccrual({
          ...baseParams,
          deductionTransactionId: null,
          centerFunded: true,
        }),
      ).toBeNull();
      expect(prisma.salaryAccrual.upsert).not.toHaveBeenCalled();
    });

    it('pays an exempt lesson as usual', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ teacherPayExempt: true });
      prisma.employeeSalaryConfigVersion.findFirst.mockResolvedValueOnce(version);
      prisma.salaryAccrual.upsert.mockResolvedValue({ id: 'acc-1' });
      expect(await service.createAccrual(baseParams)).toEqual({ id: 'acc-1' });
    });
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest src/salary/salary-accrual.service.spec.ts -t "unmarked lessons"`
Expected: FAIL — the first two tests get an accrual / call the version lookup.

- [ ] **Step 3: Implement**

In `salary-accrual.service.ts`, import:

```ts
import { isLessonPayForfeited } from '../unmarked-lessons/forfeited-lessons';
```

and directly after `const db = params.tx ?? this.prisma;` insert:

```ts
    // ADR-0054: a lesson nobody marked before it ended never earns the teacher
    // anything — not live, not deferred, not as a centre top-up. Every accrual
    // write passes through here, so this one check covers them all.
    if (await isLessonPayForfeited(db, params.groupId, params.lessonDate)) {
      this.logger.log(
        `Accrual skipped for teacher ${params.teacherId}: lesson ${params.groupId} ${params.lessonDate.toISOString().slice(0, 10)} was not marked in time (ADR-0054).`,
      );
      return null;
    }
```

- [ ] **Step 4: Run the file**

Run: `npx jest src/salary/salary-accrual.service.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts
npx eslint src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts --quiet
git add src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts
git commit -m "feat(salary): no accrual for a lesson marked after it ended

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Salary read lock (`sweepGapLessons` and its three callers)

**Files:**
- Modify: `server/src/salary/shared/gap-sweep.ts:45-105` (input), `:239-253` (loop)
- Modify: `server/src/salary/salary-calculation.service.ts` (`computeGapAccruals`, ~728-760 and the BR-09b backlog ~789-835)
- Modify: `server/src/salary/salary-monthly.service.ts` (~488-519)
- Modify: `server/src/salary/salary-center-topup.service.ts` (~225-251)
- Test: `server/src/salary/shared/gap-sweep.spec.ts`, plus the three service specs (mocks)

**Interfaces:**
- Consumes: `lessonKey`, `loadForfeitedLessonKeys` (Task 5).
- Produces: `GapSweepInput.forfeitedLessons: ReadonlySet<string>` (required).

- [ ] **Step 1: Write the failing test**

In `gap-sweep.spec.ts`, add `forfeitedLessons: new Set<string>(),` to the object `buildInput` returns (before `...overrides`), and add:

```ts
describe('sweepGapLessons — unmarked lessons (ADR-0054)', () => {
  // buildInput's one attendance is lessonDate(10) = 2026-09-10 in group GROUP.
  it('never fronts a lesson whose pay was forfeited', () => {
    const open = sweepGapLessons(
      buildInput(MONTHLY_COURSE, PERCENTAGE, {
        monthlyFrozen: frozen(30_769, 13),
      }),
    );
    expect(open.lessons).toHaveLength(1);

    const forfeited = sweepGapLessons(
      buildInput(MONTHLY_COURSE, PERCENTAGE, {
        monthlyFrozen: frozen(30_769, 13),
        forfeitedLessons: new Set([`${GROUP}:2026-09-10`]),
      }),
    );
    expect(forfeited.lessons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/salary/shared/gap-sweep.spec.ts -t "unmarked lessons"`
Expected: FAIL — the forfeited lesson is still swept (and TypeScript may already complain the field is unknown; that is the same failure).

- [ ] **Step 3: Implement the sweep side**

In `gap-sweep.ts`, import `import { lessonKey } from '../../unmarked-lessons/forfeited-lessons';`, add to `GapSweepInput` (after `skipZeroAmount`):

```ts
  /**
   * `lessonKey(groupId, date)` of lessons whose teacher pay is forfeited
   * (ADR-0054): nobody marked them before they ended. Required so no caller
   * can forget it — without it the salary page would show the centre owing
   * the teacher a lesson that `createAccrual` then refuses to pay.
   */
  forfeitedLessons: ReadonlySet<string>;
```

and in `sweepGapLessons`, directly after `if (!g) continue;`:

```ts
    if (input.forfeitedLessons.has(lessonKey(att.groupId, att.date))) continue;
```

- [ ] **Step 4: Run the sweep spec**

Run: `npx jest src/salary/shared/gap-sweep.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire the three callers**

`salary-calculation.service.ts` — import `{ lessonKey, loadForfeitedLessonKeys } from '../unmarked-lessons/forfeited-lessons'`. After the `packPrices` load in `computeGapAccruals`:

```ts
    // ADR-0054: lessons nobody marked in time are never fronted either.
    const forfeitedLessons = await loadForfeitedLessonKeys(this.prisma, {
      companyId,
      from: periodStartDate,
      toExclusive: periodEndDateExclusive,
    });
```

pass `forfeitedLessons,` into the `sweepGapLessons({ … })` call, and in the BR-09b block, after `const backlogPack = …`:

```ts
      const backlogForfeited = await loadForfeitedLessonKeys(this.prisma, {
        companyId,
        from: eraStart,
        toExclusive: periodStart,
      });
```

and at the top of the `for (const att of backlog)` loop:

```ts
        if (backlogForfeited.has(lessonKey(att.groupId, att.date))) continue;
```

`salary-monthly.service.ts` — import `{ loadForfeitedLessonKeys } from './../unmarked-lessons/forfeited-lessons'` (path `'../unmarked-lessons/forfeited-lessons'`), and before `const sweep = sweepGapLessons({`:

```ts
    const forfeitedLessons = await loadForfeitedLessonKeys(this.prisma, {
      companyId,
      from: periodStartDate,
      toExclusive: periodEndDateExclusive,
    });
```

then pass `forfeitedLessons,` into the call.

`salary-center-topup.service.ts` — the same three lines before `const { lessons } = sweepGapLessons({`, and pass `forfeitedLessons,`.

- [ ] **Step 6: Fix the service spec mocks and run the salary suite**

In `salary-calculation.service.spec.ts`, `salary-monthly.service.spec.ts` and `salary-center-topup.service.spec.ts` (every `prisma = { … }` object that already has an `attendance: { … }` mock), add:

```ts
      unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) },
```

Run: `npx jest src/salary`
Expected: PASS. If another spec now fails with `Cannot read properties of undefined (reading 'findMany')` on `unmarkedLesson`, add the same line to its prisma mock.

- [ ] **Step 7: Typecheck, format, lint, commit**

```bash
npm run typecheck
npx prettier --write src/salary/shared/gap-sweep.ts src/salary/shared/gap-sweep.spec.ts src/salary/salary-calculation.service.ts src/salary/salary-monthly.service.ts src/salary/salary-center-topup.service.ts src/salary/salary-calculation.service.spec.ts src/salary/salary-monthly.service.spec.ts src/salary/salary-center-topup.service.spec.ts
npx eslint src/salary --quiet
git add src/salary
git commit -m "feat(salary): payroll never fronts a lesson marked after it ended

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: System task helpers

**Files:**
- Create: `server/src/unmarked-lessons/lesson-task.ts`
- Test: `server/src/unmarked-lessons/lesson-task.spec.ts`

**Interfaces:**
- Produces: `TASK_DUE_HOUR = 10`; `nextWorkingDay(dateStr: string, holidays: ReadonlySet<string>): string`; `taskDueAt(dateStr: string): Date`; `lessonTaskText(args: { groupName: string; dateStr: string; startTime: string; endTime: string }): string`; `lessonTaskAssigneeIds(tx, companyId: number, branchId: number): Promise<number[]>`; `createLessonTask(tx, args: { companyId: number; branchId: number; groupId: string; groupName: string; dateStr: string; startTime: string; endTime: string; dueAt: Date }): Promise<string | null>` (comment id); `closeLessonTask(tx, commentId: string | null, actorId: number | null): Promise<void>`; `claimSystemTask(tx, commentId: string, userId: number): Promise<boolean>` (false = the caller is not an assignee). `tx` is `Prisma.TransactionClient`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  claimSystemTask,
  closeLessonTask,
  createLessonTask,
  lessonTaskAssigneeIds,
  lessonTaskText,
  nextWorkingDay,
  taskDueAt,
} from './lesson-task';

describe('nextWorkingDay', () => {
  it('skips Sunday and holidays', () => {
    expect(nextWorkingDay('2026-09-26', new Set())).toBe('2026-09-28'); // Sat → Mon
    expect(nextWorkingDay('2026-09-29', new Set(['2026-09-30']))).toBe('2026-10-01');
  });
});

describe('taskDueAt', () => {
  it('is 10:00 Tashkent on that day', () => {
    expect(taskDueAt('2026-10-01').toISOString()).toBe('2026-10-01T05:00:00.000Z');
  });
});

describe('lessonTaskText', () => {
  it('names the group, day and time', () => {
    expect(
      lessonTaskText({ groupName: '#014', dateStr: '2026-09-29', startTime: '16:00', endTime: '17:30' }),
    ).toBe("#014, 29.09.2026 16:00–17:30: davomat olinmadi. Dars bo'ldimi?");
  });
});

describe('lessonTaskAssigneeIds', () => {
  it('asks administrators, then directors, then CEOs', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7 }]);
    expect(await lessonTaskAssigneeIds({ user: { findMany } } as any, 1, 2)).toEqual([7]);
    expect(findMany.mock.calls[0][0].where.roles).toEqual({ some: { role: { name: 'Administrator' } } });
    expect(findMany.mock.calls[1][0].where.roles).toEqual({ some: { role: { name: 'Branch Director' } } });
    expect(findMany.mock.calls[2][0].where.roles).toEqual({ some: { role: { name: 'CEO' } } });
  });

  it('stops at the first role that has someone', async () => {
    const findMany = jest.fn().mockResolvedValueOnce([{ id: 3 }, { id: 4 }]);
    expect(await lessonTaskAssigneeIds({ user: { findMany } } as any, 1, 2)).toEqual([3, 4]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe('createLessonTask', () => {
  const args = {
    companyId: 1,
    branchId: 2,
    groupId: 'g1',
    groupName: '#014',
    dateStr: '2026-09-29',
    startTime: '16:00',
    endTime: '17:30',
    dueAt: new Date('2026-09-30T05:00:00.000Z'),
  };

  it('writes an author-less system task for every administrator', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }, { id: 4 }]) },
      comment: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    } as any;
    expect(await createLessonTask(tx, args)).toBe('c1');
    expect(tx.comment.create).toHaveBeenCalledWith({
      data: {
        entityType: 'Group',
        entityId: 'g1',
        content: "#014, 29.09.2026 16:00–17:30: davomat olinmadi. Dars bo'ldimi?",
        isTask: true,
        isSystem: true,
        authorId: null,
        dueDate: args.dueAt,
        priority: 'HIGH',
        companyId: 1,
        assignees: { create: [{ userId: 3, status: 'PENDING' }, { userId: 4, status: 'PENDING' }] },
      },
      select: { id: true },
    });
  });

  it('writes nothing when nobody can take it', async () => {
    const tx = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      comment: { create: jest.fn() },
    } as any;
    expect(await createLessonTask(tx, args)).toBeNull();
    expect(tx.comment.create).not.toHaveBeenCalled();
  });
});

describe('closeLessonTask', () => {
  const tx = () =>
    ({
      commentAssignee: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    }) as any;

  it('lets an answering administrator take it and closes their copy', async () => {
    const t = tx();
    t.commentAssignee.findUnique.mockResolvedValue({ id: 'a3', seenAt: null });
    await closeLessonTask(t, 'c1', 3);
    expect(t.commentAssignee.deleteMany).toHaveBeenCalledWith({ where: { commentId: 'c1', userId: { not: 3 } } });
    expect(t.commentAssignee.update).toHaveBeenCalledWith({
      where: { id: 'a3' },
      data: { status: 'DONE', doneAt: expect.any(Date), seenAt: expect.any(Date) },
    });
  });

  it('closes every copy when a director or the CEO answers', async () => {
    const t = tx();
    t.commentAssignee.findUnique.mockResolvedValue(null);
    await closeLessonTask(t, 'c1', 9);
    expect(t.commentAssignee.updateMany).toHaveBeenCalledWith({
      where: { commentId: 'c1', status: { not: 'DONE' } },
      data: { status: 'DONE', doneAt: expect.any(Date) },
    });
  });

  it('does nothing without a task', async () => {
    const t = tx();
    await closeLessonTask(t, null, 3);
    expect(t.commentAssignee.findUnique).not.toHaveBeenCalled();
  });
});

describe('claimSystemTask', () => {
  it('removes the other copies and records who took it', async () => {
    const t = {
      commentAssignee: {
        findMany: jest.fn().mockResolvedValue([{ userId: 3 }, { userId: 4 }]),
        deleteMany: jest.fn(),
      },
      unmarkedLesson: { updateMany: jest.fn() },
    } as any;
    expect(await claimSystemTask(t, 'c1', 3)).toBe(true);
    expect(t.commentAssignee.deleteMany).toHaveBeenCalledWith({ where: { commentId: 'c1', userId: { not: 3 } } });
    expect(t.unmarkedLesson.updateMany).toHaveBeenCalledWith({ where: { taskCommentId: 'c1' }, data: { claimedById: 3 } });
  });

  it('refuses someone who is not on it', async () => {
    const t = {
      commentAssignee: { findMany: jest.fn().mockResolvedValue([{ userId: 4 }]), deleteMany: jest.fn() },
      unmarkedLesson: { updateMany: jest.fn() },
    } as any;
    expect(await claimSystemTask(t, 'c1', 3)).toBe(false);
    expect(t.commentAssignee.deleteMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest src/unmarked-lessons/lesson-task.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { AssigneeStatus, Prisma, UserStatus } from '@prisma/client';
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  TASHKENT_OFFSET_MS,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

type Tx = Prisma.TransactionClient;

/** 10:00 Tashkent — `TaskReminderService` reminds an hour earlier, at 09:00. */
export const TASK_DUE_HOUR = 10;

const ACTIVE_STAFF = {
  deletedAt: null,
  isActive: true,
  status: UserStatus.ACTIVE,
} as const;

/** The first day after `dateStr` that is neither a Sunday nor a holiday. */
export function nextWorkingDay(
  dateStr: string,
  holidays: ReadonlySet<string>,
): string {
  let day = addDaysToDateStr(dateStr, 1);
  while (dayOfWeekForDateStr(day) === 0 || holidays.has(day)) {
    day = addDaysToDateStr(day, 1);
  }
  return day;
}

/** 10:00 Tashkent on `dateStr`, as the stored UTC instant. */
export function taskDueAt(dateStr: string): Date {
  return new Date(
    utcMidnightFromDateStr(dateStr).getTime() +
      TASK_DUE_HOUR * 3_600_000 -
      TASHKENT_OFFSET_MS,
  );
}

export function lessonTaskText(args: {
  groupName: string;
  dateStr: string;
  startTime: string;
  endTime: string;
}): string {
  const [y, m, d] = args.dateStr.split('-');
  return `${args.groupName}, ${d}.${m}.${y} ${args.startTime}–${args.endTime}: davomat olinmadi. Dars bo'ldimi?`;
}

/**
 * Who is asked (spec §3.6): the branch's active administrators — the people
 * the lesson-end reminder already goes to. A branch with none falls back to
 * its directors, and one with neither to the company's CEOs.
 */
export async function lessonTaskAssigneeIds(
  tx: Tx,
  companyId: number,
  branchId: number,
): Promise<number[]> {
  for (const role of ['Administrator', 'Branch Director']) {
    const users = await tx.user.findMany({
      where: {
        ...ACTIVE_STAFF,
        companyId,
        branches: { some: { branchId } },
        roles: { some: { role: { name: role } } },
      },
      select: { id: true },
    });
    if (users.length > 0) return users.map((u) => u.id);
  }
  const ceos = await tx.user.findMany({
    where: { ...ACTIVE_STAFF, companyId, roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true },
  });
  return ceos.map((u) => u.id);
}

/**
 * The «Dars bo'ldimi?» task. Written straight to the table, not through
 * `CommentsService.create`: there is no caller to check and no author, and
 * the generic `task.assigned` notification would duplicate the lesson-end
 * message the administrators already get.
 */
export async function createLessonTask(
  tx: Tx,
  args: {
    companyId: number;
    branchId: number;
    groupId: string;
    groupName: string;
    dateStr: string;
    startTime: string;
    endTime: string;
    dueAt: Date;
  },
): Promise<string | null> {
  const assigneeIds = await lessonTaskAssigneeIds(tx, args.companyId, args.branchId);
  if (assigneeIds.length === 0) return null;
  const comment = await tx.comment.create({
    data: {
      entityType: 'Group',
      entityId: args.groupId,
      content: lessonTaskText(args),
      isTask: true,
      isSystem: true,
      authorId: null,
      dueDate: args.dueAt,
      priority: 'HIGH',
      companyId: args.companyId,
      assignees: {
        create: assigneeIds.map((userId) => ({ userId, status: AssigneeStatus.PENDING })),
      },
    },
    select: { id: true },
  });
  return comment.id;
}

/**
 * Closes the task once its lesson is answered. An administrator on the task
 * takes it (the others' copies go) and their copy becomes DONE; anyone else —
 * a director, the CEO, a cancellation made elsewhere — closes every copy.
 */
export async function closeLessonTask(
  tx: Tx,
  commentId: string | null,
  actorId: number | null,
): Promise<void> {
  if (!commentId) return;
  const now = new Date();
  if (actorId !== null) {
    const own = await tx.commentAssignee.findUnique({
      where: { commentId_userId: { commentId, userId: actorId } },
      select: { id: true, seenAt: true },
    });
    if (own) {
      await tx.commentAssignee.deleteMany({
        where: { commentId, userId: { not: actorId } },
      });
      await tx.commentAssignee.update({
        where: { id: own.id },
        data: { status: AssigneeStatus.DONE, doneAt: now, seenAt: own.seenAt ?? now },
      });
      return;
    }
  }
  await tx.commentAssignee.updateMany({
    where: { commentId, status: { not: AssigneeStatus.DONE } },
    data: { status: AssigneeStatus.DONE, doneAt: now },
  });
}

/**
 * The first administrator to act on a system task takes it (spec §3.6): the
 * other copies are deleted and the lesson remembers who has it. Run inside a
 * Serializable transaction — two administrators pressing at once conflict,
 * and one of them gets an error instead of both losing the task.
 */
export async function claimSystemTask(
  tx: Tx,
  commentId: string,
  userId: number,
): Promise<boolean> {
  const rows = await tx.commentAssignee.findMany({
    where: { commentId },
    select: { userId: true },
  });
  if (!rows.some((r) => r.userId === userId)) return false;
  if (rows.length > 1) {
    await tx.commentAssignee.deleteMany({
      where: { commentId, userId: { not: userId } },
    });
  }
  await tx.unmarkedLesson.updateMany({
    where: { taskCommentId: commentId },
    data: { claimedById: userId },
  });
  return true;
}
```

Note: the test for `claimSystemTask` with two rows expects `deleteMany`; with one row it is skipped — both behaviours are intended.

- [ ] **Step 4: Run it to see it pass**

Run: `npx jest src/unmarked-lessons/lesson-task.spec.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/unmarked-lessons/lesson-task.ts src/unmarked-lessons/lesson-task.spec.ts
npx eslint src/unmarked-lessons/lesson-task.ts src/unmarked-lessons/lesson-task.spec.ts --quiet
git add src/unmarked-lessons/lesson-task.ts src/unmarked-lessons/lesson-task.spec.ts
git commit -m "feat(tasks): the «Dars bo'ldimi?» system task

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Events, answer rules and state transitions

**Files:**
- Create: `server/src/unmarked-lessons/unmarked-lesson-events.ts`
- Create: `server/src/unmarked-lessons/answer-rules.ts` (+ `answer-rules.spec.ts`)
- Create: `server/src/unmarked-lessons/unmarked-lesson-transitions.ts` (+ `unmarked-lesson-transitions.spec.ts`)

**Interfaces:**
- Consumes: Tasks 2 and 8.
- Produces:
  - `UNMARKED_LESSON_NOT_HELD = 'unmarked-lesson.not-held'`, `UNMARKED_LESSON_HELD = 'unmarked-lesson.held'`; `interface UnmarkedLessonNotHeldPayload { companyId; branchId; groupId; groupName; date; lessonStartTime; lessonEndTime; reason: string; decidedById: number; outcome: 'CANCELLED' | 'RESCHEDULED'; refundedStudents?: number; refundedAmount?: number; newDate?: string; newLessonStartTime?: string | null; newLessonEndTime?: string | null }`; `interface UnmarkedLessonHeldPayload { companyId: number; groupId: string; groupName: string; date: string; teacherPayExempt: boolean }`.
  - `findPendingUnmarkedLesson(db, args: { groupId: string; date: Date; companyId: number }): Promise<UnmarkedLesson>` (404 otherwise); `assertMayAnswer(db, row: { claimedById: number | null }, userId: number, roles: string[]): Promise<void>` (409 when another administrator holds it).
  - `interface UnmarkedLessonDecision { companyId; branchId; groupId; groupName; date; lessonStartTime; lessonEndTime }`; `markUnmarkedLessonCancelled(tx, { groupId, date: Date, cancellationId, actorId }): Promise<UnmarkedLessonDecision | null>`; `assertMakeUpAhead(newDate: Date, newStartTime: string | null, now: Date): void`; `markUnmarkedLessonRescheduled(tx, { groupId, originalDate: Date, rescheduleId, actorId, newDate: Date, newStartTime: string | null, now: Date }): Promise<UnmarkedLessonDecision | null>`; `assertLinkedMakeUpAhead(tx, { rescheduleId, newDate: Date, newStartTime: string | null, now: Date }): Promise<void>`; `reopenAfterCancellationRemoved(tx, { cancellationId, groupId, date: Date, now: Date }): Promise<void>`; `reopenAfterRescheduleRemoved(tx, { rescheduleId, now: Date }): Promise<void>`; `closeTasksOfDeletedGroup(tx, groupId: string): Promise<void>`; `CANCELLED_BEFORE_REASON`.

- [ ] **Step 1: Write the events file**

```ts
/**
 * Events of the «Dars bo'ldimi?» flow (spec 2026-09-29, ADR-0054). Emitted
 * after the transaction that answered the lesson commits.
 */
export const UNMARKED_LESSON_NOT_HELD = 'unmarked-lesson.not-held';
export const UNMARKED_LESSON_HELD = 'unmarked-lesson.held';

/** «Bo'lmadi» — the Telegram group is told at once (ADR-0025 instant list). */
export interface UnmarkedLessonNotHeldPayload {
  companyId: number;
  branchId: number;
  groupId: string;
  groupName: string;
  /** 'YYYY-MM-DD' of the lesson that did not happen. */
  date: string;
  lessonStartTime: string;
  lessonEndTime: string;
  reason: string;
  decidedById: number;
  outcome: 'CANCELLED' | 'RESCHEDULED';
  refundedStudents?: number;
  refundedAmount?: number;
  newDate?: string;
  newLessonStartTime?: string | null;
  newLessonEndTime?: string | null;
}

/** «Bo'ldi» — the teacher is told the lesson earned nothing (unless exempt). */
export interface UnmarkedLessonHeldPayload {
  companyId: number;
  groupId: string;
  groupName: string;
  date: string;
  teacherPayExempt: boolean;
}
```

- [ ] **Step 2: Write the failing tests for answer rules**

`answer-rules.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { assertMayAnswer, findPendingUnmarkedLesson } from './answer-rules';

const date = new Date('2026-09-28T00:00:00.000Z');

describe('findPendingUnmarkedLesson', () => {
  const db = (row: unknown) =>
    ({ unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(row) } }) as any;

  it('returns a pending lesson of the company', async () => {
    const row = { id: 'u1', companyId: 1, status: 'PENDING' };
    expect(await findPendingUnmarkedLesson(db(row), { groupId: 'g1', date, companyId: 1 })).toBe(row);
  });

  it.each([
    ['missing', null],
    ['another company', { id: 'u1', companyId: 2, status: 'PENDING' }],
    ['answered', { id: 'u1', companyId: 1, status: 'HELD' }],
  ])('404s when %s', async (_label, row) => {
    await expect(
      findPendingUnmarkedLesson(db(row), { groupId: 'g1', date, companyId: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('assertMayAnswer', () => {
  const db = { user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }) } } as any;

  it('lets anyone answer an unclaimed lesson, and the holder a claimed one', async () => {
    await expect(assertMayAnswer(db, { claimedById: null }, 3, ['Administrator'])).resolves.toBeUndefined();
    await expect(assertMayAnswer(db, { claimedById: 3 }, 3, ['Administrator'])).resolves.toBeUndefined();
  });

  it('lets directors and the CEO answer whoever holds it', async () => {
    await expect(assertMayAnswer(db, { claimedById: 3 }, 9, ['Branch Director'])).resolves.toBeUndefined();
    await expect(assertMayAnswer(db, { claimedById: 3 }, 1, ['CEO'])).resolves.toBeUndefined();
  });

  it('stops another administrator and names the holder', async () => {
    await expect(assertMayAnswer(db, { claimedById: 3 }, 4, ['Administrator'])).rejects.toThrow(
      new ConflictException('Bu darsga Ali Valiyev javob bermoqda'),
    );
  });
});
```

- [ ] **Step 3: Implement answer rules**

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma, UnmarkedLesson } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'unmarkedLesson' | 'user'>;

/** The lesson still waiting for «Dars bo'ldimi?», or 404. */
export async function findPendingUnmarkedLesson(
  db: Pick<Prisma.TransactionClient, 'unmarkedLesson'>,
  args: { groupId: string; date: Date; companyId: number },
): Promise<UnmarkedLesson> {
  const row = await db.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
  });
  if (!row || row.companyId !== args.companyId || row.status !== 'PENDING') {
    throw new NotFoundException('Javob kutilayotgan dars topilmadi');
  }
  return row;
}

/**
 * Once an administrator has taken the lesson's task, the other
 * administrators leave it to them; directors and the CEO can always answer
 * (spec §3.3). The roles come from the caller's token — this only ever
 * narrows who may act, it grants nothing.
 */
export async function assertMayAnswer(
  db: Db,
  row: { claimedById: number | null },
  userId: number,
  roles: string[],
): Promise<void> {
  if (row.claimedById === null || row.claimedById === userId) return;
  if (roles.includes('CEO') || roles.includes('Branch Director')) return;
  const holder = await db.user.findUnique({
    where: { id: row.claimedById },
    select: { firstName: true, lastName: true },
  });
  throw new ConflictException(
    holder
      ? `Bu darsga ${holder.firstName} ${holder.lastName} javob bermoqda`
      : 'Bu darsga boshqa administrator javob bermoqda',
  );
}
```

Run: `npx jest src/unmarked-lessons/answer-rules.spec.ts` — Expected: PASS.

- [ ] **Step 4: Write the failing tests for the transitions**

`unmarked-lesson-transitions.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import {
  assertMakeUpAhead,
  closeTasksOfDeletedGroup,
  markUnmarkedLessonCancelled,
  markUnmarkedLessonRescheduled,
  reopenAfterCancellationRemoved,
  reopenAfterRescheduleRemoved,
} from './unmarked-lesson-transitions';

const date = new Date('2026-09-28T00:00:00.000Z');
const row = (over = {}) => ({
  id: 'u1',
  companyId: 1,
  branchId: 2,
  groupId: 'g1',
  date,
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  status: 'PENDING',
  teacherPayExempt: false,
  claimedById: null,
  taskCommentId: 'c1',
  ...over,
});

function makeTx() {
  return {
    unmarkedLesson: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
    },
    group: {
      findUnique: jest.fn().mockResolvedValue({
        name: '#014',
        companyId: 1,
        branchId: 2,
        lessonStartTime: '16:00',
        lessonEndTime: '17:30',
        deletedAt: null,
      }),
    },
    attendance: { findFirst: jest.fn().mockResolvedValue(null) },
    commentAssignee: {
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
    comment: { create: jest.fn().mockResolvedValue({ id: 'c2' }) },
  } as any;
}

describe('markUnmarkedLessonCancelled', () => {
  it('answers a pending lesson NOT_HELD and closes its task', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    const decision = await markUnmarkedLessonCancelled(tx, { groupId: 'g1', date, cancellationId: 'x1', actorId: 9 });
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { status: 'NOT_HELD', cancellationId: 'x1', decidedById: 9, decidedAt: expect.any(Date) },
    });
    expect(tx.commentAssignee.updateMany).toHaveBeenCalled();
    expect(decision).toEqual({
      companyId: 1,
      branchId: 2,
      groupId: 'g1',
      groupName: '#014',
      date: '2026-09-28',
      lessonStartTime: '16:00',
      lessonEndTime: '17:30',
    });
  });

  it('turns a wrong «Bo\'ldi» into NOT_HELD without touching the closed task', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row({ status: 'HELD' }));
    expect(await markUnmarkedLessonCancelled(tx, { groupId: 'g1', date, cancellationId: 'x1', actorId: 9 })).not.toBeNull();
    expect(tx.commentAssignee.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for a lesson nobody asked about', async () => {
    const tx = makeTx();
    expect(await markUnmarkedLessonCancelled(tx, { groupId: 'g1', date, cancellationId: 'x1', actorId: 9 })).toBeNull();
    expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
  });
});

describe('assertMakeUpAhead', () => {
  const now = new Date('2026-09-30T09:00:00.000Z'); // 14:00 Tashkent

  it('accepts a later day, or later today', () => {
    expect(() => assertMakeUpAhead(new Date('2026-10-01T00:00:00.000Z'), '10:00', now)).not.toThrow();
    expect(() => assertMakeUpAhead(new Date('2026-09-30T00:00:00.000Z'), '15:00', now)).not.toThrow();
  });

  it('refuses a make-up lesson that has already started', () => {
    expect(() => assertMakeUpAhead(new Date('2026-09-30T00:00:00.000Z'), '14:00', now)).toThrow(BadRequestException);
    expect(() => assertMakeUpAhead(new Date('2026-09-29T00:00:00.000Z'), '18:00', now)).toThrow(BadRequestException);
  });
});

describe('markUnmarkedLessonRescheduled', () => {
  const args = {
    groupId: 'g1',
    originalDate: date,
    rescheduleId: 'r1',
    actorId: 9,
    newDate: new Date('2026-10-01T00:00:00.000Z'),
    newStartTime: '16:00',
    now: new Date('2026-09-30T09:00:00.000Z'),
  };

  it('answers a pending lesson RESCHEDULED', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    expect(await markUnmarkedLessonRescheduled(tx, args)).not.toBeNull();
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { status: 'RESCHEDULED', rescheduleId: 'r1', decidedById: 9, decidedAt: args.now },
    });
  });

  it('refuses to move a lesson answered «Bo\'ldi»', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row({ status: 'HELD' }));
    await expect(markUnmarkedLessonRescheduled(tx, args)).rejects.toThrow(BadRequestException);
  });

  it('refuses a make-up lesson in the past', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findUnique.mockResolvedValue(row());
    await expect(
      markUnmarkedLessonRescheduled(tx, { ...args, newDate: new Date('2026-09-29T00:00:00.000Z') }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('reopening', () => {
  const now = new Date('2026-09-30T09:00:00.000Z');

  it('puts a cancelled answer back to PENDING with a new task', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(row({ status: 'NOT_HELD', cancellationId: 'x1' }));
    await reopenAfterCancellationRemoved(tx, { cancellationId: 'x1', groupId: 'g1', date, now });
    expect(tx.comment.create).toHaveBeenCalled();
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: {
        status: 'PENDING',
        cancellationId: null,
        rescheduleId: null,
        decidedById: null,
        decidedAt: null,
        claimedById: null,
        taskCommentId: 'c2',
      },
    });
  });

  it('opens an exempt question for an ended lesson that was cancelled beforehand', async () => {
    const tx = makeTx();
    await reopenAfterCancellationRemoved(tx, { cancellationId: 'x1', groupId: 'g1', date, now });
    expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ groupId: 'g1', date, teacherPayExempt: true, taskCommentId: 'c2' }),
    });
  });

  it('opens nothing when the lesson was marked or has not ended', async () => {
    const tx = makeTx();
    tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
    await reopenAfterCancellationRemoved(tx, { cancellationId: 'x1', groupId: 'g1', date, now });
    const later = makeTx();
    await reopenAfterCancellationRemoved(later, {
      cancellationId: 'x1',
      groupId: 'g1',
      date: new Date('2026-10-05T00:00:00.000Z'),
      now,
    });
    expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
    expect(later.unmarkedLesson.create).not.toHaveBeenCalled();
  });

  it('puts a moved answer back to PENDING', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findFirst.mockResolvedValue(row({ status: 'RESCHEDULED', rescheduleId: 'r1' }));
    await reopenAfterRescheduleRemoved(tx, { rescheduleId: 'r1', now });
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });
});

describe('closeTasksOfDeletedGroup', () => {
  it('closes the tasks of every pending lesson', async () => {
    const tx = makeTx();
    tx.unmarkedLesson.findMany.mockResolvedValue([{ taskCommentId: 'c1' }, { taskCommentId: 'c3' }]);
    await closeTasksOfDeletedGroup(tx, 'g1');
    expect(tx.commentAssignee.updateMany).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `npx jest src/unmarked-lessons/unmarked-lesson-transitions.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the transitions**

```ts
import { BadRequestException } from '@nestjs/common';
import type { Prisma, UnmarkedLesson } from '@prisma/client';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  lessonHasEnded,
  tashkentClock,
  toMinutes,
} from '../attendance/shared/attendance-window';
import {
  closeLessonTask,
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from './lesson-task';

type Tx = Prisma.TransactionClient;

/** What the group notice needs about an answered lesson. */
export interface UnmarkedLessonDecision {
  companyId: number;
  branchId: number;
  groupId: string;
  groupName: string;
  date: string;
  lessonStartTime: string;
  lessonEndTime: string;
}

export const CANCELLED_BEFORE_REASON =
  'Dars bekor qilingan edi — ustoz davomat kirita olmagan';

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

async function decisionOf(tx: Tx, row: UnmarkedLesson): Promise<UnmarkedLessonDecision> {
  const group = await tx.group.findUnique({
    where: { id: row.groupId },
    select: { name: true },
  });
  return {
    companyId: row.companyId,
    branchId: row.branchId,
    groupId: row.groupId,
    groupName: group?.name ?? '',
    date: dayOf(row.date),
    lessonStartTime: row.lessonStartTime,
    lessonEndTime: row.lessonEndTime,
  };
}

/**
 * A cancellation answers «Dars bo'ldimi?» with «Bo'lmadi» (spec §3.5 A),
 * whichever screen made it. A lesson already answered «Bo'ldi» can still be
 * cancelled by a director or the CEO who finds the answer was wrong.
 */
export async function markUnmarkedLessonCancelled(
  tx: Tx,
  args: { groupId: string; date: Date; cancellationId: string; actorId: number },
): Promise<UnmarkedLessonDecision | null> {
  const row = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
  });
  if (!row || (row.status !== 'PENDING' && row.status !== 'HELD')) return null;
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'NOT_HELD',
      cancellationId: args.cancellationId,
      decidedById: args.actorId,
      decidedAt: new Date(),
    },
  });
  if (row.status === 'PENDING') {
    await closeLessonTask(tx, row.taskCommentId, args.actorId);
  }
  return decisionOf(tx, row);
}

/** A make-up lesson must still be ahead, or nobody could mark it either (§3.5 B). */
export function assertMakeUpAhead(
  newDate: Date,
  newStartTime: string | null,
  now: Date,
): void {
  const { todayStr, nowMinutes } = tashkentClock(now);
  const day = dayOf(newDate);
  const ahead =
    day > todayStr ||
    (day === todayStr &&
      newStartTime !== null &&
      toMinutes(newStartTime) > nowMinutes);
  if (!ahead) {
    throw new BadRequestException(
      "Qo'shimcha dars hali boshlanmagan bo'lishi kerak — aks holda uning davomatini ham olib bo'lmaydi",
    );
  }
}

/** A reschedule of a lesson waiting for an answer answers it: moved (§3.5 B). */
export async function markUnmarkedLessonRescheduled(
  tx: Tx,
  args: {
    groupId: string;
    originalDate: Date;
    rescheduleId: string;
    actorId: number;
    newDate: Date;
    newStartTime: string | null;
    now: Date;
  },
): Promise<UnmarkedLessonDecision | null> {
  const row = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.originalDate } },
  });
  if (!row) return null;
  if (row.status === 'HELD') {
    throw new BadRequestException(
      "Bu darsga «Bo'ldi» deb javob berilgan — uni ko'chirib bo'lmaydi",
    );
  }
  if (row.status !== 'PENDING') return null;
  assertMakeUpAhead(args.newDate, args.newStartTime, args.now);
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'RESCHEDULED',
      rescheduleId: args.rescheduleId,
      decidedById: args.actorId,
      decidedAt: args.now,
    },
  });
  await closeLessonTask(tx, row.taskCommentId, args.actorId);
  return decisionOf(tx, row);
}

/** Editing a make-up lesson keeps it ahead of now. */
export async function assertLinkedMakeUpAhead(
  tx: Tx,
  args: { rescheduleId: string; newDate: Date; newStartTime: string | null; now: Date },
): Promise<void> {
  const linked = await tx.unmarkedLesson.findFirst({
    where: { rescheduleId: args.rescheduleId },
    select: { id: true },
  });
  if (linked) assertMakeUpAhead(args.newDate, args.newStartTime, args.now);
}

async function reopen(tx: Tx, row: UnmarkedLesson, now: Date): Promise<void> {
  const group = await tx.group.findUnique({
    where: { id: row.groupId },
    select: { name: true, deletedAt: true },
  });
  if (!group || group.deletedAt) return;
  const { todayStr } = tashkentClock(now);
  const taskCommentId = await createLessonTask(tx, {
    companyId: row.companyId,
    branchId: row.branchId,
    groupId: row.groupId,
    groupName: group.name,
    dateStr: dayOf(row.date),
    startTime: row.lessonStartTime,
    endTime: row.lessonEndTime,
    dueAt: taskDueAt(nextWorkingDay(todayStr, new Set())),
  });
  await tx.unmarkedLesson.update({
    where: { id: row.id },
    data: {
      status: 'PENDING',
      cancellationId: null,
      rescheduleId: null,
      decidedById: null,
      decidedAt: null,
      claimedById: null,
      taskCommentId,
    },
  });
}

/**
 * Deleting a cancellation re-asks the question (§3.5): an answered lesson
 * goes back to PENDING; a lesson cancelled before it happened, whose
 * cancellation is removed after it ended, is asked about for the first time —
 * exempt, because its teacher could not mark a cancelled lesson.
 */
export async function reopenAfterCancellationRemoved(
  tx: Tx,
  args: { cancellationId: string; groupId: string; date: Date; now: Date },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { cancellationId: args.cancellationId },
  });
  if (answered) return reopen(tx, answered, args.now);

  const group = await tx.group.findUnique({
    where: { id: args.groupId },
    select: {
      name: true,
      companyId: true,
      branchId: true,
      lessonStartTime: true,
      lessonEndTime: true,
      deletedAt: true,
    },
  });
  if (!group || group.deletedAt) return;
  const { todayStr, nowMinutes } = tashkentClock(args.now);
  if (
    !lessonHasEnded({
      date: dayOf(args.date),
      todayStr,
      nowMinutes,
      endTime: group.lessonEndTime,
    })
  ) {
    return;
  }
  const marked = await tx.attendance.findFirst({
    where: { groupId: args.groupId, date: args.date },
    select: { id: true },
  });
  if (marked) return;
  const existing = await tx.unmarkedLesson.findUnique({
    where: { groupId_date: { groupId: args.groupId, date: args.date } },
    select: { id: true },
  });
  if (existing) return;

  const startTime = group.lessonStartTime ?? DAY_START_TIME;
  const endTime = group.lessonEndTime ?? DAY_END_TIME;
  const taskCommentId = await createLessonTask(tx, {
    companyId: group.companyId,
    branchId: group.branchId,
    groupId: args.groupId,
    groupName: group.name,
    dateStr: dayOf(args.date),
    startTime,
    endTime,
    dueAt: taskDueAt(nextWorkingDay(todayStr, new Set())),
  });
  await tx.unmarkedLesson.create({
    data: {
      companyId: group.companyId,
      branchId: group.branchId,
      groupId: args.groupId,
      date: args.date,
      lessonStartTime: startTime,
      lessonEndTime: endTime,
      teacherPayExempt: true,
      exemptReason: CANCELLED_BEFORE_REASON,
      taskCommentId,
    },
  });
}

/** Deleting the move of an unanswered lesson re-asks the question. */
export async function reopenAfterRescheduleRemoved(
  tx: Tx,
  args: { rescheduleId: string; now: Date },
): Promise<void> {
  const answered = await tx.unmarkedLesson.findFirst({
    where: { rescheduleId: args.rescheduleId },
  });
  if (answered) await reopen(tx, answered, args.now);
}

/** A deleted group's open questions stop asking; their rows stay (no pay). */
export async function closeTasksOfDeletedGroup(tx: Tx, groupId: string): Promise<void> {
  const rows = await tx.unmarkedLesson.findMany({
    where: { groupId, status: 'PENDING' },
    select: { taskCommentId: true },
  });
  for (const r of rows) await closeLessonTask(tx, r.taskCommentId, null);
}
```

- [ ] **Step 7: Run both specs**

Run: `npx jest src/unmarked-lessons`
Expected: PASS.

- [ ] **Step 8: Format, lint, commit**

```bash
npx prettier --write src/unmarked-lessons
npx eslint src/unmarked-lessons --quiet
git add src/unmarked-lessons
git commit -m "feat(attendance): answer, move and re-ask an unmarked lesson

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Cancellation answers the question

**Files:**
- Modify: `server/src/lesson-cancellations/lesson-cancellations.service.ts` (`create` ~153-343, `remove` ~373-390)
- Test: `server/src/lesson-cancellations/lesson-cancellations.service.spec.ts`

**Interfaces:**
- Consumes: `markUnmarkedLessonCancelled`, `reopenAfterCancellationRemoved` (Task 9); `UNMARKED_LESSON_NOT_HELD`, `UnmarkedLessonNotHeldPayload` (Task 9).
- Produces: `create` emits `UNMARKED_LESSON_NOT_HELD` (outcome `CANCELLED`, refund figures) after commit when the day had a question; `remove` re-asks.

- [ ] **Step 1: Write the failing tests**

In the spec's `tx` object add:

```ts
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
```

add `findUnique: jest.fn().mockResolvedValue(null)` to `tx.group`, and `findFirst: jest.fn().mockResolvedValue(null)` to `tx.attendance`. Keep a handle on the emitter: replace `{ provide: EventEmitter2, useValue: { emit: jest.fn() } }` with `{ provide: EventEmitter2, useValue: emitter }` where `emitter = { emit: jest.fn() }` is declared in `beforeEach`. Then add (use the `dto` and the successful-create setup already used by the file's first passing create test — `tx.group.findFirst` resolving a group with `exactDays` containing the dto's weekday, `tx.lessonCancellation.findFirst` → `null`, `tx.lessonCancellation.create` → `{ id: 'x1' }`):

```ts
    it('answers a lesson waiting for «Dars bo\'ldimi?» and tells the group', async () => {
      tx.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 2, name: '#014', exactDays: ['wednesday'] });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'x1' });
      monthly.releaseCancelledLesson.mockResolvedValue({ students: 4, refunded: 150000 });
      tx.unmarkedLesson.findUnique.mockResolvedValue({
        id: 'u1', companyId: 1, branchId: 2, groupId: 'group-1', date: new Date('2026-04-15T00:00:00.000Z'),
        lessonStartTime: '16:00', lessonEndTime: '17:30', status: 'PENDING', taskCommentId: null,
      });
      tx.group.findUnique.mockResolvedValue({ name: '#014' });

      await service.create(dto, 1, 99);

      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'NOT_HELD', cancellationId: 'x1' }) }),
      );
      expect(emitter.emit).toHaveBeenCalledWith('unmarked-lesson.not-held', expect.objectContaining({
        outcome: 'CANCELLED', reason: 'Ustoz kasal', decidedById: 99, refundedStudents: 4, refundedAmount: 150000, groupName: '#014',
      }));
    });

    it('does not tell the group about an ordinary cancellation', async () => {
      tx.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 2, name: '#014', exactDays: ['wednesday'] });
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.create.mockResolvedValue({ id: 'x1' });
      await service.create(dto, 1, 99);
      expect(emitter.emit).not.toHaveBeenCalledWith('unmarked-lesson.not-held', expect.anything());
    });
```

(2026-04-15 is a Wednesday.) And in the file's `remove` describe (create one if absent):

```ts
  describe('remove', () => {
    it('re-asks the question of a lesson whose cancellation is deleted', async () => {
      // `prisma` spreads `tx`, so both share these mock objects.
      tx.lessonCancellation.findFirst.mockResolvedValue({ id: 'x1', groupId: 'group-1', date: new Date('2026-04-15T00:00:00.000Z') });
      tx.unmarkedLesson.findFirst.mockResolvedValue({
        id: 'u1', companyId: 1, branchId: 2, groupId: 'group-1', date: new Date('2026-04-15T00:00:00.000Z'),
        lessonStartTime: '16:00', lessonEndTime: '17:30', status: 'NOT_HELD', cancellationId: 'x1',
      });
      tx.group.findUnique.mockResolvedValue({ name: '#014', deletedAt: null });
      tx.user.findMany = jest.fn().mockResolvedValue([{ id: 3 }]);
      tx.comment = { create: jest.fn().mockResolvedValue({ id: 'c2' }) };
      await service.remove('x1', 1, 99, ['CEO']);
      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', taskCommentId: 'c2' }) }),
      );
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/lesson-cancellations/lesson-cancellations.service.spec.ts`
Expected: FAIL — no update / no event.

- [ ] **Step 3: Implement**

Imports:

```ts
import {
  markUnmarkedLessonCancelled,
  reopenAfterCancellationRemoved,
} from '../unmarked-lessons/unmarked-lesson-transitions';
import {
  UNMARKED_LESSON_NOT_HELD,
  type UnmarkedLessonNotHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';
```

In `create`, rename the transaction result: `const { cancellation, released, decision } = await this.prisma.$transaction(`. Inside the callback, directly after the `const released = await this.monthlyChargeService.releaseCancelledLesson(…)` statement, add:

```ts
        // «Dars bo'ldimi?» (spec 2026-09-29 §3.5): a lesson waiting for an
        // answer is now answered «Bo'lmadi», and its task closes — whichever
        // screen cancelled it.
        const decision = await markUnmarkedLessonCancelled(tx, {
          groupId: dto.groupId,
          date,
          cancellationId: cancellation.id,
          actorId: cancelledById,
        });
```

and replace the callback's final `return cancellation;` with `return { cancellation, released, decision };`. After the existing `lesson-cancellation.created` emit, add:

```ts
    if (decision) {
      this.eventEmitter.emit(UNMARKED_LESSON_NOT_HELD, {
        ...decision,
        reason: dto.reason,
        decidedById: cancelledById,
        outcome: 'CANCELLED',
        refundedStudents: released.students,
        refundedAmount: released.refunded,
      } satisfies UnmarkedLessonNotHeldPayload);
    }
```

In `remove`, inside the transaction after the history row:

```ts
      // The cancellation may have been the answer to «Dars bo'ldimi?» — or
      // the only reason a finished lesson was never marked. Ask again.
      await reopenAfterCancellationRemoved(tx, {
        cancellationId: id,
        groupId: cancellation.groupId,
        date: cancellation.date,
        now: new Date(),
      });
```

Update the method's doc comment: "…admins must re-take the attendance manually" → "…the lesson goes back to «Dars bo'ldimi?» (spec 2026-09-29 §3.5); nobody can enter a register for it any other way."

- [ ] **Step 4: Run the spec**

Run: `npx jest src/lesson-cancellations`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/lesson-cancellations/lesson-cancellations.service.ts src/lesson-cancellations/lesson-cancellations.service.spec.ts
npx eslint src/lesson-cancellations --quiet
git add src/lesson-cancellations
git commit -m "feat(lessons): a cancellation answers «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Reschedule answers the question

**Files:**
- Modify: `server/src/lesson-reschedules/lesson-reschedules.service.ts` (`create` 137-165, `createInTransaction` 167-398, `update` ~461-560, `remove` 699-734)
- Test: `server/src/lesson-reschedules/lesson-reschedules.service.spec.ts`

**Interfaces:**
- Consumes: `markUnmarkedLessonRescheduled`, `assertLinkedMakeUpAhead`, `reopenAfterRescheduleRemoved` (Task 9); events (Task 9).
- Produces: `createInTransaction` returns `{ reschedule, decision }`; `create` emits `UNMARKED_LESSON_NOT_HELD` with outcome `RESCHEDULED`.

- [ ] **Step 1: Write the failing tests**

Add to the spec's `tx` object (the `update` and `remove` paths read `findFirst`; their existing tests need the `null` default):

```ts
      unmarkedLesson: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
```

change `tx.group` to `{ findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'A1' }) }`, and give the emitter a handle: declare `let emitter: { emit: jest.Mock };` next to `let tx`, set `emitter = { emit: jest.fn() };` at the top of the outer `beforeEach`, and replace `{ provide: EventEmitter2, useValue: { emit: jest.fn() } }` with `{ provide: EventEmitter2, useValue: emitter }`. Then add this block after `describe('create — override cascade on originalDate', …)` (same arrange as that block; 2026-04-15 is a Wednesday):

```ts
  describe("create — «Dars bo'ldimi?» (ADR-0054)", () => {
    const dto = {
      groupId: 'group-1',
      originalDate: '2026-04-15',
      newDate: '2026-04-22',
      reason: 'Ustoz kasal',
    };
    const pending = {
      id: 'u1',
      companyId: 1,
      branchId: 7,
      groupId: 'group-1',
      date: new Date('2026-04-15T00:00:00.000Z'),
      lessonStartTime: '16:00',
      lessonEndTime: '17:30',
      status: 'PENDING',
      taskCommentId: null,
    };

    beforeEach(() => {
      tx.group.findFirst.mockResolvedValue({
        id: 'group-1',
        branchId: 7,
        name: 'A1',
        exactDays: ['wednesday'],
        roomId: null,
        lessonStartTime: null,
        lessonEndTime: null,
      });
      tx.lessonReschedule.findFirst.mockResolvedValue(null);
      tx.lessonCancellation.findFirst.mockResolvedValue(null);
      tx.lessonReschedule.create = jest
        .fn()
        .mockResolvedValue({ id: 'rs-1', groupId: 'group-1' });
      jest.useFakeTimers({ now: new Date('2026-04-16T09:00:00.000Z'), advanceTimers: true });
    });
    afterEach(() => jest.useRealTimers());

    it('answers a lesson waiting for an answer as moved and tells the group', async () => {
      tx.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.create(dto, 1, 99);
      expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'RESCHEDULED', rescheduleId: 'rs-1' }),
        }),
      );
      expect(emitter.emit).toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.objectContaining({
          outcome: 'RESCHEDULED',
          newDate: '2026-04-22',
          reason: 'Ustoz kasal',
          groupName: 'A1',
        }),
      );
    });

    it('refuses a make-up lesson that has already passed', async () => {
      jest.setSystemTime(new Date('2026-04-23T09:00:00.000Z'));
      tx.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await expect(service.create(dto, 1, 99)).rejects.toThrow(
        "Qo'shimcha dars hali boshlanmagan bo'lishi kerak",
      );
    });

    it('leaves an ordinary reschedule alone', async () => {
      await service.create(dto, 1, 99);
      expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
      expect(emitter.emit).not.toHaveBeenCalledWith(
        'unmarked-lesson.not-held',
        expect.anything(),
      );
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/lesson-reschedules/lesson-reschedules.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Imports:

```ts
import {
  assertLinkedMakeUpAhead,
  markUnmarkedLessonRescheduled,
  reopenAfterRescheduleRemoved,
} from '../unmarked-lessons/unmarked-lesson-transitions';
import {
  UNMARKED_LESSON_NOT_HELD,
  type UnmarkedLessonNotHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';
```

In `createInTransaction`, just before its `return reschedule;`:

```ts
        // «Dars bo'ldimi?» (spec §3.5 B): moving a lesson that waits for an
        // answer answers it — the make-up lesson must still be ahead, and a
        // lesson answered «Bo'ldi» cannot be moved.
        const decision = await markUnmarkedLessonRescheduled(tx, {
          groupId: dto.groupId,
          originalDate,
          rescheduleId: reschedule.id,
          actorId: scheduledById,
          newDate,
          newStartTime: effectiveStart,
          now: new Date(),
        });
```

and change `return reschedule;` to `return { reschedule, decision };`. In `create`:

```ts
    const { reschedule, decision } = await this.createInTransaction(
      dto,
      companyId,
      scheduledById,
      roles,
    );
```

and after the existing emit:

```ts
    if (decision) {
      this.eventEmitter.emit(UNMARKED_LESSON_NOT_HELD, {
        ...decision,
        reason: dto.reason ?? '',
        decidedById: scheduledById,
        outcome: 'RESCHEDULED',
        newDate: dto.newDate,
        newLessonStartTime: dto.newLessonStartTime ?? null,
        newLessonEndTime: dto.newLessonEndTime ?? null,
      } satisfies UnmarkedLessonNotHeldPayload);
    }
```

In `update`, inside the transaction right after the "Both-or-nothing" check:

```ts
        await assertLinkedMakeUpAhead(tx, {
          rescheduleId: existing.id,
          newDate: effectiveNewDate,
          newStartTime: effectiveStartOverride ?? group.lessonStartTime ?? null,
          now: new Date(),
        });
```

In `remove`, inside the transaction after the history row:

```ts
      await reopenAfterRescheduleRemoved(tx, { rescheduleId: id, now: new Date() });
```

- [ ] **Step 4: Run the spec**

Run: `npx jest src/lesson-reschedules`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/lesson-reschedules/lesson-reschedules.service.ts src/lesson-reschedules/lesson-reschedules.service.spec.ts
npx eslint src/lesson-reschedules --quiet
git add src/lesson-reschedules
git commit -m "feat(lessons): moving an unmarked lesson answers «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Deleting a group closes its questions

**Files:**
- Modify: `server/src/groups/groups-write.service.ts:604-610`
- Test: `server/src/groups/groups.service.spec.ts` (`delete` block ~495)

- [ ] **Step 1: Write the failing test**

In `describe('delete')`, add two entries to the `tx` object its `beforeEach` builds (the other delete tests need the empty default):

```ts
        unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) },
        commentAssignee: { updateMany: jest.fn() },
```

then add:

```ts
    it("closes the group's unanswered «Dars bo'ldimi?» tasks", async () => {
      tx.unmarkedLesson.findMany.mockResolvedValue([{ taskCommentId: 'c1' }]);
      await service.delete('group-1', 1, 1001);
      expect(tx.unmarkedLesson.findMany).toHaveBeenCalledWith({
        where: { groupId: 'group-1', status: 'PENDING' },
        select: { taskCommentId: true },
      });
      expect(tx.commentAssignee.updateMany).toHaveBeenCalledWith({
        where: { commentId: 'c1', status: { not: 'DONE' } },
        data: { status: 'DONE', doneAt: expect.any(Date) },
      });
    });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/groups/groups.service.spec.ts -t "Dars bo'ldimi"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Import `{ closeTasksOfDeletedGroup } from '../unmarked-lessons/unmarked-lesson-transitions'` and, inside the delete transaction right after `cascadeGroupDeletion`:

```ts
        // Its «Dars bo'ldimi?» tasks stop asking; the rows stay, unpaid.
        await closeTasksOfDeletedGroup(tx, id);
```

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/groups
npx prettier --write src/groups/groups-write.service.ts src/groups/groups.service.spec.ts
npx eslint src/groups/groups-write.service.ts src/groups/groups.service.spec.ts --quiet
git add src/groups/groups-write.service.ts src/groups/groups.service.spec.ts
git commit -m "feat(groups): a deleted group stops asking «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Validation returns the lesson's effective times

**Files:**
- Modify: `server/src/attendance/attendance-validation.service.ts:175-197`
- Test: `server/src/attendance/attendance.service.spec.ts` (`validateLessonDate` block)

**Interfaces:**
- Produces: `validateLessonDate(...)` returns `{ group, parsedDate, effectiveStartTime: string | null, effectiveEndTime: string | null }`; a Teacher is refused from the end minute on (`>=`), matching the window.

- [ ] **Step 1: Write the failing tests**

In the `lesson time check` describe:

```ts
      it('returns the times the lesson really runs at', async () => {
        const result = await service.validateLessonDate('group-uuid-1', '2026-04-01', undefined, ['Administrator']);
        expect(result).toEqual(expect.objectContaining({ effectiveStartTime: '09:00', effectiveEndTime: '11:00' }));
      });

      it('closes for a Teacher at the end minute itself', async () => {
        const now = tashkentNow();
        const endMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
        const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
        prisma.group.findFirst.mockResolvedValue({
          ...getTodayMockGroup(),
          lessonStartTime: hhmm(Math.max(0, endMinute - 60)),
          lessonEndTime: hhmm(endMinute),
        });
        await expect(
          service.validateLessonDate('group-uuid-1', getTodayStr(), undefined, ['Teacher']),
        ).rejects.toThrow('Dars vaqti tugagan');
      });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/attendance/attendance.service.spec.ts -t "lesson time check"`
Expected: FAIL — no effective times; end minute accepted.

- [ ] **Step 3: Implement**

In `validateLessonDate`, change `if (currentMinutes > lessonEnd) {` to `if (currentMinutes >= lessonEnd) {` and the final `return { group, parsedDate };` to:

```ts
    return {
      group,
      parsedDate,
      effectiveStartTime: effectiveStartTime ?? null,
      effectiveEndTime: effectiveEndTime ?? null,
    };
```

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/attendance src/planned-absences
npx prettier --write src/attendance/attendance-validation.service.ts src/attendance/attendance.service.spec.ts
npx eslint src/attendance/attendance-validation.service.ts src/attendance/attendance.service.spec.ts --quiet
git add src/attendance/attendance-validation.service.ts src/attendance/attendance.service.spec.ts
git commit -m "feat(attendance): validation reports the lesson's real times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Saving attendance — the window and the late register

**Files:**
- Modify (rewrite): `server/src/attendance/attendance-save.service.ts`
- Create: `server/src/attendance/dto/late-attendance.dto.ts`
- Modify: `server/src/attendance/attendance.service.spec.ts` (mock + new `save` tests)
- Create: `server/src/attendance/attendance-save.late.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 8, 9, 13.
- Produces: `AttendanceSaveService.save(...)` (unchanged signature) refuses a new register outside the window or once a question is open; `AttendanceSaveService.saveLate(groupId: string, date: string, dto: LateAttendanceDto, userId: number, roles: string[], companyId: number): Promise<{ message: string; count: number }>`; `class LateAttendanceDto extends SaveAttendanceDto { teacherPayExempt?: boolean; exemptReason?: string }`.

- [ ] **Step 1: Write the DTO**

`dto/late-attendance.dto.ts`:

```ts
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SaveAttendanceDto } from './save-attendance.dto';

/** «Bo'ldi» — the register of a lesson nobody marked in time (ADR-0054). */
export class LateAttendanceDto extends SaveAttendanceDto {
  /** CEO only (Q9): the teacher could not mark it — the lesson pays as usual. */
  @IsOptional()
  @IsBoolean()
  teacherPayExempt?: boolean;

  @ValidateIf((o: LateAttendanceDto) => o.teacherPayExempt === true)
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  exemptReason?: string;
}
```

- [ ] **Step 2: Write the failing tests for `save`**

In `attendance.service.spec.ts`, add to the `prisma` mock:

```ts
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null) },
```

and in `describe('save')` (its clock is pinned to 2026-04-01 10:00 Tashkent; the group meets 09:00–11:00):

```ts
    it('refuses an administrator a new register after the lesson ended', async () => {
      jest.setSystemTime(new Date('2026-04-01T06:00:00.000Z')); // 11:00 Tashkent
      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 10001, student: { balance: 500000 } }]);
      prisma.attendance.findMany.mockResolvedValue([]);
      await expect(
        service.save('group-uuid-1', '2026-04-01', { entries: [{ studentId: 10001, status: 'PRESENT' }] }, 1, ['Administrator'], 1),
      ).rejects.toThrow('Dars tugagan');
      expect(prisma.attendance.upsert).not.toHaveBeenCalled();
    });

    it('refuses the CEO a new register for a past lesson', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 10001, student: { balance: 500000 } }]);
      prisma.attendance.findMany.mockResolvedValue([]);
      // 2026-03-30 is the Monday before the pinned day
      await expect(
        service.save('group-uuid-1', '2026-03-30', { entries: [{ studentId: 10001, status: 'PRESENT' }] }, 1, ['CEO'], 1),
      ).rejects.toThrow('Dars tugagan');
    });

    it("refuses a new register once «Dars bo'ldimi?» was asked", async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 10001, student: { balance: 500000 } }]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.save('group-uuid-1', '2026-04-01', { entries: [{ studentId: 10001, status: 'PRESENT' }] }, 1, ['Administrator'], 1),
      ).rejects.toThrow('Dars tugagan');
    });

    it('still lets an administrator edit a past register', async () => {
      prisma.enrollment.findMany.mockResolvedValue([{ studentId: 10001, student: { balance: 500000 } }]);
      prisma.attendance.findMany.mockResolvedValue([{ id: 'att-1', studentId: 10001, status: 'ABSENT', note: null }]);
      prisma.attendance.upsert.mockResolvedValue({ id: 'att-1', studentId: 10001, status: 'EXCUSED', note: null });
      const result = await service.save('group-uuid-1', '2026-03-30', { entries: [{ studentId: 10001, status: 'EXCUSED' }] }, 1, ['Administrator'], 1);
      expect(result.message).toBe('Davomat muvaffaqiyatli saqlandi');
    });
```

- [ ] **Step 3: Write the failing tests for `saveLate`**

`attendance-save.late.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AttendanceSaveService } from './attendance-save.service';
import { AttendanceValidationService } from './attendance-validation.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';

const lessonDay = new Date('2026-09-28T00:00:00.000Z');
const pending = {
  id: 'u1', companyId: 1, branchId: 2, groupId: 'g1', date: lessonDay, status: 'PENDING',
  teacherPayExempt: false, exemptReason: null, claimedById: null, taskCommentId: 'c1',
  lessonStartTime: '16:00', lessonEndTime: '17:30',
};
const entries = [
  { studentId: 10001, status: 'PRESENT' as const },
  { studentId: 10002, status: 'ABSENT' as const },
];

describe('AttendanceSaveService.saveLate', () => {
  let service: AttendanceSaveService;
  let tx: any;
  let prisma: any;
  let billing: { processAttendanceBilling: jest.Mock };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    tx = {
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(pending), update: jest.fn() },
      attendance: {
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn(({ create }: any) =>
          Promise.resolve({ id: `a-${create.studentId}`, studentId: create.studentId, status: create.status, note: null }),
        ),
        update: jest.fn(),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'e1', studentId: 10001, status: 'ACTIVE', statusChangedAt: null },
          // left the day after the lesson — still on its register
          { id: 'e2', studentId: 10002, status: 'DROPPED', statusChangedAt: new Date('2026-09-29T06:00:00.000Z') },
        ]),
      },
      plannedAbsence: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      commentAssignee: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ca1', seenAt: null }),
        deleteMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }) },
    };
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({ id: 'g1', name: '#014', branchId: 2 }),
        // emitAfterSave reads the group's name and teachers.
        findUnique: jest.fn().mockResolvedValue({ name: '#014', teachers: [] }),
      },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    billing = { processAttendanceBilling: jest.fn() };
    emitter = { emit: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        AttendanceSaveService,
        { provide: PrismaService, useValue: prisma },
        { provide: LessonBillingService, useValue: billing },
        { provide: EventEmitter2, useValue: emitter },
        { provide: AttendanceValidationService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn(), recordStatusChange: jest.fn(), recordRestore: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AttendanceSaveService);
  });

  it('writes the register of who was there that day and answers HELD', async () => {
    const result = await service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1);
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { status: 'HELD', decidedById: 3, decidedAt: expect.any(Date), teacherPayExempt: false },
    });
    expect(tx.attendance.upsert).toHaveBeenCalledTimes(2);
    expect(billing.processAttendanceBilling).toHaveBeenCalledWith(tx, expect.objectContaining({ enrollmentId: 'e2', studentId: 10002 }));
    expect(tx.commentAssignee.update).toHaveBeenCalled(); // task taken and closed
    expect(result.message).toBe('Davomat saqlandi. Ustozga bu dars uchun haq yozilmaydi');
  });

  it('marks the row HELD before billing, so the accrual lock sees it', async () => {
    const order: string[] = [];
    tx.unmarkedLesson.update.mockImplementation(() => order.push('held'));
    billing.processAttendanceBilling.mockImplementation(() => order.push('bill'));
    await service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1);
    expect(order[0]).toBe('held');
  });

  it('tells the teacher, and never thanks them', async () => {
    await service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1);
    expect(emitter.emit).toHaveBeenCalledWith('unmarked-lesson.held', {
      companyId: 1, groupId: 'g1', groupName: '#014', date: '2026-09-28', teacherPayExempt: false,
    });
    expect(emitter.emit).not.toHaveBeenCalledWith('attendance.completed', expect.anything());
  });

  it('needs every student of that day', async () => {
    await expect(
      service.saveLate('g1', '2026-09-28', { entries: [entries[0]] }, 3, ['Administrator'], 1),
    ).rejects.toThrow("barcha o'quvchilarning holati belgilanishi shart");
  });

  it('refuses a lesson that is not waiting for an answer', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({ ...pending, status: 'HELD' });
    await expect(service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1)).rejects.toThrow(NotFoundException);
  });

  it('refuses when a register already exists', async () => {
    tx.attendance.count.mockResolvedValue(2);
    await expect(service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1)).rejects.toThrow(
      'Bu dars uchun davomat allaqachon olingan',
    );
  });

  it('lets only the CEO exempt the teacher', async () => {
    await expect(
      service.saveLate('g1', '2026-09-28', { entries, teacherPayExempt: true, exemptReason: 'Akkaunt yo\'q edi' }, 3, ['Branch Director'], 1),
    ).rejects.toThrow(ForbiddenException);

    prisma.user.findFirst.mockResolvedValue({ id: 1 });
    const result = await service.saveLate('g1', '2026-09-28', { entries, teacherPayExempt: true, exemptReason: "Akkaunt yo'q edi" }, 1, ['CEO'], 1);
    expect(tx.unmarkedLesson.update).toHaveBeenLastCalledWith({
      where: { id: 'u1' },
      data: { status: 'HELD', decidedById: 1, decidedAt: expect.any(Date), teacherPayExempt: true, exemptReason: "Akkaunt yo'q edi" },
    });
    expect(result.message).toBe('Davomat saqlandi');
  });

  it('keeps a pre-rule lesson exempt', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({ ...pending, teacherPayExempt: true });
    await service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1);
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ teacherPayExempt: true }) }),
    );
  });

  it('refuses an administrator when another holds the task', async () => {
    tx.unmarkedLesson.findUnique.mockResolvedValue({ ...pending, claimedById: 4 });
    await expect(service.saveLate('g1', '2026-09-28', { entries }, 3, ['Administrator'], 1)).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 4: Run both specs to see them fail**

Run: `npx jest src/attendance/attendance.service.spec.ts src/attendance/attendance-save.late.spec.ts`
Expected: FAIL — `saveLate` does not exist; window not enforced.

- [ ] **Step 5: Rewrite the service**

Replace `server/src/attendance/attendance-save.service.ts` with:

```ts
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AttendanceMethod,
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonBillingService } from '../billing/lesson-billing.service';
import { whereUserMayAct } from '../common/auth/blocked-user';
import {
  AttendanceEntryDto,
  SaveAttendanceDto,
} from './dto/save-attendance.dto';
import { LateAttendanceDto } from './dto/late-attendance.dto';
import { AttendanceValidationService } from './attendance-validation.service';
import {
  ENDED_REFUSAL,
  newAttendanceWindow,
  tashkentClock,
  windowRefusal,
} from './shared/attendance-window';
import { rosterOnDate } from './shared/roster-on-date';
import { closeLessonTask } from '../unmarked-lessons/lesson-task';
import {
  assertMayAnswer,
  findPendingUnmarkedLesson,
} from '../unmarked-lessons/answer-rules';
import {
  UNMARKED_LESSON_HELD,
  type UnmarkedLessonHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

type Tx = Prisma.TransactionClient;

interface ExistingRecord {
  id: string;
  studentId: number;
  status: AttendanceStatus;
  note: string | null;
}

interface StatusChange {
  studentId: number;
  oldStatus: AttendanceStatus | null;
  newStatus: AttendanceStatus;
}

interface WriteResult {
  count: number;
  existingMap: Map<number, ExistingRecord>;
  statusChanges: StatusChange[];
}

// Saving a full roster (15-30 students) issues many serial queries inside one
// Serializable transaction: attendance upsert + lesson billing + salary
// accrual per entry. 60s gives comfortable headroom for larger groups.
const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 15_000,
  timeout: 60_000,
};

function summary(
  entries: { status: string }[],
  action: string,
  date: string,
) {
  return {
    action,
    sana: date,
    jami: entries.length,
    keldi: entries.filter((e) => e.status === 'PRESENT').length,
    kelmadi: entries.filter((e) => e.status === 'ABSENT').length,
    kechikdi: entries.filter((e) => e.status === 'LATE').length,
    sababli: entries.filter((e) => e.status === 'EXCUSED').length,
  };
}

@Injectable()
export class AttendanceSaveService {
  private readonly logger = new Logger(AttendanceSaveService.name);

  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private lessonBillingService: LessonBillingService,
    private eventEmitter: EventEmitter2,
    private validation: AttendanceValidationService,
  ) {}

  /**
   * Save attendance for a group on a specific date (batch upsert).
   *
   * Balance, prepaid and salary effects are delegated to
   * `LessonBillingService.processAttendanceBilling` — the single source of
   * truth shared with the QR scan flow.
   *
   * A NEW register (no rows yet) is accepted only inside the lesson's own
   * window, for every role (spec 2026-09-29 §3.1). After the lesson it goes
   * through `saveLate`. Editing a register that exists stays open to
   * administrators at any time; a teacher can never edit.
   */
  async save(
    groupId: string,
    date: string,
    dto: SaveAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    const { parsedDate, effectiveStartTime, effectiveEndTime } =
      await this.validation.validateLessonDate(groupId, date, companyId, roles);

    const isTeacherOnly =
      roles.length > 0 && roles.every((r) => r === 'Teacher');

    // branchId is required by the billing pipeline — a stable property of
    // the group, read outside the transaction.
    const groupMeta = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { branchId: true },
    });
    if (!groupMeta) throw new NotFoundException('Guruh topilmadi');

    const results = await this.prisma.$transaction(async (tx) => {
      // Debtors are part of the main roster — anyone may mark them; the
      // payment pipeline settles their unpaid lessons retroactively.
      const enrolled = await tx.enrollment.findMany({
        where: {
          groupId,
          deletedAt: null,
          status: EnrollmentStatus.ACTIVE,
          OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
        },
        select: { id: true, studentId: true },
      });
      const enrollmentIdByStudent = new Map(
        enrolled.map((e) => [e.studentId, e.id]),
      );
      this.assertFullRoster(enrollmentIdByStudent, dto.entries);

      const existingRecords = await tx.attendance.findMany({
        where: { groupId, date: parsedDate },
      });

      // Teacher can take attendance only once — editing is admin-only.
      if (isTeacherOnly && existingRecords.length > 0) {
        throw new BadRequestException(
          "Davomat olib bo'lingan. Tahrirlash uchun administratorga murojaat qiling",
        );
      }
      if (existingRecords.length === 0) {
        await this.assertNewRegisterAllowed(tx, {
          groupId,
          date,
          parsedDate,
          startTime: effectiveStartTime,
          endTime: effectiveEndTime,
        });
      }

      return this.writeEntries(tx, {
        groupId,
        parsedDate,
        branchId: groupMeta.branchId,
        companyId,
        userId,
        isTeacherOnly,
        enrollmentIdByStudent,
        existingRecords,
        entries: dto.entries,
      });
    }, TX_OPTIONS);

    // One history entry per save action (outside the transaction).
    const isUpdate = results.existingMap.size > 0;
    if (isUpdate) {
      await this.entityHistoryService.recordUpdate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        oldValues: summary(
          Array.from(results.existingMap.values()),
          'DAVOMAT_YANGILANDI',
          date,
        ),
        newValues: summary(dto.entries, 'DAVOMAT_YANGILANDI', date),
        changedById: userId,
        companyId,
      });
    } else {
      await this.entityHistoryService.recordCreate({
        entityType: 'GroupAttendance',
        entityId: groupId,
        newValues: summary(dto.entries, 'DAVOMAT_OLINDI', date),
        changedById: userId,
        companyId,
      });
    }

    await this.emitAfterSave({
      groupId,
      date,
      companyId,
      entries: dto.entries,
      statusChanges: results.statusChanges,
      announceCompleted: !isUpdate,
    });

    return { message: 'Davomat muvaffaqiyatli saqlandi', count: results.count };
  }

  /**
   * «Bo'ldi» — the register of a lesson nobody marked before it ended (spec
   * 2026-09-29 §3.4, ADR-0054). The roster is who was in the group that day;
   * the lesson is answered HELD before any billing runs, so
   * `createAccrual`'s lock already sees it and the teacher earns nothing —
   * unless the CEO exempts the lesson, or it predates the rule.
   */
  async saveLate(
    groupId: string,
    date: string,
    dto: LateAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, companyId, deletedAt: null },
      select: { id: true, name: true, branchId: true },
    });
    if (!group) throw new NotFoundException('Guruh topilmadi');
    if (dto.teacherPayExempt) await this.assertCallerIsCeo(userId);

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await findPendingUnmarkedLesson(tx, {
        groupId,
        date: parsedDate,
        companyId,
      });
      await assertMayAnswer(tx, row, userId, roles);

      const already = await tx.attendance.count({
        where: { groupId, date: parsedDate },
      });
      if (already > 0) {
        throw new BadRequestException('Bu dars uchun davomat allaqachon olingan');
      }

      const roster = await rosterOnDate(tx, groupId, parsedDate);
      const enrollmentIdByStudent = new Map(
        roster.map((e) => [e.studentId, e.id]),
      );
      this.assertFullRoster(enrollmentIdByStudent, dto.entries);

      const exempt = row.teacherPayExempt || dto.teacherPayExempt === true;
      await tx.unmarkedLesson.update({
        where: { id: row.id },
        data: {
          status: 'HELD',
          decidedById: userId,
          decidedAt: new Date(),
          teacherPayExempt: exempt,
          ...(dto.teacherPayExempt
            ? { exemptReason: dto.exemptReason?.trim() }
            : {}),
        },
      });

      const written = await this.writeEntries(tx, {
        groupId,
        parsedDate,
        branchId: group.branchId,
        companyId,
        userId,
        isTeacherOnly: false,
        enrollmentIdByStudent,
        existingRecords: [],
        entries: dto.entries,
      });
      await closeLessonTask(tx, row.taskCommentId, userId);
      return { written, exempt };
    }, TX_OPTIONS);

    await this.entityHistoryService.recordCreate({
      entityType: 'GroupAttendance',
      entityId: groupId,
      newValues: {
        ...summary(dto.entries, 'DAVOMAT_KECH_KIRITILDI', date),
        ustozHaqi: result.exempt ? 'yoziladi (CEO istisnosi)' : 'yozilmaydi',
      },
      changedById: userId,
      companyId,
    });

    // No `attendance.completed`: it thanks the teacher for taking the
    // register on time.
    await this.emitAfterSave({
      groupId,
      date,
      companyId,
      entries: dto.entries,
      statusChanges: result.written.statusChanges,
      announceCompleted: false,
    });
    this.eventEmitter.emit(UNMARKED_LESSON_HELD, {
      companyId,
      groupId,
      groupName: group.name,
      date,
      teacherPayExempt: result.exempt,
    } satisfies UnmarkedLessonHeldPayload);

    return {
      message: result.exempt
        ? 'Davomat saqlandi'
        : 'Davomat saqlandi. Ustozga bu dars uchun haq yozilmaydi',
      count: result.written.count,
    };
  }

  /** Every entry must be on the roster, and every roster student must have an entry. */
  private assertFullRoster(
    enrollmentIdByStudent: Map<number, string>,
    entries: AttendanceEntryDto[],
  ): void {
    for (const entry of entries) {
      if (!enrollmentIdByStudent.has(entry.studentId)) {
        throw new BadRequestException(
          `O'quvchi #${entry.studentId} bu guruhga yozilmagan yoki dars sanasi uning boshlanish sanasidan oldin`,
        );
      }
    }
    const submitted = new Set(entries.map((e) => e.studentId));
    const missing = [...enrollmentIdByStudent.keys()].filter(
      (id) => !submitted.has(id),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        `Davomat saqlash uchun barcha o'quvchilarning holati belgilanishi shart. Belgilanmagan o'quvchilar: ${missing.length} ta`,
      );
    }
  }

  /**
   * The window for a new register (§3.1). The lesson-end sweep opens its
   * question in a Serializable transaction that reads attendance; this reads
   * the question in one that writes attendance — so the two cannot both
   * succeed for the same lesson.
   */
  private async assertNewRegisterAllowed(
    tx: Tx,
    a: {
      groupId: string;
      date: string;
      parsedDate: Date;
      startTime: string | null;
      endTime: string | null;
    },
  ): Promise<void> {
    const { todayStr, nowMinutes } = tashkentClock();
    const window = newAttendanceWindow({
      date: a.date,
      todayStr,
      nowMinutes,
      startTime: a.startTime,
      endTime: a.endTime,
    });
    const refusal = windowRefusal(window, {
      date: a.date,
      todayStr,
      startTime: a.startTime,
    });
    if (refusal) throw new BadRequestException(refusal);

    const asked = await tx.unmarkedLesson.findUnique({
      where: { groupId_date: { groupId: a.groupId, date: a.parsedDate } },
      select: { id: true },
    });
    if (asked) throw new BadRequestException(ENDED_REFUSAL);
  }

  /** Q9: only the CEO, read from the database (ADR-0028), exempts a teacher. */
  private async assertCallerIsCeo(userId: number): Promise<void> {
    const ceo = await this.prisma.user.findFirst({
      where: {
        id: userId,
        ...whereUserMayAct(),
        roles: { some: { role: { name: 'CEO' } } },
      },
      select: { id: true },
    });
    if (!ceo) {
      throw new ForbiddenException(
        'Ustozga haq yozilishini faqat CEO belgilay oladi',
      );
    }
  }

  private async writeEntries(
    tx: Tx,
    ctx: {
      groupId: string;
      parsedDate: Date;
      branchId: number;
      companyId: number;
      userId: number;
      isTeacherOnly: boolean;
      enrollmentIdByStudent: Map<number, string>;
      existingRecords: ExistingRecord[];
      entries: AttendanceEntryDto[];
    },
  ): Promise<WriteResult> {
    const existingMap = new Map(
      ctx.existingRecords.map((r) => [r.studentId, r]),
    );
    const saved: ExistingRecord[] = [];
    const statusChanges: StatusChange[] = [];

    for (const entry of ctx.entries) {
      // Teacher can't write notes
      const note = ctx.isTeacherOnly ? undefined : entry.note;
      const oldStatus = existingMap.get(entry.studentId)?.status ?? null;

      const result = await tx.attendance.upsert({
        where: {
          groupId_studentId_date: {
            groupId: ctx.groupId,
            studentId: entry.studentId,
            date: ctx.parsedDate,
          },
        },
        create: {
          groupId: ctx.groupId,
          studentId: entry.studentId,
          date: ctx.parsedDate,
          status: entry.status,
          note: note ?? null,
          markedById: ctx.userId,
          markedMethod: AttendanceMethod.MANUAL,
          companyId: ctx.companyId,
        },
        update: {
          status: entry.status,
          ...(note !== undefined && { note: note ?? null }),
          markedById: ctx.userId,
          markedMethod: AttendanceMethod.MANUAL,
        },
      });
      saved.push(result);
      statusChanges.push({
        studentId: entry.studentId,
        oldStatus,
        newStatus: entry.status,
      });

      // Single billing pipeline shared with QR.
      const enrollmentId = ctx.enrollmentIdByStudent.get(entry.studentId);
      if (enrollmentId) {
        await this.lessonBillingService.processAttendanceBilling(tx, {
          attendanceId: result.id,
          enrollmentId,
          studentId: entry.studentId,
          groupId: ctx.groupId,
          branchId: ctx.branchId,
          lessonDate: ctx.parsedDate,
          oldStatus,
          newStatus: entry.status,
          companyId: ctx.companyId,
          performedById: ctx.userId,
        });
      }
    }

    await this.consumePlannedAbsences(tx, ctx.groupId, ctx.parsedDate, saved);
    return { count: saved.length, existingMap, statusChanges };
  }

  /**
   * Pre-marks for the date are consumed once the real register is saved, so
   * they stop pre-filling the form. A pre-marked student saved as EXCUSED
   * with an empty note gets an "Oldindan: sababli/sababsiz" marker (teachers
   * cannot write notes). An existing note is never overwritten.
   */
  private async consumePlannedAbsences(
    tx: Tx,
    groupId: string,
    date: Date,
    saved: ExistingRecord[],
  ): Promise<void> {
    const planned = await tx.plannedAbsence.findMany({
      where: { groupId, date, consumedAt: null },
      select: { studentId: true, kind: true, note: true },
    });
    if (planned.length === 0) return;
    await tx.plannedAbsence.updateMany({
      where: { groupId, date, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const byStudent = new Map(saved.map((r) => [r.studentId, r]));
    for (const p of planned) {
      const row = byStudent.get(p.studentId);
      if (!row || row.status !== AttendanceStatus.EXCUSED) continue;
      if (row.note && row.note.trim().length > 0) continue;
      const label = p.kind === 'SABABSIZ' ? 'sababsiz' : 'sababli';
      const note = p.note ? `Oldindan: ${label} — ${p.note}` : `Oldindan: ${label}`;
      await tx.attendance.update({ where: { id: row.id }, data: { note } });
    }
  }

  /**
   * `attendance.completed` goes out only for the first save of the day
   * (single-shot semantics the listener relies on). Per-student
   * `attendance.student.recorded` fires for every entry whose status changed.
   */
  private async emitAfterSave(args: {
    groupId: string;
    date: string;
    companyId: number;
    entries: AttendanceEntryDto[];
    statusChanges: StatusChange[];
    announceCompleted: boolean;
  }): Promise<void> {
    if (args.entries.length === 0) return;
    try {
      const groupInfo = await this.prisma.group.findUnique({
        where: { id: args.groupId },
        select: { name: true, teachers: { select: { teacherId: true } } },
      });
      if (!groupInfo) return;
      if (args.announceCompleted) {
        this.eventEmitter.emit('attendance.completed', {
          groupId: args.groupId,
          groupName: groupInfo.name,
          date: args.date,
          teacherIds: groupInfo.teachers.map((t) => t.teacherId),
          companyId: args.companyId,
          stats: {
            present: args.entries.filter((e) => e.status === 'PRESENT').length,
            absent: args.entries.filter((e) => e.status === 'ABSENT').length,
            late: args.entries.filter((e) => e.status === 'LATE').length,
            excused: args.entries.filter((e) => e.status === 'EXCUSED').length,
          },
        });
      }
      for (const change of args.statusChanges) {
        if (change.oldStatus === change.newStatus) continue;
        this.eventEmitter.emit('attendance.student.recorded', {
          studentId: change.studentId,
          groupId: args.groupId,
          groupName: groupInfo.name,
          date: args.date,
          oldStatus: change.oldStatus,
          newStatus: change.newStatus,
          companyId: args.companyId,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to emit attendance events for group ${args.groupId}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
```

- [ ] **Step 6: Run the attendance suite**

Run: `npx jest src/attendance`
Expected: PASS (existing save tests keep passing because their clock is pinned inside the lesson — see Task 13's describe).

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write src/attendance/attendance-save.service.ts src/attendance/dto/late-attendance.dto.ts src/attendance/attendance.service.spec.ts src/attendance/attendance-save.late.spec.ts
npx eslint src/attendance --quiet
git add src/attendance
git commit -m "feat(attendance): close new registers after the lesson; add the late register

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: QR sessions follow the window

**Files:**
- Modify: `server/src/attendance/qr-attendance-session.service.ts:30-45`
- Test: `server/src/attendance/qr-attendance.service.spec.ts`

- [ ] **Step 1: Write the failing test and fix the fixture**

In the spec: make the `attendanceService.validateLessonDate` mock resolve `{ group: validatedGroup, parsedDate: new Date('2026-04-03T00:00:00.000Z'), effectiveStartTime: '09:00', effectiveEndTime: '11:00' }`; add `unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null) }` to the prisma mock; in `describe('startSession')` add

```ts
    beforeEach(() => {
      jest.useFakeTimers({ now: new Date('2026-04-03T05:00:00.000Z'), advanceTimers: true });
    });
    afterEach(() => jest.useRealTimers());

    it('refuses a session after the lesson ended', async () => {
      jest.setSystemTime(new Date('2026-04-03T06:00:00.000Z')); // 11:00 Tashkent
      await expect(service.startSession('group-1', '2026-04-03', 1, 1, ['Administrator'])).rejects.toThrow('Dars tugagan');
    });

    it("refuses a session once «Dars bo'ldimi?» was asked", async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(service.startSession('group-1', '2026-04-03', 1, 1, ['Administrator'])).rejects.toThrow('Dars tugagan');
    });
```

(`prisma` is the spec's prisma mock variable.)

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/attendance/qr-attendance.service.spec.ts`
Expected: FAIL on the two new tests.

- [ ] **Step 3: Implement**

Import `{ ENDED_REFUSAL, newAttendanceWindow, tashkentClock, windowRefusal } from './shared/attendance-window'` and replace the validation destructuring:

```ts
    const {
      group: validatedGroup,
      parsedDate,
      effectiveStartTime,
      effectiveEndTime,
    } = await this.attendanceService.validateLessonDate(groupId, date, companyId, roles);

    // A QR session writes a new register — the same window as a manual one
    // (spec 2026-09-29 §3.1), for every role.
    const { todayStr, nowMinutes } = tashkentClock();
    const refusal = windowRefusal(
      newAttendanceWindow({
        date,
        todayStr,
        nowMinutes,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
      }),
      { date, todayStr, startTime: effectiveStartTime },
    );
    if (refusal) throw new BadRequestException(refusal);
    const asked = await this.prisma.unmarkedLesson.findUnique({
      where: { groupId_date: { groupId, date: parsedDate } },
      select: { id: true },
    });
    if (asked) throw new BadRequestException(ENDED_REFUSAL);
```

(`BadRequestException` is already imported by the file; add it to the import if not.)

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/attendance/qr-attendance.service.spec.ts
npx prettier --write src/attendance/qr-attendance-session.service.ts src/attendance/qr-attendance.service.spec.ts
npx eslint src/attendance/qr-attendance-session.service.ts src/attendance/qr-attendance.service.spec.ts --quiet
git add src/attendance/qr-attendance-session.service.ts src/attendance/qr-attendance.service.spec.ts
git commit -m "feat(attendance): QR sessions follow the same window

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Opening questions and answering «Bo'lmadi»

**Files:**
- Create: `server/src/attendance/unmarked-lessons.service.ts`, `server/src/attendance/dto/not-held.dto.ts`
- Test: `server/src/attendance/unmarked-lessons.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 8, 9; `LessonCancellationsService.create`, `LessonReschedulesService.create`; `HolidaysService.findActiveHolidayCovering(date, branchId)`, `buildHolidayDateSet(start, end)`.
- Produces: `interface OpenedLesson extends EndedLesson { date: string }`; `UnmarkedLessonsService.openForEndedLessons(now?: Date): Promise<OpenedLesson[]>`; `UnmarkedLessonsService.answerNotHeld(args: { groupId: string; date: string; dto: NotHeldDto; userId: number; roles: string[]; companyId: number })`; `class NotHeldDto { reason: string; action: 'CANCEL' | 'RESCHEDULE'; newDate?: string; newLessonStartTime?: string; newLessonEndTime?: string; newRoomId?: string }`.

- [ ] **Step 1: Write the DTO**

```ts
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** «Bo'lmadi» (spec 2026-09-29 §3.5): cancel with a refund, or move. */
export class NotHeldDto {
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  reason: string;

  @IsIn(['CANCEL', 'RESCHEDULE'])
  action: 'CANCEL' | 'RESCHEDULE';

  @ValidateIf((o: NotHeldDto) => o.action === 'RESCHEDULE')
  @IsDateString()
  newDate?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'newLessonStartTime must be HH:MM' })
  newLessonStartTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM, { message: 'newLessonEndTime must be HH:MM' })
  newLessonEndTime?: string;

  @IsOptional()
  @IsString()
  newRoomId?: string;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UnmarkedLessonsService } from './unmarked-lessons.service';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonCancellationsService } from '../lesson-cancellations/lesson-cancellations.service';
import { LessonReschedulesService } from '../lesson-reschedules/lesson-reschedules.service';

// 2026-09-30 (Wednesday) 18:00 Tashkent
const NOW = new Date('2026-09-30T13:00:00.000Z');
const today = new Date('2026-09-30T00:00:00.000Z');

describe('UnmarkedLessonsService', () => {
  let service: UnmarkedLessonsService;
  let prisma: any;
  let tx: any;
  let holidays: any;
  let cancellations: { create: jest.Mock };
  let reschedules: { create: jest.Mock };

  beforeEach(async () => {
    tx = {
      attendance: { findFirst: jest.fn().mockResolvedValue(null) },
      unmarkedLesson: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 3 }]) },
      comment: { create: jest.fn().mockResolvedValue({ id: 'c1' }) },
    };
    prisma = {
      group: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'g1', name: '#014', companyId: 1, branchId: 2, exactDays: ['wednesday'],
            lessonStartTime: '16:00', lessonEndTime: '17:30', startDate: null, endDate: null,
          },
        ]),
      },
      lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
      lessonCancellation: { findMany: jest.fn().mockResolvedValue([]) },
      unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    holidays = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
    };
    cancellations = { create: jest.fn().mockResolvedValue({ id: 'x1' }) };
    reschedules = { create: jest.fn().mockResolvedValue({ id: 'r1' }) };

    const module = await Test.createTestingModule({
      providers: [
        UnmarkedLessonsService,
        { provide: PrismaService, useValue: prisma },
        { provide: HolidaysService, useValue: holidays },
        { provide: EntityHistoryService, useValue: { recordCreate: jest.fn() } },
        { provide: LessonCancellationsService, useValue: cancellations },
        { provide: LessonReschedulesService, useValue: reschedules },
      ],
    }).compile();
    service = module.get(UnmarkedLessonsService);
  });

  describe('openForEndedLessons', () => {
    it('opens a question and a task for an ended, unmarked lesson', async () => {
      const opened = await service.openForEndedLessons(NOW);
      expect(opened).toEqual([
        expect.objectContaining({ groupId: 'g1', date: '2026-09-30', startTime: '16:00', endTime: '17:30' }),
      ]);
      expect(tx.unmarkedLesson.create).toHaveBeenCalledWith({
        data: {
          companyId: 1, branchId: 2, groupId: 'g1', date: today,
          lessonStartTime: '16:00', lessonEndTime: '17:30', taskCommentId: 'c1',
        },
      });
      expect(tx.comment.create.mock.calls[0][0].data.dueDate.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    });

    it('opens nothing for a lesson already marked', async () => {
      tx.attendance.findFirst.mockResolvedValue({ id: 'a1' });
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
      expect(tx.unmarkedLesson.create).not.toHaveBeenCalled();
    });

    it('opens nothing twice', async () => {
      prisma.unmarkedLesson.findMany.mockResolvedValue([{ groupId: 'g1' }]);
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('opens nothing on a branch holiday', async () => {
      holidays.findActiveHolidayCovering.mockResolvedValue({ name: 'Bayram' });
      expect(await service.openForEndedLessons(NOW)).toEqual([]);
    });

    it('keeps going when one lesson fails', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', name: '#014', companyId: 1, branchId: 2, exactDays: ['wednesday'], lessonStartTime: '16:00', lessonEndTime: '17:30', startDate: null, endDate: null },
        { id: 'g2', name: '#015', companyId: 1, branchId: 2, exactDays: ['wednesday'], lessonStartTime: '16:00', lessonEndTime: '17:30', startDate: null, endDate: null },
      ]);
      prisma.$transaction.mockImplementationOnce(() => Promise.reject(new Error('P2034'))).mockImplementation((cb: any) => cb(tx));
      expect(await service.openForEndedLessons(NOW)).toEqual([expect.objectContaining({ groupId: 'g2' })]);
    });
  });

  describe('answerNotHeld', () => {
    const pending = { id: 'u1', companyId: 1, status: 'PENDING', claimedById: null };

    it('cancels through the cancellation service', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.answerNotHeld({
        groupId: 'g1', date: '2026-09-28', userId: 3, roles: ['Administrator'], companyId: 1,
        dto: { reason: 'Ustoz kasal', action: 'CANCEL' },
      });
      expect(cancellations.create).toHaveBeenCalledWith({ groupId: 'g1', date: '2026-09-28', reason: 'Ustoz kasal' }, 1, 3, ['Administrator']);
    });

    it('moves through the reschedule service', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue(pending);
      await service.answerNotHeld({
        groupId: 'g1', date: '2026-09-28', userId: 3, roles: ['Administrator'], companyId: 1,
        dto: { reason: 'Ustoz kasal', action: 'RESCHEDULE', newDate: '2026-10-02', newLessonStartTime: '10:00', newLessonEndTime: '11:30' },
      });
      expect(reschedules.create).toHaveBeenCalledWith(
        { groupId: 'g1', originalDate: '2026-09-28', newDate: '2026-10-02', newLessonStartTime: '10:00', newLessonEndTime: '11:30', newRoomId: undefined, reason: 'Ustoz kasal' },
        1, 3, ['Administrator'],
      );
    });

    it('404s for a lesson not waiting for an answer', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ ...pending, status: 'HELD' });
      await expect(
        service.answerNotHeld({ groupId: 'g1', date: '2026-09-28', userId: 3, roles: ['Administrator'], companyId: 1, dto: { reason: 'x', action: 'CANCEL' } }),
      ).rejects.toThrow(NotFoundException);
    });

    it('stops an administrator when another holds the task', async () => {
      prisma.unmarkedLesson.findUnique.mockResolvedValue({ ...pending, claimedById: 4 });
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' });
      await expect(
        service.answerNotHeld({ groupId: 'g1', date: '2026-09-28', userId: 3, roles: ['Administrator'], companyId: 1, dto: { reason: 'x', action: 'CANCEL' } }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npx jest src/attendance/unmarked-lessons.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { GroupStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { EntityHistoryService } from '../common/entity-history';
import { LessonCancellationsService } from '../lesson-cancellations/lesson-cancellations.service';
import { LessonReschedulesService } from '../lesson-reschedules/lesson-reschedules.service';
import {
  addDaysToDateStr,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
import { tashkentClock } from './shared/attendance-window';
import { endedLessonsOn, type EndedLesson } from './shared/ended-lessons';
import {
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from '../unmarked-lessons/lesson-task';
import {
  assertMayAnswer,
  findPendingUnmarkedLesson,
} from '../unmarked-lessons/answer-rules';
import { NotHeldDto } from './dto/not-held.dto';

export interface OpenedLesson extends EndedLesson {
  date: string;
}

/**
 * «Dars bo'ldimi?» (spec 2026-09-29, ADR-0054). Opens the question for every
 * lesson that ended with no register, and answers «Bo'lmadi» through the
 * cancellation and reschedule services — whose own transactions close the
 * question, so a cancellation made on the group page answers it too.
 */
@Injectable()
export class UnmarkedLessonsService {
  private readonly logger = new Logger(UnmarkedLessonsService.name);

  constructor(
    private prisma: PrismaService,
    private holidays: HolidaysService,
    private history: EntityHistoryService,
    private cancellations: LessonCancellationsService,
    private reschedules: LessonReschedulesService,
  ) {}

  async openForEndedLessons(now: Date = new Date()): Promise<OpenedLesson[]> {
    const { todayStr, nowMinutes } = tashkentClock(now);
    const today = utcMidnightFromDateStr(todayStr);

    const [groups, reschedules, cancellations, existing] = await Promise.all([
      this.prisma.group.findMany({
        where: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
        select: {
          id: true,
          name: true,
          companyId: true,
          branchId: true,
          exactDays: true,
          lessonStartTime: true,
          lessonEndTime: true,
          startDate: true,
          endDate: true,
        },
      }),
      this.prisma.lessonReschedule.findMany({
        where: {
          deletedAt: null,
          OR: [{ originalDate: today }, { newDate: today }],
        },
        select: {
          groupId: true,
          originalDate: true,
          newDate: true,
          newLessonStartTime: true,
          newLessonEndTime: true,
        },
      }),
      this.prisma.lessonCancellation.findMany({
        where: { deletedAt: null, date: today },
        select: { groupId: true },
      }),
      this.prisma.unmarkedLesson.findMany({
        where: { date: today },
        select: { groupId: true },
      }),
    ]);
    if (groups.length === 0) return [];

    const holidayBranches = new Set<number>();
    for (const branchId of new Set(groups.map((g) => g.branchId))) {
      if (await this.holidays.findActiveHolidayCovering(today, branchId)) {
        holidayBranches.add(branchId);
      }
    }
    const asked = new Set(existing.map((e) => e.groupId));
    const ended = endedLessonsOn({
      todayStr,
      nowMinutes,
      groups,
      reschedules,
      cancelledGroupIds: new Set(cancellations.map((c) => c.groupId)),
      isHoliday: (branchId) => holidayBranches.has(branchId),
    }).filter((lesson) => !asked.has(lesson.groupId));
    if (ended.length === 0) return [];

    const holidaysAhead = await this.holidays.buildHolidayDateSet(
      today,
      utcMidnightFromDateStr(addDaysToDateStr(todayStr, 14)),
    );
    const dueAt = taskDueAt(nextWorkingDay(todayStr, holidaysAhead));

    const opened: OpenedLesson[] = [];
    for (const lesson of ended) {
      try {
        if (await this.openOne(lesson, today, todayStr, dueAt)) {
          opened.push({ ...lesson, date: todayStr });
        }
      } catch (err) {
        this.logger.error(
          `Could not open «Dars bo'ldimi?» for ${lesson.groupId} ${todayStr}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return opened;
  }

  /**
   * Serializable, and it READS attendance: a register saved at the same
   * moment reads the question in its own Serializable transaction, so one of
   * the two aborts (spec §3.1) — a lesson is never both marked and asked.
   */
  private openOne(
    lesson: EndedLesson,
    today: Date,
    todayStr: string,
    dueAt: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const marked = await tx.attendance.findFirst({
          where: { groupId: lesson.groupId, date: today },
          select: { id: true },
        });
        if (marked) return false;
        const open = await tx.unmarkedLesson.findUnique({
          where: { groupId_date: { groupId: lesson.groupId, date: today } },
          select: { id: true },
        });
        if (open) return false;

        const taskCommentId = await createLessonTask(tx, {
          companyId: lesson.companyId,
          branchId: lesson.branchId,
          groupId: lesson.groupId,
          groupName: lesson.groupName,
          dateStr: todayStr,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          dueAt,
        });
        await tx.unmarkedLesson.create({
          data: {
            companyId: lesson.companyId,
            branchId: lesson.branchId,
            groupId: lesson.groupId,
            date: today,
            lessonStartTime: lesson.startTime,
            lessonEndTime: lesson.endTime,
            taskCommentId,
          },
        });
        await this.history.recordCreate({
          entityType: 'Group',
          entityId: lesson.groupId,
          newValues: {
            action: 'DAVOMAT_OLINMADI',
            sana: todayStr,
            vaqt: `${lesson.startTime}–${lesson.endTime}`,
          },
          companyId: lesson.companyId,
          tx,
        });
        return true;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 15_000,
      },
    );
  }

  /** «Bo'lmadi»: cancel (money back, ADR-0053) or move to a later lesson. */
  async answerNotHeld(args: {
    groupId: string;
    date: string;
    dto: NotHeldDto;
    userId: number;
    roles: string[];
    companyId: number;
  }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
      throw new BadRequestException(
        "Noto'g'ri sana formati. YYYY-MM-DD formatda kiriting",
      );
    }
    const row = await findPendingUnmarkedLesson(this.prisma, {
      groupId: args.groupId,
      date: utcMidnightFromDateStr(args.date),
      companyId: args.companyId,
    });
    await assertMayAnswer(this.prisma, row, args.userId, args.roles);

    if (args.dto.action === 'CANCEL') {
      return this.cancellations.create(
        { groupId: args.groupId, date: args.date, reason: args.dto.reason },
        args.companyId,
        args.userId,
        args.roles,
      );
    }
    if (!args.dto.newDate) {
      throw new BadRequestException("Qo'shimcha dars sanasini tanlang");
    }
    return this.reschedules.create(
      {
        groupId: args.groupId,
        originalDate: args.date,
        newDate: args.dto.newDate,
        newLessonStartTime: args.dto.newLessonStartTime,
        newLessonEndTime: args.dto.newLessonEndTime,
        newRoomId: args.dto.newRoomId,
        reason: args.dto.reason,
      },
      args.companyId,
      args.userId,
      args.roles,
    );
  }
}
```

- [ ] **Step 5: Run it**

Run: `npx jest src/attendance/unmarked-lessons.service.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Format, lint, commit**

```bash
npx prettier --write src/attendance/unmarked-lessons.service.ts src/attendance/unmarked-lessons.service.spec.ts src/attendance/dto/not-held.dto.ts
npx eslint src/attendance/unmarked-lessons.service.ts src/attendance/unmarked-lessons.service.spec.ts src/attendance/dto/not-held.dto.ts --quiet
git add src/attendance/unmarked-lessons.service.ts src/attendance/unmarked-lessons.service.spec.ts src/attendance/dto/not-held.dto.ts
git commit -m "feat(attendance): open «Dars bo'ldimi?» at lesson end and answer «Bo'lmadi»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Routes, late roster, calendar info, module wiring

**Files:**
- Create: `server/src/unmarked-lessons/unmarked-lesson-info.ts` (+ `unmarked-lesson-info.spec.ts`)
- Modify: `server/src/attendance/attendance.controller.ts`, `attendance.service.ts`, `attendance-read.service.ts` (`getByDate` 549-733, `getLessonCalendar` 303-543), `attendance.module.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (the "Lessons" block ~225-256)
- Create: `server/src/attendance/attendance.controller.spec.ts`

**Interfaces:**
- Produces: `interface UnmarkedLessonInfo { id: string; status: UnmarkedLessonStatus; claimedBy: { id: number; firstName: string; lastName: string } | null }`; `loadUnmarkedLessonInfos(db: Pick<PrismaService, 'unmarkedLesson' | 'user'>, where: Prisma.UnmarkedLessonWhereInput): Promise<Map<string, UnmarkedLessonInfo>>` keyed by `lessonKey`; `POST /attendance/:groupId/date/:date/late` (body `LateAttendanceDto`); `POST /attendance/:groupId/date/:date/not-held` (body `NotHeldDto`); `GET /attendance/:groupId/date/:date?late=1` returns the roster of that day (non-teachers only); calendar cells gain `unmarked: UnmarkedLessonInfo | null`.

- [ ] **Step 1: Write the info helper and its test**

`unmarked-lesson-info.spec.ts`:

```ts
import { loadUnmarkedLessonInfos } from './unmarked-lesson-info';

it('keys each lesson and names who took it', async () => {
  const db = {
    unmarkedLesson: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'u1', groupId: 'g1', date: new Date('2026-09-28T00:00:00.000Z'), status: 'PENDING', claimedById: 3 },
        { id: 'u2', groupId: 'g2', date: new Date('2026-09-28T00:00:00.000Z'), status: 'HELD', claimedById: null },
      ]),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 3, firstName: 'Ali', lastName: 'Valiyev' }]) },
  } as any;
  const infos = await loadUnmarkedLessonInfos(db, { groupId: { in: ['g1', 'g2'] } });
  expect(infos.get('g1:2026-09-28')).toEqual({ id: 'u1', status: 'PENDING', claimedBy: { id: 3, firstName: 'Ali', lastName: 'Valiyev' } });
  expect(infos.get('g2:2026-09-28')).toEqual({ id: 'u2', status: 'HELD', claimedBy: null });
});
```

`unmarked-lesson-info.ts`:

```ts
import type { Prisma, UnmarkedLessonStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { lessonKey } from './forfeited-lessons';

export interface UnmarkedLessonInfo {
  id: string;
  status: UnmarkedLessonStatus;
  claimedBy: { id: number; firstName: string; lastName: string } | null;
}

/** What the schedule and the group calendar draw for each asked lesson. */
export async function loadUnmarkedLessonInfos(
  db: Pick<PrismaService, 'unmarkedLesson' | 'user'>,
  where: Prisma.UnmarkedLessonWhereInput,
): Promise<Map<string, UnmarkedLessonInfo>> {
  const rows = await db.unmarkedLesson.findMany({
    where,
    select: { id: true, groupId: true, date: true, status: true, claimedById: true },
  });
  const claimerIds = [
    ...new Set(rows.map((r) => r.claimedById).filter((id): id is number => id !== null)),
  ];
  const claimers = claimerIds.length
    ? await db.user.findMany({
        where: { id: { in: claimerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const byId = new Map(claimers.map((u) => [u.id, u]));
  return new Map(
    rows.map((r) => [
      lessonKey(r.groupId, r.date),
      {
        id: r.id,
        status: r.status,
        claimedBy: r.claimedById !== null ? (byId.get(r.claimedById) ?? null) : null,
      },
    ]),
  );
}
```

Run: `npx jest src/unmarked-lessons/unmarked-lesson-info.spec.ts` — Expected: PASS.

- [ ] **Step 2: Late roster in `getByDate`**

In `attendance-read.service.ts` import `{ rosterOnDate } from './shared/roster-on-date'` and `{ loadUnmarkedLessonInfos } from '../unmarked-lessons/unmarked-lesson-info'`. Add a fifth parameter `late = false` to `getByDate`, and replace the `enrollments` query's `where` with:

```ts
    // `late`: the register of a lesson nobody marked in time lists who was in
    // the group THAT day (spec 2026-09-29 §3.4), not who is in it now.
    const lateIds = late
      ? (await rosterOnDate(this.prisma, groupId, parsedDate)).map((e) => e.id)
      : null;
    const enrollments = await this.prisma.enrollment.findMany({
      where: lateIds
        ? { id: { in: lateIds } }
        : {
            groupId,
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
            OR: [{ startDate: null }, { startDate: { lte: parsedDate } }],
          },
```

(keep the rest of the query — `select` and `orderBy` — unchanged).

- [ ] **Step 3: Calendar cells carry the question**

In `getLessonCalendar`, just before `const totalStudents = group._count.enrollments;` add:

```ts
    const unmarked = await loadUnmarkedLessonInfos(this.prisma, {
      groupId,
      date: { gte: monthStartDate, lte: monthEndDate },
    });
```

and in the `cells` map add the field after `cancellationReason: draft.cancellationReason,`:

```ts
        unmarked: unmarked.get(`${groupId}:${dateStr}`) ?? null,
```

Add `unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) }` to the prisma mock of `attendance.service.spec.ts` (the calendar tests need it).

- [ ] **Step 4: Facade and controller**

`attendance.service.ts` — import `LateAttendanceDto` and change/add:

```ts
  getByDate(
    groupId: string,
    date: string,
    companyId?: number,
    roles?: string[],
    late = false,
  ) {
    return this.read.getByDate(groupId, date, companyId, roles, late);
  }

  saveLate(
    groupId: string,
    date: string,
    dto: LateAttendanceDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    return this.saveService.saveLate(groupId, date, dto, userId, roles, companyId);
  }
```

`attendance.controller.ts` — inject `private unmarkedLessons: UnmarkedLessonsService`, import `LateAttendanceDto`, `NotHeldDto`, `UnmarkedLessonsService`. In `getByDate` add a last parameter `@Query('late') late?: string` and change its return to:

```ts
    const isTeacherOnly = roles.length > 0 && roles.every((r) => r === 'Teacher');
    return this.attendanceService.getByDate(
      groupId,
      date,
      companyId,
      roles,
      late === '1' && !isTeacherOnly,
    );
```

After `save`, add:

```ts
  /** «Bo'ldi» — the late register of a lesson nobody marked (ADR-0054). */
  @Post(':groupId/date/:date/late')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  async saveLate(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: LateAttendanceDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    return this.attendanceService.saveLate(groupId, date, dto, userId, roles, companyId);
  }

  /** «Bo'lmadi» — cancel with a refund, or move (spec 2026-09-29 §3.5). */
  @Post(':groupId/date/:date/not-held')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  async notHeld(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: NotHeldDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await this.verifyGroupAccess(groupId, roles, userId, date);
    return this.unmarkedLessons.answerNotHeld({ groupId, date, dto, userId, roles, companyId });
  }
```

`attendance.module.ts` — add `LessonCancellationsModule` and `LessonReschedulesModule` to `imports`, `UnmarkedLessonsService` to `providers`.

- [ ] **Step 5: Route manifest**

In `branch-route-policy.ts`, in the "Lessons" block's `routes`, after `'POST /attendance/:groupId/date/:date',` add:

```ts
      'POST /attendance/:groupId/date/:date/late',
      'POST /attendance/:groupId/date/:date/not-held',
```

- [ ] **Step 6: Controller guard spec**

`attendance.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AttendanceController } from './attendance.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { ROLES_KEY } from '../common/decorators';

describe('AttendanceController — «Dars bo\'ldimi?» routes', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const context = (handler: unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => AttendanceController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;

  it.each(['saveLate', 'notHeld'] as const)('%s is limited to CEO, Branch Director, Administrator', (name) => {
    expect(reflector.get<string[]>(ROLES_KEY, AttendanceController.prototype[name])).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
  });

  it.each(['CEO', 'Branch Director', 'Administrator'])('lets %s answer', (role) => {
    expect(guard.canActivate(context(AttendanceController.prototype.saveLate, [role]))).toBe(true);
  });

  it.each(['Teacher', 'Cashier'])('stops %s', (role) => {
    expect(() => guard.canActivate(context(AttendanceController.prototype.notHeld, [role]))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 7: Run everything touched**

```bash
npx jest src/attendance src/unmarked-lessons src/common/auth/branch-route-policy.spec.ts src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: PASS; exit 0. (`event-wiring.spec.ts` fails until Task 19 and Task 22 add listeners for `unmarked-lesson.held` / `unmarked-lesson.not-held`; if it fails here only on those two names, continue — Task 22's final run must be green.)

- [ ] **Step 8: Format, lint, commit**

```bash
npx prettier --write src/unmarked-lessons/unmarked-lesson-info.ts src/unmarked-lessons/unmarked-lesson-info.spec.ts src/attendance/attendance.controller.ts src/attendance/attendance.controller.spec.ts src/attendance/attendance.service.ts src/attendance/attendance-read.service.ts src/attendance/attendance.module.ts src/attendance/attendance.service.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/attendance src/unmarked-lessons src/common/auth/branch-route-policy.ts --quiet
git add src/unmarked-lessons src/attendance src/common/auth/branch-route-policy.ts
git commit -m "feat(attendance): routes for «Bo'ldi» and «Bo'lmadi», late roster, calendar info

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: The reminder cron opens the questions

**Files:**
- Modify: `server/src/attendance/attendance-reminder.service.ts`
- Test: `server/src/attendance/attendance-reminder.service.spec.ts`

**Interfaces:**
- Consumes: `UnmarkedLessonsService.openForEndedLessons()` (Task 16).
- Produces: `tick()` runs the sweep first; a new `@Cron('0 0 23 * * *')` `closeDay()`; the lesson-end messages are sent by the sweep (for every opened lesson, whatever its end time), not by the `end` trigger.

- [ ] **Step 1: Write the failing tests**

In the spec: add `{ provide: UnmarkedLessonsService, useValue: unmarked }` to the providers, with `unmarked = { openForEndedLessons: jest.fn().mockResolvedValue([]) }` declared in `beforeEach`; add `findUnique: jest.fn()` to `prisma.group`. Replace the test "notifies teacher + admins at lessonEndTime when attendance missing" with:

```ts
    it('leaves the lesson end to the sweep', async () => {
      const group = makeGroup();
      await (service as any).handleGroup(group, 10 * 60 + 30, '2026-09-30');
      expect(notificationsService.create).not.toHaveBeenCalled();
    });
```

and add:

```ts
  describe('sweep', () => {
    it('tells the teachers and administrators of every lesson it opened', async () => {
      unmarked.openForEndedLessons.mockResolvedValue([
        { groupId: 'group-1', groupName: 'Deutsch A1', companyId: 100, branchId: 1, startTime: '09:00', endTime: '10:30', date: '2026-09-30' },
      ]);
      prisma.group.findUnique.mockResolvedValue(makeGroup());
      prisma.user.findMany.mockResolvedValue([{ id: 30001, firstName: 'Admin', lastName: 'One', telegramChatId: null }]);

      await service.closeDay();

      const types = notificationsService.create.mock.calls.map((c: any[]) => c[0].type);
      expect(types).toEqual([NotificationType.ATTENDANCE_MISSING_TEACHER, NotificationType.ATTENDANCE_MISSING_ADMIN]);
      const teacherText = notificationsService.create.mock.calls[0][0].message as string;
      expect(teacherText).toContain('Bu dars uchun haq yozilmaydi');
      const adminText = notificationsService.create.mock.calls[1][0].message as string;
      expect(adminText).toContain("Tizimda topshiriq ochildi: dars bo'ldimi?");
      expect(adminText).toContain('https://admin.dafzentrum.uz/tasks');
    });

    it('warns the teacher about pay half an hour before the end', async () => {
      const group = makeGroup();
      await (service as any).handleGroup(group, 10 * 60, '2026-09-30');
      const warning = notificationsService.create.mock.calls.find((c: any[]) => c[0].type === NotificationType.ATTENDANCE_TEACHER_WARNING);
      expect(warning[0].message).toContain('Davomat dars tugaguncha olinmasa, bu dars uchun haq yozilmaydi');
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/attendance/attendance-reminder.service.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Inject `private unmarkedLessons: UnmarkedLessonsService` (import from `./unmarked-lessons.service`). At the start of `tick()` (before computing the date parts) add:

```ts
    // «Dars bo'ldimi?» — open the question for every lesson that has ended
    // unmarked. Runs on every tick, whatever the lesson times, so a missed
    // tick is caught by the next one (spec 2026-09-29 §3.2).
    await this.sweepEndedLessons();
```

Add the 23:00 run and the sweep:

```ts
  /** 23:00 every day, Sundays included: whatever the half-hourly ticks missed. */
  @Cron('0 0 23 * * *', { timeZone: 'Asia/Tashkent' })
  async closeDay() {
    await this.sweepEndedLessons();
  }

  private async sweepEndedLessons() {
    let opened: Awaited<ReturnType<UnmarkedLessonsService['openForEndedLessons']>> = [];
    try {
      opened = await this.unmarkedLessons.openForEndedLessons();
    } catch (err) {
      this.logger.error(
        `Unmarked-lesson sweep failed: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    for (const lesson of opened) {
      try {
        const group = await this.prisma.group.findUnique({
          where: { id: lesson.groupId },
          select: {
            id: true,
            name: true,
            branchId: true,
            companyId: true,
            lessonStartTime: true,
            lessonEndTime: true,
            startDate: true,
            endDate: true,
            exactDays: true,
            room: { select: { name: true } },
            teachers: {
              where: {
                teacher: { deletedAt: null, isActive: true, status: UserStatus.ACTIVE },
              },
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true, telegramChatId: true },
                },
              },
            },
          },
        });
        if (!group) continue;
        const shown = {
          ...group,
          lessonStartTime: lesson.startTime,
          lessonEndTime: lesson.endTime,
        } as unknown as GroupWithTeachers;
        for (const t of shown.teachers) {
          await this.sendMissingToTeacher(t.teacher, shown);
        }
        await this.notifyBranchAdmins(shown, 'MISSING');
      } catch (err) {
        this.logger.error(
          `Lesson-end messages failed for ${lesson.groupId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
```

In `handleGroup`, replace

```ts
    if (![endMin - 30, endMin].includes(currentMinutes)) return;
```

with `if (currentMinutes !== endMin - 30) return;` and delete the trailing "`// currentMinutes === endMin`" branch (the two calls after the `endMin - 30` block). Update the class doc comment's trigger list: "end → handled by the sweep (`sweepEndedLessons`): MISSING_TEACHER + MISSING_ADMIN, once, when the question is opened".

New texts — `sendTeacherWarning`:

```ts
      `⏰ Dars tugashiga 30 daqiqa qoldi\n\n${details}\n\nDavomat dars tugaguncha olinmasa, bu dars uchun haq yozilmaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
```

`sendMissingToTeacher` (title `'Davomat olinmadi'`):

```ts
      `📝 Darsingiz tugadi, davomat olinmadi\n\n${details}\n\nBu dars uchun haq yozilmaydi. Dars bo'lgan-bo'lmaganini administrator belgilaydi.\n🔗 ${TEACHER_PORTAL_URL}`,
```

`notifyBranchAdmins` for `MISSING` — title `'Davomat olinmadi'`, message:

```ts
        : `📋 Dars tugadi, davomat olinmadi\n\n${details}\n\nTizimda topshiriq ochildi: dars bo'ldimi? «Bo'ldi» bo'lsa, kim kelganini belgilang.\n🔗 ${ADMIN_PORTAL_URL}/tasks`;
```

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/attendance/attendance-reminder.service.spec.ts
npx prettier --write src/attendance/attendance-reminder.service.ts src/attendance/attendance-reminder.service.spec.ts
npx eslint src/attendance/attendance-reminder.service.ts src/attendance/attendance-reminder.service.spec.ts --quiet
git add src/attendance/attendance-reminder.service.ts src/attendance/attendance-reminder.service.spec.ts
git commit -m "feat(attendance): lesson end opens «Dars bo'ldimi?» and says pay is lost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Tell the teacher the lesson earned nothing

**Files:**
- Modify: `server/src/telegram-digest/telegram-digest-payloads.ts`, `server/src/telegram-digest/telegram-digest-render.service.ts`
- Create: `server/src/attendance/unmarked-lesson-events.listener.ts` (+ spec)
- Modify: `server/src/attendance/attendance.module.ts` (provider)
- Test: `server/src/telegram-digest/telegram-digest-render.service.spec.ts`

**Interfaces:**
- Produces: `LessonPayForfeitedDigestPayload { groupId: string; groupName: string; date: string }` (category `LESSON_PAY_FORFEITED`, recipient `USER`); `UnmarkedLessonEventsListener.handleHeld(payload: UnmarkedLessonHeldPayload)`.

- [ ] **Step 1: Payload type**

In `telegram-digest-payloads.ts`, after `AttendanceCompletedDigestPayload`:

```ts
/** «Bo'ldi» — the lesson was marked after it ended; no pay (ADR-0054). */
export interface LessonPayForfeitedDigestPayload {
  groupId: string;
  groupName: string;
  /** Lesson date, 'YYYY-MM-DD'. */
  date: string;
}
```

add `LESSON_PAY_FORFEITED: LessonPayForfeitedDigestPayload;` to `DigestPayloadByCategory` and `LESSON_PAY_FORFEITED: 'USER';` to `RecipientKindByCategory`.

- [ ] **Step 2: Failing render test**

In `telegram-digest-render.service.spec.ts`, in the `renderUser` describe:

```ts
    it('lists lessons whose pay was lost', () => {
      const text = textOf(
        service.renderUser(
          [
            row(TelegramDigestCategory.LESSON_PAY_FORFEITED, {
              groupId: 'g1',
              groupName: 'A1-01',
              date: '2026-09-28',
            }),
          ],
          NOW,
        ),
      );
      expect(text).toContain('⚠️ <b>Davomat vaqtida olinmagan darslar</b>');
      expect(text).toContain('• A1-01 (28.09.2026)');
      expect(text).toContain('Bu darslar uchun haq yozilmadi.');
    });
```

Run: `npx jest src/telegram-digest/telegram-digest-render.service.spec.ts -t "pay was lost"` — Expected: FAIL.

- [ ] **Step 3: Render it**

In `renderUser`, after `const attendance = of(TelegramDigestCategory.ATTENDANCE_COMPLETED);` add `const forfeited = of(TelegramDigestCategory.LESSON_PAY_FORFEITED);` and, right after the `if (attendance.length > 0) { … }` block:

```ts
    if (forfeited.length > 0) {
      sections.push([
        header('⚠️ <b>Davomat vaqtida olinmagan darslar</b>'),
        ...forfeited.map((e) => ({
          text: this.forfeitedText(e.row),
          itemIds: e.ids,
        })),
        { text: 'Bu darslar uchun haq yozilmadi.', itemIds: [] },
      ]);
    }
```

and the helper next to `attendanceText`:

```ts
  private forfeitedText(row: TelegramDigestItemRow): string {
    const p = payloadOf(row, TelegramDigestCategory.LESSON_PAY_FORFEITED);
    return `• ${escapeHtml(p.groupName)} (${formatIsoDate(p.date)})`;
  }
```

Run the render spec — Expected: PASS.

- [ ] **Step 4: Failing listener test**

`unmarked-lesson-events.listener.spec.ts`:

```ts
import { UnmarkedLessonEventsListener } from './unmarked-lesson-events.listener';

describe('UnmarkedLessonEventsListener', () => {
  const make = () => {
    const prisma = {
      lessonTeacherOverride: { findFirst: jest.fn().mockResolvedValue(null) },
      groupTeacher: { findMany: jest.fn().mockResolvedValue([{ teacherId: 20001 }]) },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 20001 }]) },
    } as any;
    const notifications = { create: jest.fn().mockResolvedValue({ id: 'n1' }) } as any;
    const gateway = { sendToUser: jest.fn() } as any;
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) } as any;
    const digest = { enqueue: jest.fn() } as any;
    return { prisma, notifications, gateway, push, digest, listener: new UnmarkedLessonEventsListener(prisma, notifications, gateway, push, digest) };
  };
  const payload = { companyId: 1, groupId: 'g1', groupName: '#014', date: '2026-09-28', teacherPayExempt: false };

  it('tells the lesson\'s teachers, now and in the 20:00 digest', async () => {
    const m = make();
    await m.listener.handleHeld(payload);
    expect(m.notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 20001,
      title: 'Dars haqi yozilmadi',
      message: '"#014", 28.09.2026: davomat dars vaqtida olinmagani uchun bu dars haqi yozilmadi.',
    }));
    expect(m.digest.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      recipientKind: 'USER', recipientId: 20001, category: 'LESSON_PAY_FORFEITED',
      relatedEntityId: 'g1:2026-09-28', payload: { groupId: 'g1', groupName: '#014', date: '2026-09-28' },
    }));
  });

  it('tells the substitute when one taught the lesson', async () => {
    const m = make();
    m.prisma.lessonTeacherOverride.findFirst.mockResolvedValue({ teacherIds: [20009] });
    m.prisma.user.findMany.mockResolvedValue([{ id: 20009 }]);
    await m.listener.handleHeld(payload);
    expect(m.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: [20009] } }) }));
  });

  it('says nothing for an exempt lesson', async () => {
    const m = make();
    await m.listener.handleHeld({ ...payload, teacherPayExempt: true });
    expect(m.notifications.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 5: Implement the listener**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  NotificationType,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { PushService } from '../notifications/push.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import {
  UNMARKED_LESSON_HELD,
  type UnmarkedLessonHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

/**
 * «Bo'ldi» was entered for a lesson nobody marked in time: its teacher —
 * the substitute, if one taught it — learns the lesson earned nothing
 * (ADR-0054). DB + SSE + push now; Telegram in the 20:00 digest.
 */
@Injectable()
export class UnmarkedLessonEventsListener {
  private readonly logger = new Logger(UnmarkedLessonEventsListener.name);

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private gateway: NotificationsGateway,
    private pushService: PushService,
    private digestQueue: TelegramDigestQueueService,
  ) {}

  @OnEvent(UNMARKED_LESSON_HELD)
  async handleHeld(p: UnmarkedLessonHeldPayload) {
    if (p.teacherPayExempt) return;
    try {
      const date = new Date(`${p.date}T00:00:00.000Z`);
      const override = await this.prisma.lessonTeacherOverride.findFirst({
        where: { groupId: p.groupId, date, deletedAt: null },
        select: { teacherIds: true },
      });
      const teacherIds =
        override?.teacherIds ??
        (
          await this.prisma.groupTeacher.findMany({
            where: { groupId: p.groupId },
            select: { teacherId: true },
          })
        ).map((t) => t.teacherId);
      const teachers = await this.prisma.user.findMany({
        where: {
          id: { in: teacherIds },
          deletedAt: null,
          isActive: true,
          status: UserStatus.ACTIVE,
        },
        select: { id: true },
      });

      const [y, m, d] = p.date.split('-');
      const title = 'Dars haqi yozilmadi';
      const message = `"${p.groupName}", ${d}.${m}.${y}: davomat dars vaqtida olinmagani uchun bu dars haqi yozilmadi.`;
      for (const teacher of teachers) {
        try {
          const notification = await this.notificationsService.create({
            userId: teacher.id,
            type: NotificationType.SYSTEM,
            title,
            message,
            relatedEntityType: 'Group',
            relatedEntityId: p.groupId,
            companyId: p.companyId,
          });
          this.gateway.sendToUser(teacher.id, { type: 'notification', notification });
          try {
            await this.pushService.sendToUser(teacher.id, {
              title,
              body: message,
              url: `/groups/${p.groupId}`,
            });
          } catch (err) {
            this.logger.warn(`Push failed for teacher ${teacher.id}: ${err instanceof Error ? err.message : err}`);
          }
          await this.digestQueue.enqueue({
            recipientKind: TelegramDigestRecipientKind.USER,
            recipientId: teacher.id,
            companyId: p.companyId,
            category: TelegramDigestCategory.LESSON_PAY_FORFEITED,
            relatedEntityId: `${p.groupId}:${p.date}`,
            payload: { groupId: p.groupId, groupName: p.groupName, date: p.date },
          });
        } catch (err) {
          this.logger.error(`Could not tell teacher ${teacher.id} about lost pay: ${err instanceof Error ? err.message : err}`);
        }
      }
    } catch (err) {
      this.logger.error(`Held-lesson notice failed for ${p.groupId} ${p.date}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
```

Register it in `attendance.module.ts` `providers`.

- [ ] **Step 6: Run, format, lint, commit**

```bash
npx jest src/attendance/unmarked-lesson-events.listener.spec.ts src/telegram-digest
npm run typecheck
npx prettier --write src/telegram-digest/telegram-digest-payloads.ts src/telegram-digest/telegram-digest-render.service.ts src/telegram-digest/telegram-digest-render.service.spec.ts src/attendance/unmarked-lesson-events.listener.ts src/attendance/unmarked-lesson-events.listener.spec.ts src/attendance/attendance.module.ts
npx eslint src/telegram-digest src/attendance --quiet
git add src/telegram-digest src/attendance
git commit -m "feat(attendance): tell the teacher a late-marked lesson earned nothing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: System tasks in the comments module

**Files:**
- Modify: `server/src/comments/comments.service.ts` (`update` 253, `delete` 312, `getMyTasks` 347, `updateAssigneeStatus` 427)
- Modify: `server/src/notifications/notification-events.listener.ts:211-217`
- Modify: `server/src/comments/task-reminder.service.ts:81-83` (fallback author name)
- Test: `server/src/comments/comments.service.spec.ts`

**Interfaces:**
- Consumes: `claimSystemTask` (Task 8).
- Produces: `getMyTasks` items' `comment` carries `isSystem` and `unmarkedLesson: { id, groupId, date, status, lessonStartTime, lessonEndTime, group: { name } } | null`; system tasks refuse edit / delete / manual DONE (400); `SEEN` takes a system task (409 for the loser).

- [ ] **Step 1: Write the failing tests**

In `comments.service.spec.ts` give the prisma mock `$transaction: jest.fn((cb) => cb(prisma))`, `unmarkedLesson: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn() }`, and `commentAssignee.findMany` / `deleteMany` (`jest.fn()`), `user.findUnique` if missing. Then:

```ts
  describe('system tasks (ADR-0054)', () => {
    const systemComment = { id: 'c1', isTask: true, isSystem: true, authorId: null, author: null, companyId: 1, entityType: 'Group', entityId: 'g1', content: 'x', assignees: [] };

    it('cannot be edited or deleted', async () => {
      prisma.comment.findFirst.mockResolvedValue(systemComment);
      await expect(service.update('c1', { content: 'y' } as any, 1, ['CEO'], 1)).rejects.toThrow("Tizim bergan topshiriqni tahrirlab bo'lmaydi");
      await expect(service.delete('c1', 1)).rejects.toThrow("Tizim bergan topshiriqni o'chirib bo'lmaydi");
    });

    it('closes only by answering the lesson', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({ id: 'a3', status: 'PENDING', seenAt: null, comment: systemComment });
      await expect(service.updateAssigneeStatus('c1', 3, 'DONE' as any)).rejects.toThrow("darsga javob berilganda o'zi yopiladi");
    });

    it('is taken by the first administrator to mark it seen', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({ id: 'a3', status: 'PENDING', seenAt: null, comment: systemComment });
      prisma.commentAssignee.findMany.mockResolvedValue([{ userId: 3 }, { userId: 4 }]);
      prisma.commentAssignee.update.mockResolvedValue({ id: 'a3', status: 'SEEN', user: { id: 3 } });
      await service.updateAssigneeStatus('c1', 3, 'SEEN' as any);
      expect(prisma.commentAssignee.deleteMany).toHaveBeenCalledWith({ where: { commentId: 'c1', userId: { not: 3 } } });
      expect(prisma.unmarkedLesson.updateMany).toHaveBeenCalledWith({ where: { taskCommentId: 'c1' }, data: { claimedById: 3 } });
    });

    it('tells the second administrator who took it', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue(null);
      prisma.unmarkedLesson.findFirst.mockResolvedValue({ claimedById: 3 });
      prisma.user.findUnique.mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' });
      await expect(service.updateAssigneeStatus('c1', 4, 'SEEN' as any)).rejects.toThrow('Bu topshiriqni Ali Valiyev oldi');
    });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx jest src/comments/comments.service.spec.ts -t "system tasks"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Imports: add `ConflictException` to the `@nestjs/common` import, `Prisma` to the `@prisma/client` import, and `import { claimSystemTask } from '../unmarked-lessons/lesson-task';`.

`update` — right after the not-found check:

```ts
    if (comment.isSystem && comment.isTask) {
      throw new BadRequestException("Tizim bergan topshiriqni tahrirlab bo'lmaydi");
    }
```

`delete` — right after the not-found check:

```ts
    if (comment.isSystem && comment.isTask) {
      throw new BadRequestException("Tizim bergan topshiriqni o'chirib bo'lmaydi");
    }
```

`getMyTasks` — inside `comment: { include: { … } }` add:

```ts
              unmarkedLesson: {
                select: {
                  id: true,
                  groupId: true,
                  date: true,
                  status: true,
                  lessonStartTime: true,
                  lessonEndTime: true,
                  group: { select: { name: true } },
                },
              },
```

Replace `updateAssigneeStatus` with:

```ts
  async updateAssigneeStatus(
    commentId: string,
    userId: number,
    status: AssigneeStatus,
  ) {
    const { assignee, updated } = await this.runSerializable(async (tx) => {
      const assignee = await tx.commentAssignee.findFirst({
        where: { commentId, userId },
        include: {
          comment: {
            include: {
              author: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });

      if (!assignee) {
        // A «Dars bo'ldimi?» task another administrator already took.
        const lesson = await tx.unmarkedLesson.findFirst({
          where: { taskCommentId: commentId, claimedById: { not: null } },
          select: { claimedById: true },
        });
        if (lesson?.claimedById && lesson.claimedById !== userId) {
          const holder = await tx.user.findUnique({
            where: { id: lesson.claimedById },
            select: { firstName: true, lastName: true },
          });
          throw new ConflictException(
            holder
              ? `Bu topshiriqni ${holder.firstName} ${holder.lastName} oldi`
              : 'Bu topshiriqni boshqa administrator oldi',
          );
        }
        throw new NotFoundException('Sizga bu topshiriq berilmagan');
      }

      if (assignee.status === status) {
        throw new BadRequestException('Status allaqachon belgilangan');
      }

      if (assignee.comment.isSystem && assignee.comment.isTask) {
        if (status === AssigneeStatus.DONE) {
          throw new BadRequestException(
            "Bu topshiriq darsga javob berilganda o'zi yopiladi",
          );
        }
        // The first administrator to act takes it (spec 2026-09-29 §3.6).
        await claimSystemTask(tx, commentId, userId);
      }

      const updateData: Prisma.CommentAssigneeUpdateInput = { status };
      if (status === AssigneeStatus.PENDING) {
        updateData.seenAt = null;
        updateData.doneAt = null;
      } else if (status === AssigneeStatus.SEEN) {
        updateData.seenAt = new Date();
        updateData.doneAt = null;
      } else if (status === AssigneeStatus.DONE) {
        updateData.doneAt = new Date();
        if (!assignee.seenAt) updateData.seenAt = new Date();
      }

      const updated = await tx.commentAssignee.update({
        where: { id: assignee.id },
        data: updateData,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      });
      return { assignee, updated };
    });

    this.eventEmitter.emit('task.status.changed', {
      comment: assignee.comment,
      assignee: updated,
      newStatus: status,
    });

    return updated;
  }

  /** Two administrators taking one task at once: one wins, the other is told. */
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2034') {
        throw new ConflictException(
          "Topshiriq hozirgina o'zgardi. Sahifani yangilang",
        );
      }
      throw err;
    }
  }
```

`notification-events.listener.ts` — first line of `handleTaskStatusChanged`'s body:

```ts
    // A system task has no author to tell (ADR-0054).
    if (!payload.comment?.authorId) return;
```

`task-reminder.service.ts` (~line 81) — a null author now means the system gave the task, so the 09:00 reminder should say so. Change the fallback of `authorName` from `"Noma'lum"` to `'Tizim'`:

```ts
        const authorName = assignee.comment.author
          ? `${assignee.comment.author.firstName} ${assignee.comment.author.lastName}`
          : 'Tizim';
```

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/comments src/notifications
npm run typecheck
npx prettier --write src/comments/comments.service.ts src/comments/comments.service.spec.ts src/comments/task-reminder.service.ts src/notifications/notification-events.listener.ts
npx eslint src/comments src/notifications/notification-events.listener.ts --quiet
git add src/comments src/notifications/notification-events.listener.ts
git commit -m "feat(tasks): system tasks are taken, not edited, and closed by the answer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: The schedule knows which lessons wait for an answer

**Files:**
- Modify: `server/src/dashboard/dashboard.service.ts` (~128-224)
- Test: `server/src/dashboard/dashboard.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add `unmarkedLesson: { findMany: jest.fn().mockResolvedValue([]) }` to the prisma mock. The first `getTodaySchedule` test matches `result.lessons[0]` with `toEqual`, so add `unmarked: null,` after `attendanceStatus: …` in its expected object. Then add to `describe('getTodaySchedule')`:

```ts
    it("marks a lesson that waits for «Dars bo'ldimi?»", async () => {
      prisma.unmarkedLesson.findMany.mockResolvedValue([
        {
          id: 'u1',
          groupId: 'group-1',
          date: new Date('2026-04-13T00:00:00.000Z'),
          status: 'PENDING',
          claimedById: null,
        },
      ]);
      const result = await service.getTodaySchedule(1, 1001, '2026-04-13');
      expect(result.lessons[0].unmarked).toEqual({
        id: 'u1',
        status: 'PENDING',
        claimedBy: null,
      });
      expect(result.lessons[1].unmarked).toBeNull();
    });
```

- [ ] **Step 2: Run to see it fail**

Run: `npx jest src/dashboard/dashboard.service.spec.ts`
Expected: FAIL — `unmarked` is missing from the lessons.

- [ ] **Step 3: Implement**

Import `{ loadUnmarkedLessonInfos } from '../unmarked-lessons/unmarked-lesson-info'` and `{ lessonKey } from '../unmarked-lessons/forfeited-lessons'`. After the attendance maps:

```ts
    // «Dars bo'ldimi?» — which lessons of the day still wait for an answer.
    const unmarked = groupIds.length
      ? await loadUnmarkedLessonInfos(this.prisma, {
          groupId: { in: groupIds },
          date: dateOnly,
        })
      : new Map();
```

and in the returned lesson object add `unmarked: unmarked.get(lessonKey(g.id, dateOnly)) ?? null,`.

- [ ] **Step 4: Run, format, lint, commit**

```bash
npx jest src/dashboard
npx prettier --write src/dashboard/dashboard.service.ts src/dashboard/dashboard.service.spec.ts
npx eslint src/dashboard --quiet
git add src/dashboard
git commit -m "feat(dashboard): schedule shows lessons waiting for «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Telegram — the instant group notice and the 21:00 line

**Files:**
- Create: `server/src/telegram-groups/utils/unmarked-lesson-text.ts` (+ spec)
- Create: `server/src/telegram-groups/telegram-group-unmarked-lesson.listener.ts` (+ spec)
- Modify: `server/src/telegram-groups/telegram-groups.module.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts` (Promise.all ~149-341, `buildFlagLines` ~624)
- Test: `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`

**Interfaces:**
- Produces: `notHeldGroupText(p: UnmarkedLessonNotHeldPayload, decidedByName: string): string`; listener for `UNMARKED_LESSON_NOT_HELD`; `buildFlagLines(todayFlags, attendancePct, staleUnmarked: number)`.

- [ ] **Step 1: Text builder test**

```ts
import { notHeldGroupText } from './unmarked-lesson-text';

const base = {
  companyId: 1, branchId: 2, groupId: 'g1', groupName: '#014 <A1>', date: '2026-09-28',
  lessonStartTime: '16:00', lessonEndTime: '17:30', reason: 'Ustoz kasal', decidedById: 3,
};

it('reports a cancelled lesson with the refund', () => {
  expect(notHeldGroupText({ ...base, outcome: 'CANCELLED', refundedStudents: 4, refundedAmount: 150000 }, 'Ali Valiyev')).toBe(
    [
      "❌ <b>Dars bo'lmadi</b>",
      '👥 #014 &lt;A1&gt; — 28.09.2026 16:00–17:30',
      '📝 Sabab: Ustoz kasal',
      "💰 Pul qaytarildi: 4 o'quvchi, 150 000 so'm",
      '👤 Belgilagan: Ali Valiyev',
    ].join('\n'),
  );
});

it('reports a moved lesson with its new time', () => {
  const text = notHeldGroupText(
    { ...base, outcome: 'RESCHEDULED', newDate: '2026-10-02', newLessonStartTime: '10:00', newLessonEndTime: '11:30' },
    'Ali Valiyev',
  );
  expect(text).toContain("📅 Ko'chirildi: 02.10.2026 10:00–11:30");
  expect(text).not.toContain('Pul qaytarildi');
});
```

Check `formatSum(150000)` output in `utils/format.util.ts` — if it renders `"150 000 so'm"` with a non-breaking space, write the expectation with `formatSum(150000)` instead of the literal.

- [ ] **Step 2: Implement the text**

```ts
import type { UnmarkedLessonNotHeldPayload } from '../../unmarked-lessons/unmarked-lesson-events';
import { escapeHtml, formatSum } from './format.util';

const day = (s: string) => {
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
};

/** The instant group notice for «Bo'lmadi» (spec 2026-09-29 §3.5). */
export function notHeldGroupText(
  p: UnmarkedLessonNotHeldPayload,
  decidedByName: string,
): string {
  const lines = [
    "❌ <b>Dars bo'lmadi</b>",
    `👥 ${escapeHtml(p.groupName)} — ${day(p.date)} ${p.lessonStartTime}–${p.lessonEndTime}`,
    `📝 Sabab: ${escapeHtml(p.reason)}`,
  ];
  if (p.outcome === 'CANCELLED') {
    lines.push(
      `💰 Pul qaytarildi: ${p.refundedStudents ?? 0} o'quvchi, ${formatSum(p.refundedAmount ?? 0)}`,
    );
  } else if (p.newDate) {
    const time =
      p.newLessonStartTime && p.newLessonEndTime
        ? ` ${p.newLessonStartTime}–${p.newLessonEndTime}`
        : '';
    lines.push(`📅 Ko'chirildi: ${day(p.newDate)}${time}`);
  }
  lines.push(`👤 Belgilagan: ${escapeHtml(decidedByName)}`);
  return lines.join('\n');
}
```

- [ ] **Step 3: Listener and its test**

`telegram-group-unmarked-lesson.listener.spec.ts`:

```ts
import { TelegramGroupUnmarkedLessonListener } from './telegram-group-unmarked-lesson.listener';

describe('TelegramGroupUnmarkedLessonListener', () => {
  const payload = {
    companyId: 1, branchId: 2, groupId: 'g1', groupName: '#014', date: '2026-09-28',
    lessonStartTime: '16:00', lessonEndTime: '17:30', reason: 'Ustoz kasal', decidedById: 3,
    outcome: 'CANCELLED' as const, refundedStudents: 4, refundedAmount: 150000,
  };

  it("sends to every approved group that sees the lesson's branch", async () => {
    const sendMessage = jest.fn().mockResolvedValue({});
    const prisma = {
      telegramGroup: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tg1', chatId: BigInt(-1001), branchId: 2, receivesAllBranches: false },
          { id: 'tg2', chatId: BigInt(-1002), branchId: 5, receivesAllBranches: false },
          { id: 'tg3', chatId: BigInt(-1003), branchId: null, receivesAllBranches: true },
        ]),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ firstName: 'Ali', lastName: 'Valiyev' }) },
    } as any;
    const adminBot = { getBot: () => ({ telegram: { sendMessage } }) } as any;
    await new TelegramGroupUnmarkedLessonListener(prisma, adminBot).handle(payload);
    expect(sendMessage.mock.calls.map((c) => c[0])).toEqual(['-1001', '-1003']);
    expect(sendMessage.mock.calls[0][1]).toContain("Dars bo'lmadi");
  });

  it('does nothing without the admin bot', async () => {
    const prisma = { telegramGroup: { findMany: jest.fn() }, user: { findUnique: jest.fn() } } as any;
    await new TelegramGroupUnmarkedLessonListener(prisma, { getBot: () => null } as any).handle(payload);
    expect(prisma.telegramGroup.findMany).not.toHaveBeenCalled();
  });
});
```

`telegram-group-unmarked-lesson.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TelegramGroupStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAdminBotService } from './telegram-admin-bot.service';
import { isVisibleToGroup } from './telegram-group-digest-cron.service';
import { notHeldGroupText } from './utils/unmarked-lesson-text';
import { sendTelegramText } from '../telegram-digest/telegram-send';
import {
  UNMARKED_LESSON_NOT_HELD,
  type UnmarkedLessonNotHeldPayload,
} from '../unmarked-lessons/unmarked-lesson-events';

/**
 * «Bo'lmadi» reaches the Telegram group at once — a CEO decision (spec
 * 2026-09-29 Q3) that puts it on ADR-0025's instant list (recorded in
 * ADR-0054). Same branch visibility as the 20:00 group digest.
 */
@Injectable()
export class TelegramGroupUnmarkedLessonListener {
  private readonly logger = new Logger(TelegramGroupUnmarkedLessonListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminBot: TelegramAdminBotService,
  ) {}

  @OnEvent(UNMARKED_LESSON_NOT_HELD)
  async handle(p: UnmarkedLessonNotHeldPayload) {
    const bot = this.adminBot.getBot();
    if (!bot) return;
    try {
      const [groups, actor] = await Promise.all([
        this.prisma.telegramGroup.findMany({
          where: {
            companyId: p.companyId,
            status: TelegramGroupStatus.APPROVED,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, chatId: true, branchId: true, receivesAllBranches: true },
        }),
        this.prisma.user.findUnique({
          where: { id: p.decidedById },
          select: { firstName: true, lastName: true },
        }),
      ]);
      const text = notHeldGroupText(
        p,
        actor ? `${actor.firstName} ${actor.lastName}` : '—',
      );
      for (const group of groups) {
        if (!isVisibleToGroup({ branchId: p.branchId }, group)) continue;
        const outcome = await sendTelegramText(bot, group.chatId.toString(), text, {
          parse_mode: 'HTML',
        });
        if (!outcome.ok) {
          this.logger.warn(
            `«Dars bo'lmadi» notice to chat ${group.chatId} failed (${outcome.kind}: ${outcome.description})`,
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `«Dars bo'lmadi» notice failed for ${p.groupId} ${p.date}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
```

(If `sendTelegramText`'s signature or `SendOutcome` shape differs, adapt to what `telegram-group-digest-cron.service.ts:181-207` passes and reads.) Add the listener to `telegram-groups.module.ts` `providers`.

- [ ] **Step 4: 21:00 line — failing test**

In the daily report spec: add `staleUnmarked?: number` to the `State` type and `unmarkedLesson: { count: jest.fn(async () => state.staleUnmarked ?? 0) }` to `makePrisma`. Then:

```ts
  it("flags lessons waiting more than a day for «Dars bo'ldimi?»", async () => {
    const state = { ...defaultState(), staleUnmarked: 3 };
    const prisma = makePrisma(state);
    const service = await buildService(prisma, makeSalary(state));
    const { message } = await service.build(1001, null);
    expect(message).toContain('• Javobsiz darslar (1 kundan ortiq): <b>3</b> ta');
    expect(prisma.unmarkedLesson.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId: 1001, status: 'PENDING', group: { deletedAt: null } }),
    });
  });
```

Run: `npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts -t "Dars bo'ldimi"` — Expected: FAIL.

- [ ] **Step 5: 21:00 line — implement**

In `build`, append `staleUnmarked,` to the destructured list after `yesterdaySnapshot,`, and append to the `Promise.all` array after the `dailyFinancialSnapshot.findFirst` entry:

```ts
      // «Dars bo'ldimi?» questions left unanswered for more than a day
      // (spec 2026-09-29 §3.7) — scoped like the rest of the report.
      this.prisma.unmarkedLesson.count({
        where: {
          companyId,
          status: 'PENDING',
          createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          group: { deletedAt: null },
          ...branchIdWhere(branchIds),
        },
      }),
```

Change the call to `this.buildFlagLines(todayFlags, attendancePct, staleUnmarked)`, add the parameter `staleUnmarked: number` to `buildFlagLines`, and before its `return lines;`:

```ts
    if (staleUnmarked > 0) {
      lines.push(
        `• Javobsiz darslar (1 kundan ortiq): <b>${staleUnmarked}</b> ta — «Topshiriqlar»da javob bering`,
      );
    }
```

- [ ] **Step 6: Run everything touched, including the wiring guards**

```bash
npx jest src/telegram-groups src/telegram-digest/direct-send.guard.spec.ts src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: PASS (the event-wiring spec now finds a listener for both new events; the direct-send guard is unaffected because the listener sends through `sendTelegramText`).

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write src/telegram-groups/utils/unmarked-lesson-text.ts src/telegram-groups/utils/unmarked-lesson-text.spec.ts src/telegram-groups/telegram-group-unmarked-lesson.listener.ts src/telegram-groups/telegram-group-unmarked-lesson.listener.spec.ts src/telegram-groups/telegram-groups.module.ts src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts
npx eslint src/telegram-groups --quiet
git add src/telegram-groups
git commit -m "feat(telegram): instant «Dars bo'lmadi» notice and the 21:00 unanswered line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Backfill script for past unmarked lessons

**Files:**
- Create: `server/scripts/open-unmarked-lessons.ts`

**Interfaces:**
- Consumes: `AttendanceReadService.getLessonCalendar` (cells now carry `unmarked`), `createLessonTask`, `nextWorkingDay`, `taskDueAt`, `tashkentClock`.

- [ ] **Step 1: Write the script**

```ts
/**
 * Opens «Dars bo'ldimi?» for past lessons nobody marked since the monthly
 * model began (spec 2026-09-29 §9, Q11). They predate the rule, so they open
 * EXEMPT: answered «Bo'ldi», the teacher is paid as before.
 *
 *   railway run --service caring-courage --environment production \
 *     npx ts-node --transpile-only scripts/open-unmarked-lessons.ts \
 *     [--from=2026-09-01] [--apply]
 *
 * Without --apply the connection is read-only and the script only lists the
 * lessons it would open. A lesson day is what the group calendar calls one
 * (schedule history, holidays, cancellations and moves included) — the same
 * `getLessonCalendar` the admin panel draws.
 */
import { PrismaService } from '../src/prisma/prisma.service';
import { HolidaysService } from '../src/holidays/holidays.service';
import { AttendanceReadService } from '../src/attendance/attendance-read.service';
import {
  createLessonTask,
  nextWorkingDay,
  taskDueAt,
} from '../src/unmarked-lessons/lesson-task';
import {
  DAY_END_TIME,
  DAY_START_TIME,
  tashkentClock,
} from '../src/attendance/shared/attendance-window';
import { utcMidnightFromDateStr } from '../src/common/date/tashkent';

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const APPLY = args.includes('--apply');
const FROM = arg('from') ?? '2026-09-01';
const EXEMPT_REASON = 'Qoida kuchga kirishidan oldingi dars (ADR-0054)';

function readOnlyUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set('options', '-c default_transaction_read_only=on');
  return u.toString();
}

function monthsBetween(fromStr: string, toStr: string): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = Number(fromStr.slice(0, 4));
  let m = Number(fromStr.slice(5, 7));
  const endY = Number(toStr.slice(0, 4));
  const endM = Number(toStr.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM)) throw new Error('--from must be YYYY-MM-DD');
  if (!APPLY) process.env.DATABASE_URL = readOnlyUrl(process.env.DATABASE_URL!);
  const prisma = new PrismaService();
  // getLessonCalendar only needs buildHolidayDateSet, which only reads prisma.
  const holidays = new HolidaysService(prisma, null as never, null as never, null as never);
  const read = new AttendanceReadService(prisma, holidays);
  const { todayStr } = tashkentClock();

  const groups = await prisma.group.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      companyId: true,
      branchId: true,
      lessonStartTime: true,
      lessonEndTime: true,
    },
    orderBy: { name: 'asc' },
  });

  const found: { group: (typeof groups)[number]; date: string }[] = [];
  for (const group of groups) {
    for (const { year, month } of monthsBetween(FROM, todayStr)) {
      const { cells } = await read.getLessonCalendar(group.id, month, year, group.companyId);
      for (const c of cells) {
        const live = c.type === 'regular' || c.type === 'rescheduledTo';
        if (live && !c.hasAttendance && !c.unmarked && c.date >= FROM && c.date < todayStr) {
          found.push({ group, date: c.date });
        }
      }
    }
  }

  for (const f of found) console.log(`${f.group.name}\t${f.date}`);
  console.log(`\n${found.length} lesson(s) ${APPLY ? 'to open' : 'would be opened'} (from ${FROM}).`);
  if (!APPLY || found.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const holidaySet = await holidays.buildHolidayDateSet(
    utcMidnightFromDateStr(todayStr),
    utcMidnightFromDateStr(`${todayStr.slice(0, 8)}28`),
  );
  const dueAt = taskDueAt(nextWorkingDay(todayStr, holidaySet));
  let opened = 0;
  for (const f of found) {
    const date = utcMidnightFromDateStr(f.date);
    const startTime = f.group.lessonStartTime ?? DAY_START_TIME;
    const endTime = f.group.lessonEndTime ?? DAY_END_TIME;
    await prisma.$transaction(async (tx) => {
      const marked = await tx.attendance.findFirst({ where: { groupId: f.group.id, date }, select: { id: true } });
      const asked = await tx.unmarkedLesson.findUnique({
        where: { groupId_date: { groupId: f.group.id, date } },
        select: { id: true },
      });
      if (marked || asked) return;
      const taskCommentId = await createLessonTask(tx, {
        companyId: f.group.companyId,
        branchId: f.group.branchId,
        groupId: f.group.id,
        groupName: f.group.name,
        dateStr: f.date,
        startTime,
        endTime,
        dueAt,
      });
      await tx.unmarkedLesson.create({
        data: {
          companyId: f.group.companyId,
          branchId: f.group.branchId,
          groupId: f.group.id,
          date,
          lessonStartTime: startTime,
          lessonEndTime: endTime,
          teacherPayExempt: true,
          exemptReason: EXEMPT_REASON,
          taskCommentId,
        },
      });
      opened += 1;
    });
  }
  console.log(`Opened ${opened}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Dry run against the dev database**

```bash
npx ts-node --transpile-only scripts/open-unmarked-lessons.ts --from=2026-09-01
```

Expected: a list and `N lesson(s) would be opened`; nothing written (read-only connection). If `new PrismaService()` cannot connect without the Nest module, follow `scripts/cancel-unheld-lessons.ts` for how it constructs and connects.

- [ ] **Step 3: Format, lint, commit**

```bash
npx prettier --write scripts/open-unmarked-lessons.ts
npx eslint scripts/open-unmarked-lessons.ts --quiet
git add scripts/open-unmarked-lessons.ts
git commit -m "chore(scripts): open «Dars bo'ldimi?» for past unmarked lessons (exempt)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Server verification pass

- [ ] **Step 1: Full server checks**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat/server
npm run typecheck
npx eslint src --quiet
npm test -- --silent
npm run build
```

Expected: typecheck exit 0; eslint prints nothing; all suites PASS; build exit 0. Fix any failure in the file it names before continuing — do not skip a failing suite.

- [ ] **Step 2: Commit any fixes**

```bash
git status --short
git add <the files you fixed>
git commit -m "test: keep the suite green after the unmarked-lesson work

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Skip the commit if there is nothing to add.)

---

### Task 25: Client pure helpers

**Files:**
- Create: `client/src/lib/attendance-window.ts` (+ `attendance-window.test.ts`)
- Create: `client/src/lib/unmarked-lesson.ts` (+ `unmarked-lesson.test.ts`)

**Interfaces:**
- Produces: `newAttendanceWindow(args): "OPEN" | "BEFORE" | "ENDED" | "NOT_TODAY"` (same rule as the server); `type UnmarkedStatus`; `interface UnmarkedLessonInfo { id: string; status: UnmarkedStatus; claimedBy: { id: number; firstName: string; lastName: string } | null }`; `interface UnmarkedLessonRef { groupId: string; groupName: string; date: string; startTime: string | null; endTime: string | null }`; `interface AnswerState { visible: boolean; canAnswer: boolean; heldBy: string | null; canExempt: boolean }`; `answerState(info, viewer): AnswerState`; `formatLessonDay(dateStr): string`; `makeUpIsAhead(dateStr, startTime, now: { dateStr: string; minutes: number }): boolean`.

- [ ] **Step 1: Install client dependencies**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat/client
npm ci
```

- [ ] **Step 2: Write the failing tests**

`src/lib/attendance-window.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newAttendanceWindow } from "./attendance-window";

const lesson = { date: "2026-10-01", todayStr: "2026-10-01", startTime: "17:30", endTime: "19:00" };

describe("newAttendanceWindow", () => {
  it("matches the server: opens 10 minutes early, closes at the end minute", () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 17 * 60 + 19 })).toBe("BEFORE");
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 17 * 60 + 20 })).toBe("OPEN");
    expect(newAttendanceWindow({ ...lesson, nowMinutes: 19 * 60 })).toBe("ENDED");
    expect(newAttendanceWindow({ ...lesson, date: "2026-09-30", nowMinutes: 600 })).toBe("NOT_TODAY");
  });
});
```

`src/lib/unmarked-lesson.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { answerState, formatLessonDay, makeUpIsAhead, type UnmarkedLessonInfo } from "./unmarked-lesson";

const pending: UnmarkedLessonInfo = { id: "u1", status: "PENDING", claimedBy: null };
const admin = { id: 3, roles: [{ id: 3 }] };

describe("answerState", () => {
  it("shows the prompt to administrators, directors and the CEO only", () => {
    expect(answerState(pending, admin).visible).toBe(true);
    expect(answerState(pending, { id: 5, roles: [{ id: 2 }] }).visible).toBe(true);
    expect(answerState(pending, { id: 9, roles: [{ id: 4 }] }).visible).toBe(false);
    expect(answerState({ ...pending, status: "HELD" }, admin).visible).toBe(false);
    expect(answerState(null, admin).visible).toBe(false);
  });

  it("leaves a taken lesson to its holder, except for directors and the CEO", () => {
    const taken = { ...pending, claimedBy: { id: 4, firstName: "Ali", lastName: "Valiyev" } };
    expect(answerState(taken, admin)).toEqual({ visible: true, canAnswer: false, heldBy: "Ali Valiyev", canExempt: false });
    expect(answerState(taken, { id: 4, roles: [{ id: 3 }] }).canAnswer).toBe(true);
    expect(answerState(taken, { id: 1, roles: [{ id: 1 }] })).toEqual({ visible: true, canAnswer: true, heldBy: "Ali Valiyev", canExempt: true });
  });
});

describe("formatLessonDay", () => {
  it("writes dd.MM.yyyy", () => expect(formatLessonDay("2026-09-28")).toBe("28.09.2026"));
});

describe("makeUpIsAhead", () => {
  const now = { dateStr: "2026-09-30", minutes: 14 * 60 };
  it("accepts a later day or a later time today", () => {
    expect(makeUpIsAhead("2026-10-01", "09:00", now)).toBe(true);
    expect(makeUpIsAhead("2026-09-30", "15:00", now)).toBe(true);
  });
  it("refuses a time that has started or passed", () => {
    expect(makeUpIsAhead("2026-09-30", "14:00", now)).toBe(false);
    expect(makeUpIsAhead("2026-09-29", "18:00", now)).toBe(false);
  });
});
```

Run: `npm test -- src/lib/attendance-window.test.ts src/lib/unmarked-lesson.test.ts` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement**

`src/lib/attendance-window.ts`:

```ts
/**
 * When a NEW register may be saved — the rule the server enforces in
 * `server/src/attendance/shared/attendance-window.ts` (spec 2026-09-29 §3.1):
 * only on the lesson's own Tashkent day, from ten minutes before it starts
 * until it ends, for every role. The server is the boundary; this only keeps
 * the form from offering a save the server will refuse.
 */
export type AttendanceWindow = "OPEN" | "BEFORE" | "ENDED" | "NOT_TODAY";

export const OPENS_MINUTES_BEFORE = 10;
export const DAY_END_TIME = "23:00";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function newAttendanceWindow(args: {
  date: string;
  todayStr: string;
  nowMinutes: number;
  startTime: string | null;
  endTime: string | null;
}): AttendanceWindow {
  if (args.date !== args.todayStr) return "NOT_TODAY";
  if (args.nowMinutes >= toMinutes(args.endTime ?? DAY_END_TIME)) return "ENDED";
  if (args.startTime && args.nowMinutes < toMinutes(args.startTime) - OPENS_MINUTES_BEFORE) {
    return "BEFORE";
  }
  return "OPEN";
}
```

`src/lib/unmarked-lesson.ts`:

```ts
/** «Dars bo'ldimi?» — spec 2026-09-29, ADR-0054. */
export type UnmarkedStatus = "PENDING" | "HELD" | "NOT_HELD" | "RESCHEDULED";

export interface UnmarkedLessonInfo {
  id: string;
  status: UnmarkedStatus;
  claimedBy: { id: number; firstName: string; lastName: string } | null;
}

/** The lesson a prompt asks about. */
export interface UnmarkedLessonRef {
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
}

export interface AnswerState {
  /** Draw the prompt at all. */
  visible: boolean;
  /** Buttons enabled. */
  canAnswer: boolean;
  /** Another administrator took the task. */
  heldBy: string | null;
  /** CEO: «Ustoz aybdor emas — haq yozilsin». */
  canExempt: boolean;
}

interface Viewer {
  id: number;
  roles: { id: number }[];
}

const HIDDEN: AnswerState = { visible: false, canAnswer: false, heldBy: null, canExempt: false };

/**
 * Who sees the question and who may answer it (spec §3.3): administrators
 * while nobody has taken the task, the one who took it, and directors and the
 * CEO always. The server enforces the same; this decides what to draw.
 */
export function answerState(
  info: UnmarkedLessonInfo | null | undefined,
  viewer: Viewer | null | undefined,
): AnswerState {
  if (!info || info.status !== "PENDING" || !viewer) return HIDDEN;
  const roleIds = new Set(viewer.roles.map((r) => r.id));
  const isManager = roleIds.has(1) || roleIds.has(2);
  if (!isManager && !roleIds.has(3)) return HIDDEN;
  const other = info.claimedBy && info.claimedBy.id !== viewer.id ? info.claimedBy : null;
  return {
    visible: true,
    canAnswer: isManager || other === null,
    heldBy: other ? `${other.firstName} ${other.lastName}` : null,
    canExempt: roleIds.has(1),
  };
}

export function formatLessonDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}

/** A make-up lesson must still be ahead, or nobody could mark it either. */
export function makeUpIsAhead(
  dateStr: string,
  startTime: string,
  now: { dateStr: string; minutes: number },
): boolean {
  if (dateStr !== now.dateStr) return dateStr > now.dateStr;
  const [h, m] = startTime.split(":").map(Number);
  return h * 60 + m > now.minutes;
}
```

Run the two tests — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/attendance-window.ts src/lib/attendance-window.test.ts src/lib/unmarked-lesson.ts src/lib/unmarked-lesson.test.ts
git commit -m "feat(client): helpers for the attendance window and «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 26: The prompt and its two dialogs

**Files:**
- Create: `client/src/components/attendance/unmarked/late-attendance-dialog.tsx`
- Create: `client/src/components/attendance/unmarked/not-held-dialog.tsx`
- Create: `client/src/components/attendance/unmarked/unmarked-lesson-prompt.tsx`

**Interfaces:**
- Consumes: Task 25; `AttendanceStudentRow`, `STATUS_CONFIG`, types from `components/groups/attendance/attendance-form-utils`.
- Produces: `LateAttendanceDialog({ open, onOpenChange, lesson, canExempt, onSaved })`; `NotHeldDialog({ open, onOpenChange, lesson, onDone })`; `UnmarkedLessonButtons({ state, onPick })`; `UnmarkedLessonDialogs({ lesson, dialog, onDialogChange, canExempt, onAnswered })`; `UnmarkedLessonPrompt({ lesson, info, onAnswered, className? })`.

- [ ] **Step 1: Late register dialog**

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, UserCheck } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatLessonDay, type UnmarkedLessonRef } from "@/lib/unmarked-lesson";
import { AttendanceStudentRow } from "@/components/groups/attendance/attendance-student-row";
import {
  STATUS_CONFIG,
  type AttendanceEntry,
  type StudentAttendance,
} from "@/components/groups/attendance/attendance-form-utils";

interface LateAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: UnmarkedLessonRef;
  canExempt: boolean;
  onSaved: () => void;
}

/**
 * «Bo'ldi» — the register of a lesson nobody marked in time (spec §3.4). The
 * roster is who was in the group that day (`?late=1`). Saving leaves the
 * teacher unpaid for the lesson unless the CEO ticks the exemption.
 */
export function LateAttendanceDialog({ open, onOpenChange, lesson, canExempt, onSaved }: LateAttendanceDialogProps) {
  const [marks, setMarks] = useState<Map<number, AttendanceEntry>>(() => new Map());
  const [openNote, setOpenNote] = useState<number | null>(null);
  const [exempt, setExempt] = useState(false);
  const [exemptReason, setExemptReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const roster = useQuery({
    queryKey: ["attendance-late-roster", lesson.groupId, lesson.date],
    queryFn: () =>
      api
        .get<{ activeStudents: StudentAttendance[] }>(`/attendance/${lesson.groupId}/date/${lesson.date}`, {
          params: { late: 1 },
        })
        .then((r) => r.data.activeStudents ?? []),
    enabled: open,
  });
  const students = roster.data ?? [];

  const entryFor = (s: StudentAttendance): AttendanceEntry =>
    marks.get(s.studentId) ?? {
      studentId: s.studentId,
      status: s.plannedKind ? "EXCUSED" : null,
      note: s.plannedNote ?? undefined,
    };

  const update = (studentId: number, patch: Partial<AttendanceEntry>) => {
    const student = students.find((s) => s.studentId === studentId);
    if (!student) return;
    setMarks((prev) => new Map(prev).set(studentId, { ...entryFor(student), ...patch }));
  };

  const markAllPresent = () =>
    setMarks(new Map(students.map((s) => [s.studentId, { ...entryFor(s), status: "PRESENT" }])));

  const reset = () => {
    setMarks(new Map());
    setOpenNote(null);
    setExempt(false);
    setExemptReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const unmarkedCount = students.filter((s) => !entryFor(s).status).length;
  const reasonMissing = exempt && !exemptReason.trim();

  const handleSave = async () => {
    setSubmitting(true);
    try {
      await api.post(`/attendance/${lesson.groupId}/date/${lesson.date}/late`, {
        entries: students.map((s) => {
          const e = entryFor(s);
          return { studentId: s.studentId, status: e.status, note: e.note };
        }),
        ...(exempt ? { teacherPayExempt: true, exemptReason: exemptReason.trim() } : {}),
      });
      toast.success(exempt ? "Davomat saqlandi" : "Davomat saqlandi. Ustozga bu dars uchun haq yozilmaydi");
      reset();
      onSaved();
    } catch (err) {
      toast.error(getErrorMessage(err, "Davomatni saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  const time = lesson.startTime && lesson.endTime ? ` ${lesson.startTime}–${lesson.endTime}` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Dars bo&apos;ldi — kim keldi?</DialogTitle>
          <DialogDescription>
            {lesson.groupName}, {formatLessonDay(lesson.date)}
            {time}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {!exempt && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              Davomat dars vaqtida olinmagan — ustozga bu dars uchun haq yozilmaydi.
            </div>
          )}

          {roster.isPending ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : roster.isError ? (
            <p className="text-sm text-destructive">O&apos;quvchilar ro&apos;yxatini yuklab bo&apos;lmadi</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-muted-foreground">O&apos;sha kuni guruhda o&apos;quvchi bo&apos;lmagan</p>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllPresent}
                disabled={submitting}
                className="text-green-700 dark:text-green-400"
              >
                <UserCheck className="mr-1.5 size-4" />
                Barchasiga — Keldi
              </Button>
              <div className="space-y-1.5">
                {students.map((student, index) => (
                  <AttendanceStudentRow
                    key={student.studentId}
                    index={index}
                    student={student}
                    entry={entryFor(student)}
                    statusOptions={STATUS_CONFIG}
                    isAdmin
                    isLocked={submitting}
                    isNoteOpen={openNote === student.studentId}
                    onSetStatus={(id, status) => update(id, { status })}
                    onSetNote={(id, note) => update(id, { note: note || undefined })}
                    onToggleNote={() => setOpenNote(openNote === student.studentId ? null : student.studentId)}
                  />
                ))}
              </div>
            </>
          )}

          {canExempt && (
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={exempt} onCheckedChange={(v) => setExempt(v === true)} />
                Ustoz aybdor emas — haq yozilsin
              </label>
              {exempt && (
                <Textarea
                  value={exemptReason}
                  onChange={(e) => setExemptReason(e.target.value)}
                  placeholder="Sabab: masalan, akkaunt hali ochilmagan edi"
                  maxLength={500}
                />
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {unmarkedCount > 0 && (
            <span className="mr-auto self-center text-xs font-medium text-amber-700 dark:text-amber-400">
              Belgilanmagan: {unmarkedCount} ta
            </span>
          )}
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting || roster.isPending || students.length === 0 || unmarkedCount > 0 || reasonMissing}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: «Bo'lmadi» dialog**

```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Loader2, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { formatLessonDay, makeUpIsAhead, type UnmarkedLessonRef } from "@/lib/unmarked-lesson";

type Action = "CANCEL" | "RESCHEDULE";

interface NotHeldDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: UnmarkedLessonRef;
  onDone: () => void;
}

/** «Bo'lmadi» — cancel (money back) or move to a later lesson (spec §3.5). */
export function NotHeldDialog({ open, onOpenChange, lesson, onDone }: NotHeldDialogProps) {
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<Action>("CANCEL");
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState(lesson.startTime ?? "");
  const [endTime, setEndTime] = useState(lesson.endTime ?? "");
  const [submitting, setSubmitting] = useState(false);

  const now = tashkentNow();
  const newDateStr = newDate ? format(newDate, "yyyy-MM-dd") : null;
  const makeUpProblem =
    action !== "RESCHEDULE"
      ? null
      : !newDateStr || !startTime || !endTime
        ? "Qo'shimcha dars sanasi va vaqtini tanlang"
        : endTime <= startTime
          ? "Tugash vaqti boshlanishdan keyin bo'lishi kerak"
          : !makeUpIsAhead(newDateStr, startTime, now)
            ? "Qo'shimcha dars hali boshlanmagan bo'lishi kerak"
            : null;
  const canSubmit = reason.trim().length > 0 && makeUpProblem === null && !submitting;

  const reset = () => {
    setReason("");
    setAction("CANCEL");
    setNewDate(undefined);
    setStartTime(lesson.startTime ?? "");
    setEndTime(lesson.endTime ?? "");
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post(`/attendance/${lesson.groupId}/date/${lesson.date}/not-held`, {
        reason: reason.trim(),
        action,
        ...(action === "RESCHEDULE"
          ? { newDate: newDateStr, newLessonStartTime: startTime, newLessonEndTime: endTime }
          : {}),
      });
      toast.success(
        action === "CANCEL" ? "Dars bekor qilindi, o'quvchilarga pul qaytarildi" : "Dars boshqa kunga ko'chirildi",
      );
      reset();
      onDone();
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  const choice = (value: Action, title: string, hint: string, Icon: typeof Undo2) => (
    <button
      type="button"
      aria-pressed={action === value}
      onClick={() => setAction(value)}
      className={cn(
        "flex flex-1 items-start gap-2 rounded-lg border p-3 text-left text-sm transition-colors",
        action === value ? "border-primary bg-primary/5" : "hover:bg-muted/50",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );

  const time = lesson.startTime && lesson.endTime ? ` ${lesson.startTime}–${lesson.endTime}` : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Dars bo&apos;lmadi</DialogTitle>
          <DialogDescription>
            {lesson.groupName}, {formatLessonDay(lesson.date)}
            {time}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nega bo'lmadi? (majburiy)"
            maxLength={500}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            {choice("CANCEL", "Bekor qilish", "O'quvchilarga pul qaytadi", Undo2)}
            {choice("RESCHEDULE", "Boshqa kunga ko'chirish", "Qo'shimcha dars, pul qaytmaydi", CalendarClock)}
          </div>
          {action === "RESCHEDULE" && (
            <div className="space-y-2">
              <DatePicker
                value={newDate}
                onChange={setNewDate}
                minDate={new Date(`${now.dateStr}T00:00:00`)}
                placeholder="Qo'shimcha dars sanasi"
              />
              <div className="grid grid-cols-2 gap-2">
                <TimePicker value={startTime} onChange={setStartTime} placeholder="Boshlanishi" />
                <TimePicker value={endTime} onChange={setEndTime} placeholder="Tugashi" />
              </div>
              {makeUpProblem && <p className="text-xs text-amber-700 dark:text-amber-400">{makeUpProblem}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: The prompt, split so a popover can host the buttons**

```tsx
"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import {
  answerState,
  type AnswerState,
  type UnmarkedLessonInfo,
  type UnmarkedLessonRef,
} from "@/lib/unmarked-lesson";
import { LateAttendanceDialog } from "./late-attendance-dialog";
import { NotHeldDialog } from "./not-held-dialog";

export type UnmarkedDialog = "held" | "notHeld" | null;

/** The two answers, plus who holds the task. */
export function UnmarkedLessonButtons({
  state,
  onPick,
}: {
  state: AnswerState;
  onPick: (dialog: Exclude<UnmarkedDialog, null>) => void;
}) {
  return (
    <>
      <span className="text-xs font-semibold text-orange-800 dark:text-orange-300">Dars bo&apos;ldimi?</span>
      {state.heldBy && <span className="text-[11px] text-muted-foreground">{state.heldBy} javob bermoqda</span>}
      <div className="flex gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!state.canAnswer}
          onClick={() => onPick("held")}
          className="h-7 gap-1 px-2 text-xs text-green-700 dark:text-green-400"
        >
          <CheckCircle2 className="size-3.5" />
          Bo&apos;ldi
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!state.canAnswer}
          onClick={() => onPick("notHeld")}
          className="h-7 gap-1 px-2 text-xs text-red-700 dark:text-red-400"
        >
          <XCircle className="size-3.5" />
          Bo&apos;lmadi
        </Button>
      </div>
    </>
  );
}

/** Both dialogs, driven by one state — mount them OUTSIDE any popover. */
export function UnmarkedLessonDialogs({
  lesson,
  dialog,
  onDialogChange,
  canExempt,
  onAnswered,
}: {
  lesson: UnmarkedLessonRef;
  dialog: UnmarkedDialog;
  onDialogChange: (dialog: UnmarkedDialog) => void;
  canExempt: boolean;
  onAnswered: () => void;
}) {
  const done = () => {
    onDialogChange(null);
    onAnswered();
  };
  return (
    <>
      <LateAttendanceDialog
        open={dialog === "held"}
        onOpenChange={(o) => onDialogChange(o ? "held" : null)}
        lesson={lesson}
        canExempt={canExempt}
        onSaved={done}
      />
      <NotHeldDialog
        open={dialog === "notHeld"}
        onOpenChange={(o) => onDialogChange(o ? "notHeld" : null)}
        lesson={lesson}
        onDone={done}
      />
    </>
  );
}

/**
 * The open «Dars bo'ldimi?» bubble (spec 2026-09-29 §3.3). Draws nothing for
 * someone who may not see it — the caller falls back to its own badge.
 */
export function UnmarkedLessonPrompt({
  lesson,
  info,
  onAnswered,
  className,
}: {
  lesson: UnmarkedLessonRef;
  info: UnmarkedLessonInfo;
  onAnswered: () => void;
  className?: string;
}) {
  const user = useAuth((s) => s.user);
  const state = answerState(info, user);
  const [dialog, setDialog] = useState<UnmarkedDialog>(null);
  if (!state.visible) return null;
  return (
    <div
      className={cn(
        "inline-flex flex-col items-start gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-2 text-left shadow-sm dark:border-orange-800 dark:bg-orange-950/40",
        className,
      )}
    >
      <UnmarkedLessonButtons state={state} onPick={setDialog} />
      <UnmarkedLessonDialogs
        lesson={lesson}
        dialog={dialog}
        onDialogChange={setDialog}
        canExempt={state.canExempt}
        onAnswered={onAnswered}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check and lint the new files**

```bash
npx tsc --noEmit -p .
npx eslint src/components/attendance/unmarked src/lib/unmarked-lesson.ts src/lib/attendance-window.ts
```

Expected: no errors. (If `useAuth`'s user type does not satisfy `{ id: number; roles: { id: number }[] }`, pass `user ? { id: user.id, roles: user.roles } : null`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/attendance/unmarked
git commit -m "feat(client): «Dars bo'ldimi?» prompt with the late register and «Bo'lmadi» dialogs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 27: Schedule — list and grid

**Files:**
- Modify: `client/src/components/dashboard/dashboard-daily-schedule.tsx`
- Modify: `client/src/components/dashboard/dashboard-room-occupancy.tsx`
- Modify: `client/src/components/dashboard/schedule-client.tsx`

- [ ] **Step 1: List view**

In `dashboard-daily-schedule.tsx`: import `useAuth` from `@/hooks/use-auth`, `{ answerState, type UnmarkedLessonInfo }` from `@/lib/unmarked-lesson`, and `{ UnmarkedLessonPrompt }` from `@/components/attendance/unmarked/unmarked-lesson-prompt`. Add to `DashboardLesson`:

```ts
  /** «Dars bo'ldimi?» — set when the lesson ended unmarked (ADR-0054). */
  unmarked?: UnmarkedLessonInfo | null;
```

Add to `DashboardDailyScheduleProps`: `date: string; onAnswered?: () => void;` and destructure them. Inside the component: `const user = useAuth((s) => s.user);`. Widen the Davomat header (`<TableHead className="w-40 text-center">Davomat</TableHead>`) to `w-44`. The Davomat cell (~line 222) is an IIFE that draws the status badge. Put the prompt in front of it — change only the IIFE's opening line; its body and its closing `})()}` stay as they are:

```tsx
                <TableCell className="text-center">
                  {lesson.unmarked && answerState(lesson.unmarked, user).visible ? (
                    <UnmarkedLessonPrompt
                      lesson={{
                        groupId: lesson.groupId,
                        groupName: lesson.groupName,
                        date,
                        startTime: lesson.startTime,
                        endTime: lesson.endTime,
                      }}
                      info={lesson.unmarked}
                      onAnswered={onAnswered ?? (() => undefined)}
                    />
                  ) : (() => {
                    const att = lesson.attendanceStatus;
```

(the old opening was `{(() => {` followed by `const att = lesson.attendanceStatus;`.)

- [ ] **Step 2: Grid view**

In `dashboard-room-occupancy.tsx`: add `date: string; onAnswered?: () => void;` to `DashboardRoomOccupancyProps` and `LessonSegmentCardProps`, destructure them in both components, and pass `date={date} onAnswered={onAnswered}` where `<LessonSegmentCard` is rendered. Import `useState`, `useAuth`, `Popover`, `PopoverContent`, `PopoverTrigger` from `@/components/ui/popover`, `answerState` from `@/lib/unmarked-lesson`, and `{ UnmarkedLessonButtons, UnmarkedLessonDialogs, type UnmarkedDialog }` from the prompt file. In `LessonSegmentCard`, before `return`:

```tsx
  const user = useAuth((s) => s.user);
  const prompt = lesson.unmarked ? answerState(lesson.unmarked, user) : null;
  const [promptOpen, setPromptOpen] = useState(false);
  const [dialog, setDialog] = useState<UnmarkedDialog>(null);
  const lessonRef = {
    groupId: lesson.groupId,
    groupName: lesson.groupName,
    date,
    startTime: lesson.startTime,
    endTime: lesson.endTime,
  };
```

(These hooks must sit above the existing `if (visStart >= visEnd) return null;` early return — move that `return null` below them.) Inside the outer `div.absolute z-10`, after `</Tooltip>`:

```tsx
      {prompt?.visible && (
        <>
          <Popover open={promptOpen} onOpenChange={setPromptOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="absolute bottom-1 left-1 z-20 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow hover:bg-orange-600"
              >
                Dars bo&apos;ldimi?
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="flex w-auto flex-col items-start gap-1.5 p-3">
              <UnmarkedLessonButtons
                state={prompt}
                onPick={(d) => {
                  setPromptOpen(false);
                  setDialog(d);
                }}
              />
            </PopoverContent>
          </Popover>
          <UnmarkedLessonDialogs
            lesson={lessonRef}
            dialog={dialog}
            onDialogChange={setDialog}
            canExempt={prompt.canExempt}
            onAnswered={onAnswered ?? (() => undefined)}
          />
        </>
      )}
```

The pill is always visible on the card; its bubble opens on a tap. The dialogs live outside the popover, so closing the popover never unmounts an open dialog.

- [ ] **Step 3: Schedule page**

In `schedule-client.tsx`: take `refetch` from the query (`const { data, isPending, refetch } = useQuery({ … })`) and pass `date={dateParam} onAnswered={() => void refetch()}` to both `<DashboardRoomOccupancy` and `<DashboardDailySchedule`.

- [ ] **Step 4: Check and commit**

```bash
npx tsc --noEmit -p .
npx eslint src/components/dashboard
git add src/components/dashboard
git commit -m "feat(client): schedule asks «Dars bo'ldimi?» on unmarked lessons

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 28: Group page — lock and prompt

**Files:**
- Modify: `client/src/components/groups/attendance/attendance-form.tsx`
- Modify: `client/src/components/groups/attendance/attendance-cycle-dashboard.tsx`
- Modify: `client/src/components/groups/attendance/attendance-missed-lessons.tsx`
- Modify: `client/src/components/groups/attendance/attendance-cycle-utils.ts`
- Modify: `client/src/components/groups/attendance/attendance-month-calendar.tsx` (type only)

- [ ] **Step 1: Types carry the question**

In `attendance-month-calendar.tsx`, add to `LessonCalendarCell`: `unmarked?: UnmarkedLessonInfo | null;` (import the type from `@/lib/unmarked-lesson`). In `attendance-cycle-utils.ts`, add the same field to `LessonDate`. In `attendance-cycle-dashboard.tsx`, add it to `LessonDateLike` and copy it in `lessonDateFromCell` (`unmarked: c.unmarked ?? null,`).

- [ ] **Step 2: Missed lessons list answers in place**

Replace `attendance-missed-lessons.tsx` with:

```tsx
"use client";

import { ChevronRight as GoIcon } from "lucide-react";
import { UnmarkedLessonPrompt } from "@/components/attendance/unmarked/unmarked-lesson-prompt";
import { DAY_SHORT, formatShortDate, type LessonDate } from "./attendance-cycle-utils";

interface AttendanceMissedLessonsProps {
  cycleLessons: LessonDate[];
  todayStr: string;
  group: { id: string; name: string; lessonStartTime: string | null; lessonEndTime: string | null };
  onSelectDate: (date: string) => void;
  onAnswered: () => void;
}

export function AttendanceMissedLessons({
  cycleLessons,
  todayStr,
  group,
  onSelectDate,
  onAnswered,
}: AttendanceMissedLessonsProps) {
  const missedLessons = cycleLessons
    .filter((l) => l.unmarked?.status === "PENDING" || (!l.hasAttendance && l.date < todayStr))
    .slice(0, 5);

  if (missedLessons.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Davomat olinmagan darslar:</p>
      {missedLessons.map((lesson) => {
        const lessonIndex = cycleLessons.indexOf(lesson);
        const title = `${lessonIndex + 1}-dars (${formatShortDate(lesson.date)}, ${DAY_SHORT[lesson.dayName] ?? lesson.dayName})`;
        if (lesson.unmarked?.status === "PENDING") {
          return (
            <div
              key={lesson.date}
              className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/30"
            >
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Dars tugagan, davomat olinmagan</p>
              </div>
              <UnmarkedLessonPrompt
                lesson={{
                  groupId: group.id,
                  groupName: group.name,
                  date: lesson.date,
                  startTime: group.lessonStartTime,
                  endTime: group.lessonEndTime,
                }}
                info={lesson.unmarked}
                onAnswered={onAnswered}
              />
            </div>
          );
        }
        return (
          <button
            key={lesson.date}
            onClick={() => onSelectDate(lesson.date)}
            className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-left transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <div>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Davomat olinmagan</p>
            </div>
            <GoIcon className="size-4 text-amber-500" />
          </button>
        );
      })}
    </div>
  );
}
```

In `attendance-cycle-dashboard.tsx`: `import { useQueryClient } from "@tanstack/react-query";`, then inside the component `const queryClient = useQueryClient();` and pass to `<AttendanceMissedLessons`:

```tsx
          group={{
            id: group.id,
            name: group.name,
            lessonStartTime: group.lessonStartTime ?? null,
            lessonEndTime: group.lessonEndTime ?? null,
          }}
          onAnswered={() => void queryClient.invalidateQueries({ queryKey: ["attendance-calendar", group.id] })}
```

- [ ] **Step 3: The form locks a new register outside the window**

In `attendance-form.tsx`: import `{ newAttendanceWindow } from "@/lib/attendance-window"`. In `lessonTimeInfo`, change `if (nowMinutes > end)` to `if (nowMinutes >= end)`. After `lessonTimeInfo`:

```tsx
  // A NEW register is accepted only inside the lesson (spec 2026-09-29 §3.1),
  // for every role; after it, the lesson is answered through «Dars bo'ldimi?».
  const attendanceWindow = newAttendanceWindow({
    date,
    todayStr: tashkent.dateStr,
    nowMinutes: tashkent.minutes,
    startTime: group.lessonStartTime ?? null,
    endTime: group.lessonEndTime ?? null,
  });
  const isNewRegister = students.length > 0 && students.every((s) => s.status === null);
  const newRegisterClosed = isNewRegister && attendanceWindow !== "OPEN";
```

Change `isLocked` to:

```tsx
  const isLocked =
    alreadyTakenForTeacher ||
    (!isAdmin && lessonTimeInfo != null && lessonTimeInfo.status !== "during") ||
    (newRegisterClosed && !planningMode);
```

(`planningMode` is computed below `isLocked` today — move `isPlanningContext` and `planningMode` above `isLocked`.) Show «Hozir to'liq davomat olish» only while the window is open: wrap that `<Button>` in `{attendanceWindow === "OPEN" && ( … )}`. After the lesson time banner, add:

```tsx
      {isAdmin && newRegisterClosed && !planningMode && (attendanceWindow === "ENDED" || date < tashkent.dateStr) && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <Clock className="size-4 shrink-0" />
          Dars tugagan — davomat olish yopilgan. Dars bo&apos;lgan-bo&apos;lmaganini «Davomat olinmagan darslar» ro&apos;yxatida, «Jadval» yoki «Topshiriqlar»da belgilang.
        </div>
      )}
```

- [ ] **Step 4: Check and commit**

```bash
npx tsc --noEmit -p .
npx eslint src/components/groups/attendance
git add src/components/groups/attendance
git commit -m "feat(client): group page locks late registers and asks «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 29: Tasks and comments show system tasks

**Files:**
- Modify: `client/src/hooks/use-tasks-board.ts`
- Modify: `client/src/components/tasks/task-card.tsx`
- Modify: `client/src/components/shared/comment-list-helpers.tsx`, `client/src/components/shared/comment-item.tsx`

- [ ] **Step 1: The store**

In `use-tasks-board.ts`: import `type UnmarkedStatus` from `@/lib/unmarked-lesson` and `toast` is already imported. Add:

```ts
/** The lesson a «Dars bo'ldimi?» system task asks about (ADR-0054). */
export interface TaskLesson {
  id: string;
  groupId: string;
  groupName: string;
  date: string; // YYYY-MM-DD
  status: UnmarkedStatus;
  lessonStartTime: string;
  lessonEndTime: string;
}
```

In `TaskItem`: make `author` nullable (`author: { … } | null;`) and add `isSystem: boolean;` and `unmarkedLesson: TaskLesson | null;`. In `fetchMyTasks`' mapping type add `isSystem?: boolean;`, `author: … | null;` and

```ts
            unmarkedLesson?: {
              id: string;
              groupId: string;
              date: string;
              status: UnmarkedStatus;
              lessonStartTime: string;
              lessonEndTime: string;
              group: { name: string };
            } | null;
```

and in the returned object:

```ts
          isSystem: assignee.comment.isSystem ?? false,
          unmarkedLesson: assignee.comment.unmarkedLesson
            ? {
                id: assignee.comment.unmarkedLesson.id,
                groupId: assignee.comment.unmarkedLesson.groupId,
                groupName: assignee.comment.unmarkedLesson.group.name,
                date: assignee.comment.unmarkedLesson.date.slice(0, 10),
                status: assignee.comment.unmarkedLesson.status,
                lessonStartTime: assignee.comment.unmarkedLesson.lessonStartTime,
                lessonEndTime: assignee.comment.unmarkedLesson.lessonEndTime,
              }
            : null,
```

In `fetchCreatedTasks`' mapping add `isSystem: false, unmarkedLesson: null,` (system tasks have no author, so they never appear there). In `moveTask`, right after `if (!task) return;`:

```ts
    if (task.isSystem && newStatus === "DONE") {
      toast.error("Bu topshiriq darsga javob berilganda o'zi yopiladi");
      return;
    }
```

- [ ] **Step 2: The card**

In `task-card.tsx`: import `Bot` from `lucide-react` and `{ UnmarkedLessonPrompt }` from the prompt file. Replace the `authorInitials` line with:

```tsx
  const authorInitials = task.author
    ? task.author.firstName.charAt(0) + task.author.lastName.charAt(0)
    : "";
```

After the entity-link block, add:

```tsx
        {task.unmarkedLesson?.status === "PENDING" && (
          // Stop the card's drag and click from firing inside the prompt and
          // its dialogs (React events bubble through portals).
          <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <UnmarkedLessonPrompt
              lesson={{
                groupId: task.unmarkedLesson.groupId,
                groupName: task.unmarkedLesson.groupName,
                date: task.unmarkedLesson.date,
                startTime: task.unmarkedLesson.lessonStartTime,
                endTime: task.unmarkedLesson.lessonEndTime,
              }}
              info={{ id: task.unmarkedLesson.id, status: task.unmarkedLesson.status, claimedBy: null }}
              onAnswered={() => void useTasksBoard.getState().fetchMyTasks()}
              className="w-full"
            />
          </div>
        )}
```

and replace the footer's author block with:

```tsx
          {task.author ? (
            <div className="flex items-center gap-1.5">
              <Avatar className="size-5">
                {task.author.photo && <AvatarImage src={task.author.photo} alt={task.author.firstName} />}
                <AvatarFallback className="text-[8px]">{authorInitials}</AvatarFallback>
              </Avatar>
              <span className="text-[11px] text-muted-foreground truncate max-w-24">
                {task.author.firstName} {task.author.lastName}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                <Bot className="size-3 text-muted-foreground" />
              </span>
              <span className="text-[11px] text-muted-foreground">Tizim</span>
            </div>
          )}
```

- [ ] **Step 3: Comments on the group page**

In `comment-list-helpers.tsx`, change `author: CommentAuthor;` to `author: CommentAuthor | null;`. In `comment-item.tsx`: `const isAuthor = comment.author?.id === currentUserId;`; in the non-system avatar branch use `comment.author?.photo`, `comment.author?.firstName?.[0]`, `comment.author?.lastName?.[0]`; the author line becomes

```tsx
              {comment.author ? `${comment.author.firstName} ${comment.author.lastName}` : "Tizim"}
```

and hide the «Bajarildi» button for system tasks: wrap it in `{!comment.isSystem && ( … )}`.

- [ ] **Step 4: Check and commit**

```bash
npx tsc --noEmit -p .
npx eslint src/hooks/use-tasks-board.ts src/components/tasks src/components/shared/comment-item.tsx src/components/shared/comment-list-helpers.tsx
git add src/hooks/use-tasks-board.ts src/components/tasks src/components/shared/comment-item.tsx src/components/shared/comment-list-helpers.tsx
git commit -m "feat(client): system tasks show «Tizim» and answer the lesson in place

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 30: Documentation

**Files:**
- Create: `docs/adr/0054-davomat-olinmagan-dars-ustoz-haqisiz.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md`

- [ ] **Step 1: ADR-0054 (Uzbek)**

```markdown
# ADR-0054 — Dars tugaguncha davomat olinmasa, ustozga o'sha dars uchun haq yozilmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** spec `docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md`, `server/src/unmarked-lessons/`, `server/src/salary/salary-accrual.service.ts` (`createAccrual`), `server/src/salary/shared/gap-sweep.ts` (`forfeitedLessons`), ADR-0025, ADR-0053

## Kontekst

Oylik to'lovda o'quvchi oyning darslari uchun oldindan to'laydi; davomat faqat
ustoz haqini va uzrli dars kreditini hal qiladi. Davomat olinmagan dars markaz
tushumiga kirmasdi, ustozga esa davomat istalgan kuni keyin kiritilsa haq
yozilardi — o'z vaqtida olmaslik hech narsaga olib kelmasdi. Dars aslida
bo'lmagan bo'lsa, pul qo'lda bekor qilinmaguncha qaytmasdi (ADR-0053). Tizim
«dars bo'lmadi» bilan «davomat unutildi»ni ajrata olmaydi.

## Qaror

1. Yangi davomat faqat dars kuni, boshlanishidan 10 daqiqa oldindan tugashigacha
   kiritiladi — hamma rol uchun, CEO ham. Olingan davomatni administrator keyin
   ham tuzata oladi.
2. Dars tugab davomat bo'lmasa, `UnmarkedLesson` yozuvi va filial
   administratorlariga tizim topshirig'i ochiladi: «Dars bo'ldimi?». Birinchi
   o'zgartirgan administrator topshiriqni oladi.
3. «Bo'ldi» — davomat kech kiritiladi, dars markaz tushumiga kiradi, ustozga
   **haq yozilmaydi**. Qulf ikki joyda: `createAccrual` (har bir yozuv) va
   `sweepGapLessons`ning majburiy `forfeitedLessons` kirishi (oylik hisobi,
   markaz qo'shimchasi, «Qolgan (markaz)»).
4. Faqat CEO «Ustoz aybdor emas» deb belgilay oladi (sabab bilan) — dars
   odatdagidek haq beradi. Qoidadan oldingi izsiz kunlar ham shunday ochiladi.
5. «Bo'lmadi» — bekor qilish (pul darhol qaytadi, ADR-0053) yoki keyingi
   kunga ko'chirish (qo'shimcha dars, pul qaytmaydi). Telegram guruhiga
   **darhol** xabar boradi — ADR-0025 dagi darhol yuboriladiganlar ro'yxatiga
   qo'shimcha.
6. Javob bo'lmasa, tizim taxmin qilmaydi: ertasi ish kuni 09:00 da eslatma,
   21:00 hisobotida 1 kundan ortiq javobsizlar soni.

## Oqibatlar

- Ustoz davomatni dars ichida olishga majbur: dars oxirigacha 30 daqiqa
  qolganda «olinmasa haq yozilmaydi» ogohlantirishi boradi.
- Bekor qilish yoki ko'chirish qaysi sahifadan qilinmasin, savolga javob
  bo'ladi va guruhga xabar ketadi. Bekor qilish/ko'chirish o'chirilsa, savol
  qayta ochiladi.
- Yangi ustoz akkauntsiz dars o'tgan yoki server ishlamagan holatlar faqat CEO
  istisnosi bilan to'lanadi.

## Ko'rib chiqilgan va rad etilgan

- **«Davomatsiz o'tdi» yozuvi** (kim kelgani yozilmasdan) — statistika, uzrli
  kredit va kelmaganlar sanog'i buzilardi; CEO «kim keldi»ni ham kiritishni
  talab qildi.
- **Telegramda javob tugmalari** — davomat ro'yxatini Telegramda to'ldirib
  bo'lmaydi; guruh tugmasini kim bosgani ishonchli emas, tugma esa pul qaytaradi.
- **Javobsiz darsni tizim o'zi hal qilsin** — ADR-0053 dagi sabab: tizim
  taxmin qilmaydi.
```

- [ ] **Step 2: Index**

Append to the table in `docs/adr/README.md`:

```markdown
| [0054](0054-davomat-olinmagan-dars-ustoz-haqisiz.md) | Dars tugaguncha davomat olinmasa — «Dars bo'ldimi?»; «Bo'ldi» bo'lsa ustozga haq yozilmaydi | Qabul qilindi | 2026-09-30 |
```

Before merging, re-check that 0054 is still free on `origin/main`; if taken, `git mv` to the next free number and update the three references (README, `server/CLAUDE.md`, code comments that say ADR-0054).

- [ ] **Step 3: `server/CLAUDE.md`**

In "Date & Time Validation (`validateLessonDate`)", replace item 7's Teacher bullet block with:

```markdown
7. **Lesson time check** (server-side `new Date()`, not client time):
   - **Teacher** — only TODAY's lesson (Tashkent date), from 10 minutes before `lessonStartTime` until `lessonEndTime` (the end minute is closed).
   - **CEO, Branch Director, Administrator** — no time check here. The NEW-register window below applies to them too.
8. **New-register window (ADR-0054)** — `AttendanceSaveService.save` and QR `startSession` accept a register with no rows yet only inside `attendance/shared/attendance-window.ts`'s window, for every role; after the lesson the only way in is `POST /attendance/:groupId/date/:date/late`. Editing a register that exists stays open to CEO/BD/Admin. Planned absences are unaffected (they validate through `validateLessonDate` only).
```

Add a new subsection after "Attendance Reminder Notifications":

```markdown
#### Unmarked lessons — «Dars bo'ldimi?» (ADR-0054)

- `UnmarkedLesson` = "nobody marked this lesson before it ended". Opened by `AttendanceReminderService` (every :00/:30 tick and a 23:00 run, Sundays included) through `UnmarkedLessonsService.openForEndedLessons` — Serializable, it reads attendance, so a register saved at the same moment conflicts and one side aborts. Lesson days come from `attendance/shared/ended-lessons.ts` (schedule, moves, cancellations, holidays).
- Each row gets a system task (`Comment` with `isSystem`, `isTask`, `authorId: null`) for the branch's administrators (fallback directors, then CEOs), due next working day 10:00. The first administrator to change its status or answer takes it (`claimSystemTask`, the others' copies are deleted, `UnmarkedLesson.claimedById`). `DONE` only by answering; system tasks cannot be edited or deleted; no `task.assigned` notification.
- «Bo'ldi» = `POST …/late` (`AttendanceSaveService.saveLate`): roster of THAT day (`roster-on-date.ts`), row → HELD before billing, task closed, no `attendance.completed`, `unmarked-lesson.held` → teacher told (digest category `LESSON_PAY_FORFEITED`). «Bo'lmadi» = `POST …/not-held` → `LessonCancellationsService.create` or `LessonReschedulesService.create`; their own transactions answer the row (`unmarked-lesson-transitions.ts`), so the group page does the same, and `unmarked-lesson.not-held` sends the Telegram group notice at once. Deleting the cancellation/reschedule re-asks.
- **Teacher pay:** a row with `teacherPayExempt = false` ⇒ no `SalaryAccrual` for that `(groupId, date)`, ever. Two locks: `createAccrual` (`isLessonPayForfeited`) and `sweepGapLessons`' required `forfeitedLessons` (loaded with `loadForfeitedLessonKeys`). Do not add a third path that writes accruals or forecasts pay from attendance without one of them. Only the CEO (from the DB) may exempt; backfilled pre-rule rows are exempt.
- Revenue needs nothing: «Bo'ldi» writes attendance, `valueHeldLessons` finds it.
```

In the reminder table, change rows 4–5 to "When the lesson-end sweep opens the question (any end time)".

- [ ] **Step 4: `client/CLAUDE.md`**

Add under "Lesson Changes Tab" a new section:

```markdown
### «Dars bo'ldimi?» (ADR-0054)

- A lesson that ended unmarked carries `unmarked: { id, status, claimedBy }` in `GET /dashboard/today-schedule` and in the group calendar cells. `answerState` (`lib/unmarked-lesson.ts`) decides who sees the prompt (Admin/BD/CEO) and who may answer (the task holder, BD and CEO always).
- One component set: `components/attendance/unmarked/unmarked-lesson-prompt.tsx` (bubble), `late-attendance-dialog.tsx` («Bo'ldi», roster `?late=1`, CEO-only exemption), `not-held-dialog.tsx` («Bo'lmadi»: cancel or move — the make-up must be ahead of now). Used by the schedule list (inline), the schedule grid (a pill + popover; the dialogs are mounted OUTSIDE the popover so closing it never unmounts a dialog), the group page's missed-lessons list, and the task card.
- The attendance form mirrors the server window (`lib/attendance-window.ts`): a new register outside the lesson is locked for everyone; admins see why.
- System tasks: `author` is `null` → «Tizim»; moving one to «Bajarildi» is refused client-side (the server refuses too).
```

- [ ] **Step 5: Spec touch-ups**

In the spec: §3.3 first bullet → "**Topshiriqlar** — the task card carries the same «Bo'ldi» / «Bo'lmadi» buttons (answering in place instead of navigating to the schedule)"; §4 model: add `claimedById Int?`; §3.3 grid view: "the schedule's grid shows an always-visible «Dars bo'ldimi?» pill that opens the buttons; the list view shows the bubble open".

- [ ] **Step 6: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat
git add docs/adr/0054-davomat-olinmagan-dars-ustoz-haqisiz.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md docs/superpowers/specs/2026-09-29-davomat-olinmagan-dars-design.md
git commit -m "docs: ADR-0054 and docs for «Dars bo'ldimi?»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 31: Final verification

- [ ] **Step 1: Server**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ustoz-otgan-kun-davomat/server
npm run typecheck && npx eslint src --quiet && npm test -- --silent && npm run build
```

Expected: every command exits 0; all suites pass.

- [ ] **Step 2: Client**

```bash
cd ../client
npx tsc --noEmit -p . && npm run lint 2>&1 | tail -5 && npm test && npm run build
```

Expected: typecheck exit 0; lint "0 errors"; vitest all pass; build succeeds.

- [ ] **Step 3: Manual check on local servers (dev database)**

Start both dev servers, sign in as an Administrator of a branch with a lesson that ends in the next minutes, and check: (1) before the end the form saves; (2) after the end the form is locked with the banner; (3) within 30 minutes a «Dars bo'ldimi?» task appears under «Topshiriqlar» with «Tizim» as author, and the schedule shows the prompt; (4) «Bo'ldi» saves the register and the task goes to «Bajarildi»; (5) on another lesson, «Bo'lmadi → Boshqa kunga ko'chirish» with a past time is refused, a future time works. Use the dev database only.

- [ ] **Step 4: Report**

Write down which checks passed and anything that did not, before any merge or deploy discussion.

## Deploy Notes (not part of this plan's execution)

The final review (30.09) changed this order: the server no longer goes out first, and the site is built ahead but switched to only once the server is up.

1. Needs CEO approval. At merge, check that ADR number 0054 is still free on `main`.
2. Build the site on Vercel (`vercel --prod`), but do not move the five domains (admin, lehrer, student, form, invoice) to it yet.
3. `railway up` the server, not before 23:00 Tashkent on its day: the sweep has no cutoff date, so a daytime deploy would open normal, unpaid questions for that day's lessons that ended before it. The migration runs on boot (`prisma migrate deploy` in `start:prod`).
4. As soon as Railway reports SUCCESS, move the five domains to the new site build (`vercel alias set`). No gap either way: the old site crashes on author-less «Tizim» tasks, and the new site needs the server's new routes.
5. The next day, the backfill: dry run → the CEO reviews the list → `--apply --expect=N`.
6. First day: check the first rows, tasks, the teacher/admin Telegram texts, the instant group notice, and the 21:00 line.
7. 01.10 02:00 settles September payroll: forfeited lessons are excluded by both locks; exempt (backfilled) lessons pay as usual.
8. Open PRs #595 / #596 / #598 (ADR-0047–0049) are integrated after this release, on top of it.
