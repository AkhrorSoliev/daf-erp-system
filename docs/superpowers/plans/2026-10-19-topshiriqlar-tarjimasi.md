# Tasks Section («Topshiriqlar» / `/tasks`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the tasks module draws (`/tasks` board, list, «Barchasi», «Yuklama», the drawer with feed, files, voice, steps and recurrence, the create dialog, entity task panels, the header «+ Topshiriq» button and the join-request panel) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to the earlier stages (students, groups, teachers, payments, reports, leads). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of the ustozlar, tolovlar, hisobotlar and lidlar plans in the same folder once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons from earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms and months, no `t` in fetching-effect deps, module-level translators for stores must be set from the page roots), with these additions:

- **Task data is data.** Task titles, descriptions, comments, step texts, assignee/author names, file names, entity labels (student/group/lead names), recurrence rule text built by the SERVER, notification-like feed lines the server composes: never through `t()`. Texts the client builds from codes (status names «Menga berilgan / Jarayonda / Tekshiruvda / Bajarildi», priority names, kinds, feed event labels composed in `task-feed-text.ts`, due-date phrases in `task-due.ts`, drop refusals in `task-drop.ts`, footer buttons from `task-drawer-footer-rules.ts`, workload captions, file-size/duration words in `task-file-rules.ts`, recurrence summaries in `lib/task-recurrence-rules.ts`) are client texts: pure helpers take an optional last `t` (identity default) or return `msg()` texts drawn with `t()`; their tests stay green.
- System tasks (`kind` ≠ MANUAL, author `null` → «Tizim»): the author fallback is `t("Tizim (avtomatik)")`-style (the existing key «Tizim» means the colour mode: do not reuse it).
- Statuses and verbs must read the same as in the already translated sections («Bajarildi», «Kutilmoqda» (ru plural), «Bekor qilish» (= Cancel; undo/remove need a specific Uzbek text), «Tahrirlash», «O'chirish»): look up existing keys first and make the Uzbek text more specific where an existing translation does not fit.
- Drag-and-drop hints and refusals, confirm dialogs, toasts, tooltips, `aria-label`s (incl. voice recorder and player controls), empty/error/loading states are texts. URL keys/values stay unchanged (`?tab=my|created|all|workload`, `?task=`, `?assignee=`…). Voice recordings, photos and file contents are data. Browser permission prompts are not ours.
- Zustand store (`hooks/use-tasks.ts`, `use-task-files.ts`, `use-task-counts.ts`) toasts/error texts: follow the leads pattern (`useLeadsBoardTranslator`): module-level translator set from the page roots (`TasksPageClient`, the entity panel, the header task button/dialog) through one small hook; never `t` in deps of a fetching effect.
- Out of scope: other sections already translated; server files; notification texts (`/notifications` page, bell) — separate stage; the Telegram texts.
- Paths below are under `client/src/components/tasks/` unless stated.

---

### Task 1: Page, board, list, «Barchasi», workload, entity panel

**Files:** `tasks-page-client.tsx`, `task-board.tsx`, `task-column.tsx`, `task-card.tsx`, `task-tile.tsx`, `task-status-pill.tsx`, `task-list.tsx`, `task-filters.tsx`, `task-all-filters.tsx`, `task-all-table.tsx`, `task-all-table-rules.ts`, `task-workload.tsx`, `task-workload-rules.ts`, `task-labels.ts`, `task-due.ts`, `task-drop.ts`, `task-row-button.ts`, `header-task-button.tsx`, `entity-tasks-panel.tsx`, `entity-tasks-panel-rules.ts`, `entity-context.ts` only if it has text, `app/(dashboard)/tasks/page.tsx` only if it has text, and the texts in `hooks/use-tasks.ts` and `hooks/use-task-counts.ts` (store translator pattern above); dictionaries and `i18n/i18n-coverage.test.ts`. Existing tests stay green.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Commit message: `feat(client): translate the tasks board, lists and workload into ru, de, en`.

---

### Task 2: The task drawer

**Files:** `task-drawer.tsx`, `task-drawer-feed.tsx`, `task-drawer-files.tsx`, `task-drawer-properties.tsx`, `task-drawer-footer.tsx`, `task-drawer-footer-rules.ts`, `task-drawer-menu.tsx`, `task-drawer-steps.tsx`, `task-drawer-batch.tsx`, `task-drawer-editable.tsx`, `task-drawer-recurrence.tsx`, `task-photo-dialog.tsx`, `task-voice-recorder.tsx`, `task-voice-player.tsx`, `task-source-card.tsx`, `task-source-rules.ts`, `task-feed-text.ts`, `task-file-rules.ts`, `hooks/use-task-files.ts` texts; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The system task source card (ADR-0083) lines and the single button («Qo'ng'iroqni yozish» / «Lidni ochish»), feed events composed by the client, file/voice size and duration words, recorder states and permission-failure messages the client words itself are client texts. Commit message: `feat(client): translate the task drawer into ru, de, en`.

---

### Task 3: Create dialog, recurrence, assignee picker, join request

**Files:** `task-create-dialog.tsx`, `task-assignee-picker.tsx`, `task-recurrence-fields.tsx`, `task-recurrences-dialog.tsx`, `lib/task-recurrence-rules.ts` (+ test), `use-assignable.ts` and `use-task-write.ts` (texts only), `join-request/join-request-panel.tsx`, `join-request/join-request-rules.ts` (+ test); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Weekday names in the recurrence picker are a fixed list → `msg()` (full and short forms); «Har dushanba»-style badges (`recurrenceBadge`) are built by the client from the rule: one key per sentence shape with a weekday/time placeholder; the join-request notes (lead, archived card, same-name groups, group no longer takes students) are client words built from server facts: placeholders for names. Commit message: `feat(client): translate task creation, recurrence and join requests into ru, de, en`.

---

### Task 4: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the tasks module, remove it from the not-translated list, mention shared pieces now following the language, e.g. the panels opened from header buttons that this stage covers).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the tasks module as translated`.
