# Monthly billing fixes — batch A1 (money safety) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the pack-era ("12 dars sikl") behaviour that can move or quote the wrong money for monthly students, and close four branch-scope leaks in the finance reports.

**Architecture:** Every fix gates on `Course.paymentModel` (MONTHLY vs LESSON_PACK) so the lesson-pack path keeps working unchanged. Monthly amounts reuse the helpers the monthly charge itself uses (`billing/monthly-price.ts`, a new pure `billing/departure-release.ts`), so a preview can never quote a figure the write path does not produce. Branch scope follows ADR-0002 (`ReportBranchIds`: `null` = all allowed, `[]` = nothing).

**Tech Stack:** NestJS 11 + Prisma 7 (server, Jest), Next.js 16 + React Query (client, Vitest with `environment: "node"` — no DOM render tests; UI logic goes into pure helper files).

**Spec:** `docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md` (section A1).

## Global Constraints

- Commit messages, PR title/body and new code comments: English. Every commit ends with a blank line + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- User-facing strings: Uzbek, Latin script only (never Cyrillic).
- Never change behaviour for `LESSON_PACK` enrollments; every monthly branch is gated on `paymentModel`.
- Ledger rows are never deleted or edited; reversal filters in reads use both `reversedAt: null` and `reversedTransactionId: null` where the task says so. No `Math.abs` on new money sums unless the task shows it.
- Repo is public: no production IDs, names or amounts in code, tests, commits or PR text; no exploit wording in commit messages.
- Server tests: `cd server && npx jest <path>`; if a full run shows `SIGSEGV` or timeouts, re-run with `--runInBand` before believing it. Stop any single command that runs longer than ~3 minutes and report.
- Client: `cd client && npx vitest run <path>`, `npx tsc --noEmit`, `npx eslint <files>`.
- Do not deploy. Deployment happens only after the CEO says so.
- Deploy order when it happens: server before client (both response changes are backward compatible either way).

## File map

| Task | Server | Client |
|---|---|---|
| 1 | `payments/payments-preview.service.ts` (+spec) | — |
| 2 | — | `components/payments/record-payment-quick-amounts.ts` (new, +test), `record-payment-dialog.tsx` |
| 3 | `billing/departure-release.ts` (new, +spec), `billing/monthly-charge.service.ts`, `billing/enrollment-billing.service.ts`, `students/students-read.service.ts`, `students/students-status.service.ts`, `students/dto/change-student-status.dto.ts`, `common/auth/operational-branch-scope.spec.ts` | — |
| 4 | — | `lib/freeze-refund-preview.ts` (new, +test), `components/shared/change-status-dialog.tsx` |
| 5 | `transactions/transactions-read.service.ts`, `billing/debt-write-off.service.ts`, `reports/reports-financial.service.ts` (+specs) | `components/payments/debt-write-off-actions.ts` (new, +test), `debt-write-offs-client.tsx` |
| 6 | `reports/reports-payments.service.ts` (+new spec), `reports/reports.service.ts`, `reports/reports.controller.ts` | `components/reports/payment-reports/report-view-state.ts` (new, +test), `payment-reports-client.tsx`, `teachers-report-table.tsx` |
| 7 | `reports/net-profit-cache.ts`, `reports/reports.service.ts`, `reports/reports-expectation-history.service.ts` (+specs) | — |
| 8 | full verification + PR | full verification |

Tasks 1→2 and 3→4 are ordered (the client consumes the new server field). Tasks 5, 6, 7 are independent of each other and of 1–4; 6 and 7 both touch `reports.service.ts` / `reports.service.spec.ts` in different methods — run them sequentially.

---

### Task 1: Payment preview — monthly branch (server)

**Files:**
- Modify: `server/src/payments/payments-preview.service.ts:1-7` (imports), `:24-45` (response types), `:95` (enrollment select), `:103-114` (the monthly gate replaces the NO_ENROLLMENT block), `:120-127`, `:238-253` and `:297-312` (tag the old returns), plus a new private method after `:313`
- Test: `server/src/payments/payments-preview.service.spec.ts`

**Interfaces:**
- Consumes: `clampDiscount` and `applyDiscount` from `server/src/billing/monthly-price.ts`. These are the same helpers `MonthlyChargeService` calls at `monthly-charge.service.ts:111` and `:208`. For a full month `proratedMonthlyAmount` returns exactly `monthlyPrice`, so a full month bills `applyDiscount(monthlyPrice, clampDiscount(discountPercent))`, computed per enrollment. Also consumes `PaymentModel` from `@prisma/client`.
- Produces (Task 2 depends on these exact names). Existing fields stay as they are.
  ```ts
  PaymentPreview.model: 'MONTHLY' | 'LESSON_PACK'
  PaymentPreview.monthly: MonthlyPreview | null        // non-null only when model === 'MONTHLY'
  interface MonthlyPreview {
    debt: number;                 // max(0, -currentBalance)
    nextMonthAmount: number;      // Σ enrollments[].amount
    discountPercent: number;      // clampDiscount(Student.discountPercent)
    enrollments: { groupName: string; courseName: string; monthlyPrice: number; amount: number }[];
  }
  ```
  When `model` is `MONTHLY`: `primaryEnrollment` is always `null`, so an old client falls back to its plain grid. `scenario` is derived from the enrollment count. `breakdown` holds only `DEBT_REPAY` and `REMAINDER`. A student with no ACTIVE enrollment also counts as `MONTHLY`, because `every()` on an empty list is true.

- [ ] **Step 1: Write the failing test**

In the spec, replace the `baseEnrollment` helper at `:5-23`. It still defaults to `LESSON_PACK`, so the existing tests keep testing the old path.
```ts
const baseEnrollment = (
  overrides: Partial<{
    prepaid: number;
    price: number;
    lpc: number;
    model: 'LESSON_PACK' | 'MONTHLY';
    groupName: string;
    courseName: string;
  }> = {},
) => ({
  id: 'enr-1',
  prepaidLessonsRemaining: overrides.prepaid ?? 0,
  group: {
    id: 'grp-1',
    name: overrides.groupName ?? '#029',
    course: {
      name: overrides.courseName ?? 'Intensive',
      price: overrides.price ?? 414000,
      lessonPaymentCount: overrides.lpc ?? 12,
      paymentModel: overrides.model ?? 'LESSON_PACK',
    },
  },
});
```
Add `import { applyDiscount } from '../billing/monthly-price';` to the imports. Then append this block inside the top-level `describe`, after the last `it`:
```ts
  describe('MONTHLY courses', () => {
    it('shows the debt and the next month instead of cycles', async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: -450000, discountPercent: 0 });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
      ]);

      const res = await service.preview(10001, 900000, 1001, null);

      expect(res.model).toBe('MONTHLY');
      expect(res.scenario).toBe('SINGLE_ENROLLMENT');
      expect(res.primaryEnrollment).toBeNull();
      expect(res.newBalance).toBe(450000);
      expect(res.monthly).toEqual({
        debt: 450000,
        nextMonthAmount: 450000,
        discountPercent: 0,
        enrollments: [
          { groupName: '#029', courseName: 'Intensive', monthlyPrice: 450000, amount: 450000 },
        ],
      });
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'DEBT_REPAY', amount: 450000 }),
        expect.objectContaining({ kind: 'REMAINDER', amount: 450000 }),
      ]);
      for (const item of res.breakdown) {
        expect(item.label).not.toMatch(/sikl|dars/i);
        expect(item.lessons).toBeUndefined();
      }
      // Monthly charges are LESSON_DEDUCTION rows too; counting them as
      // "cycles" was the bug. The monthly path must not read them.
      expect(prisma.transaction.count).not.toHaveBeenCalled();
      expect(prisma.attendance.findMany).not.toHaveBeenCalled();
    });

    it("applies the student's discount per enrollment, like the monthly charge", async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: 0, discountPercent: 10 });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
        {
          ...baseEnrollment({ model: 'MONTHLY', price: 333333, groupName: '#031', courseName: 'Standart' }),
          id: 'enr-2',
        },
      ]);

      const res = await service.preview(10001, 100000, 1001, null);

      expect(res.scenario).toBe('MULTI_ENROLLMENT');
      // 450 000 × 0.9 = 405 000; 333 333 × 0.9 = 299 999.7 → 300 000
      expect(res.monthly?.enrollments.map((e) => e.amount)).toEqual([405000, 300000]);
      expect(res.monthly?.nextMonthAmount).toBe(
        applyDiscount(450000, 10) + applyDiscount(333333, 10),
      );
      expect(res.monthly?.discountPercent).toBe(10);
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'REMAINDER', amount: 100000 }),
      ]);
    });

    it('treats a student with no active enrollment as monthly with nothing due next month', async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: -120000, discountPercent: 0 });

      const res = await service.preview(10001, 120000, 1001, null);

      expect(res.model).toBe('MONTHLY');
      expect(res.scenario).toBe('NO_ENROLLMENT');
      expect(res.monthly).toEqual({ debt: 120000, nextMonthAmount: 0, discountPercent: 0, enrollments: [] });
      expect(res.breakdown).toEqual([
        expect.objectContaining({ kind: 'DEBT_REPAY', amount: 120000 }),
      ]);
    });

    it('keeps the cycle projection when any enrollment is a lesson pack', async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: 0, discountPercent: 0 });
      prisma.enrollment.findMany.mockResolvedValue([
        baseEnrollment({ model: 'MONTHLY', price: 450000 }),
        { ...baseEnrollment({ model: 'LESSON_PACK' }), id: 'enr-2' },
      ]);

      const res = await service.preview(10001, 500000, 1001, null);

      expect(res.model).toBe('LESSON_PACK');
      expect(res.monthly).toBeNull();
      expect(res.scenario).toBe('MULTI_ENROLLMENT');
    });

    it('tags a single lesson-pack enrollment LESSON_PACK and keeps its cycles', async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: 0, discountPercent: 0 });
      prisma.enrollment.findMany.mockResolvedValue([baseEnrollment()]);

      const res = await service.preview(10001, 414000, 1001, null);

      expect(res.model).toBe('LESSON_PACK');
      expect(res.monthly).toBeNull();
      expect(res.primaryEnrollment?.lessonPaymentCount).toBe(12);
      expect(res.breakdown[0]).toMatchObject({ kind: 'CYCLE_FULL', lessons: 12 });
    });

    it("selects each course's payment model", async () => {
      prisma.student.findFirst.mockResolvedValue({ balance: 0, discountPercent: 0 });

      await service.preview(10001, 1000, 1001, null);

      const args = prisma.enrollment.findMany.mock.calls[0][0] as {
        select: { group: { select: { course: { select: Record<string, boolean> } } } };
      };
      expect(args.select.group.select.course.select).toMatchObject({ price: true, paymentModel: true });
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd server && npx jest src/payments/payments-preview.service.spec.ts -t "MONTHLY courses"`
Expected: FAIL. The assertions report `Expected: "MONTHLY"`, `Received: undefined` and `Expected: "LESSON_PACK"`, `Received: undefined`, and the `toMatchObject` assertion reports that `paymentModel` is missing. The 7 existing tests still pass.

- [ ] **Step 3: Write minimal implementation**

In `payments-preview.service.ts`, replace line 2 and add a new import:
```ts
import { AttendanceStatus, PaymentModel, TransactionType } from '@prisma/client';
import { applyDiscount, clampDiscount } from '../billing/monthly-price';
```
Insert above `export interface PaymentPreview` (line 24):
```ts
export interface MonthlyPreviewEnrollment {
  groupName: string;
  courseName: string;
  // Course.price — the published monthly price, before the student's discount.
  monthlyPrice: number;
  // What a full month bills this enrollment on the 1st.
  amount: number;
}

export interface MonthlyPreview {
  // Outstanding debt right now: -balance when negative, else 0.
  debt: number;
  // Σ amount over the ACTIVE monthly enrollments. Excused-lesson credit is
  // not projected (it can only lower the charge), so this is the ceiling.
  nextMonthAmount: number;
  discountPercent: number;
  enrollments: MonthlyPreviewEnrollment[];
}
```
Append these fields inside `PaymentPreview`, after `breakdown` (line 44):
```ts
  // MONTHLY when every ACTIVE enrollment's course bills by the month (also
  // when there is none); LESSON_PACK as soon as one is a lesson pack.
  model: 'MONTHLY' | 'LESSON_PACK';
  // Set only for model === 'MONTHLY'.
  monthly: MonthlyPreview | null;
```
Line 95 becomes `select: { name: true, price: true, lessonPaymentCount: true, paymentModel: true },`.

