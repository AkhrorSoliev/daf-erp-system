# Student Portal («student.dafzentrum.uz») Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the student portal the same five interface languages as the staff panel (uz, uz-Cyrl, ru, de, en) with a language picker for the student, and translate everything the portal draws: the sign-in page, the shell (side rail, bottom nav, «Ko'proq» hub), home, schedule, attendance, payments, profile, settings, FAQ, about, radio, first-run onboarding and the whole «Ta'lim» learning area (levels, units, lessons, exercises, league). The CEO said to continue with everything that can be translated; the CEO will name wrong translations afterwards.

**Architecture:** The i18n mechanism of ADR-0102 is reused as it is (Uzbek-Latin text = key; `t()`/`msg()`; dictionaries `ru/de/en.ts`; uz-Cyrl derived; `STRICT_FILES` coverage gate; cached dictionary chunk of ADR-0110). Differences from the staff panel, decided here (**no server change, no migration**):
- **The language lives on the device only** (the `daf-locale` cookie of the student host). There is no account language for students (`PATCH /users/ui-locale` is a staff route, `@AnyStaff()`): every `setLocale` call in the portal passes `{ save: false }`, `LocaleSync` is NOT mounted in the portal, and `changeUiLocale`'s `persist` therefore never calls the server. A student's language is a per-device choice; an account-level student language is a possible later step (server field + migration) and is out of scope.
- **The portal layout mounts the provider.** `app/(student-portal)/portal/layout.tsx` becomes `async`, reads the cookie with `currentLocale()` and wraps its children in `I18nProvider` (as `StaffSignInShell` does); the student sign-in branch of `app/(auth)/login/page.tsx` does the same for the student login form and its forgot-password dialog.
- **The picker is Lumio-skinned** (`lumio/` primitives, not the shadcn `LanguageRadioGroup`): a new `lumio/language-picker.tsx` (list rows with a check on the chosen language, like the theme segmented control family) drawn on `/portal/settings` (a «Til» section), on the student sign-in page (compact menu, as `LanguageMenu` on the staff login) and in the «Ko'proq» hub only if there is room. Language names are shown in their own language (shared constants from `i18n/locales.ts`).
- **German learning content is DATA and is never translated:** words, sentences, dialogues, exercise items and options, hints, answers, transcripts, audio texts, unit/lesson titles in German and the Uzbek `titleUz` fields the server sends for them. Only the portal's own chrome and the texts the client words itself are translated. (Uzbek glosses that arrive from the server as lesson content are data too.)
- Server-sent texts (error messages, statement/receipt text, payment gateway texts) are not translated.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env), `client/src/i18n/`. Client only.

## Global Constraints

**Read `docs/superpowers/plans/2026-10-18-oquvchilar-tarjimasi.md` lines 11-28 and the «Global Constraints» of the ustozlar, tolovlar, hisobotlar, lidlar, topshiriqlar, sozlamalar and qolgan-sahifalar plans in the same folder once — they bind every task here word for word** (worktree path and git rules, no Prettier on `client/`, glossary pointer `docs/superpowers/plans/2026-10-17-tillar.md` lines 13-25, `msg()`/`t()` forms, template-literal patterns, helpers with an optional last `t` defaulting to identity, money/dates/server text, `useT()` placement, inventory first, task ending checklist, lessons from earlier reviews: key clashes, ru gender/number, de glossary words, uz-Cyrl acronyms/months/key names/German words kept Latin, no `t` in deps of a fetching effect, translate form/validation text at draw time, store translators set from page roots, shared pieces now follow the language everywhere), with these additions:

- **Student-facing tone.** Texts speak to a learner (often a teenager or an adult beginner): short, friendly, plain. Keep the existing meaning exactly; no new promises. The Lumio look (playful «clay» style, big touch targets) is untouched; translated texts can be longer (ru/de): check that buttons, tiles, chips, tab labels, the bottom nav (5 items, ~64px wide on a phone) and the 72px rail labels still fit — choose short translations for nav/tile labels (`RailNavItem` allows ~63px at 11px: a longer name needs a shorter wording, not a smaller font) and report any label that is longer than its Uzbek source by more than ~40%.
- **Words a learner meets in the lesson UI must be consistent:** «Tekshirish» (check), «Keyingi» (next), «To'g'ri»/«Xato» (right/wrong), «Davom etish», streak/«Ketma-ket kunlar», league words, XP/points: one translation each, used everywhere (grep the dictionaries first; reuse keys across tasks; read the earlier tasks' reports for the chosen words).
- **Reuse the staff vocabulary where the concept is the same** (Balans, To'lov, Jadval, Davomat, Guruh, Ustoz, Profil, Parol, Telefon), but check the existing translation fits a learner's context (ru gender/number, «Faol», «Kutilmoqda», «Bekor qilish» = Cancel, «Tizim», «Chiqish» = sign out).
- Names, phones, group names, teacher names, amounts, dates from the server are data. Brand/product words stay Latin in every language (Payme, Click, Uzum, Telegram, DaF, Netzwerk, Goethe, A1…C1, XP if kept as a loanword — decide once and record it).
- Browser/OS audio, microphone, notification permission prompts are not ours; the client's own messages about them are texts.
- Activity tracking, radio and lesson audio behaviour untouched. No `t` in deps of effects that track activity, fetch, or start audio (ref copies).
- Static-markup tests of the portal (`student-portal-*.test.ts`, `statement-card.test.ts`, …) render outside a provider: with the identity default they keep passing; keep them green and do not weaken them.
- Out of scope: the staff panel; server files; the public pages (`/r`, `/t`, `/f`, `/privacy`) and the guide; the payment result page's server-driven texts (translate only the client's own words).
- Paths below are under `client/src/` unless stated.

---

### Task 1: Mechanism — provider, picker, sign-in page, settings «Til» section

**Files:** `app/(student-portal)/portal/layout.tsx` (async, provider from the cookie), `app/(auth)/login/page.tsx` (student branch gets the provider) and `app/(auth)/login/student-login-form.tsx`, `components/student-portal/lumio/language-picker.tsx` (new) + its test (static markup: every language listed, the chosen one marked, the call uses `{ save: false }` — test the pure part), `components/student-portal/student-settings-page.tsx` («Til» section, the rest of this page is Task 2 — add only the section and wrap its own texts), `components/student-portal/lumio/theme-segmented.tsx` only if its labels are texts; `i18n/` helpers only if something is missing (e.g. `languageBootScript` placement for the portal: `<html lang>` follows the cookie as on the staff side; reuse `bindDocumentLanguage`). Dictionaries and `i18n/i18n-coverage.test.ts`.

- [ ] **Step 1:** Read `app/(dashboard)/layout.tsx`, `app/(auth)/staff-sign-in-shell.tsx`, `components/auth/language-menu.tsx`, `components/language-radio-group.tsx`, `i18n/context.tsx`, `i18n/locale-cookie.ts`, `i18n/sign-in-locale.ts` and `client/CLAUDE.md` «Languages». Implement the provider mounting, the Lumio picker and its three placements (settings «Til», sign-in page menu; hub only if natural), translate the files named above, prove with a test that the picker never triggers an account save (`save: false`) and that outside a provider everything stays Uzbek. The sign-in page for students already contains Uzbek text: wrap and translate it here with the forgot-password dialog's Lumio variant (`forgot-password-*` files are shared with staff and already translated). Check in the report that the cookie written by `writeLocaleCookie` is readable by the portal layout on the student host (same path `/`, no domain mismatch). Commit message: `feat(client): language picker and provider for the student portal`.

---

### Task 2: Shell, profile, settings, onboarding

**Files:** `components/student-portal/student-portal-layout.tsx`, `lumio/bottom-nav.tsx`, `lumio/side-rail.tsx`, `lib/student-nav-items.ts` (titles → `msg()`; `student-portal-nav.test.ts` stays green), `student-more-hub.tsx`, `student-logout-button.tsx`, `load-failed.tsx`, `student-name-dialog.tsx`, `student-password-dialog.tsx`, `student-profile-page.tsx`, `student-settings-page.tsx` (the rest), `student-id-copy.tsx`, `student-extra-phone-dialog.tsx`, `extra-phone-row-state.ts` (+ test), everything in `onboarding/` (`StudentOnboardingScreen`, `PhoneStep`, `ProfileStep`, `birth-date.ts` messages), the other `lumio/*` primitives that draw words (`EmptyState` defaults, `Skeleton` sr-only, `BottomSheet` close labels, …) and `lib/*` helpers with words (`load-state.ts` etc.); dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Navigation labels get SHORT translations (see constraints) and are checked against the rail and bottom-nav widths. Form validation messages: `…FormError(t, message)` pattern, translate at draw time; server messages raw. Commit message: `feat(client): translate the student portal shell, profile and onboarding into ru, de, en`.

---

### Task 3: Home, schedule, attendance, payments, FAQ, about

**Files:** `student-home-page.tsx`, `student-schedule-view.tsx`, `student-attendance-history.tsx`, `student-payment-summary.tsx` (+ test), `statement-card.tsx` (+ test), `gateway-handoff.tsx`, `payment-result-page.tsx` (client's own words only), `student-faq-page.tsx`, `student-about-page.tsx`, and their `lib/` helpers with words; `app/(student-portal)/portal/**` page files only if they carry text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Money: `formatBalance(x, t("so'm"))`/`som`; the quick-amount chips keep their numbers; Payme/Click/Uzum stay Latin. The Telegram Mini App variants of the statement/payment buttons («Telegram'ga yuborish», «Payme'ga o'tish») are texts. FAQ questions and answers and the «Biz haqimizda» text are UI content written in the code: translate them fully (one key per paragraph, placeholders for any figures). Commit message: `feat(client): translate the student home, schedule, payments and FAQ into ru, de, en`.

---

### Task 4: Radio and the learning area — overview screens

**Files:** everything in `radio/` and `student-radio-page.tsx`, `lib/radio-stations.ts` texts that the client words (category names → `msg()`; station names are data), and in `lernen/`: `lernen-levels-page.tsx`, `lernen-unit-page.tsx` (+ test), `yol/*` (the learning path), `reyting/*` (league/ranking), `liga.ts`, `maqsad.ts`, `nishon.ts`, `eslatma.ts`, `soz-hisoblagichi.ts`, `fortschritt.ts` (+ tests; helpers that build sentences get an optional last `t`), `lernen-lesson-page.tsx`; the other non-exercise `lernen/*` files; `app/(student-portal)/portal/lernen/**` pages only if they carry text; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** Level/unit/lesson TITLES come from the server or from content files (data; German titles and Uzbek `titleUz` stay raw). Streak, goal («maqsad»), reminder («eslatma»), word counter and league words are client texts: pick one wording for each concept and record it for Task 5. Commit message: `feat(client): translate the student radio and learning overview into ru, de, en`.

---

### Task 5: Learning area — exercises

**Files:** everything in `lernen/uebung/` (the exercise session screen `seans-ekrani.tsx` ~760 lines, the bottom bar `pastki-panel.tsx`, feedback, exercise type components, progress, finish/summary screens, session queue helpers `seans-navbat.ts`), `lernen/mc-exercise.tsx`, `lernen/vocab-drill.tsx`, `lernen/use-clip-player.ts` messages, `lernen/types.ts` only for label maps; dictionaries and `i18n-coverage.test.ts`.

- [ ] **Step 1: same procedure.** **Exercise content is data and must NEVER go through `t()`:** the German prompt, items, options, the correct answer shown after a wrong answer, hints, transcripts and any Uzbek gloss that the server sends with the item. The client's own words are texts: instructions per exercise type («Tinglang va tanlang», «So'zni yozing»…), buttons, feedback («To'g'ri!», «Xato», «Keyingi»), progress and summary captions (XP, streak, accuracy), error and retry states, exit-confirm dialog, audio control `aria-label`s. `pastki-panel` and the lesson bar stay clear of the side rail (see `client/CLAUDE.md`; `pastki-panel.test.ts` stays green). In uz-Cyrl German words that appear inside Uzbek source texts stay Latin (overrides/KEEP_LATIN as in the media pages). Commit message: `feat(client): translate the student exercises into ru, de, en`.

---

### Task 6: Docs and final checks

**Files:** `client/CLAUDE.md` («Student Portal» section: the portal now has a device-only language (`daf-locale` cookie, `save: false`, no `LocaleSync`), the Lumio language picker, the rule that learning content is data; «Languages»: move the student portal and the student sign-in page from «Not translated yet» to translated, update the remaining list), `docs/adr/` — a new ADR (next free number; check `ls docs/adr` and `git ls-tree origin/main docs/adr/` first) in Uzbek, shaped like ADR-0102: «O'quvchi portalida til: qurilmada saqlanadi» (Holati, Sana, Bog'liq: 0102, 0106, 0110; Kontekst, Qaror: cookie only, `save: false`, no server field, Lumio picker; Taqiqlanadi: calling `PATCH /users/ui-locale` from the portal, translating learning content; Muqobillar: account language for students (server field + migration) postponed; Oqibatlar: a student's language is per device) and its row in `docs/adr/README.md`.

- [ ] **Step 1:** write the ADR and update `client/CLAUDE.md`; run `npx vitest --config vitest.config.mts run`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, then `npm run build` (not in parallel with tests). Commit: `docs(client): record the student portal language`.
