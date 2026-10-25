# Student chat — backend core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the server side of the student-to-student text chat: who may write (debt, profile, verified phone, weekly practice), `@username`, privacy, blocking, search, conversations, text messages and live delivery — behind a `chat.enabled` switch that stays off.

**Architecture:** New Nest module `src/chat/` with plain Prisma tables. One pure rules file decides access; `ChatAccessService` feeds it from the database; the other services (username, people, conversations) call it. Live delivery reuses `NotificationsGateway.sendToUser` (existing SSE). All routes are `@StudentOnly()` behind `StudentCardGuard`.

**Tech Stack:** NestJS, Prisma (PostgreSQL), Jest, class-validator, Redis (`RedisService`), existing `SettingsService`.

Spec: `docs/superpowers/specs/2026-10-25-oquvchilar-chati-design.md`.

**Out of this plan (own plans, written after this one lands):**
- **Plan B — media, reports, notifications:** images and voice, `R2_CHAT_BUCKET_NAME` storage, nightly purge, `ChatReport` + CEO routes + `Student.chatBannedAt` writer, `CHAT_MESSAGE` bell/push, Telegram button, the ADR-0025 exception ADR.
- **Plan C — clients:** web portal, Telegram Mini App, `student-app`, CEO pages, Lumio chat screens.

## Global Constraints

- Uzbek (Latin) for every user-visible string; no English words on screen. Code, comments, commits in English.
- Day boundaries only through `common/date/tashkent` (`tashkentDateStr`, `addDaysToDateStr`, `utcMidnightFromDateStr`); never `new Date().getDate()`.
- Weekly window: today plus the 6 days before it (7 Tashkent days). Defaults: `chat.weekMinutesActive` = 60, `chat.weekMinutesRadio` = 30, `chat.enabled` = false. All three company-level, CEO only.
- Phone/debt/balance of one student are never returned to another student.
- Username: lowercase, 5–32 chars, `[a-z0-9_]`, must start with a letter, unique among live students.
- Limits: text 2000 chars, 30 messages/minute/student.
- Send checks run in this order: access → conversation membership → block → recipient privacy → rate limit.
- Every route: `@StudentOnly()` + `StudentCardGuard` at class level; the student id comes from the token only, never the request.
- Run `npx prettier --write` on every touched server `.ts` before committing. Server tests: `npx jest <path>` from `server/`. Do not run `npm run build` in parallel with tests.
- One deliberate deviation from the spec: the phone condition uses `isPhoneVerified` directly (not `missingOnboardingSteps`), because that function only asks for the phone while `STUDENT_PHONE_VERIFICATION_ENABLED` is on. Chat must not open for an unproved number.

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | enums, `Student.username/chatBannedAt`, `Chat*` models |
| `prisma/migrations/20261025100000_student_chat/migration.sql` | hand-written idempotent migration |
| `src/settings/settings.types.ts` | three new setting keys |
| `src/chat/chat.constants.ts` | messages and limits |
| `src/chat/access/chat-access.rules.ts` | pure: quota window, lock reasons, Uzbek texts |
| `src/chat/access/chat-access.service.ts` | reads DB + settings, returns `ChatAccess` |
| `src/chat/username/chat-username.rules.ts` | pure: normalise + validate |
| `src/chat/username/chat-username.service.ts` | set/clear username |
| `src/chat/people/chat-people.rules.ts` | pure: privacy checks |
| `src/chat/people/chat-people.service.ts` | privacy, block, search, group-mate test |
| `src/chat/conversations/chat-conversations.service.ts` | open, list, messages, send, read, delete |
| `src/chat/dto/chat.dto.ts` | all DTOs |
| `src/chat/chat.controller.ts` | all student routes |
| `src/chat/chat.module.ts` | wiring; registered in `app.module.ts` |
| `src/common/auth/branch-route-policy.ts`, `src/common/permissions/route-access.snapshot.json` | route manifests |
| `server/CLAUDE.md` | one short section |

---

### Task 1: Schema, migration, settings keys

**Files:**
- Modify: `server/prisma/schema.prisma` (Student model near line 697; append new models at end of file)
- Create: `server/prisma/migrations/20261025100000_student_chat/migration.sql`
- Modify: `server/src/settings/settings.types.ts`
- Create: `server/src/chat/chat-settings.spec.ts`

**Interfaces:**
- Produces: Prisma types `ChatConversation`, `ChatMessage`, `ChatReadState`, `ChatBlock`, `ChatPrivacy`, `ChatReport`, enums `ChatMessageKind`, `ChatWho`, `ChatFindWho`, `ChatReportStatus`; `Student.username: string | null`, `Student.chatBannedAt: Date | null`; setting keys `'chat.enabled'` (boolean), `'chat.weekMinutesActive'` (number), `'chat.weekMinutesRadio'` (number).

- [ ] **Step 1: Write the failing settings test**

Create `server/src/chat/chat-settings.spec.ts`:

```ts
import { getSettingDefinition } from '../settings/settings.types';

describe('chat settings', () => {
  it('has the agreed defaults', () => {
    expect(getSettingDefinition('chat.enabled').defaultValue).toBe(false);
    expect(getSettingDefinition('chat.weekMinutesActive').defaultValue).toBe(60);
    expect(getSettingDefinition('chat.weekMinutesRadio').defaultValue).toBe(30);
  });

  it('is company-level only', () => {
    for (const k of [
      'chat.enabled',
      'chat.weekMinutesActive',
      'chat.weekMinutesRadio',
    ] as const) {
      expect(getSettingDefinition(k).companyLevelOnly).toBe(true);
    }
  });

  it('refuses nonsense minutes', () => {
    const def = getSettingDefinition('chat.weekMinutesActive');
    expect(def.parse(90)).toBe(90);
    expect(() => def.parse(-1)).toThrow();
    expect(() => def.parse(1001)).toThrow();
    expect(() => def.parse(1.5)).toThrow();
    expect(() => def.parse('60')).toThrow();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run (from `server/`): `npx jest src/chat/chat-settings.spec.ts`
Expected: FAIL (type error / undefined definition for `chat.enabled`).

- [ ] **Step 3: Add the three keys to `settings.types.ts`**

In the `SettingKey` union add after `| 'participation.minAppPercent.B1'` (end the union there with `;` moved):

```ts
  | 'participation.minAppPercent.B1'
  | 'chat.enabled'
  | 'chat.weekMinutesActive'
  | 'chat.weekMinutesRadio';
```

In `SettingValueMap` add before the closing `}`:

```ts
  'chat.enabled': boolean;
  'chat.weekMinutesActive': number;
  'chat.weekMinutesRadio': number;
```

In `SETTING_DEFINITIONS`, after the `'participation.minAppPercent.B1'` entry add (the helpers `parseBoolean` and `parseIntInRange` already exist in this file):

```ts
  // Student chat (spec 2026-10-25): read by `ChatAccessService` per company.
  'chat.enabled': {
    key: 'chat.enabled',
    defaultValue: false,
    parse: (raw) => parseBoolean('chat.enabled', raw),
    companyLevelOnly: true,
  },
  'chat.weekMinutesActive': {
    key: 'chat.weekMinutesActive',
    defaultValue: 60,
    parse: (raw) => parseIntInRange('chat.weekMinutesActive', raw, 0, 1000),
    companyLevelOnly: true,
  },
  'chat.weekMinutesRadio': {
    key: 'chat.weekMinutesRadio',
    defaultValue: 30,
    parse: (raw) => parseIntInRange('chat.weekMinutesRadio', raw, 0, 1000),
    companyLevelOnly: true,
  },
```

- [ ] **Step 4: Run the settings test, expect pass**

Run: `npx jest src/chat/chat-settings.spec.ts src/settings`
Expected: PASS (existing settings specs stay green; if one enumerates all keys, add the three new ones to its list).

- [ ] **Step 5: Edit the Prisma schema**

In `model Student`, replace

```prisma
  photo                  String?
  comment                String?
```

with

```prisma
  photo                  String?
  /// Chat handle (spec 2026-10-25): lowercase, unique among live students via
  /// a partial index written by hand in the migration.
  username               String?
  /// Set by the CEO after a report: the student reads chats but cannot write.
  chatBannedAt           DateTime?
  comment                String?
```

Append at the end of `schema.prisma`:

```prisma
enum ChatMessageKind {
  TEXT
  IMAGE
  VOICE
}

/// Who may write to me / see my photo.
enum ChatWho {
  EVERYONE
  GROUPMATES
  NOBODY
}

/// Who may find me by name (an exact `@username` always finds me).
enum ChatFindWho {
  EVERYONE
  NOBODY
}

enum ChatReportStatus {
  OPEN
  RESOLVED
  DISMISSED
}

/// One conversation between two students. `studentLowId` < `studentHighId`,
/// so a pair can never have two rows.
model ChatConversation {
  id            String    @id @default(uuid())
  companyId     Int
  studentLowId  Int
  studentHighId Int
  lastMessageAt DateTime?
  createdAt     DateTime  @default(now())

  messages ChatMessage[]
  reads    ChatReadState[]

  @@unique([studentLowId, studentHighId])
  @@index([studentLowId, lastMessageAt])
  @@index([studentHighId, lastMessageAt])
  @@index([companyId])
}

model ChatMessage {
  id             String          @id @default(uuid())
  conversationId String
  senderId       Int
  kind           ChatMessageKind @default(TEXT)
  text           String?
  fileKey        String?
  mime           String?
  sizeBytes      Int?
  durationSec    Int?
  createdAt      DateTime        @default(now())
  deletedAt      DateTime?
  mediaPurgedAt  DateTime?

  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt, id])
}

/// What each participant has read: unread = the other side's messages newer
/// than `lastReadAt`.
model ChatReadState {
  conversationId String
  studentId      Int
  lastReadAt     DateTime @default(now())

  conversation ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@id([conversationId, studentId])
}

model ChatBlock {
  blockerId Int
  blockedId Int
  createdAt DateTime @default(now())

  @@id([blockerId, blockedId])
  @@index([blockedId])
}

model ChatPrivacy {
  studentId    Int         @id
  whoCanWrite  ChatWho     @default(EVERYONE)
  whoCanFind   ChatFindWho @default(EVERYONE)
  whoSeesPhoto ChatWho     @default(EVERYONE)
  updatedAt    DateTime    @updatedAt
}

