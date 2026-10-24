# Adminlar KPI — 1-bosqich: lid egasi — reja

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Har lidning bitta egasi bo'ladi. Administrator lidni band qiladi,
CEO va filial direktori lidni boshqa xodimga beradi. Muddatida harakat
qilinmagan lid umumiy ro'yxatga o'zi qaytadi, har qadam tarixga yoziladi.

**Architecture:** `Lead` ga uchta maydon qo'shiladi (`ownerId`, `ownedAt`,
`ownerActedAt`), egalik tarixi `LeadOwnershipLog` jadvaliga yoziladi. Muddat
saqlanmaydi: u har safar `ownershipDueAt` sof funksiyasi bilan hisoblanadi (ish
vaqti du–sha 08:00–18:00, bayramlar chiqarib tashlanadi). Hamma yozuv yangi
`LeadOwnershipService` orqali o'tadi. Har 15 daqiqada ishlaydigan cron muddati
o'tgan lidlarni qaytaradi. Saytda kartochka belgisi, lid oynasidagi «Mas'ul»
bloki, filtr, xodimlar qatori va sozlamalar sahifasi qo'shiladi.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest; Next.js + zustand +
TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-admin-kpi-design.md` §6.

## Global Constraints

- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-kpi`,
  shox `feat/admin-kpi-lid-egasi` (origin/main 2e45f5ea dan). Asosiy katalogga
  (`/Users/a1111/Desktop/daf-erp-system`) hech narsa yozilmaydi.
- Server buyruqlari `server/` dan: `npx jest <path>`, `npm run typecheck`,
  `npx eslint <files>`, `npx prettier --write <touched .ts>`.
- Client buyruqlari `client/` dan: `npm test -- <path>` (vitest),
  `npx eslint <files>`, `npm run build`. **Client fayllariga prettier
  ishlatilmaydi.**
- Commit xabarlari va kod izohlari inglizcha, oxirida
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Ekrandagi har matn lotin o'zbekchada, inglizcha so'zsiz.
- Faqat dev baza (`server/.env`). Prod bazaga hech narsa yozilmaydi.
- Ish vaqti: dushanba–shanba 08:00–18:00 Asia/Tashkent. Kompaniya va lid
  filiali bayram kunlari ish vaqtiga kirmaydi.
- Sozlama standartlari: harakatsiz lidlar chegarasi **10**, birinchi harakat
  **2** ish soati, keyingi harakat **3** ish kuni.
- Ruxsatlar: `leads.claim` (standart: Administrator; berilishi mumkin:
  Direktor, Administrator, Kassir), `leads.assign` (standart va berilishi
  mumkin: Direktor). CEO har doim ikkalasiga ega.
