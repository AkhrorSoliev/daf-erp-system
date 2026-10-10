# Ruxsatlar tizimi — 1-bosqich «Poydevor» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded `@Roles(...)` lists (server) and role-id checks (client) with capability ("imkoniyat") checks driven by one server catalog whose defaults reproduce today's access, so that stage 2 can let the CEO change them — with nothing visible changing for anyone today.

**Architecture:** `server/src/common/permissions/` holds the catalog (`permission-catalog.ts`: 14 sections, 64 capabilities with today's default roles), `PermissionsService` (roles read from the database through `whereUserMayAct()`, a 10-second per-process cache, effective capabilities = union of the defaults of the roles held; the CEO holds all), four route markers (`@Can(...keys)`, `@AnyStaff()`, `@AnyUser()`, `@StudentOnly()`) and a global `PermissionGuard` registered between `JwtAuthGuard` and `BranchScopeGuard` that also refreshes `request.user.roles` from the database. Every controller moves from `@Roles` to a marker; `RolesGuard`, `@Roles` and `STAFF_ROLES` are deleted. Two specs keep the change honest: an equivalence spec that compares every route's default access with a snapshot of `main` taken before the conversion (plus a reviewed list of 33 intentional differences, Appendix C), and a manifest spec (every route carries exactly one marker). The client reads `GET /permissions/me` into a zustand store; menus and in-page checks call `useCan(...)`; the existing per-role menu tests build `can` from the server catalog's defaults, which proves the screens did not change.

**Tech Stack:** NestJS 11 + Prisma 7, Jest (ts-jest, transpile-only), the TypeScript compiler API in `server/scripts/route-inventory.ts`; Next.js 16 + React 19, zustand 5, vitest 4 (node environment, `src/**/*.test.ts` only).

Spec: `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md` — sections 3, 4, 7.1, 7.3–7.6, 8, 10 and 11 «1-bosqich».

## Global Constraints

- Work in the worktree `.claude/worktrees/ruxsatlar-tizimi` (branch `worktree-ruxsatlar-tizimi`). Never `cd` to the main checkout. The worktree has no `node_modules` until Task 0 installs them.
- Server commands run from `server/`: `npx jest <path>`, `npm run typecheck`, `npx eslint <files>`, `npx prettier --write <files>`, `npm test`. Client commands run from `client/`: `npx vitest run <path>`, `npx tsc --noEmit`, `npm run lint`. **Never run Prettier on `client/` files.**
- **Nothing visible changes.** Every role sees exactly the same menus, pages, tabs and buttons as before. Server access changes only as listed in Appendix C.
- Role ids: 1 CEO, 2 Branch Director, 3 Administrator, 4 Teacher, 5 Cashier, 6 Student. Capability decisions read roles from the database, never from the token.
- The CEO holds every capability, always.
- These stay role identity and are NOT converted to capabilities (Appendix D lists each check): the portal split (student vs staff), branch scope (the CEO spans every branch), the rank rules (ADR-0026, ADR-0027), the ADR-0034 target rules, teacher-only scoping (own groups, the attendance teacher lock, teacher texts), the ADR-0074 task ladder, the CEO's bypass of the 72-hour payment-correction window, the CEO's teacher-pay exemption in «Bo'ldi», company-level vs branch-level payment settings, the «Barcha filiallar» flag of a Telegram group, the discount field (`DiscountRoleGuard`) and the departure-policy choice (`assertMayChooseDeparturePolicy`).
- The only new route is `GET /permissions/me`.
- All user-visible text is Uzbek (Latin), no English words. Code comments, commit messages and test names: English. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Prettier is CI-blocking on server files: run `npx prettier --write` on every touched server `.ts` before committing.
- `npm run typecheck` is what type-checks server specs (`ts-jest` is transpile-only). Run it at the end of every server task.
- The ADR is numbered at PR time: the next free number in `docs/adr/README.md` on `origin/main` (0076 if «Qaytariladigan pul» has taken 0075).

## File Structure

**Server — new** (`server/src/common/permissions/` unless noted):

| File | Responsibility |
|---|---|
| `server/src/common/auth/role-ids.ts` | `ROLE_ID`, `ROLE_NAME_BY_ID` — the one copy of the role table's fixed ids |
| `permission-catalog.ts` (+ `.spec.ts`) | sections, the 64 capabilities, `defaultKeysForRoles()` |
| `route-access.ts` (+ `.spec.ts`) | `accessSummary()` — a route's default access written the way `@Roles` said it |
| `access.decorators.ts` | `ACCESS_KEY`, `RouteAccessMeta`, `@Can`, `@AnyStaff`, `@AnyUser`, `@StudentOnly` |
| `testing.ts` (+ `testing.spec.ts`) | spec helpers: `routeAccess`, `defaultRolesOf`, `fakePermissions` |
| `permissions.service.ts` (+ `.spec.ts`) | `forUser(userId)`, `has(userId, key)` |
| `permission.guard.ts` (+ `.spec.ts`) | the global guard and the pure `allows()` |
| `permissions.controller.ts` (+ `.spec.ts`) | `GET /permissions/me` |
| `permissions.module.ts` | `@Global()` module |
| `route-access.snapshot.json` | every route's access on `main` before the conversion |
| `intentional-access-changes.ts` | Appendix C as code |
| `permission-routes.spec.ts` | the equivalence spec, and (Task 14) the manifest |
| `server/scripts/route-access-snapshot.ts` | writes `route-access.snapshot.json` |

**Server — modified:** `server/scripts/route-inventory.ts`, `server/src/app.module.ts`, `server/src/tasks/task-policy.ts`, `server/src/common/auth/branch-route-policy.ts`, every controller listed in Appendix B, every spec that imports `ROLES_KEY` or `RolesGuard`, the services in Appendix D, `server/src/common/decorators/index.ts`, `server/src/common/guards/index.ts`. **Deleted (Task 14):** `common/decorators/roles.decorator.ts`, `common/decorators/staff-roles.ts`, `common/guards/roles.guard.ts`, `common/guards/roles.guard.spec.ts`.

**Client — new:** `client/src/lib/permission-keys.ts` (+ test), `client/src/lib/permission-check.ts` (+ test), `client/src/hooks/use-permissions.ts`, `client/src/components/providers/permissions-sync.tsx`, `client/src/components/shared/can-link.tsx`, `client/src/test-support/server-catalog.ts`.

**Client — modified:** `client/src/lib/api.ts`, `client/src/components/providers/auth-provider.tsx`, the five nav files and their tests, `client/src/components/app-sidebar.tsx`, the files in Appendix E. **Deleted (Task 19):** `client/src/lib/role-access.ts` (+ test), `client/src/components/shared/role-link.tsx` (+ test).

**Docs:** `docs/adr/00NN-imkoniyat-rol-emas.md` (+ README row), `docs/role-access.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, the spec's §15.

---

### Task 0: Worktree setup

**Files:** none.

- [ ] **Step 1: Install dependencies**

Run (from the worktree root):
```bash
npm --prefix server install
npm --prefix client install
```
Expected: both finish without errors.

- [ ] **Step 2: Generate the Prisma client**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`.

- [ ] **Step 3: Baseline**

Run: `cd server && npx jest src/common/auth src/common/guards`
Expected: PASS.
Run: `cd client && npx vitest run src/lib`
Expected: PASS.

---

### Task 1: Role ids and the capability catalog

**Files:**
- Create: `server/src/common/auth/role-ids.ts`
- Create: `server/src/common/permissions/permission-catalog.ts`
- Test: `server/src/common/permissions/permission-catalog.spec.ts`
- Modify: `server/src/tasks/task-policy.ts` (lines 7–13: the local `ROLE_ID`)

**Interfaces:**
- Produces: `ROLE_ID` (`CEO: 1 … STUDENT: 6`), `ROLE_NAME_BY_ID: Record<number, string>`, `PERMISSION_SECTIONS`, `PermissionSection`, `PermissionDef`, `PERMISSIONS`, `PermissionKey`, `PERMISSION_KEYS: PermissionKey[]`, `defaultKeysForRoles(roleIds: readonly number[]): Set<PermissionKey>`.

- [ ] **Step 1: Write the failing spec**

`server/src/common/permissions/permission-catalog.spec.ts`:
```ts
import { ROLE_ID } from '../auth/role-ids';
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionDef,
  defaultKeysForRoles,
} from './permission-catalog';

const def = (key: string): PermissionDef =>
  (PERMISSIONS as Record<string, PermissionDef>)[key];

describe('permission catalog', () => {
  it('names every capability section.word or section.word-word', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+(-[a-z]+)*$/);
    }
  });

  it('has 64 capabilities in 14 sections, none of them empty', () => {
    expect(PERMISSION_KEYS).toHaveLength(64);
    expect(PERMISSION_SECTIONS).toHaveLength(14);
    for (const section of PERMISSION_SECTIONS) {
      expect(
        PERMISSION_KEYS.some((key) => def(key).section === section.key),
      ).toBe(true);
    }
  });

  it('requires only capabilities that exist, and never in a circle', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const walk = (key: string, path: string[]) => {
      if (done.has(key)) return;
      if (visiting.has(key)) {
        throw new Error(`cycle: ${[...path, key].join(' -> ')}`);
      }
      visiting.add(key);
      for (const needed of def(key).requires) {
        expect(PERMISSION_KEYS).toContain(needed);
        walk(needed, [...path, key]);
      }
      visiting.delete(key);
      done.add(key);
    };
    for (const key of PERMISSION_KEYS) walk(key, []);
  });

  it('gives every default role the capabilities its defaults require', () => {
    for (const key of PERMISSION_KEYS) {
      for (const role of def(key).defaultRoles) {
        for (const needed of def(key).requires) {
          expect({ key, role, needed, held: def(needed).defaultRoles.includes(role) })
            .toEqual({ key, role, needed, held: true });
        }
      }
    }
  });

  it('keeps English words out of the labels the CEO will read', () => {
    const english =
      /\b(view|manage|create|edit|delete|list|report|settings|dashboard|salary|payment|lead|group|student|teacher|cash)\b/i;
    for (const key of PERMISSION_KEYS) {
      expect(def(key).label).not.toMatch(english);
    }
    for (const section of PERMISSION_SECTIONS) {
      expect(section.label).not.toMatch(english);
    }
  });

  it('gives the CEO every capability, whatever else they hold', () => {
    expect(defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(64);
    expect(defaultKeysForRoles([ROLE_ID.TEACHER, ROLE_ID.CEO]).size).toBe(64);
  });

  it('gives a teacher only their groups and attendance', () => {
    expect([...defaultKeysForRoles([ROLE_ID.TEACHER])].sort()).toEqual([
      'attendance.mark',
      'groups.view',
    ]);
  });

  it('gives a cashier what the cashier screens use today', () => {
    expect([...defaultKeysForRoles([ROLE_ID.CASHIER])].sort()).toEqual([
      'dashboard.view',
      'debt.promise',
      'debt.view',
      'payments.create',
      'payments.view',
      'students.profile',
    ]);
  });

  it('adds up the roles of a multi-role account', () => {
    const adminCashier = defaultKeysForRoles([
      ROLE_ID.ADMINISTRATOR,
      ROLE_ID.CASHIER,
    ]);
    expect(adminCashier.has('students.list')).toBe(true);
    expect(adminCashier.has('payments.create')).toBe(true);
    expect(adminCashier.has('salary.view')).toBe(false);
  });

  it('gives a student or a role-less account nothing', () => {
    expect(defaultKeysForRoles([ROLE_ID.STUDENT]).size).toBe(0);
    expect(defaultKeysForRoles([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/common/permissions/permission-catalog.spec.ts`
Expected: FAIL — `Cannot find module '../auth/role-ids'`.

- [ ] **Step 3: Write `role-ids.ts`**

`server/src/common/auth/role-ids.ts`:
```ts
/**
 * The fixed ids of the `Role` table (seeded, never renumbered). One copy for
 * the whole server: `tasks/task-policy.ts` re-exports it for its callers.
 */
export const ROLE_ID = {
  CEO: 1,
  BRANCH_DIRECTOR: 2,
  ADMINISTRATOR: 3,
  TEACHER: 4,
  CASHIER: 5,
  STUDENT: 6,
} as const;

/** The role names the `Role` table and the token carry. */
export const ROLE_NAME_BY_ID: Record<number, string> = {
  [ROLE_ID.CEO]: 'CEO',
  [ROLE_ID.BRANCH_DIRECTOR]: 'Branch Director',
  [ROLE_ID.ADMINISTRATOR]: 'Administrator',
  [ROLE_ID.TEACHER]: 'Teacher',
  [ROLE_ID.CASHIER]: 'Cashier',
  [ROLE_ID.STUDENT]: 'Student',
};
```

- [ ] **Step 4: Point `task-policy.ts` at it**

In `server/src/tasks/task-policy.ts` replace the local constant (lines 7–13):
```ts
export const ROLE_ID = {
  CEO: 1,
  BRANCH_DIRECTOR: 2,
  ADMINISTRATOR: 3,
  TEACHER: 4,
  CASHIER: 5,
} as const;
```
with:
```ts
import { ROLE_ID } from '../common/auth/role-ids';

export { ROLE_ID };
```
(Move the `import` line to the top of the file with the other imports if the file has any; it has none today.)

- [ ] **Step 5: Write `permission-catalog.ts`**

`server/src/common/permissions/permission-catalog.ts`:
```ts
import { ROLE_ID } from '../auth/role-ids';

/**
 * Every capability ("imkoniyat") a staff role can hold — the single source of
 * truth (spec docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md,
 * section 10). A role answers "who is this?" (portal, rank, branch, own
 * groups); a capability answers "what may they do?".
 *
 * `defaultRoles` is today's behaviour, route by route. In stage 1 nobody can
 * change it, so a non-CEO's capabilities are the union of the defaults of the
 * roles they hold, and the CEO holds every capability, always.
 *
 * `label` is what the CEO will read on the «Ruxsatlar» page (stage 2): Uzbek,
 * no English words. `requires` lists what must also be on for a capability to
 * work; the catalog spec checks that the defaults honour it. `danger` marks
 * an action that moves money or cannot be undone (a red sign on the page).
 */
const D = ROLE_ID.BRANCH_DIRECTOR;
const A = ROLE_ID.ADMINISTRATOR;
const T = ROLE_ID.TEACHER;
const K = ROLE_ID.CASHIER;

export type StaffRoleId = typeof D | typeof A | typeof T | typeof K;

export const PERMISSION_SECTIONS = [
  { key: 'students', label: "O'quvchilar" },
  { key: 'groups', label: 'Guruhlar va davomat' },
  { key: 'leads', label: 'Lidlar' },
  { key: 'outreach', label: 'Aloqa markazi' },
  { key: 'mock', label: 'Mock imtihonlar' },
  { key: 'payments', label: "To'lovlar va qarzdorlik" },
  { key: 'expenses', label: 'Xarajatlar va kassa' },
  { key: 'salary', label: 'Ish haqi' },
  { key: 'reports', label: 'Hisobotlar' },
  { key: 'staff', label: 'Xodimlar' },
  { key: 'comments', label: 'Izohlar' },
  { key: 'settings', label: 'Sozlamalar' },
  { key: 'home', label: 'Bosh sahifa' },
  { key: 'daf', label: 'DaF ilovasi va media' },
] as const;

export type PermissionSection = (typeof PERMISSION_SECTIONS)[number]['key'];

export interface PermissionDef {
  readonly section: PermissionSection;
  readonly label: string;
  readonly defaultRoles: readonly StaffRoleId[];
  readonly requires: readonly string[];
  readonly danger?: 'money' | 'irreversible';
}

export const PERMISSIONS = {
  // O'quvchilar
  'students.list': {
    section: 'students',
    label: "O'quvchilar ro'yxati",
    defaultRoles: [D, A],
    requires: [],
  },
  'students.profile': {
    section: 'students',
    label: "O'quvchi profilini ochish",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'students.details': {
    section: 'students',
    label:
      "O'quvchi profilidagi tablar: to'lovlar, darslar, izohlar, lid tarixi, ilova",
    defaultRoles: [D, A],
    requires: ['students.profile'],
  },
  'students.manage': {
    section: 'students',
    label: "O'quvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
  },
  'students.enroll': {
    section: 'students',
    label: "Guruhga qo'shish va guruhdan chiqarish",
    defaultRoles: [D, A],
    requires: ['students.profile', 'groups.view'],
  },
  'students.sms': {
    section: 'students',
    label: "O'quvchiga SMS yuborish",
    defaultRoles: [D, A],
    requires: ['students.details'],
  },
  'students.initial-balance': {
    section: 'students',
    label: "Boshlang'ich balans kiritish",
    defaultRoles: [],
    requires: ['students.profile'],
    danger: 'money',
  },

  // Guruhlar va davomat
  'groups.view': {
    section: 'groups',
    label: "Guruhlarni ko'rish (o'qituvchi faqat o'z guruhlarini)",
    defaultRoles: [D, A, T],
    requires: [],
  },
  'groups.manage': {
    section: 'groups',
    label: 'Guruh ochish, tahrirlash va yopish',
    defaultRoles: [D, A],
    requires: ['groups.view'],
  },
  'lessons.change': {
    section: 'groups',
    label: "Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish",
    defaultRoles: [D, A],
    requires: ['groups.view'],
  },
  'lessons.change-delete': {
    section: 'groups',
    label: "Bekor qilish, ko'chirish va o'rinbosarni o'chirish",
    defaultRoles: [D],
    requires: ['lessons.change'],
    danger: 'money',
  },
  'attendance.mark': {
    section: 'groups',
    label: 'Davomat olish',
    defaultRoles: [D, A, T],
    requires: ['groups.view'],
  },
  'attendance.fix': {
    section: 'groups',
    label:
      "Kech davomat, «Dars bo'ldimi?» javobi va oldindan aytilgan qoldirish",
    defaultRoles: [D, A],
    requires: ['attendance.mark'],
  },

  // Lidlar
  'leads.view': {
    section: 'leads',
    label: 'Lidlar doskasi',
    defaultRoles: [D, A],
    requires: [],
  },
  'leads.manage': {
    section: 'leads',
    label: "Lid qo'shish, tahrirlash va o'quvchiga aylantirish",
    defaultRoles: [D, A],
    requires: ['leads.view'],
  },
  'leads.setup': {
    section: 'leads',
    label: "Doska ustunlari, bo'limlari va manbalari",
    defaultRoles: [D, A],
    requires: ['leads.view'],
  },
  'leads.forms': {
    section: 'leads',
    label: 'Anketalar va ularning javoblari',
    defaultRoles: [D, A],
    requires: [],
  },

  // Aloqa markazi
  'outreach.view': {
    section: 'outreach',
    label: 'Aloqa markazi sahifasi',
    defaultRoles: [D, A],
    requires: [],
  },
  'calls.log': {
    section: 'outreach',
    label: "Qo'ng'iroq natijasini kiritish",
    defaultRoles: [D, A],
    requires: [],
  },

  // Mock imtihonlar
  'mock.view': {
    section: 'mock',
    label: "Mock imtihonlarni ko'rish",
    defaultRoles: [D, A],
    requires: [],
  },
  'mock.manage': {
    section: 'mock',
    label: "Imtihon yaratish, natija kiritish va e'lon qilish",
    defaultRoles: [D, A],
    requires: ['mock.view'],
  },
  'mock.payments': {
    section: 'mock',
    label: "Mock to'lovini qabul qilish va bekor qilish",
    defaultRoles: [D, A],
    requires: ['mock.view'],
    danger: 'money',
  },

  // To'lovlar va qarzdorlik
  'payments.view': {
    section: 'payments',
    label: "Moliya bo'limi: to'lovlar va kutilayotgan to'lovlar",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'payments.create': {
    section: 'payments',
    label: "To'lov qayd qilish",
    defaultRoles: [D, A, K],
    requires: [],
  },
  'payments.correct': {
    section: 'payments',
    label: "To'lovni tuzatish",
    defaultRoles: [D, A],
    requires: ['students.details'],
    danger: 'money',
  },
  'debt.view': {
    section: 'payments',
    label: 'Qarzdorlik sahifasi',
    defaultRoles: [D, A, K],
    requires: [],
  },
  'debt.promise': {
    section: 'payments',
    label: "To'lov va'dasini yozish",
    defaultRoles: [D, A, K],
    requires: ['debt.view'],
  },
  'balance.withdraw': {
    section: 'payments',
    label: "Balansdagi pulni markaz hisobiga o'tkazish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
    danger: 'money',
  },
  'refunds.create': {
    section: 'payments',
    label: "O'quvchiga pul qaytarish",
    defaultRoles: [D, A],
    requires: ['students.profile'],
    danger: 'money',
  },
  'debt.write-off': {
    section: 'payments',
    label: 'Qarzni kechirish',
    defaultRoles: [D, A],
    requires: ['students.details'],
    danger: 'money',
  },
  'balance.adjust': {
    section: 'payments',
    label: "Balansni qo'lda tuzatish va yechilgan dars pulini qaytarish",
    defaultRoles: [D],
    requires: ['students.details'],
    danger: 'money',
  },
  'money.undo': {
    section: 'payments',
    label: "To'lov, pul qaytarish va qarz kechirishni bekor qilish",
    defaultRoles: [],
    requires: ['students.details'],
    danger: 'money',
  },
  'payments.gateway-log': {
    section: 'payments',
    label: "To'lov tizimlari jurnali (Payme, Click)",
    defaultRoles: [],
    requires: ['payments.view'],
  },

  // Xarajatlar va kassa
  'expenses.view': {
    section: 'expenses',
    label: "Xarajatlarni ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'expenses.manage': {
    section: 'expenses',
    label: "Xarajat kiritish, tahrirlash va o'chirish",
    defaultRoles: [D],
    requires: ['expenses.view'],
    danger: 'money',
  },
  'cash.manage': {
    section: 'expenses',
    label: "Kassa hisoblari va ular orasida o'tkazma",
    defaultRoles: [D],
    requires: [],
    danger: 'money',
  },

  // Ish haqi
  'salary.view': {
    section: 'salary',
    label: "Xodimlar oyligini ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'salary.rate': {
    section: 'salary',
    label: "O'qituvchiga stavka qo'yish",
    defaultRoles: [D],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.pay': {
    section: 'salary',
    label: "Oylik va avans to'lash",
    defaultRoles: [D],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.rate-edit': {
    section: 'salary',
    label: "Stavkani o'zgartirish va umumiy stavka",
    defaultRoles: [],
    requires: ['salary.view'],
    danger: 'money',
  },
  'salary.close': {
    section: 'salary',
    label: 'Oylikni hisoblash, tasdiqlash, oyni yopish va oylik davri',
    defaultRoles: [],
    requires: ['salary.view'],
    danger: 'money',
  },

  // Hisobotlar
  'reports.finance': {
    section: 'reports',
    label: 'Moliya va marketing hisobotlari',
    defaultRoles: [D],
    requires: [],
  },
  'reports.payments': {
    section: 'reports',
    label: "To'lov hisobotlari",
    defaultRoles: [D, A],
    requires: [],
  },
  'reports.students': {
    section: 'reports',
    label: "O'quvchilar, davomat va faoliyat hisobotlari",
    defaultRoles: [D],
    requires: [],
  },
  'reports.leads': {
    section: 'reports',
    label: 'Lidlar hisoboti',
    defaultRoles: [D, A],
    requires: [],
  },

  // Xodimlar
  'teachers.view': {
    section: 'staff',
    label: "O'qituvchilar ro'yxati va profili",
    defaultRoles: [D, A],
    requires: [],
  },
  'teachers.manage': {
    section: 'staff',
    label: "O'qituvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D],
    requires: ['teachers.view'],
  },
  'employees.view': {
    section: 'staff',
    label: "Xodimlar ro'yxati va kartasi",
    defaultRoles: [D],
    requires: [],
  },
  'employees.manage': {
    section: 'staff',
    label: "Xodim qo'shish, tahrirlash va bloklash",
    defaultRoles: [D],
    requires: ['employees.view'],
  },
  'employees.invite': {
    section: 'staff',
    label: 'Telegram orqali xodim taklif qilish',
    defaultRoles: [D, A],
    requires: [],
  },

  // Izohlar
  'comments.write': {
    section: 'comments',
    label: 'Izoh yozish',
    defaultRoles: [D, A],
    requires: [],
  },
  'comments.delete': {
    section: 'comments',
    label: "Boshqalarning izohini tahrirlash va o'chirish",
    defaultRoles: [],
    requires: ['comments.write'],
  },

  // Sozlamalar
  'settings.reference': {
    section: 'settings',
    label: "Kurslar, xonalar, dam olish kunlari va sabablar ro'yxatlari",
    defaultRoles: [D, A],
    requires: [],
  },
  'courses.create': {
    section: 'settings',
    label: "Kurs ochish va to'lov turini tanlash",
    defaultRoles: [D],
    requires: ['settings.reference'],
  },
  'settings.branches': {
    section: 'settings',
    label: 'Filiallar',
    defaultRoles: [D],
    requires: [],
  },
  'settings.payment': {
    section: 'settings',
    label: "To'lov sozlamalari (filial qismi)",
    defaultRoles: [D],
    requires: [],
  },
  'settings.telegram-groups': {
    section: 'settings',
    label: 'Telegram guruhlarini tasdiqlash va sozlash',
    defaultRoles: [D],
    requires: [],
  },
  'settings.absence-pause': {
    section: 'settings',
    label: "Avtomatik pauza sozlamasini ko'rish",
    defaultRoles: [D],
    requires: [],
  },
  'telegram.announce': {
    section: 'settings',
    label: "Telegram guruhlariga e'lon yuborish va botni guruhdan uzish",
    defaultRoles: [],
    requires: ['settings.telegram-groups'],
  },
  'settings.company': {
    section: 'settings',
    label: 'Kompaniya darajasidagi sozlamalar',
    defaultRoles: [],
    requires: [],
  },
  'settings.archive': {
    section: 'settings',
    label: "Arxiv: tiklash va butunlay o'chirish",
    defaultRoles: [],
    requires: [],
    danger: 'irreversible',
  },

  // Bosh sahifa
  'dashboard.view': {
    section: 'home',
    label: 'Bosh sahifa paneli',
    defaultRoles: [D, A, K],
    requires: [],
  },

  // DaF ilovasi va media
  'daf.activity': {
    section: 'daf',
    label: "DaF ilovasi: markaz bo'yicha faollik",
    defaultRoles: [D, A],
    requires: [],
  },
  'media.view': {
    section: 'daf',
    label: 'Media',
    defaultRoles: [D, A],
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * The capabilities a set of role ids holds by default. The CEO holds every
 * capability; a student or a role-less account holds none.
 */
export function defaultKeysForRoles(
  roleIds: readonly number[],
): Set<PermissionKey> {
  if (roleIds.includes(ROLE_ID.CEO)) return new Set(PERMISSION_KEYS);
  const keys = new Set<PermissionKey>();
  for (const key of PERMISSION_KEYS) {
    const def: PermissionDef = PERMISSIONS[key];
    if (def.defaultRoles.some((role) => roleIds.includes(role))) keys.add(key);
  }
  return keys;
}
```

- [ ] **Step 6: Run the spec to verify it passes**

Run: `cd server && npx jest src/common/permissions/permission-catalog.spec.ts src/tasks`
Expected: PASS (the task specs still find `ROLE_ID` through the re-export).

- [ ] **Step 7: Format, type-check, commit**

```bash
cd server
npx prettier --write src/common/auth/role-ids.ts src/common/permissions/permission-catalog.ts src/common/permissions/permission-catalog.spec.ts src/tasks/task-policy.ts
npm run typecheck
git add src/common/auth/role-ids.ts src/common/permissions src/tasks/task-policy.ts
git commit -m "feat(permissions): capability catalog with today's role defaults

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Route inventory reads access markers; snapshot of today's access

**Files:**
- Create: `server/src/common/permissions/route-access.ts`
- Test: `server/src/common/permissions/route-access.spec.ts`
- Modify: `server/scripts/route-inventory.ts` (the `DiscoveredRoute` interface, `stringArgs`, `discoverRoutes`)
- Create: `server/scripts/route-access-snapshot.ts`
- Create (generated): `server/src/common/permissions/route-access.snapshot.json`

**Interfaces:**
- Consumes: `PERMISSIONS`, `PermissionDef` (Task 1), `ROLE_NAME_BY_ID` (Task 1).
- Produces:
  - `RouteAccess` (in `route-inventory.ts`): `{ kind: 'public' } | { kind: 'anyUser' } | { kind: 'anyStaff' } | { kind: 'student' } | { kind: 'can'; keys: string[] } | { kind: 'roles'; roles: string[] } | { kind: 'none' }`.
  - `DiscoveredRoute.access: RouteAccess` and `DiscoveredRoute.accessMarkers: { handler: string[]; controller: string[] }`; the old `roles` field is removed.
  - `AccessSummary = 'PUBLIC' | 'ANY' | string[]`, `AccessLike = { kind: string; keys?: readonly string[]; roles?: readonly string[] }`, `STAFF_ROLE_NAMES`, `accessSummary(access: AccessLike): AccessSummary`.

- [ ] **Step 1: Write the failing spec for `accessSummary`**

`server/src/common/permissions/route-access.spec.ts`:
```ts
import { accessSummary } from './route-access';

describe('accessSummary', () => {
  it('writes a public route and an any-account route the snapshot way', () => {
    expect(accessSummary({ kind: 'public' })).toBe('PUBLIC');
    expect(accessSummary({ kind: 'anyUser' })).toBe('ANY');
    // A legacy route with no @Roles admitted any signed-in account.
    expect(accessSummary({ kind: 'none' })).toBe('ANY');
  });

  it('lists the student and the five staff roles', () => {
    expect(accessSummary({ kind: 'student' })).toEqual(['Student']);
    expect(accessSummary({ kind: 'anyStaff' })).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Cashier',
      'Teacher',
    ]);
  });

  it('sorts a legacy @Roles list and drops repeats', () => {
    expect(
      accessSummary({
        kind: 'roles',
        roles: ['CEO', 'Branch Director', 'CEO'],
      }),
    ).toEqual(['Branch Director', 'CEO']);
  });

  it('turns capabilities into the CEO plus the union of their defaults', () => {
    expect(accessSummary({ kind: 'can', keys: ['expenses.view'] })).toEqual([
      'Branch Director',
      'CEO',
    ]);
    expect(
      accessSummary({ kind: 'can', keys: ['students.list', 'groups.view'] }),
    ).toEqual(['Administrator', 'Branch Director', 'CEO', 'Teacher']);
    expect(accessSummary({ kind: 'can', keys: ['money.undo'] })).toEqual([
      'CEO',
    ]);
  });

  it('refuses a capability the catalog does not know', () => {
    expect(() => accessSummary({ kind: 'can', keys: ['no.such'] })).toThrow(
      'Unknown capability "no.such"',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/common/permissions/route-access.spec.ts`
Expected: FAIL — `Cannot find module './route-access'`.

- [ ] **Step 3: Write `route-access.ts`**

`server/src/common/permissions/route-access.ts`:
```ts
import { ROLE_NAME_BY_ID } from '../auth/role-ids';
import { PERMISSIONS, PermissionDef } from './permission-catalog';

/**
 * What a route admits by default, written the way `@Roles(...)` used to say
 * it: `'PUBLIC'`, `'ANY'` (any signed-in account) or a sorted list of role
 * names. The equivalence spec compares this with the snapshot of `main` taken
 * before the conversion (`route-access.snapshot.json`).
 */
export type AccessSummary = 'PUBLIC' | 'ANY' | string[];

/** The shape both the route inventory and the decorator metadata share. */
export interface AccessLike {
  kind: string;
  keys?: readonly string[];
  roles?: readonly string[];
}

export const STAFF_ROLE_NAMES = [
  'Administrator',
  'Branch Director',
  'CEO',
  'Cashier',
  'Teacher',
];

export function accessSummary(access: AccessLike): AccessSummary {
  switch (access.kind) {
    case 'public':
      return 'PUBLIC';
    case 'anyUser':
    case 'none':
      return 'ANY';
    case 'student':
      return ['Student'];
    case 'anyStaff':
      return [...STAFF_ROLE_NAMES];
    case 'roles':
      return [...new Set(access.roles ?? [])].sort();
    case 'can': {
      const names = new Set<string>(['CEO']);
      for (const key of access.keys ?? []) {
        const def = (PERMISSIONS as Record<string, PermissionDef>)[key];
        if (!def) throw new Error(`Unknown capability "${key}"`);
        for (const role of def.defaultRoles) names.add(ROLE_NAME_BY_ID[role]);
      }
      return [...names].sort();
    }
    default:
      throw new Error(`Unknown access kind "${access.kind}"`);
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd server && npx jest src/common/permissions/route-access.spec.ts`
Expected: PASS.

- [ ] **Step 5: Teach the route inventory the access markers**

In `server/scripts/route-inventory.ts`:

(a) Replace the `roles` field of `DiscoveredRoute`:
```ts
  /** Role names from `@Roles(...)` on the handler, else on the controller. */
  roles: string[];
```
with:
```ts
  /** What admits a caller: handler marker first, then the controller's. */
  access: RouteAccess;
  /** Every access marker found, per level — the manifest allows one per route. */
  accessMarkers: { handler: string[]; controller: string[] };
```
and add above the interface:
```ts
export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'anyUser' }
  | { kind: 'anyStaff' }
  | { kind: 'student' }
  | { kind: 'can'; keys: string[] }
  /** Legacy `@Roles(...)`; gone after the conversion. */
  | { kind: 'roles'; roles: string[] }
  /** No marker at all: a legacy route open to any signed-in account. */
  | { kind: 'none' };

const ACCESS_DECORATORS = ['AnyUser', 'AnyStaff', 'StudentOnly', 'Can', 'Roles'];

/** What `...STAFF_ROLES` spreads to (`common/decorators/staff-roles.ts`). */
const STAFF_ROLE_NAMES = [
  'CEO',
  'Branch Director',
  'Administrator',
  'Teacher',
  'Cashier',
];
```

(b) Replace `stringArgs` with:
```ts
function stringArgs(d: ts.Decorator): string[] {
  const args = decoratorArgs(d);
  if (!args) return [];
  const out: string[] = [];
  for (const a of args) {
    if (ts.isStringLiteral(a)) out.push(a.text);
    // `@Roles(...STAFF_ROLES)` is the only spread the code base uses.
    else if (
      ts.isSpreadElement(a) &&
      ts.isIdentifier(a.expression) &&
      a.expression.text === 'STAFF_ROLES'
    ) {
      out.push(...STAFF_ROLE_NAMES);
    }
  }
  return out;
}

/** The access marker on one node (handler or class), if any. */
function accessOf(decorators: readonly ts.Decorator[]): {
  access: RouteAccess | null;
  markers: string[];
} {
  const markers = decorators
    .map(decoratorName)
    .filter((n): n is string => n !== null && ACCESS_DECORATORS.includes(n));
  const dec = decorators.find((d) => markers.includes(decoratorName(d) ?? ''));
  if (!dec) return { access: null, markers };
  switch (decoratorName(dec)) {
    case 'AnyUser':
      return { access: { kind: 'anyUser' }, markers };
    case 'AnyStaff':
      return { access: { kind: 'anyStaff' }, markers };
    case 'StudentOnly':
      return { access: { kind: 'student' }, markers };
    case 'Can':
      return { access: { kind: 'can', keys: stringArgs(dec) }, markers };
    default:
      return { access: { kind: 'roles', roles: stringArgs(dec) }, markers };
  }
}
```

(c) In `discoverRoutes`, replace the two class-level lines
```ts
      const classRolesDec = classDecorators.find((d) => decoratorName(d) === 'Roles');
      const classRoles = classRolesDec ? stringArgs(classRolesDec) : [];
```
with:
```ts
      const classAccess = accessOf(classDecorators);
```
replace the member-level line
```ts
        const rolesDec = memberDecorators.find((d) => decoratorName(d) === 'Roles');
```
with:
```ts
        const memberAccess = accessOf(memberDecorators);
```
and replace the pushed `roles: rolesDec ? stringArgs(rolesDec) : classRoles,` with:
```ts
            access: isPublic
              ? { kind: 'public' }
              : (memberAccess.access ?? classAccess.access ?? { kind: 'none' }),
            accessMarkers: {
              handler: memberAccess.markers,
              controller: classAccess.markers,
            },
```

- [ ] **Step 6: Run the branch-policy spec (it reads the inventory)**

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS (it never read `roles`).

- [ ] **Step 7: Write the snapshot script**

`server/scripts/route-access-snapshot.ts`:
```ts
/**
 * Writes what every route admits TODAY, before `@Roles` is replaced by
 * capability markers (spec 2026-10-05 §7.6). Run it once, on the commit
 * before the conversion; `permission-routes.spec.ts` compares against the
 * file it writes from then on.
 *
 *   npx ts-node --transpile-only scripts/route-access-snapshot.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { accessSummary } from '../src/common/permissions/route-access';
import { discoverRoutes } from './route-inventory';

// The server package root, as `branch-route-policy.spec.ts` uses it.
const serverRoot = join(__dirname, '..');
const routes = discoverRoutes(join(serverRoot, 'src'), serverRoot);
const snapshot: Record<string, unknown> = {};
for (const route of routes) snapshot[route.key] = accessSummary(route.access);

writeFileSync(
  join(serverRoot, 'src', 'common', 'permissions', 'route-access.snapshot.json'),
  JSON.stringify(snapshot, null, 2) + '\n',
);
console.log(`${routes.length} routes written`);
```

- [ ] **Step 8: Generate the snapshot and check its shape**

Run: `cd server && npx ts-node --transpile-only scripts/route-access-snapshot.ts`
Expected: `453 routes written` (or the current count if `main` gained routes since 2026-10-10 — then the distribution below grows accordingly; stop and re-check Appendix B for the new routes before continuing).

Run:
```bash
cd server && node -e "const s=require('./src/common/permissions/route-access.snapshot.json');const c={};for(const v of Object.values(s)){const k=Array.isArray(v)?v.join('+'):v;c[k]=(c[k]||0)+1}console.log(c)"
```
Expected (2026-10-10 `main`):
```
PUBLIC 24 · ANY 15 · Student 39 · CEO 23 · Branch Director+CEO 68 ·
Administrator+Branch Director+CEO 200 · Administrator+Branch Director+CEO+Teacher 22 ·
Administrator+Branch Director+CEO+Cashier 33 · Administrator+Branch Director+CEO+Cashier+Teacher 29
```

- [ ] **Step 9: Format and commit**

```bash
cd server
npx prettier --write scripts/route-inventory.ts scripts/route-access-snapshot.ts src/common/permissions/route-access.ts src/common/permissions/route-access.spec.ts
npm run typecheck
git add scripts/route-inventory.ts scripts/route-access-snapshot.ts src/common/permissions
git commit -m "feat(permissions): route inventory reads access markers; snapshot of today's route access

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Access markers and spec helpers

**Files:**
- Create: `server/src/common/permissions/access.decorators.ts`
- Create: `server/src/common/permissions/testing.ts`
- Test: `server/src/common/permissions/testing.spec.ts`

**Interfaces:**
- Consumes: `PermissionKey` (Task 1), `accessSummary`, `AccessLike`, `AccessSummary` (Task 2), `IS_PUBLIC_KEY` (`common/decorators/public.decorator.ts`).
- Produces: `ACCESS_KEY = 'access'`, `RouteAccessMeta`, `AnyUser()`, `AnyStaff()`, `StudentOnly()`, `Can(first, ...rest)`, `routeAccess(controller, method): AccessLike`, `defaultRolesOf(controller, method): AccessSummary`.

- [ ] **Step 1: Write the failing spec**

`server/src/common/permissions/testing.spec.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { AnyStaff, Can, StudentOnly } from './access.decorators';
import { defaultRolesOf, routeAccess } from './testing';

@Controller('demo')
@Can('expenses.view')
class DemoController {
  @Get()
  list() {}

  @Get('own')
  @AnyStaff()
  own() {}

  @Get('portal')
  @StudentOnly()
  portal() {}

  @Get('open')
  @Public()
  open() {}

  @Get('either')
  @Can('students.list', 'groups.view')
  either() {}
}

describe('access markers', () => {
  it('reads the handler first, then the controller', () => {
    expect(routeAccess(DemoController, 'list')).toEqual({
      kind: 'can',
      keys: ['expenses.view'],
    });
    expect(routeAccess(DemoController, 'own')).toEqual({ kind: 'anyStaff' });
    expect(routeAccess(DemoController, 'portal')).toEqual({ kind: 'student' });
  });

  it('lets @Public win over any marker', () => {
    expect(routeAccess(DemoController, 'open')).toEqual({ kind: 'public' });
  });

  it('writes the default access the way @Roles used to', () => {
    expect(defaultRolesOf(DemoController, 'list')).toEqual([
      'Branch Director',
      'CEO',
    ]);
    expect(defaultRolesOf(DemoController, 'either')).toEqual([
      'Administrator',
      'Branch Director',
      'CEO',
      'Teacher',
    ]);
  });

  it('refuses a name that is not a handler', () => {
    expect(() => routeAccess(DemoController, 'missing')).toThrow(
      'DemoController.missing is not a method',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/common/permissions/testing.spec.ts`
Expected: FAIL — `Cannot find module './access.decorators'`.

- [ ] **Step 3: Write `access.decorators.ts`**

```ts
import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from './permission-catalog';

/**
 * Every route carries exactly one of these (or `@Public()`); the manifest in
 * `permission-routes.spec.ts` fails the build on a route with none or two.
 * `PermissionGuard` reads the handler's marker first, then the controller's.
 */
export const ACCESS_KEY = 'access';

export type RouteAccessMeta =
  | { readonly kind: 'anyUser' }
  | { readonly kind: 'anyStaff' }
  | { readonly kind: 'student' }
  | { readonly kind: 'can'; readonly keys: readonly PermissionKey[] };

/** Any signed-in account, staff or student; the handler serves the caller's own data. */
export const AnyUser = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'anyUser' });

/**
 * Any staff account (roles 1–5): reference lists every screen needs, the
 * caller's own data, and tasks (whose ladder lives in `tasks/task-policy.ts`).
 */
export const AnyStaff = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'anyStaff' });

/** The student portal (role 6). */
export const StudentOnly = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'student' });

