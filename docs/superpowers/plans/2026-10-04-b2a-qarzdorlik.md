# B2a — «Qarzdorlik» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/payments/debt` as the CEO-approved page — three tabs (Shu oy / Eski qarz / O'qimayotganlar) cut from the one debt split, a student drawer with the promise form, the promise rule (≤ 7 days, once a month) on every promise write — and move the old tabs out to real pages and to Ish haqi.

**Architecture:** `reports/debt-split.ts` gains per-student rows (`debtRows`) and ONE tab rule (`debtTabAmount`); `splitDebt`'s totals become sums of those rows, so a tab's total always equals the sum of its rows. A new `payments/debt/` folder holds the pure list math, `DebtListService` (list, drawer, Excel) and `DebtListController` (`GET /payments/debt/list|students/:id|excel`). The promise rule is one pure function (`payment-promises/promise-rule.ts`) read by `PaymentPromisesService` (create, upsert, a new month-state read) and checked by the payment and call-log writes before they write anything. The client gets `components/payments/debt/` (page, filter bar, table, drawer) and three thin sub-pages that reuse the existing views.

**Tech Stack:** NestJS + Prisma + Jest + exceljs (server), Next.js 16 + React Query 5 + Tailwind/shadcn + Vitest static-markup tests (client).

**Code in this plan is written compactly; `npx prettier --write` (server only) reformats it.**

## Global Constraints

- **Where commands run.** Every command runs from the worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/moliya-a2` (never `cd` to the main checkout). Server commands are written `cd server && …`, client commands `cd client && …`, git commands from the worktree root with repo-relative paths.
- **Server commands** (from `server/`): one spec `npx jest <path>`, full suite `npm test`; `npm run typecheck` (type-checks specs too — jest is transpile-only, so a spec can mock a signature that no longer exists and stay green); `npx eslint <files>`; `npx prettier --write <touched .ts files>` (Prettier failures block CI).
- **Client commands** (from `client/`): `npx vitest run <path>`; `npx tsc --noEmit -p .`; `npm run lint`. **Never run prettier on `client/` files.**
- **`client/AGENTS.md` is never committed.** A dev server rewrites it; `git add` only the paths a task names.
- **Implementer rules.** Each implementer runs only the focused tests of its task plus `npm run typecheck` (server) / `npx tsc --noEmit -p .` (client). The controller runs the full suites, lint and builds after each task. Never run the server build and server tests in parallel (shared Prisma generation).
- **Language:** commit messages and new code comments in English; ADR text in Uzbek; every user-visible string in Latin-script Uzbek, no English word on screen (Task 8's test guards the debt page); in JSX text the apostrophe is `&apos;`, in a JS string or JSX attribute a plain `'` is fine.
- **Fixtures.** Tests use made-up numbers and IDs. Never copy a figure from the mock-up (its numbers are real production aggregates) or from production. The repository is public.
- **Day and month boundaries:** always the `server/src/common/date/tashkent` helpers (`tashkentDateStr`, `tashkentMonthKey`, `tashkentMonthRangeUtc`, `addDaysToDateStr`); never `getFullYear()`/`getMonth()` or `toISOString().slice` for "which day is it". The client uses `tashkentNow()` (`src/lib/tashkent-time.ts`).
- **Branch rules:** the new reads take `@BranchScope()` (the global `BranchScopeGuard` resolves ceiling ∩ requested); students are confined with `studentBranchWhere`, money rows with `branchIdWhere`; `[]` means nothing, `null` every branch.
- **Single sources:** debt only through `debt-split.ts` (tab membership and totals only through `debtTabAmount`); "where payments went" only through the statement model (`StatementService.build`); debt months only through `DebtAgeService`; the due date only through `paymentDueDate` on the live calendar (`MonthlyPaymentNoticeService`); the promise rule only through `promise-rule.ts`. Never re-derive any of them in the client or a second service.
- The two debt numbers are never added (ADR-0059); the page prints no combined figure.
- Every new or changed `@Roles` needs a controller guard spec.
- Commit after each task with its tests passing. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Client conventions** (`client/CLAUDE.md`): every table starts with a `#` column (`className="w-12 border-r"` / `className="border-r text-muted-foreground"`); numbers through `src/lib/format-utils.ts`; a page that reads `useSearchParams` (here via `useUrlFilters`) is wrapped in `<Suspense>`; a Sheet is `p-0 flex flex-col` → `border-b` header → scrolling body → `border-t` footer.
- **Rollout (spec §8, not part of these tasks):** one PR; merge and deploy only with the CEO's go-ahead, client first, then the server at once; never across the 02:00 / 03:10 / 04:00 crons or at 23:00. No migration.

---

**Spec:** `docs/superpowers/specs/2026-10-04-b2a-qarzdorlik-design.md` (read once, in full, before Task 1).

## Decisions where the spec and the code disagree (recorded here and in the reply)

