# Soliq va komissiyalar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CEO or an accountant enters payment-fee, payroll-tax, turnover-tax and bank-fee rates on one settings page; the canonical net profit subtracts the resulting costs, and every report shows which rates are still missing.

**Architecture:** Rates live in the existing `Setting` table as company-level, month-dated lists (`[{ fromMonth, value }]`). A pure module picks the rate for a month; one service (`TaxCostsService`) turns a month's payments and payroll into a `TaxCosts` object; `buildNetProfit` subtracts it, so Excel, Telegram, dashboard and the Foyda card follow from the one canonical figure. A new `QR` payment method and a `User.officialSalary` column feed the rules.

**Tech Stack:** NestJS + Prisma (PostgreSQL) + Jest on the server; Next.js + React Query + Vitest on the client.

**Spec:** `docs/superpowers/specs/2026-10-25-soliq-va-komissiyalar-design.md` — read it once in full before Task 1.

## Global Constraints

- Work in a worktree: `.claude/worktrees/soliq-komissiya/`, branch `feat/soliq-komissiya`, from `main`. Run `npm install` in both `server/` and `client/` of the worktree first, then `npx prisma generate` in `server/`.
- No rate is hard-coded. Every rate setting defaults to `[]` (= «kiritilmagan»).
- Rates are percents `0–100`, at most 2 decimals (2.5 is valid). Bank tier amounts are whole so'm.
- All tax settings are `companyLevelOnly: true`.
- A missing rate counts as 0 but is ALWAYS listed in `missingRates` — only for things actually used that month.
- Fees, turnover tax and bank fee are booked by payment month (`Payment.createdAt`, Tashkent month via `tashkentMonthRangeUtc`). Employer social tax by salary month.
- Refunds do not reduce fees or taxes.
- `CASH` and `TRANSFER` pay no fee. `CASH` is not turnover; `TRANSFER` and `QR` are.
- Channel map (one function, `feeChannelOf`): method `QR` → `qr`; source `GATEWAY_WEBHOOK`/`STUDENT_PORTAL`/`MANUAL_ATTACH` with PAYME/CLICK/UZUM → `integration`; source `ADMIN_MANUAL` with PAYME/CLICK/UZUM → `app.<method>`; else none. A stored `Payment.providerFee` wins over the computed fee.
- `rasmiy = min(User.officialSalary ?? 0, salary earned this month)`. Employer social tax is a company cost; withholding is NOT (it is inside the earned salary).
- Bank fee: company turnover picks the tier, `tier.percent × company turnover`, split to a branch scope by turnover share.
- Permission key `settings.tax`: `defaultRoles: []` (CEO only), `allowedRoles: [D, A, K]`, `lockReasons: { [T]: LOCK.NO_PAGE }`.
- Server: run `npx prettier --write` on touched `.ts`. Client: **never** run Prettier. Client tests: `npx vitest --config vitest.config.ts run <path>` from `client/`.
- Commit messages in English, Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- ADR text, UI strings and user-guide text in Uzbek (Latin).

---

## File Structure

**Server — new**
- `server/src/tax/tax-rates.ts` — keys, types, parsers, `rateForMonth`, `tiersForMonth`, `tierPercentFor`. Pure.
- `server/src/tax/fee-channel.ts` — `feeChannelOf`, `channelRateKey`. Pure.
- `server/src/tax/tax-costs.ts` — `TaxCosts` type, `computePaymentCosts`, `computePayrollTax`, `officialSplit`, `sumTaxCosts`, `emptyTaxCosts`. Pure.
- `server/src/tax/tax-costs.service.ts` — loads payments, users and rates, calls the pure functions.
- `server/src/tax/tax-settings.service.ts`, `tax-settings.controller.ts`, `dto/update-tax-settings.dto.ts`, `tax.module.ts`.
- Specs next to each file.
- `server/prisma/migrations/20261025120000_payment_method_qr/migration.sql`
- `server/prisma/migrations/20261025130000_user_official_salary/migration.sql`

**Server — modify**
- `prisma/schema.prisma` (enum `PaymentMethod`, `User.officialSalary`)
- `settings/settings.types.ts` (register 9 keys)
- `common/permissions/permission-catalog.admin.ts`, `permission-catalog.spec.ts`, `route-access.snapshot.json`, `permission-allowed-roles.spec.ts`, `common/auth/branch-route-policy.ts`
- `reports/reports-excel.helpers.ts` (`buildNetProfit`, `NetProfit`, `METHOD_LABELS`), `reports/reports.service.ts` (`assembleMonthlyNetProfit`), `reports/reports-excel.workbook-input.ts`, `reports/reports-excel.sheets.ts`, `reports/net-profit-cache.ts`
- `reports/reports-profit-composition.service.ts`, `reports/profit-composition.ts`, `expenses/expenses-month.service.ts`, `dashboard/dashboard-charts.service.ts`, `telegram-groups/telegram-group-daily-report.service.ts`
- Payment-method label maps: `receipts/pdf/payment-template.ts`, `receipts/pdf/refund-template.ts`, `payments/shared/method-label.ts`, `telegram-groups/daily-report-group-message.ts`, `telegram-groups/telegram-group-stats.service.ts`, `statements/statement-text.ts`, `mock-exams/mock-exam-stats.ts`
- `users/dto/create-user.dto.ts`, `users/dto/update-user.dto.ts`, `users/users.service.ts`, `salary/salary-monthly-detail.service.ts`

**Client — new**
- `client/src/app/(dashboard)/settings/tax/page.tsx`, `client/src/components/settings/tax-settings-client.tsx`, `client/src/components/settings/tax-settings-draft.ts` (+ `.test.ts`)

**Client — modify**
- `lib/permission-keys.ts`, `lib/settings-nav.ts`, `lib/breadcrumb-routes.ts`
- the 14 payment-method maps listed in Task 1
- `components/payments/overview/{types.ts,overview-math.ts,profit-card.tsx,profit-dialog.tsx}`
- `components/dashboard/{dashboard-charts-types.ts,chart-breakdown-rows.ts}`
- `components/settings/edit-employee-form.tsx`, `components/payments/salary/salary-pay-dialog.tsx`

**Docs**
- `docs/adr/0106-soliq-va-komissiyalar-sof-foydada.md` (take the next free number from `docs/adr/README.md`), `docs/adr/README.md`, `server/CLAUDE.md` («No tax calculation» bullet), `client/src/qollanma/yangiliklar.ts` and the settings page of the user guide.

---

### Task 1: `QR` payment method

**Files:**
- Modify: `server/prisma/schema.prisma:237-243`
- Create: `server/prisma/migrations/20261025120000_payment_method_qr/migration.sql`
- Modify (server labels): `server/src/receipts/pdf/payment-template.ts:12-18`, `server/src/receipts/pdf/refund-template.ts:12-18`, `server/src/payments/shared/method-label.ts:1-7`, `server/src/telegram-groups/daily-report-group-message.ts:36-43`, `server/src/telegram-groups/telegram-group-stats.service.ts:195-201`, `server/src/statements/statement-text.ts:53-59`, `server/src/reports/reports-excel.helpers.ts:80-86`, `server/src/mock-exams/mock-exam-stats.ts:19-27`
- Modify (client): `components/payments/record-payment-dialog.tsx:116-122`, `components/payments/refund-dialog.tsx:61-67`, `components/payments/list/payments-list-types.ts:3`, `components/payments/list/payments-format.ts:53-59`, `components/payments/list/payments-url.ts:90`, `components/payments/overview/overview-math.ts:41-47`, `components/payments/overview/recent-payments.tsx:24-30`, `components/students/student-profile-tabs-utils.ts:43-49`, `components/mock-exams/mock-exam-stats.ts:9-15`, `components/mock-exams/exam-detail-types.ts:76-80`
- Test: `server/src/payments/shared/method-label.spec.ts` (create if missing)

**Interfaces:**
- Produces: `PaymentMethod.QR` (Prisma enum value `'QR'`), label «QR-kod» everywhere.

- [ ] **Step 1: Write the failing test**

```ts
// server/src/payments/shared/method-label.spec.ts
import { PaymentMethod } from '@prisma/client';
import { methodLabel } from './method-label';

describe('methodLabel', () => {
  it('names the QR method', () => {
    expect(methodLabel(PaymentMethod.QR)).toBe('QR-kod');
  });
});
```

Read `method-label.ts` first; if the export has another name, use it in the test.

- [ ] **Step 2: Run it — fails**

Run: `cd server && npx jest src/payments/shared/method-label.spec.ts`
Expected: FAIL — `PaymentMethod.QR` is undefined (type error or `undefined` label).

- [ ] **Step 3: Schema + migration**

In `schema.prisma`:

```prisma
enum PaymentMethod {
  CASH
  PAYME
  CLICK
  UZUM
  TRANSFER
  QR
}
```

`server/prisma/migrations/20261025120000_payment_method_qr/migration.sql`:

```sql
-- QR-kod orqali bankka tushgan to'lov: admin chek bo'yicha kiritadi (spec 2026-10-25).
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'QR';
```

Run: `npx prisma generate`

- [ ] **Step 4: Add `QR: 'QR-kod'` to every server map listed above**

Each map gets one entry after `TRANSFER`. The two `Record<PaymentMethod, string>` maps fail to compile without it; the `Record<string, string>` ones and `METHOD_ORDER` arrays need it to print a label and keep the order (put `'QR'` after `'TRANSFER'` in `METHOD_ORDER`).

- [ ] **Step 5: Client maps**

- `record-payment-dialog.tsx` `methodOptions`: add `{ value: "QR", label: "QR-kod" }` after `TRANSFER`.
- `refund-dialog.tsx` `refundMethods`: do NOT add (a refund never goes back through a QR code).
- `payments-list-types.ts`: union gets `| "QR"`.
- `payments-format.ts` `METHOD_FILTER`, `payments-url.ts` `METHODS`, `overview-math.ts` `PAYMENT_METHOD_LABELS`, `student-profile-tabs-utils.ts` `PAYMENT_METHOD_LABELS`, `mock-exam-stats.ts` `METHOD_LABELS`, `exam-detail-types.ts` union: add `QR` / «QR-kod».
- `recent-payments.tsx` `methodColors`: `QR: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300"`.
- `gateway-events-*`, `student-portal/student-payment-summary.tsx`, `mock-payment.ts`: leave alone (gateway providers / mock payments never use QR).

- [ ] **Step 6: Verify**

Run: `cd server && npx jest src/payments/shared/method-label.spec.ts && npm run typecheck`
Expected: PASS, no type errors.
Run: `cd client && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/payments/shared/method-label.spec.ts src/receipts/pdf/payment-template.ts src/receipts/pdf/refund-template.ts src/payments/shared/method-label.ts src/telegram-groups/daily-report-group-message.ts src/telegram-groups/telegram-group-stats.service.ts src/statements/statement-text.ts src/reports/reports-excel.helpers.ts src/mock-exams/mock-exam-stats.ts
cd .. && git add server/prisma client/src/components server/src
git commit -m "feat(payments): add QR payment method

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Dated rate settings (pure module + registry)

**Files:**
- Create: `server/src/tax/tax-rates.ts`, `server/src/tax/tax-rates.spec.ts`
- Modify: `server/src/settings/settings.types.ts` (`SettingKey` union ~46-49, `SettingValueMap` ~73-76, `SETTING_DEFINITIONS` ~410-436)

**Interfaces:**
- Produces (from `tax/tax-rates.ts`):
  - `TAX_RATE_KEYS` (readonly tuple of 8 string keys), `type TaxRateKey`
  - `BANK_TIERS_KEY = 'bank.turnoverTiers'`, `type TaxSettingKey = TaxRateKey | typeof BANK_TIERS_KEY`, `TAX_SETTING_KEYS`
  - `type DatedRate = { fromMonth: string; value: number }`
  - `type BankTier = { fromAmount: number; toAmount: number | null; percent: number }`
  - `type DatedTiers = { fromMonth: string; tiers: BankTier[] }`
  - `parseDatedRates(key: string, raw: unknown): DatedRate[]`
  - `parseDatedTiers(key: string, raw: unknown): DatedTiers[]`
  - `rateForMonth(list: DatedRate[], month: string): number | null`
  - `tiersForMonth(list: DatedTiers[], month: string): BankTier[] | null`
  - `tierPercentFor(tiers: BankTier[], amount: number): number`

- [ ] **Step 1: Write the failing tests**

```ts
// server/src/tax/tax-rates.spec.ts
import { BadRequestException } from '@nestjs/common';
import {
  parseDatedRates,
  parseDatedTiers,
  rateForMonth,
  tiersForMonth,
  tierPercentFor,
} from './tax-rates';

