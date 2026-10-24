# Reports Section («Hisobotlar» / `/reports/*`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the reports section draws (shell and menu, lead funnel, departed students, attendance, bot report, center activity, audience, admin KPI, group payments, marketing, lesson ratings) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to the earlier stages (students, groups, teachers, payments). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of `docs/superpowers/plans/2026-10-18-ustozlar-tarjimasi.md` and `docs/superpowers/plans/2026-10-18-tolovlar-tarjimasi.md` once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons learned from the earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms and months, no `t` in fetching-effect deps), with these additions:

- **Reports are read by the CEO to take decisions: wording must be exact.** Reuse the established vocabulary of the already translated sections (students, groups, payments): the same Uzbek concept must read the same everywhere («Ketgan», «Faol», «Davomat», «Qarz», «Lid», «Kurs», «Guruh», «Ustoz»). Check each existing key's translation fits the new context (ru number/gender: a column header or chip is often plural; «Faol» = ru masculine; «Kutilmoqda» = ru plural; «Oylik» salary vs monthly) and make the Uzbek text more specific when it does not. Record every Uzbek text change in the report.
- Every figure, percentage, signal text, «Qanday hisoblandi» line, insight sentence and structure the server sends is data: the client only formats it. Sentences the CLIENT assembles from the server's structure (e.g. the heat-matrix insight sentence in `center-activity-format.ts`, `unownedConversionsText`, `bot-report-format.ts`, `marketing-format.ts` sentence, `departed-format.ts`, `attendance-format.ts`, `kpi-format.ts`, `rating-format.ts`) are client texts: their `.ts` helpers take an optional last `t` (identity default) or `msg()`; their tests stay green. Months, weekdays and period preset labels built from fixed lists are `msg()`; names produced by `Intl`/`date-fns` use `dateFnsLocale(locale)`.
- Charts: axis ticks, legends, tooltips, `aria-label`s and bar texts are visible texts (Recharts SVG text included); the page draws some charts as plain markup — same rule. Series names that are keys in data objects must stay stable codes (translate at the draw site).
- Excel/PDF/CSV content produced by the server or by the client for download is not translated. Button labels are.
- URL keys and values stay unchanged (`?oy=`, `?preset=`, `?cut=` …).
- Out of scope: other sections already translated; server files; the payments reports pages already done under `/payments`; `lib/reports-nav.ts` beyond menu titles (Task 1).
- Paths below are under `client/src/components/reports/` unless stated.

---

### Task 1: Shell, menu, index page, lead funnel

**Files:** `reports-layout-shell.tsx`, `reports-mobile-menu.tsx`, `lib/reports-nav.ts` (titles/descriptions → `msg()`; `reports-nav.test.ts` stays green), `app/(dashboard)/reports/page.tsx` and the thin route pages (`graduates`, `leads`, `student-payments`, …) only where they carry text, everything in `lead-funnel/`; dictionaries and `i18n/i18n-coverage.test.ts`.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Commit message: `feat(client): translate the reports shell and lead funnel into ru, de, en`.

---

### Task 2: Departed students («Ketgan o'quvchilar»)

**Files:** everything in `departed-students/` (1268 lines: `departed-students-page.tsx`, `departed-filter-bar.tsx`, `departed-cards.tsx`, `departed-pending.tsx`, `departed-months.tsx`, `departed-reasons.tsx`, `departed-cuts.tsx`, `departed-list.tsx`, `teacher-change-retention-cards.tsx` + its dialogs, `departed-url.ts`, `departed-format.ts`, …); dictionaries and `i18n-coverage.test.ts`. `dialog-pagination-footer.tsx` is already translated.

- [ ] **Step 1: same procedure.** Departure reason names come from the server (data); the four cuts, period buttons, state chips and the debtors filter are client texts. Commit message: `feat(client): translate the departed students report into ru, de, en`.

---

### Task 3: Attendance, bot report and center activity

**Files:** everything in `attendance/`, `bot/` and `center-activity/` (`center-activity-heat*.tsx`, `center-activity-rooms.tsx`, `center-activity-groups.tsx`, `center-activity-months.tsx`, `center-activity-format.ts` insight sentence, …); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The heat matrix day/hour labels and legend, the room free/busy detail texts (room/group names are data), the bot cohort card captions and per-row `state` words (client mapping of the server's state codes) are texts. Commit message: `feat(client): translate the attendance, bot and center activity reports into ru, de, en`.

---

### Task 4: Admin KPI and audience

**Files:** everything in `admin-kpi/` (`kpi-overview-page.tsx`, `kpi-summary-cards.tsx`, `kpi-attention.tsx`, `kpi-charts.tsx`, `kpi-admin-table.tsx`, `kpi-user-drawer.tsx`, `kpi-user-panel.tsx`, `employee-kpi-tab.tsx`, `kpi-trend.tsx`, `kpi-format.ts`, …) and `audience/`; dictionaries and `i18n-coverage.test.ts`. The employee page's «KPI» tab shows `kpi-user-panel.tsx`, so it follows the language too.

- [ ] **Step 1: same procedure.** Signal texts and «Qanday hisoblandi» lines come from the server; client texts are captions, column headers, chart legends and states. Audience gender/age bucket labels the client maps from codes are texts. Commit message: `feat(client): translate the admin KPI and audience reports into ru, de, en`.

---

### Task 5: Group payments, marketing, lesson ratings

**Files:** everything in `group-payments/`, `marketing/` (`marketing-sources.tsx`, `marketing-view.tsx`, `marketing-client.tsx`, `marketing-format.ts`), `lesson-ratings/` (`lesson-ratings-client.tsx`, `rating-summary-cards.tsx`, `rating-teachers-table.tsx`, `rating-low-list.tsx`, `rating-distribution-card.tsx`, `rating-format.ts`; `teacher-ratings-panel.tsx` is already translated — reuse its keys); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Commit message: `feat(client): translate group payments, marketing and lesson ratings reports into ru, de, en`.

---

### Task 6: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the reports section, remove it from the not-translated list, mention shared pieces that now follow the language).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the reports section as translated`.
