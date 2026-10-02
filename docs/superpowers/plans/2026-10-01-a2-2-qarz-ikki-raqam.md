# A2 (2-qism): qarz — ikki alohida raqam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every surface that shows "how much the centre is owed" shows two numbers that are never added together: «O'qiyotganlar qarzi» (with its 🟡 shu oy / 🔴 eski split) and «O'qimayotganlar qarzi».

**Architecture:** One pure split (`splitDebt`) and one loader (`loadDebtSplit`) in `server/src/reports/debt-split.ts`, built on the single «faol o'quvchi» rule (`activeStudentWhere`, ADR-0015) and the current month's CHARGED charges. Moliya overview, Bosh sahifa, the Qarzdorlik page cards, the outreach banner, the Telegram 21:00 report and its snapshot, `/qarzdorlar`, `/stats`, «💰 Moliyaviy xulosa» and the Excel «Filiallar» sheet read it through `ReportsService.getDebtSplit`.

**Tech Stack:** NestJS 11 + Prisma 7 + Jest (server), Next.js 16 + React Query + Vitest (client).

**Source:** spec `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` §2.1 and A2.4, refined by the CEO-approved Qarzdorlik mock-up of 27.09: «o'qiyotganlar» are students in an active group (ACTIVE status + an ACTIVE enrollment in an ACTIVE group); students without a group go to «O'qimayotganlar» (guruhsiz · muzlatilgan · ketgan); archived cards are counted nowhere. The first mock-up's «Eski qarz 21.1M / 137» was wrong precisely because it counted ungrouped students as studying — that correction is the definition used here.

**Depends on:** plan `2026-10-01-a2-1-togri-raqamlar.md` (PR 1) — same branch family; start this after PR 1's tasks are complete (it reuses `MonthCharges`' month helpers and edits the same Telegram and overview files).

## Global Constraints

- «O'qiyotganlar qarzi»: students with `deletedAt: null`, `balance < 0`, matching `activeStudentWhere()` (`server/src/students/shared/active-student-where.ts`). Split per student: `shuOy = min(debt, Σ that student's CHARGED chargedAmount of the current Tashkent month)`, `eski = debt − shuOy`.
- «O'qimayotganlar qarzi»: students with `deletedAt: null`, `balance < 0`, NOT matching `activeStudentWhere()`.
- Archived students (`deletedAt` set) are in neither number.
- The two numbers are never summed on any surface, and no surface prints a combined «Jami qarz» any more. «O'rtacha qarz» goes (mock-up 27.09: «o'rtacha qarz — OLINADI»).
- Branch scope: `studentBranchWhere(branchIds)` — the predicate the debtor lists use. An empty scope gives zeros.
- Labels (verbatim): «O'qiyotganlar qarzi», «O'qimayotganlar qarzi», «shu oy», «eski qarz».
- Every figure comes from the server; the client never recomputes one.
- UI text Latin-script Uzbek, no English words on screen, no «CEO» in UI text.
- Never run `prettier` on `client/`; run `npx prettier --write` on touched server files.
- Commit messages Latin-script Uzbek; code comments match the surrounding file; `CLAUDE.md` English; ADR Uzbek.
- ADR number **0059** (0058 is PR 1's; re-check `origin/main` before the PR).
- No production database access; no push/PR/merge/deploy without the user's go.

## File Structure

| File | Responsibility |
|---|---|
| `server/src/reports/debt-split.ts` (new) | `DebtSplit`, pure `splitDebt`, `loadDebtSplit` |
| `server/src/reports/debt-split.spec.ts` (new) | Tests |
| `server/src/reports/reports-financial.service.ts`, `reports.service.ts` | `getDebtSplit`; overview returns `debtSplit` instead of `forecast.outstandingReceivable` / `debtorExposure` |
| `client/src/components/payments/payments-overview.tsx` | «Qarzdorlik» block shows the two numbers |
| `server/src/dashboard/dashboard-summary.service.ts`, `client/src/components/dashboard/home-money-cards.tsx` | Home card |
| `server/src/payments/payments-debtors.service.ts`, `client/src/components/payments/debt/debtors-view.tsx`, `client/src/components/outreach/overdue-promises-banner.tsx` | Qarzdorlik page cards, outreach banner |
| `server/src/telegram-groups/telegram-group-daily-report.service.ts`, `daily-snapshot.service.ts`, `telegram-group-stats.service.ts`, `telegram-group-report-menu.service.ts` | Telegram surfaces and the snapshot |
| `server/src/reports/reports-excel.workbook-input.ts`, `reports-excel.trend-sheets.ts` | Excel «Filiallar» |
| `docs/adr/0059-*.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `client/CLAUDE.md` | Decision record |

