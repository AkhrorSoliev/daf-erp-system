# Leads Section («Lidlar» / `/leads/*`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the leads section draws in the admin panel (`/leads` board and list, lead cards, detail/add/edit drawers, dialogs, archive, ownership, and the forms module `/leads/forms/*` with its builder and responses) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to the earlier stages (students, groups, teachers, payments, reports). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of `docs/superpowers/plans/2026-10-18-ustozlar-tarjimasi.md`, `…tolovlar-tarjimasi.md` and `…hisobotlar-tarjimasi.md` once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons learned from the earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms and months, no `t` in fetching-effect deps), with these additions:

- **Lead data is data.** Lead names, phones, comments, notes, lead sources (user-defined names), board section and column names (user-created), form titles, form field labels and options typed by staff, responses' answers: never through `t()`. Built-in/default names that the client itself creates or maps from a code (default columns «Yangi», statuses, the four response stages `awaiting|contacted|converted|lost`, the two default sources if the client names them) are client texts — check the code to see which are codes mapped by the client and which arrive as text from the server.
- Lead statuses and stage words must read the same as in the already translated sections (students «Lid» tab, lead funnel report, reports «Lidlar»): look up existing keys first; make the Uzbek text more specific where an existing key's translation does not fit (ru plural/gender, «Yangi» pipeline stage vs «new», «Tizim» colour mode, «Kutilmoqda» ru plural, «Bekor qilish» = Cancel).
- Drag-and-drop hints, toasts with undo («Bekor qilish» inside a toast is the undo action), empty/error/loading states, confirm dialogs, tooltips and `aria-label`s are texts. URL keys/values stay unchanged (`?lead=`, `?stage=`, `?masul=`…).
- The public form (`form.dafzentrum.uz`: `public-form-renderer.tsx`, `public-form-fields.tsx`, `form-preview.tsx`'s public look) and anything under `app/(public)` stays out of scope (it has no provider and its texts are Uzbek by design); the builder's own labels are in scope. CSV export column headers produced client-side are Uzbek file content: leave; the «Eksport» button is a text.
- Out of scope: other sections already translated; server files; settings pages for lead ownership/KPI (settings stage).
- Paths below are under `client/src/components/leads/` unless stated.

---

### Task 1: The board — columns, cards, filter bar, stats strip, list

**Files:** `leads-board-client.tsx`, `leads-board.tsx`, `lead-section.tsx`, `lead-column.tsx`, `lead-card.tsx`, `leads-filter-bar.tsx`, `leads-stats-strip.tsx`, `lead-stats.ts` (+ test), `leads-list.tsx`, `lead-filter-schema.ts` (+ test; filter option labels → `msg()`), `aylangan-sana.ts` (+ test), `lead-source-name.ts` (+ test), `app/(dashboard)/leads/page.tsx` only if it has text; dictionaries and `i18n/i18n-coverage.test.ts`. Existing tests stay green.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Commit message: `feat(client): translate the leads board and list into ru, de, en`.

---

### Task 2: Lead detail, add and edit drawers

**Files:** `lead-detail-drawer.tsx` (833 lines — read fully once), `add-lead-drawer.tsx`, `edit-lead-drawer.tsx`, `lead-additional-fields.tsx`, `lead-source-picker.tsx` (already translated — reuse its keys), `hooks/use-lead-activity.ts` and `hooks/use-leads-board.ts` only for toast/message texts they own; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Drawer tabs are a `msg()` list (URL values like `?lead_tab=` unchanged). Activity/timeline entries composed by the client from event codes are client texts; texts sent by the server are not. Commit message: `feat(client): translate the lead drawers into ru, de, en`.

---

### Task 3: Lead dialogs

**Files:** `convert-lead-dialog.tsx`, `create-column-dialog.tsx`, `create-section-dialog.tsx`, `delete-confirm-dialog.tsx`, `manage-sources-dialog.tsx`, `move-lead-dialog.tsx`, `move-section-dialog.tsx`, `rename-dialog.tsx`, `restore-lead-dialog.tsx`; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The convert dialog's branch/group fields reuse the students enrolling keys where the meaning matches. Commit message: `feat(client): translate the lead dialogs into ru, de, en`.

---

### Task 4: Archive and ownership

**Files:** everything in `archive/` (the archived lead panel, ownership log text — `ownership-log-text.ts` (+ test), table, URL helpers), `leads-archive.tsx`, `app/(dashboard)/leads/archive/*` only if it has text, everything in `ownership/` (`lead-owner-badge.tsx`, `lead-owner-block.tsx`, `lead-owner-assign.tsx`, `lead-owners-strip.tsx`, `ownership-format.ts`, …); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** `ownership-format.ts` deadline phrases («14:30 gacha», «Muddat o'tdi») are client texts (placeholders, optional `t`); the ownership log lines the client composes from event codes are client texts. Commit message: `feat(client): translate the lead archive and ownership into ru, de, en`.

---

### Task 5: Forms — list and builder

**Files:** `forms/forms-list-client.tsx`, `forms/form-builder-client.tsx`, `forms/form-field-editor.tsx`, `forms/copy-form-link-dialog.tsx`, `app/(dashboard)/leads/forms/**` pages only if they have text; dictionaries and `i18n-coverage.test.ts`. The public renderer and `form-preview.tsx`'s public look stay out of scope — if `form-preview.tsx` also draws builder-only chrome, translate only that chrome and say so.

- [ ] **Step 1: same procedure.** Field type names (matn, telefon, tanlash …) in the builder are client texts (`msg()`); the default fields' labels created by `defaultFormFields()` are DATA stored with the form: keep the literal Uzbek strings (the ids must stay literal too). Commit message: `feat(client): translate the lead forms list and builder into ru, de, en`.

---

### Task 6: Forms — responses

**Files:** everything in `forms/responses/` (`form-responses-client.tsx`, `form-responses-body.tsx`, `responses-header.tsx`, `responses-table.tsx`, `responses-toolbar.tsx`, `source-breakdown.tsx`, `stage-chips.tsx`, `submission-cells.tsx`, `call-cell.tsx`, `submission-format.ts` (+ test), `use-form-submissions.ts` texts, …); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The four stage chip names and the «Telefon qildim» / undo toast are client texts; answers, names and sources are data. Commit message: `feat(client): translate the lead form responses into ru, de, en`.

---

### Task 7: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the leads section incl. forms, remove it from the not-translated list, mention shared pieces now following the language, note that the public form stays Uzbek by design).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the leads section as translated`.