- Harakat — faqat EGASI qilgani: qo'ng'iroq belgisi, lidga izoh, lidga
  topshiriq (yaratish, holatini o'zgartirish, izoh yozish). Kartochkani surish
  va lid ma'lumotini tahrirlash harakat emas.
- O'quvchiga aylangan lidning egasi qotadi: uni band qilib, berib yoki
  bo'shatib bo'lmaydi.
- Tarix yozuvlari (`EntityHistory`, `action`): `LID_BAND_QILINDI`,
  `LID_BERILDI`, `LID_BOSHATILDI`, `LID_QAYTDI`; maydonlar `masul`, `sabab`.

## Fayllar xaritasi

Server (yangi):
- `server/src/leads/ownership/ownership-deadline.ts` (+ `.spec.ts`) — sof muddat hisobi.
- `server/src/leads/ownership/ownership-history.ts` (+ `.spec.ts`) — tarix qiymatlari.
- `server/src/leads/ownership/owner-action.ts` (+ `.spec.ts`) — egasi harakatini belgilash.
- `server/src/leads/ownership/lead-ownership.service.ts` (+ `.spec.ts`) — band qilish, berish, bo'shatish, qaytarish, xulosa.
- `server/src/leads/ownership/lead-ownership.cron.ts` — 15 daqiqalik tekshiruv.
- `server/src/leads/ownership/lead-owner-task.listener.ts` (+ `.spec.ts`) — topshiriq hodisalari.
- `server/src/leads/ownership/lead-ownership.controller.ts` (+ `.spec.ts`) va `dto/*.ts`.
- `server/src/notifications/lead-owner-notices.ts` (+ `.spec.ts`), `lead-owner-notify.listener.ts`.
- `server/prisma/migrations/20261016120000_lead_ownership/migration.sql`.

Server (o'zgaradi): `prisma/schema.prisma`, `settings/settings.types.ts`,
`common/permissions/permission-catalog.people.ts` (+ spec),
`common/permissions/route-access.snapshot.json`,
`common/auth/branch-route-policy.ts`, `leads/lead-events.ts`,
`leads/leads.module.ts`, `leads/leads.service.ts` (+ spec),
`leads/leads.controller.ts`, `leads/dto/lead-query.dto.ts`,
`leads/leads-archive.service.ts` (+ spec), `comments/comments.service.ts`
(+ spec), `notifications/notifications.module.ts`.

Client (yangi): `client/src/components/leads/ownership/` —
`ownership-format.ts` (+ `.test.ts`), `use-lead-ownership.ts`,
`lead-owner-badge.tsx`, `lead-owner-block.tsx`, `lead-owner-assign.tsx`,
`lead-owners-strip.tsx`; `client/src/app/(dashboard)/settings/lead-ownership/page.tsx`,
`client/src/components/settings/lead-ownership-settings-client.tsx`;
`client/src/qollanma/kontent/oquvchilar/lid-egasi.mdx`.

Client (o'zgaradi): `lib/permission-keys.ts`, `hooks/use-leads-board.ts`,
`components/leads/lead-card.tsx`, `lead-detail-drawer.tsx`,
`lead-filter-schema.ts` (+ test), `leads-filter-bar.tsx`, `leads-list.tsx`,
`leads-board-client.tsx`, `lib/settings-nav.ts` (+ test),
`lib/breadcrumb-routes.ts`, `components/shared/entity-history-utils.ts`,
`qollanma/sahifalar/oquvchilar.ts`, `qollanma/yangiliklar.ts`.

Hujjatlar: `docs/adr/0093-lid-egasi.md`, `docs/adr/README.md`,
`server/CLAUDE.md`, `client/CLAUDE.md`.

---

### Task 1: Ish joyi va ma'lumotlar sxemasi

**Files:**
- Modify: `server/prisma/schema.prisma` (`model User`, `model Lead`, yangi enum va model)
- Create: `server/prisma/migrations/20261016120000_lead_ownership/migration.sql`

**Interfaces:**
- Produces: Prisma tiplari `LeadOwnershipKind` (`CLAIM | ASSIGN | RELEASE | EXPIRE`), `Lead.ownerId/ownedAt/ownerActedAt/owner`, `LeadOwnershipLog`.

- [ ] **Step 1: Bog'liqliklarni o'rnatish**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-kpi
ln -s /Users/a1111/Desktop/daf-erp-system/server/.env server/.env
(cd server && npm ci)
(cd client && npm ci)
```

Kutilgan: ikkala `npm ci` xatosiz tugaydi. `server/node_modules` symlink
EMAS — asosiy katalog boshqa shoxda, uning Prisma client'i eski sxemadan.

- [ ] **Step 2: Sxemani o'zgartirish**

`model User` ichida `calledLeads` qatoridan keyin:

```prisma
  ownedLeads                       Lead[]                     @relation("LeadOwner")
```

`model Lead` ichida `deletionBatchId String?` qatoridan keyin, `formSubmissions` dan oldin:

```prisma
  // Lead owner (ADR-0093). `ownerId` is the current owner (null = the common
  // pool); `ownedAt` is when the current ownership began; `ownerActedAt` is the
  // owner's last action in it (null = none yet). The deadline is never stored:
  // `ownershipDueAt` derives it from these two fields.
  ownerId       Int?
  owner         User?              @relation("LeadOwner", fields: [ownerId], references: [id])
  ownedAt       DateTime?
  ownerActedAt  DateTime?
  ownershipLogs LeadOwnershipLog[]
```

Va `model Lead` indekslariga:

```prisma
  @@index([ownerId])
```

`model Lead { ... }` tugagandan keyin:

```prisma
enum LeadOwnershipKind {
  CLAIM
  ASSIGN
  RELEASE
  EXPIRE
}

// Every change of a lead's owner (ADR-0093), append-only. Reports and the
// later KPI stages read it; the lead's «Tarix» tab gets an EntityHistory row
// for the same change. User ids are plain columns, like `statusChangedById`.
model LeadOwnershipLog {
  id         String            @id @default(uuid())
  leadId     String
  lead       Lead              @relation(fields: [leadId], references: [id], onDelete: Cascade)
  kind       LeadOwnershipKind
  fromUserId Int?
  toUserId   Int?
  // Null = the system (the deadline passed).
  actorId    Int?
  reason     String?
  branchId   Int?
  companyId  Int
  createdAt  DateTime          @default(now())

  @@index([leadId])
  @@index([companyId, kind, createdAt])
  @@index([fromUserId])
}
```

- [ ] **Step 3: Migratsiya faylini yozish**

`server/prisma/migrations/20261016120000_lead_ownership/migration.sql`:

```sql
-- Lead owner (ADR-0093): a staff member claims a lead; without an action in
-- time the lead returns to the common pool. Idempotent, like the other
-- hand-written migrations here.
DO $$
BEGIN
  CREATE TYPE "LeadOwnershipKind" AS ENUM ('CLAIM', 'ASSIGN', 'RELEASE', 'EXPIRE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownerId" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "ownerActedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Lead_ownerId_idx" ON "Lead"("ownerId");

DO $$
BEGIN
  ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "LeadOwnershipLog" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "kind" "LeadOwnershipKind" NOT NULL,
  "fromUserId" INTEGER,
  "toUserId" INTEGER,
  "actorId" INTEGER,
  "reason" TEXT,
  "branchId" INTEGER,
  "companyId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadOwnershipLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_leadId_idx" ON "LeadOwnershipLog"("leadId");
CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_companyId_kind_createdAt_idx"
  ON "LeadOwnershipLog"("companyId", "kind", "createdAt");
CREATE INDEX IF NOT EXISTS "LeadOwnershipLog_fromUserId_idx" ON "LeadOwnershipLog"("fromUserId");

DO $$
BEGIN
  ALTER TABLE "LeadOwnershipLog" ADD CONSTRAINT "LeadOwnershipLog_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

- [ ] **Step 4: Dev bazaga qo'llash va client yaratish**

```bash
cd server
npx prisma db execute --file prisma/migrations/20261016120000_lead_ownership/migration.sql
npx prisma migrate resolve --applied 20261016120000_lead_ownership
npx prisma generate
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script | grep -iE 'ownerId|ownedAt|ownerActedAt|LeadOwnership' || echo "toza"
```

Kutilgan: oxirgi buyruq `toza` chiqaradi (diffda boshqa shoxlarning eski
farqlari bo'lishi mumkin — ularga tegilmaydi).

- [ ] **Step 5: Tip tekshiruvi**

Run: `npm run typecheck`
Expected: xatosiz.

- [ ] **Step 6: Commit**

```bash
cd ..
git add server/prisma/schema.prisma server/prisma/migrations/20261016120000_lead_ownership
git commit -m "feat(leads): lead owner fields and ownership log (ADR-0093)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Muddat hisobi (sof funksiyalar)

**Files:**
- Create: `server/src/leads/ownership/ownership-deadline.ts`
- Test: `server/src/leads/ownership/ownership-deadline.spec.ts`

**Interfaces:**
- Produces:
  - `interface OwnershipRules { maxUntouched: number; firstActionHours: number; followUpDays: number }`
  - `type IsHoliday = (dateStr: string) => boolean`
  - `addWorkingHours(from: Date, hours: number, isHoliday: IsHoliday): Date`
  - `endOfNthWorkingDayAfter(from: Date, n: number, isHoliday: IsHoliday): Date`
  - `ownershipDueAt(lead: { ownedAt: Date; ownerActedAt: Date | null }, rules: Pick<OwnershipRules, 'firstActionHours' | 'followUpDays'>, isHoliday: IsHoliday): Date`

- [ ] **Step 1: Yiqiladigan testni yozish**

`server/src/leads/ownership/ownership-deadline.spec.ts`:

```ts
import {
  addWorkingHours,
  endOfNthWorkingDayAfter,
  ownershipDueAt,
} from './ownership-deadline';

// Tashkent wall clock to an instant. 2026-10-19 is a Monday.
const t = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
const none = () => false;
const holidays =
  (...days: string[]) =>
  (day: string) =>
    days.includes(day);

describe('addWorkingHours', () => {
  it('stays inside one working day', () => {
    expect(addWorkingHours(t('2026-10-19', '10:00'), 2, none)).toEqual(
      t('2026-10-19', '12:00'),
    );
  });

  it('carries the rest to the next morning', () => {
    expect(addWorkingHours(t('2026-10-19', '17:00'), 2, none)).toEqual(
      t('2026-10-20', '09:00'),
    );
  });

  it('can end exactly at 18:00', () => {
    expect(addWorkingHours(t('2026-10-19', '16:00'), 2, none)).toEqual(
      t('2026-10-19', '18:00'),
    );
  });

  it('starts at 08:00 when the lead is taken before the day opens', () => {
    expect(addWorkingHours(t('2026-10-19', '06:00'), 2, none)).toEqual(
      t('2026-10-19', '10:00'),
    );
  });

  it('starts the next working morning when taken after 18:00', () => {
    expect(addWorkingHours(t('2026-10-23', '19:00'), 2, none)).toEqual(
      t('2026-10-24', '10:00'),
    );
  });

  it('skips Sunday', () => {
    expect(addWorkingHours(t('2026-10-24', '17:30'), 2, none)).toEqual(
      t('2026-10-26', '09:30'),
    );
    expect(addWorkingHours(t('2026-10-25', '12:00'), 2, none)).toEqual(
      t('2026-10-26', '10:00'),
    );
  });

  it('skips a holiday', () => {
    expect(
      addWorkingHours(t('2026-10-19', '17:00'), 2, holidays('2026-10-20')),
    ).toEqual(t('2026-10-21', '09:00'));
  });
});

describe('endOfNthWorkingDayAfter', () => {
  it("ends at 18:00 of the n-th working day after the action's day", () => {
    expect(endOfNthWorkingDayAfter(t('2026-10-19', '15:00'), 3, none)).toEqual(
      t('2026-10-22', '18:00'),
    );
  });

  it('skips Sunday', () => {
    expect(endOfNthWorkingDayAfter(t('2026-10-22', '10:00'), 3, none)).toEqual(
      t('2026-10-26', '18:00'),
    );
    expect(endOfNthWorkingDayAfter(t('2026-10-24', '12:00'), 3, none)).toEqual(
      t('2026-10-28', '18:00'),
    );
  });

  it('skips a holiday', () => {
    expect(
      endOfNthWorkingDayAfter(
        t('2026-10-19', '15:00'),
        3,
        holidays('2026-10-21'),
      ),
    ).toEqual(t('2026-10-23', '18:00'));
  });
});

describe('ownershipDueAt', () => {
  const rules = { firstActionHours: 2, followUpDays: 3 };

  it('gives the first action two working hours from the claim', () => {
    expect(
      ownershipDueAt(
        { ownedAt: t('2026-10-19', '10:00'), ownerActedAt: null },
        rules,
        none,
      ),
    ).toEqual(t('2026-10-19', '12:00'));
  });

  it('gives the next action three working days from the last one', () => {
    expect(
      ownershipDueAt(
        {
          ownedAt: t('2026-10-19', '10:00'),
          ownerActedAt: t('2026-10-19', '11:00'),
        },
        rules,
        none,
      ),
    ).toEqual(t('2026-10-22', '18:00'));
  });
});
```

- [ ] **Step 2: Test yiqilishini ko'rish**

Run: `npx jest src/leads/ownership/ownership-deadline.spec.ts`
Expected: FAIL — `Cannot find module './ownership-deadline'`.

- [ ] **Step 3: Funksiyalarni yozish**

`server/src/leads/ownership/ownership-deadline.ts`:

```ts
import {
  addDaysToDateStr,
  dayOfWeekForDateStr,
  tashkentDateStr,
  tashkentDayStartUtc,
} from '../../common/date/tashkent';

/**
 * The clock a lead's owner works against (ADR-0093): Monday–Saturday,
 * 08:00–18:00 Tashkent, holidays left out. The same window as manual task
 * due dates and the automatic lead tasks.
 */
export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 18;
const HOUR_MS = 3_600_000;
// A holiday lasts at most 60 days, so a working day is always within reach.
const MAX_DAYS = 400;

export interface OwnershipRules {
  /** How many claimed leads with no action yet one person may hold. */
  maxUntouched: number;
  /** Working hours from the claim to the first action. */
  firstActionHours: number;
  /** Working days from an action to the next one. */
  followUpDays: number;
}

/** True when the Tashkent day 'YYYY-MM-DD' is a holiday for the lead. */
export type IsHoliday = (dateStr: string) => boolean;

function isWorkingDay(day: string, isHoliday: IsHoliday): boolean {
  return dayOfWeekForDateStr(day) !== 0 && !isHoliday(day);
}

function at(day: string, hour: number): Date {
  return new Date(tashkentDayStartUtc(day).getTime() + hour * HOUR_MS);
}

/** `from` plus `hours` of working time. */
export function addWorkingHours(
  from: Date,
  hours: number,
  isHoliday: IsHoliday,
): Date {
  let remaining = hours * HOUR_MS;
  let day = tashkentDateStr(from);
  for (let i = 0; i < MAX_DAYS; i++) {
    if (isWorkingDay(day, isHoliday)) {
      const open = at(day, WORK_START_HOUR).getTime();
      const close = at(day, WORK_END_HOUR).getTime();
      const start = i === 0 ? Math.max(open, from.getTime()) : open;
      if (start < close) {
        if (remaining <= close - start) return new Date(start + remaining);
        remaining -= close - start;
      }
    }
    day = addDaysToDateStr(day, 1);
  }
  throw new Error('addWorkingHours: no working day within reach');
}

/** 18:00 of the n-th working day after the Tashkent day of `from`. */
export function endOfNthWorkingDayAfter(
  from: Date,
  n: number,
  isHoliday: IsHoliday,
): Date {
  let day = tashkentDateStr(from);
  let count = 0;
  for (let i = 0; i < MAX_DAYS; i++) {
    day = addDaysToDateStr(day, 1);
    if (isWorkingDay(day, isHoliday) && ++count === n) {
      return at(day, WORK_END_HOUR);
    }
  }
  throw new Error('endOfNthWorkingDayAfter: no working day within reach');
}

/**
 * When an owned lead goes back to the common pool unless its owner acts.
 * Never stored: a changed setting reaches every lead at once.
 */
export function ownershipDueAt(
  lead: { ownedAt: Date; ownerActedAt: Date | null },
  rules: Pick<OwnershipRules, 'firstActionHours' | 'followUpDays'>,
  isHoliday: IsHoliday,
): Date {
  return lead.ownerActedAt
    ? endOfNthWorkingDayAfter(lead.ownerActedAt, rules.followUpDays, isHoliday)
    : addWorkingHours(lead.ownedAt, rules.firstActionHours, isHoliday);
}
```

- [ ] **Step 4: Test o'tishini ko'rish**

Run: `npx jest src/leads/ownership/ownership-deadline.spec.ts`
Expected: PASS (12 ta test).

- [ ] **Step 5: Format va commit**

```bash
npx prettier --write src/leads/ownership/ownership-deadline.ts src/leads/ownership/ownership-deadline.spec.ts
cd .. && git add server/src/leads/ownership && git commit -m "feat(leads): working-time deadline for lead owners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sozlamalar kalitlari

**Files:**
- Modify: `server/src/settings/settings.types.ts`
- Test: `server/src/settings/lead-ownership-settings.spec.ts`

**Interfaces:**
- Produces: `SettingKey` ga `'leads.maxUntouched' | 'leads.firstActionHours' | 'leads.followUpDays'` (hammasi `number`, `companyLevelOnly: true`).

- [ ] **Step 1: Yiqiladigan test**

`server/src/settings/lead-ownership-settings.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { getSettingDefinition } from './settings.types';

describe('lead ownership settings (ADR-0093)', () => {
  it.each([
    ['leads.maxUntouched', 10, 1, 100],
    ['leads.firstActionHours', 2, 1, 24],
    ['leads.followUpDays', 3, 1, 14],
  ] as const)(
    '%s defaults to %i and accepts whole numbers %i..%i',
    (key, defaultValue, min, max) => {
      const def = getSettingDefinition(key);
      expect(def.defaultValue).toBe(defaultValue);
      expect(def.companyLevelOnly).toBe(true);
      expect(def.parse(min)).toBe(min);
      expect(def.parse(max)).toBe(max);
      expect(() => def.parse(min - 1)).toThrow(BadRequestException);
      expect(() => def.parse(max + 1)).toThrow(BadRequestException);
      expect(() => def.parse(1.5)).toThrow(BadRequestException);
      expect(() => def.parse('5')).toThrow(BadRequestException);
    },
  );
});
```

- [ ] **Step 2: Yiqilishini ko'rish**

Run: `npx jest src/settings/lead-ownership-settings.spec.ts`
Expected: FAIL (kalit registrda yo'q).

- [ ] **Step 3: Registrga qo'shish**

`settings.types.ts` da:

1. `SettingKey` ittifoqining oxiriga (`| 'lessonRating.enabled'` dan keyin):

```ts
  | 'leads.maxUntouched'
  | 'leads.firstActionHours'
  | 'leads.followUpDays';
```

(`'lessonRating.enabled';` dagi nuqtali vergulni olib tashlang.)

2. `SettingValueMap` oxiriga:

```ts
  'leads.maxUntouched': number;
  'leads.firstActionHours': number;
  'leads.followUpDays': number;
```

3. `parseReminderDays` funksiyasidan keyin:

```ts
/** A whole number in `[min, max]`, refused with the key's name otherwise. */
function parseIntInRange(
  key: string,
  raw: unknown,
  min: number,
  max: number,
): number {
  if (
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= min &&
    raw <= max
  ) {
    return raw;
  }
  throw new BadRequestException(
    `${key} ${min} dan ${max} gacha bo'lgan butun son bo'lishi kerak, kelgan qiymat: ${JSON.stringify(raw)}`,
  );
}
```

4. `SETTING_DEFINITIONS` da `'lessonRating.enabled'` yozuvidan keyin:

```ts
  // Lead owner (ADR-0093): read by `LeadOwnershipService` per company; the
  // CEO changes them on Sozlamalar → «Lidlar egaligi».
  'leads.maxUntouched': {
    key: 'leads.maxUntouched',
    defaultValue: 10,
    parse: (raw) => parseIntInRange('leads.maxUntouched', raw, 1, 100),
    companyLevelOnly: true,
  },
  'leads.firstActionHours': {
    key: 'leads.firstActionHours',
    defaultValue: 2,
    parse: (raw) => parseIntInRange('leads.firstActionHours', raw, 1, 24),
    companyLevelOnly: true,
  },
  'leads.followUpDays': {
    key: 'leads.followUpDays',
    defaultValue: 3,
    parse: (raw) => parseIntInRange('leads.followUpDays', raw, 1, 14),
    companyLevelOnly: true,
  },
```

- [ ] **Step 4: Testlar**

Run: `npx jest src/settings`
Expected: PASS. Agar biror spec kalitlar sonini sanasa (masalan
`SETTING_KEYS` uzunligi yoki `getMany` natijasi), kutilgan sonni 3 ga oshiring.

- [ ] **Step 5: Format va commit**

```bash
npx prettier --write src/settings/settings.types.ts src/settings/lead-ownership-settings.spec.ts
cd .. && git add server/src/settings && git commit -m "feat(settings): lead ownership limits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ruxsatlar katalogi

**Files:**
- Modify: `server/src/common/permissions/permission-catalog.people.ts`
- Modify: `server/src/common/permissions/permission-catalog.spec.ts`
- Modify: `client/src/lib/permission-keys.ts`

**Interfaces:**
- Produces: `PermissionKey` ga `'leads.claim'`, `'leads.assign'`.

- [ ] **Step 1: Spec'ni yangilash (avval yiqiladi)**

`permission-catalog.spec.ts` da:
- `TABLE` dagi `['leads.forms', ...]` qatoridan keyin:

```ts
  ['leads.claim', 'A', 'DAK', { T: 'OWN_GROUPS' }],
  ['leads.assign', 'D', 'D', { A: 'UNTESTED', K: 'UNTESTED', T: 'OWN_GROUPS' }],
```

- `'has 67 capabilities in 14 sections...'` → `'has 69 capabilities in 14 sections, none of them empty'`, `toHaveLength(67)` → `toHaveLength(69)`.
- `defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(67)` va keyingi qator → `69`.
- `'counts 97 locked cells, 65 keys with a lock and 7 CEO-only keys'` → `'counts 101 locked cells, 67 keys with a lock and 7 CEO-only keys'`, `toBe(97)` → `toBe(101)`, `toHaveLength(65)` → `toHaveLength(67)`.

Run: `npx jest src/common/permissions/permission-catalog.spec.ts`
Expected: FAIL (kalitlar katalogda yo'q).

- [ ] **Step 2: Katalogga qo'shish**

`permission-catalog.people.ts` da `'leads.forms'` yozuvidan keyin:

```ts
  // Lead owner (ADR-0093). Claiming is the administrator's daily work; a
  // director or a cashier who works leads can be given it on «Ruxsatlar».
  'leads.claim': {
    section: 'leads',
    label: "Lidni band qilish va o'z lidini bo'shatish",
    defaultRoles: [A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['leads.view'],
  },
  // Handing a lead to someone else is a manager's tool (CEO, 16.10.2026):
  // `LeadOwnershipService.assign` trusts the caller's branch scope as a
  // director's and was never tried for an administrator or a cashier.
  'leads.assign': {
    section: 'leads',
    label: 'Lidni boshqa xodimga berish',
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.UNTESTED,
      [K]: LOCK.UNTESTED,
      [T]: LOCK.OWN_GROUPS,
    },
    requires: ['leads.view'],
  },
```

- [ ] **Step 3: Client nusxasi**

`client/src/lib/permission-keys.ts` da `"leads.forms",` qatoridan keyin:

```ts
  "leads.claim",
  "leads.assign",
```

- [ ] **Step 4: Testlar**

```bash
cd server && npx jest src/common/permissions
cd ../client && npm test -- src/lib/permission-keys.test.ts src/lib/settings-nav.test.ts src/lib/nav-items.test.ts
```

Expected: PASS. Boshqa spec katalog sonlarini sanasa (masalan
`role-permissions.service.spec.ts`), xuddi shunday 67 → 69 qiling.

- [ ] **Step 5: Format va commit**

```bash
cd ../server && npx prettier --write src/common/permissions/permission-catalog.people.ts src/common/permissions/permission-catalog.spec.ts
cd .. && git add server/src/common/permissions client/src/lib/permission-keys.ts
git commit -m "feat(permissions): leads.claim and leads.assign (ADR-0093)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `LeadOwnershipService` — band qilish, berish, bo'shatish

**Files:**
- Modify: `server/src/leads/lead-events.ts`
- Create: `server/src/leads/ownership/ownership-history.ts` (+ `.spec.ts`)
- Create: `server/src/leads/ownership/lead-ownership.service.ts` (+ `.spec.ts`)
- Create: `server/src/notifications/lead-owner-notices.ts` (+ `.spec.ts`)
- Create: `server/src/notifications/lead-owner-notify.listener.ts`
- Modify: `server/src/leads/leads.module.ts`, `server/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `OwnershipRules` (Task 2), sozlama kalitlari (Task 3), `leads.claim` / `leads.assign` (Task 4).
- Produces:
  - `LEAD_OWNER_CHANGED = 'lead.owner.changed'`, `LeadOwnerChangedPayload { leadId; companyId; kind: LeadOwnershipKind; fromUserId: number | null; toUserId: number | null; actorId: number | null; leadName: string }`
  - `interface OwnershipChange { leadId; leadName; branchId: number | null; kind: LeadOwnershipKind; fromUserId; toUserId; actorId; reason: string | null; companyId }`
  - `untouchedWhere(userId, companyId): Prisma.LeadWhereInput`
  - `LeadOwnershipService.rules(companyId): Promise<OwnershipRules>`
  - `LeadOwnershipService.setRules(companyId, patch: Partial<OwnershipRules>, userId): Promise<OwnershipRules>`
  - `LeadOwnershipService.claim(leadId, userId, companyId, scope): Promise<void>`
  - `LeadOwnershipService.release(leadId, userId, companyId, scope): Promise<void>`
  - `LeadOwnershipService.assign(leadId, targetId: number | null, actorId, companyId, scope): Promise<void>`
  - `LeadOwnershipService.recordChange(tx: Prisma.TransactionClient, change: OwnershipChange): Promise<void>`
  - `LeadOwnershipService.emit(change: OwnershipChange): void`
  - `OWNER_HISTORY_ACTION`, `ownerHistoryValues(kind, fromName, toName, reason)`
  - `leadOwnerNotices(p: LeadOwnerChangedPayload): { userId: number; title: string; message: string }[]`

- [ ] **Step 1: Hodisa**

`server/src/leads/lead-events.ts` oxiriga:

```ts
/**
 * A lead's owner changed (ADR-0093): claimed, given, released or expired.
 * Emitted after the commit by `LeadOwnershipService.emit`.
 */
export const LEAD_OWNER_CHANGED = 'lead.owner.changed';

export interface LeadOwnerChangedPayload {
  leadId: string;
  companyId: number;
  kind: 'CLAIM' | 'ASSIGN' | 'RELEASE' | 'EXPIRE';
  fromUserId: number | null;
  toUserId: number | null;
  /** Null when the system took the lead back. */
  actorId: number | null;
  leadName: string;
}
```

- [ ] **Step 2: Tarix qiymatlari — test**

`server/src/leads/ownership/ownership-history.spec.ts`:

```ts
import { computeChangedFields } from '../../common/entity-history/diff.util';
import { ownerHistoryValues } from './ownership-history';

describe('ownerHistoryValues', () => {
  it('names the change and the new owner', () => {
    const v = ownerHistoryValues('CLAIM', null, 'Nodira R', null);
    expect(v.newValues).toEqual({
      action: 'LID_BAND_QILINDI',
      masul: 'Nodira R',
      sabab: null,
    });
  });

  it('keeps the action, the owner and the reason through the history diff', () => {
    const v = ownerHistoryValues(
      'EXPIRE',
      'Nodira R',
      null,
      "Muddatida harakat bo'lmadi",
    );
    expect(computeChangedFields(v.oldValues, v.newValues, 'Lead')).toEqual({
      oldValues: { action: null, masul: 'Nodira R', sabab: null },
      newValues: {
        action: 'LID_QAYTDI',
        masul: null,
        sabab: "Muddatida harakat bo'lmadi",
      },
    });
  });
});
```

Run: `npx jest src/leads/ownership/ownership-history.spec.ts` — FAIL.

- [ ] **Step 3: Tarix qiymatlari — kod**

`server/src/leads/ownership/ownership-history.ts`:

```ts
import type { LeadOwnershipKind } from '@prisma/client';

/** The `action` of the lead's history row per change (client: entity-history-utils.ts). */
export const OWNER_HISTORY_ACTION: Record<LeadOwnershipKind, string> = {
  CLAIM: 'LID_BAND_QILINDI',
  ASSIGN: 'LID_BERILDI',
  RELEASE: 'LID_BOSHATILDI',
  EXPIRE: 'LID_QAYTDI',
};

/**
 * Old and new values of the lead's «Tarix» row. `action` and `sabab` sit in
 * `oldValues` as null on purpose: the diff keeps only keys both sides carry
 * (server/CLAUDE.md, «A key missing from oldValues is dropped»).
 */
export function ownerHistoryValues(
  kind: LeadOwnershipKind,
  fromName: string | null,
  toName: string | null,
  reason: string | null,
): {
  oldValues: Record<string, string | null>;
  newValues: Record<string, string | null>;
} {
  return {
    oldValues: { action: null, masul: fromName, sabab: null },
    newValues: {
      action: OWNER_HISTORY_ACTION[kind],
      masul: toName,
      sabab: reason,
    },
  };
}
```

Run: `npx jest src/leads/ownership/ownership-history.spec.ts` — PASS.

- [ ] **Step 4: Xizmat testi (avval yiqiladi)**

`server/src/leads/ownership/lead-ownership.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { LEAD_OWNER_CHANGED } from '../lead-events';
import { LeadOwnershipService } from './lead-ownership.service';

const FREE_LEAD = {
  id: 'L1',
  firstName: 'Ali',
  lastName: 'Valiyev',
  statusEnum: LeadStatus.NEW,
  branchId: 1,
  ownerId: null as number | null,
  owner: null as { firstName: string; lastName: string } | null,
};

function setup(
  opts: {
    lead?: typeof FREE_LEAD | null;
    untouched?: number;
    callerMayAssign?: boolean;
    targetMayClaim?: boolean;
    target?: object | null;
  } = {},
) {
  const lead = opts.lead === undefined ? FREE_LEAD : opts.lead;
  const tx = {
    lead: {
      findFirst: jest.fn().mockResolvedValue(lead),
      count: jest.fn().mockResolvedValue(opts.untouched ?? 0),
      update: jest.fn().mockResolvedValue({}),
    },
    leadOwnershipLog: { create: jest.fn().mockResolvedValue({}) },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 11, firstName: 'Nodira', lastName: 'R' },
        { id: 12, firstName: 'Farangiz', lastName: 'N' },
      ]),
    },
  };
  // The target user: the active check and the branch scope read the same row.
  const target =
    opts.target === undefined
      ? {
          id: 12,
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          roles: [{ role: { name: 'Administrator' } }],
        }
      : opts.target;
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    user: { findFirst: jest.fn().mockResolvedValue(target) },
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    has: jest.fn(async (userId: number, key: string) =>
      key === 'leads.assign'
        ? Boolean(opts.callerMayAssign)
        : (opts.targetMayClaim ?? true),
    ),
  };
  const values: Record<string, number> = {
    'leads.maxUntouched': 10,
    'leads.firstActionHours': 2,
    'leads.followUpDays': 3,
  };
  const settings = {
    get: jest.fn(async (_c: number, key: string) => values[key]),
    set: jest.fn().mockResolvedValue(undefined),
  };
  const events = { emit: jest.fn() };
  const service = new LeadOwnershipService(
    prisma as never,
    history as never,
    permissions as never,
    settings as never,
    events as never,
  );
  return { service, tx, prisma, history, settings, events };
}

describe('LeadOwnershipService.claim', () => {
  it('gives a free lead to the caller, logs it and tells listeners', async () => {
    const s = setup();
    await s.service.claim('L1', 11, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: expect.objectContaining({ ownerId: 11, ownerActedAt: null }),
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'CLAIM',
        fromUserId: null,
        toUserId: 11,
        actorId: 11,
        branchId: 1,
      }),
    });
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Lead',
        entityId: 'L1',
        changedById: 11,
        newValues: expect.objectContaining({
          action: 'LID_BAND_QILINDI',
          masul: 'Nodira R',
        }),
      }),
    );
    expect(s.events.emit).toHaveBeenCalledWith(
      LEAD_OWNER_CHANGED,
      expect.objectContaining({
        kind: 'CLAIM',
        toUserId: 11,
        leadName: 'Ali Valiyev',
      }),
    );
  });

  it('refuses a lead someone else holds and names them', async () => {
    const s = setup({
      lead: {
        ...FREE_LEAD,
        ownerId: 12,
        owner: { firstName: 'Farangiz', lastName: 'N' },
      },
    });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      new ConflictException('Bu lidni Farangiz N band qilgan'),
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });

  it('refuses once the caller holds the limit of untouched leads', async () => {
    const s = setup({ untouched: 10 });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
  });

  it('refuses a converted lead', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, statusEnum: LeadStatus.CONVERTED },
    });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('answers 404 for a lead outside the caller scope', async () => {
    const s = setup({ lead: null });
    await expect(s.service.claim('L1', 11, 1, [1])).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('LeadOwnershipService.release', () => {
  const OWNED = { ...FREE_LEAD, ownerId: 11, owner: null };

  it('lets the owner release their lead', async () => {
    const s = setup({ lead: OWNED });
    await s.service.release('L1', 11, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: { ownerId: null, ownedAt: null, ownerActedAt: null },
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', fromUserId: 11 }),
    });
  });

  it("refuses someone else's lead to a caller without leads.assign", async () => {
    const s = setup({ lead: OWNED });
    await expect(s.service.release('L1', 99, 1, [1])).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("lets a manager release someone else's lead", async () => {
    const s = setup({ lead: OWNED, callerMayAssign: true });
    await s.service.release('L1', 99, 1, [1]);
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', actorId: 99 }),
    });
  });
});

describe('LeadOwnershipService.assign', () => {
  it('gives the lead to the target and restarts the clock', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, ownerId: 11, owner: null },
    });
    await s.service.assign('L1', 12, 2, 1, [1]);
    expect(s.tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'L1' },
      data: expect.objectContaining({ ownerId: 12, ownerActedAt: null }),
    });
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'ASSIGN',
        fromUserId: 11,
        toUserId: 12,
        actorId: 2,
      }),
    });
  });

  it('refuses a target who may not claim leads', async () => {
    const s = setup({ targetMayClaim: false });
    await expect(s.service.assign('L1', 12, 2, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
    expect(s.tx.lead.update).not.toHaveBeenCalled();
  });

  it("refuses a target who does not work in the lead's branch", async () => {
    const s = setup({
      target: {
        id: 12,
        mainBranch: 2,
        branches: [{ branchId: 2 }],
        roles: [{ role: { name: 'Administrator' } }],
      },
    });
    await expect(s.service.assign('L1', 12, 2, 1, [1])).rejects.toThrow(
      BadRequestException,
    );
  });

  it('releases the lead when no target is given', async () => {
    const s = setup({
      lead: { ...FREE_LEAD, ownerId: 11, owner: null },
      callerMayAssign: true,
    });
    await s.service.assign('L1', null, 2, 1, [1]);
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'RELEASE', actorId: 2 }),
    });
  });
});

