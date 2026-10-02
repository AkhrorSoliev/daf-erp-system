# Balance Withdrawal as Revenue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a «Yechib olish» (balance withdrawal) count as revenue of the month it is made, in every net-profit surface, and stop the admin from choosing any other month.

**Architecture:** The server books every withdrawal in the current Tashkent month (one `now` drives the ledger timestamp, `metadata.targetMonth` and the teacher accrual date). A new loader `loadBalanceWithdrawals` (own file, `server/src/reports/balance-withdrawals.ts`) reads `BALANCE_WITHDRAWAL` rows by `createdAt` over whole months, branch-scoped; `ReportsFinancialService` and the `ReportsService` facade expose it. `buildNetProfit` gains one leg, `balanceWithdrawals`, added beside `revenue` (never folded into it, because the month-end expectation, the collection ratio and the «Foyda tarkibi» forecast read `revenue` as lesson value). Surfaces that itemise the figure show the new line only when it is non-zero.

**Tech Stack:** NestJS 11 + Prisma 7 + Jest (server), Next.js 16 + React 19 + Vitest (client), exceljs.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-30-yechib-olish-daromad-design.md` (CEO approved 30.09.2026: revenue yes, current month only, "Ha, boshlang").
- Worktree: `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/goofy-wing-7076af`, branch `claude/goofy-wing-7076af`. Never `cd` outside it. `SCRATCH=/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system--claude-worktrees-goofy-wing-7076af/0a5e4b88-6c58-41ca-a348-5549451e2813/scratchpad`.
- Server tests: `cd server && npx jest <path>`. Client tests: `cd client && npx vitest --config vitest.config.mts run <path>` (client needs `npm ci` once).
- UI text: Uzbek, Latin script only, no English words on screen. New code comments, commit messages and the PR: English.
- Server: run `npx prettier --write` on every touched `.ts`. Client: do NOT run Prettier (no config there).
- Do not grow a file past 500 lines with new logic: new logic goes to a new file; files already over 500 (`reports-financial.service.ts`, `reports.service.ts`) get delegation lines only.
- Date bounds through `server/src/common/date/tashkent.ts` only (`tashkentMonthKey`, `tashkentMonthRangeUtc`, `tashkentDateStr`, `utcMidnightFromDateStr`).
- ADR number: 0055 (0054 is taken by `feat/davomat-olinmagan-dars`). Re-check `origin/main:docs/adr/` before the PR.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: The server books a withdrawal in the current month

**Files:**
- Modify: `server/src/withdrawals/dto/create-withdrawal.dto.ts:22-32`
- Modify: `server/src/withdrawals/withdrawals.service.ts` (imports, `create` docstring, lines 105-248)
- Test: `server/src/withdrawals/withdrawals.service.spec.ts`

**Interfaces:**
- Produces: `CreateWithdrawalDto.targetMonth?: string` (optional, deprecated). `WithdrawalsService.create` always writes `metadata.targetMonth = tashkentMonthKey(now)`, `Transaction.createdAt = now`, accrual `lessonDate = utcMidnightFromDateStr(tashkentDateStr(now))`; returns `targetMonth` = that month. Any other `targetMonth` → `BadRequestException('Yechib olish faqat joriy oy uchun yoziladi')`.

- [ ] **Step 1: Update the spec — drop the client month from existing calls, add the month rules**

In every existing `service.create({...})` call of `withdrawals.service.spec.ts`, delete the `targetMonth: '2026-..',` line (six calls). Then append this block before the file's final `});`:

```ts
  describe('create — the month is always the current one (ADR-0055)', () => {
    // 30.09.2026 20:00 UTC is already 01.10.2026 01:00 in Tashkent.
    const now = new Date('2026-09-30T20:00:00.000Z');
    beforeEach(() => jest.useFakeTimers().setSystemTime(now));
    afterEach(() => jest.useRealTimers());

    it('books the withdrawal in the current Tashkent month and stamps that instant', async () => {
      const result = await service.create(
        { studentId: 10001, amount: 200_000, creditTeacher: false },
        7,
        1,
      );
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          createdAt: now,
          description: 'Yechib olish (2026-10)',
          metadata: expect.objectContaining({ targetMonth: '2026-10' }),
        }),
      });
      expect(result.targetMonth).toBe('2026-10');
    });

    it('accepts the current month from a dialog opened before the deploy', async () => {
      const result = await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          targetMonth: '2026-10',
          creditTeacher: false,
        },
        7,
        1,
      );
      expect(result.targetMonth).toBe('2026-10');
    });

    it('refuses any other month and writes nothing', async () => {
      await expect(
        service.create(
          {
            studentId: 10001,
            amount: 200_000,
            targetMonth: '2026-08',
            creditTeacher: false,
          },
          7,
          1,
        ),
      ).rejects.toThrow('Yechib olish faqat joriy oy uchun yoziladi');
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it("dates the teacher's accrual the day of the withdrawal, inside the open payroll period", async () => {
      await service.create(
        {
          studentId: 10001,
          amount: 200_000,
          creditTeacher: true,
          teacherUserId: 99,
        },
        7,
        1,
      );
      expect(prisma.salaryAccrual.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          lessonDate: new Date('2026-10-01T00:00:00.000Z'),
        }),
      });
    });
  });
```

- [ ] **Step 2: Run the spec — expect failures**

Run: `cd server && npx jest src/withdrawals/withdrawals.service.spec.ts`
Expected: FAIL — TS error "Property 'targetMonth' is missing" on the calls without it, and the new month tests fail.

- [ ] **Step 3: Make `targetMonth` optional in the DTO**

Replace lines 22-32 of `create-withdrawal.dto.ts` with:

```ts
  // Deprecated: the server books a withdrawal in the current Tashkent month
  // (ADR-0055). Still accepted so a dialog opened before a deploy keeps
  // working; any other month is refused by `WithdrawalsService.create`.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy formati noto'g'ri (kerak: YYYY-MM)",
  })
  targetMonth?: string;

  // When true, also credits the chosen teacher's salary for the current
  // month by writing a SalaryAccrual linked to the BALANCE_WITHDRAWAL
  // transaction.
  @IsBoolean()
  creditTeacher: boolean;