/**
 * Allowed when the caller holds ANY of the listed capabilities. List every
 * screen's capability that calls the route, so turning one screen off never
 * breaks another (spec §7.4). The CEO holds every capability.
 */
export const Can = (first: PermissionKey, ...rest: PermissionKey[]) =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, {
    kind: 'can',
    keys: [first, ...rest],
  });
```

- [ ] **Step 4: Write `testing.ts`**

```ts
import 'reflect-metadata';
import type { Type } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { AccessLike, AccessSummary, accessSummary } from './route-access';

/**
 * Spec helpers for controller specs: a controller's guard test asserts the
 * marker a route carries and the roles it admits by default — what
 * `reflector.get(ROLES_KEY, …)` and `RolesGuard.canActivate` used to show.
 */
export function routeAccess(
  controller: Type<unknown>,
  method: string,
): AccessLike {
  const handler = (controller.prototype as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`${controller.name}.${method} is not a method`);
  }
  if (
    Reflect.getMetadata(IS_PUBLIC_KEY, handler) ||
    Reflect.getMetadata(IS_PUBLIC_KEY, controller)
  ) {
    return { kind: 'public' };
  }
  const meta = (Reflect.getMetadata(ACCESS_KEY, handler) ??
    Reflect.getMetadata(ACCESS_KEY, controller)) as RouteAccessMeta | undefined;
  return meta ?? { kind: 'none' };
}

/** The role names a route admits with the catalog's defaults, sorted. */
export function defaultRolesOf(
  controller: Type<unknown>,
  method: string,
): AccessSummary {
  return accessSummary(routeAccess(controller, method));
}
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `cd server && npx jest src/common/permissions/testing.spec.ts`
Expected: PASS.

- [ ] **Step 6: Format, type-check, commit**

```bash
cd server
npx prettier --write src/common/permissions/access.decorators.ts src/common/permissions/testing.ts src/common/permissions/testing.spec.ts
npm run typecheck
git add src/common/permissions
git commit -m "feat(permissions): route access markers and controller-spec helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `PermissionsService` — roles from the database, capabilities from the catalog

**Files:**
- Create: `server/src/common/permissions/permissions.service.ts`
- Test: `server/src/common/permissions/permissions.service.spec.ts`
- Create: `server/src/common/permissions/permissions.module.ts`
- Modify: `server/src/common/permissions/testing.ts` (add `fakePermissions`)
- Modify: `server/src/app.module.ts` (imports)

**Interfaces:**
- Consumes: `defaultKeysForRoles`, `PermissionKey` (Task 1); `whereUserMayAct()` (`common/auth/blocked-user.ts`); `PrismaService`.
- Produces: `CallerAccess { roleIds: readonly number[]; roleNames: readonly string[]; keys: ReadonlySet<PermissionKey> }`, `PermissionsService.forUser(userId): Promise<CallerAccess>`, `PermissionsService.has(userId, key): Promise<boolean>`, `PermissionsService.CACHE_MS = 10_000`, `PermissionsModule` (global), `fakePermissions(roleIds): PermissionsService`.

- [ ] **Step 1: Write the failing spec**

`server/src/common/permissions/permissions.service.spec.ts`:
```ts
import { PermissionsService } from './permissions.service';

function prismaReturning(rows: Array<{ id: number; name: string }> | null) {
  return {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          rows === null ? null : { roles: rows.map((role) => ({ role })) },
        ),
    },
  };
}