Replace lines 103-114, from `const newBalance` through the end of the `enrollments.length === 0` block, with the code below. The NO_ENROLLMENT case now goes through the monthly builder, which returns the same simple breakdown.
```ts
    const newBalance = student.balance + amount;

    // Since 01.09.2026 courses bill by the month (MonthlyChargeService): the
    // charge lands on the 1st and attendance never touches the balance, so
    // cycles, "12 dars" and price ÷ lessonPaymentCount do not apply. A
    // student with any LESSON_PACK enrollment keeps the cycle projection below.
    if (
      enrollments.every(
        (e) => e.group.course.paymentModel === PaymentModel.MONTHLY,
      )
    ) {
      return this.buildMonthlyPreview(
        amount,
        student.balance,
        student.discountPercent ?? 0,
        enrollments,
      );
    }
```
In the three remaining return objects (MULTI at old `:120`, free course at old `:238`, and the final return at old `:297`), add these two lines after `breakdown,` or `breakdown: …`:
```ts
        model: 'LESSON_PACK',
        monthly: null,
```
Add this private method before `buildSimpleBreakdown`:
```ts
  private buildMonthlyPreview(
    amount: number,
    currentBalance: number,
    rawDiscountPercent: number,
    enrollments: Array<{
      group: { name: string; course: { name: string; price: number } };
    }>,
  ): PaymentPreview {
    const discountPercent = clampDiscount(rawDiscountPercent);
    const lines: MonthlyPreviewEnrollment[] = enrollments.map((e) => ({
      groupName: e.group.name,
      courseName: e.group.course.name,
      monthlyPrice: e.group.course.price,
      // A full month bills exactly the published price, and the charge
      // discounts it per enrollment: round per enrollment, then sum.
      amount: applyDiscount(e.group.course.price, discountPercent),
    }));
    const nextMonthAmount = lines.reduce((sum, l) => sum + l.amount, 0);
    const debt = Math.max(0, -currentBalance);

    const breakdown: PaymentBreakdownItem[] = [];
    let remaining = amount;
    if (debt > 0) {
      const debtRepay = Math.min(remaining, debt);
      breakdown.push({ kind: 'DEBT_REPAY', amount: debtRepay, label: 'Qarz yopiladi' });
      remaining -= debtRepay;
    }
    if (remaining > 0) {
      breakdown.push({
        kind: 'REMAINDER',
        amount: remaining,
        label:
          nextMonthAmount > 0
            ? "Balansda qoladi — keyingi oy to'lovi shundan yechiladi"
            : 'Balansda qoladi',
      });
    }

    return {
      amount,
      currentBalance,
      newBalance: currentBalance + amount,
      scenario:
        enrollments.length === 0
          ? 'NO_ENROLLMENT'
          : enrollments.length === 1
            ? 'SINGLE_ENROLLMENT'
            : 'MULTI_ENROLLMENT',
      // null on purpose: an older client builds cycle buttons from this block
      // and falls back to plain amounts without it.
      primaryEnrollment: null,
      breakdown,
      model: 'MONTHLY',
      monthly: { debt, nextMonthAmount, discountPercent, enrollments: lines },
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd server && npx jest src/payments/payments-preview.service.spec.ts`
Expected: PASS, all 13 tests. Then run each of these and expect no errors:
- `cd server && npx jest src/payments`
- `npm run typecheck`
- `npx prettier --write src/payments/payments-preview.service.ts src/payments/payments-preview.service.spec.ts`
- `npx eslint src/payments/payments-preview.service.ts src/payments/payments-preview.service.spec.ts`

- [ ] **Step 5: Commit**
```bash
git add server/src/payments/payments-preview.service.ts server/src/payments/payments-preview.service.spec.ts
git commit -m "Payment preview: monthly branch without cycles

Students whose active enrollments are all MONTHLY get the debt, the
next month's discounted charge and a debt/remainder breakdown. Lesson-pack
students keep the cycle projection. The response gains model + monthly.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Record-payment dialog — monthly wording and quick amounts (client)

**Files:**
- Create: `client/src/components/payments/record-payment-quick-amounts.ts`
- Modify: `client/src/components/payments/record-payment-dialog.tsx:1-35` (import), `:80-87` (type), `:89-123` (delete), `:232-238`, `:399-403`, `:405-473`, `:635-650`, `:692-697`
- Test: `client/src/components/payments/record-payment-quick-amounts.test.ts`

**Interfaces:**
- Consumes: `model`, `monthly.{debt,nextMonthAmount,discountPercent,enrollments[]}`, `primaryEnrollment`, `currentBalance` from Task 1. Both `model` and `monthly` are optional on the client: a response without `model` is treated as LESSON_PACK.
- Produces: `buildQuickAmounts(preview) → QuickAmount[] | null`, `suggestedAmountHint`, `monthlyEnrollmentLine`, `monthlySummaryLine`, `MONTHLY_PAYMENT_EXPLANATION`.

- [ ] **Step 1: Write the failing test**
```ts
// client/src/components/payments/record-payment-quick-amounts.test.ts
import { describe, expect, it } from "vitest";
import { formatPrice } from "@/lib/format-utils";
import {
  buildQuickAmounts,
  monthlyEnrollmentLine,
  monthlySummaryLine,
  suggestedAmountHint,
  type QuickAmountSource,
} from "./record-payment-quick-amounts";

const monthly = (debt: number, nextMonthAmount: number): QuickAmountSource => ({
  model: "MONTHLY",
  currentBalance: -debt,
  primaryEnrollment: null,
  monthly: { debt, nextMonthAmount, discountPercent: 0, enrollments: [] },
});

describe("buildQuickAmounts — monthly", () => {
  it("recommends closing the debt; debt + next month is a prepayment option", () => {
    expect(buildQuickAmounts(monthly(450_000, 405_000))).toEqual([
      { key: "debt", amount: 450_000, label: "Qarzni yopish", recommended: true },
      { key: "debt-next", amount: 855_000, label: "Qarz + keyingi oy", recommended: false },
      { key: "month-1", amount: 405_000, label: "1 oy", recommended: false },
      { key: "month-2", amount: 810_000, label: "2 oy", recommended: false },
    ]);
  });

  it("recommends one month when nothing is owed", () => {
    expect(buildQuickAmounts(monthly(0, 450_000))).toEqual([
      { key: "month-1", amount: 450_000, label: "1 oy", recommended: true },
      { key: "month-2", amount: 900_000, label: "2 oy", recommended: false },
    ]);
  });

  it("offers only the debt when no monthly enrollment is left", () => {
    expect(buildQuickAmounts(monthly(120_000, 0))).toEqual([
      { key: "debt", amount: 120_000, label: "Qarzni yopish", recommended: true },
    ]);
  });

  it("falls back to the fixed grid with neither debt nor a next month", () => {
    expect(buildQuickAmounts(monthly(0, 0))).toBeNull();
  });

  it("never mentions cycles or lessons", () => {
    for (const q of buildQuickAmounts(monthly(450_000, 405_000)) ?? []) {
      expect(q.label).not.toMatch(/sikl|dars/i);
    }
  });
});

describe("buildQuickAmounts — lesson pack", () => {
  const primaryEnrollment = { fullCycleCost: 414_000, lessonPaymentCount: 12 };

  it("keeps the cycle buttons unchanged", () => {
    expect(
      buildQuickAmounts({ model: "LESSON_PACK", currentBalance: -100_000, primaryEnrollment, monthly: null }),
    ).toEqual([
      { key: "recommended", amount: 514_000, label: "Qarz + 1 sikl (12 dars)", recommended: true },
      { key: "cycle-1", amount: 414_000, label: "+1 sikl (12 dars)", recommended: false },
      { key: "cycle-2", amount: 828_000, label: "+2 sikl (24 dars)", recommended: false },
    ]);
  });

  it("reads a response without model (older server) as a lesson pack", () => {
    const res = buildQuickAmounts({ currentBalance: 0, primaryEnrollment });
    expect(res?.[0]).toEqual({
      key: "recommended",
      amount: 414_000,
      label: "1 to'liq sikl (12 dars)",
      recommended: true,
    });
  });

  it("returns null without a primary enrollment", () => {
    expect(buildQuickAmounts({ model: "LESSON_PACK", currentBalance: 0, primaryEnrollment: null })).toBeNull();
  });
});