```

- [ ] **Step 4: Derive the month on the server**

In `withdrawals.service.ts` add the import:

```ts
import {
  tashkentDateStr,
  tashkentMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';
```

Replace the `create` docstring (lines 96-104) with:

```ts
  /**
   * Drain a portion of the student's positive balance into the centre's
   * account. The amount is revenue of the month it is withdrawn in — always
   * the current Tashkent month, never one the client picks (ADR-0055): the
   * canonical net profit adds it as its own leg (`loadBalanceWithdrawals`),
   * so a past month's figure never moves after the fact. Optionally credits
   * the teacher's salary with a SalaryAccrual linked to the new
   * BALANCE_WITHDRAWAL transaction (attendanceId is NULL — there's no
   * underlying lesson), dated the day of the withdrawal so it lands in the
   * open payroll period.
   *
   * All writes happen in one Serializable transaction.
   */
```

Right after the `assertCallerMayWriteForStudent(...)` call insert:

```ts
    // One instant decides the month, the ledger timestamp and the teacher's
    // accrual date, so the report and the payroll can never file this
    // withdrawal under two different months.
    const now = new Date();
    const targetMonth = tashkentMonthKey(now);
    if (dto.targetMonth !== undefined && dto.targetMonth !== targetMonth) {
      throw new BadRequestException(
        'Yechib olish faqat joriy oy uchun yoziladi',
      );
    }
```

Replace `const targetMonthDate = new Date(\`${dto.targetMonth}-01T00:00:00.000Z\`);` with:

```ts
    const accrualDate = utcMidnightFromDateStr(tashkentDateStr(now));
```

In `tx.transaction.create({ data: {...} })`: add `createdAt: now,` after `performedById: userId,`; change the description to ``dto.reason ?? `Yechib olish (${targetMonth})` ``; in `metadata` change `targetMonth: dto.targetMonth,` to `targetMonth,`.
In `tx.salaryAccrual.create`: `lessonDate: accrualDate,`.
In the history `newValues`: `oy: targetMonth,`.
In the returned object: `targetMonth,`.

- [ ] **Step 5: Run the spec — expect pass**

Run: `cd server && npx jest src/withdrawals`
Expected: PASS (all withdrawals specs, controller spec included).

- [ ] **Step 6: Format and commit**

```bash
cd server && npx prettier --write src/withdrawals/dto/create-withdrawal.dto.ts src/withdrawals/withdrawals.service.ts src/withdrawals/withdrawals.service.spec.ts
cd .. && git add server/src/withdrawals
git commit -m "fix(withdrawals): book a withdrawal in the current Tashkent month

The client no longer chooses the month. One instant drives the ledger
timestamp, metadata.targetMonth and the teacher accrual date (the
withdrawal day, always inside the open payroll period); any other month
is refused (ADR-0055).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: A loader for the month's withdrawals

**Files:**
- Create: `server/src/reports/balance-withdrawals.ts`
- Create: `server/src/reports/balance-withdrawals.spec.ts`
- Modify: `server/src/reports/reports-financial.service.ts` (one method + one import)
- Modify: `server/src/reports/reports.service.ts` (one facade method + one import)
- Test: `server/src/reports/reports-branch-scope-coverage.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface BalanceWithdrawals {
    total: number;            // Σ withdrawn, so'm, positive
    teacherCredited: number;  // the part also credited to a teacher's salary
    students: { studentId: number; name: string; amount: number }[]; // largest first
  }
  export const NO_BALANCE_WITHDRAWALS: BalanceWithdrawals;
  export function loadBalanceWithdrawals(
    prisma: Pick<Prisma.TransactionClient, 'transaction'>,
    companyId: number,
    opts: { months: string[]; branchIds: ReportBranchIds },
  ): Promise<BalanceWithdrawals>;
  // ReportsFinancialService.getBalanceWithdrawals(companyId, opts) and
  // ReportsService.getBalanceWithdrawals(companyId, opts) — same signature.
  ```

- [ ] **Step 1: Write the failing loader spec**

Create `server/src/reports/balance-withdrawals.spec.ts`:

```ts
import { loadBalanceWithdrawals } from './balance-withdrawals';

describe('loadBalanceWithdrawals', () => {
  let prisma: any;
  beforeEach(() => {
    prisma = { transaction: { findMany: jest.fn().mockResolvedValue([]) } };
  });

  it('sums what was withdrawn, splits the teacher credit and groups by student', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        studentId: 10001,
        amount: -200_000,
        metadata: { creditTeacher: true },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
      {
        studentId: 10002,
        amount: -50_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Vali', lastName: 'Aliyev' },
      },
      {
        studentId: 10002,
        amount: -300_000,
        metadata: null,
        student: { firstName: 'Vali', lastName: 'Aliyev' },
      },
    ]);

    const r = await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-10'],
      branchIds: null,
    });

    expect(r).toEqual({
      total: 550_000,
      teacherCredited: 200_000,
      students: [
        { studentId: 10002, name: 'Vali Aliyev', amount: 350_000 },
        { studentId: 10001, name: 'Ali Valiyev', amount: 200_000 },
      ],
    });
  });

  it('reads whole Tashkent months by createdAt, scoped to the branch', async () => {
    await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-09', '2026-10'],
      branchIds: [2],
    });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 1001,
        type: 'BALANCE_WITHDRAWAL',
        createdAt: {
          gte: new Date('2026-08-31T19:00:00.000Z'),
          lt: new Date('2026-10-31T19:00:00.000Z'),
        },
        branchId: { in: [2] },
      },
      select: {
        studentId: true,
        amount: true,
        metadata: true,
        student: { select: { firstName: true, lastName: true } },
      },
    });
  });

  it('nets a reversal pair to nothing and drops the student', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([
      {
        studentId: 10001,
        amount: -200_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
      {
        studentId: 10001,
        amount: 200_000,
        metadata: { creditTeacher: false },
        student: { firstName: 'Ali', lastName: 'Valiyev' },
      },
    ]);

    const r = await loadBalanceWithdrawals(prisma, 1001, {
      months: ['2026-10'],
      branchIds: null,
    });

    expect(r).toEqual({ total: 0, teacherCredited: 0, students: [] });
  });

  it('reads nothing for an empty scope or no months', async () => {
    const none = { total: 0, teacherCredited: 0, students: [] };
    await expect(
      loadBalanceWithdrawals(prisma, 1001, { months: ['2026-10'], branchIds: [] }),
    ).resolves.toEqual(none);
    await expect(
      loadBalanceWithdrawals(prisma, 1001, { months: [], branchIds: null }),
    ).resolves.toEqual(none);
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `cd server && npx jest src/reports/balance-withdrawals.spec.ts`
Expected: FAIL with "Cannot find module './balance-withdrawals'".

- [ ] **Step 3: Write the loader**

Create `server/src/reports/balance-withdrawals.ts`:

```ts
import { Prisma, TransactionType } from '@prisma/client';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import {
  branchIdWhere,
  isEmptyScope,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

/**
 * «Yechib olish» as a revenue leg of the net profit (ADR-0055).
 *
 * A withdrawal moves a student's prepaid money into the centre's account.
 * The cash was counted as «Tushum» the day the student paid; what changes
 * now is that the money stops being the student's, so the month it is
 * withdrawn in earns it. The lesson-value revenue (`valueHeldLessons`) never
 * sees it — no lesson was held for it — so it is read here and added beside
 * that revenue, never folded into it.
 *
 * Keyed by `createdAt`: since ADR-0055 a withdrawal is always booked in the
 * current Tashkent month, so the row's own timestamp IS its month. Signed:
 * a withdrawal is negative on the student ledger, and a counter-row, should
 * one ever be written, nets it out in the month the correction was made.
 */
export interface BalanceWithdrawals {
  /** Σ withdrawn over the window, so'm. */
  total: number;
  /** The part that was also credited to a teacher's salary. */
  teacherCredited: number;
  /** Per student, largest first; a student whose rows net to 0 is dropped. */
  students: { studentId: number; name: string; amount: number }[];
}

export const NO_BALANCE_WITHDRAWALS: BalanceWithdrawals = {
  total: 0,
  teacherCredited: 0,
  students: [],
};

/** `months` is a contiguous, whole-month window ('YYYY-MM'). */
export async function loadBalanceWithdrawals(
  prisma: Pick<Prisma.TransactionClient, 'transaction'>,
  companyId: number,
  { months, branchIds }: { months: string[]; branchIds: ReportBranchIds },
): Promise<BalanceWithdrawals> {
  if (months.length === 0 || isEmptyScope(branchIds)) {
    return NO_BALANCE_WITHDRAWALS;
  }
  const sorted = [...months].sort();
  const rows = await prisma.transaction.findMany({
    where: {
      companyId,
      type: TransactionType.BALANCE_WITHDRAWAL,
      createdAt: {
        gte: tashkentMonthRangeUtc(sorted[0]).gte,
        lt: tashkentMonthRangeUtc(sorted[sorted.length - 1]).lt,
      },
      ...branchIdWhere(branchIds),
    },
    select: {
      studentId: true,
      amount: true,
      metadata: true,
      student: { select: { firstName: true, lastName: true } },
    },
  });

  let total = 0;
  let teacherCredited = 0;
  const byStudent = new Map<number, { name: string; amount: number }>();
  for (const r of rows) {
    const withdrawn = -r.amount;
    total += withdrawn;
    const meta = r.metadata as { creditTeacher?: boolean } | null;
    if (meta?.creditTeacher === true) teacherCredited += withdrawn;
    if (r.studentId == null) continue;
    const entry = byStudent.get(r.studentId) ?? {
      name: `${r.student?.firstName ?? ''} ${r.student?.lastName ?? ''}`.trim(),
      amount: 0,
    };
    entry.amount += withdrawn;
    byStudent.set(r.studentId, entry);
  }

  return {
    total,
    teacherCredited,
    students: [...byStudent]
      .map(([studentId, s]) => ({ studentId, name: s.name, amount: s.amount }))
      .filter((s) => s.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}
```

- [ ] **Step 4: Run the loader spec — expect pass**

Run: `cd server && npx jest src/reports/balance-withdrawals.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Expose it on the two services and guard its branch scope**

`reports-financial.service.ts` — add the import next to the other `./` imports:

```ts
import {
  loadBalanceWithdrawals,
  type BalanceWithdrawals,
} from './balance-withdrawals';
```

and this method right after `getRecognizedRevenue`:

```ts
  /** «Yechib olish» over whole months — the net profit's withdrawal leg. */
  getBalanceWithdrawals(
    companyId: number,
    opts: { months: string[]; branchIds: ReportBranchIds },
  ): Promise<BalanceWithdrawals> {
    return loadBalanceWithdrawals(this.prisma, companyId, opts);
  }
```

`reports.service.ts` — right after the facade's `getRecognizedRevenue` (line ~141):

```ts
  // «Yechib olish» — revenue of the month it is withdrawn in (ADR-0055).
  getBalanceWithdrawals(
    companyId: number,
    opts: { months: string[]; branchIds: ReportBranchIds },
  ) {
    return this.financial.getBalanceWithdrawals(companyId, opts);
  }
```

`reports-branch-scope-coverage.spec.ts` — inside `describe('branch scope coverage', ...)`, after the `getPeriodOutflows` test:

```ts
  it('getBalanceWithdrawals scopes the withdrawal leg', async () => {
    await service.getBalanceWithdrawals(1, {
      months: ['2026-05'],
      branchIds: [2],
    });

    const wheres = everyWhereClause();
    expect(wheres.length).toBe(1);
    expect(wheres.filter((c) => !hasBranchPredicate(c.where))).toEqual([]);
  });
```

- [ ] **Step 6: Run the report specs — expect pass**

Run: `cd server && npx jest src/reports/balance-withdrawals.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
cd server && npx prettier --write src/reports/balance-withdrawals.ts src/reports/balance-withdrawals.spec.ts src/reports/reports-financial.service.ts src/reports/reports.service.ts src/reports/reports-branch-scope-coverage.spec.ts
cd .. && git add server/src/reports
git commit -m "feat(reports): load the month's balance withdrawals as a revenue leg

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The canonical net profit adds the leg

**Files:**
- Modify: `server/src/reports/reports-excel.helpers.ts:114-230` (`NetProfit`, `buildNetProfit`)
- Modify: `server/src/reports/reports.service.ts:184-242` (`assembleMonthlyNetProfit`)
- Modify: `server/src/reports/net-profit-cache.ts:24-32`
- Test: `server/src/reports/reports-excel.helpers.spec.ts`, `server/src/reports/reports.service.spec.ts`, `server/src/reports/net-profit-cache.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getBalanceWithdrawals` (Task 2).
- Produces: `NetProfit.balanceWithdrawals: number`; `buildNetProfit(pl, salaries, outflows, month?, recognizedRevenue?, balanceWithdrawals = 0)`; `assembleMonthlyNetProfit(...)` returns `{ month, lessons, salaries, profitLoss, outflows, withdrawals: BalanceWithdrawals, netProfit }`.

- [ ] **Step 1: Write the failing `buildNetProfit` tests**

Append to `reports-excel.helpers.spec.ts`:

```ts
/**
 * «Yechib olish» is revenue of the month it is made (ADR-0055): its own leg
 * beside the lesson value, never folded into it.
 */
describe('buildNetProfit — balance withdrawals', () => {
  const pl = {
    revenue: { total: 100_000 },
    costOfServices: { teacherSalaries: 0, teacherAdvances: 0 },
    operatingExpenses: { adminSalaries: 0, byCategory: [{ amount: 10_000 }] },
  };
  const salaries = { totals: { covered: 40_000, fullDeserved: 40_000 } };
  const outflows = { refunds: 0, writeOffs: 0, providerFees: 0 };

  it("adds the month's withdrawals to the recognised figure as their own leg", () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-10', 100_000, 30_000);
    expect(np.revenue).toBe(100_000);
    expect(np.balanceWithdrawals).toBe(30_000);
    // 100 000 + 30 000 − 40 000 − 10 000
    expect(np.netProfit).toBe(80_000);
    // Margin over everything the month earned: 80 000 / 130 000.
    expect(np.netMarginPercent).toBe(61.5);
  });

  it('ignores them on the cash basis, where the money counted when it was paid', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-10', undefined, 30_000);
    expect(np.revenueBasis).toBe('cash');
    expect(np.balanceWithdrawals).toBe(0);
    expect(np.netProfit).toBe(50_000);
  });

  it('defaults to none for callers that pass no withdrawals', () => {
    const np = buildNetProfit(pl, salaries, outflows, '2026-10', 100_000);
    expect(np.balanceWithdrawals).toBe(0);
    expect(np.netProfit).toBe(50_000);
  });
});
```

- [ ] **Step 2: Write the failing `assembleMonthlyNetProfit` test**

Add to `reports.service.spec.ts`, before `describe('getOwnMonthProfit', ...)`:

```ts
  describe('assembleMonthlyNetProfit', () => {
    it("adds the month's balance withdrawals as their own leg (ADR-0055)", async () => {
      const svc: any = service;
      jest
        .spyOn(svc.financial, 'valueHeldLessons')
        .mockResolvedValue([{ value: 100_000 }]);
      jest
        .spyOn(svc.financial, 'getPeriodOutflows')
        .mockResolvedValue({ refunds: 0, writeOffs: 0, providerFees: 0 });
      jest.spyOn(svc, 'getSalaryMonthly').mockResolvedValue({
        totals: { covered: 70_000, fullDeserved: 70_000 },
      });
      jest.spyOn(svc, 'getProfitLoss').mockResolvedValue({
        costOfServices: {},
        operatingExpenses: { adminSalaries: 0, byCategory: [] },
      });
      const withdrawals = {
        total: 30_000,
        teacherCredited: 30_000,
        students: [{ studentId: 10001, name: 'Ali Valiyev', amount: 30_000 }],
      };
      const load = jest
        .spyOn(svc, 'getBalanceWithdrawals')
        .mockResolvedValue(withdrawals);

      const out = await svc.assembleMonthlyNetProfit(1001, {
        month: '2026-10',
        branchIds: [1],
        performedById: 10001,
      });

      expect(load).toHaveBeenCalledWith(1001, {
        months: ['2026-10'],
        branchIds: [1],
      });
      expect(out.withdrawals).toBe(withdrawals);
      expect(out.netProfit.balanceWithdrawals).toBe(30_000);
      // 100 000 lessons + 30 000 withdrawn − 70 000 teachers.
      expect(out.netProfit.netProfit).toBe(60_000);
    });
  });
```

In the same file change both `'rpt:np:v3:1001:3,7:u10001:2026-08'` strings to `'rpt:np:v4:1001:3,7:u10001:2026-08'`. In `net-profit-cache.spec.ts` change every `rpt:np:v3:` to `rpt:np:v4:`.

- [ ] **Step 3: Run them — expect failure**

Run: `cd server && npx jest src/reports/reports-excel.helpers.spec.ts src/reports/reports.service.spec.ts src/reports/net-profit-cache.spec.ts`
Expected: FAIL (`balanceWithdrawals` undefined, cache key still v3).

- [ ] **Step 4: Add the leg to `buildNetProfit`**

In `reports-excel.helpers.ts`, `NetProfit`: after `revenueBasis` add

```ts
  /** «Yechib olish» booked in the period — revenue beside `revenue`, which
   *  stays the lesson value (ADR-0055). 0 on the cash basis: that money was
   *  already counted when the student paid it. */
  balanceWithdrawals: number;
```

In the `buildNetProfit` docstring replace the formula block

```
 *   Tushum (COMPLETED to'lovlar)
 *   − Ustoz oyligi (HISOBLANGAN — bu oy earned; the cash is usually paid next
```

with

```
 *   Tushum (COMPLETED to'lovlar)
 *   + Balansdan yechib olingan (ADR-0055 — recognised basis only)
 *   − Ustoz oyligi (HISOBLANGAN — bu oy earned; the cash is usually paid next
```

Change the signature's last parameter line `recognizedRevenue?: number,` to

```ts
  recognizedRevenue?: number,
  balanceWithdrawals = 0,
```

After `const revenue = ...;` add

```ts
  const withdrawn = useRecognized ? balanceWithdrawals : 0;
```

Replace the `netProfit` computation and the returned fields:

```ts
  const netProfit =
    revenue +
    withdrawn -
    teacherSalary -
    adminSalary -
    operatingExpenses -
    refunds;
  const earned = revenue + withdrawn;
  return {
    revenue,
    revenueBasis: useRecognized ? 'recognized' : 'cash',
    balanceWithdrawals: withdrawn,
    teacherSalary,
```

and the margin:

```ts
    netMarginPercent:
      earned > 0 ? Math.round((netProfit / earned) * 1000) / 10 : 0,
```

- [ ] **Step 5: Feed it in `assembleMonthlyNetProfit` and bump the cache**

In `reports.service.ts` `assembleMonthlyNetProfit`, change the `Promise.all` destructuring to
`const [lessons, salaries, profitLoss, outflows, withdrawals] = await Promise.all([`
and add, as the last array element after `this.getPeriodOutflows(companyId, scope),`:

```ts
      // «Yechib olish» — revenue of the month it is withdrawn in (ADR-0055).
      this.getBalanceWithdrawals(companyId, { months: [month], branchIds }),
```

In the returned object add `withdrawals,` after `outflows,`, and pass the leg:

```ts
      netProfit: buildNetProfit(
        profitLoss,
        salaries,
        outflows,
        month,
        recognizedRevenue,
        withdrawals.total,
      ),
```

In `net-profit-cache.ts` append to the version docstring ` v4: balance withdrawals count as revenue of the month they are made (ADR-0055).` and set `const NET_PROFIT_CACHE_VERSION = 'v4';`.

- [ ] **Step 6: Run the specs — expect pass**

Run: `cd server && npx jest src/reports/reports-excel.helpers.spec.ts src/reports/reports.service.spec.ts src/reports/net-profit-cache.spec.ts src/reports/own-month-profit.spec.ts`
Expected: PASS.

- [ ] **Step 7: Format and commit**

```bash
cd server && npx prettier --write src/reports/reports-excel.helpers.ts src/reports/reports-excel.helpers.spec.ts src/reports/reports.service.ts src/reports/reports.service.spec.ts src/reports/net-profit-cache.ts src/reports/net-profit-cache.spec.ts
cd .. && git add server/src/reports
git commit -m "feat(reports): balance withdrawals count in the canonical net profit

The withdrawal leg sits beside the lesson value instead of inside it, so
the month-end expectation, the collection ratio and the forecast keep
reading revenue as lesson value. Cash basis ignores it. Cache key v4.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Excel workbook shows the leg

**Files:**
- Modify: `server/src/reports/reports-excel.workbook-input.ts:58-131` (`periodNetProfit`), `:358-375` (`toBranchRow`)
- Modify: `server/src/reports/reports-excel.summary-sheet.ts` (Block 1, after the «O'tilgan darslar qiymati» row)
- Modify: `server/src/reports/reports-excel.detail-sheets.ts:967-988` (Tekshiruv footing)
- Modify: `server/src/reports/reports-excel.trend-sheets.ts` (`BranchRow`, `branchesSheet` footer)
- Test: `server/src/reports/reports-excel.service.spec.ts`, `server/src/reports/reports-excel.summary-sheet.spec.ts`, `server/src/reports/reports-excel.trend-sheets.spec.ts`

**Interfaces:**
- Consumes: `ReportsService.getBalanceWithdrawals` (Task 2), `NetProfit.balanceWithdrawals` and the 6th `buildNetProfit` argument (Task 3).
- Produces: `BranchRow.balanceWithdrawals: number`.

- [ ] **Step 1: Write the failing workbook tests**

`reports-excel.service.spec.ts`:
- in the `netProfit` constant add `balanceWithdrawals: 0,` after `revenueBasis`;
- in `baseMocks()` add after `getRecognizedRevenue`:
  ```ts
    getBalanceWithdrawals: jest
      .fn()
      .mockResolvedValue({ total: 0, teacherCredited: 0, students: [] }),
  ```
- add after the test `'includes the center top-up (fullDeserved) from 2026-07 on'`:
  ```ts
  it('adds the month\'s balance withdrawals to «Xulosa» and the Tekshiruv footing (ADR-0055)', async () => {
    reports.getBalanceWithdrawals.mockResolvedValue({
      total: 50_000,
      teacherCredited: 0,
      students: [],
    });
    const wb = await buildWorkbook(
      {},
      {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        include: ['buxgalteriya'],
      },
    );
    expect(reports.getBalanceWithdrawals).toHaveBeenCalledWith(1, {
      months: ['2026-06'],
      branchIds: null,
    });

    const xulosa = wb.getWorksheet('Xulosa')!;
    expect(
      findRow(xulosa, '+  Balansdan yechib olingan').getCell(2).value,
    ).toBe(50_000);
    // 290 000 (see the pre-top-up case above) + 50 000 withdrawn.
    expect(findRow(xulosa, '=  SOF FOYDA').getCell(2).value).toBe(340_000);

    const check = wb.getWorksheet('Tekshiruv')!;
    expect(
      findRow(check, '+ Balansdan yechib olingan').getCell(2).value,
    ).toBe(50_000);
    expect(
      cellText(findRow(check, '= Sof foyda (footing)').getCell(5).value),
    ).toBe('MOS');
  });
  ```

`reports-excel.summary-sheet.spec.ts` — add inside `describe('summarySheetV2', ...)`:

```ts
  it('adds a withdrawal row only for a month that has one', () => {
    expect(valueFor(ws, '+  Balansdan yechib olingan')).toBeUndefined();

    const wb = new Workbook();
    summarySheetV2(
      wb,
      input({
        cur: {
          np: np({ balanceWithdrawals: 300_000 }),
          covered: 80_321_275,
          centerFunded: 15_513_272,
          recognized: 173_783_991,
        },
      }),
    );
    expect(
      valueFor(wb.getWorksheet('Xulosa')!, '+  Balansdan yechib olingan'),
    ).toBe(300_000);
  });
```

(`valueFor` returns `undefined` for a label no row carries.)

`reports-excel.trend-sheets.spec.ts` — in the existing `branchesSheet` test add `balanceWithdrawals: 0,` to both rows and, at the end of that test:

```ts
    const footer: string[] = [];
    ws.eachRow((r) => footer.push(cellText(r.getCell(1).value)));
    expect(footer.join('\n')).not.toContain('balansdan yechib olingan');
```

Then add:

```ts
  it('names the branches whose profit includes balance withdrawals', () => {
    const row: BranchRow = {
      branchName: "Farg'ona filiali",
      recognized: 1_000_000,
      balanceWithdrawals: 300_000,
      cashIn: 900_000,
      teacherSalary: 400_000,
      operatingExpenses: 100_000,
      refunds: 0,
      netProfit: 800_000,
      debt: 0,
      inGroup: 10,
    };
    const wb = new Workbook();
    branchesSheet(wb, [row], 'Davr', 'Barcha filiallar');
    const texts: string[] = [];
    wb.getWorksheet('Filiallar')!.eachRow((r) =>
      texts.push(cellText(r.getCell(1).value)),
    );
    expect(texts.join('\n')).toContain(
      `«SOF FOYDA» ichida balansdan yechib olingan pul bor: Farg'ona filiali — ${(300_000).toLocaleString('ru-RU')} so'm.`,
    );
  });
```

- [ ] **Step 2: Run them — expect failure**

Run: `cd server && npx jest src/reports/reports-excel.service.spec.ts src/reports/reports-excel.summary-sheet.spec.ts src/reports/reports-excel.trend-sheets.spec.ts`
Expected: FAIL (rows missing, `balanceWithdrawals` not on `BranchRow`).

- [ ] **Step 3: Feed the workbook's window**

In `periodNetProfit` replace the `revenuePerMonth` block with:

```ts
  const [revenuePerMonth, withdrawals] = await Promise.all([
    Promise.all(
      months.map((m) => {
        const [y, mm] = m.split('-').map(Number);
        return reports.getRecognizedRevenue(companyId, {
          start: new Date(Date.UTC(y, mm - 1, 1)),
          end: new Date(Date.UTC(y, mm, 1)),
          branchIds: args.branchIds,
        });
      }),
    ),
    // «Yechib olish» over the same months (ADR-0055).
    reports.getBalanceWithdrawals(companyId, {
      months,
      branchIds: args.branchIds,
    }),
  ]);
```

and pass `withdrawals.total` as the new last argument of BOTH `buildNetProfit(...)` calls in the function.

In `toBranchRow` add `balanceWithdrawals: own.netProfit.balanceWithdrawals,` after `recognized`.

- [ ] **Step 4: «Xulosa» Block 1 row**

In `reports-excel.summary-sheet.ts` `buildBlock1`, directly after the `compareRow(ws, "O'tilgan darslar qiymati", ...)` call:

```ts
  if (cur.np.balanceWithdrawals || prev.np.balanceWithdrawals) {
    compareRow(
      ws,
      '+  Balansdan yechib olingan',
      cur.np.balanceWithdrawals,
      prev.np.balanceWithdrawals,
      "O'quvchi balansidan markaz hisobiga o'tkazilgan pul («Yechib olish»). Kassaga yangi pul kirmagan — u o'quvchi to'lagan kuni tushumda sanalgan.",
    );
  }
```

- [ ] **Step 5: Tekshiruv footing**

In `reports-excel.detail-sheets.ts` replace the footing block:

```ts
  if (np) {
    const footed =
      np.revenue +
      np.balanceWithdrawals -
      np.teacherSalary -
      np.adminSalary -
      np.operatingExpenses -
      np.refunds;
    sectionHeader(ws, 'Sof foyda (aniq) — footing', 6);
    kvRow(ws, 'Tushum', np.revenue);
    if (np.balanceWithdrawals !== 0) {
      kvRow(ws, '+ Balansdan yechib olingan', np.balanceWithdrawals);
    }
    kvRow(ws, `− Ustoz oyligi (${np.teacherSalaryBasis})`, np.teacherSalary);
```

(the remaining `kvRow` / `checkRow` lines stay as they are).

- [ ] **Step 6: «Filiallar» footer**

In `reports-excel.trend-sheets.ts` add `balanceWithdrawals: number;` to `BranchRow` after `recognized`. The approved column layout does not change (the file header forbids it); instead the footer names the branches whose SOF FOYDA includes a withdrawal. Replace the `sheetFooter(ws, [...], 9);` call with:

```ts
  // The approved columns stay as they are; a branch whose SOF FOYDA carries a
  // withdrawal (ADR-0055) is named here instead, so the row still explains
  // itself.
  const withdrawn = rows.filter((r) => r.balanceWithdrawals);
  sheetFooter(
    ws,
    [
      "«O'tilgan darslar qiymati» — o'tilgan darslar puli; «Kassaga tushgan pul» — real kirgan pul. Ular teng bo'lishi shart emas.",
      "Bitta ustoz bitta filialda dars o'tadi — oyligi to'liq o'sha filialga yoziladi.",
      "Filiallar yig'indisi «Xulosa» varag'idagi jami raqamga teng.",
      ...(withdrawn.length
        ? [
            `«SOF FOYDA» ichida balansdan yechib olingan pul bor: ${withdrawn
              .map(
                (r) =>
                  `${r.branchName} — ${r.balanceWithdrawals.toLocaleString('ru-RU')} so'm`,
              )
              .join(', ')}.`,
          ]
        : []),
    ],
    9,
  );
```

- [ ] **Step 7: Run the Excel specs — expect pass**

Run: `cd server && npx jest src/reports/reports-excel`
Expected: PASS (all `reports-excel.*` specs).

- [ ] **Step 8: Format and commit**

```bash
cd server && npx prettier --write src/reports/reports-excel.workbook-input.ts src/reports/reports-excel.summary-sheet.ts src/reports/reports-excel.detail-sheets.ts src/reports/reports-excel.trend-sheets.ts src/reports/reports-excel.service.spec.ts src/reports/reports-excel.summary-sheet.spec.ts src/reports/reports-excel.trend-sheets.spec.ts
cd .. && git add server/src/reports
git commit -m "feat(reports): the Excel workbook shows balance withdrawals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: «Foyda tarkibi» gets the line (server)

**Files:**
- Modify: `server/src/reports/reports-profit-composition.service.ts`
- Test: `server/src/reports/reports-profit-composition.service.spec.ts`

**Interfaces:**
- Consumes: `assembleMonthlyNetProfit(...).withdrawals: BalanceWithdrawals` (Task 3), `NetProfit.balanceWithdrawals`.
- Produces: `ProfitComposition.withdrawals: { total: number; teacherCredited: number; count: number } & NamedRows` (rows `{ name, amount }`, top 6 + rest).

- [ ] **Step 1: Write the failing tests**

In the spec: add `balanceWithdrawals: 0,` to the `netProfit` constant (after `revenueBasis`) and `withdrawals: { total: 0, teacherCredited: 0, students: [] },` to the default `assembleMonthlyNetProfit` mock (after `netProfit,`). Then add:

```ts
  describe('balance withdrawals (ADR-0055)', () => {
    beforeEach(async () => {
      const base = await reports.assembleMonthlyNetProfit();
      reports.assembleMonthlyNetProfit.mockResolvedValueOnce({
        ...base,
        // 20 000 of the teachers' 110 000 is a withdrawal credited to one.
        netProfit: {
          ...netProfit,
          teacherSalary: 110_000,
          balanceWithdrawals: 30_000,
          netProfit: 90_000,
        },
        withdrawals: {
          total: 30_000,
          teacherCredited: 20_000,
          students: [
            { studentId: 5, name: 'Ali Valiyev', amount: 20_000 },
            { studentId: 6, name: 'Vali Aliyev', amount: 10_000 },
          ],
        },
      });
    });

    it('lists them as their own line, by student, and the lines add up', async () => {
      const r = await run();
      expect(r.withdrawals).toEqual({
        total: 30_000,
        teacherCredited: 20_000,
        count: 2,
        rows: [
          { name: 'Ali Valiyev', amount: 20_000 },
          { name: 'Vali Aliyev', amount: 10_000 },
        ],
        rest: { count: 0, amount: 0 },
      });
      expect(
        r.revenue.total +
          r.withdrawals.total -
          r.teachers.total -
          r.staff.total -
          r.expenses.total -
          r.refunds,
      ).toBe(r.netProfit);
    });

    it('keeps a withdrawal credited to a teacher out of the forecast teacher share', async () => {
      const r = await run();
      // (110 000 − 20 000) / 200 000 of the 20 000 still to come — as before.
      expect(r.forecast?.remainingTeacherPay).toBe(9_000);
    });
  });

  it('shows no withdrawal line for an empty scope', async () => {
    const r = await run([]);
    expect(r.withdrawals).toEqual({
      total: 0,
      teacherCredited: 0,
      count: 0,
      rows: [],
      rest: { count: 0, amount: 0 },
    });
  });
```

- [ ] **Step 2: Run — expect failure**

Run: `cd server && npx jest src/reports/reports-profit-composition.service.spec.ts`
Expected: FAIL (`r.withdrawals` undefined; forecast 11 000).

- [ ] **Step 3: Implement**

In `reports-profit-composition.service.ts`:
- interface `ProfitComposition`, after `revenue: {...};`:
  ```ts
  /** «Yechib olish» booked this month — revenue beside the lessons (ADR-0055). */
  withdrawals: { total: number; teacherCredited: number; count: number } & NamedRows;
  ```
- constants: `const TOP_WITHDRAWALS = 6;`
- after the revenue block (before `// ── Teachers`):
  ```ts
    // ── Balance withdrawals (ADR-0055) ────────────────────────────────
    const withdrawn = topWithRest(
      inputs.withdrawals.students.map((s) => ({
        name: s.name,
        amount: s.amount,
      })),
      TOP_WITHDRAWALS,
    );
  ```
- in the forecast, replace `const teacherShare = np.revenue > 0 ? np.teacherSalary / np.revenue : 0;` with:
  ```ts
      // Only the lessons' teacher share projects onto the lessons still to
      // come — a withdrawal credited to a teacher is not a lesson.
      const lessonTeacherPay = Math.max(
        0,
        np.teacherSalary - inputs.withdrawals.teacherCredited,
      );
      const teacherShare = np.revenue > 0 ? lessonTeacherPay / np.revenue : 0;
  ```
- in the returned object after `revenue: {...},`:
  ```ts
      withdrawals: {
        total: np.balanceWithdrawals,
        teacherCredited: inputs.withdrawals.teacherCredited,
        count: inputs.withdrawals.students.length,
        rows: withdrawn.top,
        rest: withdrawn.rest,
      },
  ```
- `emptyComposition`: after `revenue: ...,` add `withdrawals: { total: 0, teacherCredited: 0, count: 0, ...none },`.

- [ ] **Step 4: Run — expect pass**

Run: `cd server && npx jest src/reports/reports-profit-composition.service.spec.ts src/reports/profit-composition.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format and commit**

```bash
cd server && npx prettier --write src/reports/reports-profit-composition.service.ts src/reports/reports-profit-composition.service.spec.ts
cd .. && git add server/src/reports
git commit -m "feat(reports): «Foyda tarkibi» lists balance withdrawals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Home page «Pul qayerga ketdi» (server + client)

**Files:**
- Modify: `server/src/dashboard/dashboard-charts.types.ts:13-27`, `server/src/dashboard/dashboard-charts.service.ts:210-219`
- Test: `server/src/dashboard/dashboard-charts.service.spec.ts`
- Modify: `client/src/components/dashboard/dashboard-charts-types.ts`, `client/src/components/dashboard/chart-breakdown-rows.ts`, `client/src/components/dashboard/chart-profit-breakdown.tsx`
- Test: `client/src/components/dashboard/chart-breakdown-rows.test.ts`

**Interfaces:**
- Consumes: `NetProfit.balanceWithdrawals` (Task 3).
- Produces: `ChartProfitBreakdown.balanceWithdrawals` (server: `number`; client: `number | undefined` — a response cached for five minutes before the deploy lacks it).

- [ ] **Step 1: Server — failing test, then the field**

`dashboard-charts.service.spec.ts`: in the `netProfit` constant set `balanceWithdrawals: 15,` and `netProfit: 50,`; in the test «foyda tarkibi «Sof foyda» kartasi bilan bitta obyektdan keladi» expect

```ts
    expect(res.money!.breakdown).toEqual({
      revenue: 200,
      balanceWithdrawals: 15,
      teacherSalary: 90,
      adminSalary: 30,
      operatingExpenses: 40,
      refunds: 5,
      netProfit: 50,
    });
```

Run: `cd server && npx jest src/dashboard/dashboard-charts.service.spec.ts` → FAIL.

`dashboard-charts.types.ts`: formula comment becomes
`` `revenue + balanceWithdrawals − teacherSalary − adminSalary − operatingExpenses − refunds = netProfit`. `` and add after `revenue: number;`:

```ts
  /** «Yechib olish» booked this month (ADR-0055). */
  balanceWithdrawals: number;
```

`dashboard-charts.service.ts` breakdown: add `balanceWithdrawals: np.balanceWithdrawals,` after `revenue: np.revenue,`.

Run the spec again → PASS.

- [ ] **Step 2: Client — failing test**

`chart-breakdown-rows.test.ts`: append

```ts
  it("balansdan yechilgan pul ham tushumga qo'shiladi — qatorlar yig'indisi shunga teng", () => {
    const w = { ...b, balanceWithdrawals: 250, netProfit: 500 };
    const rows = breakdownRows(w);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1250);
    // 400 / 1250
    expect(rows.find((r) => r.key === "teacherSalary")!.pct).toBe(32);
  });

  it("eski keshdagi javobda maydon bo'lmasa ham ishlaydi", () => {
    const rows = breakdownRows(b);
    expect(rows.find((r) => r.key === "netProfit")!.pct).toBe(25);
  });
```

Run: `cd client && npx vitest --config vitest.config.mts run src/components/dashboard/chart-breakdown-rows.test.ts` → FAIL (sum 1000 / pct 40).

- [ ] **Step 3: Client — implement**

`dashboard-charts-types.ts`: formula comment as on the server, and after `revenue: number;`:

```ts
  /** «Yechib olish» booked this month (ADR-0055). Absent in a response cached before it shipped. */
  balanceWithdrawals?: number;
```

`chart-breakdown-rows.ts`: replace `const base = b.revenue > 0 ? b.revenue : 0;` with

```ts
  // Everything the month earned: lessons plus «Yechib olish» (ADR-0055) —
  // the rows below add up to exactly this.
  const income = b.revenue + (b.balanceWithdrawals ?? 0);
  const base = income > 0 ? income : 0;
```

`chart-profit-breakdown.tsx`: before `return`, add `const withdrawn = data.balanceWithdrawals ?? 0;` and set

```tsx
      subtitle={
        withdrawn > 0
          ? `Bu oy tushum: ${formatNumber(data.revenue)} so'm · balansdan yechilgan: ${formatNumber(withdrawn)} so'm`
          : `Bu oy tushum: ${formatNumber(data.revenue)} so'm`
      }
      tooltip={
        "Tushum va balansdan yechib olingan puldan ustoz va xodim oyligi, operatsion xarajat va qaytarishlar ayirilgach qolgani — sof foyda.\n\n" +
        "Bu «Sof foyda» kartasi bilan bitta manbadan keladi, shuning uchun raqamlar har doim mos tushadi."
      }
```

Run the vitest file again → PASS.

- [ ] **Step 4: Format (server only) and commit**

```bash
cd server && npx prettier --write src/dashboard/dashboard-charts.types.ts src/dashboard/dashboard-charts.service.ts src/dashboard/dashboard-charts.service.spec.ts
cd .. && git add server/src/dashboard client/src/components/dashboard
git commit -m "feat(dashboard): «Pul qayerga ketdi» counts balance withdrawals as income

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Client «Foyda tarkibi» line and the withdrawal dialog

**Files:**
- Modify: `client/src/components/payments/profit-composition-text.ts`
- Test: `client/src/components/payments/profit-composition-text.test.ts`
- Modify: `client/src/components/payments/profit-composition-rows.tsx`, `client/src/components/payments/profit-composition-panel.tsx`
- Modify: `client/src/components/payments/withdrawal-dialog.tsx`

**Interfaces:**
- Consumes: `ProfitComposition.withdrawals` (Task 5); `/withdrawals` without `targetMonth` (Task 1).
- Produces: `headline(revenue, netProfit, withdrawn = 0)`, `withdrawalSub(w)`, `reconciliation(c)` with a `+ withdrawn` term.

- [ ] **Step 1: Failing text tests**

In `profit-composition-text.test.ts`: import `withdrawalSub` too; add `withdrawals: { total: 0 },` to the `reconciliation` fixture; then append:

```ts
describe("balansdan yechib olingan pul (ADR-0055)", () => {
  it("sarlavhada darslar puli bilan yonma-yon aytiladi", () => {
    expect(headline(10_000_000, 2_300_000, 300_000)).toBe(
      `Darslardan 10,0 mln, balansdan ${formatPrice(300_000)} so'm tushdi — ustozlar, xodimlar va xarajatlardan keyin 2,3 mln qoldi.`,
    );
  });

  it("tenglikda o'z qo'shiluvchisi bo'ladi", () => {
    const c = {
      revenue: { total: 1_000_000 },
      withdrawals: { total: 300_000 },
      teachers: { total: 500_000 },
      staff: { total: 100_000 },
      expenses: { total: 200_000 },
      refunds: 0,
      netProfit: 500_000,
    } as unknown as ProfitComposition;
    const f = formatPrice;
    expect(reconciliation(c)).toBe(
      `${f(1_000_000)} + ${f(300_000)} − ${f(500_000)} − ${f(100_000)} − ${f(200_000)} − ${f(0)} = ${f(500_000)}`,
    );
  });

  it("ustozga yozilgan qismini aytadi", () => {
    expect(
      withdrawalSub({ total: 300_000, teacherCredited: 200_000, count: 2, rows: [], rest: { count: 0, amount: 0 } }),
    ).toBe(`2 o'quvchi balansidan · ${formatPrice(200_000)} so'mi ustozlar haqiga yozilgan`);
    expect(
      withdrawalSub({ total: 300_000, teacherCredited: 0, count: 1, rows: [], rest: { count: 0, amount: 0 } }),
    ).toBe("1 o'quvchi balansidan");
  });
});
```

Run: `cd client && npx vitest --config vitest.config.mts run src/components/payments/profit-composition-text.test.ts` → FAIL.

- [ ] **Step 2: Implement the text helpers**

`profit-composition-text.ts`:
- `ProfitComposition`, after `revenue: {...};`:
  ```ts
  /** «Yechib olish» booked this month (ADR-0055). */
  withdrawals: { total: number; teacherCredited: number; count: number } & NamedRows;
  ```
- `headline`:
  ```ts
  export function headline(
    revenue: number,
    netProfit: number,
    withdrawn = 0,
  ): string {
    const spent = "ustozlar, xodimlar va xarajatlardan keyin";
    const came =
      withdrawn > 0
        ? `Darslardan ${mln(revenue)}, balansdan ${mln(withdrawn)} tushdi`
        : `Darslardan ${mln(revenue)} tushdi`;
    return netProfit >= 0
      ? `${came} — ${spent} ${mln(netProfit)} qoldi.`
      : `${came} — ${spent} ${mln(-netProfit)} zarar.`;
  }
  ```
- new helper:
  ```ts
  /** "2 o'quvchi balansidan · 200 000 so'mi ustozlar haqiga yozilgan". */
  export function withdrawalSub(w: ProfitComposition["withdrawals"]): string {
    const who = `${w.count} o'quvchi balansidan`;
    return w.teacherCredited > 0
      ? `${who} · ${formatPrice(w.teacherCredited)} so'mi ustozlar haqiga yozilgan`
      : who;
  }
  ```
- `reconciliation`:
  ```ts
  export function reconciliation(c: ProfitComposition): string {
    const f = formatPrice;
    const withdrawn = c.withdrawals.total !== 0 ? ` + ${f(c.withdrawals.total)}` : "";
    return `${f(c.revenue.total)}${withdrawn} − ${f(c.teachers.total)} − ${f(c.staff.total)} − ${f(c.expenses.total)} − ${f(c.refunds)} = ${f(c.netProfit)}`;
  }
  ```

Run the text test → PASS.

- [ ] **Step 3: Rows and panel**

`profit-composition-rows.tsx`: import `withdrawalSub`; destructure `withdrawals` from `data`; directly after the revenue `</BreakdownRow>`:

```tsx
      {withdrawals.total !== 0 && (
        <BreakdownRow
          dot="bg-green-300"
          label="Balansdan yechib olingan"
          sub={withdrawalSub(withdrawals)}
          amount={withdrawals.total}
        >
          {withdrawals.rows.length > 0 ? (
            <NamedDetail rows={withdrawals} restLabel="Yana" restUnit="o'quvchi" />
          ) : undefined}
        </BreakdownRow>
      )}