1. **No route-policy entry.** Spec §5.7 asks for every new route in `branch-route-policy.ts`, but the new routes take `@BranchScope()`, which the manifest treats as evidence; `branch-route-policy.spec.ts` fails («does not re-declare») when such a route is listed. The policy spec is run instead to prove they are covered.
2. **The scope comes from `@BranchScope()`**, not from `resolveCallerReportBranchIds(userId, query.branchId)` as the debtor summary does — same ceiling ∩ requested rule, same `studentBranchWhere`; the drawer also needs `@BranchCeiling()` for ADR-0063's named 404.
3. **The not-studying set is read per student.** `loadDebtSplit` reads it with `groupBy(['status'])`; per-student rows need each not-studying debtor's current-month part, so it becomes a `findMany` with `status`. Totals do not change (every debtor has `balance < 0`), but the specs that mocked that `groupBy` (`debt-split.spec.ts`, `payments-debtors.service.spec.ts`) move to `findMany`, and fixtures typed `DebtSplit` gain the two new fields.
4. **An OPEN promise left from an earlier month.** The partial unique index allows one OPEN promise per student and the spec does not say what happens to last month's. A new month's promise (create or upsert) closes it as CANCELLED in the same transaction (history «Yangi oy va'dasi bilan almashtirildi»); otherwise every legacy far-dated promise would block the rule.
5. **No endpoint gave "the student's promise state"** (`GET /payment-promises` returns raw history). New `GET /payment-promises/month?studentId=` (class roles CEO/BD/Admin/Cashier, header scope) returns this month's promise and the allowed day ranges from the same pure rule; the drawer form and both dialogs read it.
6. **The call log is also validated before its write.** `CallLogsService.create` writes the call first and the promise after, so a refused promise would leave the call saved.
7. **The payment path.** Today the promise is written after the payment commits and a failure is only logged. Now the rule is checked before the transaction (400, nothing written); the post-commit write keeps its try/catch for a race.
8. **The due date.** `paymentDueDate` is applied inside the private `MonthlyPaymentNoticeService.secondLesson`. A public `dueDates(companyId, studentIds, monthKey)` there reuses it (the first standing charge's group, from the first covered lesson in any group — the reminder's rule); `BillingModule` exports the service.
9. **«Va'da yozish» is never hidden by role:** `POST /payment-promises` admits all four debt-page roles. It is disabled (with the reason) once the month has a promise.
10. **The old endpoints stay.** After this PR `GET /payments/debtors` has no client reader, but `PaymentsDebtorsService.getDebtors` still feeds the home attention block's top debtors (`dashboard-summary.service.ts`), and `GET /payments/debtors/summary` the outreach banner and the home block. Both routes stay (spec §8: the old client keeps working during rollout); removing the list route is a follow-up after deploy.
11. **Write-off count.** `/reports/debt-write-offs-summary` is month-bounded, so the list response carries `writeOffCount` (write-offs still in force, `branchIdWhere`).
12. **Page size 20** (spec) instead of the client convention's 10; Guruh/Ustoz filters are multi-select (client convention; the spec is silent). In O'qimayotganlar they filter by the last group and its teachers.
13. **URL values:** `?tab=shu-oy|eski|chiqqan` as the spec fixes; kind, promise and sort use the API's values (`frozen`, `broken`, `oldest`) so URL = request. Old `?promise=overdue` → `promise=broken`, `has_open` → `open`.
14. **The mock-up's green "same" banner is not built:** spec §2.2 replaced it with the difference note.
15. **The drawer closes before the payment or call dialog opens** (two Radix modals do not stack reliably).

## File map

**Server** (`server/src/…`)

| File | Change | Task |
|---|---|---|
| `reports/debt-split.ts` (+spec) | rows, tab rule, new split fields, `loadDebtRows` | 1 |
| `payments/payments-debtors.service.spec.ts` + four specs with `DebtSplit` fixtures | mocks, fixtures | 1 |
| `payment-promises/promise-rule.ts` (+spec) | new, pure | 2 |
| `payment-promises/payment-promises.service.ts` (+spec), `…controller.ts` (+spec), `dto/create-payment-promise.dto.ts` | rule, `GET month`, `promisedAmount` | 2 |
| `payments/payments-write.service.ts` (+ `payments.service.spec.ts`), `call-logs/call-logs.service.ts` (+spec) | rule before the write; export `OUTCOME_LABEL` | 2 |
| `payments/debt/debt-list.math.ts` (+spec) | new, pure | 3 |
| `billing/monthly-payment-notice.service.ts` (+spec), `billing/billing.module.ts` | `dueDates`, export | 4 |
| `payments/debt/dto/debt-list-query.dto.ts`, `debt-list.service.ts` (+spec), `debt-list.controller.ts` (+spec), `payments/payments.module.ts` | new: list (4), drawer + Excel (5) | 4, 5 |
| `payments/debt/debt-list.excel.ts` | new | 5 |
| `salary/salary.controller.ts` (+spec) | center-topup CEO/BD | 7 |

**Docs:** `docs/adr/0072-qarzdorlik-qatorlari-va-vada-qoidasi.md`, `docs/adr/README.md` (6); `server/CLAUDE.md`, `client/CLAUDE.md`, `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md`, the guide (10).

**Client** (`client/src/…`)

| File | Change | Task |
|---|---|---|
| `components/payments/debt/debt-subpage.tsx` (+ `debt-subpages.test.ts`); `app/(dashboard)/payments/{debt-history,debt-write-offs,frozen-balances}/page.tsx` | real sub-pages | 7 |
| `components/payments/debt/center-topup-view.tsx`, `components/payments/salary-client.tsx`, `salary-monthly-view.tsx`, `debt/debt-page-client.tsx`, `lib/breadcrumb-routes.ts` | «Markaz qoplagani» on Ish haqi | 7 |
| `components/payments/debt/debt-types.ts`, `debt-url.ts` (+test), `debt-format.ts` (+test), `debt-queries.ts`, `debt-filter-bar.tsx`, `debt-table.tsx`, `debt-page.tsx` (+test); `app/(dashboard)/payments/debt/page.tsx` | new page | 8 |
| deleted: `debt/debt-page-client.tsx`, `debt/debtors-view.tsx` (+test), `payments/debtor-row.tsx` | — | 8 |
| `components/payments/promise-month.ts` (+test), `debt/debt-drawer.tsx` (+test), `record-payment-dialog.tsx`, `outreach/log-call-dialog.tsx`, `lib/role-access.ts` | drawer, promise caps, `STATEMENT_ROLES` | 9 |

---

### Task 1: The debt split returns per-student rows; one tab rule sums the totals

**Files:**
- Modify: `server/src/reports/debt-split.ts`, `server/src/reports/debt-split.spec.ts`
- Modify: `server/src/payments/payments-debtors.service.spec.ts` (`describe('getDebtorSummary')`)
- Modify fixtures typed `DebtSplit`: `server/src/telegram-groups/telegram-group-stats.service.spec.ts`, `server/src/telegram-groups/telegram-group-daily-report.service.spec.ts`, `server/src/telegram-groups/utils/debt-split-lines.util.spec.ts`, `server/src/reports/reports-excel.service.spec.ts` (and any other the typecheck names)

**Interfaces:**
- Produces (`reports/debt-split.ts`):
  - `DebtSplit` gains `studying.currentMonthCount: number` and `notStudying.currentMonth: number`.
  - `type DebtKindKey = 'ungrouped' | 'frozen' | 'left'`; `type DebtTab = 'shu-oy' | 'eski' | 'chiqqan'`; `const DEBT_TABS: readonly DebtTab[]`.
  - `interface DebtRow { studentId; debt; currentMonth; older; kind: DebtKindKey | null }` (`null` = studying).
  - `debtTabAmount(row, tab): number` — the tab rule; 0 = not in the tab.
  - `debtRows({ studying: {id, balance}[]; notStudying: {id, balance, status}[]; chargedThisMonth }): DebtRow[]`; `sumDebtRows(rows): DebtSplit`; `splitDebt(input)` = `sumDebtRows(debtRows(input))`.
  - `loadDebtRows(prisma, companyId, { branchIds, month? }): Promise<{ rows: DebtRow[]; split: DebtSplit }>`; `loadDebtSplit` returns its `split`. `NotStudyingByStatus` is removed.

- [ ] **Step 1: Rewrite the spec's inputs and add the row tests**

In `server/src/reports/debt-split.spec.ts`:

1. The import of `./debt-split` becomes `import { debtKindOf, debtRows, debtTabAmount, loadDebtRows, loadDebtSplit, splitDebt, studyingDebtorWhere, sumDebtRows, type DebtTab } from './debt-split';`
2. In `describe('splitDebt')`:
   - first test: its `notStudying` becomes `[{ id: 7, balance: -100_000, status: 'FROZEN' }, { id: 8, balance: -100_000, status: 'FROZEN' }, { id: 9, balance: -50_000, status: 'FROZEN' }]`; the expected `studying` gains `currentMonthCount: 2`, the expected `notStudying` gains `currentMonth: 0`;
   - «no charge this month»: expected `studying` gains `currentMonthCount: 0`;
   - «nobody owes»: expected `studying` gains `currentMonthCount: 0`, `notStudying` gains `currentMonth: 0`;
   - «names every not-studying status»: `notStudying` becomes per-student rows of the same totals:

```ts
      notStudying: [
        ...[100, 101, 102, 103].map((id) => ({ id, balance: -320_000, status: 'ACTIVE' })),
        ...[200, 201, 202].map((id) => ({ id, balance: -330_000, status: 'FROZEN' })),
        { id: 300, balance: -300_000, status: 'EXPELLED' }, { id: 301, balance: -300_000, status: 'EXPELLED' },
        { id: 400, balance: -30_000, status: 'GRADUATED' }, { id: 500, balance: -20_000, status: 'INACTIVE' },
        { id: 600, balance: -5_000, status: 'ARCHIVED' }, { id: 700, balance: -1_000, status: 'PROSPECT' },
      ],
```

3. After `describe('splitDebt')`, add:

```ts
describe('debtRows / debtTabAmount — the one tab rule (ADR-0072)', () => {
  const rows = debtRows({
    studying: [
      { id: 1, balance: -600_000 }, // both parts: 450 000 shu oy, 150 000 eski
      { id: 2, balance: -100_000 }, // shu oy only
      { id: 3, balance: -80_000 }, // nothing charged this month: eski only
    ],
    notStudying: [{ id: 4, balance: -300_000, status: 'FROZEN' }, { id: 5, balance: -50_000, status: 'EXPELLED' }],
    chargedThisMonth: new Map([[1, 450_000], [2, 450_000], [4, 200_000]]),
  });
  const tab = (t: DebtTab) =>
    rows.filter((r) => debtTabAmount(r, t) > 0).map((r) => [r.studentId, debtTabAmount(r, t)]);

  it('a studying debtor with both parts is in both studying tabs, each with its own part', () => {
    expect(tab('shu-oy')).toEqual([[1, 450_000], [2, 100_000]]);
    expect(tab('eski')).toEqual([[1, 150_000], [3, 80_000]]);
  });

  it("a not-studying debtor is only in O'qimayotganlar, with the whole debt and its kind", () => {
    expect(tab('chiqqan')).toEqual([[4, 300_000], [5, 50_000]]);
    expect(rows.find((r) => r.studentId === 4)).toMatchObject({ kind: 'frozen', currentMonth: 200_000 });
    expect(rows.find((r) => r.studentId === 5)?.kind).toBe('left');
  });

  it('every total is the sum of its tab rows, the two new fields included', () => {
    const s = sumDebtRows(rows);
    const sum = (t: DebtTab) => tab(t).reduce((a, [, v]) => a + v, 0);
    expect(s.studying.currentMonth).toBe(sum('shu-oy'));
    expect(s.studying.currentMonthCount).toBe(tab('shu-oy').length);
    expect(s.studying.older).toBe(sum('eski'));
    expect(s.studying.olderCount).toBe(tab('eski').length);
    expect(s.notStudying.total).toBe(sum('chiqqan'));
    expect(s.notStudying.count).toBe(tab('chiqqan').length);
    expect(s.notStudying.currentMonth).toBe(200_000);
    expect(s.studying.total).toBe(780_000);
    expect(s.studying.currentMonth + s.studying.older).toBe(s.studying.total);
  });
});
```

4. Replace the whole `describe('loadDebtSplit', …)` block with:

```ts
describe('loadDebtRows / loadDebtSplit', () => {
  const STUDYING = [{ id: 5, balance: -300_000 }];
  const NOT_STUDYING = [{ id: 6, balance: -50_000, status: 'ACTIVE' }, { id: 7, balance: -40_000, status: 'EXPELLED' }];
  /** The two student reads differ by `NOT` (the not-studying predicate). */
  const makeDb = (studying = STUDYING, notStudying = NOT_STUDYING) => ({
    student: {
      findMany: jest.fn((args: { where: Prisma.StudentWhereInput; select?: unknown }) =>
        Promise.resolve(args.where.NOT ? notStudying : studying)),
    },
    enrollmentMonthlyCharge: {
      groupBy: jest.fn().mockResolvedValue([
        { studentId: 5, _sum: { chargedAmount: 450_000 } },
        { studentId: 6, _sum: { chargedAmount: 30_000 } },
      ]),
    },
  });
  const reads = (db: ReturnType<typeof makeDb>) => {
    const calls = db.student.findMany.mock.calls.map(([a]) => a);
    return { studying: calls.find((a) => !a.where.NOT)!, notStudying: calls.find((a) => a.where.NOT)! };
  };

  it('returns one row per debtor and the totals summed from those rows', async () => {
    const { rows, split } = await loadDebtRows(makeDb() as never, 1, { branchIds: [4], month: '2026-10' });
    expect(rows).toEqual([
      { studentId: 5, debt: 300_000, currentMonth: 300_000, older: 0, kind: null },
      { studentId: 6, debt: 50_000, currentMonth: 30_000, older: 20_000, kind: 'ungrouped' },
      { studentId: 7, debt: 40_000, currentMonth: 0, older: 40_000, kind: 'left' },
    ]);
    expect(split).toEqual(sumDebtRows(rows));
    expect(split.notStudying.currentMonth).toBe(30_000);
    expect(await loadDebtSplit(makeDb() as never, 1, { branchIds: [4], month: '2026-10' })).toEqual(split);
  });

  it('studying is the exported predicate; not studying is its complement, read per student with the status', async () => {
    const db = makeDb();
    await loadDebtRows(db as never, 1, { branchIds: null, month: '2026-10' });
    const { studying, notStudying } = reads(db);
    expect(studying.where).toEqual(studyingDebtorWhere(1, null));
    expect(studying.select).toEqual({ id: true, balance: true });
    expect(notStudying.where.NOT).toEqual(activeStudentWhere());
    expect(notStudying.where).toMatchObject({ companyId: 1, deletedAt: null, balance: { lt: 0 } });
    expect(notStudying.select).toEqual({ id: true, balance: true, status: true });
  });

  it('the branch rides on both student reads; company-wide has none; an empty scope matches nothing', async () => {
    const cases: [number[] | null, unknown][] = [
      [[4], { some: { branchId: { in: [4] } } }],
      [null, undefined],
      [[], { some: { branchId: { in: [] } } }],
    ];
    for (const [branchIds, branches] of cases) {
      const db = makeDb();
      await loadDebtRows(db as never, 1, { branchIds, month: '2026-10' });
      expect(reads(db).studying.where.branches).toEqual(branches);
      expect(reads(db).notStudying.where.branches).toEqual(branches);
    }
  });

  it("the charges read covers every debtor — studying and not — that month's CHARGED charges, no branch", async () => {
    const db = makeDb();
    await loadDebtRows(db as never, 1, { branchIds: [4], month: '2026-10' });
    // `toEqual` pins that it carries NO `branchId`: the balance is one.
    expect(db.enrollmentMonthlyCharge.groupBy.mock.calls[0][0]).toEqual({
      by: ['studentId'],
      where: { companyId: 1, studentId: { in: [5, 6, 7] }, periodYear: 2026, periodMonth: 10, status: 'CHARGED' },
      _sum: { chargedAmount: true },
    });
  });

  it('reads no charges when nobody owes', async () => {
    const db = makeDb([], []);
    const { rows, split } = await loadDebtRows(db as never, 1, { branchIds: null, month: '2026-10' });
    expect(db.enrollmentMonthlyCharge.groupBy).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
    expect(split.studying.total).toBe(0);
  });

  it('without a month it is the current TASHKENT month, not the UTC one', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-10-31T20:00:00Z')); // 01.11 01:00 in Tashkent
    try {
      const db = makeDb();
      await loadDebtRows(db as never, 1, { branchIds: null });
      expect(db.enrollmentMonthlyCharge.groupBy.mock.calls[0][0].where).toMatchObject({ periodYear: 2026, periodMonth: 11 });
    } finally {
      jest.useRealTimers();
    }
  });
});
```

Run: `cd server && npx jest src/reports/debt-split.spec.ts` — Expected: FAIL (`debtRows`, `debtTabAmount`, `sumDebtRows`, `loadDebtRows` not exported).

- [ ] **Step 2: Rows and the tab rule in `debt-split.ts`**

In `server/src/reports/debt-split.ts`:

1. In `interface DebtSplit` add `currentMonthCount: number;` to `studying` (after `currentMonth`, doc: «Studying debtors with a «shu oy» part — the Shu oy tab's count») and `currentMonth: number;` to `notStudying` (after `count`, doc: «Σ min(debt, this month's CHARGED charges) of the not-studying debtors — their part of the overview's «Qoldi» (ADR-0072)»).
2. Delete `interface NotStudyingByStatus`. Change `debtKindOf`'s return type to `DebtKindKey` (body unchanged).
3. After `interface DebtKind`, add:

```ts
export type DebtKindKey = keyof DebtSplit['notStudying']['byKind'];

/** The debt page's three tabs (spec B2a §2.2). */
export type DebtTab = 'shu-oy' | 'eski' | 'chiqqan';
export const DEBT_TABS: readonly DebtTab[] = ['shu-oy', 'eski', 'chiqqan'];

/** One debtor of the base, with the parts every debt surface reads. */
export interface DebtRow {
  studentId: number;
  /** The whole debt (−balance). */
  debt: number;
  /** min(debt, this month's CHARGED charges) — «shu oy». */
  currentMonth: number;
  /** debt − currentMonth — «eski qarz». */
  older: number;
  /** null = studying (ADR-0059); else the not-studying kind (ADR-0067). */
  kind: DebtKindKey | null;
}

/**
 * THE tab rule (ADR-0072): what a debtor owes in a tab, 0 when not in it. The
 * debt list's rows and `sumDebtRows`' totals both read it, so a tab's total is
 * the sum of its rows. A studying debtor with both parts is in both studying
 * tabs — two views of one debt, never two debts.
 */
export function debtTabAmount(row: DebtRow, tab: DebtTab): number {
  if (tab === 'chiqqan') return row.kind === null ? 0 : row.debt;
  if (row.kind !== null) return 0;
  return tab === 'shu-oy' ? row.currentMonth : row.older;
}
```

4. Replace `splitDebt` with:

```ts
/** Pure. One row per debtor: `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function debtRows(input: {
  studying: readonly { id: number; balance: number }[];
  notStudying: readonly { id: number; balance: number; status: string }[];
  chargedThisMonth: ReadonlyMap<number, number>;
}): DebtRow[] {
  const row = (studentId: number, balance: number, kind: DebtKindKey | null): DebtRow => {
    const debt = Math.max(0, -balance);
    const currentMonth = Math.min(debt, input.chargedThisMonth.get(studentId) ?? 0);
    return { studentId, debt, currentMonth, older: debt - currentMonth, kind };
  };
  return [
    ...input.studying.map((s) => row(s.id, s.balance, null)),
    ...input.notStudying.map((s) => row(s.id, s.balance, debtKindOf(s.status))),
  ];
}

/** Pure. Every total is a sum of `debtTabAmount` over the rows — never a second rule. */
export function sumDebtRows(rows: readonly DebtRow[]): DebtSplit {
  const kind = (): DebtKind => ({ total: 0, count: 0 });
  const split: DebtSplit = {
    studying: { total: 0, count: 0, currentMonth: 0, currentMonthCount: 0, older: 0, olderCount: 0 },
    notStudying: { total: 0, count: 0, currentMonth: 0, byKind: { ungrouped: kind(), frozen: kind(), left: kind() } },
  };
  for (const r of rows) {
    if (r.kind === null) {
      const s = split.studying;
      const shuOy = debtTabAmount(r, 'shu-oy');
      const eski = debtTabAmount(r, 'eski');
      s.total += r.debt;
      s.count += 1;
      s.currentMonth += shuOy;
      if (shuOy > 0) s.currentMonthCount += 1;
      s.older += eski;
      if (eski > 0) s.olderCount += 1;
    } else {
      const n = split.notStudying;
      const amount = debtTabAmount(r, 'chiqqan');
      n.total += amount;
      n.count += 1;
      n.currentMonth += r.currentMonth;
      n.byKind[r.kind].total += amount;
      n.byKind[r.kind].count += 1;
    }
  }
  return split;
}

/** Pure. `sumDebtRows(debtRows(input))`. */
export function splitDebt(input: Parameters<typeof debtRows>[0]): DebtSplit {
  return sumDebtRows(debtRows(input));
}
```

5. In `type DebtSplitDb`, `student` becomes `Pick<Prisma.TransactionClient['student'], 'findMany'>`. Replace `loadDebtSplit` with:

```ts
/** Every debtor of the base as a row, and the totals summed from those rows. */
export async function loadDebtRows(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<{ rows: DebtRow[]; split: DebtSplit }> {
  const month = opts.month ?? tashkentMonthKey(new Date());
  const [y, m] = month.split('-').map(Number);
  const [studying, notStudying] = await Promise.all([
    prisma.student.findMany({ where: studyingDebtorWhere(companyId, opts.branchIds), select: { id: true, balance: true } }),
    // Per student, not grouped: the debt list needs each one's current-month part.
    prisma.student.findMany({
      where: { ...debtorBase(companyId, opts.branchIds), NOT: activeStudentWhere() },
      select: { id: true, balance: true, status: true },
    }),
  ]);
  const ids = [...studying, ...notStudying].map((s) => s.id);
  const charges =
    ids.length === 0
      ? []
      : await prisma.enrollmentMonthlyCharge.groupBy({
          by: ['studentId'],
          where: { companyId, studentId: { in: ids }, periodYear: y, periodMonth: m, status: MonthlyChargeStatus.CHARGED },
          _sum: { chargedAmount: true },
        });
  const rows = debtRows({
    studying,
    notStudying,
    chargedThisMonth: new Map(charges.map((c) => [c.studentId, c._sum.chargedAmount ?? 0])),
  });
  return { rows, split: sumDebtRows(rows) };
}

export async function loadDebtSplit(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<DebtSplit> {
  return (await loadDebtRows(prisma, companyId, opts)).split;
}
```

In the `studyingDebtorWhere` doc comment, replace `` `loadDebtSplit` o'qiyotganlar jamisini shu shart bilan o'qiydi `` with `` `loadDebtRows` o'qiyotganlarni shu shart bilan o'qiydi ``.

Run: `cd server && npx jest src/reports/debt-split.spec.ts` — Expected: PASS.

- [ ] **Step 3: Move the debtor-summary spec off `groupBy`**

In `server/src/payments/payments-debtors.service.spec.ts`, inside `describe('getDebtorSummary')`:

1. Replace `readsOneStudyingAndTwoNot` (and its comment) with:

```ts
    // `loadDebtRows` reads the studying debtors and, per student, the
    // not-studying ones (the read carrying `NOT`), then this month's charges.
    const readsOneStudyingAndTwoNot = () => {
      prisma.student.findMany.mockImplementation(({ where }) =>
        Promise.resolve(where.NOT
          ? [{ id: 6, balance: -40_000, status: 'FROZEN' }, { id: 7, balance: -50_000, status: 'FROZEN' }]
          : [{ id: 5, balance: -300_000 }]));
      prisma.enrollmentMonthlyCharge.groupBy.mockResolvedValue([{ studentId: 5, _sum: { chargedAmount: 450_000 } }]);
    };
```

2. In both `toEqual({ split: … })` expectations add `currentMonthCount: 1` (first test) / `currentMonthCount: 0` (empty scope) to `studying` and `currentMonth: 0` to `notStudying`.
3. Replace each `prisma.student.groupBy.mock.calls[0][0].where` with `prisma.student.findMany.mock.calls[1][0].where` (the second student read is the not-studying one). Keep `expect(prisma.student.groupBy).not.toHaveBeenCalled()` in the empty-scope test.

- [ ] **Step 4: Fix the typed fixtures, prove the readers did not move**

Run: `cd server && npm run typecheck`. The errors name literals typed `DebtSplit` (`telegram-group-stats.service.spec.ts` `NOBODY_OWES` and `split`; `telegram-group-daily-report.service.spec.ts` `DEBT_SPLIT`; `debt-split-lines.util.spec.ts` `split` and the inline `studying` passed to `buildDebtSplitLines`; `reports-excel.service.spec.ts` `debtSplit`). In each add `currentMonthCount: 0` to `studying` and `currentMonth: 0` to `notStudying` (those readers print neither). Re-run: no errors.

```bash
cd server && npx jest src/reports src/payments/payments-debtors.service.spec.ts src/telegram-groups src/dashboard
```
Expected: PASS — the overview, Telegram and home specs print the same figures.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server && npx prettier --write src/reports/debt-split.ts src/reports/debt-split.spec.ts src/payments/payments-debtors.service.spec.ts src/telegram-groups/telegram-group-stats.service.spec.ts src/telegram-groups/telegram-group-daily-report.service.spec.ts src/telegram-groups/utils/debt-split-lines.util.spec.ts src/reports/reports-excel.service.spec.ts
cd server && npx eslint src/reports/debt-split.ts
git add server/src/reports/debt-split.ts server/src/reports/debt-split.spec.ts server/src/payments/payments-debtors.service.spec.ts server/src/telegram-groups/telegram-group-stats.service.spec.ts server/src/telegram-groups/telegram-group-daily-report.service.spec.ts server/src/telegram-groups/utils/debt-split-lines.util.spec.ts server/src/reports/reports-excel.service.spec.ts
git commit -m "feat(debt): debt split returns per-student rows; one tab rule sums the totals

debtRows + debtTabAmount are the single source of the debt page's three
tabs; splitDebt's totals are sums of the same rows, so a tab's total
always equals the sum of its rows. New studying.currentMonthCount and
notStudying.currentMonth. The not-studying set is read per student; the
charges read covers every debtor. Existing figures do not change.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The promise rule — at most 7 days ahead, once a month, checked before anything is written

**Files:**
- Create: `server/src/payment-promises/promise-rule.ts`, `server/src/payment-promises/promise-rule.spec.ts`
- Modify: `server/src/payment-promises/payment-promises.service.ts` (+spec), `payment-promises.controller.ts` (+spec), `dto/create-payment-promise.dto.ts`
- Modify: `server/src/payments/payments-write.service.ts`, `server/src/payments/payments.service.spec.ts`
- Modify: `server/src/call-logs/call-logs.service.ts` (+spec)

**Interfaces:**
- Produces (`promise-rule.ts`): `PROMISE_MAX_DAYS = 7`, `PROMISE_DATE_REFUSAL`, `PROMISE_MONTH_REFUSAL`, `DayRange { from; to }`, `promiseDateRange(now, monthPromise, mode): DayRange | { refusal }`, `promiseRefusal(now, monthPromise, mode, promiseDate): string | null`, `PromiseMonthState { monthPromise | null; create: DayRange | null; edit: DayRange | null }`.
- Produces (`PaymentPromisesService`): `assertPromiseAllowed({ studentId, companyId, promiseDate, mode: 'create' | 'upsert' }): Promise<void>` (400 with the refusal); `monthState(studentId, companyId, branchIds): Promise<PromiseMonthState>`.
- Produces (HTTP): `GET /payment-promises/month?studentId=`; `POST /payment-promises` takes optional `promisedAmount`.
- Produces: `OUTCOME_LABEL` exported from `call-logs/call-logs.service.ts` (Task 5 reads it).

- [ ] **Step 1: The rule — failing spec**

Create `server/src/payment-promises/promise-rule.spec.ts`:

```ts
import { PROMISE_DATE_REFUSAL, PROMISE_MONTH_REFUSAL, promiseDateRange, promiseRefusal } from './promise-rule';

const NOW = new Date('2026-10-14T07:00:00Z'); // 14.10.2026 12:00 Tashkent

describe('promise rule (ADR-0072)', () => {
  it('a new promise (nothing this month) may name today … today + 7, nothing else', () => {
    expect(promiseDateRange(NOW, null, 'create')).toEqual({ from: '2026-10-14', to: '2026-10-21' });
    expect(promiseRefusal(NOW, null, 'create', '2026-10-14')).toBeNull();
    expect(promiseRefusal(NOW, null, 'create', '2026-10-21')).toBeNull();
    expect(promiseRefusal(NOW, null, 'create', '2026-10-22')).toBe(PROMISE_DATE_REFUSAL);
    expect(promiseRefusal(NOW, null, 'create', '2026-10-13')).toBe(PROMISE_DATE_REFUSAL);
  });

  it('a second promise in the month is refused, whatever happened to the first', () => {
    for (const status of ['KEPT', 'BROKEN', 'CANCELLED', 'OPEN']) {
      const p = { status, createdAt: new Date('2026-10-02T06:00:00Z') };
      expect(promiseRefusal(NOW, p, 'create', '2026-10-15')).toBe(PROMISE_MONTH_REFUSAL);
    }
  });

  it("moving this month's OPEN promise stays within 7 days of its creation day", () => {
    const p = { status: 'OPEN', createdAt: new Date('2026-10-10T06:00:00Z') };
    expect(promiseDateRange(NOW, p, 'upsert')).toEqual({ from: '2026-10-14', to: '2026-10-17' });
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-17')).toBeNull();
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-18')).toBe(PROMISE_DATE_REFUSAL);
  });

  it('a month whose promise is no longer OPEN takes no other, even by upsert', () => {
    const p = { status: 'BROKEN', createdAt: new Date('2026-10-10T06:00:00Z') };
    expect(promiseRefusal(NOW, p, 'upsert', '2026-10-15')).toBe(PROMISE_MONTH_REFUSAL);
  });

  describe('Tashkent days, 00:00–05:00 included', () => {
    const EARLY = new Date('2026-10-31T20:30:00Z'); // 01.11 01:30 in Tashkent; UTC still says 31.10

    it('today is the Tashkent day: 31.10 is already yesterday', () => {
      expect(promiseDateRange(EARLY, null, 'create')).toEqual({ from: '2026-11-01', to: '2026-11-08' });
      expect(promiseRefusal(EARLY, null, 'create', '2026-10-31')).toBe(PROMISE_DATE_REFUSAL);
    });

    it("an end-of-day instant (the call dialog's 23:59 Tashkent) is read as its Tashkent day", () => {
      expect(promiseRefusal(EARLY, null, 'create', '2026-11-08T18:59:59.000Z')).toBeNull();
      expect(promiseRefusal(EARLY, null, 'create', '2026-11-08T19:00:00.000Z')).toBe(PROMISE_DATE_REFUSAL); // 09.11 00:00
    });

    it('the creation day of a promise written at 00:30 Tashkent is that Tashkent day', () => {
      const p = { status: 'OPEN', createdAt: new Date('2026-11-01T19:30:00Z') }; // 02.11 00:30
      expect(promiseDateRange(new Date('2026-11-03T07:00:00Z'), p, 'upsert')).toEqual({ from: '2026-11-03', to: '2026-11-09' });
    });
  });
});
```

Run: `cd server && npx jest src/payment-promises/promise-rule.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: The rule**

Create `server/src/payment-promises/promise-rule.ts`:

```ts
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';

/** A promise names a day at most this many Tashkent days ahead (CEO, 04.10.2026; ADR-0072). */
export const PROMISE_MAX_DAYS = 7;
export const PROMISE_DATE_REFUSAL = "Va'da sanasi bugundan boshlab ko'pi bilan 7 kun keyin bo'lishi kerak";
export const PROMISE_MONTH_REFUSAL = "Bu o'quvchiga shu oy va'da yozilgan";

/** Inclusive Tashkent days, 'YYYY-MM-DD'. */
export interface DayRange { from: string; to: string }

/** The student's latest promise created in the current Tashkent month. */
export interface MonthPromise { status: string; createdAt: Date }

/**
 * Pure. The days a promise written now may name, or why none may be written.
 * - no promise created this Tashkent month → today … today + 7;
 * - an upsert of this month's OPEN promise → today … its creation day + 7, so
 *   editing never pushes a promise past a week;
 * - anything else → one promise per student per month.
 */
export function promiseDateRange(
  now: Date,
  monthPromise: MonthPromise | null | undefined,
  mode: 'create' | 'upsert',
): DayRange | { refusal: string } {
  const today = tashkentDateStr(now);
  if (!monthPromise) return { from: today, to: addDaysToDateStr(today, PROMISE_MAX_DAYS) };
  if (mode === 'upsert' && monthPromise.status === 'OPEN') {
    return { from: today, to: addDaysToDateStr(tashkentDateStr(monthPromise.createdAt), PROMISE_MAX_DAYS) };
  }
  return { refusal: PROMISE_MONTH_REFUSAL };
}

/** Pure. Null when the promise may be written, else the refusal text. */
export function promiseRefusal(
  now: Date,
  monthPromise: MonthPromise | null | undefined,
  mode: 'create' | 'upsert',
  promiseDate: string,
): string | null {
  const range = promiseDateRange(now, monthPromise, mode);
  if ('refusal' in range) return range.refusal;
  // The day the client means: a 'YYYY-MM-DD' (UTC midnight, 05:00 Tashkent) and
  // the call dialog's end-of-day instant both land on that Tashkent day.
  const day = tashkentDateStr(new Date(promiseDate));
  return day < range.from || day > range.to ? PROMISE_DATE_REFUSAL : null;
}

/** `GET /payment-promises/month` — what the promise form and both dialogs may offer. */
export interface PromiseMonthState {
  /** The student's latest promise created this Tashkent month, any status. */
  monthPromise: { id: string; status: string; promiseDate: string; promisedAmount: number | null; createdAt: string } | null;
  /** Days a NEW promise may name now; null once the month has one. */
  create: DayRange | null;
  /** Days this month's OPEN promise may be moved to; null when there is none. */
  edit: DayRange | null;
}
```

Run the spec — Expected: PASS.

- [ ] **Step 3: The service — failing tests**

In `server/src/payment-promises/payment-promises.service.spec.ts`:

1. Add `$transaction: jest.Mock` to the `prisma` type and `$transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),` to the object; `paymentPromise.findFirst` gets `jest.fn().mockResolvedValue(null)`.
2. First lines of `beforeEach` (the existing dates `2026-06-12` / `2026-06-15` then sit inside the window), plus an `afterEach`:

```ts
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-06-10T07:00:00Z'));
```
```ts
  afterEach(() => jest.useRealTimers());
```

3. «updates the existing OPEN promise date instead of creating»: its mock becomes `{ id: 'p1', status: 'OPEN', createdAt: new Date('2026-06-08T05:00:00Z'), promiseDate: new Date('2026-06-10') }` and the call's `promiseDate` becomes `'2026-06-14'`.
4. Add at the end of the top-level `describe` (import `PROMISE_DATE_REFUSAL`, `PROMISE_MONTH_REFUSAL` from `./promise-rule`):

```ts
  describe('the promise rule (ADR-0072)', () => {
    const dto = { studentId: 10264, promiseDate: '2026-06-12', comment: 'Maoshdan keyin' };
    const open = (createdAt: string) => ({ id: 'p1', status: 'OPEN', createdAt: new Date(createdAt), promiseDate: new Date('2026-06-10') });

    it('looks the month up by createdAt over the Tashkent month', async () => {
      jest.setSystemTime(new Date('2026-10-31T20:30:00Z')); // 01.11 01:30 Tashkent
      await service.create({ ...dto, promiseDate: '2026-11-03' }, 99, 1001, null);
      expect(prisma.paymentPromise.findFirst.mock.calls[0][0]).toMatchObject({
        where: { studentId: 10264, companyId: 1001, createdAt: { gte: new Date('2026-10-31T19:00:00.000Z'), lt: new Date('2026-11-30T19:00:00.000Z') } },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('refuses a second promise in the month, and a date past +7 — writing nothing', async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce({ id: 'p0', status: 'KEPT', createdAt: new Date('2026-06-02T05:00:00Z') });
      await expect(service.create(dto, 99, 1001, null)).rejects.toThrow(PROMISE_MONTH_REFUSAL);
      await expect(service.create({ ...dto, promiseDate: '2026-06-18' }, 99, 1001, null)).rejects.toThrow(PROMISE_DATE_REFUSAL);
      expect(prisma.paymentPromise.create).not.toHaveBeenCalled();
    });

    it('stores the drawer amount', async () => {
      await service.create({ ...dto, promisedAmount: 350_000 }, 99, 1001, null);
      expect(prisma.paymentPromise.create).toHaveBeenCalledWith({ data: expect.objectContaining({ promisedAmount: 350_000 }) });
    });

    it("closes an OPEN promise left from an earlier month before writing the month's first", async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'old' });
      await service.create(dto, 99, 1001, null);
      expect(prisma.paymentPromise.update).toHaveBeenCalledWith({
        where: { id: 'old' }, data: expect.objectContaining({ status: 'CANCELLED', resolvedById: 99 }),
      });
      expect(prisma.paymentPromise.create).toHaveBeenCalled();
      expect(history.recordStatusChange).toHaveBeenCalledWith(expect.objectContaining({
        newValues: expect.objectContaining({ sabab: "Yangi oy va'dasi bilan almashtirildi" }),
      }));
    });

    it("an upsert cannot push this month's promise past its creation day + 7", async () => {
      prisma.paymentPromise.findFirst.mockResolvedValueOnce(open('2026-06-08T05:00:00Z'));
      await expect(
        service.upsertOpenPromise({ studentId: 10264, promiseDate: '2026-06-16', comment: 'x' }, 99, 1001),
      ).rejects.toThrow(PROMISE_DATE_REFUSAL);
      expect(prisma.paymentPromise.update).not.toHaveBeenCalled();
    });

    it('assertPromiseAllowed is the same rule, for the payment and the call log', async () => {
      const check = (promiseDate: string) => service.assertPromiseAllowed({ studentId: 10264, companyId: 1001, promiseDate, mode: 'upsert' });
      await expect(check('2026-06-30')).rejects.toThrow(PROMISE_DATE_REFUSAL);
      await expect(check('2026-06-12')).resolves.toBeUndefined();
    });

    it("monthState: the month's promise, the create range and the edit range; confined like every read", async () => {
      expect(await service.monthState(10264, 1001, null)).toEqual({ monthPromise: null, create: { from: '2026-06-10', to: '2026-06-17' }, edit: null });
      prisma.paymentPromise.findFirst.mockResolvedValueOnce({
        id: 'p1', status: 'OPEN', promiseDate: new Date('2026-06-12T18:00:00.000Z'), promisedAmount: null, createdAt: new Date('2026-06-08T05:00:00.000Z'),
      });
      expect(await service.monthState(10264, 1001, null)).toEqual({
        monthPromise: { id: 'p1', status: 'OPEN', promiseDate: '2026-06-12T18:00:00.000Z', promisedAmount: null, createdAt: '2026-06-08T05:00:00.000Z' },
        create: null,
        edit: { from: '2026-06-10', to: '2026-06-15' },
      });
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(service.monthState(10264, 1001, [2])).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

Run: `cd server && npx jest src/payment-promises/payment-promises.service.spec.ts` — Expected: FAIL.

- [ ] **Step 4: The service**

In `dto/create-payment-promise.dto.ts`: import `IsOptional, Min` too, and add after `comment`:

```ts
  // ADR-0072: the drawer's «Summa». Optional — the call and payment dialogs send none.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  promisedAmount?: number;
```

In `payment-promises.service.ts`, add imports `import { tashkentMonthKey, tashkentMonthRangeUtc } from '../common/date/tashkent';` and `import { promiseDateRange, promiseRefusal, type PromiseMonthState } from './promise-rule';`. Replace `create` and `upsertOpenPromise` (keep `assertStudentInScope`, `cancel`, `findByStudent`, `resolveStudentBranch`) with:

```ts
  /** The student's latest promise created in the current Tashkent month, any status. */
  private monthPromise(studentId: number, companyId: number, now: Date) {
    return this.prisma.paymentPromise.findFirst({
      where: { studentId, companyId, createdAt: tashkentMonthRangeUtc(tashkentMonthKey(now)) },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, promiseDate: true, promisedAmount: true, createdAt: true },
    });
  }

  /**
   * The promise rule (ADR-0072) as a check. The payment and the call log call
   * it BEFORE their own writes, so a bad promise is a 400 with nothing saved —
   * a payment never stands half-done because of its promise.
   */
  async assertPromiseAllowed(p: { studentId: number; companyId: number; promiseDate: string; mode: 'create' | 'upsert' }): Promise<void> {
    const now = new Date();
    const refusal = promiseRefusal(now, await this.monthPromise(p.studentId, p.companyId, now), p.mode, p.promiseDate);
    if (refusal) throw new BadRequestException(refusal);
  }

  /** `GET /payment-promises/month`: what the drawer form and the dialogs may offer. */
  async monthState(studentId: number, companyId: number, branchIds: ReportBranchIds): Promise<PromiseMonthState> {
    await this.assertStudentInScope(studentId, companyId, branchIds);
    const now = new Date();
    const p = await this.monthPromise(studentId, companyId, now);
    const create = promiseDateRange(now, p, 'create');
    const edit = p?.status === 'OPEN' ? promiseDateRange(now, p, 'upsert') : null;
    return {
      monthPromise: p
        ? { id: p.id, status: p.status, promiseDate: p.promiseDate.toISOString(), promisedAmount: p.promisedAmount, createdAt: p.createdAt.toISOString() }
        : null,
      create: 'refusal' in create ? null : create,
      edit: edit && !('refusal' in edit) ? edit : null,
    };
  }

  /**
   * Record a debtor's commitment to pay by a date — at most 7 days ahead and
   * once per Tashkent month (ADR-0072). It resolves to KEPT when a payment
   * restores the balance, or to BROKEN by the daily cron.
   */
  async create(dto: CreatePaymentPromiseDto, userId: number, companyId: number, branchIds: ReportBranchIds) {
    await this.assertStudentInScope(dto.studentId, companyId, branchIds);
    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    const now = new Date();
    const refusal = promiseRefusal(now, await this.monthPromise(dto.studentId, companyId, now), 'create', dto.promiseDate);
    if (refusal) throw new BadRequestException(refusal);
    return this.writeNewPromise(
      { studentId: dto.studentId, promiseDate: dto.promiseDate, comment: dto.comment.trim(), promisedAmount: dto.promisedAmount ?? null, balance: student.balance },
      userId,
      companyId,
    );
  }

  /**
   * Create-or-update the month's promise (the call flow's «To'laydi» + sana,
   * and a part payment's date for the rest). This month's OPEN promise gets
   * the new date — only within 7 days of its creation day; otherwise the
   * month's first promise is written (ADR-0072).
   */
  async upsertOpenPromise(params: { studentId: number; promiseDate: string; comment: string }, userId: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id: params.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    const now = new Date();
    const month = await this.monthPromise(params.studentId, companyId, now);
    const refusal = promiseRefusal(now, month, 'upsert', params.promiseDate);
    if (refusal) throw new BadRequestException(refusal);
    const comment = params.comment.trim();
    if (month) {
      // The rule let it through, so this is the month's OPEN promise.
      const promiseDate = new Date(params.promiseDate);
      const updated = await this.prisma.paymentPromise.update({
        where: { id: month.id },
        // reminderFiredAt: null re-arms the overdue cron for the new date.
        data: { promiseDate, comment, balanceAtPromise: student.balance, reminderFiredAt: null },
      });
      await this.entityHistory.recordUpdate({
        entityType: 'Student',
        entityId: String(params.studentId),
        oldValues: { toLovSanasi: month.promiseDate.toISOString() },
        newValues: { toLovSanasi: promiseDate.toISOString() },
        changedById: userId,
        companyId,
      });
      return updated;
    }
    return this.writeNewPromise(
      { studentId: params.studentId, promiseDate: params.promiseDate, comment, promisedAmount: null, balance: student.balance },
      userId,
      companyId,
    );
  }

  /**
   * Writes the month's first promise. An OPEN promise left from an earlier
   * month is closed first (CANCELLED): one OPEN promise per student is a
   * partial unique index, and the old one is not this month's (ADR-0072).
   */
  private async writeNewPromise(
    p: { studentId: number; promiseDate: string; comment: string; promisedAmount: number | null; balance: number },
    userId: number,
    companyId: number,
  ) {
    const branchId = await this.resolveStudentBranch(p.studentId, companyId);
    try {
      const { promise, superseded } = await this.prisma.$transaction(async (tx) => {
        const old = await tx.paymentPromise.findFirst({ where: { studentId: p.studentId, companyId, status: 'OPEN' }, select: { id: true } });
        if (old) {
          await tx.paymentPromise.update({ where: { id: old.id }, data: { status: 'CANCELLED', resolvedAt: new Date(), resolvedById: userId } });
        }
        const promise = await tx.paymentPromise.create({
          data: {
            studentId: p.studentId, promiseDate: new Date(p.promiseDate), comment: p.comment, promisedAmount: p.promisedAmount,
            status: 'OPEN', balanceAtPromise: p.balance, createdById: userId, branchId, companyId,
          },
        });
        return { promise, superseded: Boolean(old) };
      });
      if (superseded) {
        await this.entityHistory.recordStatusChange({
          entityType: 'Student',
          entityId: String(p.studentId),
          oldValues: { vada: 'OCHIQ' },
          newValues: { vada: 'BEKOR_QILINDI', action: "TO'LOV_VA'DASI_BEKOR_QILINDI", sabab: "Yangi oy va'dasi bilan almashtirildi" },
          changedById: userId,
          companyId,
        });
      }
      await this.entityHistory.recordCreate({
        entityType: 'Student',
        entityId: String(p.studentId),
        newValues: {
          action: "TO'LOV_VA'DASI_BERILDI", sana: p.promiseDate, izoh: p.comment,
          ...(p.promisedAmount != null && { summa: p.promisedAmount }),
        },
        changedById: userId,
        companyId,
      });
      return promise;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException("Bu o'quvchida belgilangan to'lov sanasi allaqachon mavjud");
      }
      throw err;
    }
  }
```

Run the service spec — Expected: PASS.

- [ ] **Step 5: The month-state route**

In `payment-promises.controller.ts`, add before `@Get()`:

```ts
  /** This month's promise and the days a promise may name (ADR-0072). */
  @Get('month')
  monthState(
    @Query('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.promises.monthState(studentId, companyId, scope);
  }
```

In its spec, add `monthState: jest.fn().mockResolvedValue({}),` to `mockService` and:

```ts
  it('GET /payment-promises/month keeps the class roles and passes the resolved scope', async () => {
    expect(reflector.get(ROLES_KEY, controller.monthState)).toBeUndefined();
    await controller.monthState(10264, 1001, [4]);
    expect(mockService.monthState).toHaveBeenCalledWith(10264, 1001, [4]);
  });
```

- [ ] **Step 6: The payment and the call log check the rule before they write**

`server/src/payments/payments.service.spec.ts`: type `paymentPromises` as `{ upsertOpenPromise: jest.Mock; assertPromiseAllowed: jest.Mock }`, create it with `assertPromiseAllowed: jest.fn().mockResolvedValue(undefined)` added, and add to `describe('create()')` (import `BadRequestException` if missing):

```ts
    it('refuses a bad promise before anything is written (ADR-0072)', async () => {
      paymentPromises.assertPromiseAllowed.mockRejectedValueOnce(new BadRequestException("Va'da sanasi"));
      await expect(service.create({ ...dto, promiseDate: '2026-12-31' }, userId, companyId)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
      expect(transactionsService.recordPayment).not.toHaveBeenCalled();
    });

    it('checks the promise with the upsert rule, and nothing without one', async () => {
      await service.create({ ...dto, promiseDate: '2026-10-07' }, userId, companyId);
      expect(paymentPromises.assertPromiseAllowed).toHaveBeenCalledWith({ studentId: dto.studentId, companyId, promiseDate: '2026-10-07', mode: 'upsert' });
      paymentPromises.assertPromiseAllowed.mockClear();
      await service.create(dto, userId, companyId);
      expect(paymentPromises.assertPromiseAllowed).not.toHaveBeenCalled();
    });
```

`server/src/payments/payments-write.service.ts`, in `create`, right before `const { payment, studentBalance, carriedOver } = await this.prisma`:

```ts
    // ADR-0072: a promise that breaks the rule is refused before anything is
    // written — the payment must never stand half-done because of its promise.
    if (dto.promiseDate) {
      await this.paymentPromises.assertPromiseAllowed({ studentId: dto.studentId, companyId, promiseDate: dto.promiseDate, mode: 'upsert' });
    }
```

`server/src/call-logs/call-logs.service.spec.ts`: type `promises` as `{ upsertOpenPromise: jest.Mock; assertPromiseAllowed: jest.Mock }`, add `assertPromiseAllowed: jest.fn().mockResolvedValue(undefined)`, and in `describe('create')` (import `BadRequestException`):

```ts
    it('refuses a bad promise before the call log is written (ADR-0072)', async () => {
      promises.assertPromiseAllowed.mockRejectedValueOnce(new BadRequestException('x'));
      await expect(service.create(
        { studentId: 10264, reason: 'DEBT', outcome: 'WILL_PAY', promiseDate: '2026-06-30T18:59:59.000Z' }, 99, 1001,
      )).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.callLog.create).not.toHaveBeenCalled();
      expect(promises.upsertOpenPromise).not.toHaveBeenCalled();
    });
```

`server/src/call-logs/call-logs.service.ts`: `const OUTCOME_LABEL` becomes `export const OUTCOME_LABEL`; right before `const log = await this.prisma.callLog.create({` insert:

```ts
    // ADR-0072: the promise is checked before the call is saved.
    if (dto.outcome === 'WILL_PAY' && dto.promiseDate) {
      await this.paymentPromises.assertPromiseAllowed({ studentId: dto.studentId, companyId, promiseDate: dto.promiseDate, mode: 'upsert' });
    }
```

- [ ] **Step 7: Run, type-check, format, lint, commit**

```bash
cd server && npx jest src/payment-promises src/payments/payments.service.spec.ts src/call-logs src/common/auth/branch-route-policy.spec.ts
cd server && npm run typecheck
cd server && npx prettier --write src/payment-promises src/payments/payments-write.service.ts src/payments/payments.service.spec.ts src/call-logs/call-logs.service.ts src/call-logs/call-logs.service.spec.ts
cd server && npx eslint src/payment-promises src/payments/payments-write.service.ts src/call-logs/call-logs.service.ts
git add server/src/payment-promises server/src/payments/payments-write.service.ts server/src/payments/payments.service.spec.ts server/src/call-logs/call-logs.service.ts server/src/call-logs/call-logs.service.spec.ts
git commit -m "feat(promises): at most 7 days ahead, once a month, checked before any write

One pure rule (promise-rule.ts) for create, upsert and the new
GET /payment-promises/month. The payment and the call log check it
before they write, so a bad promise is a 400 with nothing saved. The
month's first promise closes an OPEN one left from an earlier month.
The drawer form stores promisedAmount.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS everywhere (the new route takes `@BranchScope()`, so the manifest needs no entry).

---

### Task 3: The debt list's pure math — rows, filters, sort, cells, drawer months

**Files:**
- Create: `server/src/payments/debt/debt-list.math.ts`, `server/src/payments/debt/debt-list.math.spec.ts`

**Interfaces:**
- Consumes: `DebtRow`, `DebtSplit`, `DebtKindKey`, `DebtTab`, `debtTabAmount` (Task 1); `StatementModel` (`statements/statement.types.ts`).
- Produces: types `PromiseFilter = 'open'|'broken'|'none'`, `DebtSort = 'debt'|'oldest'|'broken'|'name'`, `DebtGroup`, `PromiseCell`, `EnrollmentFact`, `DebtListRow`, `DebtListItem`, `DrawerMonth`, `DebtListResponse`, `DebtDrawer`; functions `groupsOf`, `promiseCell`, `toListRow`, `matchesSearch`, `filterDebtRows`, `sortDebtRows`, `filterOptions`, `tabTotals`, `drawerMonths`.

- [ ] **Step 1: Failing spec**

Create `server/src/payments/debt/debt-list.math.spec.ts`:

```ts
import type { DebtRow } from '../../reports/debt-split';
import {
  drawerMonths, filterDebtRows, filterOptions, groupsOf, promiseCell, sortDebtRows, toListRow,
  type DebtListRow, type EnrollmentFact,
} from './debt-list.math';

const group = (id: string, teacherId: number, over: Partial<EnrollmentFact['group']> = {}) => ({
  id, name: `G-${id}`, deletedAt: null, statusEnum: 'ACTIVE',
  teachers: [{ teacher: { id: teacherId, firstName: 'U', lastName: String(teacherId) } }], ...over,
});
const row = (over: Partial<DebtListRow>): DebtListRow => ({
  studentId: 10001, firstName: 'Ali', lastName: 'Valiyev', phone: '901112233', amount: 100_000, otherPart: 0,
  debt: 100_000, kind: null, groups: [], promise: null, months: [], oldestMonth: null, ...over,
});

describe('promiseCell', () => {
  const p = (status: string, iso: string, promisedAmount: number | null = null) => ({ status, promiseDate: new Date(iso), promisedAmount });
  it('OPEN with a day ahead is open; BROKEN is broken; anything else is no promise', () => {
    expect(promiseCell(p('OPEN', '2026-10-16T18:00:00Z', 5), '2026-10-14')).toEqual({ state: 'open', promiseDate: '2026-10-16', promisedAmount: 5 });
    expect(promiseCell(p('OPEN', '2026-10-13T10:00:00Z'), '2026-10-14')).toBeNull();
    expect(promiseCell(p('BROKEN', '2026-10-09T18:59:59Z'), '2026-10-14')).toEqual({ state: 'broken', promiseDate: '2026-10-09', promisedAmount: null });
    expect(promiseCell(p('KEPT', '2026-10-16T18:00:00Z'), '2026-10-14')).toBeNull();
    expect(promiseCell(null, '2026-10-14')).toBeNull();
  });
});

describe('groupsOf', () => {
  const facts: EnrollmentFact[] = [
    { status: 'ACTIVE', group: group('g2', 2) },
    { status: 'DROPPED', group: group('g1', 1) },
    { status: 'ACTIVE', group: group('g3', 3, { statusEnum: 'COMPLETED' }) },
  ];
  it('studying: live ACTIVE enrollments in live ACTIVE groups, with their teachers', () => {
    expect(groupsOf(null, facts)).toEqual([{ id: 'g2', name: 'G-g2', teachers: [{ id: 2, name: 'U 2' }] }]);
  });
  it('not studying: the latest enrollment, whatever its status; none without one', () => {
    expect(groupsOf('left', facts).map((g) => g.id)).toEqual(['g2']);
    expect(groupsOf('ungrouped', [])).toEqual([]);
  });
});

describe('toListRow', () => {
  const debt: DebtRow = { studentId: 10001, debt: 500_000, currentMonth: 450_000, older: 50_000, kind: null };
  const facts = {
    student: { firstName: 'Ali', lastName: 'Valiyev', phone: null }, groups: [], promise: null,
    ageMonths: { '2026-10': 450_000, '2026-08': 20_000, '2026-09': 30_000 }, currentMonth: '2026-10',
  };
  it("takes the tab's part and names the other studying part for the pill", () => {
    expect(toListRow(debt, 'shu-oy', facts)).toMatchObject({ amount: 450_000, otherPart: 50_000, debt: 500_000 });
    expect(toListRow(debt, 'eski', facts)).toMatchObject({ amount: 50_000, otherPart: 450_000 });
    expect(toListRow({ ...debt, kind: 'frozen' }, 'chiqqan', facts)).toMatchObject({ amount: 500_000, otherPart: 0 });
  });
  it('Eski qarz shows only the months before the current one; the oldest month is kept for the sort', () => {
    const r = toListRow(debt, 'eski', facts);
    expect(r.months).toEqual([{ monthKey: '2026-08', amount: 20_000 }, { monthKey: '2026-09', amount: 30_000 }]);
    expect(r.oldestMonth).toBe('2026-08');
    expect(toListRow(debt, 'shu-oy', { ...facts, ageMonths: null })).toMatchObject({ months: [], oldestMonth: null });
  });
});

describe('filterDebtRows', () => {
  const rows = [
    row({ studentId: 10001, groups: [{ id: 'g1', name: 'A', teachers: [{ id: 1, name: 'T1' }] }] }),
    row({
      studentId: 10002, firstName: 'Vali', lastName: 'Aliyev', phone: '907778899', kind: 'frozen',
      promise: { state: 'broken', promiseDate: '2026-10-09', promisedAmount: null },
      groups: [{ id: 'g2', name: 'B', teachers: [{ id: 2, name: 'T2' }] }],
    }),
  ];
  const ids = (f: Parameters<typeof filterDebtRows>[1]) => filterDebtRows(rows, f).map((r) => r.studentId);
  it('search is a name, the phone or the exact id — the student list rule', () => {
    expect(ids({ search: 'VALI' })).toEqual([10001, 10002]);
    expect(ids({ search: '77788' })).toEqual([10002]);
    expect(ids({ search: '10001' })).toEqual([10001]);
    expect(ids({ search: '1000' })).toEqual([]);
  });
  it('kind, groups, teachers and the promise state', () => {
    expect(ids({ kind: 'frozen' })).toEqual([10002]);
    expect(ids({ groupIds: ['g1'] })).toEqual([10001]);
    expect(ids({ teacherIds: [2] })).toEqual([10002]);
    expect(ids({ promise: 'broken' })).toEqual([10002]);
    expect(ids({ promise: 'none' })).toEqual([10001]);
    expect(ids({ promise: 'open' })).toEqual([]);
  });
});

describe('sortDebtRows', () => {
  const a = row({ studentId: 1, firstName: 'Zarina', amount: 300, oldestMonth: '2026-09' });
  const b = row({ studentId: 2, firstName: 'Anvar', amount: 900, oldestMonth: null, promise: { state: 'broken', promiseDate: '2026-10-01', promisedAmount: null } });
  const c = row({ studentId: 3, firstName: 'Bobur', amount: 500, oldestMonth: '2026-07' });
  const order = (s: Parameters<typeof sortDebtRows>[1]) => sortDebtRows([a, b, c], s).map((r) => r.studentId);
  it('largest debt first; oldest month first (undated last); broken first; by name', () => {
    expect(order('debt')).toEqual([2, 3, 1]);
    expect(order('oldest')).toEqual([3, 1, 2]);
    expect(order('broken')).toEqual([2, 3, 1]);
    expect(order('name')).toEqual([2, 3, 1]);
  });
});

describe('filterOptions', () => {
  it("lists the tab's own groups and teachers once each, by name", () => {
    const g = (id: string, t: number) => ({ id, name: id.toUpperCase(), teachers: [{ id: t, name: `T${t}` }] });
    expect(filterOptions([row({ groups: [g('b', 2)] }), row({ groups: [g('a', 1), g('b', 2)] })])).toEqual({
      groups: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      teachers: [{ id: 1, name: 'T1' }, { id: 2, name: 'T2' }],
    });
  });
});

describe('drawerMonths', () => {
  it("reads the statement's own allocation: charged, paid by payments, left — oldest first", () => {
    const model = {
      asOf: '2026-10-14',
      months: [{ key: '2026-09', cost: 450_000 }, { key: '2026-10', cost: 450_000 }],
      allocations: [
        { kind: 'payment', to: [{ due: { kind: 'month', month: '2026-09' }, amount: 300_000 }] },
        { kind: 'credit', to: [{ due: { kind: 'month', month: '2026-09' }, amount: 100_000 }] },
      ],
      headline: {
        kind: 'debt', amount: 530_000,
        unpaid: [
          { due: { kind: 'item', itemKind: 'mockExamFee', day: '2026-08-20' }, amount: 30_000 },
          { due: { kind: 'month', month: '2026-10' }, amount: 450_000 },
          { due: { kind: 'month', month: '2026-09' }, amount: 50_000 },
        ],
      },
    };
    expect(drawerMonths(model as never)).toEqual([
      { month: '2026-08', charged: null, paid: null, left: 30_000 },
      { month: '2026-09', charged: 450_000, paid: 300_000, left: 50_000 },
      { month: '2026-10', charged: 450_000, paid: 0, left: 450_000 },
    ]);
  });
  it('a student who owes nothing has no months', () => {
    expect(drawerMonths({ asOf: '2026-10-14', months: [], allocations: [], headline: { kind: 'credit', amount: 5, unpaid: [] } } as never)).toEqual([]);
  });
});
```

Run: `cd server && npx jest src/payments/debt/debt-list.math.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: The math**

Create `server/src/payments/debt/debt-list.math.ts`:

```ts
import type { CallOutcome, PaymentMethod } from '@prisma/client';
import { tashkentDateStr } from '../../common/date/tashkent';
import { debtTabAmount, type DebtKindKey, type DebtRow, type DebtSplit, type DebtTab } from '../../reports/debt-split';
import type { StatementModel } from '../../statements/statement.types';

export type PromiseFilter = 'open' | 'broken' | 'none';
export type DebtSort = 'debt' | 'oldest' | 'broken' | 'name';

export interface DebtGroup { id: string; name: string; teachers: { id: number; name: string }[] }
/** The «Va'da» cell; `promiseDate` is the Tashkent day. */
export interface PromiseCell { state: 'open' | 'broken'; promiseDate: string; promisedAmount: number | null }

/** One enrollment as the list reads it (newest first). */
export interface EnrollmentFact {
  status: string;
  group: {
    id: string; name: string; deletedAt: Date | null; statusEnum: string;
    teachers: { teacher: { id: number; firstName: string; lastName: string } }[];
  };
}

/** What the list knows of a row before paging (filters and sort read only this). */
export interface DebtListRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** This tab's part (`debtTabAmount`). */
  amount: number;
  /** The other studying part, for «+ eski qarz» / «+ shu oy»; 0 in O'qimayotganlar. */
  otherPart: number;
  debt: number;
  kind: DebtKindKey | null;
  /** Studying: live active groups. Not studying: the latest enrollment's group, or none. */
  groups: DebtGroup[];
  promise: PromiseCell | null;
  /** Unpaid debt by origin month (`DebtAgeService`); in Eski qarz only months before the current one. */
  months: { monthKey: string; amount: number }[];
  /** Oldest origin month of the whole debt, for «Eng uzoq qarzdor»; null while undated. */
  oldestMonth: string | null;
}

/** A shown row: plus the facts read for the page (or the Excel) only. */
export interface DebtListItem extends DebtListRow {
  dueDate: string | null;
  lastCall: { createdAt: string; outcome: CallOutcome } | null;
  lastPayment: { createdAt: string; amount: number } | null;
}

export interface DrawerMonth { month: string; charged: number | null; paid: number | null; left: number }

export interface DebtListResponse {
  data: DebtListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Σ this tab's part over the filtered rows (every page). */
  sum: number;
  tabs: ReturnType<typeof tabTotals>;
  /** `notStudying.currentMonth` — the Shu oy tab's difference line (spec §2.2). */
  leftThisMonth: number;
  options: ReturnType<typeof filterOptions>;
  /** Write-offs still in force in the scope — «Kechirilgan qarzlar arxivi · N ta». */
  writeOffCount: number;
}

export interface DebtDrawer {
  student: { id: number; firstName: string; lastName: string; phone: string | null };
  kind: DebtKindKey | null;
  groups: DebtGroup[];
  debt: number;
  months: DrawerMonth[];
  lastPayment: { createdAt: string; amount: number; method: PaymentMethod } | null;
  lastCall: { createdAt: string; outcome: CallOutcome; note: string | null; calledByName: string } | null;
  promise: PromiseCell | null;
}

/** Spec §2.3 «Guruh / ustoz» and «Oxirgi guruh». `enrollments` newest first. */
export function groupsOf(kind: DebtKindKey | null, enrollments: readonly EnrollmentFact[]): DebtGroup[] {
  // `ACTIVE_ENROLLMENT_WHERE` on a loaded row.
  const live = (e: EnrollmentFact) => e.status === 'ACTIVE' && e.group.deletedAt === null && e.group.statusEnum === 'ACTIVE';
  const picked = kind === null ? enrollments.filter(live) : enrollments.slice(0, 1);
  return picked.map(({ group: g }) => ({
    id: g.id,
    name: g.name,
    teachers: g.teachers.map(({ teacher: t }) => ({ id: t.id, name: `${t.firstName} ${t.lastName}`.trim() })),
  }));
}

/**
 * Spec §2.3 «Va'da», from the student's latest promise of any month: OPEN with
 * a day ahead → open; BROKEN → broken (every row owes, so the cron's
 * «overdue» meaning holds); otherwise none.
 */
export function promiseCell(
  p: { status: string; promiseDate: Date; promisedAmount: number | null } | null,
  today: string,
): PromiseCell | null {
  if (!p) return null;
  const day = tashkentDateStr(p.promiseDate);
  if (p.status === 'BROKEN') return { state: 'broken', promiseDate: day, promisedAmount: p.promisedAmount };
  if (p.status === 'OPEN' && day >= today) return { state: 'open', promiseDate: day, promisedAmount: p.promisedAmount };
  return null;
}

export function toListRow(
  row: DebtRow,
  tab: DebtTab,
  f: {
    student: { firstName: string; lastName: string; phone: string | null };
    groups: DebtGroup[];
    promise: PromiseCell | null;
    ageMonths: Record<string, number> | null;
    currentMonth: string;
  },
): DebtListRow {
  const all = Object.entries(f.ageMonths ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, amount]) => ({ monthKey, amount }));
  return {
    studentId: row.studentId,
    firstName: f.student.firstName,
    lastName: f.student.lastName,
    phone: f.student.phone,
    amount: debtTabAmount(row, tab),
    otherPart: tab === 'shu-oy' ? row.older : tab === 'eski' ? row.currentMonth : 0,
    debt: row.debt,
    kind: row.kind,
    groups: f.groups,
    promise: f.promise,
    months: tab === 'eski' ? all.filter((m) => m.monthKey < f.currentMonth) : all,
    oldestMonth: all[0]?.monthKey ?? null,
  };
}

/** «Ism, telefon yoki ID» — the student list's rule: a name or the phone contains it, or the exact id. */
export function matchesSearch(r: Pick<DebtListRow, 'studentId' | 'firstName' | 'lastName' | 'phone'>, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    r.firstName.toLowerCase().includes(q) ||
    r.lastName.toLowerCase().includes(q) ||
    (r.phone ?? '').includes(q) ||
    (Number.isInteger(Number(q)) && r.studentId === Number(q))
  );
}

