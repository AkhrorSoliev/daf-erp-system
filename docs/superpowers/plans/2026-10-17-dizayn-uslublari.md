# Design Skins (colour + font sets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every admin/teacher-portal user pick one of five design skins (Daftar, O'rmon, Gilos, Grafit, Qum — a colour set plus a font), stored on the account and applied on every device.

**Architecture:** A skin is a `data-skin` attribute on `<html>`. `client/src/app/skins.css` overrides the shadcn colour tokens per skin (light and dark) and re-points `--font-plex` at the skin's font; `globals.css` is not touched. The choice is stored in a new nullable `User.uiSkin` column, written by `PATCH /users/ui-skin`, returned inside the session user (`formatUser`) and therefore also in the `user` cookie. A tiny inline script in `<head>` reads that cookie before first paint (no flash); `SkinSync` keeps the attribute in step with the store; the user menu gets a «Dizayn uslubi» submenu.

**Tech Stack:** NestJS + Prisma + Jest (`server/`), Next.js 16 + React 19 + Tailwind v4 + shadcn + zustand + vitest (`client/`).

**Spec:** `docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md` (one deliberate change: the boot script reads the existing `user` cookie instead of a separate `localStorage` copy — Task 6 amends the spec).

## Global Constraints

- Skin ids, in this order: `daftar` (default), `ormon`, `gilos`, `grafit`, `qum`. Labels: «Daftar», «O'rmon», «Gilos», «Grafit», «Qum». `null`/unknown `uiSkin` means `daftar`.
- Fonts per skin: Daftar = IBM Plex Sans (already loaded), O'rmon = Rubik, Gilos = Montserrat, Grafit = Roboto Condensed, Qum = Ubuntu. New fonts: `subsets: ["latin", "latin-ext", "cyrillic"]`, `display: "swap"`, `preload: false`.
- The skin overrides only the tokens listed in Appendix A. Status tokens (`--success`, `--warning`, `--info`, `--destructive`) and `--chart-2..5` are never set by a skin.
- `data-skin` is applied only when the signed-in user has a non-default skin. Sign-in pages (no `user` cookie) are always Daftar. The student portal (`.lumio`) and the public form (`.form-theme`) are untouched.
- `@theme inline` in `globals.css` copies `var(--font-plex)` into the font utilities, so a skin must override `--font-plex` itself (never `--font-sans`).
- UI text is Uzbek (Latin only): «Dizayn uslubi», «Dizayn uslubini saqlab bo'lmadi», «Noma'lum dizayn uslubi».
- **Client:** no Prettier on `client/` files. **Server:** run `npx prettier --write` on every touched `.ts` before committing; server tests are jest, client tests are vitest (`npx vitest --config vitest.config.mts run <path>`).
- Commit messages and new code comments in English; every commit ends with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Work in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/admin-user-header` (branch `worktree-admin-user-header`, already holds part 1). Plain separate git commands only (no `git … && …` chains). Never run `npm run build` and `npm test` in parallel.
- Never apply the migration to any database; only author it. Deploy order: migration, server, then client.

---

### Task 1: Server — skin ids, `User.uiSkin` column, session user carries it

**Files:**
- Create: `server/src/common/ui-skins.ts`
- Create: `server/src/common/ui-skins.spec.ts`
- Modify: `server/prisma/schema.prisma` (model `User`, after `position`)
- Create: `server/prisma/migrations/20261017120000_user_ui_skin/migration.sql`
- Modify: `server/src/auth/auth.service.ts` (`formatUser`, line ~261)
- Modify: `server/src/auth/auth.service.spec.ts`

**Interfaces:**
- Produces: `UI_SKIN_IDS` (readonly tuple of the five ids), `type UiSkinId`, `DEFAULT_UI_SKIN: UiSkinId` from `server/src/common/ui-skins.ts`; `User.uiSkin: string | null` in Prisma; the session `user` object returned by `login`/`refresh` gains `uiSkin: string | null`.

- [ ] **Step 0: Install and generate in the fresh worktree**

Run (from `server/`): `npm ci` then `npx prisma generate`
Expected: both finish without error.

- [ ] **Step 1: Write the failing tests**

Create `server/src/common/ui-skins.spec.ts`:

```ts
import { DEFAULT_UI_SKIN, UI_SKIN_IDS } from './ui-skins';