```

Update the component docstring "The five lines" → "The lines the Foyda figure is made of (the withdrawal line only in a month that has one).".

`profit-composition-panel.tsx`: tooltip first sentence becomes
`Sof foyda = shu oy o&apos;tilgan darslar puli + balansdan yechib olingan pul − ustozlar haqi − xodimlar oyligi − xarajatlar − qaytarilgan pul.`
and the headline call becomes `{headline(data.revenue.total, data.netProfit, data.withdrawals.total)}`.

- [ ] **Step 4: The dialog**

`withdrawal-dialog.tsx`:
- remove the `MonthPicker` import, the `currentMonthString` function, the `targetMonth` state and `setTargetMonth(currentMonthString());` in `resetForm`, the `targetMonth,` field of the POST body, and the whole «Qaysi oy uchun» `<div className="space-y-2">…</div>` block;
- add `import { currentMonthKey, monthLabel } from "./salary-utils";`
- inside the amount block, after the `overMax` message:
  ```tsx
                <p className="text-xs text-muted-foreground">
                  Bu pul {monthLabel(currentMonthKey())} foydasiga qo&apos;shiladi.
                </p>
  ```
- teacher hint text: `Ustozning joriy oy oyligiga yoziladi.`

- [ ] **Step 5: Client checks**

```bash
cd client && npx tsc --noEmit -p . && npx vitest --config vitest.config.mts run src/components/payments src/components/dashboard && npx eslint src/components/payments src/components/dashboard
```
Expected: no type errors, tests PASS, eslint 0 errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/payments
git commit -m "feat(client): withdrawals show in «Foyda tarkibi»; the dialog drops the month picker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Decision record and project docs

**Files:**
- Create: `docs/adr/0055-balansdan-yechib-olingan-pul-oy-daromadi.md`
- Modify: `docs/adr/README.md` (index row)
- Modify: `server/CLAUDE.md` (§ Balance Withdrawal; § One canonical «Sof foyda»; § «Foyda tarkibi»)
- Modify: `client/CLAUDE.md` (Financial UI → `profit-composition-panel.tsx` bullet)

- [ ] **Step 1: ADR-0055** (Uzbek, Nygard format like ADR-0053)

```markdown
# ADR-0055 — Balansdan yechib olingan pul yechilgan oyning daromadi; oy tanlanmaydi

