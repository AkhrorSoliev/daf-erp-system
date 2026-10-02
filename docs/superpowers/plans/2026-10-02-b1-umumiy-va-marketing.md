# B1 — «Umumiy ma'lumotlar» and «Marketing» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/payments/overview` as the CEO-approved month view (month charges, today's debt, cash/salary/profit cards with two dialogs, a months table, recent payments) and add a CEO/BD «Marketing» report, with the server changes both need.

**Architecture:** Every figure keeps its single server source — `month-charges.ts`, `debt-split.ts`, `getIncomeMonthAttribution`, `SalaryMonthlyService.getMonthly`, `assembleMonthlyNetProfit` — and gains only the fields the new page prints. The cash attribution learns a third part, the advance, through a FIFO of credit fragments. Marketing is a new `reports/marketing/` module (pure math + service + controller) that reads first payments, MARKETING spend, `getMonthCharges`, `getDepartedStudentsSummary` and the lead funnel's own cohort. The client gets one component per block under `components/payments/overview/`, each with its own React Query query, skeleton and error state.

**Tech Stack:** NestJS + Prisma + Jest (server), Next.js + React Query + Tailwind/shadcn + Vitest static-markup tests (client).

## Global Constraints

- **Where commands run.** Every command runs from the worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/moliya-a2` (never `cd` to the main checkout). Server commands are written `cd server && …`, client commands `cd client && …`, git commands from the worktree root with repo-relative paths.
- **Server commands** (from `server/`):
  - one spec: `npx jest <path>`; full suite: `npm test`;
  - `npm run typecheck` — it type-checks specs too, because jest is transpile-only (a spec can mock a signature that no longer exists and stay green);
  - `npx eslint <files>`;
  - `npx prettier --write <touched .ts files>` — Prettier failures block CI.
- **Client commands** (from `client/`):
  - `npx vitest run <path>`; `npx tsc --noEmit -p .`; `npm run lint`;
  - **never run prettier on `client/` files.**
- Do not run the server build and the server tests in parallel; they share Prisma generation.
- **Language:**
  - commit messages and new code comments in English;
  - ADR text in Uzbek;
  - every user-visible string in Latin-script Uzbek — never English words, never the abbreviations CAC/LTV/ROI (`client/src/lib/uzbek-only-texts.test.ts` guards the new folders from Task 9 on);
  - in JSX text write the apostrophe as `&apos;` (`react/no-unescaped-entities`); inside a JS string or a JSX attribute string a plain `'` is fine.
- **The repository is public.** Tests use made-up numbers, never production figures or IDs.
- **Day and month boundaries:**
  - always `server/src/common/date/tashkent` helpers;
  - `@db.Date` columns (`Expense.date`) are bounded with `utcMidnightFromDateStr` and an exclusive upper bound;
  - never `getFullYear()`/`getMonth()` or `toISOString().slice` for "which month is it" (the client uses `currentMonthKey()` from `components/payments/salary-utils.ts`, which is Tashkent-shifted).
- **Money and branch rules:**
  - money reports resolve branch scope once with `resolveCallerReportBranchIds`;
  - an empty scope means 403;
  - every money query carries a branch predicate (`branchIdWhere`, `studentBranchWhere`, `userBranchWhere`).
- **Single sources:**
  - month figures only through `month-charges.ts` and `getMonthCharges`;
  - debt only through `debt-split.ts`;
  - net profit only through the canonical `assembleMonthlyNetProfit` / `getMonthlyNetProfit` / profit-composition;
  - salary only through `SalaryMonthlyService.getMonthly`;
  - never re-derive any of them in a client or a second service.
- The two debt numbers are never added (ADR-0059).
- Every new or changed `@Roles` needs a controller guard spec.
- Commit after each task, with tests passing. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Client conventions that apply to every new component** (`client/CLAUDE.md`):
  - every table starts with a `#` column (`className="w-12 border-r"` / `className="border-r text-muted-foreground"`), then the spec's columns;
  - a long dialog uses the fixed header / scrolling body / fixed footer pattern (`DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 …"`);
  - numbers through `src/lib/format-utils.ts` (uz-UZ), dates as `dd.MM`/`dd.MM.yyyy`;
  - a page that reads `useSearchParams` (here via `useUrlFilters`) is wrapped in `<Suspense>`.
- **Rollout (spec §7, not part of these tasks):** one PR; merge and deploy only with the CEO's go-ahead, client first, then the server; never across the 02:00 / 03:10 / 04:00 crons or at 23:00. The new client must tolerate the old server's missing fields («—» or the line left out).

---

**Spec:** `docs/superpowers/specs/2026-10-02-b1-umumiy-va-marketing-design.md` (read once, in full, before Task 1).

## Decisions where the spec and the code disagree (recorded here and in the reply)

1. **Six `DebtSplit` importers, not four.** Besides the dashboard types, the home money cards and the overdue-promises banner + its test, `payments/debt/debtors-view.tsx` and its test import `DebtSplit` from `payments-overview.tsx`. All six move to `overview/types.ts` (Task 7).
2. **More dead fields go than the spec lists.** `getFinancialOverview`'s `newStudentCount` and `marketingExpenses` only fed the removed CAC card tooltip; the trend's constant `activeBalance: 0` had no reader; the controller's `ownMonthProfit` («Oyning o'z foydasi», removed by the CEO) and `salary.computed.gross` have no reader on the new page. They go with their queries (Task 3). `getOwnMonthProfit` itself stays (Excel «Xulosa» reads it).
3. **`salary.computed` also gains `fullDeserved`.** The card's big figure is teachers `totals.fullDeserved` + staff `staffTotals.monthly` (spec §2.2(b)); the fold only had `netToPay`/`advances`/`gross` (Task 3).
4. **The trend stops at the reporting floor on the server.** A month before 2026-05 would make `getSalaryMonthly` clamp its payroll up to May; `getFinancialTrend` drops such months instead of computing a wrong canonical profit (Task 3). The client sends `?month=` only for a past month, so the default view keeps working against a server that predates the parameter (`forbidNonWhitelisted` would 400 it).
5. **`ExpectationHistoryQueryDto` becomes `MonthQueryDto`** (same fields: `branchId`, validated `month`) and serves `expectation-history`, `financial-trend` and `marketing`. `ReportsQueryDto` cannot take `month` (`forbidNonWhitelisted`), and adding it there would loosen every report.
6. **The Telegram lines ship with the attribution change (Task 2).** Their two callers and four spec mocks would otherwise be edited twice, and an intermediate commit would print «Shu oy» without the advance under a total that includes it.
7. **«Ketgan» includes INACTIVE.** The lead-funnel report groups INACTIVE with FROZEN; the spec says «FROZEN is frozen; every other status is ketgan», and the three parts must add up — the spec's rule is followed and stated in ADR-0067.
8. **The marketing endpoint gets its own controller** (`reports/marketing/reports-marketing.controller.ts`) with class-level `@Roles('CEO', 'Branch Director')`, so the reports controller's class default (which admits Administrator) cannot leak into it.

## File map

**Server**

| File | Change | Task |
|---|---|---|
| `server/src/reports/month-charges.ts` (+spec) | `MonthCharges.unpaidStudents` | 1 |
| `server/src/reports/debt-split.ts` (+spec) | `studying.olderCount`, `notStudying.byKind`, `debtKindOf`, `groupBy(['status'])` | 1 |
| `server/src/payments/payments-debtors.service.ts` (+spec) | new `splitDebt` input on the empty-scope path | 1 |
| six spec fixtures (listed in Task 1) | the new required fields | 1 |
| `server/src/reports/reports-financial.service.ts` (+spec) | attribution advance split (2); overview yesterday + removals, trend anchor (3) | 2, 3 |
| `server/src/reports/reports.service.ts` (+spec) | `getOwnMonthProfit` keeps the old meaning (2); trend `month` pass-through (3) | 2, 3 |
| `server/src/reports/own-month-profit.ts` | comment | 2 |
| `server/src/reports/reports-excel.workbook-input.ts` (+ excel spec fixture) | `currentMonth + advance` | 2 |
| `server/src/telegram-groups/daily-snapshot.service.ts` (+spec) | `collectedForMonth` keeps the old meaning | 2 |
| `server/src/telegram-groups/utils/income-split.util.ts` (+spec) | three parts, `sharesOf100` | 2 |
| `server/src/telegram-groups/telegram-group-daily-report.service.ts` (+spec) | passes `advance`; two pre-September lines keep the old meaning | 2 |
| `server/src/telegram-groups/telegram-group-report-menu.service.ts` (+spec) | passes `advance` | 2 |
| `server/scripts/verify-collection-ratio.ts`, `server/scripts/june-income-bases.ts` | `currentMonth + advance` | 2 |
| `server/src/reports/reports.controller.ts` (+spec) | overview roles/salary/month/ownMonthProfit, trend `month` | 3 |
| `server/src/reports/dto/month-query.dto.ts` (+spec) | renamed from `expectation-history-query.dto.ts` | 3 |
| `server/src/reports/reports-branch-scope-coverage.spec.ts` | yesterday scope, trend rename (3); marketing (5) | 3, 5 |
| `server/CLAUDE.md` | financial-overview role note (3); the rest (10) | 3, 10 |
| `server/src/payments/payments-read.service.ts` (+ `payments.service.spec.ts`) | `student.groups` | 4 |
| `server/src/reports/marketing/marketing.math.ts` (+spec) | new, pure | 5 |
| `server/src/reports/marketing/reports-marketing.service.ts` (+spec) | new | 5 |
| `server/src/reports/marketing/reports-marketing.controller.ts` (+spec) | new | 5 |
| `server/src/reports/lead-funnel/lead-funnel.math.ts` (+spec), `reports-lead-funnel.service.ts` (+spec) | `sourceBreakdown`, `getSourceBreakdown` | 5 |
| `server/src/reports/reports.module.ts` | wiring | 5 |
| `server/src/common/auth/branch-route-policy.ts` | manifest entry | 5 |

**Docs:** `docs/adr/0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md`, `docs/adr/README.md` (Task 6); `client/CLAUDE.md`, `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md` (Task 10).

**Client** (`client/src/…`)

| File | Change | Task |
|---|---|---|
| `components/payments/overview/types.ts` | new — server shapes (`DebtSplit`, `MonthCharges` moved here) | 7 |
| `components/payments/overview/overview-math.ts` (+test) | new — pure helpers | 7 |
| `components/payments/overview/queries.ts` | new — one hook per endpoint | 7, 8 |
| `components/payments/overview/block-state.tsx` | new — skeleton, error, money row | 7, 8 |
| `components/shared/month-stepper.tsx` | new — «‹ Oktabr 2026 ›» | 7 |
| `components/payments/overview/month-charges-card.tsx`, `debt-cards.tsx` | new — blocks 1, 2 | 7 |
| `components/payments/overview/recent-payments.tsx` | moved from `payments/recent-payments-table.tsx` + «Guruh» | 7 |
| `components/payments/overview/overview-page.tsx` (+test) | new — page, role split, URL month | 7, 8 |
| `app/(dashboard)/payments/overview/page.tsx` | renders the new page | 7 |
| six `DebtSplit` importers | import from `overview/types` | 7 |
| `lib/role-access.ts` (+test) | `FINANCIAL_OVERVIEW_ROLES` | 7 |
| deleted: `overview-client.tsx`, `payments-overview.tsx` (+test), `kpi-chart-dialog.tsx`, `income-attribution-panel.tsx` (+test), `profit-composition-panel.tsx`, `profit-composition-rows.tsx`, `profit-composition-text.ts` (+test), `expectation-history-dialog.tsx` | — | 7 |
| `components/payments/overview/cash-card.tsx`, `income-dialog.tsx`, `salary-card.tsx`, `profit-card.tsx`, `profit-dialog.tsx`, `months-table.tsx` (+ `overview-blocks.test.ts`) | new — blocks 3, 4, dialogs | 8 |
| `components/reports/marketing/marketing-format.ts` (+test), `marketing-view.tsx` (+test), `marketing-client.tsx`; `app/(dashboard)/reports/marketing/page.tsx` | new | 9 |
| `lib/reports-nav.ts` (+test), `lib/breadcrumb-routes.ts`, `lib/uzbek-only-texts.test.ts` | nav, label, guard | 9 |

---

### Task 1: Month charges count unpaid students; debt split counts «eski qarz» debtors and names the not-studying kinds

**Files:**
- Modify: `server/src/reports/month-charges.ts:19-98`
- Modify: `server/src/reports/month-charges.spec.ts`
- Modify: `server/src/reports/debt-split.ts`
- Modify: `server/src/reports/debt-split.spec.ts`
- Modify: `server/src/payments/payments-debtors.service.ts:389-397`
- Modify: `server/src/payments/payments-debtors.service.spec.ts`
- Modify (fixtures that type the shapes): `server/src/reports/reports-excel.service.spec.ts:151-154`, `server/src/reports/reports-excel.summary-sheet.spec.ts:280-287`, `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts:190-198`, `server/src/telegram-groups/telegram-group-stats.service.spec.ts:14-17,181-189`, `server/src/telegram-groups/utils/debt-split-lines.util.spec.ts:8-16,41-44`, `server/src/telegram-groups/utils/month-charges-lines.util.spec.ts:4-11`

**Interfaces:**
- Produces:
  - `MonthCharges.unpaidStudents: number` — students whose unpaid share in scope is above 0, counted inside `splitMonthCharges` beside `unpaid`.
  - `export interface DebtKind { total: number; count: number }`
  - `DebtSplit.studying.olderCount: number` — studying debtors with `older > 0`.
  - `DebtSplit.notStudying.byKind: { ungrouped: DebtKind; frozen: DebtKind; left: DebtKind }`
  - `export interface NotStudyingByStatus { status: string; sum: number | null; count: number }`
  - `export function debtKindOf(status: string): keyof DebtSplit['notStudying']['byKind']`
  - `splitDebt({ studying, chargedThisMonth, notStudying: readonly NotStudyingByStatus[] })` — `notStudying` is now one row per status.
  - `loadDebtSplit` reads the not-studying set with `prisma.student.groupBy({ by: ['status'], … })` (was `aggregate`).

- [ ] **Step 1: Write the failing month-charges tests**

In `server/src/reports/month-charges.spec.ts`, add `unpaidStudents: 0,` after `students: 1,` in the first test's `toEqual` (the «no debt» case) and after `students: 0,` in the «nothing charged» `toEqual`. Then add these three tests at the end of `describe('splitMonthCharges', …)`:

```ts
  it('counts the students whose unpaid share is above 0, beside the unpaid sum', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [
        row(1, '2026-10', 450_000),
        row(2, '2026-10', 450_000),
        row(3, '2026-10', 450_000),
      ],
      balances: new Map([
        [1, 20_000], // paid
        [2, -100_000], // part of the month unpaid
        [3, -600_000], // the whole month unpaid, and older debt
      ]),
    });
    expect(r.students).toBe(3);
    expect(r.unpaid).toBe(100_000 + 450_000);
    expect(r.unpaidStudents).toBe(2);
  });

  it("a debt that sits on a later month's charge does not make this month's student unpaid", () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -300_000]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.unpaidStudents).toBe(0);
  });

  it('a share that rounds to 0 in the branch is not counted, so the count agrees with unpaid', () => {
    // 1 so'm of debt over 999 999 + 1 so'm of charges: branch 2's share rounds to 0.
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [2],
      rows: [row(1, '2026-10', 999_999, 1), row(1, '2026-10', 1, 2)],
      balances: new Map([[1, -1]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.unpaidStudents).toBe(0);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx jest src/reports/month-charges.spec.ts`
Expected: FAIL — `unpaidStudents` is `undefined` in the new tests and missing from the two `toEqual`s.

- [ ] **Step 3: Implement `unpaidStudents`**

In `server/src/reports/month-charges.ts`, extend the interface:

```ts
  /** Students with a charge in scope. */
  students: number;
  /**
   * Students whose unpaid share in scope is above 0 — counted in
   * `splitMonthCharges` where `unpaid` is summed, so the two cannot disagree.
   */
  unpaidStudents: number;
}
```

Replace the loop and the return of `splitMonthCharges` (from `let charged = 0;` to the end of the function) with:

```ts
  let charged = 0;
  let unpaid = 0;
  let students = 0;
  let unpaidStudents = 0;
  for (const [studentId, s] of per) {
    if (s.scope <= 0) continue;
    students += 1;
    charged += s.scope;
    const debt = Math.max(0, -(input.balances.get(studentId) ?? 0));
    const unpaidAll = Math.min(Math.max(0, debt - s.later), s.all);
    const share = Math.round((unpaidAll * s.scope) / s.all);
    unpaid += share;
    if (share > 0) unpaidStudents += 1;
  }
  const paid = charged - unpaid;
  return {
    month: input.month,
    charged,
    paid,
    unpaid,
    paidPct: charged > 0 ? Math.round((paid / charged) * 1000) / 10 : null,
    students,
    unpaidStudents,
  };
}
```

- [ ] **Step 4: Run the month-charges spec**

Run: `cd server && npx jest src/reports/month-charges.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing debt-split tests**

Replace the whole content of `server/src/reports/debt-split.spec.ts` with:

```ts
import { Prisma, StudentStatus } from '@prisma/client';
import {
  ACTIVE_ENROLLMENT_WHERE,
  activeStudentWhere,
  ungroupedStudentWhere,
} from '../students/shared/active-student-where';
import {
  debtKindOf,
  splitDebt,
  loadDebtSplit,
  studyingDebtorWhere,
} from './debt-split';

const ZERO = { total: 0, count: 0 };

describe('studyingDebtorWhere', () => {
  it('is a live card owing money, in scope, by the faol-o‘quvchi rule — nothing else', () => {
    expect(studyingDebtorWhere(1, null)).toEqual({
      companyId: 1,
      deletedAt: null,
      balance: { lt: 0 },
      ...activeStudentWhere(),
    });
    expect(studyingDebtorWhere(1, [4]).branches).toEqual({
      some: { branchId: { in: [4] } },
    });
  });
});

describe('splitDebt', () => {
  it('a studying debtor: debt up to this month is «shu oy», the rest «eski qarz»', () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -100_000 },
        { id: 2, balance: -600_000 },
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
      ]),
      notStudying: [{ status: 'FROZEN', sum: -250_000, count: 3 }],
    });
    expect(r).toEqual({
      studying: {
        total: 700_000,
        count: 2,
        currentMonth: 100_000 + 450_000,
        older: 150_000,
        olderCount: 1,
      },
      notStudying: {
        total: 250_000,
        count: 3,
        byKind: {
          ungrouped: ZERO,
          frozen: { total: 250_000, count: 3 },
          left: ZERO,
        },
      },
    });
  });

  it('a studying debtor with no charge this month: all of it is «eski qarz»', () => {
    const r = splitDebt({
      studying: [{ id: 1, balance: -80_000 }],
      chargedThisMonth: new Map(),
      notStudying: [],
    });
    expect(r.studying).toEqual({
      total: 80_000,
      count: 1,
      currentMonth: 0,
      older: 80_000,
      olderCount: 1,
    });
  });

  it("counts as «eski qarz» only the debtors whose debt is above this month's charges", () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -450_000 }, // exactly this month's charge
        { id: 2, balance: -100_000 }, // part of it
        { id: 3, balance: -451_000 }, // 1 000 older
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
        [3, 450_000],
      ]),
      notStudying: [],
    });
    expect(r.studying.older).toBe(1_000);
    expect(r.studying.olderCount).toBe(1);
  });

  it('nobody owes → zeros', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: [],
    });
    expect(r).toEqual({
      studying: {
        total: 0,
        count: 0,
        currentMonth: 0,
        older: 0,
        olderCount: 0,
      },
      notStudying: {
        total: 0,
        count: 0,
        byKind: { ungrouped: ZERO, frozen: ZERO, left: ZERO },
      },
    });
  });

  it('names every not-studying status — ACTIVE guruhsiz, FROZEN muzlatilgan, the rest ketgan — and the parts add up', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: [
        { status: 'ACTIVE', sum: -1_280_000, count: 4 },
        { status: 'FROZEN', sum: -990_000, count: 3 },
        { status: 'EXPELLED', sum: -600_000, count: 2 },
        { status: 'GRADUATED', sum: -30_000, count: 1 },
        { status: 'INACTIVE', sum: -20_000, count: 1 },
        { status: 'ARCHIVED', sum: -5_000, count: 1 },
        { status: 'PROSPECT', sum: -1_000, count: 1 },
      ],
    });
    const { byKind } = r.notStudying;
    expect(byKind).toEqual({
      ungrouped: { total: 1_280_000, count: 4 },
      frozen: { total: 990_000, count: 3 },
      left: { total: 656_000, count: 6 },
    });
    expect(byKind.ungrouped.total + byKind.frozen.total + byKind.left.total).toBe(
      r.notStudying.total,
    );
    expect(byKind.ungrouped.count + byKind.frozen.count + byKind.left.count).toBe(
      r.notStudying.count,
    );
    expect(r.notStudying).toMatchObject({ total: 2_926_000, count: 13 });
  });
});

/**
 * Evaluates the few where-shapes these predicates use against one student:
 * `status`, `enrollments.some` / `enrollments.none` of the one active-enrollment
 * shape, and `NOT`.
 */
function matches(
  where: Prisma.StudentWhereInput,
  s: { status: string; inActiveGroup: boolean },
): boolean {
  if (where.NOT && matches(where.NOT as Prisma.StudentWhereInput, s)) {
    return false;
  }
  if (where.status !== undefined && where.status !== s.status) return false;
  const e = where.enrollments as { some?: unknown; none?: unknown } | undefined;
  if (e?.some !== undefined && !s.inActiveGroup) return false;
  if (e?.none !== undefined && s.inActiveGroup) return false;
  return true;
}

describe('debtKindOf', () => {
  it('status ACTIVE inside the not-studying set is exactly ungroupedStudentWhere()', () => {
    // Both predicates name the SAME enrollment shape, so «in an active group»
    // means one thing on either side.
    expect((activeStudentWhere().enrollments as { some: unknown }).some).toBe(
      ACTIVE_ENROLLMENT_WHERE,
    );
    expect(
      (ungroupedStudentWhere().enrollments as { none: unknown }).none,
    ).toBe(ACTIVE_ENROLLMENT_WHERE);

    const notStudying: Prisma.StudentWhereInput = { NOT: activeStudentWhere() };
    for (const status of Object.values(StudentStatus)) {
      for (const inActiveGroup of [true, false]) {
        const s = { status, inActiveGroup };
        const namedUngrouped =
          matches(notStudying, s) && debtKindOf(status) === 'ungrouped';
        expect({ status, inActiveGroup, namedUngrouped }).toEqual({
          status,
          inActiveGroup,
          namedUngrouped: matches(ungroupedStudentWhere(), s),
        });
      }
    }
  });

  it('FROZEN is muzlatilgan and every other status is ketgan', () => {
    expect(debtKindOf('FROZEN')).toBe('frozen');
    for (const status of [
      'EXPELLED',
      'GRADUATED',
      'INACTIVE',
      'ARCHIVED',
      'PROSPECT',
    ]) {
      expect(debtKindOf(status)).toBe('left');
    }
  });
});

describe('loadDebtSplit', () => {
  it('reads studying debtors by the faol-o‘quvchi rule and everyone else, by status, as not studying', async () => {
    const prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        groupBy: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', _sum: { balance: -50_000 }, _count: { _all: 1 } },
          {
            status: 'EXPELLED',
            _sum: { balance: -40_000 },
            _count: { _all: 1 },
          },
        ]),
      },
      enrollmentMonthlyCharge: {
        groupBy: jest
          .fn()
          .mockResolvedValue([
            { studentId: 5, _sum: { chargedAmount: 450_000 } },
          ]),
      },
    };
    const r = await loadDebtSplit(prisma as never, 1, {
      branchIds: [4],
      month: '2026-10',
    });
    const studyingWhere = prisma.student.findMany.mock.calls[0][0].where;
    expect(studyingWhere).toMatchObject({
      companyId: 1,
      deletedAt: null,
      balance: { lt: 0 },
      status: 'ACTIVE',
    });
    expect(studyingWhere.branches).toBeDefined(); // studentBranchWhere
    expect(prisma.student.groupBy.mock.calls[0][0]).toMatchObject({
      by: ['status'],
      _sum: { balance: true },
      _count: { _all: true },
    });
    expect(prisma.student.groupBy.mock.calls[0][0].where.NOT).toBeDefined();
    expect(r.studying).toEqual({
      total: 300_000,
      count: 1,
      currentMonth: 300_000,
      older: 0,
      olderCount: 0,
    });
    expect(r.notStudying).toEqual({
      total: 90_000,
      count: 2,
      byKind: {
        ungrouped: { total: 50_000, count: 1 },
        frozen: ZERO,
        left: { total: 40_000, count: 1 },
      },
    });
  });

  describe('what the three reads filter on', () => {
    const makeDb = () => ({
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      enrollmentMonthlyCharge: { groupBy: jest.fn().mockResolvedValue([]) },
    });

    it('reads the studying debtors with the exported predicate — the one /qarzdorlar lists by', async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });

      expect(prisma.student.findMany.mock.calls[0][0].where).toEqual(
        studyingDebtorWhere(1, [4]),
      );
    });

    it('both groups come from ONE rule: studying is it, not studying is its complement', async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      // Same fragment on both sides, so no student can be in both or in
      // neither — and an archived card (deletedAt) is in neither.
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject(
        activeStudentWhere(),
      );
      const notStudying = prisma.student.groupBy.mock.calls[0][0].where;
      expect(notStudying.NOT).toEqual(activeStudentWhere());
      expect(notStudying).toMatchObject({
        companyId: 1,
        deletedAt: null,
        balance: { lt: 0 },
      });
    });

    it('the branch rides on both student reads; company-wide has none; an empty scope matches nothing', async () => {
      const scoped = makeDb();
      await loadDebtSplit(scoped as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });
      const branch = { some: { branchId: { in: [4] } } };
      expect(scoped.student.findMany.mock.calls[0][0].where.branches).toEqual(
        branch,
      );
      expect(scoped.student.groupBy.mock.calls[0][0].where.branches).toEqual(
        branch,
      );

      const everyone = makeDb();
      await loadDebtSplit(everyone as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      expect(
        everyone.student.findMany.mock.calls[0][0].where.branches,
      ).toBeUndefined();
      expect(
        everyone.student.groupBy.mock.calls[0][0].where.branches,
      ).toBeUndefined();

      const nobody = makeDb();
      await loadDebtSplit(nobody as never, 1, {
        branchIds: [],
        month: '2026-10',
      });
      const matchesNothing = { some: { branchId: { in: [] } } };
      expect(nobody.student.findMany.mock.calls[0][0].where.branches).toEqual(
        matchesNothing,
      );
      expect(nobody.student.groupBy.mock.calls[0][0].where.branches).toEqual(
        matchesNothing,
      );
    });

    it("the charges read is chained to the studying debtors: that month's CHARGED charges, no branch of its own", async () => {
      const prisma = makeDb();
      await loadDebtSplit(prisma as never, 1, {
        branchIds: [4],
        month: '2026-10',
      });
      expect(
        prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0],
      ).toMatchObject({
        by: ['studentId'],
        where: {
          companyId: 1,
          studentId: { in: [5] },
          periodYear: 2026,
          periodMonth: 10,
          status: 'CHARGED',
        },
      });
      // `toEqual` pins that it carries NO `branchId`: the balance is one, so
      // the charge of a student the scoped read returned counts in any branch.
      expect(
        prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where,
      ).toEqual({
        companyId: 1,
        studentId: { in: [5] },
        periodYear: 2026,
        periodMonth: 10,
        status: 'CHARGED',
      });
    });

    it('reads no charges when nobody studying owes', async () => {
      const prisma = makeDb();
      prisma.student.findMany.mockResolvedValue([]);
      const r = await loadDebtSplit(prisma as never, 1, {
        branchIds: null,
        month: '2026-10',
      });
      expect(prisma.enrollmentMonthlyCharge.groupBy).not.toHaveBeenCalled();
      expect(r.studying).toEqual({
        total: 0,
        count: 0,
        currentMonth: 0,
        older: 0,
        olderCount: 0,
      });
    });

    describe('without a month', () => {
      afterEach(() => jest.useRealTimers());

      it('it is the current TASHKENT month, not the UTC one', async () => {
        // 31.10 20:00 UTC is already 01.11 01:00 in Tashkent.
        jest.useFakeTimers({
          doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
        });
        jest.setSystemTime(new Date('2026-10-31T20:00:00Z'));
        const prisma = makeDb();

        await loadDebtSplit(prisma as never, 1, { branchIds: null });

        expect(
          prisma.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where,
        ).toMatchObject({ periodYear: 2026, periodMonth: 11 });
      });
    });
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `cd server && npx jest src/reports/debt-split.spec.ts`
Expected: FAIL — `debtKindOf` is not exported, `olderCount`/`byKind` missing, `student.groupBy` never called.

- [ ] **Step 7: Implement the split**

In `server/src/reports/debt-split.ts`:

1. Change the first import line to `import { MonthlyChargeStatus, Prisma, StudentStatus } from '@prisma/client';`.
2. Replace the `DebtSplit` interface and `splitDebt` (from `export interface DebtSplit {` to the end of `splitDebt`) with:

```ts
/** One part of a debt: how much and how many students owe it. */
export interface DebtKind {
  total: number;
  count: number;
}

export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    /** 🟡 qarzning shu oy hisobigacha bo'lgan qismi. */
    currentMonth: number;
    /** 🔴 qolgani. */
    older: number;
    /** Studying debtors with some «eski qarz» (`older > 0`). */
    olderCount: number;
  };
  notStudying: {
    total: number;
    count: number;
    /**
     * «guruhsiz» / «muzlatilgan» / «ketgan» (ADR-0067). Parts of `total` and
     * `count` by construction — they add up to them exactly.
     */
    byKind: { ungrouped: DebtKind; frozen: DebtKind; left: DebtKind };
  };
}

/** One `groupBy(['status'])` row of the not-studying set. */
export interface NotStudyingByStatus {
  status: string;
  sum: number | null;
  count: number;
}

/**
 * Which «o'qimayotgan» kind a not-studying debtor is, from the status alone.
 *
 * The not-studying set is `debtorBase ∧ ¬activeStudentWhere()`, and
 * `activeStudentWhere() = status ACTIVE ∧ enrollments.some(E)`. On a row whose
 * status IS ACTIVE the negation leaves `¬enrollments.some(E)`, i.e.
 * `enrollments.none(E)` — exactly `ungroupedStudentWhere()`, which is built
 * from the same `E` (`ACTIVE_ENROLLMENT_WHERE`). So ACTIVE here means
 * «guruhsiz»; FROZEN is «muzlatilgan»; every other status (EXPELLED,
 * GRADUATED, INACTIVE, ARCHIVED with `deletedAt` null, PROSPECT) is «ketgan».
 */
export function debtKindOf(
  status: string,
): keyof DebtSplit['notStudying']['byKind'] {
  if (status === StudentStatus.ACTIVE) return 'ungrouped';
  if (status === StudentStatus.FROZEN) return 'frozen';
  return 'left';
}

/** Pure. `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function splitDebt(input: {
  studying: readonly { id: number; balance: number }[];
  chargedThisMonth: ReadonlyMap<number, number>;
  notStudying: readonly NotStudyingByStatus[];
}): DebtSplit {
  let total = 0;
  let currentMonth = 0;
  let olderCount = 0;
  for (const s of input.studying) {
    const debt = Math.max(0, -s.balance);
    const thisMonth = Math.min(debt, input.chargedThisMonth.get(s.id) ?? 0);
    total += debt;
    currentMonth += thisMonth;
    if (debt > thisMonth) olderCount += 1;
  }
  const byKind = {
    ungrouped: { total: 0, count: 0 },
    frozen: { total: 0, count: 0 },
    left: { total: 0, count: 0 },
  };
  for (const row of input.notStudying) {
    const kind = byKind[debtKindOf(row.status)];
    kind.total += Math.max(0, -(row.sum ?? 0));
    kind.count += row.count;
  }
  return {
    studying: {
      total,
      count: input.studying.length,
      currentMonth,
      older: total - currentMonth,
      olderCount,
    },
    notStudying: {
      total: byKind.ungrouped.total + byKind.frozen.total + byKind.left.total,
      count: byKind.ungrouped.count + byKind.frozen.count + byKind.left.count,
      byKind,
    },
  };
}
```

3. In `type DebtSplitDb`, change `'findMany' | 'aggregate'` to `'findMany' | 'groupBy'`.
4. In `loadDebtSplit`, replace the `prisma.student.aggregate({ … })` element of the `Promise.all` with:

```ts
    // One row per status of the not-studying set; `debtKindOf` names each.
    prisma.student.groupBy({
      by: ['status'],
      where: {
        ...debtorBase(companyId, opts.branchIds),
        NOT: activeStudentWhere(),
      },
      _sum: { balance: true },
      _count: { _all: true },
    }),