describe('PermissionsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the roles from the database for an account that may act', async () => {
    const prisma = prismaReturning([{ id: 4, name: 'Teacher' }]);
    const service = new PermissionsService(prisma as never);

    const access = await service.forUser(10500);

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: 10500,
        deletedAt: null,
        status: { notIn: expect.any(Array) },
      },
      select: {
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    expect(access.roleNames).toEqual(['Teacher']);
    expect([...access.keys].sort()).toEqual(['attendance.mark', 'groups.view']);
  });

  it('gives the CEO every capability', async () => {
    const service = new PermissionsService(
      prismaReturning([{ id: 1, name: 'CEO' }]) as never,
    );
    expect((await service.forUser(10001)).keys.size).toBe(64);
  });

  it('gives a blocked, archived or unknown account nothing', async () => {
    const service = new PermissionsService(prismaReturning(null) as never);
    const access = await service.forUser(10002);
    expect(access.roleIds).toEqual([]);
    expect(access.keys.size).toBe(0);
  });

  it('answers from memory for ten seconds, then asks the database again', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await service.forUser(10003);
    now.mockReturnValue(1_000_000 + PermissionsService.CACHE_MS - 1);
    await service.forUser(10003);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);

    now.mockReturnValue(1_000_000 + PermissionsService.CACHE_MS);
    await service.forUser(10003);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('answers a single capability', async () => {
    const service = new PermissionsService(
      prismaReturning([{ id: 5, name: 'Cashier' }]) as never,
    );
    expect(await service.has(10004, 'payments.create')).toBe(true);
    expect(await service.has(10004, 'payments.correct')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/common/permissions/permissions.service.spec.ts`
Expected: FAIL — `Cannot find module './permissions.service'`.

- [ ] **Step 3: Write the service**

`server/src/common/permissions/permissions.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereUserMayAct } from '../auth/blocked-user';
import { PermissionKey, defaultKeysForRoles } from './permission-catalog';

/** Who the caller is now, and what they may do. */
export interface CallerAccess {
  readonly roleIds: readonly number[];
  readonly roleNames: readonly string[];
  readonly keys: ReadonlySet<PermissionKey>;
}

const NO_ACCESS: CallerAccess = {
  roleIds: [],
  roleNames: [],
  keys: new Set(),
};

/**
 * The caller's capabilities (spec §3, §7.3). Roles come from the DATABASE,
 * never the token: a token keeps its roles for an hour (ADR-0028), and a role
 * taken away must stop working on the next request. An archived or blocked
 * account (`whereUserMayAct()`) holds nothing, even while Redis is down.
 *
 * Stage 1: capabilities are the catalog's defaults for the roles held. Stage
 * 2 adds the CEO's overrides here, and only here.
 */
@Injectable()
export class PermissionsService {
  // ponytail: per-process cache with a 10 s lifetime; add a Redis version key
  // when several server instances must agree sooner (spec §7.3).
  static readonly CACHE_MS = 10_000;
  private readonly cache = new Map<
    number,
    { at: number; access: CallerAccess }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: number): Promise<CallerAccess> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < PermissionsService.CACHE_MS) return hit.access;

    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: {
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    const roles = user?.roles.map((r) => r.role) ?? [];
    const access: CallerAccess =
      roles.length === 0
        ? NO_ACCESS
        : {
            roleIds: roles.map((r) => r.id),
            roleNames: roles.map((r) => r.name),
            keys: defaultKeysForRoles(roles.map((r) => r.id)),
          };
    this.cache.set(userId, { at: now, access });
    return access;
  }

  async has(userId: number, key: PermissionKey): Promise<boolean> {
    return (await this.forUser(userId)).keys.has(key);
  }
}
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `cd server && npx jest src/common/permissions/permissions.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add `fakePermissions` to `testing.ts`**

Append to `server/src/common/permissions/testing.ts`:
```ts
import { ROLE_NAME_BY_ID } from '../auth/role-ids';
import { PermissionKey, defaultKeysForRoles } from './permission-catalog';
import type { CallerAccess, PermissionsService } from './permissions.service';

/**
 * A `PermissionsService` stand-in for unit specs: every caller holds
 * `roleIds`, with the catalog's default capabilities. Plain functions, no
 * `jest.fn`: this file is compiled with the application, where Jest's
 * globals do not exist.
 */
export function fakePermissions(roleIds: number[]): PermissionsService {
  const access: CallerAccess = {
    roleIds,
    roleNames: roleIds.map((id) => ROLE_NAME_BY_ID[id]),
    keys: defaultKeysForRoles(roleIds),
  };
  return {
    forUser: () => Promise.resolve(access),
    has: (_userId: number, key: PermissionKey) =>
      Promise.resolve(access.keys.has(key)),
  } as unknown as PermissionsService;
}
```
(Keep all imports at the top of the file.) A spec that needs call counts wraps it: `jest.spyOn(fake, 'has')`.

- [ ] **Step 6: Write the module and register it**

`server/src/common/permissions/permissions.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';

/** Global: services anywhere may ask `PermissionsService.has(...)`. */
@Global()
@Module({
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
```
In `server/src/app.module.ts` add `import { PermissionsModule } from './common/permissions/permissions.module';` and put `PermissionsModule,` first in the `imports` array.

- [ ] **Step 7: Format, type-check, commit**

```bash
cd server
npx prettier --write src/common/permissions/permissions.service.ts src/common/permissions/permissions.service.spec.ts src/common/permissions/permissions.module.ts src/common/permissions/testing.ts src/app.module.ts
npm run typecheck
git add src/common/permissions src/app.module.ts
git commit -m "feat(permissions): PermissionsService reads roles from the database

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The global `PermissionGuard` and `GET /permissions/me`

**Files:**
- Create: `server/src/common/permissions/permission.guard.ts`
- Test: `server/src/common/permissions/permission.guard.spec.ts`
- Create: `server/src/common/permissions/permissions.controller.ts`
- Test: `server/src/common/permissions/permissions.controller.spec.ts`
- Modify: `server/src/common/permissions/permissions.module.ts` (controllers)
- Modify: `server/src/app.module.ts` (APP_GUARD order)
- Modify: `server/src/common/auth/branch-route-policy.ts` (classify the new route)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (add the new route)

**Interfaces:**
- Consumes: `ACCESS_KEY`, `RouteAccessMeta`, `AnyUser` (Task 3); `PermissionsService`, `CallerAccess` (Task 4); `IS_PUBLIC_KEY`; `ROLE_ID` (Task 1).
- Produces: `PermissionGuard`, `allows(access: RouteAccessMeta, caller: CallerAccess): boolean`, `FORBIDDEN_MESSAGE = "Sizga bu amalni bajarishga ruxsat yo'q"`, route `GET /permissions/me` → `{ keys: PermissionKey[] }`.

- [ ] **Step 1: Write the failing guard spec**

`server/src/common/permissions/permission.guard.spec.ts`:
```ts
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { PermissionGuard } from './permission.guard';
import { fakePermissions } from './testing';

function contextFor(
  meta: { access?: RouteAccessMeta; isPublic?: boolean },
  user: { id?: number; roles?: string[] } | undefined,
) {
  const handler = () => undefined;
  if (meta.access) Reflect.defineMetadata(ACCESS_KEY, meta.access, handler);
  if (meta.isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const request = { user };
  return {
    request,
    context: {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class Plain {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as never,
  };
}

const guardFor = (roleIds: number[]) =>
  new PermissionGuard(new Reflector(), fakePermissions(roleIds));

describe('PermissionGuard', () => {
  it('lets a public route through without asking anyone', async () => {
    const { context } = contextFor({ isPublic: true }, undefined);
    await expect(guardFor([]).canActivate(context)).resolves.toBe(true);
  });

  it('replaces the token roles with the roles in the database', async () => {
    const { context, request } = contextFor(
      { access: { kind: 'anyUser' } },
      { id: 10010, roles: ['CEO'] },
    );
    await guardFor([3]).canActivate(context);
    expect(request.user?.roles).toEqual(['Administrator']);
  });

  it('admits a capability holder and refuses everyone else', async () => {
    const access: RouteAccessMeta = { kind: 'can', keys: ['expenses.view'] };
    const allowed = contextFor({ access }, { id: 1 });
    await expect(guardFor([2]).canActivate(allowed.context)).resolves.toBe(true);

    const refused = contextFor({ access }, { id: 2 });
    await expect(guardFor([3]).canActivate(refused.context)).rejects.toThrow(
      new ForbiddenException("Sizga bu amalni bajarishga ruxsat yo'q"),
    );
  });

  it('admits on ANY of the listed capabilities', async () => {
    const access: RouteAccessMeta = {
      kind: 'can',
      keys: ['students.list', 'groups.view'],
    };
    const { context } = contextFor({ access }, { id: 3 });
    await expect(guardFor([4]).canActivate(context)).resolves.toBe(true);
  });

  it('keeps students out of staff routes and staff out of the portal', async () => {
    const staff = contextFor({ access: { kind: 'anyStaff' } }, { id: 4 });
    await expect(guardFor([6]).canActivate(staff.context)).rejects.toThrow(
      ForbiddenException,
    );
    const portal = contextFor({ access: { kind: 'student' } }, { id: 5 });
    await expect(guardFor([1]).canActivate(portal.context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('leaves a route without a marker to the legacy RolesGuard (transition)', async () => {
    const { context } = contextFor({}, { id: 6 });
    await expect(guardFor([]).canActivate(context)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd server && npx jest src/common/permissions/permission.guard.spec.ts`
Expected: FAIL — `Cannot find module './permission.guard'`.

- [ ] **Step 3: Write the guard**

`server/src/common/permissions/permission.guard.ts`:
```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLE_ID } from '../auth/role-ids';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { CallerAccess, PermissionsService } from './permissions.service';

export const FORBIDDEN_MESSAGE = "Sizga bu amalni bajarishga ruxsat yo'q";

const STAFF_ROLE_IDS: readonly number[] = [
  ROLE_ID.CEO,
  ROLE_ID.BRANCH_DIRECTOR,
  ROLE_ID.ADMINISTRATOR,
  ROLE_ID.TEACHER,
  ROLE_ID.CASHIER,
];

/** The whole decision, pure: does this caller pass this route's marker? */
export function allows(access: RouteAccessMeta, caller: CallerAccess): boolean {
  switch (access.kind) {
    case 'anyUser':
      return true;
    case 'anyStaff':
      return caller.roleIds.some((id) => STAFF_ROLE_IDS.includes(id));
    case 'student':
      return caller.roleIds.includes(ROLE_ID.STUDENT);
    case 'can':
      return access.keys.some((key) => caller.keys.has(key));
  }
}

/**
 * Registered as an APP_GUARD after `JwtAuthGuard` (so `request.user` exists)
 * and before `BranchScopeGuard`. Two jobs:
 *
 * 1. Replace `request.user.roles` with the roles the DATABASE holds now, so
 *    every later check — `@CurrentUser('roles')`, branch scope, rank rules —
 *    sees the account as it is, not as it was when the token was signed.
 * 2. Check the route's marker (`@Can`, `@AnyStaff`, `@AnyUser`,
 *    `@StudentOnly`) against the caller's capabilities.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id?: number; roles?: string[] } }>();
    const user = request.user;
    // A non-public route with no user was already refused by JwtAuthGuard.
    if (user?.id == null) return true;

    const caller = await this.permissions.forUser(user.id);
    user.roles = [...caller.roleNames];

    const access = this.reflector.getAllAndOverride<
      RouteAccessMeta | undefined
    >(ACCESS_KEY, targets);
    // Transition: a route still on `@Roles` is checked by RolesGuard. Task 14
    // turns this into a refusal once no such route is left.
    if (!access) return true;
    if (allows(access, caller)) return true;
    throw new ForbiddenException(FORBIDDEN_MESSAGE);
  }
}
```

- [ ] **Step 4: Run the guard spec to verify it passes**

Run: `cd server && npx jest src/common/permissions/permission.guard.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the controller spec**

`server/src/common/permissions/permissions.controller.spec.ts`:
```ts
import { PermissionsController } from './permissions.controller';
import { defaultRolesOf, fakePermissions } from './testing';

describe('PermissionsController', () => {
  it('returns the caller own capabilities, sorted', async () => {
    const controller = new PermissionsController(fakePermissions([4]));
    await expect(controller.me(10020)).resolves.toEqual({
      keys: ['attendance.mark', 'groups.view'],
    });
  });

  it('answers any signed-in account', () => {
    expect(defaultRolesOf(PermissionsController, 'me')).toBe('ANY');
  });
});
```

- [ ] **Step 6: Write the controller and wire it**

`server/src/common/permissions/permissions.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AnyUser } from './access.decorators';
import { PermissionsService } from './permissions.service';

/**
 * The caller's own capabilities, for the client to hide what they may not
 * use. Not under `/auth/`: the client's interceptor refreshes an expired
 * token for every path except `/auth/*` (spec §7.7).
 */
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('me')
  @AnyUser()
  async me(@CurrentUser('id') userId: number) {
    const { keys } = await this.permissions.forUser(userId);
    return { keys: [...keys].sort() };
  }
}
```
In `permissions.module.ts` add `controllers: [PermissionsController],` (import it).

- [ ] **Step 7: Register the guard between the two existing guards**

In `server/src/app.module.ts` `providers`, between the `JwtAuthGuard` entry and the `BranchScopeGuard` comment, insert:
```ts
    // Runs after JwtAuthGuard (`request.user` exists) and before
    // BranchScopeGuard: it refreshes `request.user.roles` from the database
    // and checks the route's capability marker (spec 2026-10-05 §7.4).
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
```
and import `PermissionGuard` from `./common/permissions/permission.guard`.

- [ ] **Step 8: Classify the new route and add it to the snapshot**

In `server/src/common/auth/branch-route-policy.ts`, add a block to `ROUTE_POLICIES` right after the `SELF` block that lists the `/salary/me/*` routes:
```ts
  {
    policy: 'SELF',
    reason:
      "The caller's own capability list, read through " +
      "`PermissionsService.forUser(@CurrentUser('id'))`. No branch question.",
    routes: ['GET /permissions/me'],
  },
```
In `server/src/common/permissions/route-access.snapshot.json` add (keep the keys sorted; the file is plain JSON):
```json
  "GET /permissions/me": "ANY",
```

- [ ] **Step 9: Run the permission and branch-policy specs**

Run: `cd server && npx jest src/common/permissions src/common/auth/branch-route-policy.spec.ts`
Expected: PASS.

- [ ] **Step 10: Run the whole server suite once**

Run: `cd server && npm test`
Expected: PASS — nothing is converted yet, the guard only refreshes `request.user.roles` and lets unmarked routes through.

- [ ] **Step 11: Format, type-check, commit**

```bash
cd server
npx prettier --write src/common/permissions src/app.module.ts src/common/auth/branch-route-policy.ts
npm run typecheck
git add src/common/permissions src/app.module.ts src/common/auth/branch-route-policy.ts
git commit -m "feat(permissions): global PermissionGuard and GET /permissions/me

The guard refreshes request.user.roles from the database on every request,
so a removed role stops working on the next request instead of within the
hour (closes the gap ADR-0028 left open).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The equivalence spec and the intentional changes

**Files:**
- Create: `server/src/common/permissions/intentional-access-changes.ts`
- Create: `server/src/common/permissions/permission-routes.spec.ts`

**Interfaces:**
- Consumes: `discoverRoutes` (Task 2), `accessSummary`, `AccessSummary` (Task 2), `route-access.snapshot.json`.
- Produces: `AccessChange { add?: string[]; remove?: string[]; reason: string }`, `INTENTIONAL_ACCESS_CHANGES: Record<string, AccessChange>` (Appendix C).

- [ ] **Step 1: Write `intentional-access-changes.ts`**

Copy the code block of **Appendix C** verbatim into `server/src/common/permissions/intentional-access-changes.ts`.

- [ ] **Step 2: Write the spec**

`server/src/common/permissions/permission-routes.spec.ts`:
```ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { discoverRoutes } from '../../../scripts/route-inventory';
import {
  AccessChange,
  INTENTIONAL_ACCESS_CHANGES,
} from './intentional-access-changes';
import { AccessSummary, accessSummary } from './route-access';

/*
 * Every route's default access must equal what it admitted on `main` before
 * the capability conversion (`route-access.snapshot.json`), except for the
 * reviewed, explained differences in `intentional-access-changes.ts`.
 *
 * A route still on `@Roles` (or with no marker) is compared with the
 * snapshot as is: its intentional change applies once it is converted.
 */
// The server package root, as `branch-route-policy.spec.ts` uses it.
const SERVER_ROOT = join(__dirname, '..', '..', '..');
const routes = discoverRoutes(join(SERVER_ROOT, 'src'), SERVER_ROOT);
const before = JSON.parse(
  readFileSync(join(__dirname, 'route-access.snapshot.json'), 'utf8'),
) as Record<string, AccessSummary>;

function applyChange(summary: AccessSummary, change: AccessChange): string[] {
  if (!Array.isArray(summary)) {
    throw new Error('Only a role list can change');
  }
  const out = new Set(summary);
  for (const role of change.remove ?? []) out.delete(role);
  for (const role of change.add ?? []) out.add(role);
  return [...out].sort();
}

const LEGACY = new Set(['roles', 'none']);

describe('route access equals the snapshot taken before capabilities', () => {
  it('has a snapshot row for every route and no row for a route that is gone', () => {
    expect(Object.keys(before).sort()).toEqual(routes.map((r) => r.key).sort());
  });

  it('names only routes that exist in its intentional changes', () => {
    for (const key of Object.keys(INTENTIONAL_ACCESS_CHANGES)) {
      expect({ key, known: key in before }).toEqual({ key, known: true });
    }
  });

  it.each(routes.map((r) => [r.key, r] as const))('%s', (key, route) => {
    const change = INTENTIONAL_ACCESS_CHANGES[key];
    const expected =
      change && !LEGACY.has(route.access.kind)
        ? applyChange(before[key], change)
        : before[key];
    expect(accessSummary(route.access)).toEqual(expected);
  });
});
```

- [ ] **Step 3: Run it**

Run: `cd server && npx jest src/common/permissions/permission-routes.spec.ts`
Expected: PASS — no route is converted yet, so every route equals its snapshot row.

- [ ] **Step 4: Format, type-check, commit**

```bash
cd server
npx prettier --write src/common/permissions/intentional-access-changes.ts src/common/permissions/permission-routes.spec.ts
npm run typecheck
git add src/common/permissions
git commit -m "test(permissions): route access equals the pre-conversion snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Converting controllers (Tasks 7–13)

Each of Tasks 7–13 converts a group of controllers. Appendix B is the map: for every route it lists today's roles and the marker that replaces them. The same five steps apply in every task; each task repeats them with its own files and commands.

**Editing a controller.**
1. For every route in the file's Appendix B section, put the listed marker where `@Roles(...)` was: on the handler, or once on the class when every route of the controller gets the same marker. Remove `RolesGuard` from every `@UseGuards(...)` (keep the other guards in the list; drop the decorator when the list becomes empty). Delete the `@Roles(...)` lines.
2. Import the markers from `common/permissions/access.decorators` with the relative path the file needs (e.g. `'../common/permissions/access.decorators'`). Remove imports that became unused (`Roles`, `RolesGuard`, `STAFF_ROLES`, `UseGuards`). ESLint reports any you miss.

Example — `server/src/expenses/expenses.controller.ts`, before:
```ts
@Controller('expenses')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
export class ExpensesController {
  @Get()
  findAll(...) {}

  @Post()
  create(...) {}
```
after:
```ts
@Controller('expenses')
export class ExpensesController {
  @Get()
  @Can('expenses.view')
  findAll(...) {}

  @Post()
  @Can('expenses.manage')
  create(...) {}
```

**Updating a controller spec.** Replace every `reflector.get(ROLES_KEY, …)` / `Reflect.getMetadata(ROLES_KEY, …)` assertion and every `RolesGuard.canActivate(...)` case with the helpers from `common/permissions/testing`. The expected role lists do not change, except for the routes in Appendix C. Then delete the now-unused `RolesGuard`, `Reflector`, `ROLES_KEY` and `mockExecutionContext` code.

Example — `server/src/expenses/expenses.controller.spec.ts`, before:
```ts
  it('restricts the controller to CEO, Branch Director at class level', () => {
    const roles = reflector.get<string[]>(ROLES_KEY, ExpensesController);
    expect(roles).toEqual(['CEO', 'Branch Director']);
  });

  describe('pdf endpoint', () => {
    it('allows CEO / Branch Director', () => {
      for (const role of ['CEO', 'Branch Director']) {
        const ctx = mockExecutionContext(controller.exportPdf, [role]);
        expect(guard.canActivate(ctx)).toBe(true);
      }
    });

    it('denies Administrator, Cashier and Teacher', () => {
      for (const role of ['Administrator', 'Cashier', 'Teacher']) {
        const ctx = mockExecutionContext(controller.exportPdf, [role]);
        expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      }
    });
```
after:
```ts
  it('gates reading and writing by the expenses capabilities', () => {
    expect(routeAccess(ExpensesController, 'findAll')).toEqual({
      kind: 'can',
      keys: ['expenses.view'],
    });
    expect(routeAccess(ExpensesController, 'create')).toEqual({
      kind: 'can',
      keys: ['expenses.manage'],
    });
  });

  describe('pdf endpoint', () => {
    it('admits the CEO and the Branch Director by default, nobody else', () => {
      expect(defaultRolesOf(ExpensesController, 'exportPdf')).toEqual([
        'Branch Director',
        'CEO',
      ]);
    });
```
Use the controller's real method names (read them from the controller).

An e2e spec that does `.overrideGuard(RolesGuard)` keeps working until Task 14 deletes `RolesGuard`; leave it alone here.

**In-service checks.** Appendix D says, for each service of the task, whether a role check stays (identity, no change) or becomes a capability check. A converted check asks `PermissionsService` (global — inject it in the constructor) with the caller's id: `await this.permissions.has(userId, '<key>')`. Its unit spec then provides `{ provide: PermissionsService, useValue: fakePermissions([<role ids of the case>]) }`.

**Checking.** After each task the equivalence spec must pass: the converted routes now compare with snapshot ⊕ Appendix C, the rest with the snapshot. A failure names the route and shows expected vs actual — fix the marker (Appendix B), never the snapshot.

---

### Task 7: Students, statements, student portal, app activity, DaF media

**Files (controllers — Appendix B sections of the same name):**
- `server/src/students/students.controller.ts`
- `server/src/statements/statements.controller.ts`
- `server/src/statements/statement-portal.controller.ts`
- `server/src/students/student-portal.controller.ts`
- `server/src/students/extra-phone/student-extra-phone.controller.ts`
- `server/src/students/onboarding/student-onboarding.controller.ts`
- `server/src/daf/daf-portal.controller.ts`
- `server/src/app-activity/student-activity.controller.ts`
- `server/src/app-activity/student-app-activity.controller.ts`
- `server/src/app-activity/group-app-activity.controller.ts`
- `server/src/app-activity/center/center-app-activity.controller.ts`
- `server/src/daf/daf-media.controller.ts`
- `server/src/telegram/telegram-statement.controller.ts`

**Specs to update:** every `*.spec.ts` in `server/src/students/`, `server/src/statements/`, `server/src/app-activity/`, `server/src/daf/`, `server/src/telegram/telegram-statement.controller.spec.ts` that imports `ROLES_KEY` or `RolesGuard`.

**Student routes:** every `@Roles('Student')` (class or handler) becomes `@StudentOnly()` at the same level. Keep `StudentCardGuard` where it is: `@UseGuards(RolesGuard, StudentCardGuard)` becomes `@UseGuards(StudentCardGuard)` — the global `PermissionGuard` runs before every controller-level guard, so staff still get 403 before `StudentCardGuard` looks for a card.

**In-service checks (Appendix D):** `students.controller.ts` teacher-only scoping of `GET /students` stays.

- [ ] **Step 1: Convert the controllers** (Appendix B; markers as listed; `@StudentOnly()` for every student route).
- [ ] **Step 2: Update the specs** (helpers from `common/permissions/testing`; the expected lists stay as they were).
- [ ] **Step 3: Run the module specs and the equivalence spec**

Run: `cd server && npx jest src/students src/statements src/app-activity src/daf src/telegram/telegram-statement.controller.spec.ts src/common/permissions`
Expected: PASS.

- [ ] **Step 4: Lint, format, type-check**

