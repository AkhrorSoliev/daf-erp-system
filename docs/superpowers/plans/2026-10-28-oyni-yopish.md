# Oyni yopish (bank xarajati + ijtimoiy soliq) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bank fee is entered once a month per bank account as a real expense, and the employer social tax is 12% of the salary paid from bank accounts — replacing the bank tiers and `User.officialSalary` of ADR-0130.

**Architecture:** New expense category `BANK_FEES` with `Expense.cashAccountId`, written only by a new `month-close` module (`GET/PUT /month-close/:month…`) through `ExpensesService`. `TaxCostsService.forMonth` drops bank tiers and official salary; it reads the bank-paid salary base from `CashMovement` (BANK accounts, SALARY_PAYMENT transactions of the month's `SalaryPayment`s) plus bank-paid advances settled into them, and flags `bank.feesEntered` when a past month has a bank account without a fee row. Client: new page `/reports/oyni-yopish`, a bank line in the «Berildi» dialog, removal of the official-salary field and the bank-tiers section.

**Tech Stack:** NestJS + Prisma (PostgreSQL), Jest; Next.js + react-query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-28-oyni-yopish-bank-va-ijtimoiy-soliq-design.md`

## Global Constraints

- Screens: Uzbek Latin only, no English words. Every new screen text in en/ru/de dictionaries; new client files go into `STRICT_FILES` (`client/src/i18n/i18n-coverage.test.ts`).
- Code comments, ADR, spec prose: Uzbek. Commit and PR text: English. Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Server: run `npx prettier --write` on every touched `.ts`. Client: **never** run prettier.
- Server tests: `cd server && npx jest <path>`. Client tests: `cd client && npx vitest run <path>`. Typecheck server: `cd server && npm run build`; client: `cd client && npx tsc --noEmit -p .`.
- Prisma: after schema edits, write the migration SQL by hand under `server/prisma/migrations/<ts>_<name>/migration.sql` (see `CLAUDE.local.md` «Prisma Migration Commands») and run `npx prisma generate` in `server/`.
- Tashkent time only through `server/src/common/date/tashkent.ts`. `@db.Date` bounds via `utcMidnightFromDateStr`; timestamp bounds via `tashkentMonthRangeUtc`. Upper bounds exclusive (`lt`).
- Rates (12% / 12%) come from `payroll.employeeWithholdingPercent` / `payroll.employerSocialPercent` (month-dated). Never hard-code.
- Social-tax base: only `CashAccountType.BANK`. `CASH` and `CARD` accounts are not taxed.
- Month for social tax = `SalaryPayment.periodStart` inside the month (Tashkent), same rule as `payoutOf` in `salary-monthly-detail.service.ts`.
- A bank fee of 0 is a real entry: the row stays with amount 0 (no cash movement). «Kiritilmagan» = no live `BANK_FEES` row for that account and month.
- Bank fee only for a month that has ended (`month < tashkentMonthKey(now)`), else 400 `Joriy oy hali tugamagan — bank xarajati oy tugagach kiritiladi`.
- Write access to `BANK_FEES` = capability `settings.tax` (page, PUT, and edits on the expenses page).

## File Structure

Server
- `server/prisma/schema.prisma` — `ExpenseCategory.BANK_FEES`, `Expense.cashAccountId` (+ relation on `CashAccount`), later drop `User.officialSalary`.
- `server/src/tax/bank-fee.ts` (new) — `bankFeeDate(month)`, `bankFeeWindow(month)`; pure.
- `server/src/transactions/transactions-write.service.ts` — `recordExpense` takes `cashAccountId`.
- `server/src/expenses/expenses.service.ts` — `BANK_FEES` rules; `create(dto, userId, companyId, opts?)`.
- `server/src/expenses/expenses-month.ts` — `BANK_FEES` in `PAGE_CATEGORIES`.
- `server/src/tax/tax-costs.ts`, `tax-costs.service.ts`, `tax-rates.ts`, `tax-settings.service.ts`, `settings/settings.types.ts` — new base, bank tiers removed.
- `server/src/reports/reports.service.ts`, `reports-excel.workbook-input.ts`, `reports-excel.sheets.ts`, `reports-profit-composition.service.ts`, `reports/net-profit-cache.ts`, `scripts/build-report-services.ts` — callers.
- `server/src/month-close/` (new) — `month-close.module.ts`, `month-close.controller.ts`, `month-close.service.ts`, `dto/save-bank-fees.dto.ts`, specs.
- `server/src/salary/salary-monthly-detail.service.ts` — `bankTax` rates instead of `official`.
- `server/src/users/*`, `server/src/common/entity-history/diff.util.ts` — `officialSalary` removed.
- `server/src/common/permissions/route-access.snapshot.json` — two rows.

Client
- `client/src/components/payments/salary/salary-pay-model.ts`, `salary-pay-dialog.tsx`, `salary-types.ts` — bank line.
- `client/src/components/settings/edit-employee-form.tsx`, `client/src/hooks/use-edit-employee.ts`, `client/src/lib/schemas/employee-schema.ts` (+ test) — field removed.
- `client/src/components/settings/tax-settings-client.tsx`, delete `tax-bank-tiers.tsx`, trim `tax-settings-draft.ts`.
- `client/src/components/payments/overview/overview-math.ts`, `types.ts` — `bankFees` removed.
- `client/src/components/payments/expenses/expenses-labels.ts` (+ test), expense form dialog — `BANK_FEES` shown, not creatable.
- `client/src/components/reports/month-close/` (new) — `month-close-page.tsx`, `month-close-model.ts` (+ test), `month-close-queries.ts`, `month-close-types.ts`.
- `client/src/app/(dashboard)/reports/oyni-yopish/page.tsx` (new), `client/src/lib/reports-nav.ts`, `client/src/lib/breadcrumb-routes.ts`, dictionaries.

Docs
- `docs/adr/0139-oyni-yopish-bank-va-ijtimoiy-soliq.md`, `docs/adr/README.md`, ADR-0130 status line, `server/CLAUDE.md`, `client/CLAUDE.md`, spec fix (0 = entry), user guide page + `yangiliklar.ts`.

---

### Task 1: `BANK_FEES` expense on a named bank account

**Files:**
- Modify: `server/prisma/schema.prisma` (enum `ExpenseCategory` ~line 326, `model Expense` ~3379, `model CashAccount` ~3397)
- Create: `server/prisma/migrations/20261028100000_expense_bank_fees/migration.sql`
- Create: `server/src/tax/bank-fee.ts`, `server/src/tax/bank-fee.spec.ts`
- Modify: `server/src/transactions/transactions-write.service.ts:943-990` (`recordExpense`)
- Modify: `server/src/expenses/expenses.service.ts` (labels line 41, `assertMayWrite` 98, `create` 246, `update` 629, `remove` 803)
- Modify: `server/src/expenses/expenses-month.ts:25-34`
- Test: `server/src/expenses/expenses.service.spec.ts`

**Interfaces:**
- Produces: `ExpenseCategory.BANK_FEES`; `Expense.cashAccountId: string | null`; `bankFeeDate(month: string): string` (`'YYYY-MM-DD'`, last day), `bankFeeWindow(month: string): { gte: Date; lt: Date }` (for `@db.Date`); `ExpensesService.create(dto, userId, companyId, opts?: { cashAccountId?: string })`; `BANK_FEE_LABEL = 'Bank xizmati'`.

- [ ] **Step 1: Schema + migration**

In `schema.prisma`: add `BANK_FEES` after `TAXES` in `enum ExpenseCategory`. In `model Expense` after `leadSourceId` block:

```prisma
  // «Bank xizmati» (spec 2026-10-28): bank yechgan hisob. Faqat BANK_FEES yozadi.
  cashAccountId String?
  cashAccount   CashAccount? @relation(fields: [cashAccountId], references: [id])
```

and `@@index([cashAccountId])` beside the other indexes. In `model CashAccount` add `expenses Expense[]`.

`migration.sql`:

```sql
ALTER TYPE "ExpenseCategory" ADD VALUE IF NOT EXISTS 'BANK_FEES';
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "Expense_cashAccountId_idx" ON "Expense"("cashAccountId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_cashAccountId_fkey"
  FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Run: `cd server && npx prisma generate` — expected: success.

- [ ] **Step 2: Failing test for `bank-fee.ts`**

```ts
import { bankFeeDate, bankFeeWindow } from './bank-fee';

describe('bank-fee', () => {
  it('the fee is dated the last day of the month', () => {
    expect(bankFeeDate('2026-10')).toBe('2026-10-31');
    expect(bankFeeDate('2026-02')).toBe('2026-02-28');
    expect(bankFeeDate('2028-02')).toBe('2028-02-29');
  });
  it('the window is the whole month as @db.Date bounds', () => {
    expect(bankFeeWindow('2026-12')).toEqual({
      gte: new Date('2026-12-01T00:00:00.000Z'),
      lt: new Date('2027-01-01T00:00:00.000Z'),
    });
  });
});
```

Run: `cd server && npx jest src/tax/bank-fee.spec.ts` — expected FAIL (module not found).

- [ ] **Step 3: Implement `bank-fee.ts`**

```ts
import {
  addMonthsToMonthKey,
  utcMidnightFromDateStr,
} from '../common/date/tashkent';

export const BANK_FEE_LABEL = 'Bank xizmati';

/** Bank xarajati oyning oxirgi kuni bilan yoziladi (spec 2026-10-28 §3). */
export function bankFeeDate(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** `Expense.date` (`@db.Date`) uchun oy chegarasi, yuqorisi `lt`. */
export function bankFeeWindow(month: string): { gte: Date; lt: Date } {
  return {
    gte: utcMidnightFromDateStr(`${month}-01`),
    lt: utcMidnightFromDateStr(`${addMonthsToMonthKey(month, 1)}-01`),
  };
}
```

Run the test — expected PASS.

- [ ] **Step 4: `recordExpense` takes the account**

In `recordExpense` params add `cashAccountId?: string;` and pass it to `recordOutflow` as `cashAccountId: params.cashAccountId,` (next to `preferType`). `recordOutflow` already skips `amount <= 0`, so a 0 fee writes the ledger row and no movement.

- [ ] **Step 5: Failing tests in `expenses.service.spec.ts`**

Follow the file's existing mock setup (read its top `beforeEach` first). Add a `describe('BANK_FEES')` with:

```ts
it('create refuses BANK_FEES without an account (expenses page)', async () => {
  await expect(
    service.create({ ...baseDto, category: 'BANK_FEES' } as any, CEO_ID, COMPANY_ID),
  ).rejects.toThrow("Bank xizmati «Oyni yopish» sahifasida kiritiladi");
});

it('create with an account writes cashAccountId and passes it to the ledger', async () => {
  await service.create(
    { ...baseDto, category: 'BANK_FEES', paymentMethod: 'CARD' } as any,
    CEO_ID, COMPANY_ID, { cashAccountId: 'acc-1' },
  );
  expect(prisma.expense.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ cashAccountId: 'acc-1' }) }),
  );
  expect(transactions.recordExpense).toHaveBeenCalledWith(
    expect.objectContaining({ cashAccountId: 'acc-1' }), expect.anything(),
  );
});