describe('ui skins', () => {
  it('lists the five skins, the default first', () => {
    expect([...UI_SKIN_IDS]).toEqual([
      'daftar',
      'ormon',
      'gilos',
      'grafit',
      'qum',
    ]);
    expect(DEFAULT_UI_SKIN).toBe('daftar');
    expect(UI_SKIN_IDS[0]).toBe(DEFAULT_UI_SKIN);
  });
});
```

In `server/src/auth/auth.service.spec.ts`, add a new `describe` right after the `login — portal role gate` block (before `validateUser — phone-based login`):

```ts
  describe('login — session user', () => {
    it("carries the user's design skin, null when none was chosen", async () => {
      const chosen = { ...teacher, uiSkin: 'ormon' };
      const withSkin = await service.login(chosen, undefined, undefined);
      expect(withSkin.user.uiSkin).toBe('ormon');

      const without = await service.login(teacher, undefined, undefined);
      expect(without.user.uiSkin).toBeNull();
    });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run (from `server/`): `npx jest src/common/ui-skins.spec.ts src/auth/auth.service.spec.ts`
Expected: FAIL — `Cannot find module './ui-skins'`, and the auth case fails on `uiSkin` (`undefined`).

- [ ] **Step 3: Implement**

Create `server/src/common/ui-skins.ts`:

```ts
/**
 * The staff portals' design skins (ADR-0101): a colour set plus a font, chosen
 * per account. `User.uiSkin` holds one of these ids; null means the default.
 * `client/src/lib/ui-skins.ts` mirrors this list and its test compares the two.
 */
export const UI_SKIN_IDS = ['daftar', 'ormon', 'gilos', 'grafit', 'qum'] as const;

export type UiSkinId = (typeof UI_SKIN_IDS)[number];

export const DEFAULT_UI_SKIN: UiSkinId = 'daftar';
```

In `server/prisma/schema.prisma`, inside `model User`, directly after the line `position       String?`, add:

```prisma
  // The staff portals' design skin (ADR-0101): one of common/ui-skins.ts, null = the default.
  uiSkin         String?
```

Create `server/prisma/migrations/20261017120000_user_ui_skin/migration.sql`:

```sql
-- Xodimning dizayn uslubi (ADR-0101). null = «daftar» (boshlang'ich).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "uiSkin" TEXT;
```

In `server/src/auth/auth.service.ts`, in `formatUser`, add `uiSkin: user.uiSkin ?? null,` right after the `photo: user.photo,` line.

Then regenerate the client and validate the schema: `npx prisma generate` and `npx prisma validate`
Expected: both succeed.

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest src/common/ui-skins.spec.ts src/auth/auth.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck` — Expected: no errors.
Run: `npx prettier --write src/common/ui-skins.ts src/common/ui-skins.spec.ts src/auth/auth.service.ts src/auth/auth.service.spec.ts` — then `git diff --stat` must show only the intended files changed.

```bash
git add server/src/common/ui-skins.ts server/src/common/ui-skins.spec.ts server/prisma/schema.prisma server/prisma/migrations/20261017120000_user_ui_skin server/src/auth/auth.service.ts server/src/auth/auth.service.spec.ts
git commit -m "feat(server): User.uiSkin column and the skin in the session user

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server — `PATCH /users/ui-skin`

**Files:**
- Create: `server/src/users/dto/update-ui-skin.dto.ts`
- Modify: `server/src/users/users.service.ts` (add `updateUiSkin` right after `updateProfile`)
- Modify: `server/src/users/users.controller.ts` (new route, declared BEFORE `@Patch(':id')`)
- Modify: `server/src/users/users.controller.spec.ts`
- Modify: `server/src/users/users.service.spec.ts`
- Modify: `server/src/common/permissions/route-access.snapshot.json`
- Modify: `server/src/common/auth/branch-route-policy.ts` (the `SELF` routes list, line ~640)

**Interfaces:**
- Consumes: `UI_SKIN_IDS` (Task 1).
- Produces: `PATCH /users/ui-skin` body `{ skin: string }`, answers `{ uiSkin: string }`; `UsersService.updateUiSkin(id: number, skin: string): Promise<{ uiSkin: string | null }>`.

- [ ] **Step 1: Write the failing tests**

In `server/src/users/users.controller.spec.ts`: add `updateUiSkin: jest.fn().mockResolvedValue({ uiSkin: 'ormon' }),` to `mockService`, and add this `describe` right after the `updateProfile()` describe:

```ts
  describe('updateUiSkin()', () => {
    it('is open to every staff account', () => {
      expect(routeAccess(UsersController, 'updateUiSkin')).toEqual({
        kind: 'anyStaff',
      });
    });

    it("writes the CALLER's skin only, taking the id from the token", async () => {
      const res = await controller.updateUiSkin(7, { skin: 'ormon' });
      expect(mockService.updateUiSkin).toHaveBeenCalledWith(7, 'ormon');
      expect(res).toEqual({ uiSkin: 'ormon' });
    });
  });
```

In `server/src/users/users.service.spec.ts`, add at the end of the file a new top-level `describe` (the file's other describes build their own module; copy the minimal providers):

```ts
describe('UsersService — updateUiSkin', () => {
  let service: UsersService;
  const update = jest.fn();

  beforeEach(async () => {
    update.mockReset();
    update.mockImplementation(({ data }) => Promise.resolve({ uiSkin: data.uiSkin }));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: { user: { update } } },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: RedisService,
          useValue: { set: jest.fn(), get: jest.fn(), del: jest.fn() },
        },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it("writes only the caller's own row and returns the stored skin", async () => {
    const res = await service.updateUiSkin(7, 'gilos');
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { uiSkin: 'gilos' },
      select: { uiSkin: true },
    });
    expect(res).toEqual({ uiSkin: 'gilos' });
  });
});
```

Add a DTO validation test file `server/src/users/dto/update-ui-skin.dto.spec.ts`:

```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUiSkinDto } from './update-ui-skin.dto';

const check = (skin: unknown) =>
  validate(plainToInstance(UpdateUiSkinDto, { skin }));

describe('UpdateUiSkinDto', () => {
  it.each(['daftar', 'ormon', 'gilos', 'grafit', 'qum'])('accepts %s', async (skin) => {
    expect(await check(skin)).toHaveLength(0);
  });

  it.each(['', 'DAFTAR', 'neon', 'qum ', undefined, 5])('refuses %p', async (skin) => {
    const errors = await check(skin);
    expect(errors).toHaveLength(1);
  });
});
```

Route manifest: in `server/src/common/permissions/route-access.snapshot.json`, directly after the `"PATCH /users/profile": "ANY",` line add:

```json
  "PATCH /users/ui-skin": [
    "Administrator",
    "Branch Director",
    "CEO",
    "Cashier",
    "Teacher"
  ],
```

In `server/src/common/auth/branch-route-policy.ts`, in the `SELF` routes list add `'PATCH /users/ui-skin',` after `'PATCH /users/profile',`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx jest src/users src/common/permissions src/common/auth`
Expected: FAIL — `updateUiSkin` is not a function / DTO module missing / the manifest specs complain about the route that does not exist yet.

- [ ] **Step 3: Implement**

Create `server/src/users/dto/update-ui-skin.dto.ts`:

```ts
import { IsIn } from 'class-validator';
import { UI_SKIN_IDS } from '../../common/ui-skins';

/** Your own design skin (ADR-0101): one of the five known ids, nothing else. */
export class UpdateUiSkinDto {
  @IsIn(UI_SKIN_IDS, { message: "Noma'lum dizayn uslubi" })
  skin!: string;
}
```

In `server/src/users/users.service.ts`, after the `updateProfile` method, add:

```ts
  /**
   * Your own design skin (ADR-0101). A personal setting: written for the
   * caller's row only and not recorded in the entity history.
   */
  async updateUiSkin(id: number, skin: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { uiSkin: skin },
      select: { uiSkin: true },
    });
    return { uiSkin: updated.uiSkin };
  }
```

In `server/src/users/users.controller.ts`: import `import { UpdateUiSkinDto } from './dto/update-ui-skin.dto';` next to the other DTO imports, and add the route directly after the `updateProfile` handler (before `@Patch('password')`, so it stays above `@Patch(':id')`):

```ts
  @Patch('ui-skin')
  @AnyStaff()
  updateUiSkin(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateUiSkinDto,
  ) {
    return this.usersService.updateUiSkin(userId, dto.skin);
  }
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx jest src/users src/common/permissions src/common/auth src/common/ui-skins.spec.ts`
Expected: PASS. If `permission-routes.spec.ts` reports a different role list for `PATCH /users/ui-skin` than the snapshot row you wrote, copy the list it prints (the order is alphabetical) into the snapshot row — the two must be the same text.

- [ ] **Step 5: Typecheck, lint, format, commit**

Run: `npm run typecheck` — Expected: no errors.
Run: `npx eslint src/users src/common/ui-skins.ts src/common/ui-skins.spec.ts --quiet` — Expected: no errors.
Run: `npx prettier --write src/users/dto/update-ui-skin.dto.ts src/users/dto/update-ui-skin.dto.spec.ts src/users/users.service.ts src/users/users.service.spec.ts src/users/users.controller.ts src/users/users.controller.spec.ts src/common/auth/branch-route-policy.ts`

```bash
git add server/src/users server/src/common/permissions/route-access.snapshot.json server/src/common/auth/branch-route-policy.ts
git commit -m "feat(server): PATCH /users/ui-skin writes the caller's own design skin

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Client — skin registry, boot script, optimistic change, `patchUser`

**Files:**
- Create: `client/src/lib/ui-skins.ts`
- Create: `client/src/lib/ui-skins.test.ts`
- Create: `client/src/lib/skin-boot-script.ts`
- Create: `client/src/lib/skin-boot-script.test.ts`
- Create: `client/src/lib/change-ui-skin.ts`
- Create: `client/src/lib/change-ui-skin.test.ts`
- Modify: `client/src/hooks/use-auth.ts` (`AuthUser.uiSkin`, `patchUser`)
- Create: `client/src/hooks/use-auth-patch-user.test.ts`

**Interfaces:**
- Produces:
  - `ui-skins.ts`: `UI_SKINS` (readonly array of `{ id, label, hint, swatch }`), `type UiSkinId`, `UI_SKIN_IDS`, `DEFAULT_SKIN`, `isUiSkin(v)`, `skinOrDefault(v): UiSkinId`, `skinAttribute(v): UiSkinId | null` (null for the default).
  - `skin-boot-script.ts`: `SKIN_BOOT_SCRIPT: string`.
  - `change-ui-skin.ts`: `changeUiSkin(next: UiSkinId, deps: ChangeUiSkinDeps): Promise<boolean>` with `ChangeUiSkinDeps { current(): string | null | undefined; apply(skin: string | null): void; save(skin: UiSkinId): Promise<void>; fail(error: unknown): void }`.
  - `useAuth`: `AuthUser.uiSkin?: string | null`; store action `patchUser(patch: Partial<AuthUser>): void` (merges into the user, rewrites the `user` cookie, no-op when signed out).

- [ ] **Step 1: Write the failing tests**

`client/src/lib/ui-skins.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SKIN,
  UI_SKINS,
  UI_SKIN_IDS,
  isUiSkin,
  skinAttribute,
  skinOrDefault,
} from "./ui-skins";

describe("ui skins", () => {
  it("lists the five skins, the default first, each with a swatch and a hint", () => {
    expect([...UI_SKIN_IDS]).toEqual(["daftar", "ormon", "gilos", "grafit", "qum"]);
    expect(DEFAULT_SKIN).toBe("daftar");
    for (const s of UI_SKINS) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
      expect(s.swatch).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("knows a skin id and falls back to the default for anything else", () => {
    expect(isUiSkin("ormon")).toBe(true);
    expect(isUiSkin("neon")).toBe(false);
    expect(isUiSkin(null)).toBe(false);
    expect(skinOrDefault("gilos")).toBe("gilos");
    expect(skinOrDefault(undefined)).toBe("daftar");
    expect(skinOrDefault("neon")).toBe("daftar");
  });

  it("puts no attribute on the page for the default skin", () => {
    expect(skinAttribute("daftar")).toBeNull();
    expect(skinAttribute(null)).toBeNull();
    expect(skinAttribute("qum")).toBe("qum");
  });

  it("lists exactly the ids the server accepts", () => {
    const server = readFileSync(
      path.join(__dirname, "../../../server/src/common/ui-skins.ts"),
      "utf8",
    );
    const list = server.match(/UI_SKIN_IDS = \[([^\]]*)\]/)?.[1] ?? "";
    const ids = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual([...UI_SKIN_IDS]);
  });
});
```

`client/src/lib/skin-boot-script.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SKIN_BOOT_SCRIPT } from "./skin-boot-script";

/** Runs the inline script against a fake document and returns the attributes it set. */
function run(cookie: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const doc = {
    cookie,
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
  };
  new Function("document", SKIN_BOOT_SCRIPT)(doc);
  return attrs;
}

const userCookie = (u: unknown) => `user=${encodeURIComponent(JSON.stringify(u))}`;

describe("skin boot script", () => {
  it("sets the skin of the signed-in user before the page is drawn", () => {
    expect(run(userCookie({ id: 1, uiSkin: "ormon" }))).toEqual({ "data-skin": "ormon" });
    expect(run(`a=1; ${userCookie({ uiSkin: "qum" })}; b=2`)).toEqual({ "data-skin": "qum" });
  });

  it("does nothing for the default skin, an unknown one or none", () => {
    expect(run(userCookie({ uiSkin: "daftar" }))).toEqual({});
    expect(run(userCookie({ uiSkin: "neon" }))).toEqual({});
    expect(run(userCookie({ id: 1 }))).toEqual({});
    expect(run(userCookie({ uiSkin: null }))).toEqual({});
  });

  it("does nothing when nobody is signed in or the cookie is damaged", () => {
    expect(run("")).toEqual({});
    expect(run("other=1")).toEqual({});
    expect(run("xuser=%7B%22uiSkin%22%3A%22qum%22%7D")).toEqual({});
    expect(run("user=%7Bnot-json")).toEqual({});
  });
});
```

`client/src/lib/change-ui-skin.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { changeUiSkin, type ChangeUiSkinDeps } from "./change-ui-skin";

function deps(over: Partial<ChangeUiSkinDeps> & { initial?: string | null } = {}) {
  let skin: string | null | undefined = over.initial ?? "daftar";
  const d: ChangeUiSkinDeps = {
    current: () => skin,
    apply: vi.fn((s: string | null) => {
      skin = s;
    }),
    save: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn(),
    ...over,
  };
  return { d, read: () => skin };
}

describe("changeUiSkin", () => {
  it("applies the skin at once, then saves it", async () => {
    const { d, read } = deps();
    expect(await changeUiSkin("ormon", d)).toBe(true);
    expect(d.apply).toHaveBeenCalledWith("ormon");
    expect(d.save).toHaveBeenCalledWith("ormon");
    expect(read()).toBe("ormon");
    expect(d.fail).not.toHaveBeenCalled();
  });

  it("puts the old skin back and reports when the save fails", async () => {
    const boom = new Error("offline");
    const { d, read } = deps({ save: vi.fn().mockRejectedValue(boom) });
    expect(await changeUiSkin("gilos", d)).toBe(false);
    expect(read()).toBe("daftar");
    expect(d.fail).toHaveBeenCalledWith(boom);
  });

  it("does not undo a newer choice when an older save fails late", async () => {
    let rejectFirst!: (e: Error) => void;
    const first = new Promise<void>((_, rej) => (rejectFirst = rej));
    const { d, read } = deps({ save: vi.fn().mockReturnValueOnce(first).mockResolvedValue(undefined) });
    const a = changeUiSkin("ormon", d);
    await changeUiSkin("qum", d);
    rejectFirst(new Error("late"));
    await a;
    expect(read()).toBe("qum");
  });
});
```

`client/src/hooks/use-auth-patch-user.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useAuth, type AuthUser } from "./use-auth";

const user = { id: 1, firstName: "Ali", lastName: "Valiyev", uiSkin: null } as unknown as AuthUser;

describe("useAuth.patchUser", () => {
  beforeEach(() => useAuth.setState({ user: null, token: null }));

  it("merges the patch into the signed-in user", () => {
    useAuth.setState({ user });
    useAuth.getState().patchUser({ uiSkin: "ormon" });
    expect(useAuth.getState().user).toMatchObject({ id: 1, firstName: "Ali", uiSkin: "ormon" });
  });

  it("does nothing when nobody is signed in", () => {
    useAuth.getState().patchUser({ uiSkin: "ormon" });
    expect(useAuth.getState().user).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run (from `client/`, after `npm ci` if `node_modules` is missing): `npx vitest --config vitest.config.mts run src/lib/ui-skins.test.ts src/lib/skin-boot-script.test.ts src/lib/change-ui-skin.test.ts src/hooks/use-auth-patch-user.test.ts`
Expected: FAIL — the four modules/`patchUser` do not exist.

- [ ] **Step 3: Implement**

`client/src/lib/ui-skins.ts`:

```ts
/**
 * The staff portals' design skins (ADR-0101): a colour set plus a font. The
 * ids mirror `server/src/common/ui-skins.ts` (ui-skins.test.ts compares them);
 * the colours and fonts themselves live in `app/skins.css` and `app/layout.tsx`.
 * `swatch` is only the dot drawn in the menu.
 */
export const UI_SKINS = [
  { id: "daftar", label: "Daftar", hint: "To'q ko'k, texnik shrift", swatch: "#1b2d4e" },
  { id: "ormon", label: "O'rmon", hint: "Chuqur yashil, yumaloq shakllar", swatch: "#1f4d3a" },
  { id: "gilos", label: "Gilos", hint: "To'q bordo, keng harflar", swatch: "#6b2233" },
  { id: "grafit", label: "Grafit", hint: "Kulrang, tor shrift", swatch: "#2f3640" },
  { id: "qum", label: "Qum", hint: "Iliq jigarrang", swatch: "#6b4a1e" },
] as const;

export type UiSkinId = (typeof UI_SKINS)[number]["id"];

export const UI_SKIN_IDS: readonly UiSkinId[] = UI_SKINS.map((s) => s.id);

export const DEFAULT_SKIN: UiSkinId = "daftar";

export function isUiSkin(value: unknown): value is UiSkinId {
  return typeof value === "string" && (UI_SKIN_IDS as readonly string[]).includes(value);
}

export function skinOrDefault(value: unknown): UiSkinId {
  return isUiSkin(value) ? value : DEFAULT_SKIN;
}

/** The `data-skin` value to put on the page: none for the default, whose tokens are the base ones. */
export function skinAttribute(value: unknown): UiSkinId | null {
  const skin = skinOrDefault(value);
  return skin === DEFAULT_SKIN ? null : skin;
}
```

`client/src/lib/skin-boot-script.ts`:

```ts
import { DEFAULT_SKIN, UI_SKIN_IDS } from "@/lib/ui-skins";

/**
 * Inline script for `<head>`: sets `data-skin` from the signed-in user's own
 * `user` cookie before the first paint, so a skin never flashes in after the
 * default. No `user` cookie (a sign-in page) → nothing, so those stay Daftar.
 * The skin ids are the registry's, so this cannot drift from `ui-skins.ts`.
 * Any failure (a damaged cookie) is swallowed: the page just stays Daftar.
 */
export const SKIN_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )user=([^;]*)/);if(!m)return;var s=JSON.parse(decodeURIComponent(m[1])).uiSkin;if(${JSON.stringify(
  UI_SKIN_IDS.filter((id) => id !== DEFAULT_SKIN),
)}.indexOf(s)>-1)document.documentElement.setAttribute("data-skin",s)}catch(e){}})();`;
```

