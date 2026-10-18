# Staff monthly salary — manual correction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CEO set, per staff member and calendar month, the pay figure that replaces the prorated formula — one resolver shared by the payroll cron and every report — without touching rate versions.

**Architecture:** A new table `StaffSalaryAdjustment` (one row per company, user, month). A pure `resolveStaffMonthly` (`override ?? prorateFixedMonthly`) is the only caller of `prorateFixedMonthly`; the payroll cron's FIXED_MONTHLY branch and `SalaryStaffMonthlyService` both call it. A new `StaffSalaryAdjustmentService` upserts/deletes the row and, when the month's `SalaryPayment` is `CALCULATED`, recomputes it in the same Serializable transaction using an advance-settle walk lifted out of the cron. Two CEO-only routes under the new capability `salary.adjust`; the «Ish haqi» row drawer shows the figure and a «To'g'rilash» dialog.

**Tech Stack:** NestJS + Prisma 7 (PostgreSQL), Jest (server), Next.js + React Query + vitest (client).

**Spec:** `docs/superpowers/specs/2026-10-18-xodim-oyligini-qolda-tuzatish-design.md` — read it first.

## Global Constraints

- Work only in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/xodim-oylik-qolda` (branch `worktree-xodim-oylik-qolda`). Never `cd` out of it. The main checkout has the CEO's uncommitted work: never touch it.
- Server commands run from `server/`, client commands from `client/`. The worktree has no `node_modules`: run `npm install` in `server/` and `client/` once before the first test (Task 1, Step 1).
- Commit messages and new code comments in **English**; user-visible texts, ADR and the user guide in **Uzbek (Latin only)**. Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Money is integer so'm. Dates: the payroll month is a Tashkent calendar month; build periods through `resolveCurrentPeriod` / `parseTashkentDateStart` (`salary/shared/resolve-current-period.ts`), never by hand. The month key of a period is `tashkentMonthKey(periodStart)`.
- Every id-addressed salary write checks `assertPayrollCoversUser` (`salary/shared/payroll-branch-scope.ts`).
- A mutation records history through `EntityHistoryService` with the transaction's client (`tx`), so a rolled-back write leaves no trail.
- Financial UI never updates optimistically; after a write call `useInvalidateSalary()`.
- Run `npx prettier --write` on every server file you touch (CI-blocking). **Never** run Prettier in `client/`.
- Do not re-run a test/build command until a code change relevant to its failure has been made.
- No `TODO` / placeholders in committed code. A deliberate simplification gets a `// ponytail:` comment naming its ceiling.

## File Structure

**Server — create**
- `server/prisma/migrations/20261018120000_staff_salary_adjustment/migration.sql` — the table.
- `server/src/salary/shared/staff-monthly-amount.ts` (+ `.spec.ts`, `.single-source.spec.ts`) — the one resolver.
- `server/src/salary/shared/advance-settle.ts` (+ `.spec.ts`) — settle walk lifted out of the cron.
- `server/src/salary/staff-salary-adjustment.service.ts` (+ `.spec.ts`) — upsert / delete + payment recompute.
- `server/src/salary/dto/staff-salary-adjustment.dto.ts` — `SetStaffAdjustmentDto`, `ClearStaffAdjustmentQueryDto`.

**Server — modify**
- `server/prisma/schema.prisma` — model + two `User` back-relations.
- `server/src/salary/salary-calculation.service.ts` — resolver in the FIXED_MONTHLY branch; `applyPendingAdvances` delegates to `advance-settle.ts`.
- `server/src/salary/salary-monthly-staff.service.ts` (+ spec) — resolver, `calculated`, `adjustment` on `StaffRow`.
- `server/src/salary/salary.controller.ts` (+ spec), `server/src/salary/salary.module.ts` — two routes, provider.
- `server/src/common/permissions/permission-catalog.money.ts`, `permission-catalog.spec.ts`, `route-access.snapshot.json`; `server/src/common/auth/branch-route-policy.ts`.
- `server/CLAUDE.md` — one bullet.

**Client — create** (all in `client/src/components/payments/salary/`)
- `salary-adjustment-model.ts` (+ `.test.ts`), `salary-adjustment-dialog.tsx`.

**Client — modify**
- `salary-types.ts`, `salary-page-model.ts` (+ test), `salary-people-table.tsx`, `salary-drawer-sections.tsx`, `salary-row-drawer.tsx`; `client/src/lib/permission-keys.ts`.

**Docs**
- `docs/adr/0112-xodim-oyligini-qolda-tuzatish.md`, `docs/adr/README.md`, `client/src/qollanma/kontent/tolovlar/ish-haqi.mdx`, `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/yangiliklar.ts`, the spec (one sync edit).

---

### Task 1: Schema and migration

**Files:**
- Modify: `server/prisma/schema.prisma`
- Create: `server/prisma/migrations/20261018120000_staff_salary_adjustment/migration.sql`

**Interfaces:**
- Produces: Prisma model `StaffSalaryAdjustment` (`prisma.staffSalaryAdjustment`) with fields `id, companyId, userId, month, amount, calculatedAmount, reason, createdById, createdAt, updatedAt`; unique key name `companyId_userId_month`; relations `user`, `createdBy`.

- [ ] **Step 1: Install dependencies in the worktree**

Run: `cd server && npm install && cd ../client && npm install`
Expected: both finish without errors (several minutes).

- [ ] **Step 2: Add the model**

In `server/prisma/schema.prisma`, directly after the `SalaryPayment` model (the one ending with `@@index([status])`), add:

```prisma
// ADR-0112: the CEO's manual figure for one staff member's pay (before advances)
// in one Tashkent calendar month. The prorated FIXED_MONTHLY formula stays the
// proposal; when this row exists it replaces the formula everywhere, through
// `resolveStaffMonthly`. Deleting the row returns the month to the formula.
model StaffSalaryAdjustment {
  id               String   @id @default(uuid())
  companyId        Int
  userId           Int
  user             User     @relation("StaffSalaryAdjustmentUser", fields: [userId], references: [id])
  /// 'YYYY-MM', the Tashkent calendar month of the payroll period.
  month            String
  amount           Int
  /// What the formula gave when this was saved (audit only; the live figure is re-derived on read).
  calculatedAmount Int
  reason           String
  createdById      Int
  createdBy        User     @relation("StaffSalaryAdjustmentBy", fields: [createdById], references: [id])
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([companyId, userId, month])
  @@index([companyId, month])
}
```

In `model User { ... }` find the line containing `@relation("UserSalaryPayments")` and add right after it:

```prisma
  staffSalaryAdjustments        StaffSalaryAdjustment[] @relation("StaffSalaryAdjustmentUser")
  staffSalaryAdjustmentsWritten StaffSalaryAdjustment[] @relation("StaffSalaryAdjustmentBy")
```

- [ ] **Step 3: Write the migration**

Create `server/prisma/migrations/20261018120000_staff_salary_adjustment/migration.sql`:

```sql
-- ADR-0112: the CEO's manual figure for a staff member's monthly pay.
CREATE TABLE IF NOT EXISTS "StaffSalaryAdjustment" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "month" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "calculatedAmount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffSalaryAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffSalaryAdjustment_companyId_userId_month_key"
  ON "StaffSalaryAdjustment"("companyId", "userId", "month");
CREATE INDEX IF NOT EXISTS "StaffSalaryAdjustment_companyId_month_idx"
  ON "StaffSalaryAdjustment"("companyId", "month");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffSalaryAdjustment_userId_fkey'
  ) THEN
    ALTER TABLE "StaffSalaryAdjustment"
      ADD CONSTRAINT "StaffSalaryAdjustment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'StaffSalaryAdjustment_createdById_fkey'
  ) THEN
    ALTER TABLE "StaffSalaryAdjustment"
      ADD CONSTRAINT "StaffSalaryAdjustment_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
```

- [ ] **Step 4: Validate and generate**

Run: `cd server && npx prisma validate && npx prisma generate`
Expected: "The schema ... is valid" and "Generated Prisma Client".

- [ ] **Step 5: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20261018120000_staff_salary_adjustment
git commit -m "$(cat <<'EOF'
feat(salary): StaffSalaryAdjustment table for manual staff pay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The resolver (pure)

**Files:**
- Create: `server/src/salary/shared/staff-monthly-amount.ts`
- Test: `server/src/salary/shared/staff-monthly-amount.spec.ts`

**Interfaces:**
- Consumes: `FixedMonthlyVersion`, `prorateFixedMonthly` from `./prorate-fixed-monthly`; `tashkentMonthKey` from `../../common/date/tashkent`.
- Produces:
  - `interface StaffMonthly { amount: number; calculated: number; manual: boolean }`
  - `resolveStaffMonthly(input: { versions: FixedMonthlyVersion[]; adjustment: { amount: number } | null; periodStart: Date; periodEnd: Date }): StaffMonthly`
  - `staffAdjustmentMonth(periodStart: Date): string` (`'YYYY-MM'`)
  - `const ADJUSTMENT_FIRST_MONTH = '2026-05'`

- [ ] **Step 1: Write the failing test**

Create `server/src/salary/shared/staff-monthly-amount.spec.ts`:

```ts
import {
  resolveStaffMonthly,
  staffAdjustmentMonth,
} from './staff-monthly-amount';
import { FixedMonthlyVersion } from './prorate-fixed-monthly';

/** Tashkent-midnight instant of a calendar date (UTC+5, no DST). */
const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

const sep = {
  periodStart: tsh(2026, 9, 1),
  periodEnd: new Date(tsh(2026, 10, 1).getTime() - 1),
};
// Started 11.09: 20 of 30 days at 3 000 000.
const from11: FixedMonthlyVersion = {
  value: 3_000_000,
  effectiveFrom: tsh(2026, 9, 11),
  effectiveTo: null,
};

describe('resolveStaffMonthly', () => {
  it('is the prorated formula when there is no correction', () => {
    expect(
      resolveStaffMonthly({ versions: [from11], adjustment: null, ...sep }),
    ).toEqual({ amount: 2_000_000, calculated: 2_000_000, manual: false });
  });

  it('the CEO figure replaces the formula but the formula stays visible', () => {
    expect(
      resolveStaffMonthly({
        versions: [from11],
        adjustment: { amount: 2_076_000 },
        ...sep,
      }),
    ).toEqual({ amount: 2_076_000, calculated: 2_000_000, manual: true });
  });

  it('a correction of 0 is a valid figure, not "no correction"', () => {
    expect(
      resolveStaffMonthly({
        versions: [from11],
        adjustment: { amount: 0 },
        ...sep,
      }),
    ).toEqual({ amount: 0, calculated: 2_000_000, manual: true });
  });

  it('a month no version overlaps still takes the correction', () => {
    expect(
      resolveStaffMonthly({
        versions: [],
        adjustment: { amount: 500_000 },
        ...sep,
      }),
    ).toEqual({ amount: 500_000, calculated: 0, manual: true });
  });
});

describe('staffAdjustmentMonth', () => {
  it('names the Tashkent calendar month a period opens', () => {
    expect(staffAdjustmentMonth(tsh(2026, 9, 1))).toBe('2026-09');
    expect(staffAdjustmentMonth(tsh(2026, 1, 1))).toBe('2026-01');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/salary/shared/staff-monthly-amount.spec.ts`
