# Home Page («Bosh sahifa», `/`) Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the home page `/` draws into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for the whole page in one go and will name wrong translations afterwards.

**Architecture:** No new design. Every visible text becomes `t("Uzbek source")` (or `msg("…")` in a module-level list/config and `t(x)` where drawn), the file joins `STRICT_FILES`, and the three dictionaries get one entry per text (glossary in `docs/superpowers/plans/2026-10-17-tillar.md` lines 13-25). What `/` renders: `components/dashboard-client.tsx` → for a person without `dashboard.view` (a teacher) `ScheduleClient`; for everyone else `BranchLaunchCard` + `HomeOverview` (money strip, people stats, lead funnel strip, attention list, next lessons, charts).

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

## Global Constraints

- Work in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-user-header` (branch `worktree-admin-user-header`). Bash cwd may reset between calls: run `cd client; <cmd>` in ONE call. Plain separate git commands only. Client vitest: `npx vitest --config vitest.config.mts run <paths>`. **No Prettier on `client/` files.** Never run `npm run build` and tests in parallel. Files in `client/src/components/ui/` stay shadcn originals unless the task names them.
- UI text in code stays Uzbek Latin (the key). Commit messages and new code comments in English; every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Translation rules, glossary, style: `docs/superpowers/plans/2026-10-17-tillar.md` lines 13-25 («Global Constraints») — read those lines; plus the vocabulary already in `client/src/i18n/dictionaries/ru.ts` (reuse its words for the same Uzbek word: «Parol», «O'quvchilar», «Guruhlar», «Hisobotlar», …; do not retranslate an existing key differently, never change an existing entry). New keys are appended before the closing `};` under a comment naming the area (`// Home page — money strip`). **Before adding a key grep the three dictionaries for it; never add a duplicate key.** ru/de/en keep identical key sets; `{name}` placeholders unchanged in every translation.
- `msg()` takes a string LITERAL; `t(x)` may take a variable that came from `msg()`; any other form inside `t(…)` (ternary, template literal, sum) fails the coverage test — write one literal call per text: `ok ? t("A") : t("B")`. Never pass data (student/branch/group names, anything from the server) through `t()`; in `uz-Cyrl` `t(variable)` transliterates whatever it gets.
- **Patterns every task meets** (decide once, the same way everywhere):
  - Template literals with a figure: `` `${n} ta to'lov` `` → `t("{n} ta to'lov", { n: formatNumber(n) })`. Write ru/de/en so the sentence needs **no plural agreement** (a label + number, or an abbreviation: «платежей: {n}», «{n} Zahlungen», «{n} payments» — de/en count words are fine for n ≥ 2 only if the UI never shows 1; otherwise use «Zahlungen: {n}» / «Payments: {n}»).
  - JSX entity apostrophes (`E&apos;tibor`) become a JS string inside `{t("E'tibor talab qiladi")}` — the key has the plain `'`.
  - Texts that live in a logic file (`.ts`) next to a component (labels returned by `visibleAttentionRows`, chart series names, station lists): wrap with `msg("…")` there, draw with `t(…)` in the component; keep every existing test green (`msg` returns the text unchanged). If a helper builds a sentence, give it an optional last `t` parameter defaulting to identity (as `notification-view.ts` does).
  - Money: figures keep their format (`formatNumber`/`formatPrice`: `1 500 000`). Where a currency word is appended, use `t("so'm")` (glossary: сум / Sum / UZS); `lib/format-utils.ts` `formatBalance(balance)` hard-codes " so'm" — Task 1 gives it an optional unit parameter (default `"so'm"`, so every other caller is unchanged).
  - Dates, times and numbers keep their formats. Month and weekday names that come from a fixed list in code are texts: `msg()` them (full and short form where both exist) and translate; names produced by `toLocaleDateString`/`Intl` stay as they are.
  - Server-sent text (a `label`/`text`/`message` that arrives in the API response) is never translated; only client-side texts are. If a text arrives from the server **as a code** the client maps to words, the mapping is a client text: translate it.
  - `aria-label`, `title`, tooltip content, chart axis/legend/tooltip texts, empty and error states, toasts and skeleton `sr-only` texts are visible texts.