describe("texts", () => {
  it("drops the cycle wording from the hint unless the student is on a lesson pack", () => {
    expect(suggestedAmountHint(450_000, "MONTHLY")).toBe(`Tavsiya: ${formatPrice(450_000)} so'm`);
    expect(suggestedAmountHint(450_000, undefined)).toBe(`Tavsiya: ${formatPrice(450_000)} so'm`);
    expect(suggestedAmountHint(414_000, "LESSON_PACK")).toBe(
      `Tavsiya: ${formatPrice(414_000)} so'm — kurs to'liq tsikl narxi`,
    );
  });

  it("shows a monthly enrollment with its discounted price", () => {
    const e = { groupName: "#029", courseName: "Intensive", monthlyPrice: 450_000, amount: 450_000 };
    expect(monthlyEnrollmentLine(e)).toBe(`#029 · Intensive · oyiga ${formatPrice(450_000)} so'm`);
    expect(monthlyEnrollmentLine({ ...e, amount: 405_000 })).toBe(
      `#029 · Intensive · oyiga ${formatPrice(405_000)} so'm (chegirmasiz ${formatPrice(450_000)})`,
    );
  });

  it("summarises debt and next month, or nothing", () => {
    expect(monthlySummaryLine({ debt: 120_000, nextMonthAmount: 450_000, discountPercent: 0, enrollments: [] })).toBe(
      `Qarz: ${formatPrice(120_000)} so'm · Keyingi oy: ${formatPrice(450_000)} so'm`,
    );
    expect(monthlySummaryLine({ debt: 0, nextMonthAmount: 0, discountPercent: 0, enrollments: [] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `cd client && npx vitest run src/components/payments/record-payment-quick-amounts.test.ts`
Expected: FAIL with `Failed to resolve import "./record-payment-quick-amounts"`.

- [ ] **Step 3: Write minimal implementation**
```ts
// client/src/components/payments/record-payment-quick-amounts.ts
import { formatPrice } from "@/lib/format-utils";

export type PaymentPreviewModel = "MONTHLY" | "LESSON_PACK";

export interface MonthlyPreviewEnrollment {
  groupName: string;
  courseName: string;
  monthlyPrice: number;
  amount: number;
}

export interface MonthlyPreviewBlock {
  debt: number;
  nextMonthAmount: number;
  discountPercent: number;
  enrollments: MonthlyPreviewEnrollment[];
}

/** The slice of GET /payments/preview the quick amounts are derived from. */
export interface QuickAmountSource {
  // Absent on a server older than the monthly preview: read as LESSON_PACK.
  model?: PaymentPreviewModel;
  currentBalance: number;
  primaryEnrollment: { fullCycleCost: number; lessonPaymentCount: number } | null;
  monthly?: MonthlyPreviewBlock | null;
}

export interface QuickAmount {
  key: string;
  amount: number;
  label: string;
  // Drawn with the sparkle icon: the amount the cashier most likely wants.
  recommended: boolean;
}

export const MONTHLY_PAYMENT_EXPLANATION =
  "To'lov balansga tushadi: avval qarz yopiladi, qolgani keyingi oy to'lovi uchun balansda qoladi.";

/** `null` means nothing student-specific to offer; the dialog shows its fixed grid. */
export function buildQuickAmounts(preview: QuickAmountSource): QuickAmount[] | null {
  if (preview.model === "MONTHLY") {
    return preview.monthly ? monthlyQuickAmounts(preview.monthly) : null;
  }
  return preview.primaryEnrollment
    ? lessonPackQuickAmounts(preview.primaryEnrollment, preview.currentBalance)
    : null;
}

function monthlyQuickAmounts({ debt, nextMonthAmount }: MonthlyPreviewBlock): QuickAmount[] | null {
  const items: QuickAmount[] = [];
  if (debt > 0) {
    // The debt already contains the current month's charge (billed on the
    // 1st), so closing it is the usual payment; "+ keyingi oy" is a prepayment.
    items.push({ key: "debt", amount: debt, label: "Qarzni yopish", recommended: true });
  }
  if (debt > 0 && nextMonthAmount > 0) {
    items.push({ key: "debt-next", amount: debt + nextMonthAmount, label: "Qarz + keyingi oy", recommended: false });
  }
  if (nextMonthAmount > 0) {
    items.push(
      { key: "month-1", amount: nextMonthAmount, label: "1 oy", recommended: debt <= 0 },
      { key: "month-2", amount: nextMonthAmount * 2, label: "2 oy", recommended: false },
    );
  }
  return items.length > 0 ? items : null;
}

// Unchanged cycle suggestions, moved out of the dialog.
function lessonPackQuickAmounts(
  enr: { fullCycleCost: number; lessonPaymentCount: number },
  currentBalance: number,
): QuickAmount[] {
  const debt = Math.max(0, -currentBalance);
  const n = enr.lessonPaymentCount;
  return [
    debt > 0
      ? { key: "recommended", amount: debt + enr.fullCycleCost, label: `Qarz + 1 sikl (${n} dars)`, recommended: true }
      : { key: "recommended", amount: enr.fullCycleCost, label: `1 to'liq sikl (${n} dars)`, recommended: true },
    { key: "cycle-1", amount: enr.fullCycleCost, label: `+1 sikl (${n} dars)`, recommended: false },
    { key: "cycle-2", amount: enr.fullCycleCost * 2, label: `+2 sikl (${n * 2} dars)`, recommended: false },
  ];
}

export function suggestedAmountHint(amount: number, model: PaymentPreviewModel | undefined): string {
  const base = `Tavsiya: ${formatPrice(amount)} so'm`;
  return model === "LESSON_PACK" ? `${base} — kurs to'liq tsikl narxi` : base;
}

export function monthlyEnrollmentLine(e: MonthlyPreviewEnrollment): string {
  const head = `${e.groupName} · ${e.courseName} · oyiga ${formatPrice(e.amount)} so'm`;
  return e.amount === e.monthlyPrice ? head : `${head} (chegirmasiz ${formatPrice(e.monthlyPrice)})`;
}

export function monthlySummaryLine(m: MonthlyPreviewBlock): string | null {
  const parts: string[] = [];
  if (m.debt > 0) parts.push(`Qarz: ${formatPrice(m.debt)} so'm`);
  if (m.nextMonthAmount > 0) parts.push(`Keyingi oy: ${formatPrice(m.nextMonthAmount)} so'm`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
```
Changes in `record-payment-dialog.tsx`:
1. Add this after the `formatPrice` import (line 35):
   ```ts
   import {
     MONTHLY_PAYMENT_EXPLANATION,
     buildQuickAmounts,
     monthlyEnrollmentLine,
     monthlySummaryLine,
     suggestedAmountHint,
     type MonthlyPreviewBlock,
     type PaymentPreviewModel,
   } from "./record-payment-quick-amounts";
   ```
2. In `PaymentPreview` (`:80-87`), add these fields after `breakdown`:
   ```ts
     // Optional: an older server sends neither; read as LESSON_PACK.
     model?: PaymentPreviewModel;
     monthly?: MonthlyPreviewBlock | null;
   ```
3. Delete `AmountSuggestions` and `buildAmountSuggestions` (`:89-123`).
4. Replace `:232-238` with:
   ```ts
     // Months for a monthly student, cycles for a lesson pack; null → fixed grid.
     const quickAmounts = preview ? buildQuickAmounts(preview) : null;
   ```
5. The hint at `:399-403` becomes `{suggestedAmountHint(suggestedAmount, preview?.model)}` inside the existing `<p>`.
6. Replace `:408-458`, from `{suggestion ? (` up to the closing `</div>` before `) : (`, with:
   ```tsx
               {quickAmounts ? (
                 <div className="flex flex-wrap gap-1.5">
                   {quickAmounts.map((qa) => (
                     <Button
                       key={qa.key}
                       variant={rawAmount === qa.amount ? "default" : "outline"}
                       size="sm"
                       className="text-xs h-7"
                       onClick={() => handleAmountChange(String(qa.amount))}
                     >
                       {qa.recommended && <Sparkles className="mr-1 size-3" />}
                       {qa.label} · {formatPrice(qa.amount)}
                     </Button>
                   ))}
                 </div>
   ```
   The `QUICK_AMOUNTS` fallback branch stays as it is.
7. Replace `:635-650` with the code below. The inner block is the existing primary-enrollment JSX, kept byte-for-byte.
   ```tsx
         {preview.model === "MONTHLY" && preview.monthly ? (
           <MonthlyContext monthly={preview.monthly} />
         ) : (
           preview.primaryEnrollment && (
             /* existing <div className="rounded-md bg-muted/40 …">…so'm/dars…</div> */
           )
         )}
   ```
8. `:692` becomes `{preview.scenario === "MULTI_ENROLLMENT" && preview.model !== "MONTHLY" && (`.
9. Append at the end of the file:
   ```tsx
   function MonthlyContext({ monthly }: { monthly: MonthlyPreviewBlock }) {
     const summary = monthlySummaryLine(monthly);
     return (
       <div className="space-y-1 rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
         {monthly.enrollments.map((e, idx) => (
           <p key={`${idx}-${e.groupName}`}>{monthlyEnrollmentLine(e)}</p>
         ))}
         {summary && <p className="font-medium text-foreground">{summary}</p>}
         <p>{MONTHLY_PAYMENT_EXPLANATION}</p>
       </div>
     );
   }
   ```

- [ ] **Step 4: Run test to verify it passes**
Run: `cd client && npx vitest run src/components/payments/record-payment-quick-amounts.test.ts`
Expected: PASS, all 11 tests. Then run each of these and expect no errors:
- `npm test`
- `npx tsc --noEmit`
- `npx eslint src/components/payments/record-payment-dialog.tsx src/components/payments/record-payment-quick-amounts.ts src/components/payments/record-payment-quick-amounts.test.ts`

The dialog stays above 500 lines, but its net line count goes down.

- [ ] **Step 5: Commit**
```bash
git add client/src/components/payments/record-payment-quick-amounts.ts client/src/components/payments/record-payment-quick-amounts.test.ts client/src/components/payments/record-payment-dialog.tsx
git commit -m "Record-payment dialog: monthly quick amounts and wording

Monthly students get Qarzni yopish / Qarz + keyingi oy / 1 oy / 2 oy,
a per-enrollment monthly price line and an explanation of how the
payment lands. Lesson-pack students keep the cycle buttons.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 3: Freeze preview and override for monthly enrollments (server)

**Files:**
- Create: `server/src/billing/departure-release.ts`
- Create: `server/src/billing/departure-release.spec.ts`
- Modify: `server/src/billing/monthly-charge.service.ts`: imports at :14-22; replace :648-734 (the body of `reverseChargeForDeparture` from `const periodYear` to `if (refunded <= 0) return null;`); insert new methods after :777
- Modify: `server/src/students/students-read.service.ts`: imports at :1-25, constructor at :55-58, replace :277-374
- Modify: `server/src/students/students-status.service.ts:318-338` (`refundPrepaidForFreeze`)
- Modify: `server/src/billing/enrollment-billing.service.ts`: import at :2, new const after the imports, :317 and :323
- Modify: `server/src/students/dto/change-student-status.dto.ts` (JSDoc only)
- Modify: `server/src/common/auth/operational-branch-scope.spec.ts:57`, which becomes `new StudentsReadService(prisma, {} as any, {} as any)`
- Test: `server/src/billing/monthly-charge.service.spec.ts`, `server/src/students/students-read.service.spec.ts`, `server/src/students/students-status.service.spec.ts`, `server/src/billing/enrollment-billing.service.spec.ts`

**Interfaces:**
- Consumes: `applyDiscount` and `clampDiscount` (`billing/monthly-price.ts`), `lessonDatesInMonth`, `resolveMonthPlanDates`, `tashkentDateStr`.
- Produces:
  - `departureRelease(input): { lessons: number; amount: number; frozenOutAfter: string[] | null } | null`. This is a pure function.
  - `MonthlyChargeService.previewReleaseForDeparture(client, { enrollmentId, departureDate }): Promise<{ lessons: number; amount: number; period: string } | null>`. It never writes.
  - `GET /students/:id/active-enrollments-prepaid` now returns `{ pack: PackRefundPreviewRow[]; monthly: MonthlyReleasePreviewRow[] }`:
    - `PackRefundPreviewRow = { enrollmentId: string; groupId: string; groupName: string; prepaidLessonsRemaining: number; perLessonCost: number; consumedLessons: number; maxRefundable: number; suggestedRefundAmount: number }`. These are LESSON_PACK enrollments only.
    - `MonthlyReleasePreviewRow = { enrollmentId: string; groupId: string; groupName: string; releaseLessons: number; releaseAmount: number }`. Both numbers are 0 when there is nothing to release.
  - `PATCH /students/:id/status` returns 400 with `MONTHLY_FREEZE_OVERRIDE_ERROR` when `frozenRefundOverrides` has a key for a MONTHLY enrollment.

- [ ] **Step 1: Write the failing tests**

`server/src/billing/departure-release.spec.ts`:
```ts
import { departureRelease } from './departure-release';

const SEPT = [
  '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10',
  '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22',
  '2026-09-24', '2026-09-26', '2026-09-29',
];
const base = {
  departureDay: '2026-09-20',
  coveredDates: SEPT,
  frozenOutDates: [] as string[],
  coveredLessons: 13,
  perLessonCost: 34_615,
  discountPercent: 0,
  chargedAmount: 450_000,
  lessonsThroughDeparture: 0,
};

describe('departureRelease', () => {
  it('releases the covered lessons after the departure day', () => {
    expect(departureRelease(base)).toEqual({
      lessons: 4,
      amount: 138_460,
      frozenOutAfter: ['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'],
    });
  });
  it('keeps the departure day itself as held', () => {
    expect(departureRelease({ ...base, departureDay: '2026-09-22' })?.lessons).toBe(3);
  });
  it('skips dates already frozen out (a repeat call releases nothing)', () => {
    expect(
      departureRelease({
        ...base,
        frozenOutDates: ['2026-09-22', '2026-09-24', '2026-09-26', '2026-09-29'],
      }),
    ).toBeNull();
  });
  it('adds to earlier frozen-out dates, sorted', () => {
    expect(
      departureRelease({ ...base, departureDay: '2026-09-25', frozenOutDates: ['2026-09-29'] }),
    ).toEqual({ lessons: 1, amount: 34_615, frozenOutAfter: ['2026-09-26', '2026-09-29'] });
  });
  it('legacy row without dates counts against the month plan', () => {
    expect(
      departureRelease({ ...base, coveredDates: [], lessonsThroughDeparture: 9 }),
    ).toEqual({ lessons: 4, amount: 138_460, frozenOutAfter: null });
  });
  it('prices at the discounted lesson price', () => {
    expect(departureRelease({ ...base, discountPercent: 50 })?.amount).toBe(69_232);
  });
  it('never releases more than was charged', () => {
    expect(departureRelease({ ...base, chargedAmount: 5 })?.amount).toBe(5);
  });
  it('a 100% discount month releases nothing', () => {
    expect(departureRelease({ ...base, discountPercent: 100 })).toBeNull();
  });
});
```

`server/src/billing/monthly-charge.service.spec.ts`: add this block after the `describe('reverseChargeForDeparture', …)` block, which closes at about :1978.
```ts
  describe('previewReleaseForDeparture', () => {
    const septCharge = (over: Record<string, unknown> = {}) => ({
      id: 'chg-1',
      groupId: 'grp-1',
      plannedLessons: 13,
      coveredLessons: 13,
      coveredDates: [
        '2026-09-01', '2026-09-03', '2026-09-05', '2026-09-08', '2026-09-10',
        '2026-09-12', '2026-09-15', '2026-09-17', '2026-09-19', '2026-09-22',
        '2026-09-24', '2026-09-26', '2026-09-29',
      ],
      frozenOutDates: [],
      perLessonCost: 34_615,
      chargedAmount: 450_000,
      transactionId: 'tx-1',
      status: 'CHARGED',
      ...over,
    });
    const departureDate = new Date('2026-09-20T00:00:00Z');

    it('quotes exactly what reverseChargeForDeparture then credits, writing nothing', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue(septCharge());

      const preview = await service.previewReleaseForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate,
      });
      expect(preview).toEqual({ lessons: 4, amount: 138_460, period: '2026-09' });
      expect(txWriteMock.createAdjustment).not.toHaveBeenCalled();
      expect(prismaMock.enrollmentMonthlyCharge.update).not.toHaveBeenCalled();

      const res = await service.reverseChargeForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate,
        companyId: 1,
        reason: 'Muzlatish',
        today: '2026-09-20',
      });
      expect(res?.refunded).toBe(preview?.amount);
      expect(txWriteMock.createAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ lessons: preview?.lessons }),
        }),
        tx,
      );
    });

    it('a legacy row without dates is counted against the month plan', async () => {
      prismaMock.enrollmentMonthlyCharge.findUnique.mockResolvedValue(
        septCharge({ coveredDates: [], frozenOutDates: [] }),
      );
      const preview = await service.previewReleaseForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate,
      });
      expect(preview).toEqual({ lessons: 4, amount: 138_460, period: '2026-09' });
    });

    it('returns null when the month has no CHARGED row', async () => {
      const preview = await service.previewReleaseForDeparture(tx, {
        enrollmentId: 'enr-1',
        departureDate,
      });
      expect(preview).toBeNull();
    });
  });
```

`server/src/students/students-read.service.spec.ts`:
- Add the import `import { MonthlyChargeService } from '../billing/monthly-charge.service';`.
- Declare `let monthlyCharge: any;` next to `let prisma: any;`.
- In `beforeEach`, set `monthlyCharge = { previewReleaseForDeparture: jest.fn().mockResolvedValue(null) };` before `createTestingModule`, and add the provider `{ provide: MonthlyChargeService, useValue: monthlyCharge }`.
- Append this block:
```ts
  describe('getActiveEnrollmentsWithPrepaid — freeze dialog preview', () => {
    const packEnrollment = {
      id: 'enr-pack',
      prepaidLessonsRemaining: 3,
      group: {
        id: 'grp-pack',
        name: 'A1 sikl',
        course: { price: 400_000, lessonPaymentCount: 12, paymentModel: 'LESSON_PACK' },
      },
    };
    const monthlyEnrollment = {
      id: 'enr-month',
      prepaidLessonsRemaining: 0,
      group: {
        id: 'grp-month',
        name: 'B1 oylik',
        course: { price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' },
      },
    };

    beforeEach(() => {
      prisma.student.findFirst.mockResolvedValue({ id: 10453 });
      prisma.enrollment.findMany.mockResolvedValue([packEnrollment, monthlyEnrollment]);
      prisma.transaction.groupBy = jest.fn().mockResolvedValue([]);
    });

    it('lists only the LESSON_PACK enrollment as editable', async () => {
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.pack).toEqual([
        {
          enrollmentId: 'enr-pack',
          groupId: 'grp-pack',
          groupName: 'A1 sikl',
          prepaidLessonsRemaining: 3,
          perLessonCost: 33_333,
          consumedLessons: 0,
          maxRefundable: 3,
          suggestedRefundAmount: 99_999,
        },
      ]);
      expect(prisma.transaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ enrollmentId: { in: ['enr-pack'] } }),
        }),
      );
    });

    it('shows a MONTHLY enrollment with what the month release would credit today', async () => {
      monthlyCharge.previewReleaseForDeparture.mockResolvedValue({
        lessons: 8,
        amount: 276_920,
        period: '2026-09',
      });
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.monthly).toEqual([
        {
          enrollmentId: 'enr-month',
          groupId: 'grp-month',
          groupName: 'B1 oylik',
          releaseLessons: 8,
          releaseAmount: 276_920,
        },
      ]);
      expect(monthlyCharge.previewReleaseForDeparture).toHaveBeenCalledTimes(1);
      expect(monthlyCharge.previewReleaseForDeparture).toHaveBeenCalledWith(prisma, {
        enrollmentId: 'enr-month',
        departureDate: expect.any(Date),
      });
    });

    it('nothing left this month reads as 0 lessons and 0 so`m', async () => {
      const res = await service.getActiveEnrollmentsWithPrepaid(10453, 1001);
      expect(res.monthly[0]).toMatchObject({ releaseLessons: 0, releaseAmount: 0 });
    });
  });
```

`server/src/students/students-status.service.spec.ts`:
- Import `BadRequestException` from `@nestjs/common` and declare `let billing: any;`.
- Change the EnrollmentBillingService provider to `useValue: (billing = { refundPrepaidWithOverride: jest.fn() }),`.
- In the `enrollment` mock, add `count: jest.fn().mockResolvedValue(0),`.
- Inside `describe('changeStatus → FROZEN, oylik kurs')`, add:
```ts
    it('rejects a hand-typed lesson count for a MONTHLY enrollment with 400 and moves no money', async () => {
      prisma.enrollment.count.mockResolvedValue(1);

      await expect(
        service.changeStatus(
          studentId,
          {
            status: StudentStatus.FROZEN,
            reason: 'Sinov sababi',
            frozenRefundOverrides: { 'enr-month': 3 },
          } as never,
          userId,
          companyId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.enrollment.count).toHaveBeenCalledWith({
        where: {
          id: { in: ['enr-month'] },
          studentId,
          deletedAt: null,
          group: { course: { paymentModel: 'MONTHLY' } },
        },
      });
      expect(billing.refundPrepaidWithOverride).not.toHaveBeenCalled();
      expect(monthlyCharge.reverseChargeForDeparture).not.toHaveBeenCalled();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it('the pack refund leg reads LESSON_PACK enrollments only; pack overrides still apply', async () => {
      prisma.enrollment.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.group?.course?.paymentModel === 'LESSON_PACK'
            ? [{ id: 'enr-pack', prepaidLessonsRemaining: 2 }]
            : [],
        ),
      );
      billing.refundPrepaidWithOverride.mockResolvedValue({
        refunded: 66_666,
        lessons: 2,
        extraReversed: 0,
      });

      await service.changeStatus(
        studentId,
        {
          status: StudentStatus.FROZEN,
          reason: 'Sinov sababi',
          frozenRefundOverrides: { 'enr-pack': 2 },
        } as never,
        userId,
        companyId,
      );

      expect(billing.refundPrepaidWithOverride).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ enrollmentId: 'enr-pack', overrideLessons: 2 }),
      );
    });
```

`server/src/billing/enrollment-billing.service.spec.ts`: add inside `describe('EnrollmentBillingService.refundPrepaidWithOverride')`:
```ts
  it('rejects a hand-typed count on a MONTHLY enrollment and reverses nothing', async () => {
    tx.enrollment.findUnique.mockResolvedValue({
      id: 'enroll-m',
      studentId: 10001,
      groupId: 'grp-m',
      prepaidLessonsRemaining: 0,
      group: {
        branchId: 1,
        companyId: 1,
        course: { price: 450_000, lessonPaymentCount: 12, paymentModel: 'MONTHLY' },
        teachers: [{ teacherId: 20001 }],
      },
    });

    await expect(
      service.refundPrepaidWithOverride(tx, {
        enrollmentId: 'enroll-m',
        performedById: 99,
        overrideLessons: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.transaction.findMany).not.toHaveBeenCalled();
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
    expect(transactionsService.createAdjustment).not.toHaveBeenCalled();
    expect(tx.enrollment.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd server && npx jest src/billing/departure-release.spec.ts src/billing/monthly-charge.service.spec.ts src/students/students-read.service.spec.ts src/students/students-status.service.spec.ts src/billing/enrollment-billing.service.spec.ts`

Expected: FAIL.
- `Cannot find module './departure-release'`
- `service.previewReleaseForDeparture is not a function`
- `res.pack` is undefined
- the 400 tests resolve instead of rejecting
- the pack-leg test finds `refundPrepaidWithOverride` not called

- [ ] **Step 3: Write the implementation**

`server/src/billing/departure-release.ts`:
```ts
import { applyDiscount, clampDiscount } from './monthly-price';

export interface DepartureReleaseInput {
  /** Tashkent 'YYYY-MM-DD'. The day itself stays held (only d > day is released). */
  departureDay: string;
  /** Dates the charge paid for; empty on rows written before the column existed. */
  coveredDates: readonly string[];
  /** Subset of `coveredDates` already released by an earlier freeze/departure. */
  frozenOutDates: readonly string[];
  coveredLessons: number;
  /** Undiscounted on purpose (teacher pay reads it); the discount is applied here. */
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
  /** Legacy rows only: planned lessons of the month through `departureDay`. */
  lessonsThroughDeparture: number;
}

export interface DepartureRelease {
  lessons: number;
  /** Discounted lesson price × lessons, capped at what the charge still holds. */
  amount: number;
  /** `frozenOutDates` after the release, sorted; null on a legacy row. */
  frozenOutAfter: string[] | null;
}

/**
 * The one rule for "the rest of this month's money back". Pure, and shared by
 * `reverseChargeForDeparture` (writes it) and `previewReleaseForDeparture`
 * (shows it), so the freeze dialog cannot quote a figure the freeze does not
 * credit. Set semantics make a repeat call a no-op. Null: nothing to release.
 */
export function departureRelease(
  input: DepartureReleaseInput,
): DepartureRelease | null {
  let lessons: number;
  let frozenOutAfter: string[] | null = null;

  if (input.coveredDates.length > 0) {
    const alreadyOut = new Set(input.frozenOutDates);
    const newlyOut = input.coveredDates.filter(
      (d) => d > input.departureDay && !alreadyOut.has(d),
    );
    lessons = newlyOut.length;
    if (lessons === 0) return null;
    frozenOutAfter = [...input.frozenOutDates, ...newlyOut].sort();
  } else {
    // Legacy row: no dates to diff, so keep the old count-based rule.
    lessons = Math.max(0, input.coveredLessons - input.lessonsThroughDeparture);
    if (lessons === 0) return null;
  }

  const discountedPerLessonCost = applyDiscount(
    input.perLessonCost,
    clampDiscount(input.discountPercent),
  );
  const amount = Math.min(lessons * discountedPerLessonCost, input.chargedAmount);
  if (amount <= 0) return null;
  return { lessons, amount, frozenOutAfter };
}
```

`monthly-charge.service.ts`:
- Add `import { departureRelease } from './departure-release';` after :22.
- Replace :648-734 with the code below. The code from `createAdjustment` down to `return { refunded };` stays byte-for-byte unchanged.
```ts
    const loaded = await this.loadDepartureRelease(tx, params.enrollmentId, day);
    if (!loaded) return null;
    const { charge, enr, periodYear, periodMonth, release } = loaded;
    const { lessons: remaining, amount: refunded, frozenOutAfter } = release;
    const coveredDates = charge.coveredDates ?? [];
    const frozenOutBefore = charge.frozenOutDates ?? [];
```
- Insert after :777:
```ts
  /**
   * Read-only twin of `reverseChargeForDeparture`: what a freeze/departure on
   * `departureDate` WOULD credit, by the same `departureRelease` rule. Writes
   * nothing, so it has no backdating guard and needs no transaction.
   */
  async previewReleaseForDeparture(
    client: Prisma.TransactionClient,
    params: { enrollmentId: string; departureDate: Date },
  ): Promise<{ lessons: number; amount: number; period: string } | null> {
    const loaded = await this.loadDepartureRelease(
      client,
      params.enrollmentId,
      tashkentDateStr(params.departureDate),
    );
    if (!loaded) return null;
    return {
      lessons: loaded.release.lessons,
      amount: loaded.release.amount,
      period: `${loaded.periodYear}-${String(loaded.periodMonth).padStart(2, '0')}`,
    };
  }

  /** Reads (never writes) the month charge and applies `departureRelease`. */
  private async loadDepartureRelease(
    client: Prisma.TransactionClient,
    enrollmentId: string,
    day: string,
  ) {
    const periodYear = Number(day.slice(0, 4));
    const periodMonth = Number(day.slice(5, 7));

    const charge = await client.enrollmentMonthlyCharge.findUnique({
      where: {
        enrollmentId_periodYear_periodMonth: { enrollmentId, periodYear, periodMonth },
      },
    });
    if (!charge || charge.status !== MonthlyChargeStatus.CHARGED) return null;

    const enr = await client.enrollment.findUnique({
      where: { id: enrollmentId },
      select: {
        studentId: true,
        startDate: true,
        group: { select: { branchId: true, exactDays: true } },
      },
    });
    if (!enr) return null;

    const coveredDates = charge.coveredDates ?? [];
    let lessonsThroughDeparture = 0;
    if (coveredDates.length === 0) {
      // Legacy row: count the month plan through the departure day.
      const { excludedDates, addedDates } = await this.resolveMonthPlanDates(
        client,
        charge.groupId,
        enr.group.branchId,
        periodYear,
        periodMonth,
      );
      lessonsThroughDeparture = lessonDatesInMonth({
        year: periodYear,
        month: periodMonth,
        exactDays: enr.group.exactDays,
        excludedDates,
        addedDates,
        fromDate: enr.startDate ? tashkentDateStr(enr.startDate) : null,
        toDate: day,
      }).length;
    }

    const release = departureRelease({
      departureDay: day,
      coveredDates,
      frozenOutDates: charge.frozenOutDates ?? [],
      coveredLessons: charge.coveredLessons,
      perLessonCost: charge.perLessonCost,
      discountPercent: charge.discountPercent ?? 0,
      chargedAmount: charge.chargedAmount,
      lessonsThroughDeparture,
    });
    if (!release) return null;
    return { charge, enr, periodYear, periodMonth, release };
  }
```

`enrollment-billing.service.ts`:
- Change :2 to `import { AttendanceStatus, PaymentModel, Prisma, TransactionType } from '@prisma/client';`.
- After the imports add:
```ts
/** 400 text: a MONTHLY freeze refund is computed, never typed. */
export const MONTHLY_FREEZE_OVERRIDE_ERROR =
  "Oylik to'lovli guruhda qaytariladigan dars sonini qo'lda o'zgartirib bo'lmaydi — oyning o'tmagan darslari puli avtomatik qaytariladi";
```
- At :317, add `paymentModel: true` to the course select.
- After :323 (`if (!enrollment) return null;`) insert:
```ts
    // Defence in depth: the reversal below walks LESSON_CONSUMPTION rows,
    // which on a course switched to monthly belong to the old pack.
    if (
      enrollment.group.course.paymentModel === PaymentModel.MONTHLY &&
      params.overrideLessons !== undefined
    ) {
      throw new BadRequestException(MONTHLY_FREEZE_OVERRIDE_ERROR);
    }
```

`students-status.service.ts`:
- Import `MONTHLY_FREEZE_OVERRIDE_ERROR` alongside `EnrollmentBillingService`.
- In `refundPrepaidForFreeze`, insert this before :330:
```ts
    // MONTHLY money on freeze is the month release (`refundMonthlyForFreeze`).
    // An override here used to reach the pack reversal: it reversed old
    // LESSON_CONSUMPTION rows, flipped them to EXCUSED and paid N lessons extra.
    const overrideIds = Object.keys(overrides ?? {});
    if (overrideIds.length > 0) {
      const monthlyOverridden = await this.prisma.enrollment.count({
        where: {
          id: { in: overrideIds },
          studentId,
          deletedAt: null,
          group: { course: { paymentModel: PaymentModel.MONTHLY } },
        },
      });
      if (monthlyOverridden > 0) {
        throw new BadRequestException(MONTHLY_FREEZE_OVERRIDE_ERROR);
      }
    }
```
- Add this to the `findMany` `where` at :331-335:
```ts
        // Pack leg only; `refundMonthlyForFreeze` owns MONTHLY enrollments.
        group: { course: { paymentModel: PaymentModel.LESSON_PACK } },
```

`students-read.service.ts`:
- Add `PaymentModel` to the `@prisma/client` import and `import { MonthlyChargeService } from '../billing/monthly-charge.service';`.
- Add `private monthlyChargeService: MonthlyChargeService,` as the third constructor parameter.
- Export these types above the class:
```ts
/** Freeze dialog, pack leg: an editable lessons-to-refund row. */
export interface PackRefundPreviewRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  prepaidLessonsRemaining: number;
  perLessonCost: number;
  consumedLessons: number;
  maxRefundable: number;
  suggestedRefundAmount: number;
}

/** Freeze dialog, MONTHLY leg: what the month release would credit now. Read-only. */
export interface MonthlyReleasePreviewRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  releaseLessons: number;
  releaseAmount: number;
}
```
- Replace :277-374 with:
```ts
  /**
   * FROZEN dialog preview. `pack`: LESSON_PACK enrollments, editable up to
   * prepaid + consumed. `monthly`: per MONTHLY enrollment, what
   * `reverseChargeForDeparture` would credit if frozen now (same rule, no write).
   */
  async getActiveEnrollmentsWithPrepaid(
    id: number,
    companyId: number,
  ): Promise<{ pack: PackRefundPreviewRow[]; monthly: MonthlyReleasePreviewRow[] }> {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: id, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true, lessonPaymentCount: true, paymentModel: true } },
          },
        },
      },
    });

    // "Frozen now": the same instant refundMonthlyForFreeze passes.
    const now = new Date();
    const monthly = await Promise.all(
      enrollments
        .filter((e) => e.group.course.paymentModel === PaymentModel.MONTHLY)
        .map(async (e) => {
          const release = await this.monthlyChargeService.previewReleaseForDeparture(
            this.prisma,
            { enrollmentId: e.id, departureDate: now },
          );
          return {
            enrollmentId: e.id,
            groupId: e.group.id,
            groupName: e.group.name,
            releaseLessons: release?.lessons ?? 0,
            releaseAmount: release?.amount ?? 0,
          };
        }),
    );

    const pack = await this.packRefundRows(
      enrollments.filter((e) => e.group.course.paymentModel === PaymentModel.LESSON_PACK),
    );
    return { pack, monthly };
  }

  private async packRefundRows(
    enrollments: Array<{
      id: string;
      prepaidLessonsRemaining: number;
      group: { id: string; name: string; course: { price: number; lessonPaymentCount: number } };
    }>,
  ): Promise<PackRefundPreviewRow[]> {
    if (enrollments.length === 0) return [];
    // (body = old lines :318-373 verbatim, from `const enrollmentIds = …`
    //  through the final `return enrollments.map(…)`)
  }
```
Moving that body is a verbatim move. Write it out in full rather than leaving the comment in place.

`change-student-status.dto.ts`: append this to the `frozenRefundOverrides` JSDoc: ` * LESSON_PACK enrollments only — a key for a MONTHLY enrollment is rejected (400).`

- [ ] **Step 4: Run the tests and confirm they pass**

Run the Step 2 command, then `cd server && npx jest src/billing src/students src/common/auth/operational-branch-scope.spec.ts`.

Expected: PASS. All existing `reverseChargeForDeparture` cases still pass unchanged. If the run takes longer than ~3 minutes, stop it and run the files one at a time.

- [ ] **Step 5: Typecheck and lint**

Run: `cd server && npm run typecheck && npx eslint src/billing/departure-release.ts src/billing/departure-release.spec.ts src/billing/monthly-charge.service.ts src/billing/enrollment-billing.service.ts src/students/students-read.service.ts src/students/students-status.service.ts src/students/dto/change-student-status.dto.ts src/common/auth/operational-branch-scope.spec.ts src/billing/*.spec.ts src/students/*.spec.ts`

Expected: no errors. Use `npx eslint` without `--fix` here, because `npm run lint` rewrites files.

- [ ] **Step 6: Commit**
```bash
git add server/src/billing/departure-release.ts server/src/billing/departure-release.spec.ts server/src/billing/monthly-charge.service.ts server/src/billing/monthly-charge.service.spec.ts server/src/billing/enrollment-billing.service.ts server/src/billing/enrollment-billing.service.spec.ts server/src/students/students-read.service.ts server/src/students/students-read.service.spec.ts server/src/students/students-status.service.ts server/src/students/students-status.service.spec.ts server/src/students/dto/change-student-status.dto.ts server/src/common/auth/operational-branch-scope.spec.ts
git commit -m "$(cat <<'EOF'
Freeze preview: split pack and monthly rows, reject monthly overrides

The freeze preview listed MONTHLY enrollments as "0 lessons" and accepted
a typed count that reversed pre-monthly consumption rows on top of the
month release. The preview now returns { pack, monthly }; monthly rows
quote the release via a pure departureRelease helper shared with
reverseChargeForDeparture. Overrides for MONTHLY enrollments get a 400.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Freeze dialog shows the monthly release line (client)

**Files:**
- Create: `client/src/lib/freeze-refund-preview.ts`
- Create: `client/src/lib/freeze-refund-preview.test.ts`
- Modify: `client/src/components/shared/change-status-dialog.tsx`: imports :1-53, comment and query :199-227, pack condition :385-387, new block before :448 (`{/* Sabab */}`)

**Interfaces:**
- Consumes: Task 3's `{ pack: PackRefundRow[]; monthly: MonthlyReleaseRow[] }`, using exactly the field names listed there.
- Produces: `freezePreviewLists(data: unknown): FreezeRefundPreview` and `monthlyReleaseLabel(row): string`.

- [ ] **Step 1: Write the failing test** (`client/src/lib/freeze-refund-preview.test.ts`)
```ts
import { describe, expect, it } from "vitest";
import { freezePreviewLists, monthlyReleaseLabel } from "./freeze-refund-preview";

const sp = (s: string) => s.replace(/\s/g, " ");

describe("monthlyReleaseLabel", () => {
  it("says how many of the month's lessons come back and for how much", () => {
    expect(sp(monthlyReleaseLabel({ releaseLessons: 8, releaseAmount: 276_920 }))).toBe(
      "Oyning qolgan 8 darsi uchun 276 920 so'm balansga qaytadi",
    );
  });
  it("says plainly when nothing comes back", () => {
    expect(monthlyReleaseLabel({ releaseLessons: 0, releaseAmount: 0 })).toBe(
      "Bu oydan qaytadigan dars yo'q — balans o'zgarmaydi",
    );
  });
});

describe("freezePreviewLists", () => {
  it("passes both lists through", () => {
    const monthly = [
      { enrollmentId: "e2", groupId: "g2", groupName: "B1", releaseLessons: 3, releaseAmount: 90_000 },
    ];
    expect(freezePreviewLists({ pack: [], monthly })).toEqual({ pack: [], monthly });
  });
  it("reads the old bare-array answer as nothing to show", () => {
    expect(freezePreviewLists([{ enrollmentId: "e1" }])).toEqual({ pack: [], monthly: [] });
  });
  it("is empty while loading", () => {
    expect(freezePreviewLists(undefined)).toEqual({ pack: [], monthly: [] });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd client && npx vitest run src/lib/freeze-refund-preview.test.ts`

Expected: FAIL with `Failed to resolve import "./freeze-refund-preview"`.

- [ ] **Step 3: Write the implementation**

`client/src/lib/freeze-refund-preview.ts`:
```ts
import { formatPrice } from "@/lib/format-utils";

/** `GET /students/:id/active-enrollments-prepaid` → `pack[]` (LESSON_PACK only). */
export interface PackRefundRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  prepaidLessonsRemaining: number;
  perLessonCost: number;
  consumedLessons: number;
  maxRefundable: number;
  suggestedRefundAmount: number;
}

/** `monthly[]`: what the server itself releases on freeze. Read-only. */
export interface MonthlyReleaseRow {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  releaseLessons: number;
  releaseAmount: number;
}

export interface FreezeRefundPreview {
  pack: PackRefundRow[];
  monthly: MonthlyReleaseRow[];
}

/**
 * Both lists, never undefined. An old server's bare array (deploy window)
 * yields two empty lists: no refund block rather than a crash.
 */
export function freezePreviewLists(data: unknown): FreezeRefundPreview {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { pack: [], monthly: [] };
  }
  const d = data as Partial<FreezeRefundPreview>;
  return { pack: d.pack ?? [], monthly: d.monthly ?? [] };
}

/** The read-only line under a monthly enrollment in the freeze dialog. */
export function monthlyReleaseLabel(
  row: Pick<MonthlyReleaseRow, "releaseLessons" | "releaseAmount">,
): string {
  if (row.releaseLessons <= 0 || row.releaseAmount <= 0) {
    return "Bu oydan qaytadigan dars yo'q — balans o'zgarmaydi";
  }
  return `Oyning qolgan ${row.releaseLessons} darsi uchun ${formatPrice(row.releaseAmount)} so'm balansga qaytadi`;
}
```

`change-status-dialog.tsx`:
- Add the import:
```tsx
import {
  freezePreviewLists,
  monthlyReleaseLabel,
  type FreezeRefundPreview,
} from "@/lib/freeze-refund-preview";
```
- Replace `type PrepaidEnrollment = {…}` and its `useQuery` (:206-227) with:
```tsx
  const { data: freezePreview } = useQuery<FreezeRefundPreview>({
    queryKey: ["student-active-enrollments-prepaid", entityId],
    queryFn: () =>
      api
        .get<FreezeRefundPreview>(`/students/${entityId}/active-enrollments-prepaid`)
        .then((r) => r.data),
    enabled: open && isFreezingStudent,
    staleTime: 30_000,
  });
  // Pack rows are editable; monthly rows only say what the system releases.
  const { pack: prepaidEnrollments, monthly: monthlyReleases } =
    freezePreviewLists(freezePreview);
```
- In the comment at :200-202, change "active enrollments" to "pack enrollments (editable) and monthly enrollments (read-only release)".
- At :385-387, change the condition to `{isFreezingStudent && prepaidEnrollments.length > 0 && (`. The pack block's body and its warning stay as they are.
- Insert this directly before `{/* Sabab */}`:
```tsx
              {/* MONTHLY enrollments: the server releases the month's
                  not-yet-held lessons itself (same rule as the freeze).
                  Nothing to edit — an override is rejected server-side. */}
              {isFreezingStudent && monthlyReleases.length > 0 && (
                <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
                  <div className="text-xs font-medium text-blue-900 dark:text-blue-300">
                    Oylik to'lov — o'tmagan darslar puli avtomatik qaytadi
                  </div>
                  {monthlyReleases.map((row) => (
                    <div key={row.enrollmentId} className="text-xs">
                      <div className="truncate font-medium" title={row.groupName}>
                        {row.groupName}
                      </div>
                      <div className="tabular-nums text-muted-foreground">
                        {monthlyReleaseLabel(row)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
```
Submit logic is unchanged. Override keys can only come from pack inputs, so a MONTHLY key is never sent. The dialog keeps the base `DialogContent` scroll floor (`max-h-[90dvh] overflow-y-auto`), so the extra block stays scroll-safe.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd client && npx vitest run src/lib/freeze-refund-preview.test.ts`

Expected: PASS (5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `cd client && npx tsc --noEmit && npx eslint src/lib/freeze-refund-preview.ts src/lib/freeze-refund-preview.test.ts src/components/shared/change-status-dialog.tsx`

Expected: no errors.

- [ ] **Step 6: Commit**
```bash
git add client/src/lib/freeze-refund-preview.ts client/src/lib/freeze-refund-preview.test.ts client/src/components/shared/change-status-dialog.tsx
git commit -m "$(cat <<'EOF'
Freeze dialog: show the monthly release as a read-only line

Monthly enrollments no longer get an editable lesson count; the dialog
states how many of the month's lessons and how much money the freeze
returns to the balance. Pack enrollments keep the editable rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

Deploy order: server before client.
- **Old client with new server:** it reads `.length` on the new object, gets `undefined`, and hides the refund block. That is safe because it no longer offers the harmful input.
- **New client with old server:** `freezePreviewLists` turns the old bare array into empty lists.

---

### Task 5: Debt write-offs — exclude undo rows and block undoing an undo

**Files:**
- Modify: `server/src/transactions/transactions-read.service.ts:25` (import), `:943-1024` (`findDebtWriteOffs`)
- Modify: `server/src/billing/debt-write-off.service.ts:397-406` (`reverseWriteOff`)
- Modify: `client/src/components/payments/debt-write-offs-client.tsx:61,75-96,149-150,178,441`
- Create: `client/src/components/payments/debt-write-off-actions.ts`
- Test: `server/src/transactions/transactions-read.service.spec.ts`, `server/src/billing/debt-write-off.service.spec.ts`, `client/src/components/payments/debt-write-off-actions.test.ts`

**Interfaces:**
- Consumes: `tashkentRangeFilter` (`common/date/tashkent.ts:92`), `TransactionsService.reverseTransaction` (unchanged).
- Produces: `GET /transactions/debt-write-offs` rows gain `reversedTransactionId`. The response gains `activeCount`, and `totalAmount` counts only write-offs still in effect, in both modes. The client gets `canUndoWriteOff(isCeo, row)`.

- [ ] **Step 1: Write the failing tests**

`transactions-read.service.spec.ts`: add `aggregate: jest.Mock` to the `transaction` type (line 9) and `aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null }, _count: 0 }),` to the mock (after line 21). Then insert before the final `});` (line 863):
```ts
  describe('findDebtWriteOffs', () => {
    const whereOf = (m: jest.Mock) =>
      (m.mock.calls[0][0] as { where: Record<string, unknown> }).where;

    it('never lists the undo rows and returns reversedTransactionId', async () => {
      await service.findDebtWriteOffs(1001, { branchIds: null });
      expect(whereOf(prisma.transaction.findMany)).toEqual(
        expect.objectContaining({ reversedTransactionId: null, reversedAt: null }),
      );
      expect(
        prisma.transaction.findMany.mock.calls[0][0].select.reversedTransactionId,
      ).toBe(true);
    });

    it('the include-undone toggle shows undone originals, never their counter-rows', async () => {
      await service.findDebtWriteOffs(1001, { branchIds: null, includeReversed: true });
      const where = whereOf(prisma.transaction.findMany);
      expect(where.reversedTransactionId).toBeNull();
      expect(where).not.toHaveProperty('reversedAt');
      expect(whereOf(prisma.transaction.count)).toEqual(where);
    });

    it('totals only what is still forgiven, even when undone originals are listed', async () => {
      prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 300_000 }, _count: 2 });
      const res = await service.findDebtWriteOffs(1001, { branchIds: null, includeReversed: true });
      expect(whereOf(prisma.transaction.aggregate)).toEqual(
        expect.objectContaining({ reversedTransactionId: null, reversedAt: null }),
      );
      expect(res.totalAmount).toBe(300_000);
      expect(res.activeCount).toBe(2);
    });

    it('filters by a start date alone', async () => {
      await service.findDebtWriteOffs(1001, { branchIds: null, from: '2026-09-01' });
      expect(whereOf(prisma.transaction.findMany).createdAt).toEqual({
        gte: new Date('2026-08-31T19:00:00.000Z'),
      });
    });

    it('filters by an end date alone', async () => {
      await service.findDebtWriteOffs(1001, { branchIds: null, to: '2026-09-30' });
      expect(whereOf(prisma.transaction.findMany).createdAt).toEqual({
        lt: new Date('2026-09-30T19:00:00.000Z'),
      });
    });
  });
```

`debt-write-off.service.spec.ts`: append after line 524:
```ts
describe('DebtWriteOffService.reverseWriteOff', () => {
  let service: DebtWriteOffService;
  let client: any;
  let transactionsService: any;
  const params = {
    transactionId: 'tx-1',
    companyId: COMPANY_ID,
    performedById: PERFORMER_ID,
    reason: 'Xato kechirilgan edi',
  };
  const row = (o: Record<string, unknown> = {}) => ({
    id: 'tx-1', type: 'DEBT_WRITE_OFF', amount: 150_000, companyId: COMPANY_ID,
    studentId: STUDENT_ID, reversedAt: null, reversedTransactionId: null, ...o,
  });

  beforeEach(async () => {
    client = buildClient();
    // reverseWriteOff reads the row through the tx client it opens itself.
    client.$transaction.mockImplementation(async (cb: any) => cb(client));
    transactionsService = {
      recordDebtWriteOff: jest.fn(),
      reverseTransaction: jest.fn().mockResolvedValue({ id: 'tx-undo' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtWriteOffService,
        { provide: PrismaService, useValue: client },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: EntityHistoryService, useValue: { recordUpdate: jest.fn() } },
      ],
    }).compile();
    service = module.get(DebtWriteOffService);
  });

  it('undoes an original write-off exactly as before', async () => {
    client.transaction.findFirst.mockResolvedValue(row());
    await expect(service.reverseWriteOff(params)).resolves.toEqual({ id: 'tx-undo' });
    expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
      'tx-1', { performedById: PERFORMER_ID, reason: params.reason }, client,
    );
  });

  it('refuses an undo row with 400 instead of forgiving the debt again', async () => {
    client.transaction.findFirst.mockResolvedValue(
      row({ amount: -150_000, reversedTransactionId: 'tx-orig' }),
    );
    const err = await service.reverseWriteOff(params).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/qaytarib olib bo'lmaydi/);
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });

  it('still refuses an original that was already undone', async () => {
    client.transaction.findFirst.mockResolvedValue(row({ reversedAt: new Date('2026-09-20T10:00:00Z') }));
    await expect(service.reverseWriteOff(params)).rejects.toThrow(
      'Bu hisobdan chiqarish allaqachon bekor qilingan',
    );
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**
Run: `cd server && npx jest src/transactions/transactions-read.service.spec.ts -t "findDebtWriteOffs"` and `npx jest src/billing/debt-write-off.service.spec.ts -t "reverseWriteOff"`
Expected: 5 read tests FAIL: `reversedTransactionId` is missing from the where clause, `createdAt` is `undefined`, and `activeCount` is `undefined`. `refuses an undo row` FAILS: it expects a `BadRequestException` but gets `Object`. The other two pass. They guard behaviour that must not change.

- [ ] **Step 3: Write minimal implementation**

`transactions-read.service.ts:25`:
```ts
import { tashkentRangeFilter, tashkentRangeUtc } from '../common/date/tashkent';
```
Replace the JSDoc (`:943-951`) paragraph "Returns only active…" with:
```ts
   * An undo is written by `reverseTransaction()` as another DEBT_WRITE_OFF row
   * (negative amount, `reversedTransactionId` -> original, `reversedAt` null).
   * It is a correction, not a write-off: never listed or summed in any mode.
   * `includeReversed` brings back the undone ORIGINALS. The totals count only
   * write-offs still in effect, so undone forgiveness never inflates them.
```
Replace `:973-983` (`const where …`) with:
```ts
    // Either bound works alone; tashkentRangeUtc required both.
    const createdAt = tashkentRangeFilter(options.from, options.to);
    const baseWhere: Prisma.TransactionWhereInput = {
      companyId,
      type: TransactionType.DEBT_WRITE_OFF,
      reversedTransactionId: null,
      ...branchIdWhere(options.branchIds),
      ...(options.performedById && { performedById: options.performedById }),
      ...(createdAt && { createdAt }),
    };
    const activeWhere: Prisma.TransactionWhereInput = { ...baseWhere, reversedAt: null };
    const where = options.includeReversed ? baseWhere : activeWhere;
```
Add `reversedTransactionId: true,` after `reversedAt: true,` (line 998). Rename `sumAggregate` to `activeAggregate`. Replace the `aggregate` call (`:1011-1014`) with:
```ts
      this.prisma.transaction.aggregate({
        where: activeWhere,
        _sum: { amount: true },
        _count: true,
      }),
```
Return `totalAmount: activeAggregate._sum.amount ?? 0, activeCount: activeAggregate._count,`.

`debt-write-off.service.ts`: insert between the NotFound block and the `reversedAt` check (after line 401):
```ts
        // An undo row is itself a DEBT_WRITE_OFF. Undoing it would forgive the
        // debt again, and write-off may be switched off entirely. Refuse here
        // with a 400 rather than rely on reverseTransaction's plain Error (500).
        if (original.reversedTransactionId !== null) {
          throw new BadRequestException(
            "Bu yozuv kechirishni qaytarib olgan yozuv — uni qaytarib olib bo'lmaydi",
          );
        }
```

- [ ] **Step 4: Run tests to verify they pass**
Run: `cd server && npx jest src/transactions src/billing/debt-write-off.service.spec.ts`
Expected: PASS. Then run `npm test` (full suite): all green.

- [ ] **Step 5: Client change**

Create `client/src/components/payments/debt-write-off-actions.ts`:
```ts
export interface WriteOffUndoState {
  reversedAt: string | null;
  reversedTransactionId?: string | null;
}

/**
 * Only the CEO, and only on an original write-off still in effect. An undo row
 * (reversedTransactionId set) is the correction itself; undoing it would
 * forgive the debt again. The server refuses both cases too.
 */
export function canUndoWriteOff(isCeo: boolean, row: WriteOffUndoState): boolean {
  return isCeo && !row.reversedAt && !row.reversedTransactionId;
}
```
Create `debt-write-off-actions.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canUndoWriteOff } from "./debt-write-off-actions";

describe("canUndoWriteOff", () => {
  const original = { reversedAt: null, reversedTransactionId: null };
  it("lets the CEO undo an original still in effect", () => {
    expect(canUndoWriteOff(true, original)).toBe(true);
  });
  it("never offers undo to anyone but the CEO", () => {
    expect(canUndoWriteOff(false, original)).toBe(false);
  });
  it("hides undo on an original already undone", () => {
    expect(canUndoWriteOff(true, { reversedAt: "2026-09-20T10:00:00.000Z", reversedTransactionId: null })).toBe(false);
  });
  it("hides undo on the undo row itself", () => {
    expect(canUndoWriteOff(true, { reversedAt: null, reversedTransactionId: "tx-orig" })).toBe(false);
  });
});
```
In `debt-write-offs-client.tsx`:
- Import `canUndoWriteOff` from `./debt-write-off-actions` after line 61.
- Add `reversedTransactionId: string | null;` after `reversedAt` in `DebtWriteOffRow`.
- Add `activeCount: number;` to `DebtWriteOffsResponse`.
- After line 150, add `const activeCount = data?.activeCount ?? 0;`.
- Line 178 becomes `<SummaryCard totalAmount={totalAmount} totalRows={activeCount} />`. Pagination keeps `totalRows`.
- Line 441 becomes `{canUndoWriteOff(isCeo, row) ? (`.

Run: `cd client && npx vitest run src/components/payments/debt-write-off-actions.test.ts`. Expected: FAIL before the helper exists, PASS after.

- [ ] **Step 5b: Same exclusion in the overview write-off card**

The «Hisobdan chiqarilgan» card on /payments/overview reads `ReportsFinancialService.getDebtWriteOffsSummary` (`server/src/reports/reports-financial.service.ts:58-107`), which filters only on `reversedAt: null` — an undo row would lower its total too.

Add to `server/src/reports/reports-financial.service.spec.ts`, inside `describe('ReportsFinancialService')`:
```ts
  describe('getDebtWriteOffsSummary', () => {
    it('sums only write-offs still in effect — never the undo counter-rows', async () => {
      prisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: 250_000 },
        _count: 2,
      });

      const res = await service.getDebtWriteOffsSummary(1001, {
        branchIds: [1],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });

      expect(prisma.transaction.aggregate.mock.calls[0][0].where).toMatchObject({
        companyId: 1001,
        type: 'DEBT_WRITE_OFF',
        reversedAt: null,
        reversedTransactionId: null,
        branchId: { in: [1] },
      });
      expect(res).toMatchObject({ totalAmount: 250_000, count: 2 });
    });
  });
```
Run: `cd server && npx jest src/reports/reports-financial.service.spec.ts -t "getDebtWriteOffsSummary"` — Expected: FAIL (`reversedTransactionId` missing from the where clause).

In `getDebtWriteOffsSummary`, change the `where` object to:
```ts
    const where: Prisma.TransactionWhereInput = {
      companyId,
      type: TransactionType.DEBT_WRITE_OFF,
      // Undone originals carry `reversedAt`; the undo itself is a counter-row
      // with `reversedTransactionId`. Neither is forgiveness still in effect.
      reversedAt: null,
      reversedTransactionId: null,
      createdAt: tashkentRangeUtc(periodStart, periodEnd),
      // Both a `branchId` and a `branchIds` used to be spread here, the second
      // silently clobbering the first — the same class of bug the resolved
      // scope exists to make unrepresentable.
      ...branchIdWhere(options.branchIds),
    };
```
If `branchIdWhere([1])` produces `{ branchId: 1 }` rather than `{ branchId: { in: [1] } }`, adjust only the test's expected `branchId` to what `branchIdWhere` returns for a single id (read `server/src/common/finance/report-branch-scope.ts`). Re-run: PASS. Add `server/src/reports/reports-financial.service.ts server/src/reports/reports-financial.service.spec.ts` to this task's lint and `git add` lists.

- [ ] **Step 6: Typecheck + lint touched files**
Run: `cd server && npm run typecheck && npx prettier --write src/transactions/transactions-read.service*.ts src/billing/debt-write-off.service*.ts && npx eslint src/transactions/transactions-read.service.ts src/transactions/transactions-read.service.spec.ts src/billing/debt-write-off.service.ts src/billing/debt-write-off.service.spec.ts`
Run: `cd client && npx tsc --noEmit && npx eslint src/components/payments/debt-write-offs-client.tsx src/components/payments/debt-write-off-actions.ts src/components/payments/debt-write-off-actions.test.ts && npm test`
Expected: 0 errors.

- [ ] **Step 7: Commit**
```bash
git add server/src/transactions/transactions-read.service.ts server/src/transactions/transactions-read.service.spec.ts server/src/billing/debt-write-off.service.ts server/src/billing/debt-write-off.service.spec.ts client/src/components/payments/debt-write-offs-client.tsx client/src/components/payments/debt-write-off-actions.ts client/src/components/payments/debt-write-off-actions.test.ts
git commit -m "fix(debt-write-offs): hide undo rows and refuse undoing an undo

The list filtered on reversedAt alone, so a reversal counter-row was listed
as a negative write-off, shrank the total and carried the CEO's undo action.
Counter-rows are now excluded in both modes, totals count only write-offs
still in effect, and either date bound filters on its own. reverseWriteOff
answers 400 for a counter-row instead of reverseTransaction's 500.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Payment reports: branch-scoped breakdown and refunds, multi-branch director

**Decision on problem 3:** The server should accept the branch list. Every leg of `/payment-reports` already filters on a `branchId` column, so the list costs one signature change and follows the existing `departedScope` precedent (ADR-0035). The teachers table stays single-branch because A2 item 3 removes its payment columns. The client gets a real error state for both queries, so the teachers table shows the server's «filialni tanlang» message and the cards can no longer spin forever.

**Refund source:** Use the REFUND ledger `Transaction`. `recordRefund` stamps it with the student's branch, and the net-profit refund figure (`getPeriodOutflows`) reads the same rows. `Refund` itself has no branch, and a reversed refund stays `COMPLETED` on it.

**Files:**
- Modify: `server/src/reports/reports-payments.service.ts:1-18, 164-236, 374-437, 439-469`
- Modify: `server/src/reports/reports.service.ts:614-625`
- Modify: `server/src/reports/reports.controller.ts:622-649` (rename `departedScope` to `listScope`, including its 5 call sites at :707, :720, :733, :789, :822)
- Modify: `client/src/components/reports/payment-reports/payment-reports-client.tsx:161-221`, `client/src/components/reports/payment-reports/teachers-report-table.tsx:44-97`
- Create: `client/src/components/reports/payment-reports/report-view-state.ts` (+ `.test.ts`)
- Test: `server/src/reports/reports-payments.service.spec.ts` (new), `server/src/reports/reports.controller.spec.ts`, `server/src/reports/reports.service.spec.ts:98-135, 607-680`

**Interfaces:**
- Consumes: `branchIdWhere`, `ReportBranchIds`, `@BranchScope()`
- Produces: `getPaymentReports(companyId, { branchIds: ReportBranchIds; startDate?; endDate?; months? })`. The response shape is unchanged.

- [ ] **Step 1: Write the failing tests**

`server/src/reports/reports-payments.service.spec.ts`:
```ts
import { ReportsPaymentsService } from './reports-payments.service';

describe('ReportsPaymentsService.getPaymentReports — branch scope', () => {
  let prisma: any;
  let service: ReportsPaymentsService;
  const september = { startDate: '2026-09-01', endDate: '2026-09-30' };

  beforeEach(() => {
    prisma = {
      payment: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { amount: 0 }, _count: 0 }),
        // No payments, so the on-time check never issues its own queries.
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      branch: { findMany: jest.fn().mockResolvedValue([]) },
      transaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
        count: jest.fn().mockResolvedValue(0),
      },
      refund: { aggregate: jest.fn(), count: jest.fn() },
    };
    service = new ReportsPaymentsService(prisma);
  });

  const wheres = (model: string) =>
    (Object.values(prisma[model]) as jest.Mock[]).flatMap((fn) =>
      fn.mock.calls.map((c) => c[0]?.where),
    );

  it("confines the branch breakdown to the caller's branches", async () => {
    prisma.branch.findMany.mockResolvedValue([
      { id: 3, name: 'Filial C' },
      { id: 7, name: 'Filial G' },
    ]);
    prisma.payment.groupBy.mockResolvedValue([
      { branchId: 7, _sum: { amount: 4_000_000 } },
      { branchId: 3, _sum: { amount: 1_000_000 } },
    ]);

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3, 7],
    });

    expect(prisma.branch.findMany.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      id: { in: [3, 7] },
    });
    expect(prisma.payment.groupBy.mock.calls[0][0].where).toMatchObject({
      branchId: { in: [3, 7] },
    });
    expect(out.branchBreakdown.byBranch).toEqual([
      { branchId: 7, branchName: 'Filial G', amount: 4_000_000 },
      { branchId: 3, branchName: 'Filial C', amount: 1_000_000 },
    ]);
  });

  it('every payment and refund query carries the branch predicate', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: [3, 7] });

    const unscoped = [...wheres('payment'), ...wheres('transaction')].filter(
      (w) => w?.branchId === undefined,
    );
    expect(unscoped).toEqual([]);
    expect(prisma.refund.aggregate).not.toHaveBeenCalled();
    expect(prisma.refund.count).not.toHaveBeenCalled();
  });

  it('reads refunds from the branch-stamped REFUND ledger rows, reversals excluded', async () => {
    prisma.transaction.aggregate.mockResolvedValue({
      _sum: { amount: -350_000 },
    });
    prisma.transaction.count.mockResolvedValue(2);

    const out = await service.getPaymentReports(1001, {
      ...september,
      branchIds: [3],
    });

    expect(prisma.transaction.aggregate.mock.calls[0][0].where).toMatchObject({
      companyId: 1001,
      type: 'REFUND',
      reversedAt: null,
      reversedTransactionId: null,
      branchId: { in: [3] },
    });
    expect(out.refunds.current).toBe(350_000);
    expect(out.refunds.count).toBe(2);
  });

  it('counts refunds up to, not including, the day after the range', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: [3] });

    expect(prisma.transaction.count.mock.calls[0][0].where.createdAt).toEqual({
      gte: new Date('2026-08-31T19:00:00.000Z'),
      lt: new Date('2026-09-30T19:00:00.000Z'),
    });
  });

  it('leaves a company-wide caller unfiltered', async () => {
    await service.getPaymentReports(1001, { ...september, branchIds: null });

    expect(prisma.branch.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'id',
    );
    const scoped = [...wheres('payment'), ...wheres('transaction')].filter(
      (w) => w?.branchId !== undefined,
    );
    expect(scoped).toEqual([]);
  });
});
```

In `server/src/reports/reports.controller.spec.ts`, import `PaymentReportsQueryDto` from `./dto/payment-reports-query.dto` and add this after the `departed students — branch scope` describe:
```ts
  describe('getPaymentReports() — branch scope', () => {
    it('hands a multi-branch director their branch list instead of a 400', async () => {
      await controller.getPaymentReports(
        { startDate: '2026-09-01', endDate: '2026-09-30' } as PaymentReportsQueryDto,
        1001,
        [3, 7],
      );
      expect(mockService.getPaymentReports).toHaveBeenLastCalledWith(1001, {
        branchIds: [3, 7],
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        months: undefined,
      });
    });

    it('refuses a scope that resolved to no branch', () => {
      expect(() =>
        controller.getPaymentReports({} as PaymentReportsQueryDto, 1001, []),
      ).toThrow(ForbiddenException);
    });
  });