---

### Task 1: The split — one server source

**Files:**
- Create: `server/src/reports/debt-split.ts`, `server/src/reports/debt-split.spec.ts`
- Modify: `server/src/reports/reports-financial.service.ts` (add `getDebtSplit`), `server/src/reports/reports.service.ts` (pass-through)

**Interfaces:**
- Produces:
  - `export interface DebtSplit { studying: { total: number; count: number; currentMonth: number; older: number }; notStudying: { total: number; count: number } }`
  - `ReportsService.getDebtSplit(companyId: number, opts: { branchIds: ReportBranchIds; month?: string }): Promise<DebtSplit>` — `month` defaults to `tashkentMonthKey(new Date())`.

- [ ] **Step 1: Failing tests**

`server/src/reports/debt-split.spec.ts`:

```ts
import { splitDebt, loadDebtSplit } from './debt-split';

describe('splitDebt', () => {
  it('a studying debtor: debt up to this month is «shu oy», the rest «eski»', () => {
    const r = splitDebt({
      studying: [
        { id: 1, balance: -100_000 },
        { id: 2, balance: -600_000 },
      ],
      chargedThisMonth: new Map([
        [1, 450_000],
        [2, 450_000],
      ]),
      notStudying: { sum: -250_000, count: 3 },
    });
    expect(r).toEqual({
      studying: {
        total: 700_000,
        count: 2,
        currentMonth: 100_000 + 450_000,
        older: 150_000,
      },
      notStudying: { total: 250_000, count: 3 },
    });
  });

  it('a studying debtor with no charge this month: all of it is «eski»', () => {
    const r = splitDebt({
      studying: [{ id: 1, balance: -80_000 }],
      chargedThisMonth: new Map(),
      notStudying: { sum: 0, count: 0 },
    });
    expect(r.studying).toEqual({
      total: 80_000,
      count: 1,
      currentMonth: 0,
      older: 80_000,
    });
  });

  it('nobody owes → zeros', () => {
    const r = splitDebt({
      studying: [],
      chargedThisMonth: new Map(),
      notStudying: { sum: null, count: 0 },
    });
    expect(r).toEqual({
      studying: { total: 0, count: 0, currentMonth: 0, older: 0 },
      notStudying: { total: 0, count: 0 },
    });
  });
});

describe('loadDebtSplit', () => {
  it('reads studying debtors by the faol-o‘quvchi rule and everyone else as not studying', async () => {
    const prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([{ id: 5, balance: -300_000 }]),
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { balance: -90_000 }, _count: 2 }),
      },
      enrollmentMonthlyCharge: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ studentId: 5, _sum: { chargedAmount: 450_000 } }]),
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
    expect(prisma.student.aggregate.mock.calls[0][0].where.NOT).toBeDefined();
    expect(r.studying).toEqual({
      total: 300_000,
      count: 1,
      currentMonth: 300_000,
      older: 0,
    });
    expect(r.notStudying).toEqual({ total: 90_000, count: 2 });
  });
});
```

(Adjust the `branches` key in the assertion to whatever key `studentBranchWhere` returns — read `server/src/common/finance/report-branch-scope.ts:85-99`.)

Run (from `server/`): `npx jest src/reports/debt-split.spec.ts` — expected FAIL (module missing).

- [ ] **Step 2: The module**

`server/src/reports/debt-split.ts`:

```ts
import { MonthlyChargeStatus, Prisma } from '@prisma/client';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { tashkentMonthKey } from '../common/date/tashkent';

/**
 * Qarz — ikki alohida raqam, hech qayerda qo'shilmaydi (CEO, 27.09; ADR-0059).
 * «O'qiyotganlar» = faol o'quvchi ta'rifi (ADR-0015): statusi ACTIVE va faol
 * guruhda faol yozuvi bor. Guruhsiz, muzlatilgan, ketgan — «O'qimayotganlar».
 * Arxivdagi karta (deletedAt) hech qayerda sanalmaydi.
 */
export interface DebtSplit {
  studying: {
    total: number;
    count: number;
    /** 🟡 qarzning shu oy hisobigacha bo'lgan qismi. */
    currentMonth: number;
    /** 🔴 qolgani. */
    older: number;
  };
  notStudying: { total: number; count: number };
}

/** Pure. `shuOy = min(qarz, shu oyning hisoblari)`, `eski = qarz − shuOy`. */
export function splitDebt(input: {
  studying: readonly { id: number; balance: number }[];
  chargedThisMonth: ReadonlyMap<number, number>;
  notStudying: { sum: number | null; count: number };
}): DebtSplit {
  let total = 0;
  let currentMonth = 0;
  for (const s of input.studying) {
    const debt = Math.max(0, -s.balance);
    total += debt;
    currentMonth += Math.min(debt, input.chargedThisMonth.get(s.id) ?? 0);
  }
  return {
    studying: {
      total,
      count: input.studying.length,
      currentMonth,
      older: total - currentMonth,
    },
    notStudying: {
      total: Math.max(0, -(input.notStudying.sum ?? 0)),
      count: input.notStudying.count,
    },
  };
}

type DebtSplitDb = {
  student: Pick<Prisma.TransactionClient['student'], 'findMany' | 'aggregate'>;
  enrollmentMonthlyCharge: Pick<
    Prisma.TransactionClient['enrollmentMonthlyCharge'],
    'groupBy'
  >;
};

export async function loadDebtSplit(
  prisma: DebtSplitDb,
  companyId: number,
  opts: { branchIds: ReportBranchIds; month?: string },
): Promise<DebtSplit> {
  const month = opts.month ?? tashkentMonthKey(new Date());
  const [y, m] = month.split('-').map(Number);
  const debtors: Prisma.StudentWhereInput = {
    companyId,
    deletedAt: null,
    balance: { lt: 0 },
    ...studentBranchWhere(opts.branchIds),
  };
  const [studying, notStudying] = await Promise.all([
    prisma.student.findMany({
      where: { ...debtors, ...activeStudentWhere() },
      select: { id: true, balance: true },
    }),
    prisma.student.aggregate({
      where: { ...debtors, NOT: activeStudentWhere() },
      _sum: { balance: true },
      _count: true,
    }),
  ]);
  const charges =
    studying.length === 0
      ? []
      : await prisma.enrollmentMonthlyCharge.groupBy({
          by: ['studentId'],
          where: {
            companyId,
            studentId: { in: studying.map((s) => s.id) },
            periodYear: y,
            periodMonth: m,
            status: MonthlyChargeStatus.CHARGED,
          },
          _sum: { chargedAmount: true },
        });
  return splitDebt({
    studying,
    chargedThisMonth: new Map(
      charges.map((c) => [c.studentId, c._sum.chargedAmount ?? 0]),
    ),
    notStudying: { sum: notStudying._sum.balance, count: notStudying._count },
  });
}
```

If `studentBranchWhere` returns a key that collides with a key of `activeStudentWhere()` (both may use `enrollments`), merge them under `AND: [...]` instead of spreading.

- [ ] **Step 3: Wire and run**

`ReportsFinancialService.getDebtSplit(companyId, opts)` → `loadDebtSplit(this.prisma, companyId, opts)`; `ReportsService.getDebtSplit` delegates. Run `npx jest src/reports/debt-split.spec.ts src/students/shared/active-student-policy.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`. Both new `prisma.student` reads use `activeStudentWhere()`, so the policy should accept them; if it asks for registration, add them the way its existing entries are written.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/reports/debt-split.ts src/reports/debt-split.spec.ts src/reports/reports-financial.service.ts src/reports/reports.service.ts
npm run typecheck && npx eslint src/reports
git add server/src/reports server/src/students/shared
git commit -m "feat(qarz): qarz ikki raqam — o'qiyotganlar (shu oy/eski) va o'qimayotganlar (A2.4)"
```

---

### Task 2: Moliya overview and «💰 Moliyaviy xulosa»

**Files:**
- Modify: `server/src/reports/reports-financial.service.ts:225-241, 314-322, 405-419` (delete the status-ACTIVE receivable, `debtorExposure`, top-level `debtorCount`)
- Modify: `server/src/reports/reports.service.ts` (`getFinancialOverview` adds `debtSplit`)
- Modify: `client/src/components/payments/payments-overview.tsx:550-590` («Qarzdorlik» block) and its data type
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts:313`
- Test: `reports-financial.service.spec.ts`, the facade spec, `reports.controller.spec.ts` (redaction), `telegram-group-report-menu.service.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getDebtSplit` (Task 1).
- Produces: `GET /reports/financial-overview` → `debtSplit: DebtSplit` (CEO/BD only; stripped for Administrator/Cashier like every money field). `forecast.outstandingReceivable`, `forecast.debtorExposure` and the top-level `debtorCount` are removed.