**Holati:** Qabul qilindi
**Sana:** 2026-09-30
**Bog'liq:** `server/src/withdrawals/withdrawals.service.ts`, `server/src/reports/balance-withdrawals.ts`, `server/src/reports/reports-excel.helpers.ts` (`buildNetProfit`), `server/src/reports/reports.service.ts` (`assembleMonthlyNetProfit`), ADR-0006, ADR-0038

## Kontekst

«Yechib olish» (`BALANCE_WITHDRAWAL`) o'quvchining musbat balansini unga
bermasdan markaz hisobiga o'tkazadi. Hujjat buni «tanlangan oy uchun markaz
daromadi» deb yozgan edi, kod esa hech qaysi foyda hisobida uni o'qimasdi:
kanonik sof foyda faqat o'tilgan darslar qiymatidan qurilardi. Oqibat:

- ustozga yozilsa, oy oyligi X ga oshar, daromad oshmas — foyda X ga kamayardi;
- yozilmasa, markazga o'tgan pul hech qaysi oyning foydasida ko'rinmasdi;
- oy erkin tanlanardi: o'tgan oy tanlansa, ustoz ulushi oyligi yopilgan
  davrga tushib, hech qachon to'lanmasdi.

Prod (30.09.2026): bitta ham yechib olish yo'q; «Muzlatilgan puli» tabida 58
o'quvchida 6 183 884 so'm turibdi.