```

In `server/src/reports/reports.service.spec.ts`, make three edits:
1. Add `transaction: { aggregate: jest.fn(), count: jest.fn() },` next to `refund:` in the `beforeEach` mock.
2. In the three `getPaymentReports` tests, replace the `prisma.refund.aggregate…` and `prisma.refund.count…` lines with `prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 0 } });` and `prisma.transaction.count.mockResolvedValue(0);`.
3. Add `branchIds: null` to each of those three calls (`{ months: 6, branchIds: null }`, `{ months: 3, branchIds: null }`, `{ branchIds: null }`).

- [ ] **Step 2: Run to verify fail.** Run `cd server && npx jest src/reports/reports-payments.service.spec.ts src/reports/reports.controller.spec.ts -t "branch scope"`. Expected: the service spec fails with TS2353 (`'branchIds' does not exist in type`), and the controller test fails with `BadRequestException: Bir nechta filialga kirish huquqingiz bor — filialni tanlang`.

- [ ] **Step 3: Minimal implementation**

In `reports-payments.service.ts`, add `import { TransactionType } from '@prisma/client';` and put this below `LINE_ITEM_CAP`:
```ts
/**
 * Refunds as the ledger records them — the same rows the net-profit refund
 * figure subtracts (`getPeriodOutflows`). `Refund` carries no branch; its
 * REFUND transaction is stamped with the branch whose kassa paid it out.
 * Reversed originals and their compensating rows are both excluded, so an
 * undone refund counts as nothing. `lt`: the end bound is exclusive.
 */