- [ ] **Step 1: Find every reader before deleting**

Run `grep -rn "outstandingReceivable\|debtorExposure\|\.debtorCount" server/src client/src server/scripts --include='*.ts' --include='*.tsx'`. Every reader is switched to `debtSplit` in this task or a later one of this plan; list any reader not named in this plan in your report and switch it the same way (studying total and count where it meant "debtors").

- [ ] **Step 2: Failing tests, then server**

Facade spec: `getFinancialOverview` returns `debtSplit` equal to the mocked `getDebtSplit` result, called with the overview's `branchIds`. Controller spec: the Administrator/Cashier payload has no `debtSplit`. Then delete the receivable/count queries listed above from the raw service, add `debtSplit` in the facade (in the same `Promise.all` as Task 1 of plan 1), and update fixtures.

- [ ] **Step 3: Client block**

Replace the «Qarzdorlik» block (cPO:550-590: «Bugungi holat», «Jami qarz», «Qarzdor o'quvchilar», «O'rtacha qarz») with:
- title «Qarzdorlik», subtitle «Bugungi holat»;
- row «O'qiyotganlar qarzi»: `formatPrice(debtSplit.studying.total)` so'm and `(${count} ta)`; under it a small muted line: `🟡 shu oy ${formatPrice(currentMonth)} · 🔴 eski qarz ${formatPrice(older)}`; tooltip «Faol guruhda o'qiyotgan o'quvchilarning qarzi. Shu oy — qarzning shu oy hisobigacha bo'lgan qismi, eski qarz — qolgani.»;
- row «O'qimayotganlar qarzi»: total and `(${count} ta)`; tooltip «Guruhsiz, muzlatilgan va ketgan o'quvchilarning qarzi. O'qiyotganlar qarziga qo'shilmaydi.»;
- the block keeps linking to `/payments/debt` the way it does today.

No «O'rtacha qarz», no combined total.

- [ ] **Step 4: «💰 Moliyaviy xulosa»**

Replace `• Qarzdorlar: N ta — X` (TRM:313) with two lines from `reportsService.getDebtSplit(companyId, { branchIds })`:

```
• O'qiyotganlar qarzi: <b>N ta — X</b> (shu oy Y · eski Z)
• O'qimayotganlar qarzi: <b>M ta — W</b>
```

