# Role-Based Access Control (RBAC)

This document defines the permission model for the DaF ERP system. **Every restriction listed here must be enforced on both the backend (API) and frontend (UI).**

## Roles

| ID | Name | Scope |
|----|------|-------|
| 1 | **CEO** | All branches, full system access |
| 2 | **Branch Director** | Own branch only, full access within branch |
| 3 | **Administrator** | Operational access (CRUD for entities) |
| 4 | **Teacher** | Limited (TBD) |
| 5 | **Cashier** | Limited (TBD) |
| 6 | **Student** | Student portal and app only — their own data |

A user can hold **multiple roles** simultaneously (many-to-many via `UserRole`).

## Portal-Based Access (Subdomain Restriction)

Each subdomain restricts which roles can log in. This is enforced **server-side** during login from the `Origin` header, or the `X-Portal` header a native app sends (`portal-roles.config.ts`):

| Portal | Domain | Allowed Roles |
|--------|--------|---------------|
| Admin panel | `admin.dafzentrum.uz` | CEO (1), Branch Director (2), Administrator (3), Cashier (5) |
| Teacher portal | `lehrer.dafzentrum.uz` | Teacher (4) |
| Student portal | `student.dafzentrum.uz` | Student (6) |

- The account is looked up **among the portal's roles only**, so a user whose roles don't match the portal is not found: `401` "Login yoki parol noto'g'ri", the same answer as a wrong password
- Localhost bypasses this check (dev mode)
- To add a new portal: update `PORTAL_ROLES` (and `PORTAL_KEYS` for a native app) in `server/src/auth/portal-roles.config.ts`, add CORS origin in `server/src/main.ts`, add DNS + Vercel config

## Core Principles

1. **CEO sees and does everything** — no restrictions, all branches
2. **Branch Director = CEO within their branch** — full access but scoped to their own branch and its staff
3. **Dual enforcement** — every role-restricted feature must be guarded on **both** backend (`@Roles` + `RolesGuard`) and frontend (conditional rendering via `useAuth`)
4. **Hide, don't disable** — if a user lacks permission, the UI element (button, tab, column, page) must be **hidden entirely**, not shown in a disabled state

## Permission Matrix

### Financial Data (Payments, Salary, Expenses, Refunds)

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View salary (ish haqi) | All staff | Own branch staff | No (page hidden, salary reads refused — see below) | No | No |
| View balance | All staff | Own branch staff | No | No | No |
| Create payment | Yes | Yes | Yes | No | Yes |
| Reverse payment | Yes | No | No | No | No |
| Set salary config | Yes | Own-branch Teacher-role holders, POST only (ADR-0034) | No | No | No |
| Calculate salary | Yes | No | No | No | No |
| Approve salary | Yes | No | No | No | No |
| Pay salary | Yes | Own branch | No | No | No |
| Batch pay salary | Yes | Own branch | No | No | No |
| Manage salary period (cycle start day) | Yes | No | No | No | No |
| Open refund request (`POST /refunds/quick`, ADR-0076) | Yes | Yes | Yes | No | No |
| Hand refund over («Berildi», `POST /refunds/:id/hand-over`) | Yes | Yes | Yes | No | Yes |
| Cancel refund request (`POST /refunds/:id/cancel`) | Yes | Yes | No | No | No |
| Give balance notice (`POST /students/:id/balance-notices`) | Yes | Yes | Yes | No | No |
| «Qaytariladigan pul» page and refund history (`GET /refundable/*`, `GET /refunds`) | Yes | Own branch | Own branch | No | Own branch |
| Reverse refund | Yes | No | No | No | No |
| Create expense | Yes | Yes | No | No | No |
| Update/delete expense | Yes | Yes | No | No | No |
| View financial reports | Yes | Own branch | No | No | No |
| View transactions | Yes | Own branch | No | No | No |
| Manual adjustment | Yes | Yes | No | No | No |

