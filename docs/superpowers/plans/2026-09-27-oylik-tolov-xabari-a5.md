# Monthly Payment Notices (A5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send every monthly-course student two Telegram messages through the 20:00 digest: the month's bill on the day the charge is written, and a reminder the evening before their 2nd lesson of the month if they still owe.

**Architecture:** A 19:50 cron (`MonthlyPaymentNoticeCronService`) queues two new digest categories — `MONTHLY_CHARGE` for every charge not yet announced (marked by a new `EnrollmentMonthlyCharge.noticeQueuedAt` column, claimed in the same transaction as the queue write) and `PAYMENT_REMINDER` for debtors whose 2nd lesson is tomorrow on the group's live calendar. The existing 20:00 personal digest renders them with the CEO-approved texts, re-reading the balance, the charge and the enrollment at send time. A company-level setting `payment.monthlyNoticesEnabled` switches both off.

**Tech Stack:** NestJS 11, Prisma 7 (PostgreSQL, hand-written migrations), Jest (server), Next.js 16 + Vitest (client).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` §A5. The texts there are CEO-approved (27.09.2026) — reproduce them exactly; conditional lines appear only when they have a value.
- Student-facing text: Latin Uzbek only, no English words, «sababli» (never «uzrli»). Minus sign in amounts is `−` (U+2212), as in the approved text.
- Code comments, commit messages and PR text: English. Every commit ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The repo is public: no production ids, names or amounts in code, tests or docs.
- Money is integer so'm; format with `formatSum` (`server/src/telegram-groups/utils/format.util.ts`, prints `1 040 000 so'm` with U+00A0).
- Dates are Tashkent calendar strings `'YYYY-MM-DD'`; build them with `server/src/common/date/tashkent.ts` helpers, never by hand.
- Migrations are hand-written (`prisma migrate dev` is broken in this repo). Production gets them only through `migrate deploy`, with the CEO's permission, BEFORE the new code runs.
- Only `LESSON_PACK`-free data is touched: charges exist for MONTHLY courses only; the pack-era `DEBT_CHARGE` path stays as it is.
- Server tests: `npx jest <path>` from `server/`; if a suite dies with SIGSEGV or times out under load, rerun it alone or with `--runInBand`.
- `ts-jest` is transpile-only: `npm run typecheck` (server) is the type check; run it before every commit that touches types.

## File Map

| File | Responsibility |
|---|---|
| `server/prisma/schema.prisma` | enum values `MONTHLY_CHARGE`, `PAYMENT_REMINDER`; column `EnrollmentMonthlyCharge.noticeQueuedAt` |
| `server/prisma/migrations/20260927200000_monthly_payment_notices/migration.sql` | the SQL for the above + stamping existing charges |
| `server/src/billing/monthly-payment-notice.migration.spec.ts` | guards the stamping UPDATE (without it the first run bills everyone) |
| `server/src/telegram-digest/telegram-digest-payloads.ts` | payload types of the two categories |
| `server/src/telegram-digest/uzbek-calendar.ts` (+ spec) | pure: month names and forms, previous month, `DD.MM.YYYY`, short weekday labels |
| `server/src/billing/payment-due-date.ts` (+ spec) | pure: the 2nd lesson of a date list |
| `server/src/telegram-digest/monthly-payment-text.ts` (+ spec) | pure: the approved texts as digest blocks |
| `server/src/telegram-digest/telegram-digest-queue.service.ts` (+ spec) | `enqueue` accepts a transaction client |
| `server/src/telegram-digest/telegram-digest-render.service.ts` (+ spec) | renders the two sections with live checks |
| `server/src/settings/settings.types.ts`, `dto/update-payment-settings.dto.ts`, `settings.controller.ts` (+ specs) | setting `payment.monthlyNoticesEnabled` |
| `server/src/billing/monthly-payment-notice.service.ts` (+ spec) | producer: queues bills and reminders |
| `server/src/billing/monthly-payment-notice-cron.service.ts` (+ spec) | 19:50 cron, per company, reads the setting |
| `server/src/billing/billing.module.ts` | registers the two services |
| `client/src/components/settings/payment-settings-client.tsx` (+ guard test) | the CEO's on/off switch |
| `docs/adr/0042-oylik-tolov-xabari.md`, `docs/adr/README.md`, `server/CLAUDE.md` | decision record and docs |

---

### Task 1: Schema, migration and payload types

**Files:**
- Create: `server/prisma/migrations/20260927200000_monthly_payment_notices/migration.sql`
- Create: `server/src/billing/monthly-payment-notice.migration.spec.ts`
- Modify: `server/prisma/schema.prisma` (enum `TelegramDigestCategory` ~line 1704; model `EnrollmentMonthlyCharge` ~line 1412)
- Modify: `server/src/telegram-digest/telegram-digest-payloads.ts`

**Interfaces:**
- Produces: `TelegramDigestCategory.MONTHLY_CHARGE`, `TelegramDigestCategory.PAYMENT_REMINDER`; `EnrollmentMonthlyCharge.noticeQueuedAt: Date | null`; `MonthlyChargeDigestPayload`, `PaymentReminderDigestPayload` (shapes below).

- [ ] **Step 1: Write the failing migration guard**

`server/src/billing/monthly-payment-notice.migration.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The migration is the only thing standing between the first 19:50 run and a
// bill sent to every student for a month already under way: charges written
// before it must be stamped. This spec keeps that UPDATE from being dropped.
const SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260927200000_monthly_payment_notices/migration.sql',
  ),
  'utf-8',
);

describe('monthly payment notices migration', () => {
  it('adds both digest categories', () => {
    expect(SQL).toContain(
      `ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'MONTHLY_CHARGE';`,
    );
    expect(SQL).toContain(
      `ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';`,
    );
  });

  it('adds the nullable marker column', () => {
    expect(SQL).toContain(
      'ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN "noticeQueuedAt" TIMESTAMP(3);',
    );
  });

  it('stamps every existing charge, so no student is billed for a month already under way', () => {
    expect(SQL).toMatch(
      /UPDATE "EnrollmentMonthlyCharge"\s+SET "noticeQueuedAt" = CURRENT_TIMESTAMP\s+WHERE "noticeQueuedAt" IS NULL;/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/billing/monthly-payment-notice.migration.spec.ts`
Expected: FAIL — `ENOENT: no such file or directory` for `migration.sql`.

- [ ] **Step 3: Write the migration**

`server/prisma/migrations/20260927200000_monthly_payment_notices/migration.sql`:

```sql
-- Monthly payment notices (ADR-0042): the month's bill and the 2nd-lesson
-- reminder are two new Telegram digest categories.
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'MONTHLY_CHARGE';
ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';

-- When a charge's bill was queued (or deliberately skipped). NULL = not yet.
ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN "noticeQueuedAt" TIMESTAMP(3);

-- Charges written before the notices existed are never announced: without
-- this the first run would send every student a bill for a month already
-- under way.
UPDATE "EnrollmentMonthlyCharge"
SET "noticeQueuedAt" = CURRENT_TIMESTAMP
WHERE "noticeQueuedAt" IS NULL;
```

- [ ] **Step 4: Run the guard to verify it passes**

Run: `cd server && npx jest src/billing/monthly-payment-notice.migration.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update the schema**

In `server/prisma/schema.prisma`, enum `TelegramDigestCategory`, after `GROUP_STATUS_CHANGE` add:

```prisma
  MONTHLY_CHARGE
  PAYMENT_REMINDER
```

In model `EnrollmentMonthlyCharge`, directly after `transactionId String?` add:

```prisma
  /// When this charge's bill (Telegram digest MONTHLY_CHARGE, ADR-0042) was
  /// queued, or deliberately skipped. NULL = not handled yet:
  /// `MonthlyPaymentNoticeService` claims it once, in the same transaction
  /// as the queue write. Rows written before the notices existed were
  /// stamped by their migration.
  noticeQueuedAt DateTime?
```

Run: `cd server && npx prisma generate`
Expected: `✔ Generated Prisma Client`.

- [ ] **Step 6: Add the payload types**

In `server/src/telegram-digest/telegram-digest-payloads.ts`, after `GroupStatusChangeDigestPayload` add:

```ts
/**
 * The month's bill (ADR-0042). Figures are the charge's own, frozen when it
 * was written; the debt and the total are NOT here — the renderer reads the
 * live balance at 20:00.
 */
export interface MonthlyChargeDigestPayload {
  /** EnrollmentMonthlyCharge.id — re-read at 20:00; a reversed charge is not sent. */
  chargeId: string;
  groupName: string;
  /** `shortWeekdaysLabel(group.exactDays)`, e.g. 'Du, Cho, Ju'; '' when the group has no days. */
  daysLabel: string;
  periodYear: number;
  /** 1–12. */
  periodMonth: number;
  /** What the charged lessons cost this student before the excused-lesson credit: chargedAmount + creditAmount. */
  price: number;
  coveredLessons: number;
  creditLessons: number;
  creditAmount: number;
  chargedAmount: number;
  /** 'YYYY-MM-DD' — the student's 2nd lesson of the month (`paymentDueDate`); null with fewer than two lessons. */
  dueDate: string | null;
}

/** The evening-before reminder of the 2nd lesson (ADR-0042). */
export interface PaymentReminderDigestPayload {
  /** Re-read at 20:00: a closed enrollment gets no reminder. */
  enrollmentId: string;
  groupName: string;
  periodYear: number;
  /** 1–12. */
  periodMonth: number;
  /** 'YYYY-MM-DD' — tomorrow's lesson, the student's 2nd of the month. */
  lessonDate: string;
}
```

In `DigestPayloadByCategory` add the last two entries:

```ts
  MONTHLY_CHARGE: MonthlyChargeDigestPayload;
  PAYMENT_REMINDER: PaymentReminderDigestPayload;
```

In `RecipientKindByCategory` add:

```ts
  MONTHLY_CHARGE: 'STUDENT';
  PAYMENT_REMINDER: 'STUDENT';
```

- [ ] **Step 7: Typecheck**

Run: `cd server && npm run typecheck`
Expected: exit 0 (the `EveryCategory` guard fails to compile if either map misses a category).

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20260927200000_monthly_payment_notices server/src/billing/monthly-payment-notice.migration.spec.ts server/src/telegram-digest/telegram-digest-payloads.ts
git commit -m "feat(billing): schema for monthly payment notices

Two Telegram digest categories (MONTHLY_CHARGE, PAYMENT_REMINDER) and
EnrollmentMonthlyCharge.noticeQueuedAt, the once-only marker of a charge's
bill. The migration stamps every existing charge so the first run sends no
bill for a month already under way.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Calendar helpers and the due date

**Files:**
- Create: `server/src/telegram-digest/uzbek-calendar.ts`, `server/src/telegram-digest/uzbek-calendar.spec.ts`
- Create: `server/src/billing/payment-due-date.ts`, `server/src/billing/payment-due-date.spec.ts`

**Interfaces:**
- Produces:
  - `uzMonthName(month: number): string` — lower case, throws `RangeError` outside 1–12
  - `capitalizeUz(word: string): string`
  - `previousMonth(year: number, month: number): { year: number; month: number }`
  - `formatDigestDate(isoDate: string): string` — `'2026-10-05'` → `'05.10.2026'`
  - `shortWeekdaysLabel(exactDays: readonly string[]): string` — `'Du, Cho, Ju'`
  - `paymentDueDate(lessonDates: readonly string[]): string | null`

- [ ] **Step 1: Write the failing tests**

`server/src/telegram-digest/uzbek-calendar.spec.ts`:

```ts
import {
  capitalizeUz,
  formatDigestDate,
  previousMonth,
  shortWeekdaysLabel,
  uzMonthName,
} from './uzbek-calendar';

describe('uzbek-calendar', () => {
  it('names every month in Latin Uzbek, lower case', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(uzMonthName)).toEqual([
      'yanvar',
      'fevral',
      'mart',
      'aprel',
      'may',
      'iyun',
      'iyul',
      'avgust',
      'sentabr',
      'oktabr',
      'noyabr',
      'dekabr',
    ]);
  });

  it('refuses a month outside 1–12', () => {
    expect(() => uzMonthName(0)).toThrow(RangeError);
    expect(() => uzMonthName(13)).toThrow(RangeError);
  });

  it('builds the forms the approved texts use', () => {
    expect(`${capitalizeUz(uzMonthName(10))} oyi uchun to'lov`).toBe(
      "Oktabr oyi uchun to'lov",
    );
    expect(`${capitalizeUz(uzMonthName(9))}dagi`).toBe('Sentabrdagi');
    expect(`${capitalizeUz(uzMonthName(9))}dan qolgan qarz`).toBe(
      'Sentabrdan qolgan qarz',
    );
    expect(`${uzMonthName(10)}ning 2-darsi`).toBe('oktabrning 2-darsi');
  });

  it('steps back across the new year', () => {
    expect(previousMonth(2026, 10)).toEqual({ year: 2026, month: 9 });
    expect(previousMonth(2027, 1)).toEqual({ year: 2026, month: 12 });
  });

  it('formats a digest date as DD.MM.YYYY', () => {
    expect(formatDigestDate('2026-10-05')).toBe('05.10.2026');
  });

  it('labels group days in week order, whatever order and case they are stored in', () => {
    expect(shortWeekdaysLabel(['friday', 'Monday', ' wednesday '])).toBe(
      'Du, Cho, Ju',
    );
    expect(shortWeekdaysLabel(['saturday', 'tuesday', 'thursday'])).toBe(
      'Se, Pa, Sha',
    );
    expect(shortWeekdaysLabel(['sunday'])).toBe('Ya');
  });

  it('gives an empty label for no or unknown days', () => {
    expect(shortWeekdaysLabel([])).toBe('');
    expect(shortWeekdaysLabel(['someday'])).toBe('');
  });
});
```

`server/src/billing/payment-due-date.spec.ts`:

```ts
import { paymentDueDate } from './payment-due-date';

