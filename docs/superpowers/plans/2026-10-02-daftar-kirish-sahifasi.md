# Daftar Staff Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin and teacher sign-in pages as one "notebook sheet" family (squared paper + navy ink for admin, ruled paper + green ink for the teacher portal), per `docs/superpowers/specs/2026-10-02-daftar-kirish-sahifasi-design.md`.

**Architecture:** A scoped theme class (`.daftar`, plus `.daftar-lines`) re-points the shadcn semantic variables, exactly like `.lumio` and `.form-theme`, so `ThemeToggle`, `LoginFooter`, `TelegramLoginButton` and the password-reset dialog re-theme with no changes of their own. One server component, `DaftarSheet`, is the page shell for `/login` and `/auth/telegram/callback` on staff hosts. Sign-in logic is not touched.

**Tech Stack:** Next.js 16.3 (App Router, server components), Tailwind CSS v4, shadcn/ui tokens, `next/font/google`, Vitest (node environment, no DOM).

## Global Constraints

- The student login (`student.` host: Lumio, photo, `.liquid-glass`) and the Telegram Mini App (`/tg`) must not change.
- Sign-in logic must not change: API calls, redirects, the bare `+` prefix with no length cap on the identifier field, the `+998` nine-digit rule in the reset dialog.
- All user-visible text is Uzbek (Latin). No English words on screen.
- Nothing is added to the global `@theme` block of `globals.css` (`src/app/globals-css.test.ts`).
- Never put a CSS comment inside a declaration value in `globals.css` — Lightning CSS drops the whole enclosing `@layer`.
- Do not run prettier on `client/` files.
- Contrast against the paper: text >= 4.5:1, field underline >= 3:1, in all four states.
- Commands run from `client/`. Do not run `npm run build` and `npm test` in parallel.

## File Structure

| File | Responsibility |
|---|---|
| `client/src/app/globals.css` | `.daftar` token blocks (4 states), `.daftar-sheet`, `.daftar-column::before`, `.daftar-hand`, autofill repaint |
| `client/src/app/daftar-theme.test.ts` (new) | Contrast of the four token states; source order of the two equally specific blocks |
| `client/src/lib/portal.ts` | `daftarScope(portal)`; `PortalConfig` loses `subtitle`/`icon`; staff titles |
| `client/src/components/auth/daftar-field.ts` (new) | `DAFTAR_ROW`, `DAFTAR_INPUT` — the underline field, shared by the login form and the reset dialog |
| `client/src/app/(auth)/daftar-sheet.tsx` (new) | Page shell: theme toggle, column (brand, heading, children), footer; loads the italic Fraunces |
| `client/src/app/(auth)/login/page.tsx` | Staff branch renders `DaftarSheet`; student branch untouched |
| `client/src/app/(auth)/login/login-form.tsx` | Heading/icons removed, underline fields, red-pen error |
| `client/src/components/auth/forgot-password-fields.tsx` | Default skin uses the underline field |
| `client/src/components/auth/forgot-password-dialog.tsx` | `contentClassName` prop |
| `client/src/app/(auth)/auth/telegram/callback/page.tsx` + `telegram-callback.tsx` (new) | Server page picks the shell by host; client logic moves next to it unchanged |
| `client/src/app/layout.tsx` | Drop the unused roman Fraunces preload |
| `client/public/login-*.jpg` | Three unused photos deleted |
| `client/CLAUDE.md` | Login section rewritten for Daftar |

---

### Task 1: Theme tokens, field classes, scope helper

**Files:**
- Create: `client/src/app/daftar-theme.test.ts`, `client/src/components/auth/daftar-field.ts`
- Modify: `client/src/app/globals.css` (new section between the `.form-theme` and `.lumio` sections; autofill rules after the Lumio autofill rules), `client/src/lib/portal.ts`

**Interfaces:**
- Produces: CSS classes `daftar`, `daftar-lines`, `daftar-sheet`, `daftar-column`, `daftar-hand` (the last reads `--font-daftar-hand`); `daftarScope(portal: PortalType): string`; `DAFTAR_ROW`, `DAFTAR_INPUT` string constants; `getPortalConfig(portal).title` is `"Boshqaruv"` / `"O'qituvchi"` for staff portals.