export function filterDebtRows(
  rows: readonly DebtListRow[],
  f: { kind?: DebtKindKey; groupIds?: string[]; teacherIds?: number[]; promise?: PromiseFilter; search?: string },
): DebtListRow[] {
  return rows.filter(
    (r) =>
      (!f.kind || r.kind === f.kind) &&
      (!f.groupIds?.length || r.groups.some((g) => f.groupIds!.includes(g.id))) &&
      (!f.teacherIds?.length || r.groups.some((g) => g.teachers.some((t) => f.teacherIds!.includes(t.id)))) &&
      (!f.promise || (f.promise === 'none' ? r.promise === null : r.promise?.state === f.promise)) &&
      matchesSearch(r, f.search ?? ''),
  );
}

const byAmount = (a: DebtListRow, b: DebtListRow) => b.amount - a.amount || a.studentId - b.studentId;

export function sortDebtRows(rows: readonly DebtListRow[], sort: DebtSort = 'debt'): DebtListRow[] {
  const out = [...rows];
  if (sort === 'name') {
    return out.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`) || a.studentId - b.studentId);
  }
  if (sort === 'oldest') {
    return out.sort((a, b) => {
      // An undated debt sorts last — an unknown age is not the oldest.
      if (a.oldestMonth !== b.oldestMonth) {
        if (a.oldestMonth === null) return 1;
        if (b.oldestMonth === null) return -1;
        return a.oldestMonth < b.oldestMonth ? -1 : 1;
      }
      return byAmount(a, b);
    });
  }
  if (sort === 'broken') {
    return out.sort((a, b) => Number(b.promise?.state === 'broken') - Number(a.promise?.state === 'broken') || byAmount(a, b));
  }
  return out.sort(byAmount);
}

/** Guruh and Ustoz options: the tab's own rows, before its filters. */
export function filterOptions(rows: readonly DebtListRow[]) {
  const groups = new Map<string, string>();
  const teachers = new Map<number, string>();
  for (const r of rows) {
    for (const g of r.groups) {
      groups.set(g.id, g.name);
      for (const t of g.teachers) teachers.set(t.id, t.name);
    }
  }
  const byName = <K>(m: Map<K, string>) => [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { groups: byName(groups), teachers: byName(teachers) };
}

/** The tab buttons' totals — the split's own fields (Task 1), never re-summed here. */
export function tabTotals(split: DebtSplit) {
  return {
    'shu-oy': { total: split.studying.currentMonth, count: split.studying.currentMonthCount },
    eski: { total: split.studying.older, count: split.studying.olderCount },
    chiqqan: { total: split.notStudying.total, count: split.notStudying.count, byKind: split.notStudying.byKind },
  };
}

/**
 * The drawer's «Oylar bo'yicha», from the statement's own FIFO allocation
 * (ADR-0037) — never a second calculation. One line per month with debt left:
 * a month's lessons (charged, paid by payments, left), and in the same month
 * any other unpaid charge (a mock fee, a refund paid out) adds to `left`. A
 * month whose debt is only such charges has no `charged`/`paid`.
 */
export function drawerMonths(model: Pick<StatementModel, 'asOf' | 'months' | 'allocations' | 'headline'>): DrawerMonth[] {
  const lines = new Map<string, DrawerMonth>();
  for (const u of model.headline.unpaid) {
    const month = u.due.kind === 'month' ? u.due.month : u.due.kind === 'item' ? u.due.day.slice(0, 7) : model.asOf.slice(0, 7);
    const line = lines.get(month) ?? { month, charged: null, paid: null, left: 0 };
    line.left += u.amount;
    if (u.due.kind === 'month') {
      const key = u.due.month;
      line.charged = model.months.find((m) => m.key === key)?.cost ?? null;
      line.paid = model.allocations
        .filter((a) => a.kind === 'payment')
        .flatMap((a) => a.to)
        .reduce((s, t) => (t.due.kind === 'month' && t.due.month === key ? s + t.amount : s), 0);
    }
    lines.set(month, line);
  }
  return [...lines.values()].sort((a, b) => a.month.localeCompare(b.month));
}
```

- [ ] **Step 3: Run, type-check, format, lint, commit**

```bash
cd server && npx jest src/payments/debt/debt-list.math.spec.ts
cd server && npm run typecheck
cd server && npx prettier --write src/payments/debt && npx eslint src/payments/debt
git add server/src/payments/debt/debt-list.math.ts server/src/payments/debt/debt-list.math.spec.ts
git commit -m "feat(debt): pure math for the debt list and the drawer

Rows from the split's tab rule, groups and the last group, the promise
cell, search/filters/sort as the student list does them, filter options
from the tab's own rows, tab totals from the split, and the drawer's
months read from the statement allocation.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `GET /payments/debt/list` — one tab, enriched in batched reads, filtered, sorted and paged on the server

**Files:**
- Modify: `server/src/billing/monthly-payment-notice.service.ts` (+spec), `server/src/billing/billing.module.ts`
- Create: `server/src/payments/debt/dto/debt-list-query.dto.ts`, `debt-list.service.ts` (+spec), `debt-list.controller.ts` (+spec)
- Modify: `server/src/payments/payments.module.ts`

**Interfaces:**
- Consumes: `loadDebtRows`, `debtTabAmount` (Task 1); `debt-list.math.ts` (Task 3); `DebtAgeService.getDebtAges(companyId): Promise<Map<number, { since; months: Record<string, number> }>>`.
- Produces: `MonthlyPaymentNoticeService.dueDates(companyId, studentIds, monthKey): Promise<Map<number, string>>`; `DebtListService.list(companyId, scope, q): Promise<DebtListResponse>` with protected `tabRows(...)` / `withPageFacts(...)` and exported `ENROLLMENT_SELECT` (Task 5 reuses them); `GET /payments/debt/list?tab=&kind=&groupIds=&teacherIds=&promise=&sort=&search=&page=&pageSize=` (CEO/BD/Admin/Cashier).

- [ ] **Step 1: `dueDates` — failing test, then the method**

Add to `server/src/billing/monthly-payment-notice.service.spec.ts`, inside the top-level `describe`:

```ts
  describe("dueDates (the debt list's «To'lov muddati»)", () => {
    it("is the 2nd lesson on the first charge's live calendar, from the first covered lesson", async () => {
      candidates = [charge({ coveredDates: OCTOBER.slice(2) })]; // joined on 07.10
      expect((await service.dueDates(1001, [10042], '2026-10')).get(10042)).toBe('2026-10-09');
      expect(findMany.mock.calls[0][0].where).toMatchObject({
        companyId: 1001, studentId: { in: [10042] }, periodYear: 2026, periodMonth: 10, status: MonthlyChargeStatus.CHARGED,
      });
    });

    it('a lesson cancelled after the charge moves it (the live calendar)', async () => {
      candidates = [charge()];
      resolvePlan.mockResolvedValue({ excludedDates: ['2026-10-05'], addedDates: [] });
      expect((await service.dueDates(1001, [10042], '2026-10')).get(10042)).toBe('2026-10-07');
    });

    it('leaves out a student with fewer than two lessons, and reads nothing for nobody', async () => {
      candidates = [charge({ coveredDates: ['2026-10-30'] })];
      expect((await service.dueDates(1001, [10042], '2026-10')).size).toBe(0);
      findMany.mockClear();
      expect((await service.dueDates(1001, [], '2026-10')).size).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
```

Run: `cd server && npx jest src/billing/monthly-payment-notice.service.spec.ts -t dueDates` — Expected: FAIL.

In `monthly-payment-notice.service.ts`, add after `queuePaidThroughReminders`:

```ts
  /**
   * The month's «To'lov muddati» per student, for the debt list (ADR-0072) —
   * the bill's due date (ADR-0042): the 2nd lesson of the month on the live
   * calendar of the student's first standing charge, counted from their first
   * covered lesson of the month in any group. A student with no CHARGED charge
   * this month, or fewer than two lessons, is left out (the list prints «—»).
   */
  async dueDates(companyId: number, studentIds: number[], monthKey: string): Promise<Map<number, string>> {
    const out = new Map<number, string>();
    if (studentIds.length === 0) return out;
    const [year, month] = monthKey.split('-').map(Number);
    const charges = await this.prisma.enrollmentMonthlyCharge.findMany({
      where: { companyId, studentId: { in: studentIds }, periodYear: year, periodMonth: month, status: MonthlyChargeStatus.CHARGED },
      select: { id: true, studentId: true, groupId: true, branchId: true, createdAt: true, coveredDates: true, group: { select: { exactDays: true } } },
    });
    const byStudent = new Map<number, typeof charges>();
    for (const c of charges) byStudent.set(c.studentId, [...(byStudent.get(c.studentId) ?? []), c]);
    const plans = new Map<string, MonthPlan>();
    for (const [studentId, own] of byStudent) {
      const first = own.reduce((a, b) => (writtenBefore(b, a) ? b : a));
      try {
        const due = await this.secondLesson(plans, {
          groupId: first.groupId, branchId: first.branchId, exactDays: first.group.exactDays, year, month,
          fromDate: earliest(own.flatMap((c) => c.coveredDates)),
        });
        if (due) out.set(studentId, due);
      } catch (err) {
        this.logger.error(`Due date for student ${studentId} not resolved: ${describeError(err)}`);
      }
    }
    return out;
  }
```

In `billing.module.ts` add `MonthlyPaymentNoticeService,` to `exports`. Run the spec — Expected: PASS.

- [ ] **Step 2: The query DTO**

Create `server/src/payments/debt/dto/debt-list-query.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { toNumberArray, toStringArray } from '../../../common/dto/to-array';
import { DEBT_TABS, type DebtKindKey, type DebtTab } from '../../../reports/debt-split';
import type { DebtSort, PromiseFilter } from '../debt-list.math';

/** `GET /payments/debt/list` and `/excel` — the names the client keeps in its URL (spec §2.4). */
export class DebtListQueryDto {
  @IsOptional() @IsIn(DEBT_TABS) tab: DebtTab = 'shu-oy';

  /** O'qimayotganlar only. */
  @IsOptional() @IsIn(['ungrouped', 'frozen', 'left']) kind?: DebtKindKey;

  @IsOptional() @Transform(({ value }) => toStringArray(value)) @IsArray() @IsString({ each: true }) groupIds?: string[];

  @IsOptional() @Transform(({ value }) => toNumberArray(value)) @IsArray() @IsInt({ each: true }) teacherIds?: number[];

  @IsOptional() @IsIn(['open', 'broken', 'none']) promise?: PromiseFilter;

  @IsOptional() @IsIn(['debt', 'oldest', 'broken', 'name']) sort: DebtSort = 'debt';

  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number = 20;

  /** Read by `BranchScopeGuard` when a page names one branch; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
```

- [ ] **Step 3: The service — failing spec**

Create `server/src/payments/debt/debt-list.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtAgeService } from '../../common/finance/debt-age.service';
import { MonthlyPaymentNoticeService } from '../../billing/monthly-payment-notice.service';
import { StatementService } from '../../statements/statement.service';
import { DebtListService } from './debt-list.service';
import type { DebtListQueryDto } from './dto/debt-list-query.dto';

const teacher = (id: number, firstName: string, lastName: string) => [{ teacher: { id, firstName, lastName } }];
const G1 = { id: 'g1', name: 'A1-01', deletedAt: null, statusEnum: 'ACTIVE', teachers: teacher(20001, 'Olim', 'Karimov') };
const G2 = { ...G1, id: 'g2', name: 'B1-02', teachers: teacher(20002, 'Nodira', 'Saidova') };
// Made-up figures. 10001 owes both parts (shu oy 450 000, eski 50 000),
// 10002 this month only, 10003 is frozen and owes 200 000 of this month.
const STUDYING = [{ id: 10001, balance: -500_000 }, { id: 10002, balance: -100_000 }];
const NOT_STUDYING = [{ id: 10003, balance: -300_000, status: 'FROZEN' }];
const NAMES = [
  { id: 10001, firstName: 'Ali', lastName: 'Valiyev', phone: '901112233' },
  { id: 10002, firstName: 'Vali', lastName: 'Aliyev', phone: '907778899' },
  { id: 10003, firstName: 'Sobir', lastName: 'Karimov', phone: null },
];
const ENROLLMENTS = [
  { studentId: 10001, status: 'ACTIVE', group: G1 },
  { studentId: 10002, status: 'ACTIVE', group: G2 },
  { studentId: 10003, status: 'FROZEN', group: G1 },
];
const q = (over: Partial<DebtListQueryDto> = {}) => ({ tab: 'shu-oy', ...over }) as DebtListQueryDto;
const idsOf = (where: any): number[] => (typeof where.studentId === 'number' ? [where.studentId] : where.studentId.in);

describe('DebtListService', () => {
  let service: DebtListService;
  let prisma: any;
  let notices: { dueDates: jest.Mock };
  let statements: { build: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-10-14T07:00:00Z'));
    const emptyScope = (where: any) => where.branches?.some?.branchId?.in?.length === 0;
    prisma = {
      student: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(
          where.balance ? (emptyScope(where) ? [] : where.NOT ? NOT_STUDYING : STUDYING) : NAMES.filter((n) => where.id.in.includes(n.id)))),
        findFirst: jest.fn(),
      },
      enrollmentMonthlyCharge: {
        groupBy: jest.fn().mockResolvedValue([
          { studentId: 10001, _sum: { chargedAmount: 450_000 } },
          { studentId: 10002, _sum: { chargedAmount: 450_000 } },
          { studentId: 10003, _sum: { chargedAmount: 200_000 } },
        ]),
      },
      enrollment: { findMany: jest.fn(({ where }: any) => Promise.resolve(ENROLLMENTS.filter((e) => idsOf(where).includes(e.studentId)))) },
      paymentPromise: {
        findMany: jest.fn().mockResolvedValue([{ studentId: 10002, status: 'BROKEN', promiseDate: new Date('2026-10-09T18:59:59Z'), promisedAmount: null }]),
        findFirst: jest.fn(),
      },
      callLog: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      payment: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn() },
      transaction: { count: jest.fn().mockResolvedValue(6) },
    };
    notices = { dueDates: jest.fn().mockResolvedValue(new Map([[10001, '2026-10-06']])) };
    statements = { build: jest.fn() };
    const ages = new Map([[10001, { since: '2026-09-01T00:00:00.000Z', months: { '2026-09': 50_000, '2026-10': 450_000 } }]]);
    const module = await Test.createTestingModule({
      providers: [
        DebtListService,
        { provide: PrismaService, useValue: prisma },
        { provide: DebtAgeService, useValue: { getDebtAges: jest.fn().mockResolvedValue(ages) } },
        { provide: MonthlyPaymentNoticeService, useValue: notices },
        { provide: StatementService, useValue: statements },
      ],
    }).compile();
    service = module.get(DebtListService);
  });
  afterEach(() => jest.useRealTimers());

  describe('list', () => {
    it("a tab's total is the sum of its rows; the tab totals and the difference are the split's", async () => {
      const res = await service.list(1001, null, q());
      expect(res.data.map((r) => [r.studentId, r.amount, r.otherPart])).toEqual([[10001, 450_000, 50_000], [10002, 100_000, 0]]);
      expect(res).toMatchObject({ total: 2, page: 1, pageSize: 20, sum: 550_000, leftThisMonth: 200_000, writeOffCount: 6 });
      expect(res.tabs).toEqual({
        'shu-oy': { total: 550_000, count: 2 },
        eski: { total: 50_000, count: 1 },
        chiqqan: { total: 300_000, count: 1, byKind: { ungrouped: { total: 0, count: 0 }, frozen: { total: 300_000, count: 1 }, left: { total: 0, count: 0 } } },
      });
      expect(res.data[0]).toMatchObject({ dueDate: '2026-10-06', promise: null, groups: [{ id: 'g1', name: 'A1-01', teachers: [{ id: 20001, name: 'Olim Karimov' }] }] });
      expect(res.data[1].promise).toEqual({ state: 'broken', promiseDate: '2026-10-09', promisedAmount: null });
      expect(res.options).toEqual({
        groups: [{ id: 'g1', name: 'A1-01' }, { id: 'g2', name: 'B1-02' }],
        teachers: [{ id: 20002, name: 'Nodira Saidova' }, { id: 20001, name: 'Olim Karimov' }],
      });
    });

    it("Eski qarz and O'qimayotganlar take their own parts; due dates are read for Shu oy only", async () => {
      const eski = await service.list(1001, null, q({ tab: 'eski' }));
      expect(eski.data.map((r) => [r.studentId, r.amount, r.otherPart])).toEqual([[10001, 50_000, 450_000]]);
      expect(eski.data[0].months).toEqual([{ monthKey: '2026-09', amount: 50_000 }]);
      expect(notices.dueDates).not.toHaveBeenCalled();
      const out = await service.list(1001, null, q({ tab: 'chiqqan' }));
      expect(out.data).toEqual([expect.objectContaining({ studentId: 10003, amount: 300_000, kind: 'frozen', groups: [expect.objectContaining({ id: 'g1' })] })]);
    });

    it('filters, sorts and pages on the server; the sum covers every filtered row', async () => {
      const ids = async (over: Partial<DebtListQueryDto>) => (await service.list(1001, null, q(over))).data.map((r) => r.studentId);
      expect(await ids({ promise: 'broken' })).toEqual([10002]);
      expect(await ids({ promise: 'none' })).toEqual([10001]);
      expect(await ids({ search: 'vali' })).toEqual([10001, 10002]);
      expect(await ids({ search: '10002' })).toEqual([10002]);
      expect(await ids({ groupIds: ['g2'] })).toEqual([10002]);
      expect(await ids({ teacherIds: [20001] })).toEqual([10001]);
      expect(await ids({ sort: 'broken' })).toEqual([10002, 10001]);
      const page2 = await service.list(1001, null, q({ page: 2, pageSize: 1 }));
      expect(page2).toMatchObject({ total: 2, page: 2, pageSize: 1, sum: 550_000 });
      expect(page2.data.map((r) => r.studentId)).toEqual([10002]);
    });

    it('reads the page-only facts for the page rows only', async () => {
      await service.list(1001, null, q({ pageSize: 1 }));
      expect(notices.dueDates).toHaveBeenCalledWith(1001, [10001], '2026-10');
      expect(prisma.callLog.findMany.mock.calls[0][0].where).toEqual({ companyId: 1001, studentId: { in: [10001] } });
      expect(prisma.payment.findMany.mock.calls[0][0].where).toEqual({ companyId: 1001, studentId: { in: [10001] }, status: 'COMPLETED' });
    });

    it('the branch scope rides on the split and on the write-off count; an empty scope is nothing', async () => {
      await service.list(1001, [4], q());
      expect(prisma.student.findMany.mock.calls[0][0].where.branches).toEqual({ some: { branchId: { in: [4] } } });
      expect(prisma.transaction.count.mock.calls[0][0].where).toEqual({
        companyId: 1001, type: 'DEBT_WRITE_OFF', reversedAt: null, reversedTransactionId: null, branchId: { in: [4] },
      });
      prisma.enrollment.findMany.mockClear();
      const none = await service.list(1001, [], q());
      expect(none).toMatchObject({ data: [], total: 0, sum: 0, leftThisMonth: 0 });
      expect(none.tabs['shu-oy']).toEqual({ total: 0, count: 0 });
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
    });
  });
});
```

Run: `cd server && npx jest src/payments/debt/debt-list.service.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: The service**

Create `server/src/payments/debt/debt-list.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DebtAgeService } from '../../common/finance/debt-age.service';
import { branchIdWhere, type ReportBranchIds } from '../../common/finance/report-branch-scope';
import { tashkentDateStr, tashkentMonthKey } from '../../common/date/tashkent';
import { MonthlyPaymentNoticeService } from '../../billing/monthly-payment-notice.service';
import { debtTabAmount, loadDebtRows, type DebtTab } from '../../reports/debt-split';
import {
  filterDebtRows, filterOptions, groupsOf, promiseCell, sortDebtRows, tabTotals, toListRow,
  type DebtListItem, type DebtListResponse, type DebtListRow, type EnrollmentFact,
} from './debt-list.math';
import type { DebtListQueryDto } from './dto/debt-list-query.dto';

/** The enrollment shape `groupsOf` reads (newest first). */
export const ENROLLMENT_SELECT = {
  studentId: true,
  status: true,
  group: {
    select: {
      id: true, name: true, deletedAt: true, statusEnum: true,
      teachers: { select: { teacher: { select: { id: true, firstName: true, lastName: true } } } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

/**
 * The debt page (spec B2a, ADR-0072). Every row and every tab total comes from
 * `loadDebtRows` and its one tab rule; this service only names, filters, sorts
 * and pages the rows, in batched reads.
 */
@Injectable()
export class DebtListService {
  constructor(
    private prisma: PrismaService,
    private debtAge: DebtAgeService,
    private notices: MonthlyPaymentNoticeService,
  ) {}

  async list(companyId: number, scope: ReportBranchIds, q: DebtListQueryDto): Promise<DebtListResponse> {
    const now = new Date();
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const { rows, split, options } = await this.tabRows(companyId, scope, q, now);
    const [data, writeOffCount] = await Promise.all([
      this.withPageFacts(companyId, rows.slice((page - 1) * pageSize, page * pageSize), q.tab, now),
      this.prisma.transaction.count({
        where: { companyId, type: TransactionType.DEBT_WRITE_OFF, reversedAt: null, reversedTransactionId: null, ...branchIdWhere(scope) },
      }),
    ]);
    return {
      data, total: rows.length, page, pageSize,
      sum: rows.reduce((s, r) => s + r.amount, 0),
      tabs: tabTotals(split),
      leftThisMonth: split.notStudying.currentMonth,
      options,
      writeOffCount,
    };
  }

  /** Every row of the tab, filtered and sorted — the pages and the Excel are cut from it. */
  protected async tabRows(companyId: number, scope: ReportBranchIds, q: DebtListQueryDto, now: Date) {
    const { rows: all, split } = await loadDebtRows(this.prisma, companyId, { branchIds: scope });
    const inTab = all.filter((r) => debtTabAmount(r, q.tab) > 0);
    const ids = inTab.map((r) => r.studentId);
    if (ids.length === 0) return { rows: [] as DebtListRow[], split, options: filterOptions([]) };

    const [students, enrollments, promises, ages] = await Promise.all([
      this.prisma.student.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, phone: true } }),
      this.prisma.enrollment.findMany({ where: { studentId: { in: ids }, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: ENROLLMENT_SELECT }),
      // The latest promise of each student, any month (spec §2.3 «Va'da»).
      this.prisma.paymentPromise.findMany({
        where: { companyId, studentId: { in: ids } },
        orderBy: [{ studentId: 'asc' }, { createdAt: 'desc' }],
        distinct: ['studentId'],
        select: { studentId: true, status: true, promiseDate: true, promisedAmount: true },
      }),
      this.debtAge.getDebtAges(companyId),
    ]);
    const studentOf = new Map(students.map((s) => [s.id, s]));
    const enrolOf = new Map<number, EnrollmentFact[]>();
    for (const e of enrollments) enrolOf.set(e.studentId, [...(enrolOf.get(e.studentId) ?? []), e]);
    const promiseOf = new Map(promises.map((p) => [p.studentId, p]));
    const today = tashkentDateStr(now);
    const currentMonth = tashkentMonthKey(now);

    const rows = inTab.map((r) =>
      toListRow(r, q.tab, {
        student: studentOf.get(r.studentId) ?? { firstName: '', lastName: '', phone: null },
        groups: groupsOf(r.kind, enrolOf.get(r.studentId) ?? []),
        promise: promiseCell(promiseOf.get(r.studentId) ?? null, today),
        ageMonths: ages.get(r.studentId)?.months ?? null,
        currentMonth,
      }),
    );
    return { rows: sortDebtRows(filterDebtRows(rows, q), q.sort), split, options: filterOptions(rows) };
  }

  /** The facts only a shown row needs: due date (Shu oy), last call, last payment. */
  protected async withPageFacts(companyId: number, rows: DebtListRow[], tab: DebtTab, now: Date): Promise<DebtListItem[]> {
    const ids = rows.map((r) => r.studentId);
    if (ids.length === 0) return [];
    const latest = { orderBy: [{ studentId: 'asc' as const }, { createdAt: 'desc' as const }], distinct: ['studentId' as const] };
    const [calls, payments, dues] = await Promise.all([
      this.prisma.callLog.findMany({ where: { companyId, studentId: { in: ids } }, ...latest, select: { studentId: true, createdAt: true, outcome: true } }),
      this.prisma.payment.findMany({
        where: { companyId, studentId: { in: ids }, status: PaymentStatus.COMPLETED }, ...latest,
        select: { studentId: true, createdAt: true, amount: true },
      }),
      tab === 'shu-oy' ? this.notices.dueDates(companyId, ids, tashkentMonthKey(now)) : Promise.resolve(new Map<number, string>()),
    ]);
    const callOf = new Map(calls.map((c) => [c.studentId, c]));
    const payOf = new Map(payments.map((p) => [p.studentId, p]));
    return rows.map((r) => {
      const call = callOf.get(r.studentId);
      const pay = payOf.get(r.studentId);
      return {
        ...r,
        dueDate: dues.get(r.studentId) ?? null,
        lastCall: call ? { createdAt: call.createdAt.toISOString(), outcome: call.outcome } : null,
        lastPayment: pay ? { createdAt: pay.createdAt.toISOString(), amount: pay.amount } : null,
      };
    });
  }
}
```

(If `tsc` rejects the shared `latest` object for one of the two models, inline it in both reads.) Run the service spec — Expected: PASS (it already provides a `StatementService` mock; Task 5 injects it).

- [ ] **Step 5: The controller, its guard spec, the wiring**

Create `server/src/payments/debt/debt-list.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BranchScope, CurrentUser, Roles } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { RolesGuard } from '../../common/guards';
import { DebtListService } from './debt-list.service';
import { DebtListQueryDto } from './dto/debt-list-query.dto';

/**
 * The debt page's reads (spec B2a, ADR-0072). Open to every staff role that
 * opens the page — the 2026-08-12 open-read rule (server/CLAUDE.md «Key
 * access rules»). Scope: the header branch (`@BranchScope()`).
 */
@Controller('payments/debt')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class DebtListController {
  constructor(private readonly debts: DebtListService) {}

  @Get('list')
  list(@Query() q: DebtListQueryDto, @CurrentUser('companyId') companyId: number, @BranchScope() scope: ReportBranchIds) {
    return this.debts.list(companyId, scope, q);
  }
}
```

Create `server/src/payments/debt/debt-list.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { DebtListController } from './debt-list.controller';
import { DebtListService } from './debt-list.service';

describe('DebtListController — role guards', () => {
  let controller: DebtListController;
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);
  const debts = {
    list: jest.fn().mockResolvedValue({}),
    student: jest.fn().mockResolvedValue({}),
    excel: jest.fn().mockResolvedValue({ buffer: Buffer.from('x'), filename: 'f.xlsx' }),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({ controllers: [DebtListController], providers: [{ provide: DebtListService, useValue: debts }] }).compile();
    controller = module.get(DebtListController);
  });

  const handlers = () => [controller.list];
  const ctx = (roles: string[]) =>
    ({ getHandler: () => controller.list, getClass: () => DebtListController, switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }) }) as any;

  it('the class is CEO / BD / Administrator / Cashier and no handler narrows or widens it', () => {
    expect(reflector.get(ROLES_KEY, DebtListController)).toEqual(['CEO', 'Branch Director', 'Administrator', 'Cashier']);
    for (const h of handlers()) expect(reflector.get(ROLES_KEY, h)).toBeUndefined();
  });

  it.each(['CEO', 'Branch Director', 'Administrator', 'Cashier'])('allows %s', (role) => {
    expect(guard.canActivate(ctx([role]))).toBe(true);
  });

  it.each(['Teacher', 'Student'])('denies %s', (role) => {
    expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
  });

  it('list passes the resolved scope', async () => {
    await controller.list({ tab: 'eski' } as never, 1001, [4]);
    expect(debts.list).toHaveBeenCalledWith(1001, [4], { tab: 'eski' });
  });
});
```

In `server/src/payments/payments.module.ts`: import `DebtListController` and `DebtListService` from `./debt/…`; `controllers: [PaymentsController, DebtListController]`; add `DebtListService` to `providers`.

- [ ] **Step 6: Run, type-check, format, lint, commit**

```bash
cd server && npx jest src/payments/debt src/billing/monthly-payment-notice.service.spec.ts src/common/auth/branch-route-policy.spec.ts
cd server && npm run typecheck
cd server && npx prettier --write src/payments/debt src/payments/payments.module.ts src/billing/monthly-payment-notice.service.ts src/billing/monthly-payment-notice.service.spec.ts src/billing/billing.module.ts
cd server && npx eslint src/payments/debt src/payments/payments.module.ts src/billing/monthly-payment-notice.service.ts
git add server/src/payments/debt server/src/payments/payments.module.ts server/src/billing/monthly-payment-notice.service.ts server/src/billing/monthly-payment-notice.service.spec.ts server/src/billing/billing.module.ts
git commit -m "feat(debt): GET /payments/debt/list — one tab of the split, enriched and paged

Rows from loadDebtRows and its tab rule; names, groups and teachers (the
last group for not-studying debtors), the latest promise, debt months
from DebtAgeService, and for the page only the due date (the bill's
live-calendar rule, now MonthlyPaymentNoticeService.dueDates), last call
and last payment. Filters, sort and paging on the server; tab totals and
the difference line from the split; live write-off count.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The drawer (`GET /payments/debt/students/:id`) and the Excel (`GET /payments/debt/excel`)

**Files:**
- Create: `server/src/payments/debt/debt-list.excel.ts`
- Modify: `server/src/payments/debt/debt-list.service.ts` (+spec), `debt-list.controller.ts` (+spec), `server/src/payments/payments.module.ts`

**Interfaces:**
- Consumes: `drawerMonths`, `groupsOf`, `promiseCell`, `DebtDrawer`, `DebtListItem` (Task 3); `tabRows`, `withPageFacts`, `ENROLLMENT_SELECT` (Task 4); `StatementService.build(studentId, companyId): Promise<StatementModel>`; `OUTCOME_LABEL` (Task 2); `ceilingIsWider`, `inOtherBranch` (`common/auth/other-branch.ts`).
- Produces: `DebtListService.student(companyId, scope, ceiling, id): Promise<DebtDrawer>`, `DebtListService.excel(companyId, scope, q): Promise<{ buffer: Buffer; filename: string }>`; `debtListWorkbook(tab, rows): Promise<Buffer>`; `GET /payments/debt/students/:id`, `GET /payments/debt/excel`.

- [ ] **Step 1: Failing tests**

At the top of `debt-list.service.spec.ts` add `import { NotFoundException } from '@nestjs/common';` and `import { Workbook } from 'exceljs';`; inside `describe('DebtListService')` append:

```ts
  describe('student (the drawer)', () => {
    const MODEL = {
      asOf: '2026-10-14',
      months: [{ key: '2026-09', cost: 450_000 }, { key: '2026-10', cost: 450_000 }],
      allocations: [{ kind: 'payment', to: [{ due: { kind: 'month', month: '2026-09' }, amount: 400_000 }] }],
      headline: { kind: 'debt', amount: 500_000, unpaid: [{ due: { kind: 'month', month: '2026-10' }, amount: 450_000 }, { due: { kind: 'month', month: '2026-09' }, amount: 50_000 }] },
    };
    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue({ id: 10001, firstName: 'Ali', lastName: 'Valiyev', phone: '901112233', balance: -500_000, status: 'ACTIVE' });
      prisma.payment.findFirst.mockResolvedValue({ createdAt: new Date('2026-09-20T09:00:00Z'), amount: 400_000, method: 'CASH' });
      prisma.callLog.findFirst.mockResolvedValue(null);
      prisma.paymentPromise.findFirst.mockResolvedValue({ status: 'OPEN', promiseDate: new Date('2026-10-17T18:00:00Z'), promisedAmount: 500_000 });
      statements.build.mockResolvedValue(MODEL);
    });

    it('reads the debt, the months from the statement allocation, the last payment and the promise', async () => {
      expect(await service.student(1001, null, null, 10001)).toEqual({
        student: { id: 10001, firstName: 'Ali', lastName: 'Valiyev', phone: '901112233' },
        kind: null,
        groups: [{ id: 'g1', name: 'A1-01', teachers: [{ id: 20001, name: 'Olim Karimov' }] }],
        debt: 500_000,
        months: [{ month: '2026-09', charged: 450_000, paid: 400_000, left: 50_000 }, { month: '2026-10', charged: 450_000, paid: 0, left: 450_000 }],
        lastPayment: { createdAt: '2026-09-20T09:00:00.000Z', amount: 400_000, method: 'CASH' },
        lastCall: null,
        promise: { state: 'open', promiseDate: '2026-10-17', promisedAmount: 500_000 },
      });
      expect(statements.build).toHaveBeenCalledWith(10001, 1001);
    });

    it('a frozen student is «muzlatilgan», shown with the last group', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 10003, firstName: 'Sobir', lastName: 'Karimov', phone: null, balance: -300_000, status: 'FROZEN' });
      expect(await service.student(1001, null, null, 10003)).toMatchObject({ kind: 'frozen', groups: [expect.objectContaining({ id: 'g1' })], debt: 300_000 });
    });

    it("another branch's student is a 404 — named when the caller works there too (ADR-0063)", async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(service.student(1001, [1], [1], 10001)).rejects.toThrow("O'quvchi topilmadi");
      expect(prisma.student.findFirst.mock.calls[0][0].where).toMatchObject({ id: 10001, companyId: 1001, deletedAt: null, branches: { some: { branchId: { in: [1] } } } });
      prisma.student.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ branches: [{ branch: { id: 2, name: 'Ikkinchi filial' } }] });
      const err = await service.student(1001, [1], [1, 2], 10001).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({ branch: { id: 2, name: 'Ikkinchi filial' } });
      expect(statements.build).not.toHaveBeenCalled();
    });
  });

  describe('excel', () => {
    it('writes the same rows as the list, every page, plus a «Jami» row', async () => {
      const list = await service.list(1001, null, q({ pageSize: 100 }));
      const { buffer, filename } = await service.excel(1001, null, q({ pageSize: 1 }));
      expect(filename).toBe('qarzdorlik-shu-oy-2026-10-14.xlsx');
      const wb = new Workbook();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      expect(ws.name).toBe('Shu oy');
      expect(ws.getRow(1).getCell(7).value).toBe('Qarz');
      const ids: unknown[] = [];
      for (let r = 2; r < ws.rowCount; r++) ids.push(ws.getRow(r).getCell(2).value);
      expect(ids).toEqual(list.data.map((d) => d.studentId));
      expect(ws.getRow(ws.rowCount).getCell(1).value).toBe('Jami');
      expect(ws.getRow(ws.rowCount).getCell(7).value).toBe(550_000);
    });
  });
```

In `debt-list.controller.spec.ts`, `handlers` becomes `() => [controller.list, controller.student, controller.excel]`; add:

```ts
  it('the drawer gets the scope and the ceiling', async () => {
    await controller.student(10001, 1001, [4], [4, 5]);
    expect(debts.student).toHaveBeenCalledWith(1001, [4], [4, 5], 10001);
  });

  it('the Excel is an xlsx attachment named by the service', async () => {
    const res = { setHeader: jest.fn(), end: jest.fn() };
    await controller.excel({ tab: 'eski' } as never, 1001, null, res as never);
    expect(debts.excel).toHaveBeenCalledWith(1001, null, { tab: 'eski' });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="f.xlsx"');
    expect(res.end).toHaveBeenCalledWith(Buffer.from('x'));
  });
```

Run: `cd server && npx jest src/payments/debt` — Expected: FAIL (`student`, `excel` missing).

- [ ] **Step 2: The workbook**

Create `server/src/payments/debt/debt-list.excel.ts`:

```ts
import { Workbook } from 'exceljs';
import { OUTCOME_LABEL } from '../../call-logs/call-logs.service';
import { tashkentDateStr } from '../../common/date/tashkent';
import type { DebtTab } from '../../reports/debt-split';
import { dm, monthTitle } from '../../statements/statement-text';
import type { DebtListItem } from './debt-list.math';

type Cell = string | number;
/** `isAmount`: the tab's amount, summed by the «Jami» row. */
interface Column { header: string; width: number; value: (r: DebtListItem) => Cell; isAmount?: boolean }

const KIND_LABEL = { ungrouped: 'guruhsiz', frozen: 'muzlatilgan', left: 'ketgan' } as const;
const SHEET_NAME: Record<DebtTab, string> = { 'shu-oy': 'Shu oy', eski: 'Eski qarz', chiqqan: "O'qimayotganlar" };
const day = (iso: string) => dm(tashkentDateStr(new Date(iso)));

const col = {
  id: { header: 'ID', width: 8, value: (r) => r.studentId },
  name: { header: "O'quvchi", width: 28, value: (r) => `${r.firstName} ${r.lastName}`.trim() },
  phone: { header: 'Telefon', width: 14, value: (r) => r.phone ?? '' },
  group: { header: 'Guruh', width: 18, value: (r) => r.groups.map((g) => g.name).join(', ') },
  teacher: { header: 'Ustoz', width: 22, value: (r) => [...new Set(r.groups.flatMap((g) => g.teachers.map((t) => t.name)))].join(', ') },
  promise: {
    header: "Va'da", width: 16,
    value: (r) => (!r.promise ? '' : r.promise.state === 'open' ? `${dm(r.promise.promiseDate)} gacha` : `buzildi · ${dm(r.promise.promiseDate)}`),
  },
  call: { header: 'Oxirgi aloqa', width: 26, value: (r) => (r.lastCall ? `${day(r.lastCall.createdAt)} · ${OUTCOME_LABEL[r.lastCall.outcome]}` : '') },
  months: { header: 'Qaysi oylardan', width: 30, value: (r) => r.months.map((m) => `${monthTitle(m.monthKey)}: ${m.amount}`).join('; ') },
} satisfies Record<string, Column>;
const amount = (header: string): Column => ({ header, width: 14, value: (r) => r.amount, isAmount: true });

/** The visible columns of each tab (spec §2.3), as plain values. */
const COLUMNS: Record<DebtTab, Column[]> = {
  'shu-oy': [
    col.id, col.name, col.phone, col.group, col.teacher, amount('Qarz'),
    { header: 'Eski qarz ham', width: 14, value: (r) => r.otherPart },
    { header: "To'lov muddati", width: 14, value: (r) => (r.dueDate ? dm(r.dueDate) : '') },
    col.promise, col.call,
  ],
  eski: [
    col.id, col.name, col.phone, col.group, col.teacher, amount('Eski qarz'),
    { header: 'Shu oy ham', width: 14, value: (r) => r.otherPart },
    col.months,
    { header: "Oxirgi to'lov", width: 18, value: (r) => (r.lastPayment ? `${day(r.lastPayment.createdAt)} · ${r.lastPayment.amount}` : '') },
    col.promise,
  ],
  chiqqan: [
    col.id, col.name, col.phone,
    { header: 'Holat', width: 14, value: (r) => (r.kind ? KIND_LABEL[r.kind] : '') },
    { ...col.group, header: 'Oxirgi guruh' },
    amount('Qarz'), col.months, col.call,
  ],
};

/** The open tab with its filters, every page, plus a «Jami» row (spec §2.7). */
export async function debtListWorkbook(tab: DebtTab, rows: readonly DebtListItem[]): Promise<Buffer> {
  const columns = COLUMNS[tab];
  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET_NAME[tab]);
  ws.columns = [{ header: '#', width: 6 }, ...columns.map((c) => ({ header: c.header, width: c.width }))];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, i) => ws.addRow([i + 1, ...columns.map((c) => c.value(r))]));
  const total = new Array<Cell>(columns.length + 1).fill('');
  total[0] = 'Jami';
  total[1 + columns.findIndex((c) => c.isAmount)] = rows.reduce((s, r) => s + r.amount, 0);
  ws.addRow(total).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 3: The service methods**

In `debt-list.service.ts`: the `@nestjs/common` import becomes `Injectable, NotFoundException`; add `StudentStatus` to the `@prisma/client` import and `studentBranchWhere` to the `report-branch-scope` import; add `debtKindOf` to the `debt-split` import and `drawerMonths, type DebtDrawer` to the `./debt-list.math` import; add `import { ceilingIsWider, inOtherBranch } from '../../common/auth/other-branch';`, `import { StatementService } from '../../statements/statement.service';`, `import { debtListWorkbook } from './debt-list.excel';`. Add `private statements: StatementService,` to the constructor after `notices`, and after `list`:

```ts
  /**
   * The drawer (spec §2.5). One read open to every role of the page — the
   * statement endpoints refuse Cashier. Its months are the statement model's
   * own allocation (`drawerMonths`), never a new calculation.
   */
  async student(companyId: number, scope: ReportBranchIds, ceiling: ReportBranchIds, id: number): Promise<DebtDrawer> {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(scope) },
      select: { id: true, firstName: true, lastName: true, phone: true, balance: true, status: true },
    });
    if (!student) throw await this.notFound(companyId, id, scope, ceiling);
    const latest = { orderBy: { createdAt: 'desc' as const } };
    const [enrollments, model, payment, call, promise] = await Promise.all([
      this.prisma.enrollment.findMany({ where: { studentId: id, deletedAt: null }, ...latest, select: ENROLLMENT_SELECT }),
      this.statements.build(id, companyId),
      this.prisma.payment.findFirst({ where: { companyId, studentId: id, status: PaymentStatus.COMPLETED }, ...latest, select: { createdAt: true, amount: true, method: true } }),
      this.prisma.callLog.findFirst({
        where: { companyId, studentId: id }, ...latest,
        select: { createdAt: true, outcome: true, note: true, calledBy: { select: { firstName: true, lastName: true } } },
      }),
      this.prisma.paymentPromise.findFirst({ where: { companyId, studentId: id }, ...latest, select: { status: true, promiseDate: true, promisedAmount: true } }),
    ]);
    // The split's rule on one card: studying = ACTIVE with a live active group.
    const studying = student.status === StudentStatus.ACTIVE && groupsOf(null, enrollments).length > 0;
    const kind = studying ? null : debtKindOf(student.status);
    return {
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, phone: student.phone },
      kind,
      groups: groupsOf(kind, enrollments),
      debt: Math.max(0, -student.balance),
      months: drawerMonths(model),
      lastPayment: payment ? { createdAt: payment.createdAt.toISOString(), amount: payment.amount, method: payment.method } : null,
      lastCall: call
        ? { createdAt: call.createdAt.toISOString(), outcome: call.outcome, note: call.note, calledByName: `${call.calledBy.firstName} ${call.calledBy.lastName}`.trim() }
        : null,
      promise: promiseCell(promise, tashkentDateStr(new Date())),
    };
  }

  /** The open tab with its filters, every page, as xlsx (spec §2.7). */
  async excel(companyId: number, scope: ReportBranchIds, q: DebtListQueryDto): Promise<{ buffer: Buffer; filename: string }> {
    const now = new Date();
    const { rows } = await this.tabRows(companyId, scope, q, now);
    const items = await this.withPageFacts(companyId, rows, q.tab, now);
    return { buffer: await debtListWorkbook(q.tab, items), filename: `qarzdorlik-${q.tab}-${tashkentDateStr(now)}.xlsx` };
  }

  /** ADR-0063: a student of another branch the caller works in is named, not «missing». */
  private async notFound(companyId: number, id: number, scope: ReportBranchIds, ceiling: ReportBranchIds): Promise<NotFoundException> {
    if (ceilingIsWider(scope, ceiling)) {
      const elsewhere = await this.prisma.student.findFirst({
        where: { id, companyId, deletedAt: null, ...studentBranchWhere(ceiling) },
        select: {
          branches: {
            where: ceiling === null ? {} : { branchId: { in: ceiling } },
            select: { branch: { select: { id: true, name: true } } },
            orderBy: { branchId: 'asc' },
            take: 1,
          },
        },
      });
      const branch = elsewhere?.branches[0]?.branch;
      if (branch) return inOtherBranch("o'quvchi", branch);
    }
    return new NotFoundException("O'quvchi topilmadi");
  }
