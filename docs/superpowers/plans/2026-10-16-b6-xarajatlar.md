# B6 «Xarajatlar» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Moliya → «Xarajatlar» (`/payments/expenses`) as a month page: «‹ Oy ›» instead of a date range, a month card whose total is the canonical net profit's `operatingExpenses`, a «Bu oy hali yozilmagan» warning (the Foyda forecast's `missingRecurringExpenses`, per branch) with «Yozish», eight categories, a «Kim kiritgan» filter, server-side hint pills on «Boshqa» rows, and write buttons only for `expenses.manage`.

**Architecture:** The server gets two pure files in `server/src/expenses/` — `expenses-month.ts` (month rule and window, category rows, per-branch «hali yozilmagan», empty branches) and `expense-hints.ts` (keyword pills) — and one loader, `ExpensesMonthService`, behind a new `GET /expenses/month-summary` that reads the canonical set (company, live, no advance, month window, `branchIdWhere`); a parity spec proves its total equals `buildNetProfit(getProfitLoss(...)).operatingExpenses`. `GET /expenses` and `GET /expenses/pdf` learn `oy` and `createdById` through the existing `buildWhere`; the old `startDate`/`endDate` stay. The client page moves to `client/src/components/payments/expenses/`, reuses B4/B5 pieces (`MonthStepper`, `UrlSearchBox`, `PaymentsPager`, `lastPageIfPast`, `PILL_BASE`, `mln`) and computes no figure.

**Tech Stack:** NestJS + Prisma 7 + Jest + pdfmake (server); Next.js 16 + React Query 5 + Vitest + shadcn (client). No new dependency, no migration.

**Code in this plan is written compactly; `npx prettier --write` (server only) reformats it. Never run prettier on `client/`.**

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-10-16-b6-xarajatlar-design.md` — every implementer reads it once, in full, before starting; § numbers below point into it. CEO decisions are §2 and are binding (§2.2: «Yozish» fills the MISSING amount — `missing[].amount`, which is last month's total when nothing is recorded yet).
- **Where commands run:** worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b6-xarajatlar`; never `cd` into the main checkout.
- **node_modules:** the worktree has none until Task 1 Step 0 runs `npm install` in `server/` and `client/` and `npx prisma generate` in `server/`.
- **Server commands** (from `server/`): one spec `npx jest <path>`; `npm run typecheck` (jest is transpile-only; this type-checks specs); `npx eslint <files>`; `npx prettier --write <touched .ts files>` before every commit (Prettier failures are CI-blocking).
- **Client commands** (from `client/`): `npx vitest run <path>` (if it errors on `configLoader`, use `npx vitest --config vitest.config.mts run <path>`); `npx tsc --noEmit -p .`; `npm run lint` — errors only. Vitest collects only `src/**/*.test.ts`: component tests are `.test.ts` files that render with `createElement` + `renderToStaticMarkup`, no JSX. **No prettier on `client/` files.**
- **Never commit `client/AGENTS.md`** (`next dev` rewrites it; `git checkout -- client/AGENTS.md`).
- **User-visible text:** Latin-script Uzbek only, exactly the strings in the spec and this plan; no English word on screen, no enum name on screen (`RENT`, `CASH`, `SALARY` are codes; the words live in `expenses-labels.ts`). Code comments, commit messages and both CLAUDE.md files in English; the ADR and the guide page in Uzbek.
- **Dates:** server months only through `common/date/tashkent.ts` (`tashkentMonthKey`, `addMonthsToMonthKey`, `utcMidnightFromDateStr`, `tashkentDateStr`); `Expense.date` is `@db.Date`, so the month window is plain UTC midnights with an EXCLUSIVE upper bound (`lt` the next month's 1st). Client months through `currentMonthKey()` / `addMonths()` / `monthShort()` / `monthLabel()` (`components/payments/salary-utils.ts`) and `clampMonth()` (`components/payments/overview/overview-math.ts`). Never `getMonth()`, `getFullYear()`, `startOfMonth(new Date())` or `toISOString().slice(…)` for a month or a day.
- **Money:** integers in so'm; never `Math.abs` on a ledger amount. The client computes no figure: totals, cash/card, category sums, `notRecorded`, missing amounts all come from the server. The only client arithmetic allowed is the category bar's width (amount ÷ the month's largest category), which draws, never prints.
- **One total:** the month card's `total` is the same set as `ReportsService.getMonthlyNetProfit(...).operatingExpenses` — `companyId`, `deletedAt: null`, `category ≠ TEACHER_ADVANCE`, the Tashkent month, `branchIdWhere(scope)`. `expenses-month.profit-parity.spec.ts` (Task 3) proves it. No second «hali yozilmagan» rule: `missingRecurringExpenses` / `recurringKeyOf` (`reports/profit-composition.ts`) are called, never copied.
- **TEACHER_ADVANCE never on this page and never in its totals:** every read keeps `ExpensesService.categoryWhere` / `category: { not: 'TEACHER_ADVANCE' }`; the client's eight categories exclude it (Task 6 pins them to `schema.prisma`).
- **Access (ADR-0079):** reads stay `@Can('expenses.view')`, writes stay `@Can('expenses.manage', 'salary.pay')`. The one new route `GET /expenses/month-summary` carries `@Can('expenses.view')` and a row in `server/src/common/permissions/route-access.snapshot.json` (`["Branch Director", "CEO"]`), asserted with `routeAccess()` / `defaultRolesOf()` (`common/permissions/testing.ts`).
- **Branch scope:** the existing controller pattern — `ExpensesController.scope(userId, query.branchId)` (`resolveCallerReportBranchIds`; an empty scope is 403 «Bu filial xarajatlarini ko'rish huquqingiz yo'q» before any read). The new route uses it too and goes into `branch-route-policy.ts`'s `BRANCH_SCOPED_BY_SERVICE` block beside `GET /expenses`. The client keeps sending `branchId: selectedBranch?.id` as today.
- **Deploy window:** the old `startDate` / `endDate` parameters keep working (an old client on the new server); `oy` with either is 400 «Oy yoki sana oralig'i — ikkalasi birga emas». A request with neither `oy` nor a range reads the current Tashkent month (the new client never sends the current month — §6.2).
- **Public repo:** invented names, ids and amounts only (`Ism Familiya`, `10001`, `Markaz`/`Shimol` branches, `450 000`).
- **Commits:** tests passing, English message ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. From `server/` use paths relative to `server/`; for files in both packages or `docs/`, run git from the worktree root. Never `git stash`, `git reset --hard`, rebase or push.
- **ADR number:** `0094` at plan time (`origin/main` ends at 0093). Only Task 10's files carry it; Tasks 1–9 cite «spec B6 §…» in code comments. Task 10 Step 0 re-checks and renames if `main` moved.
- **Rollout (not a task, spec §9):** no migration, no script. Server first (new parameters and route are additive; the old page keeps working), then the site (a new client on the old server would get 400 on `oy` and 404 on `month-summary`). After deploy, once by hand: the current month's page total = «Umumiy ma'lumotlar» → «Foyda» → «Qanday hisoblandi» → «Boshqa xarajatlar», as CEO on «Barcha filiallar» and on each branch.

---

## File Structure

Server (`server/src/expenses/` unless noted):
- Create `expenses-month.ts` (+ `expenses-month.spec.ts`) — `EXPENSE_FIRST_MONTH`, `PAGE_CATEGORIES`, `parseExpenseMonth`, `expenseMonthWindow`, `expenseMonthTitle`, `summarize`, `buildCategoryRows`, `missingByBranch`, `emptyBranches`, the `MonthSummary` shape.
- Create `expense-hints.ts` (+ `expense-hints.spec.ts`) — `expenseHint`.
- Create `expenses-month.service.ts` (+ `expenses-month.service.spec.ts`, `expenses-month.profit-parity.spec.ts`) — `ExpensesMonthService.monthSummary`.
- Create `dto/expense-month-query.dto.ts`; modify `dto/expense-query.dto.ts` (`oy`, `createdById`).
- Modify `expenses.service.ts` (`monthOf`, `dateWhere`, `createdById`, order, `hint`, PDF month/creators/«Naqd», PDF returns `{ buffer, filename }`), `pdf/expenses-template.ts` (`creatorLabel`, «Naqd»), `expenses.controller.ts` (route, file name), `expenses.module.ts`.
- Tests: modify `expenses.service.spec.ts`, `expenses.controller.spec.ts`, `expenses.controller.body-validation.e2e.spec.ts`; create `expenses.service.pdf.spec.ts`.
- Modify `common/permissions/route-access.snapshot.json`, `common/auth/branch-route-policy.ts`.

Client (`client/src/` unless noted):
- Create in `components/payments/expenses/`: `expenses-types.ts`, `expenses-labels.ts` (+ test), `expenses-url.ts` (+ test), `expenses-format.ts` (+ test), `expenses-queries.ts`, `expenses-header.tsx`, `expenses-month-card.tsx`, `expenses-missing-card.tsx`, `expenses-month-card.test.ts`, `expenses-filter-bar.tsx`, `expenses-table.tsx`, `expenses-table.test.ts`, `expenses-page.tsx`.
- Move + modify `components/payments/expense-form-dialog.tsx` → `components/payments/expenses/expense-form-dialog.tsx`.
- Modify `app/(dashboard)/payments/expenses/page.tsx`, `components/payments/salary-advance-day-panel.tsx`, `components/payments/salary-advance-dialog.tsx` (label import), `data/searchable-pages.ts`, `components/ui/dialog.tsx` (comment).
- Delete `components/payments/expenses-client.tsx`, `expenses-summary-cards.tsx`, `expenses-filter-bar.tsx`, `expenses-pdf-range-dialog.tsx`.

Docs: `docs/adr/0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `client/src/qollanma/kontent/xarajatlar/xarajatlar-sahifasi.mdx`, `client/src/qollanma/sahifalar/xarajatlar.ts`, `client/src/qollanma/sahifalar/index.ts`, `client/src/qollanma/yangiliklar.ts`, `client/scripts/qollanma-kadrlar.mjs`.

---

### Task 1: The month rules (pure)

**Files:**
- Create: `server/src/expenses/expenses-month.ts`
- Test: `server/src/expenses/expenses-month.spec.ts`

**Interfaces:**
- Consumes: `missingRecurringExpenses`, `ExpenseRow`, `RecurringExpenseKey` (`reports/profit-composition.ts`); `tashkentMonthKey`, `addMonthsToMonthKey`, `utcMidnightFromDateStr`, `tashkentDateStr` (`common/date/tashkent.ts`); `uzMonthName`, `capitalizeUz` (`telegram-digest/uzbek-calendar.ts`).
- Produces:
  ```ts
  export const EXPENSE_FIRST_MONTH = '2026-05';
  export const PAGE_CATEGORIES: readonly ['RENT','UTILITIES','SUPPLIES','MARKETING','EQUIPMENT','MAINTENANCE','TAXES','OTHER'];
  export type PageCategory = (typeof PAGE_CATEGORIES)[number];
  export interface MonthExpenseRow { category: ExpenseCategory; description: string; amount: number; paymentMethod: ExpensePaymentMethod; date: Date; branchId: number; createdById: number }
  export interface CategoryRow { category: PageCategory; amount: number; count: number; lastMonthAmount: number; notRecorded: boolean }
  export interface MissingRow { key: RecurringExpenseKey; branchId: number; branchName: string; amount: number; lastMonthAmount: number; thisMonthAmount: number }
  export interface BranchRef { id: number; name: string; status: string; deletedAt: Date | null }
  export interface MonthSummary { month: string; isCurrentMonth: boolean; total: number; count: number; cashTotal: number; cardTotal: number; lastMonthTotal: number; byCategory: CategoryRow[]; missing: MissingRow[]; multiBranch: boolean; emptyBranches: { id: number; name: string }[]; creators: { id: number; firstName: string; lastName: string }[] }
  export function parseExpenseMonth(oy: string | undefined, now: Date): string; // 400s per §4.1
  export function expenseMonthWindow(month: string): { gte: Date; lt: Date };
  export function expenseMonthTitle(month: string): string; // '2026-10' → 'Oktabr 2026'
  export function summarize(rows: readonly MonthExpenseRow[]): { total: number; count: number; cashTotal: number; cardTotal: number };
  export function buildCategoryRows(thisMonth: readonly MonthExpenseRow[], lastMonth: readonly MonthExpenseRow[], isCurrentMonth: boolean): CategoryRow[];
  export function missingByBranch(lastMonth: readonly MonthExpenseRow[], thisMonth: readonly MonthExpenseRow[], branchNames: ReadonlyMap<number, string>): MissingRow[];
  export function emptyBranches(branches: readonly BranchRef[], thisMonth: readonly MonthExpenseRow[]): { id: number; name: string }[];
  ```

- [ ] **Step 0: Set up the worktree.** From the worktree root: `git fetch origin && git merge --no-edit origin/main` (the branch holds only the spec; expect no conflict). Then `cd server && npm install && npx prisma generate` (if `prisma generate` complains about `DATABASE_URL`, run `ln -s /Users/a1111/Desktop/daf-erp-system/server/.env .env` inside `server/` first — the symlink is git-ignored), and `cd ../client && npm install`.

- [ ] **Step 1: Write the failing spec** `server/src/expenses/expenses-month.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { tashkentDateStr, utcMidnightFromDateStr } from '../common/date/tashkent';
import { missingRecurringExpenses } from '../reports/profit-composition';
import {
  buildCategoryRows,
  emptyBranches,
  expenseMonthTitle,
  expenseMonthWindow,
  missingByBranch,
  PAGE_CATEGORIES,
  parseExpenseMonth,
  summarize,
  type MonthExpenseRow,
} from './expenses-month';

const NOW = new Date('2026-10-20T07:00:00Z'); // 20.10.2026 12:00 Tashkent

function row({ day, ...o }: Partial<MonthExpenseRow> & { day: string }): MonthExpenseRow {
  return { category: 'OTHER', description: '', amount: 0, paymentMethod: 'CASH', branchId: 1, createdById: 10001, ...o, date: utcMidnightFromDateStr(day) };
}

describe('parseExpenseMonth (spec B6 §4.1)', () => {
  it('empty is the current Tashkent month', () => {
    expect(parseExpenseMonth(undefined, NOW)).toBe('2026-10');
    expect(parseExpenseMonth('', NOW)).toBe('2026-10');
  });
  it('accepts May 2026 up to the current month', () => {
    expect(parseExpenseMonth('2026-05', NOW)).toBe('2026-05');
    expect(parseExpenseMonth('2026-10', NOW)).toBe('2026-10');
  });
  it('refuses a month before May 2026 and a future month', () => {
    expect(() => parseExpenseMonth('2026-04', NOW)).toThrow(new BadRequestException("Xarajatlar may 2026 dan boshlab ko'rsatiladi"));
    expect(() => parseExpenseMonth('2026-11', NOW)).toThrow(new BadRequestException("Kelajak oyni tanlab bo'lmaydi"));
  });
  it('00:30 on the 1st in Tashkent is already the new month (19:30 UTC the day before)', () => {
    const nov1 = new Date('2026-10-31T19:30:00Z');
    expect(parseExpenseMonth(undefined, nov1)).toBe('2026-11');
    expect(parseExpenseMonth('2026-11', nov1)).toBe('2026-11');
  });
});

describe('expenseMonthWindow / expenseMonthTitle', () => {
  it('plain UTC midnights, the next 1st exclusive', () => {
    expect(expenseMonthWindow('2026-10')).toEqual({ gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') });
    expect(expenseMonthWindow('2026-12')).toEqual({ gte: new Date('2026-12-01T00:00:00.000Z'), lt: new Date('2027-01-01T00:00:00.000Z') });
  });
  it('names the month for the PDF', () => {
    expect(expenseMonthTitle('2026-10')).toBe('Oktabr 2026');
    expect(expenseMonthTitle('2026-05')).toBe('May 2026');
  });
});

describe('summarize', () => {
  it('total, count, cash and card', () => {
    const rows = [row({ day: '2026-10-02', amount: 300_000 }), row({ day: '2026-10-03', amount: 200_000, paymentMethod: 'CARD' })];
    expect(summarize(rows)).toEqual({ total: 500_000, count: 2, cashTotal: 300_000, cardTotal: 200_000 });
  });
});

describe('buildCategoryRows (spec B6 §3.4, §5.2)', () => {
  const thisMonth = [
    row({ day: '2026-10-02', category: 'RENT', amount: 5_000_000 }),
    row({ day: '2026-10-03', category: 'OTHER', amount: 120_000 }),
    row({ day: '2026-10-04', category: 'OTHER', amount: 80_000 }),
  ];
  const lastMonth = [
    row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
    row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 }),
    row({ day: '2026-09-30', category: 'SUPPLIES', amount: 900_000 }),
  ];

  it('eight rows, the CEO order, never the advance', () => {
    const rows = buildCategoryRows(thisMonth, lastMonth, true);
    expect(rows.map((r) => r.category)).toEqual([...PAGE_CATEGORIES]);
    expect(rows.map((r) => r.category)).not.toContain('TEACHER_ADVANCE');
  });
  it('this month, its count and last month per category; the amounts add up to the total', () => {
    const rows = buildCategoryRows(thisMonth, lastMonth, true);
    expect(rows.find((r) => r.category === 'OTHER')).toEqual({ category: 'OTHER', amount: 200_000, count: 2, lastMonthAmount: 0, notRecorded: false });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(summarize(thisMonth).total);
  });
  it('«yozilmagan» only in the current month, only for rent, utilities and tax at 0 with last month above 0', () => {
    const current = buildCategoryRows(thisMonth, lastMonth, true);
    expect(current.filter((r) => r.notRecorded).map((r) => r.category)).toEqual(['UTILITIES']);
    expect(current.find((r) => r.category === 'SUPPLIES')?.notRecorded).toBe(false);
    expect(buildCategoryRows(thisMonth, lastMonth, false).some((r) => r.notRecorded)).toBe(false);
  });
});

describe('missingByBranch (spec B6 §4.3)', () => {
  const names = new Map([[1, 'Markaz'], [2, 'Shimol']]);
  const simple = (rows: MonthExpenseRow[]) => rows.map((r) => ({ category: r.category, description: r.description, amount: r.amount, dateStr: tashkentDateStr(r.date) }));

  it('one branch: exactly the Foyda forecast rule', () => {
    const last = [
      row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
      row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 }),
      row({ day: '2026-09-30', category: 'OTHER', description: 'Soliqlar', amount: 1_200_000 }),
    ];
    const now = [row({ day: '2026-10-05', category: 'UTILITIES', amount: 70_000 })];
    expect(missingByBranch(last, now, names).map(({ key, amount, lastMonthAmount }) => ({ key, amount, lastMonthAmount }))).toEqual(
      missingRecurringExpenses(simple(last), simple(now)).map(({ key, amount, lastMonthAmount }) => ({ key, amount, lastMonthAmount })),
    );
  });
  it('two branches: one over, one short — the short one shows', () => {
    const last = [row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000, branchId: 1 }), row({ day: '2026-09-28', category: 'RENT', amount: 3_000_000, branchId: 2 })];
    const now = [row({ day: '2026-10-02', category: 'RENT', amount: 6_000_000, branchId: 1 })];
    expect(missingByBranch(last, now, names)).toEqual([
      { key: 'RENT', branchId: 2, branchName: 'Shimol', amount: 3_000_000, lastMonthAmount: 3_000_000, thisMonthAmount: 0 },
    ]);
  });
  it('OTHER with «soliq» in the description is tax; part recorded leaves the rest', () => {
    const last = [row({ day: '2026-09-30', category: 'OTHER', description: 'Soliqlar', amount: 1_200_000 }), row({ day: '2026-09-29', category: 'UTILITIES', amount: 4_700_000 })];
    const now = [row({ day: '2026-10-05', category: 'UTILITIES', amount: 70_000 })];
    expect(missingByBranch(last, now, names)).toEqual([
      { key: 'TAXES', branchId: 1, branchName: 'Markaz', amount: 1_200_000, lastMonthAmount: 1_200_000, thisMonthAmount: 0 },
      { key: 'UTILITIES', branchId: 1, branchName: 'Markaz', amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 },
    ]);
  });
  it('branches by name', () => {
    const last = [row({ day: '2026-09-28', category: 'RENT', amount: 1, branchId: 2 }), row({ day: '2026-09-28', category: 'RENT', amount: 1, branchId: 1 })];
    expect(missingByBranch(last, [], names).map((m) => m.branchName)).toEqual(['Markaz', 'Shimol']);
  });
});

