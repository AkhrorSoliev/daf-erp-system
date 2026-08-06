# «Hisobot» Excel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 22-sheet `/payments/overview` Excel with a 10-sheet «HISOBOT» built around one summary page, one profit definition, and plain-language labels — plus a new «oyning o'z foydasi» figure shared with the overview Foyda card.

**Architecture:** No existing calculation changes. `getMonthlyNetProfit`, `getRecognizedRevenue`, `getMonthly` and `getIncomeMonthAttribution` stay exactly as they are. One new derived figure (`ownMonthProfit`) is computed by a pure helper and exposed through a single `ReportsService` facade method that both the Excel and the overview controller read — so they can never disagree. One new read service (`ReportsStudentFlowService`) supplies the student figures the Excel needs, because `ReportsExcelService` is pure orchestration and must not touch Prisma. Sheet builders are split by responsibility into new files; the existing builders that move behind checkboxes are untouched.

**Tech Stack:** NestJS · Prisma · exceljs 4.4 · jest · Next.js (client)

**Spec:** `docs/superpowers/specs/2026-08-06-hisobot-excel-redesign-design.md`

## Global Constraints

- All user-facing text is **Latin Uzbek**. Never mix Cyrillic letters into any label, note or message.
- Money is formatted `#,##0` (plain) or `#,##0" so'm"` (headline). Counts use `#,##0` — **never** the so'm format.
- Percentages appear in exactly two forms: **«Jamidan %»** (share of a total) and **«Undirish %»**. No margin percentage, no percentage-point («p») delta anywhere.
- Every sheet renders a mandatory period line directly under its title: `Davr: DD.MM.YYYY — DD.MM.YYYY` or `Bugungi holat: DD.MM.YYYY`.
- `ReportsExcelService` and every sheet builder receive data through the `ReportsService` facade. **No Prisma access in any `reports-excel.*` file.**
- Every new money/report query must carry a branch predicate — `reports-branch-scope-coverage.spec.ts` fails the build otherwise. Use `studentBranchWhere` / `groupBranchWhere` from `src/common/finance/report-branch-scope.ts`.
- Server: `cd server && npm test` must pass. Client: `cd client && npm run build` must pass.
- Files stay under 500 lines; target 100–300.
- Commit after every task.

---

### Task 1: `computeOwnMonthProfit` pure helper

The figure the CEO asked for: did the month's **own** money cover the month's **own** costs. Distinct from net profit, which counts the full lesson value regardless of when the cash arrived.

**Files:**
- Create: `server/src/reports/own-month-profit.ts`
- Test: `server/src/reports/own-month-profit.spec.ts`

**Interfaces:**
- Consumes: `NetProfit` from `server/src/reports/reports-excel.helpers.ts` (existing exported interface).
- Produces: `computeOwnMonthProfit(ownMoney: number, np: NetProfit): number`

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/own-month-profit.spec.ts`:

```ts
import { computeOwnMonthProfit } from './own-month-profit';
import { NetProfit } from './reports-excel.helpers';

const np = (over: Partial<NetProfit>): NetProfit =>
  ({
    revenue: 0,
    revenueBasis: 'recognized',
    teacherSalary: 0,
    teacherSalaryBasis: 'hisoblangan',
    adminSalaryBasis: 'hisoblangan',
    teacherSalaryHasTopup: true,
    adminSalary: 0,
    operatingExpenses: 0,
    refunds: 0,
    netProfit: 0,
    netMarginPercent: 0,
    memo: { writeOffs: 0, providerFees: 0, advances: 0 },
    ...over,
  }) as NetProfit;