it('BANK_FEES needs settings.tax, not expenses.manage', async () => {
  permissions.has.mockImplementation(async (_u, key) => key === 'expenses.manage');
  await expect(
    service.create({ ...baseDto, category: 'BANK_FEES' } as any, ADMIN_ID, COMPANY_ID, { cashAccountId: 'acc-1' }),
  ).rejects.toThrow("Bu xarajatni kiritish huquqingiz yo'q");
});

it('update refuses moving a row into or out of BANK_FEES, or changing its branch or method', async () => {
  prisma.expense.findFirst.mockResolvedValue({ ...existingRow, category: 'BANK_FEES', cashAccountId: 'acc-1' });
  for (const patch of [{ category: 'OTHER' }, { branchId: 2 }, { paymentMethod: 'CASH' }]) {
    await expect(service.update('e1', patch as any, CEO_ID, COMPANY_ID)).rejects.toThrow(
      "Bank xizmatining turkumi, filiali, sanasi va to'lov turi o'zgarmaydi",
    );
  }
  prisma.expense.findFirst.mockResolvedValue({ ...existingRow, category: 'OTHER' });
  await expect(service.update('e1', { category: 'BANK_FEES' } as any, CEO_ID, COMPANY_ID)).rejects.toThrow(
    "Bank xizmati «Oyni yopish» sahifasida kiritiladi",
  );
});

it('an amount edit re-posts the ledger on the same account', async () => {
  prisma.expense.findFirst.mockResolvedValue({ ...existingRow, category: 'BANK_FEES', cashAccountId: 'acc-1', amount: 100 });
  prisma.expense.update.mockResolvedValue({ ...existingRow, category: 'BANK_FEES', cashAccountId: 'acc-1', amount: 250 });
  await service.update('e1', { amount: 250 } as any, CEO_ID, COMPANY_ID);
  expect(transactions.recordExpense).toHaveBeenCalledWith(
    expect.objectContaining({ amount: 250, cashAccountId: 'acc-1' }), expect.anything(),
  );
});
```

(`baseDto`, `existingRow`, `CEO_ID`, `ADMIN_ID`, `COMPANY_ID`, mocks: reuse or add the spec's own fixtures — names above are placeholders for whatever the file already uses; keep the assertions.)

Run: `cd server && npx jest src/expenses/expenses.service.spec.ts -t BANK_FEES` — expected FAIL.

- [ ] **Step 6: Implement the rules in `ExpensesService`**

```ts
// CATEGORY_LABELS
  BANK_FEES: BANK_FEE_LABEL,

const BANK_FEE_ELSEWHERE = "Bank xizmati «Oyni yopish» sahifasida kiritiladi";
const BANK_FEE_FROZEN = "Bank xizmatining turkumi, filiali, sanasi va to'lov turi o'zgarmaydi";
```

`assertMayWrite`:

```ts
const key: PermissionKey =
  category === ExpenseCategory.TEACHER_ADVANCE
    ? 'salary.pay'
    : category === ExpenseCategory.BANK_FEES
      ? 'settings.tax'
      : 'expenses.manage';
```

`create(dto, userId, companyId, opts: { cashAccountId?: string } = {})`: right after `assertMayWrite`:

```ts
if ((dto.category === ExpenseCategory.BANK_FEES) !== !!opts.cashAccountId) {
  throw new BadRequestException(BANK_FEE_ELSEWHERE);
}
```

and in `tx.expense.create` data add `cashAccountId: opts.cashAccountId ?? null,`; in `recordExpense` add `cashAccountId: opts.cashAccountId,`.

`update`: after the second `assertMayWrite`:

```ts
if (existing.category === ExpenseCategory.BANK_FEES) {
  if (
    (dto.category !== undefined && dto.category !== existing.category) ||
    (dto.branchId != null && dto.branchId !== existing.branchId) ||
    (dto.paymentMethod !== undefined && dto.paymentMethod !== existing.paymentMethod)
  )
    throw new BadRequestException(BANK_FEE_FROZEN);
} else if (dto.category === ExpenseCategory.BANK_FEES) {
  throw new BadRequestException(BANK_FEE_ELSEWHERE);
}
```

and in its `recordExpense` call add `cashAccountId: updated.cashAccountId ?? undefined,`. `remove` needs nothing (the reversal unwinds the movement by transaction id).

`expenses-month.ts`: add `'BANK_FEES'` after `'TAXES'` in `PAGE_CATEGORIES`.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd server && npx jest src/expenses src/tax/bank-fee.spec.ts src/transactions` — expected PASS.
Run: `cd server && npm run build` — expected PASS. Any other `Record<ExpenseCategory, …>` the build flags (e.g. `reports-profit-loss.service.ts`, `reports-marketing.service.ts`) gets `BANK_FEES: 'Bank xizmati'` / the file's own pattern.

- [ ] **Step 8: Prettier + commit**

```bash
cd server && npx prettier --write src/tax/bank-fee.ts src/tax/bank-fee.spec.ts src/transactions/transactions-write.service.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts src/expenses/expenses-month.ts
cd .. && git add server/prisma server/src && git commit -m "feat(expenses): BANK_FEES category booked on a named bank account

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tax costs — bank-paid salary base, no tiers, no official salary

**Files:**
- Modify: `server/src/tax/tax-costs.ts` (whole file, 178 lines), `server/src/tax/tax-costs.service.ts` (117 lines), `server/src/tax/tax-rates.ts` (remove tier code), `server/src/tax/tax-settings.service.ts`, `server/src/settings/settings.types.ts` (`'bank.turnoverTiers'` at lines ~69, ~110, ~557)
- Modify: `server/src/reports/reports.service.ts:230-240`, `server/src/reports/reports-excel.workbook-input.ts:100-150`, `server/src/reports/reports-excel.sheets.ts` (any `bankFees`), `server/src/reports/reports-profit-composition.service.ts` (any `bankFees`), `server/src/reports/net-profit-cache.ts` (version), `server/scripts/build-report-services.ts` (if it passes salaries)
- Test: `server/src/tax/tax-costs.spec.ts`, `server/src/tax/tax-costs.service.spec.ts`, `server/src/tax/tax-rates.spec.ts`, `server/src/tax/tax-settings.service.spec.ts`

**Interfaces:**
- Consumes: `bankFeeWindow` (Task 1), `ExpenseCategory.BANK_FEES`, `Expense.cashAccountId`.
- Produces:
  ```ts
  export const BANK_FEES_ENTERED_KEY = 'bank.feesEntered' as const;
  export type TaxMissingKey = TaxRateKey | typeof BANK_FEES_ENTERED_KEY;
  export interface TaxCosts {
    providerFees: number; employerSocialTax: number; turnoverTax: number;
    withholding: number; bankPaidSalary: number; turnover: number;
    total: number; missingRates: TaxMissingKey[];
  }
  export function computePayrollTax(input: { bankPaidSalary: number; month: string; rates: Record<TaxRateKey, DatedRate[]> }):
    { employerSocialTax: number; withholding: number; missing: TaxRateKey[] };
  TaxCostsService.forMonth(companyId: number, month: string, branchIds: ReportBranchIds): Promise<TaxCosts>;
  TaxSettingsService.loadRates(companyId): Promise<{ rates: Record<TaxRateKey, DatedRate[]> }>;
  ```
  `TaxRateBook` becomes `{ rates: Record<TaxRateKey, DatedRate[]> }`; `TaxSettingKey`, `BANK_TIERS_KEY`, `DatedTiers`, `BankTier`, `parseDatedTiers`, `tiersForMonth`, `tierPercentFor`, `officialSplit`, `payrollRowsOf`, `PayrollRow` are deleted (`TAX_SETTING_KEYS` = `TAX_RATE_KEYS`).

- [ ] **Step 1: Failing pure tests (`tax-costs.spec.ts`)**

Replace the bank-tier and official-salary cases with:

```ts
const rates = (over: Partial<Record<TaxRateKey, DatedRate[]>> = {}) =>
  ({ ...Object.fromEntries(TAX_RATE_KEYS.map((k) => [k, []])), ...over }) as Record<TaxRateKey, DatedRate[]>;

