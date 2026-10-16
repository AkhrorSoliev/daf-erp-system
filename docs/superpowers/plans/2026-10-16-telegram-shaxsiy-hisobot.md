# Telegram shaxsiy hisobot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The CEO picks staff members on a new settings page; each gets the daily report in their private Telegram chat at their own time, for their own branches, sections and one of four layouts, and can ask for it any time from the bot's staff menu, with branch / «Barchasi» / «Yangilash» buttons under it.

**Architecture:** `TelegramGroupDailyReportService.build()` is split into `collect()` (all queries → a typed `DailyReportData`) and a pure `renderGroupMessage()` that prints today's 21:00 message byte for byte (guarded by a Jest snapshot taken BEFORE the split). A new `server/src/telegram-report/` module stores recipients (`TelegramReportRecipient`), renders the four personal layouts from `DailyReportData` (pure functions), sends them from a half-hourly cron and answers `tr:*` callbacks on the main bot through `TelegramService.useBeforeScenes`. A CEO-only settings page on the client edits the recipients.

**Tech Stack:** NestJS + Prisma 7 + Jest + Telegraf (server); Next.js + React Query 5 + Vitest + shadcn (client). One migration, no new dependency.

**Spec:** `docs/superpowers/specs/2026-10-16-telegram-shaxsiy-hisobot-design.md`

## Global Constraints

- Worktree root: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ceo-telegram-hisobot`. Every command runs inside it; never `cd` into the main checkout.
- Server tests: `cd server && npx jest <path>`. Typecheck: `npm run typecheck` AND `npm run build` (ts-jest is transpile-only). Lint: `npx eslint <files>`. Format: `npx prettier --write <touched server .ts files>` before every commit. **Never run prettier on `client/`.**
- Client checks: `cd client && npx tsc --noEmit -p . && npx vitest run <path>`.
- Commit messages: English, conventional (`feat(telegram-report): …`), ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI text and bot text: Uzbek, Latin script only, no English words on screen.
- Every route of the new controller: `@CeoOnly()`; none takes `@BranchScope()`; all six are listed `COMPANY_WIDE` in `branch-route-policy.ts` and get a `["CEO"]` row in `route-access.snapshot.json`.
- The 21:00 group message must not change by a single character (Task 1 snapshot).
- Numbers come only from `DailyReportData` (i.e. from `collect()`); no renderer computes a new figure.
- Send time: `"HH:MM"`, `:00` or `:30`, `07:00`–`23:30`, default `21:00`.
- Default sections for a new recipient: `STUDENTS, LESSONS, ACTIVE_STUDENTS, ALERTS`; default layout `BY_SECTION`; branches = the user's own (`mainBranch` ∪ `UserBranch`), or «Barcha filiallar» when the user holds the CEO role (role id 1).
- Allowed branches of a recipient = company branches with `deletedAt: null` and `status` in `ACTIVE`, `INACTIVE`, filtered by `branchIds` unless `allBranches`.

**Deliberate refinements of the spec (recorded in ADR-0095, Task 10):**

1. No change to `direct-send.guard.spec.ts`: the cron sends through `sendTelegramText` (`telegram-digest/telegram-send.ts`, already allowed) and the handler answers through `ctx.reply` / `ctx.editMessageText`. ADR-0095 still adds the report to ADR-0025's instant list.
2. The cron picks every active recipient whose `sendTime ≤ current slot` and who has not received today's report. A transient failure releases the claim, so the next half-hour retries; a server restart catches up.
3. `collect()` takes no `now` argument; it reads the clock exactly as `build()` does today.
4. Closed / archived branches are never offered (see «Allowed branches» above).
5. The debt ▲/▼ is printed only for a unit whose scope is one branch or the whole company (`branchIds === null` or length 1); for a subset «jami» the stored snapshot does not exist, so no arrow.

---

## File map

**Server — modified**
- `server/src/telegram-groups/telegram-group-daily-report.service.ts` — `build()` becomes `collect()` + render; exports `DailyReportData`, `IncomeAttribution`, `SalaryTopUp`.
- `server/src/telegram-groups/daily-report-group-message.ts` (new) — `renderGroupMessage(data)` + the label constants and line helpers moved out of the service.
- `server/src/telegram-groups/telegram-group-daily-report.snapshot.spec.ts` (new) + `__snapshots__/…snap` — the byte-for-byte guard.
- `server/src/telegram-groups/telegram-groups.module.ts` — export `TelegramGroupDailyReportService`.
- `server/prisma/schema.prisma`, `server/prisma/migrations/20261016150000_telegram_report_recipient/migration.sql` (new).
- `server/src/telegram/staff/staff-cabinet.ts` (+ spec) — «📊 Hisobot» row.
- `server/src/app.module.ts` — register `TelegramReportModule`.
- `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`.

**Server — new, `server/src/telegram-report/`**
- `report-clock.ts` — Tashkent `DD.MM` / `HH:MM`.
- `personal-report-metrics.ts` — the metric rows of the 8 sections, short money format.
- `personal-report-render.ts` — the four layouts.
- `report-keyboard.ts` — inline keyboard + callback parsing.
- `personal-report.service.ts` — allowed branches, compose, deliver.
- `telegram-report-recipients.service.ts` — CRUD + test send.
- `dto/telegram-report.dto.ts`, `telegram-report.controller.ts`.
- `personal-report.cron.ts`, `personal-report-telegram.handler.ts`.
- `telegram-report.module.ts`.
- one `*.spec.ts` beside each logic file.

**Client**
- `client/src/components/settings/telegram-report/telegram-report-api.ts`
- `client/src/components/settings/telegram-report/telegram-report-labels.ts` (+ `.test.ts`)
- `client/src/components/settings/telegram-report/telegram-report-settings-client.tsx`
- `client/src/components/settings/telegram-report/recipient-card.tsx`
- `client/src/app/(dashboard)/settings/telegram-report/page.tsx`
- `client/src/lib/settings-nav.ts` (+ test), `client/src/lib/breadcrumb-routes.ts`
- guide: `client/src/qollanma/kontent/hisobotlar/telegram-hisobot.mdx`, `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`

**Docs**
- `docs/adr/0095-shaxsiy-telegram-hisobot.md`, `docs/adr/README.md`, `server/CLAUDE.md`.

---

### Task 0: Worktree setup

- [ ] **Step 1: Install and generate**

```bash
cd server && npm install && npx prisma generate && cd ../client && npm install
```

- [ ] **Step 2: Baseline**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts src/telegram/staff`
Expected: PASS. If anything fails here, stop and report — it is not this plan's breakage.

---

### Task 1: Snapshot guard for the 21:00 message

**Files:**
- Create: `server/src/telegram-groups/telegram-group-daily-report.snapshot.spec.ts`

**Interfaces:**
- Consumes: the existing spec's fake builders. They are NOT exported, so this file copies `State`, `defaultState`, `makePrisma`, `makeSalary`, `DEBT_SPLIT` and `buildService` verbatim from `telegram-group-daily-report.service.spec.ts` lines 17–304 (copy, do not import — the original spec stays untouched).
- Produces: `__snapshots__/telegram-group-daily-report.snapshot.spec.ts.snap`, committed before Task 2.

- [ ] **Step 1: Write the test**

Below the copied helpers:

```ts
describe('21:00 message — byte-for-byte guard (telegram-report plan Task 1)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-08T16:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('company-wide, every section', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));
    expect((await service.build(1001, null)).message).toMatchSnapshot();
  });

  it('one branch: the scope line under the header', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state));
    expect((await service.build(1001, [2])).message).toMatchSnapshot();
  });

  it('a clean day: no flags, no advance, no prior snapshot', async () => {
    const state = {
      ...defaultState(),
      flags: [],
      yesterdaySnapshot: null,
      todayExpenses: 0,
      salaryTotals: null,
    };
    const service = await buildService(makePrisma(state), makeSalary(state));
    expect((await service.build(1001, null)).message).toMatchSnapshot();
  });

  it('canonical net profit fails: the honest cash line', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockRejectedValue(new Error('boom')),
    });
    expect((await service.build(1001, null)).message).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run it — it writes the snapshot**

Run: `cd server && npx jest src/telegram-groups/telegram-group-daily-report.snapshot.spec.ts --ci=false`
Expected: PASS, `4 snapshots written`. Open the `.snap` file and check each message starts with `📊 <b>` and contains `Bugungi moliya`.

- [ ] **Step 3: Commit (the guard lands before the refactor)**

```bash
cd server && npx prettier --write src/telegram-groups/telegram-group-daily-report.snapshot.spec.ts
git add src/telegram-groups/telegram-group-daily-report.snapshot.spec.ts src/telegram-groups/__snapshots__
git commit -m "test(telegram-groups): snapshot the 21:00 message before the split"
```

---

### Task 2: Split `build()` into `collect()` + `renderGroupMessage()`

**Files:**
- Create: `server/src/telegram-groups/daily-report-group-message.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts`
- Modify: `server/src/telegram-groups/telegram-groups.module.ts` (exports)
- Test: the existing `telegram-group-daily-report.service.spec.ts` (unchanged) + Task 1 snapshot

**Interfaces:**
- Produces (exported from `telegram-group-daily-report.service.ts`):

```ts
export interface IncomeAttribution {
  total: number;
  currentMonth: number;
  advance: number;
  lateTotal: number;
  late: Array<{ label: string; amount: number }>;
  lessonsValue: number;
  pct: number | null;
}

export interface SalaryTopUp {
  fullDeserved: number | null;
  covered: number;
  centerFunded: number;
  /** Net payable to non-teaching FIXED_MONTHLY staff this month (Σ staff netToPay). */
  staffNet: number;
}

/** Everything the 21:00 message prints, before any text is written. */
export interface DailyReportData {
  branchIds: ReportBranchIds;
  todayLabel: string; // tashkentDayRange().label
  todayDate: Date; // tashkentTodayDate()
  monthKey: string; // 'YYYY-MM'
  companyName: string; // raw, NOT escaped; 'Hisobot' when the company has no name
  scopeLabel: string | null; // branch names when branchIds !== null, else null
  todayIncome: number;
  todayIncomeCount: number;
  todayPaymentsByMethod: Array<{ method: string; _sum: { amount: number | null } }>;
  todaySpend: number;
  todayNet: number;
  todayNewStudents: number;
  departedToday: number;
  netMovement: number;
  newLeadsToday: number;
  convertedLeadsToday: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  attendancePct: number;
  attendanceDenom: number;
  lessonsToday: number;
  activeStudents: number;
  debtSplit: DebtSplit;
  yesterdaySnapshot: { totalDebt: number; debtorCount: number } | null;
  totalDebt: number;
  debtorCount: number;
  mtdIncome: number;
  mtdExpense: number;
  mtdAdvance: number;
  mtdCashNet: number;
  attribution: IncomeAttribution | null;
  canonicalNet: number | null;
  expectedValue: number | null;
  monthCharges: MonthCharges | null;
  salary: SalaryTopUp | null;
  taskLine: string | null;
  flags: string[];
  light: { emoji: string; subtitle: string };
}
```

- Service methods after the task:
  - `collect(companyId: number, branchIds: ReportBranchIds): Promise<DailyReportData>`
  - `build(companyId, branchIds): Promise<{ message: string; snapshot: DailySnapshotData }>` — unchanged signature, now `const d = await this.collect(...); return { message: renderGroupMessage(d), snapshot: { totalDebt: d.totalDebt, debtorCount: d.debtorCount, activeStudents: d.activeStudents, mtdIncome: d.mtdIncome } };`
- `daily-report-group-message.ts` exports `renderGroupMessage(d: DailyReportData): string`, `buildMethodLine(byMethod)` and `buildDebtDeltaSuffix(yesterday, totalDebt, debtorCount)`.

- [ ] **Step 1: Create `daily-report-group-message.ts`**

Move from the service, unchanged in body:
- the static arrays `WEEKDAYS_UZ`, `MONTHS_UZ`, `METHOD_LABELS`, `METHOD_ORDER` → module-level `const`s;
- `buildMethodLine` and `buildDebtDeltaSuffix` → exported functions (replace `TelegramGroupDailyReportService.METHOD_ORDER` etc. with the module constants);
- the whole «Compose message» block (current lines 476–671) → `export function renderGroupMessage(d: DailyReportData): string`, ending in `return lines.join('\n');`.

Inside `renderGroupMessage`, every local becomes `d.<field>` with the same name, except:
- `const companyName = escapeHtml(d.companyName);`
- the scope line becomes `if (d.scopeLabel !== null) lines.push(`<i>${escapeHtml(d.scopeLabel)}</i>`);` (the branch-name lookup moved into `collect`);
- `light` is `d.light`, `flags` is `d.flags`, `monthlyBilling` is `isMonthlyBillingMonth(d.monthKey)`, `dayNum` / `monthName` / `weekday` are derived from `d.todayDate` exactly as now.

Imports this file needs: `escapeHtml, formatNumber, formatSignedSum, formatSum` from `./utils/format.util`; `buildDebtSplitLines`, `buildIncomeSplitLines`, `buildMonthChargesLines` from `./utils/…`; `isMonthlyBillingMonth` from `../reports/month-charges`; `type DailyReportData` from `./telegram-group-daily-report.service`.

- [ ] **Step 2: Turn the rest of `build()` into `collect()`**

In the service:
1. Rename `build` to `collect` with return type `Promise<DailyReportData>`. Keep every query, the second `Promise.all`, the «Derive figures» block, `flags`, `debtGrowth`, `refundWriteOffToday`, `light` and the `logIncomeBasisDrift` call (move that call up, right after the second `Promise.all`).
2. Delete the compose block. Add before the return:
   `const scopeLabel = branchIds !== null ? await this.branchNames(companyId, branchIds) : null;`
3. Return the object literal with every field of `DailyReportData` (`todayLabel: today.label`, `companyName: company?.name ?? 'Hisobot'`).
4. Add the new `build()` from the Interfaces block above.
5. Delete the moved statics and the two moved helpers; turn `interface SalaryTopUp` at the file end into the exported one above; give `computeIncomeAttribution` the return type `Promise<IncomeAttribution | null>`.

- [ ] **Step 3: Export the service from the module**

In `telegram-groups.module.ts`, add `TelegramGroupDailyReportService` to `exports`.

- [ ] **Step 4: Run the guards**

Run: `cd server && npx jest src/telegram-groups`
Expected: PASS, including the 4 snapshots (`4 passed` under Snapshots, none written, none updated). A snapshot mismatch means the split changed a character — fix the code, never `-u`.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd server && npm run typecheck && npx prettier --write src/telegram-groups/daily-report-group-message.ts src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-groups.module.ts && npx eslint src/telegram-groups/daily-report-group-message.ts src/telegram-groups/telegram-group-daily-report.service.ts
git add src/telegram-groups
git commit -m "refactor(telegram-groups): split the daily report into collect and render"
```