Expected: FAIL — "Cannot find module './staff-monthly-amount'".

- [ ] **Step 3: Implement**

Create `server/src/salary/shared/staff-monthly-amount.ts`:

```ts
import { tashkentMonthKey } from '../../common/date/tashkent';
import {
  FixedMonthlyVersion,
  prorateFixedMonthly,
} from './prorate-fixed-monthly';

/** First month a correction may name (the payroll reporting floor, May 2026). */
export const ADJUSTMENT_FIRST_MONTH = '2026-05';

export interface StaffMonthly {
  /** What the person is owed for the month before advances. */
  amount: number;
  /** What the formula gives for the month. */
  calculated: number;
  /** True when the CEO's figure replaced the formula. */
  manual: boolean;
}

/**
 * The ONE place a non-teaching staff member's monthly pay is decided (ADR-0112):
 * the CEO's figure for the month when there is one, else the prorated
 * FIXED_MONTHLY formula. Its two readers are the payroll cron and the monthly
 * staff report, so the shown figure equals the paid one. Nothing else may call
 * `prorateFixedMonthly` (`staff-monthly-amount.single-source.spec.ts`).
 */
export function resolveStaffMonthly(input: {
  versions: FixedMonthlyVersion[];
  adjustment: { amount: number } | null;
  periodStart: Date;
  periodEnd: Date;
}): StaffMonthly {
  const calculated = prorateFixedMonthly(
    input.versions,
    input.periodStart,
    input.periodEnd,
  );
  return input.adjustment
    ? { amount: input.adjustment.amount, calculated, manual: true }
    : { amount: calculated, calculated, manual: false };
}

/** The month key of a payroll period (the period is the calendar month, ADR-0082). */
export function staffAdjustmentMonth(periodStart: Date): string {
  return tashkentMonthKey(periodStart);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd server && npx jest src/salary/shared/staff-monthly-amount.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/salary/shared/staff-monthly-amount.ts src/salary/shared/staff-monthly-amount.spec.ts && cd ..
git add server/src/salary/shared/staff-monthly-amount.ts server/src/salary/shared/staff-monthly-amount.spec.ts
git commit -m "$(cat <<'EOF'
feat(salary): resolveStaffMonthly, the one rule for a staff member's monthly pay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Advance-settle walk lifted out of the cron

**Files:**
- Create: `server/src/salary/shared/advance-settle.ts`, `server/src/salary/shared/advance-settle.spec.ts`
- Modify: `server/src/salary/salary-calculation.service.ts` (`applyPendingAdvances`, lines ~401-437; imports)

**Interfaces:**
- Consumes: `planAdvanceNetting` from `./advance-netting`.
- Produces: `settlePendingAdvances(tx: Prisma.TransactionClient, p: { paymentId: string; available: number; userId: number; companyId: number; periodEndDateExclusive: Date }): Promise<number>` — marks the advances it settles with `settledBySalaryPaymentId = paymentId` and returns their total; does NOT touch `SalaryPayment.amount`.

- [ ] **Step 1: Write the failing test**

Create `server/src/salary/shared/advance-settle.spec.ts`:

```ts
import { settlePendingAdvances } from './advance-settle';

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const adv = (id: string, amount: number, date: string, createdAt: string) => ({
  id,
  amount,
  date: day(date),
  createdAt: new Date(createdAt),
});

function makeTx(pending: ReturnType<typeof adv>[]) {
  return {
    expense: {
      findMany: jest.fn().mockResolvedValue(pending),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  } as any;
}
const base = {
  paymentId: 'p1',
  userId: 10500,
  companyId: 1,
  periodEndDateExclusive: day('2026-10-01'),
};

describe('settlePendingAdvances', () => {
  it('settles nothing when there are no pending advances', async () => {
    const tx = makeTx([]);
    expect(await settlePendingAdvances(tx, { ...base, available: 1_000_000 })).toBe(0);
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
  });

  it('settles every advance that fits and returns their total', async () => {
    const tx = makeTx([
      adv('a', 500_000, '2026-09-25', '2026-09-25T12:00:00Z'),
      adv('b', 1_000_000, '2026-09-28', '2026-09-28T12:00:00Z'),
    ]);
    const total = await settlePendingAdvances(tx, { ...base, available: 1_500_000 });
    expect(total).toBe(1_500_000);
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { settledBySalaryPaymentId: 'p1' },
    });
  });

  it('stops at the first advance that does not fit', async () => {
    const tx = makeTx([
      adv('a', 500_000, '2026-09-25', '2026-09-25T12:00:00Z'),
      adv('b', 1_000_000, '2026-09-28', '2026-09-28T12:00:00Z'),
    ]);
    const total = await settlePendingAdvances(tx, { ...base, available: 900_000 });
    expect(total).toBe(500_000);
    expect(tx.expense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      data: { settledBySalaryPaymentId: 'p1' },
    });
  });

  it('ignores an advance dated on or after the period end', async () => {
    const tx = makeTx([adv('a', 400_000, '2026-10-01', '2026-10-01T01:00:00Z')]);
    expect(await settlePendingAdvances(tx, { ...base, available: 5_000_000 })).toBe(0);
    expect(tx.expense.updateMany).not.toHaveBeenCalled();
  });

  it('reads only live, unsettled TEACHER_ADVANCE rows of this person and company', async () => {
    const tx = makeTx([]);
    await settlePendingAdvances(tx, { ...base, available: 1 });
    expect(tx.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          category: 'TEACHER_ADVANCE',
          relatedUserId: 10500,
          companyId: 1,
          settledBySalaryPaymentId: null,
          deletedAt: null,
        },
      }),
    );
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd server && npx jest src/salary/shared/advance-settle.spec.ts`
Expected: FAIL — "Cannot find module './advance-settle'".

- [ ] **Step 3: Implement**

Create `server/src/salary/shared/advance-settle.ts`:

```ts
import { Prisma } from '@prisma/client';
import { planAdvanceNetting } from './advance-netting';

/**
 * Settles, against one `SalaryPayment`, the person's unsettled TEACHER_ADVANCE
 * expenses that fit into `available` (ADR-0082: `planAdvanceNetting` — only
 * advances dated before the period's exclusive end, `createdAt` order, stop at
 * the first that does not fit). Returns the total it settled.
 *
 * It marks the expenses and nothing else: the caller owns `SalaryPayment.amount`,
 * because the cron creates the payment net of the advances while the manual
 * correction recomputes an existing one. Must run inside the transaction that
 * writes the payment, so the settlement and the amount stay consistent.
 */