```

- [ ] **Step 4: The routes and the module**

In `debt-list.controller.ts`: imports become `import { Controller, Get, Param, ParseIntPipe, Query, Res, UseGuards } from '@nestjs/common';`, `import type { Response } from 'express';` and `import { BranchCeiling, BranchScope, CurrentUser, Roles } from '../../common/decorators';`. Add after `list`:

```ts
  /** The open tab with the current filters, every page, as xlsx (spec §2.7). */
  @Get('excel')
  async excel(
    @Query() q: DebtListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.debts.excel(companyId, scope, q);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** The drawer (spec §2.5). Another branch's student is a 404 (ADR-0063). */
  @Get('students/:id')
  student(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.debts.student(companyId, scope, ceiling, id);
  }
```

In `payments.module.ts` add `StatementsModule` (from `../statements/statements.module`) to `imports`.

- [ ] **Step 5: Run, type-check, format, lint, commit**

```bash
cd server && npx jest src/payments src/common/auth/branch-route-policy.spec.ts
cd server && npm run typecheck
cd server && npx prettier --write src/payments/debt src/payments/payments.module.ts && npx eslint src/payments/debt src/payments/payments.module.ts
git add server/src/payments/debt server/src/payments/payments.module.ts
git commit -m "feat(debt): the drawer read and the Excel export

GET /payments/debt/students/:id: debt, months from the statement
allocation, last payment, latest call, latest promise; another branch's
student is a 404, named when the caller works there (ADR-0063).
GET /payments/debt/excel: the open tab with its filters, every page,
plain values and a Jami row.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ADR-0072

**Files:**
- Create: `docs/adr/0072-qarzdorlik-qatorlari-va-vada-qoidasi.md`
- Modify: `docs/adr/README.md`

**Interfaces:** none.

- [ ] **Step 1: Check the number is free**

```bash
git fetch origin main --quiet && git ls-tree --name-only origin/main docs/adr/ | grep -E '/007[2-9]'
gh pr list --state open --json number,files --jq '.[] | select(any(.files[]; .path | test("docs/adr/007"))) | .number'
```
Expected: no output. (0071 is taken by the unpushed `feat/daf-soz-zaxirasi` branch, so 0072.) If 0072 shows up, take the next free number and rename everything below.

- [ ] **Step 2: Write the ADR**

Create `docs/adr/0072-qarzdorlik-qatorlari-va-vada-qoidasi.md`:

```markdown
# ADR-0072 — Qarzdorlik sahifasi qarz bo'linishining qatorlarini ko'rsatadi; to'lov va'dasi ko'pi bilan 7 kunga, oyiga bir marta; «Markaz qoplagani» faqat CEO va filial direktoriga

**Holati:** Qabul qilindi
**Sana:** 2026-10-04
**Bog'liq:** ADR-0037, ADR-0047, ADR-0059, ADR-0063, ADR-0064, ADR-0067, `server/src/reports/debt-split.ts` (`debtRows`, `debtTabAmount`), `server/src/payments/debt/`, `server/src/payment-promises/promise-rule.ts`, `docs/superpowers/specs/2026-10-04-b2a-qarzdorlik-design.md`

## Kontekst

ADR-0059 qarzni ikki raqamga ajratdi, lekin «Qarzdorlik» sahifasining ro'yxati
(`GET /payments/debtors`) o'z ta'rifida qoldi: hamma holat, arxiv ham. Kartalar bir
narsani, ro'yxat boshqasini sanardi va ro'yxat kartalarga qo'shilmasdi. CEO 27.09
va 04.10 da maketni tasdiqladi: sahifa uch bo'lim — «Shu oy», «Eski qarz»,
«O'qimayotganlar»; har bo'lim tugmasida jami, umumiy yig'indi yo'q. 04.10 da CEO
to'lov va'dasini ham chekladi: ko'pi bilan 7 kunga va o'quvchiga oyiga bir marta.
Yakuniy shartnomada (02.10) muddatni uzaytirish bandi yo'q — bu markazning o'z qoidasi.

## Qaror

1. **Ro'yxat = bo'linishning to'plamlari.** `debt-split.ts` har qarzdor uchun qator
   beradi (`debtRows`) va bitta bo'lim qoidasini (`debtTabAmount`): «Shu oy» —
   o'qiyotgan va `currentMonth > 0`, summasi `currentMonth`; «Eski qarz» — o'qiyotgan
   va `older > 0`, summasi `older`; «O'qimayotganlar» — qolganlar, butun qarz.
   `splitDebt` jamlari shu qatorlar yig'indisi, shuning uchun bo'lim jami doim uning
   qatorlari yig'indisiga teng. Ikkala qismi bor o'quvchi ikkala o'qiyotganlar
   bo'limida turadi — bir qarzning ikki ko'rinishi. Yangi maydonlar:
   `studying.currentMonthCount`, `notStudying.currentMonth` (o'qimayotganlarning shu
   oy qismi — «Shu oy» bo'limidagi farq qatori). Bu ADR-0059 ning «o'zgarmaydigan
   yuzalar» ro'yxatidagi qarzdorlar ro'yxatini almashtiradi: sahifaning ro'yxati
   (`GET /payments/debt/list`) endi bo'linishniki. `GET /payments/debtors` eski
   ta'rifida qoladi (bosh sahifaning «eng katta qarzdorlar» bloki o'qiydi); yo'l
   joylashtirishdan keyin olib tashlanadi.
2. **Qator ma'lumotlari bitta manbadan.** To'lov muddati — `paymentDueDate`,
   guruhning jonli kalendari bo'yicha (to'lov xabaridagi sana); qarz oylari —
   `DebtAgeService`; tortmadagi oylar — to'lovlar hisobotining o'z taqsimoti
   (ADR-0037). Filtr, saralash, sahifalash serverda. Boshqa filialdagi o'quvchining
   tortmasi — 404, chaqiruvchi o'sha filialda ishlasa filial nomi bilan (ADR-0063).
3. **Va'da qoidasi.** Va'da sanasi — bugundan bugun + 7 gacha bo'lgan Toshkent kuni.
   O'quvchiga bir Toshkent oyida bitta va'da (`createdAt` bo'yicha, holatidan qat'i
   nazar). Shu oyning ochiq va'dasi sanasi faqat va'da yozilgan kundan 7 kun ichida
   o'zgaradi. Qoida bitta funksiyada (`promise-rule.ts`) va har yozuvga qo'llanadi:
   tortmadagi «Va'da yozish», qo'ng'iroq natijasi, qisman to'lov. To'lov va qo'ng'iroq
   va'dani yozishdan OLDIN tekshiradi: noto'g'ri va'da — 400, hech narsa yozilmaydi;
   to'lov hech qachon va'da sababli yarim qolmaydi. O'tgan oydan qolgan ochiq va'da
   shu oyning birinchi va'dasi yozilganda bekor qilinadi (bitta ochiq va'da — unikal
   indeks). Va'da darsga kiritmaydi (ADR-0047, ADR-0064) — o'zgarmaydi.
4. **«Markaz qoplagani» Ish haqi sahifasiga ko'chdi.**
   `GET /salary/monthly/center-topup` endi `@Roles('CEO', 'Branch Director')`: Ish haqi
   sahifasi faqat ularga ochiq. Administrator va kassir bu ro'yxatni ko'rmaydi (CEO
   04.10 da xabardor qilindi).

## Ko'rib chiqilgan muqobillar

- **Ro'yxatni eski `GET /payments/debtors` ustida qoldirish** — jami va qatorlar ikki
  manbadan kelardi, ular yana ajrab ketardi.
- **Ochiq va'dani istalgancha surish** — har kuni surib qoida aylanib o'tilardi;
  chegara shuning uchun va'da yozilgan kundan sanaladi.
- **O'tgan oyning ochiq va'dasini yangilash** — `createdAt` o'tgan oyda qolgani uchun
  har tahrir yangi 7 kun berardi.

## Oqibatlari

- Sahifadagi uch jami, Moliya bloki, bosh sahifa va Telegram bir funksiyadan keladi;
  mavjud raqamlar o'zgarmaydi.
- Ro'yxat endi arxivdagi kartalarni va «Faol / Muzlatilgan / …» holat filtrini
  ko'rsatmaydi; holatni bo'lim va «guruhsiz / muzlatilgan / ketgan» belgisi aytadi.
- Mijoz va'da oynalarida sanani bugun + 7 bilan cheklaydi va shu oy va'da bo'lsa,
  yangisini so'ramaydi (`GET /payment-promises/month`).
- Administrator va kassir uchun «Markaz qoplagani» yo'q.
```

- [ ] **Step 3: The index row, commit**

In `docs/adr/README.md` add after the 0070 row:

```markdown
| [0072](0072-qarzdorlik-qatorlari-va-vada-qoidasi.md) | Qarzdorlik sahifasi qarz bo'linishining qatorlarini ko'rsatadi; to'lov va'dasi ko'pi bilan 7 kunga, oyiga bir marta; «Markaz qoplagani» faqat CEO va filial direktoriga | Qabul qilindi | 2026-10-04 |
```

```bash
git add docs/adr/0072-qarzdorlik-qatorlari-va-vada-qoidasi.md docs/adr/README.md
git commit -m "docs(adr): ADR-0072 debt page rows, promise rule, center top-up CEO/BD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Real sub-pages, and «Markaz qoplagani» moves to Ish haqi (server CEO/BD + client tab)

**Files:**
- Modify: `server/src/salary/salary.controller.ts`, `server/src/salary/salary.controller.spec.ts`
- Create: `client/src/components/payments/debt/debt-subpage.tsx`, `client/src/components/payments/debt/debt-subpages.test.ts`, `client/src/app/(dashboard)/payments/frozen-balances/page.tsx`
- Modify (replace content): `client/src/app/(dashboard)/payments/debt-history/page.tsx`, `client/src/app/(dashboard)/payments/debt-write-offs/page.tsx`
- Modify: `client/src/components/payments/debt/center-topup-view.tsx`, `client/src/components/payments/salary-client.tsx`, `client/src/components/payments/salary-monthly-view.tsx`, `client/src/components/payments/debt/debt-page-client.tsx`, `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Produces: `DebtSubpage({ title, children })`; real routes `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/frozen-balances`; `/payments/salary?tab=markaz[&month=]`.

- [ ] **Step 1: Server — narrow the read**

In `salary.controller.spec.ts`, replace the whole `describe("«Markaz qoplagani» — /payments/debt tabi, …")` block with:

```ts
  describe('«Markaz qoplagani» — the salary page tab, CEO and Branch Director only (ADR-0072)', () => {
    it('getCenterTopUpStudents allows CEO and Branch Director only', () => {
      expect(rolesFor('getCenterTopUpStudents')).toEqual(['CEO', 'Branch Director']);
    });

    it('RolesGuard keeps an Administrator and a Cashier out', () => {
      for (const role of ['Administrator', 'Cashier']) {
        expect(() => guard.canActivate(ctx('getCenterTopUpStudents', [role]))).toThrow(ForbiddenException);
      }
    });
  });
```

Run: `cd server && npx jest src/salary/salary.controller.spec.ts` — Expected: FAIL. In `salary.controller.ts`, on `getCenterTopUpStudents` change the `@Roles(…)` to `@Roles('CEO', 'Branch Director')` and its doc comment to:

```ts
  /**
   * "Qolgan (markaz)" drill-down — markaz qaysi o'quvchilar uchun ustozlarga
   * pul to'lab bergani va o'sha pul kimdan undirilishi kerakligi. Uni Ish haqi
   * sahifasining «Markaz qoplagani» tabi o'qiydi, shuning uchun gate — sahifa
   * bilan bir xil: CEO va filial direktori (ADR-0072). Filial chegarasi
   * `resolveMonthlyScope` da.
   */
```

In the comment block above `@Get('config/:userId')`, the sentence about the two exceptions becomes `Istisno bitta: \`timeline/:userId\` (o'qituvchi profilining «Taymlayn» tabi) — admin ko'radigan sahifadan.` Re-run — Expected: PASS. Then `cd server && npx prettier --write src/salary/salary.controller.ts src/salary/salary.controller.spec.ts`.

- [ ] **Step 2: Client — failing test**

Create `client/src/components/payments/debt/debt-subpages.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { DebtSubpage } from "./debt-subpage";

const src = (file: string) => readFileSync(join(__dirname, "..", file), "utf-8");

describe("debt sub-pages (spec B2a §2.6)", () => {
  it("each has a back link to Qarzdorlik and its title", () => {
    const html = renderToStaticMarkup(createElement(DebtSubpage, { title: "Muzlatilganlarning puli" }, "x"));
    expect(html).toContain('href="/payments/debt"');
    expect(html).toContain("Qarzdorlik");
    expect(html).toContain("Muzlatilganlarning puli");
  });

  it("the breadcrumb names the three new segments", () => {
    expect(routeLabels["debt-history"]).toBe("Qarz tarixi");
    expect(routeLabels["debt-write-offs"]).toBe("Kechirilgan qarzlar");
    expect(routeLabels["frozen-balances"]).toBe("Muzlatilganlarning puli");
  });
});

describe("«Markaz qoplagani» lives on Ish haqi (ADR-0072)", () => {
  it("the salary page has the tab, and its card links there, never to the debt page", () => {
    expect(src("salary-client.tsx")).toContain('value="markaz"');
    expect(src("salary-monthly-view.tsx")).not.toContain("/payments/debt?tab=markaz");
    expect(src("salary-monthly-view.tsx")).toContain("/payments/salary?tab=markaz&month=");
  });

  it("the month lives in its own URL state, not the debt page's", () => {
    expect(src("debt/center-topup-view.tsx")).not.toContain("useDebtFilters");
  });
});
```

Run: `cd client && npx vitest run src/components/payments/debt/debt-subpages.test.ts` — Expected: FAIL.

- [ ] **Step 3: Client — the sub-pages**

Create `client/src/components/payments/debt/debt-subpage.tsx`:

```tsx
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

/** A page that used to be a tab of /payments/debt (spec B2a §2.6): the same view, its own title, the way back. */
export function DebtSubpage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <Link href="/payments/debt" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />
        Qarzdorlik
      </Link>
      <h1 className="font-heading text-lg font-semibold tracking-tight">{title}</h1>
      {children}
    </div>
  );
}
```

Replace `app/(dashboard)/payments/debt-history/page.tsx` with:

```tsx
import { Suspense } from "react";
import { DebtFiltersProvider } from "@/components/payments/debt/debt-filters-provider";
import { DebtSubpage } from "@/components/payments/debt/debt-subpage";
import { MonthlyDebtView } from "@/components/payments/debt/monthly-debt-view";

// A real page again (spec B2a §2.6). Suspense: the view keeps its status filter in the URL.
export default function DebtHistoryPage() {
  return (
    <Suspense>
      <DebtFiltersProvider>
        <DebtSubpage title="Oylar bo'yicha qarz tarixi">
          <MonthlyDebtView />
        </DebtSubpage>
      </DebtFiltersProvider>
    </Suspense>
  );
}
```

Replace `app/(dashboard)/payments/debt-write-offs/page.tsx` with a page returning `<DebtSubpage title="Kechirilgan qarzlar arxivi"><WriteOffsView /></DebtSubpage>` (imports from `@/components/payments/debt/debt-subpage` and `…/write-offs-view`; no Suspense — the view keeps no URL state). Create `app/(dashboard)/payments/frozen-balances/page.tsx` like the debt-history page, with title «Muzlatilganlarning puli», `<FrozenBalanceView />` (`@/components/payments/debt/frozen-balance-view`) and the comment `// Temporary (spec B2a §2.6): until part 2b replaces it with «Qaytariladigan pul».`

In `client/src/lib/breadcrumb-routes.ts`, replace the comment above `debt: "Qarzdorlik",` with `// /payments/debt — qarzdorlik sahifasi (uch bo'lim). Uning eski tablari endi\n  // alohida sahifalar: qarz tarixi, kechirilganlar, muzlatilganlar puli.` and add after it:

```ts
  "debt-history": "Qarz tarixi",
  "debt-write-offs": "Kechirilgan qarzlar",
  "frozen-balances": "Muzlatilganlarning puli",
```

- [ ] **Step 4: Client — the salary tab**

`components/payments/debt/center-topup-view.tsx`: replace `import { useDebtFilters } from "./debt-filters-provider";` with `import { useUrlFilters } from "@/hooks/use-url-filters";`; above the component add

```ts
/** Only the month: the tab lives on the salary page now (ADR-0072). Empty = the whole period. */
const CENTER_TOPUP_SCHEMA = { month: { type: "string", defaultValue: "" } } as const;
```

replace `const { filters, setFilters } = useDebtFilters();` with `const { filters, setFilters } = useUrlFilters(CENTER_TOPUP_SCHEMA);` and the two handlers with `onChange={(v) => setFilters({ month: v })}` / `onClear={() => setFilters({ month: "" })}`; in its doc comment replace `"Markaz qoplagani" as a tab: the same list the salary page shows in a dialog,` with `"Markaz qoplagani" — a tab of the salary page (ADR-0072),`.

`components/payments/salary-client.tsx`: `import { CenterTopUpView } from "./debt/center-topup-view";`, add `<TabsTrigger value="markaz">Markaz qoplagani</TabsTrigger>` after «Avanslar», and after the «avanslar» content `<TabsContent value="markaz"><CenterTopUpView /></TabsContent>`.

`components/payments/salary-monthly-view.tsx`: both `href={\`/payments/debt?tab=markaz&month=${shownMonth}\`}` become `href={\`/payments/salary?tab=markaz&month=${shownMonth}\`}`.

`components/payments/debt/debt-page-client.tsx` (replaced in Task 8): delete the `markaz` TABS entry, its `<TabsContent value="markaz">` and the `CenterTopUpView` import — the read is CEO/BD now.

- [ ] **Step 5: Run, type-check, commit**

```bash
cd client && npx vitest run src/components/payments/debt
cd client && npx tsc --noEmit -p .
git add server/src/salary/salary.controller.ts server/src/salary/salary.controller.spec.ts client/src/components/payments/debt/debt-subpage.tsx client/src/components/payments/debt/debt-subpages.test.ts "client/src/app/(dashboard)/payments/debt-history/page.tsx" "client/src/app/(dashboard)/payments/debt-write-offs/page.tsx" "client/src/app/(dashboard)/payments/frozen-balances/page.tsx" client/src/components/payments/debt/center-topup-view.tsx client/src/components/payments/salary-client.tsx client/src/components/payments/salary-monthly-view.tsx client/src/components/payments/debt/debt-page-client.tsx client/src/lib/breadcrumb-routes.ts
git commit -m "feat(debt): real sub-pages; «Markaz qoplagani» moves to Ish haqi (CEO/BD)

/payments/debt-history, /debt-write-offs and /frozen-balances render the
existing views with a back link. The salary page gains the «Markaz
qoplagani» tab (?tab=markaz&month=), its card links there, and
GET /salary/monthly/center-topup is CEO/BD only (ADR-0072).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The new debt page — three tabs, filters, tables, paging, URL state, old links

**Files:**
- Create: `client/src/components/payments/debt/debt-types.ts`, `debt-url.ts` (+test), `debt-format.ts` (+test), `debt-queries.ts`, `debt-filter-bar.tsx`, `debt-table.tsx`, `debt-page.tsx`, `debt-page.test.ts`
- Modify (replace content): `client/src/app/(dashboard)/payments/debt/page.tsx`
- Delete: `client/src/components/payments/debt/debt-page-client.tsx`, `debtors-view.tsx`, `debtors-view.test.ts`, `client/src/components/payments/debtor-row.tsx`

**Interfaces:**
- Consumes: `GET /payments/debt/list` (Task 4), `GET /payments/debt/excel` (Task 5).
- Produces (Task 9 relies on): `debt-types.ts` (`DebtTab`, `DEBT_TABS`, `DebtKind`, `DebtListItem`, `DebtListResponse`, `DebtDrawer`, `PromiseCell`, `PromiseMonthState`, `PayTarget`); `debt-format.ts` (`dayMonth`, `instantDayMonth`, `instantDate`, `KIND_LABEL`, `promiseText`, `promiseLine`, `drawerMonthText`, …); `debt-queries.ts` (`useDebtList`, `useDebtStudent`, `invalidateDebt`, `debtListKey`); `debt-table.tsx` (`Pill`, `PromiseCellView`); `DebtTable` takes an optional `onOpen`.

- [ ] **Step 1: URL state and formatting — failing tests**

Create `client/src/components/payments/debt/debt-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { debtListParams, hasDebtFilter, legacyDebtRedirect, readDebtFilters } from "./debt-url";

describe("legacyDebtRedirect — old links keep working (spec §2.6)", () => {
  it("sends the old tabs to their new homes", () => {
    expect(legacyDebtRedirect({ tab: "oylik" })).toBe("/payments/debt-history");
    expect(legacyDebtRedirect({ tab: "kechirilgan" })).toBe("/payments/debt-write-offs");
    expect(legacyDebtRedirect({ tab: "muzlatilgan" })).toBe("/payments/frozen-balances");
    expect(legacyDebtRedirect({ tab: "markaz" })).toBe("/payments/salary?tab=markaz");
    expect(legacyDebtRedirect({ tab: "markaz", month: "2026-08" })).toBe("/payments/salary?tab=markaz&month=2026-08");
  });

  it("the old debtor list becomes Shu oy; the outreach banner's promise link maps", () => {
    expect(legacyDebtRedirect({ tab: "qarzdorlar", search: "ali", holat: "FROZEN" })).toBe("/payments/debt?search=ali");
    expect(legacyDebtRedirect({ promise: "overdue" })).toBe("/payments/debt?promise=broken");
    expect(legacyDebtRedirect({ promise: "has_open" })).toBe("/payments/debt?promise=open");
  });

  it("leaves the new URLs alone", () => {
    expect(legacyDebtRedirect({})).toBeNull();
    expect(legacyDebtRedirect({ tab: "eski", promise: "broken" })).toBeNull();
  });
});

describe("the URL state and the request", () => {
  it("defaults: Shu oy, largest debt, page 1 of 20; the kind only in O'qimayotganlar", () => {
    expect(debtListParams(readDebtFilters(""))).toEqual({
      tab: "shu-oy", search: undefined, kind: undefined, groupIds: undefined, teacherIds: undefined,
      promise: undefined, sort: "debt", page: 1, pageSize: 20,
    });
    expect(debtListParams(readDebtFilters("tab=eski&kind=frozen")).kind).toBeUndefined();
    expect(debtListParams(readDebtFilters("tab=chiqqan&kind=frozen")).kind).toBe("frozen");
    expect(debtListParams(readDebtFilters("tab=xyz")).tab).toBe("shu-oy");
  });

  it("a filter is search, kind, group, teacher or promise — sort and paging are not", () => {
    expect(hasDebtFilter(readDebtFilters("sort=name&page=3"))).toBe(false);
    expect(hasDebtFilter(readDebtFilters("groupIds=g1"))).toBe(true);
    expect(hasDebtFilter(readDebtFilters("promise=none"))).toBe(true);
  });
});
```

Create `client/src/components/payments/debt/debt-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { drawerMonthText, dueCell, promiseLine, promiseText, sumLine, tabRule } from "./debt-format";

describe("debt cells (spec §2.3–2.5)", () => {
  it("«To'lov muddati»: «dd.MM gacha» before the day, red «o'tgan · dd.MM» on and after it", () => {
    expect(dueCell("2026-10-16", "2026-10-14")).toEqual({ text: "16.10 gacha", overdue: false });
    expect(dueCell("2026-10-14", "2026-10-14")).toEqual({ text: "o'tgan · 14.10", overdue: true });
    expect(dueCell(null, "2026-10-14")).toBeNull();
  });

  it("«Va'da»: open and broken, and the drawer's line", () => {
    expect(promiseText({ state: "open", promiseDate: "2026-10-17", promisedAmount: null })).toBe("17.10 gacha");
    expect(promiseText({ state: "broken", promiseDate: "2026-10-09", promisedAmount: null })).toBe("buzildi · 09.10");
    expect(promiseLine({ state: "open", promiseDate: "2026-10-17", promisedAmount: 350_000 })).toBe(`Va'da: ${formatNumber(350_000)} so'm, 17.10 gacha`);
  });

  it("«Topildi» with a filter, «Jami» (the tab's total) without", () => {
    expect(sumLine(true, 3, 905_000, { total: 1, count: 1 })).toBe(`Topildi: 3 ta · ${formatNumber(905_000)} so'm`);
    expect(sumLine(false, 3, 905_000, { total: 1_350_000, count: 4 })).toBe(`Jami: ${formatNumber(1_350_000)} so'm · 4 ta`);
  });

  it("the drawer's month line", () => {
    expect(drawerMonthText({ month: "2026-09", charged: 450_000, paid: 400_000, left: 50_000 }))
      .toBe(`hisoblandi ${formatNumber(450_000)} · to'landi ${formatNumber(400_000)} · qoldi ${formatNumber(50_000)}`);
    expect(drawerMonthText({ month: "2026-08", charged: null, paid: null, left: 30_000 })).toBe(`qoldi ${formatNumber(30_000)}`);
  });

  it("the Shu oy rule names the month and drops «(1-oktabrdan amal qiladi)»", () => {
    const text = tabRule("shu-oy", "2026-11");
    expect(text.startsWith("Noyabr to'lovini hali to'liq to'lamagan")).toBe(true);
    expect(text).not.toContain("1-oktabrdan");
  });
});
```

Run both — Expected: FAIL (modules missing).

- [ ] **Step 2: Types, URL state, formatting, queries**

Create `client/src/components/payments/debt/debt-types.ts`:

```ts
import type { CallOutcome } from "@/components/outreach/outreach-types";

/** The server's shapes (`server/src/payments/debt/debt-list.math.ts`, `promise-rule.ts`). */
export type DebtTab = "shu-oy" | "eski" | "chiqqan";
export const DEBT_TABS: readonly DebtTab[] = ["shu-oy", "eski", "chiqqan"];
export type DebtKind = "ungrouped" | "frozen" | "left";

export interface DebtGroup { id: string; name: string; teachers: { id: number; name: string }[] }
/** `promiseDate`: Tashkent day, YYYY-MM-DD. */
export interface PromiseCell { state: "open" | "broken"; promiseDate: string; promisedAmount: number | null }

export interface DebtListItem {
  studentId: number; firstName: string; lastName: string; phone: string | null;
  amount: number; otherPart: number; debt: number; kind: DebtKind | null;
  groups: DebtGroup[]; promise: PromiseCell | null;
  months: { monthKey: string; amount: number }[]; oldestMonth: string | null;
  dueDate: string | null;
  lastCall: { createdAt: string; outcome: CallOutcome } | null;
  lastPayment: { createdAt: string; amount: number } | null;
}

export interface TabTotal { total: number; count: number }

export interface DebtListResponse {
  data: DebtListItem[]; total: number; page: number; pageSize: number; sum: number;
  tabs: { "shu-oy": TabTotal; eski: TabTotal; chiqqan: TabTotal & { byKind: Record<DebtKind, TabTotal> } };
  leftThisMonth: number;
  options: { groups: { id: string; name: string }[]; teachers: { id: number; name: string }[] };
  writeOffCount: number;
}

export interface DebtDrawer {
  student: { id: number; firstName: string; lastName: string; phone: string | null };
  kind: DebtKind | null; groups: DebtGroup[]; debt: number;
  months: { month: string; charged: number | null; paid: number | null; left: number }[];
  lastPayment: { createdAt: string; amount: number; method: string } | null;
  lastCall: { createdAt: string; outcome: CallOutcome; note: string | null; calledByName: string } | null;
  promise: PromiseCell | null;
}

export interface PromiseMonthState {
  monthPromise: { id: string; status: string; promiseDate: string; promisedAmount: number | null; createdAt: string } | null;
  create: { from: string; to: string } | null;
  edit: { from: string; to: string } | null;
}

/** Who the payment dialog opens for. */
export interface PayTarget { id: number; firstName: string; lastName: string; balance: number; suggested: number }
```

Create `client/src/components/payments/debt/debt-url.ts`:

```ts
import { listParam } from "@/hooks/use-url-filters";
import { readFilters } from "@/lib/url-filter-params";
import { DEBT_TABS, type DebtTab } from "./debt-types";

/** The debt page's URL (spec §2.4). Kind, promise and sort use the API's own values, so the request is the URL. */
export const DEBT_LIST_SCHEMA = {
  tab: { type: "string", defaultValue: "shu-oy" },
  search: { type: "string", defaultValue: "" },
  kind: { type: "string", defaultValue: "" },
  groupIds: { type: "array", defaultValue: [] as string[] },
  teacherIds: { type: "array", defaultValue: [] as string[] },
  promise: { type: "string", defaultValue: "" },
  sort: { type: "string", defaultValue: "debt" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 20 },
} as const;

export interface DebtFilters {
  tab: string; search: string; kind: string; groupIds: string[]; teacherIds: string[];
  promise: string; sort: string; page: number; pageSize: number;
}

export const readDebtFilters = (search: string) => readFilters(DEBT_LIST_SCHEMA, new URLSearchParams(search)) as DebtFilters;

export const activeTab = (f: Pick<DebtFilters, "tab">): DebtTab =>
  (DEBT_TABS as readonly string[]).includes(f.tab) ? (f.tab as DebtTab) : "shu-oy";

/** Any list filter set — sort and paging are not filters (spec §2.4 «Topildi»). */
export const hasDebtFilter = (f: DebtFilters) => Boolean(f.search || f.kind || f.groupIds.length || f.teacherIds.length || f.promise);

/** `GET /payments/debt/list` / `excel` query: the URL's own names. */
export function debtListParams(f: DebtFilters) {
  const tab = activeTab(f);
  return {
    tab, search: f.search || undefined, kind: tab === "chiqqan" && f.kind ? f.kind : undefined,
    groupIds: listParam(f.groupIds), teacherIds: listParam(f.teacherIds), promise: f.promise || undefined,
    sort: f.sort, page: f.page, pageSize: f.pageSize,
  };
}

/** The old page's links (spec §2.6): its tabs moved out, its promise filter got new values. Null for a new URL. */
export function legacyDebtRedirect(sp: Record<string, string | string[] | undefined>): string | null {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const tab = one("tab");
  if (tab === "oylik") return "/payments/debt-history";
  if (tab === "kechirilgan") return "/payments/debt-write-offs";
  if (tab === "muzlatilgan") return "/payments/frozen-balances";
  if (tab === "markaz") {
    const month = one("month");
    return `/payments/salary?tab=markaz${month ? `&month=${encodeURIComponent(month)}` : ""}`;
  }
  const old = (one("promise") ?? "").split(",");
  const promise = old.includes("overdue") ? "broken" : old.includes("has_open") ? "open" : null;
  if (tab !== "qarzdorlar" && !promise) return null;
  const q = new URLSearchParams();
  const search = one("search");
  if (search) q.set("search", search);
  if (promise) q.set("promise", promise);
  const qs = q.toString();
  return `/payments/debt${qs ? `?${qs}` : ""}`;
}
```

Create `client/src/components/payments/debt/debt-format.ts`:

```ts
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { tashkentNow } from "@/lib/tashkent-time";
import { monthShort } from "../salary-utils";
import type { DebtDrawer, DebtKind, DebtListItem, DebtTab, PromiseCell, TabTotal } from "./debt-types";

export const TAB_LABEL: Record<DebtTab, string> = { "shu-oy": "Shu oy", eski: "Eski qarz", chiqqan: "O'qimayotganlar" };
export const KIND_LABEL: Record<DebtKind, string> = { ungrouped: "Guruhsiz", frozen: "Muzlatilgan", left: "Ketgan" };

/** 'YYYY-MM-DD' → 'dd.MM'. */
export const dayMonth = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;
/** An instant → its Tashkent 'dd.MM' / 'dd.MM.yyyy'. */
export const instantDayMonth = (iso: string) => dayMonth(tashkentNow(new Date(iso)).dateStr);
export const instantDate = (iso: string) => {
  const d = tashkentNow(new Date(iso)).dateStr;
  return `${dayMonth(d)}.${d.slice(0, 4)}`;
};

/** The line under the tab buttons — the mock-up's `rule` texts (spec §2.2). */
export function tabRule(tab: DebtTab, monthKey: string): string {
  if (tab === "shu-oy") {
    return `${monthShort(monthKey)} to'lovini hali to'liq to'lamagan o'qiyotgan o'quvchilar. To'lov muddati — shartnoma bo'yicha oyning 2-darsigacha. Qatorni bosing: oylar bo'yicha qarz, aloqa tarixi va amallar ochiladi.`;
  }
  if (tab === "eski") return "O'qiyotgan, lekin o'tgan oylardan qarzi qolgan o'quvchilar. Shartnomaga ko'ra 2-darsga kirish uchun eski qarz ham to'lanishi kerak.";
  return "Hozir hech qaysi guruhda o'qimayotganlar: guruhsiz qolgan, muzlatilgan yoki ketgan. Bu — undirish ro'yxati: qo'ng'iroq, va'da, to'lov.";
}

/** The small line of a tab button. */
export function tabSubline(tab: DebtTab, count: number, monthKey: string): string {
  if (tab === "shu-oy") return `${formatNumber(count)} o'quvchi · ${monthShort(monthKey).toLowerCase()} to'lovi`;
  if (tab === "eski") return `${formatNumber(count)} o'quvchi · o'tgan oylardan`;
  return `${formatNumber(count)} kishi · undirish ishi`;
}

/** «To'lov muddati» (spec §2.3); null prints «—». */
export function dueCell(due: string | null, today: string): { text: string; overdue: boolean } | null {
  if (!due) return null;
  return due <= today ? { text: `o'tgan · ${dayMonth(due)}`, overdue: true } : { text: `${dayMonth(due)} gacha`, overdue: false };
}

export const promiseText = (p: PromiseCell) => (p.state === "open" ? `${dayMonth(p.promiseDate)} gacha` : `buzildi · ${dayMonth(p.promiseDate)}`);

/** The drawer's «Va'da: X so'm, dd.MM gacha». */
export const promiseLine = (p: PromiseCell) =>
  p.promisedAmount != null
    ? `Va'da: ${formatPrice(p.promisedAmount)} so'm, ${dayMonth(p.promiseDate)} gacha`
    : `Va'da: ${dayMonth(p.promiseDate)} gacha`;

export const lastCallText = (c: DebtListItem["lastCall"]) => (c ? `${instantDayMonth(c.createdAt)} · ${CALL_OUTCOME_INFO[c.outcome].label}` : null);

/** «Topildi: N ta · X so'm» with a filter, «Jami: X so'm · N ta» (the tab's total) without. */
export const sumLine = (filtered: boolean, total: number, sum: number, tab: TabTotal) =>
  filtered ? `Topildi: ${formatNumber(total)} ta · ${formatPrice(sum)} so'm` : `Jami: ${formatPrice(tab.total)} so'm · ${formatNumber(tab.count)} ta`;

export const drawerMonthText = (m: DebtDrawer["months"][number]) =>
  m.charged === null
    ? `qoldi ${formatPrice(m.left)}`
    : `hisoblandi ${formatPrice(m.charged)} · to'landi ${formatPrice(m.paid ?? 0)} · qoldi ${formatPrice(m.left)}`;
```

Create `client/src/components/payments/debt/debt-queries.ts`:

```ts
"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { debtListParams, type DebtFilters } from "./debt-url";
import type { DebtDrawer, DebtListResponse } from "./debt-types";

export const debtListKey = (branchId: number | undefined, params: ReturnType<typeof debtListParams>) => ["debt-list", branchId, params] as const;

export function useDebtList(f: DebtFilters) {
  const { selectedBranch } = useBranchSwitcher();
  const params = debtListParams(f);
  return useQuery({
    queryKey: debtListKey(selectedBranch?.id, params),
    queryFn: () => api.get<DebtListResponse>("/payments/debt/list", { params }).then((r) => r.data),
  });
}

export function useDebtStudent(id: number | null) {
  return useQuery({
    queryKey: ["debt-student", id],
    queryFn: () => api.get<DebtDrawer>(`/payments/debt/students/${id}`).then((r) => r.data),
    enabled: id !== null,
  });
}

/** After a payment, a promise or a call every debt figure refetches (financial data never updates optimistically). */
export function invalidateDebt(qc: QueryClient) {
  for (const key of ["debt-list", "debt-student", "promise-month", "financial-overview", "debtors"]) qc.invalidateQueries({ queryKey: [key] });
}
```

(`readFilters` is exported from `src/lib/url-filter-params.ts`; `CallOutcome` from `components/outreach/outreach-types.ts`.) Run both tests — Expected: PASS.

- [ ] **Step 3: The page — failing test**

Create `client/src/components/payments/debt/debt-page.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatPhone } from "@/lib/format-utils";

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/debt",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/hooks/use-auth", () => {
  const state = { user: { roles: [{ id: 1, name: "CEO" }] } };
  const useAuth = Object.assign((select: (s: typeof state) => unknown) => select(state), {
    getState: () => state, setState: () => {}, subscribe: () => () => {},
  });
  return { useAuth };
});