- [ ] **Step 1: Write the failing test** — `client/src/app/daftar-theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");

/** Custom properties declared by the rule whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`globals.css has no "${selector}" rule`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("Daftar sign-in theme", () => {
  // `.daftar.daftar-lines` and `.dark .daftar` are equally specific, so source
  // order decides between them; the sheets below assume the dark block wins.
  it("keeps the ruled variant ahead of the dark block", () => {
    const lines = css.indexOf("\n.daftar.daftar-lines {");
    expect(lines).toBeGreaterThan(-1);
    expect(lines).toBeLessThan(css.indexOf("\n.dark .daftar {"));
  });

  // WCAG AA: 4.5:1 for text, 3:1 for the boundary of a control.
  it("is readable on all four sheets", () => {
    const light = tokens(".daftar");
    const lines = tokens(".daftar.daftar-lines");
    const dark = tokens(".dark .daftar");
    const darkLines = tokens(".dark .daftar.daftar-lines");
    const sheets = {
      "admin, light": { ...light },
      "teacher, light": { ...light, ...lines },
      "admin, dark": { ...light, ...dark },
      "teacher, dark": { ...light, ...lines, ...dark, ...darkLines },
    };

    for (const [name, t] of Object.entries(sheets)) {
      const paper = t["--background"];
      for (const text of ["--foreground", "--muted-foreground", "--primary", "--destructive"]) {
        expect(contrast(t[text], paper), `${name}: ${text}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(t["--primary-foreground"], t["--primary"]),
        `${name}: button label`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t["--input"], paper), `${name}: field underline`).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run it, expect failure** — `npx vitest run src/app/daftar-theme.test.ts` → FAIL (`globals.css has no ".daftar" rule`, and the order test fails on `-1`).

- [ ] **Step 3: Add the theme to `globals.css`** — insert before the `Student Portal — Lumio` banner comment:

```css
/* ============================================================
   Staff sign-in — Daftar (scoped override)
   The admin and teacher logins are one notebook sheet: squared paper and
   navy ink on the admin portal (bookkeeping), ruled paper and green ink on
   the teacher portal (writing), the same red margin line on both. Applied
   via `.daftar` (+ `.daftar-lines` for the ruled variant); the class pair
   comes from `daftarScope()` in lib/portal.ts, so content Radix portals to
   <body> (the password-reset dialog) can carry it too.
   Like `.form-theme` and `.lumio`, the scope re-points the shadcn semantic
   vars, so every primitive inside it re-themes with no changes of its own.
   Text is >= 4.5:1 and the field underline (--input) >= 3:1 against the
   paper in all four states — src/app/daftar-theme.test.ts measures it.
   ============================================================ */
.daftar {
  --daftar-margin: #f0a3a3;

  --background: #fdfdfb;
  --foreground: #1e293b;
  --card: #fdfdfb;
  --card-foreground: #1e293b;
  --popover: #fdfdfb;
  --popover-foreground: #1e293b;
  --primary: #1e3a8a;
  --primary-foreground: #ffffff;
  --secondary: #eef2f9;
  --secondary-foreground: #1e293b;
  --muted: #eef2f9;
  --muted-foreground: #56657a;
  --accent: #eef2f9;
  --accent-foreground: #1e293b;
  --destructive: #b42318;
  --border: #d9e3f2;
  --input: #6f88b3;
  --ring: #1e3a8a;
}

/* Teacher portal: ruled paper, green ink. */
.daftar.daftar-lines {
  --primary: #14532d;
  --secondary: #eef5f0;
  --muted: #eef5f0;
  --accent: #eef5f0;
  --input: #5f9072;
  --ring: #14532d;
}

/* Night paper. This selector and `.daftar.daftar-lines` are equally specific,
   so on a dark ruled sheet these values win over the teacher's light ones by
   source order — keep this block after it, and have the next rule re-state
   every token the ruled variant sets. */
.dark .daftar {
  --daftar-margin: #7a3440;

  --background: #0f1626;
  --foreground: #e6ecf8;
  --card: #0f1626;
  --card-foreground: #e6ecf8;
  --popover: #0f1626;
  --popover-foreground: #e6ecf8;
  --primary: #c9d7f7;
  --primary-foreground: #0f1626;
  --secondary: #172238;
  --secondary-foreground: #e6ecf8;
  --muted: #172238;
  --muted-foreground: #9aa7bd;
  --accent: #172238;
  --accent-foreground: #e6ecf8;
  --destructive: #ff8a80;
  --border: #1c2740;
  --input: #5a6f9a;
  --ring: #c9d7f7;
}

.dark .daftar.daftar-lines {
  --background: #0e1a14;
  --foreground: #e8f1eb;
  --card: #0e1a14;
  --card-foreground: #e8f1eb;
  --popover: #0e1a14;
  --popover-foreground: #e8f1eb;
  --primary: #bfe3cc;
  --primary-foreground: #0e1a14;
  --secondary: #15271d;
  --secondary-foreground: #e8f1eb;
  --muted: #15271d;
  --muted-foreground: #9db3a5;
  --accent: #15271d;
  --accent-foreground: #e8f1eb;
  --border: #1a2c22;
  --input: #4f7a60;
  --ring: #bfe3cc;
}

@layer components {
  /* The sheet: paper plus its ruling — squared by default, ruled on the
     teacher portal. The lines are gradients, so there is no image to load. */
  .daftar-sheet {
    background-color: var(--background);
    background-image:
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .daftar-lines.daftar-sheet {
    background-image: linear-gradient(transparent 31px, var(--border) 31px);
    background-size: 100% 32px;
  }

  /* The red margin line. It hangs off the content column, not the viewport,
     so the writing starts at the margin at every width. It runs far past the
     column both ways; the sheet (`overflow-hidden`) clips it to the page. */
  .daftar-column::before {
    content: "";
    position: absolute;
    top: -100vh;
    bottom: -100vh;
    left: -1rem;
    width: 1.5px;
    background-color: var(--daftar-margin);
    pointer-events: none;
  }
  @media (min-width: 40rem) {
    .daftar-column::before {
      left: -1.25rem;
    }
  }

  /* Handwriting: the italic Fraunces that DaftarSheet loads. */
  .daftar-hand {
    font-family: var(--font-daftar-hand), Georgia, serif;
    font-style: italic;
  }
}
```