describe('emptyBranches (spec B6 §4.3)', () => {
  it('a live ACTIVE branch with no expense this month; never an inactive or deleted one', () => {
    const branches = [
      { id: 1, name: 'Markaz', status: 'ACTIVE', deletedAt: null },
      { id: 2, name: 'Shimol', status: 'ACTIVE', deletedAt: null },
      { id: 3, name: 'Janub', status: 'INACTIVE', deletedAt: null },
      { id: 4, name: 'Sharq', status: 'ACTIVE', deletedAt: new Date('2026-09-01T00:00:00Z') },
    ];
    expect(emptyBranches(branches, [row({ day: '2026-10-02', branchId: 1, amount: 1 })])).toEqual([{ id: 2, name: 'Shimol' }]);
  });
});
```

- [ ] **Step 2: Run** `cd server && npx jest src/expenses/expenses-month.spec.ts` → FAIL (`Cannot find module './expenses-month'`).

- [ ] **Step 3: Implement** `server/src/expenses/expenses-month.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { ExpenseCategory, ExpensePaymentMethod } from '@prisma/client';
import { addMonthsToMonthKey, tashkentDateStr, tashkentMonthKey, utcMidnightFromDateStr } from '../common/date/tashkent';
import { missingRecurringExpenses, type ExpenseRow, type RecurringExpenseKey } from '../reports/profit-composition';
import { capitalizeUz, uzMonthName } from '../telegram-digest/uzbek-calendar';

/**
 * Pure rules of the «Xarajatlar» month page (spec B6 §4). No database here;
 * `ExpensesMonthService` feeds them the rows it loaded.
 */

/** The page starts in May 2026 (spec B6 §4.1). */
export const EXPENSE_FIRST_MONTH = '2026-05';

/** The eight categories the page shows, in the CEO's fixed order; the advance is never one (spec B6 §2.3). */
export const PAGE_CATEGORIES = ['RENT', 'UTILITIES', 'SUPPLIES', 'MARKETING', 'EQUIPMENT', 'MAINTENANCE', 'TAXES', 'OTHER'] as const satisfies readonly ExpenseCategory[];
export type PageCategory = (typeof PAGE_CATEGORIES)[number];

const RECURRING_CATEGORIES = new Set<string>(['RENT', 'UTILITIES', 'TAXES']);

/** One expense as the month summary loads it: in scope, live, never an advance. */
export interface MonthExpenseRow {
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  date: Date;
  branchId: number;
  createdById: number;
}

export interface CategoryRow { category: PageCategory; amount: number; count: number; lastMonthAmount: number; notRecorded: boolean }
export interface MissingRow { key: RecurringExpenseKey; branchId: number; branchName: string; amount: number; lastMonthAmount: number; thisMonthAmount: number }
export interface BranchRef { id: number; name: string; status: string; deletedAt: Date | null }

/** `GET /expenses/month-summary` (spec B6 §5.2). */
export interface MonthSummary {
  month: string;
  isCurrentMonth: boolean;
  total: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  lastMonthTotal: number;
  byCategory: CategoryRow[];
  missing: MissingRow[];
  multiBranch: boolean;
  emptyBranches: { id: number; name: string }[];
  creators: { id: number; firstName: string; lastName: string }[];
}

/** `oy` as the page reads it: empty = the current Tashkent month; May 2026 up to it. */
export function parseExpenseMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (oy < EXPENSE_FIRST_MONTH) throw new BadRequestException("Xarajatlar may 2026 dan boshlab ko'rsatiladi");
  if (oy > current) throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  return oy;
}

/** `Expense.date` is `@db.Date`: plain UTC midnights, the next month's 1st exclusive. */
export function expenseMonthWindow(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}

/** '2026-10' → 'Oktabr 2026' (the PDF's «Davr» line). */
export function expenseMonthTitle(month: string): string {
  return `${capitalizeUz(uzMonthName(Number(month.slice(5, 7))))} ${month.slice(0, 4)}`;
}

export function summarize(rows: readonly MonthExpenseRow[]) {
  let total = 0;
  let cashTotal = 0;
  let cardTotal = 0;
  for (const r of rows) {
    total += r.amount;
    if (r.paymentMethod === 'CASH') cashTotal += r.amount;
    if (r.paymentMethod === 'CARD') cardTotal += r.amount;
  }
  return { total, count: rows.length, cashTotal, cardTotal };
}

function byCategory(rows: readonly MonthExpenseRow[]) {
  const out = new Map<string, { amount: number; count: number }>();
  for (const r of rows) {
    const cur = out.get(r.category) ?? { amount: 0, count: 0 };
    cur.amount += r.amount;
    cur.count += 1;
    out.set(r.category, cur);
  }
  return out;
}

/** Eight rows in the fixed order; `notRecorded` = current month, rent/utilities/tax, 0 now, more than 0 last month. */
export function buildCategoryRows(thisMonth: readonly MonthExpenseRow[], lastMonth: readonly MonthExpenseRow[], isCurrentMonth: boolean): CategoryRow[] {
  const now = byCategory(thisMonth);
  const last = byCategory(lastMonth);
  return PAGE_CATEGORIES.map((category) => {
    const amount = now.get(category)?.amount ?? 0;
    const lastMonthAmount = last.get(category)?.amount ?? 0;
    return {
      category,
      amount,
      count: now.get(category)?.count ?? 0,
      lastMonthAmount,
      notRecorded: isCurrentMonth && RECURRING_CATEGORIES.has(category) && amount === 0 && lastMonthAmount > 0,
    };
  });
}

const toExpenseRow = (r: MonthExpenseRow): ExpenseRow => ({ category: r.category, description: r.description, amount: r.amount, dateStr: tashkentDateStr(r.date) });

/**
 * The Foyda forecast's rule (`missingRecurringExpenses`), called once per
 * branch (spec B6 §4.3): «Yozish» writes ONE branch's expense (D4), and a sum
 * over branches would let one branch's surplus hide another's gap.
 */
export function missingByBranch(lastMonth: readonly MonthExpenseRow[], thisMonth: readonly MonthExpenseRow[], branchNames: ReadonlyMap<number, string>): MissingRow[] {
  const name = (id: number) => branchNames.get(id) ?? '';
  const ids = [...new Set(lastMonth.map((r) => r.branchId))].sort((a, b) => name(a).localeCompare(name(b)) || a - b);
  return ids.flatMap((branchId) =>
    missingRecurringExpenses(
      lastMonth.filter((r) => r.branchId === branchId).map(toExpenseRow),
      thisMonth.filter((r) => r.branchId === branchId).map(toExpenseRow),
    ).map((m) => ({ key: m.key, branchId, branchName: name(branchId), amount: m.amount, lastMonthAmount: m.lastMonthAmount, thisMonthAmount: m.lastMonthAmount - m.amount })),
  );
}

/** A live ACTIVE branch with no expense this month (spec B6 §4.3). */
export function emptyBranches(branches: readonly BranchRef[], thisMonth: readonly MonthExpenseRow[]): { id: number; name: string }[] {
  const recorded = new Set(thisMonth.map((r) => r.branchId));
  return branches.filter((b) => b.deletedAt === null && b.status === 'ACTIVE' && !recorded.has(b.id)).map(({ id, name }) => ({ id, name }));
}
```

- [ ] **Step 4: Run** `npx jest src/expenses/expenses-month.spec.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Commit** (from `server/`)

```bash
npx prettier --write src/expenses/expenses-month.ts src/expenses/expenses-month.spec.ts
npx eslint src/expenses/expenses-month.ts src/expenses/expenses-month.spec.ts
git add src/expenses/expenses-month.ts src/expenses/expenses-month.spec.ts
git commit -m "feat(expenses): pure month rules for the B6 page — window, categories, per-branch missing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The hint rule (pure)

**Files:**
- Create: `server/src/expenses/expense-hints.ts`
- Test: `server/src/expenses/expense-hints.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type ExpenseHint = 'SALARY' | 'EQUIPMENT' | 'UTILITIES';
  export function expenseHint(e: { category: string; description: string | null }): ExpenseHint | null;
  ```

- [ ] **Step 1: Write the failing spec** `server/src/expenses/expense-hints.spec.ts`:

```ts
import { expenseHint } from './expense-hints';

const other = (description: string) => expenseHint({ category: 'OTHER', description });

describe('expenseHint (spec B6 §4.4)', () => {
  it.each([
    ['Farrosh oyligi', 'SALARY'],
    ['Tozalovchi uchun', 'SALARY'],
    ['Qorovulga maosh', 'SALARY'],
    ['Ish haqi qo‘shimcha', 'SALARY'],
    ['Stullar', 'EQUIPMENT'],
    ['Yangi noutbuk', 'EQUIPMENT'],
    ['Proyektor lampasi', 'EQUIPMENT'],
    ['Internet', 'UTILITIES'],
    ['Svet puli', 'UTILITIES'],
    ['Domen uzaytirish', 'UTILITIES'],
  ])('%s → %s', (description, hint) => {
    expect(other(description)).toBe(hint);
  });

  it('only on «Boshqa» rows', () => {
    expect(expenseHint({ category: 'UTILITIES', description: 'Internet' })).toBeNull();
    expect(expenseHint({ category: 'EQUIPMENT', description: 'Stul' })).toBeNull();
    expect(expenseHint({ category: 'RENT', description: 'Qorovul xonasi ijarasi' })).toBeNull();
  });

  it('from the start of a word: «stullar» yes, «pastol» no', () => {
    expect(other('Stullar')).toBe('EQUIPMENT');
    expect(other('Pastol')).toBeNull();
    expect(other('Ofis uchun stol')).toBe('EQUIPMENT');
  });

  it('ignores case', () => {
    expect(other('INTERNET')).toBe('UTILITIES');
    expect(other('sTuL')).toBe('EQUIPMENT');
  });

  it('one hint: SALARY before EQUIPMENT before UTILITIES', () => {
    expect(other('Kompyuter va internet')).toBe('EQUIPMENT');
    expect(other('Internet va avans')).toBe('SALARY');
    expect(other('Oylik va stul')).toBe('SALARY');
  });

  it('an empty description has none; a wrong hint is accepted (CEO decision 5)', () => {
    expect(other('')).toBeNull();
    expect(expenseHint({ category: 'OTHER', description: null })).toBeNull();
    expect(other('Instagram oylik obunasi')).toBe('SALARY');
  });
});
```

- [ ] **Step 2: Run** `npx jest src/expenses/expense-hints.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `server/src/expenses/expense-hints.ts`:

```ts
/**
 * Hint pills on «Boshqa» rows (spec B6 §4.4, CEO decision 5): a keyword in the
 * description suggests another category, or that a salary was entered as an
 * expense (subtracted from profit twice). One hint per row, the costliest
 * mistake first. A wrong hint now and then is accepted. The words live here
 * only; the client maps the code to its text.
 */
export type ExpenseHint = 'SALARY' | 'EQUIPMENT' | 'UTILITIES';

const KEYWORDS: readonly (readonly [ExpenseHint, readonly string[]])[] = [
  ['SALARY', ['oylik', 'maosh', 'ish haqi', 'avans', 'tozalovchi', 'farrosh', 'yordamchi', 'qorovul', 'oshpaz']],
  ['EQUIPMENT', ['stul', 'stol', 'kompyuter', 'noutbuk', 'printer', 'mebel', 'shkaf', 'doska', 'proyektor', 'monitor', 'konditsioner', 'televizor', 'kolonka', 'mikrofon']],
  ['UTILITIES', ['internet', 'svet', 'elektr', 'gaz', 'suv', 'issiqlik', 'isitish', 'hosting', 'server', 'domen', 'chiqindi']],
];

// From the start of a word, any case: «stul» finds «Stullar», not «pastol».
const PATTERNS = KEYWORDS.map(([hint, words]) => [hint, new RegExp(`(^|[^\\p{L}])(${words.join('|')})`, 'iu')] as const);

export function expenseHint(e: { category: string; description: string | null }): ExpenseHint | null {
  if (e.category !== 'OTHER') return null;
  const text = e.description ?? '';
  for (const [hint, pattern] of PATTERNS) if (pattern.test(text)) return hint;
  return null;
}
```

- [ ] **Step 4: Run** `npx jest src/expenses/expense-hints.spec.ts` → PASS.

- [ ] **Step 5: Commit** (from `server/`)

```bash
npx prettier --write src/expenses/expense-hints.ts src/expenses/expense-hints.spec.ts
npx eslint src/expenses/expense-hints.ts src/expenses/expense-hints.spec.ts
git add src/expenses/expense-hints.ts src/expenses/expense-hints.spec.ts
git commit -m "feat(expenses): keyword hint pills for «Boshqa» rows (salary, equipment, utilities)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `ExpensesMonthService` and the parity proof

**Files:**
- Create: `server/src/expenses/expenses-month.service.ts`
- Test: `server/src/expenses/expenses-month.service.spec.ts`, `server/src/expenses/expenses-month.profit-parity.spec.ts`

**Interfaces:**
- Consumes: Task 1 (`parseExpenseMonth`, `expenseMonthWindow`, `summarize`, `buildCategoryRows`, `missingByBranch`, `emptyBranches`, `MonthExpenseRow`, `MonthSummary`); `branchIdWhere`, `ReportBranchIds` (`common/finance/report-branch-scope.ts`); `ReportsProfitLossService.getProfitLoss` and `buildNetProfit` (tests only).
- Produces:
  ```ts
  @Injectable() export class ExpensesMonthService {
    monthSummary(companyId: number, branchIds: ReportBranchIds, oy: string | undefined, now?: Date): Promise<MonthSummary>;
  }
  ```
  The caller (controller, Task 5) has already refused an empty scope.

- [ ] **Step 1: Write the failing service spec** `server/src/expenses/expenses-month.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { utcMidnightFromDateStr } from '../common/date/tashkent';
import { ExpensesMonthService } from './expenses-month.service';
import type { MonthExpenseRow } from './expenses-month';

const NOW = new Date('2026-10-20T07:00:00Z');
const OCT_1 = utcMidnightFromDateStr('2026-10-01').getTime();

function row({ day, ...o }: Partial<MonthExpenseRow> & { day: string }): MonthExpenseRow {
  return { category: 'OTHER', description: '', amount: 0, paymentMethod: 'CASH', branchId: 1, createdById: 10001, ...o, date: utcMidnightFromDateStr(day) };
}

// Made-up month: two branches, a third inactive.
const OCTOBER = [
  row({ day: '2026-10-03', category: 'RENT', amount: 5_000_000 }),
  row({ day: '2026-10-05', category: 'UTILITIES', amount: 70_000, paymentMethod: 'CARD', createdById: 10002 }),
];
const SEPTEMBER = [
  row({ day: '2026-09-28', category: 'RENT', amount: 5_000_000 }),
  row({ day: '2026-09-30', category: 'UTILITIES', amount: 4_700_000 }),
  row({ day: '2026-09-30', category: 'OTHER', description: 'Soliqlar', amount: 1_200_000, branchId: 2 }),
];
const BRANCHES = [
  { id: 1, name: 'Markaz', status: 'ACTIVE', deletedAt: null },
  { id: 2, name: 'Shimol', status: 'ACTIVE', deletedAt: null },
  { id: 3, name: 'Janub', status: 'INACTIVE', deletedAt: null },
];