(use the card's own `formatSum`). Test it in `telegram-group-report-menu.service.spec.ts`.

- [ ] **Step 5: Checks and commit**

Server: `npx jest src/reports src/telegram-groups && npm run typecheck && npx eslint src/reports src/telegram-groups`. Client: `npx tsc --noEmit && npx eslint src/components/payments && npx vitest run src/components/payments`.

```bash
git add server/src client/src/components/payments
git commit -m "feat(moliya): Qarzdorlik bloki ikki raqam — o'qiyotganlar va o'qimayotganlar (A2.4)"
```

---

### Task 3: Bosh sahifa card, Qarzdorlik page cards, outreach banner

**Files:**
- Modify: `server/src/dashboard/dashboard-summary.service.ts:147-178` (`money.debt`) + types (server and client)
- Modify: `client/src/components/dashboard/home-money-cards.tsx:85-95`
- Modify: `server/src/payments/payments-debtors.service.ts:369-424` (`getDebtorSummary` adds `split`), `server/src/payments/payments.controller.ts:168-180` if the response type is declared there
- Modify: `client/src/components/payments/debt/debtors-view.tsx:185-215`
- Modify: `client/src/components/outreach/overdue-promises-banner.tsx:35-61`
- Test: `dashboard-summary.service.spec.ts`, `payments-debtors` spec

**Interfaces:**
- Consumes: `ReportsService.getDebtSplit` (Task 1). `PaymentsDebtorsService` is in the payments module — inject the reports facade only if the module graph allows it without a cycle; otherwise call `loadDebtSplit(this.prisma, companyId, { branchIds })` directly (it takes a Prisma client) — prefer that, it adds no module dependency.
- Produces: `money.debt` becomes `{ studying: { total; count; currentMonth; older }; notStudying: { total; count } }` (the `DebtSplit`); `GET /payments/debtors/summary` gains `split: DebtSplit` and drops `avgDebt`.

- [ ] **Step 1: Failing tests**

Dashboard spec: `money.debt` equals the split for the caller's scope (mock `getDebtSplit`). Debtors spec: `getDebtorSummary` returns `split` from `loadDebtSplit` with the same `branchIds` its list uses, and an empty scope returns a zero split.

- [ ] **Step 2: Server**

Dashboard: replace `getDebtorSummary('all')`-based `money.debt` with `getDebtSplit(companyId, { branchIds })` (the same scope `buildMoney` already uses for the overview). Debtors summary: add `split` (empty scope → `splitDebt` of nothing), remove `avgDebt` and `totalDebt`; keep `debtorCount` only if the list's pagination or another reader needs it (grep first), keep the promise counts.

- [ ] **Step 3: Client**

- Home card (home-money-cards.tsx:85-95): label «O'qiyotganlar qarzi», value `money.debt.studying.total`, hint `${formatNumber(studying.count)} ta · o'qimayotganlar ${formatPrice(notStudying.total)}`, tooltip «Faol guruhda o'qiyotganlarning qarzi. O'qimayotganlar (guruhsiz, muzlatilgan, ketgan) qarzi alohida, qo'shilmaydi.», red when > 0, link `/payments/debt`.
- Qarzdorlik page (debtors-view.tsx:185-215): replace «Jami qarz», «Qarzdorlar soni», «O'rtacha qarz» with two cards: «O'qiyotganlar qarzi» (total, `N ta`, line `🟡 shu oy … · 🔴 eski qarz …`) and «O'qimayotganlar qarzi» (total, `N ta`). Keep the promise card(s). The cards describe the whole branch scope; the list under them keeps its filters — add the line «Ro'yxat filtrlari bu kartalarga ta'sir qilmaydi» under the cards.
- Outreach banner: «Jami qarz X» → «O'qiyotganlar qarzi X» from `split.studying.total`.

Client checks: `npx tsc --noEmit && npx eslint src/components/dashboard src/components/payments src/components/outreach && npx vitest run src/components`.

- [ ] **Step 4: Commit**

```bash
git add server/src client/src/components
git commit -m "feat(qarz): bosh sahifa, Qarzdorlik sahifasi va Aloqa markazi — qarz ikki raqam (A2.4)"
```

---

### Task 4: Telegram 21:00, the daily snapshot, `/qarzdorlar`, `/stats`

**Files:**
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts:270-280, 386-387, 474-479, 620-634`
- Modify: `server/src/telegram-groups/daily-snapshot.service.ts:72-82, 113-115`
- Modify: `server/src/telegram-groups/telegram-group-stats.service.ts:217-266, 312-418`
- Test: the three services' specs

- [ ] **Step 1: Failing tests**

Daily report with `getDebtSplit` mocked to `studying { total 43_500_000, count 237, currentMonth 41_100_000, older 2_400_000 }, notStudying { total 40_600_000, count 327 }` and yesterday's snapshot `totalDebt 43_000_000, debtorCount 235`:

```
• O'qiyotganlar qarzi: 237 ta — <b>43 500 000 so'm</b> (bugun ▲ 500 000 so'm · +2)
   🟡 shu oy 41 100 000 so'm · 🔴 eski qarz 2 400 000 so'm
• O'qimayotganlar qarzi: 327 ta — <b>40 600 000 so'm</b>
```

(build the expected strings with the file's own `formatSum`/delta helpers — read how today's line is formatted at :474-479 and keep that exact shape for the first line). The snapshot written by both writers carries `totalDebt = studying.total`, `debtorCount = studying.count`. `/qarzdorlar` prints both totals and lists the five largest STUDYING debtors; `/stats` prints both lines.

- [ ] **Step 2: Implement**

- Daily report: replace the status-ACTIVE debt query (:270-280) with `getDebtSplit(companyId, { branchIds })` (the scope the report already uses); render the three lines; the ▲/▼ delta and the 🟡 light threshold (≥ 500 000 growth, :73, :715-720) compare the STUDYING total and count with yesterday's snapshot.
- `DailySnapshotService` (:72-82): write `totalDebt/debtorCount` from the same `getDebtSplit` — the two writers of one row must agree (server/CLAUDE.md «The daily snapshot is the one record that cannot be rebuilt»).
- Stats service: `/qarzdorlar` — «O'qiyotganlar qarzi: N ta — X», «O'qimayotganlar qarzi: M ta — W», then «Eng katta 5 ta qarzdor (o'qiyotganlar)» from a `findMany` with `activeStudentWhere()` ordered by `balance asc`, `take: 5`; `/stats` — the two lines instead of «Qarzdorlar: N ta · X».

- [ ] **Step 3: Known one-day effect**

The snapshot's meaning moves from "status ACTIVE" to "studying" (ungrouped ACTIVE students leave it). On the first evening after deploy the ▲/▼ line compares against a snapshot written under the old rule and shows a drop that is a definition change, not money. Write this in the PR body and the ADR; no code works around it.

- [ ] **Step 4: Format, lint, test, commit**

```bash
npx prettier --write src/telegram-groups/*.ts
npx eslint src/telegram-groups --quiet && npx jest src/telegram-groups
git add server/src/telegram-groups
git commit -m "feat(telegram): kunlik hisobot, /qarzdorlar va /stats — qarz ikki raqam (A2.4)"
```

---

### Task 5: Excel «Filiallar»

**Files:**
- Modify: `server/src/reports/reports-excel.workbook-input.ts:349, 382`, `server/src/reports/reports-excel.trend-sheets.ts:195`
- Test: `reports-excel.service.spec.ts`

- [ ] **Step 1: Failing test, then implement**

The «Filiallar» sheet's debt column reads `getDebtSplit(companyId, { branchIds: [branchId] }).studying.total` per branch (today: `getDebtors` with the ACTIVE status filter), and its header is «O'qiyotganlar qarzi (hozir)». Assert both in the spec, then implement. No new column: the sheet's columns are approved (ADR-0055).

Left as they are, and named in the ADR: «Oylar» `closingDebt` (a month-end reconstruction for past months, by status at the time), the opt-in «Balans» / «Tekshiruv» / «Qarzdorlar» sheets (an accounting receivable is the whole debt; the reconciliation ties it).

- [ ] **Step 2: Commit**

```bash
npx prettier --write src/reports/reports-excel*.ts
npx jest src/reports/reports-excel && npm run typecheck
git add server/src/reports
git commit -m "fix(excel): «Filiallar» varag'ida o'qiyotganlar qarzi (A2.4)"
```

---

### Task 6: ADR-0059, docs, full checks

- [ ] **Step 1: ADR-0059 (Uzbek)** — `docs/adr/0059-qarz-ikki-alohida-raqam.md`. Kontekst: 27 places showed debt under three definitions (status-ACTIVE only; every status summed; other scopes), none in two numbers. Qaror: the two definitions above (with ADR-0015's «faol o'quvchi»), the surfaces changed in this plan, «O'rtacha qarz» removed, archived counted nowhere. Unchanged on purpose: «Oylik qarzdorlik» tab tiles (status-based history; the Qarzdorlik page rebuild, B, reworks it), the students page debtor count, `/payments/pending`, the group attendance panel, teacher payment reports, departed-students report, «Foyda tarkibi» warning, salary centre top-up figures, Excel «Oylar»/«Balans»/«Tekshiruv»/«Qarzdorlar», the manual `build-debt-telegram-report` script. Oqibatlari: the snapshot's meaning changes once (Task 4 Step 3). Taqiqlanadi: summing the two numbers anywhere; computing the split anywhere but `debt-split.ts`. Add the README row.

- [ ] **Step 2: Docs** — `server/CLAUDE.md`: a «Debt as two numbers (ADR-0059)» paragraph under Reports Module, and the 21:00 report paragraph's debt line. `client/CLAUDE.md`: the `/payments/debt` row (cards) and `/payments/overview` row (Qarzdorlik block).

- [ ] **Step 3: Full checks** — server `npx prisma generate && npm run typecheck && npx eslint src && npx jest`, then `npm run build`; client `npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`.

- [ ] **Step 4: Commit, merge `origin/main`, stop for the user**

```bash
git add docs/adr server/CLAUDE.md client/CLAUDE.md
git commit -m "docs: ADR-0059 — qarz ikki alohida raqam"
git fetch origin && git merge origin/main
```

Re-run Step 3 if the merge brought changes. PR, merge and deploy wait for the user.