---

### Task 3: `TelegramReportRecipient` model and migration

**Files:**
- Modify: `server/prisma/schema.prisma` (append at the end of the file)
- Create: `server/prisma/migrations/20261016150000_telegram_report_recipient/migration.sql`

**Interfaces:**
- Produces: Prisma client model `telegramReportRecipient`, enums `TelegramReportLayout`, `TelegramReportSection` (from `@prisma/client`).

- [ ] **Step 1: Schema**

```prisma
/// Who gets the personal daily report in their own Telegram chat (ADR-0095).
/// Settings, not a ledger row: removing a recipient deletes the row.
enum TelegramReportLayout {
  BY_SECTION
  TABLE
  BY_BRANCH
  TOTAL_ONLY
}

enum TelegramReportSection {
  TODAY_MONEY
  STUDENTS
  LESSONS
  ACTIVE_STUDENTS
  DEBT
  MONTH
  SALARY
  ALERTS
}

model TelegramReportRecipient {
  id           Int                     @id @default(autoincrement())
  companyId    Int
  userId       Int
  /// "HH:MM", :00 or :30, 07:00–23:30 (Tashkent).
  sendTime     String                  @default("21:00")
  layout       TelegramReportLayout    @default(BY_SECTION)
  /// true = every live branch, including branches opened later.
  allBranches  Boolean                 @default(false)
  branchIds    Int[]                   @default([])
  sections     TelegramReportSection[] @default([])
  isActive     Boolean                 @default(true)
  /// Tashkent day of the last automatic send (the cron's claim).
  lastSentDate DateTime?               @db.Date
  createdById  Int
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @updatedAt

  @@unique([companyId, userId])
  @@index([isActive, sendTime])
}
```

- [ ] **Step 2: Migration SQL**

```sql
-- Shaxsiy Telegram hisobot oluvchilari (ADR-0095).
DO $$
BEGIN
  CREATE TYPE "TelegramReportLayout" AS ENUM ('BY_SECTION', 'TABLE', 'BY_BRANCH', 'TOTAL_ONLY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TelegramReportSection" AS ENUM ('TODAY_MONEY', 'STUDENTS', 'LESSONS', 'ACTIVE_STUDENTS', 'DEBT', 'MONTH', 'SALARY', 'ALERTS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TelegramReportRecipient" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "sendTime" TEXT NOT NULL DEFAULT '21:00',
  "layout" "TelegramReportLayout" NOT NULL DEFAULT 'BY_SECTION',
  "allBranches" BOOLEAN NOT NULL DEFAULT false,
  "branchIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "sections" "TelegramReportSection"[] DEFAULT ARRAY[]::"TelegramReportSection"[],
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSentDate" DATE,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramReportRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramReportRecipient_companyId_userId_key"
  ON "TelegramReportRecipient"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "TelegramReportRecipient_isActive_sendTime_idx"
  ON "TelegramReportRecipient"("isActive", "sendTime");
```

- [ ] **Step 3: Validate and generate**

Run: `cd server && npx prisma validate && npx prisma generate`
Expected: both succeed. Do NOT run `prisma migrate dev` (it is broken here); production applies the file with `npm run db:migrate:deploy` at deploy time.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261016150000_telegram_report_recipient
git commit -m "feat(telegram-report): recipient table"
```

---

### Task 4: Pure rendering — clock, metrics, four layouts, keyboard

**Files:**
- Create: `server/src/telegram-report/report-clock.ts`
- Create: `server/src/telegram-report/personal-report-metrics.ts`
- Create: `server/src/telegram-report/personal-report-render.ts`
- Create: `server/src/telegram-report/report-keyboard.ts`
- Test: `server/src/telegram-report/personal-report-render.spec.ts`, `server/src/telegram-report/report-keyboard.spec.ts`

**Interfaces:**
- Consumes: `DailyReportData` (Task 2), Prisma enums (Task 3).
- Produces:
  - `tashkentClock(now: Date): { date: string; time: string }` — `'16.10'`, `'18:30'`.
  - `shortSum(n: number): string`, `formatMln(n: number): string`.
  - `METRICS: Metric[]`, `metricCell(m: Metric, d: DailyReportData): string | null`.
  - `renderPersonalReport(input: RenderInput): string` with `RenderInput = { layout: TelegramReportLayout; sections: TelegramReportSection[]; units: ReportUnit[]; total: DailyReportData | null; dateLabel: string; asOf: string }`, `ReportUnit = { label: string; data: DailyReportData }`.
  - `type ReportFocus = number | 'all'`, `reportKeyboard(branches: Array<{ id: number; name: string }>, focus: ReportFocus)`, `parseReportAction(data: string): ReportAction | null` with `ReportAction = { kind: 'open' } | { kind: 'focus'; focus: ReportFocus }`, and `REPORT_OPEN_ACTION = 'tr:open'`.

- [ ] **Step 1: Write the failing render tests**

`personal-report-render.spec.ts`:

```ts
import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import { renderPersonalReport, type ReportUnit } from './personal-report-render';
import { shortSum } from './personal-report-metrics';
import { tashkentClock } from './report-clock';

const nb = (s: string) => s.replace(/ /g, ' ');

function data(over: Partial<DailyReportData> = {}): DailyReportData {
  return {
    branchIds: [1],
    todayLabel: '16.10.2026',
    todayDate: new Date('2026-10-16T00:00:00Z'),
    monthKey: '2026-10',
    companyName: 'DaF',
    scopeLabel: null,
    todayIncome: 4_200_000,
    todayIncomeCount: 9,
    todayPaymentsByMethod: [],
    todaySpend: 300_000,
    todayNet: 3_900_000,
    todayNewStudents: 3,
    departedToday: 1,
    netMovement: 2,
    newLeadsToday: 5,
    convertedLeadsToday: 0,
    present: 90,
    late: 1,
    absent: 9,
    excused: 0,
    attendancePct: 91,
    attendanceDenom: 100,
    lessonsToday: 18,
    activeStudents: 420,
    debtSplit: {
      studying: { total: 27_700_000, count: 40, currentMonth: 20_000_000, currentMonthCount: 30, older: 7_700_000, olderCount: 10 },
      notStudying: { total: 3_000_000, count: 9, currentMonth: 0, byKind: { ungrouped: { total: 0, count: 0 }, frozen: { total: 3_000_000, count: 9 }, left: { total: 0, count: 0 } } },
    },
    yesterdaySnapshot: { totalDebt: 28_100_000, debtorCount: 41 },
    totalDebt: 27_700_000,
    debtorCount: 40,
    mtdIncome: 160_000_000,
    mtdExpense: 40_000_000,
    mtdAdvance: 0,
    mtdCashNet: 120_000_000,
    attribution: null,
    canonicalNet: 32_000_000,
    expectedValue: null,
    monthCharges: null,
    salary: null,
    taskLine: null,
    flags: ["• Qaytarilgan to'lov: <b>350 000 so'm</b> (1 ta)"],
    light: { emoji: '🟢', subtitle: 'Kun yakuni: yaxshi' },
    ...over,
  };
}

const farg: ReportUnit = { label: "Farg'ona", data: data({ branchIds: [1] }) };
const nam: ReportUnit = {
  label: 'Namangan',
  data: data({ branchIds: [2], todayIncome: 800_000, attendancePct: 88, totalDebt: 1_200_000, debtSplit: { ...data().debtSplit, studying: { ...data().debtSplit.studying, total: 1_200_000 } }, yesterdaySnapshot: null, flags: [] }),
};
const total = data({ branchIds: null, todayIncome: 5_000_000, attendancePct: 90 });
const base = { dateLabel: '16.10', asOf: '18:30' };

describe('shortSum', () => {
  it('mln with one decimal from 100 000, so\'m below', () => {
    expect(shortSum(4_200_000)).toBe('4,2 mln');
    expect(shortSum(150_000)).toBe('0,2 mln');
    expect(nb(shortSum(85_000))).toBe("85 000 so'm");
    expect(shortSum(-2_000_000)).toBe('-2,0 mln');
  });
});

describe('tashkentClock', () => {
  it('reads the Tashkent wall clock', () => {
    expect(tashkentClock(new Date('2026-10-16T13:30:00Z'))).toEqual({ date: '16.10', time: '18:30' });
  });
});

describe('renderPersonalReport', () => {
  it('BY_SECTION: one line per metric, branches inline, then jami', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'BY_SECTION', sections: ['TODAY_MONEY'], units: [farg, nam], total }));
    expect(text).toContain('📊 <b>16.10 — 18:30 holati</b>');
    expect(text).toContain("💰 Tushum: Farg'ona 4,2 mln · Namangan 0,8 mln · jami 5,0 mln");
  });

  it('BY_SECTION with one unit has no branch names', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'BY_SECTION', sections: ['LESSONS'], units: [farg], total: null }));
    expect(text).toContain('✅ Davomat: 91%');
    expect(text).not.toContain("Farg'ona");
  });

  it('prints the debt arrow only for a single-branch or company-wide unit', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'BY_SECTION', sections: ['DEBT'], units: [farg], total: null }));
    expect(text).toContain('📌 Qarz: 27,7 mln (▼0,4 mln)');
    const subset = data({ branchIds: [1, 2] });
    const t2 = nb(renderPersonalReport({ ...base, layout: 'TOTAL_ONLY', sections: ['DEBT'], units: [], total: subset }));
    expect(t2).toContain('📌 Qarz: 27,7 mln');
    expect(t2).not.toContain('▼');
  });

  it('TABLE: aligned <pre> block with a Jami column', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'TABLE', sections: ['TODAY_MONEY', 'LESSONS'], units: [farg, nam], total }));
    expect(text).toContain('<pre>');
    expect(text).toMatch(/Farg'ona\s+Namangan\s+Jami/);
    expect(text).toMatch(/Tushum\s+4,2\s+0,8\s+5,0/);
    expect(text).toMatch(/Davomat\s+91%\s+88%\s+90%/);
    expect(text).toContain("<i>Pul — mln so'm</i>");
  });

  it('BY_BRANCH: a block per branch, flags under their own branch', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'BY_BRANCH', sections: ['TODAY_MONEY', 'ALERTS'], units: [farg, nam], total }));
    expect(text).toContain("🏢 <b>Farg'ona</b>");
    expect(text).toContain('🏢 <b>Namangan</b>');
    expect(text).toContain('Σ <b>Jami</b>');
    expect(text.indexOf("Qaytarilgan to'lov")).toBeGreaterThan(text.indexOf("🏢 <b>Farg'ona</b>"));
  });

  it('TOTAL_ONLY reads the total alone', () => {
    const text = nb(renderPersonalReport({ ...base, layout: 'TOTAL_ONLY', sections: ['TODAY_MONEY'], units: [farg, nam], total }));
    expect(text).toContain('💰 Tushum: 5,0 mln');
    expect(text).not.toContain("Farg'ona");
  });

  it('hides a metric with no value and says so when nothing is left', () => {
    const empty = data({ lessonsToday: 0, attendanceDenom: 0 });
    const text = renderPersonalReport({ ...base, layout: 'BY_SECTION', sections: ['LESSONS'], units: [{ label: 'X', data: empty }], total: null });
    expect(text).toContain("Bugun ma'lumot yo'q");
  });

  it('escapes branch names', () => {
    const text = renderPersonalReport({ ...base, layout: 'BY_BRANCH', sections: ['TODAY_MONEY'], units: [{ label: 'A&B', data: data() }, nam], total });
    expect(text).toContain('A&amp;B');
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `cd server && npx jest src/telegram-report/personal-report-render.spec.ts`
Expected: FAIL, `Cannot find module './personal-report-render'`.

- [ ] **Step 3: `report-clock.ts`**

```ts
const FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Tashkent wall clock: `{ date: 'DD.MM', time: 'HH:MM' }`. */
export function tashkentClock(now: Date): { date: string; time: string } {
  const p = Object.fromEntries(FMT.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.day}.${p.month}`, time: `${p.hour}:${p.minute}` };
}
```

- [ ] **Step 4: `personal-report-metrics.ts`**

```ts
import type { TelegramReportSection } from '@prisma/client';
import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import { formatNumber, formatSum } from '../telegram-groups/utils/format.util';

/** One decimal of millions, Uzbek comma: 4 200 000 → «4,2». */
export function formatMln(n: number): string {
  return (Math.round(n / 100_000) / 10).toFixed(1).replace('.', ',');
}

/** «4,2 mln» from 100 000 so'm up, plain so'm below. */
export function shortSum(n: number): string {
  return Math.abs(n) >= 100_000 ? `${formatMln(n)} mln` : formatSum(n);
}

export interface Metric {
  section: TelegramReportSection;
  emoji: string;
  label: string;
  money: boolean;
  /** Carries the day-over-day debt arrow. */
  debtArrow?: boolean;
  value(d: DailyReportData): number | string | null;
}

/**
 * The personal report's rows. Every value is a field of `DailyReportData` —
 * the 21:00 report's own figures (ADR-0095); nothing is computed here.
 */
export const METRICS: Metric[] = [
  { section: 'TODAY_MONEY', emoji: '💰', label: 'Tushum', money: true, value: (d) => d.todayIncome },
  { section: 'TODAY_MONEY', emoji: '💸', label: 'Xarajat', money: true, value: (d) => d.todaySpend },
  { section: 'STUDENTS', emoji: '👥', label: 'Yangi/ketdi', money: false, value: (d) => `+${d.todayNewStudents}/−${d.departedToday}` },
  { section: 'STUDENTS', emoji: '📥', label: 'Yangi lid', money: false, value: (d) => d.newLeadsToday },
  { section: 'LESSONS', emoji: '🎓', label: 'Dars', money: false, value: (d) => (d.lessonsToday > 0 ? d.lessonsToday : null) },
  { section: 'LESSONS', emoji: '✅', label: 'Davomat', money: false, value: (d) => (d.attendanceDenom > 0 ? `${d.attendancePct}%` : null) },
  { section: 'ACTIVE_STUDENTS', emoji: '👤', label: "Faol o'quvchi", money: false, value: (d) => d.activeStudents },
  { section: 'DEBT', emoji: '📌', label: 'Qarz', money: true, debtArrow: true, value: (d) => d.debtSplit.studying.total },
  { section: 'DEBT', emoji: '📎', label: "Qarz (o'qimaydi)", money: true, value: (d) => d.debtSplit.notStudying.total },
  { section: 'MONTH', emoji: '📅', label: 'Oy tushumi', money: true, value: (d) => d.attribution?.total ?? d.mtdIncome },
  { section: 'MONTH', emoji: '🧾', label: 'Oy xarajati', money: true, value: (d) => d.mtdExpense },
  { section: 'MONTH', emoji: '📈', label: 'Sof foyda', money: true, value: (d) => d.canonicalNet },
  { section: 'MONTH', emoji: '⏳', label: 'Oy qoldi', money: true, value: (d) => d.monthCharges?.unpaid ?? null },
  { section: 'SALARY', emoji: '💵', label: 'Ustoz oyligi', money: true, value: (d) => d.salary?.fullDeserved ?? null },
  { section: 'SALARY', emoji: '🏛', label: 'Markaz', money: true, value: (d) => (d.salary && d.salary.fullDeserved !== null ? d.salary.centerFunded : null) },
];