describe('ExpensesMonthService.monthSummary (spec B6 §5.2)', () => {
  let service: ExpensesMonthService;
  const prisma = {
    expense: { findMany: jest.fn() },
    branch: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.expense.findMany.mockImplementation(({ where }: { where: { date: { gte: Date } } }) =>
      Promise.resolve(where.date.gte.getTime() === OCT_1 ? OCTOBER : SEPTEMBER),
    );
    prisma.branch.findMany.mockResolvedValue(BRANCHES);
    prisma.user.findMany.mockResolvedValue([
      { id: 10002, firstName: 'Ism', lastName: 'Aliyev' },
      { id: 10001, firstName: 'Ism', lastName: 'Karimov' },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [ExpensesMonthService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(ExpensesMonthService);
  });

  it('the current month: totals, eight categories, the per-branch gaps, the empty branch, the authors', async () => {
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s).toMatchObject({ month: '2026-10', isCurrentMonth: true, total: 5_070_000, count: 2, cashTotal: 5_000_000, cardTotal: 70_000, lastMonthTotal: 10_900_000, multiBranch: true });
    expect(s.byCategory).toHaveLength(8);
    expect(s.byCategory.find((r) => r.category === 'UTILITIES')).toEqual({ category: 'UTILITIES', amount: 70_000, count: 1, lastMonthAmount: 4_700_000, notRecorded: false });
    // Tax written under «Boshqa» stays in that row; the warning still counts it (spec §10).
    expect(s.byCategory.find((r) => r.category === 'OTHER')?.lastMonthAmount).toBe(1_200_000);
    expect(s.missing).toEqual([
      { key: 'UTILITIES', branchId: 1, branchName: 'Markaz', amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 },
      { key: 'TAXES', branchId: 2, branchName: 'Shimol', amount: 1_200_000, lastMonthAmount: 1_200_000, thisMonthAmount: 0 },
    ]);
    expect(s.emptyBranches).toEqual([{ id: 2, name: 'Shimol' }]);
    expect(s.creators).toEqual([
      { id: 10002, firstName: 'Ism', lastName: 'Aliyev' },
      { id: 10001, firstName: 'Ism', lastName: 'Karimov' },
    ]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [10001, 10002] } }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] }));
  });

  it('a past month carries no warning rows', async () => {
    const s = await service.monthSummary(1, null, '2026-09', NOW);
    expect(s.isCurrentMonth).toBe(false);
    expect(s.missing).toEqual([]);
    expect(s.emptyBranches).toEqual([]);
    expect(s.byCategory.some((r) => r.notRecorded)).toBe(false);
  });

  it('reads the canonical set: company, live, no advance, the month window (lt), this month then last month', async () => {
    await service.monthSummary(1, null, undefined, NOW);
    const [first, second] = prisma.expense.findMany.mock.calls.map((c: [{ where: unknown }]) => c[0].where);
    expect(first).toEqual({ companyId: 1, deletedAt: null, category: { not: 'TEACHER_ADVANCE' }, date: { gte: new Date('2026-10-01T00:00:00.000Z'), lt: new Date('2026-11-01T00:00:00.000Z') } });
    expect(second).toMatchObject({ date: { gte: new Date('2026-09-01T00:00:00.000Z'), lt: new Date('2026-10-01T00:00:00.000Z') } });
  });

  it('with a scope, every expense read carries the branch predicate, and the branch list is scoped too', async () => {
    await service.monthSummary(1, [2], undefined, NOW);
    for (const [arg] of prisma.expense.findMany.mock.calls as [{ where: { branchId?: unknown } }][]) {
      expect(arg.where.branchId).toEqual({ in: [2] });
    }
    expect(prisma.branch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 1, id: { in: [2] } } }));
  });

  it('no author this month → no user read', async () => {
    prisma.expense.findMany.mockResolvedValue([]);
    const s = await service.monthSummary(1, null, undefined, NOW);
    expect(s.creators).toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('refuses a month outside May 2026 … now', async () => {
    await expect(service.monthSummary(1, null, '2026-04', NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Write the failing parity spec** `server/src/expenses/expenses-month.profit-parity.spec.ts`:

```ts
import type { PrismaService } from '../prisma/prisma.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { addDaysToDateStr, addMonthsToMonthKey, utcMidnightFromDateStr } from '../common/date/tashkent';
import { ReportsProfitLossService } from '../reports/reports-profit-loss.service';
import { buildNetProfit } from '../reports/reports-excel.helpers';
import { ExpensesMonthService } from './expenses-month.service';

/**
 * Spec B6 §4.2 / §8: the page's month total is the canonical net profit's
 * `operatingExpenses` for the same month and scope. Both services run over
 * the same in-memory rows through a tiny Prisma stand-in that understands
 * exactly the predicates they send (an unknown one throws, so a new filter
 * cannot pass silently).
 */
interface Row {
  companyId: number;
  branchId: number;
  category: string;
  amount: number;
  paymentMethod: 'CASH' | 'CARD';
  description: string;
  date: Date;
  deletedAt: Date | null;
  createdById: number;
}

function matches(row: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (key === 'date') {
      const t = (value as Date).getTime();
      const c = cond as { gte?: Date; lte?: Date; lt?: Date };
      if (c.gte && t < c.gte.getTime()) return false;
      if (c.lte && t > c.lte.getTime()) return false;
      if (c.lt && t >= c.lt.getTime()) return false;
      continue;
    }
    if (cond !== null && typeof cond === 'object') {
      const c = cond as { in?: unknown[]; not?: unknown };
      const known = Object.keys(c).every((k) => k === 'in' || k === 'not');
      if (!known) throw new Error(`fake prisma: unsupported filter on ${key}`);
      if (c.in && !c.in.includes(value)) return false;
      if ('not' in c && value === c.not) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function fakePrisma(rows: Row[]) {
  return {
    expense: {
      findMany: ({ where }: { where: Record<string, unknown> }) => Promise.resolve(rows.filter((r) => matches(r, where))),
      groupBy: ({ where }: { where: Record<string, unknown> }) => {
        const sums = new Map<string, number>();
        for (const r of rows.filter((x) => matches(x, where))) sums.set(r.category, (sums.get(r.category) ?? 0) + r.amount);
        return Promise.resolve([...sums].map(([category, amount]) => ({ category, _sum: { amount } })));
      },
    },
    payment: { groupBy: () => Promise.resolve([]) },
    salaryPayment: { findMany: () => Promise.resolve([]) },
    branch: { findMany: () => Promise.resolve([]) },
    user: { findMany: () => Promise.resolve([]) },
  } as unknown as PrismaService;
}

const NOW = new Date('2026-10-20T07:00:00Z');
const lastDay = (month: string) => addDaysToDateStr(`${addMonthsToMonthKey(month, 1)}-01`, -1);

async function both(rows: Row[], month: string, branchIds: ReportBranchIds) {
  const prisma = fakePrisma(rows);
  const page = await new ExpensesMonthService(prisma).monthSummary(1, branchIds, month, NOW);
  const pl = await new ReportsProfitLossService(prisma).getProfitLoss(1, { branchIds, startDate: `${month}-01`, endDate: lastDay(month) });
  return { page: page.total, canonical: buildNetProfit(pl, null, null, month, 0).operatingExpenses };
}

const base = (o: Partial<Row> & { day: string }): Row => {
  const { day, ...rest } = o;
  return { companyId: 1, branchId: 1, category: 'OTHER', amount: 0, paymentMethod: 'CASH', description: '', deletedAt: null, createdById: 10001, ...rest, date: utcMidnightFromDateStr(day) };
};

describe('month total === canonical operatingExpenses (spec B6 §4.2)', () => {
  // Every edge at once: the day before, the first and last day, the day after,
  // an advance, a deleted row, another branch, another company.
  const EDGES: Row[] = [
    base({ day: '2026-09-30', category: 'RENT', amount: 5_000_000 }),
    base({ day: '2026-10-01', category: 'UTILITIES', amount: 700_000 }),
    base({ day: '2026-10-31', category: 'OTHER', amount: 300_000 }),
    base({ day: '2026-11-01', category: 'MARKETING', amount: 400_000 }),
    base({ day: '2026-10-10', category: 'TEACHER_ADVANCE', amount: 1_000_000 }),
    base({ day: '2026-10-12', category: 'SUPPLIES', amount: 200_000, deletedAt: new Date('2026-10-13T08:00:00Z') }),
    base({ day: '2026-10-15', category: 'EQUIPMENT', amount: 900_000, branchId: 2 }),
    base({ day: '2026-10-15', category: 'TAXES', amount: 600_000, companyId: 2 }),
  ];

  it('the edges, branch 1: 1 000 000 on both sides', async () => {
    expect(await both(EDGES, '2026-10', [1])).toEqual({ page: 1_000_000, canonical: 1_000_000 });
  });
  it('the edges, every branch: 1 900 000 on both sides', async () => {
    expect(await both(EDGES, '2026-10', null)).toEqual({ page: 1_900_000, canonical: 1_900_000 });
  });

  function rng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const CATEGORIES = ['RENT', 'UTILITIES', 'SUPPLIES', 'MARKETING', 'TEACHER_ADVANCE', 'EQUIPMENT', 'MAINTENANCE', 'TAXES', 'OTHER'];
  const DAYS = ['2026-08-31', '2026-09-01', '2026-09-15', '2026-09-30', '2026-10-01', '2026-10-16', '2026-10-31', '2026-11-01'];
  function randomRows(seed: number): Row[] {
    const r = rng(seed);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    return Array.from({ length: 40 }, () =>
      base({
        day: pick(DAYS),
        companyId: r() < 0.9 ? 1 : 2,
        branchId: pick([1, 2, 3]),
        category: pick(CATEGORIES),
        amount: 1 + Math.floor(r() * 2_000_000),
        paymentMethod: r() < 0.5 ? 'CASH' : 'CARD',
        description: pick(['Ijara', 'Soliqlar', 'Stul', 'Internet']),
        deletedAt: r() < 0.1 ? new Date('2026-10-02T10:00:00Z') : null,
      }),
    );
  }

  it.each<[string, ReportBranchIds]>([
    ['every branch', null],
    ['branch 1', [1]],
    ['branches 1 and 2', [1, 2]],
  ])('random months (%s): equal to the so\'m', async (_name, branchIds) => {
    for (let seed = 1; seed <= 100; seed++) {
      const rows = randomRows(seed);
      for (const month of ['2026-09', '2026-10']) {
        const { page, canonical } = await both(rows, month, branchIds);
        expect({ seed, month, total: page }).toEqual({ seed, month, total: canonical });
      }
    }
  });
});
```

- [ ] **Step 3: Run** `npx jest src/expenses/expenses-month.service.spec.ts src/expenses/expenses-month.profit-parity.spec.ts` → FAIL (`Cannot find module './expenses-month.service'`).

- [ ] **Step 4: Implement** `server/src/expenses/expenses-month.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { addMonthsToMonthKey, tashkentMonthKey } from '../common/date/tashkent';
import { branchIdWhere, type ReportBranchIds } from '../common/finance/report-branch-scope';
import {
  buildCategoryRows,
  emptyBranches,
  expenseMonthWindow,
  missingByBranch,
  parseExpenseMonth,
  summarize,
  type MonthExpenseRow,
  type MonthSummary,
} from './expenses-month';

/**
 * `GET /expenses/month-summary` (spec B6 §5.2): the month card, «Bu oy hali
 * yozilmagan» and the «Kim kiritgan» options. Every figure is computed in
 * memory from two row reads (this month, last month); the total is the same
 * set the canonical net profit subtracts as `operatingExpenses`
 * (`expenses-month.profit-parity.spec.ts`). No cache: a month holds a few dozen rows.
 */
@Injectable()
export class ExpensesMonthService {
  constructor(private prisma: PrismaService) {}

  async monthSummary(companyId: number, branchIds: ReportBranchIds, oy: string | undefined, now = new Date()): Promise<MonthSummary> {
    const month = parseExpenseMonth(oy, now);
    const isCurrentMonth = month === tashkentMonthKey(now);
    const [thisMonth, lastMonth, branches] = await Promise.all([
      this.loadRows(companyId, branchIds, month),
      this.loadRows(companyId, branchIds, addMonthsToMonthKey(month, -1)),
      this.prisma.branch.findMany({
        where: { companyId, ...(branchIds && { id: { in: branchIds } }) },
        select: { id: true, name: true, status: true, deletedAt: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const creatorIds = [...new Set(thisMonth.map((r) => r.createdById))].sort((a, b) => a - b);
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, firstName: true, lastName: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
      : [];
    return {
      month,
      isCurrentMonth,
      ...summarize(thisMonth),
      lastMonthTotal: summarize(lastMonth).total,
      byCategory: buildCategoryRows(thisMonth, lastMonth, isCurrentMonth),
      missing: isCurrentMonth ? missingByBranch(lastMonth, thisMonth, new Map(branches.map((b) => [b.id, b.name]))) : [],
      multiBranch: branches.filter((b) => b.deletedAt === null).length > 1,
      emptyBranches: isCurrentMonth ? emptyBranches(branches, thisMonth) : [],
      creators,
    };
  }

  /** The canonical set (spec B6 §4.2): company, live, never an advance, the month, the scope. */
  private loadRows(companyId: number, branchIds: ReportBranchIds, month: string): Promise<MonthExpenseRow[]> {
    return this.prisma.expense.findMany({
      where: { companyId, deletedAt: null, category: { not: 'TEACHER_ADVANCE' }, date: expenseMonthWindow(month), ...branchIdWhere(branchIds) },
      select: { category: true, description: true, amount: true, paymentMethod: true, date: true, branchId: true, createdById: true },
    });
  }
}
```
(Deleted or inactive staff stay in `creators`: their expenses still stand — spec §4.5. Their names come from one `user.findMany`; the branches' from one `branch.findMany`.)

- [ ] **Step 5: Run** `npx jest src/expenses/expenses-month.service.spec.ts src/expenses/expenses-month.profit-parity.spec.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 6: Commit** (from `server/`)

```bash
npx prettier --write src/expenses/expenses-month.service.ts src/expenses/expenses-month.service.spec.ts src/expenses/expenses-month.profit-parity.spec.ts
npx eslint src/expenses/expenses-month.service.ts src/expenses/expenses-month.service.spec.ts src/expenses/expenses-month.profit-parity.spec.ts
git add src/expenses/expenses-month.service.ts src/expenses/expenses-month.service.spec.ts src/expenses/expenses-month.profit-parity.spec.ts
git commit -m "feat(expenses): month summary loader; its total proved equal to the canonical operatingExpenses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The list and the PDF read the month

**Files:**
- Modify: `server/src/expenses/dto/expense-query.dto.ts` (two fields)
- Modify: `server/src/expenses/expenses.service.ts` (imports `:13-30`, `METHOD_LABELS` `:44-47`, `buildWhere` `:301-338`, `listSelect` `:340-351` + new `listOrder`, `findAll` `:353-410`, `exportAll` `:414-425`, `generateExpensesPdf` `:483-542`)
- Modify: `server/src/expenses/pdf/expenses-template.ts` (`ExpensesPdfInput` `:31-48`, `filterBlock` `:119-126`, `totalsBlock` `:204`)
- Modify: `server/src/expenses/expenses.controller.ts` (`exportPdf` `:98-107` — only the file name; the route is Task 5)
- Test: `server/src/expenses/expenses.service.spec.ts` (replace the «omits the date filter» case, extend `exportAll`), create `server/src/expenses/expenses.service.pdf.spec.ts`, `server/src/expenses/expenses.controller.spec.ts` (the pdf case)

**Interfaces:**
- Consumes: Task 1 (`parseExpenseMonth`, `expenseMonthWindow`, `expenseMonthTitle`), Task 2 (`expenseHint`).
- Produces:
  - `ExpenseQueryDto.oy?: string` (`YYYY-MM`), `ExpenseQueryDto.createdById?: number[]`.
  - `GET /expenses` rows carry `hint: ExpenseHint | null`; order `date desc, createdAt desc, id desc`; no `oy` and no range = the current month.
  - `ExpensesService.generateExpensesPdf(query, companyId, branchIds): Promise<{ buffer: Buffer; filename: string }>` (was `Promise<Buffer>`).
  - `ExpensesPdfInput.creatorLabel: string | null`.

- [ ] **Step 1: Failing service tests.** In `expenses.service.spec.ts` add the imports

```ts
import { tashkentMonthKey } from '../common/date/tashkent';
import { expenseMonthWindow } from './expenses-month';
```

replace the case `it('omits the date filter entirely when neither bound is given', …)` with

```ts
  it('defaults to the current Tashkent month when neither oy nor a range is given', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().date).toEqual(expenseMonthWindow(tashkentMonthKey(new Date())));
  });

  it('reads ?oy= as the Tashkent month window, the next 1st exclusive', async () => {
    await service.findAll({ oy: '2026-09' } as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().date).toEqual({ gte: new Date('2026-09-01T00:00:00.000Z'), lt: new Date('2026-10-01T00:00:00.000Z') });
  });

  it('refuses oy together with the old range, before any read', async () => {
    await expect(service.findAll({ oy: '2026-09', startDate: '2026-09-01' } as ExpenseQueryDto, COMPANY_ID, null)).rejects.toThrow("Oy yoki sana oralig'i — ikkalasi birga emas");
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['2026-04', "Xarajatlar may 2026 dan boshlab ko'rsatiladi"],
    ['2099-01', "Kelajak oyni tanlab bo'lmaydi"],
  ])('refuses oy=%s with 400', async (oy, message) => {
    await expect(service.findAll({ oy } as ExpenseQueryDto, COMPANY_ID, null)).rejects.toThrow(new BadRequestException(message));
  });

  it('filters «Kim kiritgan» by one author or several', async () => {
    await service.findAll({ createdById: [10234] } as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().createdById).toBe(10234);
    prisma.expense.findMany.mockClear();
    await service.findAll({ createdById: [10234, 10567] } as ExpenseQueryDto, COMPANY_ID, null);
    expect(whereArg().createdById).toEqual({ in: [10234, 10567] });
  });

  it('orders by date, then entry time, then id — newest first', async () => {
    await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(prisma.expense.findMany.mock.calls[0][0].orderBy).toEqual([{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('gives every row its hint', async () => {
    prisma.expense.findMany.mockResolvedValue([
      { id: 'e1', category: 'OTHER', description: 'Stullar' },
      { id: 'e2', category: 'RENT', description: 'Ijara' },
    ]);
    const res = await service.findAll({} as ExpenseQueryDto, COMPANY_ID, null);
    expect(res.data.map((r) => r.hint)).toEqual(['EQUIPMENT', null]);
  });
```

and in `describe('exportAll')` add, after `expect(call.take).toBeUndefined();`:

```ts
      expect(call.orderBy).toEqual([{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
```

- [ ] **Step 2: Failing PDF spec** `server/src/expenses/expenses.service.pdf.spec.ts`:

```ts
jest.mock('../receipts/pdf/render', () => ({
  renderPdf: jest.fn(() => Promise.resolve(Buffer.from('%PDF-1.4'))),
  getCompanyLogoDataUrl: () => null,
}));

import { Test } from '@nestjs/testing';
import { renderPdf } from '../receipts/pdf/render';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { EntityHistoryService } from '../common/entity-history';
import { PermissionsService } from '../common/permissions/permissions.service';
import { tashkentDateStr, tashkentMonthKey } from '../common/date/tashkent';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpensesService } from './expenses.service';

describe('ExpensesService — the PDF reads the month (spec B6 §5.3)', () => {
  let service: ExpensesService;
  const prisma = {
    expense: { findMany: jest.fn() },
    company: { findUnique: jest.fn() },
    branch: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
  };
  const ROW = {
    id: 'e1', category: 'RENT', paymentMethod: 'CASH', amount: 5_000_000, description: 'Ijara',
    date: new Date('2026-09-05T00:00:00.000Z'), branchId: 1, receiptUrl: null,
    createdAt: new Date('2026-09-05T09:30:00.000Z'), createdBy: { id: 10001, firstName: 'Ism', lastName: 'Familiya' },
  };
  const doc = () => JSON.stringify((renderPdf as jest.Mock).mock.calls[0][0]);

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.expense.findMany.mockResolvedValue([ROW]);
    prisma.company.findUnique.mockResolvedValue({ name: 'Markaz' });
    prisma.branch.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: {} },
        { provide: EntityHistoryService, useValue: {} },
        { provide: PermissionsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ExpensesService);
  });

  it('names the month on the «Davr» line and in the file name', async () => {
    const res = await service.generateExpensesPdf({ oy: '2026-09' } as ExpenseQueryDto, 1, null);
    expect(res.filename).toBe('xarajatlar-2026-09.pdf');
    expect(res.buffer.toString().startsWith('%PDF')).toBe(true);
    expect(doc()).toContain('Sentabr 2026');
  });

  it('no oy and no range: the current month', async () => {
    const res = await service.generateExpensesPdf({} as ExpenseQueryDto, 1, null);
    expect(res.filename).toBe(`xarajatlar-${tashkentMonthKey(new Date())}.pdf`);
  });

  it('lists who entered them when «Kim kiritgan» is filtered', async () => {
    prisma.user.findMany.mockResolvedValue([{ firstName: 'Ism', lastName: 'Aliyev' }]);
    await service.generateExpensesPdf({ oy: '2026-09', createdById: [10234] } as ExpenseQueryDto, 1, null);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [10234] } } }));
    expect(doc()).toContain('Kim kiritgan:');
    expect(doc()).toContain('Ism Aliyev');
  });

  it('no «Kim kiritgan» line without the filter', async () => {
    await service.generateExpensesPdf({ oy: '2026-09' } as ExpenseQueryDto, 1, null);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(doc()).not.toContain('Kim kiritgan:');
  });

  it('prints «Naqd», never «Naqt»', async () => {
    await service.generateExpensesPdf({ oy: '2026-09' } as ExpenseQueryDto, 1, null);
    expect(doc()).toContain('Naqd');
    expect(doc()).not.toContain('Naqt');
  });

  it('keeps the old range label and today\'s file name for a client on the old page', async () => {
    const res = await service.generateExpensesPdf({ startDate: '2026-10-01', endDate: '2026-10-31' } as ExpenseQueryDto, 1, null);
    expect(res.filename).toBe(`xarajatlar-${tashkentDateStr(new Date())}.pdf`);
    expect(doc()).toContain('01.10.2026 — 31.10.2026');
  });
});
```

and in `expenses.controller.spec.ts` change the pdf case: `generateExpensesPdf: jest.fn().mockResolvedValue({ buffer: Buffer.from('%PDF-1.4'), filename: 'xarajatlar-2026-10.pdf' }),` in `mockService`, and after `expect(String(headers['Content-Disposition'])).toContain('attachment');` add

```ts
      expect(String(headers['Content-Disposition'])).toContain('xarajatlar-2026-10.pdf');
```

- [ ] **Step 3: Run** `npx jest src/expenses` → FAIL (no `oy` handling, no `hint`, PDF returns a Buffer).

- [ ] **Step 4: Implement.**

  - `dto/expense-query.dto.ts`: import `Matches` from `class-validator` and `toNumberArray` beside `toStringArray`; add after `endDate`:

```ts
  /** The page's month, `YYYY-MM` (spec B6 §4.1). The old `startDate`/`endDate` stay for the deploy window. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Oy YYYY-MM ko'rinishida bo'lishi kerak" })
  oy?: string;

  /** «Kim kiritgan»: `?createdById=10234,10567` (spec B6 §4.5). */
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  createdById?: number[];
```

  - `expenses.service.ts` imports: `import { tashkentDateStr, utcMidnightFromDateStr } from '../common/date/tashkent';` (replacing the single import), plus

```ts
import { expenseHint } from './expense-hints';
import { expenseMonthTitle, expenseMonthWindow, parseExpenseMonth } from './expenses-month';
```

  - `METHOD_LABELS`: `CASH: 'Naqd',`; the two comments that say «Jami / Naqt / Karta» (in `findAll` and `generateExpensesPdf`) read «Jami / Naqd / Karta».
  - In `buildWhere`, replace the block from `// Date is a date-only column, so a midnight `lte` …` to the end of the `date` spread with

```ts
      ...(query.createdById?.length && {
        createdById: equalsOrIn(query.createdById),
      }),
      date: this.dateWhere(query),
```

    and add, right after `buildWhere`:

```ts
  /**
   * The month a read covers (spec B6 §4.1): `oy`, or the current Tashkent month
   * when neither `oy` nor the old range is sent. `null` = the old
   * `startDate`/`endDate` range, kept for a client still on the old page.
   */
  private monthOf(query: ExpenseQueryDto): string | null {
    const legacy = Boolean(query.startDate || query.endDate);
    if (query.oy && legacy) {
      throw new BadRequestException("Oy yoki sana oralig'i — ikkalasi birga emas");
    }
    return legacy ? null : parseExpenseMonth(query.oy, new Date());
  }

  // `Expense.date` is a date-only column: the month is [1st, next 1st); the old
  // range keeps its midnight `lte` (either bound works on its own).
  private dateWhere(query: ExpenseQueryDto): { gte?: Date; lt?: Date; lte?: Date } {
    const month = this.monthOf(query);
    if (month) return expenseMonthWindow(month);
    return {
      ...(query.startDate && { gte: utcMidnightFromDateStr(query.startDate) }),
      ...(query.endDate && { lte: utcMidnightFromDateStr(query.endDate) }),
    };
  }
```

  - After `listSelect` add

```ts
  // Newest first; `createdAt` and `id` keep one day's rows from jumping between pages.
  private readonly listOrder = [
    { date: 'desc' },
    { createdAt: 'desc' },
    { id: 'desc' },
  ] satisfies Prisma.ExpenseOrderByWithRelationInput[];
```

  - `findAll`: rename the first destructured value `data` → `rows`, use `orderBy: this.listOrder`, and return `data: rows.map((r) => ({ ...r, hint: expenseHint(r) })),` (the rest unchanged — `summary` stays as it is, «Tanlangan» reads it). `exportAll`: `orderBy: this.listOrder`.
  - `generateExpensesPdf` becomes:

```ts
  async generateExpensesPdf(
    query: ExpenseQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const month = this.monthOf(query);
    const [rows, company, branch, creators] = await Promise.all([
      this.exportAll(query, companyId, branchIds),
      this.prisma.company.findUnique({ where: { id: companyId }, select: { name: true } }),
      query.branchId
        ? this.prisma.branch.findFirst({ where: { id: query.branchId, companyId }, select: { name: true } })
        : Promise.resolve(null),
      // «Kim kiritgan: …» names the people the list was filtered by.
      query.createdById?.length
        ? this.prisma.user.findMany({
            where: { id: { in: query.createdById } },
            select: { firstName: true, lastName: true },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          })
        : Promise.resolve([]),
    ]);
```

    keep `pdfRows`, `sumRows`, `isAdvanceRow` and `totals` as they are, then pass to `buildExpensesDoc`

```ts
      dateRangeLabel: month ? expenseMonthTitle(month) : buildDateRangeLabel(query.startDate, query.endDate),
      creatorLabel: creators.length ? creators.map((u) => `${u.firstName} ${u.lastName}`.trim()).join(', ') : null,
```

    (beside the existing fields) and end with

```ts
    return {
      buffer: await renderPdf(doc),
      filename: `xarajatlar-${month ?? tashkentDateStr(new Date())}.pdf`,
    };
```

  - `pdf/expenses-template.ts`: in `ExpensesPdfInput` add `creatorLabel: string | null; // «Kim kiritgan» filter, names` after `search`, and change the `dateRangeLabel` comment to `// "Oktabr 2026", or the old range: "dd.MM.yyyy — dd.MM.yyyy", "Butun davr"`; in `filterBlock` add `if (input.creatorLabel) lines.push(kv('Kim kiritgan', input.creatorLabel));` after the `search` line; in `totalsBlock` `{ label: 'Naqd', … }`.
  - `expenses.controller.ts` `exportPdf`:

```ts
    const { buffer, filename } = await this.expensesService.generateExpensesPdf(
      query,
      companyId,
      await this.scope(userId, query.branchId),
    );
    res.setHeader('Content-Type', 'application/pdf');
```
    (delete the old `const filename = …toISOString()…` line; the two other headers stay).

- [ ] **Step 5: Run** `npx jest src/expenses` → PASS; `npm run typecheck` → clean; `npx jest src/reports` → PASS (`ReportsService.getExpenseLineItems` uses `exportAllForReport`, untouched).

- [ ] **Step 6: Commit** (from `server/`)

```bash
npx prettier --write src/expenses/dto/expense-query.dto.ts src/expenses/expenses.service.ts src/expenses/pdf/expenses-template.ts src/expenses/expenses.controller.ts src/expenses/expenses.service.spec.ts src/expenses/expenses.service.pdf.spec.ts src/expenses/expenses.controller.spec.ts
npx eslint src/expenses
git add src/expenses
git commit -m "feat(expenses): list and PDF read ?oy= and ?createdById=, stable order, hint per row, «Naqd»

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `GET /expenses/month-summary` — route, access, scope

**Files:**
- Create: `server/src/expenses/dto/expense-month-query.dto.ts`
- Modify: `server/src/expenses/expenses.controller.ts` (constructor, new handler after `findAll`), `server/src/expenses/expenses.module.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json` (after `"GET /expenses"`), `server/src/common/auth/branch-route-policy.ts` (the `BRANCH_SCOPED_BY_SERVICE` block with `'GET /expenses'`)
- Test: `server/src/expenses/expenses.controller.spec.ts`, `server/src/expenses/expenses.controller.body-validation.e2e.spec.ts`

**Interfaces:**
- Consumes: `ExpensesMonthService.monthSummary` (Task 3), `ExpensesController.scope` (existing).
- Produces: `GET /expenses/month-summary?oy=&branchId=` → `MonthSummary` (Task 1), `@Can('expenses.view')`; `ExpensesController.monthSummary(query: ExpenseMonthQueryDto, companyId: number, userId: number)`.

- [ ] **Step 1: Failing controller tests.** In `expenses.controller.spec.ts`:
  - imports: `import { ForbiddenException } from '@nestjs/common';`, `import { ExpensesMonthService } from './expenses-month.service';`, `import { ExpenseMonthQueryDto } from './dto/expense-month-query.dto';`;
  - `const READS = ['findAll', 'exportPdf', 'monthSummary'] as const;`;
  - in `describe('ExpensesController — export delegation')` add `const mockMonthService = { monthSummary: jest.fn().mockResolvedValue({ month: '2026-10' }) };`, the provider `{ provide: ExpensesMonthService, useValue: mockMonthService },` and append:

```ts
  describe('month summary endpoint', () => {
    it('passes the resolved scope and the month to the service', async () => {
      await controller.monthSummary({ oy: '2026-10' } as ExpenseMonthQueryDto, 42, 7);
      expect(mockMonthService.monthSummary).toHaveBeenCalledWith(42, null, '2026-10');
    });

    it('refuses an empty scope with 403 before any read', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await expect(controller.monthSummary({} as ExpenseMonthQueryDto, 42, 7)).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockMonthService.monthSummary).not.toHaveBeenCalled();
    });
  });
```

  In `expenses.controller.body-validation.e2e.spec.ts`: import `ExpensesMonthService`; add `{ provide: ExpensesMonthService, useValue: {} },` to the PATCH module's providers; append:

```ts
describe('GET /expenses* — the month is validated', () => {
  let app: INestApplication;
  let server: Server;
  const findAll = jest.fn();
  const monthSummary = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [
        { provide: ExpensesService, useValue: { findAll } },
        { provide: ExpensesMonthService, useValue: { monthSummary } },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 10001, companyId: 1001 };
      next();
    });
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    '/expenses?oy=2026-1',
    '/expenses?oy=oktabr',
    '/expenses/pdf?oy=2026-13',
    '/expenses/month-summary?oy=2026-1',
    '/expenses/month-summary?foo=1',
  ])('refuses %s with 400', async (url) => {
    const res = await request(server).get(url);
    expect(res.status).toBe(400);
    expect(findAll).not.toHaveBeenCalled();
    expect(monthSummary).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run** `npx jest src/expenses/expenses.controller.spec.ts src/expenses/expenses.controller.body-validation.e2e.spec.ts src/common/permissions/permission-routes.spec.ts src/common/auth/branch-route-policy.spec.ts` → FAIL (`monthSummary` is not a method; the DTO file is missing).

- [ ] **Step 3: Implement.**
  - `dto/expense-month-query.dto.ts`:

```ts
import { IsInt, IsOptional, Matches } from 'class-validator';
import { Type } from 'class-transformer';

/** `GET /expenses/month-summary` (spec B6 §5.2): the month and the header's branch, nothing else. */
export class ExpenseMonthQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: "Oy YYYY-MM ko'rinishida bo'lishi kerak" })
  oy?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;
}
```

  - `expenses.controller.ts`: import `ExpensesMonthService` and `ExpenseMonthQueryDto`; constructor `private monthService: ExpensesMonthService,` after `expensesService`; after `findAll`:

```ts
  // The month card, «Bu oy hali yozilmagan» and the «Kim kiritgan» options
  // (spec B6 §5.2). Same scope rule as the list: an empty scope is 403.
  @Get('month-summary')
  @Can('expenses.view')
  async monthSummary(
    @Query() query: ExpenseMonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.monthService.monthSummary(
      companyId,
      await this.scope(userId, query.branchId),
      query.oy,
    );
  }
```

  - `expenses.module.ts`: `import { ExpensesMonthService } from './expenses-month.service';` and `providers: [ExpensesService, ExpensesMonthService],`.
  - `route-access.snapshot.json`, between `"GET /expenses"` and `"GET /expenses/pdf"`:

```json
  "GET /expenses/month-summary": [
    "Branch Director",
    "CEO"
  ],
```

  - `branch-route-policy.ts`, in the `BRANCH_SCOPED_BY_SERVICE` block that lists `'GET /expenses'`: add `'GET /expenses/month-summary',` right after it.

- [ ] **Step 4: Run** the four specs of Step 2 → PASS; `npx jest src/common/permissions src/common/auth` → PASS; `npm run typecheck` → clean; the full suite `npm test` → PASS.

- [ ] **Step 5: Commit** (from `server/`)

```bash
npx prettier --write src/expenses/dto/expense-month-query.dto.ts src/expenses/expenses.controller.ts src/expenses/expenses.module.ts src/expenses/expenses.controller.spec.ts src/expenses/expenses.controller.body-validation.e2e.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/expenses src/common/auth/branch-route-policy.ts
git add src/expenses src/common/permissions/route-access.snapshot.json src/common/auth/branch-route-policy.ts
git commit -m "feat(expenses): GET /expenses/month-summary (expenses.view, the list's scope rule)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client data layer — labels, URL, formatting, queries

**Files:**
- Create in `client/src/components/payments/expenses/`: `expenses-types.ts`, `expenses-labels.ts`, `expenses-labels.test.ts`, `expenses-url.ts`, `expenses-url.test.ts`, `expenses-format.ts`, `expenses-format.test.ts`, `expenses-queries.ts`
- Modify: `client/src/components/payments/salary-advance-day-panel.tsx:8`, `client/src/components/payments/salary-advance-dialog.tsx:35` (import `EXPENSE_METHOD_LABELS` from the new labels file — the old `expenses-filter-bar.tsx` is deleted in Task 9)

**Interfaces:**
- Consumes: the server shapes of Tasks 1–5.
- Produces:
  ```ts
  // expenses-labels.ts
  export const EXPENSE_CATEGORIES: readonly ["RENT","UTILITIES","SUPPLIES","MARKETING","EQUIPMENT","MAINTENANCE","TAXES","OTHER"];
  export type ExpenseCategoryKey; export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string>;
  export const EXPENSE_METHOD_LABELS: Record<string, string>; export const EXPENSE_HINT_LABELS: Record<ExpenseHint, string>;
  export const RECURRING_LABELS: Record<RecurringKey, string>; export function isExpenseCategory(v: string): v is ExpenseCategoryKey;
  // expenses-types.ts
  ExpenseMethod, ExpenseHint, RecurringKey, ExpenseRow, ExpensesListResponse, MonthCategoryRow, MissingRow, ExpenseCreator, MonthSummary, ExpensePreset
  // expenses-url.ts
  EXPENSES_FIRST_MONTH, EXPENSES_PAGE_SIZES, EXPENSES_SCHEMA, ExpensesFilters, EXPENSES_CLEARED, pageMonth(oy, current), cleanTurkum, cleanUsul, cleanKim,
  summaryParams(f, current, branchId), pdfParams(f, current, branchId), listParams(f, current, branchId), hasExpenseFilter(f), pdfFileName(month)
  // expenses-format.ts
  missingTitle(row, multiBranch), missingText(row, month), emptyBranchTitle(name), presetFor(row, month), toggleTurkum(selected, category),
  dateText(iso), enteredText(iso), ADVANCE_NOTE, SAME_AS_PROFIT, MISSING_FOOTNOTE, CATEGORY_HINT
  // expenses-queries.ts
  EXPENSES_KEYS, useExpensesList(params, enabled), useExpensesMonthSummary(params, enabled), invalidateExpenses(qc)
  ```

- [ ] **Step 1: Failing tests.**

  `expenses-labels.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_HINT_LABELS, EXPENSE_METHOD_LABELS, RECURRING_LABELS } from "./expenses-labels";

// The client used to know 5 of the 8 categories, so tax went under «Boshqa» (spec B6 §1).
const SCHEMA = join(__dirname, "../../../../../server/prisma/schema.prisma");
function serverCategories(): string[] {
  const block = readFileSync(SCHEMA, "utf8").match(/enum ExpenseCategory \{([^}]*)\}/);
  if (!block) throw new Error("enum ExpenseCategory not found in schema.prisma");
  return block[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
}

describe("expense labels (spec B6 §3.7, §4.4)", () => {
  it("the eight categories are the server's, without the advance, in its order", () => {
    expect([...EXPENSE_CATEGORIES]).toEqual(serverCategories().filter((c) => c !== "TEACHER_ADVANCE"));
  });
  it("every category has its Uzbek label", () => {
    expect(Object.keys(EXPENSE_CATEGORY_LABELS)).toEqual([...EXPENSE_CATEGORIES]);
    expect(EXPENSE_CATEGORY_LABELS.TAXES).toBe("Soliqlar");
    expect(EXPENSE_CATEGORY_LABELS.EQUIPMENT).toBe("Jihozlar");
    expect(EXPENSE_CATEGORY_LABELS.MAINTENANCE).toBe("Ta'mirlash");
  });
  it("cash is «Naqd», never «Naqt»", () => {
    expect(EXPENSE_METHOD_LABELS).toEqual({ CASH: "Naqd", CARD: "Karta" });
  });
  it("the three hint texts and the warning's names", () => {
    expect(EXPENSE_HINT_LABELS).toEqual({ SALARY: "Xodimlar oyligida ham bormi?", EQUIPMENT: "Jihozlar turkumi emasmi?", UTILITIES: "Kommunal turkumi emasmi?" });
    expect(RECURRING_LABELS).toEqual({ RENT: "Ijara", UTILITIES: "Kommunal", TAXES: "Soliq" });
  });
});
```

  `expenses-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EXPENSES_CLEARED, EXPENSES_SCHEMA, hasExpenseFilter, listParams, pageMonth, pdfFileName, pdfParams, summaryParams, type ExpensesFilters } from "./expenses-url";

const DEFAULTS = Object.fromEntries(Object.entries(EXPENSES_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as ExpensesFilters;
const f = (u: Partial<ExpensesFilters> = {}): ExpensesFilters => ({ ...DEFAULTS, ...u });

describe("pageMonth (spec B6 §3.2)", () => {
  it("empty is the current month; from May 2026, never ahead; junk is the current month", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-05", "2026-10")).toBe("2026-05");
    expect(pageMonth("2026-04", "2026-10")).toBe("2026-05");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("oktabr", "2026-10")).toBe("2026-10");
  });
});

describe("listParams (spec B6 §6.2)", () => {
  it("defaults: page 1 of 10; the current month and an absent branch are not sent", () => {
    expect(listParams(f(), "2026-10", undefined)).toEqual({ page: 1, pageSize: 10 });
    expect(listParams(f({ oy: "2026-10" }), "2026-10", 3)).toEqual({ branchId: 3, page: 1, pageSize: 10 });
  });
  it("maps the URL keys to the server's names", () => {
    expect(listParams(f({ oy: "2026-09", q: " ijara ", turkum: ["RENT", "TAXES"], usul: "karta", kim: ["10234", "10567"], sahifa: 2, soni: 20 }), "2026-10", 3)).toEqual({
      branchId: 3, oy: "2026-09", search: "ijara", category: "RENT,TAXES", paymentMethod: "CARD", createdById: "10234,10567", page: 2, pageSize: 20,
    });
    expect(listParams(f({ usul: "naqd" }), "2026-10", undefined).paymentMethod).toBe("CASH");
  });
  it("junk falls back to what the server accepts; the advance is never asked for", () => {
    expect(listParams(f({ turkum: ["TEACHER_ADVANCE", "PARTY"], usul: "pul", kim: ["abc"], sahifa: 0, soni: 15 }), "2026-10", undefined)).toEqual({ page: 1, pageSize: 10 });
  });
});

describe("pdfParams / summaryParams", () => {
  it("the PDF: the list's filters without the page", () => {
    expect(pdfParams(f({ oy: "2026-09", turkum: ["RENT"], sahifa: 4 }), "2026-10", 3)).toEqual({ branchId: 3, oy: "2026-09", category: "RENT" });
  });
  it("the month card follows only the month and the branch", () => {
    expect(summaryParams(f({ oy: "2026-09", q: "x", turkum: ["RENT"], kim: ["10001"] }), "2026-10", 3)).toEqual({ branchId: 3, oy: "2026-09" });
    expect(summaryParams(f(), "2026-10", undefined)).toEqual({});
  });
});

describe("hasExpenseFilter / EXPENSES_CLEARED / pdfFileName", () => {
  it("the month and the page are not filters; search, category, method and author are", () => {
    expect(hasExpenseFilter(f({ oy: "2026-09", sahifa: 3 }))).toBe(false);
    expect(hasExpenseFilter(f({ q: "a" }))).toBe(true);
    expect(hasExpenseFilter(f({ turkum: ["RENT"] }))).toBe(true);
    expect(hasExpenseFilter(f({ usul: "naqd" }))).toBe(true);
    expect(hasExpenseFilter(f({ kim: ["10001"] }))).toBe(true);
    expect(hasExpenseFilter(f({ turkum: ["PARTY"] }))).toBe(false);
  });
  it("«Tozalash» keeps the month", () => {
    expect(EXPENSES_CLEARED).toEqual({ q: "", turkum: [], usul: "", kim: [], sahifa: 1 });
  });
  it("names the file by the month", () => expect(pdfFileName("2026-10")).toBe("xarajatlar-2026-10.pdf"));
});
```

  `expenses-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mln } from "@/components/payments/salary/salary-page-model";
import { dateText, emptyBranchTitle, enteredText, missingText, missingTitle, presetFor, toggleTurkum } from "./expenses-format";
import type { MissingRow } from "./expenses-types";

const row = (o: Partial<MissingRow> = {}): MissingRow => ({ key: "RENT", branchId: 2, branchName: "Shimol", amount: 17_800_000, lastMonthAmount: 17_800_000, thisMonthAmount: 0, ...o });

describe("the warning's lines (spec B6 §3.3)", () => {
  it("nothing recorded: «avgustda 17,8 mln edi»", () => {
    expect(missingText(row(), "2026-09")).toBe(`avgustda ${mln(17_800_000)} edi`);
  });
  it("part recorded: what was, and what this month holds so far; under 100 000 in full so'm", () => {
    const r = row({ key: "UTILITIES", amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 });
    expect(missingText(r, "2026-10")).toBe(`sentabrda ${mln(4_700_000)} edi, oktabrda hozircha ${mln(70_000)}`);
    expect(mln(70_000)).toContain("so'm");
  });
  it("the name, with the branch only when the scope holds several", () => {
    expect(missingTitle(row(), false)).toBe("Ijara");
    expect(missingTitle(row({ key: "TAXES" }), true)).toBe("Soliq · Shimol");
  });
  it("an empty branch is «… filiali», never twice", () => {
    expect(emptyBranchTitle("Shimol")).toBe("Shimol filiali");
    expect(emptyBranchTitle("Shimol filiali")).toBe("Shimol filiali");
  });
});

describe("presetFor — «Yozish» fills the dialog (spec B6 §2.2, §3.3)", () => {
  it("the row's category, the missing amount, «Ijara — oktabr 2026», the row's branch", () => {
    expect(presetFor(row({ amount: 4_630_000 }), "2026-10")).toEqual({ category: "RENT", amount: 4_630_000, description: "Ijara — oktabr 2026", branchId: 2 });
    expect(presetFor(row({ key: "TAXES" }), "2026-10").category).toBe("TAXES");
  });
});

describe("toggleTurkum (spec B6 §3.4)", () => {
  it("a click picks that one category; clicking it again when alone clears", () => {
    expect(toggleTurkum([], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["RENT", "TAXES"], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["TAXES"], "RENT")).toEqual(["RENT"]);
    expect(toggleTurkum(["RENT"], "RENT")).toEqual([]);
  });
});

describe("dates", () => {
  it("the expense day is the calendar date the server sent", () => expect(dateText("2026-10-05T00:00:00.000Z")).toBe("05.10.2026"));
  it("the entry time is on the Tashkent clock", () => {
    expect(enteredText("2026-10-05T09:30:00.000Z")).toBe("05.10.2026, 14:30");
    expect(enteredText("2026-10-31T19:30:00.000Z")).toBe("01.11.2026, 00:30");
  });
});
```

- [ ] **Step 2: Run** `cd client && npx vitest run src/components/payments/expenses` → FAIL (modules missing).

- [ ] **Step 3: Implement.**

  `expenses-types.ts`:

```ts
import type { ExpenseCategoryKey } from "./expenses-labels";

export type ExpenseMethod = "CASH" | "CARD";
export type ExpenseHint = "SALARY" | "EQUIPMENT" | "UTILITIES";
export type RecurringKey = "RENT" | "UTILITIES" | "TAXES";

/** One row of `GET /expenses` (spec B6 §5.3). */
export interface ExpenseRow {
  id: string;
  category: ExpenseCategoryKey;
  paymentMethod: ExpenseMethod;
  amount: number;
  description: string;
  /** `@db.Date`, sent as UTC midnight. */
  date: string;
  branchId: number;
  receiptUrl: string | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string };
  hint: ExpenseHint | null;
}

export interface ExpensesListResponse {
  data: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
  /** The whole filtered set, not the page — «Tanlangan» reads it. */
  summary: { totalAmount: number; count: number; cashTotal: number; cardTotal: number; advancesTotal: number };
}

export interface MonthCategoryRow { category: ExpenseCategoryKey; amount: number; count: number; lastMonthAmount: number; notRecorded: boolean }
export interface MissingRow { key: RecurringKey; branchId: number; branchName: string; amount: number; lastMonthAmount: number; thisMonthAmount: number }
export interface ExpenseCreator { id: number; firstName: string; lastName: string }

/** `GET /expenses/month-summary` (spec B6 §5.2). */
export interface MonthSummary {
  month: string;
  isCurrentMonth: boolean;
  total: number;
  count: number;
  cashTotal: number;
  cardTotal: number;
  lastMonthTotal: number;
  byCategory: MonthCategoryRow[];
  missing: MissingRow[];
  multiBranch: boolean;
  emptyBranches: { id: number; name: string }[];
  creators: ExpenseCreator[];
}

/** What «Yozish» opens the expense dialog with (spec B6 §3.7). */
export interface ExpensePreset { category: ExpenseCategoryKey; amount: number; description: string; branchId: number }
```

  `expenses-labels.ts`:

```ts
import type { ExpenseHint, RecurringKey } from "./expenses-types";

/** The eight categories the page shows, in the CEO's order (spec B6 §2.3); the advance is never one. */
export const EXPENSE_CATEGORIES = ["RENT", "UTILITIES", "SUPPLIES", "MARKETING", "EQUIPMENT", "MAINTENANCE", "TAXES", "OTHER"] as const;
export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategoryKey, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  EQUIPMENT: "Jihozlar",
  MAINTENANCE: "Ta'mirlash",
  TAXES: "Soliqlar",
  OTHER: "Boshqa",
};

