# B2b «Qaytariladigan pul» Implementation Plan — server part

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every refund becomes a request (balance taken at once, cash out of the drawer only at «Berildi», due on the 10th bank day), a balance notice starts the clock that unlocks «Markaz hisobiga o'tkazish», and one read API (`/refundable/*`) serves the new «Qaytariladigan pul» page in place of `GET /payments/frozen-balances`.

**Architecture:** A pure bank-day helper (`common/date/bank-days.ts`) plus one holiday loader (`termHolidays`) feed every date in the feature. `RefundsCreateService.quickRefund` writes `REQUESTED` with `dueDate`; `recordRefund` stops writing a cash movement; `RefundsProcessService` gains `handOver` (cash movement, `COMPLETED`) and `cancel` (ledger unwind shared with `reverse`, `REJECTED`); `process()` is deleted. A new `balance-notices/` module holds the notice table writer, the pinned bot text and the pure transfer condition, which `WithdrawalsService` (create + preview) and the new `refundable/` read API both read. The page's math lives in `refundable/refundable.math.ts` (pure, tested).

**Tech Stack:** NestJS + Prisma 7 (Postgres) + Jest + exceljs. No new dependency.

**Code in this plan is written compactly; `npx prettier --write` (server only) reformats it.**

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-10-10-b2b-qaytariladigan-pul-design.md` — read once, in full, before Task 1. The client half of the plan is written from the **API contract** at the end of this file; do not change a route, field name or text without changing that section in the same commit.
- **Where commands run.** Worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b2b-qaytariladigan-pul` (never `cd` to the main checkout). Server commands are written `cd server && …`; git commands from the worktree root with repo-relative paths.
- **Server commands** (from `server/`): one spec `npx jest <path>`; `npm run typecheck` (type-checks specs — jest is transpile-only); `npx eslint <files>`; `npx prettier --write <touched .ts files>` (Prettier failures block CI). Each implementer runs its task's focused specs + `npm run typecheck`; the controller runs `npm test` and lint after each task. Never run the server build and server tests in parallel (shared Prisma generation).
- **States (spec §2.1, `RefundStatus`, no new values):** `REQUESTED` — request open, balance already 0, money not handed over («kutilmoqda» / «muddati o'tdi»); `COMPLETED` — money handed over («berildi»); `REJECTED` — request cancelled before hand-over («bekor qilindi»). `APPROVED` and `PROCESSING` stay in the enum for old rows and are never written. `REFUND_TRANSITIONS` becomes `REQUESTED → [COMPLETED, REJECTED]`.
- **Roles per route (spec §1, §2, §3, §5):** open a request `POST /refunds/quick` — CEO, Branch Director, Administrator; «Berildi» `POST /refunds/:id/hand-over` — CEO, Branch Director, Administrator, Cashier; cancel `POST /refunds/:id/cancel` — CEO, Branch Director; reverse a COMPLETED refund `POST /refunds/:id/reverse` — CEO (unchanged); the page reads (`GET /refundable/*`, `GET /refunds`) — CEO, Branch Director, Administrator, Cashier; notice `POST /students/:id/balance-notices` — CEO, Branch Director, Administrator; withdrawals — CEO, Branch Director, Administrator (unchanged).
- **Bank-day rule (spec §2.6):** `addBankDays(fromDateStr, n, holidays)` walks forward from the day AFTER `fromDateStr`, counts Monday–Friday days not in `holidays`, returns the n-th one (`YYYY-MM-DD`). Holidays = `buildHolidayDateSet` (active `Holiday` rows, company-wide or the student's branch). Known approximation (written in the ADR): the centre's holiday table stands in for the bank calendar; transferred working Saturdays are not modelled. Example (in tests): request Mon 28.09.2026 with 01.10 a holiday → due Tue 13.10.
- **Transfer formula (spec §5.2):** `transferAllowedFrom(noticeDateStr) = addBankDays(noticeDateStr, 10) + 30 calendar days`. Example: notice Sat 10.10.2026 → term to 23.10 → transfer from 22.11. A notice is **valid** only if `createdAt ≥ student.statusChangedAt`; the condition reads the student's latest valid notice; `WithdrawalsService.create` refuses unless today (Tashkent) ≥ `transferAllowedFrom`. It applies to every withdrawal, the profile's «Yechib olish» included.
- **Bot text (spec §5.3, variant 1, CEO 10.10 — do not reword):** «Assalomu alaykum, {Ism}! DaF Sprachzentrum hisobingizda {summa} so'm qolgan. Uni qaytarib olish uchun {kun}-{oy}gacha filial raqamiga qo'ng'iroq qiling: {telefon}. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!» — {Ism} = `Student.firstName`; {summa} = balance, `uz-UZ` with spaces; {kun}-{oy}gacha = `transferAllowedFrom` of today's notice, e.g. «22-noyabrgacha» (month names lowercase: yanvar … dekabr); {telefon} = the student's branch `phone`, else the company's, as «+998 XX XXX XX XX».
- **Refusal texts, verbatim:** 409 «So'rov allaqachon yopilgan»; 400 «Telegram bog'lanmagan — qo'ng'iroq qiling»; 400 «Filial telefon raqami kiritilmagan»; 400 «Botga xabar yetmadi — qo'ng'iroq qiling» (every FAILED bot send); 400 «Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.»; 400 «Markazga o'tkazish dd.MM dan ochiladi (xabar dd.MM da berilgan, qaytarish muddati dd.MM gacha).»
- **Statement label (spec §2.7):** the student statement's refund line reads «pul qaytarish» in both voices.
- **Student history keys (spec §2, §5.1):** `PUL_QAYTARISH_SOROVI`, `PUL_QAYTARIB_BERILDI`, `PUL_QAYTARISH_BEKOR_QILINDI`, `PUL_HAQIDA_XABAR_BERILDI` — written as `newValues.status` of `recordStatusChange` with NO `status` key in `oldValues` (so the `entity.status.changed` listeners stay silent, as for today's `PUL_QAYTARILDI`).
- **Language:** every user-visible string (errors, Excel, bot text, history values) in Latin-script Uzbek; commit messages, code comments and `server/CLAUDE.md` in English; ADR text in Uzbek.
- **Fixtures:** made-up numbers, ids and names only (`Ali`, `10001`, `350 000`). Never a production figure, id or real name — the repository is public.
- **Dates:** always `server/src/common/date/tashkent` helpers (`tashkentDateStr`, `tashkentDayStartUtc`, `addDaysToDateStr`, `dayOfWeekForDateStr`); never `getFullYear()` / `getMonth()` / `toISOString().slice` for "which day is it". `Refund.dueDate` (a timestamp column) is stored as `tashkentDayStartUtc(dueStr)` and travels in every API response as `'YYYY-MM-DD'`.
- **Branch rules:** reads take `@BranchScope()` (header; listed nowhere in the route manifest — see Spec conflicts 1); id-addressed writes check the student's branch with `assertCallerMayWriteForStudent` (returns the branch id); `[]` = nothing, `null` = every branch; another branch's student on a detail read is ADR-0063's named 404.
- Every new or changed `@Roles` gets a controller guard spec.
- **Commits:** one per task, tests passing, English message ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git stash`, never `git reset --hard`, never force-push. `git add` only the paths a task names.
- **ADR-0075 is written in this PR** (Task 9). Before pushing, re-check `docs/adr/README.md` on `main` for a colliding 0075 and renumber with `git mv` if needed.
- Rollout (not a task here): the migration (Task 2) ships with the server; the old client's «Muzlatilganlarning puli» page stops working when `GET /payments/frozen-balances` is deleted, so the two halves deploy together, on the CEO's go-ahead, never across the 02:00 / 03:10 / 04:00 crons or at 23:00.

---

## Decisions (where the spec leaves a choice)

1. **`recordRefund` loses its cash step instead of gaining a "skip" flag.** Once `process()` is deleted (spec §2.5) both remaining callers (`quickRefund`, `quickRefundBalanceOnly`) would skip it; a flag nobody sets to its default is dead code. The hand-over writes the movement itself.
2. **The receipt code stays lazy** (`ReceiptsService.ensureRefundReceiptCode`, allocated on the first PDF open). The receipt endpoint already refuses anything but `COMPLETED`, so «kvitansiya» exists exactly from «Berildi» on; a second allocator inside the hand-over transaction would duplicate the sequence logic.
3. **Hand-over and cancel live in `RefundsProcessService`**, not a new `RefundsHandOverService`: deleting `process()` empties that file to `reverse()`, and `cancel` shares `reverse()`'s ledger unwind (`unwindLedger`).
4. **A closed request is detected by `REFUND_TRANSITIONS`** re-read inside the Serializable transaction → 409 «So'rov allaqachon yopilgan»; a lost race is `rethrowAsConflict`'s 409.
5. **Hand-over drawer check:** the account must be in the company, in the student's branch, `isActive`, not deleted — any miss is one 400 «Kassa o'quvchining filialida topilmadi». `refundMethod`: `CASH` account → `CASH`, `BANK`/`CARD` → `TRANSFER`.
6. **The drawer list for «Berildi» rides on `GET /refundable/list`** (`cashAccounts`: id, name, type, branchId of the pending page's branches, no balances): `GET /cash-accounts` is CEO/BD-only and returns balances, so an Administrator or Cashier could not fill the dialog.
7. **`QuickRefundDto.refundMethod` becomes optional and is ignored**; the request writes no method (it is the drawer's, at hand-over). Still accepted so a dialog opened before the deploy keeps working.
8. **Duplicate guard:** the 60-second guard matches `REQUESTED` or `COMPLETED`; the prior-refund sums (deductions, preview `previousRefunds`) count `REQUESTED` too — its money already left the balance.
9. **The REFUND ledger row's description becomes «Pul qaytarish»** (was «Pul qaytarildi»): at the request the money has not been handed over. The hand-over's cash movement keeps «Pul qaytarildi».
10. **`findAll` already has branch scope** (`studentBranchWhere`); it gains `status` (comma list, `equalsOrIn`) and pagination (`{ data, total, page, pageSize }`, default 10, max 50). No client reads today's array shape. Order: newest **request** first (`createdAt desc, id asc`) — the closing date is spread over three columns and old rows lack two of them.
11. **History rows of pre-B2b refunds:** `handedOverAt` falls back to `processedAt` for a `COMPLETED` row; «Kim berdi» = `handedOverBy ?? processedBy`, «Kim bekor qildi» = `cancelledBy ?? processedBy`.
12. **Notice validity with `statusChangedAt = null`:** every notice counts (the student has had one state since the card was made).
13. **Since-date of a row:** muzlatilgan and ketgan — the student's `statusChangedAt`; guruhsiz — the latest enrollment's `statusChangedAt` (leaving a group does not change the student's status); each falls back to the student's `statusChangedAt`, then `createdAt`. Days are Tashkent calendar days.
14. **Age buckets:** `upto30` (≤ 30 days), `d31to60` (31–60), `over60` (> 60) — the same three buckets give the chips and the frozen tab's «Holat» (kutilmoqda / muddati o'tgan / ketgan hisoblanadi). The tab sub-line «N tasi 30 kundan oshgan» is `chips.d31to60 + chips.over60` (client).
15. **Pending pill numbers:** `due = { overdue: today > dueDate, bankDays }`, where `bankDays` = bank days after today up to the due day (left) or after the due day up to today (overdue). An overdue request on the weekend right after its due Friday has `bankDays = 0`; the client then prints «muddati o'tdi» without the count.
16. **Summary, tab totals and chips ignore search, age chip and paging**; search (name / phone / exact ID, `matchesSearch` from the debt page) and `age` narrow only the table rows and `rows.total`. Sort: largest balance first, then student id. Pages: rows default 20, pending default 10, both 1–50.
17. **Excel:** pending sheet = every `REQUESTED` refund in scope; the three student sheets = every row of the tab, with the active search applied; no age chip, no paging.
18. **Notice needs a positive balance** (400 «O'quvchi hisobida pul yo'q»): there is nothing to tell, and `amount` would be 0. The note is trimmed and optional for both channels.
19. **A failed bot send leaves its SMS log row** (SmsService always logs the attempt, as on the «SMS» tab) but writes no notice.
20. **The bot notice goes out at once** through `SmsService.sendToStudent` (a staff-pressed button, like the manual SMS); recorded in ADR-0075 as an addition to ADR-0025's instant list. `src/telegram-digest/direct-send.guard.spec.ts` needs no change (no new `.sendMessage(` caller).
21. **`transferTerm(noticeDay, holidays) → { termEnds, allowedFrom }`** is the one implementation of the spec's `transferAllowedFrom`; the preview, the drawer, the withdrawal refusal and the bot text all read it.
22. **Withdrawal preview and the drawer carry the same `transfer: TransferState`** object (`notice`, `termEnds`, `allowedFrom`, `allowed`, `refusal` — the exact 400 text `POST /withdrawals` would answer), nested rather than spread, so the client renders one shape in both places.
23. **«Telegram bot ulangan»** = `telegramChatId` set AND `telegramDisconnectedAt` null (ADR-0066's reachable chat).
23a. **The drawer carries `noticePreview`** — the exact bot text a notice given now would send — built by `loadNoticeText`, the function the send itself uses. The client cannot compose it: it needs the branch/company phone and the holiday-aware date.
24. **Holiday window:** `termHolidays(db, fromDay, branchId)` reads 120 days ahead (`TERM_HOLIDAY_HORIZON_DAYS`) — a 10-bank-day term crosses at most one 60-day holiday (the cap) plus weekends.
25. **ADR-0063's named 404 is extracted** from `DebtListService.notFound` into `common/auth/other-branch.ts` (`studentNotFound`) and reused by the drawer, instead of a second copy.
26. **`formatBranchPhone`** (private in `absence-pause-notify.service.ts`) moves to `common/utils/phone.util.ts` as `formatUzPhone` (also strips a leading `998` from a 12-digit number) and is reused by the bot text.
27. **Route manifest:** hand-over, cancel and the notice join the id-addressed money block (`BRANCH_SCOPED_BY_ENTITY`); `PATCH /refunds/:id/process` and `GET /payments/frozen-balances` leave it.
28. **Deleting `process()`** deletes `dto/process-refund.dto.ts`, the "completion bound" describe in `refunds-process.service.spec.ts` and its `docs/role-access.md` row; nothing else imports them.

## Spec conflicts

1. **«Route manifest entries for the new routes» (spec §7) vs the manifest's own rule.** `GET /refundable/list|excel|students/:id` and `GET /refunds` take `@BranchScope()`, which `branch-route-policy.spec.ts` treats as evidence and refuses to see re-declared (the same finding as B2a decision 1). **Resolution:** only the three id-addressed writes are listed; the policy spec is run to prove the header-scoped reads are covered.
2. **Spec §2.3 step 3 «`receiptCode` generated» vs the code.** Codes are allocated lazily by `ReceiptsService` (private, own transaction). **Resolution:** Decision 2 — the hand-over makes the receipt available; the code appears on its first render. If the CEO wants the code on the history row, a follow-up exports the allocator.

## File map

| File | Change | Task |
|---|---|---|
| `server/src/common/date/bank-days.ts` (+spec) | new, pure | 1 |
| `server/src/holidays/holiday-date-set.ts` (+new spec) | `termHolidays` | 1 |
| `server/prisma/schema.prisma`, `server/prisma/migrations/20261010120000_b2b_refund_request_balance_notice/migration.sql` | Refund columns, `BalanceNotice` | 2 |
| `server/src/refunds/refund-due-date.ts`, `refund-view.ts` | new | 3 (view grows in 4) |
| `server/src/refunds/refunds-create.service.ts` (+spec), `dto/quick-refund.dto.ts` | request flow | 3 |
| `server/src/refunds/refunds-eligibility.service.ts` (+spec) | preview `dueDate`, prior sums; `findAll` | 3, 4 |
| `server/src/transactions/transactions-write.service.ts` (+spec) | no cash in `recordRefund` | 3 |
| `server/src/common/finance/status-transitions.ts` | `REFUND_TRANSITIONS` | 3 |
| `server/src/refunds/refunds.controller.ts` (+spec), `refunds.service.ts`, `refunds-process.service.ts` (+spec), `refunds.module.ts` | delete `process`; hand-over, cancel, history | 3, 4 |
| `server/src/refunds/dto/{hand-over-refund,cancel-refund,refund-list-query}.dto.ts` | new | 4 |
| `server/src/refunds/dto/process-refund.dto.ts` | deleted | 3 |
| `server/src/common/auth/branch-route-policy.ts` | entries | 3, 4, 5, 8 |
| `server/src/common/utils/phone.util.ts` (+spec), `server/src/absence-pause/absence-pause-notify.service.ts` | `formatUzPhone` | 5 |
| `server/src/balance-notices/**` (+specs) | new module | 5 |
| `server/src/app.module.ts` | register `BalanceNoticesModule`, `RefundableModule` | 5, 8 |
| `server/src/withdrawals/withdrawals.service.ts` (+spec) | condition + preview | 6 |
| `server/src/refundable/refundable.math.ts` (+spec) | new, pure | 7 |
| `server/src/refundable/{refundable.service,refundable.excel,refundable.controller,refundable.module}.ts`, `dto/refundable-query.dto.ts` (+specs) | new API | 8 |
| `server/src/common/auth/other-branch.ts`, `server/src/payments/debt/debt-list.service.ts` | `studentNotFound` | 8 |
| `server/src/payments/{payments-frozen-balance.service.ts,payments-frozen-balance.service.spec.ts,dto/frozen-balances-query.dto.ts}` | deleted | 8 |
| `server/src/payments/{payments.controller.ts,payments.controller.spec.ts,payments.service.ts,payments.service.spec.ts,payments.module.ts,payments.branch-isolation.spec.ts}` | frozen route out | 8 |
| `server/src/statements/present-statement.ts` (+spec) | «pul qaytarish» | 9 |
| `docs/adr/0075-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md`, `docs/adr/README.md`, `server/CLAUDE.md`, `docs/role-access.md`, `docs/financial-system.md`, `CONTEXT.md` | docs | 9 |

---

### Task 1: Bank days — a pure helper and the holidays of a term

**Files:**
- Create: `server/src/common/date/bank-days.ts`
- Create: `server/src/common/date/bank-days.spec.ts`
- Modify: `server/src/holidays/holiday-date-set.ts` (append `termHolidays`)
- Create: `server/src/holidays/holiday-date-set.spec.ts`

**Interfaces:**
- Consumes: `addDaysToDateStr`, `dayOfWeekForDateStr`, `tashkentDayStartUtc` (`common/date/tashkent.ts`); `buildHolidayDateSet`, `HolidayDateSetDb` (`holidays/holiday-date-set.ts`).
- Produces:
  - `export const REFUND_TERM_BANK_DAYS = 10;`
  - `export function isBankDay(day: string, holidays: ReadonlySet<string>): boolean`
  - `export function addBankDays(fromDateStr: string, n: number, holidays: ReadonlySet<string>): string`
  - `export function bankDaysBetween(fromStr: string, toStr: string, holidays: ReadonlySet<string>): number` — bank days `d` with `from < d ≤ to`; negative (mirrored) when `to < from`.
  - `export const TERM_HOLIDAY_HORIZON_DAYS = 120;`
  - `export function termHolidays(db: HolidayDateSetDb, fromDateStr: string, branchId: number | null): Promise<Set<string>>`

- [ ] **Step 1: Write the failing tests**

`server/src/common/date/bank-days.spec.ts`:

```ts
import {
  addBankDays,
  bankDaysBetween,
  isBankDay,
  REFUND_TERM_BANK_DAYS,
} from './bank-days';

const none = new Set<string>();

describe('bank days (ADR-0075)', () => {
  it('Saturday, Sunday and a holiday are not bank days', () => {
    expect(isBankDay('2026-10-10', none)).toBe(false); // Saturday
    expect(isBankDay('2026-10-11', none)).toBe(false); // Sunday
    expect(isBankDay('2026-10-12', none)).toBe(true); // Monday
    expect(isBankDay('2026-10-01', new Set(['2026-10-01']))).toBe(false);
  });

  describe('addBankDays', () => {
    it('counts from the day after, skipping the weekend', () => {
      expect(addBankDays('2026-10-09', 1, none)).toBe('2026-10-12'); // Fri → Mon
      expect(addBankDays('2026-10-02', 2, none)).toBe('2026-10-06');
    });

    it('a request on Friday or Saturday is due on the Friday two weeks on', () => {
      expect(addBankDays('2026-10-09', REFUND_TERM_BANK_DAYS, none)).toBe(
        '2026-10-23',
      );
      expect(addBankDays('2026-10-10', REFUND_TERM_BANK_DAYS, none)).toBe(
        '2026-10-23',
      );
    });

    it('a holiday inside the term pushes it by a day (spec §2.6)', () => {
      // Monday 28.09.2026, Thursday 01.10 a holiday → Tuesday 13.10.
      expect(addBankDays('2026-09-28', 10, new Set(['2026-10-01']))).toBe(
        '2026-10-13',
      );
    });

    it('zero bank days is the day itself', () => {
      expect(addBankDays('2026-10-10', 0, none)).toBe('2026-10-10');
    });
  });

  describe('bankDaysBetween', () => {
    it('counts the bank days after the first day, up to and including the second', () => {
      expect(bankDaysBetween('2026-10-10', '2026-10-13', none)).toBe(2);
      expect(bankDaysBetween('2026-10-10', '2026-10-23', none)).toBe(10);
      expect(
        bankDaysBetween('2026-09-28', '2026-10-13', new Set(['2026-10-01'])),
      ).toBe(10);
    });

    it('is negative when the second day is earlier, zero on the same day', () => {
      expect(bankDaysBetween('2026-10-10', '2026-10-07', none)).toBe(-2);
      expect(bankDaysBetween('2026-10-12', '2026-10-12', none)).toBe(0);
    });
  });
});
```

`server/src/holidays/holiday-date-set.spec.ts`:

```ts
import { termHolidays } from './holiday-date-set';

describe('termHolidays', () => {
  it("reads the branch's and the company-wide holidays from the term's first day, 120 days on", async () => {
    const db = {
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'),
          },
        ]),
      },
    };

    const set = await termHolidays(db as never, '2026-09-28', 1);

    expect([...set]).toEqual(['2026-10-01', '2026-10-02']);
    const where = db.holiday.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ branchId: null }, { branchId: 1 }]);
    expect(where.endDate.gte.getTime()).toBeLessThanOrEqual(
      new Date('2026-09-27T19:00:00Z').getTime(),
    );
    // 28.09.2026 + 120 days = 26.01.2027 (00:00 Tashkent = 25.01 19:00 UTC).
    expect(where.date.lte.getTime()).toBeGreaterThanOrEqual(
      new Date('2027-01-25T19:00:00Z').getTime(),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/common/date/bank-days.spec.ts src/holidays/holiday-date-set.spec.ts`
Expected: FAIL — `Cannot find module './bank-days'` and `termHolidays is not a function`.

- [ ] **Step 3: Write the implementation**

`server/src/common/date/bank-days.ts`:

```ts
import { addDaysToDateStr, dayOfWeekForDateStr } from './tashkent';

/**
 * Bank days (ADR-0075): Monday–Friday, not a holiday of the student's branch.
 * The centre's holiday table stands in for the bank calendar; transferred
 * working Saturdays are not modelled. Pure: the caller loads `holidays`
 * (`termHolidays`).
 */

/** The contract's refund term, and the first leg of the transfer wait. */
export const REFUND_TERM_BANK_DAYS = 10;

export function isBankDay(day: string, holidays: ReadonlySet<string>): boolean {
  const dow = dayOfWeekForDateStr(day);
  return dow !== 0 && dow !== 6 && !holidays.has(day);
}

/** The n-th bank day AFTER `fromDateStr` ('YYYY-MM-DD'); n = 0 is the day itself. */
export function addBankDays(
  fromDateStr: string,
  n: number,
  holidays: ReadonlySet<string>,
): string {
  let day = fromDateStr;
  for (let left = n; left > 0; ) {
    day = addDaysToDateStr(day, 1);
    if (isBankDay(day, holidays)) left--;
  }
  return day;
}

/**
 * Bank days `d` with `fromStr < d ≤ toStr` — «N bank kuni qoldi» from today to
 * the due day, «muddati o'tdi · N bank kuni» from the due day to today.
 * Mirrored (negative) when `toStr` is earlier.
 */
export function bankDaysBetween(
  fromStr: string,
  toStr: string,
  holidays: ReadonlySet<string>,
): number {
  if (toStr < fromStr) return -bankDaysBetween(toStr, fromStr, holidays);
  let count = 0;
  for (let d = addDaysToDateStr(fromStr, 1); d <= toStr; d = addDaysToDateStr(d, 1)) {
    if (isBankDay(d, holidays)) count++;
  }
  return count;
}
```

Append to `server/src/holidays/holiday-date-set.ts` (add `import { tashkentDayStartUtc } from '../common/date/tashkent';` to the imports):

```ts
/**
 * How far ahead a bank-day term reads holidays. Ten bank days cross at most
 * one 60-day holiday (the cap on a holiday's length) plus weekends.
 */
export const TERM_HOLIDAY_HORIZON_DAYS = 120;

/**
 * The holidays a bank-day term starting on `fromDateStr` can cross: the
 * branch's own and the company-wide ones (ADR-0075). `branchId` null reads
 * every branch's — only a branch-less card gets there, and money paths refuse
 * those before.
 */
export function termHolidays(
  db: HolidayDateSetDb,
  fromDateStr: string,
  branchId: number | null,
): Promise<Set<string>> {
  return buildHolidayDateSet(
    db,
    tashkentDayStartUtc(fromDateStr),
    tashkentDayStartUtc(addDaysToDateStr(fromDateStr, TERM_HOLIDAY_HORIZON_DAYS)),
    branchId,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/common/date/bank-days.spec.ts src/holidays/holiday-date-set.spec.ts src/common/date/tashkent.single-source.spec.ts`
Expected: PASS (the single-source spec proves no banned date pattern slipped in).

- [ ] **Step 5: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/common/date/bank-days.ts src/common/date/bank-days.spec.ts src/holidays/holiday-date-set.ts src/holidays/holiday-date-set.spec.ts && npx eslint src/common/date/bank-days.ts src/common/date/bank-days.spec.ts src/holidays/holiday-date-set.ts src/holidays/holiday-date-set.spec.ts && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/common/date/bank-days.ts server/src/common/date/bank-days.spec.ts server/src/holidays/holiday-date-set.ts server/src/holidays/holiday-date-set.spec.ts
git commit -m "feat(refunds): bank-day helper and the holidays of a term

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schema and migration — the request columns and `BalanceNotice`

**Files:**
- Modify: `server/prisma/schema.prisma` (models `Refund`, `User`, `Student`, `CashAccount`; new enum + model)
- Create: `server/prisma/migrations/20261010120000_b2b_refund_request_balance_notice/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces (Prisma client, after `npx prisma generate`):
  - `Refund.requestedById: number | null`, `requestedBy`, `handedOverAt: Date | null`, `handedOverById: number | null`, `handedOverBy`, `cashAccountId: string | null`, `cashAccount`, `cancelledAt: Date | null`, `cancelledById: number | null`, `cancelledBy`, `cancelReason: string | null`. `dueDate` (existing, `DateTime?`) now holds the 10th bank day at 00:00 Tashkent.
  - `enum BalanceNoticeChannel { BOT CALL }`
  - `BalanceNotice { id: string; studentId: number; companyId: number; channel: BalanceNoticeChannel; amount: number; note: string | null; smsMessageId: string | null; createdById: number; createdAt: Date }` — `prisma.balanceNotice`.

- [ ] **Step 1: Edit `model Refund`** — insert after the line `dueDate          DateTime?` inside `model Refund`:

```prisma
  // B2b (ADR-0075): a refund is a request until the money is handed over.
  // `dueDate` above is the 10th bank day after the request, 00:00 Tashkent.
  requestedById    Int?
  requestedBy      User?          @relation("RefundRequestedBy", fields: [requestedById], references: [id])
  handedOverAt     DateTime?
  handedOverById   Int?
  handedOverBy     User?          @relation("RefundHandedOverBy", fields: [handedOverById], references: [id])
  cashAccountId    String?
  cashAccount      CashAccount?   @relation(fields: [cashAccountId], references: [id])
  cancelledAt      DateTime?
  cancelledById    Int?
  cancelledBy      User?          @relation("RefundCancelledBy", fields: [cancelledById], references: [id])
  cancelReason     String?
```

- [ ] **Step 2: Add the back-relations**

In `model User`, after `processedRefunds      Refund[]        @relation("RefundProcessedBy")`:

```prisma
  requestedRefunds      Refund[]        @relation("RefundRequestedBy")
  handedOverRefunds     Refund[]        @relation("RefundHandedOverBy")
  cancelledRefunds      Refund[]        @relation("RefundCancelledBy")
  balanceNotices        BalanceNotice[] @relation("BalanceNoticeCreatedBy")
```

In `model Student`, after `monthlyCharges    EnrollmentMonthlyCharge[]`:

```prisma
  balanceNotices    BalanceNotice[]
```

In `model CashAccount`, after `movements CashMovement[]`:

```prisma
  refunds   Refund[]
```

- [ ] **Step 3: Add the enum and the model** — right after the closing `}` of `model Refund`:

```prisma
enum BalanceNoticeChannel {
  BOT
  CALL
}

/// «Pulingizni olib keting» — told to a student who is not studying and has
/// money on the balance. The latest one given in the student's current state
/// (`createdAt ≥ Student.statusChangedAt`) starts the clock that unlocks the
/// transfer to the centre: 10 bank days, then 30 days (ADR-0075).
model BalanceNotice {
  id           String               @id @default(uuid())
  studentId    Int
  student      Student              @relation(fields: [studentId], references: [id])
  companyId    Int
  channel      BalanceNoticeChannel
  /// The balance at the moment of the notice.
  amount       Int
  note         String?
  /// The SmsMessage row of a BOT notice.
  smsMessageId String?
  createdById  Int
  createdBy    User                 @relation("BalanceNoticeCreatedBy", fields: [createdById], references: [id])
  createdAt    DateTime             @default(now())

  @@index([studentId, createdAt])
  @@index([companyId])
}
```

- [ ] **Step 4: Write the migration** — `server/prisma/migrations/20261010120000_b2b_refund_request_balance_notice/migration.sql`:

```sql
-- B2b (ADR-0075): a refund is a request until the money is handed over, and a
-- balance notice starts the clock for moving unclaimed money to the centre.
-- Every new column is nullable: the existing refunds stay as they are.

-- CreateEnum
CREATE TYPE "BalanceNoticeChannel" AS ENUM ('BOT', 'CALL');

-- AlterTable
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "requestedById" INTEGER,
ADD COLUMN IF NOT EXISTS "handedOverAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "handedOverById" INTEGER,
ADD COLUMN IF NOT EXISTS "cashAccountId" TEXT,
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "cancelledById" INTEGER,
ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;

-- CreateTable
CREATE TABLE "BalanceNotice" (
    "id" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "channel" "BalanceNoticeChannel" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "smsMessageId" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceNotice_studentId_createdAt_idx" ON "BalanceNotice"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceNotice_companyId_idx" ON "BalanceNotice"("companyId");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_handedOverById_fkey" FOREIGN KEY ("handedOverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "CashAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceNotice" ADD CONSTRAINT "BalanceNotice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceNotice" ADD CONSTRAINT "BalanceNotice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 5: Validate and generate**

Run: `cd server && npx prisma format && npx prisma validate && npx prisma generate && npm run typecheck`
Expected: «The schema at prisma/schema.prisma is valid», client generated, typecheck clean.

- [ ] **Step 6 (optional cross-check, needs the dev database):** `ln -s /Users/a1111/Desktop/daf-erp-system/server/.env server/.env`, then `cd server && npx prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --script`. The `Refund` / `BalanceNotice` statements must match Step 4 (the dev database may lag on unrelated migrations — ignore those). Then `rm server/.env` (never committed).

- [ ] **Step 7: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/20261010120000_b2b_refund_request_balance_notice/migration.sql
git commit -m "feat(refunds): schema for refund requests and balance notices

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The refund becomes a request

**Files:**
- Create: `server/src/refunds/refund-due-date.ts`
- Create: `server/src/refunds/refund-view.ts`
- Modify: `server/src/refunds/refunds-create.service.ts`
- Modify: `server/src/refunds/refunds-create.service.spec.ts`
- Modify: `server/src/refunds/dto/quick-refund.dto.ts`
- Modify: `server/src/refunds/refunds-eligibility.service.ts` (preview `dueDate`, prior sums)
- Modify: `server/src/refunds/refunds-eligibility.service.spec.ts`
- Modify: `server/src/transactions/transactions-write.service.ts` (`recordRefund`, the `CASH_FLOW_TYPES` comment)
- Modify: `server/src/transactions/transactions-write.service.spec.ts`
- Modify: `server/src/common/finance/status-transitions.ts`
- Modify: `server/src/refunds/refunds.controller.ts`, `server/src/refunds/refunds.service.ts`, `server/src/refunds/refunds-process.service.ts`, `server/src/refunds/refunds-process.service.spec.ts` (delete `process`)
- Delete: `server/src/refunds/dto/process-refund.dto.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (remove `'PATCH /refunds/:id/process',`)

**Interfaces:**
- Consumes: `addBankDays`, `REFUND_TERM_BANK_DAYS` (Task 1), `termHolidays`, `HolidayDateSetDb` (Task 1), `Refund.requestedById` (Task 2), `tryResolveStudentBranchId` (`common/finance/resolve-branch.ts`), `assertCallerMayWriteForStudent` (returns `Promise<number>`, the student's branch id).
- Produces:
  - `export async function refundDueDate(db: HolidayDateSetDb, branchId: number | null, now?: Date): Promise<string>` (`refunds/refund-due-date.ts`)
  - `export function refundView<T extends { dueDate: Date | null }>(row: T): Omit<T, 'dueDate'> & { dueDate: string | null }` (`refunds/refund-view.ts`)
  - `POST /refunds/quick` response: the `Refund` row with `status: 'REQUESTED'`, `dueDate: 'YYYY-MM-DD'`, `refundMethod: null`, `processedAt: null`.
  - `GET /refunds/preview/:studentId` response gains `dueDate: string` (`'YYYY-MM-DD'`) in both quote shapes.
  - `REFUND_TRANSITIONS = { REQUESTED: [COMPLETED, REJECTED], APPROVED: [], PROCESSING: [], COMPLETED: [], REJECTED: [] }`.
  - `TransactionsWriteService.recordRefund` writes the REFUND row and the balance only (no `CashMovement`), description «Pul qaytarish».
  - `PATCH /refunds/:id/process` no longer exists.

- [ ] **Step 1: Write the failing tests**

In `server/src/refunds/refunds-create.service.spec.ts`:

(a) the module mock resolves the branch:

```ts
jest.mock('../common/auth/financial-write-scope', () => ({
  assertCallerMayWriteForStudent: jest.fn().mockResolvedValue(1),
}));
```

(b) replace the `beforeEach` fixture set-up so the transaction client and the history mock are reachable (declare `let tx: any; let history: any;` beside the other `let`s):

```ts
    tx = {
      refund: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: 'ref-1', ...data }),
        ),
      },
    };
    prisma = {
      student: { findFirst: jest.fn(() => Promise.resolve(student)) },
      enrollment: { findFirst: jest.fn(() => Promise.resolve(enrollment)) },
      attendance: { count: jest.fn().mockResolvedValue(0) },
      refund: {
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _sum: { approvedAmount: 0 } }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    history = { recordStatusChange: jest.fn() };
```

and in the providers `{ provide: EntityHistoryService, useValue: history }`.

(c) extend the existing duplicate test with the status it now matches:

```ts
  it('refuses an identical refund raised seconds ago', async () => {
    student.balance = 500_000;
    prisma.refund.findFirst.mockResolvedValue({ id: 'ref-earlier' });

    await expect(service.quickRefund(dto(100_000), 99, 1)).rejects.toThrow(
      BadRequestException,
    );

    expect(transactionsService.recordRefund).not.toHaveBeenCalled();
    // A request open seconds ago is as much a duplicate as a payout.
    expect(prisma.refund.findFirst.mock.calls[0][0].where.status).toEqual({
      in: ['REQUESTED', 'COMPLETED'],
    });
  });
```

(d) add a new describe at the end of the outer describe:

```ts
  describe('the request (ADR-0075)', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      // Monday 28.09.2026, 11:00 Tashkent; Thursday 01.10 is a holiday.
      jest.setSystemTime(new Date('2026-09-28T06:00:00Z'));
      prisma.holiday.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-01T00:00:00Z'),
        },
      ]);
      student.balance = 500_000;
    });
    afterEach(() => jest.useRealTimers());

    it('opens a REQUESTED refund due on the 10th bank day, with no method and no payout stamp', async () => {
      const out = await service.quickRefund(dto(100_000), 99, 1);

      const data = tx.refund.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'REQUESTED',
        requestedAmount: 100_000,
        approvedAmount: 100_000,
        requestedById: 99,
        // 13.10 at 00:00 Tashkent.
        dueDate: new Date('2026-10-12T19:00:00.000Z'),
      });
      expect(data.refundMethod).toBeUndefined();
      expect(data.processedAt).toBeUndefined();
      expect(data.processedById).toBeUndefined();
      expect(out.dueDate).toBe('2026-10-13');
    });

    it("reads the holidays of the student's branch", async () => {
      await service.quickRefund(dto(100_000), 99, 1);
      expect(prisma.holiday.findMany.mock.calls[0][0].where.OR).toEqual([
        { branchId: null },
        { branchId: 1 },
      ]);
    });

    it('takes the money off the balance at once, in the same transaction', async () => {
      await service.quickRefund(dto(100_000), 99, 1);
      expect(transactionsService.recordRefund).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 100_000, refundId: 'ref-1' }),
        tx,
      );
    });

    it('records the request in the student history', async () => {
      await service.quickRefund({ ...dto(100_000), reason: 'Ketdi' }, 99, 1);
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          oldValues: { balans: 500_000 },
          newValues: expect.objectContaining({
            status: 'PUL_QAYTARISH_SOROVI',
            summa: 100_000,
            muddat: '13.10.2026',
            sabab: 'Ketdi',
          }),
        }),
      );
    });

    it('the balance-only path opens the same kind of request', async () => {
      const out = await service.quickRefund(
        { studentId: 10001, amount: 200_000 },
        99,
        1,
      );
      expect(tx.refund.create.mock.calls[0][0].data).toMatchObject({
        status: 'REQUESTED',
        enrollmentId: null,
        requestedById: 99,
      });
      expect(out.dueDate).toBe('2026-10-13');
    });
  });
```

In `server/src/refunds/refunds-eligibility.service.spec.ts` add to the `prisma` mock in `beforeEach`:

```ts
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
```

and append:

```ts
  describe('the due date (ADR-0075)', () => {
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      jest.setSystemTime(new Date('2026-09-28T06:00:00Z'));
      prisma.holiday.findMany.mockResolvedValue([
        {
          date: new Date('2026-10-01T00:00:00Z'),
          endDate: new Date('2026-10-01T00:00:00Z'),
        },
      ]);
    });
    afterEach(() => jest.useRealTimers());

    it("quotes the 10th bank day after today, with the student branch's holidays", async () => {
      const out = await service.previewRefund(10001, 1);
      expect(out.dueDate).toBe('2026-10-13');
      expect(prisma.holiday.findMany.mock.calls[0][0].where.OR).toEqual([
        { branchId: null },
        { branchId: 1 },
      ]);
    });

    it('the balance-only quote carries it too', async () => {
      prisma.enrollment.findFirst.mockResolvedValueOnce(null);
      const out = await service.previewRefund(10001, 1);
      expect(out.enrollmentId).toBeNull();
      expect(out.dueDate).toBe('2026-10-13');
    });
  });

  it('counts an open request among the earlier refunds — its money already left the balance', async () => {
    await service.previewRefund(10001, 1);
    expect(prisma.refund.aggregate.mock.calls[0][0].where.status.in).toContain(
      'REQUESTED',
    );
  });
```

In `server/src/transactions/transactions-write.service.spec.ts` replace the `recordRefund` describe:

```ts
  describe('recordRefund', () => {
    it('stamps the branch and moves no cash — the drawer is touched at hand-over (ADR-0075)', async () => {
      await service.recordRefund({
        studentId: STUDENT,
        amount: 50_000,
        refundId: 'r-1',
        companyId: COMPANY,
      });

      expect(createdData()).toEqual(
        expect.objectContaining({
          branchId: 2,
          amount: -50_000,
          description: 'Pul qaytarish',
        }),
      );
      expect(cash.recordOutflow).not.toHaveBeenCalled();
    });
  });
```

In `server/src/refunds/refunds-process.service.spec.ts` delete the whole first `describe('RefundsProcessService — completion bound', …)` block and the now-unused `BadRequestException` import.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/refunds src/transactions/transactions-write.service.spec.ts`
Expected: FAIL — `status: 'COMPLETED'` written instead of `REQUESTED`, `dueDate` missing from the preview, `recordOutflow` called.

- [ ] **Step 3: Write `refund-due-date.ts` and `refund-view.ts`**

`server/src/refunds/refund-due-date.ts`:

```ts
import { addBankDays, REFUND_TERM_BANK_DAYS } from '../common/date/bank-days';
import { tashkentDateStr } from '../common/date/tashkent';
import {
  termHolidays,
  type HolidayDateSetDb,
} from '../holidays/holiday-date-set';

/**
 * When a refund opened now must be handed over: the 10th bank day after today,
 * with the holidays of the student's branch (ADR-0075). 'YYYY-MM-DD'.
 */
export async function refundDueDate(
  db: HolidayDateSetDb,
  branchId: number | null,
  now: Date = new Date(),
): Promise<string> {
  const today = tashkentDateStr(now);
  return addBankDays(
    today,
    REFUND_TERM_BANK_DAYS,
    await termHolidays(db, today, branchId),
  );
}
```

`server/src/refunds/refund-view.ts`:

```ts
import { tashkentDateStr } from '../common/date/tashkent';

/**
 * A Refund row as the API sends it: `dueDate` is the Tashkent day
 * ('YYYY-MM-DD'), never the stored 00:00-Tashkent instant (19:00 UTC the day
 * before, which a client slicing the ISO string would read a day early).
 */
export function refundView<T extends { dueDate: Date | null }>(
  row: T,
): Omit<T, 'dueDate'> & { dueDate: string | null } {
  return { ...row, dueDate: row.dueDate ? tashkentDateStr(row.dueDate) : null };
}
```

- [ ] **Step 4: Rewrite the request in `refunds-create.service.ts`**

Imports: add

```ts
import { tashkentDayStartUtc } from '../common/date/tashkent';
import { dmy } from '../statements/statement-text';
import { refundDueDate } from './refund-due-date';
import { refundView } from './refund-view';
```

and delete the `REFUND_METHOD_LABEL` constant (no reader left).

In `quickRefund`, replace the head (from `await assertCallerMayWriteForStudent(` through the balance-only branch) with:

```ts
    const branchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      dto.studentId,
      companyId,
    );

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    // The contract's 10 bank days, with the student's branch holidays.
    const dueStr = await refundDueDate(this.prisma, branchId);

    if (!dto.enrollmentId) {
      return this.quickRefundBalanceOnly(dto, userId, companyId, student, dueStr);
    }
```

In BOTH duplicate guards replace `status: RefundStatus.COMPLETED,` with:

```ts
        // An open request is as much a duplicate as a payout (ADR-0075).
        status: { in: [RefundStatus.REQUESTED, RefundStatus.COMPLETED] },
```

In `sumPriorRefunds` and in `quickRefundBalanceOnly`'s `priorRefunds` aggregate, make the status list:

```ts
          in: [
            RefundStatus.REQUESTED,
            RefundStatus.APPROVED,
            RefundStatus.PROCESSING,
            RefundStatus.COMPLETED,
          ],
```

Delete both `const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 21);` pairs.

The enrollment path's `tx.refund.create` data becomes:

```ts
          data: {
            studentId: dto.studentId,
            enrollmentId: enrollment.id,
            requestedAmount: dto.amount,
            approvedAmount: dto.amount,
            lessonsCompleted: lessonsAttended,
            totalLessons,
            deductions,
            // ADR-0075: a request. The money leaves the drawer and the method
            // is known only at hand-over (`RefundsProcessService.handOver`).
            status: RefundStatus.REQUESTED,
            reason: dto.reason,
            requestedById: userId,
            dueDate: tashkentDayStartUtc(dueStr),
            companyId,
          },
```

its history call's `newValues` becomes:

```ts
      newValues: {
        balans: balanceAfter,
        summa: dto.amount,
        muddat: dmy(dueStr),
        bekor_qilingan_darslar: lessonsToRelease,
        guruh: enrollment.group.name,
        sabab: dto.reason ?? null,
        status: 'PUL_QAYTARISH_SOROVI',
      },
```

and it returns `return refundView(refund.refundRow);`.

`quickRefundBalanceOnly` takes `dueStr: string` as a fifth parameter; its `tx.refund.create` data becomes:

```ts
          data: {
            studentId: dto.studentId,
            enrollmentId: null,
            requestedAmount: dto.amount,
            approvedAmount: dto.amount,
            lessonsCompleted: 0,
            totalLessons: 0,
            deductions,
            status: RefundStatus.REQUESTED,
            reason: dto.reason,
            requestedById: userId,
            dueDate: tashkentDayStartUtc(dueStr),
            companyId,
          },
```

its history `newValues`:

```ts
      newValues: {
        balans: balanceAfter,
        summa: dto.amount,
        muddat: dmy(dueStr),
        bekor_qilingan_darslar: 0,
        guruh: 'Balans (faol guruhsiz)',
        sabab: dto.reason ?? null,
        status: 'PUL_QAYTARISH_SOROVI',
      },
```

and it returns `return refundView(refundRow);`.

Update the method's doc comment first paragraph to: «Opens a refund request (ADR-0075). The admin types the amount; the money comes off the balance now (ledger REFUND row), leaves the branch drawer only at «Berildi» (`RefundsProcessService.handOver`), and is due on the 10th bank day.» — keep the funding paragraphs below it.

- [ ] **Step 5: `QuickRefundDto.refundMethod` becomes optional**

```ts
  // Ignored since ADR-0075: the method is the drawer's, chosen at hand-over.
  // Still accepted so a dialog opened before the deploy keeps working.
  @IsOptional()
  @IsEnum(PaymentMethod)
  refundMethod?: PaymentMethod;
```

- [ ] **Step 6: The preview carries `dueDate`; prior sums count requests**

In `refunds-eligibility.service.ts` add imports:

```ts
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import { refundDueDate } from './refund-due-date';
```

Add `RefundStatus.REQUESTED` first in both `priorRefunds` status lists. Add the private helper:

```ts
  /** The due date a request opened now would get (ADR-0075). */
  private async dueDateFor(studentId: number, companyId: number) {
    return refundDueDate(
      this.prisma,
      await tryResolveStudentBranchId(this.prisma, studentId, companyId),
    );
  }
```

and add `dueDate: await this.dueDateFor(studentId, companyId),` as the last field of BOTH returned objects (`previewRefund` and `previewBalanceOnlyRefund`).

- [ ] **Step 7: `recordRefund` moves no cash**

In `transactions-write.service.ts` `recordRefund`: change both `description: 'Pul qaytarildi'` occurrences to the single ledger one `description: 'Pul qaytarish',`, and replace the `await this.cashMovements.recordOutflow(…)` block (with its comment) by:

```ts
      // No cash moves here (ADR-0075): a refund is a request until «Berildi»,
      // and the hand-over writes the drawer's movement against this row.
```

Change the `CASH_FLOW_TYPES` comment's last sentence to: «REFUND's movement is written at hand-over against the REFUND row, so reversing that row still unwinds it.»

- [ ] **Step 8: `REFUND_TRANSITIONS`**

```ts
export const REFUND_TRANSITIONS: Record<RefundStatus, RefundStatus[]> = {
  // ADR-0075: a request is handed over or cancelled. APPROVED and PROCESSING
  // stay in the enum for old rows and are never written.
  REQUESTED: [RefundStatus.COMPLETED, RefundStatus.REJECTED],
  APPROVED: [],
  PROCESSING: [],
  COMPLETED: [],
  REJECTED: [],
};
```

- [ ] **Step 9: Delete `process()`**

- `refunds.controller.ts`: delete the `@Patch(':id/process')` handler and the `Patch`, `ProcessRefundDto` imports.
- `refunds.service.ts`: delete `process(...)` and the `ProcessRefundDto` import.
- `refunds-process.service.ts`: delete `process(...)` and the imports `ContractStatus`, `ProcessRefundDto`, `assertValidTransition`, `REFUND_TRANSITIONS` (keep `Prisma`, `RefundStatus`).
- `git rm server/src/refunds/dto/process-refund.dto.ts`
- `branch-route-policy.ts`: delete the line `'PATCH /refunds/:id/process',`.

- [ ] **Step 10: Run the tests to verify they pass**

Run: `cd server && npx jest src/refunds src/transactions src/common/auth/branch-route-policy.spec.ts src/common/date`
Expected: PASS.

- [ ] **Step 11: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/refunds src/transactions/transactions-write.service.ts src/transactions/transactions-write.service.spec.ts src/common/finance/status-transitions.ts src/common/auth/branch-route-policy.ts && npx eslint src/refunds src/transactions src/common/finance/status-transitions.ts src/common/auth/branch-route-policy.ts && npm run typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add server/src/refunds server/src/transactions/transactions-write.service.ts server/src/transactions/transactions-write.service.spec.ts server/src/common/finance/status-transitions.ts server/src/common/auth/branch-route-policy.ts
git commit -m "feat(refunds): a refund opens as a request due in 10 bank days; drop PATCH /refunds/:id/process

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: «Berildi», cancel, and the history list

**Files:**
- Modify: `server/src/refunds/refunds-process.service.ts` (full rewrite below)
- Modify: `server/src/refunds/refunds-process.service.spec.ts` (full rewrite below)
- Modify: `server/src/refunds/refund-view.ts` (history row)
- Create: `server/src/refunds/refund-view.spec.ts`
- Create: `server/src/refunds/dto/hand-over-refund.dto.ts`, `server/src/refunds/dto/cancel-refund.dto.ts`, `server/src/refunds/dto/refund-list-query.dto.ts`
- Modify: `server/src/refunds/refunds-eligibility.service.ts` (`findAll`) + spec
- Modify: `server/src/refunds/refunds.controller.ts` + `refunds.controller.spec.ts`
- Modify: `server/src/refunds/refunds.service.ts`
- Modify: `server/src/refunds/refunds.module.ts` (import `CashAccountsModule`)
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `refundView` (Task 3), `REFUND_TRANSITIONS` (Task 3), Refund columns (Task 2), `CashMovementsService.recordOutflow(params: { companyId; branchId?; amount; cashAccountId?; transactionId?; description?; performedById? }, tx?)`, `TransactionsService.reverseTransaction(originalId, { performedById?, reason? }, tx?)`, `rethrowAsConflict` (`common/transaction-conflict.ts`), `equalsOrIn`, `toStringArray` (`common/dto/to-array.ts`).
- Produces:
  - `export const REFUND_CLOSED_MESSAGE = "So'rov allaqachon yopilgan";` (`refunds-process.service.ts`)
  - `RefundsProcessService.handOver(id: string, cashAccountId: string, userId: number, companyId: number): Promise<RefundRowView>`
  - `RefundsProcessService.cancel(id: string, reason: string, userId: number, companyId: number): Promise<RefundRowView>`
  - `RefundsEligibilityService.findAll(companyId: number, branchIds: ReportBranchIds, q: RefundListQueryDto): Promise<{ data: RefundHistoryRow[]; total: number; page: number; pageSize: number }>`
  - `export const REFUND_HISTORY_SELECT`, `export interface RefundHistoryRow`, `export function toRefundHistoryRow(r): RefundHistoryRow` (`refund-view.ts`)
  - Routes `POST /refunds/:id/hand-over`, `POST /refunds/:id/cancel`, `GET /refunds` (changed) — shapes in the API contract.

- [ ] **Step 1: Write the failing tests**

`server/src/refunds/refund-view.spec.ts`:

```ts
import { toRefundHistoryRow } from './refund-view';

const person = (id: number, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
});
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'r-1',
    status: 'COMPLETED',
    requestedAmount: 90_000,
    approvedAmount: 90_000,
    reason: null,
    createdAt: new Date('2026-09-20T07:00:00Z'),
    dueDate: new Date('2026-10-03T19:00:00Z'),
    handedOverAt: null,
    processedAt: null,
    refundMethod: null,
    cancelledAt: null,
    cancelReason: null,
    student: { id: 10001, firstName: 'Ali', lastName: 'Karimov', phone: '901112233' },
    handedOverBy: null,
    processedBy: null,
    cancelledBy: null,
    ...over,
  }) as never;

describe('toRefundHistoryRow', () => {
  it('a refund paid out before ADR-0075 shows its processedAt as «Berildi»', () => {
    const out = toRefundHistoryRow(
      row({
        processedAt: new Date('2026-09-20T07:00:00Z'),
        processedBy: person(20001, 'Nodira'),
        refundMethod: 'CASH',
      }),
    );
    expect(out).toMatchObject({
      amount: 90_000,
      requestedAt: '2026-09-20T07:00:00.000Z',
      dueDate: '2026-10-04',
      handedOverAt: '2026-09-20T07:00:00.000Z',
      refundMethod: 'CASH',
      closedBy: { id: 20001, name: 'Nodira Test' },
    });
  });

  it('a handed-over request names who handed it over', () => {
    const out = toRefundHistoryRow(
      row({
        handedOverAt: new Date('2026-10-05T09:00:00Z'),
        processedAt: new Date('2026-10-05T09:00:00Z'),
        handedOverBy: person(20002, 'Sardor'),
        processedBy: person(20002, 'Sardor'),
        refundMethod: 'TRANSFER',
      }),
    );
    expect(out.handedOverAt).toBe('2026-10-05T09:00:00.000Z');
    expect(out.closedBy).toEqual({ id: 20002, name: 'Sardor Test' });
  });

  it('a cancelled request carries its reason and who cancelled it, no hand-over', () => {
    const out = toRefundHistoryRow(
      row({
        status: 'REJECTED',
        cancelledAt: new Date('2026-10-01T10:00:00Z'),
        cancelReason: 'Fikridan qaytdi',
        cancelledBy: person(20003, 'Lola'),
      }),
    );
    expect(out).toMatchObject({
      status: 'REJECTED',
      handedOverAt: null,
      cancelledAt: '2026-10-01T10:00:00.000Z',
      cancelReason: 'Fikridan qaytdi',
      closedBy: { id: 20003, name: 'Lola Test' },
    });
  });
});
```

Replace `server/src/refunds/refunds-process.service.spec.ts` with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { RefundStatus } from '@prisma/client';
import { RefundsProcessService } from './refunds-process.service';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from '../transactions/transactions.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';
import { EntityHistoryService } from '../common/entity-history';

const CEO = {
  mainBranch: null,
  branches: [],
  roles: [{ role: { name: 'CEO' } }],
};

/** «Berildi» and «Bekor qilish» on a refund request (ADR-0075). */
describe('RefundsProcessService — hand-over and cancel', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let tx: any;
  let transactionsService: any;
  let cash: any;
  let history: any;

  const requested = {
    id: 'refund-1',
    studentId: 10001,
    enrollmentId: 'enr-1',
    status: RefundStatus.REQUESTED,
    requestedAmount: 120_000,
    approvedAmount: 120_000,
  };

  beforeEach(async () => {
    tx = {
      refund: {
        findFirst: jest.fn().mockResolvedValue({ ...requested }),
        update: jest.fn(({ data }: any) =>
          Promise.resolve({ ...requested, dueDate: null, ...data }),
        ),
      },
      transaction: { findFirst: jest.fn() },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(CEO) },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      refund: { findFirst: jest.fn().mockResolvedValue({ ...requested }) },
      cashAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'acc-1', name: 'Asosiy kassa', type: 'CASH' }),
      },
      $transaction: jest.fn((cb: any) => cb(tx)),
    };
    transactionsService = { reverseTransaction: jest.fn().mockResolvedValue({}) };
    cash = { recordOutflow: jest.fn().mockResolvedValue({}) };
    history = { recordStatusChange: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: CashMovementsService, useValue: cash },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = module.get(RefundsProcessService);
  });

  describe('handOver', () => {
    beforeEach(() => tx.transaction.findFirst.mockResolvedValue({ id: 'tx-refund' }));

    it("takes the money out of the chosen drawer of the student's branch and closes the request", async () => {
      const out = await service.handOver('refund-1', 'acc-1', 7, 1001);

      expect(prisma.cashAccount.findFirst.mock.calls[0][0].where).toEqual({
        id: 'acc-1',
        companyId: 1001,
        branchId: 1,
        isActive: true,
        deletedAt: null,
      });
      expect(cash.recordOutflow).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 1001,
          branchId: 1,
          amount: 120_000,
          cashAccountId: 'acc-1',
          transactionId: 'tx-refund',
          performedById: 7,
        }),
        tx,
      );
      expect(tx.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          handedOverById: 7,
          processedById: 7,
          cashAccountId: 'acc-1',
          refundMethod: 'CASH',
          handedOverAt: expect.any(Date),
          processedAt: expect.any(Date),
        }),
      });
      expect(history.recordStatusChange).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 10001,
          oldValues: {},
          newValues: expect.objectContaining({
            status: 'PUL_QAYTARIB_BERILDI',
            summa: 120_000,
            kassa: 'Asosiy kassa',
            usul: 'Naqd',
          }),
          tx,
        }),
      );
      // The receipt endpoint opens a COMPLETED refund only — this is that moment.
      expect(out.status).toBe('COMPLETED');
    });

    it('a card or bank drawer records the payout as a transfer', async () => {
      prisma.cashAccount.findFirst.mockResolvedValue({
        id: 'acc-2',
        name: 'Karta',
        type: 'CARD',
      });
      await service.handOver('refund-1', 'acc-2', 7, 1001);
      expect(tx.refund.update.mock.calls[0][0].data.refundMethod).toBe('TRANSFER');
    });

    it("refuses a drawer outside the student's branch, writing nothing", async () => {
      prisma.cashAccount.findFirst.mockResolvedValue(null);
      await expect(service.handOver('refund-1', 'acc-9', 7, 1001)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a request already handed over is a 409', async () => {
      tx.refund.findFirst.mockResolvedValue({
        ...requested,
        status: RefundStatus.COMPLETED,
      });
      await expect(service.handOver('refund-1', 'acc-1', 7, 1001)).rejects.toThrow(
        new ConflictException("So'rov allaqachon yopilgan"),
      );
      expect(cash.recordOutflow).not.toHaveBeenCalled();
    });

    it("refuses a caller of another branch", async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: 2,
        branches: [{ branchId: 2 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await expect(service.handOver('refund-1', 'acc-1', 7, 1001)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancel', () => {
    it('gives the money and the lessons back and marks the request REJECTED', async () => {
      tx.transaction.findFirst
        .mockResolvedValueOnce({ id: 'tx-refund' })
        .mockResolvedValueOnce({
          id: 'tx-release',
          metadata: { refundId: 'refund-1', lessonsReleased: 2 },
        });

      await service.cancel('refund-1', 'Fikridan qaytdi', 7, 1001);

      expect(transactionsService.reverseTransaction).toHaveBeenNthCalledWith(
        1,
        'tx-refund',
        { performedById: 7, reason: 'Fikridan qaytdi' },
        tx,
      );
      expect(transactionsService.reverseTransaction).toHaveBeenNthCalledWith(
        2,
        'tx-release',
        { performedById: 7, reason: 'Fikridan qaytdi' },
        tx,
      );
      expect(tx.enrollment.update).toHaveBeenCalledWith({
        where: { id: 'enr-1' },
        data: { prepaidLessonsRemaining: { increment: 2 } },
      });
      expect(tx.refund.update).toHaveBeenCalledWith({
        where: { id: 'refund-1' },
        data: {
          status: 'REJECTED',
          cancelledAt: expect.any(Date),
          cancelledById: 7,
          cancelReason: 'Fikridan qaytdi',
        },
      });
      expect(history.recordStatusChange.mock.calls[0][0].newValues).toEqual({
        status: 'PUL_QAYTARISH_BEKOR_QILINDI',
        summa: 120_000,
        qaytgan_darslar: 2,
        sabab: 'Fikridan qaytdi',
      });
    });

    it('only an open request can be cancelled', async () => {
      tx.refund.findFirst.mockResolvedValue({
        ...requested,
        status: RefundStatus.REJECTED,
      });
      await expect(service.cancel('refund-1', 'x', 7, 1001)).rejects.toThrow(
        ConflictException,
      );
      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
    });
  });
});

/**
 * Reversing a COMPLETED refund that cancelled prepaid lessons: the payout is
 * only half of what it did, so the release adjustment and the lessons come
 * back too.
 */
describe('RefundsProcessService.reverse — cancelled lessons', () => {
  let service: RefundsProcessService;
  let prisma: any;
  let transactionsService: any;
  let txClient: any;

  beforeEach(async () => {
    prisma = {
      user: { findFirst: jest.fn().mockResolvedValue(CEO) },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      refund: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'refund-1',
          studentId: 10001,
          contractId: null,
          enrollmentId: 'enr-1',
          approvedAmount: 100_000,
          status: RefundStatus.COMPLETED,
        }),
      },
      transaction: { findFirst: jest.fn() },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((fn) => fn(txClient)),
    };
    // The lookups run inside the transaction now (shared with cancel).
    txClient = {
      contract: { update: jest.fn() },
      enrollment: { update: jest.fn().mockResolvedValue({}) },
      transaction: prisma.transaction,
    };
    transactionsService = { reverseTransaction: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsProcessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TransactionsService, useValue: transactionsService },
        { provide: CashMovementsService, useValue: { recordOutflow: jest.fn() } },
        { provide: EntityHistoryService, useValue: { recordStatusChange: jest.fn() } },
      ],
    }).compile();
    service = module.get(RefundsProcessService);
  });

  it('reverses the release adjustment and puts the lessons back', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce({
        id: 'tx-release',
        metadata: { refundId: 'refund-1', lessonsReleased: 3 },
      });

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
      'tx-release',
      expect.anything(),
      txClient,
    );
    expect(txClient.enrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { prepaidLessonsRemaining: { increment: 3 } },
    });
  });

  it('reverses only the payout when no lessons were cancelled', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce(null);

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(transactionsService.reverseTransaction).toHaveBeenCalledTimes(1);
    expect(txClient.enrollment.update).not.toHaveBeenCalled();
  });

  it('looks the release up by the refund it was tagged with', async () => {
    prisma.transaction.findFirst
      .mockResolvedValueOnce({ id: 'tx-refund' })
      .mockResolvedValueOnce(null);

    await service.reverse('refund-1', { performedById: 99, companyId: 1001 });

    expect(prisma.transaction.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          type: 'ADJUSTMENT',
          metadata: { path: ['refundId'], equals: 'refund-1' },
        }),
      }),
    );
  });

  it('refuses a refund that is not COMPLETED (a request is cancelled, not reversed)', async () => {
    prisma.refund.findFirst.mockResolvedValueOnce({
      id: 'refund-1',
      studentId: 10001,
      contractId: null,
      enrollmentId: null,
      approvedAmount: 100_000,
      status: RefundStatus.REQUESTED,
    });
    await expect(
      service.reverse('refund-1', { performedById: 99, companyId: 1001 }),
    ).rejects.toThrow(BadRequestException);
  });
});
```

In `server/src/refunds/refunds.controller.spec.ts` append inside the describe:

```ts
  it.each([['CEO'], ['Branch Director'], ['Administrator'], ['Cashier']])(
    'handOver («Berildi») allows %s',
    (role) => {
      expect(guard.canActivate(ctx(controller.handOver, [role]))).toBe(true);
    },
  );

  it('handOver denies Teacher', () => {
    expect(() => guard.canActivate(ctx(controller.handOver, ['Teacher']))).toThrow(
      ForbiddenException,
    );
  });

  it.each([['CEO'], ['Branch Director']])('cancel allows %s', (role) => {
    expect(guard.canActivate(ctx(controller.cancel, [role]))).toBe(true);
  });

  it.each([['Administrator'], ['Cashier'], ['Teacher']])('cancel denies %s', (role) => {
    expect(() => guard.canActivate(ctx(controller.cancel, [role]))).toThrow(
      ForbiddenException,
    );
  });

  it('the history list is open to the Cashier, not the Teacher', () => {
    expect(guard.canActivate(ctx(controller.findAll, ['Cashier']))).toBe(true);
    expect(() => guard.canActivate(ctx(controller.findAll, ['Teacher']))).toThrow(
      ForbiddenException,
    );
  });
```

In `server/src/refunds/refunds-eligibility.service.spec.ts` append:

```ts
  describe('findAll — the history list (ADR-0075)', () => {
    const ROW = {
      id: 'r-1',
      status: 'COMPLETED',
      requestedAmount: 90_000,
      approvedAmount: 90_000,
      reason: null,
      createdAt: new Date('2026-09-20T07:00:00Z'),
      dueDate: null,
      handedOverAt: null,
      processedAt: new Date('2026-09-20T07:00:00Z'),
      refundMethod: 'CASH',
      cancelledAt: null,
      cancelReason: null,
      student: { id: 10001, firstName: 'Ali', lastName: 'Karimov', phone: '901112233' },
      handedOverBy: null,
      processedBy: { id: 20001, firstName: 'Nodira', lastName: 'Test' },
      cancelledBy: null,
    };
    beforeEach(() => {
      prisma.refund.findMany = jest.fn().mockResolvedValue([ROW]);
      prisma.refund.count = jest.fn().mockResolvedValue(11);
    });

    it('filters by a status list, scopes by the student branch, pages newest request first', async () => {
      const out = await service.findAll(1, [1], {
        status: ['COMPLETED', 'REJECTED'],
        page: 2,
        pageSize: 10,
      } as never);
      const args = prisma.refund.findMany.mock.calls[0][0];
      expect(args.where).toEqual({
        companyId: 1,
        student: { branches: { some: { branchId: { in: [1] } } } },
        status: { in: ['COMPLETED', 'REJECTED'] },
      });
      expect(args).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: 10,
        take: 10,
      });
      expect(out).toMatchObject({ total: 11, page: 2, pageSize: 10 });
      expect(out.data[0]).toMatchObject({
        id: 'r-1',
        amount: 90_000,
        handedOverAt: '2026-09-20T07:00:00.000Z',
      });
    });

    it('one status is an equals; none means every status', async () => {
      await service.findAll(1, null, { status: ['REQUESTED'] } as never);
      expect(prisma.refund.findMany.mock.calls[0][0].where.status).toBe('REQUESTED');
      await service.findAll(1, null, {} as never);
      expect(prisma.refund.findMany.mock.calls[1][0].where.status).toBeUndefined();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/refunds`
Expected: FAIL — `service.handOver is not a function`, `controller.handOver` undefined, `toRefundHistoryRow` not exported, `findAll` returns an array.

- [ ] **Step 3: The DTOs**

`server/src/refunds/dto/hand-over-refund.dto.ts`:

```ts
import { IsUUID } from 'class-validator';

/** «Berildi»: the drawer the money left (an account of the student's branch). */
export class HandOverRefundDto {
  @IsUUID('all', { message: 'Kassani tanlang' })
  cashAccountId: string;
}
```

`server/src/refunds/dto/cancel-refund.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CancelRefundDto {
  // Trimmed before the checks, so a reason of spaces is refused.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Sababini yozing' })
  @MaxLength(500)
  reason: string;
}
```

`server/src/refunds/dto/refund-list-query.dto.ts`:

```ts
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RefundStatus } from '@prisma/client';
import { toStringArray } from '../../common/dto/to-array';

/** `GET /refunds` — the history page asks `?status=COMPLETED,REJECTED`. */
export class RefundListQueryDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsEnum(RefundStatus, { each: true })
  status?: RefundStatus[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;

  /** Read by `BranchScopeGuard`; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
```

- [ ] **Step 4: The history row** — append to `server/src/refunds/refund-view.ts` (and add `import { Prisma, RefundStatus, type PaymentMethod } from '@prisma/client';`):

```ts
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/** What the history list reads of a refund. */
export const REFUND_HISTORY_SELECT = {
  id: true,
  status: true,
  requestedAmount: true,
  approvedAmount: true,
  reason: true,
  createdAt: true,
  dueDate: true,
  handedOverAt: true,
  processedAt: true,
  refundMethod: true,
  cancelledAt: true,
  cancelReason: true,
  student: { select: { id: true, firstName: true, lastName: true, phone: true } },
  handedOverBy: PERSON,
  processedBy: PERSON,
  cancelledBy: PERSON,
} satisfies Prisma.RefundSelect;

type RefundHistoryFact = Prisma.RefundGetPayload<{
  select: typeof REFUND_HISTORY_SELECT;
}>;

export interface RefundHistoryRow {
  id: string;
  student: { id: number; firstName: string; lastName: string; phone: string };
  amount: number;
  status: RefundStatus;
  reason: string | null;
  requestedAt: string;
  dueDate: string | null;
  handedOverAt: string | null;
  refundMethod: PaymentMethod | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  closedBy: { id: number; name: string } | null;
}

const person = (u: { id: number; firstName: string; lastName: string } | null) =>
  u ? { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() } : null;

/**
 * One history line. A refund paid out before ADR-0075 was handed over on the
 * spot, so its `processedAt` / `processedBy` stand for «Berildi».
 */
export function toRefundHistoryRow(r: RefundHistoryFact): RefundHistoryRow {
  const completed = r.status === RefundStatus.COMPLETED;
  const rejected = r.status === RefundStatus.REJECTED;
  const handedOverAt = completed ? (r.handedOverAt ?? r.processedAt) : null;
  return {
    id: r.id,
    student: r.student,
    amount: r.approvedAmount ?? r.requestedAmount,
    status: r.status,
    reason: r.reason,
    requestedAt: r.createdAt.toISOString(),
    dueDate: r.dueDate ? tashkentDateStr(r.dueDate) : null,
    handedOverAt: handedOverAt?.toISOString() ?? null,
    refundMethod: r.refundMethod,
    cancelledAt: r.cancelledAt?.toISOString() ?? null,
    cancelReason: r.cancelReason,
    closedBy: completed
      ? person(r.handedOverBy ?? r.processedBy)
      : rejected
        ? person(r.cancelledBy ?? r.processedBy)
        : null,
  };
}
```

- [ ] **Step 5: Replace `server/src/refunds/refunds-process.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashAccountType,
  PaymentMethod,
  Prisma,
  RefundStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { TransactionsService } from '../transactions/transactions.service';
import { CashMovementsService } from '../cash-accounts/cash-movements.service';
import { EntityHistoryService } from '../common/entity-history';
import { REFUND_TRANSITIONS } from '../common/finance/status-transitions';
import { rethrowAsConflict } from '../common/transaction-conflict';
import { refundView } from './refund-view';

/** A hand-over or cancel that finds the request already handed over or cancelled. */
export const REFUND_CLOSED_MESSAGE = "So'rov allaqachon yopilgan";

const TX = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 15_000,
};

@Injectable()
export class RefundsProcessService {
  constructor(
    private prisma: PrismaService,
    private transactionsService: TransactionsService,
    private cashMovements: CashMovementsService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * «Berildi» (ADR-0075): the money leaves the chosen drawer of the student's
   * branch. The balance already went to 0 at the request; this writes only the
   * cash movement (linked to the request's REFUND row, so `reverse` unwinds
   * it), closes the request and makes the receipt available.
   */
  async handOver(
    id: string,
    cashAccountId: string,
    userId: number,
    companyId: number,
  ) {
    const refund = await this.loadForWrite(id, userId, companyId);
    const account = await this.prisma.cashAccount.findFirst({
      where: {
        id: cashAccountId,
        companyId,
        branchId: refund.branchId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true, type: true },
    });
    if (!account) {
      throw new BadRequestException("Kassa o'quvchining filialida topilmadi");
    }
    const refundMethod =
      account.type === CashAccountType.CASH
        ? PaymentMethod.CASH
        : PaymentMethod.TRANSFER;

    const saved = await this.prisma
      .$transaction(async (tx) => {
        const row = await this.openRequest(tx, id, companyId, RefundStatus.COMPLETED);
        const ledger = await tx.transaction.findFirst({
          where: {
            refundId: id,
            type: 'REFUND',
            reversedAt: null,
            reversedTransactionId: null,
          },
          select: { id: true },
        });
        if (!ledger) {
          throw new BadRequestException(
            'Refund ledger yozuvi topilmadi yoki avvalroq bekor qilingan',
          );
        }
        const amount = row.approvedAmount ?? row.requestedAmount;
        await this.cashMovements.recordOutflow(
          {
            companyId,
            branchId: refund.branchId,
            amount,
            cashAccountId: account.id,
            transactionId: ledger.id,
            description: 'Pul qaytarildi',
            performedById: userId,
          },
          tx,
        );
        const now = new Date();
        const updated = await tx.refund.update({
          where: { id },
          data: {
            status: RefundStatus.COMPLETED,
            handedOverAt: now,
            handedOverById: userId,
            cashAccountId: account.id,
            refundMethod,
            // Old readers (receipt, legacy lists) keep reading these.
            processedAt: now,
            processedById: userId,
          },
        });
        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: refund.studentId,
          oldValues: {},
          newValues: {
            status: 'PUL_QAYTARIB_BERILDI',
            summa: amount,
            kassa: account.name,
            usul: refundMethod === PaymentMethod.CASH ? 'Naqd' : 'Karta',
          },
          changedById: userId,
          companyId,
          tx,
        });
        return updated;
      }, TX)
      .catch(rethrowAsConflict);
    return refundView(saved);
  }

  /**
   * «Bekor qilish» (ADR-0075): a request not yet handed over is undone — the
   * REFUND row and the release adjustment are reversed (balance and lessons
   * back) and the request becomes REJECTED. The pair counts in neither month
   * (ADR-0058).
   */
  async cancel(id: string, reason: string, userId: number, companyId: number) {
    const refund = await this.loadForWrite(id, userId, companyId);
    const saved = await this.prisma
      .$transaction(async (tx) => {
        const row = await this.openRequest(tx, id, companyId, RefundStatus.REJECTED);
        const lessons = await this.unwindLedger(
          tx,
          { id, studentId: refund.studentId, enrollmentId: row.enrollmentId },
          { performedById: userId, reason },
        );
        const updated = await tx.refund.update({
          where: { id },
          data: {
            status: RefundStatus.REJECTED,
            cancelledAt: new Date(),
            cancelledById: userId,
            cancelReason: reason,
          },
        });
        await this.entityHistoryService.recordStatusChange({
          entityType: 'Student',
          entityId: refund.studentId,
          oldValues: {},
          newValues: {
            status: 'PUL_QAYTARISH_BEKOR_QILINDI',
            summa: row.approvedAmount ?? row.requestedAmount,
            qaytgan_darslar: lessons,
            sabab: reason,
          },
          changedById: userId,
          companyId,
          tx,
        });
        return updated;
      }, TX)
      .catch(rethrowAsConflict);
    return refundView(saved);
  }

  /**
   * Reverse a COMPLETED refund (CEO). Ledger-first: the Refund row stays, the
   * REFUND row (and its hand-over cash movement) and the release adjustment
   * are reversed, the lessons go back. A request is cancelled, not reversed.
   */
  async reverse(
    id: string,
    params: { reason?: string; performedById: number; companyId: number },
  ) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId: params.companyId },
      select: {
        id: true,
        studentId: true,
        contractId: true,
        enrollmentId: true,
        approvedAmount: true,
        status: true,
      },
    });
    if (!refund) throw new NotFoundException('Refund topilmadi');

    await assertCallerMayWriteForStudent(
      this.prisma,
      params.performedById,
      refund.studentId,
      params.companyId,
    );

    if (refund.status !== RefundStatus.COMPLETED) {
      throw new BadRequestException(
        'Faqat yakunlangan refundni bekor qilish mumkin',
      );
    }

    const approvedAmount = refund.approvedAmount ?? 0;
    return this.prisma.$transaction(
      async (tx) => {
        await this.unwindLedger(tx, refund, {
          performedById: params.performedById,
          reason: params.reason ?? 'Refund bekor qilindi',
        });
        // Legacy refunds tied to a Contract: undo the paidAmount decrement.
        // The contract stays REFUNDED — operators reopen it explicitly.
        if (approvedAmount > 0 && refund.contractId) {
          await tx.contract.update({
            where: { id: refund.contractId },
            data: { paidAmount: { increment: approvedAmount } },
          });
        }
        return { reversedRefundId: id, amount: approvedAmount };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /** The refund, company-confined, and the caller's right to move its student's money. */
  private async loadForWrite(id: string, userId: number, companyId: number) {
    const refund = await this.prisma.refund.findFirst({
      where: { id, companyId },
      select: { id: true, studentId: true },
    });
    if (!refund) throw new NotFoundException("So'rov topilmadi");
    const branchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      refund.studentId,
      companyId,
    );
    return { ...refund, branchId };
  }

  /** Re-reads the row in the transaction: only a request may move on. */
  private async openRequest(
    tx: Prisma.TransactionClient,
    id: string,
    companyId: number,
    to: RefundStatus,
  ) {
    const row = await tx.refund.findFirst({
      where: { id, companyId },
      select: {
        status: true,
        requestedAmount: true,
        approvedAmount: true,
        enrollmentId: true,
      },
    });
    if (!row || !REFUND_TRANSITIONS[row.status].includes(to)) {
      throw new ConflictException(REFUND_CLOSED_MESSAGE);
    }
    return row;
  }

  /**
   * Walks a refund's ledger back: the REFUND row (with any cash movement linked
   * to it — `reverseTransaction` unwinds those) and the release ADJUSTMENT,
   * found by the `refundId` tag `releasePrepaidLessons` wrote, with its lessons.
   * Shared by `reverse` and `cancel`. Returns the lessons given back.
   */
  private async unwindLedger(
    tx: Prisma.TransactionClient,
    refund: { id: string; studentId: number; enrollmentId: string | null },
    params: { performedById: number; reason: string },
  ): Promise<number> {
    const ledgerEntry = await tx.transaction.findFirst({
      where: {
        refundId: refund.id,
        type: 'REFUND',
        reversedTransactionId: null,
        reversedAt: null,
      },
      select: { id: true },
    });
    if (!ledgerEntry) {
      throw new BadRequestException(
        'Refund ledger yozuvi topilmadi yoki avvalroq bekor qilingan',
      );
    }
    const releaseEntry = await tx.transaction.findFirst({
      where: {
        studentId: refund.studentId,
        type: 'ADJUSTMENT',
        reversedTransactionId: null,
        reversedAt: null,
        metadata: { path: ['refundId'], equals: refund.id },
      },
      select: { id: true, metadata: true },
    });

    await this.transactionsService.reverseTransaction(ledgerEntry.id, params, tx);
    if (!releaseEntry) return 0;

    await this.transactionsService.reverseTransaction(releaseEntry.id, params, tx);
    const meta = releaseEntry.metadata as { lessonsReleased?: number } | null;
    const lessons = Number(meta?.lessonsReleased ?? 0);
    if (lessons > 0 && refund.enrollmentId) {
      await tx.enrollment.update({
        where: { id: refund.enrollmentId },
        data: { prepaidLessonsRemaining: { increment: lessons } },
      });
    }
    return lessons;
  }
}
```

- [ ] **Step 6: `findAll` becomes the history list** — in `refunds-eligibility.service.ts` replace `findAll` (keep its doc comment's branch paragraph, add «paged; `status` filters by a list (ADR-0075)») with:

```ts
  async findAll(
    companyId: number,
    branchIds: ReportBranchIds,
    q: RefundListQueryDto,
  ) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 10;
    const where: Prisma.RefundWhereInput = {
      companyId,
      student: studentBranchWhere(branchIds),
      status: equalsOrIn(q.status),
    };
    const [rows, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: REFUND_HISTORY_SELECT,
      }),
      this.prisma.refund.count({ where }),
    ]);
    return { data: rows.map(toRefundHistoryRow), total, page, pageSize };
  }
```

with imports `Prisma` (from `@prisma/client`), `equalsOrIn` (`../common/dto/to-array`), `REFUND_HISTORY_SELECT`, `toRefundHistoryRow` (`./refund-view`), `RefundListQueryDto` (`./dto/refund-list-query.dto`).

- [ ] **Step 7: Facade, controller, module**

`refunds.service.ts` — add imports for the three DTOs and:

```ts
  handOver(id: string, dto: HandOverRefundDto, userId: number, companyId: number) {
    return this.processService.handOver(id, dto.cashAccountId, userId, companyId);
  }
  cancel(id: string, dto: CancelRefundDto, userId: number, companyId: number) {
    return this.processService.cancel(id, dto.reason, userId, companyId);
  }
```

and change `findAll` to `findAll(companyId: number, branchIds: ReportBranchIds, q: RefundListQueryDto) { return this.eligibility.findAll(companyId, branchIds, q); }`.

`refunds.controller.ts` — replace the `findAll` handler and add two handlers (imports: `HandOverRefundDto`, `CancelRefundDto`, `RefundListQueryDto`):

```ts
  /** History page (ADR-0075): `?status=COMPLETED,REJECTED&page&pageSize`. Read by the Cashier too. */
  @Get()
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  findAll(
    @Query() q: RefundListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.refundsService.findAll(companyId, scope, q);
  }

  /** «Berildi» — the money leaves the chosen drawer (ADR-0075). */
  @Post(':id/hand-over')
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  handOver(
    @Param('id') id: string,
    @Body() dto: HandOverRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.handOver(id, dto, userId, companyId);
  }

  /** «Bekor qilish» of a request not yet handed over (ADR-0075). */
  @Post(':id/cancel')
  @Roles('CEO', 'Branch Director')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRefundDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.refundsService.cancel(id, dto, userId, companyId);
  }
```

`refunds.module.ts` — `imports: [TransactionsModule, BillingModule, CashAccountsModule]` (import `CashAccountsModule` from `../cash-accounts/cash-accounts.module`).

`branch-route-policy.ts` — in the first `BRANCH_SCOPED_BY_ENTITY` block (the one with `'POST /refunds/quick'`), after `'POST /refunds/:id/reverse',` add:

```ts
      'POST /refunds/:id/hand-over',
      'POST /refunds/:id/cancel',
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd server && npx jest src/refunds src/common/auth/branch-route-policy.spec.ts src/receipts`
Expected: PASS.

- [ ] **Step 9: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/refunds src/common/auth/branch-route-policy.ts && npx eslint src/refunds src/common/auth/branch-route-policy.ts && npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add server/src/refunds server/src/common/auth/branch-route-policy.ts
git commit -m "feat(refunds): hand-over and cancel of a refund request; paged history list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Balance notices — the table writer, the pinned bot text, the transfer condition

**Files:**
- Modify: `server/src/common/utils/phone.util.ts` (+ `phone.util.spec.ts`)
- Modify: `server/src/absence-pause/absence-pause-notify.service.ts` (`formatBranchPhone` delegates)
- Create: `server/src/balance-notices/transfer-condition.ts` (+ `transfer-condition.spec.ts`)
- Create: `server/src/balance-notices/load-transfer-state.ts`
- Create: `server/src/balance-notices/balance-notice-text.ts` (+ `balance-notice-text.spec.ts`)
- Create: `server/src/balance-notices/dto/create-balance-notice.dto.ts`
- Create: `server/src/balance-notices/balance-notices.service.ts` (+ `balance-notices.service.spec.ts`)
- Create: `server/src/balance-notices/balance-notices.controller.ts` (+ `balance-notices.controller.spec.ts`)
- Create: `server/src/balance-notices/balance-notices.module.ts`
- Modify: `server/src/app.module.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts`

**Interfaces:**
- Consumes: `addBankDays`, `REFUND_TERM_BANK_DAYS`, `termHolidays` (Task 1); `BalanceNotice`, `BalanceNoticeChannel` (Task 2); `SmsService.sendToStudent(studentId, content, type: SmsMessageType, senderUserId?, companyId?, opts?: { assertCallerBranch?: boolean }): Promise<SmsMessage>`; `som`, `monthName`, `dm` (`statements/statement-text.ts`); `escapeHtml` (`telegram-groups/utils/format.util.ts`).
- Produces:
  - `export function formatUzPhone(phone: string): string` (`common/utils/phone.util.ts`)
  - `transfer-condition.ts`: `export const TRANSFER_WAIT_DAYS = 30;` `export interface NoticeCell { date: string; channel: BalanceNoticeChannel }` `export interface TransferState { notice: NoticeCell | null; termEnds: string | null; allowedFrom: string | null; allowed: boolean; refusal: string | null }` `export const NO_NOTICE_REFUSAL: string` `export function latestValidNotice(latest: { createdAt: Date; channel: BalanceNoticeChannel } | null, statusChangedAt: Date | null): NoticeCell | null` `export function transferTerm(noticeDay: string, holidays: ReadonlySet<string>): { termEnds: string; allowedFrom: string }` `export function transferState(notice: NoticeCell | null, holidays: ReadonlySet<string>, today: string): TransferState`
  - `load-transfer-state.ts`: `export type TransferDb = Pick<PrismaClient, 'balanceNotice' | 'holiday'>;` `export async function loadTransferState(db: TransferDb, student: { id: number; statusChangedAt: Date | null }, branchId: number | null, now: Date): Promise<TransferState>` and `export async function loadNoticeText(db: Pick<PrismaClient, 'branch' | 'company' | 'holiday'>, p: { firstName: string; balance: number; branchId: number | null; companyId: number }, now: Date): Promise<string | null>` (null = neither the branch nor the company has a phone)
  - `balance-notice-text.ts`: `export function balanceNoticeText(p: { firstName: string; balance: number; allowedFrom: string; phone: string }): string`
  - `BalanceNoticesService.create(studentId: number, dto: CreateBalanceNoticeDto, userId: number, companyId: number): Promise<BalanceNotice>`
  - Route `POST /students/:id/balance-notices` — shape in the API contract.

- [ ] **Step 1: Write the failing tests**

Append to `server/src/common/utils/phone.util.spec.ts` (and add `formatUzPhone` to its import):

```ts
describe('formatUzPhone', () => {
  it('prints a stored 9-digit number as «+998 XX XXX XX XX»', () => {
    expect(formatUzPhone('901234567')).toBe('+998 90 123 45 67');
  });
  it('drops a leading 998 and any punctuation', () => {
    expect(formatUzPhone('+998 (90) 123-45-67')).toBe('+998 90 123 45 67');
  });
  it('shows any other length raw rather than inventing a shape', () => {
    expect(formatUzPhone('12345')).toBe('+998 12345');
  });
});
```

`server/src/balance-notices/transfer-condition.spec.ts`:

```ts
import {
  latestValidNotice,
  NO_NOTICE_REFUSAL,
  transferState,
  transferTerm,
} from './transfer-condition';

const none = new Set<string>();

describe('transfer condition (ADR-0075)', () => {
  describe('latestValidNotice', () => {
    const notice = { createdAt: new Date('2026-10-10T07:00:00Z'), channel: 'BOT' as const };

    it("a notice given in the student's current state counts", () => {
      expect(latestValidNotice(notice, new Date('2026-10-01T07:00:00Z'))).toEqual({
        date: '2026-10-10',
        channel: 'BOT',
      });
      expect(latestValidNotice(notice, notice.createdAt)).not.toBeNull();
    });

    it('a notice from before the student came back and left again does not', () => {
      expect(latestValidNotice(notice, new Date('2026-10-15T07:00:00Z'))).toBeNull();
    });

    it('a card that never changed status: every notice counts; no notice is none', () => {
      expect(latestValidNotice(notice, null)).not.toBeNull();
      expect(latestValidNotice(null, null)).toBeNull();
    });
  });

  it('the §5.2 example: notice Sat 10.10 → term to 23.10 → transfer from 22.11', () => {
    expect(transferTerm('2026-10-10', none)).toEqual({
      termEnds: '2026-10-23',
      allowedFrom: '2026-11-22',
    });
  });

  describe('transferState', () => {
    const notice = { date: '2026-10-10', channel: 'CALL' as const };

    it('without a notice: locked, with the spec text', () => {
      expect(transferState(null, none, '2026-12-01')).toEqual({
        notice: null,
        termEnds: null,
        allowedFrom: null,
        allowed: false,
        refusal: NO_NOTICE_REFUSAL,
      });
      expect(NO_NOTICE_REFUSAL).toBe(
        "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
      );
    });

    it('too early: locked, naming the three dates', () => {
      expect(transferState(notice, none, '2026-11-21')).toEqual({
        notice,
        termEnds: '2026-10-23',
        allowedFrom: '2026-11-22',
        allowed: false,
        refusal:
          "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      });
    });

    it('opens on the allowed day itself', () => {
      expect(transferState(notice, none, '2026-11-22')).toMatchObject({
        allowed: true,
        refusal: null,
      });
    });
  });
});
```

`server/src/balance-notices/balance-notice-text.spec.ts`:

```ts
import { balanceNoticeText } from './balance-notice-text';

describe('balanceNoticeText — variant 1, CEO 10.10.2026 (do not reword)', () => {
  it('pins the approved text', () => {
    expect(
      balanceNoticeText({
        firstName: 'Ali',
        balance: 350_000,
        allowedFrom: '2026-11-22',
        phone: '901234567',
      }),
    ).toBe(
      "Assalomu alaykum, Ali! DaF Sprachzentrum hisobingizda 350 000 so'm qolgan. Uni qaytarib olish uchun 22-noyabrgacha filial raqamiga qo'ng'iroq qiling: +998 90 123 45 67. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!",
    );
  });

  it('a single-digit day has no leading zero; the name is HTML-safe', () => {
    const text = balanceNoticeText({
      firstName: 'A<b>',
      balance: 5_000,
      allowedFrom: '2026-12-05',
      phone: '901234567',
    });
    expect(text).toContain('5-dekabrgacha');
    expect(text).toContain('Assalomu alaykum, A&lt;b&gt;!');
  });
});
```

`server/src/balance-notices/balance-notices.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BalanceNoticesService } from './balance-notices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { EntityHistoryService } from '../common/entity-history';

describe('BalanceNoticesService (ADR-0075)', () => {
  let service: BalanceNoticesService;
  let prisma: any;
  let sms: { sendToStudent: jest.Mock };
  let history: { recordStatusChange: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-10-10T07:00:00Z')); // Saturday, 12:00 Tashkent
    prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      student: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ firstName: 'Ali', balance: 350_000, telegramChatId: '555' }),
      },
      branch: { findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }) },
      company: { findUnique: jest.fn().mockResolvedValue({ phone: '712000000' }) },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      balanceNotice: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({ id: 'n-1', createdAt: new Date(), ...data }),
        ),
      },
    };
    sms = {
      sendToStudent: jest
        .fn()
        .mockResolvedValue({ id: 'sms-1', status: 'SENT', errorMessage: null }),
    };
    history = { recordStatusChange: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        BalanceNoticesService,
        { provide: PrismaService, useValue: prisma },
        { provide: SmsService, useValue: sms },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();
    service = module.get(BalanceNoticesService);
  });
  afterEach(() => jest.useRealTimers());

  it('BOT: sends the pinned text through the student SMS log and keeps the message id', async () => {
    await service.create(10001, { channel: 'BOT' }, 7, 1001);

    expect(sms.sendToStudent).toHaveBeenCalledWith(
      10001,
      "Assalomu alaykum, Ali! DaF Sprachzentrum hisobingizda 350 000 so'm qolgan. Uni qaytarib olish uchun 22-noyabrgacha filial raqamiga qo'ng'iroq qiling: +998 90 123 45 67. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!",
      'AUTO',
      7,
      1001,
      { assertCallerBranch: true },
    );
    expect(prisma.balanceNotice.create).toHaveBeenCalledWith({
      data: {
        studentId: 10001,
        companyId: 1001,
        channel: 'BOT',
        amount: 350_000,
        note: null,
        smsMessageId: 'sms-1',
        createdById: 7,
      },
    });
    expect(history.recordStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 10001,
        oldValues: {},
        newValues: {
          status: 'PUL_HAQIDA_XABAR_BERILDI',
          kanal: 'Telegram bot',
          summa: 350_000,
          izoh: null,
        },
      }),
    );
  });

  it.each([
    ["Telegram's English reason", "403: Forbidden: bot was blocked by the user"],
    ["no reason at all", null],
  ])("BOT: a failed send (%s) is the fixed Uzbek 400, and no notice", async (_label, errorMessage) => {
    sms.sendToStudent.mockResolvedValue({ id: "sms-2", status: "FAILED", errorMessage });
    await expect(service.create(10001, { channel: "BOT" }, 7, 1001)).rejects.toMatchObject({
      status: 400,
      message: "Botga xabar yetmadi — qo'ng'iroq qiling",
    });
    expect(prisma.balanceNotice.create).not.toHaveBeenCalled();
    expect(history.recordStatusChange).not.toHaveBeenCalled();
  });

  it('BOT: no linked chat → call instead, nothing sent', async () => {
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Ali',
      balance: 350_000,
      telegramChatId: null,
    });
    await expect(service.create(10001, { channel: 'BOT' }, 7, 1001)).rejects.toThrow(
      "Telegram bog'lanmagan — qo'ng'iroq qiling",
    );
    expect(sms.sendToStudent).not.toHaveBeenCalled();
  });

  it("BOT: the company's phone stands in for a branch without one; neither → 400", async () => {
    prisma.branch.findUnique.mockResolvedValue({ phone: null });
    await service.create(10001, { channel: 'BOT' }, 7, 1001);
    expect(sms.sendToStudent.mock.calls[0][1]).toContain('+998 71 200 00 00');

    prisma.company.findUnique.mockResolvedValue({ phone: null });
    await expect(service.create(10001, { channel: 'BOT' }, 7, 1001)).rejects.toThrow(
      'Filial telefon raqami kiritilmagan',
    );
  });

  it('CALL: writes the notice with its note, sends nothing', async () => {
    await service.create(10001, { channel: 'CALL', note: 'Ertaga keladi' }, 7, 1001);
    expect(sms.sendToStudent).not.toHaveBeenCalled();
    expect(prisma.balanceNotice.create.mock.calls[0][0].data).toMatchObject({
      channel: 'CALL',
      note: 'Ertaga keladi',
      smsMessageId: null,
    });
  });

  it('a student with nothing on the balance gets no notice', async () => {
    prisma.student.findFirst.mockResolvedValue({
      firstName: 'Ali',
      balance: 0,
      telegramChatId: '555',
    });
    await expect(service.create(10001, { channel: 'CALL' }, 7, 1001)).rejects.toThrow(
      "O'quvchi hisobida pul yo'q",
    );
  });
});
```

`server/src/balance-notices/balance-notices.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { BalanceNoticesController } from './balance-notices.controller';
import { BalanceNoticesService } from './balance-notices.service';

describe('BalanceNoticesController — role guards', () => {
  let controller: BalanceNoticesController;
  const guard = new RolesGuard(new Reflector());

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [BalanceNoticesController],
      providers: [{ provide: BalanceNoticesService, useValue: {} }],
    }).compile();
    controller = module.get(BalanceNoticesController);
  });

  const ctx = (roles: string[]) =>
    ({
      getHandler: () => controller.create,
      getClass: () => BalanceNoticesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;

  it('class-level @Roles is CEO, Branch Director, Administrator', () => {
    expect(new Reflector().get(ROLES_KEY, BalanceNoticesController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
    ]);
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator']])('create allows %s', (role) => {
    expect(guard.canActivate(ctx([role]))).toBe(true);
  });

  it.each([['Cashier'], ['Teacher']])('create denies %s', (role) => {
    expect(() => guard.canActivate(ctx([role]))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/balance-notices src/common/utils/phone.util.spec.ts`
Expected: FAIL — modules not found, `formatUzPhone` not exported.

- [ ] **Step 3: `formatUzPhone`** — append to `server/src/common/utils/phone.util.ts`:

```ts
/**
 * `905351099` → `+998 90 535 10 99`. A stored Uzbek number is 9 digits
 * (`Branch.phone`, `Company.phone`); a leading 998 and punctuation are
 * dropped first. Any other length is shown raw — a message with an odd number
 * beats one with none.
 */
export function formatUzPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^998(?=\d{9}$)/, '');
  if (digits.length !== 9) return `+998 ${digits}`;
  return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
}
```

In `server/src/absence-pause/absence-pause-notify.service.ts` replace the body of `formatBranchPhone` (keep its signature and doc comment) with `return phone ? formatUzPhone(phone) : null;` and import `formatUzPhone` from `../common/utils/phone.util`.

- [ ] **Step 4: `transfer-condition.ts`**

```ts
import type { BalanceNoticeChannel } from '@prisma/client';
import { addBankDays, REFUND_TERM_BANK_DAYS } from '../common/date/bank-days';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
import { dm } from '../statements/statement-text';

/**
 * «Markaz hisobiga o'tkazish» opens only after the student was told (ADR-0075):
 * the notice starts the 10-bank-day refund term, then the contract's 30 days.
 * Pure — `loadTransferState` reads the notice and the holidays.
 */
export const TRANSFER_WAIT_DAYS = 30;

/** A notice as the page shows it: the Tashkent day and the channel. */
export interface NoticeCell {
  date: string;
  channel: BalanceNoticeChannel;
}

export interface TransferState {
  /** The latest valid notice. */
  notice: NoticeCell | null;
  /** notice + 10 bank days. */
  termEnds: string | null;
  /** termEnds + 30 calendar days — the first day a withdrawal is allowed. */
  allowedFrom: string | null;
  allowed: boolean;
  /** The exact 400 `POST /withdrawals` answers; null when allowed. */
  refusal: string | null;
}

export const NO_NOTICE_REFUSAL =
  "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.";

/**
 * A notice counts only if it was given in the student's current state
 * (`createdAt ≥ statusChangedAt`): one given before the student came back and
 * left again does not. `latest` is the student's newest notice — when it does
 * not count, no older one can.
 */
export function latestValidNotice(
  latest: { createdAt: Date; channel: BalanceNoticeChannel } | null,
  statusChangedAt: Date | null,
): NoticeCell | null {
  if (!latest) return null;
  if (statusChangedAt && latest.createdAt < statusChangedAt) return null;
  return { date: tashkentDateStr(latest.createdAt), channel: latest.channel };
}

/** The spec's `transferAllowedFrom`: notice + 10 bank days + 30 days. */
export function transferTerm(
  noticeDay: string,
  holidays: ReadonlySet<string>,
): { termEnds: string; allowedFrom: string } {
  const termEnds = addBankDays(noticeDay, REFUND_TERM_BANK_DAYS, holidays);
  return { termEnds, allowedFrom: addDaysToDateStr(termEnds, TRANSFER_WAIT_DAYS) };
}

export function transferState(
  notice: NoticeCell | null,
  holidays: ReadonlySet<string>,
  today: string,
): TransferState {
  if (!notice) {
    return {
      notice: null,
      termEnds: null,
      allowedFrom: null,
      allowed: false,
      refusal: NO_NOTICE_REFUSAL,
    };
  }
  const { termEnds, allowedFrom } = transferTerm(notice.date, holidays);
  const allowed = today >= allowedFrom;
  return {
    notice,
    termEnds,
    allowedFrom,
    allowed,
    refusal: allowed
      ? null
      : `Markazga o'tkazish ${dm(allowedFrom)} dan ochiladi (xabar ${dm(notice.date)} da berilgan, qaytarish muddati ${dm(termEnds)} gacha).`,
  };
}
```

- [ ] **Step 5: `load-transfer-state.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';
import { termHolidays } from '../holidays/holiday-date-set';
import { balanceNoticeText } from './balance-notice-text';
import {
  latestValidNotice,
  transferState,
  transferTerm,
  type TransferState,
} from './transfer-condition';

export type TransferDb = Pick<PrismaClient, 'balanceNotice' | 'holiday'>;

/**
 * The bot text a notice given now would carry — what «Botga xabar yuborish»
 * sends and what the drawer previews. Null when neither the branch nor the
 * company has a phone (the send is then refused).
 */
export async function loadNoticeText(
  db: Pick<PrismaClient, 'branch' | 'company' | 'holiday'>,
  p: { firstName: string; balance: number; branchId: number | null; companyId: number },
  now: Date,
): Promise<string | null> {
  const [branch, company] = await Promise.all([
    p.branchId === null
      ? null
      : db.branch.findUnique({ where: { id: p.branchId }, select: { phone: true } }),
    db.company.findUnique({ where: { id: p.companyId }, select: { phone: true } }),
  ]);
  const phone = branch?.phone || company?.phone;
  if (!phone) return null;
  const today = tashkentDateStr(now);
  const { allowedFrom } = transferTerm(today, await termHolidays(db, today, p.branchId));
  return balanceNoticeText({
    firstName: p.firstName,
    balance: p.balance,
    allowedFrom,
    phone,
  });
}

/**
 * The transfer lock of one student, read the same way by the withdrawal
 * write, its preview and the «Qaytariladigan pul» drawer. A plain function,
 * so those modules need no import of this one.
 */
export async function loadTransferState(
  db: TransferDb,
  student: { id: number; statusChangedAt: Date | null },
  branchId: number | null,
  now: Date,
): Promise<TransferState> {
  const latest = await db.balanceNotice.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, channel: true },
  });
  const notice = latestValidNotice(latest, student.statusChangedAt);
  const holidays = notice
    ? await termHolidays(db, notice.date, branchId)
    : new Set<string>();
  return transferState(notice, holidays, tashkentDateStr(now));
}
```

- [ ] **Step 6: `balance-notice-text.ts`**

```ts
import { formatUzPhone } from '../common/utils/phone.util';
import { monthName, som } from '../statements/statement-text';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/**
 * The bot notice — variant 1, approved by the CEO on 10.10.2026. Do not
 * reword: the spec test pins it. `allowedFrom` is `transferTerm(today).allowedFrom`;
 * `phone` is the branch's, else the company's. SmsService sends HTML, so the
 * name is escaped.
 */
export function balanceNoticeText(p: {
  firstName: string;
  balance: number;
  allowedFrom: string;
  phone: string;
}): string {
  const until = `${Number(p.allowedFrom.slice(8, 10))}-${monthName(p.allowedFrom)}gacha`;
  return (
    `Assalomu alaykum, ${escapeHtml(p.firstName)}! ` +
    `DaF Sprachzentrum hisobingizda ${som(p.balance)} so'm qolgan. ` +
    `Uni qaytarib olish uchun ${until} filial raqamiga qo'ng'iroq qiling: ${formatUzPhone(p.phone)}. ` +
    `Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!`
  );
}
```

- [ ] **Step 7: DTO, service, controller, module**

`server/src/balance-notices/dto/create-balance-notice.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BalanceNoticeChannel } from '@prisma/client';

export class CreateBalanceNoticeDto {
  @IsEnum(BalanceNoticeChannel)
  channel: BalanceNoticeChannel;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  note?: string;
}
```

`server/src/balance-notices/balance-notices.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BalanceNoticeChannel,
  SmsMessageStatus,
  SmsMessageType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { EntityHistoryService } from '../common/entity-history';
import { SmsService } from '../sms/sms.service';
import { loadNoticeText } from './load-transfer-state';
import type { CreateBalanceNoticeDto } from './dto/create-balance-notice.dto';

export const NO_TELEGRAM_MESSAGE = "Telegram bog'lanmagan — qo'ng'iroq qiling";
export const NO_BRANCH_PHONE_MESSAGE = 'Filial telefon raqami kiritilmagan';
export const NO_BALANCE_MESSAGE = "O'quvchi hisobida pul yo'q";
/** Any FAILED bot result: Telegram's own reason is English; it stays in the SMS log. */
export const BOT_NOT_DELIVERED_MESSAGE = "Botga xabar yetmadi — qo'ng'iroq qiling";

@Injectable()
export class BalanceNoticesService {
  constructor(
    private prisma: PrismaService,
    private sms: SmsService,
    private history: EntityHistoryService,
  ) {}

  /**
   * «Xabar berish» (ADR-0075). BOT: the pinned text goes out at once through
   * the student's SMS log; only a delivered message writes the notice. CALL:
   * the staff member called and marks it. Either starts the transfer clock.
   */
  async create(
    studentId: number,
    dto: CreateBalanceNoticeDto,
    userId: number,
    companyId: number,
  ) {
    const branchId = await assertCallerMayWriteForStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { firstName: true, balance: true, telegramChatId: true },
    });
    if (!student) throw new NotFoundException("O'quvchi topilmadi");
    if (student.balance <= 0) throw new BadRequestException(NO_BALANCE_MESSAGE);

    const note = dto.note || null;
    let smsMessageId: string | null = null;
    if (dto.channel === BalanceNoticeChannel.BOT) {
      if (!student.telegramChatId) {
        throw new BadRequestException(NO_TELEGRAM_MESSAGE);
      }
      const text = await loadNoticeText(
        this.prisma,
        { firstName: student.firstName, balance: student.balance, branchId, companyId },
        new Date(),
      );
      if (!text) throw new BadRequestException(NO_BRANCH_PHONE_MESSAGE);
      const sent = await this.sms.sendToStudent(
        studentId,
        text,
        SmsMessageType.AUTO,
        userId,
        companyId,
        { assertCallerBranch: true },
      );
      if (sent.status !== SmsMessageStatus.SENT) {
        throw new BadRequestException(BOT_NOT_DELIVERED_MESSAGE);
      }
      smsMessageId = sent.id;
    }

    const notice = await this.prisma.balanceNotice.create({
      data: {
        studentId,
        companyId,
        channel: dto.channel,
        amount: student.balance,
        note,
        smsMessageId,
        createdById: userId,
      },
    });
    await this.history.recordStatusChange({
      entityType: 'Student',
      entityId: studentId,
      oldValues: {},
      newValues: {
        status: 'PUL_HAQIDA_XABAR_BERILDI',
        kanal:
          dto.channel === BalanceNoticeChannel.BOT ? 'Telegram bot' : "Qo'ng'iroq",
        summa: student.balance,
        izoh: note,
      },
      changedById: userId,
      companyId,
    });
    return notice;
  }
}
```

`server/src/balance-notices/balance-notices.controller.ts`:

```ts
import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { BalanceNoticesService } from './balance-notices.service';
import { CreateBalanceNoticeDto } from './dto/create-balance-notice.dto';

/** «Xabar berish» from the «Qaytariladigan pul» drawer (ADR-0075). Not for the Cashier. */
@Controller('students')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class BalanceNoticesController {
  constructor(private readonly notices: BalanceNoticesService) {}

  @Post(':id/balance-notices')
  create(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateBalanceNoticeDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.notices.create(id, dto, userId, companyId);
  }
}
```

`server/src/balance-notices/balance-notices.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { SmsModule } from '../sms/sms.module';
import { BalanceNoticesController } from './balance-notices.controller';
import { BalanceNoticesService } from './balance-notices.service';

@Module({
  imports: [SmsModule],
  controllers: [BalanceNoticesController],
  providers: [BalanceNoticesService],
})
export class BalanceNoticesModule {}
```

`server/src/app.module.ts`: import `BalanceNoticesModule` from `./balance-notices/balance-notices.module` and add it after `WithdrawalsModule,` in `imports`.

`branch-route-policy.ts`: in the money `BRANCH_SCOPED_BY_ENTITY` block, after `'GET /withdrawals/preview/:studentId',` add `'POST /students/:id/balance-notices',`.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd server && npx jest src/balance-notices src/common/utils/phone.util.spec.ts src/absence-pause src/common/auth/branch-route-policy.spec.ts src/telegram-digest/direct-send.guard.spec.ts`
Expected: PASS.

- [ ] **Step 9: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/balance-notices src/common/utils/phone.util.ts src/common/utils/phone.util.spec.ts src/absence-pause/absence-pause-notify.service.ts src/app.module.ts src/common/auth/branch-route-policy.ts && npx eslint src/balance-notices src/common/utils src/absence-pause/absence-pause-notify.service.ts src/app.module.ts src/common/auth/branch-route-policy.ts && npm run typecheck`
Expected: no errors (fix a `no-irregular-whitespace` hit by writing NBSP as ` `).

- [ ] **Step 10: Commit**

```bash
git add server/src/balance-notices server/src/common/utils/phone.util.ts server/src/common/utils/phone.util.spec.ts server/src/absence-pause/absence-pause-notify.service.ts server/src/app.module.ts server/src/common/auth/branch-route-policy.ts
git commit -m "feat(refunds): balance notices by bot or call, with the transfer condition

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The withdrawal waits for the notice and the term

**Files:**
- Modify: `server/src/withdrawals/withdrawals.service.ts`
- Modify: `server/src/withdrawals/withdrawals.service.spec.ts`

**Interfaces:**
- Consumes: `loadTransferState`, `TransferState` (Task 5); `tryResolveStudentBranchId`; `assertCallerMayWriteForStudent` (returns the branch id).
- Produces:
  - `GET /withdrawals/preview/:studentId` gains `transfer: TransferState`.
  - `POST /withdrawals` answers 400 with `transfer.refusal` (the two spec texts) unless `transfer.allowed`.

- [ ] **Step 1: Write the failing tests**

In `withdrawals.service.spec.ts`: add `statusChangedAt: new Date('2026-01-01T07:00:00Z'),` to `studentRow`, and to the `prisma` mock:

```ts
      // A notice long past its term, so the existing cases may withdraw.
      balanceNotice: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-05T07:00:00Z'),
          channel: 'CALL',
        }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
```

Append:

```ts
  describe('the transfer condition (ADR-0075)', () => {
    const create = () =>
      service.create(
        { studentId: 10001, amount: 100_000, creditTeacher: false },
        7,
        1,
      );
    beforeEach(() => {
      jest.useFakeTimers({
        doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
      });
      prisma.student.findFirst.mockResolvedValue({
        ...studentRow,
        statusChangedAt: new Date('2026-10-01T07:00:00Z'),
      });
      prisma.balanceNotice.findFirst.mockResolvedValue({
        createdAt: new Date('2026-10-10T07:00:00Z'),
        channel: 'BOT',
      });
    });
    afterEach(() => jest.useRealTimers());

    it('refuses without a notice, writing nothing', async () => {
      jest.setSystemTime(new Date('2026-12-01T07:00:00Z'));
      prisma.balanceNotice.findFirst.mockResolvedValue(null);
      await expect(create()).rejects.toThrow(
        "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('a notice from before the current status does not count', async () => {
      jest.setSystemTime(new Date('2026-12-01T07:00:00Z'));
      prisma.student.findFirst.mockResolvedValue({
        ...studentRow,
        statusChangedAt: new Date('2026-10-15T07:00:00Z'),
      });
      await expect(create()).rejects.toThrow("Avval o'quvchiga xabar bering.");
    });

    it('refuses too early, naming the dates', async () => {
      jest.setSystemTime(new Date('2026-11-21T07:00:00Z'));
      await expect(create()).rejects.toThrow(
        "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      );
      expect(prisma.transaction.create).not.toHaveBeenCalled();
    });

    it('opens on the allowed day itself', async () => {
      jest.setSystemTime(new Date('2026-11-22T07:00:00Z'));
      await create();
      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('the preview shows the lock before the dialog is filled', async () => {
      jest.setSystemTime(new Date('2026-11-21T07:00:00Z'));
      const out = await service.preview(10001, 1);
      expect(out.transfer).toEqual({
        notice: { date: '2026-10-10', channel: 'BOT' },
        termEnds: '2026-10-23',
        allowedFrom: '2026-11-22',
        allowed: false,
        refusal:
          "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).",
      });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/withdrawals/withdrawals.service.spec.ts`
Expected: FAIL — the new cases withdraw anyway; `out.transfer` undefined.

- [ ] **Step 3: Implement** — in `withdrawals.service.ts` add imports:

```ts
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import { loadTransferState } from '../balance-notices/load-transfer-state';
```

`preview`: add `statusChangedAt: true` to the student `select`, and before the `return`:

```ts
    // The lock every withdrawal dialog shows before anything is typed (ADR-0075).
    const transfer = await loadTransferState(
      this.prisma,
      student,
      await tryResolveStudentBranchId(this.prisma, studentId, companyId),
      new Date(),
    );
```

and add `transfer,` as the last field of the returned object.

`create`: capture the branch — `const branchId = await assertCallerMayWriteForStudent(` — add `statusChangedAt: true` to the student `select`, and right after the `student.balance < dto.amount` check:

```ts
    // The money goes to the centre only after the student was told and the
    // term passed: notice + 10 bank days + 30 days (ADR-0075). Every
    // withdrawal, the profile's «Yechib olish» included.
    const transfer = await loadTransferState(this.prisma, student, branchId, new Date());
    if (!transfer.allowed) throw new BadRequestException(transfer.refusal);
```

Add to the `create` doc comment: «Refused until the transfer condition holds (ADR-0075).»

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/withdrawals`
Expected: PASS (the ADR-0055 cases still pass on the default old notice).

- [ ] **Step 5: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/withdrawals && npx eslint src/withdrawals && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/withdrawals
git commit -m "feat(withdrawals): move money to the centre only after a notice and its term

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The page's pure math — kinds, ages, rows, pills

**Files:**
- Create: `server/src/refundable/refundable.math.ts`
- Create: `server/src/refundable/refundable.math.spec.ts`

**Interfaces:**
- Consumes: `bankDaysBetween` (Task 1); `debtKindOf`, `DebtKindKey` (`reports/debt-split.ts`); `latestValidNotice`, `NoticeCell` (Task 5); `tashkentDateStr`, `utcMidnightFromDateStr`; `dm` (`statements/statement-text.ts`).
- Produces (all exported):
  - `type RefundableTab = 'muzlatilgan' | 'guruhsiz' | 'ketgan'`, `REFUNDABLE_TABS`
  - `type AgeBucket = 'upto30' | 'd31to60' | 'over60'`, `AGE_BUCKETS`, `AGE_STATE_LABEL: Record<AgeBucket, string>`
  - `refundableTab(status: string): RefundableTab`
  - `daysBetween(fromStr: string, toStr: string): number`
  - `ageBucket(days: number): AgeBucket`
  - `interface RefundableStudentFact { id: number; firstName: string; lastName: string; phone: string; balance: number; status: string; statusChangedAt: Date | null; createdAt: Date }`
  - `interface LastEnrollmentFact { statusChangedAt: Date | null; group: { id: string; name: string } }`
  - `interface RefundableRow { studentId: number; firstName: string; lastName: string; phone: string; balance: number; kind: RefundableTab; since: string; days: number; ageBucket: AgeBucket; lastGroup: { id: string; name: string } | null; notice: NoticeCell | null }`
  - `sinceDay(kind, s, last): string`, `toRefundableRow(s, last, latestNotice, today): RefundableRow`
  - `sortRefundableRows(rows): RefundableRow[]`, `refundableTabTotals(rows): Record<RefundableTab, { total: number; count: number }>`, `chipCounts(rows): Record<'all' | AgeBucket, number>`
  - `interface PendingDue { overdue: boolean; bankDays: number }`, `pendingDue(today, dueDate, holidays): PendingDue`
  - `interface PendingFact { id: string; studentId: number; requestedAmount: number; approvedAmount: number | null; createdAt: Date; dueDate: Date | null; reason: string | null; student: { firstName: string; lastName: string; phone: string; branches: { branchId: number }[] } }`
  - `interface PendingRefundRow { id: string; studentId: number; firstName: string; lastName: string; phone: string; branchId: number | null; amount: number; requestedAt: string; dueDate: string; due: PendingDue; reason: string | null }`
  - `pendingBranchId(r: PendingFact): number | null`, `toPendingRow(r, today, holidays): PendingRefundRow`
  - `pendingDueLabel(d: PendingDue): string`, `noticeLabel(n: NoticeCell | null): string`

- [ ] **Step 1: Write the failing test** — `server/src/refundable/refundable.math.spec.ts`:

```ts
import {
  ageBucket,
  AGE_STATE_LABEL,
  chipCounts,
  daysBetween,
  noticeLabel,
  pendingDue,
  pendingDueLabel,
  refundableTab,
  refundableTabTotals,
  sinceDay,
  sortRefundableRows,
  toPendingRow,
  toRefundableRow,
  type RefundableStudentFact,
} from './refundable.math';

const none = new Set<string>();
const TODAY = '2026-10-14';
const student = (over: Partial<RefundableStudentFact> = {}): RefundableStudentFact => ({
  id: 10001,
  firstName: 'Ali',
  lastName: 'Karimov',
  phone: '901112233',
  balance: 300_000,
  status: 'FROZEN',
  statusChangedAt: new Date('2026-09-20T07:00:00Z'),
  createdAt: new Date('2026-01-10T07:00:00Z'),
  ...over,
});

describe('refundable math (ADR-0075)', () => {
  it("ADR-0067's kinds: FROZEN, ungrouped ACTIVE, anything else", () => {
    expect(refundableTab('FROZEN')).toBe('muzlatilgan');
    expect(refundableTab('ACTIVE')).toBe('guruhsiz');
    expect(refundableTab('EXPELLED')).toBe('ketgan');
    expect(refundableTab('GRADUATED')).toBe('ketgan');
  });

  it('counts Tashkent calendar days', () => {
    expect(daysBetween('2026-09-20', TODAY)).toBe(24);
    expect(daysBetween('2026-08-01', TODAY)).toBe(74);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });

  it('the age buckets are ≤ 30, 31–60, > 60 — chips and «Holat» alike', () => {
    expect([0, 30, 31, 60, 61].map(ageBucket)).toEqual([
      'upto30',
      'upto30',
      'd31to60',
      'd31to60',
      'over60',
    ]);
    expect(AGE_STATE_LABEL).toEqual({
      upto30: 'kutilmoqda',
      d31to60: "muddati o'tgan",
      over60: 'ketgan hisoblanadi',
    });
  });

  describe('sinceDay', () => {
    const last = {
      statusChangedAt: new Date('2026-09-04T07:00:00Z'),
      group: { id: 'g-1', name: 'A1-05' },
    };
    it('ungrouped: the day the last enrollment closed, the status stays ACTIVE', () => {
      expect(sinceDay('guruhsiz', student({ status: 'ACTIVE', statusChangedAt: null }), last)).toBe(
        '2026-09-04',
      );
    });
    it("frozen and left: the student's own status change, never the enrollment's", () => {
      expect(sinceDay('muzlatilgan', student(), last)).toBe('2026-09-20');
    });
    it('falls back to the status change, then the card', () => {
      expect(sinceDay('guruhsiz', student({ status: 'ACTIVE' }), null)).toBe('2026-09-20');
      expect(sinceDay('ketgan', student({ statusChangedAt: null }), null)).toBe('2026-01-10');
    });
  });

  it("a row carries the kind, the age and the latest notice of the student's current state", () => {
    const row = toRefundableRow(
      student(),
      null,
      { createdAt: new Date('2026-09-10T07:00:00Z'), channel: 'BOT' },
      TODAY,
    );
    expect(row).toMatchObject({
      studentId: 10001,
      kind: 'muzlatilgan',
      since: '2026-09-20',
      days: 24,
      ageBucket: 'upto30',
      lastGroup: null,
      // Given before the freeze: does not count.
      notice: null,
    });
    const after = toRefundableRow(
      student(),
      null,
      { createdAt: new Date('2026-10-01T07:00:00Z'), channel: 'CALL' },
      TODAY,
    );
    expect(after.notice).toEqual({ date: '2026-10-01', channel: 'CALL' });
  });

  it('totals per tab; the chips add up to the frozen tab; largest balance first', () => {
    const rows = sortRefundableRows([
      toRefundableRow(student({ id: 10001, balance: 100_000 }), null, null, TODAY),
      toRefundableRow(
        student({ id: 10002, balance: 200_000, statusChangedAt: new Date('2026-08-01T07:00:00Z') }),
        null,
        null,
        TODAY,
      ),
      toRefundableRow(student({ id: 10003, balance: 200_000, status: 'EXPELLED' }), null, null, TODAY),
    ]);
    expect(rows.map((r) => r.studentId)).toEqual([10002, 10003, 10001]);
    expect(refundableTabTotals(rows)).toEqual({
      muzlatilgan: { total: 300_000, count: 2 },
      guruhsiz: { total: 0, count: 0 },
      ketgan: { total: 200_000, count: 1 },
    });
    const frozen = rows.filter((r) => r.kind === 'muzlatilgan');
    const chips = chipCounts(frozen);
    expect(chips).toEqual({ all: 2, upto30: 1, d31to60: 0, over60: 1 });
    expect(chips.upto30 + chips.d31to60 + chips.over60).toBe(chips.all);
  });

  describe('pending pills', () => {
    it('bank days left, the last two amber on the client', () => {
      expect(pendingDue('2026-10-10', '2026-10-23', none)).toEqual({ overdue: false, bankDays: 10 });
      expect(pendingDue('2026-10-10', '2026-10-13', none)).toEqual({ overdue: false, bankDays: 2 });
      expect(pendingDueLabel({ overdue: false, bankDays: 2 })).toBe('2 bank kuni qoldi');
    });
    it('overdue counts the bank days since the due day', () => {
      expect(pendingDue('2026-10-10', '2026-10-07', none)).toEqual({ overdue: true, bankDays: 2 });
      expect(pendingDueLabel({ overdue: true, bankDays: 2 })).toBe("muddati o'tdi · 2 bank kuni");
    });
    it('a weekend right after the due Friday is overdue with no bank day yet', () => {
      expect(pendingDue('2026-10-10', '2026-10-09', none)).toEqual({ overdue: true, bankDays: 0 });
      expect(pendingDueLabel({ overdue: true, bankDays: 0 })).toBe("muddati o'tdi");
    });
    it('a pending row: amount, branch, the due day as a string', () => {
      const row = toPendingRow(
        {
          id: 'r-1',
          studentId: 10005,
          requestedAmount: 250_000,
          approvedAmount: 250_000,
          createdAt: new Date('2026-09-28T06:00:00Z'),
          dueDate: new Date('2026-10-12T19:00:00Z'),
          reason: null,
          student: { firstName: 'Vali', lastName: 'Test', phone: '9010005', branches: [{ branchId: 1 }] },
        },
        TODAY,
        none,
      );
      expect(row).toEqual({
        id: 'r-1',
        studentId: 10005,
        firstName: 'Vali',
        lastName: 'Test',
        phone: '9010005',
        branchId: 1,
        amount: 250_000,
        requestedAt: '2026-09-28T06:00:00.000Z',
        dueDate: '2026-10-13',
        due: { overdue: true, bankDays: 1 },
        reason: null,
      });
    });
  });

  it('the «Xabar» cell', () => {
    expect(noticeLabel(null)).toBe('berilmagan');
    expect(noticeLabel({ date: '2026-10-10', channel: 'BOT' })).toBe('10.10 · bot orqali');
    expect(noticeLabel({ date: '2026-10-10', channel: 'CALL' })).toBe(
      "10.10 · qo'ng'iroq qilib aytildi",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx jest src/refundable/refundable.math.spec.ts`
Expected: FAIL — `Cannot find module './refundable.math'`.

- [ ] **Step 3: Write the implementation** — `server/src/refundable/refundable.math.ts`:

```ts
import { bankDaysBetween } from '../common/date/bank-days';
import { tashkentDateStr, utcMidnightFromDateStr } from '../common/date/tashkent';
import { debtKindOf, type DebtKindKey } from '../reports/debt-split';
import {
  latestValidNotice,
  type NoticeCell,
} from '../balance-notices/transfer-condition';
import { dm } from '../statements/statement-text';

/** «Qaytariladigan pul» (spec B2b §3, ADR-0075). Pure. */

export type RefundableTab = 'muzlatilgan' | 'guruhsiz' | 'ketgan';
export const REFUNDABLE_TABS: readonly RefundableTab[] = [
  'muzlatilgan',
  'guruhsiz',
  'ketgan',
];

export type AgeBucket = 'upto30' | 'd31to60' | 'over60';
export const AGE_BUCKETS: readonly AgeBucket[] = ['upto30', 'd31to60', 'over60'];

/** The frozen tab's «Holat» — the same three buckets as the chips. */
export const AGE_STATE_LABEL: Record<AgeBucket, string> = {
  upto30: 'kutilmoqda',
  d31to60: "muddati o'tgan",
  over60: 'ketgan hisoblanadi',
};

const TAB_OF_KIND: Record<DebtKindKey, RefundableTab> = {
  frozen: 'muzlatilgan',
  ungrouped: 'guruhsiz',
  left: 'ketgan',
};

/** ADR-0067's kinds of a student who is not studying. */
export function refundableTab(status: string): RefundableTab {
  return TAB_OF_KIND[debtKindOf(status)];
}

/** Calendar days from one Tashkent day to another. */
export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round(
    (utcMidnightFromDateStr(toStr).getTime() -
      utcMidnightFromDateStr(fromStr).getTime()) /
      86_400_000,
  );
}

export function ageBucket(days: number): AgeBucket {
  if (days <= 30) return 'upto30';
  return days <= 60 ? 'd31to60' : 'over60';
}

export interface RefundableStudentFact {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  status: string;
  statusChangedAt: Date | null;
  createdAt: Date;
}

export interface LastEnrollmentFact {
  statusChangedAt: Date | null;
  group: { id: string; name: string };
}

export interface RefundableRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  kind: RefundableTab;
  /** 'YYYY-MM-DD' — frozen / ungrouped / left since. */
  since: string;
  days: number;
  ageBucket: AgeBucket;
  lastGroup: { id: string; name: string } | null;
  notice: NoticeCell | null;
}

/**
 * Since when the student is in their tab. Leaving a group keeps the status
 * ACTIVE, so an ungrouped student counts from the last enrollment's change;
 * frozen and left count from their own status change. Both fall back to the
 * status change, then the card's creation.
 */
export function sinceDay(
  kind: RefundableTab,
  s: RefundableStudentFact,
  last: LastEnrollmentFact | null,
): string {
  const at =
    (kind === 'guruhsiz' ? last?.statusChangedAt : null) ??
    s.statusChangedAt ??
    s.createdAt;
  return tashkentDateStr(at);
}

export function toRefundableRow(
  s: RefundableStudentFact,
  last: LastEnrollmentFact | null,
  latestNotice: { createdAt: Date; channel: NoticeCell['channel'] } | null,
  today: string,
): RefundableRow {
  const kind = refundableTab(s.status);
  const since = sinceDay(kind, s, last);
  const days = daysBetween(since, today);
  return {
    studentId: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    phone: s.phone,
    balance: s.balance,
    kind,
    since,
    days,
    ageBucket: ageBucket(days),
    lastGroup: last ? { id: last.group.id, name: last.group.name } : null,
    notice: latestValidNotice(latestNotice, s.statusChangedAt),
  };
}

/** Largest balance first, then the student id. */
export function sortRefundableRows(rows: readonly RefundableRow[]): RefundableRow[] {
  return [...rows].sort((a, b) => b.balance - a.balance || a.studentId - b.studentId);
}

export function refundableTabTotals(
  rows: readonly RefundableRow[],
): Record<RefundableTab, { total: number; count: number }> {
  const out = {
    muzlatilgan: { total: 0, count: 0 },
    guruhsiz: { total: 0, count: 0 },
    ketgan: { total: 0, count: 0 },
  };
  for (const r of rows) {
    out[r.kind].total += r.balance;
    out[r.kind].count += 1;
  }
  return out;
}

/** The frozen tab's chips, over the rows given (the caller passes that tab's). */
export function chipCounts(
  rows: readonly RefundableRow[],
): Record<'all' | AgeBucket, number> {
  const out = { all: rows.length, upto30: 0, d31to60: 0, over60: 0 };
  for (const r of rows) out[r.ageBucket] += 1;
  return out;
}

export interface PendingDue {
  overdue: boolean;
  bankDays: number;
}

/** «N bank kuni qoldi» / «muddati o'tdi · N bank kuni». */
export function pendingDue(
  today: string,
  dueDate: string,
  holidays: ReadonlySet<string>,
): PendingDue {
  return today > dueDate
    ? { overdue: true, bankDays: bankDaysBetween(dueDate, today, holidays) }
    : { overdue: false, bankDays: bankDaysBetween(today, dueDate, holidays) };
}

export interface PendingFact {
  id: string;
  studentId: number;
  requestedAmount: number;
  approvedAmount: number | null;
  createdAt: Date;
  dueDate: Date | null;
  reason: string | null;
  student: {
    firstName: string;
    lastName: string;
    phone: string;
    branches: { branchId: number }[];
  };
}

export interface PendingRefundRow {
  id: string;
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  branchId: number | null;
  amount: number;
  requestedAt: string;
  dueDate: string;
  due: PendingDue;
  reason: string | null;
}

export function pendingBranchId(r: PendingFact): number | null {
  return r.student.branches[0]?.branchId ?? null;
}

export function toPendingRow(
  r: PendingFact,
  today: string,
  holidays: ReadonlySet<string>,
): PendingRefundRow {
  // Every request is written with a due date; `today` only guards bad data.
  const dueDate = r.dueDate ? tashkentDateStr(r.dueDate) : today;
  return {
    id: r.id,
    studentId: r.studentId,
    firstName: r.student.firstName,
    lastName: r.student.lastName,
    phone: r.student.phone,
    branchId: pendingBranchId(r),
    amount: r.approvedAmount ?? r.requestedAmount,
    requestedAt: r.createdAt.toISOString(),
    dueDate,
    due: pendingDue(today, dueDate, holidays),
    reason: r.reason,
  };
}

/** The pill as text (Excel; the client renders its own). */
export function pendingDueLabel(d: PendingDue): string {
  if (!d.overdue) return `${d.bankDays} bank kuni qoldi`;
  return d.bankDays > 0 ? `muddati o'tdi · ${d.bankDays} bank kuni` : "muddati o'tdi";
}

/** The «Xabar» cell as text. */
export function noticeLabel(n: NoticeCell | null): string {
  if (!n) return 'berilmagan';
  return `${dm(n.date)} · ${n.channel === 'BOT' ? 'bot orqali' : "qo'ng'iroq qilib aytildi"}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx jest src/refundable/refundable.math.spec.ts`
Expected: PASS.

- [ ] **Step 5: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/refundable && npx eslint src/refundable && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/src/refundable/refundable.math.ts server/src/refundable/refundable.math.spec.ts
git commit -m "feat(refundable): pure math for the refundable money page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The read API — list, drawer, Excel; `GET /payments/frozen-balances` goes

**Files:**
- Modify: `server/src/common/auth/other-branch.ts` (`studentNotFound`)
- Modify: `server/src/payments/debt/debt-list.service.ts` (`notFound` delegates)
- Create: `server/src/refundable/dto/refundable-query.dto.ts`
- Create: `server/src/refundable/refundable.excel.ts`
- Create: `server/src/refundable/refundable.service.ts` (+ `refundable.service.spec.ts`)
- Create: `server/src/refundable/refundable.controller.ts` (+ `refundable.controller.spec.ts`)
- Create: `server/src/refundable/refundable.module.ts`
- Modify: `server/src/app.module.ts`
- Delete: `server/src/payments/payments-frozen-balance.service.ts`, `server/src/payments/payments-frozen-balance.service.spec.ts`, `server/src/payments/dto/frozen-balances-query.dto.ts`
- Modify: `server/src/payments/payments.controller.ts`, `payments.controller.spec.ts`, `payments.service.ts`, `payments.service.spec.ts`, `payments.module.ts`, `payments.branch-isolation.spec.ts`
- Modify: `server/src/common/auth/branch-route-policy.ts` (remove `'GET /payments/frozen-balances',`)

**Interfaces:**
- Consumes: everything of Task 7; `loadTransferState`, `loadNoticeText`, `TransferState` (Task 5); `buildHolidayDateSet` (`holidays/holiday-date-set.ts`); `matchesSearch` (`payments/debt/debt-list.math.ts`); `activeStudentWhere` (`students/shared/active-student-where.ts`); `studentBranchWhere`, `ReportBranchIds`; `ceilingIsWider`, `inOtherBranch`.
- Produces:
  - `export async function studentNotFound(db: { student: Pick<PrismaClient['student'], 'findFirst'> }, companyId: number, id: number, scope: ReportBranchIds, ceiling: ReportBranchIds): Promise<NotFoundException>`
  - `RefundableService.list(companyId, scope, q, now?): Promise<RefundableListResponse>`, `.student(companyId, scope, ceiling, id, now?): Promise<RefundableDrawer>`, `.excel(companyId, scope, q, now?): Promise<{ buffer: Buffer; filename: string }>`
  - `export interface RefundableListResponse`, `export interface RefundableDrawer` (shapes in the API contract)
  - Routes `GET /refundable/list`, `GET /refundable/students/:id`, `GET /refundable/excel`; `GET /payments/frozen-balances` removed.

- [ ] **Step 1: Write the failing tests**

`server/src/refundable/refundable.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { RefundableService } from './refundable.service';
import type { RefundableQueryDto } from './dto/refundable-query.dto';

const card = (id: number, firstName: string) => ({
  id,
  firstName,
  lastName: 'Test',
  phone: `90${id}`,
  createdAt: new Date('2026-01-10T07:00:00Z'),
});
const STUDENTS = [
  { ...card(10001, 'Aziza'), balance: 300_000, status: 'FROZEN', statusChangedAt: new Date('2026-09-20T07:00:00Z') },
  { ...card(10002, 'Bobur'), balance: 200_000, status: 'FROZEN', statusChangedAt: new Date('2026-08-01T07:00:00Z') },
  { ...card(10003, 'Dilnoza'), balance: 150_000, status: 'ACTIVE', statusChangedAt: null },
  { ...card(10004, 'Elyor'), balance: 100_000, status: 'EXPELLED', statusChangedAt: new Date('2026-09-01T07:00:00Z') },
];
const PENDING = {
  id: 'r-1',
  studentId: 10005,
  requestedAmount: 250_000,
  approvedAmount: 250_000,
  createdAt: new Date('2026-09-28T06:00:00Z'),
  dueDate: new Date('2026-10-12T19:00:00Z'), // 13.10
  reason: null,
  student: { firstName: 'Farida', lastName: 'Test', phone: '9010005', branches: [{ branchId: 1 }] },
};
const q = (over: Partial<RefundableQueryDto> = {}) =>
  ({ tab: 'muzlatilgan', page: 1, pageSize: 20, pendingPage: 1, pendingPageSize: 10, ...over }) as RefundableQueryDto;
const emptyScope = (where: any) => where.branches?.some?.branchId?.in?.length === 0;

describe('RefundableService (ADR-0075)', () => {
  let service: RefundableService;
  let prisma: any;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date('2026-10-14T07:00:00Z')); // Wednesday
    prisma = {
      student: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(emptyScope(where) ? [] : STUDENTS)),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          { studentId: 10003, statusChangedAt: new Date('2026-09-04T07:00:00Z'), group: { id: 'g-3', name: 'A1-05' } },
          { studentId: 10004, statusChangedAt: new Date('2026-09-01T07:00:00Z'), group: { id: 'g-4', name: 'A2-01' } },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      balanceNotice: {
        findMany: jest.fn().mockResolvedValue([
          { studentId: 10001, createdAt: new Date('2026-09-10T07:00:00Z'), channel: 'BOT' },
          { studentId: 10002, createdAt: new Date('2026-09-01T07:00:00Z'), channel: 'CALL' },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      refund: {
        findMany: jest.fn().mockResolvedValue([PENDING]),
        aggregate: jest.fn().mockResolvedValue({ _count: { _all: 1 }, _sum: { requestedAmount: 250_000 } }),
        count: jest.fn().mockResolvedValue(4),
        findFirst: jest.fn().mockResolvedValue({ processedAt: new Date('2026-10-02T09:00:00Z') }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([{ id: 'acc-1', name: 'Asosiy kassa', type: 'CASH', branchId: 1 }]),
      },
      payment: { findFirst: jest.fn().mockResolvedValue(null) },
      branch: { findUnique: jest.fn().mockResolvedValue({ phone: '901234567' }) },
      company: { findUnique: jest.fn().mockResolvedValue({ phone: null }) },
    };
    const module = await Test.createTestingModule({
      providers: [RefundableService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RefundableService);
  });
  afterEach(() => jest.useRealTimers());

  describe('list', () => {
    it("kinds follow ADR-0067; the summary adds the three tabs; the chips add up to the frozen tab", async () => {
      const out = await service.list(1001, null, q());
      expect(out.tabs).toEqual({
        muzlatilgan: { total: 500_000, count: 2 },
        guruhsiz: { total: 150_000, count: 1 },
        ketgan: { total: 100_000, count: 1 },
      });
      expect(out.summary).toEqual({ total: 750_000, count: 4 });
      expect(out.chips).toEqual({ all: 2, upto30: 1, d31to60: 0, over60: 1 });
      expect(out.rows.data.map((r) => r.studentId)).toEqual([10001, 10002]);
      expect(out.rows.data[0]).toMatchObject({ since: '2026-09-20', days: 24, ageBucket: 'upto30', notice: null });
      expect(out.rows.data[1].notice).toEqual({ date: '2026-09-01', channel: 'CALL' });
    });

    it('studying, archived and empty balances are never read', async () => {
      await service.list(1001, null, q());
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: 1001,
        deletedAt: null,
        balance: { gt: 0 },
        NOT: activeStudentWhere(),
      });
    });

    it('guruhsiz counts from the last enrollment and names the last group', async () => {
      const out = await service.list(1001, null, q({ tab: 'guruhsiz' }));
      expect(out.rows.data[0]).toMatchObject({
        studentId: 10003,
        since: '2026-09-04',
        days: 40,
        lastGroup: { id: 'g-3', name: 'A1-05' },
      });
    });

    it('search and the age chip narrow the table rows only', async () => {
      const aged = await service.list(1001, null, q({ age: 'over60' }));
      expect(aged.rows.data.map((r) => r.studentId)).toEqual([10002]);
      expect(aged.rows.total).toBe(1);
      expect(aged.tabs.muzlatilgan.count).toBe(2);
      const found = await service.list(1001, null, q({ search: 'aziza' }));
      expect(found.rows.data.map((r) => r.studentId)).toEqual([10001]);
      expect(found.summary.count).toBe(4);
    });

    it('pending requests: oldest due first, a bank-day pill, the history count, the last hand-over and the drawers of their branches', async () => {
      const out = await service.list(1001, [1], q());
      expect(prisma.refund.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            companyId: 1001,
            status: 'REQUESTED',
            student: { branches: { some: { branchId: { in: [1] } } } },
          },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          skip: 0,
          take: 10,
        }),
      );
      expect(out.pending).toMatchObject({
        total: 1,
        sum: 250_000,
        page: 1,
        pageSize: 10,
        historyCount: 4,
        lastHandedOverAt: '2026-10-02T09:00:00.000Z',
      });
      expect(out.pending.data[0]).toMatchObject({
        id: 'r-1',
        amount: 250_000,
        branchId: 1,
        dueDate: '2026-10-13',
        due: { overdue: true, bankDays: 1 },
      });
      expect(out.cashAccounts).toEqual([{ id: 'acc-1', name: 'Asosiy kassa', type: 'CASH', branchId: 1 }]);
      expect(prisma.cashAccount.findMany.mock.calls[0][0].where).toEqual({
        companyId: 1001,
        branchId: { in: [1] },
        isActive: true,
        deletedAt: null,
      });
    });

    it('an empty scope is nothing', async () => {
      prisma.refund.findMany.mockResolvedValue([]);
      prisma.refund.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { requestedAmount: null } });
      const out = await service.list(1001, [], q());
      expect(out.summary).toEqual({ total: 0, count: 0 });
      expect(out.pending).toMatchObject({ total: 0, sum: 0 });
      expect(out.cashAccounts).toEqual([]);
      expect(prisma.cashAccount.findMany).not.toHaveBeenCalled();
    });
  });

  describe('student (the drawer)', () => {
    it('reads the facts of one student and the transfer lock', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...STUDENTS[1],
        telegramChatId: '555',
        telegramDisconnectedAt: null,
        branches: [{ branchId: 1 }],
      });
      prisma.enrollment.findFirst.mockResolvedValueOnce({
        statusChangedAt: new Date('2026-08-01T07:00:00Z'),
        group: { id: 'g-2', name: 'B1-02' },
      });
      prisma.payment.findFirst.mockResolvedValueOnce({ createdAt: new Date('2026-07-15T07:00:00Z'), amount: 450_000 });
      prisma.balanceNotice.findFirst.mockResolvedValueOnce({ createdAt: new Date('2026-09-01T07:00:00Z'), channel: 'CALL' });

      const d = await service.student(1001, null, null, 10002);

      expect(d).toMatchObject({
        student: { id: 10002, branchId: 1, status: 'FROZEN' },
        balance: 200_000,
        kind: 'muzlatilgan',
        since: '2026-08-01',
        days: 74,
        lastGroup: { id: 'g-2', name: 'B1-02' },
        lastPayment: { createdAt: '2026-07-15T07:00:00.000Z', amount: 450_000 },
        telegramLinked: true,
      });
      // Notice Tue 01.09 → term to 15.09 → transfer from 15.10; today is 14.10.
      expect(d.transfer).toEqual({
        notice: { date: '2026-09-01', channel: 'CALL' },
        termEnds: '2026-09-15',
        allowedFrom: '2026-10-15',
        allowed: false,
        refusal:
          "Markazga o'tkazish 15.10 dan ochiladi (xabar 01.09 da berilgan, qaytarish muddati 15.09 gacha).",
      });
      // A notice given today (Wed 14.10): term to 28.10, transfer from 27.11.
      expect(d.noticePreview).toContain('Assalomu alaykum, Bobur!');
      expect(d.noticePreview).toContain("200 000 so'm qolgan");
      expect(d.noticePreview).toContain('27-noyabrgacha');
      expect(d.noticePreview).toContain('+998 90 123 45 67');
    });

    it('a studying student has no kind; a blocked chat is not linked', async () => {
      prisma.student.findFirst.mockResolvedValueOnce({
        ...STUDENTS[2],
        telegramChatId: '555',
        telegramDisconnectedAt: new Date('2026-10-01T07:00:00Z'),
        branches: [{ branchId: 1 }],
      });
      prisma.student.count.mockResolvedValueOnce(1);
      const d = await service.student(1001, null, null, 10003);
      expect(d).toMatchObject({ kind: null, since: null, days: null, telegramLinked: false });
    });

    it("another branch's student is a 404 — named when the caller works there too (ADR-0063)", async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ branches: [{ branch: { id: 2, name: 'Ikkinchi filial' } }] });
      const err = await service.student(1001, [1], [1, 2], 10001).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toMatchObject({
        branch: { id: 2, name: 'Ikkinchi filial' },
      });
    });
  });

  describe('excel', () => {
    it("four sheets with the page's columns and a «Jami» row; the search applies to the student sheets", async () => {
      const { buffer, filename } = await service.excel(1001, null, q({ search: 'aziza' }));
      expect(filename).toBe('qaytariladigan-pul-2026-10-14.xlsx');
      const wb = new Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual([
        'Kutilayotgan',
        'Muzlatilganlar',
        'Guruhsiz',
        'Ketganlar',
      ]);
      const pending = wb.worksheets[0];
      expect(pending.getRow(2).getCell(5).value).toBe(250_000);
      expect(pending.getRow(2).getCell(8).value).toBe("muddati o'tdi · 1 bank kuni");
      const frozen = wb.worksheets[1];
      expect(frozen.rowCount).toBe(3); // header, the one match, Jami
      expect(frozen.getRow(2).getCell(7).value).toBe('kutilmoqda');
      expect(frozen.getRow(3).getCell(1).value).toBe('Jami');
      expect(frozen.getRow(3).getCell(8).value).toBe(300_000);
    });
  });
});
```

`server/src/refundable/refundable.controller.spec.ts`:

```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ROLES_KEY } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { RefundableController } from './refundable.controller';
import { RefundableService } from './refundable.service';

describe('RefundableController — role guards', () => {
  let controller: RefundableController;
  const guard = new RolesGuard(new Reflector());

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [RefundableController],
      providers: [{ provide: RefundableService, useValue: {} }],
    }).compile();
    controller = module.get(RefundableController);
  });

  const ctx = (handler: unknown, roles: string[]) =>
    ({
      getHandler: () => handler,
      getClass: () => RefundableController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as any;
  const handlers = () => [controller.list, controller.student, controller.excel];

  it('class-level @Roles: CEO, Branch Director, Administrator, Cashier', () => {
    expect(new Reflector().get(ROLES_KEY, RefundableController)).toEqual([
      'CEO',
      'Branch Director',
      'Administrator',
      'Cashier',
    ]);
  });

  it.each([['CEO'], ['Branch Director'], ['Administrator'], ['Cashier']])(
    'every read allows %s',
    (role) => {
      for (const h of handlers()) expect(guard.canActivate(ctx(h, [role]))).toBe(true);
    },
  );

  it('every read denies Teacher', () => {
    for (const h of handlers())
      expect(() => guard.canActivate(ctx(h, ['Teacher']))).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd server && npx jest src/refundable`
Expected: FAIL — `Cannot find module './refundable.service'`.

- [ ] **Step 3: `studentNotFound`** — append to `server/src/common/auth/other-branch.ts` (imports: `type { PrismaClient } from '@prisma/client'`; change the report-branch-scope import to `import { studentBranchWhere, type ReportBranchIds } from '../finance/report-branch-scope';`):

```ts
/**
 * ADR-0063 for a student card: named when it sits in another branch the
 * caller may open, a plain 404 otherwise. Shared by the debt and the
 * refundable drawers.
 */
export async function studentNotFound(
  db: { student: Pick<PrismaClient['student'], 'findFirst'> },
  companyId: number,
  id: number,
  scope: ReportBranchIds,
  ceiling: ReportBranchIds,
): Promise<NotFoundException> {
  if (ceilingIsWider(scope, ceiling)) {
    const elsewhere = await db.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(ceiling) },
      select: {
        branches: {
          where: ceiling === null ? {} : { branchId: { in: ceiling } },
          select: { branch: { select: { id: true, name: true } } },
          orderBy: { branchId: 'asc' },
          take: 1,
        },
      },
    });
    const branch = elsewhere?.branches[0]?.branch;
    if (branch) return inOtherBranch("o'quvchi", branch);
  }
  return new NotFoundException("O'quvchi topilmadi");
}
```

In `debt-list.service.ts` replace the body of `private async notFound(...)` with `return studentNotFound(this.prisma, companyId, id, scope, ceiling);`, import `studentNotFound` from `../../common/auth/other-branch`, and drop the now-unused `ceilingIsWider`, `inOtherBranch` (and `NotFoundException` if unused) imports.

- [ ] **Step 4: The DTO** — `server/src/refundable/dto/refundable-query.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  AGE_BUCKETS,
  REFUNDABLE_TABS,
  type AgeBucket,
  type RefundableTab,
} from '../refundable.math';

/** `GET /refundable/list` and `/excel` — the names the page keeps in its URL. */
export class RefundableQueryDto {
  @IsOptional() @IsIn(REFUNDABLE_TABS) tab: RefundableTab = 'muzlatilgan';

  /** Muzlatilganlar only. */
  @IsOptional() @IsIn(AGE_BUCKETS) age?: AgeBucket;

  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize?: number = 20;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pendingPage?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pendingPageSize?: number = 10;

  /** Read by `BranchScopeGuard`; the service reads the resolved scope. */
  @IsOptional() @Type(() => Number) @IsInt() branchId?: number;
}
```

- [ ] **Step 5: The workbook** — `server/src/refundable/refundable.excel.ts`:

```ts
import { Workbook } from 'exceljs';
import { tashkentDateStr } from '../common/date/tashkent';
import { dmy } from '../statements/statement-text';
import {
  AGE_STATE_LABEL,
  noticeLabel,
  pendingDueLabel,
  type PendingRefundRow,
  type RefundableRow,
} from './refundable.math';

type Cell = string | number;
interface Column<T> {
  header: string;
  width: number;
  value: (r: T) => Cell;
  isAmount?: boolean;
}

const person = {
  id: { header: 'ID', width: 8, value: (r: { studentId: number }) => r.studentId },
  name: {
    header: "O'quvchi",
    width: 28,
    value: (r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`.trim(),
  },
  phone: { header: 'Telefon', width: 14, value: (r: { phone: string }) => r.phone },
};

const PENDING: Column<PendingRefundRow>[] = [
  person.id,
  person.name,
  person.phone,
  { header: 'Summa', width: 14, value: (r) => r.amount, isAmount: true },
  { header: "So'ralgan", width: 12, value: (r) => dmy(tashkentDateStr(new Date(r.requestedAt))) },
  { header: 'Muddat', width: 12, value: (r) => dmy(r.dueDate) },
  { header: 'Holat', width: 26, value: (r) => pendingDueLabel(r.due) },
];

function studentColumns(sinceHeader: string, middle: Column<RefundableRow>): Column<RefundableRow>[] {
  return [
    person.id,
    person.name,
    person.phone,
    { header: sinceHeader, width: 12, value: (r) => dmy(r.since) },
    { header: 'Kun', width: 8, value: (r) => r.days },
    middle,
    { header: 'Puli', width: 14, value: (r) => r.balance, isAmount: true },
    { header: 'Xabar', width: 30, value: (r) => noticeLabel(r.notice) },
  ];
}
const LAST_GROUP: Column<RefundableRow> = {
  header: 'Oxirgi guruh',
  width: 18,
  value: (r) => r.lastGroup?.name ?? '',
};

function addSheet<T>(wb: Workbook, name: string, columns: Column<T>[], rows: readonly T[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { header: '#', width: 6 },
    ...columns.map((c) => ({ header: c.header, width: c.width })),
  ];
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, i) => ws.addRow([i + 1, ...columns.map((c) => c.value(r))]));
  const amount = columns.find((c) => c.isAmount);
  const total = new Array<Cell>(columns.length + 1).fill('');
  total[0] = 'Jami';
  if (amount) {
    total[1 + columns.indexOf(amount)] = rows.reduce((s, r) => s + Number(amount.value(r)), 0);
  }
  ws.addRow(total).font = { bold: true };
}

/** Spec §3.7: four sheets with the page's columns, money as numbers. */
export async function refundableWorkbook(p: {
  pending: readonly PendingRefundRow[];
  muzlatilgan: readonly RefundableRow[];
  guruhsiz: readonly RefundableRow[];
  ketgan: readonly RefundableRow[];
}): Promise<Buffer> {
  const wb = new Workbook();
  addSheet(wb, 'Kutilayotgan', PENDING, p.pending);
  addSheet(
    wb,
    'Muzlatilganlar',
    studentColumns('Muzlatilgan', { header: 'Holat', width: 20, value: (r) => AGE_STATE_LABEL[r.ageBucket] }),
    p.muzlatilgan,
  );
  addSheet(wb, 'Guruhsiz', studentColumns('Guruhsiz', LAST_GROUP), p.guruhsiz);
  addSheet(wb, 'Ketganlar', studentColumns('Ketgan', LAST_GROUP), p.ketgan);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

- [ ] **Step 6: The service** — `server/src/refundable/refundable.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import {
  CashAccountType,
  PaymentStatus,
  Prisma,
  RefundStatus,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { studentNotFound } from '../common/auth/other-branch';
import {
  studentBranchWhere,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
import { tashkentDateStr, tashkentDayStartUtc } from '../common/date/tashkent';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';
import { activeStudentWhere } from '../students/shared/active-student-where';
import { matchesSearch } from '../payments/debt/debt-list.math';
import {
  loadNoticeText,
  loadTransferState,
} from '../balance-notices/load-transfer-state';
import type { TransferState } from '../balance-notices/transfer-condition';
import { refundableWorkbook } from './refundable.excel';
import {
  chipCounts,
  pendingBranchId,
  refundableTabTotals,
  sortRefundableRows,
  toPendingRow,
  toRefundableRow,
  type AgeBucket,
  type PendingFact,
  type PendingRefundRow,
  type RefundableRow,
  type RefundableTab,
} from './refundable.math';
import type { RefundableQueryDto } from './dto/refundable-query.dto';

const PENDING_SELECT = {
  id: true,
  studentId: true,
  requestedAmount: true,
  approvedAmount: true,
  createdAt: true,
  dueDate: true,
  reason: true,
  student: {
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      branches: { select: { branchId: true }, orderBy: { branchId: 'asc' }, take: 1 },
    },
  },
} satisfies Prisma.RefundSelect;

export interface RefundableListResponse {
  summary: { total: number; count: number };
  tabs: Record<RefundableTab, { total: number; count: number }>;
  chips: Record<'all' | AgeBucket, number>;
  rows: { data: RefundableRow[]; total: number; page: number; pageSize: number };
  pending: {
    data: PendingRefundRow[];
    total: number;
    sum: number;
    page: number;
    pageSize: number;
    historyCount: number;
    lastHandedOverAt: string | null;
  };
  cashAccounts: { id: string; name: string; type: CashAccountType; branchId: number }[];
}

export interface RefundableDrawer {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    status: StudentStatus;
    branchId: number | null;
  };
  balance: number;
  kind: RefundableTab | null;
  since: string | null;
  days: number | null;
  lastGroup: { id: string; name: string } | null;
  lastPayment: { createdAt: string; amount: number } | null;
  telegramLinked: boolean;
  /** The bot text «Botga xabar yuborish» would send now; null = no phone. */
  noticePreview: string | null;
  transfer: TransferState;
}

/**
 * «Qaytariladigan pul» (spec B2b §3, ADR-0075): the money of students who are
 * not studying, by ADR-0067's kinds, and the open refund requests. Every row
 * of every tab is built in one batch (three queries) — the totals, the chips,
 * the pages and the Excel are cut from it.
 * ponytail: fine at hundreds of non-studying students with money; split the
 * page facts out (as the debt page does) if it reaches thousands.
 */
@Injectable()
export class RefundableService {
  constructor(private prisma: PrismaService) {}

  async list(
    companyId: number,
    scope: ReportBranchIds,
    q: RefundableQueryDto,
    now: Date = new Date(),
  ): Promise<RefundableListResponse> {
    const today = tashkentDateStr(now);
    const tab = q.tab ?? 'muzlatilgan';
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const pendingPage = q.pendingPage ?? 1;
    const pendingPageSize = q.pendingPageSize ?? 10;

    const [all, pending, pendingTotals] = await Promise.all([
      this.rows(companyId, scope, today),
      this.pendingRows(companyId, scope, today, {
        skip: (pendingPage - 1) * pendingPageSize,
        take: pendingPageSize,
      }),
      this.pendingTotals(companyId, scope),
    ]);
    const shown = all.filter(
      (r) =>
        r.kind === tab &&
        (!q.search || matchesSearch(r, q.search)) &&
        (tab !== 'muzlatilgan' || !q.age || r.ageBucket === q.age),
    );
    return {
      summary: { total: all.reduce((s, r) => s + r.balance, 0), count: all.length },
      tabs: refundableTabTotals(all),
      chips: chipCounts(all.filter((r) => r.kind === 'muzlatilgan')),
      rows: {
        data: shown.slice((page - 1) * pageSize, page * pageSize),
        total: shown.length,
        page,
        pageSize,
      },
      pending: { data: pending, page: pendingPage, pageSize: pendingPageSize, ...pendingTotals },
      cashAccounts: await this.cashAccounts(companyId, pending),
    };
  }

  /** The drawer (spec §3.5). Another branch's student is ADR-0063's 404. */
  async student(
    companyId: number,
    scope: ReportBranchIds,
    ceiling: ReportBranchIds,
    id: number,
    now: Date = new Date(),
  ): Promise<RefundableDrawer> {
    const s = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null, ...studentBranchWhere(scope) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        balance: true,
        status: true,
        statusChangedAt: true,
        createdAt: true,
        telegramChatId: true,
        telegramDisconnectedAt: true,
        branches: { select: { branchId: true }, orderBy: { branchId: 'asc' }, take: 1 },
      },
    });
    if (!s) throw await studentNotFound(this.prisma, companyId, id, scope, ceiling);
    const branchId = s.branches[0]?.branchId ?? null;
    const [studying, last, payment, transfer, noticePreview] = await Promise.all([
      this.prisma.student.count({ where: { id, ...activeStudentWhere() } }),
      this.prisma.enrollment.findFirst({
        where: { studentId: id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { statusChangedAt: true, group: { select: { id: true, name: true } } },
      }),
      this.prisma.payment.findFirst({
        where: { companyId, studentId: id, status: PaymentStatus.COMPLETED },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, amount: true },
      }),
      loadTransferState(this.prisma, s, branchId, now),
      loadNoticeText(
        this.prisma,
        { firstName: s.firstName, balance: s.balance, branchId, companyId },
        now,
      ),
    ]);
    const row = studying > 0 ? null : toRefundableRow(s, last, null, tashkentDateStr(now));
    return {
      student: {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        status: s.status,
        branchId,
      },
      balance: s.balance,
      kind: row?.kind ?? null,
      since: row?.since ?? null,
      days: row?.days ?? null,
      lastGroup: last ? { id: last.group.id, name: last.group.name } : null,
      lastPayment: payment
        ? { createdAt: payment.createdAt.toISOString(), amount: payment.amount }
        : null,
      // ADR-0066: a chat that refused the bot is not «ulangan».
      telegramLinked: !!s.telegramChatId && s.telegramDisconnectedAt === null,
      noticePreview,
      transfer,
    };
  }

  /** Spec §3.7: four sheets, the caller's scope, the active search on the student sheets. */
  async excel(
    companyId: number,
    scope: ReportBranchIds,
    q: RefundableQueryDto,
    now: Date = new Date(),
  ): Promise<{ buffer: Buffer; filename: string }> {
    const today = tashkentDateStr(now);
    const [all, pending] = await Promise.all([
      this.rows(companyId, scope, today),
      this.pendingRows(companyId, scope, today),
    ]);
    const found = q.search ? all.filter((r) => matchesSearch(r, q.search!)) : all;
    const of = (tab: RefundableTab) => found.filter((r) => r.kind === tab);
    return {
      buffer: await refundableWorkbook({
        pending,
        muzlatilgan: of('muzlatilgan'),
        guruhsiz: of('guruhsiz'),
        ketgan: of('ketgan'),
      }),
      filename: `qaytariladigan-pul-${today}.xlsx`,
    };
  }

  /** Every non-studying student in scope with money on the balance, as rows. */
  private async rows(
    companyId: number,
    scope: ReportBranchIds,
    today: string,
  ): Promise<RefundableRow[]> {
    const students = await this.prisma.student.findMany({
      where: {
        companyId,
        deletedAt: null,
        balance: { gt: 0 },
        NOT: activeStudentWhere(),
        ...studentBranchWhere(scope),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        balance: true,
        status: true,
        statusChangedAt: true,
        createdAt: true,
      },
    });
    if (students.length === 0) return [];
    const ids = students.map((s) => s.id);
    const latestPer = {
      orderBy: [{ studentId: 'asc' as const }, { createdAt: 'desc' as const }],
      distinct: ['studentId' as const],
    };
    const [enrollments, notices] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { studentId: { in: ids }, deletedAt: null },
        ...latestPer,
        select: {
          studentId: true,
          statusChangedAt: true,
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.balanceNotice.findMany({
        where: { studentId: { in: ids } },
        ...latestPer,
        select: { studentId: true, createdAt: true, channel: true },
      }),
    ]);
    const enrolOf = new Map(enrollments.map((e) => [e.studentId, e]));
    const noticeOf = new Map(notices.map((n) => [n.studentId, n]));
    return sortRefundableRows(
      students.map((s) =>
        toRefundableRow(s, enrolOf.get(s.id) ?? null, noticeOf.get(s.id) ?? null, today),
      ),
    );
  }

  private pendingWhere(companyId: number, scope: ReportBranchIds): Prisma.RefundWhereInput {
    return { companyId, status: RefundStatus.REQUESTED, student: studentBranchWhere(scope) };
  }

  /** Open requests, oldest due first; `paging` omitted = all (Excel). */
  private async pendingRows(
    companyId: number,
    scope: ReportBranchIds,
    today: string,
    paging?: { skip: number; take: number },
  ): Promise<PendingRefundRow[]> {
    const rows: PendingFact[] = await this.prisma.refund.findMany({
      where: this.pendingWhere(companyId, scope),
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      ...paging,
      select: PENDING_SELECT,
    });
    if (rows.length === 0) return [];
    // One holiday read per branch, over today and every due day of the page.
    const days = [today, ...rows.flatMap((r) => (r.dueDate ? [tashkentDateStr(r.dueDate)] : []))].sort();
    const branchIds = [...new Set(rows.map(pendingBranchId))];
    const sets = await Promise.all(
      branchIds.map((b) =>
        buildHolidayDateSet(
          this.prisma,
          tashkentDayStartUtc(days[0]),
          tashkentDayStartUtc(days[days.length - 1]),
          b,
        ),
      ),
    );
    const holidaysOf = new Map(branchIds.map((b, i) => [b, sets[i]]));
    return rows.map((r) =>
      toPendingRow(r, today, holidaysOf.get(pendingBranchId(r)) ?? new Set()),
    );
  }

  private async pendingTotals(companyId: number, scope: ReportBranchIds) {
    const closed = { companyId, student: studentBranchWhere(scope) };
    const [agg, historyCount, last] = await Promise.all([
      this.prisma.refund.aggregate({
        where: this.pendingWhere(companyId, scope),
        _count: { _all: true },
        _sum: { requestedAmount: true },
      }),
      this.prisma.refund.count({
        where: { ...closed, status: { in: [RefundStatus.COMPLETED, RefundStatus.REJECTED] } },
      }),
      // «Oxirgisi dd.MM da berilgan.» — processedAt is the hand-over, old rows included.
      this.prisma.refund.findFirst({
        where: { ...closed, status: RefundStatus.COMPLETED, processedAt: { not: null } },
        orderBy: { processedAt: 'desc' },
        select: { processedAt: true },
      }),
    ]);
    return {
      total: agg._count._all,
      sum: agg._sum.requestedAmount ?? 0,
      historyCount,
      lastHandedOverAt: last?.processedAt?.toISOString() ?? null,
    };
  }

  /** The drawers «Berildi» may name: active accounts of the pending page's branches, no balances. */
  private async cashAccounts(companyId: number, rows: PendingRefundRow[]) {
    const branchIds = [
      ...new Set(rows.map((r) => r.branchId).filter((b): b is number => b !== null)),
    ];
    if (branchIds.length === 0) return [];
    return this.prisma.cashAccount.findMany({
      where: { companyId, branchId: { in: branchIds }, isActive: true, deletedAt: null },
      orderBy: [{ branchId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, type: true, branchId: true },
    });
  }
}
```

- [ ] **Step 7: Controller and module**

`server/src/refundable/refundable.controller.ts`:

```ts
import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { BranchCeiling, BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';
import { RefundableService } from './refundable.service';
import { RefundableQueryDto } from './dto/refundable-query.dto';

/**
 * «Qaytariladigan pul» reads (spec B2b §3, ADR-0075). Every staff role but
 * Teacher reads; the writes keep their own gates. Scope: the header branch.
 */
@Controller('refundable')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
export class RefundableController {
  constructor(private readonly refundable: RefundableService) {}

  @Get('list')
  list(
    @Query() q: RefundableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.refundable.list(companyId, scope, q);
  }

  @Get('excel')
  async excel(
    @Query() q: RefundableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.refundable.excel(companyId, scope, q);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  @Get('students/:id')
  student(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.refundable.student(companyId, scope, ceiling, id);
  }
}
```

`server/src/refundable/refundable.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RefundableController } from './refundable.controller';
import { RefundableService } from './refundable.service';

@Module({ controllers: [RefundableController], providers: [RefundableService] })
export class RefundableModule {}
```

`server/src/app.module.ts`: import `RefundableModule` from `./refundable/refundable.module` and add it after `BalanceNoticesModule,`.

- [ ] **Step 8: Delete `GET /payments/frozen-balances`**

- `git rm server/src/payments/payments-frozen-balance.service.ts server/src/payments/payments-frozen-balance.service.spec.ts server/src/payments/dto/frozen-balances-query.dto.ts`
- `payments.controller.ts`: delete the `@Get('frozen-balances')` handler with its doc comment and the `FrozenBalancesQueryDto` import.
- `payments.service.ts`: delete the `PaymentsFrozenBalanceService` / `FrozenBalancesQuery` import, the `private frozenBalance` constructor parameter and `getFrozenBalances`.
- `payments.module.ts`: delete the import and the `PaymentsFrozenBalanceService` provider.
- `payments.service.spec.ts`: delete the import and the `PaymentsFrozenBalanceService,` provider line.
- `payments.controller.spec.ts`: delete `getFrozenBalances: jest.fn().mockResolvedValue({}),` from the service mock and the whole `describe('frozen-balances list', …)` block.
- `payments.branch-isolation.spec.ts`: delete the import and the whole `describe('PaymentsFrozenBalanceService', …)` block.
- `branch-route-policy.ts`: delete `'GET /payments/frozen-balances',` from the `BRANCH_SCOPED_BY_SERVICE` block.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd server && npx jest src/refundable src/payments src/common/auth`
Expected: PASS (the debt drawer's ADR-0063 cases prove the extraction).

- [ ] **Step 10: Format, lint, typecheck**

Run: `cd server && npx prettier --write src/refundable src/common/auth/other-branch.ts src/payments/debt/debt-list.service.ts src/payments/payments.controller.ts src/payments/payments.controller.spec.ts src/payments/payments.service.ts src/payments/payments.service.spec.ts src/payments/payments.module.ts src/payments/payments.branch-isolation.spec.ts src/app.module.ts src/common/auth/branch-route-policy.ts && npx eslint src/refundable src/common/auth src/payments src/app.module.ts && npm run typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add server/src/refundable server/src/common/auth/other-branch.ts server/src/payments server/src/app.module.ts server/src/common/auth/branch-route-policy.ts
git commit -m "feat(refundable): list, drawer and Excel for refundable money; drop GET /payments/frozen-balances

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Statement label, ADR-0075, docs

**Files:**
- Modify: `server/src/statements/present-statement.ts`, `server/src/statements/present-statement.spec.ts`
- Create: `docs/adr/0075-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md`
- Modify: `docs/adr/README.md`, `server/CLAUDE.md`, `docs/role-access.md`, `docs/financial-system.md`, `CONTEXT.md`

**Interfaces:**
- Consumes: everything above (the docs describe it).
- Produces: the statement's refund line «Pul qaytarish (dd.MM)» in both voices.

- [ ] **Step 1: Write the failing test** — in `present-statement.spec.ts`, in `it('gives a refund paid out a row of its own', …)`, change the expected label `'Sizga naqd qaytarib berildi (25.09)'` to `'Pul qaytarish (25.09)'`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/statements/present-statement.spec.ts`
Expected: FAIL — received «Sizga naqd qaytarib berildi (25.09)».

- [ ] **Step 3: Implement** — in `present-statement.ts`:

```ts
  // ADR-0075: at the request the money has not been handed over yet, and it
  // may leave by card — so neither «naqd» nor «berildi».
  refund: { student: 'pul qaytarish', admin: 'pul qaytarish' },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest src/statements`
Expected: PASS.

- [ ] **Step 5: Write ADR-0075** — `docs/adr/0075-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md`:

```markdown
# ADR-0075 — Pul qaytarish so'rov bilan: balans so'rov kuni 0, pul kassadan «Berildi»da chiqadi, muddat 10 bank kuni; markazga o'tkazish xabardan 10 bank kuni va 30 kun keyin

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0025, ADR-0055, ADR-0058, ADR-0063, ADR-0066, ADR-0067, ADR-0072, `server/src/refunds/`, `server/src/refundable/`, `server/src/balance-notices/`, `server/src/common/date/bank-days.ts`, `docs/superpowers/specs/2026-10-10-b2b-qaytariladigan-pul-design.md`, `docs/superpowers/plans/2026-10-10-b2b-qaytariladigan-pul.md`

## Kontekst

Pul qaytarish bir bosish edi: `POST /refunds/quick` `Refund` qatorini darhol
`COMPLETED` qilib yozardi, pulni balansdan ham, filial kassasidan ham o'sha soniyada
olardi. Kutish holati yo'q edi, pul o'quvchiga qachon yetgani hech qayerda yozilmasdi,
shartnomadagi «10 bank kuni» muddati tizimda yo'q edi. «Muzlatilganlarning puli»
sahifasi faqat 30 kundan ortiq muzlatilganlarni ko'rsatardi; guruhsiz va ketganlarning
puli hech qaysi sahifada yo'q edi. Markaz hisobiga o'tkazish (ADR-0055) hech qanday
shartsiz ochiq edi.

## Qaror (CEO, 10.10.2026)

1. **Har qaytarish so'rov orqali.** `Refund.status`: `REQUESTED` (so'rov ochiq,
   balans allaqachon 0, pul berilmagan) → `COMPLETED` («Berildi») yoki `REJECTED`
   (bekor qilindi). `APPROVED` va `PROCESSING` eski qatorlar uchun enumda qoladi,
   yangisi yozilmaydi. `PATCH /refunds/:id/process` o'chirildi.
2. **So'rov** (`POST /refunds/quick`, CEO, filial direktori, administrator): bitta
   Serializable tranzaksiyada `Refund` `REQUESTED`, `requestedById`, `dueDate` = bugundan
   keyingi 10-bank kuni; kerak bo'lsa oldindan to'langan darslar bekor qilinadi
   (o'zgarmagan); `REFUND` ledger qatori va balans. **Kassa harakati yozilmaydi**
   (`recordRefund` endi kassaga tegmaydi). Balans so'rov paytidanoq 0 — pul darsga,
   yechib olishga yoki boshqa qaytarishga sarflanmaydi.
3. **«Berildi»** (`POST /refunds/:id/hand-over`, kassir ham): o'quvchi filialining
   kassasi tanlanadi, o'sha `REFUND` qatoriga bog'langan `CashMovement` OUTFLOW yoziladi,
   so'rov `COMPLETED`, usul kassa turidan (naqd → `CASH`, bank/karta → `TRANSFER`).
   Kvitansiya faqat shundan keyin ochiladi (kodi birinchi ochilganda beriladi).
4. **Bekor qilish** (`POST /refunds/:id/cancel`, CEO va filial direktori, sabab
   majburiy): faqat `REQUESTED`; `REFUND` qatori va darslarni bekor qilgan
   `ADJUSTMENT` teskari yoziladi, darslar joyiga qaytadi, so'rov `REJECTED`. Juftlik
   hech qaysi oyda sanalmaydi (ADR-0058). `COMPLETED` qaytarishni bekor qilish —
   o'zgarmagan holda CEO'ning `POST /refunds/:id/reverse` (ledger + kassa).
5. **Bank kuni** — dushanba–juma, bayram emas. Bayramlar — markazning `Holiday`
   jadvali (kompaniya bo'yicha yoki o'quvchi filialiniki). Bu bank kalendarining
   o'rnini bosadigan taxmin: ko'chirilgan ish shanbalari modellanmaydi.
6. **Hisobotlar so'rovlarini o'zgartirmaydi.** Ledger o'quvchilari (sof foydaning
   qaytarish qismi, «Foyda tarkibi», to'lovlar hisoboti, Excel, Telegram «Diqqat»,
   o'quvchi hisoboti) qaytarishni **so'rov kuni** ko'radi; kassa va pul oqimi —
   **berilgan kuni**. Orada pul «Kutilayotgan qaytarishlar»da turadi. O'quvchi
   hisobotida qator «pul qaytarish» deb yoziladi (avval «naqd qaytarib berildi»).
7. **Xabar** (`BalanceNotice`, `POST /students/:id/balance-notices`, kassirdan
   tashqari): bot orqali (`BOT`) yoki «Qo'ng'iroq qilib aytildi» (`CALL`). Bot matni —
   CEO tasdiqlagan 1-variant, `balance-notice-text.ts` da, test bilan mahkamlangan.
   Bot xabari darhol ketadi (`SmsService` orqali, qo'lda SMS kabi) — bu ADR-0025
   ro'yxatiga qo'shimcha. Faqat yetkazilgan xabar yoziladi. Xabar **haqiqiy** —
   faqat o'quvchining hozirgi holatida berilgan bo'lsa (`createdAt ≥ statusChangedAt`).
8. **Markazga o'tkazish sharti:** oxirgi haqiqiy xabar + 10 bank kuni + 30 kalendar
   kun. Ungacha `POST /withdrawals` 400 qaytaradi; shart har yechib olishga,
   profildagi «Yechib olish»ga ham tegishli (ADR-0055: bu pul markazga o'tishi).
   `GET /withdrawals/preview` qulfni oldindan ko'rsatadi.
9. **«Qaytariladigan pul» sahifasi** (`GET /refundable/list|students/:id|excel`,
   kassir ham o'qiydi): o'qimayotganlarning musbat balansi ADR-0067 turlari bilan —
   muzlatilgan, guruhsiz, ketgan; o'qiyotganlar hech qachon chiqmaydi. Uch tur jami
   qo'shiladi (bu markazda turgan pul, qarz emas — ADR-0059 bunga tegmaydi).
   `GET /payments/frozen-balances` o'chirildi.

## Ko'rib chiqilgan muqobillar

- **Balansni «Berildi»da kamaytirish.** Rad etildi: kutish paytida pul darsga yoki
  boshqa joyga sarflanib ketardi.
- **Kassani so'rovda yozish.** Rad etildi: kassa qoldig'i hali chiqmagan pulni
  chiqqan deb ko'rsatardi.
- **Alohida bank kalendari.** Hozircha rad etildi: markazning bayram jadvali yetarli
  yaqin; farqi 5-bandda yozilgan.
- **Markazga o'tkazishni faqat ogohlantirish bilan cheklash.** Rad etildi: CEO
  tizim o'zi bloklasin dedi.

## Oqibatlari

- Pul qaytarishning ikki sanasi bor: so'rov (ledger) va berilgan (kassa). Kun
  oxiridagi kassa qoldig'i va ledger bir kunda farq qilishi kutilgan holat.
- `recordRefund` kassaga yozmaydi; kassa harakatini faqat hand-over yozadi. Yangi
  joydan `recordRefund` chaqirilsa, kassa yo'li o'ylanishi kerak.
- Mavjud 7 ta `COMPLETED` qaytarish o'zgarmaydi; tarixda ularning `processedAt`i
  «Berildi» sanasi sifatida chiqadi.
- Xabarsiz o'quvchining pulini markazga o'tkazib bo'lmaydi — yangi tartib profildagi
  «Yechib olish»ni ham to'xtatadi.
```

- [ ] **Step 6: Index row** — in `docs/adr/README.md`, after the `[0074]` row:

```markdown
| [0075](0075-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md) | Pul qaytarish so'rov bilan: balans so'rov kuni 0, pul kassadan «Berildi»da chiqadi, muddat 10 bank kuni; markazga o'tkazish xabardan 10 bank kuni va 30 kun keyin ochiladi | Qabul qilindi | 2026-10-10 |
```

- [ ] **Step 7: `server/CLAUDE.md`** — four edits:

(a) In «Refunds Module», replace the line
`- **Endpoints**: \`GET /refunds/preview/:studentId\`, \`POST /refunds/quick\`, \`GET /refunds\`, \`PATCH /refunds/:id/process\`, \`POST /refunds/:id/reverse\` (CEO-only)`
with:

```markdown
- **Endpoints**: `GET /refunds/preview/:studentId` (+ `dueDate`), `POST /refunds/quick` (opens a request), `POST /refunds/:id/hand-over` («Berildi», Cashier too), `POST /refunds/:id/cancel` (CEO/BD), `GET /refunds` (history, `?status=` list, paged, Cashier too), `POST /refunds/:id/reverse` (CEO-only)
- **A refund is a request first (ADR-0075).** `quickRefund` writes `REQUESTED` with `requestedById` and `dueDate` = the 10th bank day after today (`refundDueDate`: `addBankDays` from `common/date/bank-days.ts` over `termHolidays` of the student's branch), releases prepaid lessons as before and calls `recordRefund` — the REFUND ledger row and the balance, **no `CashMovement`** (`recordRefund` writes none any more). «Berildi» (`RefundsProcessService.handOver`) re-reads the row in a Serializable transaction, refuses anything but `REQUESTED` (409 «So'rov allaqachon yopilgan»), writes the OUTFLOW from the chosen account of the student's branch against the REFUND row, sets `COMPLETED`, `handedOverAt/By`, `cashAccountId`, `refundMethod` (CASH account → CASH, else TRANSFER) and `processedAt/By`; the receipt opens only then. `cancel` (reason required) reverses the REFUND row and the release ADJUSTMENT and gives the lessons back (`unwindLedger`, shared with `reverse`), then `REJECTED` + `cancelledAt/By/cancelReason`. History: `PUL_QAYTARISH_SOROVI`, `PUL_QAYTARIB_BERILDI`, `PUL_QAYTARISH_BEKOR_QILINDI`. Ledger readers see the refund on the request day; the cash drawer on the hand-over day. `Refund.dueDate` is stored as 00:00 Tashkent and sent as `'YYYY-MM-DD'` (`refundView`).
```

(b) Replace
`- **\`quickRefund\` is idempotent-ish at the door**: an identical \`(student, enrollment, amount)\` COMPLETED refund inside 60 s is refused.`
with
`- **\`quickRefund\` is idempotent-ish at the door**: an identical \`(student, enrollment, amount)\` REQUESTED or COMPLETED refund inside 60 s is refused.`
(the rest of that bullet unchanged).

(c) Replace the two lines
`- **Status transitions**: \`REQUESTED → [APPROVED, REJECTED]\`, \`APPROVED → [PROCESSING, COMPLETED]\`, \`PROCESSING → COMPLETED\`. \`quickRefund\` writes \`COMPLETED\` directly.`
`- Reverse CEO-only; contract stays REFUNDED (manual re-open if needed)`
with:

```markdown
- **Status transitions**: `REQUESTED → [COMPLETED, REJECTED]` (ADR-0075). `APPROVED` and `PROCESSING` stay in the enum for old rows and are never written; `PATCH /refunds/:id/process` is deleted.
- Reverse CEO-only, for a COMPLETED refund (ledger + the hand-over cash movement); contract stays REFUNDED (manual re-open if needed). A request is cancelled, not reversed.
```

(d) In «Balance Withdrawal», replace
`and from the «Muzlatilganlarning puli» page (\`/payments/frozen-balances\`) («Markaz hisobiga o'tkazish»).`
with
`and from the «Qaytariladigan pul» page (\`/payments/refunds\`, «Markaz hisobiga o'tkazish»).`
and after its `- **Endpoints**: \`GET /withdrawals/preview/:studentId\`, \`POST /withdrawals\`` line add:

```markdown
- **Transfer condition (ADR-0075)**: `create` refuses (400) unless the student's latest **valid** balance notice (`BalanceNotice`, `createdAt ≥ Student.statusChangedAt`) exists and today (Tashkent) ≥ notice + 10 bank days + 30 days (`transferTerm`, `balance-notices/transfer-condition.ts`). The refusal texts are the spec's; `loadTransferState` is the one reader (create, preview's `transfer`, the refundable drawer). Every withdrawal, the profile's «Yechib olish» included. Notices: `POST /students/:id/balance-notices` (CEO/BD/Admin) — `BOT` sends the CEO-approved text (`balance-notice-text.ts`, pinned by a test) at once through `SmsService` and writes the notice only when it was delivered; `CALL` marks a phone call.
```

(e) In «Key access rules», replace
`and no «Muzlatilganlarning puli» row actions (\`POST /withdrawals\`, \`POST /refunds/quick\`)`
with
`and, on «Qaytariladigan pul» (\`GET /refundable/*\`, \`GET /refunds\`, ADR-0075), no request, notice or transfer (\`POST /refunds/quick\`, \`POST /students/:id/balance-notices\`, \`POST /withdrawals\`) — but «Berildi» (\`POST /refunds/:id/hand-over\`)`.

(f) In the «RBAC for Financial Features» table replace the row `| Create refund                                    | ✅  | ✅  |  ✅   |   ❌    |   ❌    |` with:

```markdown
| Open refund request (`POST /refunds/quick`)      | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| Hand refund over («Berildi»)                     | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
| Cancel refund request                            | ✅  | ✅  |  ❌   |   ❌    |   ❌    |
| Give balance notice («Xabar berish»)             | ✅  | ✅  |  ✅   |   ❌    |   ❌    |
| «Qaytariladigan pul» reads (`/refundable/*`)     | ✅  | ✅  |  ✅   |   ✅    |   ❌    |
```

- [ ] **Step 8: `docs/role-access.md`** — replace the rows `| Create refund (one step, \`POST /refunds/quick\`) | Yes | Yes | Yes | No | No |` and `| Process a legacy refund request (\`PATCH /refunds/:id/process\`, no screen) | Yes | Yes | Yes | No | No |` with:

```markdown
| Open refund request (`POST /refunds/quick`, ADR-0075) | Yes | Yes | Yes | No | No |
| Hand refund over («Berildi», `POST /refunds/:id/hand-over`) | Yes | Yes | Yes | No | Yes |
| Cancel refund request (`POST /refunds/:id/cancel`) | Yes | Yes | No | No | No |
| Give balance notice (`POST /students/:id/balance-notices`) | Yes | Yes | Yes | No | No |
| «Qaytariladigan pul» page and refund history (`GET /refundable/*`, `GET /refunds`) | Yes | Own branch | Own branch | No | Own branch |
```

In the «Debt page» paragraph replace `and the three linked pages (debt history, write-off archive, frozen balances)` with `and the two linked pages (debt history, write-off archive); frozen balances moved to «Qaytariladigan pul» (ADR-0075)`, and delete the row `| Move a frozen balance (to the center / back to the student) | Yes | Yes | Yes | No | No |`.

- [ ] **Step 9: `docs/financial-system.md`** — (a) the `Refund` table row `| status | RefundStatus | Yangi refund darhol \`COMPLETED\`; \`REQUESTED\`/\`APPROVED\` faqat eski qatorlarda |` becomes `| status | RefundStatus | \`REQUESTED\` (so'rov) → \`COMPLETED\` («Berildi») yoki \`REJECTED\` (bekor qilindi), ADR-0075; \`APPROVED\`/\`PROCESSING\` yozilmaydi |`; (b) the paragraph starting `**Status:** \`quickRefund\` \`COMPLETED\` ni darhol yozadi.` becomes:

```markdown
**Status (ADR-0075):** `quickRefund` so'rov ochadi (`REQUESTED`): balans darhol kamayadi, kassa harakati yo'q, muddat — 10 bank kuni (`dueDate`). «Berildi» (`POST /refunds/:id/hand-over`) kassadan chiqimni yozadi va `COMPLETED` qiladi; `POST /refunds/:id/cancel` (CEO, filial direktori) pul va darslarni qaytarib `REJECTED` qiladi. `PATCH /refunds/:id/process` o'chirilgan.
```

(c) In «4.5 Refunds» replace the table rows for `/api/refunds/quick`, `/api/refunds` and `/api/refunds/:id/process` with:

```markdown
| `POST` | `/api/refunds/quick` | CEO, BD, Admin | So'rov ochish — `REQUESTED`, muddat 10 bank kuni |
| `POST` | `/api/refunds/:id/hand-over` | CEO, BD, Admin, Cashier | «Berildi» — kassadan chiqim, `COMPLETED` |
| `POST` | `/api/refunds/:id/cancel` | CEO, BD | So'rovni bekor qilish — `REJECTED` |
| `GET` | `/api/refunds` | CEO, BD, Admin, Cashier | Tarix (`?status=`, sahifali, filial bo'yicha) |
```

(d) In «6.3 Role-Based Access» replace `| Refund yaratish | ✅ | ✅ | ✅ | ❌ | ❌ |` with:

```markdown
| Pul qaytarish so'rovi | ✅ | ✅ | ✅ | ❌ | ❌ |
| «Berildi» | ✅ | ✅ | ✅ | ✅ | ❌ |
| So'rovni bekor qilish | ✅ | ✅ | ❌ | ❌ | ❌ |
```

- [ ] **Step 10: `CONTEXT.md`** — replace the «Pul qaytarish (refund)» entry's text (keep its file line) with:

```markdown
**Pul qaytarish (refund)** — faqat ikki manbadan moliyalanadi: erkin balans va
`prepaidLessonsRemaining`. O'tilgan darsga ketgan pul qaytmaydi. Qaytarish
oldindan to'langan darsni **bekor qiladi**. ADR-0075 dan beri **so'rov**: balans
so'rov kuni kamayadi, pul kassadan «Berildi»da chiqadi, muddat — 10 **bank kuni**
(dushanba–juma, filial bayramlari sanalmaydi).
`refunds/refunds-create.service.ts`

**Xabar (balance notice)** — o'qimayotgan o'quvchiga «pulingizni olib keting»
deyilgani (bot yoki qo'ng'iroq). Faqat hozirgi holatida berilgani hisoblanadi; markaz
hisobiga o'tkazish undan 10 bank kuni va yana 30 kun o'tgach ochiladi.
`balance-notices/transfer-condition.ts`
```

- [ ] **Step 11: Format, lint, verify**

Run: `cd server && npx prettier --write src/statements/present-statement.ts src/statements/present-statement.spec.ts && npx eslint src/statements && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add server/src/statements/present-statement.ts server/src/statements/present-statement.spec.ts docs/adr/0075-pul-qaytarish-sorov-va-markazga-otkazish-sharti.md docs/adr/README.md server/CLAUDE.md docs/role-access.md docs/financial-system.md CONTEXT.md
git commit -m "docs(refunds): ADR-0075, statement label and docs for refund requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## API contract (for the client half)

All routes under `/api`. Dates: `'YYYY-MM-DD'` = a Tashkent day; ISO strings = instants. Money = integer so'm. Errors are Nest's `{ statusCode, message, error }`.

### 1. `POST /refunds/quick` — open a request (changed)
- Roles: CEO, Branch Director, Administrator.
- Body: `{ studentId: number; enrollmentId?: string; amount: number /* ≥ 1 */; reason?: string; refundMethod?: PaymentMethod /* ignored */ }`.
- 201 response: the Refund row —
  ```ts
  type RefundRowView = {
    id: string; studentId: number; enrollmentId: string | null;
    requestedAmount: number; approvedAmount: number | null;
    status: 'REQUESTED' | 'COMPLETED' | 'REJECTED';
    reason: string | null; dueDate: string | null; // 'YYYY-MM-DD'
    refundMethod: PaymentMethod | null; requestedById: number | null;
    handedOverAt: string | null; handedOverById: number | null; cashAccountId: string | null;
    cancelledAt: string | null; cancelledById: number | null; cancelReason: string | null;
    processedAt: string | null; processedById: number | null;
    receiptCode: string | null; createdAt: string; updatedAt: string;
    lessonsCompleted: number; totalLessons: number; deductions: unknown; contractId: string | null; companyId: number;
  };
  ```
  For this route: `status: 'REQUESTED'`, `refundMethod: null`, `processedAt: null`, `dueDate` = the 10th bank day. Toast «So'rov ochildi — pul dd.MM gacha beriladi» reads `dueDate`.
- Errors: 404 «O'quvchi topilmadi»; 403 «Bu o'quvchi boshqa filialga tegishli — unga pul yozish huquqingiz yo'q»; 400 «Qaytarish summasi maksimal summadan oshib ketdi (maksimum N so'm)»; 400 «Shu summadagi qaytarish hozirgina yozildi — takror yuborilmadi»; 404/400 enrollment texts unchanged.

### 2. `GET /refunds/preview/:studentId?enrollmentId=` (changed)
- Roles: CEO, Branch Director, Administrator.
- Response: unchanged fields plus `dueDate: string` (`'YYYY-MM-DD'`) — in both the enrollment quote and the balance-only quote. Dialog line: «So'rov ochilgach balans 0 bo'ladi. Pul dd.MM gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.»

### 3. `POST /refunds/:id/hand-over` — «Berildi» (new)
- Roles: CEO, Branch Director, Administrator, Cashier.
- Body: `{ cashAccountId: string }` (uuid of an account from `GET /refundable/list` → `cashAccounts` with the row's `branchId`).
- 201 response: `RefundRowView` with `status: 'COMPLETED'`, `handedOverAt`, `refundMethod` (`'CASH'` for a CASH account, else `'TRANSFER'`). The receipt is then at `GET /receipts/refund/:id.pdf`.
- Errors: 404 «So'rov topilmadi»; 403 (another branch's student); 400 «Kassani tanlang» (not a uuid); 400 «Kassa o'quvchining filialida topilmadi»; 409 «So'rov allaqachon yopilgan»; 409 «Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring».

### 4. `POST /refunds/:id/cancel` — cancel a request (new)
- Roles: CEO, Branch Director.
- Body: `{ reason: string }` (trimmed, 1–500 chars).
- 201 response: `RefundRowView` with `status: 'REJECTED'`, `cancelledAt`, `cancelReason`. The money is back on the balance and the cancelled lessons are back.
- Errors: 400 «Sababini yozing»; 404 «So'rov topilmadi»; 403; 409 «So'rov allaqachon yopilgan»; 409 «Bir vaqtda boshqa o'zgarish bo'ldi — qayta urinib ko'ring».

### 5. `GET /refunds?status=COMPLETED,REJECTED&page=1&pageSize=10&branchId=` — history (changed shape)
- Roles: CEO, Branch Director, Administrator, Cashier. Scope: header branch.
- `status`: comma list of `RefundStatus`; omitted = every status. `pageSize` 1–50 (default 10).
- Response:
  ```ts
  type RefundHistoryRow = {
    id: string;
    student: { id: number; firstName: string; lastName: string; phone: string };
    amount: number; status: RefundStatus; reason: string | null;
    requestedAt: string;            // ISO — «So'ralgan»
    dueDate: string | null;         // 'YYYY-MM-DD'
    handedOverAt: string | null;    // ISO — «Berildi»; pre-B2b rows: processedAt
    refundMethod: PaymentMethod | null; // 'CASH' → «naqd», any other → «karta»
    cancelledAt: string | null; cancelReason: string | null; // pill «bekor qilindi», reason on hover
    closedBy: { id: number; name: string } | null; // «Kim berdi» / «Kim bekor qildi»
  };
  type Response = { data: RefundHistoryRow[]; total: number; page: number; pageSize: number };
  ```
  Order: newest request first.

### 6. `POST /refunds/:id/reverse` — unchanged (CEO; COMPLETED only, 400 «Faqat yakunlangan refundni bekor qilish mumkin» otherwise).

### 7. `PATCH /refunds/:id/process` — **removed** (404).

### 8. `GET /refundable/list` (new)
- Roles: CEO, Branch Director, Administrator, Cashier. Scope: header branch.
- Query: `tab=muzlatilgan|guruhsiz|ketgan` (default `muzlatilgan`), `age=upto30|d31to60|over60` (muzlatilgan only), `search` (≤ 100; name, phone, exact ID), `page` (default 1), `pageSize` (1–50, default 20), `pendingPage` (default 1), `pendingPageSize` (1–50, default 10), `branchId`.
- Response:
  ```ts
  type NoticeCell = { date: string /* 'YYYY-MM-DD' */; channel: 'BOT' | 'CALL' };
  type RefundableRow = {
    studentId: number; firstName: string; lastName: string; phone: string;
    balance: number;                       // «Puli»
    kind: 'muzlatilgan' | 'guruhsiz' | 'ketgan';
    since: string;                         // 'YYYY-MM-DD' — «dd.MM · N kun»
    days: number;
    ageBucket: 'upto30' | 'd31to60' | 'over60'; // frozen «Holat»: kutilmoqda / muddati o'tgan / ketgan hisoblanadi
    lastGroup: { id: string; name: string } | null; // «Oxirgi guruh»
    notice: NoticeCell | null;             // «Xabar»: «dd.MM · bot orqali» / «dd.MM · qo'ng'iroq qilib aytildi» / «berilmagan»
  };
  type PendingRefundRow = {
    id: string; studentId: number; firstName: string; lastName: string; phone: string;
    branchId: number | null;               // pick cashAccounts of this branch
    amount: number; requestedAt: string /* ISO */; dueDate: string /* 'YYYY-MM-DD' — «dd.MM gacha» */;
    due: { overdue: boolean; bankDays: number }; // «N bank kuni qoldi» (amber at ≤ 2) / «muddati o'tdi · N bank kuni» (N = 0 → «muddati o'tdi»)
    reason: string | null;
  };
  type RefundableListResponse = {
    summary: { total: number; count: number };  // «O'qimayotganlarning markazda turgan puli» · «N kishi — …»
    tabs: Record<'muzlatilgan' | 'guruhsiz' | 'ketgan', { total: number; count: number }>;
    chips: { all: number; upto30: number; d31to60: number; over60: number }; // frozen tab; «N tasi 30 kundan oshgan» = d31to60 + over60
    rows: { data: RefundableRow[]; total: number; page: number; pageSize: number }; // the open tab, search + age applied
    pending: {
      data: PendingRefundRow[]; total: number; sum: number; page: number; pageSize: number;
      historyCount: number;               // «Tarix · N ta →»
      lastHandedOverAt: string | null;    // ISO — «Oxirgisi dd.MM da berilgan.»
    };
    cashAccounts: { id: string; name: string; type: 'CASH' | 'BANK' | 'CARD'; branchId: number }[];
  };
  ```
  Summary, tabs and chips ignore `search`, `age` and paging. Rows: largest balance first.

### 9. `GET /refundable/students/:id` — drawer (new)
- Roles: CEO, Branch Director, Administrator, Cashier. Scope: header branch; another branch the caller may open → 404 `{ message: "Bu o'quvchi «X» filialiga tegishli. Ko'rish uchun shu filialni tanlang.", branch: { id, name } }`; otherwise 404 «O'quvchi topilmadi».
- Response:
  ```ts
  type TransferState = {
    notice: NoticeCell | null;      // the latest valid notice — drawer «Xabar»
    termEnds: string | null;        // 'YYYY-MM-DD'
    allowedFrom: string | null;     // 'YYYY-MM-DD'
    allowed: boolean;               // false → «Markaz hisobiga o'tkazish» locked, `refusal` in amber
    refusal: string | null;         // exact text POST /withdrawals would answer
  };
  type RefundableDrawer = {
    student: { id: number; firstName: string; lastName: string; phone: string; status: StudentStatus; branchId: number | null };
    balance: number;                // «Markazdagi puli»
    kind: 'muzlatilgan' | 'guruhsiz' | 'ketgan' | null; // null = studying now
    since: string | null; days: number | null;
    lastGroup: { id: string; name: string } | null;
    lastPayment: { createdAt: string; amount: number } | null;
    telegramLinked: boolean;        // «ulangan» / «ulanmagan»
    noticePreview: string | null;   // the exact bot text «Botga xabar yuborish» would send now (spec §5.3); null = no branch/company phone
    transfer: TransferState;        // allowed → green line «Shart bajarilgan: xabar dd.MM, muddat dd.MM da tugagan, 30 kun o'tdi.»
  };
  ```

### 10. `GET /refundable/excel` (new)
- Roles and query as `GET /refundable/list` (`search` applies; `tab`, `age`, paging ignored). Response: xlsx `qaytariladigan-pul-YYYY-MM-DD.xlsx`, sheets «Kutilayotgan», «Muzlatilganlar», «Guruhsiz», «Ketganlar», each with a «Jami» row.

### 11. `POST /students/:id/balance-notices` (new)
- Roles: CEO, Branch Director, Administrator (not Cashier).
- Body: `{ channel: 'BOT' | 'CALL'; note?: string /* trimmed, ≤ 500 */ }`.
- 201 response: `{ id: string; studentId: number; companyId: number; channel: 'BOT' | 'CALL'; amount: number; note: string | null; smsMessageId: string | null; createdById: number; createdAt: string }`.
- The preview the drawer shows before «Botga xabar yuborish» is `GET /refundable/students/:id` → `noticePreview` (built by the same `loadNoticeText` the send uses); the client never composes the text.
- Errors: 404 «O'quvchi topilmadi»; 403; 400 «O'quvchi hisobida pul yo'q»; 400 «Telegram bog'lanmagan — qo'ng'iroq qiling»; 400 «Filial telefon raqami kiritilmagan»; 400 «Botga xabar yetmadi — qo'ng'iroq qiling» when the bot send failed (every FAILED result; Telegram's own reason stays in the SMS log, never on screen) — nothing written.

### 12. `GET /withdrawals/preview/:studentId` (changed)
- Roles: CEO, Branch Director, Administrator.
- Response: unchanged fields plus `transfer: TransferState` (same type as §9).

### 13. `POST /withdrawals` (changed)
- New 400s (before anything is written): «Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.» / «Markazga o'tkazish dd.MM dan ochiladi (xabar dd.MM da berilgan, qaytarish muddati dd.MM gacha).»

### 14. `GET /payments/frozen-balances` — **removed** (404).

### 15. Student history (`GET /entity-history/Student/:id`) — new `newValues.status` keys
- `PUL_QAYTARISH_SOROVI` `{ balans, summa, muddat: 'dd.MM.yyyy', bekor_qilingan_darslar, guruh, sabab }`
- `PUL_QAYTARIB_BERILDI` `{ summa, kassa, usul: 'Naqd' | 'Karta' }`
- `PUL_QAYTARISH_BEKOR_QILINDI` `{ summa, qaytgan_darslar, sabab }`
- `PUL_HAQIDA_XABAR_BERILDI` `{ kanal: 'Telegram bot' | "Qo'ng'iroq", summa, izoh }`
- (old `PUL_QAYTARILDI` rows stay.)

### 16. Statement — the refund line reads «Pul qaytarish (dd.MM)» in both voices (was «Sizga naqd qaytarib berildi» / «Naqd qaytarib berildi»).

## Spec coverage (server)

| Spec | Task |
|---|---|
| §2.1 states, `REFUND_TRANSITIONS` | 3, 4 |
| §2.2 request (REQUESTED, dueDate, no cash, history, duplicate guard, prepaid release) | 3 |
| §2.3 hand-over (branch drawer, 409, CashMovement, method, processedAt, receipt) | 4 (receipt: Decision 2) |
| §2.4 cancel (CEO/BD, REQUESTED only, unwind, REJECTED, history) | 4 |
| §2.5 `process` removed | 3 |
| §2.6 bank days + holidays + examples | 1 |
| §2.7 reports unchanged; statement label | 3 (no cash), 9 |
| §3.2–3.4, §3.7 list, tabs, chips, pending, Excel | 7, 8 |
| §3.5 drawer (facts, telegram, notice, lock) | 8 |
| §3.6 history | 4 |
| §3.8 frozen-balances route deleted | 8 |
| §4 preview `dueDate` | 3 |
| §5.1 notice (BOT/CALL, failures, validity, history) | 5 |
| §5.2 transfer condition (create + preview) | 5, 6 |
| §5.3 bot text pinned | 5 |
| §6 migration | 2 |
| §7 modules, route manifest | 3, 4, 5, 8 (Spec conflict 1) |
| §9 tests | every task |
| ADR-0075, server/CLAUDE.md | 9 |


---

# Part 2 — client (Tasks 10–16)

**Goal:** The new `/payments/refunds` page (money of students who are not studying, open refund requests with «Berildi» / «Bekor qilish», the drawer with notice and the transfer lock), its history sub-page, the refund dialog turned into «open a request», the transfer lock in «Yechib olish», the frozen-balances page folded into the new one, and the user guide.

**Architecture:** One folder `client/src/components/payments/refunds/` mirrors `debt/`: server shapes (`refunds-types.ts`), URL state (`refunds-url.ts`), pure Uzbek text helpers (`refunds-format.ts`), React Query hooks plus one `invalidateRefunds` (`refunds-queries.ts`), and thin components that print what the server sent. Every figure, date, pill number, bot text and refusal comes from the API contract at the end of `docs/superpowers/plans/2026-10-10-b2b-qaytariladigan-pul.md`; the client adds nothing but the formatting.

**Tech Stack:** Next.js 16 App Router, React 19, React Query 5, shadcn/ui (radix), Vitest 4 (node env, `src/**/*.test.ts` only). No new dependency.

**Order:** Tasks 10–16 follow the server's Tasks 1–9 in the same branch. They read only the API contract, so they can be built before the server lands; the two halves deploy together (server plan, Global Constraints, «Rollout»).

## Client constraints

- **No Prettier on `client/`** — never run `npx prettier` on client files; match the surrounding style by hand (the code below is already in it).
- **Screen text is Latin-script Uzbek only** — no English word on screen (`refunds-page.test.ts` checks); comments may be English.
- **Every table** has the `#` column (`w-12 border-r`, numbered `(page − 1) × pageSize + i + 1`) and pagination (`TablePagination`, sizes 10–50; the page's own default from the contract).
- **Dialogs and sheets are scroll-safe**: `DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md"`, header `border-b px-6 py-4`, body `flex-1 overflow-y-auto px-6 py-4` (the only scroll container), footer `border-t px-6 py-4`; sheets the same with `SheetContent p-0 flex flex-col`.
- **The drawer closes before any dialog opens** (B2a rule): `setDrawerId(null)` in the same handler that sets the dialog's target.
- **Financial data is never updated optimistically**: every mutation ends in `invalidateRefunds(qc)` (refundable list, drawer, history, `financial-overview`, `student-payments`, `debt-list`, `debt-student`), on success and on refusal.
- **Tests use made-up numbers and generic names** (`Ali Valiyev`, `10001`, `350 000`); never a production figure — the repository is public.
- **Tests are `*.test.ts`** (vitest includes only that), written with `createElement`, no JSX; static renders use `renderToStaticMarkup`.
- **Per task run only its focused tests**: `cd client && npx vitest run <paths>` (fallback `npx vitest --config vitest.config.mts run <paths>`; the config file is `.mts`), then `npx tsc --noEmit -p .` and `npx eslint <touched files>` once each. Re-run only after a code change.
- **Never commit `client/AGENTS.md`** (`next dev` rewrites it): `git add` only the paths a task names, never `-A`.
- **Commits**: one per task, from the worktree root, English message ending with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git stash`, `git reset --hard` or force-push.
- **Where commands run**: worktree root `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/b2b-qaytariladigan-pul`; client commands are written `cd client && …`, git commands from the root with repo-relative paths.

## Decisions

1. **Task order differs from the suggested split**: helpers → «Berildi»/«Bekor qilish» dialogs → drawer (+ withdrawal lock) → refund dialog → page → history and redirects → guide. The page mounts the dialogs and the drawer, so building them first lets every task compile and test alone.
2. **Component split** in `components/payments/refunds/`: `refunds-types.ts`, `refunds-url.ts`, `refunds-format.ts` (pure), `refunds-queries.ts`, `refunds-tables.tsx` (pending + tab tables), `refunds-page.tsx`, `pending-dialogs.tsx`, `refundable-drawer.tsx`, `transfer-note.tsx` (shared by the drawer and «Yechib olish»), `refund-history-page.tsx` — the `debt/` layout.
3. **Query keys**: `["refundable-list", branchId, params]`, `["refundable-student", id]`, `["refund-history", branchId, page, pageSize]`; branch in the key like `debt-list`, so a branch switch never shows another branch's answer.
4. **URL schema = the API's query names** (`REFUNDS_SCHEMA`): `tab` (default `muzlatilgan`, omitted), `age` (Muzlatilganlar only), `search`, `page`/`pageSize` (20), `pendingPage`/`pendingPageSize` (10); a value the server would refuse falls back to its default (`cleanRefundsFilters`). History: `page`/`pageSize` (10).
5. **Between answers**: same-tab changes keep the last answer dimmed; a tab switch drops only `rows` (other columns) — `keepWithinRefundTab`, the debt page's pattern. A page past the last one (its last request just handed over) jumps back via the debt page's `lastPageIfPast`, for both pagers.
6. **The drawer has its own query** (`GET /refundable/students/:id`, `staleTime: 0`, the debt page's `retryDrawer`); the bot preview is the server's `noticePreview`, never composed on the client; a 404 prints the server's message (ADR-0063 names the branch to switch to).
7. **«Berildi» lists drawers from the list response's `cashAccounts`** (server Decision 6), filtered to the row's `branchId` (`accountOptions`): one account is preselected; none → «O'quvchining filialida kassa topilmadi» and the button stays shut.
8. **Role checks live in `role-access.ts`** (`REFUND_REQUEST_ROLES = [1,2,3]`, `REFUND_HAND_OVER_ROLES = [1,2,3,5]`, `REFUND_CANCEL_ROLES = [1,2]`) and are read with `hasAnyRole` in the page only, passed down as booleans, so tables and the drawer body render in tests without mocking auth. The drawer's four options share `REFUND_REQUEST_ROLES`: status change, enroll, notice and withdrawal all carry CEO/BD/Admin on the server, so a Cashier gets no «Nima qilish mumkin» block at all.
9. **Drawer → dialog**: the page holds one `action` state and mounts the existing dialog fresh (`ActionDialog`). `ChangeStatusDialog` gains an optional `initialStatus` (read on mount) so «Qaytdi» opens on ACTIVE; `EnrollToGroupDialog` gets the drawer's `student.branchId` and `enrolledGroupIds=[]` (an ungrouped student has no active group). Both mount standalone — no link to the profile needed.
10. **Profile «Pulni qaytarish» is already hidden for the Cashier**: the whole action block of `student-profile-card.tsx` renders under `canManage` (`[1, 2, 3]`). No change.
11. **`/payments/frozen-balances` redirects with `redirect()` in its `page.tsx`** (as `/payments/debtors` does), not `next.config` — one pattern for old paths; the bookmark lands on `?tab=muzlatilgan`.
12. **Refund dialog dates**: the line reads the preview's `dueDate` (`requestDueLine`), the toast the 201 answer's `dueDate` (`requestOpenedText`); nothing is recomputed. The «Qaytarish usuli» select goes: the method is the drawer's, chosen at «Berildi» (server Decision 7 ignores it).
13. **«Yechib olish»** renders `TransferNote` from `preview.transfer` and disables amount, switch and submit while `!transfer.allowed`; the amber text is the server's `refusal`, the green line is built from `notice.date` and `termEnds`.
14. **Pending pill edge the contract leaves open**: not overdue with 0 bank days (the due day itself) prints «bugun oxirgi kun» (amber) — «0 bank kuni qoldi» reads as already late.
15. **Search box**: `UrlSearchBox` is extracted from `DebtFilterBar` (same 300 ms URL mirror) and reused, instead of a second copy.
16. **Row hint** «O'quvchi ustiga bosing — tafsilot va amallar o'ng tomonda ochiladi» is added: on the debt page nothing else said a row opens (#676).
17. **Texts the spec does not give**: empty tab «Bu bo'limda puli qolgan o'quvchi yo'q» / with search «Hech kim topilmadi — qidiruvni tozalab ko'ring»; empty history «Hali berilgan yoki bekor qilingan so'rov yo'q»; toasts «Pul berildi», «So'rov bekor qilindi — pul balansga qaytdi», «Xabar botga yuborildi», «Qo'ng'iroq belgilandi»; history title «Qaytarishlar tarixi» + «Berilgan va bekor qilingan so'rovlar» (mock-up).
18. **Tab totals print with «so'm»** (`formatBalance`) like the debt page's tab buttons, not the mock-up's bare numbers; the pending actions are two inline buttons (spec and mock-up), not the table rule's 3-dot menu — the two actions are what the table is for.
19. **No refund-receipt link** is added: no screen shows one today and the spec names no column. Add it to the history row when the CEO asks.
20. **Tests**: pure helpers (format, URL, `keepWithinRefundTab`) as unit tests; page, history, drawer body and `TransferNote` as static renders with mocked `next/navigation`/`useAuth`; dialogs as static renders with `@/components/ui/dialog` drawn inline (the `telegram-announce-dialog.test.ts` pattern); source checks only for the redirect and the deleted view.

## File map

| File | Change | Task |
|---|---|---|
| `client/src/components/payments/refunds/refunds-types.ts` | new | 10 |
| `client/src/components/payments/refunds/refunds-url.ts` | new | 10 |
| `client/src/components/payments/refunds/refunds-format.ts` | new, pure | 10 |
| `client/src/components/payments/refunds/refunds-queries.ts` | new | 10 |
| `client/src/components/payments/refunds/refunds-helpers.test.ts` | new | 10 |
| `client/src/lib/role-access.ts` (+ `.test.ts`) | `REFUND_*` roles (10); `FROZEN_BALANCE_ACTION_ROLES` out (15) | 10, 15 |
| `client/src/components/payments/refunds/pending-dialogs.tsx` (+ `.test.ts`) | new | 11 |
| `client/src/components/payments/refunds/transfer-note.tsx` | new | 12 |
| `client/src/components/payments/refunds/refundable-drawer.tsx` (+ `.test.ts`) | new | 12 |
| `client/src/components/shared/change-status-dialog.tsx` | `initialStatus` prop | 12 |
| `client/src/components/payments/withdrawal-dialog.tsx` | transfer lock, scroll-safe | 12 |
| `client/src/components/payments/refund-dialog.tsx` (+ new `.test.ts`) | opens a request | 13 |
| `client/src/components/payments/refunds/refunds-tables.tsx` | new | 14 |
| `client/src/components/payments/refunds/refunds-page.tsx` (+ `.test.ts`) | new | 14 |
| `client/src/app/(dashboard)/payments/refunds/page.tsx` | new route | 14 |
| `client/src/components/payments/debt/debt-filter-bar.tsx` | `UrlSearchBox` extracted | 14 |
| `client/src/lib/payments-nav.ts`, `client/src/lib/nav-items.test.ts` | nav item (14); debt `activePrefixes` out (15) | 14, 15 |
| `client/src/lib/breadcrumb-routes.ts` | `refunds` (14); `history` in, `frozen-balances` out (15) | 14, 15 |
| `client/src/components/payments/refunds/refund-history-page.tsx` (+ `.test.ts`) | new | 15 |
| `client/src/app/(dashboard)/payments/refunds/history/page.tsx` | new route | 15 |
| `client/src/app/(dashboard)/payments/frozen-balances/page.tsx` | redirect | 15 |
| `client/src/components/payments/debt/frozen-balance-view.tsx` | deleted | 15 |
| `client/src/components/payments/debt/{debt-page.tsx,debt-page.test.ts,debt-url.ts,debt-url.test.ts,debt-subpages.test.ts}` | footer line, legacy redirect, tests | 15 |
| `client/src/qollanma/kontent/tolovlar/{pul-qaytarish.mdx,qaytariladigan-pul.mdx,qarzdorlik.mdx}`, `client/src/qollanma/kontent/boshlash/{rollar-va-huquqlar.mdx,lugat.mdx}` | guide | 16 |
| `client/src/qollanma/sahifalar/{tolovlar.ts,boshlash.ts}`, `client/src/qollanma/yangiliklar.ts` | registry, news | 16 |
| `client/CLAUDE.md` | Financial UI rows, role constants | 16 |

---

### Task 10: Types, URL state, queries, text helpers and role constants

**Files:**
- Create: `client/src/components/payments/refunds/refunds-types.ts`
- Create: `client/src/components/payments/refunds/refunds-url.ts`
- Create: `client/src/components/payments/refunds/refunds-format.ts`
- Create: `client/src/components/payments/refunds/refunds-queries.ts`
- Test: `client/src/components/payments/refunds/refunds-helpers.test.ts`
- Modify: `client/src/lib/role-access.ts`, `client/src/lib/role-access.test.ts`

**Interfaces:**
- Consumes (API contract §5, §8, §9): `RefundableListResponse`, `PendingRefundRow`, `RefundableRow`, `NoticeCell`, `TransferState`, `RefundableDrawer`, `RefundHistoryRow`; existing `cleanSearch` (`debt/debt-url.ts`), `dayMonth`, `instantDayMonth` (`debt/debt-format.ts`), `retryDrawer` (`debt/debt-queries.ts`), `readFilters` (`lib/url-filter-params.ts`).
- Produces:
  - types: `RefundableTab`, `REFUNDABLE_TABS`, `AgeBucket`, `AGE_BUCKETS`, `NoticeCell`, `TabTotal`, `RefundableRow`, `PendingRefundRow`, `CashAccountOption`, `RefundableListResponse`, `TransferState`, `DrawerStudent`, `RefundableDrawer`, `RefundHistoryRow`, `RefundHistoryResponse`, `RefundRowView`.
  - URL: `REFUNDS_SCHEMA`, `RefundsFilters`, `HISTORY_SCHEMA`, `refundsTab(f): RefundableTab`, `cleanRefundsFilters(f): RefundsFilters`, `readRefundsFilters(search: string): RefundsFilters`, `refundableListParams(f)`, `cleanHistoryPage(page, pageSize): { page; pageSize }`.
  - format: `Tone`, `TAB_LABEL`, `KIND_WORD`, `AGE_LABEL`, `AGE_STATE`, `ACCOUNT_TYPE_LABEL`, `TAB_RULE`, `PENDING_RULE`, `summaryLine(count)`, `tabSubline(tab, count, overThirty)`, `sinceText(since, days)`, `noticeText(n)`, `duePill(due): { text; tone }`, `pendingSumLine(sum, total)`, `pendingEmptyText(lastHandedOverAt)`, `accountOptions(accounts, branchId): { value; label }[]`, `cancelConsequence(amount)`, `transferLine(t): { allowed; text }`, `drawerKindLine(d)`, `requestDueLine(dueDate)`, `requestOpenedText(dueDate | null)`, `handedCell(row)`.
  - queries: `refundableListKey(branchId, params)`, `refundHistoryKey(branchId, page, pageSize)`, `keepWithinRefundTab(tab)`, `useRefundableList(f)`, `useRefundableStudent(id | null)`, `useRefundHistory(page, pageSize)`, `REFUND_QUERY_KEYS`, `invalidateRefunds(qc)`.
  - roles: `REFUND_REQUEST_ROLES`, `REFUND_HAND_OVER_ROLES`, `REFUND_CANCEL_ROLES`.

- [ ] **Step 1: Write the failing helper test**

`client/src/components/payments/refunds/refunds-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import {
  accountOptions, cancelConsequence, drawerKindLine, duePill, handedCell, noticeText, pendingEmptyText, pendingSumLine,
  requestDueLine, requestOpenedText, sinceText, tabSubline, transferLine,
} from "./refunds-format";
import { cleanHistoryPage, readRefundsFilters, refundableListParams } from "./refunds-url";

// Made-up figures only.
const money = (n: number) => `${formatNumber(n)} so'm`;

describe("pending «Holat» (spec §3.3)", () => {
  it("bank days left: muted, amber at 2 or fewer; the due day itself says so", () => {
    expect(duePill({ overdue: false, bankDays: 10 })).toEqual({ text: "10 bank kuni qoldi", tone: "muted" });
    expect(duePill({ overdue: false, bankDays: 3 }).tone).toBe("muted");
    expect(duePill({ overdue: false, bankDays: 2 })).toEqual({ text: "2 bank kuni qoldi", tone: "amber" });
    expect(duePill({ overdue: false, bankDays: 0 })).toEqual({ text: "bugun oxirgi kun", tone: "amber" });
  });

  it("overdue is red with the count; with 0 bank days (the weekend after a Friday) without it", () => {
    expect(duePill({ overdue: true, bankDays: 2 })).toEqual({ text: "muddati o'tdi · 2 bank kuni", tone: "red" });
    expect(duePill({ overdue: true, bankDays: 0 })).toEqual({ text: "muddati o'tdi", tone: "red" });
  });

  it("the header line and the empty block", () => {
    expect(pendingSumLine(1_240_000, 3)).toBe(`${money(1_240_000)} · 3 ta so'rov`);
    expect(pendingEmptyText(null)).toBe("Hozir kutilayotgan pul qaytarish yo'q.");
    expect(pendingEmptyText("2026-10-01T09:00:00Z")).toBe("Hozir kutilayotgan pul qaytarish yo'q. Oxirgisi 01.10 da berilgan.");
  });
});

describe("tab cells (spec §3.4)", () => {
  it("the tab buttons' small lines", () => {
    expect(tabSubline("muzlatilgan", 7, 4)).toBe("7 kishi · 4 tasi 30 kundan oshgan");
    expect(tabSubline("guruhsiz", 5, 4)).toBe("5 kishi · guruhga qo'shilmagan");
    expect(tabSubline("ketgan", 2, 4)).toBe("2 kishi · pulini olib ketmagan");
  });

  it("«dd.MM · N kun» and «Xabar»", () => {
    expect(sinceText("2026-09-15", 25)).toBe("15.09 · 25 kun");
    expect(noticeText(null)).toBe("berilmagan");
    expect(noticeText({ date: "2026-10-03", channel: "BOT" })).toBe("03.10 · bot orqali");
    expect(noticeText({ date: "2026-08-25", channel: "CALL" })).toBe("25.08 · qo'ng'iroq qilib aytildi");
  });
});

describe("dialogs and drawer", () => {
  it("«Qaysi kassadan» lists only the request's branch, type first", () => {
    const accounts = [
      { id: "a1", name: "Asosiy kassa", type: "CASH" as const, branchId: 1 },
      { id: "a2", name: "Hisob raqam", type: "BANK" as const, branchId: 1 },
      { id: "a3", name: "Boshqa filial kassasi", type: "CASH" as const, branchId: 2 },
    ];
    expect(accountOptions(accounts, 1)).toEqual([
      { value: "a1", label: "Naqd — Asosiy kassa" },
      { value: "a2", label: "Bank — Hisob raqam" },
    ]);
    expect(accountOptions(accounts, null)).toEqual([]);
  });

  it("the cancel consequence names the amount", () => {
    expect(cancelConsequence(490_000)).toBe(
      `Pul hali berilmagan. Bekor qilinsa, ${formatNumber(490_000)} so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.`,
    );
  });

  it("the transfer condition: the server's refusal while locked, the green line once open", () => {
    const refusal = "Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).";
    expect(transferLine({ notice: { date: "2026-10-10", channel: "BOT" }, termEnds: "2026-10-23", allowedFrom: "2026-11-22", allowed: false, refusal }))
      .toEqual({ allowed: false, text: refusal });
    expect(transferLine({ notice: { date: "2026-08-25", channel: "CALL" }, termEnds: "2026-09-08", allowedFrom: "2026-10-08", allowed: true, refusal: null }))
      .toEqual({ allowed: true, text: "Shart bajarilgan: xabar 25.08, muddat 08.09 da tugagan, 30 kun o'tdi." });
  });

  it("the drawer's «Holat»", () => {
    expect(drawerKindLine({ kind: "muzlatilgan", since: "2026-09-15", days: 25 })).toBe("Muzlatilgan · 15.09 · 25 kun");
    expect(drawerKindLine({ kind: null, since: null, days: null })).toBe("o'qiyapti");
  });

  it("the refund dialog's line and toast read the due date", () => {
    expect(requestDueLine("2026-10-23")).toBe(
      "So'rov ochilgach balans 0 bo'ladi. Pul 23.10 gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.",
    );
    expect(requestOpenedText("2026-10-23")).toBe("So'rov ochildi — pul 23.10 gacha beriladi");
    expect(requestOpenedText(null)).toBe("So'rov ochildi");
  });

  it("history «Berildi»: day and method, or the cancelled pill with its reason", () => {
    const base = { handedOverAt: "2026-09-24T06:00:00Z", cancelReason: null };
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: "CASH" })).toEqual({ cancelled: false, text: "24.09 · naqd" });
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: "TRANSFER" })).toEqual({ cancelled: false, text: "24.09 · karta" });
    expect(handedCell({ ...base, status: "COMPLETED", refundMethod: null })).toEqual({ cancelled: false, text: "24.09" });
    expect(handedCell({ status: "REJECTED", handedOverAt: null, refundMethod: null, cancelReason: "Guruhga qaytdi" }))
      .toEqual({ cancelled: true, reason: "Guruhga qaytdi" });
  });
});

describe("the URL and the request", () => {
  it("defaults: Muzlatilganlar, page 1 of 20, pending page 1 of 10", () => {
    expect(refundableListParams(readRefundsFilters(""))).toEqual({
      tab: "muzlatilgan", age: undefined, search: undefined, page: 1, pageSize: 20, pendingPage: 1, pendingPageSize: 10,
    });
  });

  it("the age chip only on Muzlatilganlar, only the server's values", () => {
    expect(refundableListParams(readRefundsFilters("age=over60")).age).toBe("over60");
    expect(refundableListParams(readRefundsFilters("tab=ketgan&age=over60")).age).toBeUndefined();
    expect(refundableListParams(readRefundsFilters("age=d90")).age).toBeUndefined();
  });

  it("a value the server would refuse falls back to its default", () => {
    expect(refundableListParams(readRefundsFilters("tab=xyz&page=0&pageSize=7&pendingPage=-2&pendingPageSize=60"))).toMatchObject({
      tab: "muzlatilgan", page: 1, pageSize: 20, pendingPage: 1, pendingPageSize: 10,
    });
    expect(refundableListParams(readRefundsFilters("search=%20%20ali%20")).search).toBe("ali");
    expect(refundableListParams(readRefundsFilters(`search=${"a".repeat(150)}`)).search).toHaveLength(100);
    expect(cleanHistoryPage(0, 15)).toEqual({ page: 1, pageSize: 10 });
    expect(cleanHistoryPage(3, 50)).toEqual({ page: 3, pageSize: 50 });
  });
});
```

- [ ] **Step 2: Add the failing role test**

In `client/src/lib/role-access.test.ts`, change the import list:

```ts
  GROUP_PAGE_ROLES,
  STUDENT_PROFILE_ROLES,
```

to

```ts
  GROUP_PAGE_ROLES,
  REFUND_CANCEL_ROLES,
  REFUND_HAND_OVER_ROLES,
  REFUND_REQUEST_ROLES,
  STUDENT_PROFILE_ROLES,
```

and append at the end of the file:

```ts

describe("«Qaytariladigan pul» amallari (spec B2b, refunds.controller.ts)", () => {
  it("so'rov ochish — POST /refunds/quick: kassirga yo'q", () => {
    expect(REFUND_REQUEST_ROLES).toEqual([CEO, BRANCH_DIRECTOR, ADMINISTRATOR]);
    expect(hasAnyRole(roles(CASHIER), REFUND_REQUEST_ROLES)).toBe(false);
  });

  it("«Berildi» — POST /refunds/:id/hand-over: kassir ham", () => {
    expect(REFUND_HAND_OVER_ROLES).toEqual([CEO, BRANCH_DIRECTOR, ADMINISTRATOR, CASHIER]);
  });

  it("bekor qilish — POST /refunds/:id/cancel: faqat CEO va filial direktori", () => {
    expect(hasAnyRole(roles(BRANCH_DIRECTOR), REFUND_CANCEL_ROLES)).toBe(true);
    expect(hasAnyRole(roles(ADMINISTRATOR), REFUND_CANCEL_ROLES)).toBe(false);
    expect(hasAnyRole(roles(CASHIER), REFUND_CANCEL_ROLES)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd client && npx vitest run src/components/payments/refunds/refunds-helpers.test.ts src/lib/role-access.test.ts`
Expected: FAIL — `Failed to resolve import "./refunds-format"`; the role test fails with `expected undefined to deeply equal [ 1, 2, 3 ]`.

- [ ] **Step 4: Write the types**

`client/src/components/payments/refunds/refunds-types.ts`:

```ts
/**
 * The server's shapes for «Qaytariladigan pul» (spec B2b §3–§5; the API contract
 * at the end of docs/superpowers/plans/2026-10-10-b2b-qaytariladigan-pul.md).
 * 'YYYY-MM-DD' is a Tashkent day, an ISO string an instant, money whole so'm.
 */
export type RefundableTab = "muzlatilgan" | "guruhsiz" | "ketgan";
export const REFUNDABLE_TABS: readonly RefundableTab[] = ["muzlatilgan", "guruhsiz", "ketgan"];
export type AgeBucket = "upto30" | "d31to60" | "over60";
export const AGE_BUCKETS: readonly AgeBucket[] = ["upto30", "d31to60", "over60"];

export interface NoticeCell { date: string; channel: "BOT" | "CALL" }
export interface TabTotal { total: number; count: number }

export interface RefundableRow {
  studentId: number; firstName: string; lastName: string; phone: string;
  balance: number; kind: RefundableTab; since: string; days: number; ageBucket: AgeBucket;
  lastGroup: { id: string; name: string } | null;
  notice: NoticeCell | null;
}

export interface PendingRefundRow {
  id: string; studentId: number; firstName: string; lastName: string; phone: string;
  /** The «Berildi» dialog lists the `cashAccounts` of this branch. */
  branchId: number | null;
  amount: number; requestedAt: string; dueDate: string;
  due: { overdue: boolean; bankDays: number };
  reason: string | null;
}

export interface CashAccountOption { id: string; name: string; type: "CASH" | "BANK" | "CARD"; branchId: number }

export interface RefundableListResponse {
  summary: TabTotal;
  tabs: Record<RefundableTab, TabTotal>;
  /** The frozen tab's age chips, whatever tab is open. */
  chips: { all: number } & Record<AgeBucket, number>;
  rows: { data: RefundableRow[]; total: number; page: number; pageSize: number };
  pending: {
    data: PendingRefundRow[]; total: number; sum: number; page: number; pageSize: number;
    historyCount: number; lastHandedOverAt: string | null;
  };
  cashAccounts: CashAccountOption[];
}

/** `refusal` is the exact 400 text `POST /withdrawals` would answer. */
export interface TransferState {
  notice: NoticeCell | null; termEnds: string | null; allowedFrom: string | null;
  allowed: boolean; refusal: string | null;
}

export interface DrawerStudent { id: number; firstName: string; lastName: string; phone: string; status: string; branchId: number | null }

export interface RefundableDrawer {
  student: DrawerStudent;
  balance: number;
  /** null = studying now. */
  kind: RefundableTab | null;
  since: string | null; days: number | null;
  lastGroup: { id: string; name: string } | null;
  lastPayment: { createdAt: string; amount: number } | null;
  telegramLinked: boolean;
  /** The exact bot text «Botga xabar yuborish» would send; null = no branch or company phone. */
  noticePreview: string | null;
  transfer: TransferState;
}

export interface RefundHistoryRow {
  id: string;
  student: { id: number; firstName: string; lastName: string; phone: string };
  amount: number;
  status: "REQUESTED" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED";
  reason: string | null;
  requestedAt: string; dueDate: string | null;
  /** Pre-B2b rows: their `processedAt`. */
  handedOverAt: string | null;
  refundMethod: string | null;
  cancelledAt: string | null; cancelReason: string | null;
  closedBy: { id: number; name: string } | null;
}
export interface RefundHistoryResponse { data: RefundHistoryRow[]; total: number; page: number; pageSize: number }

/** The fields of the Refund row (`POST /refunds/quick`) the client reads. */
export interface RefundRowView { id: string; status: "REQUESTED" | "COMPLETED" | "REJECTED"; requestedAmount: number; dueDate: string | null }
```

- [ ] **Step 5: Write the URL state**

`client/src/components/payments/refunds/refunds-url.ts`:

```ts
import { readFilters } from "@/lib/url-filter-params";
import { cleanSearch } from "../debt/debt-url";
import { AGE_BUCKETS, REFUNDABLE_TABS, type AgeBucket, type RefundableTab } from "./refunds-types";

/** The page's URL (spec §3.3–3.4): the API's own query names, so the request is the URL. */
export const REFUNDS_SCHEMA = {
  tab: { type: "string", defaultValue: "muzlatilgan" },
  age: { type: "string", defaultValue: "" },
  search: { type: "string", defaultValue: "" },
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 20 },
  pendingPage: { type: "number", defaultValue: 1 },
  pendingPageSize: { type: "number", defaultValue: 10 },
} as const;

export interface RefundsFilters {
  tab: string; age: string; search: string;
  page: number; pageSize: number; pendingPage: number; pendingPageSize: number;
}

/** `/payments/refunds/history` — page size 10 by default (the table rule). */
export const HISTORY_SCHEMA = {
  page: { type: "number", defaultValue: 1 },
  pageSize: { type: "number", defaultValue: 10 },
} as const;

const PAGE_SIZES = [10, 20, 30, 40, 50];
const pageOf = (n: number) => (Number.isInteger(n) && n >= 1 ? n : 1);
const sizeOf = (n: number, fallback: number) => (PAGE_SIZES.includes(n) ? n : fallback);

export const refundsTab = (f: Pick<RefundsFilters, "tab">): RefundableTab =>
  (REFUNDABLE_TABS as readonly string[]).includes(f.tab) ? (f.tab as RefundableTab) : "muzlatilgan";

/** Every value the server would refuse replaced by its default: an old bookmark opens the list, never a 400. The age chip lives only on Muzlatilganlar. */
export function cleanRefundsFilters(f: RefundsFilters): RefundsFilters {
  const tab = refundsTab(f);
  return {
    tab,
    age: tab === "muzlatilgan" && (AGE_BUCKETS as readonly string[]).includes(f.age) ? f.age : "",
    search: cleanSearch(f.search),
    page: pageOf(f.page),
    pageSize: sizeOf(f.pageSize, 20),
    pendingPage: pageOf(f.pendingPage),
    pendingPageSize: sizeOf(f.pendingPageSize, 10),
  };
}

export const readRefundsFilters = (search: string) =>
  cleanRefundsFilters(readFilters(REFUNDS_SCHEMA, new URLSearchParams(search)) as unknown as RefundsFilters);

/** `GET /refundable/list` query. */
export function refundableListParams(filters: RefundsFilters) {
  const f = cleanRefundsFilters(filters);
  return {
    tab: f.tab as RefundableTab,
    age: (f.age || undefined) as AgeBucket | undefined,
    search: f.search || undefined,
    page: f.page, pageSize: f.pageSize, pendingPage: f.pendingPage, pendingPageSize: f.pendingPageSize,
  };
}

export const cleanHistoryPage = (page: number, pageSize: number) => ({ page: pageOf(page), pageSize: sizeOf(pageSize, 10) });
```

- [ ] **Step 6: Write the text helpers**

`client/src/components/payments/refunds/refunds-format.ts`:

```ts
import { formatNumber, formatPrice } from "@/lib/format-utils";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import type {
  AgeBucket, CashAccountOption, NoticeCell, PendingRefundRow, RefundableDrawer, RefundableTab, RefundHistoryRow, TransferState,
} from "./refunds-types";

export type Tone = "muted" | "amber" | "red";

export const TAB_LABEL: Record<RefundableTab, string> = { muzlatilgan: "Muzlatilganlar", guruhsiz: "Guruhsiz", ketgan: "Ketganlar" };
/** The kind in one word — the drawer's «Holat» and the tab tables' since-column head. */
export const KIND_WORD: Record<RefundableTab, string> = { muzlatilgan: "Muzlatilgan", guruhsiz: "Guruhsiz", ketgan: "Ketgan" };
/** The age chips (spec §3.4); «Hammasi» is the empty value. */
export const AGE_LABEL: Record<AgeBucket, string> = { upto30: "30 kungacha", d31to60: "31–60 kun", over60: "60 kundan ko'p" };
/** The frozen tab's «Holat»: the same buckets as the chips. */
export const AGE_STATE: Record<AgeBucket, { text: string; tone: Tone }> = {
  upto30: { text: "kutilmoqda", tone: "muted" },
  d31to60: { text: "muddati o'tgan", tone: "amber" },
  over60: { text: "ketgan hisoblanadi", tone: "red" },
};
export const ACCOUNT_TYPE_LABEL: Record<CashAccountOption["type"], string> = { CASH: "Naqd", BANK: "Bank", CARD: "Karta" };

/** The line under the tab buttons — the mock-up's texts. */
export const TAB_RULE: Record<RefundableTab, string> = {
  muzlatilgan: "Muzlatilgan o'quvchilarning puli kelishilgan qaytish sanasigacha hisobida turadi. 30 kundan oshgani — shartnoma muddati o'tgan; 60 kundan oshgani tizimda ketgan hisoblanadi.",
  guruhsiz: "Statusi faol, lekin hech qaysi guruhda o'qimayotganlar. Guruhga qo'shilsa, pul oylik hisobiga o'tadi.",
  ketgan: "Ketgan, lekin balansida puli qolganlar. Pul so'rov bilan qaytariladi yoki xabar berilgach, muddat o'tganda markaz hisobiga o'tadi.",
};

export const PENDING_RULE =
  "So'rov ochilgan kuni o'quvchi balansi 0 bo'ladi. Pul kassadan «Berildi» bosilganda chiqadi. Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).";

export const summaryLine = (count: number) => `${formatNumber(count)} kishi — muzlatilgan, guruhsiz yoki ketgan`;

/** A tab button's small line; `overThirty` = chips 31–60 + over 60. */
export function tabSubline(tab: RefundableTab, count: number, overThirty: number): string {
  const people = `${formatNumber(count)} kishi`;
  if (tab === "muzlatilgan") return `${people} · ${formatNumber(overThirty)} tasi 30 kundan oshgan`;
  return tab === "guruhsiz" ? `${people} · guruhga qo'shilmagan` : `${people} · pulini olib ketmagan`;
}

/** «dd.MM · N kun». */
export const sinceText = (since: string, days: number) => `${dayMonth(since)} · ${formatNumber(days)} kun`;

/** «Xabar»: the latest valid notice. */
export function noticeText(n: NoticeCell | null): string {
  if (!n) return "berilmagan";
  return `${dayMonth(n.date)} · ${n.channel === "BOT" ? "bot orqali" : "qo'ng'iroq qilib aytildi"}`;
}

/**
 * The pending «Holat» pill: amber from 2 bank days left. On the due day itself
 * (0 left, not yet overdue) «bugun oxirgi kun»; overdue with 0 bank days (the
 * weekend right after a Friday due day) prints no count.
 */
export function duePill(due: PendingRefundRow["due"]): { text: string; tone: Tone } {
  if (due.overdue) return { text: due.bankDays > 0 ? `muddati o'tdi · ${formatNumber(due.bankDays)} bank kuni` : "muddati o'tdi", tone: "red" };
  if (due.bankDays === 0) return { text: "bugun oxirgi kun", tone: "amber" };
  return { text: `${formatNumber(due.bankDays)} bank kuni qoldi`, tone: due.bankDays <= 2 ? "amber" : "muted" };
}

export const pendingSumLine = (sum: number, total: number) => `${formatPrice(sum)} so'm · ${formatNumber(total)} ta so'rov`;

export const pendingEmptyText = (lastHandedOverAt: string | null) =>
  `Hozir kutilayotgan pul qaytarish yo'q.${lastHandedOverAt ? ` Oxirgisi ${instantDayMonth(lastHandedOverAt)} da berilgan.` : ""}`;

/** «Qaysi kassadan»: the accounts of the request's branch, «Naqd — Asosiy kassa». */
export const accountOptions = (accounts: CashAccountOption[], branchId: number | null) =>
  accounts.filter((a) => a.branchId === branchId).map((a) => ({ value: a.id, label: `${ACCOUNT_TYPE_LABEL[a.type]} — ${a.name}` }));

export const cancelConsequence = (amount: number) =>
  `Pul hali berilmagan. Bekor qilinsa, ${formatPrice(amount)} so'm o'quvchi balansiga qaytadi, bekor qilingan darslar ham joyiga qaytadi.`;

/** The transfer condition (spec §5.2): the server's refusal while locked, the green line once open. */
export function transferLine(t: TransferState): { allowed: boolean; text: string } {
  if (!t.allowed) return { allowed: false, text: t.refusal ?? "" };
  if (!t.notice || !t.termEnds) return { allowed: true, text: "" };
  return { allowed: true, text: `Shart bajarilgan: xabar ${dayMonth(t.notice.date)}, muddat ${dayMonth(t.termEnds)} da tugagan, 30 kun o'tdi.` };
}

/** The drawer's «Holat»: «Muzlatilgan · 15.09 · 25 kun»; «o'qiyapti» when the student studies again. */
export function drawerKindLine(d: Pick<RefundableDrawer, "kind" | "since" | "days">): string {
  if (!d.kind) return "o'qiyapti";
  return d.since && d.days !== null ? `${KIND_WORD[d.kind]} · ${sinceText(d.since, d.days)}` : KIND_WORD[d.kind];
}

/** The refund dialog's line (spec §4), from the preview's `dueDate`. */
export const requestDueLine = (dueDate: string) =>
  `So'rov ochilgach balans 0 bo'ladi. Pul ${dayMonth(dueDate)} gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.`;

/** The success toast (spec §4), from the answer's `dueDate`. */
export const requestOpenedText = (dueDate: string | null) =>
  dueDate ? `So'rov ochildi — pul ${dayMonth(dueDate)} gacha beriladi` : "So'rov ochildi";

/** History «Berildi»: «dd.MM · naqd|karta», or the «bekor qilindi» pill with the reason. */
export function handedCell(r: Pick<RefundHistoryRow, "status" | "handedOverAt" | "refundMethod" | "cancelReason">):
  { cancelled: true; reason: string | null } | { cancelled: false; text: string } {
  if (r.status === "REJECTED") return { cancelled: true, reason: r.cancelReason };
  if (!r.handedOverAt) return { cancelled: false, text: "—" };
  const day = instantDayMonth(r.handedOverAt);
  if (!r.refundMethod) return { cancelled: false, text: day };
  return { cancelled: false, text: `${day} · ${r.refundMethod === "CASH" ? "naqd" : "karta"}` };
}
```

- [ ] **Step 7: Write the queries**

`client/src/components/payments/refunds/refunds-queries.ts`:

```ts
"use client";

import { keepPreviousData, useQuery, type QueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { retryDrawer } from "../debt/debt-queries";
import { refundableListParams, type RefundsFilters } from "./refunds-url";
import type { RefundableDrawer, RefundableListResponse, RefundableTab, RefundHistoryResponse } from "./refunds-types";

export const refundableListKey = (branchId: number | undefined, params: ReturnType<typeof refundableListParams>) =>
  ["refundable-list", branchId, params] as const;
export const refundHistoryKey = (branchId: number | undefined, page: number, pageSize: number) =>
  ["refund-history", branchId, page, pageSize] as const;

/**
 * The summary, the pending block, the tab totals and the pager stay on screen
 * while the next page, chip or search of the SAME tab loads. Another tab has
 * other columns, so a tab switch drops only the rows (skeleton).
 */
export const keepWithinRefundTab = (tab: RefundableTab) =>
  (prev: RefundableListResponse | undefined, prevQuery?: { queryKey: ReturnType<typeof refundableListKey> }) =>
    !prev || prevQuery?.queryKey[2].tab === tab ? prev : { ...prev, rows: { ...prev.rows, data: [], total: 0 } };

export function useRefundableList(f: RefundsFilters) {
  const { selectedBranch } = useBranchSwitcher();
  const params = refundableListParams(f);
  return useQuery({
    queryKey: refundableListKey(selectedBranch?.id, params),
    queryFn: () => api.get<RefundableListResponse>("/refundable/list", { params }).then((r) => r.data),
    placeholderData: keepWithinRefundTab(params.tab),
    // «Bugungi holat»: a hand-over at another desk shows on return.
    staleTime: 0,
  });
}

export function useRefundableStudent(id: number | null) {
  return useQuery({
    queryKey: ["refundable-student", id],
    queryFn: () => api.get<RefundableDrawer>(`/refundable/students/${id}`).then((r) => r.data),
    enabled: id !== null,
    staleTime: 0,
    retry: retryDrawer,
  });
}

export function useRefundHistory(page: number, pageSize: number) {
  const { selectedBranch } = useBranchSwitcher();
  return useQuery({
    queryKey: refundHistoryKey(selectedBranch?.id, page, pageSize),
    queryFn: () =>
      api.get<RefundHistoryResponse>("/refunds", { params: { status: "COMPLETED,REJECTED", page, pageSize } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

/** Every key a request, a hand-over, a cancel, a notice or a transfer moves (financial data never updates optimistically). */
export const REFUND_QUERY_KEYS = [
  "refundable-list", "refundable-student", "refund-history", "financial-overview", "student-payments", "debt-list", "debt-student",
] as const;

export function invalidateRefunds(qc: QueryClient) {
  for (const key of REFUND_QUERY_KEYS) qc.invalidateQueries({ queryKey: [key] });
}
```

- [ ] **Step 8: Add the role constants**

In `client/src/lib/role-access.ts`, right after the `FROZEN_BALANCE_ACTION_ROLES` line (it is removed in Task 15), insert:

```ts

/**
 * `POST /refunds/quick` — refunds.controller.ts: pulni qaytarish so'rovini ochish
 * (spec B2b §1). «Qaytariladigan pul» oynasining qolgan amallari ham shu ro'yxat
 * bilan ochiladi, chunki ularning `@Roles`i bir xil: `POST /students/:id/balance-notices`
 * (xabar berish), `POST /withdrawals` (markaz hisobiga o'tkazish), `PATCH /students/:id/status`
 * va `POST /students/:id/enroll` (students.controller.ts). Kassir yo'q.
 */
export const REFUND_REQUEST_ROLES = [1, 2, 3];

/** `POST /refunds/:id/hand-over` — refunds.controller.ts («Berildi»). Kassir ham. */
export const REFUND_HAND_OVER_ROLES = [1, 2, 3, 5];

/** `POST /refunds/:id/cancel` — refunds.controller.ts. Faqat CEO va filial direktori. */
export const REFUND_CANCEL_ROLES = [1, 2];
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/components/payments/refunds/refunds-helpers.test.ts src/lib/role-access.test.ts`
Expected: PASS (both files).

- [ ] **Step 10: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refunds src/lib/role-access.ts src/lib/role-access.test.ts`
Expected: no output from either.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/payments/refunds/refunds-types.ts client/src/components/payments/refunds/refunds-url.ts \
  client/src/components/payments/refunds/refunds-format.ts client/src/components/payments/refunds/refunds-queries.ts \
  client/src/components/payments/refunds/refunds-helpers.test.ts client/src/lib/role-access.ts client/src/lib/role-access.test.ts
git commit -m "$(cat <<'EOF'
feat(refunds): client types, URL state, queries and text helpers

The refundable money page (spec B2b) reads one list, one drawer and the
history; every pill, date and line is formatted from the server's fields.
Role constants for opening, handing over and cancelling a refund request.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: «Berildi» and «Bekor qilish» dialogs

**Files:**
- Create: `client/src/components/payments/refunds/pending-dialogs.tsx`
- Test: `client/src/components/payments/refunds/pending-dialogs.test.ts`

**Interfaces:**
- Consumes: API contract §3 `POST /refunds/:id/hand-over { cashAccountId }`, §4 `POST /refunds/:id/cancel { reason }`; Task 10 `PendingRefundRow`, `CashAccountOption`, `accountOptions`, `cancelConsequence`, `invalidateRefunds`.
- Produces: `HandOverDialog({ target: PendingRefundRow; accounts: CashAccountOption[]; onClose: () => void })`, `CancelRefundDialog({ target: PendingRefundRow; onClose: () => void })` — both always open; the page mounts them only while a target is set.

- [ ] **Step 1: Write the failing test**

`client/src/components/payments/refunds/pending-dialogs.test.ts`:

```ts
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { formatNumber } from "@/lib/format-utils";

// A dialog's content renders in a portal, and only while open; draw it inline.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogDescription: Pass, DialogFooter: Pass };
});

import { CancelRefundDialog, HandOverDialog } from "./pending-dialogs";
import type { PendingRefundRow } from "./refunds-types";

// Made-up names and figures.
const TARGET: PendingRefundRow = {
  id: "r1", studentId: 10002, firstName: "Vali", lastName: "Aliyev", phone: "931234567", branchId: 1,
  amount: 620_000, requestedAt: "2026-10-09T06:00:00Z", dueDate: "2026-10-23", due: { overdue: false, bankDays: 9 }, reason: null,
};
const ACCOUNT = { id: "a1", name: "Asosiy kassa", type: "CASH" as const, branchId: 1 };

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const wrap = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, el));
const num = (n: number) => norm(formatNumber(n));
const noop = () => {};
const disabledButton = (raw: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>(?:(?!</button>).)*${label}`).test(raw);

describe("«Berildi» dialog (spec §3.3)", () => {
  it("names the request, the amount, the drawer field and the note", () => {
    const text = norm(wrap(createElement(HandOverDialog, { target: TARGET, accounts: [ACCOUNT], onClose: noop })));
    expect(text).toContain("Pul berildi");
    expect(text).toContain("Vali Aliyev · so'rov 09.10 · muddat 23.10");
    expect(text).toContain(`Berilgan summa ${num(620_000)} so'm`);
    expect(text).toContain("Qaysi kassadan");
    expect(text).toContain("Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.");
    expect(text).toContain("Yopish Berildi");
  });

  it("one account is picked for you; none in the branch says so and keeps «Berildi» shut", () => {
    expect(disabledButton(wrap(createElement(HandOverDialog, { target: TARGET, accounts: [ACCOUNT], onClose: noop })), "Berildi")).toBe(false);
    const raw = wrap(createElement(HandOverDialog, { target: TARGET, accounts: [{ ...ACCOUNT, branchId: 2 }], onClose: noop }));
    expect(norm(raw)).toContain("O'quvchining filialida kassa topilmadi");
    expect(disabledButton(raw, "Berildi")).toBe(true);
  });
});

describe("«Bekor qilish» dialog (spec §3.3)", () => {
  it("states the consequence and asks for a reason before the red button opens", () => {
    const raw = wrap(createElement(CancelRefundDialog, { target: TARGET, onClose: noop }));
    const text = norm(raw);
    expect(text).toContain("So'rovni bekor qilish");
    expect(text).toContain(`Vali Aliyev · ${num(620_000)} so'm`);
    expect(text).toContain(`Bekor qilinsa, ${num(620_000)} so'm o'quvchi balansiga qaytadi`);
    expect(text).toContain("Sabab");
    expect(disabledButton(raw, "Bekor qilish")).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run src/components/payments/refunds/pending-dialogs.test.ts`
Expected: FAIL — `Failed to resolve import "./pending-dialogs"`.

- [ ] **Step 3: Write the dialogs**

`client/src/components/payments/refunds/pending-dialogs.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import { accountOptions, cancelConsequence } from "./refunds-format";
import { invalidateRefunds } from "./refunds-queries";
import type { CashAccountOption, PendingRefundRow } from "./refunds-types";

// Fixed header and footer, the body is the only scroll container (dialog scroll-safety rule).
const SHELL = "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md";

/** «Berildi» (spec §2.3, §3.3): the money leaves the drawer the caller picks — an account of the student's branch. */
export function HandOverDialog({ target, accounts, onClose }: {
  target: PendingRefundRow; accounts: CashAccountOption[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const options = accountOptions(accounts, target.branchId);
  const [accountId, setAccountId] = useState(options.length === 1 ? options[0].value : "");
  const save = useMutation({
    mutationFn: () => api.post(`/refunds/${target.id}/hand-over`, { cashAccountId: accountId }),
    onSuccess: () => {
      toast.success("Pul berildi");
      invalidateRefunds(qc);
      onClose();
    },
    // A refusal may mean another desk closed the request meanwhile: the list follows the fresh state.
    onError: (e) => {
      toast.error(getErrorMessage(e, "Saqlashda xatolik yuz berdi"));
      invalidateRefunds(qc);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className={SHELL}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Pul berildi</DialogTitle>
          <DialogDescription>
            {`${target.firstName} ${target.lastName} · so'rov ${instantDayMonth(target.requestedAt)} · muddat ${dayMonth(target.dueDate)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <div className="flex items-center justify-between border-b pb-2 font-medium">
            <span>Berilgan summa</span>
            <span className="tabular-nums">{formatBalance(target.amount)}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ho-account">Qaysi kassadan</Label>
            {options.length === 0 ? (
              <p className="text-destructive">O'quvchining filialida kassa topilmadi</p>
            ) : (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="ho-account" className="w-full"><SelectValue placeholder="Kassani tanlang" /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.</p>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Yopish</Button>
          <Button onClick={() => save.mutate()} disabled={!accountId || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Berildi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Bekor qilish» (spec §2.4, §3.3): only before the hand-over; the money and the cancelled lessons go back. */
export function CancelRefundDialog({ target, onClose }: { target: PendingRefundRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => api.post(`/refunds/${target.id}/cancel`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success("So'rov bekor qilindi — pul balansga qaytdi");
      invalidateRefunds(qc);
      onClose();
    },
    onError: (e) => {
      toast.error(getErrorMessage(e, "Bekor qilishda xatolik yuz berdi"));
      invalidateRefunds(qc);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className={SHELL}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>So'rovni bekor qilish</DialogTitle>
          <DialogDescription>{`${target.firstName} ${target.lastName} · ${formatBalance(target.amount)}`}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <p>{cancelConsequence(target.amount)}</p>
          <div className="space-y-2">
            <Label htmlFor="rc-reason">Sabab</Label>
            <Textarea id="rc-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
              placeholder="Masalan: o'quvchi guruhga qaytdi" />
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Yopish</Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={!reason.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Bekor qilish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd client && npx vitest run src/components/payments/refunds/pending-dialogs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refunds/pending-dialogs.tsx src/components/payments/refunds/pending-dialogs.test.ts`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/payments/refunds/pending-dialogs.tsx client/src/components/payments/refunds/pending-dialogs.test.ts
git commit -m "$(cat <<'EOF'
feat(refunds): hand-over and cancel dialogs for pending requests

«Berildi» picks an account of the student's branch from the list's
cashAccounts; «Bekor qilish» needs a reason and states what goes back.
Both refetch every refund and money key, never optimistically.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The drawer, the notice, and the transfer lock in «Yechib olish»

**Files:**
- Create: `client/src/components/payments/refunds/transfer-note.tsx`
- Create: `client/src/components/payments/refunds/refundable-drawer.tsx`
- Test: `client/src/components/payments/refunds/refundable-drawer.test.ts`
- Modify: `client/src/components/shared/change-status-dialog.tsx` (`initialStatus`)
- Modify: `client/src/components/payments/withdrawal-dialog.tsx` (lock, scroll-safe, invalidation)

**Interfaces:**
- Consumes: API contract §9 `GET /refundable/students/:id` → `RefundableDrawer`, §11 `POST /students/:id/balance-notices { channel: 'BOT' | 'CALL'; note? }`, §12 `GET /withdrawals/preview/:studentId` → `+ transfer: TransferState`; Task 10 `useRefundableStudent`, `invalidateRefunds`, `drawerKindLine`, `noticeText`, `transferLine`, `DrawerStudent`, `RefundableDrawer`, `TransferState`.
- Produces:
  - `type DrawerAction = "return" | "enroll" | "refund" | "transfer"`.
  - `RefundableDrawer({ studentId: number | null; canAct: boolean; onClose: () => void; onAction: (kind: DrawerAction, student: DrawerStudent) => void })`.
  - `RefundableDrawerBody({ drawer: RefundableDrawer; canAct: boolean; onAction: (kind: DrawerAction) => void })` (exported for tests).
  - `TransferNote({ transfer: TransferState })`.
  - `ChangeStatusDialog` optional prop `initialStatus?: string` (read on mount).

- [ ] **Step 1: Write the failing test**

`client/src/components/payments/refunds/refundable-drawer.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/format-utils";
import { RefundableDrawerBody } from "./refundable-drawer";
import { TransferNote } from "./transfer-note";
import type { RefundableDrawer, TransferState } from "./refunds-types";

// Made-up names and figures; the refusal is the server's own text.
const LOCKED: TransferState = {
  notice: null, termEnds: null, allowedFrom: null, allowed: false,
  refusal: "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.",
};
const OPEN: TransferState = { notice: { date: "2026-08-25", channel: "CALL" }, termEnds: "2026-09-08", allowedFrom: "2026-10-08", allowed: true, refusal: null };
const DRAWER: RefundableDrawer = {
  student: { id: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233", status: "FROZEN", branchId: 1 },
  balance: 350_000, kind: "muzlatilgan", since: "2026-09-15", days: 25,
  lastGroup: { id: "g1", name: "B1-02" }, lastPayment: { createdAt: "2026-08-12T06:00:00Z", amount: 450_000 },
  telegramLinked: true, noticePreview: "Assalomu alaykum, Ali! Sinov matni.", transfer: LOCKED,
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const num = (n: number) => norm(formatNumber(n));
const noop = () => {};
const html = (over: Partial<RefundableDrawer> = {}, canAct = true) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
    createElement(RefundableDrawerBody, { drawer: { ...DRAWER, ...over }, canAct, onAction: noop })));
const disabledButton = (raw: string, label: string) => new RegExp(`<button[^>]*\\sdisabled=""[^>]*>(?:(?!</button>).)*${label}`).test(raw);

describe("RefundableDrawerBody (spec §3.5)", () => {
  it("prints the money and the five facts", () => {
    const text = norm(html());
    expect(text).toContain(`Markazdagi puli ${num(350_000)} so'm`);
    expect(text).toContain("Holat Muzlatilgan · 15.09 · 25 kun");
    expect(text).toContain("Oxirgi guruh B1-02");
    expect(text).toContain(`Oxirgi to'lov 12.08 · ${num(450_000)}`);
    expect(text).toContain("Telegram bot ulangan");
    expect(text).toContain("Xabar berilmagan");
  });

  it("the first option follows the kind: «Qaytdi» for frozen, «Guruhga qo'shish» for ungrouped, none for departed", () => {
    expect(norm(html())).toContain("Qaytdi — guruhga qaytarish Pul oyning qolgan darslari hisobiga o'tadi. Qaytarish");
    const ungrouped = norm(html({ kind: "guruhsiz" }));
    expect(ungrouped).toContain("Guruhga qo'shish Pul shu oyning qolgan darslari hisobiga o'tadi. Guruh tanlash");
    expect(ungrouped).not.toContain("Qaytdi");
    const left = norm(html({ kind: "ketgan" }));
    expect(left).not.toContain("Qaytdi");
    expect(left).not.toContain("Guruh tanlash");
    expect(left).toContain("Pulni o'quvchiga qaytarish So'rov ochiladi: balans 0 bo'ladi, pul 10 bank kuni ichida beriladi. Qaytarishni boshlash");
  });

  it("a linked chat sees the server's bot text and both buttons; an unlinked one only the call mark", () => {
    const linked = norm(html());
    expect(linked).toContain("Assalomu alaykum, Ali! Sinov matni.");
    expect(linked).toContain("Botga xabar yuborish Qo'ng'iroq qilib aytildi");
    const unlinked = norm(html({ telegramLinked: false }));
    expect(unlinked).not.toContain("Botga xabar yuborish");
    expect(unlinked).not.toContain("Sinov matni");
    expect(unlinked).toContain("Qo'ng'iroq qilib aytildi");
    expect(unlinked).toContain("Bot ulanmagan — qo'ng'iroq qiling va belgilang.");
  });

  it("no branch phone: the bot button is shut and says why", () => {
    const raw = html({ noticePreview: null });
    expect(norm(raw)).toContain("Filial telefon raqami kiritilmagan");
    expect(disabledButton(raw, "Botga xabar yuborish")).toBe(true);
  });

  it("the transfer is locked with the server's refusal; once open, the green line and a live button", () => {
    const locked = html();
    expect(norm(locked)).toContain(LOCKED.refusal!);
    expect(disabledButton(locked, "O&#x27;tkazish")).toBe(true);
    const open = html({ transfer: OPEN });
    expect(norm(open)).toContain("Shart bajarilgan: xabar 25.08, muddat 08.09 da tugagan, 30 kun o'tdi.");
    expect(norm(open)).toContain("Xabar 25.08 · qo'ng'iroq qilib aytildi");
    expect(disabledButton(open, "O&#x27;tkazish")).toBe(false);
  });

  it("a cashier reads the facts only: no options at all", () => {
    const text = norm(html({}, false));
    expect(text).toContain("Markazdagi puli");
    for (const s of ["Nima qilish mumkin", "Pulni o'quvchiga qaytarish", "Xabar berish", "Markaz hisobiga o'tkazish"]) expect(text).not.toContain(s);
  });
});

describe("TransferNote — the same line in «Yechib olish»", () => {
  it("amber refusal, green condition, nothing when the server gave no text", () => {
    expect(norm(renderToStaticMarkup(createElement(TransferNote, { transfer: LOCKED })))).toContain("Avval o'quvchiga xabar bering.");
    expect(norm(renderToStaticMarkup(createElement(TransferNote, { transfer: OPEN })))).toContain("Shart bajarilgan:");
    expect(renderToStaticMarkup(createElement(TransferNote, { transfer: { ...LOCKED, refusal: null } }))).toBe("");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run src/components/payments/refunds/refundable-drawer.test.ts`
Expected: FAIL — `Failed to resolve import "./refundable-drawer"`.

- [ ] **Step 3: Write `TransferNote`**

`client/src/components/payments/refunds/transfer-note.tsx`:

```tsx
import { CircleCheck, Lock } from "lucide-react";
import { transferLine } from "./refunds-format";
import type { TransferState } from "./refunds-types";

/** «Markaz hisobiga o'tkazish» condition (spec §5.2), in the drawer and in «Yechib olish» alike. */
export function TransferNote({ transfer }: { transfer: TransferState }) {
  const { allowed, text } = transferLine(transfer);
  if (!text) return null;
  if (allowed) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
        <CircleCheck className="mt-0.5 size-3.5 shrink-0" />{text}
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <Lock className="mt-0.5 size-3.5 shrink-0" />{text}
    </p>
  );
}
```

- [ ] **Step 4: Write the drawer**

`client/src/components/payments/refunds/refundable-drawer.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Phone, Send } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { formatBalance, formatPhone, formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { instantDayMonth } from "../debt/debt-format";
import { drawerKindLine, noticeText } from "./refunds-format";
import { invalidateRefunds, useRefundableStudent } from "./refunds-queries";
import { TransferNote } from "./transfer-note";
import type { DrawerStudent, RefundableDrawer as DrawerData } from "./refunds-types";

/** What a drawer option opens (spec §3.5). The page closes the drawer first, then opens the dialog. */
export type DrawerAction = "return" | "enroll" | "refund" | "transfer";

/** Row click on «Qaytariladigan pul» (spec §3.5). `canAct` = REFUND_REQUEST_ROLES: a cashier reads the facts only. */
export function RefundableDrawer({ studentId, canAct, onClose, onAction }: {
  studentId: number | null; canAct: boolean; onClose: () => void; onAction: (kind: DrawerAction, student: DrawerStudent) => void;
}) {
  const { data, isPending, isError, error } = useRefundableStudent(studentId);
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the name clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">{data ? `${data.student.firstName} ${data.student.lastName}` : "O'quvchi"}</SheetTitle>
            <SheetDescription>{data ? `ID ${data.student.id} · ${formatPhone(data.student.phone)}` : "Yuklanmoqda…"}</SheetDescription>
          </div>
        </SheetHeader>
        {isError ? (
          // Another branch's student: the server names the branch to switch to (ADR-0063).
          <p className="p-6 text-sm text-muted-foreground">{getErrorMessage(error, "Ma'lumotni yuklab bo'lmadi")}</p>
        ) : isPending || !data ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <RefundableDrawerBody key={data.student.id} drawer={data} canAct={canAct} onAction={(kind) => onAction(kind, data.student)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-right">{children}</span>
  </div>
);

const Option = ({ title, hint, locked = false, children }: { title: string; hint: string; locked?: boolean; children: ReactNode }) => (
  <div className={cn("space-y-2 rounded-lg border p-3", locked && "bg-muted/40")}>
    <p className="font-medium">{title}</p>
    <p className="text-xs text-muted-foreground">{hint}</p>
    {children}
  </div>
);

export function RefundableDrawerBody({ drawer: d, canAct, onAction }: {
  drawer: DrawerData; canAct: boolean; onAction: (kind: DrawerAction) => void;
}) {
  return (
    <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
      <div className="rounded-lg bg-muted/50 px-4 py-3">
        <p className="text-xs text-muted-foreground">Markazdagi puli</p>
        <p className="text-2xl font-bold tabular-nums">{formatBalance(d.balance)}</p>
      </div>
      <div>
        <Fact label="Holat">{drawerKindLine(d)}</Fact>
        <Fact label="Oxirgi guruh">{d.lastGroup?.name ?? "—"}</Fact>
        <Fact label="Oxirgi to'lov">{d.lastPayment ? `${instantDayMonth(d.lastPayment.createdAt)} · ${formatPrice(d.lastPayment.amount)}` : "—"}</Fact>
        <Fact label="Telegram bot">{d.telegramLinked ? "ulangan" : "ulanmagan"}</Fact>
        <Fact label="Xabar">{noticeText(d.transfer.notice)}</Fact>
      </div>
      {canAct && (
        <section className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">Nima qilish mumkin</h3>
          {d.kind === "muzlatilgan" && (
            <Option title="Qaytdi — guruhga qaytarish" hint="Pul oyning qolgan darslari hisobiga o'tadi.">
              <Button size="sm" variant="outline" onClick={() => onAction("return")}>Qaytarish</Button>
            </Option>
          )}
          {d.kind === "guruhsiz" && (
            <Option title="Guruhga qo'shish" hint="Pul shu oyning qolgan darslari hisobiga o'tadi.">
              <Button size="sm" variant="outline" onClick={() => onAction("enroll")}>Guruh tanlash</Button>
            </Option>
          )}
          <Option title="Pulni o'quvchiga qaytarish" hint="So'rov ochiladi: balans 0 bo'ladi, pul 10 bank kuni ichida beriladi.">
            <Button size="sm" variant="outline" onClick={() => onAction("refund")}>Qaytarishni boshlash</Button>
          </Option>
          <NoticeOption drawer={d} />
          <Option title="Markaz hisobiga o'tkazish" hint="Pul markaz daromadiga o'tadi. Sabab yoziladi." locked={!d.transfer.allowed}>
            <TransferNote transfer={d.transfer} />
            <Button size="sm" variant="destructive" disabled={!d.transfer.allowed} onClick={() => onAction("transfer")}>O'tkazish</Button>
          </Option>
        </section>
      )}
    </div>
  );
}

/** «Xabar berish» (spec §5.1): the bot text exactly as the server would send it, or a call mark. The notice starts the transfer clock. */
function NoticeOption({ drawer: d }: { drawer: DrawerData }) {
  const qc = useQueryClient();
  const [callOpen, setCallOpen] = useState(false);
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: (channel: "BOT" | "CALL") =>
      api.post(`/students/${d.student.id}/balance-notices`, { channel, note: channel === "CALL" ? note.trim() || undefined : undefined }),
    onSuccess: (_answer, channel) => {
      toast.success(channel === "BOT" ? "Xabar botga yuborildi" : "Qo'ng'iroq belgilandi");
      setCallOpen(false);
      setNote("");
      invalidateRefunds(qc);
    },
    onError: (e) => toast.error(getErrorMessage(e, "Xabarni saqlashda xatolik")),
  });
  return (
    <Option title="Xabar berish" hint="«Pulingizni olib keting» — markazga o'tkazishdan oldin kamida bir marta.">
      {d.telegramLinked && d.noticePreview && <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-xs">{d.noticePreview}</p>}
      {callOpen ? (
        <div className="flex flex-wrap gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Izoh (ixtiyoriy)" maxLength={500} aria-label="Izoh" className="min-w-0 flex-1" />
          <Button size="sm" onClick={() => send.mutate("CALL")} disabled={send.isPending}>
            {send.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}Saqlash
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCallOpen(false); setNote(""); }} disabled={send.isPending}>Bekor qilish</Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {d.telegramLinked && (
            <Button size="sm" variant="outline" disabled={!d.noticePreview || send.isPending} onClick={() => send.mutate("BOT")}>
              {send.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Send className="mr-1 size-4" />}Botga xabar yuborish
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}><Phone className="mr-1 size-4" />Qo'ng'iroq qilib aytildi</Button>
        </div>
      )}
      {!d.telegramLinked && <p className="text-xs text-muted-foreground">Bot ulanmagan — qo'ng'iroq qiling va belgilang.</p>}
      {d.telegramLinked && !d.noticePreview && <p className="text-xs text-muted-foreground">Filial telefon raqami kiritilmagan</p>}
    </Option>
  );
}
```

- [ ] **Step 5: Run the drawer test to verify it passes**

Run: `cd client && npx vitest run src/components/payments/refunds/refundable-drawer.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Give `ChangeStatusDialog` a pre-picked status**

In `client/src/components/shared/change-status-dialog.tsx` replace

```tsx
  onStatusChanged?: (newStatus: string) => void;
}
```

with

```tsx
  onStatusChanged?: (newStatus: string) => void;
  /**
   * A status picked in advance (the «Qaytariladigan pul» drawer's «Qaytdi» → ACTIVE).
   * Read on mount only: mount the dialog fresh for each use.
   */
  initialStatus?: string;
}
```

and replace

```tsx
  onStatusChanged,
}: ChangeStatusDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState("");
```

with

```tsx
  onStatusChanged,
  initialStatus,
}: ChangeStatusDialogProps) {
  const [selectedStatus, setSelectedStatus] = useState(initialStatus ?? "");
```

- [ ] **Step 7: Show the lock in «Yechib olish»**

In `client/src/components/payments/withdrawal-dialog.tsx`:

1. After `import { currentMonthKey, monthLabel } from "./salary-utils";` add:

```tsx
import { invalidateRefunds } from "./refunds/refunds-queries";
import { TransferNote } from "./refunds/transfer-note";
import type { TransferState } from "./refunds/refunds-types";
```

2. Replace

```tsx
  teacherSuggestions: TeacherSuggestion[];
}
```

with

```tsx
  teacherSuggestions: TeacherSuggestion[];
  /** Spec B2b §5.2: the transfer condition, shown before anything is typed. */
  transfer: TransferState;
}
```

3. After `  const noBalance = preview ? preview.maxWithdrawable <= 0 : false;` add the line:

```tsx
  const locked = preview ? !preview.transfer.allowed : false;
```

4. Replace `    if (!preview || rawAmount <= 0 || overMax || teacherMissing) return;` with:

```tsx
    if (!preview || rawAmount <= 0 || overMax || teacherMissing || locked) return;
```

5. Replace the two invalidation lines in `handleSubmit`

```tsx
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
```

with

```tsx
      invalidateRefunds(queryClient);
```

6. Make it scroll-safe: replace `      <DialogContent className="sm:max-w-md">` + next line `        <DialogHeader>` with

```tsx
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
```

replace `        <div className="space-y-4">` with `        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">`, and `        <DialogFooter>` with `        <DialogFooter className="border-t px-6 py-4">`.

7. Insert the note before the empty-balance warning — replace `              {noBalance && (` with:

```tsx
              <TransferNote transfer={preview.transfer} />

              {noBalance && (
```

8. Replace both `disabled={noBalance}` (the `PriceInput` and the `Switch`; Edit with `replace_all`) with `disabled={noBalance || locked}`.

9. In the submit button's `disabled` list replace

```tsx
              noBalance ||
              teacherMissing ||
```

with

```tsx
              noBalance ||
              locked ||
              teacherMissing ||
```

- [ ] **Step 7b: Let «Yechib olish» give the notice when none exists (controller decision, final plan review)**

The drawer is the only other place a notice can be given, and it lists students who are NOT studying. A studying student's profile «Yechib olish» would otherwise stay locked forever with «Avval o'quvchiga xabar bering…» and no way to do it. So, in `withdrawal-dialog.tsx`, when `preview.transfer.notice === null`, render two buttons under the `TransferNote` (no message preview here — the server composes the text):

```tsx
              {preview.transfer.notice === null && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={giveNotice.isPending}
                    onClick={() => giveNotice.mutate("BOT")}>Botga xabar yuborish</Button>
                  <Button type="button" variant="outline" size="sm" disabled={giveNotice.isPending}
                    onClick={() => giveNotice.mutate("CALL")}>Qo&apos;ng&apos;iroq qilib aytildi</Button>
                </div>
              )}
```

with, next to the other hooks (`useMutation` from `@tanstack/react-query`, `toast` from `react-hot-toast`, `getErrorMessage` from `@/lib/get-error-message` — add the imports the file lacks):

```tsx
  const giveNotice = useMutation({
    mutationFn: (channel: "BOT" | "CALL") =>
      api.post(`/students/${studentId}/balance-notices`, { channel }),
    onSuccess: (_r, channel) => {
      toast.success(channel === "BOT" ? "Xabar yuborildi" : "Xabar qayd qilindi");
      invalidateRefunds(queryClient);
      queryClient.invalidateQueries({ queryKey: ["withdrawal-preview"] });
    },
    onError: (e) => toast.error(getErrorMessage(e, "Xabarni saqlab bo'lmadi")),
  });
```

Use the dialog's own student id variable and its preview query key (read the file: if the preview key is not `["withdrawal-preview", …]`, invalidate the key it actually uses). The buttons follow the same roles as the dialog itself (CEO/BD/Admin — the notice route's roles), so no extra role check. A server refusal («Telegram bog'lanmagan — qo'ng'iroq qiling», «O'quvchi hisobida pul yo'q») arrives as the toast text.

- [ ] **Step 8: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refunds/transfer-note.tsx src/components/payments/refunds/refundable-drawer.tsx src/components/payments/refunds/refundable-drawer.test.ts src/components/shared/change-status-dialog.tsx src/components/payments/withdrawal-dialog.tsx`
Expected: no output.

- [ ] **Step 9: Run the neighbouring guard test once**

Run: `cd client && npx vitest run src/components/students/departure-policy-guard.test.ts src/components/payments/refunds/refundable-drawer.test.ts`
Expected: PASS (the guard reads `change-status-dialog.tsx` source; Step 6 does not touch the strings it pins).

- [ ] **Step 10: Commit**

```bash
git add client/src/components/payments/refunds/transfer-note.tsx client/src/components/payments/refunds/refundable-drawer.tsx \
  client/src/components/payments/refunds/refundable-drawer.test.ts client/src/components/shared/change-status-dialog.tsx \
  client/src/components/payments/withdrawal-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(refunds): refundable money drawer, notice and transfer lock

The drawer prints the server's facts, the bot text exactly as it would be
sent, and the transfer condition with the server's refusal. «Yechib olish»
shows the same lock and refuses to submit while it holds. The status dialog
can open on a pre-picked status.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: The refund dialog opens a request

**Files:**
- Modify: `client/src/components/payments/refund-dialog.tsx`
- Test: `client/src/components/payments/refund-dialog.test.ts` (new)
- Verify only: `client/src/components/students/student-profile-card.tsx` (Decision 10 — no change)

**Interfaces:**
- Consumes: API contract §1 `POST /refunds/quick` → `RefundRowView` (`dueDate`), §2 `GET /refunds/preview/:studentId` (`+ dueDate`); Task 10 `requestDueLine`, `requestOpenedText`, `invalidateRefunds`, `RefundRowView`.
- Produces: `RefundDialog` with unchanged props `{ open, onOpenChange, studentId, studentName, onSuccess? }`; posts no `refundMethod`.

- [ ] **Step 1: Write the failing test**

`client/src/components/payments/refund-dialog.test.ts`:

```ts
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// A dialog's content renders in a portal, and only while open; draw it inline.
vi.mock("@/components/ui/dialog", async () => {
  const { createElement, Fragment } = await import("react");
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return { Dialog: Pass, DialogContent: Pass, DialogHeader: Pass, DialogTitle: Pass, DialogFooter: Pass };
});

import { RefundDialog } from "./refund-dialog";

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("RefundDialog opens a request (spec B2b §4)", () => {
  it("is titled as a request, ends in «So'rovni ochish», and no longer asks how the money goes back", () => {
    const text = norm(renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() },
      createElement(RefundDialog, { open: true, onOpenChange: () => {}, studentId: 10001, studentName: "Ali Valiyev" }))));
    expect(text).toContain("Pulni qaytarish — so'rov");
    expect(text).toContain("#10001 Ali Valiyev");
    expect(text).toContain("Bekor qilish So'rovni ochish");
    expect(text).not.toContain("Qaytarish usuli");
  });
});
```

(The preview loads in an effect, which a static render does not run; the line and the toast are covered by `requestDueLine` / `requestOpenedText` in Task 10.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd client && npx vitest run src/components/payments/refund-dialog.test.ts`
Expected: FAIL — `expected '…Pulni qaytarish #10001 Ali Valiyev … Qaytarish ' to contain 'Pulni qaytarish — so'rov'`.

- [ ] **Step 3: Change the dialog**

In `client/src/components/payments/refund-dialog.tsx`:

1. Replace

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
```

with

```tsx
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { requestDueLine, requestOpenedText } from "./refunds/refunds-format";
import { invalidateRefunds } from "./refunds/refunds-queries";
import type { RefundRowView } from "./refunds/refunds-types";
```

2. Replace

```tsx
interface RefundPreview {
  enrollmentId: string;
```

with

```tsx
interface RefundPreview {
  /** null on the balance-only quote (no active group). */
  enrollmentId: string | null;
```

3. Replace

```tsx
  warning: string | null;
}
```

with

```tsx
  warning: string | null;
  /** The 10th bank day after today (spec B2b §4). */
  dueDate: string;
}
```

4. Delete the line `  const [refundMethod, setRefundMethod] = useState("CASH");` and, in `resetForm`, the line `    setRefundMethod("CASH");`.

5. Replace

```tsx
        setPreview(data);
        // Money goes back the way it came in — default the method to whatever
        // the last payment used. The operator can still change it.
        if (data.lastPayment) setRefundMethod(data.lastPayment.method);
```

with

```tsx
        setPreview(data);
```

6. Replace

```tsx
      const { data } = await api.post("/refunds/quick", {
        studentId,
        enrollmentId: preview.enrollmentId,
        amount: rawAmount,
        refundMethod,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `${formatPrice(data.approvedAmount ?? data.requestedAmount)} so'm qaytarildi`,
      );
      onOpenChange(false);
      resetForm();
      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
```

with

```tsx
      const { data } = await api.post<RefundRowView>("/refunds/quick", {
        studentId,
        enrollmentId: preview.enrollmentId,
        amount: rawAmount,
        reason: reason.trim() || undefined,
      });
      toast.success(requestOpenedText(data.dueDate));
      onOpenChange(false);
      resetForm();
      onSuccess?.();
      invalidateRefunds(queryClient);
```

7. Replace

```tsx
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pulni qaytarish</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
```

with

```tsx
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Pulni qaytarish — so&apos;rov</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
```

8. Put the due line above the amount — replace

```tsx
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Qaytarish summasi</Label>
```

with

```tsx
              <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {requestDueLine(preview.dueDate)}
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Qaytarish summasi</Label>
```

9. Remove the method field — replace

```tsx
              <div className="space-y-2">
                <Label>Qaytarish usuli</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refundMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sabab (ixtiyoriy)</Label>
```

with

```tsx
              <div className="space-y-2">
                <Label>Sabab (ixtiyoriy)</Label>
```

(`refundMethods` and `methodLabel` stay: they label the last payment.)

10. Replace `        <DialogFooter>` with `        <DialogFooter className="border-t px-6 py-4">`, and

```tsx
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Qaytarish
```

with

```tsx
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            So&apos;rovni ochish
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd client && npx vitest run src/components/payments/refund-dialog.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the profile needs no change**

Run: `cd client && grep -n "canManage &&\|Pulni qaytarish" src/components/students/student-profile-card.tsx`
Expected: `{canManage && (` appears above the line with `Pulni qaytarish`, and `canManage` is `[1, 2, 3]` (line ~78) — the Cashier never sees the item. Do not edit the file.

- [ ] **Step 6: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refund-dialog.tsx src/components/payments/refund-dialog.test.ts`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/payments/refund-dialog.tsx client/src/components/payments/refund-dialog.test.ts
git commit -m "$(cat <<'EOF'
feat(refunds): the refund dialog opens a request

«Pulni qaytarish — so'rov» shows the due date from the preview, posts no
method (the drawer chosen at «Berildi» decides it) and toasts the answer's
due date. Scroll-safe header and footer.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: The «Qaytariladigan pul» page

**Files:**
- Create: `client/src/components/payments/refunds/refunds-tables.tsx`
- Create: `client/src/components/payments/refunds/refunds-page.tsx`
- Test: `client/src/components/payments/refunds/refunds-page.test.ts`
- Create: `client/src/app/(dashboard)/payments/refunds/page.tsx`
- Modify: `client/src/components/payments/debt/debt-filter-bar.tsx` (extract `UrlSearchBox`)
- Modify: `client/src/lib/payments-nav.ts`, `client/src/lib/nav-items.test.ts`, `client/src/lib/breadcrumb-routes.ts`

**Interfaces:**
- Consumes: API contract §8 `GET /refundable/list`, §10 `GET /refundable/excel?search=`; Tasks 10–13 (all of `refunds-*`, `HandOverDialog`, `CancelRefundDialog`, `RefundableDrawer`, `DrawerAction`, `RefundDialog`, `WithdrawalDialog`, `ChangeStatusDialog.initialStatus`); existing `EnrollToGroupDialog`, `TablePagination`, `useUrlFilters`, `downloadAuthedFile`, `lastPageIfPast`, `Pill` (`debt/debt-table.tsx`).
- Produces: `RefundsPage()`; `PendingTable({ rows, offset, canHandOver, canCancel, onHandOver, onCancel })`; `RefundableTable({ tab, rows, loading, searched, offset, onOpen })`; `UrlSearchBox({ value: string; onSearch: (search: string) => void; label: string })` exported from `debt/debt-filter-bar.tsx`; nav item «Qaytariladigan pul»; breadcrumb `refunds`.

- [ ] **Step 1: Write the failing page test**

`client/src/components/payments/refunds/refunds-page.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { formatNumber, formatPhone } from "@/lib/format-utils";

const url = vi.hoisted(() => ({ search: "" }));
const auth = vi.hoisted(() => ({ roles: [{ id: 1 }] as { id: number }[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/refunds",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(url.search),
}));
vi.mock("@/hooks/use-auth", () => {
  const state = () => ({ user: { roles: auth.roles } });
  const useAuth = Object.assign((select: (s: ReturnType<typeof state>) => unknown) => select(state()), {
    getState: state, setState: () => {}, subscribe: () => () => {},
  });
  return { useAuth };
});

import { keepWithinRefundTab, refundableListKey } from "./refunds-queries";
import { readRefundsFilters, refundableListParams } from "./refunds-url";
import { RefundsPage } from "./refunds-page";
import type { PendingRefundRow, RefundableListResponse, RefundableRow } from "./refunds-types";

// Made-up names and figures; the summary is the sum of the three tabs, as the server sends it.
const ROW: RefundableRow = {
  studentId: 10001, firstName: "Ali", lastName: "Valiyev", phone: "901112233", balance: 350_000,
  kind: "muzlatilgan", since: "2026-09-15", days: 25, ageBucket: "upto30", lastGroup: { id: "g1", name: "B1-02" }, notice: null,
};
const PENDING: PendingRefundRow = {
  id: "r1", studentId: 10002, firstName: "Vali", lastName: "Aliyev", phone: "931234567", branchId: 1, amount: 620_000,
  requestedAt: "2026-10-09T06:00:00Z", dueDate: "2026-10-23", due: { overdue: false, bankDays: 9 }, reason: null,
};
const RESPONSE: RefundableListResponse = {
  summary: { total: 2_480_000, count: 7 },
  tabs: { muzlatilgan: { total: 1_150_000, count: 3 }, guruhsiz: { total: 830_000, count: 2 }, ketgan: { total: 500_000, count: 2 } },
  chips: { all: 3, upto30: 1, d31to60: 1, over60: 1 },
  rows: { data: [ROW], total: 1, page: 1, pageSize: 20 },
  pending: { data: [PENDING], total: 1, sum: 620_000, page: 1, pageSize: 10, historyCount: 9, lastHandedOverAt: "2026-10-01T09:00:00Z" },
  cashAccounts: [{ id: "a1", name: "Asosiy kassa", type: "CASH", branchId: 1 }],
};

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const num = (n: number) => norm(formatNumber(n));
const money = (n: number) => `${num(n)} so'm`;

function render(search = "", response: RefundableListResponse | null = RESPONSE, roleIds = [1]): string {
  url.search = search;
  auth.roles = roleIds.map((id) => ({ id }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(refundableListKey(undefined, refundableListParams(readRefundsFilters(search))), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RefundsPage))));
}

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-10T07:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("RefundsPage — header and summary (spec §3.1–3.2)", () => {
  it("shows today, Excel, and the money held with the people count and the rule", () => {
    const text = render();
    expect(text).toContain("Qaytariladigan pul Bugungi holat · 10.10 Excel");
    expect(text).toContain(`O'qimayotganlarning markazda turgan puli ${money(2_480_000)} 7 kishi — muzlatilgan, guruhsiz yoki ketgan`);
    expect(text).toContain("O'qiyotganlarning oldindan to'lagani bu yerga kirmaydi — u keyingi oy hisobiga o'tadi.");
  });

  it("prints a dash, never a zero, until the list answers", () => {
    expect(render("", null)).toContain("O'qimayotganlarning markazda turgan puli —");
  });
});

describe("RefundsPage — Kutilayotgan qaytarishlar (spec §3.3)", () => {
  it("the header, the rule, the columns and the row", () => {
    const text = render();
    expect(text).toContain("Kutilayotgan qaytarishlar Tarix · 9 ta");
    expect(text).toContain(`${money(620_000)} · 1 ta so'rov`);
    expect(text).toContain("Muddat — 10 bank kuni (shanba, yakshanba va bayramlar sanalmaydi).");
    expect(text).toContain("# O'quvchi Summa So'ralgan Muddat Holat Amal");
    expect(text).toContain(`Vali Aliyev ID 10002 · ${norm(formatPhone("931234567"))} ${num(620_000)} 09.10 23.10 gacha 9 bank kuni qoldi`);
  });

  it("«Berildi» for every role of the page, «Bekor qilish» for CEO and Branch Director only", () => {
    expect(render("", RESPONSE, [1])).toContain("9 bank kuni qoldi Berildi Bekor qilish");
    expect(render("", RESPONSE, [2])).toContain("Berildi Bekor qilish");
    for (const role of [3, 5]) {
      const text = render("", RESPONSE, [role]);
      expect(text).toContain("9 bank kuni qoldi Berildi");
      expect(text).not.toContain("Bekor qilish");
    }
  });

  it("no request: says so, with the last hand-over's day", () => {
    const empty = { ...RESPONSE, pending: { ...RESPONSE.pending, data: [], total: 0, sum: 0 } };
    const text = render("", empty);
    expect(text).toContain("Hozir kutilayotgan pul qaytarish yo'q. Oxirgisi 01.10 da berilgan.");
    expect(text).not.toContain("ta so'rov");
  });
});

describe("RefundsPage — the three tabs (spec §3.4)", () => {
  it("each tab button has its total, count and small line; the frozen one counts those past 30 days", () => {
    const text = render();
    expect(text).toContain(`Muzlatilganlar ${money(1_150_000)} 3 kishi · 2 tasi 30 kundan oshgan`);
    expect(text).toContain(`Guruhsiz ${money(830_000)} 2 kishi · guruhga qo'shilmagan`);
    expect(text).toContain(`Ketganlar ${money(500_000)} 2 kishi · pulini olib ketmagan`);
  });

  it("Muzlatilganlar: the rule, the age chips with counts, the columns and the row", () => {
    const text = render();
    expect(text).toContain("30 kundan oshgani — shartnoma muddati o'tgan; 60 kundan oshgani tizimda ketgan hisoblanadi.");
    for (const chip of ["Hammasi · 3", "30 kungacha · 1", "31–60 kun · 1", "60 kundan ko'p · 1"]) expect(text).toContain(chip);
    expect(text).toContain("# O'quvchi Muzlatilgan Holat Puli Xabar");
    expect(text).toContain(`Ali Valiyev ID 10001 · ${norm(formatPhone("901112233"))} 15.09 · 25 kun kutilmoqda ${num(350_000)} berilmagan`);
    expect(text).toContain("O'quvchi ustiga bosing — tafsilot va amallar o'ng tomonda ochiladi");
  });

  it("Guruhsiz: its own columns, no age chips, the last group and the notice", () => {
    const row = { ...ROW, kind: "guruhsiz" as const, notice: { date: "2026-10-03", channel: "CALL" as const } };
    const text = render("tab=guruhsiz", { ...RESPONSE, rows: { ...RESPONSE.rows, data: [row] } });
    expect(text).toContain("# O'quvchi Guruhsiz Oxirgi guruh Puli Xabar");
    expect(text).toContain("B1-02");
    expect(text).toContain("03.10 · qo'ng'iroq qilib aytildi");
    expect(text).not.toContain("30 kungacha");
    expect(text).toContain("Statusi faol, lekin hech qaysi guruhda o'qimayotganlar.");
  });

  it("an empty tab says so plainly; only a search suggests clearing it", () => {
    const empty = { ...RESPONSE, rows: { ...RESPONSE.rows, data: [], total: 0 } };
    expect(render("tab=ketgan", empty)).toContain("Bu bo'limda puli qolgan o'quvchi yo'q");
    expect(render("tab=ketgan&search=ali", empty)).toContain("Hech kim topilmadi — qidiruvni tozalab ko'ring");
  });

  it("puts no English word on screen", () => {
    for (const s of ["", "tab=guruhsiz", "tab=ketgan"]) {
      const text = render(s);
      expect(text).not.toMatch(/\b(refund|pending|total|tab|search|frozen|ungrouped|left|notice|history|loading|error)\b/i);
      expect(text).not.toMatch(/\b(BOT|CALL|CASH|BANK|CARD|REQUESTED|COMPLETED)\b/);
    }
  });
});

describe("RefundsPage — between two answers", () => {
  const key = (search: string) => refundableListKey(undefined, refundableListParams(readRefundsFilters(search)));

  it("keeps the last answer within a tab; a tab switch drops only the rows", () => {
    expect(keepWithinRefundTab("muzlatilgan")(RESPONSE, { queryKey: key("page=2") })).toBe(RESPONSE);
    const across = keepWithinRefundTab("ketgan")(RESPONSE, { queryKey: key("") });
    expect(across).toMatchObject({ rows: { data: [], total: 0 }, pending: RESPONSE.pending, tabs: RESPONSE.tabs });
    expect(keepWithinRefundTab("ketgan")(undefined, undefined)).toBeUndefined();
  });

  it("a page past the last one shows the skeleton, not a false «yo'q»", () => {
    const text = render("page=3", { ...RESPONSE, rows: { ...RESPONSE.rows, data: [], total: 25 } });
    expect(text).not.toContain("Bu bo'limda puli qolgan o'quvchi yo'q");
  });
});
```

- [ ] **Step 2: Add the failing nav test**

Append to `client/src/lib/nav-items.test.ts`:

```ts

describe("navItems — Moliya → «Qaytariladigan pul» (spec B2b §3)", () => {
  const children = navItems.find((item) => item.url === "/payments")?.children ?? [];
  const refunds = children.find((child) => child.url === "/payments/refunds");

  it("right after «Ish haqi», for every role that sees Moliya", () => {
    const i = children.findIndex((child) => child.url === "/payments/refunds");
    expect(children[i - 1]?.url).toBe("/payments/salary");
    expect(refunds?.title).toBe("Qaytariladigan pul");
    expect(refunds?.visibleForRoles).toEqual([1, 2, 3, 5]);
  });

  it("stays lit on its history page", () => {
    expect(refunds && isNavChildActive("/payments/refunds/history", refunds)).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd client && npx vitest run src/components/payments/refunds/refunds-page.test.ts src/lib/nav-items.test.ts`
Expected: FAIL — `Failed to resolve import "./refunds-page"`; the nav test fails with `expected undefined to be 'Qaytariladigan pul'`.

- [ ] **Step 4: Extract `UrlSearchBox` from the debt filter bar**

In `client/src/components/payments/debt/debt-filter-bar.tsx` replace `import { useEffect, useState } from "react";` with `import { useCallback, useEffect, useState } from "react";`, then replace

```tsx
/** The debt list's filters (spec §2.4). Options come from the open tab's own rows; every change goes back to page 1. */
export function DebtFilterBar({ filters, setFilters, options }: {
  filters: DebtFilters;
  setFilters: (u: Partial<DebtFilters>) => void;
  options: DebtListResponse["options"] | undefined;
}) {
  // A local mirror keeps typing smooth; the URL gets it after a 300 ms pause.
  // Only a URL change from outside (a redirect, the back button) resets the
  // mirror: the bar's own write coming back keeps what was typed since.
  const [search, setSearch] = useState(filters.search);
  const [urlSearch, setUrlSearch] = useState(filters.search);
  const [written, setWritten] = useState(filters.search);
  if (urlSearch !== filters.search) {
    setUrlSearch(filters.search);
    setWritten(filters.search);
    setSearch(searchBoxAfterUrl(search, filters.search, written));
  }
  useEffect(() => {
    const next = cleanSearch(search);
    if (next === filters.search) return;
    const t = setTimeout(() => {
      setWritten(next);
      setFilters({ search: next, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters.search, setFilters]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ism, telefon yoki ID"
          spellCheck={false}
          aria-label="Qarzdorni qidirish"
          className="pl-8"
        />
      </div>
```

with

```tsx
/**
 * A search box written to the URL after a 300 ms pause (the debt and the refunds
 * pages). `value` is the URL's search; `onSearch` writes it and puts the page back
 * to 1 — pass a stable callback. Only a URL change from outside (a redirect, the
 * back button) resets the box: its own write coming back keeps what was typed since.
 */
export function UrlSearchBox({ value, onSearch, label }: { value: string; onSearch: (search: string) => void; label: string }) {
  const [search, setSearch] = useState(value);
  const [urlSearch, setUrlSearch] = useState(value);
  const [written, setWritten] = useState(value);
  if (urlSearch !== value) {
    setUrlSearch(value);
    setWritten(value);
    setSearch(searchBoxAfterUrl(search, value, written));
  }
  useEffect(() => {
    const next = cleanSearch(search);
    if (next === value) return;
    const t = setTimeout(() => {
      setWritten(next);
      onSearch(next);
    }, 300);
    return () => clearTimeout(t);
  }, [search, value, onSearch]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism, telefon yoki ID" spellCheck={false} aria-label={label} className="pl-8" />
    </div>
  );
}

/** The debt list's filters (spec §2.4). Options come from the open tab's own rows; every change goes back to page 1. */
export function DebtFilterBar({ filters, setFilters, options }: {
  filters: DebtFilters;
  setFilters: (u: Partial<DebtFilters>) => void;
  options: DebtListResponse["options"] | undefined;
}) {
  const onSearch = useCallback((search: string) => setFilters({ search, page: 1 }), [setFilters]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <UrlSearchBox value={filters.search} onSearch={onSearch} label="Qarzdorni qidirish" />
```

- [ ] **Step 5: Write the tables**

`client/src/components/payments/refunds/refunds-tables.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import { Pill } from "../debt/debt-table";
import { AGE_STATE, duePill, KIND_WORD, noticeText, sinceText } from "./refunds-format";
import type { PendingRefundRow, RefundableRow, RefundableTab } from "./refunds-types";

function NameCell({ name, id, phone, link = false }: { name: string; id: number; phone: string; link?: boolean }) {
  return (
    <div>
      {/* Coloured like a link where the row opens the drawer. */}
      <div className={cn("font-medium", link && "text-primary group-hover:underline")}>{name}</div>
      <div className="text-xs text-muted-foreground">ID {id}{phone ? ` · ${formatPhone(phone)}` : ""}</div>
    </div>
  );
}

/** «Kutilayotgan qaytarishlar» (spec §3.3), oldest due first as the server sends them. */
export function PendingTable({ rows, offset, canHandOver, canCancel, onHandOver, onCancel }: {
  rows: PendingRefundRow[];
  /** (page − 1) × pageSize, for the `#` column. */
  offset: number;
  canHandOver: boolean;
  canCancel: boolean;
  onHandOver: (row: PendingRefundRow) => void;
  onCancel: (row: PendingRefundRow) => void;
}) {
  const actions = canHandOver || canCancel;
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>O'quvchi</TableHead>
            <TableHead className="text-right">Summa</TableHead>
            <TableHead>So'ralgan</TableHead>
            <TableHead>Muddat</TableHead>
            <TableHead>Holat</TableHead>
            {actions && <TableHead className="w-0"><span className="sr-only">Amal</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const pill = duePill(r.due);
            return (
              <TableRow key={r.id}>
                <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
                <TableCell><NameCell name={`${r.firstName} ${r.lastName}`} id={r.studentId} phone={r.phone} /></TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
                <TableCell>{instantDayMonth(r.requestedAt)}</TableCell>
                <TableCell>{dayMonth(r.dueDate)} gacha</TableCell>
                <TableCell><Pill tone={pill.tone}>{pill.text}</Pill></TableCell>
                {actions && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {canHandOver && <Button size="sm" onClick={() => onHandOver(r)}>Berildi</Button>}
                      {canCancel && <Button size="sm" variant="outline" onClick={() => onCancel(r)}>Bekor qilish</Button>}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Spec §3.4, after `#`; the money column is right-aligned. */
const heads = (tab: RefundableTab) =>
  ["O'quvchi", KIND_WORD[tab], tab === "muzlatilgan" ? "Holat" : "Oxirgi guruh", "Puli", "Xabar"];

/** The open tab's students, largest balance first (the server's order). A row opens the drawer. */
export function RefundableTable({ tab, rows, loading, searched, offset, onOpen }: {
  tab: RefundableTab;
  rows: RefundableRow[] | undefined;
  loading: boolean;
  /** A search is set: the empty state then suggests clearing it. */
  searched: boolean;
  offset: number;
  onOpen: (studentId: number) => void;
}) {
  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>;
  if (!rows?.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {searched ? "Hech kim topilmadi — qidiruvni tozalab ko'ring" : "Bu bo'limda puli qolgan o'quvchi yo'q"}
      </p>
    );
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            {heads(tab).map((h, i) => <TableHead key={h} className={i === 3 ? "text-right" : undefined}>{h}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.studentId} tabIndex={0} className="group cursor-pointer" onClick={() => onOpen(r.studentId)}
              onKeyDown={(e) => { if (e.key === "Enter") onOpen(r.studentId); }}>
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell><NameCell name={`${r.firstName} ${r.lastName}`} id={r.studentId} phone={r.phone} link /></TableCell>
              <TableCell>{sinceText(r.since, r.days)}</TableCell>
              <TableCell>
                {tab === "muzlatilgan"
                  ? <Pill tone={AGE_STATE[r.ageBucket].tone}>{AGE_STATE[r.ageBucket].text}</Pill>
                  : (r.lastGroup?.name ?? "—")}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.balance)}</TableCell>
              <TableCell className={cn(!r.notice && "text-muted-foreground")}>{noticeText(r.notice)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 6: Write the page**

`client/src/components/payments/refunds/refunds-page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock, Download, MousePointerClick } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TablePagination } from "@/components/outreach/table-pagination";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { EnrollToGroupDialog } from "@/components/students/enroll-to-group-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { hasAnyRole, REFUND_CANCEL_ROLES, REFUND_HAND_OVER_ROLES, REFUND_REQUEST_ROLES } from "@/lib/role-access";
import { tashkentNow } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { RefundDialog } from "../refund-dialog";
import { WithdrawalDialog } from "../withdrawal-dialog";
import { dayMonth } from "../debt/debt-format";
import { UrlSearchBox } from "../debt/debt-filter-bar";
import { lastPageIfPast } from "../debt/debt-url";
import { CancelRefundDialog, HandOverDialog } from "./pending-dialogs";
import { RefundableDrawer, type DrawerAction } from "./refundable-drawer";
import { AGE_LABEL, PENDING_RULE, pendingEmptyText, pendingSumLine, summaryLine, TAB_LABEL, TAB_RULE, tabSubline } from "./refunds-format";
import { invalidateRefunds, useRefundableList } from "./refunds-queries";
import { PendingTable, RefundableTable } from "./refunds-tables";
import { cleanRefundsFilters, REFUNDS_SCHEMA, refundsTab, type RefundsFilters } from "./refunds-url";
import { AGE_BUCKETS, REFUNDABLE_TABS, type AgeBucket, type DrawerStudent, type PendingRefundRow, type RefundableListResponse, type RefundableTab } from "./refunds-types";

const TAB_DOT: Record<RefundableTab, string> = { muzlatilgan: "bg-amber-500", guruhsiz: "bg-muted-foreground", ketgan: "bg-red-500" };
const AGE_CHIPS: ("" | AgeBucket)[] = ["", ...AGE_BUCKETS];

/**
 * «Qaytariladigan pul» (spec B2b §3, ADR-0075): the money of students who are not
 * studying, in three tabs, and the open refund requests. Every figure is the
 * server's; the summary is the one place the three tabs are added (money held).
 */
export function RefundsPage() {
  const qc = useQueryClient();
  const { filters: raw, setFilters } = useUrlFilters(REFUNDS_SCHEMA);
  // A value the server would refuse (an old bookmark) is read as its default.
  const filters = cleanRefundsFilters(raw as RefundsFilters);
  const tab = refundsTab(filters);
  const { data, isPending, isPlaceholderData, isError, refetch } = useRefundableList(filters);
  const roles = useAuth((s) => s.user?.roles);
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const [action, setAction] = useState<{ kind: DrawerAction; student: DrawerStudent } | null>(null);
  const [handOver, setHandOver] = useState<PendingRefundRow | null>(null);
  const [cancel, setCancel] = useState<PendingRefundRow | null>(null);
  const today = tashkentNow().dateStr;

  // A page past the last one (its last request was just handed over) goes to the last page that has rows.
  const fresh = data && !isPlaceholderData ? data : null;
  const lastRows = fresh ? lastPageIfPast(filters.page, filters.pageSize, fresh.rows.total, fresh.rows.data.length) : null;
  const lastPending = fresh ? lastPageIfPast(filters.pendingPage, filters.pendingPageSize, fresh.pending.total, fresh.pending.data.length) : null;
  useEffect(() => {
    if (lastRows !== null || lastPending !== null) setFilters({ page: lastRows ?? filters.page, pendingPage: lastPending ?? filters.pendingPage });
  }, [lastRows, lastPending, filters.page, filters.pendingPage, setFilters]);
  // A kept empty answer is not the new one: skeleton, not «yo'q», until it lands.
  const rowsLoading = isPending || lastRows !== null || (isPlaceholderData && !data?.rows.data.length);
  const onSearch = useCallback((search: string) => setFilters({ search, page: 1 }), [setFilters]);

  const exportExcel = async () => {
    // The server applies only the search to the Excel (every tab, every page).
    const qs = filters.search ? `?${new URLSearchParams({ search: filters.search })}` : "";
    try {
      await downloadAuthedFile(`/refundable/excel${qs}`, `qaytariladigan-pul-${today}.xlsx`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Excel yuklab olishda xatolik"));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 font-heading text-lg font-semibold tracking-tight">Qaytariladigan pul</h1>
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm text-muted-foreground">
          <Clock className="size-3.5" />Bugungi holat · {dayMonth(today)}
        </span>
        <Button variant="outline" onClick={exportExcel}><Download className="mr-2 size-4" />Excel</Button>
      </div>

      <div className="rounded-xl border p-4">
        <p className="text-sm text-muted-foreground">O'qimayotganlarning markazda turgan puli</p>
        <p className="text-2xl font-bold tabular-nums">{data ? formatBalance(data.summary.total) : "—"}</p>
        {data && <p className="text-sm text-muted-foreground">{summaryLine(data.summary.count)}</p>}
        <p className="mt-1.5 text-xs text-muted-foreground">O'qiyotganlarning oldindan to'lagani bu yerga kirmaydi — u keyingi oy hisobiga o'tadi.</p>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Kutilayotgan qaytarishlar</p>
          {data && (
            <Link href="/payments/refunds/history" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Tarix · {formatNumber(data.pending.historyCount)} ta<ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
        {data && data.pending.total > 0 && <p className="text-lg font-bold tabular-nums">{pendingSumLine(data.pending.sum, data.pending.total)}</p>}
        <p className="text-sm text-muted-foreground">{PENDING_RULE}</p>
        {!data ? (
          <Skeleton className="h-24 rounded" />
        ) : data.pending.total === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{pendingEmptyText(data.pending.lastHandedOverAt)}</p>
        ) : (
          <div aria-busy={isPlaceholderData} className={cn("space-y-3", isPlaceholderData && "pointer-events-none opacity-60")}>
            <PendingTable rows={data.pending.data} offset={(filters.pendingPage - 1) * filters.pendingPageSize}
              canHandOver={hasAnyRole(roles, REFUND_HAND_OVER_ROLES)} canCancel={hasAnyRole(roles, REFUND_CANCEL_ROLES)}
              onHandOver={setHandOver} onCancel={setCancel} />
            <TablePagination total={data.pending.total} page={filters.pendingPage} pageSize={filters.pendingPageSize}
              onPageChange={(p) => setFilters({ pendingPage: p })} onPageSizeChange={(s) => setFilters({ pendingPageSize: s, pendingPage: 1 })} />
          </div>
        )}
      </div>

      <TabButtons data={data} active={tab} onSelect={(t) => setFilters({ tab: t, age: "", page: 1 })} />
      <p className="text-sm text-muted-foreground">{TAB_RULE[tab]}</p>

      {tab === "muzlatilgan" && (
        <div role="group" aria-label="Muzlatilganiga necha kun bo'lgan" className="flex w-max max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {AGE_CHIPS.map((a) => {
            const count = data?.chips[a || "all"];
            return (
              <button key={a || "all"} type="button" aria-pressed={filters.age === a} onClick={() => setFilters({ age: a, page: 1 })}
                className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground", filters.age === a && "bg-background text-foreground shadow-sm")}>
                {a ? AGE_LABEL[a] : "Hammasi"} · {count === undefined ? "—" : formatNumber(count)}
              </button>
            );
          })}
        </div>
      )}

      <UrlSearchBox value={filters.search} onSearch={onSearch} label="O'quvchini qidirish" />
      {/* Nothing else on the row says it opens (the debt page's lesson). */}
      {data && data.rows.total > 0 && (
        <p className="flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-primary">
          <MousePointerClick className="size-4 shrink-0" />
          O'quvchi ustiga bosing — tafsilot va amallar o'ng tomonda ochiladi
        </p>
      )}

      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Ro'yxatni yuklab bo'lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : (
        <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && "pointer-events-none opacity-60")}>
          <RefundableTable tab={tab} rows={data?.rows.data} loading={rowsLoading} searched={!!filters.search}
            offset={(filters.page - 1) * filters.pageSize} onOpen={setDrawerId} />
        </div>
      )}
      {data && data.rows.total > 0 && (
        <TablePagination total={data.rows.total} page={filters.page} pageSize={filters.pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}

      <RefundableDrawer studentId={drawerId} canAct={hasAnyRole(roles, REFUND_REQUEST_ROLES)} onClose={() => setDrawerId(null)}
        onAction={(kind, student) => { setDrawerId(null); setAction({ kind, student }); }} />
      {action && <ActionDialog action={action} onClose={() => setAction(null)} onDone={() => invalidateRefunds(qc)} />}
      {handOver && <HandOverDialog target={handOver} accounts={data?.cashAccounts ?? []} onClose={() => setHandOver(null)} />}
      {cancel && <CancelRefundDialog target={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

function TabButtons({ data, active, onSelect }: {
  data: RefundableListResponse | undefined; active: RefundableTab; onSelect: (t: RefundableTab) => void;
}) {
  const overThirty = data ? data.chips.d31to60 + data.chips.over60 : 0;
  return (
    <div role="tablist" aria-label="Kimlarning puli" className="grid gap-3 md:grid-cols-3">
      {REFUNDABLE_TABS.map((t) => {
        const total = data?.tabs[t];
        return (
          <button key={t} type="button" role="tab" aria-selected={t === active} onClick={() => onSelect(t)}
            className={cn("flex flex-col items-start gap-0.5 rounded-xl border p-3 text-left", t === active && "border-primary ring-1 ring-primary")}>
            <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <span className={cn("size-2 rounded-full", TAB_DOT[t])} />{TAB_LABEL[t]}
            </span>
            <span className="text-xl font-bold tabular-nums">{total ? formatBalance(total.total) : "—"}</span>
            {total && <span className="text-xs text-muted-foreground">{tabSubline(t, total.count, overThirty)}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The existing dialog a drawer option opens (spec §3.5), mounted fresh for each
 * student. The refund and withdrawal dialogs refresh the page's keys themselves.
 */
function ActionDialog({ action: { kind, student }, onClose, onDone }: {
  action: { kind: DrawerAction; student: DrawerStudent }; onClose: () => void; onDone: () => void;
}) {
  const name = `${student.firstName} ${student.lastName}`;
  const onOpenChange = (open: boolean) => {
    if (!open) onClose();
  };
  if (kind === "refund") return <RefundDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name} />;
  if (kind === "transfer") return <WithdrawalDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name} />;
  if (kind === "return") {
    return (
      <ChangeStatusDialog open onOpenChange={onOpenChange} entityType="students" entityId={student.id} entityName={name}
        currentStatus={student.status} initialStatus="ACTIVE" onStatusChanged={onDone} />
    );
  }
  return (
    <EnrollToGroupDialog open onOpenChange={onOpenChange} studentId={student.id} studentName={name}
      enrolledGroupIds={[]} studentBranchId={student.branchId} onEnrolled={onDone} />
  );
}
```

- [ ] **Step 7: Add the route**

`client/src/app/(dashboard)/payments/refunds/page.tsx`:

```tsx
import { Suspense } from "react";
import { RefundsPage } from "@/components/payments/refunds/refunds-page";

// Suspense: the page keeps its tab, chip, search and pages in the URL (`useSearchParams`).
export default function RefundsRoute() {
  return (
    <Suspense>
      <RefundsPage />
    </Suspense>
  );
}
```

- [ ] **Step 8: Add the nav item and the breadcrumb**

In `client/src/lib/payments-nav.ts` add `HandCoins,` to the lucide import (after `Activity,`) and, right after the «Ish haqi» entry, insert:

```ts
  // Spec B2b §3: the money of students who are not studying and the open refund
  // requests. Every role that sees Moliya; /payments/refunds/history shares the prefix.
  { title: "Qaytariladigan pul", url: "/payments/refunds", icon: HandCoins, visibleForRoles: [1, 2, 3, 5] },
```

In `client/src/lib/breadcrumb-routes.ts`, right after `  "frozen-balances": "Muzlatilganlarning puli",` insert:

```ts
  // /payments/refunds — «Qaytariladigan pul» (spec B2b).
  refunds: "Qaytariladigan pul",
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/components/payments/refunds src/lib/nav-items.test.ts src/components/payments/debt/debt-page.test.ts`
Expected: PASS — every file in `refunds/`, the nav test, and the debt page (its search box now comes from `UrlSearchBox`).

- [ ] **Step 10: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refunds "src/app/(dashboard)/payments/refunds/page.tsx" src/components/payments/debt/debt-filter-bar.tsx src/lib/payments-nav.ts src/lib/breadcrumb-routes.ts src/lib/nav-items.test.ts`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/payments/refunds/refunds-tables.tsx client/src/components/payments/refunds/refunds-page.tsx \
  client/src/components/payments/refunds/refunds-page.test.ts "client/src/app/(dashboard)/payments/refunds/page.tsx" \
  client/src/components/payments/debt/debt-filter-bar.tsx client/src/lib/payments-nav.ts client/src/lib/breadcrumb-routes.ts \
  client/src/lib/nav-items.test.ts
git commit -m "$(cat <<'EOF'
feat(refunds): «Qaytariladigan pul» page

Header, the money held, the pending requests with «Berildi» and «Bekor
qilish», three tabs with age chips, search and paging in the URL, the row
drawer and the dialogs its options open. Moliya nav item after «Ish haqi».
The debt page's search box is shared as UrlSearchBox.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: History page, redirects, and the frozen-balances page removed

**Files:**
- Create: `client/src/components/payments/refunds/refund-history-page.tsx`
- Test: `client/src/components/payments/refunds/refund-history-page.test.ts`
- Create: `client/src/app/(dashboard)/payments/refunds/history/page.tsx`
- Modify: `client/src/app/(dashboard)/payments/frozen-balances/page.tsx` (redirect)
- Delete: `client/src/components/payments/debt/frozen-balance-view.tsx`
- Modify: `client/src/components/payments/debt/debt-page.tsx`, `debt-page.test.ts`, `debt-url.ts`, `debt-url.test.ts`, `debt-subpages.test.ts`
- Modify: `client/src/lib/payments-nav.ts`, `client/src/lib/nav-items.test.ts`, `client/src/lib/breadcrumb-routes.ts`, `client/src/lib/role-access.ts`, `client/src/lib/role-access.test.ts`

**Interfaces:**
- Consumes: API contract §5 `GET /refunds?status=COMPLETED,REJECTED&page&pageSize` → `RefundHistoryResponse`; Task 10 `useRefundHistory`, `refundHistoryKey`, `HISTORY_SCHEMA`, `cleanHistoryPage`, `handedCell`.
- Produces: `RefundHistoryPage()`; route `/payments/refunds/history`; `/payments/frozen-balances` → `/payments/refunds?tab=muzlatilgan`; `legacyDebtRedirect({ tab: "muzlatilgan" })` → `/payments/refunds?tab=muzlatilgan`; breadcrumb `history`.

- [ ] **Step 1: Write the failing history test**

`client/src/components/payments/refunds/refund-history-page.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { formatNumber } from "@/lib/format-utils";

vi.mock("next/navigation", () => ({
  usePathname: () => "/payments/refunds/history",
  useRouter: () => ({ push() {}, replace() {}, back() {}, prefetch() {} }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { refundHistoryKey } from "./refunds-queries";
import { RefundHistoryPage } from "./refund-history-page";
import type { RefundHistoryResponse, RefundHistoryRow } from "./refunds-types";

// Made-up names and figures.
const GIVEN: RefundHistoryRow = {
  id: "r1", student: { id: 10003, firstName: "Olim", lastName: "Karimov", phone: "901234567" }, amount: 300_000,
  status: "COMPLETED", reason: null, requestedAt: "2026-09-15T06:00:00Z", dueDate: "2026-09-29",
  handedOverAt: "2026-09-24T07:00:00Z", refundMethod: "CASH", cancelledAt: null, cancelReason: null, closedBy: { id: 10050, name: "Kamola" },
};
const CANCELLED: RefundHistoryRow = {
  ...GIVEN, id: "r2", amount: 95_000, status: "REJECTED", requestedAt: "2026-08-20T06:00:00Z", handedOverAt: null,
  refundMethod: null, cancelledAt: "2026-08-22T06:00:00Z", cancelReason: "Guruhga qaytdi", closedBy: { id: 10060, name: "Dilshod" },
};
const RESPONSE: RefundHistoryResponse = { data: [GIVEN, CANCELLED], total: 2, page: 1, pageSize: 10 };

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

function render(response: RefundHistoryResponse | null = RESPONSE) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (response) client.setQueryData(refundHistoryKey(undefined, 1, 10), response);
  return norm(renderToStaticMarkup(createElement(QueryClientProvider, { client },
    createElement(TooltipProvider, null, createElement(RefundHistoryPage)))));
}

describe("RefundHistoryPage (spec §3.6)", () => {
  it("the way back, the title, the columns and both kinds of row", () => {
    const text = render();
    expect(text).toContain("Qaytariladigan pul Qaytarishlar tarixi Berilgan va bekor qilingan so'rovlar");
    expect(text).toContain("# O'quvchi Summa So'ralgan Berildi Kim berdi / Kim bekor qildi");
    expect(text).toContain(`Olim Karimov ID 10003`);
    expect(text).toContain(`${norm(formatNumber(300_000))} 15.09 24.09 · naqd Kamola`);
    expect(text).toContain(`${norm(formatNumber(95_000))} 20.08 bekor qilindi Dilshod`);
  });

  it("empty history says so", () => {
    expect(render({ data: [], total: 0, page: 1, pageSize: 10 })).toContain("Hali berilgan yoki bekor qilingan so'rov yo'q");
  });

  it("the breadcrumb names both segments", () => {
    expect(routeLabels.refunds).toBe("Qaytariladigan pul");
    expect(routeLabels.history).toBe("Tarix");
  });
});
```

- [ ] **Step 2: Turn the old-page tests into the new expectations**

1. `client/src/components/payments/debt/debt-url.test.ts`: replace `expect(legacyDebtRedirect({ tab: "muzlatilgan" })).toBe("/payments/frozen-balances");` with

```ts
    expect(legacyDebtRedirect({ tab: "muzlatilgan" })).toBe("/payments/refunds?tab=muzlatilgan");
```

2. `client/src/components/payments/debt/debt-page.test.ts`: replace

```ts
  it("links the history, the write-off archive with its count, the frozen balances; names Ish haqi", () => {
    const text = render();
    expect(text).toContain("Oylar bo'yicha qarz tarixi");
    expect(text).toContain(`Kechirilgan qarzlar arxivi · ${num(6)} ta`);
    expect(text).toContain("Muzlatilganlarning puli");
```

with

```ts
  it("links the history and the write-off archive with its count; names Ish haqi and «Qaytariladigan pul»", () => {
    const text = render();
    expect(text).toContain("Oylar bo'yicha qarz tarixi");
    expect(text).toContain(`Kechirilgan qarzlar arxivi · ${num(6)} ta`);
    expect(text).toContain("Muzlatilganlarning markazda turgan puli — «Qaytariladigan pul» sahifasida.");
    expect(text).not.toContain("Muzlatilganlarning puli");
```

3. Replace the whole of `client/src/components/payments/debt/debt-subpages.test.ts` with:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routeLabels } from "@/lib/breadcrumb-routes";
import { DebtSubpage } from "./debt-subpage";

const src = (file: string) => readFileSync(join(__dirname, "..", file), "utf-8");
const route = (...parts: string[]) => join(__dirname, "..", "..", "..", "app", "(dashboard)", "payments", ...parts, "page.tsx");

describe("debt sub-pages (spec B2a §2.6)", () => {
  it("each has a back link to Qarzdorlik and its title", () => {
    const html = renderToStaticMarkup(createElement(DebtSubpage, { title: "Kechirilgan qarzlar arxivi" }, "x"));
    expect(html).toContain('href="/payments/debt"');
    expect(html).toContain("Qarzdorlik");
    expect(html).toContain("Kechirilgan qarzlar arxivi");
  });

  it("the breadcrumb names the two sub-pages", () => {
    expect(routeLabels["debt-history"]).toBe("Qarz tarixi");
    expect(routeLabels["debt-write-offs"]).toBe("Kechirilgan qarzlar");
  });
});

describe("«Muzlatilganlarning puli» moved to «Qaytariladigan pul» (spec B2b §3.8)", () => {
  it("the debt page links the frozen tab there; the old view and its label are gone", () => {
    expect(src("debt/debt-page.tsx")).toContain('href="/payments/refunds?tab=muzlatilgan"');
    expect(existsSync(join(__dirname, "frozen-balance-view.tsx"))).toBe(false);
    expect(routeLabels["frozen-balances"]).toBeUndefined();
  });

  it("the old address redirects to the frozen tab", () => {
    expect(readFileSync(route("frozen-balances"), "utf-8")).toContain('redirect("/payments/refunds?tab=muzlatilgan")');
  });
});

describe("«Markaz qoplagani» lives on Ish haqi (ADR-0072)", () => {
  it("the salary page has the tab, and its card links there, never to the debt page", () => {
    expect(src("salary-client.tsx")).toContain('value="markaz"');
    expect(src("salary-monthly-view.tsx")).not.toContain("/payments/debt?tab=markaz");
    expect(src("salary-monthly-view.tsx")).toContain("/payments/salary?tab=markaz&month=");
  });

  it("the month lives in its own URL state, not the debt page's", () => {
    expect(src("debt/center-topup-view.tsx")).not.toContain("useDebtFilters");
  });
});
```

4. `client/src/lib/nav-items.test.ts`: replace

```ts
  it.each(["/payments/debt", "/payments/debt-history", "/payments/debt-write-offs", "/payments/frozen-balances"])(
```

with

```ts
  it.each(["/payments/debt", "/payments/debt-history", "/payments/debt-write-offs"])(
```

and replace

```ts
    expect(debt && isNavChildActive("/payments/salary", debt)).toBe(false);
```

with

```ts
    expect(debt && isNavChildActive("/payments/salary", debt)).toBe(false);
    // The frozen balances moved to «Qaytariladigan pul» (spec B2b §3.8).
    expect(debt && isNavChildActive("/payments/frozen-balances", debt)).toBe(false);
```

5. `client/src/lib/role-access.test.ts`: delete the import line `  FROZEN_BALANCE_ACTION_ROLES,` and the test

```ts
  it("«Muzlatilgan puli» amallari — POST /withdrawals, POST /refunds/quick: kassirga yo'q", () => {
    expect(hasAnyRole(roles(CASHIER), FROZEN_BALANCE_ACTION_ROLES)).toBe(
      false,
    );
    expect(hasAnyRole(roles(ADMINISTRATOR), FROZEN_BALANCE_ACTION_ROLES)).toBe(
      true,
    );
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd client && npx vitest run src/components/payments/refunds/refund-history-page.test.ts src/components/payments/debt src/lib/nav-items.test.ts src/lib/role-access.test.ts`
Expected: FAIL — history: `Failed to resolve import "./refund-history-page"`; debt-url: `expected '/payments/frozen-balances' to be '/payments/refunds?tab=muzlatilgan'`; debt-page: missing the new footer line; debt-subpages: `href="/payments/refunds?tab=muzlatilgan"` missing, `frozen-balance-view.tsx` exists, label still set; nav: `/payments/frozen-balances` still highlights «Qarzdorlik». (role-access passes already — the constant still exists but is unused by the test.)

- [ ] **Step 4: Write the history page and its route**

`client/src/components/payments/refunds/refund-history-page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import { instantDayMonth } from "../debt/debt-format";
import { Pill } from "../debt/debt-table";
import { handedCell } from "./refunds-format";
import { useRefundHistory } from "./refunds-queries";
import { cleanHistoryPage, HISTORY_SCHEMA } from "./refunds-url";
import type { RefundHistoryRow } from "./refunds-types";

function HandedCell({ row }: { row: RefundHistoryRow }) {
  const cell = handedCell(row);
  if (!cell.cancelled) return <>{cell.text}</>;
  const pill = <Pill tone="muted">bekor qilindi</Pill>;
  if (!cell.reason) return pill;
  return (
    <Tooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help">{pill}</span></TooltipTrigger>
      <TooltipContent>{cell.reason}</TooltipContent>
    </Tooltip>
  );
}

/** «Qaytarishlar tarixi» (spec §3.6): handed-over and cancelled requests in scope, newest request first. */
export function RefundHistoryPage() {
  const { filters, setFilters } = useUrlFilters(HISTORY_SCHEMA);
  const { page, pageSize } = cleanHistoryPage(filters.page, filters.pageSize);
  const { data, isError, refetch } = useRefundHistory(page, pageSize);
  return (
    <div className="space-y-4">
      <Link href="/payments/refunds" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="size-4" />Qaytariladigan pul
      </Link>
      <div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">Qaytarishlar tarixi</h1>
        <p className="text-sm text-muted-foreground">Berilgan va bekor qilingan so'rovlar</p>
      </div>
      {isError ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Tarixni yuklab bo'lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Qayta urinish</Button>
        </div>
      ) : !data ? (
        <div className="space-y-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-12 rounded" />)}</div>
      ) : data.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Hali berilgan yoki bekor qilingan so'rov yo'q</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>O'quvchi</TableHead>
                <TableHead className="text-right">Summa</TableHead>
                <TableHead>So'ralgan</TableHead>
                <TableHead>Berildi</TableHead>
                <TableHead>Kim berdi / Kim bekor qildi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell className="border-r text-muted-foreground">{(page - 1) * pageSize + i + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.student.firstName} {r.student.lastName}</div>
                    <div className="text-xs text-muted-foreground">ID {r.student.id}{r.student.phone ? ` · ${formatPhone(r.student.phone)}` : ""}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatPrice(r.amount)}</TableCell>
                  <TableCell>{instantDayMonth(r.requestedAt)}</TableCell>
                  <TableCell><HandedCell row={r} /></TableCell>
                  <TableCell>{r.closedBy?.name ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {data && data.total > 0 && (
        <TablePagination total={data.total} page={page} pageSize={pageSize}
          onPageChange={(p) => setFilters({ page: p })} onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })} />
      )}
    </div>
  );
}
```

`client/src/app/(dashboard)/payments/refunds/history/page.tsx`:

```tsx
import { Suspense } from "react";
import { RefundHistoryPage } from "@/components/payments/refunds/refund-history-page";

// Suspense: the page keeps its page and page size in the URL (`useSearchParams`).
export default function RefundHistoryRoute() {
  return (
    <Suspense>
      <RefundHistoryPage />
    </Suspense>
  );
}
```

- [ ] **Step 5: Redirect the old page and delete its view**

Replace the whole of `client/src/app/(dashboard)/payments/frozen-balances/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

// «Muzlatilganlarning puli» became the first tab of «Qaytariladigan pul» (spec
// B2b §3.8). Kept as a redirect rather than deleted: the path is in bookmarks
// and Telegram messages, and a 404 would read as the money being gone.
export default function FrozenBalancesPage() {
  redirect("/payments/refunds?tab=muzlatilgan");
}
```

Run: `git rm client/src/components/payments/debt/frozen-balance-view.tsx`

In `client/src/components/payments/debt/debt-url.ts` replace `  if (tab === "muzlatilgan") return "/payments/frozen-balances";` with:

```ts
  if (tab === "muzlatilgan") return "/payments/refunds?tab=muzlatilgan";
```

- [ ] **Step 6: The debt page's footer line**

In `client/src/components/payments/debt/debt-page.tsx` delete the line

```tsx
          <FooterLink href="/payments/frozen-balances">Muzlatilganlarning puli</FooterLink>
```

and replace

```tsx
        <p className="text-xs text-muted-foreground">Markaz qoplagani — Ish haqi sahifasida.</p>
```

with

```tsx
        <p className="text-xs text-muted-foreground">Markaz qoplagani — Ish haqi sahifasida.</p>
        {/* Spec B2b §3.8: the frozen balances live on «Qaytariladigan pul» now. */}
        <p className="text-xs text-muted-foreground">
          Muzlatilganlarning markazda turgan puli —{" "}
          <Link href="/payments/refunds?tab=muzlatilgan" className="text-primary hover:underline">«Qaytariladigan pul»</Link> sahifasida.
        </p>
```

- [ ] **Step 7: Nav, breadcrumb and roles**

1. `client/src/lib/payments-nav.ts` — replace

```ts
  // One entry for everything owed to the center. Its sub-pages (spec B2a §2.6)
  // stay under it in the sidebar: /payments/debt-history and /debt-write-offs
  // share the url's prefix, /payments/frozen-balances needs activePrefixes.
  {
    title: "Qarzdorlik",
    url: "/payments/debt",
    icon: UserMinus,
    activePrefixes: ["/payments/frozen-balances"],
  },
```

with

```ts
  // One entry for everything owed to the center. Its sub-pages (spec B2a §2.6)
  // /payments/debt-history and /debt-write-offs share the url's prefix.
  { title: "Qarzdorlik", url: "/payments/debt", icon: UserMinus },
```

2. `client/src/lib/breadcrumb-routes.ts` — replace

```ts
  // /payments/debt — qarzdorlik sahifasi (uch bo'lim). Uning eski tablari endi
  // alohida sahifalar: qarz tarixi, kechirilganlar, muzlatilganlar puli.
  debt: "Qarzdorlik",
  "debt-history": "Qarz tarixi",
  "debt-write-offs": "Kechirilgan qarzlar",
  "frozen-balances": "Muzlatilganlarning puli",
  // /payments/refunds — «Qaytariladigan pul» (spec B2b).
  refunds: "Qaytariladigan pul",
```

with

```ts
  // /payments/debt — qarzdorlik sahifasi (uch bo'lim). Uning eski tablari endi
  // alohida sahifalar: qarz tarixi va kechirilganlar. Muzlatilganlar puli
  // «Qaytariladigan pul» ga ko'chdi (/payments/frozen-balances u yerga yo'naltiradi).
  debt: "Qarzdorlik",
  "debt-history": "Qarz tarixi",
  "debt-write-offs": "Kechirilgan qarzlar",
  // /payments/refunds — «Qaytariladigan pul» (spec B2b); /payments/refunds/history — uning tarixi.
  refunds: "Qaytariladigan pul",
  history: "Tarix",
```

3. `client/src/lib/role-access.ts` — delete

```ts
/**
 * `POST /withdrawals` va `POST /refunds/quick` — «Muzlatilganlarning puli» sahifasining
 * ikki amali: markaz hisobiga o'tkazish va o'quvchiga qaytarish.
 */
export const FROZEN_BALANCE_ACTION_ROLES = [1, 2, 3];

```

- [ ] **Step 8: Confirm nothing else uses the old names**

Run: `cd client && grep -rn "frozen-balance-view\|FROZEN_BALANCE_ACTION_ROLES\|/payments/frozen-balances" src --include='*.ts' --include='*.tsx'`
Expected: only `src/components/payments/debt/debt-subpages.test.ts` (its assertions) and `src/lib/nav-items.test.ts` (the «no longer lit» line). The guide's `yollar` entry is changed in Task 16.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/components/payments/refunds src/components/payments/debt src/lib/nav-items.test.ts src/lib/role-access.test.ts`
Expected: PASS.

- [ ] **Step 10: Lint and type-check**

Run: `cd client && npx tsc --noEmit -p . && npx eslint src/components/payments/refunds "src/app/(dashboard)/payments/refunds" "src/app/(dashboard)/payments/frozen-balances/page.tsx" src/components/payments/debt src/lib/payments-nav.ts src/lib/breadcrumb-routes.ts src/lib/role-access.ts src/lib/role-access.test.ts src/lib/nav-items.test.ts`
Expected: no output.

- [ ] **Step 11: Commit**

```bash
git add client/src/components/payments/refunds/refund-history-page.tsx client/src/components/payments/refunds/refund-history-page.test.ts \
  "client/src/app/(dashboard)/payments/refunds/history/page.tsx" "client/src/app/(dashboard)/payments/frozen-balances/page.tsx" \
  client/src/components/payments/debt/debt-page.tsx client/src/components/payments/debt/debt-page.test.ts \
  client/src/components/payments/debt/debt-url.ts client/src/components/payments/debt/debt-url.test.ts \
  client/src/components/payments/debt/debt-subpages.test.ts client/src/lib/payments-nav.ts client/src/lib/breadcrumb-routes.ts \
  client/src/lib/role-access.ts client/src/lib/role-access.test.ts client/src/lib/nav-items.test.ts
git commit -m "$(cat <<'EOF'
feat(refunds): refund history page; frozen balances move to the new page

/payments/refunds/history lists handed-over and cancelled requests.
/payments/frozen-balances and the debt page's ?tab=muzlatilgan land on
«Qaytariladigan pul»'s frozen tab; the old view, its role constant and its
nav prefix go. The debt footer points to the new page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

(`git rm` in Step 5 already staged the deleted view.)

---

### Task 16: User guide and client/CLAUDE.md

**Files:**
- Modify: `client/src/qollanma/sahifalar/tolovlar.ts`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`
- Create: `client/src/qollanma/kontent/tolovlar/qaytariladigan-pul.mdx`
- Modify (rewrite): `client/src/qollanma/kontent/tolovlar/pul-qaytarish.mdx`
- Modify: `client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`, `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`, `client/src/qollanma/kontent/boshlash/lugat.mdx`
- Modify: `client/CLAUDE.md`
- Test: existing `client/src/qollanma/*.test.ts` (registry, search, roles, route match)

**Interfaces:**
- Consumes: routes from Tasks 14–15 (`/payments/refunds`, `/payments/refunds/history` — the registry test checks a `page.tsx` exists for every `yollar` pattern); ADR number from server Task 9 (`0075`; if it was renumbered on `main`, use that number everywhere below).
- Produces: guide page `tolovlar/qaytariladigan-pul`; news entry; updated `pul-qaytarish`, `qarzdorlik`, `rollar-va-huquqlar`, `lugat`.

- [ ] **Step 1: Add the registry entry first (the registry test then fails on the missing MDX)**

In `client/src/qollanma/sahifalar/tolovlar.ts`, append a new object after the «qarzdorlik» entry (the last one, before the closing `];`):

```ts
  {
    bolim: "tolovlar",
    sahifa: "qaytariladigan-pul",
    sarlavha: "Qaytariladigan pul",
    qisqacha:
      "«Qaytariladigan pul» sahifasi o'qimayotgan o'quvchilarning balansida qolgan pulini uch bo'limda (muzlatilganlar, guruhsiz, ketganlar) va ochiq pulni qaytarish so'rovlarini ko'rsatadi. Bu yerda pul berilgani belgilanadi («Berildi»), o'quvchiga xabar beriladi va shart bajarilgach pul markaz hisobiga o'tkaziladi.",
    rollar: [1, 2, 3, 5],
    adr: ["0067", "0075"],
    yollar: ["/payments/refunds", "/payments/refunds/history"],
    kalitSozlar: [
      "qaytariladigan pul",
      "kutilayotgan qaytarishlar",
      "qaytarishlar tarixi",
      "muzlatilgan puli",
      "muzlatilganlarning puli",
      "muzlatilganlar",
      "guruhsiz",
      "ketganlar",
      "markazda turgan pul",
      "berildi",
      "qaysi kassadan",
      "xabar berish",
      "botga xabar yuborish",
      "qo'ng'iroq qilib aytildi",
      "markaz hisobiga o'tkazish",
      "bank kuni",
      "muddati o'tdi",
    ],
    yangilangan: "2026-10-10",
  },
```

In the same file:
- «pul-qaytarish» entry: replace its `qisqacha` string, `rollar` and `adr` with

```ts
    qisqacha:
      "Pulni qaytarish so'rov bilan: «So'rovni ochish» bosilganda balans darhol kamayadi, pul 10 bank kuni ichida kassadan beriladi va «Berildi» bilan belgilanadi; berilmagan so'rovni CEO yoki filial direktori bekor qiladi. «Yechib olish» balansdagi pulni o'quvchiga bermay markaz hisobiga o'tkazadi (yechib olingan oyning foydasiga) — faqat o'quvchiga xabar berilib, 10 bank kuni va yana 30 kun o'tgach.",
    rollar: [1, 2, 3, 5],
    adr: ["0055", "0058", "0075"],
```

  in its `kalitSozlar` replace the line `      "qaytarish usuli",` with

```ts
      "pulni qaytarish so'rovi",
      "so'rovni ochish",
      "berildi",
      "10 bank kuni",
      "bank kuni",
      "so'rovni bekor qilish",
      "markazga o'tkazish sharti",
      "xabar berish",
```

  and set its `yangilangan` to `"2026-10-10"`.
- «qarzdorlik» entry: `yollar` becomes `["/payments/debt", "/payments/debt-history", "/payments/debt-write-offs"]`, delete `      "muzlatilgan puli",` from its `kalitSozlar` (it moved to the new page), `yangilangan: "2026-10-10"`.

In `client/src/qollanma/sahifalar/boshlash.ts` set `yangilangan: "2026-10-10"` on «rollar-va-huquqlar» (now `"2026-10-03"`, after `"davomat ochilish vaqti",`) and on «lugat» (now `"2026-10-05"`, after `"bot bloklangan",`).

In `client/src/qollanma/yangiliklar.ts` add as the FIRST element of `yangiliklar` (set `sana` to the Tashkent day the PR is opened; never a future day — the registry test refuses one):

```ts
  {
    sana: "2026-10-10",
    sarlavha: "«Qaytariladigan pul» sahifasi va pulni qaytarish so'rovi",
    matn: "Moliya bo'limida yangi «Qaytariladigan pul» sahifasi bor: muzlatilgan, guruhsiz va ketgan o'quvchilarning balansida qolgan puli uch bo'limda, tepada esa ochiq pulni qaytarish so'rovlari. Pulni qaytarish endi so'rov orqali: «So'rovni ochish» bosilganda balans darhol kamayadi, pul esa 10 bank kuni ichida kassadan beriladi va «Berildi» bilan belgilanadi (kassir ham bosa oladi); hali berilmagan so'rovni CEO yoki filial direktori bekor qiladi. O'quvchiga «pulingizni olib keting» deb bot orqali xabar yuboriladi yoki qo'ng'iroq belgilanadi; «Markaz hisobiga o'tkazish» va «Yechib olish» xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi. «Muzlatilganlarning puli» sahifasi shu yerga ko'chdi.",
    rollar: [1, 2, 3, 5],
    sahifa: { bolim: "tolovlar", sahifa: "qaytariladigan-pul" },
  },
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `cd client && npx vitest run src/qollanma/reyestr.test.ts`
Expected: FAIL — «har yozuvning MDX fayli bor»: `expected [ 'tolovlar/qaytariladigan-pul' ] to deeply equal []`.

- [ ] **Step 3: Write the new guide page**

`client/src/qollanma/kontent/tolovlar/qaytariladigan-pul.mdx`:

```mdx
## Sahifa nima uchun

«Qaytariladigan pul» — hozir o'qimayotgan, lekin balansida puli qolgan o'quvchilar va ochiq pulni qaytarish so'rovlari. Bu yerda pul o'quvchiga qaytariladi, unga «pulingizni olib keting» deb xabar beriladi yoki shartnomaga ko'ra markaz hisobiga o'tkaziladi. Sahifa avvalgi «Muzlatilganlarning puli» o'rnini oldi: eski havola shu sahifaning «Muzlatilganlar» bo'limini ochadi.

Tepada «Bugungi holat · kun.oy» va «Excel» tugmasi. Raqamlar yuqori paneldagi filial tanlagichi bo'yicha.

## Markazda turgan pul

Birinchi karta — «O'qimayotganlarning markazda turgan puli»: pastdagi uch bo'lim balanslarining yig'indisi va necha kishi ekani («N kishi — muzlatilgan, guruhsiz yoki ketgan»). O'qiyotganlarning oldindan to'lagan puli bu yerga kirmaydi: u keyingi oy hisobiga o'tadi.

## Kutilayotgan qaytarishlar

Ochiq, hali berilmagan pulni qaytarish so'rovlari, muddati eng yaqini birinchi. Tepada jami summa va so'rovlar soni, o'ngda «Tarix · N ta» havolasi. So'rov qanday ochilishi — [Pulni qaytarish va yechib olish](/qollanma/tolovlar/pul-qaytarish).

Ustunlar: «O'quvchi», «Summa», «So'ralgan», «Muddat» («kun.oy gacha») va «Holat»:

- «N bank kuni qoldi» — kulrang; 2 va undan kam qolganda sariq. Muddatning oxirgi kuni — «bugun oxirgi kun».
- «muddati o'tdi · N bank kuni» — qizil. Muddat juma kuni tugab, bugun dam olish kuni bo'lsa, faqat «muddati o'tdi».

Har qatorda:

- **«Berildi»** — pul o'quvchiga berilgach bosiladi. Oynada «Berilgan summa» va «Qaysi kassadan» (o'quvchi filialining kassalari, masalan «Naqd — Asosiy kassa»). Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi, sana — bugun.
- **«Bekor qilish»** — faqat pul hali berilmagan bo'lsa. Sabab majburiy; summa o'quvchi balansiga, bekor qilingan darslar joyiga qaytadi.

So'rov bo'lmasa: «Hozir kutilayotgan pul qaytarish yo'q.» va oxirgi marta qachon pul berilgani.

### Qaytarishlar tarixi

«Tarix» havolasi berilgan va bekor qilingan so'rovlarni ochadi, eng yangisi tepada. Ustunlar: «O'quvchi», «Summa», «So'ralgan», «Berildi» (kun va naqd yoki karta; bekor qilinganida «bekor qilindi», sababi sichqonchani ustiga olib borganda chiqadi) va «Kim berdi / Kim bekor qildi». 10.10.2026 dan oldin bir bosishda yozilgan qaytarishlar ham shu yerda, yozilgan kuni berilgan deb.

## Uch bo'lim

Hozir o'qimayotgan, balansi musbat o'quvchilar uch bo'limga bo'linadi. Har bo'lim tugmasida summa, necha kishi va qisqa izoh bor.

| Bo'lim | Kimlar |
|---|---|
| «Muzlatilganlar» | Holati «Muzlatilgan» |
| «Guruhsiz» | Holati «Faol», lekin hech qaysi guruhda o'qimaydi |
| «Ketganlar» | Boshqa holatdagilar: chetlatilgan, bitirgan va hokazo |

- «Muzlatilganlar» da qo'shimcha tugmalar bor: «Hammasi», «30 kungacha», «31–60 kun», «60 kundan ko'p» — muzlatilganiga necha kun bo'lgani bo'yicha. Ustunlar: «O'quvchi», «Muzlatilgan» (sana va necha kun), «Holat» (30 kungacha — «kutilmoqda», 31–60 kun — «muddati o'tgan», 60 kundan ko'p — «ketgan hisoblanadi»), «Puli», «Xabar».
- «Guruhsiz» va «Ketganlar»: «O'quvchi», «Guruhsiz» yoki «Ketgan» (sana va necha kun), «Oxirgi guruh», «Puli», «Xabar».
- «Xabar» — o'quvchiga oxirgi marta qachon va qanday aytilgani: «kun.oy · bot orqali», «kun.oy · qo'ng'iroq qilib aytildi» yoki «berilmagan». O'quvchi holati o'zgargandan oldingi xabar sanalmaydi.

Qidiruv (ism, telefon yoki ID) faqat ochiq bo'limning jadvalini toraytiradi; tugmalardagi summalar o'zgarmaydi. Eng katta balans tepada.

## O'quvchi oynasi

Qatorni bossangiz, o'ng tomonda oyna ochiladi: «Markazdagi puli», «Holat», «Oxirgi guruh», «Oxirgi to'lov», «Telegram bot» (ulangan yoki ulanmagan) va «Xabar». Pastda «Nima qilish mumkin»:

1. Muzlatilgan o'quvchida **«Qaytdi — guruhga qaytarish»**: holatni o'zgartirish oynasi «Faol» tanlangan holda ochiladi. Guruhsizda **«Guruhga qo'shish»**: guruhga qo'shish oynasi, faqat o'quvchi filialining guruhlari bilan.
2. **«Pulni o'quvchiga qaytarish»** — «Pulni qaytarish — so'rov» oynasi.
3. **«Xabar berish»** — Telegram botga ulangan o'quvchiga yuboriladigan matn oldindan ko'rinadi, ostida «Botga xabar yuborish». «Qo'ng'iroq qilib aytildi» har doim bor, izoh ixtiyoriy. Bot xabari yetib bormasa, xabar yozilmaydi. Filialning ham, kompaniyaning ham telefon raqami kiritilmagan bo'lsa, botga yuborib bo'lmaydi.
4. **«Markaz hisobiga o'tkazish»** — «Yechib olish» oynasi. Xabardan 10 bank kuni va yana 30 kun o'tmaguncha qulflangan, sababi sariq rangda yoziladi. Ochilgach yashil satr turadi: «Shart bajarilgan: xabar kun.oy, muddat kun.oy da tugagan, 30 kun o'tdi.».

Amal tugmasi bosilganda o'quvchi oynasi yopiladi va kerakli oyna ochiladi.

Botga yuboriladigan matn (CEO tasdiqlagan, so'zma-so'z):

> Assalomu alaykum, Ali! DaF Sprachzentrum hisobingizda 350 000 so'm qolgan. Uni qaytarib olish uchun 22-noyabrgacha filial raqamiga qo'ng'iroq qiling: +998 XX XXX XX XX. Shu kungacha murojaat bo'lmasa, shartnomaga ko'ra pul markaz hisobiga o'tadi. Rahmat!

Ism, summa va telefon o'quvchiniki va uning filialiniki bo'ladi (filial raqami bo'lmasa, kompaniya raqami); sana — markazga o'tkazish ochiladigan kun.

## Excel

«Excel» to'rt varaqli fayl beradi: «Kutilayotgan», «Muzlatilganlar», «Guruhsiz», «Ketganlar», har birida «Jami» qatori bilan. Qidiruv yozilgan bo'lsa, o'quvchi varaqlariga u ham qo'llanadi.

## Misol

Ismlar va raqamlar soxta.

1. Shanba 10.10.2026. «Ketganlar» bo'limida Lola: balansi 120 000 so'm, «Xabar» — «berilmagan», bot ulangan.
2. Administrator Lolaning oynasini ochib, «Botga xabar yuborish» ni bosdi. «Xabar» ustunida «10.10 · bot orqali» paydo bo'ldi; «Markaz hisobiga o'tkazish» ostida: «Markazga o'tkazish 22.11 dan ochiladi (xabar 10.10 da berilgan, qaytarish muddati 23.10 gacha).».
3. Lola 14.10 da keldi. Administrator «Pulni o'quvchiga qaytarish» → «So'rovni ochish» ni bosdi: balans 0 bo'ldi, «Kutilayotgan qaytarishlar» da «28.10 gacha» va «10 bank kuni qoldi».
4. Kassir 16.10 da pulni naqd berib, «Berildi» → «Naqd — Asosiy kassa» ni tanladi. So'rov «Qaytarishlar tarixi» ga o'tdi: «16.10 · naqd».

## Kim qila oladi

«Ha» — ekranda tugma bor va tizim amalni qabul qiladi. «—» — ekranda yo'q yoki tizim rad etadi. Filial direktori, administrator va kassir faqat o'z filialidagi o'quvchilarni ko'radi; CEO — filial tanlagichida tanlanganini.

| Amal | CEO | Filial direktori | Administrator | Kassir |
|---|---|---|---|---|
| Sahifani, o'quvchi oynasini va tarixni ko'rish, Excel | Ha | Ha | Ha | Ha |
| «Berildi» | Ha | Ha | Ha | Ha |
| «Bekor qilish» | Ha | Ha | — (tugma yo'q) | — (tugma yo'q) |
| «Nima qilish mumkin»: qaytarish so'rovi, xabar berish, markaz hisobiga o'tkazish, guruhga qaytarish yoki qo'shish | Ha | Ha | Ha | — (bo'lim yo'q) |

## Tizimda qayerda

- Moliya → [Qaytariladigan pul](/payments/refunds): Moliya menyusida «Ish haqi» dan keyin. Sahifa hamma xodimga (CEO, filial direktori, administrator, kassir) ko'rinadi.
- «Tarix · N ta» → [Qaytarishlar tarixi](/payments/refunds/history).
- Moliya → «Qarzdorlik» pastida: «Muzlatilganlarning markazda turgan puli — «Qaytariladigan pul» sahifasida.».
```

- [ ] **Step 4: Rewrite the refund guide page**

Replace the whole of `client/src/qollanma/kontent/tolovlar/pul-qaytarish.mdx` with:

```mdx
## Ikki amal

O'quvchi kartasidagi «To'lov» menyusida pulni kamaytiradigan ikkita amal bor. Ikkalasi ham o'quvchining balansini kamaytiradi, lekin bir-biridan farq qiladi.

| | Pulni qaytarish | Yechib olish |
|---|---|---|
| Nima qiladi | O'quvchiga pulini qaytarish uchun so'rov ochadi: balans darhol kamayadi, pul kassadan «Berildi» bosilganda chiqadi | Balansdagi pulni o'quvchiga bermasdan ayiradi: pul markaz hisobiga o'tadi va yechib olingan oyning foydasiga qo'shiladi («Qaytariladigan pul» sahifasida «Markaz hisobiga o'tkazish» deb yoziladi) |
| Pul o'quvchiga beriladimi | Ha: 10 bank kuni ichida, kassadan | Yo'q |
| Qachon mumkin | Balansda yoki oldindan to'langan darslarda pul bo'lsa, istalgan payt | O'quvchiga xabar berilib, 10 bank kuni va yana 30 kun o'tgach |
| Oynaning nomi | «Pulni qaytarish — so'rov» | «Yechib olish» |
| «Barcha yozuvlar» dagi belgi | «Qaytarish» | «Yechib olish» |

Muzlatish, boshqa guruhga o'tkazish va guruhdan chiqarishda o'tilmagan darslar puli qoida bo'yicha o'zi balansga qaytadi: bu naqd qaytarish emas. Oylik kursda o'quvchi o'zi ketsa va oyning 40% idan ko'pi o'tgan bo'lsa (01.10.2026 dan), pul qaytmaydi ([Guruhdan chiqarish](/qollanma/oquvchilar/guruhdan-chiqarish)); dars paketida muzlatishda qaytadigan darslar sonini o'zgartirish mumkin ([Muzlatish va qaytarish](/qollanma/oquvchilar/muzlatish)). O'quvchiga pulni qo'lga berish uchun keyin alohida «Pulni qaytarish» so'rovi ochiladi.

## Pulni qaytarish

### So'rov qanday ishlaydi

10.10.2026 dan har qaytarish so'rov orqali o'tadi:

1. **So'rov ochiladi.** CEO, filial direktori yoki administrator «Pulni qaytarish — so'rov» oynasida «So'rovni ochish» ni bosadi. Shu zahoti summa o'quvchi balansidan ayiriladi (kerak bo'lsa oldindan to'langan darslar bekor qilinadi): bu pul endi darsga, yechib olishga yoki boshqa qaytarishga ketmaydi. Kassadan hali pul chiqmaydi.
2. **Muddat — 10 bank kuni.** So'rov ochilgan kunning ertasidan sanaladi; shanba, yakshanba va Sozlamalar → «Dam olish kunlari» dagi kunlar sanalmaydi. Masalan, so'rov dushanba 28.09.2026 da ochilsa va 01.10 dam olish kuni bo'lsa, pul 13.10 gacha berilishi kerak.
3. **«Berildi».** Pul o'quvchiga berilgach, Moliya → «Qaytariladigan pul» sahifasidagi «Kutilayotgan qaytarishlar» jadvalida «Berildi» bosiladi va pul qaysi kassadan chiqqani tanlanadi. Shu payt kassa qoldig'idan summa ayiriladi va kvitansiya paydo bo'ladi. «Berildi» ni kassir ham bosa oladi.
4. **Yoki «Bekor qilish».** Pul hali berilmagan bo'lsa, CEO yoki filial direktori so'rovni sabab yozib bekor qiladi: summa o'quvchi balansiga, bekor qilingan darslar joyiga qaytadi.

So'rov holatlari: muddat ichida — «N bank kuni qoldi», muddat o'tgach — «muddati o'tdi», keyin «berildi» yoki «bekor qilindi». Berilgan va bekor qilinganlari «Qaytarishlar tarixi» sahifasida turadi ([Qaytariladigan pul](/qollanma/tolovlar/qaytariladigan-pul)).

### Qanday hisoblanadi

- **Qaytarish faqat ikki manbadan.** O'quvchining erkin balansidan va hali o'tilmagan, oldindan to'langan darslaridan (dars paketida). O'tilgan darsga ketgan pul qaytmaydi. «Kelmadi» ham o'tilgan dars hisoblanadi: uning puli qaytmaydi.
- **Avval balans ishlatiladi.** Balans yetmasa, kamomadni qoplaydigan eng kam sonli oldindan to'langan dars bekor qilinadi: o'quvchining oldindagi darslari shuncha kamayadi.
- **Dars narxi — o'quvchi to'lagan narx.** Bekor qilinadigan dars puli o'quvchi aslida to'lagan siklning narxidan olinadi (chegirma va yaxlitlash hisobga olingan), kursning bugungi narxidan emas.
- **Oylik kursda** darslar paket bo'lib to'lanmaydi, shuning uchun oldindan to'langan dars odatda yo'q: qaytariladigan pul — balansdagi ortiqcha pul. Balansi musbat bo'lsa, oyna ogohlantiradi: «Oylik to'lovda o'qiyotgan o'quvchiga faqat balansdagi ortiqcha pul qaytariladi. Shu oyning puli guruhdan chiqarilganda shartnomaning 6.2-bandi bo'yicha hisoblanadi.» Oyning o'tilmagan darslari puli esa o'quvchi guruhdan chiqqanda, muzlatilganda yoki ko'chirilganda o'zi balansga qaytadi — yuqorida aytilgan 40% istisnosi bilan.
- **Dars paketida** oldindan to'langan dars qolmagan, balans esa musbat bo'lsa, oyna «Oldindan to'langan darsi yo'q — faqat balansdagi puldan qaytariladi» deydi.
- **Kursning necha foizi o'tgani cheklamaydi.** Bunday qoida yo'q.
- **Faol guruhi yo'q o'quvchi** (masalan, muzlatilgan) uchun pul faqat balansdan qaytariladi: oyna «Faol guruhi yo'q — pul faqat hisobidagi balansdan qaytariladi» deydi.
- **Ochiq so'rov puli qayta sanalmaydi.** «Oldingi qaytarishlar» qatoriga hali berilmagan so'rovlar ham kiradi: ularning puli balansdan allaqachon ayirilgan.

### Oyna

«Pulni qaytarish — so'rov» oynasi yuqorida o'quvchining hisobini ko'rsatadi:

- «Guruh», «Kurs» — qaytarish qaysi guruh bo'yicha hisoblanadi.
- «To'langan» — o'quvchi jami to'lagan pul. «Oxirgi to'lov» — summa, sana va usul.
- «O'tilgan darslar» — o'quvchi kelgan darslar soni. «Kelmadi» darslar unga kirmaydi, lekin ularning puli baribir qaytmaydi.
- «Hisobidagi balans».
- «Oldindan to'langan darslar» — dars paketida: soni va puli, ostida «Kerak bo'lsa bekor qilinadi». «Oldingi qaytarishlar» — bo'lsa, oldin qaytarilgan jami.
- **«Qaytarish mumkin»** — yashil summa: undan ko'p qaytarib bo'lmaydi.

Ostida «So'rov ochilgach balans 0 bo'ladi. Pul kun.oy gacha berilishi kerak (10 bank kuni). Kassadan pul «Berildi» bosilganda chiqadi.» degan satr turadi: sana — bugun ochilgan so'rovning oxirgi kuni.

To'ldiriladigan maydonlar:

1. **«Qaytarish summasi».** «Tavsiya: ... so'm» havolasi eng ko'p mumkin bo'lgan summani kiritadi. Summa maksimumdan oshsa, «Maksimum ... so'm qaytarish mumkin» chiqadi. Summa balansdan ko'p bo'lsa: «Balansdagi pul yetmaydi — yetishmagan qismi oldindan to'langan darslarni bekor qilish hisobidan qaytariladi».
2. **«Sabab (ixtiyoriy)».**
3. **«So'rovni ochish»** tugmasi. Bosgach «So'rov ochildi — pul kun.oy gacha beriladi» xabari chiqadi.

Oyna pul qanday berilishini so'ramaydi: naqd yoki karta — «Berildi» da tanlangan kassaga qarab yoziladi.

### Himoya va hisobot

- Aynan bir xil qaytarish (o'quvchi, guruh, summa) 60 soniya ichida takrorlansa, tizim rad etadi: «Shu summadagi qaytarish hozirgina yozildi — takror yuborilmadi».
- Qaytarilgan pul «Foyda tarkibi» da alohida «Qaytarilgan pul» qatori bo'lib, «Sof foyda» dan ayriladi — so'rov ochilgan kun hisobiga. Kassa va pul oqimi hisobotlarida esa pul «Berildi» bosilgan kuni chiqadi. Bekor qilingan so'rov hech qaysi oyda sanalmaydi.
- O'quvchining to'lovlar hisobotida bu qator «Pul qaytarish (kun.oy)» deb yoziladi.

## Yechib olish

«Yechib olish» o'quvchining musbat balansini o'quvchiga bermasdan kamaytiradi: pul o'quvchiga qaytmaydi, uni berish kerak emas. Pul markaz hisobiga o'tadi va **yechib olingan oyning foydasiga** qo'shiladi: Moliya → «Umumiy ma'lumotlar» dagi «Foyda» kartasini bossangiz, ochiladigan oynadagi «Foyda tarkibi» bo'limida (CEO va filial direktori ko'radi) u alohida «Balansdan yechib olingan» qatori bo'lib turadi, ostida nechta o'quvchi balansidan olingani yoziladi. Yechib olish bo'lmagan oyda bu qator chiqmaydi. «Tushumlar» kartasi o'zgarmaydi: pul o'quvchi to'lagan kuni tushumga kirgan.

Oyni tanlab bo'lmaydi: tizim har doim joriy oyni (Toshkent vaqti bilan) yozadi. Shuning uchun o'tgan oyning foydasi keyin o'zgarmaydi.

### Markazga o'tkazish sharti

10.10.2026 dan shartnomaga ko'ra yechib olishdan oldin o'quvchiga «pulingizni olib keting» deb aytilgan bo'lishi kerak:

- Xabar «Qaytariladigan pul» sahifasidagi o'quvchi oynasida beriladi: Telegram botga ulangan o'quvchiga «Botga xabar yuborish», qolganlariga qo'ng'iroq qilinadi va «Qo'ng'iroq qilib aytildi» belgilanadi.
- Yechib olish xabardan keyin 10 bank kuni (qaytarish muddati) va yana 30 kun o'tgach ochiladi. Masalan, xabar shanba 10.10.2026 da berilsa, muddat 23.10 da tugaydi, yechib olish 22.11 dan ochiladi.
- Xabar o'quvchining hozirgi holatida berilgan bo'lishi kerak: o'quvchi qaytib, keyin yana ketgan bo'lsa, oldingi xabar sanalmaydi.
- Shart bajarilmagan bo'lsa, «Yechib olish» oynasida sabab sariq rangda yoziladi va tugma ishlamaydi: «Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.» yoki «Markazga o'tkazish kun.oy dan ochiladi (xabar kun.oy da berilgan, qaytarish muddati kun.oy gacha).». Bajarilgan bo'lsa, yashil satr: «Shart bajarilgan: xabar kun.oy, muddat kun.oy da tugagan, 30 kun o'tdi.».

Shart har yechib olishga tegishli, o'quvchi kartasidagi «Yechib olish» ga ham.

Amal ikki joyda bor:

- O'quvchi kartasidagi «To'lov» menyusida.
- «Qaytariladigan pul» sahifasidagi o'quvchi oynasida, «Markaz hisobiga o'tkazish» nomi bilan (o'sha «Yechib olish» oynasini ochadi).

Oyna:

- «Hozirgi balans» va «Yechilishi mumkin» — yechilishi mumkin bo'lgan eng ko'p summa balansga teng. Balans nol yoki minus bo'lsa: «Bu o'quvchining yechib olishga pul mavjud emas».
- Markazga o'tkazish sharti: sariq yoki yashil satr (yuqorida).
- «Yechib olish summasi» — oldindan eng ko'p summa turadi. Ostida «Bu pul ... foydasiga qo'shiladi.» yoziladi: oy nomi joriy oy.
- «Ustoz balansiga yozilsinmi?» («Ustozning joriy oy oyligiga yoziladi.») — yoqilsa, «Ustoz» ro'yxatidan ustoz tanlanadi va uning oyligiga yechilgan summaga teng ulush yoziladi. Ulush yechib olingan kunning o'zi bilan saqlanadi va shu kun tushgan oylik davriga kiradi. Ro'yxatda faqat o'quvchining faol guruhlaridagi ustozlar turadi; bunday ustoz bo'lmasa: «O'quvchining faol guruhlarida ustoz topilmadi».
- «Sabab (ixtiyoriy)»: yozilmasa, «Barcha yozuvlar»da izoh «Yechib olish (2026-10)» ko'rinishida turadi.
- «Yechib olish» tugmasi. Bosgach «... so'm muvaffaqiyatli yechib olindi» xabari chiqadi.

Yechib olingan pul o'quvchining hisobotida «balansdan olindi» deb yoziladi. Yozuv o'chirilmaydi va ekranda uni bekor qiladigan tugma yo'q, shuning uchun summani tasdiqlashdan oldin tekshiring.

## Misol

Ismlar soxta.

**Dars paketi.** Nilufar: sikl narxi 1 200 000 so'm, 12 dars (bir dars 100 000 so'm). Balansi 200 000 so'm, oldindan to'langan 5 dars (500 000 so'm). Oynada «Qaytarish mumkin: 700 000 so'm».

1. Administrator 450 000 so'mga so'rov ochdi. Balansdan 200 000 so'm olinadi; kamomad 250 000 so'm.
2. 250 000 ni qoplaydigan eng kam dars soni — 3 (3 × 100 000 = 300 000). Shuncha oldindan to'langan dars bekor qilinadi: 300 000 so'm balansga qo'shiladi.
3. Balans: 200 000 + 300 000 − 450 000 = 50 000 so'm. Oldindan to'langan darslar 5 tadan 2 taga tushadi.
4. Kassir pulni naqd berib, «Berildi» da filial kassasini tanladi: kassa qoldig'i shu kuni 450 000 so'mga kamaydi.

**Oylik kurs.** Jasur oldindan to'lagan: balansi 300 000 so'm. Oynada «Qaytarish mumkin: 300 000 so'm» va oylik to'lov haqidagi ogohlantirish turadi. 300 000 so'mga so'rov ochilsa, balans 0 bo'ladi.

**Yechib olish.** Bobur guruhdan ketgan, balansida 300 000 so'm qolgan, Telegram botga ulangan. Shanba 10.10.2026 da administrator «Qaytariladigan pul» sahifasida uning oynasini ochib, «Botga xabar yuborish» ni bosdi. Qaytarish muddati 23.10 da tugadi, Bobur murojaat qilmadi. «Markaz hisobiga o'tkazish» 22.11 dan ochildi; administrator 24.11.2026 da 300 000 so'm yechib oldi va u noyabrning foydasiga qo'shildi.

## Istisnolar

- Qarzdor o'quvchiga qaytariladigan pul yo'q: «Qaytarish mumkin» 0 bo'ladi.
- Guruhdan chiqarish oynasidagi «Pul (shartnoma bo'yicha)» bloki va muzlatish oynasi qaytadigan pulni balansga o'tkazadi; naqd bermaydi.
- «Pulni qaytarish» o'quvchi kartasidan tashqari «Qaytariladigan pul» sahifasidagi o'quvchi oynasida ham «Pulni o'quvchiga qaytarish» nomi bilan turadi: ikkalasi bir xil so'rov ochadi.
- So'rov bo'lib-bo'lib berilmaydi: «Berildi» butun summani yopadi.
- Berilgan qaytarishni ekranda bekor qilib bo'lmaydi.

## Kim qila oladi

«Ha» — ekranda tugma bor va tizim amalni qabul qiladi. «—» — ekranda yo'q yoki tizim rad etadi. Filial direktori, administrator va kassir faqat o'z filialidagi o'quvchi bilan ishlaydi.

| Amal | CEO | Filial direktori | Administrator | Kassir |
|---|---|---|---|---|
| Pulni qaytarish so'rovini ochish | Ha | Ha | Ha | — |
| «Berildi» | Ha | Ha | Ha | Ha |
| So'rovni bekor qilish | Ha | Ha | — | — |
| O'quvchiga xabar berish | Ha | Ha | Ha | — |
| Yechib olish | Ha | Ha | Ha | — |
| «Qaytariladigan pul» sahifasini va tarixini ko'rish | Ha | Ha | Ha | Ha |

Kassir so'rov ocha olmaydi va yechib ola olmaydi: tizim rad etadi, o'quvchi oynasida «Nima qilish mumkin» bo'limi unga chiqmaydi.

## Tizimda qayerda

- [O'quvchi kartasi](/qollanma/oquvchilar/oquvchi-kartasi): chap ustundagi «To'lov» menyusi → «Pulni qaytarish» va «Yechib olish». Bu menyu CEO, filial direktori va administratorga ko'rinadi.
- Moliya → [Qaytariladigan pul](/qollanma/tolovlar/qaytariladigan-pul): «Kutilayotgan qaytarishlar» («Berildi», «Bekor qilish», «Tarix»), o'quvchi oynasida «Pulni o'quvchiga qaytarish», «Xabar berish» va «Markaz hisobiga o'tkazish».
- Moliya → «Umumiy ma'lumotlar» → «Foyda» kartasini bosing → «Foyda tarkibi»: «Balansdan yechib olingan» va «Qaytarilgan pul» qatorlari.
- Qaytadigan pul qanday hisoblanishi — [Oylik to'lov](/qollanma/tolovlar/oylik-tolov), [Dars paketi](/qollanma/tolovlar/dars-paketi).
```

- [ ] **Step 5: Point the other guide pages at the new page**

`client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx`:

1. Replace `«Oylar bo'yicha qarz tarixi», «Kechirilgan qarzlar arxivi · N ta» va «Muzlatilganlarning puli» — alohida sahifalar, har birida «← Qarzdorlik».` with

```
«Oylar bo'yicha qarz tarixi» va «Kechirilgan qarzlar arxivi · N ta» — alohida sahifalar, har birida «← Qarzdorlik». Ostidagi «Muzlatilganlarning markazda turgan puli — «Qaytariladigan pul» sahifasida.» satri o'sha sahifaning «Muzlatilganlar» bo'limini ochadi.
```

2. Under `### Muzlatilganlarning puli`, replace the paragraph that begins `Muzlatilgan, balansi musbat va muzlatilganiga 30 kundan ortiq bo'lgan o'quvchilar.` (the whole line) with

```
Bu sahifa «Qaytariladigan pul» ga aylandi: unda muzlatilgan, guruhsiz va ketgan o'quvchilarning balansida qolgan puli va pulni qaytarish so'rovlari turadi ([Qaytariladigan pul](/qollanma/tolovlar/qaytariladigan-pul)). Eski havola o'sha sahifaning «Muzlatilganlar» bo'limini ochadi.
```

3. In «Kim qila oladi» replace the two rows

```
| «Muzlatilganlarning puli» ro'yxatini ko'rish | Ha | Ha | Ha | Ha |
| «Muzlatilganlarning puli» dagi amallar («Markaz hisobiga o'tkazish», «O'quvchiga qaytarish») | Ha | Ha | Ha | — (amallar ustuni yo'q) |
```

with

```
| Muzlatilganlarning puli — «Qaytariladigan pul» sahifasi ([kim nima qiladi](/qollanma/tolovlar/qaytariladigan-pul)) | Ha | Ha | Ha | Ha |
```

`client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx` — replace the two rows

```
| Pulni qaytarish (o'quvchi profilidagi «To'lov» menyusi; «Muzlatilganlarning puli» sahifasida «O'quvchiga qaytarish») | Ha | Ha | Ha | — | — |
| Balansdan pulni yechib olish (profildagi «Yechib olish»; «Muzlatilganlarning puli» sahifasida «Markaz hisobiga o'tkazish») | Ha | Ha | Ha | — | — |
```

with

```
| Pulni qaytarish so'rovini ochish (o'quvchi profilidagi «To'lov» menyusi; «Qaytariladigan pul» sahifasida «Pulni o'quvchiga qaytarish») | Ha | Ha | Ha | — | — |
| Pul berilganini belgilash («Qaytariladigan pul» → «Berildi») | Ha | Ha | Ha | — | Ha |
| Pulni qaytarish so'rovini bekor qilish (pul hali berilmagan bo'lsa) | Ha | Ha | — | — | — |
| O'quvchiga balansdagi pul haqida xabar berish («Qaytariladigan pul» → «Xabar berish») | Ha | Ha | Ha | — | — |
| Balansdan pulni yechib olish (profildagi «Yechib olish»; «Qaytariladigan pul» sahifasida «Markaz hisobiga o'tkazish»; xabardan 10 bank kuni va 30 kun o'tgach) | Ha | Ha | Ha | — | — |
```

`client/src/qollanma/kontent/boshlash/lugat.mdx`:

1. Replace the line starting `- **Muzlatilgan puli** — «Muzlatilganlarning puli» sahifasi` with

```
- **Muzlatilgan puli** — muzlatilgan o'quvchi balansida qolgan pul; «Qaytariladigan pul» sahifasining «Muzlatilganlar» bo'limida turadi.
```

2. Replace `- **Pulni qaytarish** — o'quvchiga pulini qaytarib berish: qaytariladigan summa oynada «Qaytarish mumkin» qatorida ko'rinadi. O'tilgan darsning puli qaytmaydi.` with

```
- **Pulni qaytarish** — o'quvchiga pulini qaytarib berish so'rovi: balans so'rov ochilganda kamayadi, pul 10 bank kuni ichida kassadan beriladi («Berildi»). Qaytariladigan summa oynada «Qaytarish mumkin» qatorida ko'rinadi. O'tilgan darsning puli qaytmaydi.
```

3. Replace `Pastida qarz tarixi, kechirilgan qarzlar arxivi va muzlatilganlarning puli sahifalariga havolalar.` (end of the «Qarzdorlik» line) with

```
Pastida qarz tarixi va kechirilgan qarzlar arxivi sahifalariga havolalar.
- **Qaytariladigan pul** — Moliya bo'limidagi sahifa: o'qimayotgan o'quvchilarning balansida qolgan puli (muzlatilganlar, guruhsiz, ketganlar) va ochiq pulni qaytarish so'rovlari.
```

- [ ] **Step 6: Run the guide tests to verify they pass**

Run: `cd client && npx vitest run src/qollanma`
Expected: PASS — registry (MDX files, `yollar` match `refunds/page.tsx` and `refunds/history/page.tsx`, no breadcrumb clash, every `/qollanma/...` link resolves, news sorted and not in the future), search, role filter, route match, mermaid.

- [ ] **Step 7: Update `client/CLAUDE.md`**

1. In «Frontend role-check pattern», replace `` `STATEMENT_ROLES`, `FROZEN_BALANCE_ACTION_ROLES`) `` with `` `STATEMENT_ROLES`, `REFUND_REQUEST_ROLES`, `REFUND_HAND_OVER_ROLES`, `REFUND_CANCEL_ROLES`) ``.

2. In the Financial UI table's `/payments/debt` row replace

```
Footer links to the three pages below. Old links redirect on the server (`legacyDebtRedirect`): `?tab=qarzdorlar` → Shu oy, `?tab=oylik|kechirilgan|muzlatilgan` → the pages below,
```

with

```
Footer links to the two pages below, and the line «Muzlatilganlarning markazda turgan puli — «Qaytariladigan pul» sahifasida.» links `/payments/refunds?tab=muzlatilgan`. Old links redirect on the server (`legacyDebtRedirect`): `?tab=qarzdorlar` → Shu oy, `?tab=oylik|kechirilgan` → the pages below, `?tab=muzlatilgan` → `/payments/refunds?tab=muzlatilgan`,
```

3. Replace the row

```
| `/payments/debt-history`, `/payments/debt-write-offs`, `/payments/frozen-balances` | `debt/debt-subpage.tsx` + the existing views | Real pages again (B2a): the month-by-month history, the write-off archive, the frozen balances (temporary, until «Qaytariladigan pul»), each with «← Qarzdorlik». `/payments/debtors` still redirects to `/payments/debt`. |
```

with

```
| `/payments/debt-history`, `/payments/debt-write-offs` | `debt/debt-subpage.tsx` + the existing views | Real pages again (B2a): the month-by-month history and the write-off archive, each with «← Qarzdorlik». `/payments/debtors` still redirects to `/payments/debt`; `/payments/frozen-balances` redirects to `/payments/refunds?tab=muzlatilgan` (B2b). |
| `/payments/refunds` | `refunds/refunds-page.tsx` | **«Qaytariladigan pul» (spec B2b, ADR-0075).** One request, `GET /refundable/list` (`refunds-queries.ts`); URL `REFUNDS_SCHEMA`: `tab=muzlatilgan|guruhsiz|ketgan`, `age=upto30|d31to60|over60` (Muzlatilganlar only), `search`, `page`/`pageSize` (20), `pendingPage`/`pendingPageSize` (10). «Bugungi holat · dd.MM» and «Excel» (`GET /refundable/excel?search=`). The summary «O'qimayotganlarning markazda turgan puli» is the one place the three tabs are added (money held). «Kutilayotgan qaytarishlar»: every `REQUESTED` refund, the pill from the server's `due` (`duePill`: «N bank kuni qoldi», amber at ≤ 2, «bugun oxirgi kun», «muddati o'tdi · N bank kuni»), «Berildi» (`REFUND_HAND_OVER_ROLES`, Cashier included; drawers from the list's `cashAccounts` of the row's branch, because `GET /cash-accounts` is CEO/BD-only) and «Bekor qilish» (`REFUND_CANCEL_ROLES`, required reason) in `refunds/pending-dialogs.tsx`. Tab buttons with the server's totals; `refunds-tables.tsx` prints «Xabar» from the latest valid notice. Row click opens `refundable-drawer.tsx` (`GET /refundable/students/:id`): facts, then «Nima qilish mumkin» for `REFUND_REQUEST_ROLES` only — «Qaytdi» (`ChangeStatusDialog` with `initialStatus="ACTIVE"`), «Guruhga qo'shish» (`EnrollToGroupDialog` with the student's branch), the refund dialog, «Xabar berish» (the server's `noticePreview`, never composed on the client; `POST /students/:id/balance-notices`) and «Markaz hisobiga o'tkazish» (locked with the server's `transfer.refusal`, `transfer-note.tsx`). The drawer closes before any dialog opens. Every mutation runs `invalidateRefunds` (list, drawer, history, `financial-overview`, `student-payments`, debt keys), never optimistic. |
| `/payments/refunds/history` | `refunds/refund-history-page.tsx` | `GET /refunds?status=COMPLETED,REJECTED`, newest request first, `?page=&pageSize=` (10). «Berildi» = «dd.MM · naqd|karta» or the «bekor qilindi» pill with the reason in a tooltip; «← Qaytariladigan pul». |
```

4. After the bullet `- **`record-payment-dialog.tsx`** — Manual payment entry: student select, amount, method, contract (optional), receipt number` add:

```
- **`refund-dialog.tsx`** — «Pulni qaytarish — so'rov» (spec B2b §4): opens a `REQUESTED` refund through `POST /refunds/quick`; no method field (the drawer picked at «Berildi» decides cash or card), the line «So'rov ochilgach balans 0 bo'ladi. Pul dd.MM gacha berilishi kerak…» from the preview's `dueDate`, the toast from the answer's `dueDate`. Profile (CEO/BD/Admin) and the refundable drawer open the same dialog.
- **`withdrawal-dialog.tsx`** — «Yechib olish»: shows `TransferNote` from `GET /withdrawals/preview` → `transfer` (the server's refusal in amber, or «Shart bajarilgan: …» in green) and keeps every field and the button disabled while `transfer.allowed` is false.
```

- [ ] **Step 8: Commit**

```bash
git add client/src/qollanma/sahifalar/tolovlar.ts client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/yangiliklar.ts \
  client/src/qollanma/kontent/tolovlar/qaytariladigan-pul.mdx client/src/qollanma/kontent/tolovlar/pul-qaytarish.mdx \
  client/src/qollanma/kontent/tolovlar/qarzdorlik.mdx client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx \
  client/src/qollanma/kontent/boshlash/lugat.mdx client/CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(guide): refund requests and the refundable money page

New «Qaytariladigan pul» guide page; «Pulni qaytarish va yechib olish»
rewritten for the request flow and the transfer condition; the debt page,
roles table and glossary point to the new page; news entry. client/CLAUDE.md
lists the new routes, components and role constants.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Whole-client check once, after the last task**

Run: `cd client && npx vitest run && npx tsc --noEmit -p . && npx eslint src`
Expected: every test file passes, tsc prints nothing, eslint reports `0 errors` (warnings that existed before are not this plan's). Then `npm run build` from `client/` (not in parallel with the server tests).

---

## Spec coverage (client)

| Spec | Task |
|---|---|
| §3 roles (CEO/BD/Admin/Cashier read), nav after «Ish haqi» `[1,2,3,5]`, breadcrumb, header branch | 10 (roles), 14 (nav, breadcrumb, page) |
| §3.1 header «Qaytariladigan pul», «Bugungi holat · dd.MM», «Excel» | 14 |
| §3.2 summary card and its two lines | 10 (`summaryLine`), 14 |
| §3.3 pending block: total, count, «Tarix · N ta →», rule line, columns, pills (amber ≤ 2, red overdue), actions per role, paging 10–50, empty state with «Oxirgisi dd.MM da berilgan.» | 10, 14 |
| §3.3 «Berildi» dialog (summa, «Qaysi kassadan», note, «Yopish»/«Berildi») and «Bekor qilish» dialog (consequence, required «Sabab», destructive button) | 11 |
| §3.4 three tabs, totals, sub-lines, age chips, columns, «Holat» buckets, «Xabar», rule lines, search in the URL, server paging (20, 10–50) | 10, 14 |
| §3.5 drawer: header, «Markazdagi puli», five facts, four options by kind and role, notice preview + both buttons, transfer lock / green line, drawer closes before dialogs | 12, 14 |
| §3.6 history page: columns, «bekor qilindi» with reason on hover, «Kim berdi / Kim bekor qildi», «← Qaytariladigan pul», old rows' `processedAt` (server field) | 15 |
| §3.7 Excel button with the active search | 14 |
| §3.8 `/payments/frozen-balances` redirect, `frozen-balance-view.tsx` and `FROZEN_BALANCE_ACTION_ROLES` deleted, debt footer line, `debt-url` legacy, `activePrefixes` | 15 |
| §3.8 profile «Pulni qaytarish» opens a request, hidden for Cashier | 13 (dialog; Decision 10: already hidden) |
| §4 refund dialog: title, due line from `dueDate`, «So'rovni ochish», toast «So'rov ochildi — pul dd.MM gacha beriladi» | 10, 13 |
| §5.1 notice from the drawer (BOT with preview / CALL with optional note; hidden for Cashier) | 12 |
| §5.2 transfer lock in the drawer and in every «Yechib olish» | 12 |
| §5.3 bot text shown exactly as the server renders it | 12 (`noticePreview`) |
| §8 folder, role constants, nav, breadcrumbs, redirects, guide (`pul-qaytarish.mdx`, new page, `yangiliklar.ts`, `qarzdorlik.mdx`) | 10–16 |

## Contract gaps

None — every client need is in the API contract. Two notes for the reviewer:

- **Spec gap, not a contract gap: a studying student can never be given a notice.** The notice buttons live only in the drawer, and the drawer opens only from the list of non-studying students; the profile has no «Xabar berish». Because §5.2 applies to every withdrawal, the profile's «Yechib olish» stays locked forever for a student who is studying. Proposal: accept it (a studying student's balance is next month's money, spec §3.2) and say so in ADR-0075; if the CEO wants it, add «Xabar berish» to the profile's «To'lov» menu later, reusing `NoticeOption`.
- **The client relies on `chips` being the frozen tab's counts on every tab** (the «Muzlatilganlar» button's «N tasi 30 kundan oshgan» shows on all tabs). The server plan's `RefundableService.list` already computes them from every row, whatever `tab` is; keep it that way.