/** The ▲/▼ is only true where a stored snapshot of the same scope exists. */
function debtArrow(d: DailyReportData): string | null {
  const oneScope = d.branchIds === null || d.branchIds.length === 1;
  if (!oneScope || !d.yesterdaySnapshot) return null;
  const delta = d.totalDebt - d.yesterdaySnapshot.totalDebt;
  if (delta === 0) return null;
  return `${delta > 0 ? '▲' : '▼'}${shortSum(Math.abs(delta))}`;
}

/** Text form of one metric for one scope; null hides it. */
export function metricCell(m: Metric, d: DailyReportData): string | null {
  const v = m.value(d);
  if (v === null) return null;
  const text = typeof v === 'string' ? v : m.money ? shortSum(v) : formatNumber(v);
  const arrow = m.debtArrow ? debtArrow(d) : null;
  return arrow ? `${text} (${arrow})` : text;
}

/** Table form: money in millions without a unit (the table says «mln so'm»). */
export function tableCell(m: Metric, d: DailyReportData): string | null {
  const v = m.value(d);
  if (v === null) return null;
  return typeof v === 'string' ? v : m.money ? formatMln(v) : formatNumber(v);
}
```

- [ ] **Step 5: `personal-report-render.ts`**

```ts
import type { TelegramReportLayout, TelegramReportSection } from '@prisma/client';
import type { DailyReportData } from '../telegram-groups/telegram-group-daily-report.service';
import { escapeHtml } from '../telegram-groups/utils/format.util';
import { METRICS, metricCell, tableCell, type Metric } from './personal-report-metrics';

export interface ReportUnit {
  label: string;
  data: DailyReportData;
}

export interface RenderInput {
  layout: TelegramReportLayout;
  sections: TelegramReportSection[];
  /** One per branch; empty for TOTAL_ONLY with several branches. */
  units: ReportUnit[];
  /** The scope of every shown branch together; null when only one branch shows. */
  total: DailyReportData | null;
  dateLabel: string;
  asOf: string;
}

const TELEGRAM_LIMIT = 4096;
const LABEL_WIDTH = 9;

const short = (label: string) =>
  label.length > LABEL_WIDTH ? `${label.slice(0, LABEL_WIDTH - 1)}…` : label;

function bySection(i: RenderInput, metrics: Metric[]): string[] {
  const single = i.units.length === 1 && !i.total;
  const out: string[] = [];
  for (const m of metrics) {
    if (single) {
      const v = metricCell(m, i.units[0].data);
      if (v !== null) out.push(`${m.emoji} ${m.label}: ${v}`);
      continue;
    }
    const parts = i.units
      .map((u) => [escapeHtml(u.label), metricCell(m, u.data)] as const)
      .filter(([, v]) => v !== null)
      .map(([label, v]) => `${label} ${v}`);
    const t = i.total ? metricCell(m, i.total) : null;
    if (t !== null) parts.push(`jami ${t}`);
    if (parts.length) out.push(`${m.emoji} ${m.label}: ${parts.join(' · ')}`);
  }
  return out;
}

function table(i: RenderInput, metrics: Metric[]): string[] {
  const cols = [...i.units.map((u) => short(u.label)), ...(i.total ? ['Jami'] : [])];
  const datas = [...i.units.map((u) => u.data), ...(i.total ? [i.total] : [])];
  const rows = metrics
    .map((m) => [m.label, ...datas.map((d) => tableCell(m, d) ?? '—')])
    .filter((r) => r.slice(1).some((c) => c !== '—'));
  if (!rows.length) return [];
  const w0 = Math.max(...rows.map((r) => r[0].length));
  const w = cols.map((c, j) => Math.max(c.length, ...rows.map((r) => r[j + 1].length)));
  const line = (first: string, cells: string[]) =>
    first.padEnd(w0) + cells.map((c, j) => `  ${c.padStart(w[j])}`).join('');
  const block = [line('', cols), ...rows.map((r) => line(r[0], r.slice(1)))].join('\n');
  return [`<pre>${escapeHtml(block)}</pre>`, "<i>Pul — mln so'm</i>"];
}

function unitLine(metrics: Metric[], d: DailyReportData): string {
  return metrics
    .map((m) => {
      const v = metricCell(m, d);
      return v === null ? null : `${m.emoji} ${m.label} ${v}`;
    })
    .filter((x): x is string => x !== null)
    .join(' · ');
}

function byBranch(i: RenderInput, metrics: Metric[], alerts: boolean): string[] {
  const out: string[] = [];
  for (const u of i.units) {
    const l = unitLine(metrics, u.data);
    const flags = alerts ? u.data.flags : [];
    if (!l && !flags.length) continue;
    out.push(`🏢 <b>${escapeHtml(u.label)}</b>`);
    if (l) out.push(l);
    if (flags.length) out.push('🚩 Diqqat', ...flags);
  }
  if (i.total) {
    const l = unitLine(metrics, i.total);
    if (l) out.push('Σ <b>Jami</b>', l);
  }
  return out;
}

function totalOnly(i: RenderInput, metrics: Metric[]): string[] {
  const d = i.total ?? i.units[0]?.data;
  if (!d) return [];
  return metrics
    .map((m) => {
      const v = metricCell(m, d);
      return v === null ? null : `${m.emoji} ${m.label}: ${v}`;
    })
    .filter((x): x is string => x !== null);
}

/** Flags under the report for every layout but BY_BRANCH (which places them per branch). */
function alertLines(i: RenderInput): string[] {
  const d = i.total ?? i.units[0]?.data;
  if (!d || !d.flags.length) return [];
  return ['', '🚩 <b>Diqqat</b>', ...d.flags];
}

/** A personal report (ADR-0095). Pure: same input, same text. */
export function renderPersonalReport(i: RenderInput): string {
  const metrics = METRICS.filter((m) => i.sections.includes(m.section));
  const wantsAlerts = i.sections.includes('ALERTS');
  let body: string[];
  if (i.layout === 'TABLE') body = table(i, metrics);
  else if (i.layout === 'BY_BRANCH' && i.units.length > 1) body = byBranch(i, metrics, wantsAlerts);
  else if (i.layout === 'TOTAL_ONLY') body = totalOnly(i, metrics);
  else body = bySection(i, metrics);
  const alerts = wantsAlerts && !(i.layout === 'BY_BRANCH' && i.units.length > 1) ? alertLines(i) : [];
  const lines = [`📊 <b>${i.dateLabel} — ${i.asOf} holati</b>`, ...body, ...alerts];
  if (!body.length && !alerts.length) lines.push("Bugun ma'lumot yo'q");
  const text = lines.join('\n');
  if (text.length <= TELEGRAM_LIMIT) return text;
  // ponytail: cut at a line break; a <pre> table this long would need paging.
  const cut = text.lastIndexOf('\n', TELEGRAM_LIMIT - 2);
  return `${text.slice(0, cut)}\n…`;
}
```

- [ ] **Step 6: Run render tests**

Run: `cd server && npx jest src/telegram-report/personal-report-render.spec.ts`
Expected: PASS. Adjust only the renderer, never an expectation that encodes the spec examples.

- [ ] **Step 7: Keyboard — failing test**

`report-keyboard.spec.ts`:

```ts
import { parseReportAction, reportKeyboard } from './report-keyboard';

const rows = (k: ReturnType<typeof reportKeyboard>) =>
  k.reply_markup.inline_keyboard.map((r) =>
    r.map((b) => ('callback_data' in b ? `${b.text}|${b.callback_data}` : b.text)),
  );

describe('reportKeyboard', () => {
  it('branch buttons, «Barchasi» and «Yangilash» for several branches', () => {
    const k = reportKeyboard([{ id: 1, name: "Farg'ona" }, { id: 2, name: 'Namangan' }], 'all');
    expect(rows(k)).toEqual([
      ["Farg'ona|tr:b:1", 'Namangan|tr:b:2', '• 🌐 Barchasi|tr:all'],
      ['🔄 Yangilash|tr:r:all'],
    ]);
  });

  it('marks the focused branch and refreshes it', () => {
    const k = reportKeyboard([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], 2);
    expect(rows(k)[0][1]).toBe('• B|tr:b:2');
    expect(rows(k)[1]).toEqual(['🔄 Yangilash|tr:r:2']);
  });

  it('one branch: only «Yangilash»', () => {
    expect(rows(reportKeyboard([{ id: 1, name: 'A' }], 'all'))).toEqual([['🔄 Yangilash|tr:r:all']]);
  });

  it('wraps branch buttons three to a row', () => {
    const k = reportKeyboard([1, 2, 3, 4].map((id) => ({ id, name: `F${id}` })), 'all');
    expect(rows(k)[0]).toHaveLength(3);
    expect(rows(k)[1]).toHaveLength(2);
  });
});

describe('parseReportAction', () => {
  it.each([
    ['tr:open', { kind: 'open' }],
    ['tr:all', { kind: 'focus', focus: 'all' }],
    ['tr:b:7', { kind: 'focus', focus: 7 }],
    ['tr:r:all', { kind: 'focus', focus: 'all' }],
    ['tr:r:12', { kind: 'focus', focus: 12 }],
  ])('%s', (data, want) => expect(parseReportAction(data)).toEqual(want));

  it.each(['tr:b:x', 'tr:b:', 'tr:b:1.5', 'tk:list', 'tr:zzz', 'tr:b:9999999999'])('rejects %s', (d) =>
    expect(parseReportAction(d)).toBeNull(),
  );
});
```

Run: `cd server && npx jest src/telegram-report/report-keyboard.spec.ts` → FAIL (module missing).

- [ ] **Step 8: `report-keyboard.ts`**

```ts
import { Markup } from 'telegraf';

export type ReportFocus = number | 'all';
export type ReportAction = { kind: 'open' } | { kind: 'focus'; focus: ReportFocus };

/** The staff menu's «📊 Hisobot» button. */
export const REPORT_OPEN_ACTION = 'tr:open';

const ID = /^\d{1,9}$/;

/** Buttons under a personal report (ADR-0095); ≤ 64-byte callback data. */
export function reportKeyboard(
  branches: Array<{ id: number; name: string }>,
  focus: ReportFocus,
) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  if (branches.length > 1) {
    const buttons = [
      ...branches.map((b) =>
        Markup.button.callback(b.id === focus ? `• ${b.name}` : b.name, `tr:b:${b.id}`),
      ),
      Markup.button.callback(focus === 'all' ? '• 🌐 Barchasi' : '🌐 Barchasi', 'tr:all'),
    ];
    for (let k = 0; k < buttons.length; k += 3) rows.push(buttons.slice(k, k + 3));
  }
  rows.push([Markup.button.callback('🔄 Yangilash', `tr:r:${focus}`)]);
  return Markup.inlineKeyboard(rows);
}

export function parseReportAction(data: string): ReportAction | null {
  if (data === REPORT_OPEN_ACTION) return { kind: 'open' };
  if (data === 'tr:all' || data === 'tr:r:all') return { kind: 'focus', focus: 'all' };
  const m = /^tr:(?:b|r):(.+)$/.exec(data);
  return m && ID.test(m[1]) ? { kind: 'focus', focus: Number(m[1]) } : null;
}
```

- [ ] **Step 9: Run, format, commit**

```bash
cd server && npx jest src/telegram-report && npx prettier --write src/telegram-report && npx eslint src/telegram-report
git add src/telegram-report
git commit -m "feat(telegram-report): four personal layouts and the report keyboard"
```
Expected: all `src/telegram-report` specs PASS.

---

### Task 5: `PersonalReportService` — allowed branches, compose, deliver

**Files:**
- Create: `server/src/telegram-report/personal-report.service.ts`
- Test: `server/src/telegram-report/personal-report.service.spec.ts`

**Interfaces:**
- Consumes: `TelegramGroupDailyReportService.collect` (Task 2), `renderPersonalReport`, `reportKeyboard`, `tashkentClock` (Task 4), `staffChatOf(prisma, userId)` from `../tasks/telegram/task-telegram-view` (returns `{ chatId, roleIds } | null`), `sendTelegramText`, `TelegramTextSender` from `../telegram-digest/telegram-send`, `TelegramService.getBot()`.
- Produces:

```ts
export type RecipientLike = Pick<
  TelegramReportRecipient,
  'companyId' | 'userId' | 'layout' | 'sections' | 'allBranches' | 'branchIds'
>;
export type ReportCache = Map<string, Promise<DailyReportData>>;
export type DeliverResult =
  | { ok: true }
  | { ok: false; reason: 'NO_CHAT' | 'NO_BRANCH' | 'NO_BOT' }
  | { ok: false; reason: 'SEND_FAILED'; kind: TelegramFailureKind; description: string };

class PersonalReportService {
  allowedBranches(r: Pick<RecipientLike, 'companyId' | 'allBranches' | 'branchIds'>): Promise<Array<{ id: number; name: string }>>;
  compose(r: RecipientLike, focus: ReportFocus, cache?: ReportCache, now?: Date): Promise<{ text: string; keyboard: ReturnType<typeof reportKeyboard> } | null>;
  deliver(r: RecipientLike, cache?: ReportCache, now?: Date): Promise<DeliverResult>;
}
```

- [ ] **Step 1: Failing spec**

```ts
import { PersonalReportService } from './personal-report.service';

jest.mock('../tasks/telegram/task-telegram-view', () => ({ staffChatOf: jest.fn() }));
import { staffChatOf } from '../tasks/telegram/task-telegram-view';

const BRANCHES = [{ id: 1, name: "Farg'ona" }, { id: 2, name: 'Namangan' }];

