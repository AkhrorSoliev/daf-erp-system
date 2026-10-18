# Staff monthly salary — manual correction — design

**Date:** 2026-10-18
**Status:** design approved by the CEO in chat (18.10.2026: «ha» to the summary below); written spec awaiting review
**Builds on:** ADR-0006 (salary is read only from `getMonthly`), ADR-0027 / ADR-0034 (staff rates are the CEO's), ADR-0079 (capabilities), ADR-0082 (advances are netted by one walk; calendar-month period), the fixed-monthly staff payroll (`prorate-fixed-monthly.ts`, PR #325 / #424).
**Decision record:** ADR-0112 (written in the same PR; renumber if `main` takes the number first).

## 1. Why

A FIXED_MONTHLY employee (administrator, cashier, director) is paid `value × active days / days in the month`
(`prorateFixedMonthly`). The system proposes that figure and the payroll cron writes it. That is right for
the ordinary month and wrong for exactly the months that matter most: the month a person joins or leaves
part-way. There the agreed figure is often hand-set by the CEO and is not a whole number of calendar days.

Real cases:

- **An administrator who joined mid-September 2026.** Rate 3 000 000, started 11.09, agreed pay for September
  2 076 000. The formula gives 3 000 000 × 20/30 = 2 000 000. The 76 000 difference has no home: the payment
  row can be edited by script, but then the branch report warns «Oylik yozuvi «ishlagan − avans» ga mos emas»
  (`payrollMismatches`) and every report that reads `staff.monthly` keeps printing 2 000 000.
- **An administrator hired in June, July 2026** (hand-agreed 2 307 000) was fixed by inventing a rate version of 2 307 000
  for one month. A fictitious rate in the rate history is the only tool the CEO has today, and it falsifies
  the history («Stavka»).

The CEO's rule (18.10.2026): the system keeps computing and proposing; a manual correction must be possible;
**the fixed rate stays the fixed rate** — a correction never edits the rate or its history.

## 2. Decision

A manual correction is a separate record: «for person P, in month M, the pay is X, because R». It is
independent of the rate versions. The pay of a staff member for a month is **one function**:
`override ? override.amount : prorate(versions)`. Every consumer reads that function, so the payroll,
the «Ish haqi» page, the profit figures, Excel, Telegram and the branch PDF cannot disagree.

## 3. Data

New table `StaffSalaryAdjustment`:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | uuid | |
| `companyId` | int | |
| `userId` | int | the employee |
| `month` | `YYYY-MM` string | calendar month (ADR-0082 locks the cycle to the calendar month) |
| `amount` | int | the pay for the month before advances, so'm, ≥ 0 |
| `calculatedAmount` | int | what the formula gave when the correction was saved (audit; the live figure is re-derived on read) |
| `reason` | string | required, 3–300 characters |
| `createdById` / `createdAt` / `updatedAt` | | who and when |

`@@unique([companyId, userId, month])`. «Hisobga qaytarish» deletes the row; the trail is the
`EntityHistory` rows below (the table is a setting-like override, not a ledger).

No change to `EmployeeSalaryConfig`, `EmployeeSalaryConfigVersion` or `SalaryPayment` columns.

## 4. One function

`server/src/salary/shared/staff-monthly-amount.ts`:

```ts
resolveStaffMonthly({ versions, adjustment, periodStart, periodEnd }):
  { amount, calculated, manual }   // calculated = prorateFixedMonthly(...), amount = adjustment?.amount ?? calculated
```

The month key of a payroll period is `tashkentMonthKey(periodStart)` (the period is the calendar month, so the
Tashkent-shifted start instant falls in the month it opens). Its two readers are exactly the two current callers of `prorateFixedMonthly`:
`SalaryCalculationService.calculateMonthlySalaries` (FIXED_MONTHLY branch) and
`SalaryStaffMonthlyService.computeStaff`. A single-source spec (like `password-write.single-source.spec.ts`)
fails the build if anything else calls `prorateFixedMonthly`, so a third copy of the rule cannot appear.

Rows: `StaffRow` gains `calculated` (the live formula figure) and `adjustment: { amount, reason, by: {id, firstName, lastName}, at } | null`;
`monthly` is the resolved amount. A staff row exists when `amount > 0 || payment` (today: `monthly === 0 && !payment`
is dropped), so a month whose formula is 0 but which has a correction (a hire the versions do not cover) appears.
`coverage` and `rate` keep describing the formula — the row shows both «Hisob» and «Qo'lda».

The cron treats `amount <= 0` as «skip» as today; a correction of 0 is a valid way to say «this month pays nothing».
(0 with an existing payment row: see §6.)

## 5. API

Both routes `@Can('salary.adjust')` — a new capability, **CEO only**: `defaultRoles: []`, `allowedRoles: []`,
`LOCK.COMPANY` for every other editable role (the same shape as `salary.rate-edit`; staff pay is the CEO's,
ADR-0034). `requires: ['salary.view']`. Catalog count, `route-access.snapshot.json` and
`intentional-access-changes.ts` get their rows; `BRANCH_SCOPED_BY_ENTITY` in `branch-route-policy.ts`
(the payee's branch is checked through `assertPayrollCoversUser`, like the other id-addressed salary reads).

- `PUT /salary/monthly/user/:userId/adjustment` — body `{ month: 'YYYY-MM', amount: int ≥ 0, reason }`
  (`SetStaffAdjustmentDto`: `month`, `amount`, `reason` trimmed, 3–300 characters). Upsert; returns the updated staff row (`getMonthlyForUser`).
- `DELETE /salary/monthly/user/:userId/adjustment?month=YYYY-MM` — returns the row back on the formula.

Validation (both routes; all before any write, inside one Serializable transaction that re-reads; on DELETE rule 5
compares against the formula figure):

1. `month` from 2026-05 to the current Tashkent month (400 otherwise; a future month cannot be paid).
2. The user is not deleted, holds no Teacher role, and has a global FIXED_MONTHLY `EmployeeSalaryConfig`
   (400 «Xodimda oylik stavkasi yo'q»). A teacher on a fixed monthly is out of scope (§10).
3. The payee's branch is inside the caller's payroll scope (CEO: all).
4. The month's `SalaryPayment` (non-cancelled), if any, is `CALCULATED`; `APPROVED` / `PAID` → 409
   «Oylik tasdiqlangan — avval to'lovni bekor qiling».
5. `amount` is not below what the payment has already settled in advances (400 «Qo'lda summa ushlangan
   avanslardan kam»).

## 6. When the month's payment already exists

The cron wrote the payment at the month's end; the correction usually comes later (the mid-September joiner above). In the
same transaction as the upsert:

- `gross = amount`; the advances already settled against the payment stay settled;
- the remaining unsettled advances dated before the period's end are walked again with the SAME function the cron uses
  (`planAdvanceNetting`, ADR-0082) against `gross − alreadySettled`, because a raised gross can now fit an advance
  that did not fit before — it is exactly the 25.09 advance of the mid-September joiner above;
- `payment.amount = gross − (alreadySettled + newlySettled)`;
- `payment.note` gets «Qo'lda to'g'rilandi: <reason>» (appended, not replaced);
- a correction back to the formula (DELETE) recomputes the same way with `gross = calculated`; an advance that no
  longer fits is NOT unsettled automatically — the request is refused with the same 400 as rule 5 (settled advances
  are never silently re-opened, ADR-0006's «a settled advance is immutable»).

The settle walk is lifted out of the private `SalaryCalculationService.applyPendingAdvances` into
`salary/shared/advance-settle.ts` (one tx-taking function) and both callers use it. The cron's behaviour is unchanged.

No payment yet (the month is open, or the cron has not run): only the row is stored; the cron and the page use it.

## 7. Audit and events

`EntityHistory` on the **User**, written with the transaction's client (no correction without its trail):
`OYLIK_TUZATILDI` (`oy`, `hisob`, `qoldaSumma`, `sabab`; on a change the previous manual amount is also in
`oldValues` as `null` when there was none — the diff drops a key missing from `oldValues`, see the CLAUDE.md note)
and `OYLIK_HISOBGA_QAYTARILDI`.
No Telegram message to the employee (a correction is not a payout; `salary.paid` is unchanged).
The CEO is the only writer, so there is no alert.

## 8. The page (`/payments/salary`, staff rows)

In the staff row drawer (`salary-row-drawer.tsx`, `salary-drawer-sections.tsx`), a new block «Oylik hisobi»:

- Formula line, as today: «Stavka 3 000 000 · 30 kundan 20 tasi · Hisob 2 000 000».
- If a correction exists: «Qo'lda: 2 076 000» with the reason, author and date, and the formula figure struck through
  beside it. Buttons (visible with `salary.adjust` only): «O'zgartirish» and «Hisobga qaytarish».
- No correction: one quiet button «To'g'rilash». The dialog has the amount (prefilled with the formula figure),
  a required reason and a live line «Hisobdan farq: +76 000». The save refuses the §5 cases with the server's text.
- The table's «Oylik» cell shows a small «qo'lda» tag when a correction stands, so the CEO sees at a glance which
  rows are not the formula. Nothing else in the table changes.

The user guide page `client/src/qollanma/kontent/tolovlar/ish-haqi.mdx` and `client/src/qollanma/yangiliklar.ts` get
the entry in the same PR (client CLAUDE.md rule). The client mirrors the server only for display; it computes no salary.

## 9. What does not change

- Rate versions and their guards (no backward start, closed-period check, re-pricing of accruals).
- `prorateFixedMonthly` itself and `coverage`.
- Advances: still netted by `planAdvanceNetting`; a correction changes only the gross they are netted against.
- Teachers (accrual-based pay) and teachers on FIXED_MONTHLY.

## 10. Out of scope (said plainly)

- Teachers on a fixed monthly (they render in the teacher table; there the same idea would need its own design).
- Branch Director corrections (staff pay is CEO-only, ADR-0034; widening is a capability toggle later, not code).
- Bulk corrections and per-day overrides.
- A working-day (Monday–Saturday) proration rule. If the CEO later wants it as the company rule, it is a change of
  `prorateFixedMonthly` and its own ADR; the correction record stays useful for the exceptions.

## 11. Tests

- `staff-monthly-amount.spec.ts`: formula only; with a correction; correction 0; month with no overlapping version.
- `staff-monthly-amount.single-source.spec.ts`: nothing but the resolver calls `prorateFixedMonthly`.
- `salary-monthly-staff.service.spec.ts`: row carries `adjustment`, `monthly` = manual, `calculated` = formula, a row
  with formula 0 and a correction appears, totals follow `monthly`.
- `salary-calculation` FIXED_MONTHLY: the cron pays the correction; an existing payment is still skipped (idempotent).
- `staff-adjustment.service.spec.ts`: each §5 refusal; upsert; DELETE; payment exists (CALCULATED): amount recomputed, an
  advance that now fits is settled, note appended; APPROVED/PAID → 409; amount below settled advances → 400;
  history rows written with `tx` (rollback leaves none); concurrent second writer.
- Controller spec with `routeAccess()` / `defaultRolesOf()` for both routes (CEO only; BD, Administrator, Cashier 403);
  catalog spec (shape), `permission-routes.spec.ts` snapshot rows.
- Branch report: `payrollMismatches` stays silent for a corrected row (a spec on the real service path, not a mock of it).
- Client: drawer model test for the block states (none / manual / formula-struck) and the dialog's difference line.

## 12. Rollout

1. Migration (new table only, additive) → server → client. Migration first (the new server reads the table).
2. After the deploy the CEO sets September for that employee in the drawer (2 076 000, «oy o'rtasidan qo'shilgan»).
   The data fixed by hand on 17.10 (rate 3 000 000 from 11.09, payment 1 576 000, the 25.09 advance settled)
   already matches what the correction will compute, so the save is a no-op for the payment and only adds the record.
3. The deploy is the CEO's (manual, per the repo's practice).