`client/src/lib/change-ui-skin.ts`:

```ts
import type { UiSkinId } from "@/lib/ui-skins";

export interface ChangeUiSkinDeps {
  /** The skin the page holds now. */
  current(): string | null | undefined;
  /** Put a skin into the page's state (the user store); null clears it. */
  apply(skin: string | null): void;
  /** Persist it on the account. */
  save(skin: UiSkinId): Promise<void>;
  /** Tell the user the save failed. */
  fail(error: unknown): void;
}

/**
 * Optimistic skin change: the page switches at once, the account is written
 * after. A failed save puts the old skin back — but only if nothing newer was
 * chosen meanwhile, so a slow failure never undoes the latest choice.
 */
export async function changeUiSkin(next: UiSkinId, deps: ChangeUiSkinDeps): Promise<boolean> {
  const previous = deps.current() ?? null;
  deps.apply(next);
  try {
    await deps.save(next);
    return true;
  } catch (error) {
    if (deps.current() === next) deps.apply(previous);
    deps.fail(error);
    return false;
  }
}
```

`client/src/hooks/use-auth.ts`: add `uiSkin?: string | null;` to `AuthUser` (after `studentId?: number;`), add to `AuthState`:

```ts
  /**
   * Merges a patch into the signed-in user and rewrites the `user` cookie (the
   * tokens are untouched). For a field the user changes about themselves, such
   * as the design skin; does nothing when nobody is signed in.
   */
  patchUser: (patch: Partial<AuthUser>) => void;
```