export async function settlePendingAdvances(
  tx: Prisma.TransactionClient,
  p: {
    paymentId: string;
    available: number;
    userId: number;
    companyId: number;
    periodEndDateExclusive: Date;
  },
): Promise<number> {
  const pending = await tx.expense.findMany({
    where: {
      category: 'TEACHER_ADVANCE',
      relatedUserId: p.userId,
      companyId: p.companyId,
      settledBySalaryPaymentId: null,
      deletedAt: null,
    },
    select: { id: true, amount: true, date: true, createdAt: true },
  });
  if (pending.length === 0) return 0;

  const { settle, total } = planAdvanceNetting(
    pending,
    p.available,
    p.periodEndDateExclusive,
  );
  if (settle.length === 0) return 0;

  await tx.expense.updateMany({
    where: { id: { in: settle } },
    data: { settledBySalaryPaymentId: p.paymentId },
  });
  return total;
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `cd server && npx jest src/salary/shared/advance-settle.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Make the cron use it**

In `server/src/salary/salary-calculation.service.ts`:

1. Replace the import `import { planAdvanceNetting } from './shared/advance-netting';` with `import { settlePendingAdvances } from './shared/advance-settle';` — but first run `grep -n "planAdvanceNetting" src/salary/salary-calculation.service.ts`: if it is used anywhere besides `applyPendingAdvances`, keep that import too.
2. Replace the whole body of `applyPendingAdvances` (the method starting `private async applyPendingAdvances(` through its closing brace) with:

```ts
  private async applyPendingAdvances(
    tx: Prisma.TransactionClient,
    salaryPayment: { id: string; amount: number },
    userId: number,
    companyId: number,
    periodEndDateExclusive: Date,
  ): Promise<number> {
    const deducted = await settlePendingAdvances(tx, {
      paymentId: salaryPayment.id,
      available: salaryPayment.amount,
      userId,
      companyId,
      periodEndDateExclusive,
    });
    if (deducted === 0) return 0;
    await tx.salaryPayment.update({
      where: { id: salaryPayment.id },
      data: { amount: salaryPayment.amount - deducted },
    });
    return deducted;
  }
```

Keep the existing doc comment above the method.

- [ ] **Step 6: Run the cron's own spec**

Run: `cd server && npx jest src/salary/salary-calculation.service.spec.ts`
Expected: PASS, unchanged (the behaviour did not change).

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/salary/shared/advance-settle.ts src/salary/shared/advance-settle.spec.ts src/salary/salary-calculation.service.ts && cd ..
git add server/src/salary
git commit -m "$(cat <<'EOF'
refactor(salary): lift the advance-settle walk out of the payroll cron

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Cron and staff report read the resolver

**Files:**
- Modify: `server/src/salary/salary-calculation.service.ts` (FIXED_MONTHLY branch, imports)
- Modify: `server/src/salary/salary-monthly-staff.service.ts` (imports, `StaffRow`, steps 2-5)
- Modify: `server/src/salary/salary-monthly-staff.service.spec.ts`, `server/src/salary/salary-calculation.service.spec.ts` (mocks + new tests)
- Create: `server/src/salary/shared/staff-monthly-amount.single-source.spec.ts`

**Interfaces:**
- Consumes: `resolveStaffMonthly`, `staffAdjustmentMonth` (Task 2); `prisma.staffSalaryAdjustment` (Task 1).
- Produces: `StaffRow` gains `calculated: number` and `adjustment: { amount: number; reason: string; by: { id: number; firstName: string; lastName: string }; at: string } | null`; `StaffRow.monthly` is the resolved amount.

- [ ] **Step 1: Write the failing staff-report tests**

In `server/src/salary/salary-monthly-staff.service.spec.ts`:

1. In BOTH `beforeEach` blocks' `prisma = { ... }` objects add: `staffSalaryAdjustment: { findMany: jest.fn().mockResolvedValue([]) },`
2. In the first `describe`, before its closing `});`, add:

```ts
  it('a manual figure replaces the formula and keeps the formula beside it (ADR-0112)', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 3_000_000,
        effectiveFrom: tsh(2026, 6, 11), // Jun 11..30 = 20/30 → 2 000 000
        effectiveTo: null,
      },
    ]);
    prisma.staffSalaryAdjustment.findMany.mockResolvedValue([
      {
        userId: 10030,
        amount: 2_076_000,
        reason: "oy o'rtasidan qo'shilgan",
        updatedAt: new Date('2026-10-17T10:00:00.000Z'),
        createdBy: { id: 1, firstName: 'Ceo', lastName: 'One' },
      },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff[0].monthly).toBe(2_076_000);
    expect(res.staff[0].calculated).toBe(2_000_000);
    expect(res.staff[0].adjustment).toEqual({
      amount: 2_076_000,
      reason: "oy o'rtasidan qo'shilgan",
      by: { id: 1, firstName: 'Ceo', lastName: 'One' },
      at: '2026-10-17T10:00:00.000Z',
    });
    expect(res.staff[0].netToPay).toBe(2_076_000);
    expect(res.staffTotals.monthly).toBe(2_076_000);
  });

  it('a row whose formula is 0 still appears when it has a manual figure', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([]); // none overlap
    prisma.staffSalaryAdjustment.findMany.mockResolvedValue([
      {
        userId: 10030,
        amount: 500_000,
        reason: 'kelishilgan',
        updatedAt: new Date('2026-10-17T10:00:00.000Z'),
        createdBy: { id: 1, firstName: 'Ceo', lastName: 'One' },
      },
    ]);

    const res = await service.computeStaff(juneScope());

    expect(res.staff).toHaveLength(1);
    expect(res.staff[0].monthly).toBe(500_000);
    expect(res.staff[0].calculated).toBe(0);
  });

  it('a plain row has no adjustment and its formula equals monthly', async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
      {
        configId: 'cfg1',
        value: 5_000_000,
        effectiveFrom: tsh(2026, 5, 1),
        effectiveTo: null,
      },
    ]);
    const res = await service.computeStaff(juneScope());
    expect(res.staff[0].adjustment).toBeNull();
    expect(res.staff[0].calculated).toBe(res.staff[0].monthly);
  });

  it("asks for the scope month's corrections of the scoped people only", async () => {
    prisma.employeeSalaryConfig.findMany.mockResolvedValue([adminConfig]);
    await service.computeStaff(juneScope());
    expect(prisma.staffSalaryAdjustment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 1, month: '2026-06', userId: { in: [10030] } },
      }),
    );
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd server && npx jest src/salary/salary-monthly-staff.service.spec.ts`
Expected: the four new tests FAIL (`calculated`/`adjustment` undefined; `staffSalaryAdjustment.findMany` never called).

- [ ] **Step 3: Implement the staff service change**

In `server/src/salary/salary-monthly-staff.service.ts`:

1. Imports: replace
```ts
import {
  FixedMonthlyVersion,
  fixedMonthlyCoverage,
  prorateFixedMonthly,
} from './shared/prorate-fixed-monthly';
```
with
```ts
import {
  FixedMonthlyVersion,
  fixedMonthlyCoverage,
} from './shared/prorate-fixed-monthly';
import { resolveStaffMonthly } from './shared/staff-monthly-amount';
```
2. In `interface StaffRow`, after the `monthly: number;` line add:
```ts
  /** What the formula gives for the month; `monthly` is the CEO's figure when `adjustment` is set (ADR-0112). */
  calculated: number;
  /** The CEO's manual figure for the month, or null when the formula stands. */
  adjustment: {
    amount: number;
    reason: string;
    by: { id: number; firstName: string; lastName: string };
    at: string;
  } | null;
```
3. In `computeStaff`, add `month` to the destructured `scope` list if it is not already there (it is: `month`). After the `versByConfig` loop (right after step "2.") and before the "3. Unsettled advances" block, insert:

```ts
    // 2b. The CEO's manual figures for this month (ADR-0112).
    const adjustmentRows = await this.prisma.staffSalaryAdjustment.findMany({
      where: { companyId, month, userId: { in: userIds } },
      select: {
        userId: true,
        amount: true,
        reason: true,
        updatedAt: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    const adjustmentByUser = new Map(adjustmentRows.map((a) => [a.userId, a]));
```
4. In "5. Build rows", replace
```ts
      const monthly = prorateFixedMonthly(versions, periodStart, periodEnd);
```
with
```ts
      const adj = adjustmentByUser.get(c.userId) ?? null;
      const { amount: monthly, calculated } = resolveStaffMonthly({
        versions,
        adjustment: adj,
        periodStart,
        periodEnd,
      });
```
5. In the `staff.push({ ... })` literal, after `monthly,` add:
```ts
        calculated,
        adjustment: adj
          ? {
              amount: adj.amount,
              reason: adj.reason,
              by: adj.createdBy,
              at: adj.updatedAt.toISOString(),
            }
          : null,
```

- [ ] **Step 4: Run the staff spec**

Run: `cd server && npx jest src/salary/salary-monthly-staff.service.spec.ts`
Expected: PASS (all, old and new).

- [ ] **Step 5: Write the failing cron test, then wire the cron**

In `server/src/salary/salary-calculation.service.spec.ts`:

1. In the `prisma = { ... }` object (next to `employeeSalaryConfig`) add: `staffSalaryAdjustment: { findMany: jest.fn().mockResolvedValue([]) },`
2. Inside `describe('FIXED_MONTHLY (non-teaching staff)', ...)`, after the first test, add:

```ts
    it('pays the CEO figure instead of the formula (ADR-0112)', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { id: 'cfg1', userId: 10030 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          value: 5_000_000,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
      ]);
      prisma.staffSalaryAdjustment.findMany.mockResolvedValue([
        { userId: 10030, amount: 2_076_000 },
      ]);

      await service.calculateMonthlySalaries(1, { now });

      expect(prisma.staffSalaryAdjustment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 1 }),
        }),
      );
      expect(tx.salaryPayment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 10030, amount: 2_076_000 }),
        }),
      );
    });

    it('a correction of 0 pays nothing for the month', async () => {
      prisma.employeeSalaryConfig.findMany.mockResolvedValue([
        { id: 'cfg1', userId: 10030 },
      ]);
      prisma.employeeSalaryConfigVersion.findMany.mockResolvedValue([
        {
          value: 5_000_000,
          effectiveFrom: new Date('2026-01-01'),
          effectiveTo: null,
        },
      ]);
      prisma.staffSalaryAdjustment.findMany.mockResolvedValue([
        { userId: 10030, amount: 0 },
      ]);

      const result = await service.calculateMonthlySalaries(1, { now });
      expect(tx.salaryPayment.create).not.toHaveBeenCalled();
      expect(result.calculated).toBe(0);
    });