/// A report keeps a copy of the last 50 messages (written by Plan B).
model ChatReport {
  id             String           @id @default(uuid())
  companyId      Int
  reporterId     Int
  reportedId     Int
  conversationId String
  reason         String
  snapshot       Json
  status         ChatReportStatus @default(OPEN)
  createdAt      DateTime         @default(now())
  resolvedAt     DateTime?
  resolvedById   Int?
  resolutionNote String?

  @@index([companyId, status, createdAt])
}
```

- [ ] **Step 6: Write the migration**

Create `server/prisma/migrations/20261025100000_student_chat/migration.sql`:

```sql
-- Student chat (spec 2026-10-25). Idempotent, like the other hand-written migrations.
DO $$ BEGIN CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'IMAGE', 'VOICE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatWho" AS ENUM ('EVERYONE', 'GROUPMATES', 'NOBODY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatFindWho" AS ENUM ('EVERYONE', 'NOBODY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ChatReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "chatBannedAt" TIMESTAMP(3);

-- Prisma cannot express a partial unique index: a username is unique only among live cards.
CREATE UNIQUE INDEX IF NOT EXISTS "Student_username_live_key"
  ON "Student"("username") WHERE "deletedAt" IS NULL AND "username" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "ChatConversation" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "studentLowId" INTEGER NOT NULL,
  "studentHighId" INTEGER NOT NULL,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChatConversation_studentLowId_studentHighId_key"
  ON "ChatConversation"("studentLowId", "studentHighId");