- `useT()` from `@/i18n/context` goes **before any early return** and never inside a callback or a loop. In a component rendered both inside and outside the dashboard layout it just returns the Uzbek source outside a provider.
- Out of scope: any page other than `/` (the files below also serve `/schedule`: that is intended — it is the same component), server files, `components/ui/*`, notification/header/sidebar files (done).
- Inventory first: for every file of a task, list every visible Uzbek text (JSX text, string props `label|title|aria-label|placeholder|hint|tooltip|description|alt`, template literals, constants, toasts, helper return values in sibling `.ts` files) with `grep -n` and by reading the file; a text the coverage test cannot see (never wrapped) is the most likely miss, so read each file fully once.
- Every task ends with: coverage test red → translations → `npx vitest --config vitest.config.mts run src/i18n src/components src/lib`, `npx tsc --noEmit`, `npx eslint` on the touched files (0 errors; a quoted `(auth)`/`(dashboard)` path may be refused in the worktree — use a `src/app/*/…` glob), then commit.

---

### Task 1: The overview strip — money, people, funnel, attention, next lessons

**Files (under `client/src/`):**
- Modify: `lib/format-utils.ts` (+ its test), `components/dashboard/home-overview.tsx`, `home-money-cards.tsx`, `home-people-stats.tsx`, `home-lead-funnel-strip.tsx`, `home-attention-list.tsx`, `dashboard-home-visibility.ts`, `home-next-lessons.tsx`, `home-error-note.tsx`, `home-load-error.tsx`, `home-skeleton.tsx`, `dashboard-client.tsx` (only if it has a visible text — it has none today)
- Modify: `i18n/dictionaries/{ru,de,en}.ts`, `i18n/i18n-coverage.test.ts`; existing tests only where a changed signature needs it

**Interfaces:** produces `formatBalance(balance: number, unit = "so'm"): string`.

- [ ] **Step 1: `formatBalance` unit parameter (TDD).** In `lib/format-utils` test file add a case asserting `formatBalance(1500000, "сум") === "1 500 000 сум"` and `formatBalance(-50000, "UZS") === "-50 000 UZS"` (non-breaking space exactly as `formatNumber` produces — copy it from the existing assertions), run it red, then change the function to `formatBalance(balance: number, unit = "so'm")` returning `` `${abs} ${unit}` `` / `` `-${abs} ${unit}` ``; existing assertions stay green.
- [ ] **Step 2: Add the files to `STRICT_FILES`** (every file above that ends up with `t()`/`msg()` calls).
- [ ] **Step 3: Wrap every visible text** per the patterns; draw money with the unit where the Uzbek source showed «so'm»: `formatBalance(d.balance, t("so'm"))`. Files that only receive already-translated props stay untouched.
- [ ] **Step 4: Run the coverage test, see it fail, write the translations** (all three dictionaries, glossary words exactly: Moliya, To'lovlar, Qarzdorlik, Lidlar, Guruhlar, O'quvchilar, Dars, Davomat, …).
- [ ] **Step 5: Verify and commit**