describe('LeadOwnershipService.setRules', () => {
  it('writes only the fields it was given', async () => {
    const s = setup();
    await s.service.setRules(1, { followUpDays: 5 }, 7);
    expect(s.settings.set).toHaveBeenCalledTimes(1);
    expect(s.settings.set).toHaveBeenCalledWith(1, 'leads.followUpDays', 5, 7);
  });

  it('refuses an empty change', async () => {
    const s = setup();
    await expect(s.service.setRules(1, {}, 7)).rejects.toThrow(
      BadRequestException,
    );
  });
});
```

Run: `npx jest src/leads/ownership/lead-ownership.service.spec.ts` — FAIL (modul yo'q).

- [ ] **Step 5: Xizmatni yozish**

`server/src/leads/ownership/lead-ownership.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  LeadOwnershipKind,
  LeadStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../../common/entity-history';
import { PermissionsService } from '../../common/permissions/permissions.service';
import { SettingsService } from '../../settings/settings.service';
import { resolveCallerBranchScope } from '../../common/auth/branch-scope';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import {
  isTransactionConflict,
  rethrowAsConflict,
} from '../../common/transaction-conflict';
import { leadBranchWhere } from '../shared/lead-scope';
import { LEAD_OWNER_CHANGED, type LeadOwnerChangedPayload } from '../lead-events';
import type { OwnershipRules } from './ownership-deadline';
import { ownerHistoryValues } from './ownership-history';

const SERIALIZABLE = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

const RULE_KEYS = {
  maxUntouched: 'leads.maxUntouched',
  firstActionHours: 'leads.firstActionHours',
  followUpDays: 'leads.followUpDays',
} as const;

/** One change of a lead's owner, logged and put in the lead's history together. */
export interface OwnershipChange {
  leadId: string;
  leadName: string;
  branchId: number | null;
  kind: LeadOwnershipKind;
  fromUserId: number | null;
  toUserId: number | null;
  actorId: number | null;
  reason: string | null;
  companyId: number;
}

/** Claimed leads with no action yet: what the claim limit counts. */
export function untouchedWhere(
  userId: number,
  companyId: number,
): Prisma.LeadWhereInput {
  return {
    companyId,
    ownerId: userId,
    ownerActedAt: null,
    deletedAt: null,
    statusEnum: { not: LeadStatus.CONVERTED },
  };
}

const fullName = (u: { firstName: string; lastName: string }) =>
  `${u.firstName} ${u.lastName}`.trim();

const LEAD_FOR_OWNERSHIP = {
  id: true,
  firstName: true,
  lastName: true,
  statusEnum: true,
  branchId: true,
  ownerId: true,
  owner: { select: { firstName: true, lastName: true } },
} satisfies Prisma.LeadSelect;

type OwnershipLead = Prisma.LeadGetPayload<{ select: typeof LEAD_FOR_OWNERSHIP }>;

/**
 * The one door for a lead's owner (ADR-0093): claim, give, release, and the
 * log + history row every change writes. A converted lead's owner is frozen
 * (the KPI of stage 2 is credited to it), so none of these touch one.
 */
@Injectable()
export class LeadOwnershipService {
  constructor(
    private prisma: PrismaService,
    private history: EntityHistoryService,
    private permissions: PermissionsService,
    private settings: SettingsService,
    private events: EventEmitter2,
  ) {}

  async rules(companyId: number): Promise<OwnershipRules> {
    const [maxUntouched, firstActionHours, followUpDays] = await Promise.all([
      this.settings.get(companyId, RULE_KEYS.maxUntouched),
      this.settings.get(companyId, RULE_KEYS.firstActionHours),
      this.settings.get(companyId, RULE_KEYS.followUpDays),
    ]);
    return { maxUntouched, firstActionHours, followUpDays };
  }

  async setRules(
    companyId: number,
    patch: Partial<OwnershipRules>,
    userId: number,
  ): Promise<OwnershipRules> {
    let changed = false;
    for (const field of Object.keys(RULE_KEYS) as (keyof OwnershipRules)[]) {
      const value = patch[field];
      if (value === undefined) continue;
      await this.settings.set(companyId, RULE_KEYS[field], value, userId);
      changed = true;
    }
    if (!changed) {
      throw new BadRequestException('Kamida bitta sozlama yuborilishi kerak');
    }
    return this.rules(companyId);
  }

  async claim(
    leadId: string,
    userId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    const rules = await this.rules(companyId);
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === userId) {
        throw new BadRequestException('Bu lid allaqachon sizda');
      }
      if (lead.ownerId !== null) {
        const who = lead.owner ? fullName(lead.owner) : 'boshqa xodim';
        throw new ConflictException(`Bu lidni ${who} band qilgan`);
      }
      const untouched = await tx.lead.count({
        where: untouchedWhere(userId, companyId),
      });
      if (untouched >= rules.maxUntouched) {
        throw new BadRequestException(
          `Sizda ${untouched} ta hali bog'lanilmagan lid bor. Avval ular bilan bog'laning: bir vaqtda ${rules.maxUntouched} tadan ortiq bunday lid olib bo'lmaydi`,
        );
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: userId, ownedAt: new Date(), ownerActedAt: null },
      });
      const c = this.changeOf(lead, 'CLAIM', userId, userId, null, companyId);
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  async release(
    leadId: string,
    userId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    const mayAssign = await this.permissions.has(userId, 'leads.assign');
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === null) {
        throw new BadRequestException("Lidning egasi yo'q");
      }
      if (lead.ownerId !== userId && !mayAssign) {
        throw new ForbiddenException(
          "Lidni faqat uning egasi yoki rahbar bo'shatadi",
        );
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: null, ownedAt: null, ownerActedAt: null },
      });
      const c = this.changeOf(lead, 'RELEASE', null, userId, null, companyId);
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  async assign(
    leadId: string,
    targetId: number | null,
    actorId: number,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<void> {
    if (targetId === null) {
      return this.release(leadId, actorId, companyId, scope);
    }
    const target = await this.prisma.user.findFirst({
      where: {
        id: targetId,
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!target || !(await this.permissions.has(targetId, 'leads.claim'))) {
      throw new BadRequestException(
        "Bu xodimga lid berib bo'lmaydi: unda lid olish ruxsati yo'q",
      );
    }
    const targetScope = await resolveCallerBranchScope(this.prisma, targetId);
    const change = await this.inTx(async (tx) => {
      const lead = await this.findLead(tx, leadId, companyId, scope);
      if (lead.ownerId === targetId) {
        throw new BadRequestException('Lid allaqachon shu xodimda');
      }
      if (
        lead.branchId != null &&
        targetScope.kind === 'branches' &&
        !targetScope.branchIds.includes(lead.branchId)
      ) {
        throw new BadRequestException('Xodim bu lid filialida ishlamaydi');
      }
      await tx.lead.update({
        where: { id: leadId },
        data: { ownerId: targetId, ownedAt: new Date(), ownerActedAt: null },
      });
      const c = this.changeOf(lead, 'ASSIGN', targetId, actorId, null, companyId);
      await this.recordChange(tx, c);
      return c;
    });
    this.emit(change);
  }

  /** Writes the log row and the lead's «Tarix» row of one change. */
  async recordChange(
    tx: Prisma.TransactionClient,
    c: OwnershipChange,
  ): Promise<void> {
    await tx.leadOwnershipLog.create({
      data: {
        leadId: c.leadId,
        kind: c.kind,
        fromUserId: c.fromUserId,
        toUserId: c.toUserId,
        actorId: c.actorId,
        reason: c.reason,
        branchId: c.branchId,
        companyId: c.companyId,
      },
    });
    const ids = [c.fromUserId, c.toUserId].filter(
      (id): id is number => id != null,
    );
    const users = ids.length
      ? await tx.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameOf = (id: number | null) => {
      const user = users.find((u) => u.id === id);
      return user ? fullName(user) : null;
    };
    const { oldValues, newValues } = ownerHistoryValues(
      c.kind,
      nameOf(c.fromUserId),
      nameOf(c.toUserId),
      c.reason,
    );
    await this.history.recordUpdate({
      entityType: 'Lead',
      entityId: c.leadId,
      oldValues,
      newValues,
      changedById: c.actorId ?? undefined,
      companyId: c.companyId,
      tx,
    });
  }

  /** Tells listeners after the commit (notifications). */
  emit(c: OwnershipChange): void {
    this.events.emit(LEAD_OWNER_CHANGED, {
      leadId: c.leadId,
      companyId: c.companyId,
      kind: c.kind,
      fromUserId: c.fromUserId,
      toUserId: c.toUserId,
      actorId: c.actorId,
      leadName: c.leadName,
    } satisfies LeadOwnerChangedPayload);
  }

  private changeOf(
    lead: OwnershipLead,
    kind: LeadOwnershipKind,
    toUserId: number | null,
    actorId: number | null,
    reason: string | null,
    companyId: number,
  ): OwnershipChange {
    return {
      leadId: lead.id,
      leadName: `${lead.firstName} ${lead.lastName}`.trim(),
      branchId: lead.branchId,
      kind,
      fromUserId: lead.ownerId,
      toUserId,
      actorId,
      reason,
      companyId,
    };
  }

  private async findLead(
    tx: Prisma.TransactionClient,
    leadId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<OwnershipLead> {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, deletedAt: null, companyId, ...leadBranchWhere(scope) },
      select: LEAD_FOR_OWNERSHIP,
    });
    if (!lead) throw new NotFoundException('Lid topilmadi');
    if (lead.statusEnum === LeadStatus.CONVERTED) {
      throw new BadRequestException(
        "O'quvchiga aylangan lidning egasi o'zgarmaydi",
      );
    }
    return lead;
  }

  private async inTx<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, SERIALIZABLE);
    } catch (err) {
      if (isTransactionConflict(err)) rethrowAsConflict(err);
      throw err;
    }
  }
}
```

Run: `npx jest src/leads/ownership/lead-ownership.service.spec.ts` — PASS.

- [ ] **Step 6: Bildirishnoma matnlari — test**

`server/src/notifications/lead-owner-notices.spec.ts`:

```ts
import { leadOwnerNotices } from './lead-owner-notices';

const base = { leadId: 'L1', companyId: 1, leadName: 'Ali Valiyev' };

describe('leadOwnerNotices', () => {
  it('tells the former owner a lead went back to the pool', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'EXPIRE',
        fromUserId: 11,
        toUserId: null,
        actorId: null,
      }),
    ).toEqual([
      {
        userId: 11,
        title: "Lid umumiy ro'yxatga qaytdi",
        message: "Ali Valiyev — muddatida harakat bo'lmadi",
      },
    ]);
  });

  it('tells the new owner and the former owner when a manager moves a lead', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'ASSIGN',
        fromUserId: 11,
        toUserId: 12,
        actorId: 2,
      }),
    ).toEqual([
      {
        userId: 12,
        title: 'Sizga lid berildi',
        message: "Ali Valiyev — muddat lid kartochkasida ko'rsatilgan",
      },
      { userId: 11, title: 'Lid sizdan olindi', message: 'Ali Valiyev' },
    ]);
  });

  it('tells nobody about their own claim or release', () => {
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'CLAIM',
        fromUserId: null,
        toUserId: 11,
        actorId: 11,
      }),
    ).toEqual([]);
    expect(
      leadOwnerNotices({
        ...base,
        kind: 'RELEASE',
        fromUserId: 11,
        toUserId: null,
        actorId: 11,
      }),
    ).toEqual([]);
  });
});
```

Run: `npx jest src/notifications/lead-owner-notices.spec.ts` — FAIL.

- [ ] **Step 7: Bildirishnoma matnlari va tinglovchi**

`server/src/notifications/lead-owner-notices.ts`:

```ts
import type { LeadOwnerChangedPayload } from '../leads/lead-events';

export interface LeadOwnerNotice {
  userId: number;
  title: string;
  message: string;
}

/**
 * Who hears about a lead's owner change (ADR-0093). Nobody is told about
 * their own action; the system's take-back goes to the former owner.
 */
export function leadOwnerNotices(p: LeadOwnerChangedPayload): LeadOwnerNotice[] {
  const out: LeadOwnerNotice[] = [];
  if (p.kind === 'EXPIRE' && p.fromUserId != null) {
    out.push({
      userId: p.fromUserId,
      title: "Lid umumiy ro'yxatga qaytdi",
      message: `${p.leadName} — muddatida harakat bo'lmadi`,
    });
  }
  if (p.kind === 'ASSIGN' && p.toUserId != null && p.toUserId !== p.actorId) {
    out.push({
      userId: p.toUserId,
      title: 'Sizga lid berildi',
      message: `${p.leadName} — muddat lid kartochkasida ko'rsatilgan`,
    });
  }
  if (
    (p.kind === 'ASSIGN' || p.kind === 'RELEASE') &&
    p.fromUserId != null &&
    p.fromUserId !== p.actorId
  ) {
    out.push({
      userId: p.fromUserId,
      title: 'Lid sizdan olindi',
      message: p.leadName,
    });
  }
  return out;
}
```

`server/src/notifications/lead-owner-notify.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationType } from '@prisma/client';
import {
  LEAD_OWNER_CHANGED,
  type LeadOwnerChangedPayload,
} from '../leads/lead-events';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { leadOwnerNotices } from './lead-owner-notices';

/** The bell side of a lead's owner change (ADR-0093): information, no action. */
@Injectable()
export class LeadOwnerNotifyListener {
  private readonly logger = new Logger(LeadOwnerNotifyListener.name);

  constructor(
    private notifications: NotificationsService,
    private gateway: NotificationsGateway,
  ) {}

  @OnEvent(LEAD_OWNER_CHANGED)
  async onChanged(p: LeadOwnerChangedPayload): Promise<void> {
    for (const n of leadOwnerNotices(p)) {
      try {
        const notification = await this.notifications.create({
          userId: n.userId,
          type: NotificationType.SYSTEM,
          title: n.title,
          message: n.message,
          relatedEntityType: 'Lead',
          relatedEntityId: p.leadId,
          companyId: p.companyId,
        });
        this.gateway.sendToUser(n.userId, { type: 'notification', notification });
      } catch (err) {
        this.logger.warn(
          `lead ${p.leadId} owner notice to ${n.userId} failed: ${(err as Error).message}`,
        );
      }
    }
  }
}
```

`notifications.module.ts` providers ro'yxatiga `LeadOwnerNotifyListener` (import bilan).

- [ ] **Step 8: Modul**

`server/src/leads/leads.module.ts`:
- `import { SettingsModule } from '../settings/settings.module';` va `imports: [StudentsModule, SettingsModule]`.
- `import { LeadOwnershipService } from './ownership/lead-ownership.service';` — `providers` ga qo'shing, `exports: [LeadsService, LeadOwnershipService]`.

- [ ] **Step 9: Testlar**

```bash
npx jest src/leads src/notifications src/common/event-wiring.spec.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 10: Format, lint, commit**