## Qaror (CEO, 30.09.2026)

1. Yechib olingan pul yechib olingan oyning daromadi. Kanonik sof foydada u
   `balanceWithdrawals` degan alohida qator: `revenue` (o'tilgan darslar
   qiymati) ga qo'shib yuborilmaydi, chunki oy oxiri kutilmasi, yig'im foizi
   va «Foyda tarkibi» prognozi `revenue` ni dars qiymati deb o'qiydi. Kassa
   asosida (`revenueBasis = 'cash'`) qo'shilmaydi — pul to'langan kuni
   tushumda sanalgan.
2. Oy tanlanmaydi: server Toshkent bo'yicha joriy oyni o'zi yozadi. Bitta
   `now` dan tranzaksiya vaqti, `metadata.targetMonth` va ustoz ulushi sanasi
   (yechib olingan kun) chiqadi. Boshqa oy yuborilsa — 400.
3. Hisobot yechib olishni `createdAt` bo'yicha, butun oylar oralig'ida,
   filial qamrovi bilan o'qiydi (`loadBalanceWithdrawals`).

## Ko'rib chiqilgan muqobillar

- **Hujjatni koddga moslash** (yechib olish foydaga ta'sir qilmaydi, oy faqat
  ustoz ulushini belgilaydi). Rad etildi: markazniki bo'lgan pul foydada
  hech qachon ko'rinmas, ustozga yozilganda esa aslida yo'q zarar chiqardi.