- **Frontend**: Check `user.roles.some(r => [1, 2].includes(r.id))` before rendering salary/balance UI
- **Backend**: `@Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')` on payment endpoints; `@Roles('CEO', 'Branch Director')` on expenses and money reports (`financial-overview` and `marketing` included — since ADR-0067 the overview no longer admits Administrator and Cashier; their «Umumiy ma'lumotlar» is payment recording and the recent payments); salary writes are CEO/BD or CEO-only, while salary reads also admit Administrator — the decorators in `salary.controller.ts` are the list of record
- **No tax setting.** The salary tax-rate config and its endpoints were removed: the system computes and withholds no tax, and the salary page shows possible deductions as an informational note only
- **CEO-only actions**: reverse payment, reverse refund, calculate salary, approve salary — these use `@Roles('CEO')` specifically
- **Salary config (ADR-0034)**: a Branch Director may create a rate (`POST /salary/config`) only for an ACTIVE, own-branch user who holds the Teacher role and does not also hold CEO or Branch Director — an administrator or cashier who also teaches IS included. Never their own rate, never `FIXED_MONTHLY`, never a date before the current payroll period. Editing or deactivating an existing rate (`PATCH /salary/config/:id`), `POST /salary/config/global` and the payroll period stay CEO-only. A `PERCENTAGE` rate above 100 is rejected for every caller, including the CEO. The caller's roles and branches are read from the database through `whereUserMayAct()`, so a demoted or blocked director sets no rate even while their token still passes the guard ([ADR-0028](adr/0028-bloklangan-xodim-hech-narsa-bermaydi.md)).
- **The salary page's reads are CEO + Branch Director on the server too** (2026-09-30). Every `GET /salary/*` read that only `/payments/salary` uses — `/monthly`, `/overview`, `/matrix`, `/payments`, `/payments/:id/breakdown`, `/accruals/:userId`, `/advances/:userId`, `/advance-calendar`, `/config/:userId`, `/configs/by-users`, `/config-history/:userId`, `/period-settings` — used to admit Administrator while the page was hidden from them. One salary read stays open to Administrator because a page they use calls it: `GET /salary/timeline/:userId` (teacher profile, «Taymlayn» tab). `GET /salary/monthly/center-topup` is CEO/BD (ADR-0072).
- Full details: see `docs/financial-system.md`

### Debt page (Qarzdorlik, `/payments/debt`)

Every staff role except Teacher sees the same page: three tabs (Shu oy / Eski qarz / O'qimayotganlar), the student drawer and the Excel (`/payments/debt/*`, ADR-0072), and the two linked pages (debt history, write-off archive); frozen balances moved to «Qaytariladigan pul» (ADR-0076). «Markaz qoplagani» moved to the salary page and is CEO/BD (`GET /salary/monthly/center-topup`). Everyone below the CEO sees their own branch. The actions differ by role:

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View the three tabs, the drawer and the linked pages | Yes | Yes | Yes | No | Yes |
| Record payment («To'lov qayd qilish») | Yes | Yes | Yes | No | Yes |
| Log a call result («Qo'ng'iroq natijasi», `POST /call-logs`) | Yes | Yes | Yes | No | No |
| Write a payment promise («Va'da yozish», ≤ 7 days, once a month) | Yes | Yes | Yes | No | Yes |
| Payment statement PDF (drawer) | Yes | Yes | Yes | No | No |
| Undo a debt write-off | Yes | No | No | No | No |

- **Frontend**: `CALL_LOG_ROLES`, `STATEMENT_ROLES` and the refund constants `REFUND_REQUEST_ROLES` / `REFUND_HAND_OVER_ROLES` / `REFUND_CANCEL_ROLES` in `client/src/lib/role-access.ts` hide the actions a cashier may not take

### Student contracts

The «Shartnomalar» tab on the student profile (`/contract-documents/*`, ADR-0075). Everyone below the CEO acts only on students of their own branch.

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| See contracts, open the PDF | Yes | Yes | Yes | No | No |
| Create, edit an unsigned contract, mark it signed on paper | Yes | Yes | Yes | No | No |
| Cancel an unsigned contract | Yes | Yes | Yes | No | No |
| Cancel a signed contract | Yes | No | No | No | No |

- **Frontend**: `CONTRACT_ROLES` and `SIGNED_CONTRACT_CANCEL_ROLES` in `client/src/lib/role-access.ts`

### Groups

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View groups | Yes | Own branch | Yes | Own groups | No |
| Create group | Yes | Own branch | Yes | No | No |
| Update group | Yes | Own branch | Yes | No | No |
| Delete group | Yes | Own branch | Yes | No | No |

- **Frontend**: Check `user.roles.some(r => [1, 2, 3].includes(r.id))` for create/edit/delete buttons
- **Backend**: Use `@Roles('CEO', 'Branch Director', 'Administrator')` on mutation endpoints
- **A cashier sees no group page**: the server refuses `GET /groups`, `/groups/:id` and `/groups/:id/students`. A cashier-only user gets no «Guruhlar» sidebar item, no «👥 Guruhlar» button in the staff Telegram bot, and group names without a link wherever a cashier meets them (debtor list, home, schedule, student profile). Frontend: `GROUP_PAGE_ROLES` + `RoleLink` (`client/src/components/shared/role-link.tsx`)

### Students

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| Open student profile (`GET /students/:id`) | Yes | Own branch | Yes | No | Yes |
| Remove from group | Yes | Own branch | Yes | No | No |

- **Frontend**: on group pages a teacher-only user sees student names without a link (`STUDENT_PROFILE_ROLES`). A cashier on a profile sees the «Guruhlar» tab without the «Chiqarish» button

### Teachers

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View teachers | Yes | Own branch | View only | No | No |
| Create teacher | Yes | Own branch | No | No | No |
| Update teacher | Yes | Own branch | No | No | No |
| Delete teacher | Yes | Own branch | No | No | No |

### Comments & Task Assignment

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| Write comment | Yes | Own branch entities | Own branch entities | No | No |
| Create task (assign) | Yes, anyone | Own branch entities | Own branch entities (for /outreach) | No | No |
| View comments | Yes | Own branch | Own branch | No | No |
| Delete comment | Any comment | No | No | — | — |
| Update comment/task | Any | Own (author) only | Own (author) only | — | — |
| Update assignee status | Own assignments | Own assignments | Own assignments | Own assignments | Own assignments |

- **Assignees are checked for company, not branch.** A task on an own-branch entity may be assigned to any non-archived user of the company, the CEO included (`CommentsService.create`).
- **Deletion is the CEO's alone.** `DELETE /comments/:id` is `@Roles('CEO')` with no author path, so an author cannot delete their own comment or task; editing (`PATCH /comments/:id`) is the author or the CEO.

### Tasks (Topshiriqlar)

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| Create task | Yes | Yes | Yes (for /outreach) | No | No |
| View own tasks | Yes | Yes | Yes | Yes | Yes |
| View created tasks | Yes | Yes | No | No | No |
| Mark task seen/done | Own assignments | Own assignments | Own assignments | Own assignments | Own assignments |
| Delete task | Yes | No | No | No | No |

### Notifications

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View own notifications | Yes | Yes | Yes | Yes | Yes |
| SSE stream | Yes | Yes | Yes | Yes | Yes |
| Push subscribe | Yes | Yes | Yes | Yes | Yes |

### Reports

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View reports | Yes | Yes | No | No | No |

### Settings — General (Company Info)

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View settings | Yes | Yes | View only | No | No |
| Edit settings | Yes | No | No | No | No |

- **Frontend**: the form is read-only for everyone but the CEO and the save button is hidden (`COMPANY_EDIT_ROLES`)

### Settings — Employees & Branches

| Action | CEO | Branch Director | Administrator | Teacher | Cashier |
|--------|-----|-----------------|---------------|---------|---------|
| View/manage employees | Yes | Own branch, lower rank ([rank rule](#rank-rule-who-may-change-whose-account)) | No | No | No |
| Create/update branches | Yes | Own branch | No | No | No |
| Change branch status | Yes | Own branch | No | No | No |

#### Role grant ceiling

Creating an employee IS granting access, so a caller may hand out only the roles below their own level (a CEO, any role). One map, `GRANTABLE_ROLE_IDS` in `server/src/telegram/constants.ts`, read through `grantableRoleIdsFor`, serves both doors that let a caller choose roles: the employee form (`POST /users`, `PATCH /users/:id`) and the Telegram registration link (`POST /telegram/employee-link`). `POST /teachers` (CEO, Branch Director) always grants Teacher alone, which is inside both of their ceilings. The decision and its alternatives: [ADR-0026](adr/0026-rol-berish-shipi-ikkala-eshikda.md).

| Caller | May grant |
|--------|-----------|
| CEO | CEO, Branch Director, Administrator, Teacher, Cashier |
| Branch Director | Administrator, Teacher, Cashier |
| Administrator | Teacher, Cashier |

- **The most senior role decides.** A caller holding several roles gets the ceiling of the highest of CEO, Branch Director and Administrator. Holding none of them means nothing is grantable.
- **Both doors read the caller from the database**, not from the token: roles, branches, and whether the account may still act (`whereUserMayAct()`). An unknown, archived or blocked (SUSPENDED, TERMINATED, ARCHIVED) caller grants nothing at either door. An access token outlives an archive, a block or a demotion by up to an hour, and a signed link works for three days, so a link minted from a stale token would keep its old authority that long ([ADR-0028](adr/0028-bloklangan-xodim-hech-narsa-bermaydi.md)).
- **Self-edits are included.** Acting on yourself skips the branch-overlap check, not this one: an Administrator cannot make themselves a Branch Director.
- **Only accounts inside your ceiling can be reshaped.** When a write changes the role set, every role on both sides of the change (held now, held after) must be inside the caller's ceiling. An Administrator may add or remove Teacher and Cashier on a teacher, but may not change the role set of a Branch Director who shares their branch, of another Administrator, or of themselves, not even to add Teacher. Those changes belong to someone above them.
- **An unchanged role set is not a grant.** The employee form sends `roleIds` on every save; the sets are compared (order ignored), so editing a name or a phone number is never refused by this rule.
- **Self-registration through the bot is not re-checked.** The link it came from met this ceiling when it was signed (ADR-0008).
- **The UI hides what this rule refuses.** `client/src/lib/role-grant-ceiling.ts` holds the client copy of the map (a client test compares it with the server's). The employee form and the Telegram link dialog offer only the roles the caller may grant. When the employee already holds a role outside the caller's ceiling (a non-CEO's own record included), the form shows their roles read-only and saves the set unchanged.

#### Rank rule: who may change whose account

A shared branch lets a caller READ an employee's record. WRITING to it also takes rank: a non-CEO may change an existing account (any field, its status, or archiving it) only when every role that account holds is inside the caller's grant ceiling, the same `GRANTABLE_ROLE_IDS` map as above. One implementation, `assertCallerMayManageUser` in `server/src/common/auth/user-branch-scope.ts`. The decision and its alternatives: [ADR-0027](adr/0027-xodim-hisobini-faqat-yuqoridagi-rahbar-ozgartiradi.md).

| Caller | May change the accounts of |
|--------|-----------------------------|
| CEO | Everyone |
| Branch Director | Administrators, Teachers, Cashiers and role-less staff of their own branch |
| Administrator | Nobody: none of the routes below admits the role |

- **Where it applies:** `PATCH /users/:id`, `DELETE /users/:id`, `PATCH /teachers/:id`, `PATCH /teachers/:id/status`, `DELETE /teachers/:id`. The teacher routes match any account holding the Teacher role, so a Branch Director who also teaches is reachable through them and is protected the same way.
- **Where it does not:** reading an employee (the record, its history, comments, a teacher's groups, status trail and salary summary) still needs a shared branch only. Reading takes nothing from anyone.
- **The whole account.** Name, phone, login, password, status, branches, archive: there is no list of "safe" fields, so a field added to the form later is covered too. The phone is a credential: Telegram sign-in finds the account by it and asks for no password.
- **Peers belong to the CEO.** An Administrator cannot fix a peer Administrator's phone, and a Branch Director cannot edit another Branch Director.
- **Your own account** skips the branch and rank checks, but nobody below CEO changes their own status or archives themselves. The form resends `status` on every save, so only a different value counts as a change. Your own roles fall under the ceiling above.
- **A caller holding no managing role manages nobody**, role-less staff included.
- **Administrators do not manage employees.** `POST /users` and `PATCH /users/:id` admit CEO and Branch Director only, matching the table above. Administrators onboard Teachers and Cashiers through the Telegram link and edit their own profile through `PATCH /users/profile` and `PATCH /users/password`.

#### Telegram registration links expire after three days

A registration link (`POST /telegram/employee-link`) creates a working staff account for whoever opens it, with the branch and roles it was signed with. The link dialog on the employees settings page mints a new one on every click; the branch and teachers pages mint a new one every time the link is copied, and the teachers page every time its QR code is opened, so neither page hands out the link it minted when it was opened. The link carries its issue time inside the signed part, and the bot refuses it three days later: "Bu havolaning muddati tugagan. Administratordan yangi havola so'rang." The link dialog, the QR dialog and the branch page all say "Havola 3 kun amal qiladi". Links minted before this rule carry no issue time and get the same answer, so every link shared before it shipped stopped working. The decision and its alternatives: [ADR-0029](adr/0029-xodim-havolasi-uch-kun-ishlaydi.md).

**Still open:**

- Within its three days a link can be used any number of times, and one link cannot be revoked on its own; rotating `TELEGRAM_LINK_SECRET` cancels every link at once. ADR-0022's stage 2 replaces these links with personal one-time ones.
- The age is checked when the link is opened, so a registration started inside the three days can finish later.
- The branch page also shows the link as text: minted when the page was opened, replaced on every copy. In a tab left open for more than three days, selecting that text by hand instead of pressing "Nusxalash" copies a dead link.

#### A blocked employee's token stops at once; a demoted one's does not

An access token lives an hour and nothing re-reads the account on each request, so `@Roles()` checks the roles the token was issued with. The decision and its alternatives: [ADR-0028](adr/0028-bloklangan-xodim-hech-narsa-bermaydi.md).

- **Blocking cuts off the tokens already issued.** Setting an employee to SUSPENDED, TERMINATED or ARCHIVED, or archiving them, on either the employee page (`UsersService`) or the teacher page (`TeachersService`) writes `user:blocked:<id>`, and `JwtAuthGuard` refuses that token on its next request ("Hisobingiz bloklangan"). Setting the employee back to ACTIVE or INACTIVE lifts it. Sign-in and token refresh already refused blocked accounts; the key is what stops the token issued before the block.
- **Redis is a cache, not the authority.** If Redis is unreachable the guard lets the request through rather than failing everyone, and a blocked token then works until it expires (at most an hour). The two doors that grant access (above) do not depend on it: they refuse a blocked caller from their own database read.
- **A role change does not cut off a token.** A demoted employee keeps their old role's pages for up to an hour, until the token is refreshed. They cannot create accounts or links above their new level in that hour, because both doors read the database.

### Branch Director Scope Filtering

When a **Branch Director** accesses data, the backend must automatically filter results to only include data from their branch(es):

- Use `@CurrentUser('mainBranch')` or `@CurrentUser('branches')` to determine the user's branch scope
- Service methods should accept and enforce this scope in their `where` clauses
- The CEO always bypasses branch filtering

## Implementation Checklist (for new features)

When adding a role-restricted feature:

1. **Backend**: Add `@UseGuards(RolesGuard)` + `@Roles(...)` to the controller endpoint
2. **Backend**: If Branch Director has access, add branch-scope filtering in the service
3. **Frontend**: Use `useAuth` hook to check roles and conditionally render UI
4. **Frontend**: Use role IDs (not names) for checks: `user.roles.some(r => [1, 2].includes(r.id))`
5. **Docs**: Update this file's permission matrix

## Role ID Quick Reference

```
CEO = 1
Branch Director = 2
Administrator = 3
Teacher = 4
Cashier = 5
Student = 6
```

### Common frontend patterns

```tsx
// CEO + Branch Director only (e.g. salary, teacher management, reports)
const canSeeSalary = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
const canManageTeachers = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

// CEO + Branch Director + Administrator (e.g. group/student management)
const canManage = user?.roles.some((r) => [1, 2, 3].includes(r.id)) ?? false;
```