/** Keyed by string: the salary advance screens index it with a plain string. */
export const EXPENSE_METHOD_LABELS: Record<string, string> = { CASH: "Naqd", CARD: "Karta" };

/** The server sends the code (`expense-hints.ts`); the words live here. */
export const EXPENSE_HINT_LABELS: Record<ExpenseHint, string> = {
  SALARY: "Xodimlar oyligida ham bormi?",
  EQUIPMENT: "Jihozlar turkumi emasmi?",
  UTILITIES: "Kommunal turkumi emasmi?",
};

/** The warning's names (spec B6 §3.3). */
export const RECURRING_LABELS: Record<RecurringKey, string> = { RENT: "Ijara", UTILITIES: "Kommunal", TAXES: "Soliq" };

export const isExpenseCategory = (v: string): v is ExpenseCategoryKey => (EXPENSE_CATEGORIES as readonly string[]).includes(v);
```

  `expenses-url.ts`:

```ts
import { clampMonth } from "@/components/payments/overview/overview-math";
import { isExpenseCategory, type ExpenseCategoryKey } from "./expenses-labels";

/** The page starts in May 2026 (spec B6 §3.2). */
export const EXPENSES_FIRST_MONTH = "2026-05";
export const EXPENSES_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys (spec B6 §6.2); defaults are left out of the URL by `useUrlFilters`. */
export const EXPENSES_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  q: { type: "string", defaultValue: "" },
  turkum: { type: "array", defaultValue: [] as string[] },
  usul: { type: "string", defaultValue: "" },
  kim: { type: "array", defaultValue: [] as string[] },
  sahifa: { type: "number", defaultValue: 1 },
  soni: { type: "number", defaultValue: 10 },
} as const;

