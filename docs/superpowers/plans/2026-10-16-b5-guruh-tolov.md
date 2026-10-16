# B5 «Guruhlar bo'yicha to'lov» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Hisobotlar → «To'lov hisobotlari» with «Guruhlar bo'yicha to'lov» (`/reports/payment-reports`): one month's «Hisoblandi / To'landi / Qoldi» from the one month-charges engine, cut by group, teacher and course, with search, sort, «Faqat qarzi borlar», a per-group student drawer and a two-sheet Excel; retire the three old endpoints that counted a debtor's debt once per group.

**Architecture:** `reports/month-charges.ts` gets one pure core (`studentShares`) that both `splitMonthCharges` (totals, output unchanged) and a new `splitMonthChargesByCharge` (each student's unpaid share spread over his charge rows by largest remainder) read, so any grouping of the per-charge shares adds up to the overview's «Qoldi» to the so'm. A new `reports/group-payments/` folder holds the pure aggregation (`group-payments.math.ts`), a service whose loader follows `loadMonthCharges`' scope chain, a controller with three `reports.payments` routes and an Excel builder. The client page reuses the B4 pieces (`UrlSearchBox`, `PaymentsPager`, `drawerState`, `lastPageIfPast`, `MonthStepper`) and computes no figure.

**Tech Stack:** NestJS + Prisma 7 + Jest + exceljs (server); Next.js 16 + React Query 5 + Vitest + shadcn (client). No new dependency, no migration.

**Code in this plan is written compactly; `npx prettier --write` (server only) reformats it. Never run prettier on `client/`.**

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-10-16-b5-guruh-tolov-design.md` — every implementer reads it once, in full, before starting; § numbers below point into it. CEO decisions are §2 and are binding.
- **Where commands run:** worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b5-guruh-tolov`; never `cd` into the main checkout.
- **node_modules:** the worktree has none until Task 1 Step 0 runs `npm install` in `server/` and `client/` and `npx prisma generate` in `server/`.
- **Server commands** (from `server/`): one spec `npx jest <path>`; `npm run typecheck` (jest is transpile-only; this type-checks specs); `npx eslint <files>`; `npx prettier --write <touched .ts files>` before every commit (Prettier failures are CI-blocking).
- **Client commands** (from `client/`): `npx vitest run <path>` (if it errors on `configLoader`, use `npx vitest --config vitest.config.ts run <path>`); `npx tsc --noEmit -p .`; `npm run lint` — errors only. Vitest collects only `src/**/*.test.ts`: component tests are `.test.ts` files that render with `createElement` + `renderToStaticMarkup`, no JSX. **No prettier on `client/` files.**
- **Never commit `client/AGENTS.md`** (`next dev` rewrites it; `git checkout -- client/AGENTS.md`).
- **User-visible text:** Latin-script Uzbek only, exactly the strings in the spec and this plan; no English word on screen (no «KPI», no enum names). Code comments, commit messages and both CLAUDE.md files in English; the ADR and the guide page in Uzbek.
- **Dates:** server months only through `common/date/tashkent.ts` (`tashkentMonthKey`, `addMonthsToMonthKey`); client months through `currentMonthKey()` / `addMonths()` (`components/payments/salary-utils.ts`) and `clampMonth()` (`components/payments/overview/overview-math.ts`). Never `getMonth()`, `getFullYear()` or `toISOString().slice(…)` for a month.
- **Money:** integers in so'm; never `Math.abs` on a ledger amount; «To'landi» = hisoblandi − qoldi everywhere (§4.2). The client formats with `formatPrice` / `formatNumber` / `formatPercent` (`src/lib/format-utils.ts`) and computes no figure — it only rounds the server's one-decimal percentage to a whole number for display (§4.3).
- **One engine:** every number comes from `reports/month-charges.ts` (`studentShares` → `splitMonthCharges` / `splitMonthChargesByCharge`). No second month-charge formula anywhere, and never a group's or teacher's debt from a student's whole balance (§4.1, ADR to be written in Task 10).
- **Access (ADR-0079):** every new route carries `@Can('reports.payments')` and a row in `server/src/common/permissions/route-access.snapshot.json` (default roles `["Administrator", "Branch Director", "CEO"]`), plus a controller spec with `routeAccess()` / `defaultRolesOf()` from `common/permissions/testing.ts`.
- **Branch scope fail-closed:** every new route takes `@BranchScope()` and reads the scope as a LIST (several branches without a pick are summed). An empty scope (`[]`) is refused with 403 «Bu filial ma'lumotlarini ko'rish huquqingiz yo'q» before any query. `@BranchScope()` routes are auto-classified and are NEVER listed in `server/src/common/auth/branch-route-policy.ts`. The client never sends `branchId` (the axios interceptor sends `X-Branch-Id`; the DTOs would 400 on it).
- **Public repo:** invented names, ids, phones and amounts only (`Ism Familiya`, `10001`, `450 000`).
- **Commits:** tests passing, English message ending with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. From `server/` use paths relative to `server/`; for files in both packages or `docs/`, run git from the worktree root. Never `git stash`, `git reset --hard`, rebase or push.
- **ADR number:** `0092` at plan time (`origin/main` ends at 0091). Only Task 10's files carry it; Tasks 1–9 cite «spec B5 §…» in code comments. Task 10 Step 0 re-checks and renames if `main` moved.
- **Rollout (not a task):** no migration, no script. Server and client deploy TOGETHER (§9): the old client page calls the removed endpoints, the new one calls the new endpoints.

---

## File Structure

Server (`server/src/` unless noted):
- Modify `reports/month-charges.ts` (+ spec) — `studentShares` core, `paidPctOf`, `MonthChargeLine`, `ChargeShare`, `splitMonthChargesByCharge`; `splitMonthCharges` output unchanged.
- Create `reports/group-payments/group-payments.math.ts` (+ spec) — month rule, types, group/teacher/course rows, summary, filter/sort/page, student lines, drawer, Excel student lines.
- Create `reports/group-payments/group-payments.service.ts` (+ spec) — loader (scope chain), `rows`, `group`, `excel`.
- Create `reports/group-payments/dto/group-payments-query.dto.ts` (+ spec) — `GroupDrawerQueryDto`, `GroupPaymentsFilterDto`, `GroupPaymentsQueryDto`.
- Create `reports/group-payments/group-payments.controller.ts` (+ spec) — the three routes.
- Create `reports/group-payments/group-payments.excel.ts` (+ spec) — the two-sheet workbook.
- Modify `reports/reports.module.ts` — register the controller and service; drop `ReportsTeacherPaymentsService`.
- Modify `reports/reports-branch-scope-coverage.spec.ts` — the new loader's chain.
- Modify `reports/reports.controller.ts` (+ spec), `reports/reports.service.ts` (+ spec), `reports/reports-payments.service.ts`; delete `reports/reports-teacher-payments.service.ts`, `reports/reports-payments.service.spec.ts`, `reports/dto/payment-reports-query.dto.ts`; modify `scripts/build-report-services.ts` (outside `src/`).
- Modify `common/permissions/route-access.snapshot.json`, `common/permissions/permission-catalog.money.ts` (label).

Client (`client/src/` unless noted):
- Create in `components/reports/group-payments/`: `group-payments-types.ts`, `group-payments-url.ts` (+ test), `group-payments-format.ts` (+ test), `group-payments-queries.ts`, `group-payments-summary.tsx`, `group-payments-filter-bar.tsx`, `group-payments-summary.test.ts`, `group-payments-table.tsx` (+ `group-payments-table.test.ts`), `group-drawer.tsx` (+ `group-drawer.test.ts`), `group-payments-page.tsx`.
- Modify `components/payments/list/payments-table.tsx` — `PaymentsPager` takes `sizes` and `sizeLabel`.
- Modify `app/(dashboard)/reports/payment-reports/page.tsx`, `lib/reports-nav.ts` (+ test), `lib/breadcrumb-routes.ts`, `data/searchable-pages.ts`, `lib/nav-items.ts` (comment), `components/reports/reports-layout-shell.tsx` (comment).
- Delete `components/reports/payment-reports/` (all 14 files).

Docs: `docs/adr/0092-guruhlar-tolovi-hisob-ulushida.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `docs/role-access.md`, `client/src/qollanma/kontent/hisobotlar/guruhlar-tolovi.mdx`, `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`.

---

### Task 1: One share core in month-charges; the per-charge split

**Files:**
- Modify: `server/src/reports/month-charges.ts` (from `export interface MonthChargeRow` to the end of `splitMonthCharges`, today `:39-109`)
- Test: `server/src/reports/month-charges.spec.ts` (existing cases stay unchanged and green; new `describe` appended)

**Interfaces:**
- Consumes: `ReportBranchIds` (`common/finance/report-branch-scope.ts`).
- Produces:
  ```ts
  export interface MonthChargeLine extends MonthChargeRow { id: string; groupId: string; enrollmentId: string }
  export interface ChargeShare { id: string; studentId: number; groupId: string; enrollmentId: string; charged: number; unpaid: number }
  export function paidPctOf(paid: number, charged: number): number | null // one decimal, null when charged is 0
  export function splitMonthCharges(input: { month: string; branchIds: ReportBranchIds; rows: readonly MonthChargeRow[]; balances: ReadonlyMap<number, number> }): MonthCharges // unchanged output
  export function splitMonthChargesByCharge(input: { month: string; branchIds: ReportBranchIds; rows: readonly MonthChargeLine[]; balances: ReadonlyMap<number, number> }): ChargeShare[] // input-row order
  ```

- [ ] **Step 0: Set up the worktree.** From the worktree root: `git fetch origin && git merge --no-edit origin/main` (the branch holds only the spec; expect no conflict). Then `cd server && npm install && npx prisma generate` (if `prisma generate` complains about `DATABASE_URL`, run `ln -s /Users/a1111/Desktop/daf-erp-system/server/.env .env` inside `server/` first — the symlink is git-ignored), and `cd ../client && npm install`.

- [ ] **Step 1: Write the failing spec.** In `month-charges.spec.ts` extend the import and append:

```ts
import {
  isMonthlyBillingMonth,
  loadMonthCharges,
  splitMonthCharges,
  splitMonthChargesByCharge,
  type MonthChargeLine,
  type MonthChargeRow,
} from './month-charges';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

const line = (
  id: string,
  studentId: number,
  groupId: string,
  month: string,
  chargedAmount: number,
  branchId = 1,
): MonthChargeLine => {
  const [periodYear, periodMonth] = month.split('-').map(Number);
  return { id, studentId, groupId, enrollmentId: `e-${id}`, periodYear, periodMonth, branchId, chargedAmount };
};

/** A small seeded generator, so a failing case can be replayed by its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomMonth(seed: number) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const amounts = [0, 1, 137_500, 300_000, 450_000, 999_999];
  const rows: MonthChargeLine[] = [];
  const balances = new Map<number, number>();
  let n = 0;
  const students = 1 + pick(8);
  for (let i = 0; i < students; i++) {
    const studentId = 10001 + i;
    const count = 1 + pick(3);
    for (let k = 0; k < count; k++) {
      n += 1;
      rows.push(line(`c${n}`, studentId, `g${1 + pick(4)}`, '2026-10', amounts[pick(amounts.length)], 1 + pick(2)));
    }
    if (r() < 0.4) {
      n += 1;
      rows.push(line(`c${n}`, studentId, 'g1', r() < 0.5 ? '2026-11' : '2027-01', 450_000));
    }
    if (r() < 0.2) {
      n += 1;
      rows.push(line(`c${n}`, studentId, 'g1', '2026-09', 450_000));
    }
    balances.set(studentId, pick(1_500_001) - 1_000_000);
  }
  return { rows, balances };
}

describe('splitMonthChargesByCharge', () => {
  const base = { month: '2026-10', branchIds: null };

  it('gives a single charge the whole unpaid part', () => {
    const r = splitMonthChargesByCharge({
      ...base,
      rows: [line('c1', 1, 'g1', '2026-10', 450_000)],
      balances: new Map([[1, -100_000]]),
    });
    expect(r).toEqual([
      { id: 'c1', studentId: 1, groupId: 'g1', enrollmentId: 'e-c1', charged: 450_000, unpaid: 100_000 },
    ]);
  });

  it('splits by charge share; the largest remainder takes the so\'m left by rounding', () => {
    // 7 over 300 / 300 / 400 = 2.1 / 2.1 / 2.8 → 2 / 2 / 3.
    const r = splitMonthChargesByCharge({
      ...base,
      rows: [line('c1', 1, 'g1', '2026-10', 300), line('c2', 1, 'g2', '2026-10', 300), line('c3', 1, 'g3', '2026-10', 400)],
      balances: new Map([[1, -7]]),
    });
    expect(r.map((s) => s.unpaid)).toEqual([2, 2, 3]);
  });

  it('breaks an equal remainder by charge id, so row order never changes the answer', () => {
    // 5 over 100 / 200 / 700 = 0.5 / 1 / 3.5: c1 and c3 tie, c1 wins.
    const rows = [line('c3', 1, 'g3', '2026-10', 700), line('c1', 1, 'g1', '2026-10', 100), line('c2', 1, 'g2', '2026-10', 200)];
    const r = splitMonthChargesByCharge({ ...base, rows, balances: new Map([[1, -5]]) });
    expect(Object.fromEntries(r.map((s) => [s.id, s.unpaid]))).toEqual({ c1: 1, c2: 1, c3: 3 });
  });

  it('a student who owes nothing has 0 on every charge', () => {
    const r = splitMonthChargesByCharge({
      ...base,
      rows: [line('c1', 1, 'g1', '2026-10', 300_000), line('c2', 1, 'g2', '2026-10', 150_000)],
      balances: new Map([[1, 20_000]]),
    });
    expect(r.map((s) => s.unpaid)).toEqual([0, 0]);
  });

  it('later months and other branches get no entry but still shape the share', () => {
    // Debt 650 000 − November 450 000 = 200 000 of October; branch 2 holds 100 of 400 → 50 000.
    const r = splitMonthChargesByCharge({
      month: '2026-10',
      branchIds: [2],
      rows: [
        line('c1', 1, 'g1', '2026-10', 300_000, 1),
        line('c2', 1, 'g2', '2026-10', 100_000, 2),
        line('c3', 1, 'g1', '2026-11', 450_000, 1),
      ],
      balances: new Map([[1, -650_000]]),
    });
    expect(r).toEqual([
      { id: 'c2', studentId: 1, groupId: 'g2', enrollmentId: 'e-c2', charged: 100_000, unpaid: 50_000 },
    ]);
  });

  it('an empty scope answers nothing (fail closed)', () => {
    const r = splitMonthChargesByCharge({
      month: '2026-10',
      branchIds: [],
      rows: [line('c1', 1, 'g1', '2026-10', 450_000)],
      balances: new Map([[1, -450_000]]),
    });
    expect(r).toEqual([]);
  });

  it.each<[string, ReportBranchIds]>([
    ['every branch', null],
    ['branch 1', [1]],
    ['branch 2', [2]],
    ['no branch', []],
  ])('random months (%s): the charges add up to splitMonthCharges exactly', (_name, branchIds) => {
    for (let seed = 1; seed <= 300; seed++) {
      const input = { month: '2026-10', branchIds, ...randomMonth(seed) };
      const total = splitMonthCharges(input);
      const shares = splitMonthChargesByCharge(input);
      const perStudent = new Map<number, number>();
      for (const s of shares) {
        expect(s.unpaid).toBeGreaterThanOrEqual(0);
        expect(s.unpaid).toBeLessThanOrEqual(s.charged);
        perStudent.set(s.studentId, (perStudent.get(s.studentId) ?? 0) + s.unpaid);
      }
      const sum = (k: 'charged' | 'unpaid') => shares.reduce((acc, s) => acc + s[k], 0);
      expect({
        seed,
        charged: sum('charged'),
        unpaid: sum('unpaid'),
        students: perStudent.size,
        unpaidStudents: [...perStudent.values()].filter((u) => u > 0).length,
      }).toEqual({
        seed,
        charged: total.charged,
        unpaid: total.unpaid,
        students: total.students,
        unpaidStudents: total.unpaidStudents,
      });
    }
  });
});
```
(The `row` helper the existing cases use stays; `MonthChargeRow` stays imported for it.)

- [ ] **Step 2: Run** `cd server && npx jest src/reports/month-charges.spec.ts` → FAIL (`splitMonthChargesByCharge` is not exported).

- [ ] **Step 3: Implement.** Replace the code from `export interface MonthChargeRow {` to the closing `}` of `splitMonthCharges` with:

```ts
export interface MonthChargeRow {
  studentId: number;
  periodYear: number;
  periodMonth: number;
  branchId: number;
  chargedAmount: number;
}

/** A charge row the per-charge split names in its answer (spec B5 §4.2). */
export interface MonthChargeLine extends MonthChargeRow {
  id: string;
  groupId: string;
  enrollmentId: string;
}

/** One in-scope charge of the month and its part of the student's unpaid share. */
export interface ChargeShare {
  id: string;
  studentId: number;
  groupId: string;
  enrollmentId: string;
  charged: number;
  unpaid: number;
}

interface SplitInput<R extends MonthChargeRow> {
  month: string;
  branchIds: ReportBranchIds;
  rows: readonly R[];
  balances: ReadonlyMap<number, number>;
}

/** paid ÷ charged, one decimal; null when nothing was charged. */
export function paidPctOf(paid: number, charged: number): number | null {
  return charged > 0 ? Math.round((paid / charged) * 1000) / 10 : null;
}

const monthIndex = (month: string): number => {
  const [y, m] = month.split('-').map(Number);
  return y * 12 + m;
};

const inScope = (branchIds: ReportBranchIds, branchId: number): boolean =>
  branchIds === null || branchIds.includes(branchId);

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
 * several branches share his unpaid part by amount: `scope` is his in-scope
 * charge, `unpaid` the in-scope share. The ONE formula — `splitMonthCharges`
 * adds these up and `splitMonthChargesByCharge` spreads them; nothing else may
 * compute a month's unpaid part.
 */
function studentShares(
  input: SplitInput<MonthChargeRow>,
): Map<number, { scope: number; unpaid: number }> {
  const target = monthIndex(input.month);
  const per = new Map<number, { all: number; scope: number; later: number }>();
  for (const r of input.rows) {
    const key = r.periodYear * 12 + r.periodMonth;
    if (key < target) continue;
    const s = per.get(r.studentId) ?? { all: 0, scope: 0, later: 0 };
    if (key > target) {
      s.later += r.chargedAmount;
    } else {
      s.all += r.chargedAmount;
      if (inScope(input.branchIds, r.branchId)) s.scope += r.chargedAmount;
    }
    per.set(r.studentId, s);
  }
  const out = new Map<number, { scope: number; unpaid: number }>();
  for (const [studentId, s] of per) {
    if (s.scope <= 0) continue;
    const debt = Math.max(0, -(input.balances.get(studentId) ?? 0));
    const unpaidAll = Math.min(Math.max(0, debt - s.later), s.all);
    out.set(studentId, {
      scope: s.scope,
      unpaid: Math.round((unpaidAll * s.scope) / s.all),
    });
  }
  return out;
}

/** «Bu oy hisoblandi / To'landi / Qoldi» in scope (ADR-0058): the students' shares added up. */
export function splitMonthCharges(input: SplitInput<MonthChargeRow>): MonthCharges {
  let charged = 0;
  let unpaid = 0;
  let unpaidStudents = 0;
  const shares = studentShares(input);
  for (const s of shares.values()) {
    charged += s.scope;
    unpaid += s.unpaid;
    if (s.unpaid > 0) unpaidStudents += 1;
  }
  const paid = charged - unpaid;
  return {
    month: input.month,
    charged,
    paid,
    unpaid,
    paidPct: paidPctOf(paid, charged),
    students: shares.size,
    unpaidStudents,
  };
}

/**
 * Pure. Each student's unpaid share (`studentShares`) spread over his in-scope
 * charges of `month` by `chargedAmount`. The so'm left by rounding go to the
 * largest remainders (ties by charge id), so a student's charges add up to his
 * share EXACTLY and any grouping of the answer adds up to `splitMonthCharges`'
 * `unpaid` (spec B5 §4.2). Rows of later months, of other branches and of
 * students with nothing charged in scope get no entry. Integer arithmetic:
 * `unpaid × chargedAmount` stays far below 2^53.
 */
export function splitMonthChargesByCharge(
  input: SplitInput<MonthChargeLine>,
): ChargeShare[] {
  const shares = studentShares(input);
  const target = monthIndex(input.month);
  const mine = input.rows.filter(
    (r) =>
      r.periodYear * 12 + r.periodMonth === target &&
      inScope(input.branchIds, r.branchId) &&
      shares.has(r.studentId),
  );
  const byStudent = new Map<number, MonthChargeLine[]>();
  for (const r of mine) {
    const list = byStudent.get(r.studentId);
    if (list) list.push(r);
    else byStudent.set(r.studentId, [r]);
  }
  const unpaidById = new Map<string, number>();
  for (const [studentId, lines] of byStudent) {
    const { scope, unpaid } = shares.get(studentId)!;
    const parts = lines.map((l) => ({
      id: l.id,
      base: Math.floor((unpaid * l.chargedAmount) / scope),
      rem: (unpaid * l.chargedAmount) % scope,
    }));
    let left = unpaid - parts.reduce((s, p) => s + p.base, 0);
    for (const p of [...parts].sort((a, b) => b.rem - a.rem || (a.id < b.id ? -1 : 1))) {
      if (left <= 0) break;
      p.base += 1;
      left -= 1;
    }
    for (const p of parts) unpaidById.set(p.id, p.base);
  }
  return mine.map((r) => ({
    id: r.id,
    studentId: r.studentId,
    groupId: r.groupId,
    enrollmentId: r.enrollmentId,
    charged: r.chargedAmount,
    unpaid: unpaidById.get(r.id) ?? 0,
  }));
}
```
`loadMonthCharges` and the `MonthCharges` interface do not change.

- [ ] **Step 4: Run** `npx jest src/reports/month-charges.spec.ts src/reports src/telegram-groups/utils` → PASS (every existing `splitMonthCharges` case unchanged); `npm run typecheck` → clean.

- [ ] **Step 5: Commit**
```bash
cd server && npx prettier --write src/reports/month-charges.ts src/reports/month-charges.spec.ts
npx eslint src/reports/month-charges.ts src/reports/month-charges.spec.ts
git add src/reports/month-charges.ts src/reports/month-charges.spec.ts
git commit -m "feat(reports): one share core for month charges and a per-charge split by largest remainder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The group-payments aggregation (pure)

**Files:**
- Create: `server/src/reports/group-payments/group-payments.math.ts`
- Test: `server/src/reports/group-payments/group-payments.math.spec.ts`

**Interfaces:**
- Consumes: `paidPctOf`, `MONTHLY_BILLING_START_MONTH`, `splitMonthCharges`, `splitMonthChargesByCharge`, `MonthChargeLine` (Task 1); `tashkentMonthKey` (`common/date/tashkent.ts`).
- Produces (all exported from `group-payments.math.ts`):
  ```ts
  export type Kesim = 'guruh' | 'ustoz' | 'kurs';
  export type Tartib = 'foiz' | 'qoldi' | 'nomi';
  export type GroupMark = 'ochirilgan' | 'yopilgan';
  export type PayStatus = 'toladi' | 'qisman' | 'tolamagan';
  export type StudentMark = 'arxivda' | 'muzlatilgan' | 'chiqqan';
  export const KESIMLAR: readonly Kesim[]; export const TARTIBLAR: readonly Tartib[]; export const USTOZSIZ_ID = 'ustozsiz';
  export interface GpCharge { id: string; studentId: number; groupId: string; enrollmentId: string; charged: number; unpaid: number; enrollmentStatus: EnrollmentStatus; enrollmentCreatedAt: Date }
  export interface GpGroup { id: string; name: string; groupNumber: number | null; courseId: string; courseName: string; teachers: { id: number; name: string }[]; deleted: boolean; closed: boolean }
  export interface GpStudent { id: number; firstName: string; lastName: string; phone: string; archived: boolean }
  export interface GpData { month: string; charges: GpCharge[]; groups: Map<string, GpGroup>; students: Map<number, GpStudent> }
  export interface GpTotals { charged: number; paid: number; unpaid: number; paidPct: number | null; students: number; unpaidStudents: number }
  export interface GpSummary extends GpTotals { groups: number; fullyPaidGroups: number; underHalfGroups: number; avgGroupPct: number | null }
  export interface GpRow extends GpTotals { id: string; name: string; sub: string; teachers?: string[]; marks: GroupMark[] }
  export interface GpRowsResponse { month: string; summary: GpSummary; rows: GpRow[]; total: number; multiTeacherNote: boolean }
  export interface GpStudentLine { id: number; firstName: string; lastName: string; phone: string; charged: number; paid: number; unpaid: number; status: PayStatus; mark: StudentMark | null }
  export interface GpGroupResponse { group: { id: string; name: string; course: string; teachers: string[]; deleted: boolean; closed: boolean }; charged: number; paid: number; unpaid: number; paidPct: number | null; students: GpStudentLine[] }
  export interface GpRawQuery { oy?: string; kesim?: Kesim; q?: string; tartib?: Tartib; qarzdor?: '1'; sahifa?: number; soni?: number }
  export interface GpFilters { kesim: Kesim; q: string; tartib: Tartib; qarzdor: boolean }
  export interface GpQuery extends GpFilters { sahifa: number; soni: number }
  export interface GpSheetStudent extends GpStudentLine { groupName: string; teachers: string[] }
  export function parseReportMonth(oy: string | undefined, now: Date): string // 400s, spec §5.1
  export function payStatus(charged: number, unpaid: number): PayStatus
  export function studentMark(archived: boolean, status: EnrollmentStatus): StudentMark | null
  export function totalsOf(charges: readonly GpCharge[]): GpTotals
  export function groupRows(data: GpData): GpRow[]; export function teacherRows(data: GpData): GpRow[]; export function courseRows(data: GpData): GpRow[]
  export function summarize(data: GpData): GpSummary
  export function filteredRows(data: GpData, f: GpFilters): GpRow[] // unpaged
  export function buildRowsResponse(data: GpData, q: GpQuery): GpRowsResponse
  export function studentLines(data: GpData, groupId: string): GpStudentLine[]
  export function groupDrawer(data: GpData, groupId: string): GpGroupResponse | null
  export function studentSheetLines(data: GpData, onlyDebtors: boolean): GpSheetStudent[]
  export function toGpQuery(q: GpRawQuery): GpQuery
  ```

- [ ] **Step 1: Write the failing spec** `group-payments.math.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { EnrollmentStatus } from '@prisma/client';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { splitMonthCharges, splitMonthChargesByCharge, type MonthChargeLine } from '../month-charges';
import {
  buildRowsResponse,
  courseRows,
  filteredRows,
  groupDrawer,
  groupRows,
  parseReportMonth,
  payStatus,
  studentLines,
  studentMark,
  studentSheetLines,
  summarize,
  teacherRows,
  toGpQuery,
  type GpCharge,
  type GpData,
  type GpGroup,
  type GpStudent,
} from './group-payments.math';

// Made-up people, groups and amounts.
const charge = (
  id: string,
  studentId: number,
  groupId: string,
  charged: number,
  unpaid: number,
  enrollmentStatus: EnrollmentStatus = 'ACTIVE',
  createdAt = '2026-09-01T05:00:00Z',
): GpCharge => ({ id, studentId, groupId, enrollmentId: `e-${id}`, charged, unpaid, enrollmentStatus, enrollmentCreatedAt: new Date(createdAt) });
const group = (id: string, over: Partial<GpGroup> = {}): GpGroup => ({
  id, name: id.toUpperCase(), groupNumber: null, courseId: 'k1', courseName: 'Nemis tili A1', teachers: [], deleted: false, closed: false, ...over,
});
const student = (id: number, over: Partial<GpStudent> = {}): GpStudent => ({
  id, firstName: 'Ism', lastName: `Familiya${id}`, phone: '900000000', archived: false, ...over,
});
const data = (charges: GpCharge[], groups: GpGroup[], students: GpStudent[] = []): GpData => ({
  month: '2026-10', charges, groups: new Map(groups.map((g) => [g.id, g])), students: new Map(students.map((s) => [s.id, s])),
});

const OLIM = { id: 20001, name: 'Olim Karimov' };
const AZIZA = { id: 20002, name: 'Aziza Rahimova' };

const MONTH = data(
  [
    charge('c1', 10001, 'g1', 450_000, 0),
    charge('c2', 10002, 'g1', 450_000, 450_000, 'FROZEN'),
    charge('c3', 10003, 'g2', 300_000, 100_000, 'DROPPED', '2026-09-01T05:00:00Z'),
    charge('c4', 10003, 'g2', 150_000, 50_000, 'ACTIVE', '2026-10-10T05:00:00Z'),
    charge('c5', 10004, 'g3', 400_000, 400_000),
    charge('c6', 10001, 'g2', 200_000, 0),
    charge('c7', 10005, 'g4', 300_000, 0, 'COMPLETED'),
  ],
  [
    group('g1', { name: 'A1-01', groupNumber: 11, teachers: [OLIM, AZIZA] }),
    group('g2', { name: 'A1-02', groupNumber: 12, teachers: [OLIM] }),
    group('g3', { name: 'B1-01', courseId: 'k2', courseName: 'Nemis tili B1', closed: true }),
    group('g4', { name: 'A2-01', groupNumber: 14, courseId: 'k3', courseName: 'Nemis tili A2', teachers: [AZIZA], deleted: true }),
  ],
  [student(10001), student(10002), student(10003), student(10004, { archived: true }), student(10005)],
);
const Q = toGpQuery({});
const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('parseReportMonth', () => {
  const now = new Date('2026-10-16T07:00:00Z');
  it('no month is the current Tashkent month; a month in range passes', () => {
    expect(parseReportMonth(undefined, now)).toBe('2026-10');
    expect(parseReportMonth('2026-09', now)).toBe('2026-09');
    // 01.11 00:30 in Tashkent is still 31.10 in UTC.
    expect(parseReportMonth(undefined, new Date('2026-10-31T19:30:00Z'))).toBe('2026-11');
  });
  it('refuses a month before September 2026 and a month ahead', () => {
    expect(() => parseReportMonth('2026-08', now)).toThrow(new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi'));
    expect(() => parseReportMonth('2026-11', now)).toThrow(new BadRequestException("Kelajak oyni tanlab bo'lmaydi"));
  });
});

describe('student status and mark (spec §4.4)', () => {
  it('status by what is left', () => {
    expect(payStatus(450_000, 0)).toBe('toladi');
    expect(payStatus(450_000, 1)).toBe('qisman');
    expect(payStatus(450_000, 450_000)).toBe('tolamagan');
    expect(payStatus(0, 0)).toBe('toladi');
  });
  it('mark: an archived card wins, then the enrollment', () => {
    expect(studentMark(false, 'ACTIVE')).toBeNull();
    expect(studentMark(false, 'FROZEN')).toBe('muzlatilgan');
    for (const s of ['DROPPED', 'TRANSFERRED', 'COMPLETED'] as const) expect(studentMark(false, s)).toBe('chiqqan');
    expect(studentMark(true, 'ACTIVE')).toBe('arxivda');
  });
});

describe('group rows', () => {
  it('one row per group; two charges of one student in one group are one student', () => {
    const rows = Object.fromEntries(groupRows(MONTH).map((r) => [r.id, r]));
    expect(rows.g1).toEqual({
      id: 'g1', name: 'A1-01', sub: 'Nemis tili A1', teachers: ['Olim Karimov', 'Aziza Rahimova'], marks: [],
      students: 2, charged: 900_000, paid: 450_000, unpaid: 450_000, paidPct: 50, unpaidStudents: 1,
    });
    expect(rows.g2).toMatchObject({ students: 2, charged: 650_000, paid: 500_000, unpaid: 150_000, paidPct: 76.9, unpaidStudents: 1 });
    expect(rows.g3).toMatchObject({ marks: ['yopilgan'], sub: 'Nemis tili B1', teachers: [], paidPct: 0 });
    expect(rows.g4).toMatchObject({ marks: ['ochirilgan'], unpaid: 0, paidPct: 100, unpaidStudents: 0 });
  });
});

describe('teacher rows (current teachers, spec §4.3)', () => {
  it('a two-teacher group counts for both; a student of two groups of one teacher counts once; no teacher → «Ustozsiz»', () => {
    const rows = Object.fromEntries(teacherRows(MONTH).map((r) => [r.name, r]));
    expect(rows['Olim Karimov']).toEqual({
      id: '20001', name: 'Olim Karimov', sub: '2 guruh', marks: [],
      students: 3, charged: 1_550_000, paid: 950_000, unpaid: 600_000, paidPct: 61.3, unpaidStudents: 2,
    });
    expect(rows['Aziza Rahimova']).toMatchObject({ id: '20002', sub: '2 guruh', students: 3, charged: 1_200_000, unpaid: 450_000, paidPct: 62.5 });
    expect(rows.Ustozsiz).toMatchObject({ id: 'ustozsiz', sub: '1 guruh', charged: 400_000, unpaid: 400_000 });
    expect(rows['Olim Karimov'].teachers).toBeUndefined();
  });
});

describe('course rows', () => {
  it('a course row adds its groups', () => {
    const rows = Object.fromEntries(courseRows(MONTH).map((r) => [r.id, r]));
    expect(rows.k1).toMatchObject({ name: 'Nemis tili A1', sub: '2 guruh', students: 3, charged: 1_550_000, unpaid: 600_000 });
    expect(rows.k2).toMatchObject({ name: 'Nemis tili B1', sub: '1 guruh', unpaid: 400_000 });
    expect(rows.k3).toMatchObject({ name: 'Nemis tili A2', paidPct: 100 });
  });
});

describe('summary (spec §3.3)', () => {
  it('the whole month, whatever the table shows', () => {
    const expected = {
      charged: 2_250_000, paid: 1_250_000, unpaid: 1_000_000, paidPct: 55.6, students: 5, unpaidStudents: 3,
      groups: 4, fullyPaidGroups: 1, underHalfGroups: 1, avgGroupPct: 56.7,
    };
    expect(summarize(MONTH)).toEqual(expected);
    expect(buildRowsResponse(MONTH, toGpQuery({ kesim: 'ustoz', q: 'olim', qarzdor: '1', tartib: 'nomi' })).summary).toEqual(expected);
  });
  it('an empty month: zeros and no percentages', () => {
    expect(summarize(data([], []))).toEqual({
      charged: 0, paid: 0, unpaid: 0, paidPct: null, students: 0, unpaidStudents: 0, groups: 0, fullyPaidGroups: 0, underHalfGroups: 0, avgGroupPct: null,
    });
  });
});

describe('search, sort, «Faqat qarzi borlar», paging (spec §3.4)', () => {
  const rows = (q: Parameters<typeof toGpQuery>[0]) => filteredRows(MONTH, toGpQuery(q));
  it('sorts by lowest percentage (default), by most left, by name', () => {
    expect(names(rows({}))).toEqual(['B1-01', 'A1-01', 'A1-02', 'A2-01']);
    expect(names(rows({ tartib: 'qoldi' }))).toEqual(['A1-01', 'B1-01', 'A1-02', 'A2-01']);
    expect(names(rows({ tartib: 'nomi' }))).toEqual(['A1-01', 'A1-02', 'A2-01', 'B1-01']);
    expect(names(rows({ kesim: 'ustoz' }))).toEqual(['Ustozsiz', 'Olim Karimov', 'Aziza Rahimova']);
  });
  it('«Faqat qarzi borlar» drops rows with nothing left', () => {
    expect(names(rows({ qarzdor: '1' }))).toEqual(['B1-01', 'A1-01', 'A1-02']);
  });
  it('Guruhlar: group name or number, teacher, course — any case, trimmed', () => {
    expect(names(rows({ q: '12' }))).toEqual(['A1-02']);
    expect(names(rows({ q: 'aziza' }))).toEqual(['A1-01', 'A2-01']);
    expect(names(rows({ q: 'b1' }))).toEqual(['B1-01']);
    expect(names(rows({ q: '  OLIM ' }))).toEqual(['A1-01', 'A1-02']);
  });
  it('Ustozlar search the teacher only, Kurslar the course only', () => {
    expect(names(rows({ kesim: 'ustoz', q: 'aziza' }))).toEqual(['Aziza Rahimova']);
    expect(names(rows({ kesim: 'ustoz', q: 'a1' }))).toEqual([]);
    expect(names(rows({ kesim: 'kurs', q: 'a2' }))).toEqual(['Nemis tili A2']);
  });
  it('pages after filtering; total counts the filtered rows', () => {
    const r = buildRowsResponse(MONTH, toGpQuery({ tartib: 'nomi', sahifa: 2, soni: 3 }));
    expect(names(r.rows)).toEqual(['B1-01']);
    expect(r.total).toBe(4);
    expect(r.month).toBe('2026-10');
  });
  it('the two-teacher note only in the Ustozlar cut, only when such a group exists', () => {
    expect(buildRowsResponse(MONTH, toGpQuery({ kesim: 'ustoz' })).multiTeacherNote).toBe(true);
    expect(buildRowsResponse(MONTH, Q).multiTeacherNote).toBe(false);
    const single = data(MONTH.charges.filter((c) => c.groupId !== 'g1'), [...MONTH.groups.values()].filter((g) => g.id !== 'g1'));
    expect(buildRowsResponse(single, toGpQuery({ kesim: 'ustoz' })).multiTeacherNote).toBe(false);
  });
});

describe('the group drawer (spec §3.6)', () => {
  it('students merged per student, unpaid first, the latest enrollment marks', () => {
    expect(studentLines(MONTH, 'g1').map((s) => [s.id, s.status, s.mark, s.unpaid])).toEqual([
      [10002, 'tolamagan', 'muzlatilgan', 450_000],
      [10001, 'toladi', null, 0],
    ]);
    expect(studentLines(MONTH, 'g2')[0]).toEqual({
      id: 10003, firstName: 'Ism', lastName: 'Familiya10003', phone: '900000000',
      charged: 450_000, paid: 300_000, unpaid: 150_000, status: 'qisman', mark: null,
    });
    expect(studentLines(MONTH, 'g3')[0].mark).toBe('arxivda');
    expect(studentLines(MONTH, 'g4')[0].mark).toBe('chiqqan');
  });
  it('the drawer answer, or null for a group with no charge this month', () => {
    expect(groupDrawer(MONTH, 'g1')).toMatchObject({
      group: { id: 'g1', name: 'A1-01', course: 'Nemis tili A1', teachers: ['Olim Karimov', 'Aziza Rahimova'], deleted: false, closed: false },
      charged: 900_000, paid: 450_000, unpaid: 450_000, paidPct: 50,
    });
    expect(groupDrawer(MONTH, 'g4')?.group).toMatchObject({ deleted: true });
    expect(groupDrawer(MONTH, 'nope')).toBeNull();
  });
});

describe("the Excel's student sheet (spec §5.4)", () => {
  it('every student–group line by group name; «qarzdor» keeps the ones with something left', () => {
    const all = studentSheetLines(MONTH, false);
    expect(all.map((s) => [s.groupName, s.id])).toEqual([
      ['A1-01', 10002], ['A1-01', 10001], ['A1-02', 10003], ['A1-02', 10001], ['A2-01', 10005], ['B1-01', 10004],
    ]);
    expect(all[0].teachers).toEqual(['Olim Karimov', 'Aziza Rahimova']);
    expect(studentSheetLines(MONTH, true).map((s) => s.id)).toEqual([10002, 10003, 10004]);
  });
});

/** Seeded generator — a failing case is replayed by its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const line = (id: string, studentId: number, groupId: string, month: string, chargedAmount: number, branchId = 1): MonthChargeLine => {
  const [periodYear, periodMonth] = month.split('-').map(Number);
  return { id, studentId, groupId, enrollmentId: `e-${id}`, periodYear, periodMonth, branchId, chargedAmount };
};
function randomMonth(seed: number) {
  const r = rng(seed);
  const pick = (n: number) => Math.floor(r() * n);
  const amounts = [0, 1, 137_500, 300_000, 450_000, 999_999];
  const rows: MonthChargeLine[] = [];
  const balances = new Map<number, number>();
  let n = 0;
  const students = 1 + pick(8);
  for (let i = 0; i < students; i++) {
    const studentId = 10001 + i;
    const count = 1 + pick(3);
    for (let k = 0; k < count; k++) {
      n += 1;
      rows.push(line(`c${n}`, studentId, `g${1 + pick(4)}`, '2026-10', amounts[pick(amounts.length)], 1 + pick(2)));
    }
    if (r() < 0.4) {
      n += 1;
      rows.push(line(`c${n}`, studentId, 'g1', '2026-11', 450_000));
    }
    balances.set(studentId, pick(1_500_001) - 1_000_000);
  }
  return { rows, balances };
}

describe('equality with the overview (spec §4.2, §8)', () => {
  it('random months: the summary and the group rows add up to splitMonthCharges exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { rows, balances } = randomMonth(seed);
      for (const branchIds of [null, [1]] as ReportBranchIds[]) {
        const input = { month: '2026-10', branchIds, rows, balances };
        const total = splitMonthCharges(input);
        const charges: GpCharge[] = splitMonthChargesByCharge(input).map((s) => ({ ...s, enrollmentStatus: 'ACTIVE' as const, enrollmentCreatedAt: new Date(0) }));
        const d = data(charges, [...new Set(charges.map((c) => c.groupId))].map((id) => group(id)));
        const s = summarize(d);
        expect({ seed, charged: s.charged, paid: s.paid, unpaid: s.unpaid, paidPct: s.paidPct, students: s.students, unpaidStudents: s.unpaidStudents })
          .toEqual({ seed, charged: total.charged, paid: total.paid, unpaid: total.unpaid, paidPct: total.paidPct, students: total.students, unpaidStudents: total.unpaidStudents });
        const g = groupRows(d);
        expect(g.reduce((a, r) => a + r.unpaid, 0)).toBe(total.unpaid);
        expect(g.reduce((a, r) => a + r.charged, 0)).toBe(total.charged);
      }
    }
  });
});
```
(`students` / `unpaidStudents` are compared as distinct students of the whole month — the summary — not as a sum of group rows: a student who changed group sits in two group rows by design.)

- [ ] **Step 2: Run** `npx jest src/reports/group-payments/group-payments.math.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** `group-payments.math.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import type { EnrollmentStatus } from '@prisma/client';
import { tashkentMonthKey } from '../../common/date/tashkent';
import { MONTHLY_BILLING_START_MONTH, paidPctOf } from '../month-charges';

/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §4). Pure: every figure is a sum of the
 * per-charge shares `splitMonthChargesByCharge` gave the loader, so the groups
 * add up to the overview's «Qoldi» to the so'm. Groups, teachers and courses
 * are today's (`GroupTeacher`, `courseId`), not those of the month.
 */