CREATE INDEX IF NOT EXISTS "ChatConversation_studentLowId_lastMessageAt_idx"
  ON "ChatConversation"("studentLowId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_studentHighId_lastMessageAt_idx"
  ON "ChatConversation"("studentHighId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "ChatConversation_companyId_idx" ON "ChatConversation"("companyId");

CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" INTEGER NOT NULL,
  "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
  "text" TEXT,
  "fileKey" TEXT,
  "mime" TEXT,
  "sizeBytes" INTEGER,
  "durationSec" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "mediaPurgedAt" TIMESTAMP(3),
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChatMessage_conversationId_createdAt_id_idx"
  ON "ChatMessage"("conversationId", "createdAt", "id");

CREATE TABLE IF NOT EXISTS "ChatReadState" (
  "conversationId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("conversationId", "studentId"),
  CONSTRAINT "ChatReadState_conversationId_fkey" FOREIGN KEY ("conversationId")
    REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ChatBlock" (
  "blockerId" INTEGER NOT NULL,
  "blockedId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("blockerId", "blockedId")
);
CREATE INDEX IF NOT EXISTS "ChatBlock_blockedId_idx" ON "ChatBlock"("blockedId");

CREATE TABLE IF NOT EXISTS "ChatPrivacy" (
  "studentId" INTEGER NOT NULL,
  "whoCanWrite" "ChatWho" NOT NULL DEFAULT 'EVERYONE',
  "whoCanFind" "ChatFindWho" NOT NULL DEFAULT 'EVERYONE',
  "whoSeesPhoto" "ChatWho" NOT NULL DEFAULT 'EVERYONE',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatPrivacy_pkey" PRIMARY KEY ("studentId")
);

CREATE TABLE IF NOT EXISTS "ChatReport" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "reporterId" INTEGER NOT NULL,
  "reportedId" INTEGER NOT NULL,
  "conversationId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "status" "ChatReportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" INTEGER,
  "resolutionNote" TEXT,
  CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ChatReport_companyId_status_createdAt_idx"
  ON "ChatReport"("companyId", "status", "createdAt");
```

- [ ] **Step 7: Apply to the dev database and regenerate the client**

`migrate dev` is broken in this repo; use the manual flow from `CLAUDE.local.md` (run from `server/`, `server/.env` must exist — symlink it from the main checkout in a worktree):

```bash
npx prisma db execute --file prisma/migrations/20261025100000_student_chat/migration.sql
npx prisma migrate resolve --applied 20261025100000_student_chat
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script
```

Expected: the last command prints only the partial index drop (`Student_username_live_key`) or nothing. Any other statement means the SQL and the schema disagree — fix the migration, do not edit the schema to match.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`
Expected: no errors.

```bash
npx prettier --write src/chat/chat-settings.spec.ts src/settings/settings.types.ts
git add prisma/schema.prisma prisma/migrations/20261025100000_student_chat src/settings/settings.types.ts src/chat/chat-settings.spec.ts
git commit -m "feat(chat): schema, migration and settings keys for the student chat"
```

---

### Task 2: Access rules (pure)

**Files:**
- Create: `server/src/chat/chat.constants.ts`
- Create: `server/src/chat/access/chat-access.rules.ts`
- Test: `server/src/chat/access/chat-access.rules.spec.ts`

**Interfaces:**
- Consumes: `addDaysToDateStr` (`common/date/tashkent`), `isPhoneVerified` (`students/shared/student-onboarding`).
- Produces:
  - `type DayUsage = { day: string; activeSeconds: number; radioSeconds: number }`
  - `type Quota = { activeMin: number; radioMin: number }`
  - `type QuotaResult = { windowDays: 7; activeMin; radioMin; quota: Quota; ok: boolean; missingActiveMin; missingRadioMin; tomorrow: { needActiveMin: number; needRadioMin: number } | null }`
  - `evaluateQuota(days: DayUsage[], today: string, quota: Quota): QuotaResult`
  - `type ChatLockReason = 'BANNED' | 'DEBT' | 'GENDER' | 'BIRTH_DATE' | 'PHONE' | 'QUOTA'`
  - `type AccessFacts = { balance: number; gender: Gender | null; dateOfBirth: Date | null; phone: string; verifiedPhone: string | null; chatBannedAt: Date | null }`
  - `lockReasons(f: AccessFacts, q: QuotaResult): ChatLockReason[]`
  - `reasonText(reason: ChatLockReason, q: QuotaResult): string`
  - `tomorrowWarning(q: QuotaResult): string | null`
  - constants `WINDOW_DAYS`, `CHAT_OFF_MESSAGE`, `MESSAGE_MAX`, `RATE_PER_MINUTE`, `RESTRICTED_MESSAGE`, `I_BLOCKED_MESSAGE`.

- [ ] **Step 1: Write the failing test**

Create `server/src/chat/access/chat-access.rules.spec.ts`:

```ts
import {
  evaluateQuota,
  lockReasons,
  reasonText,
  tomorrowWarning,
  type AccessFacts,
  type DayUsage,
} from './chat-access.rules';

const TODAY = '2026-10-25';
const quota = { activeMin: 60, radioMin: 30 };
const day = (d: string, a: number, r: number): DayUsage => ({
  day: d,
  activeSeconds: a * 60,
  radioSeconds: r * 60,
});

describe('evaluateQuota', () => {
  it('counts today and the six days before it, not the seventh', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 60, 30), day('2026-10-18', 999, 999)],
      TODAY,
      quota,
    );
    expect(q.activeMin).toBe(60); // 19.10 is the oldest day inside the window
    expect(q.radioMin).toBe(30);
    expect(q.ok).toBe(true);
  });

  it('is not ok one minute short and reports what is missing', () => {
    const q = evaluateQuota([day('2026-10-25', 59, 29)], TODAY, quota);
    expect(q.ok).toBe(false);
    expect(q.missingActiveMin).toBe(1);
    expect(q.missingRadioMin).toBe(1);
  });

  it('floors partial minutes', () => {
    const q = evaluateQuota(
      [{ day: TODAY, activeSeconds: 3599, radioSeconds: 1800 }],
      TODAY,
      quota,
    );
    expect(q.activeMin).toBe(59);
    expect(q.ok).toBe(false);
  });

  it('is always ok when the quota is zero', () => {
    expect(evaluateQuota([], TODAY, { activeMin: 0, radioMin: 0 }).ok).toBe(true);
  });

  it('warns when the oldest day leaving the window breaks the quota tomorrow', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 40, 0), day('2026-10-25', 20, 30)],
      TODAY,
      quota,
    );
    expect(q.ok).toBe(true);
    expect(q.tomorrow).toEqual({ needActiveMin: 40, needRadioMin: 0 });
  });

  it('gives no warning when tomorrow still holds', () => {
    const q = evaluateQuota([day('2026-10-25', 60, 30)], TODAY, quota);
    expect(q.tomorrow).toBeNull();
  });

  it('gives no warning when already locked', () => {
    const q = evaluateQuota([], TODAY, quota);
    expect(q.ok).toBe(false);
    expect(q.tomorrow).toBeNull();
  });
});

const good: AccessFacts = {
  balance: 0,
  gender: 'MALE',
  dateOfBirth: new Date('2000-01-01'),
  phone: '901234567',
  verifiedPhone: '901234567',
  chatBannedAt: null,
};
const okQuota = evaluateQuota([day(TODAY, 60, 30)], TODAY, quota);
const badQuota = evaluateQuota([], TODAY, quota);

describe('lockReasons', () => {
  it('is empty when everything holds', () => {
    expect(lockReasons(good, okQuota)).toEqual([]);
  });

  it('flags debt, only for a negative balance', () => {
    expect(lockReasons({ ...good, balance: -1 }, okQuota)).toEqual(['DEBT']);
    expect(lockReasons({ ...good, balance: 5000 }, okQuota)).toEqual([]);
  });

  it('flags a missing profile and an unproved phone', () => {
    expect(
      lockReasons({ ...good, gender: null, dateOfBirth: null }, okQuota),
    ).toEqual(['GENDER', 'BIRTH_DATE']);
    expect(lockReasons({ ...good, verifiedPhone: null }, okQuota)).toEqual([
      'PHONE',
    ]);
    // staff changed the number after the proof: unverified again
    expect(
      lockReasons({ ...good, phone: '907777777' }, okQuota),
    ).toEqual(['PHONE']);
  });

  it('flags a ban and a short quota, in a stable order', () => {
    expect(
      lockReasons({ ...good, chatBannedAt: new Date() }, badQuota),
    ).toEqual(['BANNED', 'QUOTA']);
  });
});

describe('texts', () => {
  it('names both missing minutes', () => {
    const q = evaluateQuota([day(TODAY, 42, 10)], TODAY, quota);
    expect(reasonText('QUOTA', q)).toBe(
      'Ochish uchun yana 18 daqiqa ishlang va 20 daqiqa radio eshiting.',
    );
  });

  it('names only the missing half', () => {
    const q = evaluateQuota([day(TODAY, 60, 10)], TODAY, quota);
    expect(reasonText('QUOTA', q)).toBe(
      'Ochish uchun yana 20 daqiqa radio eshiting.',
    );
  });

  it('writes the tomorrow warning', () => {
    const q = evaluateQuota(
      [day('2026-10-19', 40, 0), day('2026-10-25', 20, 30)],
      TODAY,
      quota,
    );
    expect(tomorrowWarning(q)).toBe(
      'Ertaga yozish yopiladi. Bugun yana 40 daqiqa ishlang.',
    );
    expect(tomorrowWarning(okQuota)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx jest src/chat/access/chat-access.rules.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the constants**

Create `server/src/chat/chat.constants.ts`:

```ts
export const CHAT_OFF_MESSAGE = 'Chat hozircha ochilmagan';
export const MESSAGE_MAX = 2000;
export const RATE_PER_MINUTE = 30;
/** The same words for a block and a privacy refusal: a block is never revealed. */
export const RESTRICTED_MESSAGE = "Bu o'quvchi sizga yozishni cheklagan";
export const I_BLOCKED_MESSAGE =
  "Siz bu o'quvchini bloklagansiz. Avval blokdan chiqaring";
export const RATE_MESSAGE = 'Juda tez yozyapsiz. Biroz kuting';
```

- [ ] **Step 4: Write the rules**

Create `server/src/chat/access/chat-access.rules.ts`:

```ts
import type { Gender } from '@prisma/client';
import { addDaysToDateStr } from '../../common/date/tashkent';
import { isPhoneVerified } from '../../students/shared/student-onboarding';

export const WINDOW_DAYS = 7;

export interface DayUsage {
  /** Tashkent calendar day, 'YYYY-MM-DD'. */
  day: string;
  activeSeconds: number;
  radioSeconds: number;
}

export interface Quota {
  activeMin: number;
  radioMin: number;
}

export interface QuotaResult {
  windowDays: typeof WINDOW_DAYS;
  activeMin: number;
  radioMin: number;
  quota: Quota;
  ok: boolean;
  missingActiveMin: number;
  missingRadioMin: number;
  /**
   * Set when the quota holds today but will not tomorrow, once the oldest day
   * leaves the window: what must still be added today to keep it.
   */
  tomorrow: { needActiveMin: number; needRadioMin: number } | null;
}

const minutes = (seconds: number): number => Math.floor(seconds / 60);

/** Days are 'YYYY-MM-DD' strings, so string comparison is calendar comparison. */
function totals(days: DayUsage[], from: string, to: string) {
  let active = 0;
  let radio = 0;
  for (const d of days) {
    if (d.day >= from && d.day <= to) {
      active += d.activeSeconds;
      radio += d.radioSeconds;
    }
  }
  return { activeMin: minutes(active), radioMin: minutes(radio) };
}

export function evaluateQuota(
  days: DayUsage[],
  today: string,
  quota: Quota,
): QuotaResult {
  const now = totals(days, addDaysToDateStr(today, -(WINDOW_DAYS - 1)), today);
  const missingActiveMin = Math.max(0, quota.activeMin - now.activeMin);
  const missingRadioMin = Math.max(0, quota.radioMin - now.radioMin);
  const ok = missingActiveMin === 0 && missingRadioMin === 0;

  let tomorrow: QuotaResult['tomorrow'] = null;
  if (ok) {
    // Tomorrow's window starts one day later and tomorrow itself is still empty.
    const next = totals(days, addDaysToDateStr(today, -(WINDOW_DAYS - 2)), today);
    const needActiveMin = Math.max(0, quota.activeMin - next.activeMin);
    const needRadioMin = Math.max(0, quota.radioMin - next.radioMin);
    if (needActiveMin > 0 || needRadioMin > 0) {
      tomorrow = { needActiveMin, needRadioMin };
    }
  }

  return {
    windowDays: WINDOW_DAYS,
    activeMin: now.activeMin,
    radioMin: now.radioMin,
    quota,
    ok,
    missingActiveMin,
    missingRadioMin,
    tomorrow,
  };
}

export type ChatLockReason =
  | 'BANNED'
  | 'DEBT'
  | 'GENDER'
  | 'BIRTH_DATE'
  | 'PHONE'
  | 'QUOTA';

export interface AccessFacts {
  balance: number;
  gender: Gender | null;
  dateOfBirth: Date | null;
  phone: string;
  verifiedPhone: string | null;
  chatBannedAt: Date | null;
}

export function lockReasons(f: AccessFacts, q: QuotaResult): ChatLockReason[] {
  const reasons: ChatLockReason[] = [];
  if (f.chatBannedAt) reasons.push('BANNED');
  if (f.balance < 0) reasons.push('DEBT');
  if (!f.gender) reasons.push('GENDER');
  if (!f.dateOfBirth) reasons.push('BIRTH_DATE');
  if (!isPhoneVerified({ phone: f.phone, verifiedPhone: f.verifiedPhone })) {
    reasons.push('PHONE');
  }
  if (!q.ok) reasons.push('QUOTA');
  return reasons;
}

/** "18 daqiqa ishlang va 20 daqiqa radio eshiting", leaving out a half that is zero. */
function parts(activeMin: number, radioMin: number): string {
  const out: string[] = [];
  if (activeMin > 0) out.push(`${activeMin} daqiqa ishlang`);
  if (radioMin > 0) out.push(`${radioMin} daqiqa radio eshiting`);
  return out.join(' va ');
}

export function reasonText(reason: ChatLockReason, q: QuotaResult): string {
  switch (reason) {
    case 'BANNED':
      return "Siz chatdan chiqarilgansiz. Yozish yopiq.";
    case 'DEBT':
      return "Qarzingiz bor. To'lovni amalga oshiring.";
    case 'GENDER':
      return "Profilingizda jinsingizni to'ldiring.";
    case 'BIRTH_DATE':
      return "Profilingizda tug'ilgan sanangizni to'ldiring.";
    case 'PHONE':
      return 'Telefon raqamingizni tasdiqlang.';
    case 'QUOTA':
      return `Ochish uchun yana ${parts(q.missingActiveMin, q.missingRadioMin)}.`;
  }
}

export function tomorrowWarning(q: QuotaResult): string | null {
  if (!q.tomorrow) return null;
  return `Ertaga yozish yopiladi. Bugun yana ${parts(q.tomorrow.needActiveMin, q.tomorrow.needRadioMin)}.`;
}
```

- [ ] **Step 5: Run the test, expect pass**

Run: `npx jest src/chat/access/chat-access.rules.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/chat
git add src/chat
git commit -m "feat(chat): pure access rules (weekly window, lock reasons, Uzbek texts)"
```

---

### Task 3: `ChatAccessService`, module skeleton, `GET /chat/access`

**Files:**
- Create: `server/src/chat/access/chat-access.service.ts`
- Create: `server/src/chat/chat.controller.ts`
- Create: `server/src/chat/chat.module.ts`
- Modify: `server/src/app.module.ts` (import `ChatModule`)
- Test: `server/src/chat/access/chat-access.service.spec.ts`, `server/src/chat/chat.controller.spec.ts`

**Interfaces:**
- Consumes: Task 2 rules; `SettingsService.get(companyId, key)`; `PrismaService`.
- Produces:
  - `interface ChatAccess { enabled: boolean; canWrite: boolean; reasons: ChatLockReason[]; messages: string[]; warning: string | null; quota: QuotaResult }`
  - `ChatAccessService.forStudent(studentId: number, companyId: number, now?: Date): Promise<ChatAccess>`
  - `ChatAccessService.assertCanWrite(studentId, companyId): Promise<void>` — throws `ForbiddenException(CHAT_OFF_MESSAGE)` when off, else `ForbiddenException(messages[0])`
  - `ChatAccessService.assertEnabled(companyId): Promise<void>`

- [ ] **Step 1: Write the failing service test**

Create `server/src/chat/access/chat-access.service.spec.ts`:

```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ChatAccessService } from './chat-access.service';

const NOW = new Date('2026-10-25T07:00:00Z'); // 12:00 Tashkent, same calendar day

function make(opts: {
  enabled?: boolean;
  student?: object | null;
  usage?: { day: Date; _sum: { activeSeconds: number; radioSeconds: number } }[];
}) {
  const prisma = {
    student: {
      findFirst: jest.fn().mockResolvedValue(
        opts.student === undefined
          ? {
              balance: 0,
              gender: 'MALE',
              dateOfBirth: new Date('2000-01-01'),
              phone: '901234567',
              verifiedPhone: '901234567',
              chatBannedAt: null,
            }
          : opts.student,
      ),
    },
    studentAppSession: {
      groupBy: jest.fn().mockResolvedValue(opts.usage ?? []),
    },
  };
  const settings = {
    get: jest.fn(async (_c: number, key: string) => {
      if (key === 'chat.enabled') return opts.enabled ?? true;
      if (key === 'chat.weekMinutesActive') return 60;
      return 30;
    }),
  };
  return {
    service: new ChatAccessService(prisma as never, settings as never),
    prisma,
  };
}

const fullWeek = [
  {
    day: new Date('2026-10-25T00:00:00Z'),
    _sum: { activeSeconds: 3600, radioSeconds: 1800 },
  },
];

describe('ChatAccessService', () => {
  it('opens for a student who meets everything', async () => {
    const { service } = make({ usage: fullWeek });
    const a = await service.forStudent(1, 1, NOW);
    expect(a.canWrite).toBe(true);
    expect(a.reasons).toEqual([]);
    expect(a.quota.activeMin).toBe(60);
  });

  it('is shut for everyone while the switch is off', async () => {
    const { service } = make({ enabled: false, usage: fullWeek });
    const a = await service.forStudent(1, 1, NOW);
    expect(a.enabled).toBe(false);
    expect(a.canWrite).toBe(false);
    await expect(service.assertCanWrite(1, 1)).rejects.toThrow(
      'Chat hozircha ochilmagan',
    );
  });

  it('explains a lock with the first reason text', async () => {
    const { service } = make({ usage: [] });
    await expect(service.assertCanWrite(1, 1)).rejects.toThrow(
      ForbiddenException,
    );
    const a = await service.forStudent(1, 1, NOW);
    expect(a.reasons).toEqual(['QUOTA']);
    expect(a.messages[0]).toBe(
      'Ochish uchun yana 60 daqiqa ishlang va 30 daqiqa radio eshiting.',
    );
  });

  it('queries only the 7-day window of this student', async () => {
    const { service, prisma } = make({ usage: fullWeek });
    await service.forStudent(7, 1, NOW);
    const where = prisma.studentAppSession.groupBy.mock.calls[0][0].where;
    expect(where.studentId).toBe(7);
    expect(where.day.gte).toEqual(new Date('2026-10-19T00:00:00Z'));
    expect(where.day.lte).toEqual(new Date('2026-10-25T00:00:00Z'));
  });

  it('404s for a missing card', async () => {
    const { service } = make({ student: null });
    await expect(service.forStudent(1, 1, NOW)).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npx jest src/chat/access/chat-access.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the service**

Create `server/src/chat/access/chat-access.service.ts`:

```ts
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDaysToDateStr,
  tashkentDateStr,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../../settings/settings.service';
import { CHAT_OFF_MESSAGE } from '../chat.constants';
import {
  WINDOW_DAYS,
  evaluateQuota,
  lockReasons,
  reasonText,
  tomorrowWarning,
  type ChatLockReason,
  type DayUsage,
  type QuotaResult,
} from './chat-access.rules';

export interface ChatAccess {
  enabled: boolean;
  canWrite: boolean;
  reasons: ChatLockReason[];
  /** One Uzbek sentence per reason, in the same order. */
  messages: string[];
  /** «Ertaga yozish yopiladi…» while the quota still holds today. */
  warning: string | null;
  quota: QuotaResult;
}

/** The one place that decides whether a student may write (spec §1). */
@Injectable()
export class ChatAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async forStudent(
    studentId: number,
    companyId: number,
    now: Date = new Date(),
  ): Promise<ChatAccess> {
    const today = tashkentDateStr(now);
    const from = addDaysToDateStr(today, -(WINDOW_DAYS - 1));

    const [enabled, activeMin, radioMin, student, usage] = await Promise.all([
      this.settings.get(companyId, 'chat.enabled'),
      this.settings.get(companyId, 'chat.weekMinutesActive'),
      this.settings.get(companyId, 'chat.weekMinutesRadio'),
      this.prisma.student.findFirst({
        where: { id: studentId, companyId, deletedAt: null },
        select: {
          balance: true,
          gender: true,
          dateOfBirth: true,
          phone: true,
          verifiedPhone: true,
          chatBannedAt: true,
        },
      }),
      this.prisma.studentAppSession.groupBy({
        by: ['day'],
        where: {
          studentId,
          day: {
            gte: utcMidnightFromDateStr(from),
            lte: utcMidnightFromDateStr(today),
          },
        },
        _sum: { activeSeconds: true, radioSeconds: true },
      }),
    ]);
    if (!student) throw new NotFoundException('Talaba topilmadi');

    // `day` is a @db.Date column: it comes back as UTC midnight of the Tashkent day.
    const days: DayUsage[] = usage.map((u) => ({
      day: u.day.toISOString().slice(0, 10),
      activeSeconds: u._sum.activeSeconds ?? 0,
      radioSeconds: u._sum.radioSeconds ?? 0,
    }));
    const quota = evaluateQuota(days, today, { activeMin, radioMin });
    const reasons = lockReasons(student, quota);

    return {
      enabled,
      canWrite: enabled && reasons.length === 0,
      reasons,
      messages: reasons.map((r) => reasonText(r, quota)),
      warning: reasons.length === 0 ? tomorrowWarning(quota) : null,
      quota,
    };
  }

  async assertEnabled(companyId: number): Promise<void> {
    if (!(await this.settings.get(companyId, 'chat.enabled'))) {
      throw new ForbiddenException(CHAT_OFF_MESSAGE);
    }
  }

  async assertCanWrite(studentId: number, companyId: number): Promise<void> {
    const access = await this.forStudent(studentId, companyId);
    if (!access.enabled) throw new ForbiddenException(CHAT_OFF_MESSAGE);
    if (!access.canWrite) throw new ForbiddenException(access.messages[0]);
  }
}
```

- [ ] **Step 4: Run the service test, expect pass**

Run: `npx jest src/chat/access/chat-access.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the controller skeleton, module and its spec**

Create `server/src/chat/chat.controller.ts` (later tasks add routes to this class):

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { ChatAccessService } from './access/chat-access.service';

/**
 * Student-to-student chat (spec 2026-10-25). Every route is the caller's own
 * card: the student id comes from the token, never from the request.
 */
@Controller('chat')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class ChatController {
  constructor(private readonly access: ChatAccessService) {}

  @Get('access')
  getAccess(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.access.forStudent(studentId, companyId);
  }
}
```

Create `server/src/chat/chat.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [SettingsModule],
  controllers: [ChatController],
  providers: [ChatAccessService],
  exports: [ChatAccessService],
})
export class ChatModule {}
```

In `server/src/app.module.ts` add `import { ChatModule } from './chat/chat.module';` and put `ChatModule,` in the `imports` array next to `SettingsModule,`.

Create `server/src/chat/chat.controller.spec.ts`:

```ts
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { StudentCardGuard } from '../common/guards';
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
import { ChatController } from './chat.controller';

describe('ChatController', () => {
  const methods = Object.getOwnPropertyNames(ChatController.prototype).filter(
    (m) => m !== 'constructor',
  );

  it('has routes', () => {
    expect(methods.length).toBeGreaterThan(0);
  });

  it('is Student-only on every route and refuses a token with no card', () => {
    for (const method of methods) {
      expect(routeAccess(ChatController, method)).toEqual({ kind: 'student' });
      expect(defaultRolesOf(ChatController, method)).toEqual(['Student']);
    }
    expect(Reflect.getMetadata(GUARDS_METADATA, ChatController)).toEqual([
      StudentCardGuard,
    ]);
  });
});
```

- [ ] **Step 6: Run both specs and the typecheck**

Run: `npx jest src/chat && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/chat src/app.module.ts
git add src/chat src/app.module.ts
git commit -m "feat(chat): ChatAccessService and GET /chat/access"
```

---

### Task 4: `@username`

**Files:**
- Create: `server/src/chat/username/chat-username.rules.ts`
- Create: `server/src/chat/username/chat-username.service.ts`
- Create: `server/src/chat/dto/chat.dto.ts`
- Modify: `server/src/chat/chat.controller.ts`, `server/src/chat/chat.module.ts`
- Test: `server/src/chat/username/chat-username.rules.spec.ts`, `server/src/chat/username/chat-username.service.spec.ts`

**Interfaces:**
- Produces:
  - `normalizeUsername(raw: string): string` — trims, strips one leading `@`, lowercases.
  - `usernameProblem(normalized: string): string | null` — Uzbek message or null.
  - `ChatUsernameService.set(studentId: number, companyId: number, raw: string): Promise<{ username: string }>`
  - `class SetUsernameDto { username: string }` in `chat/dto/chat.dto.ts`.
  - Route `PUT /chat/username`.

- [ ] **Step 1: Write the failing rules test**

Create `server/src/chat/username/chat-username.rules.spec.ts`:

```ts
import { normalizeUsername, usernameProblem } from './chat-username.rules';

describe('username rules', () => {
  it('normalises case, spaces and one leading @', () => {
    expect(normalizeUsername('  @Asror_01 ')).toBe('asror_01');
  });

  it.each(['asror_01', 'a1234', 'a'.padEnd(32, 'b')])('accepts %s', (u) => {
    expect(usernameProblem(u)).toBeNull();
  });

  it.each([
    ['abcd', 'short'],
    ['a'.padEnd(33, 'b'), 'long'],
    ['1abcde', 'starts with a digit'],
    ['_abcde', 'starts with underscore'],
    ['ab cde', 'space'],
    ['abcdé1', 'non-latin'],
    ['ab-cde', 'dash'],
  ])('refuses %s (%s)', (u) => {
    expect(usernameProblem(u)).toBe(
      "Username 5–32 belgi bo'lsin: lotin harf, raqam va _, harf bilan boshlansin",
    );
  });
});
```

- [ ] **Step 2: Run, expect failure** — `npx jest src/chat/username` → FAIL (module not found).

- [ ] **Step 3: Write the rules**

Create `server/src/chat/username/chat-username.rules.ts`:

```ts
const USERNAME = /^[a-z][a-z0-9_]{4,31}$/;

export const USERNAME_MESSAGE =
  "Username 5–32 belgi bo'lsin: lotin harf, raqam va _, harf bilan boshlansin";

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function usernameProblem(normalized: string): string | null {
  return USERNAME.test(normalized) ? null : USERNAME_MESSAGE;
}
```

- [ ] **Step 4: Run, expect pass** — `npx jest src/chat/username/chat-username.rules.spec.ts` → PASS.

- [ ] **Step 5: Write the failing service test**

Create `server/src/chat/username/chat-username.service.spec.ts`:

```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ChatUsernameService } from './chat-username.service';

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'x',
  });

function make(update: jest.Mock) {
  const prisma = { student: { updateMany: update } };
  return new ChatUsernameService(prisma as never);
}

describe('ChatUsernameService.set', () => {
  it('stores the normalised username on the caller card', async () => {
    const update = jest.fn().mockResolvedValue({ count: 1 });
    const out = await make(update).set(5, 1, '@Asror_01');
    expect(out).toEqual({ username: 'asror_01' });
    expect(update).toHaveBeenCalledWith({
      where: { id: 5, companyId: 1, deletedAt: null },
      data: { username: 'asror_01' },
    });
  });

  it('refuses a malformed one before touching the database', async () => {
    const update = jest.fn();
    await expect(make(update).set(5, 1, '1x')).rejects.toThrow(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('turns a unique violation into a 409 in Uzbek', async () => {
    const update = jest.fn().mockRejectedValue(p2002());
    await expect(make(update).set(5, 1, 'asror_01')).rejects.toThrow(
      new ConflictException('Bu username band'),
    );
  });
});
```

- [ ] **Step 6: Run, expect failure** — FAIL (service missing).

- [ ] **Step 7: Write the service, DTO, route**

Create `server/src/chat/username/chat-username.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUsername, usernameProblem } from './chat-username.rules';

@Injectable()
export class ChatUsernameService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sets (or changes) the caller's own username. The old one is free again at once. */
  async set(
    studentId: number,
    companyId: number,
    raw: string,
  ): Promise<{ username: string }> {
    const username = normalizeUsername(raw);
    const problem = usernameProblem(username);
    if (problem) throw new BadRequestException(problem);
    try {
      const { count } = await this.prisma.student.updateMany({
        where: { id: studentId, companyId, deletedAt: null },
        data: { username },
      });
      if (count === 0) throw new NotFoundException('Talaba topilmadi');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('Bu username band');
      }
      throw err;
    }
    return { username };
  }
}
```

Create `server/src/chat/dto/chat.dto.ts`:

```ts
import { ChatFindWho, ChatWho } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MESSAGE_MAX } from '../chat.constants';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SetUsernameDto {
  @IsString()
  @MaxLength(40)
  username!: string;
}

export class UpdatePrivacyDto {
  @IsOptional()
  @IsEnum(ChatWho)
  whoCanWrite?: ChatWho;

  @IsOptional()
  @IsEnum(ChatFindWho)
  whoCanFind?: ChatFindWho;

  @IsOptional()
  @IsEnum(ChatWho)
  whoSeesPhoto?: ChatWho;
}

export class BlockDto {
  @IsInt()
  @Min(1)
  studentId!: number;
}

export class SearchQueryDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  q!: string;
}

export class OpenConversationDto {
  /** Either an exact `@username` or a student id from search. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  username?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  studentId?: number;
}

export class SendMessageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: "Xabar bo'sh bo'lmasin" })
  @MaxLength(MESSAGE_MAX, { message: `Xabar ${MESSAGE_MAX} belgidan oshmasin` })
  text!: string;
}

export class MessagesQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
```

In `chat.controller.ts` replace imports/class body with the following (keeps `getAccess`):

```ts
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { StudentCardGuard } from '../common/guards';
import { StudentOnly } from '../common/permissions/access.decorators';
import { ChatAccessService } from './access/chat-access.service';
import { SetUsernameDto } from './dto/chat.dto';
import { ChatUsernameService } from './username/chat-username.service';

@Controller('chat')
@UseGuards(StudentCardGuard)
@StudentOnly()
export class ChatController {
  constructor(
    private readonly access: ChatAccessService,
    private readonly usernames: ChatUsernameService,
  ) {}

  @Get('access')
  getAccess(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.access.forStudent(studentId, companyId);
  }

  @Put('username')
  setUsername(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Body() dto: SetUsernameDto,
  ) {
    return this.usernames.set(studentId, companyId, dto.username);
  }
}
```

In `chat.module.ts` add `ChatUsernameService` to `providers` (import it).

- [ ] **Step 8: Run all chat specs and typecheck**

Run: `npx jest src/chat && npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/chat
git add src/chat
git commit -m "feat(chat): student @username (PUT /chat/username)"
```

---

### Task 5: Privacy, blocking, search

**Files:**
- Create: `server/src/chat/people/chat-people.rules.ts`
- Create: `server/src/chat/people/chat-people.service.ts`
- Modify: `server/src/chat/chat.controller.ts`, `server/src/chat/chat.module.ts`
- Test: `server/src/chat/people/chat-people.rules.spec.ts`, `server/src/chat/people/chat-people.service.spec.ts`

**Interfaces:**
- Produces:
  - `mayWrite(who: ChatWho, sharesGroup: boolean): boolean`, `maySeePhoto(who: ChatWho, sharesGroup: boolean): boolean`, `mayFindByName(who: ChatFindWho): boolean`
  - `interface PeerSummary { id: number; firstName: string; lastName: string; username: string | null; photo: string | null }`
  - `ChatPeopleService`: `sharesGroup(a, b): Promise<boolean>`, `privacyOf(studentId): Promise<{ whoCanWrite; whoCanFind; whoSeesPhoto }>`, `getMine(studentId, companyId): Promise<{ username: string | null } & Privacy>`, `updatePrivacy(studentId, dto): Promise<Privacy>`, `block(me, target)`, `unblock(me, target)`, `isBlockedEitherWay(a, b): Promise<{ iBlocked: boolean; blockedMe: boolean }>`, `peerSummary(viewerId, peerId): Promise<PeerSummary>`, `search(viewerId, companyId, q): Promise<PeerSummary[]>`, `findByUsername(companyId, raw): Promise<{ id: number } | null>`.
  - Routes: `GET /chat/me`, `PATCH /chat/privacy`, `POST /chat/block`, `POST /chat/unblock`, `GET /chat/search`.

- [ ] **Step 1: Write the failing rules test**

Create `server/src/chat/people/chat-people.rules.spec.ts`:

```ts
import { maySeePhoto, mayFindByName, mayWrite } from './chat-people.rules';

describe('privacy rules', () => {
  it('mayWrite', () => {
    expect(mayWrite('EVERYONE', false)).toBe(true);
    expect(mayWrite('GROUPMATES', true)).toBe(true);
    expect(mayWrite('GROUPMATES', false)).toBe(false);
    expect(mayWrite('NOBODY', true)).toBe(false);
  });

  it('maySeePhoto follows the same table', () => {
    expect(maySeePhoto('EVERYONE', false)).toBe(true);
    expect(maySeePhoto('GROUPMATES', false)).toBe(false);
    expect(maySeePhoto('NOBODY', true)).toBe(false);
  });

  it('mayFindByName', () => {
    expect(mayFindByName('EVERYONE')).toBe(true);
    expect(mayFindByName('NOBODY')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**, then **Step 3: write the rules**

Create `server/src/chat/people/chat-people.rules.ts`:

```ts
import type { ChatFindWho, ChatWho } from '@prisma/client';

export function mayWrite(who: ChatWho, sharesGroup: boolean): boolean {
  if (who === 'EVERYONE') return true;
  if (who === 'GROUPMATES') return sharesGroup;
  return false;
}

export const maySeePhoto = mayWrite;

/** An exact `@username` is never subject to this: only the name search is. */
export function mayFindByName(who: ChatFindWho): boolean {
  return who === 'EVERYONE';
}
```

Run: `npx jest src/chat/people/chat-people.rules.spec.ts` → PASS.

- [ ] **Step 4: Write the failing service test**

Create `server/src/chat/people/chat-people.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ChatPeopleService } from './chat-people.service';

function make(over: Record<string, unknown> = {}) {
  const prisma = {
    student: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
    chatPrivacy: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
    },
    chatBlock: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
    ...over,
  };
  return { service: new ChatPeopleService(prisma as never), prisma };
}

const row = (id: number, extra = {}) => ({
  id,
  firstName: `A${id}`,
  lastName: `B${id}`,
  username: null,
  photo: `p${id}`,
  ...extra,
});

describe('ChatPeopleService.search', () => {
  it('hides students who switched name search off and those who blocked the viewer', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2), row(3), row(4)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 3, whoCanFind: 'NOBODY', whoSeesPhoto: 'EVERYONE' },
    ]);
    prisma.chatBlock.findMany.mockResolvedValue([{ blockerId: 4, blockedId: 1 }]);
    const out = await service.search(1, 1, 'ab');
    expect(out.map((p) => p.id)).toEqual([2]);
  });

  it('never returns the viewer', async () => {
    const { service, prisma } = make();
    await service.search(1, 1, 'ab');
    expect(prisma.student.findMany.mock.calls[0][0].where.id).toEqual({ not: 1 });
  });

  it('searches by exact username when the query starts with @', async () => {
    const { service, prisma } = make();
    prisma.student.findFirst.mockResolvedValue(row(9, { username: 'asror_01' }));
    const out = await service.search(1, 1, '@Asror_01');
    expect(prisma.student.findFirst.mock.calls[0][0].where.username).toBe(
      'asror_01',
    );
    expect(out.map((p) => p.id)).toEqual([9]);
  });

  it('hides the photo from a non-group-mate when the owner limited it', async () => {
    const { service, prisma } = make();
    prisma.student.findMany.mockResolvedValue([row(2)]);
    prisma.chatPrivacy.findMany.mockResolvedValue([
      { studentId: 2, whoCanFind: 'EVERYONE', whoSeesPhoto: 'GROUPMATES' },
    ]);
    const out = await service.search(1, 1, 'ab');
    expect(out[0].photo).toBeNull();
  });
});