- **Istalgan oyni tanlash qolsin.** Rad etildi: o'tgan oy foydasi keyin
  o'zgarardi, ustoz ulushi esa yopilgan oylik davrida to'lanmay qolardi.
- **`revenue` ichiga qo'shish.** Rad etildi: prognoz (`expectedValue −
  revenue`) yechib olishni oyning qolgan darslaridan ayirib yuborardi.

## Oqibatlari

- Foyda kartasi, «Foyda tarkibi» (alohida qator, o'quvchilar bilan), bosh
  sahifa «Pul qayerga ketdi», Excel «Xulosa» va «Tekshiruv» qatori,
  «Filiallar» izohi, Telegram 21:00 va `rm:cfin` raqami yechib olishni
  ko'radi. Sof foyda keshi `v4`.
- «Tushum» va «Oyning o'z foydasi» formulasi o'zgarmaydi.
- Ustoz ulushi hanuz `User.balance` ga `SALARY_ACCRUAL` krediti yozmaydi
  (ADR-0050 dagi umumiy siljish); oylik hisobot va cron accrual'ni o'qiydi.
```

`docs/adr/README.md`: after the 0053 row add
`| [0055](0055-balansdan-yechib-olingan-pul-oy-daromadi.md) | Balansdan yechib olingan pul yechilgan oyning daromadi; oy tanlanmaydi | Qabul qilindi | 2026-09-30 |`