import { debtListKey } from "./debt-queries";
import { debtListParams, readDebtFilters } from "./debt-url";
import { DebtPage } from "./debt-page";
import type { DebtListItem, DebtListResponse } from "./debt-types";

// Made-up figures; no total equals a sum of others, so an added total would show.
const ROW: DebtListItem = {
  studentId: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233",
  amount: 1_350_000, otherPart: 270_000, debt: 1_620_000, kind: null,
  groups: [{ id: "g1", name: "A1-01", teachers: [{ id: 20001, name: "Olim Karimov" }] }],
  promise: { state: "broken", promiseDate: "2026-10-09", promisedAmount: null },
  months: [{ monthKey: "2026-09", amount: 270_000 }], oldestMonth: "2026-09",
  dueDate: "2026-10-06", lastCall: null, lastPayment: { createdAt: "2026-09-20T09:00:00Z", amount: 400_000 },
};
const RESPONSE: DebtListResponse = {
  data: [ROW], total: 1, page: 1, pageSize: 20, sum: 1_350_000,
  tabs: {
    "shu-oy": { total: 1_350_000, count: 4 },
    eski: { total: 905_000, count: 2 },
    chiqqan: { total: 2_480_000, count: 3, byKind: { ungrouped: { total: 480_000, count: 1 }, frozen: { total: 1_000_000, count: 1 }, left: { total: 1_000_000, count: 1 } } },
  },
  leftThisMonth: 160_000,
  options: { groups: [{ id: "g1", name: "A1-01" }], teachers: [{ id: 20001, name: "Olim Karimov" }] },
  writeOffCount: 6,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const money = (n: number) => norm(`${n.toLocaleString("uz-UZ")} so'm`);

function render(search = "", response: DebtListResponse | null = RESPONSE): string {
  url.search = search;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(debtListKey(undefined, debtListParams(readDebtFilters(search))), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(DebtPage))));
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T07:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("DebtPage — header and tabs (spec §2.1–2.2)", () => {
  it("shows today, and each tab with its own total and count", () => {
    const text = render();
    expect(text).toContain("Bugungi holat · 14.10");
    expect(text).toContain(`Shu oy ${money(1_350_000)} ${num(4)} o'quvchi · oktabr to'lovi`);
    expect(text).toContain(`Eski qarz ${money(905_000)} ${num(2)} o'quvchi · o'tgan oylardan`);
    expect(text).toContain(`O'qimayotganlar ${money(2_480_000)} ${num(3)} kishi · undirish ishi`);
  });

  it("never adds the totals, and prints a dash — never a zero — until the list answers", () => {
    const text = render();
    expect(text).not.toContain(num(1_350_000 + 905_000));
    expect(text).not.toContain(num(1_350_000 + 905_000 + 2_480_000));
    expect(render("", null)).toContain("Shu oy —");
  });
});

