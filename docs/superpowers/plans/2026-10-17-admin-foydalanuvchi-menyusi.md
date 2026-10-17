# Admin User Menu in the Header, Support and Build Info in the Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the signed-in user block from the bottom of the admin sidebar to the right end of the top header (with a theme submenu), show date + time in the Tashkent clock, and give the sidebar footer a "Texnik yordam" link plus a "Yangilangan: dd.MM.yyyy · sha" line.

**Architecture:** One new header component (`HeaderUserMenu`) replaces `SidebarUserFooter`; one new sidebar component (`SidebarFooterInfo`) replaces the mobile "Mavzu" footer and the user footer. Build date and commit sha are baked in by `next.config.ts` (`env`) and read through a small pure module (`lib/build-info.ts`). All logic that can be unit-tested lives in `lib/`; the components are tested by static markup render (the client has no jsdom).

**Tech Stack:** Next.js 16 (App Router, React Compiler), Tailwind + shadcn/ui, Radix `DropdownMenu`, `next-themes`, zustand (`useAuth`), vitest (node environment, `src/**/*.test.ts` only).

**Spec:** `docs/superpowers/specs/2026-10-17-admin-foydalanuvchi-menyusi-design.md`

## Global Constraints

- All user-facing text is Uzbek (Latin script only): «Profil», «Ko'rinish», «Yorug'», «Qorong'i», «Tizim», «Chiqish», «Texnik yordam», «Yangilangan».
- Dates display as `dd.MM.yyyy` (client/CLAUDE.md, "Dates and Times"); time as `HH:mm:ss`.
- "Now" always goes through the Tashkent helpers in `src/lib/tashkent-time.ts`, never browser-local time.
- «Chiqish» goes through `useSignOut()` (`src/hooks/use-sign-out.ts`), never `useAuth().logout()` directly (Telegram Mini App rule).
- No Prettier on `client/` (CLAUDE.local.md): do NOT run `prettier --write` on client files.
- `components/theme-toggle.tsx` itself stays (login pages, `error.tsx`, `not-found.tsx`, privacy policy and `daftar-sheet.tsx` use it); only its use in the dashboard header and the sidebar is removed.
- Vitest here includes only `src/**/*.test.ts` (no `.tsx`); component tests use `createElement` + `renderToStaticMarkup`, same as `src/components/payments/refund-dialog.test.ts`.
- Commit messages and new code comments in English unless the user says otherwise (memory: `feedback_prs_commits_comments_english`).
- Run `npm run build` and `npm test` one after the other, never in parallel (memory: `reference_build_parallel_test_prisma`).
- Work happens in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-user-header` (branch `worktree-admin-user-header`). Run commands from `client/` unless a step says repo root.

---

### Task 1: Date + time in the Tashkent clock

**Files:**
- Modify: `client/src/lib/tashkent-time.ts` (append `formatDdMmYyyy`)
- Modify: `client/src/lib/tashkent-time.test.ts` (import + new `describe`)
- Modify: `client/src/components/tashkent-clock.tsx`

**Interfaces:**
- Produces: `formatDdMmYyyy(dateStr: string): string` — `"2026-10-17"` → `"17.10.2026"`. Task 2 imports it.

- [ ] **Step 0: Install dependencies in the worktree (it has no `node_modules`)**

Run (from `client/`): `npm ci`
Expected: finishes without error; `ls node_modules | head -1` prints a package name.

- [ ] **Step 1: Write the failing test**

In `client/src/lib/tashkent-time.test.ts` add `formatDdMmYyyy` to the import list from `./tashkent-time` (keep alphabetical: after `tashkentWallClock` is fine, any order compiles), then append at the end of the file:

```ts
describe("formatDdMmYyyy", () => {
  it.each([
    ["2026-10-17", "17.10.2026"],
    ["2026-01-05", "05.01.2026"], // zero-padded day and month survive
    ["2026-12-31", "31.12.2026"],
  ])("%s → %s", (input, expected) => {
    expect(formatDdMmYyyy(input)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/tashkent-time.test.ts`
Expected: FAIL — `formatDdMmYyyy is not a function` (or "not exported").

- [ ] **Step 3: Implement**

Append to `client/src/lib/tashkent-time.ts`:

```ts
/** "2026-10-17" (`TashkentNow.dateStr`) → "17.10.2026", the display format. */
export function formatDdMmYyyy(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/lib/tashkent-time.test.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Use it in the clock**

In `client/src/components/tashkent-clock.tsx`:

1. Change the import to `import { formatDdMmYyyy, tashkentNow } from "@/lib/tashkent-time";`
2. Below `formatHms`, add:

```tsx
function formatNow(): string {
  const now = tashkentNow();
  return `${formatDdMmYyyy(now.dateStr)} · ${formatHms(now.seconds)}`;
}
```

3. Replace the effect body and the placeholder:

```tsx
  useEffect(() => {
    setLabel(formatNow());
    const interval = setInterval(() => setLabel(formatNow()), 1000);
    return () => clearInterval(interval);
  }, []);
```

and `{label || "--:--:--"}` → `{label || "--.--.---- · --:--:--"}`.

4. Update the doc comment's first line to: `Always-on Tashkent (UTC+5) date and clock for the navbar.` (leave the rest).

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/tashkent-time.ts src/lib/tashkent-time.test.ts src/components/tashkent-clock.tsx
git commit -m "feat(header): show the Tashkent date next to the clock

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Build info (date + commit) baked in at build time

**Files:**
- Create: `client/src/lib/build-info.ts`
- Create: `client/src/lib/build-info.test.ts`
- Modify: `client/next.config.ts`

**Interfaces:**
- Consumes: `formatDdMmYyyy` from Task 1.
- Produces (Task 4 relies on these exact names):
  - `interface BuildInfo { date: string; sha: string }` — `date` is `yyyy-MM-dd`.
  - `resolveBuildInfo(date: string | undefined, sha: string | undefined): BuildInfo | null`
  - `currentBuildInfo(): BuildInfo | null` — reads `process.env.NEXT_PUBLIC_BUILD_DATE` / `NEXT_PUBLIC_BUILD_SHA`.
  - `formatBuildInfo(info: BuildInfo): string` — `"Yangilangan: 17.10.2026 · a1b2c3d"`.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/build-info.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentBuildInfo, formatBuildInfo, resolveBuildInfo } from "./build-info";

afterEach(() => vi.unstubAllEnvs());

describe("formatBuildInfo", () => {
  it("writes the date as dd.MM.yyyy and appends the commit", () => {
    expect(formatBuildInfo({ date: "2026-10-17", sha: "a1b2c3d" })).toBe(
      "Yangilangan: 17.10.2026 · a1b2c3d",
    );
  });

  it("keeps the local-build marker as is", () => {
    expect(formatBuildInfo({ date: "2026-10-17", sha: "dev" })).toBe(
      "Yangilangan: 17.10.2026 · dev",
    );
  });
});

describe("resolveBuildInfo", () => {
  it("returns null when the build date is missing (nothing honest to show)", () => {
    expect(resolveBuildInfo(undefined, "a1b2c3d")).toBeNull();
    expect(resolveBuildInfo("", "a1b2c3d")).toBeNull();
  });

  it("falls back to «dev» when the commit is missing or empty", () => {
    expect(resolveBuildInfo("2026-10-17", undefined)).toEqual({ date: "2026-10-17", sha: "dev" });
    expect(resolveBuildInfo("2026-10-17", "")).toEqual({ date: "2026-10-17", sha: "dev" });
  });

  it("passes a real commit through", () => {
    expect(resolveBuildInfo("2026-10-17", "a1b2c3d")).toEqual({ date: "2026-10-17", sha: "a1b2c3d" });
  });
});

describe("currentBuildInfo", () => {
  it("reads the two NEXT_PUBLIC variables next.config.ts sets", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "2026-10-17");
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "a1b2c3d");
    expect(currentBuildInfo()).toEqual({ date: "2026-10-17", sha: "a1b2c3d" });
  });

  it("is null when the date variable is not set", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "");
    expect(currentBuildInfo()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/lib/build-info.test.ts`
Expected: FAIL — cannot resolve `./build-info`.

- [ ] **Step 3: Implement the module**

Create `client/src/lib/build-info.ts`:

```ts
import { formatDdMmYyyy } from "@/lib/tashkent-time";

/** `date` is `yyyy-MM-dd` (Tashkent day of the build); `sha` is 7 characters or «dev». */
export interface BuildInfo {
  date: string;
  sha: string;
}

export function resolveBuildInfo(
  date: string | undefined,
  sha: string | undefined,
): BuildInfo | null {
  if (!date) return null;
  return { date, sha: sha || "dev" };
}

// Both reads must stay literal `process.env.NEXT_PUBLIC_*` expressions: Next
// inlines them at build time from the `env` block in next.config.ts, and a
// dynamic `process.env[name]` would be left undefined in the browser bundle.
export function currentBuildInfo(): BuildInfo | null {
  return resolveBuildInfo(
    process.env.NEXT_PUBLIC_BUILD_DATE,
    process.env.NEXT_PUBLIC_BUILD_SHA,
  );
}

export function formatBuildInfo({ date, sha }: BuildInfo): string {
  return `Yangilangan: ${formatDdMmYyyy(date)} · ${sha}`;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/lib/build-info.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Bake the values in at build time**

Replace the contents of `client/next.config.ts` with:

```ts
import type { NextConfig } from "next";
import path from "path";

// Shown at the bottom of the admin sidebar («Yangilangan: dd.MM.yyyy · sha»).
// The date is the Tashkent day of the build ("en-CA" prints yyyy-MM-dd);
// VERCEL_GIT_COMMIT_SHA is a system variable Vercel sets itself, so nothing is
// typed into the dashboard. Local builds have no sha and show «dev».
const buildDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tashkent",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_BUILD_DATE: buildDate,
    NEXT_PUBLIC_BUILD_SHA: buildSha,
  },
};

export default nextConfig;
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/build-info.ts src/lib/build-info.test.ts next.config.ts
git commit -m "feat(build): bake build date and commit into the client bundle

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `HeaderUserMenu` in the top bar

**Files:**
- Create: `client/src/components/header-user-menu.tsx`
- Create: `client/src/components/header-user-menu.test.ts`
- Modify: `client/src/components/dashboard-header.tsx` (add the menu, remove `ThemeToggle`)

**Interfaces:**
- Consumes: `useAuth` (`src/hooks/use-auth.ts`; `user` has `firstName`, `lastName`, `photo`, `roles: { id, name }[]`), `useSignOut()` (returns `() => void`), `useTheme()` from `next-themes`.
- Produces: `export function HeaderUserMenu()` — no props.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/header-user-menu.test.ts`:

```ts
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The menu content renders in a portal and only while open; draw it inline.
vi.mock("@/components/ui/dropdown-menu", () => {
  const Pass = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children);
  return {
    DropdownMenu: Pass,
    DropdownMenuTrigger: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuRadioGroup: Pass,
    DropdownMenuRadioItem: Pass,
    DropdownMenuSeparator: Pass,
    DropdownMenuSub: Pass,
    DropdownMenuSubContent: Pass,
    DropdownMenuSubTrigger: Pass,
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: "dark", setTheme: () => {} }) }));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => () => {} }));

import { useAuth } from "@/hooks/use-auth";
import { HeaderUserMenu } from "./header-user-menu";

const norm = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

type AuthUser = NonNullable<ReturnType<typeof useAuth.getState>["user"]>;
const signedIn = {
  id: 10001,
  firstName: "Ali",
  lastName: "Valiyev",
  photo: null,
  roles: [{ id: 2, name: "Branch Director" }],
} as unknown as AuthUser;

describe("HeaderUserMenu", () => {
  beforeEach(() => useAuth.setState({ user: signedIn }));

  it("shows who is signed in and offers Profil, Ko'rinish and Chiqish", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    const text = norm(html);
    expect(text).toContain("Ali Valiyev");
    expect(text).toContain("Branch Director");
    expect(text).toContain("Profil");
    expect(text).toContain("Ko'rinish");
    expect(text).toContain("Yorug'");
    expect(text).toContain("Qorong'i");
    expect(text).toContain("Tizim");
    expect(text).toContain("Chiqish");
    expect(html).toContain('href="/profile"');
  });

  it("hides the name below md so a phone shows the picture only", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    expect(html).toMatch(/class="hidden max-w-40 truncate text-sm font-medium md:block"/);
  });

  it("draws no menu items before the session is hydrated", () => {
    useAuth.setState({ user: null });
    const text = norm(renderToStaticMarkup(createElement(HeaderUserMenu)));
    expect(text).not.toContain("Profil");
    expect(text).not.toContain("Chiqish");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/components/header-user-menu.test.ts`
Expected: FAIL — cannot resolve `./header-user-menu`.

- [ ] **Step 3: Implement the component**

Create `client/src/components/header-user-menu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { LogOut, Monitor, Moon, Palette, Sun, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useSignOut } from "@/hooks/use-sign-out";

const THEMES = [
  { value: "light", label: "Yorug'", Icon: Sun },
  { value: "dark", label: "Qorong'i", Icon: Moon },
  { value: "system", label: "Tizim", Icon: Monitor },
] as const;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * The signed-in user, at the right end of the top bar on every width. The
 * name is dropped below `md` so a phone keeps only the picture. «Ko'rinish»
 * is where the colour mode lives now (the bar's standalone toggle is gone).
 */
export function HeaderUserMenu() {
  const user = useAuth((s) => s.user);
  const { theme, setTheme } = useTheme();
  // Inside the staff Mini App (ADR-0045) «Chiqish» waits at /tg for
  // «Qayta kirish» — a plain logout would be signed straight back in.
  const signOut = useSignOut();

  if (!user) return <Skeleton className="size-8 rounded-full" />;

  const roleName = user.roles[0]?.name ?? "";
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Foydalanuvchi menyusi"
          className="flex items-center gap-2 rounded-md p-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent"
        >
          <Avatar className="size-8 rounded-lg">
            {user.photo && <AvatarImage src={user.photo} alt={fullName} />}
            <AvatarFallback className="rounded-lg text-xs">
              {getInitials(fullName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-40 truncate text-sm font-medium md:block">
            {fullName}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{roleName}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <User className="mr-2 size-4" />
            Profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 size-4" />
            Ko&apos;rinish
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
              {THEMES.map(({ value, label, Icon }) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <Icon className="mr-2 size-4" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={signOut}
        >
          <LogOut className="mr-2 size-4" />
          Chiqish
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/components/header-user-menu.test.ts`
Expected: PASS (3 tests). If the sandboxed `useAuth` import fails because the store pulls in a browser-only module, mock that module in the test the same way the other mocks are written (`vi.mock("@/lib/api", ...)`) — do not change the component.

- [ ] **Step 5: Wire it into the header and drop the standalone toggle**

In `client/src/components/dashboard-header.tsx`:

1. Remove the line `import { ThemeToggle } from "@/components/theme-toggle";`.
2. Add `import { HeaderUserMenu } from "@/components/header-user-menu";` next to the other component imports.
3. Replace

```tsx
          <NotificationBell />
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
```

with

```tsx
          <NotificationBell />
          <HeaderUserMenu />
```

- [ ] **Step 6: Typecheck, lint the touched files and commit**

Run: `npx tsc --noEmit && npx eslint src/components/header-user-menu.tsx src/components/header-user-menu.test.ts src/components/dashboard-header.tsx`
Expected: no errors.

```bash
git add src/components/header-user-menu.tsx src/components/header-user-menu.test.ts src/components/dashboard-header.tsx
git commit -m "feat(header): user menu with profile, appearance and sign-out in the top bar

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Sidebar footer — support link and build line; drop the old user block

**Files:**
- Create: `client/src/components/sidebar-footer-info.tsx`
- Create: `client/src/components/sidebar-footer-info.test.ts`
- Modify: `client/src/components/app-sidebar.tsx` (imports at lines ~13, ~30, ~33; footer block at the bottom of the component)
- Delete: `client/src/components/sidebar-user-footer.tsx`

**Interfaces:**
- Consumes: `currentBuildInfo`, `formatBuildInfo` (Task 2); `COMPANY.supportHref` (`src/lib/company.ts`).
- Produces: `export function SidebarFooterInfo()` — no props; must render inside `SidebarProvider`.

- [ ] **Step 1: Write the failing test**

Create `client/src/components/sidebar-footer-info.test.ts`:

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { COMPANY } from "@/lib/company";
import { SidebarFooterInfo } from "./sidebar-footer-info";

afterEach(() => vi.unstubAllEnvs());

const draw = () =>
  renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(SidebarProvider, null, createElement(SidebarFooterInfo)),
    ),
  );

describe("SidebarFooterInfo", () => {
  it("links to technical support in a new tab", () => {
    const html = draw();
    expect(html).toContain(`href="${COMPANY.supportHref}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Texnik yordam");
  });

  it("prints the build date and commit, and hides the line on an icon-only sidebar", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "2026-10-17");
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "a1b2c3d");
    const html = draw();
    expect(html).toContain("Yangilangan: 17.10.2026 · a1b2c3d");
    expect(html).toContain("group-data-[collapsible=icon]:hidden");
  });

  it("omits the build line when there is no build date", () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_DATE", "");
    expect(draw()).not.toContain("Yangilangan");
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/components/sidebar-footer-info.test.ts`
Expected: FAIL — cannot resolve `./sidebar-footer-info`.

- [ ] **Step 3: Implement the component**

Create `client/src/components/sidebar-footer-info.tsx`:

```tsx
"use client";

import { LifeBuoy } from "lucide-react";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { currentBuildInfo, formatBuildInfo } from "@/lib/build-info";
import { COMPANY } from "@/lib/company";

/**
 * Bottom of the admin sidebar. «Texnik yordam» is the support chat (the same
 * link as the login footer) — named so it is not mistaken for the header's
 * «Shu sahifa bo'yicha qo'llanma» button. The build line says when the running
 * site was last published; it disappears on the icon-only sidebar.
 */
export function SidebarFooterInfo() {
  const build = currentBuildInfo();

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Texnik yordam">
            <a href={COMPANY.supportHref} target="_blank" rel="noopener noreferrer">
              <LifeBuoy />
              <span>Texnik yordam</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      {build && (
        <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {formatBuildInfo(build)}
        </p>
      )}
    </SidebarFooter>
  );
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/components/sidebar-footer-info.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Replace the old footers in `AppSidebar`**

In `client/src/components/app-sidebar.tsx`:

1. Remove `SidebarFooter,` from the `@/components/ui/sidebar` import list.
2. Replace `import { SidebarUserFooter } from "@/components/sidebar-user-footer";` with `import { SidebarFooterInfo } from "@/components/sidebar-footer-info";`.
3. Remove `import { ThemeToggle } from "@/components/theme-toggle";`.
4. Keep `Separator` (still used in the header's mobile branch switcher block).
5. Replace this block at the end of the component

```tsx
      {isMobile && (
        <SidebarFooter className="px-4 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Mavzu</span>
            <ThemeToggle />
          </div>
          <Separator className="my-1" />
        </SidebarFooter>
      )}

      <SidebarUserFooter />
```

with

```tsx
      <SidebarFooterInfo />
```

- [ ] **Step 6: Delete the old user footer**

Run: `git rm src/components/sidebar-user-footer.tsx`
Then: `grep -rn "sidebar-user-footer\|SidebarUserFooter" src`
Expected: no output.

- [ ] **Step 7: Typecheck, lint the touched files and commit**

Run: `npx tsc --noEmit && npx eslint src/components/app-sidebar.tsx src/components/sidebar-footer-info.tsx src/components/sidebar-footer-info.test.ts`
Expected: no errors (an unused-import error in `app-sidebar.tsx` means step 5 missed an import — remove it).

```bash
git add src/components/sidebar-footer-info.tsx src/components/sidebar-footer-info.test.ts src/components/app-sidebar.tsx
git commit -m "feat(sidebar): support link and build line replace the bottom user block

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Document, verify, check in the browser

**Files:**
- Modify: `client/CLAUDE.md` (new subsection after "### Sidebar Active State")

- [ ] **Step 1: Add the rule to `client/CLAUDE.md`**

Insert directly after the "### Sidebar Active State" section (before "### Settings Page (`/settings`)"):

```markdown
### Header User Menu and Sidebar Footer (admin panel)

- **The signed-in user lives in the top bar, not the sidebar.** `HeaderUserMenu` (`src/components/header-user-menu.tsx`) sits at the right end of `DashboardHeader`, after the notification bell, on every width; the name is hidden below `md`. Its menu is Profil · Ko'rinish (light/dark/system) · Chiqish. «Chiqish» goes through `useSignOut()` like everywhere else. The dashboard has no standalone theme toggle any more — colour mode is the «Ko'rinish» submenu. `components/theme-toggle.tsx` stays for the login pages, error pages and the student portal.
- **New per-user settings (display variants, language) are added as items in this same menu**, not as new header buttons.
- **The sidebar footer is `SidebarFooterInfo`:** «Texnik yordam» (`COMPANY.supportHref`) and a «Yangilangan: dd.MM.yyyy · sha» line. The line comes from `NEXT_PUBLIC_BUILD_DATE` / `NEXT_PUBLIC_BUILD_SHA`, which `next.config.ts` sets itself at build time (Tashkent date; the first 7 characters of Vercel's `VERCEL_GIT_COMMIT_SHA`, or «dev» locally). Nothing is configured in the Vercel dashboard, and `package.json`'s `version` is not shown — it never changes. Read the values only through `lib/build-info.ts`.
- `TashkentClock` shows the Tashkent date and time together (`dd.MM.yyyy · HH:mm:ss`).
```

- [ ] **Step 2: Full automated check (one after another)**

Run each separately and read the result line:

1. `npx tsc --noEmit` — Expected: no errors.
2. `npx eslint src` — Expected: summary line `0 errors` (warnings may exist; read the `✖ N problems (X errors, Y warnings)` line, X must be 0).
3. `npm test` — Expected: all test files pass, including the three new ones.
4. `npm run build` — Expected: build completes; no "Type error" or "Failed to compile".

If any step fails, fix the cause and rerun only that step plus the ones after it.

- [ ] **Step 3: Check it in the browser**

Read `/Users/a1111/.claude/projects/-Users-a1111-Desktop-daf-erp-system/memory/reference_mock_api_browser_check.md` and `reference_local_role_browser_check.md`, then follow them: start the mock API and the dev server from this worktree's `client/`, set the invented session cookies, and open `/` in the built-in browser. Verify, taking a screenshot only for layout questions (assert state with `javascript_tool` / `get_page_text`):

- Width 1440: top bar right end shows `dd.MM.yyyy · HH:mm:ss` clock, bell, then avatar + name. Click it: menu shows name+role, Profil, Ko'rinish (submenu with three radio items, current one marked), Chiqish.
- Choosing «Qorong'i» then «Yorug'» switches the theme at once and survives a reload.
- Width 375: avatar only (no name), the bar does not overflow horizontally, the sidebar (open via the trigger) has no «Mavzu» row and no user block; its bottom shows «Texnik yordam» and the build line.
- Sidebar collapsed to icons at 1440: only the lifebuoy icon remains at the bottom (tooltip «Texnik yordam» on hover), no build line.
- «Texnik yordam» opens `https://t.me/akhror_soliev` in a new tab (check the `href`/`target`, do not rely on the pane opening it).
- «Profil» navigates to `/profile`.
- Build line reads `Yangilangan: <today's Tashkent date> · dev` in the dev server.

Clean up as the memory note says (cookies, `localStorage`, stop servers, remove `.claude/launch.json` if you created it).

- [ ] **Step 4: Commit the doc**

```bash
git add CLAUDE.md
git commit -m "docs(client): document the header user menu and sidebar footer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off**

Report to the user: what changed, the four check results (tsc / eslint / test / build) with their summary lines, what was seen in the browser, and that nothing is pushed. Do not open a PR or merge without the user asking (the CEO merges; deploy is manual — memory `project_railway_manual_deploy`).