- [ ] **Step 2: `server/CLAUDE.md`**

Replace the first paragraph of `#### Balance Withdrawal (\`src/withdrawals/\`)` with:

```markdown
Admin-driven drain of a student's positive balance into the centre's account — distinct from `Refunds`, which return money to the student. The amount is **revenue of the month it is withdrawn in** (ADR-0055): the canonical net profit adds it as its own leg, `NetProfit.balanceWithdrawals`, read by `loadBalanceWithdrawals` (`src/reports/balance-withdrawals.ts`, by `createdAt`, branch-scoped). It is never folded into `revenue`, which stays the lesson value that the month-end expectation, the collection ratio and the «Foyda tarkibi» forecast read; on the cash basis it is not added at all (the money counted as «Tushum» when it was paid). Used during onboarding/transition and from the debt page's «Muzlatilgan puli» tab («Markaz hisobiga o'tkazish»).

- **The month is not chosen.** The server books every withdrawal in the current Tashkent month: one `now` drives `Transaction.createdAt`, `metadata.targetMonth` and the teacher accrual's `lessonDate` (the withdrawal day, so it always lands in the open payroll period for any `cycleStartDay`). `CreateWithdrawalDto.targetMonth` is optional and deprecated; any other month is a 400 «Yechib olish faqat joriy oy uchun yoziladi». A past month would have changed that month's reported profit after the fact and parked the teacher's share in a closed payroll period, where the cron never pays it.
```