describe('ChatPeopleService.block', () => {
  it('refuses blocking yourself', async () => {
    const { service } = make();
    await expect(service.block(1, 1)).rejects.toThrow(BadRequestException);
  });

  it('is idempotent', async () => {
    const { service, prisma } = make();
    await service.block(1, 2);
    expect(prisma.chatBlock.upsert).toHaveBeenCalledWith({
      where: { blockerId_blockedId: { blockerId: 1, blockedId: 2 } },
      create: { blockerId: 1, blockedId: 2 },
      update: {},
    });
  });
});

describe('ChatPeopleService.sharesGroup', () => {
  it('asks for a live ACTIVE enrollment in the same live group', async () => {
    const { service, prisma } = make();
    prisma.enrollment.findFirst.mockResolvedValue({ id: 'e' });
    expect(await service.sharesGroup(1, 2)).toBe(true);
    const where = prisma.enrollment.findFirst.mock.calls[0][0].where;
    expect(where.studentId).toBe(1);
    expect(where.status).toBe('ACTIVE');
    expect(where.deletedAt).toBeNull();
    expect(where.group.enrollments.some.studentId).toBe(2);
  });
});
```

- [ ] **Step 5: Run, expect failure** (service missing).

- [ ] **Step 6: Write the service**

Create `server/src/chat/people/chat-people.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import type { ChatFindWho, ChatWho } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeUsername } from '../username/chat-username.rules';
import type { UpdatePrivacyDto } from '../dto/chat.dto';
import { maySeePhoto, mayFindByName } from './chat-people.rules';

