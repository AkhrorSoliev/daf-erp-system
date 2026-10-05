# B2a — «Qarzdorlik» page — design

**Date:** 2026-10-04
**Status:** approved by the CEO in chat (04.10.2026, after viewing the mock-up's «Qarzdorlik» page)
**Mock-up:** https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — section `v-debt`, its drawer and the promise form (CEO-approved 27.09, re-approved 02.10 and 04.10)
**Builds on:** ADR-0059 (debt as two numbers), ADR-0067 (not-studying kinds, B1), ADR-0047/ADR-0064 (a promise never admits to a lesson)

## 1. Why and where this fits

Set B rebuilds Moliya and Hisobotlar from the approved mock-up in seven parts. Part 1 (B1, #658: overview + Marketing) is live since 03.10. Part 2 is split in two:

- **2a — Qarzdorlik (this spec):** the debt page in three sections, a student drawer, the promise rules, and the old tabs moved out. Reads and one promise rule; no money moves differently.
- **2b — Qaytariladigan pul (next spec):** the money held for students who are not studying, with the new refund flow (request → 10 bank days → handed over). It changes money semantics and gets its own design and ADR.

CEO decisions carried out:
- 27.09: debt is two numbers that are never added; the debt page has three sections (Shu oy / Eski qarz / O'qimayotganlar — guruhsiz · muzlatilgan · ketgan) and no total; «Markaz qoplagani» moves to Ish haqi; «Muzlatilgan puli» moves to Qaytariladigan pul; the monthly history and the write-off archive become links.
- 04.10: a payment promise is limited to **at most 7 days ahead and one per student per month**, wherever a promise is written. The final contract (02.10) no longer has an extension clause, so the rule is the centre's own: the UI never says «shartnoma bo'yicha».

## 2. Page (`/payments/debt`)

### 2.1 Header

- Title «Qarzdorlik», «Bugungi holat · dd.MM» (today, Tashkent), «Excel».
- Every figure is today's state; there is no month picker.
- Branch: the header switcher, unchanged.

### 2.2 The three sections

Tabs in the URL (`?tab=shu-oy|eski|chiqqan`, default `shu-oy`). Each tab button shows its total and count. The three totals are never added and the page prints no combined figure.

The sets come from ONE function in `server/src/reports/debt-split.ts` (the ADR-0059 single source), which now returns per-student rows; the totals are sums of the same rows, so a tab's total always equals the sum of its rows:

| Tab | Who | Row amount | Total / count |
|---|---|---|---|
| **Shu oy** (🟡) | studying debtors (`studyingDebtorWhere`) whose `currentMonth` part > 0 | `currentMonth` = min(debt, this month's CHARGED charges) | `studying.currentMonth`, `studying.currentMonthCount` (**new**) |
| **Eski qarz** (🔴) | studying debtors whose `older` part > 0 | `older` = debt − currentMonth | `studying.older`, `studying.olderCount` |
| **O'qimayotganlar** (grey) | not-studying debtors | whole debt | `notStudying.total`, `.count`, `.byKind` |

A studying student with both parts appears in both studying tabs, each with its own part, and a pill names the other part («+ eski qarz X» / «+ shu oy X»). That is two views of one debt, not two debts: the tab totals are the two parts of `studying.total`.

**Difference note (Shu oy tab only).** The overview's «Qoldi» (ADR-0058) also counts the unpaid current-month bills of students who left a group this month; here they sit in «O'qimayotganlar». When that amount is above 0 the Shu oy tab prints one muted line: «Shu oy guruhdan chiqqanlarning shu oy qarzi — X — «O'qimayotganlar» bo'limida.» X = Σ over not-studying debtors of min(debt, this month's CHARGED charges) = `notStudying.currentMonth` (**new**, same function).

Under the tab buttons, one line per tab says what the tab is (the mock-up's `rule` texts, unchanged, except the Shu oy text drops «(1-oktabrdan amal qiladi)»).

### 2.3 Columns

Every table starts with the `#` column (client convention).

- **Shu oy:** O'quvchi (name, ID, phone; «+ eski qarz X» pill) · Guruh (group, teacher under it) · Qarz · To'lov muddati · Va'da · Oxirgi aloqa · «To'lov».
- **Eski qarz:** O'quvchi («+ shu oy X» pill) · Guruh · Eski qarz · Qaysi oylardan (month chips with amounts) · Oxirgi to'lov (dd.MM · amount) · Va'da · «To'lov».
- **O'qimayotganlar:** O'quvchi · Holat (guruhsiz / muzlatilgan / ketgan pill) · Oxirgi guruh · Qarz · Qaysi oylardan · Oxirgi aloqa · «To'lov».

Definitions:
- **Guruh / ustoz (studying):** the student's live ACTIVE enrollments' groups and those groups' current teachers. **Oxirgi guruh (not studying):** the group of the student's most recent enrollment (any status), «—» when none.
- **To'lov muddati:** the student's 2nd lesson of the current month in their group — the existing `paymentDueDate` helper (A5, `billing/payment-due-date.ts`), the date the bill and reminder already name. Printed «dd.MM gacha» before the day and a red «o'tgan · dd.MM» on/after it; «—» when the month has fewer than two lessons for the student.
- **Va'da:** the student's latest promise (any month): OPEN with a date ahead → green «dd.MM gacha»; broken (the existing «overdue» meaning: status BROKEN and the student still owes) → red «buzildi · dd.MM»; otherwise «—».
- **Oxirgi aloqa:** the latest call log of the student (date + result label), «aloqa bo'lmagan» when none.
- **Qaysi oylardan:** the debt split by the month it arose — the existing `DebtAgeService` (same rule as the debt-history page); for Eski qarz only the months before the current one.
- **Oxirgi to'lov:** the latest COMPLETED payment (date, amount).

### 2.4 Filters, sort, paging

- Search: name, phone or ID (one box, same rules as the student list).
- Guruh, Ustoz (options from the tab's own rows), Va'da: hammasi / berganlar / buzilgan / va'dasiz.
- O'qimayotganlar only: chips «Hammasi · N», «Guruhsiz · N», «Muzlatilgan · N», «Ketgan · N» (counts from `byKind`).
- Sort: «Eng katta qarz» (default) · «Eng uzoq qarzdor» (oldest unpaid month first, then amount) · «Va'dasi buzilganlar birinchi» · «Ism (A–Z)».
- With any filter set, a line «Topildi: N ta · X so'm»; without, «Jami: X so'm · N ta» (the tab total).
- Server-side paging (page size 20, `TablePagination`).
- State in the URL; the old `?promise=overdue` link (outreach banner) maps to «buzilgan».

### 2.5 Drawer (row click)

- Name, «ID · phone · group (· holat)», **Qarz** (the student's whole debt, both parts).
- **Oylar bo'yicha:** one line per month with debt: «hisoblandi X · to'landi Y · qoldi Z», where to'landi = hisoblandi − qoldi (any credit counts as paid, ADR-0058), so the line always adds up. Any other due (a mock fee, a refund paid out, the pack's lessons ahead) is its own line, labelled as the statement labels it, with «qoldi Z» alone.
- **Oxirgi to'lov:** «dd.MM.yyyy · amount · method», or «Hali to'lov qilmagan».
- **Aloqa va va'da:** latest call log line; current promise («Va'da: X so'm, dd.MM gacha» + its pill); «Hali aloqa bo'lmagan» when none.
- Actions:
  - «To'lov qayd qilish» — `RecordPaymentDialog` with the student preselected (all roles that may record payments);
  - «Va'da yozish» — inline form: Summa (default: the whole debt), Qachongacha (date, today … today + 7), Izoh; note «Ko'pi bilan 7 kunga, oyiga 1 marta.»; hidden for a role the promises endpoint refuses, disabled with the reason when the student already had a promise this month;
  - «Qo'ng'iroq natijasi» — the existing `LogCallDialog` (roles `CALL_LOG_ROLES`);
  - «To'lovlar hisoboti (PDF)» — the existing statement PDF (roles the statement endpoint admits; hidden for Cashier).
- The drawer's figures come from one new read open to every staff role that opens the page (the statement endpoints refuse Cashier); its months use the statement allocation (the single «where payments went» engine), never a new calculation.

### 2.6 Links at the bottom

- «Oylar bo'yicha qarz tarixi →» — `/payments/debt-history` becomes a real page with the existing history view (today a redirect to `?tab=oylik`).
- «Kechirilgan qarzlar arxivi · N ta →» — `/payments/debt-write-offs` becomes a real page with the existing write-off view; N = the live write-off count.
- «Muzlatilganlarning puli →» — `/payments/frozen-balances`, a temporary page with the existing frozen-balance view and its actions, until 2b replaces it with «Qaytariladigan pul».
- One muted line: «Markaz qoplagani — Ish haqi sahifasida.»

Old URLs keep working: `?tab=qarzdorlar` → Shu oy; `?tab=oylik` → `/payments/debt-history`; `?tab=kechirilgan` → `/payments/debt-write-offs`; `?tab=muzlatilgan` → `/payments/frozen-balances`; `?tab=markaz[&month=]` → `/payments/salary?tab=markaz[&month=]`.

### 2.7 Excel

«Excel» downloads the open tab with the current filters (all pages): the visible columns as plain values, plus a total row. Same roles as the list.

## 3. «Markaz qoplagani» moves to Ish haqi

- `/payments/salary` gains a third tab «Markaz qoplagani» (`?tab=markaz`, month in `?month=`) rendering the existing `CenterTopUpContent`; floor month unchanged.
- The salary page is CEO/BD only, so the server read `GET /salary/monthly/center-topup` narrows to `@Roles('CEO', 'Branch Director')`. Administrator and Cashier lose access to this list (the CEO was told 04.10). Controller spec, `server/CLAUDE.md` (the debt-page open-read rule and the salary roles), `docs/role-access.md` follow.
- Links that pointed at `/payments/debt?tab=markaz` (the salary page's «Markaz qo'shimchasi» card) point at the new tab.

## 4. Payment promise rule (all entry points)

One rule in `PaymentPromisesService`, applied to every write: `create` (the drawer's «Va'da yozish»), and `upsertOpenPromise` (the call-log dialog and the payment dialog's promise for the unpaid rest).

- **Date:** the promise date must be a Tashkent day from today to today + 7 (inclusive). Refusal: «Va'da sanasi bugundan boshlab ko'pi bilan 7 kun keyin bo'lishi kerak».
- **Once a month:** a student may receive one promise per Tashkent month, counted by `createdAt` (any status). A second one is refused: «Bu o'quvchiga shu oy va'da yozilgan». Changing the date of the month's OPEN promise (`upsertOpenPromise`) is allowed only while the new date is within 7 days of that promise's creation day — so a promise cannot be pushed beyond a week by editing it.
- **Amount:** the drawer form stores `promisedAmount` (the column exists). Optional elsewhere, as today.
- **A payment never fails because of a promise.** The payment dialog fetches the student's promise state first: if a promise already exists this month it shows it and asks for none; its date picker is capped at today + 7. The server validates the promise before writing anything, so a bad promise is a 400 with nothing written, never a half-done payment.
- A promise still never admits a student to a lesson (ADR-0047, ADR-0064) — unchanged.

## 5. Server changes (summary)

1. **`debt-split.ts`**: a pure per-student row function (studying rows with `currentMonth` / `older`, not-studying rows with `kind` and their current-month part) from which `splitDebt`'s totals are summed; new `studying.currentMonthCount`, `notStudying.currentMonth`. The charges read covers every debtor in the base (today only the studying ones). Existing readers' figures do not change.
2. **New `GET /payments/debt/list`** (`?tab=&kind=&groupIds=&teacherIds=&promise=&sort=&search=&page=&pageSize=`; `groupIds` and `teacherIds` take several values) — rows of one tab from the function above, enriched in batched reads (groups/teachers, last group, due date, promise, last call, last payment, months), filtered, sorted and paged on the server; returns `{ data, total, page, pageSize, sum }` plus the tab totals and the difference amount. Roles: every staff role that opens the page today (CEO, BD, Administrator, Cashier); branch scope as the debtor summary (`studentBranchWhere`, empty scope → nothing).
3. **New `GET /payments/debt/students/:id`** — the drawer: debt, months (statement allocation), last payment, latest call, the latest promise of any month (this month's promise state — what the form may offer — comes from `GET /payment-promises/month`). Same roles; branch-checked (another branch's student → 404, ADR-0063 style).
4. **New `GET /payments/debt/excel`** — same query as the list, all rows, xlsx.
5. **`PaymentPromisesService`**: the rule of §4; the payment write validates a promise before writing.
6. **`GET /salary/monthly/center-topup`**: CEO/BD.
7. Every new route in `branch-route-policy.ts`; guard specs for every `@Roles`.
8. **ADR-0072** (Uzbek, same PR; renumber if taken): the debt list is the split's sets (amends how ADR-0059's «unchanged surfaces» list treats the debtor list), the promise rule, and the narrowed center-topup read.

`GET /payments/debtors` and `/debtors/summary` stay for their other readers; if, after the change, nothing reads the old list, the plan removes it.

## 6. Client changes (summary)

- `components/payments/debt/`: the page with three tabs, tab header cards, filter bar, one table per tab, the drawer with the promise form; the old tab bar and `debtors-view` replaced.
- New real pages `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/frozen-balances` (existing views, each with a «← Qarzdorlik» back link); `?tab=` redirects.
- `/payments/salary` third tab; links retargeted.
- Payment dialog and call-log dialog: promise date capped at today + 7, existing promise this month shown instead of asking.
- Breadcrumb labels for the new segments.
- UI text Latin Uzbek only.

## 7. Testing

- Pure: the row function (tab membership, both-parts students, kinds, totals = Σ rows, `currentMonthCount`, `notStudying.currentMonth`), the promise rule (today, +7, +8, past, second promise in the month, upsert within/after 7 days of creation, Tashkent day boundary at 00:00–05:00).
- Services: list filters/sort/paging/sum, branch scope, drawer 404 for another branch, Excel rows equal list rows.
- Controllers: roles of every new route and of center-topup; route-policy manifest.
- Client: each tab's columns and pills, the difference line (shown only when > 0), filters and URL state, the drawer (actions per role, promise form limits and the «shu oy va'da yozilgan» state), redirects, the salary tab, no English on screen.
- Browser check against a mock API, screenshots to the CEO before deploy.

## 8. Rollout

One PR; merge and deploy only with the CEO's go-ahead, outside the 02:00 / 03:10 / 04:00 / 23:00 windows. Client first, then the server at once (the new client shows an error block until the new endpoints exist; the old client's debt page keeps working against the new server because the old endpoints stay). No migration.

## 9. Not in this part

- «Qaytariladigan pul» and the refund flow (2b).
- Showing who is blocked from lessons (ADR-0047 admission) in the list.
- Debt page per-month history redesign (the history page is reused as is).
