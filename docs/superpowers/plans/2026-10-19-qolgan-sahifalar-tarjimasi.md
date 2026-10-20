# Remaining Admin Pages Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the rest of the admin and teacher portals' pages into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102: the outreach pages («Aloqa markazi»), mock exams, the DaF center pages, the media (course content) admin pages, the user's own profile and sessions, the search results page and spotlight, the `/notifications` page, the guide chrome (Qo'llanma), the staff pay correction dialog (ADR-0112) and the page names of the global search. After this plan every staff page follows the language; only the student portal, the Telegram Mini App, public pages and the guide's MDX content stay Uzbek. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to the earlier stages (students, groups, teachers, payments, reports, leads, tasks, settings). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of the ustozlar, tolovlar, hisobotlar, lidlar, topshiriqlar and sozlamalar plans in the same folder once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons from earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms/months/key names, no `t` in deps of a fetching effect, store translators set from page roots, forms re-translate errors at draw time, shared pieces now follow the language everywhere), with these additions:

- **Mind the translated glossary of the live sections** (the same Uzbek concept reads the same everywhere): look up existing keys first; check an existing key's translation fits the new context (ru gender/number: «Faol» masculine, «Kutilmoqda» plural, «Bekor qilish» = Cancel, «Tizim» colour mode, «Yangi», «Oylik» salary vs monthly, «Qo'ng'iroq» noun vs verb, «Ism» = first name vs full name); make the Uzbek text more specific where it does not fit and record each Uzbek text change in the report.
- Data is data: mock exam names and participants' names/phones/answers/scores, course/unit/lesson names and content (German words, exercise items, audio texts) in the media pages, call notes, student names, employee profile data. The German course content must NEVER be translated.
- Out of scope (stay Uzbek by design): the student portal (`student-portal/*`), the Telegram Mini App pages, the public form, certificate/contract public pages (`app/t`, `app/r`), the guide's MDX content (`qollanma/kontent`, `qollanma/yangiliklar.ts`), server-built documents and messages, notification texts the server sends.
- Paths below are under `client/src/components/` unless stated.

---

### Task 1: Outreach («Aloqa markazi»)

**Files:** everything in `outreach/` (`today-absentees-tab.tsx`, `removal-queue-tab.tsx`, `paused-tab.tsx`, `call-history-tab.tsx`, `log-call-dialog.tsx` — also opened from the system task card —, `overdue-promises-banner.tsx`, `table-pagination.tsx` is already translated, the page client and any other file), `app/(dashboard)/outreach/**` only if it has text, and the helpers they use with Uzbek words (`callPromiseAsk`, call outcome labels `CALL_OUTCOME_INFO` already `msg()`-translated by the tasks stage — reuse); dictionaries and `i18n/i18n-coverage.test.ts`. The overdue-promises banner's `formatBalance` calls get `t("so'm")`. `client/CLAUDE.md` «Outreach» notes if any.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Tabs are a `msg()` list (URL values unchanged), call outcome words, the promise ask line, removal-queue explanations and countdowns are client texts; student names, phones, notes, groups are data. Commit message: `feat(client): translate the outreach pages into ru, de, en`.

---

### Task 2: Mock exams — list, create/edit, structure

**Files:** `mock-exams/mock-exams-client.tsx`, `create-exam-drawer.tsx`, `edit-exam-drawer.tsx`, `mock-exam-field-editor.tsx`, `create-section-dialog.tsx`, `exam-detail-client.tsx`, `exam-overview-tab.tsx`, `exam-stats-panel.tsx`, and every other file in that folder that is not part of Task 3, `app/(dashboard)/mock-exams/**` only if it has text, `lib/schemas/mock-exam-*schema*.ts` client messages (`…FormError(t, message)` pattern; this schema shares code with `custom-form-schema.ts`: read it first); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Exam status words, section/field type names (a `msg()` list), level labels (A1…C1 are data codes), validation messages, tab names (URL values unchanged) are texts; exam names, section names typed by staff, prices from the server are data. Commit message: `feat(client): translate mock exams, part one, into ru, de, en`.

---

### Task 3: Mock exams — participants, results, payments