function setup(opts: { branches?: typeof BRANCHES; bot?: unknown } = {}) {
  const prisma = { branch: { findMany: jest.fn().mockResolvedValue(opts.branches ?? BRANCHES) } };
  const collect = jest.fn(async (_c: number, ids: number[] | null) => ({
    branchIds: ids, flags: [], todayIncome: ids === null ? 5_000_000 : ids[0] === 1 ? 4_200_000 : 800_000,
    yesterdaySnapshot: null,
  }));
  const sendMessage = jest.fn().mockResolvedValue({ message_id: 9 });
  const bot = opts.bot === undefined ? { telegram: { sendMessage } } : opts.bot;
  const svc = new PersonalReportService(prisma as never, { collect } as never, { getBot: () => bot } as never);
  return { svc, prisma, collect, sendMessage };
}

const rec = { companyId: 1, userId: 50, layout: 'BY_SECTION', sections: ['TODAY_MONEY'], allBranches: true, branchIds: [] } as const;
const NOW = new Date('2026-10-16T13:30:00Z');

describe('PersonalReportService', () => {
  beforeEach(() => jest.mocked(staffChatOf).mockReset());

  it('allowed branches: live, active or paused, filtered unless all', async () => {
    const { svc, prisma } = setup();
    await svc.allowedBranches({ companyId: 1, allBranches: false, branchIds: [2] });
    expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 1, deletedAt: null, status: { in: ['ACTIVE', 'INACTIVE'] }, id: { in: [2] } },
    }));
  });

  it('all branches: one collect per branch plus a company-wide total', async () => {
    const { svc, collect } = setup();
    const out = await svc.compose(rec as never, 'all', new Map(), NOW);
    expect(collect.mock.calls.map((c) => c[1])).toEqual(expect.arrayContaining([null, [1], [2]]));
    expect(out!.text).toContain('📊 <b>16.10 — 18:30 holati</b>');
  });

  it('a chosen subset totals over the subset, not the company', async () => {
    const { svc, collect } = setup();
    await svc.compose({ ...rec, allBranches: false, branchIds: [1, 2] } as never, 'all', new Map(), NOW);
    expect(collect.mock.calls.map((c) => c[1])).toContainEqual([1, 2]);
    expect(collect.mock.calls.map((c) => c[1])).not.toContainEqual(null);
  });

  it('TOTAL_ONLY does not collect per branch', async () => {
    const { svc, collect } = setup();
    await svc.compose({ ...rec, layout: 'TOTAL_ONLY' } as never, 'all', new Map(), NOW);
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('a focused branch shows that branch alone', async () => {
    const { svc, collect } = setup();
    await svc.compose(rec as never, 2, new Map(), NOW);
    expect(collect.mock.calls.map((c) => c[1])).toEqual([[2]]);
  });

  it('refuses a branch outside the allowed list', async () => {
    const { svc } = setup();
    expect(await svc.compose(rec as never, 99, new Map(), NOW)).toBeNull();
  });

  it('shares one collect per scope through the cache', async () => {
    const { svc, collect } = setup();
    const cache = new Map();
    await svc.compose(rec as never, 'all', cache, NOW);
    await svc.compose(rec as never, 'all', cache, NOW);
    expect(collect).toHaveBeenCalledTimes(3);
  });

  it('deliver: no linked chat', async () => {
    jest.mocked(staffChatOf).mockResolvedValue(null);
    expect(await setup().svc.deliver(rec as never)).toEqual({ ok: false, reason: 'NO_CHAT' });
  });

  it('deliver: no branch', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ branches: [] }).svc.deliver(rec as never)).toEqual({ ok: false, reason: 'NO_BRANCH' });
  });

  it('deliver: sends HTML with the keyboard to the staff chat', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const { svc, sendMessage } = setup();
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual({ ok: true });
    expect(sendMessage).toHaveBeenCalledWith('777', expect.stringContaining('holati'),
      expect.objectContaining({ parse_mode: 'HTML', reply_markup: expect.any(Object) }));
  });

  it('deliver: a refused send reports its kind', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    const err = Object.assign(new Error('Forbidden: bot was blocked by the user'), {
      response: { error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    });
    const { svc, sendMessage } = setup();
    sendMessage.mockRejectedValue(err);
    expect(await svc.deliver(rec as never, new Map(), NOW)).toEqual(
      expect.objectContaining({ ok: false, reason: 'SEND_FAILED', kind: 'permanent' }),
    );
  });

  it('deliver: no bot', async () => {
    jest.mocked(staffChatOf).mockResolvedValue({ chatId: '777', roleIds: [1] });
    expect(await setup({ bot: null }).svc.deliver(rec as never)).toEqual({ ok: false, reason: 'NO_BOT' });
  });
});
```

Run: `cd server && npx jest src/telegram-report/personal-report.service.spec.ts` → FAIL (module missing).

- [ ] **Step 2: Implement**

```ts
import { Injectable } from '@nestjs/common';
import type { TelegramReportRecipient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  TelegramGroupDailyReportService,
  type DailyReportData,
} from '../telegram-groups/telegram-group-daily-report.service';
import { staffChatOf } from '../tasks/telegram/task-telegram-view';
import {
  sendTelegramText,
  type TelegramFailureKind,
  type TelegramTextSender,
} from '../telegram-digest/telegram-send';
import { renderPersonalReport, type ReportUnit } from './personal-report-render';
import { reportKeyboard, type ReportFocus } from './report-keyboard';
import { tashkentClock } from './report-clock';

export type RecipientLike = Pick<
  TelegramReportRecipient,
  'companyId' | 'userId' | 'layout' | 'sections' | 'allBranches' | 'branchIds'
>;
export type ReportCache = Map<string, Promise<DailyReportData>>;
export type DeliverResult =
  | { ok: true }
  | { ok: false; reason: 'NO_CHAT' | 'NO_BRANCH' | 'NO_BOT' }
  | { ok: false; reason: 'SEND_FAILED'; kind: TelegramFailureKind; description: string };

/**
 * The personal daily report (ADR-0095). Figures come only from
 * `TelegramGroupDailyReportService.collect` — the 21:00 report's own source.
 */
@Injectable()
export class PersonalReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly daily: TelegramGroupDailyReportService,
    private readonly telegram: TelegramService,
  ) {}

  allowedBranches(r: Pick<RecipientLike, 'companyId' | 'allBranches' | 'branchIds'>) {
    return this.prisma.branch.findMany({
      where: {
        companyId: r.companyId,
        deletedAt: null,
        status: { in: ['ACTIVE', 'INACTIVE'] },
        ...(r.allBranches ? {} : { id: { in: r.branchIds } }),
      },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  async compose(r: RecipientLike, focus: ReportFocus, cache: ReportCache = new Map(), now = new Date()) {
    const branches = await this.allowedBranches(r);
    if (!branches.length) return null;
    const load = (ids: number[] | null) => {
      const key = `${r.companyId}:${ids ? ids.join(',') : 'all'}`;
      let p = cache.get(key);
      if (!p) {
        p = this.daily.collect(r.companyId, ids);
        cache.set(key, p);
      }
      return p;
    };
    const unitOf = async (b: { id: number; name: string }): Promise<ReportUnit> => ({
      label: b.name,
      data: await load([b.id]),
    });

    let units: ReportUnit[];
    let total: DailyReportData | null = null;
    if (focus !== 'all') {
      const b = branches.find((x) => x.id === focus);
      if (!b) return null;
      units = [await unitOf(b)];
    } else if (branches.length === 1) {
      units = [await unitOf(branches[0])];
    } else {
      // «Barcha filiallar» is the company-wide scope the 21:00 report uses.
      total = await load(r.allBranches ? null : branches.map((b) => b.id));
      units = r.layout === 'TOTAL_ONLY' ? [] : await Promise.all(branches.map(unitOf));
    }

    const clock = tashkentClock(now);
    const text = renderPersonalReport({
      layout: r.layout,
      sections: r.sections,
      units,
      total,
      dateLabel: clock.date,
      asOf: clock.time,
    });
    return { text, keyboard: reportKeyboard(branches, focus) };
  }

  async deliver(r: RecipientLike, cache: ReportCache = new Map(), now = new Date()): Promise<DeliverResult> {
    const chat = await staffChatOf(this.prisma, r.userId);
    if (!chat) return { ok: false, reason: 'NO_CHAT' };
    const bot = this.telegram.getBot() as unknown as TelegramTextSender | null | undefined;
    if (!bot) return { ok: false, reason: 'NO_BOT' };
    const report = await this.compose(r, 'all', cache, now);
    if (!report) return { ok: false, reason: 'NO_BRANCH' };
    const out = await sendTelegramText(bot, chat.chatId, report.text, {
      parse_mode: 'HTML',
      ...report.keyboard,
    });
    return out.ok
      ? { ok: true }
      : { ok: false, reason: 'SEND_FAILED', kind: out.kind, description: out.description };
  }
}
```

Note: `deliver` checks the bot before composing, so the `NO_BOT` test passes without a `collect`. The test file builds the service with three positional args (prisma, daily, telegram) — keep that constructor order.

- [ ] **Step 3: Run, format, commit**

```bash
cd server && npx jest src/telegram-report && npx prettier --write src/telegram-report && npx eslint src/telegram-report
git add src/telegram-report
git commit -m "feat(telegram-report): compose and deliver a personal report"
```

---

### Task 6: Recipients API (service, DTOs, controller, module, route manifest)

**Files:**
- Create: `server/src/telegram-report/dto/telegram-report.dto.ts`
- Create: `server/src/telegram-report/telegram-report-recipients.service.ts` (+ `.spec.ts`)
- Create: `server/src/telegram-report/telegram-report.controller.ts` (+ `.spec.ts`)
- Create: `server/src/telegram-report/telegram-report.module.ts`
- Modify: `server/src/app.module.ts` (import + `TelegramReportModule` in `imports`, next to `LessonRatingsModule`)
- Modify: `server/src/common/auth/branch-route-policy.ts`, `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `PersonalReportService` (Task 5), `staffChatOf`, `signInStaffWhere` (`../common/auth/staff-telegram`), `EntityHistoryService` (`../common/entity-history`).
- Produces (JSON shapes the client reads in Task 9):

```ts
export interface RecipientView {
  id: number;
  userId: number;
  name: string;            // "Ism Familiya"
  position: string | null;
  sendTime: string;
  layout: TelegramReportLayout;
  allBranches: boolean;
  branchIds: number[];
  sections: TelegramReportSection[];
  isActive: boolean;
  lastSentDate: string | null; // 'YYYY-MM-DD'
  telegramLinked: boolean;
  noBranch: boolean;       // allowed branches resolve to none
}
// GET /telegram-report/recipients → { recipients: RecipientView[]; branches: { id; name }[] }
// GET /telegram-report/candidates → { id; name; position }[]
// POST /telegram-report/recipients { userId } → RecipientView
// PATCH /telegram-report/recipients/:id UpdateRecipientDto → RecipientView
// DELETE /telegram-report/recipients/:id → { message }
// POST /telegram-report/recipients/:id/test → { sent: true }
```

- [ ] **Step 1: DTOs**

```ts
import { TelegramReportLayout, TelegramReportSection } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
} from 'class-validator';

export const SEND_TIME = /^(0[7-9]|1\d|2[0-3]):(00|30)$/;

export class CreateRecipientDto {
  @Type(() => Number)
  @IsInt()
  userId!: number;
}

export class UpdateRecipientDto {
  @IsOptional()
  @Matches(SEND_TIME, { message: "Vaqt 07:00–23:30 oralig'ida, yarim soat qadam bilan" })
  sendTime?: string;

  @IsOptional()
  @IsEnum(TelegramReportLayout)
  layout?: TelegramReportLayout;

  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  branchIds?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: "Kamida bitta bo'lim tanlang" })
  @IsEnum(TelegramReportSection, { each: true })
  sections?: TelegramReportSection[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: Service spec (failing)**

```ts
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';

jest.mock('../tasks/telegram/task-telegram-view', () => ({ staffChatOf: jest.fn().mockResolvedValue({ chatId: '1', roleIds: [3] }) }));

const ROW = {
  id: 7, companyId: 1, userId: 50, sendTime: '21:00', layout: 'BY_SECTION', allBranches: false,
  branchIds: [2], sections: ['STUDENTS'], isActive: true, lastSentDate: null, createdById: 1,
  createdAt: new Date(), updatedAt: new Date(),
};

function setup() {
  const prisma = {
    telegramReportRecipient: {
      findMany: jest.fn().mockResolvedValue([ROW]),
      findFirst: jest.fn().mockResolvedValue(ROW),
      create: jest.fn(async ({ data }) => ({ ...ROW, ...data, id: 8 })),
      update: jest.fn(async ({ data }) => ({ ...ROW, ...data })),
      delete: jest.fn().mockResolvedValue(ROW),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ mainBranch: 2, branches: [{ branchId: 3 }], roles: [{ roleId: 3 }] }),
      findMany: jest.fn().mockResolvedValue([{ id: 50, firstName: 'Ali', lastName: 'Valiyev', position: 'Administrator' }]),
    },
    branch: { findMany: jest.fn().mockResolvedValue([{ id: 2, name: 'Namangan' }, { id: 3, name: "Farg'ona" }]) },
  };
  const history = { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn() };
  const reports = { deliver: jest.fn().mockResolvedValue({ ok: true }) };
  const svc = new TelegramReportRecipientsService(prisma as never, history as never, reports as never);
  return { svc, prisma, history, reports };
}