export interface Privacy {
  whoCanWrite: ChatWho;
  whoCanFind: ChatFindWho;
  whoSeesPhoto: ChatWho;
}

/** What another student may see: never a phone, a debt or a balance. */
export interface PeerSummary {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  photo: string | null;
}

const DEFAULT_PRIVACY: Privacy = {
  whoCanWrite: 'EVERYONE',
  whoCanFind: 'EVERYONE',
  whoSeesPhoto: 'EVERYONE',
};

const PEER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  photo: true,
} as const;

const SEARCH_CANDIDATES = 50;
const SEARCH_RESULTS = 20;

@Injectable()
export class ChatPeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /** True while both students sit in one live group with an ACTIVE enrollment. */
  async sharesGroup(a: number, b: number): Promise<boolean> {
    const hit = await this.prisma.enrollment.findFirst({
      where: {
        studentId: a,
        status: 'ACTIVE',
        deletedAt: null,
        group: {
          deletedAt: null,
          enrollments: {
            some: { studentId: b, status: 'ACTIVE', deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  async privacyOf(studentId: number): Promise<Privacy> {
    const row = await this.prisma.chatPrivacy.findUnique({
      where: { studentId },
    });
    return row
      ? {
          whoCanWrite: row.whoCanWrite,
          whoCanFind: row.whoCanFind,
          whoSeesPhoto: row.whoSeesPhoto,
        }
      : { ...DEFAULT_PRIVACY };
  }

  async getMine(studentId: number, companyId: number) {
    const [me, privacy] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, companyId, deletedAt: null },
        select: { username: true },
      }),
      this.privacyOf(studentId),
    ]);
    return { username: me?.username ?? null, ...privacy };
  }

  async updatePrivacy(studentId: number, dto: UpdatePrivacyDto): Promise<Privacy> {
    const data = {
      ...(dto.whoCanWrite && { whoCanWrite: dto.whoCanWrite }),
      ...(dto.whoCanFind && { whoCanFind: dto.whoCanFind }),
      ...(dto.whoSeesPhoto && { whoSeesPhoto: dto.whoSeesPhoto }),
    };
    const row = await this.prisma.chatPrivacy.upsert({
      where: { studentId },
      create: { studentId, ...data },
      update: data,
    });
    return {
      whoCanWrite: row.whoCanWrite,
      whoCanFind: row.whoCanFind,
      whoSeesPhoto: row.whoSeesPhoto,
    };
  }

  async block(me: number, target: number): Promise<{ ok: true }> {
    if (me === target) {
      throw new BadRequestException("O'zingizni bloklab bo'lmaydi");
    }
    await this.prisma.chatBlock.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: target } },
      create: { blockerId: me, blockedId: target },
      update: {},
    });
    return { ok: true };
  }

  async unblock(me: number, target: number): Promise<{ ok: true }> {
    await this.prisma.chatBlock.deleteMany({
      where: { blockerId: me, blockedId: target },
    });
    return { ok: true };
  }

  async isBlockedEitherWay(
    a: number,
    b: number,
  ): Promise<{ iBlocked: boolean; blockedMe: boolean }> {
    const rows = await this.prisma.chatBlock.findMany({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return {
      iBlocked: rows.some((r) => r.blockerId === a),
      blockedMe: rows.some((r) => r.blockerId === b),
    };
  }

  async findByUsername(companyId: number, raw: string) {
    return this.prisma.student.findFirst({
      where: { username: normalizeUsername(raw), companyId, deletedAt: null },
      select: PEER_SELECT,
    });
  }

  /** The card another student sees, with the photo hidden when its owner limited it. */
  async peerSummary(viewerId: number, peerId: number): Promise<PeerSummary> {
    const [peer, privacy] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: peerId },
        select: PEER_SELECT,
      }),
      this.privacyOf(peerId),
    ]);
    if (!peer) throw new BadRequestException("O'quvchi topilmadi");
    const shares =
      privacy.whoSeesPhoto === 'GROUPMATES'
        ? await this.sharesGroup(viewerId, peerId)
        : false;
    return {
      ...peer,
      photo: maySeePhoto(privacy.whoSeesPhoto, shares) ? peer.photo : null,
    };
  }

  /**
   * `@username` finds one student exactly, whatever their name-search setting.
   * Anything else is a name search over active students, 2+ characters.
   * ponytail: up to 50 candidates are filtered in memory and the photo test
   * runs per result (≤ 20 queries); move to SQL if a name search gets popular.
   */
  async search(
    viewerId: number,
    companyId: number,
    query: string,
  ): Promise<PeerSummary[]> {
    const q = query.trim();
    let candidates: Array<{
      id: number;
      firstName: string;
      lastName: string;
      username: string | null;
      photo: string | null;
    }>;
    let byUsername = false;

    if (q.startsWith('@')) {
      byUsername = true;
      const one = await this.findByUsername(companyId, q);
      candidates = one && one.id !== viewerId ? [one] : [];
    } else {
      candidates = await this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          id: { not: viewerId },
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: PEER_SELECT,
        take: SEARCH_CANDIDATES,
        orderBy: [{ firstName: 'asc' }, { id: 'asc' }],
      });
    }
    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const [privacyRows, blocks] = await Promise.all([
      this.prisma.chatPrivacy.findMany({ where: { studentId: { in: ids } } }),
      this.prisma.chatBlock.findMany({
        where: { blockerId: { in: ids }, blockedId: viewerId },
      }),
    ]);
    const privacyById = new Map(privacyRows.map((r) => [r.studentId, r]));
    const blockedViewer = new Set(blocks.map((b) => b.blockerId));

    const visible = candidates
      .filter((c) => !blockedViewer.has(c.id))
      .filter(
        (c) =>
          byUsername ||
          mayFindByName(privacyById.get(c.id)?.whoCanFind ?? 'EVERYONE'),
      )
      .slice(0, SEARCH_RESULTS);

    return Promise.all(
      visible.map(async (c) => {
        const who = privacyById.get(c.id)?.whoSeesPhoto ?? 'EVERYONE';
        const shares = who === 'GROUPMATES' ? await this.sharesGroup(viewerId, c.id) : false;
        return { ...c, photo: maySeePhoto(who, shares) ? c.photo : null };
      }),
    );
  }
}
```

- [ ] **Step 7: Run the service spec, expect pass**

Run: `npx jest src/chat/people`
Expected: PASS.

- [ ] **Step 8: Add the routes**

In `chat.controller.ts` add imports `Patch, Post, Query` from `@nestjs/common`, `ChatPeopleService`, and the DTOs `BlockDto, SearchQueryDto, UpdatePrivacyDto`; inject `private readonly people: ChatPeopleService` as a third constructor argument; add:

```ts
  @Get('me')
  me(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.people.getMine(studentId, companyId);
  }

  @Patch('privacy')
  updatePrivacy(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: UpdatePrivacyDto,
  ) {
    return this.people.updatePrivacy(studentId, dto);
  }

  @Post('block')
  block(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: BlockDto,
  ) {
    return this.people.block(studentId, dto.studentId);
  }

  @Post('unblock')
  unblock(
    @CurrentUser('studentId') studentId: number,
    @Body() dto: BlockDto,
  ) {
    return this.people.unblock(studentId, dto.studentId);
  }

  @Get('search')
  search(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Query() query: SearchQueryDto,
  ) {
    return this.people.search(studentId, companyId, query.q);
  }
