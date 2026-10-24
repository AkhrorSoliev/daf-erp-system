# Groups Section («Guruhlar») Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the groups section draws (`/groups` list, `/groups/[id]` and every tab, dialog and drawer opened from them, incl. the attendance form) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md`. Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 («Global Constraints») once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, translation rules and glossary pointer, `msg()`/`t()` forms, patterns for template literals, helpers with optional last `t`, money/dates/server text, `useT()` placement, inventory first, task ending checklist), with these changes:

- Out of scope: pages outside the groups section; files in `components/ui/*`, `components/shared/*`, `lib/status-config.ts` keep their default Uzbek output identical (labels become `msg()`, drawn with `t()` only in this section's components); server files; anything already translated: `attendance/attendance-student-row.tsx`, `late-attendance-dialog`, `not-held-dialog`, `unmarked-lesson-prompt` (under `components/attendance/unmarked/`) and the `STATUS_CONFIG` attendance labels — do NOT retouch them except to reuse their keys.
- Already in the dictionaries: reuse an existing key verbatim for the same Uzbek text (grep first); never change an existing entry; new keys appended under a comment naming the area (`// Groups — list`). One Uzbek source text = one meaning: if an existing key means something else, make the new Uzbek text more specific.
- Group names, teacher/student names, room names, course names, levels shown as data (A1, B2) are data, never through `t()`. Weekday names built from a fixed list in code are texts (`msg()`; full and short forms); `Intl`/`date-fns`-derived names use `dateFnsLocale(locale)` (`lib/date-fns-locale.ts`) where a locale is accepted.
- Group «Davomat» form legend (`attendance-form.tsx`) and the dot labels (`attendance-dot.tsx` under `components/attendance/`) are in scope (Task 6).
- Frontend paths below are under `client/src/components/groups/` unless stated.

---

### Task 1: The groups list — table, cards, stats, row actions, delete dialog

**Files:** `groups-client.tsx`, `groups-table.tsx`, `groups-cards.tsx` (+ its test), `groups-stats.tsx`, `groups-heading.tsx`, `group-row-actions.tsx`, `group-delete-dialog.tsx`, `group-delete-copy.ts` (+ test), `covering-badge.tsx` (+ test), `level-badge.tsx`, `app/(dashboard)/groups/page.tsx` (only if it has text); dictionaries and `i18n/i18n-coverage.test.ts`.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** `group-delete-copy.ts` builds sentences → optional last `t` parameter defaulting to identity (keep its test unchanged). Group status words (Faol, Yopilgan, …) are client texts (`msg()` in the config, `t()` at the draw site). Commit message: `feat(client): translate the groups list into ru, de, en`.

---

### Task 2: Adding and editing a group

**Files:** `edit-group-form.tsx`, `edit-group-drawer.tsx`, `edit-group-form-utils.ts` (+ test), `group-course-select.tsx`, `group-level-select.tsx`, `group-teacher-select.tsx`, `group-room-select.tsx`, `group-days-picker.tsx`, `group-lesson-duration-select.tsx`, `lesson-date-select.tsx`, `select-empty-state.tsx`, `group-form-empty-hints.ts` (+ test); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Form labels, placeholders, hints, validation messages, empty hints, toasts, weekday abbreviations in the days picker are texts. Client fallbacks only; the server's validation messages stay raw. Commit message: `feat(client): translate adding and editing a group into ru, de, en`.

---

### Task 3: The group page — header, info card, tabs, students, lesson modifications

**Files:** `group-detail-client.tsx`, `group-detail-tabs.tsx`, `group-info-card.tsx`, `group-students-table.tsx`, `lesson-modifications/lesson-modifications-table.tsx`, `app/(dashboard)/groups/[id]/page.tsx` (and any sibling file there) only if they have text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Tab names are a `msg()` list (URL values unchanged). The «boshqa filialda» state uses the already translated `shared/in-other-branch`. Commit message: `feat(client): translate the group page into ru, de, en`.

---

### Task 4: «Dars o'zgarishlari» tab

**Files:** `lesson-changes-tab.tsx` (1075 lines — read it fully once, in a single `Read`); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Cancel/move dialogs, confirmations (the cascade explanations are long sentences with figures from the server response: figures through `{n}`/`{amount}` placeholders, never concatenation), toasts naming how many students and how much, empty states and column headers are texts. Reason texts typed by staff are data. Commit message: `feat(client): translate the lesson changes tab into ru, de, en`.

---

### Task 5: «Ilova faolligi» (app activity)

**Files:** everything in `app-activity/` (`group-app-activity-tab.tsx`, `group-activity-table.tsx`, `student-activity-panel.tsx`, `student-activity-sections.tsx`, `student-activity-sheet.tsx`, `activity-ui.tsx`, `activity-explainer.tsx`, `difficult-items.tsx` and any `activity-format.ts` with words); `components/students/student-app-activity-tab.tsx` is already translated — its panel is this task's `StudentActivityPanel`, so both pages now follow the language. Dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Durations («12 daq», «1 s 5 daq»), accuracy words, daily chart `aria-label`s and heatmap legends are texts built per language with placeholders; German words/phrases from the course content (the words a student learns) are data, never translated. Commit message: `feat(client): translate the group and student app activity into ru, de, en`.

---

### Task 6: Attendance — form, calendar, dots, stats, cycle dashboard, debtors, QR

**Files (under `components/groups/attendance/`):** `attendance-tab.tsx`, `attendance-form.tsx` (806 lines — read fully once), `attendance-today-card.tsx`, `attendance-no-lesson-today-card.tsx`, `attendance-missed-lessons.tsx`, `attendance-month-calendar.tsx`, `attendance-dots-tab.tsx`, `attendance-stats.tsx`, `attendance-cycle-dashboard.tsx`, `attendance-debtors-section.tsx`, `qr-attendance-dialog.tsx`, and the dot labels file `components/attendance/attendance-dot.tsx` if it holds words; also switch `attendance-month-calendar.tsx` to `dateFnsLocale(locale)` for month and weekday names (it was listed as an untranslated date-fns-locale user). `attendance-student-row.tsx` is already translated (do not touch). Dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The form legend, the «Saqlash · N/M» bar, lock reasons (`attendance-window` texts the client words itself are texts; texts the server sends are not), admission copy (`admissionCopy` in `attendance-admission.ts`, if it builds client sentences → optional last `t`), QR dialog instructions and the stats captions are texts. Never put `t` in the deps of a fetching effect (use the ref-copy pattern, see `client/CLAUDE.md` «Language switch and fetching effects»). Commit message: `feat(client): translate group attendance into ru, de, en`.

---

### Task 7: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the groups section, remove it from the not-translated list), `client/src/qollanma/yangiliklar.ts` only if a user-visible Uzbek behaviour changed (it should not — skip otherwise).

- [ ] **Step 1:** update `client/CLAUDE.md`; run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the groups section as translated`.
