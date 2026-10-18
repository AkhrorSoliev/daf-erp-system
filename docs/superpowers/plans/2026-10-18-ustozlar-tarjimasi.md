# Teachers Section («O'qituvchilar») Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the teachers section draws (`/teachers` list, add/edit teacher, `/teachers/profile/[id]` with its tabs) plus the blocks a teacher sees on the portal (bottom bar, lesson cards on home, upcoming groups, profile links) and the salary pieces shared with it, into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` and `docs/superpowers/plans/2026-10-18-guruhlar-tarjimasi.md`. Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of `docs/superpowers/plans/2026-10-18-guruhlar-tarjimasi.md` once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, translation rules and glossary pointer, `msg()`/`t()` forms, patterns for template literals, helpers with optional last `t`, money/dates/server text, `useT()` placement, inventory first, task ending checklist), with these changes:

- Out of scope: pages outside this section; `components/ui/*`, `lib/status-config.ts` and other shared files keep their default Uzbek output identical (labels become `msg()`, drawn with `t()` only in this section's components); server files; anything already translated (sidebar, header, home page, students and groups sections, attendance rows, reports/lesson-ratings other than `teacher-ratings-panel.tsx`).
- Lessons learned from the groups review (do not repeat): (1) never reuse an existing key for a different meaning — check the existing ru/de/en translation fits the new context (gender of the noun in ru, «Storniert» is a reversed payment, «Tizim» is the colour mode, «Chiqish» is sign-out); make the Uzbek text more specific instead; (2) ru: a status/word that qualifies a teacher or a group must agree in gender, prefer short neutral forms; (3) in de use «Unterricht» (uncountable) and «Unterrichtsstunden» (counts) for «dars», «Lehrkraft» for «o'qituvchi/ustoz» if the glossary says so; (4) uz-Cyrl: an all-caps acronym stays Latin — add an override in `dictionaries/uz-cyrl.ts` or `KEEP_LATIN` where the transliteration would butcher a word (iOS, JAMI, …); (5) `t` never in the deps of an unguarded fetching effect (ref-copy pattern); a loop variable named `t` must be renamed.
- Teacher names, group names, phones, salary figures from the server are data.
- Paths below are under `client/src/` unless stated.

---

### Task 1: The teachers list and adding / editing a teacher

**Files:** `components/teachers/teachers-client.tsx`, `teachers-table.tsx`, `teacher-row-actions.tsx`, `edit-teacher-drawer.tsx`, `edit-teacher-form.tsx`, `app/(dashboard)/teachers/page.tsx` (only if it has text), and any schema/helper with client validation messages they import (`groupFormError` style: messages become `msg()` with a `…FormError(t, message)` helper, as in `lib/schemas/student-schema.ts`); dictionaries and `i18n/i18n-coverage.test.ts`.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Teacher status words (Faol, Nofaol, Vaqtincha to'xtatilgan, Ishdan bo'shatilgan) are client texts. Commit message: `feat(client): translate the teachers list and teacher form into ru, de, en`.

---

### Task 2: The teacher profile and the shared salary pieces

**Files:** `components/teachers/teacher-profile-client.tsx`, `teacher-profile-card.tsx`, `teacher-profile-tabs.tsx`, `teacher-groups-table.tsx`, `teacher-stats-charts.tsx`, `teacher-timeline-tab.tsx`, `components/shared/salary-monthly-panel.tsx`, `components/shared/salary-due-card.tsx`, `components/payments/possible-deductions-info.tsx`, `components/reports/lesson-ratings/teacher-ratings-panel.tsx`, `app/(dashboard)/teachers/profile/[id]/page.tsx` (only if it has text); dictionaries and `i18n-coverage.test.ts`. Existing tests stay green.

- [ ] **Step 1: same procedure.** Tab names are a `msg()` list (URL values unchanged). Chart axis, legend and tooltip texts are texts; months/weekday names from a fixed list are `msg()`. The timeline's event summaries built from server events: the client-built phrases are texts (placeholders for names/figures), the server's own text is not. `possible-deductions-info.tsx` and the salary panel/card are shared with the lehrer portal and employee profile — they now follow the page language there too (Uzbek unchanged outside a provider). Commit message: `feat(client): translate the teacher profile and its salary pieces into ru, de, en`.

---

### Task 3: What a teacher sees on the portal

**Files:** `components/teacher-chrome/teacher-chrome.tsx`, `components/teacher-chrome/teacher-nav.ts` (labels become `msg()`; keep `teacher-nav.test.ts` green), `components/dashboard/teacher-lesson-cards.tsx` (+ its test), `components/dashboard/upcoming-groups.tsx`, `components/profile/teacher-profile-links.tsx`; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Bottom-bar labels, the «Yana» sheet items, back links, «Davomat olish», «Boshlanmagan guruhlarim», empty states and aria-labels are texts. The Telegram Mini App sign-in notices stay out of scope. Commit message: `feat(client): translate the teacher portal blocks into ru, de, en`.

---

### Task 4: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the teachers section and the teacher blocks, remove `teacher-lesson-cards` / `upcoming-groups` from the not-translated list; mention shared files that now follow the language).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the teachers section as translated`.
