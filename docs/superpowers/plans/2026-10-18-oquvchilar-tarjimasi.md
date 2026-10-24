# Students Section («O'quvchilar») Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate everything the students section draws (`/students` list, `/students/profile/[id]` and every dialog, tab and drawer opened from them) into ru, de and en (Uzbek Cyrillic is derived), using the mechanism of ADR-0102. The CEO asked for the whole section in one go and will name wrong translations afterwards.

**Architecture:** No new design (same as the home page plan `docs/superpowers/plans/2026-10-17-bosh-sahifa-tarjimasi.md`). Every visible text becomes `t("Uzbek source")` (or `msg("…")` in a module-level list/config and `t(x)` where drawn), the file joins `STRICT_FILES`, and the three dictionaries get one entry per text. Components render inside the dashboard `I18nProvider`, so they call `useT()` directly (no optional `t` props needed, except for a shared pure helper used outside the dashboard).

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
- Out of scope: any page outside the students section (files shared with other pages — `lib/status-config.ts`, `components/ui/*`, `components/shared/*` — keep their default Uzbek output identical: labels become `msg()`, drawn with `t()` only in this section's components), server files, anything already translated (sidebar, header, home page, attendance rows).
- Inventory first: for every file of a task, list every visible Uzbek text (JSX text, string props `label|title|aria-label|placeholder|hint|tooltip|description|alt`, template literals, constants, toasts, helper return values in sibling `.ts` files) with `grep -n` and by reading the file; a text the coverage test cannot see (never wrapped) is the most likely miss, so read each file fully once.
- Every task ends with: coverage test red → translations → `npx vitest --config vitest.config.mts run src/i18n src/components src/lib`, `npx tsc --noEmit`, `npx eslint` on the touched files (0 errors; a quoted `(auth)`/`(dashboard)` path may be refused in the worktree — use a `src/app/*/…` glob), then commit.

---


### Task 1: The students list — table, filters, stats, row actions, status badges

**Files (under `client/src/`):** `components/students/students-client.tsx`, `students-filters.tsx`, `students-stats.tsx`, `students-table.tsx`, `student-row-actions.tsx`, `student-status-badge.tsx`, `student-contact-badges.tsx`, `student-phone-rows.ts`, `app/(dashboard)/students/page.tsx` (only if it has text), and `lib/status-config.ts` (student status labels → `msg()`; every other consumer of that config keeps rendering the same Uzbek because `msg` returns the text unchanged); dictionaries and `i18n/i18n-coverage.test.ts`. Existing tests (`student-contact-badges.test.ts`, `student-phone-rows.test.ts`, …) stay green.

- [ ] **Step 1: Inventory every visible text, add the files to `STRICT_FILES`, wrap, run the coverage test red, write translations, verify, commit.** Table headers, filter labels/placeholders/options, stats captions, empty/error states, row action menu items, toasts, confirm dialogs and tooltips are texts; student names, phones, group names are data. Student status words (Faol, Muzlatilgan, Ketgan, …) are client texts. Commit message: `feat(client): translate the students list into ru, de, en`.

---

### Task 2: Adding and editing a student

**Files (under `client/src/components/students/`):** `add-student-dialog.tsx`, `edit-student-form.tsx`, `edit-student-drawer.tsx`, `edit-student-additional-fields.tsx` (+ its test), and any small helper they import with visible text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure as Task 1.** Form labels, placeholders, validation messages, section titles, toasts and buttons are texts. Phone formats and the `+998` prefix stay raw. Server validation messages are never translated, only client fallbacks. Commit message: `feat(client): translate adding and editing a student into ru, de, en`.

---

### Task 3: The student profile — card, tabs, group card, leads, calls, mock exams, app activity

**Files (under `client/src/components/students/`):** `student-profile-client.tsx`, `student-profile-card.tsx`, `student-profile-tabs.tsx`, `student-profile-tabs-utils.ts`, `student-group-card.tsx`, `student-debt-origin.tsx`, `student-lead-tab.tsx`, `student-call-history-tab.tsx`, `student-mock-exams-tab.tsx`, `student-app-activity-tab.tsx`, `app/(dashboard)/students/profile/[id]/page.tsx` (only if it has text); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Tab names (a `msg()` list), card captions, badges, the «Qarz» origin text, empty states and relative-time words are texts. Dates/times/amounts keep formats. Mock-exam names, group names, call notes are data. Commit message: `feat(client): translate the student profile into ru, de, en`.

---

### Task 4: Group operations — enrolling, removing, departure money

**Files (under `client/src/components/students/`):** `enroll-to-group-dialog.tsx` (613 lines — read it fully once), `enroll-preview-block.tsx`, `student-remove-from-group-dialog.tsx` (492 lines), `departure-money-block.tsx`, `departure-money.ts`, `use-departure-preview.ts`, `student-closed-enrollments-section.tsx`; dictionaries and `i18n-coverage.test.ts`. Existing tests (`enroll-preview-block.test.ts`, `departure-money*.test.ts`, `departure-policy-guard.test.ts`) stay green; a helper that builds a sentence (`departure-money.ts`) gets an optional last `t` parameter defaulting to identity, or its strings become `msg()` — keep its tests unchanged.

- [ ] **Step 1: same procedure.** Money explanations, policy messages, previews, step titles and confirmations are texts; amounts keep `formatBalance`/`formatNumber` formats (use `formatBalance(x, t("so'm"))` where the Uzbek source showed «so'm»); policy reasons that arrive from the server stay raw. Commit message: `feat(client): translate enrolling and removing students into ru, de, en`.

---

### Task 5: Money dialogs — write-off, correct payment, initial balance

**Files (under `client/src/components/students/`):** `write-off-debt-dialog.tsx`, `correct-payment-dialog.tsx`, `initial-balance-dialog.tsx`, `debt-write-off-types.ts` (only if it holds visible text; `debt-write-off-notice.test.ts` stays green); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Commit message: `feat(client): translate the student money dialogs into ru, de, en`.

---

### Task 6: Lesson trail, SMS and the payment statement

**Files (under `client/src/components/students/`):** `lesson-trail-tab.tsx`, `lesson-trail-labels.ts` (+ test), `sms-tab.tsx`, `sms-error-text.ts` (+ test), and everything in `statement/` (`statement-summary.tsx`, `statement-report.tsx`, `statement-payments.tsx`, `payment-statement.tsx`, `statement-months-table.tsx`, `statement-ledger.tsx`, and any other file there); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Lesson-trail labels in `lesson-trail-labels.ts` become `msg()` with `t()` at the draw site; `sms-error-text.ts` maps client error codes to words: those words are client texts (the server's own error text is not). Statement month names built from a fixed list are texts; `Intl`-derived names stay. Check whether the statement is also exported to PDF/printed by a server-built document: server-built output is never translated. Commit message: `feat(client): translate the lesson trail, SMS and statement into ru, de, en`.

---

### Task 7: Certificates and contracts

**Files (under `client/src/components/students/`):** everything in `certificates/` and `contracts/` (`issued-documents-list.tsx`, `revoke-certificate-dialog.tsx`, `student-certificates-tab.tsx`, `contract-*.tsx`, `student-contracts-tab.tsx`, …); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Legal/contract wording that is written into a document built by the server stays untouched; only what the screen draws is translated. Commit message: `feat(client): translate certificates and contracts into ru, de, en`.

---

### Task 8: Docs and full checks

**Files:** `client/CLAUDE.md` («Languages» → «Pages translated so far» / «not translated yet», still-Uzbek list stays accurate), `client/src/qollanma/yangiliklar.ts` (one entry at the TOP in the existing shape — read the current top first, other chats edit it: `sana: "2026-10-18"`, `sarlavha: "O'quvchilar bo'limi tarjima qilindi"`, a `matn` listing what is translated (list, profile, add/edit, enrolling/removing, money dialogs, lesson trail, SMS, statement, certificates, contracts) and that names and server texts stay as they are, `rollar: [1, 2, 3, 4, 5]`, `sahifa: { bolim: "boshlash", sahifa: "interfeys" }`). No new ADR.

- [ ] **Step 1: Docs as above.**
- [ ] **Step 2: Full checks, one after another** (client only): `cd client; npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, `npm test`, `npm run build` (never in parallel; long ones with `run_in_background: true`, a log under `/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/25e12e41-5ba3-4971-a8dc-465d48ca4429/scratchpad/` ending with `EXIT: $?`, ONE until-loop; a transient `next/font/google` error: rerun once).
- [ ] **Step 3: Commit**

```bash
git add client/CLAUDE.md client/src/qollanma
git commit -m "docs: the students section is translated — CLAUDE.md and news entry

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off to the controller** — the controller checks `/students` and a profile in the browser with a mock API in ru and de: no crash, nothing left Uzbek that should be translated, long texts fit, dialogs open.
