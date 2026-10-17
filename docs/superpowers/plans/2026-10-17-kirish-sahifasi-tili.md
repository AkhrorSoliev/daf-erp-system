# Language Picker on the Staff Sign-in Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff pick one of the five interface languages on the `admin.`/`lehrer.` sign-in page, translate that page, and make the account's language win once the person signs in.

**Architecture:** `StaffSignInShell` (shared by `/login`, the Telegram callback and the staff Mini App entry) becomes `async`: it reads the `daf-locale` cookie, loads the dictionary and wraps its children in the existing `I18nProvider`, exactly like the dashboard layout. A new `LanguageMenu` (only `/login` asks for it) switches the language with the existing `useLocale().setLocale` (cookie only, nobody is signed in). `useGreeting().greet` — the one place every staff sign-in ends — first adopts the account's language (`save: false`), then shows the greeting, so the cabinet opens in the account's language. All sign-in texts go through `t()`/`msg()` and join `STRICT_FILES`.

**Tech Stack:** Next.js 16 + React 19 + vitest (node env, `renderToStaticMarkup`), the `client/src/i18n/` mechanism of ADR-0102. No server change, no migration.

**Spec:** `docs/superpowers/specs/2026-10-17-kirish-sahifasi-tili-design.md`

## Global Constraints

- Work in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-user-header` (branch `worktree-admin-user-header`, already contains ADR-0102's mechanism on `main`). Bash cwd may reset between calls: run `cd client; <cmd>` in ONE call. Plain separate git commands only. Client vitest: `npx vitest --config vitest.config.mts run <paths>`. **No Prettier on `client/` files.** Never run `npm run build` and tests in parallel.
- UI text in code stays Uzbek Latin (the key). Commit messages and new code comments in English; every commit ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Translation rules, glossary and style: `docs/superpowers/plans/2026-10-17-tillar.md` lines 13-25 («Global Constraints») — read those lines. Dictionaries: `client/src/i18n/dictionaries/{ru,de,en}.ts`, identical key sets, `{n}` placeholders unchanged, sentence case, same ending punctuation as the source, German nouns capitalized, no plural-agreement traps in ru (use a form that needs no declension). **Before adding a key, grep the three dictionaries for it; never add a duplicate key** (a key may be added only once, even if two files use it). Append new entries before the closing `};` under a comment `// Sign-in page`.
- `msg()` takes a string LITERAL; `t(x)` may take a variable that came from `msg()`; any other form inside `t(…)` (ternary, template, sum) fails the coverage test: write one literal call per text. Never pass data (names, server text) through `t()`.
- Server-sent text (error messages from the API) is never translated; only client-side fallback texts are. Numbers keep their format (the phone placeholder «998 90 123 45 67», «XX XXX XX XX», «••••» stay raw).
- `forgot-password-*`, `telegram-login-button`, `login-footer`, `theme-toggle` are shared with the student portal and the 404/error pages. Those render outside any `I18nProvider`, so `useT()` returns the Uzbek source there — behaviour unchanged. Do not add student-portal translations.
- Out of scope (do NOT touch): `student-login-form.tsx`, `mini-app-notices.tsx`, `telegram-callback.tsx` texts, any server file.

---

### Task 1: Mechanism — provider in the shell, language menu, account language adopted at sign-in

**Files (under `client/src/`):**
- Create: `i18n/sign-in-locale.ts`, `i18n/sign-in-locale.test.ts`
- Create: `components/language-radio-group.tsx`, `components/auth/language-menu.tsx`, `components/auth/language-menu.test.ts`, `components/auth/sign-in-heading.tsx`
- Modify: `components/header-user-menu.tsx`, `components/auth/staff-greeting.tsx` (hook only), `app/(auth)/staff-sign-in-shell.tsx`, `app/(auth)/login/page.tsx`, `lib/portal.ts`
- Modify: `i18n/dictionaries/{ru,de,en}.ts`, `i18n/i18n-coverage.test.ts`

**Interfaces:**
- Consumes: `I18nProvider`, `useT`, `useLocale` (`@/i18n/context`), `currentLocale` (`@/i18n/server`), `loadDictionary`, `languageBootScript`, `LOCALES`, `isUiLocale`, `UiLocale`, `msg`.
- Produces: `localeToAdopt(accountLocale: unknown, current: UiLocale): UiLocale | null`; `adoptAccountLocale(accountLocale: unknown, deps: { current: UiLocale; setLocale(next: UiLocale, options?: { save?: boolean }): Promise<boolean> }): Promise<boolean>`; `<LanguageRadioGroup />`; `<LanguageMenu />`; `<SignInHeading title />`; `StaffSignInShell` prop `languageMenu?: boolean`; `useGreeting().greet` now returns `Promise<void>`.

- [ ] **Step 1: Write the failing tests**

Create `client/src/i18n/sign-in-locale.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { adoptAccountLocale, localeToAdopt } from "./sign-in-locale";

describe("localeToAdopt", () => {
  it.each([[null], [undefined], [""], ["klingon"], [42]])("leaves the page alone when the account holds %j", (account) => {
    expect(localeToAdopt(account, "ru")).toBeNull();
  });

  it("leaves the page alone when the account language is the page's language", () => {
    expect(localeToAdopt("ru", "ru")).toBeNull();
  });

  it.each(["uz", "uz-Cyrl", "ru", "de", "en"] as const)("adopts %s over a different page language", (account) => {
    const other = account === "uz" ? "en" : "uz";
    expect(localeToAdopt(account, other)).toBe(account);
  });
});

describe("adoptAccountLocale", () => {
  it("switches the page to the account language without saving it back", async () => {
    const setLocale = vi.fn().mockResolvedValue(true);
    await expect(adoptAccountLocale("uz", { current: "ru", setLocale })).resolves.toBe(true);
    expect(setLocale).toHaveBeenCalledTimes(1);
    expect(setLocale).toHaveBeenCalledWith("uz", { save: false });
  });

  it("does not touch the page when there is nothing to adopt", async () => {
    const setLocale = vi.fn();
    await expect(adoptAccountLocale(null, { current: "ru", setLocale })).resolves.toBe(false);
    await expect(adoptAccountLocale("ru", { current: "ru", setLocale })).resolves.toBe(false);
    expect(setLocale).not.toHaveBeenCalled();
  });

  it("reports false when the language could not be loaded", async () => {
    const setLocale = vi.fn().mockResolvedValue(false);
    await expect(adoptAccountLocale("de", { current: "uz", setLocale })).resolves.toBe(false);
  });

  it("never throws, so the greeting still appears", async () => {
    const setLocale = vi.fn().mockRejectedValue(new Error("network"));
    await expect(adoptAccountLocale("de", { current: "uz", setLocale })).resolves.toBe(false);
  });
});
```