describe('parseDatedRates', () => {
  it('accepts decimals and sorts by month', () => {
    expect(
      parseDatedRates('tax.turnoverPercent', [
        { fromMonth: '2026-12', value: 6 },
        { fromMonth: '2026-10', value: 4 },
      ]),
    ).toEqual([
      { fromMonth: '2026-10', value: 4 },
      { fromMonth: '2026-12', value: 6 },
    ]);
    expect(parseDatedRates('fees.qr', [{ fromMonth: '2026-10', value: 2.5 }])).toEqual([
      { fromMonth: '2026-10', value: 2.5 },
    ]);
  });

  it.each([
    [[{ fromMonth: '2026-13', value: 4 }]],
    [[{ fromMonth: '2026-10', value: 101 }]],
    [[{ fromMonth: '2026-10', value: -1 }]],
    [[{ fromMonth: '2026-10', value: 2.555 }]],
    [[{ fromMonth: '2026-10', value: 4 }, { fromMonth: '2026-10', value: 5 }]],
    ['4'],
  ])('refuses %j', (raw) => {
    expect(() => parseDatedRates('tax.turnoverPercent', raw)).toThrow(BadRequestException);
  });
});

describe('rateForMonth', () => {
  const list = [
    { fromMonth: '2026-10', value: 4 },
    { fromMonth: '2027-01', value: 6 },
  ];
  it('takes the latest row in force', () => {
    expect(rateForMonth(list, '2026-12')).toBe(4);
    expect(rateForMonth(list, '2027-01')).toBe(6);
  });
  it('is null before the first row and for an empty list', () => {
    expect(rateForMonth(list, '2026-09')).toBeNull();
    expect(rateForMonth([], '2026-10')).toBeNull();
  });
});

describe('parseDatedTiers', () => {
  const ok = [
    { fromAmount: 0, toAmount: 100_000_000, percent: 0.2 },
    { fromAmount: 100_000_000, toAmount: null, percent: 0.1 },
  ];
  it('accepts contiguous tiers ending open', () => {
    expect(parseDatedTiers('bank.turnoverTiers', [{ fromMonth: '2026-10', tiers: ok }])).toEqual([
      { fromMonth: '2026-10', tiers: ok },
    ]);
  });
  it.each([
    [[{ fromAmount: 10, toAmount: null, percent: 1 }]],
    [[{ fromAmount: 0, toAmount: 50, percent: 1 }]],
    [
      [
        { fromAmount: 0, toAmount: 50, percent: 1 },
        { fromAmount: 60, toAmount: null, percent: 1 },
      ],
    ],
    [[{ fromAmount: 0, toAmount: 0, percent: 1 }, { fromAmount: 0, toAmount: null, percent: 1 }]],
    [[]],
  ])('refuses tiers %j', (tiers) => {
    expect(() =>
      parseDatedTiers('bank.turnoverTiers', [{ fromMonth: '2026-10', tiers }]),
    ).toThrow(BadRequestException);
  });
});