describe("DebtPage — the Shu oy tab", () => {
  it("has the spec's columns and the row's cells", () => {
    const text = render();
    expect(text).toContain("# O'quvchi Guruh Qarz To'lov muddati Va'da Oxirgi aloqa");
    expect(text).toContain(`ID 10001 · ${norm(formatPhone("901112233"))}`);
    expect(text).toContain(`+ eski qarz ${num(270_000)}`);
    expect(text).toContain("A1-01 Olim Karimov");
    expect(text).toContain("o'tgan · 06.10");
    expect(text).toContain("buzildi · 09.10");
    expect(text).toContain("aloqa bo'lmagan");
  });

  it("prints the difference line only when it is above 0, and only here", () => {
    const line = `Shu oy guruhdan chiqqanlarning shu oy qarzi — ${money(160_000)} — «O'qimayotganlar» bo'limida.`;
    expect(render()).toContain(line);
    expect(render("", { ...RESPONSE, leftThisMonth: 0 })).not.toContain("guruhdan chiqqanlarning");
    expect(render("tab=eski")).not.toContain("guruhdan chiqqanlarning");
  });

  it("«Jami» without a filter, «Topildi» with one", () => {
    expect(render()).toContain(`Jami: ${money(1_350_000)} · ${num(4)} ta`);
    expect(render("search=ali")).toContain(`Topildi: 1 ta · ${money(1_350_000)}`);
  });
});

describe("DebtPage — the other tabs", () => {
  it("Eski qarz: its columns, the «+ shu oy» pill, months and the last payment", () => {
    const text = render("tab=eski");
    expect(text).toContain("# O'quvchi Guruh Eski qarz Qaysi oylardan Oxirgi to'lov Va'da");
    expect(text).toContain(`+ shu oy ${num(270_000)}`);
    expect(text).toContain(`Sentabr ${num(270_000)}`);
    expect(text).toContain(`20.09 · ${num(400_000)}`);
  });

  it("O'qimayotganlar: the kind chips with their counts, Holat and Oxirgi guruh", () => {
    const text = render("tab=chiqqan", { ...RESPONSE, data: [{ ...ROW, kind: "frozen", otherPart: 0 }] });
    for (const chip of [`Hammasi · ${num(3)}`, `Guruhsiz · ${num(1)}`, `Muzlatilgan · ${num(1)}`, `Ketgan · ${num(1)}`]) expect(text).toContain(chip);
    expect(text).toContain("# O'quvchi Holat Oxirgi guruh Qarz Qaysi oylardan Oxirgi aloqa");
    expect(text).toContain("muzlatilgan A1-01");
  });
});

describe("DebtPage — links and language", () => {
  it("links the history, the write-off archive with its count, the frozen balances; names Ish haqi", () => {
    const text = render();
    expect(text).toContain("Oylar bo'yicha qarz tarixi");
    expect(text).toContain(`Kechirilgan qarzlar arxivi · ${num(6)} ta`);
    expect(text).toContain("Muzlatilganlarning puli");
    expect(text).toContain("Markaz qoplagani — Ish haqi sahifasida.");
  });

  it("puts no English word on screen", () => {
    for (const s of ["", "tab=eski", "tab=chiqqan"]) {
      expect(render(s)).not.toMatch(/\b(debt|promise|search|total|tab|ungrouped|frozen|left|open|broken|loading|error)\b/i);
    }
  });
});
```

Run — Expected: FAIL (`./debt-page` missing).

- [ ] **Step 4: The table**

Create `client/src/components/payments/debt/debt-table.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { monthShort } from "../salary-utils";
import { dueCell, instantDayMonth, KIND_LABEL, lastCallText, promiseText } from "./debt-format";
import type { DebtListItem, DebtTab, PromiseCell } from "./debt-types";

const PILL = {
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  green: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  muted: "bg-muted text-muted-foreground",
} as const;

export const Pill = ({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) => (
  <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", PILL[tone])}>{children}</span>
);
const Dash = () => <span className="text-muted-foreground">—</span>;

export const PromiseCellView = ({ p }: { p: PromiseCell | null }) =>
  p ? <Pill tone={p.state === "open" ? "green" : "red"}>{promiseText(p)}</Pill> : <Dash />;

/** Spec §2.3, after `#`. The amount column (AMOUNT_AT) is right-aligned. */
const HEADS: Record<DebtTab, string[]> = {
  "shu-oy": ["O'quvchi", "Guruh", "Qarz", "To'lov muddati", "Va'da", "Oxirgi aloqa"],
  eski: ["O'quvchi", "Guruh", "Eski qarz", "Qaysi oylardan", "Oxirgi to'lov", "Va'da"],
  chiqqan: ["O'quvchi", "Holat", "Oxirgi guruh", "Qarz", "Qaysi oylardan", "Oxirgi aloqa"],
};
const AMOUNT_AT: Record<DebtTab, number> = { "shu-oy": 2, eski: 2, chiqqan: 3 };

function NameCell({ r, tab }: { r: DebtListItem; tab: DebtTab }) {
  return (
    <div>
      <div className="font-medium">{r.firstName} {r.lastName}</div>
      <div className="text-xs text-muted-foreground">ID {r.studentId}{r.phone ? ` · ${formatPhone(r.phone)}` : ""}</div>
      {tab === "shu-oy" && r.otherPart > 0 && <div className="mt-1"><Pill tone="red">+ eski qarz {formatPrice(r.otherPart)}</Pill></div>}
      {tab === "eski" && r.otherPart > 0 && <div className="mt-1"><Pill tone="amber">+ shu oy {formatPrice(r.otherPart)}</Pill></div>}
    </div>
  );
}

function GroupCell({ r }: { r: DebtListItem }) {
  if (r.groups.length === 0) return <Dash />;
  const teachers = [...new Set(r.groups.flatMap((g) => g.teachers.map((t) => t.name)))];
  return (
    <div>
      <div>{r.groups.map((g) => g.name).join(", ")}</div>
      {teachers.length > 0 && <div className="text-xs text-muted-foreground">{teachers.join(", ")}</div>}
    </div>
  );
}

const MonthsCell = ({ r }: { r: DebtListItem }) =>
  r.months.length === 0 ? <Dash /> : (
    <div className="flex flex-wrap gap-1">
      {r.months.map((m) => <Pill key={m.monthKey} tone="red">{monthShort(m.monthKey)} {formatPrice(m.amount)}</Pill>)}
    </div>
  );

function CallCell({ r }: { r: DebtListItem }) {
  const text = lastCallText(r.lastCall);
  return text ? <span>{text}</span> : <span className="text-muted-foreground">aloqa bo&apos;lmagan</span>;
}

function DueCellView({ due, today }: { due: string | null; today: string }) {
  const c = dueCell(due, today);
  if (!c) return <Dash />;
  return c.overdue ? <Pill tone="red">{c.text}</Pill> : <span>{c.text}</span>;
}

export function DebtTable({ tab, rows, loading, offset, today, onOpen, onPay }: {
  tab: DebtTab;
  rows: DebtListItem[] | undefined;
  loading: boolean;
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  today: string;
  onOpen?: (studentId: number) => void;
  onPay: (row: DebtListItem) => void;
}) {
  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>;
  if (!rows?.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Hech kim topilmadi — qidiruvni tozalab yoki filtrni kengaytirib ko&apos;ring</p>;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            {HEADS[tab].map((h, i) => <TableHead key={h} className={i === AMOUNT_AT[tab] ? "text-right" : undefined}>{h}</TableHead>)}
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow
              key={r.studentId}
              tabIndex={0}
              className={onOpen ? "cursor-pointer" : undefined}
              onClick={() => onOpen?.(r.studentId)}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(r.studentId); }}
            >
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell><NameCell r={r} tab={tab} /></TableCell>
              {tab === "chiqqan" ? (
                <>
                  <TableCell>{r.kind && <Pill tone={r.kind === "frozen" ? "amber" : "muted"}>{KIND_LABEL[r.kind].toLowerCase()}</Pill>}</TableCell>
                  <TableCell>{r.groups[0]?.name ?? "—"}</TableCell>
                </>
              ) : <TableCell><GroupCell r={r} /></TableCell>}
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
              {tab === "shu-oy" && (
                <>
                  <TableCell><DueCellView due={r.dueDate} today={today} /></TableCell>
                  <TableCell><PromiseCellView p={r.promise} /></TableCell>
                  <TableCell><CallCell r={r} /></TableCell>
                </>
              )}
              {tab === "eski" && (
                <>
                  <TableCell><MonthsCell r={r} /></TableCell>
                  <TableCell>{r.lastPayment ? `${instantDayMonth(r.lastPayment.createdAt)} · ${formatPrice(r.lastPayment.amount)}` : "—"}</TableCell>
                  <TableCell><PromiseCellView p={r.promise} /></TableCell>
                </>
              )}
              {tab === "chiqqan" && (
                <>
                  <TableCell><MonthsCell r={r} /></TableCell>
                  <TableCell><CallCell r={r} /></TableCell>
                </>
              )}
              <TableCell className="text-right">
                <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onPay(r); }}>To&apos;lov</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 5: The filter bar**

Create `client/src/components/payments/debt/debt-filter-bar.tsx` — `DebtFilterBar({ filters, setFilters, options })` (`filters: DebtFilters`, `setFilters: (u: Partial<DebtFilters>) => void`, `options: DebtListResponse["options"] | undefined`), one `flex flex-wrap items-center gap-2` row with no labels (filter-bar convention); every change resets `page: 1`:

| Control | Exact texts | Writes |
|---|---|---|
| search `Input` with `Search` icon (`w-full sm:w-72`, `aria-label="Qarzdorni qidirish"`) | placeholder «Ism, telefon yoki ID» | `search` (debounced, below) |
| `MultiSelectCombobox` (`w-48`), options `options.groups` as `{ value: id, label: name }` | placeholder «Barcha guruhlar», search «Guruh qidirish...» | `groupIds` |
| `MultiSelectCombobox` (`w-48`), options `options.teachers` as `{ value: String(id), label: name }` | «Barcha ustozlar», «Ustoz qidirish...» | `teacherIds` |
| `Select` (`w-48`, `aria-label="Va'da"`), value `filters.promise \|\| "all"` | `all` «Va'da: hammasi», `open` «Va'da berganlar», `broken` «Va'dasi buzilgan», `none` «Va'dasiz» | `promise` (`"all"` → `""`) |
| `Select` (`w-56`, `aria-label="Saralash"`) | `debt` «Eng katta qarz», `oldest` «Eng uzoq qarzdor», `broken` «Va'dasi buzilganlar birinchi», `name` «Ism (A–Z)» | `sort` |