Create `client/src/components/auth/language-menu.test.ts`:

```ts
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The menu content renders in a portal and only while open; draw it inline,
// keeping the two props the test reads (`value` of the group, `lang` of an item).
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuRadioGroup: ({ value, children }: { value?: string; children?: ReactNode }) =>
      createElement("div", { "data-value": value }, children),
    DropdownMenuRadioItem: ({ value, lang, children }: { value?: string; lang?: string; children?: ReactNode }) =>
      createElement("span", { "data-item": value, lang }, children),
  };
});
vi.mock("@/i18n/context", () => ({
  useT: () => (source: string) => source,
  useLocale: () => ({ locale: "ru", setLocale: async () => true }),
}));

import { LOCALES } from "@/i18n/locales";
import { LanguageMenu } from "./language-menu";

const html = renderToStaticMarkup(createElement(LanguageMenu)).replace(/&#x27;/g, "'");

describe("LanguageMenu", () => {
  it("names the current language on the button, in its own language", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Til: Русский"/);
    expect(html).toMatch(/<span lang="ru">Русский<\/span>/);
  });

  it("lists the five languages, each marked with its own lang", () => {
    for (const { id, label } of LOCALES) {
      expect(html).toContain(`<span data-item="${id}" lang="${id}">${label}</span>`);
    }
  });

  it("marks the current language as the group's value", () => {
    expect(html).toContain('data-value="ru"');
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run (in `client/`): `npx vitest --config vitest.config.mts run src/i18n/sign-in-locale.test.ts src/components/auth/language-menu.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 3: Implement `sign-in-locale.ts`**

Create `client/src/i18n/sign-in-locale.ts`:

```ts
import { isUiLocale, type UiLocale } from "./locales";

/**
 * The language the sign-in page must switch to once a person signs in, or null
 * to leave it. The account's language wins over the one picked on the page
 * (ADR-0106); an account that never chose (`null`) leaves the page's language,
 * which `LocaleSync` then saves onto the account (ADR-0102).
 */
export function localeToAdopt(accountLocale: unknown, current: UiLocale): UiLocale | null {
  if (!isUiLocale(accountLocale)) return null;
  return accountLocale === current ? null : accountLocale;
}

export interface AdoptDeps {
  /** The page's language right now. */
  current: UiLocale;
  setLocale(next: UiLocale, options?: { save?: boolean }): Promise<boolean>;
}

/**
 * Switch the page to the account's language (cookie included, nothing saved
 * back). Never throws: a failed switch must not hold the greeting back.
 */
export async function adoptAccountLocale(accountLocale: unknown, deps: AdoptDeps): Promise<boolean> {
  const target = localeToAdopt(accountLocale, deps.current);
  if (!target) return false;
  try {
    return await deps.setLocale(target, { save: false });
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Implement the language group and menu; reuse the group in the user menu**

Create `client/src/components/language-radio-group.tsx`:

```tsx
"use client";

import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { useLocale } from "@/i18n/context";
import { LOCALES, type UiLocale } from "@/i18n/locales";

/**
 * The five languages as a radio group for a dropdown menu: the «Til» submenu of
 * the user menu and the sign-in page's language menu. Each name is written in
 * its own language, and `lang` makes a screen reader speak it with that voice
 * (WCAG 3.1.2).
 */