```

Run: `cd server && npx jest src/salary/salary-calculation.service.spec.ts -t "FIXED_MONTHLY"`
Expected: the two new tests FAIL (the cron still pays the formula).

Now in `server/src/salary/salary-calculation.service.ts`:
- Replace `import { prorateFixedMonthly } from './shared/prorate-fixed-monthly';` with
```ts
import {
  resolveStaffMonthly,
  staffAdjustmentMonth,
} from './shared/staff-monthly-amount';
```
- Immediately before `for (const config of fixedMonthlyConfigs) {` add:
```ts
    // The CEO's manual figures for the settled month (ADR-0112); a missing row
    // means the prorated formula stands.
    const adjustmentRows = await this.prisma.staffSalaryAdjustment.findMany({
      where: { companyId, month: staffAdjustmentMonth(periodStart) },
      select: { userId: true, amount: true },
    });
    const adjustmentByUser = new Map(
      adjustmentRows.map((a) => [a.userId, { amount: a.amount }]),
    );
```
- Replace `const amount = prorateFixedMonthly(versions, periodStart, periodEnd);` with
```ts
      const { amount } = resolveStaffMonthly({
        versions,
        adjustment: adjustmentByUser.get(config.userId) ?? null,
        periodStart,
        periodEnd,
      });
```
(the next line `if (amount <= 0) continue;` stays.)

Run: `cd server && npx jest src/salary/salary-calculation.service.spec.ts`
Expected: PASS (all).

- [ ] **Step 6: Add the single-source guard**

Create `server/src/salary/shared/staff-monthly-amount.single-source.spec.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

// ADR-0112: a staff member's monthly pay has one rule. `prorateFixedMonthly` is
// the formula and `resolveStaffMonthly` is the only thing that may call it, so
// a third copy of "what is this person owed for the month" cannot appear.
const SRC = join(__dirname, '..', '..');
const ALLOWED = new Set([
  'salary/shared/prorate-fixed-monthly.ts',
  'salary/shared/staff-monthly-amount.ts',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('staff monthly pay has one rule', () => {
  it('only the resolver calls prorateFixedMonthly', () => {
    const offenders = walk(SRC)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => !ALLOWED.has(f))
      .filter((f) =>
        /\bprorateFixedMonthly\s*\(/.test(readFileSync(join(SRC, f), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
```

Run: `cd server && npx jest src/salary/shared/staff-monthly-amount.single-source.spec.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck the whole server and run the salary specs**

Run: `cd server && npm run typecheck 2>&1 | tail -20`
Expected: no errors. If a spec or fixture builds a `StaffRow` literal and fails ("property 'calculated' is missing"), add `calculated: <same as monthly>, adjustment: null` to that literal.

Run: `cd server && npx jest src/salary src/reports src/telegram-groups 2>&1 | tail -15`
Expected: PASS. If another spec's `prisma` mock lacks the new model (`TypeError: Cannot read properties of undefined (reading 'findMany')` on `staffSalaryAdjustment`), add `staffSalaryAdjustment: { findMany: jest.fn().mockResolvedValue([]) },` to that mock. Also confirm `salary-monthly.service.ts` (around the `computeStaff` call, line ~155) passes staff rows through without re-mapping them: `grep -n "staff" src/salary/salary-monthly.service.ts | head -20`. If it re-maps field by field, add `calculated` and `adjustment` there.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/salary/salary-calculation.service.ts src/salary/salary-calculation.service.spec.ts src/salary/salary-monthly-staff.service.ts src/salary/salary-monthly-staff.service.spec.ts src/salary/shared/staff-monthly-amount.single-source.spec.ts && cd ..
git add server/src
git commit -m "$(cat <<'EOF'
feat(salary): payroll cron and staff report read the one resolver

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: The correction service

**Files:**
- Create: `server/src/salary/staff-salary-adjustment.service.ts`
- Test: `server/src/salary/staff-salary-adjustment.service.spec.ts`

**Interfaces:**
- Consumes: `resolveStaffMonthly`, `ADJUSTMENT_FIRST_MONTH` (Task 2); `settlePendingAdvances` (Task 3); `resolveCurrentPeriod`, `parseTashkentDateStart` from `./shared/resolve-current-period`; `assertPayrollCoversUser` from `./shared/payroll-branch-scope`; `EntityHistoryService.recordCreate({ tx, entityType, entityId, newValues, changedById, companyId })`; `rethrowAsConflict` from `../common/transaction-conflict`; `SalaryMonthlyService.getMonthlyForUser(userId, { month }, companyId, performedById)`; `tashkentMonthKey`.
- Produces:
  - `class StaffSalaryAdjustmentService`
  - `set(userId: number, dto: { month: string; amount: number; reason: string }, companyId: number, callerId: number): Promise<ReturnType<SalaryMonthlyService['getMonthlyForUser']>>`
  - `clear(userId: number, month: string, companyId: number, callerId: number): same return`

- [ ] **Step 1: Write the failing test**

Create `server/src/salary/staff-salary-adjustment.service.spec.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { StaffSalaryAdjustmentService } from './staff-salary-adjustment.service';

jest.mock('./shared/resolve-current-period', () => ({
  parseTashkentDateStart: jest.fn((s: string) => new Date(`${s}T00:00:00Z`)),
  resolveCurrentPeriod: jest.fn(),
}));
jest.mock('./shared/payroll-branch-scope', () => ({
  assertPayrollCoversUser: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./shared/advance-settle', () => ({
  settlePendingAdvances: jest.fn().mockResolvedValue(0),
}));

import { resolveCurrentPeriod } from './shared/resolve-current-period';
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
import { settlePendingAdvances } from './shared/advance-settle';

const tsh = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m - 1, d) - 5 * 60 * 60 * 1000);

const PERIOD = {
  periodStart: tsh(2026, 9, 1),
  periodEnd: new Date(tsh(2026, 10, 1).getTime() - 1),
  periodEndDateExclusive: new Date('2026-10-01T00:00:00Z'),
};
// 3 000 000 from 11.09 → 20/30 → 2 000 000.
const VERSIONS = [
  { value: 3_000_000, effectiveFrom: tsh(2026, 9, 11), effectiveTo: null },
];

function setup() {
  const tx: any = {
    employeeSalaryConfig: {
      findFirst: jest.fn().mockResolvedValue({ id: 'cfg1' }),
    },
    employeeSalaryConfigVersion: {
      findMany: jest.fn().mockResolvedValue(VERSIONS),
    },
    salaryPayment: {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    staffSalaryAdjustment: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    expense: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
    },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: (t: any) => unknown) => fn(tx)),
  };
  const history: any = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  const monthly: any = {
    getMonthlyForUser: jest.fn().mockResolvedValue({ row: { ok: true } }),
  };
  const service = new StaffSalaryAdjustmentService(prisma, history, monthly);
  return { service, tx, prisma, history, monthly };
}

const dto = { month: '2026-09', amount: 2_076_000, reason: "oy o'rtasidan" };

describe('StaffSalaryAdjustmentService.set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveCurrentPeriod as jest.Mock).mockResolvedValue(PERIOD);
    (settlePendingAdvances as jest.Mock).mockResolvedValue(0);
  });

  it('refuses a month before the floor and a future month', async () => {
    const { service } = setup();
    await expect(
      service.set(10500, { ...dto, month: '2026-04' }, 1, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
    const nextYear = `${new Date().getUTCFullYear() + 1}-01`;
    await expect(
      service.set(10500, { ...dto, month: nextYear }, 1, 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks the payee is inside the caller payroll scope first', async () => {
    const { service } = setup();
    await service.set(10500, dto, 1, 7);
    expect(assertPayrollCoversUser).toHaveBeenCalledWith(
      expect.anything(),
      7,
      10500,
    );
  });

  it('refuses someone with no global FIXED_MONTHLY rate or a teacher', async () => {
    const { service, tx } = setup();
    tx.employeeSalaryConfig.findFirst.mockResolvedValue(null);
    await expect(service.set(10500, dto, 1, 1)).rejects.toThrow(
      "Xodimda oylik stavkasi yo'q",
    );
    expect(tx.employeeSalaryConfig.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 10500,
          groupId: null,
          salaryType: 'FIXED_MONTHLY',
          user: {
            deletedAt: null,
            roles: { none: { role: { name: 'Teacher' } } },
          },
        }),
      }),
    );
  });

  it('refuses a month whose payment is APPROVED or PAID', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'APPROVED',
      note: null,
    });
    await expect(service.set(10500, dto, 1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.staffSalaryAdjustment.upsert).not.toHaveBeenCalled();
  });

  it('stores only the record when the month has no payment yet', async () => {
    const { service, tx, history } = setup();
    await service.set(10500, dto, 1, 7);
    expect(tx.staffSalaryAdjustment.upsert).toHaveBeenCalledWith({
      where: {
        companyId_userId_month: { companyId: 1, userId: 10500, month: '2026-09' },
      },
      create: {
        companyId: 1,
        userId: 10500,
        month: '2026-09',
        amount: 2_076_000,
        calculatedAmount: 2_000_000,
        reason: "oy o'rtasidan",
        createdById: 7,
      },
      update: {
        amount: 2_076_000,
        calculatedAmount: 2_000_000,
        reason: "oy o'rtasidan",
        createdById: 7,
      },
    });
    expect(tx.salaryPayment.update).not.toHaveBeenCalled();
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tx,
        entityType: 'User',
        entityId: 10500,
        changedById: 7,
        companyId: 1,
        newValues: expect.objectContaining({
          action: 'OYLIK_TUZATILDI',
          oy: '2026-09',
          hisob: 2_000_000,
          qoldaSumma: 2_076_000,
          sabab: "oy o'rtasidan",
        }),
      }),
    );
  });

  it('recomputes a CALCULATED payment: gross − settled advances − newly settled', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: null,
    });
    // 500 000 already settled against it; one more advance (400 000) now fits.
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 500_000 } });
    (settlePendingAdvances as jest.Mock).mockResolvedValue(400_000);

    await service.set(10500, dto, 1, 7);

    expect(settlePendingAdvances).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        paymentId: 'p1',
        available: 2_076_000 - 500_000,
        userId: 10500,
        companyId: 1,
        periodEndDateExclusive: PERIOD.periodEndDateExclusive,
      }),
    );
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: {
        amount: 2_076_000 - 500_000 - 400_000,
        note: "Qo'lda to'g'rilandi: oy o'rtasidan",
      },
    });
  });

  it('appends to an existing payment note instead of replacing it', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: 'eski izoh',
    });
    await service.set(10500, dto, 1, 7);
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: expect.objectContaining({
        note: "eski izoh · Qo'lda to'g'rilandi: oy o'rtasidan",
      }),
    });
  });

  it('refuses a figure below what the payment already settled in advances', async () => {
    const { service, tx } = setup();
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: null,
    });
    tx.expense.aggregate.mockResolvedValue({ _sum: { amount: 1_900_000 } });
    await expect(
      service.set(10500, { ...dto, amount: 1_000_000 }, 1, 7),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.staffSalaryAdjustment.upsert).not.toHaveBeenCalled();
  });

  it('returns the refreshed staff row', async () => {
    const { service, monthly } = setup();
    const res = await service.set(10500, dto, 1, 7);
    expect(monthly.getMonthlyForUser).toHaveBeenCalledWith(
      10500,
      { month: '2026-09' },
      1,
      7,
    );
    expect(res).toEqual({ row: { ok: true } });
  });
});

describe('StaffSalaryAdjustmentService.clear', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (resolveCurrentPeriod as jest.Mock).mockResolvedValue(PERIOD);
    (settlePendingAdvances as jest.Mock).mockResolvedValue(0);
  });

  it('is a 404 when the month has no correction', async () => {
    const { service } = setup();
    await expect(
      service.clear(10500, '2026-09', 1, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes the record, returns the payment to the formula and writes history', async () => {
    const { service, tx, history } = setup();
    tx.staffSalaryAdjustment.findUnique.mockResolvedValue({
      amount: 2_076_000,
    });
    tx.salaryPayment.findFirst.mockResolvedValue({
      id: 'p1',
      status: 'CALCULATED',
      note: "Qo'lda to'g'rilandi: x",
    });

    await service.clear(10500, '2026-09', 1, 7);

    expect(tx.staffSalaryAdjustment.delete).toHaveBeenCalledWith({
      where: {
        companyId_userId_month: { companyId: 1, userId: 10500, month: '2026-09' },
      },
    });
    // gross = formula 2 000 000, nothing settled yet.
    expect(tx.salaryPayment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { amount: 2_000_000 },
    });
    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        newValues: expect.objectContaining({
          action: 'OYLIK_HISOBGA_QAYTARILDI',
          oy: '2026-09',
          hisob: 2_000_000,
          oldingi: 2_076_000,
        }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd server && npx jest src/salary/staff-salary-adjustment.service.spec.ts`
Expected: FAIL — "Cannot find module './staff-salary-adjustment.service'".

- [ ] **Step 3: Implement**

Create `server/src/salary/staff-salary-adjustment.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SalaryPaymentStatus, SalaryType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history/entity-history.service';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { tashkentMonthKey } from '../common/date/tashkent';
import {
  parseTashkentDateStart,
  resolveCurrentPeriod,
} from './shared/resolve-current-period';
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
import { settlePendingAdvances } from './shared/advance-settle';
import {
  ADJUSTMENT_FIRST_MONTH,
  resolveStaffMonthly,
} from './shared/staff-monthly-amount';
import { SalaryMonthlyService } from './salary-monthly.service';

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

/**
 * The CEO's manual correction of a non-teaching staff member's monthly pay
 * (ADR-0112). It stores the figure; `resolveStaffMonthly` is what makes the
 * payroll and every report read it. When the month's `SalaryPayment` already
 * exists (the cron runs at the month's end, the correction usually comes
 * later) the payment is recomputed in the same transaction.
 */
@Injectable()
export class StaffSalaryAdjustmentService {
  constructor(
    private prisma: PrismaService,
    private history: EntityHistoryService,
    private monthly: SalaryMonthlyService,
  ) {}

  async set(
    userId: number,
    dto: { month: string; amount: number; reason: string },
    companyId: number,
    callerId: number,
  ) {
    await this.write(userId, dto.month, companyId, callerId, {
      amount: dto.amount,
      reason: dto.reason.trim(),
    });
    return this.monthly.getMonthlyForUser(
      userId,
      { month: dto.month },
      companyId,
      callerId,
    );
  }

  async clear(
    userId: number,
    month: string,
    companyId: number,
    callerId: number,
  ) {
    await this.write(userId, month, companyId, callerId, null);
    return this.monthly.getMonthlyForUser(
      userId,
      { month },
      companyId,
      callerId,
    );
  }

  private assertMonth(month: string) {
    if (month < ADJUSTMENT_FIRST_MONTH) {
      throw new BadRequestException(
        "Oylik to'g'rilash may 2026 dan boshlab mumkin",
      );
    }
    if (month > tashkentMonthKey(new Date())) {
      throw new BadRequestException("Kelajak oyini to'g'rilab bo'lmaydi");
    }
  }

  /** `next` null = return the month to the formula. */
  private async write(
    userId: number,
    month: string,
    companyId: number,
    callerId: number,
    next: { amount: number; reason: string } | null,
  ) {
    this.assertMonth(month);
    await assertPayrollCoversUser(this.prisma, callerId, userId);
    const period = await resolveCurrentPeriod(
      this.prisma,
      companyId,
      parseTashkentDateStart(`${month}-15`),
    );

    await this.prisma
      .$transaction(async (tx) => {
        const config = await tx.employeeSalaryConfig.findFirst({
          where: {
            companyId,
            userId,
            groupId: null,
            salaryType: SalaryType.FIXED_MONTHLY,
            user: {
              deletedAt: null,
              roles: { none: { role: { name: 'Teacher' } } },
            },
          },
          select: { id: true },
        });
        if (!config) {
          throw new BadRequestException("Xodimda oylik stavkasi yo'q");
        }

        const versions = await tx.employeeSalaryConfigVersion.findMany({
          where: {
            configId: config.id,
            salaryType: SalaryType.FIXED_MONTHLY,
            effectiveFrom: { lte: period.periodEnd },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: period.periodStart } },
            ],
          },
          select: { value: true, effectiveFrom: true, effectiveTo: true },
        });
        const { calculated } = resolveStaffMonthly({
          versions,
          adjustment: null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        });

        const key = { companyId_userId_month: { companyId, userId, month } };
        const existing = await tx.staffSalaryAdjustment.findUnique({
          where: key,
        });
        if (!next && !existing) {
          throw new NotFoundException("Bu oyda qo'lda to'g'rilash yo'q");
        }

        const payment = await tx.salaryPayment.findFirst({
          where: {
            userId,
            companyId,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            status: { not: SalaryPaymentStatus.CANCELLED },
          },
          select: { id: true, status: true, note: true },
        });
        if (payment && payment.status !== SalaryPaymentStatus.CALCULATED) {
          throw new ConflictException(
            "Oylik tasdiqlangan — avval to'lovni bekor qiling",
          );
        }

        const gross = next ? next.amount : calculated;
        if (payment) {
          const settled = await tx.expense.aggregate({
            where: {
              settledBySalaryPaymentId: payment.id,
              category: 'TEACHER_ADVANCE',
              deletedAt: null,
            },
            _sum: { amount: true },
          });
          const settledTotal = settled._sum.amount ?? 0;
          if (gross < settledTotal) {
            throw new BadRequestException(
              next
                ? "Qo'lda summa ushlangan avanslardan kam"
                : "Hisob summasi ushlangan avanslardan kam — avval avansni to'g'rilang",
            );
          }
          const newly = await settlePendingAdvances(tx, {
            paymentId: payment.id,
            available: gross - settledTotal,
            userId,
            companyId,
            periodEndDateExclusive: period.periodEndDateExclusive,
          });
          await tx.salaryPayment.update({
            where: { id: payment.id },
            data: {
              amount: gross - settledTotal - newly,
              ...(next && {
                note: [payment.note, `Qo'lda to'g'rilandi: ${next.reason}`]
                  .filter(Boolean)
                  .join(' · '),
              }),
            },
          });
        }

        if (next) {
          await tx.staffSalaryAdjustment.upsert({
            where: key,
            create: {
              companyId,
              userId,
              month,
              amount: next.amount,
              calculatedAmount: calculated,
              reason: next.reason,
              createdById: callerId,
            },
            update: {
              amount: next.amount,
              calculatedAmount: calculated,
              reason: next.reason,
              createdById: callerId,
            },
          });
        } else {
          await tx.staffSalaryAdjustment.delete({ where: key });
        }

        // `oldingi` is put in explicitly as null when there was none: the
        // history diff drops a key a previous value does not carry.
        await this.history.recordCreate({
          tx,
          entityType: 'User',
          entityId: userId,
          newValues: next
            ? {
                action: 'OYLIK_TUZATILDI',
                oy: month,
                hisob: calculated,
                qoldaSumma: next.amount,
                oldingi: existing?.amount ?? null,
                sabab: next.reason,
              }
            : {
                action: 'OYLIK_HISOBGA_QAYTARILDI',
                oy: month,
                hisob: calculated,
                oldingi: existing?.amount ?? null,
              },
          changedById: callerId,
          companyId,
        });
      }, TX_OPTIONS)
      .catch(rethrowAsConflict);
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd server && npx jest src/salary/staff-salary-adjustment.service.spec.ts`
Expected: PASS (11 tests). If a test fails because `recordCreate`'s param type has no `tx` key, read `BaseHistoryParams` in `src/common/entity-history/entity-history.service.ts` and use the field name it declares for the transaction client.

- [ ] **Step 5: Commit**

```bash
cd server && npx prettier --write src/salary/staff-salary-adjustment.service.ts src/salary/staff-salary-adjustment.service.spec.ts && cd ..
git add server/src/salary/staff-salary-adjustment.service.ts server/src/salary/staff-salary-adjustment.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(salary): StaffSalaryAdjustmentService, the CEO's manual monthly pay

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Routes, capability, access pins

**Files:**
- Create: `server/src/salary/dto/staff-salary-adjustment.dto.ts`
- Modify: `server/src/salary/salary.controller.ts`, `server/src/salary/salary.module.ts`, `server/src/salary/salary.controller.spec.ts`
- Modify: `server/src/common/permissions/permission-catalog.money.ts`, `server/src/common/permissions/permission-catalog.spec.ts`, `server/src/common/permissions/route-access.snapshot.json`
- Modify: `server/src/common/auth/branch-route-policy.ts`
- Modify: `client/src/lib/permission-keys.ts`

**Interfaces:**
- Consumes: `StaffSalaryAdjustmentService.set / clear` (Task 5).
- Produces: `PUT /salary/monthly/user/:userId/adjustment`, `DELETE /salary/monthly/user/:userId/adjustment?month=`, capability key `salary.adjust` (CEO only).

- [ ] **Step 1: Write the failing controller access test**

In `server/src/salary/salary.controller.spec.ts`, inside `describe('CEO-only writes (Faza 2 narrowing)', ...)` after the `salary.close` `it.each`, add:

```ts
    // ADR-0112: a staff member's monthly pay is the CEO's to correct.
    it.each(['setStaffAdjustment', 'clearStaffAdjustment'] as const)(
      '%s is gated by the adjust capability, CEO by default',
      (method) => {
        expectCan(method, 'salary.adjust');
        expect(defaultRolesOf(SalaryController, method)).toEqual(CEO_ONLY);
      },
    );
```

Run: `cd server && npx jest src/salary/salary.controller.spec.ts`
Expected: FAIL — the controller has no `setStaffAdjustment`.

- [ ] **Step 2: The DTOs**

Create `server/src/salary/dto/staff-salary-adjustment.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The CEO's figure for one staff member's pay in one month (ADR-0112). */
export class SetStaffAdjustmentDto {
  @Matches(MONTH, { message: "month 'YYYY-MM' bo'lishi kerak" })
  month: string;

  /** Pay for the month before advances, so'm. */
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  amount: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Sababini yozing' })
  @MaxLength(300)
  reason: string;
}

export class ClearStaffAdjustmentQueryDto {
  @Matches(MONTH, { message: "month 'YYYY-MM' bo'lishi kerak" })
  month: string;
}
```

- [ ] **Step 3: The routes**

Read `server/src/salary/salary.controller.ts` lines 1-60 (imports and constructor). Then:

1. Add `Put` and `Delete` to the `@nestjs/common` import list if absent.
2. Import `StaffSalaryAdjustmentService` from `./staff-salary-adjustment.service` and the two DTOs from `./dto/staff-salary-adjustment.dto`.
3. Add `private readonly staffAdjustment: StaffSalaryAdjustmentService,` to the constructor's parameter list (match the style of the other injected services).
4. Directly after the `getMonthlyDetail` method (route `monthly/user/:userId/detail`), add:

```ts
  /**
   * The CEO's manual figure for a staff member's pay in one month (ADR-0112).
   * Staff pay is the CEO's (ADR-0034), so it is its own capability; the payee's
   * branch is still checked in the service.
   */
  @Put('monthly/user/:userId/adjustment')
  @Can('salary.adjust')
  setStaffAdjustment(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Body() dto: SetStaffAdjustmentDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.staffAdjustment.set(
      targetUserId,
      dto,
      companyId,
      performedById,
    );
  }

  /** Returns the month to the prorated formula. */
  @Delete('monthly/user/:userId/adjustment')
  @Can('salary.adjust')
  clearStaffAdjustment(
    @Param('userId', ParseIntPipe) targetUserId: number,
    @Query() query: ClearStaffAdjustmentQueryDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.staffAdjustment.clear(
      targetUserId,
      query.month,
      companyId,
      performedById,
    );
  }
```

In `server/src/salary/salary.module.ts` import `StaffSalaryAdjustmentService` and add it to `providers`.

- [ ] **Step 4: The capability**

In `server/src/common/permissions/permission-catalog.money.ts`, directly after the `'salary.close'` entry, add:

```ts
  // PUT/DELETE /salary/monthly/user/:userId/adjustment: a staff member's pay is
  // the CEO's (ADR-0034, ADR-0112); the payee's branch is still checked.
  'salary.adjust': {
    section: 'salary',
    label: "Xodim oyligini qo'lda to'g'rilash",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['salary.view'],
    danger: 'money',
  },
```

In `server/src/common/permissions/permission-catalog.spec.ts` change `70` to `71` in the three places (`toHaveLength(70)` and the two `.size).toBe(70)`), and `70 capabilities` to `71 capabilities` in that `it(...)` title.

In `client/src/lib/permission-keys.ts` add `"salary.adjust",` on the line after `"salary.close",`.

- [ ] **Step 5: Access snapshot and branch policy**

In `server/src/common/permissions/route-access.snapshot.json` add (anywhere inside the object, next to the other `/salary/monthly/user/:userId/detail` row; keep valid JSON commas):

```json
  "PUT /salary/monthly/user/:userId/adjustment": [
    "CEO"
  ],
  "DELETE /salary/monthly/user/:userId/adjustment": [
    "CEO"
  ],
```

In `server/src/common/auth/branch-route-policy.ts`, in the `BRANCH_SCOPED_BY_PAYROLL` `routes` array (the one containing `'GET /salary/accruals/:userId'`), add `'DELETE /salary/monthly/user/:userId/adjustment',` as its first element and `'PUT /salary/monthly/user/:userId/adjustment',` after `'POST /salary/payments/settle-month',`.

- [ ] **Step 6: Run the pins**

Run: `cd server && npx jest src/salary/salary.controller.spec.ts src/common/permissions src/common/auth`
Expected: PASS. If `permission-routes.spec.ts` / `permission-allowed-roles.spec.ts` / a branch-policy spec names a further expectation (e.g. a per-section count, or "every route is listed"), fix the data it points at, not the spec's rule.

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts`
Expected: PASS (the client key list equals the server catalog).

- [ ] **Step 7: Prove the whole server still type-checks and boots its module graph**

Run: `cd server && npm run typecheck 2>&1 | tail -10 && npm run build 2>&1 | tail -5`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/salary/dto/staff-salary-adjustment.dto.ts src/salary/salary.controller.ts src/salary/salary.controller.spec.ts src/salary/salary.module.ts src/common/permissions/permission-catalog.money.ts src/common/permissions/permission-catalog.spec.ts src/common/auth/branch-route-policy.ts && cd ..
git add server client/src/lib/permission-keys.ts
git commit -m "$(cat <<'EOF'
feat(salary): CEO-only routes to set or clear a staff pay correction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The «Ish haqi» page — figure, dialog, tag

**Files (all under `client/src/components/payments/salary/`):**
- Modify: `salary-types.ts`, `salary-page-model.ts`, `salary-people-table.tsx`, `salary-drawer-sections.tsx`, `salary-row-drawer.tsx`
- Create: `salary-adjustment-model.ts`, `salary-adjustment-model.test.ts`, `salary-adjustment-dialog.tsx`
- Test: extend `salary-page-model.test.ts`

**Interfaces:**
- Consumes: server `StaffRow.calculated`, `StaffRow.adjustment` (Task 4); `PUT/DELETE /salary/monthly/user/:userId/adjustment` (Task 6); `useCan` from `@/hooks/use-permissions`; `useInvalidateSalary` from `./salary-queries`; `instantDate` from `../debt/debt-format`.
- Produces: `adjustmentFacts`, `diffText`, `adjustmentMeta`, `adjustmentError`, `adjustLockReason`, `REASON_MIN`, `REASON_MAX`; `SalaryAdjustmentDialog`; `PersonRow.manual`.

- [ ] **Step 1: Types**

In `salary-types.ts` add above `export interface StaffRow`:

```ts
export interface StaffAdjustment {
  amount: number;
  reason: string;
  by: { id: number; firstName: string; lastName: string } | null;
  /** ISO instant of the save. */
  at: string;
}
```

and inside `StaffRow`, after `monthly: number;`:

```ts
  /** The formula's figure; `monthly` is the CEO's figure when `adjustment` is set (ADR-0112). */
  calculated?: number;
  adjustment?: StaffAdjustment | null;
```

- [ ] **Step 2: Write the failing model test**

Create `salary-adjustment-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  adjustLockReason,
  adjustmentError,
  adjustmentFacts,
  adjustmentMeta,
  diffText,
} from "./salary-adjustment-model";

describe("adjustmentFacts", () => {
  it("is manual only when an adjustment stands, and keeps the formula", () => {
    expect(adjustmentFacts({ monthly: 2_076_000, calculated: 2_000_000, adjustment: { amount: 2_076_000, reason: "x", by: null, at: "2026-10-17T10:00:00.000Z" } })).toEqual({
      manual: true,
      formula: 2_000_000,
      current: 2_076_000,
    });
    expect(adjustmentFacts({ monthly: 3_000_000, adjustment: null })).toEqual({
      manual: false,
      formula: 3_000_000,
      current: 3_000_000,
    });
  });
});

describe("diffText", () => {
  it("names the difference from the formula with a sign", () => {
    expect(diffText(2_076_000, 2_000_000)).toBe("Hisobdan farq: +76 000 so'm");
    expect(diffText(1_900_000, 2_000_000)).toBe("Hisobdan farq: −100 000 so'm");
    expect(diffText(2_000_000, 2_000_000)).toBe("Hisobdan farq yo'q");
  });
});

describe("adjustmentError", () => {
  it("needs an amount and a reason of 3 to 300 characters", () => {
    expect(adjustmentError(null, "sabab")).toBe("Summani kiriting");
    expect(adjustmentError(-1, "sabab")).toBe("Summani kiriting");
    expect(adjustmentError(0, "  ab ")).toBe("Sababini yozing");
    expect(adjustmentError(0, "x".repeat(301))).toBe("Sabab 300 belgidan oshmasin");
    expect(adjustmentError(2_076_000, " oy o'rtasidan ")).toBeNull();
  });
});

describe("adjustLockReason", () => {
  it("shuts the button once the payment is approved or paid", () => {
    expect(adjustLockReason(null)).toBeNull();
    expect(adjustLockReason({ status: "CALCULATED" })).toBeNull();
    expect(adjustLockReason({ status: "CANCELLED" })).toBeNull();
    expect(adjustLockReason({ status: "APPROVED" })).toContain("tasdiqlangan");
    expect(adjustLockReason({ status: "PAID" })).toContain("tasdiqlangan");
  });
});

describe("adjustmentMeta", () => {
  it("says who and when", () => {
    const text = adjustmentMeta({ amount: 1, reason: "x", by: { id: 1, firstName: "Ahror", lastName: "S." }, at: "2026-10-17T10:00:00.000Z" });
    expect(text).toContain("Ahror S.");
    expect(text).toContain("17.10.2026");
  });
});
```

Run: `cd client && npx vitest run src/components/payments/salary/salary-adjustment-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the model**

Create `salary-adjustment-model.ts`:

```ts
import { formatPrice } from "@/lib/format-utils";
import { instantDate } from "../debt/debt-format";
import type { StaffAdjustment, StaffRow } from "./salary-types";

// The words and rules of the staff pay correction (ADR-0112). The figures are
// the server's; this file only picks the wording and the form's checks.

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export interface AdjustmentFacts {
  manual: boolean;
  /** What the prorated formula gives. */
  formula: number;
  /** What the person is owed for the month before advances. */
  current: number;
}

export function adjustmentFacts(row: Pick<StaffRow, "monthly" | "calculated" | "adjustment">): AdjustmentFacts {
  return { manual: !!row.adjustment, formula: row.calculated ?? row.monthly, current: row.monthly };
}

/** The dialog's live line under the amount. */
export function diffText(amount: number, formula: number): string {
  const d = amount - formula;
  if (d === 0) return "Hisobdan farq yo'q";
  return `Hisobdan farq: ${d > 0 ? "+" : "−"}${formatPrice(Math.abs(d))} so'm`;
}