and in the store implementation, after `clearSession`:

```ts
  patchUser: (patch) => {
    const user = get().user;
    if (!user) return;
    const next = { ...user, ...patch };
    Cookies.set("user", JSON.stringify(next), { expires: 1 });
    set({ user: next });
  },
```

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest --config vitest.config.mts run src/lib/ui-skins.test.ts src/lib/skin-boot-script.test.ts src/lib/change-ui-skin.test.ts src/hooks/use-auth-patch-user.test.ts`
Expected: PASS. (`js-cookie` does nothing when there is no `document`, so `patchUser` is safe in the node environment.)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit` — Expected: no errors.

```bash
git add client/src/lib/ui-skins.ts client/src/lib/ui-skins.test.ts client/src/lib/skin-boot-script.ts client/src/lib/skin-boot-script.test.ts client/src/lib/change-ui-skin.ts client/src/lib/change-ui-skin.test.ts client/src/hooks/use-auth.ts client/src/hooks/use-auth-patch-user.test.ts
git commit -m "feat(client): skin registry, boot script and optimistic skin change

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Client — `skins.css`, fonts, boot script and `SkinSync` wired in

**Files:**
- Create: `client/src/test-support/oklch-contrast.ts`
- Modify: `client/src/app/staff-theme.test.ts` (import the shared helpers instead of its local copies)
- Create: `client/src/app/skins.css` (Appendix A, verbatim)
- Create: `client/src/app/skins.test.ts`
- Modify: `client/src/app/layout.tsx`
- Create: `client/src/components/providers/skin-sync.tsx`
- Modify: `client/src/components/providers/auth-provider.tsx`

**Interfaces:**
- Consumes: `UI_SKINS`/`skinAttribute` and `SKIN_BOOT_SCRIPT` (Task 3), `useAuth().user.uiSkin`.
- Produces: `oklch-contrast.ts` exports `type Oklch = [number, number, number]`, `cssTokens(css, selector)`, `luminance(c)`, `contrast(a, b)`; `<SkinSync />`.

- [ ] **Step 1: Extract the contrast helpers and write the failing test**

Create `client/src/test-support/oklch-contrast.ts` (a move of the functions in `staff-theme.test.ts`, exported):

```ts
export type Oklch = [number, number, number];

/** `oklch(L C H)` custom properties of the rule whose selector is exactly `selector`. */
export function cssTokens(css: string, selector: string): Record<string, Oklch> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"));
  if (!rule) throw new Error(`css has no "${selector}" rule`);
  return Object.fromEntries(
    [...rule[1].matchAll(/(--[a-z-0-9]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);/g)].map((m) => [
      m[1],
      [Number(m[2]), Number(m[3]), Number(m[4])] as Oklch,
    ]),
  );
}

/** Relative luminance (WCAG) of an OKLCH colour, through linear sRGB. */
export function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const r = clamp(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_);
  const g = clamp(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_);
  const bl = clamp(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}

export function contrast(a: Oklch, b: Oklch): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

Rewrite the top of `client/src/app/staff-theme.test.ts`: delete its local `tokens`, `luminance` and `contrast` functions and the `readFileSync`-only `css` stays; import the helpers and keep every test body unchanged except that `tokens(sel)` becomes `cssTokens(css, sel)`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, cssTokens } from "@/test-support/oklch-contrast";

const css = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const tokens = (selector: string) => cssTokens(css, selector);
```

(The `describe("staff theme …")` block below stays exactly as it is.) Note the helper's token regex also allows digits (`--chart-1`), which the old one did not; the existing assertions do not read digit tokens, so nothing changes.

Create `client/src/app/skins.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contrast, cssTokens } from "@/test-support/oklch-contrast";
import { DEFAULT_SKIN, UI_SKINS } from "@/lib/ui-skins";

const globals = readFileSync(path.join(__dirname, "globals.css"), "utf8");
const skinsCss = readFileSync(path.join(__dirname, "skins.css"), "utf8");
const layout = readFileSync(path.join(__dirname, "layout.tsx"), "utf8");

const SKINS = UI_SKINS.filter((s) => s.id !== DEFAULT_SKIN).map((s) => s.id);
const base = cssTokens(globals, ":root");
const baseDark = cssTokens(globals, ".dark");

/** What the cascade gives each mode: the base tokens, then the skin's blocks in specificity order. */
function themes(id: string) {
  const light = { ...base, ...cssTokens(skinsCss, `:root[data-skin="${id}"]`) };
  const dark = { ...base, ...baseDark, ...cssTokens(skinsCss, `:root[data-skin="${id}"]`), ...cssTokens(skinsCss, `.dark[data-skin="${id}"]`) };
  return { light, dark };
}

const FONT_OF: Record<string, string> = {
  ormon: "--font-rubik",
  gilos: "--font-montserrat",
  grafit: "--font-roboto-condensed",
  qum: "--font-ubuntu",
};