describe('computePayrollTax', () => {
  it('12% + 12% of the bank-paid salary', () => {
    const r = computePayrollTax({
      bankPaidSalary: 2_000_000,
      month: '2026-10',
      rates: rates({
        'payroll.employeeWithholdingPercent': [{ fromMonth: '2026-10', value: 12 }],
        'payroll.employerSocialPercent': [{ fromMonth: '2026-10', value: 12 }],
      }),
    });
    expect(r).toEqual({ employerSocialTax: 240_000, withholding: 240_000, missing: [] });
  });
  it('no bank-paid salary: nothing, and no missing rate', () => {
    expect(computePayrollTax({ bankPaidSalary: 0, month: '2026-10', rates: rates() }))
      .toEqual({ employerSocialTax: 0, withholding: 0, missing: [] });
  });
  it('bank-paid salary without rates: 0 and both keys missing', () => {
    expect(computePayrollTax({ bankPaidSalary: 1_000, month: '2026-10', rates: rates() }).missing)
      .toEqual(['payroll.employeeWithholdingPercent', 'payroll.employerSocialPercent']);
  });
});
```

and in `computePaymentCosts` cases drop every `bankFees` / tier expectation (the function no longer takes `companyTurnover` or tiers; it returns `{ providerFees, turnoverTax, turnover, missing }`).

Run: `cd server && npx jest src/tax/tax-costs.spec.ts` — expected FAIL.

- [ ] **Step 2: Rewrite `tax-costs.ts`**

```ts
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { channelRateKey, feeChannelOf } from './fee-channel';
import { DatedRate, rateForMonth, TaxRateKey } from './tax-rates';

/** O'tgan oyda bank hisobiga bank xarajati kiritilmagan (spec 2026-10-28 §5). */
export const BANK_FEES_ENTERED_KEY = 'bank.feesEntered' as const;
export type TaxMissingKey = TaxRateKey | typeof BANK_FEES_ENTERED_KEY;

/**
 * Sof foydadan ayriladigan soliq va komissiyalar (spec 2026-10-25, 2026-10-28).
 * `withholding` va `bankPaidSalary` faqat ma'lumot. Bank xizmati bu yerda yo'q:
 * u oddiy xarajat (`BANK_FEES`), `operatingExpenses` ichida.
 */
export interface TaxCosts {
  providerFees: number;
  employerSocialTax: number;
  turnoverTax: number;
  withholding: number;
  bankPaidSalary: number;
  turnover: number;
  total: number;
  missingRates: TaxMissingKey[];
}

export function emptyTaxCosts(): TaxCosts {
  return {
    providerFees: 0,
    employerSocialTax: 0,
    turnoverTax: 0,
    withholding: 0,
    bankPaidSalary: 0,
    turnover: 0,
    total: 0,
    missingRates: [],
  };
}

export function sumTaxCosts(list: TaxCosts[]): TaxCosts {
  const out = emptyTaxCosts();
  const missing = new Set<TaxMissingKey>();
  for (const t of list) {
    out.providerFees += t.providerFees;
    out.employerSocialTax += t.employerSocialTax;
    out.turnoverTax += t.turnoverTax;
    out.withholding += t.withholding;
    out.bankPaidSalary += t.bankPaidSalary;
    out.turnover += t.turnover;
    out.total += t.total;
    t.missingRates.forEach((k) => missing.add(k));
  }
  out.missingRates = [...missing];
  return out;
}

const pct = (amount: number, percent: number) =>
  Math.round((amount * percent) / 100);

export type PaymentGroup = {
  branchId: number | null;
  method: PaymentMethod;
  source: PaymentSource;
  amount: number;
  storedFee: number | null;
};

export function computePaymentCosts(input: {
  groups: PaymentGroup[];
  month: string;
  rates: Record<TaxRateKey, DatedRate[]>;
}) {
  const { groups, month, rates } = input;
  const missing = new Set<TaxRateKey>();
  let providerFees = 0;
  let turnover = 0;
  for (const g of groups) {
    if (g.method !== PaymentMethod.CASH) turnover += g.amount;
    if (g.storedFee !== null) {
      providerFees += g.storedFee;
      continue;
    }
    const channel = feeChannelOf(g.method, g.source);
    if (!channel || g.amount === 0) continue;
    const key = channelRateKey(channel);
    const rate = rateForMonth(rates[key], month);
    if (rate === null) missing.add(key);
    else providerFees += pct(g.amount, rate);
  }
  let turnoverTax = 0;
  if (turnover > 0) {
    const taxRate = rateForMonth(rates['tax.turnoverPercent'], month);
    if (taxRate === null) missing.add('tax.turnoverPercent');
    else turnoverTax = pct(turnover, taxRate);
  }
  return { providerFees, turnoverTax, turnover, missing: [...missing] };
}

/** Bankdan berilgan oylikdan: korxona solig'i (xarajat) va ushlanma (ma'lumot). */
export function computePayrollTax(input: {
  bankPaidSalary: number;
  month: string;
  rates: Record<TaxRateKey, DatedRate[]>;
}) {
  const { bankPaidSalary, month, rates } = input;
  if (bankPaidSalary <= 0)
    return { employerSocialTax: 0, withholding: 0, missing: [] as TaxRateKey[] };
  const w = rateForMonth(rates['payroll.employeeWithholdingPercent'], month);
  const s = rateForMonth(rates['payroll.employerSocialPercent'], month);
  const missing: TaxRateKey[] = [];
  if (w === null) missing.push('payroll.employeeWithholdingPercent');
  if (s === null) missing.push('payroll.employerSocialPercent');
  return {
    employerSocialTax: s === null ? 0 : pct(bankPaidSalary, s),
    withholding: w === null ? 0 : pct(bankPaidSalary, w),
    missing,
  };
}
```

In `tax-rates.ts` delete `BANK_TIERS_KEY`, `TaxSettingKey`, `BankTier`, `DatedTiers`, `isWholeSom`, `parseTiers`, `parseDatedTiers`, `tiersForMonth`, `tierPercentFor`; set `export const TAX_SETTING_KEYS: readonly TaxRateKey[] = TAX_RATE_KEYS;`. Remove the matching cases from `tax-rates.spec.ts`. In `settings.types.ts` remove the three `'bank.turnoverTiers'` entries (the old DB row is then never read). In `tax-settings.service.ts` drop `bankTiers` from `TaxRateBook`, `loadRates`, `read`, and type `values` as `Record<TaxRateKey, DatedRate[]>`; update `tax-settings.service.spec.ts` expectations (`total` becomes 8).

Run: `cd server && npx jest src/tax/tax-costs.spec.ts src/tax/tax-rates.spec.ts src/tax/tax-settings.service.spec.ts` — expected PASS.

- [ ] **Step 3: Failing service tests (`tax-costs.service.spec.ts`)**

Rewrite the mock to `prisma.payment.groupBy`, `payment.aggregate` (can go — no company turnover any more), `transaction.findMany`, `cashMovement.aggregate`, `expense.aggregate`, `cashAccount.findMany`, `expense.findMany`. Cases:

```ts
it('social tax base = BANK outflows of the month salary payments + bank-paid advances settled into them', async () => {
  prisma.transaction.findMany.mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
  prisma.cashMovement.aggregate.mockResolvedValue({ _sum: { amount: -1_500_000 } });
  prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: 500_000 } });
  const r = await service.forMonth(1, '2026-09', null);
  expect(r.bankPaidSalary).toBe(2_000_000);
  expect(r.employerSocialTax).toBe(240_000);
  expect(r.withholding).toBe(240_000);
  expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      companyId: 1, type: 'SALARY_PAYMENT', reversedAt: null, reversedTransactionId: null,
      salaryPayment: { periodStart: tashkentMonthRangeUtc('2026-09') },
    }),
  }));
  expect(prisma.cashMovement.aggregate).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      transactionId: { in: ['t1', 't2'] }, type: 'OUTFLOW', reversedAt: null,
      cashAccount: { type: 'BANK' },
    }),
  }));
  expect(prisma.expense.aggregate).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      category: 'TEACHER_ADVANCE', paymentMethod: 'CARD', deletedAt: null,
      settledBySalaryPayment: { periodStart: tashkentMonthRangeUtc('2026-09') },
    }),
  }));
});