The search keeps a local mirror so typing stays smooth (same as the deleted `debtors-view.tsx`):

```tsx
  const [search, setSearch] = useState(filters.search);
  useEffect(() => setSearch(filters.search), [filters.search]);
  useEffect(() => {
    if (search === filters.search) return;
    const t = setTimeout(() => setFilters({ search, page: 1 }), 300);
    return () => clearTimeout(t);
  }, [search, filters.search, setFilters]);
```

- [ ] **Step 6: The page**

Create `client/src/components/payments/debt/debt-page.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentNow } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { RecordPaymentDialog } from "../record-payment-dialog";
import { DebtFilterBar } from "./debt-filter-bar";
import { dayMonth, KIND_LABEL, sumLine, TAB_LABEL, tabRule, tabSubline } from "./debt-format";
import { invalidateDebt, useDebtList } from "./debt-queries";
import { DebtTable } from "./debt-table";
import { activeTab, DEBT_LIST_SCHEMA, debtListParams, hasDebtFilter, type DebtFilters } from "./debt-url";
import { DEBT_TABS, type DebtKind, type DebtListResponse, type DebtTab, type PayTarget } from "./debt-types";

const TAB_DOT: Record<DebtTab, string> = { "shu-oy": "bg-amber-500", eski: "bg-red-500", chiqqan: "bg-muted-foreground" };
const KINDS: ("" | DebtKind)[] = ["", "ungrouped", "frozen", "left"];

/**
 * «Qarzdorlik» (spec B2a, ADR-0072): today's debt in three tabs, never added.
 * Every figure is the server's — the tab totals are the debt split's, the rows
 * are the same split's rows.
 */
export function DebtPage() {
  const { filters: raw, setFilters } = useUrlFilters(DEBT_LIST_SCHEMA);
  const filters = raw as DebtFilters;
  const tab = activeTab(filters);
  const qc = useQueryClient();
  const { data, isPending, isError, refetch } = useDebtList(filters);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const today = tashkentNow().dateStr;
  const monthKey = today.slice(0, 7);

  const exportExcel = async () => {
    // The list's own query; the server ignores page and pageSize for the Excel.
    const qs = new URLSearchParams(
      Object.entries(debtListParams(filters)).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]),
    ).toString();
    try {
      await downloadAuthedFile(`/payments/debt/excel?${qs}`, `qarzdorlik-${tab}-${today}.xlsx`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Qarzdorlik</h1>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" />Bugungi holat · {dayMonth(today)}
        </span>
        <Button variant="outline" onClick={exportExcel}><Download className="mr-2 size-4" />Excel</Button>
      </div>

      <TabButtons tabs={data?.tabs} active={tab} monthKey={monthKey}
        onSelect={(t) => setFilters({ tab: t, page: 1, kind: "", groupIds: [], teacherIds: [] })} />

      {tab === "shu-oy" && data && data.leftThisMonth > 0 && (
        <p className="text-sm text-muted-foreground">
          Shu oy guruhdan chiqqanlarning shu oy qarzi — {formatBalance(data.leftThisMonth)} — «O&apos;qimayotganlar» bo&apos;limida.
        </p>
      )}
      <p className="text-sm text-muted-foreground">{tabRule(tab, monthKey)}</p>

      {tab === "chiqqan" && (
        <div role="group" aria-label="Holat" className="flex w-max max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => {
            const count = k ? data?.tabs.chiqqan.byKind[k].count : data?.tabs.chiqqan.count;
            return (
              <button key={k || "all"} type="button" aria-pressed={filters.kind === k} onClick={() => setFilters({ kind: k, page: 1 })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", filters.kind === k && "bg-background text-foreground shadow-sm")}>
                {k ? KIND_LABEL[k] : "Hammasi"} · {count === undefined ? "—" : formatNumber(count)}
              </button>
            );
          })}
        </div>
      )}

      <DebtFilterBar filters={filters} setFilters={setFilters} options={data?.options} />
      {data && <p className="text-sm text-muted-foreground">{sumLine(hasDebtFilter(filters), data.total, data.sum, data.tabs[tab])}</p>}

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Qarzdorlar ro&apos;yxatini yuklab bo&apos;lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : (
        <DebtTable tab={tab} rows={data?.data} loading={isPending} offset={(filters.page - 1) * filters.pageSize} today={today}
          onPay={(r) => setPayTarget({ id: r.studentId, firstName: r.firstName, lastName: r.lastName, balance: -r.debt, suggested: r.debt })} />
      )}

      {data && data.total > 0 && (
        <TablePagination total={data.total} page={filters.page} pageSize={filters.pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}

      <div className="space-y-1.5 pt-2">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          <FooterLink href="/payments/debt-history">Oylar bo&apos;yicha qarz tarixi</FooterLink>
          <FooterLink href="/payments/debt-write-offs">Kechirilgan qarzlar arxivi{data ? ` · ${formatNumber(data.writeOffCount)} ta` : ""}</FooterLink>
          <FooterLink href="/payments/frozen-balances">Muzlatilganlarning puli</FooterLink>
        </div>
        <p className="text-xs text-muted-foreground">Markaz qoplagani — Ish haqi sahifasida.</p>
      </div>

      <RecordPaymentDialog open={payTarget !== null} onOpenChange={(open) => !open && setPayTarget(null)}
        preSelectedStudent={payTarget} suggestedAmount={payTarget?.suggested} onSuccess={() => invalidateDebt(qc)} />
    </div>
  );
}

const FooterLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="inline-flex items-center gap-1 text-primary hover:underline">{children}<ArrowRight className="size-3.5" /></Link>
);

function TabButtons({ tabs, active, monthKey, onSelect }: {
  tabs: DebtListResponse["tabs"] | undefined; active: DebtTab; monthKey: string; onSelect: (t: DebtTab) => void;
}) {
  return (
    <div role="tablist" aria-label="Qarz turi" className="grid gap-3 md:grid-cols-3">
      {DEBT_TABS.map((t) => {
        const total = tabs?.[t];
        return (
          <button key={t} type="button" role="tab" aria-selected={t === active} onClick={() => onSelect(t)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left", t === "chiqqan" && "bg-muted/50", t === active && "border-primary ring-1 ring-primary")}>
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", TAB_DOT[t])} />{TAB_LABEL[t]}
            </span>
            <span className={cn("text-xl font-bold tabular-nums", t !== "chiqqan" && "text-red-600 dark:text-red-400")}>{total ? formatBalance(total.total) : "—"}</span>
            {total && <span className="text-xs text-muted-foreground">{tabSubline(t, total.count, monthKey)}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

(`useUrlFilters`' `setFilters` has the schema's value shape, which is `DebtFilters`; cast once at the call site if `tsc` asks.)

Replace `client/src/app/(dashboard)/payments/debt/page.tsx` with:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DebtPage } from "@/components/payments/debt/debt-page";
import { legacyDebtRedirect } from "@/components/payments/debt/debt-url";

// Old links (?tab=oylik, ?promise=overdue, …) still land (spec B2a §2.6).
// Suspense: the page keeps its tab and filters in the URL (`useSearchParams`).
export default async function DebtRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const to = legacyDebtRedirect(await searchParams);
  if (to) redirect(to);
  return (
    <Suspense>
      <DebtPage />
    </Suspense>
  );
}
```

Delete the old page and list (`debt-filters-provider.tsx`, `monthly-debt-view.tsx`, `write-offs-view.tsx`, `frozen-balance-view.tsx`, `debt-status-filter-bar.tsx`, `debt-months-badge.tsx` stay — Task 7's sub-pages and the student card use them):

```bash
git rm client/src/components/payments/debt/debt-page-client.tsx client/src/components/payments/debt/debtors-view.tsx client/src/components/payments/debt/debtors-view.test.ts client/src/components/payments/debtor-row.tsx
```

- [ ] **Step 7: Run, type-check, commit**

```bash
cd client && npx vitest run src/components/payments/debt
cd client && npx tsc --noEmit -p .
git add client/src/components/payments/debt "client/src/app/(dashboard)/payments/debt/page.tsx"
git commit -m "feat(debt): the new Qarzdorlik page — three tabs, filters, tables, paging

Tab buttons with their own totals (never added), the rule line, the Shu
oy difference line, kind chips, search/group/teacher/promise filters and
the sort in the URL, server paging (20), the three column sets, Excel,
and the footer links. Old ?tab= and ?promise= links redirect. The old
five-tab page and its debtor list are deleted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The drawer, the promise form, and the promise caps in the payment and call dialogs

**Files:**
- Create: `client/src/components/payments/promise-month.ts` (+ `promise-month.test.ts`), `client/src/components/payments/debt/debt-drawer.tsx` (+ `debt-drawer.test.ts`)
- Modify: `client/src/components/payments/debt/debt-page.tsx`, `client/src/components/payments/record-payment-dialog.tsx`, `client/src/components/outreach/log-call-dialog.tsx`, `client/src/lib/role-access.ts`

**Interfaces:**
- Consumes: `GET /payments/debt/students/:id` (Task 5); `GET /payment-promises/month`, `POST /payment-promises` with `promisedAmount` (Task 2); Task 8's types, formatters, `PromiseCellView`, `useDebtStudent`, `invalidateDebt`.
- Produces: `usePromiseMonth(studentId)`, `dateFromDay(day)`, `capToRange(date, range)`; `STATEMENT_ROLES = [1, 2, 3]`; `DebtDrawer({ studentId, onClose, onPay, onLogCall })`, `DebtDrawerBody`, `PromiseForm`.

- [ ] **Step 1: Failing tests**

Create `client/src/components/payments/promise-month.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { capToRange, dateFromDay } from "./promise-month";

describe("promise date helpers (ADR-0072)", () => {
  it("a day is local midnight, the value a DatePicker bound takes", () => {
    expect(dateFromDay("2026-10-21")).toEqual(new Date(2026, 9, 21));
  });

  it("a default day is clamped into the allowed range", () => {
    const range = { from: "2026-10-14", to: "2026-10-21" };
    expect(capToRange(new Date(2026, 10, 2), range)).toEqual(new Date(2026, 9, 21));
    expect(capToRange(new Date(2026, 9, 10), range)).toEqual(new Date(2026, 9, 14));
    expect(capToRange(new Date(2026, 9, 16), range)).toEqual(new Date(2026, 9, 16));
    expect(capToRange(null, range)).toBeNull();
    expect(capToRange(new Date(2026, 10, 2), null)).toEqual(new Date(2026, 10, 2));
  });
});
```

Create `client/src/components/payments/debt/debt-drawer.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { DebtDrawerBody, PromiseForm } from "./debt-drawer";
import type { DebtDrawer, PromiseMonthState } from "./debt-types";

const DRAWER: DebtDrawer = {
  student: { id: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233" },
  kind: null, groups: [{ id: "g1", name: "A1-01", teachers: [] }], debt: 500_000,
  months: [{ month: "2026-08", charged: null, paid: null, left: 30_000 }, { month: "2026-09", charged: 450_000, paid: 380_000, left: 70_000 }],
  lastPayment: null, lastCall: null, promise: null,
};
const FREE: PromiseMonthState = { monthPromise: null, create: { from: "2026-10-14", to: "2026-10-21" }, edit: null };
const TAKEN: PromiseMonthState = {
  monthPromise: { id: "p1", status: "KEPT", promiseDate: "2026-10-05T18:00:00Z", promisedAmount: null, createdAt: "2026-10-02T05:00:00Z" },
  create: null, edit: null,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const num = (n: number) => norm(n.toLocaleString("uz-UZ"));
const noop = () => {};
const html = (over: Partial<Parameters<typeof DebtDrawerBody>[0]> = {}) =>
  renderToStaticMarkup(createElement(DebtDrawerBody, { drawer: DRAWER, promiseState: FREE, canLogCalls: true, canPdf: true, onPay: noop, onLogCall: noop, ...over }));

describe("DebtDrawerBody (spec §2.5)", () => {
  it("prints the debt, the months, and the empty payment and contact lines", () => {
    const text = norm(html());
    expect(text).toContain("ID 10001");
    expect(text).toContain("A1-01");
    expect(text).toContain(`Qarz ${num(500_000)} so'm`);
    expect(text).toContain(`Avgust 2026 qoldi ${num(30_000)}`);
    expect(text).toContain(`Sentabr 2026 hisoblandi ${num(450_000)} · to'landi ${num(380_000)} · qoldi ${num(70_000)}`);
    expect(text).toContain("Hali to'lov qilmagan");
    expect(text).toContain("Hali aloqa bo'lmagan");
  });

  it("names the promise with its amount", () => {
    const text = norm(html({ drawer: { ...DRAWER, promise: { state: "open", promiseDate: "2026-10-17", promisedAmount: 350_000 } } }));
    expect(text).toContain(`Va'da: ${num(350_000)} so'm, 17.10 gacha`);
  });

  it("the actions follow the roles: a cashier gets neither the call result nor the PDF", () => {
    const admin = norm(html());
    for (const action of ["To'lov qayd qilish", "Va'da yozish", "Qo'ng'iroq natijasi", "To'lovlar hisoboti (PDF)"]) expect(admin).toContain(action);
    const cashier = norm(html({ canLogCalls: false, canPdf: false }));
    expect(cashier).toContain("Va'da yozish");
    expect(cashier).not.toContain("Qo'ng'iroq natijasi");
    expect(cashier).not.toContain("To'lovlar hisoboti (PDF)");
  });

  it("a promise already this month disables «Va'da yozish» and says why", () => {
    const raw = html({ promiseState: TAKEN });
    expect(norm(raw)).toContain("Bu o'quvchiga shu oy va'da yozilgan");
    // The attribute itself — every Button's class also says `disabled:…`.
    expect(raw).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Va&#x27;da yozish/);
    expect(html()).not.toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>).)*Va&#x27;da yozish/);
  });
});

describe("PromiseForm", () => {
  it("has the three fields and the rule note, never «shartnoma bo'yicha»", () => {
    const text = norm(renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(PromiseForm, { studentId: 10001, debt: 500_000, range: FREE.create!, onClose: noop }))));
    for (const label of ["Summa", "Qachongacha", "Izoh", "Ko'pi bilan 7 kunga, oyiga 1 marta."]) expect(text).toContain(label);
    expect(text).not.toContain("shartnoma bo'yicha");
  });
});
```

Run both — Expected: FAIL (modules missing).

- [ ] **Step 2: The promise-month hook and helpers, `STATEMENT_ROLES`**

Create `client/src/components/payments/promise-month.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PromiseMonthState } from "./debt/debt-types";

/**
 * `GET /payment-promises/month` — this month's promise and the days a promise
 * may name (ADR-0072: at most 7 days ahead, once a month). The drawer form,
 * the payment dialog and the call dialog read it; the server decides.
 */
export function usePromiseMonth(studentId: number | null) {
  return useQuery({
    queryKey: ["promise-month", studentId],
    queryFn: () => api.get<PromiseMonthState>("/payment-promises/month", { params: { studentId } }).then((r) => r.data),
    enabled: studentId != null,
    staleTime: 0,
  });
}

/** 'YYYY-MM-DD' → local midnight, the value a `<DatePicker>` bound takes. */
export function dateFromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A default day clamped into the allowed range (no range → unchanged). */
export function capToRange(date: Date | null, range: { from: string; to: string } | null): Date | null {
  if (!date || !range) return date;
  const from = dateFromDay(range.from);
  const to = dateFromDay(range.to);
  return date < from ? from : date > to ? to : date;
}
```

In `client/src/lib/role-access.ts`, after `CALL_LOG_ROLES` add:

```ts
/** `GET /students/:id/statement.pdf` — statements.controller.ts. Kassir yo'q. */
export const STATEMENT_ROLES = [1, 2, 3];
```

- [ ] **Step 3: The drawer**

Create `client/src/components/payments/debt/debt-drawer.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, FileText, Loader2, Phone, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { CALL_LOG_ROLES, hasAnyRole, STATEMENT_ROLES } from "@/lib/role-access";
import { tashkentInstantOn } from "@/lib/tashkent-time";
import { PAYMENT_METHOD_LABELS } from "../overview/overview-math";
import { dateFromDay, usePromiseMonth } from "../promise-month";
import { monthLabel } from "../salary-utils";
import { drawerMonthText, instantDate, instantDayMonth, KIND_LABEL, promiseLine } from "./debt-format";
import { invalidateDebt, useDebtStudent } from "./debt-queries";
import { PromiseCellView } from "./debt-table";
import type { DebtDrawer as DrawerData, PayTarget, PromiseMonthState } from "./debt-types";