In the same section change the `creditTeacher` bullet's `lessonDate = first of targetMonth` to `lessonDate = the withdrawal day (Tashkent)` and the last bullet's `The \`lessonDate = YYYY-MM-01\` date determines which salary cycle the accrual lands in based on each company's \`cycleStartDay\`.` to `The withdrawal day as \`lessonDate\` puts the accrual in the payroll period that is open when it is written.`

In `#### One canonical "Sof foyda" — never re-derive it`, append a bullet:

```markdown
- **Balance withdrawals are a leg of their own** (ADR-0055): `netProfit = revenue + balanceWithdrawals − teacherSalary − adminSalary − operatingExpenses − refunds`. Every surface that itemises the figure shows the line only when it is non-zero: «Foyda tarkibi», the dashboard «Pul qayerga ketdi», Excel «Xulosa» block 1 and the Tekshiruv footing; «Filiallar» names the branches in its footer (its approved columns do not change).
```

In `#### «Foyda tarkibi» — the Foyda card's breakdown (ADR-0038)`, append a bullet:

```markdown
- **«Balansdan yechib olingan»** (ADR-0055) is its own line, by student, only in a month that has one. The forecast's teacher share leaves out the part of it credited to a teacher — a withdrawal is not a lesson.
```

- [ ] **Step 3: `client/CLAUDE.md`**

In the `profit-composition-panel.tsx` bullet change "the five lines (`profit-composition-rows.tsx`) open to show courses, teachers, staff and expense items;" to "the lines (`profit-composition-rows.tsx`) open to show courses, teachers, staff and expense items, and — only in a month that has one — the students whose balance was withdrawn («Balansdan yechib olingan», ADR-0055);". In the Financial UI table's `/payments/debt` row nothing changes.

- [ ] **Step 4: Commit**

```bash
git add docs/adr server/CLAUDE.md client/CLAUDE.md
git commit -m "docs: ADR-0055 — a balance withdrawal is revenue of the month it is made

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Full verification and PR

- [ ] **Step 1: Server gates**

```bash
cd server && npm run typecheck && npm run build && npx eslint src/withdrawals src/reports src/dashboard && npm test
```
Expected: typecheck/build exit 0, eslint 0 errors, every suite PASS. Grep for missed consumers of the changed types: `grep -rn "buildNetProfit(\|ChartProfitBreakdown\|BranchRow" src --include='*.ts'`.

- [ ] **Step 2: Client gates**

```bash
cd client && npx tsc --noEmit -p . && npm test && npx eslint src && npm run build
```
Expected: 0 type errors, all vitest files PASS, eslint "0 errors", build succeeds.

- [ ] **Step 3: ADR number re-check, push, PR**

```bash
git fetch origin && git ls-tree --name-only origin/main docs/adr/ | grep -c 0055
```
Expected: `0` (renumber with `git mv` if `origin/main` took 0055 meanwhile). Then push and open a PR against `main` with an English title and body ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
