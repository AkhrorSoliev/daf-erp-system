# Dictionary Loading: Cached Chunk Instead of Inlined Payload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop sending the whole dictionary (ru ≈100 KB raw, ≈27 KB gzipped, growing with every translated section) inside every server-rendered page. Ship it as a separate, immutable, browser-cached chunk per language, and keep the first paint already translated (no flash).

**Problem:** `(dashboard)/layout.tsx` and `StaffSignInShell` call `await loadDictionary(locale)` on the server and pass the result as a prop to the client `I18nProvider`, so the dictionary is serialized into the page's RSC payload on every hard load.

**Architecture:** The provider receives only `initialLocale`. It reads the dictionary with React `use()` from a module-level cache of promises (`dictionary-cache.ts`): on the server the dynamic `import()` resolves while rendering, so the HTML is already translated; in the browser the same chunk is fetched once (hashed, `immutable`, cached across loads and deploys of unchanged content) and hydration waits for it. Once a promise settles it is tagged `status: "fulfilled"` / `value` (the convention React honors), so every later `use()` is synchronous. `initialDictionary` stays an OPTIONAL prop (many tests render the provider with a dictionary; when given it is used and nothing is loaded). The in-app language switch (`setLocale`) keeps using `loadDictionary` and fills the same cache.

**Tech Stack:** Next.js 16 (App Router, Turbopack) + React 19 (`use`), vitest (node env), `client/src/i18n/`. Client only: no server change, no migration.

**Spec of record:** this plan + `docs/adr/0102-…` (mechanism) — a short new ADR records the loading decision.

## Global Constraints

