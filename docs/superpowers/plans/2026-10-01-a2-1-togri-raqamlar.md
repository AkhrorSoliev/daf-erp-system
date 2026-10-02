# A2 (1-qism): to'g'ri raqamlar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the finance surfaces tell the truth under monthly billing: the month's main figure becomes «Bu oy hisoblandi / To'landi / Qoldi», always-wrong figures go, and the cancelled-refund / cancelled-write-off, payroll-scope and preview leftovers of spec A2 are fixed.

**Architecture:** One new pure split (`splitMonthCharges`) plus one loader (`loadMonthCharges`) over `EnrollmentMonthlyCharge` and `Student.balance` is the single source of «hisoblandi / to'landi / qoldi»; every surface (Moliya overview, Tushumlar drill-down, Bosh sahifa, Telegram 21:00, «💰 Moliyaviy xulosa», Excel block 4) reads it through `ReportsService.getMonthCharges`. Months before 2026-09 keep today's forecast unchanged. The remaining items are local fixes in the services the audit pinned.

**Tech Stack:** NestJS 11 + Prisma 7 + Jest (server), Next.js 16 + React Query + Vitest (client).

**Source:** spec `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` §2 (CEO decisions) and §3 A2 items 1, 2, 3, 5, 6, 7, 8, 9, 10. Item 4 (debt as two numbers) is plan `2026-10-01-a2-2-qarz-ikki-raqam.md` (PR 2). The approved Moliya mock-up (27.09) fixed the vocabulary: «hisoblandi / to'landi / qoldi», collection % = to'landi ÷ hisoblandi («To'landi 77%»), the daily «oy oxiriga» chart is removed for monthly months.

## Global Constraints

- Monthly billing months: `month >= '2026-09'` (`MONTHLY_BILLING_START_MONTH`). Earlier months keep the old formula and the old screens (spec A2.1: «Oylik tizimdan oldingi oylar eski formulada qoladi»).
- «Bu oy hisoblandi» = Σ `EnrollmentMonthlyCharge.chargedAmount` of the month with `status = CHARGED`, branch-scoped by the charge's `branchId`.
- «Qoldi» per student = `min(max(0, debt − later), chargedThisMonth)`, where `debt = max(0, −Student.balance)` today and `later` = Σ that student's CHARGED `chargedAmount` of months after the month. Money settles the oldest charge first, so debt sits on the newest charges. «To'landi» = hisoblandi − qoldi. Percentage = to'landi ÷ hisoblandi, one decimal.
- Every money figure is computed on the server; the client never recomputes one.
- UI text is Latin-script Uzbek only, no English words on screen (CEO, 27.09). Do not write «CEO» in UI text — use «markaz rahbari».
- Never run `prettier` on `client/`. Run `npx prettier --write` on every touched **server** file.
- Upper date bounds are exclusive; month keys come from `tashkentMonthKey`, never `getFullYear()/getMonth()`.
- Commit messages: Latin-script Uzbek (user's 30.09 choice, CLAUDE.local.md). Code comments: match the language of the surrounding file. `CLAUDE.md` files: English (their own policy). ADR: Uzbek.
- No production database access. No push, PR, merge or deploy without the user's go.
- ADR number: **0058** (0057 is taken by the unmerged guide-review branch `claude/quirky-snyder-0e53e3`; re-check `docs/adr/README.md` on `origin/main` before the PR).
- Server checks (from `server/`): `npx prisma generate && npm run typecheck && npx eslint src && npx jest <spec>`; full suite at the end. `npm run build` and `npx jest` must NOT run in parallel (both run prisma generate).
- Client checks (from `client/`): `npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/reports/month-charges.ts` (new) | `MONTHLY_BILLING_START_MONTH`, `isMonthlyBillingMonth`, `MonthCharges`, pure `splitMonthCharges`, `loadMonthCharges` |
| `server/src/reports/month-charges.spec.ts` (new) | Unit tests for the split and the loader |
| `server/src/reports/reports-financial.service.ts` | `getMonthCharges`; drop `income.billed`; refund/write-off filters in `getPeriodOutflows`, cohort and forgiven count |
| `server/src/reports/reports.service.ts` | Facade: `getMonthCharges`; `getFinancialOverview` returns `monthCharges` |
| `client/src/components/payments/payments-overview.tsx` | Card shows hisoblandi/to'landi/qoldi for monthly months; two removed rows |
| `client/src/components/payments/income-attribution-panel.tsx`, `kpi-chart-dialog.tsx` | Drill-down «To'landi» block for monthly months |
| `server/src/dashboard/dashboard-summary.service.ts` (+ types), `client/src/components/dashboard/home-money-cards.tsx` (+ types) | Home card |
| `server/src/telegram-groups/telegram-group-daily-report.service.ts`, `telegram-group-report-menu.service.ts` | 21:00 month block, «💰 Moliyaviy xulosa» |
| `server/src/reports/reports-excel.service.ts`, `reports-excel.workbook-input.ts`, `reports-excel.summary-sheet.ts`, `reports-excel.sheets.ts` | Excel block 4 for monthly months, Tashkent month, glossary, dead `summarySheet` removed |
| `server/src/reports/reports-payments.service.ts`, `reports-teacher-payments.service.ts`, `reports-departed-students.service.ts` (+ client counterparts) | A2.3 removals |
| `server/src/reports/reports-overview.service.ts` | A2.6 attendance % |
| `server/src/reports/net-profit-cache.ts` | Cache version bump |
| `server/src/reports/reports-debt-history.service.ts` | A2.9 write-off pairs |
| `server/src/salary/shared/payroll-branch-scope.ts` | A2.8 multi-branch director |
| `server/src/payments/payments-preview.service.ts`, `server/src/courses/courses.service.ts` | A2.10 leftovers |
| `docs/adr/0058-*.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md` | Decision record and docs |

---

### Task 1: «Bu oy hisoblandi» — one server source

**Files:**
- Create: `server/src/reports/month-charges.ts`
- Create: `server/src/reports/month-charges.spec.ts`
- Modify: `server/src/reports/reports-financial.service.ts` (add `getMonthCharges`)
- Modify: `server/src/reports/reports.service.ts:484-516` (`getFinancialOverview`; add `getMonthCharges`)
- Modify: `server/src/reports/reports.controller.ts:225-357` only if its Administrator/Cashier redaction is not a whitelist (see Step 6)
- Test: `server/src/reports/reports.service.spec.ts` (or the spec that covers the facade's `getFinancialOverview`), `server/src/reports/reports.controller.spec.ts`

**Interfaces:**
- Produces (used by Tasks 2–5):
  - `export const MONTHLY_BILLING_START_MONTH = '2026-09'`
  - `export function isMonthlyBillingMonth(month: string): boolean`
  - `export interface MonthCharges { month: string; charged: number; paid: number; unpaid: number; paidPct: number | null; students: number }`
  - `ReportsService.getMonthCharges(companyId: number, opts: { month: string; branchIds: ReportBranchIds }): Promise<MonthCharges>`
  - `ReportsService.getFinancialOverview(...)` result gains `monthCharges: MonthCharges | null` (null for months before 2026-09).

- [ ] **Step 1: Write the failing tests for the pure split**

`server/src/reports/month-charges.spec.ts`:

```ts
import {
  isMonthlyBillingMonth,
  splitMonthCharges,
  type MonthChargeRow,
} from './month-charges';

const row = (
  studentId: number,
  month: string,
  chargedAmount: number,
  branchId = 1,
): MonthChargeRow => {
  const [periodYear, periodMonth] = month.split('-').map(Number);
  return { studentId, periodYear, periodMonth, branchId, chargedAmount };
};

describe('isMonthlyBillingMonth', () => {
  it('starts with September 2026', () => {
    expect(isMonthlyBillingMonth('2026-08')).toBe(false);
    expect(isMonthlyBillingMonth('2026-09')).toBe(true);
    expect(isMonthlyBillingMonth('2027-01')).toBe(true);
  });
});

describe('splitMonthCharges', () => {
  const base = { month: '2026-10', branchIds: null };

  it('a student with no debt has paid the whole month', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000)],
      balances: new Map([[1, 20_000]]),
    });
    expect(r).toEqual({
      month: '2026-10',
      charged: 450_000,
      paid: 450_000,
      unpaid: 0,
      paidPct: 100,
      students: 1,
    });
  });

  it('debt up to the month charge is this month unpaid; the rest is older debt', () => {
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(2, '2026-10', 450_000)],
      balances: new Map([
        [1, -100_000], // part paid
        [2, -600_000], // whole month unpaid + 150 000 older debt
      ]),
    });
    expect(r.charged).toBe(900_000);
    expect(r.unpaid).toBe(100_000 + 450_000);
    expect(r.paid).toBe(350_000);
    expect(r.paidPct).toBe(38.9);
  });

  it("a later month's charge is unpaid first, so an earlier month can be fully paid", () => {
    // Viewing October on 02.11: the November charge already sits on the balance.
    const r = splitMonthCharges({
      ...base,
      rows: [row(1, '2026-10', 450_000), row(1, '2026-11', 450_000)],
      balances: new Map([[1, -450_000]]),
    });
    expect(r.unpaid).toBe(0);
    expect(r.paid).toBe(450_000);
  });

  it('branch scope counts only that branch, debt split by the share of the month', () => {
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [2],
      rows: [row(1, '2026-10', 300_000, 1), row(1, '2026-10', 100_000, 2)],
      balances: new Map([[1, -200_000]]),
    });
    expect(r.charged).toBe(100_000);
    expect(r.unpaid).toBe(50_000); // 200 000 × 100/400
    expect(r.students).toBe(1);
  });

  it('nothing charged → zeros and no percentage', () => {
    const r = splitMonthCharges({ ...base, rows: [], balances: new Map() });
    expect(r).toEqual({
      month: '2026-10',
      charged: 0,
      paid: 0,
      unpaid: 0,
      paidPct: null,
      students: 0,
    });
  });

  it('an empty branch scope sees nothing (fail closed)', () => {
    const r = splitMonthCharges({
      month: '2026-10',
      branchIds: [],
      rows: [row(1, '2026-10', 450_000)],
      balances: new Map([[1, -450_000]]),
    });
    expect(r.charged).toBe(0);
    expect(r.unpaid).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run (from `server/`): `npx jest src/reports/month-charges.spec.ts`
Expected: FAIL — `Cannot find module './month-charges'`.

- [ ] **Step 3: Write the module**

`server/src/reports/month-charges.ts`:

```ts
import { MonthlyChargeStatus, Prisma } from '@prisma/client';
import {
  branchIdWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

/**
 * The first month billed by `EnrollmentMonthlyCharge` — every course moved to
 * monthly payment on 01.09.2026. From this month the month's main figure is
 * what was charged («Bu oy hisoblandi»), not the lesson-value forecast
 * («Oy oxiriga kutilyapti»), which stays for the months before it (spec A2.1).
 */
export const MONTHLY_BILLING_START_MONTH = '2026-09';

export function isMonthlyBillingMonth(month: string): boolean {
  return month >= MONTHLY_BILLING_START_MONTH;
}

/** «Bu oy hisoblandi / To'landi / Qoldi» for one month (ADR-0058). */
export interface MonthCharges {
  month: string;
  /** Σ chargedAmount of the month's CHARGED charges in scope. */
  charged: number;
  /** charged − unpaid. */
  paid: number;
  /** The part of the month's charges still unpaid today. */
  unpaid: number;
  /** paid ÷ charged, one decimal; null when nothing was charged. */
  paidPct: number | null;
  /** Students with a charge in scope. */
  students: number;
}

export interface MonthChargeRow {
  studentId: number;
  periodYear: number;
  periodMonth: number;
  branchId: number;
  chargedAmount: number;
}

/**
 * Pure. A balance settles the OLDEST charge first, so today's debt sits on the
 * newest charges: for the month M a student owes
 * `min(max(0, debt − later months' charges), M's charges)`. This is the CEO's
 * 27.09 rule (spec §2.1, «shu oy = min(qarz, shu oyning hisoblari)»), extended
 * to a past month by setting the later months aside first — the same way
 * contract 3.2's admission counts a later month as still held (`heldLater`).
 *
 * `rows` are the students' CHARGED charges of M and LATER months, all
 * branches; rows of earlier months are ignored. A student's charges of M in
 * several branches share his unpaid part by amount.
 */
export function splitMonthCharges(input: {
  month: string;
  branchIds: ReportBranchIds;
  rows: readonly MonthChargeRow[];
  balances: ReadonlyMap<number, number>;
}): MonthCharges {
  const [y, m] = input.month.split('-').map(Number);
  const target = y * 12 + m;
  const per = new Map<number, { all: number; scope: number; later: number }>();
  for (const r of input.rows) {
    const key = r.periodYear * 12 + r.periodMonth;
    if (key < target) continue;
    const s = per.get(r.studentId) ?? { all: 0, scope: 0, later: 0 };
    if (key > target) {
      s.later += r.chargedAmount;
    } else {
      s.all += r.chargedAmount;
      if (input.branchIds === null || input.branchIds.includes(r.branchId)) {
        s.scope += r.chargedAmount;
      }
    }
    per.set(r.studentId, s);
  }

  let charged = 0;
  let unpaid = 0;
  let students = 0;
  for (const [studentId, s] of per) {
    if (s.scope <= 0) continue;
    students += 1;
    charged += s.scope;
    const debt = Math.max(0, -(input.balances.get(studentId) ?? 0));
    const unpaidAll = Math.min(Math.max(0, debt - s.later), s.all);
    unpaid += Math.round((unpaidAll * s.scope) / s.all);
  }
  const paid = charged - unpaid;
  return {
    month: input.month,
    charged,
    paid,
    unpaid,
    paidPct: charged > 0 ? Math.round((paid / charged) * 1000) / 10 : null,
    students,
  };
}

type MonthChargesDb = {
  enrollmentMonthlyCharge: Pick<
    Prisma.TransactionClient['enrollmentMonthlyCharge'],
    'findMany'
  >;
  student: Pick<Prisma.TransactionClient['student'], 'findMany'>;
};

/**
 * Branch scoping is a CHAIN: only the first query carries `branchId`; the
 * other two read the students it returned (their later charges in any branch
 * still sit on their one balance).
 */
export async function loadMonthCharges(
  prisma: MonthChargesDb,
  companyId: number,
  opts: { month: string; branchIds: ReportBranchIds },
): Promise<MonthCharges> {
  const [y, m] = opts.month.split('-').map(Number);
  const holders = await prisma.enrollmentMonthlyCharge.findMany({
    where: {
      companyId,
      periodYear: y,
      periodMonth: m,
      status: MonthlyChargeStatus.CHARGED,
      ...branchIdWhere(opts.branchIds),
    },
    select: { studentId: true },
    distinct: ['studentId'],
  });
  const studentIds = holders.map((h) => h.studentId);
  if (studentIds.length === 0) {
    return splitMonthCharges({
      ...opts,
      rows: [],
      balances: new Map(),
    });
  }
  const [rows, students] = await Promise.all([
    prisma.enrollmentMonthlyCharge.findMany({
      where: {
        companyId,
        studentId: { in: studentIds },
        status: MonthlyChargeStatus.CHARGED,
        OR: [
          { periodYear: { gt: y } },
          { periodYear: y, periodMonth: { gte: m } },
        ],
      },
      select: {
        studentId: true,
        periodYear: true,
        periodMonth: true,
        branchId: true,
        chargedAmount: true,
      },
    }),
    prisma.student.findMany({
      where: { companyId, id: { in: studentIds } },
      select: { id: true, balance: true },
    }),
  ]);
  return splitMonthCharges({
    ...opts,
    rows,
    balances: new Map(students.map((s) => [s.id, s.balance])),
  });
}
```

- [ ] **Step 4: Run the split tests**

Run: `npx jest src/reports/month-charges.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Add a loader test**

Append to `month-charges.spec.ts`:

```ts
import { loadMonthCharges } from './month-charges';

describe('loadMonthCharges', () => {
  it('scopes the holders by branch, then reads their later charges and balances', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ studentId: 7 }])
      .mockResolvedValueOnce([row(7, '2026-10', 450_000, 3)]);
    const prisma = {
      enrollmentMonthlyCharge: { findMany },
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 7, balance: -50_000 }]),
      },
    };
    const r = await loadMonthCharges(prisma as never, 1, {
      month: '2026-10',
      branchIds: [3],
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1,
      periodYear: 2026,
      periodMonth: 10,
      status: 'CHARGED',
      branchId: { in: [3] },
    });
    expect(r).toMatchObject({ charged: 450_000, unpaid: 50_000, paid: 400_000 });
  });

  it('stops after the first query when nobody was charged', async () => {
    const prisma = {
      enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findMany: jest.fn() },
    };
    const r = await loadMonthCharges(prisma as never, 1, {
      month: '2026-10',
      branchIds: null,
    });
    expect(r.charged).toBe(0);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
  });
});
```

Run: `npx jest src/reports/month-charges.spec.ts` — expected PASS (9 tests).

- [ ] **Step 6: Wire it into the services**

In `ReportsFinancialService` (it holds `this.prisma`) add:

```ts
  /** «Bu oy hisoblandi / To'landi / Qoldi» (ADR-0058). */
  getMonthCharges(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return loadMonthCharges(this.prisma, companyId, opts);
  }
```

In `ReportsService` (facade) add the pass-through and change `getFinancialOverview` (lines 484-516) to fetch the month figure next to the expectation:

```ts
  getMonthCharges(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return this.financial.getMonthCharges(companyId, opts);
  }
```

```ts
    const month = query.startDate?.slice(0, 7) ?? tashkentMonthKey(new Date());
    const [expectation, monthCharges] = await Promise.all([
      this.getMonthlyExpectation(companyId, {
        month,
        branchIds: query.branchIds,
      }),
      isMonthlyBillingMonth(month)
        ? this.getMonthCharges(companyId, { month, branchIds: query.branchIds })
        : Promise.resolve(null),
    ]);
    return {
      ...overview,
      income: { ...overview.income, expected: expectation.expectedValue },
      forecast: {
        ...overview.forecast,
        expectedMonthEnd: expectation.expectedValue,
        expectedHeld: expectation.heldValue,
        expectedRemaining: expectation.remainingValue,
      },
      monthCharges,
    };
```

Read `reports.controller.ts:225-357`. If the Administrator/Cashier branch builds a fresh object with only `{ ltvPayerCount, avgPayment }`, `monthCharges` is already excluded — add an assertion to the controller spec that the stripped payload has no `monthCharges`. If it deletes fields instead, add `monthCharges` to the deleted fields and the same assertion.

- [ ] **Step 7: Facade test**

In the spec that covers `ReportsService.getFinancialOverview` (search: `grep -rln "getFinancialOverview" src/reports/*.spec.ts`), add two cases with `financial.getMonthCharges` mocked:
- `startDate: '2026-10-01'` → result has `monthCharges` equal to the mock, and `getMonthCharges` was called with `{ month: '2026-10', branchIds }`.
- `startDate: '2026-08-01'` → `monthCharges: null`, `getMonthCharges` not called.

Run: `npx jest src/reports` — expected PASS.

- [ ] **Step 8: Guards that read every query**

Run: `npx jest src/students/shared/active-student-policy.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
- If the active-student policy fails on the new `prisma.student.findMany` in `month-charges.ts`, register it as an exception in the same list the spec reads (look for how other exceptions are written; reason: «balance lookup by an explicit id list of charge holders, not a population count»).
- If the branch-scope coverage spec fails, add `loadMonthCharges` to its chain list the way `ReportsExpectationService` is listed (first query scoped, the rest by the returned ids).

Expected after fixes: PASS.

- [ ] **Step 9: Typecheck, lint, format, commit**

Run: `npx prettier --write src/reports/month-charges.ts src/reports/month-charges.spec.ts src/reports/reports-financial.service.ts src/reports/reports.service.ts && npm run typecheck && npx eslint src/reports`

```bash
git add server/src/reports/month-charges.ts server/src/reports/month-charges.spec.ts server/src/reports/reports-financial.service.ts server/src/reports/reports.service.ts server/src/reports/*.spec.ts server/src/students/shared
git commit -m "feat(hisobot): oyning asosiy raqami — hisoblandi, to'landi, qoldi (A2.1)"
```

---

### Task 2: Moliya overview — the card, the drill-down, the two removed rows

**Files:**
- Modify: `client/src/components/payments/payments-overview.tsx:39-50` (type), `:237-239` (default), `:373-455` (card), `:667` (prop)
- Modify: `client/src/components/payments/kpi-chart-dialog.tsx:127-138, 295` (pass `monthCharges`)
- Modify: `client/src/components/payments/income-attribution-panel.tsx:39, 69, 228-306`
- Modify: `server/src/reports/reports-financial.service.ts:181-215, 397` (delete `income.billed` and its two queries)
- Modify: `server/src/reports/reports-excel.sheets.ts` (delete the dead `summarySheet` and the glossary entry «Tushgan tushum»)
- Test: `server/src/reports/reports-financial.service.spec.ts:71-110`, `server/src/reports/reports.controller.spec.ts:504`

**Interfaces:**
- Consumes: `monthCharges: MonthCharges | null` on `GET /reports/financial-overview` (Task 1).
- Produces: client type `MonthCharges` exported from `payments-overview.tsx`:
  `export interface MonthCharges { month: string; charged: number; paid: number; unpaid: number; paidPct: number | null; students: number }`.

- [ ] **Step 1: Server — delete `income.billed`**

In `reports-financial.service.ts` delete the LESSON_DEDUCTION aggregate (:181-189), the `overcharge*` ADJUSTMENT read (:198-212), the combination (:213-215) and `billed` in the returned `income` (:397). Update `reports-financial.service.spec.ts`: delete the four `income.billed` expectations (:71, :90, :100, :110) — keep the tests if they assert other fields, otherwise delete the tests whose only subject was `billed`. Remove `billed` from the fixture in `reports.controller.spec.ts:504`.

Run: `npx jest src/reports/reports-financial.service.spec.ts src/reports/reports.controller.spec.ts` — expected PASS.

- [ ] **Step 2: Server — delete the dead Excel `summarySheet`**

In `server/src/reports/reports-excel.sheets.ts` delete the function `summarySheet` (:91-214; not called since commit 42be94ed — confirm with `grep -rn "summarySheet\b" src scripts` that only `summarySheetV2` is used) and the glossary entry «Tushgan tushum» (:546), whose label only that sheet printed. Remove imports that become unused. Keep «O'tilgan darslar qiymati» (:542; `reports-excel.service.spec.ts:1027` checks it).

Run: `npm run typecheck && npx jest src/reports/reports-excel` — expected PASS.

```bash
git add server/src/reports
git commit -m "fix(hisobot): doim noto'g'ri «Hisoblangan darslar» olib tashlandi (A2.3)"
```

- [ ] **Step 3: Client — types**

In `payments-overview.tsx` add next to the overview data type (around :39-50):

```ts
/** «Bu oy hisoblandi / To'landi / Qoldi» — server `MonthCharges` (ADR-0058). */
export interface MonthCharges {
  month: string;
  charged: number;
  paid: number;
  unpaid: number;
  paidPct: number | null;
  students: number;
}
```

Add `monthCharges: MonthCharges | null;` to the data type, remove `billed` from `income`, and add `monthCharges: null` to the default object (around :237).

- [ ] **Step 4: Client — the card**

Replace the whole `{/* Tushum ko'rsatkichlari … */}` block (:376-455) with a card that branches on `d.monthCharges`:

```tsx
        {/* Oyning asosiy raqami. Oylik to'lov oylarida (2026-09 dan): hisoblandi /
            to'landi / qoldi — ADR-0058. Undan oldingi oylar: eski «Oy oxiriga
            kutilyapti» (bosilsa kunlik siljish). Raqamlarning hammasi serverdan. */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {d.monthCharges ? "Oy to'lovlari" : "Tushum ko'rsatkichlari"}
          </p>
          {d.monthCharges ? (
            <div className="space-y-2.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Receipt className="size-3.5 text-sky-500" />
                      Bu oy hisoblandi
                    </span>
                    <span className="font-medium">
                      {fmt(d.monthCharges.charged)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy uchun o&apos;quvchilarga yozilgan oylik hisoblar
                  yig&apos;indisi — chegirmalar bilan, ketgan va bekor qilingan
                  darslar uchun qaytarilgani ayirilgan.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowUpRight className="size-3.5 text-green-500" />
                      To&apos;landi
                    </span>
                    <span className="font-medium text-green-600">
                      {fmt(d.monthCharges.paid)} so&apos;m
                      {d.monthCharges.paidPct !== null &&
                        ` (${d.monthCharges.paidPct}%)`}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy hisoblaridan to&apos;langan qismi. To&apos;lov avval
                  eng eski qarzni yopadi: eski qarzi bor o&apos;quvchining
                  to&apos;lovi avval o&apos;sha qarzga ketadi.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-between text-sm cursor-help">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <ArrowDownRight className="size-3.5 text-red-500" />
                      Qoldi
                    </span>
                    <span
                      className={cn(
                        "font-medium",
                        d.monthCharges.unpaid > 0 && "text-red-600",
                      )}
                    >
                      {fmt(d.monthCharges.unpaid)} so&apos;m
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72">
                  Shu oy hisoblaridan hali to&apos;lanmagan qismi.
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* the existing «Oy oxiriga kutilyapti» Tooltip button, unchanged
                  (old lines 382-414), still opening the history dialog */}
            </div>
          )}
        </div>
```

The `else` branch is the existing «Oy oxiriga kutilyapti» `<Tooltip>…</Tooltip>` block (old :383-414), moved as is. The «Hisoblangan darslar» (:415-434) and «Tushgan tushum» (:435-453) rows are deleted (A2.3 — the «Tushumlar» card already shows `income.actual`). If `cn` is not imported in this file, import it from `@/lib/utils`. Remove icon imports that become unused.

- [ ] **Step 5: Client — the drill-down**

`income-attribution-panel.tsx`: add prop `monthCharges?: MonthCharges | null` (import the type from `./payments-overview`). Before the «Oy rejasidan yig'ildi» block insert, for `monthCharges && isSingleMonth`:

```tsx
          {/* Oylik to'lov oyi (ADR-0058): yig'im = to'landi ÷ hisoblandi —
              «Oy to'lovlari» kartasi bilan bir xil raqamlar, serverdan. */}
          {monthCharges && isSingleMonth && (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">To&apos;landi</span>
                <span className="text-sm font-semibold tabular-nums">
                  {monthCharges.paidPct ?? 0}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-500"
                  style={{ width: `${Math.min(monthCharges.paidPct ?? 0, 100)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Oy hisobi {formatPrice(monthCharges.charged)} so&apos;m — shundan{" "}
                {formatPrice(monthCharges.paid)} so&apos;m to&apos;landi,{" "}
                {formatPrice(monthCharges.unpaid)} so&apos;m qoldi
              </p>
            </div>
          )}
```

Change the two existing conditions so they apply only without month charges: the «Oy rejasidan yig'ildi» block renders when `!monthCharges && expectedMonthEnd != null && expectedMonthEnd > 0 && isSingleMonth`; the «Yig'im» fallback renders when `!(monthCharges && isSingleMonth) && !(expectedMonthEnd != null && expectedMonthEnd > 0 && isSingleMonth) && data.collectionPct !== null`.

`kpi-chart-dialog.tsx`: add `monthCharges?: MonthCharges | null` to the props next to `expectedMonthEnd`, destructure it, pass `monthCharges={monthCharges}` to `IncomeAttributionPanel` (:295). `payments-overview.tsx:667`: pass `monthCharges={d.monthCharges}` next to `expectedMonthEnd`.

- [ ] **Step 6: Client checks**

Run (from `client/`): `npx tsc --noEmit && npx eslint src/components/payments && npx vitest run src/components/payments`
Expected: no errors; existing tests pass (fix any fixture that still has `income.billed`).

- [ ] **Step 7: Commit**

```bash
git add client/src/components/payments
git commit -m "feat(moliya): «Oy to'lovlari» — hisoblandi, to'landi, qoldi; ikki noto'g'ri qator olindi (A2.1, A2.3)"
```

---

### Task 3: Bosh sahifa — «Bu oy hisoblandi» card

**Files:**
- Modify: `server/src/dashboard/dashboard-summary.service.ts:147-179`, `server/src/dashboard/dashboard-summary.types.ts:10`
- Modify: `client/src/components/dashboard/dashboard-summary-types.ts:19`, `client/src/components/dashboard/home-money-cards.tsx:77-84`
- Test: `server/src/dashboard/dashboard-summary.service.spec.ts`

**Interfaces:**
- Consumes: `overview.monthCharges` from `ReportsService.getFinancialOverview` (Task 1).
- Produces: `money.monthCharges: { charged: number; paid: number; unpaid: number; paidPct: number | null } | null` on `GET /dashboard/summary`.

- [ ] **Step 1: Failing test**

In `dashboard-summary.service.spec.ts`, make the mocked `reports.getFinancialOverview` return `monthCharges: { month: '2026-10', charged: 900_000, paid: 600_000, unpaid: 300_000, paidPct: 66.7, students: 2 }` and assert `money.monthCharges` equals `{ charged: 900_000, paid: 600_000, unpaid: 300_000, paidPct: 66.7 }`; with `monthCharges: null` assert `money.monthCharges` is `null`.

Run: `npx jest src/dashboard/dashboard-summary.service.spec.ts` — expected FAIL.

- [ ] **Step 2: Server**

In `buildMoney` add, next to `expectedMonthEnd` (:172):

```ts
      monthCharges: overview.monthCharges
        ? {
            charged: overview.monthCharges.charged,
            paid: overview.monthCharges.paid,
            unpaid: overview.monthCharges.unpaid,
            paidPct: overview.monthCharges.paidPct,
          }
        : null,
```

Add the field to `dashboard-summary.types.ts`. Run the spec — expected PASS.

- [ ] **Step 3: Client**

Add `monthCharges: { charged: number; paid: number; unpaid: number; paidPct: number | null } | null;` to the client money type. In `home-money-cards.tsx` replace the «Oy oxiriga kutilyapti» card (:77-84) with:

```tsx
      {money.monthCharges ? (
        <MoneyCard
          icon={TrendingUp}
          label="Bu oy hisoblandi"
          value={money.monthCharges.charged}
          hint={
            money.monthCharges.paidPct !== null
              ? `to'landi ${money.monthCharges.paidPct}%`
              : "to'lov yo'q"
          }
          tooltip="Shu oy uchun o'quvchilarga yozilgan oylik hisoblar. To'landi — shundan to'langan qismi."
          href="/payments/overview"
        />
      ) : (
        <MoneyCard
          icon={TrendingUp}
          label="Oy oxiriga kutilyapti"
          value={money.expectedMonthEnd}
          hint="prognoz"
          tooltip="Oy oxirigi prognoz: o'tilgan va rejadagi darslar qiymati. Bu kassa tushumi emas — ikkovi turli o'lchov, shuning uchun ular ayirilmaydi."
          href="/payments/overview"
        />
      )}
```

Run (from `client/`): `npx tsc --noEmit && npx eslint src/components/dashboard && npx vitest run src/components/dashboard` — expected PASS (update fixtures that build a `money` object).

- [ ] **Step 4: Commit**

```bash
git add server/src/dashboard client/src/components/dashboard
git commit -m "feat(bosh-sahifa): «Bu oy hisoblandi» kartasi (A2.1)"
```

---

### Task 4: Telegram — 21:00 report and «💰 Moliyaviy xulosa»

**Files:**
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts:520-553` (month block) and the method that already wraps `getMonthlyExpectation` (`computeExpectation`, :752-769)
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts:288-310`
- Test: `telegram-group-daily-report.service.spec.ts`, `telegram-group-report-menu.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getMonthCharges`, `isMonthlyBillingMonth`, `MonthCharges` (Task 1).

- [ ] **Step 1: Failing tests — daily report**

In `telegram-group-daily-report.service.spec.ts`, with the existing fixtures and `reportsService.getMonthCharges` mocked to `{ month: '2026-10', charged: 177_000_000, paid: 135_900_000, unpaid: 41_100_000, paidPct: 76.8, students: 237 }`, for a run dated in October 2026 assert the message contains, in this order:

```
• Bu oy hisoblandi: <b>177 000 000 so'm</b>
• To'landi: <b>135 900 000 so'm</b> (<b>76.8%</b>)
• Qoldi: <b>41 100 000 so'm</b>
```

(use the file's own `formatSum` for the expected strings — check its exact output for these numbers before writing them), and does NOT contain `Oy oxiriga kutilyapti`, `Oy rejasidan yig'ildi` or `Shundan yig'ildi`. Add a second case: `getMonthCharges` rejects → the three lines are absent and the message is still sent. Add a third: a run dated in August 2026 → `getMonthCharges` not called and the old lines appear as before.

Run: `npx jest src/telegram-groups/telegram-group-daily-report.service.spec.ts` — expected FAIL.

- [ ] **Step 2: Daily report**

Next to `computeExpectation` add:

```ts
  /** «Bu oy hisoblandi / To'landi / Qoldi» (ADR-0058); null before 2026-09 or on failure. */
  private async computeMonthCharges(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<MonthCharges | null> {
    if (!isMonthlyBillingMonth(month)) return null;
    try {
      return await this.reportsService.getMonthCharges(companyId, {
        month,
        branchIds,
      });
    } catch (err) {
      this.logger.warn(`Oy hisoblari olinmadi: ${(err as Error).message}`);
      return null;
    }
  }
```

Call it where `computeExpectation` is called, with the same month and branch scope (use the same variable names that call uses; the injected `ReportsService` field is the one `computeExpectation` already calls). Then in the month block (:520-553): when `monthCharges` is not null push the three lines and skip the «Shundan yig'ildi», «Oy oxiriga kutilyapti» and «Oy rejasidan yig'ildi» lines; keep «Shu oyning darslari» (the revenue recognised so far). When it is null, the block stays exactly as it is today:

```ts
    if (monthCharges) {
      lines.push(
        `• Bu oy hisoblandi: <b>${formatSum(monthCharges.charged)}</b>`,
      );
      lines.push(
        `• To'landi: <b>${formatSum(monthCharges.paid)}</b>` +
          (monthCharges.paidPct !== null
            ? ` (<b>${monthCharges.paidPct}%</b>)`
            : ''),
      );
      lines.push(`• Qoldi: <b>${formatSum(monthCharges.unpaid)}</b>`);
    }
```

Place it after «Shu oyning darslari». Keep `resolveTrafficLight` (:690) inputs unchanged. Update the file's header comment (:40-53) so it names the new lines.

Run the spec — expected PASS.

- [ ] **Step 3: Failing test — «💰 Moliyaviy xulosa»**

In `telegram-group-report-menu.service.spec.ts` add: for a card in October 2026 with `getMonthCharges` mocked as above the card contains `Bu oy hisoblandi`, `To'landi`, `Qoldi` and does not contain `Oy oxiriga kutilyapti: 0`; for August 2026 with `getMonthlyExpectation` mocked to `expectedValue: 150_000_000` the card says `Oy oxiriga kutilyapti: ` followed by `formatSum(150_000_000)` (A2.2: today it prints the raw service's hard-coded 0).

Run: `npx jest src/telegram-groups/telegram-group-report-menu.service.spec.ts` — expected FAIL.

- [ ] **Step 4: «💰 Moliyaviy xulosa»**

In `sendFinancialCard` replace the line `• Oy oxiriga kutilyapti: ${formatSum(o.income.expected)}` (:307) with: for `isMonthlyBillingMonth(month)` the three lines of Step 2 from `this.reportsService.getMonthCharges(companyId, { month, branchIds })`; otherwise `• Oy oxiriga kutilyapti: ${formatSum(expectation.expectedValue)}` from `this.reportsService.getMonthlyExpectation(companyId, { month, branchIds })`. `month` is the month the card already resolves for its title; `branchIds` is the scope it already passes to `getFinancialOverview`. If `ReportsService` is not injected under that name, use the field the card uses for `getMonthlyNetProfit`.

Run the spec — expected PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
npx prettier --write src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/telegram-group-report-menu.service.ts src/telegram-groups/*.spec.ts
npx eslint src/telegram-groups --quiet
git add server/src/telegram-groups
git commit -m "feat(telegram): oyning hisoblandi/to'landi/qoldi raqamlari; «Moliyaviy xulosa» endi 0 demaydi (A2.1, A2.2)"
```

If ESLint reports `no-irregular-whitespace` in a spec, run `perl -i -pe 's/\xc2\xa0/\\u00A0/g' <file>` and lint once more.

---

### Task 5: Excel — block 4 for monthly months, the Tashkent month, the glossary

**Files:**
- Modify: `server/src/reports/reports-excel.service.ts:135-138` (month), `:265-290` (fetch)
- Modify: `server/src/reports/reports-excel.workbook-input.ts:164-224` (`buildSummaryInput`)
- Modify: `server/src/reports/reports-excel.summary-sheet.ts:321-390` (`buildBlock4`)
- Modify: `server/src/reports/reports-excel.sheets.ts:530-560` (glossary)
- Test: `server/src/reports/reports-excel.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getMonthCharges`, `isMonthlyBillingMonth`, `MonthCharges` (Task 1). Check how `ReportsExcelService` reaches the expectation (`getMonthlyExpectation` at :279-282) and call `getMonthCharges` through the same dependency.

- [ ] **Step 1: Failing tests**

In `reports-excel.service.spec.ts`:
1. Generate October 2026 with `getMonthCharges` mocked to `charged 900 000, paid 600 000, unpaid 300 000, paidPct 66.7`. Assert the «Xulosa» sheet's block 4 title contains `OYLIK HISOBLARI`, rows read `Oktabr hisobi` = 900 000, `shundan to'langan` = 600 000, `to'lanmagan` = 300 000, and that the sheet does not contain `hammasi to'langan`.
2. Same with `unpaid 0` → the to'lanmagan row reads `Yo'q — hammasi to'langan`.
3. August 2026 → block 4 is today's (`DARSLARINING PULI QAYERDAN KELGAN`) and `getMonthCharges` is not called.
4. With no `startDate` and the clock at `2026-09-30T20:00:00Z` (01.10 01:00 Tashkent, use `jest.useFakeTimers().setSystemTime(...)`), the workbook's month is October (`monthStr === '2026-10'`; assert through whatever the sheet prints as the month label or through the month passed to `getMonthCharges`).

Use the helpers the spec already has for reading a cell/row by label.

Run: `npx jest src/reports/reports-excel.service.spec.ts` — expected FAIL.

- [ ] **Step 2: Month in Tashkent time**

Replace :135-138:

```ts
    const monthStr = query.startDate
      ? query.startDate.slice(0, 7)
      : tashkentMonthKey(new Date());
```

(import `tashkentMonthKey` from `../common/date/tashkent`; delete `now` if unused).

- [ ] **Step 3: Fetch and pass the month figure**

Next to the expectation fetch (:279-282) add `isMonthlyBillingMonth(monthStr) ? this.<reports>.getMonthCharges(companyId, { month: monthStr, branchIds }) : Promise.resolve(null)` into the same `Promise.all`, and pass `monthCharges` to `buildSummaryInput` → into the summary input next to `lessonMoney` as `monthCharges: MonthCharges | null`.

- [ ] **Step 4: Block 4 for monthly months**

In `reports-excel.summary-sheet.ts`, make `buildBlock4` branch at its top: when `input.monthCharges` is set, write

| Row label | Value | «Jamidan %» |
|---|---|---|
| `${curLabel} hisobi` | `charged` | 100% |
| `shundan to'langan` | `paid` | `paid ÷ charged` |
| `to'lanmagan` | `unpaid` in red, or the text `Yo'q — hammasi to'langan` when `unpaid === 0` | `unpaid ÷ charged` |

under the title `` `4.  ${curLabel.toUpperCase()} OYLIK HISOBLARI` `` and the note `Oyning boshida yozilgan oylik hisoblar: qancha to'langani va qancha qolgani. To'lov avval eng eski qarzni yopadi.`. Reuse the existing row/percent/red-style helpers of `buildBlock4` (do not create new styles). Otherwise keep today's block exactly.

- [ ] **Step 5: Glossary**

In `reports-excel.sheets.ts` add an «Izoh» entry next to «Oy oxiriga kutilyapti» (:537-540):
- term: `Bu oy hisoblandi`
- text: `Oylik to'lov tizimidagi oy (2026-yil sentabrdan): shu oy uchun o'quvchilarga yozilgan oylik hisoblar yig'indisi. «To'langan» — shundan to'langani, «to'lanmagan» — hali to'lanmagani. To'lov avval eng eski qarzni yopadi.`

Mark the «Oy oxiriga kutilyapti» entry as applying to months before September 2026 (append ` (2026-yil sentabrgacha bo'lgan oylar)`).

- [ ] **Step 6: Run, format, commit**

```bash
npx jest src/reports/reports-excel
npx prettier --write src/reports/reports-excel*.ts
npm run typecheck && npx eslint src/reports
git add server/src/reports
git commit -m "fix(excel): oylik oyda 4-blok hisob/to'langan/to'lanmagan; oy Toshkent vaqti bilan (A2.5)"
```

---

### Task 6: Remove the always-wrong figures (rest of A2.3)

**Files:**
- Server: `server/src/reports/reports-payments.service.ts:266-287, 324-372, 407-445`; `server/src/reports/reports.service.ts:633-643`; `server/src/reports/reports-teacher-payments.service.ts`; `server/src/reports/reports-departed-students.service.ts:64-84, 162-180`; `server/src/reports/reports-excel.operational-sheets.ts` (dead `studentFlowSheet`)
- Client: `client/src/components/reports/payment-reports/payment-reports-client.tsx:9, 36, 45-50, 222-229, 269-282`; `teachers-report-table.tsx:25, 80, 145-147`; `teacher-groups-dialog.tsx:117-119, 145-146, 157-158`; `client/src/components/reports/departed-students/departed-students-kpi-cards.tsx:32, 125-126, 145-147, 157, 170-178`; `departed-students-kpi-cards.test.ts:65`
- Tests: `server/src/reports/reports.service.spec.ts:527-606, 628, 685-744, 796`; `reports-departed-students.service.spec.ts:114-119, 159`

- [ ] **Step 1: «Vaqtida to'lovlar» (server)**

Delete `onTimePayments` from the `GET /reports/payment-reports` response (:266-287), its counting (:433-445), `isPaymentOnTime` (:324-372), the `payment.findMany` that only fed it (:407-426), and the facade pass-through `isPaymentOnTime` (`reports.service.ts:633-643`). Delete the seven `isPaymentOnTime` tests (`reports.service.spec.ts:527-606`) and the `onTimePayments` expectation at :628.

- [ ] **Step 2: Teachers table payment columns (server)**

In `reports-teacher-payments.service.ts` delete the contract-linked payment queries (:67-78, :216-228), the sums (:110-116, :264-274) and the fields `totalPayments` (teacher list) and `paidCount` / `totalPayments` (groups). Sort the teacher list by `debtAmount` descending (was :157) and the groups by `debtAmount` descending (was :304). Keep `debtAmount`, `debtorCount`, `expectedAmount`. Update `reports.service.spec.ts:685-728` (drop the 1 000 000 payment expectation), rename/rewrite :744 to "sorts teachers by debt desc" with fixtures whose debts differ, and drop the paid expectations at :796.

- [ ] **Step 3: «Yo'qotilgan daromad» (server)**

Delete `lostRevenue` (:68, :84) and `lostRevenueOf` (:162-180) from `reports-departed-students.service.ts`; update its spec (:159 exact-match without `lostRevenue`; delete the now-unused contract mock :114-119). Delete the exported-but-never-imported `studentFlowSheet` in `reports-excel.operational-sheets.ts` (confirm with `grep -rn "studentFlowSheet" src scripts`), including its «Yo'qolgan daromad» row.

Run: `npx jest src/reports && npm run typecheck` — expected PASS.

```bash
npx prettier --write src/reports/*.ts
git add server/src/reports
git commit -m "fix(hisobot): «Vaqtida to'lovlar», shartnoma orqali to'lov ustunlari va «Yo'qotilgan daromad» olib tashlandi (A2.3)"
```

- [ ] **Step 4: Client**

- `payment-reports-client.tsx`: delete the «Vaqtida to'lovlar» card (:222-229), its chart dialog (:269-282), its types (:45-50), the card key (:36) and the `Clock` import (:9). Keep `PaymentReportDialog` (other cards use it).
- `teachers-report-table.tsx`: delete the «Jami to'lov» column (header :80, cell :145-147, field :25); the `#` column stays first.
- `teacher-groups-dialog.tsx`: delete «To'laganlar» and «Jami to'lovlar» (headers :117, :119; cells :145-146, :157-158).
- `departed-students-kpi-cards.tsx`: delete the «Yo'qotilgan daromad» card (:170-178), its tooltip text (:145-147) and field (:32); change both grids from `lg:grid-cols-5` to `lg:grid-cols-4` (:125, :157) and the skeleton count from 5 to 4 (:126). Fix the fixture in `departed-students-kpi-cards.test.ts:65`.

Run (from `client/`): `npx tsc --noEmit && npx eslint src/components/reports && npx vitest run src/components/reports` — expected PASS.

```bash
git add client/src/components/reports
git commit -m "fix(hisobot): olib tashlangan raqamlar saytdan ham olindi (A2.3)"
```

---

### Task 7: Bosh sahifa attendance % = the attendance report (A2.6)

**Files:**
- Modify: `server/src/reports/reports-overview.service.ts:144-154`
- Test: `server/src/reports/reports.service.spec.ts:243-285` (the `getKpis` tests)

- [ ] **Step 1: Failing test**

Add to the `getKpis` tests: groupBy returns PRESENT 70, LATE 10, ABSENT 10, EXCUSED 10 → `averageAttendance` is `89` (`round(80 / 90 × 100)`), not `80`.

Run: `npx jest src/reports/reports.service.spec.ts -t "attendance"` — expected FAIL (80).

- [ ] **Step 2: Fix**

At :144-150 make the denominator leave EXCUSED out, the formula the attendance report uses (`reports-attendance-analytics.service.ts:297-307`): `round((PRESENT + LATE) / (PRESENT + LATE + ABSENT) × 100)`, 0 when the denominator is 0. Add a one-line comment naming the report's formula as the twin.

Run the spec — PASS. Then:

```bash
npx prettier --write src/reports/reports-overview.service.ts src/reports/reports.service.spec.ts
git add server/src/reports
git commit -m "fix(bosh-sahifa): davomat foizi davomat hisoboti bilan bir xil — sababli maxrajdan chiqadi (A2.6)"
```

Known remaining difference (no change here): the home page uses `singleBranchId`, so a multi-branch director with no branch picked sees the whole company, while the report asks to pick a branch. Name it in the PR body.

---

### Task 8: A cancelled refund or write-off is not money out (A2.7, A2.10b)

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts:1749-1800` (`getPeriodOutflows`)
- Modify: `server/src/reports/net-profit-cache.ts:33`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts:318-329`
- Modify: `server/src/reports/reports-payments.service.ts:21-41, 446`
- Test: `reports-financial.service.spec.ts:694`, `telegram-group-daily-report.service.spec.ts`, `reports-payments.service.spec.ts`

- [ ] **Step 1: Failing tests**

- `reports-financial.service.spec.ts`: change the expectation at :694 to the new `where` (both `reversedAt: null` and `reversedTransactionId: null`), and add a case: the mocked REFUND aggregate returns `_sum.amount = -300_000` → `refunds === 300_000`; a positive sum `+50_000` (should not occur) → `refunds === -50_000` (no `Math.abs`).
- Same for the DEBT_WRITE_OFF memo in `getPeriodOutflows`.
- Daily report spec: the today-flags query for REFUND / DEBT_WRITE_OFF / ADJUSTMENT carries `reversedTransactionId: null` and `reversedAt: null`.

Run: `npx jest src/reports/reports-financial.service.spec.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts` — expected FAIL.

- [ ] **Step 2: Fix**

- `getPeriodOutflows`: add `reversedTransactionId: null` next to `reversedAt: null` in the REFUND query (:1767-1776) and the DEBT_WRITE_OFF query (:1777-1786); replace `Math.abs(sum)` with `0 - sum` at :1799 and :1800. Comment: «Bekor qilish ikki qator yozadi — asl qator `reversedAt` bilan, qarshi qator `reversedTransactionId` bilan; ikkalasi ham chiqariladi, aks holda bekor qilingan qaytarish sof foydada qaytarish bo'lib qoladi.»
- `net-profit-cache.ts:33`: `'v4'` → `'v5'` (the definition changed; cached days must not keep the old figure).
- Daily report flags (:318-329): add `reversedTransactionId: null` to the query.
- `reports-payments.service.ts`: replace `Math.abs(refundsAgg._sum.amount ?? 0)` (:446) with `0 - (refundsAgg._sum.amount ?? 0)`, and rewrite the comment at :21-27 so it is true: this read and `getPeriodOutflows` now filter the same two columns; they still differ on the period end (`lt` here). Add the matching expectation to `reports-payments.service.spec.ts` if it pins the sum.

Run the specs — PASS. Then:

```bash
npx prettier --write src/reports/reports-financial.service.ts src/reports/net-profit-cache.ts src/reports/reports-payments.service.ts src/telegram-groups/telegram-group-daily-report.service.ts src/reports/*.spec.ts src/telegram-groups/*.spec.ts
git add server/src/reports server/src/telegram-groups
git commit -m "fix(foyda): bekor qilingan pul qaytarish va qarz kechirish sof foyda va Telegram'da sanalmaydi (A2.7)"
```

---

### Task 9: Cancelled write-offs elsewhere (A2.9)

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts:1320-1346` (`reconstructMonthCohort` write-off sum), `:1500-1509` (`forgivenCount`), `:1559-1580` (write-off detail list)
- Modify: `server/src/reports/reports-debt-history.service.ts:435-454` (`monthWriteOffs`), `:485-560` (`replay`)
- Test: `reports-financial.service.spec.ts`, `reports-debt-history.service.spec.ts`

- [ ] **Step 1: Failing tests**

`reports-debt-history.service.spec.ts`, replay: a student with DEBT 500 000 in August (a LESSON_DEDUCTION −500 000), a DEBT_WRITE_OFF +500 000 on 10.08 (`reversedAt` set), and its counter-row DEBT_WRITE_OFF −500 000 on 05.09 (`reversedTransactionId` = the original's id). Assert:
- August `debtForgiven === 0` and `debtOther === 500_000`;
- September `debtAdded === 500_000`;
- the month flow identity (opening + added − paid − forgiven − other = closing) holds for both months;
- `monthWriteOffs('2026-08')` lists nothing.

`reports-financial.service.spec.ts`: the cohort's write-off sum and `forgivenCount` queries carry `reversedAt: null, reversedTransactionId: null`; the detail list query too.

Run: `npx jest src/reports/reports-debt-history.service.spec.ts src/reports/reports-financial.service.spec.ts` — expected FAIL.

- [ ] **Step 2: Fix**

- `monthWriteOffs`: add `reversedAt: null, reversedTransactionId: null` to the `where`.
- `replay`: add `reversedAt: true, reversedTransactionId: true` to the row select (:487-493). In the classification (:550-560), a decrease from a `DEBT_WRITE_OFF` row whose `reversedAt` is set goes to `debtOther`, not `debtForgiven`; every other branch is unchanged (a counter-row's increase already lands in `debtAdded`). Keep both rows in the walk — the replay must reproduce the balance, and `replayDebtOrigin` must keep seeing the same rows as `DebtAgeService` (one rule for both surfaces). Comment: «Bekor qilingan kechirish «Kechirildi» emas: u vaqtincha qarzni kamaytirgan, keyin qaytgan.»
- `reconstructMonthCohort` (:1320-1329) and `forgivenCount` (:1500-1509): the write-off sums after the month end filter `reversedAt: null, reversedTransactionId: null`. The balance reconstruction itself (all rows) does not change.
- Detail list (:1559-1580): filter both columns in the query; drop the flags it returned (:1631-1632) if nothing reads them (`grep -rn "isReversal\|wasReversed" src/reports` — use the actual field names).

Run the specs — PASS. Then:

```bash
npx prettier --write src/reports/reports-financial.service.ts src/reports/reports-debt-history.service.ts src/reports/*.spec.ts
git add server/src/reports
git commit -m "fix(qarz-tarixi): bekor qilingan qarz kechirish «Kechirildi»da ko'rinmaydi (A2.9)"
```

---

### Task 10: A multi-branch director's payroll follows the picked branch (A2.8)

**Files:**
- Modify: `server/src/salary/shared/payroll-branch-scope.ts` (types, `resolvePayrollBranchScope`, `narrowPayrollScope`, `scopeToBranchFilter`)
- Modify callers if the type change requires: `server/src/salary/shared/resolve-monthly-scope.ts:141`, `server/src/salary/salary-overview.service.ts:89`, `server/src/salary/salary-staff-config.service.ts:89`
- Test: `server/src/salary/salary.branch-selection.spec.ts:104`, the spec of `payroll-branch-scope.ts` if one exists

**Interfaces:**
- `export type PayrollBranchScope = { kind: 'all' } | { kind: 'branches'; branchIds: number[]; mainBranch: number | null } | { kind: 'none' }`
- `narrowPayrollScope(scope, requestedBranchId)` keeps its signature and return type `{ branchId: number | undefined; blocked: boolean }`.

- [ ] **Step 1: Failing tests**

In `salary.branch-selection.spec.ts` (or a new `payroll-branch-scope.spec.ts` next to the file):
- director with `mainBranch 1` and `UserBranch [1, 2]` asks for branch 2 → `{ branchId: 2, blocked: false }`;
- same director asks for branch 3 → `blocked: true`;
- same director asks for nothing → `{ branchId: 1, blocked: false }` (unchanged tiebreak);
- single-branch director (`mainBranch 1`, no UserBranch) asks for 2 → `blocked: true` (unchanged);
- user with no branch at all → `kind: 'none'` → blocked;
- CEO → `all`, requested branch passes through.

Update the existing expectation at :104 if it pinned "blocked" for a branch that is in the director's `UserBranch` list.

Run: `npx jest src/salary/salary.branch-selection.spec.ts` — expected FAIL.

- [ ] **Step 2: Fix**

`resolvePayrollBranchScope`: select `mainBranch`, roles and `branches: { select: { branchId: true } }`; for a non-CEO return `{ kind: 'branches', branchIds: unique([mainBranch, ...userBranches]), mainBranch }`, or `{ kind: 'none' }` when the set is empty. `narrowPayrollScope` for `branches`:

```ts
  if (scope.kind === 'branches') {
    const home = scope.mainBranch ?? scope.branchIds[0];
    if (requestedBranchId == null) return { branchId: home, blocked: false };
    return scope.branchIds.includes(requestedBranchId)
      ? { branchId: requestedBranchId, blocked: false }
      : { branchId: home, blocked: true };
  }
```

`scopeToBranchFilter` has no caller outside specs (`grep -rn "scopeToBranchFilter(" src`) — delete it. Update the file's header comment: it already promised that a multi-branch employee acts in each `UserBranch`, and the code now does. Fix callers that switched on `kind === 'branch'`.

Run: `npx jest src/salary && npm run typecheck` — expected PASS.

- [ ] **Step 3: Net-profit leg test**

In the spec covering `assembleMonthlyNetProfit` (`grep -rln "assembleMonthlyNetProfit\|getMonthlyNetProfit" src/reports/*.spec.ts`), add: a director with `UserBranch [1, 2]` requesting branch 2 → the payroll leg (`getSalaryMonthly`) is called with branch 2 and its totals are subtracted (not 0 from a blocked scope). If the payroll leg is mocked at a level where the scope is not exercised, assert it through `resolveMonthlyScope` instead.

Known limit to write in the PR body: a non-CEO who sends no branch while holding two still gets the main branch's payroll against both branches' revenue; the header switcher always sends a branch for non-CEO users.

```bash
npx prettier --write src/salary/shared/payroll-branch-scope.ts src/salary/*.spec.ts src/salary/shared/*.ts
git add server/src/salary server/src/reports
git commit -m "fix(oylik): ko'p filialli direktor tanlagan filialning oyligi sof foydada hisoblanadi (A2.8)"
```

---

### Task 11: Leftovers — preview of PAUSED groups, course model switch (A2.10a, A2.10d)

**Files:**
- Modify: `server/src/payments/payments-preview.service.ts:119-125`
- Modify: `server/src/courses/courses.service.ts:215-263`
- Test: `payments-preview` spec, `courses.service.spec.ts`

- [ ] **Step 1: Preview failing test**

A student with ACTIVE enrollments in an ACTIVE group (450 000) and a PAUSED group (400 000) → `nextMonthAmount === 450_000` (billing skips PAUSED groups: `monthly-charge.service.ts:176, :1385`).

Run the preview spec — FAIL (850 000).

- [ ] **Step 2: Fix**

Add `statusEnum: GroupStatus.ACTIVE` to the enrollment query's `group` filter (:119-125). Before that, read the file and confirm the same enrollment list does not feed the contract 3.2 reach (`monthly.admission`); if it does, apply the filter only to the list that sums `nextMonthAmount`. PASS.

- [ ] **Step 3: Course switch failing test**

`courses.service.spec.ts`: updating a LESSON_PACK course to `paymentModel: 'MONTHLY'` while one live enrollment of its groups has `prepaidLessonsRemaining: 3` → `BadRequestException` with the message below, and `course.update` not called; with all counters 0 → the update goes through.

- [ ] **Step 4: Fix**

In `CoursesService.update`, before the write, when `dto.paymentModel === 'MONTHLY'` and the current model is `LESSON_PACK`:

```ts
      const withPrepaid = await this.prisma.enrollment.count({
        where: {
          deletedAt: null,
          status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.FROZEN] },
          prepaidLessonsRemaining: { gt: 0 },
          group: { courseId: id, deletedAt: null },
        },
      });
      if (withPrepaid > 0) {
        throw new BadRequestException(
          `Bu kursda oldindan to'langan darslari qolgan ${withPrepaid} ta o'quvchi bor. Avval ularning darslarini hal qiling, keyin kursni oylik to'lovga o'tkazing.`,
        );
      }
```

(Releasing or writing off those lessons moves money and is the CEO's decision; until then the switch is refused rather than leaving stale counters that refunds still read.) PASS.

```bash
npx prettier --write src/payments/payments-preview.service.ts src/courses/courses.service.ts src/payments/*.spec.ts src/courses/*.spec.ts
git add server/src/payments server/src/courses
git commit -m "fix(to'lov): oldindan ko'rishda to'xtatilgan guruh sanalmaydi; paket kursni oylikka o'tkazishda qolgan darslar tekshiriladi (A2.10)"
```

A2.10c needs no code: on «Barcha filiallar» the teachers table already shows the server's «Bir nechta filialga kirish huquqingiz bor — filialni tanlang»; name it in the PR body.

---

### Task 12: ADR, docs, full checks

**Files:**
- Create: `docs/adr/0058-oylik-oyning-asosiy-raqami-hisoblandi.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md` («One month-end expectation», «One canonical Sof foyda», Reports Module), `client/CLAUDE.md` (Financial UI `/payments/overview` row and the KPI panel notes)

- [ ] **Step 1: ADR-0058 (Uzbek)**

Sections, following the newest ADRs (e.g. `docs/adr/0055-*.md`): Holati «Qabul qilindi», Sana 2026-10-01, Bog'liq (ADR-0016, ADR-0052, the spec, `server/src/reports/month-charges.ts`). Kontekst: «Oy oxiriga kutilyapti» is a lesson-value forecast; under monthly billing the month is charged up front, so the honest month figure is the charge, and the collection % against the forecast and against lessons held (above 100% early in the month) answered nothing. Qaror:
1. From 2026-09: «Bu oy hisoblandi» = Σ CHARGED `chargedAmount`; «Qoldi» per student `min(max(0, qarz − keyingi oylar), shu oy)`; «To'landi» = hisoblandi − qoldi; yig'im foizi = to'landi ÷ hisoblandi.
2. Surfaces: Moliya «Oy to'lovlari», Tushumlar oynasi, Bosh sahifa, Telegram 21:00 and «Moliyaviy xulosa», Excel 4-blok. Earlier months unchanged; the daily «oy oxiriga» chart stays only for them.
3. Removed: «Hisoblangan darslar», duplicate «Tushgan tushum», «Vaqtida to'lovlar», teacher payment columns, «Yo'qotilgan daromad».
4. A cancelled refund / write-off (both rows of the pair) is excluded from net profit, the Telegram flags and «Kechirildi».
Taqiqlanadi: computing hisoblandi/to'landi/qoldi anywhere but `month-charges.ts`; summing a month's debt with older debt into «Qoldi». Muqobillar: FIFO per charge row via `replayDebtOrigin` (rejected: the CEO's 27.09 rule is the min-rule, and the per-row replay attributes departure releases to older debt so a month could read more unpaid than it was charged). Oqibatlari: a mock-exam fee or other non-monthly debit is counted against the month first (the min-rule's known overstatement); Qarzdorlik as two numbers is A2 part 2.

- [ ] **Step 2: README row and CLAUDE.md**

Add the 0058 row to `docs/adr/README.md` in number order. `server/CLAUDE.md`: in «One month-end expectation» add that from 2026-09 the four surfaces show `MonthCharges` instead and the expectation remains for earlier months and for «Foyda tarkibi»; in the net-profit section note `NET_PROFIT_CACHE_VERSION` is `v5` because cancelled refunds/write-offs are excluded; in Reports Module mention `GET /reports/financial-overview` returns `monthCharges` (CEO/BD only). `client/CLAUDE.md`: update the `/payments/overview` row (the card is «Oy to'lovlari» for monthly months; the history dialog opens only for earlier months).

- [ ] **Step 3: Full checks**

```bash
cd server && npx prisma generate && npm run typecheck && npx eslint src && npx jest
cd ../server && npm run build
cd ../client && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
```

Expected: all pass. Fix and commit separately if anything fails.

- [ ] **Step 4: Commit**

```bash
git add docs/adr server/CLAUDE.md client/CLAUDE.md
git commit -m "docs: ADR-0058 — oylik oyning asosiy raqami hisoblandi/to'landi/qoldi"
```

- [ ] **Step 5: Merge `origin/main` before the PR**

`git fetch origin && git merge origin/main` (merge commit, never rebase/force). Re-run Step 3 if anything merged. Re-check the ADR number against `origin/main`'s `docs/adr/README.md`; renumber with `git mv` if 0058 was taken. Then stop: the PR, merge and deploy wait for the user.