export type Kesim = 'guruh' | 'ustoz' | 'kurs';
export type Tartib = 'foiz' | 'qoldi' | 'nomi';
export type GroupMark = 'ochirilgan' | 'yopilgan';
export type PayStatus = 'toladi' | 'qisman' | 'tolamagan';
export type StudentMark = 'arxivda' | 'muzlatilgan' | 'chiqqan';

export const KESIMLAR: readonly Kesim[] = ['guruh', 'ustoz', 'kurs'];
export const TARTIBLAR: readonly Tartib[] = ['foiz', 'qoldi', 'nomi'];
export const USTOZSIZ_ID = 'ustozsiz';

/** One in-scope charge of the month, its unpaid share and its enrollment. */
export interface GpCharge {
  id: string;
  studentId: number;
  groupId: string;
  enrollmentId: string;
  charged: number;
  unpaid: number;
  enrollmentStatus: EnrollmentStatus;
  enrollmentCreatedAt: Date;
}
export interface GpGroup {
  id: string;
  name: string;
  groupNumber: number | null;
  courseId: string;
  courseName: string;
  teachers: { id: number; name: string }[];
  deleted: boolean;
  closed: boolean;
}
export interface GpStudent { id: number; firstName: string; lastName: string; phone: string; archived: boolean }
export interface GpData { month: string; charges: GpCharge[]; groups: Map<string, GpGroup>; students: Map<number, GpStudent> }