```bash
git add client/src
git commit -m "feat(client): translate the home page overview into ru, de, en

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The charts

**Files (under `client/src/components/dashboard/`):** `home-charts.tsx`, `chart-attendance.tsx`, `chart-money-trend.tsx`, `chart-profit-breakdown.tsx`, `chart-student-flow.tsx`, `chart-tooltip.tsx`, `chart-breakdown-rows.ts` (+ `chart-breakdown-rows.test.ts` where a label moves into `msg`), `chart-palette.ts` / `dashboard-charts-types.ts` only if they hold visible text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: STRICT_FILES, wrap, red, translations, verify, commit** (steps as in Task 1). Series names, legends, axis titles, tooltip rows, empty states and the profit-breakdown row labels (`chart-breakdown-rows.ts`) are texts; month labels on axes that come from a fixed list in code are `msg()` (short forms: Yan, Fev, … → ru «янв», «фев»…, de «Jan», «Feb», …, en «Jan», «Feb», …) — if the axis labels come from `Intl`/`toLocaleDateString` leave them. Chart values keep `formatNumber` formats (a compact «mln» unit written by hand is a text: translate it, ru «млн», de «Mio.», en «M»). Commit message: `feat(client): translate the home page charts into ru, de, en`.

---

### Task 3: The branch launch card

**Files (under `client/src/components/dashboard/launch/`):** `branch-launch-card.tsx`, `launch-stations.ts`, `launch-types.ts`, `resolve-launch-journey.ts`, `resolve-launch-visibility.ts`, `launch-storage.ts` and any sibling that holds a text shown to the user (read each; the `*.test.ts` files stay green and are only edited if a string moved into `msg`); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: STRICT_FILES, wrap, red, translations, verify, commit.** Station titles/descriptions/button texts in `launch-stations.ts` are config lists → `msg()` there, `t()` in the card. Server-provided branch names stay as they come. Commit message: `feat(client): translate the branch launch card into ru, de, en`.

---

### Task 4: The daily schedule (what a teacher sees at `/`, and `/schedule`)

**Files (under `client/src/components/dashboard/`):** `schedule-client.tsx`, `dashboard-daily-schedule.tsx`, `dashboard-schedule-skeleton.tsx`, plus any small helper they import that builds visible text (read the imports; if a shared helper is used by pages outside this plan, give it an optional last `t` parameter defaulting to identity instead of changing its default output); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: STRICT_FILES, wrap, red, translations, verify, commit.** Weekday names, lesson status words, empty states, filters and buttons are texts; room/group/teacher/student names are data. Commit message: `feat(client): translate the daily schedule into ru, de, en`.

---

### Task 5: The room occupancy panel

**Files (under `client/src/components/dashboard/`):** `dashboard-room-occupancy.tsx` (611 lines — read it fully once, then edit) and any helper it imports with visible text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: STRICT_FILES, wrap, red, translations, verify, commit.** Hours/time ranges keep their format; day names and legend texts are texts; room names are data. Commit message: `feat(client): translate the room occupancy panel into ru, de, en`.

---

### Task 6: Docs and full checks

**Files:** Modify `client/CLAUDE.md` («Languages» → «Pages translated so far» and the «not translated yet» list), `client/src/qollanma/yangiliklar.ts` (one entry at the TOP of the array, in the existing shape: `sana: "2026-10-17"`, `sarlavha: "Bosh sahifa tarjima qilindi"`, a `matn` saying the home page (money strip, people, lead funnel, attention list, next lessons, charts, the launch card and the teacher's schedule) now follows the chosen language, that server-sent texts and names stay as they are, `rollar: [1, 2, 3, 4, 5]`, `sahifa: { bolim: "boshlash", sahifa: "interfeys" }` — read the file's current top first; other chats edit it). No new ADR (it applies ADR-0102).

- [ ] **Step 1: Docs as above** — keep the CLAUDE.md list accurate (the home page `/` is translated; every other page is not).
- [ ] **Step 2: Full checks, one after another** (client only): `cd client; npx tsc --noEmit`, `npx eslint src --quiet` (no errors), `npm run i18n:check`, `npm test`, `npm run build` (a transient `next/font/google` error: rerun once). Run the long ones with `run_in_background: true`, a log under `/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/25e12e41-5ba3-4971-a8dc-465d48ca4429/scratchpad/` ending with `EXIT: $?`, ONE until-loop to wait.
- [ ] **Step 3: Commit**

```bash
git add client/CLAUDE.md client/src/qollanma
git commit -m "docs: the home page is translated — CLAUDE.md and news entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off to the controller** — report commits and check results. The controller then checks `/` in the browser with a mock API (CEO view and teacher view) in ru, de, en and uz-Cyrl: no crash, nothing left in Uzbek that should be translated, long German/Russian texts fit (money strip, funnel strip, chart legends), the language switch without a reload.
