# Ruxsatlar 2-bosqich — «Ruxsatlar» sahifasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the CEO turn each capability on or off per staff role on a new `/settings/permissions` page, with dependencies resolved before saving, technical locks the page and the server both honour, and a change history. The change takes effect on the next request. On the day this ships, every role keeps exactly its current access, because the new table is empty.

**Architecture:** The catalog (`server/src/common/permissions/`) gains `allowedRoles` and `lockReasons` per capability, plus one new capability (`contracts.manage`). It is split into a types file and three data files so each stays under 500 lines. A new table `RolePermission` stores only the CEO's differences from the default. `PermissionsService.forUser()` reads them and applies them through a pure `effectiveForRoles()`, which ends with dependency stabilisation. Concurrent loads for one user are coalesced, and the per-process cache is cleared on every write. One pure dependency module (`permission-deps.ts`: `withRequirements`, `withDependents`, `stabilize`, `planToggle`) is used verbatim by the server and the client. One table of test vectors checks both copies. A new route marker `@CeoOnly()` (a fifth `RouteAccessMeta` kind, never a capability) guards the CEO API:
- `GET /permissions`
- `PUT /permissions/roles/:roleId`
- `POST /permissions/roles/:roleId/reset`
- `GET /permissions/history`

Every write runs in one transaction with an `EntityHistory` row (`entityType: 'RolePermission'`). The client page is a React Query data hook plus a pure, tested view model (cell state, section counts, confirm text) and thin components. The plan also closes the review findings the CEO decided on 10.10 and 11.10: advance writes, `contracts.manage`, the dashboard cache key, the `salary.close` lock, the employee-history `balance` leak and the group-form hints.

**Tech Stack:**
- Server: NestJS 11, Prisma 7 (PostgreSQL), Jest (ts-jest, transpile-only), class-validator, the TypeScript compiler API in `server/scripts/route-inventory.ts`.
- Client: Next.js 16, React 19, @tanstack/react-query 5, zustand 5, shadcn/ui (`Switch`, `Collapsible`, `AlertDialog`, `Tooltip`, `Select`), vitest 4 (node environment, `src/**/*.test.ts` only, so no component rendering).

Spec: `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md` — §4–8, §11 «2-bosqich», §12, §13. Stage 1: ADR-0079; branch rules: ADR-0081.

## Global Constraints

**Workspace and commands**
- Work only in `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi`, branch `ruxsatlar-sahifasi`. Never `cd` outside it. Use the Write tool for files, not `cat >`.
- Server commands run from `server/`: `npx jest <path>`, `npm run typecheck`, `npx eslint <files>`, `npx prettier --write <files>`, `npm test`.
- Client commands run from `client/`: `npx vitest run <path>`, `npx tsc --noEmit`, `npm run lint`.
- **Never run Prettier on `client/` files.**
- Prettier is CI-blocking on server files: run `npx prettier --write` on every touched server `.ts` before committing. `npm run typecheck` is the only type check of server specs; run it at the end of every server task.

**Language**
- All user-visible text is Uzbek (Latin), with no English words. That covers labels, lock reasons, errors, toasts and page text.
- Code, comments, test names, commit messages and the PR title and body are English. ADR text and the user guide stay Uzbek. An existing Uzbek test name that a task edits is rewritten in English.
- Every commit ends with `Co-Authored-By: Claude <model> <noreply@anthropic.com>` (the executing model's name).
- The repository is PUBLIC: no production ids, phones, names, amounts or secrets in code, tests, docs or the PR.

**Roles and the CEO**
- Role ids: 1 CEO, 2 Branch Director (D), 3 Administrator (A), 4 Teacher (T), 5 Cashier (K), 6 Student.
- The page edits only 2, 3, 5, 4, in that column order. The CEO always holds every capability. A student holds none.
- The page and its API are CEO-only through `@CeoOnly()` (spec §4.2). Never a capability, never grantable.
- No new roles. Roles are read from the `Role` table. The role labels on screen are «Filial direktori», «Administrator», «Kassir», «O'qituvchi».

**Behaviour of the setting**
- A change takes effect on the user's next request: `PermissionsService.invalidateAll()` runs after every committed write, and the 10 s cache covers other processes. The client re-reads `/permissions/me` on focus, after 30 s and after a 403. Nothing else is required.
- Day-one equivalence: the table ships empty, `defaultRoles` do not change, and `route-access.snapshot.json` changes only by the rows for the 4 new routes. `intentional-access-changes.ts` is not edited.
- `allowedRoles ⊇ defaultRoles`, and `allowedRoles` is closed under `requires`. Both are tests. Teacher is allowed only `groups.view` and `attendance.mark` (spec §4.4). The «allowedRoles table» below is binding data: copy it.

**Database and migration**
- One new table, `RolePermission`. No existing table changes except the Prisma back-relation fields.
- `UserPermission` is NOT created in this stage (decision: no stage-2 code reads or writes it, so it would be an untestable dead table; stage 3 adds it with its own migration, which is equally safe because it is a new, empty table).
- The migration lives at `server/prisma/migrations/20261012090000_role_permissions/migration.sql`. If a later timestamp exists on `origin/main` when you start, take the next one.
- The SQL is generated **without any database**: `npx prisma migrate diff --from-schema <old schema file> --to-schema prisma/schema.prisma --script`. Write the old schema with `git show HEAD:server/prisma/schema.prisma` into the scratchpad first. If the flag is refused, hand-write the SQL in Task 3 and compare it with Task 3's expected text.
- Never run `migrate dev`, `db push`, `db execute` or `migrate deploy`. Tests mock Prisma. The production migration runs at deploy (`start:prod` = `prisma migrate deploy && node dist/src/main`).

**ADR, deploy and verification**
- ADR number **0086** (0084 and 0085 are on `main` since #705 and #704): `docs/adr/0086-ruxsatlar-sahifasi.md`. Another open branch may also claim 0086; Task 13 Step 1 renumbers if `main` got there first.
- Deploy order: server, then client. This plan ends at the PR. The CEO merges, and deploy is a separate step.
- The CEO sees a real screenshot of the page before the PR is merged (spec §11).

**CEO decisions this plan implements (do not re-ask)**
- Advances (10.10, sharpened 11.10): a `TEACHER_ADVANCE` write requires `salary.pay` (`expenses.manage` alone is refused for an advance), and a caller holding only `salary.pay` is refused for any other category. «Avans berish» shows for `salary.pay`.
- Contracts (10.10): `contracts.manage` «Shartnoma tuzish va imzolash», defaults D + A. It covers contract-document writes and the client buttons. Reads stay on `students.details`. The CEO-only cancel of a signed contract is unchanged (ADR-0075).
- 11.10: four fixes.
  - Build the dashboard cache key from every flag it depends on.
  - `salary.close` is CEO-only (`allowedRoles: []`).
  - Employee history never returns `balance`.
  - The group-form course and teacher hints use their own capabilities.
  - Internally: split the catalog, coalesce `forUser` loads, and make `fakePermissions` respect `userId`.

## File map

**Server — new** (`server/src/common/permissions/` unless noted)

| File | Responsibility |
|---|---|
| `permission-catalog.types.ts` | role-id constants, `StaffRoleId`, `EDITABLE_ROLE_IDS`, `PERMISSION_SECTIONS`, `LOCK` reasons, `PermissionDef` |
| `permission-catalog.people.ts` | data: sections students, groups, leads, outreach, mock (23 keys incl. `contracts.manage`) |
| `permission-catalog.money.ts` | data: sections payments, expenses, salary, reports (25 keys) |
| `permission-catalog.admin.ts` | data: sections staff, comments, settings, home, daf (19 keys) |
| `permission-allowed-roles.spec.ts` | route-level lock rules: a widened key has no UNREVIEWED route and no unreviewed COMPANY_WIDE write |
| `permission-deps.ts` (+ `.spec.ts`) | pure dependency functions; byte-identical copy on the client |
| `permission-deps.vectors.ts` | the shared test table (no imports) |
| `effective-permissions.ts` (+ `.spec.ts`) | pure `keysForRole`, `effectiveForRoles` |
| `role-permissions.types.ts` | API response shapes |
| `role-permissions.service.ts` (+ `.spec.ts`) | overview, update, reset, history (transaction + EntityHistory + invalidate) |
| `role-permissions.controller.ts` (+ `.spec.ts`) | the four `@CeoOnly()` routes |
| `dto/update-role-permissions.dto.ts` | `UpdateRolePermissionsDto`, `RolePermissionChangeDto` |
| `server/prisma/migrations/20261012090000_role_permissions/migration.sql` | the `RolePermission` table |

**Server — modified**

| File | Change |
|---|---|
| `permission-catalog.ts` | assembles the three data files, keeps every current export, adds `isPermissionKey`, `permissionDef` |
| `permission-catalog.spec.ts` | 67 keys, allowedRoles/lockReasons invariants |
| `permissions.service.ts` (+ spec) | overrides, in-flight coalescing, `invalidateAll()`, generation guard |
| `testing.ts` (+ `testing.spec.ts`) | `fakePermissions(roleIds, opts?)` honours `userId` and overrides |
| `access.decorators.ts` | `CeoOnly()`, kind `'ceo'` |
| `permission.guard.ts` (+ spec) | `allows()` for `'ceo'` |
| `route-access.ts` (+ spec) | `accessSummary({kind:'ceo'})` → `['CEO']` |
| `route-inventory.spec.ts` | reads `@CeoOnly()` |
| `route-access.snapshot.json` | 4 new rows, `["CEO"]` |
| `permissions.module.ts` | registers the new controller and service |
| `server/scripts/route-inventory.ts` | `CeoOnly` marker → `{ kind: 'ceo' }` |
| `server/src/common/auth/branch-route-policy.ts` | one COMPANY_WIDE block for the 4 routes (budget stays 7) |
| `server/prisma/schema.prisma` | `model RolePermission` + back-relations on `Company`, `Role`, `User` |
| `server/src/expenses/expenses.controller.ts`, `expenses.service.ts` (+ specs) | an advance write requires `salary.pay` only (`expenses.manage` alone refused); any other category requires `expenses.manage` only (`salary.pay` alone refused). The routes list both keys so both holders reach `assertMayWrite` |
| `server/src/contract-documents/contract-documents.controller.ts` (+ spec) | 4 writes → `@Can('contracts.manage')` |
| `server/src/dashboard/dashboard-summary.service.ts`, `dashboard-charts.service.ts` (+ specs) | cache key from both flags |
| `server/src/common/entity-history/diff.util.ts`, `entity-history.service.ts` (+ specs) | `balance` never stored or returned for `User` |

**Client — new**

| File | Responsibility |
|---|---|
| `client/src/lib/permission-deps.ts` (+ `.test.ts`) | verbatim copy of the server file; the test checks text equality and runs the server's vectors |
| `client/src/components/settings/permissions/permissions-types.ts` | mirrors `role-permissions.types.ts` |
| `client/src/hooks/use-role-permissions.ts` | queries and mutations for the page |
| `client/src/components/settings/permissions/permissions-model.ts` (+ `.test.ts`) | pure view model: cell state, section count, toggle plan, confirm text, history line |
| `client/src/app/(dashboard)/settings/permissions/page.tsx` | thin `Suspense` wrapper |
| `client/src/components/settings/permissions/permissions-client.tsx` | page body: header, mobile role picker, table, reset, history |
| `client/src/components/settings/permissions/permissions-table.tsx` | collapsible sections, rows, cells (switch, lock + reason, yellow dot, red mark) |
| `client/src/components/settings/permissions/permission-confirm-dialog.tsx` | the toggle and reset confirmation |
| `client/src/components/settings/permissions/permissions-history.tsx` | «O'zgarishlar tarixi», paged |

**Client — modified**

| File | Change |
|---|---|
| `client/src/lib/permission-keys.ts` | + `contracts.manage` (server order) |
| `client/src/test-support/server-catalog.ts` | loads the split catalog; exports `loadServerFile` |
| `client/src/lib/settings-nav.ts` (+ test) | `ceoOnly` items, `isCeo` parameter, «Ruxsatlar» entry |
| `client/src/components/settings/settings-layout-shell.tsx`, `settings-menu.tsx` | pass `isCeo` |
| `client/src/hooks/use-auth.ts` | `isCeoUser(user)` |
| `client/src/lib/breadcrumb-routes.ts` | `permissions: "Ruxsatlar"` |
| `client/src/components/payments/salary-client.tsx` | `canAdvance = useCan("salary.pay")` (an advance needs `salary.pay` only, CEO 11.10) |
| `client/src/components/students/contracts/student-contracts-tab.tsx` | `useCan("contracts.manage")` |
| `client/src/components/groups/group-form-empty-hints.ts` (+ test) | course → `courses.create`, teacher → `teachers.manage` |

**Docs**

| File | Change |
|---|---|
| `docs/adr/0086-ruxsatlar-sahifasi.md` (+ `docs/adr/README.md` row) | the ADR |
| `docs/role-access.md` | the page, the locks |
| `server/CLAUDE.md` (§ «Capabilities, not role lists», ~line 217) | the new pieces |
| `client/CLAUDE.md` (~lines 82, 455, 721, 850 on main 54016d9e) | the new pieces |
| spec §15 | changelog line |
| `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts` | the user guide |

## The allowedRoles table (binding data)

Lock reason constants (`LOCK` in `permission-catalog.types.ts`; the page shows the text):

| Constant | Text | Meaning |
|---|---|---|
| `OWN_GROUPS` | `o'qituvchi faqat o'z guruhlarini ko'radi` | spec §4.4. Teacher narrowing exists only in `common/auth/group-branch-scope.ts:43` and `dashboard/dashboard.controller.ts:59`. The student, money, lead, report and search paths are branch-only (`common/auth/student-branch-scope.ts:43`; `search/search.service.ts` reads no role) |
| `NO_PAGE` | `o'qituvchi saytida bunday sahifa yo'q` | Teacher signs in only on the lehrer portal (`auth/portal-roles.config.ts:8-12`), which has no such page. The toggle would do nothing visible |
| `UNTESTED` | `bu rol uchun kod sinalmagan` | an in-service role assumption (file:line per row) |
| `COMPANY` | `butun kompaniyaga ta'sir qiladi` | a COMPANY_WIDE write (`branch-route-policy.ts`) |
| `BRANCH` | `filial chegarasi hali tekshirilmagan` | an UNREVIEWED route or an unconfined id lookup |
| `GROUP_REPORT` | `guruhga moliya hisoboti ketadi` | approving a Telegram group sends it the 21:00 money report (spec Q6 keeps those reports unchanged) |

Roles column order: D A K T. `allowed` lists `allowedRoles`. Each other role carries exactly the given reason. «⇐ plan A» marks a lock from the 10.10 reviews that is now lifted because PR #696 fixed its cause (verified against current code).

| # | key | default | allowed | locked → reason · cause |
|---|---|---|---|---|
| 1 | students.list | D A | D A K | T → OWN_GROUPS |
| 2 | students.profile | D A K | D A K | T → OWN_GROUPS |
| 3 | students.details | D A | D A K | T → OWN_GROUPS |
| 4 | students.manage | D A | D A K | T → OWN_GROUPS (K stays refused the discount by `students/discount-role.guard.ts:12` — narrows only) |
| 5 | students.enroll | D A | D A K | T → OWN_GROUPS |
| 6 | students.sms | D A | D A K | T → OWN_GROUPS |
| 7 | students.initial-balance | — | D A K | T → OWN_GROUPS |
| 8 | **contracts.manage** (new) | D A | D A K | T → OWN_GROUPS (writes confined by `contract-documents/contract-documents.service.ts:134,172,246`) |
| 9 | groups.view | D A T | D A K T | — |
| 10 | groups.manage | D A | D A K | T → UNTESTED · `groups/groups-write.service.ts:20,309,557` and `groups/groups-status.service.ts:33,84` pass `NO_TEACHER_PATH`, so a teacher is checked by branch, not by assignment |
| 11 | lessons.change | D A | D A K | T → UNTESTED · the write guards pass no `lessonDate` (`lesson-cancellations/lesson-cancellations.service.ts:172`), so `group-branch-scope.ts` admits a teacher with any cover of the group |
| 12 | lessons.change-delete | D | D A K | T → UNTESTED (same as 11; requires it) |
| 13 | attendance.mark | D A T | D A K T | — (K gets the administrator's editing semantics, `attendance/attendance-save.service.ts:161`) |
| 14 | attendance.fix | D A | D A K | T → UNTESTED · `attendance/attendance.controller.ts:104-111` drops `late=1` for a teacher; `attendance-save.service.ts:462` writes as non-teacher |
| 15 | leads.view | D A | D A K | T → OWN_GROUPS |
| 16 | leads.manage | D A | D A K | T → OWN_GROUPS |
| 17 | leads.setup | D A | D A | K, T → COMPANY · `POST/PATCH/DELETE /lead-sources` (LeadSource has no branch) |
| 18 | leads.forms | D A | D A K | T → OWN_GROUPS |
| 19 | outreach.view | D A | D A K | T → OWN_GROUPS |
| 20 | calls.log | D A | D A K | T → OWN_GROUPS |
| 21 | mock.view | D A | D A K | T → OWN_GROUPS |
| 22 | mock.manage | D A | D A | K, T → COMPANY · `POST/PATCH/DELETE /mock-exam-sections`, `PATCH …/reorder` (MockExamSection has no branch) |
| 23 | mock.payments | D A | D A K | T → OWN_GROUPS |
| 24 | payments.view | D A K | D A K | T → OWN_GROUPS |
| 25 | payments.create | D A K | D A K | T → OWN_GROUPS |
| 26 | payments.correct | D A | D A K | T → OWN_GROUPS (K gets the 72 h window like A) |
| 27 | debt.view | D A K | D A K | T → OWN_GROUPS |
| 28 | debt.promise | D A K | D A K | T → OWN_GROUPS |
| 29 | balance.withdraw | D A | D A K ⇐ plan A (`withdrawals/withdrawals.service.ts:48`) | T → OWN_GROUPS |
| 30 | refunds.create | D A | D A K ⇐ plan A (`refunds/refunds-eligibility.service.ts:65`) | T → OWN_GROUPS |
| 31 | refunds.hand-over | D A K | D A K | T → OWN_GROUPS |
| 32 | refunds.cancel | D | D A K ⇐ plan A | T → OWN_GROUPS |
| 33 | debt.write-off | D A | D A K | T → OWN_GROUPS |
| 34 | balance.adjust | D | D A K ⇐ plan A (`transactions/transactions-write.service.ts:1033`, `billing/lesson-billing.service.ts:825,1301`) | T → OWN_GROUPS |
| 35 | money.undo | — | D A K ⇐ plan A (`billing/debt-write-off.service.ts:449`) | T → OWN_GROUPS |
| 36 | payments.gateway-log | — | — | D, A, K, T → BRANCH · `GET /gateways/events` is UNREVIEWED; `PaymentGatewayEvent` has no branch |
| 37 | expenses.view | D | D A K | T → OWN_GROUPS (advances are not listed, `expenses/expenses.service.ts:256-269`) |
| 38 | expenses.manage | D | D A K ⇐ plan A (recipient check `expenses.service.ts:106-160`) | T → OWN_GROUPS |
| 39 | cash.manage | D | D A K | T → OWN_GROUPS |
| 40 | salary.view | D | D A K ⇐ plan A (payroll reads confined, `branch-route-policy.ts` BRANCH_SCOPED_BY_PAYROLL block «until 10.10.2026…») | T → OWN_GROUPS |
| 41 | salary.rate | D | D | A, K, T → UNTESTED · `salary/shared/teacher-rate-permission.ts:180` refuses everyone but CEO and Branch Director |
| 42 | salary.pay | D | D A K ⇐ plan A (own salary refused, `salary/salary-payment.service.ts:295`) | T → OWN_GROUPS |
| 43 | salary.rate-edit | — | — | D, A, K, T → COMPANY · `PATCH /salary/config/:id`, `POST /salary/config/global` |
| 44 | salary.close | — | — | D, A, K, T → COMPANY · `POST /salary/calculate` settles every branch; `approvePayment(id, companyId)` (`salary-payment.service.ts:253`) has no payroll scope (CEO 11.10) |
| 45 | reports.finance | D | D A K | T → OWN_GROUPS. `requires: ['salary.view']` (CEO 11.10: the finance reports show salaries) |
| 46 | reports.payments | D A | D A K | T → OWN_GROUPS |
| 47 | reports.students | D | D A K | T → OWN_GROUPS (channel report is a COMPANY_WIDE **read**, allowed) |
| 48 | reports.leads | D A | D A K ⇐ (`GET /reports/lead-analytics` deleted, `reports/reports.service.ts:426`) | T → OWN_GROUPS |
| 49 | teachers.view | D A | D A K ⇐ plan A (timeline confined, `branch-route-policy.ts` «Taymlayn» block) | T → OWN_GROUPS |
| 50 | teachers.manage | D | D A | K, T → UNTESTED · `teachers/teachers.service.ts:279-291` `create` never consults `grantableRoleIdsFor`, whose ceiling for K/T is `[]` (`telegram/constants.ts:84-95`) |
| 51 | employees.view | D | D A K | T → OWN_GROUPS |
| 52 | employees.manage | D | D A | K, T → UNTESTED · `users/users.service.ts:329` returns early when no role changes, so an empty-ceiling caller creates a role-less employee it may not edit |
| 53 | employees.invite | D A | D A | K, T → UNTESTED · `telegram/telegram.service.ts:1488` refuses every request (ceiling `[]`) |
| 54 | comments.write | D A | D A K | T → OWN_GROUPS |
| 55 | comments.delete | — | — | D, A, K, T → BRANCH · `comments/comments.service.ts:204-214` deletes by `id + companyId`; `:176` moderation, the same |
| 56 | settings.reference | D A | D A | K, T → COMPANY · the three reason lists (COMPANY_WIDE writes) |
| 57 | courses.create | D | D A | K, T → COMPANY (requires 56) |
| 58 | settings.branches | D | D A K ⇐ (`POST /branches` refused for non-CEO, `branches/branches.service.ts:150-158`; others `:270-308`) | T → NO_PAGE |
| 59 | settings.payment | D | D A K | T → NO_PAGE |
| 60 | settings.telegram-groups | D | D | A, K, T → GROUP_REPORT · `telegram-groups/telegram-groups.service.ts` `approve` binds a chat to a branch → 21:00 money report |
| 61 | settings.absence-pause | D | D A K | T → NO_PAGE (COMPANY_WIDE **read**) |
| 62 | telegram.announce | — | — | D, A, K, T → COMPANY · `POST /telegram-groups/announce` reaches every company |
| 63 | settings.company | — | — | D, A, K, T → COMPANY · `PATCH /company/:id`, `PATCH /absence-pause/settings` |
| 64 | settings.archive | — | — | D, A, K, T → BRANCH · 5 UNREVIEWED `/archive*` routes |
| 65 | dashboard.view | D A K | D A K | T → OWN_GROUPS (`dashboard/dashboard-summary.service.ts` is branch-wide) |
| 66 | daf.activity | D A | D A K | T → OWN_GROUPS |
| 67 | media.view | D A | D A K | T → NO_PAGE |

**Counts:**
- 97 locked cells; 65 of 67 keys have at least one locked role.
- 7 keys are CEO-only (`allowedRoles: []`): 36, 43, 44, 55, 62, 63, 64.
- Locks lifted against the 10.10 reviews: rows 29, 30, 32, 34, 35, 38, 40, 42, 48, 49 (K) and 58 (A, K).
- Changed against review B: T is locked with NO_PAGE on 58, 59, 61 and 67 (the review had ALLOW). This keeps «the teacher holds only its two» as one rule.

**Other data in Task 1 (no access change):**
- `settings.branches` gets the label «Filiallar: tahrirlash va yopish» and `danger: 'irreversible'`, because closing a branch cascades.
- `contracts.manage` sits in the students section, right after `students.initial-balance`, with `requires: ['students.details']`.

## Tasks

### Task 1: Catalog split, allowedRoles, lockReasons, `contracts.manage`, catalog tests

**Files:**
- Create: `server/src/common/permissions/permission-catalog.types.ts` (role constants, `StaffRoleId`, `EDITABLE_ROLE_IDS`, `PERMISSION_SECTIONS`, `LOCK`, `PermissionDef`)
- Create: `server/src/common/permissions/permission-catalog.people.ts` (23 keys: students, groups, leads, outreach, mock)
- Create: `server/src/common/permissions/permission-catalog.money.ts` (25 keys: payments, expenses, salary, reports)
- Create: `server/src/common/permissions/permission-catalog.admin.ts` (19 keys: staff, comments, settings, home, daf)
- Modify: `server/src/common/permissions/permission-catalog.ts` (joins the three data files, keeps every export, adds `isPermissionKey`, `permissionDef`)
- Modify: `server/src/common/permissions/permissions.service.spec.ts` (66 → `PERMISSION_KEYS.length`)
- Modify: `client/src/lib/permission-keys.ts` (+ `contracts.manage` after `students.initial-balance`)
- Modify: `client/src/test-support/server-catalog.ts` (loads the split catalog, exports `loadServerFile`)
- Test: `server/src/common/permissions/permission-catalog.spec.ts` (rewritten)
- Test: `server/src/common/permissions/permission-allowed-roles.spec.ts` (new)

**Interfaces:**
- Consumes: `ROLE_ID` from `server/src/common/auth/role-ids.ts`; `discoverRoutes(srcDir, root)` from `server/scripts/route-inventory.ts` (each route has `key`, `method`, `hasBranchScope`, `access: { kind: 'can'; keys: string[] } | …`); `ROUTE_POLICIES: PolicyBlock[]` and `UNREVIEWED_ROUTES: string[]` from `server/src/common/auth/branch-route-policy.ts`.
- Produces (later tasks rely on these exact names):
```ts
// permission-catalog.types.ts (imports ROLE_ID only)
export const D = ROLE_ID.BRANCH_DIRECTOR; export const A = ROLE_ID.ADMINISTRATOR;
export const T = ROLE_ID.TEACHER;         export const K = ROLE_ID.CASHIER;
export type StaffRoleId = typeof D | typeof A | typeof T | typeof K;
export const EDITABLE_ROLE_IDS: readonly StaffRoleId[]; // [D, A, K, T]
export const PERMISSION_SECTIONS; export type PermissionSection;
export const LOCK; export type LockReason;
export interface PermissionDef { section; label; defaultRoles; allowedRoles; lockReasons; requires; danger? }
// permission-catalog.ts
export const PERMISSIONS; export type PermissionKey; export const PERMISSION_KEYS: PermissionKey[];
export function defaultKeysForRoles(roleIds: readonly number[]): Set<PermissionKey>;
export function isPermissionKey(key: string): key is PermissionKey;
export function permissionDef(key: PermissionKey): PermissionDef;
export { PERMISSION_SECTIONS, EDITABLE_ROLE_IDS, LOCK, type PermissionDef, type PermissionSection, type StaffRoleId, type LockReason };
// client/src/test-support/server-catalog.ts
export function loadServerFile(relativePath: string, deps: Record<string, unknown>): Record<string, unknown>;
```

- [ ] **Step 1: Write the failing tests**

Replace the whole of `server/src/common/permissions/permission-catalog.spec.ts` with:

```ts
import { ROLE_ID } from '../auth/role-ids';
import {
  EDITABLE_ROLE_IDS,
  LOCK,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionKey,
  StaffRoleId,
  defaultKeysForRoles,
  isPermissionKey,
  permissionDef,
} from './permission-catalog';

/*
 * The allowedRoles table of the plan «Ruxsatlar 2-bosqich» (ADR-0086), copied
 * as data. Columns: key, default roles, allowed roles, lock reason per role
 * outside the allowed ones. D = Branch Director, A = Administrator,
 * K = Cashier, T = Teacher. The rows are in the client's key order
 * (`client/src/lib/permission-keys.ts`).
 */
type Col = 'D' | 'A' | 'K' | 'T';
type Locks = Partial<Record<Col, keyof typeof LOCK>>;
type Row = [PermissionKey, string, string, Locks];

const COL: Record<Col, StaffRoleId> = {
  D: ROLE_ID.BRANCH_DIRECTOR,
  A: ROLE_ID.ADMINISTRATOR,
  K: ROLE_ID.CASHIER,
  T: ROLE_ID.TEACHER,
};
const ALL = (lock: keyof typeof LOCK): Locks => ({
  D: lock,
  A: lock,
  K: lock,
  T: lock,
});

const TABLE: Row[] = [
  ['students.list', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.profile', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.details', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.enroll', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.sms', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['students.initial-balance', '', 'DAK', { T: 'OWN_GROUPS' }],
  ['contracts.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['groups.view', 'DAT', 'DAKT', {}],
  ['groups.manage', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['lessons.change', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['lessons.change-delete', 'D', 'DAK', { T: 'UNTESTED' }],
  ['attendance.mark', 'DAT', 'DAKT', {}],
  ['attendance.fix', 'DA', 'DAK', { T: 'UNTESTED' }],
  ['leads.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['leads.manage', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['leads.setup', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['leads.forms', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['outreach.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['calls.log', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['mock.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['mock.manage', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['mock.payments', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.create', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.correct', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.promise', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['balance.withdraw', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.create', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.hand-over', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['refunds.cancel', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['debt.write-off', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['balance.adjust', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['money.undo', '', 'DAK', { T: 'OWN_GROUPS' }],
  ['payments.gateway-log', '', '', ALL('BRANCH')],
  ['expenses.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['expenses.manage', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['cash.manage', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.rate', 'D', 'D', { A: 'UNTESTED', K: 'UNTESTED', T: 'UNTESTED' }],
  ['salary.pay', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['salary.rate-edit', '', '', ALL('COMPANY')],
  ['salary.close', '', '', ALL('COMPANY')],
  ['reports.finance', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.payments', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.students', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['reports.leads', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['teachers.view', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['teachers.manage', 'D', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['employees.view', 'D', 'DAK', { T: 'OWN_GROUPS' }],
  ['employees.manage', 'D', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['employees.invite', 'DA', 'DA', { K: 'UNTESTED', T: 'UNTESTED' }],
  ['comments.write', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['comments.delete', '', '', ALL('BRANCH')],
  ['settings.reference', 'DA', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['courses.create', 'D', 'DA', { K: 'COMPANY', T: 'COMPANY' }],
  ['settings.branches', 'D', 'DAK', { T: 'NO_PAGE' }],
  ['settings.payment', 'D', 'DAK', { T: 'NO_PAGE' }],
  [
    'settings.telegram-groups',
    'D',
    'D',
    { A: 'GROUP_REPORT', K: 'GROUP_REPORT', T: 'GROUP_REPORT' },
  ],
  ['settings.absence-pause', 'D', 'DAK', { T: 'NO_PAGE' }],
  ['telegram.announce', '', '', ALL('COMPANY')],
  ['settings.company', '', '', ALL('COMPANY')],
  ['settings.archive', '', '', ALL('BRANCH')],
  ['dashboard.view', 'DAK', 'DAK', { T: 'OWN_GROUPS' }],
  ['daf.activity', 'DA', 'DAK', { T: 'OWN_GROUPS' }],
  ['media.view', 'DA', 'DAK', { T: 'NO_PAGE' }],
];

const roleIds = (cols: string): number[] =>
  [...cols].map((c) => COL[c as Col]).sort();
const sorted = (ids: readonly number[]): number[] => [...ids].sort();

describe('permission catalog', () => {
  it('names every capability section.word or section.word-word', () => {
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z]+\.[a-z]+(-[a-z]+)*$/);
    }
  });

  it('has 67 capabilities in 14 sections, none of them empty', () => {
    expect(PERMISSION_KEYS).toHaveLength(67);
    expect(PERMISSION_SECTIONS).toHaveLength(14);
    for (const section of PERMISSION_SECTIONS) {
      expect(
        PERMISSION_KEYS.some((key) => permissionDef(key).section === section.key),
      ).toBe(true);
    }
  });

  it("lists every capability of the table, in the client's order", () => {
    expect(TABLE.map(([key]) => key)).toEqual(PERMISSION_KEYS);
  });

  it('requires only capabilities that exist, and never in a circle', () => {
    const visiting = new Set<string>();
    const done = new Set<string>();
    const walk = (key: PermissionKey, path: string[]) => {
      if (done.has(key)) return;
      if (visiting.has(key)) {
        throw new Error(`cycle: ${[...path, key].join(' -> ')}`);
      }
      visiting.add(key);
      for (const needed of permissionDef(key).requires) {
        expect(isPermissionKey(needed)).toBe(true);
        walk(needed as PermissionKey, [...path, key]);
      }
      visiting.delete(key);
      done.add(key);
    };
    for (const key of PERMISSION_KEYS) walk(key, []);
  });

  it('gives every default role the capabilities its defaults require', () => {
    for (const key of PERMISSION_KEYS) {
      for (const role of permissionDef(key).defaultRoles) {
        for (const needed of permissionDef(key).requires) {
          expect({
            key,
            role,
            needed,
            held: permissionDef(needed as PermissionKey).defaultRoles.includes(
              role,
            ),
          }).toEqual({ key, role, needed, held: true });
        }
      }
    }
  });

  it('keeps English words out of the labels and lock reasons the CEO will read', () => {
    const english =
      /\b(view|manage|create|edit|delete|list|report|settings|dashboard|salary|payment|lead|group|student|teacher|cash)\b/i;
    for (const key of PERMISSION_KEYS) {
      expect(permissionDef(key).label).not.toMatch(english);
    }
    for (const section of PERMISSION_SECTIONS) {
      expect(section.label).not.toMatch(english);
    }
    for (const reason of Object.values(LOCK)) {
      expect(reason).not.toMatch(english);
    }
  });

  it('gives the CEO every capability, whatever else they hold', () => {
    expect(defaultKeysForRoles([ROLE_ID.CEO]).size).toBe(67);
    expect(defaultKeysForRoles([ROLE_ID.TEACHER, ROLE_ID.CEO]).size).toBe(67);
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
      'refunds.hand-over',
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

describe('who the CEO may give a capability to (spec §6)', () => {
  it('edits the four staff roles in the page column order', () => {
    expect(EDITABLE_ROLE_IDS).toEqual([
      ROLE_ID.BRANCH_DIRECTOR,
      ROLE_ID.ADMINISTRATOR,
      ROLE_ID.CASHIER,
      ROLE_ID.TEACHER,
    ]);
  });

  it.each(TABLE)('%s: defaults, allowed roles and locks', (key, dflt, allowed, locks) => {
    const def = permissionDef(key);
    expect(sorted(def.defaultRoles)).toEqual(roleIds(dflt));
    expect(sorted(def.allowedRoles)).toEqual(roleIds(allowed));
    expect(def.lockReasons).toEqual(
      Object.fromEntries(
        Object.entries(locks).map(([col, lock]) => [COL[col as Col], LOCK[lock]]),
      ),
    );
  });

  it('keeps every default role inside the allowed roles', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of def.defaultRoles) {
        expect({ key, role, allowed: def.allowedRoles.includes(role) }).toEqual(
          { key, role, allowed: true },
        );
      }
    }
  });

  it('gives exactly the editable roles outside allowedRoles one lock reason', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of EDITABLE_ROLE_IDS) {
        expect({
          key,
          role,
          locked: def.lockReasons[role] !== undefined,
        }).toEqual({ key, role, locked: !def.allowedRoles.includes(role) });
      }
      for (const role of Object.keys(def.lockReasons).map(Number)) {
        expect(EDITABLE_ROLE_IDS).toContain(role);
      }
    }
  });

  it('closes allowedRoles under requires', () => {
    for (const key of PERMISSION_KEYS) {
      const def = permissionDef(key);
      for (const role of def.allowedRoles) {
        for (const needed of def.requires) {
          expect({
            key,
            role,
            needed,
            allowed: permissionDef(
              needed as PermissionKey,
            ).allowedRoles.includes(role),
          }).toEqual({ key, role, needed, allowed: true });
        }
      }
    }
  });

  it('allows a teacher only their groups and attendance (spec §4.4)', () => {
    expect(
      PERMISSION_KEYS.filter((key) =>
        permissionDef(key).allowedRoles.includes(ROLE_ID.TEACHER),
      ).sort(),
    ).toEqual(['attendance.mark', 'groups.view']);
  });

  it('counts 97 locked cells, 65 keys with a lock and 7 CEO-only keys', () => {
    const locks = PERMISSION_KEYS.map(
      (key) => Object.keys(permissionDef(key).lockReasons).length,
    );
    expect(locks.reduce((sum, n) => sum + n, 0)).toBe(97);
    expect(locks.filter((n) => n > 0)).toHaveLength(65);
    expect(
      PERMISSION_KEYS.filter((key) => permissionDef(key).allowedRoles.length === 0),
    ).toEqual([
      'payments.gateway-log',
      'salary.rate-edit',
      'salary.close',
      'comments.delete',
      'telegram.announce',
      'settings.company',
      'settings.archive',
    ]);
  });

  it('knows its own keys and nothing else', () => {
    expect(isPermissionKey('contracts.manage')).toBe(true);
    expect(isPermissionKey('nope.key')).toBe(false);
    expect(isPermissionKey('toString')).toBe(false);
    expect(permissionDef('contracts.manage').requires).toEqual([
      'students.details',
    ]);
  });

  it('shows the financial reports only together with salaries (CEO, 11.10)', () => {
    expect(permissionDef('reports.finance').requires).toEqual(['salary.view']);
  });
});
```

Create `server/src/common/permissions/permission-allowed-roles.spec.ts`:

```ts
import { join } from 'path';
import { discoverRoutes } from '../../../scripts/route-inventory';
import {
  ROUTE_POLICIES,
  UNREVIEWED_ROUTES,
} from '../auth/branch-route-policy';
import {
  PERMISSION_KEYS,
  PermissionKey,
  permissionDef,
} from './permission-catalog';

/*
 * The CEO may give a role a capability beyond its defaults only where the
 * code already confines that role (spec §6, ADR-0086). The catalog spec checks
 * the data; this one checks the routes. A capability whose `allowedRoles` is
 * wider than its `defaultRoles` must not open:
 *   - an UNREVIEWED route (its branch boundary was never reasoned about), or
 *   - a COMPANY_WIDE write (it reaches every branch),
 * unless the write is reviewed below. Each reason starts with the route key
 * and a colon, and says why the route stays safe.
 */
const REVIEWED_COMPANY_WIDE_WRITES: Partial<Record<PermissionKey, string>> = {
  'settings.branches':
    'POST /branches: BranchesService.create refuses every caller but the CEO',
};

const SERVER_ROOT = join(__dirname, '..', '..', '..');
const routes = discoverRoutes(join(SERVER_ROOT, 'src'), SERVER_ROOT);

const policyOf = new Map<string, string>();
for (const block of ROUTE_POLICIES) {
  for (const key of block.routes) policyOf.set(key, block.policy);
}
for (const key of UNREVIEWED_ROUTES) policyOf.set(key, 'UNREVIEWED');

const widened = PERMISSION_KEYS.filter((key) => {
  const def = permissionDef(key);
  return def.allowedRoles.some((role) => !def.defaultRoles.includes(role));
});

const routesOf = (key: PermissionKey) =>
  routes.filter((r) => r.access.kind === 'can' && r.access.keys.includes(key));

const companyWideWrites = (key: PermissionKey) =>
  routesOf(key).filter(
    (r) =>
      !r.hasBranchScope &&
      policyOf.get(r.key) === 'COMPANY_WIDE' &&
      r.method !== 'GET',
  );

describe('a widened capability opens only reviewed routes', () => {
  it('finds widened capabilities at all (an empty list would pass vacuously)', () => {
    expect(widened.length).toBeGreaterThan(30);
  });

  it.each(widened)('%s opens no UNREVIEWED route', (key) => {
    expect(
      routesOf(key)
        .filter((r) => policyOf.get(r.key) === 'UNREVIEWED')
        .map((r) => r.key),
    ).toEqual([]);
  });

  it.each(widened)('%s opens no unreviewed COMPANY_WIDE write', (key) => {
    const reason = REVIEWED_COMPANY_WIDE_WRITES[key];
    expect(
      companyWideWrites(key)
        .filter((r) => !reason?.startsWith(`${r.key}:`))
        .map((r) => r.key),
    ).toEqual([]);
  });

  it('reviews only widened capabilities and routes that exist', () => {
    for (const [key, reason] of Object.entries(REVIEWED_COMPANY_WIDE_WRITES)) {
      const capability = key as PermissionKey;
      expect({ key, widened: widened.includes(capability) }).toEqual({
        key,
        widened: true,
      });
      expect({
        key,
        named: companyWideWrites(capability).some((r) =>
          reason.startsWith(`${r.key}:`),
        ),
      }).toEqual({ key, named: true });
    }
  });
});
```

In `server/src/common/permissions/permissions.service.spec.ts`, old:

```ts
import { PermissionsService } from './permissions.service';
```

new:

```ts
import { PERMISSION_KEYS } from './permission-catalog';
import { PermissionsService } from './permissions.service';
```

and old:

```ts
    expect((await service.forUser(10001)).keys.size).toBe(66);
```

new:

```ts
    expect((await service.forUser(10001)).keys.size).toBe(
      PERMISSION_KEYS.length,
    );
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/permissions/permission-catalog.spec.ts src/common/permissions/permission-allowed-roles.spec.ts`
Expected: FAIL — the spec files do not compile/run: `EDITABLE_ROLE_IDS`, `LOCK`, `isPermissionKey` and `permissionDef` are not exported from `./permission-catalog` (TypeError `permissionDef is not a function`), and the catalog has 66 keys, not 67.

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts`
Expected: PASS for now (both lists still 66). It fails only after Step 3's server change if the client list is not updated — which Step 3 does in the same step.

- [ ] **Step 3: Implement**

Create `server/src/common/permissions/permission-catalog.types.ts`:

```ts
import { ROLE_ID } from '../auth/role-ids';

/**
 * The shapes of the capability catalog (spec
 * docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md, §6 and §10).
 * The data lives in `permission-catalog.{people,money,admin}.ts`;
 * `permission-catalog.ts` joins it and is the only file other code imports.
 */
export const D = ROLE_ID.BRANCH_DIRECTOR;
export const A = ROLE_ID.ADMINISTRATOR;
export const T = ROLE_ID.TEACHER;
export const K = ROLE_ID.CASHIER;

export type StaffRoleId = typeof D | typeof A | typeof T | typeof K;

/** The roles the CEO edits on the «Ruxsatlar» page, in its column order. */
export const EDITABLE_ROLE_IDS: readonly StaffRoleId[] = [D, A, K, T];

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

/**
 * Why the CEO cannot give a role a capability (spec §6, ADR-0086). The page
 * shows the text beside the lock: Uzbek, no English words.
 *   OWN_GROUPS   — a teacher is narrowed to their own groups only in
 *                  `common/auth/group-branch-scope.ts` and the dashboard
 *                  controller; every other path is branch-wide (spec §4.4).
 *   NO_PAGE      — the teacher portal has no such page.
 *   UNTESTED     — the service assumes a role; the entry names the line.
 *   COMPANY      — a COMPANY_WIDE write (`branch-route-policy.ts`).
 *   BRANCH       — an UNREVIEWED route or a lookup with no branch check.
 *   GROUP_REPORT — approving a Telegram group sends it the 21:00 report.
 */
export const LOCK = {
  OWN_GROUPS: "o'qituvchi faqat o'z guruhlarini ko'radi",
  NO_PAGE: "o'qituvchi saytida bunday sahifa yo'q",
  UNTESTED: 'bu rol uchun kod sinalmagan',
  COMPANY: "butun kompaniyaga ta'sir qiladi",
  BRANCH: 'filial chegarasi hali tekshirilmagan',
  GROUP_REPORT: 'guruhga moliya hisoboti ketadi',
} as const;

export type LockReason = (typeof LOCK)[keyof typeof LOCK];

/**
 * One capability.
 * - `label` is what the CEO reads on the «Ruxsatlar» page.
 * - `defaultRoles` is today's behaviour, route by route.
 * - `allowedRoles` is who the CEO may give it to: always ⊇ `defaultRoles`,
 *   closed under `requires`; empty = the CEO alone.
 * - `lockReasons` names one reason for each editable role outside
 *   `allowedRoles`, and none for a role inside it.
 * - `requires` must also be on for the capability to work.
 * - `danger` marks money moved or an action that cannot be undone.
 */
export interface PermissionDef {
  readonly section: PermissionSection;
  readonly label: string;
  readonly defaultRoles: readonly StaffRoleId[];
  readonly allowedRoles: readonly StaffRoleId[];
  readonly lockReasons: Readonly<Partial<Record<StaffRoleId, LockReason>>>;
  readonly requires: readonly string[];
  readonly danger?: 'money' | 'irreversible';
}
```

Create `server/src/common/permissions/permission-catalog.people.ts`:

```ts
import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections O'quvchilar, Guruhlar va davomat, Lidlar,
 * Aloqa markazi and Mock imtihonlar. `allowedRoles` and `lockReasons` follow
 * ADR-0086's table; a lock other than OWN_GROUPS names its cause.
 */
export const PEOPLE_PERMISSIONS = {
  // O'quvchilar
  'students.list': {
    section: 'students',
    label: "O'quvchilar ro'yxati",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'students.profile': {
    section: 'students',
    label: "O'quvchi profilini ochish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'students.details': {
    section: 'students',
    label:
      "O'quvchi profilidagi tablar: to'lovlar, darslar, izohlar, lid tarixi, ilova",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
  },
  // A cashier holding it is still refused the discount field by
  // `students/discount-role.guard.ts` (it only narrows).
  'students.manage': {
    section: 'students',
    label: "O'quvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
  },
  'students.enroll': {
    section: 'students',
    label: "Guruhga qo'shish va guruhdan chiqarish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile', 'groups.view'],
  },
  'students.sms': {
    section: 'students',
    label: "O'quvchiga SMS yuborish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
  },
  'students.initial-balance': {
    section: 'students',
    label: "Boshlang'ich balans kiritish",
    defaultRoles: [],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  // The contract document's writes (ADR-0075), confined by
  // `contract-documents/contract-documents.service.ts`. Reading contracts
  // stays on `students.details`; cancelling a signed one stays CEO-only.
  'contracts.manage': {
    section: 'students',
    label: 'Shartnoma tuzish va imzolash',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
  },

  // Guruhlar va davomat
  'groups.view': {
    section: 'groups',
    label: "Guruhlarni ko'rish (o'qituvchi faqat o'z guruhlarini)",
    defaultRoles: [D, A, T],
    allowedRoles: [D, A, K, T],
    lockReasons: {},
    requires: [],
  },
  // T: `groups/groups-write.service.ts` and `groups-status.service.ts` pass
  // NO_TEACHER_PATH, so a teacher would be checked by branch, not assignment.
  'groups.manage': {
    section: 'groups',
    label: 'Guruh ochish, tahrirlash va yopish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['groups.view'],
  },
  // T: the write guards pass no `lessonDate`
  // (`lesson-cancellations/lesson-cancellations.service.ts`), so any cover of
  // the group would admit a teacher.
  'lessons.change': {
    section: 'groups',
    label: "Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['groups.view'],
  },
  'lessons.change-delete': {
    section: 'groups',
    label: "Bekor qilish, ko'chirish va o'rinbosarni o'chirish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['lessons.change'],
    danger: 'money',
  },
  // K gets the administrator's editing of a taken register
  // (`attendance/attendance-save.service.ts`).
  'attendance.mark': {
    section: 'groups',
    label: 'Davomat olish',
    defaultRoles: [D, A, T],
    allowedRoles: [D, A, K, T],
    lockReasons: {},
    requires: ['groups.view'],
  },
  // T: `attendance/attendance.controller.ts` drops `late=1` for a teacher and
  // `attendance-save.service.ts` writes the late register as a non-teacher.
  'attendance.fix': {
    section: 'groups',
    label:
      "Kech davomat, «Dars bo'ldimi?» javobi va oldindan aytilgan qoldirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.UNTESTED },
    requires: ['attendance.mark'],
  },

  // Lidlar
  'leads.view': {
    section: 'leads',
    label: 'Lidlar doskasi',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'leads.manage': {
    section: 'leads',
    label: "Lid qo'shish, tahrirlash va o'quvchiga aylantirish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['leads.view'],
  },
  // POST/PATCH/DELETE /lead-sources are COMPANY_WIDE (LeadSource has no branch).
  'leads.setup': {
    section: 'leads',
    label: "Doska ustunlari, bo'limlari va manbalari",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['leads.view'],
  },
  'leads.forms': {
    section: 'leads',
    label: 'Anketalar va ularning javoblari',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },

  // Aloqa markazi
  'outreach.view': {
    section: 'outreach',
    label: 'Aloqa markazi sahifasi',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'calls.log': {
    section: 'outreach',
    label: "Qo'ng'iroq natijasini kiritish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },

  // Mock imtihonlar
  'mock.view': {
    section: 'mock',
    label: "Mock imtihonlarni ko'rish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // The mock-exam-sections writes are COMPANY_WIDE (MockExamSection has no branch).
  'mock.manage': {
    section: 'mock',
    label: "Imtihon yaratish, natija kiritish va e'lon qilish",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['mock.view'],
  },
  'mock.payments': {
    section: 'mock',
    label: "Mock to'lovini qabul qilish va bekor qilish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['mock.view'],
    danger: 'money',
  },
} as const satisfies Record<string, PermissionDef>;
```

Create `server/src/common/permissions/permission-catalog.money.ts`:

```ts
import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections To'lovlar va qarzdorlik, Xarajatlar va kassa,
 * Ish haqi and Hisobotlar. `allowedRoles` and `lockReasons` follow ADR-0086's
 * table; a lock other than OWN_GROUPS names its cause. Every cashier widening
 * here rests on a branch check PR #696 (ADR-0081) added.
 */
export const MONEY_PERMISSIONS = {
  // To'lovlar va qarzdorlik
  'payments.view': {
    section: 'payments',
    label: "Moliya bo'limi: to'lovlar va kutilayotgan to'lovlar",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'payments.create': {
    section: 'payments',
    label: "To'lov qayd qilish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K gets the administrator's 72-hour correction window.
  'payments.correct': {
    section: 'payments',
    label: "To'lovni tuzatish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  'debt.view': {
    section: 'payments',
    label: 'Qarzdorlik sahifasi',
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'debt.promise': {
    section: 'payments',
    label: "To'lov va'dasini yozish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['debt.view'],
  },
  // K: confined by `withdrawals/withdrawals.service.ts` (plan A).
  'balance.withdraw': {
    section: 'payments',
    label: "Balansdagi pulni markaz hisobiga o'tkazish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  // K: confined by `refunds/refunds-eligibility.service.ts` (plan A).
  'refunds.create': {
    section: 'payments',
    label: "O'quvchiga pul qaytarish",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.profile'],
    danger: 'money',
  },
  'refunds.hand-over': {
    section: 'payments',
    label: "Qaytariladigan pulni o'quvchiga topshirish",
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['debt.view'],
    danger: 'money',
  },
  'refunds.cancel': {
    section: 'payments',
    label: "Pul qaytarish so'rovini bekor qilish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['refunds.create'],
    danger: 'money',
  },
  'debt.write-off': {
    section: 'payments',
    label: 'Qarzni kechirish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // A, K: confined by `transactions/transactions-write.service.ts` and
  // `billing/lesson-billing.service.ts` (plan A).
  'balance.adjust': {
    section: 'payments',
    label: "Balansni qo'lda tuzatish va yechilgan dars pulini qaytarish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // D, A, K: confined by `billing/debt-write-off.service.ts` (plan A).
  'money.undo': {
    section: 'payments',
    label: "To'lov, pul qaytarish va qarz kechirishni bekor qilish",
    defaultRoles: [],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['students.details'],
    danger: 'money',
  },
  // GET /gateways/events is UNREVIEWED; PaymentGatewayEvent has no branch.
  'payments.gateway-log': {
    section: 'payments',
    label: "To'lov tizimlari jurnali (Payme, Click)",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: ['payments.view'],
  },

  // Xarajatlar va kassa
  // Advances are not listed (`expenses/expenses.service.ts`).
  'expenses.view': {
    section: 'expenses',
    label: "Xarajatlarni ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // A, K: the advance recipient is checked against the branch
  // (`expenses/expenses.service.ts`, plan A).
  'expenses.manage': {
    section: 'expenses',
    label: "Xarajat kiritish, tahrirlash va o'chirish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['expenses.view'],
    danger: 'money',
  },
  'cash.manage': {
    section: 'expenses',
    label: "Kassa hisoblari va ular orasida o'tkazma",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
    danger: 'money',
  },

  // Ish haqi
  // A, K: payroll reads are confined (BRANCH_SCOPED_BY_PAYROLL, plan A).
  'salary.view': {
    section: 'salary',
    label: "Xodimlar oyligini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // `salary/shared/teacher-rate-permission.ts` refuses everyone but the CEO
  // and a Branch Director.
  'salary.rate': {
    section: 'salary',
    label: "O'qituvchiga stavka qo'yish",
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.UNTESTED,
      [K]: LOCK.UNTESTED,
      [T]: LOCK.UNTESTED,
    },
    requires: ['salary.view'],
    danger: 'money',
  },
  // A, K: nobody but the CEO pays their own salary
  // (`salary/salary-payment.service.ts`, ADR-0081).
  'salary.pay': {
    section: 'salary',
    label: "Oylik va avans to'lash",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['salary.view'],
    danger: 'money',
  },
  // PATCH /salary/config/:id and POST /salary/config/global are COMPANY_WIDE.
  'salary.rate-edit': {
    section: 'salary',
    label: "Stavkani o'zgartirish va umumiy stavka",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['salary.view'],
    danger: 'money',
  },
  // CEO only (CEO, 11.10): POST /salary/calculate settles every branch, and
  // `approvePayment` has no payroll scope.
  'salary.close': {
    section: 'salary',
    label: 'Oylikni hisoblash, tasdiqlash, oyni yopish va oylik davri',
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['salary.view'],
    danger: 'money',
  },

  // Hisobotlar
  // The finance reports show staff salaries (the «Oyliklar» card and sheet),
  // so they come with `salary.view` (CEO, 11.10).
  'reports.finance': {
    section: 'reports',
    label: 'Moliya va marketing hisobotlari',
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: ['salary.view'],
  },
  'reports.payments': {
    section: 'reports',
    label: "To'lov hisobotlari",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // The channel report is a COMPANY_WIDE read, allowed.
  'reports.students': {
    section: 'reports',
    label: "O'quvchilar, davomat va faoliyat hisobotlari",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'reports.leads': {
    section: 'reports',
    label: 'Lidlar hisoboti',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;
```

Create `server/src/common/permissions/permission-catalog.admin.ts`:

```ts
import {
  A,
  D,
  K,
  LOCK,
  T,
  type PermissionDef,
} from './permission-catalog.types';

/**
 * Capabilities of the sections Xodimlar, Izohlar, Sozlamalar, Bosh sahifa and
 * DaF ilovasi va media. `allowedRoles` and `lockReasons` follow ADR-0086's
 * table; a lock other than OWN_GROUPS names its cause.
 */
export const ADMIN_PERMISSIONS = {
  // Xodimlar
  // K: the teacher timeline is confined (`branch-route-policy.ts`, plan A).
  'teachers.view': {
    section: 'staff',
    label: "O'qituvchilar ro'yxati va profili",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K, T: `teachers/teachers.service.ts` `create` never reads the role
  // ceiling, which is empty for them (`telegram/constants.ts`).
  'teachers.manage': {
    section: 'staff',
    label: "O'qituvchi qo'shish, tahrirlash va holatini o'zgartirish",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: ['teachers.view'],
  },
  'employees.view': {
    section: 'staff',
    label: "Xodimlar ro'yxati va kartasi",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // K, T: `users/users.service.ts` returns early when no role changes, so an
  // empty-ceiling caller could create a role-less employee.
  'employees.manage': {
    section: 'staff',
    label: "Xodim qo'shish, tahrirlash va bloklash",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: ['employees.view'],
  },
  // K, T: `telegram/telegram.service.ts` refuses every request (ceiling []).
  'employees.invite': {
    section: 'staff',
    label: 'Telegram orqali xodim taklif qilish',
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.UNTESTED, [T]: LOCK.UNTESTED },
    requires: [],
  },

  // Izohlar
  'comments.write': {
    section: 'comments',
    label: 'Izoh yozish',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  // `comments/comments.service.ts` deletes and moderates by id + companyId.
  'comments.delete': {
    section: 'comments',
    label: "Boshqalarning izohini tahrirlash va o'chirish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: ['comments.write'],
  },

  // Sozlamalar
  // The three reason lists are COMPANY_WIDE writes.
  'settings.reference': {
    section: 'settings',
    label: "Kurslar, xonalar, dam olish kunlari va sabablar ro'yxatlari",
    defaultRoles: [D, A],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: [],
  },
  'courses.create': {
    section: 'settings',
    label: "Kurs ochish va to'lov turini tanlash",
    defaultRoles: [D],
    allowedRoles: [D, A],
    lockReasons: { [K]: LOCK.COMPANY, [T]: LOCK.COMPANY },
    requires: ['settings.reference'],
  },
  // A, K: only the CEO opens a branch (`branches/branches.service.ts`
  // `create`); the rest is confined to the caller's own branch. Closing a
  // branch cascades to its groups, hence `irreversible`.
  'settings.branches': {
    section: 'settings',
    label: 'Filiallar: tahrirlash va yopish',
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
    danger: 'irreversible',
  },
  'settings.payment': {
    section: 'settings',
    label: "To'lov sozlamalari (filial qismi)",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
  // Approving a group binds it to a branch, and the branch's 21:00 money
  // report starts going there (`telegram-groups/telegram-groups.service.ts`).
  'settings.telegram-groups': {
    section: 'settings',
    label: 'Telegram guruhlarini tasdiqlash va sozlash',
    defaultRoles: [D],
    allowedRoles: [D],
    lockReasons: {
      [A]: LOCK.GROUP_REPORT,
      [K]: LOCK.GROUP_REPORT,
      [T]: LOCK.GROUP_REPORT,
    },
    requires: [],
  },
  // A COMPANY_WIDE read.
  'settings.absence-pause': {
    section: 'settings',
    label: "Avtomatik pauza sozlamasini ko'rish",
    defaultRoles: [D],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
  // POST /telegram-groups/announce reaches every company.
  'telegram.announce': {
    section: 'settings',
    label: "Telegram guruhlariga e'lon yuborish va botni guruhdan uzish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: ['settings.telegram-groups'],
  },
  // PATCH /company/:id and PATCH /absence-pause/settings.
  'settings.company': {
    section: 'settings',
    label: 'Kompaniya darajasidagi sozlamalar',
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.COMPANY,
      [A]: LOCK.COMPANY,
      [K]: LOCK.COMPANY,
      [T]: LOCK.COMPANY,
    },
    requires: [],
  },
  // The five /archive* routes are UNREVIEWED.
  'settings.archive': {
    section: 'settings',
    label: "Arxiv: tiklash va butunlay o'chirish",
    defaultRoles: [],
    allowedRoles: [],
    lockReasons: {
      [D]: LOCK.BRANCH,
      [A]: LOCK.BRANCH,
      [K]: LOCK.BRANCH,
      [T]: LOCK.BRANCH,
    },
    requires: [],
    danger: 'irreversible',
  },

  // Bosh sahifa
  // `dashboard/dashboard-summary.service.ts` is branch-wide.
  'dashboard.view': {
    section: 'home',
    label: 'Bosh sahifa paneli',
    defaultRoles: [D, A, K],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },

  // DaF ilovasi va media
  'daf.activity': {
    section: 'daf',
    label: "DaF ilovasi: markaz bo'yicha faollik",
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.OWN_GROUPS },
    requires: [],
  },
  'media.view': {
    section: 'daf',
    label: 'Media',
    defaultRoles: [D, A],
    allowedRoles: [D, A, K],
    lockReasons: { [T]: LOCK.NO_PAGE },
    requires: [],
  },
} as const satisfies Record<string, PermissionDef>;
```

Replace the whole of `server/src/common/permissions/permission-catalog.ts` (old: the 516-line file starting `import { ROLE_ID } from '../auth/role-ids';` and ending with `defaultKeysForRoles`) with:

```ts
import { ROLE_ID } from '../auth/role-ids';
import { ADMIN_PERMISSIONS } from './permission-catalog.admin';
import { MONEY_PERMISSIONS } from './permission-catalog.money';
import { PEOPLE_PERMISSIONS } from './permission-catalog.people';
import type { PermissionDef } from './permission-catalog.types';

export {
  EDITABLE_ROLE_IDS,
  LOCK,
  PERMISSION_SECTIONS,
  type LockReason,
  type PermissionDef,
  type PermissionSection,
  type StaffRoleId,
} from './permission-catalog.types';

/**
 * Every capability ("imkoniyat") a staff role can hold — the single source of
 * truth (spec docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md,
 * §6 and §10). A role answers "who is this?" (portal, rank, branch, own
 * groups); a capability answers "what may they do?".
 *
 * The data is split by section into `permission-catalog.people.ts`,
 * `permission-catalog.money.ts` and `permission-catalog.admin.ts`; the shapes
 * are in `permission-catalog.types.ts`. Import from this file only.
 *
 * `defaultRoles` is today's behaviour. The CEO changes a role's capabilities
 * on the «Ruxsatlar» page within `allowedRoles` (ADR-0086); the CEO holds
 * every capability, always. A new capability needs `allowedRoles` and
 * `lockReasons` too: `permission-catalog.spec.ts` and
 * `permission-allowed-roles.spec.ts` check them.
 */
export const PERMISSIONS = {
  ...PEOPLE_PERMISSIONS,
  ...MONEY_PERMISSIONS,
  ...ADMIN_PERMISSIONS,
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return Object.hasOwn(PERMISSIONS, key);
}

export function permissionDef(key: PermissionKey): PermissionDef {
  return PERMISSIONS[key];
}

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

In `client/src/lib/permission-keys.ts`, old:

```ts
  "students.initial-balance",
  "groups.view",
```

new:

```ts
  "students.initial-balance",
  "contracts.manage",
  "groups.view",
```

Replace the whole of `client/src/test-support/server-catalog.ts` with (the private `load` becomes the exported `loadServerFile`; the catalog is now five files):

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
 * the same menus as before. The server is a separate package, so its
 * plain-data files are transpiled on the fly (`status-config.test.ts` reads
 * server code the same way, as text).
 */
const SERVER_SRC = join(__dirname, "../../../server/src");

/**
 * Transpiles one server file (path relative to `server/src`) and runs it.
 * `deps` maps every import the file makes to its already-loaded exports; an
 * import missing from it throws, so a new server import cannot slip in.
 */
export function loadServerFile(
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
    const roleIds = loadServerFile("common/auth/role-ids.ts", {});
    const types = loadServerFile(
      "common/permissions/permission-catalog.types.ts",
      { "../auth/role-ids": roleIds },
    );
    const data = (part: string) =>
      loadServerFile(`common/permissions/permission-catalog.${part}.ts`, {
        "./permission-catalog.types": types,
      });
    cached = loadServerFile("common/permissions/permission-catalog.ts", {
      "../auth/role-ids": roleIds,
      "./permission-catalog.types": types,
      "./permission-catalog.people": data("people"),
      "./permission-catalog.money": data("money"),
      "./permission-catalog.admin": data("admin"),
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/common/permissions src/common/auth/branch-route-policy.spec.ts`
Expected: PASS — including `permission-routes.spec.ts` untouched (no route uses `contracts.manage` yet, and no `defaultRoles` changed), and `permission-allowed-roles.spec.ts` (the only widened capability with a COMPANY_WIDE write is `settings.branches` → `POST /branches`; no widened capability has an UNREVIEWED route — verified with `discoverRoutes` while drafting).

Run: `cd client && npx vitest run src/lib/permission-keys.test.ts src/lib/settings-nav.test.ts src/lib/nav-items.test.ts src/lib/reports-nav.test.ts src/lib/daf-nav.test.ts`
Expected: PASS (the client list now has 67 keys in the server's order; menus unchanged because no default changed).

- [ ] **Step 5: Lint, format, type-check**

```
cd server
npx prettier --write src/common/permissions/permission-catalog.types.ts src/common/permissions/permission-catalog.people.ts src/common/permissions/permission-catalog.money.ts src/common/permissions/permission-catalog.admin.ts src/common/permissions/permission-catalog.ts src/common/permissions/permission-catalog.spec.ts src/common/permissions/permission-allowed-roles.spec.ts src/common/permissions/permissions.service.spec.ts
npx eslint src/common/permissions/permission-catalog.types.ts src/common/permissions/permission-catalog.people.ts src/common/permissions/permission-catalog.money.ts src/common/permissions/permission-catalog.admin.ts src/common/permissions/permission-catalog.ts src/common/permissions/permission-catalog.spec.ts src/common/permissions/permission-allowed-roles.spec.ts src/common/permissions/permissions.service.spec.ts
npm run typecheck
cd ../client
npx tsc --noEmit
npx eslint src/lib/permission-keys.ts src/test-support/server-catalog.ts
```
No Prettier on the two client files. `wc -l server/src/common/permissions/permission-catalog*.ts` — every file under 500 lines.

- [ ] **Step 6: Commit**

From the worktree root:
```
git add server/src/common/permissions/permission-catalog.types.ts server/src/common/permissions/permission-catalog.people.ts server/src/common/permissions/permission-catalog.money.ts server/src/common/permissions/permission-catalog.admin.ts server/src/common/permissions/permission-catalog.ts server/src/common/permissions/permission-catalog.spec.ts server/src/common/permissions/permission-allowed-roles.spec.ts server/src/common/permissions/permissions.service.spec.ts client/src/lib/permission-keys.ts client/src/test-support/server-catalog.ts
git commit -m "feat(permissions): split the catalog, add allowed roles, lock reasons and contracts.manage

Each capability now says which roles the CEO may give it to and why the
others are locked (ADR-0086). Defaults are unchanged; reports.finance now
requires salary.view (CEO, 11.10).

Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Replace `<model>` with the executing model's name.)

---

### Task 2: Dependency functions (server + client copy, one test table)

**Files:**
- Create: `server/src/common/permissions/permission-deps.ts` (pure, no imports)
- Create: `server/src/common/permissions/permission-deps.vectors.ts` (test table, no imports)
- Create: `client/src/lib/permission-deps.ts` (byte-identical copy of the server file)
- Test: `server/src/common/permissions/permission-deps.spec.ts`
- Test: `client/src/lib/permission-deps.test.ts`

**Interfaces:**
- Consumes: `PERMISSIONS`, `EDITABLE_ROLE_IDS`, `defaultKeysForRoles` from Task 1 (spec only); `loadServerFile(relativePath, deps)` from `client/src/test-support/server-catalog.ts` (Task 1).
- Produces:
```ts
// permission-deps.ts — NO imports (copied verbatim to the client)
export type DepGraph = Readonly<Record<string, { readonly requires: readonly string[] }>>;
export function withRequirements(keys: Iterable<string>, graph: DepGraph): Set<string>;
export function withDependents(keys: Iterable<string>, graph: DepGraph): Set<string>;
export function stabilize(keys: Iterable<string>, graph: DepGraph): Set<string>;
export interface TogglePlan { readonly next: Set<string>; readonly also: string[] }
export function planToggle(current: ReadonlySet<string>, key: string, on: boolean, graph: DepGraph): TogglePlan;
//   on:  next = current ∪ withRequirements([key]); also = withRequirements([key]) \ current \ {key}
//   off: gone = withDependents([key]) ∩ current;   next = current \ gone; also = gone \ {key}
//   a key the graph does not know: next = copy of current, also = [] (see notes)
// permission-deps.vectors.ts — NO imports
export const DEP_GRAPH: Record<string, { requires: string[] }>;
export interface ToggleVector { name: string; current: string[]; key: string; on: boolean; next: string[]; also: string[] }
export interface StabilizeVector { name: string; input: string[]; output: string[] }
export const TOGGLE_VECTORS: readonly ToggleVector[];      // 10
export const STABILIZE_VECTORS: readonly StabilizeVector[]; // 5
```

- [ ] **Step 1: Write the failing tests**

Create `server/src/common/permissions/permission-deps.vectors.ts` (the table both specs run):

```ts
/**
 * Test vectors for `permission-deps.ts`. The server spec runs them, and the
 * client copy's test loads this file through `loadServerFile` and runs them
 * against `client/src/lib/permission-deps.ts` — one table, two copies. No
 * imports: the client loads it as plain data. `next`, `also` and `output`
 * are sorted.
 *
 * The graph: b needs a, c needs b, d needs a and x, e needs c and x.
 */
export const DEP_GRAPH: Record<string, { requires: string[] }> = {
  a: { requires: [] },
  b: { requires: ['a'] },
  c: { requires: ['b'] },
  x: { requires: [] },
  d: { requires: ['a', 'x'] },
  e: { requires: ['c', 'x'] },
};

export interface ToggleVector {
  name: string;
  current: string[];
  key: string;
  on: boolean;
  next: string[];
  also: string[];
}

export interface StabilizeVector {
  name: string;
  input: string[];
  output: string[];
}

export const TOGGLE_VECTORS: readonly ToggleVector[] = [
  {
    name: 'chain on brings every requirement',
    current: [],
    key: 'c',
    on: true,
    next: ['a', 'b', 'c'],
    also: ['a', 'b'],
  },
  {
    name: 'chain off takes every dependent',
    current: ['a', 'b', 'c'],
    key: 'a',
    on: false,
    next: [],
    also: ['b', 'c'],
  },
  {
    name: 'diamond on lists only what was off',
    current: ['x'],
    key: 'e',
    on: true,
    next: ['a', 'b', 'c', 'e', 'x'],
    also: ['a', 'b', 'c'],
  },
  {
    name: 'diamond off through the shared requirement',
    current: ['a', 'b', 'c', 'd', 'e', 'x'],
    key: 'x',
    on: false,
    next: ['a', 'b', 'c'],
    also: ['d', 'e'],
  },
  {
    name: 'off in the middle keeps what it needs',
    current: ['a', 'b', 'c', 'e', 'x'],
    key: 'b',
    on: false,
    next: ['a', 'x'],
    also: ['c', 'e'],
  },
  {
    name: 'on with one requirement already held',
    current: ['a'],
    key: 'd',
    on: true,
    next: ['a', 'd', 'x'],
    also: ['x'],
  },
  {
    name: 'already on changes nothing',
    current: ['a', 'b'],
    key: 'b',
    on: true,
    next: ['a', 'b'],
    also: [],
  },
  {
    name: 'already off changes nothing',
    current: ['a'],
    key: 'c',
    on: false,
    next: ['a'],
    also: [],
  },
  {
    name: 'a leaf off goes alone',
    current: ['a', 'b', 'x'],
    key: 'x',
    on: false,
    next: ['a', 'b'],
    also: [],
  },
  {
    name: 'an unknown key changes nothing',
    current: ['a'],
    key: 'zz',
    on: true,
    next: ['a'],
    also: [],
  },
];

export const STABILIZE_VECTORS: readonly StabilizeVector[] = [
  { name: 'a stable set stays', input: ['a', 'b', 'd', 'x'], output: ['a', 'b', 'd', 'x'] },
  { name: 'one missing requirement drops one key', input: ['a', 'c', 'd', 'x'], output: ['a', 'd', 'x'] },
  { name: 'a missing root drops the whole chain', input: ['b', 'c', 'e', 'x'], output: ['x'] },
  { name: 'an unknown key is dropped', input: ['a', 'zz'], output: ['a'] },
  { name: 'the empty set stays empty', input: [], output: [] },
];
```

Create `server/src/common/permissions/permission-deps.spec.ts`:

```ts
import {
  EDITABLE_ROLE_IDS,
  PERMISSIONS,
  defaultKeysForRoles,
} from './permission-catalog';
import {
  planToggle,
  stabilize,
  withDependents,
  withRequirements,
} from './permission-deps';
import {
  DEP_GRAPH,
  STABILIZE_VECTORS,
  TOGGLE_VECTORS,
} from './permission-deps.vectors';

const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

describe('capability dependencies (spec §5)', () => {
  it.each(TOGGLE_VECTORS.map((v) => [v.name, v] as const))(
    'toggle: %s',
    (_name, v) => {
      const plan = planToggle(new Set(v.current), v.key, v.on, DEP_GRAPH);
      expect(sorted(plan.next)).toEqual(v.next);
      expect(plan.also).toEqual(v.also);
    },
  );

  it.each(STABILIZE_VECTORS.map((v) => [v.name, v] as const))(
    'stabilize: %s',
    (_name, v) => {
      expect(sorted(stabilize(v.input, DEP_GRAPH))).toEqual(v.output);
    },
  );

  it('walks requirements and dependents transitively', () => {
    expect(sorted(withRequirements(['e'], DEP_GRAPH))).toEqual([
      'a',
      'b',
      'c',
      'e',
      'x',
    ]);
    expect(sorted(withDependents(['a'], DEP_GRAPH))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('never changes the set it plans from', () => {
    const current = new Set(['a', 'b', 'c']);
    planToggle(current, 'a', false, DEP_GRAPH);
    planToggle(current, 'e', true, DEP_GRAPH);
    expect(sorted(current)).toEqual(['a', 'b', 'c']);
  });

  it.each([...EDITABLE_ROLE_IDS])(
    "leaves role %i's catalog defaults as they are",
    (roleId) => {
      const defaults = defaultKeysForRoles([roleId]);
      expect(sorted(stabilize(defaults, PERMISSIONS))).toEqual(
        sorted(defaults),
      );
    },
  );
});
```

Create `client/src/lib/permission-deps.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadServerFile } from "@/test-support/server-catalog";
import { planToggle, stabilize, type DepGraph } from "./permission-deps";

/**
 * `permission-deps.ts` here is a byte-for-byte copy of the server's
 * `server/src/common/permissions/permission-deps.ts` (ADR-0086): the page
 * plans a toggle with the code the server validates it with. This test fails
 * when the two drift, and runs the server's own vectors against this copy.
 */
interface Vectors {
  DEP_GRAPH: DepGraph;
  TOGGLE_VECTORS: {
    name: string;
    current: string[];
    key: string;
    on: boolean;
    next: string[];
    also: string[];
  }[];
  STABILIZE_VECTORS: { name: string; input: string[]; output: string[] }[];
}

const SERVER_COPY = join(
  __dirname,
  "../../../server/src/common/permissions/permission-deps.ts",
);
const vectors = loadServerFile(
  "common/permissions/permission-deps.vectors.ts",
  {},
) as unknown as Vectors;
const sorted = (keys: Iterable<string>): string[] => [...keys].sort();

describe("permission-deps (client copy)", () => {
  it("is the server file, byte for byte", () => {
    expect(readFileSync(join(__dirname, "permission-deps.ts"), "utf8")).toBe(
      readFileSync(SERVER_COPY, "utf8"),
    );
  });

  it.each(vectors.TOGGLE_VECTORS.map((v) => [v.name, v] as const))(
    "toggle: %s",
    (_name, v) => {
      const plan = planToggle(new Set(v.current), v.key, v.on, vectors.DEP_GRAPH);
      expect(sorted(plan.next)).toEqual(v.next);
      expect(plan.also).toEqual(v.also);
    },
  );

  it.each(vectors.STABILIZE_VECTORS.map((v) => [v.name, v] as const))(
    "stabilize: %s",
    (_name, v) => {
      expect(sorted(stabilize(v.input, vectors.DEP_GRAPH))).toEqual(v.output);
    },
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/permissions/permission-deps.spec.ts`
Expected: FAIL — `Cannot find module './permission-deps'`.

Run: `cd client && npx vitest run src/lib/permission-deps.test.ts`
Expected: FAIL — `Failed to resolve import "./permission-deps"`.

- [ ] **Step 3: Implement**

Create `server/src/common/permissions/permission-deps.ts`:

```ts
/**
 * Capability dependencies (spec §5). Turning a capability on brings what it
 * requires; turning it off takes what requires it; `stabilize` drops a
 * capability whose requirement is missing.
 *
 * Pure and import-free on purpose: `client/src/lib/permission-deps.ts` is a
 * byte-for-byte copy, so the «Ruxsatlar» page plans a toggle with the same
 * code the server checks it with (ADR-0086). Edit this file, run Prettier on
 * it, then copy it to the client; the client's `permission-deps.test.ts`
 * fails until the two are equal.
 */

export type DepGraph = Readonly<
  Record<string, { readonly requires: readonly string[] }>
>;

/** `keys` plus everything they require, transitively. */
export function withRequirements(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set<string>();
  const todo = [...keys];
  for (let key = todo.pop(); key !== undefined; key = todo.pop()) {
    if (out.has(key)) continue;
    out.add(key);
    if (Object.hasOwn(graph, key)) todo.push(...graph[key].requires);
  }
  return out;
}

/** `keys` plus every capability that requires one of them, transitively. */
export function withDependents(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set(keys);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [key, def] of Object.entries(graph)) {
      if (!out.has(key) && def.requires.some((needed) => out.has(needed))) {
        out.add(key);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * `keys` without every capability whose requirement is missing, or that the
 * graph does not know, repeated until nothing more drops.
 */
export function stabilize(
  keys: Iterable<string>,
  graph: DepGraph,
): Set<string> {
  const out = new Set(keys);
  let dropped = true;
  while (dropped) {
    dropped = false;
    for (const key of out) {
      if (
        !Object.hasOwn(graph, key) ||
        graph[key].requires.some((needed) => !out.has(needed))
      ) {
        out.delete(key);
        dropped = true;
      }
    }
  }
  return out;
}

export interface TogglePlan {
  /** The role's capabilities after the toggle. */
  readonly next: Set<string>;
  /** What changes along with the key, sorted («Birga yoqiladi / o'chadi»). */
  readonly also: string[];
}

/**
 * What turning `key` on or off for one role changes. `current` is not
 * touched. A key the graph does not know changes nothing.
 */
export function planToggle(
  current: ReadonlySet<string>,
  key: string,
  on: boolean,
  graph: DepGraph,
): TogglePlan {
  const next = new Set(current);
  if (!Object.hasOwn(graph, key)) return { next, also: [] };
  const changed = on
    ? [...withRequirements([key], graph)].filter((k) => !current.has(k))
    : [...withDependents([key], graph)].filter((k) => current.has(k));
  for (const k of changed) {
    if (on) next.add(k);
    else next.delete(k);
  }
  return { next, also: changed.filter((k) => k !== key).sort() };
}
```

Then format the server file and copy it to the client (no Prettier on the client side):

```
cd server && npx prettier --write src/common/permissions/permission-deps.ts src/common/permissions/permission-deps.vectors.ts src/common/permissions/permission-deps.spec.ts
cd .. && /bin/cp server/src/common/permissions/permission-deps.ts client/src/lib/permission-deps.ts
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/common/permissions/permission-deps.spec.ts`
Expected: PASS (10 toggle vectors, 5 stabilize vectors, the walk, the no-mutation check, and the four editable roles' defaults are stable).

Run: `cd client && npx vitest run src/lib/permission-deps.test.ts`
Expected: PASS (equality + the same 15 vectors).

- [ ] **Step 5: Lint, format, type-check**

```
cd server
npx prettier --write src/common/permissions/permission-deps.ts src/common/permissions/permission-deps.vectors.ts src/common/permissions/permission-deps.spec.ts
npx eslint src/common/permissions/permission-deps.ts src/common/permissions/permission-deps.vectors.ts src/common/permissions/permission-deps.spec.ts
npm run typecheck
cd ../client
npx tsc --noEmit
npx eslint src/lib/permission-deps.ts src/lib/permission-deps.test.ts
```
If Prettier changed `permission-deps.ts` in this step, copy it again (`/bin/cp` as in Step 3) and re-run the client test.

- [ ] **Step 6: Commit**

From the worktree root:
```
git add server/src/common/permissions/permission-deps.ts server/src/common/permissions/permission-deps.vectors.ts server/src/common/permissions/permission-deps.spec.ts client/src/lib/permission-deps.ts client/src/lib/permission-deps.test.ts
git commit -m "feat(permissions): capability dependency functions shared by server and client

One pure file plans a toggle and stabilises a set; the client keeps a
byte-for-byte copy checked by test, and both run one table of vectors.

Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 3: `RolePermission` table, migration, `PermissionsService` reads overrides

**Files:**
- Modify: `server/prisma/schema.prisma` (`model RolePermission` + back-relations on `Role`, `User`, `Company`)
- Create: `server/prisma/migrations/20261012090000_role_permissions/migration.sql`
- Create: `server/src/common/permissions/effective-permissions.ts`
- Modify: `server/src/common/permissions/permissions.service.ts` (overrides, coalescing, `invalidateAll`, generation guard)
- Modify: `server/src/common/permissions/testing.ts` (`fakePermissions(roleIds, opts?)`)
- Test: `server/src/common/permissions/effective-permissions.spec.ts` (new)
- Test: `server/src/common/permissions/permissions.service.spec.ts` (rewritten)
- Test: `server/src/common/permissions/testing.spec.ts` (+ `fakePermissions` block)

**Interfaces:**
- Consumes: from Task 1 `EDITABLE_ROLE_IDS`, `PERMISSIONS`, `PERMISSION_KEYS`, `PermissionKey`, `StaffRoleId`, `defaultKeysForRoles`, `isPermissionKey`, `permissionDef`; from Task 2 `stabilize`; existing `whereUserMayAct()` (`common/auth/blocked-user.ts`), `ROLE_ID`, `ROLE_NAME_BY_ID`.
- Produces:
```ts
// effective-permissions.ts
export interface RoleOverride { readonly roleId: number; readonly key: string; readonly granted: boolean }
export function keysForRole(roleId: StaffRoleId, overrides: readonly RoleOverride[]): Set<PermissionKey>;
export function effectiveForRoles(roleIds: readonly number[], overrides: readonly RoleOverride[]): Set<PermissionKey>;
// permissions.service.ts
export interface CallerAccess { roleIds; roleNames; keys }  // unchanged
class PermissionsService {
  forUser(userId: number): Promise<CallerAccess>;
  has(userId: number, key: PermissionKey): Promise<boolean>; // unchanged
  invalidateAll(): void;
}
// testing.ts
export function fakePermissions(roleIds: number[], opts?: { userId?: number; overrides?: RoleOverride[] }): PermissionsService;
// Prisma: prisma.rolePermission (companyId, roleId, key, granted, updatedById, updatedAt; @@id([companyId, roleId, key]))
```

- [ ] **Step 1: Write the failing tests**

Create `server/src/common/permissions/effective-permissions.spec.ts`:

```ts
import { ROLE_ID } from '../auth/role-ids';
import {
  RoleOverride,
  effectiveForRoles,
  keysForRole,
} from './effective-permissions';
import { PERMISSION_KEYS, defaultKeysForRoles } from './permission-catalog';

const sorted = (keys: Iterable<string>): string[] => [...keys].sort();
const A = ROLE_ID.ADMINISTRATOR;
const K = ROLE_ID.CASHIER;
const T = ROLE_ID.TEACHER;

describe('effective capabilities (spec §3, ADR-0086)', () => {
  it('gives the CEO every capability, whatever is stored', () => {
    const revoke: RoleOverride[] = [
      { roleId: ROLE_ID.CEO, key: 'students.list', granted: false },
    ];
    expect(effectiveForRoles([ROLE_ID.CEO], revoke).size).toBe(
      PERMISSION_KEYS.length,
    );
    expect(effectiveForRoles([T, ROLE_ID.CEO], []).size).toBe(
      PERMISSION_KEYS.length,
    );
  });

  it('equals the catalog defaults for every role combination while nothing is stored', () => {
    const roles = [2, 3, 4, 5, 6];
    for (let mask = 0; mask < 1 << roles.length; mask++) {
      const held = roles.filter((_, i) => mask & (1 << i));
      expect({ held, keys: sorted(effectiveForRoles(held, [])) }).toEqual({
        held,
        keys: sorted(defaultKeysForRoles(held)),
      });
    }
  });

  it('adds up the roles of a multi-role account, each with its own changes', () => {
    const overrides: RoleOverride[] = [
      { roleId: K, key: 'students.list', granted: true },
      { roleId: A, key: 'students.sms', granted: false },
    ];
    expect(sorted(effectiveForRoles([A, K], overrides))).toEqual(
      sorted(
        new Set([...keysForRole(A, overrides), ...keysForRole(K, overrides)]),
      ),
    );
  });

  it('applies a grant to the role it names and to no other', () => {
    const grant: RoleOverride[] = [
      { roleId: K, key: 'students.list', granted: true },
    ];
    expect(keysForRole(K, grant).has('students.list')).toBe(true);
    expect(sorted(keysForRole(A, grant))).toEqual(
      sorted(defaultKeysForRoles([A])),
    );
  });

  it('revokes a default', () => {
    const keys = keysForRole(A, [
      { roleId: A, key: 'students.sms', granted: false },
    ]);
    expect(keys.has('students.sms')).toBe(false);
    expect(keys.has('students.details')).toBe(true);
  });

  it('ignores a key the catalog does not know', () => {
    expect(
      sorted(keysForRole(A, [{ roleId: A, key: 'old.key', granted: true }])),
    ).toEqual(sorted(defaultKeysForRoles([A])));
  });

  it('ignores a grant outside allowedRoles', () => {
    expect(
      keysForRole(T, [{ roleId: T, key: 'students.list', granted: true }]).has(
        'students.list',
      ),
    ).toBe(false);
    expect(
      keysForRole(K, [{ roleId: K, key: 'leads.setup', granted: true }]).has(
        'leads.setup',
      ),
    ).toBe(false);
  });

  it('drops what a revoked requirement held up', () => {
    const keys = keysForRole(A, [
      { roleId: A, key: 'students.details', granted: false },
    ]);
    for (const dependent of [
      'students.details',
      'students.sms',
      'contracts.manage',
      'payments.correct',
      'debt.write-off',
    ]) {
      expect({ dependent, held: keys.has(dependent as never) }).toEqual({
        dependent,
        held: false,
      });
    }
    expect(keys.has('students.profile')).toBe(true);
  });

  it('drops a grant whose requirement the role lacks', () => {
    expect(
      keysForRole(K, [{ roleId: K, key: 'refunds.cancel', granted: true }]).has(
        'refunds.cancel',
      ),
    ).toBe(false);
  });

  it('gives a student or a role-less account nothing', () => {
    const grant: RoleOverride[] = [
      { roleId: ROLE_ID.STUDENT, key: 'students.list', granted: true },
    ];
    expect(effectiveForRoles([ROLE_ID.STUDENT], grant).size).toBe(0);
    expect(effectiveForRoles([], grant).size).toBe(0);
  });
});
```

Replace the whole of `server/src/common/permissions/permissions.service.spec.ts` with:

```ts
import { Logger } from '@nestjs/common';
import { PERMISSION_KEYS, defaultKeysForRoles } from './permission-catalog';
import { PermissionsService } from './permissions.service';

type Role = { id: number; name: string };
type Override = { roleId: number; key: string; granted: boolean };

const userRow = (roles: Role[]) => ({
  companyId: 1,
  roles: roles.map((role) => ({ role })),
});

function prismaReturning(roles: Role[] | null, overrides: Override[] = []) {
  return {
    user: {
      findFirst: jest
        .fn()
        .mockResolvedValue(roles === null ? null : userRow(roles)),
    },
    rolePermission: { findMany: jest.fn().mockResolvedValue(overrides) },
  };
}

describe('PermissionsService', () => {
  afterEach(() => jest.restoreAllMocks());

  it("reads the roles and the role's stored changes for an account that may act", async () => {
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
        companyId: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: { companyId: 1, roleId: { in: [4] } },
      select: { roleId: true, key: true, granted: true },
    });
    expect(access.roleNames).toEqual(['Teacher']);
    expect([...access.keys].sort()).toEqual(['attendance.mark', 'groups.view']);
  });

  it('applies the stored changes of the roles held', async () => {
    const prisma = prismaReturning(
      [{ id: 3, name: 'Administrator' }],
      [
        { roleId: 3, key: 'students.sms', granted: false },
        { roleId: 3, key: 'students.initial-balance', granted: true },
      ],
    );
    const service = new PermissionsService(prisma as never);

    const access = await service.forUser(10501);

    expect(access.keys.has('students.sms')).toBe(false);
    expect(access.keys.has('students.initial-balance')).toBe(true);
    expect(access.roleIds).toEqual([3]);
  });

  it('gives the CEO every capability without reading stored changes', async () => {
    const prisma = prismaReturning([{ id: 1, name: 'CEO' }]);
    const service = new PermissionsService(prisma as never);
    expect((await service.forUser(10001)).keys.size).toBe(
      PERMISSION_KEYS.length,
    );
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('gives a student nothing without reading stored changes', async () => {
    const prisma = prismaReturning([{ id: 6, name: 'Student' }]);
    const service = new PermissionsService(prisma as never);
    expect((await service.forUser(10502)).keys.size).toBe(0);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('gives a blocked, archived or unknown account nothing', async () => {
    const prisma = prismaReturning(null);
    const service = new PermissionsService(prisma as never);
    const access = await service.forUser(10002);
    expect(access.roleIds).toEqual([]);
    expect(access.keys.size).toBe(0);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
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

  it('loads one user once when several requests ask at the same time', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);

    const [first, second] = await Promise.all([
      service.forUser(10005),
      service.forUser(10005),
    ]);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('reads the database again after invalidateAll', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    const service = new PermissionsService(prisma as never);

    await service.forUser(10006);
    service.invalidateAll();
    await service.forUser(10006);

    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('does not keep an answer whose load started before invalidateAll', async () => {
    const prisma = prismaReturning([{ id: 3, name: 'Administrator' }]);
    let release: (value: unknown) => void = () => undefined;
    prisma.user.findFirst.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const service = new PermissionsService(prisma as never);

    const stale = service.forUser(10007);
    service.invalidateAll();
    const fresh = service.forUser(10007);
    // The request after the write did not wait on the load from before it.
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);

    release(userRow([{ id: 2, name: 'Branch Director' }]));
    expect((await stale).roleNames).toEqual(['Branch Director']);
    expect((await fresh).roleNames).toEqual(['Administrator']);

    expect((await service.forUser(10007)).roleNames).toEqual(['Administrator']);
    expect(prisma.user.findFirst).toHaveBeenCalledTimes(2);
  });

  it('logs and ignores a stored key the catalog no longer has', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = new PermissionsService(
      prismaReturning(
        [{ id: 3, name: 'Administrator' }],
        [
          { roleId: 3, key: 'old.key', granted: true },
          { roleId: 3, key: 'old.key', granted: false },
        ],
      ) as never,
    );

    const access = await service.forUser(10008);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('old.key');
    expect([...access.keys].sort()).toEqual(
      [...defaultKeysForRoles([3])].sort(),
    );
  });
});
```

In `server/src/common/permissions/testing.spec.ts`, old:

```ts
import { defaultRolesOf, routeAccess } from './testing';
```

new:

```ts
import { defaultRolesOf, fakePermissions, routeAccess } from './testing';
```

and append at the end of the file (after the closing `});` of `describe('access markers', …)`):

```ts

describe('fakePermissions', () => {
  it('gives every caller the roles when no user is named', async () => {
    const permissions = fakePermissions([3]);
    expect(await permissions.has(8, 'students.list')).toBe(true);
  });

  it('gives only the named user the roles', async () => {
    const permissions = fakePermissions([3], { userId: 7 });
    expect(await permissions.has(7, 'students.list')).toBe(true);
    expect(await permissions.has(8, 'students.list')).toBe(false);
    expect((await permissions.forUser(8)).roleIds).toEqual([]);
  });

  it("applies the CEO's changes it is given", async () => {
    const permissions = fakePermissions([5], {
      overrides: [
        { roleId: 5, key: 'students.list', granted: true },
        { roleId: 5, key: 'payments.create', granted: false },
      ],
    });
    expect(await permissions.has(1, 'students.list')).toBe(true);
    expect(await permissions.has(1, 'payments.create')).toBe(false);
  });

  it('has an invalidateAll that does nothing', () => {
    expect(() => fakePermissions([2]).invalidateAll()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/permissions/effective-permissions.spec.ts src/common/permissions/permissions.service.spec.ts src/common/permissions/testing.spec.ts`
Expected: FAIL —
- `effective-permissions.spec.ts`: `Cannot find module './effective-permissions'`;
- `permissions.service.spec.ts`: the `findFirst` call lacks `companyId: true`, `rolePermission.findMany` is never called, the override test still sees `students.sms`, the concurrency test sees 2 calls, `invalidateAll is not a function`;
- `testing.spec.ts`: `has(8, …)` is true with `{ userId: 7 }`, overrides ignored, `invalidateAll is not a function`.

- [ ] **Step 3: Implement**

**3a. Schema** — `server/prisma/schema.prisma`. Edit by hand; do **not** run `npx prisma format` (the `Company` block is not Prisma-formatted today, and format would rewrite unrelated lines).

Old:
```prisma
model Role {
  id   Int    @id
  name String @unique

  users UserRole[]
}
```
New:
```prisma
model Role {
  id   Int    @id
  name String @unique

  users       UserRole[]
  permissions RolePermission[]
}
```

Old (in `model User`):
```prisma
  updatedSettings Setting[] @relation("SettingUpdatedBy")

  @@index([deletedAt])
  @@index([status])
}
```
New:
```prisma
  updatedSettings Setting[] @relation("SettingUpdatedBy")

  rolePermissionUpdates RolePermission[] @relation("RolePermissionUpdatedBy")

  @@index([deletedAt])
  @@index([status])
}
```

Old (end of `model Company`):
```prisma
  monthlyCharges              EnrollmentMonthlyCharge[]
  settings                    Setting[]
}

enum TelegramGroupStatus {
```
New:
```prisma
  monthlyCharges              EnrollmentMonthlyCharge[]
  settings                    Setting[]
  rolePermissions             RolePermission[]
}

/// The CEO's change to a role's capabilities. Only differences from the
/// catalog default are stored (ADR-0086).
model RolePermission {
  companyId   Int
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  roleId      Int
  role        Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  key         String
  granted     Boolean
  updatedById Int?
  updatedBy   User?    @relation("RolePermissionUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  updatedAt   DateTime @updatedAt

  @@id([companyId, roleId, key])
}

enum TelegramGroupStatus {
```

Then: `cd server && npx prisma validate && npx prisma generate`.

**3b. Migration** — take the next timestamp if `git ls-tree --name-only origin/main server/prisma/migrations/` shows one at or after `20261012090000`. Create `server/prisma/migrations/20261012090000_role_permissions/migration.sql`:

```sql
-- ADR-0086: the CEO's per-role capability changes. Only differences from the catalog default are stored; the table starts empty, so every role keeps its access.
-- CreateTable
CREATE TABLE "RolePermission" (
    "companyId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "updatedById" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("companyId","roleId","key")
);

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Verify it against Prisma without any database (HEAD still has the old schema, since the schema edit is not committed yet; `<scratch>` is your scratchpad directory):
```
cd server
git show HEAD:server/prisma/schema.prisma > <scratch>/schema-before.prisma
npx prisma migrate diff --from-schema <scratch>/schema-before.prisma --to-schema prisma/schema.prisma --script
```
Expected: exactly the SQL above below its first comment line (checked with Prisma 7.5.0 while drafting). Never run `migrate dev`, `db push`, `db execute` or `migrate deploy`.

**3c.** Create `server/src/common/permissions/effective-permissions.ts`:

```ts
import { ROLE_ID } from '../auth/role-ids';
import {
  EDITABLE_ROLE_IDS,
  PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  StaffRoleId,
  defaultKeysForRoles,
  isPermissionKey,
  permissionDef,
} from './permission-catalog';
import { stabilize } from './permission-deps';

/** One stored `RolePermission` row: the CEO's change to one role's capability. */
export interface RoleOverride {
  readonly roleId: number;
  readonly key: string;
  readonly granted: boolean;
}

/**
 * One role's capabilities: the catalog defaults, then the CEO's changes for
 * that role, then dependency stabilisation (spec §5). A key the catalog no
 * longer knows, or a grant outside `allowedRoles`, is ignored — the page
 * cannot store one, but a row written before a catalog change can exist.
 */
export function keysForRole(
  roleId: StaffRoleId,
  overrides: readonly RoleOverride[],
): Set<PermissionKey> {
  const keys = new Set<string>(defaultKeysForRoles([roleId]));
  for (const change of overrides) {
    if (change.roleId !== roleId || !isPermissionKey(change.key)) continue;
    if (!change.granted) keys.delete(change.key);
    else if (permissionDef(change.key).allowedRoles.includes(roleId)) {
      keys.add(change.key);
    }
  }
  // Only catalog keys went in, and stabilize only removes.
  return stabilize(keys, PERMISSIONS) as Set<PermissionKey>;
}

/**
 * What an account may do (spec §3): the CEO holds every capability; anyone
 * else holds the union of `keysForRole` over the staff roles they hold (each
 * set is already stable, so the union is too); a student or a role-less
 * account holds nothing.
 */
export function effectiveForRoles(
  roleIds: readonly number[],
  overrides: readonly RoleOverride[],
): Set<PermissionKey> {
  if (roleIds.includes(ROLE_ID.CEO)) return new Set(PERMISSION_KEYS);
  const keys = new Set<PermissionKey>();
  for (const roleId of EDITABLE_ROLE_IDS) {
    if (!roleIds.includes(roleId)) continue;
    for (const key of keysForRole(roleId, overrides)) keys.add(key);
  }
  return keys;
}
```

**3d.** Replace the whole of `server/src/common/permissions/permissions.service.ts` (old: the 67-line file whose `forUser` calls `defaultKeysForRoles(roles.map((r) => r.id))`) with:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereUserMayAct } from '../auth/blocked-user';
import { ROLE_ID } from '../auth/role-ids';
import { RoleOverride, effectiveForRoles } from './effective-permissions';
import {
  EDITABLE_ROLE_IDS,
  PermissionKey,
  isPermissionKey,
} from './permission-catalog';

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
 * Capabilities are the catalog defaults of the roles held plus the CEO's
 * changes stored in `RolePermission` (ADR-0086), through `effectiveForRoles`.
 */
@Injectable()
export class PermissionsService {
  // ponytail: per-process cache with a 10 s lifetime; add a Redis version key
  // when several server instances must agree sooner (spec §7.3).
  static readonly CACHE_MS = 10_000;
  private readonly logger = new Logger(PermissionsService.name);
  private readonly cache = new Map<
    number,
    { at: number; access: CallerAccess }
  >();
  /** One load per user at a time: concurrent requests share it. */
  private readonly inflight = new Map<number, Promise<CallerAccess>>();
  /** Bumped by every write, so a load that began before it is not cached. */
  private generation = 0;

  constructor(private readonly prisma: PrismaService) {}

  async forUser(userId: number): Promise<CallerAccess> {
    const now = Date.now();
    const hit = this.cache.get(userId);
    if (hit && now - hit.at < PermissionsService.CACHE_MS) return hit.access;
    const pending = this.inflight.get(userId);
    if (pending) return pending;

    const generation = this.generation;
    const load = this.load(userId)
      .then((access) => {
        if (generation === this.generation) {
          this.cache.set(userId, { at: now, access });
        }
        return access;
      })
      .finally(() => {
        if (this.inflight.get(userId) === load) this.inflight.delete(userId);
      });
    this.inflight.set(userId, load);
    return load;
  }

  async has(userId: number, key: PermissionKey): Promise<boolean> {
    return (await this.forUser(userId)).keys.has(key);
  }

  /**
   * Forget every answer in this process. Called after each committed change
   * of `RolePermission`, so the change takes effect on the next request here;
   * other processes follow within `CACHE_MS`.
   */
  invalidateAll(): void {
    this.generation += 1;
    this.cache.clear();
    this.inflight.clear();
  }

  private async load(userId: number): Promise<CallerAccess> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, ...whereUserMayAct() },
      select: {
        companyId: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    const roles = user?.roles.map((r) => r.role) ?? [];
    if (!user || roles.length === 0) return NO_ACCESS;

    const roleIds = roles.map((r) => r.id);
    const staffRoleIds = EDITABLE_ROLE_IDS.filter((id) => roleIds.includes(id));
    const overrides =
      roleIds.includes(ROLE_ID.CEO) || staffRoleIds.length === 0
        ? []
        : await this.overridesFor(user.companyId, staffRoleIds);
    return {
      roleIds,
      roleNames: roles.map((r) => r.name),
      keys: effectiveForRoles(roleIds, overrides),
    };
  }

  private async overridesFor(
    companyId: number,
    roleIds: number[],
  ): Promise<RoleOverride[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { companyId, roleId: { in: roleIds } },
      select: { roleId: true, key: true, granted: true },
    });
    const unknown = [
      ...new Set(rows.map((r) => r.key).filter((key) => !isPermissionKey(key))),
    ];
    if (unknown.length > 0) {
      this.logger.warn(
        `RolePermission: unknown capability keys ignored: ${unknown.sort().join(', ')}`,
      );
    }
    return rows;
  }
}
```

**3e.** `server/src/common/permissions/testing.ts`. Old:

```ts
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { PermissionKey, defaultKeysForRoles } from './permission-catalog';
import type { CallerAccess, PermissionsService } from './permissions.service';
```

new:

```ts
import { ACCESS_KEY, RouteAccessMeta } from './access.decorators';
import { RoleOverride, effectiveForRoles } from './effective-permissions';
import { PermissionKey } from './permission-catalog';
import type { CallerAccess, PermissionsService } from './permissions.service';
```

Old:

```ts
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

new:

```ts
/**
 * A `PermissionsService` stand-in for unit specs: the caller holds `roleIds`
 * with the catalog defaults plus `opts.overrides` (the CEO's changes). With
 * `opts.userId` set, only that user holds them and any other user holds
 * nothing — so a spec can prove a check reads the right caller. Plain
 * functions, no `jest.fn`: this file is compiled with the application, where
 * Jest's globals do not exist.
 */
export function fakePermissions(
  roleIds: number[],
  opts?: { userId?: number; overrides?: RoleOverride[] },
): PermissionsService {
  const access: CallerAccess = {
    roleIds,
    roleNames: roleIds.map((id) => ROLE_NAME_BY_ID[id]),
    keys: effectiveForRoles(roleIds, opts?.overrides ?? []),
  };
  const nobody: CallerAccess = { roleIds: [], roleNames: [], keys: new Set() };
  const accessOf = (userId: number): CallerAccess =>
    opts?.userId === undefined || userId === opts.userId ? access : nobody;
  return {
    forUser: (userId: number) => Promise.resolve(accessOf(userId)),
    has: (userId: number, key: PermissionKey) =>
      Promise.resolve(accessOf(userId).keys.has(key)),
    invalidateAll: () => undefined,
  } as unknown as PermissionsService;
}
```

The 10 existing callers (`fakePermissions([...])` with one argument, plus `daf-portal.student-card.e2e.spec.ts`'s `.forUser(id)`) compile and behave unchanged.

- [ ] **Step 4: Run the tests to verify they pass** (+ every spec that uses the service or the fake)

Run: `cd server && npx jest src/common/permissions src/common/auth/branch-route-policy.spec.ts src/tasks/tasks.module.di.spec.ts src/comments/comments.service.spec.ts src/salary/teacher-timeline.service.spec.ts src/telegram-groups/telegram-groups.service.spec.ts src/dashboard src/courses/courses.controller.spec.ts src/users/users-phone-route.spec.ts src/daf/daf-portal.student-card.e2e.spec.ts`
Expected: PASS. `permission-routes.spec.ts` is untouched (defaults unchanged).

- [ ] **Step 5: Lint, format, type-check**

```
cd server
npx prettier --write src/common/permissions/effective-permissions.ts src/common/permissions/effective-permissions.spec.ts src/common/permissions/permissions.service.ts src/common/permissions/permissions.service.spec.ts src/common/permissions/testing.ts src/common/permissions/testing.spec.ts
npx eslint src/common/permissions/effective-permissions.ts src/common/permissions/effective-permissions.spec.ts src/common/permissions/permissions.service.ts src/common/permissions/permissions.service.spec.ts src/common/permissions/testing.ts src/common/permissions/testing.spec.ts
npm run typecheck
```
`npm run typecheck` needs the client generated in Step 3a (`npx prisma generate`), or `prisma.rolePermission` does not exist on `PrismaService`.

- [ ] **Step 6: Commit**

From the worktree root:
```
git add server/prisma/schema.prisma server/prisma/migrations/20261012090000_role_permissions/migration.sql server/src/common/permissions/effective-permissions.ts server/src/common/permissions/effective-permissions.spec.ts server/src/common/permissions/permissions.service.ts server/src/common/permissions/permissions.service.spec.ts server/src/common/permissions/testing.ts server/src/common/permissions/testing.spec.ts
git commit -m "feat(permissions): RolePermission table and per-role changes in PermissionsService

Only differences from the catalog default are stored; the table ships
empty, so every role keeps its access. forUser applies the changes through
effectiveForRoles, shares one load per user, and invalidateAll keeps a load
from before a write out of the cache. fakePermissions honours userId.

Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 4: `@CeoOnly()` route marker

**Files:**
- Modify: `server/src/common/permissions/access.decorators.ts` (fifth kind `'ceo'`, `CeoOnly()`)
- Modify: `server/src/common/permissions/permission.guard.ts` (`allows()` case `'ceo'`, doc line)
- Modify: `server/src/common/permissions/route-access.ts` (`accessSummary({ kind: 'ceo' })` → `['CEO']`)
- Modify: `server/scripts/route-inventory.ts` (`CeoOnly` marker → `{ kind: 'ceo' }`)
- Verify only (no change): `server/src/common/permissions/testing.ts` — `routeAccess()` returns the stored `RouteAccessMeta` as is, so `{ kind: 'ceo' }` passes through and `defaultRolesOf()` reaches `accessSummary`. Task 5's controller spec exercises it.
- Test: `server/src/common/permissions/permission.guard.spec.ts`, `server/src/common/permissions/route-access.spec.ts`, `server/src/common/permissions/route-inventory.spec.ts`

**Interfaces:**
- Consumes: `ROLE_ID` (`server/src/common/auth/role-ids.ts`), `ACCESS_KEY`, `CallerAccess`, `PERMISSION_KEYS` (Task 1 keeps the export).
- Produces:
  ```ts
  // access.decorators.ts
  export type RouteAccessMeta =
    | { readonly kind: 'anyUser' } | { readonly kind: 'anyStaff' } | { readonly kind: 'student' }
    | { readonly kind: 'can'; readonly keys: readonly PermissionKey[] }
    | { readonly kind: 'ceo' };
  export const CeoOnly: () => CustomDecorator<string>; // SetMetadata(ACCESS_KEY, { kind: 'ceo' })
  // permission.guard.ts — allows({ kind: 'ceo' }, caller) === caller.roleIds.includes(ROLE_ID.CEO)
  // route-access.ts — accessSummary({ kind: 'ceo' }) → ['CEO']
  // scripts/route-inventory.ts — RouteAccess gains { kind: 'ceo' }; ACCESS_DECORATORS gains 'CeoOnly';
  //   a non-literal argument → "Unsupported @CeoOnly argument in <file>: <text>"
  ```

- [ ] **Step 1: Write the failing tests**

`server/src/common/permissions/permission.guard.spec.ts` — add the import below the existing `import { fakePermissions } from './testing';`:
```ts
import { PERMISSION_KEYS } from './permission-catalog';
```
and append this test inside `describe('PermissionGuard', …)`, right after the last test (`'refuses a non-public route with no signed-in user'`), before the closing `});` of the file:
```ts
  it('admits @CeoOnly() for the CEO alone, never through capabilities', async () => {
    const access: RouteAccessMeta = { kind: 'ceo' };
    const ceo = contextFor({ access }, { id: 9 });
    await expect(guardFor([1]).canActivate(ceo.context)).resolves.toBe(true);

    const director = contextFor({ access }, { id: 10 });
    await expect(guardFor([2]).canActivate(director.context)).rejects.toThrow(
      new ForbiddenException("Sizga bu amalni bajarishga ruxsat yo'q"),
    );

    // Spec §4.2: the page that edits capabilities cannot itself be one, so
    // a Branch Director holding every capability is still refused.
    const everyKey: CallerAccess = {
      roleIds: [2],
      roleNames: ['Branch Director'],
      keys: new Set(PERMISSION_KEYS),
    };
    expect(allows(access, everyKey)).toBe(false);
    expect(
      allows(access, {
        ...everyKey,
        roleIds: [2, 1],
        roleNames: ['Branch Director', 'CEO'],
      }),
    ).toBe(true);
  });
```

`server/src/common/permissions/route-access.spec.ts` — append inside `describe('accessSummary', …)`, after `'lists the student and the five staff roles'`:
```ts
  it('writes a @CeoOnly() route as the CEO alone', () => {
    expect(accessSummary({ kind: 'ceo' })).toEqual(['CEO']);
  });
```

`server/src/common/permissions/route-inventory.spec.ts`:
- In `'refuses an argument handed to a marker that takes none'`, replace
  ```ts
      for (const marker of ['AnyStaff', 'AnyUser', 'StudentOnly']) {
  ```
  with
  ```ts
      for (const marker of ['AnyStaff', 'AnyUser', 'StudentOnly', 'CeoOnly']) {
  ```
- Append after `'still reads the argument-free markers'`, before the final `});`:
  ```ts
  it('reads @CeoOnly() on a handler and on a class', () => {
    const [onHandler] = parse(`
      class XController {
        @Get()
        @CeoOnly()
        list() {}
      }`);
    expect(onHandler.access).toEqual({ kind: 'ceo' });
    expect(onHandler.accessMarkers.handler).toEqual(['CeoOnly']);

    const [onClass] = parse(`
      @CeoOnly()
      class XController {
        @Get()
        list() {}
      }`);
    expect(onClass.access).toEqual({ kind: 'ceo' });
    expect(onClass.accessMarkers.controller).toEqual(['CeoOnly']);
  });
  ```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/permissions/permission.guard.spec.ts src/common/permissions/route-access.spec.ts src/common/permissions/route-inventory.spec.ts`
Expected: FAIL —
- guard: the CEO is refused (`allows()` has no `'ceo'` case and returns `undefined`, so the guard throws 403);
- route-access: `Unknown access kind "ceo"`;
- inventory: `@CeoOnly()` is not a marker yet, so `access` is `{ kind: 'none' }` and `CeoOnly(KEYS.A)` does not throw.

- [ ] **Step 3: Implement**

`server/src/common/permissions/access.decorators.ts` — old:
```ts
export type RouteAccessMeta =
  | { readonly kind: 'anyUser' }
  | { readonly kind: 'anyStaff' }
  | { readonly kind: 'student' }
  | { readonly kind: 'can'; readonly keys: readonly PermissionKey[] };
```
new:
```ts
export type RouteAccessMeta =
  | { readonly kind: 'anyUser' }
  | { readonly kind: 'anyStaff' }
  | { readonly kind: 'student' }
  | { readonly kind: 'can'; readonly keys: readonly PermissionKey[] }
  | { readonly kind: 'ceo' };
```
and append at the end of the file:
```ts

/**
 * The CEO alone, read from the caller's DATABASE roles (spec §4.2). Never a
 * capability and never in the catalog: whoever could be granted the page
 * that edits capabilities could grant themselves every other one. Only the
 * «Ruxsatlar» API uses it (ADR-0086).
 */
export const CeoOnly = () =>
  SetMetadata<string, RouteAccessMeta>(ACCESS_KEY, { kind: 'ceo' });
```

`server/src/common/permissions/permission.guard.ts` — old:
```ts
    case 'can':
      return access.keys.some((key) => caller.keys.has(key));
  }
}
```
new:
```ts
    case 'can':
      return access.keys.some((key) => caller.keys.has(key));
    case 'ceo':
      return caller.roleIds.includes(ROLE_ID.CEO);
  }
}
```
and old:
```ts
 *    `JwtAuthGuard`'s blocked message, then check the route's marker (`@Can`,
 *    `@AnyStaff`, `@AnyUser`, `@StudentOnly`) against the caller's
 *    capabilities.
```
new:
```ts
 *    `JwtAuthGuard`'s blocked message, then check the route's marker (`@Can`,
 *    `@AnyStaff`, `@AnyUser`, `@StudentOnly`, `@CeoOnly`) against the
 *    caller's capabilities and roles.
```

`server/src/common/permissions/route-access.ts` — old:
```ts
    case 'anyStaff':
      return [...STAFF_ROLE_NAMES];
```
new:
```ts
    case 'anyStaff':
      return [...STAFF_ROLE_NAMES];
    case 'ceo':
      return ['CEO'];
```

`server/scripts/route-inventory.ts` — old:
```ts
  | { kind: 'can'; keys: string[] }
  /** No marker at all: PermissionGuard refuses it, and the manifest reports it. */
  | { kind: 'none' };

const ACCESS_DECORATORS = ['AnyUser', 'AnyStaff', 'StudentOnly', 'Can'];
```
new:
```ts
  | { kind: 'can'; keys: string[] }
  /** `@CeoOnly()`: the CEO by database role, never a capability. */
  | { kind: 'ceo' }
  /** No marker at all: PermissionGuard refuses it, and the manifest reports it. */
  | { kind: 'none' };

const ACCESS_DECORATORS = ['AnyUser', 'AnyStaff', 'StudentOnly', 'CeoOnly', 'Can'];
```
and old:
```ts
    case 'StudentOnly':
      return { access: { kind: 'student' }, markers };
    case 'Can':
```
new:
```ts
    case 'StudentOnly':
      return { access: { kind: 'student' }, markers };
    case 'CeoOnly':
      return { access: { kind: 'ceo' }, markers };
    case 'Can':
```
(`stringArgs(dec)` already runs for every marker before the switch, so `@CeoOnly(KEYS.A)` throws `Unsupported @CeoOnly argument in …` with no further code.)

`server/src/common/permissions/testing.ts`: no change. `routeAccess()` returns `Reflect.getMetadata(ACCESS_KEY, …) as RouteAccessMeta`, which now includes `{ kind: 'ceo' }`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/common/permissions src/common/auth/branch-route-policy.spec.ts`
Expected: PASS. No route uses `@CeoOnly()` yet, so `permission-routes.spec.ts` and the snapshot do not change.

- [ ] **Step 5: Lint, format, type-check**

```bash
cd server
npx prettier --write src/common/permissions/access.decorators.ts src/common/permissions/permission.guard.ts src/common/permissions/route-access.ts scripts/route-inventory.ts src/common/permissions/permission.guard.spec.ts src/common/permissions/route-access.spec.ts src/common/permissions/route-inventory.spec.ts
npx eslint src/common/permissions/access.decorators.ts src/common/permissions/permission.guard.ts src/common/permissions/route-access.ts scripts/route-inventory.ts src/common/permissions/permission.guard.spec.ts src/common/permissions/route-access.spec.ts src/common/permissions/route-inventory.spec.ts
npm run typecheck
```
Expected: no errors. Prettier will wrap the longer `ACCESS_DECORATORS` line; keep its output.

- [ ] **Step 6: Commit**

```bash
cd server
git add src/common/permissions/access.decorators.ts src/common/permissions/permission.guard.ts src/common/permissions/route-access.ts scripts/route-inventory.ts src/common/permissions/permission.guard.spec.ts src/common/permissions/route-access.spec.ts src/common/permissions/route-inventory.spec.ts
git commit -m "$(cat <<'EOF'
feat(permissions): @CeoOnly() route marker

A fifth access kind the guard, the route inventory and the access summary
all understand. It admits a caller whose database roles include CEO and is
never a capability, so the page that edits capabilities cannot be granted
(spec §4.2).

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: CEO API — overview, save, reset, history

**Files:**
- Create: `server/src/common/permissions/role-permissions.types.ts` (API shapes, `ROLE_LABELS`)
- Create: `server/src/common/permissions/dto/update-role-permissions.dto.ts` (`UpdateRolePermissionsDto`, `RolePermissionChangeDto`)
- Create: `server/src/common/permissions/role-permissions.service.ts` (overview, update, reset, history)
- Create: `server/src/common/permissions/role-permissions.controller.ts` (four `@CeoOnly()` routes)
- Modify: `server/src/common/permissions/permissions.module.ts` (register controller + service)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (4 rows, `["CEO"]`)
- Modify: `server/src/common/auth/branch-route-policy.ts` (one COMPANY_WIDE block; `UNREVIEWED_BUDGET` stays 7)
- Test: `server/src/common/permissions/role-permissions.service.spec.ts`, `server/src/common/permissions/role-permissions.controller.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `PERMISSIONS`, `PERMISSION_KEYS`, `PERMISSION_SECTIONS`, `EDITABLE_ROLE_IDS`, `LOCK`, `permissionDef(key)`, `defaultKeysForRoles`, types `PermissionKey`, `PermissionSection`, `StaffRoleId` — all from `./permission-catalog`. `permissionDef(key).allowedRoles`, `.lockReasons[roleId]`.
  - Task 3: `keysForRole(roleId: StaffRoleId, overrides: readonly RoleOverride[]): Set<PermissionKey>` from `./effective-permissions`; `PermissionsService.invalidateAll(): void`; the generated Prisma delegate `rolePermission` (composite id `companyId_roleId_key`).
  - Task 4: `CeoOnly()` from `./access.decorators`.
  - Existing: `EntityHistoryService.recordUpdate({ entityType, entityId, oldValues, newValues, changedById, companyId, tx })` (`../entity-history`), `rethrowAsConflict` (`../transaction-conflict`), `HistoryQueryDto` (`../entity-history/dto/history-query.dto`), `CurrentUser` (`../decorators/current-user.decorator`), `ROLE_ID` (`../auth/role-ids`).
- Produces (Task 8 mirrors the types; Task 9 builds on them):
  ```ts
  // role-permissions.types.ts
  export interface CatalogEntry { key: PermissionKey; section: PermissionSection; label: string; requires: PermissionKey[];
    defaultRoles: StaffRoleId[]; allowedRoles: StaffRoleId[]; lockReasons: Partial<Record<StaffRoleId, string>>;
    danger: 'money' | 'irreversible' | null }
  export interface PermissionsOverview { sections: { key: PermissionSection; label: string }[];
    roles: { id: StaffRoleId; label: string }[]; catalog: CatalogEntry[]; granted: Record<StaffRoleId, PermissionKey[]> }
  export interface RoleKeys { roleId: StaffRoleId; granted: PermissionKey[] }
  export interface PermissionHistoryItem { id: string; createdAt: string; roleId: number;
    changedBy: { id: number; firstName: string; lastName: string } | null; changes: { key: string; granted: boolean }[] }
  export interface PermissionHistoryPage { data: PermissionHistoryItem[]; total: number; page: number; pageSize: number }
  export const ROLE_LABELS: Record<StaffRoleId, string>;
  // role-permissions.service.ts
  export const ROLE_PERMISSION_HISTORY_TYPE = 'RolePermission';
  class RolePermissionsService {
    overview(companyId: number): Promise<PermissionsOverview>;
    updateRole(companyId: number, roleId: number, changes: { key: PermissionKey; granted: boolean }[], changedById: number): Promise<RoleKeys>;
    resetRole(companyId: number, roleId: number, changedById: number): Promise<RoleKeys>;
    history(companyId: number, page: number, pageSize: number): Promise<PermissionHistoryPage>;
  }
  // HTTP (all @CeoOnly()):
  // GET /permissions → PermissionsOverview
  // PUT /permissions/roles/:roleId  body { changes: { key, granted }[] } → RoleKeys
  // POST /permissions/roles/:roleId/reset → RoleKeys
  // GET /permissions/history?page&pageSize → PermissionHistoryPage
  ```
- `granted` arrays are sorted alphabetically (`.sort()`), the same order as `GET /permissions/me`.

- [ ] **Step 1: Write the failing tests**

Create `server/src/common/permissions/role-permissions.service.spec.ts`:
```ts
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  LOCK,
  PERMISSIONS,
  PERMISSION_KEYS,
  PermissionKey,
  defaultKeysForRoles,
} from './permission-catalog';
import { RolePermissionsService } from './role-permissions.service';

const COMPANY = 1001;
const CEO_USER = 10001;
const label = (key: PermissionKey) => PERMISSIONS[key].label;

type Row = { roleId: number; key: string; granted: boolean };

function setup(rows: Row[] = []) {
  const tx = {
    rolePermission: {
      findMany: jest
        .fn()
        .mockImplementation(({ where }: { where: { roleId: number } }) =>
          Promise.resolve(rows.filter((r) => r.roleId === where.roleId)),
        ),
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const prisma = {
    $transaction: jest
      .fn()
      .mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx)),
    role: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 5 }, { id: 2 }, { id: 4 }, { id: 3 }]),
    },
    rolePermission: { findMany: jest.fn().mockResolvedValue(rows) },
    entityHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  const permissions = { invalidateAll: jest.fn() };
  const service = new RolePermissionsService(
    prisma as never,
    history as never,
    permissions as never,
  );
  return { service, prisma, tx, history, permissions };
}

/** Nothing was stored, journaled or uncached. */
function expectNothingWritten(s: ReturnType<typeof setup>) {
  expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
  expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
  expect(s.history.recordUpdate).not.toHaveBeenCalled();
  expect(s.permissions.invalidateAll).not.toHaveBeenCalled();
}

describe('RolePermissionsService.updateRole — refusals (spec §12)', () => {
  it.each([1, 6, 99])(
    'refuses role %i before reading anything',
    async (roleId) => {
      const s = setup();
      await expect(
        s.service.updateRole(
          COMPANY,
          roleId,
          [{ key: 'cash.manage', granted: true }],
          CEO_USER,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          "Bu rolning ruxsatlarini o'zgartirib bo'lmaydi",
        ),
      );
      expect(s.prisma.$transaction).not.toHaveBeenCalled();
      expectNothingWritten(s);
    },
  );

  it('refuses a key sent twice', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [
          { key: 'cash.manage', granted: true },
          { key: 'cash.manage', granted: false },
        ],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException('Bir imkoniyat ikki marta yuborildi'),
    );
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expectNothingWritten(s);
  });

  it('refuses a grant outside allowedRoles, naming the lock reason', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        2,
        [{ key: 'salary.close', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `${label('salary.close')}: Filial direktori uchun yoqib bo'lmaydi — ${LOCK.COMPANY}`,
      ),
    );
    await expect(
      s.service.updateRole(
        COMPANY,
        4,
        [{ key: 'students.list', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `${label('students.list')}: O'qituvchi uchun yoqib bo'lmaydi — ${LOCK.OWN_GROUPS}`,
      ),
    );
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
    expectNothingWritten(s);
  });

  it('refuses a grant whose requirement stays off', async () => {
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [{ key: 'expenses.manage', granted: true }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `«${label('expenses.manage')}» uchun «${label('expenses.view')}» ham yoqilgan bo'lishi kerak`,
      ),
    );
    expectNothingWritten(s);
  });

  it('refuses a revoke that leaves a dependent on', async () => {
    // The Branch Director holds both by default; turning the view off alone
    // would leave «Xarajat kiritish» on without the page it lives on.
    const s = setup();
    await expect(
      s.service.updateRole(
        COMPANY,
        2,
        [{ key: 'expenses.view', granted: false }],
        CEO_USER,
      ),
    ).rejects.toThrow(
      new BadRequestException(
        `«${label('expenses.manage')}» uchun «${label('expenses.view')}» ham yoqilgan bo'lishi kerak`,
      ),
    );
    expectNothingWritten(s);
  });

  it('turns a lost race into 409 and keeps the cache', async () => {
    const s = setup();
    s.prisma.$transaction.mockRejectedValueOnce(
      Object.assign(new Error('write conflict'), { code: 'P2034' }),
    );
    await expect(
      s.service.updateRole(
        COMPANY,
        3,
        [{ key: 'cash.manage', granted: true }],
        CEO_USER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(s.permissions.invalidateAll).not.toHaveBeenCalled();
  });
});

describe('RolePermissionsService.updateRole — writes', () => {
  it('stores a grant with its requirement, journals both, then clears the cache', async () => {
    const s = setup();

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [
        { key: 'expenses.view', granted: true },
        { key: 'expenses.manage', granted: true },
      ],
      CEO_USER,
    );

    expect(s.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(s.tx.rolePermission.upsert).toHaveBeenCalledTimes(2);
    expect(s.tx.rolePermission.upsert).toHaveBeenCalledWith({
      where: {
        companyId_roleId_key: {
          companyId: COMPANY,
          roleId: 3,
          key: 'expenses.manage',
        },
      },
      create: {
        companyId: COMPANY,
        roleId: 3,
        key: 'expenses.manage',
        granted: true,
        updatedById: CEO_USER,
      },
      update: { granted: true, updatedById: CEO_USER },
    });
    expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'RolePermission',
      entityId: 3,
      oldValues: { 'expenses.view': false, 'expenses.manage': false },
      newValues: { 'expenses.view': true, 'expenses.manage': true },
      changedById: CEO_USER,
      companyId: COMPANY,
      tx: s.tx,
    });
    expect(result).toEqual({
      roleId: 3,
      granted: [
        ...defaultKeysForRoles([3]),
        'expenses.manage',
        'expenses.view',
      ].sort(),
    });
    expect(s.permissions.invalidateAll).toHaveBeenCalledTimes(1);
    expect(
      s.permissions.invalidateAll.mock.invocationCallOrder[0],
    ).toBeGreaterThan(s.history.recordUpdate.mock.invocationCallOrder[0]);
  });

  it('stores a revoked default as granted: false', async () => {
    const s = setup();

    await s.service.updateRole(
      COMPANY,
      2,
      [{ key: 'students.sms', granted: false }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          roleId: 2,
          key: 'students.sms',
          granted: false,
        }),
      }),
    );
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { 'students.sms': true },
        newValues: { 'students.sms': false },
      }),
    );
  });

  it('deletes the row when a key goes back to its default', async () => {
    const s = setup([{ roleId: 3, key: 'cash.manage', granted: true }]);

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [{ key: 'cash.manage', granted: false }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.tx.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY, roleId: 3, key: { in: ['cash.manage'] } },
    });
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { 'cash.manage': true },
        newValues: { 'cash.manage': false },
      }),
    );
    expect(result.granted).toEqual([...defaultKeysForRoles([3])].sort());
  });

  it('writes no row and no history for a save that changes nothing', async () => {
    const s = setup();

    const result = await s.service.updateRole(
      COMPANY,
      3,
      [{ key: 'students.list', granted: true }],
      CEO_USER,
    );

    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.tx.rolePermission.deleteMany).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).not.toHaveBeenCalled();
    expect(result.granted).toEqual([...defaultKeysForRoles([3])].sort());
  });
});

describe('RolePermissionsService.resetRole', () => {
  it('drops every stored difference of the role and journals what changed', async () => {
    const s = setup([
      { roleId: 3, key: 'cash.manage', granted: true },
      { roleId: 3, key: 'students.sms', granted: false },
      { roleId: 2, key: 'students.sms', granted: false },
    ]);

    const result = await s.service.resetRole(COMPANY, 3, CEO_USER);

    const deleted = s.tx.rolePermission.deleteMany.mock.calls[0][0];
    expect(deleted.where).toMatchObject({ companyId: COMPANY, roleId: 3 });
    expect([...deleted.where.key.in].sort()).toEqual([
      'cash.manage',
      'students.sms',
    ]);
    expect(s.tx.rolePermission.upsert).not.toHaveBeenCalled();
    expect(s.history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'RolePermission',
        entityId: 3,
        oldValues: { 'students.sms': false, 'cash.manage': true },
        newValues: { 'students.sms': true, 'cash.manage': false },
      }),
    );
    expect(result).toEqual({
      roleId: 3,
      granted: [...defaultKeysForRoles([3])].sort(),
    });
    expect(s.permissions.invalidateAll).toHaveBeenCalledTimes(1);
  });

  it('journals nothing for a role already at its default', async () => {
    const s = setup();
    await s.service.resetRole(COMPANY, 5, CEO_USER);
    expect(s.history.recordUpdate).not.toHaveBeenCalled();
  });

  it('refuses the CEO and the student role', async () => {
    const s = setup();
    for (const roleId of [1, 6]) {
      await expect(
        s.service.resetRole(COMPANY, roleId, CEO_USER),
      ).rejects.toThrow("Bu rolning ruxsatlarini o'zgartirib bo'lmaydi");
    }
    expect(s.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('RolePermissionsService.overview', () => {
  it('returns the four editable roles in page order, the catalog and the effective keys', async () => {
    const s = setup([
      { roleId: 3, key: 'cash.manage', granted: true },
      { roleId: 2, key: 'students.sms', granted: false },
    ]);

    const o = await s.service.overview(COMPANY);

    expect(s.prisma.rolePermission.findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY },
      select: { roleId: true, key: true, granted: true },
    });
    expect(o.roles).toEqual([
      { id: 2, label: 'Filial direktori' },
      { id: 3, label: 'Administrator' },
      { id: 5, label: 'Kassir' },
      { id: 4, label: "O'qituvchi" },
    ]);
    expect(o.sections).toHaveLength(14);
    expect(o.catalog.map((c) => c.key)).toEqual(PERMISSION_KEYS);
    expect(o.catalog.find((c) => c.key === 'salary.close')).toEqual({
      key: 'salary.close',
      section: 'salary',
      label: label('salary.close'),
      requires: ['salary.view'],
      defaultRoles: [],
      allowedRoles: [],
      lockReasons: {
        2: LOCK.COMPANY,
        3: LOCK.COMPANY,
        5: LOCK.COMPANY,
        4: LOCK.COMPANY,
      },
      danger: 'money',
    });
    expect(o.catalog.find((c) => c.key === 'students.list')?.danger).toBe(
      null,
    );
    expect(o.granted[3]).toContain('cash.manage');
    expect(o.granted[2]).not.toContain('students.sms');
    expect(o.granted[4]).toEqual(['attendance.mark', 'groups.view']);
    expect(o.granted[5]).toEqual([...defaultKeysForRoles([5])].sort());
  });
});

describe('RolePermissionsService.history', () => {
  it('pages the role-permission rows, newest first, changes in catalog order', async () => {
    const s = setup();
    s.prisma.entityHistory.findMany.mockResolvedValue([
      {
        id: 'h1',
        entityId: '3',
        createdAt: new Date('2026-10-12T05:00:00.000Z'),
        newValues: {
          'cash.manage': true,
          'removed.key': false,
          'expenses.view': true,
        },
        changedBy: { id: CEO_USER, firstName: 'Bosh', lastName: 'Rahbar' },
      },
    ]);
    s.prisma.entityHistory.count.mockResolvedValue(21);

    const page = await s.service.history(COMPANY, 2, 20);

    expect(s.prisma.entityHistory.findMany).toHaveBeenCalledWith({
      where: { entityType: 'RolePermission', companyId: COMPANY },
      orderBy: { createdAt: 'desc' },
      skip: 20,
      take: 20,
      select: {
        id: true,
        entityId: true,
        createdAt: true,
        newValues: true,
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    expect(page).toEqual({
      data: [
        {
          id: 'h1',
          createdAt: '2026-10-12T05:00:00.000Z',
          roleId: 3,
          changedBy: { id: CEO_USER, firstName: 'Bosh', lastName: 'Rahbar' },
          changes: [
            { key: 'expenses.view', granted: true },
            { key: 'cash.manage', granted: true },
            { key: 'removed.key', granted: false },
          ],
        },
      ],
      total: 21,
      page: 2,
      pageSize: 20,
    });
  });
});
```

Create `server/src/common/permissions/role-permissions.controller.spec.ts`:
```ts
import { plainToInstance } from 'class-transformer';
import { ValidationError, validate } from 'class-validator';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolePermissionsController } from './role-permissions.controller';
import { defaultRolesOf, routeAccess } from './testing';

describe('RolePermissionsController', () => {
  const service = {
    overview: jest.fn().mockResolvedValue({}),
    updateRole: jest.fn().mockResolvedValue({ roleId: 3, granted: [] }),
    resetRole: jest.fn().mockResolvedValue({ roleId: 3, granted: [] }),
    history: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  };
  const controller = new RolePermissionsController(service as never);

  it.each(['overview', 'update', 'reset', 'history'] as const)(
    '%s is CEO-only, never a capability (spec §4.2)',
    (name) => {
      expect(routeAccess(RolePermissionsController, name)).toEqual({
        kind: 'ceo',
      });
      expect(defaultRolesOf(RolePermissionsController, name)).toEqual(['CEO']);
    },
  );

  it('passes the company, the role and the caller to the service', async () => {
    await controller.overview(1001);
    expect(service.overview).toHaveBeenCalledWith(1001);

    const changes = [{ key: 'cash.manage' as const, granted: true }];
    await controller.update(3, { changes }, 10001, 1001);
    expect(service.updateRole).toHaveBeenCalledWith(1001, 3, changes, 10001);

    await controller.reset(3, 10001, 1001);
    expect(service.resetRole).toHaveBeenCalledWith(1001, 3, 10001);

    await controller.history({ page: 2, pageSize: 20 }, 1001);
    expect(service.history).toHaveBeenCalledWith(1001, 2, 20);
  });
});

describe('UpdateRolePermissionsDto', () => {
  const messages = (errors: ValidationError[]): string[] =>
    errors.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...messages(e.children ?? []),
    ]);
  const check = async (body: unknown) =>
    messages(await validate(plainToInstance(UpdateRolePermissionsDto, body)));

  it('accepts catalog keys with a boolean', async () => {
    await expect(
      check({ changes: [{ key: 'cash.manage', granted: false }] }),
    ).resolves.toEqual([]);
  });

  it('refuses a key the catalog does not know, in Uzbek', async () => {
    await expect(
      check({ changes: [{ key: 'no.such', granted: true }] }),
    ).resolves.toEqual(["Noma'lum imkoniyat"]);
  });

  it('refuses an empty list and a non-boolean state', async () => {
    await expect(check({ changes: [] })).resolves.toEqual([
      "Hech qanday o'zgarish yuborilmadi",
    ]);
    await expect(
      check({ changes: [{ key: 'cash.manage', granted: 'yes' }] }),
    ).resolves.toEqual(["Imkoniyat holati noto'g'ri"]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/common/permissions/role-permissions`
Expected: FAIL — `Cannot find module './role-permissions.service'` (and `./role-permissions.controller`, `./dto/update-role-permissions.dto`).

- [ ] **Step 3: Implement**

Create `server/src/common/permissions/role-permissions.types.ts`:
```ts
import { ROLE_ID } from '../auth/role-ids';
import type {
  PermissionKey,
  PermissionSection,
  StaffRoleId,
} from './permission-catalog';

/**
 * The shapes of the «Ruxsatlar» page API (spec §7.7, ADR-0086). The client
 * mirrors them in `client/src/components/settings/permissions/permissions-types.ts`.
 */
export interface CatalogEntry {
  key: PermissionKey;
  section: PermissionSection;
  label: string;
  requires: PermissionKey[];
  defaultRoles: StaffRoleId[];
  allowedRoles: StaffRoleId[];
  /** One reason per editable role outside `allowedRoles`; the page shows it on the lock. */
  lockReasons: Partial<Record<StaffRoleId, string>>;
  danger: 'money' | 'irreversible' | null;
}

export interface PermissionsOverview {
  sections: { key: PermissionSection; label: string }[];
  /** The `Role` rows with an id in `EDITABLE_ROLE_IDS`, in that (column) order. */
  roles: { id: StaffRoleId; label: string }[];
  /** `PERMISSION_KEYS` order. */
  catalog: CatalogEntry[];
  /** What each role holds now: defaults, then this company's overrides, stabilised. */
  granted: Record<StaffRoleId, PermissionKey[]>;
}

export interface RoleKeys {
  roleId: StaffRoleId;
  granted: PermissionKey[];
}

export interface PermissionHistoryItem {
  id: string;
  createdAt: string;
  roleId: number;
  changedBy: { id: number; firstName: string; lastName: string } | null;
  /** Every key whose effective state changed in that save, catalog order. */
  changes: { key: string; granted: boolean }[];
}

export interface PermissionHistoryPage {
  data: PermissionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** The column headers and the role names in errors (Uzbek, no English). */
export const ROLE_LABELS: Record<StaffRoleId, string> = {
  [ROLE_ID.BRANCH_DIRECTOR]: 'Filial direktori',
  [ROLE_ID.ADMINISTRATOR]: 'Administrator',
  [ROLE_ID.CASHIER]: 'Kassir',
  [ROLE_ID.TEACHER]: "O'qituvchi",
};
```

Create `server/src/common/permissions/dto/update-role-permissions.dto.ts`:
```ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { PERMISSION_KEYS, type PermissionKey } from '../permission-catalog';

export class RolePermissionChangeDto {
  @IsIn(PERMISSION_KEYS, { message: "Noma'lum imkoniyat" })
  key: PermissionKey;

  @IsBoolean({ message: "Imkoniyat holati noto'g'ri" })
  granted: boolean;
}

/** `PUT /permissions/roles/:roleId`: one toggle plus the dependencies it brought. */
export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Hech qanday o'zgarish yuborilmadi" })
  @ArrayMaxSize(200, { message: "O'zgarishlar juda ko'p" })
  @ValidateNested({ each: true })
  @Type(() => RolePermissionChangeDto)
  changes: RolePermissionChangeDto[];
}
```

Create `server/src/common/permissions/role-permissions.service.ts`:
```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EntityHistoryService } from '../entity-history';
import { rethrowAsConflict } from '../transaction-conflict';
import { RoleOverride, keysForRole } from './effective-permissions';
import {
  EDITABLE_ROLE_IDS,
  PERMISSION_KEYS,
  PERMISSION_SECTIONS,
  PermissionKey,
  StaffRoleId,
  permissionDef,
} from './permission-catalog';
import { PermissionsService } from './permissions.service';
import {
  CatalogEntry,
  PermissionHistoryPage,
  PermissionsOverview,
  ROLE_LABELS,
  RoleKeys,
} from './role-permissions.types';

/** `EntityHistory.entityType` of a save on the page; `entityId` is the role id. */
export const ROLE_PERMISSION_HISTORY_TYPE = 'RolePermission';

const NOT_EDITABLE = "Bu rolning ruxsatlarini o'zgartirib bo'lmaydi";
const DUPLICATE_KEY = 'Bir imkoniyat ikki marta yuborildi';

const CATALOG_ORDER = new Map<string, number>(
  PERMISSION_KEYS.map((key, index) => [key, index]),
);

function assertEditable(roleId: number): asserts roleId is StaffRoleId {
  if (!(EDITABLE_ROLE_IDS as readonly number[]).includes(roleId)) {
    throw new BadRequestException(NOT_EDITABLE);
  }
}

/**
 * Refuses a set in which an «on» key needs one that is off. Equivalent to
 * `stabilize(keys) ≠ keys` (Task 2), but names the pair for the message.
 */
function assertRequirementsMet(keys: ReadonlySet<PermissionKey>): void {
  for (const key of PERMISSION_KEYS) {
    if (!keys.has(key)) continue;
    const missing = permissionDef(key).requires.find(
      (required) => !keys.has(required as PermissionKey),
    );
    if (missing) {
      throw new BadRequestException(
        `«${permissionDef(key).label}» uchun «${permissionDef(missing as PermissionKey).label}» ham yoqilgan bo'lishi kerak`,
      );
    }
  }
}

function catalogEntry(key: PermissionKey): CatalogEntry {
  const def = permissionDef(key);
  return {
    key,
    section: def.section,
    label: def.label,
    requires: [...def.requires] as PermissionKey[],
    defaultRoles: [...def.defaultRoles],
    allowedRoles: [...def.allowedRoles],
    lockReasons: { ...def.lockReasons },
    danger: def.danger ?? null,
  };
}

function changesOf(values: Prisma.JsonValue): { key: string; granted: boolean }[] {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    return [];
  }
  return Object.entries(values)
    .map(([key, granted]) => ({ key, granted: granted === true }))
    .sort(
      (a, b) =>
        (CATALOG_ORDER.get(a.key) ?? Infinity) -
          (CATALOG_ORDER.get(b.key) ?? Infinity) || a.key.localeCompare(b.key),
    );
}

/**
 * The «Ruxsatlar» page (spec §7.7, ADR-0086). Only the CEO's DIFFERENCES from
 * the catalog default are stored: a row equal to the default is deleted, so
 * a later change of `defaultRoles` reaches every company that never touched
 * that key. Each save runs in one Serializable transaction with one
 * `EntityHistory` row listing every key whose effective state changed, and
 * clears this process's capability cache after the commit (other processes
 * follow within `PermissionsService.CACHE_MS`).
 */
@Injectable()
export class RolePermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: EntityHistoryService,
    private readonly permissions: PermissionsService,
  ) {}

  async overview(companyId: number): Promise<PermissionsOverview> {
    const [roles, rows] = await Promise.all([
      this.prisma.role.findMany({
        where: { id: { in: [...EDITABLE_ROLE_IDS] } },
        select: { id: true },
      }),
      this.prisma.rolePermission.findMany({
        where: { companyId },
        select: { roleId: true, key: true, granted: true },
      }),
    ]);
    const seeded = new Set(roles.map((r) => r.id));
    const granted = {} as Record<StaffRoleId, PermissionKey[]>;
    for (const roleId of EDITABLE_ROLE_IDS) {
      granted[roleId] = [
        ...keysForRole(
          roleId,
          rows.filter((r) => r.roleId === roleId),
        ),
      ].sort();
    }
    return {
      sections: PERMISSION_SECTIONS.map(({ key, label }) => ({ key, label })),
      roles: EDITABLE_ROLE_IDS.filter((id) => seeded.has(id)).map((id) => ({
        id,
        label: ROLE_LABELS[id],
      })),
      catalog: PERMISSION_KEYS.map(catalogEntry),
      granted,
    };
  }

  /**
   * `changes` is the toggle plus every dependency the page brought with it
   * (`planToggle`). Refused before the transaction: a role the page does not
   * edit, a key sent twice, a grant outside `allowedRoles`. Refused inside
   * it, against the stored rows: a result with an unmet requirement.
   */
  async updateRole(
    companyId: number,
    roleId: number,
    changes: { key: PermissionKey; granted: boolean }[],
    changedById: number,
  ): Promise<RoleKeys> {
    assertEditable(roleId);
    const seen = new Set<string>();
    for (const { key, granted } of changes) {
      if (seen.has(key)) throw new BadRequestException(DUPLICATE_KEY);
      seen.add(key);
      const def = permissionDef(key);
      if (granted && !def.allowedRoles.includes(roleId)) {
        throw new BadRequestException(
          `${def.label}: ${ROLE_LABELS[roleId]} uchun yoqib bo'lmaydi — ${def.lockReasons[roleId]}`,
        );
      }
    }
    return this.write(companyId, roleId, changedById, (before) => {
      const next = new Set(before);
      for (const { key, granted } of changes) {
        if (granted) next.add(key);
        else next.delete(key);
      }
      assertRequirementsMet(next);
      return next;
    });
  }

  /** «Boshlang'ich holatga qaytarish»: the role's catalog defaults again. */
  async resetRole(
    companyId: number,
    roleId: number,
    changedById: number,
  ): Promise<RoleKeys> {
    assertEditable(roleId);
    const defaults = keysForRole(roleId, []);
    return this.write(companyId, roleId, changedById, () => defaults);
  }

  async history(
    companyId: number,
    page: number,
    pageSize: number,
  ): Promise<PermissionHistoryPage> {
    const where = { entityType: ROLE_PERMISSION_HISTORY_TYPE, companyId };
    const [rows, total] = await Promise.all([
      this.prisma.entityHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          entityId: true,
          createdAt: true,
          newValues: true,
          changedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.entityHistory.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        roleId: Number(row.entityId),
        changedBy: row.changedBy,
        changes: changesOf(row.newValues),
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * One save: read the role's rows, let `plan` decide the new effective set,
   * then store only what differs from the default. Rows of keys the catalog
   * no longer knows are left alone (spec §7.2: ignored, not destroyed).
   */
  private async write(
    companyId: number,
    roleId: StaffRoleId,
    changedById: number,
    plan: (before: ReadonlySet<PermissionKey>) => Set<PermissionKey>,
  ): Promise<RoleKeys> {
    const next = await this.prisma
      .$transaction(
        async (tx) => {
          const rows: RoleOverride[] = await tx.rolePermission.findMany({
            where: { companyId, roleId },
            select: { roleId: true, key: true, granted: true },
          });
          const before = keysForRole(roleId, rows);
          const after = plan(before);
          const stored = new Map(rows.map((r) => [r.key, r.granted]));
          const toDelete: PermissionKey[] = [];

          for (const key of PERMISSION_KEYS) {
            const want = after.has(key);
            const current = stored.get(key);
            if (want === permissionDef(key).defaultRoles.includes(roleId)) {
              if (current !== undefined) toDelete.push(key);
            } else if (current !== want) {
              await tx.rolePermission.upsert({
                where: { companyId_roleId_key: { companyId, roleId, key } },
                create: {
                  companyId,
                  roleId,
                  key,
                  granted: want,
                  updatedById: changedById,
                },
                update: { granted: want, updatedById: changedById },
              });
            }
          }
          if (toDelete.length > 0) {
            await tx.rolePermission.deleteMany({
              where: { companyId, roleId, key: { in: toDelete } },
            });
          }

          const changed = PERMISSION_KEYS.filter(
            (key) => before.has(key) !== after.has(key),
          );
          if (changed.length > 0) {
            await this.history.recordUpdate({
              entityType: ROLE_PERMISSION_HISTORY_TYPE,
              entityId: roleId,
              oldValues: Object.fromEntries(
                changed.map((key) => [key, before.has(key)]),
              ),
              newValues: Object.fromEntries(
                changed.map((key) => [key, after.has(key)]),
              ),
              changedById,
              companyId,
              tx,
            });
          }
          return after;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      // A second CEO tab saving the same role at once: 409, never a silent
      // retry on top of a state the CEO did not see.
      .catch((err: unknown) => rethrowAsConflict(err, { duplicate: true }));

    this.permissions.invalidateAll();
    return { roleId, granted: [...next].sort() };
  }
}
```

Create `server/src/common/permissions/role-permissions.controller.ts`:
```ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../decorators/current-user.decorator';
import { HistoryQueryDto } from '../entity-history/dto/history-query.dto';
import { CeoOnly } from './access.decorators';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolePermissionsService } from './role-permissions.service';

/**
 * The «Ruxsatlar» page (spec §7.7, ADR-0086). CEO-only by database role
 * (`@CeoOnly()`), never a capability: whoever could open it could grant
 * themselves everything. `GET /permissions/me` stays in `PermissionsController`.
 */
@Controller('permissions')
export class RolePermissionsController {
  constructor(private readonly rolePermissions: RolePermissionsService) {}

  @Get()
  @CeoOnly()
  overview(@CurrentUser('companyId') companyId: number) {
    return this.rolePermissions.overview(companyId);
  }

  @Get('history')
  @CeoOnly()
  history(
    @Query() query: HistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.history(
      companyId,
      query.page ?? 1,
      query.pageSize ?? 20,
    );
  }

  @Put('roles/:roleId')
  @CeoOnly()
  update(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.updateRole(
      companyId,
      roleId,
      dto.changes,
      userId,
    );
  }

  @Post('roles/:roleId/reset')
  @CeoOnly()
  reset(
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.rolePermissions.resetRole(companyId, roleId, userId);
  }
}
```

`server/src/common/permissions/permissions.module.ts` — old:
```ts
import { Global, Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

/** Global: services anywhere may ask `PermissionsService.has(...)`. */
@Global()
@Module({
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
```
new:
```ts
import { Global, Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { RolePermissionsController } from './role-permissions.controller';
import { RolePermissionsService } from './role-permissions.service';

/**
 * Global: services anywhere may ask `PermissionsService.has(...)`.
 * `RolePermissionsService` uses `EntityHistoryService`, which is global too.
 */
@Global()
@Module({
  controllers: [PermissionsController, RolePermissionsController],
  providers: [PermissionsService, RolePermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
```

`server/src/common/permissions/route-access.snapshot.json` — four hand-added rows (do not regenerate the file; `scripts/route-access-snapshot.ts` refuses to overwrite it). Keep the file's key order (`localeCompare`):
1. Old:
   ```json
     "GET /permissions/me": "ANY",
   ```
   new:
   ```json
     "GET /permissions": [
       "CEO"
     ],
     "GET /permissions/history": [
       "CEO"
     ],
     "GET /permissions/me": "ANY",
   ```
2. Old:
   ```json
     "POST /payments/attach-external": [
       "Administrator",
       "Branch Director",
       "CEO",
       "Cashier"
     ],
   ```
   new (append one row after it):
   ```json
     "POST /payments/attach-external": [
       "Administrator",
       "Branch Director",
       "CEO",
       "Cashier"
     ],
     "POST /permissions/roles/:roleId/reset": [
       "CEO"
     ],
   ```
3. Old:
   ```json
     "PUT /lesson-teacher-overrides/:groupId/:date": [
       "Administrator",
       "Branch Director",
       "CEO"
     ],
   ```
   new:
   ```json
     "PUT /lesson-teacher-overrides/:groupId/:date": [
       "Administrator",
       "Branch Director",
       "CEO"
     ],
     "PUT /permissions/roles/:roleId": [
       "CEO"
     ],
   ```
`intentional-access-changes.ts` is not edited: these are new routes, not changed ones.

`server/src/common/auth/branch-route-policy.ts` — old:
```ts
  {
    policy: 'SELF',
    reason:
      "The caller's own capability list, read through " +
      "`PermissionsService.forUser(@CurrentUser('id'))`. No branch question.",
    routes: ['GET /permissions/me'],
  },
```
new:
```ts
  {
    policy: 'SELF',
    reason:
      "The caller's own capability list, read through " +
      "`PermissionsService.forUser(@CurrentUser('id'))`. No branch question.",
    routes: ['GET /permissions/me'],
  },
  {
    policy: 'COMPANY_WIDE',
    reason:
      "The «Ruxsatlar» page (ADR-0086): a role's capability settings belong to " +
      'the whole company — `RolePermission` has no branch, and one row turns a ' +
      'key on or off for every holder of that role in every branch — and so ' +
      'does their change history. CEO-only through `@CeoOnly()`, a database ' +
      'role check that is never a capability (spec §4.2).',
    routes: [
      'GET /permissions',
      'GET /permissions/history',
      'POST /permissions/roles/:roleId/reset',
      'PUT /permissions/roles/:roleId',
    ],
  },
```
`UNREVIEWED_BUDGET` stays `7`.

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd server
npx jest src/common/permissions src/common/auth/branch-route-policy.spec.ts
```
Expected: PASS, including `permission-routes.spec.ts` (the four new rows equal `['CEO']`; every other row unchanged) and `branch-route-policy.spec.ts` (every route classified once; budget 7).

- [ ] **Step 5: Lint, format, type-check**

```bash
cd server
npx prettier --write src/common/permissions/role-permissions.types.ts src/common/permissions/dto/update-role-permissions.dto.ts src/common/permissions/role-permissions.service.ts src/common/permissions/role-permissions.controller.ts src/common/permissions/permissions.module.ts src/common/auth/branch-route-policy.ts src/common/permissions/role-permissions.service.spec.ts src/common/permissions/role-permissions.controller.spec.ts
npx eslint src/common/permissions/role-permissions.types.ts src/common/permissions/dto/update-role-permissions.dto.ts src/common/permissions/role-permissions.service.ts src/common/permissions/role-permissions.controller.ts src/common/permissions/permissions.module.ts src/common/auth/branch-route-policy.ts src/common/permissions/role-permissions.service.spec.ts src/common/permissions/role-permissions.controller.spec.ts
npm run typecheck
```
Expected: no errors. If `npm run typecheck` reports `Property 'rolePermission' does not exist`, run `npx prisma generate` (Task 3's model) and re-run.

- [ ] **Step 6: Commit**

```bash
cd server
git add src/common/permissions/role-permissions.types.ts src/common/permissions/dto/update-role-permissions.dto.ts src/common/permissions/role-permissions.service.ts src/common/permissions/role-permissions.controller.ts src/common/permissions/permissions.module.ts src/common/permissions/route-access.snapshot.json src/common/auth/branch-route-policy.ts src/common/permissions/role-permissions.service.spec.ts src/common/permissions/role-permissions.controller.spec.ts
git commit -m "$(cat <<'EOF'
feat(permissions): CEO API for role capabilities

GET /permissions, PUT /permissions/roles/:roleId,
POST /permissions/roles/:roleId/reset and GET /permissions/history, all
@CeoOnly(). A save is refused for the CEO and student roles, a duplicate
key, a grant outside allowedRoles and an unmet requirement. Only
differences from the default are stored, in one Serializable transaction
with one EntityHistory row, and the capability cache is cleared after the
commit (ADR-0086).

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Server carried fixes — advances, contracts, dashboard cache key, history balance

**Files:**
- Modify: `server/src/expenses/expenses.controller.ts` (writes → `@Can('expenses.manage', 'salary.pay')`)
- Modify: `server/src/expenses/expenses.service.ts` (inject `PermissionsService`; `assertMayWrite` by category)
- Modify: `server/src/contract-documents/contract-documents.controller.ts` (4 writes → `@Can('contracts.manage')`)
- Modify: `server/src/dashboard/dashboard-summary.service.ts`, `server/src/dashboard/dashboard-charts.service.ts` (cache key from both flags)
- Modify: `server/src/common/entity-history/diff.util.ts`, `server/src/common/entity-history/entity-history.service.ts` (`User.balance` never stored or returned)
- Modify: `server/src/salary/teacher-timeline.service.ts` (the timeline reads the same `User` history rows; redact there too)
- Test: `server/src/expenses/expenses.service.spec.ts`, `server/src/expenses/expenses.controller.spec.ts`, `server/src/contract-documents/contract-documents.controller.spec.ts`, `server/src/dashboard/dashboard-summary.service.spec.ts`, `server/src/dashboard/dashboard-charts.service.spec.ts`, `server/src/common/entity-history/diff.util.spec.ts`, `server/src/common/entity-history/entity-history.service.spec.ts`, `server/src/salary/teacher-timeline.service.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: capability `contracts.manage` (defaults D + A) and every other key name.
  - Task 3: `fakePermissions(roleIds, { overrides })`, `RoleOverride` (`server/src/common/permissions/effective-permissions.ts`).
  - Existing: `PermissionsService.has(userId, key)`.
- Produces:
  ```ts
  // expenses.service.ts
  private async assertMayWrite(userId: number, category: ExpenseCategory): Promise<void>;
  //   TEACHER_ADVANCE → 'salary.pay' (CEO answer 1: only salary.pay); any other category → 'expenses.manage'
  //   403 «Bu xarajatni kiritish huquqingiz yo'q». create: dto.category; update: existing AND the new category; remove: existing.
  // diff.util.ts
  export const ENTITY_EXCLUDED_KEYS: Readonly<Record<string, readonly string[]>>; // { User: ['balance'] }
  export function computeChangedFields(oldObj, newObj, entityType?: string);
  export function stripSensitiveFields(obj, entityType?: string);
  export function redactHistoryValues(entityType: string, values: unknown): unknown;
  // dashboard cache key suffix: `${canSeeMoney ? 'm' : '-'}${canSeeOutreach ? 'o' : '-'}` (charts: canSeeOperational)
  ```
- Default access is unchanged, so `permission-routes.spec.ts` stays green with the snapshot untouched: `expenses.manage ∪ salary.pay` = D (+ CEO), and `contracts.manage` = D + A (+ CEO).

**Why the history fix matters today:** `users.service.ts` `userSelect` has `balance: true`, and it feeds `recordCreate`/`recordDelete`; `stripSensitiveFields` keeps an `Int`. An Administrator already reads those rows through `GET /entity-history/User/:id` (`teachers.view`) and through `GET /salary/timeline/:userId` (`TeacherTimelineService`, also `teachers.view`, which copies `oldValues`/`newValues` into its payload). The write side stops storing it; the read side strips rows already stored.

- [ ] **Step 1: Write the failing tests**

**1a. `server/src/expenses/expenses.service.spec.ts`**
- Add the import after `import { EntityHistoryService } from '../common/entity-history';`:
  ```ts
  import { PermissionsService } from '../common/permissions/permissions.service';
  ```
- Old:
  ```ts
    const COMPANY_ID = 1;
  ```
  new:
  ```ts
    // Every caller holds every key unless a test says otherwise; the
    // category rule has its own block at the end of this file.
    const permissions = { has: jest.fn() };

    const COMPANY_ID = 1;
  ```
- Old:
  ```ts
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
  ```
  new:
  ```ts
      prisma.$transaction.mockImplementation(async (cb: any) => cb(tx));
      permissions.has.mockResolvedValue(true);
  ```
- Old:
  ```ts
          { provide: EntityHistoryService, useValue: entityHistoryService },
        ],
      }).compile();
  ```
  new:
  ```ts
          { provide: EntityHistoryService, useValue: entityHistoryService },
          { provide: PermissionsService, useValue: permissions },
        ],
      }).compile();
  ```
- Append this block inside the top-level `describe`, i.e. replace the file's last three lines
  ```ts
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });
  ```
  with
  ```ts
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });

    /**
     * ADR-0086 (CEO, 10.10 and 11.10.2026): an advance is cut from its
     * recipient's salary, so it requires `salary.pay` (`expenses.manage` alone
     * is refused); every other category requires `expenses.manage` (`salary.pay`
     * alone is refused). The routes let both holders in only to reach this check.
     */
    describe('who may write which category', () => {
      const REFUSAL = "Bu xarajatni kiritish huquqingiz yo'q";
      const holding = (...keys: string[]) =>
        permissions.has.mockImplementation((_userId: number, key: string) =>
          Promise.resolve(keys.includes(key)),
        );
      const advance = {
        category: ExpenseCategory.TEACHER_ADVANCE,
        paymentMethod: ExpensePaymentMethod.CASH,
        amount: 500_000,
        description: 'Avans',
        date: '2026-10-10',
        branchId: 1,
        relatedUserId: 10005,
      } as any;
      const rent = {
        ...advance,
        category: ExpenseCategory.RENT,
        description: 'Ijara',
        relatedUserId: undefined,
      } as any;
      const row = (category: ExpenseCategory) => ({
        id: 'exp-1',
        category,
        amount: 100,
        branchId: 1,
        companyId: COMPANY_ID,
        deletedAt: null,
        relatedUserId:
          category === ExpenseCategory.TEACHER_ADVANCE ? 10005 : null,
        settledBySalaryPaymentId: null,
      });

      it('lets a holder of salary.pay alone write an advance', async () => {
        holding('salary.pay', 'salary.view');
        prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

        await service.create(advance, 42, COMPANY_ID);

        expect(permissions.has).toHaveBeenCalledWith(42, 'salary.pay');
        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('refuses an advance to a holder of expenses.manage without salary.pay', async () => {
        holding('expenses.manage', 'expenses.view');

        await expect(service.create(advance, 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.branch.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('refuses rent to a holder of salary.pay alone', async () => {
        holding('salary.pay', 'salary.view');

        await expect(service.create(rent, 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('lets a holder of expenses.manage write rent', async () => {
        holding('expenses.manage', 'expenses.view');
        prisma.$transaction.mockResolvedValueOnce({ id: 'exp-new' });

        await service.create(rent, 42, COMPANY_ID);

        expect(prisma.$transaction).toHaveBeenCalled();
      });

      it('turns rent into an advance only for a caller holding both keys', async () => {
        prisma.expense.findFirst.mockResolvedValue(row(ExpenseCategory.RENT));
        const toAdvance = {
          category: ExpenseCategory.TEACHER_ADVANCE,
          relatedUserId: 10005,
        } as any;

        holding('salary.pay', 'salary.view');
        await expect(
          service.update('exp-1', toAdvance, 42, COMPANY_ID),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));

        holding('expenses.manage', 'expenses.view');
        await expect(
          service.update('exp-1', toAdvance, 42, COMPANY_ID),
        ).rejects.toThrow(new ForbiddenException(REFUSAL));

        expect(prisma.$transaction).not.toHaveBeenCalled();
      });

      it('lets a holder of salary.pay alone change and delete an advance', async () => {
        holding('salary.pay', 'salary.view');
        prisma.expense.findFirst.mockResolvedValue(
          row(ExpenseCategory.TEACHER_ADVANCE),
        );
        prisma.transaction.findFirst.mockResolvedValue(null);
        prisma.$transaction
          .mockResolvedValueOnce({ id: 'exp-1' })
          .mockResolvedValueOnce(undefined);

        await service.update('exp-1', { date: '2026-10-11' } as any, 42, COMPANY_ID);
        await service.remove('exp-1', 42, COMPANY_ID);

        expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('refuses deleting rent to a holder of salary.pay alone', async () => {
        holding('salary.pay', 'salary.view');
        prisma.expense.findFirst.mockResolvedValue(row(ExpenseCategory.RENT));

        await expect(service.remove('exp-1', 42, COMPANY_ID)).rejects.toThrow(
          new ForbiddenException(REFUSAL),
        );
        expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
        expect(prisma.$transaction).not.toHaveBeenCalled();
      });
    });
  });
  ```

**1b. `server/src/expenses/expenses.controller.spec.ts`** — old:
```ts
  it.each(WRITES)('%s is gated by the expenses manage capability', (name) => {
    expect(routeAccess(ExpensesController, name)).toEqual({
      kind: 'can',
      keys: ['expenses.manage'],
    });
  });
```
new:
```ts
  it.each(WRITES)(
    '%s lets both key holders reach the per-category check in the service',
    (name) => {
      expect(routeAccess(ExpensesController, name)).toEqual({
        kind: 'can',
        keys: ['expenses.manage', 'salary.pay'],
      });
    },
  );
```
(The existing `'%s admits the Branch Director and the CEO by default…'` test stays as is: it pins that default access does not change.)

**1c. `server/src/contract-documents/contract-documents.controller.spec.ts`** — old:
```ts
  it.each(['create', 'update', 'sign', 'cancel'] as const)(
    '%s is a write (students.manage)',
    (name) => {
      expect(routeAccess(ContractDocumentsController, name)).toEqual({
        kind: 'can',
        keys: ['students.manage'],
      });
```
new:
```ts
  it.each(['create', 'update', 'sign', 'cancel'] as const)(
    '%s is a contract write (contracts.manage)',
    (name) => {
      expect(routeAccess(ContractDocumentsController, name)).toEqual({
        kind: 'can',
        keys: ['contracts.manage'],
      });
```
(The `defaultRolesOf(...)` expectation below it stays `['Administrator', 'Branch Director', 'CEO']`.)

**1d. `server/src/dashboard/dashboard-summary.service.spec.ts`**
- Add after `import { fakePermissions } from '../common/permissions/testing';`:
  ```ts
  import type { RoleOverride } from '../common/permissions/effective-permissions';
  ```
- Old:
  ```ts
  function makeService(
    overrides: Record<string, any> = {},
    roleIds: number[] = [ROLE_ID.CEO],
  ) {
  ```
  new:
  ```ts
  function makeService(
    overrides: Record<string, any> = {},
    roleIds: number[] = [ROLE_ID.CEO],
    roleOverrides: RoleOverride[] = [],
  ) {
  ```
- Old:
  ```ts
      fakePermissions(roleIds),
    );
    return { service, reports, payments, outreach, dashboard, redis };
  ```
  new:
  ```ts
      fakePermissions(roleIds, { overrides: roleOverrides }),
    );
    return { service, reports, payments, outreach, dashboard, redis };
  ```
- Old:
  ```ts
    expect(ceoKey).toContain(':money');
    expect(administratorKey).toContain(':outreach');
    expect(ceoKey).not.toBe(administratorKey);
  });
  ```
  new:
  ```ts
    expect(ceoKey).toMatch(/:mo$/);
    expect(administratorKey).toMatch(/:-o$/);
    expect(ceoKey).not.toBe(administratorKey);
  });

  it('keys the cache on both flags: money without outreach never shares a key', async () => {
    // The old single tier assumed reports.finance ⇒ outreach.view. Once the
    // CEO can switch outreach off for a role (ADR-0086) that caller must not
    // be served a cached body that carries outreach numbers.
    const both = makeService({}, [ROLE_ID.BRANCH_DIRECTOR]);
    await both.service.getSummary(CEO);
    const moneyOnly = makeService({}, [ROLE_ID.BRANCH_DIRECTOR], [
      { roleId: ROLE_ID.BRANCH_DIRECTOR, key: 'outreach.view', granted: false },
    ]);
    const res = await moneyOnly.service.getSummary(CEO);

    expect(both.redis.setex.mock.calls[0][0]).toMatch(/:mo$/);
    expect(moneyOnly.redis.setex.mock.calls[0][0]).toMatch(/:m-$/);
    expect(res.money).not.toBeNull();
    expect(moneyOnly.outreach.getStats).not.toHaveBeenCalled();
  });
  ```
- Old:
  ```ts
    expect(outreach.getStats).toHaveBeenCalled();
    expect(redis.setex.mock.calls[0][0]).toContain(':outreach');
  ```
  new:
  ```ts
    expect(outreach.getStats).toHaveBeenCalled();
    expect(redis.setex.mock.calls[0][0]).toMatch(/:-o$/);
  ```

**1e. `server/src/dashboard/dashboard-charts.service.spec.ts`**
- Add after `import { fakePermissions } from '../common/permissions/testing';`:
  ```ts
  import type { RoleOverride } from '../common/permissions/effective-permissions';
  ```
- Old:
  ```ts
  function makeService(
    overrides: Record<string, any> = {},
    roleIds: number[] = [ROLE_ID.CEO],
  ) {
  ```
  new:
  ```ts
  function makeService(
    overrides: Record<string, any> = {},
    roleIds: number[] = [ROLE_ID.CEO],
    roleOverrides: RoleOverride[] = [],
  ) {
  ```
- Old:
  ```ts
        fakePermissions(roleIds),
      ),
      reports,
      redis,
  ```
  new:
  ```ts
        fakePermissions(roleIds, { overrides: roleOverrides }),
      ),
      reports,
      redis,
  ```
- Old:
  ```ts
    expect(ceo.redis.setex.mock.calls[0][0]).toContain(':money');
    expect(administrator.redis.setex.mock.calls[0][0]).toContain(':ops');
  });
  ```
  new:
  ```ts
    expect(ceo.redis.setex.mock.calls[0][0]).toMatch(/:mo$/);
    expect(administrator.redis.setex.mock.calls[0][0]).toMatch(/:-o$/);
  });

  it('keys the cache on both flags: money without the operational charts is its own entry', async () => {
    const moneyOnly = makeService({}, [ROLE_ID.BRANCH_DIRECTOR], [
      { roleId: ROLE_ID.BRANCH_DIRECTOR, key: 'outreach.view', granted: false },
    ]);
    const res = await moneyOnly.service.getCharts(CEO);

    expect(moneyOnly.redis.setex.mock.calls[0][0]).toMatch(/:m-$/);
    expect(res.money).not.toBeNull();
    expect(res.students).toBeNull();
    expect(res.attendance).toBeNull();
  });
  ```
- Old:
  ```ts
    expect(res.attendance).not.toBeNull();
    expect(redis.setex.mock.calls[0][0]).toContain(':ops');
  ```
  new:
  ```ts
    expect(res.attendance).not.toBeNull();
    expect(redis.setex.mock.calls[0][0]).toMatch(/:-o$/);
  ```

**1f. `server/src/common/entity-history/diff.util.spec.ts`** — old:
```ts
import { computeChangedFields } from './diff.util';
```
new:
```ts
import {
  computeChangedFields,
  redactHistoryValues,
  stripSensitiveFields,
} from './diff.util';
```
and append at the end of the file:
```ts

describe('an employee balance in history (ADR-0086)', () => {
  it('drops User.balance from a diff and keeps the rest', () => {
    expect(
      computeChangedFields(
        { firstName: 'Ali', balance: 1 },
        { firstName: 'Vali', balance: 2 },
        'User',
      ),
    ).toEqual({
      oldValues: { firstName: 'Ali' },
      newValues: { firstName: 'Vali' },
    });
  });

  it('keeps Student.balance, a money view behind its own capabilities', () => {
    expect(
      computeChangedFields({ balance: 1 }, { balance: 2 }, 'Student'),
    ).toEqual({ oldValues: { balance: 1 }, newValues: { balance: 2 } });
  });

  it('drops User.balance from a create or delete snapshot only', () => {
    expect(
      stripSensitiveFields({ firstName: 'Ali', balance: 1 }, 'User'),
    ).toEqual({ firstName: 'Ali' });
    expect(stripSensitiveFields({ firstName: 'Ali', balance: 1 })).toEqual({
      firstName: 'Ali',
      balance: 1,
    });
  });

  it('redacts a stored row on the way out and leaves other shapes alone', () => {
    expect(redactHistoryValues('User', { phone: '1', balance: 1 })).toEqual({
      phone: '1',
    });
    expect(redactHistoryValues('Student', { balance: 1 })).toEqual({
      balance: 1,
    });
    expect(redactHistoryValues('User', null)).toBeNull();
    expect(redactHistoryValues('User', ['balance'])).toEqual(['balance']);
    expect(redactHistoryValues('toString', { balance: 1 })).toEqual({
      balance: 1,
    });
  });
});
```

**1g. `server/src/common/entity-history/entity-history.service.spec.ts`**
- Old:
  ```ts
    let prisma: { entityHistory: { create: jest.Mock } };
  ```
  new:
  ```ts
    let prisma: {
      entityHistory: {
        create: jest.Mock;
        findMany: jest.Mock;
        count: jest.Mock;
      };
    };
  ```
- Old:
  ```ts
      prisma = {
        entityHistory: {
          create: jest.fn().mockResolvedValue(undefined),
        },
      };
  ```
  new:
  ```ts
      prisma = {
        entityHistory: {
          create: jest.fn().mockResolvedValue(undefined),
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(0),
        },
      };
  ```
- Replace the file's last four lines
  ```ts
        expect(data.newValues).toEqual({ soni: 42, bor: true, yoq: null });
      });
    });
  });
  ```
  with
  ```ts
        expect(data.newValues).toEqual({ soni: 42, bor: true, yoq: null });
      });
    });

    /**
     * `User.balance` is the employee's salary balance. `teachers.view` and
     * `employees.view` open an employee's history; neither means «may see
     * pay» (ADR-0086). `users.service.ts` hands `userSelect`, balance
     * included, to recordCreate and recordDelete.
     */
    describe('employee balance', () => {
      it('stores no User.balance on create, update or delete', async () => {
        await service.recordCreate({
          entityType: 'User',
          entityId: 10050,
          newValues: { firstName: 'Ali', balance: 1 },
          companyId: 1,
        });
        await service.recordUpdate({
          entityType: 'User',
          entityId: 10050,
          oldValues: { firstName: 'Ali', balance: 1 },
          newValues: { firstName: 'Vali', balance: 2 },
          companyId: 1,
        });
        await service.recordDelete({
          entityType: 'User',
          entityId: 10050,
          oldValues: { firstName: 'Vali', balance: 2 },
          companyId: 1,
        });

        const [created, updated, deleted] =
          prisma.entityHistory.create.mock.calls.map((c) => c[0].data);
        expect(created.newValues).toEqual({ firstName: 'Ali' });
        expect(updated.oldValues).toEqual({ firstName: 'Ali' });
        expect(updated.newValues).toEqual({ firstName: 'Vali' });
        expect(deleted.oldValues).toEqual({ firstName: 'Vali' });
      });

      it('keeps a Student balance', async () => {
        await service.recordCreate({
          entityType: 'Student',
          entityId: 10001,
          newValues: { firstName: 'Ali', balance: 1 },
          companyId: 1,
        });
        const data = prisma.entityHistory.create.mock.calls[0][0].data;
        expect(data.newValues).toEqual({ firstName: 'Ali', balance: 1 });
      });

      it('strips a balance stored before the fix when it reads User history', async () => {
        prisma.entityHistory.findMany.mockResolvedValue([
          {
            id: 'h1',
            action: 'DELETE',
            oldValues: { firstName: 'Ali', balance: 1 },
            newValues: null,
          },
        ]);
        prisma.entityHistory.count.mockResolvedValue(1);

        const page = await service.getHistory('User', '10050', 1);

        expect(page.data[0].oldValues).toEqual({ firstName: 'Ali' });
        expect(page.data[0].newValues).toBeNull();
        expect(page.total).toBe(1);
      });

      it('returns a stored Student balance unchanged', async () => {
        prisma.entityHistory.findMany.mockResolvedValue([
          { id: 'h2', action: 'CREATE', oldValues: null, newValues: { balance: 1 } },
        ]);

        const page = await service.getHistory('Student', '10001', 1);

        expect(page.data[0].newValues).toEqual({ balance: 1 });
      });
    });
  });
  ```

**1h. `server/src/salary/teacher-timeline.service.spec.ts`** — append inside `describe('TeacherTimelineService.getTimeline', …)`, after `'lets the CEO read any employee, rates included'` (replace the file's last two lines `  });\n});` accordingly):
```ts
  it('never shows an employee balance stored in an old profile row (ADR-0086)', async () => {
    prisma.entityHistory.findMany.mockResolvedValue([
      {
        id: 'e2',
        action: 'CREATE',
        oldValues: null,
        newValues: { firstName: 'Ali', balance: 1 },
        createdAt: new Date('2026-08-01'),
        changedBy: null,
      },
    ]);
    const service = await build([ROLE_ID.ADMINISTRATOR]);
    people({ roles: ['Administrator'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    const profile = events.find((e) => e.kind === 'ProfileUpdated');
    expect(profile?.payload.newValues).toEqual({ firstName: 'Ali' });
    expect(profile?.payload.oldValues).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run:
```bash
cd server
npx jest src/expenses src/contract-documents/contract-documents.controller.spec.ts src/dashboard/dashboard-summary.service.spec.ts src/dashboard/dashboard-charts.service.spec.ts src/common/entity-history src/salary/teacher-timeline.service.spec.ts
```
Expected: FAIL —
- expenses service: the four refusal tests (no category check yet; `create` reaches `$transaction`);
- expenses controller: keys `['expenses.manage']` ≠ `['expenses.manage', 'salary.pay']`;
- contract controller: keys `['students.manage']` ≠ `['contracts.manage']`;
- dashboard: keys end `:money` / `:outreach` / `:ops`; the money-only caller gets `:money`;
- entity-history and diff: `balance` is still stored and returned;
- timeline: `newValues` still carries `balance`.

- [ ] **Step 3: Implement**

**3a. `server/src/expenses/expenses.controller.ts`** — three edits. Old:
```ts
  @Post()
  @Can('expenses.manage')
  create(
```
new:
```ts
  // ADR-0086: an advance (TEACHER_ADVANCE) requires `salary.pay` and any other
  // category requires `expenses.manage`; neither key alone writes the other's
  // categories. Both keys are listed here only so their holders reach
  // `ExpensesService.assertMayWrite`, which enforces that rule.
  @Post()
  @Can('expenses.manage', 'salary.pay')
  create(
```
Old:
```ts
  @Patch(':id')
  @Can('expenses.manage')
  update(
```
new:
```ts
  @Patch(':id')
  @Can('expenses.manage', 'salary.pay')
  update(
```
Old:
```ts
  @Delete(':id')
  @Can('expenses.manage')
  remove(
```
new:
```ts
  @Delete(':id')
  @Can('expenses.manage', 'salary.pay')
  remove(
```

**3b. `server/src/expenses/expenses.service.ts`**
- Imports. Old:
  ```ts
  import { EntityHistoryService } from '../common/entity-history';
  ```
  new:
  ```ts
  import { EntityHistoryService } from '../common/entity-history';
  import { PermissionsService } from '../common/permissions/permissions.service';
  import type { PermissionKey } from '../common/permissions/permission-catalog';
  ```
- Constant. Old:
  ```ts
  const RECIPIENT_OTHER_BRANCH =
    "Bu xodim tanlangan filialga biriktirilmagan — avansni xodimning o'z filialida yozing.";
  ```
  new:
  ```ts
  const RECIPIENT_OTHER_BRANCH =
    "Bu xodim tanlangan filialga biriktirilmagan — avansni xodimning o'z filialida yozing.";

  // ADR-0086 (CEO, 10.10 and 11.10.2026): an advance is cut from its
  // recipient's salary, so it is written with «Oylik va avans to'lash»
  // (`salary.pay`) alone; every other category with «Xarajat kiritish»
  // (`expenses.manage`).
  const EXPENSE_WRITE_REFUSAL = "Bu xarajatni kiritish huquqingiz yo'q";
  ```
- Constructor. Old:
  ```ts
    constructor(
      private prisma: PrismaService,
      private transactionsService: TransactionsService,
      private entityHistoryService: EntityHistoryService,
    ) {}
  ```
  new:
  ```ts
    constructor(
      private prisma: PrismaService,
      private transactionsService: TransactionsService,
      private entityHistoryService: EntityHistoryService,
      private permissions: PermissionsService,
    ) {}

    /**
     * The one place the category rule lives (ADR-0086): TEACHER_ADVANCE
     * requires `salary.pay`, every other category `expenses.manage`. Runs before any other check, so a caller who may
     * not write the category learns nothing about branches or recipients.
     */
    private async assertMayWrite(
      userId: number,
      category: ExpenseCategory,
    ): Promise<void> {
      const key: PermissionKey =
        category === ExpenseCategory.TEACHER_ADVANCE
          ? 'salary.pay'
          : 'expenses.manage';
      if (!(await this.permissions.has(userId, key))) {
        throw new ForbiddenException(EXPENSE_WRITE_REFUSAL);
      }
    }
  ```
- `create`. Old:
  ```ts
    async create(dto: CreateExpenseDto, userId: number, companyId: number) {
      await this.assertBranchWritable(dto.branchId, companyId, userId);
  ```
  new:
  ```ts
    async create(dto: CreateExpenseDto, userId: number, companyId: number) {
      await this.assertMayWrite(userId, dto.category);
      await this.assertBranchWritable(dto.branchId, companyId, userId);
  ```
- `update`. Old:
  ```ts
      if (!existing) throw new NotFoundException('Xarajat topilmadi');

      // Both sides: the caller must own the branch the row is IN, and the branch
  ```
  new:
  ```ts
      if (!existing) throw new NotFoundException('Xarajat topilmadi');

      // The category it is now, and the one it becomes: rent turned into an
      // advance needs both keys.
      await this.assertMayWrite(userId, existing.category);
      if (dto.category !== undefined && dto.category !== existing.category) {
        await this.assertMayWrite(userId, dto.category);
      }

      // Both sides: the caller must own the branch the row is IN, and the branch
  ```
- `remove`. Old:
  ```ts
      if (!existing) throw new NotFoundException('Xarajat topilmadi');

      // Delete REVERSES a ledger entry and moves cash back into the branch's
  ```
  new:
  ```ts
      if (!existing) throw new NotFoundException('Xarajat topilmadi');
      await this.assertMayWrite(userId, existing.category);

      // Delete REVERSES a ledger entry and moves cash back into the branch's
  ```
- `ExpensesModule` needs no import: `PermissionsModule` is `@Global()`. `reports.service.spec.ts` provides `ExpensesService` as `useValue: {}` and is unaffected; `expenses.controller.body-validation.e2e.spec.ts` mocks the service and registers no `PermissionGuard`, so it is unaffected too.

**3c. `server/src/contract-documents/contract-documents.controller.ts`**
- Doc comment. Old:
  ```ts
  /**
   * Student contracts (ADR-0075). Reads are a profile tab (`students.details`),
   * writes are `students.manage`; every route checks the student's branch in
   * the service (`assertCallerMayTouchStudent`).
   */
  ```
  new:
  ```ts
  /**
   * Student contracts (ADR-0075). Reads are a profile tab (`students.details`),
   * writes are «Shartnoma tuzish va imzolash» (`contracts.manage`, ADR-0086);
   * every route checks the student's branch in the service
   * (`assertCallerMayTouchStudent`). Cancelling a SIGNED contract stays
   * CEO-only inside `ContractLifecycleService.cancel` (ADR-0075).
   */
  ```
- Replace `@Can('students.manage')` with `@Can('contracts.manage')` on exactly the four write handlers. Each anchor, old → new:
  ```ts
  @Post()
  @Can('students.manage')
  create(
  ```
  →
  ```ts
  @Post()
  @Can('contracts.manage')
  create(
  ```
  ```ts
  @Patch(':id')
  @Can('students.manage')
  update(
  ```
  →
  ```ts
  @Patch(':id')
  @Can('contracts.manage')
  update(
  ```
  ```ts
  @Post(':id/sign')
  @Can('students.manage')
  sign(
  ```
  →
  ```ts
  @Post(':id/sign')
  @Can('contracts.manage')
  sign(
  ```
  ```ts
  @Post(':id/cancel')
  @Can('students.manage')
  cancel(
  ```
  →
  ```ts
  @Post(':id/cancel')
  @Can('contracts.manage')
  cancel(
  ```
  The three `@Can('students.details')` reads (`list`, `prefill`, `pdf`) do not change. After the edit, `grep -n "students.manage" src/contract-documents/contract-documents.controller.ts` prints nothing.

**3d. `server/src/dashboard/dashboard-summary.service.ts`** — old:
```ts
    // Kesh kaliti rol darajasini o'z ichiga oladi: bir rolning yozuvi
    // boshqasiga hech qachon berilmaydi.
    const tier = canSeeMoney ? 'money' : canSeeOutreach ? 'outreach' : 'basic';
```
new:
```ts
    // The cache key carries every flag the body depends on. One «tier»
    // assumed reports.finance ⇒ outreach.view, which stops holding once the
    // CEO sets each key per role (ADR-0086): a caller with money and no
    // outreach would have been served a body with outreach numbers.
    const tier = `${canSeeMoney ? 'm' : '-'}${canSeeOutreach ? 'o' : '-'}`;
```

**3e. `server/src/dashboard/dashboard-charts.service.ts`** — old:
```ts
    const tier = canSeeMoney ? 'money' : canSeeOperational ? 'ops' : 'none';
```
new:
```ts
    // Both flags, not a ladder: money and the operational charts are
    // independent keys since ADR-0086.
    const tier = `${canSeeMoney ? 'm' : '-'}${canSeeOperational ? 'o' : '-'}`;
```
(Old cache entries under `:money`/`:outreach`/`:basic`/`:ops`/`:none` are never read again and expire after `CACHE_TTL_SECONDS`.)

**3f. `server/src/common/entity-history/diff.util.ts`**
- After the `EXCLUDED_KEYS` set (old, ends with):
  ```ts
    // A security counter (ADR-0030), not business data: bumping it is journaled
    // as the password change or logout that caused it, never as a raw number.
    'sessionVersion',
  ]);
  ```
  new:
  ```ts
    // A security counter (ADR-0030), not business data: bumping it is journaled
    // as the password change or logout that caused it, never as a raw number.
    'sessionVersion',
  ]);

  /**
   * Fields left out of ONE entity type's history, on top of `EXCLUDED_KEYS`.
   * `User.balance` is the employee's salary balance (ADR-0086): an employee's
   * history and timeline open with `teachers.view` / `employees.view`, and
   * neither means «may see pay». `Student.balance` stays: the student's
   * history is a money view behind its own capabilities.
   */
  export const ENTITY_EXCLUDED_KEYS: Readonly<
    Record<string, readonly string[]>
  > = {
    User: ['balance'],
  };

  function excludedFor(entityType: string | undefined): readonly string[] {
    // `hasOwnProperty`: the read side passes a type from the URL, and
    // `ENTITY_EXCLUDED_KEYS['toString']` is a function, not a list.
    return entityType !== undefined &&
      Object.prototype.hasOwnProperty.call(ENTITY_EXCLUDED_KEYS, entityType)
      ? ENTITY_EXCLUDED_KEYS[entityType]
      : [];
  }
  ```
- `computeChangedFields`. Old:
  ```ts
  export function computeChangedFields(
    oldObj: Record<string, any>,
    newObj: Record<string, any>,
  ): { oldValues: Record<string, any>; newValues: Record<string, any> } | null {
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    let hasChanges = false;

    for (const key of Object.keys(newObj)) {
      if (EXCLUDED_KEYS.has(key)) continue;
  ```
  new:
  ```ts
  export function computeChangedFields(
    oldObj: Record<string, any>,
    newObj: Record<string, any>,
    entityType?: string,
  ): { oldValues: Record<string, any>; newValues: Record<string, any> } | null {
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    const typeExcluded = excludedFor(entityType);
    let hasChanges = false;

    for (const key of Object.keys(newObj)) {
      if (EXCLUDED_KEYS.has(key) || typeExcluded.includes(key)) continue;
  ```
- `stripSensitiveFields`. Old:
  ```ts
  export function stripSensitiveFields(
    obj: Record<string, any>,
  ): Record<string, any> {
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (EXCLUDED_KEYS.has(key)) continue;
      if (!isPlainValue(obj[key])) continue;
      result[key] = jsonSafe(obj[key] ?? null);
    }
    return result;
  }
  ```
  new:
  ```ts
  export function stripSensitiveFields(
    obj: Record<string, any>,
    entityType?: string,
  ): Record<string, any> {
    const typeExcluded = excludedFor(entityType);
    const result: Record<string, any> = {};
    for (const key of Object.keys(obj)) {
      if (EXCLUDED_KEYS.has(key) || typeExcluded.includes(key)) continue;
      if (!isPlainValue(obj[key])) continue;
      result[key] = jsonSafe(obj[key] ?? null);
    }
    return result;
  }

  /**
   * The read side: rows stored before a field was excluded still carry it, so
   * every reader of `oldValues`/`newValues` passes them through here. Anything
   * that is not a plain object (null, an array) comes back unchanged.
   */
  export function redactHistoryValues(
    entityType: string,
    values: unknown,
  ): unknown {
    const typeExcluded = excludedFor(entityType);
    if (
      typeExcluded.length === 0 ||
      values === null ||
      typeof values !== 'object' ||
      Array.isArray(values)
    ) {
      return values;
    }
    return Object.fromEntries(
      Object.entries(values).filter(([key]) => !typeExcluded.includes(key)),
    );
  }
  ```

**3g. `server/src/common/entity-history/entity-history.service.ts`**
- Old:
  ```ts
  import { computeChangedFields, stripSensitiveFields } from './diff.util';
  ```
  new:
  ```ts
  import {
    computeChangedFields,
    redactHistoryValues,
    stripSensitiveFields,
  } from './diff.util';
  ```
- `recordCreate` and `recordRestore` both contain `newValues: stripSensitiveFields(params.newValues),` — replace BOTH occurrences with:
  ```ts
          newValues: stripSensitiveFields(params.newValues, params.entityType),
  ```
- `recordUpdate`. Old:
  ```ts
      const diff = computeChangedFields(params.oldValues, params.newValues);
  ```
  new:
  ```ts
      const diff = computeChangedFields(
        params.oldValues,
        params.newValues,
        params.entityType,
      );
  ```
- `recordDelete`. Old:
  ```ts
          oldValues: stripSensitiveFields(params.oldValues),
  ```
  new:
  ```ts
          oldValues: stripSensitiveFields(params.oldValues, params.entityType),
  ```
- `getHistory`. Old:
  ```ts
      return { data, total, page, pageSize };
  ```
  new:
  ```ts
      // Rows stored before a field was excluded (`User.balance`, ADR-0086)
      // still carry it; strip it on the way out.
      return {
        data: data.map((row) => ({
          ...row,
          oldValues: redactHistoryValues(
            entityType,
            row.oldValues,
          ) as typeof row.oldValues,
          newValues: redactHistoryValues(
            entityType,
            row.newValues,
          ) as typeof row.newValues,
        })),
        total,
        page,
        pageSize,
      };
  ```

**3h. `server/src/salary/teacher-timeline.service.ts`**
- Old:
  ```ts
  import { assertCallerMayTouchUser } from '../common/auth/user-branch-scope';
  ```
  new:
  ```ts
  import { assertCallerMayTouchUser } from '../common/auth/user-branch-scope';
  import { redactHistoryValues } from '../common/entity-history/diff.util';
  ```
- Old:
  ```ts
          payload: {
            action: e.action,
            oldValues: e.oldValues,
            newValues: e.newValues,
          },
  ```
  new:
  ```ts
          payload: {
            action: e.action,
            // An old row may still carry the employee's salary balance
            // (ADR-0086); `teachers.view` is not a salary key.
            oldValues: redactHistoryValues('User', e.oldValues),
            newValues: redactHistoryValues('User', e.newValues),
          },
  ```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
cd server
npx jest src/expenses src/contract-documents src/dashboard src/common/entity-history src/salary/teacher-timeline.service.spec.ts src/common/permissions/permission-routes.spec.ts src/reports/reports.service.spec.ts src/users
```
Expected: PASS. `permission-routes.spec.ts` stays green with the snapshot untouched: the expense writes still admit `['Branch Director', 'CEO']` and the contract writes `['Administrator', 'Branch Director', 'CEO']`.

- [ ] **Step 5: Lint, format, type-check**

```bash
cd server
npx prettier --write src/expenses/expenses.controller.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts src/expenses/expenses.controller.spec.ts src/contract-documents/contract-documents.controller.ts src/contract-documents/contract-documents.controller.spec.ts src/dashboard/dashboard-summary.service.ts src/dashboard/dashboard-charts.service.ts src/dashboard/dashboard-summary.service.spec.ts src/dashboard/dashboard-charts.service.spec.ts src/common/entity-history/diff.util.ts src/common/entity-history/entity-history.service.ts src/common/entity-history/diff.util.spec.ts src/common/entity-history/entity-history.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts
npx eslint src/expenses/expenses.controller.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts src/expenses/expenses.controller.spec.ts src/contract-documents/contract-documents.controller.ts src/contract-documents/contract-documents.controller.spec.ts src/dashboard/dashboard-summary.service.ts src/dashboard/dashboard-charts.service.ts src/dashboard/dashboard-summary.service.spec.ts src/dashboard/dashboard-charts.service.spec.ts src/common/entity-history/diff.util.ts src/common/entity-history/entity-history.service.ts src/common/entity-history/diff.util.spec.ts src/common/entity-history/entity-history.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts
npm run typecheck
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd server
git add src/expenses/expenses.controller.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts src/expenses/expenses.controller.spec.ts src/contract-documents/contract-documents.controller.ts src/contract-documents/contract-documents.controller.spec.ts src/dashboard/dashboard-summary.service.ts src/dashboard/dashboard-charts.service.ts src/dashboard/dashboard-summary.service.spec.ts src/dashboard/dashboard-charts.service.spec.ts src/common/entity-history/diff.util.ts src/common/entity-history/entity-history.service.ts src/common/entity-history/diff.util.spec.ts src/common/entity-history/entity-history.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts
git commit -m "$(cat <<'EOF'
fix(permissions): advances, contracts, dashboard cache, employee balance

- An advance (TEACHER_ADVANCE) is written only with salary.pay, and any
  other expense only with expenses.manage (CEO, 11.10). The routes list
  both keys; ExpensesService.assertMayWrite enforces the category rule.
- Contract-document writes move to contracts.manage (defaults unchanged).
- The dashboard cache key carries both the money and the outreach flag.
- User.balance is never stored in, nor returned from, employee history or
  the teacher timeline.

Default access is unchanged (ADR-0086).

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Client carried fixes — advance button, contract buttons, group-form hints, staff-rate state

**Files:**
- Modify: `client/src/components/payments/salary-client.tsx` («Avans berish» and the «Avanslar» tab's add/edit/delete follow `salary.pay`)
- Modify: `client/src/components/students/contracts/student-contracts-tab.tsx` (create, edit, sign and cancel buttons follow `contracts.manage`)
- Modify: `client/src/components/students/contracts/contract-card.tsx` (doc comment only)
- Modify: `client/src/components/groups/group-form-empty-hints.ts` (course link → `courses.create`, teacher link → `teachers.manage`)
- Test: `client/src/components/groups/group-form-empty-hints.test.ts`
- Test: `client/src/components/payments/salary-settings-access.test.ts` (pin only, no code change)

**Interfaces:**
- Consumes:
  - Task 1: `"contracts.manage"` in `client/src/lib/permission-keys.ts` (so `useCan("contracts.manage")` type-checks), and the split catalog behind `canForRoles` in `client/src/test-support/server-catalog.ts`.
  - Task 6 (server): `POST/PATCH/DELETE /expenses` carry `@Can('expenses.manage', 'salary.pay')`, and `ExpensesService.assertMayWrite` lets a `TEACHER_ADVANCE` through only for a holder of `salary.pay` (CEO answer 1). The four contract-document writes carry `@Can('contracts.manage')`.
  - Existing: `useCan(wanted: PermissionKey | readonly PermissionKey[]): boolean` (`@/hooks/use-permissions`); `makeCan(keys: ReadonlySet<PermissionKey> | null): Can` (`@/lib/permission-check`); `resolveSalarySettingsAccess(can: Can): SalarySettingsAccess` (`./salary-settings-access`).
- Produces: nothing new. `groupFormEmptyHints(can: Can, branchId: number | null)` keeps its signature.

> **Binding (CEO, 11.10).** «Avans berish / qo'shish» is gated by `useCan("salary.pay")` alone — never a list that includes `expenses.manage`. Task 6's service refuses an advance from a caller who holds only `expenses.manage`, so any wider gate would show a button that 403s. Default access is unchanged: both keys default to the Branch Director only.

- [ ] **Step 1: Write the failing tests**

In `client/src/components/groups/group-form-empty-hints.test.ts`, replace the import block:

old:
```ts
import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import { groupFormEmptyHints } from "./group-form-empty-hints";
```
new:
```ts
import { describe, expect, it } from "vitest";
import { makeCan } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
import { canForRoles } from "@/test-support/server-catalog";
import { groupFormEmptyHints } from "./group-form-empty-hints";

const canOnly = (...keys: PermissionKey[]) => makeCan(new Set<PermissionKey>(keys));
```

Then insert these two tests right after the `"no branch selected: no room link"` test, inside the same `describe`:
```ts
  it("the teacher link follows `teachers.manage` alone (ADR-0086)", () => {
    const h = groupFormEmptyHints(canOnly("teachers.view", "teachers.manage"), 7);
    expect(h.teacher.action).toEqual({ href: "/teachers", label: "Ustoz qo'shish" });
    expect(h.course).toEqual({
      text: "Bu filialda hali kurs yo'q. Kursni filial direktori qo'shadi.",
    });
  });

  it("the course link follows `courses.create` alone (ADR-0086)", () => {
    const h = groupFormEmptyHints(canOnly("settings.reference", "courses.create"), 7);
    expect(h.course.action).toEqual({ href: "/settings/courses", label: "Kurs qo'shish" });
    expect(h.teacher).toEqual({
      text: "Hozircha o'qituvchi yo'q. Ustozni filial direktori qo'shadi.",
    });
  });
```

In `client/src/components/payments/salary-settings-access.test.ts`, replace the import block:

old:
```ts
import { describe, expect, it } from "vitest";
import { canForRoles } from "@/test-support/server-catalog";
import {
  canDirectorRate,
  resolveSalarySettingsAccess,
} from "./salary-settings-access";
```
new:
```ts
import { describe, expect, it } from "vitest";
import { makeCan } from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";
import { canForRoles } from "@/test-support/server-catalog";
import {
  canDirectorRate,
  resolveSalarySettingsAccess,
} from "./salary-settings-access";
```
and insert this test as the last `it` of `describe("resolveSalarySettingsAccess", …)` (after the `it.each([[[3]], [[4]], [[5]], [[]]])` block):
```ts
  // The «E'tibor talab qiladi» staff rows and «Xodimlar stavkalari» follow
  // `salary.rate-edit` (CEO 10.10). `salary.close` is the bulk settle and must
  // never open them.
  it("staff rates follow `salary.rate-edit`, never `salary.close`", () => {
    const closeOnly = makeCan(new Set<PermissionKey>(["salary.view", "salary.close"]));
    expect(resolveSalarySettingsAccess(closeOnly).canManageCompanyPayroll).toBe(false);
    const rateEdit = makeCan(new Set<PermissionKey>(["salary.view", "salary.rate-edit"]));
    expect(resolveSalarySettingsAccess(rateEdit).canManageCompanyPayroll).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `client/`): `npx vitest run src/components/groups/group-form-empty-hints.test.ts src/components/payments/salary-settings-access.test.ts`

Expected:
- FAIL in `"the teacher link follows \`teachers.manage\` alone"`: `h.teacher.action` is `undefined`, because today both links are gated on `courses.create`.
- PASS for `"the course link follows \`courses.create\` alone"`: today `courses.create` gates both, so the course link appears; the teacher half fails only in the other test. That is fine.
- PASS for the salary pin: `main` already gates `canManageCompanyPayroll` on `salary.rate-edit` (`salary-monthly-view.tsx` passes `settingsAccess.canManageCompanyPayroll` to `SalaryAttentionCard.canEditStaffRates`). The test only pins it.

- [ ] **Step 3: Implement**

**`client/src/components/groups/group-form-empty-hints.ts`** — replace the doc comment and the function body.

old:
```ts
/**
 * When the group form's course, room or teacher list is empty — why, and
 * where to go. The link is shown only to a viewer who can actually add that
 * thing: a course or a teacher is added by CEO/director, a room also by an
 * administrator.
 */
```
new:
```ts
/**
 * When the group form's course, room or teacher list is empty — why, and
 * where to go. The link is shown only to a viewer who can actually add that
 * thing: a course needs `courses.create`, a teacher `teachers.manage`
 * (separate capabilities, ADR-0086); a room is added by an administrator too.
 */
```

old:
```ts
  const managesStructure = can("courses.create");
  return {
    course: managesStructure
      ? {
```
new:
```ts
  return {
    course: can("courses.create")
      ? {
```

old:
```ts
    teacher: managesStructure
      ? {
```
new:
```ts
    teacher: can("teachers.manage")
      ? {
```

**`client/src/components/payments/salary-client.tsx`**

old:
```tsx
  // An advance is an expense: `POST/PATCH/DELETE /expenses` check `expenses.manage` (spec §2).
  const canAdvance = useCan("expenses.manage");
```
new:
```tsx
  // An advance is written only with `salary.pay` (CEO 11.10, ADR-0086): `POST/PATCH/DELETE
  // /expenses` let a TEACHER_ADVANCE through for it and refuse `expenses.manage` alone.
  const canAdvance = useCan("salary.pay");
```
`canAdvance` already feeds the header button, `<SalaryAdvancesTab canPay={canAdvance} />` and the `SalaryAdvanceDialog` mount, so this one line moves all three. The `/payments/expenses` form offers no `TEACHER_ADVANCE` category (`expenses-filter-bar.tsx:12`), so nothing else writes an advance.

**`client/src/components/students/contracts/student-contracts-tab.tsx`**

old:
```tsx
  const canManage = useCan("students.manage");
```
new:
```tsx
  // `contracts.manage` is what the four contract writes check (ADR-0086); reads stay on `students.details`.
  const canManage = useCan("contracts.manage");
```

**`client/src/components/students/contracts/contract-card.tsx`**

old:
```tsx
  /** `students.manage`: edit, sign and cancel. Without it the card only prints. */
```
new:
```tsx
  /** `contracts.manage`: edit, sign and cancel. Without it the card only prints. */
```

Before moving on, grep the staff-rate gate once more:
```bash
cd client && grep -rn "salary.close" src --include='*.ts' --include='*.tsx'
```
Expected hits: `salary-client.tsx` (`canClose`), the `canClose` doc comments in `salary-monthly-view.tsx` and `salary/salary-summary-card.tsx` (all of them the bulk settle), and `permission-keys.ts`. If any other hit gates a staff-rate element, change it to `can("salary.rate-edit")` the same way and add it to this commit.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `client/`): `npx vitest run src/components/groups src/components/payments/salary-settings-access.test.ts src/lib/permission-keys.test.ts`

Expected: all green.

- [ ] **Step 5: Lint, type-check** (no Prettier on `client/`)

Run (from `client/`):
```bash
npx tsc --noEmit
npx eslint src/components/payments/salary-client.tsx src/components/students/contracts/student-contracts-tab.tsx src/components/students/contracts/contract-card.tsx src/components/groups/group-form-empty-hints.ts src/components/groups/group-form-empty-hints.test.ts src/components/payments/salary-settings-access.test.ts
```
Expected: no errors. `tsc` fails on `useCan("contracts.manage")` only if Task 1 is missing. In that case stop: Task 1 must land first.

Manual check: none needed. Default roles see the same buttons as before, because `salary.pay` = `expenses.manage` = D, and `contracts.manage` = `students.manage` = D + A.

- [ ] **Step 6: Commit**

From the worktree root:
```bash
git add client/src/components/payments/salary-client.tsx \
  client/src/components/students/contracts/student-contracts-tab.tsx \
  client/src/components/students/contracts/contract-card.tsx \
  client/src/components/groups/group-form-empty-hints.ts \
  client/src/components/groups/group-form-empty-hints.test.ts \
  client/src/components/payments/salary-settings-access.test.ts
git commit -m "fix(client): advance, contract and group-hint buttons follow their own capabilities" \
  -m "«Avans berish» follows salary.pay (CEO 11.10), the contract buttons follow contracts.manage, and the group form's course and teacher links follow courses.create and teachers.manage. A test pins the staff-rate rows on salary.rate-edit. No default role sees a change (ADR-0086)." \
  -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```
(Replace `<model>` with the executing model's name.)

---

### Task 8: Client data layer, CEO-only settings entry, breadcrumb

**Files:**
- Create: `client/src/components/settings/permissions/permissions-types.ts` (response shapes)
- Create: `client/src/hooks/use-role-permissions.ts` (queries and mutations)
- Modify: `client/src/lib/settings-nav.ts` (`ceoOnly` items, `isCeo` parameter, «Ruxsatlar» entry)
- Modify: `client/src/components/settings/settings-layout-shell.tsx`, `client/src/components/settings/settings-menu.tsx` (pass `isCeo`)
- Modify: `client/src/hooks/use-auth.ts` (`isCeoUser`)
- Modify: `client/src/lib/breadcrumb-routes.ts` (`permissions: "Ruxsatlar"`)
- Test: `client/src/lib/settings-nav.test.ts`

**Interfaces:**
- Consumes:
  - Task 5 (server): `GET /permissions` → `PermissionsOverview`; `PUT /permissions/roles/:roleId` `{ changes }` → `RoleKeys`; `POST /permissions/roles/:roleId/reset` → `RoleKeys`; `GET /permissions/history?page&pageSize` → `PermissionHistoryPage`. All four are `@CeoOnly()`. The shapes come from `server/src/common/permissions/role-permissions.types.ts`.
  - Existing: `usePermissions.getState().refresh(): Promise<void>` (`@/hooks/use-permissions`); `getErrorMessage(err: unknown, fallback: string): string` (`@/lib/get-error-message`); `api` (`@/lib/api`); `canForRoles` (`@/test-support/server-catalog`).
- Produces:
```ts
// client/src/components/settings/permissions/permissions-types.ts
export interface CatalogEntry { key: PermissionKey; section: string; label: string; requires: PermissionKey[]; defaultRoles: number[]; allowedRoles: number[]; lockReasons: Partial<Record<number, string>>; danger: "money" | "irreversible" | null }
export interface PermissionsOverview { sections: { key: string; label: string }[]; roles: { id: number; label: string }[]; catalog: CatalogEntry[]; granted: Record<number, PermissionKey[]> }
export interface RoleKeys { roleId: number; granted: PermissionKey[] }
export interface PermissionHistoryItem { id: string; createdAt: string; roleId: number; changedBy: { id: number; firstName: string; lastName: string } | null; changes: { key: string; granted: boolean }[] }
export interface PermissionHistoryPage { data: PermissionHistoryItem[]; total: number; page: number; pageSize: number }
export interface RolePermissionChange { key: PermissionKey; granted: boolean }
// client/src/hooks/use-role-permissions.ts
export const ROLE_PERMISSIONS_KEY = ["permissions", "overview"] as const;
export const ROLE_PERMISSIONS_HISTORY_KEY = ["permissions", "history"] as const;
export const HISTORY_PAGE_SIZE = 20;
export function useRolePermissions(): UseQueryResult<PermissionsOverview>;
export function useRolePermissionsHistory(page: number): UseQueryResult<PermissionHistoryPage>;
export function useSaveRolePermissions(): UseMutationResult<RoleKeys, unknown, { roleId: number; changes: RolePermissionChange[] }>;
export function useResetRolePermissions(): UseMutationResult<RoleKeys, unknown, { roleId: number }>;
//   onSuccess (awaited): invalidate both keys (active queries refetch), then void usePermissions.getState().refresh().
//   onError: toast.error(getErrorMessage(e, "Saqlab bo'lmadi")). No success toast here: Tasks 10/11 own it.
// client/src/hooks/use-auth.ts
export function isCeoUser(user: AuthUser | null): boolean;
// client/src/lib/settings-nav.ts
interface SettingsNavItem { …; ceoOnly?: true }
export function getVisibleSettingsSections(can: Can, isCeo = false): SettingsNavSection[];
export function canOpenSettingsPath(pathname: string, can: Can, isCeo = false): boolean;
```

Role ids are plain `number` on the client, because JSON object keys arrive as strings and the client has no `StaffRoleId` type. `section` is a `string` for the same reason. `RolePermissionChange` is a small addition so Tasks 9 and 10 name one type.

- [ ] **Step 1: Write the failing tests**

In `client/src/lib/settings-nav.test.ts`:

1. Replace the import block:

old:
```ts
import { describe, expect, it } from "vitest";
import {
  canOpenEmployeeSettings,
  canOpenSettingsPath,
  getVisibleSettingsSections,
  settingsNavSections,
} from "./settings-nav";
import { canForRoles } from "@/test-support/server-catalog";
```
new:
```ts
import { describe, expect, it } from "vitest";
import {
  canOpenEmployeeSettings,
  canOpenSettingsPath,
  getVisibleSettingsSections,
  settingsNavSections,
} from "./settings-nav";
import { makeCan } from "./permission-check";
import { PERMISSION_KEYS } from "./permission-keys";
import { canForRoles } from "@/test-support/server-catalog";
```

2. Replace the CEO count test:

old:
```ts
  it("CEO hamma 12 ta punktni ikki bo'limda ko'radi", () => {
    const sections = getVisibleSettingsSections(canForRoles([CEO]));
    expect(sections.map((section) => section.title)).toEqual(["Administratsiya", "CEO"]);
    expect(sections.flatMap((section) => section.items)).toHaveLength(12);
  });
```
new:
```ts
  it("the CEO sees all 13 items in two sections", () => {
    const sections = getVisibleSettingsSections(canForRoles([CEO]), true);
    expect(sections.map((section) => section.title)).toEqual(["Administratsiya", "CEO"]);
    expect(sections.flatMap((section) => section.items)).toHaveLength(13);
  });
```

3. Append this `describe` after `describe("canOpenSettingsPath — …")` and before `describe("settingsNavSections", …)`:
```ts
describe("«Ruxsatlar» — the CEO's page, never a capability (ADR-0086)", () => {
  const PATH = "/settings/permissions";
  const everyKey = makeCan(new Set(PERMISSION_KEYS));
  const urls = (sections: ReturnType<typeof getVisibleSettingsSections>) =>
    sections.flatMap((section) => section.items.map((item) => item.url));

  it("the CEO sees it in the «CEO» section", () => {
    const ceo = getVisibleSettingsSections(canForRoles([CEO]), true).find((s) => s.title === "CEO");
    expect(ceo?.items.map((item) => item.url)).toContain(PATH);
  });

  it("no other role sees it, not even one holding every capability", () => {
    for (const roleIds of [[BRANCH_DIRECTOR], [ADMINISTRATOR], [CASHIER], [TEACHER], []]) {
      expect(urls(getVisibleSettingsSections(canForRoles(roleIds), false))).not.toContain(PATH);
    }
    expect(urls(getVisibleSettingsSections(everyKey))).not.toContain(PATH);
  });

  it("the URL opens only for the CEO; capabilities do not open it", () => {
    expect(canOpenSettingsPath(PATH, everyKey, false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([BRANCH_DIRECTOR]), false)).toBe(false);
    expect(canOpenSettingsPath(PATH, canForRoles([CEO]), true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `client/`): `npx vitest run src/lib/settings-nav.test.ts`

Expected: FAIL in three tests.
- `"the CEO sees all 13 items in two sections"`: it gets 12 items, because the entry does not exist yet.
- `"the CEO sees it in the «CEO» section"`: the URL list does not contain `/settings/permissions`.
- `"the URL opens only for the CEO; …"`: a path no entry owns reads as open, so the first `expect` gets `true`.

`"no other role sees it, …"` passes already, because nobody sees a missing entry.

- [ ] **Step 3: Implement**

**Create `client/src/components/settings/permissions/permissions-types.ts`:**
```ts
import type { PermissionKey } from "@/lib/permission-keys";

/**
 * The CEO's «Ruxsatlar» API (`@CeoOnly()`, ADR-0086). Mirrors
 * `server/src/common/permissions/role-permissions.types.ts`. Role ids are
 * plain numbers here (2 Filial direktori, 3 Administrator, 5 Kassir,
 * 4 O'qituvchi): JSON object keys arrive as strings anyway.
 */
export interface CatalogEntry {
  key: PermissionKey;
  section: string;
  /** What the CEO reads on the page (Uzbek). */
  label: string;
  requires: PermissionKey[];
  defaultRoles: number[];
  /** Roles the capability may be given to; every other editable role is locked. */
  allowedRoles: number[];
  /** A locked role → why (Uzbek, shown next to the lock). */
  lockReasons: Partial<Record<number, string>>;
  /** Moves money or cannot be undone — the red mark. */
  danger: "money" | "irreversible" | null;
}

/** `GET /permissions`. `catalog` is in the server's key order; `roles` in column order. */
export interface PermissionsOverview {
  sections: { key: string; label: string }[];
  roles: { id: number; label: string }[];
  catalog: CatalogEntry[];
  /** Each editable role's effective keys today (defaults + the CEO's changes), sorted. */
  granted: Record<number, PermissionKey[]>;
}

/** `PUT /permissions/roles/:roleId` and `POST …/reset`: the role's keys after the write. */
export interface RoleKeys {
  roleId: number;
  granted: PermissionKey[];
}

/** One item of `PUT /permissions/roles/:roleId`'s `changes`. */
export interface RolePermissionChange {
  key: PermissionKey;
  granted: boolean;
}

export interface PermissionHistoryItem {
  id: string;
  createdAt: string;
  roleId: number;
  changedBy: { id: number; firstName: string; lastName: string } | null;
  /** A string, not `PermissionKey`: a row may name a capability removed since. */
  changes: { key: string; granted: boolean }[];
}

/** `GET /permissions/history`, newest first. */
export interface PermissionHistoryPage {
  data: PermissionHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
}
```

**Create `client/src/hooks/use-role-permissions.ts`:**
```ts
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { usePermissions } from "@/hooks/use-permissions";
import type {
  PermissionHistoryPage,
  PermissionsOverview,
  RoleKeys,
  RolePermissionChange,
} from "@/components/settings/permissions/permissions-types";

/** The «Ruxsatlar» page's data (ADR-0086). Every route is CEO-only on the server. */
export const ROLE_PERMISSIONS_KEY = ["permissions", "overview"] as const;
export const ROLE_PERMISSIONS_HISTORY_KEY = ["permissions", "history"] as const;
export const HISTORY_PAGE_SIZE = 20;

/** `GET /permissions` — the catalog, the locks and each role's keys. */
export function useRolePermissions() {
  return useQuery({
    queryKey: ROLE_PERMISSIONS_KEY,
    queryFn: () => api.get<PermissionsOverview>("/permissions").then((r) => r.data),
  });
}

/** `GET /permissions/history` — 20 per page; the previous page stays on screen while the next loads. */
export function useRolePermissionsHistory(page: number) {
  return useQuery({
    queryKey: [...ROLE_PERMISSIONS_HISTORY_KEY, page],
    queryFn: () =>
      api
        .get<PermissionHistoryPage>("/permissions/history", {
          params: { page, pageSize: HISTORY_PAGE_SIZE },
        })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
  });
}

/**
 * After a save or a reset: the table and the history read again (awaited, so
 * `isPending` lasts until the switches show the server's answer — no
 * optimistic update), then the signed-in user's own list.
 */
function useAfterWrite() {
  const queryClient = useQueryClient();
  return {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ROLE_PERMISSIONS_KEY }),
        queryClient.invalidateQueries({ queryKey: ROLE_PERMISSIONS_HISTORY_KEY }),
      ]);
      void usePermissions.getState().refresh();
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Saqlab bo'lmadi"));
    },
  };
}

/** `PUT /permissions/roles/:roleId` — the confirmed toggle with its dependencies. */
export function useSaveRolePermissions() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: ({ roleId, changes }: { roleId: number; changes: RolePermissionChange[] }) =>
      api.put<RoleKeys>(`/permissions/roles/${roleId}`, { changes }).then((r) => r.data),
    ...after,
  });
}

/** `POST /permissions/roles/:roleId/reset` — back to the catalog default. */
export function useResetRolePermissions() {
  const after = useAfterWrite();
  return useMutation({
    mutationFn: ({ roleId }: { roleId: number }) =>
      api.post<RoleKeys>(`/permissions/roles/${roleId}/reset`).then((r) => r.data),
    ...after,
  });
}
```

**`client/src/hooks/use-auth.ts`** — insert directly after the `AuthUser` interface (before `interface AuthState {`):

old:
```ts
  company: UserCompany;
  studentId?: number;
}

interface AuthState {
```
new:
```ts
  company: UserCompany;
  studentId?: number;
}

/**
 * Is this the CEO? An identity, never a capability: only the CEO opens the
 * «Ruxsatlar» page and its API (`@CeoOnly()`, ADR-0086).
 */
export function isCeoUser(user: AuthUser | null): boolean {
  return user?.roles.some((r) => r.id === 1) ?? false;
}

interface AuthState {
```
(The seven existing `roles.some((r) => r.id === 1)` copies in `components/` stay as they are. Moving them is out of scope.)

**`client/src/lib/settings-nav.ts`**

Imports — old:
```ts
  Send,
  Wallet,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
```
new:
```ts
  Send,
  Wallet,
  Smartphone,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
```

Item type — old:
```ts
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
}
```
new:
```ts
  /** Shown to users who hold this capability. Omit to show to all. */
  permission?: PermissionKey;
  /**
   * Only the CEO sees and opens it — an identity, never a capability (the
   * API is `@CeoOnly()`, ADR-0086). Such an item has no `permission`.
   */
  ceoOnly?: true;
}
```

Entry — old (the last item of the «CEO» section):
```ts
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        permission: "settings.payment",
      },
    ],
  },
];
```
new:
```ts
        title: "To'lov",
        url: "/settings/payment",
        icon: Wallet,
        description: "Kurs to'lov modeli va hisob-kitob qoidalari",
        permission: "settings.payment",
      },
      {
        title: "Ruxsatlar",
        url: "/settings/permissions",
        icon: ShieldCheck,
        description: "Har bir rol uchun imkoniyatlarni yoqish va o'chirish",
        ceoOnly: true,
      },
    ],
  },
];

/** One rule for the list and the URL: a CEO-only item for the CEO, else its capability. */
function isVisible(item: SettingsNavItem, can: Can, isCeo: boolean): boolean {
  if (item.ceoOnly) return isCeo;
  return !item.permission || can(item.permission);
}
```

The two functions — old:
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
```
new:
```ts
/** Sections of /settings this user sees; a section with nothing visible is dropped. */
export function getVisibleSettingsSections(can: Can, isCeo = false): SettingsNavSection[] {
  return settingsNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isVisible(item, can, isCeo)),
    }))
    .filter((section) => section.items.length > 0);
}

/**
 * May the user open a /settings page or a page under it: the entry's gate.
 * SettingsLayoutShell sends anyone else back. A path no entry owns is open.
 */
export function canOpenSettingsPath(pathname: string, can: Can, isCeo = false): boolean {
  const item = settingsNavSections
    .flatMap((section) => section.items)
    .find((entry) => pathname === entry.url || pathname.startsWith(`${entry.url}/`));
  return !item || isVisible(item, can, isCeo);
}
```
`SETTINGS_PERMISSIONS` stays unchanged. The new item has no `permission`, so the sidebar gate is the same, and the CEO holds every key anyway.

**`client/src/components/settings/settings-layout-shell.tsx`**

old:
```tsx
import { useAuth } from "@/hooks/use-auth";
```
new:
```tsx
import { isCeoUser, useAuth } from "@/hooks/use-auth";
```
old:
```tsx
  const redirectTo =
    !user || !ready
      ? null
      : getVisibleSettingsSections(can).length === 0
        ? "/"
        : canOpenSettingsPath(pathname, can)
          ? null
          : "/settings";
```
new:
```tsx
  const isCeo = isCeoUser(user);
  const redirectTo =
    !user || !ready
      ? null
      : getVisibleSettingsSections(can, isCeo).length === 0
        ? "/"
        : canOpenSettingsPath(pathname, can, isCeo)
          ? null
          : "/settings";
```

**`client/src/components/settings/settings-menu.tsx`**

old:
```tsx
import { useAuth } from "@/hooks/use-auth";
```
new:
```tsx
import { isCeoUser, useAuth } from "@/hooks/use-auth";
```
old:
```tsx
  const sections = getVisibleSettingsSections(can);
```
new:
```tsx
  const sections = getVisibleSettingsSections(can, isCeoUser(user));
```

**`client/src/lib/breadcrumb-routes.ts`**

old:
```ts
  "absence-pause": "Avtomatik pauza",
```
new:
```ts
  "absence-pause": "Avtomatik pauza",
  // /settings/permissions — «Ruxsatlar», CEO only (ADR-0086).
  permissions: "Ruxsatlar",
```

Between this commit and Task 10, the entry links to a page that does not exist yet (404, CEO only). That is acceptable inside the branch.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `client/`): `npx vitest run src/lib/settings-nav.test.ts src/lib/nav-items.test.ts src/qollanma/reyestr.test.ts src/lib/uzbek-only-texts.test.ts`

Expected: all green. `reyestr.test.ts` reads `routeLabels`; no guide page uses the slug `permissions`.

- [ ] **Step 5: Lint, type-check** (no Prettier on `client/`)

Run (from `client/`):
```bash
npx tsc --noEmit
npx eslint src/components/settings/permissions/permissions-types.ts src/hooks/use-role-permissions.ts src/lib/settings-nav.ts src/lib/settings-nav.test.ts src/components/settings/settings-layout-shell.tsx src/components/settings/settings-menu.tsx src/hooks/use-auth.ts src/lib/breadcrumb-routes.ts
```
Expected: no errors.

- [ ] **Step 6: Commit**

From the worktree root:
```bash
git add client/src/components/settings/permissions/permissions-types.ts \
  client/src/hooks/use-role-permissions.ts \
  client/src/lib/settings-nav.ts client/src/lib/settings-nav.test.ts \
  client/src/components/settings/settings-layout-shell.tsx \
  client/src/components/settings/settings-menu.tsx \
  client/src/hooks/use-auth.ts client/src/lib/breadcrumb-routes.ts
git commit -m "feat(settings): CEO-only «Ruxsatlar» entry and the page's data hooks" \
  -m "settings-nav items can be ceoOnly (an identity, never a capability), shown and opened only when isCeoUser(user). The React Query hooks read /permissions and its history, and save or reset a role, refetching before they settle (ADR-0086)." \
  -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 9: Page view model (pure, tested)

**Files:**
- Create: `client/src/components/settings/permissions/permissions-model.ts`
- Test: `client/src/components/settings/permissions/permissions-model.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `client/src/lib/permission-deps.ts` → `type DepGraph`, `planToggle(current: ReadonlySet<string>, key: string, on: boolean, graph: DepGraph): { next: Set<string>; also: string[] }` (`also` sorted, without `key`, only keys whose state changes).
  - Task 8: `PermissionsOverview`, `CatalogEntry`, `PermissionHistoryItem`, `RolePermissionChange` from `./permissions-types`.
  - Task 1: the split server catalog through `loadServerCatalog()` (`@/test-support/server-catalog`). At runtime its result holds every export of `permission-catalog.ts`: `PERMISSIONS` (each def with `allowedRoles`, `lockReasons`), `PERMISSION_SECTIONS`, `PERMISSION_KEYS`, `defaultKeysForRoles`. The test reads them through a local cast, so the `ServerCatalog` interface does not need to grow.
- Produces:
```ts
export function depGraph(o: PermissionsOverview): DepGraph;
export interface CellState { granted: boolean; locked: boolean; lockReason: string | null; differs: boolean; danger: "money" | "irreversible" | null }
export function cellState(o: PermissionsOverview, key: PermissionKey, roleId: number): CellState;
export function sectionCount(o: PermissionsOverview, section: string, roleId: number): { on: number; total: number };
export function sectionCountLabel(c: { on: number; total: number }): string;            // "5 tadan 3 tasi"; "—" when total is 0
export interface ConfirmPlan { roleId: number; key: PermissionKey; on: boolean; also: PermissionKey[]; changes: RolePermissionChange[]; danger: boolean }
export function planCellToggle(o: PermissionsOverview, roleId: number, key: PermissionKey, on: boolean): ConfirmPlan;
export interface ConfirmCopy { title: string; alsoTitle: "Birga yoqiladi" | "Birga o'chadi" | null; alsoLabels: string[]; warning: string | null; confirm: string }
export function confirmCopy(o: PermissionsOverview, plan: ConfirmPlan): ConfirmCopy;
export function resetCopy(o: PermissionsOverview, roleId: number): { title: string; lines: string[] };
export function historyLine(o: PermissionsOverview, item: PermissionHistoryItem): string;
export const DANGER_WARNING: string;
```
`changes` is `RolePermissionChange[]`, the same as `{ key: PermissionKey; granted: boolean }[]`. `confirm` is typed `string` ("Yoqish" | "O'chirish"; Task 11 may reuse the dialog for reset with its own label).

Semantics, as tested:
- `cellState`:
  - `locked` = role ∉ `allowedRoles`;
  - `lockReason` only when locked;
  - `differs` = granted ≠ (role ∈ `defaultRoles`), which drives the yellow dot;
  - `danger` = the entry's mark.
- `sectionCount.total` counts the section's keys not locked for the role; `on` counts those of them that are granted.
- `sectionCountLabel` prints «—» for a section whose keys are all locked for the role (`total` 0: the Teacher in 12 of 14 sections), never «0 tadan 0 tasi».
- `planCellToggle`:
  - `changes` = `[key, ...also]`, each with `granted: on`;
  - `danger` = `on` AND some key of the plan has a danger mark. This is a deviation; see the notes.
- `confirmCopy.alsoLabels` follows catalog order, not alphabetical.
- `resetCopy.lines`: for every key where the role differs from the default, in catalog order, «{label}» yoqiladi / «{label}» o'chadi.
- `historyLine`: «{roleLabel}: «A» yoqildi, «B» o'chirildi». A key unknown to the catalog reads «o'chirilgan imkoniyat yoqildi».

- [ ] **Step 1: Write the failing tests**

Create `client/src/components/settings/permissions/permissions-model.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import { loadServerCatalog } from "@/test-support/server-catalog";
import {
  DANGER_WARNING,
  cellState,
  confirmCopy,
  depGraph,
  historyLine,
  planCellToggle,
  resetCopy,
  sectionCount,
  sectionCountLabel,
} from "./permissions-model";
import type { PermissionsOverview } from "./permissions-types";

const D = 2;
const A = 3;
const T = 4;
const K = 5;

interface ServerDef {
  section: string;
  label: string;
  requires: readonly string[];
  defaultRoles: readonly number[];
  allowedRoles: readonly number[];
  lockReasons: Readonly<Partial<Record<number, string>>>;
  danger?: "money" | "irreversible";
}

// The loader returns every export of the server's permission-catalog.ts.
const server = loadServerCatalog() as unknown as {
  PERMISSION_KEYS: PermissionKey[];
  PERMISSIONS: Record<string, ServerDef>;
  PERMISSION_SECTIONS: readonly { key: string; label: string }[];
  defaultKeysForRoles: (roleIds: readonly number[]) => Set<string>;
};

const defaults = (roleId: number): string[] => [...server.defaultKeysForRoles([roleId])];

/** `GET /permissions` as the server answers it: the real catalog; defaults unless `granted` says otherwise. */
function overview(granted: Partial<Record<number, string[]>> = {}): PermissionsOverview {
  return {
    sections: server.PERMISSION_SECTIONS.map(({ key, label }) => ({ key, label })),
    roles: [
      { id: D, label: "Filial direktori" },
      { id: A, label: "Administrator" },
      { id: K, label: "Kassir" },
      { id: T, label: "O'qituvchi" },
    ],
    catalog: server.PERMISSION_KEYS.map((key) => {
      const d = server.PERMISSIONS[key];
      return {
        key,
        section: d.section,
        label: d.label,
        requires: [...d.requires] as PermissionKey[],
        defaultRoles: [...d.defaultRoles],
        allowedRoles: [...d.allowedRoles],
        lockReasons: { ...d.lockReasons },
        danger: d.danger ?? null,
      };
    }),
    granted: Object.fromEntries(
      [D, A, K, T].map((r) => [r, [...(granted[r] ?? defaults(r))].sort() as PermissionKey[]]),
    ),
  };
}

const LABEL = (key: string) => server.PERMISSIONS[key].label;

describe("depGraph", () => {
  it("has every catalog key with its requirements", () => {
    const g = depGraph(overview());
    expect(Object.keys(g)).toHaveLength(server.PERMISSION_KEYS.length);
    expect(g["refunds.cancel"].requires).toEqual(["refunds.create"]);
  });
});

describe("cellState", () => {
  it("an allowed cell at its default: no lock, no dot", () => {
    expect(cellState(overview(), "students.profile", K)).toEqual({
      granted: true,
      locked: false,
      lockReason: null,
      differs: false,
      danger: null,
    });
  });

  it("a teacher's locked cell carries the reason the page shows", () => {
    expect(cellState(overview(), "students.list", T)).toEqual({
      granted: false,
      locked: true,
      lockReason: "o'qituvchi faqat o'z guruhlarini ko'radi",
      differs: false,
      danger: null,
    });
  });

  it("a CEO-only key is locked for every role and keeps its red mark", () => {
    for (const roleId of [D, A, K, T]) {
      expect(cellState(overview(), "salary.close", roleId)).toMatchObject({
        locked: true,
        lockReason: "butun kompaniyaga ta'sir qiladi",
        danger: "money",
      });
    }
  });

  it("yellow dot: a grant beyond the default and a revoked default both differ", () => {
    const o = overview({
      [K]: [...defaults(K), "students.details"],
      [A]: defaults(A).filter((k) => k !== "students.sms"),
    });
    expect(cellState(o, "students.details", K)).toMatchObject({ granted: true, differs: true });
    expect(cellState(o, "students.sms", A)).toMatchObject({ granted: false, differs: true });
    expect(cellState(o, "students.list", A)).toMatchObject({ granted: true, differs: false });
  });
});

describe("sectionCount", () => {
  it("counts only the cells the role may hold", () => {
    const o = overview();
    // salary.view, salary.rate, salary.pay open for D; rate-edit and close are CEO-only.
    expect(sectionCount(o, "salary", D)).toEqual({ on: 3, total: 3 });
    // K: salary.view and salary.pay open, none held by default.
    expect(sectionCount(o, "salary", K)).toEqual({ on: 0, total: 2 });
    // The teacher holds nothing in «O'quvchilar»: every cell is locked.
    expect(sectionCount(o, "students", T)).toEqual({ on: 0, total: 0 });
    // A: all 8 student keys open; 7 by default (not students.initial-balance).
    expect(sectionCount(o, "students", A)).toEqual({ on: 7, total: 8 });
  });

  it("follows the CEO's changes", () => {
    const o = overview({ [A]: defaults(A).filter((k) => k !== "students.sms") });
    expect(sectionCount(o, "students", A)).toEqual({ on: 6, total: 8 });
  });

  it("reads «N tadan M tasi»", () => {
    expect(sectionCountLabel({ on: 3, total: 5 })).toBe("5 tadan 3 tasi");
  });

  it("shows «—» for a section whose keys are all locked for the role", () => {
    expect(sectionCountLabel(sectionCount(overview(), "students", T))).toBe("—");
    expect(sectionCountLabel({ on: 0, total: 0 })).toBe("—");
    expect(sectionCountLabel({ on: 0, total: 2 })).toBe("2 tadan 0 tasi");
  });
});

describe("planCellToggle and confirmCopy", () => {
  it("turning on brings the requirement, lists it and warns about money", () => {
    const o = overview();
    const plan = planCellToggle(o, K, "refunds.cancel", true);
    expect(plan).toEqual({
      roleId: K,
      key: "refunds.cancel",
      on: true,
      also: ["refunds.create"],
      changes: [
        { key: "refunds.cancel", granted: true },
        { key: "refunds.create", granted: true },
      ],
      danger: true,
    });
    expect(confirmCopy(o, plan)).toEqual({
      title: "Kassir: «Pul qaytarish so'rovini bekor qilish» yoqilsinmi?",
      alsoTitle: "Birga yoqiladi",
      alsoLabels: ["O'quvchiga pul qaytarish"],
      warning: DANGER_WARNING,
      confirm: "Yoqish",
    });
  });

  it("turning off takes the dependents and does not warn", () => {
    const o = overview();
    const plan = planCellToggle(o, D, "lessons.change", false);
    expect(plan.also).toEqual(["lessons.change-delete"]);
    expect(plan.changes).toEqual([
      { key: "lessons.change", granted: false },
      { key: "lessons.change-delete", granted: false },
    ]);
    expect(plan.danger).toBe(false);
    expect(confirmCopy(o, plan)).toEqual({
      title:
        "Filial direktori: «Darsni bekor qilish, ko'chirish va o'rinbosar ustoz qo'yish» o'chirilsinmi?",
      alsoTitle: "Birga o'chadi",
      alsoLabels: ["Bekor qilish, ko'chirish va o'rinbosarni o'chirish"],
      warning: null,
      confirm: "O'chirish",
    });
  });

  it("turning off reaches dependents of dependents, listed in catalog order", () => {
    const o = overview();
    const plan = planCellToggle(o, A, "students.profile", false);
    expect(plan.also).toContain("students.details");
    expect(plan.also).toContain("students.sms"); // through students.details
    expect(plan.also).not.toContain("students.profile");
    expect(confirmCopy(o, plan).alsoLabels[0]).toBe(LABEL("students.details"));
  });

  it("a money capability with nothing to bring: no list, still the warning", () => {
    const o = overview();
    const plan = planCellToggle(o, K, "balance.withdraw", true);
    expect(plan.also).toEqual([]);
    expect(confirmCopy(o, plan)).toMatchObject({ alsoTitle: null, alsoLabels: [], warning: DANGER_WARNING });
  });

  it("an already-on key changes only itself", () => {
    const plan = planCellToggle(overview(), D, "students.list", true);
    expect(plan.also).toEqual([]);
    expect(plan.changes).toEqual([{ key: "students.list", granted: true }]);
  });
});

describe("resetCopy", () => {
  it("a role at its default has nothing to change", () => {
    expect(resetCopy(overview(), D)).toEqual({
      title: "Filial direktori: boshlang'ich holatga qaytarilsinmi?",
      lines: [],
    });
  });

  it("lists what comes back on and what goes off, in catalog order", () => {
    const o = overview({
      [A]: [...defaults(A).filter((k) => k !== "students.sms"), "students.initial-balance"],
    });
    expect(resetCopy(o, A)).toEqual({
      title: "Administrator: boshlang'ich holatga qaytarilsinmi?",
      lines: ["«O'quvchiga SMS yuborish» yoqiladi", "«Boshlang'ich balans kiritish» o'chadi"],
    });
  });
});

describe("historyLine", () => {
  const item = (roleId: number, changes: { key: string; granted: boolean }[]) => ({
    id: "h1",
    createdAt: "2026-10-12T09:00:00.000Z",
    roleId,
    changedBy: null,
    changes,
  });

  it("names the role and every change", () => {
    expect(
      historyLine(
        overview(),
        item(A, [
          { key: "students.sms", granted: false },
          { key: "students.initial-balance", granted: true },
        ]),
      ),
    ).toBe("Administrator: «O'quvchiga SMS yuborish» o'chirildi, «Boshlang'ich balans kiritish» yoqildi");
  });

  it("a key the catalog no longer has", () => {
    expect(historyLine(overview(), item(K, [{ key: "old.removed-key", granted: true }]))).toBe(
      "Kassir: o'chirilgan imkoniyat yoqildi",
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run (from `client/`): `npx vitest run src/components/settings/permissions/permissions-model.test.ts`

Expected: FAIL. The suite cannot import `./permissions-model`, because the file does not exist yet. If it instead fails on `server.PERMISSIONS[key]` being undefined, or on `allowedRoles` being missing, Task 1 has not landed. Stop and finish Task 1 first.

- [ ] **Step 3: Implement**

Create `client/src/components/settings/permissions/permissions-model.ts`:
```ts
import { planToggle, type DepGraph } from "@/lib/permission-deps";
import type { PermissionKey } from "@/lib/permission-keys";
import type {
  CatalogEntry,
  PermissionHistoryItem,
  PermissionsOverview,
  RolePermissionChange,
} from "./permissions-types";

/**
 * Everything the «Ruxsatlar» page decides, as pure functions over
 * `GET /permissions` (spec §8, ADR-0086). The components only draw these,
 * so the tests here cover what the CEO reads: locks, dots, counts and the
 * confirm text.
 */

export const DANGER_WARNING =
  "Bu amal pulni o'zgartiradi yoki uni qaytarib bo'lmaydi. Ishonchingiz komilmi?";

export function depGraph(o: PermissionsOverview): DepGraph {
  return Object.fromEntries(o.catalog.map((e) => [e.key, { requires: e.requires }]));
}

function entryOf(o: PermissionsOverview, key: PermissionKey): CatalogEntry {
  const entry = o.catalog.find((e) => e.key === key);
  if (!entry) throw new Error(`permissions-model: "${key}" is not in the catalog`);
  return entry;
}

function roleLabel(o: PermissionsOverview, roleId: number): string {
  return o.roles.find((r) => r.id === roleId)?.label ?? `Rol ${roleId}`;
}

function heldBy(o: PermissionsOverview, roleId: number): Set<string> {
  return new Set(o.granted[roleId] ?? []);
}

export interface CellState {
  granted: boolean;
  locked: boolean;
  lockReason: string | null;
  /** The yellow dot: differs from the catalog default. */
  differs: boolean;
  /** The red mark. */
  danger: "money" | "irreversible" | null;
}

export function cellState(o: PermissionsOverview, key: PermissionKey, roleId: number): CellState {
  const entry = entryOf(o, key);
  const granted = heldBy(o, roleId).has(key);
  const locked = !entry.allowedRoles.includes(roleId);
  return {
    granted,
    locked,
    lockReason: locked ? (entry.lockReasons[roleId] ?? null) : null,
    differs: granted !== entry.defaultRoles.includes(roleId),
    danger: entry.danger,
  };
}

/** «N tadan M tasi»: N counts only the cells the role may hold (locked ones are not offered). */
export function sectionCount(
  o: PermissionsOverview,
  section: string,
  roleId: number,
): { on: number; total: number } {
  const open = o.catalog.filter((e) => e.section === section && e.allowedRoles.includes(roleId));
  const held = heldBy(o, roleId);
  return { on: open.filter((e) => held.has(e.key)).length, total: open.length };
}

/** «—» when every key of the section is locked for the role: nothing to count. */
export function sectionCountLabel(c: { on: number; total: number }): string {
  if (c.total === 0) return "—";
  return `${c.total} tadan ${c.on} tasi`;
}

export interface ConfirmPlan {
  roleId: number;
  key: PermissionKey;
  on: boolean;
  /** Keys that change with it (requirements on, dependents off). */
  also: PermissionKey[];
  /** The `PUT /permissions/roles/:roleId` body's `changes`. */
  changes: RolePermissionChange[];
  danger: boolean;
}

export function planCellToggle(
  o: PermissionsOverview,
  roleId: number,
  key: PermissionKey,
  on: boolean,
): ConfirmPlan {
  // The graph is the catalog, so every key planToggle returns is a PermissionKey.
  const also = planToggle(heldBy(o, roleId), key, on, depGraph(o)).also as PermissionKey[];
  const keys = [key, ...also];
  return {
    roleId,
    key,
    on,
    also,
    changes: keys.map((k) => ({ key: k, granted: on })),
    // Only granting is risky: taking a money capability away moves no money.
    danger: on && keys.some((k) => entryOf(o, k).danger !== null),
  };
}

export interface ConfirmCopy {
  title: string;
  alsoTitle: "Birga yoqiladi" | "Birga o'chadi" | null;
  alsoLabels: string[];
  warning: string | null;
  confirm: string;
}

export function confirmCopy(o: PermissionsOverview, plan: ConfirmPlan): ConfirmCopy {
  const also = new Set<string>(plan.also);
  const verb = plan.on ? "yoqilsinmi" : "o'chirilsinmi";
  return {
    title: `${roleLabel(o, plan.roleId)}: «${entryOf(o, plan.key).label}» ${verb}?`,
    alsoTitle: also.size === 0 ? null : plan.on ? "Birga yoqiladi" : "Birga o'chadi",
    alsoLabels: o.catalog.filter((e) => also.has(e.key)).map((e) => e.label),
    warning: plan.danger ? DANGER_WARNING : null,
    confirm: plan.on ? "Yoqish" : "O'chirish",
  };
}

/** «Boshlang'ich holatga qaytarish»: every cell that differs from the default, as it will become. */
export function resetCopy(o: PermissionsOverview, roleId: number): { title: string; lines: string[] } {
  const held = heldBy(o, roleId);
  return {
    title: `${roleLabel(o, roleId)}: boshlang'ich holatga qaytarilsinmi?`,
    lines: o.catalog
      .filter((e) => held.has(e.key) !== e.defaultRoles.includes(roleId))
      .map((e) => `«${e.label}» ${held.has(e.key) ? "o'chadi" : "yoqiladi"}`),
  };
}

/** One «O'zgarishlar tarixi» row's text; date and author are drawn beside it. */
export function historyLine(o: PermissionsOverview, item: PermissionHistoryItem): string {
  const parts = item.changes.map((c) => {
    const entry = o.catalog.find((e) => e.key === c.key);
    const name = entry ? `«${entry.label}»` : "o'chirilgan imkoniyat";
    return `${name} ${c.granted ? "yoqildi" : "o'chirildi"}`;
  });
  return `${roleLabel(o, item.roleId)}: ${parts.join(", ")}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `client/`): `npx vitest run src/components/settings/permissions src/lib/permission-deps.test.ts src/lib/uzbek-only-texts.test.ts`

Expected: all green.

If a count assertion in `sectionCount` fails, compare it with the binding allowedRoles table (rows 1–8 and 40–44) before changing the test. A mismatch means Task 1's data is wrong, not this test.

- [ ] **Step 5: Lint, type-check** (no Prettier on `client/`)

Run (from `client/`):
```bash
npx tsc --noEmit
npx eslint src/components/settings/permissions/permissions-model.ts src/components/settings/permissions/permissions-model.test.ts
```
Expected: no errors.

- [ ] **Step 6: Commit**

From the worktree root:
```bash
git add client/src/components/settings/permissions/permissions-model.ts \
  client/src/components/settings/permissions/permissions-model.test.ts
git commit -m "feat(settings): pure view model for the «Ruxsatlar» page" \
  -m "Cell state (lock and reason, the default-difference dot, the red mark), the section count «N tadan M tasi» («—» when every key is locked), the toggle plan with its dependencies, the confirm and reset text and the history line, tested against the server's catalog (ADR-0086, spec §12)." \
  -m "Co-Authored-By: Claude <model> <noreply@anthropic.com>"
```

---

### Task 10: The page — table, locks, yellow dot, red mark, mobile picker, confirm dialog

**Files:**
- Create: `client/src/app/(dashboard)/settings/permissions/page.tsx` (thin `Suspense` wrapper)
- Create: `client/src/components/settings/permissions/permissions-client.tsx` (header, legend, mobile role picker, table, confirm flow)
- Create: `client/src/components/settings/permissions/permissions-table.tsx` (collapsible sections, rows, cells: switch, lock + reason, yellow dot, red mark)
- Create: `client/src/components/settings/permissions/permission-confirm-dialog.tsx` (the confirmation)
- Test: none new — every decision the page shows is in `permissions-model.ts` and tested by Task 9 (`client/src/components/settings/permissions/permissions-model.test.ts`). The vitest harness is node-only and renders no component. The page itself is checked in the browser in Task 13.

**Interfaces:**
- Consumes:
  - Task 8, `client/src/hooks/use-role-permissions.ts`:
    - `useRolePermissions(): UseQueryResult<PermissionsOverview>`
    - `useSaveRolePermissions(): UseMutationResult<RoleKeys, unknown, { roleId: number; changes: { key: PermissionKey; granted: boolean }[] }>` (its `onSuccess` invalidates both query keys and refreshes `/permissions/me`; its `onError` shows the toast)
  - Task 8, `client/src/components/settings/permissions/permissions-types.ts`: `PermissionsOverview` (`sections: { key: string; label: string }[]`, `roles: { id: number; label: string }[]`, `catalog: CatalogEntry[]`, `granted: Record<number, PermissionKey[]>`), `CatalogEntry` (`key: PermissionKey`, `section`, `label`, `danger: "money" | "irreversible" | null`, …).
  - Task 9, `client/src/components/settings/permissions/permissions-model.ts`:
    - `cellState(o, key, roleId): CellState` (`{ granted, locked, lockReason: string | null, differs, danger }`)
    - `sectionCount(o, section, roleId): { on: number; total: number }`, `sectionCountLabel(c): string` («N tadan M tasi», or «—» when every key of the section is locked for the role)
    - `planCellToggle(o, roleId, key, on): ConfirmPlan` (`{ roleId, key, on, also, changes, danger }`)
    - `confirmCopy(o, plan): ConfirmCopy` (`{ title, alsoTitle: "Birga yoqiladi" | "Birga o'chadi" | null, alsoLabels: string[], warning: string | null, confirm: string }`; `confirm` is «Yoqish» or «O'chirish»)
- The dialog's confirm button is `variant="destructive"` exactly when `copy.confirm === "O'chirish"` (the word `confirmCopy` produces for turning off). Task 11's reset passes «Qaytarish» and so gets the default variant.
  - Existing: `SettingsPageHeader` (`@/components/settings/settings-page-header`), `useIsMobile` (`@/hooks/use-mobile`), shadcn `Switch`, `Collapsible*`, `Tooltip*`, `Select*`, `AlertDialog*`, `Skeleton`, `Button`; `PermissionKey` (`@/lib/permission-keys`); `cn` (`@/lib/utils`). `TooltipProvider` is already mounted globally in `src/app/layout.tsx`.
- Produces (Task 11 relies on these exact names):
  - `export default function PermissionsSettingsPage()` — `<Suspense><PermissionsClient /></Suspense>`
  - `export function PermissionsClient()`
  - `export function PermissionsTable(props: { overview: PermissionsOverview; roleIds: number[]; onToggle: (roleId: number, key: PermissionKey, on: boolean) => void; busy: boolean })`
  - `export function PermissionConfirmDialog(props: { copy: ConfirmCopy | null; open: boolean; pending: boolean; onConfirm: () => void; onOpenChange: (open: boolean) => void })`
  - The return types are left to inference: React 19's types have no global `JSX` namespace, so `JSX.Element` (the skeleton's notation) would not compile.

Layout decisions this task fixes (from the approved mockup, spec §8):
- Sections start **collapsed**, so the page opens as 14 lines, each with its count. Clicking a section header opens it.
- On a wide screen the header row is «Imkoniyat» + one column per role (Filial direktori, Administrator, Kassir, O'qituvchi, in the server's order). Each section header shows «N tadan M tasi» under every role column.
- Below `md` (`useIsMobile()`), a role `Select` sits on top and the list shows only that role. The picked role is in the URL as `?rol=<id>`; the first role is the default and is left out of the URL. The lock reason is printed under the label, because a phone has the room and no hover.
- A locked cell is a lock button. Its `Tooltip` opens on hover, on focus and on a tap. Radix closes a tooltip on click, so the button calls `preventDefault()` and opens it itself.
- The yellow dot sits right of the switch (`bg-yellow-500`), and the red mark sits after the label (`bg-red-500`). Both have a tooltip and an `aria-label`. Do not use `amber-*` or `sky-*`: `client/CLAUDE.md` notes they render transparent outside the student portal.
- Toggling never changes the switch by itself. The switch is controlled by the server's `granted`, the dialog opens, and only a confirmed save changes the data, which then comes back through the refetch. This is the skeleton's «no optimistic update»: an access setting must show what the server holds.
- The matrix has no `#` column. It is a grouped settings form, not a list of records. The history table in Task 11 has one.
- Between 768 px and about 1100 px with the sidebar open, the four role columns do not fit. The table then scrolls horizontally inside its own box (`overflow-x-auto` around a `min-w-[44rem]` grid), and the page itself never scrolls sideways.

- [ ] **Step 1: Confirm the inputs exist**

Run (from the worktree root):
```bash
grep -n "export function useRolePermissions\|export function useSaveRolePermissions" client/src/hooks/use-role-permissions.ts
grep -n "export function cellState\|export function sectionCount\|export function sectionCountLabel\|export function planCellToggle\|export function confirmCopy\|export interface ConfirmPlan\|export interface ConfirmCopy" client/src/components/settings/permissions/permissions-model.ts
grep -n "export interface PermissionsOverview\|export interface CatalogEntry" client/src/components/settings/permissions/permissions-types.ts
```
Expected: every name is printed once. If one is missing, Task 8 or Task 9 is not done: stop and report. Do not write a stand-in.

- [ ] **Step 2: Write the route page**

Create `client/src/app/(dashboard)/settings/permissions/page.tsx`:
```tsx
import { Suspense } from "react";
import { PermissionsClient } from "@/components/settings/permissions/permissions-client";

// The client reads `?rol=` through useSearchParams, which needs a Suspense boundary.
export default function PermissionsSettingsPage() {
  return (
    <Suspense>
      <PermissionsClient />
    </Suspense>
  );
}
```

- [ ] **Step 3: Write the confirmation dialog**

Create `client/src/components/settings/permissions/permission-confirm-dialog.tsx`:
```tsx
"use client";

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ConfirmCopy } from "./permissions-model";

interface PermissionConfirmDialogProps {
  copy: ConfirmCopy | null;
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * The one confirmation of the «Ruxsatlar» page: the question, the
 * capabilities that move with it («Birga yoqiladi» / «Birga o'chadi») and
 * the money warning. Every word comes from `permissions-model.ts`. Nothing is
 * saved before the confirm button, and the dialog stays open while the save
 * runs.
 */
export function PermissionConfirmDialog({
  copy,
  open,
  pending,
  onConfirm,
  onOpenChange,
}: PermissionConfirmDialogProps) {
  return (
    <AlertDialog
      open={open && copy !== null}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        {copy && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>{copy.title}</AlertDialogTitle>
              <AlertDialogDescription>
                O'zgarish xodimning keyingi bosishida kuchga kiradi.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {copy.alsoLabels.length > 0 && (
              <div className="space-y-1.5 text-sm">
                {copy.alsoTitle && <p className="font-medium">{copy.alsoTitle}:</p>}
                {/* A long cascade (turning off «O'quvchi profilini ochish») scrolls here; title and buttons stay. */}
                <ul className="max-h-[40dvh] list-disc space-y-1 overflow-y-auto overscroll-contain pl-5 text-muted-foreground">
                  {copy.alsoLabels.map((label, index) => (
                    <li key={`${index}-${label}`}>{label}</li>
                  ))}
                </ul>
              </div>
            )}

            {copy.warning && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                {copy.warning}
              </p>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Bekor qilish</AlertDialogCancel>
              <AlertDialogAction
                variant={copy.confirm === "O'chirish" ? "destructive" : "default"}
                disabled={pending}
                onClick={(event) => {
                  // AlertDialogAction closes the dialog on click; keep it open until the save answers.
                  event.preventDefault();
                  onConfirm();
                }}
              >
                {pending && <Loader2 className="size-4 animate-spin" />}
                {copy.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Write the table**

Create `client/src/components/settings/permissions/permissions-table.tsx`:
```tsx
"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, Lock } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PermissionKey } from "@/lib/permission-keys";
import { cn } from "@/lib/utils";
import { cellState, sectionCount, sectionCountLabel } from "./permissions-model";
import type { CatalogEntry, PermissionsOverview } from "./permissions-types";

type Toggle = (roleId: number, key: PermissionKey, on: boolean) => void;
type Section = PermissionsOverview["sections"][number];

interface PermissionsTableProps {
  overview: PermissionsOverview;
  /** Columns to draw: every editable role on a wide screen, the picked one on a phone. */
  roleIds: number[];
  onToggle: Toggle;
  busy: boolean;
}

interface RowContext {
  overview: PermissionsOverview;
  roleIds: number[];
  roleLabels: Map<number, string>;
  cols: CSSProperties;
  onToggle: Toggle;
  busy: boolean;
}

const DANGER_TEXT = {
  money: "Pulni o'zgartiradi",
  irreversible: "Qaytarib bo'lmaydi",
} as const;

/** Capabilities as rows in collapsible sections, roles as columns (spec §8). Every decision is the model's. */
export function PermissionsTable({ overview, roleIds, onToggle, busy }: PermissionsTableProps) {
  const single = roleIds.length === 1;
  const ctx: RowContext = {
    overview,
    roleIds,
    roleLabels: new Map<number, string>(overview.roles.map((r) => [r.id, r.label] as const)),
    // The column count follows the Role rows the server sent, so it is a style, not a class.
    cols: {
      gridTemplateColumns: single
        ? "minmax(0, 1fr) auto"
        : `minmax(0, 1fr) repeat(${roleIds.length}, 7rem)`,
    },
    onToggle,
    busy,
  };

  return (
    <div className={cn(!single && "overflow-x-auto")}>
      <div className={cn("space-y-2", !single && "min-w-[44rem]")}>
        {!single && (
          <div
            className="grid items-end gap-x-2 px-3 text-xs font-medium text-muted-foreground"
            style={ctx.cols}
          >
            <span>Imkoniyat</span>
            {roleIds.map((roleId) => (
              <span key={roleId} className="text-center">
                {ctx.roleLabels.get(roleId)}
              </span>
            ))}
          </div>
        )}
        {overview.sections.map((section) => (
          <PermissionSection key={section.key} section={section} ctx={ctx} />
        ))}
      </div>
    </div>
  );
}

function PermissionSection({ section, ctx }: { section: Section; ctx: RowContext }) {
  const [open, setOpen] = useState(false);
  const entries = ctx.overview.catalog.filter((e) => e.section === section.key);
  if (entries.length === 0) return null;
  const single = ctx.roleIds.length === 1;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="grid w-full items-center gap-x-2 rounded-lg px-3 py-2.5 text-left hover:bg-muted/50"
          style={ctx.cols}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
            {section.label}
          </span>
          {ctx.roleIds.map((roleId) => (
            <span
              key={roleId}
              className={cn(
                "text-xs text-muted-foreground tabular-nums",
                single ? "text-right" : "text-center",
              )}
            >
              {sectionCountLabel(sectionCount(ctx.overview, section.key, roleId))}
            </span>
          ))}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {entries.map((entry) => (
            <PermissionRow key={entry.key} entry={entry} ctx={ctx} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PermissionRow({ entry, ctx }: { entry: CatalogEntry; ctx: RowContext }) {
  const single = ctx.roleIds.length === 1;
  // A phone has room for the reason under the label; a wide screen shows it on the lock.
  const phoneLock = single ? cellState(ctx.overview, entry.key, ctx.roleIds[0]).lockReason : null;

  return (
    <div className="grid items-center gap-x-2 px-3 py-2" style={ctx.cols}>
      <div className="min-w-0 pl-6">
        <p className="flex items-start gap-2 text-sm">
          <span>{entry.label}</span>
          {entry.danger && <DangerMark danger={entry.danger} />}
        </p>
        {phoneLock && (
          <p className="mt-0.5 text-xs text-muted-foreground">Berib bo'lmaydi: {phoneLock}</p>
        )}
      </div>
      {ctx.roleIds.map((roleId) => (
        <div key={roleId} className="flex justify-center">
          <PermissionCell entry={entry} roleId={roleId} ctx={ctx} />
        </div>
      ))}
    </div>
  );
}

function PermissionCell({
  entry,
  roleId,
  ctx,
}: {
  entry: CatalogEntry;
  roleId: number;
  ctx: RowContext;
}) {
  const state = cellState(ctx.overview, entry.key, roleId);
  const name = `${ctx.roleLabels.get(roleId) ?? ""}: ${entry.label}`;
  if (state.locked) return <LockMark name={name} reason={state.lockReason ?? ""} />;

  return (
    <span className="relative inline-flex items-center">
      <Switch
        checked={state.granted}
        disabled={ctx.busy}
        aria-label={name}
        onCheckedChange={(on) => ctx.onToggle(roleId, entry.key, on)}
      />
      {state.differs && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Boshlang'ich holatdan farq qiladi"
              className="absolute top-1/2 -right-3.5 size-2 -translate-y-1/2 rounded-full bg-yellow-500"
            />
          </TooltipTrigger>
          <TooltipContent>Boshlang'ich holatdan farq qiladi</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

/** A locked cell. Radix opens a tooltip on hover and focus only; the click handler adds the tap. */
function LockMark({ name, reason }: { name: string; reason: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${name} — berib bo'lmaydi: ${reason}`}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={(event) => {
            // Radix closes the tooltip on click unless the event is prevented.
            event.preventDefault();
            setOpen(true);
          }}
        >
          <Lock className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Berib bo'lmaydi: {reason}</TooltipContent>
    </Tooltip>
  );
}

function DangerMark({ danger }: { danger: keyof typeof DANGER_TEXT }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={DANGER_TEXT[danger]}
          className="mt-1.5 inline-block size-2 shrink-0 rounded-full bg-red-500"
        />
      </TooltipTrigger>
      <TooltipContent>{DANGER_TEXT[danger]}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 5: Write the page body**

Create `client/src/components/settings/permissions/permissions-client.tsx`:
```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import { useRolePermissions, useSaveRolePermissions } from "@/hooks/use-role-permissions";
import type { PermissionKey } from "@/lib/permission-keys";
import { PermissionConfirmDialog } from "./permission-confirm-dialog";
import { confirmCopy, planCellToggle, type ConfirmPlan } from "./permissions-model";
import { PermissionsTable } from "./permissions-table";

/**
 * «Ruxsatlar» (spec §8, ADR-0086): the CEO turns each capability on or off per
 * staff role. CEO-only by identity: the settings entry is `ceoOnly` and the API
 * is `@CeoOnly()`. A toggle only opens the confirmation; the switch moves when
 * the server's answer comes back.
 */
export function PermissionsClient() {
  const { data: overview, isError, isFetching, refetch } = useRolePermissions();
  const save = useSaveRolePermissions();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [plan, setPlan] = useState<ConfirmPlan | null>(null);

  if (!overview) {
    return (
      <div>
        <Header />
        {isError ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            <p>Ruxsatlarni yuklab bo'lmadi.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Qayta urinish
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (overview.roles.length === 0) {
    return (
      <div>
        <Header />
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Sozlanadigan rol topilmadi.
        </p>
      </div>
    );
  }

  const allRoleIds: number[] = overview.roles.map((r) => r.id);
  const picked = Number(searchParams.get("rol"));
  const phoneRole = allRoleIds.includes(picked) ? picked : allRoleIds[0];
  const busy = save.isPending || isFetching;

  // The phone's role picker is a view switch, so it lives in the URL (?rol=); the first role is the default and is omitted.
  const pickRole = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (Number(value) === allRoleIds[0]) params.delete("rol");
    else params.set("rol", value);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const confirm = () => {
    if (!plan) return;
    save.mutate(
      { roleId: plan.roleId, changes: plan.changes },
      {
        onSuccess: () => {
          toast.success("Ruxsat saqlandi");
          setPlan(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Header />
      <Legend />
      {isMobile && (
        <Select value={String(phoneRole)} onValueChange={pickRole}>
          <SelectTrigger className="w-full" aria-label="Rol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {overview.roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <PermissionsTable
        overview={overview}
        roleIds={isMobile ? [phoneRole] : allRoleIds}
        busy={busy}
        onToggle={(roleId: number, key: PermissionKey, on: boolean) =>
          setPlan(planCellToggle(overview, roleId, key, on))
        }
      />
      <PermissionConfirmDialog
        copy={plan ? confirmCopy(overview, plan) : null}
        open={plan !== null}
        pending={save.isPending}
        onConfirm={confirm}
        onOpenChange={(open) => {
          if (!open) setPlan(null);
        }}
      />
    </div>
  );
}

function Header() {
  return (
    <SettingsPageHeader
      title="Ruxsatlar"
      description="O'zgarish xodimning keyingi bosishida kuchga kiradi."
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-yellow-500" />
        boshlang'ich holatdan farq qiladi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-red-500" />
        pulni o'zgartiradi yoki qaytarib bo'lmaydi
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="size-3" />
        bu rolga berib bo'lmaydi — sababini ko'rish uchun bosing
      </span>
    </div>
  );
}
```

- [ ] **Step 6: Type-check and lint (no Prettier on `client/`)**

Run (from `client/`):
```bash
npx tsc --noEmit
npx eslint 'src/app/(dashboard)/settings/permissions/page.tsx' src/components/settings/permissions
```
Expected: `tsc` prints nothing; eslint ends with no `✖ … error` line (warnings are not a gate). Fix and re-run only after a code change.

- [ ] **Step 7: Run the model and nav tests (regression)**

Run (from `client/`): `npx vitest run src/components/settings/permissions src/lib/settings-nav.test.ts src/qollanma/reyestr.test.ts`
Expected: PASS. `reyestr.test.ts` is included because the route `/settings/permissions` now exists, and Task 12 points a guide page at it.

- [ ] **Step 8: Commit**

From the worktree root:
```bash
git add 'client/src/app/(dashboard)/settings/permissions/page.tsx' client/src/components/settings/permissions/permissions-client.tsx client/src/components/settings/permissions/permissions-table.tsx client/src/components/settings/permissions/permission-confirm-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(permissions): Ruxsatlar page — role table, locks, marks, confirm dialog

Sections collapse with a per-role count; a cell is a switch, a lock with its
reason (tap opens it), a yellow dot when it differs from the default, a red
mark on money and irreversible rows. A toggle opens the confirmation with the
capabilities that move with it; the switch follows the server after the save.
Below md a role picker (?rol=) shows one role.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Reset per role and the change history

**Files:**
- Create: `client/src/components/settings/permissions/permissions-history.tsx` («O'zgarishlar tarixi», 20 per page)
- Modify: `client/src/components/settings/permissions/permissions-table.tsx` (`onReset` prop, a reset button per role column and in the phone view)
- Modify: `client/src/components/settings/permissions/permissions-client.tsx` (reset state and mutation, the history section)
- Not modified: `permission-confirm-dialog.tsx`. The reset reuses it unchanged by passing a `ConfirmCopy` with `alsoTitle: null`, `alsoLabels` = the `resetCopy` lines, `warning: null` and `confirm: "Qaytarish"`. The dialog draws the list without a heading when `alsoTitle` is null, and its confirm button is `variant="destructive"` only for Task 9's word «O'chirish» (Task 10's interface), so the reset button keeps the default variant. Do not rename «O'chirish» in `confirmCopy` without changing the dialog in the same commit.
- Test: none new. `resetCopy` and `historyLine` are tested in Task 9. The browser check is in Task 13.

**Interfaces:**
- Consumes:
  - Task 8: `useResetRolePermissions(): UseMutationResult<RoleKeys, unknown, { roleId: number }>`; `useRolePermissionsHistory(page: number): UseQueryResult<PermissionHistoryPage>` (`GET /permissions/history?page&pageSize=20`); `PermissionHistoryPage` = `{ data: PermissionHistoryItem[]; total; page; pageSize }`; `PermissionHistoryItem` = `{ id; createdAt; roleId; changedBy: { id; firstName; lastName } | null; changes }`.
  - Task 9: `resetCopy(o, roleId): { title: string; lines: string[] }`, `historyLine(o, item): string`, `cellState(...)`, `type ConfirmCopy`.
  - Task 10: `PermissionsTable`, `PermissionConfirmDialog`, `PermissionsClient` as written there.
  - Existing: `tashkentDayAsLocalDate`, `tashkentHhmm` (`@/lib/tashkent-time`), `format` (`date-fns`), shadcn `Table*`.
- Produces:
  - `export function PermissionsHistory(props: { overview: PermissionsOverview })`, which owns its page state.
  - `PermissionsTable` gains `onReset: (roleId: number) => void`. A role shows «Boshlang'ich holatga qaytarish» only when some cell of that role `differs`.

- [ ] **Step 1: Confirm the inputs exist**

Run (from the worktree root):
```bash
grep -n "export function useResetRolePermissions\|export function useRolePermissionsHistory" client/src/hooks/use-role-permissions.ts
grep -n "export function resetCopy\|export function historyLine" client/src/components/settings/permissions/permissions-model.ts
```
Expected: four lines. If one is missing, stop and report.

- [ ] **Step 2: Write the history section**

Create `client/src/components/settings/permissions/permissions-history.tsx`:
```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRolePermissionsHistory } from "@/hooks/use-role-permissions";
import { tashkentDayAsLocalDate, tashkentHhmm } from "@/lib/tashkent-time";
import { historyLine } from "./permissions-model";
import type { PermissionsOverview } from "./permissions-types";

// "dd.MM.yyyy, HH:mm" on the Tashkent clock, never the browser's zone.
const when = (iso: string) =>
  `${format(tashkentDayAsLocalDate(iso), "dd.MM.yyyy")}, ${tashkentHhmm(iso)}`;

function HeadRow() {
  return (
    <TableRow>
      <TableHead className="w-12 border-r">#</TableHead>
      <TableHead className="w-40">Sana</TableHead>
      <TableHead className="w-44">Kim</TableHead>
      <TableHead>O'zgarish</TableHead>
    </TableRow>
  );
}

/** «O'zgarishlar tarixi»: who changed which role, newest first, 20 per page (spec §7.8). */
export function PermissionsHistory({ overview }: { overview: PermissionsOverview }) {
  const [page, setPage] = useState(1);
  const { data, isError, isFetching, refetch } = useRolePermissionsHistory(page);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">O'zgarishlar tarixi</h3>

      {isError && !data ? (
        <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          <p>Tarixni yuklab bo'lmadi.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : !data ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <HeadRow />
            </TableHeader>
            <TableBody>
              {Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  <TableCell className="border-r">
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-64" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : data.data.length === 0 ? (
        <div className="flex h-20 items-center justify-center rounded-md border text-sm text-muted-foreground">
          Hali o'zgarish yo'q
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <HeadRow />
              </TableHeader>
              <TableBody>
                {data.data.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell className="border-r text-muted-foreground">
                      {(data.page - 1) * data.pageSize + index + 1}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {when(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.changedBy
                        ? `${item.changedBy.firstName} ${item.changedBy.lastName}`
                        : "Tizim"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {historyLine(overview, item)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Jami: {data.total} ta yozuv</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Oldingi
                </Button>
                <span>
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Keyingi
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Add the reset button to the table**

Edit `client/src/components/settings/permissions/permissions-table.tsx` in four places.

(a) Imports. Old:
```tsx
import { ChevronDown, Lock } from "lucide-react";
import {
  Collapsible,
```
New:
```tsx
import { ChevronDown, Lock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
```

(b) Props. Old:
```tsx
  roleIds: number[];
  onToggle: Toggle;
  busy: boolean;
}

interface RowContext {
```
New:
```tsx
  roleIds: number[];
  onToggle: Toggle;
  /** «Boshlang'ich holatga qaytarish» for one role; shown only for a role that differs from the default. */
  onReset: (roleId: number) => void;
  busy: boolean;
}

interface RowContext {
```

(c) The reset button component. Old:
```tsx
const DANGER_TEXT = {
  money: "Pulni o'zgartiradi",
  irreversible: "Qaytarib bo'lmaydi",
} as const;
```
New:
```tsx
const DANGER_TEXT = {
  money: "Pulni o'zgartiradi",
  irreversible: "Qaytarib bo'lmaydi",
} as const;

function ResetButton({
  roleLabel,
  disabled,
  onClick,
}: {
  roleLabel: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${roleLabel}: boshlang'ich holatga qaytarish`}
      className="h-auto gap-1 px-1.5 py-0.5 text-xs font-normal whitespace-normal text-muted-foreground"
    >
      <RotateCcw className="size-3 shrink-0" />
      Boshlang'ich holatga qaytarish
    </Button>
  );
}
```

(d) The component's head: the signature, the `changed` helper and the header row. Old:
```tsx
export function PermissionsTable({ overview, roleIds, onToggle, busy }: PermissionsTableProps) {
  const single = roleIds.length === 1;
```
New:
```tsx
export function PermissionsTable({
  overview,
  roleIds,
  onToggle,
  onReset,
  busy,
}: PermissionsTableProps) {
  const single = roleIds.length === 1;
  // The reset button shows only when the role has something to reset (spec §8).
  const changed = (roleId: number) =>
    overview.catalog.some((e) => cellState(overview, e.key, roleId).differs);
```
Old:
```tsx
        {!single && (
          <div
            className="grid items-end gap-x-2 px-3 text-xs font-medium text-muted-foreground"
            style={ctx.cols}
          >
            <span>Imkoniyat</span>
            {roleIds.map((roleId) => (
              <span key={roleId} className="text-center">
                {ctx.roleLabels.get(roleId)}
              </span>
            ))}
          </div>
        )}
```
New:
```tsx
        {single ? (
          changed(roleIds[0]) && (
            <div className="flex justify-end">
              <ResetButton
                roleLabel={ctx.roleLabels.get(roleIds[0]) ?? ""}
                disabled={busy}
                onClick={() => onReset(roleIds[0])}
              />
            </div>
          )
        ) : (
          <div
            className="grid items-start gap-x-2 px-3 text-xs font-medium text-muted-foreground"
            style={ctx.cols}
          >
            <span className="pt-1">Imkoniyat</span>
            {roleIds.map((roleId) => (
              <div key={roleId} className="flex flex-col items-center gap-1 text-center">
                <span className="pt-1">{ctx.roleLabels.get(roleId)}</span>
                {changed(roleId) && (
                  <ResetButton
                    roleLabel={ctx.roleLabels.get(roleId) ?? ""}
                    disabled={busy}
                    onClick={() => onReset(roleId)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Wire reset and history into the page body**

Replace the whole of `client/src/components/settings/permissions/permissions-client.tsx` (written in Task 10) with:
```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import toast from "react-hot-toast";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useResetRolePermissions,
  useRolePermissions,
  useSaveRolePermissions,
} from "@/hooks/use-role-permissions";
import type { PermissionKey } from "@/lib/permission-keys";
import { PermissionConfirmDialog } from "./permission-confirm-dialog";
import {
  confirmCopy,
  planCellToggle,
  resetCopy,
  type ConfirmCopy,
  type ConfirmPlan,
} from "./permissions-model";
import { PermissionsHistory } from "./permissions-history";
import type { PermissionsOverview } from "./permissions-types";
import { PermissionsTable } from "./permissions-table";

/** The reset confirmation in the toggle dialog's shape: the lines «X yoqiladi / o'chadi», no heading, no money warning. */
function resetDialogCopy(overview: PermissionsOverview, roleId: number): ConfirmCopy {
  const copy = resetCopy(overview, roleId);
  return { title: copy.title, alsoTitle: null, alsoLabels: copy.lines, warning: null, confirm: "Qaytarish" };
}

/**
 * «Ruxsatlar» (spec §8, ADR-0086): the CEO turns each capability on or off per
 * staff role. CEO-only by identity: the settings entry is `ceoOnly` and the API
 * is `@CeoOnly()`. A toggle or a reset only opens the confirmation; the
 * switches move when the server's answer comes back.
 */
export function PermissionsClient() {
  const { data: overview, isError, isFetching, refetch } = useRolePermissions();
  const save = useSaveRolePermissions();
  const reset = useResetRolePermissions();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [plan, setPlan] = useState<ConfirmPlan | null>(null);
  const [resetRoleId, setResetRoleId] = useState<number | null>(null);

  if (!overview) {
    return (
      <div>
        <Header />
        {isError ? (
          <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            <p>Ruxsatlarni yuklab bo'lmadi.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
              Qayta urinish
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (overview.roles.length === 0) {
    return (
      <div>
        <Header />
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
          Sozlanadigan rol topilmadi.
        </p>
      </div>
    );
  }

  const allRoleIds: number[] = overview.roles.map((r) => r.id);
  const picked = Number(searchParams.get("rol"));
  const phoneRole = allRoleIds.includes(picked) ? picked : allRoleIds[0];
  const pending = save.isPending || reset.isPending;
  const busy = pending || isFetching;
  const copy = plan
    ? confirmCopy(overview, plan)
    : resetRoleId !== null
      ? resetDialogCopy(overview, resetRoleId)
      : null;

  // The phone's role picker is a view switch, so it lives in the URL (?rol=); the first role is the default and is omitted.
  const pickRole = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (Number(value) === allRoleIds[0]) params.delete("rol");
    else params.set("rol", value);
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const close = () => {
    setPlan(null);
    setResetRoleId(null);
  };

  const confirm = () => {
    if (plan) {
      save.mutate(
        { roleId: plan.roleId, changes: plan.changes },
        {
          onSuccess: () => {
            toast.success("Ruxsat saqlandi");
            close();
          },
        },
      );
    } else if (resetRoleId !== null) {
      reset.mutate(
        { roleId: resetRoleId },
        {
          onSuccess: () => {
            toast.success("Boshlang'ich holat tiklandi");
            close();
          },
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      <Header />
      <Legend />
      {isMobile && (
        <Select value={String(phoneRole)} onValueChange={pickRole}>
          <SelectTrigger className="w-full" aria-label="Rol">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {overview.roles.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <PermissionsTable
        overview={overview}
        roleIds={isMobile ? [phoneRole] : allRoleIds}
        busy={busy}
        onToggle={(roleId: number, key: PermissionKey, on: boolean) =>
          setPlan(planCellToggle(overview, roleId, key, on))
        }
        onReset={(roleId: number) => setResetRoleId(roleId)}
      />
      <PermissionsHistory overview={overview} />
      <PermissionConfirmDialog
        copy={copy}
        open={copy !== null}
        pending={pending}
        onConfirm={confirm}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      />
    </div>
  );
}

function Header() {
  return (
    <SettingsPageHeader
      title="Ruxsatlar"
      description="O'zgarish xodimning keyingi bosishida kuchga kiradi."
    />
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-yellow-500" />
        boshlang'ich holatdan farq qiladi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-red-500" />
        pulni o'zgartiradi yoki qaytarib bo'lmaydi
      </span>
      <span className="flex items-center gap-1.5">
        <Lock className="size-3" />
        bu rolga berib bo'lmaydi — sababini ko'rish uchun bosing
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Type-check and lint (no Prettier on `client/`)**

Run (from `client/`):
```bash
npx tsc --noEmit
npx eslint 'src/app/(dashboard)/settings/permissions/page.tsx' src/components/settings/permissions
wc -l src/components/settings/permissions/*.tsx
```
Expected: `tsc` silent; eslint has no errors; every `.tsx` is ≤ 300 lines.

- [ ] **Step 6: Run the folder's tests (regression)**

Run (from `client/`): `npx vitest run src/components/settings/permissions`
Expected: PASS (Task 9's model tests, unchanged).

- [ ] **Step 7: Commit**

From the worktree root:
```bash
git add client/src/components/settings/permissions/permissions-history.tsx client/src/components/settings/permissions/permissions-table.tsx client/src/components/settings/permissions/permissions-client.tsx
git commit -m "$(cat <<'EOF'
feat(permissions): reset a role to its defaults, change history

«Boshlang'ich holatga qaytarish» shows per role column (and in the phone
view) only when the role differs from the default; it opens the same
confirmation with the keys that will change. «O'zgarishlar tarixi» lists
every save, 20 per page, Tashkent time, with who made it.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Docs — ADR-0086, role-access.md, CLAUDE.md files, spec, user guide

**Files:**
- Create: `docs/adr/0086-ruxsatlar-sahifasi.md`
- Modify: `docs/adr/README.md` (one row), `docs/role-access.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md` (§15), `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/yangiliklar.ts`
- Test: `client/src/qollanma/reyestr.test.ts` (and the rest of `src/qollanma`)

**Interfaces:**
- Consumes: the code of Tasks 1–11 as committed. This task only describes it. Before writing, check the facts the text states:
  ```bash
  grep -n "TEACHER_ADVANCE" server/src/expenses/expenses.service.ts | head
  grep -n "canAdvance" client/src/components/payments/salary-client.tsx
  grep -n "contracts.manage" server/src/contract-documents/contract-documents.controller.ts client/src/components/students/contracts/student-contracts-tab.tsx
  grep -n "'reports.finance'" -A 6 server/src/common/permissions/permission-catalog.money.ts
  ```
  The text below assumes the CEO's answer to question 1: an advance is written **only** with `salary.pay`. That means `assertMayWrite` requires `salary.pay` for `TEACHER_ADVANCE` and `expenses.manage` for every other category, and `canAdvance = useCan("salary.pay")`. It also assumes `reports.finance` has `requires: ['salary.view']`. If the code says otherwise, stop and report the difference. Do not document a rule the code does not hold.
- Produces: nothing.

**Date.** Every new date below is written `2026-10-11`. Before writing, run `TZ=Asia/Tashkent date +%F`. If the day is later, use it in all five places: the ADR's «Sana», the README row, the spec §15 line, `yangilangan` and the yangiliklar `sana`. `reyestr.test.ts` fails on a date in the future, so never use a date later than today.

- [ ] **Step 1: Write the ADR**

Create `docs/adr/0086-ruxsatlar-sahifasi.md`:
````markdown
# ADR-0086 — «Ruxsatlar» sahifasi: CEO rol imkoniyatlarini o'zgartiradi, bazada faqat farq saqlanadi, texnik qulf server va ekranda bir xil

**Holati:** Qabul qilindi
**Sana:** 2026-10-11
**Bog'liq:** ADR-0026, ADR-0027, ADR-0030, ADR-0075, ADR-0079, ADR-0081, ADR-0082, `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md`

## Kontekst

ADR-0079 da ruxsat imkoniyatga o'tdi, lekin boshlang'ich holatni faqat dasturchi o'zgartira olardi. CEO (05.10.2026) har bir rol nima qila olishini o'zi yoqib-o'chirmoqchi. Buning uch xavfi bor:

1. Imkoniyat yangi rolga berilsa, kod hech qachon sinamagan yo'l ochiladi: filial chegarasi tekshirilmagan route, butun kompaniyaga ta'sir qiladigan yozuv yoki xizmat ichidagi rol taxmini.
2. Imkoniyatlar bir-biriga tayanadi: talabi o'chirilgan imkoniyat yarim ishlaydi.
3. O'zgarish qachon kuchga kirgani va kim nimani o'zgartirgani noma'lum qoladi.

## Qaror

1. **Sahifa va API faqat CEO uchun.** Sahifa — `/settings/permissions`. API — `GET /permissions`, `PUT /permissions/roles/:roleId`, `POST /permissions/roles/:roleId/reset`, `GET /permissions/history`. Ularda yangi belgi turadi: `@CeoOnly()`. U bazadan o'qilgan rollarda CEO bor-yo'qligini tekshiradi. Bu imkoniyat emas: katalogda yo'q va hech kimga berilmaydi.
2. **Bazada faqat farq saqlanadi.** Yangi jadval `RolePermission (companyId, roleId, key, granted)`. Boshlang'ich holatga teng bo'lib qolgan yozuv o'chiriladi. Jadval bo'sh holda qo'shiladi, shuning uchun chiqqan kuni hech kim uchun hech narsa o'zgarmaydi. «Boshlang'ich holatga qaytarish» shu rolning yozuvlarini o'chiradi. O'qishda katalogda yo'q kalit tashlab yuboriladi va jurnalga yoziladi.
3. **Texnik qulf.** Har bir imkoniyatda `allowedRoles` bor: shu imkoniyat berilishi mumkin bo'lgan rollar. Ro'yxatdan tashqaridagi har bir rolga bitta sabab yoziladi (`lockReasons`). Sabablar oltita:
   - «o'qituvchi faqat o'z guruhlarini ko'radi» — o'qituvchini o'z guruhlari bilan cheklaydigan kod faqat guruh va bosh sahifa yo'llarida bor;
   - «o'qituvchi saytida bunday sahifa yo'q» — o'qituvchi faqat o'z portaliga kiradi;
   - «bu rol uchun kod sinalmagan» — xizmat ichida rol bo'yicha taxmin bor;
   - «butun kompaniyaga ta'sir qiladi» — `COMPANY_WIDE` yozuv;
   - «filial chegarasi hali tekshirilmagan» — `UNREVIEWED` route yoki filialsiz id bo'yicha qidiruv;
   - «guruhga moliya hisoboti ketadi» — Telegram guruhini tasdiqlash unga 21:00 hisobotini ochadi.

   Qoidalar testlarda qotirilgan: boshlang'ich rollar `allowedRoles` ichida; `allowedRoles` bog'liqlik bo'yicha yopiq; boshlang'ichdan kengroq imkoniyatning birorta route'i `UNREVIEWED` emas va ko'rib chiqilmagan `COMPANY_WIDE` yozuvi yo'q. O'qituvchiga faqat «Guruhlarni ko'rish» va «Davomat olish» beriladi. Yetti imkoniyat faqat CEO'da qoladi: to'lov tizimlari jurnali, stavkani o'zgartirish, oylikni hisoblash, tasdiqlash va oyni yopish (`salary.close`, CEO 11.10), boshqalarning izohini o'chirish, Telegram guruhlariga e'lon, kompaniya sozlamalari, arxiv. Qulfni sahifa ham, server ham tekshiradi: server qulflangan rolga yoqishni 400 bilan rad etadi, o'qishda esa bunday yozuvni e'tiborsiz qoldiradi.
4. **Bog'liqlik bitta faylda.** Yoqilgan imkoniyat o'z talablarini birga yoqadi, o'chirilgani unga tayanganlarni birga o'chiradi. Funksiyalar `server/src/common/permissions/permission-deps.ts` da, saytdagi `client/src/lib/permission-deps.ts` uning harfma-harf nusxasi. Bitta test jadvali ikkalasini tekshiradi. Server bog'liqlikni buzadigan to'plamni 400 bilan rad etadi, o'qishda esa natijani barqarorlashtiradi.
5. **Keyingi so'rovda kuchga kiradi.** Yozuvdan keyin shu server jarayonidagi kesh darhol tozalanadi (`invalidateAll()`). Boshqa nusxada bu 10 soniyagacha cho'ziladi. Bir xodim uchun bir vaqtda kelgan o'qishlar bitta so'rovga birlashadi. Sayt `/permissions/me` ni oynaga qaytilganda, 30 soniyadan keyin va 403 dan keyin qayta o'qiydi.
6. **Tarix.** Har bir saqlash `EntityHistory` ga bitta yozuv qo'shadi (`entityType: 'RolePermission'`, `entityId` — rol). Unga bog'liqlik bilan birga o'zgargan kalitlar ham kiradi. Hech narsani o'zgartirmagan saqlash yozilmaydi. Tarix faqat `GET /permissions/history` orqali o'qiladi va sahifaning pastida ko'rinadi.
7. **Xodim istisnosi (`UserPermission`) 3-bosqichga qoldi.** Bu bosqichda uni hech bir kod o'qimaydi va yozmaydi. O'qilmaydigan jadvalni sinab bo'lmaydi; 3-bosqich uni o'z migratsiyasi bilan qo'shadi.
8. **Shu PR'dagi qo'shimcha qarorlar:**
   - **Avans** (CEO, 10.10 va 11.10). O'qituvchiga avansni (`TEACHER_ADVANCE`) yozish, tahrirlash va o'chirish uchun «Oylik va avans to'lash» (`salary.pay`) kerak. Boshqa xarajat uchun «Xarajat kiritish» (`expenses.manage`) kerak. Bugun ikkalasi ham faqat filial direktori va CEO'da, shuning uchun hech kim uchun hech narsa o'zgarmaydi.
   - **Shartnoma.** Yangi imkoniyat «Shartnoma tuzish va imzolash» (`contracts.manage`). Uning boshlang'ich rollari filial direktori va administrator, ya'ni bugungidek. Shartnoma yozuv route'lari va saytdagi tugmalar shu imkoniyatga o'tdi. O'qish «O'quvchi profilidagi tablar» (`students.details`) da qoldi. Imzolangan shartnomani bekor qilish CEO kimligi bilan qoladi (ADR-0075).
   - **Moliya hisobotida oyliklar bor**, shuning uchun «Moliya va marketing hisobotlari» «Xodimlar oyligini ko'rish»ni talab qiladi (CEO, 11.10).
   - **Xodim tarixida oylik balansi yo'q.** `User` tarixi `balance` maydonini saqlamaydi. Ilgari saqlanganini o'qishda olib tashlaydi.
   - **Bosh sahifa keshi** kalitini u bog'liq bo'lgan har bir imkoniyatdan tuzadi.

## Ko'rib chiqilgan muqobillar

- **Har rol uchun to'liq to'plamni saqlash.** Rad etildi. Yangi imkoniyat qo'shilganda migratsiya kerak bo'lardi. Faqat farq saqlansa, boshlang'ich holat kodda qoladi va «qaytarish» oddiy o'chirish bo'ladi.
- **Sahifani imkoniyat qilish (masalan `permissions.manage`).** Rad etildi (spec 4-bo'lim, 2-band). Bu imkoniyatni olgan xodim o'ziga hamma narsani ocha olardi.
- **Qulfsiz: har kalit har rolga.** Rad etildi. Filial chegarasi tekshirilmagan route'lar va butun kompaniyaga ta'sir qiladigan yozuvlar ochilib qolardi.
- **Keshni Redis orqali hamma nusxada tozalash.** Rad etildi: hozir server bitta nusxada ishlaydi, 10 soniya yetarli. Kerak bo'lsa ADR-0030 dagi kabi Redis versiya kaliti qo'shiladi.
- **`UserPermission` jadvalini hozir qo'shish.** Rad etildi: 7-band.

## Oqibatlari

- Yangi imkoniyat qo'shilganda `defaultRoles`, `allowedRoles` va har qulflangan rol uchun sabab yoziladi. Ikki test buni tekshiradi: `permission-catalog.spec.ts` va `permission-allowed-roles.spec.ts`.
- Qulfni olishdan oldin imkoniyatning route'lari filial bo'yicha ko'rib chiqiladi (`branch-route-policy.ts`). Ko'rib chiqilmagan yo'l qolsa, qulf turadi.
- Chiqarish tartibi: avval server (migratsiya bilan), keyin sayt.
- Kassirga ko'p imkoniyat ochilishi mumkin, chunki server uni administrator kabi filial bilan cheklaydi. Lekin CEO bilishi kerak bo'lgan uch narsa bor:
  - kassirga ochilgan «Davomat olish» olingan davomatni tahrirlashni ham beradi;
  - «O'qituvchilar ro'yxati» yoki «Xodimlar ro'yxati» filialdagi yozuvlarning tarixi va izohlarini ham ochadi;
  - «Filiallar» o'z filialini yopishga ham imkon beradi.
- Server bir nechta nusxada ishlasa, o'zgarish 10 soniyagacha kechikadi.
````

- [ ] **Step 2: Add the README row**

Edit `docs/adr/README.md`. Old (the last row of the index on `main` 54016d9e):
```markdown
| [0085](0085-dialog-ovozi-gemini-3-8-har-obrazga-ovoz.md) | Dialog ovozi Gemini 3.8 da, har obrazning CEO tanlagan o'z ovozi; unitlar navbat bilan o'tkaziladi, navbati kelmagan unitning 3.1 yozuvi qoladi | Qabul qilindi | 2026-10-11 |
```
New (the old row, then the new one):
```markdown
| [0085](0085-dialog-ovozi-gemini-3-8-har-obrazga-ovoz.md) | Dialog ovozi Gemini 3.8 da, har obrazning CEO tanlagan o'z ovozi; unitlar navbat bilan o'tkaziladi, navbati kelmagan unitning 3.1 yozuvi qoladi | Qabul qilindi | 2026-10-11 |
| [0086](0086-ruxsatlar-sahifasi.md) | «Ruxsatlar» sahifasi: CEO rol imkoniyatlarini o'zgartiradi (faqat CEO, `@CeoOnly()`, imkoniyat emas); bazada faqat farq saqlanadi; texnik qulf olti sabab bilan server va ekranda bir xil; bog'liqlik bitta umumiy faylda; har saqlash tarixda; avans faqat «Oylik va avans to'lash» bilan | Qabul qilindi | 2026-10-11 |
```
0084 (#705) and 0085 (#704) are already on `main`, so 0086 is the next free number. If `origin/main` has meanwhile merged a row 0086 (another open branch may also claim it), renumber this ADR as described in Task 13 Step 1.

- [ ] **Step 3: Update `docs/role-access.md`**

(a) Old:
```markdown
The tables below describe the **default** state — what each role holds until the CEO changes it (stage 2). When a table and the catalog disagree, the catalog wins and the table is corrected.
```
New:
```markdown
The tables below describe the **default** state — what each role holds until the CEO changes it on the «Ruxsatlar» page ([below](#the-ruxsatlar-page-ceo-only-adr-0086), ADR-0086). When a table and the catalog disagree, the catalog wins and the table is corrected.
```

(b) Old:
```markdown
- **No tax setting.** The salary tax-rate config and its endpoints were removed:
```
New:
```markdown
- **Advances are written with `salary.pay` (ADR-0086).** `POST /expenses`, `PATCH /expenses/:id` and `DELETE /expenses/:id` are `@Can('expenses.manage', 'salary.pay')`. `ExpensesService` then requires `salary.pay` for a `TEACHER_ADVANCE` and `expenses.manage` for every other category, and on an update it checks both the old and the new category. 403 «Bu xarajatni kiritish huquqingiz yo'q». By default both capabilities sit with the Branch Director alone, so nothing changed for anyone. The client's «+ Avans berish» is `useCan("salary.pay")`.
- **No tax setting.** The salary tax-rate config and its endpoints were removed:
```

(c) Old:
```markdown
- **Backend**: `@Can('students.details')` on the reads (list, prefill, PDF), `@Can('students.manage')` on the writes (create, edit, sign, cancel). Cancelling a signed contract is CEO identity, checked by `ContractLifecycleService.cancel` against the role read from the database
- **Frontend**: the tab shows with `useCan("students.details")`; «Shartnoma tuzish» and the card actions with `useCan("students.manage")`; the CEO-only cancel of a signed contract is an identity check (`SIGNED_CONTRACT_CANCEL_ROLE_IDS` in `student-contracts-tab.tsx`)
```
New:
```markdown
- **Backend**: `@Can('students.details')` on the reads (list, prefill, PDF), `@Can('contracts.manage')` on the writes (create, edit, sign, cancel). That capability is «Shartnoma tuzish va imzolash», held by default by the Branch Director and the Administrator (ADR-0086). Cancelling a signed contract is CEO identity, checked by `ContractLifecycleService.cancel` against the role read from the database
- **Frontend**: the tab shows with `useCan("students.details")`; «Shartnoma tuzish» and the card actions with `useCan("contracts.manage")`; the CEO-only cancel of a signed contract is an identity check (`SIGNED_CONTRACT_CANCEL_ROLE_IDS` in `student-contracts-tab.tsx`)
```

(d) Old:
```markdown
## Implementation Checklist (for new features)
```
New (a new section, then the old heading):
```markdown
## The «Ruxsatlar» page (CEO only, ADR-0086)

`/settings/permissions` lets the CEO turn each capability on or off for the four staff roles, in this column order: Branch Director, Administrator, Cashier, Teacher. The tables above are the defaults. A role's live set is its default plus the CEO's changes. Only the differences are stored, in `RolePermission`.

- **CEO only, and never a capability.** The page's settings entry is `ceoOnly`. Its API — `GET /permissions`, `PUT /permissions/roles/:roleId`, `POST /permissions/roles/:roleId/reset`, `GET /permissions/history` — carries `@CeoOnly()`, which reads the CEO role from the database. The CEO always holds every capability, and a student holds none.
- **Takes effect on the next request.** In the process that saved the change, `PermissionsService.invalidateAll()` makes it immediate; any other process picks it up within 10 s. The client re-reads `/permissions/me` on window focus, after 30 s and after a 403.
- **Dependencies move together.** Turning a capability on also turns on what it `requires`, and turning one off also turns off what relies on it. The page lists them before saving («Birga yoqiladi» / «Birga o'chadi»). The server refuses a set that breaks a dependency (400).
- **Locks.** A capability can be given only to the roles in its `allowedRoles`. Every other role carries exactly one reason. The page shows it as a lock, and the server refuses it (400 on save; ignored on read):

| Reason on screen | Meaning |
|---|---|
| «o'qituvchi faqat o'z guruhlarini ko'radi» | The Teacher may be given only `groups.view` and `attendance.mark`; only the group and home paths narrow a teacher to their own groups |
| «o'qituvchi saytida bunday sahifa yo'q» | The Teacher signs in on the lehrer portal only, which has no such page |
| «bu rol uchun kod sinalmagan» | A service assumes a role (the catalog row names the file) |
| «butun kompaniyaga ta'sir qiladi» | The capability has a `COMPANY_WIDE` write (`branch-route-policy.ts`) |
| «filial chegarasi hali tekshirilmagan» | An `UNREVIEWED` route or an id lookup without a branch check |
| «guruhga moliya hisoboti ketadi» | Approving a Telegram group sends it the 21:00 money report |

- **CEO-only capabilities** (no role may be given them): `payments.gateway-log`, `salary.rate-edit`, `salary.close`, `comments.delete`, `telegram.announce`, `settings.company`, `settings.archive`.
- **Where the rules live.** The data is in `allowedRoles` / `lockReasons` in `server/src/common/permissions/permission-catalog.{people,money,admin}.ts`. `permission-catalog.spec.ts` checks the shape: defaults ⊆ allowed, allowed closed under `requires`, one reason per locked role. `permission-allowed-roles.spec.ts` checks that a widened capability has no `UNREVIEWED` route and no unreviewed `COMPANY_WIDE` write.
- **History.** Every save writes one `EntityHistory` row (`entityType: 'RolePermission'`, `entityId` = the role) and is listed at the bottom of the page. It is readable only through `GET /permissions/history`.
- **Not yet.** Per-employee exceptions (`UserPermission`) are stage 3.

## Implementation Checklist (for new features)
```

(e) Old:
```markdown
A new action reuses a capability or adds one to the catalog (Uzbek label, section, default roles, `requires`). Add the route's row to `route-access.snapshot.json`.
```
New:
```markdown
A new action reuses a capability or adds one to the catalog (Uzbek label, section, default roles, `requires`, `allowedRoles` and a `LOCK` reason for every other editable role). Add the route's row to `route-access.snapshot.json`.
```

- [ ] **Step 4: Update `server/CLAUDE.md`**

(a) Old:
```markdown
- Route access is a capability marker (`@Can`, `@AnyStaff`, `@AnyUser`, `@StudentOnly`), never a role list — see «Capabilities, not role lists» under Role-Based Access Control
```
New:
```markdown
- Route access is a capability marker (`@Can`, `@AnyStaff`, `@AnyUser`, `@StudentOnly`, `@CeoOnly`), never a role list — see «Capabilities, not role lists» under Role-Based Access Control
```

(b) Old:
```markdown
`@AnyUser()` (any signed-in account that is not blocked, own data) or `@StudentOnly()` (the student portal) — or `@Public()`.
```
New:
```markdown
`@AnyUser()` (any signed-in account that is not blocked, own data), `@StudentOnly()` (the student portal) or `@CeoOnly()` (the CEO's identity, ADR-0086) — or `@Public()`.
```

(c) Old:
```markdown
- **The capability catalog is `common/permissions/permission-catalog.ts`** — 66 capabilities with their Uzbek labels and the roles that hold them by default. The CEO holds every capability. A new screen action either reuses a capability or adds one there (label, section, default roles, `requires`).
```
New:
```markdown
- **The capability catalog is `common/permissions/permission-catalog.ts`** — 67 capabilities in 14 sections with their Uzbek labels and the roles that hold them by default. The CEO holds every capability. The data lives in three files by section, `permission-catalog.people.ts`, `permission-catalog.money.ts` and `permission-catalog.admin.ts`. The types, role constants and lock texts (`LOCK`) live in `permission-catalog.types.ts`. `permission-catalog.ts` assembles them and keeps every export. A new screen action either reuses a capability or adds one there (label, section, default roles, `requires`).
- **Every capability declares who may ever hold it (ADR-0086):** `allowedRoles` (⊇ `defaultRoles`, closed under `requires`) and exactly one `lockReasons` entry, a `LOCK` text, for every other editable role. `permission-catalog.spec.ts` checks the shape. `permission-allowed-roles.spec.ts` checks the routes: a capability whose `allowedRoles` is wider than its defaults may have no `UNREVIEWED` route and no `COMPANY_WIDE` write outside `REVIEWED_COMPANY_WIDE_WRITES`. Lifting a lock means reviewing the capability's routes in `branch-route-policy.ts` first.
- **The CEO changes a role's set on «Ruxsatlar» (ADR-0086).**
  - `RolePermission` stores only the differences from the default.
  - `PermissionsService.forUser()` reads them for a non-CEO staff caller and applies `effectiveForRoles()` from `effective-permissions.ts`: defaults, then overrides (unknown keys and grants outside `allowedRoles` are ignored), then `stabilize`.
  - `RolePermissionsService` writes in one transaction with an `EntityHistory` row (`entityType: 'RolePermission'`) and calls `PermissionsService.invalidateAll()` after the commit. Any other writer of `RolePermission` must do the same.
  - Concurrent loads for one user share one promise, and a load that started before `invalidateAll()` is not cached.
  - The dependency functions (`withRequirements`, `withDependents`, `stabilize`, `planToggle`) are `permission-deps.ts`. `client/src/lib/permission-deps.ts` is a byte-for-byte copy, and the client test compares the two: edit the server file, run Prettier on it, then copy it.
- **`@CeoOnly()`** is a fifth marker (kind `'ceo'`). It admits only a caller whose database roles include CEO. It is identity, not a capability, so it is never in the catalog and never grantable. Use it only for what nobody but the CEO may ever do (today: the «Ruxsatlar» API).
```

(d) Old:
```markdown
unit specs of services that ask `PermissionsService` provide `fakePermissions([...roleIds])`.
```
New:
```markdown
unit specs of services that ask `PermissionsService` provide `fakePermissions([...roleIds])`, or `fakePermissions([...roleIds], { userId, overrides })` when the spec must prove the check reads the right user (any other `userId` then holds nothing) or a CEO override.
```

- [ ] **Step 5: Update `client/CLAUDE.md`**

(a) Old:
```markdown
- **A link to a page some viewers cannot open is `CanLink`** (`@/components/shared/can-link`): those viewers get the text without the link.
```
New:
```markdown
- **A link to a page some viewers cannot open is `CanLink`** (`@/components/shared/can-link`): those viewers get the text without the link.
- **`@/lib/permission-deps` is a byte-for-byte copy of `server/src/common/permissions/permission-deps.ts`**: the dependency rules (turning a key on brings its requirements, turning it off takes its dependents) that the server enforces and the «Ruxsatlar» page previews. `permission-deps.test.ts` compares the two texts and runs the server's test vectors against the copy. Never edit the client copy: change the server file, format it there, copy it over.
- **«Ruxsatlar» (`/settings/permissions`, ADR-0086) is CEO-only by identity, not by a capability.**
  - The page lives in `components/settings/permissions/`. Data comes from `hooks/use-role-permissions.ts`.
  - Every decision is made in the pure, tested `permissions-model.ts`: cell state, lock and reason, yellow dot, red mark, «N tadan M tasi» (or «—» when every key of the section is locked for the role), the toggle plan, the confirm and reset texts, the history line. The components only draw.
  - Saves are never optimistic: the switch shows the server's answer after the refetch.
  - On a phone a role `Select` (`?rol=`) shows one role.
```

(b) Old:
```markdown
- **Link to an employee's page (`/settings/employees/<id>`) only when `canOpenEmployeeSettings(can)` holds**
```
New:
```markdown
- **An entry only the CEO may open takes `ceoOnly: true`, not a `permission`.** That is identity, not a capability (ADR-0086); only «Ruxsatlar» uses it. `getVisibleSettingsSections(can, isCeo)` and `canOpenSettingsPath(pathname, can, isCeo)` take `isCeoUser(user)` from `@/hooks/use-auth`, and `SettingsLayoutShell` and `SettingsMenu` pass it. The server refuses the page's API to everyone else (`@CeoOnly()`).
- **Link to an employee's page (`/settings/employees/<id>`) only when `canOpenEmployeeSettings(can)` holds**
```

(c) Old:
```markdown
«+ Avans berish» (`useCan("expenses.manage")` — the capability `POST /expenses` checks; the same gate covers the «Avanslar» day panel's add/edit/delete — the existing `SalaryAdvanceDialog`)
```
New:
```markdown
«+ Avans berish» (`useCan("salary.pay")` — an advance is written only with «Oylik va avans to'lash», ADR-0086: `ExpensesService` requires `salary.pay` for a `TEACHER_ADVANCE` and refuses `expenses.manage` alone; every other category requires `expenses.manage`. The routes carry `@Can('expenses.manage', 'salary.pay')` only so both holders reach that check; the same gate covers the «Avanslar» day panel's add/edit/delete — the existing `SalaryAdvanceDialog`)
```

(d) Old:
```markdown
Visible with `useCan("students.details")`; create, edit, sign and cancel need `students.manage` |
```
New:
```markdown
Visible with `useCan("students.details")`; create, edit, sign and cancel need `contracts.manage` («Shartnoma tuzish va imzolash», default Branch Director + Administrator, ADR-0086) |
```

- [ ] **Step 6: Add the spec changelog line**

Edit `docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md`. Old (the last line of §15):
```markdown
- 2026-10-10 — main'dagi pul qaytarish so'rovlari uchun 2 imkoniyat qo'shildi: refunds.hand-over, refunds.cancel (66)
```
New:
```markdown
- 2026-10-10 — main'dagi pul qaytarish so'rovlari uchun 2 imkoniyat qo'shildi: refunds.hand-over, refunds.cancel (66)
- 2026-10-11 — 2-bosqich (ADR-0086):
  - **Katalog 67 ta.** «Shartnoma tuzish va imzolash» (`contracts.manage`, D A) qo'shildi. Har imkoniyatda `allowedRoles` va qulf sababi bor (oltita sabab). Yetti imkoniyat faqat CEO'da, ular orasida `salary.close` ham bor (CEO, 11.10). O'qituvchiga faqat o'z ikkitasi beriladi.
  - **`UserPermission` jadvali 3-bosqichga o'tdi.** Bu bosqichda uni hech bir kod o'qimaydi (7.2 dan farq).
  - **CEO API** `@CeoOnly()` bilan. Tarix `GET /permissions/history` orqali.
  - **CEO javoblari (11.10).** Avans faqat «Oylik va avans to'lash» bilan yoziladi. «Moliya va marketing hisobotlari» «Xodimlar oyligini ko'rish»ni talab qiladi.
  - **Bosh sahifa keshi** ikkala bayroqdan tuziladi.
  - **Xodim tarixi** `balance` ni saqlamaydi va ko'rsatmaydi.
```

- [ ] **Step 7: Update the user guide page**

Edit `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`.

(a) Old:
```markdown
## Kim qila oladi

«Ha» — ekranda tugma yoki sahifa bor va tizim amalni qabul qiladi. «—» — ekranda yo'q va tizim rad etadi. Filial direktori va administrator faqat o'z filiali ichida ishlaydi.
```
New:
```markdown
## Ruxsatlar sahifasi (faqat CEO)

Har bir rol nima qila olishini CEO Sozlamalar → «Ruxsatlar» sahifasida o'zgartiradi. Sahifani faqat CEO ko'radi. Uni boshqa xodimga ochib bo'lmaydi.

- Jadvalda qatorlar imkoniyatlar bo'lib, ular bo'limlarga guruhlangan. Ustunlar rollar: filial direktori, administrator, kassir va o'qituvchi. Bo'lim sarlavhasini bossangiz, u ochiladi yoki yopiladi. Sarlavhada har bir rol uchun «5 tadan 3 tasi» kabi hisob turadi. Bo'limdagi birorta imkoniyatni shu rolga berib bo'lmasa, hisob o'rnida «—» turadi.
- Kalitni bossangiz, avval tasdiq oynasi chiqadi:
  - imkoniyat ishlashi uchun boshqasi ham kerak bo'lsa, oyna ularni «Birga yoqiladi» ostida sanaydi;
  - o'chirilayotgan imkoniyatga tayangan imkoniyatlar «Birga o'chadi» ostida chiqadi.

  «Yoqish» yoki «O'chirish» ni bosmaguningizcha hech narsa saqlanmaydi.
- Qizil nuqta pulni o'zgartiradigan yoki qaytarib bo'lmaydigan amalni bildiradi. Bunday imkoniyatda oyna qo'shimcha ogohlantiradi.
- Sariq nuqta katak boshlang'ich holatdan farq qilishini bildiradi, ya'ni uni siz o'zgartirgansiz.
- Qulf belgisi bu imkoniyatni shu rolga berib bo'lmasligini bildiradi. Qulfni bossangiz, sababi chiqadi, masalan «butun kompaniyaga ta'sir qiladi» yoki «o'qituvchi faqat o'z guruhlarini ko'radi». Yetti imkoniyat faqat CEO'da qoladi, masalan oylikni hisoblash va tasdiqlash, arxiv va kompaniya sozlamalari. O'qituvchiga faqat guruhlarni ko'rish va davomat olishni berish mumkin.
- Rolda o'zgarish bo'lsa, uning ustunida «Boshlang'ich holatga qaytarish» tugmasi chiqadi. U shu roldagi hamma o'zgarishni bekor qiladi. Oyna nima o'zgarishini oldindan ko'rsatadi.
- Pastdagi «O'zgarishlar tarixi» kim, qachon, qaysi rolga nimani yoqqani yoki o'chirganini ko'rsatadi.
- Telefonda avval yuqorida rol tanlanadi, keyin pastda shu rolning ro'yxati chiqadi.

O'zgarish xodimning keyingi bosishida kuchga kiradi, qayta kirish shart emas. U shu roldagi hamma xodimga tegadi. Bir nechta roli bor xodim hamma rollarining yig'indisini oladi. Filial chegarasi o'zgarmaydi: imkoniyat ochilgan xodim ham faqat o'z filialida ishlaydi.

## Kim qila oladi

Jadval boshlang'ich holatni ko'rsatadi. CEO «Ruxsatlar» sahifasida biror rolni o'zgartirgan bo'lsa, sizda boshqacha bo'lishi mumkin.

«Ha» — ekranda tugma yoki sahifa bor va tizim amalni qabul qiladi. «—» — ekranda yo'q va tizim rad etadi. Filial direktori va administrator faqat o'z filiali ichida ishlaydi.
```

(b) Old:
```markdown
- Sozlamalar → [Xodimlar](/settings/employees) — xodim qo'shish, lavozim, rol va holat. Menyuda faqat CEO va filial direktoriga ko'rinadi.
```
New:
```markdown
- Sozlamalar → [Xodimlar](/settings/employees) — xodim qo'shish, lavozim, rol va holat. Menyuda faqat CEO va filial direktoriga ko'rinadi.
- Sozlamalar → [Ruxsatlar](/settings/permissions) — har bir rolning imkoniyatlari. Faqat CEO ko'radi.
```

- [ ] **Step 8: Update the guide registry**

Edit `client/src/qollanma/sahifalar/boshlash.ts`, entry `sahifa: "rollar-va-huquqlar"`. Old:
```ts
    qisqacha:
      "Tizimda beshta rol bor va har biri o'z ishini qiladi; filial direktori va administrator faqat o'z filialida ishlaydi. Rol berish, xodim hisobini o'zgartirish va bloklash qoidalari, kim nima qila olishi shu yerda.",
    rollar: [1, 2, 3, 4, 5],
    adr: ["0001", "0002", "0007", "0026", "0027", "0028", "0054", "0063", "0081"],
    yollar: [],
```
New:
```ts
    qisqacha:
      "Tizimda beshta rol bor va har biri o'z ishini qiladi; filial direktori va administrator faqat o'z filialida ishlaydi. Rol berish, xodim hisobini o'zgartirish va bloklash qoidalari, kim nima qila olishi shu yerda. Har bir rolning imkoniyatlarini CEO «Ruxsatlar» sahifasida o'zgartiradi.",
    rollar: [1, 2, 3, 4, 5],
    adr: ["0001", "0002", "0007", "0026", "0027", "0028", "0054", "0063", "0081", "0086"],
    yollar: ["/settings/permissions"],
```
Old (the end of the same entry):
```ts
      "yangi filial",
      "o'z oyligi",
    ],
    yangilangan: "2026-10-10",
```
New:
```ts
      "yangi filial",
      "o'z oyligi",
      "ruxsatlar sahifasi",
      "imkoniyat",
      "qulf",
      "boshlang'ich holat",
      "boshlang'ich holatga qaytarish",
      "o'zgarishlar tarixi",
    ],
    yangilangan: "2026-10-11",
```
Both old excerpts are unique: «yangi filial» and «o'z oyligi» occur only in this entry. Check this before editing with `grep -c "o'z oyligi" client/src/qollanma/sahifalar/boshlash.ts`, which must print 1.

- [ ] **Step 9: Add the «Nima yangi» entry**

Edit `client/src/qollanma/yangiliklar.ts`. Old:
```ts
export const yangiliklar: Yangilik[] = [
  {
```
New:
```ts
export const yangiliklar: Yangilik[] = [
  {
    sana: "2026-10-11",
    sarlavha: "Ruxsatlar sahifasi",
    matn: "CEO endi Sozlamalar → «Ruxsatlar» sahifasida har bir rol nima qila olishini o'zi belgilaydi. Bu filial direktori, administrator, kassir va o'qituvchiga tegishli: imkoniyat kalit bilan yoqiladi yoki o'chiriladi. Kalit bosilganda tasdiq oynasi chiqadi. Unda birga yoqiladigan yoki birga o'chadigan imkoniyatlar oldindan ko'rsatiladi, pulga ta'sir qiladigan amalda esa qo'shimcha ogohlantirish bor. Qulf belgisi bu imkoniyatni shu rolga berib bo'lmasligini bildiradi; uni bossangiz, sababi chiqadi. Sariq nuqta boshlang'ich holatdan farqni ko'rsatadi. Har bir rolda «Boshlang'ich holatga qaytarish» tugmasi bor, pastda esa kim, qachon, nimani o'zgartirgani yoziladi. O'zgarish xodimning keyingi bosishida kuchga kiradi. Sahifani faqat CEO ko'radi. Hozircha hamma rol avvalgidek ishlaydi.",
    rollar: [1],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
  {
```

- [ ] **Step 10: Run the guide tests**

Run (from `client/`): `npx vitest run src/qollanma`
Expected: PASS. In particular, `reyestr.test.ts` checks that `/settings/permissions` is a real route (Task 10 created it), that the date is not in the future, that the newest entry is on top, and that the page link exists.

- [ ] **Step 11: Check the ADR reference and that no English reached the guide**

Run (from the worktree root):
```bash
grep -c "0086" client/src/qollanma/sahifalar/boshlash.ts docs/adr/README.md
grep -nE "\b(capability|permission|lock|reset|toggle|switch)\b" client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx client/src/qollanma/yangiliklar.ts | head
```
Expected: the first command prints 1 for each file. The second prints nothing (the guide and the news text are Uzbek only).

- [ ] **Step 12: Commit**

From the worktree root:
```bash
git add docs/adr/0086-ruxsatlar-sahifasi.md docs/adr/README.md docs/role-access.md server/CLAUDE.md client/CLAUDE.md docs/superpowers/specs/2026-10-05-ruxsatlar-tizimi-design.md client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx client/src/qollanma/sahifalar/boshlash.ts client/src/qollanma/yangiliklar.ts
git commit -m "$(cat <<'EOF'
docs(permissions): ADR-0086, role access, CLAUDE.md, guide for the Ruxsatlar page

ADR-0086 records the CEO-only page, differences-only storage, the six lock
reasons, the shared dependency file, the in-process cache clear and the
decisions carried in this branch (advances with salary.pay, contracts.manage,
reports.finance requires salary.view, no balance in employee history).
role-access.md gets the page and lock table; both CLAUDE.md files, the spec
changelog, the guide page and one «Nima yangi» entry follow.

Co-Authored-By: Claude <model> <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Full verification, the CEO's screenshot, PR

**Files:**
- Create (throwaway, never committed, deleted in Step 9): `client/scripts/_ruxsatlar-tekshiruv.mjs`. It lives under `client/` so that `import "playwright"` resolves from `client/node_modules` (a devDependency).
- Create (scratchpad, not the repo): the screenshots and `pr-body.md` in the executing session's scratchpad directory. Below, `<scratchpad>` stands for its absolute path: write the path out literally in every command (shell variables do not survive between Bash calls).
- No repository file changes, except a merge of `origin/main` if Step 1 needs it.

**Interfaces:**
- Consumes: everything from Tasks 1–12. Also the local docs stack, `cd server && npm run qollanma:baza` / `npm run qollanma:api` and `cd client && npm run qollanma:klient` (`client/CLAUDE.md` «User guide»). It is a throwaway local Docker database, `daf_docs` (seed: CEO login `ceo`, Branch Director `bd1`, dev password from `server/prisma/seed.ts`). The API runs on port 4100 with every external integration blanked, and the client on 3000.
- Produces: green suites, three screenshots for the CEO, and an open PR into `main`. Do not deploy or merge: the CEO merges.

**Database rule for this task:** no shared database is ever written. `qollanma:baza` runs `prisma db push` and the seed **only** against `postgresql://…@localhost:5433/daf_docs`, the throwaway docs database in the local `daf-postgres` container, rebuilt from scratch on every run (`server/scripts/qollanma-baza.sh`). It also runs `FLUSHALL` on the local `daf-redis` container, a documented side effect that also clears the regular local dev API's cache. That is the only database this task touches, and the browser check below is read-only on it (it aborts every non-GET request to `/permissions`). Never point anything at `server/.env`'s database (the shared dev database) or production, and never run `migrate dev`, `migrate deploy` or `db execute`. Production is not touched before the CEO merges; the migration reaches it only through the deploy after the merge. If `daf-postgres` cannot be started, skip Steps 4–7 and report it rather than using any other database.

- [ ] **Step 1: Bring the branch level with `main` (merge, never rebase or force-push)**

Run (from the worktree root):
```bash
git status --short
git fetch origin
git log --oneline HEAD..origin/main
```
If the last command prints nothing, go to Step 2. Otherwise:
```bash
git merge origin/main
```
Resolve conflicts if any. Keep both sides. `route-access.snapshot.json` and `branch-route-policy.ts` conflicts are usually row additions on both sides. Then check the two numbers this branch claims:
```bash
git ls-tree --name-only origin/main docs/adr/ | grep -E "^docs/adr/008[4-9]"
git ls-tree --name-only origin/main server/prisma/migrations/ | sort | tail -3
```
- If `origin/main` already has a `0086-*` ADR, take the next free number N. Then:
  - `git mv docs/adr/0086-ruxsatlar-sahifasi.md docs/adr/<N>-ruxsatlar-sahifasi.md`;
  - change `ADR-0086` → `ADR-<N>` only in this branch's own lines: `git grep -n "0086"` lists them, and per file `git grep -c "ADR-0086" origin/main -- <file>` must stay as on main;
  - commit `docs(adr): renumber the Ruxsatlar ADR to <N>`.
- If a migration directory on `origin/main` sorts after `20261012090000_role_permissions`, rename ours to a later timestamp with `git mv server/prisma/migrations/20261012090000_role_permissions server/prisma/migrations/<later>_role_permissions` and commit `chore(prisma): move the role_permissions migration after main's`.

After a merge, refresh the generated client and the dependencies when the lockfiles changed:
```bash
cd server && npx prisma generate && cd ..
git diff --name-only ORIG_HEAD HEAD -- server/package-lock.json client/package-lock.json
```
If a lockfile is listed, run `npm ci` in that package (`cd server && npm ci`, `cd client && npm ci`).

- [ ] **Step 2: Server — type-check, lint, format check, full suite (one after another, never in parallel)**

Run (from `server/`):
```bash
npm run typecheck
git diff --name-only --relative --diff-filter=ACMR origin/main...HEAD -- src scripts | grep '\.ts$' > <scratchpad>/server-touched.txt
xargs npx eslint < <scratchpad>/server-touched.txt
xargs npx prettier --check < <scratchpad>/server-touched.txt
npm test 2>&1 | tail -40
```
Expected:
- `typecheck` is silent.
- eslint reports no errors.
- prettier prints «All matched files use Prettier code style!».
- `npm test` shows `Tests: … passed` with 0 failed. It includes `permission-routes.spec.ts`, `branch-route-policy.spec.ts`, every `*.branch-isolation.spec.ts` and the ADR-0026/0027 specs.

A suite that fails with «Class extends value undefined» ran while `prisma generate` was writing: re-run that suite alone; it is not a code error. Any other failure: fix it in the task it belongs to, commit, and re-run only the failing spec and then the full suite.

Write down the totals line (`Tests: N passed`) for the PR body.

- [ ] **Step 3: Client — type-check, lint, tests, build (one after another)**

Run (from `client/`):
```bash
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npx vitest run 2>&1 | tail -8
npm run build 2>&1 | tail -15
```
Expected:
- `tsc` is silent.
- The lint summary line shows `0 errors` (warnings do not gate).
- vitest shows `Tests  N passed` with 0 failed.
- `next build` ends without an error, and its route list contains `/settings/permissions`.

Write down the vitest total for the PR body. Run `npm run build` before Step 4's dev server, never at the same time: both write `client/.next`.

- [ ] **Step 4: Start the local docs stack**

Check that the ports are free and the containers are up:
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN; lsof -nP -iTCP:4100 -sTCP:LISTEN
docker ps --format '{{.Names}}' | grep -E '^daf-(postgres|redis)$'
```
- If port 3000 or 4100 is held by a process that is not yours, stop and report it. The API's CORS admits only `localhost:3000`, so another port does not work, and another session's server must not be stopped.
- If a container is missing from the list, run `docker start daf-postgres daf-redis` once. If that fails, stop and report.

Build the database and start both servers. Use the Bash tool's `run_in_background` for the two servers; long `sleep` calls are blocked:
```bash
cd server && npm run qollanma:baza
```
Expected: the last line is `daf_docs tayyor.` The `RolePermission` table now exists in `daf_docs` (`db push` reads this branch's schema).

Then, in the background:
- `cd server && npm run qollanma:api > <scratchpad>/api.log 2>&1`
- `cd client && npm run qollanma:klient > <scratchpad>/klient.log 2>&1`

Wait with the Monitor tool:
- `until grep -q "successfully started" <scratchpad>/api.log; do sleep 3; done`
- `until grep -qE "Ready in|✓ Ready" <scratchpad>/klient.log; do sleep 3; done`

If `api.log` shows an error instead, read it once, fix the cause in its task, and restart.

- [ ] **Step 5: Write the read-only browser check**

Create `client/scripts/_ruxsatlar-tekshiruv.mjs`:
```js
#!/usr/bin/env node
/**
 * Throwaway check of the «Ruxsatlar» page (plan Task 13) against the local
 * daf_docs stack. Talks to localhost only; aborts and records any write to
 * /permissions, so «nothing was saved» is an assertion. Never committed.
 *
 *   node scripts/_ruxsatlar-tekshiruv.mjs <scratchpad dir>
 */
import { chromium } from "playwright";
import path from "node:path";

const KLIENT = "http://localhost:3000";
const API = "http://localhost:4100/api";
const API_ORIGIN = new URL(API).origin;
const ALLOWED = new Set([KLIENT, API_ORIGIN]);
// server/prisma/seed.ts dev password; the seed writes only to the local daf_docs database.
const PASSWORD = process.env.QOLLANMA_PAROL ?? "123456";
const OUT = process.argv[2];
if (!OUT) throw new Error("Usage: node scripts/_ruxsatlar-tekshiruv.mjs <scratchpad dir>");
const HIDE_DEV_BADGE = "nextjs-portal { display: none !important; }";
const writes = [];

async function signIn(login) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", Origin: KLIENT },
    body: JSON.stringify({ login, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`${login}: sign-in answered ${res.status} (is qollanma:api running on daf_docs?)`);
  return res.json();
}

async function openContext(browser, session, viewport) {
  const phone = viewport.width < 768;
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "uz-UZ",
    timezoneId: "Asia/Tashkent",
    isMobile: phone,
    hasTouch: phone,
  });
  await ctx.route(
    (url) => /^https?:$/.test(url.protocol) && !ALLOWED.has(url.origin),
    (route) => route.abort(),
  );
  // Registered last, so it runs first: no permission write may leave the browser.
  await ctx.route(
    (url) => url.origin === API_ORIGIN && url.pathname.startsWith("/api/permissions"),
    (route) => {
      const method = route.request().method();
      if (method === "GET" || method === "OPTIONS") return route.fallback();
      writes.push(`${method} ${route.request().url()}`);
      return route.abort();
    },
  );
  await ctx.addCookies([
    { name: "token", value: session.accessToken, url: KLIENT },
    { name: "refreshToken", value: session.refreshToken, url: KLIENT },
    { name: "user", value: encodeURIComponent(JSON.stringify(session.user)), url: KLIENT },
  ]);
  await ctx.addInitScript(({ companyId }) => {
    localStorage.setItem("theme", "light");
    if (companyId) localStorage.setItem("companyId", String(companyId));
  }, { companyId: session.user.companyId });
  return ctx;
}

async function openPermissions(page) {
  await page.goto(`${KLIENT}/settings/permissions`, { waitUntil: "load", timeout: 90_000 });
  await page.getByRole("heading", { name: "Ruxsatlar" }).waitFor({ timeout: 60_000 });
  await page.locator('[data-slot="skeleton"]').first().waitFor({ state: "detached", timeout: 30_000 });
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const ceo = await signIn("ceo");
  const bd = await signIn("bd1");
  const browser = await chromium.launch();
  try {
    // 1. CEO, wide screen: the entry, the page, two sections open, the screenshot.
    let ctx = await openContext(browser, ceo, { width: 1440, height: 900 });
    let page = await ctx.newPage();
    await page.goto(`${KLIENT}/settings`, { waitUntil: "load", timeout: 90_000 });
    await page.getByRole("link", { name: /^Ruxsatlar/ }).first().waitFor({ timeout: 30_000 });
    console.log("✓ CEO sees «Ruxsatlar» on /settings");

    await openPermissions(page);
    const studentsHeader = page.getByRole("button", { name: /^O'quvchilar/ });
    // The Teacher's keys in this section are all locked: its count reads «—», never «0 tadan 0 tasi».
    const headerText = await studentsHeader.innerText();
    must(headerText.includes("—") && !headerText.includes("0 tadan 0 tasi"), `Section count: ${headerText}`);
    await studentsHeader.click();
    await page.getByRole("button", { name: /^To'lovlar va qarzdorlik/ }).click();
    const cashierCancel = page.getByRole("switch", { name: "Kassir: Pul qaytarish so'rovini bekor qilish" });
    await cashierCancel.waitFor();
    must(
      (await cashierCancel.getAttribute("aria-checked")) === "false",
      "Kassir already holds refunds.cancel: daf_docs is not at the defaults (re-run qollanma:baza)",
    );
    await page.screenshot({ path: path.join(OUT, "ruxsatlar-kompyuter.png"), fullPage: true, style: HIDE_DEV_BADGE });
    console.log("✓ desktop screenshot; a fully locked section counts «—»");

    // 2. A lock opens its reason on click.
    await page.getByRole("button", { name: /^O'qituvchi: O'quvchilar ro'yxati — berib bo'lmaydi/ }).click();
    await page.getByText("Berib bo'lmaydi: o'qituvchi faqat o'z guruhlarini ko'radi").first().waitFor();
    await page.keyboard.press("Escape");
    console.log("✓ lock shows its reason");

    // 3. The confirmation: opened, read, cancelled. «Yoqish» is never pressed.
    await cashierCancel.click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    for (const want of ["Kassir", "Birga yoqiladi", "O'quvchiga pul qaytarish", "pulni o'zgartiradi", "Yoqish"]) {
      must(text.includes(want), `Confirm dialog lacks «${want}»:\n${text}`);
    }
    await dialog.screenshot({ path: path.join(OUT, "ruxsatlar-tasdiq.png"), style: HIDE_DEV_BADGE });
    await dialog.getByRole("button", { name: "Bekor qilish" }).click();
    await dialog.waitFor({ state: "detached" });
    must((await cashierCancel.getAttribute("aria-checked")) === "false", "The switch moved without a save");
    console.log("✓ confirm dialog lists the dependency and the warning; cancelled");
    await ctx.close();

    // 4. CEO, 375 px: the role picker and one role's column.
    ctx = await openContext(browser, ceo, { width: 375, height: 812 });
    page = await ctx.newPage();
    await openPermissions(page);
    await page.getByRole("combobox", { name: "Rol" }).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /^O'quvchilar/ }).click();
    const names = await page.getByRole("switch").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
    must(names.some((n) => n.startsWith("Filial direktori: ")), `No switch of the picked role: ${names.join(" | ")}`);
    must(!names.some((n) => /^(Administrator|Kassir|O'qituvchi): /.test(n)), `Phone shows other roles: ${names.join(" | ")}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    must(overflow <= 0, `Page scrolls sideways by ${overflow}px at 375 px`);
    await page.screenshot({ path: path.join(OUT, "ruxsatlar-telefon.png"), fullPage: true, style: HIDE_DEV_BADGE });
    console.log("✓ phone: role picker, one role, no sideways scroll; screenshot");
    await ctx.close();

    // 5. Branch Director: no entry, the URL bounces, the API refuses.
    ctx = await openContext(browser, bd, { width: 1440, height: 900 });
    page = await ctx.newPage();
    await page.goto(`${KLIENT}/settings`, { waitUntil: "load", timeout: 90_000 });
    await page.getByRole("link", { name: /^Xodimlar/ }).first().waitFor({ timeout: 30_000 });
    must((await page.getByRole("link", { name: /^Ruxsatlar/ }).count()) === 0, "Branch Director sees «Ruxsatlar»");
    await page.goto(`${KLIENT}/settings/permissions`, { waitUntil: "load", timeout: 90_000 });
    await page.waitForURL(`${KLIENT}/settings`, { timeout: 30_000 });
    console.log("✓ Branch Director: no entry, /settings/permissions bounces to /settings");
    await ctx.close();

    const asBd = await fetch(`${API}/permissions`, { headers: { Authorization: `Bearer ${bd.accessToken}`, Origin: KLIENT } });
    must(asBd.status === 403, `GET /permissions as Branch Director answered ${asBd.status}`);
    const asCeo = await fetch(`${API}/permissions`, { headers: { Authorization: `Bearer ${ceo.accessToken}`, Origin: KLIENT } });
    must(asCeo.status === 200, `GET /permissions as CEO answered ${asCeo.status}`);
    console.log("✓ API: CEO 200, Branch Director 403");

    must(writes.length === 0, `A permission write left the page: ${writes.join(", ")}`);
    console.log("✓ no write reached /permissions");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 6: Run the check**

Run (from `client/`):
```bash
node scripts/_ruxsatlar-tekshiruv.mjs <scratchpad>
```
Expected: eight `✓` lines and exit code 0.
- If Chromium is missing («Executable doesn't exist»), run `npx playwright install chromium` once and re-run.
- If a `must` fails, the message names what is wrong on the page. Fix the cause in Task 10 or 11, commit, and re-run. `next dev` hot-reloads, so the servers keep running.
- Two sign-ins happen per run, and sign-in is limited to 10 a minute per IP. Do not loop the script.

Then look at the three images once each with the Read tool, and check:
- `ruxsatlar-kompyuter.png` shows the header, the legend, 14 sections with counts per role («—» in the Teacher column of a fully locked section), two sections open with switches, locks and red dots.
- `ruxsatlar-tasdiq.png` shows «Kassir: «Pul qaytarish so'rovini bekor qilish» yoqilsinmi?» (or Task 9's exact title), «Birga yoqiladi: O'quvchiga pul qaytarish» and the red warning.
- `ruxsatlar-telefon.png` shows the role picker and one column.

If something is visibly broken (overlap, clipped text, English on screen), fix it, commit, and re-run Step 6.

- [ ] **Step 7: Stop the servers and clean up**

- Stop the two background servers with TaskStop (or `kill` the PIDs you started, after checking with `lsof -nP -iTCP:3000 -sTCP:LISTEN` / `:4100` that they are yours).
- Then run (from the worktree root):
```bash
rm client/scripts/_ruxsatlar-tekshiruv.mjs
git diff --quiet client/AGENTS.md || git checkout -- client/AGENTS.md
git status --short
```
Expected: `git status` prints nothing. `next dev` rewrites `client/AGENTS.md`, and the screenshots live in the scratchpad. Leave `daf_docs` as it is: it is the docs database, rebuilt from scratch by every `qollanma:baza`.

- [ ] **Step 8: Hand the screenshots to the CEO**

In your report, give these paths so the controller can show the CEO the real page before the PR is merged (spec §11):
- `<scratchpad>/ruxsatlar-kompyuter.png` (desktop)
- `<scratchpad>/ruxsatlar-telefon.png` (375 px)
- `<scratchpad>/ruxsatlar-tasdiq.png` (the confirmation)

The data in them is the seed's invented data: no production names or amounts.

- [ ] **Step 9: Push and open the PR**

First make sure no PR exists for the branch:
```bash
gh pr list --head ruxsatlar-sahifasi --state all
```
Expected: empty.
- If a PR is listed and OPEN, push to it instead of creating a new one.
- If it is MERGED, stop and report. Commits pushed after a merge never reach `main`.

Write `<scratchpad>/pr-body.md` with the Write tool. Replace the two `<N>` with the totals from Steps 2 and 3; they are measurements, not text to invent. The title and body are English (repository rule: PR title and body, commit messages, code comments and test names are English); on-screen Uzbek labels are quoted in «» exactly as the page shows them. The content:
````markdown
## What

A new CEO-only page: **Sozlamalar → «Ruxsatlar»** (`/settings/permissions`). On it the CEO turns each capability on or off for each staff role: Branch Director, Administrator, Cashier and Teacher.

- Capabilities are grouped in collapsible sections. Each section header shows a per-role count («N tadan M tasi»), or «—» when every key of the section is locked for that role.
- A toggle opens a confirmation first. It lists the capabilities that move with it («Birga yoqiladi» / «Birga o'chadi») and adds a warning when turning on a money or irreversible action.
- A lock means the capability can never be given to that role; tapping it shows the reason. A yellow dot marks a cell that differs from the default. A red dot marks a money or irreversible action.
- Each role has «Boshlang'ich holatga qaytarish» (reset to defaults). «O'zgarishlar tarixi» at the bottom lists who changed what and when.
- On a phone a role picker (`?rol=`) shows one role at a time.
- The page and its API (`GET /permissions`, `PUT /permissions/roles/:roleId`, `POST /permissions/roles/:roleId/reset`, `GET /permissions/history`) are CEO-only through a new `@CeoOnly()` marker. It reads the CEO role from the database and is never a capability, so it cannot be granted.
- A change takes effect on the employee's next request; no re-login is needed.

## What changes on the day it ships

Nothing for anyone. The new `RolePermission` table ships empty, so every role keeps exactly its current access. Only the CEO sees the new page. `route-access.snapshot.json` changes only by the 4 new CEO-only rows.

Also in this PR (CEO decisions of 10.10 and 11.10):
- An advance (`TEACHER_ADVANCE`) is written, edited and deleted only with `salary.pay` («Oylik va avans to'lash»); `expenses.manage` alone is refused for an advance, and `salary.pay` alone is refused for any other expense category. The client's «Avans berish» follows `useCan("salary.pay")`. Both keys default to the Branch Director only, so nobody's access changes.
- New capability `contracts.manage` («Shartnoma tuzish va imzolash») for the four contract-document writes and their buttons, defaults Branch Director + Administrator (as today). Reads stay on `students.details`; cancelling a signed contract stays CEO-only (ADR-0075).
- `reports.finance` now requires `salary.view`: the finance reports show staff salaries.
- `salary.close` (calculate, approve, close the month) is CEO-only and cannot be given to any role.
- Employee history (`User`) no longer stores or returns `balance`, including the teacher timeline.
- The dashboard cache key is built from every flag the payload depends on (money and outreach / operational).
- The group form's «add course» and «add teacher» links follow `courses.create` and `teachers.manage` respectively.

## Note for the CEO

Many capabilities can be opened for the Cashier, because the server confines the Cashier to its own branch like the Administrator. Before opening, note:
- «Davomat olish» for the Cashier also lets them edit an attendance that was already taken.
- «O'qituvchilar ro'yxati va profili» or «Xodimlar ro'yxati va kartasi» also opens the history and comments of the branch's records.
- «Filiallar: tahrirlash va yopish» lets the holder close their own branch.

## How it was tested

- Server: typecheck, lint, Prettier check, `npm test` — <N> tests passed. The route snapshot changed only by the 4 new rows; default access is unchanged.
- Client: `tsc`, lint, `npx vitest run` — <N> tests passed; `npm run build` passed.
- Local browser check on the throwaway `daf_docs` database (seed data only, read-only check):
  - the CEO opened the page at desktop and phone width;
  - a lock showed its reason, and a fully locked section counted «—»;
  - the confirmation listed the dependency and the warning, and was cancelled; nothing was saved;
  - the Branch Director does not see the entry, the URL bounces to `/settings`, and the API answers 403.

## Release order

Server first (migration: one new empty table, `RolePermission`), then the client. If the client went out first, only the CEO would see an error on the new page; nobody else is affected.

Decision record: ADR-0086.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

````

Then run (from the worktree root):
```bash
git push -u origin ruxsatlar-sahifasi
gh pr create --base main --head ruxsatlar-sahifasi \
  --title "feat(permissions): Ruxsatlar page — the CEO sets each role's capabilities (ADR-0086)" \
  --body-file <scratchpad>/pr-body.md
```
Expected: `gh` prints the PR URL. Never force-push and never merge. The CEO merges, and deploy is a separate step (server first, then client).

- [ ] **Step 10: Report**

Report:
- the PR URL;
- the two test totals;
- the three screenshot paths (Step 8);
- anything that changed during the merge with `main`: ADR or migration renumbering, conflicts.

---

## Appendix — drafting notes

CEO answers (11.10), applied throughout the plan (Global Constraints, file map, Tasks 1, 6, 7, 12, 13): an advance (`TEACHER_ADVANCE`) is written only with `salary.pay`, and `salary.pay` alone is refused for every other category; the client gate is `useCan("salary.pay")`. `reports.finance` requires `salary.view`. A section whose keys are all locked for a role shows «—» as its count. The notes below are the ones still worth knowing while executing; resolved drafting notes were removed.

### State of `main` (final edit, 11.10)
- The branch sits on `origin/main` 54016d9e (#704 `DafUhrzeit`, #705 task recurrences). Neither touches a file this plan quotes as "old", except `docs/adr/README.md` (rows 0084/0085, Task 12 Step 2 now appends after 0085), `client/CLAUDE.md` (+1 line, line references updated) and `client/src/qollanma/yangiliklar.ts` / `sahifalar/boshlash.ts` (other entries; this plan's excerpts still match). #705 adds `TaskRecurrence` with back-relations on `Company` and `User`, but not inside the lines Task 3 quotes, and three `@AnyStaff()` routes under `/tasks/recurrences` (no capability, so no `allowedRoles` or lock impact).
- The newest migration on `main` is `20261011120000_task_recurrence`; `20261012090000_role_permissions` still sorts after it. The `git show HEAD:server/prisma/schema.prisma` baseline in Task 3 already contains #704 and #705, so the verification diff shows only `RolePermission`.

### Server (Tasks 1–6)
- **Migration SQL without a database:** `npx prisma migrate diff --from-schema <old> --to-schema <new> --script` works with Prisma 7.5.0; the SQL in Task 3 is its exact output for the schema edit given.
- **Route rule:** running `discoverRoutes` over the code at drafting time, the only widened key with a COMPANY_WIDE non-GET route is `settings.branches` (`POST /branches`); no widened key has an UNREVIEWED route. `settings.reference` has nine COMPANY_WIDE writes (the reason lists), but its `allowedRoles` equal its defaults, so it is not widened. `permission-allowed-roles.spec.ts` takes keys only from routes with `access.kind === 'can'`: the new `'ceo'` routes carry none, and two of them are COMPANY_WIDE writes.
- **`REVIEWED_COMPANY_WIDE_WRITES` reason format:** each reason starts with `"<METHOD> <path>:"`; the spec matches routes by that prefix (one route per key — enough today).
- **Deliberate deviations:** `planToggle` with an unknown key returns `{ next: copy of current, also: [] }` (the page sends only catalog keys; the DTO rejects others). `effectiveForRoles` skips a final `stabilize`: each `keysForRole` result is already stable and a union of stable sets is stable (the 32-combination equivalence test pins it).
- **Key order:** the server spec checks the table order equals `PERMISSION_KEYS`; the client's `permission-keys.test.ts` checks the client list against the server. Together they pin `contracts.manage` after `students.initial-balance`.
- Task 1 touches `permissions.service.spec.ts` by one line; Task 3 replaces that spec wholesale and keeps every old assertion.
- `fakePermissions` with `userId` gives other users no roles as well as no keys (`forUser(8).roleIds` is `[]`).
- **Task 5 design points:** the dependency check loops over `requires` (equivalent to a `stabilize()` comparison, and it names the missing pair); saves run Serializable with `rethrowAsConflict(…, { duplicate: true })`, so a second CEO tab saving at once gets a 409; `invalidateAll()` runs after every committed save, a no-op save writes no history row; rows for keys the catalog no longer knows are never deleted, not even by reset (spec §7.2); the DTO messages are Uzbek, while `ParseIntPipe`'s message for a bad `:roleId` stays Nest's default English, as on every other route.
- **Task 5 relies on Task 1 data:** `salary.close` has `allowedRoles: []`, four `LOCK.COMPANY` reasons and `danger: 'money'`; `students.list` is `LOCK.OWN_GROUPS` for T; `expenses.manage` requires `expenses.view`; `cash.manage` and `students.sms` have no dependents; `outreach.view` is in D's defaults. And on Task 3: `keysForRole(r, [])` equals `defaultKeysForRoles([r])` for every editable role; the Prisma composite key is `companyId_roleId_key`.
- **Second balance leak (in Task 6):** `salary/teacher-timeline.service.ts` copies `User` history `oldValues`/`newValues` into its payload behind `teachers.view`; Task 6 redacts it too.
- **Open — dashboard cache key (reviewer's glance):** besides the two flags, the money block passes `performedById: ctx.userId` and the attention block passes `ctx.roles` to `getDebtors`/`getDebtorSummary`; the cache key carries neither. Left alone because, for the same branch scope, the payload does not appear to change per user or role.

### Client (Tasks 7–11)
- **Open — warning only when turning on (Task 9):** the money warning shows only when `on` is true; taking a money capability away moves no money. The red mark always shows. If the CEO wants the warning on removal too, change one line: `danger: keys.some(…)`.
- Task 9 relies on `loadServerCatalog()` returning `PERMISSIONS` and `PERMISSION_SECTIONS` (with `allowedRoles` and `lockReasons`) after the split; the test reads them through a local cast, so `ServerCatalog`'s interface need not change. The `sectionCount` expectations (D salary 3/3, K salary 0/2, A students 7/8, T students 0/0 → «—») come from the binding table, rows 1–8 and 40–44.
- `refresh()` after a write is a no-op for the CEO (who holds every key); kept as specified, it costs one GET.
- `isCeoUser`: the seven inline `roles.some((r) => r.id === 1)` copies in `components/` are left alone (out of scope).
- **Deliberate deviations from `client/CLAUDE.md`:** the permission matrix has no `#` column (a settings form, not a record table; the history table has one); the history is a fixed 20 per page without a size selector (like `EntityHistoryTable`); saves are not optimistic; the history date is «dd.MM.yyyy, HH:mm» with the comma, as `EntityHistoryTable` prints it.
- **Small choices:** counts per role column on desktop; sections start collapsed; the phone's role is in the URL (`?rol=`); locks open on tap through a controlled tooltip and the phone prints the reason under the label; yellow/red use `yellow-*` / `red-*` (`amber-*` renders transparent on the admin portal); the settings entry icon is `ShieldCheck`; components leave their return type to inference (React 19 has no global `JSX` namespace).

### Docs and verification (Tasks 12–13)
- **Dates:** docs are dated 2026-10-11; Task 12 tells the executor to use the actual Tashkent day if later. `reyestr.test.ts` fails on a future date, so the yangiliklar entry must never be ahead of the commit day.
- **Task 13's database:** `qollanma:baza` runs `prisma db push` on the local throwaway `daf_docs` database only — a narrow exception to «never `db push`», which is about shared databases. It also `FLUSHALL`s the local `daf-redis` (documented side effect). The browser check is read-only. Sign-in uses the seed's dev password from `server/prisma/seed.ts` against localhost only, as `qollanma-skrinshot.mjs` does.
- **Commit trailers** use `Claude <model>`; the executor substitutes its own model name.
- **Risks:** `useIsMobile()` is effect-based, so a phone first paints the desktop table for one frame (existing pages behave the same); on 768–1100 px with the sidebar open the table scrolls horizontally inside its box; `next build` and `next dev` share `client/.next`, so Task 13 runs the build before starting the dev server.