export interface GpTotals { charged: number; paid: number; unpaid: number; paidPct: number | null; students: number; unpaidStudents: number }
export interface GpSummary extends GpTotals { groups: number; fullyPaidGroups: number; underHalfGroups: number; avgGroupPct: number | null }
export interface GpRow extends GpTotals { id: string; name: string; sub: string; teachers?: string[]; marks: GroupMark[] }
export interface GpRowsResponse { month: string; summary: GpSummary; rows: GpRow[]; total: number; multiTeacherNote: boolean }
export interface GpStudentLine {
  id: number; firstName: string; lastName: string; phone: string;
  charged: number; paid: number; unpaid: number; status: PayStatus; mark: StudentMark | null;
}
export interface GpGroupResponse {
  group: { id: string; name: string; course: string; teachers: string[]; deleted: boolean; closed: boolean };
  charged: number; paid: number; unpaid: number; paidPct: number | null;
  students: GpStudentLine[];
}
/** The query as the DTOs carry it. */
export interface GpRawQuery { oy?: string; kesim?: Kesim; q?: string; tartib?: Tartib; qarzdor?: '1'; sahifa?: number; soni?: number }
export interface GpFilters { kesim: Kesim; q: string; tartib: Tartib; qarzdor: boolean }
export interface GpQuery extends GpFilters { sahifa: number; soni: number }
export interface GpSheetStudent extends GpStudentLine { groupName: string; teachers: string[] }

/** The report's month (spec B5 §5.1): empty = the current Tashkent month; 2026-09 up to it. */
export function parseReportMonth(oy: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!oy) return current;
  if (oy < MONTHLY_BILLING_START_MONTH) throw new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi');
  if (oy > current) throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  return oy;
}

export function toGpQuery(q: GpRawQuery): GpQuery {
  return {
    kesim: q.kesim ?? 'guruh',
    q: q.q ?? '',
    tartib: q.tartib ?? 'foiz',
    qarzdor: q.qarzdor === '1',
    sahifa: q.sahifa ?? 1,
    soni: q.soni ?? 10,
  };
}

/** Spec B5 §4.4: nothing left — paid; something but not all — part; all — unpaid. */
export function payStatus(charged: number, unpaid: number): PayStatus {
  if (unpaid <= 0) return 'toladi';
  return unpaid < charged ? 'qisman' : 'tolamagan';
}

/** Spec B5 §4.4: an archived card first, then the charge's enrollment. */
export function studentMark(archived: boolean, status: EnrollmentStatus): StudentMark | null {
  if (archived) return 'arxivda';
  if (status === 'FROZEN') return 'muzlatilgan';
  return status === 'ACTIVE' ? null : 'chiqqan';
}

/** Sums; a student counts once however many of these charges are his. */
export function totalsOf(charges: readonly GpCharge[]): GpTotals {
  const perStudent = new Map<number, number>();
  let charged = 0;
  let unpaid = 0;
  for (const c of charges) {
    charged += c.charged;
    unpaid += c.unpaid;
    perStudent.set(c.studentId, (perStudent.get(c.studentId) ?? 0) + c.unpaid);
  }
  const paid = charged - unpaid;
  return {
    charged, paid, unpaid, paidPct: paidPctOf(paid, charged),
    students: perStudent.size,
    unpaidStudents: [...perStudent.values()].filter((u) => u > 0).length,
  };
}

function bucket(charges: readonly GpCharge[], keysOf: (c: GpCharge) => string[]): Map<string, GpCharge[]> {
  const out = new Map<string, GpCharge[]>();
  for (const c of charges) {
    for (const k of keysOf(c)) {
      const list = out.get(k);
      if (list) list.push(c);
      else out.set(k, [c]);
    }
  }
  return out;
}

// The loader reads every group a charge names; the fallback only keeps the types honest.
const groupOf = (data: GpData, id: string): GpGroup =>
  data.groups.get(id) ?? { id, name: '', groupNumber: null, courseId: '', courseName: '', teachers: [], deleted: false, closed: false };
const groupsText = (charges: readonly GpCharge[]) => `${new Set(charges.map((c) => c.groupId)).size} guruh`;

export function groupRows(data: GpData): GpRow[] {
  return [...bucket(data.charges, (c) => [c.groupId])].map(([id, charges]) => {
    const g = groupOf(data, id);
    const marks: GroupMark[] = [];
    if (g.deleted) marks.push('ochirilgan');
    if (g.closed) marks.push('yopilgan');
    return { id, name: g.name, sub: g.courseName, teachers: g.teachers.map((t) => t.name), marks, ...totalsOf(charges) };
  });
}

/** A group goes to each of its current teachers; one without any to «Ustozsiz» (spec B5 §3.5). */
export function teacherRows(data: GpData): GpRow[] {
  const names = new Map<string, string>([[USTOZSIZ_ID, 'Ustozsiz']]);
  const keysOf = (c: GpCharge) => {
    const teachers = groupOf(data, c.groupId).teachers;
    for (const t of teachers) names.set(String(t.id), t.name);
    return teachers.length ? teachers.map((t) => String(t.id)) : [USTOZSIZ_ID];
  };
  return [...bucket(data.charges, keysOf)].map(([id, charges]) => ({
    id, name: names.get(id) ?? '', sub: groupsText(charges), marks: [], ...totalsOf(charges),
  }));
}

export function courseRows(data: GpData): GpRow[] {
  return [...bucket(data.charges, (c) => [groupOf(data, c.groupId).courseId])].map(([id, charges]) => ({
    id, name: groupOf(data, charges[0].groupId).courseName, sub: groupsText(charges), marks: [], ...totalsOf(charges),
  }));
}

/** The card (spec B5 §3.3): the whole month, never the table's filters. */
export function summarize(data: GpData): GpSummary {
  const groups = groupRows(data);
  const pcts = groups.map((g) => g.paidPct).filter((p): p is number => p !== null);
  return {
    ...totalsOf(data.charges),
    groups: groups.length,
    fullyPaidGroups: groups.filter((g) => g.unpaid === 0).length,
    underHalfGroups: pcts.filter((p) => p < 50).length,
    avgGroupPct: pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : null,
  };
}

const ROWS_OF: Record<Kesim, (data: GpData) => GpRow[]> = { guruh: groupRows, ustoz: teacherRows, kurs: courseRows };

/** What the search looks in (spec B5 §3.4). */
function haystack(row: GpRow, kesim: Kesim, data: GpData): string {
  if (kesim !== 'guruh') return row.name;
  const n = data.groups.get(row.id)?.groupNumber;
  return [row.name, n == null ? '' : String(n), row.sub, ...(row.teachers ?? [])].join(' ');
}

const byName = (a: GpRow, b: GpRow) => a.name.localeCompare(b.name, 'uz', { numeric: true });
const SORTS: Record<Tartib, (a: GpRow, b: GpRow) => number> = {
  // A row with nothing charged has no percentage: it goes last.
  foiz: (a, b) => (a.paidPct ?? 101) - (b.paidPct ?? 101) || b.unpaid - a.unpaid || byName(a, b),
  qoldi: (a, b) => b.unpaid - a.unpaid || byName(a, b),
  nomi: byName,
};

/** The table's rows after kesim, «Faqat qarzi borlar», search and sort — every page (the Excel's first sheet). */
export function filteredRows(data: GpData, f: GpFilters): GpRow[] {
  const q = f.q.trim().toLowerCase();
  return ROWS_OF[f.kesim](data)
    .filter((r) => !f.qarzdor || r.unpaid > 0)
    .filter((r) => !q || haystack(r, f.kesim, data).toLowerCase().includes(q))
    .sort(SORTS[f.tartib]);
}

export function buildRowsResponse(data: GpData, q: GpQuery): GpRowsResponse {
  const rows = filteredRows(data, q);
  return {
    month: data.month,
    summary: summarize(data),
    rows: rows.slice((q.sahifa - 1) * q.soni, q.sahifa * q.soni),
    total: rows.length,
    multiTeacherNote: q.kesim === 'ustoz' && [...data.groups.values()].some((g) => g.teachers.length > 1),
  };
}

const STATUS_ORDER: Record<PayStatus, number> = { tolamagan: 0, qisman: 1, toladi: 2 };

/** A group's students, one line each (two charges of one student merged), in the drawer's order. */
export function studentLines(data: GpData, groupId: string): GpStudentLine[] {
  const own = data.charges.filter((c) => c.groupId === groupId);
  return [...bucket(own, (c) => [String(c.studentId)])]
    .map(([, charges]) => {
      const latest = charges.reduce((a, b) => (b.enrollmentCreatedAt > a.enrollmentCreatedAt ? b : a));
      const s = data.students.get(latest.studentId) ?? { id: latest.studentId, firstName: '', lastName: '', phone: '', archived: false };
      const { charged, paid, unpaid } = totalsOf(charges);
      return {
        id: s.id, firstName: s.firstName, lastName: s.lastName, phone: s.phone,
        charged, paid, unpaid, status: payStatus(charged, unpaid), mark: studentMark(s.archived, latest.enrollmentStatus),
      };
    })
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.unpaid - a.unpaid ||
        `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, 'uz'),
    );
}

/** The drawer; null when the group had no charge in the month and scope (the caller answers 404). */
export function groupDrawer(data: GpData, groupId: string): GpGroupResponse | null {
  const charges = data.charges.filter((c) => c.groupId === groupId);
  if (charges.length === 0) return null;
  const g = groupOf(data, groupId);
  const { charged, paid, unpaid, paidPct } = totalsOf(charges);
  return {
    group: { id: g.id, name: g.name, course: g.courseName, teachers: g.teachers.map((t) => t.name), deleted: g.deleted, closed: g.closed },
    charged, paid, unpaid, paidPct,
    students: studentLines(data, groupId),
  };
}

/** The Excel's second sheet: every student–group line of the month by group name; `onlyDebtors` keeps those with something left. */
export function studentSheetLines(data: GpData, onlyDebtors: boolean): GpSheetStudent[] {
  return groupRows(data)
    .sort(byName)
    .flatMap((g) => studentLines(data, g.id).map((s) => ({ ...s, groupName: g.name, teachers: g.teachers ?? [] })))
    .filter((s) => !onlyDebtors || s.unpaid > 0);
}
```

- [ ] **Step 4: Run** `npx jest src/reports/group-payments` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Commit**
```bash
cd server && npx prettier --write src/reports/group-payments/group-payments.math.ts src/reports/group-payments/group-payments.math.spec.ts
npx eslint src/reports/group-payments
git add src/reports/group-payments/group-payments.math.ts src/reports/group-payments/group-payments.math.spec.ts
git commit -m "feat(reports): pure group-payments aggregation over per-charge shares

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Loader and service — rows and the group drawer

**Files:**
- Create: `server/src/reports/group-payments/group-payments.service.ts`, `group-payments.service.spec.ts`
- Modify: `server/src/reports/reports-branch-scope-coverage.spec.ts` (append one `describe`)

**Interfaces:**
- Consumes: `splitMonthChargesByCharge` (Task 1); `parseReportMonth`, `toGpQuery`, `buildRowsResponse`, `groupDrawer`, `GpData`, `GpRawQuery`, `GpRowsResponse`, `GpGroupResponse` (Task 2); `branchIdWhere`, `isEmptyScope`, `ReportBranchIds` (`common/finance/report-branch-scope.ts`).
- Produces:
  ```ts
  @Injectable() export class GroupPaymentsService {
    constructor(prisma: PrismaService)
    rows(companyId: number, scope: ReportBranchIds, q: GpRawQuery): Promise<GpRowsResponse>
    group(companyId: number, scope: ReportBranchIds, groupId: string, oy?: string): Promise<GpGroupResponse> // 404 «Bu guruh tanlangan oyda topilmadi»
    private load(companyId: number, scope: ReportBranchIds, month: string): Promise<GpData> // 403 on an empty scope
  }
  ```

- [ ] **Step 1: Write the failing service spec** `group-payments.service.spec.ts`:

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { addMonthsToMonthKey, tashkentMonthKey } from '../../common/date/tashkent';
import { GroupPaymentsService } from './group-payments.service';

// Made-up month: student 10001 owes only November's charge (October paid);
// student 10002 owes 600 000, spread over A1-01 (450 000) and B1-02 (300 000).
const enr = (status: string, createdAt = '2026-09-01T05:00:00Z') => ({ status, createdAt: new Date(createdAt) });
const ROWS = [
  { id: 'c1', studentId: 10001, groupId: 'g1', enrollmentId: 'e1', periodYear: 2026, periodMonth: 10, branchId: 4, chargedAmount: 450_000, enrollment: enr('ACTIVE') },
  { id: 'c2', studentId: 10002, groupId: 'g1', enrollmentId: 'e2', periodYear: 2026, periodMonth: 10, branchId: 4, chargedAmount: 450_000, enrollment: enr('FROZEN') },
  { id: 'c3', studentId: 10002, groupId: 'g2', enrollmentId: 'e3', periodYear: 2026, periodMonth: 10, branchId: 4, chargedAmount: 300_000, enrollment: enr('ACTIVE', '2026-10-05T05:00:00Z') },
  { id: 'c4', studentId: 10001, groupId: 'g1', enrollmentId: 'e1', periodYear: 2026, periodMonth: 11, branchId: 4, chargedAmount: 450_000, enrollment: enr('ACTIVE') },
];
const STUDENTS = [
  { id: 10001, balance: -450_000, firstName: 'Birinchi', lastName: 'Ism', phone: '900000001', deletedAt: null },
  { id: 10002, balance: -600_000, firstName: 'Ikkinchi', lastName: 'Ism', phone: '900000002', deletedAt: null },
];
const teacher = (id: number, firstName: string, lastName: string) => ({ teacher: { id, firstName, lastName } });
const GROUPS = [
  { id: 'g1', name: 'A1-01', groupNumber: 11, statusEnum: 'ACTIVE', deletedAt: null, course: { id: 'k1', name: 'Nemis tili A1' }, teachers: [teacher(20001, 'Olim', 'Karimov'), teacher(20002, 'Aziza', 'Rahimova')] },
  { id: 'g2', name: 'B1-02', groupNumber: null, statusEnum: 'COMPLETED', deletedAt: null, course: { id: 'k2', name: 'Nemis tili B1' }, teachers: [] },
];

function setup(holders: { studentId: number }[] = [{ studentId: 10001 }, { studentId: 10002 }]) {
  const prisma = {
    enrollmentMonthlyCharge: { findMany: jest.fn().mockResolvedValueOnce(holders).mockResolvedValueOnce(ROWS) },
    student: { findMany: jest.fn().mockResolvedValue(STUDENTS) },
    group: { findMany: jest.fn().mockResolvedValue(GROUPS) },
  };
  return { prisma, service: new GroupPaymentsService(prisma as never) };
}

const SUMMARY = {
  charged: 1_200_000, paid: 600_000, unpaid: 600_000, paidPct: 50, students: 2, unpaidStudents: 1,
  groups: 2, fullyPaidGroups: 0, underHalfGroups: 1, avgGroupPct: 40,
};

describe('GroupPaymentsService.rows', () => {
  it('reads the month like loadMonthCharges: scoped holders, then their charges, balances and groups', async () => {
    const { prisma, service } = setup();
    await service.rows(1001, [4], { oy: '2026-10' });
    const [holders, later] = prisma.enrollmentMonthlyCharge.findMany.mock.calls;
    expect(holders[0]).toMatchObject({
      where: { companyId: 1001, periodYear: 2026, periodMonth: 10, status: 'CHARGED', branchId: { in: [4] } },
      distinct: ['studentId'],
    });
    expect(later[0].where).toEqual({
      companyId: 1001,
      studentId: { in: [10001, 10002] },
      status: 'CHARGED',
      OR: [{ periodYear: { gt: 2026 } }, { periodYear: 2026, periodMonth: { gte: 10 } }],
    });
    expect(prisma.student.findMany.mock.calls[0][0].where).toEqual({ companyId: 1001, id: { in: [10001, 10002] } });
    const groupWhere = prisma.group.findMany.mock.calls[0][0].where;
    expect(groupWhere.companyId).toBe(1001);
    expect([...groupWhere.id.in].sort()).toEqual(['g1', 'g2']);
    // A deleted group still shows: no deletedAt filter on the group read.
    expect(groupWhere.deletedAt).toBeUndefined();
  });

  it('answers the card and the Guruhlar rows, lowest percentage first', async () => {
    const { service } = setup();
    const r = await service.rows(1001, [4], { oy: '2026-10' });
    expect(r.month).toBe('2026-10');
    expect(r.summary).toEqual(SUMMARY);
    expect(r.total).toBe(2);
    expect(r.multiTeacherNote).toBe(false);
    expect(r.rows).toEqual([
      { id: 'g2', name: 'B1-02', sub: 'Nemis tili B1', teachers: [], marks: ['yopilgan'], students: 1, charged: 300_000, paid: 60_000, unpaid: 240_000, paidPct: 20, unpaidStudents: 1 },
      { id: 'g1', name: 'A1-01', sub: 'Nemis tili A1', teachers: ['Aziza Rahimova', 'Olim Karimov'], marks: [], students: 2, charged: 900_000, paid: 540_000, unpaid: 360_000, paidPct: 60, unpaidStudents: 1 },
    ]);
  });

  it('the Ustozlar cut: current teachers, «Ustozsiz», the two-teacher note; the card does not move', async () => {
    const { service } = setup();
    const r = await service.rows(1001, [4], { oy: '2026-10', kesim: 'ustoz', qarzdor: '1' });
    expect(r.rows.map((x) => x.name)).toEqual(['Ustozsiz', 'Aziza Rahimova', 'Olim Karimov']);
    expect(r.multiTeacherNote).toBe(true);
    expect(r.summary).toEqual(SUMMARY);
  });

  it('no month reads the current Tashkent month', async () => {
    const { prisma, service } = setup();
    await service.rows(1001, [4], {});
    const [y, m] = tashkentMonthKey(new Date()).split('-').map(Number);
    expect(prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].where).toMatchObject({ periodYear: y, periodMonth: m });
  });

  it('refuses a month before September 2026 or ahead, before reading anything', async () => {
    const { prisma, service } = setup();
    await expect(service.rows(1001, [4], { oy: '2026-08' })).rejects.toThrow(new BadRequestException('Bu hisobot sentabr 2026 dan boshlanadi'));
    const next = addMonthsToMonthKey(tashkentMonthKey(new Date()), 1);
    await expect(service.rows(1001, [4], { oy: next })).rejects.toThrow(new BadRequestException("Kelajak oyni tanlab bo'lmaydi"));
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });

  it('an empty scope is a 403 and reads nothing', async () => {
    const { prisma, service } = setup();
    await expect(service.rows(1001, [], { oy: '2026-10' })).rejects.toThrow(new ForbiddenException("Bu filial ma'lumotlarini ko'rish huquqingiz yo'q"));
    expect(prisma.enrollmentMonthlyCharge.findMany).not.toHaveBeenCalled();
  });

  it('a month with no charge: zeros, no rows, and no further reads', async () => {
    const { prisma, service } = setup([]);
    const r = await service.rows(1001, null, { oy: '2026-10' });
    expect(r.summary).toMatchObject({ charged: 0, groups: 0, paidPct: null, avgGroupPct: null });
    expect(r.rows).toEqual([]);
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(prisma.group.findMany).not.toHaveBeenCalled();
  });
});

describe('GroupPaymentsService.group', () => {
  it('the drawer: totals, students unpaid first, marks from the enrollment', async () => {
    const { service } = setup();
    expect(await service.group(1001, [4], 'g1', '2026-10')).toEqual({
      group: { id: 'g1', name: 'A1-01', course: 'Nemis tili A1', teachers: ['Aziza Rahimova', 'Olim Karimov'], deleted: false, closed: false },
      charged: 900_000, paid: 540_000, unpaid: 360_000, paidPct: 60,
      students: [
        { id: 10002, firstName: 'Ikkinchi', lastName: 'Ism', phone: '900000002', charged: 450_000, paid: 90_000, unpaid: 360_000, status: 'qisman', mark: 'muzlatilgan' },
        { id: 10001, firstName: 'Birinchi', lastName: 'Ism', phone: '900000001', charged: 450_000, paid: 450_000, unpaid: 0, status: 'toladi', mark: null },
      ],
    });
  });

  it('a group without a charge in this month and scope is a 404', async () => {
    const { service } = setup();
    await expect(service.group(1001, [4], 'g7', '2026-10')).rejects.toThrow(new NotFoundException('Bu guruh tanlangan oyda topilmadi'));
  });
});
```

- [ ] **Step 2: Append the coverage case** to `reports-branch-scope-coverage.spec.ts` (import `GroupPaymentsService` from `./group-payments/group-payments.service` at the top):

```ts
/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §5.1): the same chain as the month
 * charges — only the holders query carries the branch; the later charges,
 * balances and groups are read for what it returned.
 */
describe('branch scope coverage — group payments', () => {
  const setup = () => {
    const prisma = {
      enrollmentMonthlyCharge: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ studentId: 10001 }])
          .mockResolvedValueOnce([
            { id: 'c1', studentId: 10001, groupId: 'g1', enrollmentId: 'e1', periodYear: 2026, periodMonth: 10, branchId: 7, chargedAmount: 450_000, enrollment: { status: 'ACTIVE', createdAt: new Date(0) } },
          ]),
      },
      student: { findMany: jest.fn().mockResolvedValue([{ id: 10001, balance: 0, firstName: 'Ism', lastName: 'Familiya', phone: '', deletedAt: null }]) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
    };
    return { prisma, service: new GroupPaymentsService(prisma as never) };
  };

  it('scopes the holders query and chains the rest to its students and their groups', async () => {
    const { prisma, service } = setup();
    await service.rows(1, [7], { oy: '2026-10' });
    const [holders, later] = prisma.enrollmentMonthlyCharge.findMany.mock.calls;
    expect(hasBranchPredicate(holders[0].where)).toBe(true);
    expect(holders[0].where.branchId).toEqual({ in: [7] });
    expect(later[0].where.studentId).toEqual({ in: [10001] });
    expect(later[0].where.branchId).toBeUndefined();
    expect(prisma.student.findMany.mock.calls[0][0].where.id).toEqual({ in: [10001] });
    expect(prisma.group.findMany.mock.calls[0][0].where.id).toEqual({ in: ['g1'] });
  });

  it('leaves the holders query unfiltered for a company-wide caller', async () => {
    const { prisma, service } = setup();
    await service.rows(1, null, { oy: '2026-10' });
    expect(prisma.enrollmentMonthlyCharge.findMany.mock.calls[0][0].where.branchId).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run** `npx jest src/reports/group-payments src/reports/reports-branch-scope-coverage.spec.ts` → FAIL (service missing).

- [ ] **Step 4: Implement** `group-payments.service.ts`:

```ts
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MonthlyChargeStatus } from '@prisma/client';
import { branchIdWhere, isEmptyScope, type ReportBranchIds } from '../../common/finance/report-branch-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { splitMonthChargesByCharge } from '../month-charges';
import {
  buildRowsResponse,
  groupDrawer,
  parseReportMonth,
  toGpQuery,
  type GpData,
  type GpGroupResponse,
  type GpRawQuery,
  type GpRowsResponse,
} from './group-payments.math';

