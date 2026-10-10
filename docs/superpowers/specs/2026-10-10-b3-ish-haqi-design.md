# B3 — «Ish haqi» page — design

**Date:** 2026-10-10
**Status:** approved by the CEO in chat (10.10.2026: two questions, the rules section, then the new-parts mock-up «Ko'rdim, to'g'ri»)
**Mock-ups:**
- https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — section `v-salary` and its drawer (CEO-approved 27.09)
- https://claude.ai/artifact/D5FjBnDj9no1i33QWQBUhh — the new parts: summary with month status, «E'tibor talab qiladi», one table, row drawer, «Berildi» dialog, advance status, staff bot message (CEO-approved 10.10)

**Builds on:** ADR-0006 (salary is read only from `getMonthly`), ADR-0050 (rates), ADR-0051 (uncharged monthly lesson priced at the pack price), ADR-0052 (unpaid share of a monthly charge shows as «Markaz qo'shdi»), ADR-0058 (payroll branch scope), ADR-0072 (B2a moved «Markaz qoplagani» here), the salary month-settle design (`2026-08-06-salary-month-settle-design.md`).
**Decision record:** ADR-0080 (written in the same PR; renumber if `main` takes 0080 first).

## 1. Why and where this fits

Set B rebuilds Moliya from the approved mock-up. Part 1 (#658), 2a (#665) and 2b (#686) are live. Part 3 is «Ish haqi» (`/payments/salary`).

What is wrong today:
- Two tables (teachers, staff) with eight technical columns. «O'quvchilar to'lagan» and «Markaz qo'shdi» sit next to the pay and read as parts to add.
- No summary and no month state. Nobody can see at a glance whether a month is still running, calculated, approved or paid.
- **«Avans» lies.** The row shows advances whose date falls in the month. The cron (`applyPendingAdvances`) nets ALL unsettled advances in `createdAt` order, whatever their date — so an advance given on 1 October at 01:00 is taken from September's salary, and an advance never netted is invisible in the month it is netted from.
- The row drawer opens only after the month is calculated, and it is a per-lesson list.
- «To'lash» (single payment) asks for nothing: no date, no account; the money silently leaves the payee branch's oldest CASH account. The CEO made «date + cash/card amount for every person» a condition on 27.09.
- «Hisoblash davri» can be changed; the monthly payment system needs calendar months.
- Staff get no message when their salary is handed over.

CEO decisions (10.10.2026):
1. «Markaz qo'shdi» leaves the table: one line under the summary and a split line in the row drawer.
2. «Berildi» sends the staff member a bot message (text §6, word for word).
3. Advances, month states, the «Berildi» dialog and the roles as §3–§5.

## 2. The page — `/payments/salary`

Access unchanged (capabilities, ADR-0079): the page and its reads need `salary.view` (CEO, Branch Director by default); «Tasdiqlash» and the month-wide settle need `salary.close` (CEO); «Berildi» needs `salary.pay` (CEO, Branch Director); advances need the expense capability they already use. Branch: the header switcher (`@BranchScope()` → `narrowPayrollScope`).

### 2.1 Header

«Ish haqi», month picker (`?month=`, floor and ceiling as today), «Stavkalar» (opens the existing settings sheet — renamed from «Sozlamalar»), primary «+ Avans berish» (the existing advance dialog — renamed from «Avans qo'shish»).

Tabs (`?tab=`, unchanged keys): «Oyliklar» · «Avanslar · X mln» · «Markaz qoplagani · X mln». The two amounts: the month's advances by date (the Avanslar tab total) and the tab's outstanding total; hidden while loading or when 0.

### 2.2 Summary card («Oyliklar» tab)

Title «{Oy} oyliklari» and the month-state pill (§4). Three figures:
- «Ishladi» — teachers `totals.fullDeserved` + staff `staffTotals.monthly`; sub-line «ustozlar X · xodimlar Y».
- «Avans (oylikdan ushlanadi)» — `totals.advances + staffTotals.advances` under the new rule (§3); sub-line «N ta».
- «Oy oxirida beriladi» (open month) / «Beriladi» (any other state) — `totals.netToPay + staffTotals.netToPay`; sub-line «N ustoz · M xodim», or «N kishiga berildi · M kishi qoldi» when partly paid.

Line under the figures, only when the month has lesson data and `totals.centerFunded > 0`: «shundan **markaz qo'shdi — X**» + muted «o'quvchilar sentabr to'lovini hali to'lamagan; to'lagan sari kamayadi» (month name of the selected month).

Bulk line, CEO only, when the month is calculated and some rows are unpaid: muted text «Hammasi bir kunda berilgan bo'lsa — bir yo'la belgilash. Sana va har filial kassa/karta summalari so'raladi.» and the existing button «Oylik berilganini tasdiqlash (N ta)» → the existing `SettleMonthDialog`.

Green check line: «Umumiy ma'lumotlardagi «Oyliklar» kartasi va ustozning «Mening oyligim» sahifasi — shu raqamlar».

Months without per-lesson data (`hasLessonData` false, e.g. May) keep today's amber note and show «—» for the teachers' part, as the B1 card does.

### 2.3 «E'tibor talab qiladi»

Amber card, shown only when it has a row:
1. **Lessons without a rate** — for every teacher row with `noConfigUnits > 0`: «**N ta darsga ustoz haqi yozilmagan** — {Ism} uchun stavka qo'yilmagan.» One row per teacher, button «Stavka qo'yish» (opens the settings sheet). CEO and BD.
2. **Staff without a salary** — active staff (§7.2) of the scope with no FIXED_MONTHLY version covering the month: «**N xodimning oyligi hisoblanmaydi** — {Ism}, {Ism} uchun oylik summa kiritilmagan.» Button «Stavka qo'yish». Shown only to a viewer who can edit staff rates (the settings sheet's staff section rule, `resolveSalarySettingsAccess`).

### 2.4 One table

Search («Ism yoki ID», `?search=`) and a segment «Hammasi · N» / «Ustozlar · N» / «Xodimlar · N» (`?kim=all|teachers|staff`, unchanged keys).

Columns: Xodim (name; sub-line role — «Ustoz» or the staff `position`, «Nofaol» badge kept), Nimadan, Ishladi, Avans, Beriladi, Holat. Teachers first (today's order), then staff. Footer «Jami · N kishi» with the three sums. Row click (and Enter/Space) opens the drawer (§2.5) — for every row, calculated or not.

- **Nimadan:** teachers «N guruh · M o'quvchi» (distinct groups / students of the month's lessons, from the same pass, §7.1); staff «qat'iy oylik», plus «· d/D kun» when prorated (`fixedMonthlyCoverage` next to `prorateFixedMonthly`: active days / period days).
- **Ishladi:** teachers `fullDeserved`, staff `monthly`.
- **Avans:** §3. «0» muted when 0.
- **Beriladi:** `netToPay`, bold.
- **Holat:** open month «oy davom etmoqda»; past month without a payment «hisoblanmagan»; CALCULATED «hisoblandi» (amber); APPROVED «tasdiqlandi» (blue); PAID «berildi dd.MM» (green, `paidAt`).

Muted footnote: «Jadvalda «O'quvchilar to'lagan / Markaz qo'shdi» ustunlari yo'q — ular xodim oynasida. «Avans» — aynan shu oylikdan ushlanadigan summa. Hisoblash davri doim kalendar oyi (1-sanadan).»

The «Markaz qo'shimchasi — undirish holati» card moves from the Oyliklar tab to the top of the «Markaz qoplagani» tab (same data, same month).

### 2.5 Row drawer

Replaces `SalaryBreakdownDrawer` and `SalaryAdvanceBreakdownDrawer` on this page. Data: `GET /salary/monthly/user/:userId/detail?month=` (§7.1).

- Header: name, «{role} · {Oy} {yil}».
- Total box: «Oy oxirida beriladi» / «Beriladi» / «Berildi» + `netToPay`.
- «Stavka»: the person's rate label for the month (teacher: the global config version's label, e.g. «Har o'quvchi uchun oyiga 200 000 so'm» or «Foiz: o'quvchi to'lovining 45%»; staff: «Oyiga X so'm», plus «; dd.MM dan ishlagan — D kundan d tasi» when prorated). A teacher with no global version but group rates: «Guruhlar bo'yicha — pastda».
- «Guruhlar bo'yicha» (teachers): one line per group — name, «N o'quvchi · M dars», amount, and the group's rate label when it differs from the global one. Below: «shundan o'quvchilar to'lagan **X** · markaz qo'shdi **Y** (o'quvchilar hali to'lamagan)», or «hammasini o'quvchilar to'lagan» when Y is 0. A carried-in amount shows as one more line «Oldingi oydan — X».
- «Avanslar — shu oylikdan ushlanadi»: date, method («naqd»/«karta»), amount — exactly the advances §3 nets; «Avans olinmagan» when none.
- «Hisob»: «Ishladi» / «Avans (ushlanadi) − X» / «**Beriladi**». For a calculated month whose payment no longer equals «Ishladi − Avans» (data changed after the cron), one more line «Hisoblangandan keyin o'zgardi: ±X» so the equation always closes on the frozen `payment.amount`.
- PAID: green box «Berildi dd.MM.yyyy», one line per cash slice («naqd X — {kassa nomi}», «karta Y — {hisob nomi}»), «Kim belgiladi: {Ism}».
- Actions: «Darslar bo'yicha (CSV)» (always; open month = the period's live accruals, calculated month = the payment's accruals — the two existing breakdown readers), «Tasdiqlash» (CEO, CALCULATED; existing `PATCH /salary/payments/:id/approve`), «Berildi» (CEO/BD, APPROVED → §5). Disabled buttons in the open month; hint per state: «Tasdiqlash va «Berildi» — oy hisoblangach (1-{keyingi oy}) ochiladi.» / «Avval CEO tasdiqlaydi, keyin «Berildi» ochiladi.» / «Berilgan oylik o'zgartirilmaydi.»
- The drawer closes before the «Berildi» dialog opens (B2a rule) and reopens on the same row after success.

### 2.6 «Avanslar» tab

Calendar and day panel unchanged. Added under them: a table of the month's advances (by date, newest first) — Sana, Kimga, Summa, Naqd / karta, Kim berdi, Holat:
- settled → «{oy} oyligidan ushlangan» (green), `{oy}` = the settling payment's month;
- unsettled → «{oy} oyligidan ushlanadi» (amber), `{oy}` = the advance's own month (§3).

Footnote: «Avans berilgan oyining oyligidan ushlanadi.»
`GET /salary/advance-calendar` gains `@BranchScope()` and `narrowPayrollScope`, so the tab follows the header switcher like `/salary/monthly`.

### 2.7 «Markaz qoplagani» tab

Unchanged, plus the undirish card moved from Oyliklar (§2.4).

### 2.8 Settings

The «Hisoblash davri» section is removed from the settings sheet. `POST /salary/period-settings` refuses any `cycleStartDay` other than 1: 400 «Hisoblash davri — kalendar oyi (1-sanadan); o'zgartirilmaydi». Production is already on 1. `GET` stays.

## 3. What «Avans» means

One pure function, used by the cron and by the read side, so the screen equals what will be deducted:

`planAdvanceNetting(pending, grossAmount, periodEndDateExclusive)` → `{ settle: id[], total }`
- `pending`: the person's unsettled, not deleted TEACHER_ADVANCE expenses.
- Only advances with `date < periodEndDateExclusive` count (`Expense.date` is `@db.Date`; the end is the period's exclusive Tashkent day). Later ones wait for their own month.
- Walk in `createdAt` order; stop at the first advance that does not fit into what is left of `grossAmount` (today's behaviour — the rest rolls over).

Cron: `applyPendingAdvances` (both the accrual and the FIXED_MONTHLY branch) calls it with its period. This is the one money-behaviour change: an advance dated after the period end is no longer taken from that period's payment.

Read side (`getMonthly`, `getMonthlyForUser`, the detail endpoint, Telegram, Excel, the B1 card — all through `getMonthly`):
- Month with a payment: `advances` = Σ advances with `settledBySalaryPaymentId = payment.id`; `netToPay = payment.amount` (unchanged).
- The current (open) month: `advances` = Σ of every unsettled advance dated before `nextMonthStart`, not capped — the month's earnings are still growing, and capping by today's partial figure would show 0 mid-month for an advance the month-end payout will take; `netToPay = max(0, base − advances)`.
- A past month without a payment (the hours before the cron): `advances = planAdvanceNetting(unsettled, base, nextMonthStart).total` — exactly what the cron will net; `netToPay = base − advances`.
- `base` is the pre-advance figure (`accrued + gap` in top-up months, `accrued` before, staff `monthly`).

Consequence to state in the ADR: until 02:00 on the 1st, an unsettled advance of the closed month also appears in the new month's open view; the cron settles it a few hours later.

The B1 card's sub-line «avans berilgan» becomes «avans (ushlanadi)».

## 4. Month state

`getMonthly` returns `monthState` (top level):

| Value | When | Pill |
|---|---|---|
| `OPEN` | the selected month is the current Tashkent month | «Oy davom etmoqda · {oxirgi kun dd.MM} dan keyin hisoblanadi» (muted) |
| `NOT_CALCULATED` | past month, no non-cancelled payment in scope | «Hisoblanmagan» (muted) |
| `CALCULATED` | some payment CALCULATED, none PAID | «Hisoblandi · tasdiqlash kutilmoqda» (amber) |
| `APPROVED` | all non-paid payments APPROVED, none PAID | «Tasdiqlandi · berish kutilmoqda» (blue) |
| `PARTLY_PAID` | some PAID, some not | «Qisman berildi · {paid} / {total}» (blue) |
| `PAID` | every payment PAID | «Berildi» (green) |

Counted over the teachers' and staff payments the page shows (same scope). `monthState` also carries `paidCount` and `payableCount`.

## 5. «Berildi»

### 5.1 Dialog

Title «{Ism} — {oy} oyligi berildi». Muted «Pul tanlangan kassa va kartadan chiqadi. Keyin xodimga bot xabari boradi.»
- **Summa:** `payment.amount`, read-only.
- **Sana:** date input, default today; not in the future, not before the period start (`parseSettlePaidAt`'s rules).
- **Naqd:** account select (the payee branch's active CASH accounts) + amount. Default: the whole sum.
- **Karta:** account select (the payee branch's active BANK and CARD accounts) + amount. Default 0. The row is hidden when the branch has none.
- **Izoh:** optional.
- Live check: «✓ Naqd + karta = X so'm» (green) or «Naqd + karta X so'm bo'lishi kerak, hozir Y so'm» (red); «Berildi» is disabled until they match.
- A 0 amount (advances took the whole salary) shows no account rows and submits with no slices.
- Buttons «Bekor qilish» / «Berildi». Success toast «Berildi — xodimga xabar yuborildi» («Berildi» alone when the person has no bot chat — the response says which).

### 5.2 Server — `POST /salary/payments/:id/pay`

Body becomes required: `{ paidAt: 'YYYY-MM-DD', cashSlices: [{ cashAccountId, amount }], note? }` (`PayPaymentDto`). Capability `salary.pay` (unchanged); the existing home-branch check for a non-CEO payer stays.

Checks, all before any write: payment of the company and APPROVED (`assertValidTransition`); `paidAt` per `parseSettlePaidAt`; every slice amount > 0, Σ slices = `payment.amount` (empty only when the amount is 0); every account active, not deleted, of the company and of the payee's branch (the payee's `mainBranch`). A payee without `mainBranch` is refused: «Xodimning filiali aniqlanmagan — oylikni berib bo'lmaydi». Refusals in Uzbek, e.g. «Kassa xodim filialiga tegishli emas», «Naqd va karta yig'indisi oylikka teng emas».

Write: through `writeSettledRows` with one row and the plan's `cashSlices` (one Serializable tx: re-read, `recordSalaryPayment` with the slices, `status PAID`, `paidAt` = the chosen day, `paidById`, the note). The ledger description stays «Oylik to'landi» for this route (the settle routes keep theirs). A second click finds PAID and returns 409 «Bu oylik allaqachon berilgan».

`batchPay` (no client caller) is left as is.

### 5.3 Event

After commit, the two routes a person uses to turn a payment PAID — single pay and settle-month — emit `salary.paid` `{ salaryPaymentId, companyId }` once per payment (`SALARY_EVENTS.PAID` constant at each call site, so the event-wiring scan sees it). `SalarySettleAllocatedService` (used only by the past-months script) does not emit: closing old months must not message staff.

## 6. Staff bot message

Listener `salary.paid` in `NotificationEventsListener` (its existing `sendTelegram(userId, parts)`): `User.telegramChatId`, skipped without a chat, errors logged and swallowed, never blocks the payout. Text in `salary-paid-text.ts` (pure, pinned by tests), HTML parse mode:

With advances:
```
<b>✅ {Oy} oyligingiz berildi</b>

Hurmatli {Ism}!

{Oy} {yil} uchun hisoblandi: <b>{gross} so'm</b>
Avans ushlandi: <b>{avans} so'm</b>
Berildi: <b>{net} so'm</b>{usul}
Sana: <b>{dd.MM.yyyy}</b>

Batafsil — tizimdagi «Ish haqi» bo'limida.

Rahmat!
```

Without advances:
```
<b>✅ {Oy} oyligingiz berildi</b>

Hurmatli {Ism}!

{Oy} {yil} uchun: <b>{net} so'm</b>{usul}
Sana: <b>{dd.MM.yyyy}</b>

Batafsil — tizimdagi «Ish haqi» bo'limida.

Rahmat!
```

- `{Oy}` = the payment's period month, capitalised Uzbek name («Sentabr»); `{Ism}` = `firstName`; amounts with space thousands.
- `gross` = `payment.amount` + Σ advances settled by it; `avans` = that Σ; `net` = `payment.amount`; `dd.MM.yyyy` = `paidAt` in Tashkent.
- `{usul}` from the payment's cash movements: only CASH → « — naqd»; only BANK/CARD → « — kartaga»; both → « — naqd {X}, kartaga {Y}»; none → empty.

## 7. Server modules

### 7.1 `getMonthly` and the detail endpoint

- `getMonthly`: `monthState` (§4); advances per §3; per teacher `groupCount` and `studentCount` and per-group buckets (`groupId`, name, students, lessons, `amount`, `covered`, `centerFunded`, rate label) collected in the SAME per-lesson pass that builds `fullDeserved`, so Σ group amounts = `fullDeserved` (test). `attention` (§2.3): `lessonsWithoutRate[{userId, name, units}]`, `staffWithoutRate[{userId, name}]`.
- `GET /salary/monthly/user/:userId/detail?month=` (`salary.view`, `@BranchScope()`, ADR-0063-style named 404 outside scope): the person's row from `getMonthlyForUser`, groups, the netted advances (id, date, amount, method, given by), rate label(s), the payout (`paidAt`, slices with account name and type, `paidBy`) when PAID, and the frozen-vs-live difference (§2.5).
- `GET /salary/monthly/user/:userId/lessons?month=` (`salary.view`, scoped): the CSV source for an open month — the existing `fetchAccrualBreakdown` with the period filter (calculated months keep `GET /salary/payments/:id/breakdown`).

### 7.2 Staff without a salary

Users of the scope who are not deleted, `status` ACTIVE, `isActive`, have no Teacher, Student or CEO role, and no FIXED_MONTHLY version overlapping the month. (A terminated person is never listed — see the payroll-employment memory: a config window is not evidence of employment.)

### 7.3 Other

- `planAdvanceNetting` in `salary/shared/advance-netting.ts` + spec; `applyPendingAdvances` uses it.
- `PayPaymentDto`, `payPayment` rewrite (§5.2), events (§5.3), `salary-paid-text.ts` + listener.
- `advance-calendar` branch scope (§2.6) and the advances' «ushlanadi/ushlangan» month per row (`settledMonth` or `ownMonth`).
- `period-settings` refusal (§2.8).
- Route manifest (`branch-route-policy.ts`) entries and `route-access.snapshot.json` rows (Branch Director, CEO) for the two new routes, both `@Can('salary.view')`; `docs/role-access.md`, `server/CLAUDE.md` (salary section, the instant-sender list) follow.

## 8. Client

- `salary-monthly-view.tsx` rebuilt: summary, attention, one table (`salary-monthly-staff-table.tsx` folded in), footnote.
- New `salary-row-drawer.tsx` (+ `salary-row-drawer-model.ts` pure helpers) and `salary-pay-dialog.tsx`; the old breakdown and advance-breakdown drawers are deleted when nothing else imports them.
- `GET /salary/advances/:userId` follows §3 if any caller remains after the drawers go; otherwise it is removed with its spec.
- `salary-advances-tab.tsx`: the table under the calendar; branch header.
- `center-topup-view.tsx`: the moved card.
- Settings sheet without «Hisoblash davri» (`salary-period-control.tsx` deleted).
- B1 `salary-card.tsx` sub-label.
- User guide: new page `tolovlar/ish-haqi.mdx` (roles CEO, BD) and a `yangiliklar.ts` entry. No prettier on client files.

## 9. Tests that must exist

- `planAdvanceNetting`: date cut-off at the period end, `createdAt` order, stops at the first that does not fit, empty input.
- Cron: an advance dated on the 1st of the next month is not settled into the closed month; one dated inside is.
- `getMonthly`: open month advances = the plan; paid month = the payment's settled advances; open-month rows satisfy `Ishladi − Avans = Beriladi`; Σ group amounts = `fullDeserved`; `monthState` for each row of §4's table; attention lists (terminated staff excluded, CEO excluded).
- Pay: 400 for a future date, a date before the period, a slice of another branch, a sum mismatch; 409 on a second pay; CashMovements per slice; `paidAt` stored; BD of another branch 403; amount 0 with no slices passes.
- `salary.paid` emitted after commit by all three routes; the listener skips a user without a chat; text pinned for both variants and the three `{usul}` forms.
- Period settings: 400 for 8, 201 for 1.
- Advance calendar: branch header narrows the list.
- Controller role specs for the new routes.
- Client: summary pills per state, attention item 2 hidden for BD, table merge order and totals, pay dialog validation and the 0-amount case, drawer hint per state.

## 10. Out of scope

- Giving a salary in several parts.
- A salary adjustment (adding or taking an amount outside lessons and advances).
- A business date on `CashMovement` (the movement keeps its creation time; `paidAt` is on the payment).
- A per-lesson table inside the drawer (the CSV covers it).
- A bot message for advances.
