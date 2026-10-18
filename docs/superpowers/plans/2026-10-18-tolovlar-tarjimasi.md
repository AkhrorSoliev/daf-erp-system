# Payments Section («Moliya» / `/payments/*`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the payments section draws (shell and menu, «Umumiy ma'lumotlar», «To'lovlar», «Xarajatlar», «Qarzdorlik» and its sub-pages, «Qaytariladigan pul», «Ish haqi» with its sheets and dialogs, the gateway events page, and the money dialogs opened from them) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md`, `…guruhlar-tarjimasi.md` and `…ustozlar-tarjimasi.md` (read their «Global Constraints»). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of `docs/superpowers/plans/2026-10-18-ustozlar-tarjimasi.md` once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t`, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons learned from earlier reviews), with these additions:

- Money: figures keep their format (`formatNumber`/`formatPrice`/`formatBalance(x, t("so'm"))`); «so'm» → `t("so'm")` (сум / Sum / UZS). `mln` abbreviations built in code (`mln()` in `salary-page-model.ts` and similar) take the unit through a `t` parameter or `msg()`; never concatenate a translated word to a number — use `{n}` placeholders.
- **Finance wording must be exact.** Use the existing dictionary vocabulary (look up «Qarz», «To'lov», «Balans», «Oylik», «Avans», «Qaytarish», «Hisoblandi», «Tasdiqlandi», «Berildi» … in `ru.ts`/`de.ts`/`en.ts` before choosing; reuse an entry only when its existing translation fits the new context). Key clashes to watch (found in earlier reviews): «Oylik» means salary on salary pages but «monthly» in payment-model labels — make the Uzbek text specific where both occur; «Bekor qilingan» (de «Storniert» = reversed payment, not a cancelled lesson/group); «Kutilmoqda» (ru plural); «Faol» (ru masculine); «Tizim» (colour mode) → «Tizim (avtomatik)» for a system author; «To'xtatilgan» vs «Vaqtincha to'xtatilgan».
- Texts the server builds are never translated: the «Nimaga ketdi» pills and labels (`parts[].label`), statement wording, `view.*` strings, refusal/error messages, notice previews (`noticePreview`), PDF/Excel content, month-state texts the server sends. Only texts the client words itself (and codes the client maps to words) are translated. When unsure whether a string is the server's, read the component and the matching type in `types.ts` / `*-types.ts`.
- Out of scope: reports (`/reports/*`), student profile money dialogs (already translated), `components/payments/possible-deductions-info.tsx` (already translated), the sidebar (already translated), server files. Files shared with other pages keep their default Uzbek output identical outside a provider.
- Paths below are under `client/src/components/payments/` unless stated.

---

### Task 1: Shell, menu and the money dialogs

**Files:** `payments-layout-shell.tsx`, `payments-mobile-menu.tsx`, `summary-card.tsx`, `export-options-popover.tsx`, `record-payment-dialog.tsx`, `record-payment-admission.ts`, `record-payment-quick-amounts.ts`, `refund-dialog.tsx`, `withdrawal-dialog.tsx`, `employee-advance-select.tsx`, `own-payroll.ts`, `promise-month.ts`, `month-label.test.ts`'s subject (find the helper), `lib/payments-nav.ts` (menu titles → `msg()`; keep `payments-nav` tests green), `app/(dashboard)/payments/layout.tsx` and the route pages' own text only if any; dictionaries and `i18n/i18n-coverage.test.ts`. Existing tests stay green.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** `record-payment-admission.ts` / `…quick-amounts.ts` build client sentences → optional last `t` parameter defaulting to identity (as in earlier tasks), tests unchanged. Commit message: `feat(client): translate the payments shell and money dialogs into ru, de, en`.

---

### Task 2: «Umumiy ma'lumotlar» (overview)

**Files:** everything in `overview/` (`overview-page.tsx`, `month-charges-card`, `debt-cards`, `cash-card`, `income-dialog`, `salary-card`, `profit-card`, `profit-dialog`, `months-table`, `recent-payments`, `block-state.tsx` (already translated), `overview-math.ts`, and any other file there); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The «Qanday hisoblandi» lines built in `overview-math.ts` are client sentences (placeholders, optional `t`); the server's figures are data. Month names «Oktabr 2026» come from a fixed list → `msg()`. Commit message: `feat(client): translate the payments overview into ru, de, en`.

---

### Task 3: «To'lovlar» (the payments list)

**Files:** everything in `list/` (`payments-list-page.tsx`, `payments-url.ts`, `payments-queries.ts`, `payments-period-bar.tsx`, `payments-summary-card.tsx`, `payments-filter-bar.tsx`, `payments-table.tsx`, `payment-drawer.tsx`, `payment-drawer-model.ts`, `reverse-payment-dialog.tsx`, `payments-format.ts`, `PaymentsPager` wherever it lives and any other file there); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Period button labels, filter placeholders and options, the drawer's captions and button texts, «Tanlangan: N ta to'lov · X so'm», pager texts, empty/error states are texts; the server's «Nimaga ketdi» pills are not. URL keys and values stay unchanged. Commit message: `feat(client): translate the payments list into ru, de, en`.

---

### Task 4: «Xarajatlar» (expenses)

**Files:** everything in `expenses/` (`expenses-page.tsx`, `expenses-header.tsx`, `expenses-missing-card.tsx`, `expenses-month-card.tsx`, `expenses-filter-bar.tsx`, `expenses-table.tsx`, `expense-form-dialog.tsx`, `expense-source-field.tsx`, `expenses-labels.ts` (category labels → `msg()`; the test that pins keys to `schema.prisma` stays green), `expenses-url.ts`, and any other file there); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The eight category labels are client texts (the keys are codes). Commit message: `feat(client): translate expenses into ru, de, en`.

---

### Task 5: «Qarzdorlik» — page, drawer and write-offs

**Files:** everything in `debt/` (`debt-page.tsx`, `debt-drawer.tsx`, the tab/filter/table files, `debt-subpage.tsx`, `center-topup-view.tsx`, `center-topup-content.tsx`, …; 1878 lines — read each file fully once), `debt-write-offs-client.tsx`, `debt-write-off-actions.ts` (+ test); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The three tab names, the rule line under each tab, the kind chips, the promise filter options and sort options, drawer captions and buttons are texts; debt figures, months from the server statement, promise notes are data. Commit message: `feat(client): translate the debt page into ru, de, en`.

---

### Task 6: Debt history and «Qaytariladigan pul» (refunds)

**Files:** everything in `debt-history/` (656 lines) and `refunds/` (`refunds-page.tsx`, `refunds-tables.tsx`, `refundable-drawer.tsx`, `pending-dialogs.tsx`, `refund-history-page.tsx`, `transfer-note.tsx`, `refunds-queries.ts`, …); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** `duePill` words («N bank kuni qoldi», «bugun oxirgi kun», «muddati o'tdi · N bank kuni») are client texts built from the server's `due` figures (placeholders, no plural agreement). The server's `noticePreview`, `transfer.refusal` and facts text are not translated. Commit message: `feat(client): translate debt history and refunds into ru, de, en`.

---

### Task 7: «Ish haqi» — page, table, drawer, advances

**Files:** `salary-client.tsx`, `salary-monthly-view.tsx`, `salary-advances-tab.tsx`, `salary-advance-calendar.tsx`, `salary-advance-day-panel.tsx`, `salary-advance-dialog.tsx`, `salary-delete-advance-dialog.tsx`, `advance-row-actions.tsx`, `salary-inactive-badge.tsx`, `salary-utils.ts`, and everything in `salary/` (`salary-summary-card`, `salary-attention-card`, `salary-people-table`, `salary-row-drawer`, `salary-drawer-sections`, `salary-drawer-model.ts`, `salary-pay-dialog`, `salary-pay-model.ts`, `salary-page-model.ts`, `salary-advances-table`, `salary-center-recovery-card`, `salary-queries.ts`, …); dictionaries and `i18n-coverage.test.ts`. Existing tests stay green (the pure models' sentences get an optional last `t` or `msg()`).

- [ ] **Step 1: same procedure.** Month-state pills, row statuses, drawer hints (`drawerHint`), the «Hisob» equation labels, button texts and the pay dialog's live check line («Naqd + karta = X so'm») are client texts; names, positions typed by staff, amounts and accounts are data; texts the server sends in `monthState` are not. `mln(…)` takes the unit via `t`. CSV column headers produced for download stay Uzbek (file content is not translated). Commit message: `feat(client): translate the salary page into ru, de, en`.

---

### Task 8: «Ish haqi» — rates sheets and settle dialog

**Files:** `salary-settings-sheet.tsx`, `salary-config-row-sheet.tsx`, `salary-config-bulk-dialog.tsx`, `salary-config-reapply-dialog.tsx`, `salary-config-reapply.ts`, `salary-staff-config-list.tsx`, `salary-config-history.ts`, `salary-settle-month-dialog.tsx`, `salary-settings-access.ts` (labels only), `salary-breakdown-rate-badge` subject, and `salary/` leftovers not done in Task 7; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Rate type names (Foiz, O'quvchi boshiga, Oylik qat'iy …), «Faol emas» / «Oyligini CEO belgilaydi» labels, the history lines (`effectivePeriodLabel` etc. keep date arithmetic untouched, only words change), validation messages and the settle dialog's instructions are texts. Commit message: `feat(client): translate salary rates and settling into ru, de, en`.

---

### Task 9: Gateway events

**Files:** `gateway-events-client.tsx`, `gateway-events-detail-dialog.tsx`, `gateway-events-filter-bar.tsx`, `gateway-events-helpers.ts`, `gateway-events-outcome-badge.tsx`, `app/(dashboard)/payments/gateway-events/*` only if it has text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Outcome words (Muvaffaqiyatli, Kutilmoqda, Rad etilgan), column headers, filters and the detail dialog's captions are texts; raw payload, provider names (Payme, Click, Uzum) and signatures are data. Commit message: `feat(client): translate gateway events into ru, de, en`.

---

### Task 10: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the payments section, remove payments from the not-translated list, mention shared files that now follow the language, e.g. `Select`s or `PaymentsPager` if they live elsewhere).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the payments section as translated`.