export function LanguageRadioGroup() {
  const { locale, setLocale } = useLocale();
  return (
    <DropdownMenuRadioGroup
      value={locale}
      onValueChange={(value) => {
        if (value !== locale) void setLocale(value as UiLocale);
      }}
    >
      {LOCALES.map(({ id, label }) => (
        <DropdownMenuRadioItem key={id} value={id} lang={id}>
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}
```

Create `client/src/components/auth/language-menu.tsx`:

```tsx
"use client";

import { ChevronDown, Languages } from "lucide-react";
import { LanguageRadioGroup } from "@/components/language-radio-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLocale, useT } from "@/i18n/context";
import { LOCALES } from "@/i18n/locales";

/**
 * The sign-in page's language picker (ADR-0106): the current language's own
 * name on the button, the five languages in a radio list. Nobody is signed in,
 * so a pick only changes the page and the device cookie.
 */
export function LanguageMenu() {
  const t = useT();
  const { locale } = useLocale();
  const current = LOCALES.find((l) => l.id === locale);
  const name = current?.label ?? locale;
  const til = t("Til");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* The accessible name contains the visible text (WCAG 2.5.3). */}
        <button
          type="button"
          aria-label={`${til}: ${name}`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Languages className="size-4" aria-hidden />
          <span lang={locale}>{name}</span>
          <ChevronDown className="size-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <LanguageRadioGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

In `client/src/components/header-user-menu.tsx`: replace the whole `<DropdownMenuRadioGroup value={locale} …> … </DropdownMenuRadioGroup>` of the «Til» submenu (it holds `LOCALES.map` with the `lang={id}` comment) by `<LanguageRadioGroup />`; add `import { LanguageRadioGroup } from "@/components/language-radio-group";`; remove the now unused `import { LOCALES, type UiLocale } from "@/i18n/locales";`, the `useLocale` import and the `const { locale, setLocale } = useLocale();` line (keep `useT`). `DropdownMenuRadioGroup`/`DropdownMenuRadioItem` stay imported (the colour mode and skin lists still use them).

- [ ] **Step 5: `useGreeting` adopts the account's language**

In `client/src/components/auth/staff-greeting.tsx` (texts are translated in Task 2; touch only the hook and its imports now):

```tsx
import { useEffect, useRef, useState } from "react";
// …existing imports…
import { useLocale } from "@/i18n/context";
import { adoptAccountLocale } from "@/i18n/sign-in-locale";

type Greeted = Pick<AuthUser, "firstName" | "photo" | "uiLocale">;
```

and the hook becomes:

```tsx
export function useGreeting(navigation: "push" | "replace") {
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  // The page's language when `greet` runs: the closure `greet` was made in can
  // be older, because a sign-in answers after a network round trip.
  const pageLocale = useRef(locale);
  useEffect(() => {
    pageLocale.current = locale;
  }, [locale]);
  const [greeting, setGreeting] = useState<{
    user: Greeted;
    destination: string;
  } | null>(null);

  useEffect(() => {
    /* unchanged */
  }, [greeting, navigation, router]);

  return {
    greeted: greeting?.user ?? null,
    // The account's language wins over the one picked on the sign-in page
    // (ADR-0106): switch first, so the greeting and the cabinet that follows
    // open in it. A failed switch never holds the greeting back.
    greet: async (user: Greeted, destination: string) => {
      await adoptAccountLocale(user.uiLocale, { current: pageLocale.current, setLocale });
      setGreeting({ user, destination });
    },
  };
}
```

The three callers (`login-form.tsx`, `telegram-callback.tsx`, `mini-app-entry.tsx`) keep calling `greet(user, destination)` without awaiting; if ESLint reports a floating promise, prefix the call with `void`. Update the doc comment of `greet` in the hook's header comment accordingly (one sentence).

- [ ] **Step 6: Provider, picker and heading in the shell**

Create `client/src/components/auth/sign-in-heading.tsx`:

```tsx
"use client";

import { useT } from "@/i18n/context";

/**
 * The sign-in page's heading. `title` is a `msg()` text of `lib/portal.ts`;
 * drawing it here keeps it in step with the language picker, which a string
 * translated on the server would not be.
 */
export function SignInHeading({ title }: { title: string }) {
  const t = useT();
  return <h1 className="mb-8 text-2xl font-semibold tracking-tight">{t(title)}</h1>;
}
```

Rewrite `client/src/app/(auth)/staff-sign-in-shell.tsx`:

```tsx
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageMenu } from "@/components/auth/language-menu";
import { SignInCover } from "@/components/auth/sign-in-cover";
import { SignInHeading } from "@/components/auth/sign-in-heading";
import { I18nProvider } from "@/i18n/context";
import { languageBootScript } from "@/i18n/document-language";
import { loadDictionary } from "@/i18n/load-dictionary";
import { currentLocale } from "@/i18n/server";
import { type PortalType, getPortalConfig } from "@/lib/portal";
import { LoginFooter } from "./login/login-footer";

interface StaffSignInShellProps {
  portal: PortalType;
  /** The language picker next to the theme button; only the sign-in form asks for it. */
  languageMenu?: boolean;
  children: React.ReactNode;
}

/**
 * Shell of the staff sign-in pages (`/login`, the Telegram callback and the
 * staff Mini App entry on `admin.` and `lehrer.`). It draws on the staff
 * portals' own theme — the same tokens, font and logo as the cabinet behind
 * it — so it has no theme of its own; only the cover is special. The two
 * portals differ by the heading alone, as the cabinets do. Like the dashboard
 * layout it reads the device's language cookie here, so the first paint is
 * already in the right language (ADR-0106).
 */
export async function StaffSignInShell({ portal, languageMenu = false, children }: StaffSignInShellProps) {
  const locale = await currentLocale();
  const dictionary = await loadDictionary(locale);
  return (
    <I18nProvider initialLocale={locale} initialDictionary={dictionary}>
      {/* Sets <html lang> while the page is parsed (the dashboard layout does
          the same); `locale` is whitelisted by `localeOrDefault`. */}
      <script dangerouslySetInnerHTML={{ __html: languageBootScript(locale) }} />
      <div className="flex min-h-svh flex-col bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <SignInCover />
        <div className="flex flex-1 flex-col">
          <div className="flex h-16 shrink-0 items-center justify-end gap-2 px-4">
            {languageMenu ? <LanguageMenu /> : null}
            <ThemeToggle />
          </div>
          <main className="flex flex-1 items-center justify-center px-5 pt-2 pb-10 sm:px-8">
            <div className="w-full max-w-sm">
              <SignInHeading title={getPortalConfig(portal).title} />
              {children}
            </div>
          </main>
          <LoginFooter />
        </div>
      </div>
    </I18nProvider>
  );
}
```

In `client/src/app/(auth)/login/page.tsx` the staff branch becomes `<StaffSignInShell portal={portal} languageMenu>`. The Telegram callback and `/tg` keep `<StaffSignInShell portal=…>` (no picker). In `client/src/lib/portal.ts` add `import { msg } from "@/i18n/msg";` and write the two staff titles as `title: msg("Boshqaruv")` and `title: msg("O'qituvchi")` (the other three titles stay plain strings).

- [ ] **Step 7: Coverage gate and dictionaries**

Append to `STRICT_FILES` in `client/src/i18n/i18n-coverage.test.ts`:

```ts
  "lib/portal.ts",
  "components/auth/language-menu.tsx",
  "components/auth/sign-in-heading.tsx",
  "components/language-radio-group.tsx",
```

Run `npx vitest --config vitest.config.mts run src/i18n/i18n-coverage.test.ts` — expected FAIL: «Boshqaruv», «O'qituvchi» missing in ru/de/en («Til» already exists). Then append before the closing `};` of each dictionary:

```ts
  // Sign-in page
  "Boshqaruv": "Управление",        // ru
  "O'qituvchi": "Преподаватель",    // ru
```
```ts
  "Boshqaruv": "Verwaltung",        // de
  "O'qituvchi": "Lehrkraft",        // de
```
```ts
  "Boshqaruv": "Management",        // en
  "O'qituvchi": "Teacher",          // en
```
(Write them without the trailing `// ru|de|en` comments; they only say which file.)

- [ ] **Step 8: Verify and commit**

Run: `npx vitest --config vitest.config.mts run src/i18n src/components src/lib` — Expected: PASS (the user menu test included). Run `npx tsc --noEmit`; `npx eslint src/i18n src/components/auth src/components/language-radio-group.tsx src/components/header-user-menu.tsx "src/app/(auth)" src/lib/portal.ts` — 0 errors.

```bash
git add client/src
git commit -m "feat(client): language menu on the staff sign-in page; the account's language wins at sign-in

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Translate the sign-in form, footer, greeting, Telegram button and theme tooltips

**Files (under `client/src/`):**
- Modify: `app/(auth)/login/login-form.tsx`, `app/(auth)/login/login-footer.tsx`, `components/auth/staff-greeting.tsx` (the `Greeting` texts), `components/auth/telegram-login-button.tsx`, `components/theme-toggle.tsx`, `lib/company.ts`
- Create: `lib/company.test.ts`
- Modify: `i18n/dictionaries/{ru,de,en}.ts`, `i18n/i18n-coverage.test.ts`

**Interfaces:** consumes `useT`, `msg`. Produces `copyrightLine(year: number, rights?: string): string` (default `"Barcha huquqlar himoyalangan."`).

- [ ] **Step 1: Test for `copyrightLine`, and the files join `STRICT_FILES`**

Create `client/src/lib/company.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { COMPANY, copyrightLine } from "./company";

describe("copyrightLine", () => {
  it("names the legal entity and the year, then the Uzbek rights sentence by default", () => {
    expect(copyrightLine(2026)).toBe(`© 2026 ${COMPANY.legalName}. Barcha huquqlar himoyalangan.`);
  });

  it("takes the rights sentence from the caller, so the entity name stays exactly as registered", () => {
    expect(copyrightLine(2026, "All rights reserved.")).toBe(`© 2026 ${COMPANY.legalName}. All rights reserved.`);
  });
});
```

Append to `STRICT_FILES`: `"app/(auth)/login/login-form.tsx"`, `"app/(auth)/login/login-footer.tsx"`, `"components/auth/staff-greeting.tsx"`, `"components/auth/telegram-login-button.tsx"`, `"components/theme-toggle.tsx"`.

Run `npx vitest --config vitest.config.mts run src/lib/company.test.ts` — the second case FAILS (no second parameter yet).

- [ ] **Step 2: `copyrightLine`**

In `client/src/lib/company.ts`:

```ts
/**
 * The copyright line shown in every login footer. The rights sentence is a
 * parameter so the footer can translate it; the legal entity's name is never
 * translated.
 */
export function copyrightLine(year: number, rights = "Barcha huquqlar himoyalangan."): string {
  return `© ${year} ${COMPANY.legalName}. ${rights}`;
}
```

- [ ] **Step 3: Wrap every visible text** (each file: `import { useT } from "@/i18n/context";`, `const t = useT();` before any early return)

`login-form.tsx` (`const t = useT();` right after `const { setAuth } = useAuth();`):
- 403 branch: `getErrorMessage(err, t("Sizning rolingiz bu portalga kirish huquqiga ega emas"))`; other errors: `setError(t("Login yoki parol noto'g'ri"))`.
- After `if (greeted) return <Greeting user={greeted} />;` add `const passwordToggleLabel = showPassword ? t("Parolni yashirish") : t("Parolni ko'rsatish");` and use `{passwordToggleLabel}` for the toggle's `aria-label` and for the `TooltipContent`.
- `<Label htmlFor="login">{t("Telefon raqam")}</Label>`, `<Label htmlFor="password">{t("Parol")}</Label>`, `placeholder={t("Parolingizni kiriting")}`, the submit button text `{t("Kirish")}`, the forgot button text `{t("Parolni unutdingizmi?")}`. The phone `placeholder="998 90 123 45 67"` stays raw.

`login-footer.tsx`: `const t = useT();` in `LoginFooter`; `copyrightLine(currentYear, t("Barcha huquqlar himoyalangan."))`; link text `{t("Maxfiylik siyosati")}`; `{t("Yordam")}`; `<TooltipContent>{t("Telegram orqali yordam olish")}</TooltipContent>`.

`staff-greeting.tsx` (`Greeting`): `const t = useT();` — extend the existing `import { useLocale } from "@/i18n/context"` to `import { useLocale, useT } from "@/i18n/context"`; `{t("Xush kelibsiz,")}` and `{t("Kabinet ochilmoqda…")}`.

`telegram-login-button.tsx`: `const t = useT();` before `if (!enabled) return null;` (hooks first); `getErrorMessage(err, t("Telegram orqali kirishni boshlab bo'lmadi"))`; `yoki` → `{t("yoki")}`; the button: `{loading ? t("Telegram ochilmoqda...") : t("Telegram orqali kirish")}`.

`theme-toggle.tsx`: import `msg` from `@/i18n/msg`; the three `themeLabel` values become `msg("Yorug' rejim — qorong'iga o'tish")`, `msg("Qorong'i rejim — tizim rejimiga o'tish")`, `msg("Tizim rejimi — yorug'iga o'tish")`; `const t = useT();` as the first line of `ThemeToggle` (before the `mounted` early return); `const label = t(themeLabel[current]);` after `current` is computed, used for `aria-label` and `TooltipContent`.

- [ ] **Step 4: Run the coverage test and see it fail**

`npx vitest --config vitest.config.mts run src/i18n/i18n-coverage.test.ts` — Expected: FAIL for ru, de, en listing the new texts per file.

- [ ] **Step 5: Write the translations**

Before adding, grep the three dictionaries for each key (none of these exist yet). Append, in each file, under `// Sign-in page` (after Task 1's entries):

ru.ts:
```ts
  "Sizning rolingiz bu portalga kirish huquqiga ega emas": "У вашей роли нет доступа к этому порталу",
  "Login yoki parol noto'g'ri": "Неверный логин или пароль",
  "Telefon raqam": "Номер телефона",
  "Parol": "Пароль",
  "Parolingizni kiriting": "Введите пароль",
  "Parolni yashirish": "Скрыть пароль",
  "Parolni ko'rsatish": "Показать пароль",
  "Kirish": "Войти",
  "Parolni unutdingizmi?": "Забыли пароль?",
  "Barcha huquqlar himoyalangan.": "Все права защищены.",
  "Maxfiylik siyosati": "Политика конфиденциальности",
  "Yordam": "Помощь",
  "Telegram orqali yordam olish": "Получить помощь в Telegram",
  "Xush kelibsiz,": "Добро пожаловать,",
  "Kabinet ochilmoqda…": "Открываем кабинет…",
  "Telegram orqali kirishni boshlab bo'lmadi": "Не удалось начать вход через Telegram",
  "yoki": "или",
  "Telegram ochilmoqda...": "Открываем Telegram...",
  "Telegram orqali kirish": "Войти через Telegram",
  "Yorug' rejim — qorong'iga o'tish": "Светлая тема — переключить на тёмную",
  "Qorong'i rejim — tizim rejimiga o'tish": "Тёмная тема — переключить на системную",
  "Tizim rejimi — yorug'iga o'tish": "Системная тема — переключить на светлую",
```
de.ts:
```ts
  "Sizning rolingiz bu portalga kirish huquqiga ega emas": "Ihre Rolle hat keinen Zugang zu diesem Portal",
  "Login yoki parol noto'g'ri": "Login oder Passwort ist falsch",
  "Telefon raqam": "Telefonnummer",
  "Parol": "Passwort",
  "Parolingizni kiriting": "Passwort eingeben",
  "Parolni yashirish": "Passwort verbergen",
  "Parolni ko'rsatish": "Passwort anzeigen",
  "Kirish": "Anmelden",
  "Parolni unutdingizmi?": "Passwort vergessen?",
  "Barcha huquqlar himoyalangan.": "Alle Rechte vorbehalten.",
  "Maxfiylik siyosati": "Datenschutzerklärung",
  "Yordam": "Hilfe",
  "Telegram orqali yordam olish": "Hilfe über Telegram erhalten",
  "Xush kelibsiz,": "Willkommen,",
  "Kabinet ochilmoqda…": "Ihr Bereich wird geöffnet…",
  "Telegram orqali kirishni boshlab bo'lmadi": "Die Anmeldung über Telegram konnte nicht gestartet werden",
  "yoki": "oder",
  "Telegram ochilmoqda...": "Telegram wird geöffnet...",
  "Telegram orqali kirish": "Mit Telegram anmelden",
  "Yorug' rejim — qorong'iga o'tish": "Heller Modus — zum dunklen wechseln",
  "Qorong'i rejim — tizim rejimiga o'tish": "Dunkler Modus — zum Systemmodus wechseln",
  "Tizim rejimi — yorug'iga o'tish": "Systemmodus — zum hellen wechseln",
```
en.ts:
```ts
  "Sizning rolingiz bu portalga kirish huquqiga ega emas": "Your role does not have access to this portal",
  "Login yoki parol noto'g'ri": "Incorrect login or password",
  "Telefon raqam": "Phone number",
  "Parol": "Password",
  "Parolingizni kiriting": "Enter your password",
  "Parolni yashirish": "Hide password",
  "Parolni ko'rsatish": "Show password",
  "Kirish": "Sign in",
  "Parolni unutdingizmi?": "Forgot your password?",
  "Barcha huquqlar himoyalangan.": "All rights reserved.",
  "Maxfiylik siyosati": "Privacy policy",
  "Yordam": "Help",
  "Telegram orqali yordam olish": "Get help on Telegram",
  "Xush kelibsiz,": "Welcome,",
  "Kabinet ochilmoqda…": "Opening your workspace…",
  "Telegram orqali kirishni boshlab bo'lmadi": "Could not start signing in with Telegram",
  "yoki": "or",
  "Telegram ochilmoqda...": "Opening Telegram...",
  "Telegram orqali kirish": "Sign in with Telegram",
  "Yorug' rejim — qorong'iga o'tish": "Light mode — switch to dark",
  "Qorong'i rejim — tizim rejimiga o'tish": "Dark mode — switch to system",
  "Tizim rejimi — yorug'iga o'tish": "System mode — switch to light",
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest --config vitest.config.mts run src/i18n src/lib src/components` — Expected: PASS. `npx tsc --noEmit`; `npx eslint` on the touched files — 0 errors.

```bash
git add client/src
git commit -m "feat(client): translate the staff sign-in form, footer and greeting into ru, de, en

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Translate the «Parolni tiklash» dialog

**Files (under `client/src/`):**
- Modify: `components/auth/forgot-password-dialog.tsx`, `components/auth/forgot-password-fields.tsx`
- Modify: `i18n/dictionaries/{ru,de,en}.ts`, `i18n/i18n-coverage.test.ts`

**Interfaces:** consumes `useT`. The dialog is shared with the student portal (`variant="lumio"`), which has no provider and keeps Uzbek.

- [ ] **Step 1: Add both files to `STRICT_FILES`**, then wrap.

`forgot-password-dialog.tsx` (`const t = useT();` as the first hook of `ForgotPasswordDialog`; note the file already names a local `t` for a timer inside the cooldown effect — rename that timer variable to `timer` so it does not shadow):
- `setError(t("Xatolik yuz berdi. Iltimos, qayta urinib ko'ring."))`, `setError(t("Telefon raqamni to'liq kiriting"))`, `setError(t("Kod 4 xonali bo'lishi kerak"))`, `getErrorMessage(err, t("Kod noto'g'ri yoki muddati tugagan"))`, `setError(t("Parol kamida 6 ta belgidan iborat bo'lishi kerak"))`, `setError(t("Parollar mos kelmadi"))`, `toast.success(t("Parol muvaffaqiyatli o'zgartirildi. Endi kirishingiz mumkin."))`, `getErrorMessage(err, t("Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring."))`.
- Title `{t("Parolni tiklash")}`; description: `{step === 1 && t("Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz.")}`, `{step === 2 && t("Tasdiqlash kodi telefon raqamingizga yuborildi.")}`, `{step === 3 && t("Yangi parolingizni o'rnating.")}`.
- Fields: `label={t("Telefon raqam")}`, `label={t("Tasdiqlash kodi")}`, `label={t("Yangi parol")}`, `label={t("Parolni takrorlang")}`; submit texts `{t("Kod yuborish")}`, `{t("Tasdiqlash")}`, `{t("Saqlash")}`; `placeholder={t("Kamida 6 ta belgi")}`, `placeholder={t("Yangi parolni qayta kiriting")}`; paragraph `{t("Ushbu raqamga yuborilgan 4 xonali kodni kiriting.")}`; the back button text: replace `Raqamni o&apos;zgartirish` by `{t("Raqamni o'zgartirish")}`; the resend button: `{cooldown > 0 ? t("Qayta yuborish ({n}s)", { n: cooldown }) : t("Qayta yuborish")}`. The raw `XX XXX XX XX` and `••••` placeholders stay.

`forgot-password-fields.tsx` (`FpPasswordInput`): `const t = useT();` first line; `const toggleLabel = show ? t("Parolni yashirish") : t("Parolni ko'rsatish");` and `aria-label={toggleLabel}` (both keys already exist from Task 2).

- [ ] **Step 2: Run the coverage test and see it fail**, then add the translations (new keys only; «Telefon raqam», «Parolni yashirish», «Parolni ko'rsatish» already exist — do not repeat them). Append under the same `// Sign-in page` block:

ru.ts:
```ts
  "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.": "Произошла ошибка. Попробуйте ещё раз.",
  "Telefon raqamni to'liq kiriting": "Введите номер телефона полностью",
  "Kod 4 xonali bo'lishi kerak": "Код должен состоять из 4 цифр",
  "Kod noto'g'ri yoki muddati tugagan": "Код неверный или срок его действия истёк",
  "Parol kamida 6 ta belgidan iborat bo'lishi kerak": "Пароль должен содержать не менее 6 символов",
  "Parollar mos kelmadi": "Пароли не совпадают",
  "Parol muvaffaqiyatli o'zgartirildi. Endi kirishingiz mumkin.": "Пароль изменён. Теперь вы можете войти.",
  "Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring.": "Сессия истекла. Попробуйте ещё раз.",
  "Parolni tiklash": "Восстановление пароля",
  "Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz.": "Введите номер телефона — мы отправим код подтверждения по SMS.",
  "Tasdiqlash kodi telefon raqamingizga yuborildi.": "Код подтверждения отправлен на ваш номер телефона.",
  "Yangi parolingizni o'rnating.": "Установите новый пароль.",
  "Kod yuborish": "Отправить код",
  "Ushbu raqamga yuborilgan 4 xonali kodni kiriting.": "Введите 4-значный код, отправленный на этот номер.",
  "Tasdiqlash kodi": "Код подтверждения",
  "Raqamni o'zgartirish": "Изменить номер",
  "Qayta yuborish ({n}s)": "Отправить снова ({n} с)",
  "Qayta yuborish": "Отправить снова",
  "Tasdiqlash": "Подтвердить",
  "Yangi parol": "Новый пароль",
  "Kamida 6 ta belgi": "Не менее 6 символов",
  "Parolni takrorlang": "Повторите пароль",
  "Yangi parolni qayta kiriting": "Введите новый пароль ещё раз",
  "Saqlash": "Сохранить",
```
de.ts:
```ts
  "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.": "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
  "Telefon raqamni to'liq kiriting": "Geben Sie die vollständige Telefonnummer ein",
  "Kod 4 xonali bo'lishi kerak": "Der Code muss 4 Ziffern haben",
  "Kod noto'g'ri yoki muddati tugagan": "Der Code ist falsch oder abgelaufen",
  "Parol kamida 6 ta belgidan iborat bo'lishi kerak": "Das Passwort muss mindestens 6 Zeichen lang sein",
  "Parollar mos kelmadi": "Die Passwörter stimmen nicht überein",
  "Parol muvaffaqiyatli o'zgartirildi. Endi kirishingiz mumkin.": "Das Passwort wurde geändert. Sie können sich jetzt anmelden.",
  "Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring.": "Die Sitzung ist abgelaufen. Bitte versuchen Sie es erneut.",
  "Parolni tiklash": "Passwort zurücksetzen",
  "Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz.": "Geben Sie Ihre Telefonnummer ein — wir senden Ihnen einen Bestätigungscode per SMS.",
  "Tasdiqlash kodi telefon raqamingizga yuborildi.": "Der Bestätigungscode wurde an Ihre Telefonnummer gesendet.",
  "Yangi parolingizni o'rnating.": "Legen Sie Ihr neues Passwort fest.",
  "Kod yuborish": "Code senden",
  "Ushbu raqamga yuborilgan 4 xonali kodni kiriting.": "Geben Sie den 4-stelligen Code ein, der an diese Nummer gesendet wurde.",
  "Tasdiqlash kodi": "Bestätigungscode",
  "Raqamni o'zgartirish": "Nummer ändern",
  "Qayta yuborish ({n}s)": "Erneut senden ({n} s)",
  "Qayta yuborish": "Erneut senden",
  "Tasdiqlash": "Bestätigen",
  "Yangi parol": "Neues Passwort",
  "Kamida 6 ta belgi": "Mindestens 6 Zeichen",
  "Parolni takrorlang": "Passwort wiederholen",
  "Yangi parolni qayta kiriting": "Neues Passwort erneut eingeben",
  "Saqlash": "Speichern",
```
en.ts:
```ts
  "Xatolik yuz berdi. Iltimos, qayta urinib ko'ring.": "Something went wrong. Please try again.",
  "Telefon raqamni to'liq kiriting": "Enter the full phone number",
  "Kod 4 xonali bo'lishi kerak": "The code must be 4 digits",
  "Kod noto'g'ri yoki muddati tugagan": "The code is incorrect or has expired",
  "Parol kamida 6 ta belgidan iborat bo'lishi kerak": "The password must be at least 6 characters",
  "Parollar mos kelmadi": "The passwords do not match",
  "Parol muvaffaqiyatli o'zgartirildi. Endi kirishingiz mumkin.": "Password changed. You can now sign in.",
  "Sessiya muddati tugadi. Iltimos, qaytadan urinib ko'ring.": "Your session has expired. Please try again.",
  "Parolni tiklash": "Reset password",
  "Telefon raqamingizni kiriting — SMS orqali tasdiqlash kodi yuboramiz.": "Enter your phone number — we'll send a verification code by SMS.",
  "Tasdiqlash kodi telefon raqamingizga yuborildi.": "A verification code was sent to your phone number.",
  "Yangi parolingizni o'rnating.": "Set your new password.",
  "Kod yuborish": "Send code",
  "Ushbu raqamga yuborilgan 4 xonali kodni kiriting.": "Enter the 4-digit code sent to this number.",
  "Tasdiqlash kodi": "Verification code",
  "Raqamni o'zgartirish": "Change number",
  "Qayta yuborish ({n}s)": "Resend ({n}s)",
  "Qayta yuborish": "Resend",
  "Tasdiqlash": "Confirm",
  "Yangi parol": "New password",
  "Kamida 6 ta belgi": "At least 6 characters",
  "Parolni takrorlang": "Repeat the password",
  "Yangi parolni qayta kiriting": "Enter the new password again",
  "Saqlash": "Save",
```

- [ ] **Step 3: Verify and commit**

Run: `npx vitest --config vitest.config.mts run src/i18n src/components src/lib` — Expected: PASS (the `{n}` placeholder test passes: `{n}` is in every translation). `npx tsc --noEmit`; `npx eslint` on the two files — 0 errors.

```bash
git add client/src
git commit -m "feat(client): translate the password reset dialog into ru, de, en

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Docs, ADR and full checks

**Files:**
- Create: `docs/adr/0106-kirish-sahifasida-til-tanlash.md`
- Modify: `docs/adr/README.md` (index row), `client/CLAUDE.md` («Languages» section), `client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`

- [ ] **Step 1: ADR** — verify 0106 is free (`ls docs/adr | tail -3`; `git fetch origin main`; `git ls-tree --name-only origin/main docs/adr/ | tail -3`, separate commands; if taken use the next free number everywhere below; other unmerged branches may hold numbers — the controller re-checks before the PR). Create `docs/adr/0106-kirish-sahifasida-til-tanlash.md` in Uzbek Latin, shaped like ADR-0102 (title, **Holati** Qabul qilindi, **Sana** 2026-10-17, **Bog'liq**: ADR-0102, `client/src/app/(auth)/staff-sign-in-shell.tsx`, `client/src/i18n/sign-in-locale.ts`, `client/src/components/auth/staff-greeting.tsx`, the spec; Kontekst; Qaror; Taqiqlanadi; Muqobillar; Oqibatlar) with these decisions: (1) xodimlar kirish sahifasida (`/login`, `admin.`/`lehrer.`) til tugmasi bor, o'quvchi kirish sahifasi, Telegram callback va Mini App'da yo'q; (2) `StaffSignInShell` ADR-0102 dagi usulni takrorlaydi: serverda `daf-locale` cookie o'qiladi, lug'at `I18nProvider` ga beriladi, `<html lang>` skript bilan qo'yiladi — shuning uchun qobiq ishlatadigan uchala sahifa ham tilni oladi; (3) kirishda profil tili yutadi: `useGreeting().greet` salomdan oldin `adoptAccountLocale` (`save: false`) ni chaqiradi, shunda salom va kabinet profil tilida ochiladi, kabinet birinchi chizishdayoq to'g'ri tilda; (4) profil til tanlamagan bo'lsa sahifa tili qoladi va kabinetdagi `LocaleSync` uni profilga bir marta saqlaydi (ADR-0102); (5) matnlar `t()`/`msg()` da, fayllar `STRICT_FILES` da; umumiy komponentlar (`forgot-password-*`, `login-footer`, `theme-toggle`, `telegram-login-button`) o'quvchi portalida o'zbekcha qoladi, chunki u `I18nProvider` dan tashqarida. Taqiqlanadi: kirish sahifasida tilni serverga (akkauntga) saqlash — u yerda hech kim kirmagan, shuning uchun faqat cookie; serverdan kelgan xato matnini mijozda tarjima qilish. Muqobillar: har til uchun alohida manzil (`/ru/login`) — tanlanmadi (ADR-0102 dagi sabab); til tugmasini hamma sahifaga qo'yish — tanlanmadi (foydalanuvchi menyusida allaqachon bor). Oqibatlar: faqat klient chiqariladi (migratsiya, server o'zgarishi yo'q); umumiy kompyuterda oldingi odam tanlagan til keyingi odamning kirish sahifasida turadi (profil tili yutadi); Telegram callback va Mini App ichki matnlari hali o'zbekcha. Add a row to `docs/adr/README.md` after the 0102 row: `| [0106](0106-kirish-sahifasida-til-tanlash.md) | Kirish sahifasida til tanlash: qobiq tilni cookie'dan o'qiydi, kirishda profil tili yutadi | Qabul qilindi | 2026-10-17 |`.

- [ ] **Step 2: `client/CLAUDE.md`** — in the «Languages» section: replace the sentence «The student portal, the public form and the sign-in page are not translated yet (login follows once `feat/kirish-logotip-varaqlari` is on `main`).» by «The student portal, the public form, the student sign-in page, the Telegram callback's own texts and the Mini App notices are not translated yet.»; replace the last bullet «The picker is the «Til» submenu of `HeaderUserMenu`.» by:

```markdown
- **Two pickers, one list:** the «Til» submenu of `HeaderUserMenu` and `LanguageMenu` on `/login`; both draw `LanguageRadioGroup` (`components/language-radio-group.tsx`).
- **Staff sign-in pages (ADR-0106):** `StaffSignInShell` is `async` and wraps its children in `I18nProvider` from the `daf-locale` cookie (the same way the dashboard layout does), so `/login`, the Telegram callback and the staff Mini App entry all get a language; only `/login` passes `languageMenu`. The heading is `SignInHeading` (client, `t(title)` of a `msg()` text in `lib/portal.ts`). **Sign-in ends in `useGreeting().greet`**, which first calls `adoptAccountLocale(user.uiLocale, …)` (`i18n/sign-in-locale.ts`): the account's language wins over the one picked on the page and the cabinet opens in it; an account that never chose keeps the page's language and `LocaleSync` saves it (ADR-0102). Files shared with the student portal (`forgot-password-*`, `login-footer`, `theme-toggle`, `telegram-login-button`) use `useT()` too and stay Uzbek there, because the student portal has no provider.
```

and in the «Pages translated so far» bullet add «the staff sign-in page (form, password reset dialog, footer, greeting)».

- [ ] **Step 3: Guide** — in `client/src/qollanma/kontent/boshlash/tizimga-kirish.mdx` add, after the «## Kirish» numbered steps' closing paragraph about the red error line and before «Chet el raqami…», one short section in the page's own style (Uzbek Latin; no `{`, `}`, `<` in prose):

```
### Til

Sahifaning yuqori o'ng burchagida til tugmasi turadi, mavzu tugmasining yonida. Besh tildan birini tanlang: O'zbekcha, Ўзбекча, Русский, Deutsch yoki English. Sahifa qayta yuklanmaydi. Kirgandan keyin profilingizda saqlangan til ochiladi: masalan, rus tilini tanlab kirsangiz-u, profilingizda o'zbekcha turgan bo'lsa, panel o'zbekcha ochiladi. Profilingizda til hali tanlanmagan bo'lsa, shu yerda tanlaganingiz profilga saqlanadi.
```

In `sahifalar/boshlash.ts`, the `tizimga-kirish` entry: add `"0106"` to `adr` and `"til"`, `"tilni tanlash"`, `"русский"` to `kalitSozlar` (match the format). Add one entry at the top of `yangiliklar.ts` in the existing shape: `sana: "2026-10-17"`, `sarlavha: "Kirish sahifasida til tanlash"`, `matn: "Admin panel va o'qituvchi portalining kirish sahifasida yuqori o'ng burchakda til tugmasi paydo bo'ldi. Besh tildan birini tanlang: O'zbekcha, Ўзбекча, Русский, Deutsch yoki English; sahifaning o'zi, parolni tiklash oynasi va salom ham tarjima qilingan. Kirgach profilingizdagi til ochiladi; profilingizda til tanlanmagan bo'lsa, tanlaganingiz profilga saqlanadi. O'quvchi portalining kirish sahifasi hali o'zbekcha."`, `rollar: [1, 2, 3, 4, 5]`, `sahifa: { bolim: "boshlash", sahifa: "tizimga-kirish" }`. Run `npx vitest --config vitest.config.mts run src/qollanma`.

- [ ] **Step 4: Full automated checks, one after another** (client only — no server file changed)

`cd client; npx tsc --noEmit`, `npx eslint src --quiet` (no errors), `npm run i18n:check`, `npm test`, `npm run build` (a transient `next/font/google` error: rerun once). Run the long ones with `run_in_background: true`, a log under `/private/tmp/claude-501/-Users-a1111-Desktop-daf-erp-system/25e12e41-5ba3-4971-a8dc-465d48ca4429/scratchpad/` ending with `EXIT: $?`, and ONE until-loop to wait. A failure caused by this branch: fix its cause and rerun that check and the ones after it.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/adr/0106-kirish-sahifasida-til-tanlash.md docs/adr/README.md client/CLAUDE.md client/src/qollanma
git commit -m "docs: sign-in language picker — ADR-0106, CLAUDE.md, user guide

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand off to the controller** — report the commits and check results. The controller then checks in the built-in browser (mock API): the sign-in page in each of the five languages, switching without a reload, reload without a flash, `<html lang>`, the password reset dialog in Russian, the greeting after a sign-in whose account language differs from the page's (account wins; the cabinet opens in it without a flash), an account with no language (page language kept), the student sign-in page unchanged.