```bash
npx prettier --write src/leads/lead-events.ts src/leads/leads.module.ts src/leads/ownership src/notifications/lead-owner-notices.ts src/notifications/lead-owner-notices.spec.ts src/notifications/lead-owner-notify.listener.ts src/notifications/notifications.module.ts
npx eslint src/leads/ownership src/notifications/lead-owner-notices.ts src/notifications/lead-owner-notify.listener.ts --quiet
cd .. && git add server/src && git commit -m "feat(leads): claim, give and release a lead (ADR-0093)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Egasining harakati, yaratuvchi egasi, arxivdan tiklash

**Files:**
- Create: `server/src/leads/ownership/owner-action.ts` (+ `.spec.ts`)
- Create: `server/src/leads/ownership/lead-owner-task.listener.ts` (+ `.spec.ts`)
- Modify: `server/src/leads/leads.service.ts` (`create`, `markCalled`, konstruktor) + `leads.service.spec.ts`
- Modify: `server/src/comments/comments.service.ts` (`create`) + `comments.service.spec.ts`
- Modify: `server/src/leads/leads-archive.service.ts` (`restoreLead`, konstruktor) + `leads-archive.service.spec.ts`
- Modify: `server/src/leads/leads.module.ts`

**Interfaces:**
- Consumes: `LeadOwnershipService.recordChange/emit`, `OwnershipChange` (Task 5).
- Produces: `touchLeadOwnerAction(db, leadId: string, userId: number, at?: Date): Promise<boolean>`.

- [ ] **Step 1: Testlar (avval yiqiladi)**

`server/src/leads/ownership/owner-action.spec.ts`:

```ts
import { touchLeadOwnerAction } from './owner-action';

describe('touchLeadOwnerAction', () => {
  it("stamps the action only on the owner's live, unconverted lead", async () => {
    const db = { lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const at = new Date('2026-10-19T05:00:00Z');
    await expect(touchLeadOwnerAction(db as never, 'L1', 11, at)).resolves.toBe(true);
    expect(db.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'L1',
        ownerId: 11,
        deletedAt: null,
        statusEnum: { not: 'CONVERTED' },
      },
      data: { ownerActedAt: at },
    });
  });

  it('reports false when the writer is not the owner', async () => {
    const db = { lead: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    await expect(touchLeadOwnerAction(db as never, 'L1', 99)).resolves.toBe(false);
  });
});
```

`server/src/leads/ownership/lead-owner-task.listener.spec.ts`:

```ts
import { LeadOwnerTaskListener } from './lead-owner-task.listener';

const TASK = {
  id: 'T1',
  companyId: 1,
  title: "Qo'ng'iroq qilish",
  kind: 'MANUAL',
  authorId: 11,
  dueAt: null,
  status: 'NEW' as const,
  participants: [],
};

function setup(entity: { entityType: string | null; entityId: string | null } | null) {
  const prisma = {
    task: { findUnique: jest.fn().mockResolvedValue(entity) },
    lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return { prisma, listener: new LeadOwnerTaskListener(prisma as never) };
}

describe('LeadOwnerTaskListener', () => {
  it("counts a new task on the owner's lead as an action", async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onAssigned({ task: TASK, actorId: 11, userIds: [11], created: true });
    expect(s.prisma.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'L1', ownerId: 11 }),
      }),
    );
  });

  it('ignores an assignee added to an existing task', async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onAssigned({ task: TASK, actorId: 11, userIds: [12] });
    expect(s.prisma.task.findUnique).not.toHaveBeenCalled();
  });

  it('counts a status change and a comment on the task', async () => {
    const s = setup({ entityType: 'Lead', entityId: 'L1' });
    await s.listener.onStatus({ task: TASK, actorId: 11, from: 'NEW', to: 'IN_PROGRESS' });
    await s.listener.onCommented({ task: TASK, actorId: 11, text: 'gaplashdim' });
    expect(s.prisma.lead.updateMany).toHaveBeenCalledTimes(2);
  });

  it("ignores a task on a student or with no record", async () => {
    const s = setup({ entityType: 'Student', entityId: '10500' });
    await s.listener.onStatus({ task: TASK, actorId: 11, from: 'NEW', to: 'IN_PROGRESS' });
    expect(s.prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});
```

Run: `npx jest src/leads/ownership/owner-action.spec.ts src/leads/ownership/lead-owner-task.listener.spec.ts` — FAIL.

- [ ] **Step 2: `touchLeadOwnerAction`**

`server/src/leads/ownership/owner-action.ts`:

```ts
import { LeadStatus, Prisma, PrismaClient } from '@prisma/client';

type LeadDb = Pick<PrismaClient, 'lead'> | Prisma.TransactionClient;

/**
 * Stamps the owner's action on a lead (ADR-0093): a call mark, a comment, a
 * task on the lead. Only the OWNER's write counts, so the where-clause carries
 * `ownerId` and anyone else's changes nothing. A converted or archived lead's
 * clock is stopped, so it is not touched either.
 */
export async function touchLeadOwnerAction(
  db: LeadDb,
  leadId: string,
  userId: number,
  at: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.lead.updateMany({
    where: {
      id: leadId,
      ownerId: userId,
      deletedAt: null,
      statusEnum: { not: LeadStatus.CONVERTED },
    },
    data: { ownerActedAt: at },
  });
  return count > 0;
}
```

- [ ] **Step 3: Topshiriq tinglovchisi**

`server/src/leads/ownership/lead-owner-task.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TASK_EVENTS,
  type TaskAssignedPayload,
  type TaskCommentedPayload,
  type TaskStatusChangedPayload,
} from '../../tasks/task-events';
import { touchLeadOwnerAction } from './owner-action';

/**
 * A task on a lead is the owner's action too (ADR-0093): creating one (the
 * next call date), moving it, or writing in it. The task events carry no
 * entity, so the task is read once.
 */
@Injectable()
export class LeadOwnerTaskListener {
  private readonly logger = new Logger(LeadOwnerTaskListener.name);

  constructor(private prisma: PrismaService) {}

  @OnEvent(TASK_EVENTS.ASSIGNED)
  async onAssigned(p: TaskAssignedPayload): Promise<void> {
    if (p.created && p.actorId != null) await this.touch(p.task.id, p.actorId);
  }

  @OnEvent(TASK_EVENTS.STATUS_CHANGED)
  async onStatus(p: TaskStatusChangedPayload): Promise<void> {
    await this.touch(p.task.id, p.actorId);
  }

  @OnEvent(TASK_EVENTS.COMMENTED)
  async onCommented(p: TaskCommentedPayload): Promise<void> {
    await this.touch(p.task.id, p.actorId);
  }

  private async touch(taskId: string, actorId: number): Promise<void> {
    try {
      const task = await this.prisma.task.findUnique({
        where: { id: taskId },
        select: { entityType: true, entityId: true },
      });
      if (task?.entityType !== 'Lead' || !task.entityId) return;
      await touchLeadOwnerAction(this.prisma, task.entityId, actorId);
    } catch (err) {
      this.logger.warn(
        `lead owner action from task ${taskId} failed: ${(err as Error).message}`,
      );
    }
  }
}
```

`leads.module.ts` providers ga `LeadOwnerTaskListener`.

Run: `npx jest src/leads/ownership` — PASS.

- [ ] **Step 4: Qo'ng'iroq belgisi va izoh**

`leads.service.ts` `markCalled` da, `const data` dan oldin:

```ts
    // ADR-0093: the owner's call mark keeps the lead with them.
    if (dto.called) {
      await touchLeadOwnerAction(this.prisma, id, userId);
    }
```

`comments.service.ts` `create` da, `recordCreate` dan keyin:

```ts
    // ADR-0093: the lead owner's comment is an action that keeps the lead.
    if (dto.entityType === 'Lead') {
      await touchLeadOwnerAction(this.prisma, String(dto.entityId), userId);
    }
```

(Ikkalasiga `import { touchLeadOwnerAction } from '…/leads/ownership/owner-action';`.)

`comments.service.spec.ts` prisma mock'iga `lead: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) }` qo'shing (mavjud `lead` mock bo'lsa, unga `updateMany`). Lead izohi testiga:

```ts
    expect(prisma.lead.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: <o'sha testdagi lead id>, ownerId: <userId> }),
      }),
    );
```

- [ ] **Step 5: Yaratuvchi egasi**

`leads.service.ts`:
- konstruktorga `private permissions: PermissionsService` va `private ownership: LeadOwnershipService` (importlar: `../common/permissions/permissions.service`, `./ownership/lead-ownership.service`).
- `create` da `const maxOrder = ...` dan oldin:

```ts
    // ADR-0093: whoever adds a lead by hand has already spoken to the person,
    // so a staff member who may claim leads owns it, the creation being the
    // first action. Public-form leads arrive with no owner.
    const ownerId =
      actor.kind === 'user' &&
      (await this.permissions.has(actor.id, 'leads.claim'))
        ? actor.id
        : null;
    const now = new Date();
```

- `prisma.lead.create` `data` ga:

```ts
        ownerId,
        ownedAt: ownerId ? now : null,
        ownerActedAt: ownerId ? now : null,
```

- `recordCreate` dan keyin, `return` dan oldin:

```ts
    if (ownerId !== null) {
      const change = {
        leadId: created.id,
        leadName: `${firstName} ${lastName}`,
        branchId,
        kind: 'CLAIM' as const,
        fromUserId: null,
        toUserId: ownerId,
        actorId: ownerId,
        reason: "Lidni o'zi qo'shdi",
        companyId,
      };
      await this.ownership.recordChange(this.prisma, change);
      this.ownership.emit(change);
    }
```

`leads.service.spec.ts` `providers` ga:

```ts
        { provide: PermissionsService, useValue: fakePermissions([ROLE_ID.ADMINISTRATOR]) },
        { provide: LeadOwnershipService, useValue: ownership },
```

`beforeEach` da `ownership = { dueResolver: jest.fn().mockResolvedValue(() => null), recordChange: jest.fn(), emit: jest.fn() };` va `prisma.lead.updateMany = jest.fn().mockResolvedValue({ count: 0 })`. `create` bo'limiga test:

```ts
    it("makes the staff member who adds a lead its owner, the creation counting as the first action", async () => {
      // the section/create mocks of the neighbouring create test
      await service.create(dto, 1001, CALLER);
      const data = prisma.lead.create.mock.calls[0][0].data;
      expect(data.ownerId).toBe(1);
      expect(data.ownerActedAt).toBeInstanceOf(Date);
      expect(ownership.recordChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ kind: 'CLAIM', toUserId: 1, reason: "Lidni o'zi qo'shdi" }),
      );
    });

    it('leaves a public-form lead without an owner', async () => {
      await service.create(dto, 1001, { kind: 'public-form' });
      expect(prisma.lead.create.mock.calls[0][0].data.ownerId).toBeNull();
      expect(ownership.recordChange).not.toHaveBeenCalled();
    });
```

(`dto` va bo'lim mock'larini yonidagi mavjud `create` testidan oling.) `markCalled` bo'limiga:

```ts
    it("stamps the owner's action when marking called", async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', calledAt: null });
      prisma.lead.update.mockResolvedValue({ id: 'lead-1', calledAt: new Date() });
      await service.markCalled('lead-1', { called: true }, 1001, 7, null);
      expect(prisma.lead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ id: 'lead-1', ownerId: 7 }) }),
      );
    });
```

Mavjud `create` testlari `data` ni aniq (`toEqual`) tekshirsa, ularga `ownerId: 1, ownedAt: expect.any(Date), ownerActedAt: expect.any(Date)` qo'shing.

- [ ] **Step 6: Arxivdan tiklash egasini olib tashlaydi**

`leads-archive.service.ts`:
- konstruktorga `private ownership: LeadOwnershipService`.
- `restoreLead` dagi `prisma.lead.findFirst` `select` ga `firstName: true, lastName: true, ownerId: true`.
- `const status = ...` dan keyin:

```ts
    // ADR-0093: a lead back from the archive returns to the common pool. A
    // converted lead keeps its owner — the KPI is credited to it.
    const released: OwnershipChange | null =
      status !== LeadStatus.CONVERTED && lead.ownerId !== null
        ? {
            leadId: id,
            leadName: `${lead.firstName} ${lead.lastName}`.trim(),
            branchId,
            kind: 'RELEASE',
            fromUserId: lead.ownerId,
            toUserId: null,
            actorId: userId,
            reason: 'Arxivdan tiklandi',
            companyId,
          }
        : null;
```

- tranzaksiyadagi `tx.lead.update` `data` ga `...(released ? { ownerId: null, ownedAt: null, ownerActedAt: null } : {})`.
- `recordRestore` dan keyin (o'sha tranzaksiyada): `if (released) await this.ownership.recordChange(tx, released);`
- tranzaksiyadan keyin: `if (released) this.ownership.emit(released);`

`leads-archive.service.spec.ts` providers ga `{ provide: LeadOwnershipService, useValue: ownership }` (`ownership = { recordChange: jest.fn(), emit: jest.fn() }`). `restoreLead` testlariga:

```ts
    it("returns an owned lead to the common pool", async () => {
      // the mocks of the neighbouring restore test, with the lead owned by 11
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1', statusEnum: 'LOST', convertedStudentId: null,
        firstName: 'Ali', lastName: 'Valiyev', ownerId: 11,
      });
      await service.restoreLead('lead-1', dto, 1001, 7, null);
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownerId: null }) }),
      );
      expect(ownership.recordChange).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ kind: 'RELEASE', fromUserId: 11, reason: 'Arxivdan tiklandi' }),
      );
    });
```

- [ ] **Step 7: Testlar, format, commit**

```bash
npx jest src/leads src/comments src/common/event-wiring.spec.ts
npm run typecheck
npx prettier --write src/leads src/comments/comments.service.ts src/comments/comments.service.spec.ts
npx eslint src/leads src/comments --quiet
cd .. && git add server/src && git commit -m "feat(leads): owner actions keep the lead; creator owns a hand-made lead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Kartochkadagi egasi, muddat va «Mas'ul» filtri (server)

**Files:**
- Modify: `server/src/leads/ownership/lead-ownership.service.ts` (+ spec) — `dueResolver`
- Modify: `server/src/leads/leads.service.ts` (+ spec), `leads.controller.ts`, `dto/lead-query.dto.ts`

**Interfaces:**
- Produces:
  - `type OwnedLeadFields = { ownerId: number | null; ownedAt: Date | null; ownerActedAt: Date | null; branchId: number | null; statusEnum: LeadStatus }`
  - `LeadOwnershipService.dueResolver(companyId, now?: Date): Promise<(lead: OwnedLeadFields) => Date | null>`
  - `LeadsService.card(id: string, companyId: number)` — bitta kartochka (`ownerDueAt` bilan).
  - Kartochka va lid oynasi javobida yangi maydonlar: `owner: { id, firstName, lastName } | null`, `ownerDueAt: string | null` (JSON).
  - `GET /leads?owner=me,none,<userId>` filtri.

- [ ] **Step 1: `dueResolver` testi**

`lead-ownership.service.spec.ts` oxiriga:

```ts
describe('LeadOwnershipService.dueResolver', () => {
  const at = (day: string, hhmm: string) =>
    new Date(`${day}T${hhmm}:00+05:00`);
  const s = () => {
    const x = setup();
    (x.prisma as Record<string, unknown>).holiday = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    return x;
  };

  it('gives an owned lead its deadline', async () => {
    const due = await s().service.dueResolver(1, at('2026-10-19', '10:30'));
    expect(
      due({
        ownerId: 11,
        ownedAt: at('2026-10-19', '10:00'),
        ownerActedAt: null,
        branchId: 1,
        statusEnum: LeadStatus.NEW,
      }),
    ).toEqual(at('2026-10-19', '12:00'));
  });

  it('gives no deadline to a free or a converted lead', async () => {
    const due = await s().service.dueResolver(1, at('2026-10-19', '10:30'));
    const owned = {
      ownerId: 11,
      ownedAt: at('2026-10-19', '10:00'),
      ownerActedAt: null,
      branchId: 1,
      statusEnum: LeadStatus.NEW,
    };
    expect(due({ ...owned, ownerId: null, ownedAt: null })).toBeNull();
    expect(due({ ...owned, statusEnum: LeadStatus.CONVERTED })).toBeNull();
  });
});
```

Run — FAIL.

- [ ] **Step 2: `dueResolver`**

`lead-ownership.service.ts` ga importlar (`buildHolidayDateSetsByBranch` — `../../holidays/holiday-date-set`; `ownershipDueAt` — `./ownership-deadline`) va:

```ts
const DAY_MS = 86_400_000;
// No branch has id 0, so a lead with no branch reads the company-wide holidays alone.
const NO_BRANCH = 0;

export type OwnedLeadFields = {
  ownerId: number | null;
  ownedAt: Date | null;
  ownerActedAt: Date | null;
  branchId: number | null;
  statusEnum: LeadStatus;
};
```

Klass ichida:

```ts
  /**
   * The deadline of each owned lead, for the board and the expiry run: one
   * settings read and one holiday read per call. Holidays are read for 30
   * days back and 70 ahead: an older deadline has passed anyway, and the
   * longest wait (3 working days over a 60-day holiday) fits ahead.
   */
  async dueResolver(
    companyId: number,
    now: Date = new Date(),
  ): Promise<(lead: OwnedLeadFields) => Date | null> {
    const rules = await this.rules(companyId);
    const holidays = await buildHolidayDateSetsByBranch(
      this.prisma,
      new Date(now.getTime() - 30 * DAY_MS),
      new Date(now.getTime() + 70 * DAY_MS),
    );
    return (lead) => {
      if (
        lead.ownerId == null ||
        lead.ownedAt == null ||
        lead.statusEnum === LeadStatus.CONVERTED
      ) {
        return null;
      }
      const days = holidays(lead.branchId ?? NO_BRANCH);
      return ownershipDueAt(
        { ownedAt: lead.ownedAt, ownerActedAt: lead.ownerActedAt },
        rules,
        (day) => days.has(day),
      );
    };
  }
```

Run — PASS.

- [ ] **Step 3: Kartochka shakli**

`leads.service.ts`:

1. `LEAD_CARD_SELECT` ga:

```ts
  branchId: true,
  ownerId: true,
  ownedAt: true,
  ownerActedAt: true,
  owner: { select: { id: true, firstName: true, lastName: true } },
```

Importlar: `touchLeadOwnerAction` (`./ownership/owner-action`), `type OwnedLeadFields` (`./ownership/lead-ownership.service`).

2. `withCommentCount` dan keyin:

```ts
  /** Adds `ownerDueAt` (ADR-0093): one settings read and one holiday read. */
  private async withOwnerDue<T extends OwnedLeadFields>(
    leads: T[],
    companyId: number,
  ): Promise<(T & { ownerDueAt: Date | null })[]> {
    if (leads.length === 0) return [];
    const due = await this.ownership.dueResolver(companyId);
    return leads.map((lead) => ({ ...lead, ownerDueAt: due(lead) }));
  }

  /** A board card after a write: comment count and owner deadline. */
  private async asCard<T extends OwnedLeadFields & { id: string }>(
    lead: T,
    companyId: number,
  ) {
    const [withDue] = await this.withOwnerDue([lead], companyId);
    return this.withCommentCount(withDue);
  }

  /** One card by id: the ownership routes answer with it. */
  async card(id: string, companyId: number) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, companyId },
      select: LEAD_CARD_SELECT,
    });
    if (!lead) throw new NotFoundException('Lid topilmadi');
    return this.asCard(lead, companyId);
  }
```

3. `update`, `move`, `markCalled` dagi `return this.withCommentCount(updated);` → `return this.asCard(updated, companyId);`; `convert` dagi `lead: await this.withCommentCount(updated)` → `lead: await this.asCard(updated, companyId)`; `create` dagi `return { ...created, commentCount: 0 };` →

```ts
    const [card] = await this.withOwnerDue([created], companyId);
    // A brand-new lead has no comments and has not been called yet.
    return { ...card, commentCount: 0 };
```

4. `getSectionLeads` oxiri:

```ts
    const [counts, withDue] = await Promise.all([
      this.commentCountsFor(leads.map((l) => l.id)),
      this.withOwnerDue(leads, companyId),
    ]);
    return withDue.map((l) => ({ ...l, commentCount: counts.get(l.id) ?? 0 }));
```

5. `findOne` `select` ga `branchId: true, ownerId: true, ownedAt: true, ownerActedAt: true, owner: { select: { id: true, firstName: true, lastName: true } },`; `return` dan oldin `const [withDue] = await this.withOwnerDue([lead], companyId);` va `return { ...withDue, mockParticipations, matchedStudent };`.

- [ ] **Step 4: «Mas'ul» filtri — test**

`leads.service.spec.ts` `findAll` bo'limiga:

```ts
    it("«Mas'ul» filtri: meniki, egasiz va tanlangan xodimlar YOKI bilan", async () => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);

      await service.findAll({ owner: ['me', 'none', '10500'] }, 1001, null, 7);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual({
        OR: [{ ownerId: { in: [10500, 7] } }, { ownerId: null }],
      });
    });
```

Run — FAIL.

- [ ] **Step 5: Filtr kodi**

`dto/lead-query.dto.ts` (importga `Matches`):

```ts
  /**
   * «Mas'ul» (ADR-0093): `me`, `none` and user ids, comma-separated; the
   * values are ORed.
   */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @Matches(/^(me|none|\d+)$/, { each: true })
  owner?: string[];
```

`leads.service.ts`:
- fayl boshida (klassdan oldin):

```ts
const andList = (a: Prisma.LeadWhereInput['AND']): Prisma.LeadWhereInput[] =>
  a == null ? [] : Array.isArray(a) ? a : [a];
```

- `findAll(query, companyId, scope, userId?: number)` — to'rtinchi parametr.
- `if (query.status?.length) ...` qatoridan keyin:

```ts
    if (query.owner?.length) {
      const ids = query.owner.filter((v) => /^\d+$/.test(v)).map(Number);
      if (query.owner.includes('me') && userId != null) ids.push(userId);
      const or: Prisma.LeadWhereInput[] = [];
      if (ids.length) or.push({ ownerId: { in: [...new Set(ids)] } });
      if (query.owner.includes('none')) or.push({ ownerId: null });
      if (or.length) where.AND = [...andList(where.AND), { OR: or }];
    }
```

- `findAll` `select` ga `owner: { select: { id: true, firstName: true, lastName: true } },`.

`leads.controller.ts` `findAll` ga `@CurrentUser('id') userId: number` va `this.leadsService.findAll(query, companyId, scope, userId)`.

- [ ] **Step 6: Testlar**

```bash
npx jest src/leads
npm run typecheck
```

Expected: PASS. `findOne` yoki kartochkani aniq (`toEqual`) tekshiradigan eski testlarga `ownerDueAt: null` qo'shing (mock `dueResolver` hamma lidga `null` beradi).

- [ ] **Step 7: Format, lint, commit**

```bash
npx prettier --write src/leads
npx eslint src/leads --quiet
cd .. && git add server/src/leads && git commit -m "feat(leads): owner and deadline on lead cards, owner filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Muddati o'tgan lidni qaytarish

**Files:**
- Modify: `server/src/leads/ownership/lead-ownership.service.ts` (+ spec) — `expireOverdue`
- Create: `server/src/leads/ownership/lead-ownership.cron.ts`
- Modify: `server/src/leads/leads.module.ts`

**Interfaces:**
- Produces: `LeadOwnershipService.expireOverdue(now: Date): Promise<number>`; `LeadOwnershipCron.tick()`.

- [ ] **Step 1: Test**

`lead-ownership.service.spec.ts` oxiriga:

```ts
describe('LeadOwnershipService.expireOverdue', () => {
  const at = (day: string, hhmm: string) =>
    new Date(`${day}T${hhmm}:00+05:00`);
  const OWNED = {
    ...FREE_LEAD,
    ownerId: 11,
    owner: { firstName: 'Nodira', lastName: 'R' },
    ownedAt: at('2026-10-19', '10:00'),
    ownerActedAt: null,
  };

  function expirySetup(updated = 1) {
    const s = setup();
    Object.assign(s.prisma, {
      company: { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      lead: { findMany: jest.fn().mockResolvedValue([OWNED]) },
    });
    Object.assign(s.tx.lead, {
      updateMany: jest.fn().mockResolvedValue({ count: updated }),
    });
    return s;
  }

  it('takes back a lead whose first action is late, as the system', async () => {
    const s = expirySetup();
    await expect(s.service.expireOverdue(at('2026-10-19', '12:15'))).resolves.toBe(1);
    expect(s.tx.leadOwnershipLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: 'EXPIRE',
        fromUserId: 11,
        actorId: null,
        reason: "Muddatida harakat bo'lmadi",
      }),
    });
    expect(s.events.emit).toHaveBeenCalledWith(
      LEAD_OWNER_CHANGED,
      expect.objectContaining({ kind: 'EXPIRE', fromUserId: 11 }),
    );
  });

  it('leaves a lead that is still in time', async () => {
    const s = expirySetup();
    await expect(s.service.expireOverdue(at('2026-10-19', '11:59'))).resolves.toBe(0);
    expect(s.tx.lead.updateMany).not.toHaveBeenCalled();
  });

  it('skips a lead whose owner acted or changed since the read', async () => {
    const s = expirySetup(0);
    await expect(s.service.expireOverdue(at('2026-10-19', '12:15'))).resolves.toBe(0);
    expect(s.tx.leadOwnershipLog.create).not.toHaveBeenCalled();
    expect(s.events.emit).not.toHaveBeenCalled();
  });
});
```

Run — FAIL.

- [ ] **Step 2: `expireOverdue`**

`lead-ownership.service.ts` — `Logger` importi, klass maydoni `private readonly logger = new Logger(LeadOwnershipService.name);` va:

```ts
  /** Takes back every owned lead whose deadline has passed (the 15-minute run). */
  async expireOverdue(now: Date): Promise<number> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    let expired = 0;
    for (const { id } of companies) {
      try {
        expired += await this.expireCompany(id, now);
      } catch (err) {
        this.logger.error(
          `lead ownership expiry of company ${id} failed: ${(err as Error).message}`,
        );
      }
    }
    return expired;
  }

  private async expireCompany(companyId: number, now: Date): Promise<number> {
    const due = await this.dueResolver(companyId, now);
    const owned = await this.prisma.lead.findMany({
      where: {
        companyId,
        ownerId: { not: null },
        deletedAt: null,
        statusEnum: { not: LeadStatus.CONVERTED },
      },
      select: { ...LEAD_FOR_OWNERSHIP, ownedAt: true, ownerActedAt: true },
    });
    let expired = 0;
    for (const lead of owned) {
      const dueAt = due(lead);
      if (!dueAt || dueAt > now) continue;
      const change = this.changeOf(
        lead,
        'EXPIRE',
        null,
        null,
        "Muddatida harakat bo'lmadi",
        companyId,
      );
      const done = await this.prisma.$transaction(async (tx) => {
        // Only if nothing moved since the read: an action or a new owner wins.
        const { count } = await tx.lead.updateMany({
          where: {
            id: lead.id,
            ownerId: lead.ownerId,
            ownedAt: lead.ownedAt,
            ownerActedAt: lead.ownerActedAt,
          },
          data: { ownerId: null, ownedAt: null, ownerActedAt: null },
        });
        if (count === 0) return false;
        await this.recordChange(tx, change);
        return true;
      });
      if (done) {
        expired++;
        this.emit(change);
      }
    }
    return expired;
  }
```

- [ ] **Step 3: Cron**

`server/src/leads/ownership/lead-ownership.cron.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadOwnershipService } from './lead-ownership.service';

/**
 * Every 15 minutes in working time (08:00–18:45, Monday–Saturday, Tashkent).
 * A deadline always falls inside working time, so nothing expires at night.
 */
@Injectable()
export class LeadOwnershipCron {
  /** A slow run must not be started again by the next tick. */
  private running = false;

  constructor(private ownership: LeadOwnershipService) {}

  @Cron('0 */15 8-18 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ownership.expireOverdue(new Date());
    } finally {
      this.running = false;
    }
  }
}
```

`leads.module.ts` providers ga `LeadOwnershipCron`.

- [ ] **Step 4: Testlar, format, commit**

```bash
npx jest src/leads/ownership
npm run typecheck
npx prettier --write src/leads/ownership src/leads/leads.module.ts
npx eslint src/leads/ownership --quiet
cd .. && git add server/src/leads && git commit -m "feat(leads): return a lead to the pool when its deadline passes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: API — band qilish, berish, xulosa, sozlamalar

**Files:**
- Create: `server/src/leads/ownership/lead-ownership.controller.ts` (+ `.spec.ts`)
- Create: `server/src/leads/ownership/dto/assign-lead-owner.dto.ts`, `dto/lead-ownership-settings.dto.ts`, `dto/lead-ownership-query.dto.ts`
- Modify: `server/src/leads/ownership/lead-ownership.service.ts` (+ spec) — `summary`, `assignable`
- Modify: `server/src/leads/leads.module.ts`, `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Produces (HTTP, hammasi `/api` ostida):
  - `POST /leads/:id/claim` → kartochka (`leads.claim`)
  - `POST /leads/:id/release` → kartochka (`leads.claim` yoki `leads.assign`)
  - `PATCH /leads/:id/owner` `{ userId: number | null }` → kartochka (`leads.assign`)
  - `GET /leads/ownership/summary?period=week|month|last-month` → `{ period, rows: { userId, name, held, untouched, taken, expired }[] }` (`leads.view`)
  - `GET /leads/ownership/assignable?leadId=<uuid>` → `{ id, firstName, lastName, photo }[]` (`leads.assign`)
  - `GET /leads/ownership/settings` → `OwnershipRules` (`leads.view`)
  - `PATCH /leads/ownership/settings` `Partial<OwnershipRules>` → `OwnershipRules` (`@CeoOnly()`)

- [ ] **Step 1: Xulosa va xodimlar ro'yxati — test**

`lead-ownership.service.spec.ts` oxiriga:

```ts
describe('LeadOwnershipService.summary', () => {
  it('joins held, untouched, taken and expired per person', async () => {
    const s = setup();
    Object.assign(s.prisma, {
      lead: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ ownerId: 11, _count: { _all: 4 } }])
          .mockResolvedValueOnce([{ ownerId: 11, _count: { _all: 1 } }]),
      },
      leadOwnershipLog: {
        groupBy: jest
          .fn()
          .mockResolvedValueOnce([{ toUserId: 11, _count: { _all: 6 } }])
          .mockResolvedValueOnce([{ fromUserId: 12, _count: { _all: 2 } }]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 11, firstName: 'Nodira', lastName: 'R' },
          { id: 12, firstName: 'Farangiz', lastName: 'N' },
        ]),
      },
    });
    const out = await s.service.summary(1, [1], 'month');
    expect(out.rows).toEqual([
      { userId: 11, name: 'Nodira R', held: 4, untouched: 1, taken: 6, expired: 0 },
      { userId: 12, name: 'Farangiz N', held: 0, untouched: 0, taken: 0, expired: 2 },
    ]);
  });
});

describe('LeadOwnershipService.assignable', () => {
  it("lists the lead branch's staff who may claim leads", async () => {
    const s = setup();
    Object.assign(s.prisma, {
      lead: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 11, firstName: 'Nodira', lastName: 'R', photo: null },
          { id: 13, firstName: 'Bobur', lastName: 'K', photo: null },
        ]),
      },
    });
    const permissions = (s.service as unknown as { permissions: { has: jest.Mock } })
      .permissions;
    permissions.has.mockImplementation(async (id: number) => id === 11);
    await expect(s.service.assignable('L1', 1, [1])).resolves.toEqual([
      { id: 11, firstName: 'Nodira', lastName: 'R', photo: null },
    ]);
  });
});
```

Run — FAIL.

- [ ] **Step 2: `summary` va `assignable`**

`lead-ownership.service.ts` ga importlar: `leadStatsRange` (`../leads-stats.service`), `LeadStatsPeriod` (`../dto/lead-stats-query.dto`). Fayl darajasida:

```ts
export interface OwnerSummaryRow {
  userId: number;
  name: string;
  /** Leads held now (not converted, not archived). */
  held: number;
  /** Of them, with no action yet. */
  untouched: number;
  /** Claimed or given in the period. */
  taken: number;
  /** Taken back by the system in the period. */
  expired: number;
}

const STAFF_ROLE_NAMES = ['CEO', 'Branch Director', 'Administrator', 'Cashier'];
```

Klass ichida:

```ts
  /** «Kimda nechta lid» (ADR-0093): live holdings plus the period's log. */
  async summary(
    companyId: number,
    scope: ReportBranchIds,
    period: LeadStatsPeriod,
  ): Promise<{ period: LeadStatsPeriod; rows: OwnerSummaryRow[] }> {
    const range = leadStatsRange(period, new Date());
    const live: Prisma.LeadWhereInput = {
      companyId,
      deletedAt: null,
      ownerId: { not: null },
      statusEnum: { not: LeadStatus.CONVERTED },
      AND: [leadBranchWhere(scope)],
    };
    const logBranch: Prisma.LeadOwnershipLogWhereInput =
      scope == null
        ? {}
        : { OR: [{ branchId: { in: scope } }, { branchId: null }] };
    const [held, untouched, taken, expired] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: live,
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['ownerId'],
        where: { ...live, ownerActedAt: null },
        _count: { _all: true },
      }),
      this.prisma.leadOwnershipLog.groupBy({
        by: ['toUserId'],
        where: {
          companyId,
          kind: { in: ['CLAIM', 'ASSIGN'] },
          createdAt: range,
          ...logBranch,
        },
        _count: { _all: true },
      }),
      this.prisma.leadOwnershipLog.groupBy({
        by: ['fromUserId'],
        where: { companyId, kind: 'EXPIRE', createdAt: range, ...logBranch },
        _count: { _all: true },
      }),
    ]);

    const rows = new Map<number, OwnerSummaryRow>();
    const row = (userId: number) => {
      let r = rows.get(userId);
      if (!r) {
        r = { userId, name: '', held: 0, untouched: 0, taken: 0, expired: 0 };
        rows.set(userId, r);
      }
      return r;
    };
    for (const g of held) if (g.ownerId != null) row(g.ownerId).held = g._count._all;
    for (const g of untouched) {
      if (g.ownerId != null) row(g.ownerId).untouched = g._count._all;
    }
    for (const g of taken) if (g.toUserId != null) row(g.toUserId).taken = g._count._all;
    for (const g of expired) {
      if (g.fromUserId != null) row(g.fromUserId).expired = g._count._all;
    }
    if (rows.size) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...rows.keys()] } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) row(u.id).name = fullName(u);
    }
    return {
      period,
      rows: [...rows.values()].sort(
        (a, b) => b.held - a.held || b.taken - a.taken || a.name.localeCompare(b.name),
      ),
    };
  }

  /** Whom a manager may give the lead to: active staff of its branch who may claim. */
  async assignable(
    leadId: string,
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<{ id: number; firstName: string; lastName: string; photo: string | null }[]> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, companyId, deletedAt: null, ...leadBranchWhere(scope) },
      select: { branchId: true },
    });
    if (!lead) throw new NotFoundException('Lid topilmadi');
    const staff = await this.prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { name: { in: STAFF_ROLE_NAMES } } } },
        ...(lead.branchId != null
          ? {
              OR: [
                { mainBranch: lead.branchId },
                { branches: { some: { branchId: lead.branchId } } },
              ],
            }
          : {}),
      },
      select: { id: true, firstName: true, lastName: true, photo: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    const allowed = await Promise.all(
      staff.map((u) => this.permissions.has(u.id, 'leads.claim')),
    );
    return staff.filter((_, i) => allowed[i]);
  }
```

Run: `npx jest src/leads/ownership/lead-ownership.service.spec.ts` — PASS.

- [ ] **Step 3: DTOlar**

`dto/assign-lead-owner.dto.ts`:

```ts
import { IsInt, IsOptional, Min } from 'class-validator';

/** The new owner; null or absent takes the owner away. */
export class AssignLeadOwnerDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number | null;
}
```

`dto/lead-ownership-settings.dto.ts`:

```ts
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class LeadOwnershipSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUntouched?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  firstActionHours?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  followUpDays?: number;
}
```

`dto/lead-ownership-query.dto.ts`:

```ts
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import {
  LEAD_STATS_PERIODS,
  type LeadStatsPeriod,
} from '../../dto/lead-stats-query.dto';