export interface ExpensesFilters { oy: string; q: string; turkum: string[]; usul: string; kim: string[]; sahifa: number; soni: number }

/** «Tozalash»: every filter, never the month. */
export const EXPENSES_CLEARED: Partial<ExpensesFilters> = { q: "", turkum: [], usul: "", kim: [], sahifa: 1 };

/** The page's month: `?oy=` inside [2026-05, the current month]; empty or unreadable is the current month. */
export const pageMonth = (oy: string, current: string): string => clampMonth(oy || current, EXPENSES_FIRST_MONTH, current);

export const cleanTurkum = (v: readonly string[]): ExpenseCategoryKey[] => v.filter(isExpenseCategory);
export const cleanUsul = (v: string): "naqd" | "karta" | "" => (v === "naqd" || v === "karta" ? v : "");
export const cleanKim = (v: readonly string[]): string[] => v.filter((x) => /^\d+$/.test(x));

/**
 * `GET /expenses/month-summary`: the header's branch and the month. The
 * current month is not sent, so the server's own Tashkent month answers.
 */
export function summaryParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (branchId) out.branchId = branchId;
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  return out;
}

/** The list's filters under the server's names (`q→search`, `turkum→category`, `usul→paymentMethod`, `kim→createdById`), no page — `GET /expenses/pdf`. */
export function pdfParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  const out = summaryParams(f, current, branchId);
  const q = f.q.trim().slice(0, 100);
  if (q) out.search = q;
  const turkum = cleanTurkum(f.turkum);
  if (turkum.length) out.category = turkum.join(",");
  const usul = cleanUsul(f.usul);
  if (usul) out.paymentMethod = usul === "naqd" ? "CASH" : "CARD";
  const kim = cleanKim(f.kim);
  if (kim.length) out.createdById = kim.join(",");
  return out;
}

/** …plus the page, for `GET /expenses`. */
export function listParams(f: ExpensesFilters, current: string, branchId: number | undefined): Record<string, string | number> {
  return {
    ...pdfParams(f, current, branchId),
    page: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    pageSize: EXPENSES_PAGE_SIZES.includes(f.soni) ? f.soni : 10,
  };
}

export const hasExpenseFilter = (f: ExpensesFilters): boolean =>
  Boolean(f.q.trim() || cleanTurkum(f.turkum).length || cleanUsul(f.usul) || cleanKim(f.kim).length);
export const pdfFileName = (month: string): string => `xarajatlar-${month}.pdf`;
```

  `expenses-format.ts`:

```ts
import { mln } from "@/components/payments/salary/salary-page-model";
import { addMonths, monthLabel, monthShort } from "@/components/payments/salary-utils";
import { tashkentWallClock } from "@/lib/tashkent-time";
import { RECURRING_LABELS, type ExpenseCategoryKey } from "./expenses-labels";
import type { ExpensePreset, MissingRow } from "./expenses-types";

// Words and dates of the «Xarajatlar» page. Every amount is the server's.

const lowerMonth = (month: string) => monthShort(month).toLowerCase();

/** «Ijara», or «Ijara · Shimol» when the scope holds several branches (spec B6 §3.3). */
export function missingTitle(row: MissingRow, multiBranch: boolean): string {
  const name = RECURRING_LABELS[row.key];
  return multiBranch ? `${name} · ${row.branchName}` : name;
}

/** «avgustda 17,8 mln edi», plus «, sentabrda hozircha 70 000 so'm» when part is recorded. */
export function missingText(row: MissingRow, month: string): string {
  const was = `${lowerMonth(addMonths(month, -1))}da ${mln(row.lastMonthAmount)} edi`;
  return row.thisMonthAmount > 0 ? `${was}, ${lowerMonth(month)}da hozircha ${mln(row.thisMonthAmount)}` : was;
}

/** «Shimol filiali», unless the name already says it. */
export const emptyBranchTitle = (name: string): string => (/filial/i.test(name) ? name : `${name} filiali`);

/** «Yozish»: the row's category, what is still missing, «Ijara — oktabr 2026», the row's branch (spec B6 §2.2, §3.3). */
export function presetFor(row: MissingRow, month: string): ExpensePreset {
  return { category: row.key, amount: row.amount, description: `${RECURRING_LABELS[row.key]} — ${monthLabel(month).toLowerCase()}`, branchId: row.branchId };
}

/** A category row click: that one category, or nothing when it alone was picked (spec B6 §3.4). */
export function toggleTurkum(selected: readonly string[], category: ExpenseCategoryKey): string[] {
  return selected.length === 1 && selected[0] === category ? [] : [category];
}

