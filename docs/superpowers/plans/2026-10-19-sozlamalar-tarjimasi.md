# Settings Section («Sozlamalar» / `/settings/*`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the settings section draws (the `/settings` index with search, the settings menu, branches, courses, rooms, holidays, reasons, archive, employees with their profile, study rules, lead and KPI settings, payment settings, Telegram settings, the «Ruxsatlar» permissions page) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for a full translation in one go and will name wrong translations afterwards.

**Architecture:** No new design. Identical to the earlier stages (students, groups, teachers, payments, reports, leads, tasks). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in module-level lists and `.ts` helpers, `t(x)` where drawn), the file joins `STRICT_FILES`, the three dictionaries get one entry per text.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of the ustozlar, tolovlar, hisobotlar, lidlar and topshiriqlar plans in the same folder once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons from earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms/months/key names, no `t` in fetching-effect deps, shared pieces now follow the language everywhere), with these additions:

- **Settings are CEO/director reading: wording must be exact, and a setting's explanation must say the same thing in every language.** Long explanatory paragraphs are texts: one key per paragraph, placeholders for figures (days, percents, hours), no concatenated fragments. Defaults, units and limits shown in hints («kun», «soat», «%», «ta») use placeholders, not hard-coded translated words.
- **Reuse the vocabulary already live:** «Filial», «Kurs», «Xona», «Guruh», «Ustoz», «Xodim», «Rol»/«Lavozim», «Qarz», «Davomat», «Dars», «Pauza», «Ruxsat»… look up existing keys first; check an existing translation fits the new context (ru gender/number: «Faol» masculine, «Kutilmoqda» plural, «Bekor qilish» = Cancel, «Tizim» colour mode, «To'xtatilgan» feminine, «Oylik» salary vs monthly); make the Uzbek text more specific where it does not fit. Status words for users/employees come from the shared `lib/status-config.ts` labels already translated («Faol», «Nofaol», «Vaqtincha to'xtatilgan», «Ishdan bo'shatilgan»).
- Data is data: branch, course, room, holiday, reason names typed by staff; employee names, logins, phones, positions typed by staff; Telegram group names/chat ids; archive record content; permission KEYS and role names that come from the server as data (role names in the permission matrix: the existing `roleLabel` helper translates known role names — use it). Texts the server composes (history lines, refusals, validation messages from the API, the permission catalog's own labels if the server sends them as text) are not translated; the permission catalog labels the CLIENT keeps (`permission-keys.ts` sections/labels, `permissions-model.ts` words) are client texts (`msg()`).
- The settings index search (`lib/settings-search.ts`, `lib/settings-nav.ts`): section titles, page titles, descriptions are already `msg()` or must become `msg()` there; the search matches the TRANSLATED title and description plus the Uzbek keywords (keywords stay Uzbek and also match, so Uzbek words keep working); `settings-nav.test.ts` and `settings-search` tests stay green (Uzbek output unchanged without `t`). The global search's settings entries (`data/searchable-pages.ts` through `settingsSearchPages`) follow the same list: check `searchable-pages.ts` draws them through `t`.
- Old redirect pages (`/settings/absence-pause`, `daf`, `participation`, `lead-ownership`, `kpi`, `telegram-groups`, `telegram-report`) are server `redirect()` pages without text: leave them.
- Forms: validation texts of schemas used here follow the `…FormError(t, message)` pattern (see `lib/schemas/student-schema.ts`, `group-schema.ts`, `teacher`, `custom-form-schema.ts`); server validation messages stay raw. Dialogs/drawers: fixed header/footer layout untouched.
- Out of scope: other sections already translated; server files; the guide (Qo'llanma) pages; notification texts.
- Paths below are under `client/src/components/settings/` unless stated.

---

### Task 1: Shell, index, search, menu

**Files:** `settings-layout-shell.tsx`, `settings-menu.tsx`, `settings-menu-parts.tsx`, `settings-page-header.tsx`, `settings-blocks.tsx`, `settings-form-parts.tsx`, `general-settings-client.tsx`, `app/(dashboard)/settings/page.tsx` and `layout.tsx` (only if they have text), `lib/settings-nav.ts`, `lib/settings-search.ts` (search over translated texts as above), `lib/breadcrumb-routes.ts` / `data/searchable-pages.ts` only if settings entries are not yet translated; dictionaries and `i18n/i18n-coverage.test.ts`. Existing tests stay green.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Commit message: `feat(client): translate the settings index, menu and general settings into ru, de, en`.

---

### Task 2: Branches

**Files:** `branches-settings-client.tsx`, `branch-row-actions.tsx`, `branch-detail-client.tsx`, `edit-branch-drawer.tsx`, `edit-branch-form.tsx`, the route pages under `app/(dashboard)/settings/branches/**` if they have text; dictionaries and `i18n-coverage.test.ts`. The branch launch card (home page) is already translated: reuse its keys.

- [ ] **Step 1: same procedure.** Branch status words (Faol/Nofaol, registration closed hints) are client texts. Commit message: `feat(client): translate branch settings into ru, de, en`.

---

### Task 3: Courses and rooms

**Files:** `courses-settings-client.tsx`, `course-detail-client.tsx`, `course-row-actions.tsx`, `edit-course-drawer.tsx`, `edit-course-form.tsx`, `lib/course-terms.ts` (price/term rows → `msg()`/optional `t`; its tests stay green), `rooms-settings-client.tsx`, `room-detail-client.tsx`, `room-row-actions.tsx`, `room-weekly-schedule.tsx`, `edit-room-drawer.tsx`, `edit-room-form.tsx`; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The «Course Page Follows the Payment Model» rows (Oylik narx / Sikl narxi / Haftasiga …) are client texts; the schedule summary figures come from the server. Commit message: `feat(client): translate course and room settings into ru, de, en`.

---

### Task 4: Holidays, reasons, archive

**Files:** `holidays-settings-client.tsx`, `holiday-row-actions.tsx`, `edit-holiday-drawer.tsx`, `edit-holiday-form.tsx`, `lib/holiday-scope.ts` (labels), `reasons-settings-client.tsx`, `reason-list-manager.tsx` (and `EXIT_TYPE_OPTIONS` it uses — the reports stage left them Uzbek), `archive-settings-client.tsx`, `archive-detail-sheet.tsx`, `archive-detail-rules.ts` (+ test); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Holiday scope («Kimga»), reason type names and archive entity-type names are client texts (codes mapped by the client); archived record fields are data. Commit message: `feat(client): translate holidays, reasons and archive settings into ru, de, en`.

---

### Task 5: Employees

**Files:** `employees-settings-client.tsx`, `employee-row-actions.tsx`, `edit-employee-drawer.tsx`, `edit-employee-form.tsx`, `employee-credentials-section.tsx`, `employee-roles-field.tsx`, `employee-profile-client.tsx`, `employee-profile-card.tsx`, `employee-profile-tabs.tsx`, `lib/schemas/employee-schema.ts` if it has client messages, `components/profile/profile-roles.ts` / `lib/role-grant-ceiling.ts` only for visible labels; dictionaries and `i18n-coverage.test.ts`. The employee «KPI» tab (`kpi-user-panel`) and salary panels are already translated.

- [ ] **Step 1: same procedure.** «Lavozim» vs «Tizim huquqi» texts, the status dropdown labels (reuse shared status keys), role names through the existing role-label helper, credentials hints. The status label in `edit-employee-form.tsx:56` («To'xtatilgan») must use the shared «Vaqtincha to'xtatilgan» wording (an earlier review asked). Commit message: `feat(client): translate employees and their profile into ru, de, en`.

---

### Task 6: Study rules, leads/KPI, payment settings

**Files:** `rules-settings-client.tsx`, `absence-pause-settings-client.tsx`, `absence-pause-history-sheet.tsx`, `absence-pause-draft.ts`, `absence-pause-history.ts` (+ tests), `daf-norma-settings-client.tsx`, `daf-norma-draft.ts`, `participation-settings-client.tsx`, `participation-settings-draft.ts`, `leads-kpi-settings-client.tsx`, `lead-ownership-settings-client.tsx`, `kpi-settings-client.tsx`, `kpi-settings-draft.ts`, `lib/kpi-format`-style messages (`ruleError` in `components/reports/admin-kpi/kpi-format.ts` left Uzbek by the reports stage: translate now), `payment-settings-client.tsx`, `payment-settings-parts.tsx`; dictionaries and `i18n-coverage.test.ts`. The guard tests (`payment-settings-debt-write-off-guard.test.ts`, `payment-settings-monthly-notices-guard.test.ts`) pin source text: keep them green by adapting only what the wrapping changes mechanically.

- [ ] **Step 1: same procedure.** Draft validation messages built in the `*-draft.ts` helpers are client texts (optional last `t`). Explanations of rules with figures use placeholders. Commit message: `feat(client): translate study rules, KPI and payment settings into ru, de, en`.

---

### Task 7: Telegram settings and permissions

**Files:** `telegram-settings-client.tsx`, `telegram-groups-client.tsx`, `telegram-link-dialog.tsx`, `telegram-announce-dialog.tsx`, everything in `telegram-report/` (`telegram-report-labels.ts` etc., tests stay green), everything in `permissions/` (`permissions-client.tsx`, `permissions-table.tsx`, `permissions-history.tsx`, `permission-confirm-dialog.tsx`, `permissions-model.ts`, `permissions-types.ts`) and the client-kept labels of `lib/permission-keys.ts` (sections and key labels → `msg()` only if they are client texts; `permission-keys.test.ts` compares with the server catalog: keep it green); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** The permission matrix is CEO-only: cell states, lock reasons, the yellow dot/red mark legends, «N tadan M tasi», confirm/reset texts and the history line are client texts built in `permissions-model.ts` (optional `t`, tests stay green); role names via the role-label helper; permission key labels per the catalog. Telegram announce text templates the CLIENT drafts for the admin to send (if any) stay Uzbek — they are message content for students, not UI. Commit message: `feat(client): translate Telegram settings and permissions into ru, de, en`.

---

### Task 8: Docs and final checks

**Files:** `client/CLAUDE.md` («Pages translated so far» / «Not translated yet»: add the settings section and employee profile, remove them from the not-translated list, mention shared pieces now following the language).

- [ ] **Step 1:** update `client/CLAUDE.md` (English); run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the settings section as translated`.