describe('paymentDueDate', () => {
  it('is the 2nd lesson of the month', () => {
    expect(paymentDueDate(['2026-10-02', '2026-10-05', '2026-10-07'])).toBe(
      '2026-10-05',
    );
  });

  it('sorts first — the stored order is not trusted', () => {
    expect(paymentDueDate(['2026-10-07', '2026-10-02', '2026-10-05'])).toBe(
      '2026-10-05',
    );
  });

  it('is null with fewer than two lessons — there is no 2nd lesson to name', () => {
    expect(paymentDueDate(['2026-10-30'])).toBeNull();
    expect(paymentDueDate([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/telegram-digest/uzbek-calendar.spec.ts src/billing/payment-due-date.spec.ts`
Expected: FAIL — `Cannot find module './uzbek-calendar'` / `'./payment-due-date'`.

- [ ] **Step 3: Implement**

`server/src/telegram-digest/uzbek-calendar.ts`:

```ts
/**
 * Calendar words for student-facing Telegram text, Latin Uzbek. Uzbek
 * suffixes attach to a month name unchanged («Sentabrdagi», «Sentabrdan»,
 * «oktabrning»), so callers build the forms by concatenation.
 */

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
] as const;

/** 10 → 'oktabr'. Lower case: the sentence decides whether it starts one. */
export function uzMonthName(month: number): string {
  const name = MONTHS[month - 1];
  if (!name) throw new RangeError(`Month out of range: ${month}`);
  return name;
}

/** 'oktabr' → 'Oktabr'. */
export function capitalizeUz(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function previousMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

/** '2026-10-05' → '05.10.2026'. */
export function formatDigestDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return y && m && d ? `${d}.${m}.${y}` : isoDate;
}

const WEEK = [
  ['monday', 'Du'],
  ['tuesday', 'Se'],
  ['wednesday', 'Cho'],
  ['thursday', 'Pa'],
  ['friday', 'Ju'],
  ['saturday', 'Sha'],
  ['sunday', 'Ya'],
] as const;

/**
 * `Group.exactDays` as the short labels the enrollment notice uses
 * («Toq kunlar (Du, Cho, Ju)»), Monday first. Unknown names are skipped.
 */
export function shortWeekdaysLabel(exactDays: readonly string[]): string {
  const wanted = new Set(exactDays.map((d) => d.trim().toLowerCase()));
  return WEEK.filter(([day]) => wanted.has(day))
    .map(([, label]) => label)
    .join(', ');
}
```

`server/src/billing/payment-due-date.ts`:

```ts
/**
 * The day a month's payment is due: the student's 2nd lesson of the month
 * (contract as rewritten on 24.09.2026 — «oyning 2-darsigacha», for every
 * month and for a new student's first month alike). Null when the student
 * has fewer than two lessons that month: there is no 2nd lesson to name.
 */
export function paymentDueDate(lessonDates: readonly string[]): string | null {
  return [...lessonDates].sort()[1] ?? null;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd server && npx jest src/telegram-digest/uzbek-calendar.spec.ts src/billing/payment-due-date.spec.ts`
Expected: PASS (7 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/telegram-digest/uzbek-calendar.ts server/src/telegram-digest/uzbek-calendar.spec.ts server/src/billing/payment-due-date.ts server/src/billing/payment-due-date.spec.ts
git commit -m "feat(telegram-digest): Uzbek month names and the payment due date

Pure helpers for the monthly payment notices: month names and their forms,
DD.MM.YYYY, short weekday labels, and the due date (the student's 2nd
lesson of the month).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The approved texts as digest blocks

**Files:**
- Create: `server/src/telegram-digest/monthly-payment-text.ts`
- Create: `server/src/telegram-digest/monthly-payment-text.spec.ts`

**Interfaces:**
- Consumes: Task 1 payload types; Task 2 `uzMonthName`, `capitalizeUz`, `previousMonth`, `formatDigestDate`.
- Produces:
  - `type EventBlockFn = (entry: DedupedRow, text: string) => DigestBlock`
  - `monthlyBillSection(entries: DedupedRow[], balance: number, today: string, event: EventBlockFn): DigestBlock[]`
  - `paymentReminderSection(entries: DedupedRow[], totalDue: number, event: EventBlockFn): DigestBlock[]` (entries non-empty)
  - `monthlyPaymentClosing(askToPay: boolean, reminder: boolean): string[]`

- [ ] **Step 1: Write the failing tests**

`server/src/telegram-digest/monthly-payment-text.spec.ts`:

```ts
import { Prisma, TelegramDigestCategory } from '@prisma/client';
import { DedupedRow } from './telegram-digest-dedup';
import {
  MonthlyChargeDigestPayload,
  PaymentReminderDigestPayload,
} from './telegram-digest-payloads';
import { DigestBlock } from './telegram-message-parts';
import {
  EventBlockFn,
  monthlyBillSection,
  monthlyPaymentClosing,
  paymentReminderSection,
} from './monthly-payment-text';

let seq = 0;
function entry(
  category: TelegramDigestCategory,
  payload: unknown,
): DedupedRow {
  seq += 1;
  const id = `row-${seq}`;
  return {
    row: {
      id,
      companyId: 1001,
      branchId: null,
      category,
      relatedEntityId: id,
      payload: payload as Prisma.JsonValue,
      createdAt: new Date('2026-10-01T10:00:00Z'),
    },
    ids: [id],
  };
}

const bill = (over: Partial<MonthlyChargeDigestPayload> = {}) =>
  entry(TelegramDigestCategory.MONTHLY_CHARGE, {
    chargeId: 'charge-1',
    groupName: 'A1-12',
    daysLabel: 'Du, Cho, Ju',
    periodYear: 2026,
    periodMonth: 10,
    price: 1040000,
    coveredLessons: 13,
    creditLessons: 0,
    creditAmount: 0,
    chargedAmount: 1040000,
    dueDate: '2026-10-05',
    ...over,
  } satisfies MonthlyChargeDigestPayload);

const reminder = (over: Partial<PaymentReminderDigestPayload> = {}) =>
  entry(TelegramDigestCategory.PAYMENT_REMINDER, {
    enrollmentId: 'enr-1',
    groupName: 'A1-12',
    periodYear: 2026,
    periodMonth: 10,
    lessonDate: '2026-10-05',
    ...over,
  } satisfies PaymentReminderDigestPayload);

const event: EventBlockFn = (e, text) => ({ text, itemIds: e.ids });
const textOf = (blocks: DigestBlock[]) =>
  blocks
    .map((b) => b.text)
    .join('\n')
    .replace(/ /g, ' ');

describe('monthlyBillSection', () => {
  it('writes the approved bill for one group', () => {
    const blocks = monthlyBillSection([bill()], -1040000, '2026-10-01', event);
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx: 1 040 000 so'm (13 dars)",
        "Jami to'lash kerak: <b>1 040 000 so'm</b>",
        'Muddat: <b>05.10.2026</b> — oyning 2-darsigacha',
      ].join('\n'),
    );
  });

  it('shows the excused-lesson credit of the previous month', () => {
    const blocks = monthlyBillSection(
      [bill({ creditLessons: 2, creditAmount: 160000, chargedAmount: 880000 })],
      -880000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toContain(
      [
        "Oylik narx: 1 040 000 so'm (13 dars)",
        "Sentabrdagi 2 ta sababli dars uchun chegirma: −160 000 so'm",
        "Chegirma bilan oktabr uchun: 880 000 so'm",
        "Jami to'lash kerak: <b>880 000 so'm</b>",
      ].join('\n'),
    );
  });

  it('names the older debt apart from this month', () => {
    const blocks = monthlyBillSection([bill()], -1190000, '2026-10-01', event);
    expect(textOf(blocks)).toContain(
      [
        "Sentabrdan qolgan qarz: 150 000 so'm",
        "Jami to'lash kerak: <b>1 190 000 so'm</b>",
      ].join('\n'),
    );
  });

  it('writes the approved settled variant when the balance covers the month', () => {
    const blocks = monthlyBillSection([bill()], 160000, '2026-10-01', event);
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx 1 040 000 so'm balansingizdan yechildi.",
        "Qolgan balans: <b>160 000 so'm</b>",
        "Oktabr uchun to'lov qilish shart emas.",
      ].join('\n'),
    );
  });

  it('lists two groups under one header, blank lines between, earliest due date', () => {
    const blocks = monthlyBillSection(
      [
        bill({
          chargeId: 'charge-2',
          groupName: 'B1-3',
          daysLabel: 'Se, Pa, Sha',
          price: 860000,
          chargedAmount: 860000,
          coveredLessons: 12,
          dueDate: '2026-10-03',
        }),
        bill(),
      ],
      -1900000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toBe(
      [
        "📅 <b>Oktabr oyi uchun to'lov</b>",
        'Guruh: A1-12 (Du, Cho, Ju)',
        "Oylik narx: 1 040 000 so'm (13 dars)",
        '',
        'Guruh: B1-3 (Se, Pa, Sha)',
        "Oylik narx: 860 000 so'm (12 dars)",
        '',
        "Jami to'lash kerak: <b>1 900 000 so'm</b>",
        'Muddat: <b>03.10.2026</b> — oyning 2-darsigacha',
      ].join('\n'),
    );
  });

  it('drops the due line when the 2nd lesson is past or unknown', () => {
    expect(
      textOf(monthlyBillSection([bill()], -1040000, '2026-10-06', event)),
    ).not.toContain('Muddat');
    expect(
      textOf(
        monthlyBillSection([bill({ dueDate: null })], -1040000, '2026-10-01', event),
      ),
    ).not.toContain('Muddat');
  });

  it('escapes the group name and omits empty days', () => {
    const blocks = monthlyBillSection(
      [bill({ groupName: 'A1 <Intensiv>', daysLabel: '' })],
      -1040000,
      '2026-10-01',
      event,
    );
    expect(textOf(blocks)).toContain('Guruh: A1 &lt;Intensiv&gt;\n');
  });

  it('makes each group one event block (one audit line per bill)', () => {
    const one = bill();
    const blocks = monthlyBillSection([one], -1040000, '2026-10-01', event);
    expect(blocks.filter((b) => b.itemIds.length > 0)).toEqual([
      { text: expect.stringContaining('Guruh: A1-12'), itemIds: one.ids },
    ]);
  });
});

describe('paymentReminderSection', () => {
  it('writes the approved reminder', () => {
    const blocks = paymentReminderSection([reminder()], 1040000, event);
    expect(textOf(blocks)).toBe(
      [
        "⏰ <b>To'lov eslatmasi</b>",
        "Ertaga (05.10.2026) oktabrning 2-darsi bo'ladi.",
        "To'lash kerak: <b>1 040 000 so'm</b>",
        '',
        "Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
      ].join('\n'),
    );
  });

  it('says it once for two groups and carries both rows', () => {
    const a = reminder();
    const b = reminder({ enrollmentId: 'enr-2', groupName: 'B1-3' });
    const blocks = paymentReminderSection([a, b], 1900000, event);
    expect(textOf(blocks).match(/Ertaga/g)).toHaveLength(1);
    expect(blocks.flatMap((x) => x.itemIds)).toEqual([...a.ids, ...b.ids]);
  });
});

describe('monthlyPaymentClosing', () => {
  it('asks to pay under a bill', () => {
    expect(monthlyPaymentClosing(true, false)).toEqual([
      "To'lov: markazda, Payme yoki Click orqali.",
      '🔗 Profilingiz: https://student.dafzentrum.uz',
    ]);
  });

  it("adds the reminder's line about questions, once, when a reminder is shown", () => {
    const expected = [
      "To'lov: markazda, Payme yoki Click orqali.",
      "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
      '🔗 Profilingiz: https://student.dafzentrum.uz',
    ];
    expect(monthlyPaymentClosing(false, true)).toEqual(expected);
    expect(monthlyPaymentClosing(true, true)).toEqual(expected);
  });

  it('says nothing when nothing asks to pay', () => {
    expect(monthlyPaymentClosing(false, false)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/telegram-digest/monthly-payment-text.spec.ts`
Expected: FAIL — `Cannot find module './monthly-payment-text'`.

- [ ] **Step 3: Implement**

`server/src/telegram-digest/monthly-payment-text.ts`:

```ts
import { TelegramDigestCategory } from '@prisma/client';
import { escapeHtml, formatSum } from '../telegram-groups/utils/format.util';
import { STUDENT_PORTAL_URL } from './telegram-digest.constants';
import { DedupedRow } from './telegram-digest-dedup';
import {
  MonthlyChargeDigestPayload,
  payloadOf,
} from './telegram-digest-payloads';
import { DigestBlock, header, spacer } from './telegram-message-parts';
import {
  capitalizeUz,
  formatDigestDate,
  previousMonth,
  uzMonthName,
} from './uzbek-calendar';

/**
 * The monthly payment messages (ADR-0042), worded exactly as the CEO
 * approved them on 27.09.2026 (spec §A5). Pure: the renderer passes the live
 * balance in.
 */

/** Turns a shown row into its block and records it for the audit. */
export type EventBlockFn = (entry: DedupedRow, text: string) => DigestBlock;

const billOf = (e: DedupedRow) =>
  payloadOf(e.row, TelegramDigestCategory.MONTHLY_CHARGE);
const periodKey = (p: MonthlyChargeDigestPayload) =>
  p.periodYear * 100 + p.periodMonth;
const monthWord = (month: number) => capitalizeUz(uzMonthName(month));

function billGroupText(p: MonthlyChargeDigestPayload, settled: boolean): string {
  const days = p.daysLabel ? ` (${escapeHtml(p.daysLabel)})` : '';
  const lines = [`Guruh: ${escapeHtml(p.groupName)}${days}`];
  if (settled) {
    lines.push(
      `Oylik narx ${formatSum(p.chargedAmount)} balansingizdan yechildi.`,
    );
    return lines.join('\n');
  }
  lines.push(`Oylik narx: ${formatSum(p.price)} (${p.coveredLessons} dars)`);
  if (p.creditLessons > 0 && p.creditAmount > 0) {
    const prev = previousMonth(p.periodYear, p.periodMonth);
    lines.push(
      `${monthWord(prev.month)}dagi ${p.creditLessons} ta sababli dars uchun chegirma: −${formatSum(p.creditAmount)}`,
      `Chegirma bilan ${uzMonthName(p.periodMonth)} uchun: ${formatSum(p.chargedAmount)}`,
    );
  }
  return lines.join('\n');
}

function billTailText(
  bills: MonthlyChargeDigestPayload[],
  balance: number,
  today: string,
): string {
  if (balance >= 0) {
    const latest = bills[bills.length - 1];
    return [
      `Qolgan balans: <b>${formatSum(balance)}</b>`,
      `${monthWord(latest.periodMonth)} uchun to'lov qilish shart emas.`,
    ].join('\n');
  }
  const totalDue = -balance;
  const billed = bills.reduce((sum, b) => sum + b.chargedAmount, 0);
  const oldDebt = Math.max(0, totalDue - billed);
  const lines: string[] = [];
  if (oldDebt > 0) {
    const first = bills[0];
    const prev = previousMonth(first.periodYear, first.periodMonth);
    lines.push(`${monthWord(prev.month)}dan qolgan qarz: ${formatSum(oldDebt)}`);
  }
  lines.push(`Jami to'lash kerak: <b>${formatSum(totalDue)}</b>`);
  const due = bills
    .map((b) => b.dueDate)
    .filter((d): d is string => d !== null && d > today)
    .sort()[0];
  if (due) {
    lines.push(`Muddat: <b>${formatDigestDate(due)}</b> — oyning 2-darsigacha`);
  }
  return lines.join('\n');
}

/**
 * «📅 … oyi uchun to'lov»: a month header whenever the month changes, one
 * event block per group, the totals once at the end. `balance` is the
 * student's balance at send time — the debt and the total are read from it,
 * so a payment made during the day is already counted. One group keeps the
 * approved layout exactly; several are separated by blank lines.
 */
export function monthlyBillSection(
  entries: DedupedRow[],
  balance: number,
  today: string,
  event: EventBlockFn,
): DigestBlock[] {
  const sorted = [...entries].sort(
    (a, b) =>
      periodKey(billOf(a)) - periodKey(billOf(b)) ||
      billOf(a).groupName.localeCompare(billOf(b).groupName),
  );
  const settled = balance >= 0;
  const spaced = sorted.length > 1;
  const blocks: DigestBlock[] = [];
  let lastPeriod: number | null = null;
  for (const e of sorted) {
    const p = billOf(e);
    if (periodKey(p) !== lastPeriod) {
      if (lastPeriod !== null) blocks.push(spacer());
      blocks.push(
        header(`📅 <b>${monthWord(p.periodMonth)} oyi uchun to'lov</b>`),
      );
      lastPeriod = periodKey(p);
    } else if (spaced) {
      blocks.push(spacer());
    }
    blocks.push(event(e, billGroupText(p, settled)));
  }
  if (spaced) blocks.push(spacer());
  blocks.push({
    text: billTailText(sorted.map(billOf), balance, today),
    itemIds: [],
  });
  return blocks;
}

/**
 * «⏰ To'lov eslatmasi». Every reminder in one digest names the same lesson
 * day — tomorrow — so several groups share one block; the block carries all
 * their rows. `entries` must not be empty.
 */
export function paymentReminderSection(
  entries: DedupedRow[],
  totalDue: number,
  event: EventBlockFn,
): DigestBlock[] {
  const p = payloadOf(entries[0].row, TelegramDigestCategory.PAYMENT_REMINDER);
  const text = [
    `Ertaga (${formatDigestDate(p.lessonDate)}) ${uzMonthName(p.periodMonth)}ning 2-darsi bo'ladi.`,
    `To'lash kerak: <b>${formatSum(totalDue)}</b>`,
    '',
    "Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
  ].join('\n');
  const block = event(entries[0], text);
  return [
    header("⏰ <b>To'lov eslatmasi</b>"),
    { ...block, itemIds: entries.flatMap((e) => e.ids) },
  ];
}

/**
 * The closing lines of a bill that asks to pay and of the reminder. When both
 * are shown one closing serves them — the reminder's, which adds the line
 * about questions.
 */
export function monthlyPaymentClosing(
  askToPay: boolean,
  reminder: boolean,
): string[] {
  if (!askToPay && !reminder) return [];
  return [
    "To'lov: markazda, Payme yoki Click orqali.",
    ...(reminder
      ? ["Savollar bo'lsa, markaz administratoriga murojaat qiling."]
      : []),
    `🔗 Profilingiz: ${STUDENT_PORTAL_URL}`,
  ];
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest src/telegram-digest/monthly-payment-text.spec.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Lint and commit**

Run: `cd server && npx prettier --write src/telegram-digest/monthly-payment-text.ts src/telegram-digest/monthly-payment-text.spec.ts && npx eslint src/telegram-digest/monthly-payment-text.ts src/telegram-digest/monthly-payment-text.spec.ts`
Expected: no errors.

```bash
git add server/src/telegram-digest/monthly-payment-text.ts server/src/telegram-digest/monthly-payment-text.spec.ts
git commit -m "feat(telegram-digest): texts of the monthly bill and the payment reminder

The CEO-approved wording (27.09.2026) as digest blocks: one block per
group, the older debt apart from this month, the settled variant when the
balance covers the month, and one reminder block for all groups.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Render the two sections in the 20:00 digest

**Files:**
- Modify: `server/src/telegram-digest/telegram-digest-queue.service.ts` (+ `telegram-digest-queue.service.spec.ts`)
- Modify: `server/src/telegram-digest/telegram-digest-render.service.ts` (`renderStudent`, new private `liveMonthly`)
- Modify: `server/src/telegram-digest/telegram-digest-render.service.spec.ts`

**Interfaces:**
- Consumes: Task 3 `monthlyBillSection`, `paymentReminderSection`, `monthlyPaymentClosing`.
- Produces:
  - `type DigestQueueDb = Pick<Prisma.TransactionClient, 'telegramDigestItem'>` (exported from the queue service)
  - `TelegramDigestQueueService.enqueue(item: EnqueueDigestItem, db?: DigestQueueDb): Promise<void>`
  - `TelegramDigestRenderService.renderStudent(studentId: number, rows: TelegramDigestItemRow[], now?: Date): Promise<RenderedDigest>`

- [ ] **Step 1: Write the failing queue test**

Append to `server/src/telegram-digest/telegram-digest-queue.service.spec.ts`, inside the `describe`:

```ts
  it('writes through the transaction client it is given', async () => {
    const txCreate = jest.fn().mockResolvedValue({});
    await service.enqueue(
      {
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        category: TelegramDigestCategory.PAYMENT_RECEIVED,
        relatedEntityId: 'pay-1',
        payload: receipt,
      },
      { telegramDigestItem: { create: txCreate } } as unknown as DigestQueueDb,
    );
    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });
```

and extend its import: `import { DigestQueueDb, TelegramDigestQueueService } from './telegram-digest-queue.service';`

- [ ] **Step 2: Write the failing render tests**

In `server/src/telegram-digest/telegram-digest-render.service.spec.ts`:

1. Extend the payload import:

```ts
import {
  DigestPayloadByCategory,
  MonthlyChargeDigestPayload,
  TelegramDigestItemRow,
} from './telegram-digest-payloads';
```

2. Add two mocks next to `transactionFindMany` and wire them into the `PrismaService` value:

```ts
  let chargeFindMany: jest.Mock;
  let enrollmentFindMany: jest.Mock;
```

in `beforeEach`, before `Test.createTestingModule`:

```ts
    chargeFindMany = jest.fn().mockResolvedValue([]);
    enrollmentFindMany = jest.fn().mockResolvedValue([]);
```

and in `useValue`:

```ts
            enrollmentMonthlyCharge: { findMany: chargeFindMany },
            enrollment: { findMany: enrollmentFindMany },
```

3. Append this block inside the top-level `describe`:

```ts
  describe('monthly bill and reminder (ADR-0042)', () => {
    /** 20:00 Tashkent, 01.10.2026. */
    const OCT_1 = new Date('2026-10-01T15:00:00Z');
    /** 20:00 Tashkent, 04.10.2026 — the eve of the 2nd lesson. */
    const OCT_4 = new Date('2026-10-04T15:00:00Z');

    const bill = (over: Partial<MonthlyChargeDigestPayload> = {}) =>
      row(
        TelegramDigestCategory.MONTHLY_CHARGE,
        {
          chargeId: 'charge-1',
          groupName: 'A1-12',
          daysLabel: 'Du, Cho, Ju',
          periodYear: 2026,
          periodMonth: 10,
          price: 1040000,
          coveredLessons: 13,
          creditLessons: 0,
          creditAmount: 0,
          chargedAmount: 1040000,
          dueDate: '2026-10-05',
          ...over,
        },
        { relatedEntityId: over.chargeId ?? 'charge-1' },
      );
    const reminder = (lessonDate: string) =>
      row(
        TelegramDigestCategory.PAYMENT_REMINDER,
        {
          enrollmentId: 'enr-1',
          groupName: 'A1-12',
          periodYear: 2026,
          periodMonth: 10,
          lessonDate,
        },
        { relatedEntityId: `enr-1:${lessonDate}` },
      );
    const student = (balance: number) =>
      studentFindUnique.mockResolvedValue({ firstName: 'Ali', balance });
    const chargeStands = () =>
      chargeFindMany.mockResolvedValue([{ id: 'charge-1' }]);
    const enrollmentOpen = () =>
      enrollmentFindMany.mockResolvedValue([{ id: 'enr-1' }]);

    it('sends the approved bill to a student who owes', async () => {
      student(-1040000);
      chargeStands();
      const r = await service.renderStudent(10042, [bill()], OCT_1);
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "📅 <b>Oktabr oyi uchun to'lov</b>",
          'Guruh: A1-12 (Du, Cho, Ju)',
          "Oylik narx: 1 040 000 so'm (13 dars)",
          "Jami to'lash kerak: <b>1 040 000 so'm</b>",
          'Muddat: <b>05.10.2026</b> — oyning 2-darsigacha',
          '',
          "To'lov: markazda, Payme yoki Click orqali.",
          '🔗 Profilingiz: https://student.dafzentrum.uz',
        ].join('\n'),
      );
      expect(r.audit).toHaveLength(1);
      expect(chargeFindMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['charge-1'] },
          status: 'CHARGED',
          enrollment: { status: 'ACTIVE' },
        },
        select: { id: true },
      });
    });

    it('sends the settled variant when the balance covers the month', async () => {
      student(160000);
      chargeStands();
      const r = await service.renderStudent(10042, [bill()], OCT_1);
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "📅 <b>Oktabr oyi uchun to'lov</b>",
          'Guruh: A1-12 (Du, Cho, Ju)',
          "Oylik narx 1 040 000 so'm balansingizdan yechildi.",
          "Qolgan balans: <b>160 000 so'm</b>",
          "Oktabr uchun to'lov qilish shart emas.",
          '',
          'Rahmat!',
        ].join('\n'),
      );
    });

    it('sends no bill for a charge reversed (or a student gone) since it was queued', async () => {
      student(-1040000);
      const queued = bill();
      const r = await service.renderStudent(10042, [queued], OCT_1);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([queued.id]);
    });

    it('sends the approved reminder on the eve of the 2nd lesson', async () => {
      student(-1040000);
      enrollmentOpen();
      const r = await service.renderStudent(10042, [reminder('2026-10-05')], OCT_4);
      expect(textOf(r)).toBe(
        [
          'Hurmatli Ali!',
          '',
          "⏰ <b>To'lov eslatmasi</b>",
          "Ertaga (05.10.2026) oktabrning 2-darsi bo'ladi.",
          "To'lash kerak: <b>1 040 000 so'm</b>",
          '',
          "Shartnomaga ko'ra oylik to'lov 2-darsgacha qilinadi. Darslaringiz uzilib qolmasligi uchun to'lovni ertagi darsgacha amalga oshirishingizni so'raymiz.",
          '',
          "To'lov: markazda, Payme yoki Click orqali.",
          "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
          '🔗 Profilingiz: https://student.dafzentrum.uz',
        ].join('\n'),
      );
    });

    it('sends no reminder to a student who paid during the day', async () => {
      student(0);
      const queued = reminder('2026-10-05');
      const r = await service.renderStudent(10042, [queued], OCT_4);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([queued.id]);
      expect(enrollmentFindMany).not.toHaveBeenCalled();
    });

    it('drops a reminder kept from an earlier run — «Ertaga» would name a past day', async () => {
      student(-1040000);
      enrollmentOpen();
      const stale = reminder('2026-10-04');
      const r = await service.renderStudent(10042, [stale], OCT_4);
      expect(r.blocks).toEqual([]);
      expect(r.hiddenIds).toEqual([stale.id]);
    });

    it('puts bill and reminder in one message with one closing when lessons 1 and 2 are on consecutive days', async () => {
      student(-1040000);
      chargeStands();
      enrollmentOpen();
      const r = await service.renderStudent(
        10042,
        [bill({ dueDate: '2026-10-02' }), reminder('2026-10-02')],
        OCT_1,
      );
      const text = textOf(r);
      expect(text.indexOf('Oktabr oyi uchun')).toBeLessThan(
        text.indexOf("To'lov eslatmasi"),
      );
      expect(text.match(/To'lov: markazda/g)).toHaveLength(1);
      expect(text).toContain(
        "Savollar bo'lsa, markaz administratoriga murojaat qiling.",
      );
    });

    it('drops the standalone balance line when a bill states it', async () => {
      student(160000);
      chargeStands();
      const r = await service.renderStudent(
        10042,
        [receipt('pay-1', 1200000, PaymentMethod.CASH), bill()],
        OCT_1,
      );
      const text = textOf(r);
      expect(text).not.toContain('Joriy balansingiz');
      expect(text).toContain("Qolgan balans: <b>160 000 so'm</b>");
      expect(text.match(/Rahmat!/g)).toHaveLength(1);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd server && npx jest src/telegram-digest/telegram-digest-queue.service.spec.ts src/telegram-digest/telegram-digest-render.service.spec.ts`
Expected: FAIL — the queue test writes through the default client (`create` called, `txCreate` not); the monthly render tests get empty blocks (the categories are not rendered yet).

- [ ] **Step 4: Let `enqueue` take a transaction client**

Replace the body of `server/src/telegram-digest/telegram-digest-queue.service.ts` with:

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EnqueueDigestItem } from './telegram-digest-payloads';

/** The one table `enqueue` writes — an interactive transaction's client fits. */
export type DigestQueueDb = Pick<Prisma.TransactionClient, 'telegramDigestItem'>;

/**
 * The single write path into the Telegram digest queue (ADR-0025). Every
 * event that waits for the 20:00 digest calls `enqueue()` instead of sending.
 * Throws on a database error — listeners catch and log, so the business
 * write that fired the event is never affected. `db` lets a caller write the
 * row inside its own transaction (the monthly bill claims its charge in the
 * same one, ADR-0042).
 */
@Injectable()
export class TelegramDigestQueueService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(
    item: EnqueueDigestItem,
    db: DigestQueueDb = this.prisma,
  ): Promise<void> {
    await db.telegramDigestItem.create({
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

- [ ] **Step 5: Render the sections**

In `server/src/telegram-digest/telegram-digest-render.service.ts`:

1. Imports — replace the first two import lines and add the text module:

```ts
import { Injectable } from '@nestjs/common';
import {
  EnrollmentStatus,
  MonthlyChargeStatus,
  TelegramDigestCategory,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
```

and after the `./telegram-digest-dedup` import:

```ts
import {
  monthlyBillSection,
  monthlyPaymentClosing,
  paymentReminderSection,
} from './monthly-payment-text';
```

2. Replace the whole `renderStudent` method with:

```ts
  async renderStudent(
    studentId: number,
    rows: TelegramDigestItemRow[],
    now: Date = new Date(),
  ): Promise<RenderedDigest> {
    if (rows.length === 0) return nothing();
    const allHidden = { ...nothing(), hiddenIds: rows.map((r) => r.id) };

    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { firstName: true, balance: true },
    });
    if (!student) return allHidden;

    const entries = dedupRows(rows);
    const of = (...categories: TelegramDigestCategory[]) =>
      entries.filter((e) => categories.includes(e.row.category));
    const payments = of(
      TelegramDigestCategory.PAYMENT_RECEIVED,
      TelegramDigestCategory.PAYMENT_REVERSED,
    );
    const notices = of(
      TelegramDigestCategory.STUDENT_ENROLLED,
      TelegramDigestCategory.STUDENT_REMOVED,
    );
    const debts = of(TelegramDigestCategory.DEBT_CHARGE);
    const liveDebts = await this.stillCharged(studentId, debts);
    const showDebt = liveDebts.length > 0 && student.balance < 0;

    // The monthly bill and the reminder (ADR-0042). A reminder is only for a
    // student who still owes: one who paid during the day gets none.
    const today = tashkentDateStr(now);
    const owes = student.balance < 0;
    const monthly = await this.liveMonthly(
      of(TelegramDigestCategory.MONTHLY_CHARGE),
      owes ? of(TelegramDigestCategory.PAYMENT_REMINDER) : [],
      addDaysToDateStr(today, 1),
    );

    const shown = new Set<DedupedRow>([
      ...(showDebt ? liveDebts : []),
      ...monthly.bills,
      ...monthly.reminders,
    ]);
    const hiddenIds = of(
      TelegramDigestCategory.DEBT_CHARGE,
      TelegramDigestCategory.MONTHLY_CHARGE,
      TelegramDigestCategory.PAYMENT_REMINDER,
    )
      .filter((e) => !shown.has(e))
      .flatMap((e) => e.ids);

    const audit: AuditEntry[] = [];
    const eventBlock = (
      entry: DedupedRow,
      text: string,
      senderUserId: number | null = null,
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
    if (monthly.bills.length > 0) {
      sections.push(
        monthlyBillSection(monthly.bills, student.balance, today, eventBlock),
      );
    }
    if (monthly.reminders.length > 0) {
      sections.push(
        paymentReminderSection(monthly.reminders, -student.balance, eventBlock),
      );
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
    // The bill and the reminder already state the balance.
    const monthlyShown =
      monthly.bills.length > 0 || monthly.reminders.length > 0;
    if (payments.length > 0 && !showDebt && !monthlyShown) {
      blocks.push(spacer(), {
        text: `Joriy balansingiz: <b>${formatSum(student.balance)}</b>`,
        itemIds: [],
      });
    }
    // The bill's and the reminder's closing lines, then the ones today's
    // instant receipt and reversal notice end with.
    const closing = monthlyPaymentClosing(
      monthly.bills.length > 0 && owes,
      monthly.reminders.length > 0,
    );
    if (
      monthly.reminders.length === 0 &&
      payments.some(
        (e) => e.row.category === TelegramDigestCategory.PAYMENT_REVERSED,
      )
    ) {
      closing.push("Savollar bo'lsa, markazga murojaat qiling.");
    }
    if (
      (monthly.bills.length > 0 && !owes) ||
      payments.some(
        (e) => e.row.category === TelegramDigestCategory.PAYMENT_RECEIVED,
      )
    ) {
      closing.push('Rahmat!');
    }
    if (closing.length > 0) {
      blocks.push(spacer(), { text: closing.join('\n'), itemIds: [] });
    }
    return { blocks, audit, hiddenIds };
  }
```

3. Add this private method right after `stillCharged`:

```ts
  /**
   * A bill is sent only while its charge stands and the student is still in
   * that group: a charge reversed, or a student removed or frozen, during the
   * day gets no bill. A reminder only for tomorrow's lesson — a row kept
   * after a failed send would otherwise say «Ertaga» about a past day — and
   * only while the enrollment is open.
   */
  private async liveMonthly(
    bills: DedupedRow[],
    reminders: DedupedRow[],
    tomorrow: string,
  ): Promise<{ bills: DedupedRow[]; reminders: DedupedRow[] }> {
    const chargeIdOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.MONTHLY_CHARGE).chargeId;
    const reminderOf = (e: DedupedRow) =>
      payloadOf(e.row, TelegramDigestCategory.PAYMENT_REMINDER);
    const dueTomorrow = reminders.filter(
      (e) => reminderOf(e).lessonDate === tomorrow,
    );

    const standing =
      bills.length === 0
        ? []
        : await this.prisma.enrollmentMonthlyCharge.findMany({
            where: {
              id: { in: bills.map(chargeIdOf) },
              status: MonthlyChargeStatus.CHARGED,
              enrollment: { status: EnrollmentStatus.ACTIVE },
            },
            select: { id: true },
          });
    const open =
      dueTomorrow.length === 0
        ? []
        : await this.prisma.enrollment.findMany({
            where: {
              id: { in: dueTomorrow.map((e) => reminderOf(e).enrollmentId) },
              status: EnrollmentStatus.ACTIVE,
            },
            select: { id: true },
          });
    const standingIds = new Set(standing.map((c) => c.id));
    const openIds = new Set(open.map((e) => e.id));
    return {
      bills: bills.filter((e) => standingIds.has(chargeIdOf(e))),
      reminders: dueTomorrow.filter((e) =>
        openIds.has(reminderOf(e).enrollmentId),
      ),
    };
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd server && npx jest src/telegram-digest`
Expected: PASS — every existing digest test plus the 1 queue and 8 render tests added here.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `cd server && npm run typecheck && npx prettier --write src/telegram-digest && npx eslint src/telegram-digest`
Expected: exit 0, no lint errors.

```bash
git add server/src/telegram-digest
git commit -m "feat(telegram-digest): render the monthly bill and the payment reminder

The 20:00 personal digest renders MONTHLY_CHARGE and PAYMENT_REMINDER with
the approved texts, re-reading at send time: the balance (debt and total),
whether the charge still stands and the student is still in the group, and
whether the reminder is still for tomorrow. Bill and reminder share one
closing when both land in one digest.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The on/off setting

**Files:**
- Modify: `server/src/settings/settings.types.ts`, `server/src/settings/settings.types.spec.ts`
- Modify: `server/src/settings/dto/update-payment-settings.dto.ts`
- Modify: `server/src/settings/settings.controller.ts`, `server/src/settings/settings.controller.spec.ts`

**Interfaces:**
- Produces: setting key `'payment.monthlyNoticesEnabled'` (boolean, default `true`, company-level only); `PATCH /settings/payment` field `monthlyNoticesEnabled?: boolean`.

- [ ] **Step 1: Write the failing tests**

In `server/src/settings/settings.types.spec.ts`, add `'payment.monthlyNoticesEnabled',` to the array in the first test (the list of every key), and append:

```ts
  describe('payment.monthlyNoticesEnabled', () => {
    const def = getSettingDefinition('payment.monthlyNoticesEnabled');

    it('defaults to true — CEO (27.09.2026): students get the bill and the reminder', () => {
      expect(def.defaultValue).toBe(true);
    });

    it('accepts booleans only, naming this key in the error', () => {
      expect(def.parse(false)).toBe(false);
      expect(() => def.parse('ha')).toThrow(
        /payment\.monthlyNoticesEnabled faqat true\/false/,
      );
    });

    it('is company-level only — the 19:50 cron reads it per company', () => {
      expect(def.companyLevelOnly).toBe(true);
    });
  });
```

In `server/src/settings/settings.controller.spec.ts`, append inside the `describe` that holds the `debtWriteOffEnabled` tests:

```ts
  it('monthlyNoticesEnabled is written through its registry key, company-level (CEO)', async () => {
    prisma.user.findFirst.mockResolvedValue(ceoUser);
    await controller.updatePayment(
      { monthlyNoticesEnabled: false } as any,
      1,
      1001,
    );
    expect(settingsService.set).toHaveBeenCalledTimes(1);
    expect(settingsService.set).toHaveBeenCalledWith(
      1001,
      'payment.monthlyNoticesEnabled',
      false,
      1,
      undefined,
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/settings`
Expected: FAIL — the key list lacks the new key; `getSettingDefinition` throws «Noma'lum sozlama kaliti»; the controller throws «Kamida bitta sozlama yuborilishi kerak».

- [ ] **Step 3: Implement**

`server/src/settings/settings.types.ts`:
- add `| 'payment.monthlyNoticesEnabled'` as the last member of `SettingKey`;
- add `'payment.monthlyNoticesEnabled': boolean;` as the last member of `SettingValueMap`;
- add as the last entry of `SETTING_DEFINITIONS`:

```ts
  'payment.monthlyNoticesEnabled': {
    key: 'payment.monthlyNoticesEnabled',
    // CEO (27.09.2026): every monthly-course student gets the month's bill
    // and the 2nd-lesson reminder by Telegram (ADR-0042). Switching them off
    // is a toggle, not a deploy.
    defaultValue: true,
    parse: (raw) => parseBoolean('payment.monthlyNoticesEnabled', raw),
    // `MonthlyPaymentNoticeCronService` reads it by company only.
    companyLevelOnly: true,
  },
```

`server/src/settings/dto/update-payment-settings.dto.ts`, after `debtWriteOffEnabled`:

```ts
  @IsOptional()
  @IsBoolean()
  monthlyNoticesEnabled?: boolean;
```

`server/src/settings/settings.controller.ts`, in `updatePayment` after the `debtWriteOffEnabled` edit:

```ts
    if (dto.monthlyNoticesEnabled !== undefined) {
      edits.push(['payment.monthlyNoticesEnabled', dto.monthlyNoticesEnabled]);
    }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd server && npx jest src/settings`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `cd server && npm run typecheck && npx prettier --write src/settings && npx eslint src/settings`

```bash
git add server/src/settings
git commit -m "feat(settings): payment.monthlyNoticesEnabled switch

Company-level, default on: turns the monthly bill and the payment reminder
off without a deploy.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The producer — queue bills and reminders

**Files:**
- Create: `server/src/billing/monthly-payment-notice.service.ts`
- Create: `server/src/billing/monthly-payment-notice.service.spec.ts`

**Interfaces:**
- Consumes: `TelegramDigestQueueService.enqueue(item, db?)` (Task 4); `paymentDueDate` (Task 2); `shortWeekdaysLabel` (Task 2); `MonthlyChargeService.resolveMonthPlanDates(tx, groupId, branchId, year, month)` and `lessonDatesInMonth` (existing).
- Produces:
  - `NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000`
  - `MonthlyPaymentNoticeService.queueChargeNotices(companyId: number, now: Date, send: boolean): Promise<number>`
  - `MonthlyPaymentNoticeService.queueReminders(companyId: number, now: Date): Promise<number>`

- [ ] **Step 1: Write the failing tests**

`server/src/billing/monthly-payment-notice.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  StudentStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { MonthlyChargeService } from './monthly-charge.service';
import {
  MonthlyPaymentNoticeService,
  NOTICE_MAX_AGE_MS,
} from './monthly-payment-notice.service';

/** 19:50 Tashkent, 01.10.2026 — the charge day. */
const CHARGE_DAY = new Date('2026-10-01T14:50:00Z');

/** A Mon/Wed/Fri group's October: Fri 2, Mon 5, Wed 7, … — the 2nd lesson is 05.10. */
const OCTOBER = [
  '2026-10-02',
  '2026-10-05',
  '2026-10-07',
  '2026-10-09',
  '2026-10-12',
  '2026-10-14',
  '2026-10-16',
  '2026-10-19',
  '2026-10-21',
  '2026-10-23',
  '2026-10-26',
  '2026-10-28',
  '2026-10-30',
];

const charge = (over: Record<string, unknown> = {}) => ({
  id: 'charge-1',
  studentId: 10042,
  branchId: 7,
  periodYear: 2026,
  periodMonth: 10,
  coveredLessons: 13,
  coveredDates: OCTOBER,
  creditLessons: 0,
  creditAmount: 0,
  chargedAmount: 1040000,
  enrollment: { status: EnrollmentStatus.ACTIVE },
  student: { status: StudentStatus.ACTIVE, deletedAt: null },
  group: { name: 'A1-12', exactDays: ['monday', 'wednesday', 'friday'] },
  ...over,
});

describe('MonthlyPaymentNoticeService', () => {
  let service: MonthlyPaymentNoticeService;
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let enqueue: jest.Mock;
  let resolvePlan: jest.Mock;
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 1 });
    enqueue = jest.fn().mockResolvedValue(undefined);
    resolvePlan = jest
      .fn()
      .mockResolvedValue({ excludedDates: [], addedDates: [] });
    prisma = {
      enrollmentMonthlyCharge: { findMany, updateMany },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    const module = await Test.createTestingModule({
      providers: [
        MonthlyPaymentNoticeService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelegramDigestQueueService, useValue: { enqueue } },
        {
          provide: MonthlyChargeService,
          useValue: { resolveMonthPlanDates: resolvePlan },
        },
      ],
    }).compile();
    service = module.get(MonthlyPaymentNoticeService);
  });

  describe('queueChargeNotices', () => {
    it('queues the bill of a new charge and marks the charge in the same transaction', async () => {
      findMany.mockResolvedValue([charge()]);
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'charge-1', noticeQueuedAt: null },
        data: { noticeQueuedAt: CHARGE_DAY },
      });
      expect(enqueue).toHaveBeenCalledWith(
        {
          recipientKind: TelegramDigestRecipientKind.STUDENT,
          recipientId: 10042,
          companyId: 1001,
          branchId: 7,
          category: TelegramDigestCategory.MONTHLY_CHARGE,
          relatedEntityId: 'charge-1',
          payload: {
            chargeId: 'charge-1',
            groupName: 'A1-12',
            daysLabel: 'Du, Cho, Ju',
            periodYear: 2026,
            periodMonth: 10,
            price: 1040000,
            coveredLessons: 13,
            creditLessons: 0,
            creditAmount: 0,
            chargedAmount: 1040000,
            dueDate: '2026-10-05',
          },
        },
        prisma,
      );
    });

    it('prices the month before the excused-lesson credit', async () => {
      findMany.mockResolvedValue([
        charge({ creditLessons: 2, creditAmount: 160000, chargedAmount: 880000 }),
      ]);
      await service.queueChargeNotices(1001, CHARGE_DAY, true);
      expect(enqueue.mock.calls[0][0].payload).toEqual(
        expect.objectContaining({
          price: 1040000,
          creditLessons: 2,
          creditAmount: 160000,
          chargedAmount: 880000,
        }),
      );
    });

    it('reads only unmarked, standing charges of this company from the last three days', async () => {
      await service.queueChargeNotices(1001, CHARGE_DAY, true);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            noticeQueuedAt: null,
            status: MonthlyChargeStatus.CHARGED,
            createdAt: {
              gte: new Date(CHARGE_DAY.getTime() - NOTICE_MAX_AGE_MS),
            },
          },
        }),
      );
    });

    it('with notices switched off, marks the charge and queues nothing', async () => {
      findMany.mockResolvedValue([charge()]);
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, false),
      ).resolves.toBe(0);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('skips a charge another run already claimed', async () => {
      findMany.mockResolvedValue([charge()]);
      updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it.each([
      ['there is nothing to pay', { chargedAmount: 0 }],
      [
        'the enrollment is closed',
        { enrollment: { status: EnrollmentStatus.DROPPED } },
      ],
      [
        'the student is frozen',
        { student: { status: StudentStatus.FROZEN, deletedAt: null } },
      ],
      [
        'the student is archived',
        { student: { status: StudentStatus.ACTIVE, deletedAt: new Date() } },
      ],
    ])('marks but sends no bill when %s', async (_label, over) => {
      findMany.mockResolvedValue([charge(over)]);
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(0);
      expect(updateMany).toHaveBeenCalledTimes(1);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('one failing charge does not stop the rest', async () => {
      findMany.mockResolvedValue([
        charge(),
        charge({ id: 'charge-2', studentId: 10043 }),
      ]);
      enqueue.mockRejectedValueOnce(new Error('db down'));
      await expect(
        service.queueChargeNotices(1001, CHARGE_DAY, true),
      ).resolves.toBe(1);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('queueReminders', () => {
    /** 19:50 Tashkent, 04.10.2026 — tomorrow, 05.10, is the 2nd lesson. */
    const EVE = new Date('2026-10-04T14:50:00Z');
    const debtor = (over: Record<string, unknown> = {}) => ({
      enrollmentId: 'enr-1',
      studentId: 10042,
      groupId: 'g-1',
      branchId: 7,
      coveredDates: OCTOBER,
      group: { name: 'A1-12', exactDays: ['monday', 'wednesday', 'friday'] },
      ...over,
    });

    it("asks only for debtors in open enrollments of active groups, charged for tomorrow's month", async () => {
      await service.queueReminders(1001, EVE);
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            periodYear: 2026,
            periodMonth: 10,
            status: MonthlyChargeStatus.CHARGED,
            enrollment: { status: EnrollmentStatus.ACTIVE },
            group: { statusEnum: GroupStatus.ACTIVE, deletedAt: null },
            student: {
              status: StudentStatus.ACTIVE,
              deletedAt: null,
              balance: { lt: 0 },
            },
          },
        }),
      );
    });

    it('reminds a debtor whose 2nd lesson of the month is tomorrow', async () => {
      findMany.mockResolvedValue([debtor()]);
      await expect(service.queueReminders(1001, EVE)).resolves.toBe(1);
      expect(enqueue).toHaveBeenCalledWith({
        recipientKind: TelegramDigestRecipientKind.STUDENT,
        recipientId: 10042,
        companyId: 1001,
        branchId: 7,
        category: TelegramDigestCategory.PAYMENT_REMINDER,
        relatedEntityId: 'enr-1:2026-10-05',
        payload: {
          enrollmentId: 'enr-1',
          groupName: 'A1-12',
          periodYear: 2026,
          periodMonth: 10,
          lessonDate: '2026-10-05',
        },
      });
    });

    it('stays quiet when tomorrow is not the 2nd lesson', async () => {
      findMany.mockResolvedValue([debtor()]);
      await expect(
        service.queueReminders(1001, new Date('2026-10-06T14:50:00Z')),
      ).resolves.toBe(0);
      expect(enqueue).not.toHaveBeenCalled();
    });

    it('counts a mid-month joiner from their own first lesson', async () => {
      findMany.mockResolvedValue([
        debtor({ coveredDates: ['2026-10-12', '2026-10-14', '2026-10-16'] }),
      ]);
      await expect(
        service.queueReminders(1001, new Date('2026-10-13T14:50:00Z')),
      ).resolves.toBe(1);
      expect(enqueue.mock.calls[0][0].payload.lessonDate).toBe('2026-10-14');
    });

    it('follows the live calendar — a lesson cancelled after the charge moves the 2nd lesson', async () => {
      findMany.mockResolvedValue([debtor()]);
      resolvePlan.mockResolvedValue({
        excludedDates: ['2026-10-05'],
        addedDates: [],
      });
      await expect(service.queueReminders(1001, EVE)).resolves.toBe(0);
      await expect(
        service.queueReminders(1001, new Date('2026-10-06T14:50:00Z')),
      ).resolves.toBe(1);
      expect(enqueue.mock.calls[0][0].payload.lessonDate).toBe('2026-10-07');
    });

    it("resolves each group's calendar once", async () => {
      findMany.mockResolvedValue([
        debtor(),
        debtor({ enrollmentId: 'enr-2', studentId: 10043 }),
      ]);
      await service.queueReminders(1001, EVE);
      expect(resolvePlan).toHaveBeenCalledTimes(1);
      expect(resolvePlan).toHaveBeenCalledWith(prisma, 'g-1', 7, 2026, 10);
      expect(enqueue).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/billing/monthly-payment-notice.service.spec.ts`
Expected: FAIL — `Cannot find module './monthly-payment-notice.service'`.

- [ ] **Step 3: Implement**

`server/src/billing/monthly-payment-notice.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  StudentStatus,
  TelegramDigestCategory,
  TelegramDigestRecipientKind,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
import { TelegramDigestQueueService } from '../telegram-digest/telegram-digest-queue.service';
import { describeError } from '../telegram-digest/telegram-send';
import { shortWeekdaysLabel } from '../telegram-digest/uzbek-calendar';
import { MonthlyChargeService } from './monthly-charge.service';
import { paymentDueDate } from './payment-due-date';
import { lessonDatesInMonth } from './planned-lessons';

/**
 * A charge older than this is never announced. The notices run daily, so an
 * older unmarked charge means they were down, and a bill arriving days late
 * is noise, not news.
 */
export const NOTICE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Writes the two monthly payment messages (ADR-0042) into the 20:00 digest
 * queue: the month's bill the day a charge is written, and the reminder the
 * evening before the student's 2nd lesson of the month. The renderer
 * re-checks both against live data at send time.
 */
@Injectable()
export class MonthlyPaymentNoticeService {
  private readonly logger = new Logger(MonthlyPaymentNoticeService.name);

  constructor(
    private prisma: PrismaService,
    private digestQueue: TelegramDigestQueueService,
    private monthlyCharges: MonthlyChargeService,
  ) {}

  /**
   * Queues a MONTHLY_CHARGE row for every charge written since the last run
   * and marks the charge (`noticeQueuedAt`) in the same transaction, so a
   * charge is announced once however often this runs. With `send` false (the
   * notices are switched off) the charges are only marked: switching the
   * notices back on must not flood students with old bills.
   * Returns the number of bills queued.
   */
  async queueChargeNotices(
    companyId: number,
    now: Date,
    send: boolean,
  ): Promise<number> {
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        noticeQueuedAt: null,
        status: MonthlyChargeStatus.CHARGED,
        createdAt: { gte: new Date(now.getTime() - NOTICE_MAX_AGE_MS) },
      },
      select: {
        id: true,
        studentId: true,
        branchId: true,
        periodYear: true,
        periodMonth: true,
        coveredLessons: true,
        coveredDates: true,
        creditLessons: true,
        creditAmount: true,
        chargedAmount: true,
        enrollment: { select: { status: true } },
        student: { select: { status: true, deletedAt: true } },
        group: { select: { name: true, exactDays: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let queued = 0;
    for (const charge of charges) {
      // Nothing to pay, or nobody left to tell: marked, never announced.
      const announce =
        send &&
        charge.chargedAmount > 0 &&
        charge.enrollment.status === EnrollmentStatus.ACTIVE &&
        charge.student.status === StudentStatus.ACTIVE &&
        charge.student.deletedAt === null;
      try {
        const wrote = await this.prisma.$transaction(async (tx) => {
          const claim = await tx.enrollmentMonthlyCharge.updateMany({
            where: { id: charge.id, noticeQueuedAt: null },
            data: { noticeQueuedAt: now },
          });
          if (claim.count === 0 || !announce) return false;
          await this.digestQueue.enqueue(
            {
              recipientKind: TelegramDigestRecipientKind.STUDENT,
              recipientId: charge.studentId,
              companyId,
              branchId: charge.branchId,
              category: TelegramDigestCategory.MONTHLY_CHARGE,
              relatedEntityId: charge.id,
              payload: {
                chargeId: charge.id,
                groupName: charge.group.name,
                daysLabel: shortWeekdaysLabel(charge.group.exactDays),
                periodYear: charge.periodYear,
                periodMonth: charge.periodMonth,
                price: charge.chargedAmount + charge.creditAmount,
                coveredLessons: charge.coveredLessons,
                creditLessons: charge.creditLessons,
                creditAmount: charge.creditAmount,
                chargedAmount: charge.chargedAmount,
                dueDate: paymentDueDate(charge.coveredDates),
              },
            },
            tx,
          );
          return true;
        });
        if (wrote) queued += 1;
      } catch (err) {
        this.logger.error(
          `Monthly bill for charge ${charge.id} not queued: ${describeError(err)}`,
        );
      }
    }
    return queued;
  }

  /**
   * Queues a PAYMENT_REMINDER for every student who still owes and whose 2nd
   * lesson of the month is tomorrow — counted from their own first lesson of
   * the month (a mid-month joiner) on the group's LIVE calendar, so a lesson
   * cancelled or moved after the charge moves the reminder with it.
   * Returns the number of reminders queued.
   */
  async queueReminders(companyId: number, now: Date): Promise<number> {
    const tomorrow = addDaysToDateStr(tashkentDateStr(now), 1);
    const year = Number(tomorrow.slice(0, 4));
    const month = Number(tomorrow.slice(5, 7));

    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
        enrollment: { status: EnrollmentStatus.ACTIVE },
        group: { statusEnum: GroupStatus.ACTIVE, deletedAt: null },
        student: {
          status: StudentStatus.ACTIVE,
          deletedAt: null,
          balance: { lt: 0 },
        },
      },
      select: {
        enrollmentId: true,
        studentId: true,
        groupId: true,
        branchId: true,
        coveredDates: true,
        group: { select: { name: true, exactDays: true } },
      },
    });

    const plans = new Map<
      string,
      { excludedDates: string[]; addedDates: string[] }
    >();
    let queued = 0;
    for (const charge of charges) {
      try {
        let plan = plans.get(charge.groupId);
        if (!plan) {
          plan = await this.monthlyCharges.resolveMonthPlanDates(
            this.prisma,
            charge.groupId,
            charge.branchId,
            year,
            month,
          );
          plans.set(charge.groupId, plan);
        }
        const lessons = lessonDatesInMonth({
          year,
          month,
          exactDays: charge.group.exactDays,
          excludedDates: plan.excludedDates,
          addedDates: plan.addedDates,
          fromDate: [...charge.coveredDates].sort()[0] ?? null,
        });
        if (paymentDueDate(lessons) !== tomorrow) continue;
        await this.digestQueue.enqueue({
          recipientKind: TelegramDigestRecipientKind.STUDENT,
          recipientId: charge.studentId,
          companyId,
          branchId: charge.branchId,
          category: TelegramDigestCategory.PAYMENT_REMINDER,
          relatedEntityId: `${charge.enrollmentId}:${tomorrow}`,
          payload: {
            enrollmentId: charge.enrollmentId,
            groupName: charge.group.name,
            periodYear: year,
            periodMonth: month,
            lessonDate: tomorrow,
          },
        });
        queued += 1;
      } catch (err) {
        this.logger.error(
          `Payment reminder for enrollment ${charge.enrollmentId} not queued: ${describeError(err)}`,
        );
      }
    }
    return queued;
  }
}
```

If `npm run typecheck` rejects `this.prisma` as `Prisma.TransactionClient` in the `resolveMonthPlanDates` call, pass `this.prisma as unknown as Prisma.TransactionClient` (the shape `EntityHistoryService` uses at `server/src/common/entity-history/entity-history.service.ts:38`) and add `Prisma` to the `@prisma/client` import.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest src/billing/monthly-payment-notice.service.spec.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Typecheck, lint, commit**

Run: `cd server && npm run typecheck && npx prettier --write src/billing/monthly-payment-notice.service.ts src/billing/monthly-payment-notice.service.spec.ts && npx eslint src/billing/monthly-payment-notice.service.ts src/billing/monthly-payment-notice.service.spec.ts`

```bash
git add server/src/billing/monthly-payment-notice.service.ts server/src/billing/monthly-payment-notice.service.spec.ts
git commit -m "feat(billing): queue the monthly bill and the 2nd-lesson reminder

Bills: every standing charge of the last three days not yet announced is
claimed (noticeQueuedAt) and queued in one transaction. Reminders: debtors
whose 2nd lesson of the month is tomorrow on the group's live calendar,
counted from their own first lesson.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The 19:50 cron and module wiring

**Files:**
- Create: `server/src/billing/monthly-payment-notice-cron.service.ts`
- Create: `server/src/billing/monthly-payment-notice-cron.service.spec.ts`
- Modify: `server/src/billing/billing.module.ts`

**Interfaces:**
- Consumes: `MonthlyPaymentNoticeService` (Task 6); `SettingsService.get(companyId, 'payment.monthlyNoticesEnabled')` (Task 5).
- Produces: `MonthlyPaymentNoticeCronService.run(now?: Date): Promise<void>`, scheduled `'50 19 * * *'` Asia/Tashkent.

- [ ] **Step 1: Write the failing test**

`server/src/billing/monthly-payment-notice-cron.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyPaymentNoticeCronService } from './monthly-payment-notice-cron.service';
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';

describe('MonthlyPaymentNoticeCronService', () => {
  const NOW = new Date('2026-10-01T14:50:00Z');
  let cron: MonthlyPaymentNoticeCronService;
  let notices: { queueChargeNotices: jest.Mock; queueReminders: jest.Mock };
  let settingsGet: jest.Mock;

  beforeEach(async () => {
    notices = {
      queueChargeNotices: jest.fn().mockResolvedValue(0),
      queueReminders: jest.fn().mockResolvedValue(0),
    };
    settingsGet = jest.fn().mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        MonthlyPaymentNoticeCronService,
        {
          provide: PrismaService,
          useValue: {
            company: {
              findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
            },
          },
        },
        { provide: MonthlyPaymentNoticeService, useValue: notices },
        { provide: SettingsService, useValue: { get: settingsGet } },
      ],
    }).compile();
    cron = module.get(MonthlyPaymentNoticeCronService);
  });

  it('runs at 19:50 Tashkent — before the 20:00 digest drains the queue', () => {
    expect(
      Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        MonthlyPaymentNoticeCronService.prototype.run,
      ),
    ).toEqual(
      expect.objectContaining({
        cronTime: '50 19 * * *',
        timeZone: 'Asia/Tashkent',
      }),
    );
  });

  it('queues bills and reminders for every company with the notices on', async () => {
    await cron.run(NOW);
    expect(settingsGet).toHaveBeenCalledWith(1, 'payment.monthlyNoticesEnabled');
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, true);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true);
    expect(notices.queueReminders).toHaveBeenCalledWith(1, NOW);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW);
  });

  it('with the notices off only marks the bills and sends no reminder', async () => {
    settingsGet.mockResolvedValue(false);
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(1, NOW, false);
    expect(notices.queueReminders).not.toHaveBeenCalled();
  });

  it('one company failing does not stop the next', async () => {
    notices.queueChargeNotices.mockRejectedValueOnce(new Error('db down'));
    await cron.run(NOW);
    expect(notices.queueChargeNotices).toHaveBeenCalledWith(2, NOW, true);
    expect(notices.queueReminders).toHaveBeenCalledWith(2, NOW);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/billing/monthly-payment-notice-cron.service.spec.ts`
Expected: FAIL — `Cannot find module './monthly-payment-notice-cron.service'`.

- [ ] **Step 3: Implement**

`server/src/billing/monthly-payment-notice-cron.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';

/**
 * Queues the monthly bill and the 2nd-lesson reminder (ADR-0042) at 19:50,
 * ten minutes before the personal digest (20:00) sends the queue. Runs every
 * day, Sundays and holidays included: the reminder belongs to the evening
 * before the lesson whatever day that is. `payment.monthlyNoticesEnabled`
 * (company-level) switches the messages off; the bills are still marked, so
 * switching back on sends no old bill.
 */
@Injectable()
export class MonthlyPaymentNoticeCronService {
  private readonly logger = new Logger(MonthlyPaymentNoticeCronService.name);

  constructor(
    private prisma: PrismaService,
    private notices: MonthlyPaymentNoticeService,
    private settingsService: SettingsService,
  ) {}

  @Cron('50 19 * * *', { timeZone: 'Asia/Tashkent' })
  async run(now: Date = new Date()): Promise<void> {
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });
    for (const company of companies) {
      try {
        const enabled = await this.settingsService.get(
          company.id,
          'payment.monthlyNoticesEnabled',
        );
        const bills = await this.notices.queueChargeNotices(
          company.id,
          now,
          enabled,
        );
        const reminders = enabled
          ? await this.notices.queueReminders(company.id, now)
          : 0;
        this.logger.log(
          `Company ${company.id}: ${bills} monthly bill(s), ${reminders} payment reminder(s) queued` +
            (enabled ? '' : ' — notices are switched off'),
        );
      } catch (error) {
        this.logger.error(
          `Company ${company.id}: monthly payment notices failed`,
          error,
        );
      }
    }
  }
}
```

In `server/src/billing/billing.module.ts` add the imports

```ts
import { MonthlyPaymentNoticeService } from './monthly-payment-notice.service';
import { MonthlyPaymentNoticeCronService } from './monthly-payment-notice-cron.service';
```

and append `MonthlyPaymentNoticeService, MonthlyPaymentNoticeCronService,` to `providers`. Add this sentence at the end of the module's doc comment: ``` `MonthlyPaymentNoticeCronService` (19:50) queues the month's bill and the 2nd-lesson reminder for the 20:00 Telegram digest (ADR-0042). ```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest src/billing/monthly-payment-notice-cron.service.spec.ts src/billing/monthly-payment-notice.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Boot check, typecheck, lint, commit**

Run: `cd server && npm run typecheck && npm run build`
Expected: exit 0 (Nest resolves the providers only at runtime; the build proves the imports).

Run: `cd server && npx prettier --write src/billing && npx eslint src/billing/monthly-payment-notice-cron.service.ts src/billing/monthly-payment-notice-cron.service.spec.ts src/billing/billing.module.ts`

```bash
git add server/src/billing/monthly-payment-notice-cron.service.ts server/src/billing/monthly-payment-notice-cron.service.spec.ts server/src/billing/billing.module.ts
git commit -m "feat(billing): 19:50 cron for the monthly payment notices

Per company: reads payment.monthlyNoticesEnabled, queues the bills (only
marks them when off) and the reminders, ten minutes before the 20:00
digest sends them. One company failing never stops the next.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The CEO's switch on the payment settings page

**Files:**
- Modify: `client/src/components/settings/payment-settings-client.tsx`
- Create: `client/src/components/settings/payment-settings-monthly-notices-guard.test.ts`

**Interfaces:**
- Consumes: `GET/PATCH /settings/payment` key `payment.monthlyNoticesEnabled` / field `monthlyNoticesEnabled` (Task 5).

- [ ] **Step 1: Write the failing guard test**

`client/src/components/settings/payment-settings-monthly-notices-guard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-text guard, like the debt write-off one: the client tests render no
// components, so this switch — the only way to stop the monthly payment
// messages without a deploy — could vanish with tsc, eslint, vitest and the
// build all green.
const SOURCE = readFileSync(
  join(__dirname, "payment-settings-client.tsx"),
  "utf-8",
);

describe("payment.monthlyNoticesEnabled sozlamasi UI'da", () => {
  it("PaymentSettingsValues kaliti e'lon qilingan", () => {
    expect(SOURCE).toContain('"payment.monthlyNoticesEnabled": boolean;');
  });

  it("Switch sozlama qiymatiga bog'langan va saveField orqali saqlanadi", () => {
    expect(SOURCE).toContain(
      'checked={settings["payment.monthlyNoticesEnabled"]}',
    );
    expect(SOURCE).toContain("saveField({ monthlyNoticesEnabled: checked })");
  });

  it("tugma FAQAT CEO uchun ochiq", () => {
    const row = SOURCE.slice(
      SOURCE.indexOf('checked={settings["payment.monthlyNoticesEnabled"]}'),
    ).slice(0, 300);
    expect(row).toContain("disabled={!isCeo || saving}");
  });

  it("CEO ko'radigan nom joyida", () => {
    expect(SOURCE).toContain("O&apos;quvchiga oylik to&apos;lov xabari");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run src/components/settings/payment-settings-monthly-notices-guard.test.ts`
Expected: FAIL — the strings are not in the source yet.

- [ ] **Step 3: Implement**

In `client/src/components/settings/payment-settings-client.tsx`:

1. Add to `interface PaymentSettingsValues`, after `"payment.debtWriteOffEnabled": boolean;`:

```tsx
  "payment.monthlyNoticesEnabled": boolean;
```

2. After the closing `</div>` of the «Qarz kechirishga ruxsat» block (the one whose comment ends with "`chargeDayOfMonth` bloki aynan shu naqshni ishlatadi."), before the closing `</div>` of the settings list, insert:

```tsx
        <Separator />

        {/* O'quvchiga oylik to'lov xabari (ADR-0042) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div className="pr-4">
              <p className="text-sm font-medium">
                O&apos;quvchiga oylik to&apos;lov xabari
              </p>
              <p className="text-xs text-muted-foreground">
                Yoqilgan bo&apos;lsa (standart holat) — oy hisobi yozilgan kuni
                o&apos;quvchiga Telegram orqali shu oy uchun qancha to&apos;lash
                kerakligi, hali to&apos;lamaganlarga esa oyning 2-darsidan bir
                kun oldin eslatma boradi. Ikkalasi ham soat 20:00 dagi kunlik
                xabar bilan birga keladi. O&apos;chirilsa — bu ikki xabar
                yuborilmaydi.
              </p>
            </div>
            <Switch
              checked={settings["payment.monthlyNoticesEnabled"]}
              disabled={!isCeo || saving}
              onCheckedChange={(checked) =>
                saveField({ monthlyNoticesEnabled: checked })
              }
            />
          </div>
          {!isCeo && canEdit && (
            <p className="text-xs text-muted-foreground">
              Bu qiymat filial bo&apos;yicha emas — butun kompaniya uchun bitta,
              shuning uchun faqat CEO o&apos;zgartira oladi.
            </p>
          )}
        </div>
```

- [ ] **Step 4: Run it to verify it passes, then the client gates**

Run: `cd client && npx vitest run src/components/settings && npx eslint src/components/settings/payment-settings-client.tsx src/components/settings/payment-settings-monthly-notices-guard.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no lint errors, tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/settings/payment-settings-client.tsx client/src/components/settings/payment-settings-monthly-notices-guard.test.ts
git commit -m "feat(settings): CEO switch for the monthly payment messages

Payment settings page: «O'quvchiga oylik to'lov xabari», CEO-only like the
other company-level switches.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ADR and docs

**Files:**
- Create: `docs/adr/0042-oylik-tolov-xabari.md`
- Modify: `docs/adr/README.md` (index row after 0041)
- Modify: `server/CLAUDE.md` (section «Telegram digest — one message a day at 20:00 (ADR-0025)»)

- [ ] **Step 1: Check the number is still free**

Run: `ls docs/adr | grep '^0042' ; git fetch origin main && git ls-tree --name-only origin/main docs/adr/ | grep '0042'`
Expected: no output. If 0042 is taken, use the next free number in the file name, the title and the three references in this task (and in the comments of Tasks 1, 4, 6, 7).

- [ ] **Step 2: Write the ADR**

`docs/adr/0042-oylik-tolov-xabari.md`:

```markdown
# ADR-0042 — Oylik to'lov xabari: hisob kuni va 2-dars eslatmasi (Telegram)

**Holati:** Qabul qilindi
**Sana:** 2026-09-27
**Bog'liq:** ADR-0025, `server/src/billing/monthly-payment-notice.service.ts`, `server/src/billing/monthly-payment-notice-cron.service.ts`, `server/src/telegram-digest/monthly-payment-text.ts`, `EnrollmentMonthlyCharge.noticeQueuedAt`, sozlama `payment.monthlyNoticesEnabled`

## Kontekst

01.09.2026 dan barcha kurslar oylik to'lovda. Shartnoma bo'yicha oylik to'lov
oyning 2-darsigacha qilinadi. O'quvchiga qarz haqida xabar beruvchi yagona yo'l
(`DEBT_CHARGE`) 12 talik paket davomatiga bog'langan va oylik kursda hech qachon
ishlamaydi: o'quvchi oyning to'lovi haqida hech narsa olmaydi. CEO 27.09.2026 da
ikki xabar matnini tasdiqladi (spec §A5).

## Qaror

1. Kunlik 20:00 jamlanmaga (ADR-0025) ikki yangi toifa: `MONTHLY_CHARGE` (oy
   hisobi) va `PAYMENT_REMINDER` (2-darsdan bir kun oldingi eslatma).
2. Navbatga yozuvchi — alohida cron, har kuni 19:50 (yakshanba va bayramda ham):
   - hisob: `noticeQueuedAt` bo'sh, `CHARGED`, oxirgi 3 kunda yozilgan har bir
     hisob bitta tranzaksiyada «egallanadi» (`noticeQueuedAt` yoziladi) va
     navbatga qo'yiladi — hisob necha marta yurmasin, bir marta e'lon qilinadi;
   - eslatma: qarzdor, ochiq yozilish, faol guruh, ertangi dars o'quvchining shu
     oydagi 2-darsi bo'lsa (o'z birinchi darsidan sanaladi, guruhning JONLI
     kalendari bo'yicha — hisobdan keyin bekor qilingan dars eslatmani suradi).
3. 20:00 da matn jonli ma'lumotdan yoziladi: qarz va «Jami to'lash kerak»
   balansdan; hisob bekor qilingan yoki o'quvchi guruhdan chiqqan/muzlagan
   bo'lsa hisob xabari ketmaydi; to'lagan o'quvchiga eslatma ketmaydi;
   eslatma faqat ertangi dars uchun.
4. Migratsiya mavjud hisoblarning hammasiga `noticeQueuedAt` yozadi: birinchi
   yurishda hech kimga boshlanib bo'lgan oy uchun hisob ketmaydi.
5. `payment.monthlyNoticesEnabled` (kompaniya darajasi, boshlang'ich yoqilgan)
   ikkala xabarni o'chiradi. O'chiq paytda hisoblar faqat belgilanadi — qayta
   yoqilganda eski hisoblar yuborilmaydi.

## Oqibatlar

- O'quvchi oy boshida qancha to'lashini va muddatini, to'lamasa — 2-darsdan bir
  kun oldin eslatma oladi. Telegram bog'lanmagan o'quvchiga hech narsa ketmaydi.
- 19:50 dan keyin yozilgan hisob (kechki qo'shilish) ertasi kuni e'lon qilinadi.
- 19:50 yurishi yiqilsa, hisoblar keyingi kuni ketadi (3 kun ichida); eslatma
  o'sha kun uchun yo'qoladi.

## Rad etilgan variantlar

- **Navbatni hisob tranzaksiyasi ichida yozish.** Pul yozuvi xabar yozuviga
  bog'lanib qolardi: xabar jadvalidagi xato oylik hisobni to'xtatardi.
- **Hisobdan keyin hodisa chiqarish.** Hisob yoziladigan to'rt yo'lning har
  biriga tranzaksiyadan keyingi hodisa qo'shish kerak edi; bittasi unutilsa
  xabar jimgina yo'qoladi.
- **Belgisiz, vaqt oynasi bo'yicha tanlash.** 19:50 da deploy yoki qayta ishga
  tushish o'sha kungi hamma hisob xabarini yo'qotardi.
```

- [ ] **Step 3: Index and server docs**

In `docs/adr/README.md`, after the `0041` row, add:

```markdown
| [0042](0042-oylik-tolov-xabari.md) | Oylik to'lov xabari: hisob kuni va 2-dars eslatmasi (Telegram) | Qabul qilindi | 2026-09-27 |
```

In `server/CLAUDE.md`, section «Telegram digest — one message a day at 20:00 (ADR-0025)», after the «**Personal**» bullet add:

```markdown
- **Monthly payment messages** (ADR-0042): `MonthlyPaymentNoticeCronService` queues them at 19:50, before the personal cron sends. `MONTHLY_CHARGE` — the month's bill, once per charge (`EnrollmentMonthlyCharge.noticeQueuedAt` is claimed in the same transaction as the queue write). `PAYMENT_REMINDER` — the evening before a debtor's 2nd lesson of the month, on the group's live calendar. At 20:00 the renderer takes the debt and the total from the live balance and drops a bill whose charge was reversed or whose student left or froze, and a reminder for a student who paid or for a day that is no longer tomorrow. Texts: `telegram-digest/monthly-payment-text.ts` (CEO-approved, do not reword). Switch: `payment.monthlyNoticesEnabled`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0042-oylik-tolov-xabari.md docs/adr/README.md server/CLAUDE.md
git commit -m "docs: ADR-0042 monthly payment messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification (no push, no deploy)

- [ ] **Step 1: Server gates**

Run: `cd server && npm run typecheck && npx eslint src && npx jest --runInBand`
Expected: typecheck exit 0; eslint reports 0 errors (warnings allowed); every suite passes. A suite that fails only under load: rerun it alone and record both runs.

- [ ] **Step 2: Client gates**

Run: `cd client && npx vitest run && npx eslint src && npm run build`
Expected: all green, 0 lint errors, build succeeds.

- [ ] **Step 3: Apply the migration to the DEV database only** (optional, for a local run; never production)

```bash
cd server
npx prisma db execute --file prisma/migrations/20260927200000_monthly_payment_notices/migration.sql
npx prisma migrate resolve --applied 20260927200000_monthly_payment_notices
```

Expected: both succeed against the database in `server/.env` (dev).

- [ ] **Step 4: Stop.** Report to the controller. Pushing, the PR, the production migration and the deploy each need the CEO's explicit permission.

## Deploy Notes

1. **Order:** production `prisma migrate deploy` (adds the enum values and the column, stamps existing charges) → server deploy → client deploy. New server code on the old schema fails every charge query; the migration on its own is harmless to the old code (a nullable column and two unused enum values).
2. **Timing:** to have the October bills go out on 01.10.2026 at 20:00, both server steps must be live before 19:50 on 01.10 (the October charges are written at 03:10 that day and stay eligible for three days).
3. **Switch-off:** Sozlamalar → To'lov → «O'quvchiga oylik to'lov xabari» (CEO). No deploy needed; bills written while off are never sent later.
4. **Watching the first run:** Railway logs at 19:50 — `Company <id>: N monthly bill(s), M payment reminder(s) queued`; at 20:00 — `Personal digest flush — …`.
