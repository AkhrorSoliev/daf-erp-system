# O'tgan oylar oyligini yopish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the May–August 2026 payroll months (paid outside the system) by the CEO's 27.09 rules, and stop the P&L from reading accrual-less teacher pay as staff pay.

**Architecture:** `recordSalaryPayment` learns to skip the cash journal for payouts that predate it. The month-settle logic splits into a shared core (candidates, date check, writer) used by the existing button service and a new per-payment-allocation service. A one-off script builds the CEO's allocation (teacher 50/50, staff cash, pre-journal month without a movement) and drives the new service, dry-run first over a read-only connection. The P&L classifies staff pay by the payee (global FIXED_MONTHLY rate, no Teacher role, no accruals).

**Tech Stack:** NestJS 11, Prisma 7 (`@prisma/adapter-pg`), Jest, ts-node scripts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-27-otgan-oylar-oyligini-yopish-design.md`.
- New code comments, commit messages and PR text in English; user-facing error strings in Latin Uzbek.
- No production ids, names or per-person amounts in any committed file (the repo is public).
- Do not push `salary-settle-month.service.ts` past 500 lines; new files stay under 500.
- The existing `salary-settle-month.service.spec.ts` must pass unchanged.
- Money paths use Serializable transactions (`maxWait 10000`, `timeout 15000`), same as today.
- Run server commands from `server/` in the worktree `.worktrees/oylik-yopish`.

---

### Task 1: `recordSalaryPayment` — `predatesCashJournal`

**Files:**
- Modify: `server/src/transactions/transactions-write.service.ts` (`recordSalaryPayment`)
- Modify: `server/src/transactions/transactions.service.ts` (facade param type)
- Test: `server/src/transactions/transactions-write.service.spec.ts` (describe `recordSalaryPayment — cash account + description`)

**Interfaces:**
- Produces: `recordSalaryPayment(params & { predatesCashJournal?: boolean }, tx?)` on both `TransactionsWriteService` and `TransactionsService`.

- [ ] **Step 1: Write the failing tests** (append inside the `cash account + description` describe)

```ts
  // May 2026 was paid out before Farg'ona's cash journal opened (15.06). That
  // money never passed through a drawer the system knows about.
  it('writes no cash movement for a payout that predates the cash journal', async () => {
    await service.recordSalaryPayment({ ...base, predatesCashJournal: true });

    expect(cashMovements.recordOutflow).not.toHaveBeenCalled();
    expect(prisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'SALARY_PAYMENT',
          amount: -1_000_000,
        }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { balance: 4_000_000 },
    });
  });

  it('refuses a pre-journal payout that also names cash accounts', async () => {
    await expect(
      service.recordSalaryPayment({
        ...base,
        predatesCashJournal: true,
        cashSlices: [{ cashAccountId: 'kassa', amount: 1_000_000 }],
      }),
    ).rejects.toThrow(/kassa jurnali/i);

    expect(prisma.transaction.create).not.toHaveBeenCalled();
    expect(cashMovements.recordOutflow).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest src/transactions/transactions-write.service.spec.ts -t "predates|pre-journal"`
Expected: FAIL (movement written / no throw).

- [ ] **Step 3: Implement**

In the params type add:

```ts
      /**
       * The payout happened before the payee's branch opened its cash journal
       * (accounts start at 0 with no opening balance), so there is no drawer
       * row the money could have left. The ledger row and the balance change
       * are still written; no `CashMovement` is. Contradicts `cashSlices`.
       */
      predatesCashJournal?: boolean;
```

Before `runInTx`:

```ts
    if (params.predatesCashJournal && params.cashSlices?.length) {
      throw new Error(
        "Kassa jurnalidan oldingi to'lovga kassa hisobi berib bo'lmaydi",
      );
    }
```

Wrap the outflow loop:

```ts
      if (!params.predatesCashJournal) {
        const outflows = slices.length
          ? slices.map((s) => ({ cashAccountId: s.cashAccountId, amount: s.amount }))
          : [{ cashAccountId: undefined, amount: params.amount }];
        for (const out of outflows) {
          await this.cashMovements.recordOutflow({ /* unchanged body */ }, client);
        }
      }
```

In `transactions.service.ts` add `predatesCashJournal?: boolean;` to the `recordSalaryPayment` params type.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest src/transactions/transactions-write.service.spec.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** — `feat(transactions): record a salary payout that predates the cash journal`

---

### Task 2: Extract the settle core (behaviour unchanged)

**Files:**
- Create: `server/src/salary/salary-settle-core.ts`
- Modify: `server/src/salary/salary-settle-month.service.ts`
- Test: `server/src/salary/salary-settle-month.service.spec.ts` (unchanged, must pass)

**Interfaces:**
- Produces (exported from `salary-settle-core.ts`):
  - `SETTLE_TX`, `SETTLE_DESCRIPTION`
  - `interface SettleRow { paymentId; userId; fullName; branchId: number | null; branchName: string | null; amount; status }`
  - `loadSettleCandidates(prisma, month: string | undefined, companyId, performedById): Promise<{ scope: MonthlyScope; rows: SettleRow[]; total: number }>`
  - `parseSettlePaidAt(paidAt: string, periodStart: Date): Date` (throws `BadRequestException`)
  - `assertSettleTransitions(rows: SettleRow[]): void`
  - `type SettleCashPlan = { cashSlices?: { cashAccountId: string; amount: number }[]; predatesCashJournal?: boolean }`
  - `writeSettledRows(prisma, transactions, rows, planByPayment: Map<string, SettleCashPlan>, meta: { paidAt: Date; paidAtStr: string; note?: string; performedById: number; companyId: number }): Promise<{ paymentIds: string[]; total: number }>`
  - `buildSettleNote(existing, paidAtStr, userNote?)` (moved; re-exported from the service file)

- [ ] **Step 1:** Move `loadCandidates` (verbatim body), the two `paidAt` checks, the transition loop, the per-payment write loop and `buildSettleNote` into `salary-settle-core.ts` as the functions above. The writer keeps: `$transaction(cb, SETTLE_TX)`, re-read `{status, note}`, skip `PAID`, `recordSalaryPayment({ userId, amount, salaryPaymentId, companyId, performedById, cashSlices, predatesCashJournal, description: SETTLE_DESCRIPTION }, tx)`, then `salaryPayment.update({ status: PAID, paidAt, paidById, note: buildSettleNote(...) })`.
- [ ] **Step 2:** Rewrite `SalarySettleMonthService.preview/settle` to call them in the same order as today (rows empty → confirmAmount → paidAt → accounts → no-branch → no-account → branch totals → transitions → write with `planByPayment = allocateCashSlices(...)` mapped to `{ cashSlices }`). Keep `allocateCashSlices` in the service file; `export { buildSettleNote, SettleRow }` from it.
- [ ] **Step 3:** Run `npx jest src/salary/salary-settle-month.service.spec.ts` — Expected: PASS, no test edited.
- [ ] **Step 4: Commit** — `refactor(salary): share the month-settle core`

---

### Task 3: `SalarySettleAllocatedService`

**Files:**
- Create: `server/src/salary/salary-settle-allocated.service.ts`
- Modify: `server/src/salary/salary.module.ts` (provider)
- Test: `server/src/salary/salary-settle-allocated.service.spec.ts`

**Interfaces:**
- Consumes: everything Task 2 exports; `TransactionsService.recordSalaryPayment` with `predatesCashJournal` (Task 1).
- Produces:

```ts
export interface AllocatedPaymentPlan {
  paymentId: string;
  cashSlices?: { cashAccountId: string; amount: number }[];
  predatesCashJournal?: boolean;
}
export interface SettleAllocatedInput {
  month: string; // YYYY-MM, must survive the report's floor unchanged
  paidAt: string; // YYYY-MM-DD
  note?: string;
  payments: AllocatedPaymentPlan[];
}
export interface SettleAllocatedResult {
  month: string;
  paidAt: Date;
  dryRun: boolean;
  count: number;
  total: number;
  paymentIds: string[];
  rows: SettleRow[];
  perAccount: { cashAccountId: string; amount: number }[];
  predatesCashJournalTotal: number;
}
// SalarySettleAllocatedService.settle(input, companyId, performedById, opts?: { dryRun?: boolean })
```

- [ ] **Step 1: Write the failing tests** (same prisma/transactions mock shape as `salary-settle-month.service.spec.ts`: `salaryPayment.findMany/findUnique/update`, `cashAccount.findMany`, `$transaction: cb => cb(prisma)`, `resolveMonthlyScope` mocked to the 2026-07 scope). Cases:
  1. refuses a plan missing one of the month's rows (400, nothing written);
  2. refuses a plan naming a payment outside the month (400);
  3. refuses when the report floored the month (`scope.month !== input.month`) (400);
  4. refuses slices that do not sum to the payment (400);
  5. refuses an account of another branch (400);
  6. refuses a future `paidAt` (400);
  7. refuses slices together with `predatesCashJournal` (400);
  8. `dryRun` returns per-account totals and the pre-journal total and writes nothing;
  9. happy path: each payment gets its own slices / flag, `PAID`, `paidAt` = 00:00 Tashkent of the date, audit note;
  10. a row already `PAID` inside the tx is skipped.

- [ ] **Step 2:** Run `npx jest src/salary/salary-settle-allocated.service.spec.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** — order: load candidates → empty → month floor check → plan set equality (duplicates, missing names, extra ids) → `parseSettlePaidAt` → per-row plan shape (flag xor slices, non-negative integer slices summing to the amount) → accounts (`cashAccount.findMany` active/company/not deleted; branch match per row) → `assertSettleTransitions` → summary → `dryRun` return → `writeSettledRows`.
- [ ] **Step 4:** Register the provider in `salary.module.ts`; run the spec — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(salary): settle a month from a per-payment cash plan`

---

### Task 4: P&L staff/teacher split by payee

**Files:**
- Modify: `server/src/reports/reports-profit-loss.service.ts`
- Test: `server/src/reports/reports-profit-loss.service.spec.ts`

**Interfaces:**
- Produces: `export function isStaffPayout(sp: { _count: { accruals: number }; user: { salaryConfigs: unknown[]; roles: unknown[] } }): boolean`

- [ ] **Step 1: Failing tests** — update the fixture rows to carry `user: { salaryConfigs, roles }` and add:

```ts
  it('counts an accrual-less TEACHER payout as teacher pay (May 2026 was entered from a spreadsheet)', async () => {
    prisma.salaryPayment.findMany.mockResolvedValue([
      { amount: 400_000, _count: { accruals: 0 }, user: { salaryConfigs: [], roles: [{ roleId: 3 }] } },
    ]);
    const pl = await service.getProfitLoss(1, { branchIds: null });
    expect(pl.costOfServices.teacherSalaries).toBe(400_000);
    expect(pl.operatingExpenses.adminSalaries).toBe(0);
  });

  it('counts a fixed-monthly payout of a non-teacher as staff pay', async () => {
    prisma.salaryPayment.findMany.mockResolvedValue([
      { amount: 150_000, _count: { accruals: 0 }, user: { salaryConfigs: [{ id: 'c' }], roles: [] } },
    ]);
    const pl = await service.getProfitLoss(1, { branchIds: null });
    expect(pl.operatingExpenses.adminSalaries).toBe(150_000);
    expect(pl.costOfServices.teacherSalaries).toBe(0);
  });

  it('keeps a fixed-monthly TEACHER on the teacher side', async () => {
    prisma.salaryPayment.findMany.mockResolvedValue([
      { amount: 150_000, _count: { accruals: 0 }, user: { salaryConfigs: [{ id: 'c' }], roles: [{ roleId: 3 }] } },
    ]);
    const pl = await service.getProfitLoss(1, { branchIds: null });
    expect(pl.costOfServices.teacherSalaries).toBe(150_000);
  });
```

- [ ] **Step 2:** Run the spec — Expected: FAIL.
- [ ] **Step 3: Implement** — select `user: { select: { salaryConfigs: { where: { salaryType: 'FIXED_MONTHLY', groupId: null }, select: { id: true }, take: 1 }, roles: { where: { role: { name: 'Teacher' } }, select: { roleId: true }, take: 1 } } }`; classify with `isStaffPayout`; update the header comment (the old accrual-count rule and why it broke).
- [ ] **Step 4:** Run the spec — Expected: PASS.
- [ ] **Step 5: Commit** — `fix(reports): classify paid salary as staff by the payee, not by accrual count`

---

### Task 5: Script `scripts/settle-past-salary-months.ts` + docs

**Files:**
- Create: `server/scripts/settle-past-salary-months.ts`
- Modify: `server/CLAUDE.md` (month-settle section: flag, allocated service, script, P&L rule)

**Interfaces:**
- Consumes: `loadSettleCandidates` (Task 2), `SalarySettleAllocatedService` (Task 3).

- [ ] **Step 1:** Implement the script:
  - args: `--months=YYYY-MM[,…]` (required), `--as=<userId>` (required; the approving CEO), `--pay-day=10`, `--apply`;
  - without `--apply`: append `options=-c default_transaction_read_only=on` to `DATABASE_URL` before building `PrismaService`;
  - services built by hand (`PrismaService`, `CashMovementsService`, `TransactionsWriteService`, `TransactionsReadService`, `TransactionsService`, `SalarySettleAllocatedService`) — no Nest app context, so no cron or bot starts;
  - per month: candidates → staff = global FIXED_MONTHLY config and no Teacher role (abort if a staff row has accruals) → each branch's single active CASH and BANK account (abort otherwise) → journal start = earliest `CashMovement.createdAt` over all the branch's accounts → plan (pre-journal: flag; staff: all cash; teacher: cash = ceil(a/2), card = floor(a/2); zero parts dropped) → `settle(..., { dryRun: !apply })`;
  - print per-row table and per-account before/after; after an apply, re-read that month: no unpaid rows left, one active `SALARY_PAYMENT` row per payment, movements per account equal the plan.
- [ ] **Step 2:** `npx tsc --noEmit -p tsconfig.json` equivalent check via `npm run typecheck`; `npx eslint scripts/settle-past-salary-months.ts src/salary src/transactions src/reports/reports-profit-loss.service.ts`.
- [ ] **Step 3:** Update `server/CLAUDE.md`.
- [ ] **Step 4: Commit** — `feat(salary): script to close past payroll months by the CEO's rules`

---

### Task 6: Verify

- [ ] `npm run build` → exit 0.
- [ ] `npx jest --runInBand src/salary src/transactions src/reports` → PASS; full `npm test` in background → PASS.
- [ ] Dry run against production (read-only connection) and show the CEO the table before any `--apply`.