export function adjustmentMeta(a: StaffAdjustment): string {
  const who = a.by ? `${a.by.firstName} ${a.by.lastName}`.trim() : "Tizim";
  return `${who} · ${instantDate(a.at)}`;
}

/** The first thing wrong with the form, or null. */
export function adjustmentError(amount: number | null, reason: string): string | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return "Summani kiriting";
  const r = reason.trim();
  if (r.length < REASON_MIN) return "Sababini yozing";
  if (r.length > REASON_MAX) return `Sabab ${REASON_MAX} belgidan oshmasin`;
  return null;
}

/** Why the button stays shut for this payment, or null when it may open. */
export function adjustLockReason(payment: { status: string } | null): string | null {
  if (!payment || payment.status === "CALCULATED" || payment.status === "CANCELLED") return null;
  return "Oylik tasdiqlangan — avval to'lovni bekor qilish kerak.";
}
```

Run: `cd client && npx vitest run src/components/payments/salary/salary-adjustment-model.test.ts`
Expected: PASS. (If `instantDate` formats in a different pattern, the last test shows it: adjust the expectation to the helper's real `dd.MM.yyyy` output, not the helper.)

- [ ] **Step 4: The dialog**

Create `salary-adjustment-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { adjustmentError, diffText, REASON_MAX } from "./salary-adjustment-model";
import { useInvalidateSalary } from "./salary-queries";
import type { StaffRow } from "./salary-types";