and append at the end of the file (after the Lumio autofill rules):

```css
/* A Daftar field is transparent — the sheet shows through it — so the tint
   autofill paints on the <input> would sit on the paper as a coloured box.
   Repaint it in the paper's colour; as with Lumio above, the fill has to be a
   box-shadow, and Firefox needs its own rule. */
.daftar input:-webkit-autofill,
.daftar input:-webkit-autofill:hover,
.daftar input:-webkit-autofill:active {
  -webkit-box-shadow: inset 0 0 0 1000px var(--background);
  box-shadow: inset 0 0 0 1000px var(--background);
  -webkit-text-fill-color: var(--foreground);
  caret-color: var(--foreground);
}

.daftar input:autofill {
  box-shadow: inset 0 0 0 1000px var(--background);
  filter: none;
  caret-color: var(--foreground);
}
```

- [ ] **Step 4: Run the tests, expect pass** — `npx vitest run src/app/daftar-theme.test.ts src/app/globals-css.test.ts` → PASS.

- [ ] **Step 5: `portal.ts`** — remove `subtitle` and `icon` from `PortalConfig` and from all five entries; set `admin.title` to `"Boshqaruv"` and `lehrer.title` to `"O'qituvchi"`; add after `getPortalConfig`:

```ts
/**
 * Scope classes of the staff sign-in theme (`.daftar` in globals.css): squared
 * paper and navy ink by default, ruled paper and green ink on the teacher
 * portal. One source for the page shell and for content Radix portals to
 * <body>, which no class on the page reaches.
 */
export function daftarScope(portal: PortalType): string {
  return portal === "lehrer" ? "daftar daftar-lines" : "daftar";
}
```

- [ ] **Step 6: `client/src/components/auth/daftar-field.ts`**

```ts
// The underline-only field of the staff sign-in theme (Daftar): the value is
// written on a line of the sheet. The row carries the line, so a prefix or a
// reveal button sits on the same line as the input. 16px text keeps iOS from
// zooming the page when a field takes focus.
export const DAFTAR_ROW =
  "flex items-center gap-2 border-b-[1.5px] border-input transition-colors focus-within:border-primary focus-within:shadow-[0_1.5px_0_0_var(--primary)]";

export const DAFTAR_INPUT =
  "h-11 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground";
```

- [ ] **Step 7: Commit** — `git add client/src/app/globals.css client/src/app/daftar-theme.test.ts client/src/lib/portal.ts client/src/components/auth/daftar-field.ts` → `feat(login): Daftar theme tokens for the staff sign-in pages`. (`tsc` is red until Task 2 removes the `config.subtitle`/`config.icon` reads — Tasks 1 and 2 are verified together.)

---

### Task 2: Sheet shell, login page, login form

**Files:**
- Create: `client/src/app/(auth)/daftar-sheet.tsx`
- Modify: `client/src/app/(auth)/login/page.tsx`, `client/src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: Task 1's classes, `daftarScope`, `getPortalConfig(portal).title`, `DAFTAR_ROW`, `DAFTAR_INPUT`.
- Produces: `DaftarSheet({ portal, children })` — server component; Task 4 uses it.

- [ ] **Step 1: `daftar-sheet.tsx`**

```tsx
import { Fraunces } from "next/font/google";
import { ThemeToggle } from "@/components/theme-toggle";
import { COMPANY } from "@/lib/company";
import { type PortalType, daftarScope, getPortalConfig } from "@/lib/portal";
import { cn } from "@/lib/utils";
import { LoginFooter } from "./login/login-footer";