function refundLedgerWhere(
  companyId: number,
  range: { gte: Date; lt: Date },
  branchIds: ReportBranchIds,
) {
  return {
    companyId,
    type: TransactionType.REFUND,
    reversedAt: null,
    reversedTransactionId: null,
    createdAt: range,
    ...branchIdWhere(branchIds),
  };
}
```
Change `getPaymentReports`:
- Change the options type from `branchId?: number` to `branchIds: ReportBranchIds`.
- Replace lines 174-175 with `const { branchIds } = options;`.
- Pass `branchIds` in place of `branchFilter` to all three `computePaymentMetricsForPeriod` calls, and call `this.computeBranchBreakdown(companyId, currentPeriod, branchIds)`.
- Replace the `refund.count` call with:
```ts
      this.prisma.transaction.count({
        where: refundLedgerWhere(
          companyId,
          { gte: currentStart, lt: currentEnd },
          branchIds,
        ),
      }),
```
In `computePaymentMetricsForPeriod`:
- Change the third parameter to `branchIds: ReportBranchIds` and start the body with `const branchFilter = branchIdWhere(branchIds);`.
- Replace the `refund.aggregate` call with `this.prisma.transaction.aggregate({ where: refundLedgerWhere(companyId, dateFilter, branchIds), _sum: { amount: true } })`.
- Return `refunds: Math.abs(refundsAgg._sum.amount ?? 0)`.

In `computeBranchBreakdown`, add the parameter `branchIds: ReportBranchIds`:
```ts
      this.prisma.payment.groupBy({
        by: ['branchId'],
        where: {
          companyId,
          status: 'COMPLETED',
          createdAt: { gte: period.start, lt: period.end },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
      // Only the caller's branches get a row — `[]` lists none (fail-closed).
      this.prisma.branch.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...(branchIds == null ? {} : { id: { in: branchIds } }),
        },
        select: { id: true, name: true },
      }),