**Files:** `mock-exams/exam-participants-tab.tsx` (553 lines), `exam-results-tab.tsx`, `manual-participant-dialog.tsx`, `edit-payment-dialog.tsx`, `mark-paid-dialog.tsx`, `cancel-payment-dialog.tsx`, and every remaining file of the folder not done in Task 2; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Participant payment states (unpaid/paid/cancelled), channel and discount words (`levels`, `channel`: see `client/CLAUDE.md` mock exam notes if present), scores/rank captions are client texts; participants' names, phones, answers, scores are data. Cancelled/«Bekor qilingan» wording: de «Storniert» = reversed payment fits a cancelled PAYMENT here, but not an exam. Commit message: `feat(client): translate mock exams, part two, into ru, de, en`.

---

### Task 4: DaF center and media (course content admin)

**Files:** everything in `daf-center/` (`daf-filiallar-table.tsx`, `daf-explainer.tsx`, `daf-oquvchilar-filter-bar.tsx`, `daf-kpi-cards.tsx`, `daf-oquvchilar-table.tsx`, …), everything in `media/` (`media-inhalt-panel.tsx`, `media-coverage-section.tsx`, `assets-client.tsx`, `media-fragen-panel.tsx`, …; `lib/daf-format-nomlari.ts` is already `msg()`), their `app/(dashboard)/**` route pages only if they have text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** German course content (words, sentences, exercise items, audio transcripts, unit/lesson titles in German) is DATA: never through `t()`. Exercise format names are `msg()` texts drawn with `t()`. Commit message: `feat(client): translate the DaF center and media pages into ru, de, en`.

---

### Task 5: Own profile, search page, spotlight, portal landing

**Files:** everything in `profile/` (`profile-client.tsx`, `profile-card.tsx`, `profile-details.tsx`, `edit-profile-drawer.tsx`, `change-password-drawer.tsx`, `sessions/active-sessions.tsx` + `sessions-model.ts` (+ test), `profile-save-plan.ts` messages), `shared/logout-others-dialog.tsx`, `search/search-results-page.tsx`, `spotlight/spotlight-host.tsx`, `portal/portal-client.tsx` if it is a staff page, `global-search/search-dropdown-helpers.tsx`; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Device/browser descriptions in the sessions list that the SERVER sends are data; the client's «Joriy qurilma», «Chiqarish» words are texts. Password rules/validation messages are client texts (`…FormError(t, message)`); server errors raw. Commit message: `feat(client): translate the own profile, search results and spotlight into ru, de, en`.

---

### Task 6: Notifications page, guide chrome, pay correction, global search pages

**Files:** every remaining file in `notifications/` that is not yet in `STRICT_FILES` (the `/notifications` page: `notifications-page-client.tsx`, `notification-page-list.tsx`, …), `qollanma/*.tsx` chrome (menu, search, role filter, page header, «Yangiliklar» list chrome — NOT the MDX content or `yangiliklar.ts` data), `components/payments/salary/salary-adjustment-dialog.tsx` + `salary-adjustment-model.ts` (+ tests) and `lib`/`components` helpers for the staff pay correction (ADR-0112: `adjustLockReason`, `adjustmentFacts`, `adjustmentMeta` used by `salary-drawer-sections.tsx` — their Uzbek words become client texts with optional `t`), `data/searchable-pages.ts` (page names and keywords for the header search: titles → `msg()` drawn with `t()` in the search dropdown; keywords stay Uzbek and also match; the translated title is matched too; existing search tests stay green), `components/shared/*` leftovers not yet in `STRICT_FILES` (e.g. `group-students-hover-card.tsx`, `chart-card.tsx` if any text); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The guide chrome translates its own labels; guide page titles/summaries come from the registry (`qollanma/sahifalar/*.ts`): leave them Uzbek (content) and say so. Commit message: `feat(client): translate notifications page, guide chrome, pay correction and search pages into ru, de, en`.

---

### Task 7: Docs and final checks

**Files:** `client/CLAUDE.md` («Languages» → «Pages translated so far» and «Not translated yet»: add everything above, rewrite «Not translated yet» to the true remainder: student portal, Telegram Mini App, public pages, guide MDX content, server-sent texts; mention shared pieces now following the language).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the remaining admin pages as translated`.
