# Filial chegarasi tuzatishlari (branch-boundary fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the cross-branch holes found on 10.10.2026: every id-addressed or branch-named read and write a non-CEO caller reaches stays inside their own branches, and the CEO's three decisions of 10.10.2026 hold (branch holidays, CEO-only branch creation, no self-pay).

**Architecture:** No new mechanism. Each hole is closed with the branch helpers the code base already uses (`@BranchScope()`, `@BranchCeiling()`, `assertCallerInBranch`, `assertCallerMayTouchStudent`/`…WriteForStudent`, `assertCallerMayTouchGroup`, `resolvePayrollBranchScope`). The branch manifest (`server/src/common/auth/branch-route-policy.ts`) records each route's confinement; its `UNREVIEWED` backlog drops from 79 to 7, and the 7 left are CEO-only capabilities (archive, gateway log, Telegram unlink).

**Tech Stack:** NestJS + Prisma + Jest (server), Next.js + Vitest (client).

**Source of the findings:** three read-only reviews of 10.10.2026, kept in the session scratchpad: `review-unreviewed-routes.md` (the 79 UNREVIEWED routes), `review-allowed-roles-A.md` §0.1/§0.3 (money writes, advances), `review-allowed-roles-B.md` §8, §10, §16 (salary reads, timeline, self-pay).

## Global Constraints

- Work in the worktree `/Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi`, branch `filial-chegarasi`. Never `cd` to the main checkout.
- Server commands run from `server/`: `npx jest <path>`, `npm run typecheck`, `npx eslint <files>`, `npx prettier --write <files>` (only `.ts` files, by name — never `src/common/permissions/route-access.snapshot.json`), `npm test`. Client commands run from `client/`: `npx vitest run <path>` (or `npx vitest --config vitest.config.ts run <path>` on a configLoader error), `npx tsc --noEmit`, `npm run lint`. **Never run Prettier on `client/` files.**
- **Default access does not change.** No `@Can`/`@AnyStaff`/`@AnyUser`/`@StudentOnly` marker changes; `route-access.snapshot.json` is not edited, except that Task 6 removes the row of the one route this plan deletes (`GET /reports/lead-analytics`, which no screen calls); `permission-routes.spec.ts` stays green. A fix narrows WHICH ROWS a caller reaches (their branch), never which routes they may call.
- **Branch rule:** a non-CEO caller acts only on the branches in `mainBranch ∪ UserBranch`; the CEO spans every branch. Reuse the existing helpers; never write a new branch lookup.
- **CEO decisions (10.10.2026), binding:**
  1. A holiday for the whole centre (`branchId` null) is created, edited, cancelled or deleted only by the CEO. A Branch Director or Administrator creates and manages holidays only for their own branch.
  2. Only the CEO opens a new branch (`POST /branches`). A Branch Director keeps editing their own branch.
  3. Nobody but the CEO pays their OWN salary or writes a `TEACHER_ADVANCE` expense to THEMSELVES; another manager does it.
- **The branch manifest stays green after every task.** A route that gains `@BranchScope()` leaves `UNREVIEWED_ROUTES` in the same task; a route fixed by an entity or service check moves into a `ROUTE_POLICIES` block whose `reason` is true of every route in it. `UNREVIEWED_BUDGET` only shrinks: 79 → 26 (Task 1) → 22 (Task 2) → 19 (Task 3) → 13 (Task 4) → 9 (Task 5) → 7 (Task 6).
- All user-visible text is Uzbek, Latin script, no English words; reuse an existing message for the same refusal. Code comments, test names, commit messages: English. Commit messages end with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer naming the model that wrote the commit.
- No database migration (`Holiday.branchId` already exists).

---

### Task 0: Worktree setup

**Files:** none.

- [ ] **Step 1: Confirm the branch and base**

Run: `cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi && git status --short && git log --oneline -1`
Expected: clean tree, branch `filial-chegarasi`, HEAD at or after `39a3ea42`.

- [ ] **Step 2: Install and generate**

Run: `cd server && npm ci && npx prisma generate`, then `cd ../client && npm ci`.
Expected: both succeed. Do not symlink `node_modules`.

- [ ] **Step 3: Baseline**

Run: `cd server && npx jest src/common/auth src/common/permissions`
Expected: PASS.

---

### Task 1: Record the 53 routes the review found already confined or genuinely company-wide

**Files:**
- Modify: `server/src/common/auth/branch-route-policy.ts` (`ROUTE_POLICIES`, `UNREVIEWED_ROUTES`, `UNREVIEWED_BUDGET`)

**Interfaces:** nothing new. Later tasks extend or rewrite some of the blocks added here (Task 2 the holiday READ block, Task 3 the `POST /branches` block, Task 6 the money-reports BY_SERVICE block).

This task changes no behaviour: it writes down what the review established by reading the code (file:line evidence in `review-unreviewed-routes.md` §1).

- [ ] **Step 1: Append the blocks to `ROUTE_POLICIES`**

Insert the following blocks at the end of the `ROUTE_POLICIES` array (just before its closing `];`), verbatim:

```ts
{
  policy: 'COMPANY_WIDE',
  reason:
    'The three reason lists — student exit, enrollment transfer, group ' +
    'teacher change. `StudentExitReason`, `EnrollmentTransferReason` and ' +
    '`GroupTeacherChangeReason` carry `companyId` and no `branchId`, every ' +
    'query filters by `companyId` alone, and both branches pick from the same ' +
    'list, so there is no branch to confine to. The writes change that shared ' +
    'list for every branch; they sit behind `settings.reference`, which Branch ' +
    'Director and Administrator hold by default, so that capability must not ' +
    'be widened past its defaults without a decision (spec §6). Deleting is a ' +
    'soft delete: enrollments and history that already name a reason keep it.',
  routes: [
    'GET /student-exit-reasons',
    'POST /student-exit-reasons',
    'PATCH /student-exit-reasons/:id',
    'DELETE /student-exit-reasons/:id',
    'GET /enrollment-transfer-reasons',
    'POST /enrollment-transfer-reasons',
    'PATCH /enrollment-transfer-reasons/:id',
    'DELETE /enrollment-transfer-reasons/:id',
    'GET /group-teacher-change-reasons',
    'POST /group-teacher-change-reasons',
    'PATCH /group-teacher-change-reasons/:id',
    'DELETE /group-teacher-change-reasons/:id',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    "Lead sources (Instagram, tavsiya, …) are one list for the whole centre: " +
    '`LeadSource` has no `branchId`, and both reads return source ids and ' +
    'names only. `GET /lead-sources/filter` also reads `Lead.sourceId` across ' +
    'every branch, but only to keep a deleted source in the filter while some ' +
    'lead still uses it — it returns the source, never the lead. The writes ' +
    '(`leads.setup`, Branch Director and Administrator by default) change the ' +
    'list for every branch. None of these queries filters by `companyId` ' +
    'either; that is a tenant gap, not a branch one, and matters only once a ' +
    'second company exists.',
  routes: [
    'GET /lead-sources',
    'GET /lead-sources/filter',
    'POST /lead-sources',
    'PATCH /lead-sources/:id',
    'DELETE /lead-sources/:id',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    'Mock-exam sections ("IELTS Mock", "SAT Mock") are a company-level ' +
    'grouping: `MockExamSection` has `companyId` and no `branchId`, and every ' +
    'query is `companyId`-filtered. The exams inside DO carry a branch ' +
    '(`MockExam.branchId`) and are confined by their own `@BranchScope()` ' +
    'routes; only their COUNT crosses here — `examCount` and the delete guard ' +
    "count every branch's exams, so a director may see 3 where their branch " +
    'holds 1, and cannot delete a section another branch still uses. Writes ' +
    '(`mock.manage`, Branch Director and Administrator by default) rename, ' +
    'recolour or reorder the sections for every branch.',
  routes: [
    'GET /mock-exam-sections',
    'POST /mock-exam-sections',
    'PATCH /mock-exam-sections/:id',
    'PATCH /mock-exam-sections/reorder',
    'DELETE /mock-exam-sections/:id',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    'Holiday READS. Every holiday row today is company-wide: ' +
    '`HolidaysService.create` never writes `branchId`, no other path sets it, ' +
    'and the 2026-08-05 migration left it null on purpose (null = a national ' +
    'holiday). The list, the detail and the status trail are the company ' +
    'calendar every staff screen needs (spec §4.6). If a branch-only holiday is ' +
    'ever written, the list will show it to the other branch as well and must ' +
    'be revisited. The holiday WRITES are not here: they move every ' +
    "branch's groups and are still UNREVIEWED.",
  routes: [
    'GET /holidays',
    'GET /holidays/:id',
    'GET /holidays/:id/status-history',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    "The company row itself: name, phone, logo, lead-form text, the DaF " +
    "activity norms. `GET /company` returns only the caller's own company " +
    '(`where: { id: companyId }`) with no relations; `PATCH /company/:id` ' +
    "refuses another company's id and needs `settings.company`, which no role " +
    'but the CEO holds by default. `GET /company/:id` is NOT here: it ' +
    'includes every branch and every course.',
  routes: ['GET /company', 'PATCH /company/:id'],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    'Opening a branch. There is no existing branch to check against: the row ' +
    "is new, and its transaction writes only that branch's own two cash " +
    'accounts and its NEW lead column. It is company structure, not branch ' +
    'data. `settings.branches` is held by Branch Director by default, so a ' +
    'director can open a branch they are not attached to — no `UserBranch` ' +
    'row is written, so they cannot see it afterwards; widening the ' +
    'capability further needs a decision first (spec §6).',
  routes: ['POST /branches'],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    'Telegram groups that carry no branch. A PENDING group has none yet — the ' +
    'bot cannot know which company or branch a new chat belongs to — so ' +
    '`GET /telegram-groups/pending` lists every pending group across ' +
    'companies (first approver wins), and `POST /telegram-groups/:id/reject` ' +
    'refuses an APPROVED group with 400, so it only ever touches a ' +
    'branch-less row. `POST /telegram-groups/announce` is product news sent to ' +
    'every approved group of every company by design, behind ' +
    '`telegram.announce`, which only the CEO holds by default.',
  routes: [
    'GET /telegram-groups/pending',
    'POST /telegram-groups/:id/reject',
    'POST /telegram-groups/announce',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    '«Bot hisoboti»: the channel gate counts Telegram users who were asked to ' +
    "join the centre's channel before using the bot. " +
    '`TelegramChannelGateEvent` has no branch and no link to a student or ' +
    'employee — the gate meets people before anyone knows who they are — so ' +
    'there is nothing to confine. Both routes read `DEFAULT_COMPANY_ID` only.',
  routes: [
    'GET /telegram/channel-report/list',
    'GET /telegram/channel-report/summary',
  ],
},
{
  policy: 'COMPANY_WIDE',
  reason:
    '`POST /upload` writes no row: it stores an image in the bucket and ' +
    'returns its URL. Nothing is attached to a record until a separate, ' +
    'scoped route saves that URL, so there is no branch question here.',
  routes: ['POST /upload'],
},
{
  policy: 'BRANCH_SCOPED_BY_SERVICE',
  reason:
    "The branch switcher's option list. It takes `@BranchCeiling()` — the " +
    "caller's whole ceiling from `resolveCallerBranchScope`, not the current " +
    'selection — and filters `id: { in: ceiling }`, so a confined caller ' +
    'cannot enumerate a branch that is not theirs and a CEO (`null`) sees ' +
    'all. The ceiling rather than `@BranchScope()` is deliberate: narrowing ' +
    'by the selected branch would leave the user unable to switch away.',
  routes: ['GET /branches'],
},
{
  policy: 'BRANCH_SCOPED_BY_ENTITY',
  reason:
    'The branch record itself. The requested id is looked up under ' +
    '`AND: [{ id: { in: ceiling } }]` (`@BranchCeiling()`), so a branch ' +
    "outside the caller's ceiling answers the same 404 as a missing one, " +
    'and the counts added to it are of that same branch.',
  routes: ['GET /branches/:id'],
},
{
  policy: 'BRANCH_SCOPED_BY_ENTITY',
  reason:
    'The signed Telegram invitation (ADR-0029). The branch is named in the ' +
    'body and checked against the caller read from the DATABASE ' +
    '(`whereUserMayAct()`): a non-CEO may mint a link only for a branch in ' +
    'their `mainBranch` ∪ `UserBranch`, and only for roles inside ' +
    '`grantableRoleIdsFor` (ADR-0026). The account it later creates skips the ' +
    'caller checks precisely because the link already carries them.',
  routes: ['POST /telegram/employee-link'],
},
{
  policy: 'BRANCH_SCOPED_BY_SERVICE',
  reason:
    "Money reports scoped by the controller's own `resolveScope` " +
    '(`resolveCallerReportBranchIds(userId, query.branchId)`, ceiling ∩ ' +
    'requested, 403 on an empty scope) — the plumbing of ' +
    '`GET /reports/profit-composition`. The one list reaches every leg: the ' +
    'overview (pinned by `reports-branch-scope-coverage.spec.ts`) and the ' +
    "facade's expectation, month charges and debt split; the trend's " +
    '`getFinancialTrend` (pinned) and per-month canonical profit; the income ' +
    'attribution; write-offs through `branchIdWhere`; the expectation history ' +
    "through each branch's own snapshot rows. The overview's salary card is " +
    'confined by payroll scope from `performedById`, after `resolveScope` has ' +
    'already refused a branch outside the ceiling. The history\'s holiday ' +
    'markers are not branch-filtered: holidays are company-wide.',
  routes: [
    'GET /reports/debt-write-offs-summary',
    'GET /reports/expectation-history',
    'GET /reports/financial-overview',
    'GET /reports/financial-trend',
    'GET /reports/income-month-attribution',
  ],
},
{
  policy: 'SELF',
  reason:
    "The student portal's own-card routes (`@StudentOnly()`). Every handler " +
    'but the password change refuses a token without `studentId` (404) before ' +
    "any query and keys every read and write on `@CurrentUser('studentId')`: " +
    'profile, schedule, attendance, payment history, name, photo, the payment ' +
    "intent and checkout link. The QR scan writes only the caller's own " +
    'attendance row and refuses a group the caller is not enrolled in. ' +
    "`PATCH /student-portal/password` is keyed on `@CurrentUser('id')`, the " +
    "caller's own account, behind `OwnPasswordAttemptGuard`. No student id " +
    'comes from the request.',
  routes: [
    'GET /student-portal/profile',
    'GET /student-portal/schedule',
    'GET /student-portal/attendance/stats',
    'GET /student-portal/attendance/history',
    'GET /student-portal/payments',
    'PATCH /student-portal/name',
    'PATCH /student-portal/password',
    'POST /student-portal/photo',
    'DELETE /student-portal/photo',
    'POST /student-portal/payments/init',
    'POST /student-portal/attendance/scan',
  ],
},
```

- [ ] **Step 2: Shrink `UNREVIEWED_ROUTES` to the 26 routes still open**

Replace the whole `UNREVIEWED_ROUTES` array literal with exactly these 26 entries (keep the doc comment above it):

```ts
export const UNREVIEWED_ROUTES: string[] = [
  'DELETE /archive/:entityType/:id',
  'DELETE /holidays/:id',
  'DELETE /telegram-groups/:id',
  'GET /archive/:entityType',
  'GET /archive/:entityType/:id',
  'GET /archive/counts',
  'GET /company/:id',
  'GET /gateways/events',
  'GET /groups/available-rooms',
  'GET /groups/available-slots',
  'GET /groups/available-teachers',
  'GET /groups/next-name',
  'GET /groups/schedule-conflicts',
  'GET /leads/:id/hover-summary',
  'GET /leads/by-student/:studentId',
  'GET /lesson-reschedules/available-rooms',
  'GET /reports/financial-excel',
  'GET /reports/lead-analytics',
  'GET /rooms/count-by-branch',
  'GET /telegram-groups',
  'PATCH /holidays/:id',
  'PATCH /holidays/:id/status',
  'PATCH /leads/reorder',
  'POST /archive/:entityType/:id/restore',
  'POST /holidays',
  'POST /leads',
];
```

Seven of these stay for good (archive ×5, `GET /gateways/events`, `DELETE /telegram-groups/:id`): their capabilities are CEO-only by default, and labelling them would be false (archived students and gateway payments are branch data). Tasks 2–6 remove the other 19.

- [ ] **Step 3: Lower the ceiling**

Replace `export const UNREVIEWED_BUDGET = 79;` with `export const UNREVIEWED_BUDGET = 26;`.

- [ ] **Step 4: Run the manifest spec**

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS — every route classified exactly once, no route listed that the source evidences as header-scoped, budget 26.

- [ ] **Step 5: Format, lint, commit**

```bash
cd server
npx prettier --write src/common/auth/branch-route-policy.ts
npx eslint src/common/auth/branch-route-policy.ts
git add src/common/auth/branch-route-policy.ts
git commit -m "docs(branch-policy): classify 53 reviewed routes; UNREVIEWED backlog 79 -> 26

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 2: Holidays belong to a branch; only the CEO touches a centre-wide holiday

CEO decision (10.10.2026): a holiday with `branchId` null is the whole centre's and only the CEO creates, edits, cancels or deletes it. A Branch Director or Administrator creates and manages holidays only for a branch they work in. Whose a holiday is gets fixed when it is created. The group end-date cascade moves only that branch's groups. `GET /holidays` shows the centre-wide holidays plus the caller's scope, never another branch's.

Task 2b (right after this one) makes the remaining holiday readers follow the group's branch. Ship both in the same PR.

**Files:**
- Modify: `server/src/holidays/dto/create-holiday.dto.ts` (optional `branchId`)
- Modify: `server/src/holidays/dto/update-holiday.dto.ts` (comment only: no `branchId`, on purpose)
- Create: `server/src/holidays/dto/holiday-dto.spec.ts`
- Modify: `server/src/holidays/holidays.service.ts` (write rule, read rule, branch-scoped list, `branchId` on create)
- Modify: `server/src/holidays/holidays.controller.ts` (`@BranchScope()` on the list, caller id on the detail and the status trail)
- Modify: `server/src/groups/group-holiday-cascade.service.ts` (refuse another branch's group, read the group's branch holidays only)
- Modify: `server/src/common/auth/branch-route-policy.ts` (manifest)
- Modify: `server/CLAUDE.md` (one bullet in «Holidays»)
- Create: `client/src/lib/holiday-scope.ts`, `client/src/lib/holiday-scope.test.ts`
- Modify: `client/src/hooks/use-edit-holiday.ts`, `client/src/components/settings/holidays-settings-client.tsx`, `client/src/components/settings/edit-holiday-form.tsx`, `client/src/components/settings/holiday-row-actions.tsx`
- Modify (user guide): `client/src/qollanma/kontent/guruhlar/bayramlar.mdx`, `client/src/qollanma/sahifalar/guruhlar.ts`, `client/src/qollanma/yangiliklar.ts`
- Unchanged: `client/src/components/settings/edit-holiday-drawer.tsx` (it only hosts the form)
- Test: `server/src/holidays/holidays.service.spec.ts`, `server/src/holidays/holidays.controller.spec.ts`, `server/src/groups/group-holiday-cascade.service.spec.ts`, `server/src/common/auth/branch-route-policy.spec.ts` (unchanged, must stay green)

**Interfaces:**
- Consumes:
  - `resolveCallerBranchScope(prisma: PrismaService | Prisma.TransactionClient, userId: number | undefined): Promise<{ kind: 'all' } | { kind: 'branches'; branchIds: number[] }>` (`server/src/common/auth/branch-scope.ts`). Reads `prisma.user.findFirst({ where: { id, deletedAt: null }, select: { mainBranch, branches: { select: { branchId } }, roles: { select: { role: { select: { name } } } } } })`; the CEO role gives `{ kind: 'all' }`.
  - `assertCallerInBranch(prisma, userId: number | undefined, branchId: number, message?: string): Promise<void>` (same file). Throws `ForbiddenException(message)`.
  - `@BranchScope()` param decorator (`server/src/common/decorators`, re-exported from `common/auth/branch-scope.guard.ts`), which gives `ReportBranchIds` (`number[] | null`, from `server/src/common/finance/report-branch-scope.ts`): `null` = every branch (a CEO on «Barcha filiallar»), `[n]` = that branch, `[]` = nothing.
  - Client: `useAuth((s) => s.user)` (`roles: { id: number; name: string }[]`), and `useBranchSwitcher` (`selectedBranch: { id; name } | null`, `branches: { id; name }[]`).
- Produces:
  - `HolidaysService.findAll(query, companyId: number, branchIds: ReportBranchIds)`, `findOne(id, companyId, userId: number)`, `getStatusHistory(id, companyId, userId: number)`.
  - `CreateHolidayDto.branchId?: number | null`.
  - `GET /holidays` rows carry `branchId` and `branch: { name } | null`.
  - Client `lib/holiday-scope.ts`: `CENTRE_WIDE`, `CENTRE_WIDE_LABEL`, `ApiHoliday`, `toHoliday`, `holidayScopeLabel`, `mayManageHoliday`, `holidayBranchChoices`, `newHolidayBranchId`.
  - Task 2b depends on none of these.

- [ ] **Step 1: Write the failing tests**

**1a.** In `server/src/holidays/holidays.service.spec.ts`:

Replace the import line
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
```
with
```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
```

Replace
```ts
  const COMPANY_ID = 1001;
  let service: HolidaysService;
```
with
```ts
  const COMPANY_ID = 1001;
  // Every write checks the caller against the holiday's branch. The tests
  // outside «branch rule» are about other things, so their caller is a CEO.
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const CENTRE_WIDE = 'Butun markaz bayrami bilan faqat CEO ishlay oladi';
  const BRANCH_REFUSAL = 'Bu filial sizning ruxsatingizda emas';
  let service: HolidaysService;
```

In the `beforeEach` Prisma mock, replace
```ts
      groupHolidayExtension: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
```
with
```ts
      groupHolidayExtension: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findFirst: jest.fn().mockResolvedValue(CEO_CALLER) },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };
```

Replace the whole existing `describe('findAll', ...)` block (it starts with `  describe('findAll', () => {` and ends just before `  describe('findOne', () => {`) with
```ts
  describe('findAll', () => {
    it('returns paginated holidays with defaults page=1, pageSize=10', async () => {
      const result = await service.findAll({}, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, companyId: COMPANY_ID },
          skip: 0,
          take: 10,
          orderBy: { date: 'asc' },
        }),
      );
      expect(result).toEqual({
        data: [mockHoliday],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    });

    it('applies search filter (case-insensitive contains)', async () => {
      await service.findAll({ search: 'navro' }, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            deletedAt: null,
            companyId: COMPANY_ID,
            name: { contains: 'navro', mode: 'insensitive' },
          },
        }),
      );
    });

    it('honours page and pageSize', async () => {
      await service.findAll({ page: 3, pageSize: 20 }, COMPANY_ID, null);
      expect(prisma.holiday.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 40, take: 20 }),
      );
    });
  });

```

Replace the whole existing `describe('findOne', ...)` block (from `  describe('findOne', () => {` to just before `  describe('create', () => {`) with
```ts
  describe('findOne', () => {
    it('returns the holiday when found', async () => {
      const result = await service.findOne('h-1', COMPANY_ID, 7);
      expect(result).toEqual(mockHoliday);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.holiday.findFirst.mockResolvedValue(null);
      await expect(service.findOne('missing', COMPANY_ID, 7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

```

In `describe('company scope on id-addressed reads', ...)`, replace
```ts
      await service.findOne('h-1', COMPANY_ID);
```
with
```ts
      await service.findOne('h-1', COMPANY_ID, 7);
```
and replace
```ts
      await expect(service.findOne('h-1', 2002)).rejects.toThrow(
```
with
```ts
      await expect(service.findOne('h-1', 2002, 7)).rejects.toThrow(
```

Insert this block directly before `  describe('findActiveHolidayCovering', () => {`:
```ts
  // CEO decision 10.10.2026: a holiday of the whole centre (`branchId` null)
  // is the CEO's alone; a director or administrator manages only their own
  // branch's. The caller here is a Fargona administrator.
  describe('branch rule', () => {
    const FARGONA_ADMIN = {
      mainBranch: 1,
      branches: [{ branchId: 1 }],
      roles: [{ role: { name: 'Administrator' } }],
    };
    const fargona = { ...mockHoliday, branchId: 1 };
    const namangan = { ...mockHoliday, branchId: 2 };

    beforeEach(() => {
      prisma.user.findFirst.mockResolvedValue(FARGONA_ADMIN);
    });

    describe('create', () => {
      it('refuses an Administrator a centre-wide holiday and moves nothing', async () => {
        const done = service.create(
          { name: "Navro'z", date: '2026-03-21' },
          5,
          COMPANY_ID,
        );
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(CENTRE_WIDE);
        expect(prisma.holiday.create).not.toHaveBeenCalled();
        expect(prisma.group.findMany).not.toHaveBeenCalled();
        expect(entityHistoryService.recordCreate).not.toHaveBeenCalled();
      });

      it("writes an Administrator's holiday to their branch and moves only that branch's groups", async () => {
        prisma.holiday.create.mockResolvedValue(fargona);

        await service.create(
          { name: 'Filial yopiq', date: '2026-09-01', branchId: 1 },
          5,
          COMPANY_ID,
        );

        expect(prisma.branch.findFirst).toHaveBeenCalledWith({
          where: { id: 1, companyId: COMPANY_ID, deletedAt: null },
          select: { id: true },
        });
        expect(prisma.holiday.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ branchId: 1, companyId: COMPANY_ID }),
        });
        expect(prisma.group.findMany.mock.calls[0][0].where.branchId).toBe(1);
      });

      it("refuses an Administrator another branch's holiday", async () => {
        prisma.branch.findFirst.mockResolvedValue({ id: 2 });
        const done = service.create(
          { name: 'Namangan yopiq', date: '2026-09-01', branchId: 2 },
          5,
          COMPANY_ID,
        );
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(BRANCH_REFUSAL);
        expect(prisma.holiday.create).not.toHaveBeenCalled();
      });

      it("answers 404 for a branch outside the company, before reading the caller", async () => {
        prisma.branch.findFirst.mockResolvedValue(null);
        await expect(
          service.create(
            { name: 'X', date: '2026-09-01', branchId: 9 },
            5,
            COMPANY_ID,
          ),
        ).rejects.toThrow(NotFoundException);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
        expect(prisma.holiday.create).not.toHaveBeenCalled();
      });

      it('lets the CEO declare one for the whole centre or for any branch', async () => {
        prisma.user.findFirst.mockResolvedValue(CEO_CALLER);

        await service.create({ name: "Navro'z", date: '2026-03-21' }, 7, COMPANY_ID);
        expect(prisma.holiday.create.mock.calls[0][0].data.branchId).toBeNull();

        prisma.branch.findFirst.mockResolvedValue({ id: 2 });
        await service.create(
          { name: 'Namangan yopiq', date: '2026-03-25', branchId: 2 },
          7,
          COMPANY_ID,
        );
        expect(prisma.holiday.create.mock.calls[1][0].data.branchId).toBe(2);
      });
    });

    describe.each([
      [
        'update',
        (s: HolidaysService) =>
          s.update('h-1', { name: 'Yangi nom' }, 5, COMPANY_ID),
      ],
      [
        'changeStatus',
        (s: HolidaysService) =>
          s.changeStatus('h-1', { status: 'CANCELLED' as any }, 5, COMPANY_ID),
      ],
      ['remove', (s: HolidaysService) => s.remove('h-1', 5, COMPANY_ID)],
    ])('%s', (_name, call) => {
      it('refuses an Administrator a centre-wide holiday before anything moves', async () => {
        prisma.holiday.findFirst.mockResolvedValue(mockHoliday);
        const done = call(service);
        await expect(done).rejects.toThrow(ForbiddenException);
        await expect(done).rejects.toThrow(CENTRE_WIDE);
        expect(prisma.holiday.update).not.toHaveBeenCalled();
        expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
        expect(prisma.groupHolidayExtension.findMany).not.toHaveBeenCalled();
      });

      it("refuses an Administrator another branch's holiday", async () => {
        prisma.holiday.findFirst.mockResolvedValue(namangan);
        const done = call(service);
        await expect(done).rejects.toThrow(BRANCH_REFUSAL);
        expect(prisma.holiday.update).not.toHaveBeenCalled();
        expect(prisma.groupHolidayExtension.findMany).not.toHaveBeenCalled();
      });

      it("lets an Administrator manage their own branch's holiday", async () => {
        prisma.holiday.findFirst.mockResolvedValue(fargona);
        await call(service);
        expect(prisma.holiday.update).toHaveBeenCalled();
      });
    });

    describe('reads', () => {
      it("shows a centre-wide holiday and the caller's own branch's, refuses another branch's", async () => {
        prisma.holiday.findFirst.mockResolvedValue(mockHoliday);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).resolves.toEqual(
          mockHoliday,
        );

        prisma.holiday.findFirst.mockResolvedValue(fargona);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).resolves.toEqual(
          fargona,
        );

        prisma.holiday.findFirst.mockResolvedValue(namangan);
        await expect(service.findOne('h-1', COMPANY_ID, 5)).rejects.toThrow(
          BRANCH_REFUSAL,
        );
      });

      it("refuses another branch's status trail without reading it", async () => {
        prisma.holiday.findFirst.mockResolvedValue({ id: 'h-1', branchId: 2 });
        await expect(
          service.getStatusHistory('h-1', COMPANY_ID, 5),
        ).rejects.toThrow(BRANCH_REFUSAL);
        expect(statusHistoryService.getHistory).not.toHaveBeenCalled();
      });

      it("lists the centre-wide holidays and the scope's branches, with the branch name", async () => {
        await service.findAll({}, COMPANY_ID, [1]);
        expect(prisma.holiday.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              deletedAt: null,
              companyId: COMPANY_ID,
              OR: [{ branchId: null }, { branchId: { in: [1] } }],
            },
            include: { branch: { select: { name: true } } },
          }),
        );
      });
    });
  });

```

**1b.** In `server/src/holidays/holidays.controller.spec.ts`, replace the last block
```ts
  describe('findOne()', () => {
    it('passes the caller company through to the service', () => {
      controller.findOne('h-1', 1001);
      expect(mockService.findOne).toHaveBeenCalledWith('h-1', 1001);
    });
  });
```
with
```ts
  describe('findOne()', () => {
    it('passes the caller company and the caller through to the service', () => {
      controller.findOne('h-1', 1001, 7);
      expect(mockService.findOne).toHaveBeenCalledWith('h-1', 1001, 7);
    });
  });

  // A branch's holiday is read only in that branch (CEO decision 10.10.2026).
  describe('findAll()', () => {
    it("passes the header's branch scope through to the service", () => {
      controller.findAll({}, 1001, [1]);
      expect(mockService.findAll).toHaveBeenCalledWith({}, 1001, [1]);
    });
  });

  describe('getStatusHistory()', () => {
    it('passes the caller through to the service', () => {
      controller.getStatusHistory('h-1', 1001, 7);
      expect(mockService.getStatusHistory).toHaveBeenCalledWith('h-1', 1001, 7);
    });
  });
```

**1c.** Create `server/src/holidays/dto/holiday-dto.spec.ts`:
```ts
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHolidayDto } from './create-holiday.dto';
import { UpdateHolidayDto } from './update-holiday.dto';

// Same options as the global ValidationPipe in main.ts.
async function messages<T extends object>(cls: new () => T, body: object) {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('holiday DTOs: the branch', () => {
  const base = { name: 'Filial yopiq', date: '2026-09-01' };

  it('a new holiday names its branch, or none for the whole centre', async () => {
    expect(await messages(CreateHolidayDto, { ...base, branchId: 2 })).toEqual(
      [],
    );
    expect(await messages(CreateHolidayDto, base)).toEqual([]);
    expect(
      await messages(CreateHolidayDto, { ...base, branchId: null }),
    ).toEqual([]);
    expect(
      await messages(CreateHolidayDto, { ...base, branchId: 'ikki' }),
    ).toEqual(["Filial noto'g'ri ko'rsatilgan"]);
  });

  // Whose a holiday is gets fixed at creation: an edit that names a branch is
  // refused, so nobody turns a branch holiday into a centre-wide one or moves it.
  it('an edit cannot carry a branch', async () => {
    expect(
      await messages(UpdateHolidayDto, { name: 'X', branchId: 2 }),
    ).toEqual(['property branchId should not exist']);
  });
});
```

**1d.** In `server/src/groups/group-holiday-cascade.service.spec.ts`, insert directly before `  describe('revertGroupEndDateForHoliday', () => {`:
```ts
  // A branch's holiday is that branch's alone (CEO decision 10.10.2026).
  // `HolidaysService` offers it only that branch's groups, but a NEW group is
  // offered every holiday in range, so the refusal lives in the cascade itself.
  describe('branch', () => {
    it("does not move another branch's group", async () => {
      prisma.group.findUnique.mockResolvedValue({ ...group, branchId: 1 });
      prisma.holiday.findUnique.mockResolvedValue({ ...holiday, branchId: 2 });

      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );

      expect(result.extended).toBe(false);
      expect(prisma.group.update).not.toHaveBeenCalled();
      expect(prisma.groupHolidayExtension.create).not.toHaveBeenCalled();
    });

    it('a centre-wide holiday still moves a group of any branch', async () => {
      prisma.group.findUnique.mockResolvedValue({ ...group, branchId: 1 });
      prisma.holiday.findUnique.mockResolvedValue({ ...holiday, branchId: null });

      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );

      expect(result.extended).toBe(true);
    });

    it("moves its own branch's group, reading only that branch's holidays", async () => {
      prisma.group.findUnique.mockResolvedValue({ ...group, branchId: 2 });
      prisma.holiday.findUnique.mockResolvedValue({ ...holiday, branchId: 2 });

      const result = await service.extendGroupEndDateForHoliday(
        'g-1',
        'h-1',
        99,
      );

      expect(result.extended).toBe(true);
      expect(holidaysService.getActiveHolidaysInRange).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        2,
      );
      expect(holidaysService.buildHolidayDateSet).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        2,
      );
    });

    it("offers a new group only the centre's and its own branch's holidays", async () => {
      prisma.group.findUnique.mockResolvedValue({ ...group, branchId: 2 });
      holidaysService.getActiveHolidaysInRange.mockResolvedValue([]);

      await service.applyHolidayImpactOnNewGroup('g-1', 99);

      expect(holidaysService.getActiveHolidaysInRange).toHaveBeenCalledWith(
        group.startDate,
        group.endDate,
        2,
      );
      expect(prisma.group.update).not.toHaveBeenCalled();
    });
  });

```

**1e.** Create `client/src/lib/holiday-scope.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  CENTRE_WIDE,
  holidayBranchChoices,
  holidayScopeLabel,
  mayManageHoliday,
  newHolidayBranchId,
  toHoliday,
} from "./holiday-scope";

const fargona = { id: 1, name: "Farg'ona" };
const namangan = { id: 2, name: "Namangan" };

describe("holiday scope (CEO decision 10.10.2026)", () => {
  it("names whose a holiday is", () => {
    expect(holidayScopeLabel({ branchId: null, branchName: null })).toBe(
      "Butun markaz",
    );
    expect(holidayScopeLabel({ branchId: 2, branchName: "Namangan" })).toBe(
      "Namangan",
    );
  });

  it("reads the branch name the list sends, and none from a create answer", () => {
    const row = {
      id: "h",
      name: "X",
      date: "2026-03-21",
      endDate: "2026-03-21",
      branchId: 2,
    };
    expect(toHoliday({ ...row, branch: { name: "Namangan" } }).branchName).toBe(
      "Namangan",
    );
    expect(toHoliday(row).branchName).toBeNull();
  });

  it("keeps a centre-wide holiday's actions for the CEO alone", () => {
    expect(mayManageHoliday(true, null)).toBe(true);
    expect(mayManageHoliday(false, null)).toBe(false);
    expect(mayManageHoliday(false, 1)).toBe(true);
  });

  it("offers the CEO the branch in view, or every branch on «Barcha filiallar»", () => {
    expect(holidayBranchChoices(namangan, [fargona, namangan])).toEqual([
      namangan,
    ]);
    expect(holidayBranchChoices(null, [fargona, namangan])).toEqual([
      fargona,
      namangan,
    ]);
  });

  it("sends the CEO's choice, and a non-CEO's branch from the switcher", () => {
    expect(newHolidayBranchId(true, CENTRE_WIDE, namangan)).toBeNull();
    expect(newHolidayBranchId(true, "2", null)).toBe(2);
    // A non-CEO never chooses: the holiday goes to the branch in view.
    expect(newHolidayBranchId(false, CENTRE_WIDE, fargona)).toBe(1);
    expect(newHolidayBranchId(false, CENTRE_WIDE, null)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/holidays src/groups/group-holiday-cascade.service.spec.ts`
Expected: FAIL.
- `holidays.service.spec.ts`: «branch rule / create» fails because `create` writes the centre-wide holiday (no `ForbiddenException`, `holiday.create` was called) and `data` has no `branchId`. The `update`/`changeStatus`/`remove` refusals fail because nothing is refused. «reads» fails: `findOne` returns the Namangan row; `getStatusHistory` reads the trail; `findAll` has no `OR` and no `include`. The rewritten `findAll` tests fail: `where` has no `companyId` because `null` arrives as the companyId argument.
- `holidays.controller.spec.ts`: `findOne` was called with `('h-1', 1001)`, `findAll` with `({}, 1001)`, `getStatusHistory` with `('h-1', 1001)`.
- `holiday-dto.spec.ts`: the create cases return `['property branchId should not exist']`. The update case already passes; it pins the existing shape.
- `group-holiday-cascade.service.spec.ts`: «does not move another branch's group» gets `extended: true`. The two «reading only that branch's holidays» tests fail because the readers are called with two arguments.

Run: `cd client && npx vitest run src/lib/holiday-scope.test.ts` (on a configLoader error: `npx vitest --config vitest.config.mts run src/lib/holiday-scope.test.ts`)
Expected: FAIL. `./holiday-scope` cannot be resolved.

- [ ] **Step 3: Implement**

**3a. `server/src/holidays/dto/create-holiday.dto.ts`**

Replace
```ts
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
```
with
```ts
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
```
and replace
```ts
  endDate?: string;
}
```
with
```ts
  endDate?: string;

  /**
   * The branch the holiday closes. Absent (or null) = the whole centre, which
   * only the CEO may declare (`HolidaysService.create`). Fixed at creation:
   * `UpdateHolidayDto` deliberately has no such field.
   */
  @IsOptional()
  @IsInt({ message: "Filial noto'g'ri ko'rsatilgan" })
  branchId?: number | null;
}
```

**3b. `server/src/holidays/dto/update-holiday.dto.ts`**

Replace `export class UpdateHolidayDto {` with
```ts
/**
 * No `branchId`, on purpose. Whose a holiday is (one branch, or the whole
 * centre) gets fixed at creation, like a group's branch. The global
 * ValidationPipe (`forbidNonWhitelisted`) refuses an edit that sends one, so
 * nobody turns a branch holiday into a centre-wide one or moves it. To move
 * one, delete it and create it again.
 */
export class UpdateHolidayDto {
```

**3c. `server/src/holidays/holidays.service.ts`**

Replace
```ts
import {
  BadRequestException,
  Injectable,
```
with
```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
```

Replace
```ts
import { GroupHolidayCascadeService } from '../groups/group-holiday-cascade.service';
```
with
```ts
import { GroupHolidayCascadeService } from '../groups/group-holiday-cascade.service';
import {
  assertCallerInBranch,
  resolveCallerBranchScope,
} from '../common/auth/branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
```

Replace
```ts
const MAX_HOLIDAY_DAYS = 60;
```
with
```ts
const MAX_HOLIDAY_DAYS = 60;

/** The same refusal the dashboard gives for a branch outside the caller's. */
const BRANCH_REFUSAL = 'Bu filial sizning ruxsatingizda emas';
/** CEO decision 10.10.2026: a holiday of the whole centre is the CEO's alone. */
const CENTRE_WIDE_REFUSAL = 'Butun markaz bayrami bilan faqat CEO ishlay oladi';
```

Replace the whole `findAll` method (from `  async findAll(query: HolidayQueryDto, companyId?: number) {` through its closing `  }` before `  async findOne(`) with
```ts
  async findAll(
    query: HolidayQueryDto,
    companyId: number,
    branchIds: ReportBranchIds,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // `GET /holidays` had no company filter and no `@Roles` guard, so any
    // authenticated token could read every holiday in the database.
    //
    // The header's branch scope (CEO decision 10.10.2026): a centre-wide
    // holiday is every branch's, and a branch's holiday shows only in its own
    // branch. `null` (a CEO on «Barcha filiallar») reads every row. `[]`
    // (nothing in scope) still reads the centre-wide calendar, which no
    // branch owns.
    const where: Prisma.HolidayWhereInput = {
      deletedAt: null,
      companyId,
      ...(branchIds != null
        ? { OR: [{ branchId: null }, { branchId: { in: branchIds } }] }
        : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.holiday.findMany({
        where,
        // The settings list shows whose each holiday is.
        include: { branch: { select: { name: true } } },
        orderBy: { date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.holiday.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }
```

Replace
```ts
  async findOne(id: string, companyId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    return holiday;
  }
```
with
```ts
  async findOne(id: string, companyId: number, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    // A centre-wide holiday is every branch's calendar. A branch's own is read
    // only in that branch, the rule `GET /entity-history/Holiday/:id` already
    // applies (`common/auth/entity-history-scope.ts`).
    if (holiday.branchId != null) {
      await assertCallerInBranch(
        this.prisma,
        userId,
        holiday.branchId,
        BRANCH_REFUSAL,
      );
    }
    return holiday;
  }
```

In `create`, replace
```ts
    this.validateRange(start, end);

    const holiday = await this.prisma.holiday.create({
      // Written explicitly, not left to the column default. The `@default(1001)`
      // that `20260805120000` added was a migration convenience; relying on it
      // at runtime would hardcode one company into a multi-company schema — and
      // the following migration drops it. `branchId` stays null: a holiday with
      // no branch is a COMPANY-WIDE one (Navro'z, Mustaqillik kuni), which is
      // what nearly every row is.
      data: { name: dto.name, date: start, endDate: end, companyId },
    });
```
with
```ts
    this.validateRange(start, end);

    // Whose holiday it is (CEO decision 10.10.2026): no branch = the whole
    // centre, which only the CEO declares; otherwise a branch the caller
    // works in. Checked before the write, so a refused holiday moves no group.
    const branchId = dto.branchId ?? null;
    if (branchId != null) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, companyId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) {
        throw new NotFoundException(`Filial #${branchId} topilmadi`);
      }
    }
    await this.assertCallerMayWriteHoliday(userId, branchId);

    const holiday = await this.prisma.holiday.create({
      // Written explicitly, not left to the column default. The `@default(1001)`
      // that `20260805120000` added was a migration convenience; relying on it
      // at runtime would hardcode one company into a multi-company schema — and
      // the following migration drops it. `branchId` null is a COMPANY-WIDE
      // holiday (Navro'z, Mustaqillik kuni); a number is one branch closing.
      data: { name: dto.name, date: start, endDate: end, companyId, branchId },
    });
```

In `update`, replace
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    // Compare Tashkent calendar strings — the frontend sends "YYYY-MM-DD",
```
with
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    await this.assertCallerMayWriteHoliday(userId, holiday.branchId);

    // Compare Tashkent calendar strings — the frontend sends "YYYY-MM-DD",
```

In `remove`, replace
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    await this.reverseHolidayImpactOnGroups(id, userId);
```
with
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    await this.assertCallerMayWriteHoliday(userId, holiday.branchId);

    await this.reverseHolidayImpactOnGroups(id, userId);
```

In `changeStatus`, replace
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    const auditData = await this.statusHistoryService.changeStatus({
```
with
```ts
    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    await this.assertCallerMayWriteHoliday(userId, holiday.branchId);

    const auditData = await this.statusHistoryService.changeStatus({
```

Replace the whole `getStatusHistory` method
```ts
  async getStatusHistory(id: string, companyId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }

    return this.statusHistoryService.getHistory('Holiday', id);
  }
```
with
```ts
  async getStatusHistory(id: string, companyId: number, userId: number) {
    const holiday = await this.prisma.holiday.findFirst({
      where: { id, companyId },
      select: { id: true, branchId: true },
    });

    if (!holiday) {
      throw new NotFoundException(`Bayram #${id} topilmadi`);
    }
    // Same read rule as `findOne`.
    if (holiday.branchId != null) {
      await assertCallerInBranch(
        this.prisma,
        userId,
        holiday.branchId,
        BRANCH_REFUSAL,
      );
    }

    return this.statusHistoryService.getHistory('Holiday', id);
  }
```

Replace
```ts
  private validateRange(start: Date, end: Date) {
```
with
```ts
  /**
   * Who may create, edit, cancel or delete a holiday (CEO decision
   * 10.10.2026). A branch's holiday: whoever works in that branch. A
   * centre-wide one (`branchId` null) moves every branch's groups, registers
   * and month plans, so only the CEO. The same shape as
   * `CoursesService.assertCallerMayTouchCourse`.
   */
  private async assertCallerMayWriteHoliday(
    userId: number,
    branchId: number | null,
  ): Promise<void> {
    if (branchId != null) {
      await assertCallerInBranch(this.prisma, userId, branchId, BRANCH_REFUSAL);
      return;
    }
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    if (scope.kind !== 'all') {
      throw new ForbiddenException(CENTRE_WIDE_REFUSAL);
    }
  }

  private validateRange(start: Date, end: Date) {
```

The cascade callers stay as they are. `applyHolidayImpactOnGroups` already filters the groups by `holiday.branchId` (`...(holiday.branchId != null ? { branchId: holiday.branchId } : {})`), and `create` and `changeStatus` hand it the written row. `reverseHolidayImpactOnGroups` reverses only this holiday's own `GroupHolidayExtension` rows, which exist only for groups the holiday moved. Both are already branch-correct.

**3d. `server/src/holidays/holidays.controller.ts`**

Replace
```ts
import { CurrentUser } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
```
with
```ts
import { BranchScope, CurrentUser } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
```

Replace
```ts
  // Staff only + company-scoped. Both were missing: any authenticated token,
  // including a student-portal one, could read every holiday in the database.
  @Get()
  @AnyStaff()
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.findAll(query, companyId);
  }
```
with
```ts
  // Staff only + company-scoped. Both were missing: any authenticated token,
  // including a student-portal one, could read every holiday in the database.
  // The header's branch scope narrows it further: the centre-wide holidays and
  // the scope's own branches, never another branch's (CEO decision 10.10.2026).
  @Get()
  @AnyStaff()
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.holidaysService.findAll(query, companyId, branchIds);
  }
```

Replace
```ts
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.findOne(id, companyId);
  }
```
with
```ts
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.findOne(id, companyId, userId);
  }
```

Replace
```ts
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.getStatusHistory(id, companyId);
  }
```
with
```ts
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.getStatusHistory(id, companyId, userId);
  }
```
(The controller is the only caller of `findAll`, `findOne` and `getStatusHistory`. `grep -rn "holidaysService\.\(findAll\|findOne\|getStatusHistory\)" server/src` finds only `holidays.controller.ts`.)

**3e. `server/src/groups/group-holiday-cascade.service.ts`**

In `extendGroupEndDateForHoliday`, replace
```ts
      select: {
        id: true,
        startDate: true,
        endDate: true,
        exactDays: true,
      },
```
with
```ts
      select: {
        id: true,
        startDate: true,
        endDate: true,
        exactDays: true,
        branchId: true,
      },
```

Replace
```ts
    const holiday = await this.prisma.holiday.findUnique({
      where: { id: holidayId },
      select: { id: true, date: true, endDate: true },
    });
    if (!holiday) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }
```
with
```ts
    const holiday = await this.prisma.holiday.findUnique({
      where: { id: holidayId },
      select: { id: true, date: true, endDate: true, branchId: true },
    });
    if (!holiday) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }

    // A branch's holiday never moves another branch's group (CEO decision
    // 10.10.2026). `HolidaysService` already offers it only its own branch's
    // groups, but `applyHolidayImpactOnNewGroup` offers a new group every
    // holiday in range, so the rule lives here, where both arrive.
    if (holiday.branchId != null && holiday.branchId !== group.branchId) {
      return {
        extended: false,
        oldEndDate: group.endDate,
        newEndDate: group.endDate,
        daysExtended: 0,
      };
    }
```

Replace
```ts
    const overlappingHolidays =
      await this.holidaysService.getActiveHolidaysInRange(
        utcMidnightFromDateStr(eatenStartStr),
        utcMidnightFromDateStr(eatenEndStr),
      );
```
with
```ts
    const overlappingHolidays =
      await this.holidaysService.getActiveHolidaysInRange(
        utcMidnightFromDateStr(eatenStartStr),
        utcMidnightFromDateStr(eatenEndStr),
        group.branchId,
      );
```

Replace
```ts
    const futureHolidaySet = await this.holidaysService.buildHolidayDateSet(
      walkStart,
      walkEnd,
    );
```
with
```ts
    const futureHolidaySet = await this.holidaysService.buildHolidayDateSet(
      walkStart,
      walkEnd,
      group.branchId,
    );
```

In `applyHolidayImpactOnNewGroup`, replace
```ts
      select: { startDate: true, endDate: true },
    });
    if (!group?.startDate || !group?.endDate) return;
```
with
```ts
      select: { startDate: true, endDate: true, branchId: true },
    });
    if (!group?.startDate || !group?.endDate) return;
```
and replace
```ts
      const holidays = await this.holidaysService.getActiveHolidaysInRange(
        group.startDate,
        lastEndDate,
      );
```
with
```ts
      const holidays = await this.holidaysService.getActiveHolidaysInRange(
        group.startDate,
        lastEndDate,
        group.branchId,
      );
```
(`Group.branchId` is a non-null `Int`, so all three pass a `number`.)

**3f. `server/CLAUDE.md`**, section «Holidays (Multi-day + Group endDate cascade)». Replace
```
- `Holiday` schema carries `date` + `endDate` (both NOT NULL). Single-day holidays store `endDate = date`. Frontend sends `"YYYY-MM-DD"` strings; the service coerces missing `endDate` to `date`. Hard cap: 60 days per holiday.
```
with
```
- `Holiday` schema carries `date` + `endDate` (both NOT NULL). Single-day holidays store `endDate = date`. Frontend sends `"YYYY-MM-DD"` strings; the service coerces missing `endDate` to `date`. Hard cap: 60 days per holiday.
- **A holiday is the whole centre's or one branch's** (CEO decision 10.10.2026). `branchId` null = centre-wide: only the CEO creates, edits, cancels or deletes it (`HolidaysService.assertCallerMayWriteHoliday`, 403 «Butun markaz bayrami bilan faqat CEO ishlay oladi»). A branch's holiday is managed by anyone who works in that branch (`assertCallerInBranch`). The branch is fixed at creation: `UpdateHolidayDto` has no `branchId`, so moving a holiday means deleting it and creating it again. The cascade moves only that branch's groups: `applyHolidayImpactOnGroups` filters by it, and `extendGroupEndDateForHoliday` refuses another branch's group, which also covers `applyHolidayImpactOnNewGroup`. `GET /holidays` takes `@BranchScope()`: the centre-wide holidays plus the scope's branches. The detail and the status trail refuse another branch's holiday (403), as `GET /entity-history/Holiday/:id` does.
```

**3g. Client: create `client/src/lib/holiday-scope.ts`**
```ts
import type { Holiday } from "@/hooks/use-edit-holiday";

/**
 * Whose a holiday is (CEO decision 10.10.2026). A holiday with no branch
 * (`branchId` null on the server) is the whole centre's, and only the CEO
 * creates, edits or deletes it. Any other holiday is one branch's.
 */
export const CENTRE_WIDE = "centre";
export const CENTRE_WIDE_LABEL = "Butun markaz";

/** A row of `GET /holidays`, or the answer of a create/update. */
export interface ApiHoliday {
  id: string;
  name: string;
  date: string;
  endDate: string;
  branchId: number | null;
  /** Only the list carries it (`include: { branch }`). */
  branch?: { name: string } | null;
}

export function toHoliday(h: ApiHoliday): Holiday {
  return {
    id: h.id,
    name: h.name,
    date: h.date,
    endDate: h.endDate,
    branchId: h.branchId,
    branchName: h.branch?.name ?? null,
  };
}

/** The badge on a row: «Butun markaz» or the branch's name. */
export function holidayScopeLabel(
  h: Pick<Holiday, "branchId" | "branchName">,
): string {
  if (h.branchId == null) return CENTRE_WIDE_LABEL;
  return h.branchName ?? `Filial #${h.branchId}`;
}

/** The row's «Amallar»: a centre-wide holiday is the CEO's alone. */
export function mayManageHoliday(
  isCeo: boolean,
  branchId: number | null,
): boolean {
  return isCeo || branchId != null;
}

interface BranchRef {
  id: number;
  name: string;
}

/**
 * The branches the CEO may give a new holiday besides «Butun markaz»: the one
 * the switcher shows, or all of them on «Barcha filiallar». The list the CEO
 * is looking at shows exactly these, so a new holiday never lands out of sight.
 */
export function holidayBranchChoices(
  selected: BranchRef | null,
  branches: BranchRef[],
): BranchRef[] {
  return selected ? [selected] : branches;
}

/**
 * `branchId` for `POST /holidays`. A number means that branch. `null` means
 * the whole centre, and the field is left out. `undefined` means a non-CEO
 * whose branch is not known yet, and the request must not go out.
 */
export function newHolidayBranchId(
  isCeo: boolean,
  scope: string,
  selected: { id: number } | null,
): number | null | undefined {
  if (isCeo) return scope === CENTRE_WIDE ? null : Number(scope);
  return selected?.id;
}
```

**3h. `client/src/hooks/use-edit-holiday.ts`**: replace
```ts
export interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate: string;
}
```
with
```ts
export interface Holiday {
  id: string;
  name: string;
  date: string;
  endDate: string;
  /** null = the whole centre's holiday (CEO only); a number = one branch's. */
  branchId: number | null;
  branchName: string | null;
}
```

**3i. `client/src/components/settings/holidays-settings-client.tsx`**

Replace
```tsx
import { Skeleton } from "@/components/ui/skeleton";
```
with
```tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
```

Replace
```tsx
import api from "@/lib/api";
```
with
```tsx
import api from "@/lib/api";
import {
  holidayScopeLabel,
  toHoliday,
  type ApiHoliday,
} from "@/lib/holiday-scope";
```

Delete this block, including the blank line after it:
```tsx
interface ApiHoliday {
  id: string;
  name: string;
  date: string;
  endDate: string;
}

function mapHoliday(h: ApiHoliday): Holiday {
  return { id: h.id, name: h.name, date: h.date, endDate: h.endDate };
}

```

Replace `      setHolidays(data.data.map(mapHoliday));` with `      setHolidays(data.data.map(toHoliday));`.

Replace
```tsx
              <TableHead>Sana</TableHead>
              <TableHead className="w-10" />
```
with
```tsx
              <TableHead>Sana</TableHead>
              <TableHead>Filial</TableHead>
              <TableHead className="w-10" />
```

Replace
```tsx
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
```
with
```tsx
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
```

Replace `                  colSpan={4}` with `                  colSpan={5}`.

Replace
```tsx
                  <TableCell>{formatHolidayRange(holiday)}</TableCell>
```
with
```tsx
                  <TableCell>{formatHolidayRange(holiday)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        holiday.branchId == null ? "secondary" : "outline"
                      }
                    >
                      {holidayScopeLabel(holiday)}
                    </Badge>
                  </TableCell>
```
(The `Holiday` type import stays: `handleSaved` and the state still use it.)

**3j. `client/src/components/settings/holiday-row-actions.tsx`**

Replace
```tsx
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
```
with
```tsx
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { mayManageHoliday } from "@/lib/holiday-scope";
```

Replace
```tsx
  const [deleting, setDeleting] = useState(false);
```
with
```tsx
  const [deleting, setDeleting] = useState(false);
  // Identity, not a capability: a centre-wide holiday is the CEO's alone.
  const isCeo = useAuth((s) => s.user?.roles.some((r) => r.id === 1) ?? false);
```

Replace
```tsx
  return (
    <>
      <DropdownMenu>
```
with
```tsx
  // CEO decision 10.10.2026: only the CEO edits or deletes a centre-wide
  // holiday, and the server refuses everyone else. Hide the menu, don't
  // offer a 403.
  if (!mayManageHoliday(isCeo, holiday.branchId)) return null;

  return (
    <>
      <DropdownMenu>
```

**3k. `client/src/components/settings/edit-holiday-form.tsx`**: replace the whole file with
```tsx
"use client";

import { Controller, useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditHoliday, type Holiday } from "@/hooks/use-edit-holiday";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  CENTRE_WIDE,
  CENTRE_WIDE_LABEL,
  holidayBranchChoices,
  holidayScopeLabel,
  newHolidayBranchId,
  toHoliday,
} from "@/lib/holiday-scope";

interface EditHolidayFormProps {
  holiday: Holiday | null;
  onClose: () => void;
  onSaved?: (holiday: Holiday) => void;
  formId: string;
  isAdd?: boolean;
}

interface FormValues {
  name: string;
  date: Date | null;
  endDate: Date | null;
  /** `CENTRE_WIDE` or a branch id. The CEO chooses it, on create only. */
  scope: string;
}

export function EditHolidayForm({
  holiday,
  onClose,
  onSaved,
  formId,
  isAdd,
}: EditHolidayFormProps) {
  const setSubmitting = useEditHoliday((s) => s.setSubmitting);
  // Identity, not a capability: a centre-wide holiday is the CEO's alone.
  const isCeo = useAuth((s) => s.user?.roles.some((r) => r.id === 1) ?? false);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const branches = useBranchSwitcher((s) => s.branches);

  const form = useForm<FormValues>({
    defaultValues: {
      name: holiday?.name ?? "",
      date: holiday?.date ? new Date(holiday.date) : null,
      endDate: holiday?.endDate ? new Date(holiday.endDate) : null,
      scope: CENTRE_WIDE,
    },
  });

  const startDate = form.watch("date");
  const endDate = form.watch("endDate");

  const onSubmit = async (values: FormValues) => {
    if (!values.date) {
      form.setError("date", {
        type: "required",
        message: "Sana tanlanishi shart",
      });
      return;
    }

    if (values.endDate && values.endDate < values.date) {
      form.setError("endDate", {
        type: "invalid",
        message: "Tugash sanasi boshlanish sanasidan oldin bo'lishi mumkin emas",
      });
      return;
    }

    const startStr = format(values.date, "yyyy-MM-dd");
    const endStr = values.endDate
      ? format(values.endDate, "yyyy-MM-dd")
      : null;

    const payload: {
      name: string;
      date: string;
      endDate?: string;
      branchId?: number;
    } = {
      name: values.name.trim(),
      date: startStr,
    };
    if (endStr && endStr !== startStr) {
      payload.endDate = endStr;
    }
    // Whose the holiday is gets fixed at creation: it goes on POST only, never
    // on PATCH (the server refuses a `branchId` on an edit).
    if (isAdd) {
      const branchId = newHolidayBranchId(isCeo, values.scope, selectedBranch);
      if (branchId === undefined) {
        toast.error("Filial tanlanmagan — yuqoridan filialni tanlang");
        return;
      }
      if (branchId !== null) payload.branchId = branchId;
    }

    setSubmitting(true);
    try {
      if (isAdd) {
        const { data } = await api.post("/holidays", payload);
        toast.success("Bayram muvaffaqiyatli qo'shildi");
        onSaved?.(toHoliday(data));
      } else {
        if (!holiday) return;
        const { data } = await api.patch(`/holidays/${holiday.id}`, payload);
        toast.success("Bayram muvaffaqiyatli yangilandi");
        onSaved?.(toHoliday(data));
      }
      onClose();
    } catch (err) {
      toast.error(
        getErrorMessage(
          err,
          isAdd
            ? "Bayram qo'shishda xatolik yuz berdi"
            : "Bayramni yangilashda xatolik yuz berdi",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col"
    >
      <section className="space-y-5 px-6 py-5">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Bayram ma&apos;lumotlari
        </h3>

        <div className="space-y-1.5">
          <Label htmlFor="name">Bayram nomi</Label>
          <Input
            id="name"
            placeholder="Masalan: Mustaqillik kuni"
            {...form.register("name", {
              required: "Bayram nomi kiritilishi shart",
              maxLength: { value: 200, message: "200 belgidan oshmasligi kerak" },
            })}
          />
          {form.formState.errors.name && (
            <p className="text-sm text-destructive">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Boshlanish sanasi</Label>
            <Controller
              name="date"
              control={form.control}
              rules={{ required: "Sana tanlanishi shart" }}
              render={({ field }) => (
                <DatePicker
                  id="date"
                  value={field.value}
                  onChange={(d) => field.onChange(d ?? null)}
                  placeholder="Sanani tanlang"
                  maxDate={endDate ?? undefined}
                  defaultMonth={endDate ?? undefined}
                />
              )}
            />
            {form.formState.errors.date && (
              <p className="text-sm text-destructive">
                {form.formState.errors.date.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="endDate">Tugash sanasi (ixtiyoriy)</Label>
            <Controller
              name="endDate"
              control={form.control}
              render={({ field }) => (
                <DatePicker
                  id="endDate"
                  value={field.value}
                  onChange={(d) => field.onChange(d ?? null)}
                  placeholder="Bir kunlik bayram"
                  minDate={startDate ?? undefined}
                  defaultMonth={startDate ?? undefined}
                />
              )}
            />
            {form.formState.errors.endDate && (
              <p className="text-sm text-destructive">
                {form.formState.errors.endDate.message}
              </p>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Bayram bir necha kun davom etsa, tugash sanasini tanlang. Bir kunlik
          bayram uchun tugash sanasini bo&apos;sh qoldiring.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="scope">Kimga</Label>
          {isAdd && isCeo ? (
            <Controller
              name="scope"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CENTRE_WIDE}>
                      {CENTRE_WIDE_LABEL}
                    </SelectItem>
                    {holidayBranchChoices(selectedBranch, branches).map((b) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          ) : (
            <p className="text-sm font-medium">
              {isAdd
                ? (selectedBranch?.name ?? "Filial tanlanmagan")
                : holiday
                  ? holidayScopeLabel(holiday)
                  : ""}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {!isAdd
              ? "Bayram kimniki ekanini o'zgartirib bo'lmaydi: kerak bo'lsa, o'chirib, qaytadan qo'shing."
              : isCeo
                ? "«Butun markaz» — hamma filialda dam olish kuni. Filial tanlansa, bayram faqat o'sha filial guruhlariga tegadi."
                : "Bayram faqat shu filial guruhlariga tegadi. Butun markaz bayramini CEO qo'shadi."}
          </p>
        </div>
      </section>
    </form>
  );
}
```

**3l. User guide.** In `client/src/qollanma/kontent/guruhlar/bayramlar.mdx`:

Replace
```
Bayram — butun markaz uchun dars bo'lmaydigan kun yoki bir necha kun. Uni Sozlamalar → «Dam olish kunlari» da kiritasiz. Bayram filialga emas, butun kompaniyaga tegishli: qo'shsangiz, hamma filialda amal qiladi.
```
with
```
Bayram — dars bo'lmaydigan kun yoki bir necha kun. Uni Sozlamalar → «Dam olish kunlari» da kiritasiz. Bayram ikki xil bo'ladi: butun markazniki (hamma filialda amal qiladi) yoki bitta filialniki (faqat o'sha filial guruhlariga tegadi). Butun markaz bayramini faqat CEO qo'shadi, tahrirlaydi va o'chiradi; filial direktori va administrator faqat o'z filiali bayramini kiritadi.
```

Replace
```
4. «Qo'shish» ni bosing. «Bayram muvaffaqiyatli qo'shildi» xabari chiqadi.
```
with
```
4. «Kimga» da bayram kimniki ekani turadi. CEO «Butun markaz» (odatiy) yoki filialni tanlaydi: tepada bitta filial tanlangan bo'lsa — faqat o'sha filialni, «Barcha filiallar» da — istalgan filialni. Filial direktori va administratorning bayrami tepada tanlangan filialga yoziladi.
5. «Qo'shish» ni bosing. «Bayram muvaffaqiyatli qo'shildi» xabari chiqadi.
```

Replace
```
Ro'yxatda «Bayram nomi» va «Sana» turadi (bir necha kunlik bayramda boshlanish va tugash sanasi tire bilan yoziladi). Ro'yxat sanasi bo'yicha eskisidan yangisiga tartiblangan; kerakli bayramni «Bayram nomi bo'yicha qidirish...» maydoni topadi.
```
with
```
Ro'yxatda «Bayram nomi», «Sana» va «Filial» turadi (bir necha kunlik bayramda boshlanish va tugash sanasi tire bilan yoziladi; «Filial» da «Butun markaz» yoki filial nomi). Ro'yxat sanasi bo'yicha eskisidan yangisiga tartiblangan; kerakli bayramni «Bayram nomi bo'yicha qidirish...» maydoni topadi. Ro'yxatda butun markaz bayramlari va tepada tanlangan filial bayramlari chiqadi: filial direktori va administrator boshqa filial bayramini ko'rmaydi, CEO «Barcha filiallar» da hammasini ko'radi.
```

Replace
```
Bayram guruhning dars kunlariga tushsa, guruhning tugash sanasi shuncha dars kuniga suriladi. Bu quyidagi guruhlarga tegishli: holati «Boshlanmagan» yoki «Faol» va kartada ham «Boshlanish», ham «Tugash» sanasi bor.
```
with
```
Bayram guruhning dars kunlariga tushsa, guruhning tugash sanasi shuncha dars kuniga suriladi. Bu quyidagi guruhlarga tegishli: holati «Boshlanmagan» yoki «Faol», kartada ham «Boshlanish», ham «Tugash» sanasi bor, bayram esa butun markazniki yoki guruh filialiniki.
```

Replace
```
Qator oxiridagi «Amallar» menyusida: «Tahrirlash» va «O'chirish».
```
with
```
Qator oxiridagi «Amallar» menyusida: «Tahrirlash» va «O'chirish». Butun markaz bayramining qatorida bu menyu faqat CEO uchun chiqadi. «Kimga» tahrirlashda faqat ko'rsatiladi: bayram kimniki ekanini o'zgartirib bo'lmaydi.
```

Replace
```
| Kimga | Butun markaz, hamma filial | Bitta guruh, bitta kun |
```
with
```
| Kimga | Butun markaz yoki bitta filial | Bitta guruh, bitta kun |
```

Replace
```
- Bayramni bitta filial uchun kiritib bo'lmaydi: formada filial maydoni yo'q, bayram hamma filialga tegadi.
```
with
```
- Bayram kimniki ekanini (butun markaz yoki qaysi filial) keyin o'zgartirib bo'lmaydi: bayramni o'chirib, qaytadan qo'shasiz.
```

Replace
```
| Bayram qo'shish, tahrirlash, o'chirish | Ha | Ha | Ha | — | — |
| Bayramni jadvaldagi bannerdan ko'rish | Ha | Ha | Ha | Ha | Ha |

Bayram butun kompaniyaga tegishli, shuning uchun direktor yoki administrator qo'shgan bayram boshqa filiallarga ham ta'sir qiladi. Sozlamalar menyusi CEO, direktor va administratorga ko'rinadi: o'qituvchi va kassirga u yo'q.
```
with
```
| Butun markaz bayramini qo'shish, tahrirlash, o'chirish | Ha | — | — | — | — |
| O'z filiali bayramini qo'shish, tahrirlash, o'chirish | Ha | Ha | Ha | — | — |
| Bayramni jadvaldagi bannerdan ko'rish | Ha | Ha | Ha | Ha | Ha |

Direktor yoki administrator qo'shgan bayram faqat o'z filialiga tegadi. Butun markaz bayramini boshqa rol qo'sha, o'zgartira yoki o'chira olmaydi: tizim «Butun markaz bayrami bilan faqat CEO ishlay oladi» deb rad etadi. Sozlamalar menyusi CEO, direktor va administratorga ko'rinadi: o'qituvchi va kassirga u yo'q.
```

In `client/src/qollanma/sahifalar/guruhlar.ts`, in the `sahifa: "bayramlar"` entry, replace
```ts
      "Bayram Sozlamalar → «Dam olish kunlari» da butun markaz uchun kiritiladi: shu kunlarda davomat olinmaydi va dars eslatmalari ketmaydi. Tugash sanasi bor «Faol» va «Boshlanmagan» guruhlarning tugash sanasi bayramga tushgan dars kunlariga suriladi.",
```
with
```ts
      "Bayram Sozlamalar → «Dam olish kunlari» da butun markaz yoki bitta filial uchun kiritiladi (butun markaz bayramini faqat CEO kiritadi): shu kunlarda davomat olinmaydi va dars eslatmalari ketmaydi. Tugash sanasi bor «Faol» va «Boshlanmagan» guruhlarning tugash sanasi bayramga tushgan dars kunlariga suriladi.",
```
In the same entry, replace
```ts
      "Telegram hisobot",
    ],
    yangilangan: "2026-10-03",
```
with
```ts
      "Telegram hisobot",
      "filial bayrami",
      "butun markaz bayrami",
    ],
    yangilangan: "2026-10-10",
```

In `client/src/qollanma/yangiliklar.ts`, replace
```ts
export const yangiliklar: Yangilik[] = [
```
with
```ts
export const yangiliklar: Yangilik[] = [
  {
    sana: "2026-10-10",
    sarlavha: "Bayram endi filialniki ham bo'ladi",
    matn: "Sozlamalar → «Dam olish kunlari» da bayram butun markaz uchun yoki bitta filial uchun kiritiladi. Butun markaz bayramini faqat CEO qo'shadi, tahrirlaydi va o'chiradi. Filial direktori va administrator faqat o'z filiali bayramini qo'shadi va boshqaradi: bunday bayram faqat shu filialda davomatni yopadi va shu filial guruhlarining tugash sanasini suradi. Ro'yxatda har bayram yonida «Butun markaz» yoki filial nomi turadi; direktor va administrator boshqa filial bayramlarini ko'rmaydi. Bayram kimniki ekanini keyin o'zgartirib bo'lmaydi: kerak bo'lsa, o'chirib, qaytadan qo'shing.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "guruhlar", sahifa: "bayramlar" },
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/holidays src/groups/group-holiday-cascade.service.spec.ts src/common/auth/entity-history-scope.spec.ts`
Expected: PASS.

Run: `cd client && npx vitest run src/lib/holiday-scope.test.ts src/qollanma`
Expected: PASS. `reyestr.test.ts` accepts the new `yangiliklar` entry: it sits on top, it is dated today, and its `sahifa` exists.

- [ ] **Step 5: Manifest** (`server/src/common/auth/branch-route-policy.ts`)

1. Task 1 added a COMPANY_WIDE block for the three holiday READS. Find it by `'Holiday READS. Every holiday row today is company-wide: '`. All three routes leave it: `GET /holidays` now takes `@BranchScope()`, so the spec detects it as header-scoped and forbids re-declaring it, and the other two now check the row's branch. Replace the whole block object, from its `{` to its `},`, which reads (as written by Task 1; Prettier may have rewrapped it):
```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Holiday READS. Every holiday row today is company-wide: ' +
      '`HolidaysService.create` never writes `branchId`, no other path sets it, ' +
      'and the 2026-08-05 migration left it null on purpose (null = a national ' +
      'holiday). The list, the detail and the status trail are the company ' +
      'calendar every staff screen needs (spec §4.6). If a branch-only holiday is ' +
      'ever written, the list will show it to the other branch as well and must ' +
      'be revisited. The holiday WRITES are not here: they move every ' +
      "branch's groups and are still UNREVIEWED.",
    routes: [
      'GET /holidays',
      'GET /holidays/:id',
      'GET /holidays/:id/status-history',
    ],
  },
```
with
```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Holidays (CEO decision 10.10.2026). A holiday belongs to one branch or, ' +
      'with `branchId` null, to the whole centre. Each id-addressed route loads ' +
      "the row first and checks the caller against the row's branch " +
      '(`assertCallerInBranch`). A centre-wide row is read by anyone the route ' +
      'admits, but only the CEO edits, cancels or deletes it ' +
      "(`resolveCallerBranchScope`), because its cascade moves every branch's " +
      'groups. `POST /holidays` checks the branch named in the body the same ' +
      'way, and no branch means a centre-wide holiday, so CEO only. The branch ' +
      'is fixed at creation: `UpdateHolidayDto` has no `branchId`. The list is ' +
      'not here: `GET /holidays` takes `@BranchScope()`.',
    routes: [
      'POST /holidays',
      'PATCH /holidays/:id',
      'PATCH /holidays/:id/status',
      'DELETE /holidays/:id',
      'GET /holidays/:id',
      'GET /holidays/:id/status-history',
    ],
  },
```
2. In `UNREVIEWED_ROUTES`, delete these four lines:
```ts
  'DELETE /holidays/:id',
```
```ts
  'PATCH /holidays/:id',
  'PATCH /holidays/:id/status',
```
```ts
  'POST /holidays',
```
3. Replace `export const UNREVIEWED_BUDGET = 26;` with `export const UNREVIEWED_BUDGET = 22;`.

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts src/common/permissions`
Expected: PASS. Every route is classified once, `GET /holidays` is evidenced by `@BranchScope()` and declared nowhere, and the list holds 22 routes.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi/server
npx prettier --write src/holidays/holidays.service.ts src/holidays/holidays.service.spec.ts src/holidays/holidays.controller.ts src/holidays/holidays.controller.spec.ts src/holidays/dto/create-holiday.dto.ts src/holidays/dto/update-holiday.dto.ts src/holidays/dto/holiday-dto.spec.ts src/groups/group-holiday-cascade.service.ts src/groups/group-holiday-cascade.service.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/holidays src/groups/group-holiday-cascade.service.ts src/groups/group-holiday-cascade.service.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
npm test
```
Expected: no ESLint errors, typecheck clean, full suite green.

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi/client
npx tsc --noEmit
npm run lint 2>&1 | tail -5
npm test
```
Expected: no type errors; the `✖ N problems (X errors, …)` line shows 0 errors; vitest green. Do NOT run Prettier on client files.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/holidays server/src/groups/group-holiday-cascade.service.ts server/src/groups/group-holiday-cascade.service.spec.ts server/src/common/auth/branch-route-policy.ts server/CLAUDE.md client/src/lib/holiday-scope.ts client/src/lib/holiday-scope.test.ts client/src/hooks/use-edit-holiday.ts client/src/components/settings/holidays-settings-client.tsx client/src/components/settings/edit-holiday-form.tsx client/src/components/settings/holiday-row-actions.tsx client/src/qollanma/kontent/guruhlar/bayramlar.mdx client/src/qollanma/sahifalar/guruhlar.ts client/src/qollanma/yangiliklar.ts
git commit -m "$(cat <<'EOF'
fix(holidays): a holiday belongs to a branch; only the CEO touches a centre-wide one

CEO decision 10.10.2026. Creating, editing, cancelling and deleting a holiday
check the caller against the holiday's branch; a holiday with no branch is the
whole centre's and only the CEO writes it. The branch is fixed at creation.
The group end-date cascade refuses another branch's group and reads only the
group's own branch holidays. GET /holidays takes @BranchScope(); the detail and
the status trail refuse another branch's holiday. The settings page shows whose
each holiday is, and the CEO picks «Butun markaz» or a branch.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2b: Holiday readers follow the group's branch

After Task 2, a director can write a branch holiday. Several readers still ask `HolidaysService` without a branch, and they would treat that holiday as everyone's:
- the dashboard schedule would go empty in every branch;
- the attendance tab's lesson dates, the dot sequence and the stats would drop the lesson in every branch;
- the QR lesson number would skip it in every branch;
- the 21:00 group report, the 20:00 group digest and the 09:00 broken-promise run would skip the whole company.

This task passes the group's branch where there is one. For the three whole-company runs it adds a «centre-wide only» mode.

These readers are already branch-aware and stay unchanged: `attendance-validation.service.ts` (register refusal), `attendance-reminder.service.ts` (cron), `unmarked-lessons.service.ts` (lesson-end sweep and task due day), `billing/month-plan.ts` (month charge plan), `getLessonCalendar`, `transactions-read.service.ts`, `refundable.service.ts`, `unmarked-lessons/reask-holidays.ts`, `make-up-day.ts`, `unmarked-lesson-transitions.ts`, `common/auth/entity-history-scope.ts` (the Holiday case uses `'pool'`).

**Files:**
- Modify: `server/src/holidays/holidays.service.ts` (`branchWhere` / `findActiveHolidayCovering`: `null` = company-wide only)
- Modify: `server/src/dashboard/dashboard.service.ts`
- Modify: `server/src/attendance/attendance-stats.service.ts`, `server/src/attendance/attendance-read.service.ts`, `server/src/attendance/qr-attendance-session.service.ts`
- Modify: `server/src/telegram-groups/telegram-group-daily-cron.service.ts`, `server/src/telegram-groups/telegram-group-digest-cron.service.ts`, `server/src/payment-promises/payment-promise-cron.service.ts`
- Modify: `server/CLAUDE.md`, `client/src/qollanma/kontent/guruhlar/bayramlar.mdx`
- Test: `server/src/holidays/holidays.service.spec.ts`, `server/src/dashboard/dashboard.service.spec.ts`, `server/src/attendance/attendance.service.spec.ts`, `server/src/attendance/qr-attendance.service.spec.ts`, `server/src/telegram-groups/telegram-group-daily-cron.service.spec.ts`, `server/src/telegram-groups/telegram-group-digest-cron.service.spec.ts`, `server/src/payment-promises/payment-promise-cron.service.spec.ts`

**Interfaces:**
- Consumes: `HolidaysService.findActiveHolidayCovering(date: Date, branchId?: number)` and `HolidaysService.buildHolidayDateSet(start: Date, end: Date, branchId?: number)`. With a number, these return the company-wide holidays plus that branch's own. With `undefined`, they return every branch's.
- Produces: `findActiveHolidayCovering(date, branchId?: number | null)`, where `null` = the company-wide holidays only. The other helpers keep their types. (`holiday-date-set.ts`'s own `holidayBranchWhere(null)` still means "every branch". It is a different function, used by `termHolidays`, and it is not touched.)

- [ ] **Step 1: Write the failing tests**

**1a.** `server/src/holidays/holidays.service.spec.ts`: insert directly before `  describe('buildHolidayDateSet', () => {`:
```ts
  describe('findActiveHolidayCovering: which branch', () => {
    const probe = new Date('2026-05-28');

    it("a branch reads the centre's holidays and its own", async () => {
      await service.findActiveHolidayCovering(probe, 2);
      expect(prisma.holiday.findFirst.mock.calls[0][0].where).toEqual(
        expect.objectContaining({
          OR: [{ branchId: null }, { branchId: 2 }],
        }),
      );
    });

    // A run that serves every branch at once must not stop for one branch
    // closing (CEO decision 10.10.2026 lets a branch declare its own).
    it("null reads the centre's holidays only", async () => {
      await service.findActiveHolidayCovering(probe, null);
      const where = prisma.holiday.findFirst.mock.calls[0][0].where;
      expect(where.branchId).toBeNull();
      expect(where.OR).toBeUndefined();
    });
  });

```

**1b.** `server/src/dashboard/dashboard.service.spec.ts`: replace
```ts
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        expectedUtcMidnight,
      );
```
with
```ts
      // Only the centre's holidays and branch 1's own close branch 1's day.
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        expectedUtcMidnight,
        1,
      );
```
replace
```ts
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        new Date('2026-03-22T00:00:00.000Z'),
      );
```
with
```ts
      expect(holidaysService.findActiveHolidayCovering).toHaveBeenCalledWith(
        new Date('2026-03-22T00:00:00.000Z'),
        1,
      );
```
and insert directly before `    it("marks a lesson that waits for «Dars bo'ldimi?»", async () => {`:
```ts
    it("a holiday of another branch does not empty this branch's schedule", async () => {
      holidaysService.findActiveHolidayCovering.mockImplementation(
        (_date: Date, branchId?: number) =>
          Promise.resolve(
            branchId === 1 ? null : { id: 'h-2', name: 'Namangan yopiq' },
          ),
      );

      const result = await service.getTodaySchedule(1, 1001, '2026-05-01');

      expect(result.isHoliday).toBe(false);
    });

```

**1c.** `server/src/attendance/attendance.service.spec.ts`:

In `describe('getLessonDates', ...)`, insert directly before `    it('drops a date that has been rescheduled away (originalDate)', async () => {`:
```ts
    it("a holiday only another branch has does not drop this group's lesson day", async () => {
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, branchId: 2 });
      holidaysService.buildHolidayDateSet.mockImplementation(
        (_start: Date, _end: Date, branchId?: number) =>
          Promise.resolve(
            branchId === 2 ? new Set<string>() : new Set(['2026-04-01']),
          ),
      );

      const result = await service.getLessonDates('group-uuid-1', 4, 2026);

      expect(result.map((r) => r.date)).toContain('2026-04-01');
    });

```

In `describe('getStats', ...)`, insert directly before these two lines (they open the getStats test `'should pass companyId to group query'`; the getLessonDates test of the same name starts differently):
```ts
    it('should pass companyId to group query', async () => {
      prisma.attendance.groupBy.mockResolvedValue([]);
```
the test
```ts
    it("counts lessons against its own branch's and the centre's holidays only", async () => {
      prisma.group.findFirst.mockResolvedValue({ ...mockGroup, branchId: 2 });
      prisma.attendance.groupBy.mockResolvedValue([]);
      prisma.attendance.findMany.mockResolvedValue([]);
      prisma.enrollment.findMany.mockResolvedValue([]);

      await service.getStats('group-uuid-1');

      expect(holidaysService.buildHolidayDateSet).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        2,
      );
    });

```

In `describe('getLessonSequence', ...)`, insert directly after the closing `    });` of `it('should return lesson dates with status per student (N from course.lessonPaymentCount)', ...)`:
```ts

    it("a holiday only another branch has does not drop this group's lesson", async () => {
      prisma.group.findFirst.mockResolvedValue({
        ...groupWithCourse(12),
        branchId: 2,
      });
      holidaysService.buildHolidayDateSet.mockImplementation(
        (_start: Date, _end: Date, branchId?: number) =>
          Promise.resolve(
            branchId === 2 ? new Set<string>() : new Set(['2024-01-03']),
          ),
      );

      const result = await service.getLessonSequence('group-uuid-1');

      expect(result.lessonDates).toContain('2024-01-03');
    });
```

**1d.** `server/src/attendance/qr-attendance.service.spec.ts`: replace
```ts
  let validation: { validateLessonDate: jest.Mock };
```
with
```ts
  let validation: { validateLessonDate: jest.Mock };
  let holidaysService: any;
```
replace
```ts
    const holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
```
with
```ts
    holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
```
and in `describe('startSession', ...)` insert directly before `    it('should store lessonNumber in Redis session data', async () => {`:
```ts
    it("numbers the lesson against its own branch's and the centre's holidays only", async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1',
        name: 'A1-1',
        exactDays: ['monday', 'wednesday', 'friday'],
        startDate: new Date('2026-03-01'),
        branchId: 2,
      });

      await service.startSession('group-1', '2026-04-03', 1, 1);

      expect(holidaysService.buildHolidayDateSet).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        2,
      );
    });

```

**1e.** `server/src/telegram-groups/telegram-group-daily-cron.service.spec.ts`: insert directly before `  it('runs normally on a non-holiday day', async () => {`:
```ts
  // A branch's own holiday must not silence every other branch's report.
  it('asks for company-wide holidays only', async () => {
    prisma.telegramGroup.findMany.mockResolvedValue([]);
    await service.sendDailyReports();
    expect(findActiveHolidayCovering).toHaveBeenCalledWith(
      expect.any(Date),
      null,
    );
  });

```

`server/src/telegram-groups/telegram-group-digest-cron.service.spec.ts`: insert directly before `  it('skips a holiday after purging', async () => {`:
```ts
  // A branch's own holiday must not hold back every other branch's digest.
  it('asks for company-wide holidays only', async () => {
    await service.flushDigests();
    expect(findActiveHolidayCovering).toHaveBeenCalledWith(
      expect.any(Date),
      null,
    );
  });

```

`server/src/payment-promises/payment-promise-cron.service.spec.ts`: insert directly before `  it('short-circuits on an active holiday (no queries, no events)', async () => {`:
```ts
  // One branch closing does not hold up every branch's broken-promise list.
  it('asks for company-wide holidays only', async () => {
    await service.run();
    expect(holidays.findActiveHolidayCovering).toHaveBeenCalledWith(
      expect.any(Date),
      null,
    );
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/holidays/holidays.service.spec.ts src/dashboard/dashboard.service.spec.ts src/attendance/attendance.service.spec.ts src/attendance/qr-attendance.service.spec.ts src/telegram-groups/telegram-group-daily-cron.service.spec.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts src/payment-promises/payment-promise-cron.service.spec.ts`
Expected: FAIL.
- `null reads the centre's holidays only`: `where.branchId` is undefined, because `branchWhere(null)` builds `OR: [{ branchId: null }, { branchId: null }]`.
- Dashboard: the two updated assertions fail because the call has one argument, and «another branch» gets `isHoliday: true`.
- `getLessonDates` / `getLessonSequence`: `2026-04-01` / `2024-01-03` are missing.
- `getStats` and QR: the call has two arguments.
- The three crons: the call has one argument.

- [ ] **Step 3: Implement**

**3a. `server/src/holidays/holidays.service.ts`**: replace
```ts
  /**
   * Which holidays apply to a branch.
   *
   * `branchId IS NULL` is a COMPANY-WIDE holiday (Navro'z, Mustaqillik kuni) —
   * nearly every row — and applies everywhere. A non-null one is a single branch
   * closing, which the model could not express at all before.
   *
   * `branchId === undefined` means the caller does not know or does not care,
   * and gets every holiday. That is deliberate: these helpers have ~15 call
   * sites across attendance validation, billing, group cascades, crons and the
   * dashboard, and quietly changing what all of them see would be a far larger
   * behavioural change than adding the capability. Call sites opt in as they
   * learn their branch.
   */
  private branchWhere(branchId?: number) {
    return branchId === undefined
      ? {}
      : { OR: [{ branchId: null }, { branchId }] };
  }

  async findActiveHolidayCovering(
    date: Date,
    branchId?: number,
  ): Promise<HolidayCoverage | null> {
```
with
```ts
  /**
   * Which holidays apply to a branch.
   *
   * `branchId IS NULL` is a COMPANY-WIDE holiday (Navro'z, Mustaqillik kuni)
   * and applies everywhere. A non-null one is a single branch closing, which a
   * Branch Director or Administrator declares for their own branch (CEO
   * decision 10.10.2026).
   *
   * - a number: the company-wide holidays plus that branch's own;
   * - `null`: the company-wide holidays only, for a run that serves every
   *   branch at once (the 21:00 report, the 20:00 group digest, the 09:00
   *   promise run), where one branch closing must not silence the others;
   * - `undefined`: every holiday of every branch. Left for a caller with no
   *   branch to ask about; a caller that has a group passes its branch.
   */
  private branchWhere(branchId?: number | null) {
    if (branchId === undefined) return {};
    if (branchId === null) return { branchId: null };
    return { OR: [{ branchId: null }, { branchId }] };
  }

  async findActiveHolidayCovering(
    date: Date,
    branchId?: number | null,
  ): Promise<HolidayCoverage | null> {
```
(`getActiveHolidaysInRange` and `buildHolidayDateSet` keep `branchId?: number`. Every existing caller of `findActiveHolidayCovering` passes a `number` or nothing, so none of them changes meaning.)

**3b. `server/src/dashboard/dashboard.service.ts`**: replace
```ts
    const holiday =
      await this.holidaysService.findActiveHolidayCovering(dateOnly);
```
with
```ts
    // Only the centre's holidays and this branch's own close its schedule.
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      dateOnly,
      branchId,
    );
```

**3c. `server/src/attendance/attendance-stats.service.ts`**: replace
```ts
      select: {
        id: true,
        exactDays: true,
        startDate: true,
        endDate: true,
```
with
```ts
      select: {
        id: true,
        branchId: true,
        exactDays: true,
        startDate: true,
        endDate: true,
```
and replace
```ts
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      rangeStart,
      rangeEnd,
    );
```
with
```ts
    // Only the centre's holidays and the group's own branch's close a lesson.
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      rangeStart,
      rangeEnd,
      group.branchId,
    );
```

**3d. `server/src/attendance/attendance-read.service.ts`**

`getLessonDates` select: replace
```ts
        id: true,
        name: true,
        exactDays: true,
```
with
```ts
        id: true,
        name: true,
        branchId: true,
        exactDays: true,
```
(`name: true,` occurs once in the file, so this anchor is unique.)

`getLessonDates` holidays: replace
```ts
    // HolidaysService internally pads ±1 day for UTC vs Tashkent midnight skew
    // and walks each holiday's [date, endDate] range to build the date set.
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      utcMidnightFromDateStr(rangeStartStr),
      utcMidnightFromDateStr(rangeEndStr),
    );
```
with
```ts
    // HolidaysService internally pads ±1 day for UTC vs Tashkent midnight skew
    // and walks each holiday's [date, endDate] range to build the date set.
    // Only the centre's holidays and the group's own branch's count.
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      utcMidnightFromDateStr(rangeStartStr),
      utcMidnightFromDateStr(rangeEndStr),
      group.branchId,
    );
```

`getLessonSequence` select: replace
```ts
        course: { select: { lessonPaymentCount: true } },
```
with
```ts
        course: { select: { lessonPaymentCount: true } },
        branchId: true,
```

`getLessonSequence` holidays: replace
```ts
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      utcMidnightFromDateStr(rangeStartStr),
      utcMidnightFromDateStr(rangeEndStr),
    );

    const baseLessonDates: string[] = [];
```
with
```ts
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      utcMidnightFromDateStr(rangeStartStr),
      utcMidnightFromDateStr(rangeEndStr),
      group.branchId,
    );

    const baseLessonDates: string[] = [];
```

**3e. `server/src/attendance/qr-attendance-session.service.ts`**: replace
```ts
      select: { id: true, name: true, exactDays: true, startDate: true },
```
with
```ts
      select: {
        id: true,
        name: true,
        exactDays: true,
        startDate: true,
        branchId: true,
      },
```
replace
```ts
    const lessonNumber = await this.computeLessonNumber(
      group?.startDate ?? null,
      group?.exactDays ?? null,
      parsedDate,
    );
```
with
```ts
    const lessonNumber = await this.computeLessonNumber(
      group?.startDate ?? null,
      group?.exactDays ?? null,
      parsedDate,
      group?.branchId,
    );
```
and replace
```ts
  private async computeLessonNumber(
    startDate: Date | null,
    exactDays: string[] | null,
    parsedDate: Date,
  ): Promise<number | null> {
    if (!startDate || !exactDays?.length) return null;

    const allowedDays = new Set(
      exactDays.map((d) => DAY_NAME_TO_JS[d.toLowerCase()]),
    );
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      startDate,
      parsedDate,
    );
```
with
```ts
  private async computeLessonNumber(
    startDate: Date | null,
    exactDays: string[] | null,
    parsedDate: Date,
    branchId: number | undefined,
  ): Promise<number | null> {
    if (!startDate || !exactDays?.length) return null;

    const allowedDays = new Set(
      exactDays.map((d) => DAY_NAME_TO_JS[d.toLowerCase()]),
    );
    // Only the centre's holidays and the group's own branch's skip a lesson.
    const holidaySet = await this.holidaysService.buildHolidayDateSet(
      startDate,
      parsedDate,
      branchId,
    );
```
(`computeLessonNumber` is private and has this one caller.)

**3f. Crons.** In `server/src/telegram-groups/telegram-group-daily-cron.service.ts` **and** in `server/src/telegram-groups/telegram-group-digest-cron.service.ts`, replace
```ts
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
    );
```
with
```ts
    // Company-wide holidays only (`null`): one branch closing does not stop
    // the other branches' messages (CEO decision 10.10.2026).
    const holiday = await this.holidaysService.findActiveHolidayCovering(
      new Date(),
      null,
    );
```
In `server/src/payment-promises/payment-promise-cron.service.ts`, replace
```ts
    const holiday = await this.holidays.findActiveHolidayCovering(new Date());
```
with
```ts
    // Company-wide holidays only: one branch closing does not hold up every
    // branch's broken-promise list (CEO decision 10.10.2026).
    const holiday = await this.holidays.findActiveHolidayCovering(
      new Date(),
      null,
    );
```

**3g. `server/CLAUDE.md`**: replace
```
  - `findActiveHolidayCovering(date)` — range-overlap check (`date <= X AND endDate >= X`). Replaces exact-date `findFirst` lookups.
```
with
```
  - `findActiveHolidayCovering(date)` — range-overlap check (`date <= X AND endDate >= X`). Replaces exact-date `findFirst` lookups.
  - **Pass the branch.** A caller that has a group passes `group.branchId` (`findActiveHolidayCovering(date, branchId)`, `buildHolidayDateSet(start, end, branchId)`, `getActiveHolidaysInRange(start, end, branchId)`): the company-wide holidays plus that branch's own. `findActiveHolidayCovering(date, null)` is the company-wide holidays only, for a run that serves every branch at once. No argument means every branch's holidays, which is right only for a caller with no branch.
```
and in the «Telegram stats crons skip Sundays and holidays» bullet replace
```
then call `findActiveHolidayCovering(new Date())` and return early on bayram days.
```
with
```
then call `findActiveHolidayCovering(new Date(), null)` and return early on a company-wide bayram day (a single branch's own holiday does not stop the reports; the 09:00 `PaymentPromiseCronService` run uses the same `null`).
```

**3h. `client/src/qollanma/kontent/guruhlar/bayramlar.mdx`**: replace
```
Bayram sanasi ham boshlanish, ham tugash kunini o'z ichiga oladi.
```
with
```
Bayram sanasi ham boshlanish, ham tugash kunini o'z ichiga oladi. Filial bayrami faqat o'sha filial guruhlariga tegadi: boshqa filialda davomat, jadval, dars eslatmalari va oylik hisob odatdagidek.
```
replace
```
| Telegram guruhlariga hisobot | Telegram guruhlariga boradigan kunlik hisobot (21:00) va kunlik xabarlar (20:00) bayramning hamma kunida o'tkazib yuboriladi. O'quvchi va xodimlarga shaxsiy Telegram xabarlari (20:00) har holda ketadi |
| Boshqa eslatmalar | Topshiriq muddatiga 1 soat qolganda eslatma va muddati o'tgan to'lov va'dalarini tekshirish (09:00) ham bayramning hamma kunida o'tkazib yuboriladi |
```
with
```
| Telegram guruhlariga hisobot | Telegram guruhlariga boradigan kunlik hisobot (21:00) va kunlik xabarlar (20:00) butun markaz bayramining hamma kunida o'tkazib yuboriladi; filial bayramida ular odatdagidek ketadi. O'quvchi va xodimlarga shaxsiy Telegram xabarlari (20:00) har holda ketadi |
| Boshqa eslatmalar | Topshiriq muddatiga 1 soat qolganda eslatma bayramning hamma kunida o'tkazib yuboriladi. Muddati o'tgan to'lov va'dalarini tekshirish (09:00) faqat butun markaz bayramida o'tkazib yuboriladi |
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/holidays src/dashboard src/attendance src/telegram-groups/telegram-group-daily-cron.service.spec.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts src/payment-promises`
Expected: PASS.

Run: `cd client && npx vitest run src/qollanma`
Expected: PASS.

- [ ] **Step 5: Manifest**: no route moves in this task.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi/server
npx prettier --write src/holidays/holidays.service.ts src/holidays/holidays.service.spec.ts src/dashboard/dashboard.service.ts src/dashboard/dashboard.service.spec.ts src/attendance/attendance-stats.service.ts src/attendance/attendance-read.service.ts src/attendance/qr-attendance-session.service.ts src/attendance/attendance.service.spec.ts src/attendance/qr-attendance.service.spec.ts src/telegram-groups/telegram-group-daily-cron.service.ts src/telegram-groups/telegram-group-daily-cron.service.spec.ts src/telegram-groups/telegram-group-digest-cron.service.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts src/payment-promises/payment-promise-cron.service.ts src/payment-promises/payment-promise-cron.service.spec.ts
npx eslint src/holidays src/dashboard/dashboard.service.ts src/dashboard/dashboard.service.spec.ts src/attendance/attendance-stats.service.ts src/attendance/attendance-read.service.ts src/attendance/qr-attendance-session.service.ts src/attendance/attendance.service.spec.ts src/attendance/qr-attendance.service.spec.ts src/telegram-groups/telegram-group-daily-cron.service.ts src/telegram-groups/telegram-group-daily-cron.service.spec.ts src/telegram-groups/telegram-group-digest-cron.service.ts src/telegram-groups/telegram-group-digest-cron.service.spec.ts src/payment-promises
npm run typecheck
npm test
```
Expected: no ESLint errors, typecheck clean, full suite green.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/holidays/holidays.service.ts server/src/holidays/holidays.service.spec.ts server/src/dashboard/dashboard.service.ts server/src/dashboard/dashboard.service.spec.ts server/src/attendance/attendance-stats.service.ts server/src/attendance/attendance-read.service.ts server/src/attendance/qr-attendance-session.service.ts server/src/attendance/attendance.service.spec.ts server/src/attendance/qr-attendance.service.spec.ts server/src/telegram-groups/telegram-group-daily-cron.service.ts server/src/telegram-groups/telegram-group-daily-cron.service.spec.ts server/src/telegram-groups/telegram-group-digest-cron.service.ts server/src/telegram-groups/telegram-group-digest-cron.service.spec.ts server/src/payment-promises/payment-promise-cron.service.ts server/src/payment-promises/payment-promise-cron.service.spec.ts server/CLAUDE.md client/src/qollanma/kontent/guruhlar/bayramlar.mdx
git commit -m "$(cat <<'EOF'
fix(holidays): readers follow the group's branch; whole-company runs skip only centre-wide holidays

A branch holiday no longer empties every branch's schedule, drops lessons from
other branches' attendance tab, stats and QR numbering, or stops the 21:00
report, the 20:00 group digest and the 09:00 promise run for the whole company.
findActiveHolidayCovering(date, null) reads the company-wide holidays only.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 2c: Reports that count lessons honour branch holidays

After Task 2 a branch can have its own holiday. Two report readers still build ONE holiday set for every group they walk, so a Namangan holiday would close every branch:
- `ReportsExpectationService` («Oy oxiriga kutilyapti», the «Foyda tarkibi» forecast, the Telegram lines) would drop that day's projected lessons in every branch. The 23:40 `DailySnapshotService` would then store that wrong figure, and the snapshot cannot be rebuilt.
- `/reports/activity` (`ReportsCenterActivityService`) would take the day off every room's working days and every group's lesson hours.

This task gives each group the company-wide holidays plus its own branch's. A new helper reads every branch's holidays in ONE query and splits them in memory. Task 2b adds no such helper: it passes `group.branchId` to `buildHolidayDateSet` one group at a time.

**Every holiday reader.** `grep -rn "buildHolidayDateSet\|getActiveHolidaysInRange\|findActiveHolidayCovering\|termHolidays" server/src --include='*.ts'`, specs excluded, line numbers at `39a3ea42`:

| Reader | Branch handling |
| --- | --- |
| `attendance/attendance-read.service.ts:195` (`getLessonDates`), `:847` (`getLessonSequence`), `attendance/attendance-stats.service.ts:67`, `attendance/qr-attendance-session.service.ts:227`, `dashboard/dashboard.service.ts:46` | Task 2b passes `group.branchId` / `branchId` |
| `telegram-groups/telegram-group-daily-cron.service.ts:50`, `telegram-groups/telegram-group-digest-cron.service.ts:77`, `payment-promises/payment-promise-cron.service.ts:42` | Task 2b passes `null` (company-wide only) |
| `groups/group-holiday-cascade.service.ts:134`, `:177`, `:326` | Task 2 passes `group.branchId` |
| `attendance/attendance-read.service.ts:377` (`getLessonCalendar`, `group.branchId` at :380), `attendance/attendance-validation.service.ts:132`, `attendance/attendance-reminder.service.ts:196`, `attendance/unmarked-lessons.service.ts:97`, `:116` | Already right |
| `billing/month-plan.ts:90` (`resolveMonthPlan`, `branchId`), `transactions/transactions-read.service.ts:602`, `refundable/refundable.service.ts:376`, `unmarked-lessons/reask-holidays.ts:37`, `unmarked-lessons/make-up-day.ts:54`, `unmarked-lessons/unmarked-lesson-transitions.ts:381`, `balance-notices/load-transfer-state.ts:59`, `:87`, `refunds/refund-due-date.ts:21` | Already right (free function / `termHolidays` with the branch) |
| `tasks/tasks.service.ts:134` | `branchId ?? undefined`: only a branch-less task reads every branch. Not a lesson count (Task 2b notes) |
| `reports/reports-expectation.service.ts:160` | **This task** |
| `reports/reports-center-activity.service.ts:196` | **This task** (two uses: working days `:199`, trend `:553`) |

**Salary and billing, checked:**
- `salary/shared/gap-sweep.ts` reads no holiday. `sweepGapLessons` walks `input.attendances` (`:304`), never a calendar. A held lesson has an attendance row, and validation already refuses a row only on the group's own branch's holiday (`attendance-validation.service.ts:132–135`). Right as is.
- `salary/shared/missed-lessons.ts` is pure and takes `plannedDates` from its caller (`:97`). `salary/salary-missed-lessons.service.ts:85–91` builds them with `resolveMonthPlan(this.prisma, g.id, g.branchId, year, mon)`, which reads `buildHolidayDateSet(tx, …, branchId)` (`billing/month-plan.ts:90`). That returns the company-wide days plus that branch's own (`holidays/holiday-date-set.ts:28–31`). Right as is.
- `billing/month-plan.ts` is already on Task 2b's «already branch-aware» list. Every caller passes the group's branch: `monthly-charge.service.ts:464–470` (`enr.group.branchId`), `lesson-billing.service.ts:375–381`, `monthly-payment-notice.service.ts:578–584`.

**Files:**
- Modify: `server/src/holidays/holiday-date-set.ts` (new `buildHolidayDateSetsByBranch` + `BranchHolidayDates`; the query and the day walk shared with `buildHolidayDateSet`)
- Modify: `server/src/holidays/holidays.service.ts` (delegating `buildHolidayDateSetsByBranch`)
- Modify: `server/src/reports/expectation-math.ts` (`holidayDates` moves from `SplitOptions` onto `ExpectationGroup`)
- Modify: `server/src/reports/reports-expectation.service.ts` (one read, each group gets its branch's set)
- Modify: `server/src/reports/expectation-cache.ts` (`EXPECTATION_CACHE_VERSION` v2 → v3)
- Modify: `server/src/reports/reports-center-activity.service.ts` (per-room working days, per-group trend holiday)
- Modify: `server/scripts/backtest-monthly-expectation.ts` (its holiday stub)
- Modify: `server/CLAUDE.md` (one bullet in «Holidays»)
- Modify: `client/src/qollanma/kontent/guruhlar/bayramlar.mdx` (Task 2b's sentence gains the two reports)
- Test: `server/src/holidays/holiday-date-set.spec.ts`, `server/src/reports/expectation-math.spec.ts`, `server/src/reports/reports-expectation.service.spec.ts`, `server/src/reports/reports-center-activity.service.spec.ts`, `server/src/reports/reports-branch-scope-coverage.spec.ts`

**Interfaces:**
- Consumes:
  - `buildHolidayDateSet(db: HolidayDateSetDb, rangeStart: Date, rangeEnd: Date, branchId?: number | null): Promise<Set<string>>` and `holidayBranchWhere(branchId?: number | null)` (`holidays/holiday-date-set.ts`).
  - `HolidaysService.buildHolidayDateSet(rangeStart, rangeEnd, branchId?: number)`.
  - `splitMonthLessons(groups: ExpectationGroup[], opts: SplitOptions): LessonSplit` (`reports/expectation-math.ts`).
  - Nothing from Task 2 or 2b except the text of 2b's guide sentence (Step 3h).
- Produces:
  - `type BranchHolidayDates = (branchId: number) => Set<string>`.
  - `buildHolidayDateSetsByBranch(db, rangeStart, rangeEnd): Promise<BranchHolidayDates>` in `holiday-date-set.ts`, and `HolidaysService.buildHolidayDateSetsByBranch(rangeStart, rangeEnd)`.
  - `ExpectationGroup.holidayDates: Set<string>` (required); `SplitOptions` no longer has `holidayDates`.
  - Task 3 relies on none of these.

- [ ] **Step 1: Write the failing tests**

**1a.** `server/src/holidays/holiday-date-set.spec.ts`: replace
```ts
import { termHolidays } from './holiday-date-set';
```
with
```ts
import { buildHolidayDateSetsByBranch, termHolidays } from './holiday-date-set';
```
and append at the end of the file:
```ts

// CEO decision 10.10.2026: a branch's own holiday closes that branch alone.
describe('buildHolidayDateSetsByBranch', () => {
  it("gives each branch the company-wide days and its own, from one read", async () => {
    const db = {
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-03-21T00:00:00Z'),
            endDate: new Date('2026-03-21T00:00:00Z'),
            branchId: null,
          },
          {
            date: new Date('2026-03-25T00:00:00Z'),
            endDate: new Date('2026-03-26T00:00:00Z'),
            branchId: 2,
          },
        ]),
      },
    };

    const forBranch = await buildHolidayDateSetsByBranch(
      db as never,
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    );

    expect([...forBranch(1)]).toEqual(['2026-03-21']);
    expect([...forBranch(2)].sort()).toEqual([
      '2026-03-21',
      '2026-03-25',
      '2026-03-26',
    ]);
    // One query for every branch; the split happens in memory.
    expect(db.holiday.findMany).toHaveBeenCalledTimes(1);
    const where = db.holiday.findMany.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({ status: 'ACTIVE', deletedAt: null }),
    );
    expect(where.OR).toBeUndefined();
    expect(where.branchId).toBeUndefined();
  });
});
```

**1b.** `server/src/reports/expectation-math.spec.ts`: the holidays move onto the group.

Replace
```ts
  cancelledDates: new Set<string>(),
  holidayMakeupDates: new Set<string>(),
```
with
```ts
  cancelledDates: new Set<string>(),
  holidayDates: new Set<string>(),
  holidayMakeupDates: new Set<string>(),
```

Replace
```ts
const opts = (holidays: string[] = [], todayStr = '2026-07-31') => ({
  monthStartStr: '2026-08-01',
  monthEndStr: '2026-08-31',
  holidayDates: new Set(holidays),
  todayStr,
});
```
with
```ts
const opts = (todayStr = '2026-07-31') => ({
  monthStartStr: '2026-08-01',
  monthEndStr: '2026-08-31',
  todayStr,
});
```

Replace
```ts
    const r = splitMonthLessons([group()], opts(['2026-08-03', '2026-08-05']));
```
with
```ts
    const r = splitMonthLessons(
      [group({ holidayDates: new Set(['2026-08-03', '2026-08-05']) })],
      opts(),
    );
```

Replace
```ts
      [group({ holidayMakeupDates: new Set(['2026-08-03']) })],
      opts(['2026-08-03', '2026-08-05']),
```
with
```ts
      [
        group({
          holidayDates: new Set(['2026-08-03', '2026-08-05']),
          holidayMakeupDates: new Set(['2026-08-03']),
        }),
      ],
      opts(),
```

Replace `opts([], '2026-08-15')` with `opts('2026-08-15')`, `opts([], '2026-08-17')` with `opts('2026-08-17')`, and `opts([], '2026-09-01')` with `opts('2026-09-01')`. Each occurs once.

**1c.** `server/src/reports/reports-expectation.service.spec.ts`

Replace
```ts
          useValue: (holidays = {
            buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
          }),
```
with
```ts
          useValue: (holidays = {
            // No holiday in any branch unless a test says otherwise.
            buildHolidayDateSetsByBranch: jest
              .fn()
              .mockResolvedValue(() => new Set<string>()),
          }),
```

In `describe('bayramli oy — prognoz hisoblangan oy narxiga TENG', ...)`, replace ALL FOUR occurrences of
```ts
      holidays.buildHolidayDateSet.mockResolvedValueOnce(
        new Set(['2026-08-03']),
      );
```
with
```ts
      holidays.buildHolidayDateSetsByBranch.mockResolvedValueOnce(
        () => new Set(['2026-08-03']),
      );
```
(The text is identical each time, so use the editor's replace-all. Those groups carry no `branchId`; the stub ignores its argument.)

Insert directly before `  // I1 — oylik yozilishda \`LESSON_CONSUMPTION\` UMUMAN yozilmaydi. Busiz`:
```ts
  // CEO decision 10.10.2026: a branch's own holiday closes that branch alone.
  // With one holiday set for the whole month, Namangan's closing dropped
  // every branch's projected lesson, and the 23:40 snapshot kept that figure.
  it('drops a branch-2 holiday from the branch-2 group only', async () => {
    const mondays = (id: string, branchId: number, studentId: number) => ({
      id,
      branchId,
      statusEnum: 'ACTIVE',
      deletedAt: null,
      exactDays: ['monday'], // avgust 2026: 3, 10, 17, 24, 31
      startDate: null,
      endDate: null,
      scheduleSnapshots: [],
      course: { price: 1_200_000, lessonPaymentCount: 12 },
      contracts: [],
      enrollments: [{ studentId, student: { discountPercent: 0 } }],
    });
    prisma.group.findMany.mockResolvedValueOnce([
      mondays('fargona', 1, 10001),
      mondays('namangan', 2, 10002),
    ]);
    holidays.buildHolidayDateSetsByBranch.mockResolvedValueOnce(
      (branchId: number) =>
        branchId === 2 ? new Set(['2026-08-10']) : new Set<string>(),
    );

    const r = await service.getMonthlyExpectation(1, {
      month: '2026-08',
      branchIds: null,
    });

    expect(prisma.group.findMany.mock.calls[0][0].select.branchId).toBe(true);
    expect(holidays.buildHolidayDateSetsByBranch).toHaveBeenCalledWith(
      new Date(Date.UTC(2026, 7, 1)),
      new Date(Date.UTC(2026, 7, 31)),
    );
    // Farg'ona keeps all 5 Mondays, Namangan loses 10.08: 5 + 4 lessons.
    expect(r.remainingLessons).toBe(9);
    expect(r.remainingValue).toBe(900_000);
  });

```

**1d.** `server/src/reports/reports-branch-scope-coverage.spec.ts`, in `describe('branch scope coverage — expectation service', ...)`: replace
```ts
          useValue: {
            buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
          },
```
with
```ts
          useValue: {
            buildHolidayDateSetsByBranch: jest
              .fn()
              .mockResolvedValue(() => new Set<string>()),
          },
```

**1e.** `server/src/reports/reports-center-activity.service.spec.ts`

Replace
```ts
    holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      buildHolidayDateSet: jest.fn().mockResolvedValue(new Set()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };
```
with
```ts
    holidaysService = {
      findActiveHolidayCovering: jest.fn().mockResolvedValue(null),
      // No holiday in any branch unless a test says otherwise.
      buildHolidayDateSetsByBranch: jest
        .fn()
        .mockResolvedValue(() => new Set<string>()),
      getActiveHolidaysInRange: jest.fn().mockResolvedValue([]),
    };
```

In `it('regression: queries the multi-day-aware holiday helper (bug #3)', ...)`, replace
```ts
    // HolidaysService.buildHolidayDateSet which expands [date, endDate] into
    // the full set of covered Tashkent calendar days.
```
with
```ts
    // HolidaysService.buildHolidayDateSetsByBranch, which expands
    // [date, endDate] into the covered Tashkent calendar days of each branch.
```
and replace
```ts
    expect(holidaysService.buildHolidayDateSet).toHaveBeenCalled();
```
with
```ts
    expect(holidaysService.buildHolidayDateSetsByBranch).toHaveBeenCalled();
```

Insert directly before `  // ----- Snapshot-based historical accuracy tests --------------------------`:
```ts
  // CEO decision 10.10.2026: a branch's own holiday closes that branch alone.
  describe('a branch-2 holiday', () => {
    const EVERY_DAY = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    beforeEach(() => {
      prisma.room.findMany.mockResolvedValue([
        { id: 'r1', name: "Farg'ona", capacity: 20, branchId: 1, branch },
        { id: 'r2', name: 'Namangan', capacity: 20, branchId: 2, branch },
      ]);
      // A 2-hour lesson every day in each 12-hour room.
      prisma.group.findMany.mockResolvedValue([
        makeGroup('g1', 'r1', 10, EVERY_DAY, '09:00', '11:00', 500_000),
        {
          ...makeGroup('g2', 'r2', 10, EVERY_DAY, '09:00', '11:00', 500_000),
          branchId: 2,
        },
      ]);
      holidaysService.buildHolidayDateSetsByBranch.mockResolvedValue(
        (branchId: number) =>
          branchId === 2 ? new Set(['2026-04-13']) : new Set<string>(),
      );
    });

    it("takes the day off the branch-2 room's period, not the branch-1 room's", async () => {
      const result = (await service.getCenterActivity(1, makeQuery())) as {
        rooms: Array<{ id: string; totals: { idleHoursPeriod: number } }>;
        kpis: { emptyHours: number };
      };

      // (84 − 14) idle hours a week: Farg'ona over 30 April days, Namangan
      // over 29.
      expect(
        Object.fromEntries(
          result.rooms.map((r) => [r.id, r.totals.idleHoursPeriod]),
        ),
      ).toEqual({ r1: 300, r2: 290 });
      expect(result.kpis.emptyHours).toBe(590);
    });

    it("drops the branch-2 group's lesson on the day and keeps the branch-1 group's", async () => {
      const { trend } = (await service.getCenterActivity(1, makeQuery())) as {
        trend: Array<{
          bucketStart: string;
          utilizationPct: number;
          emptyHours: number;
        }>;
      };
      const day = (iso: string) => trend.find((p) => p.bucketStart === iso);

      // Only Farg'ona's 2 hours out of 24 room-hours.
      expect(day('2026-04-13')).toEqual(
        expect.objectContaining({ utilizationPct: 8.3, emptyHours: 22 }),
      );
      // Any other day both rooms teach: 4 out of 24.
      expect(day('2026-04-14')).toEqual(
        expect.objectContaining({ utilizationPct: 16.7, emptyHours: 20 }),
      );
    });
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/holidays/holiday-date-set.spec.ts src/reports/expectation-math.spec.ts src/reports/reports-expectation.service.spec.ts src/reports/reports-center-activity.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts`
Expected: FAIL.
- `holiday-date-set.spec.ts`: «gives each branch…» fails with `TypeError: (0 , holiday_date_set_1.buildHolidayDateSetsByBranch) is not a function`. `termHolidays` passes.
- `expectation-math.spec.ts`: every test whose group has a roster fails with `TypeError: Cannot read properties of undefined (reading 'has')`. `splitMonthLessons` still reads `holidayDates` from the options, and they no longer carry it. «contributes nothing when the group has no active students» passes.
- `reports-expectation.service.spec.ts` and the expectation block of `reports-branch-scope-coverage.spec.ts`: every test that gets past the empty-scope guard fails with `TypeError: this.holidays.buildHolidayDateSet is not a function`. The empty-scope tests pass.
- `reports-center-activity.service.spec.ts`: every test that misses the cache fails with `TypeError: this.holidaysService.buildHolidayDateSet is not a function`. «returns cached payload when present» passes.

- [ ] **Step 3: Implement**

**3a. `server/src/holidays/holiday-date-set.ts`**: replace the whole `buildHolidayDateSet` function with its doc comment, from
```ts
/**
 * `[rangeStart, rangeEnd]` ichidagi bayram kunlari (Toshkent kalendari,
 * `YYYY-MM-DD`). So'rov chegaralari ±1 kunga kengaytiriladi — UTC va Toshkent
 * yarim tunlari orasidagi siljishni yutish uchun.
 */
export async function buildHolidayDateSet(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
  branchId?: number | null,
): Promise<Set<string>> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const holidays = await db.holiday.findMany({
    where: {
      status: HolidayStatus.ACTIVE,
      deletedAt: null,
      date: { lte: new Date(rangeEnd.getTime() + DAY_MS) },
      endDate: { gte: new Date(rangeStart.getTime() - DAY_MS) },
      ...holidayBranchWhere(branchId),
    },
    select: { date: true, endDate: true },
  });

  const rangeStartStr = tashkentDateStr(rangeStart);
  const rangeEndStr = tashkentDateStr(rangeEnd);

  const set = new Set<string>();
  for (const h of holidays) {
    let cursor = tashkentDateStr(h.date);
    const end = tashkentDateStr(h.endDate);
    while (cursor <= end) {
      if (cursor >= rangeStartStr && cursor <= rangeEndStr) set.add(cursor);
      cursor = addDaysToDateStr(cursor, 1);
    }
  }
  return set;
}
```
with
```ts
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * ACTIVE holidays overlapping `[rangeStart, rangeEnd]`. The bounds are padded
 * by ±1 day to absorb the UTC vs Tashkent midnight skew.
 */
function activeHolidaysIn(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
  branchId?: number | null,
) {
  return db.holiday.findMany({
    where: {
      status: HolidayStatus.ACTIVE,
      deletedAt: null,
      date: { lte: new Date(rangeEnd.getTime() + DAY_MS) },
      endDate: { gte: new Date(rangeStart.getTime() - DAY_MS) },
      ...holidayBranchWhere(branchId),
    },
    select: { date: true, endDate: true, branchId: true },
  });
}

/** Adds the Tashkent days of `h` that fall inside `[fromStr, toStr]` to `set`. */
function addHolidayDays(
  set: Set<string>,
  h: { date: Date; endDate: Date },
  fromStr: string,
  toStr: string,
): void {
  let cursor = tashkentDateStr(h.date);
  const end = tashkentDateStr(h.endDate);
  while (cursor <= end) {
    if (cursor >= fromStr && cursor <= toStr) set.add(cursor);
    cursor = addDaysToDateStr(cursor, 1);
  }
}

/**
 * `[rangeStart, rangeEnd]` ichidagi bayram kunlari (Toshkent kalendari,
 * `YYYY-MM-DD`). So'rov chegaralari ±1 kunga kengaytiriladi — UTC va Toshkent
 * yarim tunlari orasidagi siljishni yutish uchun.
 */
export async function buildHolidayDateSet(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
  branchId?: number | null,
): Promise<Set<string>> {
  const holidays = await activeHolidaysIn(db, rangeStart, rangeEnd, branchId);
  const fromStr = tashkentDateStr(rangeStart);
  const toStr = tashkentDateStr(rangeEnd);
  const set = new Set<string>();
  for (const h of holidays) addHolidayDays(set, h, fromStr, toStr);
  return set;
}

/** A branch's holiday days: the company-wide ones plus the branch's own. */
export type BranchHolidayDates = (branchId: number) => Set<string>;

/**
 * Every branch's holiday days in ONE read, for a report that walks groups of
 * several branches at once (the month-end expectation, the activity report).
 * One set for all of them would let a branch's own holiday close every branch
 * (CEO decision 10.10.2026: it closes that branch alone).
 */
export async function buildHolidayDateSetsByBranch(
  db: HolidayDateSetDb,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<BranchHolidayDates> {
  const holidays = await activeHolidaysIn(db, rangeStart, rangeEnd);
  const fromStr = tashkentDateStr(rangeStart);
  const toStr = tashkentDateStr(rangeEnd);
  const companyWide = new Set<string>();
  const own = new Map<number, Set<string>>();
  for (const h of holidays) {
    let set = companyWide;
    if (h.branchId != null) {
      set = own.get(h.branchId) ?? new Set<string>();
      own.set(h.branchId, set);
    }
    addHolidayDays(set, h, fromStr, toStr);
  }
  // Merged once per branch: the activity report asks per group per day.
  const merged = new Map<number, Set<string>>();
  return (branchId) => {
    let set = merged.get(branchId);
    if (!set) {
      set = new Set([...companyWide, ...(own.get(branchId) ?? [])]);
      merged.set(branchId, set);
    }
    return set;
  };
}
```
`termHolidays` and `TERM_HOLIDAY_HORIZON_DAYS` below stay unchanged. `buildHolidayDateSet` returns the same days as before. Its query now also selects `branchId`, and every spec that inspects the query matches `where` with `objectContaining`.

**3b. `server/src/holidays/holidays.service.ts`**

Replace
```ts
import { buildHolidayDateSet } from './holiday-date-set';
```
with
```ts
import {
  buildHolidayDateSet,
  buildHolidayDateSetsByBranch,
  type BranchHolidayDates,
} from './holiday-date-set';
```

Replace
```ts
    return buildHolidayDateSet(this.prisma, rangeStart, rangeEnd, branchId);
  }
```
with
```ts
    return buildHolidayDateSet(this.prisma, rangeStart, rangeEnd, branchId);
  }

  /**
   * Every branch's holiday days in one read: `forBranch(id)` is the
   * company-wide days plus that branch's own. For a report that walks groups
   * of several branches at once, where one set for all of them would let one
   * branch's holiday close every branch.
   */
  async buildHolidayDateSetsByBranch(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<BranchHolidayDates> {
    return buildHolidayDateSetsByBranch(this.prisma, rangeStart, rangeEnd);
  }
```
(Neither anchor is touched by Task 2 or 2b.)

**3c. `server/src/reports/expectation-math.ts`**

Replace
```ts
  /** Tashkent dates with an active LessonCancellation. */
  cancelledDates: Set<string>;
```
with
```ts
  /** Tashkent dates with an active LessonCancellation. */
  cancelledDates: Set<string>;
  /**
   * Holiday dates of THIS group's branch: the company-wide ones plus its own
   * branch's (CEO decision 10.10.2026). Per group, never one set for the
   * month: another branch's holiday must not drop this group's lessons.
   */
  holidayDates: Set<string>;
```

Replace
```ts
export interface SplitOptions {
  monthStartStr: string;
  monthEndStr: string;
  holidayDates: Set<string>;
```
with
```ts
export interface SplitOptions {
  monthStartStr: string;
  monthEndStr: string;
```

Replace
```ts
  { monthStartStr, monthEndStr, holidayDates, todayStr }: SplitOptions,
```
with
```ts
  { monthStartStr, monthEndStr, todayStr }: SplitOptions,
```

Replace
```ts
      if (holidayDates.has(d) && !g.holidayMakeupDates.has(d)) continue;
```
with
```ts
      if (g.holidayDates.has(d) && !g.holidayMakeupDates.has(d)) continue;
```

**3d. `server/src/reports/reports-expectation.service.ts`**

Replace
```ts
          select: {
            id: true,
            statusEnum: true,
            deletedAt: true,
```
with
```ts
          select: {
            id: true,
            branchId: true,
            statusEnum: true,
            deletedAt: true,
```

Replace
```ts
    const [groups, holidayDates, cancellations, reschedules] =
      await Promise.all([
```
with
```ts
    const [groups, holidaysFor, cancellations, reschedules] =
      await Promise.all([
```

Replace
```ts
        this.holidays.buildHolidayDateSet(
          startDate,
          new Date(endDateExcl.getTime() - DAY_MS),
        ),
```
with
```ts
        // Every branch's holidays in one read. Each group is walked against
        // its own branch's (`holidayDates` below), never one set for all.
        this.holidays.buildHolidayDateSetsByBranch(
          startDate,
          new Date(endDateExcl.getTime() - DAY_MS),
        ),
```

Replace
```ts
        cancelledDates: cancelledByGroup.get(g.id) ?? new Set<string>(),
```
with
```ts
        cancelledDates: cancelledByGroup.get(g.id) ?? new Set<string>(),
        // The company-wide holidays plus this group's own branch's: another
        // branch closing never drops this group's lessons.
        holidayDates: holidaysFor(g.branchId),
```

Replace
```ts
    const split = splitMonthLessons(inputs, {
      monthStartStr,
      monthEndStr,
      holidayDates,
      todayStr,
    });
```
with
```ts
    const split = splitMonthLessons(inputs, {
      monthStartStr,
      monthEndStr,
      todayStr,
    });
```
(`holidayMakeupsFor` reads no holiday and stays as it is: it only names the days a move made up for, and `splitMonthLessons` checks them against the group's own `holidayDates`.)

**3e. `server/src/reports/expectation-cache.ts`**: replace
```ts
/**
 * Bump when the figure's definition changes, so a deploy does not serve the
 * old formula from cache until midnight. v2: held lessons priced through
 * `resolveHeldLessonPrice` (ADR-0038).
 */
const EXPECTATION_CACHE_VERSION = 'v2';
```
with
```ts
/**
 * Bump when the figure's definition changes, so a deploy does not serve the
 * old formula from cache until midnight. v2: held lessons priced through
 * `resolveHeldLessonPrice` (ADR-0038). v3: each group skips only the
 * company-wide holidays and its own branch's (CEO decision 10.10.2026).
 */
const EXPECTATION_CACHE_VERSION = 'v3';
```

**3f. `server/src/reports/reports-center-activity.service.ts`**

Replace
```ts
import { HolidaysService } from '../holidays/holidays.service';
```
with
```ts
import { HolidaysService } from '../holidays/holidays.service';
import type { BranchHolidayDates } from '../holidays/holiday-date-set';
```

Replace
```ts
    const [rooms, groups, holidayDates] = await Promise.all([
```
with
```ts
    const [rooms, groups, holidaysFor] = await Promise.all([
```

Replace
```ts
      // Multi-day-aware: expands each active holiday's [date, endDate]
      // range into a Set of Tashkent calendar days that intersect [start, end].
      this.holidaysService.buildHolidayDateSet(range.start, range.end),
    ]);

    const workingDaysInPeriod = this.countWorkingDays(range, holidayDates);
    const periodScale = workingDaysInPeriod / 7;
```
with
```ts
      // Multi-day-aware: expands each active holiday's [date, endDate]
      // range into a Set of Tashkent calendar days that intersect [start, end].
      // One read for every branch: `holidaysFor(branchId)` is the company-wide
      // days plus that branch's own (CEO decision 10.10.2026).
      this.holidaysService.buildHolidayDateSetsByBranch(range.start, range.end),
    ]);
```

Replace
```ts
      return this.buildRoomEntry(
        room,
        filteredGroups,
        periodScale,
        range.end,
        snaps,
      );
```
with
```ts
      // A room works the days its own branch is open: another branch's
      // holiday does not shorten its period.
      const periodScale =
        this.countWorkingDays(range, holidaysFor(room.branchId)) / 7;
      return this.buildRoomEntry(
        room,
        filteredGroups,
        periodScale,
        range.end,
        snaps,
      );
```

Replace
```ts
    const trend = this.buildTrend(
      rooms,
      groups,
      range,
      holidayDates,
      bucketUsed,
      snaps,
    );
```
with
```ts
    const trend = this.buildTrend(
      rooms,
      groups,
      range,
      holidaysFor,
      bucketUsed,
      snaps,
    );
```

In `buildTrend`'s signature, replace
```ts
    range: ResolvedRange,
    holidayDates: Set<string>,
    bucket: CenterActivityBucket,
```
with
```ts
    range: ResolvedRange,
    holidaysFor: BranchHolidayDates,
    bucket: CenterActivityBucket,
```

Replace
```ts
      const iso = this.toIsoDate(cursor);
      const isHoliday = holidayDates.has(iso);
```
with
```ts
      const iso = this.toIsoDate(cursor);
```

Replace
```ts
        // Day-dependent: only groups that meet today (using snapshot schedule)
        const groupsTodayWithSchedule = !isHoliday
          ? roomGroups
              .filter((g) => this.groupActiveOn(g, cursor))
              .map((g) => ({
                group: g,
                schedule: this.scheduleOn(g.id, cursor, snaps, {
                  exactDays: g.exactDays,
                  lessonStartTime: g.lessonStartTime,
                  lessonEndTime: g.lessonEndTime,
                  courseId: g.courseId,
                  validFrom: g.createdAt,
                  validTo: null,
                }),
              }))
              .filter(({ schedule }) => schedule.exactDays.includes(dayCode))
          : [];
```
with
```ts
        // Day-dependent: only groups that meet today (using snapshot schedule).
        // A holiday closes a group only when it is the company's or the
        // group's own branch's (CEO decision 10.10.2026).
        const groupsTodayWithSchedule = roomGroups
          .filter(
            (g) =>
              this.groupActiveOn(g, cursor) &&
              !holidaysFor(g.branchId).has(iso),
          )
          .map((g) => ({
            group: g,
            schedule: this.scheduleOn(g.id, cursor, snaps, {
              exactDays: g.exactDays,
              lessonStartTime: g.lessonStartTime,
              lessonEndTime: g.lessonEndTime,
              courseId: g.courseId,
              validFrom: g.createdAt,
              validTo: null,
            }),
          }))
          .filter(({ schedule }) => schedule.exactDays.includes(dayCode));
```
`countWorkingDays(range, holidayDates: Set<string>)` stays as it is. It now receives one branch's set.

**3g. `server/scripts/backtest-monthly-expectation.ts`.** Scripts are not type-checked, so without this change the script compiles and then crashes on the missing method. Replace
```ts
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
```
with
```ts
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
import { buildHolidayDateSetsByBranch } from '../src/holidays/holiday-date-set';
```
and replace the whole stub
```ts
/**
 * `HolidaysService` drags in the status/history/cascade graph, none of which
 * `buildHolidayDateSet` touches. A script has no Nest container, so the one
 * method the expectation service calls is reimplemented here against the same
 * table with the same ±1 day padding.
 */
const holidayStub = {
  async buildHolidayDateSet(rangeStart: Date, rangeEnd: Date) {
    const paddedStart = new Date(rangeStart.getTime() - 86_400_000);
    const paddedEnd = new Date(rangeEnd.getTime() + 86_400_000);
    const rows = await prisma.holiday.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        date: { lte: paddedEnd },
        endDate: { gte: paddedStart },
      },
      select: { date: true, endDate: true },
    });
    const set = new Set<string>();
    for (const h of rows) {
      const s = new Date(h.date);
      const e = new Date(h.endDate ?? h.date);
      for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
        set.add(d.toISOString().slice(0, 10));
      }
    }
    return set;
  },
};
```
with
```ts
/**
 * `HolidaysService` drags in the status/history/cascade graph, none of which
 * the holiday read touches. A script has no Nest container, so the one method
 * the expectation service calls goes straight to `holiday-date-set.ts`, the
 * function the service itself delegates to.
 */
const holidayStub = {
  buildHolidayDateSetsByBranch: (rangeStart: Date, rangeEnd: Date) =>
    buildHolidayDateSetsByBranch(prisma, rangeStart, rangeEnd),
};
```

**3h. Docs.**

`server/CLAUDE.md`, section «Holidays (Multi-day + Group endDate cascade)». Replace
```
  - `getActiveHolidaysInRange(start, end)` — raw row list with overlap.
```
with
```
  - `getActiveHolidaysInRange(start, end)` — raw row list with overlap.
  - `buildHolidayDateSetsByBranch(start, end)` — every branch's holiday days in ONE read, for a report that walks groups of several branches at once (the month-end expectation, `/reports/activity`). It returns `forBranch(branchId)`: the company-wide days plus that branch's own. Never hand such a report one `buildHolidayDateSet` for all its groups: one branch's holiday would close every branch, and the 23:40 snapshot would keep that figure for good.
```

`client/src/qollanma/kontent/guruhlar/bayramlar.mdx`. Replace the sentence Task 2b wrote:
```
Bayram sanasi ham boshlanish, ham tugash kunini o'z ichiga oladi. Filial bayrami faqat o'sha filial guruhlariga tegadi: boshqa filialda davomat, jadval, dars eslatmalari va oylik hisob odatdagidek.
```
with
```
Bayram sanasi ham boshlanish, ham tugash kunini o'z ichiga oladi. Filial bayrami faqat o'sha filial guruhlariga tegadi: boshqa filialda davomat, jadval, dars eslatmalari, oylik hisob, «Oy oxiriga kutilyapti» va «Markaz faoliyat statistikasi» odatdagidek.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/holidays src/reports src/billing/month-plan-attendance-parity.spec.ts`
Expected: PASS. Task 2b's `holidays.service.spec.ts` tests run against the refactored `buildHolidayDateSet` unchanged. The month-plan parity spec drives the real free function.

Run: `cd client && npx vitest run src/qollanma`
Expected: PASS.

- [ ] **Step 5: Manifest**: no route moves in this task.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi/server
npx prettier --write src/holidays/holiday-date-set.ts src/holidays/holiday-date-set.spec.ts src/holidays/holidays.service.ts src/reports/expectation-math.ts src/reports/expectation-math.spec.ts src/reports/expectation-cache.ts src/reports/reports-expectation.service.ts src/reports/reports-expectation.service.spec.ts src/reports/reports-center-activity.service.ts src/reports/reports-center-activity.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts
npx eslint src/holidays src/reports/expectation-math.ts src/reports/expectation-math.spec.ts src/reports/expectation-cache.ts src/reports/reports-expectation.service.ts src/reports/reports-expectation.service.spec.ts src/reports/reports-center-activity.service.ts src/reports/reports-center-activity.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts
npm run typecheck
npm test
```
Expected: no ESLint errors, typecheck clean, full suite green. Do NOT run Prettier on `scripts/backtest-monthly-expectation.ts`. It is not Prettier-clean today, and ESLint ignores `scripts/`, so Prettier would rewrap unrelated lines.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/holidays/holiday-date-set.ts server/src/holidays/holiday-date-set.spec.ts server/src/holidays/holidays.service.ts server/src/reports/expectation-math.ts server/src/reports/expectation-math.spec.ts server/src/reports/expectation-cache.ts server/src/reports/reports-expectation.service.ts server/src/reports/reports-expectation.service.spec.ts server/src/reports/reports-center-activity.service.ts server/src/reports/reports-center-activity.service.spec.ts server/src/reports/reports-branch-scope-coverage.spec.ts server/scripts/backtest-monthly-expectation.ts server/CLAUDE.md client/src/qollanma/kontent/guruhlar/bayramlar.mdx
git commit -m "$(cat <<'EOF'
fix(reports): month-end expectation and activity report honour branch holidays

Each group is judged against the company-wide holidays plus its own
branch's, read once for every branch (buildHolidayDateSetsByBranch). A
branch's holiday no longer drops other branches' projected lessons from
the month-end expectation (and so the 23:40 snapshot), nor their lesson
hours and working days from /reports/activity. Expectation cache is v3.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 3: Reads that show every branch, and CEO-only branch creation

**Files:**
- Modify: `server/src/company/company.service.ts` (`findOne` drops `include: { branches, courses }`)
- Modify: `server/src/rooms/rooms.controller.ts` (`countByBranch` takes `@BranchCeiling()`)
- Modify: `server/src/rooms/rooms.service.ts` (`countByBranch(query, companyId, ceiling)` filters `id: { in: ceiling }`)
- Modify: `server/src/telegram-groups/telegram-groups.controller.ts` (`list` takes `@BranchCeiling()`)
- Modify: `server/src/telegram-groups/telegram-groups.service.ts` (`listForCompany(companyId, ceiling)` keeps own branches + branch-less rows)
- Modify: `server/src/branches/branches.service.ts` (`create` refuses a non-CEO with 403 before its transaction)
- Modify: `server/src/common/auth/branch-route-policy.ts` (rewrite two Task 1 blocks, add two BY_SERVICE blocks, three routes leave `UNREVIEWED_ROUTES`, ceiling 22 → 19)
- Modify: `client/src/components/settings/branches-settings-client.tsx` («Yangi filial» button only for the CEO)
- Modify: `client/CLAUDE.md` (one line: the new identity-only exception)
- Test: `server/src/company/company.service.spec.ts`
- Test: `server/src/rooms/rooms.service.spec.ts`
- Test: `server/src/telegram-groups/telegram-groups.service.spec.ts`
- Test: `server/src/branches/branches.service.spec.ts`

**Interfaces:**
- Consumes:
  - `resolveCallerBranchScope(prisma: PrismaService | Prisma.TransactionClient, userId: number | undefined): Promise<{ kind: 'all' } | { kind: 'branches'; branchIds: number[] }>` — `server/src/common/auth/branch-scope.ts:27`. Throws `ForbiddenException('Foydalanuvchi aniqlanmadi')` when `userId == null`, `'Foydalanuvchi topilmadi'` when the account is missing; `kind: 'all'` exactly when the caller holds the CEO role.
  - `BranchCeiling` — param decorator (`server/src/common/auth/branch-scope.guard.ts:161`, re-exported by `server/src/common/decorators/index.ts`) returning `ReportBranchIds` (`number[] | null`, `server/src/common/finance/report-branch-scope.ts:32`): the caller's whole ceiling, `null` for the CEO, `[]` for a caller with no branch.
- Produces: nothing a later task relies on. (`RoomsService.countByBranch` and `TelegramGroupsService.listForCompany` gain a required `ceiling: ReportBranchIds` parameter; each has exactly one caller, its controller.)

Client readers checked before dropping the company `include`: `GET /company/:id` is called only by `client/src/components/settings/general-settings-client.tsx:43` (reads `name`, `phone`; `CompanyData` has no relations) and `client/src/components/settings/daf-norma-settings-client.tsx:107` (reads the four `daf*` fields). `student-app/` never calls it. On the server, `CompanyService.update` reuses `findOne` only for `dafSariqKun` / `dafHaftalikKun`, which are columns of the company row.

- [ ] **Step 1: Write the failing tests**

**1a.** `server/src/company/company.service.spec.ts` — append at the end of the file (after the last `});`):

```ts

describe('CompanyService.findOne — the company row alone', () => {
  it('does not include every branch and every course', async () => {
    const prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 1001 }) },
    };
    const service = new CompanyService(prisma as never);

    await service.findOne(1001);

    expect(prisma.company.findUnique).toHaveBeenCalledWith({
      where: { id: 1001 },
    });
  });
});
```

**1b.** `server/src/rooms/rooms.service.spec.ts` — the existing `countByBranch` test gains the CEO ceiling, and three tests follow it.

Old:
```ts
      const rows = await service.countByBranch({} as any, 1001);
```
New:
```ts
      const rows = await service.countByBranch({} as any, 1001, null);
```

Old:
```ts
          roomCount: 3,
        },
      ]);
    });
  });

  describe('delete', () => {
```
New:
```ts
          roomCount: 3,
        },
      ]);
    });

    it("lists only the branches in a confined caller's ceiling", async () => {
      await service.countByBranch({} as any, 1001, [1]);

      expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        companyId: 1001,
        id: { in: [1] },
      });
    });

    it('lists no branch for a caller with no branch attached', async () => {
      await service.countByBranch({} as any, 1001, []);

      expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        companyId: 1001,
        id: { in: [] },
      });
    });

    it('lists every branch of the company for the CEO (no ceiling)', async () => {
      await service.countByBranch({} as any, 1001, null);

      expect(prisma.branch.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        companyId: 1001,
      });
    });
  });

  describe('delete', () => {
```

**1c.** `server/src/telegram-groups/telegram-groups.service.spec.ts` — insert before `  describe('onBotAddedToGroup', () => {`:

```ts
  describe('listForCompany', () => {
    beforeEach(() => {
      mockPrisma.telegramGroup.findMany.mockResolvedValue([]);
    });

    it("shows a confined caller their own branches' groups and the branch-less ones", async () => {
      await service.listForCompany(1001, [1]);

      expect(mockPrisma.telegramGroup.findMany.mock.calls[0][0].where).toEqual(
        {
          companyId: 1001,
          status: TelegramGroupStatus.APPROVED,
          deletedAt: null,
          OR: [{ branchId: { in: [1] } }, { branchId: null }],
        },
      );
    });

    it('shows the CEO every approved group of the company', async () => {
      await service.listForCompany(1001, null);

      expect(mockPrisma.telegramGroup.findMany.mock.calls[0][0].where).toEqual(
        {
          companyId: 1001,
          status: TelegramGroupStatus.APPROVED,
          deletedAt: null,
        },
      );
    });
  });

```

**1d.** `server/src/branches/branches.service.spec.ts`

Old (line 2):
```ts
import { NotFoundException } from '@nestjs/common';
```
New:
```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
```

Inside `describe('BranchesService — branch onboarding', …)`, insert before `  describe('readiness', () => {` (the `beforeEach` there makes the caller a CEO and recreates `prisma`; `jest.clearAllMocks()` resets `tx`):

```ts
  it('refuses a Branch Director with 403 and writes nothing — only the CEO opens a branch', async () => {
    prisma.user.findFirst.mockResolvedValue({
      mainBranch: 1,
      branches: [{ branchId: 1 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    const attempt = service.create(dto, 1001, 42);
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow('Yangi filialni faqat CEO ocha oladi');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.branch.create).not.toHaveBeenCalled();
    expect(tx.cashAccount.createMany).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot be identified (fail closed)', async () => {
    await expect(service.create(dto, 1001, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('lets the CEO open a branch', async () => {
    await expect(service.create(dto, 1001, 42)).resolves.toMatchObject({
      id: 5,
      name: 'Namangan',
    });
  });

```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/company/company.service.spec.ts src/rooms/rooms.service.spec.ts src/telegram-groups/telegram-groups.service.spec.ts src/branches/branches.service.spec.ts`
Expected: FAIL (ts-jest runs transpile-only here, so the extra arguments compile; the failures are assertions):
- `does not include every branch and every course` — `findUnique` was called with an extra `include: { branches: true, courses: true }`.
- `lists only the branches in a confined caller's ceiling` and `lists no branch for a caller with no branch attached` — the `where` has no `id` key.
- `shows a confined caller their own branches' groups and the branch-less ones` — the `where` has no `OR`.
- `refuses a Branch Director …` and `refuses a caller who cannot be identified` — "Received promise resolved instead of rejected" (`create` checks nobody).
- The CEO cases (`lists every branch … for the CEO`, `shows the CEO every approved group`, `lets the CEO open a branch`) already PASS; they guard the allowed path.

- [ ] **Step 3: Implement**

**3a.** `server/src/company/company.service.ts`

Old:
```ts
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { branches: true, courses: true },
    });
```
New:
```ts
    // The company row only. This used to include every branch (address, phone,
    // representative) and every course (price, payment model) — handed to any
    // signed-in account (`@AnyUser`, students included), past the ceiling on
    // `GET /branches` and the scope on `GET /courses`. Both settings pages that
    // read this route use company fields alone.
    const company = await this.prisma.company.findUnique({
      where: { id },
    });
```

**3b.** `server/src/rooms/rooms.controller.ts`

Old:
```ts
import { CurrentUser, BranchScope } from '../common/decorators';
```
New:
```ts
import { CurrentUser, BranchScope, BranchCeiling } from '../common/decorators';
```

Old:
```ts
  @Get('count-by-branch')
  @AnyUser()
  countByBranch(
    @Query() query: CountByBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.roomsService.countByBranch(query, companyId);
  }
```
New:
```ts
  @Get('count-by-branch')
  @AnyUser()
  countByBranch(
    @Query() query: CountByBranchQueryDto,
    @CurrentUser('companyId') companyId: number,
    // The CEILING, not the switcher's pick: the rooms page shows one tab per
    // branch the caller may manage and picks among them itself.
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.roomsService.countByBranch(query, companyId, ceiling);
  }
```

**3c.** `server/src/rooms/rooms.service.ts` (`ReportBranchIds` is already imported there)

Old:
```ts
  async countByBranch(query: CountByBranchQueryDto, companyId: number) {
    // Caller company is authoritative; ignore ?company_id= query param.
    const branchWhere: any = { deletedAt: null, companyId };
```
New:
```ts
  async countByBranch(
    query: CountByBranchQueryDto,
    companyId: number,
    ceiling: ReportBranchIds,
  ) {
    // Caller company is authoritative; ignore ?company_id= query param.
    //
    // And the caller's ceiling: this route is open to every signed-in account
    // and names each branch (address, status, room count), so unfiltered it
    // listed the very branches `GET /branches` hides. Same shape as
    // `BranchesService.findAll` — the branch IS the row.
    const branchWhere: any = {
      deletedAt: null,
      companyId,
      ...(ceiling == null ? {} : { id: { in: ceiling } }),
    };
```

**3d.** `server/src/telegram-groups/telegram-groups.controller.ts`

Old:
```ts
import { CurrentUser } from '../common/decorators';
```
New:
```ts
import { BranchCeiling, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
```

Old:
```ts
  @Get()
  @Can('settings.telegram-groups')
  async list(@CurrentUser() user: { companyId: number }) {
    const groups = await this.groupsService.listForCompany(user.companyId);
```
New:
```ts
  @Get()
  @Can('settings.telegram-groups')
  async list(
    @CurrentUser() user: { companyId: number },
    // The CEILING, not the switcher's pick: the settings table lists every
    // group the caller may administer, whichever branch is selected.
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    const groups = await this.groupsService.listForCompany(
      user.companyId,
      ceiling,
    );
```

**3e.** `server/src/telegram-groups/telegram-groups.service.ts`

Old:
```ts
import { assertCallerInBranch } from '../common/auth/branch-scope';
```
New:
```ts
import { assertCallerInBranch } from '../common/auth/branch-scope';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
```

Old:
```ts
  async listForCompany(companyId: number) {
    return this.prisma.telegramGroup.findMany({
      where: {
        companyId,
        status: TelegramGroupStatus.APPROVED,
        deletedAt: null,
      },
```
New:
```ts
  async listForCompany(companyId: number, ceiling: ReportBranchIds) {
    return this.prisma.telegramGroup.findMany({
      where: {
        companyId,
        status: TelegramGroupStatus.APPROVED,
        deletedAt: null,
        // A confined caller sees their own branches' groups plus the
        // branch-less ones: unassigned groups (which `updateScope` lets them
        // point at their own branch) and org-wide ones. The CEO sees all.
        ...(ceiling == null
          ? {}
          : { OR: [{ branchId: { in: ceiling } }, { branchId: null }] }),
      },
```

**3f.** `server/src/branches/branches.service.ts`

Old:
```ts
import { ReportBranchIds } from '../common/finance/report-branch-scope';
```
New:
```ts
import { ReportBranchIds } from '../common/finance/report-branch-scope';
import { resolveCallerBranchScope } from '../common/auth/branch-scope';
```

Old:
```ts
  async create(dto: CreateBranchDto, companyId: number, userId?: number) {
    const branch = await this.prisma.$transaction(async (tx) => {
```
New:
```ts
  async create(dto: CreateBranchDto, companyId: number, userId?: number) {
    // Only the CEO opens a branch (CEO decision, 10.10.2026). The route stays
    // `@Can('settings.branches')` because that capability also lets a Branch
    // Director edit their OWN branch, so the refusal lives here, before any
    // write. A caller who cannot be identified is refused too (fail closed).
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    if (scope.kind !== 'all') {
      throw new ForbiddenException('Yangi filialni faqat CEO ocha oladi');
    }

    const branch = await this.prisma.$transaction(async (tx) => {
```
(`ForbiddenException` is already imported in this file.)

**3g.** `client/src/components/settings/branches-settings-client.tsx`

Old:
```tsx
import { useEditBranch } from "@/hooks/use-edit-branch";
```
New:
```tsx
import { useEditBranch } from "@/hooks/use-edit-branch";
import { useAuth } from "@/hooks/use-auth";
```

Old:
```tsx
  const openAddDrawer = useEditBranch((s) => s.openAddDrawer);
```
New:
```tsx
  const openAddDrawer = useEditBranch((s) => s.openAddDrawer);
  // Only the CEO opens a branch (CEO decision, 10.10.2026; the server refuses
  // everyone else). Identity, not a capability: `settings.branches` also lets
  // a Branch Director edit their own branch on this page.
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
```

Old:
```tsx
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" onClick={openAddDrawer}>
                <Plus className="mr-1.5 h-4 w-4" />
                Yangi filial
              </Button>
            </TooltipTrigger>
            <TooltipContent>Yangi filial qo&apos;shish</TooltipContent>
          </Tooltip>
        }
```
New:
```tsx
        action={
          isCeo ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={openAddDrawer}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Yangi filial
                </Button>
              </TooltipTrigger>
              <TooltipContent>Yangi filial qo&apos;shish</TooltipContent>
            </Tooltip>
          ) : undefined
        }
```

**3h.** `client/CLAUDE.md` (section «Capabilities, not role ids (ADR-0079)»)

Old:
```md
- **Role ids stay only for identity:** student vs staff (middleware, login), the CEO's all-branches switcher, teacher-only views (own groups, schedule home), the task ladder (ADR-0074) and the form fields that edit an employee's roles.
```
New:
```md
- **Role ids stay only for identity:** student vs staff (middleware, login), the CEO's all-branches switcher, the «Yangi filial» button (only the CEO opens a branch, CEO decision 10.10.2026; `BranchesService.create` refuses everyone else), teacher-only views (own groups, schedule home), the task ladder (ADR-0074) and the form fields that edit an employee's roles.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/company src/rooms src/telegram-groups/telegram-groups src/branches/branches.service.spec.ts src/common/permissions`
Expected: PASS. `src/common/permissions` (route-access snapshot, permission routes) proves no access marker moved.

- [ ] **Step 5: Manifest** — `server/src/common/auth/branch-route-policy.ts`

The two blocks rewritten here were added by Task 1 and may have been re-quoted by Prettier, so find each by its `routes` array and replace the WHOLE object (from its `{` to its `},`).

**5a.** Replace the `COMPANY_WIDE` block whose `routes` is `['GET /company', 'PATCH /company/:id']` with:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'The company row itself: name, phone, logo, lead-form text, the DaF ' +
      "activity norms. `GET /company` reads only the caller's own company " +
      "(`where: { id: companyId }`); `GET /company/:id` and `PATCH /company/:id` " +
      "refuse another company's id with 403. None of them returns a relation: " +
      '`findOne` used to include every branch and every course (addresses, ' +
      'prices), which handed them to any signed-in account past the ceiling ' +
      'on `GET /branches`. The write needs `settings.company`, which no role ' +
      'but the CEO holds by default.',
    routes: ['GET /company', 'GET /company/:id', 'PATCH /company/:id'],
  },
```

**5b.** Replace the `COMPANY_WIDE` block whose `routes` is `['POST /branches']` with:

```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Opening a branch. There is no existing branch to check against: the row ' +
      "is new, and its transaction writes only that branch's own two cash " +
      'accounts and its NEW lead column. It is company structure, not branch ' +
      "data, and by the CEO's decision of 10.10.2026 only the CEO opens one: " +
      '`BranchesService.create` refuses every other caller with 403 before its ' +
      'transaction, although `settings.branches` (Branch Director by default) ' +
      'still admits them to the route — a director keeps editing their own ' +
      'branch through the id-addressed `/branches/:id` routes.',
    routes: ['POST /branches'],
  },
```

**5c.** Insert directly after the `BRANCH_SCOPED_BY_SERVICE` block whose `routes` is `['GET /branches']`:

```ts
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      "The rooms page's branch tabs: each branch with its name, address, " +
      'status and room count. The route is open to every signed-in account ' +
      '(`@AnyUser`), so it takes `@BranchCeiling()` and filters ' +
      '`id: { in: ceiling }`, the shape of `GET /branches`: a confined caller ' +
      'lists only their own branches, a caller with no branch lists none, the ' +
      'CEO (`null`) lists all. The ceiling rather than the selection, because ' +
      'the page picks among these tabs itself and then reads ' +
      '`GET /rooms?branch_id=`, which is header-scoped.',
    routes: ['GET /rooms/count-by-branch'],
  },
  {
    policy: 'BRANCH_SCOPED_BY_SERVICE',
    reason:
      'The approved groups on the «Telegram guruhlar» settings page. It takes ' +
      '`@BranchCeiling()` (every group the caller may administer, whichever ' +
      'branch the switcher shows) and keeps `branchId in ceiling` OR ' +
      "`branchId null`: a confined caller sees their own branches' groups plus " +
      'the branch-less ones, i.e. an unassigned group they may point at their ' +
      'own branch through `PATCH /telegram-groups/:id`, and an org-wide one. ' +
      'The CEO (`null`) sees every approved group of the company.',
    routes: ['GET /telegram-groups'],
  },
```

**5d.** In `UNREVIEWED_ROUTES`, delete these three lines:
```ts
  'GET /company/:id',
  'GET /rooms/count-by-branch',
  'GET /telegram-groups',
```
The list must then hold exactly these 19 entries (Task 2 having removed the four holiday writes): `DELETE /archive/:entityType/:id`, `DELETE /telegram-groups/:id`, `GET /archive/:entityType`, `GET /archive/:entityType/:id`, `GET /archive/counts`, `GET /gateways/events`, `GET /groups/available-rooms`, `GET /groups/available-slots`, `GET /groups/available-teachers`, `GET /groups/next-name`, `GET /groups/schedule-conflicts`, `GET /leads/:id/hover-summary`, `GET /leads/by-student/:studentId`, `GET /lesson-reschedules/available-rooms`, `GET /reports/financial-excel`, `GET /reports/lead-analytics`, `PATCH /leads/reorder`, `POST /archive/:entityType/:id/restore`, `POST /leads`.

**5e.** Old: `export const UNREVIEWED_BUDGET = 22;` New: `export const UNREVIEWED_BUDGET = 19;`

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS — every route classified exactly once, budget 19.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd server
npx prettier --write src/company/company.service.ts src/company/company.service.spec.ts src/rooms/rooms.controller.ts src/rooms/rooms.service.ts src/rooms/rooms.service.spec.ts src/telegram-groups/telegram-groups.controller.ts src/telegram-groups/telegram-groups.service.ts src/telegram-groups/telegram-groups.service.spec.ts src/branches/branches.service.ts src/branches/branches.service.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/company/company.service.ts src/company/company.service.spec.ts src/rooms/rooms.controller.ts src/rooms/rooms.service.ts src/rooms/rooms.service.spec.ts src/telegram-groups/telegram-groups.controller.ts src/telegram-groups/telegram-groups.service.ts src/telegram-groups/telegram-groups.service.spec.ts src/branches/branches.service.ts src/branches/branches.service.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
cd ../client
npx tsc --noEmit
npx eslint src/components/settings/branches-settings-client.tsx
```
Expected: all clean. `npm run typecheck` includes specs (`tsconfig.check.json`), so a spec still calling `countByBranch` / `listForCompany` with the old arity fails here.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/company/company.service.ts server/src/company/company.service.spec.ts server/src/rooms/rooms.controller.ts server/src/rooms/rooms.service.ts server/src/rooms/rooms.service.spec.ts server/src/telegram-groups/telegram-groups.controller.ts server/src/telegram-groups/telegram-groups.service.ts server/src/telegram-groups/telegram-groups.service.spec.ts server/src/branches/branches.service.ts server/src/branches/branches.service.spec.ts server/src/common/auth/branch-route-policy.ts client/src/components/settings/branches-settings-client.tsx client/CLAUDE.md
git commit -m "fix(branches): confine company, room-count and Telegram-group reads; only the CEO opens a branch

GET /company/:id no longer includes every branch and course. GET /rooms/count-by-branch
and GET /telegram-groups filter by the caller's ceiling (the Telegram list keeps
branch-less groups). POST /branches refuses a non-CEO with 403 (CEO decision
10.10.2026) and the settings page shows the button to the CEO only.
UNREVIEWED backlog 22 -> 19.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Group schedule helpers and the reschedule room list stay in the caller's branch

**Files:**
- Modify: `server/src/groups/groups.controller.ts` (five helpers read the branch from `@BranchScope()`, never the raw `?branchId=`)
- Modify: `server/src/lesson-reschedules/lesson-reschedules.controller.ts` (`availableRooms` passes the caller)
- Modify: `server/src/lesson-reschedules/lesson-reschedules.service.ts` (`findAvailableRooms` calls `assertCallerMayTouchGroup`)
- Modify: `server/src/common/auth/branch-route-policy.ts` (six routes leave `UNREVIEWED_ROUTES`, one joins the lessons BY_ENTITY block, ceiling 19 → 13)
- Create: `server/src/groups/groups.schedule-helpers.e2e.spec.ts`
- Test: `server/src/lesson-reschedules/lesson-reschedules.service.spec.ts`
- Test: `server/src/lesson-reschedules/lesson-reschedules.e2e.spec.ts`

**Interfaces:**
- Consumes:
  - `BranchScope` — param decorator (`server/src/common/auth/branch-scope.guard.ts:140`, re-exported by `server/src/common/decorators/index.ts`, already imported in `groups.controller.ts`) returning the resolved `ReportBranchIds`: ceiling ∩ the requested branch, read by `BranchScopeGuard` from `?branch_id=`, then `?branchId=`, then `X-Branch-Id` (`branch-scope.guard.ts:82-85`).
  - `requireSingleBranchForWrite(ids: ReportBranchIds | undefined, what: string): number` — `server/src/common/finance/report-branch-scope.ts:224`. `null` → `BadRequestException(\`${what} uchun avval filialni tanlang\`)`; `[]` → `ForbiddenException("Bu amal uchun filial huquqingiz yo'q")`; several → `BadRequestException(\`${what} uchun bitta filialni tanlang\`)`; one → that id.
  - `assertCallerMayTouchGroup(prisma, userId: number, roles: string[], groupId: string, message?, options?): Promise<void>` — `server/src/common/auth/group-branch-scope.ts:35`. A pure teacher by assignment, everyone else by the group's branch (`assertCallerInBranch`); 404 for a missing group.
  - `BranchScopeGuard` (`server/src/common/auth/branch-scope.guard.ts:101`, injects `PrismaService`) — used for real in the new e2e spec.
- Produces: `LessonReschedulesService.findAvailableRooms(params, companyId: number, caller: { userId: number; roles: string[] })` — the controller is its only production caller.

How the client calls the helpers, checked: `client/src/hooks/use-schedule-availability.ts:52-71` (`available-rooms`, `available-teachers`) and `client/src/components/groups/edit-group-form.tsx:149` (`next-name`) send `?branchId=<selectedBranch.id>` and return early when no branch is selected; `client/src/lib/api.ts` also attaches `X-Branch-Id` (the same switcher selection) to every request. The guard reads the query `branchId` before the header, so `@BranchScope()` resolves to `[selectedBranch.id]` for the CEO and for a caller who holds that branch — the same branch the handler used before. No client change. `schedule-conflicts` and `available-slots` have no client caller. The reschedule dialog (`client/src/components/groups/lesson-changes-tab.tsx:795`) sends `groupId` only; unchanged.

- [ ] **Step 1: Write the failing tests**

**1a.** Create `server/src/groups/groups.schedule-helpers.e2e.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';

/**
 * The five schedule helpers used to hand the raw `?branchId=` to the service,
 * so an Administrator of branch 1 read branch 2's rooms, teachers (name,
 * photo, busy group), timetable and next group number by editing it. They now
 * answer for the scope the REAL `BranchScopeGuard` resolves — and the guard
 * reads `branch_id` before `branchId`, which is why a fix that checked the
 * scope but kept the raw value would still leak.
 */
describe('GroupsController schedule helpers — branch scope (e2e)', () => {
  let app: INestApplication;
  // The account `BranchScopeGuard` reads for the signed-in caller.
  let caller: unknown;

  const ADMIN_OF_BRANCH_1 = {
    mainBranch: 1,
    branches: [{ branchId: 1 }],
    roles: [{ role: { name: 'Administrator' } }],
  };
  const CEO = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  const schedule = {
    getScheduleConflicts: jest.fn().mockResolvedValue({}),
    getAvailableRooms: jest.fn().mockResolvedValue([]),
    getAvailableTeachers: jest.fn().mockResolvedValue([]),
    getAvailableSlots: jest.fn().mockResolvedValue({}),
  };
  const groups = {
    getNextName: jest.fn().mockResolvedValue({ nextName: '#001' }),
  };
  const prisma = {
    user: { findFirst: jest.fn(() => Promise.resolve(caller)) },
  };

  const TIMES = { exactDays: 'MON,WED', startTime: '10:00', endTime: '11:30' };
  // Each helper, the rest of its query, and the branch its service received
  // (undefined = the service was never called).
  const HELPERS: [string, Record<string, string>, () => unknown][] = [
    [
      '/groups/available-rooms',
      TIMES,
      () => schedule.getAvailableRooms.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/available-teachers',
      TIMES,
      () => schedule.getAvailableTeachers.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/schedule-conflicts',
      TIMES,
      () => schedule.getScheduleConflicts.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/available-slots',
      { roomId: 'room-1', exactDays: 'MON' },
      () => schedule.getAvailableSlots.mock.calls[0]?.[0]?.branchId,
    ],
    ['/groups/next-name', {}, () => groups.getNextName.mock.calls[0]?.[0]],
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: groups },
        { provide: GroupScheduleService, useValue: schedule },
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: BranchScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same pipe as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Stands in for JwtStrategy.
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: 10011, companyId: 1001, roles: [] };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    caller = ADMIN_OF_BRANCH_1;
  });

  describe.each(HELPERS)('GET %s', (path, rest, branchReceived) => {
    it('serves an Administrator their own branch, as the client asks for it (query + header)', async () => {
      await request(app.getHttpServer())
        .get(path)
        .set('X-Branch-Id', '1')
        .query({ ...rest, branchId: '1' })
        .expect(200);

      expect(branchReceived()).toBe(1);
    });

    it('refuses another branch named in ?branchId= with 403 and never queries it', async () => {
      const res = await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branchId: '2' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Bu amal uchun filial huquqingiz yo'q");
      expect(branchReceived()).toBeUndefined();
    });

    it('answers for the RESOLVED branch, not the raw ?branchId=, when branch_id is sent too', async () => {
      await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branch_id: '1', branchId: '2' })
        .expect(200);

      expect(branchReceived()).toBe(1);
    });

    it('lets the CEO read any branch', async () => {
      caller = CEO;

      await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branchId: '2' })
        .expect(200);

      expect(branchReceived()).toBe(2);
    });

    it('asks a CEO who named no branch to pick one (400) and never queries', async () => {
      caller = CEO;

      const res = await request(app.getHttpServer()).get(path).query(rest);

      expect(res.status).toBe(400);
      expect(branchReceived()).toBeUndefined();
    });
  });
});
```

**1b.** `server/src/lesson-reschedules/lesson-reschedules.service.spec.ts`

Old:
```ts
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
```
New:
```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
```

Old (inside `describe('findAvailableRooms', …)`):
```ts
      startTime: '10:00',
      endTime: '11:30',
    };

    it('rejects bad date format', async () => {
      await expect(
        service.findAvailableRooms({ ...baseQuery, date: 'nope' }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when endTime is not after startTime', async () => {
      await expect(
        service.findAvailableRooms(
          { ...baseQuery, startTime: '11:00', endTime: '10:00' },
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });
```
New:
```ts
      startTime: '10:00',
      endTime: '11:30',
    };
    // The default `user.findFirst` mock is a CEO, who spans every branch.
    const ceo = { userId: 1, roles: ['CEO'] };

    it('rejects bad date format', async () => {
      await expect(
        service.findAvailableRooms({ ...baseQuery, date: 'nope' }, 1, ceo),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when endTime is not after startTime', async () => {
      await expect(
        service.findAvailableRooms(
          { ...baseQuery, startTime: '11:00', endTime: '10:00' },
          1,
          ceo,
        ),
      ).rejects.toThrow(BadRequestException);
    });
```

Then, in the same file, replace every remaining `findAvailableRooms(baseQuery, 1)` with `findAvailableRooms(baseQuery, 1, ceo)` (Edit with `replace_all: true`; 7 occurrences, all inside `describe('findAvailableRooms', …)`).

Old:
```ts
          where: expect.objectContaining({ id: { notIn: ['room-c'] } }),
        }),
      );
    });
  });

  describe('update', () => {
```
New:
```ts
          where: expect.objectContaining({ id: { notIn: ['room-c'] } }),
        }),
      );
    });

    it("refuses a director of another branch with 403 and never reads that branch's rooms", async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([]);
      prisma.room.findMany.mockResolvedValue([{ id: 'room-a', name: 'A' }]);
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(
        service.findAvailableRooms(baseQuery, 1, {
          userId: 42,
          roles: ['Branch Director'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.group.findMany).not.toHaveBeenCalled();
      expect(prisma.room.findMany).not.toHaveBeenCalled();
    });

    it("serves a director the free rooms of their own branch's group", async () => {
      prisma.group.findFirst.mockResolvedValue({ id: 'group-1', branchId: 7 });
      prisma.group.findMany.mockResolvedValue([]);
      prisma.room.findMany.mockResolvedValue([{ id: 'room-a', name: 'A' }]);
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: 7,
        branches: [{ branchId: 7 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(
        service.findAvailableRooms(baseQuery, 1, {
          userId: 42,
          roles: ['Branch Director'],
        }),
      ).resolves.toEqual([{ id: 'room-a', name: 'A' }]);
    });
  });

  describe('update', () => {
```

**1c.** `server/src/lesson-reschedules/lesson-reschedules.e2e.spec.ts` — insert after the `accepts a well-formed query` test.

Old:
```ts
    if (res.status !== 200) console.log('REJECTED', res.status, res.body);
    expect(res.status).toBe(200);
  });
```
New:
```ts
    if (res.status !== 200) console.log('REJECTED', res.status, res.body);
    expect(res.status).toBe(200);
  });

  it("hands the caller's id and roles to the service for the group check", async () => {
    findAvailableRooms.mockClear();

    await request(app.getHttpServer())
      .get('/lesson-reschedules/available-rooms')
      .query({
        groupId: 'group-1',
        date: '2026-05-12',
        startTime: '10:00',
        endTime: '11:30',
      })
      .expect(200);

    expect(findAvailableRooms).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-1' }),
      1,
      { userId: 99, roles: ['CEO'] },
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/groups/groups.schedule-helpers.e2e.spec.ts src/lesson-reschedules`
Expected: FAIL (ts-jest is transpile-only, so the extra arguments compile):
- For each of the five helpers: `refuses another branch named in ?branchId=` gets 200 (the raw `?branchId=2` reaches the service); `answers for the RESOLVED branch …` receives 2, not 1; `asks a CEO who named no branch …` gets 200 (the service is called with `NaN`). The «own branch» and «CEO any branch» cases already PASS.
- `refuses a director of another branch with 403 …` — "Received promise resolved instead of rejected" (no group guard).
- `hands the caller's id and roles …` — `findAvailableRooms` was called with 2 arguments, not 3.

- [ ] **Step 3: Implement**

**3a.** `server/src/groups/groups.controller.ts`

Old:
```ts
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('groups')
```
New:
```ts
import {
  requireSingleBranchForWrite,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';

/**
 * The ONE branch a schedule helper (free rooms, free teachers, free slots,
 * conflicts, next group name) answers for: the scope `BranchScopeGuard`
 * resolved, never the raw `?branchId=`. Passing the raw value let an
 * Administrator of one branch read another's rooms, teachers, timetable and
 * next group number. Checking the scope and then using the raw value would
 * leak too: the guard reads `branch_id` FIRST, so
 * `?branch_id=<own>&branchId=<other>` passes the check and names the other
 * branch. `[]` → 403; no branch named (a CEO on «Barcha filiallar») or several
 * → 400. The client always names one.
 */
function oneBranch(scope: ReportBranchIds): number {
  return requireSingleBranchForWrite(scope, "Bu so'rov");
}

@Controller('groups')
```

Old (the five handlers, from `@Get('schedule-conflicts')` to the end of `getNextName`):
```ts
  @Get('schedule-conflicts')
  @Can('groups.manage', 'lessons.change')
  getScheduleConflicts(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('roomId') roomId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getScheduleConflicts({
      branchId: Number(branchId),
      exactDays: days,
      startTime,
      endTime,
      roomId: roomId || undefined,
      teacherId: teacherId ? Number(teacherId) : undefined,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-rooms')
  @Can('groups.manage', 'lessons.change')
  getAvailableRooms(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableRooms({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-teachers')
  @Can('groups.manage', 'lessons.change')
  getAvailableTeachers(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableTeachers({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-slots')
  @Can('groups.manage', 'lessons.change')
  getAvailableSlots(
    @Query('branchId') branchId: string,
    @Query('roomId') roomId: string,
    @Query('exactDays') exactDays: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableSlots({
      branchId: Number(branchId),
      roomId,
      exactDays: days,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('next-name')
  @Can('groups.manage')
  getNextName(
    @Query('branchId') branchId: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.getNextName(Number(branchId), companyId);
  }
```
New:
```ts
  @Get('schedule-conflicts')
  @Can('groups.manage', 'lessons.change')
  getScheduleConflicts(
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
    @Query('roomId') roomId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getScheduleConflicts({
      branchId: oneBranch(branchScope),
      exactDays: days,
      startTime,
      endTime,
      roomId: roomId || undefined,
      teacherId: teacherId ? Number(teacherId) : undefined,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-rooms')
  @Can('groups.manage', 'lessons.change')
  getAvailableRooms(
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableRooms({
      branchId: oneBranch(branchScope),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-teachers')
  @Can('groups.manage', 'lessons.change')
  getAvailableTeachers(
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableTeachers({
      branchId: oneBranch(branchScope),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-slots')
  @Can('groups.manage', 'lessons.change')
  getAvailableSlots(
    @Query('roomId') roomId: string,
    @Query('exactDays') exactDays: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableSlots({
      branchId: oneBranch(branchScope),
      roomId,
      exactDays: days,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('next-name')
  @Can('groups.manage')
  getNextName(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.groupsService.getNextName(oneBranch(branchScope), companyId);
  }
```
(`GroupScheduleService` and `GroupsService.getNextName` keep their signatures; only the source of `branchId` changes.)

**3b.** `server/src/lesson-reschedules/lesson-reschedules.controller.ts`

Old:
```ts
  @Get('available-rooms')
  @Can('lessons.change')
  availableRooms(
    @Query() query: AvailableRoomsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.findAvailableRooms(query, companyId);
  }
```
New:
```ts
  @Get('available-rooms')
  @Can('lessons.change')
  availableRooms(
    @Query() query: AvailableRoomsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.findAvailableRooms(query, companyId, {
      userId,
      roles,
    });
  }
```

**3c.** `server/src/lesson-reschedules/lesson-reschedules.service.ts` (`assertCallerMayTouchGroup` is already imported)

Old:
```ts
  async findAvailableRooms(
    params: {
      groupId: string;
      date: string;
      startTime: string;
      endTime: string;
    },
    companyId: number,
  ): Promise<{ id: string; name: string }[]> {
```
New:
```ts
  async findAvailableRooms(
    params: {
      groupId: string;
      date: string;
      startTime: string;
      endTime: string;
    },
    companyId: number,
    caller: { userId: number; roles: string[] },
  ): Promise<{ id: string; name: string }[]> {
```

Old:
```ts
    if (!group) throw new NotFoundException('Guruh topilmadi');

    const busy = await this.collectBusyRoomIds(this.prisma, {
```
New:
```ts
    if (!group) throw new NotFoundException('Guruh topilmadi');
    // The list is the free rooms of the GROUP's branch, so the caller must be
    // allowed on that group — the check create, update and remove already
    // make. Without it a director read another branch's rooms by group id.
    await assertCallerMayTouchGroup(
      this.prisma,
      caller.userId,
      caller.roles,
      group.id,
    );

    const busy = await this.collectBusyRoomIds(this.prisma, {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/groups src/lesson-reschedules src/common/permissions`
Expected: PASS. Do not run the manifest spec yet: until Step 5 it fails on purpose (`has no route in UNREVIEWED that is already evidenced as scoped` lists the five group helpers, which now take `@BranchScope()`).

- [ ] **Step 5: Manifest** — `server/src/common/auth/branch-route-policy.ts`

**5a.** In the `BRANCH_SCOPED_BY_ENTITY` lessons block (reason starts `'Lessons — attendance and the four modules …'`):

Old:
```ts
      "lessons and reverses the teacher's SalaryAccrual — real money in a " +
      'branch the caller cannot even view.',
```
New:
```ts
      "lessons and reverses the teacher's SalaryAccrual — real money in a " +
      'branch the caller cannot even view. ' +
      '`GET /lesson-reschedules/available-rooms` runs the same check on its ' +
      "`groupId` before it lists the free rooms of that group's branch.",
```

Old:
```ts
      'DELETE /lesson-reschedules/:id',
      'POST /planned-absences/:groupId/date/:date',
```
New:
```ts
      'DELETE /lesson-reschedules/:id',
      'GET /lesson-reschedules/available-rooms',
      'POST /planned-absences/:groupId/date/:date',
```

**5b.** In `UNREVIEWED_ROUTES`, delete these six lines (the five group helpers are now `BRANCH_SCOPED_BY_HEADER` by evidence and must not be listed anywhere):
```ts
  'GET /groups/available-rooms',
  'GET /groups/available-slots',
  'GET /groups/available-teachers',
  'GET /groups/next-name',
  'GET /groups/schedule-conflicts',
  'GET /lesson-reschedules/available-rooms',
```
The list must then hold exactly these 13: `DELETE /archive/:entityType/:id`, `DELETE /telegram-groups/:id`, `GET /archive/:entityType`, `GET /archive/:entityType/:id`, `GET /archive/counts`, `GET /gateways/events`, `GET /leads/:id/hover-summary`, `GET /leads/by-student/:studentId`, `GET /reports/financial-excel`, `GET /reports/lead-analytics`, `PATCH /leads/reorder`, `POST /archive/:entityType/:id/restore`, `POST /leads`.

**5c.** Old: `export const UNREVIEWED_BUDGET = 19;` New: `export const UNREVIEWED_BUDGET = 13;`

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS — the five helpers are found as header-scoped and listed nowhere, the reschedule room list sits in the lessons block once, budget 13.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd server
npx prettier --write src/groups/groups.controller.ts src/groups/groups.schedule-helpers.e2e.spec.ts src/lesson-reschedules/lesson-reschedules.controller.ts src/lesson-reschedules/lesson-reschedules.service.ts src/lesson-reschedules/lesson-reschedules.service.spec.ts src/lesson-reschedules/lesson-reschedules.e2e.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/groups/groups.controller.ts src/groups/groups.schedule-helpers.e2e.spec.ts src/lesson-reschedules/lesson-reschedules.controller.ts src/lesson-reschedules/lesson-reschedules.service.ts src/lesson-reschedules/lesson-reschedules.service.spec.ts src/lesson-reschedules/lesson-reschedules.e2e.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
```
Expected: clean. `npm run typecheck` catches any `findAvailableRooms` call left with two arguments.

- [ ] **Step 7: Commit**

```bash
cd server
git add src/groups/groups.controller.ts src/groups/groups.schedule-helpers.e2e.spec.ts src/lesson-reschedules/lesson-reschedules.controller.ts src/lesson-reschedules/lesson-reschedules.service.ts src/lesson-reschedules/lesson-reschedules.service.spec.ts src/lesson-reschedules/lesson-reschedules.e2e.spec.ts src/common/auth/branch-route-policy.ts
git commit -m "fix(groups): schedule helpers and reschedule room list stay in the caller's branch

The five group schedule helpers took the raw ?branchId= and served any branch.
They now answer for the @BranchScope() the guard resolved (403 outside the
ceiling, 400 with no single branch), so ?branch_id=<own>&branchId=<other>
cannot slip through either. GET /lesson-reschedules/available-rooms checks the
group with assertCallerMayTouchGroup, like create/update/remove.
UNREVIEWED backlog 19 -> 13.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

---

### Task 5: Lead routes stay in the caller's branch

**Files:**
- Modify: `server/src/leads/leads.service.ts` (new `LeadCreateActor`; `create` checks the caller against the section's branch; `reorder` checks the section's branch; `findByStudentId` runs the student guard and filters by `companyId`; `getHoverSummary` filters by company + branch)
- Modify: `server/src/leads/leads.controller.ts` (hover summary takes `@BranchScope()` + `companyId`; by-student, reorder and create pass the caller)
- Modify: `server/src/custom-forms/custom-forms.service.ts` (public form passes `{ kind: 'public-form' }`)
- Modify: `server/src/common/auth/branch-route-policy.ts` (manifest: one route leaves, three move into a new BY_ENTITY block, ceiling 13 → 9)
- Test: `server/src/leads/leads.service.spec.ts`
- Test: `server/src/custom-forms/custom-forms.service.spec.ts`

**Interfaces:**
- Consumes:
  - `assertCallerInBranch(prisma: PrismaService | Prisma.TransactionClient, userId: number | undefined, branchId: number, message?: string): Promise<void>` (`server/src/common/auth/branch-scope.ts:63`; default message `"Bu boshqa filialga tegishli — sizda ruxsat yo'q"`, reused here)
  - `assertCallerMayTouchStudent(prisma, userId: number | undefined, studentId: number, companyId: number, message?): Promise<number>` (`server/src/common/auth/student-branch-scope.ts:43`; 404 «O'quvchi topilmadi» for an unknown/other-company student, 403 for another branch)
  - `leadBranchWhere(ids: ReportBranchIds | undefined): Prisma.LeadWhereInput` (`server/src/leads/shared/lead-scope.ts:21`; `mine OR branchId null`, `{}` for `null`)
  - `@BranchScope()` from `server/src/common/decorators`; `ReportBranchIds = number[] | null` (`server/src/common/finance/report-branch-scope.ts:32`)
- Produces:
  - `export type LeadCreateActor = { kind: 'user'; id: number } | { kind: 'public-form' }` in `server/src/leads/leads.service.ts`
  - `LeadsService.create(dto, companyId: number, actor: LeadCreateActor)`
  - `LeadsService.reorder(dto: ReorderLeadsDto, companyId: number, userId: number)`
  - `LeadsService.findByStudentId(studentId: number, companyId: number, userId: number)`
  - `LeadsService.getHoverSummary(id: string, companyId: number, scope: ReportBranchIds)`

- [ ] **Step 1: Write the failing tests**

`server/src/leads/leads.service.spec.ts`

1a. Replace the `@nestjs/common` import (line 2):

Old:
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
```
New:
```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
```

1b. Insert the caller fixtures right after the `validDto` constant (after the line `  };` that closes `validDto`, before `beforeEach(async () => {`):

```ts
  // Callers as `resolveCallerBranchScope` reads them (`prisma.user.findFirst`).
  const CEO_ROW = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const adminOf = (branchId: number) => ({
    mainBranch: branchId,
    branches: [{ branchId }],
    roles: [{ role: { name: 'Administrator' } }],
  });
  // The signed-in employee behind `POST /leads`.
  const CALLER = { kind: 'user', id: 1 } as const;
```

1c. In `describe('create', () => {`: add this as the FIRST statement inside the block:

```ts
    // The cases below are about the lead itself; a CEO holds every branch.
    beforeEach(() => prisma.user.findFirst.mockResolvedValue(CEO_ROW));
```

then replace every `, 1001, 1)` in the file with `, 1001, CALLER)` (all seven occurrences are inside `describe('create')`, lines 462, 468, 480, 498, 530, 557, 581 — a replace-all on the exact text `, 1001, 1)` is safe; no other call in the file ends that way).

Then insert these cases at the end of `describe('create')`, just before its closing `  });` (after the case `"qo'shimcha telefon berilmasa null yozadi"`):

```ts
    it("refuses a section on another branch's board and writes nothing", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(
        service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 1, deletedAt: null } }),
      );
      expect(prisma.lead.aggregate).not.toHaveBeenCalled();
      expect(prisma.lead.create).not.toHaveBeenCalled();
      expect(history.recordCreate).not.toHaveBeenCalled();
    });

    it("creates the lead on the caller's own branch board", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-3',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2, companyId: 1001 }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ changedById: 1 }),
      );
    });

    it("lets a CEO create a lead on any branch's board", async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-4',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, CALLER);

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
    });

    it('a public-form submission creates the lead with no caller check and no actor in history', async () => {
      prisma.leadSection.findFirst.mockResolvedValue({
        id: 'sec-2',
        column: { systemKey: 'NEW', branchId: 2 },
      });
      prisma.lead.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.lead.create.mockResolvedValue({
        id: 'lead-5',
        firstName: 'Aziz',
        lastName: 'Karimov',
        phone: '901234567',
        statusEnum: 'NEW',
      });

      await service.create({ ...validDto, sectionId: 'sec-2' }, 1001, {
        kind: 'public-form',
      });

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ changedById: undefined }),
      );
    });
```

1d. Replace the whole `describe('reorder', () => { … });` block (from `  describe('reorder', () => {` to its closing `  });`, just before `  describe('remove', () => {`) with:

```ts
  describe('reorder', () => {
    beforeEach(() => {
      // A section on branch 2's board; the caller holds branch 2.
      prisma.leadSection.findFirst.mockResolvedValue({
        column: { branchId: 2 },
      });
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
    });

    it("throws NotFound when the section is not the company's", async () => {
      prisma.leadSection.findFirst.mockResolvedValue(null);

      await expect(
        service.reorder({ sectionId: 'sec-x', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.leadSection.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sec-x', deletedAt: null, companyId: 1001 },
        }),
      );
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it("refuses a section on another branch's board and reorders nothing", async () => {
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it("lets a CEO reorder any branch's section", async () => {
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);

      await service.reorder(
        { sectionId: 'sec-1', leadIds: ['lead-1'] },
        1001,
        1,
      );

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects a lead that does not belong to the section', async () => {
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['other'] }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a partial id list (full coverage required)', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await expect(
        service.reorder({ sectionId: 'sec-1', leadIds: ['lead-1'] }, 1001, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('renumbers the section leads inside a transaction', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'lead-1' },
        { id: 'lead-2' },
      ]);
      await service.reorder(
        { sectionId: 'sec-1', leadIds: ['lead-2', 'lead-1'] },
        1001,
        1,
      );
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-2' },
          data: { order: 0 },
        }),
      );
    });
  });
```

1e. Replace the whole `describe('findByStudentId', () => { … });` block with:

```ts
  describe('findByStudentId', () => {
    beforeEach(() => {
      // The student exists in company 1001 and studies in branch 2
      // (`assertCallerMayTouchStudent` → `tryResolveStudentBranchId`).
      prisma.student.findFirst.mockResolvedValue({ id: 10733 });
      prisma.studentBranch = {
        findFirst: jest.fn().mockResolvedValue({ branchId: 2 }),
      };
      prisma.enrollment = { findFirst: jest.fn().mockResolvedValue(null) };
      prisma.user.findFirst.mockResolvedValue(adminOf(2));
      prisma.lead.findMany.mockResolvedValue([{ id: 'lead-1' }]);
    });

    it('returns the leads linked to the student inside the company, with no board status filter', async () => {
      const result = await service.findByStudentId(10733, 1001, 1);

      expect(prisma.student.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 10733, companyId: 1001 } }),
      );
      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { convertedStudentId: 10733, companyId: 1001 },
        }),
      );
      // Must NOT copy the board's `statusEnum: { not: CONVERTED }` filter — a
      // converted lead is exactly what the student profile tab wants to show.
      const arg = prisma.lead.findMany.mock.calls.at(-1)?.[0];
      expect(arg.where.statusEnum).toBeUndefined();
      expect(arg.where.deletedAt).toBeUndefined();
      expect(result).toEqual([{ id: 'lead-1' }]);
    });

    it("refuses another branch's student and reads no lead", async () => {
      prisma.user.findFirst.mockResolvedValue(adminOf(1));

      await expect(service.findByStudentId(10733, 1001, 1)).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it('answers 404 for a student outside the company and reads no lead', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.findByStudentId(10733, 1001, 1)).rejects.toThrow(
        NotFoundException,
      );

      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });

    it("lets a CEO read any branch's student", async () => {
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);

      await expect(service.findByStudentId(10733, 1001, 1)).resolves.toEqual([
        { id: 'lead-1' },
      ]);
    });
  });
```

1f. Replace the whole `describe('getHoverSummary', () => { … });` block with:

```ts
  describe('getHoverSummary', () => {
    it('throws NotFound when the lead is missing', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);
      await expect(
        service.getHoverSummary('missing', 1001, [1]),
      ).rejects.toThrow(NotFoundException);
    });

    it("looks the lead up inside the company and the caller's branch, unassigned pool included", async () => {
      // Another branch's lead does not match this filter, so the database
      // answers null — and its latest comment is never read.
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.getHoverSummary('lead-9', 1001, [1]),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'lead-9',
            deletedAt: null,
            companyId: 1001,
            OR: [{ branchId: { in: [1] } }, { branchId: null }],
          },
        }),
      );
      expect(prisma.comment.findFirst).not.toHaveBeenCalled();
    });

    it('gives a CEO every lead of the company and no other company', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-9',
        calledAt: null,
        calledBy: null,
      });

      await service.getHoverSummary('lead-9', 1001, null);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-9', deletedAt: null, companyId: 1001 },
        }),
      );
    });

    it('returns caller name + latest comment with composed names', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        calledAt: new Date('2026-06-16T10:00:00Z'),
        calledBy: { id: 7, firstName: 'Olim', lastName: 'Aliyev' },
      });
      prisma.comment.findFirst.mockResolvedValue({
        content: 'Ertaga qayta qo‘ng‘iroq',
        createdAt: new Date('2026-06-16T11:00:00Z'),
        author: { firstName: 'Dilnoza', lastName: 'Karimova' },
      });

      const result = await service.getHoverSummary('lead-1', 1001, [1]);

      expect(prisma.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Lead', entityId: 'lead-1', isTask: false },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result.calledBy).toEqual({ id: 7, name: 'Olim Aliyev' });
      expect(result.latestComment).toEqual(
        expect.objectContaining({
          authorName: 'Dilnoza Karimova',
          content: 'Ertaga qayta qo‘ng‘iroq',
        }),
      );
    });

    it('returns nulls when the lead was never called and has no comments', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-2',
        calledAt: null,
        calledBy: null,
      });
      prisma.comment.findFirst.mockResolvedValue(null);

      const result = await service.getHoverSummary('lead-2', 1001, [1]);

      expect(result).toEqual({
        calledAt: null,
        calledBy: null,
        latestComment: null,
      });
    });
  });
```

`server/src/custom-forms/custom-forms.service.spec.ts`

1g. In `describe('submit', …)` there are exactly five `expect(leads.create).toHaveBeenCalledWith(…)` assertions whose last two arguments are `1,` then `null,` (lines 395–396, 434–435, 457–458, 474–475, 489–490). In each, replace the `null,` that directly follows `1,` with `{ kind: 'public-form' },`. Example (lines 387–397):

Old:
```ts
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          sectionId: 'sec-1',
          sourceId: 'src-1',
        }),
        1,
        null,
      );
```
New:
```ts
      expect(leads.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Aziz',
          lastName: 'Karimov',
          phone: '901234567',
          sectionId: 'sec-1',
          sourceId: 'src-1',
        }),
        1,
        { kind: 'public-form' },
      );
```
(The `null,` lines at 112, 130, 170, 210, 257, 276, 290 belong to other describes and stay.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/leads/leads.service.spec.ts src/custom-forms/custom-forms.service.spec.ts`

Expected: FAIL —
- `create`: "refuses a section on another branch's board" resolves instead of rejecting (no caller check); the public-form case fails on `changedById: undefined` (the object actor is written as `changedById`).
- `reorder`: the NotFound and Forbidden cases get a `TypeError` (no section lookup; `lead.findMany` returns `undefined`), not the expected exceptions.
- `findByStudentId`: the student lookup is never made and the Forbidden/NotFound cases resolve.
- `getHoverSummary`: the `where` lacks `companyId` and the branch `OR`.
- `custom-forms`: the five assertions see `null`, not `{ kind: 'public-form' }`.

- [ ] **Step 3: Implement**

`server/src/leads/leads.service.ts`

3a. Imports. Old:
```ts
import { PrismaService } from '../prisma/prisma.service';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
```
New:
```ts
import { PrismaService } from '../prisma/prisma.service';
import { assertCallerInBranch } from '../common/auth/branch-scope';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import {
  ReportBranchIds,
  branchIdWhere,
} from '../common/finance/report-branch-scope';
```

3b. The actor type. Old:
```ts
  source: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
```
New:
```ts
  source: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

/**
 * Who creates a lead — stated, never inferred from a missing id (server
 * CLAUDE.md «A write with no signed-in caller must SAY so», ADR-0008).
 *
 * `user` — a signed-in employee on the board: the section's branch must be one
 * they hold (`assertCallerInBranch`).
 * `public-form` — a stranger submitting a public form
 * (`CustomFormsService.submit`). There is no caller to confine; the form's own
 * section, chosen by staff when the form was set up, fixes the branch.
 */
export type LeadCreateActor =
  | { kind: 'user'; id: number }
  | { kind: 'public-form' };

@Injectable()
export class LeadsService {
```

3c. `findByStudentId`. Old:
```ts
  async findByStudentId(studentId: number) {
    return this.prisma.lead.findMany({
      where: { convertedStudentId: studentId },
```
New:
```ts
  async findByStudentId(studentId: number, companyId: number, userId: number) {
    // A tab of the student profile, so it answers to the profile's own guard:
    // 404 for an unknown or other-company student, 403 for another branch's.
    // The query used to name neither company nor branch.
    await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );
    return this.prisma.lead.findMany({
      where: { convertedStudentId: studentId, companyId },
```

3d. `getHoverSummary`. Old:
```ts
  async getHoverSummary(id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
```
New:
```ts
  async getHoverSummary(
    id: string,
    companyId: number,
    scope: ReportBranchIds,
  ) {
    const lead = await this.prisma.lead.findFirst({
      // The shape `findOne` uses: the company, the caller's branch and the
      // unassigned pool. A lead id alone used to return another branch's
      // latest comment and who called them.
      where: { id, deletedAt: null, companyId, ...leadBranchWhere(scope) },
```

3e. `create` signature. Old:
```ts
  // `userId` is nullable because public-form submissions create leads with no
  // authenticated user — the audit row records `changedBy = NULL` (system).
  /**
   * `sourceId` bu yerda ixtiyoriy: HTTP yo'li uni `CreateLeadDto` da majburiy
   * qiladi, ochiq forma esa manbasiz havoladan kelishi mumkin.
   */
  async create(
    dto: Omit<CreateLeadDto, 'sourceId'> & { sourceId?: string | null },
    companyId: number,
    userId: number | null,
  ) {
```
New:
```ts
  /**
   * `sourceId` bu yerda ixtiyoriy: HTTP yo'li uni `CreateLeadDto` da majburiy
   * qiladi, ochiq forma esa manbasiz havoladan kelishi mumkin.
   */
  async create(
    dto: Omit<CreateLeadDto, 'sourceId'> & { sourceId?: string | null },
    companyId: number,
    actor: LeadCreateActor,
  ) {
```

3f. `create` caller check. Old:
```ts
    const branchId = section.column.branchId;
    if (dto.branchId != null && dto.branchId !== branchId) {
      throw new BadRequestException(
        "Tanlangan bo'lim boshqa filialga tegishli — lidning filiali bo'lim bilan mos kelishi shart",
      );
    }

    if (dto.sourceId) {
```
New:
```ts
    const branchId = section.column.branchId;
    if (dto.branchId != null && dto.branchId !== branchId) {
      throw new BadRequestException(
        "Tanlangan bo'lim boshqa filialga tegishli — lidning filiali bo'lim bilan mos kelishi shart",
      );
    }

    // The board only OFFERS the caller's own sections; the API must refuse the
    // rest, before anything is written. A public-form submission has no caller
    // to confine (see `LeadCreateActor`).
    if (actor.kind === 'user') {
      await assertCallerInBranch(this.prisma, actor.id, branchId);
    }

    if (dto.sourceId) {
```

3g. `create` history actor. Old:
```ts
      changedById: userId ?? undefined,
      companyId,
    });

    // A brand-new lead has no comments and has not been called yet.
```
New:
```ts
      changedById: actor.kind === 'user' ? actor.id : undefined,
      companyId,
    });

    // A brand-new lead has no comments and has not been called yet.
```

3h. `reorder`. Old:
```ts
  async reorder(dto: ReorderLeadsDto) {
    const leads = await this.prisma.lead.findMany({
```
New:
```ts
  async reorder(dto: ReorderLeadsDto, companyId: number, userId: number) {
    // The section names the board and its column the branch (NOT NULL). The
    // lookup used to take neither company nor caller, so a section id and its
    // lead ids were enough to rewrite another branch's board.
    const section = await this.prisma.leadSection.findFirst({
      where: { id: dto.sectionId, deletedAt: null, companyId },
      select: { column: { select: { branchId: true } } },
    });
    if (!section) {
      throw new NotFoundException("Bo'lim topilmadi");
    }
    await assertCallerInBranch(this.prisma, userId, section.column.branchId);

    const leads = await this.prisma.lead.findMany({
```

`server/src/leads/leads.controller.ts`

3i. Hover summary. Old:
```ts
  @Get(':id/hover-summary')
  @Can('leads.view')
  getHoverSummary(@Param('id') id: string) {
    return this.leadsService.getHoverSummary(id);
  }
```
New:
```ts
  @Get(':id/hover-summary')
  @Can('leads.view')
  getHoverSummary(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.getHoverSummary(id, companyId, scope);
  }
```

3j. Lead history. Old:
```ts
  findByStudentId(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.leadsService.findByStudentId(studentId);
  }
```
New:
```ts
  findByStudentId(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.findByStudentId(studentId, companyId, userId);
  }
```

3k. Create. Old:
```ts
    // No `@BranchScope()`: the branch comes from the chosen section's column,
    // and `getBoard` already only offered sections this caller can reach.
    return this.leadsService.create(dto, companyId, userId);
```
New:
```ts
    // No `@BranchScope()`: the branch comes from the chosen section's column,
    // and the service checks the caller holds it (`assertCallerInBranch`).
    return this.leadsService.create(dto, companyId, {
      kind: 'user',
      id: userId,
    });
```

3l. Reorder. Old:
```ts
  reorder(@Body() dto: ReorderLeadsDto) {
    return this.leadsService.reorder(dto);
  }
```
New:
```ts
  reorder(
    @Body() dto: ReorderLeadsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.reorder(dto, companyId, userId);
  }
```

`server/src/custom-forms/custom-forms.service.ts`

3m. The only other caller of `LeadsService.create` (verified: `grep -rn "leadsService" server/src server/scripts` finds only the controller and `custom-forms.service.ts:395`; Telegram/mock/student-origin flows write `Lead` rows themselves and never call `create`). Old:
```ts
    const lead = await this.leadsService.create(
      {
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
        sectionId: form.sectionId,
        sourceId,
      },
      form.companyId,
      null,
    );
```
New:
```ts
    // A stranger, not a signed-in caller — stated, so the service skips the
    // caller's branch check on purpose rather than on a missing id. The form's
    // own section fixes the lead's branch.
    const lead = await this.leadsService.create(
      {
        firstName: mapped.firstName,
        lastName: mapped.lastName,
        phone: mapped.phone,
        sectionId: form.sectionId,
        sourceId,
      },
      form.companyId,
      { kind: 'public-form' },
    );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/leads src/custom-forms`
Expected: PASS (including `leads.controller.spec.ts` — the access markers did not change).

- [ ] **Step 5: Manifest**

`server/src/common/auth/branch-route-policy.ts`

5a. `GET /leads/:id/hover-summary` now takes `@BranchScope()`, so the spec detects it as header-scoped and forbids listing it. Remove these four lines from `UNREVIEWED_ROUTES`:
```ts
  'GET /leads/:id/hover-summary',
  'GET /leads/by-student/:studentId',
```
```ts
  'PATCH /leads/reorder',
```
```ts
  'POST /leads',
```

5b. Add a new block to `ROUTE_POLICIES`, directly BEFORE the app-activity block. Old (anchor):
```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Ilova faolligi statistikasi (dizayn 6.1, ADR-0020). Guruh route'lari " +
```
New:
```ts
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      'Lead routes that check the record rather than the header. ' +
      '`POST /leads` and `PATCH /leads/reorder` name a board section in the ' +
      'body: the section is looked up by id and `companyId` (404 when it is ' +
      "not the company's), its column's `branchId` (NOT NULL) is the branch, " +
      'and `assertCallerInBranch` refuses a caller who does not hold it before ' +
      "anything is written. The board's `@BranchScope()` only ever OFFERED the " +
      "caller's own sections; a section id or lead id list sent by hand " +
      "reached another branch's board. The public form reaches the same " +
      '`LeadsService.create` (it is in the PUBLIC block) with the stated actor ' +
      "`{ kind: 'public-form' }`, the one actor that skips the caller check: a " +
      "stranger holds no branch, and the form's own section, set by staff, " +
      "fixes the lead's. `GET /leads/by-student/:studentId` is a tab of the " +
      'student profile and runs its guard, `assertCallerMayTouchStudent`, on ' +
      "the path's student (404 unknown, 403 another branch's) before reading " +
      'the leads with `companyId`.',
    routes: [
      'POST /leads',
      'PATCH /leads/reorder',
      'GET /leads/by-student/:studentId',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "Ilova faolligi statistikasi (dizayn 6.1, ADR-0020). Guruh route'lari " +
```

5c. Lower the ceiling. Old:
```ts
export const UNREVIEWED_BUDGET = 13;
```
New:
```ts
export const UNREVIEWED_BUDGET = 9;
```

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS.

- [ ] **Step 6: Lint, format, type-check**

```bash
cd server
npx prettier --write src/leads/leads.service.ts src/leads/leads.controller.ts src/leads/leads.service.spec.ts src/custom-forms/custom-forms.service.ts src/custom-forms/custom-forms.service.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/leads/leads.service.ts src/leads/leads.controller.ts src/leads/leads.service.spec.ts src/custom-forms/custom-forms.service.ts src/custom-forms/custom-forms.service.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
npm test
```
Expected: no ESLint errors, typecheck clean (it also checks specs — a leftover numeric actor in a spec fails here), full suite green.

- [ ] **Step 7: Commit**

```bash
cd server
git add src/leads/leads.service.ts src/leads/leads.controller.ts src/leads/leads.service.spec.ts src/custom-forms/custom-forms.service.ts src/custom-forms/custom-forms.service.spec.ts src/common/auth/branch-route-policy.ts
git commit -m "$(cat <<'EOF'
fix(leads): confine hover summary, lead history, reorder and create to the caller's branch

- GET /leads/:id/hover-summary takes @BranchScope() and companyId, the
  findOne shape (unassigned pool kept); it is now header-scoped.
- GET /leads/by-student/:studentId runs assertCallerMayTouchStudent and
  filters by companyId.
- PATCH /leads/reorder looks the section up in the company and checks its
  column's branch with assertCallerInBranch.
- POST /leads checks the caller holds the section's branch. create() takes
  an explicit LeadCreateActor; the public form passes 'public-form'
  instead of a null user.
- Manifest: three routes into a BY_ENTITY block, ceiling 13 -> 9.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The lead analytics route and the Excel workbook's «Lidlar» sheet are scoped

**Files:**
- Modify: `server/src/reports/reports-overview.service.ts` (`getLeadAnalytics(companyId, { branchIds, startDate?, endDate? })`, company + `leadAttributionWhere` on all three lead queries)
- Modify: `server/src/reports/reports.service.ts` (facade signature)
- Modify: `server/src/reports/reports-excel.service.ts` (scope into the «Lidlar» leg; a several-branch scope is refused with 400 before any read)
- Modify: `server/src/reports/reports.controller.ts` (delete the `GET /reports/lead-analytics` handler)
- Modify: `server/src/common/permissions/route-access.snapshot.json` (remove the deleted route's row — see Notes)
- Modify: `server/src/common/auth/branch-route-policy.ts` (manifest, ceiling 9 → 7)
- Modify: `client/src/components/payments/export-options-popover.tsx` (a non-CEO with several branches must pick one)
- Test: `server/src/reports/reports-branch-scope-coverage.spec.ts`
- Test: `server/src/reports/reports-excel.service.spec.ts`
- Test: `server/src/reports/reports.service.spec.ts` (signature update)
- Test: `server/src/reports/reports.controller.spec.ts` (drop the deleted handler)

**Interfaces:**
- Consumes:
  - `leadAttributionWhere(ids: ReportBranchIds | undefined): Prisma.LeadWhereInput` (`server/src/leads/shared/lead-scope.ts:46`) — the COUNTING predicate: `{ branchId: { in: ids } }` for a list (unassigned pool `branchId = null` left out, so Σ(branches) + unassigned = company), `{}` for `null` (company-wide, pool included), `{ branchId: { in: [] } }` (nothing) for `[]`. Already used by `reports/lead-funnel/reports-lead-funnel.service.ts` and the 21:00 Telegram report.
  - `narrowToSingleBranch(ids: ReportBranchIds, onEmpty: () => never, onAmbiguous: () => never): number | undefined` (`server/src/common/finance/report-branch-scope.ts:177`) — `null` → `undefined`, `[]` → `onEmpty`, several → `onAmbiguous`, one → that id. `ReportsController.scoped()` uses it with 403 «Bu filial ma'lumotlarini ko'rish huquqingiz yo'q» / 400 «Bir nechta filialga kirish huquqingiz bor — filialni tanlang»; both texts are reused.
  - `ReportScopeQuery` (`server/src/reports/reports.service.ts:58`): `{ branchIds: ReportBranchIds; startDate?: string; endDate?: string }`.
  - The BY_SERVICE money-reports block added by Task 1 (its routes include `'GET /reports/financial-overview'`).
- Produces:
  - `ReportsOverviewService.getLeadAnalytics(companyId: number, query: { branchIds: ReportBranchIds; startDate?: string; endDate?: string })`
  - `ReportsService.getLeadAnalytics(companyId: number, query: ReportScopeQuery)`
  - `GET /reports/lead-analytics` no longer exists.

Verified before writing: `grep -rn "lead-analytics\|leadAnalytics" client/` finds nothing (no client caller); the only server caller of `getLeadAnalytics` besides the handler is `reports-excel.service.ts:213`. The other `generate()` caller, the Telegram report menu (`telegram-group-report-menu.service.ts:528`), passes `reportBranchIdsForGroup(group)`, which is `null` or one branch — never several — so the new 400 cannot reach the bot.

- [ ] **Step 1: Write the failing tests**

`server/src/reports/reports-branch-scope-coverage.spec.ts`

1a. Add the import next to the other service imports (after `import { ReportsMarketingService } from './marketing/reports-marketing.service';`):
```ts
import { ReportsOverviewService } from './reports-overview.service';
```

1b. Append at the end of the file:
```ts
/**
 * The workbook's «Lidlar» sheet. These are COUNTS, so the attribution
 * predicate: a branch's funnel leaves the unassigned pool out
 * (`leads/shared/lead-scope.ts`). The method once named neither the company
 * nor the branch, so a one-branch director's workbook carried every branch's
 * lead funnel.
 */
describe('branch scope coverage — lead analytics', () => {
  let prisma: any;
  let service: ReportsOverviewService;

  beforeEach(() => {
    prisma = {
      lead: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new ReportsOverviewService(prisma as never, {} as never);
  });

  const leadWheres = () =>
    [
      ...prisma.lead.groupBy.mock.calls,
      ...prisma.lead.findMany.mock.calls,
    ].map((c: any[]) => c[0].where);

  it('puts the branch and the company on every lead query', async () => {
    await service.getLeadAnalytics(1, {
      branchIds: [2],
      startDate: '2026-05-01',
      endDate: '2026-05-31',
    });

    const wheres = leadWheres();
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(hasBranchPredicate(where)).toBe(true);
      // Attribution, not visibility: no `branchId: null` OR-branch.
      expect(where.branchId).toEqual({ in: [2] });
      expect(where.companyId).toBe(1);
    }
  });

  it('leaves a company-wide caller unfiltered by branch, still inside the company', async () => {
    await service.getLeadAnalytics(1, { branchIds: null });

    const wheres = leadWheres();
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.branchId).toBeUndefined();
      expect(where.companyId).toBe(1);
    }
  });
});
```

`server/src/reports/reports-excel.service.spec.ts`

1c. Add the import at the top (after `import { Workbook, Worksheet } from 'exceljs';`):
```ts
import { BadRequestException } from '@nestjs/common';
```

1d. Insert right after the case `it('scopes the salary leg to the requested branch', …)` (it ends with the `'home',` argument and `);` then `  });`):
```ts
  it('scopes the «Lidlar» leg to the workbook scope', async () => {
    await service.generate(1, {
      branchIds: [2],
      include: ['marketing'],
    } as any);

    expect(reports.getLeadAnalytics).toHaveBeenCalledWith(1, {
      branchIds: [2],
      startDate: expect.any(String),
      endDate: expect.any(String),
    });
    // The operational legs take the same single branch.
    expect(reports.getRoomUtilization).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ branchId: 2 }),
    );
  });

  it('gives the «Lidlar» leg the whole company for a company-wide export', async () => {
    await service.generate(1, {
      branchIds: null,
      include: ['marketing'],
    } as any);

    expect(reports.getLeadAnalytics).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ branchIds: null }),
    );
  });

  it('refuses a several-branch scope before reading anything, like the other reports', async () => {
    // Payroll and the operational sheets take ONE branch. Handed `undefined`
    // they read the whole company — a third branch's rooms and attendance in
    // a workbook labelled with two.
    await expect(
      service.generate(1, { branchIds: [1, 2] } as any),
    ).rejects.toThrow(BadRequestException);

    expect(reports.getProfitLoss).not.toHaveBeenCalled();
    expect(reports.getSalaryMonthly).not.toHaveBeenCalled();
    expect(reports.getRoomUtilization).not.toHaveBeenCalled();
    expect(reports.getAttendanceAnalytics).not.toHaveBeenCalled();
    expect(reports.getLeadAnalytics).not.toHaveBeenCalled();
  });
```

`server/src/reports/reports.service.spec.ts`

1e. In `describe('getLeadAnalytics', …)`, the three calls `service.getLeadAnalytics({})` (lines 517, 529, 542) become `service.getLeadAnalytics(1, { branchIds: null })`. Nothing else in that block changes (signature update only — these cases keep passing).

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/reports/reports-branch-scope-coverage.spec.ts src/reports/reports-excel.service.spec.ts`
Expected: FAIL —
- coverage: `getLeadAnalytics(1, …)` reads its first argument as the query, so none of the three `where`s has `companyId` or `branchId`.
- excel: `getLeadAnalytics` is called with `({ startDate, endDate })` only (both «Lidlar» cases); `generate` with `[1, 2]` resolves instead of rejecting (`singleBranchId` degrades to `undefined`).

- [ ] **Step 3: Implement**

`server/src/reports/reports-overview.service.ts`

3a. Imports. Old:
```ts
import { loadDepartures } from './shared/departures.loader';
```
New:
```ts
import { loadDepartures } from './shared/departures.loader';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { leadAttributionWhere } from '../leads/shared/lead-scope';
```

3b. `getLeadAnalytics`. Old:
```ts
  async getLeadAnalytics(query: ReportsQueryDto) {
    // Lead.createdAt is a TIMESTAMP — bound it by Tashkent day, not UTC day.
    const dateFilter = tashkentRangeFilter(query.startDate, query.endDate);
    const createdAtFilter = dateFilter ? { createdAt: dateFilter } : {};
```
New:
```ts
  async getLeadAnalytics(
    companyId: number,
    query: { branchIds: ReportBranchIds; startDate?: string; endDate?: string },
  ) {
    // Lead.createdAt is a TIMESTAMP — bound it by Tashkent day, not UTC day.
    const dateFilter = tashkentRangeFilter(query.startDate, query.endDate);
    const createdAtFilter = dateFilter ? { createdAt: dateFilter } : {};

    // These are COUNTS, so the attribution predicate (`lead-scope.ts`): a
    // branch's funnel leaves the unassigned pool out, a company-wide caller
    // (`null`) counts every lead. The method named neither company nor branch,
    // so a one-branch workbook carried the whole company's funnel.
    const inScope = { companyId, ...leadAttributionWhere(query.branchIds) };
```

3c. The three lead queries in the same method. Old:
```ts
      this.prisma.lead.groupBy({
        by: ['statusEnum'],
        where: { deletedAt: null, ...funnelOnly, ...createdAtFilter },
        _count: { id: true },
      }),

      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          ...funnelOnly,
          statusEnum: 'CONVERTED',
          statusChangedAt: { not: null },
        },
```
New:
```ts
      this.prisma.lead.groupBy({
        by: ['statusEnum'],
        where: {
          deletedAt: null,
          ...inScope,
          ...funnelOnly,
          ...createdAtFilter,
        },
        _count: { id: true },
      }),

      this.prisma.lead.findMany({
        where: {
          deletedAt: null,
          ...inScope,
          ...funnelOnly,
          statusEnum: 'CONVERTED',
          statusChangedAt: { not: null },
        },
```
And old:
```ts
    const leadsCreatedByMonth = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        ...funnelOnly,
        createdAt: { gte: sixMonthsAgo },
      },
```
New:
```ts
    const leadsCreatedByMonth = await this.prisma.lead.findMany({
      where: {
        deletedAt: null,
        ...inScope,
        ...funnelOnly,
        createdAt: { gte: sixMonthsAgo },
      },
```
(`ReportsQueryDto` stays imported — `getKpis`, `getRoomUtilization` and `getGroupAnalytics` still take it.)

`server/src/reports/reports.service.ts`

3d. Facade. Old:
```ts
  getLeadAnalytics(query: ReportsQueryDto) {
    return this.overview.getLeadAnalytics(query);
  }
```
New:
```ts
  // The workbook's «Lidlar» leg — its only caller since the unused
  // `GET /reports/lead-analytics` route was deleted.
  getLeadAnalytics(companyId: number, query: ReportScopeQuery) {
    return this.overview.getLeadAnalytics(companyId, query);
  }
```

`server/src/reports/reports-excel.service.ts`

3e. Imports. Old:
```ts
import { Injectable } from '@nestjs/common';
```
New:
```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
```
Old:
```ts
import {
  singleBranchId,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
```
New:
```ts
import {
  narrowToSingleBranch,
  type ReportBranchIds,
} from '../common/finance/report-branch-scope';
```

3f. The single-branch legs. Old:
```ts
    // Payroll and the operational sheets are still typed `branchId?: number`;
    // they re-confine themselves from `performedById`, so a multi-branch scope
    // degrading to `undefined` is safe. An EMPTY scope would NOT be — it would
    // leave them unfiltered while every other leg returned 0 — but the
    // controller refuses that caller before we get here.
    const salaryBranchId = singleBranchId(branchIds);
```
New:
```ts
    // Payroll and the operational sheets (rooms, attendance, teacher
    // performance and changes) take ONE `branchId?: number`, and `undefined`
    // there means the whole company. A list of several used to degrade to that
    // `undefined`: the operational sheets then read every branch, and payroll
    // narrowed to the caller's `mainBranch` while revenue covered all of their
    // branches. So a list of several is refused before anything is read, as
    // `ReportsController.scoped()` refuses it on the operational report
    // routes; an empty list too (the controller refuses it first). `null`
    // (company-wide) stays `undefined`.
    const salaryBranchId = narrowToSingleBranch(
      branchIds,
      () => {
        throw new ForbiddenException(
          "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
        );
      },
      () => {
        throw new BadRequestException(
          'Bir nechta filialga kirish huquqingiz bor — filialni tanlang',
        );
      },
    );
```
(`salaryBranchId` is read only after this line; nothing has been queried yet. `singleBranchId` has no other use in this file.)

3g. The «Lidlar» leg. Old:
```ts
        safe(
          this.reports.getLeadAnalytics({ startDate: opStart, endDate: opEnd }),
        ),
```
New:
```ts
        safe(
          this.reports.getLeadAnalytics(companyId, {
            branchIds,
            startDate: opStart,
            endDate: opEnd,
          }),
        ),
```

`server/src/reports/reports.controller.ts`

3h. Delete the handler (no client caller). Old (remove these lines and the blank line after them):
```ts
  @Get('lead-analytics')
  @Can('reports.leads')
  getLeadAnalytics(@Query() query: ReportsQueryDto) {
    return this.reportsService.getLeadAnalytics(query);
  }

```
New: nothing. (`ReportsQueryDto`, `Query` and `Can` stay — other handlers use them. The `reports.leads` capability stays in use by `reports/lead-funnel/reports-lead-funnel.controller.ts`.)

`server/src/reports/reports.controller.spec.ts`

3i. Remove the mock line (it names a method the controller no longer calls):
```ts
    getLeadAnalytics: jest.fn().mockResolvedValue({}),
```
and remove the whole route group — `handlers` is typed `(keyof ReportsController)[]`, so `'getLeadAnalytics'` no longer type-checks:
```ts
    {
      capability: 'lead reports',
      keys: ['reports.leads'],
      roles: ['Administrator', 'Branch Director', 'CEO'],
      handlers: ['getLeadAnalytics'],
    },
```

`server/src/common/permissions/route-access.snapshot.json`

3j. `permission-routes.spec.ts` asserts «has a snapshot row for every route and no row for a route that is gone», so the deleted route's row must go. This removes a route; it changes no route's access. Edit by hand (never Prettier). Old:
```json
  "GET /reports/kpis": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /reports/lead-analytics": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /reports/lead-funnel": [
```
New:
```json
  "GET /reports/kpis": [
    "Administrator",
    "Branch Director",
    "CEO"
  ],
  "GET /reports/lead-funnel": [
```

`client/src/components/payments/export-options-popover.tsx`

3k. The popover offers «Barcha filiallarim» to every non-CEO; for one holding several branches that is now a 400. Old:
```tsx
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState<string>("all"); // "all" | branchId
```
New:
```tsx
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState<string>("all"); // "all" | branchId
  // A non-CEO holding several branches must pick one: the workbook's payroll
  // and operational sheets are built for ONE branch, and the server refuses a
  // several-branch scope with 400 «filialni tanlang».
  const mustPickBranch = !isCeo && branches.length > 1;
  const selectedBranchId =
    mustPickBranch && branchId === "all" ? String(branches[0].id) : branchId;
```
Old:
```tsx
      if (branchId !== "all") params.branchId = Number(branchId);
```
New:
```tsx
      if (selectedBranchId !== "all") params.branchId = Number(selectedBranchId);
```
Old:
```tsx
          <Select value={branchId} onValueChange={setBranchId}>
```
New:
```tsx
          <Select value={selectedBranchId} onValueChange={setBranchId}>
```
Old:
```tsx
              <SelectItem value="all">
                {isCeo ? "Barcha filiallar" : "Barcha filiallarim"}
              </SelectItem>
```
New:
```tsx
              {!mustPickBranch && (
                <SelectItem value="all">
                  {isCeo ? "Barcha filiallar" : "Barcha filiallarim"}
                </SelectItem>
              )}
```
(No new UI text. No vitest case: the logic is two lines of render state, not a pure helper.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd server && npx jest src/reports src/common/permissions`
Expected: PASS — the new coverage and excel cases, the updated `reports.service.spec.ts` and `reports.controller.spec.ts`, and `permission-routes.spec.ts` (the snapshot no longer names the deleted route).

- [ ] **Step 5: Manifest**

`server/src/common/auth/branch-route-policy.ts`

5a. Remove from `UNREVIEWED_ROUTES` (the first one no longer exists — `names no route that does not exist` would fail; the second moves into a block):
```ts
  'GET /reports/financial-excel',
```
```ts
  'GET /reports/lead-analytics',
```

5b. Extend the BY_SERVICE money-reports block Task 1 added (review file lines 288–310). Old (its last reason line and its routes):
```ts
      'already refused a branch outside the ceiling. The history\'s holiday ' +
      'markers are not branch-filtered: holidays are company-wide.',
    routes: [
      'GET /reports/debt-write-offs-summary',
      'GET /reports/expectation-history',
      'GET /reports/financial-overview',
      'GET /reports/financial-trend',
      'GET /reports/income-month-attribution',
    ],
  },
```
New:
```ts
      'already refused a branch outside the ceiling. The history\'s holiday ' +
      'markers are not branch-filtered: holidays are company-wide. ' +
      '`GET /reports/financial-excel` resolves the same way and hands that one ' +
      'list to every leg of the workbook. Payroll and the operational sheets ' +
      '(rooms, attendance, teacher performance and changes) take ONE branch, ' +
      'so `ReportsExcelService.generate` refuses a list of several with 400 ' +
      '«filialni tanlang» before reading anything, as `scoped()` does on the ' +
      'operational report routes; the «Lidlar» sheet counts leads with ' +
      '`companyId` and `leadAttributionWhere`, so a branch funnel leaves the ' +
      'unassigned pool out.',
    routes: [
      'GET /reports/debt-write-offs-summary',
      'GET /reports/expectation-history',
      'GET /reports/financial-excel',
      'GET /reports/financial-overview',
      'GET /reports/financial-trend',
      'GET /reports/income-month-attribution',
    ],
  },
```
If Task 1's final reason text differs from the review file, keep Task 1's text unchanged and apply the same two additions: append the sentence above (from «`GET /reports/financial-excel` resolves…» to «…unassigned pool out.») to the end of its reason, and add `'GET /reports/financial-excel',` to its `routes`.

5c. Lower the ceiling. Old:
```ts
export const UNREVIEWED_BUDGET = 9;
```
New:
```ts
export const UNREVIEWED_BUDGET = 7;
```

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS (seven routes left: the five archive routes, `GET /gateways/events`, `DELETE /telegram-groups/:id` — the latent, CEO-only-by-default set).

- [ ] **Step 6: Lint, format, type-check**

```bash
cd server
npx prettier --write src/reports/reports-overview.service.ts src/reports/reports.service.ts src/reports/reports-excel.service.ts src/reports/reports.controller.ts src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts src/reports/reports-excel.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/reports/reports-overview.service.ts src/reports/reports.service.ts src/reports/reports-excel.service.ts src/reports/reports.controller.ts src/reports/reports.controller.spec.ts src/reports/reports.service.spec.ts src/reports/reports-excel.service.spec.ts src/reports/reports-branch-scope-coverage.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
npm test
cd ../client
npx tsc --noEmit
npx eslint src/components/payments/export-options-popover.tsx
```
Expected: no ESLint errors, both type-checks clean, full server suite green. Do NOT run Prettier on the client file or on `route-access.snapshot.json`.

- [ ] **Step 7: Commit**

```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/reports/reports-overview.service.ts server/src/reports/reports.service.ts server/src/reports/reports-excel.service.ts server/src/reports/reports.controller.ts server/src/reports/reports.controller.spec.ts server/src/reports/reports.service.spec.ts server/src/reports/reports-excel.service.spec.ts server/src/reports/reports-branch-scope-coverage.spec.ts server/src/common/permissions/route-access.snapshot.json server/src/common/auth/branch-route-policy.ts client/src/components/payments/export-options-popover.tsx
git commit -m "$(cat <<'EOF'
fix(reports): scope the workbook's lead sheet and refuse a several-branch export

- Delete GET /reports/lead-analytics: no client page calls it, and it
  returned the whole company's lead funnel to any branch director.
- getLeadAnalytics takes the report scope: companyId plus
  leadAttributionWhere on all three lead queries.
- ReportsExcelService.generate passes the scope to the «Lidlar» leg and
  refuses a several-branch scope with 400 before reading anything, as
  scoped() does; payroll and the operational sheets take one branch.
- Export popover: a non-CEO with several branches must pick one.
- Snapshot row of the deleted route removed (no access change).
- Manifest: financial-excel joins the money-reports block, ceiling 9 -> 7.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 7: Student money writes and previews check the caller's branch

Six routes sit in the first `BRANCH_SCOPED_BY_ENTITY` block of the manifest ("Id-addressed money paths") but check only the company. A director of branch A can adjust a branch B student, reverse their lesson batch, run their retroactive billing or restore a forgiven debt. A director or administrator can also read a branch B student's refund or withdrawal quote. The adjustment has a second problem: the body's `branchId` wins over the student's branch (`branchForStudent` → `explicit`), so its ledger row can be booked to any branch.

Decisions taken here:
- **Adjustment `branchId`: the DTO field is dropped.** `POST /transactions/adjustment` has no caller in the client (searched `client/src`, `student-app`, `teachers`), so nothing sends it. Under the global `forbidNonWhitelisted`, a body that names a branch now gets a 400 instead of being booked there. `TransactionsWriteService.createAdjustment` keeps its internal `branchId` param: refunds, cascades and monthly charges pass the group's branch on purpose.
- **Writes check inside their own transaction, with the transaction client** (`assertCallerMayWriteForStudentInTx`, or `assertCallerMayWriteForStudent(client, …)` where the file already uses that name). The adjustment checks only when the new `callerId` param is set. The HTTP route sets it. Internal callers authorised their own entry point and leave it out.
- **Previews use `assertCallerMayTouchStudent`** after their own 404, the same order as `loadForWrite` (`refunds-process.service.ts`). It is a read, so a branch-less student gets a 403 and not the money path's raw error.

**Files:**
- Modify: `server/src/transactions/dto/create-adjustment.dto.ts` (drop `branchId`)
- Modify: `server/src/transactions/transactions.controller.ts` (`createAdjustment`: no `branchId`, pass `callerId`)
- Modify: `server/src/transactions/transactions.service.ts` (facade param `callerId?`)
- Modify: `server/src/transactions/transactions-write.service.ts` (`createAdjustment`: check `callerId` in the tx)
- Modify: `server/src/billing/lesson-billing.service.ts` (`runRetroactiveBilling`, `reverseLessonDeduction`)
- Modify: `server/src/billing/debt-write-off.service.ts` (`reverseWriteOff`)
- Modify: `server/src/refunds/refunds.controller.ts`, `server/src/refunds/refunds.service.ts`, `server/src/refunds/refunds-eligibility.service.ts` (`previewRefund` takes `userId`)
- Modify: `server/src/withdrawals/withdrawals.controller.ts`, `server/src/withdrawals/withdrawals.service.ts` (`preview` takes `userId`)
- Modify: `server/src/common/auth/branch-route-policy.ts` (the block's `reason` only)
- Test: `server/src/transactions/transactions.controller.spec.ts`
- Test: `server/src/transactions/transactions-write.service.spec.ts`
- Test: `server/src/billing/lesson-billing.service.spec.ts`
- Test: `server/src/billing/debt-write-off.service.spec.ts`
- Test: `server/src/refunds/refunds-eligibility.service.spec.ts`
- Test: `server/src/withdrawals/withdrawals.service.spec.ts`

**Interfaces:**
- Consumes:
  - `assertCallerMayWriteForStudent(prisma: PrismaService | Prisma.TransactionClient, userId: number | undefined, studentId: number, companyId: number, message?: string): Promise<number>` (`server/src/common/auth/financial-write-scope.ts`)
  - `assertCallerMayWriteForStudentInTx(tx: Prisma.TransactionClient, userId: number | undefined, studentId: number, companyId: number): Promise<number>` (same file)
  - `assertCallerMayTouchStudent(prisma: PrismaService | Prisma.TransactionClient, userId: number | undefined, studentId: number, companyId: number, message?: string): Promise<number>` (`server/src/common/auth/student-branch-scope.ts`; 404 for an unknown student, 403 for a branch-less one, then `assertCallerInBranch`)
- Produces:
  - `TransactionsService.createAdjustment` / `TransactionsWriteService.createAdjustment` params gain `callerId?: number`.
  - `RefundsService.previewRefund(studentId, userId, companyId, enrollmentId?)` and `RefundsEligibilityService.previewRefund(studentId, userId, companyId, enrollmentId?)`.
  - `WithdrawalsService.preview(studentId, userId, companyId)`.
  - `LessonBillingService.runRetroactiveBilling({ studentId, companyId, performedById: number })`: `performedById` is now required.

Every caller of a changed signature, checked with grep (no `head`):
- `previewRefund`: `refunds.controller.ts:35`, `refunds.service.ts:51`, and 31 calls in `refunds-eligibility.service.spec.ts`.
- `WithdrawalsService.preview`: `withdrawals.controller.ts:24`, and 5 calls in `withdrawals.service.spec.ts`.
- `runRetroactiveBilling`: `billing.controller.ts:61` (already passes `performedById`) and `lesson-billing.service.spec.ts:1235`. `payments.service.spec.ts:140` only mocks it. `server/scripts/run-retroactive-one.ts` and `run-retroactive-batch.ts` also call it, but those scripts cannot boot today: their module never provides `MonthlyChargeService` or `LessonAdmissionService`, both of which `LessonBillingService` injects. They are left alone (see Notes).
- `createAdjustment`: the new param is optional, so `cancelled-lesson-release.ts`, `enrollment-billing.service.ts` and `monthly-charge.service.ts` (and their mocks) stay as they are.

- [ ] **Step 1: Write the failing tests**

**1a. `server/src/transactions/transactions.controller.spec.ts`.** After
```ts
import { defaultRolesOf, routeAccess } from '../common/permissions/testing';
```
add
```ts
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
```
Then replace the end of the file:
```ts
      expect(mockTransactionsService.findDebtWriteOffs).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ branchIds: [2] }),
      );
    });
  });
});
```
with
```ts
      expect(mockTransactionsService.findDebtWriteOffs).toHaveBeenCalledWith(
        1001,
        expect.objectContaining({ branchIds: [2] }),
      );
    });
  });

  // The body used to name a branch and win, so an adjustment could be booked
  // to any branch's books. The branch now comes from the student alone, and
  // the caller is named so the writer checks them against it.
  describe('manual adjustment', () => {
    it('names the caller and forwards no branch of its own', async () => {
      await controller.createAdjustment(
        { studentId: 10500, amount: -5_000, description: 'Tuzatish' } as never,
        42,
        1001,
      );

      const arg = mockTransactionsService.createAdjustment.mock.calls.at(-1)[0];
      expect(arg).toMatchObject({
        studentId: 10500,
        amount: -5_000,
        companyId: 1001,
        performedById: 42,
        callerId: 42,
      });
      expect('branchId' in arg).toBe(false);
    });

    it('refuses a body that names a branch', async () => {
      // Same options as the global ValidationPipe in main.ts.
      const dto = plainToInstance(CreateAdjustmentDto, {
        studentId: 10500,
        amount: -5_000,
        description: 'Tuzatish',
        branchId: 2,
      });
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      expect(errors.map((e) => e.property)).toEqual(['branchId']);
    });
  });
});
```

**1b. `server/src/transactions/transactions-write.service.spec.ts`.** Add as line 1:
```ts
import { ForbiddenException } from '@nestjs/common';
```
Then, inside `describe('TransactionsWriteService.createAdjustment', …)`, replace
```ts
    const data = prisma.transaction.create.mock.calls[0][0].data;
    expect('metadata' in data).toBe(false);
  });
});
```
with
```ts
    const data = prisma.transaction.create.mock.calls[0][0].data;
    expect('metadata' in data).toBe(false);
  });

  // `POST /transactions/adjustment` checked the company only: a director could
  // adjust a student of another branch. The route now names its caller.
  describe('a manual adjustment checks the caller against the student branch', () => {
    // The student sits in branch 2 (`studentBranch` mock above).
    const caller = (roleName: string, mainBranch: number | null) => ({
      mainBranch,
      branches: [],
      roles: [{ role: { name: roleName } }],
    });
    const adjust = (callerId?: number) =>
      service.createAdjustment({
        studentId: STUDENT,
        amount: 50_000,
        description: 'test',
        companyId: COMPANY,
        performedById: callerId,
        callerId,
      });

    it("refuses a caller outside the student's branch and writes nothing", async () => {
      prisma.user = {
        findFirst: jest
          .fn()
          .mockResolvedValue(caller('Branch Director', 1)),
      };

      await expect(adjust(42)).rejects.toThrow(ForbiddenException);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.transaction.create).not.toHaveBeenCalled();
      expect(prisma.student.update).not.toHaveBeenCalled();
    });

    it("books a caller of the student's branch to that branch", async () => {
      prisma.user = {
        findFirst: jest
          .fn()
          .mockResolvedValue(caller('Branch Director', 2)),
      };

      await adjust(42);

      expect(prisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: 2 }),
        }),
      );
    });

    it('lets the CEO adjust a student of any branch', async () => {
      prisma.user = {
        findFirst: jest.fn().mockResolvedValue(caller('CEO', null)),
      };

      await adjust(1);

      expect(prisma.transaction.create).toHaveBeenCalled();
    });

    it('leaves internal callers, which name no caller, unchecked', async () => {
      prisma.user = { findFirst: jest.fn() };

      await adjust(undefined);

      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.transaction.create).toHaveBeenCalled();
    });
  });
});
```

**1c. `server/src/billing/lesson-billing.service.spec.ts`.** After line 1 (`import { Test, TestingModule } from '@nestjs/testing';`) add:
```ts
import { ForbiddenException } from '@nestjs/common';
```
Replace the `runRetroactiveBilling` test (inside `describe('processRetroactiveBillingForStudent', …)`):
```ts
    it('opens a Serializable tx in runRetroactiveBilling', async () => {
      // Arrange a no-enrollments fast path so the tx body returns 0.
      tx.enrollment.findMany = jest.fn().mockResolvedValue([]);
      prisma.$transaction = jest.fn().mockImplementation((cb) => cb(prisma));

      const result = await service.runRetroactiveBilling({
        studentId,
        companyId,
      });
```
with
```ts
    it('opens a Serializable tx in runRetroactiveBilling', async () => {
      // Arrange a no-enrollments fast path so the tx body returns 0.
      tx.enrollment.findMany = jest.fn().mockResolvedValue([]);
      // The caller check: the student's branch (1), then the caller (a CEO).
      tx.studentBranch = {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      };
      tx.user = {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      };
      prisma.$transaction = jest.fn().mockImplementation((cb) => cb(prisma));

      const result = await service.runRetroactiveBilling({
        studentId,
        companyId,
        performedById: 99,
      });
```
Directly after that test's closing `});` (just before the `});` that closes `describe('processRetroactiveBillingForStudent', …)`) add:
```ts

    it("refuses a caller outside the student's branch before billing anything", async () => {
      tx.enrollment.findMany = jest.fn().mockResolvedValue([]);
      tx.studentBranch = {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      };
      tx.user = {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: 2,
          branches: [],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      };
      prisma.$transaction = jest.fn().mockImplementation((cb) => cb(prisma));

      await expect(
        service.runRetroactiveBilling({
          studentId,
          companyId,
          performedById: 99,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.enrollment.findMany).not.toHaveBeenCalled();
    });
```
In `describe('reverseLessonDeduction — oylik qatorlar boshqa yo`ldan boradi', …)`:
- In its `beforeEach`, replace
```ts
      tx.salaryAccrual = {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
```
with
```ts
      tx.salaryAccrual = {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      };
      // The caller check: the student's branch (1), then the caller (its
      // director).
      tx.studentBranch = {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      };
      tx.user = {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: 1,
          branches: [],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      };
```
- The three deduction rows must carry their student. In the `mon-1` mock replace `        id: 'mon-1',\n        enrollmentId: 'enroll-1',` with `        id: 'mon-1',\n        studentId: 10001,\n        enrollmentId: 'enroll-1',`. Then use Edit with `replace_all: true` to replace `        id: 'ded-9',\n        enrollmentId: 'enroll-1',` (2 occurrences, lines ~1997 and ~2026) with `        id: 'ded-9',\n        studentId: 10001,\n        enrollmentId: 'enroll-1',`.
- Replace the end of the file:
```ts
      for (const id of ['cons-1', 'cons-2']) {
        expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
          id,
          { performedById: 7, reason: "dars to'lovi bekor qilingani uchun" },
          tx,
        );
      }
    });
  });
});
```
with
```ts
      for (const id of ['cons-1', 'cons-2']) {
        expect(transactionsService.reverseTransaction).toHaveBeenCalledWith(
          id,
          { performedById: 7, reason: "dars to'lovi bekor qilingani uchun" },
          tx,
        );
      }
    });

    it("refuses a caller outside the student's branch and reverses nothing", async () => {
      // The student is in branch 1; this director holds branch 2.
      tx.user.findFirst.mockResolvedValueOnce({
        mainBranch: 2,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      tx.transaction.findFirst.mockResolvedValueOnce({
        id: 'ded-9',
        studentId: 10001,
        enrollmentId: 'enroll-1',
        reversedAt: null,
        metadata: { mode: LessonDeductionMode.FULL_CYCLE },
      });

      await expect(
        service.reverseLessonDeduction('ded-9', {
          performedById: 7,
          companyId: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
      expect(monthlyChargeService.reverseMonthlyCharge).not.toHaveBeenCalled();
      expect(tx.salaryAccrual.findMany).not.toHaveBeenCalled();
    });
  });
});
```

**1d. `server/src/billing/debt-write-off.service.spec.ts`.** Replace line 1
```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
```
with
```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
```
Then in `describe('DebtWriteOffService.reverseWriteOff', …)` replace its last test's tail
```ts
    await expect(service.reverseWriteOff(params)).rejects.toThrow(
      'Bu hisobdan chiqarish allaqachon bekor qilingan',
    );
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });
});
```
with
```ts
    await expect(service.reverseWriteOff(params)).rejects.toThrow(
      'Bu hisobdan chiqarish allaqachon bekor qilingan',
    );
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });

  // Restoring a forgiven debt writes to the student's books, like forgiving
  // it: the caller must hold the student's branch (1 in `buildClient`).
  const director = (mainBranch: number) => ({
    mainBranch,
    branches: [],
    roles: [{ role: { name: 'Branch Director' } }],
  });

  it("refuses a caller outside the student's branch and restores nothing", async () => {
    client.transaction.findFirst.mockResolvedValue(row());
    client.user.findFirst.mockResolvedValueOnce(director(2));

    await expect(service.reverseWriteOff(params)).rejects.toThrow(
      ForbiddenException,
    );
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });

  it("restores the debt for a caller of the student's branch", async () => {
    client.transaction.findFirst.mockResolvedValue(row());
    client.user.findFirst.mockResolvedValueOnce(director(1));

    await service.reverseWriteOff(params);

    expect(transactionsService.reverseTransaction).toHaveBeenCalled();
  });

  it('treats a write-off row with no student as not found', async () => {
    client.transaction.findFirst.mockResolvedValue(row({ studentId: null }));

    await expect(service.reverseWriteOff(params)).rejects.toThrow(
      NotFoundException,
    );
    expect(transactionsService.reverseTransaction).not.toHaveBeenCalled();
  });
});
```

**1e. `server/src/refunds/refunds-eligibility.service.spec.ts`.**
- Replace line 2 `import { BadRequestException, NotFoundException } from '@nestjs/common';` with
```ts
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
```
- After `  const studentRow = { id: 10001, balance: 100_000 };` add `  const CALLER = 7;`.
- In `beforeEach`, replace
```ts
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
```
with
```ts
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      // The preview checks the caller against the student's branch (1). A CEO
      // spans every branch, so the default caller passes.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      holiday: { findMany: jest.fn().mockResolvedValue([]) },
```
- Move every call to the new signature (31 calls, all of the form `service.previewRefund(10001, 1…`). Run from `server/`:
```bash
perl -pi -e 's/service\.previewRefund\(10001, 1\b/service.previewRefund(10001, CALLER, 1/g' src/refunds/refunds-eligibility.service.spec.ts
grep -c "previewRefund(10001, CALLER, 1" src/refunds/refunds-eligibility.service.spec.ts   # expect 31
```
- Directly before `  describe('payments aggregation', () => {` add:
```ts
  // The quote names the student's balance, groups and last payment, and it
  // answered for any student of the company.
  describe("the caller's branch", () => {
    const director = (mainBranch: number) => ({
      mainBranch,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    });

    it("refuses a caller outside the student's branch, reading nothing more", async () => {
      prisma.user.findFirst.mockResolvedValue(director(2));

      await expect(service.previewRefund(10001, CALLER, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.enrollment.findFirst).not.toHaveBeenCalled();
      expect(prisma.payment.aggregate).not.toHaveBeenCalled();
    });

    it("quotes for a caller of the student's branch", async () => {
      prisma.user.findFirst.mockResolvedValue(director(1));

      await expect(
        service.previewRefund(10001, CALLER, 1),
      ).resolves.toEqual(
        expect.objectContaining({ maxRefundable: expect.any(Number) }),
      );
    });
  });

```

**1f. `server/src/withdrawals/withdrawals.service.spec.ts`.** First move the 5 calls to the new signature. Run from `server/`:
```bash
perl -pi -e 's/service\.preview\((\d+), 1\)/service.preview($1, 7, 1)/g' src/withdrawals/withdrawals.service.spec.ts
grep -c "service.preview([0-9]*, 7, 1)" src/withdrawals/withdrawals.service.spec.ts   # expect 5
```
Then, in `describe('preview', …)`, replace
```ts
      const out = await service.preview(10001, 7, 1);
      expect(out.teacherSuggestions).toHaveLength(0);
    });
  });
```
with
```ts
      const out = await service.preview(10001, 7, 1);
      expect(out.teacherSuggestions).toHaveLength(0);
    });

    // The dialog shows the student's name, balance, groups and teachers, and
    // it answered for any student of the company.
    it("refuses a caller outside the student's branch, showing nothing", async () => {
      // The student is in branch 1; this director holds branch 2.
      prisma.user.findFirst.mockResolvedValueOnce({
        mainBranch: 2,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(service.preview(10001, 7, 1)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
      expect(prisma.balanceNotice.findFirst).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run them to verify they fail**
Run: `cd server && npx jest src/transactions/transactions.controller.spec.ts src/transactions/transactions-write.service.spec.ts src/billing/lesson-billing.service.spec.ts src/billing/debt-write-off.service.spec.ts src/refunds/refunds-eligibility.service.spec.ts src/withdrawals/withdrawals.service.spec.ts`
Expected: FAIL.
- `manual adjustment` fails twice: `'branchId' in arg` is `true` and `callerId` is missing, and the DTO accepts `branchId` (`errors` is `[]`).
- `refuses a caller outside the student's branch and writes nothing` resolves, because no check runs yet.
- In `lesson-billing.service.spec.ts`, both refusal tests resolve instead of throwing `ForbiddenException`.
- In `debt-write-off.service.spec.ts`, the refusal resolves, and the no-student row is reversed instead of answering 404.
- Most of `refunds-eligibility.service.spec.ts` fails, because until Step 3 the third argument is read as `enrollmentId`.
- In `withdrawals.service.spec.ts`, the refusal resolves.

The tests that only prove the allowed caller still works may already pass. That is expected.

- [ ] **Step 3: Implement**

**`server/src/transactions/dto/create-adjustment.dto.ts`.** Replace the whole file with:
```ts
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

/**
 * No `branchId`: the ledger row takes the student's branch
 * (`TransactionsWriteService.branchForStudent`). A branch named in the body
 * used to win, so an adjustment could be booked to any branch's books.
 */
export class CreateAdjustmentDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsInt()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;
}
```

**`server/src/transactions/transactions.controller.ts`.** Replace
```ts
    return this.transactionsService.createAdjustment({
      studentId: dto.studentId,
      amount: dto.amount,
      description: dto.description,
      branchId: dto.branchId,
      companyId,
      performedById: userId,
    });
```
with
```ts
    return this.transactionsService.createAdjustment({
      studentId: dto.studentId,
      amount: dto.amount,
      description: dto.description,
      companyId,
      performedById: userId,
      callerId: userId,
    });
```

**`server/src/transactions/transactions.service.ts`.** Replace
```ts
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
      /** Passed through to the writer, e.g. a lesson refund's `kind` tag. */
```
with
```ts
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
      /** The signed-in caller of `POST /transactions/adjustment`; see the writer. */
      callerId?: number;
      /** Passed through to the writer, e.g. a lesson refund's `kind` tag. */
```

**`server/src/transactions/transactions-write.service.ts`.**
1. Replace
```ts
import {
  resolveStudentBranchId,
  tryResolveUserBranchId,
} from '../common/finance/resolve-branch';
```
with
```ts
import {
  resolveStudentBranchId,
  tryResolveUserBranchId,
} from '../common/finance/resolve-branch';
import { assertCallerMayWriteForStudentInTx } from '../common/auth/financial-write-scope';
```
2. In `createAdjustment`'s params, replace
```ts
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
      /**
       * Optional audit trail. A refund that frees prepaid lessons posts an
```
with
```ts
      // Optional: system-triggered adjustments (status cascades) may have no
      // acting user; the ledger column is nullable.
      performedById?: number;
      /**
       * The signed-in caller of `POST /transactions/adjustment`. When set, they
       * must hold the student's branch, checked on this transaction's client.
       * Internal callers (refunds, cascades, monthly charges) authorised their
       * own entry point and leave it out.
       */
      callerId?: number;
      /**
       * Optional audit trail. A refund that frees prepaid lessons posts an
```
3. Replace
```ts
      // Multi-tenant guard: confirm the target student belongs to the
      // caller's company before mutating the balance ledger.
      const studentCheck = await client.student.findFirst({
        where: { id: params.studentId, companyId: params.companyId },
        select: { id: true },
      });
      if (!studentCheck) {
        throw new NotFoundException("O'quvchi topilmadi");
      }
```
with
```ts
      // Multi-tenant guard: confirm the target student belongs to the
      // caller's company before mutating the balance ledger.
      const studentCheck = await client.student.findFirst({
        where: { id: params.studentId, companyId: params.companyId },
        select: { id: true },
      });
      if (!studentCheck) {
        throw new NotFoundException("O'quvchi topilmadi");
      }
      if (params.callerId !== undefined) {
        await assertCallerMayWriteForStudentInTx(
          client,
          params.callerId,
          params.studentId,
          params.companyId,
        );
      }
```

**`server/src/billing/lesson-billing.service.ts`.**
1. Replace
```ts
import { TransactionsService } from '../transactions/transactions.service';
```
with
```ts
import { TransactionsService } from '../transactions/transactions.service';
import { assertCallerMayWriteForStudentInTx } from '../common/auth/financial-write-scope';
```
2. Replace
```ts
  async runRetroactiveBilling(params: {
    studentId: number;
    companyId: number;
    performedById?: number;
  }): Promise<{ billedAttendances: number }> {
    return this.prisma.$transaction(
      (tx) => this.processRetroactiveBillingForStudent(tx, params),
      {
```
with
```ts
  async runRetroactiveBilling(params: {
    studentId: number;
    companyId: number;
    performedById: number;
  }): Promise<{ billedAttendances: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        // A manual catch-up moves the student's money: the caller must hold
        // the student's branch, checked on this transaction's client.
        await assertCallerMayWriteForStudentInTx(
          tx,
          params.performedById,
          params.studentId,
          params.companyId,
        );
        return this.processRetroactiveBillingForStudent(tx, params);
      },
      {
```
3. In `reverseLessonDeduction`, replace
```ts
          select: {
            id: true,
            enrollmentId: true,
            reversedAt: true,
            metadata: true,
          },
        });
        if (!deduction) {
          throw new Error('LESSON_DEDUCTION yozuvi topilmadi');
        }
```
with
```ts
          select: {
            id: true,
            studentId: true,
            enrollmentId: true,
            reversedAt: true,
            metadata: true,
          },
        });
        if (!deduction || deduction.studentId == null) {
          throw new Error('LESSON_DEDUCTION yozuvi topilmadi');
        }
        // The batch is the student's money: the caller must hold the
        // student's branch, checked on this transaction's client.
        await assertCallerMayWriteForStudentInTx(
          tx,
          params.performedById,
          deduction.studentId,
          params.companyId,
        );
```

**`server/src/billing/debt-write-off.service.ts`.** `assertCallerMayWriteForStudent` is already imported. In `reverseWriteOff`, replace
```ts
        if (!original) {
          throw new NotFoundException(
            'Hisobdan chiqarish topilmadi yoki boshqa kompaniyaga tegishli',
          );
        }
```
with
```ts
        if (!original || original.studentId == null) {
          throw new NotFoundException(
            'Hisobdan chiqarish topilmadi yoki boshqa kompaniyaga tegishli',
          );
        }
        // Restoring a forgiven debt writes to that student's books: the caller
        // must hold the student's branch, checked on this transaction's
        // client, as `executeWriteOff` checks when forgiving it.
        await assertCallerMayWriteForStudent(
          client,
          params.performedById,
          original.studentId,
          params.companyId,
        );
```
Also replace the stale docblock line `   * Reverse a previous DEBT_WRITE_OFF. CEO-only at the controller level.` with `   * Reverse a previous DEBT_WRITE_OFF, for a caller of the student's branch.`

**`server/src/refunds/refunds.controller.ts`.** Replace
```ts
  previewRefund(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
    @Query('enrollmentId') enrollmentId?: string,
  ) {
    return this.refundsService.previewRefund(
      studentId,
      companyId,
      enrollmentId,
    );
  }
```
with
```ts
  previewRefund(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @Query('enrollmentId') enrollmentId?: string,
  ) {
    return this.refundsService.previewRefund(
      studentId,
      userId,
      companyId,
      enrollmentId,
    );
  }
```

**`server/src/refunds/refunds.service.ts`.** Replace
```ts
  previewRefund(studentId: number, companyId: number, enrollmentId?: string) {
    return this.eligibility.previewRefund(studentId, companyId, enrollmentId);
  }
```
with
```ts
  previewRefund(
    studentId: number,
    userId: number,
    companyId: number,
    enrollmentId?: string,
  ) {
    return this.eligibility.previewRefund(
      studentId,
      userId,
      companyId,
      enrollmentId,
    );
  }
```

**`server/src/refunds/refunds-eligibility.service.ts`.**
1. Replace
```ts
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
```
with
```ts
import { tryResolveStudentBranchId } from '../common/finance/resolve-branch';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
```
2. Replace
```ts
  async previewRefund(
    studentId: number,
    companyId: number,
    enrollmentId?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }
```
with
```ts
  async previewRefund(
    studentId: number,
    userId: number,
    companyId: number,
    enrollmentId?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, companyId, deletedAt: null },
      select: { id: true, balance: true },
    });
    if (!student) {
      throw new NotFoundException("O'quvchi topilmadi");
    }
    // The quote reads the student's balance, groups and payments: only for a
    // caller who holds the student's branch.
    await assertCallerMayTouchStudent(this.prisma, userId, studentId, companyId);
```

**`server/src/withdrawals/withdrawals.controller.ts`.** Replace
```ts
  preview(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.withdrawalsService.preview(studentId, companyId);
  }
```
with
```ts
  preview(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.withdrawalsService.preview(studentId, userId, companyId);
  }
```

**`server/src/withdrawals/withdrawals.service.ts`.**
1. Replace
```ts
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { EntityHistoryService } from '../common/entity-history';
import {
  resolveStudentBranchId,
  tryResolveStudentBranchId,
} from '../common/finance/resolve-branch';
```
with
```ts
import { assertCallerMayWriteForStudent } from '../common/auth/financial-write-scope';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { EntityHistoryService } from '../common/entity-history';
import { resolveStudentBranchId } from '../common/finance/resolve-branch';
```
2. Replace
```ts
  async preview(studentId: number, companyId: number) {
```
with
```ts
  async preview(studentId: number, userId: number, companyId: number) {
```
3. Replace
```ts
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    const enrollments = await this.prisma.enrollment.findMany({
```
with
```ts
    if (!student) throw new NotFoundException("O'quvchi topilmadi");

    // The dialog shows the student's name, balance, groups and teachers: only
    // to a caller who holds the student's branch.
    const branchId = await assertCallerMayTouchStudent(
      this.prisma,
      userId,
      studentId,
      companyId,
    );

    const enrollments = await this.prisma.enrollment.findMany({
```
4. Replace
```ts
    const transfer = await loadTransferState(
      this.prisma,
      student,
      await tryResolveStudentBranchId(this.prisma, studentId, companyId),
      new Date(),
    );
```
with
```ts
    const transfer = await loadTransferState(
      this.prisma,
      student,
      branchId,
      new Date(),
    );
```

- [ ] **Step 4: Run the tests to verify they pass** (+ any other affected spec)
Run: `cd server && npx jest src/transactions src/billing/lesson-billing.service.spec.ts src/billing/debt-write-off.service.spec.ts src/billing/billing.controller.spec.ts src/refunds src/withdrawals src/common/auth/branch-route-policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Manifest**
No route moves, and the `UNREVIEWED_BUDGET` ceiling does not change, because none of the six routes is in `UNREVIEWED_ROUTES`. Only the block's `reason` is rewritten, so it is true for every route in the block, the two GET previews included. In `server/src/common/auth/branch-route-policy.ts`, replace
```ts
    reason:
      'Id-addressed money paths. The branch is resolved from the record and the ' +
      'caller is verified against it before the write. `POST /payments` checks ' +
      'again INSIDE its transaction with the transaction client, because a ' +
      'student can change branch between the two; the other routes here (the ' +
      'refund routes and `POST /students/:id/balance-notices` among them) check ' +
      "the student's branch once, before the write. Taking the header instead " +
      'would let the branch a user happens to be viewing decide where money ' +
      'is booked.',
```
with
```ts
    reason:
      'Id-addressed money paths. The branch is resolved from the record (or ' +
      'from the student the path names) and the caller is verified against ' +
      'it before anything is written or shown. `POST /payments` checks again ' +
      'INSIDE its transaction with the transaction client, because a student ' +
      'can change branch between the two; `POST /transactions/adjustment` and ' +
      'the three `/billing/*` routes check once, inside their own ' +
      'transaction, with its client; the other writes here (the refund routes ' +
      "and `POST /students/:id/balance-notices` among them) check the student's " +
      'branch once, before the write; the two previews refuse a student of ' +
      'another branch before answering with anything. The adjustment takes no ' +
      "branch from the body: its ledger row carries the student's branch. " +
      'Taking the header instead would let the branch a user happens to be ' +
      'viewing decide where money is booked.',
```
Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`. Expected: PASS.

- [ ] **Step 6: Lint, format, type-check**
```bash
cd server
npx prettier --write src/transactions/dto/create-adjustment.dto.ts src/transactions/transactions.controller.ts src/transactions/transactions.controller.spec.ts src/transactions/transactions.service.ts src/transactions/transactions-write.service.ts src/transactions/transactions-write.service.spec.ts src/billing/lesson-billing.service.ts src/billing/lesson-billing.service.spec.ts src/billing/debt-write-off.service.ts src/billing/debt-write-off.service.spec.ts src/refunds/refunds.controller.ts src/refunds/refunds.service.ts src/refunds/refunds-eligibility.service.ts src/refunds/refunds-eligibility.service.spec.ts src/withdrawals/withdrawals.controller.ts src/withdrawals/withdrawals.service.ts src/withdrawals/withdrawals.service.spec.ts src/common/auth/branch-route-policy.ts
npx eslint src/transactions/dto/create-adjustment.dto.ts src/transactions/transactions.controller.ts src/transactions/transactions.controller.spec.ts src/transactions/transactions.service.ts src/transactions/transactions-write.service.ts src/transactions/transactions-write.service.spec.ts src/billing/lesson-billing.service.ts src/billing/lesson-billing.service.spec.ts src/billing/debt-write-off.service.ts src/billing/debt-write-off.service.spec.ts src/refunds/refunds.controller.ts src/refunds/refunds.service.ts src/refunds/refunds-eligibility.service.ts src/refunds/refunds-eligibility.service.spec.ts src/withdrawals/withdrawals.controller.ts src/withdrawals/withdrawals.service.ts src/withdrawals/withdrawals.service.spec.ts src/common/auth/branch-route-policy.ts
npm run typecheck
npm test
```
Expected: no ESLint errors (warnings allowed), typecheck clean, the full suite green.

- [ ] **Step 7: Commit**
```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/transactions/dto/create-adjustment.dto.ts server/src/transactions/transactions.controller.ts server/src/transactions/transactions.controller.spec.ts server/src/transactions/transactions.service.ts server/src/transactions/transactions-write.service.ts server/src/transactions/transactions-write.service.spec.ts server/src/billing/lesson-billing.service.ts server/src/billing/lesson-billing.service.spec.ts server/src/billing/debt-write-off.service.ts server/src/billing/debt-write-off.service.spec.ts server/src/refunds/refunds.controller.ts server/src/refunds/refunds.service.ts server/src/refunds/refunds-eligibility.service.ts server/src/refunds/refunds-eligibility.service.spec.ts server/src/withdrawals/withdrawals.controller.ts server/src/withdrawals/withdrawals.service.ts server/src/withdrawals/withdrawals.service.spec.ts server/src/common/auth/branch-route-policy.ts
git commit -m "$(cat <<'EOF'
fix(money): student money writes and previews check the caller's branch

Six routes the manifest lists as entity-confined checked the company only:
the manual adjustment, the lesson-batch reverse, retroactive billing, the
write-off reverse, and the refund and withdrawal previews. Each now checks
the caller against the student's branch; the writes do it inside their own
transaction. The adjustment no longer takes a branch from the body, so its
ledger row always carries the student's branch.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 8: Salary reads stay inside the caller's payroll scope; the teacher timeline hides rates from callers who may not see salaries

**What is wrong today (worktree HEAD 39a3ea42):**
- Seven `salary.view` reads take no caller and return any employee's payroll in the company:
  `GET /salary/payments` (`findPayments(query, companyId)`), `GET /salary/payments/:id/breakdown`
  (`getPaymentBreakdown(id, companyId)`), `GET /salary/accruals/:userId` (`getAccruals(userId, companyId)`),
  `GET /salary/advances/:userId` (`getAdvancesForUser` resolves the scope, then ignores `branchId`/`blocked`),
  `GET /salary/config/:userId`, `GET /salary/configs/by-users`, `GET /salary/config-history/:userId`.
- `GET /salary/matrix` (`SalaryPaymentService.getMatrix`) uses a hand-rolled filter: `scoped = !CEO && !Administrator`, then `branchId = caller.mainBranch ?? undefined`. An Administrator (or a director who also holds the Administrator role) sees every branch, and so does a director whose `mainBranch` is null.
- `GET /salary/timeline/:userId` (`teachers.view`: CEO, Branch Director, Administrator) calls `getTimeline(userId, companyId)` with no caller. It returns any employee's rate history, rate values included, which breaks the 2026-09-30 rule that an Administrator sees no salary.

**Decisions taken in this task:**
- **The ceiling, not one branch.** A read addressed by one employee or one payment, and the three lists that take no header (`/salary/payments`, `/salary/matrix`, `/salary/configs/by-users`), are confined to the WHOLE payroll set from `resolvePayrollBranchScope`: `mainBranch` ∪ `UserBranch` for a non-CEO, everything for the CEO, nothing for `none`. These routes carry no `@BranchScope()`, so `narrowPayrollScope` with no pick would narrow them to the home branch. A director attached to two branches would then get 403 on the advances drawer or payslip of a row that `/salary/monthly` just showed them for their second branch.
- **403, not 404.** The neighbouring salary routes already do this: `payPayment` answers 403 «Bu xodim sizning filialingizga tegishli emas — oyligini to'lay olmaysiz» for a payee outside the caller's branch, and the own-payslip breakdown answers 403. `/teachers/:id/salary-summary` (via `assertCallerMayTouchUser`) also answers 403. A missing payment stays 404 and is checked first. The «names its branch» 404 does not apply: that rule is for detail reads filtered by `@BranchScope()`, and none of these routes has it. The lists filter instead of refusing: an empty scope gives an empty answer and the query never runs. This matches `/salary/overview` and `/salary/staff-config`.
- **Yourself always** (`selfView`, the rule `resolveMonthlyScope` already uses), so `GET /salary/me/accruals` keeps working for every staff role with no database read.
- **Timeline:** the target must share a branch with the caller (`assertCallerMayTouchUser`, the rule every other employee read uses). For a caller without `salary.view` the salary-version query is skipped entirely, and the group and profile events are kept.
- **Client: no change.** `client/src/components/teachers/teacher-timeline-tab.tsx` renders whatever list arrives. Kind only picks the icon and colour, and an empty list shows «Hech qanday muhim o'zgarish topilmadi». `/salary/payments`, `/salary/matrix`, `/salary/accruals/:userId` and `/salary/configs/by-users` have no client caller (`grep -rn` over `client/src`). The drawers that call `/salary/advances/:userId`, `/salary/payments/:id/breakdown`, `/salary/config/:userId` and `/salary/config-history/:userId` open from rows the caller's own payroll lists already showed.

**Files:**
- Modify: `server/src/salary/shared/payroll-branch-scope.ts` (add `payrollUserWhere`, `assertPayrollCoversUser`)
- Modify: `server/src/salary/salary-payment.service.ts` (`getMatrix` uses the payroll scope and fails closed; `findPayments` takes `performedById`)
- Modify: `server/src/salary/salary-breakdown.service.ts` (`getPaymentBreakdown` takes a required viewer)
- Modify: `server/src/salary/salary-accrual.service.ts` (`getAccruals` takes `performedById`)
- Modify: `server/src/salary/salary-config.service.ts` (`getConfig`, `getConfigsForUsers`, `getHistory` take `performedById`)
- Modify: `server/src/salary/salary-monthly.service.ts` (`getAdvancesForUser` checks the target)
- Modify: `server/src/salary/teacher-timeline.service.ts` (caller check + `salary.view` filter; injects `PermissionsService`)
- Modify: `server/src/salary/salary.service.ts` (facade passes `performedById`)
- Modify: `server/src/salary/salary.controller.ts` (passes `@CurrentUser('id')` to every changed method)
- Modify: `server/src/common/auth/branch-route-policy.ts` (block reasons and membership)
- Modify: `server/CLAUDE.md` («Salary Module»: the Roles bullet and the Payroll branch scope bullet)
- Test: `server/src/salary/shared/payroll-branch-scope.spec.ts`
- Test: `server/src/salary/salary-payment.service.spec.ts`
- Test: `server/src/salary/salary-breakdown.service.spec.ts`
- Test: `server/src/salary/salary-accrual.service.spec.ts`
- Test: `server/src/salary/salary-config.service.spec.ts`
- Test: `server/src/salary/salary-monthly.service.spec.ts`
- Create (test): `server/src/salary/teacher-timeline.service.spec.ts`

**Interfaces:**
- Consumes (verified):
  - `resolvePayrollBranchScope(prisma: PrismaLike, performedById: number, opts: { selfView?: boolean } = {}): Promise<PayrollBranchScope>` and `type PayrollBranchScope = { kind: 'all' } | { kind: 'branches'; branchIds: number[]; mainBranch: number | null } | { kind: 'none' }`. Both are in `server/src/salary/shared/payroll-branch-scope.ts`. `selfView: true` returns `{ kind: 'all' }` without a database read. `findUnique` selects `mainBranch`, `branches.branchId` and `roles.role.name`, and only `CEO` is unscoped.
  - `userBranchWhere(ids: ReportBranchIds | undefined)` (`server/src/common/finance/report-branch-scope.ts`): `null` gives `{}`, and otherwise `{ OR: [{ mainBranch: { in: ids } }, { branches: { some: { branchId: { in: ids } } } }] }`. `[]` matches nobody.
  - `assertCallerMayTouchUser(prisma: PrismaLike, callerId: number | undefined, targetUserId: number, message?: string): Promise<void>` (`server/src/common/auth/user-branch-scope.ts`). It passes for yourself and for the CEO. It reads caller and target with `prisma.user.findFirst` (caller first), and throws `ForbiddenException` with no overlap or with an empty set on either side.
  - `PermissionsService.has(userId: number, key: PermissionKey): Promise<boolean>` (`server/src/common/permissions/permissions.service.ts`). The module is `@Global()`. `salary.view` default roles: Branch Director only, and the CEO holds every key.
  - `fakePermissions(roleIds: number[]): PermissionsService` (`server/src/common/permissions/testing.ts`) and `ROLE_ID` (`server/src/common/auth/role-ids.ts`).
- Produces:
  - `payrollUserWhere(scope: PayrollBranchScope): Prisma.UserWhereInput | undefined`, exported from `payroll-branch-scope.ts`.
  - `assertPayrollCoversUser(prisma: PrismaLike, performedById: number, targetUserId: number): Promise<void>`, exported from `payroll-branch-scope.ts`.
  - New signatures:
    - `SalaryPaymentService.findPayments(query, companyId, performedById)`
    - `SalaryBreakdownService.getPaymentBreakdown(id, companyId, viewer: { ownerId: number } | { performedById: number })`
    - `SalaryAccrualService.getAccruals(userId, companyId, performedById)`
    - `SalaryConfigService.getConfig / getHistory(userId, companyId, performedById)`
    - `SalaryConfigService.getConfigsForUsers(userIds, companyId, performedById)`
    - `TeacherTimelineService.getTimeline(teacherId, companyId, performedById)`
    - The matching `SalaryService` facade methods.
  - A later task that edits `payPayment` (CEO decision 3) touches the same file, `salary-payment.service.ts`, but none of these lines.

- [ ] **Step 1: Write the failing tests**

**1a. `server/src/salary/shared/payroll-branch-scope.spec.ts`.** Replace line 1:
```ts
import { resolvePayrollBranchScope } from './payroll-branch-scope';
```
with:
```ts
import { ForbiddenException } from '@nestjs/common';
import {
  assertPayrollCoversUser,
  payrollUserWhere,
  resolvePayrollBranchScope,
} from './payroll-branch-scope';
```
Then append at the end of the file, after the closing `});` of `describe('resolvePayrollBranchScope', …)`:
```ts

describe('payrollUserWhere', () => {
  it('adds no filter for the CEO', () => {
    expect(payrollUserWhere({ kind: 'all' })).toBeUndefined();
  });

  it('matches an employee attached to any of the branches, through mainBranch or UserBranch', () => {
    expect(
      payrollUserWhere({ kind: 'branches', branchIds: [1, 2], mainBranch: 1 }),
    ).toEqual({
      OR: [
        { mainBranch: { in: [1, 2] } },
        { branches: { some: { branchId: { in: [1, 2] } } } },
      ],
    });
  });

  it('matches nobody for an empty scope (fail closed)', () => {
    expect(payrollUserWhere({ kind: 'none' })).toEqual({
      OR: [
        { mainBranch: { in: [] } },
        { branches: { some: { branchId: { in: [] } } } },
      ],
    });
  });
});

/**
 * Seven salary reads took no caller and returned any employee's payroll in
 * the company. An id-addressed read now asks this first.
 */
describe('assertPayrollCoversUser', () => {
  function prismaFor(
    caller: Parameters<typeof prismaWith>[0],
    targetInScope: boolean,
  ) {
    const prisma = prismaWith(caller);
    prisma.user.count = jest.fn().mockResolvedValue(targetInScope ? 1 : 0);
    return prisma;
  }

  it('lets the CEO read anyone without looking the employee up', async () => {
    const prisma = prismaFor({ mainBranch: null, roles: ['CEO'] }, false);
    await expect(
      assertPayrollCoversUser(prisma, 10000, 10050),
    ).resolves.toBeUndefined();
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('lets anyone read their own payroll without any lookup', async () => {
    const prisma = prismaFor({ mainBranch: null, roles: ['Teacher'] }, false);
    await expect(
      assertPayrollCoversUser(prisma, 10001, 10001),
    ).resolves.toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lets a director read an employee of any branch attached to them', async () => {
    const prisma = prismaFor(
      { mainBranch: 1, branches: [1, 2], roles: ['Branch Director'] },
      true,
    );
    await assertPayrollCoversUser(prisma, 10012, 10050);
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: {
        id: 10050,
        OR: [
          { mainBranch: { in: [1, 2] } },
          { branches: { some: { branchId: { in: [1, 2] } } } },
        ],
      },
    });
  });

  it("refuses a director another branch's employee", async () => {
    const prisma = prismaFor(
      { mainBranch: 1, roles: ['Branch Director'] },
      false,
    );
    await expect(
      assertPayrollCoversUser(prisma, 10012, 10060),
    ).rejects.toThrow(ForbiddenException);
  });

  it('confines an Administrator too: only the CEO spans branches', async () => {
    const prisma = prismaFor({ mainBranch: 1, roles: ['Administrator'] }, false);
    await expect(
      assertPayrollCoversUser(prisma, 10030, 10060),
    ).rejects.toThrow(/oyligini ko'ra olmaysiz/);
  });

  it('refuses a caller with no branch without looking the employee up (fail closed)', async () => {
    const prisma = prismaFor(
      { mainBranch: null, roles: ['Branch Director'] },
      true,
    );
    await expect(
      assertPayrollCoversUser(prisma, 10012, 10050),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.user.count).not.toHaveBeenCalled();
  });
});
```

**1b. `server/src/salary/salary-payment.service.spec.ts`.**

In `beforeEach`, replace:
```ts
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
```
with:
```ts
      salaryPayment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
```

After the `const user = (id: number) => ({ … });` helper, which ends with
```ts
    roles: [{ role: { id: 4, name: 'Teacher' } }],
  });
```
insert:
```ts

  /** `payrollUserWhere` for a confined caller: mainBranch OR UserBranch. */
  const inBranches = (ids: number[]) => ({
    OR: [
      { mainBranch: { in: ids } },
      { branches: { some: { branchId: { in: ids } } } },
    ],
  });
```

Replace the whole test
```ts
  it('scopes a Branch Director to their own mainBranch', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: 2,
      roles: [{ role: { name: 'Branch Director' } }],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { mainBranch: 2 } }),
      }),
    );
  });
```
with:
```ts
  it('scopes a Branch Director to every branch attached to them', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: 2,
      branches: [{ branchId: 2 }, { branchId: 3 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: inBranches([2, 3]) }),
      }),
    );
  });

  // The matrix kept a hand-rolled `!CEO && !Administrator` filter after the
  // payroll scope replaced it everywhere else (server/CLAUDE.md, «Payroll
  // branch scope»): an Administrator saw every branch.
  it('confines an Administrator: only the CEO spans branches', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: 1,
      branches: [],
      roles: [{ role: { name: 'Administrator' } }],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    const arg = prisma.salaryPayment.findMany.mock.calls[0][0];
    expect(arg.where.user).toEqual(inBranches([1]));
  });

  it('confines a director who also holds the Administrator role', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: 2,
      branches: [],
      roles: [
        { role: { name: 'Branch Director' } },
        { role: { name: 'Administrator' } },
      ],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    const arg = prisma.salaryPayment.findMany.mock.calls[0][0];
    expect(arg.where.user).toEqual(inBranches([2]));
  });

  it('serves a director attached only through UserBranch their branch, not every branch', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: null,
      branches: [{ branchId: 2 }],
      roles: [{ role: { name: 'Branch Director' } }],
    });
    await service.getMatrix({ from: '2026-06', to: '2026-06' }, 1, 999);
    const arg = prisma.salaryPayment.findMany.mock.calls[0][0];
    expect(arg.where.user).toEqual(inBranches([2]));
  });

  it('shows nothing to a director with no branch and reads no payment (fail closed)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    });
    const res = await service.getMatrix(
      { from: '2026-06', to: '2026-06' },
      1,
      999,
    );
    expect(res).toEqual({
      months: ['2026-06'],
      rows: [],
      monthlyTotals: {},
      grandTotal: 0,
    });
    expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
  });
```

Directly after the existing test `it('does NOT branch-scope a CEO', …)`, which ends with
```ts
    expect(arg.where.user).toBeUndefined();
  });
```
insert:
```ts

  /** `GET /salary/payments` took no caller and listed every branch. */
  describe('findPayments — payroll scope', () => {
    it('lists every branch for the CEO', async () => {
      await service.findPayments({}, 1, 999);
      expect(
        prisma.salaryPayment.findMany.mock.calls[0][0].where.user,
      ).toBeUndefined();
      expect(
        prisma.salaryPayment.count.mock.calls[0][0].where.user,
      ).toBeUndefined();
    });

    it("lists and counts only the payroll of the director's branches", async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await service.findPayments({ userId: 10060 }, 1, 10012);
      const where = prisma.salaryPayment.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        companyId: 1,
        userId: 10060,
        user: inBranches([1]),
      });
      expect(prisma.salaryPayment.count).toHaveBeenCalledWith({ where });
    });

    it('lists nothing for a caller with no branch and reads nothing (fail closed)', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      const res = await service.findPayments({}, 1, 10012);
      expect(res).toEqual({ data: [], total: 0, page: 1, pageSize: 10 });
      expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.count).not.toHaveBeenCalled();
    });
  });
```

**1c. `server/src/salary/salary-breakdown.service.spec.ts`.**

Replace line 2:
```ts
import { ForbiddenException } from '@nestjs/common';
```
with:
```ts
import { ForbiddenException, NotFoundException } from '@nestjs/common';
```
Replace:
```ts
  let service: SalaryBreakdownService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      salaryPayment: {
```
with:
```ts
  let service: SalaryBreakdownService;
  let prisma: any;

  /** A CEO viewer: every payslip, no branch lookup. */
  const CEO_VIEWER = { performedById: 10000 };

  beforeEach(async () => {
    prisma = {
      // The payroll scope reads the viewer here; a CEO by default.
      user: {
        findUnique: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      salaryPayment: {
```
Replace every `getPaymentBreakdown('sp1', 1)` (4 occurrences: three in the advance tests, one in the `callers` table) with `getPaymentBreakdown('sp1', 1, CEO_VIEWER)` (Edit with `replace_all: true`).

Replace the test
```ts
  it('forbids a teacher from viewing another teacher payment', async () => {
    await expect(
      service.getPaymentBreakdown('sp1', 1, 999),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
```
with:
```ts
  it('forbids a teacher from viewing another teacher payment', async () => {
    await expect(
      service.getPaymentBreakdown('sp1', 1, { ownerId: 999 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('serves the payee their own payslip without a branch lookup', async () => {
    const result = await service.getPaymentBreakdown('sp1', 1, { ownerId: 7 });
    expect(result.payment.id).toBe('sp1');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /**
   * `GET /salary/payments/:id/breakdown` took no caller: any payslip in the
   * company, accrual by accrual, to anyone holding `salary.view`.
   */
  describe('a payroll viewer reads only payslips inside their payroll scope', () => {
    const director = (branches: number[]) => ({
      mainBranch: branches[0] ?? null,
      branches: branches.map((branchId) => ({ branchId })),
      roles: [{ role: { name: 'Branch Director' } }],
    });

    it('lets the CEO read any payslip without looking the payee up', async () => {
      await service.getPaymentBreakdown('sp1', 1, CEO_VIEWER);
      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it("refuses another branch's payslip and reads none of it", async () => {
      prisma.user.findUnique.mockResolvedValue(director([1]));
      prisma.user.count.mockResolvedValue(0); // payee 7 is not in branch 1

      await expect(
        service.getPaymentBreakdown('sp1', 1, { performedById: 10012 }),
      ).rejects.toThrow(/filialingizga tegishli emas/);
      expect(prisma.salaryAccrual.findMany).not.toHaveBeenCalled();
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it('serves a payslip of an employee in one of their branches', async () => {
      prisma.user.findUnique.mockResolvedValue(director([1, 2]));
      prisma.user.count.mockResolvedValue(1);

      const result = await service.getPaymentBreakdown('sp1', 1, {
        performedById: 10012,
      });

      expect(result.payment.id).toBe('sp1');
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ id: 7 }),
      });
    });

    it('serves nothing to a director with no branch (fail closed)', async () => {
      prisma.user.findUnique.mockResolvedValue(director([]));

      await expect(
        service.getPaymentBreakdown('sp1', 1, { performedById: 10012 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.salaryAccrual.findMany).not.toHaveBeenCalled();
    });

    it('answers 404 for a payslip that does not exist, before any scope question', async () => {
      prisma.salaryPayment.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getPaymentBreakdown('nope', 1, { performedById: 10012 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
```

**1d. `server/src/salary/salary-accrual.service.spec.ts`.** Insert inside the top-level `describe('SalaryAccrualService', …)`, immediately before the file's final line `});`:
```ts

  /** `GET /salary/accruals/:userId` took no caller: any teacher's accruals. */
  describe('getAccruals — payroll scope', () => {
    const director = {
      mainBranch: 1,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    };

    beforeEach(() => {
      prisma.salaryAccrual.findMany = jest.fn().mockResolvedValue([]);
      prisma.user.findUnique = jest.fn();
      prisma.user.count = jest.fn().mockResolvedValue(0);
    });

    it('lets anyone read their own accruals without a branch lookup', async () => {
      await service.getAccruals(10001, 1, 10001);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.salaryAccrual.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 10001, companyId: 1 }),
        }),
      );
    });

    it("refuses a director another branch's teacher and reads nothing", async () => {
      prisma.user.findUnique.mockResolvedValue(director);

      await expect(service.getAccruals(10060, 1, 10012)).rejects.toThrow(
        /filialingizga tegishli emas/,
      );
      expect(prisma.salaryAccrual.findMany).not.toHaveBeenCalled();
    });

    it('serves a director a teacher of their own branch', async () => {
      prisma.user.findUnique.mockResolvedValue(director);
      prisma.user.count.mockResolvedValue(1);

      await service.getAccruals(10050, 1, 10012);

      expect(prisma.salaryAccrual.findMany).toHaveBeenCalled();
    });

    it('lets the CEO read any teacher', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      });

      await service.getAccruals(10060, 1, 10000);

      expect(prisma.user.count).not.toHaveBeenCalled();
      expect(prisma.salaryAccrual.findMany).toHaveBeenCalled();
    });
  });
```

**1e. `server/src/salary/salary-config.service.spec.ts`.** Append at the end of the file:
```ts

/**
 * Rate reads took no caller: `GET /salary/config/:userId`, `/configs/by-users`
 * and `/config-history/:userId` returned any employee's rate in the company to
 * anyone holding `salary.view`.
 */
describe('SalaryConfigService — rate reads stay inside the payroll scope', () => {
  let service: SalaryConfigService;
  let prisma: any;

  const director = {
    mainBranch: 1,
    branches: [{ branchId: 1 }],
    roles: [{ role: { name: 'Branch Director' } }],
  };
  const ceo = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(director),
        count: jest.fn().mockResolvedValue(0),
      },
      employeeSalaryConfig: { findMany: jest.fn().mockResolvedValue([]) },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryConfigService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(SalaryConfigService);
  });

  const oneEmployeeReads: [
    string,
    (s: SalaryConfigService) => Promise<unknown>,
    string,
  ][] = [
    ['getConfig', (s) => s.getConfig(10060, 1, 10012), 'employeeSalaryConfig'],
    [
      'getHistory',
      (s) => s.getHistory(10060, 1, 10012),
      'employeeSalaryConfigVersion',
    ],
  ];

  it.each(oneEmployeeReads)(
    "%s refuses another branch's employee and reads no rate",
    async (_name, call, model) => {
      await expect(call(service)).rejects.toThrow(
        /filialingizga tegishli emas/,
      );
      expect(prisma[model].findMany).not.toHaveBeenCalled();
    },
  );

  it.each(oneEmployeeReads)(
    "%s serves an employee of the director's branch",
    async (_name, call, model) => {
      prisma.user.count.mockResolvedValue(1);
      await call(service);
      expect(prisma[model].findMany).toHaveBeenCalled();
    },
  );

  it('getConfig lets the CEO read anyone without a branch lookup', async () => {
    prisma.user.findUnique.mockResolvedValue(ceo);
    await service.getConfig(10060, 1, 10000);
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalled();
  });

  describe('getConfigsForUsers', () => {
    it("filters the bulk read to the director's branches", async () => {
      await service.getConfigsForUsers([10050, 10060], 1, 10012);
      expect(prisma.employeeSalaryConfig.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: { in: [10050, 10060] },
            companyId: 1,
            isActive: true,
            user: {
              OR: [
                { mainBranch: { in: [1] } },
                { branches: { some: { branchId: { in: [1] } } } },
              ],
            },
          },
        }),
      );
    });

    it('does not filter for the CEO', async () => {
      prisma.user.findUnique.mockResolvedValue(ceo);
      await service.getConfigsForUsers([10050], 1, 10000);
      expect(
        prisma.employeeSalaryConfig.findMany.mock.calls[0][0].where.user,
      ).toBeUndefined();
    });

    it('returns nothing to a director with no branch and reads nothing (fail closed)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      await expect(
        service.getConfigsForUsers([10050], 1, 10012),
      ).resolves.toEqual({});
      expect(prisma.employeeSalaryConfig.findMany).not.toHaveBeenCalled();
    });
  });
});
```

**1f. `server/src/salary/salary-monthly.service.spec.ts`.** Inside `describe('getAdvancesForUser', …)`, replace the end of its second test:
```ts
      expect(res.advances[1]).toMatchObject({ id: 'a2', settled: true });
      expect(res.advances[1].settledPeriodEnd).toEqual(new Date('2026-06-30'));
    });
  });
```
with:
```ts
      expect(res.advances[1]).toMatchObject({ id: 'a2', settled: true });
      expect(res.advances[1].settledPeriodEnd).toEqual(new Date('2026-06-30'));
    });

    // The drawer's endpoint resolved the payroll scope and then never read it,
    // so any employee's advances were one id away.
    it("refuses another branch's employee and reads none of their advances", async () => {
      prisma.user.findUnique.mockResolvedValue({
        mainBranch: 1,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      prisma.user.count = jest.fn().mockResolvedValue(0);

      await expect(
        service.getAdvancesForUser(10060, { month: '2026-06' }, 1, 10012),
      ).rejects.toThrow(/filialingizga tegishli emas/);
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });

    it("serves a director an employee of their second branch (the ceiling, not the home branch)", async () => {
      prisma.user.findUnique.mockResolvedValue({
        mainBranch: 1,
        branches: [{ branchId: 1 }, { branchId: 2 }],
        roles: [{ role: { name: 'Branch Director' } }],
      });
      prisma.user.count = jest.fn().mockResolvedValue(1);

      const res = await service.getAdvancesForUser(
        10060,
        { month: '2026-06' },
        1,
        10012,
      );

      expect(res.userId).toBe(10060);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          id: 10060,
          OR: [
            { mainBranch: { in: [1, 2] } },
            { branches: { some: { branchId: { in: [1, 2] } } } },
          ],
        },
      });
      expect(prisma.expense.findMany).toHaveBeenCalled();
    });

    it('serves nothing to a director with no branch (fail closed)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'Branch Director' } }],
      });

      await expect(
        service.getAdvancesForUser(10060, { month: '2026-06' }, 1, 10012),
      ).rejects.toThrow(/filialingizga tegishli emas/);
      expect(prisma.expense.findMany).not.toHaveBeenCalled();
    });
  });
```
(The two existing tests run as the CEO (`ceoCaller`), and `prisma.user.count` is undefined there. If the code looked a CEO's target up, those tests would crash, so they also pin «the CEO is not looked up».)

**1g. Create `server/src/salary/teacher-timeline.service.spec.ts`:**
```ts
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherTimelineService } from './teacher-timeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions/permissions.service';
import { fakePermissions } from '../common/permissions/testing';
import { ROLE_ID } from '../common/auth/role-ids';

/**
 * `GET /salary/timeline/:userId` takes `teachers.view`, which the
 * Administrator holds. It took no caller: any employee's rate history in the
 * company, rate values included, went to anyone holding that key, although
 * an Administrator sees no salary (30.09.2026).
 */
describe('TeacherTimelineService.getTimeline', () => {
  let prisma: any;

  const TEACHER = 10050;
  const CALLER = 10012;

  /** Caller, then target, as `assertCallerMayTouchUser` reads them. */
  function people(
    caller: { roles: string[]; branches: number[] },
    targetBranches: number[],
  ) {
    prisma.user.findFirst
      .mockResolvedValueOnce({
        mainBranch: caller.branches[0] ?? null,
        branches: caller.branches.map((branchId) => ({ branchId })),
        roles: caller.roles.map((name) => ({ role: { name } })),
      })
      .mockResolvedValueOnce({
        id: TEACHER,
        mainBranch: targetBranches[0] ?? null,
        branches: targetBranches.map((branchId) => ({ branchId })),
      });
  }

  async function build(roleIds: number[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeacherTimelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: fakePermissions(roleIds) },
      ],
    }).compile();
    return module.get(TeacherTimelineService);
  }

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            salaryType: 'PERCENTAGE',
            value: 40,
            effectiveFrom: new Date('2026-06-01'),
            createdAt: new Date('2026-06-01'),
            config: { groupId: null, group: null },
            changedBy: null,
          },
        ]),
      },
      groupTeacherHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'h1',
            groupId: 'g1',
            previousTeacherIds: [],
            newTeacherIds: [TEACHER],
            changeType: 'ADDED',
            changeReason: null,
            createdAt: new Date('2026-07-01'),
            group: { name: 'A1-01' },
            changedBy: null,
          },
        ]),
      },
      entityHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            action: 'UPDATE',
            oldValues: { phone: '1' },
            newValues: { phone: '2' },
            createdAt: new Date('2026-08-01'),
            changedBy: null,
          },
        ]),
      },
    };
  });

  it('refuses an employee of another branch and reads none of their history', async () => {
    const service = await build([ROLE_ID.BRANCH_DIRECTOR]);
    people({ roles: ['Branch Director'], branches: [1] }, [2]);

    await expect(service.getTimeline(TEACHER, 1, CALLER)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.employeeSalaryConfigVersion.findMany).not.toHaveBeenCalled();
    expect(prisma.groupTeacherHistory.findMany).not.toHaveBeenCalled();
    expect(prisma.entityHistory.findMany).not.toHaveBeenCalled();
  });

  it('shows a Branch Director the whole timeline of their own teacher, rates included', async () => {
    const service = await build([ROLE_ID.BRANCH_DIRECTOR]);
    people({ roles: ['Branch Director'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toEqual([
      'ProfileUpdated',
      'GroupAdded',
      'SalaryChanged',
    ]);
  });

  it('shows an Administrator no rate: the salary versions are not even read', async () => {
    const service = await build([ROLE_ID.ADMINISTRATOR]);
    people({ roles: ['Administrator'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toEqual(['ProfileUpdated', 'GroupAdded']);
    expect(prisma.employeeSalaryConfigVersion.findMany).not.toHaveBeenCalled();
  });

  it('lets the CEO read any employee, rates included', async () => {
    const service = await build([ROLE_ID.CEO]);
    people({ roles: ['CEO'], branches: [] }, [2]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toContain('SalaryChanged');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd server && npx jest src/salary/shared/payroll-branch-scope.spec.ts src/salary/salary-payment.service.spec.ts src/salary/salary-breakdown.service.spec.ts src/salary/salary-accrual.service.spec.ts src/salary/salary-config.service.spec.ts src/salary/salary-monthly.service.spec.ts src/salary/teacher-timeline.service.spec.ts`

Expected: FAIL in all seven suites. ts-jest type-checks, so most fail to compile:
- `payroll-branch-scope.spec.ts`: TS2305, `assertPayrollCoversUser` and `payrollUserWhere` are not exported.
- `salary-payment.service.spec.ts`: TS2554, `findPayments` expects 2 arguments.
- `salary-breakdown.service.spec.ts`: TS2345, an object is not assignable to `asUserId?: number`.
- `salary-accrual.service.spec.ts`: TS2554 on `getAccruals(…, …, …)`.
- `salary-config.service.spec.ts`: TS2554 on `getConfig`, `getHistory` and `getConfigsForUsers`.
- `teacher-timeline.service.spec.ts`: TS2554 on `getTimeline`.
- `salary-monthly.service.spec.ts` compiles, because the `getAdvancesForUser` signature is unchanged. Two tests fail on behaviour: «refuses another branch's employee…» and «serves nothing to a director with no branch» resolve instead of rejecting, because the scope is resolved and ignored. «serves a director an employee of their second branch» fails on `expect(prisma.user.count).toHaveBeenCalledWith(…)`, because `count` is never called.

- [ ] **Step 3: Implement**

**3a. `server/src/salary/shared/payroll-branch-scope.ts`.** Replace the header:
```ts
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;
```
with:
```ts
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { userBranchWhere } from '../../common/finance/report-branch-scope';

type PrismaLike = PrismaService | Prisma.TransactionClient;
```
Then replace the end of `narrowPayrollScope`:
```ts
  // `all` — the CEO. The header is the only narrowing available, and `undefined`
  // (no pick) genuinely means every branch.
  return { branchId: requestedBranchId ?? undefined, blocked: false };
}
```
with:
```ts
  // `all` — the CEO. The header is the only narrowing available, and `undefined`
  // (no pick) genuinely means every branch.
  return { branchId: requestedBranchId ?? undefined, blocked: false };
}

/**
 * `where` fragment on an employee (`User`) for "their payroll is inside this
 * scope": no filter for the CEO; for anyone else the employees attached to one
 * of the caller's branches, through `mainBranch` or a `UserBranch` row (the two
 * sources the scope itself merges); nobody for `none`.
 *
 * The whole set, not `narrowPayrollScope`'s one branch: the reads that use
 * this take no header, and a director attached to two branches opens rows of
 * either from the monthly report.
 */
export function payrollUserWhere(
  scope: PayrollBranchScope,
): Prisma.UserWhereInput | undefined {
  if (scope.kind === 'all') return undefined;
  return userBranchWhere(scope.kind === 'branches' ? scope.branchIds : []);
}

/**
 * Refuses (403) unless `targetUserId`'s payroll is inside the caller's scope.
 * For the salary reads addressed by one employee or one payment, which took no
 * caller until 10.10.2026 and served any employee in the company.
 *
 * Yourself always (the self rule `resolveMonthlyScope` uses), the CEO always, a
 * caller with no branch never. 403 rather than 404, like `payPayment` and the
 * teacher reads: the payroll exists, this caller may not see it.
 */
export async function assertPayrollCoversUser(
  prisma: PrismaLike,
  performedById: number,
  targetUserId: number,
): Promise<void> {
  const scope = await resolvePayrollBranchScope(prisma, performedById, {
    selfView: performedById === targetUserId,
  });
  if (scope.kind === 'all') return;
  const covered =
    scope.kind === 'branches' &&
    (await prisma.user.count({
      where: { id: targetUserId, ...payrollUserWhere(scope) },
    })) > 0;
  if (!covered) {
    throw new ForbiddenException(
      "Bu xodim sizning filialingizga tegishli emas — oyligini ko'ra olmaysiz",
    );
  }
}
```
(The message mirrors `payPayment`'s existing «Bu xodim sizning filialingizga tegishli emas — oyligini to'lay olmaysiz». No read refusal for salary existed before.)

**3b. `server/src/salary/salary-payment.service.ts`.**

Replace:
```ts
import { resolvePayrollBranchScope } from './shared/payroll-branch-scope';
```
with:
```ts
import {
  payrollUserWhere,
  resolvePayrollBranchScope,
} from './shared/payroll-branch-scope';
```
In the `getMatrix` doc comment replace:
```ts
   * other start days still bucket by the month the period opens in). Excludes
   * CANCELLED payments. Branch Directors are scoped to their own mainBranch.
   */
```
with:
```ts
   * other start days still bucket by the month the period opens in). Excludes
   * CANCELLED payments. Confined to the caller's payroll scope: the CEO sees
   * every branch, anyone else the employees of their branches, a caller with
   * no branch nothing.
   */
```
Replace:
```ts
    // Branch scope: CEO/Administrator see all; Branch Director only their branch.
    const caller = await this.prisma.user.findUnique({
      where: { id: performedById },
      select: {
        mainBranch: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    const roleNames = caller?.roles.map((r) => r.role.name) ?? [];
    const scoped =
      !roleNames.includes('CEO') && !roleNames.includes('Administrator');
    const branchId = scoped ? (caller?.mainBranch ?? undefined) : undefined;

    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: fromStart, lt: toEndExclusive },
        ...(branchId !== undefined && { user: { mainBranch: branchId } }),
      },
```
with:
```ts
    // The payroll scope, failing closed. This was a hand-rolled
    // `!CEO && !Administrator` check on `mainBranch`: an Administrator saw
    // every branch, and so did a director whose `mainBranch` was null.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind === 'none') {
      return { months, rows: [], monthlyTotals: {}, grandTotal: 0 };
    }
    const userWhere = payrollUserWhere(scope);

    const payments = await this.prisma.salaryPayment.findMany({
      where: {
        companyId,
        status: { not: SalaryPaymentStatus.CANCELLED },
        periodStart: { gte: fromStart, lt: toEndExclusive },
        ...(userWhere && { user: userWhere }),
      },
```
Replace:
```ts
  async findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.userId && { userId: query.userId }),
      ...(query.status && { status: query.status }),
    };
```
with:
```ts
  /**
   * Salary payments, newest first, of the employees inside the caller's
   * payroll scope: every branch for the CEO, nothing for a caller with no
   * branch.
   */
  async findPayments(
    query: SalaryPaymentQueryDto,
    companyId: number,
    performedById: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind === 'none') return { data: [], total: 0, page, pageSize };
    const userWhere = payrollUserWhere(scope);

    const where: Prisma.SalaryPaymentWhereInput = {
      companyId,
      ...(query.userId && { userId: query.userId }),
      ...(query.status && { status: query.status }),
      ...(userWhere && { user: userWhere }),
    };
```

**3c. `server/src/salary/salary-breakdown.service.ts`.** Add after `import { resolveCurrentPeriod } from './shared/resolve-current-period';`:
```ts
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
```
Replace:
```ts
  /**
   * Breakdown for a finalised SalaryPayment. The teacher can view their
   * own; CEO/BD can view any.
   */
  async getPaymentBreakdown(
    salaryPaymentId: string,
    companyId: number,
    asUserId?: number, // when set, restrict to this teacher's own payment
  ) {
```
with:
```ts
  /**
   * Breakdown for a finalised SalaryPayment. `{ ownerId }` is the payee
   * reading their own payslip (`/salary/me/...`): theirs and nobody else's.
   * `{ performedById }` is a payroll viewer, who reads it only when the payee
   * is inside their payroll scope (every branch for the CEO).
   */
  async getPaymentBreakdown(
    salaryPaymentId: string,
    companyId: number,
    viewer: { ownerId: number } | { performedById: number },
  ) {
```
Replace:
```ts
    if (!payment) throw new NotFoundException('Oylik to`lovi topilmadi');
    if (asUserId !== undefined && payment.userId !== asUserId) {
      throw new ForbiddenException(
        "Faqat o'z oylik to'lovingizni ko'rishingiz mumkin",
      );
    }
```
with:
```ts
    if (!payment) throw new NotFoundException('Oylik to`lovi topilmadi');
    if ('ownerId' in viewer) {
      if (payment.userId !== viewer.ownerId) {
        throw new ForbiddenException(
          "Faqat o'z oylik to'lovingizni ko'rishingiz mumkin",
        );
      }
    } else {
      await assertPayrollCoversUser(
        this.prisma,
        viewer.performedById,
        payment.userId,
      );
    }
```

**3d. `server/src/salary/salary-accrual.service.ts`.** Add after `import { isLessonPayForfeited } from '../unmarked-lessons/forfeited-lessons';`:
```ts
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
```
Replace:
```ts
  async getAccruals(userId: number, companyId: number) {
    return this.prisma.salaryAccrual.findMany({
```
with:
```ts
  /** Unpaid accruals of yourself, or of an employee inside your payroll scope. */
  async getAccruals(userId: number, companyId: number, performedById: number) {
    await assertPayrollCoversUser(this.prisma, performedById, userId);
    return this.prisma.salaryAccrual.findMany({
```

**3e. `server/src/salary/salary-config.service.ts`.** Add after `import { assertCallerMaySetTeacherRate } from './shared/teacher-rate-permission';`:
```ts
import {
  assertPayrollCoversUser,
  payrollUserWhere,
  resolvePayrollBranchScope,
} from './shared/payroll-branch-scope';
```
Replace:
```ts
  async getConfig(userId: number, companyId: number) {
    return this.prisma.employeeSalaryConfig.findMany({
```
with:
```ts
  async getConfig(userId: number, companyId: number, performedById: number) {
    await assertPayrollCoversUser(this.prisma, performedById, userId);
    return this.prisma.employeeSalaryConfig.findMany({
```
Replace:
```ts
  async getConfigsForUsers(userIds: number[], companyId: number) {
    if (userIds.length === 0) return {};
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: { userId: { in: userIds }, companyId, isActive: true },
```
with:
```ts
  async getConfigsForUsers(
    userIds: number[],
    companyId: number,
    performedById: number,
  ) {
    if (userIds.length === 0) return {};
    // Only employees inside the caller's payroll scope. An id outside it is
    // left out of the answer, like a list row the caller cannot see.
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind === 'none') return {};
    const userWhere = payrollUserWhere(scope);
    const configs = await this.prisma.employeeSalaryConfig.findMany({
      where: {
        userId: { in: userIds },
        companyId,
        isActive: true,
        ...(userWhere && { user: userWhere }),
      },
```
Replace:
```ts
  async getHistory(userId: number, companyId: number) {
    return this.prisma.employeeSalaryConfigVersion.findMany({
```
with:
```ts
  async getHistory(userId: number, companyId: number, performedById: number) {
    await assertPayrollCoversUser(this.prisma, performedById, userId);
    return this.prisma.employeeSalaryConfigVersion.findMany({
```

**3f. `server/src/salary/salary-monthly.service.ts`.** Replace:
```ts
import {
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from './shared/resolve-monthly-scope';
```
with:
```ts
import {
  resolveMonthlyScope,
  type SalaryMonthlyQuery,
} from './shared/resolve-monthly-scope';
import { assertPayrollCoversUser } from './shared/payroll-branch-scope';
```
Replace:
```ts
    performedById: number,
  ) {
    const { month, monthStart, nextMonthStart } = await resolveMonthlyScope(
```
with:
```ts
    performedById: number,
  ) {
    // `resolveMonthlyScope` supplies only the month's bounds here; its branch
    // was never read, so any employee's advances were one id away. Who may be
    // read is the payroll ceiling, not the one branch the report narrows to:
    // the drawer opens from a row of whichever branch the table showed.
    await assertPayrollCoversUser(this.prisma, performedById, userId);
    const { month, monthStart, nextMonthStart } = await resolveMonthlyScope(
```

**3g. `server/src/salary/teacher-timeline.service.ts`.** Replace:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
```
with:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions/permissions.service';
import { assertCallerMayTouchUser } from '../common/auth/user-branch-scope';
```
Replace:
```ts
 * Ordered by event time, descending. Powers the teacher profile
 * "Tarix" tab visible to CEO/BD/Administrator.
 */
@Injectable()
export class TeacherTimelineService {
  constructor(private prisma: PrismaService) {}

  async getTimeline(
    teacherId: number,
    companyId: number,
  ): Promise<TimelineEvent[]> {
    const [salaryVersions, groupHistory, entityHistory] = await Promise.all([
      this.prisma.employeeSalaryConfigVersion.findMany({
        where: { config: { userId: teacherId, companyId } },
        select: {
          id: true,
          salaryType: true,
          value: true,
          effectiveFrom: true,
          createdAt: true,
          config: {
            select: {
              groupId: true,
              group: { select: { name: true } },
            },
          },
          changedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
```
with:
```ts
 * Ordered by event time, descending. Powers the profile «Taymlayn» tab
 * (`teachers.view`: CEO, Branch Director and Administrator by default).
 *
 * Two limits, both on the caller. The employee must share a branch with them
 * (`assertCallerMayTouchUser`, the rule every other employee read uses). The
 * rate stream is read only for a caller holding `salary.view`: an
 * Administrator sees no salary (30.09.2026), so their timeline carries the
 * group and profile events alone.
 */
@Injectable()
export class TeacherTimelineService {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  async getTimeline(
    teacherId: number,
    companyId: number,
    performedById: number,
  ): Promise<TimelineEvent[]> {
    await assertCallerMayTouchUser(
      this.prisma,
      performedById,
      teacherId,
      "Bu yozuv boshqa filialga tegishli — tarixini ko'rish huquqingiz yo'q",
    );
    const showSalary = await this.permissions.has(performedById, 'salary.view');

    const [salaryVersions, groupHistory, entityHistory] = await Promise.all([
      showSalary
        ? this.prisma.employeeSalaryConfigVersion.findMany({
            where: { config: { userId: teacherId, companyId } },
            select: {
              id: true,
              salaryType: true,
              value: true,
              effectiveFrom: true,
              createdAt: true,
              config: {
                select: {
                  groupId: true,
                  group: { select: { name: true } },
                },
              },
              changedBy: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
```
(The refusal message is the one `entity-history-scope.ts` already uses for a record of another branch. The timeline is that employee's history. Nothing else in the file changes: the `for (const v of salaryVersions)` loop just sees an empty list.)

**3h. `server/src/salary/salary.service.ts` (facade).** Replace:
```ts
  // Config
  getConfig(userId: number, companyId: number) {
    return this.config.getConfig(userId, companyId);
  }
  getConfigsForUsers(userIds: number[], companyId: number) {
    return this.config.getConfigsForUsers(userIds, companyId);
  }
  getConfigHistory(userId: number, companyId: number) {
    return this.config.getHistory(userId, companyId);
  }
```
with:
```ts
  // Config — rate reads stay inside the caller's payroll scope.
  getConfig(userId: number, companyId: number, performedById: number) {
    return this.config.getConfig(userId, companyId, performedById);
  }
  getConfigsForUsers(
    userIds: number[],
    companyId: number,
    performedById: number,
  ) {
    return this.config.getConfigsForUsers(userIds, companyId, performedById);
  }
  getConfigHistory(userId: number, companyId: number, performedById: number) {
    return this.config.getHistory(userId, companyId, performedById);
  }
```
Replace:
```ts
  getAccruals(userId: number, companyId: number) {
    return this.accrual.getAccruals(userId, companyId);
  }
```
with:
```ts
  getAccruals(userId: number, companyId: number, performedById: number) {
    return this.accrual.getAccruals(userId, companyId, performedById);
  }
```
Replace:
```ts
  findPayments(query: SalaryPaymentQueryDto, companyId: number) {
    return this.payment.findPayments(query, companyId);
  }
```
with:
```ts
  findPayments(
    query: SalaryPaymentQueryDto,
    companyId: number,
    performedById: number,
  ) {
    return this.payment.findPayments(query, companyId, performedById);
  }
```

**3i. `server/src/salary/salary.controller.ts`.**

`me/accruals`: replace
```ts
  @Get('me/accruals')
  @AnyStaff()
  getMyAccruals(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }
```
with:
```ts
  @Get('me/accruals')
  @AnyStaff()
  getMyAccruals(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId, userId);
  }
```
`me/payments/:id/breakdown`: replace
```ts
    // asUserId enforces ownership — teacher only sees their own.
    return this.breakdownService.getPaymentBreakdown(id, companyId, userId);
```
with:
```ts
    // `ownerId` enforces ownership: the payee sees only their own payslip.
    return this.breakdownService.getPaymentBreakdown(id, companyId, {
      ownerId: userId,
    });
```
`config/:userId`: replace
```ts
  getConfig(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfig(userId, companyId);
  }
```
with:
```ts
  getConfig(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfig(userId, companyId, performedById);
  }
```
`configs/by-users`: replace
```ts
  getConfigsForUsers(
    @Query('userIds') userIdsParam: string | undefined,
    @CurrentUser('companyId') companyId: number,
  ) {
```
with:
```ts
  getConfigsForUsers(
    @Query('userIds') userIdsParam: string | undefined,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
```
and
```ts
    return this.salaryService.getConfigsForUsers(userIds, companyId);
```
with:
```ts
    return this.salaryService.getConfigsForUsers(
      userIds,
      companyId,
      performedById,
    );
```
`config-history/:userId`: replace
```ts
  getConfigHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfigHistory(userId, companyId);
  }
```
with:
```ts
  getConfigHistory(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getConfigHistory(
      userId,
      companyId,
      performedById,
    );
  }
```
`timeline/:userId`: replace
```ts
  getTimeline(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.timelineService.getTimeline(userId, companyId);
  }
```
with:
```ts
  getTimeline(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.timelineService.getTimeline(userId, companyId, performedById);
  }
```
`accruals/:userId`: replace
```ts
  // ACCRUALS — admin view of any teacher's accruals.
  // =========================================================================

  @Get('accruals/:userId')
  @Can('salary.view')
  getAccruals(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId);
  }
```
with:
```ts
  // ACCRUALS — a teacher's accruals, inside the caller's payroll scope.
  // =========================================================================

  @Get('accruals/:userId')
  @Can('salary.view')
  getAccruals(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getAccruals(userId, companyId, performedById);
  }
```
`payments`: replace
```ts
  findPayments(
    @Query() query: SalaryPaymentQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.findPayments(query, companyId);
  }
```
with:
```ts
  findPayments(
    @Query() query: SalaryPaymentQueryDto,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.findPayments(query, companyId, performedById);
  }
```
`payments/:id/breakdown`: replace
```ts
  getPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getPaymentBreakdown(id, companyId);
  }
```
with:
```ts
  getPaymentBreakdown(
    @Param('id') id: string,
    @CurrentUser('id') performedById: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.breakdownService.getPaymentBreakdown(id, companyId, {
      performedById,
    });
  }
```

**3j. Callers check.** Run:
`cd server && grep -rn "getAccruals(\|findPayments(\|getPaymentBreakdown(\|getConfigsForUsers(\|getConfigHistory(\|getTimeline(\|config\.getConfig(\|config\.getHistory(" src scripts --include='*.ts'`

Expected: only `salary.controller.ts`, `salary.service.ts`, the service definitions and the specs changed above. As of HEAD there is no Telegram, Excel export, report or script caller of any of these methods (`getSalaryLineItemsForPeriod`, which the Excel sheet uses, is a different method and is untouched). If a new caller shows up, pass it the acting user's id. A caller with no human user must get its own variant (server/CLAUDE.md «A write with no signed-in caller must SAY so»), not an optional parameter.

- [ ] **Step 4: Run the tests to verify they pass** (and the neighbours)

Run: `cd server && npx jest src/salary src/common/permissions`
Expected: PASS. The other salary specs (`salary.controller.spec.ts` markers, `salary.branch-selection.spec.ts`, the monthly, overview and staff specs) are unaffected. `src/common/permissions/route-access.spec.ts` still matches `route-access.snapshot.json`: no marker changed, so default access is unchanged.

- [ ] **Step 5: Manifest** — `server/src/common/auth/branch-route-policy.ts`

Replace the whole `BRANCH_SCOPED_BY_PAYROLL` block:
```ts
  {
    policy: 'BRANCH_SCOPED_BY_PAYROLL',
    reason:
      "Confined by `resolvePayrollBranchScope(performedById)` — the payee's " +
      "branch, not the viewer's selection. Fails CLOSED: a caller who is branch- " +
      'confined but has no branch attached sees and pays NOTHING. Two production ' +
      'Administrators were in exactly that state, and the old code collapsed it ' +
      'to "no filter", which let them `batchPay` every branch.',
    routes: [
      'GET /salary/accruals/:userId',
      'GET /salary/advance-calendar',
      'GET /salary/advances/:userId',
      'GET /salary/matrix',
      'GET /salary/monthly/user/:userId',
      'GET /salary/payments',
      'GET /salary/payments/:id/breakdown',
      'GET /salary/payments/settle-month/preview',
      'GET /salary/timeline/:userId',
      'PATCH /salary/payments/:id/approve',
      'POST /salary/payments/:id/pay',
      'POST /salary/payments/batch-pay',
      'POST /salary/payments/settle-month',
    ],
  },
```
with:
```ts
  {
    policy: 'BRANCH_SCOPED_BY_PAYROLL',
    reason:
      "Confined by `resolvePayrollBranchScope(performedById)` — the payee's " +
      "branch, not the viewer's selection. A list keeps only the employees " +
      "attached to the caller's branches; a read addressed by one employee or " +
      "one payment never returns another branch's payroll (403, or an empty " +
      'row from `/salary/monthly/user/:userId`), and yourself always; a ' +
      "payout stays on the caller's `mainBranch`. Fails CLOSED: a caller who " +
      'is branch-confined but has no branch attached sees and pays NOTHING. ' +
      'Two production Administrators were in exactly that state, and the old ' +
      'code collapsed it to "no filter", which let them `batchPay` every ' +
      'branch. Until 10.10.2026 the rate, accrual, advance, payment-list and ' +
      'payslip reads took no caller at all, and the matrix let an ' +
      'Administrator see every branch.',
    routes: [
      'GET /salary/accruals/:userId',
      'GET /salary/advance-calendar',
      'GET /salary/advances/:userId',
      'GET /salary/config-history/:userId',
      'GET /salary/config/:userId',
      'GET /salary/configs/by-users',
      'GET /salary/matrix',
      'GET /salary/monthly/user/:userId',
      'GET /salary/payments',
      'GET /salary/payments/:id/breakdown',
      'GET /salary/payments/settle-month/preview',
      'POST /salary/payments/:id/pay',
      'POST /salary/payments/batch-pay',
      'POST /salary/payments/settle-month',
    ],
  },
  {
    policy: 'BRANCH_SCOPED_BY_ENTITY',
    reason:
      "The profile's «Taymlayn» tab. It takes `teachers.view`, which the " +
      'Administrator holds, so it is confined by the RECORD rather than by ' +
      'payroll: the employee must share a branch with the caller ' +
      '(`assertCallerMayTouchUser`, the rule every other employee read uses, ' +
      'CEO everywhere), and the salary-rate events are left out (not even ' +
      'read) for a caller without `salary.view`, because an Administrator ' +
      'sees no salary (30.09.2026). Until 10.10.2026 it took no caller and ' +
      "returned any employee's rate history in the company.",
    routes: ['GET /salary/timeline/:userId'],
  },
```
Replace the whole COMPANY_WIDE salary block:
```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Company-level configuration, not branch data. Rate READS, editing an ' +
      'existing rate (`PATCH`, CEO-only — see the BRANCH_SCOPED_BY_ENTITY ' +
      'block above for the narrower `POST`), the company-wide bulk rate and ' +
      'the payroll cycle apply to the whole company by design (a rate is ' +
      'per employee, and the employee already carries a branch); `POST ' +
      '/salary/calculate` is cron-internal and settles every branch in one ' +
      'run, which is why it is CEO-only and has no UI trigger.',
    routes: [
      'GET /salary/config-history/:userId',
      'GET /salary/config/:userId',
      'GET /salary/configs/by-users',
      'GET /salary/period-preview',
      'GET /salary/period-settings',
      'PATCH /salary/config/:id',
      'POST /salary/calculate',
      'POST /salary/config/global',
      'POST /salary/period-settings',
    ],
  },
```
with:
```ts
  {
    policy: 'COMPANY_WIDE',
    reason:
      'Company-level configuration and the CEO-only payroll run, not branch ' +
      'data. Editing an existing rate (`PATCH`, CEO-only — see the ' +
      'BRANCH_SCOPED_BY_ENTITY block above for the narrower `POST`), the ' +
      'company-wide bulk rate and the payroll cycle apply to the whole ' +
      'company by design. `POST /salary/calculate` is cron-internal and ' +
      'settles every branch in one run, and `PATCH /salary/payments/:id/' +
      'approve` approves one row of that run; both take `salary.close`, ' +
      'which no role but the CEO holds by default. Rate READS left this ' +
      'block on 10.10.2026: they are payroll-confined now ' +
      '(BRANCH_SCOPED_BY_PAYROLL).',
    routes: [
      'GET /salary/period-preview',
      'GET /salary/period-settings',
      'PATCH /salary/config/:id',
      'PATCH /salary/payments/:id/approve',
      'POST /salary/calculate',
      'POST /salary/config/global',
      'POST /salary/period-settings',
    ],
  },
```
`UNREVIEWED_ROUTES` and `UNREVIEWED_BUDGET` stay unchanged, because none of these routes is in the list.

Then update `server/CLAUDE.md` («Salary Module»). In the **Roles** bullet replace:
```
except `timeline/:userId` (CEO/BD/Admin — the teacher profile «Taymlayn» tab),
```
with:
```
except `timeline/:userId` (CEO/BD/Admin — the teacher profile «Taymlayn» tab; confined to an employee who shares a branch with the caller, and its rate events go only to a caller holding `salary.view`, so an Administrator sees the group and profile events alone),
```
In the **Payroll branch scope** bullet replace:
```
`getMatrix` does not read this scope: it keeps its own hand-rolled `mainBranch` filter, unchanged by ADR-0058, and that filter does NOT fail closed — a Branch Director with no `mainBranch`, or one who also holds the Administrator role, sees every branch there (tracked as a separate security task). A plain Administrator no longer reaches it: `GET /salary/matrix` is CEO/BD since 2026-09-30.
```
with:
```
The lists that take no header — `getMatrix`, `findPayments`, `getConfigsForUsers` — filter by `payrollUserWhere(scope)` (the whole set, `mainBranch` or `UserBranch`) and return nothing for `none`; every read addressed by one employee or one payment (`/salary/accruals/:userId`, `/advances/:userId`, `/config/:userId`, `/config-history/:userId`, `/payments/:id/breakdown`) calls `assertPayrollCoversUser` first and answers 403 outside the set, yourself always. Until 10.10.2026 those reads took no caller, and the matrix kept a hand-rolled `mainBranch` filter that treated an Administrator as unscoped and a director with no `mainBranch` as every branch.
```

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts`
Expected: PASS. Every route is classified exactly once, no ghosts, every reason is longer than 80 characters, and the UNREVIEWED count is still ≤ 79.

- [ ] **Step 6: Lint, format, type-check**

```
cd server && npx prettier --write src/salary/shared/payroll-branch-scope.ts src/salary/shared/payroll-branch-scope.spec.ts src/salary/salary-payment.service.ts src/salary/salary-payment.service.spec.ts src/salary/salary-breakdown.service.ts src/salary/salary-breakdown.service.spec.ts src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts src/salary/salary-config.service.ts src/salary/salary-config.service.spec.ts src/salary/salary-monthly.service.ts src/salary/salary-monthly.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts src/salary/salary.service.ts src/salary/salary.controller.ts src/common/auth/branch-route-policy.ts
cd server && npx eslint src/salary/shared/payroll-branch-scope.ts src/salary/shared/payroll-branch-scope.spec.ts src/salary/salary-payment.service.ts src/salary/salary-payment.service.spec.ts src/salary/salary-breakdown.service.ts src/salary/salary-breakdown.service.spec.ts src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts src/salary/salary-config.service.ts src/salary/salary-config.service.spec.ts src/salary/salary-monthly.service.ts src/salary/salary-monthly.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts src/salary/salary.service.ts src/salary/salary.controller.ts src/common/auth/branch-route-policy.ts
cd server && npm run typecheck
cd server && npm test
```
Expected: Prettier rewrites at most line wrapping, and ESLint, the type-check and the full suite are clean. If Prettier changed anything, re-run Step 4's jest command once.

- [ ] **Step 7: Commit**

```
cd server && git add src/salary/shared/payroll-branch-scope.ts src/salary/shared/payroll-branch-scope.spec.ts src/salary/salary-payment.service.ts src/salary/salary-payment.service.spec.ts src/salary/salary-breakdown.service.ts src/salary/salary-breakdown.service.spec.ts src/salary/salary-accrual.service.ts src/salary/salary-accrual.service.spec.ts src/salary/salary-config.service.ts src/salary/salary-config.service.spec.ts src/salary/salary-monthly.service.ts src/salary/salary-monthly.service.spec.ts src/salary/teacher-timeline.service.ts src/salary/teacher-timeline.service.spec.ts src/salary/salary.service.ts src/salary/salary.controller.ts src/common/auth/branch-route-policy.ts CLAUDE.md
cd server && git commit -m "$(cat <<'EOF'
fix(salary): confine salary reads to the caller's payroll scope

Seven salary reads took no caller and served any employee's payroll in
the company: the payment list, a payslip, accruals, advances and the
three rate reads. The matrix treated an Administrator as unscoped and a
director with no mainBranch as every branch. All of them now use the
payroll scope (CEO everything; others mainBranch + UserBranch; nothing
when no branch is attached). A read of one employee or one payment
outside it answers 403, yourself always.

The teacher timeline is confined to an employee who shares a branch with
the caller and leaves out the rate events for a caller without
salary.view, so an Administrator sees no salary there.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Nobody but the CEO pays their own salary or writes an advance to themselves; an advance stays in its branch

CEO decision (10.10.2026): nobody but the CEO pays their OWN salary (`SalaryPayment.userId === caller`) or writes a `TEACHER_ADVANCE` to THEMSELVES. Another manager does it. An advance's recipient must also belong to the expense's branch, because the advance is settled against that person's payroll (`salary-calculation.service.ts` `applyPendingAdvances`). An advance in another branch puts the cash and the cost in branch X and the salary cut in branch Y.

Every path, checked:
- **`payPayment`.** The refusal goes in its non-CEO branch (`resolvePayrollBranchScope` returns `all` for the CEO only), before the payee lookup. The CEO's own row is still paid.
- **`batchPay`.** It is NOT all-or-nothing. It runs each payment through `payPayment` in its own `try/catch` and reports per row («Each payment is wrapped in its own transaction so a failure on one doesn't roll back the others»). The consistent behaviour is that the caller's own row comes back `FAILED` with the reason and the rest are paid. That needs no code in `batchPay` beyond a docblock line. Only `settle-month` is all-or-nothing, and it is not a `batchPay`. No client calls `batch-pay`.
- **`settle-month`** (`POST /salary/payments/settle-month`, `SalarySettleMonthService.settle`). The route is `@Can('salary.close')`. Its `defaultRoles` is `[]`, so in stage 1 only the CEO holds it, and the review's fragment keeps it locked for every role. The only possible caller is the CEO, and the CEO may settle their own row. **No change.** `SalarySettleAllocatedService` has no endpoint; only `scripts/settle-past-salary-months.ts --as=<CEO id>` uses it.
- **Advances.** `ExpensesService.create` (`assertAdvanceRecipient`) and `update` cover both cases: an existing advance edited (its recipient is fixed already, `relatedUserId` changes are refused with 400), or a plain expense turned into an advance. `update` also re-checks the recipient against the new branch when the advance moves branch. `remove` is included too: deleting your own advance keeps the cash and spares your salary the cut, which is the same self-dealing (see Notes).
- **The recipient-branch rule applies to the CEO as well.** It is a rule about the record, as with a group's course and room (server/CLAUDE.md «A group's course and room belong to the group's branch … a CEO included»). The CEO stays unrestricted as a caller: they span every branch, and the self rule does not apply to them. A CEO recipient (scope `all`) belongs to every branch.

**Files:**
- Modify: `server/src/salary/salary-payment.service.ts` (`payPayment` refusal; `batchPay` docblock)
- Modify: `server/src/expenses/expenses.service.ts` (`assertAdvanceRecipient`, two new private helpers, `create`, `update`, `remove`)
- Create: `client/src/components/payments/own-payroll.ts` (`isOwnPayrollLocked`)
- Modify: `client/src/components/payments/salary-advance-dialog.tsx` (omit the caller from the recipients)
- Modify: `client/src/components/payments/salary-advance-day-panel.tsx` (hide edit/delete on your own advance)
- Modify: `client/src/components/payments/salary-advance-breakdown-drawer.tsx` (hide edit/delete on your own advances)
- Modify: `client/src/components/payments/salary-breakdown-drawer.tsx` (hide «To'lash» on your own salary)
- Test: `server/src/salary/salary-payment.service.spec.ts`
- Test: `server/src/expenses/expenses.service.spec.ts`
- Test: `client/src/components/payments/own-payroll.test.ts`

**Interfaces:**
- Consumes:
  - `resolvePayrollBranchScope(prisma, performedById: number, opts?: { selfView?: boolean }): Promise<PayrollBranchScope>` (`server/src/salary/shared/payroll-branch-scope.ts`; `{ kind: 'all' }` only for the CEO)
  - `resolveCallerBranchScope(prisma, userId: number | undefined): Promise<{ kind: 'all' } | { kind: 'branches'; branchIds: number[] }>` (`server/src/common/auth/branch-scope.ts`; `all` only for the CEO; `branchIds` = `mainBranch ∪ UserBranch`; throws `ForbiddenException('Foydalanuvchi topilmadi')` for an unknown or archived user)
  - client: `useAuth((s) => s.user)` (`@/hooks/use-auth`, `AuthUser.roles: { id, name }[]`)
- Produces: client `isOwnPayrollLocked(payeeId: number | null | undefined, user: { id: number; roles: { id: number }[] } | null | undefined): boolean`. No server signature changes: `assertAdvanceRecipient` is private and has two callers, both in this file.

- [ ] **Step 1: Write the failing tests**

**1a. `server/src/salary/salary-payment.service.spec.ts`.** Replace the end of the file:
```ts
      ).rejects.toThrow(/asosiy filialingiz belgilanmagan/);
      expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
    });
  });
});
```
with
```ts
      ).rejects.toThrow(/asosiy filialingiz belgilanmagan/);
      expect(prisma.salaryPayment.findMany).not.toHaveBeenCalled();
    });
  });

  // CEO decision (10.10.2026): nobody but the CEO pays their own salary.
  describe('your own salary', () => {
    const DIRECTOR_ID = 10012;
    const director = {
      mainBranch: 1,
      branches: [],
      roles: [{ role: { name: 'Branch Director' } }],
    };
    const approved = (id: string, userId: number) => ({
      id,
      userId,
      amount: 1_000_000,
      status: 'APPROVED',
      companyId: 1,
    });

    it('refuses a director paying their own salary, writing nothing', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(director);
      prisma.salaryPayment.findFirst.mockResolvedValue(
        approved('sp-own', DIRECTOR_ID),
      );

      await expect(
        service.payPayment('sp-own', DIRECTOR_ID, 1),
      ).rejects.toThrow(/boshqa rahbar to'laydi/);
      expect(transactions.recordSalaryPayment).not.toHaveBeenCalled();
      expect(prisma.salaryPayment.update).not.toHaveBeenCalled();
    });

    it('lets the CEO pay their own salary', async () => {
      // The default caller of this file is a CEO.
      prisma.salaryPayment.findFirst.mockResolvedValue(approved('sp-ceo', 999));

      await service.payPayment('sp-ceo', 999, 1);

      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 999 }),
      );
    });

    it("batchPay reports the director's own row as failed and pays the rest", async () => {
      prisma.user.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === DIRECTOR_ID ? director : { mainBranch: 1 }),
      );
      prisma.salaryPayment.findMany.mockResolvedValue([
        { id: 'sp-own', userId: DIRECTOR_ID, amount: 1_000_000 },
        { id: 'sp-555', userId: 555, amount: 1_000_000 },
      ]);
      prisma.salaryPayment.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(
          approved(where.id, where.id === 'sp-own' ? DIRECTOR_ID : 555),
        ),
      );

      const out = await service.batchPay({ companyId: 1 } as any, DIRECTOR_ID);

      expect(out).toMatchObject({ total: 2, paid: 1, failed: 1 });
      expect(out.results.find((r) => r.id === 'sp-own')).toMatchObject({
        status: 'FAILED',
        error: expect.stringMatching(/boshqa rahbar to'laydi/),
      });
      expect(transactions.recordSalaryPayment).toHaveBeenCalledTimes(1);
      expect(transactions.recordSalaryPayment).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 555 }),
      );
    });
  });
});
```

**1b. `server/src/expenses/expenses.service.spec.ts`.** The imports already have `BadRequestException`, `ForbiddenException`, `ExpenseCategory` and `ExpensePaymentMethod`. Replace the end of the file:
```ts
      await expect(
        service.update('exp-plain-2', { amount: 200 } as any, 42, COMPANY_ID),
      ).resolves.toBeDefined();
    });
  });
});
```
with
```ts
      await expect(
        service.update('exp-plain-2', { amount: 200 } as any, 42, COMPANY_ID),
      ).resolves.toBeDefined();
    });
  });

  /**
   * CEO decision (10.10.2026): an advance to yourself is written, changed and
   * deleted by another manager; only the CEO handles their own. The advance is
   * also booked in a branch its recipient belongs to, because it is settled
   * against that person's payroll.
   */
  describe('own advances and the recipient branch', () => {
    const CEO_ROW = {
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    };
    // Keyed by user id. One mock answers both the existence lookup and the
    // branch-scope lookup (Prisma's `select` is not applied by a mock).
    const people: Record<number, object> = {
      1: { id: 1, ...CEO_ROW },
      42: {
        id: 42,
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Branch Director' } }],
      },
      10005: {
        id: 10005,
        mainBranch: 1,
        branches: [],
        roles: [{ role: { name: 'Teacher' } }],
      },
      10007: {
        id: 10007,
        mainBranch: 2,
        branches: [],
        roles: [{ role: { name: 'Teacher' } }],
      },
    };
    const advanceDto = (relatedUserId: number) =>
      ({
        category: ExpenseCategory.TEACHER_ADVANCE,
        paymentMethod: ExpensePaymentMethod.CASH,
        amount: 500_000,
        description: 'Avans',
        date: '2026-10-10',
        branchId: 1,
        relatedUserId,
      }) as any;
    const advanceRow = (relatedUserId: number) => ({
      id: 'adv-1',
      category: ExpenseCategory.TEACHER_ADVANCE,
      amount: 500_000,
      branchId: 1,
      companyId: COMPANY_ID,
      deletedAt: null,
      relatedUserId,
      settledBySalaryPaymentId: null,
    });

    beforeEach(() => {
      prisma.user.findFirst.mockImplementation(({ where }: any) =>
        Promise.resolve(people[where.id] ?? null),
      );
    });
    afterEach(() => {
      // `clearAllMocks` keeps implementations: put the file's default back.
      prisma.user.findFirst.mockResolvedValue(CEO_ROW);
    });

    it('refuses a director writing an advance to themselves', async () => {
      await expect(
        service.create(advanceDto(42), 42, COMPANY_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets the CEO write an advance to themselves', async () => {
      prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

      await service.create(advanceDto(1), 1, COMPANY_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("refuses a recipient who is not in the expense's branch", async () => {
      await expect(
        service.create(advanceDto(10007), 42, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a director write an advance to a teacher of their branch', async () => {
      prisma.$transaction.mockResolvedValueOnce({ id: 'adv-new' });

      await service.create(advanceDto(10005), 42, COMPANY_ID);

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses a director changing their own advance', async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(42));

      await expect(
        service.update('adv-1', { amount: 600_000 } as any, 42, COMPANY_ID),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a director deleting their own advance', async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(42));

      await expect(service.remove('adv-1', 42, COMPANY_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses moving an advance to a branch its recipient is not in, even for the CEO", async () => {
      prisma.expense.findFirst.mockResolvedValue(advanceRow(10005));

      await expect(
        service.update('adv-1', { branchId: 2 } as any, 1, COMPANY_ID),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses turning a plain expense into an advance to yourself', async () => {
      prisma.expense.findFirst.mockResolvedValue({
        ...advanceRow(0),
        category: ExpenseCategory.RENT,
        relatedUserId: null,
      });

      await expect(
        service.update(
          'adv-1',
          { category: ExpenseCategory.TEACHER_ADVANCE, relatedUserId: 42 } as any,
          42,
          COMPANY_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
```

**1c. Create `client/src/components/payments/own-payroll.test.ts`:**
```ts
import { describe, expect, it } from "vitest";
import { isOwnPayrollLocked } from "./own-payroll";

const DIRECTOR = { id: 10012, roles: [{ id: 2 }] };
const CEO = { id: 10001, roles: [{ id: 1 }] };

describe("isOwnPayrollLocked", () => {
  it("never locks someone else's row", () => {
    expect(isOwnPayrollLocked(10500, DIRECTOR)).toBe(false);
  });

  it("locks a non-CEO's own row", () => {
    expect(isOwnPayrollLocked(10012, DIRECTOR)).toBe(true);
  });

  it("leaves the CEO's own row open, whatever else they hold", () => {
    expect(isOwnPayrollLocked(10001, CEO)).toBe(false);
    expect(
      isOwnPayrollLocked(10001, { id: 10001, roles: [{ id: 4 }, { id: 1 }] }),
    ).toBe(false);
  });

  it("locks nothing before the session or the payee is known", () => {
    expect(isOwnPayrollLocked(10012, null)).toBe(false);
    expect(isOwnPayrollLocked(undefined, DIRECTOR)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**
Run: `cd server && npx jest src/salary/salary-payment.service.spec.ts src/expenses/expenses.service.spec.ts`
Expected: FAIL.
- `refuses a director paying their own salary` resolves: the payee lookup matches the home branch, and the salary is paid.
- In `batchPay reports …`, `paid` is 2.
- In `expenses.service.spec.ts`, the six refusal tests fail because the request reaches `$transaction`. For `remove`, the ledger lookup runs as well.
- The two «lets …» tests already pass. That is expected.

Run: `cd client && npx vitest run src/components/payments/own-payroll.test.ts` (if vitest reports a configLoader error, use the variant from the global constraints).
Expected: FAIL. The import `./own-payroll` cannot be resolved.

- [ ] **Step 3: Implement**

**`server/src/salary/salary-payment.service.ts`.**
1. In `payPayment`, replace
```ts
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind !== 'all') {
      const payee = await this.prisma.user.findUnique({
```
with
```ts
    const scope = await resolvePayrollBranchScope(this.prisma, performedById);
    if (scope.kind !== 'all') {
      // CEO decision (10.10.2026): nobody but the CEO pays their own salary;
      // another manager does. `batchPay` comes through here too, so a
      // caller's own row in a batch is reported FAILED with this reason.
      if (payment.userId === performedById) {
        throw new ForbiddenException(
          "Bu sizning oyligingiz — uni o'zingiz to'lay olmaysiz. Oylikni boshqa rahbar to'laydi.",
        );
      }
      const payee = await this.prisma.user.findUnique({
```
2. In `batchPay`'s docblock, replace
```ts
   * so a failure on one doesn't roll back the others — the caller sees per-
   * payment success/error.
   */
```
with
```ts
   * so a failure on one doesn't roll back the others — the caller sees per-
   * payment success/error. A non-CEO caller's own payment is one such
   * failure: `payPayment` refuses it (CEO decision, 10.10.2026).
   */
```

**`server/src/expenses/expenses.service.ts`.**
1. Replace
```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```
with
```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
```
2. Replace
```ts
import { assertCallerInBranch } from '../common/auth/branch-scope';
```
with
```ts
import {
  assertCallerInBranch,
  resolveCallerBranchScope,
} from '../common/auth/branch-scope';
```
3. Replace
```ts
const METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  CASH: 'Naqt',
  CARD: 'Karta',
};
```
with
```ts
const METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  CASH: 'Naqt',
  CARD: 'Karta',
};

// CEO decision (10.10.2026): an advance to yourself is written, changed and
// deleted by another manager; only the CEO handles their own.
const OWN_ADVANCE_REFUSAL =
  "O'zingizga yozilgan avansni o'zingiz yoza, o'zgartira yoki o'chira olmaysiz — buni boshqa rahbar qiladi.";

// An advance is settled against its recipient's payroll, so it is booked in a
// branch the recipient belongs to.
const RECIPIENT_OTHER_BRANCH =
  "Bu xodim tanlangan filialga biriktirilmagan — avansni xodimning o'z filialida yozing.";
```
4. Replace the whole `assertAdvanceRecipient` method:
```ts
  private async assertAdvanceRecipient(
    relatedUserId: number | null | undefined,
    companyId: number,
  ): Promise<void> {
    if (!relatedUserId) {
      throw new BadRequestException('Avans uchun xodimni tanlang');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: relatedUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Xodim topilmadi');
    }
  }
```
with
```ts
  private async assertAdvanceRecipient(
    relatedUserId: number | null | undefined,
    branchId: number,
    userId: number,
    companyId: number,
  ): Promise<void> {
    if (!relatedUserId) {
      throw new BadRequestException('Avans uchun xodimni tanlang');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: relatedUserId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('Xodim topilmadi');
    }
    await this.assertNotOwnAdvance(relatedUserId, userId);
    await this.assertRecipientInBranch(relatedUserId, branchId);
  }

  /**
   * Your own advance is written, changed and deleted by another manager
   * (CEO decision, 10.10.2026). The CEO is the one caller whose scope is
   * `all`, and the only one who may handle their own.
   */
  private async assertNotOwnAdvance(
    recipientId: number | null,
    userId: number,
  ): Promise<void> {
    if (recipientId !== userId) return;
    const scope = await resolveCallerBranchScope(this.prisma, userId);
    if (scope.kind !== 'all') {
      throw new ForbiddenException(OWN_ADVANCE_REFUSAL);
    }
  }

  /**
   * The advance is settled against the recipient's payroll, so their
   * `mainBranch ∪ UserBranch` must include the expense's branch. Otherwise
   * one branch's kassa and P&L carry it while another branch's payroll is
   * cut. A rule about the record, so the CEO is held to it too; a CEO
   * recipient spans every branch.
   */
  private async assertRecipientInBranch(
    recipientId: number,
    branchId: number,
  ): Promise<void> {
    const scope = await resolveCallerBranchScope(this.prisma, recipientId);
    if (scope.kind === 'branches' && !scope.branchIds.includes(branchId)) {
      throw new BadRequestException(RECIPIENT_OTHER_BRANCH);
    }
  }
```
5. In `create`, replace
```ts
    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(dto.relatedUserId, companyId);
    }

    // Atomic: expense row + ledger entry are all-or-nothing.
```
with
```ts
    if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(
        dto.relatedUserId,
        dto.branchId,
        userId,
        companyId,
      );
    }

    // Atomic: expense row + ledger entry are all-or-nothing.
```
6. In `update`, replace
```ts
      if (
        dto.relatedUserId !== undefined &&
        dto.relatedUserId !== existing.relatedUserId
      ) {
        throw new BadRequestException(
          "Avansning xodimini almashtirib bo'lmaydi — o'chirib, to'g'ri xodimga yangi avans yozing",
        );
      }
    } else if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(dto.relatedUserId, companyId);
    }
```
with
```ts
      if (
        dto.relatedUserId !== undefined &&
        dto.relatedUserId !== existing.relatedUserId
      ) {
        throw new BadRequestException(
          "Avansning xodimini almashtirib bo'lmaydi — o'chirib, to'g'ri xodimga yangi avans yozing",
        );
      }
      await this.assertNotOwnAdvance(existing.relatedUserId, userId);
      // Moving the advance to another branch must keep it in its recipient's.
      if (
        existing.relatedUserId != null &&
        dto.branchId != null &&
        dto.branchId !== existing.branchId
      ) {
        await this.assertRecipientInBranch(
          existing.relatedUserId,
          dto.branchId,
        );
      }
    } else if (dto.category === ExpenseCategory.TEACHER_ADVANCE) {
      await this.assertAdvanceRecipient(
        dto.relatedUserId,
        dto.branchId ?? existing.branchId,
        userId,
        companyId,
      );
    }
```
7. In `remove`, replace
```ts
    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);
    }

    // Find the associated EXPENSE ledger entry so we can reverse it.
```
with
```ts
    if (existing.category === ExpenseCategory.TEACHER_ADVANCE) {
      this.assertAdvanceUnsettled(existing);
      // Deleting your own advance keeps the cash and spares your salary the
      // cut: another manager's job too.
      await this.assertNotOwnAdvance(existing.relatedUserId, userId);
    }

    // Find the associated EXPENSE ledger entry so we can reverse it.
```

**Create `client/src/components/payments/own-payroll.ts`:**
```ts
/**
 * CEO decision (10.10.2026): nobody but the CEO pays their own salary or
 * writes, changes or deletes an advance to themselves — another manager does.
 * The server refuses it (`SalaryPaymentService.payPayment`,
 * `ExpensesService`); this keeps the screen from offering it.
 *
 * Role id 1 is the CEO: an identity question, like the all-branches switcher.
 */
export function isOwnPayrollLocked(
  payeeId: number | null | undefined,
  user: { id: number; roles: { id: number }[] } | null | undefined,
): boolean {
  if (!user || payeeId == null || payeeId !== user.id) return false;
  return !user.roles.some((r) => r.id === 1);
}
```

**`client/src/components/payments/salary-advance-dialog.tsx`.**
1. Replace `import { useBranchSwitcher } from "@/hooks/use-branch-switcher";` with
```tsx
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useAuth } from "@/hooks/use-auth";
```
2. Replace `import type { EditableAdvance } from "./advance-row-actions";` with
```tsx
import type { EditableAdvance } from "./advance-row-actions";
import { isOwnPayrollLocked } from "./own-payroll";
```
3. Replace `  const { selectedBranch } = useBranchSwitcher();` with
```tsx
  const { selectedBranch } = useBranchSwitcher();
  const user = useAuth((s) => s.user);
```
4. Replace
```tsx
                <EmployeeAdvanceSelect
                  value={relatedUserId}
                  onChange={setRelatedUserId}
                  employees={employees ?? []}
                  loading={employeesLoading}
                />
```
with
```tsx
                <EmployeeAdvanceSelect
                  value={relatedUserId}
                  onChange={setRelatedUserId}
                  employees={(employees ?? []).filter(
                    (e) => !isOwnPayrollLocked(e.id, user),
                  )}
                  loading={employeesLoading}
                />
```

**`client/src/components/payments/salary-advance-day-panel.tsx`.**
1. Replace `import { formatBalance, formatPrice } from "@/lib/format-utils";` with
```tsx
import { formatBalance, formatPrice } from "@/lib/format-utils";
import { useAuth } from "@/hooks/use-auth";
```
2. Replace
```tsx
  type EditableAdvance,
} from "./advance-row-actions";
```
with
```tsx
  type EditableAdvance,
} from "./advance-row-actions";
import { isOwnPayrollLocked } from "./own-payroll";
```
3. The hook must run before the early return. Replace
```tsx
  onDelete: (a: EditableAdvance) => void;
}) {
  if (date === null) {
```
with
```tsx
  onDelete: (a: EditableAdvance) => void;
}) {
  const user = useAuth((s) => s.user);
  if (date === null) {
```
4. Replace
```tsx
                  {canPay && (
                    <AdvanceRowActions
                      advance={toEditable(a)}
```
with
```tsx
                  {canPay && !isOwnPayrollLocked(a.user.id, user) && (
                    <AdvanceRowActions
                      advance={toEditable(a)}
```

**`client/src/components/payments/salary-advance-breakdown-drawer.tsx`.**
1. Replace `import api from "@/lib/api";` with
```tsx
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
```
2. Replace `import { SalaryDeleteAdvanceDialog } from "./salary-delete-advance-dialog";` with
```tsx
import { SalaryDeleteAdvanceDialog } from "./salary-delete-advance-dialog";
import { isOwnPayrollLocked } from "./own-payroll";
```
3. Replace `  const advances = data?.advances ?? [];` with
```tsx
  const advances = data?.advances ?? [];
  const user = useAuth((s) => s.user);
  // Your own advance is changed or deleted by another manager (CEO, 10.10.2026).
  const canEditRows = canPay && !isOwnPayrollLocked(target?.userId, user);
```
4. Replace `                      {canPay && <TableHead className="w-20" />}` with `                      {canEditRows && <TableHead className="w-20" />}`.
5. Replace
```tsx
                        {canPay && (
                          <TableCell className="text-right">
```
with
```tsx
                        {canEditRows && (
                          <TableCell className="text-right">
```

**`client/src/components/payments/salary-breakdown-drawer.tsx`.**
1. Replace `import { PossibleDeductionsInfo } from "./possible-deductions-info";` with
```tsx
import { PossibleDeductionsInfo } from "./possible-deductions-info";
import { isOwnPayrollLocked } from "./own-payroll";
```
2. Replace `import api from "@/lib/api";` with
```tsx
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
```
3. Replace
```tsx
    enabled: !!salaryPaymentId,
  });

  const runAction = async (
```
with
```tsx
    enabled: !!salaryPaymentId,
  });
  const user = useAuth((s) => s.user);
  // Your own salary is paid by another manager (CEO, 10.10.2026).
  const mayPay = canPay && !isOwnPayrollLocked(data?.payment.userId, user);

  const runAction = async (
```
4. Replace `            (data.payment.status === "APPROVED" && canPay) ||` with `            (data.payment.status === "APPROVED" && mayPay) ||`.
5. Replace `              {data.payment.status === "APPROVED" && canPay && (` with `              {data.payment.status === "APPROVED" && mayPay && (`.

- [ ] **Step 4: Run the tests to verify they pass** (+ any other affected spec)
Run: `cd server && npx jest src/salary src/expenses`
Expected: PASS.
Run: `cd client && npx vitest run src/components/payments`
Expected: PASS. `salary-breakdown-drawer.test.ts` imports the drawer module and must still load with the new `useAuth` import.

- [ ] **Step 5: Manifest**
No change: no route moves. `POST|PATCH|DELETE /expenses*` and the salary pay routes keep their blocks, and both reasons stay true.

- [ ] **Step 6: Lint, format, type-check**
```bash
cd server
npx prettier --write src/salary/salary-payment.service.ts src/salary/salary-payment.service.spec.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts
npx eslint src/salary/salary-payment.service.ts src/salary/salary-payment.service.spec.ts src/expenses/expenses.service.ts src/expenses/expenses.service.spec.ts
npm run typecheck
npm test
cd ../client
npx tsc --noEmit
npm run lint 2>&1 | tail -20
```
Expected: no ESLint errors on either side (read the `✖ N problems (X errors, …)` line), typecheck clean, the full server suite green. Do not run Prettier on `client/` files.

- [ ] **Step 7: Commit**
```bash
cd /Users/a1111/Desktop/daf-erp-system/.claude/worktrees/ruxsatlar-tizimi
git add server/src/salary/salary-payment.service.ts server/src/salary/salary-payment.service.spec.ts server/src/expenses/expenses.service.ts server/src/expenses/expenses.service.spec.ts client/src/components/payments/own-payroll.ts client/src/components/payments/own-payroll.test.ts client/src/components/payments/salary-advance-dialog.tsx client/src/components/payments/salary-advance-day-panel.tsx client/src/components/payments/salary-advance-breakdown-drawer.tsx client/src/components/payments/salary-breakdown-drawer.tsx
git commit -m "$(cat <<'EOF'
fix(salary): only the CEO pays their own salary or writes their own advance

CEO decision (10.10.2026): another manager pays your salary and writes,
changes or deletes your advance; the CEO alone may handle their own. A
batch pay reports the caller's own row as failed and pays the rest. An
advance must also be booked in a branch its recipient belongs to, since it
is settled against that person's payroll. The salary page no longer offers
these actions on the caller's own rows.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

---

### Task 10: ADR, access document and user guide

**Files:**
- Create: `docs/adr/00NN-filial-chegarasi-qoidalari.md` (NN = next free number on `origin/main`)
- Modify: `docs/adr/README.md` (index row)
- Modify: `docs/role-access.md`
- Modify: `server/CLAUDE.md` («Branch state»)
- Modify: `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`, `client/src/qollanma/kontent/boshlash/lugat.mdx`, `client/src/qollanma/kontent/davomat/eslatmalar.mdx`, `client/src/qollanma/sahifalar/boshlash.ts`, `client/src/qollanma/sahifalar/guruhlar.ts`, `client/src/qollanma/yangiliklar.ts`

**Interfaces:** none. Tasks 2 and 8 already updated `server/CLAUDE.md` «Holidays» and «Salary Module», `client/CLAUDE.md` and the `bayramlar` guide page; do not repeat them.

- [ ] **Step 1: Pick the number**

Run: `git fetch origin main && git show origin/main:docs/adr/README.md | grep -oE '^\| \[0[0-9]{3}\]' | tail -3` and `gh pr list --state open --json number,title,files --jq '.[] | select(.files[].path | test("docs/adr/0")) | .number'`
Use the next number after the highest on `main` that no open PR has taken (0080 if free). Replace `00NN` everywhere in this task.

- [ ] **Step 2: Write the ADR** (Uzbek, the template of `docs/adr/0000-shablon.md`):

```markdown
# ADR-00NN — Filial chegarasi: bayram filialga tegishli, filialni faqat CEO ochadi, o'z oyligini o'zi to'lamaydi

**Holati:** Qabul qilindi
**Sana:** 2026-10-10
**Bog'liq:** ADR-0002, ADR-0034, ADR-0058, ADR-0079, `server/src/common/auth/branch-route-policy.ts`

## Kontekst

«Ruxsatlar» sahifasidan oldin har bir imkoniyat qaysi rolga berilishi mumkinligi ko'rib chiqildi (10.10.2026). Ko'rik bugungi saytda filial chegarasidan o'tadigan yo'llarni topdi: filial direktori yoki administrator boshqa filial o'quvchisining balansini tuzata olardi, boshqa filialning guruh jadvali, lid izohlari, oylik ro'yxati va ustoz stavkalarini ko'ra olardi. Har qanday bayram butun markazga yozilardi va boshqa filial guruhlarining tugash sanasini surardi. Filial direktori yangi filial ocha olardi va o'z oyligini o'zi «to'landi» deb belgilay olardi.

## Qaror

1. **Bayram filialga tegishli bo'lishi mumkin.** Butun markazga bayramni (`branchId` bo'sh) faqat CEO qo'yadi, tahrirlaydi, bekor qiladi va o'chiradi. Filial direktori va administrator bayramni faqat o'z filialiga qo'yadi. Bayram faqat o'zi tegishli filial guruhlariga ta'sir qiladi.
2. **Yangi filialni faqat CEO ochadi.** Filial direktori o'z filialini tahrirlaydi, yangisini ocha olmaydi.
3. **Hech kim (CEO'dan boshqa) o'z oyligini to'lamaydi va o'ziga avans yozmaydi.** Buni boshqa rahbar qiladi. Avans oluvchi xarajat yozilgan filialga biriktirilgan bo'lishi shart.
4. **Id bilan ochiladigan har bir yozuv yo'li chaqiruvchining filialini tekshiradi.** Mavjud yordamchilar ishlatiladi (`@BranchScope()`, `assertCallerInBranch`, `assertCallerMayTouchStudent`, `assertCallerMayTouchGroup`, `resolvePayrollBranchScope`). `branch-route-policy.ts` dagi «ko'rib chiqilmagan» ro'yxati 79 tadan 7 taga tushdi; qolgan 7 tasi faqat CEO'ga ochiq imkoniyatlarga tegishli (arxiv, to'lov tizimlari jurnali, Telegram guruhini uzish).

## Ko'rib chiqilgan muqobillar

- **Bayramni hozirgidek hamma butun markazga qo'yadi.** Rad etildi (CEO, 10.10): bir filial xodimi boshqa filial jadvalini, davomatini va oylik hisobini o'zgartirib qo'yardi.
- **Bo'shliqlarni «Ruxsatlar» sahifasi bilan birga yopish.** Rad etildi (CEO, 10.10): bo'shliqlar bugun ishlaydi, ular alohida va tezroq chiqadi.

## Oqibatlari

- Administrator butun markaz bayramini (Navro'z kabi) endi kirita olmaydi; uni CEO kiritadi.
- Bir nechta filialga biriktirilgan, CEO bo'lmagan xodim Excel hisobotini bitta filial bo'yicha oladi.
- «Ruxsatlar» sahifasida imkoniyatlarni yangi rolga ochish shu tekshiruvlarga tayanadi: qolgan 7 ta yo'lga tegishli imkoniyatlar faqat CEO'da qoladi.
```

Add the index row at the end of the table in `docs/adr/README.md`, in the format of the rows above it:
```markdown
| [00NN](00NN-filial-chegarasi-qoidalari.md) | Filial chegarasi: bayram filialga tegishli, filialni faqat CEO ochadi, o'z oyligini o'zi to'lamaydi | Qabul qilindi | 2026-10-10 |
```

- [ ] **Step 3: `docs/role-access.md`**

Add these rows to the first «Action | CEO | Branch Director | Administrator | Teacher | Cashier» table (keep its column order), right after the «Pay salary» / «Batch pay salary» rows:
```markdown
| Pay one's own salary or write an advance to oneself | Yes | No — another manager does it (ADR-00NN) | No | No | No |
| Create a holiday for the whole centre | Yes | No (ADR-00NN) | No | No | No |
| Create a holiday for one branch | Yes | Own branch | Own branch | No | No |
| Open a new branch | Yes | No (ADR-00NN) | No | No | No |
```
Then add one bullet under the table's notes:
```markdown
- **Branch boundary (ADR-00NN):** every id-addressed read or write checks the record's branch against the caller (`mainBranch ∪ UserBranch`; the CEO spans all). `server/src/common/auth/branch-route-policy.ts` lists each route's confinement; its UNREVIEWED backlog is 7 routes, all behind CEO-only capabilities.
```

- [ ] **Step 4: `server/CLAUDE.md` «Branch state»**

After the bullet that starts «**A branch's state is `Branch.status`**», add:
```markdown
- **Only the CEO opens a branch (ADR-00NN).** `BranchesService.create` refuses anyone else with 403, whatever capability they hold; a Branch Director edits and changes the status of their own branch only (`assertCallerMayTouchBranch`).
```

- [ ] **Step 5: User guide**

`client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx`, table «Kim qila oladi»: replace the row
```markdown
| Bayram (dam olish kuni) qo'shish | Ha | Ha | Ha | — | — |
```
with
```markdown
| Butun markazga bayram (dam olish kuni) qo'shish | Ha | — | — | — | — |
| O'z filialiga bayram qo'shish | Ha | Ha | Ha | — | — |
| Yangi filial ochish | Ha | — | — | — | — |
| O'z oyligini to'lash yoki o'ziga avans yozish | Ha | — | — | — | — |
```

`client/src/qollanma/kontent/boshlash/lugat.mdx`: replace
```markdown
- **Bayram (dam olish kunlari)** — butun markaz uchun dars bo'lmaydigan kunlar; Sozlamalar → «Dam olish kunlari» da kiritiladi. Bayramga tushgan darslar guruh oxiriga suriladi.
```
with
```markdown
- **Bayram (dam olish kunlari)** — dars bo'lmaydigan kunlar; Sozlamalar → «Dam olish kunlari» da kiritiladi. Bayram butun markazga (uni faqat CEO qo'yadi) yoki bitta filialga tegishli bo'ladi. Bayramga tushgan darslar guruh oxiriga suriladi.
```

`client/src/qollanma/kontent/davomat/eslatmalar.mdx`: replace «Bayramlar Sozlamalar → «Dam olish kunlari»da kiritiladi va butun markazga tegishli.» with «Bayramlar Sozlamalar → «Dam olish kunlari»da kiritiladi; bayram butun markazga yoki bitta filialga tegishli bo'ladi va faqat o'sha filial guruhlariga ta'sir qiladi.»

`client/src/qollanma/sahifalar/boshlash.ts`: in the `rollar-va-huquqlar` entry add `"00NN"` to `adr`, add `"yangi filial"` and `"o'z oyligi"` to `kalitSozlar`, and set `yangilangan` to today's date. In `client/src/qollanma/sahifalar/guruhlar.ts` add `"00NN"` to the `bayramlar` entry's `adr`.

`client/src/qollanma/yangiliklar.ts`: add one entry at the top of the array:
```ts
  {
    sana: "2026-10-10",
    sarlavha: "Filial chegarasi mustahkamlandi",
    matn: "Filial direktori va administrator endi faqat o'z filialining ma'lumotini ko'radi va o'zgartiradi: o'quvchi balansini tuzatish, guruh jadvali, lidlar, oylik ro'yxati va ustoz stavkalari boshqa filial bo'yicha ochilmaydi. Yangi filialni faqat CEO ochadi. O'z oyligini «to'landi» deb belgilash va o'ziga avans yozishni endi boshqa rahbar qiladi. Ustoz stavkalari taymlaynda faqat oylikni ko'radiganlarga ko'rinadi.",
    rollar: [1, 2, 3],
    sahifa: { bolim: "boshlash", sahifa: "rollar-va-huquqlar" },
  },
```

- [ ] **Step 6: Check**

Run: `cd client && npx vitest run src/qollanma`
Expected: PASS (registry: the new entry is on top, dated today, its page exists, every `adr` number has a file).

- [ ] **Step 7: Commit**

```bash
git add docs/adr docs/role-access.md server/CLAUDE.md client/src/qollanma
git commit -m "docs(branch): ADR-00NN branch-boundary rules; access table and user guide

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification, each role in the browser, PR

**Files:** none (verification); PR text.

- [ ] **Step 1: Server, whole suite**

Run: `cd server && npm test && npm run typecheck && npx eslint src 2>&1 | tail -3 && npm run build`
Expected: all PASS; ESLint `0 errors`; build succeeds.

- [ ] **Step 2: Client, whole suite**

Run: `cd client && npx vitest run && npx tsc --noEmit && npm run lint 2>&1 | tail -3 && npx next build 2>&1 | tail -10`
Expected: all PASS; 0 lint errors; build succeeds.

- [ ] **Step 3: Manifest**

Run: `cd server && npx jest src/common/auth/branch-route-policy.spec.ts src/common/permissions`
Expected: PASS; `UNREVIEWED_BUDGET` is 7 and `UNREVIEWED_ROUTES` holds exactly the five archive routes, `GET /gateways/events` and `DELETE /telegram-groups/:id`.

- [ ] **Step 4: Each role in the browser (local, dev database, read-only)**

Follow the memory notes «Lokal: rol» and «backend sekin» (dev DB host `ep-nameless-wildflower` only; `CRONS_ENABLED=false`, both Telegram tokens blank, a Redis stand-in on 6390; minted dev JWTs, never a typed password). As a Branch Director (10407) and an Administrator (10408) of branch 1, call with their tokens and expect a refusal or an empty/own-branch answer:
- `GET /api/groups/available-teachers?branchId=<branch 2>` → 403;
- `GET /api/leads/<a branch-2 lead id>/hover-summary` → 404;
- `GET /api/refunds/preview/<a branch-2 student id>` → 403;
- `GET /api/salary/payments` (director) → only branch-1 payroll;
- `GET /api/company/<id>` → no `branches`/`courses` keys.
Then open `/settings/holidays` as the director: the create form offers no «Butun markaz», and a centre-wide holiday row shows no actions; as the CEO the form offers «Butun markaz». Do NOT submit any form against the shared dev database.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin filial-chegarasi
gh pr create --base main --head filial-chegarasi --title "Branch boundary: close cross-branch reads and writes; branch holidays, CEO-only branch creation, no self-pay" --body-file <scratch file>
```
The body (English) lists: what was open and is now closed (by area), the three CEO decisions with ADR-00NN, the visible changes (holiday form and badges, «Yangi filial» hidden from non-CEOs, own salary/advance rows without actions, the Excel branch choice for multi-branch non-CEOs, rates hidden in the teacher timeline for callers without `salary.view`), the manifest numbers (79 → 7), the checks run, and «Deploy: server first, then client; no migration». End it with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge: the CEO merges.

---

## Appendix — decisions taken on the drafting notes

The task sections were drafted from the code at `39a3ea42`; their authors raised the points below (full notes follow). Each is resolved here; the tasks already follow the resolution unless it says otherwise.

- **Holiday list scope (Task 2):** the list follows the header switcher (`@BranchScope()`), like every list page. The CEO on «Barcha filiallar» sees every holiday; with one branch selected, the centre-wide ones plus that branch's. Accepted.
- **A holiday's branch is fixed after creation (Task 2):** to move one, delete and recreate it. Accepted.
- **`buildHolidayDateSet` refactor (Task 2c):** the small refactor so the per-branch helper shares its query and walk is accepted over duplicating it.
- **`GET /reports/expectation-history` holiday markers (Task 2c):** left company-wide; no page reads them and they are not a lesson count.
- **Guide lines still saying «butun markaz» (`eslatmalar.mdx`, `rollar-va-huquqlar.mdx`, `lugat.mdx`):** Task 10 updates them. If Task 2b's wording of the `bayramlar.mdx` sentence changed during execution, re-anchor Task 2c's guide edit on what 2b actually wrote.
- **`requireSingleBranchForWrite` reused for the group helpers (Task 4):** accepted; its 403/400 answers are exactly what a one-branch read needs.
- **An org-wide Telegram group that has a branch set (Task 3):** stays hidden from other branches' directors. Accepted: they do not manage it.
- **Deleting `GET /reports/lead-analytics` (Task 6):** accepted, with the one snapshot-row removal allowed in Global Constraints.
- **Excel workbook for a non-CEO with several branches (Task 6):** refused with 400 «filialni tanlang», like the other report routes; the client hides «Barcha filiallarim» for them and preselects their first branch. Accepted.
- **The advance recipient-branch rule binds the CEO too (Task 9):** it is a rule about the record, like a group's course and room. Accepted.
- **A non-CEO cannot delete their own advance (Task 9):** accepted; deleting it would keep the cash with no salary cut.
- **Two retroactive-billing scripts call a changed method (Task 7):** they already fail at start-up for unrelated reasons; left alone.
- **`PATCH /expenses/:id` body is never validated (`Partial<>`):** out of scope; a separate task was raised for it.
- **Salary matrix for a two-branch director (Task 8):** shows both branches, consistent with the payroll scope set (ADR-0058: seeing is wider than paying). Accepted.
- **`PATCH /salary/payments/:id/approve` (Task 8):** stays safe only while `salary.close` is CEO-only. The «Ruxsatlar» stage must lock `salary.close` to the CEO (its `allowedRoles` stays empty) or add the payroll check first.
- **Archived employee's timeline (Task 8):** answers 403 even to the CEO; the UI cannot open an archived profile. Accepted.
- **Profile history may store a salary `balance` field (Task 8 note):** not verified; to be checked in the «Ruxsatlar» stage before `employees.view` is widened.
- **ADR:** one ADR for the three CEO decisions and the boundary rule, in Task 10.

---

### Notes from drafting, Task 2 and 2b

- **I split this into Task 2 and Task 2b.** Task 2 is the write rule, the cascade, the list and detail reads, the client, the guide and the manifest. Task 2b covers the other readers. Ship them in the same PR: Task 2 alone lets a director create a branch holiday that, for example, stops every branch's 21:00 report. If you want one task, merge 2b's steps into 2 and keep 2's manifest step.
- **`GET /holidays` uses `@BranchScope()`, not the ceiling.** That follows the guard's rule that data filters take the scope, and the manifest then detects the route by evidence.
  - A CEO on «Barcha filiallar» sees every holiday. With one branch selected, the CEO sees the centre-wide holidays plus that branch's.
  - So the CEO form offers «Butun markaz» plus only the branch in view, or every branch on «Barcha filiallar». A new holiday therefore never disappears from the list after saving.
  - If you want the CEO to always see every holiday, use `@BranchCeiling()` instead. That needs a manual manifest block, and there is no precedent policy for the ceiling.
  - A scope of `[]` still shows the centre-wide holidays; I documented this in a comment.
- **Task 1's COMPANY_WIDE holiday block is deleted, not reworded.** All three reads leave it. The 4 writes and the 2 detail reads move into one `BRANCH_SCOPED_BY_ENTITY` block. The ceiling goes 26 → 22.
- **Nobody can re-scope an existing holiday, the CEO included.** `UpdateHolidayDto` has no `branchId`, and `forbidNonWhitelisted` makes a PATCH that sends one fail with 400. Re-scoping would need its cascade reversed on the old groups and re-applied on the new ones. Delete and recreate instead. Ask the CEO only if that is not acceptable.
- **Detail reads use 403, not 404.** This mirrors the existing Holiday case in `entity-history-scope.ts` (`'pool'` + `assertCallerInBranch`) and `CoursesService.getStatusHistory`.
- **Readers left out on purpose:**
  - `reports/reports-expectation.service.ts:160` builds ONE holiday set for every group in scope. A branch holiday would remove that day's projected lessons from every branch's «Oy oxiriga kutilyapti» / «Foyda tarkibi» forecast, and the 23:40 snapshot would store the wrong figure.
  - `reports/reports-center-activity.service.ts:196` counts working days the same way.
  - Both need a per-group set: `ExpectationGroup.holidayDates` replacing `SplitOptions.holidayDates`, plus `holidayMakeupsFor`, and a bump of `EXPECTATION_CACHE_VERSION`. I suggest a follow-up task. These are figures, not money writes.
  - `tasks.service.ts:134` (a branch-less task), `termHolidays(…, null)` and `refundable.service.ts` (a branch-less card) still read every branch's holidays. That is conservative: a term or due day can only get longer.
- **Cron trade-off:** the three whole-company runs now skip only centre-wide holidays. A branch's own holiday still gets its near-empty 21:00 report, its 20:00 digest and its 09:00 promise list. A per-branch skip would need the runs restructured.
- **ADR:** server/CLAUDE.md requires an ADR in the same PR when a branch rule changes. I did not draft one; one ADR for all three CEO decisions of this plan seems right. Add its number to the `adr: []` of the `bayramlar` guide entry when it exists.
- **Dates:** the guide's `yangilangan` / `sana` are `2026-10-10`. If the commit happens later, use that day; `reyestr.test.ts` refuses only future dates.
- **Not touched, pre-existing:** restoring a holiday from the archive (CEO-only) does not re-run its cascade.
- Production holidays are all `branchId` null today, so there is nothing to migrate.

---

### Notes from drafting, Task 2c

- **One new helper, not one call per group.**
  - `buildHolidayDateSetsByBranch` reads every ACTIVE holiday in the range once: the same rows `buildHolidayDateSet(start, end)` with no branch reads today. It splits them in memory.
  - It needs no branch list up front, so both services keep the holiday read inside their existing `Promise.all`.
  - The rows are never returned to a client.
  - There is no `companyId` filter. That is the existing single-tenant pattern of `buildHolidayDateSet` (server/CLAUDE.md, Refunds: «reads it without a companyId filter»).
- **`buildHolidayDateSet` is refactored a little.** Its query and day walk move into two private helpers so the new function shares them. It returns the same days, and the query now also selects `branchId`. Every spec I found that inspects `holiday.findMany` uses `objectContaining` on `where`, and they all run in Step 6's `npm test`. If you would rather not touch it, the alternative is to duplicate the 10-line padded query and the walk inside the new function.
- **Activity report: the trend uses the group's branch, the period scale uses the room's.** They agree because `assertRoomInGroupBranch` keeps a group in a room of its own branch. If an old room/group pair ever differed, the trend still judges each lesson by its group.
- **Cache.**
  - `EXPECTATION_CACHE_VERSION` v2 → v3 follows the server/CLAUDE.md rule. Strictly it is not needed: no branch holiday exists before Task 2 deploys, so every cached v2 value is already right. It costs one recompute per scope that day.
  - The activity report's 5-minute cache has no version and needs none.
- **Snapshot.** Past `DailyFinancialSnapshot` rows are not rewritten, which that record forbids anyway. They are correct: every production holiday has `branchId` null. From now on, per-branch rows sum to the company row for the expectation.
- **Left out on purpose:** `reports/reports-expectation-history.service.ts:275`.
  - It counts Holiday CREATE audit rows company-wide as chart markers. That is not a lesson count, and no page reads `GET /reports/expectation-history` (server/CLAUDE.md).
  - Its comment «holidays are company-wide in practice» is now stale.
  - The fix, if a page ever reads it: filter `entityId` by holiday ids with `branchId: null` or in scope.
- **Stale guide lines that Tasks 2/2b do not touch**, both outside this task:
  - `client/src/qollanma/kontent/davomat/eslatmalar.mdx:53` («Bayramlar … butun markazga tegishli»).
  - `client/src/qollanma/kontent/boshlash/rollar-va-huquqlar.mdx:149` (Director and Administrator «Ha» to add any holiday). Task 2 should own them.
- **Dependency on 2b's text:** Step 3h's mdx anchor is the sentence Task 2b writes. If 2b's wording changes, re-anchor. The CLAUDE.md anchor is original text and safe.
- `reports/reports.service.spec.ts` builds the real `ReportsCenterActivityService` with a `HolidaysService` mock that lacks the new method. No test there calls `getCenterActivity`, so it stays green. A future test that does must add the mock key.

---

### Notes from drafting, Tasks 3–4

1. **Task 1 dependency.** Task 3 Step 5 rewrites two blocks Task 1 inserts (company, `POST /branches`) and anchors the two new blocks after Task 1's `GET /branches` block. They are found by their `routes` arrays, not by verbatim text, because Prettier may re-quote Task 1's strings. The 19 and 13 lists assume Task 2 removed exactly the four holiday writes.
2. **`requireSingleBranchForWrite` on a read.** I reused it for the group helpers because its three refusals (`null` 400, `[]` 403, several 400) are exactly what a one-branch helper needs, in one call. The alternative, `narrowToSingleBranch` plus a 400 on `undefined`, means five pairs of closures. The name says "write", and the `oneBranch` comment explains why it is used here. A CEO with no branch named now gets a 400; before, a `NaN` reached Prisma. The client never sends that request.
3. **Telegram list scope.** I followed L12: `branchId in ceiling OR branchId null`. An org-wide group (`receivesAllBranches`) that still has a `branchId` (possible when `updateScope` turns the flag on without clearing the branch) stays hidden from the other branch's director. Add `{ receivesAllBranches: true }` to the `OR` if the CEO wants those shown.
4. **`GET /rooms/count-by-branch` stays `@AnyUser`.** A student token now resolves to `[]` and gets an empty list. No student client calls the route.
5. **No ADR or server doc in Task 3.** CEO-only branch creation is CEO decision 2. Memory says ADRs ship in the same PR, so decide whether the plan needs an ADR task. The «Object-level branch confinement» section of `server/CLAUDE.md` is not updated here. `client/CLAUDE.md` is, because its "role ids only for identity" list would otherwise be false.
6. **Tests.** `company.service.spec.ts` names its tests in Uzbek. The new ones are in English, per the plan's rule. ts-jest runs transpile-only (tsconfig `isolatedModules: true`), so the arity mismatches only surface in `npm run typecheck` (`tsconfig.check.json` includes specs). That is why Step 6 runs it. No controller-level test checks the `@BranchCeiling()` wiring for rooms and Telegram; the service tests and the type-check cover it. The group helpers do get a real-guard e2e.
7. **Leftover tenant gap.** `computeNextGroupNumber` still has no `companyId` (review §4.3). Harmless with one company, and out of scope here.

---

### Notes from drafting, Tasks 5–6

1. **Snapshot vs. «not edited».** Deleting `GET /reports/lead-analytics` forces removing its row from `route-access.snapshot.json`: `permission-routes.spec.ts` asserts «no row for a route that is gone». That removes a route and changes no route's access, but it does break the Global Constraint's literal wording. If that rule has to hold exactly, keep the handler instead: give it `@BranchScope() scope`, refuse an empty scope with 403, and call `getLeadAnalytics(companyId, { branchIds: scope, … })`. It then counts as header-scoped by evidence and leaves the list, so the ceiling is still 7 and the snapshot is untouched.
2. **The several-branch refusal changes the client.** The export popover offered «Barcha filiallarim» to every non-CEO, and for one holding several branches that is now a 400. Step 3k hides that option for them and defaults to their first branch. The refusal also fixes a second, quiet mismatch: payroll used to narrow to `mainBranch` while revenue covered all of the caller's branches. I don't know whether production has such users. If it does, they can no longer get one workbook for all their branches. No user-guide page describes the popover's branch option (`client/src/qollanma` mentions «Excel yuklab olish» only in the debt page's `qarzdorlik.mdx`). A `yangiliklar.ts` entry is your call.
3. **Where the refusal lives.** It sits in `ReportsExcelService.generate`, not the controller, because that is where `singleBranchId` used to degrade the list, so every caller passes through it. The Telegram menu only ever passes `null` or one branch and cannot hit it.
4. **403 vs 404 in Task 5.** These follow the «creates that name their branch in the body» pattern. A section outside the company gets 404 «Bo'lim topilmadi» first; a section in another branch then gets 403 with `assertCallerInBranch`'s default message, which is reused rather than adding a new one. The hover summary follows `findOne`: 404, with the unassigned pool kept. A caller with an empty scope (`[]`) therefore still sees unassigned leads, exactly as `findOne` does.
5. **Manifest anchors depend on Tasks 1–4.** Task 5 assumes `UNREVIEWED_BUDGET = 13` and Task 6 assumes `= 9`. Task 6 also extends Task 1's money block, quoted from the review file, with a fallback instruction if its text changed. The new Task 5 block goes right before the app-activity block, which no earlier task should touch. `by-student` sits in that new lead block, not the student-surface block, so Task 5 does not depend on that block's current wording.
6. **`reorder`** keeps its lead query keyed on `sectionId` only. The section has already been confirmed inside the company, so adding `companyId` there would be redundant.
7. **Typecheck matters.** Under ts-jest, a numeric actor left in a spec would run the `public-form` path silently: `actor.kind` is `undefined`, so the check is skipped. Only `npm run typecheck` catches it, which is why Step 6 runs it before `npm test`.

---

### Notes from drafting, Tasks 7 and 9

- **Task 7, the retroactive scripts.** `runRetroactiveBilling` now requires `performedById`. `server/scripts/run-retroactive-one.ts:88` and `run-retroactive-batch.ts:132` call it without one. Both scripts already fail at boot: their module never provides `MonthlyChargeService` or `LessonAdmissionService`, which `LessonBillingService` injects. Neither is in `tsconfig.check.json`. I left them alone. Delete them or rewrite them onto `processRetroactiveBillingForStudent` in their own transaction (the trusted, caller-less path) when anyone needs them again.
- **Task 7, three behaviour changes outside the bug.**
  1. `POST /billing/retroactive/:studentId` for an unknown student now returns 500 (`resolveStudentBranchId`'s raw error) instead of `{ billedAttendances: 0 }`. This is the money path's fail-loud rule, and the route has no screen.
  2. `GET /withdrawals/preview/:studentId` for a branch-less student now returns 403. Before, it was served with a `null` branch.
  3. A body that sends `branchId` to `POST /transactions/adjustment` now gets 400.
- **Task 9, the CEO and the branch rule.** I applied the recipient-branch rule to the CEO as well, because it is a rule about the record. If «the CEO stays unrestricted» was meant to include it, make `assertRecipientInBranch` return early for a CEO caller (one line, plus the CEO test flips).
- **Task 9, deleting your own advance.** `remove` also refuses a non-CEO's own advance. That goes past the literal brief («creates or edits»), but it is the worst form of the same self-dealing: you keep the cash and your salary is never cut. Drop that one line and its test if the CEO only meant writing and editing.
- **Task 9, settle-month.** No change, because `salary.close` is the CEO's alone. If stage 2 ever opens `salary.close` to another role, `loadSettleCandidates` (`salary-settle-core.ts`) must refuse or drop the caller's own row.
- **Task 9, an edge.** Moving an archived recipient's advance to another branch answers 403 «Foydalanuvchi topilmadi», because `resolveCallerBranchScope` refuses a deleted user. The UI never sends `branchId` on an advance edit, so this is a direct-API edge only.
- **Surprise (pre-existing, not fixed).** `PATCH /expenses/:id` takes `@Body() dto: Partial<CreateExpenseDto>`. `Partial<>` erases to `Object` at runtime, so the global ValidationPipe validates nothing there and `whitelist`/`forbidNonWhitelisted` never apply. That deserves its own small task (an `UpdateExpenseDto` built with `PartialType`).
- **Docs.** Task 9 is a staff-visible rule. Per server/CLAUDE.md «Future-Proof Design», it wants a Qo'llanma page edit plus a `yangiliklar.ts` entry. Since it is a CEO money decision, it probably also wants an ADR, and the `docs/role-access.md` salary rows. I left these to the plan's docs task.

---

### Notes from drafting, Task 8

1. **Ceiling, not home branch.** Everything here uses the full set (`mainBranch` ∪ `UserBranch`), not `narrowPayrollScope`'s single branch. For the matrix this is a small widening for a director attached to two branches: today they see their `mainBranch` only, afterwards both branches. That matches ADR-0058 («seeing is wider than paying»). If the CEO wants the matrix on the home branch only, use `narrowPayrollScope(scope, undefined)` there instead.
2. **`PATCH /salary/payments/:id/approve` was moved to COMPANY_WIDE, not fixed.** `approvePayment(id, companyId)` has no scope. That is safe only while `salary.close` stays CEO-only (default roles `[]`). If Stage 2 lets the CEO grant `salary.close`, approve needs `assertPayrollCoversUser` like the payslip read.
3. **Timeline and soft-deleted employees.** `assertCallerMayTouchUser` reads the target with `deletedAt: null`, so even the CEO now gets 403 «Xodim topilmadi» for an archived employee's timeline. It used to return the history. The UI cannot open such a profile (`GET /teachers/:id` is header-scoped and deleted users are hidden), so I accepted it. The payroll helper (`assertPayrollCoversUser`) has no `deletedAt` filter and keeps a CEO fully unscoped.
4. **Possible second leak, out of scope.** `ProfileUpdated` events carry `EntityHistory.oldValues/newValues` for `User`. `users.service.ts` `userSelect` includes `balance` (the employee's salary balance). Whether `recordUpdate` stores unchanged fields was not verified. The same rows are also served by `GET /entity-history/User/:id`. Worth one check in a later task.
5. **403 on the timeline tab.** The client's axios interceptor shows the server message as a toast. The tab then falls through to the empty state («Hech qanday muhim o'zgarish topilmadi»), because `useQuery` has no data. This is acceptable, since the profile of another branch's teacher does not load in the first place.
6. **Merge risk.** CEO decision 3 (no self-pay) edits `payPayment` in the same `salary-payment.service.ts`, and other tasks edit `branch-route-policy.ts`. The hunks do not overlap, but rebase with care.
7. `/salary/configs/by-users` leaves out-of-scope ids out of the answer instead of refusing the whole call. It behaves as a list, and it has no client caller today.