```
In `reports.service.ts:615-622`, change the facade option `branchId?: number` to `branchIds: ReportBranchIds`.

In `reports.controller.ts`, rename `departedScope` to `listScope` everywhere and replace its doc comment with:
```ts
  /**
   * Hand a report the resolved scope as a LIST, so a caller with several
   * branches gets all of them rather than a 400 from `scoped()`. Used by the
   * departed-students reports (ADR-0035) and /payment-reports. An empty scope
   * is refused, never served as zeros (ADR-0002).
   */
```
In the `getPaymentReports` handler, replace `branchId: this.scoped(query, scope).branchId,` with:
```ts
      // Every leg filters with `branchIdWhere`, so the list is exact.
      branchIds: this.listScope(scope),
```

- [ ] **Step 4: Run to verify pass.** Run `cd server && npx jest src/reports/reports-payments.service.spec.ts src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts`. Expected: PASS.

- [ ] **Step 5: Client change**

`client/src/components/reports/payment-reports/report-view-state.ts`:
```ts
export type ReportViewState = "loading" | "error" | "ready";

/**
 * Which state a report section renders. `isLoading || !data` treated a failed
 * request as "still loading", so a refused request left the page on
 * «Ma'lumotlar yuklanmoqda...» forever. Data wins when present, so a failed
 * background refetch keeps the last good figures on screen.
 */