/** «Guruhlar bo'yicha to'lov» (spec B5 §5). Every figure comes from `splitMonthChargesByCharge`. */
@Injectable()
export class GroupPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** `GET /reports/group-payments` (spec B5 §5.2). */
  async rows(companyId: number, scope: ReportBranchIds, q: GpRawQuery): Promise<GpRowsResponse> {
    const data = await this.load(companyId, scope, parseReportMonth(q.oy, new Date()));
    return buildRowsResponse(data, toGpQuery(q));
  }

  /** `GET /reports/group-payments/groups/:groupId` (spec B5 §5.3). */
  async group(companyId: number, scope: ReportBranchIds, groupId: string, oy?: string): Promise<GpGroupResponse> {
    const data = await this.load(companyId, scope, parseReportMonth(oy, new Date()));
    const out = groupDrawer(data, groupId);
    if (!out) throw new NotFoundException('Bu guruh tanlangan oyda topilmadi');
    return out;
  }

  /**
   * The month's in-scope charges with their unpaid shares. Branch scoping is a
   * CHAIN, as in `loadMonthCharges`: only the holders query carries `branchId`;
   * the later charges (any branch — the balance is one), the balances and the
   * groups are read for what it returned. Deleted groups and courses are read
   * on purpose (spec B5 §3.5). No cache: a month is ~500 charge rows.
   */
  private async load(companyId: number, scope: ReportBranchIds, month: string): Promise<GpData> {
    if (isEmptyScope(scope)) {
      throw new ForbiddenException("Bu filial ma'lumotlarini ko'rish huquqingiz yo'q");
    }
    const [y, m] = month.split('-').map(Number);
    const holders = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: { companyId, periodYear: y, periodMonth: m, status: MonthlyChargeStatus.CHARGED, ...branchIdWhere(scope) },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const studentIds = holders.map((h) => h.studentId);
    if (studentIds.length === 0) return { month, charges: [], groups: new Map(), students: new Map() };

    const [rows, students] = await Promise.all([
      this.prisma.enrollmentMonthlyCharge.findMany({
        where: {
          companyId,
          studentId: { in: studentIds },
          status: MonthlyChargeStatus.CHARGED,
          OR: [{ periodYear: { gt: y } }, { periodYear: y, periodMonth: { gte: m } }],
        },
        select: {
          id: true, studentId: true, groupId: true, enrollmentId: true, periodYear: true, periodMonth: true,
          branchId: true, chargedAmount: true, enrollment: { select: { status: true, createdAt: true } },
        },
      }),
      this.prisma.student.findMany({
        where: { companyId, id: { in: studentIds } },
        select: { id: true, balance: true, firstName: true, lastName: true, phone: true, deletedAt: true },
      }),
    ]);
    const shares = splitMonthChargesByCharge({
      month,
      branchIds: scope,
      rows,
      balances: new Map(students.map((s) => [s.id, s.balance])),
    });
    const groups = await this.prisma.group.findMany({
      where: { companyId, id: { in: [...new Set(shares.map((s) => s.groupId))] } },
      select: {
        id: true, name: true, groupNumber: true, statusEnum: true, deletedAt: true,
        course: { select: { id: true, name: true } },
        teachers: { select: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));
    return {
      month,
      charges: shares.map((s) => {
        const enrollment = rowById.get(s.id)!.enrollment;
        return { ...s, enrollmentStatus: enrollment.status, enrollmentCreatedAt: enrollment.createdAt };
      }),
      groups: new Map(
        groups.map((g) => [
          g.id,
          {
            id: g.id,
            name: g.name,
            groupNumber: g.groupNumber,
            courseId: g.course.id,
            courseName: g.course.name,
            teachers: g.teachers
              .map((t) => ({ id: t.teacher.id, name: `${t.teacher.firstName} ${t.teacher.lastName}`.trim() }))
              .sort((a, b) => a.name.localeCompare(b.name, 'uz')),
            deleted: g.deletedAt !== null,
            closed: g.statusEnum === 'COMPLETED' || g.statusEnum === 'CANCELLED',
          },
        ]),
      ),
      students: new Map(
        students.map((s) => [s.id, { id: s.id, firstName: s.firstName, lastName: s.lastName, phone: s.phone, archived: s.deletedAt !== null }]),
      ),
    };
  }
}
```

- [ ] **Step 5: Run** `npx jest src/reports/group-payments src/reports/reports-branch-scope-coverage.spec.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
cd server && npx prettier --write src/reports/group-payments/group-payments.service.ts src/reports/group-payments/group-payments.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts
npx eslint src/reports/group-payments src/reports/reports-branch-scope-coverage.spec.ts
git add src/reports/group-payments/group-payments.service.ts src/reports/group-payments/group-payments.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts
git commit -m "feat(reports): group-payments loader on the month-charges scope chain, rows and group drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: DTO, controller, module wiring and route access

**Files:**
- Create: `server/src/reports/group-payments/dto/group-payments-query.dto.ts`, `dto/group-payments-query.dto.spec.ts`, `group-payments.controller.ts`, `group-payments.controller.spec.ts`
- Modify: `server/src/reports/reports.module.ts`, `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `GroupPaymentsService.rows/group` (Task 3); `KESIMLAR`, `TARTIBLAR`, `Kesim`, `Tartib` (Task 2).
- Produces:
  ```ts
  export class GroupDrawerQueryDto { oy?: string }
  export class GroupPaymentsFilterDto extends GroupDrawerQueryDto { kesim?: Kesim; q?: string; tartib?: Tartib; qarzdor?: '1' }
  export class GroupPaymentsQueryDto extends GroupPaymentsFilterDto { sahifa?: number; soni?: number }
  // routes: GET /reports/group-payments, GET /reports/group-payments/groups/:groupId — @Can('reports.payments'), @BranchScope()
  ```

- [ ] **Step 1: Failing DTO spec** `dto/group-payments-query.dto.spec.ts`:

```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GroupPaymentsFilterDto, GroupPaymentsQueryDto } from './group-payments-query.dto';

async function errors(cls: new () => object, query: object) {
  return validate(plainToInstance(cls, query), { whitelist: true, forbidNonWhitelisted: true });
}
const props = async (cls: new () => object, query: object) => (await errors(cls, query)).map((e) => e.property);

describe('GroupPaymentsQueryDto', () => {
  it('accepts the URL the page keeps', async () => {
    expect(await props(GroupPaymentsQueryDto, { oy: '2026-10', kesim: 'ustoz', q: 'olim', tartib: 'qoldi', qarzdor: '1', sahifa: '2', soni: '30' })).toEqual([]);
    expect(await props(GroupPaymentsQueryDto, {})).toEqual([]);
  });

  it.each([
    ['oy', '2026-13'],
    ['oy', '10.2026'],
    ['kesim', 'sinf'],
    ['tartib', 'summa'],
    ['qarzdor', 'ha'],
    ['sahifa', '0'],
    ['soni', '5'],
    ['soni', '60'],
    ['q', 'x'.repeat(101)],
  ])('refuses %s=%s', async (key, value) => {
    expect(await props(GroupPaymentsQueryDto, { [key]: value })).toEqual([key]);
  });

  it('speaks Uzbek', async () => {
    const [e] = await errors(GroupPaymentsQueryDto, { oy: '2026-13' });
    expect(Object.values(e.constraints ?? {})).toEqual(["Oy YYYY-MM ko'rinishida bo'lishi kerak"]);
    const [s] = await errors(GroupPaymentsQueryDto, { soni: '60' });
    expect(Object.values(s.constraints ?? {})).toEqual(["Qatorlar soni 10 dan 50 gacha bo'ladi"]);
  });

  it('the Excel filter takes no page', async () => {
    expect(await props(GroupPaymentsFilterDto, { sahifa: '1' })).toEqual(['sahifa']);
  });
});
```

- [ ] **Step 2: Failing controller spec** `group-payments.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { defaultRolesOf, routeAccess } from '../../common/permissions/testing';
import { GroupPaymentsController } from './group-payments.controller';
import { GroupPaymentsService } from './group-payments.service';

describe('GroupPaymentsController', () => {
  const service = { rows: jest.fn().mockResolvedValue({}), group: jest.fn().mockResolvedValue({}) };
  let controller: GroupPaymentsController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [GroupPaymentsController],
      providers: [{ provide: GroupPaymentsService, useValue: service }],
    }).compile();
    controller = module.get(GroupPaymentsController);
  });

  it.each(['rows', 'group'])('%s is gated by reports.payments and admits CEO, Branch Director and Administrator', (method) => {
    expect(routeAccess(GroupPaymentsController, method)).toEqual({ kind: 'can', keys: ['reports.payments'] });
    expect(defaultRolesOf(GroupPaymentsController, method)).toEqual(['Administrator', 'Branch Director', 'CEO']);
  });

  it('rows passes the company, the resolved scope and the query', async () => {
    const q = { oy: '2026-10', kesim: 'ustoz' as const };
    await controller.rows(q, 1001, [3, 7]);
    expect(service.rows).toHaveBeenCalledWith(1001, [3, 7], q);
  });

  it('group passes the group id and the month', async () => {
    await controller.group('g1', { oy: '2026-10' }, 1001, [4]);
    expect(service.group).toHaveBeenCalledWith(1001, [4], 'g1', '2026-10');
  });
});
```

- [ ] **Step 3: Run** `npx jest src/reports/group-payments` → FAIL (DTO and controller missing).

- [ ] **Step 4: Implement the DTO** `dto/group-payments-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { KESIMLAR, TARTIBLAR, type Kesim, type Tartib } from '../group-payments.math';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?oy=` — the drawer's month (spec B5 §5.3). The range is checked in `parseReportMonth`. */
export class GroupDrawerQueryDto {
  @IsOptional()
  @Matches(MONTH, { message: "Oy YYYY-MM ko'rinishida bo'lishi kerak" })
  oy?: string;
}

/** The table's filters without the page — what the Excel takes (spec B5 §5.4). */
export class GroupPaymentsFilterDto extends GroupDrawerQueryDto {
  @IsOptional()
  @IsIn(KESIMLAR, { message: "Kesim guruh, ustoz yoki kurs bo'lishi kerak" })
  kesim?: Kesim;

  @IsOptional()
  @IsString({ message: "Qidiruv matn bo'lishi kerak" })
  @MaxLength(100, { message: 'Qidiruv 100 belgidan oshmasin' })
  q?: string;

  @IsOptional()
  @IsIn(TARTIBLAR, { message: "Saralash foiz, qoldi yoki nomi bo'lishi kerak" })
  tartib?: Tartib;

  @IsOptional()
  @IsIn(['1'], { message: "«Faqat qarzi borlar» qiymati 1 bo'ladi" })
  qarzdor?: '1';
}

/** `GET /reports/group-payments` (spec B5 §5.2). */
export class GroupPaymentsQueryDto extends GroupPaymentsFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Sahifa butun son bo'lishi kerak" })
  @Min(1, { message: "Sahifa 1 dan kichik bo'lmaydi" })
  sahifa?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Qatorlar soni butun son bo'lishi kerak" })
  @Min(10, { message: "Qatorlar soni 10 dan 50 gacha bo'ladi" })
  @Max(50, { message: "Qatorlar soni 10 dan 50 gacha bo'ladi" })
  soni?: number;
}
```

- [ ] **Step 5: Implement the controller** `group-payments.controller.ts`:

```ts
import { Controller, Get, Param, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { GroupDrawerQueryDto, GroupPaymentsQueryDto } from './dto/group-payments-query.dto';
import { GroupPaymentsService } from './group-payments.service';

/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §5). The header branch (`@BranchScope()`)
 * as a list: several branches without a pick are added up; an empty scope is
 * refused in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/group-payments')
export class GroupPaymentsController {
  constructor(private readonly service: GroupPaymentsService) {}

  /** The card and the table (spec B5 §5.2). The Administrator reads it too (`reports.payments`). */
  @Get()
  @Can('reports.payments')
  rows(
    @Query() q: GroupPaymentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.rows(companyId, scope, q);
  }

  /** The group drawer (spec B5 §5.3). A group without a charge this month is a 404. */
  @Get('groups/:groupId')
  @Can('reports.payments')
  group(
    @Param('groupId') groupId: string,
    @Query() q: GroupDrawerQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.group(companyId, scope, groupId, q.oy);
  }
}
```
(No `ParseUUIDPipe`: its refusal is English; an unknown id simply finds no charge and answers the Uzbek 404.)

- [ ] **Step 6: Wire the module.** In `reports.module.ts` import both, add `GroupPaymentsController` to the end of `controllers` and `GroupPaymentsService` to `providers`:
```ts
import { GroupPaymentsController } from './group-payments/group-payments.controller';
import { GroupPaymentsService } from './group-payments/group-payments.service';
// controllers: [ReportsController, ReportsLeadFunnelController, ReportsMarketingController, GroupPaymentsController],
// providers: [..., ReportsMarketingService, GroupPaymentsService],
```
Snapshot rows in `route-access.snapshot.json`, right after `"GET /reports/group-analytics"` (keys stay in alphabetical order):
```json
  "GET /reports/group-payments": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /reports/group-payments/groups/:groupId": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
```
Do NOT touch `branch-route-policy.ts`.

- [ ] **Step 7: Run** `npx jest src/reports src/common/permissions src/common/auth` → PASS (`permission-routes.spec.ts` sees the two routes; `branch-route-policy.spec.ts` classifies them by `@BranchScope()`); `npm run typecheck` → clean.

- [ ] **Step 8: Commit**
```bash
cd server && npx prettier --write src/reports/group-payments src/reports/reports.module.ts
npx eslint src/reports/group-payments src/reports/reports.module.ts
git add src/reports/group-payments src/reports/reports.module.ts src/common/permissions/route-access.snapshot.json
git commit -m "feat(reports): GET /reports/group-payments and the group drawer route (reports.payments, branch scope)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The two-sheet Excel

**Files:**
- Create: `server/src/reports/group-payments/group-payments.excel.ts`, `group-payments.excel.spec.ts`
- Modify: `group-payments.service.ts` (+ spec), `group-payments.controller.ts` (+ spec), `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `filteredRows`, `studentSheetLines`, `toGpQuery`, `GpRow`, `GpSheetStudent`, `Kesim`, `PayStatus`, `StudentMark` (Task 2); `paidPctOf` (Task 1); `GroupPaymentsFilterDto` (Task 4).
- Produces:
  ```ts
  export async function groupPaymentsWorkbook(input: { kesim: Kesim; rows: readonly GpRow[]; students: readonly GpSheetStudent[] }): Promise<Buffer>
  GroupPaymentsService.excel(companyId: number, scope: ReportBranchIds, q: GpRawQuery): Promise<{ buffer: Buffer; filename: string }> // guruhlar-tolovi-YYYY-MM.xlsx
  // GET /reports/group-payments/excel — @Can('reports.payments'), @BranchScope()
  ```

- [ ] **Step 1: Failing workbook spec** `group-payments.excel.spec.ts`:

```ts
import { Workbook } from 'exceljs';
import { groupPaymentsWorkbook } from './group-payments.excel';
import type { GpRow, GpSheetStudent } from './group-payments.math';

// Made-up groups, people and amounts.
const ROWS: GpRow[] = [
  { id: 'g2', name: 'B1-02', sub: 'Nemis tili B1', teachers: [], marks: ['yopilgan'], students: 1, charged: 300_000, paid: 60_000, unpaid: 240_000, paidPct: 20, unpaidStudents: 1 },
  { id: 'g1', name: 'A1-01', sub: 'Nemis tili A1', teachers: ['Aziza Rahimova', 'Olim Karimov'], marks: [], students: 2, charged: 900_000, paid: 540_000, unpaid: 360_000, paidPct: 60, unpaidStudents: 1 },
];
const STUDENTS: GpSheetStudent[] = [
  { id: 10002, firstName: 'Ikkinchi', lastName: 'Ism', phone: '900000002', charged: 450_000, paid: 90_000, unpaid: 360_000, status: 'qisman', mark: 'muzlatilgan', groupName: 'A1-01', teachers: ['Aziza Rahimova', 'Olim Karimov'] },
  { id: 10003, firstName: 'Uchinchi', lastName: 'Ism', phone: '900000003', charged: 300_000, paid: 0, unpaid: 300_000, status: 'tolamagan', mark: 'chiqqan', groupName: 'B1-02', teachers: [] },
];

async function load(kesim: 'guruh' | 'ustoz' | 'kurs', rows = ROWS) {
  const buf = await groupPaymentsWorkbook({ kesim, rows, students: STUDENTS });
  const wb = new Workbook();
  await wb.xlsx.load(buf as never);
  return wb;
}
const cells = (wb: Workbook, sheet: string, n: number) => (wb.getWorksheet(sheet)!.getRow(n).values as unknown[]).slice(1);

describe('groupPaymentsWorkbook (spec B5 §5.4)', () => {
  it('two sheets: the cut and «O\'quvchilar»', async () => {
    expect((await load('guruh')).worksheets.map((w) => w.name)).toEqual(['Guruhlar', "O'quvchilar"]);
    expect((await load('ustoz')).worksheets[0].name).toBe('Ustozlar');
    expect((await load('kurs')).worksheets[0].name).toBe('Kurslar');
  });

  it('the Guruhlar sheet: the table columns, marks beside the name, the total row', async () => {
    const wb = await load('guruh');
    expect(cells(wb, 'Guruhlar', 1)).toEqual(['#', 'Guruh', 'Kurs', 'Ustoz', "O'quvchi", 'Hisoblandi', "To'landi", 'Qoldi', 'Foiz', "To'lamagan"]);
    expect(cells(wb, 'Guruhlar', 3)).toEqual([2, 'A1-01', 'Nemis tili A1', 'Aziza Rahimova, Olim Karimov', 2, 900_000, 540_000, 360_000, 60, 1]);
    const ws = wb.getWorksheet('Guruhlar')!;
    expect(ws.getRow(2).getCell(2).value).toBe('B1-02 (yopilgan)');
    const total = ws.getRow(4);
    expect([1, 6, 7, 8, 9].map((c) => total.getCell(c).value)).toEqual(['Jami', 1_200_000, 600_000, 600_000, 50]);
  });

  it('the Ustozlar sheet leads with the teacher and his group count', async () => {
    const teacherRow: GpRow = { id: '20001', name: 'Olim Karimov', sub: '2 guruh', marks: [], students: 3, charged: 1_550_000, paid: 950_000, unpaid: 600_000, paidPct: 61.3, unpaidStudents: 2 };
    const wb = await load('ustoz', [teacherRow]);
    expect(cells(wb, 'Ustozlar', 1)).toEqual(['#', 'Ustoz', 'Guruhlar', "O'quvchi", 'Hisoblandi', "To'landi", 'Qoldi', 'Foiz', "To'lamagan"]);
    expect(cells(wb, 'Ustozlar', 2)).toEqual([1, 'Olim Karimov', '2 guruh', 3, 1_550_000, 950_000, 600_000, 61.3, 2]);
  });

  it('the student sheet: one line per student and group, status and mark in words', async () => {
    const wb = await load('guruh');
    expect(cells(wb, "O'quvchilar", 1)).toEqual(['Guruh', 'Ustoz', "O'quvchi", 'ID', 'Telefon', 'Hisoblandi', "To'landi", 'Qoldi', 'Holat', 'Belgi']);
    expect(cells(wb, "O'quvchilar", 2)).toEqual(['A1-01', 'Aziza Rahimova, Olim Karimov', 'Ikkinchi Ism', 10002, '900000002', 450_000, 90_000, 360_000, 'qisman', 'muzlatilgan']);
    expect(wb.getWorksheet("O'quvchilar")!.getRow(3).getCell(9).value).toBe("to'lamagan");
    expect(wb.getWorksheet("O'quvchilar")!.getRow(3).getCell(10).value).toBe('guruhdan chiqqan');
  });
});
```

- [ ] **Step 2: Failing service and controller cases.** Append to `group-payments.service.spec.ts` (same fixture and `setup()`; add `import { Workbook } from 'exceljs';` at the top):

```ts
describe('GroupPaymentsService.excel', () => {
  async function sheets(q: object) {
    const { service } = setup();
    const { buffer, filename } = await service.excel(1001, [4], { oy: '2026-10', ...q });
    const wb = new Workbook();
    await wb.xlsx.load(buffer as never);
    return { wb, filename };
  }

  it('names the file by the month; the first sheet follows the table, every page', async () => {
    const { wb, filename } = await sheets({});
    expect(filename).toBe('guruhlar-tolovi-2026-10.xlsx');
    expect(wb.getWorksheet('Guruhlar')!.getRow(2).getCell(2).value).toBe('B1-02 (yopilgan)');
    expect(wb.getWorksheet("O'quvchilar")!.rowCount).toBe(4); // header + 3 student–group lines
  });

  it('«qarzdor» keeps only the students with something left on the second sheet', async () => {
    const { wb } = await sheets({ qarzdor: '1' });
    const ws = wb.getWorksheet("O'quvchilar")!;
    expect(ws.rowCount).toBe(3);
    expect([ws.getRow(2).getCell(4).value, ws.getRow(3).getCell(4).value]).toEqual([10002, 10002]);
  });
});
```
Append to `group-payments.controller.spec.ts` (add `excel: jest.fn().mockResolvedValue({ buffer: Buffer.from('xlsx'), filename: 'guruhlar-tolovi-2026-10.xlsx' })` to the `service` mock and `'excel'` to the `it.each` list of the access case):

```ts
  it('excel sends the workbook as an attachment with the three headers', async () => {
    const q = { oy: '2026-10', qarzdor: '1' as const };
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel(q, 1001, [4], res as never);
    expect(service.excel).toHaveBeenCalledWith(1001, [4], q);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="guruhlar-tolovi-2026-10.xlsx"');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', 4);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('xlsx'));
  });
```

- [ ] **Step 3: Run** `npx jest src/reports/group-payments` → FAIL.

- [ ] **Step 4: Implement** `group-payments.excel.ts`:

```ts
import { Workbook } from 'exceljs';
import { paidPctOf } from '../month-charges';
import type { GpRow, GpSheetStudent, Kesim, PayStatus, StudentMark } from './group-payments.math';

type Cell = string | number;
interface Column { header: string; width: number; value: (r: GpRow) => Cell }

const SHEET: Record<Kesim, string> = { guruh: 'Guruhlar', ustoz: 'Ustozlar', kurs: 'Kurslar' };
const MARK_LABEL = { ochirilgan: "o'chirilgan", yopilgan: 'yopilgan' } as const;
const PAY_STATUS_LABEL: Record<PayStatus, string> = { toladi: "to'ladi", qisman: 'qisman', tolamagan: "to'lamagan" };
const STUDENT_MARK_LABEL: Record<StudentMark, string> = { arxivda: 'arxivda', muzlatilgan: 'muzlatilgan', chiqqan: 'guruhdan chiqqan' };

const withMarks = (r: GpRow) => (r.marks.length ? `${r.name} (${r.marks.map((m) => MARK_LABEL[m]).join(', ')})` : r.name);

/** The first sheet's columns before the figures, by cut (spec B5 §3.5). */
const LEAD: Record<Kesim, Column[]> = {
  guruh: [
    { header: 'Guruh', width: 24, value: withMarks },
    { header: 'Kurs', width: 22, value: (r) => r.sub },
    { header: 'Ustoz', width: 30, value: (r) => (r.teachers ?? []).join(', ') },
  ],
  ustoz: [
    { header: 'Ustoz', width: 28, value: (r) => r.name },
    { header: 'Guruhlar', width: 12, value: (r) => r.sub },
  ],
  kurs: [
    { header: 'Kurs', width: 28, value: (r) => r.name },
    { header: 'Guruhlar', width: 12, value: (r) => r.sub },
  ],
};
const FIGURES = ["O'quvchi", 'Hisoblandi', "To'landi", 'Qoldi', 'Foiz', "To'lamagan"];
const STUDENT_COLUMNS = [
  { header: 'Guruh', width: 22 },
  { header: 'Ustoz', width: 30 },
  { header: "O'quvchi", width: 28 },
  { header: 'ID', width: 8 },
  { header: 'Telefon', width: 14 },
  { header: 'Hisoblandi', width: 14 },
  { header: "To'landi", width: 14 },
  { header: 'Qoldi', width: 14 },
  { header: 'Holat', width: 14 },
  { header: 'Belgi', width: 18 },
];

/** Sheet 1: the table of the open cut with its filters, every page, and «Jami». Sheet 2: every student–group line (spec B5 §5.4). */
export async function groupPaymentsWorkbook(input: {
  kesim: Kesim;
  rows: readonly GpRow[];
  students: readonly GpSheetStudent[];
}): Promise<Buffer> {
  const wb = new Workbook();
  const lead = LEAD[input.kesim];
  const ws = wb.addWorksheet(SHEET[input.kesim]);
  ws.columns = [
    { header: '#', width: 6 },
    ...lead.map((c) => ({ header: c.header, width: c.width })),
    ...FIGURES.map((header) => ({ header, width: 14 })),
  ];
  ws.getRow(1).font = { bold: true };
  input.rows.forEach((r, i) =>
    ws.addRow([i + 1, ...lead.map((c) => c.value(r)), r.students, r.charged, r.paid, r.unpaid, r.paidPct ?? '', r.unpaidStudents]),
  );
  const sum = (k: 'charged' | 'paid' | 'unpaid') => input.rows.reduce((s, r) => s + r[k], 0);
  ws.addRow([
    'Jami', ...lead.map(() => ''), '', sum('charged'), sum('paid'), sum('unpaid'), paidPctOf(sum('paid'), sum('charged')) ?? '', '',
  ]).font = { bold: true };

  const st = wb.addWorksheet("O'quvchilar");
  st.columns = STUDENT_COLUMNS;
  st.getRow(1).font = { bold: true };
  for (const s of input.students) {
    st.addRow([
      s.groupName, s.teachers.join(', '), `${s.firstName} ${s.lastName}`.trim(), s.id, s.phone,
      s.charged, s.paid, s.unpaid, PAY_STATUS_LABEL[s.status], s.mark ? STUDENT_MARK_LABEL[s.mark] : '',
    ]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```
Service — add the imports `filteredRows`, `studentSheetLines` (from `./group-payments.math`) and `groupPaymentsWorkbook` (from `./group-payments.excel`), and the method:
```ts
  /** `GET /reports/group-payments/excel` (spec B5 §5.4): the table's filters without the page; sheet 2 honours `qarzdor` only. */
  async excel(companyId: number, scope: ReportBranchIds, q: GpRawQuery): Promise<{ buffer: Buffer; filename: string }> {
    const month = parseReportMonth(q.oy, new Date());
    const data = await this.load(companyId, scope, month);
    const f = toGpQuery(q);
    const buffer = await groupPaymentsWorkbook({ kesim: f.kesim, rows: filteredRows(data, f), students: studentSheetLines(data, f.qarzdor) });
    return { buffer, filename: `guruhlar-tolovi-${month}.xlsx` };
  }
```
Controller — imports `Res` (from `@nestjs/common`), `type { Response }` (from `express`) and `GroupPaymentsFilterDto`; the route between `rows` and `group`:
```ts
  /** The table of the open cut, every page, and every student line (spec B5 §5.4). */
  @Get('excel')
  @Can('reports.payments')
  async excel(
    @Query() q: GroupPaymentsFilterDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.excel(companyId, scope, q);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
```
Snapshot row, after `"GET /reports/group-payments"`:
```json
  "GET /reports/group-payments/excel": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
```

- [ ] **Step 5: Run** `npx jest src/reports src/common/permissions src/common/auth` → PASS; `npm run typecheck` → clean.