export class OwnershipSummaryQueryDto {
  @IsOptional()
  @IsIn(LEAD_STATS_PERIODS)
  period?: LeadStatsPeriod;
}

export class AssignableQueryDto {
  @IsUUID()
  leadId!: string;
}
```

- [ ] **Step 4: Controller testi**

`lead-ownership.controller.spec.ts`:

```ts
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { LeadOwnershipController } from './lead-ownership.controller';

describe('LeadOwnershipController — route access', () => {
  it.each([
    ['claim', ['leads.claim'], ['Administrator', 'CEO']],
    ['release', ['leads.claim', 'leads.assign'], ['Administrator', 'Branch Director', 'CEO']],
    ['assign', ['leads.assign'], ['Branch Director', 'CEO']],
    ['assignable', ['leads.assign'], ['Branch Director', 'CEO']],
    ['summary', ['leads.view'], ['Administrator', 'Branch Director', 'CEO']],
    ['getSettings', ['leads.view'], ['Administrator', 'Branch Director', 'CEO']],
  ] as const)('%s is gated by %j', (name, keys, roles) => {
    expect(routeAccess(LeadOwnershipController, name)).toEqual({
      kind: 'can',
      keys: [...keys],
    });
    expect(defaultRolesOf(LeadOwnershipController, name)).toEqual([...roles]);
  });

  it('only the CEO changes the limits', () => {
    expect(routeAccess(LeadOwnershipController, 'setSettings')).toEqual({
      kind: 'ceo',
    });
  });
});
```

Run — FAIL.

- [ ] **Step 5: Controller**

`lead-ownership.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can, CeoOnly } from '../../common/permissions/access.decorators';
import { LeadsService } from '../leads.service';
import { LeadOwnershipService } from './lead-ownership.service';
import { AssignLeadOwnerDto } from './dto/assign-lead-owner.dto';
import { LeadOwnershipSettingsDto } from './dto/lead-ownership-settings.dto';
import {
  AssignableQueryDto,
  OwnershipSummaryQueryDto,
} from './dto/lead-ownership-query.dto';

/**
 * A lead's owner (ADR-0093). Registered before `LeadsController`; the two-segment
 * `ownership/*` reads never meet its `:id` routes anyway.
 */
@Controller('leads')
export class LeadOwnershipController {
  constructor(
    private ownership: LeadOwnershipService,
    private leads: LeadsService,
  ) {}

  @Get('ownership/summary')
  @Can('leads.view')
  summary(
    @Query() q: OwnershipSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ownership.summary(companyId, scope, q.period ?? 'month');
  }

  @Get('ownership/assignable')
  @Can('leads.assign')
  assignable(
    @Query() q: AssignableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ownership.assignable(q.leadId, companyId, scope);
  }

  @Get('ownership/settings')
  @Can('leads.view')
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.ownership.rules(companyId);
  }

  @Patch('ownership/settings')
  @CeoOnly()
  setSettings(
    @Body() dto: LeadOwnershipSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.ownership.setRules(companyId, dto, userId);
  }

  @Post(':id/claim')
  @Can('leads.claim')
  async claim(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.claim(id, userId, companyId, scope);
    return this.leads.card(id, companyId);
  }

  @Post(':id/release')
  @Can('leads.claim', 'leads.assign')
  async release(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.release(id, userId, companyId, scope);
    return this.leads.card(id, companyId);
  }

  @Patch(':id/owner')
  @Can('leads.assign')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadOwnerDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.assign(id, dto.userId ?? null, userId, companyId, scope);
    return this.leads.card(id, companyId);
  }
}
```

`leads.module.ts` `controllers` ro'yxatining BOSHIGA `LeadOwnershipController`.

- [ ] **Step 6: Route manifesti va filial siyosati**

`route-access.snapshot.json` ga (alifbo tartibida, `"GET /leads/..."`, `"PATCH /leads/..."`, `"POST /leads/..."` qatorlari orasiga):

```json
  "GET /leads/ownership/assignable": ["Branch Director", "CEO"],
  "GET /leads/ownership/settings": ["Administrator", "Branch Director", "CEO"],
  "GET /leads/ownership/summary": ["Administrator", "Branch Director", "CEO"],
  "PATCH /leads/:id/owner": ["Branch Director", "CEO"],
  "PATCH /leads/ownership/settings": ["CEO"],
  "POST /leads/:id/claim": ["Administrator", "CEO"],
  "POST /leads/:id/release": ["Administrator", "Branch Director", "CEO"],
```

(fayl formatiga moslab — har rol alohida qatorda).

`branch-route-policy.ts` da `'PATCH /lesson-ratings/settings'` bloki yoniga:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Lead ownership limits (ADR-0093): `leads.maxUntouched`, ' +
      '`leads.firstActionHours` and `leads.followUpDays` are company-level ' +
      'settings (`companyLevelOnly`) — one value for every branch. The read ' +
      'carries numbers only; the write is CEO-only through `@CeoOnly()`. The ' +
      'other ownership routes take `@BranchScope()`.',
    routes: ['GET /leads/ownership/settings', 'PATCH /leads/ownership/settings'],
  },
```

- [ ] **Step 7: Testlar**

```bash
npx jest src/leads src/common/permissions src/common/auth
npm run typecheck
```

Expected: PASS (`permission-routes.spec.ts`, `branch-route-policy.spec.ts`, `permission-allowed-roles.spec.ts`, `route-inventory.spec.ts` ham).

- [ ] **Step 8: Format, lint, commit**

```bash
npx prettier --write src/leads src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json
npx eslint src/leads src/common/auth/branch-route-policy.ts --quiet
cd .. && git add server/src && git commit -m "feat(leads): ownership routes, summary and limits (ADR-0093)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Client — tiplar, formatlash va API

**Files:**
- Create: `client/src/components/leads/ownership/ownership-format.ts` (+ `.test.ts`)
- Create: `client/src/components/leads/ownership/ownership-api.ts`
- Create: `client/src/components/leads/ownership/use-minute-clock.ts`
- Modify: `client/src/hooks/use-leads-board.ts` (`LeadCard`)

**Interfaces:**
- Produces:
  - `interface LeadOwner { id: number; firstName: string; lastName: string }`
  - `ownerName(o)`, `ownerInitials(o)`, `dueTone(dueAt: string, now: Date): "normal" | "urgent" | "overdue"`, `dueLabel(dueAt: string, now: Date): string`, `URGENT_MS`
  - `claimLead(id)`, `releaseLead(id)`, `assignLead(id, userId | null)` → `Promise<LeadCard>`
  - `fetchAssignable(leadId)` → `AssignableStaff[]`; `fetchOwnerSummary(period)` → `{ period; rows: OwnerSummaryRow[] }`; `fetchOwnershipRules()`, `saveOwnershipRules(rules)` → `OwnershipRules`
  - `useMinuteClock(): Date`
  - `LeadCard.owner: LeadOwner | null`, `LeadCard.ownerDueAt: string | null`

- [ ] **Step 1: Test**

`client/src/components/leads/ownership/ownership-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dueLabel, dueTone, ownerInitials, ownerName } from "./ownership-format";

// Tashkent wall clock to an instant.
const t = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
const iso = (day: string, hhmm: string) => t(day, hhmm).toISOString();
const owner = { id: 11, firstName: "Nodira", lastName: "Rahimova" };

describe("owner name", () => {
  it("joins the name and takes the initials", () => {
    expect(ownerName(owner)).toBe("Nodira Rahimova");
    expect(ownerInitials(owner)).toBe("NR");
  });
});

describe("dueTone", () => {
  it("is calm with more than an hour left", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "12:00"))).toBe("normal");
  });
  it("turns urgent within the last hour", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "13:10"))).toBe("urgent");
  });
  it("is overdue once the time has passed", () => {
    expect(dueTone(iso("2026-10-19", "14:00"), t("2026-10-19", "14:00"))).toBe("overdue");
  });
});