```

Add `ChatPeopleService` to `providers` and `exports` in `chat.module.ts`.

- [ ] **Step 9: Run chat specs and typecheck, then commit**

Run: `npx jest src/chat && npm run typecheck`
Expected: PASS.

```bash
npx prettier --write src/chat
git add src/chat
git commit -m "feat(chat): privacy settings, blocking and student search"
```

---

### Task 6: Conversations and text messages

**Files:**
- Create: `server/src/chat/conversations/chat-conversations.service.ts`
- Modify: `server/src/chat/chat.controller.ts`, `server/src/chat/chat.module.ts`
- Test: `server/src/chat/conversations/chat-conversations.service.spec.ts`

**Interfaces:**
- Consumes: `ChatAccessService.assertCanWrite`, `ChatPeopleService` (`isBlockedEitherWay`, `privacyOf`, `sharesGroup`, `peerSummary`, `findByUsername`), `NotificationsGateway.sendToUser(userId, data)`, `hit(redis, key, ttlSec)` from `students/shared/phone-code`, `mayWrite`.
- Produces:
  - `interface MessageView { id: string; senderId: number; mine: boolean; kind: 'TEXT' | 'IMAGE' | 'VOICE'; text: string | null; createdAt: string }`
  - `interface ConversationView { id: string; peer: PeerSummary; lastMessage: { preview: string; at: string; mine: boolean } | null; unread: number }`
  - `ChatConversationsService`: `open(me, companyId, dto): Promise<{ id: string }>`, `list(me): Promise<ConversationView[]>`, `messages(me, conversationId, cursor?, limit?): Promise<{ data: MessageView[]; nextCursor: string | null }>`, `send(me, companyId, conversationId, text): Promise<MessageView>`, `markRead(me, conversationId): Promise<{ ok: true }>`, `removeOwn(me, messageId): Promise<{ ok: true }>`
  - SSE payloads to the other student: `{ type: 'chat.message', conversationId, message: MessageView }` (with `mine: false`), `{ type: 'chat.read', conversationId, readAt }`.
  - Routes: `POST /chat/conversations`, `GET /chat/conversations`, `GET /chat/conversations/:id/messages`, `POST /chat/conversations/:id/messages`, `PATCH /chat/conversations/:id/read`, `DELETE /chat/messages/:id`.

- [ ] **Step 1: Write the failing service test**

Create `server/src/chat/conversations/chat-conversations.service.spec.ts`:

```ts
import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ChatConversationsService } from './chat-conversations.service';

const conv = { id: 'c1', companyId: 1, studentLowId: 1, studentHighId: 2 };

function make(o: { access?: Error | null; blocked?: object; privacy?: object; shares?: boolean; rate?: number } = {}) {
  const tx = {
    chatMessage: {
      create: jest.fn().mockResolvedValue({
        id: 'm1', conversationId: 'c1', senderId: 1, kind: 'TEXT', text: 'salom',
        createdAt: new Date('2026-10-25T07:00:00Z'),
      }),
    },
    chatConversation: { update: jest.fn() },
    chatReadState: { upsert: jest.fn() },
  };
  const prisma = {
    chatConversation: {
      findUnique: jest.fn().mockResolvedValue(conv),
      findFirst: jest.fn().mockResolvedValue(conv),
      upsert: jest.fn().mockResolvedValue(conv),
    },
    student: { findFirst: jest.fn().mockResolvedValue({ id: 2, userId: 22 }) },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    chatMessage: { findFirst: jest.fn(), update: jest.fn() },
    chatReadState: { upsert: jest.fn() },
  };
  const access = {
    assertCanWrite: jest.fn(async () => {
      if (o.access) throw o.access;
    }),
  };
  const people = {
    isBlockedEitherWay: jest
      .fn()
      .mockResolvedValue(o.blocked ?? { iBlocked: false, blockedMe: false }),
    privacyOf: jest.fn().mockResolvedValue(o.privacy ?? { whoCanWrite: 'EVERYONE' }),
    sharesGroup: jest.fn().mockResolvedValue(o.shares ?? false),
    peerSummary: jest.fn(),
    findByUsername: jest.fn(),
  };
  const gateway = { sendToUser: jest.fn() };
  const rate = o.rate ?? 1;
  const service = new ChatConversationsService(
    prisma as never,
    access as never,
    people as never,
    gateway as never,
    { hit: jest.fn().mockResolvedValue(rate) } as never,
  );
  return { service, prisma, tx, access, people, gateway };
}