- [ ] **Step 6: Commit**
```bash
cd server && npx prettier --write src/reports/group-payments
npx eslint src/reports/group-payments
git add src/reports/group-payments src/common/permissions/route-access.snapshot.json
git commit -m "feat(reports): two-sheet Excel of the group payments report

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Retire the three old payment-reports endpoints

**Files:**
- Modify: `server/src/reports/reports.controller.ts` (imports `:1-23`, `listScope` comment `:570-575`, delete `:585-631`), `server/src/reports/reports.controller.spec.ts` (import `:18`, mocks `:55-57`, the «payment reports» `routeGroups` entry `:161-173`, `describe('getPaymentReports() — branch scope')` `:585-608`), `server/src/reports/reports.service.ts` (import `:14`, constructor `:81`, methods `:671-701`), `server/src/reports/reports.service.spec.ts` (import `:10`, provider `:189`, the three `describe` blocks `:557` up to `describe('getDepartedStudentsSummary'`), `server/src/reports/reports-payments.service.ts`, `server/src/reports/reports.module.ts`, `server/scripts/build-report-services.ts` (`:84`), `server/src/common/permissions/route-access.snapshot.json`, `server/src/common/permissions/permission-catalog.money.ts` (`:255`)
- Delete: `server/src/reports/reports-teacher-payments.service.ts`, `server/src/reports/reports-payments.service.spec.ts`, `server/src/reports/dto/payment-reports-query.dto.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReportsService` without `getPaymentReports` / `getTeacherPaymentReports` / `getTeacherGroupsReport` and without the `teacherPayments` constructor slot; `ReportsPaymentsService` keeps only `getPaymentLineItems` and `getPerBranchSummary` (the Excel reads them).

- [ ] **Step 1: Update the specs first.**
  - `reports.controller.spec.ts`: remove `import { PaymentReportsQueryDto } from './dto/payment-reports-query.dto';`, the three mocks `getPaymentReports`, `getTeacherPaymentReports`, `getTeacherGroupsReport` in `mockService`, the whole `routeGroups` entry with `capability: 'payment reports'`, and the whole `describe('getPaymentReports() — branch scope', …)`. Remove an import that becomes unused (eslint names it).
  - `reports.service.spec.ts`: remove `import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';`, the provider line `ReportsTeacherPaymentsService,`, and the blocks `describe('getPaymentReports', …)`, `describe('getTeacherPaymentReports', …)`, `describe('getTeacherGroupsReport', …)` — everything from `describe('getPaymentReports'` to just before `describe('getDepartedStudentsSummary'`.
  - Delete `reports-payments.service.spec.ts` (every case in it is about `getPaymentReports`).
- [ ] **Step 2: Run** `npx jest src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts` → PASS. (A removal has no failing-first test: the edited specs still pass against the old code, which proves the edits themselves are clean; Step 5 proves the code removal.)
- [ ] **Step 3: Remove the code.**
  - `reports.controller.ts`: delete the three handlers from the comment `// /reports/payment-reports sahifasi va uning «O'qituvchilar» jadvali` through the closing brace of `getTeacherGroupsReport`; delete `import { PaymentReportsQueryDto } from './dto/payment-reports-query.dto';`; delete `ParseIntPipe` from the `@nestjs/common` import (only `getTeacherGroupsReport` used it; `Param` stays for `monthKey`). In the `listScope` doc replace «Used by the departed-students reports (ADR-0035) and /payment-reports.» with «Used by the departed-students reports (ADR-0035).»
  - Delete `dto/payment-reports-query.dto.ts`.
  - `reports.service.ts`: delete `import { ReportsTeacherPaymentsService } from './reports-teacher-payments.service';`, the constructor parameter `private teacherPayments: ReportsTeacherPaymentsService,`, and these methods with their `// Payments` / `// Teacher payments` comments:
    ```ts
    // Payments
    getPaymentReports(companyId: number, options: { branchIds: ReportBranchIds; startDate?: string; endDate?: string; months?: 3 | 6 }) { return this.payments.getPaymentReports(companyId, options); }
    // Teacher payments
    getTeacherPaymentReports(companyId: number, options: { branchId?: number; startDate?: string; endDate?: string }) { … }
    getTeacherGroupsReport(companyId: number, teacherId: number, options: { branchId?: number; startDate?: string; endDate?: string }) { … }
    ```
  - Delete `reports-teacher-payments.service.ts` (it holds only those two methods). In `reports.module.ts` remove its import and the provider `ReportsTeacherPaymentsService,`.
  - `reports-payments.service.ts`: delete `refundLedgerWhere` with its doc block (`:22-45`) and everything from `async getPaymentReports(` (`:191`) to the last method's end (`percentChange`), keeping the class's closing `}`. The imports become:
    ```ts
    import { Injectable } from '@nestjs/common';
    import { PrismaService } from '../prisma/prisma.service';
    import { resolvePeriod } from '../common/finance/period-helpers';
    import {
      branchIdWhere,
      type ReportBranchIds,
    } from '../common/finance/report-branch-scope';
    ```
  - `scripts/build-report-services.ts` (positional `new ReportsService(...)`, not type-checked — `tsconfig.build.json` excludes `scripts/`): delete the line `    null as any, // teacherPayments`.
  - `route-access.snapshot.json`: delete the rows `"GET /reports/payment-reports"`, `"GET /reports/payment-reports/teachers"`, `"GET /reports/payment-reports/teachers/:teacherId/groups"`. `intentional-access-changes.ts` has no entry for them (check: `grep -n "payment-reports" src/common/permissions/intentional-access-changes.ts` → nothing) — nothing to remove there.
  - `permission-catalog.money.ts`: `'reports.payments'` label `"To'lov hisobotlari"` → `"Guruhlar bo'yicha to'lov hisoboti"` (defaults and allowed roles unchanged).
- [ ] **Step 4: Check nothing is left.** `grep -rn "getPaymentReports\|getTeacherPaymentReports\|getTeacherGroupsReport\|PaymentReportsQueryDto\|ReportsTeacherPaymentsService\|refundLedgerWhere\|payment-reports" src scripts` → nothing. `src/students/shared/active-student-policy.spec.ts` still names `reports-payments.service.ts::getPerBranchSummary`, which still exists.
- [ ] **Step 5: Run** `npx jest src/reports src/common/permissions src/common/auth src/students/shared src/telegram-groups` → PASS; `npm run typecheck` → clean; `npx eslint src/reports src/common/permissions` → 0 errors; then the full server suite `npm test` → PASS.
- [ ] **Step 6: Commit**
```bash
cd server && npx prettier --write src/reports/reports.controller.ts src/reports/reports.controller.spec.ts src/reports/reports.service.ts src/reports/reports.service.spec.ts src/reports/reports-payments.service.ts src/reports/reports.module.ts src/common/permissions/permission-catalog.money.ts scripts/build-report-services.ts
git add -A src/reports src/common/permissions scripts/build-report-services.ts
git commit -m "refactor(reports): remove the payment-reports endpoints that counted a debt once per group

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client data layer, summary card and filter bar

**Files:**
- Create in `client/src/components/reports/group-payments/`: `group-payments-types.ts`, `group-payments-url.ts`, `group-payments-url.test.ts`, `group-payments-format.ts`, `group-payments-format.test.ts`, `group-payments-queries.ts`, `group-payments-summary.tsx`, `group-payments-filter-bar.tsx`, `group-payments-summary.test.ts`

**Interfaces:**
- Consumes: the server contract of Tasks 3–5; `clampMonth` (`components/payments/overview/overview-math.ts`); `monthShort` (`components/payments/salary-utils.ts`); `useBranchId` (`components/payments/overview/queries.ts`); `retryDrawer` (`components/payments/debt/debt-queries.ts`); `UrlSearchBox` (`components/payments/debt/debt-filter-bar.tsx`).
- Produces:
  ```ts
  // group-payments-types.ts — Kesim, Tartib, GroupMark, PayStatus, StudentMark, GpTotals, GpSummary, GpRow, GpRowsResponse, GpStudentLine, GpGroupResponse (copies of the server types)
  // group-payments-url.ts
  export const GP_FIRST_MONTH = "2026-09"; export const GP_PAGE_SIZES = [10, 20, 30, 40, 50];
  export const GROUP_PAYMENTS_SCHEMA; export interface GroupPaymentsFilters { oy; kesim; q; tartib; qarzdor; sahifa: number; soni: number; guruh }
  export const GP_CLEARED: Partial<GroupPaymentsFilters>
  export function cleanKesim(v: string): Kesim; export function cleanTartib(v: string): Tartib
  export function pageMonth(oy: string, current: string): string
  export function excelParams(f: GroupPaymentsFilters, current: string): Record<string, string>
  export function rowsParams(f: GroupPaymentsFilters, current: string): Record<string, string | number>
  export function hasGpFilter(f: GroupPaymentsFilters): boolean
  export function excelFileName(month: string): string
  // group-payments-format.ts
  export const KESIM_OPTIONS, TARTIB_OPTIONS, FIRST_COLUMN, GROUP_MARK_LABEL, PAY_STATUS_LABEL, STUDENT_MARK_LABEL, PAY_STATUS_TONE, QOLDI_NOTE, MULTI_TEACHER_NOTE, SAME_AS_OVERVIEW
  export type Tone = "green" | "amber" | "red" | "muted"
  export function pctTone(pct: number | null): Tone; export function pctText(pct: number | null): string
  export function summaryTitle(month: string): string
  export function studentAmountText(s: Pick<GpStudentLine, "status" | "charged" | "unpaid">): string
  export function drawerSubtitle(group: GpGroupResponse["group"], students: number): string
  // group-payments-queries.ts
  export function useGroupPaymentsRows(params: Record<string, string | number>): UseQueryResult<GpRowsResponse>
  export function useGroupPaymentsGroup(groupId: string | null, oy: string | undefined): UseQueryResult<GpGroupResponse>
  // components
  export function GroupPaymentsSummary({ month, summary }: { month: string; summary: GpSummary }); export function GroupPaymentsSummarySkeleton()
  export function GroupPaymentsFilterBar({ filters, onChange }: { filters: GroupPaymentsFilters; onChange: (u: Partial<GroupPaymentsFilters>) => void })
  ```

- [ ] **Step 1: Failing tests.** `group-payments-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { excelFileName, excelParams, GROUP_PAYMENTS_SCHEMA, hasGpFilter, pageMonth, rowsParams, type GroupPaymentsFilters } from "./group-payments-url";

const DEFAULTS = Object.fromEntries(Object.entries(GROUP_PAYMENTS_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as GroupPaymentsFilters;
const f = (u: Partial<GroupPaymentsFilters> = {}): GroupPaymentsFilters => ({ ...DEFAULTS, ...u });

describe("pageMonth", () => {
  it("empty is the current month; the report starts in September 2026 and never runs ahead", () => {
    expect(pageMonth("", "2026-10")).toBe("2026-10");
    expect(pageMonth("2026-09", "2026-10")).toBe("2026-09");
    expect(pageMonth("2026-08", "2026-10")).toBe("2026-09");
    expect(pageMonth("2027-01", "2026-10")).toBe("2026-10");
    expect(pageMonth("oktabr", "2026-10")).toBe("2026-10");
  });
});

describe("rowsParams", () => {
  it("defaults: kesim and sort, page 1 of 10; the current month is not sent", () => {
    expect(rowsParams(f(), "2026-10")).toEqual({ kesim: "guruh", tartib: "foiz", sahifa: 1, soni: 10 });
  });
  it("carries every filter under the URL's own names", () => {
    expect(rowsParams(f({ oy: "2026-09", kesim: "ustoz", q: " olim ", tartib: "qoldi", qarzdor: "1", sahifa: 3, soni: 30 }), "2026-10"))
      .toEqual({ oy: "2026-09", kesim: "ustoz", tartib: "qoldi", q: "olim", qarzdor: "1", sahifa: 3, soni: 30 });
  });
  it("junk falls back to the defaults the server accepts", () => {
    expect(rowsParams(f({ kesim: "sinf", tartib: "summa", qarzdor: "ha", sahifa: 0, soni: 15 }), "2026-10"))
      .toEqual({ kesim: "guruh", tartib: "foiz", sahifa: 1, soni: 10 });
  });
});

describe("excelParams", () => {
  it("the filters without the page", () => {
    expect(excelParams(f({ oy: "2026-09", qarzdor: "1", sahifa: 4 }), "2026-10")).toEqual({ oy: "2026-09", kesim: "guruh", tartib: "foiz", qarzdor: "1" });
  });
});

describe("hasGpFilter / excelFileName", () => {
  it("only the search and «Faqat qarzi borlar» are filters «Tozalash» clears", () => {
    expect(hasGpFilter(f())).toBe(false);
    expect(hasGpFilter(f({ kesim: "kurs", tartib: "nomi" }))).toBe(false);
    expect(hasGpFilter(f({ q: "a1" }))).toBe(true);
    expect(hasGpFilter(f({ qarzdor: "1" }))).toBe(true);
  });
  it("names the file by the month", () => expect(excelFileName("2026-10")).toBe("guruhlar-tolovi-2026-10.xlsx"));
});
```
`group-payments-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { drawerSubtitle, PAY_STATUS_LABEL, pctText, pctTone, STUDENT_MARK_LABEL, studentAmountText, summaryTitle } from "./group-payments-format";

describe("percent", () => {
  it("colour: ≥ 90 green, ≥ 50 amber, below red, none muted", () => {
    expect([90, 89.9, 50, 49.9, 0].map(pctTone)).toEqual(["green", "amber", "amber", "red", "red"]);
    expect(pctTone(null)).toBe("muted");
  });
  it("whole on screen; «—» when nothing was charged", () => {
    expect(pctText(76.9)).toBe("77%");
    expect(pctText(50)).toBe("50%");
    expect(pctText(null)).toBe("—");
  });
});

describe("texts", () => {
  it("the card title names the month", () => expect(summaryTitle("2026-10")).toBe("Oktabr oyi to'lovlari — guruhlar kesimida"));
  it("a paid student shows what was charged, the others what is left", () => {
    expect(studentAmountText({ status: "toladi", charged: 450_000, unpaid: 0 })).toBe(`hisoblandi ${formatPrice(450_000)}`);
    expect(studentAmountText({ status: "qisman", charged: 450_000, unpaid: 360_000 })).toBe(`qoldi ${formatPrice(360_000)}`);
  });
  it("the drawer subtitle: course · teachers · students; «Ustozsiz» without a teacher", () => {
    const g = { id: "g1", name: "A1-01", course: "Nemis tili A1", teachers: ["Aziza Rahimova", "Olim Karimov"], deleted: false, closed: false };
    expect(drawerSubtitle(g, 2)).toBe("Nemis tili A1 · Aziza Rahimova, Olim Karimov · 2 o'quvchi");
    expect(drawerSubtitle({ ...g, teachers: [] }, 1)).toBe("Nemis tili A1 · Ustozsiz · 1 o'quvchi");
  });
  it("status and mark labels", () => {
    expect(PAY_STATUS_LABEL).toEqual({ toladi: "to'ladi", qisman: "qisman", tolamagan: "to'lamagan" });
    expect(STUDENT_MARK_LABEL).toEqual({ arxivda: "arxivda", muzlatilgan: "muzlatilgan", chiqqan: "guruhdan chiqqan" });
  });
});
```
`group-payments-summary.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { GroupPaymentsFilterBar } from "./group-payments-filter-bar";
import { GroupPaymentsSummary } from "./group-payments-summary";
import { GROUP_PAYMENTS_SCHEMA, type GroupPaymentsFilters } from "./group-payments-url";
import type { GpSummary } from "./group-payments-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));
const DEFAULTS = Object.fromEntries(Object.entries(GROUP_PAYMENTS_SCHEMA).map(([k, v]) => [k, v.defaultValue])) as unknown as GroupPaymentsFilters;
const noop = () => {};

// Made-up month.
const SUMMARY: GpSummary = {
  charged: 2_250_000, paid: 1_250_000, unpaid: 1_000_000, paidPct: 55.6, students: 5, unpaidStudents: 3,
  groups: 4, fullyPaidGroups: 1, underHalfGroups: 1, avgGroupPct: 56.7,
};

describe("GroupPaymentsSummary (spec B5 §3.3)", () => {
  it("title, the three figures with their lines, the chips and the green line", () => {
    const text = norm(raw(createElement(GroupPaymentsSummary, { month: "2026-10", summary: SUMMARY })));
    expect(text).toContain("Oktabr oyi to'lovlari — guruhlar kesimida");
    expect(text).toContain(`Hisoblandi ${price(2_250_000)} so'm 4 guruh · 5 o'quvchi`);
    expect(text).toContain(`To'landi ${price(1_250_000)} so'm 56%`);
    expect(text).toContain(`Qoldi ${price(1_000_000)} so'm guruhlarning o'rtachasi 57%`);
    expect(text).toContain("To'liq to'lagan guruh 1");
    expect(text).toContain("Yarmidan kami to'langan 1");
    expect(text).toContain("Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar");
  });
  it("a month with no charge says so", () => {
    const text = norm(raw(createElement(GroupPaymentsSummary, { month: "2026-09", summary: { ...SUMMARY, groups: 0, charged: 0, paid: 0, unpaid: 0 } })));
    expect(text).toContain("Bu oyda hisob yozilmagan");
    expect(text).not.toContain("Hisoblandi");
  });
});

describe("GroupPaymentsFilterBar (spec B5 §3.4)", () => {
  it("the cut, the search, the sort and «Faqat qarzi borlar»", () => {
    const html = raw(createElement(GroupPaymentsFilterBar, { filters: DEFAULTS, onChange: noop }));
    const text = norm(html);
    expect(text).toContain("Guruhlar Ustozlar Kurslar");
    expect(html).toContain('placeholder="Guruh, ustoz yoki kurs"');
    expect(text).toContain("Eng past foiz");
    expect(text).toContain("Faqat qarzi borlar");
    expect(html).toContain('aria-checked="false"');
  });
  it("shows the chosen sort and a ticked box", () => {
    const html = raw(createElement(GroupPaymentsFilterBar, { filters: { ...DEFAULTS, tartib: "qoldi", qarzdor: "1" }, onChange: noop }));
    expect(norm(html)).toContain("Eng ko'p qoldi");
    expect(html).toContain('aria-checked="true"');
  });
});
```

- [ ] **Step 2: Run** `cd client && npx vitest run src/components/reports/group-payments` → FAIL (modules missing).

- [ ] **Step 3: Implement.** `group-payments-types.ts`:

```ts
/** Mirrors `server/src/reports/group-payments/group-payments.math.ts` (spec B5 §5.2–§5.3). */
export type Kesim = "guruh" | "ustoz" | "kurs";
export type Tartib = "foiz" | "qoldi" | "nomi";
export type GroupMark = "ochirilgan" | "yopilgan";
export type PayStatus = "toladi" | "qisman" | "tolamagan";
export type StudentMark = "arxivda" | "muzlatilgan" | "chiqqan";

export interface GpTotals { charged: number; paid: number; unpaid: number; paidPct: number | null; students: number; unpaidStudents: number }
export interface GpSummary extends GpTotals { groups: number; fullyPaidGroups: number; underHalfGroups: number; avgGroupPct: number | null }
export interface GpRow extends GpTotals { id: string; name: string; sub: string; teachers?: string[]; marks: GroupMark[] }
export interface GpRowsResponse { month: string; summary: GpSummary; rows: GpRow[]; total: number; multiTeacherNote: boolean }
export interface GpStudentLine {
  id: number; firstName: string; lastName: string; phone: string;
  charged: number; paid: number; unpaid: number; status: PayStatus; mark: StudentMark | null;
}
export interface GpGroupResponse {
  group: { id: string; name: string; course: string; teachers: string[]; deleted: boolean; closed: boolean };
  charged: number; paid: number; unpaid: number; paidPct: number | null;
  students: GpStudentLine[];
}
```
`group-payments-url.ts`:

```ts
import { clampMonth } from "@/components/payments/overview/overview-math";
import type { Kesim, Tartib } from "./group-payments-types";

/** The report starts with monthly billing (spec B5 §2.1). */
export const GP_FIRST_MONTH = "2026-09";
export const GP_PAGE_SIZES = [10, 20, 30, 40, 50];

/** URL keys (spec B5 §6.2); defaults are left out of the URL by `useUrlFilters`. */
export const GROUP_PAYMENTS_SCHEMA = {
  oy: { type: "string", defaultValue: "" },
  kesim: { type: "string", defaultValue: "guruh" },
  q: { type: "string", defaultValue: "" },
  tartib: { type: "string", defaultValue: "foiz" },
  qarzdor: { type: "string", defaultValue: "" },
  sahifa: { type: "number", defaultValue: 1 },
  soni: { type: "number", defaultValue: 10 },
  guruh: { type: "string", defaultValue: "" },
} as const;

export interface GroupPaymentsFilters {
  oy: string; kesim: string; q: string; tartib: string; qarzdor: string; sahifa: number; soni: number; guruh: string;
}

/** «Tozalash»: the search and «Faqat qarzi borlar»; the month, the cut and the sort stay. */
export const GP_CLEARED: Partial<GroupPaymentsFilters> = { q: "", qarzdor: "", sahifa: 1 };

const KESIMLAR: readonly string[] = ["guruh", "ustoz", "kurs"];
const TARTIBLAR: readonly string[] = ["foiz", "qoldi", "nomi"];

export const cleanKesim = (v: string): Kesim => (KESIMLAR.includes(v) ? (v as Kesim) : "guruh");
export const cleanTartib = (v: string): Tartib => (TARTIBLAR.includes(v) ? (v as Tartib) : "foiz");

/** The page's month: `?oy=` inside [2026-09, the current month]; empty or unreadable is the current month. */
export function pageMonth(oy: string, current: string): string {
  return clampMonth(oy || current, GP_FIRST_MONTH, current);
}

/**
 * The filters as `GET /reports/group-payments/excel` reads them — the URL's own
 * names. The current month is not sent, so the server's own Tashkent month
 * answers and a request in the first seconds of a month is never «Kelajak oy».
 */
export function excelParams(f: GroupPaymentsFilters, current: string): Record<string, string> {
  const out: Record<string, string> = { kesim: cleanKesim(f.kesim), tartib: cleanTartib(f.tartib) };
  const month = pageMonth(f.oy, current);
  if (month !== current) out.oy = month;
  const q = f.q.trim().slice(0, 100);
  if (q) out.q = q;
  if (f.qarzdor === "1") out.qarzdor = "1";
  return out;
}

/** …plus the page, for `GET /reports/group-payments`. */
export function rowsParams(f: GroupPaymentsFilters, current: string): Record<string, string | number> {
  return {
    ...excelParams(f, current),
    sahifa: Number.isInteger(f.sahifa) && f.sahifa >= 1 ? f.sahifa : 1,
    soni: GP_PAGE_SIZES.includes(f.soni) ? f.soni : 10,
  };
}

export const hasGpFilter = (f: GroupPaymentsFilters): boolean => Boolean(f.q.trim() || f.qarzdor === "1");
export const excelFileName = (month: string): string => `guruhlar-tolovi-${month}.xlsx`;
```
`group-payments-format.ts`:

```ts
import { monthShort } from "@/components/payments/salary-utils";
import { formatPercent, formatPrice } from "@/lib/format-utils";
import type { GpGroupResponse, GpStudentLine, GroupMark, Kesim, PayStatus, StudentMark, Tartib } from "./group-payments-types";

export const KESIM_OPTIONS: { value: Kesim; label: string }[] = [
  { value: "guruh", label: "Guruhlar" },
  { value: "ustoz", label: "Ustozlar" },
  { value: "kurs", label: "Kurslar" },
];
export const TARTIB_OPTIONS: { value: Tartib; label: string }[] = [
  { value: "foiz", label: "Eng past foiz" },
  { value: "qoldi", label: "Eng ko'p qoldi" },
  { value: "nomi", label: "Nomi" },
];
export const FIRST_COLUMN: Record<Kesim, string> = { guruh: "Guruh", ustoz: "Ustoz", kurs: "Kurs" };
export const GROUP_MARK_LABEL: Record<GroupMark, string> = { ochirilgan: "o'chirilgan", yopilgan: "yopilgan" };
export const PAY_STATUS_LABEL: Record<PayStatus, string> = { toladi: "to'ladi", qisman: "qisman", tolamagan: "to'lamagan" };
export const STUDENT_MARK_LABEL: Record<StudentMark, string> = { arxivda: "arxivda", muzlatilgan: "muzlatilgan", chiqqan: "guruhdan chiqqan" };

export const QOLDI_NOTE = "Qoldi — bugungi balans bo'yicha: o'quvchi keyinroq to'lasa, o'tgan oyning ham «Qoldi»si kamayadi.";
export const MULTI_TEACHER_NOTE = "Ikki ustozli guruh har ikkala ustozda sanaladi — ustozlar yig'indisi jamidan katta bo'lishi mumkin.";
export const SAME_AS_OVERVIEW = "Umumiy ma'lumotlardagi 1-qator bilan bir xil raqamlar";

export type Tone = "green" | "amber" | "red" | "muted";

/** The «Foiz» colour (spec B5 §3.5): ≥ 90 green, ≥ 50 amber, below red; no percentage muted. */
export function pctTone(pct: number | null): Tone {
  if (pct === null) return "muted";
  return pct >= 90 ? "green" : pct >= 50 ? "amber" : "red";
}
export const PAY_STATUS_TONE: Record<PayStatus, Tone> = { toladi: "green", qisman: "amber", tolamagan: "red" };

/** The server's one-decimal percentage, whole on screen (spec B5 §4.3); «—» when nothing was charged. */
export const pctText = (pct: number | null): string => (pct === null ? "—" : formatPercent(Math.round(pct)));

export const summaryTitle = (month: string): string => `${monthShort(month)} oyi to'lovlari — guruhlar kesimida`;

/** A student who paid shows what was charged, the others what is left (spec B5 §3.6). */
export function studentAmountText(s: Pick<GpStudentLine, "status" | "charged" | "unpaid">): string {
  return s.status === "toladi" ? `hisoblandi ${formatPrice(s.charged)}` : `qoldi ${formatPrice(s.unpaid)}`;
}

/** «{Kurs} · {Ustoz(lar)} · N o'quvchi». */
export function drawerSubtitle(group: GpGroupResponse["group"], students: number): string {
  return [group.course, group.teachers.length ? group.teachers.join(", ") : "Ustozsiz", `${students} o'quvchi`].join(" · ");
}
```
`group-payments-queries.ts`:

```ts
"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchId } from "@/components/payments/overview/queries";
import { retryDrawer } from "@/components/payments/debt/debt-queries";
import type { GpGroupResponse, GpRowsResponse } from "./group-payments-types";

/** The card and the table in one answer; a filter or page change keeps the old answer on screen until the new one lands. The branch rides in the key (the server reads `X-Branch-Id`). */
export function useGroupPaymentsRows(params: Record<string, string | number>) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["group-payments-rows", branchId, params],
    queryFn: () => api.get<GpRowsResponse>("/reports/group-payments", { params }).then((r) => r.data),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/** One group for the drawer; `oy` is left out for the current month. A 404 is an answer, not retried. */
export function useGroupPaymentsGroup(groupId: string | null, oy: string | undefined) {
  const branchId = useBranchId();
  return useQuery({
    queryKey: ["group-payments-group", branchId, groupId, oy ?? null],
    queryFn: () =>
      api
        .get<GpGroupResponse>(`/reports/group-payments/groups/${encodeURIComponent(groupId ?? "")}`, { params: oy ? { oy } : undefined })
        .then((r) => r.data),
    enabled: groupId !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}
```
`group-payments-summary.tsx`:

```tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { pctText, SAME_AS_OVERVIEW, summaryTitle } from "./group-payments-format";
import type { GpSummary } from "./group-payments-types";

export function GroupPaymentsSummarySkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-6 w-80" />
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, sub, danger }: { label: string; value: number; sub: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("font-heading text-2xl font-semibold tabular-nums", danger && "text-destructive")}>{formatPrice(value)} so&apos;m</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Chip({ dot, label, count }: { dot: string; label: string; count: number }) {
  return (
    <span className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs">
      <span className={cn("size-2 rounded-full", dot)} />
      {label} <b className="tabular-nums">{formatNumber(count)}</b>
    </span>
  );
}

/** The month's card (spec B5 §3.3): the overview's first row, cut by group. The table's filters never change it. */
export function GroupPaymentsSummary({ month, summary }: { month: string; summary: GpSummary }) {
  return (
    <Card>
      <CardContent className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">{summaryTitle(month)}</p>
        {summary.groups === 0 ? (
          <p className="text-sm text-muted-foreground">Bu oyda hisob yozilmagan</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Figure label="Hisoblandi" value={summary.charged} sub={`${formatNumber(summary.groups)} guruh · ${formatNumber(summary.students)} o'quvchi`} />
              <Figure label="To'landi" value={summary.paid} sub={pctText(summary.paidPct)} />
              <Figure label="Qoldi" value={summary.unpaid} sub={`guruhlarning o'rtachasi ${pctText(summary.avgGroupPct)}`} danger />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip dot="bg-emerald-500" label="To'liq to'lagan guruh" count={summary.fullyPaidGroups} />
              <Chip dot="bg-destructive" label="Yarmidan kami to'langan" count={summary.underHalfGroups} />
            </div>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ {SAME_AS_OVERVIEW}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```
`group-payments-filter-bar.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UrlSearchBox } from "@/components/payments/debt/debt-filter-bar";
import { KESIM_OPTIONS, TARTIB_OPTIONS } from "./group-payments-format";
import { cleanKesim, cleanTartib, type GroupPaymentsFilters } from "./group-payments-url";

/** The cut, the search, the sort and «Faqat qarzi borlar» (spec B5 §3.4). The page puts the table back on page 1. */
export function GroupPaymentsFilterBar({ filters, onChange }: {
  filters: GroupPaymentsFilters;
  onChange: (u: Partial<GroupPaymentsFilters>) => void;
}) {
  const kesim = cleanKesim(filters.kesim);
  const tartib = cleanTartib(filters.tartib);
  const onSearch = useCallback((q: string) => onChange({ q }), [onChange]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup type="single" variant="outline" value={kesim} onValueChange={(v) => v && onChange({ kesim: v })} aria-label="Kesim">
        {KESIM_OPTIONS.map((o) => (
          <ToggleGroupItem key={o.value} value={o.value} className="px-3">
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <UrlSearchBox value={filters.q} onSearch={onSearch} label="Qidiruv" placeholder="Guruh, ustoz yoki kurs" />
      <Select value={tartib} onValueChange={(v) => onChange({ tartib: v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Saralash">
          <SelectValue>{TARTIB_OPTIONS.find((o) => o.value === tartib)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TARTIB_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={filters.qarzdor === "1"} onCheckedChange={(v) => onChange({ qarzdor: v === true ? "1" : "" })} />
        Faqat qarzi borlar
      </label>
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run src/components/reports/group-payments` → PASS; `npx tsc --noEmit -p .` → clean; `npm run lint` → 0 errors.

- [ ] **Step 5: Commit** (from the worktree root; `git checkout -- client/AGENTS.md` if it changed)
```bash
git add client/src/components/reports/group-payments
git commit -m "feat(reports): client types, URL model, formatting, queries, summary card and filters for group payments

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Table, pager, group drawer and the page

**Files:**
- Create in `client/src/components/reports/group-payments/`: `group-payments-table.tsx`, `group-payments-table.test.ts`, `group-drawer.tsx`, `group-drawer.test.ts`, `group-payments-page.tsx`
- Modify: `client/src/components/payments/list/payments-table.tsx` (`PaymentsPager`, today `:152-189`)

**Interfaces:**
- Consumes: Task 7; `PILL_BASE`, `PaymentsPager` (`components/payments/list/payments-table.tsx`); `drawerState`, `DrawerState` (`components/payments/list/payment-drawer-model.ts`); `lastPageIfPast` (`components/payments/debt/debt-url.ts`); `MonthStepper`; `currentMonthKey`; `downloadAuthedFile`; `getErrorMessage`.
- Produces:
  ```ts
  export const TONE_BAR: Record<Tone, string>; export const TONE_PILL: Record<Tone, string>
  export function GroupPaymentsTable(props: { kesim: Kesim; rows: GpRow[] | undefined; loading: boolean; offset: number; emptyMonth: boolean; onOpen: (groupId: string) => void; onClear?: () => void })
  export function GroupDrawer(props: { groupId: string | null; oy: string | undefined; onClose: () => void })
  export function GroupDrawerContent(props: { state: DrawerState; data: GpGroupResponse | undefined; onClose: () => void; onRetry: () => void })
  export function GroupPaymentsPage()
  // PaymentsPager gains: sizes?: number[] (default [50, 100]); sizeLabel?: string (default "Sahifadagi to'lovlar soni")
  ```

- [ ] **Step 1: Failing tests.** `group-payments-table.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { GroupPaymentsTable } from "./group-payments-table";
import type { GpRow } from "./group-payments-types";

const raw = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));
const noop = () => {};

// Made-up groups.
const ROWS: GpRow[] = [
  { id: "g2", name: "B1-02", sub: "Nemis tili B1", teachers: [], marks: ["yopilgan"], students: 1, charged: 300_000, paid: 60_000, unpaid: 240_000, paidPct: 20, unpaidStudents: 1 },
  { id: "g1", name: "A1-01", sub: "Nemis tili A1", teachers: ["Aziza Rahimova", "Olim Karimov"], marks: [], students: 2, charged: 900_000, paid: 540_000, unpaid: 360_000, paidPct: 60, unpaidStudents: 1 },
  { id: "g4", name: "A2-01", sub: "Nemis tili A2", teachers: ["Aziza Rahimova"], marks: ["ochirilgan"], students: 1, charged: 300_000, paid: 300_000, unpaid: 0, paidPct: 100, unpaidStudents: 0 },
];
const table = (over: Partial<Parameters<typeof GroupPaymentsTable>[0]> = {}) =>
  createElement(GroupPaymentsTable, { kesim: "guruh", rows: ROWS, loading: false, offset: 0, emptyMonth: false, onOpen: noop, ...over });

describe("GroupPaymentsTable (spec B5 §3.5)", () => {
  it("Guruhlar: # first, then Guruh, Ustoz and the figures", () => {
    expect(norm(raw(table())).trimStart().startsWith("# Guruh Ustoz O'quvchi Hisoblandi To'landi Qoldi Foiz To'lamagan")).toBe(true);
  });
  it("Ustozlar and Kurslar: no Ustoz column, their own first column", () => {
    expect(norm(raw(table({ kesim: "ustoz" }))).trimStart().startsWith("# Ustoz O'quvchi Hisoblandi")).toBe(true);
    expect(norm(raw(table({ kesim: "kurs" }))).trimStart().startsWith("# Kurs O'quvchi Hisoblandi")).toBe(true);
  });
  it("a row: name with the course under it, teachers by comma, pills, numbering from the offset", () => {
    const text = norm(raw(table({ offset: 10 })));
    expect(text).toContain("11 B1-02 yopilgan Nemis tili B1");
    expect(text).toContain("12 A1-01 Nemis tili A1 Aziza Rahimova, Olim Karimov 2");
    expect(text).toContain("A2-01 o'chirilgan");
  });
  it("Qoldi red when something is left, a muted 0 otherwise; the percentage whole", () => {
    const html = raw(table());
    expect(html).toContain(`text-destructive">${formatPrice(240_000)}`);
    expect(norm(html)).toContain(`${price(300_000)} ${price(300_000)} 0 100%`);
    expect(norm(html)).toContain("20%");
  });
  it("only Guruhlar rows open the drawer", () => {
    expect(raw(table())).toContain('tabindex="0"');
    expect(raw(table({ kesim: "ustoz" }))).not.toContain('tabindex="0"');
  });
  it("empty: a month without charges, or a filter without results with «Tozalash»", () => {
    expect(norm(raw(table({ rows: [], emptyMonth: true })))).toContain("Bu oyda hisob yozilmagan");
    const none = norm(raw(table({ rows: [], onClear: noop })));
    expect(none).toContain("Hech narsa topilmadi");
    expect(none).toContain("Tozalash");
  });
  it("loading draws skeleton rows, never the empty text", () => {
    const html = raw(table({ rows: undefined, loading: true }));
    expect(html).toContain('data-slot="skeleton"');
    expect(norm(html)).not.toContain("Hech narsa topilmadi");
  });
});

describe("PaymentsPager with the report's sizes", () => {
  it("«1–10 / 46» and «10 ta»", () => {
    const text = norm(raw(createElement(PaymentsPager, { page: 1, pageSize: 10, total: 46, sizes: [10, 20, 30, 40, 50], sizeLabel: "Sahifadagi qatorlar soni", onPage: noop, onPageSize: noop })));
    expect(text).toContain("1–10 / 46");
    expect(text).toContain("10 ta");
  });
});
```
`group-drawer.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import { GroupDrawerContent } from "./group-drawer";
import type { GpGroupResponse } from "./group-payments-types";

const noop = () => {};
const raw = (props: Partial<Parameters<typeof GroupDrawerContent>[0]>) =>
  renderToStaticMarkup(createElement(GroupDrawerContent, { state: "ok", data: undefined, onClose: noop, onRetry: noop, ...props }));
const norm = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const price = (n: number) => norm(formatPrice(n));

// Made-up group and people.
const DATA: GpGroupResponse = {
  group: { id: "g1", name: "A1-01", course: "Nemis tili A1", teachers: ["Olim Karimov"], deleted: false, closed: false },
  charged: 1_350_000, paid: 540_000, unpaid: 810_000, paidPct: 40,
  students: [
    { id: 10002, firstName: "Ikkinchi", lastName: "Ism", phone: "900000002", charged: 450_000, paid: 0, unpaid: 450_000, status: "tolamagan", mark: "muzlatilgan" },
    { id: 10003, firstName: "Uchinchi", lastName: "Ism", phone: "900000003", charged: 450_000, paid: 90_000, unpaid: 360_000, status: "qisman", mark: "arxivda" },
    { id: 10001, firstName: "Birinchi", lastName: "Ism", phone: "900000001", charged: 450_000, paid: 450_000, unpaid: 0, status: "toladi", mark: null },
  ],
};

describe("GroupDrawerContent (spec B5 §3.6)", () => {
  it("the total box, the students with status, mark and amount", () => {
    const html = raw({ data: DATA });
    const text = norm(html);
    expect(text).toContain(`To'landi 40% · qoldi ${price(810_000)} so'm`);
    expect(text).toContain("O'quvchilar");
    expect(text).toContain("Ikkinchi Ism ID 10002 muzlatilgan to'lamagan");
    expect(text).toContain(`qoldi ${price(450_000)}`);
    expect(text).toContain("Uchinchi Ism ID 10003 arxivda qisman");
    expect(text).toContain(`to'ladi hisoblandi ${price(450_000)}`);
    expect(html).toContain('href="/students/profile/10002"');
    expect(html).not.toContain('href="/students/profile/10003"'); // archived: no link
  });
  it("footer: the group page and the debt page filtered by the group", () => {
    const html = raw({ data: DATA });
    expect(html).toContain('href="/groups/g1"');
    expect(html).toContain('href="/payments/debt?groupIds=g1"');
    expect(norm(html)).toContain("Guruh sahifasi Qarzdorlik");
  });
  it("no group page for a deleted group, no debt link when nothing is left", () => {
    const html = raw({ data: { ...DATA, group: { ...DATA.group, deleted: true }, unpaid: 0 } });
    expect(html).not.toContain("/groups/g1");
    expect(html).not.toContain("/payments/debt");
  });
  it("states: loading, not found, error", () => {
    expect(raw({})).toContain('data-slot="skeleton"');
    const nf = norm(raw({ state: "notFound" }));
    expect(nf).toContain("Bu guruh tanlangan oyda topilmadi");
    expect(nf).toContain("Yopish");
    const err = norm(raw({ state: "error" }));
    expect(err).toContain("Ma'lumotni yuklab bo'lmadi");
    expect(err).toContain("Qayta urinish");
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/components/reports/group-payments src/components/payments/list` → FAIL (table and drawer missing; `PaymentsPager` has no `sizes`).

- [ ] **Step 3: Implement.** `PaymentsPager` in `payments-table.tsx`: add two optional props and use them (the B4 page passes neither, so it is unchanged):
```tsx
export function PaymentsPager({ page, pageSize, total, onPage, onPageSize, sizes = PAGE_SIZES, sizeLabel = "Sahifadagi to'lovlar soni" }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  /** The sizes offered; «Guruhlar bo'yicha to'lov» passes 10–50. */
  sizes?: number[];
  sizeLabel?: string;
}) {
```
and inside: `aria-label={sizeLabel}` on the `SelectTrigger`, `{sizes.map((n) => …)}` instead of `PAGE_SIZES.map`.

`group-payments-table.tsx`:

```tsx
"use client";

import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { FIRST_COLUMN, GROUP_MARK_LABEL, pctText, pctTone, type Tone } from "./group-payments-format";
import type { GpRow, Kesim } from "./group-payments-types";

// Semantic tokens with a tint, as the B4 pills: both themes read without `dark:` overrides.
export const TONE_BAR: Record<Tone, string> = { green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-destructive", muted: "bg-muted-foreground/40" };
export const TONE_PILL: Record<Tone, string> = {
  green: "bg-emerald-500/20 text-foreground",
  amber: "bg-amber-500/25 text-foreground",
  red: "bg-destructive/15 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

const headsOf = (kesim: Kesim) => ["#", FIRST_COLUMN[kesim], ...(kesim === "guruh" ? ["Ustoz"] : []), "O'quvchi", "Hisoblandi", "To'landi", "Qoldi", "Foiz", "To'lamagan"];
const RIGHT = new Set(["O'quvchi", "Hisoblandi", "To'landi", "Qoldi", "To'lamagan"]);
const MutedZero = () => <span className="text-muted-foreground">0</span>;

function PctCell({ pct }: { pct: number | null }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", TONE_BAR[pctTone(pct)])} style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
      </div>
      <span className="text-xs tabular-nums">{pctText(pct)}</span>
    </div>
  );
}

function RowView({ row, kesim, index, onOpen }: { row: GpRow; kesim: Kesim; index: number; onOpen?: (id: string) => void }) {
  const open = onOpen ? () => onOpen(row.id) : undefined;
  const onKeyDown = (e: KeyboardEvent) => {
    if (open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      open();
    }
  };
  return (
    <TableRow tabIndex={open ? 0 : undefined} className={cn(open && "cursor-pointer")} onClick={open} onKeyDown={open ? onKeyDown : undefined}>
      <TableCell className="border-r text-muted-foreground tabular-nums">{index}</TableCell>
      <TableCell>
        <div className="font-semibold">
          {row.name}
          {row.marks.map((m) => (
            <span key={m} className={cn(PILL_BASE, "ml-1 bg-muted align-middle text-muted-foreground")}>{GROUP_MARK_LABEL[m]}</span>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">{row.sub}</div>
      </TableCell>
      {kesim === "guruh" && (
        <TableCell className="text-sm">{row.teachers?.length ? row.teachers.join(", ") : <span className="text-muted-foreground">—</span>}</TableCell>
      )}
      <TableCell className="text-right tabular-nums">{formatNumber(row.students)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPrice(row.charged)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatPrice(row.paid)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.unpaid > 0 ? <span className="font-semibold text-destructive">{formatPrice(row.unpaid)}</span> : <MutedZero />}
      </TableCell>
      <TableCell><PctCell pct={row.paidPct} /></TableCell>
      <TableCell className="text-right tabular-nums">{row.unpaidStudents > 0 ? formatNumber(row.unpaidStudents) : <MutedZero />}</TableCell>
    </TableRow>
  );
}

/** The table (spec B5 §3.5). `rows: undefined` or `loading` = skeleton rows; only «Guruhlar» rows open the drawer. */
export function GroupPaymentsTable({ kesim, rows, loading, offset, emptyMonth, onOpen, onClear }: {
  kesim: Kesim;
  rows: GpRow[] | undefined;
  loading: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  /** The month has no charge at all (not a filter that found nothing). */
  emptyMonth: boolean;
  onOpen: (groupId: string) => void;
  /** Given when a filter is set: the empty state then offers to clear it. */
  onClear?: () => void;
}) {
  if (!loading && rows && rows.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        {emptyMonth ? (
          <p>Bu oyda hisob yozilmagan</p>
        ) : (
          <>
            <p>Hech narsa topilmadi</p>
            {onClear && <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>Tozalash</Button>}
          </>
        )}
      </div>
    );
  }
  const heads = headsOf(kesim);
  return (
    <div className="rounded-md border">
      <Table className="min-w-[820px]">
        <TableHeader>
          <TableRow>
            {heads.map((h, i) => (
              <TableHead key={h} className={i === 0 ? "w-12 border-r" : RIGHT.has(h) ? "text-right" : undefined}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading || !rows
            ? Array.from({ length: 6 }, (_, i) => (
                <TableRow key={i}>
                  {heads.map((h) => <TableCell key={h} className={h === "#" ? "border-r" : undefined}><Skeleton className="h-5 w-full" /></TableCell>)}
                </TableRow>
              ))
            : rows.map((r, i) => (
                <RowView key={r.id} row={r} kesim={kesim} index={offset + i + 1} onOpen={kesim === "guruh" ? onOpen : undefined} />
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
```
`group-drawer.tsx`:

```tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { drawerState, type DrawerState } from "@/components/payments/list/payment-drawer-model";
import { PILL_BASE } from "@/components/payments/list/payments-table";
import { drawerSubtitle, PAY_STATUS_LABEL, PAY_STATUS_TONE, pctText, STUDENT_MARK_LABEL, studentAmountText } from "./group-payments-format";
import { useGroupPaymentsGroup } from "./group-payments-queries";
import { TONE_PILL } from "./group-payments-table";
import type { GpGroupResponse } from "./group-payments-types";

/** Row click on «Guruhlar» (spec B5 §3.6): the group's students of the page's month. Closing deletes `?guruh=`. */
export function GroupDrawer({ groupId, oy, onClose }: { groupId: string | null; oy: string | undefined; onClose: () => void }) {
  const query = useGroupPaymentsGroup(groupId, oy);
  const state = drawerState(query.error);
  const data = query.data;
  return (
    <Sheet open={groupId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the title clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{data?.group.name ?? "Guruh"}</SheetTitle>
            <SheetDescription>{data ? drawerSubtitle(data.group, data.students.length) : state === "ok" ? "Yuklanmoqda…" : ""}</SheetDescription>
          </div>
        </SheetHeader>
        <GroupDrawerContent state={state} data={data} onClose={onClose} onRetry={() => query.refetch()} />
      </SheetContent>
    </Sheet>
  );
}

/** Everything under the header, per state. No Sheet parts inside, so a test renders it alone. */
export function GroupDrawerContent({ state, data, onClose, onRetry }: {
  state: DrawerState;
  data: GpGroupResponse | undefined;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (state === "notFound") {
    return (
      <div className="space-y-3 p-6 text-sm">
        <p className="font-medium">Bu guruh tanlangan oyda topilmadi</p>
        <Button variant="outline" onClick={onClose}>Yopish</Button>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="space-y-3 p-6 text-sm">
        <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        <Button variant="outline" onClick={onRetry}>Qayta urinish</Button>
      </div>
    );
  }
  if (!data) return <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="text-sm text-muted-foreground">To&apos;landi {pctText(data.paidPct)} · qoldi</p>
          <p className={cn("font-heading text-2xl font-semibold tabular-nums", data.unpaid > 0 && "text-destructive")}>{formatPrice(data.unpaid)} so&apos;m</p>
        </div>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O&apos;quvchilar</h3>
          <ul className="divide-y">
            {data.students.map((s) => {
              const name = `${s.firstName} ${s.lastName}`.trim();
              return (
                <li key={s.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {s.mark === "arxivda" ? name : <Link href={`/students/profile/${s.id}`} className="hover:underline">{name}</Link>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ID {s.id}
                      {s.mark && <span className={cn(PILL_BASE, "ml-2 bg-muted text-muted-foreground")}>{STUDENT_MARK_LABEL[s.mark]}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn(PILL_BASE, TONE_PILL[PAY_STATUS_TONE[s.status]])}>{PAY_STATUS_LABEL[s.status]}</span>
                    <div className="mt-1 text-xs tabular-nums text-muted-foreground">{studentAmountText(s)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {(!data.group.deleted || data.unpaid > 0) && (
        <div className="flex flex-wrap gap-2 border-t px-6 py-4">
          {!data.group.deleted && (
            <Button variant="outline" asChild>
              <Link href={`/groups/${data.group.id}`}>Guruh sahifasi</Link>
            </Button>
          )}
          {data.unpaid > 0 && (
            <Button variant="outline" asChild>
              <Link href={`/payments/debt?groupIds=${encodeURIComponent(data.group.id)}`}>Qarzdorlik</Link>
            </Button>
          )}
        </div>
      )}
    </>
  );
}
```
`group-payments-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { MonthStepper } from "@/components/shared/month-stepper";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { currentMonthKey } from "@/components/payments/salary-utils";
import { lastPageIfPast } from "@/components/payments/debt/debt-url";
import { PaymentsPager } from "@/components/payments/list/payments-table";
import { GroupDrawer } from "./group-drawer";
import { GroupPaymentsFilterBar } from "./group-payments-filter-bar";
import { MULTI_TEACHER_NOTE, QOLDI_NOTE } from "./group-payments-format";
import { useGroupPaymentsRows } from "./group-payments-queries";
import { GroupPaymentsSummary, GroupPaymentsSummarySkeleton } from "./group-payments-summary";
import { GroupPaymentsTable } from "./group-payments-table";
import {
  cleanKesim, excelFileName, excelParams, GP_CLEARED, GP_FIRST_MONTH, GP_PAGE_SIZES, GROUP_PAYMENTS_SCHEMA, hasGpFilter, pageMonth, rowsParams,
  type GroupPaymentsFilters,
} from "./group-payments-url";

/** «Guruhlar bo'yicha to'lov» (spec B5 §3). Every figure is the server's; the page only formats. */
export function GroupPaymentsPage() {
  const { filters: raw, setFilters } = useUrlFilters(GROUP_PAYMENTS_SCHEMA);
  const filters = raw as GroupPaymentsFilters;
  const [exporting, setExporting] = useState(false);
  const current = currentMonthKey();
  const month = pageMonth(filters.oy, current);
  const kesim = cleanKesim(filters.kesim);
  const params = rowsParams(filters, current);
  const { data, isPending, isPlaceholderData, isError, refetch } = useGroupPaymentsRows(params);
  // An answer kept from another month is never drawn as this month's.
  const fresh = data && data.month === month ? data : undefined;

  // A page past the last one (a filter narrowed the list, an old link) goes to the last page that has rows.
  const lastPage = fresh && !isPlaceholderData ? lastPageIfPast(Number(params.sahifa), Number(params.soni), fresh.total, fresh.rows.length) : null;
  useEffect(() => {
    if (lastPage !== null) setFilters({ sahifa: lastPage });
  }, [lastPage, setFilters]);
  // A kept answer is not the new one: skeleton, not «Hech narsa topilmadi», until it lands.
  const tableLoading = isPending || !fresh || lastPage !== null || (isPlaceholderData && !fresh.rows.length);

  // Any filter change puts the table back on page 1.
  const onChange = useCallback((u: Partial<GroupPaymentsFilters>) => setFilters({ sahifa: 1, ...u }), [setFilters]);

  async function exportExcel() {
    setExporting(true);
    try {
      const qs = new URLSearchParams(excelParams(filters, current)).toString();
      await downloadAuthedFile(`/reports/group-payments/excel?${qs}`, excelFileName(month));
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Guruhlar bo&apos;yicha to&apos;lov</h2>
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper value={month} min={GP_FIRST_MONTH} max={current} onChange={(m) => onChange({ oy: m === current ? "" : m, guruh: "" })} />
          <Button variant="outline" onClick={exportExcel} disabled={exporting}>
            {exporting ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Download className="mr-2 size-4" />}
            Excel
          </Button>
        </div>
      </div>

      {!isError && (fresh ? <GroupPaymentsSummary month={month} summary={fresh.summary} /> : <GroupPaymentsSummarySkeleton />)}

      <GroupPaymentsFilterBar filters={filters} onChange={onChange} />

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* The previous answer stays dimmed and inert until the next one lands. */}
          <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && "pointer-events-none opacity-60")}>
            <GroupPaymentsTable
              kesim={kesim}
              rows={fresh?.rows}
              loading={tableLoading}
              offset={(Number(params.sahifa) - 1) * Number(params.soni)}
              emptyMonth={fresh?.summary.groups === 0}
              onOpen={(guruh) => setFilters({ guruh })}
              onClear={hasGpFilter(filters) ? () => setFilters(GP_CLEARED) : undefined}
            />
          </div>
          {fresh && fresh.total > 0 && !tableLoading && (
            <PaymentsPager
              page={Number(params.sahifa)}
              pageSize={Number(params.soni)}
              total={fresh.total}
              sizes={GP_PAGE_SIZES}
              sizeLabel="Sahifadagi qatorlar soni"
              onPage={(sahifa) => setFilters({ sahifa })}
              onPageSize={(soni) => setFilters({ soni, sahifa: 1 })}
            />
          )}
          {fresh && fresh.rows.length > 0 && !tableLoading && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {fresh.multiTeacherNote && <p>{MULTI_TEACHER_NOTE}</p>}
              <p>{QOLDI_NOTE}</p>
            </div>
          )}
        </div>
      )}

      <GroupDrawer groupId={filters.guruh || null} oy={month === current ? undefined : month} onClose={() => setFilters({ guruh: "" })} />
    </div>
  );
}
```

- [ ] **Step 4: Run** `npx vitest run src/components/reports/group-payments src/components/payments/list` → PASS (the B4 tests unchanged); `npx tsc --noEmit -p .` → clean; `npm run lint` → 0 errors.

- [ ] **Step 5: Commit**
```bash
git add client/src/components/reports/group-payments client/src/components/payments/list/payments-table.tsx
git commit -m "feat(reports): group payments table, pager, group drawer and the page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Route, menus and search; remove the old page

**Files:**
- Modify: `client/src/app/(dashboard)/reports/payment-reports/page.tsx`, `client/src/lib/reports-nav.ts` (`:31-44`), `client/src/lib/reports-nav.test.ts`, `client/src/lib/breadcrumb-routes.ts` (`:21`), `client/src/data/searchable-pages.ts` (after the «Hisobotlar» entry), `client/src/lib/nav-items.ts` (comment `:118`), `client/src/components/reports/reports-layout-shell.tsx` (comment `:18`)
- Delete: `client/src/components/reports/payment-reports/` (all 14 files: `branch-breakdown-dialog.tsx`, `coming-soon-card.tsx`, `payment-methods-card.tsx`, `payment-methods-dialog.tsx`, `payment-report-card.tsx`, `payment-report-dialog.tsx`, `payment-report-period.ts`, `payment-report-period.test.ts`, `payment-reports-client.tsx`, `payment-reports-filter-bar.tsx`, `report-view-state.ts`, `report-view-state.test.ts`, `teacher-groups-dialog.tsx`, `teachers-report-table.tsx`)

**Interfaces:**
- Consumes: `GroupPaymentsPage` (Task 8).
- Produces: the menu item «Guruhlar bo'yicha to'lov» → `/reports/payment-reports` (`permission: "reports.payments"`), breadcrumb label, a global-search entry.

- [ ] **Step 1: Failing test.** In `reports-nav.test.ts` add `import { routeLabels } from "./breadcrumb-routes";`, rename the administrator case to `"administrator Lidlar va «Guruhlar bo'yicha to'lov»ni ochadi, boshqa pul hisobotlarini ochmaydi"` (body unchanged), and replace the «Moliyaviy hisobotlar» case with:
```ts
  it("«Moliyaviy hisobotlar»da faqat «Guruhlar bo'yicha to'lov» bor; havolasi va imkoniyati o'zgarmagan", () => {
    const section = reportsNavSections.find((s) => s.title === "Moliyaviy hisobotlar");
    expect(section?.items.map((i) => [i.title, i.url, i.permission])).toEqual([
      ["Guruhlar bo'yicha to'lov", "/reports/payment-reports", "reports.payments"],
    ]);
    expect(routeLabels["payment-reports"]).toBe("Guruhlar bo'yicha to'lov");
    expect(reportsNavSections.flatMap((s) => s.items).some((i) => i.url === "/reports/student-payments")).toBe(false);
  });
```
- [ ] **Step 2: Run** `npx vitest run src/lib/reports-nav.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - `page.tsx`:
    ```tsx
    import { Suspense } from "react";
    import { GroupPaymentsPage } from "@/components/reports/group-payments/group-payments-page";

    // «Guruhlar bo'yicha to'lov» (spec B5); the address is the old «To'lov hisobotlari» one, so bookmarks keep working.
    export default function PaymentReportsPage() {
      return (
        <Suspense fallback={null}>
          <GroupPaymentsPage />
        </Suspense>
      );
    }
    ```
  - `reports-nav.ts`: the item becomes `{ title: "Guruhlar bo'yicha to'lov", url: "/reports/payment-reports", icon: Receipt, permission: "reports.payments" }`; the comment above `reportsNavSections` reads: «An Administrator sees the Lidlar and «Guruhlar bo'yicha to'lov» reports (CEO decisions: Lidlar 13.09.2026, the payments report 05.10.2026, kept by spec B5). The rest — the money and centre figures — belong to the holders of `reports.finance` and `reports.students`. The server agrees: `reports/lead-funnel` and `reports/group-payments*` check `reports.leads` and `reports.payments`.»
  - `breadcrumb-routes.ts`: `"payment-reports": "Guruhlar bo'yicha to'lov",`.
  - `searchable-pages.ts`, right after the «Hisobotlar» entry:
    ```ts
      { label: "Guruhlar bo'yicha to'lov", url: "/reports/payment-reports", keywords: ["guruh to'lovi", "qarzdor guruh", "ustoz bo'yicha to'lov", "to'lov hisoboti"] },
    ```
  - Comments: `nav-items.ts` «An Administrator sees only the Lidlar and To'lov hisobotlari; …» → «An Administrator sees only the Lidlar and «Guruhlar bo'yicha to'lov» reports; …»; `reports-layout-shell.tsx` «… an administrator opens only Lidlar and To'lov hisobotlari» → «… an administrator opens only Lidlar and «Guruhlar bo'yicha to'lov»».
  - `git rm -r client/src/components/reports/payment-reports`.
- [ ] **Step 4: Check nothing is left.** `grep -rn "components/reports/payment-reports\|payment-reports-client\|To'lov hisobotlari" client/src` → only `client/src/qollanma/yangiliklar.ts` (an old news entry — history, stays).
- [ ] **Step 5: Run** `npx vitest run src/lib src/components/reports src/components/payments src/qollanma` → PASS; `npx tsc --noEmit -p .` → clean; `npm run lint` → 0 errors; the full client suite `npm test` → PASS.
- [ ] **Step 6: Commit**
```bash
git add -A "client/src/app/(dashboard)/reports/payment-reports" client/src/lib/reports-nav.ts client/src/lib/reports-nav.test.ts client/src/lib/breadcrumb-routes.ts client/src/data/searchable-pages.ts client/src/lib/nav-items.ts client/src/components/reports/reports-layout-shell.tsx client/src/components/reports/payment-reports
git commit -m "feat(reports): «Guruhlar bo'yicha to'lov» replaces «To'lov hisobotlari» in the menu, breadcrumb and search

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ADR, CLAUDE.md files, role access and the user guide

**Files:**
- Create: `docs/adr/0092-guruhlar-tolovi-hisob-ulushida.md`, `client/src/qollanma/kontent/hisobotlar/guruhlar-tolovi.mdx`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md` (Reports Module «Roles» bullet; one new bullet after the «`GET /reports/student-payments` is removed» bullet; «One month-end expectation» → the «From 2026-09 …» bullet), `client/CLAUDE.md` (URL-Persisted Tab State scope line; new section after «Marketing report»), `docs/role-access.md` (Reports table and the paragraph under it), `client/src/qollanma/sahifalar/hisobotlar.ts`, `client/src/qollanma/yangiliklar.ts`

**Interfaces:**
- Consumes: the route, file and function names of Tasks 1–9.
- Produces: documentation only.

- [ ] **Step 0: Pick the number.** `git fetch origin && git show origin/main:docs/adr/README.md | grep -o '^| \[[0-9]*\]' | tail -3` and `ls docs/adr | tail -3`. The number is the highest on `origin/main` and in this worktree + 1 — `0092` if `main` still ends at `0091`. If `main` moved, use the next free number in every place below (file name, README row, `adr` list in `hisobotlar.ts`, both CLAUDE.md mentions, `role-access.md`).
- [ ] **Step 1: The ADR (Uzbek)** `docs/adr/0092-guruhlar-tolovi-hisob-ulushida.md`:

```markdown
# ADR-0092 — Guruhlar bo'yicha to'lov: oy hisobi guruhlarga hisob ulushida bo'linadi; ustoz — hozirgi

**Holati:** Qabul qilindi
**Sana:** 2026-10-16
**Bog'liq:** ADR-0058, ADR-0059, ADR-0067, ADR-0072, ADR-0079, ADR-0088, `server/src/reports/month-charges.ts`, `server/src/reports/group-payments/`, `client/src/components/reports/group-payments/`, `docs/superpowers/specs/2026-10-16-b5-guruh-tolov-design.md`, `docs/superpowers/plans/2026-10-16-b5-guruh-tolov.md`

## Kontekst

Hisobotlardagi «To'lov hisobotlari» sahifasining kartalari (jami to'lov, usullar, filiallar, qaytarilgan to'lovlar) endi «To'lovlar» sahifasida (ADR-0088). Uning «O'qituvchilar» jadvali va ustozning guruhlari oynasi o'quvchining bugungi butun manfiy balansini u o'qigan har bir guruhga yozardi: ikki guruhda o'qigan qarzdorning qarzi ikki marta sanalardi, ustozlar yig'indisi jamidan katta chiqardi. «Kutilgan summa» o'quvchilar soni × kurs narxi edi — chegirma, oy o'rtasida qo'shilish va muzlatishni bilmasdi. Oy tanlanmasdi, o'quvchi darajasiga tushib bo'lmasdi, Excel yo'q edi.

## Qaror

1. **Bitta manba.** Hisobotning hamma raqami `reports/month-charges.ts` dan: oyning CHARGED `EnrollmentMonthlyCharge` qatorlari (filial — hisob qatorining `branchId` si) va o'quvchining bugungi balansi. O'quvchi qoldig'i — ADR-0058 qoidasi, filial ulushi — `splitMonthCharges` dagi formula. U endi bitta pure funksiyada (`studentShares`): `splitMonthCharges` uni qo'shadi, `splitMonthChargesByCharge` uni bo'ladi.
2. **Hisob ulushida bo'linadi.** O'quvchining doiradagi ulushi uning shu oydagi doiradagi hisob qatorlariga `chargedAmount` ulushida bo'linadi; yaxlitlash qoldig'i eng katta kasr qismli qatorga beriladi (largest remainder; teng bo'lsa qator id si bo'yicha). Qatorlar yig'indisi o'quvchi ulushiga aynan teng.
3. **Jamiga tenglik testi.** Tasodifiy ma'lumotda guruhlar yig'indisi `splitMonthCharges` bilan so'mma-so'm teng: `charged`, `paid`, `unpaid`, `students`, `unpaidStudents` (`month-charges.spec.ts`, `group-payments.math.spec.ts`). To'landi = hisoblandi − qoldi (balansdan, pul emas).
4. **Ustoz va kurs — hozirgi.** Guruh hozirgi `GroupTeacher` lariga va hozirgi `courseId` siga yoziladi. Ikki ustozli guruh ikkalasida ham sanaladi (jadval ostida izoh); bir ustozning ikki guruhidagi o'quvchi bir marta sanaladi; ustozi yo'q guruh «Ustozsiz» qatorida.
5. **Eski uch endpoint olib tashlandi** — `GET /reports/payment-reports`, `/payment-reports/teachers`, `/payment-reports/teachers/:teacherId/groups`: qarzni guruhlar orasida ikki marta sanardi. Sahifa havolasi (`/reports/payment-reports`) va `reports.payments` imkoniyati qoladi (yorlig'i «Guruhlar bo'yicha to'lov hisoboti»). Yangi route'lar: `GET /reports/group-payments`, `/group-payments/groups/:groupId`, `/group-payments/excel` — `@BranchScope()`, ro'yxat doirasi, bo'sh doira — 403.
6. Hisobot sentabr 2026 dan (oylik hisob boshlangan oy) joriy Toshkent oyigacha; kesh yo'q.

## Taqiqlanadi

- Guruh yoki ustoz qarzini o'quvchining butun balansidan hisoblash.
- Oy hisobining ikkinchi formulasini yozish: guruh, ustoz va kurs raqamlari ham `month-charges.ts` dan o'qiladi.

## Muqobillar

- **Eski hisob avval yopiladi** (FIFO, `replayDebtOrigin`): qaysi guruh hisobi oldin to'langani aniqroq, lekin guruhlar yig'indisi «Umumiy ma'lumotlar»dagi «Qoldi» bilan teng chiqmasligi mumkin. CEO tanlamadi.
- **Oyda ko'p dars bergan ustoz:** o'tgan oylar uchun aniqroq, lekin murakkab. CEO tanlamadi.

## Oqibatlar

- «Qoldi» bugungi balansdan: o'tgan oyning «Qoldi»si keyingi to'lov kelganda kamayadi (ADR-0058 dagidek).
- Ustoz almashgan guruh o'tgan oy uchun ham yangi ustozda ko'rinadi; oy davomida o'chirilgan kurs nomi o'chirilgan holida ko'rsatiladi.
- Ikki guruhli o'quvchi qoldig'ining bo'linishi — kelishuv (hisob ulushi), qaysi guruh hisobini «oldin» yopgani emas.
- Server va sayt birga chiqadi: eski sayt sahifasi olib tashlangan endpointlarni chaqiradi.
```
- [ ] **Step 2: README row** in `docs/adr/README.md`, after the 0091 row:
```markdown
| [0092](0092-guruhlar-tolovi-hisob-ulushida.md) | Guruhlar bo'yicha to'lov: oy hisobi (`month-charges.ts`) guruhlarga hisob ulushida bo'linadi (largest remainder, `splitMonthChargesByCharge`), guruhlar yig'indisi «Qoldi» bilan so'mma-so'm teng; ustoz va kurs — hozirgi; eski uch `payment-reports` endpoint olib tashlandi | Qabul qilindi | 2026-10-16 |
```
- [ ] **Step 3: server/CLAUDE.md.**
  - Reports Module «**Roles**» bullet: replace the sentences from «The `/reports/payment-reports` page (`payment-reports`, …» to the end of the bullet with: «The «Guruhlar bo'yicha to'lov» report (`GET /reports/group-payments*`, ADR-0092) is the exception: it is `reports.payments`, so the Administrator reads it too, and `@BranchScope()` still confines an Administrator to their own branch(es). The client mirrors it in `reports-nav.ts` (`permission: "reports.payments"`).»
  - New bullet right after «**`GET /reports/student-payments` is removed (ADR-0088)** …»: «**«Guruhlar bo'yicha to'lov» (ADR-0092, `reports/group-payments/`, `GroupPaymentsController`)**: `GET /reports/group-payments` (the card + the cut's rows, filtered, sorted and paged on the server), `GET /reports/group-payments/groups/:groupId` (the drawer; a group without a charge in the month and scope is 404 «Bu guruh tanlangan oyda topilmadi»), `GET /reports/group-payments/excel` (two sheets) — all `reports.payments`, `@BranchScope()` read as a list (an empty scope is 403), never in `branch-route-policy.ts`. `?oy=YYYY-MM` from 2026-09 to the current Tashkent month (400 «Bu hisobot sentabr 2026 dan boshlanadi» / «Kelajak oyni tanlab bo'lmaydi»). The loader reads the month on `loadMonthCharges`' chain and every figure is a sum of `splitMonthChargesByCharge` shares (`group-payments.math.ts`); a teacher or course row adds its groups (a student once per row), the teacher being the group's CURRENT `GroupTeacher`. No cache. `GET /reports/payment-reports*` are gone.»
  - «One month-end expectation» → the «**From 2026-09 (monthly billing)** …» bullet: after «…read through `ReportsService.getMonthCharges`;» insert «`splitMonthChargesByCharge` (same file, the same pure `studentShares` core) spreads each student's unpaid share over his in-scope charge rows by `chargedAmount` (largest remainder), so a per-group sum equals `unpaid` to the so'm — «Guruhlar bo'yicha to'lov» reads it (ADR-0092);».
- [ ] **Step 4: client/CLAUDE.md.**
  - URL-Persisted Tab State, «**Scope:**» line: «The only exemption is a `<Tabs>` with a **single** trigger (no navigation choice — e.g. `/reports/payment-reports`); it may stay uncontrolled.» → «The only exemption is a `<Tabs>` with a **single** trigger (no navigation choice); it may stay uncontrolled.»
  - New section after «### Marketing report (`/reports/marketing`, ADR-0067)»:
    ```markdown
    ### Group payments report (`/reports/payment-reports`, ADR-0092)

    - «Guruhlar bo'yicha to'lov», the one item of «Moliyaviy hisobotlar» (`reports-nav.ts`, `permission: "reports.payments"`: CEO, Branch Director, Administrator). Files in `components/reports/group-payments/`: `group-payments-page.tsx`, `group-payments-summary.tsx`, `group-payments-filter-bar.tsx`, `group-payments-table.tsx`, `group-drawer.tsx`, `group-payments-url.ts`, `group-payments-queries.ts`, `group-payments-types.ts`, `group-payments-format.ts` (pure, vitest).
    - URL keys (`GROUP_PAYMENTS_SCHEMA`): `oy` (empty = the current Tashkent month; `MonthStepper` from 2026-09), `kesim` (`guruh|ustoz|kurs`), `q`, `tartib` (`foiz|qoldi|nomi`), `qarzdor` (`1`), `sahifa`, `soni` (10–50, `PaymentsPager` with `sizes`), `guruh` (the open drawer). The server's parameters have the same names; the current month is not sent.
    - One request (`GET /reports/group-payments`) answers the card and the table; the card never follows the filters. Filtering, sorting and paging are the server's; the client computes no figure (`pctText` only rounds the server's percentage). Only «Guruhlar» rows open the drawer (`GET /reports/group-payments/groups/:id`; a 404 prints «Bu guruh tanlangan oyda topilmadi»). Excel: `GET /reports/group-payments/excel` with the same filters, no page.
    ```
- [ ] **Step 5: docs/role-access.md.** In the «### Reports» table add the row
  `| Guruhlar bo'yicha to'lov (`/reports/payment-reports`) | Yes | Yes | Own branch | No | No |`
  and end the paragraph under the table with: ««To'lov hisobotlari» o'rniga «Guruhlar bo'yicha to'lov» (ADR-0092): `reports.payments` — CEO, filial direktori va administrator; administrator faqat o'z filiali raqamlarini ko'radi.»
- [ ] **Step 6: The guide.** `client/src/qollanma/kontent/hisobotlar/guruhlar-tolovi.mdx` (no `# h1`, no `{` `}` `<` in prose, invented figures only):

```mdx
## Sahifa nima beradi

Hisobotlar → «Guruhlar bo'yicha to'lov» bitta savolga javob beradi: tanlangan oyda qaysi guruh qancha to'ladi, qancha qoldi va kim to'lamagan. Raqamlar «Umumiy ma'lumotlar» sahifasidagi oy to'lovlari kartasining o'zi — faqat guruh, ustoz va kurs kesimida.

Hisobot sentabr 2026 dan boshlanadi (undan oldin oylik hisob yo'q edi). Filial tepadagi tanlovdan olinadi; administrator faqat o'z filialini ko'radi.

## Oy va Excel

Sarlavha yonidagi «‹ Oy ›» bilan oy tanlanadi; kelajak oyni tanlab bo'lmaydi. «Excel» tugmasi ikki varaqli fayl beradi: birinchisida ekrandagi jadval (tanlangan kesim, qidiruv va «Faqat qarzi borlar» bilan, hamma sahifalar) va «Jami» qatori, ikkinchisida har bir o'quvchi — guruh, ustoz, telefon, hisoblandi, to'landi, qoldi, holat va belgi.

## Yig'ma karta

- **Hisoblandi** — oyda yozilgan hisoblar; ostida guruhlar va o'quvchilar soni.
- **To'landi** — hisoblangandan qolgan qarz ayirilgani va uning foizi.
- **Qoldi** — hali to'lanmagan qism; ostida guruhlar foizining o'rtachasi.
- «To'liq to'lagan guruh» — qoldig'i yo'q guruhlar soni; «Yarmidan kami to'langan» — to'langan foizi 50 dan kam guruhlar soni.

Karta jadval filtrlariga bog'liq emas: kesim, qidiruv yoki «Faqat qarzi borlar» uni o'zgartirmaydi.

## Kesim, qidiruv va saralash

- «Guruhlar», «Ustozlar», «Kurslar» — jadval qaysi kesimda ko'rsatilishi.
- Qidiruv: Guruhlar kesimida guruh nomi yoki raqami, ustoz ismi va kurs nomi bo'yicha; Ustozlar kesimida ustoz ismi, Kurslar kesimida kurs nomi bo'yicha.
- Saralash: «Eng past foiz», «Eng ko'p qoldi» yoki «Nomi».
- «Faqat qarzi borlar» — qoldig'i bor qatorlar.

O'chirilgan guruh «o'chirilgan», yopilgan guruh «yopilgan» belgisi bilan chiqadi: oyda hisob yozilgan har bir guruh jadvalda bor.

## Guruh oynasi

Guruhlar kesimida qatorni bossangiz o'ngdan guruh oynasi ochiladi: jami qoldiq va har o'quvchi — «to'ladi», «qisman» yoki «to'lamagan» holati, summasi va belgisi («guruhdan chiqqan», «muzlatilgan», «arxivda»). Oy davomida guruhdan chiqqan yoki muzlatilgan o'quvchi ham ro'yxatda qoladi, chunki uning hisobi o'sha oyga yozilgan. Ism bosilsa o'quvchi profili ochiladi. Pastda «Guruh sahifasi» va shu guruh bo'yicha «Qarzdorlik» havolalari bor.

## Qoldi qanday hisoblanadi

Qoldiq o'quvchining bugungi balansidan olinadi: o'quvchi keyinroq to'lasa, o'tgan oyning «Qoldi»si ham kamayadi.

O'quvchi oy o'rtasida guruh almashtirgan bo'lsa, uning qoldig'i ikki guruhga hisob ulushida bo'linadi. Masalan, birinchi guruhda 150 000, ikkinchisida 300 000 so'm hisoblangan va 90 000 so'm to'lanmagan bo'lsa, birinchi guruhga 30 000, ikkinchisiga 60 000 so'm qoldiq yoziladi. Shuning uchun guruhlar yig'indisi «Umumiy ma'lumotlar»dagi «Qoldi» bilan so'mma-so'm teng.

<Eslatma tur="malumot">

Ustozlar kesimida guruh hozirgi ustoziga yoziladi: ustoz almashgan bo'lsa, o'tgan oy ham yangi ustozda ko'rinadi. Ikki ustozli guruh har ikkala ustozda sanaladi, shuning uchun ustozlar yig'indisi jamidan katta bo'lishi mumkin.

</Eslatma>
```
Registry entry in `client/src/qollanma/sahifalar/hisobotlar.ts` (first in the array — the menu's order):
```ts
  {
    bolim: "hisobotlar",
    sahifa: "guruhlar-tolovi",
    sarlavha: "Guruhlar bo'yicha to'lov",
    qisqacha:
      "Tanlangan oyda qaysi guruh qancha to'lagani, qancha qolgani va kim to'lamagani — «Umumiy ma'lumotlar»dagi raqamlarning o'zi, guruh, ustoz va kurs kesimida.",
    rollar: [1, 2, 3],
    adr: ["0092", "0058"],
    yollar: ["/reports/payment-reports"],
    kalitSozlar: ["guruh to'lovi", "qarzdor guruh", "ustoz bo'yicha to'lov", "to'lov hisoboti", "qoldi", "excel"],
    yangilangan: "2026-10-16",
  },
```
News entry at the top of `yangiliklar.ts` (the spec §7.2 text verbatim; `sana` is the PR day, never in the future, never older than the entry below it):
```ts
  {
    sana: "2026-10-16",
    sarlavha: "Guruhlar bo'yicha to'lov",
    matn: "Hisobotlarda «To'lov hisobotlari» o'rniga «Guruhlar bo'yicha to'lov»: oy tanlanadi, har guruh qancha to'lagani va qancha qolgani ko'rinadi, guruhni bosib kim to'lamaganini ko'rish mumkin. Raqamlar «Umumiy ma'lumotlar» bilan bir xil.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "hisobotlar", sahifa: "guruhlar-tolovi" },
  },
```
- [ ] **Step 7: Run** `cd client && npx vitest run src/qollanma` → PASS (registry: the MDX exists, no h1, the route exists, no breadcrumb clash; news order and date).
- [ ] **Step 8: Commit** (from the worktree root)
```bash
git add docs/adr/0092-guruhlar-tolovi-hisob-ulushida.md docs/adr/README.md server/CLAUDE.md client/CLAUDE.md docs/role-access.md client/src/qollanma/kontent/hisobotlar/guruhlar-tolovi.mdx client/src/qollanma/sahifalar/hisobotlar.ts client/src/qollanma/yangiliklar.ts
git commit -m "docs(reports): ADR-0092, CLAUDE.md, role access and the «Guruhlar bo'yicha to'lov» guide page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
(with the real number if Step 0 changed it).

---

## Spec coverage

| Spec | Task |
|---|---|
| §1, §2 (CEO decisions 1–6) | whole plan; 1 → T7/T8 (page, card, cut, filters, drawer) + T2/T3 (month floor); 2 → T1/T2; 3 → T2 (current teachers), T8 (note); 4 → T5; 5 → T6 (endpoints), T9 (old client, same URL, new title); 6 → T2 (marks), T8 (drawer links) |
| §3.1 menu, access, breadcrumb, search, branch from the header | T9 (menu, breadcrumb, search), T4 (`@BranchScope()` list scope), T3 (403) |
| §3.2 header: title, `MonthStepper` (2026-09 … current), Excel | T8 (page), T7 (`pageMonth`) |
| §3.3 summary card, chips, green line, filter-independent | T2 (`summarize`), T7 (card) |
| §3.4 kesim, search, sort, «Faqat qarzi borlar», page 1 on change, server-side | T2 (`filteredRows`), T7 (URL, bar), T8 (`onChange` → `sahifa: 1`) |
| §3.5 table columns, colours, pills, «Ustozsiz», deleted course name, note, paging 10–50, row click, footnote | T2 (rows), T3 (deleted group/course read), T8 (table, pager, notes) |
| §3.6 drawer: header, total box, students, marks, links, states, `?guruh=` | T2 (`studentLines`, `groupDrawer`), T3 (404), T7 (texts), T8 (drawer) |
| §3.7 empty, loading, error | T7 (card empty), T8 (table/drawer states, page error) |
| §4.1 one source | T1 (`studentShares`), T3 (loader chain) |
| §4.2 largest remainder, equality, paid = charged − unpaid | T1 (split + property test), T2 (property test) |
| §4.3 group, percentage, average, teacher/course rows | T2 |
| §4.4 status and mark | T2 |
| §5.1 files, access, month rule, no cache | T2 (`parseReportMonth`), T3 (service), T4 (routes, snapshot) |
| §5.2 `GET /reports/group-payments` | T3, T4 |
| §5.3 drawer route + 404 | T3, T4 |
| §5.4 Excel, two sheets, `qarzdor` | T5 |
| §5.5 permission unchanged, label, `permission-routes.spec.ts` | T4/T5 (routes pass), T6 (label) |
| §5.6 removals | T6 (server), T9 (client folder) |
| §6.1–§6.3 client files, URL keys, texts | T7, T8, T9 |
| §7.1 ADR | T10 |
| §7.2 CLAUDE.md files, role access, guide, registry, news | T10 |
| §8 tests | T1 (split), T2 (math), T3 (service, coverage), T4 (DTO, controller), T5 (Excel), T7/T8 (client), T9 (`reports-nav.test.ts`) |
| §9 deploy together, no migration | Global Constraints «Rollout» (not a task) |
| §10 known limits | T10 (ADR «Oqibatlar», guide) |

## Self-review notes

- Names used across tasks: `studentShares`, `paidPctOf`, `MonthChargeLine`, `ChargeShare`, `splitMonthChargesByCharge`; `GpCharge`, `GpGroup`, `GpStudent`, `GpData`, `GpTotals`, `GpSummary`, `GpRow`, `GpRowsResponse`, `GpStudentLine`, `GpGroupResponse`, `GpRawQuery`, `GpFilters`, `GpQuery`, `GpSheetStudent`, `parseReportMonth`, `toGpQuery`, `payStatus`, `studentMark`, `totalsOf`, `groupRows`, `teacherRows`, `courseRows`, `summarize`, `filteredRows`, `buildRowsResponse`, `studentLines`, `groupDrawer`, `studentSheetLines`, `KESIMLAR`, `TARTIBLAR`, `USTOZSIZ_ID`; `GroupPaymentsService.rows/group/excel`, `GroupPaymentsController.rows/excel/group`, `GroupDrawerQueryDto`, `GroupPaymentsFilterDto`, `GroupPaymentsQueryDto`, `groupPaymentsWorkbook`; client `GROUP_PAYMENTS_SCHEMA`, `GroupPaymentsFilters`, `GP_FIRST_MONTH`, `GP_PAGE_SIZES`, `GP_CLEARED`, `pageMonth`, `rowsParams`, `excelParams`, `hasGpFilter`, `excelFileName`, `pctTone`, `pctText`, `summaryTitle`, `studentAmountText`, `drawerSubtitle`, `useGroupPaymentsRows`, `useGroupPaymentsGroup`, `GroupPaymentsSummary`, `GroupPaymentsFilterBar`, `GroupPaymentsTable`, `GroupDrawer`, `GroupDrawerContent`, `GroupPaymentsPage`.
- Fixture arithmetic was checked by hand: the service fixture (student 10002: 600 000 over 450 000 / 300 000 → 360 000 / 240 000; student 10001: debt = November's charge → October paid) gives the summary `1 200 000 / 600 000 / 600 000 / 50 %`, average 40 %; the math fixture gives `2 250 000 / 1 250 000 / 1 000 000 / 55.6 %`, average 56.7 %, Olim `1 550 000 / 600 000 / 61.3 %`, Aziza `1 200 000 / 450 000 / 62.5 %`.
- The server answers status and mark as codes (`toladi|qisman|tolamagan`, `arxivda|muzlatilgan|chiqqan`, `ochirilgan|yopilgan`); the words live in `group-payments-format.ts` (screen) and `group-payments.excel.ts` (file).
- A student whose in-scope charges sum to 0 is not counted by `splitMonthCharges`, so he is absent from the groups too — the equality rule wins over «every group shows» for a group made only of such students.
- A deleted group is `ARCHIVED` (`GroupsWriteService.delete`), so it carries «o'chirilgan» only; `ARCHIVED` is not «yopilgan».
- Sheet 2 of the Excel ignores `kesim` and `q` («hamma o'quvchi–guruh qatorlari»), honours `qarzdor`; sheet 1 puts the marks beside the group name and the course in its own column.
- `intentional-access-changes.ts` has no `payment-reports` entry, so Task 6 removes only the three snapshot rows.