describe("dueLabel", () => {
  it("shows only the time on the same Tashkent day", () => {
    expect(dueLabel(iso("2026-10-19", "14:30"), t("2026-10-19", "09:00"))).toBe("14:30 gacha");
  });
  it("adds the day when the deadline is on another day", () => {
    expect(dueLabel(iso("2026-10-22", "18:00"), t("2026-10-19", "09:00"))).toBe("22.10, 18:00 gacha");
  });
});
```

Run: `npm test -- src/components/leads/ownership/ownership-format.test.ts` — FAIL.

- [ ] **Step 2: Formatlash**

`client/src/components/leads/ownership/ownership-format.ts`:

```ts
import { tashkentDayNumber, tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";

/** A lead's owner as the server sends it (ADR-0093). */
export interface LeadOwner {
  id: number;
  firstName: string;
  lastName: string;
}

export function ownerName(o: LeadOwner): string {
  return `${o.firstName} ${o.lastName}`.trim();
}

export function ownerInitials(o: LeadOwner): string {
  return `${o.firstName.charAt(0)}${o.lastName.charAt(0)}`.toUpperCase();
}

/** Under an hour left: the deadline turns orange. */
export const URGENT_MS = 60 * 60 * 1000;

export type DueTone = "normal" | "urgent" | "overdue";

export function dueTone(dueAt: string, now: Date): DueTone {
  const left = new Date(dueAt).getTime() - now.getTime();
  if (left <= 0) return "overdue";
  return left <= URGENT_MS ? "urgent" : "normal";
}

/** «14:30 gacha» today, «22.10, 18:00 gacha» another day — on the Tashkent clock. */
export function dueLabel(dueAt: string, now: Date): string {
  const time = tashkentHhmm(dueAt);
  return tashkentDayNumber(dueAt) === tashkentDayNumber(now)
    ? `${time} gacha`
    : `${tashkentDdMm(dueAt)}, ${time} gacha`;
}
```

Run — PASS.

- [ ] **Step 3: API va soat**

`client/src/components/leads/ownership/ownership-api.ts`:

```ts
import api from "@/lib/api";
import type { LeadCard } from "@/hooks/use-leads-board";

/** The routes of `LeadOwnershipController` (ADR-0093). */
export async function claimLead(id: string): Promise<LeadCard> {
  return (await api.post<LeadCard>(`/leads/${id}/claim`)).data;
}

export async function releaseLead(id: string): Promise<LeadCard> {
  return (await api.post<LeadCard>(`/leads/${id}/release`)).data;
}

export async function assignLead(id: string, userId: number | null): Promise<LeadCard> {
  return (await api.patch<LeadCard>(`/leads/${id}/owner`, { userId })).data;
}

export interface AssignableStaff {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
}

export async function fetchAssignable(leadId: string): Promise<AssignableStaff[]> {
  return (
    await api.get<AssignableStaff[]>("/leads/ownership/assignable", { params: { leadId } })
  ).data;
}

export interface OwnerSummaryRow {
  userId: number;
  name: string;
  held: number;
  untouched: number;
  taken: number;
  expired: number;
}

export type OwnershipPeriod = "week" | "month" | "last-month";

export async function fetchOwnerSummary(
  period: OwnershipPeriod,
): Promise<{ period: OwnershipPeriod; rows: OwnerSummaryRow[] }> {
  return (await api.get("/leads/ownership/summary", { params: { period } })).data;
}

export interface OwnershipRules {
  maxUntouched: number;
  firstActionHours: number;
  followUpDays: number;
}

export async function fetchOwnershipRules(): Promise<OwnershipRules> {
  return (await api.get<OwnershipRules>("/leads/ownership/settings")).data;
}

export async function saveOwnershipRules(rules: OwnershipRules): Promise<OwnershipRules> {
  return (await api.patch<OwnershipRules>("/leads/ownership/settings", rules)).data;
}
```

`client/src/components/leads/ownership/use-minute-clock.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/** The current time, refreshed once a minute: deadlines change colour on their own. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
```

- [ ] **Step 4: `LeadCard`**

`hooks/use-leads-board.ts` — `import type { LeadOwner } from "@/components/leads/ownership/ownership-format";` va `LeadCard` ga (`commentCount` dan keyin):

```ts
  /** The lead's owner (ADR-0093); null while it sits in the common pool. */
  owner: LeadOwner | null;
  /** When the lead returns to the pool unless its owner acts (server-computed). */
  ownerDueAt: string | null;
```

- [ ] **Step 5: Tekshiruv va commit**

```bash
cd client
npm test -- src/components/leads/ownership
npx eslint src/components/leads/ownership src/hooks/use-leads-board.ts
npx tsc --noEmit -p .
cd .. && git add client/src && git commit -m "feat(leads): client types and helpers for the lead owner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`npx tsc` boshqa joyda `LeadCard` yaratib, `owner`/`ownerDueAt` bermagan joyni ko'rsatsa (masalan test fixture'lari), u yerga `owner: null, ownerDueAt: null` qo'shing.

---

### Task 11: Kartochkada egasi va muddat

**Files:**
- Create: `client/src/components/leads/ownership/lead-owner-badge.tsx`
- Modify: `client/src/components/leads/lead-card.tsx`

**Interfaces:**
- Consumes: `LeadCard.owner/ownerDueAt`, `claimLead`, `dueTone/dueLabel/ownerInitials/ownerName`, `useMinuteClock`, `useLeadsBoard.applyLeadUpdate(sectionId, card)`.
- Produces: `LeadOwnerBadge({ lead, sectionId?, interactive? })`.

- [ ] **Step 1: Belgi komponenti**

`client/src/components/leads/ownership/lead-owner-badge.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Clock, Loader2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useCan } from "@/hooks/use-permissions";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { claimLead } from "./ownership-api";
import { dueLabel, dueTone, ownerInitials, ownerName } from "./ownership-format";
import { useMinuteClock } from "./use-minute-clock";

const TONE = {
  normal: "text-muted-foreground",
  urgent: "text-orange-600 dark:text-orange-400",
  overdue: "text-destructive",
} as const;

/**
 * The owner line of a board card (ADR-0093): the owner's initials and the
 * deadline, or «Band qilish» on a free lead for someone who may claim it.
 * `interactive={false}` is the drag overlay's copy.
 */
export function LeadOwnerBadge({
  lead,
  sectionId,
  interactive = true,
}: {
  lead: LeadCard;
  sectionId?: string;
  interactive?: boolean;
}) {
  const now = useMinuteClock();
  const canClaim = useCan("leads.claim");
  const applyLeadUpdate = useLeadsBoard((s) => s.applyLeadUpdate);
  const [busy, setBusy] = useState(false);

  if (lead.owner) {
    const tone = lead.ownerDueAt ? dueTone(lead.ownerDueAt, now) : "normal";
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
              {ownerInitials(lead.owner)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{`Mas'ul: ${ownerName(lead.owner)}`}</TooltipContent>
        </Tooltip>
        {lead.ownerDueAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("flex items-center gap-0.5 tabular-nums", TONE[tone])}>
                <Clock className="size-3" />
                {tone === "overdue" ? "Muddat o'tdi" : dueLabel(lead.ownerDueAt, now)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Shu vaqtgacha qo&apos;ng&apos;iroq, izoh yoki topshiriq bo&apos;lmasa, lid umumiy
              ro&apos;yxatga qaytadi
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  if (!interactive || !canClaim || !sectionId || lead.statusEnum === "CONVERTED") return null;

  const claim = async () => {
    setBusy(true);
    try {
      applyLeadUpdate(sectionId, await claimLead(lead.id));
      toast.success("Lid sizga biriktirildi");
    } catch (error) {
      toast.error(getErrorMessage(error, "Lidni band qilib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={claim}
      disabled={busy}
      className="mt-1.5 flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
      Band qilish
    </button>
  );
}
```

- [ ] **Step 2: Kartochkaga qo'yish**

`lead-card.tsx` — `import { LeadOwnerBadge } from "./ownership/lead-owner-badge";`.

`LeadCardItem` da lid oynasini ochuvchi `<button ...><CardBody lead={lead} /></button>` ni shunday o'rang (tugma ichida tugma bo'lmasligi uchun belgi tashqarida):

```tsx
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openLeadDetail(lead.id)}
          className="w-full text-left transition-colors hover:text-primary"
        >
          <CardBody lead={lead} />
        </button>
        <LeadOwnerBadge lead={lead} sectionId={sectionId} />
      </div>
```

`LeadCardOverlay` da `<div className="min-w-0 flex-1"><CardBody lead={lead} /></div>` →

```tsx
      <div className="min-w-0 flex-1">
        <CardBody lead={lead} />
        <LeadOwnerBadge lead={lead} interactive={false} />
      </div>
```

- [ ] **Step 3: Tekshiruv va commit**

```bash
cd client
npx eslint src/components/leads/lead-card.tsx src/components/leads/ownership
npx tsc --noEmit -p .
cd .. && git add client/src && git commit -m "feat(leads): owner and deadline on the board card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Lid oynasidagi «Mas'ul» bloki

**Files:**
- Create: `client/src/components/leads/ownership/lead-owner-assign.tsx`
- Create: `client/src/components/leads/ownership/lead-owner-block.tsx`
- Modify: `client/src/components/leads/lead-detail-drawer.tsx`

**Interfaces:**
- Consumes: `claimLead`, `releaseLead`, `assignLead`, `fetchAssignable`, `useMinuteClock`, `useAuth`, `useCan`.
- Produces: `LeadOwnerBlock({ lead, onChanged })`, `LeadOwnerAssign({ leadId, currentOwnerId, disabled, onAssigned })`.

- [ ] **Step 1: «Boshqaga berish» tanlovi**

`client/src/components/leads/ownership/lead-owner-assign.tsx`:

```tsx
"use client";

import { useCallback, useState } from "react";
import { Loader2, UserCog } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import type { LeadCard } from "@/hooks/use-leads-board";
import { assignLead, fetchAssignable, type AssignableStaff } from "./ownership-api";
import { ownerInitials, ownerName } from "./ownership-format";

/** More than this many people: a search box appears (searchable select rule). */
const SEARCH_FROM = 7;

/** «Boshqaga berish» (ADR-0093): the lead branch's staff who may claim leads. */
export function LeadOwnerAssign({
  leadId,
  currentOwnerId,
  disabled,
  onAssigned,
}: {
  leadId: string;
  currentOwnerId: number | null;
  disabled?: boolean;
  onAssigned: (card: LeadCard) => void;
}) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<AssignableStaff[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState<number | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    setStaff(null);
    try {
      setStaff(await fetchAssignable(leadId));
    } catch {
      setFailed(true);
    }
  }, [leadId]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery("");
      void load();
    }
  };

  const pick = async (person: AssignableStaff) => {
    setSaving(person.id);
    try {
      onAssigned(await assignLead(leadId, person.id));
      toast.success(`Lid ${ownerName(person)}ga berildi`);
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error, "Lidni berib bo'lmadi"));
    } finally {
      setSaving(null);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = (staff ?? []).filter(
    (p) => p.id !== currentOwnerId && ownerName(p).toLowerCase().includes(needle),
  );

  return (
    <Popover modal open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}>
          <UserCog className="size-4" />
          Boshqaga berish
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {staff && staff.length > SEARCH_FROM && (
          <Input
            placeholder="Xodim qidirish..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2 h-8"
          />
        )}
        <div className="max-h-60 overflow-y-auto overscroll-contain">
          {failed ? (
            <div className="space-y-2 px-2 py-3 text-sm text-muted-foreground">
              <p>Ro&apos;yxatni yuklab bo&apos;lmadi</p>
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Qayta urinish
              </Button>
            </div>
          ) : staff === null ? (
            <div className="space-y-2 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : shown.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Lid beriladigan xodim topilmadi
            </p>
          ) : (
            shown.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={saving !== null}
                onClick={() => void pick(p)}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
              >
                <Avatar className="size-6">
                  <AvatarImage src={p.photo ?? undefined} />
                  <AvatarFallback className="text-[10px]">{ownerInitials(p)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{ownerName(p)}</span>
                {saving === p.id && <Loader2 className="ml-auto size-4 animate-spin" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

(`components/ui/avatar.tsx` `AvatarImage`/`AvatarFallback` eksport qilmasa, `group-teacher-select.tsx:124-146` dagi avatar usulini takrorlang.)

- [ ] **Step 2: «Mas'ul» bloki**

`client/src/components/leads/ownership/lead-owner-block.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import type { LeadCard, LeadStatus } from "@/hooks/use-leads-board";
import { claimLead, releaseLead } from "./ownership-api";
import { LeadOwnerAssign } from "./lead-owner-assign";
import { dueLabel, dueTone, ownerName, type LeadOwner } from "./ownership-format";
import { useMinuteClock } from "./use-minute-clock";

export interface OwnerBlockLead {
  id: string;
  statusEnum: LeadStatus;
  owner: LeadOwner | null;
  ownerDueAt: string | null;
}

/**
 * «Mas'ul» in the lead drawer (ADR-0093): who holds the lead and until when,
 * with «Band qilish», «Bo'shatish» and, for a manager, «Boshqaga berish».
 * A converted lead's owner is frozen: no buttons.
 */
export function LeadOwnerBlock({
  lead,
  onChanged,
}: {
  lead: OwnerBlockLead;
  onChanged: (card: LeadCard) => void;
}) {
  const now = useMinuteClock();
  const userId = useAuth((s) => s.user?.id);
  const canClaim = useCan("leads.claim");
  const canAssign = useCan("leads.assign");
  const [busy, setBusy] = useState<"claim" | "release" | null>(null);

  const converted = lead.statusEnum === "CONVERTED";
  const mine = lead.owner != null && lead.owner.id === userId;

  const run = async (kind: "claim" | "release", ok: string) => {
    setBusy(kind);
    try {
      onChanged(kind === "claim" ? await claimLead(lead.id) : await releaseLead(lead.id));
      toast.success(ok);
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  };

  const tone = lead.ownerDueAt ? dueTone(lead.ownerDueAt, now) : "normal";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Mas&apos;ul</p>
        {lead.owner ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ownerName(lead.owner)}
            {lead.ownerDueAt && (
              <span
                className={cn(
                  tone === "urgent" && "text-orange-600 dark:text-orange-400",
                  tone === "overdue" && "text-destructive",
                )}
              >
                {" · "}
                {tone === "overdue" ? "muddat o'tdi" : dueLabel(lead.ownerDueAt, now)}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {converted ? "Egasi belgilanmagan" : "Umumiy ro'yxatda — hali hech kim olmagan"}
          </p>
        )}
      </div>
      {!converted && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!lead.owner && canClaim && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void run("claim", "Lid sizga biriktirildi")}
            >
              {busy === "claim" && <Loader2 className="size-4 animate-spin" />}
              Band qilish
            </Button>
          )}
          {lead.owner && (mine || canAssign) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("release", "Lid umumiy ro'yxatga qaytarildi")}
            >
              {busy === "release" && <Loader2 className="size-4 animate-spin" />}
              Bo&apos;shatish
            </Button>
          )}
          {canAssign && (
            <LeadOwnerAssign
              leadId={lead.id}
              currentOwnerId={lead.owner?.id ?? null}
              disabled={busy !== null}
              onAssigned={onChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}
```

(`LeadStatus` tipi `use-leads-board.ts` dan eksport qilinmasa, o'sha fayldagi enum tipini ishlating.)

- [ ] **Step 3: Lid oynasiga qo'shish**

`lead-detail-drawer.tsx`:
- `LeadDetail` interfeysiga: `owner: LeadOwner | null; ownerDueAt: string | null;` (`LeadOwner` — `./ownership/ownership-format`).
- importlar: `import { LeadOwnerBlock } from "./ownership/lead-owner-block";`.
- `handleToggleCalled` dagi `setLead(...)` ga `ownerDueAt: data.ownerDueAt` qo'shing (qo'ng'iroq egasining muddatini yangilaydi).
- `handleToggleCalled` dan keyin:

```tsx
  // ADR-0093: the owner changed in the drawer — keep the drawer and the card in step.
  const handleOwnerChanged = useCallback(
    (card: LeadCard) => {
      setLead((prev) =>
        prev ? { ...prev, owner: card.owner, ownerDueAt: card.ownerDueAt } : prev,
      );
      if (lead?.section) applyLeadUpdate(lead.section.id, card);
    },
    [lead, applyLeadUpdate],
  );
```

- «Telefon holati» blokining (`<div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">`) oldiga:

```tsx
                <LeadOwnerBlock lead={lead} onChanged={handleOwnerChanged} />
```

- `handleCommentConfirmed` ichida, `invalidateActivity(lead.id);` dan keyin — egasining izohi muddatni surgani uchun kartochkani yangilash:

```tsx
      // ADR-0093: the owner's comment moved their deadline; refresh the section.
      if (lead.section && lead.owner?.id === authUser?.id) {
        void fetchSectionLeads(lead.section.id);
      }
```

(`const fetchSectionLeads = useLeadsBoard((s) => s.fetchSectionLeads);` ni boshqa store chaqiruvlari yoniga qo'shing; `useCallback` bog'liqliklariga `authUser`, `fetchSectionLeads`.)

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client
npx eslint src/components/leads/lead-detail-drawer.tsx src/components/leads/ownership
npx tsc --noEmit -p .
cd .. && git add client/src && git commit -m "feat(leads): owner block in the lead drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: «Mas'ul» filtri, ro'yxat ustuni va xodimlar qatori

**Files:**
- Modify: `client/src/components/leads/lead-filter-schema.ts` (+ `lead-filter-schema.test.ts`)
- Modify: `client/src/components/leads/leads-filter-bar.tsx`, `leads-list.tsx`, `leads-board-client.tsx`
- Create: `client/src/components/leads/ownership/lead-owners-strip.tsx`

**Interfaces:**
- Consumes: `fetchOwnerSummary`, `LEAD_STATS_SCHEMA`, `parseStatsPeriod`.
- Produces: URL parametri `masul` (`me`, `none`, xodim id'lari, vergul bilan) → API `owner`.

- [ ] **Step 1: Sxema testi**

`lead-filter-schema.test.ts` ga:

```ts
describe("«Mas'ul» filtri", () => {
  it("counts as an active filter", () => {
    expect(
      leadFiltersActive({
        search: "",
        holati: [],
        sourceId: [],
        columnId: [],
        masul: ["me"],
        startDate: "",
        endDate: "",
        karta: "",
        page: 1,
        pageSize: 10,
      }),
    ).toBe(true);
  });
});
```

(Fayldagi boshqa `LeadFilterValues` obyektlariga `masul: []` qo'shing.) Run: `npm test -- src/components/leads/lead-filter-schema.test.ts` — FAIL.

- [ ] **Step 2: Sxema**

`lead-filter-schema.ts`:
- `LEAD_FILTER_SCHEMA` ga `columnId` dan keyin:

```ts
  // «Mas'ul» (ADR-0093): `me`, `none` and user ids; the server ORs them.
  masul: { type: "array" as const, defaultValue: [] as string[] },
```

- `LeadFilterValues` ga `masul: string[];`
- `leadFiltersActive` ga `f.masul.length > 0 ||`.

Run — PASS.

- [ ] **Step 3: Filtr paneli va ro'yxat**

`leads-filter-bar.tsx` — importlar `useQuery` (`@tanstack/react-query`), `fetchOwnerSummary` (`./ownership/ownership-api`), `LEAD_STATS_SCHEMA, parseStatsPeriod` (`./lead-stats`), `useBranchSwitcher`. Komponent ichida:

```tsx
  // People who hold or took leads in the strip's period: the «Mas'ul» options.
  const { filters: statsFilters } = useUrlFilters(LEAD_STATS_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);
  const branchId = useBranchSwitcher((s) => s.selectedBranch?.id ?? "all");
  const { data: owners } = useQuery({
    queryKey: ["leads", "owners", branchId, period],
    queryFn: () => fetchOwnerSummary(period),
  });
  const ownerOptions = [
    { value: "me", label: "Meniki" },
    { value: "none", label: "Egasiz" },
    ...(owners?.rows ?? []).map((r) => ({ value: String(r.userId), label: r.name })),
  ];
```

va «Barcha ustunlar» comboboxidan keyin:

```tsx
      <MultiSelectCombobox
        options={ownerOptions}
        selected={filters.masul}
        onChange={(next) => setFilters({ masul: next, page: 1 })}
        placeholder="Barcha mas'ullar"
        searchPlaceholder="Xodim qidirish..."
        className="w-full sm:w-48"
      />
```

`leads-list.tsx`:
- `fetchLeads` da `params.columnId = ...` dan keyin `params.owner = listParam(filters.masul);`
- `LeadListRow` ga `owner: LeadOwner | null;`
- jadvalga «Ism» ustunidan keyin «Mas'ul» ustuni: sarlavha `<TableHead>Mas&apos;ul</TableHead>`, katak `<TableCell className="text-sm">{row.owner ? ownerName(row.owner) : "—"}</TableCell>` (`ownerName`, `LeadOwner` — `./ownership/ownership-format`); skeleton qatorlarida ham bitta katak qo'shing.

- [ ] **Step 4: Xodimlar qatori**

`client/src/components/leads/ownership/lead-owners-strip.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { LEAD_FILTER_SCHEMA } from "../lead-filter-schema";
import { LEAD_STATS_SCHEMA, parseStatsPeriod } from "../lead-stats";
import { fetchOwnerSummary } from "./ownership-api";

/**
 * «Xodimlar bo'yicha» under the stats strip (ADR-0093): how many leads each
 * person holds now (and how many untouched), how many they took and how many
 * went back in the strip's period. A click lists that person's leads. A failed
 * request or nobody holding leads hides it; the board works without it.
 */
export function LeadOwnersStrip() {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branchLoaded = useBranchSwitcher((s) => s.loaded);
  const revision = useLeadsBoard((s) => s.revision);
  const { filters: statsFilters } = useUrlFilters(LEAD_STATS_SCHEMA);
  const { setFilters } = useUrlFilters(LEAD_FILTER_SCHEMA);
  const period = parseStatsPeriod(statsFilters.period);

  const { data, isPending, isError } = useQuery({
    queryKey: ["leads", "owners", selectedBranch?.id ?? "all", period, revision],
    queryFn: () => fetchOwnerSummary(period),
    enabled: branchLoaded,
    placeholderData: (previous) => previous,
  });

  if (isError || (data && data.rows.length === 0)) return null;

  return (
    <section className="space-y-1.5">
      <div className="flex h-6 items-center px-0.5 text-xs text-muted-foreground">
        Xodimlar bo&apos;yicha
      </div>
      <div className="flex flex-wrap gap-2">
        {isPending || !data
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-44" />)
          : data.rows.map((r) => (
              <button
                key={r.userId}
                type="button"
                onClick={() => setFilters({ masul: [String(r.userId)], page: 1 })}
                className="rounded-md border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-muted/50"
              >
                <p className="text-sm font-medium">{r.name}</p>
                <p className="text-muted-foreground">
                  {formatNumber(r.held)} ta lid
                  {r.untouched > 0 && ` · ${formatNumber(r.untouched)} tasi harakatsiz`}
                </p>
                <p
                  className={cn(
                    r.expired > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground",
                  )}
                >
                  olgan {formatNumber(r.taken)} · qaytgan {formatNumber(r.expired)}
                </p>
              </button>
            ))}
      </div>
    </section>
  );
}
```

`leads-board-client.tsx` da `<LeadsStatsStrip />` dan keyin (o'sha `shrink-0` blok ichida):

```tsx
        <LeadOwnersStrip />
```

(blok `space-y-3` bo'lsin: `<div className="shrink-0 space-y-3">`).

- [ ] **Step 5: Tekshiruv va commit**

```bash
cd client
npm test -- src/components/leads
npx eslint src/components/leads
npx tsc --noEmit -p .
cd .. && git add client/src && git commit -m "feat(leads): owner filter, list column and per-person strip

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Sozlamalar → «Lidlar egaligi»

**Files:**
- Create: `client/src/app/(dashboard)/settings/lead-ownership/page.tsx`
- Create: `client/src/components/settings/lead-ownership-settings-client.tsx`
- Modify: `client/src/lib/settings-nav.ts` (+ `settings-nav.test.ts`), `client/src/lib/breadcrumb-routes.ts`

- [ ] **Step 1: Menyu testi**

`settings-nav.test.ts` da `"the CEO sees all 13 items in two sections"` → `"the CEO sees all 14 items in two sections"`, `toHaveLength(13)` → `toHaveLength(14)`. Va yangi blok:

```ts
describe("«Lidlar egaligi» — CEO only (ADR-0093)", () => {
  const PATH = "/settings/lead-ownership";
  it("only the CEO sees and opens it", () => {
    const ceo = getVisibleSettingsSections(canForRoles([CEO]), true).flatMap((s) => s.items);
    expect(ceo.map((item) => item.url)).toContain(PATH);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
  });
});
```

Run: `npm test -- src/lib/settings-nav.test.ts` — FAIL.

- [ ] **Step 2: Menyu yozuvi va breadcrumb**

`settings-nav.ts` — `lucide-react` importiga `UserCheck`; «CEO» bo'limiga:

```ts
      {
        // The write is `@CeoOnly()` (ADR-0093): identity, not a capability.
        title: "Lidlar egaligi",
        url: "/settings/lead-ownership",
        icon: UserCheck,
        description: "Lidni band qilish chegarasi va harakat muddatlari",
        ceoOnly: true,
      },
```

`breadcrumb-routes.ts` ga `"lead-ownership": "Lidlar egaligi",`.

Run — PASS.

- [ ] **Step 3: Sahifa**

`client/src/app/(dashboard)/settings/lead-ownership/page.tsx`:

```tsx
import { Suspense } from "react";
import { LeadOwnershipSettingsClient } from "@/components/settings/lead-ownership-settings-client";

export default function LeadOwnershipSettingsPage() {
  return (
    <Suspense>
      <LeadOwnershipSettingsClient />
    </Suspense>
  );
}
```

`client/src/components/settings/lead-ownership-settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  fetchOwnershipRules,
  saveOwnershipRules,
  type OwnershipRules,
} from "@/components/leads/ownership/ownership-api";
import { SettingsPageHeader } from "./settings-page-header";

const FIELDS: {
  key: keyof OwnershipRules;
  label: string;
  hint: string;
  min: number;
  max: number;
}[] = [
  {
    key: "maxUntouched",
    label: "Harakatsiz lidlar chegarasi",
    hint: "Bir xodim bir vaqtda nechta hali bog'lanilmagan lidni ushlab tura oladi",
    min: 1,
    max: 100,
  },
  {
    key: "firstActionHours",
    label: "Birinchi harakat (ish soati)",
    hint: "Lid olingandan keyin shuncha ish soati ichida qo'ng'iroq, izoh yoki topshiriq bo'lishi kerak",
    min: 1,
    max: 24,
  },
  {
    key: "followUpDays",
    label: "Keyingi harakat (ish kuni)",
    hint: "Oxirgi harakatdan keyin shuncha ish kunida yangi harakat bo'lmasa, lid umumiy ro'yxatga qaytadi",
    min: 1,
    max: 14,
  },
];

const QUERY_KEY = ["lead-ownership-settings"];

/** CEO-only (ADR-0093): the three numbers of the lead owner's clock. */
export function LeadOwnershipSettingsClient() {
  const queryClient = useQueryClient();
  // A draft exists only after an edit; until then the server's values show.
  const [draft, setDraft] = useState<OwnershipRules | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchOwnershipRules,
  });

  const save = useMutation({
    mutationFn: saveOwnershipRules,
    onSuccess: () => {
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      // Every card's deadline follows the new numbers.
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Saqlandi");
    },
    onError: (err) => toast.error(getErrorMessage(err, "Saqlashda xatolik")),
  });

  const form = draft ?? data ?? null;

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader
          title="Lidlar egaligi"
          description="Lidni band qilish chegarasi va harakat muddatlari"
        />
        <p className="text-sm text-muted-foreground">Sozlamalarni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Qayta urinish
        </Button>
      </div>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full max-w-xl" />
      </div>
    );
  }

  const invalid = FIELDS.some(
    (f) => !Number.isInteger(form[f.key]) || form[f.key] < f.min || form[f.key] > f.max,
  );

  return (
    <div>
      <SettingsPageHeader
        title="Lidlar egaligi"
        description="Lidni band qilish chegarasi va harakat muddatlari"
      />
      <div className="max-w-xl space-y-5 rounded-lg border p-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key}>{f.label}</Label>
            <Input
              id={f.key}
              type="number"
              inputMode="numeric"
              min={f.min}
              max={f.max}
              value={form[f.key]}
              disabled={save.isPending}
              className="max-w-28"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setDraft({ ...form, [f.key]: n });
              }}
            />
            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Ish vaqti: dushanba–shanba, 08:00–18:00; bayram kunlari hisoblanmaydi.
          O&apos;zgarish hamma lidning muddatiga darhol ta&apos;sir qiladi.
        </p>
        <Button
          disabled={!draft || invalid || save.isPending}
          onClick={() => draft && save.mutate(draft)}
        >
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Saqlash
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client
npm test -- src/lib/settings-nav.test.ts
npx eslint src/components/settings/lead-ownership-settings-client.tsx "src/app/(dashboard)/settings/lead-ownership/page.tsx" src/lib/settings-nav.ts src/lib/breadcrumb-routes.ts
npx tsc --noEmit -p .
cd .. && git add client/src && git commit -m "feat(settings): lead ownership limits page (CEO)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Lid tarixidagi yozuvlar

**Files:**
- Modify: `client/src/components/shared/entity-history-utils.ts`
- Test: `client/src/components/shared/entity-history-utils.test.ts` (bor bo'lsa — qo'shiladi, yo'q bo'lsa — yaratiladi)

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from "vitest";
import { getActionInfo, type HistoryRecord } from "./entity-history-utils";

const row = (action: string) =>
  ({ action: "UPDATE", newValues: { action }, oldValues: { action: null } }) as unknown as HistoryRecord;

describe("lead owner history rows (ADR-0093)", () => {
  it.each([
    ["LID_BAND_QILINDI", "Lid band qilindi"],
    ["LID_BERILDI", "Lid boshqaga berildi"],
    ["LID_BOSHATILDI", "Lid bo'shatildi"],
    ["LID_QAYTDI", "Muddat o'tib qaytdi"],
  ])("%s reads as «%s»", (action, label) => {
    expect(getActionInfo(row(action)).label).toBe(label);
  });
});
```

(`HistoryRecord` eksport qilinmasa, `getActionInfo` parametrining tipini `Parameters<typeof getActionInfo>[0]` bilan oling.) Run — FAIL.

- [ ] **Step 2: Yorliqlar**

`getActionInfo` `case "UPDATE":` boshiga:

```ts
      // Lead owner (ADR-0093).
      if (customAction === "LID_BAND_QILINDI")
        return { label: "Lid band qilindi", icon: UserCheck, variant: "default" };
      if (customAction === "LID_BERILDI")
        return { label: "Lid boshqaga berildi", icon: ArrowRightLeft, variant: "secondary" };
      if (customAction === "LID_BOSHATILDI")
        return { label: "Lid bo'shatildi", icon: UserMinus, variant: "outline" };
      if (customAction === "LID_QAYTDI")
        return { label: "Muddat o'tib qaytdi", icon: Clock, variant: "destructive" };
```

(`UserCheck`, `Clock` ni `lucide-react` importiga qo'shing.) `FIELD_LABELS` ga `masul: "Mas'ul",` va (yo'q bo'lsa) `sabab: "Sabab",`.

- [ ] **Step 3: Tekshiruv va commit**

```bash
cd client
npm test -- src/components/shared
npx eslint src/components/shared/entity-history-utils.ts
cd .. && git add client/src && git commit -m "feat(leads): owner changes in the lead history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Hujjatlar — ADR, CLAUDE.md, qo'llanma

**Files:**
- Create: `docs/adr/0093-lid-egasi.md`; Modify: `docs/adr/README.md`
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`
- Create: `client/src/qollanma/kontent/oquvchilar/lid-egasi.mdx`
- Modify: `client/src/qollanma/sahifalar/oquvchilar.ts`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR-0093**

`docs/adr/0093-lid-egasi.md` (boshqa ADR'lar formatida — Holati / Kontekst / Qaror / Ko'rib chiqilgan muqobillar / Oqibatlari):

```markdown
# ADR-0093: Lidning bitta egasi bor — xodim band qiladi, muddatda harakat qilmasa lid qaytadi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** spec `docs/superpowers/specs/2026-10-16-admin-kpi-design.md`, ADR-0079, ADR-0087, ADR-0083

## Kontekst

Adminlar KPI'si (spec, 4 bosqich) natijaga to'lanadi va har natijaning bitta
egasi bo'lishi kerak. Lidda egasi yo'q edi: 16.09–15.10.2026 da 535 lidning
174 tasi bilan 2–3 admin ishlagan, 265 aylanishning 183 tasida admin
yozilmagan. Har ishlaganga to'lash bitta natija uchun 2–3 marta pul chiqarardi.

## Qaror

1. `Lead.ownerId` — hozirgi egasi; `ownedAt` — egalik boshlangani;
   `ownerActedAt` — egasining oxirgi harakati. Tarix — `LeadOwnershipLog`
   (CLAIM / ASSIGN / RELEASE / EXPIRE) va lidning «Tarix» qatori.
2. `leads.claim` (standart Administrator) lidni band qiladi va o'z lidini
   bo'shatadi; `leads.assign` (standart Direktor; CEO har doim) bo'sh yoki band
   lidni boshqa xodimga beradi yoki egasini olib tashlaydi. Direktor — o'z
   filiali ichida. Band lidni boshqa xodim ololmaydi.
3. Harakatsiz band lidlar bir vaqtda `leads.maxUntouched` (10) tadan oshmaydi.
   Birinchi harakat `leads.firstActionHours` (2) ish soatida, keyingisi
   `leads.followUpDays` (3) ish kunida. Ish vaqti du–sha 08:00–18:00, bayramlar
   hisoblanmaydi. Muddat saqlanmaydi, har safar hisoblanadi.
4. Harakat — faqat egasining qo'ng'iroq belgisi, lidga izohi, lidga topshirig'i.
5. Muddat o'tsa, 15 daqiqalik tekshiruv lidni egasiz qiladi (EXPIRE, tizim
   nomidan), sobiq egasiga xabar boradi.
6. Qo'lda lid qo'shgan xodim (`leads.claim` bilan) uning egasi bo'ladi.
   O'quvchiga aylangan lidning egasi qotadi; arxivdan tiklangan lid egasiz
   qaytadi.

## Ko'rib chiqilgan muqobillar

- **Natijani bosqichlarga bo'lish** (qo'ng'iroq / sinov / to'lov) — har
  bosqichni aniq yozish va «kim qildi» bahsi kerak; rad etildi.