describe('computeOwnMonthProfit', () => {
  it('June 2026 production figures — the month did NOT cover itself', () => {
    const result = computeOwnMonthProfit(
      133_621_653,
      np({ teacherSalary: 66_721_097, operatingExpenses: 92_744_000, refunds: 907_000 }),
    );
    expect(result).toBe(-26_750_444);
  });

  it('July 2026 production figures — the month just covered itself', () => {
    const result = computeOwnMonthProfit(
      142_064_938,
      np({ teacherSalary: 95_834_547, operatingExpenses: 41_773_000, refunds: 200_000 }),
    );
    expect(result).toBe(4_257_391);
  });

  it('subtracts staff salary too', () => {
    const result = computeOwnMonthProfit(
      1_000_000,
      np({ teacherSalary: 400_000, adminSalary: 100_000, operatingExpenses: 200_000 }),
    );
    expect(result).toBe(300_000);
  });

  it('does NOT subtract the center top-up separately (it is inside teacherSalary)', () => {
    // teacherSalary already equals covered + centerFunded; subtracting the gap
    // again would double-count it.
    const result = computeOwnMonthProfit(1_000_000, np({ teacherSalary: 600_000 }));
    expect(result).toBe(400_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/own-month-profit.spec.ts`
Expected: FAIL — `Cannot find module './own-month-profit'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/own-month-profit.ts`:

```ts
import { NetProfit } from './reports-excel.helpers';

/**
 * «Oyning o'z foydasi» — did the month's OWN money cover the month's OWN costs?
 *
 * Distinct from `NetProfit.netProfit`, which counts the full value of the
 * lessons held that month no matter when the cash arrived. This figure starts
 * from `getIncomeMonthAttribution().currentMonth` — only the cash that landed
 * in the month AND belongs to that month's lessons — so collecting old debt
 * cannot flatter it.
 *
 * Negative means the month was propped up by other months' money (old-debt
 * recovery or earlier prepayments). Production June 2026 reads −26 750 444
 * against a positive +4 714 564 net profit; that gap is the whole point.
 *
 * The center top-up is NOT subtracted separately — `np.teacherSalary` is
 * already `covered + centerFunded`, so a second subtraction double-counts it.
 */
export function computeOwnMonthProfit(ownMoney: number, np: NetProfit): number {
  return (
    ownMoney -
    np.teacherSalary -
    np.adminSalary -
    np.operatingExpenses -
    np.refunds
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/own-month-profit.spec.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/own-month-profit.ts server/src/reports/own-month-profit.spec.ts
git commit -m "Add the own-month profit helper"
```

---

### Task 2: `ReportsService.getOwnMonthProfit` facade method

One place fetches the two inputs, so the Excel and the overview card can never drift apart.

**Files:**
- Modify: `server/src/reports/reports.service.ts` (add method next to `getMonthlyNetProfit`, ~line 180)
- Test: `server/src/reports/reports.service.spec.ts` (append a describe block)

**Interfaces:**
- Consumes: `computeOwnMonthProfit` (Task 1); existing `this.getIncomeMonthAttribution`, `this.getMonthlyNetProfit`, `isEmptyScope`, `ReportBranchIds`.
- Produces:
  ```ts
  getOwnMonthProfit(companyId: number, opts: {
    month: string; branchIds: ReportBranchIds; performedById: number;
  }): Promise<{
    month: string;
    ownMoney: number;      // attribution.currentMonth
    cashTotal: number;     // attribution.total
    netProfit: NetProfit;
    ownMonthProfit: number;
  }>
  ```

- [ ] **Step 1: Write the failing test**

Append to `server/src/reports/reports.service.spec.ts` (inside the top-level `describe('ReportsService')`, or as a new top-level describe if the file's mock harness makes that simpler — follow the file's existing pattern):

```ts
describe('getOwnMonthProfit', () => {
  it('combines attribution + net profit into the own-month figure', async () => {
    const svc: any = service;
    jest.spyOn(svc, 'getIncomeMonthAttribution').mockResolvedValue({
      total: 170_378_987,
      currentMonth: 142_064_938,
      lateTotal: 28_314_049,
      late: [],
    });
    jest.spyOn(svc, 'getMonthlyNetProfit').mockResolvedValue({
      teacherSalary: 95_834_547,
      adminSalary: 0,
      operatingExpenses: 41_773_000,
      refunds: 200_000,
      netProfit: 35_976_444,
    });

    const out = await svc.getOwnMonthProfit(1, {
      month: '2026-07',
      branchIds: null,
      performedById: 10_456,
    });

    expect(out.ownMoney).toBe(142_064_938);
    expect(out.cashTotal).toBe(170_378_987);
    expect(out.ownMonthProfit).toBe(4_257_391);
    expect(out.netProfit.netProfit).toBe(35_976_444);
  });

  it('passes the month-end date bounds to the attribution query', async () => {
    const svc: any = service;
    const attr = jest.spyOn(svc, 'getIncomeMonthAttribution').mockResolvedValue({
      total: 0, currentMonth: 0, lateTotal: 0, late: [],
    });
    jest.spyOn(svc, 'getMonthlyNetProfit').mockResolvedValue({
      teacherSalary: 0, adminSalary: 0, operatingExpenses: 0, refunds: 0, netProfit: 0,
    });

    await svc.getOwnMonthProfit(1, { month: '2026-02', branchIds: [7], performedById: 1 });

    expect(attr).toHaveBeenCalledWith(1, {
      branchIds: [7],
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    });
  });

  it('an empty branch scope returns zeros without querying', async () => {
    const svc: any = service;
    const attr = jest.spyOn(svc, 'getIncomeMonthAttribution');
    const out = await svc.getOwnMonthProfit(1, {
      month: '2026-07', branchIds: [], performedById: 1,
    });
    expect(out.ownMonthProfit).toBe(0);
    expect(attr).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports.service.spec.ts -t getOwnMonthProfit`
Expected: FAIL — `svc.getOwnMonthProfit is not a function`

- [ ] **Step 3: Write the implementation**

In `server/src/reports/reports.service.ts`, add the import at the top:

```ts
import { computeOwnMonthProfit } from './own-month-profit';
```

and add the method immediately after `getMonthlyNetProfit`:

```ts
  /**
   * «Oyning o'z foydasi» — the month's own money against the month's own costs.
   * The ONE source for this figure: the Excel «Xulosa» sheet and the
   * /payments/overview Foyda card both read it here, so a month can never be
   * shown as self-sustaining on one surface and loss-making on the other.
   */
  async getOwnMonthProfit(
    companyId: number,
    {
      month,
      branchIds,
      performedById,
    }: { month: string; branchIds: ReportBranchIds; performedById: number },
  ): Promise<{
    month: string;
    ownMoney: number;
    cashTotal: number;
    netProfit: NetProfit;
    ownMonthProfit: number;
  }> {
    // Same fail-closed stance as getMonthlyNetProfit: a caller scoped to
    // nothing gets zeros, never a report built from someone else's branch.
    if (isEmptyScope(branchIds)) {
      const empty = buildNetProfit(null, null, null, month, 0);
      return {
        month,
        ownMoney: 0,
        cashTotal: 0,
        netProfit: empty,
        ownMonthProfit: 0,
      };
    }
    const [y, m] = month.split('-').map(Number);
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const [attribution, netProfit] = await Promise.all([
      this.getIncomeMonthAttribution(companyId, { branchIds, startDate, endDate }),
      this.getMonthlyNetProfit(companyId, { month, branchIds, performedById }),
    ]);
    return {
      month,
      ownMoney: attribution.currentMonth,
      cashTotal: attribution.total,
      netProfit,
      ownMonthProfit: computeOwnMonthProfit(attribution.currentMonth, netProfit),
    };
  }
```

`buildNetProfit`, `isEmptyScope` and `NetProfit` are already imported in this file — confirm before adding duplicates.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports.service.spec.ts -t getOwnMonthProfit`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports.service.ts server/src/reports/reports.service.spec.ts
git commit -m "Expose the own-month profit through one facade method"
```

---

### Task 3: `financial-overview` returns `ownMonthProfit`

**Files:**
- Modify: `server/src/reports/reports.controller.ts` (the `financial-overview` handler, around the existing `netProfit` override at ~line 275-295)
- Test: `server/src/reports/reports.controller.spec.ts`

**Interfaces:**
- Consumes: `getOwnMonthProfit` (Task 2).
- Produces: the `financial-overview` payload gains `ownMonthProfit: number | null` — `null` when the figure could not be computed. **CEO/BD only**: the existing role redaction must strip it for Administrator and Cashier exactly like `netProfit`.

- [ ] **Step 1: Write the failing test**

Append to `server/src/reports/reports.controller.spec.ts`:

```ts
describe('financial-overview — ownMonthProfit', () => {
  it('adds the own-month profit for a CEO caller', async () => {
    reportsService.getOwnMonthProfit = jest.fn().mockResolvedValue({
      month: '2026-07',
      ownMoney: 142_064_938,
      cashTotal: 170_378_987,
      netProfit: { netProfit: 35_976_444 },
      ownMonthProfit: 4_257_391,
    });

    const out: any = await controller.getFinancialOverview(
      { startDate: '2026-07-01', endDate: '2026-07-31' } as any,
      { id: 10_456, companyId: 1, roles: ['CEO'] } as any,
    );

    expect(out.ownMonthProfit).toBe(4_257_391);
  });

  it('falls back to null when the figure cannot be computed', async () => {
    reportsService.getOwnMonthProfit = jest.fn().mockRejectedValue(new Error('boom'));

    const out: any = await controller.getFinancialOverview(
      { startDate: '2026-07-01', endDate: '2026-07-31' } as any,
      { id: 10_456, companyId: 1, roles: ['CEO'] } as any,
    );

    expect(out.ownMonthProfit).toBeNull();
  });

  it('is stripped for an Administrator caller', async () => {
    reportsService.getOwnMonthProfit = jest.fn().mockResolvedValue({
      month: '2026-07', ownMoney: 1, cashTotal: 1,
      netProfit: { netProfit: 1 }, ownMonthProfit: 4_257_391,
    });

    const out: any = await controller.getFinancialOverview(
      { startDate: '2026-07-01', endDate: '2026-07-31' } as any,
      { id: 9, companyId: 1, roles: ['Administrator'] } as any,
    );

    expect(out.ownMonthProfit).toBeUndefined();
  });
});
```

Match the existing spec file's harness — reuse how it builds `controller` and `reportsService`, and how it already asserts the Administrator redaction for `netProfit`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports.controller.spec.ts -t ownMonthProfit`
Expected: FAIL — `expect(received).toBe(4257391)` got `undefined`

- [ ] **Step 3: Write the implementation**

In `reports.controller.ts`, directly after the existing `let netProfit = overview.netProfit; try { ... } catch { ... }` block, add:

```ts
    // «Oyning o'z foydasi» — the month's own money against its own costs.
    // A positive Foyda card can still sit on a month that did not pay for
    // itself (June 2026: profit +4.7M, own-month −26.8M, propped up by May
    // debt recovery). Defensive: a failure yields null, never breaks the card.
    let ownMonthProfit: number | null = null;
    try {
      const own = await this.reportsService.getOwnMonthProfit(user.companyId, {
        month,
        branchIds,
        performedById: user.id,
      });
      ownMonthProfit = own.ownMonthProfit;
    } catch {
      ownMonthProfit = null;
    }
```

and extend the return of the **full** (CEO/BD) payload only:

```ts
    return {
      ...overview,
      netProfit,
      ownMonthProfit,
      salary: { ...overview.salary, computed },
    };
```

The Administrator/Cashier branch of the handler returns its existing stripped object (`{ ltvPayerCount, avgPayment }`) unchanged — do **not** add the field there.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports.controller.spec.ts -t ownMonthProfit`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports.controller.ts server/src/reports/reports.controller.spec.ts
git commit -m "Return the own-month profit from the financial overview"
```

---

### Task 4: Foyda card shows «Oyning o'z foydasi»

**Files:**
- Modify: `client/src/components/payments/payments-overview.tsx` (the `Overview` type ~line 77, the fallback object ~line 201, the Foyda `KpiCard` ~line 246-253)

**Interfaces:**
- Consumes: `ownMonthProfit: number | null` from `GET /reports/financial-overview` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Extend the response type**

In the `Overview` type declaration, next to `netProfit: number;` add:

```ts
  ownMonthProfit?: number | null;
```

and in the zero-value fallback object (the one that already sets `netProfit: 0`) add:

```ts
  ownMonthProfit: null,
```

- [ ] **Step 2: Render the figure as the card's subtitle**

Replace the Foyda `KpiCard` block with:

```tsx
            {/* 3. Foyda */}
            <KpiCard
              icon={TrendingUp}
              label="Foyda"
              value={`${fmt(d.netProfit)} so'm`}
              color={d.netProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
              subtitle={
                d.ownMonthProfit == null
                  ? undefined
                  : `Oyning o'z foydasi: ${fmt(d.ownMonthProfit)} so'm`
              }
              tooltip="Shu oy o'tilgan darslarning pulidan ustoz oyligi, xarajatlar va qaytarilgan pullar ayirilgan — qolgani markazga foyda. «Oyning o'z foydasi» esa boshqa savolga javob beradi: shu oyning O'Z puli shu oyning xarajatini qopladimi. Manfiy bo'lsa — oy eski qarz undirish yoki oldingi oylar puli hisobiga yopilgan."
              onClick={() => setChartKey("profit")}
            />
```

Check `KpiCard`'s props before writing: if it has no `subtitle` prop, use the prop it does expose for secondary text (the «To'lov qilganlar» card in the same file already passes `subtitle="Davrda aktiv"`, so the prop exists — confirm its exact name).

- [ ] **Step 3: Verify the build**

Run: `cd client && npm run build`
Expected: build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add client/src/components/payments/payments-overview.tsx
git commit -m "Show the own-month profit under the Foyda card"
```

---

### Task 5: `ReportsStudentFlowService`

The Excel needs student figures that no report currently returns, and `reports-excel.*` may not touch Prisma.

**Files:**
- Create: `server/src/reports/reports-student-flow.service.ts`
- Create: `server/src/reports/reports-student-flow.service.spec.ts`
- Modify: `server/src/reports/reports.module.ts` (register the provider)
- Modify: `server/src/reports/reports.service.ts` (inject + delegate)

**Interfaces:**
- Consumes: `PrismaService`; `studentBranchWhere`, `groupBranchWhere`, `isEmptyScope`, `ReportBranchIds` from `src/common/finance/report-branch-scope.ts`.
- Produces:
  ```ts
  export interface StudentFlow {
    month: string;
    attended: number;
    inGroup: number;
    groupless: number;
    byStatus: Array<{ status: string; count: number }>;
    totalStudents: number;
    arrived: number;
    left: { frozen: number; expelled: number; graduated: number; archived: number; total: number };
    netChange: number;
    dropped: {
      records: number;
      students: number;
      stillInGroup: number;
      groupless: number;
      grouplessByStatus: Array<{ status: string; count: number }>;
    };
  }
  getStudentFlow(companyId: number, opts: { month: string; branchIds: ReportBranchIds }): Promise<StudentFlow>
  ```
  and on the facade: `ReportsService.getStudentFlow(companyId, opts)` with the same signature.

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/reports-student-flow.service.spec.ts`:

```ts
import { ReportsStudentFlowService } from './reports-student-flow.service';

describe('ReportsStudentFlowService', () => {
  let prisma: any;
  let service: ReportsStudentFlowService;

  beforeEach(() => {
    prisma = {
      student: {
        groupBy: jest.fn().mockResolvedValue([
          { status: 'ACTIVE', _count: 503 },
          { status: 'FROZEN', _count: 184 },
          { status: 'EXPELLED', _count: 134 },
          { status: 'GRADUATED', _count: 3 },
        ]),
        count: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      attendance: { findMany: jest.fn().mockResolvedValue(new Array(444).fill({ studentId: 1 })) },
      enrollment: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([
        { s: 'FROZEN', n: BigInt(73) },
        { s: 'EXPELLED', n: BigInt(41) },
        { s: 'GRADUATED', n: BigInt(20) },
      ]),
    };
    // inGroup, groupless, arrived — in call order
    prisma.student.count
      .mockResolvedValueOnce(427)
      .mockResolvedValueOnce(76)
      .mockResolvedValueOnce(72);
    service = new ReportsStudentFlowService(prisma);
  });

  it('returns the production July shape', async () => {
    const out = await service.getStudentFlow(1, { month: '2026-07', branchIds: null });

    expect(out.attended).toBe(444);
    expect(out.inGroup).toBe(427);
    expect(out.groupless).toBe(76);
    expect(out.totalStudents).toBe(824);
    expect(out.arrived).toBe(72);
    expect(out.left).toEqual({ frozen: 73, expelled: 41, graduated: 20, archived: 0, total: 134 });
    expect(out.netChange).toBe(-62);
  });

  it('splits dropped students into still-studying and groupless', async () => {
    prisma.enrollment.findMany.mockResolvedValue([
      { studentId: 1 }, { studentId: 1 }, { studentId: 2 }, { studentId: 3 },
    ]);
    prisma.student.findMany.mockResolvedValue([
      { id: 1, status: 'ACTIVE', enrollments: [{ id: 'e' }] },
      { id: 2, status: 'EXPELLED', enrollments: [] },
      { id: 3, status: 'ACTIVE', enrollments: [] },
    ]);

    const out = await service.getStudentFlow(1, { month: '2026-07', branchIds: null });

    expect(out.dropped.records).toBe(4);
    expect(out.dropped.students).toBe(3);
    expect(out.dropped.stillInGroup).toBe(1);
    expect(out.dropped.groupless).toBe(2);
    expect(out.dropped.grouplessByStatus).toEqual(
      expect.arrayContaining([
        { status: 'EXPELLED', count: 1 },
        { status: 'ACTIVE', count: 1 },
      ]),
    );
  });

  it('an empty branch scope returns zeros without querying', async () => {
    const out = await service.getStudentFlow(1, { month: '2026-07', branchIds: [] });
    expect(out.attended).toBe(0);
    expect(out.totalStudents).toBe(0);
    expect(prisma.student.groupBy).not.toHaveBeenCalled();
  });

  it('scopes every student query by branch', async () => {
    await service.getStudentFlow(1, { month: '2026-07', branchIds: [7] });
    const where = prisma.student.groupBy.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-student-flow.service.spec.ts`
Expected: FAIL — `Cannot find module './reports-student-flow.service'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/reports-student-flow.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  isEmptyScope,
  studentBranchWhere,
  groupBranchWhere,
} from '../common/finance/report-branch-scope';

export interface StudentFlow {
  month: string;
  /** Distinct students marked PRESENT/LATE in the month — the honest "faol". */
  attended: number;
  /** ACTIVE status AND an active enrollment. */
  inGroup: number;
  /** ACTIVE status but no active enrollment — a work list, not a healthy state. */
  groupless: number;
  byStatus: Array<{ status: string; count: number }>;
  totalStudents: number;
  arrived: number;
  left: {
    frozen: number;
    expelled: number;
    graduated: number;
    archived: number;
    total: number;
  };
  netChange: number;
  dropped: {
    records: number;
    students: number;
    stillInGroup: number;
    groupless: number;
    grouplessByStatus: Array<{ status: string; count: number }>;
  };
}

const TZ_MS = 5 * 60 * 60 * 1000;

/**
 * Student figures for the «O'quvchilar» sheet.
 *
 * `activeStudentCount` on the financial overview counts `status: ACTIVE` and
 * nothing else, so a student nobody ever put in a group is reported as active
 * (76 of 503 in production). This service reports what actually happened —
 * who attended, who sits in a group, who is stranded without one — and never
 * calls a DROPPED enrollment "left the centre": most of those students simply
 * moved to another group.
 */
@Injectable()
export class ReportsStudentFlowService {
  constructor(private prisma: PrismaService) {}

  async getStudentFlow(
    companyId: number,
    { month, branchIds }: { month: string; branchIds: ReportBranchIds },
  ): Promise<StudentFlow> {
    const empty: StudentFlow = {
      month,
      attended: 0,
      inGroup: 0,
      groupless: 0,
      byStatus: [],
      totalStudents: 0,
      arrived: 0,
      left: { frozen: 0, expelled: 0, graduated: 0, archived: 0, total: 0 },
      netChange: 0,
      dropped: {
        records: 0,
        students: 0,
        stillInGroup: 0,
        groupless: 0,
        grouplessByStatus: [],
      },
    };
    if (isEmptyScope(branchIds)) return empty;

    const [y, m] = month.split('-').map(Number);
    // Timestamp columns take the Tashkent-shifted instants; @db.Date columns
    // (Attendance.date) take unshifted UTC dates with an EXCLUSIVE upper bound.
    const tsStart = new Date(Date.UTC(y, m - 1, 1) - TZ_MS);
    const tsEnd = new Date(Date.UTC(y, m, 1) - TZ_MS);
    const dateStart = new Date(Date.UTC(y, m - 1, 1));
    const dateEnd = new Date(Date.UTC(y, m, 1));

    const studentScope = studentBranchWhere(branchIds);
    const groupScope = groupBranchWhere(branchIds);

    const [byStatusRows, inGroup, groupless, attendedRows, arrived, exitRows, droppedRows] =
      await Promise.all([
        this.prisma.student.groupBy({
          by: ['status'],
          where: { companyId, deletedAt: null, ...studentScope },
          _count: true,
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            enrollments: { some: { status: 'ACTIVE' } },
            ...studentScope,
          },
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            status: 'ACTIVE',
            NOT: { enrollments: { some: { status: 'ACTIVE' } } },
            ...studentScope,
          },
        }),
        this.prisma.attendance.findMany({
          where: {
            companyId,
            date: { gte: dateStart, lt: dateEnd },
            status: { in: ['PRESENT', 'LATE'] },
            group: groupScope,
          },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        this.prisma.student.count({
          where: {
            companyId,
            deletedAt: null,
            createdAt: { gte: tsStart, lt: tsEnd },
            ...studentScope,
          },
        }),
        this.exitCounts(companyId, tsStart, tsEnd),
        this.prisma.enrollment.findMany({
          where: {
            status: 'DROPPED',
            statusChangedAt: { gte: tsStart, lt: tsEnd },
            group: { companyId, ...groupScope },
          },
          select: { studentId: true },
        }),
      ]);

    const byStatus = byStatusRows.map((r: any) => ({
      status: String(r.status),
      count: r._count as number,
    }));
    const totalStudents = byStatus.reduce((s, r) => s + r.count, 0);

    const left = {
      frozen: exitRows.FROZEN ?? 0,
      expelled: exitRows.EXPELLED ?? 0,
      graduated: exitRows.GRADUATED ?? 0,
      archived: exitRows.ARCHIVED ?? 0,
      total: 0,
    };
    left.total = left.frozen + left.expelled + left.graduated + left.archived;

    const droppedIds = [...new Set(droppedRows.map((d: any) => d.studentId))];
    const droppedStudents = droppedIds.length
      ? await this.prisma.student.findMany({
          where: { id: { in: droppedIds } },
          select: {
            id: true,
            status: true,
            enrollments: { where: { status: 'ACTIVE' }, select: { id: true } },
          },
        })
      : [];
    const stillInGroup = droppedStudents.filter(
      (s: any) => s.enrollments.length > 0,
    ).length;
    const grouplessTally: Record<string, number> = {};
    droppedStudents
      .filter((s: any) => s.enrollments.length === 0)
      .forEach((s: any) => {
        grouplessTally[s.status] = (grouplessTally[s.status] ?? 0) + 1;
      });

    return {
      month,
      attended: attendedRows.length,
      inGroup,
      groupless,
      byStatus,
      totalStudents,
      arrived,
      left,
      netChange: arrived - left.total,
      dropped: {
        records: droppedRows.length,
        students: droppedStudents.length,
        stillInGroup,
        groupless: droppedStudents.length - stillInGroup,
        grouplessByStatus: Object.entries(grouplessTally).map(([status, count]) => ({
          status,
          count,
        })),
      },
    };
  }

  /**
   * Status transitions away from ACTIVE inside the month, read from
   * EntityHistory. Only real StudentStatus values are counted — the same
   * column also carries action names written by other flows.
   */
  private async exitCounts(
    companyId: number,
    start: Date,
    end: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<{ s: string; n: bigint }[]>`
      SELECT h."newValues"->>'status' AS s, COUNT(*)::bigint AS n
      FROM "EntityHistory" h
      WHERE h."companyId" = ${companyId}
        AND h."entityType" = 'Student'
        AND h."createdAt" >= ${start} AND h."createdAt" < ${end}
        AND h."newValues"->>'status' IN ('FROZEN','EXPELLED','GRADUATED','ARCHIVED')
      GROUP BY 1`;
    return Object.fromEntries(rows.map((r) => [r.s, Number(r.n)]));
  }
}
```

**Note on branch scope:** `EntityHistory` carries no branch column, so `exitCounts` is company-wide. Add exactly that sentence as a comment above the call and confirm `reports-branch-scope-coverage.spec.ts` still passes; if it flags the raw query, add the service to that spec's documented exemption list with the same reasoning it uses for other unscopable sources.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports-student-flow.service.spec.ts`
Expected: PASS — 4 tests

- [ ] **Step 5: Register the provider and delegate from the facade**

In `server/src/reports/reports.module.ts` add `ReportsStudentFlowService` to both `providers` and `exports` (follow how `ReportsCashFlowService` is registered).

In `server/src/reports/reports.service.ts` add the constructor param and a delegate:

```ts
    private studentFlow: ReportsStudentFlowService,
```

```ts
  getStudentFlow(
    companyId: number,
    opts: { month: string; branchIds: ReportBranchIds },
  ) {
    return this.studentFlow.getStudentFlow(companyId, opts);
  }
```

`reports.service.spec.ts` builds `ReportsService` with a provider list — add a `{ provide: ReportsStudentFlowService, useValue: { getStudentFlow: jest.fn() } }` entry there so the existing suite keeps compiling.

- [ ] **Step 6: Run the reports suite**

Run: `cd server && npx jest src/reports`
Expected: PASS — all reports specs green

- [ ] **Step 7: Commit**

```bash
git add server/src/reports/reports-student-flow.service.ts \
        server/src/reports/reports-student-flow.service.spec.ts \
        server/src/reports/reports.module.ts \
        server/src/reports/reports.service.ts \
        server/src/reports/reports.service.spec.ts
git commit -m "Add the student-flow read service behind the reports facade"
```

---

### Task 6: Shared sheet primitives + the salary-reliability guard

The new sheets use a lighter visual language than the current navy-band builders: a navy **text** title with a rule under section labels, no full-width fills except header and total rows.

**Files:**
- Create: `server/src/reports/reports-excel.v2-helpers.ts`
- Create: `server/src/reports/reports-excel.v2-helpers.spec.ts`

**Interfaces:**
- Consumes: `Workbook, Worksheet, Row` from exceljs; `SOM`, `NUM`, `PCT`, `GREEN`, `RED`, `SUBTLE`, `NAVY` from `reports-excel.helpers.ts`.
- Produces:
  ```ts
  export const HEAD_FILL: string;   // 'FFE8EDF5'
  export const TOTAL_FILL: string;  // 'FFD5E0F0'
  export function sheetHead(ws: Worksheet, title: string, periodLine: string, scopeLine: string, span: number): void
  export function blockTitle(ws: Worksheet, label: string, span: number): void
  export function columnHeader(ws: Worksheet, cells: string[]): Row
  export function compareRow(ws: Worksheet, label: string, cur: number | null, prev: number | null, izoh?: string, opts?: { sub?: boolean; inverse?: boolean }): Row
  export function countRow(ws: Worksheet, label: string, value: number | string, izoh?: string, opts?: { bold?: boolean; good?: boolean; bad?: boolean }): Row
  export function headlineRow(ws: Worksheet, label: string, cur: number, prev: number | null, izoh: string): Row
  export function totalsBar(ws: Worksheet, cells: (string | number)[], moneyCols?: number[]): Row
  export function sheetFooter(ws: Worksheet, lines: string[], span: number): void
  export function isSalaryDataReliable(revenue: number, teacherSalary: number): boolean
  export function uzMonthLabel(month: string): string   // '2026-07' → 'Iyul 2026'
  ```

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/reports-excel.v2-helpers.spec.ts`:

```ts
import { Workbook } from 'exceljs';
import {
  isSalaryDataReliable,
  uzMonthLabel,
  sheetHead,
  countRow,
} from './reports-excel.v2-helpers';

describe('isSalaryDataReliable', () => {
  it('May 2026 — 33 334 so\'m of salary against 152M of lessons is not real data', () => {
    expect(isSalaryDataReliable(152_415_637, 33_334)).toBe(false);
  });

  it('July 2026 — a normal month passes', () => {
    expect(isSalaryDataReliable(173_783_991, 95_834_547)).toBe(true);
  });

  it('exactly 15% passes', () => {
    expect(isSalaryDataReliable(1_000_000, 150_000)).toBe(true);
  });

  it('just under 15% fails', () => {
    expect(isSalaryDataReliable(1_000_000, 149_999)).toBe(false);
  });

  it('no revenue is never reliable', () => {
    expect(isSalaryDataReliable(0, 0)).toBe(false);
  });
});

describe('uzMonthLabel', () => {
  it('renders Latin Uzbek month names', () => {
    expect(uzMonthLabel('2026-07')).toBe('Iyul 2026');
    expect(uzMonthLabel('2026-01')).toBe('Yanvar 2026');
    expect(uzMonthLabel('2026-12')).toBe('Dekabr 2026');
  });
});

describe('sheetHead', () => {
  it('always writes the period line under the title', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('T');
    sheetHead(ws, 'HISOBOT', 'Davr: 01.07.2026 — 31.07.2026', 'Barcha filiallar', 5);
    expect(ws.getRow(1).getCell(1).value).toBe('HISOBOT');
    expect(ws.getRow(2).getCell(1).value).toBe('Davr: 01.07.2026 — 31.07.2026');
    expect(ws.getRow(3).getCell(1).value).toBe('Barcha filiallar');
  });
});

describe('countRow', () => {
  it('formats a count as a plain number, never as so\'m', () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('T');
    const r = countRow(ws, "Sof o'zgarish", -62);
    expect(r.getCell(2).numFmt).toBe('#,##0');
    expect(r.getCell(2).numFmt).not.toContain("so'm");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-excel.v2-helpers.spec.ts`
Expected: FAIL — `Cannot find module './reports-excel.v2-helpers'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/reports-excel.v2-helpers.ts`. Port the primitives verbatim from the verified prototype `server/scripts/_namuna-hisobot-v2.ts` (`head`, `section`, `colHeader`, `line`, `simpleRow`, `bottomLine`, `totalRow`, `notes`), renaming them to the names in the Interfaces block above, and add:

```ts
/** Uzbek month names — the report never prints an English or Cyrillic month. */
const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

export function uzMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${UZ_MONTHS[m - 1]} ${y}`;
}

/**
 * Is this month's payroll complete enough to publish a profit for?
 *
 * A teacher's share of lesson revenue never runs below roughly a third; a month
 * reporting a rounding error against its lesson value has missing rate configs,
 * not a windfall. May 2026 booked 152 415 637 so'm of lessons against 33 334
 * so'm of salary and printed a 127.5 mln "profit" nobody should act on.
 *
 * Data-driven on purpose — hardcoding '2026-05' would go stale the moment a
 * second transition month appeared.
 */
export function isSalaryDataReliable(
  revenue: number,
  teacherSalary: number,
): boolean {
  if (revenue <= 0) return false;
  return teacherSalary / revenue >= 0.15;
}
```

Two rules the ported primitives must keep:
- `countRow` sets `numFmt = NUM` on the value cell and **never** `SOM` — a student count formatted as money is the `−62 so'm` bug.
- `compareRow` renders no delta when either side is `null`, and percentage values never get a delta column at all.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports-excel.v2-helpers.spec.ts`
Expected: PASS — 9 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports-excel.v2-helpers.ts server/src/reports/reports-excel.v2-helpers.spec.ts
git commit -m "Add the sheet primitives and the salary-reliability guard"
```

---

### Task 7: «Xulosa» sheet builder (6 blocks)

**Files:**
- Create: `server/src/reports/reports-excel.summary-sheet.ts`
- Create: `server/src/reports/reports-excel.summary-sheet.spec.ts`

**Interfaces:**
- Consumes: Task 6 primitives; `NetProfit` from `reports-excel.helpers.ts`.
- Produces:
  ```ts
  export interface SummaryInput {
    month: string;                 // '2026-07'
    prevMonth: string;             // '2026-06'
    periodLine: string;            // 'Davr: 01.07.2026 — 31.07.2026 (Iyul 2026)'
    scopeLine: string;
    cur: { np: NetProfit; covered: number | null; centerFunded: number | null; recognized: number };
    prev: { np: NetProfit; covered: number | null; centerFunded: number | null };
    ownMoney: { cur: number; prev: number };
    ownProfit: { cur: number; prev: number };
    attribution: { total: number; currentMonth: number; late: Array<{ label: string; amount: number }> };
    paymentCount: number;
    payerCount: number;
    lessonMoney: { paidInMonth: number; paidEarlier: number; paidNextMonth: number; unpaid: number };
    nextMonthLabel: string;
    cashOut: Array<{ label: string; amount: number }>;
    students: import('./reports-student-flow.service').StudentFlow;
  }
  export function summarySheetV2(wb: Workbook, input: SummaryInput): void
  ```

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/reports-excel.summary-sheet.spec.ts`:

```ts
import { Workbook, Worksheet } from 'exceljs';
import { summarySheetV2, SummaryInput } from './reports-excel.summary-sheet';

const np = (over: any = {}) => ({
  revenue: 173_783_991,
  revenueBasis: 'recognized',
  teacherSalary: 95_834_547,
  teacherSalaryBasis: 'hisoblangan',
  adminSalaryBasis: 'hisoblangan',
  teacherSalaryHasTopup: true,
  adminSalary: 0,
  operatingExpenses: 41_773_000,
  refunds: 200_000,
  netProfit: 35_976_444,
  netMarginPercent: 20.7,
  memo: { writeOffs: 0, providerFees: 0, advances: 16_430_000 },
  ...over,
});

const input = (over: Partial<SummaryInput> = {}): SummaryInput =>
  ({
    month: '2026-07',
    prevMonth: '2026-06',
    periodLine: 'Davr: 01.07.2026 — 31.07.2026 (Iyul 2026)',
    scopeLine: 'DaF Sprachzentrum · Barcha filiallar',
    cur: { np: np(), covered: 80_321_275, centerFunded: 15_513_272, recognized: 173_783_991 },
    prev: { np: np({ netProfit: 4_714_564 }), covered: 1, centerFunded: 1 },
    ownMoney: { cur: 142_064_938, prev: 133_621_653 },
    ownProfit: { cur: 4_257_391, prev: -26_750_444 },
    attribution: {
      total: 170_378_987,
      currentMonth: 142_064_938,
      late: [
        { label: 'Iyun 2026', amount: 24_877_418 },
        { label: 'May 2026', amount: 3_436_631 },
      ],
    },
    paymentCount: 530,
    payerCount: 387,
    lessonMoney: {
      paidInMonth: 142_064_938,
      paidEarlier: 25_486_916,
      paidNextMonth: 6_232_137,
      unpaid: 0,
    },
    nextMonthLabel: 'Avgust 2026',
    cashOut: [
      { label: 'Ijara', amount: 18_000_000 },
      { label: 'Ustozga avans', amount: 16_430_000 },
    ],
    students: {
      month: '2026-07',
      attended: 444,
      inGroup: 427,
      groupless: 76,
      byStatus: [{ status: 'FROZEN', count: 184 }, { status: 'EXPELLED', count: 134 }],
      totalStudents: 824,
      arrived: 72,
      left: { frozen: 73, expelled: 41, graduated: 20, archived: 0, total: 134 },
      netChange: -62,
      dropped: {
        records: 130, students: 118, stillInGroup: 37, groupless: 81,
        grouplessByStatus: [{ status: 'EXPELLED', count: 35 }, { status: 'ACTIVE', count: 30 }],
      },
    },
    ...over,
  }) as SummaryInput;

const textOf = (ws: Worksheet): string[] => {
  const out: string[] = [];
  ws.eachRow((r) => out.push(String(r.getCell(1).value ?? '')));
  return out;
};
const valueFor = (ws: Worksheet, label: string): any => {
  let v: any;
  ws.eachRow((r) => {
    if (v === undefined && String(r.getCell(1).value ?? '') === label) v = r.getCell(2).value;
  });
  return v;
};

describe('summarySheetV2', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    summarySheetV2(wb, input());
    ws = wb.getWorksheet('Xulosa')!;
  });

  it('renders all six blocks', () => {
    const t = textOf(ws).join('\n');
    expect(t).toContain('1.  NATIJA');
    expect(t).toContain("o'z xarajatini qopladimi");
    expect(t).toContain('3.  PUL QAYERDAN KELDI');
    expect(t).toContain('DARSLARINING PULI QAYERDAN KELGAN');
    expect(t).toContain('5.  PUL QAYERGA KETDI');
    expect(t).toContain("6.  O'QUVCHILAR");
  });

  it('names the revenue row so nobody reads it as cash', () => {
    expect(valueFor(ws, "O'tilgan darslar qiymati")).toBe(173_783_991);
    expect(textOf(ws).join('\n')).not.toContain('Dars tushumi (');
  });

  it('shows the center top-up as a sub-line inside the salary total', () => {
    expect(valueFor(ws, "markaz qo'shimchasi")).toBe(15_513_272);
    expect(valueFor(ws, "o'quvchilar to'lagan qismi")).toBe(80_321_275);
  });

  it('renders the own-month profit as its own headline', () => {
    expect(valueFor(ws, "=  IYUL 2026NING O'Z FOYDASI")).toBe(4_257_391);
  });

  it('spells out a fully collected month instead of printing a bare 0', () => {
    expect(valueFor(ws, "Hali to'lanmay qolgan")).toBe("Yo'q — hammasi to'langan");
  });

  it('prints the unpaid amount when there is one', () => {
    const wb = new Workbook();
    summarySheetV2(wb, input({
      lessonMoney: { paidInMonth: 1, paidEarlier: 1, paidNextMonth: 1, unpaid: 143_884_239 },
    }));
    expect(valueFor(wb.getWorksheet('Xulosa')!, "Hali to'lanmay qolgan")).toBe(143_884_239);
  });

  it('has no KASSADA QOLDI row', () => {
    expect(textOf(ws).join('\n')).not.toContain('KASSADA QOLDI');
  });

  it('carries no margin percentage and no point delta', () => {
    const t = textOf(ws).join('\n');
    expect(t).not.toContain("Har 100 so'm");
    expect(t).not.toContain('Sof marja');
  });

  it("reports the net student change as a count, not money", () => {
    let cell: any;
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '').startsWith("Sof o'zgarish")) cell = r.getCell(2);
    });
    expect(cell.value).toBe(-62);
    expect(cell.numFmt).toBe('#,##0');
  });

  it('shows the payment count and payer count together', () => {
    expect(textOf(ws).join('\n')).toContain("530 ta to'lov · 387 ta o'quvchi");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-excel.summary-sheet.spec.ts`
Expected: FAIL — `Cannot find module './reports-excel.summary-sheet'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/reports-excel.summary-sheet.ts` by porting the `1. XULOSA` block of `server/scripts/_namuna-hisobot-v2.ts` (it is already the approved layout and produced every number in the test above). Rules to hold:

- Worksheet name `'Xulosa'`; columns `[40, 18, 18, 11, 54]`.
- `sheetHead(ws, 'HISOBOT', input.periodLine, input.scopeLine, 5)`.
- Blocks 1 and 2 use `compareRow` (comparison columns populated).
- Blocks 3, 4, 5, 6 use `countRow` / plain rows — **no comparison columns, no empty `Iyun 2026` header**.
- Block 1 skips the `Xodimlar oyligi` row when both months are 0.
- Block 4's unpaid row writes the string `"Yo'q — hammasi to'langan"` in `GREEN` when `unpaid === 0`, else the number in `RED`.
- Block 5 ends at `Jami chiqim` — no `KASSADA QOLDI`.
- Block 6's `Sof o'zgarish (o'quvchi soni)` uses `countRow`.
- Percentage columns are headed `Jamidan %`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports-excel.summary-sheet.spec.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports-excel.summary-sheet.ts server/src/reports/reports-excel.summary-sheet.spec.ts
git commit -m "Add the Xulosa sheet builder"
```

---

### Task 8: «O'quvchilar» sheet builder

**Files:**
- Create: `server/src/reports/reports-excel.students-sheet.ts`
- Create: `server/src/reports/reports-excel.students-sheet.spec.ts`

**Interfaces:**
- Consumes: Task 6 primitives; `StudentFlow` (Task 5).
- Produces: `export function studentsSheet(wb: Workbook, flow: StudentFlow, periodLine: string, scopeLine: string): void`

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/reports-excel.students-sheet.spec.ts`:

```ts
import { Workbook, Worksheet } from 'exceljs';
import { studentsSheet } from './reports-excel.students-sheet';
import { StudentFlow } from './reports-student-flow.service';

const flow: StudentFlow = {
  month: '2026-07',
  attended: 444,
  inGroup: 427,
  groupless: 76,
  byStatus: [
    { status: 'ACTIVE', count: 503 },
    { status: 'FROZEN', count: 184 },
    { status: 'EXPELLED', count: 134 },
    { status: 'GRADUATED', count: 3 },
  ],
  totalStudents: 824,
  arrived: 72,
  left: { frozen: 73, expelled: 41, graduated: 20, archived: 0, total: 134 },
  netChange: -62,
  dropped: {
    records: 130,
    students: 118,
    stillInGroup: 37,
    groupless: 81,
    grouplessByStatus: [
      { status: 'EXPELLED', count: 35 },
      { status: 'ACTIVE', count: 30 },
      { status: 'FROZEN', count: 13 },
      { status: 'ARCHIVED', count: 3 },
    ],
  },
};

const textOf = (ws: Worksheet): string => {
  const out: string[] = [];
  ws.eachRow((r) => out.push(String(r.getCell(1).value ?? '')));
  return out.join('\n');
};
const valueFor = (ws: Worksheet, label: string): any => {
  let v: any;
  ws.eachRow((r) => {
    if (v === undefined && String(r.getCell(1).value ?? '') === label) v = r.getCell(2).value;
  });
  return v;
};

describe('studentsSheet', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    studentsSheet(wb, flow, 'Davr: 01.07.2026 — 31.07.2026', 'Barcha filiallar');
    ws = wb.getWorksheet("O'quvchilar")!;
  });

  it('leads with who actually attended', () => {
    expect(valueFor(ws, 'Darsga qatnashdi (Iyul 2026)')).toBe(444);
  });

  it('flags the groupless "active" students', () => {
    expect(valueFor(ws, "Guruhsiz (statusi faol, guruhi yo'q)")).toBe(76);
  });

  it('translates statuses into Uzbek', () => {
    const t = textOf(ws);
    expect(t).toContain('Muzlatilgan');
    expect(t).toContain('Chetlatilgan');
    expect(t).not.toContain('FROZEN');
    expect(t).not.toContain('EXPELLED');
  });

  it('shows where dropped students actually went', () => {
    expect(valueFor(ws, "Boshqa guruhda o'qishda davom etyapti")).toBe(37);
    expect(valueFor(ws, "Hech qaysi guruhda yo'q")).toBe(81);
  });

  it('never claims a dropped enrollment means leaving the centre', () => {
    expect(textOf(ws)).toContain("o'qishni tashladi degani EMAS");
  });

  it('carries no share column', () => {
    let header: any[] = [];
    ws.eachRow((r) => {
      if (String(r.getCell(1).value ?? '') === "Ko'rsatkich") {
        header = [r.getCell(2).value, r.getCell(3).value];
      }
    });
    expect(header[0]).toBe('Soni');
    expect(String(header[1] ?? '')).not.toContain('%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-excel.students-sheet.spec.ts`
Expected: FAIL — `Cannot find module './reports-excel.students-sheet'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/reports-excel.students-sheet.ts` by porting the `7. O'QUVCHILAR` block of `server/scripts/_namuna-hisobot-v2.ts`. Include the status label map:

```ts
const ST_LABEL: Record<string, string> = {
  ACTIVE: 'Faol',
  FROZEN: 'Muzlatilgan',
  EXPELLED: 'Chetlatilgan',
  GRADUATED: 'Bitirgan',
  ARCHIVED: 'Arxivlangan',
};
```

Four sections, in order: `Haqiqatda kim o'qiyapti` · `Statusi bo'yicha (bugungi holat)` · `<Oy> harakati` · `Guruhdan chiqqanlar keyin qayerga ketdi (<Oy>)`. No share column anywhere. The footer must carry the line: *«Guruhdan chiqarildi» — o'qishni tashladi degani EMAS. Bir qismi boshqa guruhga o'tgan va o'qishda davom etyapti.*

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports-excel.students-sheet.spec.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports-excel.students-sheet.ts server/src/reports/reports-excel.students-sheet.spec.ts
git commit -m "Add the O'quvchilar sheet builder"
```

---

### Task 9: «Oylar» and «Filiallar» — two revenue columns each

Both sheets currently print one figure a reader takes for cash. They get an explicit pair plus the own-month column.

**Files:**
- Create: `server/src/reports/reports-excel.trend-sheets.ts`
- Create: `server/src/reports/reports-excel.trend-sheets.spec.ts`

**Interfaces:**
- Consumes: Task 6 primitives; `isSalaryDataReliable`.
- Produces:
  ```ts
  export interface MonthRow {
    month: string; recognized: number; cashIn: number; teacherSalary: number;
    operatingExpenses: number; netProfit: number; ownProfit: number;
    closingDebt: number | null; recovered: number | null; recoveryRate: number | null;
  }
  export function monthsSheet(wb: Workbook, rows: MonthRow[], scopeLine: string): void

  export interface BranchRow {
    branchName: string; recognized: number; cashIn: number; teacherSalary: number;
    operatingExpenses: number; refunds: number; netProfit: number; debt: number; inGroup: number;
  }
  export function branchesSheet(wb: Workbook, rows: BranchRow[], periodLine: string, scopeLine: string): void
  ```

- [ ] **Step 1: Write the failing test**

Create `server/src/reports/reports-excel.trend-sheets.spec.ts`:

```ts
import { Workbook, Worksheet } from 'exceljs';
import { monthsSheet, branchesSheet, MonthRow, BranchRow } from './reports-excel.trend-sheets';

const months: MonthRow[] = [
  { month: '2026-05', recognized: 152_415_637, cashIn: 96_568_003, teacherSalary: 33_334,
    operatingExpenses: 24_880_000, netProfit: 127_502_303, ownProfit: 1,
    closingDebt: 81_298_546, recovered: 52_799_356, recoveryRate: 64.9 },
  { month: '2026-06', recognized: 165_086_661, cashIn: 171_933_329, teacherSalary: 66_721_097,
    operatingExpenses: 92_744_000, netProfit: 4_714_564, ownProfit: -26_750_444,
    closingDebt: 75_642_720, recovered: 30_587_180, recoveryRate: 40.4 },
  { month: '2026-07', recognized: 173_783_991, cashIn: 170_378_987, teacherSalary: 95_834_547,
    operatingExpenses: 41_773_000, netProfit: 35_976_444, ownProfit: 4_257_391,
    closingDebt: 76_336_407, recovered: 7_709_283, recoveryRate: 10.1 },
];

const headerOf = (ws: Worksheet, first: string): any[] => {
  let cells: any[] = [];
  ws.eachRow((r) => {
    if (!cells.length && String(r.getCell(1).value ?? '') === first) {
      cells = (r.values as any[]).slice(1);
    }
  });
  return cells;
};
const rowFor = (ws: Worksheet, label: string): any[] => {
  let cells: any[] = [];
  ws.eachRow((r) => {
    if (!cells.length && String(r.getCell(1).value ?? '') === label) {
      cells = (r.values as any[]).slice(1);
    }
  });
  return cells;
};

describe('monthsSheet', () => {
  let ws: Worksheet;
  beforeEach(() => {
    const wb = new Workbook();
    monthsSheet(wb, months, 'Barcha filiallar');
    ws = wb.getWorksheet('Oylar')!;
  });

  it('separates lesson value from cash received', () => {
    const h = headerOf(ws, 'Oy');
    expect(h).toContain("O'tilgan darslar qiymati");
    expect(h).toContain('Kassaga tushgan pul');
  });

  it('shows both figures for July', () => {
    const r = rowFor(ws, 'Iyul 2026');
    expect(r[1]).toBe(173_783_991);
    expect(r[2]).toBe(170_378_987);
  });

  it('suppresses profit for a month whose payroll is incomplete', () => {
    const r = rowFor(ws, 'May 2026');
    expect(r[1]).toBe(152_415_637); // lesson value is real, keep it
    expect(r[3]).toBe('—');         // salary
    expect(r[5]).toBe('—');         // net profit
    expect(r[6]).toBe('—');         // own-month profit
    expect(String(r[10])).toContain("o'tish davri");
  });

  it('shows a negative own-month profit for June', () => {
    expect(rowFor(ws, 'Iyun 2026')[6]).toBe(-26_750_444);
  });
});

describe('branchesSheet', () => {
  it('separates lesson value from cash received per branch', () => {
    const rows: BranchRow[] = [
      { branchName: "Farg'ona filiali", recognized: 173_783_991, cashIn: 170_378_987,
        teacherSalary: 95_834_547, operatingExpenses: 41_773_000, refunds: 200_000,
        netProfit: 35_976_444, debt: 34_594_323, inGroup: 343 },
      { branchName: 'Namangan filali', recognized: 0, cashIn: 0, teacherSalary: 0,
        operatingExpenses: 0, refunds: 0, netProfit: 0, debt: 0, inGroup: 84 },
    ];
    const wb = new Workbook();
    branchesSheet(wb, rows, 'Davr: 01.07.2026 — 31.07.2026', 'Barcha filiallar');
    const ws = wb.getWorksheet('Filiallar')!;

    const h = headerOf(ws, 'Filial');
    expect(h).toContain("O'tilgan darslar qiymati");
    expect(h).toContain('Kassaga tushgan pul');
    expect(h).toContain("Guruhda o'qiyapti");

    const total = rowFor(ws, 'Jami');
    expect(total[1]).toBe(173_783_991);
    expect(total[8]).toBe(427);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-excel.trend-sheets.spec.ts`
Expected: FAIL — `Cannot find module './reports-excel.trend-sheets'`

- [ ] **Step 3: Write the implementation**

Create `server/src/reports/reports-excel.trend-sheets.ts` by porting the `2. OYLAR` and `3. FILIALLAR` blocks of `server/scripts/_namuna-hisobot-v2.ts`.

`monthsSheet` column order (11 columns): `Oy · O'tilgan darslar qiymati · Kassaga tushgan pul · Ustoz oyligi · Xarajat · SOF FOYDA · Oyning o'z foydasi · Oy oxiridagi qarz · Undirildi · Undirish % · Izoh`.

A row where `isSalaryDataReliable(recognized, teacherSalary)` is false renders `'—'` for salary, net profit and own-month profit, keeps the real lesson value and cash figures, and writes the izoh `"Ustoz oyligi to'liq hisoblanmagan (o'tish davri)"`.

`branchesSheet` column order (9 columns): `Filial · O'tilgan darslar qiymati · Kassaga tushgan pul · Ustoz oyligi · Xarajat · Qaytarilgan · SOF FOYDA · Qarz (hozir) · Guruhda o'qiyapti`, plus a `Jami` totals bar.

Both footers must carry: *«O'tilgan darslar qiymati» — shu oy o'tilgan darslar puli. «Kassaga tushgan pul» — shu oy kassaga real kirgan pul. Ular teng bo'lishi shart emas.*

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx jest src/reports/reports-excel.trend-sheets.spec.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports-excel.trend-sheets.ts server/src/reports/reports-excel.trend-sheets.spec.ts
git commit -m "Split lesson value from cash on the Oylar and Filiallar sheets"
```

---

### Task 10: Fix the three carried-over sheets

`Oyliklar` mislabels its period, `Xarajatlar` hides an oversized «Boshqa» bucket, and the 21-term glossary is replaced by a 10-term `Izoh`.

**Files:**
- Modify: `server/src/reports/reports-excel.detail-sheets.ts` (`salariesSheet`, `expensesSheet`)
- Modify: `server/src/reports/reports-excel.sheets.ts` (`glossarySheet`)
- Modify: `server/src/reports/reports-excel.service.spec.ts` (existing assertions on these sheets)

**Interfaces:**
- Consumes: `uzMonthLabel` (Task 6).
- Produces: `salariesSheet(wb, salaries, period, monthLabel: string)` — **new fourth parameter**; `expensesSheet` and `glossarySheet` keep their signatures.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/reports/reports-excel.service.spec.ts`:

```ts
describe('carried-over sheet fixes', () => {
  it('«Oyliklar» names the month its data actually covers', async () => {
    const wb = await buildWorkbook({ startDate: '2026-05-01', endDate: '2026-07-31' });
    const ws = wb.getWorksheet('Oyliklar')!;
    expect(String(ws.getRow(1).getCell(1).value)).toContain('Iyul 2026');
  });

  it('«Xarajatlar» warns when the Boshqa bucket dominates', async () => {
    const wb = await buildWorkbook({
      expenses: {
        rows: [
          { date: '2026-06-10', category: 'OTHER', amount: 65_515_000 },
          { date: '2026-06-11', category: 'RENT', amount: 18_000_000 },
        ],
        total: 83_515_000,
      },
    });
    const ws = wb.getWorksheet('Xarajatlar')!;
    const text: string[] = [];
    ws.eachRow((r) => text.push(String(r.getCell(1).value ?? '')));
    expect(text.join('\n')).toContain('«Boshqa» ulushi');
  });

  it('«Izoh» carries ten plain-language terms and no accounting jargon', async () => {
    const wb = await buildWorkbook({});
    const ws = wb.getWorksheet('Izoh')!;
    const text: string[] = [];
    ws.eachRow((r) => text.push(String(r.getCell(1).value ?? '')));
    const joined = text.join('\n');
    expect(joined).toContain("O'tilgan darslar qiymati");
    expect(joined).toContain("Oyning o'z foydasi");
    expect(joined).not.toContain('Roll-forward');
    expect(joined).not.toContain('Cash tie-out');
    expect(joined).not.toContain('Balanslashuv farqi');
  });
});
```

`buildWorkbook` is a small local helper — write it if the spec file has no equivalent: it overrides the file's existing mock data, calls `service.generate(1, { branchIds: null, ... })`, and loads the buffer into a `Workbook`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/reports/reports-excel.service.spec.ts -t "carried-over sheet fixes"`
Expected: FAIL — the Oyliklar title shows the full period; no Boshqa warning; Izoh still lists `Roll-forward`

- [ ] **Step 3: Implement the three fixes**

**3a — `salariesSheet`** in `reports-excel.detail-sheets.ts`: add the `monthLabel` parameter and use it in the subtitle so a multi-month export cannot mislabel a single-month figure:

```ts
export function salariesSheet(
  wb: Workbook,
  salaries: any,
  period: string,
  monthLabel: string,
) {
  // ...
  // The sheet is a per-month view by design, so the header names THAT month —
  // a 3-month export used to print the whole period above one month's payroll.
  sheetTitle(ws, 'Ustozlar oyligi — hisoblangan', `${monthLabel} darslari uchun`, 9);
```

**3b — `expensesSheet`**: after the totals row, add:

```ts
  // An oversized "Boshqa" bucket means the month's spending cannot be read at
  // all — June 2026 hid 65 515 000 so'm (71% of operating spend) in it. The
  // report surfaces that rather than presenting the split as meaningful.
  const otherTotal = (expenses?.rows ?? [])
    .filter((e: any) => e.category === 'OTHER')
    .reduce((s: number, e: any) => s + (e.amount ?? 0), 0);
  const grand = expenses?.total ?? 0;
  if (grand > 0 && otherTotal / grand > 0.3) {
    const pct = Math.round((otherTotal / grand) * 1000) / 10;
    const w = ws.addRow([
      `DIQQAT: «Boshqa» ulushi ${pct}% (${otherTotal.toLocaleString('ru-RU')} so'm) — bu xarajatlar toifalanmagan, shuning uchun nimaga sarflangani hisobotdan bilinmaydi.`,
    ]);
    w.getCell(1).font = { bold: true, color: { argb: 'FFB06A00' } };
  }
```

**3c — `glossarySheet`**: replace the 21-term array with the 10 terms from the spec (§5 and the prototype's `Izoh` sheet) and delete the `Metodika` row. Keep the exported function name so no call site changes.

**3d — `roomUtilizationSheet`** in `reports-excel.operational-sheets.ts`: its subtitle currently reads `"Joriy holat (davrga bog'liq emas)"`. The global rule is that every sheet states its window in one fixed shape, so change it to the dated form:

```ts
  sheetTitle(ws, 'Xonalar bandligi', `Bugungi holat: ${dmy(tashkentTodayStr())}`, 6);
```

`dmy` and `tashkentTodayStr` are both already exported from `reports-excel.helpers.ts` — add them to this file's import list. Do the same for any other retained sheet whose subtitle names a period without a date; `attendanceSheet` already receives a concrete `period` string and needs no change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx jest src/reports/reports-excel.service.spec.ts`
Expected: PASS — the full excel spec, including the three new tests

- [ ] **Step 5: Commit**

```bash
git add server/src/reports/reports-excel.detail-sheets.ts \
        server/src/reports/reports-excel.sheets.ts \
        server/src/reports/reports-excel.service.spec.ts
git commit -m "Fix the Oyliklar period label, flag oversized Boshqa, shrink the glossary"
```

---

### Task 11: Recompose the workbook

**Files:**
- Modify: `server/src/reports/reports-excel.service.ts`
- Modify: `server/src/reports/reports-excel.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 5–10.
- Produces: `FinancialExcelQuery` gains `include?: string[]` — any of `'buxgalteriya' | 'marketing' | 'qarzdorlar'`. Absent/empty ⇒ the 10 default sheets only.

- [ ] **Step 1: Write the failing test**

Append to `server/src/reports/reports-excel.service.spec.ts`:

```ts
describe('workbook composition', () => {
  it('a default download is exactly the ten sheets, in order', async () => {
    const wb = await buildWorkbook({});
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Xulosa', 'Oylar', 'Filiallar', 'Oyliklar', 'Xarajatlar',
      "To'lovlar", "O'quvchilar", 'Davomat', 'Xonalar bandligi', 'Izoh',
    ]);
  });

  it('has no Muqova sheet — the removed cover listed a Pul oqimi sheet that never existed', async () => {
    const wb = await buildWorkbook({});
    expect(wb.getWorksheet('Muqova')).toBeUndefined();
  });

  it('adds the accounting sheets only when asked', async () => {
    const wb = await buildWorkbook({}, { include: ['buxgalteriya'] });
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Foyda va zarar');
    expect(names).toContain('Balans');
    expect(names).toContain('Tekshiruv');
  });

  it('adds the marketing sheets only when asked', async () => {
    const wb = await buildWorkbook({}, { include: ['marketing'] });
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain('Lidlar');
    expect(names).toContain("O'qituvchilar samaradorligi");
  });

  it('adds the debtor list only when asked', async () => {
    const wb = await buildWorkbook({}, { include: ['qarzdorlar'] });
    expect(wb.worksheets.map((w) => w.name)).toContain('Qarzdorlar');
  });

  it('drops the Filiallar sheet for a single-branch scope', async () => {
    const wb = await buildWorkbook({}, { branchIds: [7] });
    expect(wb.getWorksheet('Filiallar')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/reports/reports-excel.service.spec.ts -t "workbook composition"`
Expected: FAIL — the sheet list still starts with `Muqova`

- [ ] **Step 3: Rewrite `generate()`**

In `reports-excel.service.ts`:

1. Add to `FinancialExcelQuery`:

```ts
  /**
   * Optional sheet groups beyond the ten defaults:
   *   'buxgalteriya' → Foyda va zarar / Balans / Tekshiruv
   *   'marketing'    → Lidlar / O'qituvchilar samaradorligi / O'qituvchi o'zgarishlari
   *   'qarzdorlar'   → Qarzdorlar
   * A CEO opening the report wants one page, not twenty-two; everything else
   * stays available but stays out of the way.
   */
  include?: string[];
```

2. Add a month-arithmetic helper near the top of the file (there is no existing one that shifts a `YYYY-MM`):

```ts
/** 'YYYY-MM' shifted by whole calendar months. */
function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Inclusive last-day bound for a 'YYYY-MM'. */
function monthEndDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}
```

3. Fetch the new datasets. Place this after the existing `Promise.all` blocks so `pl`, `salaries`, `outflows`, `recognizedRevenue` and `np` are already available:

```ts
    const prevMonthStr = shiftMonth(monthStr, -1);
    const nextMonthStr = shiftMonth(monthStr, 1);

    const [
      ownProfitCur,
      ownProfitPrev,
      studentFlow,
      attributionCur,
      attributionNext,
      expectation,
      prevSalaries,
    ] = await Promise.all([
      this.reports.getOwnMonthProfit(companyId, {
        month: monthStr, branchIds, performedById: query.performedById ?? 0,
      }),
      this.reports.getOwnMonthProfit(companyId, {
        month: prevMonthStr, branchIds, performedById: query.performedById ?? 0,
      }),
      safe(this.reports.getStudentFlow(companyId, { month: monthStr, branchIds })),
      this.reports.getIncomeMonthAttribution(companyId, {
        branchIds,
        startDate: `${monthStr}-01`,
        endDate: monthEndDate(monthStr),
      }),
      safe(this.reports.getIncomeMonthAttribution(companyId, {
        branchIds,
        startDate: `${nextMonthStr}-01`,
        endDate: monthEndDate(nextMonthStr),
      })),
      safe(this.reports.getMonthlyExpectation(companyId, { month: monthStr, branchIds })),
      this.reports.getSalaryMonthly(
        companyId, prevMonthStr, query.performedById ?? 0, salaryBranchId,
      ),
    ]);
```

4. Compute the lesson-money sourcing for block 4:

```ts
    // Where the month's lesson money came from. "Paid earlier" is a RESIDUAL:
    // once in-month cash, next-month late cash and the still-unpaid balance are
    // known, whatever remains was already sitting on student balances. It is an
    // inference, not a measurement — which is why the sheet labels it
    // "balansdagi pul" rather than claiming a payment date.
    const paidNextMonth =
      attributionNext?.late.find((l: any) => l.monthKey === monthStr)?.amount ?? 0;
    const lessonMoney = {
      paidInMonth: attributionCur.currentMonth,
      paidNextMonth,
      unpaid: expectation?.remainingValue ?? 0,
      paidEarlier:
        recognizedRevenue - attributionCur.currentMonth - paidNextMonth,
    };
```

5. Assemble the cash-outflow list for block 5 (0-amount lines are dropped so the block shows only what actually moved):

```ts
    const cashOut = [
      { label: "Ustoz oyligi (naqd to'langan)", amount: pl?.costOfServices?.teacherSalaries ?? 0 },
      { label: 'Ustozga avans', amount: pl?.costOfServices?.teacherAdvances ?? 0 },
      ...(pl?.operatingExpenses?.byCategory ?? []).map((e: any) => ({
        label: EXPENSE_LABELS[e.category] ?? e.category,
        amount: e.amount ?? 0,
      })),
      { label: 'Xodimlar oyligi (naqd)', amount: pl?.operatingExpenses?.adminSalaries ?? 0 },
      { label: "O'quvchiga qaytarilgan", amount: np.refunds },
    ].filter((x) => x.amount > 0);
```

6. Assemble the summary input and the two table inputs:

```ts
    const periodLine = `Davr: ${dmy(rangeStart)} — ${dmy(rangeEnd)} (${uzMonthLabel(monthStr)})`;
    const scopeLine = `${query.companyName ?? 'DaF Sprachzentrum'} · ${query.branchLabel ?? 'Barcha filiallar'} · yaratildi ${nowLabel()} · summalar so'mda`;

    const summaryInput: SummaryInput = {
      month: monthStr,
      prevMonth: prevMonthStr,
      periodLine,
      scopeLine,
      cur: {
        np,
        covered: salaries?.totals?.covered ?? null,
        centerFunded: salaries?.totals?.centerFunded ?? null,
        recognized: recognizedRevenue,
      },
      prev: {
        np: ownProfitPrev.netProfit,
        covered: prevSalaries?.totals?.covered ?? null,
        centerFunded: prevSalaries?.totals?.centerFunded ?? null,
      },
      ownMoney: { cur: ownProfitCur.ownMoney, prev: ownProfitPrev.ownMoney },
      ownProfit: { cur: ownProfitCur.ownMonthProfit, prev: ownProfitPrev.ownMonthProfit },
      attribution: {
        total: attributionCur.total,
        currentMonth: attributionCur.currentMonth,
        late: attributionCur.late,
      },
      paymentCount: (payments?.rows ?? []).length,
      payerCount: new Set((payments?.rows ?? []).map((p: any) => p.student?.id)).size,
      lessonMoney,
      nextMonthLabel: uzMonthLabel(nextMonthStr),
      cashOut,
      students: studentFlow!,
    };
```

**Oylar rows.** One `getOwnMonthProfit` per month covers revenue, salary, expenses, refunds, net profit and own-month profit in a single call, so no extra fan-out is needed. Months come from `debtHistory.months` (already fetched), truncated to the last 12 up to and including `monthStr`:

```ts
    const monthKeys: string[] = (debtHistory.months ?? [])
      .map((m: any) => m.monthKey)
      .filter((m: string) => m <= monthStr)
      .slice(-12);

    const monthRows: MonthRow[] = await Promise.all(
      monthKeys.map(async (m) => {
        const own =
          m === monthStr ? ownProfitCur
          : m === prevMonthStr ? ownProfitPrev
          : await this.reports.getOwnMonthProfit(companyId, {
              month: m, branchIds, performedById: query.performedById ?? 0,
            });
        const d = (debtHistory.months ?? []).find((x: any) => x.monthKey === m);
        return {
          month: m,
          recognized: own.netProfit.revenue,
          cashIn: own.cashTotal,
          teacherSalary: own.netProfit.teacherSalary,
          operatingExpenses: own.netProfit.operatingExpenses,
          netProfit: own.netProfit.netProfit,
          ownProfit: own.ownMonthProfit,
          closingDebt: d?.closingDebt ?? null,
          recovered: d?.recovered ?? null,
          recoveryRate: d?.recoveryRate ?? null,
        };
      }),
    );
```

**Filiallar rows** (company-wide scope only). Teacher salary now lands on the branch, which is sound because one teacher teaches in one branch (`docs/branch-decisions.md` D6):

```ts
    const branchRows: BranchRow[] = companyWide
      ? await Promise.all(
          Object.entries(branchNames).map(async ([idStr, name]) => {
            const id = Number(idStr);
            const [own, dl, flow] = await Promise.all([
              this.reports.getOwnMonthProfit(companyId, {
                month: monthStr, branchIds: [id], performedById: query.performedById ?? 0,
              }),
              this.reports.getDebtorLineItems(companyId, [id]),
              safe(this.reports.getStudentFlow(companyId, { month: monthStr, branchIds: [id] })),
            ]);
            return {
              branchName: name,
              recognized: own.netProfit.revenue,
              cashIn: own.cashTotal,
              teacherSalary: own.netProfit.teacherSalary + own.netProfit.adminSalary,
              operatingExpenses: own.netProfit.operatingExpenses,
              refunds: own.netProfit.refunds,
              netProfit: own.netProfit.netProfit,
              debt: dl?.total ?? 0,
              inGroup: flow?.inGroup ?? 0,
            };
          }),
        )
      : [];
```

7. Replace the sheet calls:

```ts
    const include = new Set(query.include ?? []);

    summarySheetV2(wb, summaryInput);
    monthsSheet(wb, monthRows, scopeLine);
    if (companyWide) branchesSheet(wb, branchRows, periodLine, scopeLine);
    salariesSheet(wb, salaries, period, uzMonthLabel(monthStr));
    expensesSheet(wb, expenses, branchNames, period);
    paymentsSheet(wb, payments, branchNames, period);
    if (studentFlow) studentsSheet(wb, studentFlow, periodLine, scopeLine);
    attendanceSheet(wb, attendance, opPeriod);
    if (!dropPointInTime) roomUtilizationSheet(wb, rooms, opPeriod);

    if (include.has('buxgalteriya')) {
      profitLossSheet(wb, pl, period);
      if (!dropPointInTime) balanceSheet(wb, bs);
      reconciliationSheet(wb, recon, pl, payments, expenses, salaries, debtors, bs, period, !dropPointInTime, np);
    }
    if (include.has('marketing')) {
      leadsSheet(wb, leads, opPeriod);
      teacherPerformanceSheet(wb, teacherPerf, opPeriod);
      teacherChangesSheet(wb, teacherChanges, opPeriod);
    }
    if (include.has('qarzdorlar') && !dropPointInTime) {
      debtorsSheet(wb, debtors, branchNames);
    }
    glossarySheet(wb);
```

8. **Delete** the `coverSheet` call and its import; delete the `netProfitSheet`, `methodsSheet`, `trendSheet`, `monthlyDebtSheet`, `perBranchSheet`, `kpiSheet`, `studentFlowSheet`, `groupFillSheet`, `comparisonSheet` and `yearlyTrendSheet` calls plus their now-unused imports and the comparison-window computation. The builder files stay on disk — `generateDebtHistory` still uses `monthlyDebtSheet`, `debtorsCohortSheet`, `recoveredPaymentsSheet` and `writeOffsSheet`, so do not delete those.

9. Update the class doc comment to describe the ten sheets and the three include groups.

- [ ] **Step 4: Run the full excel spec**

Run: `cd server && npx jest src/reports/reports-excel.service.spec.ts`
Expected: PASS — existing assertions that targeted removed sheets must be deleted or retargeted, not weakened

- [ ] **Step 5: Run the whole server suite**

Run: `cd server && npm test`
Expected: PASS — all suites

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/reports-excel.service.ts server/src/reports/reports-excel.service.spec.ts
git commit -m "Recompose the workbook into ten sheets plus three opt-in groups"
```

---

### Task 12: Wire the query parameter and the download popover

**Files:**
- Modify: `server/src/reports/dto/reports-query.dto.ts`
- Modify: `server/src/reports/reports.controller.ts` (the `financial-excel` handler, ~line 392-440)
- Modify: `client/src/components/payments/export-options-popover.tsx`
- Modify: `server/src/telegram-groups/telegram-group-report-menu.service.ts` (call site)

**Interfaces:**
- Consumes: `include?: string[]` on `FinancialExcelQuery` (Task 11).
- Produces: `GET /reports/financial-excel?include=buxgalteriya,marketing,qarzdorlar`. Absent ⇒ ten sheets.

- [ ] **Step 1: Add the DTO field**

In `reports-query.dto.ts`, replace the `compare` / `compareStartDate` / `compareEndDate` fields — the comparison sheets are gone — with:

```ts
  // Optional sheet groups for the Excel export: CSV of
  // "buxgalteriya" | "marketing" | "qarzdorlar". Absent = the ten defaults.
  @IsOptional()
  @IsString()
  include?: string;
```

Grep for other readers of `compare` before deleting (`grep -rn "query.compare" server/src client/src`) and remove them in the same commit.

- [ ] **Step 2: Parse it in the controller**

Replace the `compareModes` parsing block in `exportFinancialExcel` with:

```ts
    const validGroups = ['buxgalteriya', 'marketing', 'qarzdorlar'];
    const include = (query.include ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => validGroups.includes(s));
```

and pass `include` into `this.reportsExcelService.generate(...)` in place of `compareModes` / `compareStartDate` / `compareEndDate`. Change the download filename to `hisobot-<startDate>_<endDate>.xlsx`.

- [ ] **Step 3: Rebuild the popover**

In `export-options-popover.tsx`, replace `COMPARE_OPTS` and its state with:

```tsx
// Sheet groups offered on download. Unticked = the ten-sheet report only.
const EXTRA_OPTS = [
  { key: "buxgalteriya", label: "Buxgalteriya", hint: "Foyda va zarar, Balans, Tekshiruv" },
  { key: "marketing", label: "Marketing va ustozlar", hint: "Lidlar, ustozlar samaradorligi" },
  { key: "qarzdorlar", label: "Qarzdorlar ro'yxati", hint: "Har bir qarzdor o'quvchi" },
] as const;

type ExtraKey = (typeof EXTRA_OPTS)[number]["key"];
```

State becomes `const [extras, setExtras] = useState<Record<ExtraKey, boolean>>({ buxgalteriya: false, marketing: false, qarzdorlar: false });`

In `download()`, replace the `compare` params with:

```tsx
      const active = EXTRA_OPTS.filter((o) => extras[o.key]).map((o) => o.key);
      const params: Record<string, string | number> = {
        startDate: startStr,
        endDate: endStr,
        include: active.join(","),
      };
```

and set `a.download = \`hisobot-${startStr}_${endStr}.xlsx\`;`.

Replace the «Taqqoslash (ixtiyoriy)» section label with «Qo'shimcha bo'limlar (ixtiyoriy)» and the helper text with «Bo'sh qoldirilsa — 10 varaqli qisqa hisobot chiqadi.» Render each option's `hint` as muted text under its label. Delete the custom date-range `DatePicker` pair and the now-unused `cmpStart` / `cmpEnd` state and `date-fns` imports.

- [ ] **Step 4: Fix the Telegram call site**

In `telegram-group-report-menu.service.ts`, every `generate()` call passes `compareModes` (`[]`, `['custom']`, `['yearly']`). Replace with `include: []` and drop `compareStartDate` / `compareEndDate`. The comparison and yearly menu leaves (`rm:cmp`, `rm:ca`, `rm:cb`, `rm:pre`, `rm:py`) no longer have a sheet to produce — point them at a plain single-month export and update their button labels, or remove those branches. Keep `hidePointInTimeForPastPeriod: true` on every bot export.

- [ ] **Step 5: Verify both sides build and pass**

Run: `cd server && npm test`
Expected: PASS

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add server/src/reports/dto/reports-query.dto.ts \
        server/src/reports/reports.controller.ts \
        server/src/telegram-groups/telegram-group-report-menu.service.ts \
        client/src/components/payments/export-options-popover.tsx
git commit -m "Swap the comparison checkboxes for opt-in sheet groups"
```

---

### Task 13: Production pre-flight

The spec records real production figures as the acceptance criterion. A green test suite does not prove the workbook reports the right numbers.

**Files:**
- Create: `server/scripts/verify-hisobot-preflight.ts`
- Delete: `server/scripts/_namuna-hisobot-v2.ts`, `server/scripts/_namuna-direktor-hisoboti.ts`, `server/scripts/_probe-hisobot-v2.ts`, `server/scripts/_probe-hisobot-v3.ts`, `server/scripts/_probe-iyul-kassa-vs-dars.ts`, `server/scripts/_probe-iyun-isbot.ts`, `server/scripts/_probe-dropped-meaning.ts`

**Interfaces:**
- Consumes: `ReportsExcelService.generate` through the same standalone wiring `scripts/generate-financial-excel.ts` already uses.
- Produces: a script that exits non-zero on any mismatch.

- [ ] **Step 1: Write the verification script**

Create `server/scripts/verify-hisobot-preflight.ts`. It wires the report services exactly as `scripts/generate-financial-excel.ts` does, calls `generate(companyId, { branchIds: null, startDate: '2026-07-01', endDate: '2026-07-31', performedById: <ceoId> })`, loads the buffer, and asserts:

```ts
const EXPECTED: Array<[string, string, number | string]> = [
  ['Xulosa', "O'tilgan darslar qiymati", 173_783_991],
  ['Xulosa', '−  Ustoz oyligi (jami hisoblangan)', 95_834_547],
  ['Xulosa', "o'quvchilar to'lagan qismi", 80_321_275],
  ['Xulosa', "markaz qo'shimchasi", 15_513_272],
  ['Xulosa', '−  Xarajatlar (ijara, marketing, kommunal…)', 41_773_000],
  ['Xulosa', '=  SOF FOYDA', 35_976_444],
  ['Xulosa', "Iyul 2026ning o'z puli", 142_064_938],
  ['Xulosa', "=  IYUL 2026NING O'Z FOYDASI", 4_257_391],
  ['Xulosa', 'Jami tushgan pul', 170_378_987],
  ['Xulosa', "Hali to'lanmay qolgan", "Yo'q — hammasi to'langan"],
  ['Xulosa', 'Darsga qatnashdi (Iyul 2026)', 444],
  ['Xulosa', "Guruhda o'qiyapti", 427],
  ['Xulosa', "Guruhsiz (statusi faol, guruhi yo'q)", 76],
];
```

For each entry it finds the row whose column 1 matches the label and compares column 2, printing `MOS` / `XATO` per line and a final summary. Exit code 1 if any `XATO`. Also assert the sheet list equals the ten default names and that no cell anywhere contains `'undefined'` or `'NaN'`.

Header comment must state: read-only, run with `railway run` for production.

- [ ] **Step 2: Run it against production**

Run: `cd server && railway run npx ts-node --transpile-only scripts/verify-hisobot-preflight.ts`
Expected: every line `MOS`, exit code 0

If any line reports `XATO`, fix the cause before continuing — the expected values were measured from production on 2026-08-06 and only `Hali to'lanmay qolgan` may legitimately drift (a July debtor paying later cannot change it; a *reversal* could).

- [ ] **Step 3: Open the workbook and read it once, end to end**

Run: `cd server && open reports/hisobot-2026-07.xlsx` (or whatever path the script writes)

Confirm by eye: no empty comparison column headers, no `so'm` suffix on any count, every sheet has its period line, «Guruhdan chiqqanlar keyin qayerga ketdi» is present, no «KASSADA QOLDI» row.

- [ ] **Step 4: Remove the throwaway prototypes**

```bash
cd server && rm scripts/_namuna-hisobot-v2.ts scripts/_namuna-direktor-hisoboti.ts \
  scripts/_probe-hisobot-v2.ts scripts/_probe-hisobot-v3.ts \
  scripts/_probe-iyul-kassa-vs-dars.ts scripts/_probe-iyun-isbot.ts \
  scripts/_probe-dropped-meaning.ts
```

- [ ] **Step 5: Final full verification**

Run: `cd server && npm test`
Expected: PASS

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add server/scripts/verify-hisobot-preflight.ts
git add -u server/scripts
git commit -m "Add the production pre-flight check and drop the prototypes"
```

---

## Deployment note

Backend is **not** GitHub-connected — merging to `main` does not deploy. After the PR merges, deploy with `railway up` from a clean tree, and deploy the client from a clean `origin/main` worktree (Vercel is not git-connected either). Both steps are manual and belong to the person merging, not to this plan.