// The sheet's handwriting. Declared here rather than in the root layout so
// only the staff sign-in routes download it.
const hand = Fraunces({
  subsets: ["latin"],
  style: "italic",
  variable: "--font-daftar-hand",
});

interface DaftarSheetProps {
  portal: PortalType;
  children: React.ReactNode;
}

/**
 * Shell of the staff sign-in pages — a notebook sheet (`.daftar` in
 * globals.css): squared paper on the admin portal, ruled on the teacher
 * portal. The heading and the children are "written" from the red margin line.
 */
export function DaftarSheet({ portal, children }: DaftarSheetProps) {
  return (
    <div
      className={cn(
        daftarScope(portal),
        hand.variable,
        "daftar-sheet flex min-h-screen flex-col overflow-hidden text-foreground",
      )}
    >
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center py-8 pl-11 pr-5 sm:px-4">
        <div className="daftar-column relative w-full max-w-sm space-y-8">
          <header>
            <p className="text-sm text-muted-foreground">{COMPANY.tradingName}</p>
            <h1 className="daftar-hand text-[2.75rem] leading-tight font-medium text-primary">
              {getPortalConfig(portal).title}
            </h1>
          </header>
          {children}
        </div>
      </main>
      {/* Opaque, so the margin line ends at the footer instead of striking
          through its text. */}
      <div className="relative bg-background">
        <LoginFooter />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `login/page.tsx`** — keep the student branch as is (reword its comment: it no longer shares the photo treatment with admin); replace the `admin` branch and the fallback with:

```tsx
  // Staff portals (admin., lehrer.) — the Daftar sheet; the portal picks the
  // paper and the ink.
  return (
    <>
      <MiniAppLoginGuard />
      <DaftarSheet portal={portal}>
        <LoginForm portal={portal} />
      </DaftarSheet>
    </>
  );
```

- [ ] **Step 3: `login-form.tsx`** — logic unchanged. Remove the `portalIcons` map, `config`, `Icon` and the icon imports; import `DAFTAR_ROW`, `DAFTAR_INPUT` and `daftarScope`. The returned JSX becomes:

```tsx
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <p role="alert" className="daftar-hand text-lg text-destructive">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="login" className="text-sm text-muted-foreground">
            Telefon raqam
          </label>
          <div className={DAFTAR_ROW}>
            <span aria-hidden="true" className="text-base text-muted-foreground">
              +
            </span>
            <input
              id="login"
              type="text"
              autoComplete="username"
              required
              value={formatPhoneWithCodeInput(login)}
              onChange={(e) => setLogin(e.target.value.replace(/\D/g, ""))}
              placeholder="998 90 123 45 67"
              inputMode="tel"
              className={DAFTAR_INPUT}
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Parol
          </label>
          <div className={DAFTAR_ROW}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parolingizni kiriting"
              className={DAFTAR_INPUT}
            />
            {/* Tooltip + reveal button exactly as before, minus the absolute
                positioning classes: className="text-muted-foreground
                transition-colors hover:text-foreground" */}
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          Kirish
        </button>

        {/* "Parolni unutdingizmi?" button unchanged */}
      </form>

      <TelegramLoginButton />

      {/* ForgotPasswordDialog as before; Task 3 adds
          contentClassName={daftarScope(portal)} */}
    </div>
```

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; dev server: `/login` on `localhost` (admin) and `lehrer.localhost` (teacher), light and dark, 375px and 1440px; submit wrong credentials to see the error; margin line stops at the footer.

- [ ] **Step 5: Commit** — `feat(login): staff sign-in pages are a notebook sheet`.

---

### Task 3: Password-reset dialog skin

**Files:**
- Modify: `client/src/components/auth/forgot-password-fields.tsx`, `client/src/components/auth/forgot-password-dialog.tsx`, `client/src/app/(auth)/login/login-form.tsx`

**Interfaces:**
- Consumes: `DAFTAR_ROW`, `DAFTAR_INPUT`, `daftarScope`.
- Produces: `ForgotPasswordDialog` prop `contentClassName?: string`.

- [ ] **Step 1: `forgot-password-fields.tsx`** — delete `SHADCN_INPUT`; the non-Lumio branches become: `FpField` → `space-y-1` + label `text-sm text-muted-foreground`; `FpPhoneInput` → `<div className={DAFTAR_ROW}><span className="text-base text-muted-foreground">+998</span><input {...shared} className={DAFTAR_INPUT} /></div>`; `FpCodeInput` → the input inside a `DAFTAR_ROW`, `cn(DAFTAR_INPUT, "text-center text-lg tracking-[0.5em]")`; `FpPasswordInput` → input and reveal button inside a `DAFTAR_ROW` (button loses its absolute positioning). The Lumio branches, `FpSubmit` and `FpError` do not change. Update the header comment: the default skin is Daftar, not plain shadcn.
- [ ] **Step 2: `forgot-password-dialog.tsx`** — add `contentClassName?: string` (doc comment: same reason as `lumio` — Radix portals the content to `<body>`); `className={cn(lumio && "lumio", contentClassName, "sm:max-w-sm")}`.
- [ ] **Step 3: `login-form.tsx`** — pass `contentClassName={daftarScope(portal)}`.
- [ ] **Step 4: Verify** — open the dialog on both hosts, light and dark: ink button, underline fields, paper surface. Student login dialog (`student.localhost`) unchanged.
- [ ] **Step 5: Commit** — `feat(login): password-reset dialog follows the Daftar sheet`.

---

### Task 4: Telegram callback page

**Files:**
- Create: `client/src/app/(auth)/auth/telegram/callback/telegram-callback.tsx`
- Modify: `client/src/app/(auth)/auth/telegram/callback/page.tsx`

**Interfaces:**
- Consumes: `DaftarSheet`.

- [ ] **Step 1: Move the client code** — `telegram-callback.tsx` gets the current `TelegramCallbackInner` (renamed `TelegramCallback`, exported) with all hooks and comments intact; its outer two wrapper `div`s collapse to `<div className="space-y-4">` and the error `<p>` gains `role="alert"`.
- [ ] **Step 2: `page.tsx`** becomes a server component:

```tsx
import { Suspense } from "react";
import { headers } from "next/headers";
import { getPortalType } from "@/lib/portal";
import { DaftarSheet } from "../../../daftar-sheet";
import { TelegramCallback } from "./telegram-callback";

export default async function TelegramCallbackPage() {
  const headersList = await headers();
  const host =
    headersList.get("x-forwarded-host") || headersList.get("host") || "";
  const portal = getPortalType(host);

  // `useSearchParams` needs a Suspense boundary.
  const callback = (
    <Suspense fallback={null}>
      <TelegramCallback />
    </Suspense>
  );

  if (portal === "student") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-center">
        <div className="w-full max-w-sm">{callback}</div>
      </div>
    );
  }

  return <DaftarSheet portal={portal}>{callback}</DaftarSheet>;
}
```

- [ ] **Step 3: Verify** — `/auth/telegram/callback` (no params) on `localhost` shows the sheet with «Kirish ma'lumoti topilmadi…» and the back link; `?error=Sinov` shows that text; on `student.localhost` the page looks as before (centred).
- [ ] **Step 4: Commit** — `feat(login): Telegram sign-in callback sits on the Daftar sheet`.

---

### Task 5: Cleanup, docs, full verification

**Files:**
- Delete: `client/public/login-admin-background.jpg`, `client/public/login-image-1.jpg`, `client/public/login-image-2.jpg`
- Modify: `client/src/app/layout.tsx`, `client/src/app/globals.css` (one line), `client/CLAUDE.md`

- [ ] **Step 1: Delete the photos** — `git rm` the three files (grep confirms no reference outside `client/CLAUDE.md`, which Step 3 rewrites). Commit: `chore(login): drop the unused sign-in photos`.
- [ ] **Step 2: Unused roman Fraunces** — `layout.tsx` declares `Fraunces` (variable `--font-fraunces`) and preloads it on every route, but nothing uses `font-serif`. Remove the import, the instance and `fraunces.variable`; remove `--font-serif: var(--font-fraunces);` from `@theme inline`. Commit: `perf: stop preloading a serif no page uses`.
- [ ] **Step 3: `client/CLAUDE.md`** (English) — rewrite «Login backdrops (liquid glass)» as student-only and add «Staff sign-in pages (Daftar)»: the scope + `daftarScope`, `DaftarSheet`, `daftar-field.ts`, the margin line tied to the column, the opaque footer, the scope class on portalled content, `daftar-theme.test.ts`, the staff Mini App screen still being Lumio. Touch the password-reset and Telegram callback notes where they describe the old shape. Commit: `docs(client): staff sign-in is the Daftar sheet`.
- [ ] **Step 4: Full verification** — `npx tsc --noEmit`; `npx eslint src` (0 errors); `npm test`; then `npm run build`. Browser pass over the spec's matrix; screenshots for the CEO before any deploy.