/** `Expense.date` is a calendar date sent as UTC midnight: «05.10.2026». */
export function dateText(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/** When the row was entered, on the Tashkent clock: «05.10.2026, 14:30». */
export function enteredText(iso: string): string {
  const t = tashkentWallClock(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(t.getUTCDate())}.${p(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}, ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

export const SAME_AS_PROFIT = "Foydadagi «Boshqa xarajatlar» qatorining o'zi";
export const CATEGORY_HINT = "Turkumni bosing — pastdagi ro'yxat shu turkumga filtrlanadi.";
export const MISSING_FOOTNOTE = "Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi.";
export const ADVANCE_NOTE = "Ustozlarga avans — Ish haqi → Avanslar bo'limida. Xodimlar oyligi — Ish haqida; bu yerga yozilmaydi, aks holda foydadan ikki marta ayiriladi.";
```

  `expenses-queries.ts`:

```ts
"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { OVERVIEW_QUERY_KEYS } from "@/components/payments/overview/queries";
import type { ExpensesListResponse, MonthSummary } from "./expenses-types";

type Params = Record<string, string | number>;

/** Both keys start with "expenses": one invalidation refreshes the list and the month card. */
export const EXPENSES_KEYS = {
  all: ["expenses"] as const,
  list: (p: Params) => ["expenses", "list", p] as const,
  monthSummary: (p: Params) => ["expenses", "month-summary", p] as const,
};

/** The table; a filter or page change keeps the old answer on screen (dimmed) until the new one lands. */
export function useExpensesList(params: Params, enabled: boolean) {
  return useQuery({
    queryKey: EXPENSES_KEYS.list(params),
    queryFn: () => api.get<ExpensesListResponse>("/expenses", { params }).then((r) => r.data),
    enabled,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** The month card, the warning and the «Kim kiritgan» options; a new month shows the skeleton, never the old month. */
export function useExpensesMonthSummary(params: Params, enabled: boolean) {
  return useQuery({
    queryKey: EXPENSES_KEYS.monthSummary(params),
    queryFn: () => api.get<MonthSummary>("/expenses/month-summary", { params }).then((r) => r.data),
    enabled,
    staleTime: 0,
  });
}

/** After every create, edit and delete (spec B6 §6.3): this page, «Foyda» and «Oylar bo'yicha». Never optimistic. */
export function invalidateExpenses(qc: QueryClient): void {
  for (const key of [...EXPENSES_KEYS.all, ...OVERVIEW_QUERY_KEYS]) void qc.invalidateQueries({ queryKey: [key] });
}
```

  `salary-advance-day-panel.tsx` and `salary-advance-dialog.tsx`: `import { EXPENSE_METHOD_LABELS } from "./expenses/expenses-labels";` in place of the `./expenses-filter-bar` import.

- [ ] **Step 4: Run** `npx vitest run src/components/payments/expenses` → PASS; `npx tsc --noEmit -p .` → clean; `npx vitest run src/components/payments` → PASS.

- [ ] **Step 5: Commit** (from the worktree root)

```bash
git add client/src/components/payments/expenses client/src/components/payments/salary-advance-day-panel.tsx client/src/components/payments/salary-advance-dialog.tsx
git commit -m "feat(expenses): client data layer — eight categories, URL keys, warning texts, queries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Header, month card and «Bu oy hali yozilmagan»

**Files:**
- Create in `client/src/components/payments/expenses/`: `expenses-header.tsx`, `expenses-month-card.tsx`, `expenses-missing-card.tsx`, `expenses-month-card.test.ts`

**Interfaces:**
- Consumes: Task 6 (`MonthSummary`, `MissingRow`, `EXPENSE_CATEGORY_LABELS`, `ExpenseCategoryKey`, `missingTitle`, `missingText`, `emptyBranchTitle`, `SAME_AS_PROFIT`, `CATEGORY_HINT`, `MISSING_FOOTNOTE`, `EXPENSES_FIRST_MONTH`); `MonthStepper`, `mln`, `monthShort`, `addMonths`, `PILL_BASE`.
- Produces:
  ```tsx
  ExpensesHeader({ month, current, canManage, exporting, pdfDisabled, onMonth, onPdf, onAdd })
  ExpensesMonthCard({ summary, selected, onToggle }); ExpensesMonthCardSkeleton()
  ExpensesMissingCard({ summary, canManage, onWrite }) // null outside the current month or without a row
  ```

- [ ] **Step 1: Failing test** `expenses-month-card.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { mln } from "@/components/payments/salary/salary-page-model";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./expenses-labels";
import { CATEGORY_HINT, MISSING_FOOTNOTE, SAME_AS_PROFIT } from "./expenses-format";
import { ExpensesHeader } from "./expenses-header";
import { ExpensesMissingCard } from "./expenses-missing-card";
import { ExpensesMonthCard } from "./expenses-month-card";
import type { MonthCategoryRow, MonthSummary } from "./expenses-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const text = (el: ReturnType<typeof createElement>) => norm(raw(el));
const noop = () => {};

// Made-up month: two branches.
const OVER: Partial<Record<string, Partial<MonthCategoryRow>>> = {
  RENT: { amount: 5_000_000, count: 1, lastMonthAmount: 5_000_000 },
  UTILITIES: { amount: 70_000, count: 1, lastMonthAmount: 4_700_000 },
  TAXES: { lastMonthAmount: 1_200_000, notRecorded: true },
};
const SUMMARY: MonthSummary = {
  month: "2026-10", isCurrentMonth: true, total: 5_070_000, count: 2, cashTotal: 5_000_000, cardTotal: 70_000, lastMonthTotal: 10_900_000,
  byCategory: EXPENSE_CATEGORIES.map((category) => ({ category, amount: 0, count: 0, lastMonthAmount: 0, notRecorded: false, ...OVER[category] })),
  missing: [
    { key: "UTILITIES", branchId: 1, branchName: "Markaz", amount: 4_630_000, lastMonthAmount: 4_700_000, thisMonthAmount: 70_000 },
    { key: "TAXES", branchId: 2, branchName: "Shimol", amount: 1_200_000, lastMonthAmount: 1_200_000, thisMonthAmount: 0 },
  ],
  multiBranch: true,
  emptyBranches: [{ id: 2, name: "Shimol" }],
  creators: [{ id: 10001, firstName: "Ism", lastName: "Familiya" }],
};
const card = (over: Partial<MonthSummary> = {}, selected: string[] = []) => createElement(ExpensesMonthCard, { summary: { ...SUMMARY, ...over }, selected, onToggle: noop });
const missing = (over: Partial<MonthSummary> = {}, canManage = true) => createElement(ExpensesMissingCard, { summary: { ...SUMMARY, ...over }, canManage, onWrite: noop });

describe("ExpensesMonthCard (spec B6 §3.4)", () => {
  it("the month's total, its count with cash and card, the green line", () => {
    const t = text(card());
    expect(t).toContain("Oktabr xarajatlari");
    expect(t).toContain(norm(mln(5_070_000)));
    expect(t).toContain(norm(`2 ta · naqd ${mln(5_000_000)} · karta ${mln(70_000)}`));
    expect(t).toContain(SAME_AS_PROFIT);
  });
  it("eight categories in the fixed order, this month against last, «Jami», the hint line", () => {
    const t = text(card());
    expect(t).toContain("Turkum Oktabr Sentabr");
    // From the table header on: the green line above it already says «Boshqa».
    const rows = t.slice(t.indexOf("Turkum Oktabr Sentabr"));
    const at = EXPENSE_CATEGORIES.map((c) => rows.indexOf(EXPENSE_CATEGORY_LABELS[c]));
    expect(at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1]))).toBe(true);
    expect(t).toContain(norm(`Jami ${mln(5_070_000)} ${mln(10_900_000)}`));
    expect(t).toContain(CATEGORY_HINT);
  });
  it("«yozilmagan» where the server says so", () => {
    expect(text(card())).toContain("Soliqlar yozilmagan");
    expect(text(card({ isCurrentMonth: false, byCategory: SUMMARY.byCategory.map((r) => ({ ...r, notRecorded: false })) }))).not.toContain("yozilmagan");
  });
  it("the picked category is marked; rows are buttons", () => {
    const html = raw(card({}, ["RENT"]));
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html.match(/<button/g)?.length).toBe(8);
  });
  it("a month with no expense says so", () => {
    expect(text(card({ count: 0, total: 0, cashTotal: 0, cardTotal: 0 }))).toContain("Bu oyda xarajat yozilmagan");
  });
});

describe("ExpensesMissingCard (spec B6 §3.3)", () => {
  it("the title, each gap with its branch, the empty branch and the footnote", () => {
    const t = text(missing());
    expect(t).toContain("Bu oy hali yozilmagan");
    expect(t).toContain(norm(`Kommunal · Markaz — sentabrda ${mln(4_700_000)} edi, oktabrda hozircha ${mln(70_000)}`));
    expect(t).toContain(norm(`Soliq · Shimol — sentabrda ${mln(1_200_000)} edi`));
    expect(t).toContain("Shimol filiali — bu oy bitta ham xarajat yozilmagan");
    expect(t).toContain(MISSING_FOOTNOTE);
  });
  it("«Yozish» on each gap row only with expenses.manage", () => {
    expect(text(missing()).match(/Yozish/g)?.length).toBe(2);
    expect(text(missing({}, false))).not.toContain("Yozish");
  });
  it("one branch in scope: no branch name", () => {
    expect(text(missing({ multiBranch: false }))).toContain(norm(`Kommunal — sentabrda ${mln(4_700_000)}`));
  });
  it("nothing outside the current month, nothing without a row", () => {
    expect(raw(missing({ isCurrentMonth: false }))).toBe("");
    expect(raw(missing({ missing: [], emptyBranches: [] }))).toBe("");
  });
});

describe("ExpensesHeader (spec B6 §3.2)", () => {
  const header = (canManage: boolean) =>
    createElement(ExpensesHeader, { month: "2026-10", current: "2026-10", canManage, exporting: false, pdfDisabled: false, onMonth: noop, onPdf: noop, onAdd: noop });
  it("title, PDF and «Xarajat qo'shish» for a writer", () => {
    const t = text(header(true));
    expect(t).toContain("Xarajatlar");
    expect(t).toContain("PDF");
    expect(t).toContain("Xarajat qo'shish");
  });
  it("no write button without expenses.manage", () => {
    expect(text(header(false))).not.toContain("Xarajat qo'shish");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/payments/expenses/expenses-month-card.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement.**

  `expenses-header.tsx`:

```tsx
"use client";

import { FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { EXPENSES_FIRST_MONTH } from "./expenses-url";

/** «Xarajatlar», «‹ Oy ›», «PDF» and «Xarajat qo'shish» (spec B6 §3.2). The write button only with `expenses.manage`. */
export function ExpensesHeader({ month, current, canManage, exporting, pdfDisabled, onMonth, onPdf, onAdd }: {
  month: string;
  current: string;
  canManage: boolean;
  exporting: boolean;
  /** The list is empty. */
  pdfDisabled: boolean;
  onMonth: (month: string) => void;
  onPdf: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="font-heading text-lg font-semibold tracking-tight">Xarajatlar</h2>
      <div className="flex flex-wrap items-center gap-2">
        <MonthStepper value={month} min={EXPENSES_FIRST_MONTH} max={current} onChange={onMonth} />
        <Button variant="outline" onClick={onPdf} disabled={exporting || pdfDisabled}>
          {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <FileText className="mr-2 size-4" />}
          PDF
        </Button>
        {canManage && (
          <Button onClick={onAdd}>
            <Plus className="mr-2 size-4" />
            Xarajat qo&apos;shish
          </Button>
        )}
      </div>
    </div>
  );
}
```

  `expenses-month-card.tsx`:

```tsx
"use client";

import { CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { mln } from "@/components/payments/salary/salary-page-model";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { CATEGORY_HINT, SAME_AS_PROFIT } from "./expenses-format";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategoryKey } from "./expenses-labels";
import type { MonthSummary } from "./expenses-types";

const GRID = "grid grid-cols-[1fr_1.4fr_auto] items-center gap-3";
const Muted0 = () => <span className="text-muted-foreground">0</span>;

export function ExpensesMonthCardSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-40" />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-6" />)}
      </CardContent>
    </Card>
  );
}

/** The month card (spec B6 §3.4): only the month and the branch move it, never the filters. */
export function ExpensesMonthCard({ summary, selected, onToggle }: {
  summary: MonthSummary;
  selected: readonly string[];
  onToggle: (category: ExpenseCategoryKey) => void;
}) {
  const { month } = summary;
  // Drawing only: each bar against this month's largest category.
  const max = Math.max(0, ...summary.byCategory.map((r) => r.amount));
  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{monthShort(month)} xarajatlari</p>
            {summary.count === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">Bu oyda xarajat yozilmagan</p>
            ) : (
              <>
                <p className="font-heading text-2xl font-semibold tabular-nums">{mln(summary.total)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(summary.count)} ta · naqd {mln(summary.cashTotal)} · karta {mln(summary.cardTotal)}
                </p>
              </>
            )}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {SAME_AS_PROFIT}
          </p>
        </div>
        <div className="text-sm">
          <div className={cn(GRID, "border-b px-1 pb-1 text-xs text-muted-foreground")}>
            <span>Turkum</span>
            <span>{monthShort(month)}</span>
            <span className="text-right">{monthShort(addMonths(month, -1))}</span>
          </div>
          {summary.byCategory.map((r) => {
            const picked = selected.includes(r.category);
            return (
              <button key={r.category} type="button" aria-pressed={picked} onClick={() => onToggle(r.category)}
                className={cn(GRID, "w-full rounded-md px-1 py-1.5 text-left hover:bg-muted/60", picked && "bg-muted font-medium")}>
                <span>{EXPENSE_CATEGORY_LABELS[r.category]}</span>
                <span className="flex items-center gap-2">
                  {r.notRecorded ? (
                    <span className={cn(PILL_BASE, "bg-amber-500/25 text-foreground")}>yozilmagan</span>
                  ) : r.amount > 0 ? (
                    <>
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((r.amount / max) * 100)}%` }} />
                      </span>
                      <span className="tabular-nums">{mln(r.amount)}</span>
                    </>
                  ) : (
                    <Muted0 />
                  )}
                </span>
                <span className="text-right tabular-nums">{r.lastMonthAmount > 0 ? mln(r.lastMonthAmount) : <Muted0 />}</span>
              </button>
            );
          })}
          <div className={cn(GRID, "border-t px-1 pt-1.5 font-semibold")}>
            <span>Jami</span>
            <span className="tabular-nums">{mln(summary.total)}</span>
            <span className="text-right tabular-nums">{mln(summary.lastMonthTotal)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{CATEGORY_HINT}</p>
      </CardContent>
    </Card>
  );
}
```

  `expenses-missing-card.tsx`:

```tsx
"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { emptyBranchTitle, MISSING_FOOTNOTE, missingText, missingTitle } from "./expenses-format";
import type { MissingRow, MonthSummary } from "./expenses-types";

/** «Bu oy hali yozilmagan» (spec B6 §3.3): the current month only, and only with a row. «Yozish» only with `expenses.manage`. */
export function ExpensesMissingCard({ summary, canManage, onWrite }: {
  summary: MonthSummary;
  canManage: boolean;
  onWrite: (row: MissingRow) => void;
}) {
  if (!summary.isCurrentMonth || (summary.missing.length === 0 && summary.emptyBranches.length === 0)) return null;
  return (
    <Alert className="border-amber-500/40 bg-amber-500/10">
      <AlertTriangle className="text-amber-600 dark:text-amber-400" />
      <AlertTitle>Bu oy hali yozilmagan</AlertTitle>
      <AlertDescription className="space-y-2">
        <ul className="space-y-1.5">
          {summary.missing.map((r) => (
            <li key={`${r.key}-${r.branchId}`} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <b>{missingTitle(r, summary.multiBranch)}</b> — {missingText(r, summary.month)}
              </span>
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => onWrite(r)}>
                  Yozish
                </Button>
              )}
            </li>
          ))}
          {summary.emptyBranches.map((b) => (
            <li key={`branch-${b.id}`}>
              <b>{emptyBranchTitle(b.name)}</b> — bu oy bitta ham xarajat yozilmagan
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{MISSING_FOOTNOTE}</p>
      </AlertDescription>
    </Alert>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run src/components/payments/expenses` → PASS; `npx tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit** (from the worktree root)

```bash
git add client/src/components/payments/expenses/expenses-header.tsx client/src/components/payments/expenses/expenses-month-card.tsx client/src/components/payments/expenses/expenses-missing-card.tsx client/src/components/payments/expenses/expenses-month-card.test.ts
git commit -m "feat(expenses): header, month card and the «Bu oy hali yozilmagan» warning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Filter bar and table

**Files:**
- Create in `client/src/components/payments/expenses/`: `expenses-filter-bar.tsx`, `expenses-table.tsx`, `expenses-table.test.ts`

**Interfaces:**
- Consumes: Task 6 (`ExpensesFilters`, `cleanTurkum`, `cleanUsul`, `cleanKim`, `hasExpenseFilter`, `EXPENSES_CLEARED`, `EXPENSES_SCHEMA`, labels, `dateText`, `enteredText`, `ADVANCE_NOTE`, `ExpenseRow`, `ExpenseCreator`); `UrlSearchBox` (`payments/debt/debt-filter-bar.tsx`), `MultiSelectCombobox`, `PILL_BASE`.
- Produces:
  ```tsx
  ExpensesFilterBar({ filters, creators, selection, onChange }) // selection: { count, amount } | null → «Tanlangan: N ta · X so'm»
  ExpensesTable({ rows, loading, offset, emptyMonth, canManage, onEdit, onHistory, onDelete, onClear? })
  export function rowActions(canManage: boolean): readonly ("edit" | "history" | "delete")[]
  ```

- [ ] **Step 1: Failing test** `expenses-table.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { ADVANCE_NOTE } from "./expenses-format";
import { ExpensesFilterBar } from "./expenses-filter-bar";
import { ExpensesTable, rowActions } from "./expenses-table";
import { EXPENSES_SCHEMA, type ExpensesFilters } from "./expenses-url";
import type { ExpenseRow } from "./expenses-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const text = (el: ReturnType<typeof createElement>) => norm(raw(el));
const DEFAULTS = Object.fromEntries(Object.entries(EXPENSES_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as ExpensesFilters;
const noop = () => {};

// Made-up rows.
const ROWS: ExpenseRow[] = [
  { id: "e1", category: "OTHER", paymentMethod: "CASH", amount: 450_000, description: "Stullar", date: "2026-10-05T00:00:00.000Z", branchId: 1, receiptUrl: null,
    createdAt: "2026-10-05T09:30:00.000Z", createdBy: { id: 10001, firstName: "Ism", lastName: "Aliyev" }, hint: "EQUIPMENT" },
  { id: "e2", category: "RENT", paymentMethod: "CARD", amount: 5_000_000, description: "Ijara", date: "2026-10-03T00:00:00.000Z", branchId: 1, receiptUrl: null,
    createdAt: "2026-10-03T05:00:00.000Z", createdBy: { id: 10002, firstName: "Ism", lastName: "Karimov" }, hint: null },
];
const table = (over: Partial<Parameters<typeof ExpensesTable>[0]> = {}) =>
  createElement(ExpensesTable, { rows: ROWS, loading: false, offset: 0, emptyMonth: false, canManage: true, onEdit: noop, onHistory: noop, onDelete: noop, ...over });

describe("ExpensesTable (spec B6 §3.6)", () => {
  it("# first, then Sana, Turkum, Tavsif, Summa, To'lov turi, Kim kiritgan", () => {
    expect(text(table()).trimStart().startsWith("# Sana Turkum Tavsif Summa To'lov turi Kim kiritgan")).toBe(true);
  });
  it("a row: numbering from the offset, the day, the badge, the hint pill, the amount, «Naqd», the author and when", () => {
    const t = text(table({ offset: 10 }));
    expect(t).toContain(norm(`11 05.10.2026 Boshqa Stullar Jihozlar turkumi emasmi? ${formatPrice(450_000)} so'm Naqd Ism Aliyev 05.10.2026, 14:30`));
    expect(t).toContain(norm(`12 03.10.2026 Ijara Ijara ${formatPrice(5_000_000)} so'm Karta Ism Karimov 03.10.2026, 10:00`));
  });
  it("the hint pill only where the server sent one", () => {
    expect(text(table()).match(/turkumi emasmi\?/g)?.length).toBe(1);
  });
  it("empty: a month without expenses, or a filter without results with «Tozalash»", () => {
    expect(text(table({ rows: [], emptyMonth: true }))).toContain("Bu oyda xarajat yozilmagan");
    const none = text(table({ rows: [], onClear: noop }));
    expect(none).toContain("Bu tanlovda xarajat yo'q");
    expect(none).toContain("Tozalash");
  });
  it("loading draws skeleton rows, never the empty text", () => {
    const html = raw(table({ rows: undefined, loading: true }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("xarajat yo'q");
  });
  it("the advance note under the table (CEO decision 6)", () => {
    expect(text(table())).toContain(ADVANCE_NOTE);
  });
  it("«⋯»: Tahrirlash and O'chirish only with expenses.manage, Tarix always", () => {
    expect(rowActions(true)).toEqual(["edit", "history", "delete"]);
    expect(rowActions(false)).toEqual(["history"]);
  });
});

describe("ExpensesFilterBar (spec B6 §3.5)", () => {
  const bar = (filters: Partial<ExpensesFilters> = {}, selection: { count: number; amount: number } | null = null) =>
    createElement(ExpensesFilterBar, { filters: { ...DEFAULTS, ...filters }, creators: [{ id: 10001, firstName: "Ism", lastName: "Aliyev" }], selection, onChange: noop });
  it("search, categories, method and «Kim kiritgan»; no «Tozalash» without a filter", () => {
    const html = raw(bar());
    expect(html).toContain('placeholder="Tavsif bo&#x27;yicha qidirish"');
    const t = norm(html);
    expect(t).toContain("Barcha turkumlar");
    expect(t).toContain("Naqd va karta");
    expect(t).toContain("Kim kiritgan: hammasi");
    expect(t).not.toContain("Tozalash");
  });
  it("a chosen method is a filter: «Tozalash» shows", () => {
    expect(text(bar({ usul: "naqd" }))).toContain("Tozalash");
  });
  it("«Tanlangan: N ta · X so'm» from the list's answer", () => {
    expect(text(bar({}, { count: 7, amount: 1_250_000 }))).toContain(norm(`Tanlangan: 7 ta · ${formatPrice(1_250_000)} so'm`));
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/payments/expenses/expenses-table.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement.**

  `expenses-filter-bar.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiSelectCombobox, type MultiSelectOption } from "@/components/ui/multi-select-combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "./expenses-labels";
import { cleanKim, cleanTurkum, cleanUsul, EXPENSES_CLEARED, hasExpenseFilter, type ExpensesFilters } from "./expenses-url";
import type { ExpenseCreator } from "./expenses-types";

const CATEGORY_OPTIONS: MultiSelectOption[] = EXPENSE_CATEGORIES.map((value) => ({ value, label: EXPENSE_CATEGORY_LABELS[value] }));
// Both methods together = no filter, so one choice (client/CLAUDE.md «Filter Bars»).
const USUL_OPTIONS = [
  { value: "all", label: "Naqd va karta" },
  { value: "naqd", label: "Naqd" },
  { value: "karta", label: "Karta" },
];

/** Search, category, method, «Kim kiritgan», «Tozalash» and «Tanlangan» (spec B6 §3.5). The page puts the table back on page 1. */
export function ExpensesFilterBar({ filters, creators, selection, onChange }: {
  filters: ExpensesFilters;
  /** The month's authors, from `month-summary`. */
  creators: ExpenseCreator[];
  /** The list's `total` and `summary.totalAmount`; null while there is no settled answer. */
  selection: { count: number; amount: number } | null;
  onChange: (u: Partial<ExpensesFilters>) => void;
}) {
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  const usul = cleanUsul(filters.usul) || "all";
  const creatorOptions: MultiSelectOption[] = creators.map((c) => ({
    value: String(c.id),
    label: `${c.firstName} ${c.lastName}`.trim(),
    initials: `${c.firstName.charAt(0)}${c.lastName.charAt(0)}`,
  }));
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <UrlSearchBox value={filters.q} onSearch={onSearch} label="Qidiruv" placeholder="Tavsif bo'yicha qidirish" className="sm:w-64" />
        <MultiSelectCombobox options={CATEGORY_OPTIONS} selected={cleanTurkum(filters.turkum)} onChange={(turkum) => onChange({ turkum })}
          placeholder="Barcha turkumlar" searchPlaceholder="Turkum qidirish..." className="w-auto min-w-[160px]" />
        <Select value={usul} onValueChange={(v) => onChange({ usul: v === "all" ? "" : v })}>
          <SelectTrigger className="w-full sm:w-40" aria-label="To'lov turi">
            <SelectValue>{USUL_OPTIONS.find((o) => o.value === usul)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {USUL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <MultiSelectCombobox options={creatorOptions} selected={cleanKim(filters.kim)} onChange={(kim) => onChange({ kim })}
          placeholder="Kim kiritgan: hammasi" searchPlaceholder="Ism qidirish..." className="w-auto min-w-[180px]" />
        {hasExpenseFilter(filters) && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange(EXPENSES_CLEARED)}>
            <X className="mr-1 size-4" />
            Tozalash
          </Button>
        )}
      </div>
      {selection && (
        <p className="text-sm text-muted-foreground">
          Tanlangan: <b className="tabular-nums text-foreground">{formatNumber(selection.count)} ta</b> ·{" "}
          <b className="tabular-nums text-foreground">{formatPrice(selection.amount)} so&apos;m</b>
        </p>
      )}
    </div>
  );
}
```

  `expenses-table.tsx`:

```tsx
"use client";

import { History, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { ADVANCE_NOTE, dateText, enteredText } from "./expenses-format";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_HINT_LABELS, EXPENSE_METHOD_LABELS } from "./expenses-labels";
import type { ExpenseRow } from "./expenses-types";

const HEADS = ["#", "Sana", "Turkum", "Tavsif", "Summa", "To'lov turi", "Kim kiritgan", ""];

/** «⋯» (spec B6 §3.1): Tahrirlash and O'chirish need `expenses.manage`; Tarix is `expenses.view`. */
export function rowActions(canManage: boolean): readonly ("edit" | "history" | "delete")[] {
  return canManage ? ["edit", "history", "delete"] : ["history"];
}

/** The table (spec B6 §3.6). `rows: undefined` or `loading` = skeleton rows. */
export function ExpensesTable({ rows, loading, offset, emptyMonth, canManage, onEdit, onHistory, onDelete, onClear }: {
  rows: ExpenseRow[] | undefined;
  loading: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  /** No filter is set: an empty answer means the month has nothing. */
  emptyMonth: boolean;
  canManage: boolean;
  onEdit: (row: ExpenseRow) => void;
  onHistory: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
  /** Given when a filter is set: the empty state offers to clear it. */
  onClear?: () => void;
}) {
  const actions = rowActions(canManage);
  return (
    <div className="space-y-2">
      {!loading && rows && rows.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {emptyMonth ? (
            <p>Bu oyda xarajat yozilmagan</p>
          ) : (
            <>
              <p>Bu tanlovda xarajat yo&apos;q</p>
              {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Tozalash</Button>}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow>
                {HEADS.map((h, i) => (
                  <TableHead key={i} className={i === 0 ? "w-12 border-r" : h === "Summa" ? "text-right" : i === HEADS.length - 1 ? "w-12" : undefined}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading || !rows
                ? Array.from({ length: 6 }, (_, i) => (
                    <TableRow key={i}>
                      {HEADS.map((h, j) => <TableCell key={j} className={j === 0 ? "border-r" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                : rows.map((e, i) => (
                    <TableRow key={e.id}>
                      <TableCell className="border-r text-muted-foreground tabular-nums">{offset + i + 1}</TableCell>
                      <TableCell className="text-sm tabular-nums">{dateText(e.date)}</TableCell>
                      <TableCell><Badge variant="secondary">{EXPENSE_CATEGORY_LABELS[e.category]}</Badge></TableCell>
                      <TableCell className="text-sm">
                        {e.description}
                        {e.hint && <span className={cn(PILL_BASE, "ml-2 bg-amber-500/25 align-middle text-foreground")}>{EXPENSE_HINT_LABELS[e.hint]}</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatPrice(e.amount)} so&apos;m</TableCell>
                      <TableCell className="text-sm">{EXPENSE_METHOD_LABELS[e.paymentMethod]}</TableCell>
                      <TableCell className="text-sm">
                        <span>{e.createdBy.firstName} {e.createdBy.lastName}</span>
                        <span className="block text-xs text-muted-foreground">{enteredText(e.createdAt)}</span>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Amallar</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {actions.includes("edit") && (
                              <DropdownMenuItem onClick={() => onEdit(e)}><Pencil className="mr-2 size-4" />Tahrirlash</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onHistory(e)}><History className="mr-2 size-4" />Tarix</DropdownMenuItem>
                            {actions.includes("delete") && (
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(e)}>
                                <Trash2 className="mr-2 size-4" />O&apos;chirish
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{ADVANCE_NOTE}</p>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run src/components/payments/expenses` → PASS; `npx tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit** (from the worktree root)

```bash
git add client/src/components/payments/expenses/expenses-filter-bar.tsx client/src/components/payments/expenses/expenses-table.tsx client/src/components/payments/expenses/expenses-table.test.ts
git commit -m "feat(expenses): filter bar with «Kim kiritgan» and the table with hint pills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The page, the expense dialog and the old files out

**Files:**
- Move + modify: `client/src/components/payments/expense-form-dialog.tsx` → `client/src/components/payments/expenses/expense-form-dialog.tsx`
- Create: `client/src/components/payments/expenses/expenses-page.tsx`
- Modify: `client/src/app/(dashboard)/payments/expenses/page.tsx`, `client/src/data/searchable-pages.ts` (after the «To'lovlar» entry), `client/src/components/ui/dialog.tsx` (comment `:64-68`)
- Delete: `client/src/components/payments/expenses-client.tsx`, `expenses-summary-cards.tsx`, `expenses-filter-bar.tsx`, `expenses-pdf-range-dialog.tsx` (all in `client/src/components/payments/`)

**Interfaces:**
- Consumes: Tasks 6–8; `useCan` (`hooks/use-permissions.ts`), `useBranchSwitcher`, `useUrlFilters`, `downloadAuthedFile`, `lastPageIfPast` (`payments/debt/debt-url.ts`), `PaymentsPager`, `EntityHistoryTable`.
- Produces: `ExpenseFormDialog({ open, onOpenChange, expense?, preset?, branchId?, onSaved })`; `ExpensesPage()` at `/payments/expenses`.

- [ ] **Step 1: Move the dialog.** `git mv client/src/components/payments/expense-form-dialog.tsx client/src/components/payments/expenses/expense-form-dialog.tsx`, then make these edits in the moved file:
  - replace the label import and the `Expense` interface with

```tsx
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, EXPENSE_METHOD_LABELS } from "./expenses-labels";
import type { ExpensePreset, ExpenseRow } from "./expenses-types";
```

  - props:

```tsx
interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit mode when given; otherwise it creates. */
  expense?: ExpenseRow | null;
  /** «Yozish» (spec B6 §3.3, §3.7): category, the missing amount, description and branch filled in; its branch wins over the header's. */
  preset?: ExpensePreset | null;
  branchId?: number;
  onSaved: () => void;
}
```

    and destructure `preset` beside `expense`;
  - `const [category, setCategory] = useState<string>("OTHER");`;
  - the create branch of the seeding effect, and its dependencies:

```tsx
    } else {
      setCategory(preset?.category ?? "OTHER");
      setPaymentMethod("CASH");
      setAmount(preset ? preset.amount.toLocaleString("uz-UZ") : "");
      setDescription(preset?.description ?? "");
      setDate(new Date());
    }
  }, [open, expense, preset]);
```

  - in `handleSubmit`, before `if (!branchId)`: `const targetBranchId = preset?.branchId ?? branchId;` and use `targetBranchId` in the check and in `api.post("/expenses", { ...payload, branchId: targetBranchId })` (the toast text «Avval filialni tanlang — xarajat filialsiz saqlanmaydi» stays);
  - the category select items:

```tsx
                {EXPENSE_CATEGORIES.map((k) => (
                  <SelectItem key={k} value={k}>
                    {EXPENSE_CATEGORY_LABELS[k]}
                  </SelectItem>
                ))}
```

    (the method select keeps `Object.entries(EXPENSE_METHOD_LABELS)`, which now reads «Naqd»). Everything else stays as it is.

- [ ] **Step 2: The page** `expenses-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EntityHistoryTable } from "@/components/shared/entity-history-table";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useCan } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { lastPageIfPast } from "@/components/payments/debt/debt-url";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { ExpenseFormDialog } from "./expense-form-dialog";
import { ExpensesFilterBar } from "./expenses-filter-bar";
import { presetFor, toggleTurkum } from "./expenses-format";
import { ExpensesHeader } from "./expenses-header";
import { ExpensesMissingCard } from "./expenses-missing-card";
import { ExpensesMonthCard, ExpensesMonthCardSkeleton } from "./expenses-month-card";
import { invalidateExpenses, useExpensesList, useExpensesMonthSummary } from "./expenses-queries";
import { ExpensesTable } from "./expenses-table";
import type { ExpensePreset, ExpenseRow } from "./expenses-types";
import {
  EXPENSES_CLEARED, EXPENSES_PAGE_SIZES, EXPENSES_SCHEMA, hasExpenseFilter, listParams, pageMonth, pdfFileName, pdfParams, summaryParams,
  type ExpensesFilters,
} from "./expenses-url";

type FormState = { expense: ExpenseRow | null; preset: ExpensePreset | null } | null;

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
      <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>Qayta urinish</Button>
    </div>
  );
}

/** «Xarajatlar» (spec B6 §3). Every figure is the server's; the page only formats. */
export function ExpensesPage() {
  const { filters: raw, setFilters } = useUrlFilters(EXPENSES_SCHEMA);
  const filters = raw as ExpensesFilters;
  const qc = useQueryClient();
  const canManage = useCan("expenses.manage");
  // Wait for the branch to hydrate: the first request must carry the header's branch.
  const { selectedBranch, loaded } = useBranchSwitcher();
  const branchId = selectedBranch?.id;
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const summary = useExpensesMonthSummary(summaryParams(filters, current, branchId), loaded);
  const params = listParams(filters, current, branchId);
  const list = useExpensesList(params, loaded);
  const [form, setForm] = useState<FormState>(null);
  const [historyFor, setHistoryFor] = useState<ExpenseRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpenseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const data = list.data;
  // A page past the last one (a filter narrowed the list, an old link) goes to the last page that has rows.
  const lastPage = data && !list.isPlaceholderData ? lastPageIfPast(Number(params.page), Number(params.pageSize), data.total, data.data.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ sahifa: lastPage });
  }, [lastPage, setFilters]);
  // An unanswered or kept-and-empty answer is a skeleton, never «xarajat yo'q».
  const tableLoading = !data || lastPage !== null || (list.isPlaceholderData && data.data.length === 0);

  // Any filter change puts the table back on page 1.
  const onChange = useCallback((u: Partial<ExpensesFilters>) => setFilters({ sahifa: 1, ...u }), [setFilters]);
  const refresh = () => invalidateExpenses(qc);

  async function exportPdf() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(Object.entries(pdfParams(filters, current, branchId)).map(([k, v]) => [k, String(v)])).toString();
      await downloadAuthedFile(`/expenses/pdf?${qs}`, pdfFileName(month));
    } catch (e) {
      toast.error(getErrorMessage(e, "PDF yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/expenses/${confirmDelete.id}`);
      toast.success("Xarajat o'chirildi");
      setConfirmDelete(null);
      refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "O'chirishda xatolik"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ExpensesHeader month={month} current={current} canManage={canManage} exporting={exporting} pdfDisabled={!data?.total}
        onMonth={(m) => onChange({ oy: m === current ? "" : m })} onPdf={exportPdf} onAdd={() => setForm({ expense: null, preset: null })} />

      {/* One request feeds the warning and the card (spec §5.2): a failed request draws no warning, and the card shows the error. */}
      {summary.data && (
        <ExpensesMissingCard summary={summary.data} canManage={canManage}
          onWrite={(row) => setForm({ expense: null, preset: presetFor(row, month) })} />
      )}
      {summary.isError ? (
        <LoadError onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <ExpensesMonthCard summary={summary.data} selected={filters.turkum} onToggle={(c) => onChange({ turkum: toggleTurkum(filters.turkum, c) })} />
      ) : (
        <ExpensesMonthCardSkeleton />
      )}

      <ExpensesFilterBar filters={filters} creators={summary.data?.creators ?? []}
        selection={data && !list.isPlaceholderData ? { count: data.total, amount: data.summary.totalAmount } : null} onChange={onChange} />

      {list.isError ? (
        <LoadError onRetry={() => list.refetch()} />
      ) : (
        <div className="space-y-3">
          {/* The previous answer stays dimmed and inert until the next one lands. */}
          <div aria-busy={list.isPlaceholderData} className={cn(list.isPlaceholderData && "pointer-events-none opacity-60")}>
            <ExpensesTable rows={data?.data} loading={tableLoading} offset={(Number(params.page) - 1) * Number(params.pageSize)}
              emptyMonth={!hasExpenseFilter(filters)} canManage={canManage}
              onEdit={(e) => setForm({ expense: e, preset: null })} onHistory={setHistoryFor} onDelete={setConfirmDelete}
              onClear={hasExpenseFilter(filters) ? () => onChange(EXPENSES_CLEARED) : undefined} />
          </div>
          {data && data.total > 0 && !tableLoading && (
            <PaymentsPager page={Number(params.page)} pageSize={Number(params.pageSize)} total={data.total} sizes={EXPENSES_PAGE_SIZES}
              sizeLabel="Sahifadagi qatorlar soni" onPage={(sahifa) => setFilters({ sahifa })} onPageSize={(soni) => setFilters({ soni, sahifa: 1 })} />
          )}
        </div>
      )}

      <ExpenseFormDialog open={form !== null} onOpenChange={(v) => { if (!v) setForm(null); }}
        expense={form?.expense} preset={form?.preset} branchId={branchId} onSaved={refresh} />

      <Dialog open={!!historyFor} onOpenChange={(v) => { if (!v) setHistoryFor(null); }}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Xarajat tarixi</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {historyFor && <EntityHistoryTable entityType="Expense" entityId={historyFor.id} />}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v && !deleting) setConfirmDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xarajatni o&apos;chirasizmi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu xarajat o&apos;chiriladi va unga bog&apos;liq moliyaviy yozuv teskari yoziladi. Bu amalni qaytarib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(ev) => { ev.preventDefault(); void remove(); }}>
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```
(The old confirm text said «(ledger)» — an English word on screen; it is dropped.)

- [ ] **Step 3: Route, search, comment, deletions.**
  - `app/(dashboard)/payments/expenses/page.tsx`:

```tsx
import { Suspense } from "react";
import { ExpensesPage } from "@/components/payments/expenses/expenses-page";

// «Xarajatlar» (spec B6). Old `?startDate=` / `?category=` links are ignored: the page opens the current month.
export default function ExpensesRoutePage() {
  return (
    <Suspense fallback={null}>
      <ExpensesPage />
    </Suspense>
  );
}
```

  - `data/searchable-pages.ts`, right after the «To'lovlar» entry:

```ts
  { label: "Xarajatlar", url: "/payments/expenses", keywords: ["xarajat", "ijara", "kommunal", "soliq", "chiqim"] },
```

  - `components/ui/dialog.tsx`: in the comment, `(see payments/expenses-client.tsx)` → `(see payments/expenses/expense-form-dialog.tsx)`.
  - `git rm client/src/components/payments/expenses-client.tsx client/src/components/payments/expenses-summary-cards.tsx client/src/components/payments/expenses-filter-bar.tsx client/src/components/payments/expenses-pdf-range-dialog.tsx`.

- [ ] **Step 4: Check nothing is left.** `grep -rn "expenses-client\|expenses-summary-cards\|expenses-pdf-range-dialog\|components/payments/expense-form-dialog\|from \"./expenses-filter-bar\"" client/src --include='*.ts' --include='*.tsx'` → only `client/src/components/payments/expenses/expenses-page.tsx` (its import of the NEW `./expenses-filter-bar`); `grep -rn "Naqt" client/src server/src --include='*.ts' --include='*.tsx'` → nothing.

- [ ] **Step 5: Run** (from `client/`) `npx vitest run src/components/payments src/lib src/data` → PASS; `npx tsc --noEmit -p .` → clean; `npm run lint` → 0 errors; `npm test` → PASS; `npx next build` → succeeds. Then, with the server from Tasks 1–5 running locally (`npm run start:dev` in `server/`, `npm run dev` in `client/`), open `/payments/expenses` as CEO: the month stepper, the card, the warning (current month), a category click filtering the table, «Yozish» opening the dialog filled in, «PDF» downloading `xarajatlar-YYYY-MM.pdf`; as a user without `expenses.manage`, no «Xarajat qo'shish», no «Yozish», only «Tarix» under «⋯». Stop both servers; `git checkout -- client/AGENTS.md` if `next dev` touched it.

- [ ] **Step 6: Commit** (from the worktree root)

```bash
git add -A client/src/components/payments/expenses client/src/components/payments/expense-form-dialog.tsx client/src/components/payments/expenses-client.tsx client/src/components/payments/expenses-summary-cards.tsx client/src/components/payments/expenses-filter-bar.tsx client/src/components/payments/expenses-pdf-range-dialog.tsx "client/src/app/(dashboard)/payments/expenses/page.tsx" client/src/data/searchable-pages.ts client/src/components/ui/dialog.tsx
git commit -m "feat(expenses): the month page replaces the date-range page; «Yozish» opens the dialog filled in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR, CLAUDE.md files and the user guide

**Files:**
- Create: `docs/adr/0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md`, `client/src/qollanma/kontent/xarajatlar/xarajatlar-sahifasi.mdx`, `client/src/qollanma/sahifalar/xarajatlar.ts`
- Modify: `docs/adr/README.md` (after the 0093 row), `server/CLAUDE.md` (Expenses Module: the «**Endpoints**» and «**Roles**» bullets), `client/CLAUDE.md` (Financial UI table row `/payments/expenses`; Financial UI Rules «**Cache invalidation**»; «Dialog / Modal Scroll Safety» reference), `client/src/qollanma/sahifalar/index.ts`, `client/src/qollanma/yangiliklar.ts`, `client/scripts/qollanma-kadrlar.mjs`

**Interfaces:**
- Consumes: the route, file and function names of Tasks 1–9.
- Produces: documentation only.

- [ ] **Step 0: Pick the number.** `git fetch origin && git show origin/main:docs/adr/README.md | grep -o '^| \[[0-9]*\]' | tail -3` and `ls docs/adr | tail -3`. The number is the highest on `origin/main` and in this worktree + 1 — `0094` if `main` still ends at `0093`. If `main` moved, use the next free number in every place below (file name, README row, the `adr` list in `sahifalar/xarajatlar.ts`, both CLAUDE.md mentions) and rename with `git mv` if the file already exists.

- [ ] **Step 1: The ADR (Uzbek)** `docs/adr/0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md`:

```markdown
# ADR-0094 — Xarajatlar sahifasi oy bo'yicha: jami — foydadagi «Boshqa xarajatlar» bilan bitta to'plam; «hali yozilmagan» Foyda prognozi qoidasidan, filial kesimida

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0038, ADR-0058, ADR-0067, ADR-0079, ADR-0082, ADR-0087, `docs/branch-decisions.md` D4, `server/src/expenses/expenses-month.ts`, `server/src/expenses/expenses-month.service.ts`, `server/src/expenses/expense-hints.ts`, `client/src/components/payments/expenses/`, `docs/superpowers/specs/2026-10-16-b6-xarajatlar-design.md`, `docs/superpowers/plans/2026-10-16-b6-xarajatlar.md`

## Kontekst

Moliya → «Xarajatlar» sahifasi ikki sana bilan ishlardi, standart davr esa brauzer soati bo'yicha joriy oy edi; Foyda, Ish haqi va To'lovlar oy bilan ishlaydi. To'rtta karta bu raqam foydadagi qaysi qator ekanini aytmasdi. Mijozda 8 turkumdan 5 tasi bor edi, shuning uchun soliq «Boshqa»ga yozilardi. Oy oxirida keladigan ijara, kommunal va soliq oy o'rtasida yozilmagan bo'ladi va foyda haqiqiydan katta ko'rinadi — «Foyda» kartasining prognozi buni bilardi (ADR-0038), xarajat kiritadigan odam esa ko'rmasdi. «Kim kiritgan» filtri yo'q edi, «Boshqa»ga noto'g'ri yozilgan stul yoki oylik hech qayerda ko'rinmasdi.

## Qaror

1. **Oy serverda.** `GET /expenses`, `/expenses/pdf` va yangi `/expenses/month-summary` `?oy=YYYY-MM` oladi: may 2026 dan joriy Toshkent oyigacha (undan oldin — 400 «Xarajatlar may 2026 dan boshlab ko'rsatiladi», kelajak — 400 «Kelajak oyni tanlab bo'lmaydi»). Oy oynasi bitta yordamchida (`expenseMonthWindow`): `date >= 1-sana`, `date < keyingi oyning 1-sanasi`. `oy` ham, eski `startDate`/`endDate` ham bo'lmasa — joriy oy. Eski sana parametrlari deploy oralig'i uchun qoladi; `oy` bilan birga kelsa — 400. Sahifada sana oralig'i yo'q.
2. **Jami — kanonik `operatingExpenses`.** Oy kartasining jami shu oy va doiradagi `ReportsService.getMonthlyNetProfit(...).operatingExpenses` bilan bitta to'plam: `companyId`, `deletedAt: null`, `TEACHER_ADVANCE` emas, oy oynasi, `branchIdWhere(doira)`. Tenglikni `expenses-month.profit-parity.spec.ts` chegara kunlari, avans, o'chirilgan, boshqa filial va boshqa kompaniya qatorlari bilan isbotlaydi.
3. **«Bu oy hali yozilmagan» — Foyda prognozining qoidasi.** `missingRecurringExpenses` (`reports/profit-composition.ts`) doiradagi har filial uchun alohida chaqiriladi (`missingByBranch`): o'tgan oy jami − bu oy yozilgani, manfiy emas; RENT, TAXES, UTILITIES; `recurringKeyOf` tavsifida «soliq» bo'lgan OTHER ni soliq deb oladi. «Yozish» shu qatorning filialiga yetmayotgan summani (`amount`) yozadi — hech narsa yozilmagan bo'lsa o'tgan oy summasi, qisman bo'lsa qolgani. Bu oy bitta ham xarajati yo'q ACTIVE filial ham ko'rsatiladi. Hammasi faqat joriy oyda.
4. **Maslahat belgilari serverda.** `expenseHint` (`expense-hints.ts`) faqat OTHER qatorga, tavsifdagi kalit so'z bo'yicha, so'z boshidan, katta-kichik harfga qaramay, bitta belgi: avval «oylik» guruhi, keyin «jihoz», keyin «kommunal». Ro'yxatning har qatori `hint` kodini oladi; matnni mijoz tanlaydi.
5. **«Kim kiritgan».** `?createdById=` (bir nechta); variantlar — shu oy va doirada xarajat kiritgan odamlar, o'chirilgan yoki nofaol xodim ham.

## Taqiqlanadi

- Xarajatlar jamisini kanonik to'plamdan boshqacha hisoblash — masalan avans bilan yoki `lte` + vaqt belgisi bilan.
- Ikkinchi «hali yozilmagan» qoidasini yozish: sahifa ham, Foyda prognozi ham `missingRecurringExpenses` ni chaqiradi.

## Muqobillar

- **Ogohlantirish doira yig'indisi bo'yicha** (Foyda kartasidagidek): oddiyroq, lekin «Yozish» qaysi filialga yozishini bilmaydi va bir filialning ortiqchasi ikkinchisining yetishmaganini yashiradi. Tanlanmadi.
- **Maslahat mijozda:** bitta tarmoq so'rovi kamroq, lekin kalit so'zlar ikki joyda bo'lardi. Tanlanmadi.
- **Sana oralig'ini qoldirish:** CEO tanlamadi.

## Oqibatlar

- May 2026 dan oldingi xarajatlar sahifada va PDF'da ko'rinmaydi.
- Ko'p filialli doirada «yozilmagan» summalari yig'indisi Foyda prognozidagi raqamdan farq qilishi mumkin (u yig'indi bo'yicha, bu filial bo'yicha); bitta filialda ular bir xil.
- «Boshqa»ga yozilgan soliq turkumlar jadvalida «Boshqa» qatorida qoladi, ogohlantirish esa uni soliq deb sanaydi.
- Maslahat belgilari kalit so'zlarga qaraydi: noto'g'ri maslahat chiqishi ham, kerakli maslahat chiqmasligi ham mumkin (CEO qarori 5 bilan qabul qilingan).
- Server avval, sayt keyin chiqadi: yangi sayt eski serverda `oy` ga 400 va `month-summary` ga 404 olardi.
```

- [ ] **Step 2: README row** in `docs/adr/README.md`, after the 0093 row:

```markdown
| [0094](0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md) | Xarajatlar sahifasi oy bo'yicha (`?oy=`, may 2026 dan): jami — kanonik sof foydaning `operatingExpenses` i bilan bitta to'plam (tenglik testi); «Bu oy hali yozilmagan» — `missingRecurringExpenses` har filialga alohida, «Yozish» qolganini yozadi; maslahat belgilari serverda, faqat «Boshqa» | Qabul qilindi | 2026-10-16 |
```

- [ ] **Step 3: server/CLAUDE.md**, Expenses Module: replace the two bullets «**Endpoints**: `POST /expenses`, `GET /expenses`, `PATCH /expenses/:id`, `DELETE /expenses/:id`» and «**Roles**: CEO, BD (create/update/delete) — Administrator was removed so the whole `/payments/expenses` page can be hidden from admins» with:

```markdown
- **Endpoints**: `POST /expenses`, `GET /expenses`, `GET /expenses/pdf`, `GET /expenses/month-summary`, `PATCH /expenses/:id`, `DELETE /expenses/:id`
- **Access**: reads `expenses.view`; writes `@Can('expenses.manage', 'salary.pay')` with the per-category rule in `ExpensesService.assertMayWrite` (an advance needs `salary.pay`, every other category `expenses.manage`, ADR-0087); by default both sit with the CEO and the Branch Director. Every read resolves its scope in `ExpensesController.scope()` (`resolveCallerReportBranchIds`; an empty scope is 403 «Bu filial xarajatlarini ko'rish huquqingiz yo'q»).
- **The page reads a month (ADR-0094, spec B6).** `GET /expenses` and `/expenses/pdf` take `?oy=YYYY-MM` (2026-05 … the current Tashkent month; 400 «Xarajatlar may 2026 dan boshlab ko'rsatiladi» / «Kelajak oyni tanlab bo'lmaydi»), through `expenses-month.ts` (`parseExpenseMonth`, `expenseMonthWindow`: `gte` the 1st, `lt` the next 1st). No `oy` and no `startDate`/`endDate` = the current month. The old `startDate`/`endDate` still work for a client on the old page; with `oy` they are 400 «Oy yoki sana oralig'i — ikkalasi birga emas». `?createdById=` (comma list) filters «Kim kiritgan». The list is ordered by `date`, `createdAt`, `id` (all descending) and every row carries `hint` (`expense-hints.ts`: `SALARY | EQUIPMENT | UTILITIES | null`, OTHER rows only, word-start keyword match, that priority). The PDF names the month («Oktabr 2026»), adds «Kim kiritgan: …» and is saved as `xarajatlar-YYYY-MM.pdf`; cash is «Naqd».
- **`GET /expenses/month-summary`** (`ExpensesMonthService`, `expenses.view`): the month card, «Bu oy hali yozilmagan» and the «Kim kiritgan» options in one answer. `total` is the canonical net profit's `operatingExpenses` for the same month and scope — the same set (company, live, no `TEACHER_ADVANCE`, the month window, `branchIdWhere`), proved by `expenses-month.profit-parity.spec.ts`; never compute the page's total another way. «Hali yozilmagan» is `missingRecurringExpenses` (`reports/profit-composition.ts`, the Foyda forecast's rule) called per branch (`missingByBranch`), current month only, plus every ACTIVE branch with no expense this month (`emptyBranches`). Listed in `branch-route-policy.ts` beside `GET /expenses` (`BRANCH_SCOPED_BY_SERVICE`). No cache.
```

- [ ] **Step 4: client/CLAUDE.md.**
  - Financial UI table: replace the row `| `/payments/expenses` | `expenses-client.tsx` | Expense list + create dialog |` with

```markdown
| `/payments/expenses` | `app/(dashboard)/payments/expenses/page.tsx` → `components/payments/expenses/expenses-page.tsx` | **«Xarajatlar» (spec B6, ADR-0094).** `expenses-header.tsx`: «Xarajatlar», `MonthStepper` (`?oy=YYYY-MM`, 2026-05 … the current Tashkent month — no date range), «PDF» (the month with the current filters, `GET /expenses/pdf`, off on an empty list) and «Xarajat qo'shish» (`useCan("expenses.manage")`). `expenses-missing-card.tsx` (amber, current month only: `missing[]` rows with «Yozish» → `expense-form-dialog.tsx` with `preset` — category, the missing amount, «Ijara — oktabr 2026», the row's branch — and `emptyBranches[]`), `expenses-month-card.tsx` (total, «N ta · naqd · karta», the green «Foydadagi «Boshqa xarajatlar» qatorining o'zi», eight categories this month vs last with the server's «yozilmagan»; a row click sets `?turkum=`), `expenses-filter-bar.tsx` (`q`, `turkum`, `usul=naqd|karta`, `kim`; «Tanlangan: N ta · X so'm» from the list's `total` and `summary.totalAmount`), `expenses-table.tsx` (`#`, Sana, Turkum, Tavsif + the server's `hint` pill, Summa, To'lov turi, Kim kiritgan, ⋯ — Tahrirlash/O'chirish only with `expenses.manage`, Tarix always), `PaymentsPager` 10–50. `expenses-url.ts` maps the URL keys to the server's names (`q→search`, `turkum→category`, `usul→paymentMethod`, `kim→createdById`, `sahifa/soni→page/pageSize`; the current month is not sent). Two requests: `GET /expenses/month-summary` (card, warning, «Kim kiritgan» options) and `GET /expenses`. The eight category keys are pinned to `schema.prisma` by `expenses-labels.test.ts`. The client computes no figure. |
```

  - Financial UI Rules, «**Cache invalidation**» bullet: «When creating, editing or deleting an expense, call `invalidateExpenses(qc)` (`payments/expenses/expenses-queries.ts`): the page's own queries and `OVERVIEW_QUERY_KEYS` («Foyda», «Oylar bo'yicha»).»
  - «Dialog / Modal Scroll Safety»: `Reference: `src/components/payments/expenses-client.tsx`.` → `Reference: `src/components/payments/expenses/expense-form-dialog.tsx`.`

- [ ] **Step 5: The guide.** `client/src/qollanma/kontent/xarajatlar/xarajatlar-sahifasi.mdx` (no `# h1`, no `{` `}` `<` in prose, invented figures only, no screenshot reference — the frame below is captured with `qollanma:skrinshot`, and an image the MDX names must exist in `public/`):

```mdx
## Sahifa nima beradi

Moliya → «Xarajatlar» bitta savolga javob beradi: tanlangan oyda qancha xarajat yozildi, nimaga, kim yozdi va nima hali yozilmagan. Sahifadagi jami «Umumiy ma'lumotlar» → «Foyda» → «Qanday hisoblandi»dagi «Boshqa xarajatlar» qatorining o'zi.

Sahifani CEO va filial direktori ko'radi. Filial tepadagi tanlovdan olinadi; «Barcha filiallar»da hamma filiallar yig'indisi chiqadi.

## Oy va PDF

Sarlavha yonidagi «‹ Oy ›» bilan oy tanlanadi: may 2026 dan joriy oygacha, kelajak oyni tanlab bo'lmaydi. Sana oralig'i yo'q. «PDF» tugmasi tanlangan oyning xarajatlarini joriy filtrlar bilan yuklab beradi; fayl nomida oy turadi.

## «Bu oy hali yozilmagan»

Joriy oyda sariq ogohlantirish chiqishi mumkin. U ikki narsani ko'rsatadi:

- o'tgan oy yozilgan, bu oy esa hali yozilmagan yoki kamroq yozilgan ijara, kommunal va soliq. Masalan: «Ijara — sentabrda 15 mln edi» yoki «Kommunal — sentabrda 3 mln edi, oktabrda hozircha 50 000 so'm». Bir nechta filial ko'rinib tursa, nom yonida filial yoziladi;
- bu oy bitta ham xarajat yozilmagan filial.

«Yozish» tugmasi xarajat oynasini shu turkum, yetmayotgan summa, tavsif va filial bilan to'ldirib ochadi: hech narsa yozilmagan bo'lsa — o'tgan oy summasi, qisman yozilgan bo'lsa — qolgani. Summani tekshirib, «Saqlash»ni bosing; qator o'zi yo'qoladi. Bular yozilmaguncha foyda haqiqiydan katta ko'rinadi — «Foyda» kartasining prognozi ham xuddi shu qoidaga qaraydi.

## Oy kartasi

Kartada oyning jami xarajati, nechta yozuv va naqd hamda karta bo'yicha bo'linishi turadi. Yashil qator jami foydadagi «Boshqa xarajatlar» bilan bir xil ekanini eslatadi; ustozlarga avans bu jamiga kirmaydi.

Turkumlar jadvalida sakkizta turkum — Ijara, Kommunal, Ta'minot, Marketing, Jihozlar, Ta'mirlash, Soliqlar, Boshqa — shu oy va o'tgan oy bilan. Joriy oyda o'tgan oy bo'lgan ijara, kommunal yoki soliq bu oy hali bo'lmasa, summa o'rnida «yozilmagan» belgisi turadi. Turkumni bossangiz, pastdagi ro'yxat shu turkumga filtrlanadi; yana bossangiz, filtr olinadi. Karta filtrlarga qaramaydi.

## Filtrlar va ro'yxat

- Qidiruv — tavsif bo'yicha.
- Turkum — bir nechtasini tanlash mumkin.
- To'lov turi — naqd yoki karta.
- «Kim kiritgan» — shu oyda xarajat yozgan xodimlar.

Filtrlar ostida «Tanlangan: N ta · X so'm» — tanlangan filtrlar bo'yicha butun ro'yxat, faqat sahifa emas. Ro'yxat sana bo'yicha, eng yangisi tepada. Har qatordagi «⋯» ichida «Tahrirlash», «Tarix» va «O'chirish» bor; xarajat kiritish huquqi bo'lmasa faqat «Tarix».

## Maslahat belgilari

«Boshqa» turkumidagi yozuv yonida ba'zan sariq belgi chiqadi: «Jihozlar turkumi emasmi?», «Kommunal turkumi emasmi?» yoki «Xodimlar oyligida ham bormi?». Ular tavsifdagi so'zlarga qaraydi (masalan stul, internet, farrosh), shuning uchun ba'zan noto'g'ri chiqishi mumkin. Belgi faqat eslatadi: turkum to'g'ri bo'lsa, hech narsa qilmang; noto'g'ri bo'lsa, «Tahrirlash» orqali o'zgartiring.

<Eslatma tur="diqqat">

Ustozlarga avans bu yerga yozilmaydi — u Ish haqi → Avanslar bo'limida. Xodimlar oyligi ham Ish haqida hisoblanadi. Ularni bu sahifaga xarajat qilib yozsangiz, foydadan ikki marta ayiriladi.

</Eslatma>
```

  `client/src/qollanma/sahifalar/xarajatlar.ts`:

```ts
import type { QollanmaSahifa } from "../turlar";

export const xarajatlar: QollanmaSahifa[] = [
  {
    bolim: "xarajatlar",
    sahifa: "xarajatlar-sahifasi",
    sarlavha: "Xarajatlar sahifasi",
    qisqacha:
      "Tanlangan oyda qancha xarajat yozilgani, nimaga va kim yozgani, nima hali yozilmagani — jami foydadagi «Boshqa xarajatlar» qatorining o'zi.",
    rollar: [1, 2],
    adr: ["0094", "0038"],
    yollar: ["/payments/expenses"],
    kalitSozlar: ["xarajat", "xarajat qo'shish", "ijara", "kommunal", "soliq", "turkum", "kim kiritgan", "bu oy hali yozilmagan", "boshqa xarajatlar", "avans", "filial xarajati"],
    yangilangan: "2026-10-16",
  },
];
```

  `client/src/qollanma/sahifalar/index.ts`: `import { xarajatlar } from "./xarajatlar";` and `export const sahifalar: QollanmaSahifa[] = [...boshlash, ...oquvchilar, ...guruhlar, ...davomat, ...tolovlar, ...xarajatlar, ...hisobotlar];`.

  News entry at the top of `client/src/qollanma/yangiliklar.ts` (the spec §7.2 text verbatim; `sana` is the PR day, never in the future, never older than the entry below it):

```ts
  {
    sana: "2026-10-16",
    sarlavha: "Xarajatlar sahifasi yangilandi",
    matn: "Moliya → «Xarajatlar»da endi oy tanlanadi. Tepada oyning jami xarajati va turkumlar bo'yicha shu oy bilan o'tgan oy — jami «Foyda»dagi «Boshqa xarajatlar» bilan bir xil. Joriy oyda o'tgan oy yozilgan ijara, kommunal yoki soliq hali yozilmagan bo'lsa, ogohlantirish chiqadi: «Yozish» xarajat oynasini to'ldirib ochadi. «Kim kiritgan» filtri va Jihozlar, Ta'mirlash, Soliqlar turkumlari qo'shildi.",
    rollar: [1, 2],
    sahifa: { bolim: "xarajatlar", sahifa: "xarajatlar-sahifasi" },
  },
```

  Screenshot frame, appended to `KADRLAR` in `client/scripts/qollanma-kadrlar.mjs`:

```js
  {
    nom: "xarajatlar/xarajatlar-sahifasi",
    url: "/payments/expenses",
    kutish: 'role=heading[name="Xarajatlar"]',
    belgilar: [{ selector: 'role=button[name="Oldingi oy"]', raqam: 1 }],
    kesish: null,
  },
```

- [ ] **Step 6: Run** `cd client && npx vitest run src/qollanma` → PASS (registry: the MDX exists, no h1, the route exists, no breadcrumb clash; news order and date).

- [ ] **Step 7: Commit** (from the worktree root)

```bash
git add docs/adr/0094-xarajatlar-oy-boyicha-foyda-bilan-bitta-toplam.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md client/src/qollanma/kontent/xarajatlar/xarajatlar-sahifasi.mdx client/src/qollanma/sahifalar/xarajatlar.ts client/src/qollanma/sahifalar/index.ts client/src/qollanma/yangiliklar.ts client/scripts/qollanma-kadrlar.mjs
git commit -m "docs(expenses): ADR-0094, CLAUDE.md and the «Xarajatlar sahifasi» guide page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(with the real number if Step 0 changed it).

---

## Spec coverage

| Spec | Task |
|---|---|
| §1, §2 (CEO decisions 1–7) | whole plan; 1 → T9 (route, menu unchanged), T4/T5 (`expenses.view` / `expenses.manage`), T7 (header, `MonthStepper`, PDF, write button), T1 (no date range on the server side: `oy`); 2 → T1 (`missingByBranch`, `emptyBranches`), T6 (`presetFor`: the missing amount, §2.2), T7 (warning card); 3 → T1/T3 (card figures, parity), T7 (card); 4 → T4 (`createdById`), T6 (URL, 8 categories), T8 (filters, table); 5 → T2 (`expenseHint`), T8 (pill); 6 → T6 (`ADVANCE_NOTE`), T8 (under the table), T10 (guide); 7 → no migration (Global Constraints «Rollout») |
| §3.1 menu, access, branch from the header, write buttons hidden | T9 (route; `payments-nav.ts` and `breadcrumb-routes.ts` unchanged), T5 (403 on an empty scope), T7/T8/T9 (`useCan("expenses.manage")`) |
| §3.2 header, month floor and max, PDF off on empty list, range dialog removed | T7 (header), T6 (`pageMonth`), T9 (PDF, deletions) |
| §3.3 warning card: current month only, rows, branch name, `mln`, «Yozish», empty branch, footnote | T1 (rows), T3 (current month only), T6 (texts, preset), T7 (card), T9 (dialog opens, invalidation removes the row) |
| §3.4 month card: total, count/cash/card, green line, 8 rows fixed order, bars, «yozilmagan», click/Enter/Space → `?turkum=`, filter-independent | T1 (`buildCategoryRows`), T3, T6 (`toggleTurkum`, `summaryParams`), T7 (card; rows are buttons) |
| §3.5 filters: search 300 ms, categories, method single, «Kim kiritgan», «Tozalash», «Tanlangan», page 1, server-side | T4 (`createdById`), T6 (URL), T8 (bar), T9 (`onChange` → `sahifa: 1`) |
| §3.6 table columns, order, paging 10–50, footnote | T4 (order), T8 (table), T9 (pager) |
| §3.7 dialog: 8 categories, `preset`, branch wins, «Naqd» | T6 (labels), T9 (dialog) |
| §3.8 empty, loading, error | T7 (card empty), T8 (table empty/skeleton), T9 (error blocks, skeletons) |
| §4.1 month window, bounds, 400s, `oy` vs range | T1 (`parseExpenseMonth`, `expenseMonthWindow`), T4 (`monthOf`, `dateWhere`), T5 (DTO format 400) |
| §4.2 one set with canonical profit | T3 (`loadRows`, parity spec) |
| §4.3 per-branch missing, `amount` = rest, empty branch, current month only | T1, T3 |
| §4.4 hints | T2, T4 (`hint` per row), T6/T8 (texts) |
| §4.5 «Kim kiritgan» filter and options | T3 (`creators`), T4 (`createdById`), T8 |
| §5.1 files, scope via `scope()`, no cache | T1–T3, T5 |
| §5.2 `month-summary` shape | T1 (types), T3 (service), T5 (route) |
| §5.3 list/PDF changes | T4 |
| §5.4 permissions, snapshot, branch policy, scope coverage | T5 (snapshot, policy, controller spec), T3 (every expense read carries `branchId`) |
| §5.5 nothing removed on the server | T4 (old range kept) |
| §6.1 client files, moves, deletions, no figure | T6–T9 |
| §6.2 URL keys and server names | T6 |
| §6.3 invalidation | T6 (`invalidateExpenses`), T9 |
| §6.4 menu unchanged, global search entry, Uzbek only | T9 |
| §7.1 ADR | T10 |
| §7.2 CLAUDE.md files, guide page, registry, news, screenshot frame | T10 |
| §8 tests | T1 (`expenses-month.spec`), T2 (`expense-hints.spec`), T3 (service spec, parity spec), T4 (list/PDF specs), T5 (controller, e2e, snapshot), T6 (url, labels vs `schema.prisma`, format), T7/T8 (static renders: empty, error-free states, «yozilmagan», hint pill, no write buttons without `expenses.manage`) |
| §9 deploy order | Global Constraints «Rollout» (not a task) |
| §10 known limits | T10 (ADR «Oqibatlar», guide) |

## Self-review notes

- Names used across tasks: server `EXPENSE_FIRST_MONTH`, `PAGE_CATEGORIES`, `PageCategory`, `MonthExpenseRow`, `CategoryRow`, `MissingRow`, `BranchRef`, `MonthSummary`, `parseExpenseMonth`, `expenseMonthWindow`, `expenseMonthTitle`, `summarize`, `buildCategoryRows`, `missingByBranch`, `emptyBranches`, `ExpenseHint`, `expenseHint`, `ExpensesMonthService.monthSummary`, `ExpenseMonthQueryDto`, `ExpensesController.monthSummary`, `ExpensesService.monthOf/dateWhere/listOrder`, `ExpensesPdfInput.creatorLabel`; client `EXPENSE_CATEGORIES`, `ExpenseCategoryKey`, `EXPENSE_CATEGORY_LABELS`, `EXPENSE_METHOD_LABELS`, `EXPENSE_HINT_LABELS`, `RECURRING_LABELS`, `isExpenseCategory`, `ExpenseRow`, `ExpensesListResponse`, `MonthCategoryRow`, `MissingRow`, `ExpenseCreator`, `MonthSummary`, `ExpensePreset`, `EXPENSES_FIRST_MONTH`, `EXPENSES_PAGE_SIZES`, `EXPENSES_SCHEMA`, `ExpensesFilters`, `EXPENSES_CLEARED`, `pageMonth`, `cleanTurkum`, `cleanUsul`, `cleanKim`, `summaryParams`, `pdfParams`, `listParams`, `hasExpenseFilter`, `pdfFileName`, `missingTitle`, `missingText`, `emptyBranchTitle`, `presetFor`, `toggleTurkum`, `dateText`, `enteredText`, `SAME_AS_PROFIT`, `CATEGORY_HINT`, `MISSING_FOOTNOTE`, `ADVANCE_NOTE`, `EXPENSES_KEYS`, `useExpensesList`, `useExpensesMonthSummary`, `invalidateExpenses`, `ExpensesHeader`, `ExpensesMonthCard`, `ExpensesMonthCardSkeleton`, `ExpensesMissingCard`, `ExpensesFilterBar`, `ExpensesTable`, `rowActions`, `ExpenseFormDialog`, `ExpensesPage`.
- Fixture arithmetic checked by hand: service spec October 5 000 000 + 70 000 = 5 070 000 (cash 5 000 000, card 70 000), September 5 000 000 + 4 700 000 + 1 200 000 = 10 900 000; Markaz utilities 4 700 000 − 70 000 = 4 630 000; Shimol tax 1 200 000 (OTHER «Soliqlar»), so the TAXES category row reads 0/0 and OTHER carries 1 200 000 last month. Parity edges: branch 1 = 700 000 + 300 000 = 1 000 000; every branch adds 900 000 = 1 900 000.
- `mln()` (B3) prints a decimal comma («17,8 mln») and full so'm under 100 000; the spec's «17.8 mln» is read as «through `mln()`», and the tests build expected strings with `mln()`.
- «Barcha filiallar» lists no branch column (spec §10); `multiBranch` counts the live branches in scope, so a CEO on one branch sees no branch names in the warning.
- `EXPENSE_METHOD_LABELS` moves to `expenses-labels.ts` because two salary-advance files imported it from the old filter bar that Task 9 deletes; the label change «Naqt» → «Naqd» reaches those screens too (spec §3.7: «mijozda ham»).
- Two client files beyond the spec's list: `expenses-types.ts` (the server shapes, B5 style) and `expenses-header.tsx` (so the write button's gate renders in a static test without pulling the page's hooks and `api`).