describe('TelegramReportRecipientsService', () => {
  it('lists with the Telegram state and the branch list', async () => {
    const { svc } = setup();
    const out = await svc.list(1);
    expect(out.recipients[0]).toEqual(expect.objectContaining({ name: 'Ali Valiyev', telegramLinked: true, noBranch: false }));
    expect(out.branches).toHaveLength(2);
  });

  it('create: own branches, non-money sections, 21:00', async () => {
    const { svc, prisma, history } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValueOnce(null);
    await svc.create(1, 99, 50);
    expect(prisma.telegramReportRecipient.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 1, userId: 50, createdById: 99, sendTime: '21:00', layout: 'BY_SECTION',
        allBranches: false, branchIds: [2, 3], sections: ['STUDENTS', 'LESSONS', 'ACTIVE_STUDENTS', 'ALERTS'],
      }),
    });
    expect(history.recordCreate).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'TelegramReportRecipient' }));
  });

  it('create: a CEO gets every branch', async () => {
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValueOnce(null);
    prisma.user.findFirst.mockResolvedValueOnce({ mainBranch: null, branches: [], roles: [{ roleId: 1 }] });
    await svc.create(1, 99, 50);
    expect(prisma.telegramReportRecipient.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ allBranches: true, branchIds: [] }));
  });

  it('create: unknown or non-staff user → 404, duplicate → 409', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValueOnce(null);
    await expect(svc.create(1, 99, 50)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.create(1, 99, 50)).rejects.toBeInstanceOf(ConflictException);
  });

  it('update: a foreign branch is refused', async () => {
    const { svc } = setup();
    await expect(svc.update(1, 99, 7, { branchIds: [42] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update: «Barcha filiallar» clears the list and writes history as text', async () => {
    const { svc, prisma, history } = setup();
    await svc.update(1, 99, 7, { allBranches: true });
    expect(prisma.telegramReportRecipient.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ allBranches: true, branchIds: [] }));
    expect(history.recordUpdate.mock.calls[0][0].newValues.branchIds).toBe('');
  });

  it('update / remove / test of another company → 404', async () => {
    const { svc, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    await expect(svc.update(1, 99, 7, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove(1, 99, 7)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.test(1, 7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('test: maps a failed delivery to a readable 400', async () => {
    const { svc, reports } = setup();
    reports.deliver.mockResolvedValueOnce({ ok: false, reason: 'NO_CHAT' });
    await expect(svc.test(1, 7)).rejects.toThrow(/Telegram ulanmagan/);
    reports.deliver.mockResolvedValueOnce({ ok: false, reason: 'NO_BRANCH' });
    await expect(svc.test(1, 7)).rejects.toThrow(/Filial tanlanmagan/);
    await expect(svc.test(1, 7)).resolves.toEqual({ sent: true });
  });
});
```

Run: `cd server && npx jest src/telegram-report/telegram-report-recipients.service.spec.ts` → FAIL.

- [ ] **Step 3: Implement the service**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, UserStatus, type TelegramReportRecipient, type TelegramReportSection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { signInStaffWhere } from '../common/auth/staff-telegram';
import { staffChatOf } from '../tasks/telegram/task-telegram-view';
import { PersonalReportService } from './personal-report.service';
import type { UpdateRecipientDto } from './dto/telegram-report.dto';

const ENTITY = 'TelegramReportRecipient';
const CEO_ROLE_ID = 1;
const DEFAULT_SECTIONS: TelegramReportSection[] = ['STUDENTS', 'LESSONS', 'ACTIVE_STUDENTS', 'ALERTS'];

/** Plain values for EntityHistory (arrays are skipped there, so join them). */
const historyValues = (r: TelegramReportRecipient) => ({
  userId: r.userId,
  sendTime: r.sendTime,
  layout: r.layout,
  allBranches: r.allBranches,
  branchIds: r.branchIds.join(','),
  sections: r.sections.join(','),
  isActive: r.isActive,
});

@Injectable()
export class TelegramReportRecipientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly reports: PersonalReportService,
  ) {}

  private staffWhere(companyId: number): Prisma.UserWhereInput {
    return { companyId, ...signInStaffWhere(), status: UserStatus.ACTIVE, isActive: true };
  }

  private liveBranches(companyId: number) {
    return this.prisma.branch.findMany({
      where: { companyId, deletedAt: null, status: { in: ['ACTIVE', 'INACTIVE'] } },
      select: { id: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  private async view(rows: TelegramReportRecipient[], branches: Array<{ id: number }>) {
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, firstName: true, lastName: true, position: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return Promise.all(
      rows.map(async (r) => {
        const u = byId.get(r.userId);
        const allowed = r.allBranches ? branches : branches.filter((b) => r.branchIds.includes(b.id));
        return {
          id: r.id,
          userId: r.userId,
          name: u ? `${u.firstName} ${u.lastName}` : `#${r.userId}`,
          position: u?.position ?? null,
          sendTime: r.sendTime,
          layout: r.layout,
          allBranches: r.allBranches,
          branchIds: r.branchIds,
          sections: r.sections,
          isActive: r.isActive,
          lastSentDate: r.lastSentDate ? r.lastSentDate.toISOString().slice(0, 10) : null,
          telegramLinked: (await staffChatOf(this.prisma, r.userId)) !== null,
          noBranch: allowed.length === 0,
        };
      }),
    );
  }

  private async one(companyId: number, id: number) {
    const row = await this.prisma.telegramReportRecipient.findFirst({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Oluvchi topilmadi');
    return row;
  }

  async list(companyId: number) {
    const [rows, branches] = await Promise.all([
      this.prisma.telegramReportRecipient.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } }),
      this.liveBranches(companyId),
    ]);
    return { recipients: await this.view(rows, branches), branches };
  }

  async candidates(companyId: number) {
    const taken = await this.prisma.telegramReportRecipient.findMany({ where: { companyId }, select: { userId: true } });
    const users = await this.prisma.user.findMany({
      where: { ...this.staffWhere(companyId), id: { notIn: taken.map((t) => t.userId) } },
      select: { id: true, firstName: true, lastName: true, position: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
    return users.map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, position: u.position }));
  }

  async create(companyId: number, actorId: number, userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...this.staffWhere(companyId) },
      select: { mainBranch: true, branches: { select: { branchId: true } }, roles: { select: { roleId: true } } },
    });
    if (!user) throw new NotFoundException('Xodim topilmadi');
    if (await this.prisma.telegramReportRecipient.findFirst({ where: { companyId, userId } })) {
      throw new ConflictException("Bu xodim ro'yxatda bor");
    }
    const isCeo = user.roles.some((r) => r.roleId === CEO_ROLE_ID);
    const own = [...new Set([user.mainBranch, ...user.branches.map((b) => b.branchId)])]
      .filter((id): id is number => id !== null)
      .sort((a, b) => a - b);
    let row: TelegramReportRecipient;
    try {
      row = await this.prisma.telegramReportRecipient.create({
        data: {
          companyId, userId, createdById: actorId, sendTime: '21:00', layout: 'BY_SECTION',
          allBranches: isCeo, branchIds: isCeo ? [] : own, sections: DEFAULT_SECTIONS,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException("Bu xodim ro'yxatda bor");
      }
      throw e;
    }
    await this.history.recordCreate({ entityType: ENTITY, entityId: row.id, changedById: actorId, companyId, newValues: historyValues(row) });
    return (await this.view([row], await this.liveBranches(companyId)))[0];
  }

  async update(companyId: number, actorId: number, id: number, dto: UpdateRecipientDto) {
    const row = await this.one(companyId, id);
    const branches = await this.liveBranches(companyId);
    if (dto.branchIds?.some((b) => !branches.some((x) => x.id === b))) {
      throw new BadRequestException('Filial topilmadi');
    }
    const data: Prisma.TelegramReportRecipientUpdateInput = { ...dto };
    if (dto.branchIds) data.branchIds = [...new Set(dto.branchIds)].sort((a, b) => a - b);
    if (dto.allBranches === true) data.branchIds = [];
    const updated = await this.prisma.telegramReportRecipient.update({ where: { id: row.id }, data });
    await this.history.recordUpdate({ entityType: ENTITY, entityId: row.id, changedById: actorId, companyId, oldValues: historyValues(row), newValues: historyValues(updated) });
    return (await this.view([updated], branches))[0];
  }

  async remove(companyId: number, actorId: number, id: number) {
    const row = await this.one(companyId, id);
    await this.prisma.telegramReportRecipient.delete({ where: { id: row.id } });
    await this.history.recordDelete({ entityType: ENTITY, entityId: row.id, changedById: actorId, companyId, oldValues: historyValues(row) });
    return { message: 'Oluvchi olib tashlandi' };
  }

  /** «Hozir sinab ko'rish»: sends now, never touches `lastSentDate`. */
  async test(companyId: number, id: number) {
    const row = await this.one(companyId, id);
    const out = await this.reports.deliver(row);
    if (out.ok) return { sent: true as const };
    switch (out.reason) {
      case 'NO_CHAT':
        throw new BadRequestException("Telegram ulanmagan — xodim botda /xodim orqali ulanishi kerak");
      case 'NO_BRANCH':
        throw new BadRequestException('Filial tanlanmagan');
      case 'NO_BOT':
        throw new ServiceUnavailableException('Bot ishlamayapti');
      default:
        throw new BadRequestException('Botga xabar yetmadi');
    }
  }
}
```

- [ ] **Step 4: Controller + spec**

`telegram-report.controller.ts`:

```ts
import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { CeoOnly } from '../common/permissions/access.decorators';
import { CreateRecipientDto, UpdateRecipientDto } from './dto/telegram-report.dto';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';

/** Personal Telegram report recipients (ADR-0095). The CEO's alone, by identity. */
@Controller('telegram-report')
export class TelegramReportController {
  constructor(private readonly recipients: TelegramReportRecipientsService) {}

  @Get('recipients')
  @CeoOnly()
  list(@CurrentUser('companyId') companyId: number) {
    return this.recipients.list(companyId);
  }

  @Get('candidates')
  @CeoOnly()
  candidates(@CurrentUser('companyId') companyId: number) {
    return this.recipients.candidates(companyId);
  }

  @Post('recipients')
  @CeoOnly()
  create(@Body() dto: CreateRecipientDto, @CurrentUser('companyId') companyId: number, @CurrentUser('id') userId: number) {
    return this.recipients.create(companyId, userId, dto.userId);
  }

  @Patch('recipients/:id')
  @CeoOnly()
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRecipientDto, @CurrentUser('companyId') companyId: number, @CurrentUser('id') userId: number) {
    return this.recipients.update(companyId, userId, id, dto);
  }

  @Delete('recipients/:id')
  @CeoOnly()
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('companyId') companyId: number, @CurrentUser('id') userId: number) {
    return this.recipients.remove(companyId, userId, id);
  }

  @Post('recipients/:id/test')
  @CeoOnly()
  test(@Param('id', ParseIntPipe) id: number, @CurrentUser('companyId') companyId: number) {
    return this.recipients.test(companyId, id);
  }
}
```

`telegram-report.controller.spec.ts`:

```ts
import { routeAccess } from '../common/permissions/testing';
import { TelegramReportController } from './telegram-report.controller';

describe('TelegramReportController access', () => {
  it.each(['list', 'candidates', 'create', 'update', 'remove', 'test'])('%s is CEO-only by identity', (name) => {
    expect(routeAccess(TelegramReportController, name)).toEqual({ kind: 'ceo' });
  });
});
```

- [ ] **Step 5: Module + app registration**

`telegram-report.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramGroupsModule } from '../telegram-groups/telegram-groups.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { PersonalReportService } from './personal-report.service';
import { TelegramReportRecipientsService } from './telegram-report-recipients.service';
import { TelegramReportController } from './telegram-report.controller';

/** Personal Telegram report (ADR-0095). Depends on TelegramModule one way. */
@Module({
  imports: [TelegramModule, TelegramGroupsModule, HolidaysModule],
  controllers: [TelegramReportController],
  providers: [PersonalReportService, TelegramReportRecipientsService],
})
export class TelegramReportModule {}
```

`app.module.ts`: `import { TelegramReportModule } from './telegram-report/telegram-report.module';` and add `TelegramReportModule,` right after `LessonRatingsModule,`.

- [ ] **Step 6: Route manifest**

`branch-route-policy.ts` — new block right after the lead-ownership `COMPANY_WIDE` block:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Personal Telegram report recipients (ADR-0095): who receives the daily ' +
      'report in their own chat, with which branches. Company-level settings, ' +
      'CEO-only through `@CeoOnly()`; the CEO picks any branch for anyone.',
    routes: [
      'GET /telegram-report/recipients',
      'GET /telegram-report/candidates',
      'POST /telegram-report/recipients',
      'PATCH /telegram-report/recipients/:id',
      'DELETE /telegram-report/recipients/:id',
      'POST /telegram-report/recipients/:id/test',
    ],
  },
```

`route-access.snapshot.json` — add these six keys in sorted position, each `["CEO"]`:
`"DELETE /telegram-report/recipients/:id"`, `"GET /telegram-report/candidates"`, `"GET /telegram-report/recipients"`, `"PATCH /telegram-report/recipients/:id"`, `"POST /telegram-report/recipients"`, `"POST /telegram-report/recipients/:id/test"`.

- [ ] **Step 7: Run and commit**

Run: `cd server && npx jest src/telegram-report src/common/permissions src/common/auth/branch-route-policy.spec.ts && npm run typecheck`
Expected: PASS.

```bash
cd server && npx prettier --write src/telegram-report src/app.module.ts src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json && npx eslint src/telegram-report
git add src/telegram-report src/app.module.ts src/common/auth/branch-route-policy.ts src/common/permissions/route-access.snapshot.json
git commit -m "feat(telegram-report): CEO-only recipients API"
```

---

### Task 7: The half-hourly cron

**Files:**
- Create: `server/src/telegram-report/personal-report.cron.ts` (+ `.spec.ts`)
- Modify: `server/src/telegram-report/telegram-report.module.ts` (provider)

**Interfaces:**
- Consumes: `PersonalReportService.deliver` (Task 5), `HolidaysService.findActiveHolidayCovering(date, null)`, `isTashkentSunday(now)` (`../telegram-groups/utils/format.util`), `tashkentDateStr`, `utcMidnightFromDateStr` (`../common/date/tashkent`), `tashkentClock` (Task 4), `describeError` (`../telegram-digest/telegram-send`).
- Produces: `PersonalReportCron.run(now?: Date): Promise<number>` — the number sent.

- [ ] **Step 1: Failing spec**