it('no salary transactions: no movement query, base 0', async () => {
  prisma.transaction.findMany.mockResolvedValue([]);
  prisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
  const r = await service.forMonth(1, '2026-09', null);
  expect(prisma.cashMovement.aggregate).not.toHaveBeenCalled();
  expect(r.bankPaidSalary).toBe(0);
});

it('a past month with a bank account and no fee row is flagged bank.feesEntered', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
  prisma.expense.findMany.mockResolvedValue([{ cashAccountId: 'a1' }]);
  const r = await service.forMonth(1, '2026-09', null);
  expect(r.missingRates).toContain('bank.feesEntered');
});

it('every account entered (0 counts) — not flagged', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
  prisma.expense.findMany.mockResolvedValue([{ cashAccountId: 'a1' }]);
  expect((await service.forMonth(1, '2026-09', null)).missingRates).not.toContain('bank.feesEntered');
});

it('the current month is never flagged', async () => {
  const now = tashkentMonthKey(new Date());
  prisma.cashAccount.findMany.mockResolvedValue([{ id: 'a1' }]);
  prisma.expense.findMany.mockResolvedValue([]);
  expect((await service.forMonth(1, now, null)).missingRates).not.toContain('bank.feesEntered');
  expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
});

it('an empty scope reads nothing', async () => {
  expect(await service.forMonth(1, '2026-09', [])).toEqual(emptyTaxCosts());
  expect(prisma.transaction.findMany).not.toHaveBeenCalled();
});
```

Default mocks in `beforeEach`: rates 12/12 from `2026-01`, everything else empty (`[]`, `{ _sum: { amount: null } }`). Keep the existing provider-fee cases, minus `bankFees`.

Run: `cd server && npx jest src/tax/tax-costs.service.spec.ts` — expected FAIL.

- [ ] **Step 4: Rewrite `TaxCostsService`**

```ts
import { Injectable } from '@nestjs/common';
import {
  CashAccountType,
  CashMovementType,
  ExpenseCategory,
  ExpensePaymentMethod,
  PaymentStatus,
  TransactionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentMonthKey, tashkentMonthRangeUtc } from '../common/date/tashkent';
import { branchIdWhere, ReportBranchIds } from '../common/finance/report-branch-scope';
import { TaxSettingsService } from './tax-settings.service';
import { bankFeeWindow } from './bank-fee';
import {
  BANK_FEES_ENTERED_KEY,
  computePaymentCosts,
  computePayrollTax,
  emptyTaxCosts,
  PaymentGroup,
  TaxCosts,
  TaxMissingKey,
} from './tax-costs';

@Injectable()
export class TaxCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tax: TaxSettingsService,
  ) {}

  /**
   * Bir oyning soliq va komissiyalari, doira bo'yicha. Komissiya va aylanma —
   * pul tushgan oy (`Payment.createdAt`); ijtimoiy soliq — oylik tegishli oy
   * (`SalaryPayment.periodStart`). Bo'sh doira (`[]`) = nol, so'rovsiz.
   */
  async forMonth(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<TaxCosts> {
    if (branchIds !== null && branchIds.length === 0) return emptyTaxCosts();

    const scoped = {
      companyId,
      status: PaymentStatus.COMPLETED,
      createdAt: tashkentMonthRangeUtc(month),
      ...branchIdWhere(branchIds),
    };
    const [noFee, withFee, bankPaidSalary, feesMissing, { rates }] =
      await Promise.all([
        this.prisma.payment.groupBy({
          by: ['branchId', 'method', 'source'],
          where: { ...scoped, providerFee: null },
          _sum: { amount: true },
        }),
        this.prisma.payment.groupBy({
          by: ['branchId', 'method', 'source'],
          where: { ...scoped, providerFee: { not: null } },
          _sum: { amount: true, providerFee: true },
        }),
        this.bankPaidSalary(companyId, month, branchIds),
        this.bankFeesMissing(companyId, month, branchIds),
        this.tax.loadRates(companyId),
      ]);

    const groups: PaymentGroup[] = [
      ...noFee.map((g) => ({
        branchId: g.branchId,
        method: g.method,
        source: g.source,
        amount: g._sum.amount ?? 0,
        storedFee: null,
      })),
      ...withFee.map((g) => ({
        branchId: g.branchId,
        method: g.method,
        source: g.source,
        amount: g._sum.amount ?? 0,
        storedFee: g._sum.providerFee ?? 0,
      })),
    ];
    const pay = computePaymentCosts({ groups, month, rates });
    const roll = computePayrollTax({ bankPaidSalary, month, rates });
    const missingRates: TaxMissingKey[] = [...pay.missing, ...roll.missing];
    if (feesMissing) missingRates.push(BANK_FEES_ENTERED_KEY);
    return {
      providerFees: pay.providerFees,
      turnoverTax: pay.turnoverTax,
      employerSocialTax: roll.employerSocialTax,
      withholding: roll.withholding,
      bankPaidSalary,
      turnover: pay.turnover,
      total: pay.providerFees + pay.turnoverTax + roll.employerSocialTax,
      missingRates,
    };
  }

  /**
   * Oy M oyligining bank hisoblaridan chiqqan qismi (spec 2026-10-28 §4):
   * shu oy `SalaryPayment`larining BANK hisobidagi chiqimlari + shu
   * to'lovlarga ushlangan, bankdan (`CARD` → BANK) berilgan avanslar.
   */
  async bankPaidSalary(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<number> {
    const periodStart = tashkentMonthRangeUtc(month);
    const [txs, advances] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          companyId,
          type: TransactionType.SALARY_PAYMENT,
          reversedAt: null,
          reversedTransactionId: null,
          salaryPayment: { periodStart },
        },
        select: { id: true },
      }),
      this.prisma.expense.aggregate({
        where: {
          companyId,
          category: ExpenseCategory.TEACHER_ADVANCE,
          paymentMethod: ExpensePaymentMethod.CARD,
          deletedAt: null,
          settledBySalaryPayment: { periodStart },
          ...branchIdWhere(branchIds),
        },
        _sum: { amount: true },
      }),
    ]);
    const moves = txs.length
      ? await this.prisma.cashMovement.aggregate({
          where: {
            companyId,
            transactionId: { in: txs.map((t) => t.id) },
            type: CashMovementType.OUTFLOW,
            reversedAt: null,
            cashAccount: { type: CashAccountType.BANK },
            ...branchIdWhere(branchIds),
          },
          _sum: { amount: true },
        })
      : null;
    return -(moves?._sum.amount ?? 0) + (advances._sum.amount ?? 0);
  }

  /** Tugagan oyda doiradagi biror bank hisobiga bank xizmati yozilmaganmi. */
  private async bankFeesMissing(
    companyId: number,
    month: string,
    branchIds: ReportBranchIds,
  ): Promise<boolean> {
    if (month >= tashkentMonthKey(new Date())) return false;
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        companyId,
        type: CashAccountType.BANK,
        isActive: true,
        deletedAt: null,
        createdAt: { lt: tashkentMonthRangeUtc(month).lt },
        ...branchIdWhere(branchIds),
      },
      select: { id: true },
    });
    if (accounts.length === 0) return false;
    const entered = await this.prisma.expense.findMany({
      where: {
        companyId,
        category: ExpenseCategory.BANK_FEES,
        deletedAt: null,
        cashAccountId: { in: accounts.map((a) => a.id) },
        date: bankFeeWindow(month),
      },
      select: { cashAccountId: true },
      distinct: ['cashAccountId'],
    });
    return entered.length < accounts.length;
  }
}
```

- [ ] **Step 5: Callers and cache**

- `reports.service.ts` ~233: the comment about sequencing goes; call `this.taxCosts.forMonth(companyId, month, branchIds)` (can join the `Promise.all` above it).
- `reports-excel.workbook-input.ts` ~105 and ~144: drop the `salaries` argument. In the multi-month branch, `perMonth` is then only used for the taxes call — map `months` directly: `months.map((m) => taxCosts.forMonth(companyId, m, args.branchIds))`; remove `perMonth` if nothing else reads it (check first).
- `grep -rn "bankFees\|turnoverTiers\|BANK_TIERS" server/src server/scripts` — remove every remaining read (Excel sheets, profit composition). The Excel «Filiallar» tax column keeps `taxes.total`.
- `net-profit-cache.ts`: `NET_PROFIT_CACHE_VERSION = 'v7'` and add to the comment `v7: bank fee is an expense, social tax on bank-paid salary (spec 2026-10-28).`
- `scripts/build-report-services.ts`: still constructs `TaxCostsService(prisma, taxSettings)` — check it compiles.

Run: `cd server && npm run build` — expected PASS. Then `npx jest src/tax src/reports` — expected PASS (update any report spec that mocked `forMonth` with 4 args or asserted `bankFees`).

- [ ] **Step 6: Prettier + commit**

```bash
cd server && npx prettier --write $(git diff --name-only -- '*.ts' | sed 's#^server/##')
cd .. && git add server && git commit -m "feat(tax): social tax on bank-paid salary; drop bank tiers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `month-close` module (read + save bank fees)