```bash
cd server
npx prettier --write $(git diff --name-only -- src | sed 's#^server/##')
npx eslint $(git diff --name-only -- src | sed 's#^server/##')
npm run typecheck
```
Expected: no ESLint errors, typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): students, statements, student portal and app activity use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Groups, attendance and lesson changes

**Files (controllers):**
- `server/src/groups/groups.controller.ts`
- `server/src/attendance/attendance.controller.ts`
- `server/src/planned-absences/planned-absences.controller.ts`
- `server/src/lesson-cancellations/lesson-cancellations.controller.ts`
- `server/src/lesson-reschedules/lesson-reschedules.controller.ts`
- `server/src/lesson-teacher-overrides/lesson-teacher-overrides.controller.ts`

**Specs to update:** the controller specs of these six folders that import `ROLES_KEY` or `RolesGuard`. `lesson-reschedules.e2e.spec.ts` keeps its `.overrideGuard(RolesGuard)` until Task 14.

**In-service checks (Appendix D):** all teacher-only scoping in these controllers and in `attendance-save.service.ts`, `attendance-read.service.ts`, `qr-attendance-session.service.ts`, `shared/attendance-window-guard.ts` and `unmarked-lessons/answer-rules.ts` stays as it is.

- [ ] **Step 1: Convert the controllers** (Appendix B).
- [ ] **Step 2: Update the specs.**
- [ ] **Step 3: Run**

Run: `cd server && npx jest src/groups src/attendance src/planned-absences src/lesson-cancellations src/lesson-reschedules src/lesson-teacher-overrides src/unmarked-lessons src/common/permissions`
Expected: PASS.

- [ ] **Step 4: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 5: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): groups, attendance and lesson changes use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Leads, forms, outreach, call logs, mock exams

**Files (controllers):**
- `server/src/leads/leads.controller.ts`
- `server/src/leads/lead-columns.controller.ts`
- `server/src/leads/lead-sections.controller.ts`
- `server/src/leads/lead-sources.controller.ts`
- `server/src/custom-forms/custom-forms.controller.ts` (the public forms controller stays `@Public()`)
- `server/src/outreach/outreach.controller.ts`
- `server/src/call-logs/call-logs.controller.ts`
- `server/src/mock-exams/mock-exams.controller.ts`
- `server/src/mock-exams/mock-exam-participants.controller.ts`
- `server/src/mock-exams/mock-exam-results.controller.ts`
- `server/src/mock-exams/mock-exam-sections.controller.ts`
- `server/src/mock-exams/mock-exam-subjects.controller.ts`

**Specs to update:** the controller specs of these folders that import `ROLES_KEY` or `RolesGuard`.

**In-service checks:** none.

- [ ] **Step 1: Convert the controllers** (Appendix B).
- [ ] **Step 2: Update the specs.**
- [ ] **Step 3: Run**

Run: `cd server && npx jest src/leads src/custom-forms src/outreach src/call-logs src/mock-exams src/common/permissions`
Expected: PASS.

- [ ] **Step 4: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 5: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): leads, forms, outreach and mock exams use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Payments, debt, refunds, withdrawals, billing, ledger, cash, expenses, gateways

**Files (controllers):**
- `server/src/payments/payments.controller.ts`
- `server/src/payments/debt/debt-list.controller.ts`
- `server/src/payment-promises/payment-promises.controller.ts`
- `server/src/refunds/refunds.controller.ts`
- `server/src/withdrawals/withdrawals.controller.ts`
- `server/src/billing/billing.controller.ts`
- `server/src/transactions/transactions.controller.ts`
- `server/src/cash-accounts/cash-accounts.controller.ts`
- `server/src/expenses/expenses.controller.ts`
- `server/src/payment-gateways/gateways.controller.ts` (only `GET /gateways/events`; the three webhook routes stay `@Public()`)

**Specs to update:** the controller specs of these folders that import `ROLES_KEY` or `RolesGuard`. Five routes of this task are in Appendix C (`GET /transactions`, `GET /transactions/teacher/:teacherId`, `GET /transactions/student/:studentId`, `GET /transactions/student/:studentId/lesson-trail`, `POST /billing/retroactive/:studentId`): their specs assert the new lists from Appendix C.

**In-service checks (Appendix D):** `payments-write.service.ts` keeps its CEO checks (72-hour window, CEO alert) unchanged.

- [ ] **Step 1: Convert the controllers** (Appendix B).
- [ ] **Step 2: Update the specs.**
- [ ] **Step 3: Run**

Run: `cd server && npx jest src/payments src/payment-promises src/refunds src/withdrawals src/billing src/transactions src/cash-accounts src/expenses src/payment-gateways src/common/permissions`
Expected: PASS.

- [ ] **Step 4: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 5: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): money routes use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Salary

**Files:** `server/src/salary/salary.controller.ts` (+ `salary.controller.spec.ts`).

The controller has a class-level `@Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')` that every route narrows. Remove the class-level decorator and give every handler its own marker from Appendix B. The five `/salary/me/*` routes become `@AnyStaff()`: Appendix C adds Cashier to them (own data only).

**In-service checks (Appendix D):** `salary-payment.service.ts`, `salary-advance-calendar.service.ts` and `shared/teacher-rate-permission.ts` stay.

- [ ] **Step 1: Convert the controller.**
- [ ] **Step 2: Update `salary.controller.spec.ts`** — it pins every salary route's roles; keep each expected list, except `/salary/me/*` which now admits `['Administrator', 'Branch Director', 'CEO', 'Cashier', 'Teacher']`.
- [ ] **Step 3: Run**

Run: `cd server && npx jest src/salary src/common/permissions`
Expected: PASS.

- [ ] **Step 4: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 5: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): salary routes use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Reports, dashboard, search, entity history, Telegram channel report

**Files (controllers):**
- `server/src/reports/reports.controller.ts`
- `server/src/reports/lead-funnel/reports-lead-funnel.controller.ts`
- `server/src/reports/marketing/reports-marketing.controller.ts`
- `server/src/dashboard/dashboard.controller.ts`
- `server/src/search/search.controller.ts`
- `server/src/common/entity-history/entity-history.controller.ts`
- `server/src/telegram/telegram-channel-report.controller.ts`

**Specs to update:** the controller specs of these folders that import `ROLES_KEY` or `RolesGuard`, plus `dashboard-summary.service.spec.ts` and `dashboard-charts.service.spec.ts` (below). 22 report routes are in Appendix C: their specs assert the new lists.

**In-service checks (Appendix D) — convert:**
- `server/src/dashboard/dashboard-summary.service.ts` lines 62–63 and `server/src/dashboard/dashboard-charts.service.ts` lines 86–90 decide what the home page shows from `ctx.roles`. Replace them with capability checks. Both context types (`SummaryContext`, `ChartsContext`) carry `userId`. Inject `PermissionsService` and write, in `getSummary`:
  ```ts
  const caller = await this.permissions.forUser(ctx.userId);
  const canSeeMoney = caller.keys.has('reports.finance');
  const canSeeOutreach = caller.keys.has('outreach.view');
  ```
  and in `getCharts`:
  ```ts
  const caller = await this.permissions.forUser(ctx.userId);
  const canSeeMoney = caller.keys.has('reports.finance');
  // The same operational tier as the home page's outreach rows.
  const canSeeOperational = caller.keys.has('outreach.view');
  ```
  The cache keys keep their tier names. Their specs: provide `fakePermissions([...])` with the role ids each case used to put in `ctx.roles` (CEO → `[1]`, Branch Director → `[2]`, Administrator → `[3]`, Cashier → `[5]`).
- The teacher-only scoping in `dashboard.controller.ts` stays.

- [ ] **Step 1: Convert the controllers** (Appendix B).
- [ ] **Step 2: Convert the two dashboard services and their specs.**
- [ ] **Step 3: Update the controller specs.**
- [ ] **Step 4: Run**

Run: `cd server && npx jest src/reports src/dashboard src/search src/common/entity-history src/telegram/telegram-channel-report.controller.spec.ts src/common/permissions`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 6: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): reports, dashboard and search use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: People, settings, reference lists, comments, tasks, notifications

**Files (controllers):**
- `server/src/users/users.controller.ts`
- `server/src/teachers/teachers.controller.ts`
- `server/src/branches/branches.controller.ts`
- `server/src/company/company.controller.ts`
- `server/src/settings/settings.controller.ts`
- `server/src/courses/courses.controller.ts`
- `server/src/rooms/rooms.controller.ts`
- `server/src/holidays/holidays.controller.ts`
- `server/src/student-exit-reasons/student-exit-reasons.controller.ts`
- `server/src/group-teacher-change-reasons/group-teacher-change-reasons.controller.ts`
- `server/src/enrollment-transfer-reasons/enrollment-transfer-reasons.controller.ts`
- `server/src/archive/archive.controller.ts`
- `server/src/absence-pause/absence-pause.controller.ts`
- `server/src/telegram-groups/telegram-groups.controller.ts`
- `server/src/telegram/telegram.controller.ts` (only `POST /telegram/employee-link`; the webhook stays `@Public()`)
- `server/src/upload/upload.controller.ts`
- `server/src/comments/comments.controller.ts`
- `server/src/tasks/tasks.controller.ts`
- `server/src/notifications/notifications.controller.ts` (the public VAPID-key route stays `@Public()`)

**Specs to update:** the controller specs of these folders that import `ROLES_KEY` or `RolesGuard`, `users-phone-route.spec.ts`, `own-password-attempt.routes.spec.ts` if it reads role metadata, and the service specs below. `GET /telegram-groups` is in Appendix C.

**In-service checks (Appendix D) — convert:**
- `server/src/courses/courses.controller.ts`: delete `PAYMENT_MODEL_ROLES`; in `update`, replace the `callerRoles` check with
  ```ts
  if (
    dto.paymentModel !== undefined &&
    !(await this.permissions.has(userId, 'courses.create'))
  ) {
    throw new ForbiddenException(
      "Kursning to'lov modelini faqat CEO yoki Filial direktori o'zgartira oladi",
    );
  }
  ```
  (make `update` `async`, inject `PermissionsService`, drop the `@CurrentUser('roles')` parameter).
- `server/src/comments/comments.service.ts` line 175: `const isCeo = roles.includes('CEO');` becomes `const mayModerate = await this.permissions.has(userId, 'comments.delete');` and the condition `comment.authorId !== userId && !mayModerate`. Remove the `roles` parameter if nothing else uses it, and its argument in the controller.
- `server/src/telegram-groups/telegram-groups.service.ts`: the two «CEO or Branch Director» checks (lines 114 and 310) become `await this.permissions.has(caller.id, 'settings.telegram-groups')`; the «only the CEO disconnects the bot» check (line 370) becomes `await this.permissions.has(caller.id, 'telegram.announce')`. The two `receivesAllBranches` checks (lines 151 and 272) stay CEO identity — «Barcha filiallar» is a company-level decision. Where `caller.id` is optional in the method's type, the controller always passes it; tighten the type to `id: number`.
- Everything else in Appendix D for these folders stays.

- [ ] **Step 1: Convert the controllers** (Appendix B). `tasks.controller.ts` gets one class-level `@AnyStaff()`; its own policy (ADR-0074) keeps deciding who may assign whom.
- [ ] **Step 2: Convert the three services and their specs.**
- [ ] **Step 3: Update the controller specs.**
- [ ] **Step 4: Run**

Run: `cd server && npx jest src/users src/teachers src/branches src/company src/settings src/courses src/rooms src/holidays src/student-exit-reasons src/group-teacher-change-reasons src/enrollment-transfer-reasons src/archive src/absence-pause src/telegram-groups src/telegram src/upload src/comments src/tasks src/notifications src/common`
Expected: PASS.

- [ ] **Step 5: Lint, format, type-check** (the same three commands as Task 7, Step 4).
- [ ] **Step 6: Commit**

```bash
cd server
git add -A src
git commit -m "refactor(permissions): people, settings, comments, tasks and notifications use capability markers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Retire `@Roles`; refuse unmarked routes; the manifest

**Files:**
- Delete: `server/src/common/decorators/roles.decorator.ts`, `server/src/common/decorators/staff-roles.ts`, `server/src/common/guards/roles.guard.ts`, `server/src/common/guards/roles.guard.spec.ts`
- Modify: `server/src/common/decorators/index.ts`, `server/src/common/guards/index.ts`
- Modify: `server/src/common/permissions/permission.guard.ts` (+ spec)
- Modify: `server/src/common/permissions/permission-routes.spec.ts` (the manifest)
- Modify: `server/scripts/route-inventory.ts` (drop the legacy kinds)
- Modify: every e2e spec that calls `.overrideGuard(RolesGuard)` (`lesson-reschedules.e2e.spec.ts`; find the rest with the grep below)
- Modify: `server/CLAUDE.md` («Authentication & Authorization», «Role-Based Access Control (RBAC) — Backend Rules», «Staff-only list endpoints», «Testing»)

- [ ] **Step 1: Prove nothing uses the old mechanism**

Run: `cd server && grep -rn "@Roles(\|RolesGuard\|ROLES_KEY\|STAFF_ROLES" src scripts --include='*.ts'`
Expected: only `common/decorators/roles.decorator.ts`, `common/decorators/staff-roles.ts`, `common/decorators/index.ts`, `common/guards/roles.guard.ts`, `common/guards/roles.guard.spec.ts`, `common/guards/index.ts`, `scripts/route-inventory.ts` (cleaned in Step 4), the e2e `overrideGuard` lines and comments. Convert anything else first (it belongs to Tasks 7–13).

- [ ] **Step 2: Delete the files and the exports**

Delete the four files. In `common/decorators/index.ts` remove the `Roles, ROLES_KEY` and `STAFF_ROLES` export lines; in `common/guards/index.ts` remove the `RolesGuard` line. Remove the `.overrideGuard(RolesGuard)…useValue(…)` chains (and the import) from the e2e specs.

- [ ] **Step 3: Make the guard refuse a route without a marker — failing spec first**

In `permission.guard.spec.ts` replace the transition case
```ts
  it('leaves a route without a marker to the legacy RolesGuard (transition)', async () => {
    const { context } = contextFor({}, { id: 6 });
    await expect(guardFor([]).canActivate(context)).resolves.toBe(true);
  });
```
with:
```ts
  it('refuses a route that declares no access at all', async () => {
    const { context } = contextFor({}, { id: 6 });
    await expect(guardFor([1]).canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
```
Run: `cd server && npx jest src/common/permissions/permission.guard.spec.ts`
Expected: FAIL on the new case.

In `permission.guard.ts` replace
```ts
    // Transition: a route still on `@Roles` is checked by RolesGuard. Task 14
    // turns this into a refusal once no such route is left.
    if (!access) return true;
    if (allows(access, caller)) return true;
```
with:
```ts
    // Fail closed: a route without a marker is a forgotten route. The
    // manifest in `permission-routes.spec.ts` stops one from being merged.
    if (access && allows(access, caller)) return true;
```
Run it again. Expected: PASS.

- [ ] **Step 4: Drop the legacy kinds from the inventory**

In `server/scripts/route-inventory.ts` remove `'Roles'` from `ACCESS_DECORATORS`, the `{ kind: 'roles'; … }` member of `RouteAccess`, `STAFF_ROLE_NAMES` and the spread branch in `stringArgs`, and change the `default:` of `accessOf` to the `'Can'` case only:
```ts
    case 'Can':
    default:
      return { access: { kind: 'can', keys: stringArgs(dec) }, markers };
```
Keep `{ kind: 'none' }` — the manifest reports it.

- [ ] **Step 5: Add the manifest to `permission-routes.spec.ts`**

Remove `const LEGACY = new Set(['roles', 'none']);` and change the per-route expectation to apply the change always:
```ts
  it.each(routes.map((r) => [r.key, r] as const))('%s', (key, route) => {
    const change = INTENTIONAL_ACCESS_CHANGES[key];
    const expected = change ? applyChange(before[key], change) : before[key];
    expect(accessSummary(route.access)).toEqual(expected);
  });
```
and append:
```ts
describe('route manifest: every route declares exactly one access', () => {
  it('has a marker or @Public() on every route', () => {
    const unmarked = routes
      .filter((r) => r.access.kind === 'none')
      .map((r) => r.key);
    expect(unmarked).toEqual([]);
  });

  it('puts at most one marker on a handler and at most one on a controller', () => {
    const doubled = routes
      .filter(
        (r) =>
          r.accessMarkers.handler.length > 1 ||
          r.accessMarkers.controller.length > 1,
      )
      .map((r) => r.key);
    expect(doubled).toEqual([]);
  });

  it('names only catalog capabilities in @Can', () => {
    for (const route of routes) {
      if (route.access.kind !== 'can') continue;
      expect({ key: route.key, keys: route.access.keys.length }).not.toEqual({
        key: route.key,
        keys: 0,
      });
      expect(() => accessSummary(route.access)).not.toThrow();
    }
  });
});
```

- [ ] **Step 6: Run the whole server suite**

Run: `cd server && npm test`
Expected: PASS.

- [ ] **Step 7: Update `server/CLAUDE.md`**

Replace the RBAC parts that describe `@Roles` with the capability rules. Write exactly these paragraphs in place of the «Role-based access uses `@Roles(...)`», «Backend role-check pattern», «When restricting access for any role» and «Staff-only list endpoints» text, and change «Controller guard tests are mandatory» under Testing to point at `routeAccess`/`defaultRolesOf`:

```markdown
#### Capabilities, not role lists (ADR-00NN)

- **Every route declares who may call it with exactly one marker** from `common/permissions/access.decorators.ts`: `@Can('key', …)` (any of the listed capabilities), `@AnyStaff()` (roles 1–5: reference lists, own data, tasks), `@AnyUser()` (any signed-in account, own data) or `@StudentOnly()` (the student portal) — or `@Public()`. `PermissionGuard` (global, after `JwtAuthGuard`, before `BranchScopeGuard`) refuses a route with none, and the manifest in `permission-routes.spec.ts` fails the build on it. There is no `@Roles` any more.
- **The capability catalog is `common/permissions/permission-catalog.ts`** — 64 capabilities with their Uzbek labels and the roles that hold them by default. The CEO holds every capability. A new screen action either reuses a capability or adds one there (label, section, default roles, `requires`).
- **`@Can` lists every screen's capability that calls the route** (e.g. `GET /students` is `@Can('students.list', 'payments.create', 'groups.view')` because the payment dialog and the teacher's group screens call it too), so switching one screen off never breaks another.
- **Roles come from the database on every request.** `PermissionGuard` replaces `request.user.roles` with what `PermissionsService.forUser()` read (`whereUserMayAct()`, cached 10 s per process). A removed role stops working on the next request; a blocked account holds nothing even while Redis is down.
- **A service decides "may this caller do X?" with `PermissionsService.has(userId, key)`, never with a role name.** Role names stay for "who is this?": branch scope (the CEO spans every branch), the rank rules (ADR-0026/0027), ADR-0034's targets, teacher-only scoping and the ADR-0074 task ladder.
- **Default access is pinned.** `permission-routes.spec.ts` compares every route's default access with `route-access.snapshot.json` (the state before capabilities) plus `intentional-access-changes.ts`. A new route needs a snapshot row; a changed default needs an entry with its reason.
- **Controller specs** assert a route's marker and default roles with `routeAccess()` and `defaultRolesOf()` from `common/permissions/testing.ts`; unit specs of services that ask `PermissionsService` provide `fakePermissions([...roleIds])`.
- Where this file still writes `@Roles('…')` next to a route, read it as that route's default roles; the route itself carries a capability marker.
```
In «Student-portal routes refuse a token without `studentId`», replace «put `StudentCardGuard` (…) at class level, **after** `RolesGuard` — `@UseGuards(RolesGuard, StudentCardGuard)` — so staff still get 403» with «give the controller `@StudentOnly()` and `@UseGuards(StudentCardGuard)` at class level — the global `PermissionGuard` refuses staff with 403 before `StudentCardGuard` runs».

Also update the «A token keeps the roles it was issued with for its hour» bullet: replace its third sub-bullet («A role change deliberately does not cut off a token…») with «**A role change takes effect on the next request**: `PermissionGuard` reads the roles from the database (ADR-00NN); the token's own `roles` claim is no longer read by any check.»

- [ ] **Step 8: Lint, format, type-check, commit**

```bash
cd server
npx prettier --write scripts/route-inventory.ts src/common
npx eslint src/common scripts/route-inventory.ts
npm run typecheck
git add -A src scripts CLAUDE.md
git commit -m "refactor(permissions): retire @Roles and RolesGuard; unmarked routes are refused

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Client capability store

**Files:**
- Create: `client/src/lib/permission-keys.ts`
- Test: `client/src/lib/permission-keys.test.ts`
- Create: `client/src/lib/permission-check.ts`
- Test: `client/src/lib/permission-check.test.ts`
- Create: `client/src/test-support/server-catalog.ts`
- Create: `client/src/hooks/use-permissions.ts`
- Create: `client/src/components/providers/permissions-sync.tsx`
- Modify: `client/src/components/providers/auth-provider.tsx`
- Modify: `client/src/lib/api.ts` (the 403 branch)
- Create: `client/src/components/shared/can-link.tsx`
- Test: `client/src/components/shared/can-link.test.ts`

**Interfaces:**
- Consumes: `GET /permissions/me` → `{ keys: string[] }` (Task 5); the server files `server/src/common/auth/role-ids.ts` and `server/src/common/permissions/permission-catalog.ts` (test-only).
- Produces:
  - `PERMISSION_KEYS`, `PermissionKey` (`@/lib/permission-keys`)
  - `Can = (wanted: PermissionKey | readonly PermissionKey[]) => boolean`, `makeCan(keys | null): Can`, `parseStoredPermissions(raw, userId): ReadonlySet<PermissionKey> | null` (`@/lib/permission-check`)
  - `usePermissions` (zustand: `userId`, `keys`, `can`, `loadedAt`, `start(userId)`, `refresh()`, `clear()`), `useCan(wanted): boolean`, `usePermissionsReady(): boolean` (`@/hooks/use-permissions`)
  - `PermissionsSync` (`@/components/providers/permissions-sync`)
  - `CanLink` (`@/components/shared/can-link`) — `RoleLink`'s props with `perm` instead of `roles`
  - `loadServerCatalog()`, `canForRoles(roleIds): Can` (`@/test-support/server-catalog`, tests only)

- [ ] **Step 1: Write the server-catalog loader for tests**

`client/src/test-support/server-catalog.ts`:
```ts
import { readFileSync } from "fs";
import { join } from "path";
import { runInThisContext } from "vm";
import ts from "typescript";
import { makeCan, type Can } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * Tests only: loads the SERVER's capability catalog so client tests build
 * `can` from the same defaults the server uses — the proof that a role sees
 * the same menus as before. The server is a separate package, so its two
 * plain-data files are transpiled on the fly (`status-config.test.ts` reads
 * server code the same way, as text).
 */
const SERVER_SRC = join(__dirname, "../../../server/src");

function load(
  relativePath: string,
  deps: Record<string, unknown>,
): Record<string, unknown> {
  const source = readFileSync(join(SERVER_SRC, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const exports: Record<string, unknown> = {};
  const requireDep = (id: string) => {
    if (!(id in deps)) {
      throw new Error(`server-catalog: unexpected import "${id}"`);
    }
    return deps[id];
  };
  // This realm, so the Sets and arrays it returns compare like local ones.
  const moduleFn = runInThisContext(
    `(function (exports, require) {\n${outputText}\n})`,
  ) as (exports: Record<string, unknown>, require: (id: string) => unknown) => void;
  moduleFn(exports, requireDep);
  return exports;
}

export interface ServerCatalog {
  PERMISSION_KEYS: string[];
  defaultKeysForRoles: (roleIds: readonly number[]) => Set<string>;
}

let cached: ServerCatalog | null = null;

export function loadServerCatalog(): ServerCatalog {
  if (!cached) {
    const roleIds = load("common/auth/role-ids.ts", {});
    cached = load("common/permissions/permission-catalog.ts", {
      "../auth/role-ids": roleIds,
    }) as unknown as ServerCatalog;
  }
  return cached;
}

/** A `can` holding the server's default capabilities for these role ids. */
export function canForRoles(roleIds: readonly number[]): Can {
  return makeCan(
    loadServerCatalog().defaultKeysForRoles(roleIds) as ReadonlySet<PermissionKey>,
  );
}
```

- [ ] **Step 2: Write the failing tests**

`client/src/lib/permission-keys.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS } from "./permission-keys";
import { loadServerCatalog } from "@/test-support/server-catalog";

describe("PERMISSION_KEYS", () => {
  it("is exactly the server catalog's list, in the same order", () => {
    expect([...PERMISSION_KEYS]).toEqual(loadServerCatalog().PERMISSION_KEYS);
  });
});
```

`client/src/lib/permission-check.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeCan, parseStoredPermissions } from "./permission-check";

describe("makeCan", () => {
  const can = makeCan(new Set(["groups.view", "attendance.mark"]));

  it("answers one capability", () => {
    expect(can("groups.view")).toBe(true);
    expect(can("salary.view")).toBe(false);
  });

  it("answers ANY of several", () => {
    expect(can(["salary.view", "attendance.mark"])).toBe(true);
    expect(can(["salary.view", "expenses.view"])).toBe(false);
  });

  it("holds nothing before the list is known", () => {
    expect(makeCan(null)("groups.view")).toBe(false);
  });
});

describe("parseStoredPermissions", () => {
  it("returns the list kept for this user", () => {
    const raw = JSON.stringify({ userId: 7, keys: ["groups.view"] });
    expect([...(parseStoredPermissions(raw, 7) ?? [])]).toEqual(["groups.view"]);
  });

  it("ignores another user's list, a broken value and unknown keys", () => {
    expect(
      parseStoredPermissions(JSON.stringify({ userId: 8, keys: [] }), 7),
    ).toBeNull();
    expect(parseStoredPermissions("{", 7)).toBeNull();
    expect(parseStoredPermissions(null, 7)).toBeNull();
    const raw = JSON.stringify({ userId: 7, keys: ["groups.view", "no.such"] });
    expect([...(parseStoredPermissions(raw, 7) ?? [])]).toEqual(["groups.view"]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts src/lib/permission-check.test.ts`
Expected: FAIL — `Cannot find module './permission-keys'`.

- [ ] **Step 4: Write `permission-keys.ts`**

`client/src/lib/permission-keys.ts` — the 64 keys in the server catalog's order (Appendix A, column «Key», top to bottom):
```ts
/**
 * The capability keys of the server's catalog
 * (`server/src/common/permissions/permission-catalog.ts`). The server decides
 * who holds which and answers `GET /permissions/me`; the client only hides
 * what the list does not contain. `permission-keys.test.ts` compares this
 * list with the server's.
 */
export const PERMISSION_KEYS = [
  "students.list",
  "students.profile",
  "students.details",
  "students.manage",
  "students.enroll",
  "students.sms",
  "students.initial-balance",
  "groups.view",
  "groups.manage",
  "lessons.change",
  "lessons.change-delete",
  "attendance.mark",
  "attendance.fix",
  "leads.view",
  "leads.manage",
  "leads.setup",
  "leads.forms",
  "outreach.view",
  "calls.log",
  "mock.view",
  "mock.manage",
  "mock.payments",
  "payments.view",
  "payments.create",
  "payments.correct",
  "debt.view",
  "debt.promise",
  "balance.withdraw",
  "refunds.create",
  "debt.write-off",
  "balance.adjust",
  "money.undo",
  "payments.gateway-log",
  "expenses.view",
  "expenses.manage",
  "cash.manage",
  "salary.view",
  "salary.rate",
  "salary.pay",
  "salary.rate-edit",
  "salary.close",
  "reports.finance",
  "reports.payments",
  "reports.students",
  "reports.leads",
  "teachers.view",
  "teachers.manage",
  "employees.view",
  "employees.manage",
  "employees.invite",
  "comments.write",
  "comments.delete",
  "settings.reference",
  "courses.create",
  "settings.branches",
  "settings.payment",
  "settings.telegram-groups",
  "settings.absence-pause",
  "telegram.announce",
  "settings.company",
  "settings.archive",
  "dashboard.view",
  "daf.activity",
  "media.view",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
```

- [ ] **Step 5: Write `permission-check.ts`**

```ts
import { PERMISSION_KEYS, type PermissionKey } from "./permission-keys";

/** Does the signed-in user hold ANY of these capabilities? */
export type Can = (wanted: PermissionKey | readonly PermissionKey[]) => boolean;

/** A `Can` over a known list. `null` — not known yet — holds nothing. */
export function makeCan(keys: ReadonlySet<PermissionKey> | null): Can {
  return (wanted) => {
    if (!keys) return false;
    const list: readonly PermissionKey[] =
      typeof wanted === "string" ? [wanted] : wanted;
    return list.some((key) => keys.has(key));
  };
}

const KNOWN: readonly string[] = PERMISSION_KEYS;

/** Keeps only the keys this client knows (an older client meets newer keys). */
export function knownKeys(keys: readonly string[]): Set<PermissionKey> {
  return new Set(keys.filter((k): k is PermissionKey => KNOWN.includes(k)));
}

/**
 * The list this browser kept for `userId` (`localStorage`), so a reload shows
 * the menus at once while the fresh list is on its way. Anything that is not
 * this user's list reads as nothing.
 */
export function parseStoredPermissions(
  raw: string | null,
  userId: number,
): ReadonlySet<PermissionKey> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; keys?: unknown };
    if (parsed.userId !== userId || !Array.isArray(parsed.keys)) return null;
    return knownKeys(parsed.keys.filter((k): k is string => typeof k === "string"));
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts src/lib/permission-check.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the store**

`client/src/hooks/use-permissions.ts`:
```ts
import { create } from "zustand";
import api from "@/lib/api";
import {
  knownKeys,
  makeCan,
  parseStoredPermissions,
  type Can,
} from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

const STORAGE_KEY = "daf.permissions";

interface PermissionsState {
  userId: number | null;
  /** `null` until a list is known, from this browser's storage or the server. */
  keys: ReadonlySet<PermissionKey> | null;
  can: Can;
  /** When the server last answered (ms); 0 = not yet. */
  loadedAt: number;
  /** Shows the list kept for `userId`, then asks the server. */
  start: (userId: number) => void;
  /** Asks the server again: on window focus, after a 403. */
  refresh: () => Promise<void>;
  /** Forgets the list in memory (signed out). Storage is keyed by user. */
  clear: () => void;
}

/**
 * The signed-in user's capabilities (spec §8). Hiding is a convenience: the
 * server refuses what the list does not contain whatever the screen shows.
 */
export const usePermissions = create<PermissionsState>((set, get) => ({
  userId: null,
  keys: null,
  can: makeCan(null),
  loadedAt: 0,

  start: (userId) => {
    if (get().userId === userId && get().keys) return;
    let stored: ReadonlySet<PermissionKey> | null = null;
    try {
      stored = parseStoredPermissions(localStorage.getItem(STORAGE_KEY), userId);
    } catch {
      stored = null;
    }
    set({ userId, keys: stored, can: makeCan(stored), loadedAt: 0 });
    void get().refresh();
  },

  refresh: async () => {
    const userId = get().userId;
    if (userId == null) return;
    try {
      const { data } = await api.get<{ keys: string[] }>("/permissions/me");
      if (get().userId !== userId) return; // signed out or switched meanwhile
      const keys = knownKeys(data.keys);
      set({ keys, can: makeCan(keys), loadedAt: Date.now() });
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ userId, keys: [...keys] }),
        );
      } catch {
        // Storage unavailable: the list stays in memory for this tab.
      }
    } catch {
      // Keep what we have; the server still refuses what it must.
    }
  },

  clear: () =>
    set({ userId: null, keys: null, can: makeCan(null), loadedAt: 0 }),
}));