describe('tierPercentFor', () => {
  const tiers = [
    { fromAmount: 0, toAmount: 100, percent: 0.2 },
    { fromAmount: 100, toAmount: null, percent: 0.1 },
  ];
  it('picks the tier the amount falls in (lower bound inclusive)', () => {
    expect(tierPercentFor(tiers, 0)).toBe(0.2);
    expect(tierPercentFor(tiers, 99)).toBe(0.2);
    expect(tierPercentFor(tiers, 100)).toBe(0.1);
  });
  it('tiersForMonth follows the dated list', () => {
    expect(tiersForMonth([{ fromMonth: '2026-10', tiers }], '2026-09')).toBeNull();
    expect(tiersForMonth([{ fromMonth: '2026-10', tiers }], '2026-11')).toBe(tiers);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd server && npx jest src/tax/tax-rates.spec.ts`
Expected: FAIL — `Cannot find module './tax-rates'`.

- [ ] **Step 3: Implement**

```ts
// server/src/tax/tax-rates.ts
import { BadRequestException } from '@nestjs/common';

/**
 * Soliq va komissiya stavkalari (spec 2026-10-25). Har kalit — oydan kuchga
 * kiradigan qatorlar ro'yxati; bo'sh ro'yxat = «kiritilmagan». Stavka kodga
 * yozilmaydi: CEO yoki buxgalter sozlama sahifasida kiritadi.
 */
export const TAX_RATE_KEYS = [
  'fees.app.payme',
  'fees.app.click',
  'fees.app.uzum',
  'fees.integration',
  'fees.qr',
  'payroll.employeeWithholdingPercent',
  'payroll.employerSocialPercent',
  'tax.turnoverPercent',
] as const;
export type TaxRateKey = (typeof TAX_RATE_KEYS)[number];

export const BANK_TIERS_KEY = 'bank.turnoverTiers' as const;
export type TaxSettingKey = TaxRateKey | typeof BANK_TIERS_KEY;
export const TAX_SETTING_KEYS: readonly TaxSettingKey[] = [...TAX_RATE_KEYS, BANK_TIERS_KEY];

export type DatedRate = { fromMonth: string; value: number };
export type BankTier = { fromAmount: number; toAmount: number | null; percent: number };
export type DatedTiers = { fromMonth: string; tiers: BankTier[] };

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function fail(key: string, why: string, raw: unknown): never {
  throw new BadRequestException(`${key}: ${why}, kelgan qiymat: ${JSON.stringify(raw)}`);
}

function isPercent(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= 0 &&
    v <= 100 &&
    Math.round(v * 100) === v * 100
  );
}

function isWholeSom(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function parseMonths<T extends { fromMonth: string }>(key: string, raw: unknown, row: (r: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(raw)) fail(key, "ro'yxat bo'lishi kerak", raw);
  const rows = raw.map((r) => {
    if (typeof r !== 'object' || r === null) fail(key, "qator obyekt bo'lishi kerak", r);
    const rec = r as Record<string, unknown>;
    if (typeof rec.fromMonth !== 'string' || !MONTH_RE.test(rec.fromMonth)) {
      fail(key, "oy YYYY-MM ko'rinishida bo'lishi kerak", r);
    }
    return row(rec);
  });
  rows.sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].fromMonth === rows[i - 1].fromMonth) fail(key, 'bir oy ikki marta berilgan', raw);
  }
  return rows;
}

export function parseDatedRates(key: string, raw: unknown): DatedRate[] {
  return parseMonths(key, raw, (r) => {
    if (!isPercent(r.value)) fail(key, "foiz 0 dan 100 gacha, ko'pi bilan 2 kasr bo'lishi kerak", r);
    return { fromMonth: r.fromMonth as string, value: r.value };
  });
}

function parseTiers(key: string, raw: unknown): BankTier[] {
  if (!Array.isArray(raw) || raw.length === 0) fail(key, "kamida bitta oraliq bo'lishi kerak", raw);
  const tiers = raw.map((t) => {
    const r = (t ?? {}) as Record<string, unknown>;
    const toAmount = r.toAmount === null ? null : r.toAmount;
    if (!isWholeSom(r.fromAmount) || (toAmount !== null && !isWholeSom(toAmount)) || !isPercent(r.percent)) {
      fail(key, "oraliq noto'g'ri", t);
    }
    return { fromAmount: r.fromAmount, toAmount: toAmount as number | null, percent: r.percent };
  });
  if (tiers[0].fromAmount !== 0) fail(key, '1-oraliq 0 dan boshlanishi kerak', raw);
  if (tiers[tiers.length - 1].toAmount !== null) fail(key, "oxirgi oraliqning yuqori chegarasi bo'sh bo'lishi kerak", raw);
  for (let i = 0; i < tiers.length - 1; i++) {
    const t = tiers[i];
    if (t.toAmount === null || t.toAmount <= t.fromAmount) fail(key, "oraliq chegarasi noto'g'ri", raw);
    if (tiers[i + 1].fromAmount !== t.toAmount) fail(key, "oraliqlar orasida bo'shliq yoki kesishma bor", raw);
  }
  return tiers;
}

export function parseDatedTiers(key: string, raw: unknown): DatedTiers[] {
  return parseMonths(key, raw, (r) => ({ fromMonth: r.fromMonth as string, tiers: parseTiers(key, r.tiers) }));
}

function inForce<T extends { fromMonth: string }>(list: T[], month: string): T | null {
  let hit: T | null = null;
  for (const row of list) if (row.fromMonth <= month) hit = row;
  return hit;
}

export function rateForMonth(list: DatedRate[], month: string): number | null {
  return inForce(list, month)?.value ?? null;
}

export function tiersForMonth(list: DatedTiers[], month: string): BankTier[] | null {
  return inForce(list, month)?.tiers ?? null;
}

export function tierPercentFor(tiers: BankTier[], amount: number): number {
  const hit = tiers.find((t) => amount >= t.fromAmount && (t.toAmount === null || amount < t.toAmount));
  return (hit ?? tiers[tiers.length - 1]).percent;
}
```

- [ ] **Step 4: Run — passes**

Run: `cd server && npx jest src/tax/tax-rates.spec.ts`
Expected: PASS.

- [ ] **Step 5: Register the keys in `settings.types.ts`**

Add to the `SettingKey` union and to `SettingValueMap`:

```ts
  'fees.app.payme': DatedRate[];
  'fees.app.click': DatedRate[];
  'fees.app.uzum': DatedRate[];
  'fees.integration': DatedRate[];
  'fees.qr': DatedRate[];
  'payroll.employeeWithholdingPercent': DatedRate[];
  'payroll.employerSocialPercent': DatedRate[];
  'tax.turnoverPercent': DatedRate[];
  'bank.turnoverTiers': DatedTiers[];
```

(and the same 9 strings in the `SettingKey` union). Import `DatedRate`, `DatedTiers`, `parseDatedRates`, `parseDatedTiers` from `../tax/tax-rates`. At the end of `SETTING_DEFINITIONS`:

```ts
  // Soliq va komissiyalar (spec 2026-10-25): oydan kuchga kiradigan stavkalar,
  // `TaxCostsService` kompaniya darajasida o'qiydi. Bo'sh = kiritilmagan.
  'fees.app.payme': { key: 'fees.app.payme', defaultValue: [], parse: (raw) => parseDatedRates('fees.app.payme', raw), companyLevelOnly: true },
  'fees.app.click': { key: 'fees.app.click', defaultValue: [], parse: (raw) => parseDatedRates('fees.app.click', raw), companyLevelOnly: true },
  'fees.app.uzum': { key: 'fees.app.uzum', defaultValue: [], parse: (raw) => parseDatedRates('fees.app.uzum', raw), companyLevelOnly: true },
  'fees.integration': { key: 'fees.integration', defaultValue: [], parse: (raw) => parseDatedRates('fees.integration', raw), companyLevelOnly: true },
  'fees.qr': { key: 'fees.qr', defaultValue: [], parse: (raw) => parseDatedRates('fees.qr', raw), companyLevelOnly: true },
  'payroll.employeeWithholdingPercent': { key: 'payroll.employeeWithholdingPercent', defaultValue: [], parse: (raw) => parseDatedRates('payroll.employeeWithholdingPercent', raw), companyLevelOnly: true },
  'payroll.employerSocialPercent': { key: 'payroll.employerSocialPercent', defaultValue: [], parse: (raw) => parseDatedRates('payroll.employerSocialPercent', raw), companyLevelOnly: true },
  'tax.turnoverPercent': { key: 'tax.turnoverPercent', defaultValue: [], parse: (raw) => parseDatedRates('tax.turnoverPercent', raw), companyLevelOnly: true },
  'bank.turnoverTiers': { key: 'bank.turnoverTiers', defaultValue: [], parse: (raw) => parseDatedTiers('bank.turnoverTiers', raw), companyLevelOnly: true },
```

`GET /settings/payment` returns all `SETTING_KEYS` through `getMany`: check `settings.controller.ts` `getPayment`. If it returns `getMany` unfiltered, filter the tax keys out there (`TAX_SETTING_KEYS`), so the payment page does not receive or echo them, and so `PATCH /settings/payment` refuses them (find its key whitelist; add the tax keys to the refused set if it is not a whitelist).

- [ ] **Step 6: Verify**

Run: `cd server && npx jest src/tax src/settings && npm run typecheck`
Expected: PASS. If `settings.types.spec.ts` counts keys, bump the count by 9.

- [ ] **Step 7: Commit**

```bash
cd server && npx prettier --write src/tax src/settings
git add src/tax src/settings
git commit -m "feat(tax): month-dated tax and fee rate settings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `settings.tax` permission and `/settings/tax` API

**Files:**
- Create: `server/src/tax/dto/update-tax-settings.dto.ts`, `server/src/tax/tax-settings.service.ts`, `server/src/tax/tax-settings.controller.ts`, `server/src/tax/tax.module.ts`, `server/src/tax/tax-settings.service.spec.ts`, `server/src/tax/tax-settings.controller.spec.ts`
- Modify: `server/src/app.module.ts` (import `TaxModule`), `server/src/common/permissions/permission-catalog.admin.ts` (after `'settings.payment'` at ~118-124), `permission-catalog.spec.ts` (count 70→71, `TABLE` row after `settings.payment`), `permission-allowed-roles.spec.ts` (`REVIEWED_COMPANY_WIDE_WRITES`), `route-access.snapshot.json`, `server/src/common/auth/branch-route-policy.ts`, `server/src/reports/net-profit-cache.ts`, `client/src/lib/permission-keys.ts` (after `"settings.payment"`, line ~70)

**Interfaces:**
- Consumes: Task 2 keys and parsers; `SettingsService.get` / `setMany`.
- Produces:
  - `GET /settings/tax` → `TaxSettingsView = { values: Record<TaxSettingKey, DatedRate[] | DatedTiers[]>; filled: number; total: number }`
  - `PATCH /settings/tax` body `{ values: Partial<Record<TaxSettingKey, unknown>> }` → `TaxSettingsView`
  - `TaxSettingsService.read(companyId): Promise<TaxSettingsView>`, `TaxSettingsService.loadRates(companyId): Promise<TaxRateBook>` where `type TaxRateBook = { rates: Record<TaxRateKey, DatedRate[]>; bankTiers: DatedTiers[] }`
  - `invalidateNetProfitCache(redis: RedisService | undefined, companyId: number): Promise<void>` in `net-profit-cache.ts`

- [ ] **Step 1: Write the failing service test**

```ts
// server/src/tax/tax-settings.service.spec.ts
import { BadRequestException } from '@nestjs/common';
import { TaxSettingsService } from './tax-settings.service';

describe('TaxSettingsService', () => {
  const store: Record<string, unknown> = {};
  const settings = {
    get: jest.fn((_c: number, key: string) => Promise.resolve(store[key] ?? [])),
    setMany: jest.fn((_c: number, entries: [string, unknown][]) => {
      for (const [k, v] of entries) store[k] = v;
      return Promise.resolve();
    }),
  };
  const redis = { scanStream: jest.fn(() => ({ async *[Symbol.asyncIterator]() {} })), del: jest.fn() };
  const service = new TaxSettingsService(settings as never, redis as never);

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    jest.clearAllMocks();
  });

  it('counts filled keys', async () => {
    store['tax.turnoverPercent'] = [{ fromMonth: '2026-10', value: 4 }];
    const view = await service.read(1);
    expect(view.total).toBe(9);
    expect(view.filled).toBe(1);
  });

  it('writes only tax keys, in one setMany', async () => {
    await service.update(1, { values: { 'fees.qr': [{ fromMonth: '2026-10', value: 1 }] } }, 7);
    expect(settings.setMany).toHaveBeenCalledWith(1, [['fees.qr', [{ fromMonth: '2026-10', value: 1 }]]], 7);
  });

  it('refuses a foreign key and an empty patch', async () => {
    await expect(service.update(1, { values: { 'payment.defaultModel': 'MONTHLY' } }, 7)).rejects.toThrow(BadRequestException);
    await expect(service.update(1, { values: {} }, 7)).rejects.toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run — fails**

Run: `cd server && npx jest src/tax/tax-settings.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Cache invalidation helper**

Append to `server/src/reports/net-profit-cache.ts` (and bump `NET_PROFIT_CACHE_VERSION` to `'v6'` with a history line: `v6: tax and fee costs subtracted (spec 2026-10-25).`):

```ts
/**
 * Soliq stavkasi saqlanganda o'tgan oylarning keshlangan foydasi eskiradi
 * (stavka o'tgan oydan kuchga kirishi mumkin). Kompaniyaning hamma kalitini
 * o'chiradi; Redis ishlamasa faqat log yozadi.
 */
export async function invalidateNetProfitCache(
  redis: RedisService | undefined,
  companyId: number,
): Promise<void> {
  if (!redis) return;
  try {
    const stream = redis.scanStream({ match: `rpt:np:${NET_PROFIT_CACHE_VERSION}:${companyId}:*`, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length) await redis.del(...keys);
    }
  } catch (e) {
    logger.warn(`Net profit cache invalidate failed for company ${companyId}: ${e}`);
  }
}
```

`net-profit-cache.ts` imports `RedisService` as a type only; keep it `import type`. If the file has no `logger`, add `const logger = new Logger('NetProfitCache');` (Logger is already imported at the top).

- [ ] **Step 4: DTO, service, controller, module**

```ts
// server/src/tax/dto/update-tax-settings.dto.ts
import { IsObject } from 'class-validator';

export class UpdateTaxSettingsDto {
  /** Kalit → o'sha kalitning BUTUN yangi ro'yxati. Qiymat `parseDated*` da tekshiriladi. */
  @IsObject({ message: "values obyekt bo'lishi kerak" })
  values!: Record<string, unknown>;
}
```

```ts
// server/src/tax/tax-settings.service.ts
import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { RedisService } from '../redis/redis.service';
import { invalidateNetProfitCache } from '../reports/net-profit-cache';
import type { SettingKey } from '../settings/settings.types';
import {
  BANK_TIERS_KEY,
  DatedRate,
  DatedTiers,
  TAX_RATE_KEYS,
  TAX_SETTING_KEYS,
  TaxRateKey,
  TaxSettingKey,
} from './tax-rates';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';

export type TaxRateBook = { rates: Record<TaxRateKey, DatedRate[]>; bankTiers: DatedTiers[] };
export type TaxSettingsView = {
  values: Record<TaxSettingKey, DatedRate[] | DatedTiers[]>;
  filled: number;
  total: number;
};

@Injectable()
export class TaxSettingsService {
  constructor(
    private readonly settings: SettingsService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async loadRates(companyId: number): Promise<TaxRateBook> {
    const lists = await Promise.all(TAX_RATE_KEYS.map((k) => this.settings.get(companyId, k)));
    const rates = Object.fromEntries(TAX_RATE_KEYS.map((k, i) => [k, lists[i]])) as Record<TaxRateKey, DatedRate[]>;
    const bankTiers = await this.settings.get(companyId, BANK_TIERS_KEY);
    return { rates, bankTiers };
  }

  async read(companyId: number): Promise<TaxSettingsView> {
    const { rates, bankTiers } = await this.loadRates(companyId);
    const values = { ...rates, [BANK_TIERS_KEY]: bankTiers } as TaxSettingsView['values'];
    const filled = TAX_SETTING_KEYS.filter((k) => values[k].length > 0).length;
    return { values, filled, total: TAX_SETTING_KEYS.length };
  }

  async update(companyId: number, dto: UpdateTaxSettingsDto, userId: number): Promise<TaxSettingsView> {
    const entries = Object.entries(dto.values);
    if (entries.length === 0) throw new BadRequestException("O'zgartirish yo'q");
    const foreign = entries.map(([k]) => k).filter((k) => !(TAX_SETTING_KEYS as readonly string[]).includes(k));
    if (foreign.length) throw new BadRequestException(`Noma'lum kalit: ${foreign.join(', ')}`);
    await this.settings.setMany(companyId, entries as [SettingKey, unknown][], userId);
    await invalidateNetProfitCache(this.redis, companyId);
    return this.read(companyId);
  }
}
```

```ts
// server/src/tax/tax-settings.controller.ts
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Can } from '../common/permissions/access.decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxSettingsService } from './tax-settings.service';
import { UpdateTaxSettingsDto } from './dto/update-tax-settings.dto';

@Controller('settings/tax')
@Can('settings.tax')
export class TaxSettingsController {
  constructor(private readonly tax: TaxSettingsService) {}

  @Get()
  get(@CurrentUser('companyId') companyId: number) {
    return this.tax.read(companyId);
  }

  @Patch()
  update(
    @Body() dto: UpdateTaxSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.tax.update(companyId, dto, userId);
  }
}
```

Check the real import paths of `Can` and `CurrentUser` in `settings.controller.ts` and copy them.

```ts
// server/src/tax/tax.module.ts
import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { TaxSettingsService } from './tax-settings.service';
import { TaxSettingsController } from './tax-settings.controller';