**Files:**
- Create: `server/src/month-close/month-close.module.ts`, `month-close.controller.ts`, `month-close.service.ts`, `dto/save-bank-fees.dto.ts`, `month-close.service.spec.ts`, `month-close.controller.spec.ts`
- Modify: `server/src/app.module.ts` (imports), `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `ExpensesService.create(dto, userId, companyId, { cashAccountId })`, `ExpensesService.update(id, { amount }, userId, companyId)` (Task 1); `ReportsService.getMonthlyNetProfit(companyId, { month, branchIds, performedById })`; `bankFeeDate`, `bankFeeWindow`, `BANK_FEE_LABEL`; `BANK_FEES_ENTERED_KEY` (Task 2); `invalidateNetProfitCache(redis, companyId)`.
- Produces (HTTP):
  - `GET /month-close/:month` → `MonthCloseView`
  - `PUT /month-close/:month/bank-fees` body `{ items: { cashAccountId: string; amount: number }[] }` → `MonthCloseView`
  ```ts
  export interface MonthCloseView {
    month: string;
    ended: boolean;
    netProfit: NetProfit;
    bankAccounts: { id: string; name: string; branchId: number; branchName: string; amount: number | null }[];
    salaries: { paid: number; total: number };
    checklist: { bankFeesEntered: boolean; salariesPaid: boolean; ratesComplete: boolean };
  }
  ```

- [ ] **Step 1: DTO**

```ts
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

class BankFeeItemDto {
  @IsString()
  cashAccountId: string;

  @IsInt()
  @Min(0)
  amount: number;
}

export class SaveBankFeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BankFeeItemDto)
  items: BankFeeItemDto[];
}
```

- [ ] **Step 2: Failing service tests**

Mocks: `prisma.cashAccount.findMany`, `prisma.expense.findFirst`, `prisma.expense.findMany`, `prisma.salaryPayment.groupBy`, `prisma.branch` (via the account `include`), `expenses.create`, `expenses.update`, `reports.getMonthlyNetProfit`, `redis` (fake, see `net-profit-cache` spec for an existing fake if any; otherwise `{ del: jest.fn(), keys: jest.fn().mockResolvedValue([]) }` matching what `invalidateNetProfitCache` calls — read it first).

```ts
const ACC = { id: 'a1', name: 'Bank hisobi', type: 'BANK', branchId: 7, branch: { name: 'Toshkent' } };