```ts
import { PersonalReportCron } from './personal-report.cron';

const FRI_1830 = new Date('2026-10-16T13:30:00Z'); // Friday 18:30 Tashkent
const SUN = new Date('2026-10-18T13:30:00Z');
const TODAY = new Date('2026-10-16T00:00:00.000Z');

function setup(due = [{ id: 1, lastSentDate: null }]) {
  const prisma = {
    telegramReportRecipient: {
      findMany: jest.fn().mockResolvedValue(due),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const holidays = { findActiveHolidayCovering: jest.fn().mockResolvedValue(null) };
  const reports = { deliver: jest.fn().mockResolvedValue({ ok: true }) };
  const cron = new PersonalReportCron(prisma as never, holidays as never, reports as never);
  return { cron, prisma, holidays, reports };
}

describe('PersonalReportCron', () => {
  it('skips Sundays', async () => {
    const { cron, prisma } = setup();
    expect(await cron.run(SUN)).toBe(0);
    expect(prisma.telegramReportRecipient.findMany).not.toHaveBeenCalled();
  });

  it('skips a company-wide holiday', async () => {
    const { cron, holidays, prisma } = setup();
    holidays.findActiveHolidayCovering.mockResolvedValue({ id: 1, name: 'Bayram' });
    expect(await cron.run(FRI_1830)).toBe(0);
    expect(holidays.findActiveHolidayCovering).toHaveBeenCalledWith(FRI_1830, null);
    expect(prisma.telegramReportRecipient.findMany).not.toHaveBeenCalled();
  });

  it('picks active recipients whose time has come and who have not had today\'s report', async () => {
    const { cron, prisma } = setup();
    await cron.run(FRI_1830);
    expect(prisma.telegramReportRecipient.findMany).toHaveBeenCalledWith({
      where: { isActive: true, sendTime: { lte: '18:30' }, OR: [{ lastSentDate: null }, { lastSentDate: { lt: TODAY } }] },
    });
  });

  it('claims before sending and counts a send', async () => {
    const { cron, prisma, reports } = setup();
    expect(await cron.run(FRI_1830)).toBe(1);
    expect(prisma.telegramReportRecipient.updateMany).toHaveBeenCalledWith({
      where: { id: 1, OR: [{ lastSentDate: null }, { lastSentDate: { lt: TODAY } }] },
      data: { lastSentDate: TODAY },
    });
    expect(reports.deliver).toHaveBeenCalledTimes(1);
  });

  it('a claim another instance won is skipped', async () => {
    const { cron, prisma, reports } = setup();
    prisma.telegramReportRecipient.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await cron.run(FRI_1830)).toBe(0);
    expect(reports.deliver).not.toHaveBeenCalled();
  });

  it('a transient failure gives the claim back; a permanent one keeps it', async () => {
    const { cron, prisma, reports } = setup([{ id: 1, lastSentDate: null }, { id: 2, lastSentDate: null }]);
    reports.deliver
      .mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED', kind: 'transient', description: 'x' })
      .mockResolvedValueOnce({ ok: false, reason: 'SEND_FAILED', kind: 'permanent', description: 'y' });
    await cron.run(FRI_1830);
    const releases = prisma.telegramReportRecipient.updateMany.mock.calls.filter((c) => c[0].where.lastSentDate);
    expect(releases).toEqual([[{ where: { id: 1, lastSentDate: TODAY }, data: { lastSentDate: null } }]]);
  });

  it('one recipient throwing does not stop the next', async () => {
    const { cron, reports } = setup([{ id: 1, lastSentDate: null }, { id: 2, lastSentDate: null }]);
    reports.deliver.mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce({ ok: true });
    expect(await cron.run(FRI_1830)).toBe(1);
  });
});
```

Run: `cd server && npx jest src/telegram-report/personal-report.cron.spec.ts` → FAIL.

- [ ] **Step 2: Implement**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { HolidaysService } from '../holidays/holidays.service';
import { isTashkentSunday } from '../telegram-groups/utils/format.util';
import { tashkentDateStr, utcMidnightFromDateStr } from '../common/date/tashkent';
import { describeError } from '../telegram-digest/telegram-send';
import { PersonalReportService, type DeliverResult, type ReportCache } from './personal-report.service';
import { tashkentClock } from './report-clock';

/** A failure the next half-hour can fix gives today's claim back. */
const retryable = (r: DeliverResult) =>
  !r.ok && (r.reason === 'NO_BOT' || (r.reason === 'SEND_FAILED' && r.kind === 'transient'));

/**
 * Sends each personal report once a day at its own time (ADR-0095). Mon–Sat,
 * not on a company-wide holiday. A recipient whose time has passed and who has
 * not had today's report is sent at the next half-hour, so a restart or a
 * transient Telegram error only delays it.
 */
@Injectable()
export class PersonalReportCron {
  private readonly logger = new Logger(PersonalReportCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly reports: PersonalReportService,
  ) {}

  @Cron('0 0,30 7-23 * * 1-6', { timeZone: 'Asia/Tashkent' })
  async tick(): Promise<void> {
    try {
      await this.run();
    } catch (err) {
      this.logger.error(`personal report run failed: ${describeError(err)}`);
    }
  }

  async run(now = new Date()): Promise<number> {
    if (isTashkentSunday(now)) return 0;
    if (await this.holidays.findActiveHolidayCovering(now, null)) return 0;
    const today = utcMidnightFromDateStr(tashkentDateStr(now));
    const notToday = [{ lastSentDate: null }, { lastSentDate: { lt: today } }];
    const due = await this.prisma.telegramReportRecipient.findMany({
      where: { isActive: true, sendTime: { lte: tashkentClock(now).time }, OR: notToday },
    });
    const cache: ReportCache = new Map();
    let sent = 0;
    for (const r of due) {
      const claim = await this.prisma.telegramReportRecipient.updateMany({
        where: { id: r.id, OR: notToday },
        data: { lastSentDate: today },
      });
      if (claim.count === 0) continue;
      let result: DeliverResult;
      try {
        result = await this.reports.deliver(r, cache, now);
      } catch (err) {
        this.logger.error(`personal report ${r.id} failed: ${describeError(err)}`);
        result = { ok: false, reason: 'NO_BOT' }; // treat as retryable
      }
      if (result.ok) {
        sent += 1;
        continue;
      }
      if (retryable(result)) {
        await this.prisma.telegramReportRecipient.updateMany({
          where: { id: r.id, lastSentDate: today },
          data: { lastSentDate: r.lastSentDate },
        });
      }
      this.logger.warn(`personal report ${r.id} not sent: ${result.reason}`);
    }
    return sent;
  }
}
```

Add `PersonalReportCron` to the module's `providers`.

- [ ] **Step 3: Run, format, commit**

```bash
cd server && npx jest src/telegram-report && npx prettier --write src/telegram-report && npx eslint src/telegram-report
git add src/telegram-report
git commit -m "feat(telegram-report): half-hourly send with a daily claim"
```

---

### Task 8: The bot — callbacks and the staff menu button

**Files:**
- Create: `server/src/telegram-report/personal-report-telegram.handler.ts` (+ `.spec.ts`, + `.registration.spec.ts`)
- Modify: `server/src/telegram-report/telegram-report.module.ts` (provider)
- Modify: `server/src/telegram/staff/staff-cabinet.ts` (+ its spec)

**Interfaces:**
- Consumes: `staffOfChat(prisma, chatId): Promise<{ kind: 'one'; userId; companyId; roleIds } | { kind: 'none' } | { kind: 'several' }>` from `../tasks/telegram/task-telegram-view`; `PersonalReportService.compose` (Task 5); `parseReportAction`, `REPORT_OPEN_ACTION` (Task 4); `TelegramService.useBeforeScenes`, `getBot`.
- Produces: callback handling for `tr:*`; `staffMenuKeyboard(account, cabinetUrl, studentCabinetUrl?, opts?: { report?: boolean })`.

- [ ] **Step 1: Registration spec (copy the lesson-ratings shape)**

```ts
import { Composer, Context } from 'telegraf';
import { PersonalReportTelegramHandler } from './personal-report-telegram.handler';

function setup(bot: object | null = {}) {
  const telegram = { getBot: () => bot, useBeforeScenes: jest.fn<void, [Composer<Context>]>() };
  const handler = new PersonalReportTelegramHandler({} as never, telegram as never, {} as never);
  return { handler, telegram };
}

const callback = (data: string) =>
  new Context({ update_id: 1, callback_query: { id: 'q', from: { id: 5, is_bot: false, first_name: 'A' }, chat_instance: 'c', data, message: { message_id: 3, date: 0, chat: { id: 777, type: 'private', first_name: 'A' } } } } as never, {} as never, { username: 'bot' } as never);