```

and the final `splitDebt` call with:

```ts
  return splitDebt({
    studying,
    chargedThisMonth: new Map(
      charges.map((c) => [c.studentId, c._sum.chargedAmount ?? 0]),
    ),
    notStudying: notStudying.map((r) => ({
      status: r.status,
      sum: r._sum.balance,
      count: r._count._all,
    })),
  });
```

- [ ] **Step 8: Update the debtors-summary caller and its spec**

In `server/src/payments/payments-debtors.service.ts`, the empty-scope branch of `getDebtorSummary`: replace `notStudying: { sum: null, count: 0 },` with `notStudying: [],`.

In `server/src/payments/payments-debtors.service.spec.ts`:
1. In the `prisma` type, change `student: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock };` to `student: { findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock; groupBy: jest.Mock };` and add `groupBy: jest.fn().mockResolvedValue([]),` to the `student` mock object (keep `aggregate`: the debtor list still uses it).
2. In the comment above `readsOneStudyingAndTwoNot`, change `o'qimayotganlar (aggregate)` to `o'qimayotganlar (groupBy, status bo'yicha)`. In `readsOneStudyingAndTwoNot`, replace the `prisma.student.aggregate.mockResolvedValue({ _sum: { balance: -90_000 }, _count: 2 });` statement with:

```ts
      prisma.student.groupBy.mockResolvedValue([
        { status: 'FROZEN', _sum: { balance: -90_000 }, _count: { _all: 2 } },
      ]);
```

3. In the test «qarz ikki raqam (split) + va'da sonlari…», the expected `split` becomes:

```ts
        split: {
          studying: {
            total: 300_000,
            count: 1,
            currentMonth: 300_000,
            older: 0,
            olderCount: 0,
          },
          notStudying: {
            total: 90_000,
            count: 2,
            byKind: {
              ungrouped: { total: 0, count: 0 },
              frozen: { total: 90_000, count: 2 },
              left: { total: 0, count: 0 },
            },
          },
        },
```

4. In «kartalar BUTUN qamrovni tasvirlaydi…», replace `prisma.student.aggregate.mock.calls[0][0].where,` with `prisma.student.groupBy.mock.calls[0][0].where,`.
5. In «ro'yxat ishlatadigan filial qamrovining o'zi…», replace the last assertion's `prisma.student.aggregate.mock.calls[0][0].where.branches` with `prisma.student.groupBy.mock.calls[0][0].where.branches` (the cards' not-studying read, which is what the test is about).
6. In «bo'sh qamrov: nol split…», the expected `split` becomes `{ studying: { total: 0, count: 0, currentMonth: 0, older: 0, olderCount: 0 }, notStudying: { total: 0, count: 0, byKind: { ungrouped: { total: 0, count: 0 }, frozen: { total: 0, count: 0 }, left: { total: 0, count: 0 } } } }`, and `expect(prisma.student.aggregate).not.toHaveBeenCalled();` becomes `expect(prisma.student.groupBy).not.toHaveBeenCalled();`.

- [ ] **Step 9: Run the three specs**

Run: `cd server && npx jest src/reports/debt-split.spec.ts src/reports/month-charges.spec.ts src/payments/payments-debtors.service.spec.ts`
Expected: PASS.

- [ ] **Step 10: Fix the fixtures the type-check finds**

Run: `cd server && npm run typecheck`
Expected: TS2741/TS2345 in exactly these six spec files (measured on a copy of the tree). Add the new required fields:

- `src/reports/reports-excel.service.spec.ts` (`const debtSplit: DebtSplit`): `studying: { total: 60_000, count: 2, currentMonth: 25_000, older: 35_000, olderCount: 1 },` and `notStudying: { total: 20_000, count: 1, byKind: { ungrouped: { total: 0, count: 0 }, frozen: { total: 20_000, count: 1 }, left: { total: 0, count: 0 } } },`.
- `src/reports/reports-excel.summary-sheet.spec.ts` (the `monthCharges` of «block 4 of a monthly month…»): add `unpaidStudents: 4,` after `students: 12,`.
- `src/telegram-groups/telegram-group-daily-report.service.spec.ts` (`DEBT_SPLIT`): add `olderCount: 9,` after `older: 2_300_000,` and make `notStudying: { total: 9_100_000, count: 31, byKind: { ungrouped: { total: 3_100_000, count: 11 }, frozen: { total: 4_000_000, count: 12 }, left: { total: 2_000_000, count: 8 } } },`.
- `src/telegram-groups/telegram-group-stats.service.spec.ts`: `NOBODY_OWES` becomes `{ studying: { total: 0, count: 0, currentMonth: 0, older: 0, olderCount: 0 }, notStudying: { total: 0, count: 0, byKind: { ungrouped: { total: 0, count: 0 }, frozen: { total: 0, count: 0 }, left: { total: 0, count: 0 } } } }`; in the `split` of «debt as two numbers», add `olderCount: 13,` after `older: 2_400_000,` and make `notStudying: { total: 40_600_000, count: 327, byKind: { ungrouped: { total: 15_000_000, count: 128 }, frozen: { total: 14_600_000, count: 99 }, left: { total: 11_000_000, count: 100 } } },`.
- `src/telegram-groups/utils/debt-split-lines.util.spec.ts`: in `split`, add `olderCount: 5,` after `older: 2_100_000,` and make `notStudying: { total: 900_000, count: 7, byKind: { ungrouped: { total: 300_000, count: 2 }, frozen: { total: 400_000, count: 3 }, left: { total: 200_000, count: 2 } } },`; in «leaves the shu oy / eski qarz line out…», the inline literal becomes `studying: { total: 0, count: 0, currentMonth: 0, older: 0, olderCount: 0 },`.
- `src/telegram-groups/utils/month-charges-lines.util.spec.ts`: add `unpaidStudents: 98,` after `students: 237,` in `october`.

Run: `cd server && npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Format, lint, run the touched specs**

```bash
cd server && npx prettier --write src/reports/month-charges.ts src/reports/month-charges.spec.ts src/reports/debt-split.ts src/reports/debt-split.spec.ts src/payments/payments-debtors.service.ts src/payments/payments-debtors.service.spec.ts src/reports/reports-excel.service.spec.ts src/reports/reports-excel.summary-sheet.spec.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts src/telegram-groups/telegram-group-stats.service.spec.ts src/telegram-groups/utils/debt-split-lines.util.spec.ts src/telegram-groups/utils/month-charges-lines.util.spec.ts
cd server && npx eslint src/reports/month-charges.ts src/reports/debt-split.ts src/payments/payments-debtors.service.ts
cd server && npx jest src/reports src/payments src/telegram-groups
```
Expected: lint shows no errors; all specs PASS.

- [ ] **Step 12: Commit**

```bash
git add server/src/reports/month-charges.ts server/src/reports/month-charges.spec.ts server/src/reports/debt-split.ts server/src/reports/debt-split.spec.ts server/src/payments/payments-debtors.service.ts server/src/payments/payments-debtors.service.spec.ts server/src/reports/reports-excel.service.spec.ts server/src/reports/reports-excel.summary-sheet.spec.ts server/src/telegram-groups/telegram-group-daily-report.service.spec.ts server/src/telegram-groups/telegram-group-stats.service.spec.ts server/src/telegram-groups/utils/debt-split-lines.util.spec.ts server/src/telegram-groups/utils/month-charges-lines.util.spec.ts
git commit -m "feat(reports): count unpaid students and split not-studying debt by kind

MonthCharges.unpaidStudents is counted where unpaid is summed. DebtSplit
gains studying.olderCount and notStudying.byKind (guruhsiz / muzlatilgan /
ketgan) from one groupBy over the not-studying predicate.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The advance gets its own part of the cash (`getIncomeMonthAttribution`) — and every reader follows

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts:528-778` (`getIncomeMonthAttribution` and its doc comment)
- Modify: `server/src/reports/reports-financial.service.spec.ts:835-1126` (`describe('getIncomeMonthAttribution')`)
- Modify: `server/src/reports/reports.service.ts:340-357` (`getOwnMonthProfit`), `server/src/reports/reports.service.spec.ts:1289-1352`
- Modify: `server/src/reports/own-month-profit.ts:3-9` (comment)
- Modify: `server/src/reports/reports-excel.workbook-input.ts:168-218`, `server/src/reports/reports-excel.service.spec.ts:219-224`
- Modify: `server/src/telegram-groups/daily-snapshot.service.ts:117`, `server/src/telegram-groups/daily-snapshot.service.spec.ts:39-41`
- Modify: `server/src/telegram-groups/utils/income-split.util.ts`, `server/src/telegram-groups/utils/income-split.util.spec.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts:67-70,574,596-600,888-927`, its spec
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts:336-371`, its spec
- Modify: `server/scripts/verify-collection-ratio.ts:65`, `server/scripts/june-income-bases.ts:38,50,53`

**Interfaces:**
- Consumes: nothing new.
- Produces — `getIncomeMonthAttribution(companyId, { branchIds, startDate?, endDate? })` returns, in addition to the old fields:
  - `advance: number` — in-scope credit still standing at the period end, or spent by a debit after it;
  - `advanceStudents: number` — students holding some of `advance` at the period end;
  - `paymentCount: number`, `latePaymentCount: number`, `lateStudentCount: number`;
  - `total === currentMonth + advance + lateTotal` (unchanged meaning: the period's tallied payments);
  - `collectionPct` numerator is `currentMonth + advance` (the old `currentMonth`).
- Produces — `IncomeSplitInput` gains `advance: number`; `export function sharesOf100(amounts: readonly number[]): number[]`.

**Every reader of `currentMonth` / `total` / `collectionPct`, and what it does after this task** (grep: `grep -rn "getIncomeMonthAttribution\|income-month-attribution" server/src server/scripts client/src`):

| Reader | Reads | Decision |
|---|---|---|
| `reports.controller.ts` `getIncomeMonthAttribution` | whole result | passes it through; the new client dialog prints all three parts (Task 8) |
| `reports.service.ts` `getOwnMonthProfit` (Excel «Xulosa» block 2; the overview card that used it is removed) | `currentMonth`, `total` | **old meaning:** `ownMoney = currentMonth + advance` |
| `reports-excel.workbook-input.ts` `buildSummaryInput` (Excel «Xulosa» block 3 and the lesson-money block) | `currentMonth` | **old meaning:** `currentMonth + advance` — block 3 must still foot to `total`, and Excel is untouched by the spec |
| `daily-snapshot.service.ts` (`collectedForMonth`) | `currentMonth` | **old meaning:** the 23:40 record cannot be rebuilt, so its column keeps its meaning |
| `telegram-group-daily-report.service.ts` income lines | `total`, parts | **prints the advance** (`buildIncomeSplitLines`) |
| `telegram-group-daily-report.service.ts` «Shundan yig'ildi», «Oy rejasidan yig'ildi» (months before 2026-09 only) | `currentMonth`, `collectionPct` | **old meaning:** `currentMonth + advance`; `collectionPct` unchanged |
| `telegram-group-report-menu.service.ts` (`rm:cfin`) | `total`, parts | **prints the advance** |
| `scripts/verify-collection-ratio.ts` | `currentMonth`, `collectionPct` | **old meaning** (it prints the ratio's numerator) |
| `scripts/june-income-bases.ts` | `currentMonth` | **old meaning** (June 2026 analysis; «HAQIQIY iyun (eski qarzsiz)» = cash minus old debt) |
| `client/…/income-attribution-panel.tsx`, `profit-composition-panel.tsx` | parts | deleted in Task 7 |

- [ ] **Step 1: Write the failing attribution tests**

In `server/src/reports/reports-financial.service.spec.ts`, inside `describe('getIncomeMonthAttribution', …)`:

1. Replace the whole first test («splits period income into real (current month) vs late…»); the two mocks are the same as before, the name and the assertions change:

```ts
    it('splits period income into this month, advance and late (prior months) FIFO, oldest-first', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10001 }]);
      // Effective ledger, chronological. Two prior-month debits, a May payment
      // that partially settles April OUT of the period (consumes silently), then
      // two June payments that get attributed.
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10001,
          type: 'LESSON_DEDUCTION',
          amount: -300000,
          branchId: null,
          createdAt: new Date('2026-04-10T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 100000, // May — out of period, settles 100k of April silently
          branchId: null,
          createdAt: new Date('2026-05-05T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'LESSON_DEDUCTION',
          amount: -200000,
          branchId: null,
          createdAt: new Date('2026-05-10T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 700000, // June — clears April(200k)+May(200k), 300k ahead
          branchId: null,
          createdAt: new Date('2026-06-15T00:00:00Z'),
        },
        {
          studentId: 10001,
          type: 'PAYMENT',
          amount: 100000, // June — no outstanding debt → all of it ahead
          branchId: null,
          createdAt: new Date('2026-06-20T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.monthKey).toBe('2026-06');
      // Both June payments end with money left after the debt, and nothing in
      // June spends it, so it stands on the balance as advance.
      expect(result.currentMonth).toBe(0);
      expect(result.advance).toBe(400000); // 300k leftover + 100k fresh
      expect(result.advanceStudents).toBe(1);
      expect(result.lateTotal).toBe(400000);
      expect(result.late).toEqual([
        { monthKey: '2026-05', label: 'May 2026', amount: 200000 },
        { monthKey: '2026-04', label: 'Aprel 2026', amount: 200000 },
      ]);
      // Reconciles exactly with the two in-period PAYMENT amounts (700k + 100k).
      expect(result.total).toBe(800000);
      expect(result.total).toBe(
        result.currentMonth + result.advance + result.lateTotal,
      );
      expect(result.payerCount).toBe(1);
      expect(result.paymentCount).toBe(2);
      expect(result.latePaymentCount).toBe(1);
      expect(result.lateStudentCount).toBe(1);
    });
```

2. «returns an empty breakdown when nobody paid in the period»: add `expect(result.advance).toBe(0);` and `expect(result.paymentCount).toBe(0);`.
3. «only tallies payments from the requested branch…»: replace `expect(result.currentMonth).toBe(100000);` with `expect(result.currentMonth).toBe(0);` and `expect(result.advance).toBe(100000);` (the 100k left after May's debt stands as advance).
4. «treats an on-time PREPAID payment as current income…»: add `expect(result.advance).toBe(0); // the June deduction spends it inside June` after the `currentMonth` assertion.
5. «does not fabricate "late" from a BALANCE_WITHDRAWAL…»: replace `expect(result.currentMonth).toBe(500000);` with

```ts
      // The withdrawal spends 200k of the June payment inside June — that part
      // is June's; the rest stands as advance. Never "late".
      expect(result.currentMonth).toBe(200000);
      expect(result.advance).toBe(300000);
```

6. «divides the period's OWN income by the value of lessons held in it»: replace `expect(result.currentMonth).toBe(150000);` with `expect(result.currentMonth + result.advance).toBe(150000);` (keep `collectionPct` 50: its numerator is `currentMonth + advance`).
7. «excludes old-debt settlement from the ratio»: add `expect(result.advance).toBe(0);`.
8. Add these tests before the closing `});` of the describe:

```ts
    it("overpay, then next month's charge after the period end: it stays advance", async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10011 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10011,
          type: 'LESSON_DEDUCTION',
          amount: -450000, // June's charge
          branchId: null,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          studentId: 10011,
          type: 'PAYMENT',
          amount: 900000, // June: the charge and July ahead
          branchId: null,
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
        {
          studentId: 10011,
          type: 'LESSON_DEDUCTION',
          amount: -450000, // July's charge on the 1st — after June's end
          branchId: null,
          createdAt: new Date('2026-07-01T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.currentMonth).toBe(450000);
      expect(result.advance).toBe(450000);
      expect(result.advanceStudents).toBe(1);
      expect(result.total).toBe(900000);
    });

    it('overpay, then a charge inside the period (a mid-month join): that part moves to the month', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10012 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10012,
          type: 'PAYMENT',
          amount: 600000, // paid before joining
          branchId: null,
          createdAt: new Date('2026-06-03T00:00:00Z'),
        },
        {
          studentId: 10012,
          type: 'LESSON_DEDUCTION',
          amount: -400000, // joined on the 15th: the rest of June
          branchId: null,
          createdAt: new Date('2026-06-15T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.currentMonth).toBe(400000);
      expect(result.advance).toBe(200000);
      expect(result.total).toBe(600000);
    });

    it('an older out-of-scope balance (initial balance, earlier payment, adjustment) is spent before the advance', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10013 }]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10013,
          type: 'INITIAL_BALANCE',
          amount: 50000,
          branchId: null,
          createdAt: new Date('2026-04-01T00:00:00Z'),
        },
        {
          studentId: 10013,
          type: 'PAYMENT',
          amount: 50000, // May — before the period, not tallied
          branchId: null,
          createdAt: new Date('2026-05-20T00:00:00Z'),
        },
        {
          studentId: 10013,
          type: 'ADJUSTMENT',
          amount: 50000, // in the period, but not a payment
          branchId: null,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
        {
          studentId: 10013,
          type: 'PAYMENT',
          amount: 450000, // tallied: all of it stands as advance first
          branchId: null,
          createdAt: new Date('2026-06-04T00:00:00Z'),
        },
        {
          studentId: 10013,
          type: 'LESSON_DEDUCTION',
          amount: -450000, // spends the 150k of older credit first
          branchId: null,
          createdAt: new Date('2026-06-10T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.currentMonth).toBe(300000);
      expect(result.advance).toBe(150000);
      expect(result.lateTotal).toBe(0);
      expect(result.total).toBe(450000);
    });

    it('leaves a reversed payment and its counter-row out of the replay', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([{ studentId: 10014 }]);
      // The whole ledger, reversal pair included; the mock answers the way the
      // database does, by the query's own two reversal filters. Without them
      // the counter-row would read as a June debit spending the reversed
      // payment's "advance", and the total would be 800k.
      const ledger = [
        {
          studentId: 10014,
          type: 'PAYMENT',
          amount: 500000,
          branchId: null,
          createdAt: new Date('2026-06-03T05:00:00Z'),
          reversedAt: new Date('2026-06-03T06:00:00Z'),
          reversedTransactionId: null,
        },
        {
          studentId: 10014,
          type: 'PAYMENT',
          amount: -500000, // the reversal's counter-row
          branchId: null,
          createdAt: new Date('2026-06-03T06:00:00Z'),
          reversedAt: null,
          reversedTransactionId: 'tx-reversed',
        },
        {
          studentId: 10014,
          type: 'PAYMENT',
          amount: 300000,
          branchId: null,
          createdAt: new Date('2026-06-06T05:00:00Z'),
          reversedAt: null,
          reversedTransactionId: null,
        },
        {
          studentId: 10014,
          type: 'LESSON_DEDUCTION',
          amount: -300000,
          branchId: null,
          createdAt: new Date('2026-06-10T05:00:00Z'),
          reversedAt: null,
          reversedTransactionId: null,
        },
      ];
      prisma.transaction.findMany.mockImplementationOnce(({ where }: any) =>
        Promise.resolve(
          ledger.filter(
            (r) =>
              (where.reversedAt !== null || r.reversedAt === null) &&
              (where.reversedTransactionId !== null ||
                r.reversedTransactionId === null),
          ),
        ),
      );

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.total).toBe(300000);
      expect(result.currentMonth).toBe(300000);
      expect(result.advance).toBe(0);
      expect(result.paymentCount).toBe(1);
    });

    it('total equals the tallied payments, and the counts follow the parts', async () => {
      prisma.payment.groupBy.mockResolvedValueOnce([
        { studentId: 10021 },
        { studentId: 10022 },
      ]);
      prisma.transaction.findMany.mockResolvedValueOnce([
        {
          studentId: 10021,
          type: 'LESSON_DEDUCTION',
          amount: -450000, // May — old debt
          branchId: null,
          createdAt: new Date('2026-05-12T00:00:00Z'),
        },
        {
          studentId: 10021,
          type: 'LESSON_DEDUCTION',
          amount: -450000, // June's charge
          branchId: null,
          createdAt: new Date('2026-06-01T00:00:00Z'),
        },
        {
          studentId: 10022,
          type: 'PAYMENT',
          amount: 200000,
          branchId: null,
          createdAt: new Date('2026-06-02T00:00:00Z'),
        },
        {
          studentId: 10021,
          type: 'PAYMENT',
          amount: 1200000, // May 450k late, June 450k, 300k ahead
          branchId: null,
          createdAt: new Date('2026-06-05T00:00:00Z'),
        },
        {
          studentId: 10022,
          type: 'LESSON_DEDUCTION',
          amount: -150000, // spends 150k of the 200k inside June
          branchId: null,
          createdAt: new Date('2026-06-20T00:00:00Z'),
        },
      ]);

      const result = await service.getIncomeMonthAttribution(1, period);

      expect(result.lateTotal).toBe(450000);
      expect(result.currentMonth).toBe(600000);
      expect(result.advance).toBe(350000);
      expect(result.total).toBe(1200000 + 200000);
      expect(result.total).toBe(
        result.currentMonth + result.advance + result.lateTotal,
      );
      expect(result.payerCount).toBe(2);
      expect(result.paymentCount).toBe(2);
      expect(result.latePaymentCount).toBe(1);
      expect(result.lateStudentCount).toBe(1);
      expect(result.advanceStudents).toBe(2);
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts -t getIncomeMonthAttribution`
Expected: FAIL — `advance`, `paymentCount`, … are `undefined`; the updated tests see the old `currentMonth`.

- [ ] **Step 3: Rewrite `getIncomeMonthAttribution`**

In `server/src/reports/reports-financial.service.ts`, replace the doc comment and the method (from `  /**\n   * Income composition for a period:` down to the method's closing `  }` just before `  /**\n   * Monthly trend data for the last 6 months`) with:

```ts
  /**
   * Income composition for a period: how the cash received in [start, end]
   * splits into money for the period's OWN month(s), money paid AHEAD for the
   * next month, and LATE payments that settled debt carried in from earlier
   * months — broken down by WHICH earlier month (ADR-0067). It is the
   * «Qayerdan keldi» dialog on /payments/overview and the income lines of the
   * 21:00 report and «💰 Moliyaviy xulosa».
   *
   * Definition (balance/debt-based FIFO, chosen by the CEO): a payment is
   * "late" only to the extent it reduced a NEGATIVE student balance at the
   * instant it landed. The debt it cleared is aged OLDEST-FIRST across the
   * months in which those debit rows actually hit the balance (their
   * `createdAt` Tashkent month). Whatever a tallied payment does beyond
   * clearing a pre-period debt is the period's own money, in one of two parts:
   *  - `currentMonth` — it settled a charge of the period: a debt of the
   *    period's months, or, standing on the balance, a debit dated INSIDE the
   *    period spent it (a mid-month join);
   *  - `advance` — it still stands on the balance at the period end, or a
   *    debit AFTER the period end spent it (the next month's charge on the
   *    1st, when a closed month is viewed later).
   *
   * Reconstructed from the append-only ledger by replaying each payer's
   * EFFECTIVE ledger: rows still in force (`reversedAt IS NULL AND
   * reversedTransactionId IS NULL`). A reversed row and its reversal net to
   * zero, so dropping both keeps the running balance exactly equal to
   * `Student.balance` (same invariant `getReconciliation` relies on). Two FIFO
   * queues per student: unsettled debit fragments, each tagged by its Tashkent
   * month, and standing credit fragments, each marked in scope or not (in
   * scope = the leftover of a COMPLETED PAYMENT inside the period and branch).
   * A credit consumes the debt queue oldest first; a debit consumes the credit
   * queue oldest first — so an older out-of-scope credit (an earlier payment,
   * an adjustment, an initial balance) is spent before this period's advance.
   * A tallied payment's FULL amount lands in exactly one of the three parts,
   * and moving advance into `currentMonth` keeps the sum, so `total =
   * currentMonth + advance + lateTotal` is exactly the period's tallied
   * payments (the Tushumlar figure).
   *
   * Debt aging is company-wide (a student's balance isn't cleanly
   * branch-scoped, same stance as `getMonthlyDebtRecovery`), but the TALLIED
   * payments honor `branchId` so the total still reconciles with a
   * branch-filtered card in the common (single-branch-per-student) case.
   */
  async getIncomeMonthAttribution(
    companyId: number,
    query: {
      branchIds: ReportBranchIds;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    period: { start: string; end: string };
    monthKey: string;
    currentLabel: string;
    total: number;
    /** Paid for the period's own month(s). */
    currentMonth: number;
    /** Paid ahead: in-scope credit standing at the period end, or spent after it. */
    advance: number;
    /** Students holding some of `advance` at the period end. */
    advanceStudents: number;
    lateTotal: number;
    late: Array<{ monthKey: string; label: string; amount: number }>;
    payerCount: number;
    /** Tallied payments: ledger PAYMENT rows inside the period and branch. */
    paymentCount: number;
    /** Tallied payments that settled some old debt. */
    latePaymentCount: number;
    /** Students with such a payment. */
    lateStudentCount: number;
    lessonsValue: number;
    collectionPct: number | null;
  }> {
    // Normalised once: the in-memory attribution leg below compares against it
    // directly, and `undefined` there would silently reject every credit.
    const branchIds = query.branchIds ?? null;
    const period = resolvePeriod(query.startDate, query.endDate);
    const boundaryKey = tashkentMonthKey(period.start);
    const startMs = period.start.getTime();
    const endMs = period.endTs.getTime();

    // The "current" bucket spans every month INSIDE the selected range (late is
    // strictly the months BEFORE it). Label single-month ranges "Iyun 2026" and
    // multi-month ranges ("Bu yil", "Oxirgi 3 oy") "Yanvar 2026 – Iyun 2026" so
    // the panel never calls a whole-year bucket "shu oy". Use the midnight end
    // date (not endTs) so a month-last-day + Tashkent offset doesn't roll over.
    const endMonthKey = tashkentMonthKey(new Date(period.endStr));
    const currentLabel =
      endMonthKey === boundaryKey
        ? monthLabel(boundaryKey)
        : `${monthLabel(boundaryKey)} – ${monthLabel(endMonthKey)}`;

    // The collection denominator: what the period's OWN lessons were worth.
    // `Attendance.date` is `@db.Date`, so the upper bound must be an unshifted
    // UTC date and EXCLUSIVE — the H3 boundary rule (a `lte` end-of-day
    // timestamp truncates back onto the last day and counts it twice).
    const lessonsValue = await this.getRecognizedRevenue(companyId, {
      start: period.start,
      end: new Date(period.endDate.getTime() + 86_400_000),
      branchIds,
    });
    const empty = {
      period: { start: period.startStr, end: period.endStr },
      monthKey: boundaryKey,
      currentLabel,
      total: 0,
      currentMonth: 0,
      advance: 0,
      advanceStudents: 0,
      lateTotal: 0,
      late: [] as Array<{ monthKey: string; label: string; amount: number }>,
      payerCount: 0,
      paymentCount: 0,
      latePaymentCount: 0,
      lateStudentCount: 0,
      lessonsValue,
      collectionPct: lessonsValue > 0 ? 0 : null,
    };

    // Only students who received a COMPLETED payment in the period+branch need
    // their ledger replayed — everyone else contributes nothing to this window.
    const periodPayers = await this.prisma.payment.groupBy({
      by: ['studentId'],
      where: {
        companyId,
        status: 'COMPLETED',
        createdAt: { gte: period.start, lte: period.endTs },
        ...branchIdWhere(branchIds),
      },
    });
    const payerIds = periodPayers
      .map((p) => p.studentId)
      .filter((id): id is number => id != null);
    if (payerIds.length === 0) return empty;

    // Effective ledger for every payer, chronological. Reversed originals AND
    // their reversal rows are both excluded so the replay balance stays equal
    // to Student.balance. `id` is only a same-timestamp tiebreak.
    const rows = await this.prisma.transaction.findMany({
      where: {
        companyId,
        studentId: { in: payerIds },
        reversedAt: null,
        reversedTransactionId: null,
      },
      select: {
        studentId: true,
        type: true,
        amount: true,
        branchId: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    // Bucket per student, preserving the chronological order above.
    const byStudent = new Map<number, typeof rows>();
    for (const r of rows) {
      if (r.studentId == null) continue;
      const list = byStudent.get(r.studentId);
      if (list) list.push(r);
      else byStudent.set(r.studentId, [r]);
    }

    const lateByMonth = new Map<string, number>();
    let currentMonth = 0;
    let advance = 0;
    let advanceStudents = 0;
    let paymentCount = 0;
    let latePaymentCount = 0;
    const lateStudents = new Set<number>();

    for (const [studentId, list] of byStudent) {
      // Running ledger state per student:
      //  • `debts` — FIFO fragments of OUTSTANDING debt (oldest at `debtHead`).
      //  • `credits` — FIFO fragments of the standing POSITIVE balance (oldest
      //    at `creditHead`); `inScope` marks a tallied payment's leftover.
      // Invariant after each row: standing credit ⟹ no outstanding debt, and
      // the debt fragments sum to max(0, -runningBalance). A debit the standing
      // balance covers never becomes a phantom obligation, so an on-time
      // prepaid payment (pay up front, the deduction follows) is never "late".
      const debts: Array<{ monthKey: string; remaining: number }> = [];
      let debtHead = 0;
      const credits: Array<{ amount: number; inScope: boolean }> = [];
      let creditHead = 0;
      let studentAdvance = 0;

      for (const r of list) {
        if (r.amount === 0) continue; // LESSON_CONSUMPTION — no balance movement.
        const ts = r.createdAt.getTime();
        const inPeriod = ts >= startMs && ts <= endMs;

        if (r.amount < 0) {
          // A debit spends the standing balance oldest first; only the
          // uncovered remainder becomes an obligation tagged by its month.
          let debit = -r.amount;
          while (debit > 0 && creditHead < credits.length) {
            const frag = credits[creditHead];
            const taken = Math.min(debit, frag.amount);
            frag.amount -= taken;
            debit -= taken;
            // This period's advance spent on a debit of the period paid the
            // period (a mid-month join). Spent after the period end it paid
            // the next month, and it stays advance.
            if (frag.inScope && inPeriod) {
              studentAdvance -= taken;
              currentMonth += taken;
            }
            if (frag.amount === 0) creditHead++;
          }
          if (debit > 0) {
            debts.push({
              monthKey: tashkentMonthKey(r.createdAt),
              remaining: debit,
            });
          }
          continue;
        }

        // A credit settles the oldest outstanding obligations first. Only an
        // in-period, in-branch COMPLETED PAYMENT is tallied; every other credit
        // (out-of-period payment, positive adjustment, initial balance) still
        // consumes the queue so the debt aging stays correct.
        let credit = r.amount;
        const attribute =
          r.type === 'PAYMENT' &&
          inPeriod &&
          // In-memory leg of the same scope: a credit from ANOTHER branch still
          // ages this student's debt, but is not this branch's income.
          (branchIds === null ||
            (r.branchId != null && branchIds.includes(r.branchId)));
        let settledOldDebt = false;

        while (credit > 0 && debtHead < debts.length) {
          const frag = debts[debtHead];
          const taken = Math.min(credit, frag.remaining);
          frag.remaining -= taken;
          credit -= taken;
          if (attribute) {
            if (frag.monthKey < boundaryKey) {
              lateByMonth.set(
                frag.monthKey,
                (lateByMonth.get(frag.monthKey) ?? 0) + taken,
              );
              settledOldDebt = true;
            } else {
              currentMonth += taken;
            }
          }
          if (frag.remaining === 0) debtHead++;
        }
        if (attribute) {
          paymentCount++;
          if (settledOldDebt) {
            latePaymentCount++;
            lateStudents.add(studentId);
          }
        }
        // Leftover credit beyond all outstanding debt stands on the balance and
        // absorbs FUTURE debits (else next month's deduction would look like a
        // phantom debt the following payment settles "late"). A tallied
        // payment's leftover is advance until a debit of the period spends it.
        if (credit > 0) {
          if (attribute) studentAdvance += credit;
          credits.push({ amount: credit, inScope: attribute });
        }
      }
      advance += studentAdvance;
      if (studentAdvance > 0) advanceStudents++;
    }

    const late = Array.from(lateByMonth.entries())
      .map(([monthKey, amount]) => ({
        monthKey,
        label: monthLabel(monthKey),
        amount,
      }))
      // Most recent prior month first (e.g. May before April before March).
      .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
    const lateTotal = late.reduce((s, m) => s + m.amount, 0);

    return {
      period: { start: period.startStr, end: period.endStr },
      monthKey: boundaryKey,
      currentLabel,
      total: currentMonth + advance + lateTotal,
      currentMonth,
      advance,
      advanceStudents,
      lateTotal,
      late,
      payerCount: payerIds.length,
      paymentCount,
      latePaymentCount,
      lateStudentCount: lateStudents.size,
      lessonsValue,
      // "N% yig'ildi" with a MEANING: of the lessons actually HELD in this
      // window, how much did the period's OWN cash cover? Both sides belong to
      // the same window — old-debt settlement is excluded from the numerator
      // (it is income for the month it was billed in) and future months
      // contribute no lessons to the denominator. The numerator is the
      // period's own cash WITH the advance — exactly what `currentMonth` was
      // before the advance got its own part (ADR-0067), so the ratio keeps
      // its meaning.
      //
      // It CAN legitimately exceed 100%: a cycle prepaid in full is this
      // period's income against lessons that will be held next month. That is a
      // real signal (prepayment), not the old artefact where the denominator
      // was simply 11% too small every month.
      collectionPct:
        lessonsValue > 0
          ? Math.round(((currentMonth + advance) / lessonsValue) * 100)
          : null,
    };
  }
```

- [ ] **Step 4: Run the attribution tests**

Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts -t getIncomeMonthAttribution`
Expected: PASS.

- [ ] **Step 5: Write the failing reader tests (old meaning)**

1. `server/src/reports/reports.service.spec.ts`, `describe('getOwnMonthProfit')`: in «combines attribution + net profit…», change the attribution mock to `{ total: 170_378_987, currentMonth: 100_000_000, advance: 42_064_938, lateTotal: 28_314_049, late: [] }` and keep `expect(out.ownMoney).toBe(142_064_938);` and `expect(out.ownMonthProfit).toBe(4_257_391);` — the month's own money still includes the advance. In «passes the month-end date bounds…», add `advance: 0,` to its mock.
2. `server/src/reports/reports-excel.service.spec.ts`: in `const attribution = {…}`, replace `currentMonth: 700_000,` with `currentMonth: 500_000,` and `advance: 200_000,` (the «Xulosa» figures built from 700 000 must not move).
3. `server/src/telegram-groups/daily-snapshot.service.spec.ts`: the `getIncomeMonthAttribution` mock becomes `.mockResolvedValue({ currentMonth: 4, advance: 2, lessonsValue: 13 })`; keep `expect(data.collectedForMonth).toBe(6);` (the stored component keeps its meaning).
4. `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`:
   - in «prints the shared collection ratio and the month-end expectation» (July), change the mock to `currentMonth: 100_000_000,` + `advance: 42_000_000,` (keep `total: 142_000_000`) and keep every assertion — «Shundan yig'ildi: 142 000 000» and «Oy rejasidan yig'ildi: 91%» now prove `currentMonth + advance`;
   - add `advance: 0,` after `currentMonth: 31_200_000,` in `fullAttribution()` and after `currentMonth: 142_000_000,` in `reportsMock()` (October describe);
   - replace «adds the split up to the printed income figure» with a version that has an advance:

```ts
  it('adds the split up to the printed income figure', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ currentMonth: 21_200_000, advance: 10_000_000 }),
        ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/ /g, ' ');
    const money = (label: string) =>
      Number(
        message
          .match(new RegExp(`${label}: <b>([\\d ]+) so'm</b>`))![1]
          .replace(/ /g, ''),
      );
    // Only the indented month rows — anchored, because the debt line elsewhere
    // in the report is also "… — <b>N so'm</b>" and would be swept in.
    const monthSum = [
      ...message.matchAll(/^ {6}.+ — <b>([\d ]+) so'm<\/b>$/gm),
    ].reduce((sum, m) => sum + Number(m[1].replace(/ /g, '')), 0);

    expect(
      money('Shu oy uchun') +
        money('Oldindan \\(keyingi oy uchun\\)') +
        monthSum,
    ).toBe(money('Tushum \\(haqiqiy\\)'));
  });

  it('prints the advance between this month and old debt, the three shares summing to 100', async () => {
    const state = defaultState();
    const service = await buildService(makePrisma(state), makeSalary(state), {
      getMonthlyNetProfit: jest.fn().mockResolvedValue({ netProfit: 1 }),
      getIncomeMonthAttribution: jest
        .fn()
        .mockResolvedValue(
          fullAttribution({ currentMonth: 21_200_000, advance: 10_000_000 }),
        ),
      getMonthlyExpectation: jest.fn().mockResolvedValue({ expectedValue: 1 }),
    });

    const { message: raw } = await service.build(1001, null);
    const message = raw.replace(/ /g, ' ');

    expect(message).toContain(
      [
        "• Tushum (haqiqiy): <b>42 500 000 so'm</b>",
        "   Shu oy uchun: <b>21 200 000 so'm</b> (50%)",
        "   Oldindan (keyingi oy uchun): <b>10 000 000 so'm</b> (23%)",
        "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      ].join('\n'),
    );
  });
```

5. `server/src/telegram-groups/telegram-group-report-menu.service.spec.ts`, «sendFinancialCard shows which months the cash belongs to»: the mock becomes `{ total: 280_000_000, currentMonth: 180_000_000, advance: 30_000_000, lateTotal: 70_000_000, late: [ …unchanged… ], lessonsValue: 1, collectionPct: 1 }` and the three line assertions become:

```ts
    expect(text).toContain("   Shu oy uchun: <b>180 000 000 so'm</b> (64%)");
    expect(text).toContain(
      "   Oldindan (keyingi oy uchun): <b>30 000 000 so'm</b> (11%)",
    );
    expect(text).toContain(
      "   Eski qarzlar uchun: <b>70 000 000 so'm</b> (25%)",
    );
```

6. Replace the whole content of `server/src/telegram-groups/utils/income-split.util.spec.ts` with:

```ts
import { buildIncomeSplitLines, sharesOf100 } from './income-split.util';

/** `formatSum` groups digits with non-breaking spaces; read them as a human does. */
const NBSP = String.fromCharCode(160);
const plain = (lines: string[]) => lines.map((l) => l.split(NBSP).join(' '));

describe('buildIncomeSplitLines', () => {
  it('splits the income into this-month vs old-debt, oldest months listed too', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 31_200_000,
        advance: 0,
        lateTotal: 11_300_000,
        late: [
          { label: 'Avgust 2026', amount: 7_900_000 },
          { label: 'Iyul 2026', amount: 2_600_000 },
          { label: 'Iyun 2026', amount: 800_000 },
        ],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>31 200 000 so'm</b> (73%)",
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      "      Avgust 2026 — <b>7 900 000 so'm</b>",
      "      Iyul 2026 — <b>2 600 000 so'm</b>",
      "      Iyun 2026 — <b>800 000 so'm</b>",
    ]);
  });

  it('prints an old-debt total the month rows below it add up to', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 10_000_000,
        currentMonth: 4_000_000,
        advance: 0,
        lateTotal: 6_000_000,
        late: [
          { label: 'Iyul 2026', amount: 4_500_000 },
          { label: 'Iyun 2026', amount: 1_500_000 },
        ],
      }),
    );
    const sum = lines
      .slice(2)
      .map((l) =>
        Number(l.match(/<b>([\d ]+) so'm<\/b>/)![1].replace(/ /g, '')),
      )
      .reduce((a, b) => a + b, 0);

    expect(lines[1]).toContain("6 000 000 so'm");
    expect(sum).toBe(6_000_000);
  });

  it('keeps the two percentages at exactly 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 3,
        currentMonth: 1,
        advance: 0,
        lateTotal: 2,
        late: [{ label: 'Iyul 2026', amount: 2 }],
      }),
    );
    expect(lines[0]).toContain('(33%)');
    expect(lines[1]).toContain('(67%)');
  });

  it('prints the advance between this month and old debt, the three shares summing to 100', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 42_500_000,
        currentMonth: 21_200_000,
        advance: 10_000_000,
        lateTotal: 11_300_000,
        late: [
          { label: 'Avgust 2026', amount: 7_900_000 },
          { label: 'Iyul 2026', amount: 3_400_000 },
        ],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>21 200 000 so'm</b> (50%)",
      "   Oldindan (keyingi oy uchun): <b>10 000 000 so'm</b> (23%)",
      "   Eski qarzlar uchun: <b>11 300 000 so'm</b> (27%)",
      "      Avgust 2026 — <b>7 900 000 so'm</b>",
      "      Iyul 2026 — <b>3 400 000 so'm</b>",
    ]);
  });

  it('leaves out a part that is 0', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 6_000_000,
        currentMonth: 0,
        advance: 5_000_000,
        lateTotal: 1_000_000,
        late: [{ label: 'Avgust 2026', amount: 1_000_000 }],
      }),
    );

    expect(lines).toEqual([
      "   Oldindan (keyingi oy uchun): <b>5 000 000 so'm</b> (83%)",
      "   Eski qarzlar uchun: <b>1 000 000 so'm</b> (17%)",
      "      Avgust 2026 — <b>1 000 000 so'm</b>",
    ]);
  });

  it('an advance with no old debt is two lines, not «Hammasi shu oy uchun»', () => {
    const lines = plain(
      buildIncomeSplitLines({
        total: 5_000_000,
        currentMonth: 4_000_000,
        advance: 1_000_000,
        lateTotal: 0,
        late: [],
      }),
    );

    expect(lines).toEqual([
      "   Shu oy uchun: <b>4 000 000 so'm</b> (80%)",
      "   Oldindan (keyingi oy uchun): <b>1 000 000 so'm</b> (20%)",
    ]);
  });

  it('says so in one line when there is neither advance nor old debt', () => {
    const lines = buildIncomeSplitLines({
      total: 5_000_000,
      currentMonth: 5_000_000,
      advance: 0,
      lateTotal: 0,
      late: [],
    });
    expect(lines).toEqual([
      "   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q",
    ]);
  });

  it('prints nothing when there is no income to split', () => {
    expect(
      buildIncomeSplitLines({
        total: 0,
        currentMonth: 0,
        advance: 0,
        lateTotal: 0,
        late: [],
      }),
    ).toEqual([]);
  });
});