describe('ChatConversationsService.send', () => {
  it('writes the message, bumps the conversation and pushes it live to the peer', async () => {
    const { service, tx, gateway } = make();
    const out = await service.send(1, 1, 'c1', 'salom');
    expect(out).toMatchObject({ id: 'm1', mine: true, text: 'salom' });
    expect(tx.chatConversation.update).toHaveBeenCalled();
    expect(tx.chatReadState.upsert).toHaveBeenCalled();
    expect(gateway.sendToUser).toHaveBeenCalledWith(
      22,
      expect.objectContaining({
        type: 'chat.message',
        conversationId: 'c1',
        message: expect.objectContaining({ id: 'm1', mine: false }),
      }),
    );
  });

  it('stops at the access check before touching anything else', async () => {
    const { service, prisma } = make({ access: new ForbiddenException('Qarzingiz bor') });
    await expect(service.send(1, 1, 'c1', 'salom')).rejects.toThrow('Qarzingiz bor');
    expect(prisma.chatConversation.findUnique).not.toHaveBeenCalled();
  });

  it('404s for a conversation the caller is not part of', async () => {
    const { service } = make();
    await expect(service.send(99, 1, 'c1', 'x')).rejects.toThrow(NotFoundException);
  });

  it('hides a block behind the same words as a privacy refusal', async () => {
    const { service } = make({ blocked: { iBlocked: false, blockedMe: true } });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      "Bu o'quvchi sizga yozishni cheklagan",
    );
  });

  it('tells the caller to unblock first when the caller blocked the peer', async () => {
    const { service } = make({ blocked: { iBlocked: true, blockedMe: false } });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow('Avval blokdan chiqaring');
  });

  it('honours the peer\'s "groupmates only" setting', async () => {
    const closed = make({ privacy: { whoCanWrite: 'GROUPMATES' }, shares: false });
    await expect(closed.service.send(1, 1, 'c1', 'x')).rejects.toThrow(
      "Bu o'quvchi sizga yozishni cheklagan",
    );
    const open = make({ privacy: { whoCanWrite: 'GROUPMATES' }, shares: true });
    await expect(open.service.send(1, 1, 'c1', 'x')).resolves.toBeDefined();
  });

  it('answers 429 past 30 messages a minute', async () => {
    const { service } = make({ rate: 31 });
    await expect(service.send(1, 1, 'c1', 'x')).rejects.toThrow(HttpException);
  });
});

describe('ChatConversationsService.open', () => {
  it('refuses a conversation with yourself', async () => {
    const { service } = make();
    await expect(
      service.open(1, 1, { studentId: 1 }),
    ).rejects.toThrow(/o'zingiz/i);
  });

  it('puts the smaller id first so a pair has one row', async () => {
    const { service, prisma } = make();
    prisma.chatConversation.findFirst.mockResolvedValue(null);
    await service.open(2, 1, { studentId: 1 });
    expect(prisma.chatConversation.upsert.mock.calls[0][0].where).toEqual({
      studentLowId_studentHighId: { studentLowId: 1, studentHighId: 2 },
    });
  });
});

describe('ChatConversationsService.removeOwn', () => {
  it('soft-deletes only the caller\'s own message', async () => {
    const { service, prisma } = make();
    prisma.chatMessage.findFirst.mockResolvedValue({ id: 'm1', senderId: 1 });
    await service.removeOwn(1, 'm1');
    expect(prisma.chatMessage.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { deletedAt: expect.any(Date) },
    });
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    await expect(service.removeOwn(1, 'zz')).rejects.toThrow(NotFoundException);
  });
});
```

Note: the service takes a small `rateLimiter` object `{ hit(key, ttl): Promise<number> }` as its last constructor argument so the test needs no Redis; the real provider wraps `hit(redis, key, ttl)` (Step 3).

- [ ] **Step 2: Run, expect failure** — `npx jest src/chat/conversations` → FAIL (module not found).

- [ ] **Step 3: Write the service**

Create `server/src/chat/conversations/chat-conversations.service.ts`:

```ts
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { hit } from '../../students/shared/phone-code';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { ChatAccessService } from '../access/chat-access.service';
import {
  I_BLOCKED_MESSAGE,
  RATE_MESSAGE,
  RATE_PER_MINUTE,
  RESTRICTED_MESSAGE,
} from '../chat.constants';
import { mayWrite } from '../people/chat-people.rules';
import {
  ChatPeopleService,
  type PeerSummary,
} from '../people/chat-people.service';
import type { OpenConversationDto } from '../dto/chat.dto';

export interface MessageView {
  id: string;
  senderId: number;
  mine: boolean;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  text: string | null;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  peer: PeerSummary;
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  unread: number;
}

/** A per-student, per-minute counter; replaced by a fake in tests. */
export interface RateLimiter {
  hit(key: string, ttlSec: number): Promise<number>;
}
export const CHAT_RATE_LIMITER = Symbol('CHAT_RATE_LIMITER');

export function redisRateLimiter(redis: RedisService): RateLimiter {
  return { hit: (key, ttl) => hit(redis, key, ttl) };
}

const PAGE = 30;
const pair = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };

const PREVIEW: Record<string, string> = { IMAGE: 'Rasm', VOICE: 'Ovozli xabar' };

