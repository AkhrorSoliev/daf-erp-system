# B1 — «Umumiy ma'lumotlar» and «Marketing» — design

**Date:** 2026-10-02
**Status:** approved by the CEO in chat (design, 02.10.2026)
**Mock-up:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — sections `v-overview`, `v-mkt`, dialogs `dlg-income`, `dlg-profit` (CEO-approved 27.09, re-approved 02.10)
**Builds on:** ADR-0058 (month charges), ADR-0059 (debt as two numbers), ADR-0055 (balance withdrawals), the A3 labels approved 02.10

## 1. Why and where this fits

The CEO found the Moliya and Hisobotlar pages hard to read (27.09). Set B rebuilds them
from the approved mock-up. B is split into seven parts, each with its own spec, plan, PR,
screenshots for the CEO and deploy:

1. **Umumiy ma'lumotlar + Marketing (this spec)**
2. Qarzdorlik + Qaytariladigan pul
3. Ish haqi
4. To'lovlar (new; replaces «O'quvchi to'lovi»)
5. Guruhlar bo'yicha to'lov (new; replaces «To'lov hisobotlari»)
6. Xarajatlar
7. Ketgan o'quvchilar, Markaz faoliyati, Davomat, Bot hisoboti; «Bitiruvchilar» removed

Umumiy and Marketing ship together because the three marketing cards leave the overview
for the Marketing page; shipping them apart would leave the figures nowhere for a while.

CEO decisions this spec carries out (27.09 unless noted):

- The overview filters by **month only** (plus the header branch). A date range breaks the
  monthly figures; ranges belong to the To'lovlar page.
- LTV / CAC / ROI stay, with correct formulas, on a separate Marketing page.
- «O'rtacha to'lov», «o'rtacha qarz» and the daily «oy oxiriga» chart are removed.
  «Oyning o'z foydasi» is removed.
- Cash received is split into this month's payments, **payments in advance for the next
  month**, and old debts. Today the advance is folded into «shu oy».
- No English abbreviations on screen. The card names approved on 02.10 are used:
  «O'quvchi qiymati», «Jalb qilish narxi», «Marketing samarasi».
- 02.10: the 21:00 Telegram report gets the advance line too, so it and the page show the
  same split.

## 2. «Umumiy ma'lumotlar» (`/payments/overview`)

### 2.1 Header

- Title «Umumiy ma'lumotlar».
- Month picker «‹ Oktabr 2026 ›». State in the URL as `?month=YYYY-MM` (default: the
  current Tashkent month). Minimum `2026-05` (the reporting floor), maximum the current
  Tashkent month. The period presets (Bugun / Hafta / Oy / Oraliq) and the two date pickers
  are removed.
- «Excel» (CEO/BD): the existing `ExportOptionsPopover`, its period prefilled with the
  selected month.
- «To'lov qayd qilish»: the existing `RecordPaymentDialog`; keeps `data-tour="payment-record"`.
  After a payment is recorded every block of the page refreshes.
- Branch: the header switcher, unchanged.

"Current month" below always means the current Tashkent month.

### 2.2 Blocks (CEO and Branch Director)

Top to bottom, as in the mock-up.

**Block 1 — «{Oy} oyi to'lovlari»** (months from `2026-09`, the monthly-billing start)

| Figure | Source |
|---|---|
| Hisoblandi, «N o'quvchiga» | `MonthCharges.charged`, `.students` |
| To'landi, «N%» | `.paid`, `.paidPct` |
| Qoldi, «N o'quvchi to'lamagan» | `.unpaid`, `.unpaidStudents` (**new**) |
| progress bar | `.paidPct` |

- «Kim to'lamagan →» links to `/payments/debt`, current month only. Part 2 points it at the
  «Shu oy» tab.
- A month before `2026-09` shows one muted line instead of the block:
  «{Oy} — 12 talik tizim: oylik hisob yo'q».

**Block 2 — debt** (current month only: it is today's state)

- «Eski qarz — o'qiyotganlar»: `DebtSplit.studying.older`, sub-line
  «N o'quvchi · o'tgan oylardan qolgan» (`studying.olderCount`, **new**), link «Ro'yxat →» to
  `/payments/debt`.
- «O'qimayotganlar qarzi»: `notStudying.total`, sub-line «N kishi · undirish ishi», three
  lines «guruhsiz · N», «muzlatilgan · N», «ketgan · N» with their sums
  (`notStudying.byKind`, **new**), link «Undirish ro'yxati →» to `/payments/debt`.
- The two numbers are never added and there is no combined total (ADR-0059).

**Block 3 — three cards**

(a) «Kassaga tushdi»
- Big figure: `attribution.total` for the month, the same total the «Qayerdan keldi» dialog
  decomposes (as the 21:00 report does).
- «shundan eski qarzlardan»: `attribution.lateTotal`; hidden when 0.
- «kecha (dd.MM)»: completed payments of yesterday's Tashkent day
  (`income.yesterday`, **new**). Shown only in the current month and only when yesterday
  belongs to it, so it is hidden on the 1st.
- Link «Qayerdan keldi →» opens the dialog (§2.4).

(b) «Oyliklar» — from `SalaryMonthlyService.getMonthly` for the month (the Ish haqi page's
source)
- Big figure: teachers `totals.fullDeserved` + staff `staffTotals.monthly`.
- «ustozlar · xodimlar»: the two parts.
- «avans berilgan»: `totals.advances + staffTotals.advances`.
- «oy oxirida beriladi» (current month) or «avansdan keyin» (past months):
  `totals.netToPay + staffTotals.netToPay`.
- A month without per-lesson data (`hasLessonData` false, e.g. May) shows «—» for the
  teachers and for the big figure, with «o'tish oyi».
- Link «Ish haqi →» to `/payments/salary`.
- Part 3 changes what «Avans» means on the Ish haqi page. This card follows automatically
  because it reads the same function.

(c) «Foyda» — from `GET /reports/profit-composition` (built from
`assembleMonthlyNetProfit`, the canonical net profit)
- Big figure: the composition's net profit.
- «darslar puli»: revenue (held lessons).
- «balansdan yechib olingan»: balance withdrawals, only when non-zero (ADR-0055).
- «chiqimlar»: teacher salary + staff salary + operating expenses + refunds, shown negative.
  The lines add up to the big figure.
- «oy oxiriga taxminan»: `forecast.expectedNetProfit`, current month only, when the forecast
  exists.
- Link «Qanday hisoblandi →» opens the dialog (§2.4).

**Block 4 — «Oylar bo'yicha»**

- Rows: the selected month and up to 5 earlier months, never before `2026-05`, newest
  first.
- Columns: Oy, Kassaga tushdi (trend `income`), Foyda (canonical profit), Izoh.
- Izoh: pill «oy tugamagan» for the current month; «12 talik tizim» for months before
  `2026-09`; empty otherwise.
- A month whose canonical profit could not be computed (`profitBasis: 'kassa'`) shows «—»
  in Foyda, never the cash figure under the Foyda heading.
- Source: `GET /reports/financial-trend?month=YYYY-MM` (**new** anchor parameter).
- The table's «Kassaga tushdi» comes from the `Payment` aggregate and the card's from the
  ledger replay. They are equal while invariant G1 holds (checked by
  `scripts/audit-finance-reconciliation.ts`), the same basis split the 21:00 report already
  lives with.

**Block 5 — «Oxirgi to'lovlar»** (current month only; every role that sees the page)

- The existing recent-payments table with a «Guruh» column: the student's current groups
  (live ACTIVE enrollments), «—» when none. This is the student's group now, not a property
  of the payment. Part 4 decides the To'lovlar page's rule.
- «Barcha to'lovlar →» arrives with the To'lovlar page in part 4.

### 2.3 Administrator and Cashier

- They see the title, «To'lov qayd qilish» and block 5. No month picker.
- The two cards they see today («To'lov qilganlar», «O'rtacha to'lov») are removed by the
  CEO decisions above, so the client no longer calls `GET /reports/financial-overview` for
  them.
- The endpoint becomes `@Roles('CEO', 'Branch Director')`; the Administrator/Cashier
  redaction branch is deleted. `server/CLAUDE.md` («financial-overview role split») and the
  controller spec change with it.

### 2.4 Dialogs

**«Qayerdan keldi»** (CEO/BD). Title «{Oy}da tushgan pul qayerdan keldi».

- Sub-line: «Jami X · N ta to'lov · M o'quvchi» (`total`, `paymentCount`, `payerCount`).
- A stacked bar with three colours, then the parts. A part that is 0 is hidden.
  - «{Oy} oyi to'lovi»: `currentMonth`.
  - «{Keyingi oy} uchun oldindan»: `advance`; sub-line «N o'quvchining balansida turibdi»
    (`advanceStudents`).
  - «Eski qarzlar uchun»: `lateTotal`; sub-line «N ta to'lov, M o'quvchi»
    (`latePaymentCount`, `lateStudentCount`). Under it, one line per earlier month,
    «{oy} qarzi», all months, newest first.
- «Qanday to'landi»: method chips from the overview's `income.byMethod`.
- «Yopish». «Barcha to'lovlar» comes in part 4.

**«Qanday hisoblandi»** (CEO/BD). Title «{Oy} foydasi qanday hisoblandi». It shows only the
lines that make up the figure, as one equation:

1. O'tilgan darslar puli
2. Balansdan yechib olingan (only when non-zero)
3. Ustozlar oyligi −
4. Xodimlar oyligi −
5. Boshqa xarajatlar −
6. Qaytarilgan pul − (only when non-zero)
7. **Foyda**

- From `2026-07` on, the check line «Ustozlar oyligi — Ish haqi sahifasidagi jami bilan bir
  xil» is shown. That is the month teacher salary switched to the full deserved figure, so
  the claim is true only from then.
- Today's long panel content is removed: the forecast breakdown, the expense items and the
  departed debtors.

### 2.5 Removed from the overview

- The 8-card grid: Tushum, Chiqimlar, Foyda, To'lov qilganlar, O'quvchi qiymati,
  Jalb qilish narxi, Marketing samarasi, O'rtacha to'lov.
- The card chart dialogs (`kpi-chart-dialog.tsx`) and the «Oy oxiriga kutilyapti» history
  dialog. The endpoint `GET /reports/expectation-history` and the 23:40 snapshot stay; the
  snapshot cannot be rebuilt.
- The old salary card, debt block and «To'lov usullari» block. Methods move into
  «Qayerdan keldi».
- The «Hisobdan chiqarilgan» row. Write-offs stay on the debt page's «Kechirilganlar» tab;
  part 2 places them.
- Server fields with no reader left: `ltv`, `ltvPayerCount`, `cac`, `marketingRoi`,
  `avgPayment` in `getFinancialOverview`, and `ltv`, `cac`, `marketingRoi`, `avgPayment` in
  the 6-month `getFinancialTrend`. The yearly trend and the Excel workbook are not touched.

## 3. «Marketing» (`/reports/marketing`, CEO and Branch Director)

### 3.1 Header

Title «Marketing», month picker (`?month=YYYY-MM`, minimum `2026-05`, maximum the current
month). No Excel in part 1: four cards and two small tables. Added when asked.

### 3.2 Definitions

These are the single definitions; every block reads them, nothing re-derives them.

- **Spend (month M)**: Σ `Expense.amount` with category `MARKETING`, `deletedAt` null,
  `Expense.date` in M (a `@db.Date` column, so bounds are built with `utcMidnightFromDateStr`,
  upper bound exclusive), branch-scoped by `branchIdWhere`.
- **New student of month M**: a student card (`deletedAt` null, in branch scope by
  `studentBranchWhere`, with at least one enrollment that is not deleted) whose **first**
  COMPLETED `Payment` falls in M (Tashkent month of `createdAt`).
  - The enrollment condition keeps mock-only payers out.
  - A reversed payment has status REVERSED and never counts.
- **Cohort paid to date**: Σ of every COMPLETED `Payment` of the month's new students, from
  their first payment until now.
- **Jalb qilish narxi** (CAC) = round(spend ÷ new students); null when there are no new
  students.
- **O'quvchi qiymati** (LTV) ≈ average study months × monthly charge, where:
  - average study months = `avgDurationMonths` of `getDepartedStudentsSummary` for M, the
    same number the Ketgan o'quvchilar page shows; 0 means no departures, read as null;
  - monthly charge = round(`MonthCharges.charged` ÷ `MonthCharges.students`) for M; null
    before `2026-09`;
  - null when either part is null.
- **Marketing samarasi** (ROI) = cohort paid to date ÷ spend; null when spend is 0.
- **Transition months**: before `2026-07`. In May and June, students who were already
  studying made their first in-system payment, so they look new. For these months the new
  student count is shown with «*», and CAC, paid to date and ROI are «—».

### 3.3 Blocks

1. Four cards:

   | Card | Sub-line |
   |---|---|
   | «Marketingga sarflandi» | «Xarajatlar → Marketing» |
   | «Yangi o'quvchilar» | «birinchi marta to'laganlar» |
   | «Jalb qilish narxi» | «sarf ÷ yangi o'quvchilar» |
   | «O'quvchi qiymati» | «o'rtacha {N} oy × oyiga {X}» |

   A null figure is «—».
2. «Marketing samarasi»: one sentence and one warning.
   - ROI ≥ 1: «{Oy}da qo'shilgan {N} o'quvchi hozirgacha {paid} to'ladi — marketingga
     sarflangan {spend} dan {roi} barobar ko'p.»
   - ROI < 1: «… — sarfning {p}% i.»
   - Spend 0: «{Oy}da marketingga sarf yozilmagan.»
   - Transition month: «May–iyun — tizimga o'tish oylari, hisoblanmaydi.»
   - Warning: «Bu yuqori chegara: hamma yangi o'quvchi ham reklamadan kelmagan. Lid manbasi
     yozilganlar bo'yicha aniq hisob — pastda.»
3. «Oylar bo'yicha»
   - Rows from the selected month back to `2026-05`, newest first.
   - Columns: Oy, Sarflandi, Yangi o'quvchi, Jalb qilish narxi, Hozirgacha to'lagan,
     Samara.
   - Samara is formatted «13×»: a whole number at 10 or above, one decimal below 10.
   - Transition months are muted, with the footnote «* May–iyun — tizimga o'tish oylari:
     eski o'quvchilarning tizimdagi birinchi to'lovi «yangi» ko'rinadi, shuning uchun
     hisoblanmaydi.»
4. «Manba bo'yicha (lid manbasi yozilganlar)»
   - One row per lead source of the people who entered the funnel in M.
   - Uses the lead funnel's own cohort (`ReportsLeadFunnelService`: people deduplicated by
     phone, branch by `leadAttributionWhere`, start `FUNNEL_START_DATE` = 2026-09-10).
   - Columns: Manba, Lid (people), O'quvchi bo'ldi (people who reached the funnel's «paid»
     stage), Aylanish % with a bar.
   - No source is «Manba yozilmagan». Sorted by Lid, descending.
   - Footnote «Lid manbasi 10.09.2026 dan beri yoziladi.» A month before that shows only the
     footnote.

### 3.4 Navigation

- Hisobotlar gets «Marketing» (`CEO_BD`), next to «Lidlar hisoboti».
- Breadcrumb label `marketing: "Marketing"`.
- The rest of the Hisobotlar menu is re-ordered in the parts that rebuild it.

## 4. Server changes

1. **`reports/month-charges.ts`**: `MonthCharges.unpaidStudents`, the number of students
   whose unpaid share in scope is above 0. Computed in `splitMonthCharges`, the function that
   computes `unpaid`, so the two cannot disagree.
2. **`reports/debt-split.ts`** (ADR-0059's single source)
   - `studying.olderCount`: studying debtors with `older > 0`.
   - `notStudying.byKind: { ungrouped, frozen, left }`, each `{ total, count }`.
   - The not-studying aggregate becomes one `groupBy(['status'])` over the same predicate:
     - status ACTIVE inside the not-studying set is exactly `ungroupedStudentWhere()`;
     - FROZEN is frozen;
     - every other status is «ketgan».
   - The three parts add up to `notStudying.total` and `.count` by construction.
3. **`getIncomeMonthAttribution`** (`reports-financial.service.ts`): split the advance out of
   `currentMonth`.
   - The per-student `prepaid` pool becomes a FIFO of fragments, each marked in-scope or
     not. An in-scope fragment is the leftover of a COMPLETED payment inside the period and
     branch.
   - A debit absorbs the oldest fragment first, the same oldest-first rule money follows
     everywhere.
   - Debit dated inside the period: every in-scope amount it absorbs moves from `advance`
     to `currentMonth`. It paid this period's charge, e.g. a mid-month join.
   - Debit after the period end: the amount stays `advance`. It paid the next month, e.g.
     the 1st's monthly charge when a closed month is viewed later.
   - New return fields: `advance`, `advanceStudents` (students with in-scope advance still
     standing at the period end), `paymentCount`, `latePaymentCount` (payments with a late
     part), `lateStudentCount`.
   - `total = currentMonth + advance + lateTotal` still equals the period's income.
   - `collectionPct` keeps its meaning: its numerator becomes `currentMonth + advance`, the
     old `currentMonth`.
   - Every other reader of `currentMonth` is listed in the plan and either prints the
     advance as well or uses `currentMonth + advance` where the old meaning is required.
4. **`GET /reports/financial-overview`**
   - Roles CEO/BD (§2.3).
   - The salary fold (`salary.computed`) gains `staff: { monthly, advances, netToPay }`, and
     its month comes from `tashkentMonthKey`, not `getFullYear()`/`getMonth()`.
   - New `income.yesterday: { date: 'YYYY-MM-DD', amount } | null`: the current month only,
     null on the 1st. COMPLETED payments with `createdAt` in yesterday's Tashkent day, branch
     scope.
   - The removed fields of §2.5 go.
5. **`GET /reports/financial-trend`**: optional `month=YYYY-MM`. The six months end at that
   month, clamped to the current month. Without it, behaviour is unchanged. The `ltv`, `cac`,
   `marketingRoi` and `avgPayment` series go.
6. **`GET /payments`**: every row's `student` gains `groups: { id, name }[]`, the groups of
   the student's live ACTIVE enrollments (`deletedAt` null, status ACTIVE), read in one
   batched query per page.
7. **New `GET /reports/marketing?month=YYYY-MM`**
   - Files: `reports/marketing/` — `marketing.math.ts` (pure), `reports-marketing.service.ts`,
     `reports-marketing.controller.ts`.
   - Gate: `@Roles('CEO', 'Branch Director')`. Branch scope through
     `resolveCallerReportBranchIds`; an empty scope is refused with 403 like the other money
     reports. Registered in `branch-route-policy.ts`.
   - Response shape:
     ```
     { month,
       spend, newStudents, cac, ltv: { value, avgMonths, monthlyCharge } | null,
       cohortPaid, roi, transition: boolean,
       months: [{ month, spend, newStudents, cac, cohortPaid, roi, transition }],
       sources: [{ source: string | null, leads, students }] | null }
     ```
   - Loads:
     - one `payment.groupBy(['studentId'])` with `_min.createdAt` and `_sum.amount` over the
       candidate students;
     - one `expense.findMany` of MARKETING rows from `2026-05`;
     - `getMonthCharges` and `getDepartedStudentsSummary` for M;
     - a new `ReportsLeadFunnelService.getSourceBreakdown(companyId, period, scope)` that
       reuses `loadCohort`.
8. **Telegram** (`telegram-groups/utils/income-split.util.ts`, read by the 21:00 report and
   `rm:cfin`)
   - The lines become «Shu oy uchun», «Oldindan (keyingi oy uchun)», «Eski qarzlar uchun»,
     then the per-month lines. A part that is 0 is left out.
   - «Hammasi shu oy uchun — eski qarz uchun to'lov yo'q» stays for the case where advance
     and late are both 0.
   - The printed percentages always sum to 100.
9. **ADR-0065** (Uzbek, in the same PR; renumber if `main` took the number):
   - the advance split of cash received;
   - the marketing definitions of §3.2;
   - the not-studying sub-split, which is additive to ADR-0059;
   - `financial-overview` becoming CEO/BD.

## 5. Client changes

- **New `components/payments/overview/`**, one block per file: the page with month state
  and role split, block 1 card, debt cards, cash card + «Qayerdan keldi» dialog, salary card,
  profit card + «Qanday hisoblandi» dialog, months table, recent payments, types.
- `/payments/overview/page.tsx` renders it.
- `DebtSplit` and `MonthCharges` types move to the new types file. Their four importers
  (dashboard types, home money cards, overdue-promises banner and its test) follow.
- **New** `/reports/marketing/page.tsx` + `components/reports/marketing/`.
- `reports-nav.ts`, `breadcrumb-routes.ts`.
- **Deleted:**
  - `overview-client.tsx` and `payments-overview.tsx` (+ test, rewritten for the new
    components);
  - `kpi-chart-dialog.tsx`, `income-attribution-panel.tsx` (+ test),
    `profit-composition-panel.tsx`, `expectation-history-dialog.tsx`;
  - `profit-composition-rows.tsx` / `profit-composition-text.ts` if nothing else reads them.
- React Query keys: the overview query keeps the key `financial-overview`, because five
  dialogs elsewhere invalidate it. The page invalidates its other keys itself after a
  payment.
- Every block has its own query, loading state and error state. One failing request blanks
  one block, never the page.
- UI text only in Latin Uzbek. `lib/uzbek-only-texts.test.ts` covers the new components.

## 6. Testing

- **Pure functions (Jest):**
  - `splitMonthCharges.unpaidStudents`;
  - `splitDebt` `olderCount` and `byKind` (the parts sum to the total);
  - the attribution's advance split:
    - overpay, then next month's charge: stays advance;
    - overpay, then a same-month join charge: moves to the month;
    - an out-of-scope prepaid balance is consumed first;
    - reversed pairs are excluded;
    - `total` equals income;
  - marketing math: cohort bucketing, transition months, null CAC/ROI/LTV;
  - Telegram split lines: three parts, percentages sum to 100.
- **Controllers and policy:** `financial-overview` roles CEO/BD; the marketing route's roles
  and its manifest entry; `reports-branch-scope-coverage` for every new money query.
- **Client (Vitest):**
  - a past month hides blocks 2 and 5, «kecha» and «oy oxiriga»;
  - a pre-September month shows the 12-talik line;
  - the Administrator/Cashier view;
  - the dialogs' lines add up;
  - marketing formatting («—», «13×», «*»);
  - no English on screen.
- **Browser** (local, dev data): every block, both dialogs, a past month, an admin login,
  Marketing. Screenshots go to the CEO before deploy (`feedback_ceo_sahifa_bir_qarashda`).
- **After deploy** (production, read-only): the page against the 21:00 report, and the
  Marketing figures against a probe.

## 7. Rollout

- One PR. Merge and deploy only with the CEO's go-ahead, never across the 02:00 / 03:10 /
  04:00 crons or at 23:00.
- Deploy the client first, then the server at once:
  - the new client tolerates the old server's missing fields («—»), and the Marketing page
    shows its error state until the server lands;
  - the old client loses the removed fields on the new server.
- After the deploy, the 21:00 report prints the new «Oldindan» line. The CEO knows (02.10).

## 8. Not in this part

- The Qarzdorlik tabs (part 2).
- «Barcha to'lovlar» / «To'lovlar» links (part 4).
- What «Avans» means on Ish haqi (part 3).
- The «hali yozilmagan» expense warning (part 6, Xarajatlar).
- Excel for Marketing.
- Re-ordering the rest of the Hisobotlar menu.