- Work in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-user-header` (branch `worktree-admin-user-header`). Bash cwd may reset: run `cd client; <cmd>` in ONE call. Plain separate git commands only. Client vitest: `npx vitest --config vitest.config.mts run <paths>`. **No Prettier on `client/` files.** Never run `npm run build` and tests in parallel. Commit messages and new code comments in English; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Behaviour that must NOT change: the first paint of `/login` and every dashboard page is already in the cookie's language; no hydration warning in the browser console; `<html lang>` script unchanged; `setLocale` (switch without reload, failed load changes nothing, latest call wins) unchanged; Uzbek (`uz`) loads no dictionary at all (empty object, no network); Uzbek Cyrillic loads only its small override file; outside a provider `useT()` still returns the Uzbek source; `i18n:check` and the whole client suite stay green.
- Verification is mandatory on a PRODUCTION build (`npm run build` + `npm start` on a free port) — `next dev` hides chunking and hydration problems. The controller repeats the browser check; you must do the HTML/payload check with `curl`.

---

### Task 1: Cached chunk loading

**Files (under `client/src/`):**
- Create: `i18n/dictionary-cache.ts`, `i18n/dictionary-cache.test.ts`
- Modify: `i18n/context.tsx`, `i18n/load-dictionary.ts` (only if needed to share the cache), `app/(dashboard)/layout.tsx`, `app/(auth)/staff-sign-in-shell.tsx`, `i18n/context.test.ts` (new cases), `i18n/CLAUDE`-style notes in `client/CLAUDE.md` («Languages» → where the language comes from)
- Create: `docs/adr/<next free number>-lugat-alohida-chunk.md` (Uzbek Latin, short, shaped like ADR-0102: Holati, Sana 2026-10-18, Bog'liq, Kontekst, Qaror, Taqiqlanadi, Muqobillar, Oqibatlar) and its row in `docs/adr/README.md` (`ls docs/adr | tail -3` and `git ls-tree --name-only origin/main docs/adr/ | tail -3` first; use the next free number)

**Interfaces:**
- Produces: `getDictionary(locale: UiLocale): Thenable<Dictionary>` — returns a cached promise per locale; an already settled one is tagged (`status`, `value`) so `use()` does not suspend; `rememberDictionary(locale, dictionary)` stores a dictionary the switch just loaded; both exported for the provider.
- Consumes: `loadDictionary`, `Dictionary`, `UiLocale`.

- [ ] **Step 1: Failing tests for the cache** (`dictionary-cache.test.ts`, node env): `getDictionary("uz")` resolves to `{}` and is tagged fulfilled synchronously after the first await; the same promise object is returned for the same locale (loader called once — spy on `loadDictionary` via `vi.mock("./load-dictionary")`); a rejected load is NOT cached (a retry calls the loader again); `rememberDictionary` makes the next `getDictionary` return a fulfilled thenable without calling the loader; two locales do not share an entry. Run red.
- [ ] **Step 2: Implement `dictionary-cache.ts`** (module-level `Map`, tag promises with `status: "pending" | "fulfilled" | "rejected"` and `value`/`reason` as React's `use` convention expects; remove a rejected entry). Run green.
- [ ] **Step 3: Provider.** `I18nProvider` props become `{ initialLocale; initialDictionary?: Dictionary; children }`. When `initialDictionary` is given, use it (as today). Otherwise `const loaded = use(getDictionary(initialLocale))`. State initial value = that dictionary. `apply` (language switch) also calls `rememberDictionary`. Keep `useState`/`useRef` semantics so the rules of hooks hold (`use` may be called conditionally but prefer a single unconditional path: `const dictionary = initialDictionary ?? use(getDictionary(initialLocale))` is a conditional-expression hook call — React permits `use` in conditionals; if the React Compiler lint complains, restructure with a tiny helper hook). Add tests in `context.test.ts`: without `initialDictionary` and with a pre-filled cache (`rememberDictionary("ru", {...})`) the provider renders the translated text synchronously via `renderToStaticMarkup`; with `initialDictionary` nothing is loaded.
- [ ] **Step 4: Layouts.** `(dashboard)/layout.tsx` and `staff-sign-in-shell.tsx`: stop calling `loadDictionary` and stop passing `initialDictionary`; pass only `initialLocale={locale}` (keep `currentLocale()` and the `languageBootScript`). The provider is a client component, so the server render awaits the dictionary through `use()`; if Next requires a Suspense boundary there, add one that does not change the layout (a bare `<Suspense>` with no fallback is fine).
- [ ] **Step 5: Production-build verification** (report real output): `cd client; npm run build`, then `npm start -- --port 3520` in the background with `NEXT_PUBLIC_API_URL` pointing to a dead port. With a placeholder session (`Cookie: token=x; daf-locale=ru`) `curl -s http://localhost:3520/settings` (any dashboard route) and show: (a) the HTML contains translated Russian shell text (e.g. «Главная» or «Настройки»), (b) the page's RSC payload NO LONGER contains the dictionary (grep for a long Russian dictionary string that is NOT rendered on that page, e.g. a text from another section such as «Список всех учеников» or «Политика конфиденциальности» — count occurrences before/after: use `git stash`-free comparison by building once on `origin/main` is NOT required; just show it is absent now), (c) the language chunk is a separate file under `.next/static` (find the chunk that contains «Список всех учеников» and give its size and gzip size), (d) `/login` with `daf-locale=ru` shows Russian text in the HTML and the payload has no dictionary. Stop the server afterwards. If hydration fails or the page cannot render without the dictionary in the payload, STOP and report BLOCKED with the evidence instead of improvising.
- [ ] **Step 6: Docs.** ADR (Uzbek): decision — the dictionary is a separate cached chunk per language, the provider reads it with `use()`, `initialDictionary` stays optional for tests; Taqiqlanadi: dictionary in props/payload; Muqobillar: per-route-group dictionaries (more code and a shared-component rule, postponed until the chunk itself gets large, re-check at ~150 KB gzipped), client-only fetch after hydration (flash of Uzbek); Oqibatlar: first visit one extra cached request, later visits none, payload ≈ −27 KB gzipped for ru. `client/CLAUDE.md` «Languages»: «Where the language comes from» sentence updated (the layout passes only the language; the provider loads the dictionary chunk).
- [ ] **Step 7: Full checks, one after another:** `npx vitest --config vitest.config.mts run src/i18n src/components src/lib`, `npx tsc --noEmit`, `npx eslint src --quiet`, `npm run i18n:check`, `npm test`, `npm run build` (already done in Step 5 — rerun only if you changed code after it). Commit:

```bash
git add client docs
git commit -m "perf(client): ship the dictionary as a cached chunk instead of inlining it in every page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Hand off to the controller** — report commit, check results, and the Step 5 evidence. The controller then repeats the browser check on a production build: first paint translated, console clean (no hydration warning), language switch, reload, `/login`.