@Module({
  imports: [SettingsModule],
  controllers: [TaxSettingsController],
  providers: [TaxSettingsService],
  exports: [TaxSettingsService],
})
export class TaxModule {}
```

Register `TaxModule` in `app.module.ts`. `SettingsModule` must export `SettingsService` (check; add to `exports` if missing). `RedisModule` is global if `SettingsService` injects it without importing — confirm in `settings.module.ts`.

- [ ] **Step 5: Permission catalog**

`permission-catalog.admin.ts`, right after `'settings.payment'`:

```ts
  'settings.tax': {
    section: 'settings',
    label: 'Soliq va komissiyalar',
    defaultRoles: [],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
```

- `permission-catalog.spec.ts`: `toHaveLength(71)`; `TABLE` row `['settings.tax', '', 'DAK', { T: 'NO_PAGE' }]` right after the `settings.payment` row (copy the exact empty-default format another row uses, e.g. `settings.company`).
- `permission-allowed-roles.spec.ts` `REVIEWED_COMPANY_WIDE_WRITES`: `'settings.tax': 'PATCH /settings/tax: every tax key is companyLevelOnly; widened only so the CEO can hand the page to an accountant account',`
- `branch-route-policy.ts`: a new `COMPANY_WIDE` block (copy the `lessonRating.enabled` block's shape) with reason «Soliq va komissiyalar (spec 2026-10-25): every key is a company-level setting (`companyLevelOnly`) — one value for every branch.» and `routes: ['GET /settings/tax', 'PATCH /settings/tax']`.
- `route-access.snapshot.json`: `"GET /settings/tax": ["CEO"]`, `"PATCH /settings/tax": ["CEO"]` (keep the file's sort order).
- `client/src/lib/permission-keys.ts`: `"settings.tax",` right after `"settings.payment",`.

- [ ] **Step 6: Controller access test**

```ts
// server/src/tax/tax-settings.controller.spec.ts
import { routeAccess, defaultRolesOf } from '../common/permissions/testing';
import { TaxSettingsController } from './tax-settings.controller';

describe('TaxSettingsController access', () => {
  it.each(['get', 'update'] as const)('%s needs settings.tax, CEO by default', (handler) => {
    expect(routeAccess(TaxSettingsController, handler)).toEqual({ kind: 'can', keys: ['settings.tax'] });
    expect(defaultRolesOf(TaxSettingsController, handler)).toEqual(['CEO']);
  });
});
```

Open one existing `*.controller.spec.ts` that uses `routeAccess` and match its exact call shape before running.

- [ ] **Step 7: Verify**

Run: `cd server && npx jest src/tax src/common/permissions src/reports/net-profit-cache && npm run typecheck`
Expected: PASS.
Run: `cd client && npx vitest --config vitest.config.ts run src/lib/permission-keys.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/tax src/reports/net-profit-cache.ts src/common src/app.module.ts
cd .. && git add server/src client/src/lib/permission-keys.ts
git commit -m "feat(tax): settings.tax permission and /settings/tax endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tax cost calculation

**Files:**
- Create: `server/src/tax/fee-channel.ts`, `fee-channel.spec.ts`, `tax-costs.ts`, `tax-costs.spec.ts`, `tax-costs.service.ts`, `tax-costs.service.spec.ts`
- Modify: `server/src/tax/tax.module.ts` (provide/export `TaxCostsService`)

**Interfaces:**
- Consumes: `TaxRateBook` + `TaxSettingsService.loadRates` (Task 3), `rateForMonth`, `tiersForMonth`, `tierPercentFor` (Task 2), `isTopUpMonth` (`salary/shared/topup.ts`), `tashkentMonthRangeUtc` (`common/date/tashkent.ts`), `branchIdWhere`, `ReportBranchIds` (`common/finance/report-branch-scope.ts`).
- Produces:
  - `type FeeChannel = 'app.payme' | 'app.click' | 'app.uzum' | 'integration' | 'qr'`
  - `feeChannelOf(method: PaymentMethod, source: PaymentSource): FeeChannel | null`
  - `channelRateKey(c: FeeChannel): TaxRateKey` (`'app.payme'` → `'fees.app.payme'`, `'integration'` → `'fees.integration'`, `'qr'` → `'fees.qr'`)
  - `interface TaxCosts { providerFees: number; employerSocialTax: number; turnoverTax: number; bankFees: number; withholding: number; turnover: number; total: number; missingRates: TaxSettingKey[] }`
  - `emptyTaxCosts(): TaxCosts`, `sumTaxCosts(list: TaxCosts[]): TaxCosts`
  - `type PaymentGroup = { branchId: number | null; method: PaymentMethod; source: PaymentSource; amount: number; storedFee: number | null }` (`storedFee` = sum of `providerFee` of the group's rows that carry one; `amount` = sum of ALL rows; the service queries rows with and without a stored fee separately)
  - `computePaymentCosts(input: { groups: PaymentGroup[]; companyTurnover: number; month: string; book: TaxRateBook }): Pick<TaxCosts, 'providerFees' | 'turnoverTax' | 'bankFees' | 'turnover'> & { missing: TaxSettingKey[] }`
  - `type PayrollRow = { userId: number; earned: number }`
  - `officialSplit(earned: number, officialSalary: number, withholdingPct: number | null, socialPct: number | null): { official: number; withholding: number; employerSocial: number }`
  - `computePayrollTax(input: { rows: PayrollRow[]; officialByUser: Map<number, number>; month: string; book: TaxRateBook }): Pick<TaxCosts, 'employerSocialTax' | 'withholding'> & { missing: TaxSettingKey[] }`
  - `payrollRowsOf(salaries: any, month: string): PayrollRow[]` — teacher rows `data[]` (`isTopUpMonth(month) ? fullDeserved : covered`, null → 0) + staff rows `staff[]` (`monthly`).
  - `TaxCostsService.forMonth(companyId: number, month: string, branchIds: ReportBranchIds, salaries: any): Promise<TaxCosts>`

- [ ] **Step 1: Failing tests for the channel map**

```ts
// server/src/tax/fee-channel.spec.ts
import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { feeChannelOf, channelRateKey } from './fee-channel';

describe('feeChannelOf', () => {
  it.each([
    [M.QR, S.ADMIN_MANUAL, 'qr'],
    [M.PAYME, S.GATEWAY_WEBHOOK, 'integration'],
    [M.CLICK, S.MANUAL_ATTACH, 'integration'],
    [M.UZUM, S.STUDENT_PORTAL, 'integration'],
    [M.PAYME, S.ADMIN_MANUAL, 'app.payme'],
    [M.UZUM, S.ADMIN_MANUAL, 'app.uzum'],
    [M.CASH, S.ADMIN_MANUAL, null],
    [M.TRANSFER, S.ADMIN_MANUAL, null],
  ])('%s via %s → %s', (method, source, expected) => {
    expect(feeChannelOf(method, source)).toBe(expected);
  });
  it('maps a channel to its setting key', () => {
    expect(channelRateKey('app.click')).toBe('fees.app.click');
    expect(channelRateKey('qr')).toBe('fees.qr');
  });
});
```

- [ ] **Step 2: Implement `fee-channel.ts`**

```ts
// server/src/tax/fee-channel.ts
import { PaymentMethod, PaymentSource } from '@prisma/client';
import type { TaxRateKey } from './tax-rates';

export type FeeChannel = 'app.payme' | 'app.click' | 'app.uzum' | 'integration' | 'qr';

const APP: Partial<Record<PaymentMethod, FeeChannel>> = {
  PAYME: 'app.payme',
  CLICK: 'app.click',
  UZUM: 'app.uzum',
};

/**
 * To'lov qaysi komissiya kanalidan o'tgani (spec 2026-10-25 «Kanallar xaritasi»).
 * Admin qo'lda kiritgan Payme/Click/Uzum = o'quvchi ilovada o'zi to'lagan;
 * ulanish orqali kelgani (webhook yoki biriktirish) = integratsiya.
 */
export function feeChannelOf(method: PaymentMethod, source: PaymentSource): FeeChannel | null {
  if (method === PaymentMethod.QR) return 'qr';
  const app = APP[method];
  if (!app) return null;
  return source === PaymentSource.ADMIN_MANUAL ? app : 'integration';
}

export function channelRateKey(c: FeeChannel): TaxRateKey {
  return `fees.${c}` as TaxRateKey;
}
```

Run: `cd server && npx jest src/tax/fee-channel.spec.ts` — Expected: PASS.

- [ ] **Step 3: Failing tests for the pure cost functions**

```ts
// server/src/tax/tax-costs.spec.ts
import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { computePaymentCosts, computePayrollTax, officialSplit, sumTaxCosts, emptyTaxCosts, payrollRowsOf } from './tax-costs';
import type { TaxRateBook } from './tax-settings.service';
import { TAX_RATE_KEYS } from './tax-rates';

const r = (value: number) => [{ fromMonth: '2026-10', value }];
function book(over: Partial<Record<string, number>> = {}, tiers = true): TaxRateBook {
  const rates = Object.fromEntries(TAX_RATE_KEYS.map((k) => [k, over[k] === undefined ? [] : r(over[k]!)])) as TaxRateBook['rates'];
  return {
    rates,
    bankTiers: tiers
      ? [{ fromMonth: '2026-10', tiers: [{ fromAmount: 0, toAmount: 100_000_000, percent: 0.5 }, { fromAmount: 100_000_000, toAmount: null, percent: 0.2 }] }]
      : [],
  };
}

describe('officialSplit', () => {
  it('2 000 000 rasmiy → 240 000 ushlanma va 240 000 ijtimoiy soliq', () => {
    expect(officialSplit(2_500_000, 2_000_000, 12, 12)).toEqual({ official: 2_000_000, withholding: 240_000, employerSocial: 240_000 });
  });
  it('rasmiy hisoblangandan katta bo‘lsa hisoblangan olinadi', () => {
    expect(officialSplit(1_000_000, 2_000_000, 12, 12).official).toBe(1_000_000);
  });
  it('stavka yo‘q — 0', () => {
    expect(officialSplit(1_000_000, 1_000_000, null, null)).toEqual({ official: 1_000_000, withholding: 0, employerSocial: 0 });
  });
});

describe('computePayrollTax', () => {
  it('sums employer social tax only for users with an official salary', () => {
    const out = computePayrollTax({
      rows: [{ userId: 1, earned: 2_000_000 }, { userId: 2, earned: 3_000_000 }],
      officialByUser: new Map([[1, 2_000_000]]),
      month: '2026-10',
      book: book({ 'payroll.employerSocialPercent': 12, 'payroll.employeeWithholdingPercent': 12 }),
    });
    expect(out).toEqual({ employerSocialTax: 240_000, withholding: 240_000, missing: [] });
  });
  it('lists a missing rate only when someone has an official salary', () => {
    const none = computePayrollTax({ rows: [{ userId: 1, earned: 10 }], officialByUser: new Map(), month: '2026-10', book: book() });
    expect(none.missing).toEqual([]);
    const some = computePayrollTax({ rows: [{ userId: 1, earned: 10 }], officialByUser: new Map([[1, 10]]), month: '2026-10', book: book() });
    expect(some.missing).toEqual(['payroll.employeeWithholdingPercent', 'payroll.employerSocialPercent']);
  });
});

describe('computePaymentCosts', () => {
  const groups = [
    { branchId: 1, method: M.PAYME, source: S.GATEWAY_WEBHOOK, amount: 10_000_000, storedFee: null },
    { branchId: 1, method: M.PAYME, source: S.ADMIN_MANUAL, amount: 4_000_000, storedFee: null },
    { branchId: 1, method: M.QR, source: S.ADMIN_MANUAL, amount: 2_000_000, storedFee: null },
    { branchId: 1, method: M.TRANSFER, source: S.ADMIN_MANUAL, amount: 4_000_000, storedFee: null },
    { branchId: 1, method: M.CLICK, source: S.MANUAL_ATTACH, amount: 1_000_000, storedFee: 25_000 },
  ];

  it('fees per channel, turnover tax and bank fee', () => {
    const out = computePaymentCosts({
      groups,
      companyTurnover: 21_000_000,
      month: '2026-10',
      book: book({ 'fees.integration': 2.5, 'fees.app.payme': 2, 'fees.qr': 1, 'tax.turnoverPercent': 4 }),
    });
    // integration 250 000 + app 80 000 + qr 20 000 + stored 25 000
    expect(out.providerFees).toBe(375_000);
    expect(out.turnover).toBe(21_000_000);
    expect(out.turnoverTax).toBe(840_000);
    expect(out.bankFees).toBe(105_000); // 0.5% of company turnover, all in scope
    expect(out.missing).toEqual([]);
  });

  it('lists only used channels without a rate', () => {
    const out = computePaymentCosts({ groups: groups.slice(2, 3), companyTurnover: 2_000_000, month: '2026-10', book: book({}, false) });
    expect(out.missing).toEqual(['fees.qr', 'tax.turnoverPercent', 'bank.turnoverTiers']);
    expect(out.providerFees).toBe(0);
  });

  it('splits the bank fee by the scope’s turnover share', () => {
    const out = computePaymentCosts({
      groups: [{ branchId: 2, method: M.TRANSFER, source: S.ADMIN_MANUAL, amount: 5_000_000, storedFee: null }],
      companyTurnover: 20_000_000,
      month: '2026-10',
      book: book(),
    });
    expect(out.bankFees).toBe(25_000); // 0.5% × 20 mln × 5/20
  });
});

describe('payrollRowsOf / sumTaxCosts', () => {
  it('reads teacher and staff rows', () => {
    const rows = payrollRowsOf(
      { data: [{ user: { id: 1 }, fullDeserved: 900, covered: 500 }], staff: [{ user: { id: 2 }, monthly: 300 }] },
      '2026-10',
    );
    expect(rows).toEqual([{ userId: 1, earned: 900 }, { userId: 2, earned: 300 }]);
  });
  it('adds costs and merges missing keys', () => {
    const a = { ...emptyTaxCosts(), providerFees: 1, total: 1, missingRates: ['fees.qr' as const] };
    const b = { ...emptyTaxCosts(), bankFees: 2, total: 2, missingRates: ['fees.qr' as const, 'bank.turnoverTiers' as const] };
    expect(sumTaxCosts([a, b])).toEqual({ ...emptyTaxCosts(), providerFees: 1, bankFees: 2, total: 3, missingRates: ['fees.qr', 'bank.turnoverTiers'] });
  });
});
```

Run: `cd server && npx jest src/tax/tax-costs.spec.ts` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement `tax-costs.ts`**

```ts
// server/src/tax/tax-costs.ts
import { PaymentMethod, PaymentSource } from '@prisma/client';
import { isTopUpMonth } from '../salary/shared/topup';
import { channelRateKey, feeChannelOf } from './fee-channel';
import { BANK_TIERS_KEY, rateForMonth, TaxSettingKey, tierPercentFor, tiersForMonth } from './tax-rates';
import type { TaxRateBook } from './tax-settings.service';

/** Sof foydadan ayriladigan soliq va komissiyalar (spec 2026-10-25). `withholding` faqat ma'lumot. */
export interface TaxCosts {
  providerFees: number;
  employerSocialTax: number;
  turnoverTax: number;
  bankFees: number;
  withholding: number;
  turnover: number;
  total: number;
  missingRates: TaxSettingKey[];
}

export function emptyTaxCosts(): TaxCosts {
  return { providerFees: 0, employerSocialTax: 0, turnoverTax: 0, bankFees: 0, withholding: 0, turnover: 0, total: 0, missingRates: [] };
}

export function sumTaxCosts(list: TaxCosts[]): TaxCosts {
  const out = emptyTaxCosts();
  const missing = new Set<TaxSettingKey>();
  for (const t of list) {
    out.providerFees += t.providerFees;
    out.employerSocialTax += t.employerSocialTax;
    out.turnoverTax += t.turnoverTax;
    out.bankFees += t.bankFees;
    out.withholding += t.withholding;
    out.turnover += t.turnover;
    out.total += t.total;
    t.missingRates.forEach((k) => missing.add(k));
  }
  out.missingRates = [...missing];
  return out;
}

const pct = (amount: number, percent: number) => Math.round((amount * percent) / 100);

export type PaymentGroup = {
  branchId: number | null;
  method: PaymentMethod;
  source: PaymentSource;
  amount: number;
  storedFee: number | null;
};

export function computePaymentCosts(input: {
  groups: PaymentGroup[];
  companyTurnover: number;
  month: string;
  book: TaxRateBook;
}) {
  const { groups, companyTurnover, month, book } = input;
  const missing = new Set<TaxSettingKey>();
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
    const rate = rateForMonth(book.rates[key], month);
    if (rate === null) missing.add(key);
    else providerFees += pct(g.amount, rate);
  }

  let turnoverTax = 0;
  let bankFees = 0;
  if (turnover > 0) {
    const taxRate = rateForMonth(book.rates['tax.turnoverPercent'], month);
    if (taxRate === null) missing.add('tax.turnoverPercent');
    else turnoverTax = pct(turnover, taxRate);

    const tiers = tiersForMonth(book.bankTiers, month);
    if (tiers === null) missing.add(BANK_TIERS_KEY);
    else if (companyTurnover > 0) {
      // ponytail: bitta yaxlitlash ulush bo'yicha; filiallar yig'indisi kompaniyadan 1 so'm farq qilishi mumkin.
      const companyFee = (companyTurnover * tierPercentFor(tiers, companyTurnover)) / 100;
      bankFees = Math.round((companyFee * turnover) / companyTurnover);
    }
  }
  return { providerFees, turnoverTax, bankFees, turnover, missing: [...missing] };
}

export type PayrollRow = { userId: number; earned: number };

export function officialSplit(earned: number, officialSalary: number, withholdingPct: number | null, socialPct: number | null) {
  const official = Math.max(0, Math.min(officialSalary, earned));
  return {
    official,
    withholding: withholdingPct === null ? 0 : pct(official, withholdingPct),
    employerSocial: socialPct === null ? 0 : pct(official, socialPct),
  };
}

export function computePayrollTax(input: {
  rows: PayrollRow[];
  officialByUser: Map<number, number>;
  month: string;
  book: TaxRateBook;
}) {
  const w = rateForMonth(input.book.rates['payroll.employeeWithholdingPercent'], input.month);
  const s = rateForMonth(input.book.rates['payroll.employerSocialPercent'], input.month);
  let employerSocialTax = 0;
  let withholding = 0;
  let anyOfficial = false;
  for (const row of input.rows) {
    const split = officialSplit(row.earned, input.officialByUser.get(row.userId) ?? 0, w, s);
    if (split.official > 0) anyOfficial = true;
    employerSocialTax += split.employerSocial;
    withholding += split.withholding;
  }
  const missing: TaxSettingKey[] = [];
  if (anyOfficial && w === null) missing.push('payroll.employeeWithholdingPercent');
  if (anyOfficial && s === null) missing.push('payroll.employerSocialPercent');
  return { employerSocialTax, withholding, missing };
}

/** `getSalaryMonthly` natijasidan har xodimning shu oy hisoblangan oyligi (sof foyda bilan bir xil asos). */
export function payrollRowsOf(salaries: any, month: string): PayrollRow[] {
  const topUp = isTopUpMonth(month);
  const teachers: PayrollRow[] = (salaries?.data ?? []).map((t: any) => ({
    userId: t.user.id,
    earned: (topUp ? t.fullDeserved : t.covered) ?? 0,
  }));
  const staff: PayrollRow[] = (salaries?.staff ?? []).map((s: any) => ({ userId: s.user.id, earned: s.monthly ?? 0 }));
  return [...teachers, ...staff];
}
```

Run: `cd server && npx jest src/tax/tax-costs.spec.ts` — Expected: PASS.

- [ ] **Step 5: Failing service test**

```ts
// server/src/tax/tax-costs.service.spec.ts
import { PaymentMethod as M, PaymentSource as S } from '@prisma/client';
import { TaxCostsService } from './tax-costs.service';

describe('TaxCostsService.forMonth', () => {
  const prisma = {
    payment: {
      groupBy: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 10_000_000 } }),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 5, officialSalary: 2_000_000 }]) },
  };
  const tax = {
    loadRates: jest.fn().mockResolvedValue({
      rates: {
        'fees.app.payme': [], 'fees.app.click': [], 'fees.app.uzum': [],
        'fees.integration': [{ fromMonth: '2026-10', value: 2.5 }], 'fees.qr': [],
        'payroll.employeeWithholdingPercent': [{ fromMonth: '2026-10', value: 12 }],
        'payroll.employerSocialPercent': [{ fromMonth: '2026-10', value: 12 }],
        'tax.turnoverPercent': [{ fromMonth: '2026-10', value: 4 }],
      },
      bankTiers: [{ fromMonth: '2026-10', tiers: [{ fromAmount: 0, toAmount: null, percent: 0.1 }] }],
    }),
  };
  const service = new TaxCostsService(prisma as never, tax as never);

  it('combines payments, turnover and payroll for the month', async () => {
    prisma.payment.groupBy
      .mockResolvedValueOnce([{ branchId: 1, method: M.PAYME, source: S.GATEWAY_WEBHOOK, _sum: { amount: 10_000_000 } }]) // rows without stored fee
      .mockResolvedValueOnce([]); // rows with stored fee
    const out = await service.forMonth(1, '2026-10', null, {
      data: [{ user: { id: 5 }, fullDeserved: 2_500_000, covered: 2_000_000 }],
      staff: [],
    });
    expect(out).toEqual({
      providerFees: 250_000,
      turnoverTax: 400_000,
      bankFees: 10_000,
      employerSocialTax: 240_000,
      withholding: 240_000,
      turnover: 10_000_000,
      total: 900_000,
      missingRates: [],
    });
    expect(prisma.payment.groupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ companyId: 1, status: 'COMPLETED', providerFee: null }),
    );
  });
});
```

- [ ] **Step 6: Implement the service**

```ts
// server/src/tax/tax-costs.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { tashkentMonthRangeUtc } from '../common/date/tashkent';
import { branchIdWhere, ReportBranchIds } from '../common/finance/report-branch-scope';
import { TaxSettingsService } from './tax-settings.service';
import { computePaymentCosts, computePayrollTax, PaymentGroup, payrollRowsOf, TaxCosts } from './tax-costs';

@Injectable()
export class TaxCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tax: TaxSettingsService,
  ) {}

  /** Bir oyning soliq va komissiyalari, doira bo'yicha. Pul tushgan oy — `Payment.createdAt` (Toshkent). */
  async forMonth(companyId: number, month: string, branchIds: ReportBranchIds, salaries: any): Promise<TaxCosts> {
    const createdAt = tashkentMonthRangeUtc(month);
    const base = { companyId, status: 'COMPLETED' as const, createdAt };
    const scoped = { ...base, ...branchIdWhere(branchIds) };
    const by = ['branchId', 'method', 'source'] as const;

    const payrollRows = payrollRowsOf(salaries, month);
    const [noFee, withFee, companyAgg, users, book] = await Promise.all([
      this.prisma.payment.groupBy({ by: [...by], where: { ...scoped, providerFee: null }, _sum: { amount: true } }),
      this.prisma.payment.groupBy({ by: [...by], where: { ...scoped, providerFee: { not: null } }, _sum: { amount: true, providerFee: true } }),
      this.prisma.payment.aggregate({ where: { ...base, method: { not: 'CASH' } }, _sum: { amount: true } }),
      payrollRows.length
        ? this.prisma.user.findMany({
            where: { companyId, id: { in: payrollRows.map((r) => r.userId) }, officialSalary: { gt: 0 } },
            select: { id: true, officialSalary: true },
          })
        : Promise.resolve([]),
      this.tax.loadRates(companyId),
    ]);

    const groups: PaymentGroup[] = [
      ...noFee.map((g) => ({ branchId: g.branchId, method: g.method, source: g.source, amount: g._sum.amount ?? 0, storedFee: null })),
      ...withFee.map((g) => ({ branchId: g.branchId, method: g.method, source: g.source, amount: g._sum.amount ?? 0, storedFee: g._sum.providerFee ?? 0 })),
    ];
    const pay = computePaymentCosts({ groups, companyTurnover: companyAgg._sum.amount ?? 0, month, book });
    const roll = computePayrollTax({
      rows: payrollRows,
      officialByUser: new Map(users.map((u) => [u.id, u.officialSalary ?? 0])),
      month,
      book,
    });
    return {
      providerFees: pay.providerFees,
      turnoverTax: pay.turnoverTax,
      bankFees: pay.bankFees,
      employerSocialTax: roll.employerSocialTax,
      withholding: roll.withholding,
      turnover: pay.turnover,
      total: pay.providerFees + pay.turnoverTax + pay.bankFees + roll.employerSocialTax,
      missingRates: [...pay.missing, ...roll.missing],
    };
  }
}
```

`officialSalary` exists only after Task 7's migration. To keep this task green on its own, Task 7's schema change (Step 3 of Task 7: the `User.officialSalary` column + migration + `prisma generate`) is done FIRST, at the start of this task. Move that one step here; Task 7 then only adds the DTO/form/dialog. The `user.findMany` mock in the test does not care.

Add `TaxCostsService` to `TaxModule` `providers` and `exports`.

- [ ] **Step 7: Verify**

Run: `cd server && npx jest src/tax && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/tax prisma/schema.prisma
cd .. && git add server/src/tax server/prisma
git commit -m "feat(tax): compute monthly fees, turnover tax, bank fee and payroll tax

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Subtract tax costs in the canonical net profit

**Files:**
- Modify: `server/src/reports/reports-excel.helpers.ts:117-253` (`NetProfit`, `buildNetProfit`)
- Modify: `server/src/reports/reports.service.ts:188-245` (`assembleMonthlyNetProfit`), constructor (inject `TaxCostsService`), and `reports.module.ts` (import `TaxModule`)
- Modify: `server/src/reports/reports-excel.workbook-input.ts:95-140`, `server/src/reports/reports-excel.sheets.ts:38-147`
- Test: `server/src/reports/reports-excel.helpers.spec.ts` (extend; create the `buildNetProfit` describe if absent), `server/src/reports/reports.service.spec.ts` (the assemble test — mock `TaxCostsService`)

**Interfaces:**
- Consumes: `TaxCosts`, `emptyTaxCosts`, `sumTaxCosts` (Task 4), `TaxCostsService.forMonth`.
- Produces:
  - `buildNetProfit(pl, salaries, outflows, month?, recognizedRevenue?, balanceWithdrawals = 0, taxes: TaxCosts | null = null): NetProfit`
  - `NetProfit` gains `taxes: TaxCosts` (zeros when null) and `memo` LOSES `providerFees` → `memo: { writeOffs: number; advances: number }`.
  - `netProfit = revenue + withdrawn − teacherSalary − adminSalary − operatingExpenses − refunds − taxes.total`
  - `assembleMonthlyNetProfit` returns `{ ..., taxes, netProfit }`.

- [ ] **Step 1: Failing test**

```ts
// in reports-excel.helpers.spec.ts
import { buildNetProfit } from './reports-excel.helpers';
import { emptyTaxCosts } from '../tax/tax-costs';

describe('buildNetProfit with taxes', () => {
  const pl = { operatingExpenses: { byCategory: [{ amount: 100 }], adminSalaries: 0 }, costOfServices: { teacherSalaries: 0 } };
  it('subtracts taxes.total and carries the breakdown', () => {
    const taxes = { ...emptyTaxCosts(), providerFees: 30, turnoverTax: 40, total: 70, missingRates: ['bank.turnoverTiers' as const] };
    const np = buildNetProfit(pl, { totals: {}, staffTotals: {} }, { refunds: 0 }, '2026-10', 1000, 0, taxes);
    expect(np.netProfit).toBe(1000 - 100 - 70);
    expect(np.taxes).toBe(taxes);
    expect(np.memo).toEqual({ writeOffs: 0, advances: 0 });
  });
  it('treats null taxes as zero', () => {
    const np = buildNetProfit(pl, { totals: {}, staffTotals: {} }, null, '2026-10', 1000);
    expect(np.netProfit).toBe(900);
    expect(np.taxes).toEqual(emptyTaxCosts());
  });
});
```

Run: `cd server && npx jest src/reports/reports-excel.helpers.spec.ts` — Expected: FAIL.

- [ ] **Step 2: Change `buildNetProfit`**

- Add `import { TaxCosts, emptyTaxCosts } from '../tax/tax-costs';`
- `NetProfit`: add `/** Soliq va komissiyalar (spec 2026-10-25), ayriladi. */ taxes: TaxCosts;` and change `memo` to `{ writeOffs: number; advances: number }`.
- Signature: add `taxes: TaxCosts | null = null` as the last parameter. Inside: `const tax = taxes ?? emptyTaxCosts();`, subtract `tax.total` in `netProfit`, return `taxes: tax`, and drop `providerFees` from `memo`. Leave `outflows.providerFees` in the parameter type (callers still pass it) but stop reading it; update the doc comment formula with `− Soliq va komissiyalar`.

Run the test — Expected: PASS.

- [ ] **Step 3: `assembleMonthlyNetProfit`**

Inject `private readonly taxCosts: TaxCostsService` into `ReportsService` (import `TaxModule` into `ReportsModule`; if that makes a cycle, use `forwardRef` only after checking `TaxModule` imports nothing from reports except the cache helper — it imports the plain function `invalidateNetProfitCache`, not a module, so no cycle). After the existing `Promise.all`:

```ts
    const taxes = await this.taxCosts.forMonth(companyId, month, branchIds, salaries);
    return {
      month, lessons, salaries, profitLoss, outflows, withdrawals, taxes,
      netProfit: buildNetProfit(profitLoss, salaries, outflows, month, recognizedRevenue, withdrawals.total, taxes),
    };
```

(Sequential after `salaries` because `forMonth` needs it.) In `reports.service.spec.ts` add `{ provide: TaxCostsService, useValue: { forMonth: jest.fn().mockResolvedValue(emptyTaxCosts()) } }` wherever `ReportsService` is built, and one assertion that `forMonth` got `(companyId, month, branchIds, salaries)`.

- [ ] **Step 4: Excel workbook input**

`reports-excel.workbook-input.ts`: the function there needs `TaxCostsService` — it receives `reports: ReportsService`; add a `taxCosts: TaxCostsService` argument threaded from `ReportsExcelService` (inject it there). Single month:

```ts
      const taxes = await taxCosts.forMonth(companyId, months[0] ?? args.monthStr, args.branchIds, args.salaries);
      np: buildNetProfit(args.pl, args.salaries, args.outflows, months[0] ?? args.monthStr, recognizedRevenue, withdrawals.total, taxes),
```

Multi-month: `const taxes = sumTaxCosts(await Promise.all(perMonth.map((p) => taxCosts.forMonth(companyId, p.month, args.branchIds, p.salaries))));` and pass it as the last argument. Use the scope variable the file already uses for `withdrawals` (read the top of the function for its exact name).

- [ ] **Step 5: Excel «Sof foyda» sheet**

In `netProfitSheet`, after the `Qaytarishlar` row and before `=  SOF FOYDA`:

```ts
  kvRow(ws, "−  To'lov komissiyasi", np.taxes.providerFees, 'Payme/Click/Uzum, integratsiya, QR');
  kvRow(ws, '−  Ijtimoiy soliq (korxona)', np.taxes.employerSocialTax, 'Rasmiy oylikdan');
  kvRow(ws, '−  Aylanma solig‘i', np.taxes.turnoverTax, 'Naqd bo‘lmagan tushumdan');
  kvRow(ws, '−  Bank xarajati', np.taxes.bankFees, 'Aylanmaga qarab');
```

Remove the memo row for gateway fees (it read `np.memo.providerFees`). After the `Sof marja` row, when `np.taxes.missingRates.length > 0`, add `kvRow(ws, 'Diqqat: hisob to‘liq emas', '', \`Stavka kiritilmagan: ${np.taxes.missingRates.join(', ')}\`)` — match `kvRow`'s actual signature (read it in `reports-excel.helpers.ts`). Update the `sheetNotes` formula text. Use straight `'` in Uzbek words if the file does; keep whatever apostrophe the neighbouring rows use.

- [ ] **Step 6: Fix every other `NetProfit` reader**

Run: `cd server && npm run typecheck`
Fix each error: anything reading `memo.providerFees` (Excel helpers `reports-excel.helpers.ts:240` default, summary/reconciliation sheets) — remove the field or read `taxes.providerFees`. The Tekshiruv footing that re-adds `np` fields must subtract `np.taxes.total` too, or it reports a false mismatch; find it with `grep -rn "netProfit" src/reports/reports-excel.*sheet*.ts`.

- [ ] **Step 7: Verify**

Run: `cd server && npx jest src/reports src/tax && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/reports src/tax
git add src/reports src/tax
git commit -m "feat(reports): subtract tax and fee costs from the canonical net profit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Show taxes on the Foyda card, dashboard and Telegram; stop double-counting tax in forecasts

**Files:**
- Modify: `server/src/reports/reports-profit-composition.service.ts:30-73,197-238,269-317`
- Modify: `server/src/reports/profit-composition.ts` (`missingRecurringExpenses`), `server/src/expenses/expenses-month.service.ts` (its caller)
- Modify: `server/src/dashboard/dashboard-charts.service.ts:198-229`
- Modify: `server/src/telegram-groups/telegram-group-daily-report.service.ts:389,800-831` (+ where the canonical figure is printed)
- Modify (client): `components/payments/overview/types.ts:86-99`, `overview-math.ts:59-71`, `profit-card.tsx`, `profit-dialog.tsx`, `components/dashboard/dashboard-charts-types.ts`, `components/dashboard/chart-breakdown-rows.ts:26-42`
- Tests: the matching `*.spec.ts` / `*.test.ts` next to each file

**Interfaces:**
- Consumes: `NetProfit.taxes` (Task 5).
- Produces:
  - Profit composition response gains `taxes: { providerFees: number; employerSocialTax: number; turnoverTax: number; bankFees: number; total: number; missingRates: string[] }`.
  - Dashboard breakdown gains `taxes: number` (= `np.taxes.total`) and `missingRates: string[]`.
  - `missingRecurringExpenses(..., opts?: { skipTaxes?: boolean })`.

- [ ] **Step 1: Composition — failing test**

In `reports-profit-composition.service.spec.ts`, make the mocked `assembleMonthlyNetProfit` return a `netProfit` with `taxes: { ...emptyTaxCosts(), providerFees: 10, total: 10, missingRates: ['fees.qr'] }` and assert:

```ts
    expect(result.taxes).toEqual({ providerFees: 10, employerSocialTax: 0, turnoverTax: 0, bankFees: 0, total: 10, missingRates: ['fees.qr'] });
```

Run — Expected: FAIL.

- [ ] **Step 2: Composition — implement**

In the return block (~269-317) add:

```ts
      taxes: {
        providerFees: np.taxes.providerFees,
        employerSocialTax: np.taxes.employerSocialTax,
        turnoverTax: np.taxes.turnoverTax,
        bankFees: np.taxes.bankFees,
        total: np.taxes.total,
        missingRates: np.taxes.missingRates,
      },
```

Add the field to the response type (~30-73). **Forecast:** the forecast (~197-238) subtracts last month's TAXES via `missingRecurringExpenses`. When the month has `tax.turnoverPercent` in force, the turnover tax is already automatic, so pass `{ skipTaxes: true }`. Get the flag from the rate book: inject `TaxSettingsService`, `const book = await this.taxSettings.loadRates(companyId); const skipTaxes = rateForMonth(book.rates['tax.turnoverPercent'], month) !== null;`. Also scale the forecast's remaining-revenue part: subtract `np.taxes.total` only once (it is inside `np.netProfit` already) — do NOT add a forecast for future taxes (YAGNI; write `// ponytail: kelgusi kunlar soliq'i prognoz qilinmaydi, kerak bo'lsa aylanma ulushidan` next to the forecast).

- [ ] **Step 3: `missingRecurringExpenses` skip**

Read `profit-composition.ts`. Add an optional last parameter `opts: { skipTaxes?: boolean } = {}`; when `skipTaxes`, drop the `TAXES` key (including `OTHER` rows `recurringKeyOf` reads as tax) from the result. Test in `profit-composition.spec.ts`:

```ts
  it('skips taxes when the turnover tax is automatic', () => {
    const out = missingRecurringExpenses(/* existing fixture with a last-month TAXES row */, { skipTaxes: true });
    expect(out.find((m) => m.key === 'TAXES')).toBeUndefined();
  });
```

(Use the fixture and result shape of the spec's existing TAXES test.) In `expenses-month.service.ts` `missingByBranch`, load the rate book once (inject `TaxSettingsService`; import `TaxModule` into `ExpensesModule`) and pass the same `skipTaxes` for the current month. Its `expenses-month.service.spec.ts` gets the provider mock `{ loadRates: jest.fn().mockResolvedValue({ rates: { 'tax.turnoverPercent': [] }, bankTiers: [] }) }` — extend `rates` with every key if the code iterates them.

- [ ] **Step 4: Dashboard**

`dashboard-charts.service.ts` `breakdown`: add `taxes: np.taxes.total, missingRates: np.taxes.missingRates`. Client `dashboard-charts-types.ts` `ChartProfitBreakdown`: `taxes: number; missingRates: string[];`. `chart-breakdown-rows.ts`: add row key `"taxes"` labelled «Soliq va komissiyalar» between `refunds` and `netProfit`, shown only when `taxes !== 0` (copy how `refunds` is conditionally included, if it is). Extend its `.test.ts` with one case `taxes: 50` → a row `{ key: "taxes", amount: 50 }` (match the existing assertion style).

- [ ] **Step 5: Foyda card (client)**

- `types.ts` `ProfitComposition`: `taxes: { providerFees: number; employerSocialTax: number; turnoverTax: number; bankFees: number; total: number; missingRates: string[] };`
- `overview-math.ts` `profitLines`, after refunds:

```ts
  ...(c.taxes.providerFees !== 0 ? [{ label: "To'lov komissiyasi", amount: -c.taxes.providerFees }] : []),
  ...(c.taxes.employerSocialTax !== 0 ? [{ label: "Ijtimoiy soliq", amount: -c.taxes.employerSocialTax }] : []),
  ...(c.taxes.turnoverTax !== 0 ? [{ label: "Aylanma solig'i", amount: -c.taxes.turnoverTax }] : []),
  ...(c.taxes.bankFees !== 0 ? [{ label: "Bank xarajati", amount: -c.taxes.bankFees }] : []),
```

- `profit-card.tsx`: `spent` adds `c.taxes.total`.
- `profit-dialog.tsx`: when `c.taxes.missingRates.length > 0`, an amber line under the equation: «Hisob to'liq emas: {n} ta stavka kiritilmagan» with a link `/settings/tax` (render the link only if `can("settings.tax")`; use the page's existing permission hook).
- Extend `overview-math` tests (find with `ls client/src/components/payments/overview/*.test.ts`) with one case asserting the four lines.

- [ ] **Step 6: Telegram 21:00**

`computeCanonicalNetProfit` returns `Promise<{ netProfit: number; missingRates: string[] } | null>` (`return { netProfit: np.netProfit, missingRates: np.taxes.missingRates };`). Update the call at line 389 and the place that prints `Sof foyda` (find it: `grep -n "Sof foyda" src/telegram-groups/telegram-group-daily-report.service.ts src/telegram-groups/*render*.ts`): print `.netProfit` as before, and when `missingRates.length > 0` add the next line `⚠️ Hisob to'liq emas: soliq stavkasi kiritilmagan`. The group snapshot test (`telegram-group-daily-report.service.spec.ts`) must stay byte-identical for the no-missing case — the snapshot fixtures mock `getMonthlyNetProfit`; give their mock `taxes: emptyTaxCosts()`. Add one new case with `missingRates: ['fees.qr']` asserting the warning line. Never update an existing snapshot to make this pass.

- [ ] **Step 7: Verify**

Run: `cd server && npx jest src/reports src/expenses src/dashboard src/telegram-groups && npm run typecheck`
Expected: PASS.
Run: `cd client && npx tsc --noEmit -p . && npx vitest --config vitest.config.ts run src/components/payments/overview src/components/dashboard`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/reports src/expenses src/dashboard src/telegram-groups
cd .. && git add server/src client/src/components
git commit -m "feat(reports): show tax lines on Foyda card, dashboard and Telegram

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Official salary field and the pay dialog split

**Files:**
- Modify: `server/prisma/schema.prisma` (`model User`, ~line 366) + Create `server/prisma/migrations/20261025130000_user_official_salary/migration.sql` — **done at the start of Task 4** (see Task 4 Step 6)
- Modify: `server/src/users/dto/create-user.dto.ts`, `server/src/users/dto/update-user.dto.ts`, `server/src/users/users.service.ts` (create/update data mapping + read select gated like `balance`)
- Modify: `server/src/salary/salary-monthly-detail.service.ts` (`getDetail`)
- Modify (client): `components/settings/edit-employee-form.tsx`, `components/payments/salary/salary-pay-dialog.tsx`
- Tests: `users.service.spec.ts`, `salary-monthly-detail.service.spec.ts`

**Interfaces:**
- Consumes: `officialSplit` (Task 4), `TaxSettingsService.loadRates`, `rateForMonth`.
- Produces:
  - `User.officialSalary Int?` (so'm; null/0 = all cash)
  - `CreateUserDto.officialSalary?`, `UpdateUserDto.officialSalary?`: `@IsOptional() @IsInt() @Min(0)`
  - Detail response gains `official: { official: number; withholding: number; employerSocial: number; toHand: number } | null` (null when `officialSalary` is 0/null)

- [ ] **Step 1: Schema + migration (if not already done in Task 4)**

```prisma
  /// Rasmiy (bank orqali) oylik summasi, so'm. Qolgani naqd. Soliq faqat shu qismdan (spec 2026-10-25).
  officialSalary Int?
```

```sql
-- Xodimning rasmiy oylik summasi (spec 2026-10-25). null = hammasi naqd.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "officialSalary" INTEGER;
```

Run: `npx prisma generate`

- [ ] **Step 2: Failing tests (users)**

In `users.service.spec.ts`, following the existing `updateUser` tests:

```ts
  it('writes officialSalary only for a caller with salary.view', async () => {
    // permissions mock: fakePermissions([1]) for the CEO case, fakePermissions([3]) for Administrator
    // CEO: prisma.user.update called with data containing { officialSalary: 2_000_000 }
    // Administrator: rejects with ForbiddenException «Rasmiy oylikni faqat oylikni ko'ra oladigan xodim o'zgartiradi»
  });
```

Write the two concrete cases with the spec file's own builders (read the closest existing `updateUser` test and copy its setup; the assertion lines are above).

- [ ] **Step 3: Implement (users)**

- DTOs: `@IsOptional() @IsInt({ message: "Rasmiy oylik butun son bo'lishi kerak" }) @Min(0, { message: "Rasmiy oylik manfiy bo'lmaydi" }) officialSalary?: number;`
- `users.service.ts` create and update: when `dto.officialSalary !== undefined`, require `await this.permissions.has(callerId, 'salary.view')` else `throw new ForbiddenException("Rasmiy oylikni faqat oylikni ko'ra oladigan xodim o'zgartiradi")`; then put `officialSalary: dto.officialSalary` into `data`. Use the service's existing caller id variable and `PermissionsService` (inject if not present — `fakePermissions` exists for specs). `officialSalary` is a plain number, so `EntityHistory` records the change automatically through the existing `recordUpdate` (it must be in both old and new values objects — check the select used for `oldValues`).
- Reads: wherever `balance` is added only when `includeBalance` is true, add `officialSalary` the same way (salary info goes only to `salary.view` holders).

- [ ] **Step 4: Detail split — failing test**

In `salary-monthly-detail.service.spec.ts`:

```ts
  it('returns the official split for an employee with an official salary', async () => {
    // arrange: row with fullDeserved 2_500_000 in a top-up month, user.officialSalary 2_000_000,
    // loadRates → withholding 12, employerSocial 12
    // expect(result.official).toEqual({ official: 2_000_000, withholding: 240_000, employerSocial: 240_000, toHand: 2_260_000 });
  });
```

`toHand = netToPay − withholding` (the employee's whole net pay minus what goes to the budget). Write it with the spec's builders.

- [ ] **Step 5: Implement the detail split**

In `getDetail`, after the row is resolved:

```ts
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId }, select: { officialSalary: true } });
    const officialSalary = user?.officialSalary ?? 0;
    let official = null;
    if (officialSalary > 0) {
      const book = await this.taxSettings.loadRates(companyId);
      const earned = kind === 'teacher' ? ((isTopUpMonth(month) ? row.fullDeserved : row.covered) ?? 0) : row.monthly;
      const split = officialSplit(
        earned,
        officialSalary,
        rateForMonth(book.rates['payroll.employeeWithholdingPercent'], month),
        rateForMonth(book.rates['payroll.employerSocialPercent'], month),
      );
      official = { ...split, toHand: Math.max(0, row.netToPay - split.withholding) };
    }
```

Return `official` with the detail. Inject `TaxSettingsService` (import `TaxModule` into `SalaryModule`).

- [ ] **Step 6: Client**

- `edit-employee-form.tsx`: zod `officialSalary: z.string().optional()` (digits only, validate `/^\d*$/` with message «Faqat raqam»), default from `employee.officialSalary ?? ""`, payload `if (values.officialSalary !== "") payload.officialSalary = Number(values.officialSalary)`. Render the field (Label «Rasmiy oylik (so'm)», helper «Bank orqali beriladigan qism. Qolgani naqd.») only when `can("salary.view")` — copy the `position` field's JSX block.
- `salary-pay-dialog.tsx`: read `detail.official`; when not null, above the cash/card inputs show «Rasmiy qism: {official} · Budjetga: {withholding} · Xodim qo'liga: {toHand}» and a muted line «Korxona ijtimoiy solig'i: {employerSocial} (alohida to'lanadi)». The cash + card total stays `payment.amount` (company cash leaves either way); do not change `buildPayBody` / `sliceCheck`.

- [ ] **Step 7: Verify**

Run: `cd server && npx jest src/users src/salary src/tax && npm run typecheck`
Run: `cd client && npx tsc --noEmit -p .`
Expected: PASS / no errors.

- [ ] **Step 8: Commit**

```bash
cd server && npx prettier --write src/users src/salary
cd .. && git add server/src server/prisma client/src/components
git commit -m "feat(salary): official salary per employee and the tax split on payout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: «Soliq va komissiyalar» settings page

**Files:**
- Create: `client/src/app/(dashboard)/settings/tax/page.tsx`, `client/src/components/settings/tax-settings-client.tsx`, `client/src/components/settings/tax-settings-draft.ts`, `client/src/components/settings/tax-settings-draft.test.ts`
- Modify: `client/src/lib/settings-nav.ts` (after the «To'lov» entry ~147-155), `client/src/lib/breadcrumb-routes.ts` (~56-57), `client/src/lib/settings-nav.test.ts` (path test ~157)

**Interfaces:**
- Consumes: `GET /settings/tax` → `{ values, filled, total }`, `PATCH /settings/tax` `{ values }` (Task 3).
- Produces (draft helpers):
  - `type RateRow = { fromMonth: string; value: string }`, `type TierRow = { fromAmount: string; toAmount: string; percent: string }`
  - `rowError(row: RateRow): string | null`, `tiersError(rows: TierRow[]): string | null`
  - `toRatePayload(rows: RateRow[]): { fromMonth: string; value: number }[]`, `toTierPayload(fromMonth: string, rows: TierRow[])`
  - `currentRate(list, month: string): number | null` (mirror of the server's `rateForMonth`)

- [ ] **Step 1: Failing draft tests**

```ts
// client/src/components/settings/tax-settings-draft.test.ts
import { describe, expect, it } from "vitest";
import { rowError, tiersError, toRatePayload, currentRate } from "./tax-settings-draft";

describe("tax settings draft", () => {
  it("validates a rate row", () => {
    expect(rowError({ fromMonth: "2026-10", value: "2.5" })).toBeNull();
    expect(rowError({ fromMonth: "", value: "2" })).toBe("Oyni tanlang");
    expect(rowError({ fromMonth: "2026-10", value: "101" })).toBe("Foiz 0 dan 100 gacha");
    expect(rowError({ fromMonth: "2026-10", value: "2.555" })).toBe("Ko'pi bilan 2 kasr");
  });
  it("validates tiers", () => {
    expect(tiersError([{ fromAmount: "0", toAmount: "", percent: "0.1" }])).toBeNull();
    expect(tiersError([{ fromAmount: "5", toAmount: "", percent: "0.1" }])).toBe("1-oraliq 0 dan boshlanadi");
    expect(
      tiersError([
        { fromAmount: "0", toAmount: "100", percent: "1" },
        { fromAmount: "120", toAmount: "", percent: "1" },
      ]),
    ).toBe("Oraliqlar orasida bo'shliq bor");
  });
  it("builds payload and reads the current rate", () => {
    expect(toRatePayload([{ fromMonth: "2026-10", value: "4" }])).toEqual([{ fromMonth: "2026-10", value: 4 }]);
    expect(currentRate([{ fromMonth: "2026-10", value: 4 }, { fromMonth: "2027-01", value: 6 }], "2026-12")).toBe(4);
    expect(currentRate([], "2026-12")).toBeNull();
  });
});
```

Run: `cd client && npx vitest --config vitest.config.ts run src/components/settings/tax-settings-draft.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement the draft helpers**

```ts
// client/src/components/settings/tax-settings-draft.ts
export type RateRow = { fromMonth: string; value: string };
export type TierRow = { fromAmount: string; toAmount: string; percent: string };

const percentError = (v: string): string | null => {
  const n = Number(v);
  if (v.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) return "Foiz 0 dan 100 gacha";
  if (Math.round(n * 100) !== n * 100) return "Ko'pi bilan 2 kasr";
  return null;
};

export function rowError(row: RateRow): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.fromMonth)) return "Oyni tanlang";
  return percentError(row.value);
}

export function tiersError(rows: TierRow[]): string | null {
  if (rows.length === 0) return "Kamida bitta oraliq kiriting";
  if (Number(rows[0].fromAmount) !== 0) return "1-oraliq 0 dan boshlanadi";
  if (rows[rows.length - 1].toAmount.trim() !== "") return "Oxirgi oraliqning yuqori chegarasi bo'sh qoladi";
  for (let i = 0; i < rows.length; i++) {
    const err = percentError(rows[i].percent);
    if (err) return err;
    if (i < rows.length - 1) {
      const to = Number(rows[i].toAmount);
      if (!(to > Number(rows[i].fromAmount))) return "Oraliq chegarasi noto'g'ri";
      if (Number(rows[i + 1].fromAmount) !== to) return "Oraliqlar orasida bo'shliq bor";
    }
  }
  return null;
}

export const toRatePayload = (rows: RateRow[]) => rows.map((r) => ({ fromMonth: r.fromMonth, value: Number(r.value) }));

export const toTierPayload = (fromMonth: string, rows: TierRow[]) => ({
  fromMonth,
  tiers: rows.map((r) => ({
    fromAmount: Number(r.fromAmount),
    toAmount: r.toAmount.trim() === "" ? null : Number(r.toAmount),
    percent: Number(r.percent),
  })),
});

export function currentRate(list: { fromMonth: string; value: number }[], month: string): number | null {
  let hit: number | null = null;
  for (const r of list) if (r.fromMonth <= month) hit = r.value;
  return hit;
}
```

Run the test — Expected: PASS.

- [ ] **Step 3: Page component**

Build `tax-settings-client.tsx` on the `participation-settings-client.tsx` skeleton (query + mutation + skeleton + error card + `SettingsPageHeader`) and the per-row save + confirm pattern of `payment-settings-client.tsx` (read both once). Content:

- Header «Soliq va komissiyalar», badge «To'ldirilgan: {filled}/{total}».
- Amber notice: «Avtomatik hisoblanadigan soliqlarni xarajatga qo'lda yozmang — ular sof foydadan o'zi ayriladi.»
- Four sections (cards):
  1. **To'lov komissiyasi** — rows: «Payme ilovasi orqali» (`fees.app.payme`), «Click ilovasi orqali» (`fees.app.click`), «Uzum ilovasi orqali» (`fees.app.uzum`), «Integratsiya (ID bilan)» (`fees.integration`), «QR-kod» (`fees.qr`).
  2. **Oylik** — «Xodimdan ushlanma» (`payroll.employeeWithholdingPercent`), «Korxona ijtimoiy solig'i» (`payroll.employerSocialPercent`).
  3. **Aylanma solig'i** — «Hisob raqamga tushgan puldan» (`tax.turnoverPercent`).
  4. **Bank xarajati** — tier table (Dan / Gacha (bo'sh = cheksiz) / Foiz, «+ Oraliq qo'shish», row delete) with a «Qaysi oydan» month input; helper «Oylik aylanma tushgan oraliqning foizi butun aylanmaga qo'llanadi.»
- Each rate row shows: label, current value for this month (`currentRate`, «kiritilmagan» in amber when null), a history list (`fromMonth → value%`), and an «O'zgartirish» form: `<input type="month">` + percent `<input inputMode="decimal">` + «Saqlash». Saving appends/replaces the row for that month in the key's list and PATCHes `{ values: { [key]: fullList } }`. A month earlier than the current Tashkent month opens a confirm dialog: «{oy} dan boshlab o'tgan oylar foydasi qayta hisoblanadi. Davom etasizmi?».
- On success: `setQueryData`, `toast.success("Saqlandi")`; on error `toast.error(getErrorMessage(err, "Saqlashda xatolik"))`.
- No English words on screen; Latin Uzbek only.

`page.tsx`:

```tsx
import { Suspense } from "react";
import { TaxSettingsClient } from "@/components/settings/tax-settings-client";

export default function TaxSettingsPage() {
  return (
    <Suspense>
      <TaxSettingsClient />
    </Suspense>
  );
}
```

- [ ] **Step 4: Navigation**

`settings-nav.ts` after the «To'lov» entry:

```ts
  {
    title: "Soliq va komissiyalar",
    url: "/settings/tax",
    icon: Percent,
    description: "To'lov komissiyasi, oylik, aylanma solig'i va bank xarajati stavkalari",
    permission: "settings.tax",
  },
```

(import `Percent` from `lucide-react`). `breadcrumb-routes.ts`: `tax: msg("Soliq va komissiyalar")` next to `participation`. Add `/settings/tax` to the path test in `settings-nav.test.ts` following its pattern.

- [ ] **Step 5: Verify in the browser**

Run: `cd client && npx tsc --noEmit -p . && npx vitest --config vitest.config.ts run src/components/settings src/lib`
Expected: PASS.
Start the dev servers (`/restart` skill or `.claude/launch.json`), sign in locally as CEO, open `/settings/tax`, enter `tax.turnoverPercent` = 4 from the current month, reload — the value persists and «To'ldirilgan» goes to 1/9. Take one screenshot for the user.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(settings): tax and fee settings page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ADR, docs, user guide, full verification

**Files:**
- Create: `docs/adr/0106-soliq-va-komissiyalar-sof-foydada.md` (use the next free number from `docs/adr/README.md`; 0106 if still free)
- Modify: `docs/adr/README.md` (index row), `server/CLAUDE.md` (the «No tax calculation» bullet under Salary Module; the «One canonical Sof foyda» formula line; `NET_PROFIT_CACHE_VERSION` mention `v5` → `v6`; `PaymentMethod` enum list), `client/src/qollanma/yangiliklar.ts` (one entry), the settings section page under `client/src/qollanma/kontent/` (one paragraph for «Soliq va komissiyalar»)

- [ ] **Step 1: Write the ADR (Uzbek)**

Sections like ADR-0094: **Holati** Qabul qilindi, **Sana** 2026-10-25, **Bog'liq** (ADR-0038, ADR-0094, spec, plan, `server/src/tax/`). **Kontekst**: the system computed no tax (CLAUDE.md «No tax calculation»), sof foyda was too high; CEO's six rules. **Qaror**: the numbered decisions of the spec (dated rates in `Setting`, no hard-coded rate; channel map; QR method; pay-month basis; `rasmiy = min(...)`; bank tier on company turnover split by share; refunds do not reduce; `missingRates` only for used items; komissiya leaves the memo and is subtracted; cache `v6` + invalidation; `settings.tax` CEO by default, grantable to D/A/K). **Taqiqlanadi**: computing fees or taxes anywhere but `TaxCostsService` / `tax-costs.ts`; hard-coding a rate. **Oqibatlar**: profit drops vs earlier reports for months with rates entered back-dated; old `TRANSFER` QR payments stay fee-free; withholding is shown, not booked as a separate budget payment; dividend is stage 2. This ADR supersedes the CLAUDE.md «No tax calculation» rule (not an ADR, so no status change elsewhere).

- [ ] **Step 2: Update `server/CLAUDE.md`**

Replace the «No tax calculation» bullet with: «**Tax and fee costs (ADR-0106).** `TaxCostsService.forMonth` (`src/tax/`) is the one place that computes payment fees, employer social tax, turnover tax and bank fee from the month-dated rates on `/settings/tax`; `buildNetProfit` subtracts `taxes.total`. Never compute them anywhere else.» Update the net-profit formula, the cache version and the `PaymentMethod` list (add `QR`).

- [ ] **Step 3: User guide**

`yangiliklar.ts`: «Sozlamalar → Soliq va komissiyalar: to'lov komissiyasi, oylik solig'i, aylanma solig'i va bank xarajati stavkalari. Kiritilgan stavkalar sof foydadan o'zi ayriladi.» Plus «To'lov qabul qilishda yangi usul: QR-kod.» Match the file's entry format. Add the guide paragraph on the settings page.

- [ ] **Step 4: Full verification**

Run: `cd server && npm test`
Expected: all suites pass.
Run: `cd server && npm run typecheck && npx eslint src --quiet`
Expected: no type errors, no lint errors.
Run: `cd client && npx tsc --noEmit -p . && npx vitest --config vitest.config.ts run && npm run lint 2>&1 | tail -20`
Expected: pass, no lint errors.
Run: `cd client && npx next build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add docs server/CLAUDE.md client/src/qollanma
git commit -m "docs: ADR-0106 tax and fee costs in net profit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Out of scope (stage 2)

Dividend withdrawals (5% tax, 1% bank, card 0.5%, transfer 0.5–0.8%) need a «hisob raqamdan yechish» record and form — separate spec and PR.