it('refuses a month that has not ended', async () => {
  await expect(service.saveBankFees(1, tashkentMonthKey(new Date()), [{ cashAccountId: 'a1', amount: 5 }], 10, null))
    .rejects.toThrow('Joriy oy hali tugamagan');
});
it('refuses a bad month string', async () => {
  await expect(service.saveBankFees(1, '2026-13', [{ cashAccountId: 'a1', amount: 5 }], 10, null))
    .rejects.toThrow("Oy noto'g'ri");
});
it('refuses an account that is not a live BANK account of the company', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([]);
  await expect(service.saveBankFees(1, '2026-09', [{ cashAccountId: 'x', amount: 5 }], 10, null))
    .rejects.toThrow('Bank hisobi topilmadi');
});
it('refuses an account outside the caller scope', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([ACC]);
  await expect(service.saveBankFees(1, '2026-09', [{ cashAccountId: 'a1', amount: 5 }], 10, [3]))
    .rejects.toThrow(ForbiddenException);
});
it('creates a fee on the last day of the month with the account', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([ACC]);
  prisma.expense.findFirst.mockResolvedValue(null);
  await service.saveBankFees(1, '2026-09', [{ cashAccountId: 'a1', amount: 125_000 }], 10, null);
  expect(expenses.create).toHaveBeenCalledWith(
    {
      category: 'BANK_FEES', paymentMethod: 'CARD', amount: 125_000,
      description: 'Bank xizmati — Bank hisobi, 2026-09', date: '2026-09-30', branchId: 7,
    },
    10, 1, { cashAccountId: 'a1' },
  );
});
it('0 is an entry too (created with amount 0)', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([ACC]);
  prisma.expense.findFirst.mockResolvedValue(null);
  await service.saveBankFees(1, '2026-09', [{ cashAccountId: 'a1', amount: 0 }], 10, null);
  expect(expenses.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }), 10, 1, { cashAccountId: 'a1' });
});
it('a different amount updates the existing row; the same amount does nothing', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([ACC]);
  prisma.expense.findFirst.mockResolvedValue({ id: 'e1', amount: 100 });
  await service.saveBankFees(1, '2026-09', [{ cashAccountId: 'a1', amount: 250 }], 10, null);
  expect(expenses.update).toHaveBeenCalledWith('e1', { amount: 250 }, 10, 1);
  expenses.update.mockClear();
  prisma.expense.findFirst.mockResolvedValue({ id: 'e1', amount: 250 });
  await service.saveBankFees(1, '2026-09', [{ cashAccountId: 'a1', amount: 250 }], 10, null);
  expect(expenses.update).not.toHaveBeenCalled();
  expect(expenses.create).toHaveBeenCalledTimes(1);
});
it('read: accounts with their amount or null, salaries, checklist', async () => {
  prisma.cashAccount.findMany.mockResolvedValue([ACC, { ...ACC, id: 'a2', name: 'Ikkinchi' }]);
  prisma.expense.findMany.mockResolvedValue([{ cashAccountId: 'a1', amount: 0 }]);
  prisma.salaryPayment.groupBy.mockResolvedValue([{ status: 'PAID', _count: { _all: 3 } }, { status: 'APPROVED', _count: { _all: 1 } }]);
  reports.getMonthlyNetProfit.mockResolvedValue({ taxes: { missingRates: ['bank.feesEntered'] } });
  const v = await service.read(1, '2026-09', null, 10);
  expect(v.bankAccounts.map((a) => a.amount)).toEqual([0, null]);
  expect(v.salaries).toEqual({ paid: 3, total: 4 });
  expect(v.checklist).toEqual({ bankFeesEntered: false, salariesPaid: false, ratesComplete: true });
  expect(v.ended).toBe(true);
});
```

Run: `cd server && npx jest src/month-close` — expected FAIL.

- [ ] **Step 3: Service**

```ts
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { CashAccountType, ExpenseCategory, ExpensePaymentMethod, SalaryPaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ExpensesService } from '../expenses/expenses.service';
import { ReportsService } from '../reports/reports.service';
import { invalidateNetProfitCache } from '../reports/net-profit-cache';
import { tashkentMonthKey, tashkentMonthRangeUtc } from '../common/date/tashkent';
import { branchIdWhere, ReportBranchIds } from '../common/finance/report-branch-scope';
import { BANK_FEE_LABEL, bankFeeDate, bankFeeWindow } from '../tax/bank-fee';
import { BANK_FEES_ENTERED_KEY } from '../tax/tax-costs';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** «Oyni yopish» (spec 2026-10-28 §5): oy surati va bank xizmati kiritish. */
@Injectable()
export class MonthCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expenses: ExpensesService,
    private readonly reports: ReportsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private assertMonth(month: string) {
    if (!MONTH_RE.test(month)) throw new BadRequestException("Oy noto'g'ri");
  }

  private bankAccounts(companyId: number, month: string, scope: ReportBranchIds) {
    return this.prisma.cashAccount.findMany({
      where: {
        companyId,
        type: CashAccountType.BANK,
        isActive: true,
        deletedAt: null,
        createdAt: { lt: tashkentMonthRangeUtc(month).lt },
        ...branchIdWhere(scope),
      },
      select: { id: true, name: true, branchId: true, branch: { select: { name: true } } },
      orderBy: [{ branchId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async read(companyId: number, month: string, scope: ReportBranchIds, performedById: number) {
    this.assertMonth(month);
    const [accounts, netProfit, statuses] = await Promise.all([
      this.bankAccounts(companyId, month, scope),
      this.reports.getMonthlyNetProfit(companyId, { month, branchIds: scope, performedById }),
      this.prisma.salaryPayment.groupBy({
        by: ['status'],
        where: {
          companyId,
          periodStart: tashkentMonthRangeUtc(month),
          status: { not: SalaryPaymentStatus.CANCELLED },
          ...(scope === null ? {} : { user: { mainBranch: { in: scope } } }),
        },
        _count: { _all: true },
      }),
    ]);
    const fees = accounts.length
      ? await this.prisma.expense.findMany({
          where: {
            companyId,
            category: ExpenseCategory.BANK_FEES,
            deletedAt: null,
            cashAccountId: { in: accounts.map((a) => a.id) },
            date: bankFeeWindow(month),
          },
          select: { cashAccountId: true, amount: true },
        })
      : [];
    const feeOf = new Map(fees.map((f) => [f.cashAccountId, f.amount]));
    const bankAccounts = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      branchId: a.branchId,
      branchName: a.branch?.name ?? '',
      amount: feeOf.get(a.id) ?? null,
    }));
    const total = statuses.reduce((s, r) => s + r._count._all, 0);
    const paid = statuses.find((r) => r.status === SalaryPaymentStatus.PAID)?._count._all ?? 0;
    return {
      month,
      ended: month < tashkentMonthKey(new Date()),
      netProfit,
      bankAccounts,
      salaries: { paid, total },
      checklist: {
        bankFeesEntered: bankAccounts.every((a) => a.amount !== null),
        salariesPaid: total > 0 && paid === total,
        ratesComplete: netProfit.taxes.missingRates.every((k) => k === BANK_FEES_ENTERED_KEY),
      },
    };
  }

  async saveBankFees(
    companyId: number,
    month: string,
    items: { cashAccountId: string; amount: number }[],
    userId: number,
    scope: ReportBranchIds,
  ) {
    this.assertMonth(month);
    if (month >= tashkentMonthKey(new Date()))
      throw new BadRequestException('Joriy oy hali tugamagan — bank xarajati oy tugagach kiritiladi');
    const accounts = await this.prisma.cashAccount.findMany({
      where: {
        companyId,
        id: { in: items.map((i) => i.cashAccountId) },
        type: CashAccountType.BANK,
        deletedAt: null,
      },
      select: { id: true, name: true, branchId: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const item of items) {
      const acc = byId.get(item.cashAccountId);
      if (!acc) throw new BadRequestException('Bank hisobi topilmadi');
      if (scope !== null && !scope.includes(acc.branchId))
        throw new ForbiddenException("Bu filial bank hisobiga yozish huquqingiz yo'q");
    }
    // ponytail: har hisob o'z tranzaksiyasida (ExpensesService); qisman saqlansa, qayta saqlash xavfsiz.
    for (const item of items) {
      const acc = byId.get(item.cashAccountId)!;
      const existing = await this.prisma.expense.findFirst({
        where: {
          companyId,
          category: ExpenseCategory.BANK_FEES,
          cashAccountId: acc.id,
          deletedAt: null,
          date: bankFeeWindow(month),
        },
        select: { id: true, amount: true },
      });
      if (!existing) {
        await this.expenses.create(
          {
            category: ExpenseCategory.BANK_FEES,
            paymentMethod: ExpensePaymentMethod.CARD,
            amount: item.amount,
            description: `${BANK_FEE_LABEL} — ${acc.name}, ${month}`,
            date: bankFeeDate(month),
            branchId: acc.branchId,
          } as never,
          userId,
          companyId,
          { cashAccountId: acc.id },
        );
      } else if (existing.amount !== item.amount) {
        await this.expenses.update(existing.id, { amount: item.amount } as never, userId, companyId);
      }
    }
    await invalidateNetProfitCache(this.redis, companyId);
    return this.read(companyId, month, scope, userId);
  }
}
```

(Replace `as never` with the real `CreateExpenseDto` / `UpdateExpenseDto` types if they accept these fields — check the DTO files; the DTO class is a plain type here, no validation runs.)

- [ ] **Step 4: Controller + module**

```ts
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { MonthCloseService } from './month-close.service';
import { SaveBankFeesDto } from './dto/save-bank-fees.dto';

@Controller('month-close')
@Can('settings.tax')
export class MonthCloseController {
  constructor(private readonly service: MonthCloseService) {}

  @Get(':month')
  read(
    @Param('month') month: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.read(companyId, month, scope, userId);
  }

  @Put(':month/bank-fees')
  saveBankFees(
    @Param('month') month: string,
    @Body() dto: SaveBankFeesDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.saveBankFees(companyId, month, dto.items, userId, scope);
  }
}
```

Module imports `ExpensesModule`, `ReportsModule` (exports `ReportsService`? check `reports.module.ts` exports; add `ReportsService` if missing), `RedisModule` if not global (check how `TaxModule` gets `RedisService`). Register `MonthCloseModule` in `app.module.ts` beside `TaxModule`.

Controller spec, following an existing one (e.g. `tax-settings.controller.spec.ts`):

```ts
it('both routes carry settings.tax, CEO by default', () => {
  expect(routeAccess(MonthCloseController, 'read')).toEqual({ kind: 'can', keys: ['settings.tax'] });
  expect(defaultRolesOf(MonthCloseController, 'saveBankFees')).toEqual(['CEO']);
});
```

(Use the exact helper return shapes from `common/permissions/testing.ts` — copy from `tax-settings.controller.spec.ts`.)

- [ ] **Step 5: Route snapshot**

Add to `route-access.snapshot.json`, alphabetically among keys:

```json
  "GET /month-close/:month": [
    "CEO"
  ],
```
```json
  "PUT /month-close/:month/bank-fees": [
    "CEO"
  ],
```

(Do not run prettier on the JSON.) If `permission-allowed-roles.spec.ts` flags the PUT (settings.tax is wider than its defaults), add to `REVIEWED_COMPANY_WIDE_WRITES['settings.tax']` nothing — instead confirm the route is classified `BRANCH_SCOPED_BY_HEADER` by `@BranchScope()`; if the spec still needs an entry, extend the existing `settings.tax` reason string with `; PUT /month-close/:month/bank-fees: @BranchScope() and the service refuses an account outside the scope`.

- [ ] **Step 6: Run**

Run: `cd server && npx jest src/month-close src/common/permissions src/common/auth` — expected PASS. `npm run build` — PASS.

- [ ] **Step 7: Prettier + commit**

```bash
cd server && npx prettier --write src/month-close src/app.module.ts
cd .. && git add server && git commit -m "feat(month-close): month picture and per-account bank fee entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Remove `User.officialSalary`; salary detail returns bank tax rates

**Files:**
- Modify: `server/prisma/schema.prisma` (`User.officialSalary`), create `server/prisma/migrations/20261028110000_drop_user_official_salary/migration.sql`
- Modify: `server/src/users/users.service.ts` (lines ~88-95, ~694-704, ~773-784, ~852-861, ~935-936, ~994-1006), `users.controller.ts:106`, `dto/create-user.dto.ts:58`, `dto/update-user.dto.ts:64`, `common/entity-history/diff.util.ts:32-37` (comment only)
- Modify: `server/src/salary/salary-monthly-detail.service.ts` (lines 55-100, 185-225)
- Test: `users.service.spec.ts` (drop officialSalary cases), `salary-monthly-detail.service.spec.ts` (if it exists; else the salary spec that covers `official`)

**Interfaces:**
- Produces: salary detail field `bankTax: { withholdingPercent: number | null; employerSocialPercent: number | null }` (replaces `official`).

- [ ] **Step 1: Pre-check on production (read-only, controller runs it, not the subagent)**

Count rows with `"officialSalary" > 0` on prod (probe script pattern from `CLAUDE.local.md`, delete after). If any, stop and show the list to the user before the migration ships.

- [ ] **Step 2: Failing test for the detail**

In the salary detail spec: with rates 12/12 for the month, `detail.bankTax` equals `{ withholdingPercent: 12, employerSocialPercent: 12 }`; with no rates, both `null`; `detail.official` is `undefined`.

Run the spec — FAIL.

- [ ] **Step 3: Implement**

`salary-monthly-detail.service.ts`: delete `officialOf`, the `officialSalary` select in `payeeOf`, the `officialSplit` import; add

```ts
  /** «Berildi» oynasidagi bank qatori uchun oyning stavkalari (spec 2026-10-28 §4). */
  private async bankTaxOf(companyId: number, month: string) {
    const { rates } = await this.taxSettings.loadRates(companyId);
    return {
      withholdingPercent: rateForMonth(rates['payroll.employeeWithholdingPercent'], month),
      employerSocialPercent: rateForMonth(rates['payroll.employerSocialPercent'], month),
    };
  }
```

and return `bankTax: await this.bankTaxOf(companyId, month)` instead of `official`.

Users: delete every `officialSalary` line listed above, `payOnlySelect` keeps `balance` only, `omitOfficialSalary` goes (its callers return the user as is), the `invalidateNetProfitCache` call tied to the official salary change goes (and its import if unused). `diff.util.ts`: **keep** the `User: ['officialSalary']` redaction entry — old `EntityHistory` rows still carry the value and must stay hidden from non-`salary.view` readers; only reword its comment to say the column was dropped (spec 2026-10-28) and the entry guards old rows. `users.controller.ts:106`: drop the `officialSalary` key from the log object.

Schema: delete `officialSalary Int?` (and its comment). Migration:

```sql
ALTER TABLE "User" DROP COLUMN IF EXISTS "officialSalary";
```

Run: `cd server && npx prisma generate && npm run build && npx jest src/users src/salary src/common/entity-history` — PASS.

- [ ] **Step 4: Prettier + commit**

```bash
cd server && npx prettier --write $(git diff --name-only -- '*.ts' | sed 's#^server/##')
cd .. && git add server && git commit -m "refactor(payroll): drop User.officialSalary; salary detail sends bank tax rates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — pay dialog bank line, removals, BANK_FEES label

**Files:**
- Modify: `client/src/components/payments/salary/salary-pay-model.ts` (replace `officialLines`), `salary-pay-model.test.ts`, `salary-pay-dialog.tsx:102,163-168`, `salary-types.ts:163-170`
- Modify: `client/src/components/settings/edit-employee-form.tsx` (lines ~42, ~99, ~128, ~210-211, ~378-391), `client/src/hooks/use-edit-employee.ts:17`, `client/src/lib/schemas/employee-schema.ts:62-63,112+` (+ `employee-schema.test.ts`)
- Modify: `client/src/components/settings/tax-settings-client.tsx` (bank section, `DESCRIPTION`), delete `client/src/components/settings/tax-bank-tiers.tsx`, trim `tax-settings-draft.ts` (tier types/helpers) and its test if any
- Modify: `client/src/components/payments/overview/overview-math.ts:84`, `types.ts:102`
- Modify: `client/src/components/payments/expenses/expenses-labels.ts`, `expenses-labels.test.ts`, the expense form dialog (`expense-form-dialog.tsx` category list)
- Modify: `client/src/i18n/dictionaries/{en,ru,de}.ts`

**Interfaces:**
- Consumes: detail `bankTax` (Task 4).
- Produces: `bankPayLine(amount: number, rates: SalaryDetail["bankTax"], t?: Translate): string | null`; `CREATABLE_EXPENSE_CATEGORIES`.

- [ ] **Step 1: Failing model test**

```ts
describe("bankPayLine", () => {
  const rates = { withholdingPercent: 12, employerSocialPercent: 12 };
  it("splits a bank payout like the CEO's example", () => {
    expect(bankPayLine(2_000_000, rates)).toBe(
      "Kartaga tushadi: 1 760 000 so'm · Ushlanadi: 240 000 so'm · Korxona solig'i: 240 000 so'm (alohida)",
    );
  });
  it("nothing for 0 or without rates", () => {
    expect(bankPayLine(0, rates)).toBeNull();
    expect(bankPayLine(1000, { withholdingPercent: null, employerSocialPercent: null })).toBeNull();
  });
});
```

(`formatPrice` uses a non-breaking space; build the expected string with `formatPrice` in the test if a literal space mismatches.)

Run: `cd client && npx vitest run src/components/payments/salary/salary-pay-model.test.ts` — FAIL.

- [ ] **Step 2: Implement**

`salary-types.ts`: replace `official?: {…}` with

```ts
  /** The month's payroll rates for the bank line of «Berildi» (spec 2026-10-28). */
  bankTax?: { withholdingPercent: number | null; employerSocialPercent: number | null };
```

`salary-pay-model.ts`: delete `officialLines`, add

```ts
/** The line under a bank amount (spec 2026-10-28 §4): the numbers are rounded like the server's. */
export function bankPayLine(
  amount: number,
  rates: SalaryDetail["bankTax"],
  t: Translate = interpolate,
): string | null {
  const w = rates?.withholdingPercent;
  const s = rates?.employerSocialPercent;
  if (amount <= 0 || w == null || s == null) return null;
  const withheld = Math.round((amount * w) / 100);
  return t("Kartaga tushadi: {toCard} so'm · Ushlanadi: {withheld} so'm · Korxona solig'i: {social} so'm (alohida)", {
    toCard: formatPrice(amount - withheld),
    withheld: formatPrice(withheld),
    social: formatPrice(Math.round((amount * s) / 100)),
  });
}
```

`salary-pay-dialog.tsx`: delete the `official` const and block; after the card `AmountRow` render

```tsx
{bankLine && <p className="text-xs text-muted-foreground">{bankLine}</p>}
```

with `const cardAccount = cardAccounts.find((a) => a.id === cardId); const bankLine = cardAccount?.type === "BANK" ? bankPayLine(card, detail.bankTax, t) : null;` near `check`.

Employee form / hook / schema: delete the official-salary field, `officialSalaryOf`, its test cases, its payload line, and the «Rasmiy oylik (so'm)» texts from the dictionaries.

Tax settings: remove the «Bank» `Section` with `TaxBankTiers`, delete `tax-bank-tiers.tsx`, remove tier types/helpers from `tax-settings-draft.ts`; `DESCRIPTION` becomes `msg("To'lov komissiyasi, oylik va aylanma solig'i stavkalari")`; under the payroll section add one muted line `msg("Korxona solig'i oylikning bank hisobidan berilgan qismidan hisoblanadi. Bank xizmati «Oyni yopish» sahifasida kiritiladi.")`. Remove dictionary keys that no longer appear (the coverage test fails on stale keys).

Overview: remove the «Bank xarajati» line in `overview-math.ts:84` and `bankFees` from `types.ts`.

Expenses labels: add `"BANK_FEES"` after `"TAXES"` in `EXPENSE_CATEGORIES`, label `BANK_FEES: msg("Bank xizmati")`, and

```ts
/** What «Xarajat qo'shish» offers: a bank fee is entered on «Oyni yopish» (spec 2026-10-28). */
export const CREATABLE_EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c !== "BANK_FEES");
```

Update `expenses-labels.test.ts` («nine categories … in its order»). In the expense form dialog use `CREATABLE_EXPENSE_CATEGORIES` for the select options; when editing a `BANK_FEES` row, show the category as plain text and keep branch/method disabled (the server refuses changes).

Dictionaries: add en/ru/de for every new text.

- [ ] **Step 3: Run**

Run: `cd client && npx vitest run src/components/payments src/components/settings src/lib/schemas src/i18n` — PASS. `npx tsc --noEmit -p .` — PASS. `grep -rn "official\|bankFees\|turnoverTiers" client/src` — only unrelated hits (store badges).

- [ ] **Step 4: Commit**

```bash
git add client && git commit -m "feat(client): bank tax line in pay dialog; drop official salary and bank tiers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Client — «Oyni yopish» page

**Files:**
- Create: `client/src/app/(dashboard)/reports/oyni-yopish/page.tsx`
- Create: `client/src/components/reports/month-close/month-close-types.ts`, `month-close-queries.ts`, `month-close-model.ts`, `month-close-model.test.ts`, `month-close-page.tsx`
- Modify: `client/src/lib/reports-nav.ts`, `client/src/lib/breadcrumb-routes.ts`, `client/src/i18n/i18n-coverage.test.ts` (`STRICT_FILES`), dictionaries, `client/src/lib/reports-nav.test.ts` (if it pins items per role)

**Interfaces:**
- Consumes: `GET /month-close/:month`, `PUT /month-close/:month/bank-fees` (Task 3).
- Produces: `checklistRows(view, t?)`, `pictureRows(view, t?)`, `bankFeeBody(accounts, drafts)`.

- [ ] **Step 1: Types**

```ts
export interface MonthCloseView {
  month: string;
  ended: boolean;
  netProfit: {
    revenue: number; balanceWithdrawals: number; teacherSalary: number; adminSalary: number;
    operatingExpenses: number; refunds: number; netProfit: number;
    taxes: { providerFees: number; turnoverTax: number; employerSocialTax: number; withholding: number; bankPaidSalary: number; total: number; missingRates: string[] };
  };
  bankAccounts: { id: string; name: string; branchId: number; branchName: string; amount: number | null }[];
  salaries: { paid: number; total: number };
  checklist: { bankFeesEntered: boolean; salariesPaid: boolean; ratesComplete: boolean };
}
```

- [ ] **Step 2: Failing model tests**

```ts
import { bankFeeBody, checklistRows, pictureRows } from "./month-close-model";

const view = {
  month: "2026-09", ended: true,
  netProfit: { revenue: 100, balanceWithdrawals: 0, teacherSalary: 30, adminSalary: 10, operatingExpenses: 20, refunds: 0, netProfit: 31,
    taxes: { providerFees: 2, turnoverTax: 4, employerSocialTax: 3, withholding: 3, bankPaidSalary: 25, total: 9, missingRates: [] } },
  bankAccounts: [{ id: "a1", name: "Bank", branchId: 1, branchName: "Toshkent", amount: null }],
  salaries: { paid: 3, total: 4 },
  checklist: { bankFeesEntered: false, salariesPaid: false, ratesComplete: true },
};

it("picture rows carry the server's figures, expenses and taxes negative", () => {
  expect(pictureRows(view).map((r) => [r.label, r.amount])).toEqual([
    ["Tushum", 100], ["O'qituvchilar oyligi", -30], ["Xodimlar oyligi", -10], ["Xarajatlar (bank xizmati bilan)", -20],
    ["To'lov komissiyasi", -2], ["Aylanma solig'i", -4], ["Korxona ijtimoiy solig'i", -3], ["Sof foyda", 31],
  ]);
});
it("checklist says what is missing", () => {
  expect(checklistRows(view)).toEqual([
    { ok: false, text: "Bank xarajati: 1 ta hisobdan 0 tasi kiritilgan" },
    { ok: false, text: "Oyliklar: 4 tadan 3 tasi berilgan" },
    { ok: true, text: "Stavkalar to'liq" },
  ]);
});
it("the save body sends only filled drafts as whole so'm", () => {
  expect(bankFeeBody(view.bankAccounts, { a1: "125000" })).toEqual({ items: [{ cashAccountId: "a1", amount: 125000 }] });
  expect(bankFeeBody(view.bankAccounts, { a1: "" })).toEqual({ items: [] });
});
```

(A `balanceWithdrawals` > 0 adds a row «Yechib olingan balans» after «Tushum»; add one case for it.)

Run: `cd client && npx vitest run src/components/reports/month-close` — FAIL.

- [ ] **Step 3: Model**

```ts
import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import type { Translate } from "@/components/payments/record-payment-admission";
import type { MonthCloseView } from "./month-close-types";

export function pictureRows(v: MonthCloseView, t: Translate = interpolate) {
  const n = v.netProfit;
  const rows = [{ label: t("Tushum"), amount: n.revenue }];
  if (n.balanceWithdrawals > 0) rows.push({ label: t("Yechib olingan balans"), amount: n.balanceWithdrawals });
  rows.push(
    { label: t("O'qituvchilar oyligi"), amount: -n.teacherSalary },
    { label: t("Xodimlar oyligi"), amount: -n.adminSalary },
    { label: t("Xarajatlar (bank xizmati bilan)"), amount: -n.operatingExpenses },
  );
  if (n.refunds > 0) rows.push({ label: t("Qaytarilgan pul"), amount: -n.refunds });
  rows.push(
    { label: t("To'lov komissiyasi"), amount: -n.taxes.providerFees },
    { label: t("Aylanma solig'i"), amount: -n.taxes.turnoverTax },
    { label: t("Korxona ijtimoiy solig'i"), amount: -n.taxes.employerSocialTax },
    { label: t("Sof foyda"), amount: n.netProfit },
  );
  return rows;
}

export function checklistRows(v: MonthCloseView, t: Translate = interpolate) {
  const entered = v.bankAccounts.filter((a) => a.amount !== null).length;
  return [
    {
      ok: v.checklist.bankFeesEntered,
      text: v.bankAccounts.length === 0
        ? t("Bank xarajati: bank hisobi yo'q")
        : t("Bank xarajati: {total} ta hisobdan {entered} tasi kiritilgan", { total: v.bankAccounts.length, entered }),
    },
    {
      ok: v.checklist.salariesPaid,
      text: t("Oyliklar: {total} tadan {paid} tasi berilgan", { total: v.salaries.total, paid: v.salaries.paid }),
    },
    { ok: v.checklist.ratesComplete, text: v.checklist.ratesComplete ? t("Stavkalar to'liq") : t("Stavkalar to'liq emas — Sozlamalar → Soliq va komissiyalar") },
  ];
}

export function bankFeeBody(accounts: MonthCloseView["bankAccounts"], drafts: Record<string, string>) {
  return {
    items: accounts
      .filter((a) => (drafts[a.id] ?? "") !== "")
      .map((a) => ({ cashAccountId: a.id, amount: Number(drafts[a.id]) })),
  };
}
```

(Fix the «0 tasi» expectation in the test if the bank-accounts-empty branch changes it. The `Bank xarajati: 0 ta…` case with no accounts is `ok: true` because `every` on `[]` is true — that is intended.)

- [ ] **Step 4: Queries + page**

`month-close-queries.ts`:

```ts
export const MONTH_CLOSE_KEY = (month: string) => ["month-close", month] as const;
export function useMonthClose(month: string) {
  return useQuery({ queryKey: MONTH_CLOSE_KEY(month), queryFn: () => api.get<MonthCloseView>(`/month-close/${month}`).then((r) => r.data) });
}
export function useSaveBankFees(month: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { items: { cashAccountId: string; amount: number }[] }) =>
      api.put<MonthCloseView>(`/month-close/${month}/bank-fees`, body).then((r) => r.data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: MONTH_CLOSE_KEY(month) });
      await invalidateExpenses(qc);
    },
  });
}
```

`month-close-page.tsx` (client component, `"use client"`): header «Oyni yopish» + `MonthStepper` on `?oy=` (default last month: `addMonths(currentMonth, -1)`; max current month; min 2026-05 — reuse the overview's `clampMonth` helpers if exported, else the same rule), then three cards:
1. «{Oy} surati» — `pictureRows` as a two-column list (`formatBalance(amount, t("so'm"))`, «Sof foyda» bold); below it a muted line `Ushlangan 12% (xodimniki, ma'lumot): X so'm · Bankdan berilgan oylik: Y so'm` from `taxes.withholding` / `taxes.bankPaidSalary`.
2. «Bank xarajati» — one row per account: name, branch, `<PriceInput>` (value from `drafts[id] ?? (amount ?? "")`), the saved amount under it when not null; one «Saqlash» button (`Loader2` while pending; disabled when `!view.ended` or the body is empty); when `!view.ended` an `Alert`: «Joriy oy hali tugamagan — bank xarajati oy tugagach kiritiladi». Success toast «Saqlandi», error `getErrorMessage(err, t("Saqlashda xatolik yuz berdi"))`.
3. «Tekshiruv» — `checklistRows` with ✓ (green) / ✗ (amber) icons and, when all ok, «Oy hisobi to'liq».
Loading: skeletons per card; error: «Ma'lumotni yuklab bo'lmadi.» + «Qayta urinish».

`page.tsx`:

```tsx
import { Suspense } from "react";
import { MonthClosePage } from "@/components/reports/month-close/month-close-page";

export default function OyniYopishPage() {
  return (
    <Suspense fallback={null}>
      <MonthClosePage />
    </Suspense>
  );
}
```

Nav: in `reports-nav.ts` «Moliyaviy hisobotlar» add `{ title: msg("Oyni yopish"), url: "/reports/oyni-yopish", icon: CalendarCheck2, permission: "settings.tax" }` (import the icon). Breadcrumb: `"oyni-yopish": msg("Oyni yopish")`. Add the new files to `STRICT_FILES`; dictionaries en/ru/de for every text. Update `reports-nav.test.ts` per-role expectations (CEO gains the item).

- [ ] **Step 5: Run**

Run: `cd client && npx vitest run src/components/reports/month-close src/lib src/i18n` — PASS. `npx tsc --noEmit -p .` — PASS.

- [ ] **Step 6: Browser check (controller)**

Start the dev server (`.claude/launch.json`), open `/reports/oyni-yopish?oy=2026-09` as CEO against a local DB, enter a fee, save, see the checklist row turn ✓ and the expenses page list «Bank xizmati».

- [ ] **Step 7: Commit**

```bash
git add client && git commit -m "feat(client): «Oyni yopish» page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Docs, ADR, guide

**Files:**
- Create: `docs/adr/0139-oyni-yopish-bank-va-ijtimoiy-soliq.md`
- Modify: `docs/adr/README.md`, `docs/adr/0130-soliq-va-komissiyalar-sof-foydada.md` (status line only: `Qisman almashtirildi — ADR-0139`), `server/CLAUDE.md` (the `User.officialSalary` bullet in «Capabilities, not role lists» → replace with one bullet on `BANK_FEES` + `settings.tax`), `client/CLAUDE.md` («No hard-coded tax rates» bullet: add «bank xizmati — «Oyni yopish»»), `client/src/qollanma/yangiliklar.ts` (one entry, put second per memory note), a guide page if `client/src/qollanma/sahifalar/` has one for tax settings (update its bank section).

- [ ] **Step 1:** Check the next free ADR number (`ls docs/adr | sort | tail`), write ADR-0139 in Uzbek: Holat, Kontekst (two mismatches), Qaror (spec §2 rules 1–7), Oqibatlar (§8 limits), Almashtiradi: ADR-0130 bank/oylik qismi.
- [ ] **Step 2:** Edits above. Run `cd client && npx vitest run src/qollanma` — PASS.
- [ ] **Step 3: Commit**

```bash
git add docs server/CLAUDE.md client/CLAUDE.md client/src/qollanma && git commit -m "docs: ADR-0139 month close — bank fees and social tax on bank-paid salary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Final verification (controller)

- `cd server && npm run build && npm run test` — full suite PASS.
- `cd client && npx tsc --noEmit -p . && npx vitest run && npm run i18n:check` — PASS.
- Spec coverage: §3 → Tasks 1, 3; §4 → Tasks 2, 4, 5; §5 → Tasks 3, 6; §6 → Tasks 2, 4, 5; §7 → Tasks 2, 3, 6, 7; §9 tests → Tasks 1–3.
- After deploy (only when the user asks): prod probe of October `getMonthlyNetProfit` — `taxes.bankPaidSalary`, `employerSocialTax = round(bankPaidSalary × 12%)`, `bank.feesEntered` in `missingRates` until fees are entered.