@Injectable()
export class ChatConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly people: ChatPeopleService,
    private readonly gateway: NotificationsGateway,
    @Inject(CHAT_RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  private view(
    m: {
      id: string;
      senderId: number;
      kind: string;
      text: string | null;
      createdAt: Date;
    },
    me: number,
  ): MessageView {
    return {
      id: m.id,
      senderId: m.senderId,
      mine: m.senderId === me,
      kind: m.kind as MessageView['kind'],
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    };
  }

  /** The conversation, or 404 — the same answer for "missing" and "not yours". */
  private async mine(me: number, conversationId: string) {
    const c = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!c || (c.studentLowId !== me && c.studentHighId !== me)) {
      throw new NotFoundException('Suhbat topilmadi');
    }
    return { c, peerId: c.studentLowId === me ? c.studentHighId : c.studentLowId };
  }

  /** Opens (or finds) the conversation with one student, by id or exact @username. */
  async open(
    me: number,
    companyId: number,
    dto: OpenConversationDto,
  ): Promise<{ id: string }> {
    let peerId = dto.studentId ?? null;
    if (peerId === null && dto.username) {
      peerId = (await this.people.findByUsername(companyId, dto.username))?.id ?? null;
    }
    if (peerId === null) throw new NotFoundException("O'quvchi topilmadi");
    if (peerId === me) {
      throw new BadRequestException("O'zingiz bilan suhbat ochib bo'lmaydi");
    }
    const peer = await this.prisma.student.findFirst({
      where: { id: peerId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException("O'quvchi topilmadi");

    const { low, high } = pair(me, peerId);
    const existing = await this.prisma.chatConversation.findFirst({
      where: { studentLowId: low, studentHighId: high },
    });
    if (existing) return { id: existing.id };

    // A new conversation needs the same rights as a message.
    await this.access.assertCanWrite(me, companyId);
    await this.assertMayReach(me, peerId);
    const created = await this.prisma.chatConversation.upsert({
      where: { studentLowId_studentHighId: { studentLowId: low, studentHighId: high } },
      create: { companyId, studentLowId: low, studentHighId: high },
      update: {},
    });
    return { id: created.id };
  }

  /** Block first (never revealed as a block), then the peer's "who can write" setting. */
  private async assertMayReach(me: number, peerId: number) {
    const block = await this.people.isBlockedEitherWay(me, peerId);
    if (block.iBlocked) throw new ForbiddenException(I_BLOCKED_MESSAGE);
    if (block.blockedMe) throw new ForbiddenException(RESTRICTED_MESSAGE);
    const privacy = await this.people.privacyOf(peerId);
    const shares =
      privacy.whoCanWrite === 'GROUPMATES'
        ? await this.people.sharesGroup(me, peerId)
        : false;
    if (!mayWrite(privacy.whoCanWrite, shares)) {
      throw new ForbiddenException(RESTRICTED_MESSAGE);
    }
  }

  /**
   * ponytail: one `count` and one `findFirst` per conversation (≤ 50). Replace
   * with a single grouped query if the list gets slow.
   */
  async list(me: number): Promise<ConversationView[]> {
    const rows = await this.prisma.chatConversation.findMany({
      where: { OR: [{ studentLowId: me }, { studentHighId: me }] },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      take: 50,
    });
    return Promise.all(
      rows.map(async (c) => {
        const peerId = c.studentLowId === me ? c.studentHighId : c.studentLowId;
        const [peer, last, read] = await Promise.all([
          this.people.peerSummary(me, peerId),
          this.prisma.chatMessage.findFirst({
            where: { conversationId: c.id, deletedAt: null },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
          this.prisma.chatReadState.findUnique({
            where: { conversationId_studentId: { conversationId: c.id, studentId: me } },
          }),
        ]);
        const unread = await this.prisma.chatMessage.count({
          where: {
            conversationId: c.id,
            senderId: { not: me },
            deletedAt: null,
            ...(read && { createdAt: { gt: read.lastReadAt } }),
          },
        });
        return {
          id: c.id,
          peer,
          lastMessage: last
            ? {
                preview: last.text ?? PREVIEW[last.kind] ?? '',
                at: last.createdAt.toISOString(),
                mine: last.senderId === me,
              }
            : null,
          unread,
        };
      }),
    );
  }

  async messages(
    me: number,
    conversationId: string,
    cursor?: string,
    limit: number = PAGE,
  ): Promise<{ data: MessageView[]; nextCursor: string | null }> {
    await this.mine(me, conversationId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((m) => this.view(m, me)),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async send(
    me: number,
    companyId: number,
    conversationId: string,
    text: string,
  ): Promise<MessageView> {
    await this.access.assertCanWrite(me, companyId);
    const { peerId } = await this.mine(me, conversationId);
    await this.assertMayReach(me, peerId);

    const minute = Math.floor(Date.now() / 60_000);
    const n = await this.limiter.hit(`chat:rate:${me}:${minute}`, 120);
    if (n > RATE_PER_MINUTE) {
      throw new HttpException(RATE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({
        data: { conversationId, senderId: me, kind: 'TEXT', text },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt },
      });
      // Writing means having read everything so far.
      await tx.chatReadState.upsert({
        where: { conversationId_studentId: { conversationId, studentId: me } },
        create: { conversationId, studentId: me, lastReadAt: m.createdAt },
        update: { lastReadAt: m.createdAt },
      });
      return m;
    });

    await this.pushToPeer(peerId, {
      type: 'chat.message',
      conversationId,
      message: this.view(row, peerId),
    });
    return this.view(row, me);
  }

  async markRead(me: number, conversationId: string): Promise<{ ok: true }> {
    const { peerId } = await this.mine(me, conversationId);
    const readAt = new Date();
    await this.prisma.chatReadState.upsert({
      where: { conversationId_studentId: { conversationId, studentId: me } },
      create: { conversationId, studentId: me, lastReadAt: readAt },
      update: { lastReadAt: readAt },
    });
    await this.pushToPeer(peerId, {
      type: 'chat.read',
      conversationId,
      readAt: readAt.toISOString(),
    });
    return { ok: true };
  }

  async removeOwn(me: number, messageId: string): Promise<{ ok: true }> {
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, senderId: me, deletedAt: null },
    });
    if (!m) throw new NotFoundException('Xabar topilmadi');
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /** Live delivery over the existing SSE stream; a student with no account gets nothing. */
  private async pushToPeer(peerId: number, payload: object): Promise<void> {
    const peer = await this.prisma.student.findFirst({
      where: { id: peerId },
      select: { userId: true },
    });
    if (peer?.userId) this.gateway.sendToUser(peer.userId, payload);
  }
}
```

The test's `prisma.student.findFirst` mock returns `{ id: 2, userId: 22 }`, which `open` and `pushToPeer` both consume — keep that shape.

- [ ] **Step 4: Run, expect pass**

Run: `npx jest src/chat/conversations`
Expected: PASS. If `list` is not covered by the spec, add one test that returns an empty array when `findMany` returns `[]`:

```ts
it('lists nothing for a student without conversations', async () => {
  const { service, prisma } = make();
  (prisma.chatConversation as Record<string, jest.Mock>).findMany = jest.fn().mockResolvedValue([]);
  expect(await service.list(1)).toEqual([]);
});
```

(Add it inside the `describe('ChatConversationsService.open'` block's sibling `describe('list'` — create the block.)

- [ ] **Step 5: Wire the module and routes**

`chat.module.ts` becomes:

```ts
import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisService } from '../redis/redis.service';
import { SettingsModule } from '../settings/settings.module';
import { ChatAccessService } from './access/chat-access.service';
import { ChatController } from './chat.controller';
import {
  CHAT_RATE_LIMITER,
  ChatConversationsService,
  redisRateLimiter,
} from './conversations/chat-conversations.service';
import { ChatPeopleService } from './people/chat-people.service';
import { ChatUsernameService } from './username/chat-username.service';

@Module({
  imports: [SettingsModule, NotificationsModule],
  controllers: [ChatController],
  providers: [
    ChatAccessService,
    ChatPeopleService,
    ChatUsernameService,
    ChatConversationsService,
    {
      provide: CHAT_RATE_LIMITER,
      useFactory: redisRateLimiter,
      inject: [RedisService],
    },
  ],
  exports: [ChatAccessService, ChatPeopleService, ChatConversationsService],
})
export class ChatModule {}
```

(`RedisModule` is global; if the app fails to resolve `RedisService`, add the module that provides it to `imports`.)

In `chat.controller.ts` add `Delete, Param` to the `@nestjs/common` import, `ParseUUIDPipe`, `ChatConversationsService`, DTOs `MessagesQueryDto, OpenConversationDto, SendMessageDto`, inject `private readonly conversations: ChatConversationsService`, and add:

```ts
  @Post('conversations')
  open(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Body() dto: OpenConversationDto,
  ) {
    return this.conversations.open(studentId, companyId, dto);
  }

  @Get('conversations')
  list(@CurrentUser('studentId') studentId: number) {
    return this.conversations.list(studentId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser('studentId') studentId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.conversations.messages(studentId, id, query.cursor, query.limit);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser('studentId') studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.conversations.send(studentId, companyId, id, dto.text);
  }

  @Patch('conversations/:id/read')
  markRead(
    @CurrentUser('studentId') studentId: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.markRead(studentId, id);
  }

  @Delete('messages/:id')
  removeOwn(
    @CurrentUser('studentId') studentId: number,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.conversations.removeOwn(studentId, id);
  }
```

Add `ParseUUIDPipe` to the `@nestjs/common` import list.

- [ ] **Step 6: Run chat specs and typecheck, then commit**

Run: `npx jest src/chat && npm run typecheck`
Expected: PASS.

```bash
npx prettier --write src/chat
git add src/chat
git commit -m "feat(chat): conversations, text messages, read state and live delivery"
```

---

### Task 7: Route manifests, snapshot, docs

**Files:**
- Modify: `server/src/common/auth/branch-route-policy.ts` (new `SELF` group)
- Modify: `server/src/common/permissions/route-access.snapshot.json`
- Modify: `server/CLAUDE.md` (one section)

- [ ] **Step 1: Run the manifest specs, expect failures that name the routes**

Run: `npx jest src/common/auth src/common/permissions`
Expected: FAIL — the new `chat/*` routes are missing from the branch-route manifest and from `route-access.snapshot.json`. The failure message lists the exact route keys; they are these 13:

```
GET /chat/access            PUT /chat/username        GET /chat/me
PATCH /chat/privacy         POST /chat/block          POST /chat/unblock
GET /chat/search            POST /chat/conversations  GET /chat/conversations
GET /chat/conversations/:id/messages                  POST /chat/conversations/:id/messages
PATCH /chat/conversations/:id/read                    DELETE /chat/messages/:id
```

- [ ] **Step 2: Add the manifest entry**

In `branch-route-policy.ts`, next to the other `student-portal` `SELF` groups (the onboarding group around line 868), add:

```ts
  {
    policy: 'SELF',
    reason:
      "Keyed on `@CurrentUser('studentId')` behind `StudentCardGuard` — the " +
      "student's own chat (spec 2026-10-25): their access status, username, " +
      'privacy, blocks, search, and conversations they are a member of. A ' +
      "conversation or message id that is not the caller's answers 404, and " +
      'no student id other than a target (block, open) comes from the request.',
    routes: [
      'GET /chat/access',
      'PUT /chat/username',
      'GET /chat/me',
      'PATCH /chat/privacy',
      'POST /chat/block',
      'POST /chat/unblock',
      'GET /chat/search',
      'POST /chat/conversations',
      'GET /chat/conversations',
      'GET /chat/conversations/:id/messages',
      'POST /chat/conversations/:id/messages',
      'PATCH /chat/conversations/:id/read',
      'DELETE /chat/messages/:id',
    ],
  },
```

- [ ] **Step 3: Add the snapshot rows (every chat route is Student-only)**

From `server/`:

```bash
node -e '
const fs=require("fs");const f="src/common/permissions/route-access.snapshot.json";
const j=JSON.parse(fs.readFileSync(f,"utf8"));
for (const k of ["GET /chat/access","PUT /chat/username","GET /chat/me","PATCH /chat/privacy","POST /chat/block","POST /chat/unblock","GET /chat/search","POST /chat/conversations","GET /chat/conversations","GET /chat/conversations/:id/messages","POST /chat/conversations/:id/messages","PATCH /chat/conversations/:id/read","DELETE /chat/messages/:id"]) j[k]=["Student"];
const out={};for (const k of Object.keys(j).sort()) out[k]=j[k];
fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n");
'
git diff --stat src/common/permissions/route-access.snapshot.json
```

Expected: the diff stat shows only added lines (about 39). If it shows many changed lines the file was not key-sorted: `git checkout` the file and insert the 13 rows by hand in sorted position instead.

- [ ] **Step 4: Run the manifest specs again, expect pass**

Run: `npx jest src/common/auth src/common/permissions`
Expected: PASS. If `intentional-access-changes` or a "new route needs a reason" spec still complains, the route is new (not changed), so only the snapshot row is needed — re-read the failure text.

- [ ] **Step 5: Document in `server/CLAUDE.md`**

Add this section just before `### Notifications (4 channels)` (English, short):

```markdown
### Student chat (`src/chat/`, spec 2026-10-25)

Student-to-student private chat, behind the company switch `chat.enabled` (default off). Plan A (this layer) ships text only.

- **One access rule.** `ChatAccessService.forStudent` is the only place that decides whether a student may write: `balance >= 0`, gender and birth date set, the card's phone proved (`isPhoneVerified` — NOT `missingOnboardingSteps`, which only asks for the phone while `STUDENT_PHONE_VERIFICATION_ENABLED` is on), not banned, and the last 7 Tashkent days (today + 6) hold at least `chat.weekMinutesActive` active and `chat.weekMinutesRadio` radio minutes in `StudentAppSession`. The pure rules and the Uzbek texts are `chat/access/chat-access.rules.ts`; clients print the texts the API returns and compute nothing.
- **Reading is never closed.** A locked student reads everything and receives messages; only writing (and opening a new conversation) is refused.
- **Send checks run in this order:** access → membership (404 for a conversation that is not yours) → block → the peer's `whoCanWrite` → 30/minute rate limit. A block and a privacy refusal share one message so a block is never revealed.
- **Another student sees a name, `@username` and (if allowed) a photo — never a phone, a debt or a balance.** `PeerSummary` is the only shape that leaves.
- **Live delivery** goes through `NotificationsGateway.sendToUser(student.userId, …)` as `chat.message` / `chat.read`; the existing stream carries them.
- Media, reports, the CEO's ban, Telegram and the bell arrive with Plan B; clients with Plan C.
```

- [ ] **Step 6: Full verification and commit**

Run (one after the other, never in parallel): `npm run typecheck`, then `npx jest src/chat src/common src/settings`, then `npx eslint src/chat --quiet`.
Expected: all green.

```bash
npx prettier --write src/common/auth/branch-route-policy.ts
git add src/common server/CLAUDE.md
git commit -m "feat(chat): route manifests, access snapshot and docs"
```

---

## Self-review (spec coverage for this plan)

- §1 access rules (4 conditions, 7-day window, tomorrow warning, CEO settings, reading stays open): Tasks 1–3. The ban column exists (Task 1) and is read by the rule (Task 2); the CEO action that sets it is Plan B.
- §2 data: all tables, `username`, `chatBannedAt`, partial unique index: Task 1. Files, purge, report snapshot writes: Plan B.
- §3 routes: access, username, me/privacy, block/unblock, search, conversations, messages, read, delete-own: Tasks 3–6. Files route, report, CEO routes: Plan B. SSE events `chat.message`/`chat.read`: Task 6; `chat.access`: Plan B (it needs the practice-heartbeat hook). Bell/push/Telegram: Plan B.
- §4 screens: Plan C. §5 `chat.enabled` kill switch and send-order tests: Tasks 1, 3, 6.
- Spec items intentionally pending: "Tekshirilishi" 1–2 (prod phone-verification flag; `StudentAppSession` written from web/Mini App/app) are checked at the start of Plan B/C; chat stays off until both are green.

Type names used across tasks: `ChatAccess`, `QuotaResult`, `ChatLockReason`, `PeerSummary`, `MessageView`, `ConversationView`, `RateLimiter`/`CHAT_RATE_LIMITER`, `OpenConversationDto` — each defined in the task that produces it and imported by name afterwards.