- **Filial fondini ballga bo'lish** — admin oldindan qancha olishini
  bilmaydi, lid talashish kuchayadi; rad etildi.
- **Muddatni ustunda saqlash** — sozlama o'zgarsa eski lidlar eski muddatda
  qolardi; hisoblash arzon, saqlanmaydi.

## Oqibatlari

- 2-bosqich KPI'ni o'quvchining birinchi to'lovida shu egasiga yozadi.
- Bot orqali kelgan va hech kim band qilmagan lid egasiz qoladi — KPI yo'q.
- `leads.assign` Administrator va Kassirga berilmaydi (UNTESTED qulfi).
```

`docs/adr/README.md` jadvaliga (0091 qatoridan keyin):

```markdown
| [0093](0093-lid-egasi.md) | Lidning bitta egasi bor: xodim band qiladi, muddatda harakat qilmasa lid qaytadi | Qabul qilindi | 2026-10-16 |
```

- [ ] **Step 2: CLAUDE.md**

`server/CLAUDE.md`:
- «The capability catalog ... — 67 capabilities in 14 sections» → «69 capabilities in 14 sections».
- «Custom Form Submissions» bo'limidan oldin yangi bo'lim:

```markdown
### Lead owner (`src/leads/ownership/`, ADR-0093)

- `Lead.ownerId` / `ownedAt` / `ownerActedAt` are written only by `LeadOwnershipService` (claim, release, assign, `expireOverdue`), `LeadsService.create` (a staff member holding `leads.claim` owns the lead they add, the creation counting as the first action), `LeadsArchiveService.restoreLead` (an unconverted lead comes back without an owner) and `touchLeadOwnerAction` (`owner-action.ts`). Every owner change writes a `LeadOwnershipLog` row and a Lead `EntityHistory` UPDATE (`action`: `LID_BAND_QILINDI` / `LID_BERILDI` / `LID_BOSHATILDI` / `LID_QAYTDI`, fields `masul`, `sabab`) through `recordChange`, and emits `lead.owner.changed` after the commit (`LeadOwnerNotifyListener`: the bell for the new and the former owner, never the actor).
- **Only the owner's action counts**: `touchLeadOwnerAction` is an `updateMany` keyed on `ownerId`, called by `markCalled` (`called: true`), `CommentsService.create` (`entityType` Lead) and `LeadOwnerTaskListener` (a task on the lead created, moved or commented by its owner). Moving a card or editing a lead is not an action.
- **The deadline is never stored.** `ownershipDueAt` (`ownership-deadline.ts`): no action yet → `ownedAt` + `leads.firstActionHours` working hours; else 18:00 of the `leads.followUpDays`-th working day after `ownerActedAt`. Working time is Monday–Saturday 08:00–18:00 Tashkent, minus the company's and the lead branch's holidays. `dueResolver` gives cards `ownerDueAt`; `LeadOwnershipCron` (`0 */15 8-18 * * 1-6`) takes back what is overdue with a conditional `updateMany`, so an action that lands meanwhile wins.
- **Limits**: a claim is refused while the caller holds `leads.maxUntouched` owned leads with no action (`untouchedWhere`); a manager's assign ignores it and restarts the clock. A converted lead's owner is frozen — no claim, release or assign (stage 2 credits the KPI to it).
- Routes (`LeadOwnershipController`, registered before `LeadsController`): `POST /leads/:id/claim` (`leads.claim`), `POST /leads/:id/release` (`leads.claim` or `leads.assign`; the service lets a non-owner release only with `leads.assign`), `PATCH /leads/:id/owner` (`leads.assign`; the target must be active, hold `leads.claim` and work in the lead's branch), `GET /leads/ownership/summary` and `GET /leads/ownership/settings` (`leads.view`), `GET /leads/ownership/assignable` (`leads.assign`), `PATCH /leads/ownership/settings` (`@CeoOnly()`). `GET /leads?owner=me,none,<id>` filters by owner (ORed).
```

`client/CLAUDE.md` da «Lead Forms and Their Responses» bo'limidan oldin:

```markdown
### Lead owner (`components/leads/ownership/`, ADR-0093)

- The card shows the owner's initials and the server's `ownerDueAt` («14:30 gacha», orange under an hour, «Muddat o'tdi»), or «Band qilish» on a free lead for `useCan("leads.claim")` (`lead-owner-badge.tsx`). The drawer's «Mas'ul» block (`lead-owner-block.tsx`) has «Band qilish», «Bo'shatish» (the owner, or `leads.assign`) and «Boshqaga berish» (`lead-owner-assign.tsx`, `leads.assign`). A converted lead shows no buttons.
- The client computes no deadline: `ownerDueAt` comes from the server; `ownership-format.ts` only formats it on the Tashkent clock and `useMinuteClock` re-renders once a minute.
- The «Mas'ul» filter is the URL's `masul` (`me`, `none`, user ids) sent as `owner`; its options come from `GET /leads/ownership/summary`, which also draws «Xodimlar bo'yicha» under the stats strip (`lead-owners-strip.tsx`, same period). Sozlamalar → «Lidlar egaligi» is `ceoOnly`.
```

- [ ] **Step 3: Qo'llanma**

`client/src/qollanma/sahifalar/oquvchilar.ts` ro'yxatiga (boshqa yozuvlar shaklida):

```ts
  {
    bolim: "oquvchilar",
    sahifa: "lid-egasi",
    sarlavha: "Lid egasi",
    qisqacha:
      "Administrator lidni «Band qilish» bilan oladi va band qilingan lidni boshqasi ololmaydi. Muddatida qo'ng'iroq, izoh yoki topshiriq bo'lmasa, lid umumiy ro'yxatga o'zi qaytadi; CEO va filial direktori lidni boshqa xodimga beradi.",
    rollar: [1, 2, 3, 5],
    adr: ["0093"],
    yollar: ["/leads", "/settings/lead-ownership"],
    kalitSozlar: ["lid", "band qilish", "mas'ul", "lid egasi", "muddat", "KPI"],
    yangilangan: "2026-10-16",
  },
```

(`reyestr.test.ts` `/leads` boshqa sahifaga tegishli deb rad etsa, faqat `"/settings/lead-ownership"` qoldiring.)

`client/src/qollanma/kontent/oquvchilar/lid-egasi.mdx`:

```mdx
## Kim nima qiladi

- **Administrator** lidni «Band qilish» tugmasi bilan oladi va o'z lidini «Bo'shatish» bilan qaytaradi.
- **CEO va filial direktori** bo'sh yoki band lidni «Boshqaga berish» bilan istalgan xodimga beradi. Direktor faqat o'z filialida beradi.
- Band qilingan lidni boshqa xodim ololmaydi.

## Muddat

Lid olingach, kartochkada vaqt chiqadi: shu vaqtgacha harakat bo'lishi kerak.

- Birinchi harakat — lid olingandan keyin **2 ish soati** ichida.
- Keyingi harakat — oxirgi harakatdan keyin **3 ish kuni** ichida.
- Ish vaqti dushanba–shanba, 08:00–18:00; bayram kunlari hisoblanmaydi.

Harakat deb lid egasining **qo'ng'iroq belgisi**, **izohi** va lidga
qo'ygan **topshirig'i** sanaladi. Kartochkani boshqa ustunga surish harakat emas.

## Muddat o'tsa

Lid umumiy ro'yxatga o'zi qaytadi va egasiga «Lid umumiy ro'yxatga qaytdi»
xabari keladi. Qaytgan lidlar soni lidlar sahifasidagi «Xodimlar bo'yicha»
qatorida ko'rinadi.

<Eslatma tur="diqqat">
Bir xodimda bir vaqtda hali bog'lanilmagan 10 tadan ortiq lid bo'lmaydi.
Avval olinganlariga qo'ng'iroq qiling, keyin yangisini band qiling.
</Eslatma>

## Tarix

Har o'zgarish lidning «Tarix» bo'limiga yoziladi: kim band qildi, kim kimga
berdi, kim bo'shatdi va qachon muddat o'tib qaytdi.

## Sozlamalar

Chegara va muddatlarni CEO Sozlamalar → «Lidlar egaligi» sahifasida o'zgartiradi.
```

`client/src/qollanma/yangiliklar.ts` ro'yxatining BOSHIGA:

```ts
  {
    sana: "2026-10-16",
    sarlavha: "Lid egasi",
    matn: "Endi lidning egasi bor. Administrator lidni «Band qilish» tugmasi bilan oladi, band qilingan lidni boshqasi ololmaydi. Olingan lidga 2 ish soati ichida qo'ng'iroq, izoh yoki topshiriq bo'lishi kerak, keyin kamida har 3 ish kunida; bo'lmasa lid umumiy ro'yxatga o'zi qaytadi. Bir vaqtda 10 tadan ortiq bog'lanilmagan lid olib bo'lmaydi. CEO va filial direktori lidni boshqa xodimga beradi. Lidlar sahifasida «Mas'ul» filtri va «Xodimlar bo'yicha» qatori qo'shildi, har o'zgarish lid tarixiga yoziladi.",
    rollar: [1, 2, 3, 5],
    sahifa: { bolim: "oquvchilar", sahifa: "lid-egasi" },
  },
```

- [ ] **Step 4: Tekshiruv va commit**

```bash
cd client && npm test -- src/qollanma
cd .. && git add docs client/src/qollanma server/CLAUDE.md client/CLAUDE.md
git commit -m "docs: ADR-0093 lead owner, CLAUDE.md and the user guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: To'liq tekshiruv

- [ ] **Step 1: Server**

```bash
cd server
npm test
npm run typecheck
npx eslint src --quiet
npx prettier --check "src/**/*.ts"
```

Expected: hammasi o'tadi. Yiqilgan testni tuzatib, faqat o'sha spec'ni qayta ishga tushiring.

- [ ] **Step 2: Client**

```bash
cd ../client
npm test
npx eslint src --quiet
npm run build
```

Expected: o'tadi.

- [ ] **Step 3: Brauzerda tekshirish (dev baza)**

Server `CRONS_ENABLED=false` va bo'sh `TELEGRAM_BOT_TOKEN=`, `TELEGRAM_ADMIN_BOT_TOKEN=` bilan, client `npm run dev` bilan ishga tushadi. Administrator sifatida (dev seed'dagi hisob):
1. `/leads` — egasiz kartochkada «Band qilish» → kartochkada bosh harflar va «HH:mm gacha».
2. Lid oynasi — «Mas'ul» blokida ism va muddat; «Bo'shatish» → kartochka yana «Band qilish».
3. Izoh yozish → kartochkadagi muddat 3 ish kuniga suriladi.
4. «Mas'ul» filtri → «Meniki» → ro'yxatda faqat o'z lidlari, «Mas'ul» ustuni bilan.
5. CEO sifatida — «Boshqaga berish» → xodim tanlash → lid tarixida «Lid boshqaga berildi».
6. Sozlamalar → «Lidlar egaligi» — qiymat o'zgartirib saqlash.

Har qadamda ekran va konsol xatolari tekshiriladi.

- [ ] **Step 4: Natija**

Hamma qadam o'tsa, shox tayyor. PR ochish va saytga chiqarish — foydalanuvchi aytganda.