/** Row click on the debt page (spec §2.5). The payment and call dialogs open over the page, after it closes. */
export function DebtDrawer({ studentId, onClose, onPay, onLogCall }: {
  studentId: number | null; onClose: () => void; onPay: (t: PayTarget) => void; onLogCall: (p: LogCallPrefill) => void;
}) {
  const { data, isPending, isError } = useDebtStudent(studentId);
  const promise = usePromiseMonth(studentId);
  const roles = useAuth((s) => s.user?.roles);
  const name = data ? `${data.student.firstName} ${data.student.lastName}` : "";
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4"><SheetTitle>{name || "O'quvchi"}</SheetTitle></SheetHeader>
        {isError ? (
          <p className="p-6 text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        ) : isPending || !data ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <DebtDrawerBody
            key={data.student.id}
            drawer={data}
            promiseState={promise.data ?? null}
            canLogCalls={hasAnyRole(roles, CALL_LOG_ROLES)}
            canPdf={hasAnyRole(roles, STATEMENT_ROLES)}
            onPay={() => onPay({ id: data.student.id, firstName: data.student.firstName, lastName: data.student.lastName, balance: -data.debt, suggested: data.debt })}
            onLogCall={() => onLogCall({ studentId: data.student.id, studentLabel: `#${data.student.id} ${name}`, studentPhone: data.student.phone, reason: "DEBT" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-1.5">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
);

export function DebtDrawerBody({ drawer: d, promiseState, canLogCalls, canPdf, onPay, onLogCall }: {
  drawer: DrawerData; promiseState: PromiseMonthState | null; canLogCalls: boolean; canPdf: boolean; onPay: () => void; onLogCall: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const monthTaken = promiseState?.monthPromise != null;
  const meta = [`ID ${d.student.id}`, d.student.phone && formatPhone(d.student.phone), d.groups.map((g) => g.name).join(", ") || null, d.kind && KIND_LABEL[d.kind].toLowerCase()]
    .filter(Boolean).join(" · ");
  const pdf = async () => {
    try {
      await downloadAuthedFile(`/students/${d.student.id}/statement.pdf`, `tolovlar-${d.student.id}.pdf`);
    } catch (e) {
      toast.error(getErrorMessage(e, "PDF yuklab olishda xatolik"));
    }
  };
  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
        <p className="text-muted-foreground">{meta}</p>
        <div className="flex items-baseline justify-between rounded-xl border px-3 py-2">
          <span className="text-muted-foreground">Qarz</span>
          <span className="text-xl font-bold text-red-600 dark:text-red-400">{formatBalance(d.debt)}</span>
        </div>
        <Section title="Oylar bo'yicha">
          {d.months.length === 0 ? <p className="text-muted-foreground">—</p> : d.months.map((m) => (
            <div key={m.month} className="flex justify-between gap-3 border-b py-1.5 last:border-0">
              <span>{monthLabel(m.month)}</span><span className="text-right text-muted-foreground">{drawerMonthText(m)}</span>
            </div>
          ))}
        </Section>
        <Section title="Oxirgi to'lov">
          <p>{d.lastPayment
            ? `${instantDate(d.lastPayment.createdAt)} · ${formatBalance(d.lastPayment.amount)} · ${PAYMENT_METHOD_LABELS[d.lastPayment.method] ?? d.lastPayment.method}`
            : "Hali to'lov qilmagan"}</p>
        </Section>
        <Section title="Aloqa va va'da">
          {d.lastCall && (
            <p>{instantDayMonth(d.lastCall.createdAt)} · {CALL_OUTCOME_INFO[d.lastCall.outcome].label}{d.lastCall.note ? ` · ${d.lastCall.note}` : ""}</p>
          )}
          {d.promise && <p className="flex items-center justify-between gap-2"><span>{promiseLine(d.promise)}</span><PromiseCellView p={d.promise} /></p>}
          {!d.lastCall && !d.promise && <p className="text-muted-foreground">Hali aloqa bo&apos;lmagan</p>}
        </Section>
        {formOpen && promiseState?.create && <PromiseForm studentId={d.student.id} debt={d.debt} range={promiseState.create} onClose={() => setFormOpen(false)} />}
      </div>
      <div className="flex flex-wrap gap-2 border-t px-6 py-4">
        <Button onClick={onPay}><Plus className="mr-1 size-4" />To&apos;lov qayd qilish</Button>
        <Button variant="outline" disabled={monthTaken || !promiseState?.create} onClick={() => setFormOpen(true)}>
          <CalendarCheck className="mr-1 size-4" />Va&apos;da yozish
        </Button>
        {canLogCalls && <Button variant="outline" onClick={onLogCall}><Phone className="mr-1 size-4" />Qo&apos;ng&apos;iroq natijasi</Button>}
        {canPdf && <Button variant="outline" onClick={pdf}><FileText className="mr-1 size-4" />To&apos;lovlar hisoboti (PDF)</Button>}
        {monthTaken && <p className="w-full text-xs text-muted-foreground">Bu o&apos;quvchiga shu oy va&apos;da yozilgan</p>}
      </div>
    </>
  );
}

/** «Va'da yozish» (spec §2.5): Summa (the whole debt), Qachongacha (today … +7), Izoh. */
export function PromiseForm({ studentId, debt, range, onClose }: {
  studentId: number; debt: number; range: { from: string; to: string }; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(debt));
  const [day, setDay] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const save = useMutation({
    // 23:00 Tashkent of the picked day: the server reads its Tashkent day.
    mutationFn: () => api.post("/payment-promises", { studentId, promiseDate: tashkentInstantOn(day!, 23), comment: note.trim(), promisedAmount: Number(amount) || undefined }),
    onSuccess: () => {
      toast.success("Va'da yozildi");
      invalidateDebt(qc);
      onClose();
    },
    onError: (e) => toast.error(getErrorMessage(e, "Va'dani saqlashda xatolik")),
  });
  const row = "grid grid-cols-[110px_1fr] items-center gap-2";
  return (
    <form className="space-y-3 rounded-xl border p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className={row}><Label htmlFor="pf-sum">Summa</Label><PriceInput id="pf-sum" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className={row}>
        <Label htmlFor="pf-date">Qachongacha</Label>
        <DatePicker id="pf-date" value={day} onChange={(v) => setDay(v ?? null)} minDate={dateFromDay(range.from)} maxDate={dateFromDay(range.to)} defaultMonth={dateFromDay(range.from)} />
      </div>
      <div className={row}><Label htmlFor="pf-note">Izoh</Label><Input id="pf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: maosh olgach to'laydi" /></div>
      <p className="text-xs text-muted-foreground">Ko&apos;pi bilan 7 kunga, oyiga 1 marta.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={!day || !note.trim() || save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Saqlash</Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Bekor qilish</Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Wire the drawer into the page**

In `debt-page.tsx`: import `{ LogCallDialog, type LogCallPrefill }` from `@/components/outreach/log-call-dialog` and `{ DebtDrawer }` from `./debt-drawer`; add state `const [drawerId, setDrawerId] = useState<number | null>(null);` and `const [callTarget, setCallTarget] = useState<LogCallPrefill | null>(null);`; pass `onOpen={setDrawerId}` to `DebtTable`; after `RecordPaymentDialog` add:

```tsx
      <DebtDrawer studentId={drawerId} onClose={() => setDrawerId(null)}
        onPay={(t) => { setDrawerId(null); setPayTarget(t); }}
        onLogCall={(p) => { setDrawerId(null); setCallTarget(p); }} />
      <LogCallDialog open={callTarget !== null} onOpenChange={(open) => !open && setCallTarget(null)} prefill={callTarget} />
```

- [ ] **Step 5: The payment dialog — one promise a month, ≤ 7 days**

In `client/src/components/payments/record-payment-dialog.tsx`:
1. Imports: `import { capToRange, dateFromDay, usePromiseMonth } from "./promise-month";`, `import { dayMonth } from "./debt/debt-format";`, `import { tashkentNow } from "@/lib/tashkent-time";`.
2. Replace the lines `const needsPromise = promiseNeeded(reach);` and `const promiseDate = pickedPromiseDate ?? (reach ? promiseDefaultDate(reach) : null);` with:

```ts
  // ADR-0072: at most 7 days ahead, once a month. A student who already has
  // this month's promise is asked for none; the default day is capped.
  const promiseMonth = usePromiseMonth(selectedStudent?.id ?? null);
  const monthPromise = promiseMonth.data?.monthPromise ?? null;
  const promiseRange = promiseMonth.data?.create ?? null;
  const needsPromise = promiseNeeded(reach) && !monthPromise;
  const promiseDate = pickedPromiseDate ?? (reach ? capToRange(promiseDefaultDate(reach), promiseRange) : null);
```

3. On `<DatePicker id="promise-date" …>` replace `minDate={startOfToday()}` with `minDate={promiseRange ? dateFromDay(promiseRange.from) : startOfToday()}` and `maxDate={promiseRange ? dateFromDay(promiseRange.to) : undefined}`; its help text becomes `To&apos;lov va&apos;dasi: ko&apos;pi bilan 7 kunga, oyiga 1 marta.`
4. Right after the `{needsPromise && ( … )}` block in the reach box, add:

```tsx
              {promiseNeeded(reach) && monthPromise && (
                <p className="text-muted-foreground">
                  Shu oy va&apos;da yozilgan: {dayMonth(tashkentNow(new Date(monthPromise.promiseDate)).dateStr)} gacha. Yangisi so&apos;ralmaydi.
                </p>
              )}
```

5. In the submit button's `disabled`, `(needsPromise && !promiseDate)` becomes `(needsPromise && (!promiseDate || promiseMonth.isPending))`.

- [ ] **Step 6: The call dialog — the same rule**

In `client/src/components/outreach/log-call-dialog.tsx`:
1. `import { dateFromDay, usePromiseMonth } from "@/components/payments/promise-month";`
2. In `CallForm`, after `const dateField = …`:

```ts
  // ADR-0072: «To'laydi» moves this month's OPEN promise (within 7 days of when
  // it was written) or writes the month's first; a month whose promise is
  // closed takes no date.
  const isPay = outcome === "WILL_PAY";
  const promiseMonth = usePromiseMonth(isPay ? prefill.studentId : null);
  const payRange = promiseMonth.data ? (promiseMonth.data.edit ?? promiseMonth.data.create) : null;
  const promiseTaken = isPay && !!promiseMonth.data && !payRange;
```

3. In `mutationFn`, delete the inner `const isPay = outcome === "WILL_PAY";`; `promiseDate: isPay ? dateIso : undefined,` becomes `promiseDate: isPay && !promiseTaken ? dateIso : undefined,`.
4. In `onSuccess`, after the `["debtors"]` invalidation, invalidate `["debt-list"]`, `["debt-student"]` and `["promise-month"]` too.
5. The `{dateField && ( … )}` block becomes:

```tsx
        {dateField && !promiseTaken && (
          <div className="space-y-1">
            <Label className="text-xs">{dateField.label}</Label>
            <DatePicker value={selectedDate} onChange={(d) => setSelectedDate(d ?? null)}
              minDate={isPay && payRange ? dateFromDay(payRange.from) : new Date()}
              maxDate={isPay && payRange ? dateFromDay(payRange.to) : undefined} />
            <p className="text-[11px] text-muted-foreground">
              {isPay && promiseMonth.data?.edit ? "Shu oy yozilgan va'daning sanasi o'zgaradi (ko'pi bilan 7 kunga)." : dateField.help}
            </p>
          </div>
        )}
        {promiseTaken && (
          <p className="text-[11px] text-muted-foreground">Bu o&apos;quvchiga shu oy va&apos;da yozilgan — to&apos;lov sanasi kiritilmaydi.</p>
        )}
```

- [ ] **Step 7: Run, type-check, commit**

```bash
cd client && npx vitest run src/components/payments src/components/outreach src/lib/role-access.test.ts
cd client && npx tsc --noEmit -p .
git add client/src/components/payments/promise-month.ts client/src/components/payments/promise-month.test.ts client/src/components/payments/debt/debt-drawer.tsx client/src/components/payments/debt/debt-drawer.test.ts client/src/components/payments/debt/debt-page.tsx client/src/components/payments/record-payment-dialog.tsx client/src/components/outreach/log-call-dialog.tsx client/src/lib/role-access.ts
git commit -m "feat(debt): student drawer with the promise form; promise caps in both dialogs

Row click opens the drawer: debt, months, last payment, contact and
promise, and the actions per role (no call result or PDF for a cashier).
«Va'da yozish» writes amount, date (today … +7) and note, disabled with
the reason once the month has a promise. The payment and call dialogs
read GET /payment-promises/month: dates capped at today + 7, and no new
promise asked when the month already has one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Docs, the guide, full verification, browser check list

**Files:**
- Modify: `server/CLAUDE.md`, `client/CLAUDE.md`, `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md`
- Modify: `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`, `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/yangiliklar.ts` (and other guide pages naming the old tabs)

**Interfaces:** none.

- [ ] **Step 1: `server/CLAUDE.md`**

1. «Key access rules», the salary/financial bullet: replace the sentence starting `` `GET /salary/monthly/center-topup` (the «Markaz qoplagani» tab) joined the open reads on 2026-09-30 `` (through `Teacher stays out.`) with `` The debt page's own reads — `GET /payments/debt/list`, `/debt/students/:id`, `/debt/excel` (ADR-0072) — are part of the same open read. `GET /salary/monthly/center-topup` left it on 2026-10-04: «Markaz qoplagani» is a tab of the salary page and the read is CEO/BD (ADR-0072). ``
2. «Salary page reads»: replace `Two reads stay open to Administrator because pages they use call them: …(debt page).` with `One read stays open to Administrator because a page they use calls it: \`GET /salary/timeline/:userId\` (teacher profile «Taymlayn» tab). \`GET /salary/monthly/center-topup\` is CEO/BD (the salary page's «Markaz qoplagani» tab, ADR-0072).`
3. Payment Module «Endpoints»: after `` `GET /payments/debtors`, `` insert `` `GET /payments/debt/list`, `GET /payments/debt/students/:id`, `GET /payments/debt/excel` (the debt page, ADR-0072), ``. Under «Key rules» add: `` - **Payment promise rule (ADR-0072)**: `payment-promises/promise-rule.ts` — a promise names a Tashkent day from today to today + 7; one promise per student per Tashkent month, by `createdAt`, any status; this month's OPEN promise may be moved only within 7 days of its creation day; the month's first promise closes an OPEN one left from an earlier month. `create` / `upsertOpenPromise` apply it; `POST /payments` and `POST /call-logs` call `assertPromiseAllowed` BEFORE they write, so a bad promise is a 400 with nothing saved. `GET /payment-promises/month?studentId=` returns the month's promise and the allowed day ranges. ``
4. Salary Module «Endpoints»: the `` `GET /salary/monthly/center-topup` (CEO/BD/Admin/Cashier — … open-read rule) `` entry becomes `` `GET /salary/monthly/center-topup` (CEO/BD — the "Qolgan (markaz)" drill-down: which students the center is still owed by; read by the salary page's «Markaz qoplagani» tab, ADR-0072) ``. In its «Roles» bullet delete `` `monthly/center-topup` (CEO/BD/Admin/Cashier — the debt page tab, the one salary route a Cashier reaches) and ``.
5. «Debt as two numbers (ADR-0059)»: the `DebtSplit` shape becomes `` `DebtSplit { studying: { total, count, currentMonth, currentMonthCount, older, olderCount }, notStudying: { total, count, currentMonth, byKind: { ungrouped, frozen, left } } }`, summed from per-student rows (`loadDebtRows` → `debtRows` → `sumDebtRows`) through ONE tab rule, `debtTabAmount` (ADR-0072): «Shu oy» = studying with `currentMonth > 0`, «Eski qarz» = studying with `older > 0`, «O'qimayotganlar» = the rest, whole debt — so a debt-page tab's total is the sum of its rows. `notStudying.currentMonth` is the not-studying debtors' current-month part (the Shu oy tab's difference line). ``; replace `is one \`groupBy(['status'])\` over the not-studying predicate` with `is counted from the not-studying rows (read per student, with their status)`; add `` the debt page (`DebtListService`, reading `loadDebtRows`), `` to the readers; replace `(the «Oylik qarzdorlik» tab tiles, the debtor list, the balance sheet's «Debitorlik» and others — the full list is in ADR-0059)` with `(the debt history page's status tiles, \`GET /payments/debtors\` — whose service still feeds the home attention block's top debtors —, the balance sheet's «Debitorlik» and others — the full list is in ADR-0059; ADR-0072 moved the debt page's list onto the split)`.
6. RBAC table: the row `| Debt page «Markaz qoplagani» tab | ✅ | ✅ | ✅ | ✅ | ❌ |` becomes `| Debt page list, drawer, Excel (\`/payments/debt/*\`) | ✅ | ✅ | ✅ | ✅ | ❌ |`; after the «Salary page reads» row add `| «Markaz qoplagani» (salary page tab) | ✅ | ✅ | ❌ | ❌ | ❌ |`.

- [ ] **Step 2: `client/CLAUDE.md`**

1. «Financial UI»: replace the whole `/payments/debt` row and the old redirect row with:

```markdown
| `/payments/debt` | `debt/debt-page.tsx` | **«Qarzdorlik» (spec B2a, ADR-0072).** «Bugungi holat · dd.MM» and «Excel» (`GET /payments/debt/excel`: the open tab with its filters, every page). Three tab buttons (`?tab=shu-oy|eski|chiqqan`), each with its own total and count from `GET /payments/debt/list` → `tabs` — the debt split's own fields, never added, no combined figure. Under them the tab's rule line; on Shu oy the difference line (only when `leftThisMonth > 0`); on O'qimayotganlar the kind chips. Filters in the URL (`DEBT_LIST_SCHEMA`: search, `groupIds`, `teacherIds`, `promise=open|broken|none`, `sort=debt|oldest|broken|name`, page size 20), filtered, sorted and paged on the server; «Topildi: N ta · X so'm» with a filter, «Jami: X so'm · N ta» without. Row click opens `debt-drawer.tsx` (debt, months from the statement allocation, last payment, contact and promise; «To'lov qayd qilish», «Va'da yozish» (`GET /payment-promises/month`: ≤ 7 days, once a month; disabled with the reason when the month has one), «Qo'ng'iroq natijasi» (`CALL_LOG_ROLES`), «To'lovlar hisoboti (PDF)» (`STATEMENT_ROLES`, no Cashier)). Footer links to the three pages below. Old links redirect on the server (`legacyDebtRedirect`): `?tab=qarzdorlar` → Shu oy, `?tab=oylik|kechirilgan|muzlatilgan` → the pages below, `?tab=markaz[&month=]` → `/payments/salary?tab=markaz`, `?promise=overdue` → `promise=broken`. The client computes no figure. |
| `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/frozen-balances` | `debt/debt-subpage.tsx` + the existing views | Real pages again (B2a): the month-by-month history, the write-off archive, the frozen balances (temporary, until «Qaytariladigan pul»), each with «← Qarzdorlik». `/payments/debtors` still redirects to `/payments/debt`. |
```

2. The `/payments/salary` row: append `` A third tab «Markaz qoplagani» (`?tab=markaz`, month in `?month=`, empty = the whole period) renders `debt/center-topup-view.tsx` (CEO/BD, ADR-0072). ``
3. «Markaz qo'shimchasi drill-down»: `` `<Link>`s to `/payments/debt?tab=markaz&month=…` `` becomes `` `<Link>`s to `/payments/salary?tab=markaz&month=…` (ADR-0072) ``.
4. «Role-Based Access Control — Frontend Rules»: add `STATEMENT_ROLES` to the constants listed for `src/lib/role-access.ts`.

- [ ] **Step 3: `CONTEXT.md`, `docs/role-access.md`, `docs/financial-system.md`**

1. `CONTEXT.md`: replace the «**To'lov va'dasi (PaymentPromise)**» entry with:

```markdown
**To'lov va'dasi (PaymentPromise)** — qarzdor «falon kuni to'layman» deganda
ochiladigan yozuv: `OPEN → KEPT | BROKEN | CANCELLED`. Sanasi — bugundan bugun + 7
gacha bo'lgan Toshkent kuni; o'quvchiga bir Toshkent oyida bitta va'da (`createdAt`
bo'yicha); shu oyning ochiq va'dasi sanasi yozilgan kunidan 7 kun ichida o'zgaradi.
To'lov va qo'ng'iroq uni yozishdan oldin tekshiradi.
`payment-promises/promise-rule.ts` · `docs/adr/0072-qarzdorlik-qatorlari-va-vada-qoidasi.md`

**Qarzdorlik bo'limlari** — «Shu oy» (o'qiyotgan, qarzining shu oy qismi bor), «Eski
qarz» (o'qiyotgan, o'tgan oylardan qarzi bor), «O'qimayotganlar» (butun qarz). Ikkala
qismi bor o'quvchi ikkala o'qiyotganlar bo'limida turadi; bo'lim jami — uning
qatorlari yig'indisi.
`reports/debt-split.ts` (`debtTabAmount`) · ADR-0072
```

2. `docs/role-access.md`, «Debt page» section: its first paragraph becomes `Every staff role except Teacher sees the same page: three tabs (Shu oy / Eski qarz / O'qimayotganlar), the student drawer and the Excel (\`/payments/debt/*\`, ADR-0072), and the three linked pages (debt history, write-off archive, frozen balances). «Markaz qoplagani» moved to the salary page and is CEO/BD (\`GET /salary/monthly/center-topup\`). Everyone below the CEO sees their own branch. The actions differ by role:`; in its table `View the five tabs` becomes `View the three tabs, the drawer and the linked pages`, the call row's label becomes `Log a call result («Qo'ng'iroq natijasi», \`POST /call-logs\`)`, and add `| Write a payment promise («Va'da yozish», ≤ 7 days, once a month) | Yes | Yes | Yes | No | Yes |` and `| Payment statement PDF (drawer) | Yes | Yes | Yes | No | No |`; add `STATEMENT_ROLES` to its «Frontend» line. In the salary-reads bullet replace `Two salary reads stay open to Administrator because pages they use call them: … (debt page, below).` with `One salary read stays open to Administrator because a page they use calls it: \`GET /salary/timeline/:userId\` (teacher profile, «Taymlayn» tab). \`GET /salary/monthly/center-topup\` is CEO/BD (ADR-0072).`
3. `docs/financial-system.md`: after the `/api/payments/debtors` row add

```markdown
| `GET` | `/api/payments/debt/list` | CEO, BD, Admin, Cashier | Qarzdorlik bo'limi: qatorlar, bo'lim jamilari, filtr/saralash/sahifa (ADR-0072) |
| `GET` | `/api/payments/debt/students/:id` | CEO, BD, Admin, Cashier | O'quvchi tortmasi: qarz, oylar, oxirgi to'lov, aloqa, va'da |
| `GET` | `/api/payments/debt/excel` | CEO, BD, Admin, Cashier | Ochiq bo'lim Excel'da |
| `GET` | `/api/payment-promises/month` | CEO, BD, Admin, Cashier | Shu oy va'dasi va ruxsat etilgan kunlar |
```

and the page row `| Qarzdorlar | \`/payments/debtors\` | … |` becomes `| Qarzdorlik | \`/payments/debt\` | Shu oy · Eski qarz · O'qimayotganlar, o'quvchi tortmasi (ADR-0072) |`.

- [ ] **Step 4: The guide**

1. `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`: replace everything from `## Sahifa` up to (not including) `### «Oylik qarzdorlik»` with:

```mdx
## Sahifa

Moliya → «Qarzdorlik» bugungi holatni ko'rsatadi: sarlavha yonida «Bugungi holat · kun.oy» va «Excel». Oy tanlanmaydi. Tepada uchta bo'lim tugmasi turadi, har birida jami va soni; uchta jami hech qachon qo'shilmaydi va sahifada umumiy yig'indi yo'q. Ochiq bo'lim va filtrlar havolada saqlanadi.

| Bo'lim | Kimlar | Summa |
|---|---|---|
| «Shu oy» | O'qiyotgan, qarzining shu oy hisobigacha bo'lgan qismi bor o'quvchilar | Qarzning shu oy qismi |
| «Eski qarz» | O'qiyotgan, o'tgan oylardan qarzi qolgan o'quvchilar | Qarzning qolgan qismi |
| «O'qimayotganlar» | Hozir hech qaysi guruhda o'qimayotganlar: guruhsiz, muzlatilgan, ketgan | Butun qarz |

Ikkala qismi bor o'quvchi ikkala o'qiyotganlar bo'limida turadi: qatordagi «+ eski qarz ...» yoki «+ shu oy ...» belgisi ikkinchi qismni aytadi. Bu bir qarzning ikki ko'rinishi, ikki qarz emas. Bo'lim jami doim uning qatorlari yig'indisiga teng. Arxivdagi o'quvchi bo'limlarda yo'q.

«Shu oy» bo'limida, shu oy guruhdan chiqqanlarning shu oy qarzi bo'lsa, «Shu oy guruhdan chiqqanlarning shu oy qarzi — ... — «O'qimayotganlar» bo'limida.» qatori chiqadi: «Umumiy ma'lumotlar»dagi «Qoldi» ularni ham sanaydi, bu sahifada ular «O'qimayotganlar»da turadi.

### Ustunlar va filtrlar

- **«Shu oy»:** «O'quvchi» (ism, ID, telefon), «Guruh» (ostida ustoz), «Qarz», «To'lov muddati», «Va'da», «Oxirgi aloqa», «To'lov» tugmasi.
- **«Eski qarz»:** «O'quvchi», «Guruh», «Eski qarz», «Qaysi oylardan» (qarz qaysi oylarda paydo bo'lgani), «Oxirgi to'lov», «Va'da».
- **«O'qimayotganlar»:** «O'quvchi», «Holat» (guruhsiz / muzlatilgan / ketgan), «Oxirgi guruh», «Qarz», «Qaysi oylardan», «Oxirgi aloqa»; tepada «Hammasi», «Guruhsiz», «Muzlatilgan», «Ketgan» tugmalari soni bilan.

«To'lov muddati» — o'quvchining shu oydagi 2-darsi, to'lov xabaridagi sananing o'zi: kunigacha «kun.oy gacha», shu kuni va keyin qizil «o'tgan · kun.oy»; oyda ikki darsi bo'lmasa «—». «Va'da»: ochiq — yashil «kun.oy gacha», buzilgan — qizil «buzildi · kun.oy». «Oxirgi aloqa» — oxirgi qo'ng'iroq sanasi va natijasi, bo'lmasa «aloqa bo'lmagan».

Filtrlar: qidiruv (ism, telefon yoki ID), «Barcha guruhlar», «Barcha ustozlar» (bo'limning o'z qatorlaridan), «Va'da: hammasi» / «Va'da berganlar» / «Va'dasi buzilgan» / «Va'dasiz», saralash — «Eng katta qarz», «Eng uzoq qarzdor», «Va'dasi buzilganlar birinchi», «Ism (A–Z)». Filtr qo'yilsa «Topildi: N ta · X so'm», qo'yilmasa «Jami: X so'm · N ta». Sahifada 20 tadan.

### O'quvchi oynasi

Qatorni bossangiz, o'ng tomondan oyna ochiladi: «Qarz» (o'quvchining butun qarzi), «Oylar bo'yicha» (har oy: «hisoblandi · to'landi · qoldi»), «Oxirgi to'lov», «Aloqa va va'da». Amallar: «To'lov qayd qilish» ([To'lov qayd qilish](/qollanma/tolovlar/tolov-qayd-qilish)), «Va'da yozish» (Summa — boshlanishda butun qarz, Qachongacha, Izoh), «Qo'ng'iroq natijasi», «To'lovlar hisoboti (PDF)».

### To'lov va'dasi

Va'da sanasi bugundan boshlab ko'pi bilan 7 kun keyin bo'ladi va o'quvchiga oyiga bitta va'da yoziladi. Qoida hamma joyda bir xil: o'quvchi oynasidagi «Va'da yozish», qo'ng'iroq natijasidagi «To'laydi» va qisman to'lovdagi «Qolgan qismi qachon to'lanadi?». Shu oy va'da yozilgan bo'lsa, «Va'da yozish» bosilmaydi va «Bu o'quvchiga shu oy va'da yozilgan» yoziladi; to'lov oynasi yangi va'da so'ramaydi. Qo'ng'iroqdagi «To'laydi» shu oyning ochiq va'dasi sanasini o'zgartiradi — faqat va'da yozilgan kundan 7 kun ichida. O'tgan oydan qolgan ochiq va'da shu oyning birinchi va'dasi yozilganda bekor bo'ladi.

Va'da sanasi o'tgan va o'quvchi hali qarzdor bo'lsa, tizim uni dushanbadan shanbagacha har kuni soat 09:00 da «buzildi» deb belgilaydi; shu payt CEO'ga va o'quvchi filialining administratorlariga bildirishnoma boradi. To'lov qarzni butunlay yopsa, ochiq va'da bajarilgan hisoblanadi. Va'da o'quvchini darsga kiritmaydi.

### Pastdagi havolalar

«Oylar bo'yicha qarz tarixi», «Kechirilgan qarzlar arxivi · N ta» va «Muzlatilganlarning puli» — alohida sahifalar, har birida «← Qarzdorlik». «Markaz qoplagani» endi Ish haqi sahifasining tabi (faqat CEO va filial direktori).

```

2. In the same file: headings `### «Oylik qarzdorlik»` → `### Oylar bo'yicha qarz tarixi`, `### «Kechirilganlar»` → `### Kechirilgan qarzlar arxivi`, `### «Muzlatilgan puli»` → `### Muzlatilganlarning puli`. «Misol»: step 1's `«Qarzdorlar» tabida uning qarzi 2 400 000 so'm, «Qachondan beri» ustunida «1 oy» va sentabrdagi sana turadi.` → `«Shu oy» bo'limida 1 200 000 so'm (ostida «+ eski qarz 1 200 000»), «Eski qarz» bo'limida 1 200 000 so'm turadi.`; step 3's `«Oylik qarzdorlik» tabida` → `«Oylar bo'yicha qarz tarixi» sahifasida`, deleting its last sentence (`Jasur qarzdor bo'lib qoladi, …`); step 4's `«Natijani kiritish» da` → `«Qo'ng'iroq natijasi» da` and `qatorda sana belgisi paydo bo'ldi` → `«Va'da» ustunida «kun.oy gacha» paydo bo'ldi (sana bugundan ko'pi bilan 7 kun keyin)`. «Kim qila oladi»: `Bu «Oylik qarzdorlik» tabiga ham tegishli.` → `Bu qarz tarixi sahifasiga ham tegishli.`; the table rows become:

```mdx
| Sahifani ochish, uchta bo'lim va o'quvchi oynasini ko'rish, Excel | Ha | Ha | Ha | Ha |
| To'lov qayd qilish | Ha | Ha | Ha | Ha |
| «Va'da yozish» | Ha | Ha | Ha | Ha |
| «Qo'ng'iroq natijasi» | Ha | Ha | Ha | — (tugma yo'q) |
| «To'lovlar hisoboti (PDF)» | Ha | Ha | Ha | — (tugma yo'q) |
| Qarz tarixi va kechirilgan qarzlar sahifalari | Ha | Ha | Ha | Ha |
| «Markaz qoplagani» (Ish haqi sahifasi) | Ha | Ha | — | — |
| «Muzlatilganlarning puli» ro'yxatini ko'rish | Ha | Ha | Ha | Ha |
| «Muzlatilganlarning puli» dagi amallar («Markaz hisobiga o'tkazish», «O'quvchiga qaytarish») | Ha | Ha | Ha | — (amallar ustuni yo'q) |
| «Kechirishni qaytarib olish» | Ha | — | — | — |
```

   In «Qarz kechirish o'chiq», `«Kechirilganlar» tabida` → `«Kechirilgan qarzlar arxivi» sahifasida`. Search the rest of `client/src/qollanma/kontent/` (`lugat.mdx` among them) for `«Qarzdorlar» tab`, the debt page's `Natijani kiritish` and `Markaz qoplagani`, and update each to the new names. Made-up names and round figures only.
3. `client/src/qollanma/sahifalar/tolovlar.ts`, the `qarzdorlik` entry: `qisqacha` → `"«Qarzdorlik» sahifasi bugungi qarzni uch bo'limda ko'rsatadi: «Shu oy», «Eski qarz» va «O'qimayotganlar»; uchala jami qo'shilmaydi. Qatorni bosib o'quvchi oynasini ochasiz: oylar bo'yicha qarz, aloqa, to'lov va va'da. To'lov va'dasi ko'pi bilan 7 kunga, oyiga bir marta yoziladi."`; `adr` → `["0058", "0059", "0062", "0072"]`; `yollar` → `["/payments/debt", "/payments/debt-history", "/payments/debt-write-offs", "/payments/frozen-balances"]`; add `"shu oy"`, `"eski qarz"`, `"o'qimayotganlar"`, `"va'da yozish"`, `"qo'ng'iroq natijasi"` to `kalitSozlar`; `yangilangan: "2026-10-04"`.
4. `client/src/qollanma/yangiliklar.ts`, at the top of the array:

```ts
  {
    sana: "2026-10-04",
    sarlavha: "«Qarzdorlik» uch bo'limda, to'lov va'dasi 7 kungacha va oyiga bir marta",
    matn: "«Qarzdorlik» sahifasi endi bugungi qarzni uch bo'limda ko'rsatadi: «Shu oy», «Eski qarz» va «O'qimayotganlar»; har bo'limda jami va soni, uchalasi qo'shilmaydi. Qatorni bossangiz o'quvchi oynasi ochiladi: oylar bo'yicha qarz, oxirgi to'lov, aloqa va amallar. To'lov va'dasi bugundan ko'pi bilan 7 kunga va o'quvchiga oyiga bir marta yoziladi — o'quvchi oynasida, qo'ng'iroq natijasida va qisman to'lovda bir xil. Qarz tarixi, kechirilgan qarzlar va muzlatilganlar puli alohida sahifalarga ko'chdi; «Markaz qoplagani» Ish haqi sahifasida, faqat CEO va filial direktoriga.",
    rollar: [1, 2, 3, 5],
    sahifa: { bolim: "tolovlar", sahifa: "qarzdorlik" },
  },
```

Run: `cd client && npx vitest run src/qollanma` — Expected: PASS.

- [ ] **Step 5: Full verification (one after another, never in parallel)**

```bash
cd server && npm run typecheck && npx eslint src 2>&1 | tail -3 && npm test 2>&1 | tail -15 && npm run build
cd client && npx tsc --noEmit -p . && npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -8 && npm run build 2>&1 | tail -15
```
Expected: clean typechecks, 0 lint errors, all suites pass, both builds succeed; the client build lists `/payments/debt`, `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/frozen-balances`.

- [ ] **Step 6: What the controller checks in the browser (mock API or local data; screenshots for the CEO)**

1. `/payments/debt` as a CEO: three tab buttons with totals and counts, no combined figure; the rule line; on Shu oy the difference line only when > 0; columns and pills per tab; «Topildi»/«Jami»; paging 20; Excel downloads the open tab with its filters.
2. Filters and URL: search, Guruh, Ustoz, Va'da, sort, the O'qimayotganlar chips; reload keeps them; switching tab resets page, kind, groups and teachers.
3. Old links: `?tab=qarzdorlar`, `?tab=oylik`, `?tab=kechirilgan`, `?tab=muzlatilgan`, `?tab=markaz&month=2026-09`, `?promise=overdue` land where spec §2.6 says.
4. Drawer: months, last payment, contact/promise; «Va'da yozish» calendar today … +7; the saved promise appears and the button then disables with «Bu o'quvchiga shu oy va'da yozilgan»; «To'lov qayd qilish» and «Qo'ng'iroq natijasi» open over the page; PDF downloads.
5. As a Cashier: no «Qo'ng'iroq natijasi», no PDF; `/payments/salary` is not reachable and `GET /salary/monthly/center-topup` answers 403.
6. Payment dialog: a part payment's date stops at today + 7; with a promise already this month the line «Shu oy va'da yozilgan …» shows and no date is asked. Call dialog: «To'laydi» caps the date; a closed month promise hides it.
7. `/payments/salary?tab=markaz`: the tab and its month picker; the salary card's two figures link there.
8. The three sub-pages render with «← Qarzdorlik»; breadcrumbs name them.
9. Re-run `npm run qollanma:skrinshot` (client) if a guide frame shows the debt page.

Do not deploy: merge and deploy only with the CEO's go-ahead (spec §8).

- [ ] **Step 7: Commit**

```bash
git add server/CLAUDE.md client/CLAUDE.md CONTEXT.md docs/role-access.md docs/financial-system.md client/src/qollanma
git commit -m "docs: B2a debt page, promise rule and center top-up in docs and the guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec | Task |
|---|---|
| §2.1 header: title, «Bugungi holat», Excel, branch switcher | 5, 8 |
| §2.2 three tabs from one function; both-parts students; difference note; rule lines | 1, 4, 8 |
| §2.3 columns and definitions (groups/teachers, last group, due date, promise, last contact, months, last payment) | 3, 4, 8 |
| §2.4 search, Guruh/Ustoz/Va'da, kind chips, sort, Topildi/Jami, server paging 20, URL state, `?promise=overdue` | 3, 4, 8 |
| §2.5 drawer: debt, months (statement allocation), last payment, contact/promise, actions per role, promise form | 3, 5, 9 |
| §2.6 links, real sub-pages, old `?tab=` URLs | 7, 8 |
| §2.7 Excel: open tab, filters, all pages, total row | 5, 8 |
| §3 «Markaz qoplagani» on Ish haqi, CEO/BD read, links | 7, 10 |
| §4 promise rule on every write; amount; payment validates first; dialogs' caps and month state | 2, 9 |
| §5.1–5.4 split rows, list, drawer, Excel endpoints | 1, 3, 4, 5 |
| §5.5–5.6 promise service, center-topup roles | 2, 7 |
| §5.7 route policy (Decision 1), guard specs | 2, 4, 5, 7 |
| §5.8 ADR-0072 | 6 |
| §5 last line: old `GET /payments/debtors` and `/summary` (Decision 10) | — |
| §6 client: components, sub-pages, redirects, salary tab, dialogs, breadcrumbs, Uzbek only | 7, 8, 9 |
| §7 tests: pure, services, controllers, client, browser check | 1–5, 7–10 |