describe('PersonalReportTelegramHandler registration', () => {
  it('registers one middleware when the bot exists', () => {
    const { handler, telegram } = setup();
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).toHaveBeenCalledTimes(1);
  });

  it('registers nothing without a bot', () => {
    const { handler, telegram } = setup(null);
    handler.onApplicationBootstrap();
    expect(telegram.useBeforeScenes).not.toHaveBeenCalled();
  });

  it('tr:* reaches onAction, other callbacks go to next()', async () => {
    const { handler, telegram } = setup();
    const onAction = jest.spyOn(handler, 'onAction').mockResolvedValue(undefined);
    handler.onApplicationBootstrap();
    const mw = Composer.unwrap(telegram.useBeforeScenes.mock.calls[0][0]);
    const next = jest.fn();
    await mw(callback('tr:all') as never, next);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    await mw(callback('tk:list') as never, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Behaviour spec**

```ts
import { PersonalReportTelegramHandler } from './personal-report-telegram.handler';

jest.mock('../tasks/telegram/task-telegram-view', () => ({ staffOfChat: jest.fn() }));
import { staffOfChat } from '../tasks/telegram/task-telegram-view';

const REC = { id: 7, companyId: 1, userId: 50, isActive: true };

function ctxFor(data: string) {
  return {
    chat: { id: 777 },
    callbackQuery: { data, message: { message_id: 3 } },
    answerCbQuery: jest.fn().mockResolvedValue(true),
    reply: jest.fn().mockResolvedValue({}),
    editMessageText: jest.fn().mockResolvedValue({}),
    editMessageReplyMarkup: jest.fn().mockResolvedValue({}),
  };
}

function setup() {
  const prisma = { telegramReportRecipient: { findFirst: jest.fn().mockResolvedValue(REC) } };
  const reports = { compose: jest.fn().mockResolvedValue({ text: 'T', keyboard: { reply_markup: { inline_keyboard: [] } } }) };
  const handler = new PersonalReportTelegramHandler(prisma as never, { getBot: () => ({}) } as never, reports as never);
  return { handler, prisma, reports };
}

describe('PersonalReportTelegramHandler', () => {
  beforeEach(() => jest.mocked(staffOfChat).mockResolvedValue({ kind: 'one', userId: 50, companyId: 1, roleIds: [1] }));

  it('tr:open sends a new message with every branch', async () => {
    const { handler, reports } = setup();
    const ctx = ctxFor('tr:open');
    await handler.onAction(ctx as never);
    expect(reports.compose).toHaveBeenCalledWith(REC, 'all');
    expect(ctx.reply).toHaveBeenCalledWith('T', expect.objectContaining({ parse_mode: 'HTML' }));
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('a branch button edits the same message', async () => {
    const { handler, reports } = setup();
    const ctx = ctxFor('tr:b:2');
    await handler.onAction(ctx as never);
    expect(reports.compose).toHaveBeenCalledWith(REC, 2);
    expect(ctx.editMessageText).toHaveBeenCalledWith('T', expect.objectContaining({ parse_mode: 'HTML' }));
  });

  it('a chat that is not a recipient gets a refusal and loses the buttons', async () => {
    const { handler, prisma } = setup();
    prisma.telegramReportRecipient.findFirst.mockResolvedValue(null);
    const ctx = ctxFor('tr:all');
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Bu hisobot sizga ochiq emas');
    expect(ctx.editMessageReplyMarkup).toHaveBeenCalled();
  });

  it('a chat with two staff accounts is refused', async () => {
    jest.mocked(staffOfChat).mockResolvedValue({ kind: 'several' });
    const { handler, prisma } = setup();
    const ctx = ctxFor('tr:all');
    await handler.onAction(ctx as never);
    expect(prisma.telegramReportRecipient.findFirst).not.toHaveBeenCalled();
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Bu hisobot sizga ochiq emas');
  });

  it('a branch outside the allowed list is refused', async () => {
    const { handler, reports } = setup();
    reports.compose.mockResolvedValue(null);
    const ctx = ctxFor('tr:b:99');
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith('Bu hisobot sizga ochiq emas');
  });

  it('«message is not modified» answers «O\'zgarish yo\'q»', async () => {
    const { handler } = setup();
    const ctx = ctxFor('tr:r:all');
    ctx.editMessageText.mockRejectedValue(Object.assign(new Error('Bad Request: message is not modified'), { response: { error_code: 400, description: 'Bad Request: message is not modified' } }));
    await handler.onAction(ctx as never);
    expect(ctx.answerCbQuery).toHaveBeenCalledWith("O'zgarish yo'q");
  });

  it('a second tap while the first runs gets «Kuting…»', async () => {
    const { handler, reports } = setup();
    let release!: () => void;
    reports.compose.mockReturnValueOnce(new Promise((r) => (release = () => r({ text: 'T', keyboard: {} }))));
    const first = handler.onAction(ctxFor('tr:all') as never);
    const ctx2 = ctxFor('tr:all');
    await handler.onAction(ctx2 as never);
    expect(ctx2.answerCbQuery).toHaveBeenCalledWith('Kuting…');
    release();
    await first;
  });
});
```

Run both specs → FAIL (module missing).

- [ ] **Step 3: Implement the handler**

```ts
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Composer } from 'telegraf';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import type { BotContext } from '../telegram/types/context';
import { staffOfChat } from '../tasks/telegram/task-telegram-view';
import { describeError } from '../telegram-digest/telegram-send';
import { PersonalReportService } from './personal-report.service';
import { parseReportAction } from './report-keyboard';

const NOT_OPEN = 'Bu hisobot sizga ochiq emas';
const WAIT = 'Kuting…';
const SAME = "O'zgarish yo'q";
const FAILED = "Xatolik — birozdan keyin qayta urinib ko'ring";

/**
 * `tr:*` buttons of the personal report (ADR-0095) on the main bot. The chat's
 * one live staff account must have an active recipient row, and a branch must
 * be one the CEO allowed it — checked on every tap, so a forwarded message
 * opens nothing.
 */
@Injectable()
export class PersonalReportTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PersonalReportTelegramHandler.name);
  /** Chats with a tap still being answered (a quick second tap waits). */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly reports: PersonalReportService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return;
    const c = new Composer<BotContext>();
    c.action(/^tr:/, (ctx) => this.onAction(ctx));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const action = q && 'data' in q ? parseReportAction(q.data) : null;
    const chatId = ctx.chat ? String(ctx.chat.id) : null;
    if (!action || !chatId) {
      await ctx.answerCbQuery();
      return;
    }
    if (this.inFlight.has(chatId)) {
      await ctx.answerCbQuery(WAIT);
      return;
    }
    this.inFlight.add(chatId);
    try {
      const who = await staffOfChat(this.prisma, chatId);
      const recipient =
        who.kind === 'one'
          ? await this.prisma.telegramReportRecipient.findFirst({
              where: { userId: who.userId, companyId: who.companyId, isActive: true },
            })
          : null;
      const report = recipient
        ? await this.reports.compose(recipient, action.kind === 'open' ? 'all' : action.focus)
        : null;
      if (!report) {
        await ctx.answerCbQuery(NOT_OPEN);
        // The staff menu keeps its buttons; a stale report loses them.
        if (action.kind !== 'open') await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
        return;
      }
      const extra = { parse_mode: 'HTML' as const, ...report.keyboard };
      if (action.kind === 'open') {
        await ctx.reply(report.text, extra);
        await ctx.answerCbQuery();
        return;
      }
      try {
        await ctx.editMessageText(report.text, extra);
        await ctx.answerCbQuery();
      } catch (err) {
        if (!/message is not modified/i.test(describeError(err))) throw err;
        await ctx.answerCbQuery(SAME);
      }
    } catch (err) {
      this.logger.warn(`personal report tap failed: ${describeError(err)}`);
      await ctx.answerCbQuery(FAILED).catch(() => undefined);
    } finally {
      this.inFlight.delete(chatId);
    }
  }
}
```

Add `PersonalReportTelegramHandler` to the module's `providers`.

- [ ] **Step 4: Staff menu row**

In `server/src/telegram/staff/staff-cabinet.ts`:
1. Next to `STAFF_TASKS_ACTION`, add:
   ```ts
   /** The personal report (ADR-0095); answered by `src/telegram-report/`. */
   export const STAFF_REPORT_ACTION = 'tr:open';
   export const STAFF_REPORT_BUTTON_TEXT = '📊 Hisobot';
   ```
   (The string is owned here, like `'tk:list'`, so `src/telegram` imports nothing from `src/telegram-report`.)
2. `staffMenuKeyboard` gets a 4th parameter `opts: { report?: boolean } = {}`; right after the tasks row push:
   ```ts
   if (opts.report) {
     rows.push([Markup.button.callback(STAFF_REPORT_BUTTON_TEXT, STAFF_REPORT_ACTION)]);
   }
   ```
3. In `showMenu`, before `ctx.reply`:
   ```ts
   const report =
     (await this.prisma.telegramReportRecipient.count({
       where: { userId: account.id, isActive: true },
     })) > 0;
   ```
   and pass `{ report }` as the 4th argument of `staffMenuKeyboard`.

Add to the staff-cabinet spec (find the existing `staffMenuKeyboard` describe block and add):

```ts
it('adds «📊 Hisobot» only for a report recipient', () => {
  const account = { id: 1, firstName: 'A', roleIds: [3], portal: 'admin' as const };
  const flat = (k: ReturnType<typeof staffMenuKeyboard>) =>
    k.reply_markup.inline_keyboard.flat().map((b) => b.text);
  expect(flat(staffMenuKeyboard(account, 'https://admin.x/tg'))).not.toContain('📊 Hisobot');
  expect(flat(staffMenuKeyboard(account, 'https://admin.x/tg', undefined, { report: true }))).toContain('📊 Hisobot');
});
```

If a `showMenu` test builds a fake Prisma, add `telegramReportRecipient: { count: jest.fn().mockResolvedValue(0) }` to it.

- [ ] **Step 5: Run, format, commit**

Run: `cd server && npx jest src/telegram-report src/telegram/staff && npm run typecheck`
Expected: PASS.

```bash
cd server && npx prettier --write src/telegram-report src/telegram/staff/staff-cabinet.ts src/telegram/staff/staff-cabinet.spec.ts && npx eslint src/telegram-report src/telegram/staff/staff-cabinet.ts
git add src/telegram-report src/telegram/staff
git commit -m "feat(telegram-report): bot buttons and the staff menu entry"
```

---

### Task 9: Client — «Telegram hisobot» settings page

**Files:**
- Create: `client/src/components/settings/telegram-report/telegram-report-api.ts`
- Create: `client/src/components/settings/telegram-report/telegram-report-labels.ts` (+ `.test.ts`)
- Create: `client/src/components/settings/telegram-report/recipient-card.tsx`
- Create: `client/src/components/settings/telegram-report/telegram-report-settings-client.tsx`
- Create: `client/src/app/(dashboard)/settings/telegram-report/page.tsx`
- Modify: `client/src/lib/settings-nav.ts`, `client/src/lib/settings-nav.test.ts`, `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: the JSON of Task 6.

- [ ] **Step 1: Labels + failing test**

`telegram-report-labels.ts`:

```ts
export type ReportLayout = "BY_SECTION" | "TABLE" | "BY_BRANCH" | "TOTAL_ONLY";
export type ReportSection =
  | "TODAY_MONEY" | "STUDENTS" | "LESSONS" | "ACTIVE_STUDENTS"
  | "DEBT" | "MONTH" | "SALARY" | "ALERTS";

export const LAYOUTS: { value: ReportLayout; label: string; hint: string }[] = [
  { value: "BY_SECTION", label: "Bo'lim bo'yicha", hint: "Har bo'lim bir qator, filiallar ichida" },
  { value: "TABLE", label: "Jadval", hint: "Filiallar ustunda; 3 tagacha filialga qulay" },
  { value: "BY_BRANCH", label: "Filial bo'yicha", hint: "Har filial alohida blok, oxirida jami" },
  { value: "TOTAL_ONLY", label: "Faqat jami", hint: "Filiallarga bo'lmaydi, eng qisqa" },
];

export const SECTIONS: { value: ReportSection; label: string; money: boolean }[] = [
  { value: "TODAY_MONEY", label: "💰 Bugungi pul", money: true },
  { value: "STUDENTS", label: "👥 O'quvchilar", money: false },
  { value: "LESSONS", label: "🎓 Darslar", money: false },
  { value: "ACTIVE_STUDENTS", label: "👤 Faol o'quvchilar", money: false },
  { value: "DEBT", label: "📌 Qarz", money: true },
  { value: "MONTH", label: "📅 Oy boshidan", money: true },
  { value: "SALARY", label: "💵 Ustozlar oyligi", money: true },
  { value: "ALERTS", label: "🚩 Diqqat", money: false },
];

/** 07:00, 07:30 … 23:30 — the server accepts exactly these. */
export const SEND_TIMES: string[] = Array.from({ length: 34 }, (_, i) => {
  const h = 7 + Math.floor(i / 2);
  return `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
});
```

`telegram-report-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SECTIONS, SEND_TIMES } from "./telegram-report-labels";

describe("telegram report labels", () => {
  it("offers 07:00–23:30 in half hours", () => {
    expect(SEND_TIMES[0]).toBe("07:00");
    expect(SEND_TIMES.at(-1)).toBe("23:30");
    expect(SEND_TIMES).toHaveLength(34);
    expect(SEND_TIMES).toContain("21:00");
  });

  it("knows all eight sections, four of them money", () => {
    expect(SECTIONS).toHaveLength(8);
    expect(SECTIONS.filter((s) => s.money).map((s) => s.value)).toEqual(["TODAY_MONEY", "DEBT", "MONTH", "SALARY"]);
  });
});
```

Run: `cd client && npx vitest run src/components/settings/telegram-report` → PASS once the file exists (write the test first, see it fail on the missing module, then add the file).

- [ ] **Step 2: API helpers**

```ts
import api from "@/lib/api";
import type { ReportLayout, ReportSection } from "./telegram-report-labels";

export interface Recipient {
  id: number;
  userId: number;
  name: string;
  position: string | null;
  sendTime: string;
  layout: ReportLayout;
  allBranches: boolean;
  branchIds: number[];
  sections: ReportSection[];
  isActive: boolean;
  lastSentDate: string | null;
  telegramLinked: boolean;
  noBranch: boolean;
}
export interface BranchOption { id: number; name: string }
export interface Candidate { id: number; name: string; position: string | null }
export type RecipientPatch = Partial<Pick<Recipient, "sendTime" | "layout" | "allBranches" | "branchIds" | "sections" | "isActive">>;

export const fetchRecipients = async () =>
  (await api.get<{ recipients: Recipient[]; branches: BranchOption[] }>("/telegram-report/recipients")).data;
export const fetchCandidates = async () => (await api.get<Candidate[]>("/telegram-report/candidates")).data;
export const addRecipient = async (userId: number) => (await api.post<Recipient>("/telegram-report/recipients", { userId })).data;
export const patchRecipient = async (id: number, patch: RecipientPatch) =>
  (await api.patch<Recipient>(`/telegram-report/recipients/${id}`, patch)).data;
export const removeRecipient = async (id: number) => (await api.delete(`/telegram-report/recipients/${id}`)).data;
export const testRecipient = async (id: number) => (await api.post<{ sent: true }>(`/telegram-report/recipients/${id}/test`)).data;
```

- [ ] **Step 3: `recipient-card.tsx`**

One card per recipient. Every control calls `onPatch` at once (no save button). Uses shadcn `Select`, `Checkbox`, `Switch`, `Badge`, `Button`, `AlertDialog` from `@/components/ui/*` (standard shadcn exports).

```tsx
"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { BranchOption, Recipient, RecipientPatch } from "./telegram-report-api";
import { LAYOUTS, SECTIONS, SEND_TIMES, type ReportSection } from "./telegram-report-labels";

interface Props {
  recipient: Recipient;
  branches: BranchOption[];
  busy: boolean;
  testing: boolean;
  onPatch: (patch: RecipientPatch) => void;
  onTest: () => void;
  onRemove: () => void;
}

export function RecipientCard({ recipient: r, branches, busy, testing, onPatch, onTest, onRemove }: Props) {
  const toggleBranch = (id: number, on: boolean) =>
    onPatch({ branchIds: on ? [...r.branchIds, id] : r.branchIds.filter((b) => b !== id) });
  const toggleSection = (s: ReportSection, on: boolean) => {
    const next = on ? [...r.sections, s] : r.sections.filter((x) => x !== s);
    if (next.length) onPatch({ sections: next });
  };

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{r.name}</p>
          {r.position && <p className="text-xs text-muted-foreground">{r.position}</p>}
        </div>
        <div className="flex items-center gap-2">
          {r.telegramLinked ? (
            <Badge variant="secondary">✅ Telegram ulangan</Badge>
          ) : (
            <Badge variant="destructive">⚠️ Telegram ulanmagan</Badge>
          )}
          <Switch checked={r.isActive} disabled={busy} onCheckedChange={(v) => onPatch({ isActive: v })} aria-label="Yoqilgan" />
        </div>
      </div>
      {!r.telegramLinked && (
        <p className="text-xs text-muted-foreground">Hisobot bormaydi — xodim botda /xodim orqali ulanishi kerak.</p>
      )}
      {r.noBranch && <p className="text-xs text-destructive">Filial tanlanmagan — hisobot bormaydi.</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Vaqt</Label>
          <Select value={r.sendTime} disabled={busy} onValueChange={(v) => onPatch({ sendTime: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{SEND_TIMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Ko&apos;rinish</Label>
          <Select value={r.layout} disabled={busy} onValueChange={(v) => onPatch({ layout: v as Recipient["layout"] })}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LAYOUTS.map((l) => (
                <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{LAYOUTS.find((l) => l.value === r.layout)?.hint}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Filiallar</Label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={r.allBranches} disabled={busy} onCheckedChange={(v) => onPatch({ allBranches: v === true })} />
          Barcha filiallar <span className="text-xs text-muted-foreground">(keyin ochilganlar ham)</span>
        </label>
        {!r.allBranches && (
          <div className="flex flex-wrap gap-4 pl-6">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={r.branchIds.includes(b.id)} disabled={busy} onCheckedChange={(v) => toggleBranch(b.id, v === true)} />
                {b.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Bo&apos;limlar</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <label key={s.value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={r.sections.includes(s.value)}
                disabled={busy || (r.sections.length === 1 && r.sections.includes(s.value))}
                onCheckedChange={(v) => toggleSection(s.value, v === true)}
              />
              {s.label}
              {s.money && <span className="text-xs text-muted-foreground">· pul</span>}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={testing || !r.telegramLinked} onClick={onTest}>
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Hozir sinab ko&apos;rish
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-destructive" disabled={busy}>
              <Trash2 className="size-4" /> Olib tashlash
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{r.name} ro&apos;yxatdan olib tashlansinmi?</AlertDialogTitle>
              <AlertDialogDescription>Unga hisobot boshqa bormaydi. Keyin qayta qo&apos;shish mumkin.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onRemove}>
                Olib tashlash
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
```

If an import name differs in `client/src/components/ui/*`, use the file's real export (check with `grep -n "^export" client/src/components/ui/select.tsx` etc.) — do not add a new UI component.

- [ ] **Step 4: Page component**

`telegram-report-settings-client.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/get-error-message";
import { SettingsPageHeader } from "../settings-page-header";
import {
  addRecipient, fetchCandidates, fetchRecipients, patchRecipient, removeRecipient, testRecipient,
  type RecipientPatch,
} from "./telegram-report-api";
import { RecipientCard } from "./recipient-card";

const KEY = ["telegram-report-recipients"];
const CANDIDATES = ["telegram-report-candidates"];
const TITLE = "Telegram hisobot";
const DESCRIPTION = "Kunlik hisobot kimning shaxsiy chatiga, qaysi filiallar va bo'limlar bilan borishi";

/** CEO-only (ADR-0095): recipients of the personal daily report. */
export function TelegramReportSettingsClient() {
  const qc = useQueryClient();
  const [pick, setPick] = useState<string>("");
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchRecipients });
  const candidates = useQuery({ queryKey: CANDIDATES, queryFn: fetchCandidates });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: CANDIDATES });
  };

  const add = useMutation({
    mutationFn: (userId: number) => addRecipient(userId),
    onSuccess: () => { setPick(""); refresh(); toast.success("Qo'shildi"); },
    onError: (e) => toast.error(getErrorMessage(e, "Qo'shib bo'lmadi")),
  });
  const patch = useMutation({
    mutationFn: ({ id, p }: { id: number; p: RecipientPatch }) => patchRecipient(id, p),
    onSuccess: refresh,
    onError: (e) => toast.error(getErrorMessage(e, "Saqlashda xatolik")),
  });
  const remove = useMutation({
    mutationFn: removeRecipient,
    onSuccess: () => { refresh(); toast.success("Olib tashlandi"); },
    onError: (e) => toast.error(getErrorMessage(e, "Olib tashlab bo'lmadi")),
  });
  const test = useMutation({
    mutationFn: testRecipient,
    onMutate: (id) => setTestingId(id),
    onSettled: () => setTestingId(null),
    onSuccess: () => toast.success("Hisobot yuborildi"),
    onError: (e) => toast.error(getErrorMessage(e, "Yuborib bo'lmadi")),
  });

  if (isError) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" onClick={() => void refetch()}>Qayta urinish</Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full max-w-3xl" /></div>;
  }

  return (
    <div>
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
      <div className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-4">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Xodimni tanlang" /></SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.position ? ` — ${c.position}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!pick || add.isPending} onClick={() => add.mutate(Number(pick))}>
            <Plus className="size-4" /> Oluvchi qo&apos;shish
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hisobot dushanba–shanba belgilangan vaqtda keladi; yakshanba va butun markaz bayramida avtomatik bormaydi.
          Oluvchi botdagi «📊 Hisobot» tugmasi bilan istalgan payt so&apos;ray oladi.
        </p>
        {data.recipients.length === 0 && (
          <p className="text-sm text-muted-foreground">Hali oluvchi yo&apos;q.</p>
        )}
        {data.recipients.map((r) => (
          <RecipientCard
            key={r.id}
            recipient={r}
            branches={data.branches}
            busy={patch.isPending || remove.isPending}
            testing={testingId === r.id}
            onPatch={(p) => patch.mutate({ id: r.id, p })}
            onTest={() => test.mutate(r.id)}
            onRemove={() => remove.mutate(r.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

`client/src/app/(dashboard)/settings/telegram-report/page.tsx`:

```tsx
import { Suspense } from "react";
import { TelegramReportSettingsClient } from "@/components/settings/telegram-report/telegram-report-settings-client";

export default function TelegramReportSettingsPage() {
  return (
    <Suspense>
      <TelegramReportSettingsClient />
    </Suspense>
  );
}
```

- [ ] **Step 5: Nav, breadcrumb, nav test**

`settings-nav.ts`, «CEO» section, after «Lidlar egaligi» (import `BarChart3` from `lucide-react` with the other icons):

```ts
      {
        // Every route is `@CeoOnly()` (ADR-0095): identity, not a capability.
        title: "Telegram hisobot",
        url: "/settings/telegram-report",
        icon: BarChart3,
        description: "Kunlik hisobot kimning shaxsiy chatiga borishi",
        ceoOnly: true,
      },
```

`breadcrumb-routes.ts`, after the lead-ownership line:

```ts
  // /settings/telegram-report — «Telegram hisobot», CEO only (ADR-0095).
  "telegram-report": "Telegram hisobot",
```

`settings-nav.test.ts`: change the CEO count `toHaveLength(14)` to `toHaveLength(15)` and add, after the «Lidlar egaligi» block:

```ts
describe("«Telegram hisobot» — CEO only (ADR-0095)", () => {
  const PATH = "/settings/telegram-report";
  it("only the CEO sees and opens it", () => {
    const ceo = getVisibleSettingsSections(canForRoles([CEO]), true).flatMap((s) => s.items);
    expect(ceo.map((item) => item.url)).toContain(PATH);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
  });
});
```

- [ ] **Step 6: Check and commit**

Run: `cd client && npx tsc --noEmit -p . && npx vitest run src/lib/settings-nav.test.ts src/components/settings/telegram-report`
Expected: PASS. (No prettier on `client/`.)

```bash
git add client/src/components/settings/telegram-report "client/src/app/(dashboard)/settings/telegram-report" client/src/lib/settings-nav.ts client/src/lib/settings-nav.test.ts client/src/lib/breadcrumb-routes.ts
git commit -m "feat(settings): Telegram report recipients page (CEO)"
```

---

### Task 10: ADR, user guide, CLAUDE.md, full verification

**Files:**
- Create: `docs/adr/0095-shaxsiy-telegram-hisobot.md`
- Modify: `docs/adr/README.md` (one row after 0093)
- Create: `client/src/qollanma/kontent/hisobotlar/telegram-hisobot.mdx`
- Modify: `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`
- Modify: `server/CLAUDE.md`

- [ ] **Step 1: ADR-0095 (Uzbek, the 0093 header shape)**

```markdown
# ADR-0095 — Kunlik hisobot shaxsiy chatga: CEO oluvchi, filial va bo'limni belgilaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0025, ADR-0058, ADR-0059, ADR-0079, `docs/superpowers/specs/2026-10-16-telegram-shaxsiy-hisobot-design.md`, `server/src/telegram-report/`, `client/src/components/settings/telegram-report/`

## Kontekst

21:00 kunlik hisobot faqat Telegram guruhlarga borardi. CEO uni o'zi tanlagan
xodimlarga shaxsiy chatda, har biriga o'z filiallari, bo'limlari, ko'rinishi va
vaqti bilan yuborishni so'radi (16.10.2026).

## Qaror

1. Oluvchilar `TelegramReportRecipient` jadvalida (bir xodim — bir qator).
   Sahifa va oltala yo'l faqat CEO'niki (`@CeoOnly()`, imkoniyat emas).
2. Filial ruxsati xodimning o'z filiali bilan cheklanmaydi: CEO istalgan
   filialni istalgan xodimga ochadi. «Barcha filiallar» keyin ochilganlarni
   ham qamraydi; yopilgan va arxivdagi filiallar berilmaydi.
3. Raqamlar faqat `TelegramGroupDailyReportService.collect()` dan — 21:00
   hisobotining o'zi. 4 ko'rinish (bo'lim bo'yicha, jadval, filial bo'yicha,
   faqat jami) shu ma'lumotdan yoziladi, yangi raqam hisoblamaydi. Guruh xabari
   o'zgarmaydi (snapshot test).
4. Vaqt — har oluvchiga o'zi, yarim soat qadam, 07:00–23:30. Har yarim soatda
   vaqti kelgan va bugun hisobot olmagan oluvchiga yuboriladi; `lastSentDate`
   yuborishdan oldin shartli yoziladi (ikki nusxa server ikki marta
   yubormaydi), vaqtinchalik xatoda qaytariladi. Yakshanba va butun markaz
   bayramida avtomatik yuborilmaydi; bitta filial bayrami to'xtatmaydi.
5. Bu ADR-0025 «darhol» ro'yxatiga qo'shimcha: hisobot 20:00 to'plamiga
   kirmaydi. U `sendTelegramText` orqali ketadi, shuning uchun
   `direct-send.guard.spec.ts` o'zgarmaydi.
6. Botda xodim menyusida «📊 Hisobot»; hisobot tagida filial, «Barchasi» va
   «Yangilash» tugmalari. Har bosishda chat egasi, faol qator va filial ruxsati
   qayta tekshiriladi — uzatilgan xabar boshqa filialni ochmaydi.
7. ▲/▼ faqat bitta filial yoki butun markaz uchun chiqadi: tanlangan filiallar
   to'plamining kechagi holati saqlanmaydi.

## Oqibatlari

- Moliyaviy raqamlar endi guruhdan tashqari shaxsiy chatga ham boradi; kim
  nimani ko'rishi faqat CEO qo'lida.
- Har oluvchi uchun filial soni + 1 marta `collect()` ishlaydi (bir vaqtdagi
  oluvchilar natijani bo'lishadi).
- Juda ko'p filialda jadval Telegram chegarasidan oshsa, xabar qator chegarasida
  kesiladi.
```

`docs/adr/README.md` — after the 0093 row:

```markdown
| [0095](0095-shaxsiy-telegram-hisobot.md) | Kunlik hisobot shaxsiy chatga: CEO oluvchi, filial va bo'limni belgilaydi | Qabul qilindi | 2026-10-16 |
```

- [ ] **Step 2: Guide page**

`client/src/qollanma/kontent/hisobotlar/telegram-hisobot.mdx`:

```mdx
## Qanday ishlaydi

CEO Sozlamalar → «Telegram hisobot» sahifasida xodimlarni tanlaydi. Har biriga kunlik hisobot o'z Telegram chatiga, belgilangan vaqtda keladi. Raqamlar 21:00 dagi guruh hisobotining o'zi.

- Vaqt 07:00 dan 23:30 gacha, yarim soat qadam bilan. Xabar sarlavhasida «18:30 holati» kabi qaysi paytning raqamlari ekani yoziladi.
- Dushanba–shanba keladi. Yakshanba va butun markaz bayramida avtomatik kelmaydi.
- Xodimning Telegrami botga ulangan bo'lishi kerak (`/xodim`). Ulanmagan bo'lsa, sahifada ⚠️ belgisi turadi.

<Eslatma tur="malumot">

Sahifani faqat CEO ko'radi va o'zgartiradi. Kimga qaysi filial va qaysi bo'lim borishini ham faqat CEO belgilaydi.

</Eslatma>

## Har oluvchi uchun sozlama

- **Vaqt** — hisobot keladigan soat.
- **Ko'rinish** — bo'lim bo'yicha, jadval, filial bo'yicha yoki faqat jami.
- **Filiallar** — «Barcha filiallar» (keyin ochilganlar ham) yoki bitta-bitta filial.
- **Bo'limlar** — Bugungi pul, O'quvchilar, Darslar, Faol o'quvchilar, Qarz, Oy boshidan, Ustozlar oyligi, Diqqat. Pul bo'limlari belgilangan.
- **Yoqilgan** — vaqtincha to'xtatish uchun.
- **Hozir sinab ko'rish** — hisobot shu zahoti ketadi; o'sha kungi avtomatik hisobot baribir keladi.

Yangi oluvchiga avtomatik ravishda o'z filiali, pul bo'lmagan bo'limlar va 21:00 belgilanadi.

## Botda

Oluvchining xodim menyusida «📊 Hisobot» tugmasi bor (yangi qo'shilgan oluvchi `/start` bosgandan keyin ko'radi). Hisobot tagida filial tugmalari, «🌐 Barchasi» va «🔄 Yangilash» bor: bosilganda o'sha xabarning o'zi yangilanadi. Oluvchiga faqat CEO ruxsat bergan filiallar ko'rinadi.
```

`client/src/qollanma/sahifalar/hisobotlar.ts` — add at the end of the array:

```ts
  {
    bolim: "hisobotlar",
    sahifa: "telegram-hisobot",
    sarlavha: "Telegram hisobot",
    qisqacha:
      "Kunlik hisobot CEO tanlagan xodimlarning shaxsiy Telegram chatiga, har biriga o'z vaqti, filiallari, bo'limlari va ko'rinishi bilan boradi.",
    rollar: [1],
    adr: ["0095"],
    yollar: ["/settings/telegram-report"],
    kalitSozlar: ["telegram", "kunlik hisobot", "shaxsiy hisobot", "bot", "hisobot vaqti", "filial", "jadval"],
    yangilangan: "2026-10-16",
  },
```

`client/src/qollanma/yangiliklar.ts` — new first entry:

```ts
  {
    sana: "2026-10-16",
    sarlavha: "Telegram hisobot shaxsiy chatga",
    matn: "CEO endi Sozlamalar → «Telegram hisobot» sahifasida kunlik hisobot kimning shaxsiy Telegram chatiga borishini belgilaydi: har oluvchi uchun vaqt, filiallar, bo'limlar va to'rt ko'rinishdan biri. Hisobot dushanba–shanba keladi, botdagi «📊 Hisobot» tugmasi bilan istalgan payt so'raladi, tagidagi tugmalar bilan filial tanlanadi.",
    rollar: [1],
    sahifa: { bolim: "hisobotlar", sahifa: "telegram-hisobot" },
  },
```

- [ ] **Step 3: `server/CLAUDE.md`**

1. In «Telegram digest — one message a day at 20:00», the «Instant by design» bullet: add `the personal daily report (src/telegram-report/, ADR-0095 — its own half-hourly cron, Mon–Sat, not on a company-wide holiday)` to the list.
2. New subsection right after «Telegram digest …» (English):

```markdown
#### Personal Telegram report (`src/telegram-report/`, ADR-0095)

- **Recipients** are `TelegramReportRecipient` rows (one per user and company), edited only by the CEO on `/settings/telegram-report` (`@CeoOnly()` on all six routes, `COMPANY_WIDE`). Each row: `sendTime` ("HH:MM", :00/:30, 07:00–23:30), `layout` (`BY_SECTION` / `TABLE` / `BY_BRANCH` / `TOTAL_ONLY`), `allBranches` or `branchIds`, `sections` (8 keys), `isActive`, `lastSentDate`. The CEO may give anyone any branch; closed and archived branches are never offered.
- **Figures** come only from `TelegramGroupDailyReportService.collect()` → `DailyReportData`; the 21:00 group text is `renderGroupMessage(data)`, pinned by `telegram-group-daily-report.snapshot.spec.ts` (never update that snapshot to make a refactor pass). The personal layouts (`personal-report-render.ts`) print fields of `DailyReportData` and compute nothing. «Barcha filiallar» totals with the company-wide scope (`null`), a chosen subset with that subset; the debt ▲/▼ shows only for one branch or the whole company.
- **Sending:** `PersonalReportCron` (`0 0,30 7-23 * * 1-6`) skips Sundays and company-wide holidays, picks active rows with `sendTime ≤ now` and no report today, claims `lastSentDate` with a conditional `updateMany` before sending (`sendTelegramText`), and gives the claim back on a transient failure or a missing bot. «Hozir sinab ko'rish» (`POST …/:id/test`) never touches `lastSentDate`.
- **Bot:** `PersonalReportTelegramHandler` answers `tr:open` (staff menu «📊 Hisobot», shown when `showMenu` finds an active row), `tr:b:<id>`, `tr:all`, `tr:r:<id|all>` through `useBeforeScenes`. Every tap re-reads the chat's one staff account (`staffOfChat`), its active row and the allowed branches; anything else gets «Bu hisobot sizga ochiq emas».
```

- [ ] **Step 4: Full verification**

```bash
cd server && npx prettier --write src/telegram-report src/telegram-groups src/telegram/staff && npx eslint src/telegram-report src/telegram-groups src/telegram/staff/staff-cabinet.ts && npm run typecheck && npm run build && npm test
```
Expected: lint 0 errors; typecheck and build clean; full suite PASS. (Do not run `npm run build` and `npm test` in parallel.)

```bash
cd client && npx tsc --noEmit -p . && npx vitest run src/lib src/components/settings/telegram-report src/qollanma
```
Expected: PASS (the guide registry test finds `hisobotlar/telegram-hisobot.mdx`).

- [ ] **Step 5: Commit**

```bash
git add docs/adr/0095-shaxsiy-telegram-hisobot.md docs/adr/README.md client/src/qollanma server/CLAUDE.md
git commit -m "docs: ADR-0095 personal Telegram report, guide and CLAUDE.md"
```

---

## After the plan

Not part of the tasks — the CEO decides: push, PR, merge, then deploy (Railway runs `db:migrate:deploy`; Vercel for the client). After deploy, add the first recipient on the page and press «Hozir sinab ko'rish».