export function reportViewState(q: {
  data: unknown;
  isError: boolean;
}): ReportViewState {
  if (q.data !== undefined && q.data !== null) return "ready";
  return q.isError ? "error" : "loading";
}

/** A 4xx is an answer, not a hiccup — retrying only delays the message. */
export function retryUnlessRefused(failureCount: number, error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 3;
}
```
`report-view-state.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { reportViewState, retryUnlessRefused } from "./report-view-state";

describe("reportViewState", () => {
  it("shows the error, not the spinner, when the request failed", () => {
    expect(reportViewState({ data: undefined, isError: true })).toBe("error");
  });
  it("is loading while nothing has arrived and nothing failed", () => {
    expect(reportViewState({ data: undefined, isError: false })).toBe("loading");
  });
  it("keeps the last good figures when a refetch fails", () => {
    expect(reportViewState({ data: { ok: 1 }, isError: true })).toBe("ready");
  });
});

describe("retryUnlessRefused", () => {
  it("does not retry a refusal", () => {
    expect(retryUnlessRefused(0, { response: { status: 400 } })).toBe(false);
    expect(retryUnlessRefused(0, { response: { status: 403 } })).toBe(false);
  });
  it("retries server and network errors up to three times", () => {
    expect(retryUnlessRefused(0, { response: { status: 500 } })).toBe(true);
    expect(retryUnlessRefused(3, new Error("Network Error"))).toBe(false);
  });
});
```
Changes to `payment-reports-client.tsx`:
- Imports: add `Button` from `@/components/ui/button`, `getErrorMessage` from `@/lib/get-error-message`, and `reportViewState` and `retryUnlessRefused` from `./report-view-state`.
- Query: change the destructure to `const { data, isError, error, refetch } = useQuery({ ..., retry: retryUnlessRefused })`, then add `const view = reportViewState({ data, isError });`.
- Render: replace the condition `isLoading || !data ?` with:
```tsx
      {view === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {getErrorMessage(error, "To'lov hisobotlarini yuklab bo'lmadi.")}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : view === "loading" || !data ? (
```
The existing skeleton block and cards block stay as they are.
- Tooltip text: change the «Filiallar bo'yicha» tooltip to `"Tanlangan davrdagi jami to'lovlar, filiallar kesimida. Tafsilotlar uchun bosing."`

Changes to `teachers-report-table.tsx`:
- Import `getErrorMessage`, `reportViewState` and `retryUnlessRefused`.
- Query: destructure `{ data, isLoading, isError, error }`, add `retry: retryUnlessRefused`, then add `const view = reportViewState({ data, isError });`.
- Render: change `isLoading && !data ?` to `view === "loading" ?`, and insert this before the empty-state branch:
```tsx
            ) : view === "error" ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-sm text-muted-foreground"
                >
                  {getErrorMessage(error, "O'qituvchilar ro'yxatini yuklab bo'lmadi")}
                </TableCell>
              </TableRow>
```
Run `cd client && npx vitest run src/components/reports/payment-reports/report-view-state.test.ts`. Expected: PASS.

- [ ] **Step 6: Typecheck and lint.**
  - Server: `cd server && npx tsc -p tsconfig.check.json --noEmit && npx eslint src/reports/reports-payments.service.ts src/reports/reports-payments.service.spec.ts src/reports/reports.service.ts src/reports/reports.controller.ts src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts`
  - Client: `cd client && npx tsc --noEmit && npx eslint src/components/reports/payment-reports`

- [ ] **Step 7: Commit**
```
git commit -m "fix(reports): scope payment-report breakdown and refunds to the caller's branches

The branch breakdown and refund figures on /reports/payment-reports now use
the resolved branch scope. Refunds are read from the branch-stamped REFUND
ledger rows (the net-profit source) with an exclusive end bound. A caller
with several branches gets those branches; the page renders an error state
instead of an endless loader.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Net-profit cache key and expectation history: exact branch set

**Why the caller id also goes in the key:** The payroll leg of the canonical figure comes from the caller's own payroll scope (`resolveMonthlyScope` → `narrowPayrollScope`, which uses `mainBranch`). A multi-branch director who picks a non-main branch gets payroll marked `blocked`, so their "branch 2" figure differs from a CEO's "branch 2" figure. One shared key would serve one of them the other's number.

**Files:**
- Modify: `server/src/reports/net-profit-cache.ts:22-65`
- Modify: `server/src/reports/reports.service.ts:522-552`
- Modify: `server/src/reports/reports-expectation-history.service.ts:1-8, 50-120, 128-160`
- Test: `server/src/reports/net-profit-cache.spec.ts`, `server/src/reports/reports.service.spec.ts`, `server/src/reports/reports-expectation-history.service.spec.ts` (new)

**Interfaces:**
- Produces: `netProfitCacheKey(s: NetProfitCacheScope)` and `cachedNetProfit(redis, s: NetProfitCacheScope, compute)`, where `NetProfitCacheScope = { companyId; branchIds: ReportBranchIds; performedById; monthKey }`. The cache version goes to `v3`, which drops any entry a multi-branch caller wrote under `:all:`.
- `getMonthlyHistory` keeps its signature. A branch list now reads that list's per-branch rows.

- [ ] **Step 1: Write the failing tests**

In `net-profit-cache.spec.ts`, add `import type { ReportBranchIds } from '../common/finance/report-branch-scope';` and a helper:
```ts
const at = (branchIds: ReportBranchIds, monthKey = '2026-07') => ({
  companyId: 1001,
  branchIds,
  performedById: 10001,
  monthKey,
});
```
Replace the `netProfitCacheKey` describe with:
```ts
describe('netProfitCacheKey', () => {
  it('keeps a multi-branch scope off the company-wide entry', () => {
    expect(netProfitCacheKey(at([3, 7]))).not.toBe(netProfitCacheKey(at(null)));
  });
  it('names the branch set sorted and de-duplicated', () => {
    expect(netProfitCacheKey(at([7, 3, 7]))).toBe(
      'rpt:np:v3:1001:3,7:u10001:2026-07',
    );
  });
  it('separates one branch from a set containing it', () => {
    expect(netProfitCacheKey(at([3]))).not.toBe(netProfitCacheKey(at([3, 7])));
  });
  it('separates callers, whose payroll leg can differ for the same branches', () => {
    expect(
      netProfitCacheKey({ ...at([3]), performedById: 10002 }),
    ).not.toBe(netProfitCacheKey(at([3])));
  });
  it('writes company-wide as all and an empty scope as none', () => {
    expect(netProfitCacheKey(at(null))).toBe('rpt:np:v3:1001:all:u10001:2026-07');
    expect(netProfitCacheKey(at([]))).toBe('rpt:np:v3:1001:none:u10001:2026-07');
  });
});
```
In the `cachedNetProfit` tests:
- Rewrite each `cachedNetProfit(redis, 1001, undefined, 'M', compute)` as `cachedNetProfit(redis, at(null, 'M'), compute)`.
- Rewrite each `1001, 2, '2026-07'` argument triple as `at([2])`.
- Change the expected `setex` key to `'rpt:np:v3:1001:all:u10001:2026-07'`.

In `reports.service.spec.ts`, add inside `describe('ReportsService')`:
```ts
  describe('getFinancialTrendCanonical — cache key', () => {
    it('keys a multi-branch scope by its own branch set, never the company entry', async () => {
      jest
        .spyOn((service as any).financial, 'getFinancialTrend')
        .mockResolvedValue([{ monthKey: '2026-08', profit: 0 }]);
      jest
        .spyOn(service, 'getMonthlyNetProfit')
        .mockResolvedValue({ netProfit: 4_200_000 } as any);

      const rows = await service.getFinancialTrendCanonical(1001, [7, 3], 10001);

      expect(redis.get).toHaveBeenCalledWith('rpt:np:v3:1001:3,7:u10001:2026-08');
      expect(redis.setex).toHaveBeenCalledWith(
        'rpt:np:v3:1001:3,7:u10001:2026-08',
        expect.any(Number),
        '4200000',
      );
      expect(rows[0]).toMatchObject({ profit: 4_200_000, profitBasis: 'kanonik' });
    });
  });
```
`server/src/reports/reports-expectation-history.service.spec.ts`:
```ts
import { ReportsExpectationHistoryService } from './reports-expectation-history.service';

describe('ReportsExpectationHistoryService — branch scope', () => {
  let prisma: any;
  let service: ReportsExpectationHistoryService;
  const row = (
    branchId: number | null,
    day: number,
    expectedValue: number | null,
    lessonsHeldValue: number | null,
    collectedForMonth: number | null,
  ) => ({
    branchId,
    date: new Date(Date.UTC(2026, 8, day)),
    expectedValue,
    lessonsHeldValue,
    collectedForMonth,
  });

  beforeEach(() => {
    prisma = {
      dailyFinancialSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      group: { findMany: jest.fn().mockResolvedValue([{ id: 'g-3a' }]) },
      enrollmentStateLog: { findMany: jest.fn().mockResolvedValue([]) },
      entityHistory: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new ReportsExpectationHistoryService(prisma);
  });

  const groupHistoryWhere = () =>
    prisma.entityHistory.findMany.mock.calls
      .map((c: any[]) => c[0].where)
      .find((w: any) => w.entityType === 'Group');

  it('sums the per-branch rows of a multi-branch scope, never the company row', async () => {
    prisma.dailyFinancialSnapshot.findMany.mockResolvedValue([
      row(3, 1, 10_000_000, 1_000_000, 800_000),
      row(7, 1, 5_000_000, 500_000, 200_000),
      row(3, 2, 10_500_000, 2_000_000, 1_000_000),
      row(7, 2, 5_000_000, null, 300_000),
      row(3, 3, 11_000_000, 3_000_000, 2_000_000), // branch 7 missing
    ]);

    const out = await service.getMonthlyHistory(1001, {
      month: '2026-09',
      branchIds: [3, 7],
    });

    expect(
      prisma.dailyFinancialSnapshot.findMany.mock.calls[0][0].where.branchId,
    ).toEqual({ in: [3, 7] });
    expect(out.points.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-02']);
    expect(out.points[0]).toMatchObject({
      expectedValue: 15_000_000,
      lessonsHeldValue: 1_500_000,
      collectedForMonth: 1_000_000,
      collectionPct: 67,
      delta: null,
    });
    expect(out.points[1]).toMatchObject({
      expectedValue: 15_500_000,
      lessonsHeldValue: null,
      collectionPct: null,
      delta: 500_000,
    });
  });

  it("counts only the scope's groups for enrolment and group-status events", async () => {
    await service.getMonthlyHistory(1001, { month: '2026-09', branchIds: [3, 7] });

    expect(prisma.group.findMany.mock.calls[0][0].where).toEqual({
      companyId: 1001,
      branchId: { in: [3, 7] },
    });
    expect(groupHistoryWhere().entityId).toEqual({ in: ['g-3a'] });
    expect(
      prisma.enrollmentStateLog.findMany.mock.calls[0][0].where.enrollment.group,
    ).toEqual({ companyId: 1001, branchId: { in: [3, 7] } });
  });

  it('a company-wide caller reads the company row and every group', async () => {
    await service.getMonthlyHistory(1001, { month: '2026-09', branchIds: null });

    expect(
      prisma.dailyFinancialSnapshot.findMany.mock.calls[0][0].where.branchId,
    ).toBeNull();
    expect(prisma.group.findMany).not.toHaveBeenCalled();
    expect(groupHistoryWhere()).not.toHaveProperty('entityId');
  });
});
```

- [ ] **Step 2: Run to verify fail.** Run `cd server && npx jest src/reports/net-profit-cache.spec.ts src/reports/reports-expectation-history.service.spec.ts src/reports/reports.service.spec.ts -t "cache key|branch scope|netProfitCacheKey|cachedNetProfit"`. Expected failures:
  - `net-profit-cache.spec.ts`: TS2554/TS2345, because the signature has not changed yet.
  - History spec: `where.branchId` is `null` where `{ in: [3, 7] }` is expected.
  - Trend test: `redis.get` is called with `'rpt:np:v2:1001:all:2026-08'`.

- [ ] **Step 3: Minimal implementation**

In `net-profit-cache.ts`, add `import type { ReportBranchIds } from '../common/finance/report-branch-scope';`, set `NET_PROFIT_CACHE_VERSION = 'v3'`, and add `v3: key names the exact branch set and the caller; v2 wrote multi-branch scopes to the company-wide entry.` to its comment. Then replace `netProfitCacheKey` and the head of `cachedNetProfit`:
```ts
export interface NetProfitCacheScope {
  companyId: number;
  branchIds: ReportBranchIds;
  performedById: number;
  monthKey: string;
}

/** `null` → all, `[]` → none, else the ids sorted and de-duplicated. */
export function netProfitScopeSegment(branchIds: ReportBranchIds): string {
  if (branchIds === null) return 'all';
  if (branchIds.length === 0) return 'none';
  return [...new Set(branchIds)].sort((a, b) => a - b).join(',');
}

/**
 * Per (company, branch set, caller, month). The exact set, so a multi-branch
 * scope never shares the company-wide entry. The caller, because the payroll
 * leg is resolved from the caller's own payroll scope (`resolveMonthlyScope`),
 * so two callers asking for the same branches can be owed different figures.
 */
export function netProfitCacheKey(s: NetProfitCacheScope): string {
  return `rpt:np:${NET_PROFIT_CACHE_VERSION}:${s.companyId}:${netProfitScopeSegment(s.branchIds)}:u${s.performedById}:${s.monthKey}`;
}

export async function cachedNetProfit(
  redis: RedisService | undefined,
  scope: NetProfitCacheScope,
  compute: () => Promise<number>,
): Promise<number> {
  const key = netProfitCacheKey(scope);
```
In `reports.service.ts:528-541`, delete the `// Cache key needs ONE id…` comment and `const cacheBranch = …`, then change the call to:
```ts
          const profit = await cachedNetProfit(
            this.redis,
            { companyId, branchIds, performedById, monthKey: row.monthKey },
            async () => {
```
Keep the `singleBranchId` import, because `assembleMonthlyNetProfit` still uses it.

In `reports-expectation-history.service.ts`, add `branchIdWhere` to the import and put this helper above the class:
```ts
type SnapshotDay = {
  date: Date;
  expectedValue: number | null;
  lessonsHeldValue: number | null;
  collectedForMonth: number | null;
};

/**
 * Per-branch rows → one row per day, summed (each lesson, group and payment
 * has one branch, so the figures add). A day is kept only when every branch
 * with rows this month has its row that day: the cron writes each branch
 * separately and one can fail, and a sum missing a branch would plot a drop
 * that never happened. Gaps stay gaps; a null in any branch nulls the sum.
 */
function sumBranchRowsPerDay(
  rows: (SnapshotDay & { branchId: number | null })[],
): SnapshotDay[] {
  const branchesThisMonth = new Set(rows.map((r) => r.branchId)).size;
  const byDay = new Map<string, SnapshotDay[]>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), r]);
  }
  const total = (list: SnapshotDay[], f: Exclude<keyof SnapshotDay, 'date'>) =>
    list.some((r) => r[f] == null)
      ? null
      : list.reduce((s, r) => s + (r[f] ?? 0), 0);
  const out: SnapshotDay[] = [];
  // Rows arrive date-ascending; a Map keeps insertion order. The unique
  // (companyId, branchId, date) makes list.length the branches present.
  for (const list of byDay.values()) {
    if (list.length < branchesThisMonth) continue;
    out.push({
      date: list[0].date,
      expectedValue: total(list, 'expectedValue'),
      lessonsHeldValue: total(list, 'lessonsHeldValue'),
      collectedForMonth: total(list, 'collectedForMonth'),
    });
  }
  return out;
}
```
Changes in `getMonthlyHistory`:
- Delete the "falls back to the company-wide series" comment and `const branchId = singleBranchId(...)`.
- Compute `const start = new Date(Date.UTC(y, m - 1, 1)); const endExcl = new Date(Date.UTC(y, m, 1));`.
- Replace the query and the event load with:
```ts
    // `null` = the company-wide row. A branch list reads each branch's OWN
    // rows and sums them — the company row would show every branch (ADR-0002).
    const rows = await this.prisma.dailyFinancialSnapshot.findMany({
      where: {
        companyId,
        ...(branchIds === null ? { branchId: null } : branchIdWhere(branchIds)),
        // `date` is `@db.Date` — unshifted UTC bounds, upper exclusive.
        date: { gte: start, lt: endExcl },
      },
      orderBy: { date: 'asc' },
      select: {
        branchId: true,
        date: true,
        expectedValue: true,
        lessonsHeldValue: true,
        collectedForMonth: true,
      },
    });
    const days = branchIds === null ? rows : sumBranchRowsPerDay(rows);

    const eventsByDay = await this.loadEvents(companyId, branchIds, start, endExcl);
```
- Map `days` (not `rows`) into points. Nothing else in the mapping changes.
- Return `{ month, branchId: singleBranchId(branchIds) ?? null, points }`.

Changes in `loadEvents`:
- Change the parameter to `branchIds: ReportBranchIds` and replace `groupWhere` with:
```ts
    const groupWhere = { companyId, ...branchIdWhere(branchIds) };
    // EntityHistory has no branch column: a group's status change is matched
    // through the ids of the groups in scope. Deleted groups stay in — their
    // status change still happened.
    const groupIdFilter =
      branchIds === null
        ? {}
        : {
            entityId: {
              in: (
                await this.prisma.group.findMany({
                  where: groupWhere,
                  select: { id: true },
                })
              ).map((g) => g.id),
            },
          };
```
- Add `...groupIdFilter,` to the `entityType: 'Group'` `where`.

- [ ] **Step 4: Run to verify pass.** Run `cd server && npx jest src/reports/net-profit-cache.spec.ts src/reports/reports-expectation-history.service.spec.ts src/reports/reports.service.spec.ts src/dashboard/dashboard-charts.service.spec.ts`. Expected: PASS.

- [ ] **Step 5: Client change.** None: the response shape is unchanged.

- [ ] **Step 6: Typecheck and lint.** Run `cd server && npx tsc -p tsconfig.check.json --noEmit && npx eslint src/reports/net-profit-cache.ts src/reports/net-profit-cache.spec.ts src/reports/reports.service.ts src/reports/reports.service.spec.ts src/reports/reports-expectation-history.service.ts src/reports/reports-expectation-history.service.spec.ts`

- [ ] **Step 7: Commit**
```
git commit -m "fix(reports): key net-profit cache and expectation history by the exact branch set

The net-profit day cache key now encodes the sorted branch set and the
caller (version bumped to v3). The expectation history reads and sums the
per-branch snapshot rows for a branch list, and filters group-status and
enrolment events to the groups in scope.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification and pull request

**Files:** none new.

- [ ] **Step 1: Server — full suite, typecheck, lint, build**
```bash
cd server && npx jest --runInBand 2>&1 | tail -15
cd server && npm run typecheck && npx eslint src/payments src/billing src/students src/transactions src/reports src/common/auth/operational-branch-scope.spec.ts && npm run build
```
Expected: all suites pass; 0 type errors; 0 lint errors; build OK. A suite that fails only in the parallel run must pass alone before it counts as green.

- [ ] **Step 2: Client — tests, typecheck, lint, build**
```bash
cd client && npm test && npx tsc --noEmit && npx eslint src/components/payments src/components/shared/change-status-dialog.tsx src/lib/freeze-refund-preview.ts src/components/reports/payment-reports && npm run build
```
Expected: all green, `next build` OK.

- [ ] **Step 3: Grep guard — no pack wording left on the monthly paths**
```bash
cd client && grep -n "sikl" src/components/payments/record-payment-quick-amounts.ts
```
Expected: matches only inside `lessonPackQuickAmounts` / the LESSON_PACK hint.

- [ ] **Step 4: Push and open the PR (English title/body, no production data)**
```bash
git push -u origin fix/monthly-money-safety
gh pr create --title "Monthly billing: payment dialog, freeze refund, write-off list and report branch scope" --body "$(cat <<'BODY'
## Summary
- Payment preview and record-payment dialog understand monthly courses: debt, next month, 1/2 months — no "12 dars sikl" for monthly students.
- Freeze dialog: monthly enrollments show the automatic month release read-only; a typed lesson count for a monthly enrollment is rejected server-side. The preview and the write share one pure helper.
- Debt write-offs: undo counter-rows are no longer listed or summed (list and overview card); undoing an undo returns a 400.
- Reports: payment-report branch breakdown and refunds follow the caller's branch scope; multi-branch directors get their branches instead of an endless loader; net-profit cache key and expectation history use the exact branch set.

Spec: docs/superpowers/specs/2026-09-27-oylik-tizim-moliya-tuzatishlari-design.md (A1).
Plan: docs/superpowers/plans/2026-09-27-oylik-tuzatish-a1-pul-xavfsizligi.md

## Test plan
- [ ] server jest (runInBand), typecheck, lint, build
- [ ] client vitest, tsc, eslint, next build
- [ ] deploy order: server, then client

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```
Do not merge or deploy; report the PR link.