/** Does the signed-in user hold ANY of these capabilities? */
export function useCan(wanted: PermissionKey | readonly PermissionKey[]): boolean {
  return usePermissions((s) => s.can(wanted));
}

/** True once a list is known; a page guard waits for it before redirecting. */
export function usePermissionsReady(): boolean {
  return usePermissions((s) => s.keys !== null);
}
```

- [ ] **Step 8: Keep the store in step with the signed-in user**

`client/src/components/providers/permissions-sync.tsx`:
```tsx
"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";

const REFRESH_AFTER_MS = 30_000;

/** Loads the capability list for whoever is signed in, and again on focus. */
export function PermissionsSync() {
  const userId = useAuth((s) => s.user?.id ?? null);

  useEffect(() => {
    const store = usePermissions.getState();
    if (userId == null) {
      store.clear();
      return;
    }
    store.start(userId);
    const onFocus = () => {
      const { loadedAt, refresh } = usePermissions.getState();
      if (Date.now() - loadedAt > REFRESH_AFTER_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  return null;
}
```
In `client/src/components/providers/auth-provider.tsx` return:
```tsx
  return (
    <>
      <PermissionsSync />
      {children}
    </>
  );
```
(import `PermissionsSync` from `./permissions-sync`).

- [ ] **Step 9: Re-read the list after a 403**

In `client/src/lib/api.ts`, inside `if (error.response?.status === 403) {`, before the toast import, add:
```ts
      // The list on screen may be older than the server's: re-read it so a
      // button the server now refuses disappears (spec §8).
      void import("@/hooks/use-permissions").then(({ usePermissions }) =>
        usePermissions.getState().refresh(),
      );
```

- [ ] **Step 10: Write `CanLink` and its test**

`client/src/components/shared/can-link.tsx`:
```tsx
"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { useCan } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/lib/permission-keys";
import { cn } from "@/lib/utils";

type CanLinkProps = ComponentPropsWithoutRef<"a"> & {
  href: string;
  /** The capability that opens the page — viewers without it get the text alone. */
  perm: PermissionKey | readonly PermissionKey[];
  /** Only the link itself (hover, focus) — never the plain text. */
  linkClassName?: string;
};

/**
 * A link to a page, only for viewers the server lets open it. Everyone else
 * sees the same content without the link: a link that ends in a 403 is never
 * shown (docs/role-access.md, both layers). The other props go to both forms,
 * so a Radix `asChild` trigger keeps its handlers; `aria-label` belongs to the
 * link alone.
 */
export function CanLink({
  perm,
  href,
  className,
  linkClassName,
  "aria-label": ariaLabel,
  ...rest
}: CanLinkProps) {
  const allowed = useCan(perm);
  if (allowed) {
    return (
      <Link
        href={href}
        className={cn(className, linkClassName)}
        aria-label={ariaLabel}
        {...rest}
      />
    );
  }
  return <span className={className} {...rest} />;
}
```

`client/src/components/shared/can-link.test.ts`:
```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The store's static state is "nothing known", so the held capabilities are
// supplied through a mock.
const held = vi.hoisted(() => ({ keys: [] as string[] }));
vi.mock("@/hooks/use-permissions", () => ({
  useCan: (wanted: string | readonly string[]) =>
    (typeof wanted === "string" ? [wanted] : wanted).some((k) =>
      held.keys.includes(k),
    ),
}));

import { CanLink } from "./can-link";

function render(keys: string[]): string {
  held.keys = keys;
  return renderToStaticMarkup(
    createElement(
      CanLink,
      {
        perm: "groups.view",
        href: "/groups/7",
        className: "block",
        linkClassName: "hover:underline",
        "aria-label": "Guruhni ochish",
      },
      "A1-guruh",
    ),
  );
}

describe("CanLink", () => {
  it("gives a viewer who may open the page a link with its hover class and label", () => {
    const html = render(["groups.view"]);
    expect(html).toMatch(/^<a /);
    expect(html).toContain('href="/groups/7"');
    expect(html).toContain('class="block hover:underline"');
    expect(html).toContain('aria-label="Guruhni ochish"');
  });

  it("gives everyone else the same text without a link", () => {
    expect(render(["payments.view"])).toBe('<span class="block">A1-guruh</span>');
  });
});
```

- [ ] **Step 11: Run, type-check, lint**

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts src/lib/permission-check.test.ts src/components/shared/can-link.test.ts`
Expected: PASS.
Run: `cd client && npx tsc --noEmit && npx eslint src/lib/permission-keys.ts src/lib/permission-check.ts src/hooks/use-permissions.ts src/components/providers src/components/shared/can-link.tsx src/test-support src/lib/api.ts`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
cd client
git add src/lib/permission-keys.ts src/lib/permission-keys.test.ts src/lib/permission-check.ts src/lib/permission-check.test.ts src/test-support src/hooks/use-permissions.ts src/components/providers src/components/shared/can-link.tsx src/components/shared/can-link.test.ts src/lib/api.ts
git commit -m "feat(permissions): client capability store, useCan and CanLink

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Menus and page guards read capabilities

**Files:**
- Modify: `client/src/lib/nav-items.ts`, `client/src/lib/payments-nav.ts`, `client/src/lib/reports-nav.ts`, `client/src/lib/daf-nav.ts`, `client/src/lib/settings-nav.ts`
- Modify: `client/src/components/app-sidebar.tsx`, `client/src/components/payments/payments-mobile-menu.tsx`, `client/src/components/reports/reports-mobile-menu.tsx`, `client/src/components/settings/settings-menu.tsx`
- Modify: `client/src/components/settings/settings-layout-shell.tsx`, `client/src/components/reports/reports-layout-shell.tsx`, `client/src/components/daf-center/daf-layout-shell.tsx`, `client/src/components/payments/payments-layout-shell.tsx`
- Test: `client/src/lib/nav-items.test.ts`, `client/src/lib/settings-nav.test.ts`, `client/src/lib/reports-nav.test.ts`, `client/src/lib/daf-nav.test.ts`

**Interfaces:**
- Consumes: `Can`, `PermissionKey`, `usePermissions`, `usePermissionsReady`, `canForRoles` (Task 15).
- Produces: a nav gate on every item — `permission?: PermissionKey | readonly PermissionKey[]` (any of) and, for identity-only items, `forRoles?: number[]`; `getVisibleSettingsSections(can)`, `canOpenSettingsPath(pathname, can)`, `canOpenEmployeeSettings(can)`, `canEnterReports(can)`, `canOpenReportPath(can, pathname)`, `canEnterDaf(can)`, `canOpenDafPath(can, pathname, roleIds)`.

The proof that no menu changed is the existing tests: they keep every expected list and only build `can` from the server's defaults for the same role ids.

- [ ] **Step 1: Make the tests ask with `can`**

In `reports-nav.test.ts`, `daf-nav.test.ts` and `settings-nav.test.ts`, add `import { canForRoles } from "@/test-support/server-catalog";` and replace every role-id argument `X` of the helpers with `canForRoles(X)` — e.g. `canOpenReportPath([3], "/reports/leads")` → `canOpenReportPath(canForRoles([3]), "/reports/leads")`, `getVisibleSettingsSections([5])` → `getVisibleSettingsSections(canForRoles([5]))`, `canOpenSettingsPath("/settings/rooms", [5])` → `canOpenSettingsPath("/settings/rooms", canForRoles([5]))`. `canOpenDafPath([role], path)` becomes `canOpenDafPath(canForRoles([role]), path, [role])`. Keep every expected value.

In `nav-items.test.ts` replace:
```ts
    // visibleForRoles yo'q = hamma xodim ko'radi; sahifalar rolga qarab filtrlanadi.
    expect(item.visibleForRoles).toBeUndefined();
```
with:
```ts
    // No gate = every staff member sees it; the guide filters its pages itself.
    expect(item.permission).toBeUndefined();
    expect(item.forRoles).toBeUndefined();
```
```ts
    expect(groups?.visibleForRoles).toEqual([1, 2, 3, 4]);
```
with:
```ts
    expect(groups?.permission).toBe("groups.view");
```
and
```ts
    expect(salary?.visibleForRoles).toEqual([1, 2]);
```
with:
```ts
    expect(salary?.permission).toBe("salary.view");
```
and append:
```ts
describe("navItems — every role sees the same menu as before capabilities", () => {
  // The menus each role saw when the menu was gated by role ids (2026-10-10).
  const BEFORE: Record<string, string[]> = {
    "1": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "2": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "3": ["/", "/schedule", "/teachers", "/students", "/leads", "/outreach", "/mock-exams", "/groups", "/tasks", "/media", "/daf", "/payments", "/reports", "/qollanma", "/settings"],
    "4": ["/", "/schedule", "/groups", "/tasks", "/profile/salary", "/qollanma"],
    "5": ["/", "/schedule", "/tasks", "/payments", "/qollanma"],
  };

  it.each(Object.keys(BEFORE))("role %s", (role) => {
    const roleIds = [Number(role)];
    const can = canForRoles(roleIds);
    const visible = navItems
      .filter((item) => isNavGateOpen(item, can, roleIds))
      .map((item) => item.url);
    expect(visible).toEqual(BEFORE[role]);
  });
});
```
(import `isNavGateOpen` from `./nav-items` and `canForRoles` from `@/test-support/server-catalog`).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd client && npx vitest run src/lib/nav-items.test.ts src/lib/settings-nav.test.ts src/lib/reports-nav.test.ts src/lib/daf-nav.test.ts`
Expected: FAIL (helpers still take role ids; `isNavGateOpen` does not exist).

- [ ] **Step 3: Gate the nav items with capabilities**

`client/src/lib/nav-items.ts`:
- Replace both `visibleForRoles?: number[];` fields (in `NavItemChild` and `NavItem`) with:
  ```ts
  /** Shown when the user holds ANY of these capabilities. Omit to show to all. */
  permission?: PermissionKey | readonly PermissionKey[];
  /** Identity-only items (a teacher's own salary): shown to these role ids. */
  forRoles?: number[];
  ```
- Add, after the interfaces:
  ```ts
  /** One rule for every menu: the capability gate, then the identity gate. */
  export function isNavGateOpen(
    item: { permission?: PermissionKey | readonly PermissionKey[]; forRoles?: number[] },
    can: Can,
    roleIds: readonly number[],
  ): boolean {
    if (item.permission && !can(item.permission)) return false;
    if (item.forRoles && !item.forRoles.some((id) => roleIds.includes(id))) {
      return false;
    }
    return true;
  }
  ```
- Replace the gates in `navItems` (keep titles, urls, icons, comments):

  | Item | Old | New |
  |---|---|---|
  | O'qituvchilar | `visibleForRoles: [1, 2, 3]` | `permission: "teachers.view"` |
  | O'quvchilar | `[1, 2, 3]` | `permission: "students.list"` |
  | Lidlar | `[1, 2, 3]` | `permission: "leads.view"` |
  | Aloqa markazi | `[1, 2, 3]` | `permission: "outreach.view"` |
  | Mock imtihonlar | `[1, 2, 3]` | `permission: "mock.view"` |
  | Guruhlar | `GROUP_PAGE_ROLES` | `permission: "groups.view"` |
  | Media | `[1, 2, 3]` | `permission: "media.view"` |
  | DaF ilovasi | `[1, 2, 3]` | `permission: "daf.activity"` |
  | Mening oyligim | `[4]` | `forRoles: [4]` |
  | Moliya | `[1, 2, 3, 5]` | `permission: ["payments.view", "debt.view", "expenses.view", "salary.view", "payments.gateway-log"]` |
  | Hisobotlar | `[1, 2, 3]` | `permission: ["reports.finance", "reports.payments", "reports.students", "reports.leads"]` |
  | Sozlamalar | `[1, 2, 3]` | `permission: SETTINGS_PERMISSIONS` |

  Remove the `GROUP_PAGE_ROLES` import; import `PermissionKey` from `./permission-keys`, `Can` from `./permission-check` and `SETTINGS_PERMISSIONS` from `./settings-nav`.

`client/src/lib/payments-nav.ts`: replace `visibleForRoles?: number[];` with `permission?: PermissionKey;` (import the type) and the items' gates:

| Item | Old | New |
|---|---|---|
| Umumiy ma'lumotlar | — | `permission: "payments.view"` |
| Kutilyotgan to'lovlar | — | `permission: "payments.view"` |
| Xarajatlar | `[1, 2]` | `permission: "expenses.view"` |
| Ish haqi | `[1, 2]` | `permission: "salary.view"` |
| Qarzdorlik | — | `permission: "debt.view"` |
| To'lov tizimlari jurnali | `[1]` | `permission: "payments.gateway-log"` |

`client/src/lib/reports-nav.ts`: replace `visibleForRoles?: number[];` with `permission?: PermissionKey;`, delete `CEO_BD` and `hasAny`, and gate the items:

| Item | New |
|---|---|
| To'lov hisobotlari | `permission: "reports.payments"` |
| O'quvchi to'lovi | `permission: "reports.finance"` |
| Ketgan o'quvchilar hisoboti | `permission: "reports.students"` |
| Bitiruvchilar | `permission: "reports.students"` |
| Lidlar hisoboti | `permission: "reports.leads"` |
| Marketing | `permission: "reports.finance"` |
| Markaz faoliyat statistikasi | `permission: "reports.students"` |
| Davomat statistikasi | `permission: "reports.students"` |
| Bot hisoboti | `permission: "reports.students"` |

and replace the two functions:
```ts
/** May the user enter the reports section at all — at least one report shows. */
export function canEnterReports(can: Can): boolean {
  return reportsNavSections.some((s) =>
    s.items.some((i) => !i.permission || can(i.permission)),
  );
}

/**
 * May the user open this report page. `/reports` itself needs one visible
 * report. A page the menu does not list (a future inner path) stays with the
 * money-report holders, so a new report never opens to an administrator by
 * itself.
 */
export function canOpenReportPath(can: Can, pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/reports") return canEnterReports(can);
  const item = reportsNavSections
    .flatMap((s) => s.items)
    .find((i) => path === i.url || path.startsWith(`${i.url}/`));
  if (!item) return can("reports.finance");
  return !item.permission || can(item.permission);
}
```

`client/src/lib/daf-nav.ts`: replace `visibleForRoles?: number[];` with `permission?: PermissionKey;`, delete `CEO_BD_ADMIN` and `hasAny`, gate both items with `permission: "daf.activity"`, and replace the functions:
```ts
export function canEnterDaf(can: Can): boolean {
  return dafNavItems.some((i) => !i.permission || can(i.permission));
}

/**
 * May the user open this page. A path the menu does not list (a future
 * `/daf/kontent`) stays with the CEO alone — a new page never opens to an
 * administrator by itself. Stricter than `canOpenReportPath`, on purpose.
 */
export function canOpenDafPath(
  can: Can,
  pathname: string,
  roleIds: readonly number[],
): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  // Without `i.url !== "/daf"`, the root item would match every `/daf/...`
  // path as a prefix and the CEO-only fallback below would never run.
  const item = dafNavItems.find(
    (i) => path === i.url || (i.url !== "/daf" && path.startsWith(`${i.url}/`)),
  );
  if (!item) return roleIds.includes(1);
  return !item.permission || can(item.permission);
}
```

`client/src/lib/settings-nav.ts`: replace `visibleForRoles?: number[];` with `permission?: PermissionKey;` and gate the twelve entries:

| Entry | Old | New |
|---|---|---|
| Kurslar, Xonalar, Dam olish kunlari, Sabablar | `[1, 2, 3]` | `permission: "settings.reference"` |
| Avtomatik pauza | `[1, 2]` | `permission: "settings.absence-pause"` |
| Arxiv | `[1]` | `permission: "settings.archive"` |
| DaF normasi | `[1]` | `permission: "settings.company"` |
| Kompaniya ma'lumotlari | `[1, 2, 3]` | `permission: "settings.reference"` (the form inside edits only with `settings.company`) |
| Xodimlar | `[1, 2]` | `permission: "employees.view"` |
| Filiallar | `[1, 2]` | `permission: "settings.branches"` |
| Telegram guruhlar | `[1, 2]` | `permission: "settings.telegram-groups"` |
| To'lov | `[1, 2]` | `permission: "settings.payment"` |

Replace the three functions:
```ts
/** Sections of /settings this user sees; a section with nothing visible is dropped. */
export function getVisibleSettingsSections(can: Can): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(item.permission)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * May the user open a /settings page or a page under it: the entry's gate.
 * SettingsLayoutShell sends anyone else back. A path no entry owns is open.
 */
export function canOpenSettingsPath(pathname: string, can: Can): boolean {
  const item = settingsNavSections
    .flatMap((section) => section.items)
    .find((entry) => pathname === entry.url || pathname.startsWith(`${entry.url}/`));
  return !item?.permission || can(item.permission);
}

/** May the user open an employee's page, /settings/employees/<id>. */
export function canOpenEmployeeSettings(can: Can): boolean {
  return can("employees.view");
}

/** Every capability that shows some /settings entry — the sidebar item's gate. */
export const SETTINGS_PERMISSIONS: PermissionKey[] = [
  ...new Set(
    settingsNavSections
      .flatMap((s) => s.items)
      .map((i) => i.permission)
      .filter((p): p is PermissionKey => p !== undefined),
  ),
];
```

- [ ] **Step 4: Point the menus and guards at `can`**

`client/src/components/app-sidebar.tsx`: after `const userRoleIds = …` add `const can = usePermissions((s) => s.can);`, delete the `isVisible` arrow, and write the three filters as `navItems.filter((item) => isNavGateOpen(item, can, userRoleIds))`, `item.children?.filter((c) => isNavGateOpen(c, can, userRoleIds))`, `child.children?.filter((gc) => isNavGateOpen(gc, can, userRoleIds))`. Import `isNavGateOpen` from `@/lib/nav-items` and `usePermissions` from `@/hooks/use-permissions`.

`payments-mobile-menu.tsx` and `reports-mobile-menu.tsx`: replace the `visibleForRoles` filter body with `return !item.permission || can(item.permission);` and get `can` with `usePermissions((s) => s.can)`.

`settings-menu.tsx`: `getVisibleSettingsSections(user.roles.map((r) => r.id))` → `getVisibleSettingsSections(can)` with `const can = usePermissions((s) => s.can);`.

`settings-layout-shell.tsx`:
```tsx
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  // One rule with the /settings list (`permission` in settings-nav.ts), so a
  // page hidden from a user is closed to them by URL too. Wait for the list:
  // redirecting on "not known yet" would bounce everyone on a fresh sign-in.
  const redirectTo =
    !user || !ready
      ? null
      : getVisibleSettingsSections(can).length === 0
        ? "/"
        : canOpenSettingsPath(pathname, can)
          ? null
          : "/settings";

  useEffect(() => {
    if (redirectTo) router.replace(redirectTo);
  }, [redirectTo, router]);

  if (redirectTo || (user && !ready)) return null;
```
(remove `roleIds`).

`reports-layout-shell.tsx`:
```tsx
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  const canViewReports = canOpenReportPath(can, pathname);

  useEffect(() => {
    if (user && ready && !canViewReports) router.replace("/");
  }, [user, ready, canViewReports, router]);

  if (user && (!ready || !canViewReports)) return null;
```

`daf-layout-shell.tsx`: the same shape — `const ruxsat = canOpenDafPath(can, pathname, user?.roles.map((r) => r.id) ?? []);`, redirect only when `user && ready && !ruxsat`, render nothing while `user && (!ready || !ruxsat)`.

`payments-layout-shell.tsx`: replace `CEO_BD_ONLY_PATHS` and `isCeoOrDirector` with:
```tsx
/** Moliya pages some Moliya users may not open, and the capability each needs. */
const PAGE_PERMISSIONS: Array<[string, PermissionKey]> = [
  ["/payments/expenses", "expenses.view"],
  ["/payments/salary", "salary.view"],
];
```
```tsx
  const can = usePermissions((s) => s.can);
  const ready = usePermissionsReady();
  const needed = PAGE_PERMISSIONS.find(([prefix]) => pathname.startsWith(prefix))?.[1];
  const blocked = !!user && ready && needed !== undefined && !can(needed);
```
and keep the existing redirect effect; render nothing while `blocked || (!!user && needed !== undefined && !ready)`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run src/lib`
Expected: PASS — the same per-role expectations as before.

- [ ] **Step 6: Type-check, lint, commit**

```bash
cd client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
git add -A src/lib src/components/app-sidebar.tsx src/components/payments src/components/reports src/components/settings src/components/daf-center
git commit -m "refactor(permissions): menus and page guards read capabilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
Expected before committing: `tsc` clean; the lint summary line shows 0 errors.

---

### Task 17: Groups, attendance, schedule and home page read capabilities

**Files:** the rows of Appendix E marked «Task 17», and their tests: `client/src/components/dashboard/dashboard-home-visibility.test.ts`, `client/src/components/dashboard/launch/resolve-launch-visibility.test.ts`, `client/src/components/groups/group-form-empty-hints.test.ts` (each exists next to its file; if one does not, skip it).

**Interfaces:**
- Consumes: `useCan`, `usePermissions`, `usePermissionsReady`, `CanLink`, `Can`, `canForRoles` (Task 15).
- Produces: `resolveHomeSections(can: Can): HomeSections`, `canSeeLaunchJourney(can: Can): boolean`, and the group-form hint helper taking `can` instead of role ids.

- [ ] **Step 1: Update the pure helpers' tests first**

In `dashboard-home-visibility.test.ts`, `resolve-launch-visibility.test.ts` and `group-form-empty-hints.test.ts`, replace every role-id argument `X` with `canForRoles(X)` (import from `@/test-support/server-catalog`), keeping every expected value. Delete the `isTeacherOnly` cases from `dashboard-home-visibility.test.ts` and add:
```ts
  it("shows the dashboard to every role that has the home panel, and the schedule to a teacher", () => {
    expect(canForRoles([3])("dashboard.view")).toBe(true);
    expect(canForRoles([5])("dashboard.view")).toBe(true);
    expect(canForRoles([4])("dashboard.view")).toBe(false);
    expect(canForRoles([4, 5])("dashboard.view")).toBe(true);
  });
```
Run: `cd client && npx vitest run src/components/dashboard src/components/groups`
Expected: FAIL (the helpers still take role ids).

- [ ] **Step 2: Convert the helpers**

`dashboard-home-visibility.ts`: delete `isTeacherOnly`; replace `resolveHomeSections`:
```ts
export function resolveHomeSections(can: Can): HomeSections {
  const money = can("reports.finance");
  const outreach = can("outreach.view");
  const staff = can("dashboard.view");
  return {
    money,
    people: staff,
    attention: staff,
    attentionOutreachRows: outreach,
    nextLessons: staff,
    leadFunnel: can("reports.leads"),
    leadFunnelDetails: can("reports.leads"),
  };
}
```
(The role-id constants at the top stay only if something else imports them; otherwise delete them.)

`dashboard-client.tsx` line 26: replace `if (isTeacherOnly(roleIds)) return <ScheduleClient />;` with
```tsx
  if (!ready) return null;
  if (!can("dashboard.view")) return <ScheduleClient />;
```
with `const can = usePermissions((s) => s.can);` and `const ready = usePermissionsReady();` (drop `roleIds` if unused).

`home-overview.tsx` line 35 and `home-charts.tsx` line 30: `resolveHomeSections(roleIds)` → `resolveHomeSections(can)` with `const can = usePermissions((s) => s.can);`.

`launch/resolve-launch-visibility.ts`: `canSeeLaunchJourney(can: Can) { return can("settings.branches"); }`; the function at line 35 takes `can` instead of `roleIds` and calls `canSeeLaunchJourney(can)`; `branch-launch-card.tsx` line 54 passes `can`.

`groups/group-form-empty-hints.ts`: the `roleIds` parameter becomes `can: Can`; `managesStructure = can("courses.create")`; its caller passes `usePermissions((s) => s.can)`.

- [ ] **Step 3: Convert the components** — every other «Task 17» row of Appendix E, exactly as the row says.

- [ ] **Step 4: Run, type-check, lint**

Run: `cd client && npx vitest run src/components/dashboard src/components/groups src/lib`
Expected: PASS.
Run: `cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5`
Expected: no type errors; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
cd client
git add -A src/components/dashboard src/components/dashboard-client.tsx src/components/groups src/components/students/student-group-card.tsx
git commit -m "refactor(permissions): groups, attendance and home page read capabilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Students, money pages and reports read capabilities

**Files:** the rows of Appendix E marked «Task 18», and `client/src/components/payments/salary-settings-access.test.ts`, `client/src/components/payments/debt-write-off-actions.test.ts` (if present).

**Interfaces:**
- Consumes: `useCan`, `usePermissions`, `CanLink`, `Can`, `canForRoles` (Task 15).
- Produces: `salarySettingsAccess` (the exported function of `salary-settings-access.ts`, whatever its current name) taking `can: Can` where it took `roleIds`; `canUndoWriteOff(canUndo: boolean, row)`; the salary components' `canClose` prop (was `isCeo`).

- [ ] **Step 1: Update the two pure helpers' tests first**

`salary-settings-access.test.ts`: replace each role-id argument with `canForRoles(X)`, keeping expectations. `debt-write-off-actions.test.ts`: the first argument stays a boolean; rename the cases' wording from «CEO» to «may undo» if they name it.
Run: `cd client && npx vitest run src/components/payments`
Expected: FAIL.

- [ ] **Step 2: Convert the helpers**

`salary-settings-access.ts`: the parameter `roleIds: number[]` becomes `can: Can`; lines 20–21 become
```ts
  const ceo = can("salary.rate-edit");
  const director = can("salary.rate");
```
Keep the rest (the ADR-0034 target rules). Its callers pass `usePermissions((s) => s.can)`.

`debt-write-off-actions.ts`: rename the first parameter `isCeo` to `canUndo` (logic unchanged).

- [ ] **Step 3: Convert the components** — every other «Task 18» row of Appendix E, exactly as the row says. For the salary components, rename the `isCeo` prop to `canClose` where Appendix E says so, in the prop type and every use.

- [ ] **Step 4: Run, type-check, lint**

Run: `cd client && npx vitest run src/components/payments src/components/students src/components/reports src/lib`
Expected: PASS.
Run: `cd client && npx tsc --noEmit && npm run lint 2>&1 | tail -5`
Expected: no type errors; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
cd client
git add -A src/components/students src/components/payments src/components/reports
git commit -m "refactor(permissions): student, money and report pages read capabilities

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Settings, staff, links and search read capabilities; role lists deleted

**Files:** the rows of Appendix E marked «Task 19»; their tests `client/src/components/notifications/notification-href.test.ts`, `client/src/components/tasks/task-href.test.ts`; delete `client/src/lib/role-access.ts`, `client/src/lib/role-access.test.ts`, `client/src/components/shared/role-link.tsx`, `client/src/components/shared/role-link.test.ts`.

**Interfaces:**
- Consumes: Tasks 15–16.
- Produces: `notificationHref(…, can: Can)` and `taskEntityHref(…, can: Can)` (the role-id parameter becomes `can`; keep the other parameters and the names the files already export); `CommentItem`'s `canModerate` prop (was `isCeo`).

- [ ] **Step 1: Update the two link helpers' tests first**

In `notification-href.test.ts` and `task-href.test.ts` replace each role-id argument with `canForRoles(X)`; keep every expected href.
Run: `cd client && npx vitest run src/components/notifications src/components/tasks`
Expected: FAIL.

- [ ] **Step 2: Convert the two helpers**

`notification-href.ts`: replace `ENTITY_PAGE_ROLES` with
```ts
const ENTITY_PAGE_PERMISSION: Record<string, PermissionKey> = {
  Student: "students.profile",
  Group: "groups.view",
};
```
and the check with `const needed = ENTITY_PAGE_PERMISSION[relatedEntityType]; if (needed && !can(needed)) return null;`; the employee-settings branch calls `canOpenEmployeeSettings(can)`.

`task-href.ts`: `ENTITY_PAGE_ROLES` becomes
```ts
const ENTITY_PAGE_PERMISSION: Record<string, PermissionKey> = {
  Student: "students.profile",
  Group: "groups.view",
  User: "employees.view",
};
```
with the same check; delete `EMPLOYEE_SETTINGS_ROLES`.
Their callers pass `usePermissions((s) => s.can)` (or `usePermissions.getState().can` outside React).

- [ ] **Step 3: Convert the components** — every other «Task 19» row of Appendix E.

- [ ] **Step 4: Delete the role lists**

Delete `src/lib/role-access.ts`, `src/lib/role-access.test.ts`, `src/components/shared/role-link.tsx`, `src/components/shared/role-link.test.ts`.
Run: `cd client && grep -rn "role-access\|RoleLink\|hasAnyRole\|visibleForRoles\|_ROLES\b" src`
Expected: no output except `ENTITY_PANEL_ROLES`, `MANAGER_ROLES` (Appendix E «kept») and comments. Fix any other hit.

- [ ] **Step 5: Run everything on the client**

Run: `cd client && npx vitest run && npx tsc --noEmit && npm run lint 2>&1 | tail -5 && npx next build 2>&1 | tail -15`
Expected: all tests PASS, no type errors, 0 lint errors, `next build` succeeds.

- [ ] **Step 6: Commit**

```bash
cd client
git add -A src
git commit -m "refactor(permissions): settings and staff pages read capabilities; role-id lists removed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: ADR, access document, client rules, spec

**Files:**
- Create: `docs/adr/00NN-imkoniyat-rol-emas.md` (NN = next free number on `origin/main`)
- Modify: `docs/adr/README.md` (index row)
- Modify: `docs/role-access.md`
- Modify: `client/CLAUDE.md` («Role-Based Access Control (RBAC) — Frontend Rules», «Settings Page», «Testing»)
- Modify: `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md` (§8 guide bullet, §15)

- [ ] **Step 1: Pick the number**

Run: `git fetch origin main && git show origin/main:docs/adr/README.md | grep -oE '^\| \[0[0-9]{3}\]' | tail -3`
Use the next number after the highest (0076 if 0075 is taken). Replace `00NN` everywhere in this task, in `server/CLAUDE.md` (Task 14 wrote `ADR-00NN`) and in the commit messages' text if any.

- [ ] **Step 2: Write the ADR** (Uzbek, Nygard format, like the other ADRs):

```markdown
# 00NN. Ruxsat — imkoniyat, rol — kimlik

**Holati:** Qabul qilindi · **Sana:** 2026-10-10 · **Spec:** `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md`

## Kontekst

Kim nima qila olishi kodga qattiq yozilgan edi: serverda 250 ta `@Roles(...)`, saytda 65 faylda rol raqamlari. Har o'zgarish uchun dasturchi kerak bo'lardi, CEO esa xodimlarga imkoniyatni o'zi ochib-yopmoqchi (05.10.2026). Bundan tashqari token o'z rollarini bir soat saqlardi (ADR-0028): roldan chiqarilgan xodim bir soatgacha eski rolida ishlardi.

## Qaror

1. **Rol — kimlik, imkoniyat — ruxsat.** Rol qaysi portalga kirish, filial qamrovi, kimning hisobini o'zgartirish (ADR-0026/0027) va o'qituvchining o'z guruhlarini belgilaydi. «Nima qila oladi?» degan savolga imkoniyat javob beradi.
2. **Katalog bitta:** `server/src/common/permissions/permission-catalog.ts` — 14 bo'lim, 64 imkoniyat, har birining o'zbekcha nomi va boshlang'ich rollari. Boshlang'ich holat 10.10.2026 dagi route'larning aniq nusxasi.
3. **Har route aniq bitta belgi oladi:** `@Can`, `@AnyStaff`, `@AnyUser`, `@StudentOnly` yoki `@Public`. Belgisiz route rad etiladi. `@Roles` va `RolesGuard` olib tashlandi.
4. **Rollar har so'rovda bazadan o'qiladi** (`whereUserMayAct()`, 10 soniyalik kesh). Roldan chiqarish keyingi so'rovda ishlaydi. Bloklangan hisob Redis ishlamasa ham hech narsa qila olmaydi.
5. **CEO hamma imkoniyatga ega**, bu o'chmaydi.
6. **Boshlang'ich holat qotirilgan.** `permission-routes.spec.ts` har bir route'ni o'zgarishdan oldingi suratga (`route-access.snapshot.json`) solishtiradi. Ataylab qilingan 33 ta farq `intentional-access-changes.ts` da sababi bilan yozilgan: 28 tasida ekranda yopiq ma'lumot serverda ham yopildi, 5 tasida kassir o'z oyligini o'qiy oladi.

## Ko'rib chiqilgan muqobillar

- **Faqat ekrandan yashirish.** Rad etildi: yopilgan sahifa manzil orqali ochilardi, bugun yopiq narsani ochib bo'lmasdi.
- **Har route'ga alohida kalit.** Rad etildi: 375 ta texnik kalitni CEO tushunmaydi, bog'liqlikni kuzatib bo'lmaydi.
- **CEO o'zi yangi rol yaratadi.** Rad etildi (CEO, 05.10): yangi rol uchun portal, rank, kim beradi kabi qoidalarni ham yozish kerak bo'lardi. Buning o'rniga alohida xodimga istisno beriladi (3-bosqich).

## Oqibatlari

- 2-bosqichda CEO «Ruxsatlar» sahifasida boshlang'ich holatni o'zgartiradi. U faqat `PermissionsService` ichida o'qiladi, boshqa kod o'zgarmaydi.
- Yangi route: belgi + suratda qator; standartni o'zgartirish: `intentional-access-changes.ts` da sabab bilan.
- Xizmat ichidagi «nima qila oladi» tekshiruvlari `PermissionsService.has()` dan foydalanadi, rol nomidan emas.
- ADR-0028 dagi «rol o'zgarishi tokenni to'xtatmaydi» bandi endi amal qilmaydi: rollar har so'rovda bazadan olinadi.
```

Add the index row to `docs/adr/README.md` (same table format as the rows above it):
```markdown
| [00NN](00NN-imkoniyat-rol-emas.md) | Ruxsat — imkoniyat, rol — kimlik: route'lar katalogdagi imkoniyat bilan tekshiriladi, rollar har so'rovda bazadan | Qabul qilindi | 2026-10-10 |
```

- [ ] **Step 3: Rewrite the head of `docs/role-access.md`**

Insert under the title, before «## Roles»:
```markdown
> **Since ADR-00NN the source of truth is the capability catalog** (`server/src/common/permissions/permission-catalog.ts`). Every route checks a capability (`@Can`), and every screen asks `useCan(...)`. The tables below describe the **default** state — what each role holds until the CEO changes it (stage 2). When a table and the catalog disagree, the catalog wins and the table is corrected.
```
Replace the «Implementation Checklist (for new features)» list with:
```markdown
1. **Backend:** give the route one marker — `@Can('key')` for an action, `@AnyStaff()` for reference data or the caller's own data, `@AnyUser()` for any signed-in account, `@StudentOnly()` for the student portal. A new action reuses a capability or adds one to the catalog (Uzbek label, section, default roles, `requires`). Add the route's row to `route-access.snapshot.json`.
2. **Backend:** if a Branch Director or an Administrator may call it, scope the data by branch in the service.
3. **Frontend:** hide what the user may not use with `useCan('key')` (or `CanLink` for a link to a page).
4. **Docs:** update this file's default tables.
```
Replace the «Common frontend patterns» code block with:
```tsx
const canManage = useCan("groups.manage");           // one capability
const canSearch = useCan(["students.list", "leads.view"]); // any of several
<CanLink perm="groups.view" href={`/groups/${id}`}>{name}</CanLink>
```
In the debt-page, groups and students sections, replace the mentions of `CALL_LOG_ROLES`, `FROZEN_BALANCE_ACTION_ROLES`, `GROUP_PAGE_ROLES`, `STUDENT_PROFILE_ROLES`, `RoleLink` with `useCan("calls.log")`, `useCan("balance.withdraw")` / `useCan("refunds.create")`, `"groups.view"`, `"students.profile"`, `CanLink`. Under «Reports» add: «Ketgan o'quvchilar, davomat, markaz faoliyati va o'quvchi to'lovlari hisobotlari serverda ham faqat CEO va filial direktoriga (ADR-00NN; ilgari menyuda yashirin, serverda adminga ochiq edi).»

- [ ] **Step 4: Update `client/CLAUDE.md`**

Replace the «Frontend role-check pattern» block and the two `visibleForRoles` / `role-access.ts` bullets of «Role-Based Access Control (RBAC) — Frontend Rules» with:
```markdown
#### Capabilities, not role ids (ADR-00NN)

- **Ask `useCan('key')` (one capability) or `useCan(['a', 'b'])` (any of several)** from `@/hooks/use-permissions`. The keys are `@/lib/permission-keys` — a copy of the server catalog that `permission-keys.test.ts` compares with it. Never compare role ids to decide what a user may do.
- **Role ids stay only for identity:** student vs staff (middleware, login), the CEO's all-branches switcher, teacher-only views (own groups, schedule home), the task ladder (ADR-0074) and the form fields that edit an employee's roles.
- **The list arrives from `GET /permissions/me`** into the `usePermissions` store (`PermissionsSync` in `AuthProvider` loads it, keeps the last list in `localStorage` per user, re-reads it on window focus after 30 s and after any 403). Until it is known, `useCan` answers false: a page guard must wait for `usePermissionsReady()` before redirecting.
- **Menus are gated by `permission` (any of) on the item** — `nav-items.ts`, `payments-nav.ts`, `reports-nav.ts`, `daf-nav.ts`, `settings-nav.ts`; `forRoles` is for identity-only items (a teacher's own salary). The menu tests build `can` with `canForRoles([...])` from `@/test-support/server-catalog`, which loads the SERVER's defaults: a test that keeps its per-role expectations proves the menu did not change.
- **A link to a page some viewers cannot open is `CanLink`** (`@/components/shared/can-link`): those viewers get the text without the link.
```
In «Settings Page» replace «`visibleForRoles` matching the backend `@Roles()`» with «`permission` — the capability the page's endpoints check» and «Link to an employee's page only when `canOpenEmployeeSettings(roleIds)`» with «… `canOpenEmployeeSettings(can)`». In «Testing» replace «Controller guard tests are mandatory — … `@Roles()` … `RolesGuard` …» with «Route access tests are mandatory — a route's marker and default roles are asserted with `routeAccess()` / `defaultRolesOf()` (`server/src/common/permissions/testing.ts`)».

- [ ] **Step 5: Spec**

In the spec's §8, replace the bullet «qo'llanma sahifalarining filtri;» with nothing (delete the line) and add after the bullet list: «Qo'llanma sahifalarining rol filtri o'zgarmaydi: u sahifa kimga yozilganini (auditoriya) bildiradi, ruxsat emas.» Append to §15:
```markdown
- 2026-10-10 (reja) — qo'llanmaning rol filtri imkoniyatga o'tmaydi: u auditoriya, ruxsat emas (8-bo'lim).
```

- [ ] **Step 6: Commit**

```bash
git add docs client/CLAUDE.md
git commit -m "docs(permissions): ADR-00NN, role-access defaults, client rules

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: Full verification, each role in the browser, PR

**Files:** none (verification); PR text.

- [ ] **Step 1: Server, whole suite**

Run: `cd server && npm test && npm run typecheck && npx eslint src 2>&1 | tail -3 && npm run build`
Expected: all PASS; ESLint `0 errors`; build succeeds.

- [ ] **Step 2: Client, whole suite**

Run: `cd client && npx vitest run && npx tsc --noEmit && npm run lint 2>&1 | tail -3 && npx next build 2>&1 | tail -10`
Expected: all PASS; 0 lint errors; build succeeds.

- [ ] **Step 3: Each role in the browser (local)**

Follow the memory note «Lokal: rol» (`reference_local_role_browser_check.md`): run the API and the client locally against the dev database, sign in as a CEO, a Branch Director, an Administrator, a Cashier, a Teacher and an Administrator + Cashier account. For each, record on one line: the sidebar items, the Moliya / Hisobotlar / Sozlamalar sub-items, and whether `/settings/employees`, `/payments/salary`, `/reports/departed-students` open or bounce. Compare with the same list taken on `main` (start the client from the main checkout's build, or read the old `visibleForRoles` from `git show origin/main:client/src/lib/nav-items.ts`). Expected: identical lists for every role.

- [ ] **Step 4: Check the 403s Appendix C introduces**

As the Administrator: `GET /api/reports/departed-students/summary` → 403; as the Cashier: `GET /api/salary/me/summary` → 200. As the Teacher: `GET /api/students?page=1&pageSize=1` → 200 (own groups' students). Use the browser's devtools or `curl` with the session token.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin worktree-ruxsatlar-tizimi
gh pr create --base main --head worktree-ruxsatlar-tizimi --title "Ruxsatlar tizimi — 1-bosqich: imkoniyatlar katalogi, route belgilari, rollar bazadan" --body "$(cat <<'EOF'
## What

Stage 1 of the permissions system (spec docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md, ADR-00NN):

- One capability catalog (64 capabilities, today's role defaults) — server/src/common/permissions/permission-catalog.ts
- Every route carries exactly one access marker (@Can / @AnyStaff / @AnyUser / @StudentOnly / @Public); @Roles and RolesGuard are gone; an unmarked route is refused
- Roles are read from the database on every request (10 s cache): a removed role stops working on the next request
- GET /permissions/me; the client hides menus, tabs and buttons with useCan(...)

## Nothing visible changes

- permission-routes.spec.ts compares every route with the snapshot taken from main before the conversion
- 33 intentional server differences, each with its reason: intentional-access-changes.ts (28 routes that no screen of that role calls are closed on the server too; 5 /salary/me/* routes open to the cashier's own data)
- The client menu tests keep their per-role expectations and build `can` from the server catalog

## Checks

- [ ] server: npm test, typecheck, eslint, build
- [ ] client: vitest, tsc, lint, next build
- [ ] browser: CEO, Branch Director, Administrator, Cashier, Teacher, Administrator+Cashier see the same menus as on main

Deploy order: server first, then the client (the client reads GET /permissions/me).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Do not merge: the CEO merges.

---

## Appendix A — the catalog at a glance

D = Branch Director (2), A = Administrator (3), T = Teacher (4), K = Cashier (5); «—» = the CEO alone. The code is Task 1, Step 5.

| Key | Section | Default | Requires |
|---|---|---|---|
| `students.list` | students | D A | |
| `students.profile` | students | D A K | |
| `students.details` | students | D A | students.profile |
| `students.manage` | students | D A | students.profile |
| `students.enroll` | students | D A | students.profile, groups.view |
| `students.sms` | students | D A | students.details |
| `students.initial-balance` | students | — | students.profile |
| `groups.view` | groups | D A T | |
| `groups.manage` | groups | D A | groups.view |
| `lessons.change` | groups | D A | groups.view |
| `lessons.change-delete` | groups | D | lessons.change |
| `attendance.mark` | groups | D A T | groups.view |
| `attendance.fix` | groups | D A | attendance.mark |
| `leads.view` | leads | D A | |
| `leads.manage` | leads | D A | leads.view |
| `leads.setup` | leads | D A | leads.view |
| `leads.forms` | leads | D A | |
| `outreach.view` | outreach | D A | |
| `calls.log` | outreach | D A | |
| `mock.view` | mock | D A | |
| `mock.manage` | mock | D A | mock.view |
| `mock.payments` | mock | D A | mock.view |
| `payments.view` | payments | D A K | |
| `payments.create` | payments | D A K | |
| `payments.correct` | payments | D A | students.details |
| `debt.view` | payments | D A K | |
| `debt.promise` | payments | D A K | debt.view |
| `balance.withdraw` | payments | D A | students.profile |
| `refunds.create` | payments | D A | students.profile |
| `debt.write-off` | payments | D A | students.details |
| `balance.adjust` | payments | D | students.details |
| `money.undo` | payments | — | students.details |
| `payments.gateway-log` | payments | — | payments.view |
| `expenses.view` | expenses | D | |
| `expenses.manage` | expenses | D | expenses.view |
| `cash.manage` | expenses | D | |
| `salary.view` | salary | D | |
| `salary.rate` | salary | D | salary.view |
| `salary.pay` | salary | D | salary.view |
| `salary.rate-edit` | salary | — | salary.view |
| `salary.close` | salary | — | salary.view |
| `reports.finance` | reports | D | |
| `reports.payments` | reports | D A | |
| `reports.students` | reports | D | |
| `reports.leads` | reports | D A | |
| `teachers.view` | staff | D A | |
| `teachers.manage` | staff | D | teachers.view |
| `employees.view` | staff | D | |
| `employees.manage` | staff | D | employees.view |
| `employees.invite` | staff | D A | |
| `comments.write` | comments | D A | |
| `comments.delete` | comments | — | comments.write |
| `settings.reference` | settings | D A | |
| `courses.create` | settings | D | settings.reference |
| `settings.branches` | settings | D | |
| `settings.payment` | settings | D | |
| `settings.telegram-groups` | settings | D | |
| `settings.absence-pause` | settings | D | |
| `telegram.announce` | settings | — | settings.telegram-groups |
| `settings.company` | settings | — | |
| `settings.archive` | settings | — | |
| `dashboard.view` | home | D A K | |
| `daf.activity` | daf | D A | |
| `media.view` | daf | D A | |

---

## Appendix B — route map

«Today» is the role set of `route-access.snapshot.json` (C = CEO; D, A, T, K as above). «Marker» replaces `@Roles`. A row marked **(C)** is in Appendix C: its default access after the change is the snapshot ⊕ that entry. `@Public()` routes are unchanged and not listed. A controller whose rows all carry the same marker may take it once at class level.

**Student portal — every `@Roles('Student')` becomes `@StudentOnly()` at the same level:** `students/student-portal.controller.ts` (11), `daf/daf-portal.controller.ts` (16), `students/onboarding/student-onboarding.controller.ts` (5), `students/extra-phone/student-extra-phone.controller.ts` (4), `statements/statement-portal.controller.ts` (1), `app-activity/student-activity.controller.ts` (1), `telegram/telegram-statement.controller.ts` (1).

### students/students.controller.ts
| Route | Today | Marker |
|---|---|---|
| POST /students | CDA | `@Can('students.manage')` |
| GET /students | CDATK | `@Can('students.list', 'payments.create', 'groups.view')` |
| GET /students/:id | CDAK | `@Can('students.profile')` |
| PATCH /students/:id | CDA | `@Can('students.manage')` |
| DELETE /students/:id | CDA | `@Can('students.manage')` |
| PATCH /students/:id/status | CDA | `@Can('students.manage')` |
| GET /students/:id/status-history | CDA | `@Can('students.details')` |
| GET /students/:id/balance-summary | CDAK | `@Can('students.profile')` |
| GET /students/:id/debt-origin | CDAK | `@Can('students.profile')` |
| GET /students/:id/active-enrollments-prepaid | CDA | `@Can('students.details')` |
| GET /students/:id/closed-enrollments | CDA | `@Can('students.details')` |
| GET /students/:id/lessons-overview | CDA | `@Can('students.details')` |
| GET /students/:id/departure-preview | CDA | `@Can('students.enroll')` |
| GET /students/:id/enroll-preview | CDA | `@Can('students.enroll')` |
| POST /students/:id/enroll | CDA | `@Can('students.enroll')` |
| DELETE /students/:id/enroll/:enrollmentId | CDA | `@Can('students.enroll')` |
| GET /students/:id/enrollments/:enrollmentId/debt-write-off-eligibility | CDA | `@Can('debt.write-off')` |
| POST /students/:id/enrollments/:enrollmentId/write-off-cycle-debt | CDA | `@Can('debt.write-off')` |
| GET /students/:id/sms | CDA | `@Can('students.sms')` |
| POST /students/:id/sms | CDA | `@Can('students.sms')` |
| POST /students/:id/initial-balance | C | `@Can('students.initial-balance')` |

### statements/statements.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /students/:id/statement | CDA | `@Can('students.details')` |
| GET /students/:id/statement.pdf | CDA | `@Can('students.details')` |

### app-activity/student-app-activity.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /students/:id/app-activity | CDA | `@Can('students.details')` |

### app-activity/group-app-activity.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /groups/:id/app-activity | CDAT | `@Can('groups.view')` |
| GET /groups/:id/app-activity/students/:studentId | CDAT | `@Can('groups.view')` |

### app-activity/center/center-app-activity.controller.ts
All three routes (CDA: `/app-activity/center/students`, `/students/phones`, `/summary`) → `@Can('daf.activity')`.

### daf/daf-media.controller.ts
All four routes (CDA: `/daf/media/coverage`, `/overview`, `/sections/:id/fragen`, `/sections/:id/inhalt`) → `@Can('media.view')`.

### groups/groups.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /groups | CDAT | `@Can('groups.view')` |
| GET /groups/:id | CDAT | `@Can('groups.view')` |
| GET /groups/:id/students | CDAT | `@Can('groups.view')` |
| POST /groups | CDA | `@Can('groups.manage')` |
| PATCH /groups/:id | CDA | `@Can('groups.manage')` |
| PATCH /groups/:id/status | CDA | `@Can('groups.manage')` |
| DELETE /groups/:id | CDA | `@Can('groups.manage')` |
| GET /groups/:id/delete-preview | CDA | `@Can('groups.manage')` |
| GET /groups/:id/status-history | CDA | `@Can('groups.manage')` |
| GET /groups/next-name | CDA | `@Can('groups.manage')` |
| GET /groups/available-rooms | CDA | `@Can('groups.manage', 'lessons.change')` |
| GET /groups/available-slots | CDA | `@Can('groups.manage', 'lessons.change')` |
| GET /groups/available-teachers | CDA | `@Can('groups.manage', 'lessons.change')` |
| GET /groups/schedule-conflicts | CDA | `@Can('groups.manage', 'lessons.change')` |

### attendance/attendance.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /attendance/:groupId/calendar | CDAT | `@Can('groups.view')` |
| GET /attendance/:groupId/date/:date | CDAT | `@Can('groups.view')` |
| GET /attendance/:groupId/dates | CDAT | `@Can('groups.view')` |
| GET /attendance/:groupId/lesson-sequence | CDAT | `@Can('groups.view')` |
| GET /attendance/:groupId/stats | CDAT | `@Can('groups.view')` |
| POST /attendance/:groupId/date/:date | CDAT | `@Can('attendance.mark')` |
| POST /attendance/:groupId/qr-session/start | CDAT | `@Can('attendance.mark')` |
| POST /attendance/:groupId/qr-session/rotate | CDAT | `@Can('attendance.mark')` |
| POST /attendance/:groupId/qr-session/stop | CDAT | `@Can('attendance.mark')` |
| POST /attendance/:groupId/date/:date/late | CDA | `@Can('attendance.fix')` |
| POST /attendance/:groupId/date/:date/not-held | CDA | `@Can('attendance.fix')` |

### planned-absences/planned-absences.controller.ts
Both routes (CDA: `POST /planned-absences/:groupId/date/:date`, `DELETE /planned-absences/:id`) → `@Can('attendance.fix')`.

### lesson-cancellations/lesson-cancellations.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /lesson-cancellations | CDAT | `@Can('groups.view')` |
| POST /lesson-cancellations | CDA | `@Can('lessons.change')` |
| DELETE /lesson-cancellations/:id | CD | `@Can('lessons.change-delete')` |

### lesson-reschedules/lesson-reschedules.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /lesson-reschedules | CDAT | `@Can('groups.view')` |
| GET /lesson-reschedules/available-rooms | CDA | `@Can('lessons.change')` |
| POST /lesson-reschedules | CDA | `@Can('lessons.change')` |
| PATCH /lesson-reschedules/:id | CDA | `@Can('lessons.change')` |
| DELETE /lesson-reschedules/:id | CD | `@Can('lessons.change-delete')` |

### lesson-teacher-overrides/lesson-teacher-overrides.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /lesson-teacher-overrides | CDAT | `@Can('groups.view')` |
| PUT /lesson-teacher-overrides/:groupId/:date | CDA | `@Can('lessons.change')` |
| DELETE /lesson-teacher-overrides/:id | CD | `@Can('lessons.change-delete')` |

### leads/leads.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /leads, GET /leads/:id, GET /leads/:id/hover-summary, GET /leads/archive, GET /leads/board, GET /leads/stats, GET /leads/sections/:sectionId/leads | CDA | `@Can('leads.view')` |
| GET /leads/by-student/:studentId | CDA | `@Can('leads.view', 'students.details')` |
| PATCH /leads/:id/called | CDA | `@Can('leads.manage', 'leads.forms')` |
| POST /leads, PATCH /leads/:id, PATCH /leads/:id/move, PATCH /leads/reorder, POST /leads/:id/convert, POST /leads/:id/restore, DELETE /leads/:id | CDA | `@Can('leads.manage')` |

### leads/lead-columns.controller.ts, leads/lead-sections.controller.ts
Every route (CDA; 4 and 6 writes) → `@Can('leads.setup')`.

### leads/lead-sources.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /lead-sources, GET /lead-sources/filter | CDA | `@Can('leads.view', 'leads.forms')` |
| POST /lead-sources, PATCH /lead-sources/:id, DELETE /lead-sources/:id | CDA | `@Can('leads.setup')` |

### custom-forms/custom-forms.controller.ts
All seven staff routes (CDA) → `@Can('leads.forms')`.

### outreach/outreach.controller.ts
All five routes (CDA) → `@Can('outreach.view')`.

### call-logs/call-logs.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /call-logs | CDA | `@Can('outreach.view', 'students.details')` |
| POST /call-logs | CDA | `@Can('calls.log')` |

### mock-exams/mock-exams.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /mock-exams, GET /mock-exams/:id, GET /mock-exams/:id/stats, GET /mock-exams/board, GET /mock-exams/revenue-summary | CDA | `@Can('mock.view')` |
| POST /mock-exams, PATCH /mock-exams/:id, PATCH /mock-exams/:id/status, DELETE /mock-exams/:id, POST /mock-exams/:id/rebroadcast-results, POST /mock-exams/:id/regenerate-pdf | CDA | `@Can('mock.manage')` |

### mock-exams/mock-exam-participants.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /mock-exams/:examId/participants | CDA | `@Can('mock.view')` |
| POST /mock-exams/:examId/participants/manual, DELETE /mock-exam-participants/:id, POST /mock-exam-participants/:id/convert | CDA | `@Can('mock.manage')` |
| PATCH /mock-exam-participants/:id/payment, POST /mock-exam-participants/:id/cancel-payment, POST /mock-exam-participants/:id/mark-paid | CDA | `@Can('mock.payments')` |
| GET /students/:studentId/mock-exams | CDA | `@Can('students.details', 'mock.view')` |

### mock-exams/mock-exam-results.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /mock-exams/:examId/results-matrix | CDA | `@Can('mock.view')` |
| POST /mock-exams/:examId/scores/bulk, POST /mock-exams/:examId/recalculate-ranks | CDA | `@Can('mock.manage')` |

### mock-exams/mock-exam-sections.controller.ts, mock-exams/mock-exam-subjects.controller.ts
`GET /mock-exam-sections` and `GET /mock-exams/:examId/subjects` (CDA) → `@Can('mock.view')`; every other route of the two files (CDA) → `@Can('mock.manage')`.

### payments/payments.controller.ts
| Route | Today | Marker |
|---|---|---|
| POST /payments | CDAK | `@Can('payments.create')` |
| POST /payments/attach-external | CDAK | `@Can('payments.create')` |
| GET /payments/preview | CDAK | `@Can('payments.create')` |
| GET /payments | CDAK | `@Can('payments.view')` |
| GET /payments/:id | CDAK | `@Can('payments.view')` |
| GET /payments/pending-students | CDAK | `@Can('payments.view')` |
| GET /payments/student/:studentId | CDAK | `@Can('students.profile', 'payments.create')` |
| GET /payments/debtors | CDAK | `@Can('debt.view')` |
| GET /payments/debtors/group/:groupId | CDAK | `@Can('debt.view')` |
| GET /payments/debtors/summary | CDAK | `@Can('debt.view', 'dashboard.view')` |
| GET /payments/frozen-balances | CDAK | `@Can('debt.view')` |
| POST /payments/:id/correct | CDA | `@Can('payments.correct')` |
| POST /payments/:id/reverse | C | `@Can('money.undo')` |

### payments/debt/debt-list.controller.ts
All three routes (CDAK) → `@Can('debt.view')`.

### payment-promises/payment-promises.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /payment-promises, GET /payment-promises/month | CDAK | `@Can('debt.view', 'debt.promise', 'outreach.view')` |
| POST /payment-promises, PATCH /payment-promises/:id/cancel | CDAK | `@Can('debt.promise')` |

### refunds/refunds.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /refunds, GET /refunds/preview/:studentId, POST /refunds/quick, PATCH /refunds/:id/process | CDA | `@Can('refunds.create')` |
| POST /refunds/:id/reverse | C | `@Can('money.undo')` |

### withdrawals/withdrawals.controller.ts
Both routes (CDA) → `@Can('balance.withdraw')`.

### billing/billing.controller.ts
| Route | Today | Marker |
|---|---|---|
| POST /billing/debt-write-offs/:id/reverse | C | `@Can('money.undo')` |
| POST /billing/lesson-deduction/:id/reverse | CD | `@Can('balance.adjust')` |
| POST /billing/retroactive/:studentId **(C)** | CDA | `@Can('balance.adjust')` |

### transactions/transactions.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /transactions **(C)** | CDA | `@Can('reports.finance')` |
| GET /transactions/teacher/:teacherId **(C)** | CDA | `@Can('salary.view')` |
| GET /transactions/student/:studentId **(C)** | CDAK | `@Can('students.details')` |
| GET /transactions/student/:studentId/lesson-trail **(C)** | CDAK | `@Can('students.details')` |
| GET /transactions/debt-write-offs | CDAK | `@Can('debt.view')` |
| POST /transactions/adjustment | CD | `@Can('balance.adjust')` |

### cash-accounts/cash-accounts.controller.ts
All seven routes (CD) → `@Can('cash.manage')`.

### expenses/expenses.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /expenses, GET /expenses/pdf | CD | `@Can('expenses.view')` |
| POST /expenses, PATCH /expenses/:id, DELETE /expenses/:id | CD | `@Can('expenses.manage')` |

### payment-gateways/gateways.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /gateways/events | C | `@Can('payments.gateway-log')` |

### salary/salary.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /salary/accruals/:userId, GET /salary/advance-calendar, GET /salary/advances/:userId, GET /salary/config-history/:userId, GET /salary/config/:userId, GET /salary/configs/by-users, GET /salary/matrix, GET /salary/monthly, GET /salary/monthly/center-topup, GET /salary/monthly/user/:userId, GET /salary/overview, GET /salary/payments, GET /salary/payments/:id/breakdown, GET /salary/period-settings, GET /salary/staff-config | CD | `@Can('salary.view')` |
| POST /salary/config, POST /salary/config/preview | CD | `@Can('salary.rate')` |
| POST /salary/payments/:id/pay, POST /salary/payments/batch-pay | CD | `@Can('salary.pay')` |
| PATCH /salary/config/:id, POST /salary/config/global | C | `@Can('salary.rate-edit')` |
| POST /salary/calculate, PATCH /salary/payments/:id/approve, GET /salary/payments/settle-month/preview, POST /salary/payments/settle-month, GET /salary/period-preview, POST /salary/period-settings | C | `@Can('salary.close')` |
| GET /salary/timeline/:userId | CDA | `@Can('teachers.view')` |
| GET /salary/me/accruals, GET /salary/me/current-cycle/breakdown, GET /salary/me/monthly, GET /salary/me/payments/:id/breakdown, GET /salary/me/summary **(C)** | CDAT | `@AnyStaff()` |

### reports/reports.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /reports/expectation-history, /financial-excel, /financial-overview, /financial-trend, /income-month-attribution, /monthly-debt-recovery, /profit-composition | CD | `@Can('reports.finance')` |
| GET /reports/payment-reports, /payment-reports/teachers, /payment-reports/teachers/:teacherId/groups | CDA | `@Can('reports.payments')` |
| GET /reports/lead-analytics | CDA | `@Can('reports.leads')` |
| GET /reports/departed-students/by-reason, /by-status, /departed-after-change, /dynamics, /group-by, /list, /reasons, /summary, /teacher-change-reasons, /teacher-changes-list, /transfer-reasons, /transferred-list **(C)** | CDA | `@Can('reports.students')` |
| GET /reports/attendance-analytics, /attendance-by-course, /attendance-by-group, /teacher-performance, /center-activity, /kpis, /group-analytics, /room-utilization **(C)** | CDA | `@Can('reports.students')` |
| GET /reports/debt-write-offs-summary, /monthly-debt-recovery/:monthKey/aging, /monthly-debt-recovery/:monthKey/detail, /monthly-debt-recovery/excel, /monthly-debt-recovery/history | CDAK | `@Can('debt.view')` |
| GET /reports/student-payments **(C)** | CDAK | `@Can('reports.finance')` |
| GET /reports/student-payments/filter-options **(C)** | CDAK | `@Can('reports.finance', 'reports.students')` |

### reports/lead-funnel/reports-lead-funnel.controller.ts
Both routes (CDA) → `@Can('reports.leads')`.

### reports/marketing/reports-marketing.controller.ts
`GET /reports/marketing` (CD) → `@Can('reports.finance')`.

### dashboard/dashboard.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /dashboard/summary, GET /dashboard/charts | CDAK | `@Can('dashboard.view')` |
| GET /dashboard/today-schedule | CDATK | `@AnyStaff()` |

### search/search.controller.ts
Both routes (CDA) → `@Can('students.list', 'leads.view', 'teachers.view')`.

### common/entity-history/entity-history.controller.ts
`GET /entity-history/:entityType/:entityId` (CDA) → `@Can('students.details', 'groups.manage', 'teachers.view', 'employees.view', 'settings.reference', 'settings.branches', 'leads.view')`.

### telegram/telegram-channel-report.controller.ts
Both routes (CD) → `@Can('reports.students')`.

### users/users.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /users | CDA | `@Can('employees.view', 'teachers.view', 'groups.manage')` |
| GET /users/:id | CDA | `@Can('employees.view', 'teachers.view')` |
| POST /users, PATCH /users/:id, DELETE /users/:id | CD | `@Can('employees.manage')` |
| PATCH /users/phone | CDATK | `@AnyStaff()` |
| PATCH /users/password, PATCH /users/profile, POST /users/logout-others | ANY | `@AnyUser()` |

### teachers/teachers.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /teachers | CDA | `@Can('teachers.view', 'students.list')` |
| GET /teachers/:id | CDA | `@Can('teachers.view')` |
| GET /teachers/:id/groups | CDA | `@Can('teachers.view', 'employees.view')` |
| POST /teachers, PATCH /teachers/:id, PATCH /teachers/:id/status, DELETE /teachers/:id, GET /teachers/:id/status-history | CD | `@Can('teachers.manage')` |
| GET /teachers/:id/salary-summary | CD | `@Can('salary.view')` |

### branches/branches.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /branches, GET /branches/:id | CDATK | `@AnyStaff()` |
| POST /branches, PATCH /branches/:id, PATCH /branches/:id/status, GET /branches/:id/status-history, GET /branches/:id/readiness | CD | `@Can('settings.branches')` |

### company/company.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /company, GET /company/:id | ANY | `@AnyUser()` |
| PATCH /company/:id | C | `@Can('settings.company')` |

### settings/settings.controller.ts
Both routes (CD) → `@Can('settings.payment')`.

### courses/courses.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /courses, GET /courses/:id | CDATK | `@AnyStaff()` |
| POST /courses | CD | `@Can('courses.create')` |
| PATCH /courses/:id, PATCH /courses/:id/status, DELETE /courses/:id, GET /courses/:id/status-history | CDA | `@Can('settings.reference')` |

### rooms/rooms.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /rooms, GET /rooms/:id | CDATK | `@AnyStaff()` |
| GET /rooms/count-by-branch | ANY | `@AnyUser()` |
| POST /rooms, PATCH /rooms/:id, PATCH /rooms/:id/status, DELETE /rooms/:id, GET /rooms/:id/status-history | CDA | `@Can('settings.reference')` |

### holidays/holidays.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /holidays, GET /holidays/:id | CDATK | `@AnyStaff()` |
| POST /holidays, PATCH /holidays/:id, PATCH /holidays/:id/status, DELETE /holidays/:id, GET /holidays/:id/status-history | CDA | `@Can('settings.reference')` |

### student-exit-reasons, group-teacher-change-reasons, enrollment-transfer-reasons (three controllers, same shape)
| Route | Today | Marker |
|---|---|---|
| GET (the list) | CDA | `@Can('settings.reference', 'students.enroll', 'groups.manage')` |
| POST, PATCH /:id, DELETE /:id | CDA | `@Can('settings.reference')` |

### archive/archive.controller.ts
All five routes (C) → `@Can('settings.archive')`.

### absence-pause/absence-pause.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /absence-pause/settings | CD | `@Can('settings.absence-pause')` |
| PATCH /absence-pause/settings | C | `@Can('settings.company')` |

### telegram-groups/telegram-groups.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /telegram-groups **(C)** | CDA | `@Can('settings.telegram-groups')` |
| GET /telegram-groups/pending, PATCH /telegram-groups/:id, POST /telegram-groups/:id/approve, POST /telegram-groups/:id/reject | CD | `@Can('settings.telegram-groups')` |
| DELETE /telegram-groups/:id, POST /telegram-groups/announce | C | `@Can('telegram.announce')` |

### telegram/telegram.controller.ts
`POST /telegram/employee-link` (CDA) → `@Can('employees.invite')`.

### upload/upload.controller.ts
`POST /upload` (CDATK) → `@AnyStaff()`.

### comments/comments.controller.ts
| Route | Today | Marker |
|---|---|---|
| GET /comments, GET /comments/latest | CDA | `@Can('comments.write', 'students.details', 'groups.manage', 'teachers.view', 'employees.view')` |
| POST /comments, PATCH /comments/:id | CDA | `@Can('comments.write')` |
| DELETE /comments/:id | C | `@Can('comments.delete')` |

### tasks/tasks.controller.ts
All seventeen routes (CDATK) → one class-level `@AnyStaff()`.

### notifications/notifications.controller.ts
The nine routes open to any signed-in account (ANY) → `@AnyUser()`; the VAPID-key route stays `@Public()`.

### common/permissions/permissions.controller.ts
`GET /permissions/me` → `@AnyUser()` (Task 5).

---

## Appendix C — intentional access changes (code for Task 6)

```ts
/**
 * Reviewed differences between what a route admitted before the capability
 * conversion (`route-access.snapshot.json`) and its default access after it.
 * `permission-routes.spec.ts` applies them; every entry says why.
 *
 * Two kinds only (spec 2026-10-05 §7.6):
 * - remove: the role could call the route, but no screen of that role calls
 *   it — the server now refuses what the menu already hid;
 * - add: the caller's own data.
 */
export interface AccessChange {
  add?: string[];
  remove?: string[];
  reason: string;
}

const DEPARTED =
  "Only the «Ketgan o'quvchilar» report calls it; its menu entry is CEO/BD only.";
const ATTENDANCE =
  'Only the «Davomat statistikasi» report calls it; its menu entry is CEO/BD only.';
const NO_SCREEN = 'No screen calls it.';
const OWN_SALARY =
  "The caller's own salary (`@CurrentUser('id')`); a cashier on payroll may read it like any staff member.";

export const INTENTIONAL_ACCESS_CHANGES: Record<string, AccessChange> = {
  'GET /reports/departed-students/by-reason': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/by-status': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/departed-after-change': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/dynamics': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/group-by': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/list': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/reasons': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/summary': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/teacher-change-reasons': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/teacher-changes-list': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/transfer-reasons': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/departed-students/transferred-list': { remove: ['Administrator'], reason: DEPARTED },
  'GET /reports/attendance-analytics': { remove: ['Administrator'], reason: ATTENDANCE },
  'GET /reports/attendance-by-course': { remove: ['Administrator'], reason: ATTENDANCE },
  'GET /reports/attendance-by-group': { remove: ['Administrator'], reason: ATTENDANCE },
  'GET /reports/teacher-performance': { remove: ['Administrator'], reason: ATTENDANCE },
  'GET /reports/center-activity': {
    remove: ['Administrator'],
    reason: 'Only the «Markaz faoliyat statistikasi» report calls it; its menu entry is CEO/BD only.',
  },
  'GET /reports/kpis': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /reports/group-analytics': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /reports/room-utilization': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /reports/student-payments': {
    remove: ['Administrator', 'Cashier'],
    reason: "Only the «O'quvchi to'lovi» report calls it; its menu entry is CEO/BD only.",
  },
  'GET /reports/student-payments/filter-options': {
    remove: ['Administrator', 'Cashier'],
    reason: "Called by the «O'quvchi to'lovi» and «Ketgan o'quvchilar» reports only, both CEO/BD.",
  },
  'GET /transactions': { remove: ['Administrator'], reason: NO_SCREEN },
  'GET /transactions/teacher/:teacherId': { remove: ['Administrator'], reason: NO_SCREEN },
  'POST /billing/retroactive/:studentId': {
    remove: ['Administrator'],
    reason:
      "A recovery tool with no screen: it re-bills a student's past lessons, which a Branch Director or the CEO starts.",
  },
  'GET /telegram-groups': {
    remove: ['Administrator'],
    reason: 'Only the «Telegram guruhlar» settings page calls it; that entry is CEO/BD only.',
  },
  'GET /transactions/student/:studentId': {
    remove: ['Cashier'],
    reason: "Only «Barcha yozuvlar» in the student's «To'lovlar» tab calls it; a cashier does not see that tab.",
  },
  'GET /transactions/student/:studentId/lesson-trail': { remove: ['Cashier'], reason: NO_SCREEN },
  'GET /salary/me/accruals': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/current-cycle/breakdown': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/monthly': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/payments/:id/breakdown': { add: ['Cashier'], reason: OWN_SALARY },
  'GET /salary/me/summary': { add: ['Cashier'], reason: OWN_SALARY },
};
```

33 routes: 28 narrowed (26 for the Administrator, of which two also for the Cashier; two more for the Cashier alone), 5 widened to the cashier's own salary. **Before Task 6, re-verify every «no screen» / «only X calls it» claim** with `cd client && grep -rn "<path segment>" src` (e.g. `departed-students/`, `student-payments`, `/kpis`, `lesson-trail`, `transactions/teacher`, `billing/retroactive`, `"/telegram-groups"`): a hit outside the named page means the entry is wrong — drop it and give the route a marker that keeps the role (and tell the reviewer).

---

## Appendix D — role checks inside services and controllers

| File:line | Check | Fate |
|---|---|---|
| `attendance/attendance.controller.ts:115` | teacher-only caller (late roster) | keep — identity |
| `attendance/attendance-save.service.ts:161–267, 462, 612–634` | teacher lock after the first save, teacher texts, no teacher notes | keep — ADR-0054 teacher rules |
| `attendance/attendance-read.service.ts:689` | teacher-only debtor view | keep |
| `attendance/qr-attendance-session.service.ts:62` | teacher-only refusal text | keep |
| `attendance/shared/attendance-window-guard.ts` | teacher-only text | keep |
| `unmarked-lessons/answer-rules.ts:108` | CEO / Branch Director always answer | keep — rank |
| `lesson-cancellations`, `lesson-reschedules`, `lesson-teacher-overrides` controllers | `teacherIdScope` for a teacher-only caller | keep — scope |
| `groups/groups.controller.ts:44`, `students/students.controller.ts:70`, `dashboard/dashboard.controller.ts:65` | teacher sees own groups' data | keep — scope |
| `comments/comments.service.ts:175` | author or CEO edits | **convert** → `has(userId, 'comments.delete')` (Task 13) |
| `payments/payments-write.service.ts:623, 675, 775` | CEO bypasses the 72 h window; CEO alert | keep — rank |
| `salary/salary-advance-calendar.service.ts:209, 225` | target is a teacher | keep — data |
| `salary/salary-payment.service.ts:69, 331` | list scope; paying branch | keep — scope |
| `salary/shared/teacher-rate-permission.ts:108–110` | target's roles | keep — ADR-0034 |
| `telegram-groups/telegram-groups.service.ts:114, 310` | CEO or Branch Director approves/edits | **convert** → `has(caller.id, 'settings.telegram-groups')` (Task 13) |
| `telegram-groups/telegram-groups.service.ts:151, 272` | «Barcha filiallar» is the CEO's | keep — company level |
| `telegram-groups/telegram-groups.service.ts:370` | only the CEO disconnects the bot | **convert** → `has(caller.id, 'telegram.announce')` (Task 13) |
| `dashboard/dashboard-summary.service.ts:62–63` | money / outreach tiers | **convert** → `reports.finance` / `outreach.view` (Task 12) |
| `dashboard/dashboard-charts.service.ts:86–90` | money / operational tiers | **convert** → `reports.finance` / `outreach.view` (Task 12) |
| `courses/courses.controller.ts:34, 88` | payment model: CEO / Branch Director | **convert** → `has(userId, 'courses.create')` (Task 13) |
| `common/auth/branch-scope.ts:44`, `user-branch-scope.ts:58, 147`, `group-branch-scope.ts:43`, `branches/branches.service.ts:285` | CEO spans every branch; rank | keep — scope, ADR-0027 |
| `telegram/constants.ts:86–90` | role grant ceiling | keep — ADR-0026 |
| `telegram/scenes/employee-registration.scene.ts:462` | portal URL for a teacher | keep — identity |
| `users/users.service.ts:432, 607` | teacher filter; staff flag | keep — data |
| `branches/branch-readiness.facts.ts:155` | readiness fact | keep — data |
| `students/discount-role.guard.ts` | discount: CEO / Branch Director | keep — candidate capability for stage 2 |
| `students/shared/departure-policy-access.ts` | departure policy choice: CEO / Branch Director | keep — candidate capability for stage 2 |
| `settings/settings.controller.ts` (`resolveWriteBranchId`) | CEO writes the company level, a director their branch | keep — scope |

---

## Appendix E — client role checks

«Task» names the task that converts the row. «keep» rows stay as they are (identity, data or audience).

| Task | File:line | Now | Becomes |
|---|---|---|---|
| 16 | `components/app-sidebar.tsx:47` | `visibleForRoles` filter | `isNavGateOpen(item, can, userRoleIds)` |
| 16 | `components/payments/payments-mobile-menu.tsx:13`, `components/reports/reports-mobile-menu.tsx:16` | `visibleForRoles` filter | `!item.permission \|\| can(item.permission)` |
| 16 | `components/settings/settings-menu.tsx:16`, `settings-layout-shell.tsx`, `reports/reports-layout-shell.tsx`, `daf-center/daf-layout-shell.tsx`, `payments/payments-layout-shell.tsx:21` | role ids | Task 16, Step 4 |
| 17 | `components/groups/groups-client.tsx:101` | `canManage` [1,2,3] | `useCan("groups.manage")`; line 103 `isTeacherOnly` becomes `(user?.roles.some((r) => r.id === 4) && !user?.roles.some((r) => [1, 2, 3].includes(r.id))) ?? false` (identity) |
| 17 | `components/groups/groups-table.tsx:39` | `canManage` | `useCan("groups.manage")` |
| 17 | `components/groups/group-info-card.tsx:89` | `canManage` | `useCan("groups.manage")` (all uses) |
| 17 | `components/groups/group-detail-tabs.tsx:43` | `canManage` | three flags: `useCan("lessons.change")` for «Dars o'zgarishlari» (lines 175, 237); `useCan("groups.manage")` for «Tarix» (178, 248); `useCan(["comments.write", "groups.manage"])` for «Izohlar» (179, 268) |
| 17 | `components/groups/group-students-table.tsx:86, 88` | `canManage`, `canOpenProfile` | `useCan("students.enroll")`, `useCan("students.profile")` |
| 17 | `components/groups/lesson-changes-tab.tsx:93, 94` | `canCreate` [1,2,3], `canDelete` [1,2] | `useCan("lessons.change")`, `useCan("lessons.change-delete")`; line 544 keep (data) |
| 17 | `components/groups/group-form-empty-hints.ts:16` | `managesStructure` (1 or 2) | `can("courses.create")` (Task 17, Step 2) |
| 17 | `components/groups/attendance/attendance-cycle-dashboard.tsx:60`, `attendance-stats.tsx:96` | `isAdmin` [1,2,3] | `useCan("attendance.fix")` |
| 17 | `components/groups/attendance/attendance-form.tsx:65` | `isAdmin` [1,2,3] | `useCan("attendance.fix")`; the payment uses (line 623 `onCollectPayment`, line 658 debtor block) take `const canCollect = useCan("payments.create")` instead |
| 17 | `components/groups/attendance/attendance-student-row.tsx:103, 124`, `attendance-dots-tab.tsx:196, 216` | `RoleLink roles={STUDENT_PROFILE_ROLES}` | `CanLink perm="students.profile"` |
| 17 | `components/dashboard/dashboard-daily-schedule.tsx:195`, `home-next-lessons.tsx:64`, `dashboard-room-occupancy.tsx:473`, `components/students/student-group-card.tsx:40` | `RoleLink roles={GROUP_PAGE_ROLES}` | `CanLink perm="groups.view"` |
| 17 | `components/dashboard/dashboard-home-visibility.ts`, `dashboard-client.tsx:26`, `home-overview.tsx:35`, `home-charts.tsx:30` | role ids | Task 17, Step 2 |
| 17 | `components/dashboard/launch/resolve-launch-visibility.ts:12, 35`, `branch-launch-card.tsx:54` | 1 or 2 | `can("settings.branches")` (Task 17, Step 2) |
| 17 | `components/dashboard/schedule-client.tsx:78` | teacher-only | keep |
| 18 | `components/students/student-profile-tabs.tsx:56` | `canManage` [1,2,3] | four flags: `useCan("students.details")` for the tabs «To'lovlar», «Darslar», «Qo'ng'iroq tarixi», «Tarix», «Lid tarixi», «Mock imtihonlar», «Ilova» and `StudentClosedEnrollmentsSection` (341, 436); `useCan(["comments.write", "students.details"])` for «Izohlar»; `useCan("students.sms")` for «SMS» and its count fetch (80); `useCan("students.enroll")` for `onRemove` (331) and the departure-preview query (195) |
| 18 | `components/students/student-profile-card.tsx:78` | `canManage` | `useCan("students.details")` for the latest-comment fetch and block (123, 243); the block at 420: `useCan("students.manage")` if it renders edit or status actions, else `students.details` |
| 18 | `components/students/student-profile-card.tsx:79` | `isCeo` | `useCan("students.initial-balance")` (line 269) |
| 18 | `components/students/students-client.tsx:66` | `canManage` | `useCan("students.manage")`; line 67 `isTeacher` keep |
| 18 | `components/students/students-table.tsx:40` | `isTeacher` | keep |
| 18 | `components/students/edit-student-form.tsx:82` | `canSetDiscount` [1,2] | keep (Appendix D: discount stays identity) |
| 18 | `components/students/statement/payment-statement.tsx:34, 35` | `isCeo`, `canCorrect` | `isCeo` keep (72 h window); `canCorrect` → `useCan("payments.correct")` |
| 18 | `components/payments/debt-write-offs-client.tsx:106` | `isCeo` | `const canUndo = useCan("money.undo")`, passed to `canUndoWriteOff(canUndo, row)` |
| 18 | `components/payments/salary-client.tsx:18, 19` | `isCeo`, `canPay` [1,2] | `const canClose = useCan("salary.close")` (rename the `isCeo` prop to `canClose` in `salary-monthly-view.tsx`, `salary-breakdown-drawer.tsx`, `salary-period-control.tsx`); `useCan("salary.pay")` |
| 18 | `components/payments/salary-settings-access.ts:20, 21` | `ceo`, `director` from role ids | Task 18, Step 2; `salary-settings-sheet.tsx` passes `can` |
| 18 | `components/payments/debt/debt-drawer.tsx:66, 67, 179` | `CALL_LOG_ROLES`, `STATEMENT_ROLES`, `RoleLink` | `useCan("calls.log")`, `useCan("students.details")`, `CanLink perm="groups.view"` |
| 18 | `components/payments/debt/frozen-balance-view.tsx:74` | `canMoveBalance` | `useCan("balance.withdraw")` for «Markaz hisobiga o'tkazish», `useCan("refunds.create")` for «O'quvchiga qaytarish» — one flag per action |
| 18 | `components/payments/overview/overview-page.tsx:34` | `FINANCIAL_OVERVIEW_ROLES` | `useCan("reports.finance")` |
| 18 | `components/payments/export-options-popover.tsx:61` | `isCeo` (label) | keep |
| 18 | `components/payments/employee-advance-select.tsx:36`, `salary-config-row-sheet.tsx:109` | target is a teacher | keep |
| 18 | `components/reports/center-activity/center-activity-client.tsx:149` | `canEdit` [1,2,3] | `useCan("settings.reference")` |
| 18 | `components/reports/departed-students/departed-students-client.tsx:87` | `canManageReasons` [1,2,3] | `useCan("settings.reference")` |
| 19 | `components/dashboard-header.tsx:54` | `canSearch` [1,2,3] | `useCan(["students.list", "leads.view", "teachers.view"])` |
| 19 | `components/settings/employee-row-actions.tsx:27` | `canDelete` [1,2] | `useCan("employees.manage")` |
| 19 | `components/settings/courses-settings-client.tsx:53` | `canAddCourse` [1,2] | `useCan("courses.create")` |
| 19 | `components/settings/general-settings-client.tsx:36` | `COMPANY_EDIT_ROLES` | `useCan("settings.company")` |
| 19 | `components/settings/payment-settings-client.tsx:55, 56` | `canEdit` [1,2], `isCeo` | `useCan("settings.payment")`; `isCeo` keep (company level) |
| 19 | `components/settings/employee-profile-client.tsx:41, 43` | `canSeeBalance` [1,2], `canSeeTimeline` [1,2,3] | `useCan("salary.view")`, `useCan("teachers.view")`; line 56 keep |
| 19 | `components/settings/employee-profile-tabs.tsx:47, 49` | `canSeeSalary`, `canSeeTimeline` | `useCan("salary.view")`, `useCan("teachers.view")`; line 50 keep |
| 19 | `components/settings/employee-profile-card.tsx:53` | `canSeeBalance` | `useCan("salary.view")` |
| 19 | `components/settings/daf-norma-settings-client.tsx:95`, `absence-pause-settings-client.tsx:72` | CEO | `useCan("settings.company")` |
| 19 | `components/settings/telegram-groups-client.tsx:63` | `isCeo` | keep `isCeo` for the «Barcha filiallar» button (357); add `const canAnnounce = useCan("telegram.announce")` for the announce dialog (214) and the bot-disconnect action |
| 19 | `components/settings/edit-course-form.tsx:114` | `canEditPaymentModel` [1,2] | `useCan("courses.create")` |
| 19 | `components/teachers/teacher-profile-tabs.tsx:44, 46` | `canSeeSalary`, `canSeeTimeline` | `useCan("salary.view")`, `useCan("teachers.view")` |
| 19 | `components/teachers/teacher-profile-client.tsx:32` | `canManageTeachers` [1,2] | `useCan("salary.view")` for `salaryDueUserId` (143); `useCan("teachers.manage")` for the actions (170) |
| 19 | `components/teachers/teachers-client.tsx:62`, `teacher-profile-card.tsx:42`, `teachers-table.tsx:27` | `canManageTeachers` [1,2] | `useCan("teachers.manage")` |
| 19 | `components/shared/comment-list.tsx:44`, `comment-item.tsx:32, 47, 60, 128` | `isCeo` prop | `const canModerate = useCan("comments.delete")`; rename the prop to `canModerate` |
| 19 | `components/shared/entity-history-table.tsx:47`, `components/search/search-results-page.tsx:81`, `hooks/use-global-search.ts:172` | `canOpenEmployeeSettings(roleIds)` | `canOpenEmployeeSettings(can)`; `entity-history-table.tsx:137` keep (data) |
| 19 | `components/notifications/notification-href.ts`, `components/tasks/task-href.ts` | role lists | Task 19, Step 2 |
| 19 | `components/tasks/entity-tasks-panel(-rules).ts`, `tasks-page-client.tsx:21`, `header-task-button.tsx:10` | ADR-0074 ladder / staff | keep the rule; `entity-tasks-panel.tsx:43` imports `hasAnyRole` from `role-access.ts`, which this task deletes — write it inline: `if (!(roles?.some((r) => ENTITY_PANEL_ROLES.includes(r.id)) ?? false)) return null;` |
| keep | `middleware.ts`, `app/(auth)/auth/telegram/callback/telegram-callback.tsx`, `app/(auth)/login/login-form.tsx`, `components/student-portal/student-portal-layout.tsx` | student vs staff | keep |
| keep | `components/branch-switcher.tsx`, `components/profile/profile-client.tsx`, `profile-details.tsx` | the CEO spans every branch | keep |
| keep | `components/settings/telegram-link-dialog.tsx`, `edit-employee-form.tsx` | editing an employee's roles | keep |
| keep | `qollanma/rol-filtri.ts` and the guide registry | the page's audience | keep |