describe.each(SKINS)("skin %s", (id) => {
  it.each(["light", "dark"] as const)("keeps text readable in the %s theme", (mode) => {
    const t = themes(id)[mode];
    for (const surface of ["--background", "--card"]) {
      for (const text of ["--foreground", "--muted-foreground", "--destructive", "--success", "--info"]) {
        expect(contrast(t[text], t[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t["--primary-foreground"], t["--primary"]), "button label").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--sidebar-foreground"], t["--sidebar"]), "menu text").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["--warning"], t["--card"]), "warning mark").toBeGreaterThanOrEqual(3);
  });

  it("writes the dark block after the light one (equal specificity, source order decides)", () => {
    const light = skinsCss.indexOf(`:root[data-skin="${id}"] {`);
    const dark = skinsCss.indexOf(`.dark[data-skin="${id}"] {`);
    expect(light).toBeGreaterThanOrEqual(0);
    expect(dark).toBeGreaterThan(light);
  });

  it("leaves the status colours and the other chart colours to the base theme", () => {
    for (const sel of [`:root[data-skin="${id}"]`, `.dark[data-skin="${id}"]`]) {
      const block = skinsCss.match(new RegExp(`^${sel.replace(/[.[\]"()]/g, "\\$&")} \\{([^}]*)\\}`, "m"))?.[1] ?? "";
      expect(block).not.toMatch(/--(destructive|success|warning|info|chart-[2-5]):/);
    }
  });

  it("points the font at a family layout.tsx really loads", () => {
    const fontVar = FONT_OF[id];
    expect(skinsCss).toContain(`html[data-skin="${id}"] { --font-plex: var(${fontVar}); }`);
    expect(layout).toContain(`variable: "${fontVar}"`);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest --config vitest.config.mts run src/app/skins.test.ts src/app/staff-theme.test.ts`
Expected: `staff-theme.test.ts` PASSES (pure refactor); `skins.test.ts` FAILS — `ENOENT ... skins.css`.

- [ ] **Step 3: Implement**

Create `client/src/app/skins.css` with the exact content of **Appendix A** below.

In `client/src/app/layout.tsx`:
1. Change the font import to `import { IBM_Plex_Sans, Baloo_2, Nunito, Rubik, Montserrat, Roboto_Condensed, Ubuntu } from "next/font/google";` and add `import { SKIN_BOOT_SCRIPT } from "@/lib/skin-boot-script";` next to the other imports, and `import "./skins.css";` directly after `import "./globals.css";`.
2. After the `fontBody` constant add:

```ts
// The staff portals' other design skins (ADR-0101). Each is loaded only when
// its skin is chosen: `preload: false` keeps them out of the page's head, and
// the browser fetches a font file only once the skin applies it (`skins.css`
// re-points `--font-plex` at one of these).
const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
const robotoCondensed = Roboto_Condensed({
  variable: "--font-roboto-condensed",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});
// Ubuntu has no 600: `font-semibold` falls to its 700.
const ubuntu = Ubuntu({
  variable: "--font-ubuntu",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});
```

3. Add `rubik.variable, montserrat.variable, robotoCondensed.variable, ubuntu.variable,` to the `cn(...)` list on `<html>`, and add the boot script as the first child of `<html>`:

```tsx
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKIN_BOOT_SCRIPT }} />
      </head>
```

Create `client/src/components/providers/skin-sync.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { skinAttribute } from "@/lib/ui-skins";

/**
 * Keeps `<html data-skin>` equal to the signed-in user's design skin
 * (ADR-0101). The inline boot script in `layout.tsx` has already set it from
 * the cookie before first paint; this follows the store afterwards (a skin
 * chosen in the menu, a refreshed session). It does nothing while nobody is
 * signed in: at mount the store is still empty for one tick (`hydrate` runs
 * after this effect), and clearing the attribute then would flash the default.
 * Signing out is a full page load, which starts without the cookie.
 */
export function SkinSync() {
  const signedIn = useAuth((s) => s.user !== null);
  const uiSkin = useAuth((s) => s.user?.uiSkin);

  useEffect(() => {
    if (!signedIn) return;
    const attribute = skinAttribute(uiSkin);
    const root = document.documentElement;
    if (attribute) root.setAttribute("data-skin", attribute);
    else root.removeAttribute("data-skin");
  }, [signedIn, uiSkin]);

  return null;
}
```

In `client/src/components/providers/auth-provider.tsx`: add `import { SkinSync } from "./skin-sync";` and render `<SkinSync />` right after `<PermissionsSync />`.

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest --config vitest.config.mts run src/app src/lib src/hooks`
Expected: PASS (all of `skins.test.ts`: 4 skins × 4 groups).
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npx eslint src/app/layout.tsx src/components/providers src/test-support src/app/skins.test.ts src/app/staff-theme.test.ts` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/test-support/oklch-contrast.ts client/src/app/staff-theme.test.ts client/src/app/skins.css client/src/app/skins.test.ts client/src/app/layout.tsx client/src/components/providers/skin-sync.tsx client/src/components/providers/auth-provider.tsx
git commit -m "feat(client): five design skins — tokens, fonts, boot script and sync

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Client — `useUiSkin` and the «Dizayn uslubi» menu

**Files:**
- Create: `client/src/hooks/use-ui-skin.ts`
- Modify: `client/src/components/header-user-menu.tsx`
- Modify: `client/src/components/header-user-menu.test.ts`

**Interfaces:**
- Consumes: `changeUiSkin`, `UI_SKINS`, `skinOrDefault`, `type UiSkinId` (Task 3); `useAuth().patchUser`; `api` (`@/lib/api` default export), `getErrorMessage`.
- Produces: `useUiSkin(): { skin: UiSkinId; setSkin(next: UiSkinId): Promise<boolean> }`.

- [ ] **Step 1: Write the failing test**

In `client/src/components/header-user-menu.test.ts`, add this mock next to the other `vi.mock` calls (before the `import { HeaderUserMenu }` line):

```ts
vi.mock("@/hooks/use-ui-skin", () => ({
  useUiSkin: () => ({ skin: "ormon", setSkin: async () => true }),
}));
```

and add this test inside `describe("HeaderUserMenu", …)`:

```ts
  it("offers the five design skins and marks the current one", () => {
    const html = renderToStaticMarkup(createElement(HeaderUserMenu));
    const text = norm(html);
    expect(text).toContain("Dizayn uslubi");
    for (const name of ["Daftar", "O'rmon", "Gilos", "Grafit", "Qum"]) {
      expect(text).toContain(name);
    }
    // the colour dots come from the registry
    for (const swatch of ["#1b2d4e", "#1f4d3a", "#6b2233", "#2f3640", "#6b4a1e"]) {
      expect(html).toContain(swatch);
    }
  });
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest --config vitest.config.mts run src/components/header-user-menu.test.ts`
Expected: FAIL — the menu has no «Dizayn uslubi» yet (and `@/hooks/use-ui-skin` does not exist for the mock).

- [ ] **Step 3: Implement**

Create `client/src/hooks/use-ui-skin.ts`:

```ts
"use client";

import { useCallback } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { changeUiSkin } from "@/lib/change-ui-skin";
import { getErrorMessage } from "@/lib/get-error-message";
import { skinOrDefault, type UiSkinId } from "@/lib/ui-skins";
import { useAuth } from "@/hooks/use-auth";

/**
 * The signed-in user's design skin and the way to change it (ADR-0101). The
 * change shows at once (the store feeds `SkinSync`) and is saved on the
 * account; a failed save puts the old skin back with a toast.
 */
export function useUiSkin() {
  const skin = useAuth((s) => skinOrDefault(s.user?.uiSkin));

  const setSkin = useCallback(
    (next: UiSkinId) =>
      changeUiSkin(next, {
        current: () => useAuth.getState().user?.uiSkin,
        apply: (value) => useAuth.getState().patchUser({ uiSkin: value }),
        save: async (value) => {
          await api.patch("/users/ui-skin", { skin: value });
        },
        fail: (error) => toast.error(getErrorMessage(error, "Dizayn uslubini saqlab bo'lmadi")),
      }),
    [],
  );

  return { skin, setSkin };
}
```

In `client/src/components/header-user-menu.tsx`:
1. Change the lucide import to `import { Brush, LogOut, Monitor, Moon, Palette, Sun, User } from "lucide-react";` and add
   `import { useUiSkin } from "@/hooks/use-ui-skin";` and `import { UI_SKINS, type UiSkinId } from "@/lib/ui-skins";`.
2. Call the hook at the top of the component, before the `if (!user)` return (hook order): after `const signOut = useSignOut();` add `const { skin, setSkin } = useUiSkin();`.
3. After the closing `</DropdownMenuSub>` of «Ko'rinish» add:

```tsx
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Brush className="mr-2 size-4" />
            Dizayn uslubi
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={skin}
              onValueChange={(value) => void setSkin(value as UiSkinId)}
            >
              {UI_SKINS.map(({ id, label, hint, swatch }) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  <span
                    aria-hidden
                    className="mr-2 size-3 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: swatch }}
                  />
                  <span>{label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{hint}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
```

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest --config vitest.config.mts run src/components/header-user-menu.test.ts`
Expected: PASS (5 tests).
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npx eslint src/hooks/use-ui-skin.ts src/components/header-user-menu.tsx src/components/header-user-menu.test.ts` — Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/use-ui-skin.ts client/src/components/header-user-menu.tsx client/src/components/header-user-menu.test.ts
git commit -m "feat(client): «Dizayn uslubi» in the user menu

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Docs, ADR, full checks

**Files:**
- Create: `docs/adr/0101-xodimning-dizayn-uslubi-akkauntda.md`
- Modify: `docs/adr/README.md` (index row + ADR numbering check)
- Modify: `client/CLAUDE.md` (new subsection after «Header User Menu and Sidebar Footer (admin panel)»)
- Modify: `client/src/qollanma/kontent/boshlash/interfeys.mdx`, `client/src/qollanma/yangiliklar.ts`
- Modify: `docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md` (cookie boot script)

- [ ] **Step 1: ADR**

Before writing, confirm the number is free: run `ls docs/adr | tail -3` and `git fetch origin main` then `git ls-tree --name-only origin/main docs/adr/ | tail -3` (as separate commands). If `0101` is taken on `main`, use the next free number everywhere below (file name, title, README row).

Create `docs/adr/0101-xodimning-dizayn-uslubi-akkauntda.md` (Uzbek, same shape as ADR-0094: title, **Holati**, **Sana**, **Bog'liq**, Kontekst, Qaror, Taqiqlanadi, Muqobillar, Oqibatlar):

```markdown
# ADR-0101 — Xodimning dizayn uslubi akkauntda saqlanadi; uslub tokenlarni almashtiradi, holat ranglarini emas

**Holati:** Qabul qilindi
**Sana:** 2026-10-17
**Bog'liq:** ADR-0031, ADR-0079, `server/src/common/ui-skins.ts`, `server/src/users/users.service.ts` (`updateUiSkin`), `client/src/lib/ui-skins.ts`, `client/src/app/skins.css`, `client/src/components/providers/skin-sync.tsx`, `docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md`, `docs/superpowers/plans/2026-10-17-dizayn-uslublari.md`

## Kontekst

16.10 da admin va o'qituvchi paneli yagona «ledger» dizayniga o'tdi. CEO har bir xodim o'ziga yoqqan rang va shriftni tanlay olishini xohladi. Erkin tanlov (rang alohida, shrift alohida) rad etildi: yomon ko'rinadigan juftlik chiqib qoladi va har birini tekshirib bo'lmaydi. Tanlov brauzerda emas, akkauntda saqlanishi kerak (CEO: boshqa qurilmada ham bir xil).

## Qaror

1. **Besh tayyor uslub**: `daftar` (boshlang'ich), `ormon`, `gilos`, `grafit`, `qum` — har biri rang va shrift juftligi, yorug' va qorong'i rejimda alohida. Ro'yxat serverda (`common/ui-skins.ts`) va klientda (`lib/ui-skins.ts`), test ikkalasini solishtiradi.
2. **`User.uiSkin String?`** (null = `daftar`). Yozish faqat `PATCH /users/ui-skin` (`@AnyStaff()`): chaqiruvchi faqat o'z qatorini yozadi, qiymat `IsIn(UI_SKIN_IDS)`. Profil eshigi (`PATCH /users/profile`) o'zgarmaydi (ADR-0031). `formatUser` `uiSkin` ni qaytaradi, shuning uchun kirish, `refresh` va Mini App javoblarida va `user` cookie'da bor.
3. **Uslub — `<html data-skin>`**. `skins.css` har uslub uchun ikki blok (`:root[data-skin]`, `.dark[data-skin]`) bilan asosiy tokenlarni almashtiradi; shrift uchun `--font-plex` ni qayta yozadi (`@theme inline` qiymatni nusxalaydi, `--font-sans` ni yozish ish bermaydi). **Holat ranglari (`--success`, `--warning`, `--info`, `--destructive`) va `--chart-2..5` uslubga qaramaydi** — ularga ma'no yuklangan.
4. **Chaqnashsiz**: `<head>` dagi qisqa skript `user` cookie'dan uslubni sahifa chizilishidan oldin qo'yadi. Cookie yo'q (kirish sahifasi) — doim Daftar.
5. **Tarixga yozilmaydi** (shaxsiy sozlama, audit uchun shovqin) va hech qanday ruxsat (`@Can`) kerak emas.

## Taqiqlanadi

- Uslub blokiga holat tokenini (`--success`, `--warning`, `--info`, `--destructive`) yoki `--chart-2..5` ni qo'yish.
- Yangi uslubni testsiz qo'shish: `skins.test.ts` har uslubning matn kontrastini (≥ 4,5) yorug' va qorong'i rejimda o'lchaydi.
- Boshqa odamning uslubini yozadigan yo'l ochish.

## Muqobillar

- **Uslub brauzerda (`localStorage`)**: bazaga tegmaydi, lekin har qurilmada qayta tanlash kerak. CEO tanlamadi.
- **Rang va shrift alohida tanlov**: erkinroq, lekin kafolatlab bo'lmaydi. Tanlanmadi.
- **Markaz yoki filial bo'yicha bitta uslub**: har kim o'zini tanlasin deyildi.

## Oqibatlar

- Migratsiya qo'shimcha (`ADD COLUMN IF NOT EXISTS "uiSkin"`), eski klient yangi maydonni ko'rmaydi. Chiqarish tartibi: migratsiya, server, klient.
- Boshqa qurilmada o'zgartirilgan uslub shu qurilmaga keyingi token yangilanishida (soatiga) yoki qayta kirishda keladi.
- Login va o'quvchi portali o'zgarmaydi (kirishdan oldin `user` cookie yo'q; `.lumio` tokenlarni o'z blokida qayta yozadi).
```

In `docs/adr/README.md` add a row after the 0096 row (same table format):

```markdown
| [0101](0101-xodimning-dizayn-uslubi-akkauntda.md) | Xodimning dizayn uslubi akkauntda; uslub tokenlarni almashtiradi, holat ranglarini emas | Qabul qilindi | 2026-10-17 |
```

- [ ] **Step 2: `client/CLAUDE.md`**

Insert after the «Header User Menu and Sidebar Footer (admin panel)» section (before «### Settings Page (`/settings`)»), in English:

```markdown
### Design skins (admin and teacher portals, ADR-0101)

- **A skin is `<html data-skin="…">`.** Five skins: `daftar` (default, no attribute), `ormon`, `gilos`, `grafit`, `qum` — a colour set plus a font. The registry is `src/lib/ui-skins.ts` (mirrored by `server/src/common/ui-skins.ts`; `ui-skins.test.ts` compares the two). The colours live in `src/app/skins.css`, **not** in `globals.css`, and the fonts are loaded in `layout.tsx` with `preload: false`, so only the chosen skin's font file is fetched.
- **The font is switched through `--font-plex`.** `@theme inline` copies `var(--font-plex)` into the font utilities, so overriding `--font-sans` does nothing; each skin has an `html[data-skin="x"] { --font-plex: var(--font-x); }` rule.
- **A skin never sets a status token** (`--success`, `--warning`, `--info`, `--destructive`) or `--chart-2..5`; `skins.test.ts` fails if one does, and it measures text contrast (≥ 4.5) for every skin in both modes.
- **Adding a skin:** add it to both id lists and `UI_SKINS`, write its two blocks in `skins.css` (light first, then dark), its `html[data-skin]` font rule and font in `layout.tsx`, and run `skins.test.ts`. The skin's `swatch` is only the menu dot.
- **Stored on the account** (`User.uiSkin`, `PATCH /users/ui-skin`, returned in the session user). `useUiSkin()` changes it optimistically through `changeUiSkin` (a failed save restores the old skin only if nothing newer was chosen); `useAuth().patchUser` rewrites the `user` cookie. `SkinSync` (in `AuthProvider`) keeps the attribute equal to the store and does nothing while nobody is signed in.
- **No flash:** `SKIN_BOOT_SCRIPT` (`lib/skin-boot-script.ts`, inline in `<head>`) reads the `user` cookie before first paint. No cookie (a sign-in page) means no attribute, so the staff login is always Daftar. The student portal (`.lumio`) and the public form re-point the tokens in their own scope and are unaffected.
- The picker is the «Dizayn uslubi» submenu of `HeaderUserMenu`.
```

- [ ] **Step 3: User guide and the spec**

Open `client/src/qollanma/kontent/boshlash/interfeys.mdx`, find the bullet that describes «Ko'rinish» (light/dark/system) inside the user menu, and add one bullet right after it, in the page's own style (Uzbek Latin, no `{`, `}` or `<` in prose): «**Dizayn uslubi.** Besh tayyor rang va shrift to'plamidan birini tanlang: Daftar, O'rmon, Gilos, Grafit yoki Qum. Tanlov akkauntingizda saqlanadi, boshqa qurilmada ham shu uslub chiqadi. Kirish sahifasi har doim Daftar.» Add one entry to the top of `client/src/qollanma/yangiliklar.ts` in the existing shape (`sana` 2026-10-17, no `rollar`, `sahifa` pointing at `interfeys`, a short Uzbek title and text about the five skins); `sahifalar/boshlash.ts` `yangilangan` is already 2026-10-17. Run the guide tests: `npx vitest --config vitest.config.mts run src/qollanma`.

In `docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md`, section «4. Klientda qo'llash»: replace the `SkinSync` and «Chaqnashsiz boshlash» bullets so they say the boot script reads the existing `user` cookie (no `localStorage["daf-skin"]`), `SkinSync` only acts while a user is signed in, and `useAuth().patchUser` rewrites the `user` cookie; in «Chekka holatlar» delete the `localStorage` o'chirilgan bullet.

- [ ] **Step 4: Full automated checks, one after another**

From `server/`: `npx jest` (full suite — expected all pass), `npm run typecheck`, `npm run build`, `npx eslint src --quiet`.
From `client/`: `npx tsc --noEmit`, `npx eslint src` (read the `✖ N problems (X errors, Y warnings)` line: X must be 0), `npm test` (use `npx vitest --config vitest.config.mts run` if the native loader fails), `npm run build` (a transient `next/font/google` fetch error → rerun once).
If a check fails because of this branch, fix the cause and rerun that check and the ones after it; a failure unrelated to this branch is reported with its output, not fixed.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/adr/0101-xodimning-dizayn-uslubi-akkauntda.md docs/adr/README.md client/CLAUDE.md client/src/qollanma docs/superpowers/specs/2026-10-17-dizayn-uslublari-design.md
git commit -m "docs: design skins — ADR-0101, CLAUDE.md section, user guide

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Hand off to the controller for the browser check**

Report the commit list and the check results. The controller then verifies in the built-in browser (mock API, session cookies — see memory `reference_mock_api_browser_check`): five skins × light/dark, the computed `font-family` of `body` per skin, no flash after reload, the sign-in page stays Daftar after sign-out, the student portal unchanged.

---

## Appendix A — `client/src/app/skins.css` (verbatim)

```css
/* Design skins for the staff portals (admin, teacher), ADR-0101.
   A skin is <html data-skin="…">. Each block keeps Daftar's lightness and
   chroma and swaps the hue, so a skin reads as the same paper with another ink.
   Status tokens (--success --warning --info --destructive) and --chart-2..5 are
   deliberately NOT set here: they carry meaning and look the same everywhere.
   Light block first, dark block after it: their specificity is equal and the
   later one wins in dark mode. The font is switched through --font-plex,
   because `@theme inline` copies that variable into the font utilities.
   Never put a comment inside a declaration value in this file. */

:root[data-skin="ormon"] {
  --primary: oklch(0.38 0.061 164);
  --background: oklch(0.977 0.004 164);
  --foreground: oklch(0.23 0.03 164);
  --card: oklch(0.996 0.002 164);
  --card-foreground: oklch(0.23 0.03 164);
  --popover: oklch(0.996 0.002 164);
  --popover-foreground: oklch(0.23 0.03 164);
  --primary-foreground: oklch(0.985 0.004 164);
  --secondary: oklch(0.95 0.008 164);
  --secondary-foreground: oklch(0.28 0.04 164);
  --muted: oklch(0.955 0.006 164);
  --muted-foreground: oklch(0.5 0.025 164);
  --accent: oklch(0.945 0.012 164);
  --accent-foreground: oklch(0.23 0.03 164);
  --border: oklch(0.905 0.012 164);
  --input: oklch(0.885 0.014 164);
  --sidebar: oklch(0.96 0.006 164);
  --sidebar-foreground: oklch(0.3 0.03 164);
  --sidebar-primary-foreground: oklch(0.985 0.004 164);
  --sidebar-accent: oklch(0.92 0.012 164);
  --sidebar-accent-foreground: oklch(0.23 0.03 164);
  --sidebar-border: oklch(0.895 0.012 164);
  --ring: oklch(0.38 0.061 164);
  --chart-1: oklch(0.38 0.061 164);
  --sidebar-primary: oklch(0.38 0.061 164);
  --sidebar-ring: oklch(0.38 0.061 164);
}

.dark[data-skin="ormon"] {
  --primary: oklch(0.82 0.06 164);
  --background: oklch(0.165 0.018 164);
  --foreground: oklch(0.93 0.008 164);
  --card: oklch(0.205 0.02 164);
  --card-foreground: oklch(0.93 0.008 164);
  --popover: oklch(0.205 0.02 164);
  --popover-foreground: oklch(0.93 0.008 164);
  --primary-foreground: oklch(0.165 0.018 164);
  --secondary: oklch(0.26 0.02 164);
  --secondary-foreground: oklch(0.93 0.008 164);
  --muted: oklch(0.255 0.018 164);
  --muted-foreground: oklch(0.7 0.02 164);
  --accent: oklch(0.27 0.022 164);
  --accent-foreground: oklch(0.93 0.008 164);
  --sidebar: oklch(0.145 0.016 164);
  --sidebar-foreground: oklch(0.9 0.01 164);
  --sidebar-primary-foreground: oklch(0.165 0.018 164);
  --sidebar-accent: oklch(0.235 0.02 164);
  --sidebar-accent-foreground: oklch(0.93 0.008 164);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --sidebar-border: oklch(1 0 0 / 10%);
  --ring: oklch(0.82 0.06 164);
  --chart-1: oklch(0.82 0.06 164);
  --sidebar-primary: oklch(0.82 0.06 164);
  --sidebar-ring: oklch(0.82 0.06 164);
}

:root[data-skin="gilos"] {
  --primary: oklch(0.37 0.104 10);
  --background: oklch(0.977 0.004 10);
  --foreground: oklch(0.23 0.03 10);
  --card: oklch(0.996 0.002 10);
  --card-foreground: oklch(0.23 0.03 10);
  --popover: oklch(0.996 0.002 10);
  --popover-foreground: oklch(0.23 0.03 10);
  --primary-foreground: oklch(0.985 0.004 10);
  --secondary: oklch(0.95 0.008 10);
  --secondary-foreground: oklch(0.28 0.04 10);
  --muted: oklch(0.955 0.006 10);
  --muted-foreground: oklch(0.5 0.025 10);
  --accent: oklch(0.945 0.012 10);
  --accent-foreground: oklch(0.23 0.03 10);
  --border: oklch(0.905 0.012 10);
  --input: oklch(0.885 0.014 10);
  --sidebar: oklch(0.96 0.006 10);
  --sidebar-foreground: oklch(0.3 0.03 10);
  --sidebar-primary-foreground: oklch(0.985 0.004 10);
  --sidebar-accent: oklch(0.92 0.012 10);
  --sidebar-accent-foreground: oklch(0.23 0.03 10);
  --sidebar-border: oklch(0.895 0.012 10);
  --ring: oklch(0.37 0.104 10);
  --chart-1: oklch(0.37 0.104 10);
  --sidebar-primary: oklch(0.37 0.104 10);
  --sidebar-ring: oklch(0.37 0.104 10);
}

.dark[data-skin="gilos"] {
  --primary: oklch(0.82 0.07 10);
  --background: oklch(0.165 0.018 10);
  --foreground: oklch(0.93 0.008 10);
  --card: oklch(0.205 0.02 10);
  --card-foreground: oklch(0.93 0.008 10);
  --popover: oklch(0.205 0.02 10);
  --popover-foreground: oklch(0.93 0.008 10);
  --primary-foreground: oklch(0.165 0.018 10);
  --secondary: oklch(0.26 0.02 10);
  --secondary-foreground: oklch(0.93 0.008 10);
  --muted: oklch(0.255 0.018 10);
  --muted-foreground: oklch(0.7 0.02 10);
  --accent: oklch(0.27 0.022 10);
  --accent-foreground: oklch(0.93 0.008 10);
  --sidebar: oklch(0.145 0.016 10);
  --sidebar-foreground: oklch(0.9 0.01 10);
  --sidebar-primary-foreground: oklch(0.165 0.018 10);
  --sidebar-accent: oklch(0.235 0.02 10);
  --sidebar-accent-foreground: oklch(0.93 0.008 10);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --sidebar-border: oklch(1 0 0 / 10%);
  --ring: oklch(0.82 0.07 10);
  --chart-1: oklch(0.82 0.07 10);
  --sidebar-primary: oklch(0.82 0.07 10);
  --sidebar-ring: oklch(0.82 0.07 10);
}

:root[data-skin="grafit"] {
  --primary: oklch(0.33 0.02 257);
  --background: oklch(0.977 0.002 257);
  --foreground: oklch(0.23 0.012 257);
  --card: oklch(0.996 0.001 257);
  --card-foreground: oklch(0.23 0.012 257);
  --popover: oklch(0.996 0.001 257);
  --popover-foreground: oklch(0.23 0.012 257);
  --primary-foreground: oklch(0.985 0.002 257);
  --secondary: oklch(0.95 0.003 257);
  --secondary-foreground: oklch(0.28 0.016 257);
  --muted: oklch(0.955 0.002 257);
  --muted-foreground: oklch(0.5 0.01 257);
  --accent: oklch(0.945 0.005 257);
  --accent-foreground: oklch(0.23 0.012 257);
  --border: oklch(0.905 0.005 257);
  --input: oklch(0.885 0.006 257);
  --sidebar: oklch(0.96 0.002 257);
  --sidebar-foreground: oklch(0.3 0.012 257);
  --sidebar-primary-foreground: oklch(0.985 0.002 257);
  --sidebar-accent: oklch(0.92 0.005 257);
  --sidebar-accent-foreground: oklch(0.23 0.012 257);
  --sidebar-border: oklch(0.895 0.005 257);
  --ring: oklch(0.33 0.02 257);
  --chart-1: oklch(0.33 0.02 257);
  --sidebar-primary: oklch(0.33 0.02 257);
  --sidebar-ring: oklch(0.33 0.02 257);
}

.dark[data-skin="grafit"] {
  --primary: oklch(0.82 0.025 257);
  --background: oklch(0.165 0.007 257);
  --foreground: oklch(0.93 0.003 257);
  --card: oklch(0.205 0.008 257);
  --card-foreground: oklch(0.93 0.003 257);
  --popover: oklch(0.205 0.008 257);
  --popover-foreground: oklch(0.93 0.003 257);
  --primary-foreground: oklch(0.165 0.007 257);
  --secondary: oklch(0.26 0.008 257);
  --secondary-foreground: oklch(0.93 0.003 257);
  --muted: oklch(0.255 0.007 257);
  --muted-foreground: oklch(0.7 0.008 257);
  --accent: oklch(0.27 0.009 257);
  --accent-foreground: oklch(0.93 0.003 257);
  --sidebar: oklch(0.145 0.006 257);
  --sidebar-foreground: oklch(0.9 0.004 257);
  --sidebar-primary-foreground: oklch(0.165 0.007 257);
  --sidebar-accent: oklch(0.235 0.008 257);
  --sidebar-accent-foreground: oklch(0.93 0.003 257);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --sidebar-border: oklch(1 0 0 / 10%);
  --ring: oklch(0.82 0.025 257);
  --chart-1: oklch(0.82 0.025 257);
  --sidebar-primary: oklch(0.82 0.025 257);
  --sidebar-ring: oklch(0.82 0.025 257);
}

:root[data-skin="qum"] {
  --primary: oklch(0.44 0.074 71);
  --background: oklch(0.977 0.004 71);
  --foreground: oklch(0.23 0.03 71);
  --card: oklch(0.996 0.002 71);
  --card-foreground: oklch(0.23 0.03 71);
  --popover: oklch(0.996 0.002 71);
  --popover-foreground: oklch(0.23 0.03 71);
  --primary-foreground: oklch(0.985 0.004 71);
  --secondary: oklch(0.95 0.008 71);
  --secondary-foreground: oklch(0.28 0.04 71);
  --muted: oklch(0.955 0.006 71);
  --muted-foreground: oklch(0.5 0.025 71);
  --accent: oklch(0.945 0.012 71);
  --accent-foreground: oklch(0.23 0.03 71);
  --border: oklch(0.905 0.012 71);
  --input: oklch(0.885 0.014 71);
  --sidebar: oklch(0.96 0.006 71);
  --sidebar-foreground: oklch(0.3 0.03 71);
  --sidebar-primary-foreground: oklch(0.985 0.004 71);
  --sidebar-accent: oklch(0.92 0.012 71);
  --sidebar-accent-foreground: oklch(0.23 0.03 71);
  --sidebar-border: oklch(0.895 0.012 71);
  --ring: oklch(0.44 0.074 71);
  --chart-1: oklch(0.44 0.074 71);
  --sidebar-primary: oklch(0.44 0.074 71);
  --sidebar-ring: oklch(0.44 0.074 71);
}

.dark[data-skin="qum"] {
  --primary: oklch(0.82 0.07 71);
  --background: oklch(0.165 0.018 71);
  --foreground: oklch(0.93 0.008 71);
  --card: oklch(0.205 0.02 71);
  --card-foreground: oklch(0.93 0.008 71);
  --popover: oklch(0.205 0.02 71);
  --popover-foreground: oklch(0.93 0.008 71);
  --primary-foreground: oklch(0.165 0.018 71);
  --secondary: oklch(0.26 0.02 71);
  --secondary-foreground: oklch(0.93 0.008 71);
  --muted: oklch(0.255 0.018 71);
  --muted-foreground: oklch(0.7 0.02 71);
  --accent: oklch(0.27 0.022 71);
  --accent-foreground: oklch(0.93 0.008 71);
  --sidebar: oklch(0.145 0.016 71);
  --sidebar-foreground: oklch(0.9 0.01 71);
  --sidebar-primary-foreground: oklch(0.165 0.018 71);
  --sidebar-accent: oklch(0.235 0.02 71);
  --sidebar-accent-foreground: oklch(0.93 0.008 71);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --sidebar-border: oklch(1 0 0 / 10%);
  --ring: oklch(0.82 0.07 71);
  --chart-1: oklch(0.82 0.07 71);
  --sidebar-primary: oklch(0.82 0.07 71);
  --sidebar-ring: oklch(0.82 0.07 71);
}

html[data-skin="ormon"] { --font-plex: var(--font-rubik); }
html[data-skin="gilos"] { --font-plex: var(--font-montserrat); }
html[data-skin="grafit"] { --font-plex: var(--font-roboto-condensed); }
html[data-skin="qum"] { --font-plex: var(--font-ubuntu); }
```