interface Props {
  /** The staff row being corrected; `null` keeps the dialog shut. */
  row: StaffRow | null;
  month: string;
  onClose: () => void;
}

/**
 * «To'g'rilash» (ADR-0112): the CEO's figure for one staff member's pay in one
 * month, with a required reason. Mounted only while a row is picked, so every
 * opening starts from the current figure.
 */
export function SalaryAdjustmentDialog({ row, month, onClose }: Props) {
  if (!row) return null;
  return <AdjustmentForm key={`${row.user.id}-${month}`} row={row} month={month} onClose={onClose} />;
}

function AdjustmentForm({ row, month, onClose }: { row: StaffRow; month: string; onClose: () => void }) {
  const invalidate = useInvalidateSalary();
  const formula = row.calculated ?? row.monthly;
  const [amount, setAmount] = useState(String(row.monthly));
  const [reason, setReason] = useState(row.adjustment?.reason ?? "");
  const [busy, setBusy] = useState<"save" | "revert" | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);

  const value = amount === "" ? null : Number(amount);
  const error = adjustmentError(value, reason);
  const base = `/salary/monthly/user/${row.user.id}/adjustment`;

  const save = async () => {
    if (error || value == null) return;
    setBusy("save");
    try {
      await api.put(base, { month, amount: value, reason: reason.trim() });
      toast.success("Oylik to'g'rilandi");
      // Financial data: refetch, never patch the cache by hand.
      await invalidate();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "To'g'rilashda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  };

  const revert = async () => {
    setBusy("revert");
    try {
      await api.delete(base, { params: { month } });
      toast.success("Oylik hisobga qaytarildi");
      await invalidate();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Hisobga qaytarishda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && busy === null && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{`${row.user.firstName} ${row.user.lastName} — oylikni to'g'rilash`}</DialogTitle>
          <DialogDescription>
            Tizim hisobi: {formatPrice(formula)} so&apos;m. Siz kiritgan summa hisobning o&apos;rniga ishlaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="adj-amount">Oylik (avansgacha)</Label>
            <PriceInput id="adj-amount" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy !== null} />
            <p className="text-xs text-muted-foreground">{value == null ? " " : diffText(value, formula)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Sabab</Label>
            <Input
              id="adj-reason"
              value={reason}
              maxLength={REASON_MAX}
              placeholder="Masalan: oy o'rtasidan ishga kelgan"
              onChange={(e) => setReason(e.target.value)}
              disabled={busy !== null}
            />
          </div>
          {confirmRevert && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Qo&apos;lda summa o&apos;chadi, oylik {formatPrice(formula)} so&apos;m bo&apos;ladi. Tasdiqlaysizmi?
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {row.adjustment &&
            (confirmRevert ? (
              <Button variant="destructive" onClick={revert} disabled={busy !== null}>
                {busy === "revert" && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Ha, hisobga qaytarish
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setConfirmRevert(true)} disabled={busy !== null}>
                Hisobga qaytarish
              </Button>
            ))}
          <Button variant="outline" onClick={onClose} disabled={busy !== null}>
            Bekor qilish
          </Button>
          <Button onClick={save} disabled={!!error || busy !== null}>
            {busy === "save" && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: The drawer block**

In `salary-drawer-sections.tsx`:

1. Add imports: `import { Button } from "@/components/ui/button";` and `import { adjustLockReason, adjustmentFacts, adjustmentMeta } from "./salary-adjustment-model";` and add `StaffRow` to the type import from `./salary-types`.
2. Add this component above `export function SalaryDrawerBody`:

```tsx
/** The staff member's pay for the month: the formula, or the CEO's figure with the formula beside it (ADR-0112). */
function MonthlyBlock({ row, onAdjust }: { row: StaffRow; onAdjust?: () => void }) {
  const f = adjustmentFacts(row);
  const lock = adjustLockReason(row.payment);
  return (
    <Block title="Oylik hisobi">
      {f.manual && row.adjustment ? (
        <>
          <Line
            left="Qo'lda"
            sub={`${row.adjustment.reason} · ${adjustmentMeta(row.adjustment)}`}
            right={formatPrice(row.adjustment.amount)}
          />
          <Line
            left={<span className="text-muted-foreground line-through">Tizim hisobi</span>}
            right={<span className="text-muted-foreground line-through">{formatPrice(f.formula)}</span>}
          />
        </>
      ) : (
        <Line left="Tizim hisobi" right={formatPrice(f.formula)} />
      )}
      {onAdjust &&
        (lock ? (
          <p className="text-xs text-muted-foreground">{lock}</p>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={onAdjust}>
            {f.manual ? "O'zgartirish" : "To'g'rilash"}
          </Button>
        ))}
    </Block>
  );
}
```

3. Change the signature `export function SalaryDrawerBody({ detail, state }: { detail: SalaryDetail; state: MonthStateKind })` to `export function SalaryDrawerBody({ detail, state, onAdjust }: { detail: SalaryDetail; state: MonthStateKind; onAdjust?: () => void })`, and right after the «Stavka» `<Block>` add:

```tsx
      {!teacherRow && <MonthlyBlock row={row as StaffRow} onAdjust={onAdjust} />}
```

- [ ] **Step 6: Wire the drawer**

In `salary-row-drawer.tsx`:

1. Imports: `import { useCan } from "@/hooks/use-permissions";`, `import { SalaryAdjustmentDialog } from "./salary-adjustment-dialog";`, and `StaffRow` in the `./salary-types` import.
2. Inside `SalaryRowDrawer`, after `const { data, ... } = useSalaryDetail(...)` add:

```tsx
  const canAdjust = useCan("salary.adjust");
  const [adjusting, setAdjusting] = useState(false);
```

3. Wrap the returned `<Sheet>…</Sheet>` in a fragment, pass `onAdjust` to the body, and render the dialog as a sibling of the Sheet:

```tsx
            <SalaryDrawerBody
              detail={data}
              state={kind}
              onAdjust={canAdjust && data.kind === "staff" ? () => setAdjusting(true) : undefined}
            />
```
and after `</Sheet>`:
```tsx
      <SalaryAdjustmentDialog
        row={adjusting && data?.kind === "staff" ? (data.row as StaffRow) : null}
        month={data?.month ?? month}
        onClose={() => setAdjusting(false)}
      />
```
(`useState` is already imported in this file.)

- [ ] **Step 7: The table tag**

In `salary-page-model.ts` add `manual?: boolean;` to `PersonRow` (after `payment`), and in `mergePeople`'s staff mapper add `manual: !!s.adjustment,`.

In `salary-people-table.tsx` replace the «Ishladi» cell's content with:

```tsx
                    {r.worked == null ? <Muted>—</Muted> : formatPrice(r.worked)}
                    {r.manual && (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        qo&apos;lda
                      </span>
                    )}
```

Add to `salary-page-model.test.ts` (match the file's existing import style; `mergePeople` and the `MonthlyResponse` type may already be imported):

```ts
describe("mergePeople — manual tag", () => {
  it("marks a staff row whose pay the CEO set by hand", () => {
    const staff = (adjustment: unknown) => ({
      user: { id: 1, firstName: "A", lastName: "B", position: "Administrator", isActive: true, branch: null },
      monthly: 2_076_000,
      calculated: 2_000_000,
      adjustment,
      advances: 0,
      netToPay: 2_076_000,
      payment: null,
    });
    const adj = { amount: 2_076_000, reason: "x", by: null, at: "2026-10-17T10:00:00.000Z" };
    const people = mergePeople({ data: [], staff: [staff(adj), staff(null)] } as unknown as MonthlyResponse);
    expect(people.map((p) => p.manual)).toEqual([true, false]);
  });
});
```

- [ ] **Step 8: Run the client checks**

Run: `cd client && npx vitest run src/components/payments/salary 2>&1 | tail -15`
Expected: PASS.

Run: `cd client && npx tsc --noEmit -p . 2>&1 | tail -10 && npx eslint src/components/payments/salary src/lib/permission-keys.ts 2>&1 | tail -10`
Expected: no errors.

- [ ] **Step 9: Commit (no Prettier in client)**

```bash
git add client/src/components/payments/salary
git commit -m "$(cat <<'EOF'
feat(salary): staff pay correction on the Ish haqi page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: ADR, guide, CLAUDE.md, spec sync

**Files:**
- Create: `docs/adr/0112-xodim-oyligini-qolda-tuzatish.md`
- Modify: `docs/adr/README.md`, `client/src/qollanma/kontent/tolovlar/ish-haqi.mdx`, `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/yangiliklar.ts`, `server/CLAUDE.md`, `docs/superpowers/specs/2026-10-18-xodim-oyligini-qolda-tuzatish-design.md`

- [ ] **Step 1: The ADR**

Run `ls docs/adr | tail -3` and `git fetch origin main && git ls-tree --name-only origin/main docs/adr/ | tail -3`: if `0112` is taken on `main`, use the next free number everywhere below (file name, README row, guide `adr` list, spec header).

Create `docs/adr/0112-xodim-oyligini-qolda-tuzatish.md`:

```markdown
# ADR-0112 — Xodim oyligini qo'lda to'g'rilash

**Holati:** Qabul qilindi
**Sana:** 2026-10-18
**Bog'liq:** ADR-0006, ADR-0034, ADR-0079, ADR-0082, `server/src/salary/shared/staff-monthly-amount.ts`, `server/src/salary/shared/advance-settle.ts`, `server/src/salary/staff-salary-adjustment.service.ts`, `docs/superpowers/specs/2026-10-18-xodim-oyligini-qolda-tuzatish-design.md`

## Kontekst

Ustoz bo'lmagan xodimning (administrator, kassir, direktor) oyligi `FIXED_MONTHLY` stavkadan kalendar kunlariga proporsional hisoblanadi (`prorateFixedMonthly`). Oy o'rtasida kelgan yoki ketgan xodim uchun kelishilgan summa ko'pincha butun kunlarga to'g'ri kelmaydi: 3 000 000 stavka, 11.09 dan ishlagan xodimga kelishilgan sentabr oyligi 2 076 000, formula esa 2 000 000 beradi. Qo'lda to'g'rilashning yagona yo'li — oylik yozuvini skript bilan o'zgartirish (hisobotlar baribir formulani ko'rsatadi, filial hisoboti «ishlagan − avans ga mos emas» deb ogohlantiradi) yoki stavka tarixiga hech kim kelishmagan soxta stavka yozish (2026 yil iyul).

## Qaror (CEO, 18.10.2026)

1. Tizim oyni o'zi hisoblab taklif qiladi; CEO shu oy uchun o'z summasini kiritishi mumkin. Stavka va uning tarixi o'zgarmaydi.
2. Tuzatish alohida yozuv: `StaffSalaryAdjustment` (kompaniya, xodim, `YYYY-MM`, summa, tizim hisobi, sabab, kim). Bitta xodim, bitta oy — bitta yozuv.
3. Xodimning oy oyligi bitta funksiyadan chiqadi: `resolveStaffMonthly` = tuzatish bo'lsa o'sha, bo'lmasa `prorateFixedMonthly`. Uni faqat oylik cron'i va xodimlar hisoboti (`SalaryStaffMonthlyService`) chaqiradi; `staff-monthly-amount.single-source.spec.ts` boshqa chaqiruvni build'da to'xtatadi. Foyda, Excel, Telegram va filial PDF hisoboti shu hisobotdan o'qiydi.
4. Faqat CEO (`salary.adjust`, `allowedRoles: []`): xodim oyligi CEO'niki (ADR-0034). Xodim filiali baribir tekshiriladi.
5. Sabab majburiy (3–300 belgi). Har o'zgarish va qaytarish `User` tarixiga yoziladi (`OYLIK_TUZATILDI`, `OYLIK_HISOBGA_QAYTARILDI`), tranzaksiya bilan birga.
6. Oyning oylik yozuvi allaqachon bo'lsa (`CALCULATED`), tuzatish uni shu tranzaksiyada qayta hisoblaydi: yangi summa − ushlangan avanslar; endi sig'adigan avanslar ADR-0082 yurishi bilan ushlanadi (`settlePendingAdvances`, cron'dan ajratib olingan). Ushlangan avans o'zi ochilmaydi: yangi summa ushlanganidan kam bo'lsa — 400. `APPROVED`/`PAID` yozuvda — 409.
7. Tuzatish `YYYY-MM` 2026-05 dan joriy oygacha. Ustozlar (hisoblangan haq) bu qarorga kirmaydi.

## Oqibatlar

- Yangi jadval (qo'shimcha migratsiya, orqaga qaytariladigan: jadvalni o'chirish formulaga qaytaradi).
- `prorateFixedMonthly` endi to'g'ridan-to'g'ri chaqirilmaydi; yangi hisob qoidasi kerak bo'lsa, `resolveStaffMonthly` o'zgaradi.
- Stavka versiyasi o'zgarsa, mavjud tuzatish o'zgarmaydi (u ongli qaror); «Hisobga qaytarish» formulaga qaytaradi.

## Ko'rib chiqilgan va rad etilgan

- **Soxta stavka versiyasi** (oyga 3 114 000 yozib 2 076 000 chiqarish): stavka tarixini buzadi, CEO «fixed doim qolishi kerak» dedi.
- **Faqat oylik yozuvini o'zgartirish:** hisobotlar va filial PDF formulani ko'rsatishda davom etadi.
- **Ish kunlari bo'yicha hisob qoidasi:** butun kompaniya qoidasi, alohida qaror; istisnolar uchun tuzatish baribir kerak.
```

- [ ] **Step 2: README row**

In `docs/adr/README.md`, after the last table row (the line starting `| [0111](`), add (match the neighbours' column layout):

```markdown
| [0112](0112-xodim-oyligini-qolda-tuzatish.md) | Xodim oyligi tizim tomonidan hisoblanib taklif qilinadi, CEO esa oy uchun qo'lda summa kirita oladi; stavka o'zgarmaydi, oylik hisobi bitta funksiyadan chiqadi | Qabul qilindi | 2026-10-18 |
```

- [ ] **Step 3: The guide page**

In `client/src/qollanma/kontent/tolovlar/ish-haqi.mdx`, immediately before the `## Kim qila oladi` heading, add:

```mdx
## Xodim oyligini qo'lda to'g'rilash

Ustoz bo'lmagan xodimning (administrator, kassir) oyligini tizim stavka bo'yicha kunlarga proporsional hisoblaydi. Oy o'rtasidan kelgan yoki ketgan xodimning kelishilgan summasi bundan farq qilishi mumkin. Xodim oynasidagi «Oylik hisobi» blokida tizim hisobi turadi, uning ostida «To'g'rilash» tugmasi bor.

1. «To'g'rilash» ni bosing.
2. Oyning oylik summasini (avansgacha) va sababini yozing. Oyna hisobdan farqni shu zahoti ko'rsatadi.
3. «Saqlash» ni bosing. Jadvaldagi «Ishladi» yonida «qo'lda» belgisi paydo bo'ladi, xodim oynasida esa qo'lda summa va sabab, tizim hisobi chizilgan holda turadi.

Stavka va uning tarixi o'zgarmaydi. Qo'lda summa hisobotlarda, Excelda va Telegram xabarida shu oyning oyligi sifatida ko'rinadi. Oylik allaqachon hisoblangan bo'lsa, u yangi summaga qayta hisoblanadi, endi sig'adigan avans ham ushlanadi. Oylik tasdiqlangan yoki berilgan bo'lsa, avval to'lovni bekor qilish kerak. «Hisobga qaytarish» oyni yana tizim hisobiga qaytaradi.

```

and add this row to the «Kim qila oladi» table after the «Oylik berilganini tasdiqlash» row:

```mdx
| Xodim oyligini qo'lda to'g'rilash | Ha | — |
```

- [ ] **Step 4: Registry and news**

In `client/src/qollanma/sahifalar/tolovlar.ts`, in the `ish-haqi` entry change `adr: ["0082", "0006", "0052", "0072"],` to `adr: ["0082", "0006", "0052", "0072", "0112"],` and set its `yangilangan` field (if the entry has one) to `"2026-10-18"`; add `"oylikni to'g'rilash"` and `"qo'lda oylik"` to its `kalitSozlar`.

In `client/src/qollanma/yangiliklar.ts` add as the FIRST element of the `yangiliklar` array:

```ts
  {
    sana: "2026-10-18",
    sarlavha: "Xodim oyligini qo'lda to'g'rilash",
    matn: "Oy o'rtasidan kelgan yoki ketgan xodimning oyligi stavkadan kunlarga proporsional hisoblanadi, kelishilgan summa esa boshqacha bo'lishi mumkin. Ish haqi sahifasida xodim oynasidagi «Oylik hisobi» blokida endi «To'g'rilash» tugmasi bor: CEO oy uchun o'z summasini va sababini kiritadi. Stavka va uning tarixi o'zgarmaydi; qo'lda summa jadvalda «qo'lda» belgisi bilan, hisobotlarda va Excelda shu oyning oyligi sifatida ko'rinadi. Hisoblangan oylik yangi summaga qayta hisoblanadi.",
    rollar: [1],
    sahifa: { bolim: "tolovlar", sahifa: "ish-haqi" },
  },
```

- [ ] **Step 5: Server CLAUDE.md**

In `server/CLAUDE.md`, in the «Salary Module» section directly after the bullet that begins `- **`SalaryStaffConfigService.listStaff` is the write side of the staff payroll.`, add:

```markdown
- **A staff member's monthly pay has one rule, and the CEO may override it for a month (ADR-0112).** `resolveStaffMonthly` (`salary/shared/staff-monthly-amount.ts`) is `StaffSalaryAdjustment.amount` when the CEO set one for `(company, user, 'YYYY-MM')`, else `prorateFixedMonthly`; its only readers are the payroll cron's FIXED_MONTHLY branch and `SalaryStaffMonthlyService.computeStaff`, and `staff-monthly-amount.single-source.spec.ts` fails the build on any other caller of `prorateFixedMonthly`. `StaffRow` carries `monthly` (the resolved figure), `calculated` (the formula) and `adjustment`. `PUT|DELETE /salary/monthly/user/:userId/adjustment` are `@Can('salary.adjust')` (CEO only, `allowedRoles: []`, payee branch checked with `assertPayrollCoversUser`). The write is one Serializable transaction: a `CALCULATED` payment of the month is recomputed (`gross − already-settled advances − newly settled`, the walk is `settlePendingAdvances`, shared with the cron); `APPROVED`/`PAID` is 409; a figure below the advances already settled is 400 (a settled advance is never re-opened); history rows `OYLIK_TUZATILDI` / `OYLIK_HISOBGA_QAYTARILDI` are written with `tx`. Teachers (accrual pay) are out of scope. Do not edit a rate version to reach an agreed figure, and do not edit `SalaryPayment.amount` by hand: the report would keep printing the formula.
```

- [ ] **Step 6: Sync the spec to what was built**

In `docs/superpowers/specs/2026-10-18-xodim-oyligini-qolda-tuzatish-design.md` §4, replace the sentence beginning «Rows: `StaffRow` gains `adjustment:` …» with:

```markdown
Rows: `StaffRow` gains `calculated` (the live formula figure) and `adjustment: { amount, reason, by: {id, firstName, lastName}, at } | null`;
`monthly` is the resolved amount.
```

and in §5 change «`SetStaffAdjustmentDto`, `reason` trimmed» to «`SetStaffAdjustmentDto`: `month`, `amount`, `reason` trimmed, 3–300 characters».

- [ ] **Step 7: Run the guide and ADR checks**

Run: `cd client && npx vitest run src/qollanma 2>&1 | tail -10`
Expected: PASS (registry: the page's `adr` entry must name an existing ADR file; the news entry's page must exist).

- [ ] **Step 8: Commit**

```bash
git add docs client/src/qollanma server/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: ADR-0112, user guide and CLAUDE.md for staff pay correction

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Verify everything

- [ ] **Step 1: Server — format, types, lint, full suite**

Run, once each, in order:
- `cd server && npx prettier --check src/salary src/common/permissions src/common/auth 2>&1 | tail -5` — if it lists files, `npx prettier --write` them and commit.
- `npm run typecheck 2>&1 | tail -10`
- `npm run build 2>&1 | tail -5` — NOT in parallel with the tests (build and test share the Prisma client).
- `npx eslint src/salary src/common/permissions src/common/auth 2>&1 | tail -15`
- `npm test 2>&1 | tail -25`

Expected: all green. Fix only what the output names.

- [ ] **Step 2: Client — types, lint, tests, build**

Run, once each: `cd client && npx tsc --noEmit -p . 2>&1 | tail -10`, `npx eslint src 2>&1 | tail -10` (read the `✖ N problems (X errors…)` line: errors must be 0), `npm test 2>&1 | tail -15`, `npm run build 2>&1 | tail -15`.
Expected: green.

- [ ] **Step 3: Dry check against production data (read-only)**

Write nothing to production. Create `server/scripts/_probe-adjustment.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { run } from './lib/check-cli';
import { resolveStaffMonthly } from '../src/salary/shared/staff-monthly-amount';

async function main(prisma: PrismaClient) {
  const cfg = await prisma.employeeSalaryConfig.findFirst({
    where: { userId: Number(process.argv[2]), groupId: null, salaryType: 'FIXED_MONTHLY' },
    select: { id: true },
  });
  const versions = await prisma.employeeSalaryConfigVersion.findMany({
    where: { configId: cfg!.id, salaryType: 'FIXED_MONTHLY' },
    select: { value: true, effectiveFrom: true, effectiveTo: true },
  });
  console.log(
    resolveStaffMonthly({
      versions,
      adjustment: null,
      periodStart: new Date('2026-08-31T19:00:00.000Z'),
      periodEnd: new Date('2026-09-30T18:59:59.999Z'),
    }),
  );
}
run(main);
```

Run: `cd server && railway run npx ts-node --transpile-only scripts/_probe-adjustment.ts <staffUserId>` (the id of a staff member whose rate starts mid-month; the CEO knows it, it stays out of the repo).
Expected for a 3 000 000 rate that starts on 11.09: `{ amount: 2000000, calculated: 2000000, manual: false }`. Delete the probe file afterwards (`rm scripts/_probe-adjustment.ts`); it must not be committed.

- [ ] **Step 4: Final state**

Run: `git status --short && git log --oneline origin/main..HEAD`
Expected: clean tree; eight commits (spec, plan, tasks 1–8). Report to the CEO: what is done, that nothing is deployed, and the one manual step after deploy (set September for #10500 to 2 076 000 in the drawer).

## Self-review (done while writing)

- **Spec coverage:** §3 data → Task 1; §4 resolver + single-source + rows + cron → Tasks 2, 4; §5 API, capability, validation 1–5 → Tasks 5, 6; §6 payment recompute, `settlePendingAdvances` lift → Tasks 3, 5; §7 history → Task 5; §8 page and guide → Tasks 7, 8; §9–10 no-change/out-of-scope → no tasks needed; §11 tests → in each task; §12 rollout → Task 9 step 4 and the ADR.
- **Names used consistently:** `resolveStaffMonthly`, `staffAdjustmentMonth`, `ADJUSTMENT_FIRST_MONTH`, `settlePendingAdvances`, `StaffSalaryAdjustmentService.set/clear`, `salary.adjust`, `setStaffAdjustment`/`clearStaffAdjustment`, `StaffRow.calculated/adjustment`, `PersonRow.manual`, `adjustmentFacts/diffText/adjustmentMeta/adjustmentError/adjustLockReason`.
- **Known soft spots the implementer must verify while working:** (a) `BaseHistoryParams` exposes the transaction client under the name used (`tx`); (b) `salary-monthly.service.ts` passes staff rows through unchanged; (c) `permission-routes` / `branch-route-policy` specs may name one more table to update; (d) `instantDate`'s output format in the model test.
