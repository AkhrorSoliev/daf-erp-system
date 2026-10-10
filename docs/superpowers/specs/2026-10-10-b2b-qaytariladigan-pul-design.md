# B2b — «Qaytariladigan pul» page and the refund request flow — design

**Date:** 2026-10-10
**Status:** approved by the CEO in chat (10.10.2026, section by section, after viewing both mock-ups)
**Mock-ups:**
- https://claude.ai/artifact/YA4jhqf4NH8ZrqnBbjB9UL — section `v-refunds` and its drawer (CEO-approved 27.09)
- https://claude.ai/artifact/T2jLrgummxVZWAZsQErZ2m — the new parts: pending refunds, «Berildi», notice, transfer condition (CEO-approved 10.10)

**Builds on:** ADR-0055 (a withdrawal is revenue of its month), ADR-0058 (a cancelled refund counts in neither month), ADR-0059/0067 (not-studying kinds), ADR-0066 (a chat can refuse the bot), ADR-0072 (B2a), the Refunds Module rules in `server/CLAUDE.md`.
**Decision record:** ADR-0076 (written in the same PR).

## 1. Why and where this fits

Set B rebuilds Moliya from the approved mock-up. B2a («Qarzdorlik», #665) is live since 05.10. B2b is the second half of part 2.

Today a refund is one click: `POST /refunds/quick` writes the `Refund` row as COMPLETED, takes the money off the balance and out of the branch's cash drawer in the same second. There is no waiting state, nobody records when the money actually reached the student, and the contract's 10-bank-day term exists nowhere. The «Muzlatilganlarning puli» page shows only students frozen for more than 30 days; ungrouped and departed students' money is on no page at all.

CEO decisions (10.10.2026):
1. **Every refund goes through a request** — the student profile's «Pulni qaytarish» and the new page alike.
2. **Roles:** CEO, Branch Director and Administrator open a request; the Cashier may also press «Berildi».
3. **«Markaz hisobiga o'tkazish» is blocked by the system** until a notice was given and the term passed (§5).
4. **Notice:** a bot message for students linked to the bot, a «Qo'ng'iroq qilib aytildi» mark for the others.
5. **Bot text:** variant 1 (§5.3), word for word.

## 2. The refund request flow

### 2.1 States

`Refund.status` (existing enum, no new values):

| State | Meaning | Screen word |
|---|---|---|
| `REQUESTED` | Request open; balance already 0; money not handed over | «kutilmoqda» / «muddati o'tdi» |
| `COMPLETED` | Money handed over («Berildi») | «berildi» |
| `REJECTED` | Request cancelled before hand-over | «bekor qilindi» |

`APPROVED` and `PROCESSING` stay in the enum for old rows and are never written. `REFUND_TRANSITIONS` becomes `REQUESTED → [COMPLETED, REJECTED]` (plus the existing COMPLETED reverse, which is not a status transition).

### 2.2 Open a request — `POST /refunds/quick` (CEO, BD, Admin; unchanged route)

Same body, same amount rules as today (free balance first, then the fewest prepaid lessons, `prepaidRefundValue`, the 60-second duplicate guard, the balance-only and monthly warnings). In ONE Serializable transaction:

1. Create `Refund` with `status = REQUESTED`, `requestedAmount`, `reason`, `requestedById` (new), `dueDate` = the 10th bank day after today (§2.6).
2. Release prepaid lessons when needed (`releasePrepaidLessons`, ADJUSTMENT tagged `{ refundId, lessonsReleased }`) — unchanged.
3. `recordRefund`: the negative REFUND `Transaction` (linked by `refundId`) and the balance change. `recordRefund` books the cash outflow itself today (`transactions-write.service.ts`, `recordOutflow` inside); it gains an option to skip that step, and the request uses it.
4. **No `CashMovement`.** No receipt code.
5. Student history `PUL_QAYTARISH_SOROVI` (amount, due date, reason).

Response: the refund with `dueDate`. The balance is 0 (or reduced) from this moment, so the money cannot be spent on lessons, a withdrawal or another refund while the request waits.

### 2.3 Hand over — `POST /refunds/:id/hand-over` (CEO, BD, Admin, Cashier)

Body: `{ cashAccountId }`. The caller picks the drawer the money left: an account of the **student's branch** (400 otherwise; a branch confinement check like every id-addressed write). In ONE Serializable transaction, re-reading the row:

1. Refuse unless `status = REQUESTED` (409 «So'rov allaqachon yopilgan»).
2. `CashMovement` OUTFLOW of `requestedAmount` from that account, linked to the REFUND transaction (`CashMovementsService.recordOutflow` with `cashAccountId` and `transactionId` — it already accepts an explicit account).
3. `status = COMPLETED`, `handedOverAt = now`, `handedOverById`, `cashAccountId`, `refundMethod` from the account type (`CASH` → CASH, `BANK`/`CARD` → TRANSFER), `processedAt`/`processedById` = the same (old readers keep working), `receiptCode` generated (`Q-YYYY-NNNNN`).
4. Student history `PUL_QAYTARIB_BERILDI`.

The receipt endpoint already requires COMPLETED, so a receipt exists only after hand-over.

### 2.4 Cancel — `POST /refunds/:id/cancel` (CEO, BD)

Body: `{ reason }` (required, trimmed). Only `REQUESTED` (409 otherwise). In ONE Serializable transaction: reverse the REFUND transaction (`reverseTransaction` — the counter-row, `reversedAt` on the original), reverse the release ADJUSTMENT and give the lessons back (the existing `reverse()` unwind, without its cash step), `status = REJECTED`, `cancelledAt`, `cancelledById`, `cancelReason`. Student history `PUL_QAYTARISH_BEKOR_QILINDI`. The pair counts in neither month (ADR-0058).

`POST /refunds/:id/reverse` (CEO) stays the way to undo a **COMPLETED** refund (ledger + cash), unchanged.

### 2.5 Removed

`PATCH /refunds/:id/process` is deleted: no screen calls it, and its COMPLETED path writes the ledger a second time.

### 2.6 Bank days

A pure helper `addBankDays(fromDateStr, n, holidays)` (`src/common/date/bank-days.ts`): walks forward from the day AFTER `fromDateStr`, counts Monday–Friday days not in `holidays`, returns the n-th one (`YYYY-MM-DD`). `bankDaysBetween(todayStr, dueStr, holidays)` gives «N bank kuni qoldi» / «muddati o'tdi · N bank kuni».

Holidays = `buildHolidayDateSet` (active `Holiday` rows, company-wide or the student's branch). Known approximation, written in the ADR: the centre's holiday table stands in for the bank calendar; transferred working Saturdays are not modelled.

Example (in tests): request Mon 28.09.2026 with 01.10 a holiday → due Tue 13.10.

### 2.7 Reports

The REFUND ledger row is written at the request, so every ledger reader (net profit's refund leg, «Foyda tarkibi», the payments report, Excel, the Telegram «Diqqat» flag, the student statement) sees the refund **on the day it was requested**. The cash drawer and cash-flow reports see it **on the day it was handed over**. Between the two the money sits in «Kutilayotgan qaytarishlar». No reader changes its query.

The student statement's refund line reads «pul qaytarish» in both voices (was «naqd qaytarib berildi»), because at the request the money has not been handed over and it may leave by card.

## 3. The page — `/payments/refunds`

Roles: CEO, BD, Admin, Cashier (read). Nav item «Qaytariladigan pul» under Moliya, after «Ish haqi» (`payments-nav.ts`, `visibleForRoles: [1, 2, 3, 5]`). Breadcrumb «Qaytariladigan pul». Branch: the header switcher (`@BranchScope()`).

### 3.1 Header

«Qaytariladigan pul», «Bugungi holat · dd.MM», «Excel».

### 3.2 Summary card

«O'qimayotganlarning markazda turgan puli» — Σ positive balances of the three tabs below and the count of people, «N kishi — muzlatilgan, guruhsiz yoki ketgan». Line under it: «O'qiyotganlarning oldindan to'lagani bu yerga kirmaydi — u keyingi oy hisobiga o'tadi.» (Here the three tabs ARE added: it is money held, and the approved mock-up shows the total.)

### 3.3 «Kutilayotgan qaytarishlar»

All `REQUESTED` refunds in scope, oldest due first. Header: total amount and count; «Tarix · N ta →» links to `/payments/refunds/history`. Rule line: «So'rov ochilgan kuni o'quvchi balansi 0 bo'ladi. Pul kassadan «Berildi» bosilganda chiqadi. Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).»

Table (`#`, O'quvchi (name, ID · phone), Summa, So'ralgan (dd.MM), Muddat («dd.MM gacha»), Holat, actions):
- Holat pill: «N bank kuni qoldi» (muted; amber at ≤ 2), «muddati o'tdi · N bank kuni» (red).
- Actions: «Berildi» (roles 1, 2, 3, 5) and «Bekor qilish» (roles 1, 2).
- Paginated (default 10, sizes 10–50). Empty: «Hozir kutilayotgan pul qaytarish yo'q.» plus «Oxirgisi dd.MM da berilgan.» when there is a past one.

«Berildi» dialog: summa, «Qaysi kassadan» (the student's branch accounts, `CashAccount` name + type), note «Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.», buttons «Yopish» / «Berildi». «Bekor qilish» dialog: consequence text («Pul hali berilmagan. Bekor qilinsa, X so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.»), required «Sabab», destructive button «Bekor qilish».

### 3.4 Three tabs

`?tab=muzlatilgan|guruhsiz|ketgan` (default `muzlatilgan`). Each tab button: total, count and a sub-line (mock-up). The kinds are ADR-0067's, for students with `balance > 0`, `deletedAt: null`, not studying (`NOT activeStudentWhere()`): FROZEN = muzlatilgan, ACTIVE ungrouped (`ungroupedStudentWhere()`) = guruhsiz, any other status = ketgan. Studying students are never listed.

- **Muzlatilganlar:** age chips «Hammasi · N», «30 kungacha · N», «31–60 kun · N», «60 kundan ko'p · N» (days since `statusChangedAt`, Tashkent). Columns: #, O'quvchi, Muzlatilgan («dd.MM · N kun»), Holat (≤ 30 «kutilmoqda», 31–60 «muddati o'tgan», > 60 «ketgan hisoblanadi»), Puli, Xabar.
- **Guruhsiz / Ketganlar:** #, O'quvchi, Guruhsiz|Ketgan («dd.MM · N kun»), Oxirgi guruh, Puli, Xabar.
- «Xabar» = the latest valid notice (§5.1): «dd.MM · bot orqali» / «dd.MM · qo'ng'iroq qilib aytildi», or «berilmagan».
- Rule line per tab: the mock-up's three texts.
- Search (name, phone, ID) in the URL; server-side filter and paging (default 20, sizes 10–50), sort: largest balance first.

### 3.5 Drawer (row click)

Header name + «ID · phone». «Markazdagi puli X so'm». Rows: Holat, Oxirgi guruh, Oxirgi to'lov, Telegram bot («ulangan» / «ulanmagan»), Xabar. «Nima qilish mumkin»:

1. Muzlatilgan → «Qaytdi — guruhga qaytarish» (opens the existing status-change dialog to ACTIVE). Guruhsiz → «Guruhga qo'shish» (opens the existing enroll dialog with the student's branch).
2. «Pulni o'quvchiga qaytarish» → the refund dialog (§4), which opens a request.
3. «Xabar berish» → the message preview (§5.3) and «Botga xabar yuborish» when linked; «Qo'ng'iroq qilib aytildi» always (with an optional note). Hidden for Cashier.
4. «Markaz hisobiga o'tkazish» → the existing withdrawal dialog. Locked (§5.2) with the reason in amber; when open, a green line «Shart bajarilgan: xabar dd.MM, muddat dd.MM da tugagan, 30 kun o'tdi.». Hidden for Cashier.

The drawer closes before any dialog opens (B2a rule).

### 3.6 History — `/payments/refunds/history`

COMPLETED and REJECTED refunds in scope, newest first, paginated: #, O'quvchi, Summa, So'ralgan, Berildi («dd.MM · naqd|karta» or pill «bekor qilindi» with the reason on hover), Kim berdi / Kim bekor qildi. «← Qaytariladigan pul». Old COMPLETED rows (written before B2b) show their `processedAt` as «Berildi».

### 3.7 Excel

`GET /refundable/excel`: four sheets — «Kutilayotgan», «Muzlatilganlar», «Guruhsiz», «Ketganlar» — with the page's columns, money as numbers, the caller's branch scope, the active search applied.

### 3.8 Moved and redirected

- `/payments/frozen-balances` → redirect to `/payments/refunds?tab=muzlatilgan`; `GET /payments/frozen-balances` and `frozen-balance-view.tsx` are deleted with their tests; `FROZEN_BALANCE_ACTION_ROLES` goes.
- Debt page footer: the «Muzlatilganlarning puli →» link is replaced by the line «Muzlatilganlarning markazda turgan puli — «Qaytariladigan pul» sahifasida.» (link). `debt-url` legacy `?tab=muzlatilgan` now points to `/payments/refunds?tab=muzlatilgan`; `activePrefixes` of «Qarzdorlik» drops `/payments/frozen-balances`.
- Student profile «Pulni qaytarish»: the same refund dialog, now opening a request (§4). Hidden for Cashier (the server already refuses).

## 4. The refund dialog (`refund-dialog.tsx`)

Same preview and amount field. Changes: title «Pulni qaytarish — so'rov»; a line «So'rov ochilgach balans 0 bo'ladi. Pul dd.MM gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.» (due date from the preview response, `dueDate`); button «So'rovni ochish»; success toast «So'rov ochildi — pul dd.MM gacha beriladi». `GET /refunds/preview/:studentId` adds `dueDate`.

## 5. Notice and the transfer condition

### 5.1 Notice — `BalanceNotice` (new table)

`{ id, studentId, companyId, channel BOT|CALL, amount (balance at the moment), note?, smsMessageId?, createdById, createdAt }`.

`POST /students/:id/balance-notices` `{ channel, note? }` (CEO, BD, Admin; branch check on the student):
- `BOT`: render the text (§5.3), send through `SmsService.sendToStudent(... type AUTO, assertCallerBranch)`. Only a `SENT` result writes the notice (with `smsMessageId`); `FAILED` → 400 «Botga xabar yetmadi — qo'ng'iroq qiling», nothing written; the raw reason stays in the SMS log (Telegram's own message is English, and no English word is shown on screen). A student with no linked chat → 400 «Telegram bog'lanmagan — qo'ng'iroq qiling». A branch with no phone and a company with no phone → 400 «Filial telefon raqami kiritilmagan».
- `CALL`: writes the notice; the note is optional.
- Student history `PUL_HAQIDA_XABAR_BERILDI` (kanal, summa).

A notice is **valid** only if `createdAt ≥ student.statusChangedAt` (it was given in the student's current state): a notice given before the student came back and left again does not count.

### 5.2 The transfer condition

`transferAllowedFrom(noticeDateStr) = addBankDays(noticeDateStr, 10) + 30 calendar days` (the 10 bank days are the refund term the notice starts; «muddatdan keyin 30 kun» is the contract's wait). Example: notice Sat 10.10.2026 → term to 23.10 → transfer from 22.11.

`WithdrawalsService.create` refuses (400) unless the student's latest valid notice exists and today (Tashkent) ≥ `transferAllowedFrom`:
- no valid notice: «Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.»
- too early: «Markazga o'tkazish dd.MM dan ochiladi (xabar dd.MM da berilgan, qaytarish muddati dd.MM gacha).»

`GET /withdrawals/preview/:studentId` adds `{ notice: { date, channel } | null, termEnds, allowedFrom, allowed }` so every dialog shows the lock before the user types. The condition applies to every withdrawal, the profile's «Yechib olish» included: a withdrawal is the money going to the centre (ADR-0055).

### 5.3 Bot text (CEO 10.10, second version — do not reword)

The first version (one plain paragraph) was replaced the same day: the CEO found it dry and asked for the key parts to stand out. Telegram HTML (`<b>`), line breaks as shown:

```
<b>💰 Hisobingizda pul qolgan</b>

Hurmatli {Ism}!

DaF Sprachzentrum hisobingizda <b>{summa}</b> qolgan.
Uni qaytarib olish uchun <b>{kun}-{oy}gacha</b> filial raqamiga qo'ng'iroq qiling:
📞 {telefon}

⚠️ Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul <b>markaz hisobiga o'tadi</b>.

Rahmat!
```

- {Ism} = `Student.firstName` (escaped); an empty first name makes the greeting line «Assalomu alaykum!» (the payment receipt's rule). {summa} = `formatSum(balance)` («350 000 so'm»); {kun}-{oy}gacha = `transferAllowedFrom` of today's notice, e.g. «22-noyabrgacha» (month names lowercase: yanvar … dekabr); {telefon} = the student's branch `phone`, else the company's, as «+998 XX XXX XX XX».
- The text lives in one pure function (`balance-notice-text.ts`) with a test that pins the example above (Mohira, 350 000, 22.11).
- The drawer's `noticePreview` is the same text as plain text (tags removed, entities decoded, line breaks kept), so the page never shows raw `<b>`.

### 5.4 Messages to the student about their refund (CEO 10.10)

Sent at once (an addition to ADR-0025's instant list, like the payment receipt), after the write commits, only to a student whose card has a `telegramChatId`, through `SmsService.sendToStudent` (type AUTO). A failed send is logged and never fails the write. Same formatting rules as §5.3; {telefon} = branch phone, else company phone; when neither exists the «📞» line is left out (these are informational, unlike the notice).

On «So'rovni ochish» (§2.2):
```
<b>🔄 Pulni qaytarish so'rovi qabul qilindi</b>

Hurmatli {Ism}!

Qaytariladigan summa: <b>{summa}</b>
Pul <b>{kun}-{oy}gacha</b> qaytarib beriladi.
Bu summa hisobingizdan ushlab turiladi — joriy balansingiz: <b>{balans}</b>

📞 Savol bo'lsa: {telefon}

Rahmat!
```
{kun}-{oy}gacha = the request's `dueDate`; {balans} = the balance after the request.

On «Berildi» (§2.3):
```
<b>✅ Pulingiz qaytarib berildi</b>

Hurmatli {Ism}!

<b>{summa}</b> qaytarib berildi — <b>{usul}</b>.
Sana: <b>{dd.MM.yyyy}</b>

📄 Kvitansiya: {havola}

DaF Sprachzentrum'ni tanlaganingiz uchun rahmat!
```
{usul} = «naqd» for a CASH drawer, «kartaga» for BANK/CARD; {havola} = the public refund receipt PDF (`GET /receipts/refund/:id.pdf`, `@Public()`).

On «Bekor qilish» (§2.4):
```
<b>↩️ Pulni qaytarish so'rovi bekor qilindi</b>

Hurmatli {Ism}!

<b>{summa}</b> qaytarish so'rovingiz bekor qilindi.
Sabab: {sabab}
Pul hisobingizga qaytdi — joriy balansingiz: <b>{balans}</b>

📞 Savol bo'lsa: {telefon}
```
{sabab} = the cancel reason (escaped); {balans} = the balance after the unwind.

## 6. Data model (one migration)

- `Refund`: add `requestedById Int?`, `handedOverAt DateTime?`, `handedOverById Int?`, `cashAccountId String?` (`CashAccount.id` is a uuid), `cancelledAt DateTime?`, `cancelledById Int?`, `cancelReason String?` (+ relations to `User` / `CashAccount`). `dueDate` is reused for the 10-bank-day deadline.
- New `enum BalanceNoticeChannel { BOT CALL }` and `model BalanceNotice` (§5.1), indexes `(studentId, createdAt)`, `(companyId)`.
- No data backfill: the 7 existing refunds are COMPLETED and stay as they are.

## 7. Server modules

- `src/refunds/`: `RefundsCreateService.quickRefund` (REQUESTED, no cash), new `RefundsHandOverService` (hand-over + cancel), controller routes (§2), `process()` removed, `findAll` gains `status` (comma list) and branch scope.
- `src/refundable/` (new): `RefundableController` — `GET /refundable/list` (summary, tab totals, chips, pending page), `GET /refundable/students/:id` (drawer), `GET /refundable/excel`; pure `refundable.math.ts` (kinds, age buckets, pills, sums) with tests; roles CEO/BD/Admin/Cashier, `@BranchScope()`, ADR-0063 named 404 for another branch's student.
- `src/balance-notices/` (new): controller, service, `balance-notice-text.ts`, `transfer-condition.ts` (pure: valid notice, `transferAllowedFrom`, the refusal text).
- `src/common/date/bank-days.ts` (pure) + spec.
- `src/withdrawals/`: the condition in `create` and `preview`.
- `src/statements/present-statement.ts`: the refund label.
- Route manifest (`branch-route-policy.ts`) entries for the new routes.

## 8. Client

- `components/payments/refunds/`: page, pending table, tab tables, drawer, hand-over dialog, cancel dialog, history page, queries, URL schema, format helpers, tests (static render + pure helpers).
- `refund-dialog.tsx` (§4), `withdrawal-dialog` shows the lock from the preview.
- Nav, breadcrumbs, redirects (§3.8), role constants in `role-access.ts` (`REFUND_REQUEST_ROLES = [1,2,3]`, `REFUND_HAND_OVER_ROLES = [1,2,3,5]`, `REFUND_CANCEL_ROLES = [1,2]`).
- User guide: `tolovlar/pul-qaytarish.mdx` rewritten for the request flow, a page for «Qaytariladigan pul», `yangiliklar.ts` entry; `qarzdorlik.mdx` link updated.

## 9. Tests that must exist

- Bank days: weekends, a holiday inside, a request on Friday/Saturday, the §2.6 and §5.2 examples.
- Request: balance 0 at once, no `CashMovement`, `dueDate`, duplicate guard kept, prepaid release kept.
- Hand-over: account of another branch refused, double hand-over 409, `CashMovement` amount and account, receipt code, Cashier allowed; cancel: BD allowed, Admin/Cashier 403, balance and lessons back, REJECTED.
- Withdrawal: no notice → 400, too early → 400 with dates, allowed day passes, a notice from before the current status does not count.
- Notice: BOT `FAILED` writes nothing, no chat → 400, text pinned.
- Refundable: kinds match ADR-0067's split for positive balances, studying excluded, branch scope, 404 for another branch, chip counts add up to the tab count.
- Controller role specs for every new route.

## 10. Out of scope

- A Telegram «Diqqat» flag for overdue refunds.
- Partial hand-over of a request.
- A bank calendar separate from the centre's holidays.