describe('sharesOf100', () => {
  it('gives whole shares that always add up to 100', () => {
    expect(sharesOf100([1, 1, 1])).toEqual([34, 33, 33]);
    expect(sharesOf100([21_200_000, 10_000_000, 11_300_000])).toEqual([
      50, 23, 27,
    ]);
  });

  it('gives a part that is 0 a share of 0', () => {
    expect(sharesOf100([0, 5, 0])).toEqual([0, 100, 0]);
  });

  it('is all zeros when there is nothing to share', () => {
    expect(sharesOf100([0, 0, 0])).toEqual([0, 0, 0]);
  });
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd server && npx jest src/reports/reports.service.spec.ts src/reports/reports-excel.service.spec.ts src/telegram-groups`
Expected: FAIL — `ownMoney` 100 000 000, `collectedForMonth` 4, «Shundan yig'ildi» 100 000 000, no «Oldindan» line, `sharesOf100` not exported.

- [ ] **Step 7: Implement the readers**

1. `server/src/reports/reports.service.ts`, in `getOwnMonthProfit`, replace the final `return { … }` with:

```ts
    // The month's own cash in its old meaning (ADR-0067): money paid ahead for
    // the next month was part of `currentMonth` when this figure was defined,
    // and the Excel «Xulosa» sheet still reads it that way.
    const ownMoney = attribution.currentMonth + attribution.advance;
    return {
      month,
      ownMoney,
      cashTotal: attribution.total,
      netProfit,
      ownMonthProfit: computeOwnMonthProfit(ownMoney, netProfit),
    };
```

2. `server/src/reports/own-month-profit.ts`: in the doc comment, replace `` from `getIncomeMonthAttribution().currentMonth` — only the cash that landed `` with `` from `getIncomeMonthAttribution()`'s `currentMonth + advance` — only the cash that landed ``.
3. `server/src/reports/reports-excel.workbook-input.ts`, in `buildSummaryInput`: before `const lessonMoney = {`, add

```ts
  // The month's own cash in its old meaning (ADR-0067): `currentMonth +
  // advance`. Block 3 must still foot to the cash-in and the lesson-money
  // block to the month's value; the Excel workbook is not part of B1.
  const paidInMonth =
    s.attributionCur.currentMonth + s.attributionCur.advance;
```

then use `paidInMonth,` for `lessonMoney.paidInMonth`, `s.recognizedRevenue - paidInMonth - paidNextMonth` for `paidEarlier`, and `currentMonth: paidInMonth,` inside `attribution: { … }`.
4. `server/src/telegram-groups/daily-snapshot.service.ts`: replace `collectedForMonth: attribution.currentMonth,` with

```ts
      // The month's own cash with the advance — the meaning this column was
      // written with before the advance got its own part (ADR-0067). This
      // record cannot be rebuilt, so its meaning must not move.
      collectedForMonth: attribution.currentMonth + attribution.advance,
```

5. Replace the whole content of `server/src/telegram-groups/utils/income-split.util.ts` with:

```ts
import { formatSum } from './format.util';

export interface IncomeSplitInput {
  /** The period's whole cash-in — `currentMonth + advance + lateTotal` by construction. */
  total: number;
  /** Paid for the period's OWN month(s). */
  currentMonth: number;
  /** Paid ahead for the next month: still on the balance at the period end. */
  advance: number;
  /** Paid against debt carried in from earlier months. */
  lateTotal: number;
  /** Which earlier months that debt belonged to, most recent first. */
  late: Array<{ label: string; amount: number }>;
}

/**
 * Whole-number shares of `amounts` that add up to exactly 100 (largest
 * remainder). Rounding each share on its own can print 33% + 33% + 33% under a
 * figure that claims they are all of it. A part that is 0 always gets 0.
 */
export function sharesOf100(amounts: readonly number[]): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!(total > 0)) return amounts.map(() => 0);
  const raw = amounts.map((a) => (a / total) * 100);
  const shares = raw.map((r) => Math.floor(r));
  let left = 100 - shares.reduce((s, p) => s + p, 0);
  const byRest = raw
    .map((r, i) => ({ i, rest: r - Math.floor(r) }))
    .sort((a, b) => b.rest - a.rest);
  for (const { i } of byRest) {
    if (left <= 0) break;
    shares[i] += 1;
    left -= 1;
  }
  return shares;
}

/**
 * The «Tushum tarkibi» lines printed under an income figure — the same split
 * the /payments/overview «Qayerdan keldi» dialog shows, rendered for Telegram:
 * «Shu oy uchun», «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», then one
 * row per earlier month (ADR-0067). A part that is 0 is left out.
 *
 * Lives here rather than in either caller because BOTH money surfaces (the
 * 21:00 daily report and the «Moliyaviy xulosa» card) print it; two copies of
 * the wording is how the two surfaces start disagreeing.
 *
 * The caller must pass the figures from ONE `getIncomeMonthAttribution` result
 * and print them under the `total` of that same result — these lines are a
 * decomposition of that number, so a headline taken from anywhere else can
 * fail to add up in front of the reader.
 */
export function buildIncomeSplitLines(split: IncomeSplitInput): string[] {
  // Nothing came in (a holiday, or the 1st before the first payment): a
  // "0 so'm (0%)" pair states nothing and divides by zero to say it.
  if (!(split.total > 0)) return [];
  const hasLate = split.lateTotal > 0 && split.late.length > 0;
  if (split.advance <= 0 && !hasLate) {
    return ["   Hammasi shu oy uchun — eski qarz uchun to'lov yo'q"];
  }
  const [currentPct, advancePct, latePct] = sharesOf100([
    split.currentMonth,
    split.advance,
    split.lateTotal,
  ]);
  const lines: string[] = [];
  if (split.currentMonth > 0) {
    lines.push(
      `   Shu oy uchun: <b>${formatSum(split.currentMonth)}</b> (${currentPct}%)`,
    );
  }
  if (split.advance > 0) {
    lines.push(
      `   Oldindan (keyingi oy uchun): <b>${formatSum(split.advance)}</b> (${advancePct}%)`,
    );
  }
  if (hasLate) {
    lines.push(
      `   Eski qarzlar uchun: <b>${formatSum(split.lateTotal)}</b> (${latePct}%)`,
    );
    for (const m of split.late) {
      lines.push(`      ${m.label} — <b>${formatSum(m.amount)}</b>`);
    }
  }
  return lines;
}
```

6. `server/src/telegram-groups/telegram-group-daily-report.service.ts`:
   - in the file's top comment, replace `` `getIncomeMonthAttribution` so the two lines under it («Shu oy uchun» and `` / `` «Eski qarzlar uchun», per month) decompose the figure printed above them. `` with `` `getIncomeMonthAttribution` so the lines under it («Shu oy uchun», `` / `` «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», per month) decompose `` / `` the figure printed above them (ADR-0067). `` (re-wrap the comment lines);
   - in `computeIncomeAttribution`, add `advance: number;` to the return type after `currentMonth: number;`, and return `currentMonth: attribution.currentMonth,` followed by `advance: attribution.advance,`;
   - the «Shundan yig'ildi» line becomes `` `• Shundan yig'ildi: <b>${formatSum(attribution.currentMonth + attribution.advance)}</b> (<b>${attribution.pct}%</b>)` ``;
   - the month-plan percentage becomes `Math.round(((attribution.currentMonth + attribution.advance) / expectedValue) * 100)`; above both, add the comment `// The month's own cash in its old meaning, advance included (ADR-0067).`
7. `server/src/telegram-groups/telegram-group-report-menu.service.ts`, `incomeSplit`: add `advance: number;` to the return type after `currentMonth: number;`, return `advance: a.advance,` after `currentMonth: a.currentMonth,`, and in its doc comment replace `how much of the cash is this month's own income and how much settled older months' debt, per month` with `how much of the cash is this month's own income, how much was paid ahead for the next month and how much settled older months' debt, per month`.
8. `server/scripts/verify-collection-ratio.ts` line 65: `` console.log(`  shu davr uchun         : ${fmt(r.currentMonth + r.advance)}`); ``.
9. `server/scripts/june-income-bases.ts`: in the three lines that read `attribution.currentMonth`, use `(attribution.currentMonth + attribution.advance)` instead (the June analysis was written with the advance inside «HAQIQIY iyun»).

- [ ] **Step 8: Run the specs, type-check, lint**

```bash
cd server && npx jest src/reports src/telegram-groups
cd server && npm run typecheck
cd server && npx prettier --write src/reports/reports-financial.service.ts src/reports/reports-financial.service.spec.ts src/reports/reports.service.ts src/reports/reports.service.spec.ts src/reports/own-month-profit.ts src/reports/reports-excel.workbook-input.ts src/reports/reports-excel.service.spec.ts src/telegram-groups/daily-snapshot.service.ts src/telegram-groups/daily-snapshot.service.spec.ts src/telegram-groups/utils/income-split.util.ts src/telegram-groups/utils/income-split.util.spec.ts src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts src/telegram-groups/telegram-group-report-menu.service.ts src/telegram-groups/telegram-group-report-menu.service.spec.ts scripts/verify-collection-ratio.ts scripts/june-income-bases.ts
cd server && npx eslint src/reports/reports-financial.service.ts src/reports/reports.service.ts src/reports/reports-excel.workbook-input.ts src/telegram-groups/daily-snapshot.service.ts src/telegram-groups/utils/income-split.util.ts src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-report-menu.service.ts
```
Expected: all PASS, no type or lint errors.

- [ ] **Step 9: Commit**

```bash
git add server/src/reports/reports-financial.service.ts server/src/reports/reports-financial.service.spec.ts server/src/reports/reports.service.ts server/src/reports/reports.service.spec.ts server/src/reports/own-month-profit.ts server/src/reports/reports-excel.workbook-input.ts server/src/reports/reports-excel.service.spec.ts server/src/telegram-groups/daily-snapshot.service.ts server/src/telegram-groups/daily-snapshot.service.spec.ts server/src/telegram-groups/utils/income-split.util.ts server/src/telegram-groups/utils/income-split.util.spec.ts server/src/telegram-groups/telegram-group-daily-report.service.ts server/src/telegram-groups/telegram-group-daily-report.service.spec.ts server/src/telegram-groups/telegram-group-report-menu.service.ts server/src/telegram-groups/telegram-group-report-menu.service.spec.ts server/scripts/verify-collection-ratio.ts server/scripts/june-income-bases.ts
git commit -m "feat(reports): split the advance out of this month's cash

getIncomeMonthAttribution keeps standing credit as a FIFO of fragments:
a debit inside the period moves the advance it spends into currentMonth,
a debit after the period end leaves it advance. total still equals the
tallied payments and collectionPct keeps its numerator. The Telegram
income lines print three parts summing to 100%; the own-month profit,
the Excel summary and the daily snapshot keep currentMonth + advance.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `financial-overview` is CEO/BD with staff salary and yesterday's cash; `financial-trend` takes a month

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts:25-31` (imports), `:120-366` (`getFinancialOverview`), `:780-948` (`getFinancialTrend`)
- Modify: `server/src/reports/reports-financial.service.spec.ts:62-279`
- Modify: `server/src/reports/reports.service.ts:552-593` (`getFinancialTrendCanonical`), `server/src/reports/reports.service.spec.ts:1396-1425`
- Modify: `server/src/reports/reports.controller.ts:14-46,159-177,218-357,362-376`
- Modify: `server/src/reports/reports.controller.spec.ts`
- Rename: `server/src/reports/dto/expectation-history-query.dto.ts` → `server/src/reports/dto/month-query.dto.ts`; `…/expectation-history-query.dto.spec.ts` → `…/month-query.dto.spec.ts`
- Modify: `server/src/reports/reports-branch-scope-coverage.spec.ts:155-163` (+ a new test)
- Modify: `server/CLAUDE.md` (the «`financial-overview` role split» and «Financial overview calculates» bullets)

**Interfaces:**
- Produces:
  - `export class MonthQueryDto { branchId?: number; month?: string }` (the renamed DTO).
  - Raw `getFinancialOverview(...)` returns `income.yesterday: { date: string; amount: number } | null` and no longer returns `ltv`, `ltvPayerCount`, `cac`, `marketingRoi`, `avgPayment`, `newStudentCount`, `marketingExpenses`.
  - `GET /reports/financial-overview` — `@Roles('CEO', 'Branch Director')`; `salary.computed: { month, hasLessonData, fullDeserved, netToPay, advances, staff: { monthly, advances, netToPay } } | null`; no `ownMonthProfit`.
  - `getFinancialTrend(companyId, branchIds, month?: string)` — rows `{ month, monthKey, income, expenses, profit }`, six months ending at `month` (clamped to now), none before `DEBT_FLOOR_MONTH`.
  - `ReportsService.getFinancialTrendCanonical(companyId, branchIds, performedById, month?: string)`.
  - `GET /reports/financial-trend?month=YYYY-MM&branchId=`.

- [ ] **Step 1: Write the failing service tests**

In `server/src/reports/reports-financial.service.spec.ts`:

1. Replace the test «still reads the active students' balance and the new-student count» with:

```ts
    it('reads the active students’ balance and no marketing, payer or new-student leg', async () => {
      const result: any = await service.getFinancialOverview(1, period);

      expect(prisma.student.aggregate).toHaveBeenCalledTimes(1);
      expect(prisma.student.count).not.toHaveBeenCalled();
      // Only the by-method breakdown groups payments now.
      expect(
        prisma.payment.groupBy.mock.calls.map(([a]: any) => a.by),
      ).toEqual([['method']]);
      expect(
        prisma.expense.aggregate.mock.calls.some(
          ([a]: any) => a.where.category === 'MARKETING',
        ),
      ).toBe(false);
      for (const gone of [
        'ltv',
        'ltvPayerCount',
        'cac',
        'marketingRoi',
        'avgPayment',
        'newStudentCount',
        'marketingExpenses',
      ]) {
        expect(result).not.toHaveProperty(gone);
      }
    });
```

2. Add after `describe('getFinancialOverview', …)`:

```ts
  describe('getFinancialOverview — yesterday', () => {
    afterEach(() => jest.useRealTimers());

    it("sums yesterday's Tashkent day while the period is the current month", async () => {
      // 15.10.2026 10:00 in Tashkent.
      jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:00:00Z'));
      const yesterdayStart = '2026-10-13T19:00:00.000Z';
      prisma.payment.aggregate.mockImplementation((args: any) =>
        Promise.resolve(
          args.where.createdAt.gte.toISOString() === yesterdayStart
            ? { _sum: { amount: 2_200_000 }, _count: 3 }
            : { _sum: { amount: 9_000_000 }, _count: 12 },
        ),
      );

      const r = await service.getFinancialOverview(1, {
        branchIds: [4],
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(r.income.yesterday).toEqual({
        date: '2026-10-14',
        amount: 2_200_000,
      });
      const [args] = prisma.payment.aggregate.mock.calls.find(
        ([a]: any) => a.where.createdAt.gte.toISOString() === yesterdayStart,
      );
      expect(args.where).toEqual({
        companyId: 1,
        status: 'COMPLETED',
        createdAt: {
          gte: new Date(yesterdayStart),
          lt: new Date('2026-10-14T19:00:00.000Z'),
        },
        branchId: { in: [4] },
      });
    });

    it('is null on the 1st — yesterday belongs to the month before', async () => {
      // 01.10.2026 01:30 in Tashkent; the UTC date is still 30.09.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00Z'));

      const r = await service.getFinancialOverview(1, {
        branchIds: null,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(r.income.yesterday).toBeNull();
      expect(prisma.payment.aggregate).toHaveBeenCalledTimes(1); // the month's cash only
    });

    it('is null for a past month', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:00:00Z'));

      const r = await service.getFinancialOverview(1, {
        branchIds: null,
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(r.income.yesterday).toBeNull();
    });
  });
```

3. Inside `describe('getFinancialTrend', …)` (system time 01.10.2026 01:30 Tashkent): in «bounds every timestamp leg by Tashkent midnights…», delete the two collectors `...prisma.payment.groupBy.mock.calls.map(…)` and `...prisma.student.count.mock.calls.map(…)` (those legs are gone; the income, payroll and settled-advance legs still cover all six windows, so the expected spans do not change). Then add:

```ts
    it('anchors the six months on the asked month and drops the ones before the reporting floor', async () => {
      const res = await service.getFinancialTrend(1, null, '2026-08');

      expect(res.map((r) => r.monthKey)).toEqual([
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
    });

    it('never runs past the current month', async () => {
      const res = await service.getFinancialTrend(1, null, '2027-03');

      expect(res).toHaveLength(6);
      expect(res[res.length - 1].monthKey).toBe('2026-10');
    });

    it('carries no marketing, average-payment or balance series any more', async () => {
      const res = await service.getFinancialTrend(1, null);

      for (const row of res) {
        for (const gone of [
          'ltv',
          'cac',
          'marketingRoi',
          'avgPayment',
          'activeBalance',
        ]) {
          expect(row).not.toHaveProperty(gone);
        }
      }
      expect(prisma.student.count).not.toHaveBeenCalled();
      expect(prisma.payment.groupBy).not.toHaveBeenCalled();
      expect(
        prisma.expense.aggregate.mock.calls.some(
          ([a]: any) => a.where.category === 'MARKETING',
        ),
      ).toBe(false);
    });
```

4. `server/src/reports/reports.service.spec.ts`, inside `describe('getFinancialTrendCanonical — cache key', …)`, add:

```ts
    it('hands the asked month to the raw trend', async () => {
      const trend = jest
        .spyOn((service as any).financial, 'getFinancialTrend')
        .mockResolvedValue([]);

      await service.getFinancialTrendCanonical(1001, null, 10001, '2026-08');

      expect(trend).toHaveBeenCalledWith(1001, null, '2026-08');
    });
```

5. `server/src/reports/reports-branch-scope-coverage.spec.ts`: rename the test «getFinancialTrend scopes the count legs, not just the money legs» to «getFinancialTrend scopes every leg» (replace its H17 comment with `// The count legs (H17) went with the marketing series; what is left must still be scoped.`), and add after «getFinancialOverview leaves every query UNfiltered…»:

```ts
  it("getFinancialOverview scopes yesterday's cash too", async () => {
    // 15.10.2026 10:00 in Tashkent: the period is the current month, so the
    // yesterday leg runs.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:00:00Z'));
    try {
      await service.getFinancialOverview(1, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        branchIds: [2],
      });
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.payment.aggregate).toHaveBeenCalledTimes(2);
    const unscoped = everyWhereClause().filter(
      (c) => !hasBranchPredicate(c.where),
    );
    expect(unscoped.map((c) => `${c.model}.${c.method}`)).toEqual([]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts src/reports/reports.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
Expected: FAIL — `income.yesterday` undefined, the trend ignores `month`, the removed fields and queries still there.

- [ ] **Step 3: Implement the service changes**

In `server/src/reports/reports-financial.service.ts`:

1. The `../common/date/tashkent` import becomes:

```ts
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentDayRangeUtc,
  tashkentMonthRangeUtc,
  tashkentRangeUtc,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
```

2. `getFinancialOverview`: the doc comment becomes `Financial overview: actual income (by method, and yesterday's in the current month), salary, expenses.` Delete everything from `    // Active LTV: period revenue / unique payers in that period.` through `    const newStudents = await this.prisma.student.count({ … });` and put in its place:

```ts
    // «kecha» on /payments/overview: yesterday's Tashkent day, only while the
    // period is the current month and yesterday belongs to it — on the 1st it
    // belongs to the month before, so there is none.
    const today = tashkentDateStr(now);
    const yesterdayStr = addDaysToDateStr(today, -1);
    const periodMonth = start.slice(0, 7);
    const yesterday =
      periodMonth === tashkentMonthKey(now) &&
      yesterdayStr.slice(0, 7) === periodMonth
        ? await this.prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: tashkentDayRangeUtc(yesterdayStr),
              ...branchFilter,
            },
            _sum: { amount: true },
          })
        : null;
```

Delete the three lines `const marketingTotal = …`, `const periodPayerTotal = …`, `const periodPayerCount = …`. In the returned object, `income` becomes:

```ts
      income: {
        actual: totalIncome,
        paymentCount: actualIncome._count,
        byMethod: incomeByMethod.map((m) => ({
          method: m.method,
          amount: m._sum.amount ?? 0,
          count: m._count,
        })),
        yesterday: yesterday
          ? { date: yesterdayStr, amount: yesterday._sum.amount ?? 0 }
          : null,
      },
```

and the lines from `ltv: Math.round(…),` through `marketingExpenses: marketingTotal,` are deleted (the object ends with `activeStudentCount: activeStudents._count,`).

3. Replace `getFinancialTrend` (its doc comment and the method) with:

```ts
  /**
   * Monthly trend: six months ending at `month` (the current Tashkent month
   * when it is absent or later), never before the reporting floor. Read by the
   * home chart and by the «Oylar bo'yicha» table of /payments/overview,
   * through `ReportsService.getFinancialTrendCanonical`.
   */
  async getFinancialTrend(
    companyId: number,
    branchIds: ReportBranchIds,
    month?: string,
  ) {
    // Tashkent months. They were built with `new Date(y, m, 1)`, i.e. in the
    // PROCESS timezone (UTC on Railway): every window ran 05:00 → 05:00
    // Tashkent, so a payment made before 05:00 on the 1st counted in the
    // previous month, and until 05:00 the series still ended on that month.
    const current = tashkentMonthKey(new Date());
    const end = month && month < current ? month : current;
    const months = Array.from({ length: 6 }, (_, i) =>
      addMonthsToMonthKey(end, i - 5),
    )
      // Before the floor there is no payroll to set against the cash:
      // `getSalaryMonthly` would clamp such a month UP to the floor, and its
      // canonical profit would subtract the floor month's payroll.
      .filter((monthKey) => monthKey >= DEBT_FLOOR_MONTH)
      .map((monthKey) => {
        const [year, mm] = monthKey.split('-');
        return {
          label: `${mm}/${year}`,
          // `YYYY-MM` alongside the display label so callers can ask for the
          // canonical per-month figure without re-parsing `MM/YYYY`.
          monthKey,
          // TIMESTAMP columns: `createdAt`, `paidAt`.
          instants: tashkentMonthRangeUtc(monthKey),
          // `Expense.date` is `@db.Date`: plain calendar dates, next month exclusive.
          dates: {
            gte: utcMidnightFromDateStr(`${monthKey}-01`),
            lt: utcMidnightFromDateStr(
              `${addMonthsToMonthKey(monthKey, 1)}-01`,
            ),
          },
        };
      });

    const branchFilter = branchIdWhere(branchIds);
    // The payroll leg carries the branch on the employee, not on its own row.
    const employeeFilter =
      branchIds === null ? {} : { user: userBranchWhere(branchIds) };

    return Promise.all(
      months.map(async (m) => {
        const dateFilter = m.instants;

        const [
          income,
          expenseAgg,
          salaryAgg,
          advancePaidAgg,
          advanceSettledAgg,
        ] = await Promise.all([
          this.prisma.payment.aggregate({
            where: {
              companyId,
              status: 'COMPLETED',
              createdAt: dateFilter,
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              date: m.dates,
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          this.prisma.salaryPayment.aggregate({
            where: {
              companyId,
              status: 'PAID',
              paidAt: dateFilter,
              ...employeeFilter,
            },
            _sum: { amount: true },
          }),
          // Advance cash paid this month — netted out of Xarajatlar (avanssiz).
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              date: m.dates,
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
          // Advance recognized as salary this month — settled against a PAID run.
          this.prisma.expense.aggregate({
            where: {
              companyId,
              deletedAt: null,
              category: 'TEACHER_ADVANCE',
              settledBySalaryPayment: { status: 'PAID', paidAt: dateFilter },
              ...branchFilter,
            },
            _sum: { amount: true },
          }),
        ]);

        const incomeTotal = income._sum.amount ?? 0;
        // Same avanssiz / settlement-based split as getFinancialOverview:
        // exclude advance cash from Xarajatlar, add only the advances settled
        // this month.
        const chiqimTotal =
          (expenseAgg._sum.amount ?? 0) -
          (advancePaidAgg._sum.amount ?? 0) +
          (salaryAgg._sum.amount ?? 0) +
          (advanceSettledAgg._sum.amount ?? 0);

        return {
          month: m.label,
          monthKey: m.monthKey,
          income: incomeTotal,
          expenses: chiqimTotal,
          profit: incomeTotal - chiqimTotal,
        };
      }),
    );
  }
```

4. In `server/src/reports/reports.service.ts`, `getFinancialTrendCanonical` gets a fourth parameter and passes it on:

```ts
  async getFinancialTrendCanonical(
    companyId: number,
    branchIds: ReportBranchIds,
    performedById: number,
    /** `YYYY-MM` the six months end at; the current month when absent. */
    month?: string,
  ) {
    const rows = await this.financial.getFinancialTrend(
      companyId,
      branchIds,
      month,
    );
```

(the rest of the method is unchanged).

- [ ] **Step 4: Run the service specs**

Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts src/reports/reports.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Rename the month DTO**

```bash
git mv server/src/reports/dto/expectation-history-query.dto.ts server/src/reports/dto/month-query.dto.ts
git mv server/src/reports/dto/expectation-history-query.dto.spec.ts server/src/reports/dto/month-query.dto.spec.ts
```

In `month-query.dto.ts`, rename the class to `MonthQueryDto` and replace its doc comment with:

```ts
/**
 * A report asked for one month: `?month=YYYY-MM&branchId=` — the daily history
 * of «Oy oxiriga kutilyapti», the six-month trend and the marketing report.
 * `ReportsQueryDto` cannot serve them: the global `ValidationPipe` runs with
 * `forbidNonWhitelisted`, so a `month` it does not declare is rejected with 400
 * — which is exactly how the history endpoint first shipped broken. Adding
 * `month` to the shared DTO would loosen every other report instead.
 */
```

In `month-query.dto.spec.ts`, import `{ MonthQueryDto } from './month-query.dto'`, use it as `metatype`, and rename the describe to `'MonthQueryDto'`.

- [ ] **Step 6: Write the failing controller tests**

In `server/src/reports/reports.controller.spec.ts`:

1. `mockService`: add `getFinancialTrendCanonical: jest.fn().mockResolvedValue([]),`; `getSalaryMonthly` resolves `{ month: '2026-07', totals: { netToPay: 100, advances: 20, fullDeserved: 120, covered: 120, gap: 0 }, staffTotals: { monthly: 30, advances: 5, netToPay: 25 } }`.
2. Remove `'getFinancialOverview'` from `studentPaymentsEndpoints` and add it to `narrowedEndpoints` (CEO/BD; denies Administrator, Cashier, Teacher).
3. Replace `describe('getFinancialOverview() — sensitive-field stripping', …)` and `describe('financial-overview — ownMonthProfit', …)` with:

```ts
  describe('getFinancialOverview() — payload', () => {
    const fullOverview = {
      income: {
        actual: 69126991,
        paymentCount: 212,
        byMethod: [{ method: 'CASH', amount: 5, count: 1 }],
        yesterday: { date: '2026-07-14', amount: 3 },
      },
      forecast: { expectedMonthEnd: 7, expectedHeld: 3, expectedRemaining: 4 },
      salary: { paid: 8251000, pending: 5, advances: 2 },
      monthCharges: {
        month: '2026-10',
        charged: 900_000,
        paid: 350_000,
        unpaid: 550_000,
        paidPct: 38.9,
        students: 2,
        unpaidStudents: 1,
      },
      debtSplit: {
        studying: {
          total: 43_500_000,
          count: 237,
          currentMonth: 41_100_000,
          older: 2_400_000,
          olderCount: 13,
        },
        notStudying: {
          total: 40_600_000,
          count: 327,
          byKind: {
            ungrouped: { total: 15_000_000, count: 128 },
            frozen: { total: 14_600_000, count: 99 },
            left: { total: 11_000_000, count: 100 },
          },
        },
      },
      expenses: 8251000,
      netProfit: 60875991,
      activeBalance: 1,
      activeStudentCount: 188,
    };

    beforeEach(() => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      mockService.getFinancialOverview.mockResolvedValue(fullOverview);
    });

    afterEach(() => {
      mockService.getFinancialOverview.mockResolvedValue({});
    });

    const query = {} as any;

    it.each([
      [10001, 'CEO'],
      [10002, 'Branch Director'],
    ])('returns the whole payload (%i, %s)', async (id) => {
      const res: any = await controller.getFinancialOverview(query, {
        id,
        companyId: 1,
      });
      expect(res).toMatchObject({
        income: fullOverview.income,
        expenses: fullOverview.expenses,
        netProfit: 12_345_678,
        forecast: fullOverview.forecast,
        monthCharges: fullOverview.monthCharges,
        debtSplit: fullOverview.debtSplit,
      });
      expect(res.salary.paid).toBe(fullOverview.salary.paid);
    });

    describe('net profit basis is stated, not implied', () => {
      it('reports the recognized basis when the canonical figure computes', async () => {
        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(res.netProfit).toBe(12_345_678);
        expect(res.netProfitBasis).toBe('recognized');
      });

      it('falls back to cash AND says so', async () => {
        mockService.getNetProfitWithBasis.mockResolvedValueOnce({
          netProfit: fullOverview.netProfit,
          netProfitBasis: 'cash',
        });

        const res: any = await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(res.netProfit).toBe(fullOverview.netProfit);
        expect(res.netProfitBasis).toBe('cash');
      });

      it('hands the service the cash figure as its fallback', async () => {
        await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });

        expect(mockService.getNetProfitWithBasis).toHaveBeenCalledWith(
          1,
          expect.objectContaining({
            performedById: 10001,
            cashFallback: fullOverview.netProfit,
          }),
        );
      });
    });

    it('folds the teachers’ AND the staff’s salary into salary.computed', async () => {
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res.salary.computed).toEqual({
        month: '2026-07',
        hasLessonData: true,
        fullDeserved: 120,
        netToPay: 100,
        advances: 20,
        staff: { monthly: 30, advances: 5, netToPay: 25 },
      });
    });

    it('takes the salary month from the Tashkent calendar when no period is given', async () => {
      // 01.10.2026 01:30 in Tashkent; the process (UTC) still says 30.09.
      jest.useFakeTimers().setSystemTime(new Date('2026-09-30T20:30:00.000Z'));
      try {
        mockService.getSalaryMonthly.mockClear();
        await controller.getFinancialOverview(query, {
          id: 10001,
          companyId: 1,
        });
        expect(mockService.getSalaryMonthly).toHaveBeenCalledWith(
          1,
          '2026-10',
          10001,
          undefined,
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('degrades salary.computed to null (never throws) when the salary calc fails', async () => {
      mockService.getSalaryMonthly.mockRejectedValueOnce(new Error('boom'));
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res.salary.computed).toBeNull();
      expect(res.netProfit).toBe(12_345_678);
    });

    it("no longer computes «Oyning o'z foydasi» (removed from the page)", async () => {
      mockService.getOwnMonthProfit.mockClear();
      const res: any = await controller.getFinancialOverview(query, {
        id: 10001,
        companyId: 1,
      });
      expect(res).not.toHaveProperty('ownMonthProfit');
      expect(mockService.getOwnMonthProfit).not.toHaveBeenCalled();
    });
  });

  describe('getFinancialTrend() — month anchor', () => {
    it('hands the asked month and the resolved scope to the canonical trend', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(asCeo);
      await controller.getFinancialTrend(
        { month: '2026-08' } as any,
        1001,
        10001,
      );
      expect(mockService.getFinancialTrendCanonical).toHaveBeenCalledWith(
        1001,
        null,
        10001,
        '2026-08',
      );
    });
  });
```

- [ ] **Step 7: Run it to see it fail**

Run: `cd server && npx jest src/reports/reports.controller.spec.ts`
Expected: FAIL — the overview roles still include Administrator/Cashier, `computed` lacks `fullDeserved`/`staff`, `ownMonthProfit` still computed, the trend ignores `month`.

- [ ] **Step 8: Implement the controller changes**

In `server/src/reports/reports.controller.ts`:

1. Imports: `import { MonthQueryDto } from './dto/month-query.dto';` (replacing the `ExpectationHistoryQueryDto` import) and `import { tashkentDateStr, tashkentMonthKey } from '../common/date/tashkent';`.
2. `getFinancialTrend`:

```ts
  // The «Oylar bo'yicha» table of /payments/overview and the home chart: six
  // months of cash and canonical profit, ending at `?month=` (default: now).
  // CEO/BD only — money series.
  @Get('financial-trend')
  @Roles('CEO', 'Branch Director')
  async getFinancialTrend(
    @Query() query: MonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    const branchIds = await this.resolveScope(userId, query.branchId);
    // Canonical profit per month, day-cached — the figure the profit card shows.
    return this.reportsService.getFinancialTrendCanonical(
      companyId,
      branchIds,
      userId,
      query.month,
    );
  }
```

3. Replace the comment block and the whole `getFinancialOverview` handler with:

```ts
  // «Umumiy ma'lumotlar» — CEO and Branch Director only (ADR-0067). The page
  // shows Administrator and Cashier only «To'lov qayd qilish» and the recent
  // payments and does not call this; the two cards they used to get from here
  // («To'lov qilganlar», «O'rtacha to'lov») were removed, and the redaction
  // branch with them.
  @Get('financial-overview')
  @Roles('CEO', 'Branch Director')
  async getFinancialOverview(
    @Query() query: ReportsQueryDto,
    @CurrentUser() user: { id: number; companyId: number },
  ) {
    const branchIds = await this.resolveScope(user.id, query.branchId);
    const overview = await this.reportsService.getFinancialOverview(
      user.companyId,
      {
        branchIds,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    );

    // «Oyliklar» card: the month's salary from `getMonthly` — the SAME source
    // as the /payments/salary page and the Excel «Oyliklar» sheet: teachers'
    // `fullDeserved` / `netToPay` / `advances` and the non-teaching staff's
    // `staffTotals`. Month = the period's START month (the Excel `monthStr`
    // rule); with no period the current TASHKENT month — `getFullYear()` /
    // `getMonth()` read the process timezone, UTC on Railway, and said last
    // month until 05:00 on the 1st. A salary-calc failure degrades to `null`,
    // never breaks the overview.
    const month = query.startDate
      ? query.startDate.slice(0, 7)
      : tashkentMonthKey(new Date());
    let computed: {
      month: string;
      hasLessonData: boolean;
      fullDeserved: number;
      netToPay: number;
      advances: number;
      staff: { monthly: number; advances: number; netToPay: number };
    } | null = null;
    try {
      // Branch-scoped like every other figure here: payroll resolves the
      // caller's own branch set from `user.id`.
      const sm = await this.reportsService.getSalaryMonthly(
        user.companyId,
        month,
        user.id,
        query.branchId,
      );
      const t = sm.totals;
      // Config-gap / manual months (the May cutover) have no per-lesson data:
      // the card prints «—» and «o'tish oyi» instead of a fake 0.
      const hasLessonData =
        (t.fullDeserved ?? 0) !== 0 ||
        (t.covered ?? 0) !== 0 ||
        (t.centerFunded ?? 0) !== 0;
      computed = {
        month: sm.month,
        hasLessonData,
        fullDeserved: t.fullDeserved,
        netToPay: t.netToPay,
        advances: t.advances,
        staff: {
          monthly: sm.staffTotals.monthly,
          advances: sm.staffTotals.advances,
          netToPay: sm.staffTotals.netToPay,
        },
      };
    } catch {
      computed = null;
    }

    // Kanonik «Foyda» — Excel «Sof foyda» bilan bir xil raqam. «Kanonik yoki
    // kassa» qarori `ReportsService.getNetProfitWithBasis` da turadi; a
    // failure returns the cash figure labelled `cash`, never silently.
    const { netProfit, netProfitBasis } =
      await this.reportsService.getNetProfitWithBasis(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
        cashFallback: overview.netProfit,
      });

    return {
      ...overview,
      netProfit,
      netProfitBasis,
      salary: { ...overview.salary, computed },
    };
  }
```

4. `getExpectationHistory`: `@Query() query: MonthQueryDto,` (the handler body is unchanged).

- [ ] **Step 9: Update `server/CLAUDE.md` (the role split this task changes)**

In the «Reports Module» section:
1. Replace the whole bullet that starts with `- **\`financial-overview\` role split (deliberate — do NOT re-tighten to CEO/BD-only)**:` with:

```markdown
- **`financial-overview` is CEO/BD only (ADR-0067)**: `@Roles('CEO', 'Branch Director')`. The Administrator/Cashier redaction branch (`{ ltvPayerCount, avgPayment }`) was deleted with the two cards it served; `/payments/overview` shows those roles only «To'lov qayd qilish» and «Oxirgi to'lovlar» (`GET /payments`) and never calls this endpoint for them. The payload carries `monthCharges` (`MonthCharges | null`, ADR-0058: «hisoblandi / to'landi / qoldi» of the period's START month, `null` before 2026-09 — see "One month-end expectation"), `debtSplit` (`DebtSplit`, ADR-0059/0065 — see "Debt as two numbers"), `income.yesterday` (`{ date, amount } | null`: yesterday's COMPLETED payments, only while the period is the current Tashkent month, `null` on the 1st) and `salary.computed` (`getMonthly` for the period's start month, by `tashkentMonthKey`: teachers' `fullDeserved` / `netToPay` / `advances` plus `staff: { monthly, advances, netToPay }`; `null` when the calc fails). The `ReportsService` facade adds `monthCharges`, `debtSplit` and `forecast`; the raw `ReportsFinancialService` overview has none of them — the Telegram `rm:cfin` card calls the raw service with a CEO scope.
```

2. Replace the bullet that starts with `- **Financial overview** calculates:` with:

```markdown
- **Financial overview** calculates: income (actual, by method, and yesterday's in the current month), salary (paid + pending; no tax — see "No tax calculation" under Salary Module), expenses and net profit. LTV, CAC, marketing ROI and the average payment left it with the old overview cards (ADR-0067); the marketing figures are `GET /reports/marketing`. It carries no debt figure of its own — the `ReportsService` facade adds `debtSplit` (next bullet).
```

- [ ] **Step 10: Verify no reader of the removed fields is left**

Run: `grep -rn "ltvPayerCount\|avgPayment\|marketingRoi\|newStudentCount\|marketingExpenses\|ownMonthProfit\|\.ltv\b\|\.cac\b" server/src --include='*.ts' | grep -v "spec.ts"`
Expected: only `getYearlyTrend`'s `avgPayment` (yearly trend, untouched) and `getOwnMonthProfit`/`computeOwnMonthProfit` names (Excel keeps them). The client readers go in Task 7.

- [ ] **Step 11: Run, type-check, lint, format**

```bash
cd server && npx jest src/reports
cd server && npm run typecheck
cd server && npx prettier --write src/reports/reports-financial.service.ts src/reports/reports-financial.service.spec.ts src/reports/reports.service.ts src/reports/reports.service.spec.ts src/reports/reports.controller.ts src/reports/reports.controller.spec.ts src/reports/dto/month-query.dto.ts src/reports/dto/month-query.dto.spec.ts src/reports/reports-branch-scope-coverage.spec.ts
cd server && npx eslint src/reports/reports-financial.service.ts src/reports/reports.service.ts src/reports/reports.controller.ts src/reports/dto/month-query.dto.ts
```
Expected: PASS, no errors.

- [ ] **Step 12: Commit**

```bash
git add server/src/reports/reports-financial.service.ts server/src/reports/reports-financial.service.spec.ts server/src/reports/reports.service.ts server/src/reports/reports.service.spec.ts server/src/reports/reports.controller.ts server/src/reports/reports.controller.spec.ts server/src/reports/dto/month-query.dto.ts server/src/reports/dto/month-query.dto.spec.ts server/src/reports/reports-branch-scope-coverage.spec.ts server/CLAUDE.md
git commit -m "feat(reports): financial overview is CEO/BD only; staff salary, yesterday's cash, trend month anchor

The Administrator/Cashier redaction goes with the cards it served. The
salary fold adds the teachers' full deserved pay and the staff totals,
its month from tashkentMonthKey. income.yesterday covers the current
month only. LTV/CAC/ROI/average-payment fields and their queries go;
financial-trend takes ?month= and stops at the reporting floor.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /payments` rows carry the student's current groups

**Files:**
- Modify: `server/src/payments/payments-read.service.ts:1-82`
- Modify: `server/src/payments/payments.service.spec.ts` (prisma mock, `describe('findAll()')`)

**Interfaces:**
- Produces: every `findAll` row's `student` is `{ id, firstName, lastName, groups: { id: string; name: string }[] }` — the groups of the student's live ACTIVE enrollments (`deletedAt` null, status ACTIVE), read in one query per page; `[]` when none.

- [ ] **Step 1: Write the failing tests**

In `server/src/payments/payments.service.spec.ts`, add `findMany: jest.fn().mockResolvedValue([]),` to the `enrollment` mock next to `findFirst`. In `describe('findAll()', …)`, change the expectation of «should return paginated results» to

```ts
      expect(result).toEqual({
        data: [
          {
            ...mockPaymentWithRelations,
            student: { ...mockPaymentWithRelations.student, groups: [] },
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
```

and add:

```ts
    it("adds each student's groups now, read in ONE query for the whole page", async () => {
      prisma.payment.findMany.mockResolvedValue([
        { id: 'p1', student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' } },
        { id: 'p2', student: { id: 10002, firstName: 'Vali', lastName: 'Aliyev' } },
        { id: 'p3', student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev' } },
      ]);
      prisma.payment.count.mockResolvedValue(3);
      prisma.enrollment.findMany.mockResolvedValue([
        { studentId: 10001, group: { id: 'g1', name: 'A1-07' } },
        { studentId: 10001, group: { id: 'g2', name: 'B1-02' } },
      ]);

      const result = await service.findAll({} as any, 1001, null);

      expect(prisma.enrollment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.enrollment.findMany.mock.calls[0][0]).toEqual({
        where: {
          studentId: { in: [10001, 10002] },
          deletedAt: null,
          status: 'ACTIVE',
        },
        select: {
          studentId: true,
          group: { select: { id: true, name: true } },
        },
      });
      expect(result.data.map((r: any) => r.student.groups)).toEqual([
        [
          { id: 'g1', name: 'A1-07' },
          { id: 'g2', name: 'B1-02' },
        ],
        [],
        [
          { id: 'g1', name: 'A1-07' },
          { id: 'g2', name: 'B1-02' },
        ],
      ]);
    });

    it('reads no enrollments for an empty page', async () => {
      prisma.payment.findMany.mockResolvedValue([]);
      prisma.payment.count.mockResolvedValue(0);

      await service.findAll({} as any, 1001, null);

      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx jest src/payments/payments.service.spec.ts -t "findAll"`
Expected: FAIL — rows have no `groups`; `enrollment.findMany` never called.

- [ ] **Step 3: Implement**

In `server/src/payments/payments-read.service.ts`, change the Prisma import to `import { EnrollmentStatus, PaymentStatus, Prisma } from '@prisma/client';`. In `findAll`, rename the destructured `data` to `rows` (`const [rows, total] = await Promise.all([ … ]);`) and replace `return { data, total, page, pageSize };` with:

```ts
    // The student's groups NOW (live active enrollments) — a label for the row,
    // not a property of the payment. One query for the whole page.
    const studentIds = [...new Set(rows.map((r) => r.student.id))];
    const enrollments = studentIds.length
      ? await this.prisma.enrollment.findMany({
          where: {
            studentId: { in: studentIds },
            deletedAt: null,
            status: EnrollmentStatus.ACTIVE,
          },
          select: {
            studentId: true,
            group: { select: { id: true, name: true } },
          },
        })
      : [];
    const groupsOf = new Map<number, { id: string; name: string }[]>();
    for (const e of enrollments) {
      const list = groupsOf.get(e.studentId) ?? [];
      list.push(e.group);
      groupsOf.set(e.studentId, list);
    }
    const data = rows.map((r) => ({
      ...r,
      student: { ...r.student, groups: groupsOf.get(r.student.id) ?? [] },
    }));

    return { data, total, page, pageSize };
```

- [ ] **Step 4: Run, type-check, lint, format**

```bash
cd server && npx jest src/payments
cd server && npm run typecheck
cd server && npx prettier --write src/payments/payments-read.service.ts src/payments/payments.service.spec.ts
cd server && npx eslint src/payments/payments-read.service.ts
```
Expected: PASS (the branch-isolation spec's empty pages read no enrollments), no errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/payments/payments-read.service.ts server/src/payments/payments.service.spec.ts
git commit -m "feat(payments): recent payment rows carry the student's current groups

One batched enrollment read per page: the groups of the student's live
active enrollments, [] when none.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Marketing report (server)

**Files:**
- Create: `server/src/reports/marketing/marketing.math.ts`, `server/src/reports/marketing/marketing.math.spec.ts`
- Create: `server/src/reports/marketing/reports-marketing.service.ts`, `server/src/reports/marketing/reports-marketing.service.spec.ts`
- Create: `server/src/reports/marketing/reports-marketing.controller.ts`, `server/src/reports/marketing/reports-marketing.controller.spec.ts`
- Modify: `server/src/reports/lead-funnel/lead-funnel.math.ts` (+ `lead-funnel.math.spec.ts`), `server/src/reports/lead-funnel/reports-lead-funnel.service.ts` (+ `reports-lead-funnel.service.spec.ts`)
- Modify: `server/src/reports/reports.module.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts:747-759`
- Modify: `server/src/reports/reports-branch-scope-coverage.spec.ts`

**Interfaces:**
- Consumes: `MonthQueryDto` (Task 3); `ReportsFinancialService.getMonthCharges(companyId, { month, branchIds })` → `MonthCharges` (Task 1 shape); `ReportsDepartedStudentsService.getDepartedStudentsSummary(companyId, { scope, startDate, endDate })` → `{ avgDurationMonths: number, … }`.
- Produces:
  - `export const FIRST_COHORT_MONTH = '2026-07'`; `export function isTransitionMonth(month: string): boolean`
  - `export interface MarketingMonth { month: string; spend: number; newStudents: number; cac: number | null; cohortPaid: number | null; roi: number | null; transition: boolean }`
  - `export interface FirstPayment { firstMonth: string; paid: number }`
  - `export function marketingMonths(input: { months: readonly string[]; spendByMonth: ReadonlyMap<string, number>; firstPayments: readonly FirstPayment[] }): MarketingMonth[]`
  - `export function lifetimeValue(avgDurationMonths: number, charges: MonthCharges | null): { value: number; avgMonths: number; monthlyCharge: number } | null`
  - `export function sourceBreakdown(persons: FunnelPerson[], sets: StageSets): { source: string | null; leads: number; students: number }[]` (lead-funnel.math)
  - `ReportsLeadFunnelService.getSourceBreakdown(companyId: number, input: FunnelPeriodInput, scope: ReportBranchIds)`
  - `ReportsMarketingService.getMarketing(companyId, { month?: string; branchIds: ReportBranchIds })` → `MarketingMonth & { ltv: … | null; months: MarketingMonth[]; sources: { source: string | null; leads: number; students: number }[] | null }`
  - `GET /reports/marketing?month=YYYY-MM&branchId=` — CEO/BD.

- [ ] **Step 1: Write the failing math tests**

Create `server/src/reports/marketing/marketing.math.spec.ts`:

```ts
import {
  isTransitionMonth,
  lifetimeValue,
  marketingMonths,
} from './marketing.math';

describe('isTransitionMonth', () => {
  it('May and June 2026 are the transition months', () => {
    expect(isTransitionMonth('2026-05')).toBe(true);
    expect(isTransitionMonth('2026-06')).toBe(true);
    expect(isTransitionMonth('2026-07')).toBe(false);
  });
});

describe('marketingMonths', () => {
  const months = ['2026-10', '2026-09', '2026-06'];
  const spendByMonth = new Map([
    ['2026-10', 400_000],
    ['2026-09', 0],
    ['2026-06', 200_000],
  ]);
  const firstPayments = [
    { firstMonth: '2026-10', paid: 900_000 },
    { firstMonth: '2026-10', paid: 450_000 },
    { firstMonth: '2026-09', paid: 1_350_000 },
    { firstMonth: '2026-06', paid: 2_000_000 },
    { firstMonth: '2026-11', paid: 999_000 }, // a later month: not on the list
  ];

  it('puts each student in the month of the first payment, with what the cohort paid since', () => {
    const [october] = marketingMonths({ months, spendByMonth, firstPayments });
    expect(october).toEqual({
      month: '2026-10',
      spend: 400_000,
      newStudents: 2,
      cac: 200_000,
      cohortPaid: 1_350_000,
      roi: 3.38, // 1 350 000 ÷ 400 000, two decimals
      transition: false,
    });
  });

  it('has no samara when nothing was spent', () => {
    const september = marketingMonths({ months, spendByMonth, firstPayments })[1];
    expect(september).toMatchObject({
      spend: 0,
      newStudents: 1,
      cac: 0,
      cohortPaid: 1_350_000,
      roi: null,
    });
  });

  it('a transition month counts its new students but computes nothing from them', () => {
    const june = marketingMonths({ months, spendByMonth, firstPayments })[2];
    expect(june).toEqual({
      month: '2026-06',
      spend: 200_000,
      newStudents: 1,
      cac: null,
      cohortPaid: null,
      roi: null,
      transition: true,
    });
  });

  it('has no jalb qilish narxi without new students', () => {
    const [august] = marketingMonths({
      months: ['2026-08'],
      spendByMonth: new Map([['2026-08', 300_000]]),
      firstPayments: [],
    });
    expect(august).toMatchObject({ newStudents: 0, cac: null, cohortPaid: 0, roi: 0 });
  });
});

describe('lifetimeValue', () => {
  const charges = {
    month: '2026-10',
    charged: 4_500_000,
    paid: 0,
    unpaid: 0,
    paidPct: 0,
    students: 10,
    unpaidStudents: 0,
  };

  it('is the average study months times the month charge per student', () => {
    expect(lifetimeValue(3.4, charges)).toEqual({
      value: 1_530_000,
      avgMonths: 3.4,
      monthlyCharge: 450_000,
    });
  });

  it('is null when nobody left (0 months), before monthly billing, or with nobody charged', () => {
    expect(lifetimeValue(0, charges)).toBeNull();
    expect(lifetimeValue(3.4, null)).toBeNull();
    expect(lifetimeValue(3.4, { ...charges, students: 0, charged: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd server && npx jest src/reports/marketing/marketing.math.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the math**

Create `server/src/reports/marketing/marketing.math.ts`:

```ts
import type { MonthCharges } from '../month-charges';

/**
 * The first month whose new students are really new. In May and June 2026
 * students who were already studying made their first in-system payment, so
 * they look new: those months are «o'tish oylari» (spec B1 §3.2, ADR-0067).
 */
export const FIRST_COHORT_MONTH = '2026-07';

export function isTransitionMonth(month: string): boolean {
  return month < FIRST_COHORT_MONTH;
}

/** One month of the marketing report. */
export interface MarketingMonth {
  month: string;
  /** Σ MARKETING expenses of the month. */
  spend: number;
  /** Students whose first COMPLETED payment fell in the month. */
  newStudents: number;
  /** round(spend ÷ newStudents); null with no new students or in a transition month. */
  cac: number | null;
  /** Σ every COMPLETED payment of the month's new students, to date; null in a transition month. */
  cohortPaid: number | null;
  /** cohortPaid ÷ spend, two decimals; null when nothing was spent or in a transition month. */
  roi: number | null;
  transition: boolean;
}

/** A student's first COMPLETED payment month and everything paid since. */
export interface FirstPayment {
  firstMonth: string;
  paid: number;
}

/** Pure. One row per month of `months`, from the spend and first payments already read. */
export function marketingMonths(input: {
  months: readonly string[];
  spendByMonth: ReadonlyMap<string, number>;
  firstPayments: readonly FirstPayment[];
}): MarketingMonth[] {
  const cohorts = new Map<string, { count: number; paid: number }>();
  for (const p of input.firstPayments) {
    const c = cohorts.get(p.firstMonth) ?? { count: 0, paid: 0 };
    c.count += 1;
    c.paid += p.paid;
    cohorts.set(p.firstMonth, c);
  }
  return input.months.map((month) => {
    const spend = input.spendByMonth.get(month) ?? 0;
    const cohort = cohorts.get(month) ?? { count: 0, paid: 0 };
    const transition = isTransitionMonth(month);
    return {
      month,
      spend,
      newStudents: cohort.count,
      cac:
        transition || cohort.count === 0
          ? null
          : Math.round(spend / cohort.count),
      cohortPaid: transition ? null : cohort.paid,
      roi:
        transition || spend === 0
          ? null
          : Math.round((cohort.paid / spend) * 100) / 100,
      transition,
    };
  });
}

/**
 * «O'quvchi qiymati» ≈ average study months × the month's charge per student.
 * `avgDurationMonths` 0 means nobody left in the month — unknown, not zero.
 * The charge exists from monthly billing on (`charges` null before 2026-09).
 */
export function lifetimeValue(
  avgDurationMonths: number,
  charges: MonthCharges | null,
): { value: number; avgMonths: number; monthlyCharge: number } | null {
  if (!(avgDurationMonths > 0) || !charges || charges.students === 0) {
    return null;
  }
  const monthlyCharge = Math.round(charges.charged / charges.students);
  return {
    value: Math.round(avgDurationMonths * monthlyCharge),
    avgMonths: avgDurationMonths,
    monthlyCharge,
  };
}
```

- [ ] **Step 4: Run the math tests**

Run: `cd server && npx jest src/reports/marketing/marketing.math.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing lead-source tests**

In `server/src/reports/lead-funnel/lead-funnel.math.spec.ts`, add `sourceBreakdown` to the import and append:

```ts
describe('sourceBreakdown', () => {
  it("counts people per source and those who reached «to'lov»; most leads first, «no source» last among equals", () => {
    const persons = toPersons([
      lead({ id: 'a', studentId: 11, source: 'Instagram' }),
      lead({ id: 'b', studentId: 11, source: 'Instagram' }), // the same person
      lead({ id: 'c', studentId: 12, source: 'Instagram' }),
      lead({ id: 'd', studentId: null, source: 'Telegram' }),
      lead({ id: 'e', studentId: 13, source: null }),
    ]);
    const sets = {
      enrolled: new Set([11, 12, 13]),
      attended: new Set([11, 13]),
      paid: new Set([11, 13]),
    };

    expect(sourceBreakdown(persons, sets)).toEqual([
      { source: 'Instagram', leads: 2, students: 1 },
      { source: 'Telegram', leads: 1, students: 0 },
      { source: null, leads: 1, students: 1 },
    ]);
  });
});
```

In `server/src/reports/lead-funnel/reports-lead-funnel.service.spec.ts`, append inside `describe('ReportsLeadFunnelService', …)`:

```ts
  it("getSourceBreakdown reads the funnel's own cohort, from 10.09.2026 on", async () => {
    const r = await service.getSourceBreakdown(
      COMPANY,
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      null,
    );

    // Lead 'a' (Instagram) never enrolled; lead 'b' (Telegram bot) attended but
    // has not paid.
    expect(r).toEqual([
      { source: 'Instagram', leads: 1, students: 0 },
      { source: 'Telegram bot', leads: 1, students: 0 },
    ]);
    expect(prisma.lead.findMany.mock.calls[0][0].where.createdAt.gte).toEqual(
      new Date('2026-09-09T19:00:00.000Z'), // 10.09 00:00 Tashkent
    );
  });
```

- [ ] **Step 6: Run them to see them fail**

Run: `cd server && npx jest src/reports/lead-funnel`
Expected: FAIL — `sourceBreakdown` / `getSourceBreakdown` do not exist.

- [ ] **Step 7: Implement the lead-source breakdown**

Append to `server/src/reports/lead-funnel/lead-funnel.math.ts`:

```ts
/**
 * «Manba bo'yicha» (marketing report): people per lead source and how many of
 * them reached «to'lov». Sorted by people, most first; «no source» (null)
 * goes after the named sources it ties with.
 */
export function sourceBreakdown(
  persons: FunnelPerson[],
  sets: StageSets,
): { source: string | null; leads: number; students: number }[] {
  const paid = new Set(
    personsAtStage(persons, sets, 'paid', 'all').map((p) => p.key),
  );
  const rows = new Map<
    string | null,
    { source: string | null; leads: number; students: number }
  >();
  for (const p of persons) {
    const row = rows.get(p.source) ?? { source: p.source, leads: 0, students: 0 };
    row.leads += 1;
    if (paid.has(p.key)) row.students += 1;
    rows.set(p.source, row);
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.leads - a.leads ||
      Number(a.source === null) - Number(b.source === null) ||
      (a.source ?? '').localeCompare(b.source ?? ''),
  );
}
```

In `server/src/reports/lead-funnel/reports-lead-funnel.service.ts`, add `sourceBreakdown` to the `./lead-funnel.math` import and add this method after `getPeople`:

```ts
  /**
   * «Manba bo'yicha» of the marketing report: the funnel's OWN cohort for the
   * period (people deduplicated by phone, branch by `leadAttributionWhere`,
   * start clamped to `FUNNEL_START_DATE`), one row per lead source.
   */
  async getSourceBreakdown(
    companyId: number,
    input: FunnelPeriodInput,
    scope: ReportBranchIds,
  ) {
    const { persons, sets } = await this.loadCohort(
      companyId,
      resolvePeriod(input),
      scope,
    );
    return sourceBreakdown(persons, sets);
  }
```

- [ ] **Step 8: Run the lead-funnel tests**

Run: `cd server && npx jest src/reports/lead-funnel`
Expected: PASS.

- [ ] **Step 9: Write the failing service tests**

Create `server/src/reports/marketing/reports-marketing.service.spec.ts`:

```ts
import { ReportsMarketingService } from './reports-marketing.service';

describe('ReportsMarketingService', () => {
  const prisma = {
    payment: { groupBy: jest.fn() },
    expense: { findMany: jest.fn() },
  };
  const financial = { getMonthCharges: jest.fn() };
  const departed = { getDepartedStudentsSummary: jest.fn() };
  const leadFunnel = { getSourceBreakdown: jest.fn() };
  const service = new ReportsMarketingService(
    prisma as never,
    financial as never,
    departed as never,
    leadFunnel as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // 15.10.2026 10:00 in Tashkent.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T05:00:00Z'));
    prisma.payment.groupBy.mockResolvedValue([
      { studentId: 10001, _min: { createdAt: new Date('2026-10-03T05:00:00Z') }, _sum: { amount: 900_000 } },
      { studentId: 10002, _min: { createdAt: new Date('2026-10-12T05:00:00Z') }, _sum: { amount: 450_000 } },
      { studentId: 10003, _min: { createdAt: new Date('2026-09-05T05:00:00Z') }, _sum: { amount: 1_350_000 } },
      { studentId: 10004, _min: { createdAt: new Date('2026-05-10T05:00:00Z') }, _sum: { amount: 2_000_000 } },
    ]);
    prisma.expense.findMany.mockResolvedValue([
      { date: new Date('2026-10-01T00:00:00Z'), amount: 300_000 },
      { date: new Date('2026-10-31T00:00:00Z'), amount: 100_000 },
      { date: new Date('2026-09-15T00:00:00Z'), amount: 450_000 },
      { date: new Date('2026-05-02T00:00:00Z'), amount: 200_000 },
    ]);
    financial.getMonthCharges.mockResolvedValue({
      month: '2026-10',
      charged: 4_500_000,
      paid: 0,
      unpaid: 0,
      paidPct: 0,
      students: 10,
      unpaidStudents: 0,
    });
    departed.getDepartedStudentsSummary.mockResolvedValue({ avgDurationMonths: 3.4 });
    leadFunnel.getSourceBreakdown.mockResolvedValue([
      { source: 'Instagram', leads: 12, students: 3 },
    ]);
  });

  afterEach(() => jest.useRealTimers());

  it('answers the asked month and every month back to 2026-05, newest first', async () => {
    const r = await service.getMarketing(1001, { month: '2026-10', branchIds: null });

    expect(r.months.map((m) => m.month)).toEqual([
      '2026-10',
      '2026-09',
      '2026-08',
      '2026-07',
      '2026-06',
      '2026-05',
    ]);
    expect(r).toMatchObject({
      month: '2026-10',
      spend: 400_000,
      newStudents: 2,
      cac: 200_000,
      cohortPaid: 1_350_000,
      roi: 3.38,
      transition: false,
      ltv: { value: 1_530_000, avgMonths: 3.4, monthlyCharge: 450_000 },
      sources: [{ source: 'Instagram', leads: 12, students: 3 }],
    });
    expect(r.months[1]).toMatchObject({ month: '2026-09', spend: 450_000, newStudents: 1, cac: 450_000, roi: 3 });
    expect(r.months[5]).toMatchObject({ month: '2026-05', newStudents: 1, cac: null, cohortPaid: null, roi: null, transition: true });
  });

  it('clamps a month after the current one, and one before the floor', async () => {
    expect((await service.getMarketing(1001, { month: '2027-01', branchIds: null })).month).toBe('2026-10');
    expect((await service.getMarketing(1001, { month: '2026-03', branchIds: null })).month).toBe('2026-05');
    expect((await service.getMarketing(1001, { branchIds: null })).month).toBe('2026-10');
  });

  it("reads first payments, spend and the three services in the caller's one scope", async () => {
    await service.getMarketing(1001, { month: '2026-10', branchIds: [4] });

    expect(prisma.payment.groupBy.mock.calls[0][0]).toEqual({
      by: ['studentId'],
      where: {
        companyId: 1001,
        status: 'COMPLETED',
        student: {
          deletedAt: null,
          enrollments: { some: { deletedAt: null } },
          branches: { some: { branchId: { in: [4] } } },
        },
      },
      _min: { createdAt: true },
      _sum: { amount: true },
    });
    // `Expense.date` is `@db.Date`: plain dates, the next month exclusive.
    expect(prisma.expense.findMany.mock.calls[0][0]).toEqual({
      where: {
        companyId: 1001,
        deletedAt: null,
        category: 'MARKETING',
        date: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lt: new Date('2026-11-01T00:00:00.000Z'),
        },
        branchId: { in: [4] },
      },
      select: { date: true, amount: true },
    });
    expect(departed.getDepartedStudentsSummary).toHaveBeenCalledWith(1001, {
      scope: [4],
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
    expect(financial.getMonthCharges).toHaveBeenCalledWith(1001, { month: '2026-10', branchIds: [4] });
    expect(leadFunnel.getSourceBreakdown).toHaveBeenCalledWith(
      1001,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      [4],
    );
  });

  it('before monthly billing there is no charge per month (no LTV), and before 10.09.2026 no lead source', async () => {
    const r = await service.getMarketing(1001, { month: '2026-08', branchIds: null });

    expect(financial.getMonthCharges).not.toHaveBeenCalled();
    expect(leadFunnel.getSourceBreakdown).not.toHaveBeenCalled();
    expect(r.ltv).toBeNull();
    expect(r.sources).toBeNull();
  });

  it('September asks the funnel for the whole month (it clamps the start itself)', async () => {
    await service.getMarketing(1001, { month: '2026-09', branchIds: null });

    expect(leadFunnel.getSourceBreakdown).toHaveBeenCalledWith(
      1001,
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      null,
    );
  });
});
```

- [ ] **Step 10: Run them to see them fail**

Run: `cd server && npx jest src/reports/marketing/reports-marketing.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 11: Implement the service**

Create `server/src/reports/marketing/reports-marketing.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { ExpenseCategory, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  branchIdWhere,
  studentBranchWhere,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../../common/date/tashkent';
import { DEBT_FLOOR_MONTH, enumerateMonths } from '../debt-history.util';
import { isMonthlyBillingMonth } from '../month-charges';
import { ReportsFinancialService } from '../reports-financial.service';
import { ReportsDepartedStudentsService } from '../reports-departed-students.service';
import { ReportsLeadFunnelService } from '../lead-funnel/reports-lead-funnel.service';
import { FUNNEL_START_DATE } from '../lead-funnel/lead-funnel.math';
import {
  lifetimeValue,
  marketingMonths,
  type FirstPayment,
} from './marketing.math';

/**
 * «Marketing» (spec B1 §3, ADR-0067): one month's spend, new students and
 * what they paid, the months before it back to the reporting floor, and the
 * lead-source cohort. Every figure comes from its single source — first
 * payments and spend read here once, the month charge from `getMonthCharges`,
 * the study months from `getDepartedStudentsSummary`, the sources from the
 * lead funnel's own cohort — and the arithmetic is `marketing.math.ts`.
 */
@Injectable()
export class ReportsMarketingService {
  constructor(
    private prisma: PrismaService,
    private financial: ReportsFinancialService,
    private departed: ReportsDepartedStudentsService,
    private leadFunnel: ReportsLeadFunnelService,
  ) {}

  async getMarketing(
    companyId: number,
    opts: { month?: string; branchIds: ReportBranchIds },
  ) {
    const { branchIds } = opts;
    const current = tashkentMonthKey(new Date());
    const asked = opts.month ?? current;
    const month =
      asked > current
        ? current
        : asked < DEBT_FLOOR_MONTH
          ? DEBT_FLOOR_MONTH
          : asked;
    const startDate = `${month}-01`;
    const endDate = addDaysToDateStr(
      `${addMonthsToMonthKey(month, 1)}-01`,
      -1,
    );

    const [firstPayments, expenses, departed, charges, sources] =
      await Promise.all([
        // Every candidate student's FIRST completed payment and everything
        // paid since. A candidate is a live card in scope with at least one
        // enrollment — a mock-only payer has none. REVERSED never counts.
        this.prisma.payment.groupBy({
          by: ['studentId'],
          where: {
            companyId,
            status: PaymentStatus.COMPLETED,
            student: {
              deletedAt: null,
              enrollments: { some: { deletedAt: null } },
              ...studentBranchWhere(branchIds),
            },
          },
          _min: { createdAt: true },
          _sum: { amount: true },
        }),
        // MARKETING spend from the floor to the asked month. `Expense.date` is
        // `@db.Date`: plain calendar dates, the next month exclusive.
        this.prisma.expense.findMany({
          where: {
            companyId,
            deletedAt: null,
            category: ExpenseCategory.MARKETING,
            date: {
              gte: utcMidnightFromDateStr(`${DEBT_FLOOR_MONTH}-01`),
              lt: utcMidnightFromDateStr(
                `${addMonthsToMonthKey(month, 1)}-01`,
              ),
            },
            ...branchIdWhere(branchIds),
          },
          select: { date: true, amount: true },
        }),
        this.departed.getDepartedStudentsSummary(companyId, {
          scope: branchIds,
          startDate,
          endDate,
        }),
        isMonthlyBillingMonth(month)
          ? this.financial.getMonthCharges(companyId, { month, branchIds })
          : Promise.resolve(null),
        // Lead sources are written from 10.09.2026: an earlier month has none.
        endDate < FUNNEL_START_DATE
          ? Promise.resolve(null)
          : this.leadFunnel.getSourceBreakdown(
              companyId,
              { startDate, endDate },
              branchIds,
            ),
      ]);

    const spendByMonth = new Map<string, number>();
    for (const e of expenses) {
      // A calendar date stored at UTC midnight: its Tashkent day is the same date.
      const key = tashkentMonthKey(e.date);
      spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + e.amount);
    }
    const firsts: FirstPayment[] = firstPayments.flatMap((r) =>
      r._min.createdAt
        ? [
            {
              firstMonth: tashkentMonthKey(r._min.createdAt),
              paid: r._sum.amount ?? 0,
            },
          ]
        : [],
    );
    const months = marketingMonths({
      months: enumerateMonths(DEBT_FLOOR_MONTH, month).reverse(),
      spendByMonth,
      firstPayments: firsts,
    });

    return {
      ...months[0],
      ltv: lifetimeValue(departed.avgDurationMonths, charges),
      months,
      sources,
    };
  }
}
```

- [ ] **Step 12: Run the service tests**

Run: `cd server && npx jest src/reports/marketing/reports-marketing.service.spec.ts`
Expected: PASS.

- [ ] **Step 13: Write the failing controller tests**

Create `server/src/reports/marketing/reports-marketing.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ReportsMarketingController } from './reports-marketing.controller';
import { RolesGuard } from '../../common/guards';
import { ROLES_KEY } from '../../common/decorators';

describe('ReportsMarketingController', () => {
  const service = { getMarketing: jest.fn().mockResolvedValue({}) };
  const prisma = { user: { findFirst: jest.fn() } };
  const controller = new ReportsMarketingController(
    service as never,
    prisma as never,
  );
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const ctx = (roles: string[]) =>
    ({
      getHandler: () => controller.getMarketing,
      getClass: () => ReportsMarketingController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;

  beforeEach(() => jest.clearAllMocks());

  it('is CEO and Branch Director only — a money report', () => {
    expect(reflector.get<string[]>(ROLES_KEY, ReportsMarketingController)).toEqual([
      'CEO',
      'Branch Director',
    ]);
  });

  it.each(['CEO', 'Branch Director'])('lets %s in', (role) => {
    expect(guard.canActivate(ctx([role]))).toBe(true);
  });

  it.each(['Administrator', 'Cashier', 'Teacher', 'Student'])('refuses %s', (role) => {
    expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
  });

  it('hands the service the resolved scope and the month', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    });

    await controller.getMarketing({ month: '2026-09', branchId: 2 }, 1001, 10001);

    expect(service.getMarketing).toHaveBeenCalledWith(1001, {
      month: '2026-09',
      branchIds: [2],
    });
  });

  it('refuses a caller whose scope resolved to no branch, before reading anything', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    await expect(controller.getMarketing({}, 1001, 10002)).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.getMarketing).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 14: Run them to see them fail**

Run: `cd server && npx jest src/reports/marketing/reports-marketing.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 15: Implement the controller and wire it**

Create `server/src/reports/marketing/reports-marketing.controller.ts`:

```ts
import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { MonthQueryDto } from '../dto/month-query.dto';
import { ReportsMarketingService } from './reports-marketing.service';

/**
 * «Marketing» (spec B1 §3): spend, new students and what they paid, by the
 * ADR-0067 definitions. A money report — CEO and Branch Director only, on its
 * own controller so the reports controller's class default (which admits
 * Administrator) never reaches it.
 */
@Controller('reports/marketing')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class ReportsMarketingController {
  constructor(
    private readonly marketing: ReportsMarketingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getMarketing(
    @Query() query: MonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    // ONE scope for every leg: the caller's ceiling narrowed by the header's
    // pick. An empty one is refused, never answered with zeros (ADR-0002).
    const branchIds = await resolveCallerReportBranchIds(
      this.prisma,
      userId,
      query.branchId,
    );
    if (isEmptyScope(branchIds)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return this.marketing.getMarketing(companyId, {
      month: query.month,
      branchIds,
    });
  }
}
```

In `server/src/reports/reports.module.ts`, add

```ts
import { ReportsMarketingService } from './marketing/reports-marketing.service';
import { ReportsMarketingController } from './marketing/reports-marketing.controller';
```

then `controllers: [ReportsController, ReportsLeadFunnelController, ReportsMarketingController],` and `ReportsMarketingService,` at the end of `providers`.

In `server/src/common/auth/branch-route-policy.ts`, add this block to `ROUTE_POLICIES` after the profit-composition block:

```ts
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The marketing report resolves its scope with `resolveCallerReportBranchIds` ' +
      '(ceiling ∩ requested, 403 on an empty scope) and hands the one list to ' +
      'every leg: first payments through `studentBranchWhere`, MARKETING spend ' +
      'through `branchIdWhere`, and the month charges, departures and lead-source ' +
      'cohort through their own services with the same list.',
    routes: ['GET /reports/marketing'],
  },
```

- [ ] **Step 16: Add the branch-scope coverage**

In `server/src/reports/reports-branch-scope-coverage.spec.ts`:
1. In `hasBranchPredicate`, before `return false;`, add:

```ts
  // On the student a row belongs to (first payments of the marketing report).
  if (where.student?.branches !== undefined) return true;
```

2. Add `import { ReportsMarketingService } from './marketing/reports-marketing.service';` and append:

```ts
/**
 * The marketing report's own two reads: first payments are scoped by the
 * student's branch, the MARKETING spend by the expense's. The month charges,
 * departures and lead sources are read through their own services with the
 * same list (each has its own coverage).
 */
describe('branch scope coverage — marketing', () => {
  it('scopes the first-payment and the spend reads', async () => {
    const prisma = {
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportsMarketingService(
      prisma as never,
      { getMonthCharges: jest.fn().mockResolvedValue(null) } as never,
      {
        getDepartedStudentsSummary: jest
          .fn()
          .mockResolvedValue({ avgDurationMonths: 0 }),
      } as never,
      { getSourceBreakdown: jest.fn().mockResolvedValue([]) } as never,
    );

    await service.getMarketing(1, { month: '2026-09', branchIds: [2] });

    expect(
      hasBranchPredicate(prisma.payment.groupBy.mock.calls[0][0].where),
    ).toBe(true);
    expect(
      hasBranchPredicate(prisma.expense.findMany.mock.calls[0][0].where),
    ).toBe(true);
  });
});
```

- [ ] **Step 17: Run everything this task touches**

```bash
cd server && npx jest src/reports src/common/auth/branch-route-policy.spec.ts
cd server && npm run typecheck
cd server && npx prettier --write src/reports/marketing src/reports/lead-funnel/lead-funnel.math.ts src/reports/lead-funnel/lead-funnel.math.spec.ts src/reports/lead-funnel/reports-lead-funnel.service.ts src/reports/lead-funnel/reports-lead-funnel.service.spec.ts src/reports/reports.module.ts src/common/auth/branch-route-policy.ts src/reports/reports-branch-scope-coverage.spec.ts
cd server && npx eslint src/reports/marketing src/reports/lead-funnel src/reports/reports.module.ts src/common/auth/branch-route-policy.ts
```
Expected: PASS — the manifest spec classifies `GET /reports/marketing` exactly once; no type or lint errors.

- [ ] **Step 18: Commit**

```bash
git add server/src/reports/marketing server/src/reports/lead-funnel/lead-funnel.math.ts server/src/reports/lead-funnel/lead-funnel.math.spec.ts server/src/reports/lead-funnel/reports-lead-funnel.service.ts server/src/reports/lead-funnel/reports-lead-funnel.service.spec.ts server/src/reports/reports.module.ts server/src/common/auth/branch-route-policy.ts server/src/reports/reports-branch-scope-coverage.spec.ts
git commit -m "feat(reports): marketing report with first-payment cohorts

GET /reports/marketing (CEO/BD): spend, new students by first completed
payment, jalb qilish narxi, o'quvchi qiymati (study months x month
charge), marketing samarasi by cohort paid to date, transition months
before 2026-07, and the lead funnel's cohort by source.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ADR-0067

**Files:**
- Create: `docs/adr/0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md`
- Modify: `docs/adr/README.md` (one row after 0063)

**Interfaces:** none (documents Tasks 1–5).

- [ ] **Step 1: Check the number is still free**

Run: `git fetch origin --quiet && git ls-tree --name-only origin/main docs/adr/ | grep -c "^docs/adr/0067-" ; gh pr list --state open --json number,title | grep -o "ADR-00[0-9][0-9]" | sort -u`
Expected: `0` and a list without `ADR-0067`. If 0067 is taken (0065 and 0066 already are, since 02.10), use the next free number here AND replace `ADR-0067` everywhere the earlier tasks wrote it: `grep -rln "ADR-0067" server/src server/CLAUDE.md` then edit each.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md`:

```markdown
# ADR-0067 — Kassaga tushgan pul uch qismda; marketing ko'rsatkichlari birinchi to'lov bo'yicha; o'qimayotganlar qarzi uch turga bo'linadi; «financial-overview» faqat CEO va filial direktoriga

**Holati:** Qabul qilindi
**Sana:** 2026-10-02
**Bog'liq:** `docs/superpowers/specs/2026-10-02-b1-umumiy-va-marketing-design.md`, `docs/superpowers/plans/2026-10-02-b1-umumiy-va-marketing.md`, `server/src/reports/reports-financial.service.ts` (`getIncomeMonthAttribution`), `server/src/reports/marketing/`, `server/src/reports/debt-split.ts`, `server/src/reports/month-charges.ts`, `server/src/telegram-groups/utils/income-split.util.ts`, ADR-0015, ADR-0055, ADR-0058, ADR-0059

## Kontekst

CEO 27.09.2026 da Moliya va Hisobotlar sahifalarini o'qish qiyin deb topdi va B
to'plamini (yetti qism) tasdiqladi. Birinchi qism — «Umumiy ma'lumotlar» va
«Marketing» sahifalari. Ularni qurishdan oldin to'rt narsa kodda qaror talab
qildi:

- **Kassaga tushgan pul ikki qismda edi.** `getIncomeMonthAttribution` pulni
  «shu oy uchun» va «eski qarzlar uchun»ga bo'lardi. Qarzdan ortgan to'lov —
  keyingi oy uchun oldindan to'langan pul ham — «shu oy»ga qo'shilardi:
  oktabr oxirida noyabr uchun to'lagan o'quvchining puli oktabrniki bo'lib
  ko'rinardi. CEO buni alohida qism sifatida ko'rishni so'radi (27.09), 21:00
  hisobotida ham (02.10).
- **Marketing ko'rsatkichlari noto'g'ri formulada edi.** «O'quvchi qiymati»
  davr tushumini to'lovchilar soniga bo'lardi; «Jalb qilish narxi» marketing
  sarfini davrda yaratilgan kartalar soniga bo'lardi — to'lamagan karta ham
  «yangi o'quvchi» edi; «Marketing samarasi» butun kassani marketing sarfi
  bilan solishtirardi. CEO ularni to'g'ri formulalar bilan alohida «Marketing»
  sahifasida qoldirishni so'radi.
- **«O'qimayotganlar qarzi» bitta raqam edi.** Maket uni guruhsiz, muzlatilgan
  va ketganlarga bo'lib ko'rsatadi; uchinchi qismning ta'rifi yo'q edi.
- **`GET /reports/financial-overview` Administrator va Kassirga ham ochiq
  edi** va ularga faqat ikki kartani («To'lov qilganlar», «O'rtacha to'lov»)
  kesib berardi. CEO ikkala kartani olib tashladi.

## Qaror (CEO, 27.09.2026 va 02.10.2026)

1. **Kassaga tushgan pul — uch qism.** `getIncomeMonthAttribution` endi
   `currentMonth` (shu oy uchun), `advance` (keyingi oy uchun oldindan) va
   `lateTotal` (eski qarzlar uchun) qaytaradi; `total = currentMonth + advance
   + lateTotal` — davrdagi hisobga olingan to'lovlar yig'indisi, avvalgidek.
   - O'quvchining musbat balansi endi bitta son emas, bo'laklar navbati (FIFO).
     Bo'lak «qamrovda» yoki yo'q: qamrovdagi bo'lak — davr va filialdagi
     COMPLETED to'lovning qarzdan ortgan qismi.
   - Debet balansni eng eski bo'lakdan yeydi — pul hamma joyda shu tartibda
     yuradi. Shuning uchun undan oldingi qamrovdan tashqari kredit (eskiroq
     to'lov, tuzatish, boshlang'ich balans) bu davrning oldindan to'lovidan
     oldin sarflanadi.
   - **Debet davr ichida** bo'lsa, u yegan qamrovdagi summa `advance`dan
     `currentMonth`ga o'tadi: u davrning hisobini to'ladi (masalan, oy o'rtasida
     guruhga qo'shilish).
   - **Debet davr tugagandan keyin** bo'lsa (masalan, yopilgan oy keyin
     ko'rilganda keyingi oyning 1-sanadagi hisobi), summa `advance`da qoladi: u
     keyingi oyni to'ladi.
   - Yangi maydonlar: `advanceStudents` (davr oxirida qamrovdagi oldindan
     to'lovi turgan o'quvchilar), `paymentCount`, `latePaymentCount` (eski
     qarzni ham yopgan to'lovlar), `lateStudentCount`.
   - `collectionPct` ma'nosini saqlaydi: surati `currentMonth + advance` —
     avvalgi `currentMonth`.
   - **O'qiydiganlar.** Uch qismni ko'rsatadi: «Qayerdan keldi» oynasi, 21:00
     hisobotining tushum qatorlari va «💰 Moliyaviy xulosa» (`income-split.util.ts`:
     «Shu oy uchun», «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun», keyin
     har oy; 0 bo'lgan qism chiqmaydi; foizlar yig'indisi doim 100). Eski
     ma'noni (`currentMonth + advance`) saqlaydi: `getOwnMonthProfit` (Excel
     «Xulosa»), Excel «Xulosa»ning 3-bloki va dars puli bloki, kunlik suratning
     `collectedForMonth`i (surat qayta qurilmaydi, ma'nosi o'zgarmasligi shart),
     21:00 hisobotining 2026-09 dan oldingi oylar uchun «Shundan yig'ildi» va
     «Oy rejasidan yig'ildi» qatorlari, ikki diagnostika skripti.
2. **Marketing ta'riflari** (`server/src/reports/marketing/`;
   `GET /reports/marketing`, faqat CEO va filial direktori):
   - **Sarf (M oyi)** — `MARKETING` toifali, o'chirilmagan `Expense.amount`
     yig'indisi, `Expense.date` M oyida (`@db.Date`: chegaralar
     `utcMidnightFromDateStr`, yuqorisi kirmaydi), filial `branchIdWhere`.
   - **M oyining yangi o'quvchisi** — birinchi COMPLETED `Payment`i (`createdAt`ning
     Toshkent oyi) M oyiga tushgan karta: `deletedAt` bo'sh, filial qamrovida
     (`studentBranchWhere`), kamida bitta o'chirilmagan yozilishi bor (faqat mock
     to'lagan odam kirmaydi). Bekor qilingan to'lov (REVERSED) sanalmaydi.
   - **Kogorta hozirgacha to'lagan** — shu yangi o'quvchilarning birinchi
     to'lovidan bugungacha barcha COMPLETED to'lovlari.
   - **Jalb qilish narxi** = round(sarf ÷ yangi o'quvchilar); yangi o'quvchi
     bo'lmasa — bo'sh.
   - **O'quvchi qiymati** ≈ o'rtacha o'qish oylari × oylik hisob. O'rtacha
     oylar — M uchun `getDepartedStudentsSummary(...).avgDurationMonths`
     (Ketgan o'quvchilar sahifasidagi raqam; 0 — ketgan yo'q, bo'sh deb
     o'qiladi); oylik hisob — M uchun round(`MonthCharges.charged ÷ students`),
     2026-09 dan oldin bo'sh. Biri bo'sh bo'lsa, qiymat ham bo'sh.
   - **Marketing samarasi** = kogorta hozirgacha to'lagani ÷ sarf; sarf 0 bo'lsa
     — bo'sh.
   - **O'tish oylari** — 2026-07 dan oldingi oylar. May va iyunda allaqachon
     o'qiyotganlar tizimdagi birinchi to'lovini qilgan va yangidek ko'rinadi:
     yangi o'quvchilar soni «*» bilan, jalb qilish narxi, hozirgacha to'lagan
     va samara hisoblanmaydi.
   - **Manba bo'yicha** jadval lid voronkasining o'z kogortasini o'qiydi
     (`ReportsLeadFunnelService.getSourceBreakdown`: odamlar telefon bo'yicha
     birlashtirilgan, filial `leadAttributionWhere`, boshlanishi
     `FUNNEL_START_DATE` = 2026-09-10).
   - Eski formulalar `financial-overview` va 6 oylik `financial-trend`dan olib
     tashlandi (`ltv`, `ltvPayerCount`, `cac`, `marketingRoi`, `avgPayment` va
     ularni boqqan `newStudentCount`, `marketingExpenses`). Ekranda inglizcha
     qisqartma yo'q.
3. **O'qimayotganlar qarzi uch turga bo'linadi** (`debt-split.ts`; ADR-0059ga
   qo'shimcha, uni almashtirmaydi). O'qimayotganlar to'plami (`NOT
   activeStudentWhere()`) bitta `groupBy(['status'])` bilan o'qiladi:
   - statusi ACTIVE — **guruhsiz**: o'qimayotganlar ichida ACTIVE aynan
     `ungroupedStudentWhere()` (ACTIVE statusda inkor `enrollments.none`ga
     aylanadi — o'sha `ACTIVE_ENROLLMENT_WHERE`);
   - FROZEN — **muzlatilgan**;
   - qolgan har qanday status (EXPELLED, GRADUATED, INACTIVE, `deletedAt` bo'sh
     ARCHIVED, PROSPECT) — **ketgan**.

   Uch qism qurilishiga ko'ra `notStudying.total` va `count`ni beradi. Ikki
   raqam (o'qiyotganlar va o'qimayotganlar) avvalgidek hech qayerda
   qo'shilmaydi. Qo'shimcha: `studying.olderCount` (eski qarzi bor o'qiyotgan
   qarzdorlar soni) va `MonthCharges.unpaidStudents` (qamrovdagi to'lanmagan
   ulushi 0 dan katta o'quvchilar — `unpaid` hisoblangan joyda sanaladi).
4. **`GET /reports/financial-overview` — faqat CEO va filial direktori.**
   Administrator va Kassir uchun kesib berish shoxi o'chirildi. «Umumiy
   ma'lumotlar» sahifasida ular faqat sarlavha, «To'lov qayd qilish» va oxirgi
   to'lovlarni (`GET /payments`) ko'radi; sahifa ular uchun bu endpointni
   chaqirmaydi.

**Ataylab o'zgarmadi:**
- Excel kitobi va yillik trend — eski ma'noda qoladi (1-banddagi o'qiydiganlar);
- `GET /reports/expectation-history` va 23:40 surati (surat qayta qurilmaydi);
- `GET /reports/debt-write-offs-summary` (uni Qarzdorlik qismi joylaydi);
- Telegram qarz qatorlari — o'qimayotganlarning uch turini chop etmaydi;
- `/payments/debt` ro'yxatlari va plitkalari.

**Taqiqlanadi:**
- uch qismni, marketing raqamlarini yoki o'qimayotganlar turlarini
  `getIncomeMonthAttribution`, `reports/marketing/` va `debt-split.ts`dan
  boshqa joyda hisoblash — mijozda ham;
- o'qimayotganlar turlarini o'qiyotganlar qarziga qo'shish;
- ekranda LTV, CAC, ROI qisqartmalari.

## Ko'rib chiqilgan muqobillar

- **Qarzdan ortgan hamma pul — oldindan.** Rad etildi: oy o'rtasida qo'shilgan
  o'quvchining shu to'lovdan yechilgan hisobi keyingi oyning puli bo'lib
  ko'rinardi.
- **Yangi o'quvchi — davrda yaratilgan karta.** Rad etildi: to'lamagan karta
  ham sanalardi (eski formula shu edi).
- **«Ketgan» — faqat EXPELLED.** Rad etildi: INACTIVE, GRADUATED, ARCHIVED va
  PROSPECT hech qayerga tushmasdi va uch qism jamini bermasdi.
- **Administrator va Kassirga ikki kartani qoldirish.** Rad etildi: CEO
  ikkalasini olib tashladi (27.09).

## Oqibatlari

**Yutuq:** sahifa, 21:00 hisoboti va «💰 Moliyaviy xulosa» kassani bir xil uch
qismda ko'rsatadi; marketing raqamlari to'lagan o'quvchilarga tayanadi;
o'qimayotganlar qarzi kimlardan iboratligi ko'rinadi.

**Narx:**
- «Shu oy uchun» oldindan to'lov hajmicha kamayadi — pul yo'qolmagan, alohida
  qatorga o'tdi. Deploydan keyingi birinchi 21:00 hisobotida yangi «Oldindan»
  qatori chiqadi (CEO biladi, 02.10).
- `advanceStudents` — davr oxiridagi holat: yopilgan oy keyinroq ko'rilsa,
  keyingi oyning hisobi o'sha pulni allaqachon yegan bo'lishi mumkin.
- Marketing — «yuqori chegara»: hamma yangi o'quvchi reklamadan kelmagan.
  Manba bo'yicha aniq hisob faqat 10.09.2026 dan beri.
- INACTIVE va `deletedAt` bo'sh ARCHIVED karta «ketgan»da (lid voronkasi
  hisoboti INACTIVE ni muzlatilganlar bilan sanaydi — boshqa yuza, boshqa
  savol).
- **Deploy: avval mijoz, keyin server** — ADR-0058 dagi kabi. Yangi mijoz eski
  serverning yo'q maydonlari o'rnida «—» chizadi yoki qatorni tashlaydi; eski
  mijoz yangi serverda olib tashlangan maydonlarni topmaydi.
```

- [ ] **Step 3: Add the index row**

In `docs/adr/README.md`, after the `| [0063](…) |` row, add:

```markdown
| [0067](0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md) | Kassaga tushgan pul uch qismda (shu oy, oldindan, eski qarz); marketing ko'rsatkichlari birinchi to'lov bo'yicha; o'qimayotganlar qarzi uch turga bo'linadi; «financial-overview» faqat CEO va filial direktoriga | Qabul qilindi | 2026-10-02 |
```

- [ ] **Step 4: Commit**

```bash
git add docs/adr/0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md docs/adr/README.md
git commit -m "docs(adr): ADR-0067 — cash in three parts, marketing definitions, debt kinds

Also records financial-overview becoming CEO/BD only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The new overview page — month picker, role split, month charges, today's debt, recent payments

**Files:**
- Create: `client/src/components/payments/overview/types.ts`
- Create: `client/src/components/payments/overview/overview-math.ts`, `client/src/components/payments/overview/overview-math.test.ts`
- Create: `client/src/components/payments/overview/queries.ts`
- Create: `client/src/components/payments/overview/block-state.tsx`
- Create: `client/src/components/shared/month-stepper.tsx`
- Create: `client/src/components/payments/overview/month-charges-card.tsx`, `client/src/components/payments/overview/debt-cards.tsx`
- Move + modify: `client/src/components/payments/recent-payments-table.tsx` → `client/src/components/payments/overview/recent-payments.tsx`
- Create: `client/src/components/payments/overview/overview-page.tsx`, `client/src/components/payments/overview/overview-page.test.ts`
- Modify: `client/src/app/(dashboard)/payments/overview/page.tsx`
- Modify: `client/src/lib/role-access.ts`, `client/src/lib/role-access.test.ts`
- Modify (import path only): `client/src/components/dashboard/dashboard-summary-types.ts:1`, `client/src/components/dashboard/home-money-cards.tsx:13`, `client/src/components/outreach/overdue-promises-banner.tsx:9`, `client/src/components/outreach/overdue-promises-banner.test.ts:5`, `client/src/components/payments/debt/debtors-view.tsx:34`, `client/src/components/payments/debt/debtors-view.test.ts:26`
- Modify (comment only): `client/src/components/dashboard/home-money-cards.test.ts:99`
- Delete: `client/src/components/payments/overview-client.tsx`, `payments-overview.tsx`, `payments-overview.test.ts`, `kpi-chart-dialog.tsx`, `income-attribution-panel.tsx`, `income-attribution-panel.test.ts`, `profit-composition-panel.tsx`, `profit-composition-rows.tsx`, `profit-composition-text.ts`, `profit-composition-text.test.ts`, `expectation-history-dialog.tsx` (all under `client/src/components/payments/`)

**Interfaces:**
- Consumes: server shapes from Tasks 1–4 (`MonthCharges.unpaidStudents`, `DebtSplit.olderCount` / `byKind`, `income.yesterday`, `salary.computed`, `student.groups`).
- Produces:
  - `types.ts`: `MonthCharges`, `DebtKind`, `DebtSplit`, `FinancialOverview`, `IncomeAttribution`, `ProfitComposition`, `TrendRow` (the B1-new fields optional — an older server sends none).
  - `overview-math.ts`: `REPORT_FLOOR_MONTH = "2026-05"`, `MONTHLY_BILLING_START_MONTH = "2026-09"`, `FULL_TEACHER_PAY_MONTH = "2026-07"`, `isMonthlyBillingMonth(month)`, `clampMonth(raw, min, max)`, `monthRange(month) → { startDate, endDate }`, `dayMonth(date)`, `som(amount)`, `PAYMENT_METHOD_LABELS`, `ProfitLine`, `profitLines(c)`.
  - `queries.ts`: `OVERVIEW_QUERY_KEYS`, `useFinancialOverview(month)` with key `["financial-overview", branchId, month]`.
  - `block-state.tsx`: `BlockSkeleton({ className? })`, `BlockError({ title, onRetry })`.
  - `shared/month-stepper.tsx`: `MonthStepper({ value, min, max, onChange })`.
  - `overview-page.tsx`: `OverviewPage()`; `recent-payments.tsx`: `RecentPayments()` with key `["recent-payments", branchId]`.
  - `role-access.ts`: `FINANCIAL_OVERVIEW_ROLES = [1, 2]`.

- [ ] **Step 1: Write the failing pure-helper tests**

Create `client/src/components/payments/overview/overview-math.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  clampMonth,
  dayMonth,
  isMonthlyBillingMonth,
  monthRange,
  profitLines,
  som,
} from "./overview-math";

describe("clampMonth", () => {
  it("keeps a month inside the range", () => {
    expect(clampMonth("2026-08", "2026-05", "2026-10")).toBe("2026-08");
  });

  it("lifts a month before the floor and lowers one after the current month", () => {
    expect(clampMonth("2026-01", "2026-05", "2026-10")).toBe("2026-05");
    expect(clampMonth("2027-01", "2026-05", "2026-10")).toBe("2026-10");
  });

  it("reads anything unreadable as the current month", () => {
    for (const raw of ["", "2026-13", "oktabr", "2026-9"]) {
      expect(clampMonth(raw, "2026-05", "2026-10")).toBe("2026-10");
    }
  });
});

describe("monthRange", () => {
  it("is the month's first and last day", () => {
    expect(monthRange("2026-10")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-31" });
    expect(monthRange("2027-02")).toEqual({ startDate: "2027-02-01", endDate: "2027-02-28" });
  });
});

describe("isMonthlyBillingMonth", () => {
  it("starts with September 2026", () => {
    expect(isMonthlyBillingMonth("2026-08")).toBe(false);
    expect(isMonthlyBillingMonth("2026-09")).toBe(true);
  });
});

describe("dayMonth and som", () => {
  it('writes a day as "dd.MM"', () => {
    expect(dayMonth("2026-10-14")).toBe("14.10");
  });

  it("prints so'm after the number and «—» for a missing figure", () => {
    expect(som(1_500_000)).toBe(`${(1_500_000).toLocaleString("uz-UZ")} so'm`);
    expect(som(-500_000)).toBe(`${(-500_000).toLocaleString("uz-UZ")} so'm`);
    expect(som(null)).toBe("—");
    expect(som(undefined)).toBe("—");
  });
});

describe("profitLines", () => {
  const composition = {
    revenue: { total: 175_400_000 },
    withdrawals: { total: 1_200_000 },
    teachers: { total: 80_400_000 },
    staff: { total: 14_900_000 },
    expenses: { total: 13_800_000 },
    refunds: 500_000,
  };

  it("adds up to the net profit, in the dialog's order", () => {
    const lines = profitLines(composition);
    expect(lines.map((l) => l.label)).toEqual([
      "O'tilgan darslar puli",
      "Balansdan yechib olingan",
      "Ustozlar oyligi",
      "Xodimlar oyligi",
      "Boshqa xarajatlar",
      "Qaytarilgan pul",
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(
      175_400_000 + 1_200_000 - 80_400_000 - 14_900_000 - 13_800_000 - 500_000,
    );
  });

  it("leaves out withdrawals and refunds that are 0, or absent on an older server", () => {
    const zero = profitLines({ ...composition, withdrawals: { total: 0 }, refunds: 0 }).map((l) => l.label);
    expect(zero).toEqual(["O'tilgan darslar puli", "Ustozlar oyligi", "Xodimlar oyligi", "Boshqa xarajatlar"]);
    expect(profitLines({ ...composition, withdrawals: undefined }).map((l) => l.label)).not.toContain(
      "Balansdan yechib olingan",
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd client && npx vitest run src/components/payments/overview/overview-math.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the types and the helpers**

Create `client/src/components/payments/overview/types.ts`:

```ts
/**
 * The server shapes «Umumiy ma'lumotlar» reads. Fields that B1 added are
 * optional: the client goes live before the server (spec §7), and an older
 * server sends none of them — the page prints «—» or leaves the line out.
 */

/** «Hisoblandi / To'landi / Qoldi» — server `MonthCharges` (ADR-0058). */
export interface MonthCharges {
  month: string;
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: number;
  unpaidStudents?: number;
}

export interface DebtKind {
  total: number;
  count: number;
}

/**
 * «O'qiyotganlar qarzi» and «O'qimayotganlar qarzi» — server `DebtSplit`
 * (ADR-0059, ADR-0067). Two numbers that are never added: the first is the
 * debt of students in an active group (`currentMonth` — the part up to this
 * month's bill, `older` — the rest), the second everyone else's, in three
 * kinds.
 */
export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    currentMonth: number;
    older: number;
    olderCount?: number;
  };
  notStudying: {
    total: number;
    count: number;
    byKind?: { ungrouped: DebtKind; frozen: DebtKind; left: DebtKind };
  };
}

/** `GET /reports/financial-overview` — what the page reads (CEO/BD only). */
export interface FinancialOverview {
  income: {
    actual: number;
    paymentCount: number;
    byMethod: { method: string; amount: number; count: number }[];
    /** Yesterday's payments; only in the current month, null on the 1st. */
    yesterday?: { date: string; amount: number } | null;
  };
  /** Null for a month before monthly billing (2026-09). */
  monthCharges: MonthCharges | null;
  /** Today's debt — the month asked for does not change it. */
  debtSplit?: DebtSplit;
  salary: {
    /** `SalaryMonthlyService.getMonthly` for the month; null when it failed. */
    computed?: {
      month: string;
      hasLessonData: boolean;
      fullDeserved?: number;
      netToPay: number;
      advances: number;
      staff?: { monthly: number; advances: number; netToPay: number };
    } | null;
  };
}

/** `GET /reports/income-month-attribution` — the cash in three parts (ADR-0067). */
export interface IncomeAttribution {
  total: number;
  currentMonth: number;
  advance?: number;
  advanceStudents?: number;
  lateTotal: number;
  late: { monthKey: string; label: string; amount: number }[];
  payerCount: number;
  paymentCount?: number;
  latePaymentCount?: number;
  lateStudentCount?: number;
}

/** `GET /reports/profit-composition` — the lines the profit card and its dialog print. */
export interface ProfitComposition {
  month: string;
  netProfit: number;
  revenue: { total: number };
  withdrawals?: { total: number };
  teachers: { total: number };
  staff: { total: number };
  expenses: { total: number };
  refunds: number;
  /** A running month only. */
  forecast: { expectedNetProfit: number } | null;
}

/** One `GET /reports/financial-trend` row; `kassa` — the canonical profit could not be computed. */
export interface TrendRow {
  monthKey: string;
  income: number;
  profit: number;
  profitBasis: "kanonik" | "kassa";
}
```

Create `client/src/components/payments/overview/overview-math.ts`:

```ts
import { formatPrice } from "@/lib/format-utils";
import type { ProfitComposition } from "./types";

/** Nothing is reported before this month (the company's first month in the system). */
export const REPORT_FLOOR_MONTH = "2026-05";
/** Monthly billing starts here (server `MONTHLY_BILLING_START_MONTH`, ADR-0058). */
export const MONTHLY_BILLING_START_MONTH = "2026-09";
/** Teacher pay is the full deserved figure from here (server `TOPUP_EFFECTIVE_MONTH`). */
export const FULL_TEACHER_PAY_MONTH = "2026-07";

export function isMonthlyBillingMonth(month: string): boolean {
  return month >= MONTHLY_BILLING_START_MONTH;
}

/** A `YYYY-MM` from the URL kept inside [min, max]; anything unreadable is `max`. */
export function clampMonth(raw: string, min: string, max: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return max;
  if (raw < min) return min;
  return raw > max ? max : raw;
}

/** The month as the period the server reads: its first and last day. */
export function monthRange(month: string): { startDate: string; endDate: string } {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is this month's last day — calendar arithmetic, no clock.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startDate: `${month}-01`, endDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

/** "2026-10-14" → "14.10". */
export function dayMonth(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`;
}

/** "1 500 000 so'm"; a missing figure is «—». */
export function som(amount: number | null | undefined): string {
  return amount == null ? "—" : `${formatPrice(amount)} so'm`;
}

/** A payment method's name, never the stored value. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

export interface ProfitLine {
  label: string;
  amount: number;
}

/**
 * «Qanday hisoblandi» as one equation, in order: signed lines that add up to
 * the composition's `netProfit` (the server builds the figure from the same
 * legs). Withdrawals and refunds appear only when they are not 0.
 */
export function profitLines(
  c: Pick<ProfitComposition, "revenue" | "withdrawals" | "teachers" | "staff" | "expenses" | "refunds">,
): ProfitLine[] {
  const withdrawn = c.withdrawals?.total ?? 0;
  return [
    { label: "O'tilgan darslar puli", amount: c.revenue.total },
    ...(withdrawn !== 0 ? [{ label: "Balansdan yechib olingan", amount: withdrawn }] : []),
    { label: "Ustozlar oyligi", amount: -c.teachers.total },
    { label: "Xodimlar oyligi", amount: -c.staff.total },
    { label: "Boshqa xarajatlar", amount: -c.expenses.total },
    ...(c.refunds !== 0 ? [{ label: "Qaytarilgan pul", amount: -c.refunds }] : []),
  ];
}
```

- [ ] **Step 4: Run the helper tests**

Run: `cd client && npx vitest run src/components/payments/overview/overview-math.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the role constant and its test**

In `client/src/lib/role-access.ts`, after `COMPANY_EDIT_ROLES`, add:

```ts
/**
 * `GET /reports/financial-overview` — reports.controller.ts. Faqat CEO va
 * filial direktori (ADR-0067): Administrator va kassir «Umumiy ma'lumotlar»da
 * faqat «To'lov qayd qilish» va oxirgi to'lovlarni ko'radi.
 */
export const FINANCIAL_OVERVIEW_ROLES = [1, 2];
```

In `client/src/lib/role-access.test.ts`, add `FINANCIAL_OVERVIEW_ROLES,` to the import and append:

```ts
describe("Umumiy ma'lumotlar — GET /reports/financial-overview (reports.controller.ts)", () => {
  it("faqat CEO va filial direktori", () => {
    expect(hasAnyRole(roles(CEO), FINANCIAL_OVERVIEW_ROLES)).toBe(true);
    expect(hasAnyRole(roles(BRANCH_DIRECTOR), FINANCIAL_OVERVIEW_ROLES)).toBe(true);
    expect(hasAnyRole(roles(ADMINISTRATOR), FINANCIAL_OVERVIEW_ROLES)).toBe(false);
    expect(hasAnyRole(roles(CASHIER), FINANCIAL_OVERVIEW_ROLES)).toBe(false);
  });
});
```

Run: `cd client && npx vitest run src/lib/role-access.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing page test**

Create `client/src/components/payments/overview/overview-page.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Which month the URL asks for and who is signed in.
const env = vi.hoisted(() => ({ search: "", roleIds: [1] as number[] }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/overview",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(env.search),
}));

// A zustand store renders its INITIAL state on the server, so the signed-in
// user comes from the module itself.
vi.mock("@/hooks/use-auth", () => {
  const state = () => ({
    user: { roles: env.roleIds.map((id) => ({ id, name: String(id) })) },
  });
  const useAuth = Object.assign(
    (select: (s: ReturnType<typeof state>) => unknown) => select(state()),
    { getState: state, setState: () => {}, subscribe: () => () => {} },
  );
  return { useAuth };
});

import { TooltipProvider } from "@/components/ui/tooltip";
import { OverviewPage } from "./overview-page";
import type { DebtSplit, FinancialOverview, MonthCharges } from "./types";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);
const pct = (n: number) => norm(`${n.toLocaleString("uz-UZ")}%`);

const OCTOBER: MonthCharges = {
  month: "2026-10",
  charged: 177_000_000,
  paid: 135_900_000,
  unpaid: 41_100_000,
  paidPct: 76.8,
  students: 479,
  unpaidStudents: 237,
};

// The not-studying kinds add up to the total and the count; no figure here is
// the sum of the two debts, which the page must never print.
const SPLIT: DebtSplit = {
  studying: { total: 43_500_000, count: 300, currentMonth: 41_100_000, older: 2_400_000, olderCount: 13 },
  notStudying: {
    total: 57_100_000,
    count: 327,
    byKind: {
      ungrouped: { total: 21_300_000, count: 128 },
      frozen: { total: 19_800_000, count: 99 },
      left: { total: 16_000_000, count: 100 },
    },
  },
};

const overview = (monthCharges: MonthCharges | null, debtSplit: DebtSplit = SPLIT): FinancialOverview => ({
  income: { actual: 182_700_000, paymentCount: 612, byMethod: [], yesterday: { date: "2026-10-14", amount: 2_200_000 } },
  monthCharges,
  debtSplit,
  salary: { computed: null },
});

const PAYMENTS = {
  data: [
    {
      id: "p1",
      amount: 450_000,
      method: "CASH",
      createdAt: "2026-10-15T04:00:00.000Z",
      student: { id: 10501, firstName: "Ali", lastName: "Valiyev", groups: [{ id: "g1", name: "A1-07" }, { id: "g2", name: "B1-02" }] },
      receivedBy: null,
    },
    {
      id: "p2",
      amount: 300_000,
      method: "CLICK",
      createdAt: "2026-10-15T03:00:00.000Z",
      student: { id: 10502, firstName: "Vali", lastName: "Aliyev", groups: [] },
      receivedBy: null,
    },
  ],
  total: 2,
};

function render(opts: { search?: string; roleIds?: number[]; seed?: (client: QueryClient) => void } = {}) {
  env.search = opts.search ?? "";
  env.roleIds = opts.roleIds ?? [1];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  opts.seed?.(client);
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(TooltipProvider, null, createElement(OverviewPage))),
  );
  return { html, text: norm(html), client };
}

// No branch is selected in a bare store, so the branch part of every key is undefined.
const seedMonth = (month: string, answer: FinancialOverview) => (client: QueryClient) => {
  client.setQueryData(["financial-overview", undefined, month], answer);
  client.setQueryData(["recent-payments", undefined], PAYMENTS);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T07:00:00Z")); // 15.10.2026 12:00 in Tashkent
});
afterEach(() => vi.useRealTimers());

describe("OverviewPage — the current month (CEO)", () => {
  it("shows the month's charges with the student counts, and who has not paid", () => {
    const { text, html } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).toContain("Umumiy ma'lumotlar");
    expect(html).toContain('data-tour="payment-record"');
    expect(text).toContain("Oktabr oyi to'lovlari");
    expect(text).toContain(`Hisoblandi ${money(177_000_000)} ${num(479)} o'quvchiga`);
    expect(text).toContain(`To'landi ${money(135_900_000)} ${pct(76.8)}`);
    expect(text).toContain(`Qoldi ${money(41_100_000)} ${num(237)} o'quvchi to'lamagan`);
    expect(html).toContain('href="/payments/debt"');
    expect(text).toContain("Kim to'lamagan →");
  });

  it("shows today's debt as two numbers with the three not-studying kinds, never added", () => {
    const { text } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).toContain(`Eski qarz — o'qiyotganlar ${money(2_400_000)} ${num(13)} o'quvchi · o'tgan oylardan qolgan`);
    expect(text).toContain(`O'qimayotganlar qarzi ${money(57_100_000)} ${num(327)} kishi · undirish ishi`);
    expect(text).toContain(`guruhsiz · ${num(128)} ${money(21_300_000)}`);
    expect(text).toContain(`muzlatilgan · ${num(99)} ${money(19_800_000)}`);
    expect(text).toContain(`ketgan · ${num(100)} ${money(16_000_000)}`);
    expect(text).not.toContain(num(2_400_000 + 57_100_000));
    expect(text).not.toContain(num(43_500_000 + 57_100_000));
  });

  it("lists the recent payments with each student's groups now, «—» without one", () => {
    const { text } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).toContain("Oxirgi to'lovlar");
    expect(text).toContain("#10501 Ali Valiyev A1-07, B1-02");
    expect(text).toContain("#10502 Vali Aliyev —");
  });

  it("prints no English abbreviation and no Cyrillic", () => {
    const { text } = render({ seed: seedMonth("2026-10", overview(OCTOBER)) });

    expect(text).not.toMatch(/\b(LTV|CAC|ROI)\b/);
    expect(text).not.toMatch(/[Ѐ-ӿ]/);
  });

  it("against a server older than B1 leaves the new counts out instead of printing them wrong", () => {
    const oldCharges: MonthCharges = { month: "2026-10", charged: 177_000_000, paid: 135_900_000, unpaid: 41_100_000, paidPct: 76.8, students: 479 };
    const oldSplit: DebtSplit = {
      studying: { total: 43_500_000, count: 300, currentMonth: 41_100_000, older: 2_400_000 },
      notStudying: { total: 57_100_000, count: 327 },
    };
    const { text } = render({ seed: seedMonth("2026-10", overview(oldCharges, oldSplit)) });

    expect(text).toContain(`Qoldi ${money(41_100_000)}`);
    expect(text).not.toContain("o'quvchi to'lamagan");
    expect(text).toContain(`Eski qarz — o'qiyotganlar ${money(2_400_000)}`);
    expect(text).not.toContain("o'tgan oylardan qolgan");
    expect(text).not.toContain("guruhsiz");
    expect(text).not.toMatch(/undefined|NaN/);
  });

  it("a failed request blanks the money blocks, not the page", () => {
    const { text } = render({
      seed: (client) => {
        client
          .getQueryCache()
          .build(client, { queryKey: ["financial-overview", undefined, "2026-10"] })
          .setState({ status: "error", error: new Error("boom") });
        client.setQueryData(["recent-payments", undefined], PAYMENTS);
      },
    });

    expect(text).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(text).toContain("Qayta urinish");
    expect(text).not.toContain("Hisoblandi");
    expect(text).toContain("#10501 Ali Valiyev");
  });
});

describe("OverviewPage — a past month", () => {
  it("keeps the month's charges but hides today's debt, the collect link and the recent payments", () => {
    const { text } = render({ search: "month=2026-09", seed: seedMonth("2026-09", overview({ ...OCTOBER, month: "2026-09" })) });

    expect(text).toContain("Sentabr oyi to'lovlari");
    expect(text).not.toContain("Kim to'lamagan");
    expect(text).not.toContain("Eski qarz — o'qiyotganlar");
    expect(text).not.toContain("Oxirgi to'lovlar");
  });

  it("a month before monthly billing says it was the 12-lesson system", () => {
    const { text } = render({ search: "month=2026-08", seed: seedMonth("2026-08", overview(null)) });

    expect(text).toContain("Avgust — 12 talik tizim: oylik hisob yo'q");
    expect(text).not.toContain("Hisoblandi");
  });

  it("reads a month outside the picker's range as the nearest one it allows", () => {
    const { text } = render({ search: "month=2025-12", seed: seedMonth("2026-05", overview(null)) });

    expect(text).toContain("May — 12 talik tizim: oylik hisob yo'q");
  });
});

describe("OverviewPage — Administrator and Cashier", () => {
  it.each([[3], [5]])("role %i sees the title, «To'lov qayd qilish» and the recent payments — and the page asks for no money figure", (role) => {
    const { text, html, client } = render({
      roleIds: [role],
      seed: (c) => c.setQueryData(["recent-payments", undefined], PAYMENTS),
    });

    expect(text).toContain("Umumiy ma'lumotlar");
    expect(text).toContain("To'lov qayd qilish");
    expect(text).toContain("#10501 Ali Valiyev");
    expect(html).not.toContain('aria-label="Oldingi oy"'); // no month picker
    expect(text).not.toContain("to'lovlari");
    expect(client.getQueryCache().findAll({ queryKey: ["financial-overview"] })).toHaveLength(0);
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `cd client && npx vitest run src/components/payments/overview/overview-page.test.ts`
Expected: FAIL — `./overview-page` not found.

- [ ] **Step 8: Write the shared pieces**

Create `client/src/components/payments/overview/queries.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { monthRange } from "./overview-math";
import type { FinancialOverview } from "./types";

/**
 * The first element of every query key the page reads; a recorded payment
 * refreshes all of them. «financial-overview» keeps its name: the payment,
 * refund, withdrawal, expense and debtor dialogs elsewhere invalidate it.
 */
export const OVERVIEW_QUERY_KEYS = ["financial-overview", "recent-payments"] as const;

export function useBranchId(): number | undefined {
  return useBranchSwitcher().selectedBranch?.id;
}

/** Month charges, today's debt, yesterday's cash and the month's salary (CEO/BD). */
export function useFinancialOverview(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["financial-overview", branchId, month],
    queryFn: () =>
      api
        .get<FinancialOverview>("/reports/financial-overview", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}
```

Create `client/src/components/payments/overview/block-state.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** A block's place while its request runs. */
export function BlockSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-36 rounded-xl", className)} />;
}

/** A block whose request failed: its title, what happened and a retry. The rest of the page stays. */
export function BlockError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Qayta urinish
      </Button>
    </div>
  );
}
```

Create `client/src/components/shared/month-stepper.tsx`:

```tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { addMonths } from "@/components/payments/salary-utils";

/** «‹ Oktabr 2026 ›» — the month picker with a step either side, kept inside [min, max]. */
export function MonthStepper({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (month: string) => void;
}) {
  const prev = addMonths(value, -1);
  const next = addMonths(value, 1);
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" aria-label="Oldingi oy" disabled={prev < min} onClick={() => onChange(prev)}>
        <ChevronLeft className="size-4" />
      </Button>
      <MonthPicker value={value} minMonth={min} maxMonth={max} onChange={onChange} className="w-44" />
      <Button variant="outline" size="icon" aria-label="Keyingi oy" disabled={next > max} onClick={() => onChange(next)}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 9: Write blocks 1 and 2**

Create `client/src/components/payments/overview/month-charges-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { formatNumber, formatPercent } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthShort } from "@/components/payments/salary-utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { isMonthlyBillingMonth, som } from "./overview-math";
import { useFinancialOverview } from "./queries";

/**
 * Block 1 — «{Oy} oyi to'lovlari» (ADR-0058). Every figure is the server's
 * `monthCharges`; a month before monthly billing has none and says so.
 */
export function MonthChargesCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const overview = useFinancialOverview(month);
  const title = `${monthShort(month)} oyi to'lovlari`;
  if (!isMonthlyBillingMonth(month)) {
    return (
      <p className="text-sm text-muted-foreground">
        {monthShort(month)} — 12 talik tizim: oylik hisob yo&apos;q
      </p>
    );
  }
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title={title} onRetry={() => overview.refetch()} />;
  const c = overview.data.monthCharges;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <p className="font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Hisoblandi" value={som(c?.charged)} sub={c ? `${formatNumber(c.students)} o'quvchiga` : null} />
        <Figure
          label="To'landi"
          value={som(c?.paid)}
          sub={c ? (c.paidPct === null ? "hisob yozilmagan" : formatPercent(c.paidPct)) : null}
          tone="text-green-600 dark:text-green-400"
        />
        <Figure
          label="Qoldi"
          value={som(c?.unpaid)}
          sub={c?.unpaidStudents != null ? `${formatNumber(c.unpaidStudents)} o'quvchi to'lamagan` : null}
          tone={c && c.unpaid > 0 ? "text-red-600 dark:text-red-400" : undefined}
        />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(c?.paidPct ?? 0, 100)}%` }} />
      </div>
      {isCurrent && (
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Kim to&apos;lamagan →
        </Link>
      )}
    </div>
  );
}

function Figure({ label, value, sub, tone }: { label: string; value: string; sub: string | null; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
```

Create `client/src/components/payments/overview/debt-cards.tsx`:

```tsx
"use client";

import Link from "next/link";
import { formatNumber } from "@/lib/format-utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

const KINDS = [
  ["ungrouped", "guruhsiz"],
  ["frozen", "muzlatilgan"],
  ["left", "ketgan"],
] as const;

/**
 * Block 2 — today's debt as two numbers that are never added (ADR-0059): the
 * studying debtors' «eski qarz» and the not-studying debt in its three kinds
 * (ADR-0067). Current month only: it is today's state.
 */
export function DebtCards({ month }: { month: string }) {
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title="Qarzdorlik" onRetry={() => overview.refetch()} />;
  const split = overview.data.debtSplit;
  const byKind = split?.notStudying.byKind;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">Eski qarz — o&apos;qiyotganlar</p>
        <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{som(split?.studying.older)}</p>
        {split?.studying.olderCount != null && (
          <p className="text-xs text-muted-foreground">
            {formatNumber(split.studying.olderCount)} o&apos;quvchi · o&apos;tgan oylardan qolgan
          </p>
        )}
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Ro&apos;yxat →
        </Link>
      </div>
      <div className="space-y-1 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">O&apos;qimayotganlar qarzi</p>
        <p className="text-2xl font-bold tabular-nums">{som(split?.notStudying.total)}</p>
        {split && (
          <p className="text-xs text-muted-foreground">{formatNumber(split.notStudying.count)} kishi · undirish ishi</p>
        )}
        {byKind && (
          <ul className="space-y-0.5 pt-1 text-sm">
            {KINDS.map(([key, label]) => (
              <li key={key} className="flex justify-between gap-2">
                <span className="text-muted-foreground">
                  {label} · {formatNumber(byKind[key].count)}
                </span>
                <span className="tabular-nums">{som(byKind[key].total)}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/payments/debt" className="text-sm font-medium text-primary hover:underline">
          Undirish ro&apos;yxati →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Move the recent payments table and add «Guruh»**

```bash
git mv client/src/components/payments/recent-payments-table.tsx client/src/components/payments/overview/recent-payments.tsx
```

Replace the content of `client/src/components/payments/overview/recent-payments.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { BlockError } from "./block-state";
import { PAYMENT_METHOD_LABELS, som } from "./overview-math";
import { useBranchId } from "./queries";

interface Payment {
  id: string;
  amount: number;
  method: string;
  createdAt: string;
  /** `groups` — the student's groups now; absent on a server older than B1. */
  student: { id: number; firstName: string; lastName: string; groups?: { id: string; name: string }[] };
  receivedBy: { id: number; firstName: string; lastName: string } | null;
}

const methodColors: Record<string, string> = {
  CASH: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  PAYME: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  CLICK: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  UZUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  TRANSFER: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

/**
 * Block 5 — «Oxirgi to'lovlar»: the ten latest payments in the branch scope.
 * «Guruh» is the student's group NOW, not a property of the payment.
 */
export function RecentPayments() {
  const branchId = useBranchId();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["recent-payments", branchId],
    queryFn: () =>
      api
        .get<{ data: Payment[]; total: number }>("/payments", { params: { branchId, pageSize: 10, page: 1 } })
        .then((r) => r.data),
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }
  if (isError) return <BlockError title="Oxirgi to'lovlar" onRetry={() => refetch()} />;

  const payments = data.data;
  if (payments.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Hali to&apos;lov qayd qilinmagan</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>O&apos;quvchi</TableHead>
          <TableHead>Guruh</TableHead>
          <TableHead>Summa</TableHead>
          <TableHead>Usul</TableHead>
          <TableHead>Qabul qildi</TableHead>
          <TableHead>Sana</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p, i) => (
          <TableRow key={p.id}>
            <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">
              <Link
                href={`/students/profile/${p.student.id}`}
                className="transition-colors hover:text-primary hover:underline"
              >
                #{p.student.id} {p.student.firstName} {p.student.lastName}
              </Link>
            </TableCell>
            <TableCell className="text-sm">
              {p.student.groups?.length ? p.student.groups.map((g) => g.name).join(", ") : "—"}
            </TableCell>
            <TableCell className="font-medium text-green-600">+{som(p.amount)}</TableCell>
            <TableCell>
              <Badge variant="secondary" className={methodColors[p.method]}>
                {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(p.createdAt), "dd.MM.yyyy, HH:mm")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 11: Write the page and switch the route**

Create `client/src/components/payments/overview/overview-page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { ExportOptionsPopover } from "@/components/payments/export-options-popover";
import { RecordPaymentDialog } from "@/components/payments/record-payment-dialog";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { useAuth } from "@/hooks/use-auth";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { FINANCIAL_OVERVIEW_ROLES, hasAnyRole } from "@/lib/role-access";
import { DebtCards } from "./debt-cards";
import { MonthChargesCard } from "./month-charges-card";
import { REPORT_FLOOR_MONTH, clampMonth, monthRange } from "./overview-math";
import { OVERVIEW_QUERY_KEYS } from "./queries";
import { RecentPayments } from "./recent-payments";

const FILTERS = { month: { type: "string" as const, defaultValue: "" } };

/**
 * «Umumiy ma'lumotlar» (spec B1 §2). CEO and Branch Director get the month
 * picker and the money blocks; Administrator and Cashier get the title,
 * «To'lov qayd qilish» and the recent payments, and the page never asks the
 * money endpoint for them — it is CEO/BD on the server (ADR-0067).
 */
export function OverviewPage() {
  const user = useAuth((s) => s.user);
  const canSeeMoney = hasAnyRole(user?.roles, FINANCIAL_OVERVIEW_ROLES);
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, REPORT_FLOOR_MONTH, current);
  const isCurrent = month === current;
  const range = monthRange(month);

  // A payment changes every block: refresh them all.
  const refreshAll = () => {
    for (const key of OVERVIEW_QUERY_KEYS) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Umumiy ma&apos;lumotlar</h2>
        <div className="flex flex-wrap items-center gap-2">
          {canSeeMoney && (
            <>
              <MonthStepper
                value={month}
                min={REPORT_FLOOR_MONTH}
                max={current}
                onChange={(m) => setFilter("month", m === current ? "" : m)}
              />
              <ExportOptionsPopover startStr={range.startDate} endStr={range.endDate} />
            </>
          )}
          <Button data-tour="payment-record" onClick={() => setRecording(true)}>
            <Plus className="mr-2 size-4" />
            To&apos;lov qayd qilish
          </Button>
        </div>
      </div>

      {canSeeMoney && (
        <>
          <MonthChargesCard month={month} isCurrent={isCurrent} />
          {isCurrent && <DebtCards month={month} />}
        </>
      )}

      {(isCurrent || !canSeeMoney) && (
        <section className="space-y-3">
          <h3 className="font-heading text-base font-semibold">Oxirgi to&apos;lovlar</h3>
          <RecentPayments />
        </section>
      )}

      <RecordPaymentDialog open={recording} onOpenChange={setRecording} onSuccess={refreshAll} />
    </div>
  );
}
```

Replace `client/src/app/(dashboard)/payments/overview/page.tsx` with:

```tsx
import { Suspense } from "react";
import { OverviewPage } from "@/components/payments/overview/overview-page";

export default function PaymentsOverviewPage() {
  // The page reads its month from the URL (useSearchParams), which needs a
  // Suspense boundary to prerender.
  return (
    <Suspense fallback={null}>
      <OverviewPage />
    </Suspense>
  );
}
```

- [ ] **Step 12: Move the type imports and delete the old overview**

In each of these six files change the import source of `DebtSplit` to the new types file:
- `client/src/components/dashboard/dashboard-summary-types.ts`, `client/src/components/dashboard/home-money-cards.tsx`, `client/src/components/outreach/overdue-promises-banner.tsx`, `client/src/components/outreach/overdue-promises-banner.test.ts`: `import type { DebtSplit } from "@/components/payments/overview/types";`
- `client/src/components/payments/debt/debtors-view.tsx`, `client/src/components/payments/debt/debtors-view.test.ts`: `import type { DebtSplit } from "../overview/types";`

In `client/src/components/dashboard/home-money-cards.test.ts`, the comment `// The drill-down says the same words (income-attribution-panel.test.ts):` names a file this step deletes; make it `// The overview's month card says the same words (overview/month-charges-card.tsx):`.

Then delete the old overview:

```bash
git rm client/src/components/payments/overview-client.tsx client/src/components/payments/payments-overview.tsx client/src/components/payments/payments-overview.test.ts client/src/components/payments/kpi-chart-dialog.tsx client/src/components/payments/income-attribution-panel.tsx client/src/components/payments/income-attribution-panel.test.ts client/src/components/payments/profit-composition-panel.tsx client/src/components/payments/profit-composition-rows.tsx client/src/components/payments/profit-composition-text.ts client/src/components/payments/profit-composition-text.test.ts client/src/components/payments/expectation-history-dialog.tsx
grep -rn "payments-overview\|kpi-chart-dialog\|income-attribution-panel\|profit-composition-panel\|profit-composition-rows\|profit-composition-text\|expectation-history-dialog\|overview-client\|recent-payments-table" client/src
```
Expected: the grep prints nothing.

- [ ] **Step 13: Run the tests, type-check and lint**

```bash
cd client && npx vitest run src/components/payments src/components/dashboard src/components/outreach src/lib
cd client && npx tsc --noEmit -p .
cd client && npm run lint 2>&1 | tail -5
```
Expected: all PASS; tsc clean; the lint summary line shows 0 errors.

- [ ] **Step 14: Commit**

```bash
git add client/src/components/payments/overview client/src/components/shared/month-stepper.tsx "client/src/app/(dashboard)/payments/overview/page.tsx" client/src/lib/role-access.ts client/src/lib/role-access.test.ts client/src/components/dashboard/dashboard-summary-types.ts client/src/components/dashboard/home-money-cards.tsx client/src/components/dashboard/home-money-cards.test.ts client/src/components/outreach/overdue-promises-banner.tsx client/src/components/outreach/overdue-promises-banner.test.ts client/src/components/payments/debt/debtors-view.tsx client/src/components/payments/debt/debtors-view.test.ts
git commit -m "feat(client): rebuild the overview page — month picker, month charges, debt, recent payments

One component per block with its own query, skeleton and error state.
CEO/BD get the month picker (?month=), month charges and today's debt;
Administrator and Cashier get payment recording and the recent payments
only, with no financial-overview request. The 8-card grid, the KPI
chart dialog, the income/profit panels and the history dialog go.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Cash, salary and profit cards, the months table, and the two dialogs

**Files:**
- Modify: `client/src/components/payments/overview/queries.ts`, `client/src/components/payments/overview/block-state.tsx`, `client/src/components/payments/overview/overview-page.tsx`
- Create: `client/src/components/payments/overview/cash-card.tsx`, `income-dialog.tsx`, `salary-card.tsx`, `profit-card.tsx`, `profit-dialog.tsx`, `months-table.tsx`
- Create: `client/src/components/payments/overview/overview-blocks.test.ts`

**Interfaces:**
- Consumes: Task 7's `types.ts`, `overview-math.ts` (`som`, `dayMonth`, `profitLines`, `isMonthlyBillingMonth`, `FULL_TEACHER_PAY_MONTH`, `PAYMENT_METHOD_LABELS`), `useFinancialOverview`, `useBranchId`, `BlockSkeleton`, `BlockError`.
- Produces:
  - `queries.ts`: `useIncomeAttribution(month)` key `["income-month-attribution", branchId, month]`, `useProfitComposition(month)` key `["profit-composition", branchId, month]`, `useFinancialTrend(month)` key `["financial-trend", branchId, month]`; `OVERVIEW_QUERY_KEYS` gains the three.
  - `block-state.tsx`: `MoneyRow({ label, value })`.
  - `CashCard`, `SalaryCard`, `ProfitCard({ month, isCurrent })`; `MonthsTable({ month, current })`.
  - `income-dialog.tsx`: `IncomeDialog`, `IncomeBreakdown({ month, data, byMethod })`, `incomeSummary(data)`.
  - `profit-dialog.tsx`: `ProfitDialog`, `ProfitBreakdown({ month, composition })`.

- [ ] **Step 1: Write the failing block tests**

Create `client/src/components/payments/overview/overview-blocks.test.ts`:

```ts
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/overview",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CashCard } from "./cash-card";
import { IncomeBreakdown, incomeSummary } from "./income-dialog";
import { MonthsTable } from "./months-table";
import { ProfitBreakdown } from "./profit-dialog";
import { ProfitCard } from "./profit-card";
import { SalaryCard } from "./salary-card";
import type { FinancialOverview, IncomeAttribution, ProfitComposition, TrendRow } from "./types";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

/** The amount printed right after `label`, as a number. */
function amountAfter(text: string, label: string): number {
  const m = text.match(new RegExp(`${label} (-?[\\d ]+) so'm`));
  if (!m) throw new Error(`no amount after «${label}»`);
  return Number(m[1].replace(/ /g, ""));
}

// 150.4 + 15.6 + 16.7 = 182.7 (mln); the late months add up to the late part.
const ATTRIBUTION: IncomeAttribution = {
  total: 182_700_000,
  currentMonth: 150_400_000,
  advance: 15_600_000,
  advanceStudents: 31,
  lateTotal: 16_700_000,
  late: [
    { monthKey: "2026-09", label: "Sentabr 2026", amount: 12_100_000 },
    { monthKey: "2026-08", label: "Avgust 2026", amount: 4_600_000 },
  ],
  payerCount: 409,
  paymentCount: 612,
  latePaymentCount: 58,
  lateStudentCount: 41,
};

const OVERVIEW: FinancialOverview = {
  income: {
    actual: 182_700_000,
    paymentCount: 612,
    byMethod: [
      { method: "CASH", amount: 120_000_000, count: 400 },
      { method: "CLICK", amount: 62_700_000, count: 212 },
    ],
    yesterday: { date: "2026-10-14", amount: 2_200_000 },
  },
  monthCharges: null,
  salary: {
    computed: {
      month: "2026-10",
      hasLessonData: true,
      fullDeserved: 80_400_000,
      netToPay: 66_600_000,
      advances: 13_800_000,
      staff: { monthly: 14_900_000, advances: 0, netToPay: 14_900_000 },
    },
  },
};

// 175.4 − 80.4 − 14.9 − 12.6 − 0.5 = 67.0 (mln).
const COMPOSITION: ProfitComposition = {
  month: "2026-10",
  netProfit: 67_000_000,
  revenue: { total: 175_400_000 },
  withdrawals: { total: 0 },
  teachers: { total: 80_400_000 },
  staff: { total: 14_900_000 },
  expenses: { total: 12_600_000 },
  refunds: 500_000,
  forecast: { expectedNetProfit: 58_000_000 },
};

function render(element: ReactElement, seed: (client: QueryClient) => void = () => {}): string {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  seed(client);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, element)));
}

const seedMonth =
  (month: string, overview: FinancialOverview = OVERVIEW, composition: ProfitComposition = COMPOSITION) =>
  (client: QueryClient) => {
    client.setQueryData(["financial-overview", undefined, month], overview);
    client.setQueryData(["income-month-attribution", undefined, month], ATTRIBUTION);
    client.setQueryData(["profit-composition", undefined, month], composition);
  };

describe("CashCard", () => {
  it("prints the month's cash, the old-debt part and yesterday in the current month", () => {
    const text = render(createElement(CashCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Kassaga tushdi ${money(182_700_000)}`);
    expect(text).toContain(`shundan eski qarzlardan ${money(16_700_000)}`);
    expect(text).toContain(`kecha (14.10) ${money(2_200_000)}`);
    expect(text).toContain("Qayerdan keldi →");
  });

  it("a past month has no «kecha», and no old debt leaves its line out", () => {
    const text = render(createElement(CashCard, { month: "2026-09", isCurrent: false }), (client) => {
      seedMonth("2026-09")(client);
      client.setQueryData(["income-month-attribution", undefined, "2026-09"], { ...ATTRIBUTION, lateTotal: 0, late: [] });
    });

    expect(text).not.toContain("kecha");
    expect(text).not.toContain("shundan eski qarzlardan");
  });
});

describe("«Qayerdan keldi»", () => {
  it("prints the three parts and they add up to the cash", () => {
    const text = render(createElement(IncomeBreakdown, { month: "2026-10", data: ATTRIBUTION, byMethod: OVERVIEW.income.byMethod }));

    expect(text).toContain(`Oktabr oyi to'lovi ${money(150_400_000)}`);
    expect(text).toContain(`Noyabr uchun oldindan ${money(15_600_000)} 31 o'quvchining balansida turibdi`);
    expect(text).toContain(`Eski qarzlar uchun ${money(16_700_000)} 58 ta to'lov, 41 o'quvchi`);
    expect(text).toContain(`Sentabr 2026 qarzi ${money(12_100_000)}`);
    expect(text).toContain(`Avgust 2026 qarzi ${money(4_600_000)}`);
    expect(
      amountAfter(text, "Oktabr oyi to'lovi") + amountAfter(text, "Noyabr uchun oldindan") + amountAfter(text, "Eski qarzlar uchun"),
    ).toBe(ATTRIBUTION.total);
    expect(text).toContain(`Qanday to'landi Naqd · ${money(120_000_000)} Click · ${money(62_700_000)}`);
  });

  it("leaves out a part that is 0", () => {
    const text = render(
      createElement(IncomeBreakdown, { month: "2026-10", data: { ...ATTRIBUTION, advance: 0, total: 167_100_000 }, byMethod: [] }),
    );

    expect(text).not.toContain("uchun oldindan");
    expect(text).not.toContain("Qanday to'landi");
  });

  it("the sub-line counts payments and students; an older server's missing count is left out", () => {
    expect(norm(incomeSummary(ATTRIBUTION))).toBe(`Jami ${money(182_700_000)} · 612 ta to'lov · 409 o'quvchi`);
    expect(norm(incomeSummary({ ...ATTRIBUTION, paymentCount: undefined }))).toBe(`Jami ${money(182_700_000)} · 409 o'quvchi`);
  });
});

describe("SalaryCard", () => {
  it("adds the teachers' full pay and the staff's monthly pay, with the advance and what is left to give", () => {
    const text = render(createElement(SalaryCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Oyliklar ${money(95_300_000)}`);
    expect(text).toContain(`ustozlar ${money(80_400_000)} · xodimlar ${money(14_900_000)}`);
    expect(text).toContain(`avans berilgan ${money(13_800_000)}`);
    expect(text).toContain(`oy oxirida beriladi ${money(81_500_000)}`);
    expect(text).not.toContain("o'tish oyi");
  });

  it("a past month says «avansdan keyin»", () => {
    const text = render(createElement(SalaryCard, { month: "2026-09", isCurrent: false }), seedMonth("2026-09"));

    expect(text).toContain(`avansdan keyin ${money(81_500_000)}`);
    expect(text).not.toContain("oy oxirida beriladi");
  });

  it("a month without per-lesson data shows «—» for the teachers and the total, and says «o'tish oyi»", () => {
    const may: FinancialOverview = {
      ...OVERVIEW,
      salary: {
        computed: {
          month: "2026-05",
          hasLessonData: false,
          fullDeserved: 0,
          netToPay: 52_000_000,
          advances: 3_000_000,
          staff: { monthly: 14_900_000, advances: 0, netToPay: 14_900_000 },
        },
      },
    };
    const text = render(createElement(SalaryCard, { month: "2026-05", isCurrent: false }), seedMonth("2026-05", may));

    expect(text).toContain(`Oyliklar — ustozlar — · xodimlar ${money(14_900_000)}`);
    expect(text).toContain("o'tish oyi");
  });
});

describe("ProfitCard", () => {
  it("prints the profit with the lines it comes from, and they add up", () => {
    const text = render(createElement(ProfitCard, { month: "2026-10", isCurrent: true }), seedMonth("2026-10"));

    expect(text).toContain(`Foyda ${money(67_000_000)}`);
    expect(text).toContain(`darslar puli ${money(175_400_000)}`);
    expect(text).toContain(`chiqimlar ${money(-108_400_000)}`);
    expect(text).toContain(`oy oxiriga taxminan ${money(58_000_000)}`);
    expect(text).not.toContain("balansdan yechib olingan");
    expect(amountAfter(text, "darslar puli") + amountAfter(text, "chiqimlar")).toBe(amountAfter(text, "Foyda"));
  });

  it("shows a withdrawal when there is one, and no month-end estimate for a past month", () => {
    const withWithdrawal = { ...COMPOSITION, withdrawals: { total: 1_000_000 }, netProfit: 68_000_000 };
    const text = render(
      createElement(ProfitCard, { month: "2026-09", isCurrent: false }),
      seedMonth("2026-09", OVERVIEW, withWithdrawal),
    );

    expect(text).toContain(`balansdan yechib olingan ${money(1_000_000)}`);
    expect(text).not.toContain("oy oxiriga taxminan");
  });
});

describe("«Qanday hisoblandi»", () => {
  it("is one equation whose lines add up to the profit", () => {
    const text = render(createElement(ProfitBreakdown, { month: "2026-10", composition: COMPOSITION }));
    const lines = [
      "O'tilgan darslar puli",
      "Ustozlar oyligi",
      "Xodimlar oyligi",
      "Boshqa xarajatlar",
      "Qaytarilgan pul",
    ].map((label) => amountAfter(text, label));

    expect(lines.reduce((s, a) => s + a, 0)).toBe(amountAfter(text, "Foyda"));
    expect(text).not.toContain("Balansdan yechib olingan");
  });

  it("says the teacher pay matches the Ish haqi page from 2026-07 only", () => {
    const check = "Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil";
    expect(render(createElement(ProfitBreakdown, { month: "2026-07", composition: COMPOSITION }))).toContain(check);
    expect(render(createElement(ProfitBreakdown, { month: "2026-06", composition: COMPOSITION }))).not.toContain(check);
  });
});

describe("MonthsTable", () => {
  const TREND: TrendRow[] = [
    { monthKey: "2026-05", income: 160_000_000, profit: 20_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-08", income: 170_000_000, profit: 99_000_000, profitBasis: "kassa" },
    { monthKey: "2026-09", income: 175_000_000, profit: 60_000_000, profitBasis: "kanonik" },
    { monthKey: "2026-10", income: 182_700_000, profit: 67_000_000, profitBasis: "kanonik" },
  ];

  it("lists the months newest first with the canonical profit, «—» where it failed, and the notes", () => {
    const text = render(createElement(MonthsTable, { month: "2026-10", current: "2026-10" }), (client) =>
      client.setQueryData(["financial-trend", undefined, "2026-10"], TREND),
    );

    expect(text.indexOf("Oktabr 2026")).toBeLessThan(text.indexOf("Sentabr 2026"));
    expect(text).toContain(`Oktabr 2026 ${money(182_700_000)} ${money(67_000_000)} oy tugamagan`);
    expect(text).toContain(`Sentabr 2026 ${money(175_000_000)} ${money(60_000_000)}`);
    expect(text).toContain(`Avgust 2026 ${money(170_000_000)} — 12 talik tizim`);
    expect(text).not.toContain(money(99_000_000));
    expect(text).toContain(`May 2026 ${money(160_000_000)} ${money(20_000_000)} 12 talik tizim`);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd client && npx vitest run src/components/payments/overview/overview-blocks.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Extend the queries and the shared row**

In `client/src/components/payments/overview/queries.ts`: change `OVERVIEW_QUERY_KEYS` to

```ts
export const OVERVIEW_QUERY_KEYS = [
  "financial-overview",
  "income-month-attribution",
  "profit-composition",
  "financial-trend",
  "recent-payments",
] as const;
```

add `import { currentMonthKey } from "@/components/payments/salary-utils";`, extend the type import to `import type { FinancialOverview, IncomeAttribution, ProfitComposition, TrendRow } from "./types";`, and append:

```ts
/** «Kassaga tushdi» and its dialog — the month's cash in three parts. */
export function useIncomeAttribution(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["income-month-attribution", branchId, month],
    queryFn: () =>
      api
        .get<IncomeAttribution>("/reports/income-month-attribution", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
}

/** «Foyda» and «Qanday hisoblandi» — the canonical net profit and its legs. */
export function useProfitComposition(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["profit-composition", branchId, month],
    queryFn: () =>
      api
        .get<ProfitComposition>("/reports/profit-composition", {
          params: { branchId, ...monthRange(month) },
        })
        .then((r) => r.data),
  });
}

/** «Oylar bo'yicha» — six months ending at the month (oldest first from the server). */
export function useFinancialTrend(month: string) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["financial-trend", branchId, month],
    queryFn: () =>
      api
        .get<TrendRow[]>("/reports/financial-trend", {
          // The current month needs no anchor; leaving it out keeps the
          // default view working against a server that predates `?month=`.
          params: { branchId, ...(month !== currentMonthKey() && { month }) },
        })
        .then((r) => r.data),
  });
}
```

In `client/src/components/payments/overview/block-state.tsx`, append:

```tsx
/** One labelled figure inside a card: «avans berilgan … so'm». */
export function MoneyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 4: Write the «Qayerdan keldi» dialog and the cash card**

Create `client/src/components/payments/overview/income-dialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber } from "@/lib/format-utils";
import { addMonths, monthShort } from "@/components/payments/salary-utils";
import { PAYMENT_METHOD_LABELS, som } from "./overview-math";
import type { IncomeAttribution } from "./types";

type Method = { method: string; amount: number; count: number };

/** «Qayerdan keldi» (spec B1 §2.4): the month's cash in its three parts and the methods it came by. */
export function IncomeDialog({
  open,
  onOpenChange,
  month,
  data,
  byMethod,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  data: IncomeAttribution;
  byMethod: Method[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{monthShort(month)}da tushgan pul qayerdan keldi</DialogTitle>
          <DialogDescription>{incomeSummary(data)}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <IncomeBreakdown month={month} data={data} byMethod={byMethod} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Jami X · N ta to'lov · M o'quvchi»; a count an older server does not send is left out. */
export function incomeSummary(data: IncomeAttribution): string {
  return [
    `Jami ${som(data.total)}`,
    ...(data.paymentCount != null ? [`${formatNumber(data.paymentCount)} ta to'lov`] : []),
    `${formatNumber(data.payerCount)} o'quvchi`,
  ].join(" · ");
}

/**
 * The dialog's body: a bar in three colours, then the parts. A part that is 0
 * is not drawn. The parts are the server's and add up to `total` (ADR-0067).
 */
export function IncomeBreakdown({ month, data, byMethod }: { month: string; data: IncomeAttribution; byMethod: Method[] }) {
  const parts = [
    {
      key: "current",
      label: `${monthShort(month)} oyi to'lovi`,
      amount: data.currentMonth,
      colour: "bg-green-500",
      sub: null as string | null,
    },
    {
      key: "advance",
      label: `${monthShort(addMonths(month, 1))} uchun oldindan`,
      amount: data.advance ?? 0,
      colour: "bg-sky-500",
      sub: data.advanceStudents != null ? `${formatNumber(data.advanceStudents)} o'quvchining balansida turibdi` : null,
    },
    {
      key: "late",
      label: "Eski qarzlar uchun",
      amount: data.lateTotal,
      colour: "bg-amber-500",
      sub:
        data.latePaymentCount != null && data.lateStudentCount != null
          ? `${formatNumber(data.latePaymentCount)} ta to'lov, ${formatNumber(data.lateStudentCount)} o'quvchi`
          : null,
    },
  ].filter((p) => p.amount > 0);

  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {parts.map((p) => (
          <div key={p.key} className={p.colour} style={{ flexGrow: p.amount }} />
        ))}
      </div>
      <ul className="space-y-3">
        {parts.map((p) => (
          <li key={p.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2.5 shrink-0 rounded-full ${p.colour}`} />
                {p.label}
              </span>
              <span className="font-semibold tabular-nums">{som(p.amount)}</span>
            </div>
            {p.sub && <p className="pl-5 text-xs text-muted-foreground">{p.sub}</p>}
            {p.key === "late" && (
              <ul className="space-y-0.5 pl-5 text-xs">
                {data.late.map((m) => (
                  <li key={m.monthKey} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{m.label} qarzi</span>
                    <span className="tabular-nums">{som(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {byMethod.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Qanday to&apos;landi</p>
          <div className="flex flex-wrap gap-2">
            {byMethod.map((m) => (
              <span key={m.method} className="rounded-full border px-3 py-1 text-xs">
                {PAYMENT_METHOD_LABELS[m.method] ?? m.method} · {som(m.amount)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

Create `client/src/components/payments/overview/cash-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BlockError, BlockSkeleton } from "./block-state";
import { IncomeDialog } from "./income-dialog";
import { dayMonth, som } from "./overview-math";
import { useFinancialOverview, useIncomeAttribution } from "./queries";

/**
 * «Kassaga tushdi» — the month's cash from the ledger replay, the same total
 * its dialog decomposes and the 21:00 report prints. «kecha» belongs to the
 * current month only (the server sends none otherwise, nor on the 1st).
 */
export function CashCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const attribution = useIncomeAttribution(month);
  const overview = useFinancialOverview(month);
  const [open, setOpen] = useState(false);
  if (attribution.isPending) return <BlockSkeleton />;
  if (attribution.isError) return <BlockError title="Kassaga tushdi" onRetry={() => attribution.refetch()} />;
  const a = attribution.data;
  const yesterday = isCurrent ? overview.data?.income.yesterday : null;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Kassaga tushdi</p>
      <p className="text-2xl font-bold tabular-nums">{som(a.total)}</p>
      {a.lateTotal > 0 && <p className="text-xs text-muted-foreground">shundan eski qarzlardan {som(a.lateTotal)}</p>}
      {yesterday && (
        <p className="text-xs text-muted-foreground">
          kecha ({dayMonth(yesterday.date)}) {som(yesterday.amount)}
        </p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        Qayerdan keldi →
      </button>
      <IncomeDialog
        open={open}
        onOpenChange={setOpen}
        month={month}
        data={a}
        byMethod={overview.data?.income.byMethod ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 5: Write the salary card**

Create `client/src/components/payments/overview/salary-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { BlockError, BlockSkeleton, MoneyRow } from "./block-state";
import { som } from "./overview-math";
import { useFinancialOverview } from "./queries";

/**
 * «Oyliklar» — `SalaryMonthlyService.getMonthly` for the month, the Ish haqi
 * page's source: the teachers' full deserved pay plus the staff's monthly pay.
 * A month without per-lesson data (May) has no teacher figure: «—», «o'tish oyi».
 */
export function SalaryCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const overview = useFinancialOverview(month);
  if (overview.isPending) return <BlockSkeleton />;
  if (overview.isError) return <BlockError title="Oyliklar" onRetry={() => overview.refetch()} />;
  const s = overview.data.salary.computed;
  const teachers = s?.hasLessonData ? (s.fullDeserved ?? null) : null;
  const staff = s?.staff ?? null;
  const total = teachers != null && staff ? teachers + staff.monthly : null;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Oyliklar</p>
      <p className="text-2xl font-bold tabular-nums">{som(total)}</p>
      <p className="text-xs text-muted-foreground">
        ustozlar {som(teachers)} · xodimlar {som(staff?.monthly)}
      </p>
      <MoneyRow label="avans berilgan" value={som(s && staff ? s.advances + staff.advances : null)} />
      <MoneyRow
        label={isCurrent ? "oy oxirida beriladi" : "avansdan keyin"}
        value={som(s && staff ? s.netToPay + staff.netToPay : null)}
      />
      {s && !s.hasLessonData && <p className="text-xs text-amber-600 dark:text-amber-400">o&apos;tish oyi</p>}
      <Link href={`/payments/salary?month=${month}`} className="text-sm font-medium text-primary hover:underline">
        Ish haqi →
      </Link>
    </div>
  );
}
```

- [ ] **Step 6: Write the «Qanday hisoblandi» dialog and the profit card**

Create `client/src/components/payments/overview/profit-dialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { monthShort } from "@/components/payments/salary-utils";
import { FULL_TEACHER_PAY_MONTH, profitLines, som } from "./overview-math";
import type { ProfitComposition } from "./types";

/** «Qanday hisoblandi» (spec B1 §2.4): only the lines that make up the profit, as one equation. */
export function ProfitDialog({
  open,
  onOpenChange,
  month,
  composition,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  composition: ProfitComposition;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{monthShort(month)} foydasi qanday hisoblandi</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <ProfitBreakdown month={month} composition={composition} />
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The lines, signed, then «Foyda». From 2026-07 teacher pay is the full
 * deserved figure, so only from then is it the Ish haqi page's total.
 */
export function ProfitBreakdown({ month, composition }: { month: string; composition: ProfitComposition }) {
  return (
    <div className="space-y-2 text-sm">
      {profitLines(composition).map((line) => (
        <div key={line.label} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{line.label}</span>
          <span className="tabular-nums">{som(line.amount)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t pt-2 font-semibold">
        <span>Foyda</span>
        <span className="tabular-nums">{som(composition.netProfit)}</span>
      </div>
      {month >= FULL_TEACHER_PAY_MONTH && (
        <p className="text-xs text-muted-foreground">Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir xil</p>
      )}
    </div>
  );
}
```

Create `client/src/components/payments/overview/profit-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BlockError, BlockSkeleton, MoneyRow } from "./block-state";
import { som } from "./overview-math";
import { ProfitDialog } from "./profit-dialog";
import { useProfitComposition } from "./queries";

/**
 * «Foyda» — the canonical net profit (`GET /reports/profit-composition`, built
 * from `assembleMonthlyNetProfit`). The lines add up to the big figure.
 */
export function ProfitCard({ month, isCurrent }: { month: string; isCurrent: boolean }) {
  const composition = useProfitComposition(month);
  const [open, setOpen] = useState(false);
  if (composition.isPending) return <BlockSkeleton />;
  if (composition.isError) return <BlockError title="Foyda" onRetry={() => composition.refetch()} />;
  const c = composition.data;
  const withdrawn = c.withdrawals?.total ?? 0;
  const spent = c.teachers.total + c.staff.total + c.expenses.total + c.refunds;
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Foyda</p>
      <p
        className={cn(
          "text-2xl font-bold tabular-nums",
          c.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
        )}
      >
        {som(c.netProfit)}
      </p>
      <MoneyRow label="darslar puli" value={som(c.revenue.total)} />
      {withdrawn !== 0 && <MoneyRow label="balansdan yechib olingan" value={som(withdrawn)} />}
      <MoneyRow label="chiqimlar" value={som(-spent)} />
      {isCurrent && c.forecast && (
        <p className="text-xs text-muted-foreground">oy oxiriga taxminan {som(c.forecast.expectedNetProfit)}</p>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-primary hover:underline"
      >
        Qanday hisoblandi →
      </button>
      <ProfitDialog open={open} onOpenChange={setOpen} month={month} composition={c} />
    </div>
  );
}
```

- [ ] **Step 7: Write the months table**

Create `client/src/components/payments/overview/months-table.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { monthLabel } from "@/components/payments/salary-utils";
import { BlockError, BlockSkeleton } from "./block-state";
import { isMonthlyBillingMonth, som } from "./overview-math";
import { useFinancialTrend } from "./queries";

/**
 * Block 4 — «Oylar bo'yicha»: the month and up to five before it, newest
 * first (the server stops at the reporting floor). Foyda is the canonical
 * profit; a month whose canonical figure failed (`kassa`) shows «—», never
 * the cash figure under the Foyda heading.
 */
export function MonthsTable({ month, current }: { month: string; current: string }) {
  const trend = useFinancialTrend(month);
  if (trend.isPending) return <BlockSkeleton className="h-56" />;
  if (trend.isError) return <BlockError title="Oylar bo'yicha" onRetry={() => trend.refetch()} />;
  const rows = [...trend.data].reverse();
  return (
    <section className="space-y-3">
      <h3 className="font-heading text-base font-semibold">Oylar bo&apos;yicha</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>Oy</TableHead>
            <TableHead className="text-right">Kassaga tushdi</TableHead>
            <TableHead className="text-right">Foyda</TableHead>
            <TableHead>Izoh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.monthKey}>
              <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
              <TableCell>{monthLabel(r.monthKey)}</TableCell>
              <TableCell className="text-right tabular-nums">{som(r.income)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.profitBasis === "kanonik" ? som(r.profit) : "—"}
              </TableCell>
              <TableCell>
                {r.monthKey === current ? (
                  <Badge variant="secondary">oy tugamagan</Badge>
                ) : !isMonthlyBillingMonth(r.monthKey) ? (
                  <Badge variant="outline">12 talik tizim</Badge>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
```

- [ ] **Step 8: Put the blocks on the page**

In `client/src/components/payments/overview/overview-page.tsx`, add the imports

```tsx
import { CashCard } from "./cash-card";
import { MonthsTable } from "./months-table";
import { ProfitCard } from "./profit-card";
import { SalaryCard } from "./salary-card";
```

and replace the `canSeeMoney` block of the JSX with:

```tsx
      {canSeeMoney && (
        <>
          <MonthChargesCard month={month} isCurrent={isCurrent} />
          {isCurrent && <DebtCards month={month} />}
          <div className="grid gap-3 lg:grid-cols-3">
            <CashCard month={month} isCurrent={isCurrent} />
            <SalaryCard month={month} isCurrent={isCurrent} />
            <ProfitCard month={month} isCurrent={isCurrent} />
          </div>
          <MonthsTable month={month} current={current} />
        </>
      )}
```

- [ ] **Step 9: Run the tests, type-check and lint**

```bash
cd client && npx vitest run src/components/payments/overview
cd client && npx tsc --noEmit -p .
cd client && npm run lint 2>&1 | tail -5
```
Expected: both overview test files PASS (Task 7's page tests still pass: the new blocks render skeletons there); tsc clean; 0 lint errors.

- [ ] **Step 10: Commit**

```bash
git add client/src/components/payments/overview
git commit -m "feat(client): overview cash, salary and profit cards, months table and their dialogs

«Kassaga tushdi» with «Qayerdan keldi» (this month, the advance, old
debts, methods), «Oyliklar» (teachers + staff), «Foyda» with «Qanday
hisoblandi» (one equation), and «Oylar bo'yicha» from the anchored
trend. Each block keeps its own query, skeleton and error state.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Marketing page

**Files:**
- Create: `client/src/components/reports/marketing/marketing-format.ts`, `client/src/components/reports/marketing/marketing-format.test.ts`
- Create: `client/src/components/reports/marketing/marketing-view.tsx`, `client/src/components/reports/marketing/marketing-view.test.ts`
- Create: `client/src/components/reports/marketing/marketing-client.tsx`
- Create: `client/src/app/(dashboard)/reports/marketing/page.tsx`
- Modify: `client/src/lib/reports-nav.ts`, `client/src/lib/reports-nav.test.ts`, `client/src/lib/breadcrumb-routes.ts`, `client/src/lib/uzbek-only-texts.test.ts`

**Interfaces:**
- Consumes: `GET /reports/marketing` (Task 5); `REPORT_FLOOR_MONTH`, `clampMonth`, `som` (Task 7 `overview-math.ts`); `BlockSkeleton`, `BlockError`; `MonthStepper`.
- Produces: `MarketingMonth`, `MarketingReport`, `roiNumber(roi)`, `formatRoi(roi)`, `roiSentence(r)`; `MarketingReportView({ data })`; `MarketingClient()`.

- [ ] **Step 1: Write the failing format tests**

Create `client/src/components/reports/marketing/marketing-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatRoi, roiSentence, type MarketingMonth } from "./marketing-format";

const norm = (s: string) => s.replace(/\s+/g, " ");
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

const OCTOBER: MarketingMonth = {
  month: "2026-10",
  spend: 5_800_000,
  newStudents: 171,
  cac: 33_918,
  cohortPaid: 75_400_000,
  roi: 13,
  transition: false,
};

describe("formatRoi", () => {
  it("is a whole number from 10 up and one decimal below it", () => {
    expect(formatRoi(13)).toBe("13×");
    expect(formatRoi(12.6)).toBe("13×");
    expect(norm(formatRoi(3.44))).toBe(norm(`${(3.4).toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`));
  });

  it("is «—» when there is nothing to show", () => {
    expect(formatRoi(null)).toBe("—");
  });
});

describe("roiSentence", () => {
  it("says how many times the spend came back when it did", () => {
    expect(norm(roiSentence(OCTOBER))).toBe(
      `Oktabrda qo'shilgan 171 o'quvchi hozirgacha ${money(75_400_000)} to'ladi — marketingga sarflangan ${money(5_800_000)} dan 13 barobar ko'p.`,
    );
  });

  it("says which share of the spend came back when it did not", () => {
    expect(norm(roiSentence({ ...OCTOBER, newStudents: 12, cohortPaid: 2_900_000, roi: 0.5 }))).toBe(
      `Oktabrda qo'shilgan 12 o'quvchi hozirgacha ${money(2_900_000)} to'ladi — sarfning 50% i.`,
    );
  });

  it("says nothing was spent, and that the transition months are not counted", () => {
    expect(roiSentence({ ...OCTOBER, spend: 0, roi: null })).toBe("Oktabrda marketingga sarf yozilmagan.");
    expect(roiSentence({ ...OCTOBER, month: "2026-06", transition: true, cac: null, cohortPaid: null, roi: null })).toBe(
      "May–iyun — tizimga o'tish oylari, hisoblanmaydi.",
    );
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd client && npx vitest run src/components/reports/marketing/marketing-format.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the format helpers**

Create `client/src/components/reports/marketing/marketing-format.ts`:

```ts
import { formatNumber } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";
import { som } from "@/components/payments/overview/overview-math";

/** One month of `GET /reports/marketing` (ADR-0067 definitions; null = not computed). */
export interface MarketingMonth {
  month: string;
  spend: number;
  newStudents: number;
  cac: number | null;
  cohortPaid: number | null;
  roi: number | null;
  transition: boolean;
}

export interface MarketingReport extends MarketingMonth {
  ltv: { value: number; avgMonths: number; monthlyCharge: number } | null;
  /** The asked month first, back to 2026-05. */
  months: MarketingMonth[];
  /** Lead sources of the month; null before 10.09.2026. */
  sources: { source: string | null; leads: number; students: number }[] | null;
}

/** "13" from 10 up, "3,4" below it. */
export function roiNumber(roi: number): string {
  return roi >= 10
    ? formatNumber(Math.round(roi))
    : formatNumber(roi, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** «13×», «3,4×»; nothing to show is «—». */
export function formatRoi(roi: number | null): string {
  return roi == null ? "—" : `${roiNumber(roi)}×`;
}

/** The «Marketing samarasi» sentence (spec B1 §3.3). */
export function roiSentence(r: MarketingMonth): string {
  if (r.transition) return "May–iyun — tizimga o'tish oylari, hisoblanmaydi.";
  const name = monthShort(r.month);
  if (r.spend === 0 || r.roi == null) return `${name}da marketingga sarf yozilmagan.`;
  const head = `${name}da qo'shilgan ${formatNumber(r.newStudents)} o'quvchi hozirgacha ${som(r.cohortPaid)} to'ladi`;
  return r.roi >= 1
    ? `${head} — marketingga sarflangan ${som(r.spend)} dan ${roiNumber(r.roi)} barobar ko'p.`
    : `${head} — sarfning ${Math.round(r.roi * 100)}% i.`;
}
```

Run: `cd client && npx vitest run src/components/reports/marketing/marketing-format.test.ts`
Expected: PASS.

- [ ] **Step 4: Write the failing view tests**

Create `client/src/components/reports/marketing/marketing-view.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MarketingMonth, MarketingReport } from "./marketing-format";
import { MarketingReportView } from "./marketing-view";

function norm(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);
const oneDecimal = (n: number) => norm(n.toLocaleString("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

const OCTOBER: MarketingMonth = { month: "2026-10", spend: 5_800_000, newStudents: 171, cac: 33_918, cohortPaid: 75_400_000, roi: 13, transition: false };
const SEPTEMBER: MarketingMonth = { month: "2026-09", spend: 4_000_000, newStudents: 120, cac: 33_333, cohortPaid: 13_600_000, roi: 3.4, transition: false };
const JUNE: MarketingMonth = { month: "2026-06", spend: 1_000_000, newStudents: 260, cac: null, cohortPaid: null, roi: null, transition: true };

const REPORT: MarketingReport = {
  ...OCTOBER,
  ltv: { value: 1_258_000, avgMonths: 3.4, monthlyCharge: 370_000 },
  months: [OCTOBER, SEPTEMBER, JUNE],
  sources: [
    { source: "Instagram", leads: 40, students: 10 },
    { source: null, leads: 5, students: 1 },
  ],
};

const render = (data: MarketingReport) => norm(renderToStaticMarkup(createElement(MarketingReportView, { data })));

describe("MarketingReportView", () => {
  it("shows the four cards with their sub-lines", () => {
    const text = render(REPORT);

    expect(text).toContain(`Marketingga sarflandi ${money(5_800_000)} Xarajatlar → Marketing`);
    expect(text).toContain(`Yangi o'quvchilar ${num(171)} birinchi marta to'laganlar`);
    expect(text).toContain(`Jalb qilish narxi ${money(33_918)} sarf ÷ yangi o'quvchilar`);
    expect(text).toContain(`O'quvchi qiymati ${money(1_258_000)} o'rtacha ${oneDecimal(3.4)} oy × oyiga ${money(370_000)}`);
  });

  it("says what the spend brought, with the upper-bound warning", () => {
    const text = render(REPORT);

    expect(text).toContain(
      `Marketing samarasi Oktabrda qo'shilgan 171 o'quvchi hozirgacha ${money(75_400_000)} to'ladi — marketingga sarflangan ${money(5_800_000)} dan 13 barobar ko'p.`,
    );
    expect(text).toContain("Bu yuqori chegara: hamma yangi o'quvchi ham reklamadan kelmagan.");
  });

  it("lists the months with «13×» and «3,4×», a transition month muted with «*» and «—»", () => {
    const text = render(REPORT);

    expect(text).toContain(`Oktabr 2026 ${money(5_800_000)} ${num(171)} ${money(33_918)} ${money(75_400_000)} 13×`);
    expect(text).toContain(`Sentabr 2026 ${money(4_000_000)} ${num(120)} ${money(33_333)} ${money(13_600_000)} ${oneDecimal(3.4)}×`);
    expect(text).toContain(`Iyun 2026 ${money(1_000_000)} ${num(260)}* — — —`);
    expect(text).toContain("* May–iyun — tizimga o'tish oylari");
  });

  it("lists the lead sources with their conversion, «Manba yozilmagan» for none", () => {
    const text = render(REPORT);

    expect(text).toContain("Manba bo'yicha (lid manbasi yozilganlar)");
    expect(text).toContain("Instagram 40 10 25%");
    expect(text).toContain("Manba yozilmagan 5 1 20%");
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
  });

  it("a month before lead sources shows only the footnote; missing figures are «—»", () => {
    const text = render({ ...REPORT, cac: null, ltv: null, sources: null });

    expect(text).not.toContain("Manba yozilmagan");
    expect(text).toContain("Lid manbasi 10.09.2026 dan beri yoziladi.");
    expect(text).toContain("Jalb qilish narxi — sarf");
    expect(text).toContain("O'quvchi qiymati — o'rtacha — oy × oyiga —");
  });

  it("prints no English abbreviation", () => {
    expect(render(REPORT)).not.toMatch(/\b(LTV|CAC|ROI)\b/);
  });
});
```

- [ ] **Step 5: Run them to see them fail**

Run: `cd client && npx vitest run src/components/reports/marketing/marketing-view.test.ts`
Expected: FAIL — `./marketing-view` not found.

- [ ] **Step 6: Implement the view, the client and the route**

Create `client/src/components/reports/marketing/marketing-view.tsx`:

```tsx
"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthLabel } from "@/components/payments/salary-utils";
import { som } from "@/components/payments/overview/overview-math";
import { formatRoi, roiSentence, type MarketingReport } from "./marketing-format";

const TRANSITION_NOTE =
  "* May–iyun — tizimga o'tish oylari: eski o'quvchilarning tizimdagi birinchi to'lovi «yangi» ko'rinadi, shuning uchun hisoblanmaydi.";

/** The marketing report for one month (spec B1 §3.3). Every figure is the server's; null prints «—». */
export function MarketingReportView({ data }: { data: MarketingReport }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Marketingga sarflandi" value={som(data.spend)} sub="Xarajatlar → Marketing" />
        <Card
          label="Yangi o'quvchilar"
          value={`${formatNumber(data.newStudents)}${data.transition ? "*" : ""}`}
          sub="birinchi marta to'laganlar"
        />
        <Card label="Jalb qilish narxi" value={som(data.cac)} sub="sarf ÷ yangi o'quvchilar" />
        <Card
          label="O'quvchi qiymati"
          value={som(data.ltv?.value)}
          sub={`o'rtacha ${data.ltv ? formatNumber(data.ltv.avgMonths) : "—"} oy × oyiga ${som(data.ltv?.monthlyCharge)}`}
        />
      </div>

      <div className="space-y-2 rounded-xl border bg-card p-4">
        <p className="font-medium">Marketing samarasi</p>
        <p className="text-sm">{roiSentence(data)}</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Bu yuqori chegara: hamma yangi o&apos;quvchi ham reklamadan kelmagan. Lid manbasi yozilganlar bo&apos;yicha
          aniq hisob — pastda.
        </p>
      </div>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Oylar bo&apos;yicha</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Oy</TableHead>
              <TableHead className="text-right">Sarflandi</TableHead>
              <TableHead className="text-right">Yangi o&apos;quvchi</TableHead>
              <TableHead className="text-right">Jalb qilish narxi</TableHead>
              <TableHead className="text-right">Hozirgacha to&apos;lagan</TableHead>
              <TableHead className="text-right">Samara</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.months.map((m, i) => (
              <TableRow key={m.month} className={cn(m.transition && "text-muted-foreground")}>
                <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                <TableCell>{monthLabel(m.month)}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.spend)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(m.newStudents)}
                  {m.transition ? "*" : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cac)}</TableCell>
                <TableCell className="text-right tabular-nums">{som(m.cohortPaid)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatRoi(m.roi)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.months.some((m) => m.transition) && <p className="text-xs text-muted-foreground">{TRANSITION_NOTE}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="font-heading text-base font-semibold">Manba bo&apos;yicha (lid manbasi yozilganlar)</h3>
        {data.sources && data.sources.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Manba</TableHead>
                <TableHead className="text-right">Lid</TableHead>
                <TableHead className="text-right">O&apos;quvchi bo&apos;ldi</TableHead>
                <TableHead>Aylanish</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sources.map((s, i) => {
                const rate = s.leads > 0 ? Math.round((s.students / s.leads) * 100) : 0;
                return (
                  <TableRow key={s.source ?? "none"}>
                    <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{s.source ?? "Manba yozilmagan"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(s.students)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-10 tabular-nums">{rate}%</span>
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/60" style={{ width: `${Math.min(rate, 100)}%` }} />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">Lid manbasi 10.09.2026 dan beri yoziladi.</p>
      </section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-1 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
```

Create `client/src/components/reports/marketing/marketing-client.tsx`:

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { MonthStepper } from "@/components/shared/month-stepper";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { BlockError, BlockSkeleton } from "@/components/payments/overview/block-state";
import { REPORT_FLOOR_MONTH, clampMonth } from "@/components/payments/overview/overview-math";
import type { MarketingReport } from "./marketing-format";
import { MarketingReportView } from "./marketing-view";

const FILTERS = { month: { type: "string" as const, defaultValue: "" } };

/** «Marketing» (spec B1 §3): one month's spend, new students and what they paid. CEO/BD only. */
export function MarketingClient() {
  const { selectedBranch } = useBranchSwitcher();
  const { filters, setFilter } = useUrlFilters(FILTERS);
  const current = currentMonthKey();
  const month = clampMonth(filters.month || current, REPORT_FLOOR_MONTH, current);
  const report = useQuery({
    queryKey: ["marketing", selectedBranch?.id, month],
    queryFn: () =>
      api
        .get<MarketingReport>("/reports/marketing", { params: { branchId: selectedBranch?.id, month } })
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Marketing</h2>
        <MonthStepper
          value={month}
          min={REPORT_FLOOR_MONTH}
          max={current}
          onChange={(m) => setFilter("month", m === current ? "" : m)}
        />
      </div>
      {report.isPending ? (
        <BlockSkeleton className="h-64" />
      ) : report.isError ? (
        <BlockError title="Marketing" onRetry={() => report.refetch()} />
      ) : (
        <MarketingReportView data={report.data} />
      )}
    </div>
  );
}
```

Create `client/src/app/(dashboard)/reports/marketing/page.tsx`:

```tsx
import { Suspense } from "react";
import { MarketingClient } from "@/components/reports/marketing/marketing-client";

export default function MarketingReportPage() {
  // The month lives in the URL (useSearchParams): prerendering needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <MarketingClient />
    </Suspense>
  );
}
```

- [ ] **Step 7: Navigation, breadcrumb and the Uzbek-only guard**

1. `client/src/lib/reports-nav.ts`: add `Megaphone,` to the `lucide-react` import and, in the «Marketing va faoliyat» section right after the «Lidlar hisoboti» item:

```ts
      // Pul hisoboti — CEO/BD (server: `GET /reports/marketing`, ADR-0067).
      { title: "Marketing", url: "/reports/marketing", icon: Megaphone, visibleForRoles: CEO_BD },
```

2. `client/src/lib/reports-nav.test.ts`, append inside the describe:

```ts
  it("Marketing — pul hisoboti: CEO va filial direktori ochadi, administrator ochmaydi", () => {
    expect(canOpenReportPath([1], "/reports/marketing")).toBe(true);
    expect(canOpenReportPath([2], "/reports/marketing")).toBe(true);
    expect(canOpenReportPath([3], "/reports/marketing")).toBe(false);
  });
```

3. `client/src/lib/breadcrumb-routes.ts`: add `marketing: "Marketing",` after `attendance: "Davomat statistikasi",`.
4. `client/src/lib/uzbek-only-texts.test.ts`: change the fs import to `import { readFileSync, readdirSync } from "node:fs";` and append:

```ts
// The CEO's rule (27.09.2026): the three marketing figures have Uzbek names
// («O'quvchi qiymati», «Jalb qilish narxi», «Marketing samarasi»). No file of
// the two B1 folders may carry the English abbreviations.
describe("the overview and marketing pages (B1)", () => {
  const files = ["payments/overview", "reports/marketing"].flatMap((dir) =>
    readdirSync(join(__dirname, "..", "components", dir))
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
      .map((f) => `${dir}/${f}`),
  );

  it("finds the new files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s carries no LTV, CAC or ROI", (file) => {
    expect(source(file)).not.toMatch(/\b(LTV|CAC|ROI)\b/);
  });
});
```

- [ ] **Step 8: Run the tests, type-check and lint**

```bash
cd client && npx vitest run src/components/reports/marketing src/lib
cd client && npx tsc --noEmit -p .
cd client && npm run lint 2>&1 | tail -5
```
Expected: PASS; tsc clean; 0 lint errors.

- [ ] **Step 9: Commit**

```bash
git add client/src/components/reports/marketing "client/src/app/(dashboard)/reports/marketing/page.tsx" client/src/lib/reports-nav.ts client/src/lib/reports-nav.test.ts client/src/lib/breadcrumb-routes.ts client/src/lib/uzbek-only-texts.test.ts
git commit -m "feat(client): marketing report page

Four cards, the «Marketing samarasi» sentence with its warning, the
months table (13×, transition months with *) and the lead sources.
Hisobotlar gets «Marketing» for CEO/BD; the B1 folders are guarded
against the English abbreviations.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Docs, full verification, browser check

**Files:**
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`, `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md`

**Interfaces:** none.

- [ ] **Step 1: `server/CLAUDE.md`**

1. In the «Daily report composition» bullet, replace `because the two lines under it (\`Shu oy uchun\` / \`Eski qarzlar uchun\`, then one row per older month, ALL of them) are a decomposition of it` with `because the lines under it (\`Shu oy uchun\` / \`Oldindan (keyingi oy uchun)\` / \`Eski qarzlar uchun\`, then one row per older month, ALL of them; a part that is 0 is left out and the percentages always sum to 100, ADR-0067) are a decomposition of it`.
2. In the «Interactive report menu» bullet, replace `whose income line carries the same \`Shu oy uchun\` / \`Eski qarzlar uchun\` split as the 21:00 report` with `whose income line carries the same \`Shu oy uchun\` / \`Oldindan (keyingi oy uchun)\` / \`Eski qarzlar uchun\` split as the 21:00 report`.
3. In «One month-end expectation»: replace `the \`/payments/overview\` card (and its daily-history dialog), the home page card,` with `the home page card,` and append to that bullet: `` `/payments/overview` shows such a month as one line, «{Oy} — 12 talik tizim: oylik hisob yo'q» (ADR-0067); `GET /reports/expectation-history` stays, with no page reading it. ``; in the next bullet replace `` `/payments/overview` «{Oy} to'lovlari» (Hisoblandi / To'landi / Qoldi) `` with `` `/payments/overview` «{Oy} oyi to'lovlari» (Hisoblandi «N o'quvchiga» / To'landi / Qoldi «N o'quvchi to'lamagan» — `unpaidStudents`, counted in `splitMonthCharges` beside `unpaid`) ``.
4. In ««Foyda tarkibi» — the Foyda card's breakdown (ADR-0038)», after its first paragraph add: `On /payments/overview the «Foyda» card and its «Qanday hisoblandi» dialog both read it (ADR-0067): the card prints \`netProfit\`, «darslar puli», «balansdan yechib olingan» (when non-zero) and «chiqimlar», the dialog the equation.`
5. In «Reports Module»: the «Endpoints» bullet becomes `` - **Endpoints**: `GET /reports/financial-overview`, `GET /reports/financial-trend` (`?month=YYYY-MM`: six months ending there, clamped to now, none before 2026-05), `GET /reports/marketing`, `GET /reports/monthly-debt-recovery`, `GET /reports/kpis`, and more ``; the «Roles» bullet becomes `` - **Roles**: CEO, BD (money reports). `financial-overview`, `financial-trend` and `marketing` are `@Roles('CEO', 'Branch Director')`. ``
6. In «Debt as two numbers (ADR-0059)», replace `answers \`DebtSplit { studying: { total, count, currentMonth, older }, notStudying: { total, count } }\`.` with `answers \`DebtSplit { studying: { total, count, currentMonth, older, olderCount }, notStudying: { total, count, byKind: { ungrouped, frozen, left } } }\`. \`olderCount\` counts studying debtors with \`older > 0\`; \`byKind\` is one \`groupBy(['status'])\` over the not-studying predicate — ACTIVE there is exactly \`ungroupedStudentWhere()\` («guruhsiz»), FROZEN «muzlatilgan», every other status «ketgan» — so its parts add up to \`notStudying.total\` and \`.count\` by construction (ADR-0067).`
7. After the «Financial overview calculates» bullet, add:

```markdown
- **Marketing (`GET /reports/marketing?month=YYYY-MM`, CEO/BD, ADR-0067)** — `reports/marketing/`: `marketing.math.ts` (pure), `ReportsMarketingService`, `ReportsMarketingController` (own controller, class-level CEO/BD, scope via `resolveCallerReportBranchIds`, 403 on an empty scope). A new student of month M is a live card in scope with at least one non-deleted enrollment whose FIRST COMPLETED payment fell in M; cohort paid = all their COMPLETED payments to date; jalb qilish narxi = round(spend ÷ new students); o'quvchi qiymati = `getDepartedStudentsSummary(...).avgDurationMonths` × round(`MonthCharges.charged ÷ students`) (null when either is missing: 0 months, before 2026-09); marketing samarasi = cohort paid ÷ spend. Months before 2026-07 are transition months: no CAC, cohort paid or ROI. «Manba bo'yicha» is the lead funnel's own cohort (`ReportsLeadFunnelService.getSourceBreakdown`), from 10.09.2026. Never compute these anywhere else.
- **Cash in three parts (ADR-0067)**: `getIncomeMonthAttribution` returns `currentMonth` (paid for the period's own months — a debit inside the period spent it), `advance` (paid ahead — still standing at the period end, or spent after it) and `lateTotal`; `total` is their sum and the period's tallied payments. Readers that predate the split use `currentMonth + advance` where they need the old meaning: `getOwnMonthProfit`, the Excel «Xulosa» blocks, the daily snapshot's `collectedForMonth`, the 21:00 pre-September collection lines.
```

- [ ] **Step 2: `client/CLAUDE.md`**

1. In «Financial UI (Moliya bo'limi)», replace the whole table row that starts with `` | `/payments/overview` | `` with:

```markdown
| `/payments/overview` | `components/payments/overview/overview-page.tsx` | **«Umumiy ma'lumotlar» (spec B1, ADR-0067).** Month picker «‹ Oktabr 2026 ›» (`MonthStepper`, `?month=YYYY-MM`, default and maximum the current Tashkent month, minimum 2026-05, `clampMonth`), «Excel» (`ExportOptionsPopover` for the month) and «To'lov qayd qilish» (`data-tour="payment-record"`; a recorded payment invalidates every key in `OVERVIEW_QUERY_KEYS`). One block per file, each with its own query, skeleton and error state: «{Oy} oyi to'lovlari» (`monthCharges`; a month before 2026-09 is one muted line «{Oy} — 12 talik tizim: oylik hisob yo'q»), today's debt (current month only: «Eski qarz — o'qiyotganlar» and «O'qimayotganlar qarzi» with guruhsiz / muzlatilgan / ketgan — never added, ADR-0059), «Kassaga tushdi» (`GET /reports/income-month-attribution`; «Qayerdan keldi»: shu oy / oldindan / eski qarz, methods), «Oyliklar» (`salary.computed`: teachers + staff), «Foyda» (`GET /reports/profit-composition`; «Qanday hisoblandi»), «Oylar bo'yicha» (`GET /reports/financial-trend?month=`, «—» when `profitBasis` is `kassa`) and «Oxirgi to'lovlar» (current month only; «Guruh» = the student's groups now). Administrator and Cashier see only the title, «To'lov qayd qilish» and «Oxirgi to'lovlar», and the page never calls `GET /reports/financial-overview` for them (`FINANCIAL_OVERVIEW_ROLES`). The query key `financial-overview` keeps its name: the payment, refund, withdrawal, expense and debtor dialogs invalidate it. The client computes no figure; a field an older server does not send prints «—» or its line is left out. |
```

2. In «Key Components», replace the whole bullet that starts with `` - **`profit-composition-panel.tsx`** `` with:

```markdown
- **`overview/`** — the «Umumiy ma'lumotlar» page, one block per file (`month-charges-card`, `debt-cards`, `cash-card` + `income-dialog`, `salary-card`, `profit-card` + `profit-dialog`, `months-table`, `recent-payments`), `types.ts` (the server shapes; `DebtSplit` and `MonthCharges` live here and the home card, the debt page and the outreach banner import them from here), `overview-math.ts` (pure, unit-tested: month clamp and range, «so'm», the «Qanday hisoblandi» lines) and `queries.ts` (one hook per endpoint). The 8-card grid, `kpi-chart-dialog.tsx`, the income and profit panels and the daily-history dialog were deleted (ADR-0067).
```

3. Delete the whole bullet that starts with `` - **`payments-overview.tsx`** ``.
4. Before `### Salary Breakdown Drawer`, add:

```markdown
### Marketing report (`/reports/marketing`, ADR-0067)

- `components/reports/marketing/` — `marketing-client.tsx` (month picker `?month=`, `GET /reports/marketing`), `marketing-view.tsx` (four cards, «Marketing samarasi», «Oylar bo'yicha», «Manba bo'yicha»), `marketing-format.ts` (pure: «13×», the sentence). CEO/BD only (`reports-nav.ts`, `CEO_BD`).
- Every figure is the server's; a null one prints «—». Transition months (May–June 2026) print the new-student count with «*» and «—» for the rest, with the footnote. No visible LTV, CAC or ROI — `lib/uzbek-only-texts.test.ts` scans both B1 folders for them.
```

- [ ] **Step 3: `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md`**

1. `CONTEXT.md`: in the «**O'qimayotganlar qarzi**» entry, before its file-path line add the sentence `Uch turga bo'linadi (ADR-0067): **guruhsiz** — statusi \`ACTIVE\` (o'qimayotganlar ichida bu aynan \`ungroupedStudentWhere()\`), **muzlatilgan** — \`FROZEN\`, **ketgan** — qolgan har qanday status; uchalasi jamini beradi.`; after the entry add:

```markdown
**Kassaga tushdi (uch qism)** — davrda tushgan to'lovlar: **shu oy uchun** (davr
hisobini to'lagan), **oldindan** (davr oxirida balansda turgan yoki davrdan
keyingi hisobni to'lagan) va **eski qarzlar uchun** (oldingi oylar qarzi).
Ledger qayta o'ynaladi, balans bo'laklari eng eskisidan sarflanadi.
`reports/reports-financial.service.ts` (`getIncomeMonthAttribution`) · `docs/adr/0067-kassa-uch-qism-marketing-va-umumiy-sahifa.md`

**Yangi o'quvchi (marketing)** — birinchi COMPLETED to'lovi shu oyga tushgan,
arxivlanmagan, kamida bitta yozilishi bor karta. 2026-07 dan oldingi oylar —
o'tish oylari, ularning yangi o'quvchisi hisob-kitobga kirmaydi.
`reports/marketing/marketing.math.ts` · ADR-0067
```

2. `docs/role-access.md`: replace `(\`financial-overview\` also admits Administrator and Cashier, but strips every money field for them)` with `(\`financial-overview\` and \`marketing\` included — since ADR-0067 the overview no longer admits Administrator and Cashier; their «Umumiy ma'lumotlar» is payment recording and the recent payments)`.
3. `docs/financial-system.md`: the `financial-overview` row becomes `` | `GET` | `/api/reports/financial-overview` | CEO, BD | Tushum (usullar, kecha), oy hisoblari, qarz, oylik, foyda | ``; after the `financial-trend` row add `` | `GET` | `/api/reports/marketing` | CEO, BD | Marketing: sarf, yangi o'quvchilar, jalb qilish narxi, o'quvchi qiymati, samara (ADR-0067) | ``; in «Financial overview formulalari» delete the three lines `LTV = …`, `CAC = …`, `Marketing ROI = …`; the «Umumiy ma'lumotlar» page row's description becomes `Oy tanlash, oy to'lovlari, qarz, kassa/oylik/foyda kartalari, oylar jadvali, oxirgi to'lovlar (ADR-0067)`, and add a page row `` | Marketing | `/reports/marketing` | Sarf, yangi o'quvchilar, jalb qilish narxi, o'quvchi qiymati, samara, manba bo'yicha | ``.

- [ ] **Step 4: Full verification — server (one after another, never in parallel)**

```bash
cd server && npm run typecheck
cd server && npx eslint src 2>&1 | tail -3
cd server && npm test 2>&1 | tail -15
cd server && npm run build
```
Expected: typecheck clean; ESLint summary with 0 errors; every suite passes; build succeeds.

- [ ] **Step 5: Full verification — client**

```bash
cd client && npx tsc --noEmit -p .
cd client && npm run lint 2>&1 | tail -3
cd client && npx vitest run 2>&1 | tail -8
cd client && npm run build 2>&1 | tail -15
```
Expected: tsc clean; 0 lint errors; all tests pass; the build lists `/payments/overview` and `/reports/marketing`.

- [ ] **Step 6: Browser check on local dev data (screenshots for the CEO)**

Run the server (`cd server && npm run start:dev`) and the client (`cd client && npm run dev`) against the local database, then, signed in as a CEO:
1. `/payments/overview` — every block of the current month; open «Qayerdan keldi →» and «Qanday hisoblandi →» and check that the parts and the lines add up to their card.
2. `/payments/overview?month=2026-09` — no debt block, no «kecha», no «oy oxiriga», no recent payments; `?month=2026-08` — the «12 talik tizim» line.
3. Sign in as an Administrator: the page shows only the title, «To'lov qayd qilish» and «Oxirgi to'lovlar»; the browser's network panel shows no `financial-overview` request.
4. `/reports/marketing` for the current month and for 2026-06 (transition: «*» and «—»); the Hisobotlar menu shows «Marketing» for a CEO and not for an Administrator.

Take a screenshot of each view for the CEO (feedback «CEO sahifasi bir qarashda»). Do not deploy: merge and deploy only with the CEO's go-ahead (spec §7).

- [ ] **Step 7: Commit**

```bash
git add server/CLAUDE.md client/CLAUDE.md CONTEXT.md docs/role-access.md docs/financial-system.md
git commit -m "docs: B1 overview and marketing in CLAUDE.md, CONTEXT and reference docs

Cash in three parts, the not-studying debt kinds, the CEO/BD overview,
the trend month anchor and the marketing report.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §2.1 header: month picker, URL `?month=`, min/max, Excel prefilled, «To'lov qayd qilish», refresh all blocks | 7 |
| §2.2 block 1 (charges, `unpaidStudents`, link, 12-talik line) | 1, 7 |
| §2.2 block 2 (`olderCount`, `byKind`, links, never added) | 1, 7 |
| §2.2 block 3a (attribution total, late, yesterday, dialog) | 2, 3, 8 |
| §2.2 block 3b (teachers + staff, advance, net, «o'tish oyi», link) | 3, 8 |
| §2.2 block 3c (canonical profit lines, withdrawals, forecast, dialog) | 8 |
| §2.2 block 4 (trend anchor, «—» for `kassa`, Izoh pills) | 3, 8 |
| §2.2 block 5 (recent payments with «Guruh») | 4, 7 |
| §2.3 Administrator/Cashier view; CEO/BD endpoint; CLAUDE.md note | 3, 7 |
| §2.4 «Qayerdan keldi» and «Qanday hisoblandi» (check line from 2026-07) | 8 |
| §2.5 removals (client files, server fields) | 3, 7 |
| §3 Marketing: definitions, blocks, navigation, breadcrumb | 5, 9 |
| §4.1–4.2 month charges, debt split | 1 |
| §4.3 advance split and its readers | 2 |
| §4.4–4.5 overview and trend | 3 |
| §4.6 `GET /payments` groups | 4 |
| §4.7 marketing endpoint, route policy, coverage | 5 |
| §4.8 Telegram lines | 2 |
| §4.9 ADR-0067 | 6 |
| §5 client: types moved, React Query keys, per-block states, Uzbek-only | 7, 8, 9 |
| §6 tests (pure, controllers/policy/coverage, client), browser check | 1–5, 7–10 |
